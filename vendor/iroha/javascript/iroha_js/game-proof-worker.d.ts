/** Native finalized-game public transport, distinct from a settlement envelope. */
export type GameComputationV1 = { kind: "street" | "stock_race"; value: null };
export type GameRecordModeV1 = { kind: "selection" | "archived_settled"; value: null };
export interface GameVerificationRequestV1 {
  version: 1; computation: GameComputationV1; network_id: string;
  trusted_context_id: string; first_height: string | number | bigint;
  target_height: string | number | bigint; target_block_hash: string;
  session_id: string; revision: string | number | bigint; mode: GameRecordModeV1;
  terminal_tick: number;
}
/** Decoded u64 values are lossless decimal strings. No flag grants browser verification authority. */
export interface GameExecutionReportV1 {
  computation: GameComputationV1; network_id: string; session_id: string;
  revision: string; carrier_height: string; carrier_hash: string; state_origin: string;
  snapshot_root: string; association_digest: string; implementation_id: string;
  outcome: { terminal_tick: number; winner_slots: number[]; result: number[] };
  /** Original B/M components covered by Street; one compiled relation for StockRace. */
  components: number;
  /** Complete verified native proofs claimed by the endpoint: 1..components; StockRace is one. */
  proofs: number;
  proof_bytes: string; replay_bytes: string;
  record_finality_verified: boolean; computation_verified: boolean;
  latest_freshness_verified: boolean; removal_transitions_replayed: boolean;
  profile_registered: boolean; settlement_verified: boolean; composed_security_qualified: boolean;
}
export const GAME_WORKER_PROTOCOL_V1: "iroha-game-worker-v1";
export const GAME_WORKER_MAX_REQUEST_BYTES_V1: 4096;
export const GAME_WORKER_MAX_PROOF_BYTES_V1: number;
export const GAME_WORKER_MAX_REPLAY_BYTES_V1: number;
export const GAME_WORKER_MAX_REPORT_JSON_BYTES_V1: number;
export function encodeGameVerificationRequestV1(value: GameVerificationRequestV1): Uint8Array;
export function decodeGameVerificationRequestV1(bytes: Uint8Array): GameVerificationRequestV1;
export function parseGameExecutionReportV1(text: string): GameExecutionReportV1;
export type GameWorkerPhaseV1 = "awaiting_upload" | "uploading" | "running" | "cancelling" | "complete" | "draining" | "failed";
interface GameWorkerStatusBaseV1 {
  protocol: "iroha-game-worker-v1"; id: string; assurance: "endpoint-reported";
  replay_path: string; status_path: string;
}
export type GameWorkerStatusV1 = GameWorkerStatusBaseV1 & (
  { status: "complete"; report: GameExecutionReportV1; proof_path: string } |
  { status: "failed"; error: "native_job_failed" } |
  { status: Exclude<GameWorkerPhaseV1, "complete" | "failed"> }
);
export interface GameWorkerCallOptionsV1 { signal?: AbortSignal }
export interface FinalizedGameWorkerJobV1 {
  readonly id: string; readonly request: GameVerificationRequestV1;
  /** Pass a complete exported native replay File/Blob; the browser sets Content-Length. */
  uploadReplay(replay: Blob, options?: GameWorkerCallOptionsV1): Promise<GameWorkerStatusV1>;
  status(options?: GameWorkerCallOptionsV1): Promise<GameWorkerStatusV1>;
  /** Closure requested does not establish that a native child has already exited. */
  cancel(options?: GameWorkerCallOptionsV1): Promise<GameWorkerStatusV1>;
  /** Sequential chunks <=64 KiB; publish sink output only on success, then verify natively.
   * StockRace uses a canonical ExecutionProofEnvelopeV1; Street uses its bounded combined segment stream.
   * The transport keeps the native proof opaque and never converts between computations. */
  downloadProof(write: (chunk: Uint8Array) => void | Promise<void>, options?: GameWorkerCallOptionsV1): Promise<{
    assurance: "endpoint-reported"; report: GameExecutionReportV1; bytesWritten: number;
  }>;
}
export interface FinalizedGameWorkerClientV1 {
  readonly origin: string;
  reserve(requestBytes: Uint8Array, options?: GameWorkerCallOptionsV1): Promise<FinalizedGameWorkerJobV1>;
}
export class GameProofWorkerHttpError extends Error { readonly status: number }
export function createFinalizedGameWorkerClientV1(options: {
  origin: string; fetchImpl?: typeof fetch; requestTimeoutMs?: number; transferTimeoutMs?: number;
}): FinalizedGameWorkerClientV1;
