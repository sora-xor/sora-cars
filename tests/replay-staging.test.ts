import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplayStaging, REPLAY_STAGING_LIMITS, REPLAY_STAGING_UNSUPPORTED, supportsReplayStaging } from '../src/ui/replay-staging.ts';

type Phase = 'root' | 'lookup-directory' | 'create-directory' | 'lookup-file' | 'create-file' | 'create-writable' | 'write' | 'close' | 'get-file' | 'abort-stream' | 'remove';
function gate() {
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  return { release, started, hold: async () => { entered(); await wait; } };
}

/** In-memory filesystem double solely for staging lifecycle tests; the production implementation
 * obtains File directly from OPFS and never constructs the file-sized buffers used by this double.
 */
class TestFs {
  readonly events: Phase[] = [];
  readonly root = new TestDirectory(this);
  readonly writes: Uint8Array[] = [];
  readonly removals: string[] = [];
  retainBytes = true;
  storedSizeDelta = 0;
  collision: 'directory' | 'file' | 'file-directory' | undefined;
  hook: (phase: Phase) => Promise<void> = async () => {};
  async step(phase: Phase) { this.events.push(phase); await this.hook(phase); }
  getRoot = async () => { await this.step('root'); return this.root as unknown as FileSystemDirectoryHandle; };
}
class TestDirectory {
  readonly directories = new Map<string, TestDirectory>();
  readonly files = new Map<string, TestFile>();
  constructor(readonly fs: TestFs) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    await this.fs.step(options?.create ? 'create-directory' : 'lookup-directory');
    if (this.files.has(name)) throw new DOMException('File exists', 'TypeMismatchError');
    if (!this.directories.has(name) && this.fs.collision === 'directory' && !options?.create) this.directories.set(name, new TestDirectory(this.fs));
    if (!this.directories.has(name)) {
      if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
      const child = new TestDirectory(this.fs);
      if (this.fs.collision === 'file') child.files.set('replay.nrt', new TestFile(this.fs, 'replay.nrt'));
      if (this.fs.collision === 'file-directory') child.directories.set('replay.nrt', new TestDirectory(this.fs));
      this.directories.set(name, child);
    }
    return this.directories.get(name)!;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    await this.fs.step(options?.create ? 'create-file' : 'lookup-file');
    if (this.directories.has(name)) throw new DOMException('Directory exists', 'TypeMismatchError');
    if (!this.files.has(name)) {
      if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
      this.files.set(name, new TestFile(this.fs, name));
    }
    return this.files.get(name)!;
  }
  async isSameEntry(other: unknown) { return this === other; }
  async removeEntry(name: string, options?: { recursive?: boolean }) {
    await this.fs.step('remove'); assert.equal(options?.recursive, true);
    if (!this.directories.delete(name)) throw new DOMException('Missing', 'NotFoundError');
    this.fs.removals.push(name);
  }
}
class TestFile {
  size = 0;
  chunks: Uint8Array<ArrayBuffer>[] = [];
  constructor(readonly fs: TestFs, readonly name: string) {}
  async createWritable(options: unknown) {
    assert.deepEqual(options, { keepExistingData: false }); await this.fs.step('create-writable');
    let ended = false, writing = false;
    return {
      write: async (bytes: Uint8Array) => {
        assert.equal(ended, false); assert.equal(writing, false); writing = true;
        assert.ok(bytes.byteLength <= REPLAY_STAGING_LIMITS.chunkBytes);
        try {
          await this.fs.step('write');
          this.size += bytes.byteLength;
          if (this.fs.retainBytes) { const copy = new Uint8Array(bytes); this.chunks.push(copy); this.fs.writes.push(copy); }
        } finally { writing = false; }
      },
      close: async () => { assert.equal(ended, false); assert.equal(writing, false); await this.fs.step('close'); ended = true; },
      abort: async () => { assert.equal(writing, false); await this.fs.step('abort-stream'); ended = true; },
    };
  }
  async getFile() {
    await this.fs.step('get-file');
    const value = new File(this.chunks, this.name);
    // Only the bounded-count test omits retained bytes; no large fixture allocation is needed.
    Object.defineProperty(value, 'size', { value: this.size + this.fs.storedSizeDelta });
    return value;
  }
}

function installStorage(t: { after(fn: () => void): void }, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'navigator', original); else Reflect.deleteProperty(globalThis, 'navigator'); });
}

test('replay staging uses OPFS capability detection and has no buffered fallback', async t => {
  installStorage(t, {}); assert.equal(supportsReplayStaging(), false);
  await assert.rejects(createReplayStaging(), { message: REPLAY_STAGING_UNSUPPORTED });
  const fs = new TestFs(); Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: { getDirectory: fs.getRoot } } });
  assert.equal(supportsReplayStaging(), true);
  const output = await createReplayStaging(); await output.abort(); assert.equal(fs.root.directories.size, 0);
});

