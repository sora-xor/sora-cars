import { Buffer } from "buffer";
import { computeHashLiteralCrc } from "./hashLiteralCrc.js";
import { noritoEncodeGameValueV1, noritoDecodeGameValueV1 } from "./norito.js";
import { GAME_INSTRUCTION_NAMES_V1, GAME_INSTRUCTION_WIRE_IDS_V1, EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1 } from "./noritoGameCodecs.js";
export { GAME_INSTRUCTION_NAMES_V1, GAME_INSTRUCTION_WIRE_IDS_V1, EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1 };
export * from "./gameResources.js";
export * from "./gameProofWorker.js";
export { EXECUTION_RECORD_MAX_BYTES_V1, EXECUTION_PROVER_MAX_REQUEST_BYTES_V1, GAME_ADMISSION_MAX_ACCOUNT_ENCODED_BYTES_V1, GAME_ADMISSION_MAX_NFT_ENCODED_BYTES_V1, GAME_ADMISSION_MAX_BYTES_V1 } from "./noritoGameCodecs.js";
export const encodeGameValueV1 = noritoEncodeGameValueV1;
export const decodeGameValueV1 = noritoDecodeGameValueV1;
export function gameHashLiteralV1(bytes) {
  const value = Buffer.from(bytes);
  if (value.length !== 32 || (value[31] & 1) === 0) throw new TypeError("game hash must contain 32 marked bytes");
  const body = value.toString("hex").toUpperCase();
  return `hash:${body}#${computeHashLiteralCrc("hash", body)}`;
}
/** Validate and normalize a closed generic native game instruction before wallet signing. */
export function buildGameInstructionV1(name, value) {
  if (!GAME_INSTRUCTION_NAMES_V1.includes(name)) throw new TypeError("unknown native game instruction");
  return { [name]: noritoDecodeGameValueV1(name, noritoEncodeGameValueV1(name, value)) };
}

/** Require the exact wallet-approved asset, stake and immutable manifest when joining. */
export function buildJoinGameSessionV1(value) {
  return buildGameInstructionV1("JoinGameSessionV1", value);
}

// Gameplay signatures and commitments use the dedicated ./game-certificates API.
/** Validate and copy the exact public admission body without sorting or defaulting fields. */
export function validateGameAdmissionBodyV1(value) {
  return decodeGameValueV1("GameAdmissionBodyV1", encodeGameValueV1("GameAdmissionBodyV1", value));
}

/** Copy the complete bounded native record without inferring custody, defaults or ledger authority. */
export function validateGameSessionRecordV1(value) {
  return decodeGameValueV1("GameSessionRecordV1", encodeGameValueV1("GameSessionRecordV1", value));
}
/** Validate six canonical Goldilocks limbs; this does not compute or authenticate the binding. */
export function validateExecutionRecordBindingV1(value) {
  return decodeGameValueV1("ExecutionRecordBindingV1", encodeGameValueV1("ExecutionRecordBindingV1", value));
}
