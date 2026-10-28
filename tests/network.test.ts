import { checkpointTranscriptRoot } from '../src/chain/races';
import { formatGameCommitmentLiteralV1 } from '@iroha/iroha-js/game-certificates';
import { checkpointSigningFrame, frontierSigningFrame } from '../src/chain/certificates';
import { RACE_PROFILE_ID } from '../src/game/environment';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { raceHashLiteralV1 } from '@iroha/iroha-js/race';
import { RacePeerSession, hex } from '../src/network/session';
import type { PeerMessage, RaceScope } from '../src/network/session';
import { replayChunks, ReplayReceiver } from '../src/network/replay';

const commitment = (n: number) => formatGameCommitmentLiteralV1(new Uint8Array(48).fill(n));
const hash = (n: number) => raceHashLiteralV1(new Uint8Array(32).fill(n | 1));
function setup(count: number) {
  const keys = Array.from({ length: count }, (_, slot) => new Uint8Array(32).fill(slot + 1));
  const scope: RaceScope = { networkId: NetworkId.fromBytes(new Uint8Array(32).fill(3)).toString(), raceId: hash(1), profileId: RACE_PROFILE_ID, activeScope: { manifest: commitment(5), admission: commitment(7) }, track: { kind: 'neon_tokyo', value: null }, epoch: 0, participants: keys.map((key, slot) => ({ slot, account: `fixture-account-${slot}`, inputKeyHex: hex(ed25519.getPublicKey(key)) })) };
  const sessions = keys.map((key, slot) => new RacePeerSession(scope, slot, key));
  const packets: { target: number; message: PeerMessage }[] = [];
  sessions.forEach((session, sender) => {
    session.send = (message) => sessions.forEach((_, target) => { if (sender !== target) packets.push({ target, message }); });
    session.onEvent = (event) => { if (event.type === 'inputs') session.checkpoint(commitment(9)); if (event.type === 'rollback') assert.fail(event.reason); };
  });
  function flush() {
    let remaining = 100_000;
    while (packets.length) {
      assert.ok(remaining-- > 0, 'bounded protocol completes');
      // Reverse ordering exercises frontiers/reveals overtaking other peers' commitments.
      const { target, message } = packets.pop()!;
      sessions[target]!.receive(message);
    }
  }
  sessions.forEach(session => session.anchor(commitment(9)));
  flush();
  return { sessions, scope, keys, packets, flush };
}

test('drivers and spectators reject an obsolete simulation profile before creating a peer session', () => {
  const { scope, keys } = setup(2);
  for (const profileId of [undefined, hash(71)]) {
    const wrong = { ...scope, profileId } as unknown as RaceScope;
    assert.throws(() => new RacePeerSession(wrong, 0, keys[0]!), /different compiled simulation profile/);
    assert.throws(() => new RacePeerSession(wrong, -1, null), /different compiled simulation profile/);
  }
});

for (const count of [2, 8]) test(`${count} racers certify identical native transcript and checkpoint signatures`, () => {
  const { sessions, scope, flush } = setup(count);
  for (let round = 0; round < 3; round++) {
    sessions.forEach((session, slot) => session.commit([1, 1, 33, slot % 2 ? 5 : 9, 17, 2]));
    flush();
    for (const session of sessions) assert.equal(session.certifiedTick, (round + 1) * 6);
  }
  const root = sessions[0]!.checkpoints.at(-1)!.native;
  for (const session of sessions) {
    assert.deepEqual(session.checkpoints.at(-1)!.native, root);
    const message = checkpointSigningFrame(scope.networkId, root.checkpoint);
    for (const signature of root.signatures) assert.ok(ed25519.verify(Buffer.from(signature.signature, 'hex'), message, Buffer.from(scope.participants[signature.slot]!.inputKeyHex, 'hex'), { zip215: false }));
  }
});

test('wrong key, foreign race and changed controls are rejected before transcript mutation', () => {
  const { sessions, scope, packets } = setup(2);
  assert.throws(() => new RacePeerSession(scope, 0, new Uint8Array(32).fill(9)), /does not belong/);
  sessions[0]!.commit([1, 1, 1, 1, 1, 1]);
  const packet = packets[0]!.message;
  assert.throws(() => sessions[1]!.receive({ ...packet, scope: '00'.repeat(32) }), /scope/);
  assert.throws(() => sessions[1]!.receive({ ...packet, body: [commitment(29)] }), /signature/);
  assert.equal(sessions[1]!.certifiedTick, 0);
  assert.throws(() => sessions[1]!.commit([64, 1, 1, 1, 1, 1]), /six-bit/);
});

