/** Public replay export does not authenticate computation or settlement. */
import type { GameVerificationRequestV1 } from "./game-proof-worker.js";
import type { GameTranscriptV1, GameInputRevealV1, GameInputCommitmentV1 } from "./game-inputs.js";
export interface GameReplayEvidenceV1 {
  transcript: GameTranscriptV1;
  current_reveals: GameInputRevealV1[];
  current_commitments: GameInputCommitmentV1[];
}
export interface GameReplayExportRequestV1 { request: GameVerificationRequestV1; evidence: GameReplayEvidenceV1 }
export const GAME_REPLAY_MAX_EVIDENCE_BYTES_V1: number;
export const GAME_REPLAY_MAX_EXPORT_REQUEST_BYTES_V1: number;
export const GAME_REPLAY_MAX_DOWNLOAD_BYTES_V1: number;
export function encodeGameReplayEvidenceV1(value: GameReplayEvidenceV1): Uint8Array;
export function decodeGameReplayEvidenceV1(value: Uint8Array): GameReplayEvidenceV1;
export function encodeGameReplayExportRequestV1(value: GameReplayExportRequestV1): Uint8Array;
export function decodeGameReplayExportRequestV1(value: Uint8Array): GameReplayExportRequestV1;
export interface GameReplayReceiptV1 {
  readonly assurance: "endpoint-reported"; readonly request: GameVerificationRequestV1; readonly bytesWritten: number;
}
export interface FinalizedGameReplayClientV1 {
  readonly origin: string;
  /** Awaited copied chunks <=64KiB. Discard partial output on error; verification remains native. */
  downloadReplay(request: Uint8Array, write: (chunk: Uint8Array) => void | Promise<void>, options?: {
    signal?: AbortSignal; maxReplayBytes?: number;
  }): Promise<GameReplayReceiptV1>;
}
export class GameReplayHttpError extends Error { readonly status: number }
export function createFinalizedGameReplayClientV1(options: {
  origin: string; fetchImpl?: typeof fetch; transferTimeoutMs?: number;
}): FinalizedGameReplayClientV1;
