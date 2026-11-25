// Structural consistency for the single first-release transcript grammar.
// These checks never authenticate ledger origin or application input semantics.
import { fail, unsigned } from "./gameCertificateBytes.js";

export function transcriptObject(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("Codec", "expected plain transcript object");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) fail("Codec", "unexpected transcript fields");
  const snapshot = {};
  for (const key of fields) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property?.enumerable || !("value" in property)) fail("Codec", "transcript fields must be data properties");
    snapshot[key] = property.value;
  }
  return snapshot;
}
function array(value, cap) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail("Codec", "expected transcript array");
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!descriptor || !("value" in descriptor) || !Number.isSafeInteger(descriptor.value) || descriptor.value < 0) fail("Codec", "expected fixed transcript length");
  const length = descriptor.value;
  if (length > cap) fail("Bound", "transcript sequence bound");
  if (Reflect.ownKeys(value).length !== length + 1) fail("Codec", "transcript arrays cannot override methods or iterators");
  const snapshot = [];
  for (let i = 0; i < length; i += 1) {
    const property = Object.getOwnPropertyDescriptor(value, String(i));
    if (!property?.enumerable || !("value" in property)) fail("Codec", "transcript array must contain data entries");
    snapshot.push(property.value);
  }
  return snapshot;
}
// Read actual typed-array storage through captured intrinsics, not caller-owned
// length/buffer getters or iterators. Hashing receives these defensive snapshots.
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength").get;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset").get;
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer").get;
function transcriptBytes(value, cap, label) {
  if (!(value instanceof Uint8Array) || !ArrayBuffer.isView(value)) fail("Codec", `${label} must be a byte view`);
  const length = Reflect.apply(byteLengthGetter, value, []);
  if (length > cap) fail("Bound", `${label} exceeds its byte bound`);
  // Real byte views have exactly their indexed own properties. Extra methods,
  // symbols or length overrides would otherwise make validation differ from encoding.
  if (Reflect.ownKeys(value).length !== length) fail("Codec", `${label} must contain only byte data`);
  const buffer = Reflect.apply(bufferGetter, value, []);
  if (typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer) fail("Codec", `${label} must not use shared storage`);
  return new Uint8Array(new Uint8Array(buffer, Reflect.apply(byteOffsetGetter, value, []), length));
}
const integer = (value, bits) => Number(unsigned(value, bits));
export function validateTranscriptGeometry(geometry) {
  geometry = transcriptObject(geometry, ["batch_ticks", "max_ticks", "slots", "max_input_bytes"]);
  const b = integer(geometry.batch_ticks, 16), t = integer(geometry.max_ticks, 32);
  const p = integer(geometry.slots, 8), m = integer(geometry.max_input_bytes, 16);
  if (p < 1 || p > 32) fail("Slot", "original slot count");
  if (!b || !t || !m || t % b) fail("Geometry", "nonzero aligned transcript geometry required");
  if (b > 256 || t > 1_000_000 || m > 4096 || t / b > 4096 || t / b * p * m > 4 * 1024 * 1024) fail("Bound", "transcript geometry bound");
  return { batch_ticks: b, max_ticks: t, slots: p, max_input_bytes: m };
}
export function validateTranscriptBody(name, body) {
  if (name === "GameTranscriptGeometryV1") return validateTranscriptGeometry(body);
  if (name === "GameTranscriptClaimV1") return validateTranscriptClaim(body);
  if (name === "GameTranscriptSeedBodyV1") {
    body = transcriptObject(body, ["scope", "batch_ticks", "max_ticks", "slots", "max_input_bytes"]);
    return validateTranscriptGeometry({ batch_ticks: body.batch_ticks, max_ticks: body.max_ticks, slots: body.slots, max_input_bytes: body.max_input_bytes });
  }
  if (name === "GameTranscriptRootBodyV1") {
    body = transcriptObject(body, ["scope", "through_tick", "batch_count", "removal_count", "head"]);
    const tick = integer(body.through_tick, 32), batches = integer(body.batch_count, 32), removals = integer(body.removal_count, 32);
    if (tick > 1_000_000 || batches > 4096 || removals > 32) fail("Bound", "transcript root count bound");
    if ((batches === 0) !== (tick === 0)) fail("Geometry", "transcript root frontier");
  } else if (name === "GameTranscriptBatchLinkBodyV1") {
    body = transcriptObject(body, ["previous", "ordinal", "batch"]);
    body.batch = transcriptObject(body.batch, ["start_tick", "inputs"]);
    if (integer(body.ordinal, 32) >= 4128 || integer(body.batch.start_tick, 32) >= 1_000_000) fail("Bound", "transcript batch link bound");
    body.batch.inputs = array(body.batch.inputs, 32);
    if (!body.batch.inputs.length) fail("Slot", "empty original slot vector");
    for (let slot = 0; slot < body.batch.inputs.length; slot++) transcriptBytes(body.batch.inputs[slot], 4096, "transcript payload");
  } else if (name === "GameTranscriptRemovalLinkBodyV1") {
    body = transcriptObject(body, ["previous", "ordinal", "event"]);
    body.event = transcriptObject(body.event, ["tick", "slots"]);
    if (integer(body.ordinal, 32) >= 4128 || integer(body.event.tick, 32) >= 1_000_000) fail("Bound", "transcript removal link bound");
    const slots = transcriptBytes(body.event.slots, 32, "removed slots");
    if (!slots.length) fail("Geometry", "empty removal event");
    let prior = -1;
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      if (slot >= 32) fail("Slot", "removed original slot");
      if (slot <= prior) fail("Geometry", "unordered removal slots");
      prior = slot;
    }
  }
}
export function validateTranscriptClaim(body) {
  body = transcriptObject(body, ["scope", "geometry", "through_tick", "transcript"]);
  const geometry = validateTranscriptGeometry(body.geometry);
  const through = integer(body.through_tick, 32);
  return { geometry, through, ...validateTranscriptAppend(geometry, 0, through, body.transcript, new Map(), -1, 0) };
}
// Internal delta validation. The public extension API supplies these prior-state
// arguments exclusively from its private authenticated owner, never the caller.
export function validateTranscriptAppend(g, before, through, transcript, priorRemoved, priorRemovalTick, priorBytes) {
  if (before % g.batch_ticks || through < before || through > g.max_ticks) fail("Geometry", "transcript extension requires an aligned prior frontier and bounded new frontier");
  transcript = transcriptObject(transcript, ["batches", "dnf_events"]);
  const batches = array(transcript.batches, 4096), events = array(transcript.dnf_events, 32);
  if (batches.length !== Math.ceil(through / g.batch_ticks) - before / g.batch_ticks) fail("Geometry", "complete contiguous transcript rows required");
  const removed = new Map(priorRemoved); let previousTick = priorRemovalTick; let total = priorBytes;
  const selectedEvents = [], selectedBatches = [];
  for (let index = 0; index < events.length; index++) {
    const event = transcriptObject(events[index], ["tick", "slots"]);
    const tick = integer(event.tick, 32), slots = transcriptBytes(event.slots, 32, "removed slots");
    if (tick < before || tick > through || tick >= g.max_ticks || tick % g.batch_ticks || tick <= previousTick || !slots.length) fail("Geometry", "aligned ordered nonempty removals required");
    previousTick = tick; let previousSlot = -1;
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      if (slot >= g.slots) fail("Slot", "removed original slot");
      if (slot <= previousSlot || removed.has(slot)) fail("Geometry", "duplicate or unordered removal");
      previousSlot = slot; removed.set(slot, tick);
    }
    selectedEvents.push({ tick, slots });
  }
  for (let index = 0; index < batches.length; index += 1) {
    const row = transcriptObject(batches[index], ["start_tick", "inputs"]);
    const tick = integer(row.start_tick, 32);
    if (tick !== before + index * g.batch_ticks) fail("Geometry", "noncontiguous transcript rows");
    row.inputs = array(row.inputs, 32);
    if (row.inputs.length !== g.slots) fail("Slot", "complete original slot vector required");
    const inputs = [];
    for (let slot = 0; slot < row.inputs.length; slot++) {
      const input = transcriptBytes(row.inputs[slot], g.max_input_bytes, "transcript payload"); total += input.length;
      if (total > 4 * 1024 * 1024) fail("Bound", "aggregate transcript payload bound");
      if (removed.has(slot) && removed.get(slot) <= tick && input.length) fail("Geometry", "removed slot retains a payload");
      inputs.push(input);
    }
    selectedBatches.push({ start_tick: tick, inputs });
  }
  return { removed, lastRemovalTick: previousTick, payloadBytes: total, transcript: { batches: selectedBatches, dnf_events: selectedEvents } };
}