test('changing the unsigned anchor terminal flag cannot fabricate a dispute', () => {
  const { sessions, scope, keys } = setup(2);
  const certificate = sessions[0]!.anchorCheckpoint!;
  const signature = certificate.signatures.find(signature => signature.slot === 1)!;
  const original: PeerMessage = {
    v: 1, scope: sessions[0]!.scope, slot: 1, round: 0, previous: sessions[0]!.previousRoot,
    kind: 'anchor', body: [certificate.checkpoint.transcript_root, certificate.checkpoint.state_root, false],
    signature: signature.signature.toLowerCase(),
  };
  // A relay can change the flag without knowing the input key: the canonical
  // anchor signature always authenticates a nonterminal native checkpoint.
  assert.ok(ed25519.verify(Buffer.from(original.signature, 'hex'),
    checkpointSigningFrame(scope.networkId, certificate.checkpoint),
    ed25519.getPublicKey(keys[1]!), { zip215: false }));
  for (const afterCertificate of [false, true]) {
    const target = new RacePeerSession(scope, 0, keys[0]!);
    const events: string[] = [];
    target.onEvent = event => { events.push(event.type); };
    target.anchor(certificate.checkpoint.state_root);
    if (afterCertificate) target.receive(original);
    const before = target.anchorCheckpoint;
    assert.throws(() => target.receive({ ...original, body: [original.body[0], original.body[1], true] }), /anchor.*nonterminal/i);
    assert.deepEqual(target.anchorCheckpoint, before);
    target.receive(original);
    target.receive(original);
    assert.deepEqual(target.anchorCheckpoint, certificate);
    assert.deepEqual(events, ['anchored']);
    assert.doesNotThrow(() => target.commit([1, 1, 1, 1, 1, 1]), 'a tampered envelope cannot poison the honest session');
    assert.equal(target.certifiedTick, 0);
    assert.deepEqual(target.exportNativeReplay().frames, []);
    target.close();
  }
});

test('a missing participant cannot produce a frontier or disclose honest inputs', () => {
  const { sessions, packets, flush } = setup(2);
  sessions[0]!.commit([1, 1, 1, 1, 1, 1]);
  assert.ok(packets.every(({ message }) => message.kind === 'commit'));
  flush();
  assert.equal(sessions[0]!.pendingFrontier, null);
  assert.deepEqual(sessions[0]!.exportNativeReplay().frames, []);
});

test('conflicting signed frontiers cannot contaminate checkpoint recovery evidence', () => {
  const { sessions, scope, keys, packets } = setup(2);
  const honest = sessions[0]!;
  const checkpoint = honest.anchorCheckpoint;
  let reason = '', frontierAtRollback: unknown = 'not observed';
  honest.onEvent = event => {
    if (event.type === 'rollback') {
      reason = event.reason;
      // The controller reads this getter synchronously when rollback fires.
      frontierAtRollback = honest.pendingFrontier;
    }
    assert.notEqual(event.type, 'inputs', 'unagreed commitments cannot disclose a batch');
  };
  sessions.forEach(session => session.commit([1, 1, 1, 1, 1, 1]));
  for (let index; (index = packets.findIndex(packet => packet.message.kind === 'commit')) !== -1;) {
    const { target, message } = packets.splice(index, 1)[0]!;
    sessions[target]!.receive(message);
  }
  const frontier = packets.find(packet => packet.target === 0 && packet.message.kind === 'frontier')!.message;
  const body = { ...(frontier.body[0] as Record<string, unknown>), parent_transcript_root: commitment(29) };
  const signature = hex(ed25519.sign(frontierSigningFrame(scope.networkId, body as unknown as Parameters<typeof frontierSigningFrame>[1]), keys[1]!));
  honest.receive({ ...frontier, body: [body], signature });
  assert.match(reason, /different commitment frontiers/);
  assert.equal(frontierAtRollback, null);
  assert.equal(honest.pendingFrontier, null);
  assert.equal(honest.nativeRevealedInput, null);
  assert.equal(packets.some(packet => packet.message.kind === 'reveal'), false);
  assert.equal(honest.certifiedTick, 0);
  assert.deepEqual(honest.anchorCheckpoint, checkpoint, 'the certified checkpoint remains available for native recovery');
  assert.deepEqual(honest.exportNativeReplay().frames, []);
});

