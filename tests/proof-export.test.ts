import test from 'node:test';
import assert from 'node:assert/strict';
import { PROOF_EXPORT_FILES, PROOF_EXPORT_LIMITS, PROOF_EXPORT_UNSUPPORTED, selectProofDirectory, supportsProofDirectoryExport } from '../src/ui/proof-export.ts';

class TestDirectory {
  readonly directories = new Map<string, TestDirectory>();
  readonly files = new Map<string, Uint8Array>();
  constructor(readonly events: string[] = [], readonly writes: number[] = [], readonly beforeWrite?: (name: string) => Promise<void>) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<TestDirectory> {
    if (this.files.has(name)) throw new DOMException('File exists', 'TypeMismatchError');
    if (!this.directories.has(name)) {
      if (!options?.create) throw new DOMException('Missing directory', 'NotFoundError');
      this.directories.set(name, new TestDirectory(this.events, this.writes, this.beforeWrite));
      this.events.push(`directory:${name}`);
    }
    return this.directories.get(name)!;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (this.directories.has(name)) throw new DOMException('Directory exists', 'TypeMismatchError');
    if (!this.files.has(name)) {
      if (!options?.create) throw new DOMException('Missing file', 'NotFoundError');
      this.files.set(name, new Uint8Array());
    }
    return { createWritable: async () => {
      this.events.push(`open:${name}`);
      const chunks: Uint8Array[] = [];
      let writing = false, ended = false;
      return {
        write: async (bytes: Uint8Array) => {
          assert.equal(writing, false, 'each write is awaited'); assert.equal(ended, false);
          writing = true;
          this.writes.push(bytes.byteLength);
          await this.beforeWrite?.(name);
          chunks.push(bytes.slice());
          this.events.push(`write:${name}`);
          writing = false;
        },
        close: async () => {
          assert.equal(writing, false); assert.equal(ended, false); ended = true;
          const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
          let position = 0;
          for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
          this.files.set(name, bytes); this.events.push(`close:${name}`);
        },
        abort: async () => { ended = true; this.events.push(`abort:${name}`); },
      };
    } };
  }
  async removeEntry(name: string, options?: { recursive?: boolean }) {
    assert.equal(options?.recursive, true);
    if (!this.directories.delete(name)) throw new DOMException('Missing directory', 'NotFoundError');
    this.events.push(`remove:${name}`);
  }
}

function installPicker(t: { after(fn: () => void): void }, parent: TestDirectory, onPick?: () => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { showDirectoryPicker: async (options: unknown) => {
    assert.deepEqual(options, { id: 'sora-cars-proof', mode: 'readwrite', startIn: 'downloads' });
    onPick?.(); return parent;
  } } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window'); });
}

/** The input API must use stream(), even when a source happens to yield a large chunk. */
class StreamOnlyBlob extends Blob {
  reads = 0;
  constructor(readonly payload: Uint8Array<ArrayBuffer>) { super([payload]); }
  override arrayBuffer(): Promise<ArrayBuffer> { throw new Error('Whole input buffering is forbidden.'); }
  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    return new ReadableStream({ start: controller => { this.reads++; controller.enqueue(this.payload); controller.close(); } });
  }
}

