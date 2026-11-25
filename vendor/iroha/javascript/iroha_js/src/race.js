import { canonicalTypeId, frameCanonicalPayload, unframeCanonicalPayload } from "./gameCanonicalFrame.js";
import { noritoEncodeGameValueV1, noritoDecodeGameValueV1 } from "./norito.js";
import { gameHashLiteralV1, EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1 } from "./game.js";
export { deriveRaceResultV1, isRaceTerminalStateV1 } from "./raceOutcomes.js";
const TYPES = new Set(["RaceProverRequestV1", "RaceProofPayloadV1", "RaceTrackV1", "RaceInputFrameV1", "RaceDnfEventV1", "RaceReplayV1", "RaceCarStateV1", "RaceStateV1", "RaceStandingV1", "RaceResultV1", "RaceSettlementStandingV1", "RaceSettlementResultV1", "RacePublicInputsV1"]);
/** Bare compiled SORA CARS adapter values. Signed i64 fields decode to safe numbers or canonical decimal strings outside the safe range. Native chain instructions are generic game-session instructions. */
export function encodeRaceValueV1(name, value) { if (!TYPES.has(name)) throw new TypeError("unknown SORA CARS adapter type"); return noritoEncodeGameValueV1(name, value); }
export function decodeRaceValueV1(name, bytes) { if (!TYPES.has(name)) throw new TypeError("unknown SORA CARS adapter type"); return noritoDecodeGameValueV1(name, bytes); }
export const raceHashLiteralV1 = gameHashLiteralV1;
export function raceInputPayloadV1(controls) {
  if (!Array.isArray(controls) || controls.length !== 6 || controls.some(word => !Number.isInteger(word) || word < 0 || word > 63)) throw new TypeError("SORA CARS input requires six control words");
  return controls.flatMap(word => [word & 255, word >>> 8]);
}
export function raceControlsFromPayloadV1(payload) {
  if (!Array.isArray(payload) || payload.length !== 12 || payload.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new TypeError("SORA CARS payload requires twelve bytes");
  const controls = Array.from({ length: 6 }, (_, i) => payload[i * 2] | payload[i * 2 + 1] << 8);
  raceInputPayloadV1(controls); return controls;
}
/** Physical driving projection only; this does not reconstruct the accepted ledger history. */
export function raceGameTranscriptV1(replay) {
  encodeRaceValueV1("RaceReplayV1", replay);
  if (replay.frames.length % 6) throw new TypeError("SORA CARS transcripts require complete six-tick batches");
  const removed = new Map(); let previousTick = -1;
  for (const event of replay.dnf_events) {
    if (event.tick <= previousTick || event.tick % 6 || event.tick > replay.frames.length || event.tick >= 8100 || !event.slots.length) throw new TypeError("SORA CARS removals require ordered batch boundaries");
    previousTick = event.tick; let previousSlot = -1;
    for (const slot of event.slots) {
      if (slot <= previousSlot || slot >= replay.player_count || removed.has(slot)) throw new TypeError("SORA CARS removals require unique original slots");
      removed.set(slot, event.tick); previousSlot = slot;
    }
  }
  const batches = [];
  for (let tick = 0; tick < replay.frames.length; tick += 6) batches.push({ start_tick: tick, inputs: Array.from({ length: replay.player_count }, (_, slot) => {
    const controls = replay.frames.slice(tick, tick + 6).map(frame => frame.controls[slot]);
    const payload = raceInputPayloadV1(controls);
    if ((removed.get(slot) ?? Infinity) > tick) return payload;
    if (controls.some(word => word !== 0)) throw new TypeError("SORA CARS removed slots must have zero physical controls");
    return [];
  }) });
  return { batches, dnf_events: structuredClone(replay.dnf_events) };
}
/** Preserve the complete observed record. Native proving derives its statement and validates history. */
export function buildRaceProverRequestV1(value) {
  return decodeRaceValueV1("RaceProverRequestV1", encodeRaceValueV1("RaceProverRequestV1", value));
}

// Only compiled schemas and their native bounds are admitted. No caller-selected type name.
const FRAMED = new Map([
  ["RaceStateV1", 512 * 1024],
  ["RaceSettlementResultV1", 512 * 1024],
  ["RaceProofPayloadV1", EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1],
].map(([name, cap]) => [name, { id: canonicalTypeId(`iroha_data_model::execution_proofs::${name}`), cap }]));
/** Canonical typed Norito frame, including its fixed schema, flags, length and checksum. */
export function encodeRaceFrameV1(name, value) {
  const schema = FRAMED.get(name); if (!schema) throw new TypeError("unknown framed race adapter type");
  return frameCanonicalPayload(schema.id, encodeRaceValueV1(name, value), schema.cap);
}
/** Strict framed decoding; bare values and alternate framing are rejected. Decoding does not verify a proof. */
export function decodeRaceFrameV1(name, frame) {
  const schema = FRAMED.get(name); if (!schema) throw new TypeError("unknown framed race adapter type");
  const result = decodeRaceValueV1(name, unframeCanonicalPayload(schema.id, frame, schema.cap));
  const encoded = encodeRaceFrameV1(name, result);
  if (encoded.length !== frame.length || encoded.some((byte, index) => byte !== frame[index])) throw new TypeError("noncanonical race adapter frame");
  return result;
}