test('mismatched simulation roots emit rollback without extending the certificate', () => {
  const { sessions, scope, flush } = setup(2);
  let disputes = 0;
  sessions.forEach((session, slot) => { session.onEvent = (event) => { if (event.type === 'inputs') session.checkpoint(commitment(slot ? 11 : 9)); if (event.type === 'rollback') { disputes++; assert.equal(event.tick, 0); } }; });
  sessions.forEach((session) => session.commit([1, 1, 1, 1, 1, 1]));
  flush();
  assert.equal(disputes, 2);
  assert.equal(sessions[0]!.certifiedTick, 0);
  for (const session of sessions) {
    const frontier = session.pendingFrontier;
    assert.ok(frontier, 'a later checkpoint dispute must preserve the already certified input frontier');
    const { signatures, ...body } = frontier;
    const signed = frontierSigningFrame(scope.networkId, body as unknown as Parameters<typeof frontierSigningFrame>[1]);
    assert.deepEqual(signatures.map(signature => signature.slot), [0, 1]);
    for (const signature of signatures) {
      assert.ok(ed25519.verify(Buffer.from(signature.signature, 'hex'), signed,
        Buffer.from(scope.participants[signature.slot]!.inputKeyHex, 'hex'), { zip215: false }));
    }
    assert.equal(session.nativeRevealedInputs.length, 2, 'accepted public controls remain available for recovery');
  }
});

test('replay chunks are accepted only against a caller-pinned native transcript root', () => {
  const { sessions, scope, flush } = setup(2);
  sessions.forEach((session) => session.commit([1, 1, 33, 1, 1, 1])); flush();
  const replay = sessions[0]!.exportNativeReplay();
  const root = checkpointTranscriptRoot(scope, replay);
  const chunks = replayChunks(replay);
  const receiver = new ReplayReceiver(scope, root);
  let result = null;
  for (const chunk of [...chunks].reverse()) result = receiver.receive(chunk) ?? result;
  assert.deepEqual(result, replay);
  assert.throws(() => new ReplayReceiver(scope, hash(31)).receive(chunks[0]), /caller-pinned/);
  assert.throws(() => receiver.receive({ ...chunks[0], bytes: 'ff' }), /Conflicting|Malformed/);
});

function pendingFrontierSetup() {
  const fixture = setup(2);
  fixture.sessions.forEach(session => session.commit([1, 1, 1, 1, 1, 1]));
  for (let index; (index = fixture.packets.findIndex(packet => packet.message.kind === 'commit')) !== -1;) {
    const { target, message } = fixture.packets.splice(index, 1)[0]!;
    fixture.sessions[target]!.receive(message);
  }
  const frontier = fixture.packets.find(packet => packet.target === 0 && packet.message.kind === 'frontier')!.message;
  return { ...fixture, frontier };
}

test('reordered JSON frontier keys preserve signed equivalence without false equivocation', () => {
  const { sessions, scope, frontier, flush } = pendingFrontierSetup();
  const honest = sessions[0]!;
  const body = frontier.body[0] as Record<string, unknown>;
  const reordered = Object.fromEntries(Object.entries(body).reverse());
  assert.notEqual(JSON.stringify(body), JSON.stringify(reordered));
  const signed = frontierSigningFrame(scope.networkId, body as unknown as Parameters<typeof frontierSigningFrame>[1]);
  assert.deepEqual(frontierSigningFrame(scope.networkId, reordered as unknown as Parameters<typeof frontierSigningFrame>[1]), signed);
  assert.ok(ed25519.verify(Buffer.from(frontier.signature, 'hex'), signed,
    Buffer.from(scope.participants[frontier.slot]!.inputKeyHex, 'hex'), { zip215: false }));
  // No new signature: only JSON property order changes in the intercepted packet.
  honest.receive(frontier);
  const certificate = honest.pendingFrontier;
  assert.ok(certificate);
  assert.doesNotThrow(() => honest.receive({ ...frontier, body: [reordered] }));
  assert.deepEqual(honest.pendingFrontier, certificate);
  flush();
  assert.equal(honest.certifiedTick, 6);
  assert.deepEqual(honest.exportNativeReplay(), sessions[1]!.exportNativeReplay());
});

