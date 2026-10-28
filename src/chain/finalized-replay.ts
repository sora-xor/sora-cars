import {
  createFinalizedGameReplayClientV1, decodeGameReplayEvidenceV1, encodeGameReplayExportRequestV1,
  GAME_REPLAY_MAX_DOWNLOAD_BYTES_V1, GAME_REPLAY_MAX_EVIDENCE_BYTES_V1,
} from '@iroha/iroha-js/game-replay';
import type { FinalizedGameReplayClientV1 } from '@iroha/iroha-js/game-replay';
import { validateFinalizedProofRequest, type FinalizedProofSelection } from './finalized-prover';
import { createReplayStaging, type ReplayStaging } from '../ui/replay-staging';

export interface ToriiReplayInputs { requestFile: Blob; evidenceFile: Blob; expected: FinalizedProofSelection }
export interface ToriiReplayState {
  readonly phase: 'idle' | 'validating' | 'fetching' | 'ready' | 'cancelled' | 'failed';
  readonly assurance: 'endpoint-reported'; readonly bytesWritten: number;
}
const PREPARATION_TIMEOUT_MS = 120_000;

function until<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason ?? new DOMException('Replay preparation cancelled.', 'AbortError'));
    if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true });
    // Always observe the original read, including a late rejection after cancellation.
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

export interface ToriiReplayOptions {
  origin: string;
  onState?: (state: ToriiReplayState) => void;
  /** May only tighten the local file preparation deadline. */
  preparationTimeoutMs?: number;
  client?: FinalizedGameReplayClientV1;
  staging?: (options: { signal: AbortSignal }) => Promise<ReplayStaging>;
}

/** One caller-pinned replay source. Partial network data stays in an owned disk file,
 * and neither download completion nor the evidence decoder authenticates the ledger.
 */
export class ToriiReplayController {
  #client: FinalizedGameReplayClientV1;
  #options: ToriiReplayOptions;
  #abort = new AbortController();
  #stage?: ReplayStaging;
  #pending?: Promise<{ requestFile: Blob; replay: File }>;
  #closed = false;
  #state: ToriiReplayState = Object.freeze({ phase: 'idle', assurance: 'endpoint-reported', bytesWritten: 0 });
  constructor(options: ToriiReplayOptions) {
    const url = new URL(options.origin);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new TypeError('Torii replay requires HTTPS, or HTTP on localhost.');
    const client = createFinalizedGameReplayClientV1({ origin: options.origin });
    this.#client = options.client ?? client;
    if (this.#client.origin !== client.origin) throw new TypeError('Replay client origin differs from the selected Torii origin.');
    const preparationTimeoutMs = options.preparationTimeoutMs ?? PREPARATION_TIMEOUT_MS;
    if (!Number.isSafeInteger(preparationTimeoutMs) || preparationTimeoutMs < 1 || preparationTimeoutMs > PREPARATION_TIMEOUT_MS) throw new RangeError('Replay preparation deadline may only tighten its bound.');
    this.#options = { ...options, preparationTimeoutMs };
  }
  get state(): ToriiReplayState { return this.#state; }
  #check(): void { if (this.#closed || this.#abort.signal.aborted) throw this.#abort.signal.reason ?? new DOMException('Replay fetch cancelled.', 'AbortError'); }
  #update(phase: ToriiReplayState['phase'], bytesWritten = this.#state.bytesWritten): void {
    this.#state = Object.freeze({ phase, assurance: 'endpoint-reported', bytesWritten });
    try { this.#options.onState?.(this.#state); } catch { /* Observers cannot interrupt cleanup. */ }
  }
  load(inputs: ToriiReplayInputs): Promise<{ requestFile: Blob; replay: File }> {
    if (this.#pending || this.#closed) return Promise.reject(new Error('A replay source can be used only once.'));
    const selected = { ...inputs, expected: { ...inputs.expected } };
    const pending = (async () => {
      const timer = setTimeout(() => this.#abort.abort(new DOMException('Replay input preparation exceeded its deadline.', 'TimeoutError')), this.#options.preparationTimeoutMs);
      try {
        this.#check(); this.#update('validating');
        const validated = await until(validateFinalizedProofRequest(selected), this.#abort.signal);
        this.#check();
        const size = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!.call(selected.evidenceFile) as number;
        if (size < 40 || size > GAME_REPLAY_MAX_EVIDENCE_BYTES_V1) throw new RangeError('Native public evidence must contain 40 bytes to 16 MiB.');
        const evidenceBlob = Blob.prototype.slice.call(selected.evidenceFile, 0, size, 'application/octet-stream') as Blob;
        const evidence = decodeGameReplayEvidenceV1(new Uint8Array(await until(evidenceBlob.arrayBuffer(), this.#abort.signal)));
        this.#check();
        const bytes = encodeGameReplayExportRequestV1({ request: validated.request, evidence });
        clearTimeout(timer);
        const stage = await (this.#options.staging ?? createReplayStaging)({ signal: this.#abort.signal });
        this.#stage = stage;
        this.#check(); this.#update('fetching', 0);
        const receipt = await this.#client.downloadReplay(bytes, async chunk => {
          this.#check();
          await stage.write(chunk);
          this.#check(); this.#update('fetching', this.#state.bytesWritten + chunk.byteLength);
        }, { signal: this.#abort.signal, maxReplayBytes: GAME_REPLAY_MAX_DOWNLOAD_BYTES_V1 });
        this.#check();
        if (receipt.assurance !== 'endpoint-reported' || receipt.bytesWritten !== this.#state.bytesWritten) throw new Error('Replay transport length does not match staged bytes.');
        const replay = await stage.finish(receipt.bytesWritten);
        this.#check(); this.#update('ready');
        return { requestFile: new Blob([Uint8Array.from(validated.requestBytes)], { type: 'application/octet-stream' }), replay };
      } catch (error) {
        this.#abort.abort(error);
        await this.#stage?.abort();
        this.#update(this.#closed ? 'cancelled' : 'failed');
        throw error;
      } finally { clearTimeout(timer); }
    })();
    this.#pending = pending;
    return pending;
  }
  async dispose(): Promise<void> {
    this.#closed = true;
    this.#abort.abort(new DOMException('Replay fetch cancelled.', 'AbortError'));
    this.#update('cancelled');
    // The original operation owns late stage creation and cleanup; never abandon it.
    await this.#pending?.catch(() => {});
    await this.#stage?.abort();
  }
}
