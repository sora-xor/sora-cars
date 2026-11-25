// One bounded preparation over complete public inputs, followed by cached cuts.
// This establishes neither application semantics nor accepted ledger authority.
import { gameCertificateCommitmentV1 } from "./gameCertificates.js";
import { bytes, fail, fixed, unsigned } from "./gameCertificateBytes.js";
import { encodeGameCertificateBodyV1 } from "./gameCertificateCodec.js";
import { NetworkId, networkIdBytes } from "./networkId.js";
import { validateTranscriptClaim, validateTranscriptAppend } from "./gameTranscriptShape.js";

export function prepareGameTranscriptV1(context, scope, geometry, throughTick, transcript) {
  // Snapshot identity and scope before hashing any caller-owned input. Scope's
  // closed schema and literal checks also apply when the transcript is empty.
  const ctx = Object.freeze({ networkId: NetworkId.fromBytes(networkIdBytes(context?.networkId)), sessionId: fixed(context?.sessionId, 32, "expected sessionId") });
  encodeGameCertificateBodyV1("GameActiveScopeV1", scope);
  const selectedScope = Object.freeze({ manifest: scope.manifest, admission: scope.admission });
  const validated = validateTranscriptClaim({ scope: selectedScope, geometry, through_tick: throughTick, transcript });
  const g = Object.freeze(validated.geometry);
  const through = validated.through, aligned = [], { batches, dnf_events: events } = validated.transcript;
  let head = gameCertificateCommitmentV1(ctx, 11, { scope: selectedScope, ...g });
  let ordinal = 0, batchCount = 0, removalCount = 0;
  const seal = tick => gameCertificateCommitmentV1(ctx, 14, { scope: selectedScope, through_tick: tick, batch_count: batchCount, removal_count: removalCount, head });
  // Each checkpoint is sealed before removals at its boundary. A partial
  // frontier includes the entire last batch, including its unused suffix.
  for (let index = 0; index <= batches.length; index += 1) {
    const tick = index * g.batch_ticks;
    if (tick <= through) aligned.push(seal(tick));
    if (removalCount < events.length && Number(events[removalCount].tick) === tick) {
      const event = events[removalCount]; bytes(event.slots, 32);
      head = gameCertificateCommitmentV1(ctx, 13, { previous: head, ordinal: ordinal++, event });
      removalCount += 1;
    }
    if (index < batches.length) {
      head = gameCertificateCommitmentV1(ctx, 12, { previous: head, ordinal: ordinal++, batch: batches[index] });
      batchCount += 1;
    }
  }
  if (removalCount !== events.length) fail("Geometry", "unconsumed transcript removal");
  const partial = through % g.batch_ticks ? seal(through) : null;
  const accepted = seal(through);
  return own({ ctx, scope: selectedScope, g, through, aligned, partial, accepted, head, ordinal, batchCount, removalCount,
    removed: validated.removed, lastRemovalTick: validated.lastRemovalTick, payloadBytes: validated.payloadBytes });
}
// Only authentic objects created here can be extended. Neither structural typing,
// copied methods, prototypes nor serialized metadata can manufacture an owner.
const owners = new WeakMap();
function own(state) {
  Object.freeze(state.aligned);
  Object.freeze(state);
  // This separate activation retains bounded roots/metadata, no input transcript,
  // batch payload, link body, parent owner or caller-owned context object.
  const owner = Object.freeze({
    checkpointRoot(tick) {
      const t = Number(unsigned(tick, 32));
      if (t > state.through || t % state.g.batch_ticks && t !== state.through) fail("Geometry", "checkpoint is outside the prepared cut set");
      return t % state.g.batch_ticks ? state.partial : state.aligned[t / state.g.batch_ticks];
    },
    acceptedRoot() { return state.accepted; },
  });
  owners.set(owner, state);
  return owner;
}

/** Extend one locally prepared owner without re-reading or hashing prior inputs.
 * The return value is independent; callers adopt it only when their protocol accepts
 * the new inputs. This authenticates local construction, never ledger authority.
 */
export function extendGameTranscriptV1(owner, throughTick, appended) {
  const prior = owners.get(owner);
  if (!prior) fail("Geometry", "authentic prepared transcript owner required");
  const through = Number(unsigned(throughTick, 32));
  const validated = validateTranscriptAppend(prior.g, prior.through, through, appended,
    prior.removed, prior.lastRemovalTick, prior.payloadBytes);
  const { batches, dnf_events: events } = validated.transcript;
  if (through === prior.through && !events.length) return owner;
  const { ctx, scope, g } = prior, aligned = prior.aligned.slice();
  let { head, ordinal, batchCount, removalCount } = prior;
  let eventIndex = 0;
  const seal = tick => gameCertificateCommitmentV1(ctx, 14, { scope, through_tick: tick, batch_count: batchCount, removal_count: removalCount, head });
  for (let index = 0; index <= batches.length; index += 1) {
    const tick = prior.through + index * g.batch_ticks;
    // The old boundary is already cached before its possible removal. Never
    // reseal it from the post-removal head, including a removal-only extension.
    if (index && tick <= through) aligned.push(seal(tick));
    if (eventIndex < events.length && Number(events[eventIndex].tick) === tick) {
      head = gameCertificateCommitmentV1(ctx, 13, { previous: head, ordinal: ordinal++, event: events[eventIndex++] });
      removalCount += 1;
    }
    if (index < batches.length) {
      head = gameCertificateCommitmentV1(ctx, 12, { previous: head, ordinal: ordinal++, batch: batches[index] });
      batchCount += 1;
    }
  }
  if (eventIndex !== events.length) fail("Geometry", "unconsumed transcript removal");
  const accepted = seal(through), partial = through % g.batch_ticks ? accepted : null;
  return own({ ctx, scope, g, through, aligned, partial, accepted, head, ordinal, batchCount, removalCount,
    removed: validated.removed, lastRemovalTick: validated.lastRemovalTick, payloadBytes: validated.payloadBytes });
}
