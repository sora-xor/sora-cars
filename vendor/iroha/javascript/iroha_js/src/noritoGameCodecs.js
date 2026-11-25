import { Buffer } from "buffer";
import { encodeGameCertificateIdentityV1, decodeGameCertificateIdentityV1, canonicalGameCertificateAccountV1 } from "./gameCertificateIdentity.js";
import { GAME_RESOURCE_VALUE_NAMES_V1, encodeGameResourceValueV1, decodeGameResourceValueV1 } from "./noritoGameResourceCodecs.js";
import { CLASSED_RACE_SCHEMAS_V1, CLASSED_RACE_VECTORS_V1, CLASSED_RACE_CLASSES_V1,
  CLASSED_RACE_TRACKS_V1, validateClassedRaceScalarsV1, validateClassedRaceRecordV1 } from "./noritoClassedRaceSchemas.js";

/** Canonical generic game registry with compiled application value adapters. */
export const EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1 = 4 * 1024 * 1024;
/** Public offline prover inputs only; proof and instruction limits are unchanged. */
export const EXECUTION_RECORD_MAX_BYTES_V1 = 16 * 1024 * 1024;
export const EXECUTION_PROVER_MAX_REQUEST_BYTES_V1 = 20 * 1024 * 1024;
const GOLDILOCKS_MODULUS = 0xFFFFFFFF00000001n;
const GAME_PHASES = Object.freeze(["lobby", "playing", "selecting_checkpoint", "forced_commit", "forced_reveal", "awaiting_proof", "settled", "cancelled"]);
export const GAME_ADMISSION_MAX_ACCOUNT_ENCODED_BYTES_V1 = 32768;
export const GAME_ADMISSION_MAX_NFT_ENCODED_BYTES_V1 = 1024;
export const GAME_ADMISSION_MAX_BYTES_V1 = 1024 * 1024;
const RACE_MAX_TICKS_V1 = 8_100;
const RACE_INPUT_BATCH_TICKS_V1 = 6;
const RACE_MAX_STARK_BYTES_V1 = 3_250_000;
const EXECUTION_VALUE_NAMES_V1 = new Set(["ExecutionProofEnvelopeV1", "VerifyExecutionProofV1", "SettleGameSessionV1", "RaceProofPayloadV1"]);
/** Execution-only payload corridor; unrelated native values retain the ordinary bound. */
export function gameValueMaximumBytesV1(name) {
  if (name === "GameSessionRecordV1") return EXECUTION_RECORD_MAX_BYTES_V1;
  if (name === "RaceProverRequestV1") return EXECUTION_PROVER_MAX_REQUEST_BYTES_V1;
  if (["GameVerificationRequestV1", "GameCertifiedSettlementExportRequestV1", "GameCertifiedSettlementDownloadHeaderV1"].includes(name)) return 4096;
  // Public replay transport ceilings do not change instruction admission limits.
  if (name === "GameReplayExportRequestV1") return 16 * 1024 * 1024 + 8192;
  if (name === "GameReplayEvidenceV1") return 16 * 1024 * 1024;
  return EXECUTION_VALUE_NAMES_V1.has(name) ? EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1 : 1024 * 1024;
}
export const GAME_INSTRUCTION_NAMES_V1 = Object.freeze([
  "OpenGameSessionV1", "JoinGameSessionV1", "StartGameSessionV1", "CommitGameCheckpointV1",
  "ChallengeGameSessionV1", "CommitGameInputsV1", "RevealGameInputsV1", "AdvanceGameDeadlineV1",
  "SettleGameSessionV1", "ExpireGameSessionV1", "ClaimGamePayoutV1", "StakeGameItemV1", "RegisterExecutionProofProfileV1", "VerifyExecutionProofV1",
]);
export const GAME_INSTRUCTION_WIRE_IDS_V1 = Object.freeze(
  GAME_INSTRUCTION_NAMES_V1.map((name) => `iroha.instruction.v1::game::${name}`),
);
const TRACKS = Object.freeze(["neon_tokyo", "harbor", "sakura"]);
const fields = (text) => text.split(" ").map((entry) => entry.split(":"));
const SCHEMAS = Object.freeze({
  ...CLASSED_RACE_SCHEMAS_V1,
  GameReplayEvidenceV1: fields("transcript:GameTranscriptV1 current_reveals:gameReplayReveals current_commitments:gameReplayCommitments"),
  GameReplayExportRequestV1: fields("request:GameVerificationRequestV1 evidence:GameReplayEvidenceV1"),
  GameCertifiedSettlementSelectionV1: fields("height:u64 block_hash:hash revision:u64"),
  GameCertifiedSettlementExportRequestV1: fields("version:u16 network_id:hash trusted_context_id:gameContext first_height:u64 source:GameCertifiedSettlementSelectionV1 settled:GameCertifiedSettlementSelectionV1 session_id:hash profile_id:hash expected_entry_hash:hash outcome_commitment:GameCommitmentV1"),
  GameCertifiedSettlementDownloadHeaderV1: fields("version:u16 part_lengths:settlementPartLengths"),
  GameVerificationRequestV1: fields("version:u16 computation:GameComputationV1 network_id:hash trusted_context_id:gameContext first_height:u64 target_height:u64 target_block_hash:hash session_id:hash revision:u64 mode:GameRecordModeV1 terminal_tick:u32"),
  GameExecutionReportV1: fields("computation:GameComputationV1 network_id:hash session_id:hash revision:u64 carrier_height:u64 carrier_hash:hash state_origin:hash snapshot_root:hash association_digest:hash implementation_id:hash outcome:GameOutcomeV1 components:u32 proofs:u32 proof_bytes:u64 replay_bytes:u64 record_finality_verified:bool computation_verified:bool latest_freshness_verified:bool removal_transitions_replayed:bool profile_registered:bool settlement_verified:bool composed_security_qualified:bool"),
  RaceInputFrameV1: fields("tick:u32 controls:frameControls"),
  RaceDnfEventV1: fields("tick:u32 slots:slots"),
  RaceReplayV1: fields("track:track player_count:u8 frames:frames dnf_events:dnfEvents"),
  RaceCarStateV1: fields("progress_mm:i64 lateral_mm:i32 speed_mm_per_tick:i32 lateral_velocity_mm_per_tick:i32 boost_energy:u16 finish_tick:optionalU32 dnf_tick:optionalU32"),
  RaceStateV1: fields("tick:u32 track:track cars:cars"),
  RaceStandingV1: fields("slot:u8 finish_tick:optionalU32 dnf_tick:optionalU32 progress_mm:i64"),
  RaceResultV1: fields("ticks:u32 standings:standings winners:slots"),
  RaceSettlementStandingV1: fields("slot:u8 finish_tick:optionalU32 dnf_tick:optionalU32 progress_mm:i64"),
  RaceSettlementResultV1: fields("physical_terminal_tick:u32 accepted_through_tick:u32 standings:settlementStandings winners:slots"),
  RaceProverRequestV1: fields("history_evidence:GameReplayEvidenceV1 source_record:GameSessionRecordV1 observation_height:u64 replay:RaceReplayV1 checkpoint_states:raceCheckpointStates"),
  RaceProofPayloadV1: fields("history_evidence:GameReplayEvidenceV1 accepted_through_tick:u32 manifest:GameManifestV1 admission:GameAdmissionBodyV1 outcome:GameOutcomeV1 relation_inputs:RacePublicInputsV1 replay:RaceReplayV1 final_state:RaceStateV1 checkpoint_states:raceCheckpointStates stark_bytes:stark"),
  RacePublicInputsV1: fields("network_id:hash race_id:hash admission_commitment:gameCommitment rules_hash:hash track:track transcript_root:gameCommitment dispute_commitment:gameCommitment result:RaceResultV1"),
  GameManifestV1: fields("version:u16 application_id:hash profile_id:hash application_parameters:opaque min_participants:u8 max_participants:u8 batch_ticks:u16 max_ticks:u32 max_input_bytes:u16 max_participant_data_bytes:u16 access:access payout_policy:payout"),
  GameActiveScopeV1: fields("manifest:gameCommitment admission:gameCommitment"),
  GameCheckpointV1: fields("session_id:hash scope:GameActiveScopeV1 epoch:u64 tick:u32 transcript_root:gameCommitment state_root:gameCommitment terminal:bool"),
  GameSlotSignatureV1: fields("slot:u8 signature:signature"),
  SignedGameCheckpointV1: fields("checkpoint:GameCheckpointV1 signatures:gameSignatures"),
  GameCommitmentSetV1: fields("session_id:hash scope:GameActiveScopeV1 epoch:u64 start_tick:u32 parent_transcript_root:gameCommitment commitments:gameDigests signatures:gameSignatures"),
  GameInputCommitmentV1: fields("session_id:hash scope:GameActiveScopeV1 epoch:u64 start_tick:u32 slot:u8 commitment:gameCommitment signature:signature"),
  GameInputRevealV1: fields("session_id:hash scope:GameActiveScopeV1 epoch:u64 start_tick:u32 slot:u8 payload:opaque nonce:gameNonce"),
  GameTranscriptBatchV1: fields("start_tick:u32 inputs:gameInputs"),
  GameDnfEventV1: fields("tick:u32 slots:gameSlots"),
  GameTranscriptV1: fields("batches:gameBatches dnf_events:gameDnfEvents"),
  GameParticipantV1: fields("account:account input_key:key application_data:opaque dnf_at_tick:optionalU32"),
  GameItemStakeV1: fields("slot:u8 nft_id:nft custody:account metadata_hash:hash recipient:optionalAccount claimed:bool"),
  GameAdmissionParticipantV1: fields("account:admissionAccount input_key:admissionKey application_data:admissionData"),
  GameAdmissionWagerV1: fields("slot:u8 nft_id:admissionNft metadata_hash:hash"),
  GameAdmissionResourceV1: fields("slot:u8 nft_id:admissionNft metadata_hash:hash role_id:hash policy:GameResourceReturnPolicyV1"),
  GameAdmissionBodyV1: fields("version:u16 participants:admissionParticipants wagers:admissionWagers resources:admissionResources"),
  GameSessionEventV1: fields("session_id:hash revision:u64 phase:u8 dispute_commitment:gameCommitment payout_claims:gameClaims item_stakes:gameItems resources:records terminal_at_height:optionalU64"),
  GamePayoutClaimV1: fields("slot:u8 amount:quantity remaining:quantity"),
  GameOutcomeV1: fields("terminal_tick:u32 winner_slots:gameSlots result:opaque"),
  GameForcedBatchV1: fields("epoch:u64 start_tick:u32 inputs:gameRetainedInputs dnf_slots:gameSlots certified_frontier_id:optionalGameCommitment"),
  GameCheckpointAnchorV1: fields("epoch:u64 tick:u32 transcript_root:gameCommitment state_root:gameCommitment"),
  GameCertifiedBatchV1: fields("epoch:u64 start_tick:u32 parent_transcript_root:gameCommitment frontier_id:gameCommitment inputs:gameRetainedInputs"),
  GameInputOpeningV1: fields("payload:inputPayload nonce:gameNonce"),
  // Complete record transport retains bounded inconsistent records too. Native
  // lifecycle and proof validation decide admissibility; codecs never do so.
  GameSessionRecordV1: fields("version:u16 network_id:hash session_id:hash manifest:GameManifestV1 profile_id:hash manifest_commitment:gameCommitment asset_definition:asset stake:quantity payout_scale:u32 custody:account liability:quantity payout_claims:gameClaims item_stakes:gameItems resources:records participants:gameParticipants admission_commitment:optionalGameCommitment phase:GamePhaseV1 revision:u64 epoch:u64 deadline_height:u64 checkpoint:optionalGameCheckpoint pending_certificate:optionalGameFrontier next_tick:u32 input_commitments:gameOptionalDigests input_reveals:gameOptionalInputs checkpoint_history:gameCheckpointHistory certified_batches:gameCertifiedBatches forced_batches:gameForcedBatches dispute_commitment:gameCommitment verification_id:optionalHash terminal_at_height:optionalU64 result:optionalGameOutcome"),
  GameResourceReservationRecordV1: fields("slot:u8 nft_id:nft metadata_hash:hash role_id:hash policy:GameResourceReturnPolicyV1 original_owner:account custody:account reserved_at_height:u64 released_at_height:optionalU64"),
  ExecutionRecordBindingV1: fields("bytes:execution384"),
  ExecutionPublicInputsV1: fields("network_id:hash session_id:hash source_record_binding:ExecutionRecordBindingV1 manifest_commitment:gameCommitment admission_commitment:gameCommitment transcript_root:gameCommitment dispute_commitment:gameCommitment outcome_commitment:gameCommitment"),
  ExecutionProofEnvelopeV1: fields("version:u16 profile_id:hash statement:ExecutionPublicInputsV1 proof_bytes:proof"),
  OpenGameSessionV1: fields("session_id:hash manifest:GameManifestV1 asset_definition:asset stake:quantity join_deadline_height:u64"),
  JoinGameSessionV1: fields("session_id:hash input_key:key application_data:opaque resources:clauses invitation:optionalSignature expected_manifest_commitment:gameCommitment expected_asset_definition:asset expected_stake:quantity"),
  StartGameSessionV1: fields("session_id:hash"),
  CommitGameCheckpointV1: fields("session_id:hash checkpoint:SignedGameCheckpointV1 frontier:optionalGameFrontier old_frontier_openings:optionalGameOpenings"),
  ChallengeGameSessionV1: fields("session_id:hash epoch:u64 slot:u8 signature:signature"),
  CommitGameInputsV1: fields("input:GameInputCommitmentV1"),
  RevealGameInputsV1: fields("reveal:GameInputRevealV1"),
  AdvanceGameDeadlineV1: fields("session_id:hash"),
  SettleGameSessionV1: fields("session_id:hash proof:ExecutionProofEnvelopeV1 outcome:GameOutcomeV1"),
  ExpireGameSessionV1: fields("session_id:hash"),
  StakeGameItemV1: fields("session_id:hash nft_id:nft expected_manifest_commitment:gameCommitment"),
  ClaimGamePayoutV1: fields("session_id:hash slot:u8 destination:account amount:quantity"),
  RegisterExecutionProofProfileV1: fields("profile_id:hash"),
  VerifyExecutionProofV1: fields("proof:ExecutionProofEnvelopeV1"),
});
const VECTORS = Object.freeze({
  ...CLASSED_RACE_VECTORS_V1,
  settlementPartLengths: ["u64", 7],
  raceCheckpointStates: ["RaceStateV1", RACE_MAX_TICKS_V1 / RACE_INPUT_BATCH_TICKS_V1],
  gameReplayReveals: ["GameInputRevealV1", 255], gameReplayCommitments: ["GameInputCommitmentV1", 255],
  records: ["GameResourceReservationRecordV1", 128],
  gameOptionalDigests: ["optionalGameCommitment", 32], gameOptionalInputs: ["optionalInput", 32],
  gameCheckpointHistory: ["GameCheckpointAnchorV1", 4096], gameCertifiedBatches: ["GameCertifiedBatchV1", 4096], gameForcedBatches: ["GameForcedBatchV1", 4096],
  gameRetainedInputs: ["inputPayload", 32], gameOpenings: ["optionalGameOpening", 32],
  gameClaims: ["GamePayoutClaimV1", 32],
  admissionParticipants: ["GameAdmissionParticipantV1", 32], admissionWagers: ["GameAdmissionWagerV1", 32], admissionResources: ["GameAdmissionResourceV1", 128],
  gameParticipants: ["GameParticipantV1", 32], gameItems: ["GameItemStakeV1", 32],
  gameSignatures: ["GameSlotSignatureV1", 255], gameDigests: ["gameCommitment", 32], gameInputs: ["opaque", 255],
  gameBatches: ["GameTranscriptBatchV1", 65535], gameDnfEvents: ["GameDnfEventV1", 255], gameSlots: ["u8", 255],
  frameControls: ["control", 8], frames: ["RaceInputFrameV1", RACE_MAX_TICKS_V1],
  standings: ["RaceStandingV1", 8], settlementStandings: ["RaceSettlementStandingV1", 8], slots: ["slot", 8], cars: ["RaceCarStateV1", 8], dnfEvents: ["RaceDnfEventV1", 8],
});
function exactObject(value, names, context) {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${context} must be a plain object`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || names.some((key) => !keys.includes(key))) throw new TypeError(`${context} has missing or unknown fields`);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(`${context}.${name} must be an enumerable data property`);
  }
}
function integer(value, bits, signed, context) {
  if (!(typeof value === "number" && Number.isSafeInteger(value)) && !(typeof value === "string" && (signed ? /^(?:0|-?[1-9][0-9]*)$/ : /^(?:0|[1-9][0-9]*)$/).test(value)) && typeof value !== "bigint") throw new TypeError(`${context} must be a canonical integer`);
  const n = BigInt(value), limit = 1n << BigInt(signed ? bits - 1 : bits);
  if (n < (signed ? -limit : 0n) || n >= limit) throw new RangeError(`${context} exceeds ${signed ? "i" : "u"}${bits}`);
  return n;
}
function bytes(value, context, max, length = null) {
  if (typeof value !== "string" || !/^(?:[0-9A-F]{2})+$/.test(value) || value.length > max * 2 || (length !== null && value.length !== length * 2)) throw new TypeError(`${context} must be bounded canonical uppercase hexadecimal bytes`);
  return Buffer.from(value, "hex");
}
function validateAdmission(value) {
  if (Number(value.version) !== 1) throw new TypeError("admission version must be one");
  const accounts = new Set(), keys = new Set(), nfts = new Set(), counts = new Map();
  for (const participant of value.participants) {
    const identity = Buffer.from(canonicalGameCertificateAccountV1(participant.account).encoded).toString("hex");
    if (accounts.has(identity) || keys.has(participant.input_key)) throw new TypeError("admission participants require unique wallets and input keys");
    accounts.add(identity); keys.add(participant.input_key);
  }
  let priorSlot = -1, priorRole;
  const item = entry => {
    if (Number(entry.slot) >= value.participants.length || nfts.has(entry.nft_id)) throw new TypeError("admission item requires an existing slot and a unique NFT");
    nfts.add(entry.nft_id);
  };
  for (const wager of value.wagers) {
    item(wager);
    if (Number(wager.slot) <= priorSlot) throw new TypeError("admission wagers must be strictly ordered by slot");
    priorSlot = Number(wager.slot);
  }
  priorSlot = -1;
  for (const resource of value.resources) {
    item(resource);
    const slot = Number(resource.slot), role = resource.role_id.slice(5, 69);
    if (slot < priorSlot || slot === priorSlot && role <= priorRole) throw new TypeError("admission resources must be strictly ordered by slot and role");
    counts.set(slot, (counts.get(slot) ?? 0) + 1);
    if (counts.get(slot) > 4) throw new TypeError("admission exceeds four resources per participant");
    priorSlot = slot; priorRole = role;
  }
}
function validateRecord(name, value, context) {
  if (completeRecordContext(context)) return;
  validateClassedRaceRecordV1(name, value);
  if (name === "GameVerificationRequestV1") {
    if (Number(value.version) !== 1) throw new RangeError("GameVerificationRequestV1.version must be 1");
    if (BigInt(value.first_height) === 0n || BigInt(value.target_height) < BigInt(value.first_height)) throw new RangeError("game verification requires an ordered nonzero height interval");
  }
  if (name === "GameCertifiedSettlementExportRequestV1") {
    if (Number(value.version) !== 1 || BigInt(value.first_height) === 0n || BigInt(value.source.height) < BigInt(value.first_height) || BigInt(value.settled.height) <= BigInt(value.source.height) || BigInt(value.settled.height) - BigInt(value.first_height) >= 65536n) throw new RangeError("settlement request requires version one and ordered bounded historical heights");
  }
  if (name === "GameCertifiedSettlementDownloadHeaderV1" && (Number(value.version) !== 1 || value.part_lengths.length !== 7 || value.part_lengths.some(length => BigInt(length) <= 0n))) throw new RangeError("settlement header requires exactly seven positive lengths and version one");
  if (name === "GameAdmissionBodyV1") validateAdmission(value);

  if ((name === "GameManifestV1" || name === "ExecutionProofEnvelopeV1") && Number(value.version) !== 1) throw new RangeError(`${name}.version must be 1`);
  if (name === "GameManifestV1" && (Number(value.max_participants) === 0 || Number(value.batch_ticks) === 0 || Number(value.max_ticks) === 0 || Number(value.max_input_bytes) === 0)) throw new RangeError("Game manifest bounds must be positive");
  if (name.startsWith("Race") && Object.hasOwn(value, "slot") && Number(value.slot) > 7) throw new RangeError(`${name}.slot must be 0..7`);
  for (const field of ["tick", "ticks", "start_tick"]) if (name.startsWith("Race") && Object.hasOwn(value, field) && Number(value[field]) > RACE_MAX_TICKS_V1) throw new RangeError(`${name}.${field} exceeds the race tick limit`);
  if (name === "RaceReplayV1" && (Number(value.player_count) < 1 || Number(value.player_count) > 8 || value.frames.some((frame, index) => Number(frame.tick) !== index || frame.controls.length !== Number(value.player_count)))) throw new RangeError("Race replay frames must be consecutive and match the roster size");
  if (Object.hasOwn(value, "signatures") && value.signatures.some((item, index, all) => index > 0 && Number(item.slot) <= Number(all[index - 1].slot))) throw new RangeError("Race signatures must be unique and ordered by slot");
}

function publicEvidenceContext(context) {
  return context === "GameReplayEvidenceV1" || context.startsWith("GameReplayEvidenceV1.")
    || ["GameReplayExportRequestV1.evidence", "RaceProverRequestV1.history_evidence", "RaceProofPayloadV1.history_evidence"].some(prefix => context === prefix || context.startsWith(prefix + "."));
}
function completeRecordContext(context) {
  return context === "GameSessionRecordV1" || context.startsWith("GameSessionRecordV1.")
    || context === "RaceProverRequestV1.source_record" || context.startsWith("RaceProverRequestV1.source_record.");
}
function contextMaximum(type, context) {
  return completeRecordContext(context) || publicEvidenceContext(context) ? EXECUTION_RECORD_MAX_BYTES_V1 : gameValueMaximumBytesV1(type);
}
function vectorMaximum(type, maximum, context) {
  if (completeRecordContext(context)) {
    if (["gameSignatures", "gameDigests", "gameInputs", "gameSlots"].includes(type)) return 32;
    return maximum;
  }
  return publicEvidenceContext(context) ? EXECUTION_RECORD_MAX_BYTES_V1 : maximum;
}
function opaqueMaximum(type, context) {
  if (type === "inputPayload") return 4096;
  if (completeRecordContext(context)) {
    return context.endsWith(".application_parameters") || context.endsWith(".result.result") ? 65536 : 4096;
  }
  return publicEvidenceContext(context) ? EXECUTION_RECORD_MAX_BYTES_V1 : type === "admissionData" ? 4096 : type === "proof" ? EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1 : type === "stark" ? RACE_MAX_STARK_BYTES_V1 : 512 * 1024;
}
function denseArray(value, maximum, context) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) throw new RangeError(`${context} must be a bounded dense array`);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${context} requires dense data elements`);
  }
}
function retainedInputBound(record, context) {
  // Bound aggregate allocation before encoding any of the nested input rows.
  denseArray(record.certified_batches, 4096, `${context}.certified_batches`);
  denseArray(record.forced_batches, 4096, `${context}.forced_batches`);
  if (record.certified_batches.length + record.forced_batches.length > 4096) throw new RangeError(`${context} exceeds combined retained batch bound`);
  let total = 0;
  for (const [name, fields] of [
    ["certified_batches", ["epoch", "start_tick", "parent_transcript_root", "frontier_id", "inputs"]],
    ["forced_batches", ["epoch", "start_tick", "inputs", "dnf_slots", "certified_frontier_id"]],
  ]) for (const batch of record[name]) {
    exactObject(batch, fields, `${context}.${name}`);
    denseArray(batch.inputs, 32, `${context}.${name}.inputs`);
    for (const input of batch.inputs) {
      if (!Array.isArray(input) || input.length > 4096) throw new RangeError(`${context} exceeds an input payload bound`);
      total += input.length;
      if (total > 4_194_304) throw new RangeError(`${context} exceeds aggregate retained input bytes`);
    }
  }
}
function bindingBytes(value, context) {
  const raw = bytes(value, context, 48, 48);
  for (let offset = 0; offset < 48; offset += 8) {
    if (raw.readBigUInt64LE(offset) >= GOLDILOCKS_MODULUS) throw new RangeError(`${context} requires six canonical Goldilocks limbs`);
  }
  return raw;
}

