/** Generic certified settlement transport; endpoint data is not independent authentication. */
export type GameSettlementU64V1 = number | bigint | string;
export interface GameCertifiedSettlementSelectionV1 {
  height: GameSettlementU64V1; block_hash: string; revision: GameSettlementU64V1;
}
export interface GameCertifiedSettlementExportRequestV1 {
  version: 1; network_id: string; trusted_context_id: string; first_height: GameSettlementU64V1;
  source: GameCertifiedSettlementSelectionV1; settled: GameCertifiedSettlementSelectionV1;
  session_id: string; profile_id: string; expected_entry_hash: string;
  outcome_commitment: string;
}
export interface GameCertifiedSettlementDownloadHeaderV1 { version: 1; part_lengths: GameSettlementU64V1[] }
export type GameSettlementFileRoleV1 = "finality" | "source_block" | "source_merge" | "source_write_set" | "settled_block" | "settled_merge" | "settled_write_set";
export interface GameSettlementFilesDescriptorV1 {
  readonly format: "iroha.game.certified-settlement-files"; readonly version: 1;
  readonly files: Readonly<Record<GameSettlementFileRoleV1, { readonly file: string; readonly sha256: string; readonly bytes: number }>>;
}
export interface GameSettlementFileSinkV1 {
  /** Keep files private. Copied chunks <=64KiB. Awaited without racing cancellation. */
  writePart(role: GameSettlementFileRoleV1, chunk: Uint8Array, signal: AbortSignal): void | Promise<void>;
  /** Flush/close role.nrt. Awaited without racing cancellation. Signal is cooperative only. */
  finishPart(role: GameSettlementFileRoleV1, signal: AbortSignal): void | Promise<void>;
  /** Called exactly once after any started sink work on success/failure. Either settlement
   * MUST mean all owned I/O from these callbacks has stopped and cannot mutate later.
   * Rejection suppresses the descriptor. This physical barrier has no forced deadline. */
  quiesce(): void | Promise<void>;
}
export interface GameSettlementReceiptV1 {
  readonly assurance: "endpoint-reported"; readonly request: GameCertifiedSettlementExportRequestV1;
  readonly bytesWritten: number; readonly descriptor: GameSettlementFilesDescriptorV1;
  readonly publicationState: "files-complete-unpublished";
  /** Exact UTF-8 descriptor JSON text, returned only after EOF/files/barrier success.
   * Caller separately owns abort-aware atomic publication; the SDK never commits it. */
  readonly descriptorText: string;
}
export interface CertifiedGameSettlementClientV1 {
  readonly origin: string;
  /** Clean up only after method settlement/quiescence. Network waits are bounded; arbitrary physical sink completion is not. The native verifier requires thirteen caller-pinned ledger expectations. */
  downloadSettlement(request: Uint8Array, sink: GameSettlementFileSinkV1, options?: { signal?: AbortSignal; maxDownloadBytes?: number }): Promise<GameSettlementReceiptV1>;
}
export const GAME_SETTLEMENT_MAX_REQUEST_BYTES_V1: number;
export const GAME_SETTLEMENT_MAX_HEADER_BYTES_V1: number;
export const GAME_SETTLEMENT_MAX_DOWNLOAD_BYTES_V1: number;
export const GAME_SETTLEMENT_FILE_ROLES_V1: readonly GameSettlementFileRoleV1[];
export function encodeGameCertifiedSettlementExportRequestV1(value: GameCertifiedSettlementExportRequestV1): Uint8Array;
export function decodeGameCertifiedSettlementExportRequestV1(value: Uint8Array): GameCertifiedSettlementExportRequestV1;
export function encodeGameCertifiedSettlementDownloadHeaderV1(value: GameCertifiedSettlementDownloadHeaderV1): Uint8Array;
export function decodeGameCertifiedSettlementDownloadHeaderV1(value: Uint8Array): GameCertifiedSettlementDownloadHeaderV1;
export class GameSettlementHttpError extends Error { readonly status: number }
export function createCertifiedGameSettlementClientV1(options: { origin: string; fetchImpl?: typeof fetch; transferTimeoutMs?: number }): CertifiedGameSettlementClientV1;
