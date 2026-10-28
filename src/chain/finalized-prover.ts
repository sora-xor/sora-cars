import {
  createFinalizedGameWorkerClientV1,
  decodeGameVerificationRequestV1,
  encodeGameVerificationRequestV1,
  GAME_WORKER_MAX_PROOF_BYTES_V1,
  GAME_WORKER_MAX_REPLAY_BYTES_V1,
  GAME_WORKER_MAX_REQUEST_BYTES_V1,
} from '@iroha/iroha-js/game-proof-worker';
import type {
  FinalizedGameWorkerClientV1, FinalizedGameWorkerJobV1,
  GameExecutionReportV1, GameVerificationRequestV1, GameWorkerPhaseV1,
} from '@iroha/iroha-js/game-proof-worker';

/** These are user-selected expectations, never values copied out of a worker response. */
export interface FinalizedProofSelection {
  computation: GameVerificationRequestV1['computation']['kind'];
  network_id: string;
  trusted_context_id: string;
  first_height: string;
  target_height: string;
  target_block_hash: string;
  session_id: string;
  revision: string;
  mode: 'selection' | 'archived_settled';
  terminal_tick: number;
}

export const FINALIZED_PROOF_LIMITS = Object.freeze({
  requestBytes: GAME_WORKER_MAX_REQUEST_BYTES_V1,
  replayBytes: Math.min(GAME_WORKER_MAX_REPLAY_BYTES_V1, 1024 * 1024 * 1024),
  proofBytes: GAME_WORKER_MAX_PROOF_BYTES_V1,
  pollIntervalMs: 1000,
  maxPolls: 900,
  operationTimeoutMs: 15 * 60 * 1000,
  downloadTimeoutMs: 10 * 60 * 1000,
  cleanupTimeoutMs: 5000,
});
export const FINALIZED_PROOF_FILENAMES = Object.freeze({ request: 'request.nrt', replay: 'replay.nrt', proof: 'proof.nrt' });

/** Pins are inside the original, independently checked request, not additional CLI flags.
 * Fixed literal arguments prevent endpoint data and uploaded filenames becoming shell code.
 */
export function finalizedVerificationCommand(): string {
  return './iroha app execution verify-finalized --request request.nrt --replay replay.nrt --proof proof.nrt';
}

export interface FinalizedProofInputs {
  requestFile: Blob;
  replay: Blob;
  expected: FinalizedProofSelection;
}
export interface ValidatedFinalizedProofInputs {
  requestBytes: Uint8Array;
  request: GameVerificationRequestV1;
  replay: Blob;
}

function nativeBlob(value: Blob, context: string): Blob {
  try {
    const size = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!.call(value) as number;
    return Blob.prototype.slice.call(value, 0, size, 'application/octet-stream') as Blob;
  } catch { throw new TypeError(`${context} must be a complete File or Blob.`); }
}

function freezeCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item && typeof item === 'object') {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
  };
  freeze(copy);
  return copy;
}

/** Snapshot and compare every independent pin before any network or evidence upload. */
export async function validateFinalizedProofRequest(inputs: Pick<FinalizedProofInputs, 'requestFile' | 'expected'>): Promise<Omit<ValidatedFinalizedProofInputs, 'replay'>> {
  // Snapshot expectations before the first await; later form edits cannot change this operation.
  const selected = { ...inputs.expected };
  for (const name of ['first_height', 'target_height', 'revision'] as const) {
    if (typeof selected[name] !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(selected[name])) {
      throw new TypeError(`Independently selected ${name} must be a canonical decimal integer.`);
    }
  }
  const expectedBytes = encodeGameVerificationRequestV1({
    version: 1, computation: { kind: selected.computation, value: null },
    network_id: selected.network_id, trusted_context_id: selected.trusted_context_id,
    first_height: selected.first_height, target_height: selected.target_height,
    target_block_hash: selected.target_block_hash, session_id: selected.session_id,
    revision: selected.revision, mode: { kind: selected.mode, value: null }, terminal_tick: selected.terminal_tick,
  });
  const expected = decodeGameVerificationRequestV1(expectedBytes);
  const requestFile = nativeBlob(inputs.requestFile, 'Native request');
  if (requestFile.size < 1 || requestFile.size > FINALIZED_PROOF_LIMITS.requestBytes) {
    throw new RangeError(`Native request must contain 1..${FINALIZED_PROOF_LIMITS.requestBytes} canonical bytes.`);
  }
  const requestBytes = new Uint8Array(await requestFile.arrayBuffer());
  const request = decodeGameVerificationRequestV1(requestBytes);
  const reencoded = encodeGameVerificationRequestV1(request);
  if (requestBytes.length !== reencoded.length || requestBytes.some((byte, i) => byte !== reencoded[i])) {
    throw new TypeError('Native request is not exact canonical Norito.');
  }
  for (const name of Object.keys(expected) as (keyof GameVerificationRequestV1)[]) {
    if (JSON.stringify(request[name]) !== JSON.stringify(expected[name])) {
      throw new Error(`Native request does not match independently selected ${name}.`);
    }
  }
  return { requestBytes, request: freezeCopy(request) };
}

