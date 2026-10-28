import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import type { PeerMessage, RaceScope } from '../../src/network/session';

// Observe the actual typed certificate owner without replacing its encoding.
// Both signature-frame validation and frontier-ID agreement are counted on the
// original body object. Each function still delegates to the unmodified owner.
const canonical = await import('../../src/chain/certificates');
let observedBodies: Map<object, number> | null = null;
const observe = (body: object) => { if (observedBodies) observedBodies.set(body, (observedBodies.get(body) ?? 0) + 1); };
mock.module('../../src/chain/certificates', { namedExports: { ...canonical,
  frontierSigningFrame(...args: Parameters<typeof canonical.frontierSigningFrame>) { observe(args[1]); return canonical.frontierSigningFrame(...args); },
  frontierId(...args: Parameters<typeof canonical.frontierId>) { observe(args[1]); return canonical.frontierId(...args); },
} });
const { RacePeerSession, hex } = await import('../../src/network/session');
const { RACE_PROFILE_ID } = await import('../../src/game/environment');
const { raceHashLiteralV1 } = await import('@iroha/iroha-js/race');
const { formatGameCommitmentLiteralV1 } = await import('@iroha/iroha-js/game-certificates');
const { checkpointSigningFrame, frontierSigningFrame } = canonical;
const commitment = (n: number) => formatGameCommitmentLiteralV1(new Uint8Array(48).fill(n));
const hash = (n: number) => raceHashLiteralV1(new Uint8Array(32).fill(n | 1));

function fixture(count: number) {
  const keys = Array.from({ length: count }, (_, slot) => new Uint8Array(32).fill(slot + 1));
  const scope: RaceScope = { networkId: NetworkId.fromBytes(new Uint8Array(32).fill(3)).toString(),
    raceId: hash(1), profileId: RACE_PROFILE_ID, activeScope: { manifest: commitment(5), admission: commitment(7) }, track: { kind: 'neon_tokyo', value: null }, epoch: 0,
    participants: keys.map((key, slot) => ({ slot, account: `frontier-cache-fixture-${slot}`, inputKeyHex: hex(ed25519.getPublicKey(key)) })) };
  const sessions = keys.map((key, slot) => new RacePeerSession(scope, slot, key));
  const pending: { target: number; message: PeerMessage }[] = [];
  const sent: { sender: number; message: PeerMessage }[] = [];
  const inputs = Array<number>(count).fill(0), maxDepth = Array<number>(count).fill(0), depth = Array<number>(count).fill(0);
  sessions.forEach((session, sender) => {
    const receive = session.receive.bind(session);
    session.receive = value => {
      depth[sender]!++; maxDepth[sender] = Math.max(maxDepth[sender]!, depth[sender]!);
      try { receive(value); } finally { depth[sender]!--; }
    };
    session.send = message => {
      sent.push({ sender, message: structuredClone(message) });
      sessions.forEach((_, target) => { if (sender !== target) pending.push({ target, message }); });
    };
    session.onEvent = event => {
      if (event.type === 'inputs') { inputs[sender]!++; session.checkpoint(commitment(9)); }
      if (event.type === 'rollback') assert.fail(event.reason);
    };
  });
  function flush(accept: (message: PeerMessage) => boolean = () => true) {
    let remaining = 100_000;
    for (;;) {
      let index = pending.length - 1;
      while (index >= 0 && !accept(pending[index]!.message)) index--;
      if (index < 0) return;
      assert.ok(--remaining > 0, 'bounded signed transport fixture');
      const { target, message } = pending.splice(index, 1)[0]!;
      sessions[target]!.receive(message);
    }
  }
  sessions.forEach(session => session.anchor(commitment(9))); flush();
  return { sessions, keys, scope, pending, sent, inputs, maxDepth, flush,
    close() { observedBodies = null; sessions.forEach(session => session.close()); } };
}

for (const count of [2, 8]) test(`${count} racers check agreement hashes once per retained frontier despite reentrant delivery`, () => {
  const f = fixture(count);
  try {
    for (let round = 0; round < 3; round++) {
      observedBodies = new Map();
      f.sessions.forEach((session, slot) => session.commit([1, 33, slot % 2 ? 5 : 9, 17, 2, 1]));
      f.flush();
      const counts = [...observedBodies.values()]; observedBodies = null;
      // A retained clone is hashed once for its incoming signature and once
      // for unanimous agreement. Fresh local construction/signing objects are
      // hashed once. No hash function result is replaced or simulated here.
      assert.equal(counts.filter(value => value === 2).length, count * count,
        'each participant must actually validate and compare every retained frontier, on every new round');
      assert.ok(counts.every(value => value <= 2), `retained bodies were hashed repeatedly: ${counts}`);
      assert.ok(f.maxDepth.every(value => value >= 2), 'local reveal/checkpoint self-reception really re-enters receive');
      for (const session of f.sessions) {
        assert.equal(session.certifiedTick, (round + 1) * 6);
        assert.deepEqual(session.exportNativeReplay(), f.sessions[0]!.exportNativeReplay());
        assert.deepEqual(session.checkpoints.at(-1)!.native, f.sessions[0]!.checkpoints.at(-1)!.native);
      }
    }
    assert.deepEqual(f.inputs, Array(count).fill(3));
    const certificate = f.sessions[0]!.checkpoints.at(-1)!.native;
    const bytes = checkpointSigningFrame(f.scope.networkId, certificate.checkpoint);
    for (const signature of certificate.signatures) assert.ok(ed25519.verify(
      Buffer.from(signature.signature, 'hex'), bytes, ed25519.getPublicKey(f.keys[signature.slot]!), { zip215: false }));
  } finally { f.close(); }
});

