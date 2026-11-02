import { formatGameCommitmentLiteralV1 } from '@iroha/iroha-js/game-certificates';
import { checkpointSigningFrame, frontierSigningFrame } from '../src/chain/certificates';
import { RACE_PROFILE_ID, environmentAt, environmentContacts } from '../src/game/environment';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { raceHashLiteralV1 } from '@iroha/iroha-js/race';
import { MultiplayerRaceController, simulateNativeReplay, simulateNativeReplayWithCheckpoints } from '../src/network/controller';
import type { PeerTransport, NativeDisputeEvidence } from '../src/network/controller';
import { RacePeerSession, hex } from '../src/network/session';
import type { RaceScope, PeerMessage } from '../src/network/session';
import { nativeState, stateRoot, checkpointTranscriptRoot, mergeRaceReveals } from '../src/chain/races';
import { createRace, stepRace, stepRaceBatch } from '../src/game/engine';
import type { MeshEvent } from '../src/network/mesh';

const commitment = (n: number) => formatGameCommitmentLiteralV1(new Uint8Array(48).fill(n));
const hash = (n: number) => raceHashLiteralV1(new Uint8Array(32).fill(n | 1));
const setup = (count: number) => {
  const keys = Array.from({ length: count }, (_, i) => new Uint8Array(32).fill(i + 1));
  const scope: RaceScope = { networkId: NetworkId.fromBytes(new Uint8Array(32).fill(3)).toString(), raceId: hash(1), profileId: RACE_PROFILE_ID, activeScope: { manifest: commitment(5), admission: commitment(7) }, track: { kind: 'neon_tokyo', value: null }, epoch: 0, participants: keys.map((key, slot) => ({ slot, account: `test-account-${slot}`, inputKeyHex: hex(ed25519.getPublicKey(key)) })) };
  const queue: { slot: number; packet: PeerMessage }[] = [];
  class Transport implements PeerTransport {
    onMessage = (_packet: PeerMessage) => {}; onEvent = (_event: MeshEvent) => {}; onReplayChunk = (_slot: number, _value: unknown) => {};
    constructor(readonly slot: number) {}
    get connectedSlots() { return scope.participants.filter(p => p.slot !== this.slot).map(p => p.slot); }
    broadcast(packet: PeerMessage) { for (const slot of this.connectedSlots) queue.push({ slot, packet }); }
    offer(): Promise<string> { throw new Error('Unit transport has no SDP'); }
    accept(): Promise<string | null> { throw new Error('Unit transport has no SDP'); }
    connectSignaling(): Promise<void> { throw new Error('Unit transport has no signaling'); }
    async sendReplay() { throw new Error('Unit transport has no replay channel'); }
    close() {}
  }
  const transports = keys.map((_, slot) => new Transport(slot));
  const flush = () => { let bound = 100_000; while (queue.length) { assert.ok(--bound > 0); const row = queue.pop()!; transports[row.slot]!.onMessage(row.packet); } };
  return { keys, scope, transports, flush };
};