/** Only the small request is decoded. Native replay authentication remains Core's job. */
export async function validateFinalizedProofInputs(inputs: FinalizedProofInputs): Promise<ValidatedFinalizedProofInputs> {
  const replay = nativeBlob(inputs.replay, 'Native replay');
  // Every native replay starts with at least one 40-byte Norito archive header.
  // This is a truncation check, not a browser replay decoder or verification claim.
  if (replay.size < 40 || replay.size > FINALIZED_PROOF_LIMITS.replayBytes) {
    throw new RangeError(`Native replay must contain 40..${FINALIZED_PROOF_LIMITS.replayBytes} bytes.`);
  }
  const validated = await validateFinalizedProofRequest(inputs);
  // This sniff catches accidental local JSON; complete authentication remains native.
  const prefix = new TextDecoder().decode(await replay.slice(0, 512).arrayBuffer()).replace(/^\uFEFF/, '').trimStart();
  if (/^[\[{]/.test(prefix)) throw new TypeError('Native replay must be exported binary Norito, not a local JSON transcript.');
  return { ...validated, replay };
}

export type FinalizedProofPhase = 'idle' | 'validating' | 'reserving' | 'uploading' | 'running' |
  'complete' | 'downloading' | 'downloaded' | 'cancelling' | 'cancelled' | 'failed' | 'disposed';
export interface FinalizedProofState {
  readonly phase: FinalizedProofPhase;
  readonly jobId?: string;
  readonly endpointStatus?: GameWorkerPhaseV1;
  readonly assurance?: 'endpoint-reported';
  readonly request?: GameVerificationRequestV1;
  readonly report?: GameExecutionReportV1;
  readonly bytesWritten?: number;
  readonly error?: string;
  /** A DELETE attempt never confirms native process closure. */
  readonly closureRequested?: true;
}
export interface FinalizedProofDownload {
  assurance: 'endpoint-reported';
  report: GameExecutionReportV1;
  bytesWritten: number;
}
/** write must apply backpressure; close publishes only complete output. abort must
 * discard owned partial output and prevent publication even if a write is pending.
 */
export interface FinalizedProofSink {
  write(chunk: Uint8Array): Promise<void>;
  close(result: FinalizedProofDownload): Promise<void>;
  abort(reason: unknown): Promise<void>;
}
type TimingLimits = Pick<typeof FINALIZED_PROOF_LIMITS,
  'pollIntervalMs' | 'maxPolls' | 'operationTimeoutMs' | 'downloadTimeoutMs' | 'cleanupTimeoutMs'>;
export interface FinalizedProofControllerOptions {
  origin: string;
  onState?: (state: FinalizedProofState) => void;
  limits?: Partial<{ [K in keyof TimingLimits]: number }>;
  /** Dependency injection for transport tests; production uses the native SDK. */
  client?: FinalizedGameWorkerClientV1;
}
interface Operation { controller: AbortController; done: Promise<unknown>; cancelled: boolean }

function until<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  // Attach handlers even when already aborted so a late operation rejection is consumed.
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Native proof operation cancelled.', 'AbortError'));
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function check(signal: AbortSignal): void { if (signal.aborted) throw signal.reason; }
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(); };
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(finish, ms);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}

