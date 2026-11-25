// Closed canonical Norito schemas corresponding to the native certificate corpus.
// No generic codec dispatch, legacy bare payload, compression or layout guessing.
import { validateTranscriptBody } from "./gameTranscriptShape.js";
import { canonicalTypeId, frameCanonicalPayload, unframeCanonicalPayload } from "./gameCanonicalFrame.js";
import { GAME_LIFECYCLE_SCHEMAS_V1, validateGameCertificateLifecycleV1 } from "./gameCertificateLifecycle.js";
import { encodeGameCertificateIdentityV1, decodeGameCertificateIdentityV1 } from "./gameCertificateIdentity.js";
import { bytes, concat, equal, fail, field, formatLiteral, fromLittle, little, parseLiteral, Reader, unsigned } from "./gameCertificateBytes.js";

const KIB = 1024;
const st = (fields) => ({ kind: "struct", fields });
const seq = (item, max) => ({ kind: "sequence", item, max });
const raw = (max) => ({ kind: "bytes", max });
const opaque = (prefix, size, wrappers) => ({ kind: "opaque", prefix, size, wrappers });
const digest = opaque("game384:", 48, 2);
const nonce = opaque("nonce32:", 32, 1);
const scope = st([["manifest", digest], ["admission", digest]]);
const input = st([["scope", scope], ["epoch", "u64"], ["start_tick", "u32"], ["slot", "u8"], ["payload", raw(4096)], ["nonce", nonce]]);
const checkpoint = st([["scope", scope], ["epoch", "u64"], ["tick", "u32"], ["transcript_root", digest], ["state_root", digest], ["terminal", "bool"]]);
const frontier = st([["scope", scope], ["epoch", "u64"], ["start_tick", "u32"], ["parent_transcript_root", digest], ["commitments", seq(digest, 32)]]);
const challenge = st([["scope", scope], ["epoch", "u64"], ["slot", "u8"]]);
const geometry = st([["batch_ticks", "u16"], ["max_ticks", "u32"], ["slots", "u8"], ["max_input_bytes", "u16"]]);
const batch = st([["start_tick", "u32"], ["inputs", seq(raw(4096), 32)]]);
const removal = st([["tick", "u32"], ["slots", raw(32)]]);
const transcript = st([["batches", seq(batch, 4096)], ["dnf_events", seq(removal, 32)]]);
const seed = st([["scope", scope], ...geometry.fields]);
const batchLink = st([["previous", digest], ["ordinal", "u32"], ["batch", batch]]);
const removalLink = st([["previous", digest], ["ordinal", "u32"], ["event", removal]]);
const root = st([["scope", scope], ["through_tick", "u32"], ["batch_count", "u32"], ["removal_count", "u32"], ["head", digest]]);
const claim = st([["scope", scope], ["geometry", geometry], ["through_tick", "u32"], ["transcript", transcript]]);
const state = st([["scope", scope], ["tick", "u32"], ["adapter_state", raw(512 * KIB)]]);
const inputCommitment = st([["scope", scope], ["epoch", "u64"], ["start_tick", "u32"], ["slot", "u8"], ["commitment", digest]]);
const TYPES = new Map();
function register(name, schema, cap, module = "", exactTypeName = null, elements = null) {
  const typeName = exactTypeName ?? `iroha_data_model::game_certificates::${module}${name}`;
  const id = canonicalTypeId(typeName);
  TYPES.set(name, Object.freeze({ name, schema, cap, id, elements }));
}
register("GameCommitmentV1", opaque("game384:", 48, 1), 89);
register("GameNonceV1", nonce, 73);
for (const name of ["GameInputDigestV1", "GameTranscriptRootV1", "GameTranscriptChainHeadV1", "GameStateRootV1", "GameManifestCommitmentV1", "GameAdmissionCommitmentV1", "GameDisputeCommitmentV1", "GameOutcomeCommitmentV1", "GameCheckpointIdV1", "GameFrontierIdV1", "GameResourceContentCommitmentV1"]) register(name, digest, 90);
register("GameActiveScopeV1", scope, 142);
register("GameInputPreimageV1", input, 64 * KIB);
register("GameInputCommitmentCertificateBodyV1", inputCommitment, 64 * KIB);
register("GameCheckpointCertificateBodyV1", checkpoint, 4 * KIB, "gameplay::");
register("GameCommitmentSetCertificateBodyV1", frontier, 32 * KIB, "gameplay::");
register("GameChallengeCertificateBodyV1", challenge, 2 * KIB, "gameplay::");
register("GameTranscriptGeometryV1", geometry, 4 * KIB, "history::transcript::");
register("GameTranscriptSeedBodyV1", seed, 4 * KIB - 97, "history::transcript::");
register("GameTranscriptBatchLinkBodyV1", batchLink, 256 * KIB - 97, "history::transcript::");
register("GameTranscriptRemovalLinkBodyV1", removalLink, 4 * KIB - 97, "history::transcript::");
register("GameTranscriptRootBodyV1", root, 4 * KIB - 97, "history::transcript::");
register("GameTranscriptClaimV1", claim, 8 * 1024 * KIB - 97, "history::transcript::");
register("GameAdapterStateCommitmentBodyV1", state, 1024 * KIB - 97, "history::");
for (const type of GAME_LIFECYCLE_SCHEMAS_V1) register(type.name, type.schema, type.cap, "", type.typeName, type.elements);
const LIFECYCLE_NAMES = new Set(GAME_LIFECYCLE_SCHEMAS_V1.map((type) => type.name));
const LEAF_TYPES = new Set(["ledgerHash", "ed25519Key", "accountId", "nftId"]);
export function schemaFor(name) {
  const type = TYPES.get(name);
  if (!type) fail("Codec", "unsupported native certificate schema");
  return type;
}
function object(value, names) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("Codec", "expected plain body object");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || keys.some((key) => !names.includes(key))) fail("Codec", "body fields must match the closed native schema");
  for (const name of names) {
    const property = Object.getOwnPropertyDescriptor(value, name);
    if (!property?.enumerable || !("value" in property)) fail("Codec", "body fields must be enumerable data properties");
  }
}
function encode(schema, value) {
  if (typeof schema === "string") {
    if (LEAF_TYPES.has(schema)) return encodeGameCertificateIdentityV1(schema, value);
    if (schema === "bool") { if (typeof value !== "boolean") fail("Codec", "expected Boolean"); return Uint8Array.of(Number(value)); }
    return little(value, Number(schema.slice(1)) / 8);
  }
  if (schema.kind === "optional") return value === null ? Uint8Array.of(0) : concat([Uint8Array.of(1), field(encode(schema.item, value))]);
  if (schema.kind === "enum") {
    const index = schema.entries.findIndex(([kind]) => value?.kind === kind);
    if (index < 0) fail("Codec", "unknown closed native enum variant");
    const [, member, key] = schema.entries[index];
    object(value, member ? ["kind", key] : ["kind"]);
    return member ? concat([little(index, 4), field(encode(member, value[key]))]) : little(index, 4);
  }
  if (schema.kind === "opaque") {
    let result = parseLiteral(value, schema.prefix, schema.size);
    for (let i = 0; i < schema.wrappers; i += 1) result = field(result);
    return result;
  }
  if (schema.kind === "bytes") {
    bytes(value, schema.max);
    return concat([little(value.length, 8), value]);
  }
  if (schema.kind === "sequence") {
    if (!Array.isArray(value) || value.length > schema.max) fail("Bound", "bounded sequence required");
    return concat([little(value.length, 8), ...value.map((item) => field(encode(schema.item, item)))]);
  }
  object(value, schema.fields.map(([name]) => name));
  return concat(schema.fields.map(([name, member]) => field(encode(member, value[name]))));
}
function decode(schema, raw, budget) {
  if (typeof schema === "string") {
    if (LEAF_TYPES.has(schema)) return decodeGameCertificateIdentityV1(schema, raw, budget);
    if (schema === "bool") { if (raw.length !== 1 || raw[0] > 1) fail("Codec", "noncanonical Boolean"); return raw[0] === 1; }
    if (raw.length !== Number(schema.slice(1)) / 8) fail("Codec", "wrong integer width");
    const n = fromLittle(raw); return schema === "u64" ? n : Number(n);
  }
  const reader = new Reader(raw);
  if (schema.kind === "optional") {
    const tag = reader.take(1)[0];
    if (tag > 1) fail("Codec", "noncanonical Option discriminant");
    const value = tag === 0 ? null : decode(schema.item, reader.field(), budget);
    reader.end(); return value;
  }
  if (schema.kind === "enum") {
    const variant = schema.entries[Number(fromLittle(reader.take(4)))];
    if (!variant) fail("Codec", "unknown native enum discriminant");
    const [kind, member, key] = variant;
    const result = member ? { kind, [key]: decode(member, reader.field(), budget) } : { kind };
    reader.end(); return result;
  }
  if (schema.kind === "opaque") {
    for (let i = 0; i < schema.wrappers; i += 1) { const r = new Reader(raw); raw = r.field(); r.end(); }
    return formatLiteral(raw, schema.prefix, schema.size);
  }
  if (schema.kind === "bytes" || schema.kind === "sequence") {
    const count = fromLittle(reader.take(8));
    if (count > BigInt(schema.max) || count > BigInt(budget.elements)) fail("Bound", "sequence budget exceeded");
    budget.elements -= Number(count);
    if (schema.kind === "bytes") { const result = Uint8Array.from(reader.take(Number(count))); reader.end(); return result; }
    const result = [];
    for (let i = 0; i < Number(count); i += 1) result.push(decode(schema.item, reader.field(), budget));
    reader.end(); return result;
  }
  const result = {};
  for (const [name, member] of schema.fields) result[name] = decode(member, reader.field(), budget);
  reader.end(); return result;
}
function validate(name, body) {
  if (LIFECYCLE_NAMES.has(name)) return validateGameCertificateLifecycleV1(name, body, encode);
  if ((name === "GameInputPreimageV1" || name === "GameInputCommitmentCertificateBodyV1" || name === "GameChallengeCertificateBodyV1") && unsigned(body.slot, 8) >= 32n) fail("Slot", "original slot must be below 32");
  if (name === "GameCommitmentSetCertificateBodyV1" && (!Array.isArray(body.commitments) || body.commitments.length === 0 || body.commitments.length > 32)) fail("Bound", "complete original-slot vector must contain 1–32 entries");
  validateTranscriptBody(name, body);
}
/** Encode one of the explicitly supported native canonical body types. No protocol authority. */
export function encodeGameCertificateBodyV1(name, body) {
  const type = schemaFor(name);
  validate(name, body);
  const payload = encode(type.schema, body);
  if (payload.length + 40 > type.cap) fail("Bound", "canonical body bound");
  return frameCanonicalPayload(type.id, payload, type.cap);
}
/** Decode exact uncompressed canonical V1 bytes; adapter state remains opaque. */
export function decodeGameCertificateBodyV1(name, value) {
  const type = schemaFor(name);
  const payload = unframeCanonicalPayload(type.id, value, type.cap);
  const frame = new Uint8Array(payload.buffer, payload.byteOffset - 40, payload.length + 40);
  const result = decode(type.schema, payload, { elements: type.elements ?? 4 * 1024 * KIB + 4096 * 32 + 4096 + 64 });
  validate(name, result);
  if (!equal(frame, encodeGameCertificateBodyV1(name, result))) fail("Codec", "canonical body roundtrip mismatch");
  return result;
}