const TYPED_GAME_COMMITMENTS = new Set(["GameInputDigestV1", "GameTranscriptRootV1", "GameStateRootV1", "GameManifestCommitmentV1", "GameAdmissionCommitmentV1", "GameDisputeCommitmentV1", "GameOutcomeCommitmentV1", "GameCheckpointIdV1", "GameFrontierIdV1", "GameResourceContentCommitmentV1"]);
function gameLiteral(value, prefix, size, context) {
  if (typeof value !== "string" || !value.startsWith(prefix) || value.length !== prefix.length + size * 2
      || !/^[0-9A-F]+$/.test(value.slice(prefix.length))) throw new TypeError(`${context} requires an exact ${prefix} literal`);
  return Buffer.from(value.slice(prefix.length), "hex");
}
function gameLiteralType(type) {
  if (type === "gameCommitment" || TYPED_GAME_COMMITMENTS.has(type)) return ["game384:", 48, 2];
  if (type === "GameCommitmentV1") return ["game384:", 48, 1];
  if (type === "gameNonce" || type === "GameNonceV1") return ["nonce32:", 32, 1];
  return null;
}

/** Build codecs from the canonical Norito primitives; never use a generic JSON escape hatch. */
export function createNoritoGameCodecs(h) {
  function encode(type, value, context = type) {
    const literal = gameLiteralType(type);
    if (literal) {
      let encoded = gameLiteral(value, literal[0], literal[1], context);
      for (let i = 0; i < literal[2]; i++) encoded = h.encodeStructValue([[encoded]]);
      return encoded;
    }
    if (GAME_RESOURCE_VALUE_NAMES_V1.includes(type) && (!completeRecordContext(context) || type === "GameResourceReturnPolicyV1")) return encodeGameResourceValueV1(type, value);
    if (Object.hasOwn(SCHEMAS, type)) {
      const schema = SCHEMAS[type];
      exactObject(value, schema.map(([name]) => name), context);
      validateClassedRaceScalarsV1(type, value);
      if (type === "GameForcedBatchV1" && value.certified_frontier_id === undefined) throw new TypeError(`${context}.certified_frontier_id requires an explicit value or null`);
      if (type === "GameSessionRecordV1") retainedInputBound(value, context);
      const payload = h.encodeStructValue(schema.map(([name, fieldType]) => [encode(fieldType, value[name], `${context}.${name}`)]));
      if (payload.length > contextMaximum(type, context)) throw new RangeError(`${context} exceeds its compiled payload limit`);
      validateRecord(type, value, context);
      return payload;
    }
    if (Object.hasOwn(VECTORS, type)) {
      const [element, ordinaryMaximum] = VECTORS[type];
      // Public evidence preserves generic native Vec values. Encoded frame bounds
      // apply independently; instruction-path participant bounds remain unchanged.
      const maximum = vectorMaximum(type, ordinaryMaximum, context);
      denseArray(value, maximum, context);
      // Native Vec<u8> is a packed byte vector, including winner and DNF slots.
      // It has no per-element field-length prefix, unlike other Norito vectors.
      if (element === "u8" || element === "slot") return h.encodeByteVecValue(Buffer.from(value.map((item, index) => encode(element, item, `${context}[${index}]`)[0])), context);
      return h.encodeNoritoVec(value, (item, index) => encode(element, item, `${context}[${index}]`));
    }
    if ((completeRecordContext(context) || context.startsWith("RaceProverRequestV1.")) && value === undefined) throw new TypeError(`${context} requires an explicit value or null`);
    switch (type) {
      case "gameContext": return h.encodeStructValue([[encode("hash", value, context)]]);
      case "GameComputationV1": case "GameRecordModeV1": case "GamePhaseV1": {
        exactObject(value, ["kind", "value"], context);
        const kinds = type === "GamePhaseV1" ? GAME_PHASES : type === "GameComputationV1" ? ["street", "stock_race"] : ["selection", "archived_settled"];
        const tag = kinds.indexOf(value.kind);
        if (tag < 0 || value.value !== null) throw new TypeError(`${context} requires a known unit variant`);
        return h.encodeU32Value(tag, context);
      }
      case "admissionKey": {
        const encoded = encode("key", value, context);
        if (decode("key", encoded, context) !== value) throw new TypeError(`${context} requires a canonical Ed25519 key`);
        return encoded;
      }
      case "admissionAccount": case "admissionNft": {
        const maximum = type === "admissionAccount" ? 16384 : 512;
        if (typeof value !== "string" || value.length > maximum || Buffer.byteLength(value, "utf8") > maximum) throw new TypeError(`${context} exceeds native identifier byte bound`);
        const base = type === "admissionAccount" ? "account" : "nft", encoded = encode(base, value, context);
        if (encoded.length > (type === "admissionAccount" ? GAME_ADMISSION_MAX_ACCOUNT_ENCODED_BYTES_V1 : GAME_ADMISSION_MAX_NFT_ENCODED_BYTES_V1)) throw new TypeError(`${context} exceeds native encoded identifier bound`);
        if (decode(base, encoded, context) !== value) throw new TypeError(`${context} requires a canonical identifier`);
        return encoded;
      }
      case "execution384": {
        // Native derived [u8; 48] fields are exactly 48 raw bytes; the
        // enclosing struct supplies the one field-length prefix.
        return bindingBytes(value, context);
      }
      case "hash": return h.encodeEscrowIdValue(value, context);
      case "asset": {
        const encoded = h.encodeAssetDefinitionIdValue(value, context);
        if (completeRecordContext(context) && encoded.length > 32768) throw new RangeError(`${context} exceeds native encoded identifier bound`);
        return encoded;
      }
      case "nft": {
        const encoded = Buffer.from(encodeGameCertificateIdentityV1("nftId", value));
        if (completeRecordContext(context) && encoded.length > 1024) throw new RangeError(`${context} exceeds native encoded identifier bound`);
        return encoded;
      }
      case "account": {
        const encoded = Buffer.from(encodeGameCertificateIdentityV1("accountId", value));
        if (completeRecordContext(context) && encoded.length > 32768) throw new RangeError(`${context} exceeds native encoded identifier bound`);
        return encoded;
      }
      case "quantity": return h.encodeQuantityValue(value, context);
      case "bool": return h.encodeBoolValue(value, context);
      case "u8": case "u16": case "u32": case "u64": {
        const n = integer(value, Number(type.slice(1)), false, context);
        return h[`encode${type.toUpperCase()}Value`](n, context);
      }
      case "i32": case "i64": {
        const bits = Number(type.slice(1)), n = integer(value, bits, true, context), result = Buffer.alloc(bits / 8);
        if (bits === 32) result.writeInt32LE(Number(n)); else result.writeBigInt64LE(n);
        return result;
      }
      case "slot": if (Number(integer(value, 8, false, context)) > 7) throw new RangeError(`${context} exceeds slot 7`); return h.encodeU8Value(value, context);
      case "control": if (Number(integer(value, 16, false, context)) > 63) throw new RangeError(`${context} has undefined control bits`); return h.encodeU16Value(value, context);
      case "ClassedRaceClassV1": case "ClassedRaceTrackV1": case "RaceTrackV1": case "track": {
        exactObject(value, ["kind", "value"], context);
        if (value.value !== null) throw new TypeError(`${context}.value must be null for unit tracks`);
        const catalog = type === "ClassedRaceClassV1" ? CLASSED_RACE_CLASSES_V1
          : type === "ClassedRaceTrackV1" ? CLASSED_RACE_TRACKS_V1 : TRACKS;
        const index = catalog.indexOf(value.kind);
        if (index < 0) throw new TypeError(`${context} must name a compiled track`);
        return h.encodeU32Value(index, context);
      }
      case "key": {
        const key = h.parsePublicKeyLiteral(value, context);
        if (!completeRecordContext(context) && key.curve !== 1) throw new TypeError(`${context} must use Ed25519`);
        if (completeRecordContext(context) && key.publicKey.length > 32768) throw new RangeError(`${context} exceeds native key bound`);
        return h.encodePublicKeyValue(key, context);
      }
      case "signature": {
        if (publicEvidenceContext(context)) {
          if (typeof value !== "string" || !/^(?:[0-9A-F]{2})*$/.test(value) || value.length > 32 * 1024 * 1024) throw new TypeError(`${context} requires bounded canonical opaque signature bytes`);
          return h.encodeConstVecU8Value(Buffer.from(value, "hex"));
        }
        return h.encodeConstVecU8Value(bytes(value, context, 64, 64));
      }
      case "inputPayload": case "admissionData": case "OpaqueBytes": case "opaque": case "proof": case "stark": {
        const maximum = opaqueMaximum(type, context);
        if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1 || type === "proof" && value.length === 0 || value.length > maximum) throw new TypeError(`${context} must be a bounded byte array`);
        for (let index = 0; index < value.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || !Number.isInteger(descriptor.value) || descriptor.value < 0 || descriptor.value > 255) throw new TypeError(`${context} must contain only dense canonical bytes`);
        }
        return h.encodeByteVecValue(Buffer.from(value), context);
      }
      case "access": {
        if (value?.kind === "public") { exactObject(value, ["kind", "public_key"], context); if (value.public_key !== null) throw new TypeError(`${context}.public_key must be null for public admission`); return h.encodeEnumTagValue(0); }
        exactObject(value, ["kind", "public_key"], context);
        if (value.kind !== "invite") throw new TypeError(`${context} has an unknown admission policy`);
        return h.encodeEnumTagValue(1, () => encode("key", value.public_key, context));
      }
      case "payout": {
        exactObject(value, ["kind", "value"], context);
        if (value.value !== null) throw new TypeError(`${context}.value must be null for unit payout policies`);
        const index = ["no_payout", "equal_winners_or_refund"].indexOf(value.kind);
        if (index < 0) throw new TypeError(`${context} has an unknown payout policy`);
        return h.encodeEnumTagValue(index);
      }
      case "optionalGameOpenings":
        if (value === undefined) throw new TypeError(`${context} requires an explicit value or null`);
        return h.encodeOptionValue(value, inner => encode("gameOpenings", inner, context), context);
      case "optionalGameOpening":
        if (value === undefined) throw new TypeError(`${context} requires an explicit value or null`);
        return h.encodeOptionValue(value, inner => encode("GameInputOpeningV1", inner, context), context);
      case "optionalGameCheckpoint": return h.encodeOptionValue(value, inner => encode("SignedGameCheckpointV1", inner, context), context);
      case "optionalGameCommitment": return h.encodeOptionValue(value, inner => encode("gameCommitment", inner, context), context);
      case "optionalHash": return h.encodeOptionValue(value, inner => encode("hash", inner, context), context);
      case "optionalInput": return h.encodeOptionValue(value, inner => encode("opaque", inner, context), context);
      case "optionalGameOutcome": return h.encodeOptionValue(value, inner => encode("GameOutcomeV1", inner, context), context);
      case "optionalAccount": return h.encodeOptionValue(value, inner => encode("account", inner, context), context);
      case "optionalSignature": return h.encodeOptionValue(value, inner => encode("signature", inner, context), context);
      case "optionalGameFrontier": return h.encodeOptionValue(value, inner => encode("GameCommitmentSetV1", inner, context), context);
      case "optionalU64": return h.encodeOptionValue(value, inner => encode("u64", inner, context), context);
      case "optionalU32": return h.encodeOptionValue(value, (inner) => encode("u32", inner, context), context);
      default: throw new TypeError(`Unregistered native race type ${type}`);
    }
  }
  function decode(type, payload, context = type) {
    const literal = gameLiteralType(type);
    if (literal) {
      let raw = payload;
      for (let i = 0; i < literal[2]; i++) raw = h.decodeStructFields(raw, context, ["0"])["0"];
      if (raw.length !== literal[1]) throw new TypeError(`${context} has an invalid literal width`);
      return literal[0] + raw.toString("hex").toUpperCase();
    }
    if (GAME_RESOURCE_VALUE_NAMES_V1.includes(type) && (!completeRecordContext(context) || type === "GameResourceReturnPolicyV1")) return decodeGameResourceValueV1(type, payload);
    let value;
    if (Object.hasOwn(SCHEMAS, type)) {
      if (payload.length > contextMaximum(type, context)) throw new RangeError(`${context} exceeds its compiled payload limit`);
      const schema = SCHEMAS[type], parts = h.decodeStructFields(payload, context, schema.map(([name]) => name));
      value = Object.fromEntries(schema.map(([name, fieldType]) => [name, decode(fieldType, parts[name], `${context}.${name}`)]));
      if (type === "GameSessionRecordV1") retainedInputBound(value, context);
      validateRecord(type, value, context);
      return value;
    }
    if (Object.hasOwn(VECTORS, type)) {
      const [element, ordinaryMaximum] = VECTORS[type];
      // Public evidence preserves generic native Vec values. Encoded frame bounds
      // apply independently; instruction-path participant bounds remain unchanged.
      const maximum = vectorMaximum(type, ordinaryMaximum, context);
      if (element === "u8" || element === "slot") return Array.from(h.decodeByteVecValue(payload, context, maximum), (item, index) => decode(element, Buffer.of(item), `${context}[${index}]`));
      return h.decodeNoritoVec(payload, (item, index) => decode(element, item, `${context}[${index}]`), context, maximum);
    }
    switch (type) {
      case "gameContext": return decode("hash", h.decodeStructFields(payload, context, ["0"])["0"], context);
      case "GameComputationV1": case "GameRecordModeV1": case "GamePhaseV1": {
        const kinds = type === "GamePhaseV1" ? GAME_PHASES : type === "GameComputationV1" ? ["street", "stock_race"] : ["selection", "archived_settled"];
        const kind = kinds[h.decodeU32Value(payload, context)];
        if (!kind) throw new TypeError(`${context} has an unknown unit variant`);
        return { kind, value: null };
      }
      case "admissionKey": return decode("key", payload, context);
      case "admissionAccount": case "admissionNft": {
        const value = decode(type === "admissionAccount" ? "account" : "nft", payload, context);
        encode(type, value, context); return value;
      }
      case "execution384": {
        if (payload.length !== 48) throw new TypeError(`${context} requires exactly 48 packed bytes`);
        const value = payload.toString("hex").toUpperCase();
        bindingBytes(value, context); return value;
      }
      case "hash": return h.decodeEscrowIdValue(payload, context);
      case "asset": {
        if (completeRecordContext(context) && payload.length > 32768) throw new RangeError(`${context} exceeds native encoded identifier bound`);
        return h.decodeAssetDefinitionIdValue(payload, context);
      }
      case "nft": {
        if (completeRecordContext(context) && payload.length > 1024) throw new RangeError(`${context} exceeds native encoded identifier bound`);
        return decodeGameCertificateIdentityV1("nftId", payload, { elements: 65536 });
      }
      case "account": {
        if (completeRecordContext(context) && payload.length > 32768) throw new RangeError(`${context} exceeds native encoded identifier bound`);
        return decodeGameCertificateIdentityV1("accountId", payload, { elements: 65536 });
      }
      case "quantity": return h.decodeQuantityValue(payload, context);
      case "bool": return h.decodeBoolValue(payload, context);
      case "u8": case "u16": case "u32": case "u64": return h[`decode${type.toUpperCase()}Value`](payload, context);
      case "i32": case "i64": {
        if (payload.length !== Number(type.slice(1)) / 8) throw new TypeError(`${context} has invalid signed integer width`);
        if (type === "i32") return payload.readInt32LE();
        const signed = payload.readBigInt64LE();
        // Match native JSON integers where JS represents them exactly. Preserve
        // all remaining i64 values as canonical decimal strings, never rounding.
        return signed >= BigInt(Number.MIN_SAFE_INTEGER) && signed <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(signed) : signed.toString();
      }
      case "slot": value = h.decodeU8Value(payload, context); encode(type, value, context); return value;
      case "control": value = h.decodeU16Value(payload, context); encode(type, value, context); return value;
      case "ClassedRaceClassV1": case "ClassedRaceTrackV1": case "RaceTrackV1": case "track": {
        const catalog = type === "ClassedRaceClassV1" ? CLASSED_RACE_CLASSES_V1
          : type === "ClassedRaceTrackV1" ? CLASSED_RACE_TRACKS_V1 : TRACKS;
        value = catalog[h.decodeU32Value(payload, context)];
        if (!value) throw new TypeError(`${context} has an unknown compiled class or track tag`);
        return { kind: value, value: null };
      }
      case "key": {
        const key = h.decodePublicKeyValue(payload, context);
        if (!completeRecordContext(context) && key.curve !== 1) throw new TypeError(`${context} must use Ed25519`);
        if (completeRecordContext(context) && key.publicKey.length > 32768) throw new RangeError(`${context} exceeds native key bound`);
        return h.publicKeyLiteralFromParts(key.curve, key.publicKey, context);
      }
      case "signature": value = h.decodeConstVecU8Value(payload, context).toString("hex").toUpperCase();
        if (!publicEvidenceContext(context)) bytes(value, context, 64, 64);
        return value;
      case "inputPayload": case "admissionData": case "OpaqueBytes": case "opaque": case "proof": case "stark": {
        const maximum = opaqueMaximum(type, context);
        const result = Array.from(h.decodeByteVecValue(payload, context, maximum));
        if (type === "proof" && result.length === 0) throw new TypeError(`${context} must not be empty`);
        return result;
      }
      case "access": {
        if (payload.length < 4) throw new TypeError(`${context} has no admission tag`);
        const tag = payload.readUInt32LE();
        if (tag === 0 && payload.length === 4) return { kind: "public", public_key: null };
        if (tag !== 1) throw new TypeError(`${context} has an unknown admission tag`);
        const parts = h.decodeStructFields(payload.subarray(4), context, ["public_key"]);
        return { kind: "invite", public_key: decode("key", parts.public_key, context) };
      }
      case "payout": {
        if (payload.length !== 4) throw new TypeError(`${context} has a malformed payout tag`);
        const kind = ["no_payout", "equal_winners_or_refund"][payload.readUInt32LE()];
        if (!kind) throw new TypeError(`${context} has an unknown payout tag`);
        return { kind, value: null };
      }
      case "optionalGameOpenings": return h.decodeOptionValue(payload, inner => decode("gameOpenings", inner, context), context);
      case "optionalGameOpening": return h.decodeOptionValue(payload, inner => decode("GameInputOpeningV1", inner, context), context);
      case "optionalGameCheckpoint": return h.decodeOptionValue(payload, inner => decode("SignedGameCheckpointV1", inner, context), context);
      case "optionalGameCommitment": return h.decodeOptionValue(payload, inner => decode("gameCommitment", inner, context), context);
      case "optionalHash": return h.decodeOptionValue(payload, inner => decode("hash", inner, context), context);
      case "optionalInput": return h.decodeOptionValue(payload, inner => decode("opaque", inner, context), context);
      case "optionalGameOutcome": return h.decodeOptionValue(payload, inner => decode("GameOutcomeV1", inner, context), context);
      case "optionalAccount": return h.decodeOptionValue(payload, inner => decode("account", inner, context), context);
      case "optionalSignature": return h.decodeOptionValue(payload, inner => decode("signature", inner, context), context);
      case "optionalGameFrontier": return h.decodeOptionValue(payload, inner => decode("GameCommitmentSetV1", inner, context), context);
      case "optionalU64": return h.decodeOptionValue(payload, inner => decode("u64", inner, context), context);
      case "optionalU32": return h.decodeOptionValue(payload, (inner) => decode("u32", inner, context), context);
      default: throw new TypeError(`Unregistered native race type ${type}`);
    }
  }
  return Object.freeze({ encode, decode });
}