/** One browser operation and one native job at a time. Reports never become browser verification receipts. */
export class FinalizedProofController {
  readonly origin: string;
  #client: FinalizedGameWorkerClientV1;
  #limits: { -readonly [K in keyof TimingLimits]: number };
  #onState?: (state: FinalizedProofState) => void;
  #state: FinalizedProofState = Object.freeze({ phase: 'idle' });
  #operation?: Operation;
  #job?: FinalizedGameWorkerJobV1;
  #disposed = false;
  #cancelling?: Promise<void>;
  #closures = new WeakMap<FinalizedGameWorkerJobV1, Promise<void>>();

  constructor(options: FinalizedProofControllerOptions) {
    const origin = new URL(options.origin);
    if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) {
      throw new TypeError('Native proof workers require HTTPS, or HTTP on localhost.');
    }
    // The SDK enforces exact canonical origin, paths and credential omission.
    const sdk = createFinalizedGameWorkerClientV1({ origin: options.origin });
    this.origin = sdk.origin;
    this.#client = options.client ?? sdk;
    if (this.#client.origin !== this.origin) throw new TypeError('Native worker client origin differs from the selected origin.');
    this.#onState = options.onState;
    this.#limits = { ...FINALIZED_PROOF_LIMITS };
    for (const key of ['pollIntervalMs', 'maxPolls', 'operationTimeoutMs', 'downloadTimeoutMs', 'cleanupTimeoutMs'] as const) {
      const value = options.limits?.[key] ?? FINALIZED_PROOF_LIMITS[key];
      if (!Number.isSafeInteger(value) || value < 1 || value > FINALIZED_PROOF_LIMITS[key]) throw new RangeError(`Native proof ${key} may only tighten its bound.`);
      this.#limits[key] = value;
    }
  }
  get state(): FinalizedProofState { return this.#state; }

  #update(patch: Partial<FinalizedProofState>, replace = false): void {
    if (this.#disposed && patch.phase !== 'disposed') return;
    this.#state = Object.freeze({ ...(replace ? {} : this.#state), ...patch }) as FinalizedProofState;
    try { this.#onState?.(this.#state); } catch { /* An observer must not interrupt resource cleanup. */ }
  }

  #run<T>(timeout: number, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.#disposed) return Promise.reject(new Error('Native proof controller is disposed.'));
    if (this.#operation || this.#cancelling) return Promise.reject(new Error('A native proof operation is already active.'));
    const operation: Operation = { controller: new AbortController(), done: Promise.resolve(), cancelled: false };
    this.#operation = operation;
    const timer = setTimeout(() => operation.controller.abort(new DOMException('Native proof operation deadline exceeded.', 'TimeoutError')), timeout);
    const promise = Promise.resolve().then(() => task(operation.controller.signal)).catch(async error => {
      operation.controller.abort(error);
      if (this.#job) await this.#requestClosure(this.#job);
      this.#update({ phase: operation.cancelled ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : 'Native proof operation failed.' });
      throw error;
    }).finally(() => {
      clearTimeout(timer);
      if (this.#operation === operation) this.#operation = undefined;
    });
    operation.done = promise;
    return promise;
  }

  start(inputs: FinalizedProofInputs): Promise<void> {
    if (this.#job) return Promise.reject(new Error('Cancel the previous native job before starting another.'));
    // Keep caller form changes from changing the selected request before the microtask starts.
    const snapshot = { ...inputs, expected: { ...inputs.expected } };
    return this.#run(this.#limits.operationTimeoutMs, async signal => {
      this.#update({ phase: 'validating' }, true);
      const validated = await until(validateFinalizedProofInputs(snapshot), signal);
      check(signal);
      this.#update({ phase: 'reserving', request: validated.request });
      const reservation = this.#client.reserve(validated.requestBytes, { signal });
      // A transport implementation that resolves after cancellation still gets best-effort DELETE.
      void reservation.then(job => { if (signal.aborted) void this.#requestClosure(job); }, () => {});
      const job = await until(reservation, signal);
      this.#job = job;
      check(signal);
      this.#update({ phase: 'uploading', jobId: job.id, endpointStatus: 'awaiting_upload' });
      const uploaded = await until(job.uploadReplay(validated.replay, { signal }), signal);
      check(signal);
      this.#update({ phase: 'running', endpointStatus: uploaded.status, assurance: uploaded.assurance });
      for (let polls = 0; polls < this.#limits.maxPolls; polls++) {
        await delay(this.#limits.pollIntervalMs, signal);
        const status = await until(job.status({ signal }), signal);
        check(signal);
        this.#update({ endpointStatus: status.status, assurance: status.assurance });
        if (status.status === 'complete') {
          this.#update({ phase: 'complete', report: freezeCopy(status.report) });
          return;
        }
        if (status.status !== 'running') throw new Error(`Native proof endpoint stopped the job (${status.status}).`);
      }
      throw new DOMException('Native proof polling deadline exceeded.', 'TimeoutError');
    });
  }

  download(sink: FinalizedProofSink): Promise<FinalizedProofDownload> {
    const job = this.#job;
    if (!job || this.#state.phase !== 'complete') return Promise.reject(new Error('A complete native proof job is required before download.'));
    if (!sink || typeof sink.write !== 'function' || typeof sink.close !== 'function' || typeof sink.abort !== 'function') {
      return Promise.reject(new TypeError('A proof sink with awaited write, close and abort is required.'));
    }
    return this.#run(this.#limits.downloadTimeoutMs, async signal => {
      this.#update({ phase: 'downloading', bytesWritten: 0 });
      let bytesWritten = 0;
      try {
        const result = await until(job.downloadProof(async chunk => {
          check(signal);
          if (!(chunk instanceof Uint8Array) || chunk.byteLength < 1 || chunk.byteLength > 65536 || chunk.byteLength > FINALIZED_PROOF_LIMITS.proofBytes - bytesWritten) {
            throw new RangeError('Native proof write exceeds its bounded chunk or total size.');
          }
          await until(sink.write(chunk), signal);
          check(signal);
          bytesWritten += chunk.byteLength;
          this.#update({ bytesWritten });
        }, { signal }), signal);
        check(signal);
        if (result.bytesWritten !== bytesWritten || bytesWritten !== Number(result.report.proof_bytes)) throw new Error('Native proof download length does not match the endpoint report.');
        const completed = freezeCopy(result);
        this.#update({ assurance: completed.assurance, report: completed.report, bytesWritten });
        await until(sink.close(completed), signal);
        check(signal);
        this.#update({ phase: 'downloaded' });
        return completed;
      } catch (error) {
        await this.#boundedCleanup(() => sink.abort(error));
        throw error;
      }
    });
  }

  async #boundedCleanup(task: (signal: AbortSignal) => Promise<unknown>): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Native proof cleanup deadline exceeded.', 'TimeoutError')), this.#limits.cleanupTimeoutMs);
    try { await until(Promise.resolve().then(() => task(controller.signal)), controller.signal); }
    catch { /* Closure/cleanup was requested; never claim an unobserved completion. */ }
    finally { clearTimeout(timer); }
  }
  #requestClosure(job: FinalizedGameWorkerJobV1): Promise<void> {
    const existing = this.#closures.get(job);
    if (existing) return existing;
    this.#update({ closureRequested: true });
    const closure = this.#boundedCleanup(async signal => {
      const status = await job.cancel({ signal });
      if (this.#job === job) this.#update({ endpointStatus: status.status });
    }).finally(() => { if (this.#job === job) this.#job = undefined; });
    this.#closures.set(job, closure);
    return closure;
  }

  cancel(): Promise<void> {
    if (this.#cancelling) return this.#cancelling;
    const operation = this.#operation;
    if (!operation && !this.#job) return Promise.resolve();
    this.#update({ phase: 'cancelling' });
    if (operation) {
      operation.cancelled = true;
      operation.controller.abort(new DOMException('Native proof operation cancelled.', 'AbortError'));
    }
    const closure = this.#job ? this.#requestClosure(this.#job) : Promise.resolve();
    const cancelling = Promise.allSettled([operation?.done, closure]).then(() => {
      this.#update({ phase: 'cancelled' });
    }).finally(() => { if (this.#cancelling === cancelling) this.#cancelling = undefined; });
    this.#cancelling = cancelling;
    return cancelling;
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#update({ phase: 'disposed' });
    await this.cancel();
    this.#onState = undefined;
  }
}
