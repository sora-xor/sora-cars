type DirectoryPicker = (options: { id: string; mode: 'readwrite'; startIn: 'downloads' }) => Promise<FileSystemDirectoryHandle>;
type ExportWindow = Window & { showDirectoryPicker?: DirectoryPicker };

export const PROOF_EXPORT_FILES = Object.freeze({
  request: 'request.nrt', replay: 'replay.nrt', proof: 'proof.nrt',
  report: 'endpoint-report.json', verification: 'verify.txt',
});
export const PROOF_EXPORT_LIMITS = Object.freeze({
  requestBytes: 4096, replayBytes: 1024 * 1024 * 1024, proofBytes: 512 * 1024 * 1024,
  chunkBytes: 64 * 1024, reportBytes: 1024 * 1024, commandBytes: 64 * 1024,
});
export const PROOF_EXPORT_UNSUPPORTED = 'Saving a native proof needs a desktop browser with folder saving support. On mobile or an unsupported browser, use the native CLI export workflow on a computer; a large proof is not buffered for download.';

export interface ProofDirectoryExport {
  readonly folder: string;
  writeInputs(request: Blob, replay: Blob): Promise<void>;
  writeProofChunk(chunk: Uint8Array): Promise<void>;
  complete(report: unknown, verificationCommand: string): Promise<void>;
  abort(): Promise<void>;
}

export function supportsProofDirectoryExport(): boolean {
  return typeof window !== 'undefined' && typeof (window as ExportWindow).showDirectoryPicker === 'function';
}

function aborted(): DOMException { return new DOMException('Native proof export was cancelled.', 'AbortError'); }
function isMissing(error: unknown): boolean { return error instanceof DOMException && error.name === 'NotFoundError'; }
async function requireMissing(find: () => Promise<unknown>): Promise<void> {
  try { await find(); }
  catch (error) { if (isMissing(error)) return; throw error; }
  throw new Error('Native proof export refuses to replace an existing file or folder.');
}

/** Keep SDK decimal strings exact. This labeled endpoint report is not a native verification verdict. */
function reportBlob(report: unknown): Blob {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('Expected an endpoint report object.');
  const json = JSON.stringify({ format: 'sora-cars-native-endpoint-report', version: 1, authentication: 'endpoint-reported-unverified', report }, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString(10);
    if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('Endpoint report contains a lossy numeric value; exact decimal strings are required.');
    return value;
  }, 2);
  const blob = new Blob([json + '\n'], { type: 'application/json' });
  if (blob.size > PROOF_EXPORT_LIMITS.reportBytes) throw new Error('Endpoint report exceeds the export size limit.');
  return blob;
}

