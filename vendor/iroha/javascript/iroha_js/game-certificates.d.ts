/** Native game-certificate bytes and claims. No ledger, finality, slot-authority,
 * accepted-history, execution-proof or wallet-payment verification is provided.
 * This subpath uses only ECMAScript and DOM types; no Node Buffer/addon is needed.
 */
export class GameCertificateErrorV1 extends Error {
  readonly code: "Literal" | "Codec" | "Bound" | "Slot" | "Geometry" | "Frame" | "Signature";
}
/** The SDK's existing runtime-branded genesis NetworkId, re-exported unchanged. */
export class NetworkId {
  private constructor();
  static readonly BYTE_LENGTH: 32;
  static parse(literal: string): NetworkId;
  static fromBytes(value: ArrayBuffer | ArrayBufferView): NetworkId;
  readonly literal: string;
  toBytes(): Uint8Array;
  equals(other: unknown): boolean;
  toString(): string;
  toJSON(): string;
}
declare const commitmentBrand: unique symbol;
declare const nonceBrand: unique symbol;
/** Opaque unreduced raw48 bytes in exact uppercase game384 notation. */
export type GameCommitmentLiteralV1 = string & { readonly [commitmentBrand]: true };
/** Opaque raw32 bytes. Formatting never establishes random nonce generation. */
export type GameNonceLiteralV1 = string & { readonly [nonceBrand]: true };
export function parseGameCommitmentLiteralV1(value: string): Uint8Array;
export function formatGameCommitmentLiteralV1(value: Uint8Array): GameCommitmentLiteralV1;
export function parseGameNonceLiteralV1(value: string): Uint8Array;
export function formatGameNonceLiteralV1(value: Uint8Array): GameNonceLiteralV1;
/** Exact unescaped JSON token, with no surrounding whitespace. */
export function decodeGameCommitmentJsonV1(value: string): GameCommitmentLiteralV1;
/** Raw unmarked FIPS202 digest; input is bounded to 8 MiB. */
export function rawSha3_384V1(value: Uint8Array): Uint8Array;
export interface GameCertificateContextV1 {
  /** Runtime-branded identity chosen independently of the packet. */
  readonly networkId: NetworkId;
  /** Exactly 32 marked native Hash bytes, chosen independently of the packet. */
  readonly sessionId: Uint8Array;
}
export interface GameActiveScopeV1 {
  readonly manifest: GameCommitmentLiteralV1;
  readonly admission: GameCommitmentLiteralV1;
}
/** Encoding accepts an exact nonnegative safe integer or bigint. Decoding returns bigint. */
export type GameCertificateEpochV1 = number | bigint;
export interface GameInputPreimageV1 {
  readonly scope: GameActiveScopeV1;
  readonly epoch: GameCertificateEpochV1;
  readonly start_tick: number;
  readonly slot: number;
  readonly payload: Uint8Array;
  readonly nonce: GameNonceLiteralV1;
}
export interface GameInputCommitmentCertificateBodyV1 {
  readonly scope: GameActiveScopeV1;
  readonly epoch: GameCertificateEpochV1;
  readonly start_tick: number;
  readonly slot: number;
  readonly commitment: GameCommitmentLiteralV1;
}
export interface GameCheckpointCertificateBodyV1 {
  readonly scope: GameActiveScopeV1;
  readonly epoch: GameCertificateEpochV1;
  readonly tick: number;
  readonly transcript_root: GameCommitmentLiteralV1;
  readonly state_root: GameCommitmentLiteralV1;
  readonly terminal: boolean;
}
export interface GameCommitmentSetCertificateBodyV1 {
  readonly scope: GameActiveScopeV1;
  readonly epoch: GameCertificateEpochV1;
  readonly start_tick: number;
  readonly parent_transcript_root: GameCommitmentLiteralV1;
  /** Permanent original-slot order; never sorted, compacted or deduplicated. */
  readonly commitments: readonly GameCommitmentLiteralV1[];
}
export interface GameChallengeCertificateBodyV1 {
  readonly scope: GameActiveScopeV1;
  readonly epoch: GameCertificateEpochV1;
  readonly slot: number;
}
export interface GameTranscriptGeometryV1 {
  readonly batch_ticks: number;
  readonly max_ticks: number;
  readonly slots: number;
  readonly max_input_bytes: number;
}
export interface GameTranscriptBatchV1 { readonly start_tick: number; readonly inputs: readonly Uint8Array[] }
export interface GameTranscriptRemovalV1 { readonly tick: number; readonly slots: Uint8Array }
export interface GameTranscriptV1 { readonly batches: readonly GameTranscriptBatchV1[]; readonly dnf_events: readonly GameTranscriptRemovalV1[] }
export interface GameTranscriptSeedBodyV1 extends GameTranscriptGeometryV1 { readonly scope: GameActiveScopeV1 }
export interface GameTranscriptBatchLinkBodyV1 { readonly previous: GameCommitmentLiteralV1; readonly ordinal: number; readonly batch: GameTranscriptBatchV1 }
export interface GameTranscriptRemovalLinkBodyV1 { readonly previous: GameCommitmentLiteralV1; readonly ordinal: number; readonly event: GameTranscriptRemovalV1 }
export interface GameTranscriptRootBodyV1 { readonly scope: GameActiveScopeV1; readonly through_tick: number; readonly batch_count: number; readonly removal_count: number; readonly head: GameCommitmentLiteralV1 }
/** Full data claim, never a direct certificate commitment preimage. */
export interface GameTranscriptClaimV1 { readonly scope: GameActiveScopeV1; readonly geometry: GameTranscriptGeometryV1; readonly through_tick: number; readonly transcript: GameTranscriptV1 }
declare const preparedGameTranscriptBrand: unique symbol;
/** Opaque immutable local consistency result, not application validation or ledger authority. */
export interface PreparedGameTranscriptV1 {
  readonly [preparedGameTranscriptBrand]: true;
  /** Pre-removal cut: aligned ticks through T, plus T itself if partial. */
  checkpointRoot(tick: number): GameCommitmentLiteralV1;
  /** Complete accepted inputs and removals, including removals exactly at T. */
  acceptedRoot(): GameCommitmentLiteralV1;
}
/** Validate bounded complete geometry once and hash its chronological event chain.
 * Callers separately validate application controls, frozen context and consensus evidence.
 * No constructor accepts caller-supplied chain heads or cached roots. */
