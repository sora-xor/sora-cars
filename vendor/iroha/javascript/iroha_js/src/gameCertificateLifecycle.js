// Complete native lifecycle schemas; these construct claims, not ledger authority.
import { bytes, fail, unsigned } from "./gameCertificateBytes.js";
import { encodeGameCertificateIdentityV1, canonicalGameCertificateAccountV1 } from "./gameCertificateIdentity.js";

const KIB = 1024;
const UTF8 = new TextEncoder();
const st = (fields) => ({ kind: "struct", fields });
const seq = (item, max) => ({ kind: "sequence", item, max });
const raw = (max) => ({ kind: "bytes", max });
const optional = (item) => ({ kind: "optional", item });
const variants = (...entries) => ({ kind: "enum", entries });
const digest = { kind: "opaque", prefix: "game384:", size: 48, wrappers: 2 };
const scope = st([["manifest", digest], ["admission", digest]]);
const checkpoint = st([["scope", scope], ["epoch", "u64"], ["tick", "u32"], ["transcript_root", digest], ["state_root", digest], ["terminal", "bool"]]);
const returnPolicy = variants(["return_to_original_owner_at_terminal"]);
const clause = st([["nft_id", "nftId"], ["expected_metadata_hash", "ledgerHash"], ["role_id", "ledgerHash"], ["policy", returnPolicy]]);
const admission = st([
  ["version", "u16"],
  ["participants", seq(st([["account", "accountId"], ["input_key", "ed25519Key"], ["application_data", raw(4096)]]), 32)],
  ["wagers", seq(st([["slot", "u8"], ["nft_id", "nftId"], ["metadata_hash", "ledgerHash"]]), 32)],
  ["resources", seq(st([["slot", "u8"], ["nft_id", "nftId"], ["metadata_hash", "ledgerHash"], ["role_id", "ledgerHash"], ["policy", returnPolicy]]), 128)],
]);
const dispute = st([
  ["manifest", digest], ["admission", optional(digest)], ["epoch", "u64"], ["checkpoint", optional(checkpoint)],
  ["checkpoint_history", seq(st([["epoch", "u64"], ["tick", "u32"], ["transcript_root", digest], ["state_root", digest]]), 4096)],
  ["certified_batches", seq(st([["epoch", "u64"], ["start_tick", "u32"], ["parent_transcript_root", digest], ["frontier_id", digest], ["inputs", seq(raw(4096), 32)]]), 4096)],
  ["forced_batches", seq(st([["epoch", "u64"], ["start_tick", "u32"], ["inputs", seq(raw(4096), 32)], ["dnf_slots", raw(32)], ["certified_frontier_id", optional(digest)]]), 4096)],
]);
export const GAME_LIFECYCLE_SCHEMAS_V1 = Object.freeze([
  {
    name: "GameManifestV1", typeName: "iroha_data_model::game::GameManifestV1", cap: 256 * KIB, elements: 131072,
    schema: st([["version", "u16"], ["application_id", "ledgerHash"], ["profile_id", "ledgerHash"], ["application_parameters", raw(65536)],
      ["min_participants", "u8"], ["max_participants", "u8"], ["batch_ticks", "u16"], ["max_ticks", "u32"],
      ["max_input_bytes", "u16"], ["max_participant_data_bytes", "u16"],
      ["access", variants(["public"], ["invite", "ed25519Key", "public_key"])],
      ["payout_policy", variants(["no_payout"], ["equal_winners_or_refund"])] ]),
  },
  { name: "GameAdmissionBodyV1", typeName: "iroha_data_model::game::GameAdmissionBodyV1", cap: 1024 * KIB, elements: 2 * 1024 * KIB, schema: admission },
  { name: "GameDisputeCommitmentBodyV1", typeName: "iroha_data_model::game_certificates::lifecycle::GameDisputeCommitmentBodyV1", cap: 8 * 1024 * KIB - 97, elements: 8 * 1024 * KIB, schema: dispute },
  { name: "GameOutcomeCommitmentBodyV1", typeName: "iroha_data_model::game_certificates::lifecycle::GameOutcomeCommitmentBodyV1", cap: 256 * KIB - 97, elements: 65536 + 32,
    schema: st([["scope", scope], ["outcome", st([["terminal_tick", "u32"], ["winner_slots", raw(32)], ["result", raw(65536)]])]]) },
  { name: "GameInvitationCertificateBodyV1", typeName: "iroha_data_model::game_certificates::invitation::GameInvitationCertificateBodyV1", cap: 64 * KIB, elements: 128 * KIB,
    schema: st([["manifest", digest], ["wallet", "accountId"], ["input_key", "ed25519Key"], ["application_data", raw(4096)], ["resources", seq(clause, 4)]]) },
]);

