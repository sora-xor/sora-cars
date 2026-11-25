import type { GameActiveScopeV1 } from "./game-inputs.js";
export type { GameActiveScopeV1 } from "./game-inputs.js";
export type { GameTranscriptV1, GameInputRevealV1, GameInputCommitmentV1 } from "./game-inputs.js";
import type { GameTranscriptV1, GameInputRevealV1, GameInputCommitmentV1 } from "./game-inputs.js";
export * from "./game-resources.js";
import type { GameResourceReservationClauseV1, GameResourceReturnPolicyV1, GameResourceReservationRecordV1 } from "./game-resources.js";
export type GameInstructionNameV1 = 'OpenGameSessionV1' | 'JoinGameSessionV1' | 'StartGameSessionV1' | 'CommitGameCheckpointV1' | 'ChallengeGameSessionV1' | 'CommitGameInputsV1' | 'RevealGameInputsV1' | 'AdvanceGameDeadlineV1' | 'SettleGameSessionV1' | 'ExpireGameSessionV1' | 'ClaimGamePayoutV1' | 'StakeGameItemV1' | 'RegisterExecutionProofProfileV1' | 'VerifyExecutionProofV1';
export type GameAccessV1 = { kind: 'public'; public_key: null } | { kind: 'invite'; public_key: string };
export type GamePayoutPolicyV1 = { kind: 'no_payout' | 'equal_winners_or_refund'; value: null };
export interface GameManifestV1 { version: 1; application_id: string; profile_id: string; application_parameters: number[]; min_participants: number; max_participants: number; batch_ticks: number; max_ticks: number; max_input_bytes: number; max_participant_data_bytes: number; access: GameAccessV1; payout_policy: GamePayoutPolicyV1 }
export interface GameCheckpointV1 { session_id: string; scope: GameActiveScopeV1; epoch: string | number | bigint; tick: number; transcript_root: string; state_root: string; terminal: boolean }
export interface GameSlotSignatureV1 { slot: number; signature: string }
export interface SignedGameCheckpointV1 { checkpoint: GameCheckpointV1; signatures: GameSlotSignatureV1[] }
export interface GameCommitmentSetV1 { session_id: string; scope: GameActiveScopeV1; epoch: string | number | bigint; start_tick: number; parent_transcript_root: string; commitments: string[]; signatures: GameSlotSignatureV1[] }
export interface GamePayoutClaimV1 { slot: number; amount: string; remaining: string }
export interface ClaimGamePayoutV1 { session_id: string; slot: number; destination: string; amount: string }
/** Mandatory wallet-approved debit and immutable game terms; no endpoint-derived defaults. */
export interface JoinGameSessionV1 { session_id: string; input_key: string; application_data: number[]; resources: GameResourceReservationClauseV1[]; invitation: string | null; expected_manifest_commitment: string; expected_asset_definition: string; expected_stake: string }
export interface GameOutcomeV1 { terminal_tick: number; winner_slots: number[]; result: number[] }
/** Native execution384 digest: uppercase hex encoding of six little-endian canonical Goldilocks limbs. */
export interface ExecutionRecordBindingV1 { bytes: string }
export interface ExecutionPublicInputsV1 { network_id: string; session_id: string; source_record_binding: ExecutionRecordBindingV1; manifest_commitment: string; admission_commitment: string; transcript_root: string; dispute_commitment: string; outcome_commitment: string }
export interface ExecutionProofEnvelopeV1 { version: 1; profile_id: string; statement: ExecutionPublicInputsV1; proof_bytes: number[] }
export const GAME_INSTRUCTION_NAMES_V1: readonly GameInstructionNameV1[];
export const GAME_INSTRUCTION_WIRE_IDS_V1: readonly string[];
/** Complete canonical execution envelope and typed settlement payload bound; not a global transaction limit. */
export const EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1: number;
export function encodeGameValueV1(name: string, value: unknown): Uint8Array;
export function decodeGameValueV1(name: string, bytes: Uint8Array): unknown;
export function gameHashLiteralV1(bytes: Uint8Array): string;
export function buildGameInstructionV1<Name extends GameInstructionNameV1>(name: Name, value: GameInstructionPayloadsV1[Name]): { [Key in Name]: GameInstructionPayloadsV1[Key] };
export function buildJoinGameSessionV1(value: JoinGameSessionV1): { JoinGameSessionV1: JoinGameSessionV1 };

export interface GameParticipantV1 { account: string; input_key: string; application_data: number[]; dnf_at_tick: number | null }
export interface GameItemStakeV1 { slot: number; nft_id: string; custody: string; metadata_hash: string; recipient: string | null; claimed: boolean }
export interface StakeGameItemV1 { session_id: string; nft_id: string; expected_manifest_commitment: string }
export interface GameAdmissionParticipantV1 { account: string; input_key: string; application_data: number[] }
export interface GameAdmissionWagerV1 { slot: number; nft_id: string; metadata_hash: string }
export interface GameAdmissionResourceV1 { slot: number; nft_id: string; metadata_hash: string; role_id: string; policy: GameResourceReturnPolicyV1 }
export interface GameAdmissionBodyV1 { version: 1; participants: GameAdmissionParticipantV1[]; wagers: GameAdmissionWagerV1[]; resources: GameAdmissionResourceV1[] }
export function validateGameAdmissionBodyV1(value: GameAdmissionBodyV1): GameAdmissionBodyV1;