test('replay staging copies each producer chunk, returns File only after exact close, and keeps it until owner abort', async () => {
  const fs = new TestFs(), held = gate(); fs.hook = async phase => { if (phase === 'write') await held.hold(); };
  const output = await createReplayStaging({ getRoot: fs.getRoot });
  const chunk = Uint8Array.of(1, 2, 3), writing = output.write(chunk); chunk.fill(99);
  await held.started; assert.equal(fs.events.includes('get-file'), false); held.release(); await writing;
  fs.hook = async () => {};
  await output.write(Uint8Array.of(4, 5));
  const file = await output.finish(5);
  assert.ok(file instanceof File); assert.equal(file.name, 'replay.nrt'); assert.equal(file.size, 5);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), Uint8Array.of(1, 2, 3, 4, 5));
  assert.ok(fs.events.indexOf('close') < fs.events.indexOf('get-file')); assert.equal(fs.root.directories.size, 1);
  await assert.rejects(output.write(Uint8Array.of(6)), /already finished/); await assert.rejects(output.finish(5), /already finished/);
  assert.equal(fs.root.directories.size, 1);
  const cleanup = output.abort(); assert.equal(output.abort(), cleanup); await cleanup; assert.equal(fs.root.directories.size, 0);
});

test('replay staging refuses both preexisting folders and files without overwriting or removing them', async () => {
  for (const collision of ['directory', 'file', 'file-directory'] as const) {
    const fs = new TestFs(); fs.collision = collision;
    await assert.rejects(createReplayStaging({ getRoot: fs.getRoot }), /refuses to/);
    assert.equal(fs.root.directories.size, 1); assert.equal(fs.removals.length, 0); assert.equal(fs.events.includes('create-writable'), false);
    if (collision === 'file') assert.equal([...fs.root.directories.values()][0]!.files.has('replay.nrt'), true);
    if (collision === 'file-directory') assert.equal([...fs.root.directories.values()][0]!.directories.has('replay.nrt'), true);
  }
});

test('replay staging rejects empty, oversized and invalid chunks before I/O and cleans partial output', async () => {
  for (const chunk of [new Uint8Array(), new Uint8Array(REPLAY_STAGING_LIMITS.chunkBytes + 1), new Uint16Array(1) as unknown as Uint8Array]) {
    const fs = new TestFs(), output = await createReplayStaging({ getRoot: fs.getRoot });
    await assert.rejects(output.write(chunk), /64 KiB/); assert.equal(fs.events.includes('write'), false); assert.equal(fs.root.directories.size, 0);
  }
});

test('replay staging enforces the 256 MiB total using bounded writes without a file-sized test buffer', async () => {
  const fs = new TestFs(); fs.retainBytes = false;
  const output = await createReplayStaging({ getRoot: fs.getRoot }), chunk = new Uint8Array(REPLAY_STAGING_LIMITS.chunkBytes);
  const count = REPLAY_STAGING_LIMITS.totalBytes / REPLAY_STAGING_LIMITS.chunkBytes;
  for (let index = 0; index < count; index++) await output.write(chunk);
  assert.equal(fs.events.filter(phase => phase === 'write').length, count);
  await assert.rejects(output.write(Uint8Array.of(1)), /256 MiB/);
  assert.equal(fs.events.filter(phase => phase === 'write').length, count); assert.equal(fs.root.directories.size, 0);
});

test('replay staging rejects declared and actual completed size mismatches without publishing a File', async () => {
  for (const expected of [0, 1, 3, 2.5, Number.NaN, REPLAY_STAGING_LIMITS.totalBytes + 1]) {
    const fs = new TestFs(), output = await createReplayStaging({ getRoot: fs.getRoot }); await output.write(Uint8Array.of(1, 2));
    await assert.rejects(output.finish(expected), /expected bounded byte count/);
    assert.equal(fs.events.includes('close'), false); assert.equal(fs.events.includes('get-file'), false); assert.equal(fs.root.directories.size, 0);
  }
  const fs = new TestFs(); fs.storedSizeDelta = -1;
  const output = await createReplayStaging({ getRoot: fs.getRoot }); await output.write(Uint8Array.of(1, 2));
  await assert.rejects(output.finish(2), /file length/); assert.equal(fs.root.directories.size, 0);
});

for (const phase of ['root', 'lookup-directory', 'create-directory', 'lookup-file', 'create-file', 'create-writable'] as const) {
  test(`replay staging cancellation cleans late ${phase} results before initialization rejects`, async () => {
    const fs = new TestFs(), held = gate(), signal = new AbortController(); let paused = false;
    fs.hook = async current => { if (current === phase && !paused) { paused = true; await held.hold(); } };
    const opening = createReplayStaging({ getRoot: fs.getRoot, signal: signal.signal });
    const rejected = assert.rejects(opening, { name: 'AbortError' });
    await held.started; signal.abort(); held.release(); await rejected;
    assert.equal(fs.root.directories.size, 0); assert.equal(fs.events.includes('write'), false);
    if (phase === 'create-writable') assert.ok(fs.events.includes('abort-stream'), 'late stream is aborted');
  });
}