test('distinct canonical frontier bodies still produce genuine equivocation evidence', () => {
  const { sessions, scope, keys, frontier } = pendingFrontierSetup();
  const honest = sessions[0]!;
  let reason = '', evidence: readonly PeerMessage[] = [];
  honest.onEvent = event => {
    if (event.type === 'rollback') { reason = event.reason; evidence = event.evidence; }
  };
  honest.receive(frontier);
  const certificate = honest.pendingFrontier;
  const body = { ...(frontier.body[0] as Record<string, unknown>), parent_transcript_root: commitment(29) };
  const changed = { ...frontier, body: [body], signature: hex(ed25519.sign(
    frontierSigningFrame(scope.networkId, body as unknown as Parameters<typeof frontierSigningFrame>[1]), keys[frontier.slot]!)) };
  honest.receive(changed);
  assert.match(reason, /signed conflicting messages/);
  assert.deepEqual(evidence, [frontier, changed]);
  const signed = evidence.map(packet => frontierSigningFrame(scope.networkId, packet.body[0] as unknown as Parameters<typeof frontierSigningFrame>[1]));
  assert.notDeepEqual(signed[0], signed[1]);
  evidence.forEach((packet, index) => assert.ok(ed25519.verify(Buffer.from(packet.signature, 'hex'), signed[index]!,
    Buffer.from(scope.participants[packet.slot]!.inputKeyHex, 'hex'), { zip215: false })));
  assert.deepEqual(honest.pendingFrontier, certificate, 'already accepted shared frontier remains recoverable');
  assert.equal(honest.certifiedTick, 0);
});

test('canonical future duplicates do not consume capacity and stay harmless at the queue limit', () => {
  const { sessions, scope, keys, frontier } = pendingFrontierSetup();
  const honest = sessions[0]!;
  const body = { ...(frontier.body[0] as Record<string, unknown>), start_tick: 6 };
  const future = (value: Record<string, unknown>): PeerMessage => ({
    ...frontier, round: 1, body: [value], signature: hex(ed25519.sign(
      frontierSigningFrame(scope.networkId, value as unknown as Parameters<typeof frontierSigningFrame>[1]), keys[frontier.slot]!)),
  });
  const original = future(body), entries = Object.entries(body);
  honest.receive(original);
  for (let offset = 0; offset < entries.length; offset++) {
    const rotated = [...entries.slice(offset), ...entries.slice(0, offset)];
    for (const reordered of [rotated, [...rotated].reverse()]) {
      const packet = { ...original, body: [Object.fromEntries(reordered)] };
      assert.doesNotThrow(() => honest.receive(packet), 'property order cannot fill the future queue');
    }
  }
  // These are signature-valid deferred packets, not accepted future certificates.
  // Fill the remaining slots with genuinely distinct signed payloads to exercise
  // the actual queue bound without exposing or mutating private queue state.
  for (let index = 0; index < 7; index++) honest.receive(future({ ...body, parent_transcript_root: commitment(41 + index * 2) }));
  assert.doesNotThrow(() => honest.receive(original), 'an exact duplicate stays harmless even at capacity');
  assert.doesNotThrow(() => honest.receive({ ...original, body: [Object.fromEntries([...entries].reverse())] }),
    'a canonical duplicate stays harmless even at capacity');
  assert.throws(() => honest.receive(future({ ...body, parent_transcript_root: commitment(75) })), /Future input queue is full/);
  // Previous is peer routing metadata, not part of the native frontier signature.
  // Do not merge envelopes that claim different parents before that parent can
  // be checked against the next certified checkpoint on actual delivery.
  assert.throws(() => honest.receive({ ...original, previous: 'ab'.repeat(32) }), /Future input queue is full/);
  assert.equal(honest.certifiedTick, 0);
  assert.deepEqual(honest.exportNativeReplay().frames, []);
});

