/** Public replay downloads are staged in OPFS. No replay-sized Blob/ArrayBuffer is constructed. */
export const REPLAY_STAGING_LIMITS = Object.freeze({ chunkBytes: 64 * 1024, totalBytes: 256 * 1024 * 1024 });
export const REPLAY_STAGING_UNSUPPORTED = 'This browser cannot stage a replay on disk. Use a browser with origin-private file system support or the native CLI.';

export interface ReplayStaging {
  write(chunk: Uint8Array): Promise<void>;
  finish(expectedBytes: number): Promise<File>;
  /** The owner must release the staging directory, including after successfully consuming File. */
  abort(): Promise<void>;
}

export function supportsReplayStaging(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'
    && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
}
function cancelled(): DOMException { return new DOMException('Replay staging was cancelled.', 'AbortError'); }
function missing(error: unknown): boolean { return error instanceof DOMException && error.name === 'NotFoundError'; }

/** Each operation must be awaited. Cancellation waits for an outstanding filesystem operation,
 * then cleans its late result; no cancelled writer may recreate or publish a file afterward.
 * The signal remains attached after finish because the returned File still needs its owned folder.
 */
export async function createReplayStaging(options: {
  signal?: AbortSignal;
  getRoot?: () => Promise<FileSystemDirectoryHandle>;
} = {}): Promise<ReplayStaging> {
  const { signal } = options;
  if (signal?.aborted) throw cancelled();
  if (!options.getRoot && !supportsReplayStaging()) throw new Error(REPLAY_STAGING_UNSUPPORTED);
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') throw new Error(REPLAY_STAGING_UNSUPPORTED);
  const getRoot = options.getRoot ?? (() => navigator.storage.getDirectory());
  const folder = `sora-cars-replay-${crypto.randomUUID()}`;
  let state: 'initializing' | 'writing' | 'finished' | 'aborted' = 'initializing';
  let root: FileSystemDirectoryHandle | undefined, directory: FileSystemDirectoryHandle | undefined;
  let file: FileSystemFileHandle | undefined, writable: FileSystemWritableFileStream | undefined;
  let owned = false, written = 0, pending: Promise<unknown> | undefined, cleanupPromise: Promise<void> | undefined;

  const check = () => { if (state === 'aborted' || signal?.aborted) throw cancelled(); };
  const cleanup = (): Promise<void> => {
    if (!cleanupPromise) cleanupPromise = (async () => {
      signal?.removeEventListener('abort', onAbort);
      // A late getDirectoryHandle/createWritable/write/close settles before cleanup inspects it.
      await pending?.catch(() => {});
      const errors: unknown[] = [];
      if (writable) {
        const stream = writable; writable = undefined;
        try { await stream.abort(); } catch (error) { errors.push(error); }
      }
      if (owned && root && directory) {
        try {
          const current = await root.getDirectoryHandle(folder);
          if (!await current.isSameEntry(directory)) throw new Error('Replay staging folder was replaced; refusing to delete another owner’s directory.');
          await root.removeEntry(folder, { recursive: true });
          owned = false;
        } catch (error) { if (missing(error)) owned = false; else errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, `Could not completely remove replay staging folder ${folder}.`, { cause: errors[0] });
    })();
    return cleanupPromise;
  };
  const abort = (): Promise<void> => { state = 'aborted'; return cleanup(); };
  function onAbort() { void abort().catch(() => {}); }
  signal?.addEventListener('abort', onAbort, { once: true });

  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    if (state === 'aborted' || signal?.aborted) return abort().then(() => { throw cancelled(); });
    if (state === 'finished') return Promise.reject(new Error('Replay staging is already finished.'));
    if (pending) return abort().then(() => { throw new Error('Replay staging operations must be awaited sequentially.'); });
    // Queue the operation so the pending marker exists before any filesystem operation begins.
    const job = Promise.resolve().then(async () => { check(); return operation(); });
    pending = job;
    return job.then(async result => {
      if (pending === job) pending = undefined;
      if (state === 'aborted' || signal?.aborted) { await abort(); throw cancelled(); }
      return result;
    }, async error => {
      if (pending === job) pending = undefined;
      state = 'aborted';
      try { await cleanup(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Replay staging failed and cleanup was incomplete.', { cause: error }); }
      throw error;
    });
  };

  await run(async () => {
    root = await getRoot(); check();
    try { await root.getDirectoryHandle(folder); }
    catch (error) { if (!missing(error)) throw error; else { check(); directory = await root.getDirectoryHandle(folder, { create: true }); owned = true; } }
    if (!directory) { check(); throw new Error('Replay staging refuses to reuse an existing folder.'); }
    check();
    try { await directory.getFileHandle('replay.nrt'); }
    catch (error) {
      if (error instanceof DOMException && error.name === 'TypeMismatchError') {
        owned = false;
        throw new Error('Replay staging refuses to replace an existing replay entry.', { cause: error });
      }
      if (!missing(error)) throw error;
      check(); file = await directory.getFileHandle('replay.nrt', { create: true });
    }
    if (!file) {
      // An unexpected existing entry means the supposedly new directory is not exclusively ours.
      owned = false;
      check();
      throw new Error('Replay staging refuses to replace an existing replay file.');
    }
    check();
    writable = await file.createWritable({ keepExistingData: false }); check();
    state = 'writing';
  });
  check();

  return {
    write: chunk => {
      if (pending || state === 'finished' || state === 'aborted' || signal?.aborted) {
        return run(async () => { throw new Error('Replay staging is not writable.'); });
      }
      // Copy synchronously before returning control to a producer that may recycle its buffer.
      const valid = chunk instanceof Uint8Array && chunk.byteLength > 0 && chunk.byteLength <= REPLAY_STAGING_LIMITS.chunkBytes;
      const bytes = valid ? new Uint8Array(chunk.byteLength) : undefined;
      if (bytes) bytes.set(chunk);
      return run(async () => {
        if (state !== 'writing' || !writable) throw new Error('Replay staging is not writable.');
        if (!bytes || bytes.byteLength > REPLAY_STAGING_LIMITS.totalBytes - written) throw new Error('Replay staging requires nonempty chunks up to 64 KiB and at most 256 MiB total.');
        await writable.write(bytes); check();
        written += bytes.byteLength;
      });
    },
    finish: expectedBytes => run(async () => {
      if (state !== 'writing' || !writable || !file) throw new Error('Replay staging is not writable.');
      if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > REPLAY_STAGING_LIMITS.totalBytes
        || expectedBytes !== written) throw new Error('Replay staging length differs from the expected bounded byte count.');
      await writable.close(); writable = undefined; check();
      const result = await file.getFile(); check();
      if (result.size !== expectedBytes) throw new Error('Replay staging file length differs from the completed download.');
      state = 'finished';
      return result;
    }),
    abort,
  };
}