export function prepareGameTranscriptV1(context: GameCertificateContextV1, scope: GameActiveScopeV1, geometry: GameTranscriptGeometryV1, throughTick: number, transcript: GameTranscriptV1): PreparedGameTranscriptV1;
/** Hash only appended contiguous complete rows and ordered unique removals under
 * the owner's fixed identity/geometry. The aligned parent's cached roots stay
 * unchanged, including its pre-removal frontier. A removal at that frontier may
 * be appended once; partial-frontier owners cannot extend. No prior inputs are
 * retained, and copied/forged owners are rejected. Callers separately authorize
 * adoption; the owner confers no ledger authority or proof verification. */
export function extendGameTranscriptV1(owner: PreparedGameTranscriptV1, throughTick: number, appended: GameTranscriptV1): PreparedGameTranscriptV1;
export interface GameAdapterStateCommitmentBodyV1 {
  readonly scope: GameActiveScopeV1;
  readonly tick: number;
  /** Empty bytes are allowed. The adapter's inner state schema is not decoded. */
  readonly adapter_state: Uint8Array;
}
/** Exact marked 32-byte native Hash value. These are never game384 digests. */
export type GameLedgerHashBytesV1 = Uint8Array;
/** Exact domainless I105 controller identity, checked by the browser account owner.
 * Alias strings, account@domain, trimming, and opaque account bytes are rejected.
 * Both single-key and canonical threshold-controller accounts are supported.
 */
export type GameAccountIdentityV1 = string;
/** Exact NFC name$domain.dataspace; the name is at most 255 UTF-8 bytes and
 * excludes native whitespace, control, bidi-control and reserved characters.
 * Both domain labels must already be canonical. No normalization is performed.
 */