export interface GameSessionEventV1 { session_id: string; revision: string | number | bigint; phase: number; dispute_commitment: string; payout_claims: GamePayoutClaimV1[]; item_stakes: GameItemStakeV1[]; resources: GameResourceReservationRecordV1[]; terminal_at_height: string | number | bigint | null }

export const GAME_ADMISSION_MAX_ACCOUNT_ENCODED_BYTES_V1: 32768;
export const GAME_ADMISSION_MAX_NFT_ENCODED_BYTES_V1: 1024;
export const GAME_ADMISSION_MAX_BYTES_V1: number;

export * from "./game-proof-worker.js";

export type GamePhaseV1 = { kind: 'lobby' | 'playing' | 'selecting_checkpoint' | 'forced_commit' | 'forced_reveal' | 'awaiting_proof' | 'settled' | 'cancelled'; value: null };
export interface GameForcedBatchV1 { epoch: string | number | bigint; start_tick: number; inputs: number[][]; dnf_slots: number[]; certified_frontier_id: string | null }
export interface GameCheckpointAnchorV1 { epoch: string | number | bigint; tick: number; transcript_root: string; state_root: string }
export interface GameCertifiedBatchV1 { epoch: string | number | bigint; start_tick: number; parent_transcript_root: string; frontier_id: string; inputs: number[][] }
export interface GameInputOpeningV1 { payload: number[]; nonce: string }
/** Complete canonical consensus record, never a reconstructed view of a session. */
export interface GameSessionRecordV1 {
  version: number;
  network_id: string;
  session_id: string;
  manifest: Omit<GameManifestV1, 'version'> & { version: number };
  profile_id: string;
  manifest_commitment: string;
  asset_definition: string;
  stake: string;
  payout_scale: number;
  custody: string;
  liability: string;
  payout_claims: GamePayoutClaimV1[];
  item_stakes: GameItemStakeV1[];
  resources: GameResourceReservationRecordV1[];
  participants: GameParticipantV1[];
  admission_commitment: string | null;
  phase: GamePhaseV1;
  revision: string | number | bigint;
  epoch: string | number | bigint;
  deadline_height: string | number | bigint;
  checkpoint: SignedGameCheckpointV1 | null;
  pending_certificate: GameCommitmentSetV1 | null;
  next_tick: number;
  input_commitments: (string | null)[];
  input_reveals: (number[] | null)[];
  checkpoint_history: GameCheckpointAnchorV1[];
  certified_batches: GameCertifiedBatchV1[];
  forced_batches: GameForcedBatchV1[];
  dispute_commitment: string;
  verification_id: string | null;
  terminal_at_height: string | number | bigint | null;
  result: GameOutcomeV1 | null;
}
/** Structural transport validation only: does not authenticate finality, signatures or lifecycle legality. */
export function validateGameSessionRecordV1(value: unknown): GameSessionRecordV1;
/** Validates shape and field membership without deriving the native complete-record digest. */
export function validateExecutionRecordBindingV1(value: unknown): ExecutionRecordBindingV1;
/** Offline public-data transport bounds; these do not raise proof/ISI limits. */
export const EXECUTION_RECORD_MAX_BYTES_V1: number;
export const EXECUTION_PROVER_MAX_REQUEST_BYTES_V1: number;

export interface OpenGameSessionV1 { session_id: string; manifest: GameManifestV1; asset_definition: string; stake: string; join_deadline_height: string | number | bigint }
export interface StartGameSessionV1 { session_id: string }
/** Exact original-slot openings for the previously accepted frontier; null requires the consensus dispute path when that frontier is covered. */
export interface CommitGameCheckpointV1 { session_id: string; checkpoint: SignedGameCheckpointV1; frontier: GameCommitmentSetV1 | null; old_frontier_openings: (GameInputOpeningV1 | null)[] | null }
/** The signed challenge binds the active scope derived from the ledger, not caller-supplied fields. */
export interface ChallengeGameSessionV1 { session_id: string; epoch: string | number | bigint; slot: number; signature: string }
export interface CommitGameInputsV1 { input: GameInputCommitmentV1 }
export interface RevealGameInputsV1 { reveal: GameInputRevealV1 }
export interface AdvanceGameDeadlineV1 { session_id: string }
export interface SettleGameSessionV1 { session_id: string; proof: ExecutionProofEnvelopeV1; outcome: GameOutcomeV1 }
export interface ExpireGameSessionV1 { session_id: string }
export interface RegisterExecutionProofProfileV1 { profile_id: string }
export interface VerifyExecutionProofV1 { proof: ExecutionProofEnvelopeV1 }
export interface GameInstructionPayloadsV1 {
  OpenGameSessionV1: OpenGameSessionV1;
  JoinGameSessionV1: JoinGameSessionV1;
  StartGameSessionV1: StartGameSessionV1;
  CommitGameCheckpointV1: CommitGameCheckpointV1;
  ChallengeGameSessionV1: ChallengeGameSessionV1;
  CommitGameInputsV1: CommitGameInputsV1;
  RevealGameInputsV1: RevealGameInputsV1;
  AdvanceGameDeadlineV1: AdvanceGameDeadlineV1;
  SettleGameSessionV1: SettleGameSessionV1;
  ExpireGameSessionV1: ExpireGameSessionV1;
  ClaimGamePayoutV1: ClaimGamePayoutV1;
  StakeGameItemV1: StakeGameItemV1;
  RegisterExecutionProofProfileV1: RegisterExecutionProofProfileV1;
  VerifyExecutionProofV1: VerifyExecutionProofV1;
}