function count(value, max, label) {
  if (!Array.isArray(value) || value.length > max) fail("Bound", `${label} count`);
  return value.length;
}
function hex(value) { return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function exactIdentity(kind, value) { return hex(encodeGameCertificateIdentityV1(kind, value)); }
function manifest(body) {
  bytes(body.application_parameters, 65536);
  const version = Number(unsigned(body.version, 16));
  const min = Number(unsigned(body.min_participants, 8));
  const max = Number(unsigned(body.max_participants, 8));
  const batch = Number(unsigned(body.batch_ticks, 16));
  const ticks = Number(unsigned(body.max_ticks, 32));
  const input = Number(unsigned(body.max_input_bytes, 16));
  const data = Number(unsigned(body.max_participant_data_bytes, 16));
  if (version !== 1 || min === 0 || min > max || max > 32 || batch === 0 || batch > 256 || ticks === 0 || ticks > 1000000 || ticks % batch !== 0 || input === 0 || input > 4096 || data > 4096) fail("Geometry", "invalid immutable manifest geometry");
  const batches = ticks / batch;
  if (batches > 4096 || batches * max * input > 4 * 1024 * KIB) fail("Bound", "manifest complete-history geometry bound");
}
function admissionBody(body) {
  const slots = count(body.participants, 32, "admission participants");
  count(body.wagers, 32, "admission wagers"); count(body.resources, 128, "admission resources");
  if (Number(unsigned(body.version, 16)) !== 1 || slots === 0) fail("Geometry", "nonempty original admission version one required");
  const accounts = new Set(); const keys = new Set(); const nfts = new Set();
  for (const participant of body.participants) {
    bytes(participant.application_data, 4096);
    const accountInfo = canonicalGameCertificateAccountV1(participant.account);
    if (UTF8.encode(accountInfo.canonicalText).length > 16 * KIB) fail("Bound", "admission account display bound");
    const account = hex(accountInfo.encoded);
    const key = exactIdentity("ed25519Key", participant.input_key);
    if (accounts.has(account) || keys.has(key)) fail("Geometry", "duplicate original wallet or gameplay key");
    accounts.add(account); keys.add(key);
  }
  function item(entry) {
    const slot = Number(unsigned(entry.slot, 8));
    const nft = exactIdentity("nftId", entry.nft_id);
    if (slot >= slots || nfts.has(nft)) fail("Geometry", "missing original slot or overlapping NFT identity");
    nfts.add(nft); return slot;
  }
  let priorSlot = -1;
  for (const wager of body.wagers) {
    const slot = item(wager);
    if (slot <= priorSlot) fail("Geometry", "wagers must retain strictly ordered original slots");
    priorSlot = slot;
  }
  priorSlot = -1; let priorRole = ""; const perSlot = new Map();
  for (const resource of body.resources) {
    const slot = item(resource); const role = exactIdentity("ledgerHash", resource.role_id);
    if (slot < priorSlot || (slot === priorSlot && role <= priorRole)) fail("Geometry", "resources must retain original slot and role order");
    const n = (perSlot.get(slot) ?? 0) + 1;
    if (n > 4) fail("Bound", "maximum four returnable resources per original slot");
    perSlot.set(slot, n); priorSlot = slot; priorRole = role;
  }
}
function disputeBody(body) {
  count(body.checkpoint_history, 4095, "checkpoint history");
  const certifiedCount = count(body.certified_batches, 4096, "certified batches");
  const forcedCount = count(body.forced_batches, 4096, "forced batches");
  if (certifiedCount + forcedCount > 4096) fail("Bound", "combined retained batch count");
  const epoch = unsigned(body.epoch, 64);
  if (body.admission === null && (epoch !== 0n || body.checkpoint !== null || body.checkpoint_history.length || body.certified_batches.length || body.forced_batches.length)) fail("Geometry", "lobby has no active admission, epoch, or retained progress");
  if (body.checkpoint !== null) {
    const cp = body.checkpoint;
    if (cp.scope.manifest !== body.manifest || cp.scope.admission !== body.admission || unsigned(cp.epoch, 64) > epoch) fail("Geometry", "checkpoint differs from immutable dispute scope or epoch");
  }
  let priorAnchor = 0; let priorAnchorEpoch = -1n;
  for (const anchor of body.checkpoint_history) {
    const tick = Number(unsigned(anchor.tick, 32)); const anchorEpoch = unsigned(anchor.epoch, 64);
    if (tick <= priorAnchor || anchorEpoch > epoch || anchorEpoch < priorAnchorEpoch) fail("Bound", "ordered positive checkpoint history required");
    priorAnchor = tick; priorAnchorEpoch = anchorEpoch;
  }
  let priorCertifiedTick = -1; let priorCertifiedEpoch = -1n;
  for (const batch of body.certified_batches) {
    const tick = Number(unsigned(batch.start_tick, 32)); const batchEpoch = unsigned(batch.epoch, 64);
    if (tick <= priorCertifiedTick || batchEpoch > epoch || batchEpoch < priorCertifiedEpoch) fail("Bound", "ordered certified history required");
    priorCertifiedTick = tick; priorCertifiedEpoch = batchEpoch;
  }
  const starts = new Set(); let total = 0;
  for (const batches of [body.certified_batches, body.forced_batches]) for (const batch of batches) {
    const tick = Number(unsigned(batch.start_tick, 32));
    const size = count(batch.inputs, 32, "retained original input slots");
    if (size === 0 || starts.has(tick)) fail("Geometry", "nonempty original inputs and disjoint retained batch starts required");
    starts.add(tick);
    for (const input of batch.inputs) {
      bytes(input, 4096); total += input.length;
      if (total > 4 * 1024 * KIB) fail("Bound", "aggregate retained input byte bound");
    }
  }
  let priorTick = -1; let priorEpoch = -1n; let slots = null;
  const removed = new Set();
  for (const batch of body.forced_batches) {
    const size = count(batch.inputs, 32, "forced original input slots");
    bytes(batch.dnf_slots, 32);
    if (size === 0) fail("Slot", "nonempty forced original slot vector required");
    const tick = Number(unsigned(batch.start_tick, 32)); const batchEpoch = unsigned(batch.epoch, 64);
    if (batchEpoch >= epoch || batchEpoch <= priorEpoch || tick <= priorTick || (slots !== null && slots !== size)) fail("Geometry", "ordered forced epochs, ticks, and exact original slots required");
    slots = size; priorTick = tick; priorEpoch = batchEpoch;
    let priorSlot = -1;
    for (const slot of batch.dnf_slots) {
      if (slot >= size || slot <= priorSlot || removed.has(slot)) fail("Slot", "repeated or unordered original removal");
      removed.add(slot); priorSlot = slot;
    }
    for (let slot = 0; slot < size; slot += 1) {
      bytes(batch.inputs[slot], 4096);
      if (removed.has(slot) && batch.inputs[slot].length !== 0) fail("Geometry", "removed original slot has input bytes");

    }
  }
}
export function validateGameCertificateLifecycleV1(name, body, encodeValue) {
  if (body === null || typeof body !== "object") fail("Codec", "typed lifecycle body required");
  if (name === "GameManifestV1") manifest(body);
  else if (name === "GameAdmissionBodyV1") admissionBody(body);
  else if (name === "GameDisputeCommitmentBodyV1") disputeBody(body);
  else if (name === "GameOutcomeCommitmentBodyV1") {
    bytes(body.outcome?.winner_slots, 32); bytes(body.outcome?.result, 65536);
    let previous = -1;
    for (const slot of body.outcome.winner_slots) {
      if (slot >= 32 || slot <= previous) fail("Slot", "ordered unique original winners required");
      previous = slot;
    }
  } else if (name === "GameInvitationCertificateBodyV1") {
    bytes(body.application_data, 4096); count(body.resources, 4, "invited resources");
    let previous = ""; const nfts = new Set();
    for (const resource of body.resources) {
      const nft = exactIdentity("nftId", resource.nft_id); const role = exactIdentity("ledgerHash", resource.role_id);
      if (role <= previous || nfts.has(nft)) fail("Geometry", "invitation requires unique NFT identities and strictly ordered role hashes");
      if (encodeValue(clause, resource).length + 40 > 1024) fail("Bound", "canonical resource clause byte bound");
      nfts.add(nft); previous = role;
    }
  }
}