test('directory selection starts synchronously; native files stream in bounded awaited writes and report uint64 values stay exact', async t => {
  const parent = new TestDirectory(); let picked = false;
  installPicker(t, parent, () => { picked = true; });
  assert.equal(supportsProofDirectoryExport(), true);
  const selecting = selectProofDirectory();
  assert.equal(picked, true, 'the chooser is invoked before losing user activation');
  const output = await selecting;
  assert.match(output.folder, /^sora-cars-proof-[a-f0-9-]{36}$/);
  const request = new StreamOnlyBlob(Uint8Array.of(1, 2, 3));
  const replay = new StreamOnlyBlob(Uint8Array.from({ length: 3 * PROOF_EXPORT_LIMITS.chunkBytes + 17 }, (_, i) => i % 251));
  await output.writeInputs(request, replay);
  assert.equal(request.reads, 1); assert.equal(replay.reads, 1);
  const directory = parent.directories.get(output.folder)!;
  assert.deepEqual(directory.files.get(PROOF_EXPORT_FILES.request), request.payload);
  assert.deepEqual(directory.files.get(PROOF_EXPORT_FILES.replay), replay.payload);
  const proof = Uint8Array.from({ length: 2 * PROOF_EXPORT_LIMITS.chunkBytes + 9 }, (_, i) => i % 253);
  await output.writeProofChunk(proof);
  assert.equal(directory.files.get(PROOF_EXPORT_FILES.proof)!.byteLength, 0, 'proof is committed only after successful completion');
  const command = "native verify --request 'request.nrt' --replay 'replay.nrt' --proof 'proof.nrt'\n";
  await output.complete({ resource_units: '18446744073709551615', checked: true, computed: 18446744073709551615n }, command);
  assert.deepEqual([...directory.files.keys()], Object.values(PROOF_EXPORT_FILES));
  assert.deepEqual(directory.files.get(PROOF_EXPORT_FILES.proof), proof);
  const report = JSON.parse(new TextDecoder().decode(directory.files.get(PROOF_EXPORT_FILES.report)));
  assert.equal(report.authentication, 'endpoint-reported-unverified');
  assert.equal(report.format, 'sora-cars-native-endpoint-report'); assert.equal(report.version, 1);
  assert.deepEqual(report.report, { resource_units: '18446744073709551615', checked: true, computed: '18446744073709551615' });
  assert.equal(new TextDecoder().decode(directory.files.get(PROOF_EXPORT_FILES.verification)), command);
  assert.ok(parent.writes.every(size => size > 0 && size <= PROOF_EXPORT_LIMITS.chunkBytes));
  assert.ok(parent.events.indexOf(`close:${PROOF_EXPORT_FILES.replay}`) < parent.events.indexOf(`open:${PROOF_EXPORT_FILES.proof}`));
  assert.ok(parent.events.indexOf(`close:${PROOF_EXPORT_FILES.proof}`) < parent.events.indexOf(`open:${PROOF_EXPORT_FILES.report}`));
  await output.abort();
  assert.equal(parent.directories.has(output.folder), true, 'completed exports survive later cancellation');
  await assert.rejects(output.writeProofChunk(Uint8Array.of(1)), /already complete/);
});

test('abort waits for the outstanding write and removes only the unique owned directory', async t => {
  let startWrite!: () => void, releaseWrite!: () => void;
  const started = new Promise<void>(resolve => { startWrite = resolve; });
  const release = new Promise<void>(resolve => { releaseWrite = resolve; });
  const parent = new TestDirectory([], [], async name => { if (name === PROOF_EXPORT_FILES.proof) { startWrite(); await release; } });
  const other = await parent.getDirectoryHandle('personal-files', { create: true });
  other.files.set('keep.txt', Uint8Array.of(42));
  installPicker(t, parent);
  const controller = new AbortController();
  const output = await selectProofDirectory({ signal: controller.signal });
  await output.writeInputs(new Blob(['request']), new Blob(['replay']));
  const writing = output.writeProofChunk(Uint8Array.of(1));
  const rejected = assert.rejects(writing, { name: 'AbortError' });
  await started; controller.abort();
  const cleanup = output.abort();
  assert.equal(parent.directories.has(output.folder), true);
  releaseWrite(); await rejected; await cleanup;
  assert.equal(parent.directories.has(output.folder), false);
  assert.deepEqual([...parent.directories.keys()], ['personal-files']);
  assert.deepEqual(other.files.get('keep.txt'), Uint8Array.of(42));
  assert.equal(parent.events.includes(`close:${PROOF_EXPORT_FILES.proof}`), false);
  await assert.rejects(output.complete({ proof_bytes: '1' }, 'native verify'), { name: 'AbortError' });
  assert.equal(parent.directories.has(output.folder), false, 'a late completion cannot recreate or publish cancelled output');
});