export type GameNftIdentityV1 = string;
export type GameAccessV1 = { readonly kind: "public" } | { readonly kind: "invite"; readonly public_key: Uint8Array };
export type GamePayoutPolicyV1 = { readonly kind: "no_payout" | "equal_winners_or_refund" };
export interface GameManifestV1 {
  readonly version: 1;
  readonly application_id: GameLedgerHashBytesV1;
  readonly profile_id: GameLedgerHashBytesV1;
  readonly application_parameters: Uint8Array;
  readonly min_participants: number;
  readonly max_participants: number;
  readonly batch_ticks: number;
  readonly max_ticks: number;
  readonly max_input_bytes: number;
  readonly max_participant_data_bytes: number;
  readonly access: GameAccessV1;
  readonly payout_policy: GamePayoutPolicyV1;
}
export interface GameResourceReturnPolicyV1 { readonly kind: "return_to_original_owner_at_terminal" }
export interface GameResourceReservationClauseV1 {
  readonly nft_id: GameNftIdentityV1;
  readonly expected_metadata_hash: GameLedgerHashBytesV1;
  readonly role_id: GameLedgerHashBytesV1;
  readonly policy: GameResourceReturnPolicyV1;
}
export interface GameAdmissionBodyV1 {
  readonly version: 1;
  readonly participants: readonly { readonly account: GameAccountIdentityV1; readonly input_key: Uint8Array; readonly application_data: Uint8Array }[];
  readonly wagers: readonly { readonly slot: number; readonly nft_id: GameNftIdentityV1; readonly metadata_hash: GameLedgerHashBytesV1 }[];
  readonly resources: readonly { readonly slot: number; readonly nft_id: GameNftIdentityV1; readonly metadata_hash: GameLedgerHashBytesV1; readonly role_id: GameLedgerHashBytesV1; readonly policy: GameResourceReturnPolicyV1 }[];
}
export interface GameDisputeCommitmentBodyV1 {
  readonly manifest: GameCommitmentLiteralV1;
  /** Explicitly null before Start; never an invented digest of an empty admission. */
  readonly admission: GameCommitmentLiteralV1 | null;
  readonly epoch: GameCertificateEpochV1;
  readonly checkpoint: GameCheckpointCertificateBodyV1 | null;
  readonly checkpoint_history: readonly { readonly epoch: GameCertificateEpochV1; readonly tick: number; readonly transcript_root: GameCommitmentLiteralV1; readonly state_root: GameCommitmentLiteralV1 }[];
  readonly certified_batches: readonly { readonly epoch: GameCertificateEpochV1; readonly start_tick: number; readonly parent_transcript_root: GameCommitmentLiteralV1; readonly frontier_id: GameCommitmentLiteralV1; readonly inputs: readonly Uint8Array[] }[];
  readonly forced_batches: readonly { readonly epoch: GameCertificateEpochV1; readonly start_tick: number; readonly inputs: readonly Uint8Array[]; readonly dnf_slots: Uint8Array; readonly certified_frontier_id: GameCommitmentLiteralV1 | null }[];
}
export interface GameOutcomeCommitmentBodyV1 {
  readonly scope: GameActiveScopeV1;
  readonly outcome: { readonly terminal_tick: number; readonly winner_slots: Uint8Array; readonly result: Uint8Array };
}
/** Invitation approval is separate from wallet spending or resource custody authority. */
export interface GameInvitationCertificateBodyV1 {
  readonly manifest: GameCommitmentLiteralV1;
  readonly wallet: GameAccountIdentityV1;
  readonly input_key: Uint8Array;
  readonly application_data: Uint8Array;
  readonly resources: readonly GameResourceReservationClauseV1[];
}
export interface GameCertificateBodyTypesV1 {
  GameManifestV1: GameManifestV1;
  GameAdmissionBodyV1: GameAdmissionBodyV1;
  GameDisputeCommitmentBodyV1: GameDisputeCommitmentBodyV1;
  GameOutcomeCommitmentBodyV1: GameOutcomeCommitmentBodyV1;
  GameInvitationCertificateBodyV1: GameInvitationCertificateBodyV1;
  GameCommitmentV1: GameCommitmentLiteralV1;
  GameNonceV1: GameNonceLiteralV1;
  GameInputDigestV1: GameCommitmentLiteralV1;
  GameTranscriptRootV1: GameCommitmentLiteralV1;
  GameStateRootV1: GameCommitmentLiteralV1;
  GameManifestCommitmentV1: GameCommitmentLiteralV1;
  GameAdmissionCommitmentV1: GameCommitmentLiteralV1;
  GameDisputeCommitmentV1: GameCommitmentLiteralV1;
  GameOutcomeCommitmentV1: GameCommitmentLiteralV1;
  GameCheckpointIdV1: GameCommitmentLiteralV1;
  GameFrontierIdV1: GameCommitmentLiteralV1;
  GameResourceContentCommitmentV1: GameCommitmentLiteralV1;
  GameActiveScopeV1: GameActiveScopeV1;
  GameInputPreimageV1: GameInputPreimageV1;
  GameInputCommitmentCertificateBodyV1: GameInputCommitmentCertificateBodyV1;
  GameCheckpointCertificateBodyV1: GameCheckpointCertificateBodyV1;
  GameCommitmentSetCertificateBodyV1: GameCommitmentSetCertificateBodyV1;
  GameChallengeCertificateBodyV1: GameChallengeCertificateBodyV1;
  GameTranscriptChainHeadV1: GameCommitmentLiteralV1;
  GameTranscriptGeometryV1: GameTranscriptGeometryV1;
  GameTranscriptSeedBodyV1: GameTranscriptSeedBodyV1;
  GameTranscriptBatchLinkBodyV1: GameTranscriptBatchLinkBodyV1;
  GameTranscriptRemovalLinkBodyV1: GameTranscriptRemovalLinkBodyV1;
  GameTranscriptRootBodyV1: GameTranscriptRootBodyV1;
  GameTranscriptClaimV1: GameTranscriptClaimV1;
  GameAdapterStateCommitmentBodyV1: GameAdapterStateCommitmentBodyV1;
}
export interface GameCertificatePurposeBodiesV1 {
  1: GameInputPreimageV1;
  3: GameAdapterStateCommitmentBodyV1;
  4: GameManifestV1;
  5: GameAdmissionBodyV1;
  6: GameDisputeCommitmentBodyV1;
  7: GameOutcomeCommitmentBodyV1;
  8: GameCheckpointCertificateBodyV1;
  9: GameCommitmentSetCertificateBodyV1;
  11: GameTranscriptSeedBodyV1;
  12: GameTranscriptBatchLinkBodyV1;
  13: GameTranscriptRemovalLinkBodyV1;
  14: GameTranscriptRootBodyV1;
  101: GameInputCommitmentCertificateBodyV1;
  102: GameInputPreimageV1;
  103: GameCommitmentSetCertificateBodyV1;
  104: GameCheckpointCertificateBodyV1;
  105: GameChallengeCertificateBodyV1;
  106: GameInvitationCertificateBodyV1;
}
export type GameCertificateCommitmentPurposeV1 = 1 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 11 | 12 | 13 | 14;
export type GameCertificateSigningPurposeV1 = 101 | 102 | 103 | 104 | 105 | 106;
export function encodeGameCertificateBodyV1<K extends keyof GameCertificateBodyTypesV1>(type: K, body: GameCertificateBodyTypesV1[K]): Uint8Array;
export function decodeGameCertificateBodyV1<K extends keyof GameCertificateBodyTypesV1>(type: K, bytes: Uint8Array): GameCertificateBodyTypesV1[K];
export function encodeGameCertificateFrameV1<P extends keyof GameCertificatePurposeBodiesV1>(context: GameCertificateContextV1, purpose: P, body: GameCertificatePurposeBodiesV1[P]): Uint8Array;
export function decodeGameCertificateFrameV1<P extends keyof GameCertificatePurposeBodiesV1>(bytes: Uint8Array, context: GameCertificateContextV1, purpose: P): GameCertificatePurposeBodiesV1[P];
export function gameCertificateCommitmentV1<P extends GameCertificateCommitmentPurposeV1>(context: GameCertificateContextV1, purpose: P, body: GameCertificatePurposeBodiesV1[P]): GameCommitmentLiteralV1;
/** Malformed/context-mismatched frames throw; invalid signatures return false. */
export function verifyGameCertificateSignatureV1(bytes: Uint8Array, signature: Uint8Array, publicKey: Uint8Array, context: GameCertificateContextV1, purpose: GameCertificateSigningPurposeV1): boolean;