for (const phase of ['write', 'close', 'get-file'] as const) {
  test(`replay staging cancellation waits for pending ${phase}, deletes late data and prevents File publication`, async () => {
    const fs = new TestFs(), output = await createReplayStaging({ getRoot: fs.getRoot });
    if (phase !== 'write') await output.write(Uint8Array.of(1));
    const held = gate(); fs.hook = async current => { if (current === phase) await held.hold(); };
    const operation = phase === 'write' ? output.write(Uint8Array.of(1)) : output.finish(1);
    const rejected = assert.rejects(operation, { name: 'AbortError' });
    await held.started;
    let settled = false; const cleanup = output.abort().then(() => { settled = true; });
    await Promise.resolve(); assert.equal(settled, false); assert.equal(fs.root.directories.size, 1);
    held.release(); await rejected; await cleanup; assert.equal(fs.root.directories.size, 0);
    await assert.rejects(output.finish(1), { name: 'AbortError' });
    assert.equal(fs.root.directories.size, 0, 'a late operation cannot recreate a released staging folder');
  });
}

test('replay staging rejects concurrent writes, aborts the first and never forwards the second write', async () => {
  const fs = new TestFs(), held = gate(), output = await createReplayStaging({ getRoot: fs.getRoot });
  fs.hook = async phase => { if (phase === 'write') await held.hold(); };
  const first = output.write(Uint8Array.of(1)), firstRejected = assert.rejects(first, { name: 'AbortError' });
  await held.started;
  const second = output.write(Uint8Array.of(2)), secondRejected = assert.rejects(second, /awaited sequentially/);
  held.release(); await firstRejected; await secondRejected;
  assert.equal(fs.events.filter(phase => phase === 'write').length, 1); assert.equal(fs.root.directories.size, 0);
});

test('replay staging propagates quota errors and still removes its owned directory', async () => {
  for (const phase of ['create-directory', 'create-file', 'create-writable', 'write', 'close', 'get-file'] as const) {
    const fs = new TestFs(); fs.hook = async current => { if (current === phase) throw new DOMException('Storage full', 'QuotaExceededError'); };
    if (['create-directory', 'create-file', 'create-writable'].includes(phase)) {
      await assert.rejects(createReplayStaging({ getRoot: fs.getRoot }), { name: 'QuotaExceededError' });
    } else {
      const output = await createReplayStaging({ getRoot: fs.getRoot });
      if (phase === 'write') await assert.rejects(output.write(Uint8Array.of(1)), { name: 'QuotaExceededError' });
      else { await output.write(Uint8Array.of(1)); await assert.rejects(output.finish(1), { name: 'QuotaExceededError' }); }
    }
    assert.equal(fs.root.directories.size, 0, phase);
  }
});

test('navigation signal removes a finished replay while leaving unrelated files and directories intact', async () => {
  const fs = new TestFs(), other = new TestDirectory(fs); fs.root.directories.set('personal-files', other);
  other.files.set('keep.txt', new TestFile(fs, 'keep.txt'));
  const signal = new AbortController(), output = await createReplayStaging({ getRoot: fs.getRoot, signal: signal.signal });
  await output.write(Uint8Array.of(1)); await output.finish(1);
  signal.abort(); await output.abort();
  assert.deepEqual([...fs.root.directories.keys()], ['personal-files']); assert.equal(other.files.has('keep.txt'), true);
  assert.equal(fs.removals.length, 1); assert.match(fs.removals[0]!, /^sora-cars-replay-[a-f0-9-]{36}$/);
});

test('replay staging abort refuses to delete a replaced directory and preserves cleanup errors', async () => {
  const fs = new TestFs(), output = await createReplayStaging({ getRoot: fs.getRoot });
  const folder = [...fs.root.directories.keys()][0]!, replacement = new TestDirectory(fs); fs.root.directories.set(folder, replacement);
  const cleanup = output.abort();
  await assert.rejects(cleanup, error => { assert.ok(error instanceof AggregateError); assert.match(String(error.cause), /another owner/); return true; });
  assert.equal(fs.root.directories.get(folder), replacement); assert.equal(fs.removals.length, 0);
  assert.equal(output.abort(), cleanup, 'repeat abort retains the same failed cleanup rather than deleting a replacement');
});

test('replay staging attempts directory removal even if aborting its writable stream fails', async () => {
  const fs = new TestFs(), output = await createReplayStaging({ getRoot: fs.getRoot });
  fs.hook = async phase => { if (phase === 'abort-stream') throw new Error('stream abort failed'); };
  await assert.rejects(output.abort(), error => { assert.ok(error instanceof AggregateError); assert.match(String(error.cause), /stream abort failed/); return true; });
  assert.equal(fs.root.directories.size, 0); assert.equal(fs.removals.length, 1);
});

test('an already cancelled staging request performs no filesystem access', async () => {
  const fs = new TestFs(), signal = new AbortController(); signal.abort();
  await assert.rejects(createReplayStaging({ getRoot: fs.getRoot, signal: signal.signal }), { name: 'AbortError' });
  assert.deepEqual(fs.events, []);
});