for (const count of [2, 8]) test(`${count} controllers reconcile real integer physics and export the certified replay`, () => {
  const { keys, scope, transports, flush } = setup(count);
  const controllers = keys.map((key, slot) => new MultiplayerRaceController({ scope, slot, privateKey: key, input: () => 1, transport: transports[slot] }));
  try {
    controllers.forEach(c => { c.onDispute = e => assert.fail(e.reason); c.start(); }); flush();
    assert.ok(controllers.every(c => c.checkpoint?.checkpoint.tick === 0));
    // Local prediction has no authority until the other racers reveal and sign their checkpoints.
    for (let tick = 0; tick < 6; tick++) controllers[0]!.tick(1);
    assert.equal(controllers[0]!.state.tick, 0); assert.equal(controllers[0]!.predictedState.tick, 6);
    for (let tick = 0; tick < 6; tick++) controllers.slice(1).forEach((c, i) => c.tick(i % 2 ? 9 : 5));
    flush();
    for (let tick = 0; tick < 18; tick++) { controllers.forEach(c => c.tick(1)); flush(); }
    assert.equal(controllers[0]!.state.tick, 24);
    for (const c of controllers) {
      assert.deepEqual(c.state, controllers[0]!.state);
      assert.deepEqual(c.state, simulateNativeReplay(c.exportNativeReplay()));
      assert.deepEqual(c.exportNativeReplay(), controllers[0]!.exportNativeReplay());
      assert.equal(c.checkpoint!.checkpoint.state_root, stateRoot(scope, c.state));
      assert.equal(c.exportReplay().source, 'multiplayer');
      assert.equal(c.session.retainedRevealedInputs.length, count * 4, 'public nonces survive four certified rounds');
      assert.deepEqual([...new Set(c.session.retainedRevealedInputs.map(reveal => reveal.start_tick))], [0, 6, 12, 18]);
      const exported = c.session.retainedRevealedInputs; exported[0]!.payload[0] ^= 1;
      assert.notDeepEqual(exported, c.session.retainedRevealedInputs, 'export cannot mutate retained evidence');
    }
    const original = controllers[0]!, retained = original.session.retainedRevealedInputs, replay = original.exportNativeReplay();
    original.stop();
    assert.deepEqual(original.session.retainedRevealedInputs, retained, 'closing transport preserves already-public openings');
    const replacement = new MultiplayerRaceController({ scope, slot: 0, privateKey: keys[0]!, input: () => 1, transport: transports[0], resume: { replay, activeSlots: scope.participants.map(p => p.slot), expectedTranscriptRoot: checkpointTranscriptRoot(scope, replay) } });
    try { assert.deepEqual(mergeRaceReveals(retained, replacement.session.retainedRevealedInputs), retained.map(reveal => ({ ...reveal, epoch: String(reveal.epoch) })), 'the public recovery archive survives controller replacement'); }
    finally { replacement.stop(); }
  } finally { controllers.forEach(c => c.stop()); }
});

test('initial-batch disagreement preserves genesis and native reveal evidence without local DNF', () => {
  const { keys, scope, transports, flush } = setup(2);
  const controller = new MultiplayerRaceController({ scope, slot: 0, privateKey: keys[0]!, input: () => 1, transport: transports[0] });
  const other = new RacePeerSession(scope, 1, keys[1]!);
  other.send = packet => transports[1]!.broadcast(packet);
  transports[1]!.onMessage = packet => other.receive(packet);
  other.onEvent = event => { if (event.type === 'inputs') other.checkpoint(commitment(19)); };
  let evidence: Parameters<typeof controller.onDispute>[0] | null = null;
  controller.onDispute = value => { evidence = value; };
  try {
    controller.start(); other.anchor(stateRoot(scope, createRace(0, 2))); flush();
    for (let tick = 0; tick < 6; tick++) controller.tick(1);
    other.commit([1, 1, 1, 1, 1, 1]); flush();
    assert.equal(controller.status.phase, 'disputed');
    const result = evidence as unknown as NativeDisputeEvidence;
    assert.ok(result); assert.equal(result.checkpoint!.checkpoint.tick, 0);
    assert.ok(result.frontier); assert.ok(result.revealedInput); assert.equal(result.instructions.length, 1);
    assert.deepEqual(nativeState(controller.state), nativeState(createRace(0, 2)));
    assert.ok(controller.state.cars.every(car => !car.dnf));
  } finally { controller.stop(); other.close(); }
});