/** Invoke directly from a user action, before any worker or other asynchronous work. */
export async function selectProofDirectory(options: { signal?: AbortSignal } = {}): Promise<ProofDirectoryExport> {
  const { signal } = options;
  if (signal?.aborted) throw aborted();
  if (!supportsProofDirectoryExport()) throw new Error(PROOF_EXPORT_UNSUPPORTED);
  const picker = (window as ExportWindow).showDirectoryPicker!;
  const parent = await picker.call(window, { id: 'sora-cars-proof', mode: 'readwrite', startIn: 'downloads' });
  if (signal?.aborted) throw aborted();
  const folder = `sora-cars-proof-${crypto.randomUUID()}`;
  await requireMissing(() => parent.getDirectoryHandle(folder));
  const directory = await parent.getDirectoryHandle(folder, { create: true });
  let state: 'inputs' | 'proof' | 'complete' | 'aborted' = 'inputs';
  let activeStream: FileSystemWritableFileStream | undefined;
  let pending: Promise<void> | undefined, cleanupPromise: Promise<void> | undefined;
  let proofBytes = 0;

  const check = () => { if (state === 'aborted' || signal?.aborted) throw aborted(); };
  const detach = () => signal?.removeEventListener('abort', onAbort);
  const cleanup = (): Promise<void> => {
    if (!cleanupPromise) cleanupPromise = (async () => {
      detach();
      if (activeStream) {
        await activeStream.abort().catch(() => {});
        activeStream = undefined;
      }
      try { await parent.removeEntry(folder, { recursive: true }); }
      catch (error) {
        if (!isMissing(error)) throw new Error(`Could not remove the incomplete export folder ${folder}. Remove that folder manually.`, { cause: error });
      }
    })();
    return cleanupPromise;
  };
  const abort = async (): Promise<void> => {
    if (state === 'complete') return;
    state = 'aborted';
    await pending?.catch(() => {});
    await cleanup();
  };
  function onAbort() { void abort().catch(() => {}); }
  signal?.addEventListener('abort', onAbort, { once: true });

  const run = (operation: () => Promise<void>): Promise<void> => {
    if (state === 'complete') return Promise.reject(new Error('Native proof export is already complete.'));
    if (state === 'aborted') return abort().then(() => { throw aborted(); });
    if (pending) return abort().then(() => { throw new Error('Native proof export writes must be awaited sequentially.'); });
    const job = (async () => {
      try { check(); await operation(); }
      catch (error) { state = 'aborted'; await cleanup(); throw error; }
    })();
    pending = job;
    return job.finally(() => { if (pending === job) pending = undefined; });
  };
  const openFile = async (name: string): Promise<void> => {
    check();
    await requireMissing(() => directory.getFileHandle(name));
    check();
    const handle = await directory.getFileHandle(name, { create: true });
    check();
    activeStream = await handle.createWritable();
    check();
  };
  const writeBytes = async (bytes: Uint8Array): Promise<void> => {
    for (let offset = 0; offset < bytes.byteLength; offset += PROOF_EXPORT_LIMITS.chunkBytes) {
      check();
      // Copy at most one bounded chunk; no replay/proof-sized ArrayBuffer is created.
      const chunk = new Uint8Array(Math.min(PROOF_EXPORT_LIMITS.chunkBytes, bytes.byteLength - offset));
      chunk.set(bytes.subarray(offset, offset + chunk.byteLength));
      await activeStream!.write(chunk);
      check();
    }
  };
  const closeFile = async (): Promise<void> => {
    check();
    await activeStream!.close();
    activeStream = undefined;
    check();
  };
  const writeBlob = async (name: string, blob: Blob): Promise<void> => {
    await openFile(name);
    const reader = blob.stream().getReader();
    let readBytes = 0, finished = false;
    try {
      while (true) {
        check();
        const { value, done } = await reader.read();
        check();
        if (done) { finished = true; break; }
        readBytes += value.byteLength;
        if (readBytes > blob.size) throw new Error('Native proof input stream exceeds its declared size.');
        await writeBytes(value);
      }
      if (readBytes !== blob.size) throw new Error('Native proof input stream is truncated.');
      await closeFile();
    } finally {
      if (!finished) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };

  if (signal?.aborted) { await abort(); throw aborted(); }
  return {
    folder,
    writeInputs: (request, replay) => run(async () => {
      if (state !== 'inputs') throw new Error('Native proof inputs have already been exported.');
      if (!(request instanceof Blob) || request.size === 0 || request.size > PROOF_EXPORT_LIMITS.requestBytes) throw new Error('Native proof request must contain 1–4096 bytes.');
      if (!(replay instanceof Blob) || replay.size === 0 || replay.size > PROOF_EXPORT_LIMITS.replayBytes) throw new Error('Native replay exceeds the browser export size limit.');
      await writeBlob(PROOF_EXPORT_FILES.request, request);
      await writeBlob(PROOF_EXPORT_FILES.replay, replay);
      await openFile(PROOF_EXPORT_FILES.proof);
      state = 'proof';
    }),
    writeProofChunk: chunk => run(async () => {
      if (state !== 'proof') throw new Error('Export the native request and replay before the proof.');
      if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0 || chunk.byteLength > PROOF_EXPORT_LIMITS.proofBytes - proofBytes) throw new Error('Native proof chunk exceeds the export size limit or is empty.');
      await writeBytes(chunk);
      proofBytes += chunk.byteLength;
    }),
    complete: (report, verificationCommand) => run(async () => {
      if (state !== 'proof' || proofBytes === 0) throw new Error('Native proof export cannot finish without proof bytes.');
      const reportFile = reportBlob(report);
      if (typeof verificationCommand !== 'string' || !verificationCommand.trim()) throw new Error('A native verification command is required.');
      const commandFile = new Blob([verificationCommand], { type: 'text/plain' });
      if (commandFile.size > PROOF_EXPORT_LIMITS.commandBytes) throw new Error('Native verification command exceeds the export size limit.');
      await closeFile();
      await writeBlob(PROOF_EXPORT_FILES.report, reportFile);
      await writeBlob(PROOF_EXPORT_FILES.verification, commandFile);
      check();
      state = 'complete';
      detach();
    }),
    abort,
  };
}