test('cached agreement still rejects a later valid signed equivocation and preserves recovery evidence', () => {
  const f = fixture(8), target = f.sessions[0]!;
  try {
    f.sessions.forEach(session => session.commit([1, 1, 33, 1, 2, 1]));
    f.flush(message => message.kind !== 'checkpoint');
    assert.deepEqual(f.inputs, Array(8).fill(1), 'accepted reveals and local checkpoint emission occur after agreement');
    assert.equal(target.certifiedTick, 0, 'remote checkpoint signatures are deliberately still withheld');
    const certificate = target.pendingFrontier, anchor = target.anchorCheckpoint;
    assert.ok(certificate); assert.equal(target.nativeRevealedInputs.length, 8);
    const original = f.sent.find(row => row.sender === 1 && row.message.kind === 'frontier')!.message;
    let reason = '', evidence: readonly PeerMessage[] = [];
    target.onEvent = event => { if (event.type === 'rollback') { reason = event.reason; evidence = event.evidence; } };
    const body = original.body[0] as Record<string, unknown>;
    target.receive({ ...original, body: [Object.fromEntries(Object.entries(body).reverse())] });
    assert.equal(reason, '', 'canonical reordered-key duplicate remains harmless after cached agreement');
    const changedBody = { ...body, parent_transcript_root: commitment(29) };
    assert.throws(() => target.receive({ ...original, body: [changedBody] }), /signature/, 'unsigned mutation is still rejected');
    assert.equal(reason, ''); assert.deepEqual(target.pendingFrontier, certificate);
    const changed = { ...original, body: [changedBody], signature: hex(ed25519.sign(
      frontierSigningFrame(f.scope.networkId, changedBody as unknown as Parameters<typeof frontierSigningFrame>[1]), f.keys[1]!)) };
    target.receive(changed);
    assert.match(reason, /signed conflicting messages/); assert.deepEqual(evidence, [original, changed]);
    for (const packet of evidence) assert.ok(ed25519.verify(Buffer.from(packet.signature, 'hex'),
      frontierSigningFrame(f.scope.networkId, packet.body[0] as unknown as Parameters<typeof frontierSigningFrame>[1]), ed25519.getPublicKey(f.keys[packet.slot]!), { zip215: false }));
    assert.deepEqual(target.pendingFrontier, certificate);
    assert.deepEqual(target.anchorCheckpoint, anchor); assert.equal(target.nativeRevealedInputs.length, 8);
    assert.equal(target.certifiedTick, 0); assert.deepEqual(target.exportNativeReplay().frames, []);
  } finally { f.close(); }
});

test('cached frontier bodies cannot be altered through a caller-owned packet alias', () => {
  const f = fixture(2), target = f.sessions[0]!;
  try {
    f.sessions.forEach(session => session.commit([1, 1, 1, 33, 2, 1]));
    f.flush(message => message.kind === 'commit');
    const firstCallerOwned = f.pending.find(row => row.target === 0 && row.message.kind === 'frontier')!.message;
    f.flush(message => message.kind !== 'checkpoint');
    assert.deepEqual(f.inputs, [1, 1]);
    const packet = f.sent.find(row => row.sender === 1 && row.message.kind === 'frontier')!.message;
    // Deliver a duplicate caller-owned object, then mutate it. Neither its
    // envelope nor nested commitment vector may alias retained private state.
    const callerOwned = structuredClone(packet); target.receive(callerOwned);
    const certificate = target.pendingFrontier;
    (callerOwned.body[0] as { commitments: string[] }).commitments[0] = commitment(47);
    (callerOwned.body[0] as Record<string, unknown>).parent_transcript_root = commitment(51);
    callerOwned.signature = '00'.repeat(64);
    // Also mutate the exact object originally delivered for the retained slot,
    // not only the later duplicate, to exercise the clone-before-cache contract.
    (firstCallerOwned.body[0] as { commitments: string[] }).commitments[0] = commitment(53);
    (firstCallerOwned.body[0] as Record<string, unknown>).parent_transcript_root = commitment(55);
    assert.deepEqual(target.pendingFrontier, certificate);
    f.flush();
    assert.equal(target.certifiedTick, 6);
    assert.deepEqual(target.checkpoints[0]!.native, f.sessions[1]!.checkpoints[0]!.native);
  } finally { f.close(); }
});