test('a conflicting frontier retains the checkpoint for publication after a fresh ledger read', () => {
  const { keys, scope, transports, flush } = setup(2);
  const controller = new MultiplayerRaceController({ scope, slot: 0, privateKey: keys[0]!, input: () => 1, transport: transports[0] });
  const other = new RacePeerSession(scope, 1, keys[1]!);
  other.send = packet => {
    if (packet.kind === 'frontier') {
      const body = { ...(packet.body[0] as Record<string, unknown>), parent_transcript_root: commitment(29) };
      packet = { ...packet, body: [body], signature: hex(ed25519.sign(
        frontierSigningFrame(scope.networkId, body as unknown as Parameters<typeof frontierSigningFrame>[1]), keys[1]!)) };
    }
    transports[1]!.broadcast(packet);
  };
  transports[1]!.onMessage = packet => other.receive(packet);
  let evidence: NativeDisputeEvidence | undefined;
  controller.onDispute = value => { evidence = value; };
  try {
    controller.start(); other.anchor(stateRoot(scope, createRace(0, 2))); flush();
    const checkpoint = controller.checkpoint;
    for (let tick = 0; tick < 6; tick++) controller.tick(1);
    other.commit([1, 1, 1, 1, 1, 1]); flush();
    assert.equal(controller.status.phase, 'disputed');
    assert.ok(evidence);
    assert.match(evidence.reason, /different commitment frontiers/);
    assert.equal(evidence.frontier, null);
    assert.deepEqual(evidence.checkpoint, checkpoint);
    assert.deepEqual(evidence.instructions.map(instruction => Object.keys(instruction)[0]),
      ['ChallengeGameSessionV1']);
    assert.equal(evidence.frontier, null, 'checkpoint publication is constructed only after observing the complete ledger record');
    assert.equal(controller.state.tick, 0);
    assert.ok(controller.state.cars.every(car => !car.dnf));
  } finally { controller.stop(); other.close(); }
});

test('a spectator verifies the same native state without receiving any gameplay private key', async () => {
  const { RaceSpectator } = await import('../src/network/spectator');
  const { keys, scope, transports, flush } = setup(2);
  const spectator = new RaceSpectator(scope);
  const feeds: PeerMessage[] = [];
  for (const transport of transports) { const send = transport.broadcast.bind(transport); transport.broadcast = packet => { feeds.push(packet); send(packet); }; }
  const controllers = keys.map((key, slot) => new MultiplayerRaceController({ scope, slot, privateKey: key, input: () => 1, transport: transports[slot] }));
  try {
    controllers.forEach(c => c.start()); flush();
    for (let tick = 0; tick < 24; tick++) { controllers.forEach(c => c.tick(1)); flush(); }
    for (const packet of feeds) spectator.receive(packet);
    assert.deepEqual(spectator.state, controllers[0]!.state);
    assert.deepEqual(spectator.exportNativeReplay(), controllers[0]!.exportNativeReplay());
    const changed = { ...feeds.find(p => p.kind === 'commit')!, body: [commitment(27)] };
    assert.throws(() => spectator.receive(changed), /signature/);
  } finally { spectator.close(); controllers.forEach(c => c.stop()); }
});

test('a spectator follows racers whose feed packets reach the relay rounds apart', async () => {
  // Each racer publishes to the relay on its own socket, so one racer's packets can arrive several rounds before
  // another's. The spectator once kept only the next round's and dropped the rest, then stalled for good.
  const { RaceSpectator } = await import('../src/network/spectator');
  const { keys, scope, transports, flush } = setup(2);
  const spectator = new RaceSpectator(scope), statuses: string[] = [];
  spectator.onStatus = message => statuses.push(message);
  const feeds: PeerMessage[] = [];
  for (const transport of transports) { const send = transport.broadcast.bind(transport); transport.broadcast = packet => { feeds.push(packet); send(packet); }; }
  const controllers = keys.map((key, slot) => new MultiplayerRaceController({ scope, slot, privateKey: key, input: () => 1, transport: transports[slot] }));
  try {
    controllers.forEach(c => c.start()); flush();
    for (let tick = 0; tick < 48; tick++) { controllers.forEach(c => c.tick(1)); flush(); }
    // Every packet of racer 0, eight rounds of them, before any of racer 1's.
    for (const slot of [0, 1]) for (const packet of feeds.filter(p => p.slot === slot)) spectator.receive(packet);
    assert.equal(spectator.state.tick, 48);
    assert.deepEqual(spectator.state, controllers[0]!.state);
    assert.deepEqual(spectator.exportNativeReplay(), controllers[0]!.exportNativeReplay());
    assert.deepEqual(statuses.filter(status => /Rejected|cannot/.test(status)), []);
  } finally { spectator.close(); controllers.forEach(c => c.stop()); }
});