test('gameplay nonces retain all raw bytes and typed scope blocks cross-manifest signatures', () => {
  const { sessions, scope, packets, flush } = setup(2);
  const original = crypto.getRandomValues.bind(crypto);
  const descriptor = Object.getOwnPropertyDescriptor(crypto, 'getRandomValues');
  try {
    Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: (bytes: Uint8Array) => { bytes.fill(2); return bytes; } });
    sessions.forEach(session => session.commit([1, 1, 1, 1, 1, 1]));
    const signed = packets.find(row => row.message.kind === 'commit')!.message;
    const other = new RacePeerSession({ ...scope, activeScope: { ...scope.activeScope, manifest: commitment(17) } }, -1, null);
    assert.throws(() => other.receive(signed), /scope/);
    other.close();
    for (let index; (index = packets.findIndex(row => row.message.kind !== 'checkpoint')) !== -1;) {
      const { target, message } = packets.splice(index, 1)[0]!; sessions[target]!.receive(message);
    }
    assert.equal(sessions[0]!.nativeRevealedInput!.nonce, `nonce32:${'02'.repeat(32)}`);
    flush();
  } finally {
    if (descriptor) Object.defineProperty(crypto, 'getRandomValues', descriptor);
    else { Reflect.deleteProperty(crypto, 'getRandomValues'); assert.equal(typeof original, 'function'); }
    sessions.forEach(session => session.close());
  }
});


test('incremental preview stays pending until every checkpoint signature, then seeds exactly the next round', () => {
  const { sessions, scope, flush } = setup(2);
  const inputs = new Map<RacePeerSession, { root: string; round: number }>();
  sessions.forEach(session => { session.onEvent = event => {
    if (event.type === 'inputs') inputs.set(session, { root: event.inputsRoot, round: event.round });
    if (event.type === 'rollback') assert.fail(event.reason);
  }; });
  const initialRoot = sessions[0]!.anchorCheckpoint!.checkpoint.transcript_root;
  for (let round = 0; round < 2; round++) {
    const parentRoot = round ? sessions[0]!.checkpoints.at(-1)!.inputsRoot : initialRoot;
    sessions.forEach((session, slot) => session.commit([1, 33, slot ? 5 : 9, 17, 2, 1]));
    flush();
    for (const session of sessions) {
      assert.equal(session.certifiedTick, round * 6);
      assert.equal(session.exportNativeReplay().frames.length, round * 6);
      assert.equal(session.pendingFrontier!.parent_transcript_root, parentRoot);
      assert.equal(inputs.get(session)!.round, round);
      assert.notEqual(inputs.get(session)!.root, parentRoot);
    }
    sessions[0]!.checkpoint(commitment(9)); flush();
    sessions.forEach(session => {
      assert.equal(session.certifiedTick, round * 6, 'one signature cannot adopt a preview');
      assert.equal(session.pendingFrontier!.parent_transcript_root, parentRoot);
    });
    sessions[1]!.checkpoint(commitment(9)); flush();
    for (const session of sessions) {
      assert.equal(session.certifiedTick, (round + 1) * 6);
      const certified = session.checkpoints.at(-1)!;
      assert.equal(certified.inputsRoot, inputs.get(session)!.root);
      assert.equal(certified.inputsRoot, checkpointTranscriptRoot(scope, session.exportNativeReplay()));
      assert.equal(session.pendingFrontier, null);
    }
  }
});

test('certifying the next round never reads any previous control payload', () => {
  const { sessions, flush } = setup(2);
  sessions.forEach(session => session.commit([1, 1, 1, 1, 1, 1])); flush();
  sessions.forEach(session => session.transcript.forEach(controls => {
    for (let index = 0; index < 6; index++) Object.defineProperty(controls, index, {
      configurable: true, enumerable: true,
      get() { throw new Error('incremental round must not rebuild prior inputs'); },
    });
  }));
  sessions.forEach(session => session.commit([33, 9, 17, 2, 1, 1])); flush();
  sessions.forEach(session => {
    assert.equal(session.certifiedTick, 12);
    session.transcript.forEach(controls => {
      for (let index = 0; index < 6; index++) Object.defineProperty(controls, index, { configurable: true, enumerable: true, writable: true, value: 1 });
    });
    assert.equal(session.exportNativeReplay().frames.length, 12);
  });
});