test('cancellation during final metadata persistence prevents completed-folder publication even after proof close', async t => {
  let startWrite!: () => void, releaseWrite!: () => void;
  const started = new Promise<void>(resolve => { startWrite = resolve; });
  const release = new Promise<void>(resolve => { releaseWrite = resolve; });
  const parent = new TestDirectory([], [], async name => { if (name === PROOF_EXPORT_FILES.verification) { startWrite(); await release; } });
  installPicker(t, parent);
  const output = await selectProofDirectory();
  await output.writeInputs(new Blob(['request']), new Blob(['replay']));
  await output.writeProofChunk(Uint8Array.of(1));
  const finishing = output.complete({ proof_bytes: '1' }, 'native verify');
  const rejected = assert.rejects(finishing, { name: 'AbortError' });
  await started;
  assert.ok(parent.events.includes(`close:${PROOF_EXPORT_FILES.proof}`));
  const cleanup = output.abort();
  releaseWrite(); await rejected; await cleanup;
  assert.equal(parent.directories.size, 0);
  assert.equal(parent.events.includes(`close:${PROOF_EXPORT_FILES.verification}`), false);
  await assert.rejects(output.complete({ proof_bytes: '1' }, 'native verify'), { name: 'AbortError' });
});

test('failed proof output automatically aborts and removes partially exported native inputs', async t => {
  const parent = new TestDirectory([], [], async name => { if (name === PROOF_EXPORT_FILES.proof) throw new DOMException('Disk full', 'QuotaExceededError'); });
  installPicker(t, parent);
  const output = await selectProofDirectory();
  await output.writeInputs(new Blob(['request']), new Blob(['replay']));
  await assert.rejects(output.writeProofChunk(Uint8Array.of(1)), { name: 'QuotaExceededError' });
  assert.equal(parent.directories.size, 0);
  assert.ok(parent.events.includes(`abort:${PROOF_EXPORT_FILES.proof}`));
  await output.abort();
});

test('oversized input and lossy endpoint reports fail closed with cleanup', async t => {
  const parent = new TestDirectory(); installPicker(t, parent);
  const oversized = await selectProofDirectory();
  const replay = new StreamOnlyBlob(Uint8Array.of(1));
  await assert.rejects(oversized.writeInputs(new Blob([new Uint8Array(4097)]), replay), /4096/);
  assert.equal(replay.reads, 0); assert.equal(parent.directories.size, 0);
  const lossy = await selectProofDirectory();
  await lossy.writeInputs(new Blob(['request']), new Blob(['replay']));
  await lossy.writeProofChunk(Uint8Array.of(1));
  await assert.rejects(lossy.complete({ bytes: Number('18446744073709551615') }, 'native verify'), /exact decimal strings/);
  assert.equal(parent.directories.size, 0);
  assert.equal(parent.events.includes(`close:${PROOF_EXPORT_FILES.proof}`), false);
});

test('an existing export filename is never overwritten', async t => {
  const parent = new TestDirectory(); installPicker(t, parent);
  const output = await selectProofDirectory();
  const directory = parent.directories.get(output.folder)!;
  directory.files.set(PROOF_EXPORT_FILES.request, Uint8Array.of(99));
  await assert.rejects(output.writeInputs(new Blob(['request']), new Blob(['replay'])), /refuses to replace/);
  assert.deepEqual(directory.files.get(PROOF_EXPORT_FILES.request), Uint8Array.of(99));
  assert.equal(parent.directories.size, 0);
});

test('unsupported browsers explain native CLI export and never offer a buffered fallback', async t => {
  installPicker(t, new TestDirectory());
  Reflect.deleteProperty(window, 'showDirectoryPicker');
  assert.equal(supportsProofDirectoryExport(), false);
  await assert.rejects(selectProofDirectory(), { message: PROOF_EXPORT_UNSUPPORTED });
});