test('a spectator rejects a unanimously signed false terminal claim against its own simulation', async () => {
  const { RaceSpectator } = await import('../src/network/spectator');
  const { keys, scope, transports, flush } = setup(2);
  const spectator = new RaceSpectator(scope), feed: PeerMessage[] = [];
  const statuses: string[] = [], certifiedTicks: number[] = [];
  spectator.onStatus = message => statuses.push(message);
  spectator.onCheckpoint = certificate => certifiedTicks.push(certificate.checkpoint.tick);
  const drivers = keys.map((key, slot) => new RacePeerSession(scope, slot, key));
  const states = drivers.map(() => createRace(0, 2));
  drivers.forEach((driver, slot) => {
    driver.send = packet => { feed.push(packet); transports[slot]!.broadcast(packet); };
    transports[slot]!.onMessage = packet => driver.receive(packet);
    driver.onEvent = event => {
      if (event.type === 'inputs') {
        stepRaceBatch(states[slot]!, Array.from({ length: 6 }, (_, tick) => event.controls.map(row => row[tick]!)));
        // Both authenticated racers lie about completion while signing the
        // correct state and transcript roots. The spectator must still check it.
        driver.checkpoint(stateRoot(scope, states[slot]!), true);
      }
    };
  });
  const drain = () => { flush(); for (const packet of feed.splice(0)) spectator.receive(packet); };
  try {
    drivers.forEach((driver, slot) => driver.anchor(stateRoot(scope, states[slot]!)));
    drain();
    drivers.forEach(driver => driver.commit([1, 1, 1, 1, 1, 1]));
    drain();
    const forged = drivers[0]!.checkpoints[0]!.native;
    assert.equal(forged.checkpoint.tick, 6);
    assert.equal(forged.checkpoint.terminal, true);
    assert.equal(forged.checkpoint.state_root, stateRoot(scope, states[0]!));
    const signed = checkpointSigningFrame(scope.networkId, forged.checkpoint);
    for (const signature of forged.signatures) {
      assert.ok(ed25519.verify(Buffer.from(signature.signature, 'hex'), signed, ed25519.getPublicKey(keys[signature.slot]!), { zip215: false }));
    }
    assert.equal(spectator.state.tick, 0, 'valid signatures cannot replace deterministic completion checking');
    assert.equal(spectator.exportNativeReplay().frames.length, 0);
    assert.deepEqual(certifiedTicks, []);
    assert.match(statuses.at(-1)!, /cannot advance.*checkpoint/i);
  } finally { spectator.close(); drivers.forEach(driver => driver.close()); }
});

test('drivers and spectators receive a real mid-batch tree impact after checkpoint certification', async () => {
  const { RaceSpectator } = await import('../src/network/spectator');
  const { keys, scope, transports, flush } = setup(2), observer = new RaceSpectator(scope);
  const packets: PeerMessage[] = [], observed: number[] = [], delivered: number[][] = [[], []];
  for (const transport of transports) { const send = transport.broadcast.bind(transport); transport.broadcast = packet => { packets.push(packet); send(packet); }; }
  const controllers = keys.map((key, slot) => new MultiplayerRaceController({ scope, slot, privateKey: key, input: () => 1, transport: transports[slot] }));
  observer.onState = state => observed.push(...environmentContacts(state).filter(e => e.kind === 'tree').map(e => e.tick));
  const reference = createRace(0, 2), tree = environmentAt(0, 0).objects[0]!, expected: number[] = [];
  const drain = () => { flush(); for (const packet of packets.splice(0)) observer.receive(packet); };
  try {
    controllers.forEach((controller, slot) => {
      controller.onDispute = evidence => assert.fail(evidence.reason);
      controller.onState = state => delivered[slot]!.push(...environmentContacts(state).filter(e => e.kind === 'tree').map(e => e.tick));
      controller.start();
    }); drain();
    for (let tick = 0; tick < 90; tick++) {
      const car = reference.cars[0]!, target = car.progress < tree.progress - 60000 ? -1800 : -6500;
      const predictedX = car.x + car.vx * 4;
      const input = 1 | 16 | (predictedX > target + 200 ? 4 : predictedX < target - 200 ? 8 : 0);
      stepRace(reference, [input, 1]);
      expected.push(...environmentContacts(reference).filter(e => e.kind === 'tree').map(e => e.tick));
      controllers[0]!.tick(input); controllers[1]!.tick(1); drain();
    }
    assert.deepEqual(expected, [64], 'collision precedes the batch final tick');
    for (const events of [...delivered, observed]) assert.deepEqual([...new Set(events)], expected);
    assert.deepEqual(environmentContacts(controllers[0]!.state), [], 'later certified batches clear old effects');
    assert.deepEqual(nativeState(observer.state), nativeState(reference));
    assert.equal(controllers[0]!.checkpoint!.checkpoint.state_root, stateRoot(scope, reference));
  } finally { observer.close(); controllers.forEach(c => c.stop()); }
});

test('a late spectator resumes from a fully signed replay snapshot and follows later inputs', async () => {
  const { RaceSpectator } = await import('../src/network/spectator');
  const { keys, scope, transports, flush } = setup(2);
  const feed: PeerMessage[] = [];
  for (const transport of transports) { const send = transport.broadcast.bind(transport); transport.broadcast = packet => { feed.push(packet); send(packet); }; }
  const controllers = keys.map((key, slot) => new MultiplayerRaceController({ scope, slot, privateKey: key, input: () => 1, transport: transports[slot] }));
  let spectator: InstanceType<typeof RaceSpectator> | undefined;
  try {
    controllers.forEach(c => c.start()); flush();
    for (let tick = 0; tick < 12; tick++) { controllers.forEach(c => c.tick(1)); flush(); }
    spectator = new RaceSpectator(scope, { replay: controllers[0]!.exportNativeReplay(), checkpoint: controllers[0]!.checkpoint!, activeSlots: [0, 1] });
    feed.length = 0;
    for (let tick = 0; tick < 12; tick++) { controllers.forEach(c => c.tick(1)); flush(); }
    for (const packet of feed) spectator.receive(packet);
    assert.equal(spectator.state.tick, 24); assert.deepEqual(spectator.state, controllers[0]!.state);
  } finally { spectator?.close(); controllers.forEach(c => c.stop()); }
});


test('900 checkpoint snapshots use exactly one 5,400-frame walk and preserve pre-removal state', () => {
  const ticks = Array.from({ length: 900 }, (_, i) => (i + 1) * 6);
  let frameReads = 0;
  const frames = new Proxy(Array.from({ length: 5400 }, (_, tick) => ({ tick, controls: [0, 0, 0] })), {
    get(target, key, receiver) { if (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key)) frameReads++; return Reflect.get(target, key, receiver); },
  });
  const replay = { track: { kind: 'neon_tokyo' as const, value: null }, player_count: 3, frames, dnf_events: [{ tick: 5400, slots: [1, 2] }] };
  const result = simulateNativeReplayWithCheckpoints(replay, ticks);
  assert.equal(frameReads, 5400);
  assert.deepEqual(result.checkpointStates.map(state => state.tick), ticks);
  assert.ok(result.checkpointStates.every(state => state.cars.every(car => car.dnfTick === null)));
  assert.deepEqual(result.state.cars.map(car => car.dnfTick), [null, 5400, 5400]);
  assert.throws(() => simulateNativeReplayWithCheckpoints(replay, [6, 6]), /ordered, unique/);
});
