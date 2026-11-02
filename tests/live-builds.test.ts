import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { raceHashLiteralV1 } from '@iroha/iroha-js/race';
import { formatGameCommitmentLiteralV1 } from '@iroha/iroha-js/game-certificates';
import { RACE_PROFILE_ID, RACE_RULES_HASH } from '../src/game/environment';
import { signAppearance, signBuild, verifyAppearance, verifyBuild } from '../src/network/appearance';
import { MultiplayerRaceController, type PeerTransport } from '../src/network/controller';
import { RacePeerSession, hex, type PeerMessage, type RaceScope } from '../src/network/session';
import { RaceSpectator } from '../src/network/spectator';
import type { MeshEvent } from '../src/network/mesh';
import { BUILD_ADDITIONS, BUILD_KEYS_V1, rivalCar, stockBuild, validateCarBuild } from '../src/game/car-builds';
import { replayState, validateReplay } from '../src/game/engine';

const keys = [1, 2].map(n => new Uint8Array(32).fill(n));
const scope: RaceScope = {
  networkId: NetworkId.fromBytes(new Uint8Array(32).fill(3)).toString(), raceId: raceHashLiteralV1(new Uint8Array(32).fill(1)), profileId: RACE_PROFILE_ID,
  activeScope: { manifest: formatGameCommitmentLiteralV1(new Uint8Array(48).fill(5)), admission: formatGameCommitmentLiteralV1(new Uint8Array(48).fill(7)) },
  track: { kind: 'neon_tokyo', value: null }, epoch: 0,
  participants: keys.map((key, slot) => ({ slot, account: `test-account-${slot}`, inputKeyHex: hex(ed25519.getPublicKey(key)) })),
};
const sessionScope = new RacePeerSession(scope, -1, null).scope;
const tokyoGt = validateCarBuild({ ...stockBuild(0, 'hokuto'), paint: 'midnight', wheels: 'mesh', spoiler: 'wing', stance: 'low', neon: 'cyan', number: 86, banner: true });
const raimei = rivalCar(11, 1, 'raimei');

test('a car build announcement binds the exact build, session scope and input key', () => {
  const packet = signBuild(sessionScope, 0, tokyoGt, keys[0]!);
  assert.deepEqual(verifyBuild(packet, sessionScope, scope.participants).build, tokyoGt);
  for (const forged of [
    { ...packet, scope: 'another-session' }, { ...packet, slot: 1 }, { ...packet, build: { ...tokyoGt, paint: 'akai' } },
    { ...packet, build: { ...tokyoGt, topSpeed: 400 } }, { ...packet, build: { ...tokyoGt, body: 'f1-car' } }, { ...packet, nftOwnership: true },
    { ...packet, build: { ...tokyoGt, neon: 'pink' } }, { ...packet, build: { ...tokyoGt, number: 87 } }, { ...packet, version: 1 }, { ...packet, version: 3 },
    { ...packet, signature: packet.signature.toUpperCase() }, signBuild(sessionScope, 0, tokyoGt, keys[1]!),
  ]) assert.throws(() => verifyBuild(forged, sessionScope, scope.participants));
  // The appearance packet is untouched: neither kind passes for the other.
  const appearance = signAppearance(sessionScope, 0, { skin: null, upgrade: null }, keys[0]!);
  assert.throws(() => verifyBuild(appearance, sessionScope, scope.participants));
  assert.throws(() => verifyAppearance(packet, sessionScope, scope.participants));
});

test('a first-release racer’s build (version 1) still reads, with the factory part for every newer option', () => {
  const first = Object.fromEntries(BUILD_KEYS_V1.map(key => [key, tokyoGt[key]]));
  const payload = new TextEncoder().encode(JSON.stringify(['sora-cars/build/v1', 1, sessionScope, 0, ...BUILD_KEYS_V1.map(key => first[key])]));
  const packet = { kind: 'build', version: 1, scope: sessionScope, slot: 0, build: first, signature: hex(ed25519.sign(payload, keys[0]!)) };
  assert.deepEqual(verifyBuild(packet, sessionScope, scope.participants).build, { ...first, ...BUILD_ADDITIONS });
  // A version 1 packet carries exactly the first format: a newer option cannot ride along unsigned.
  for (const forged of [{ ...packet, build: { ...first, neon: 'pink' } }, { ...packet, build: tokyoGt }, { ...packet, version: 2 }]) {
    assert.throws(() => verifyBuild(forged, sessionScope, scope.participants));
  }
});

test('a spectator reads a first-release racer beside a current one, and the racer’s build still binds the session', () => {
  const observer = new RaceSpectator(scope), first = Object.fromEntries(BUILD_KEYS_V1.map(key => [key, tokyoGt[key]]));
  const payload = new TextEncoder().encode(JSON.stringify(['sora-cars/build/v1', 1, sessionScope, 0, ...BUILD_KEYS_V1.map(key => first[key])]));
  const packet = { kind: 'build', version: 1, scope: sessionScope, slot: 0, build: first, signature: hex(ed25519.sign(payload, keys[0]!)) };
  observer.receive(packet); observer.receive(signBuild(sessionScope, 1, raimei, keys[1]!));
  assert.deepEqual(observer.builds, [{ ...first, ...BUILD_ADDITIONS }, raimei]);
  assert.throws(() => observer.receive(signBuild(sessionScope, 0, tokyoGt, keys[0]!)), /changed/, 'a racer cannot swap formats to change their car');
  observer.close();
});

test('spectators draw each racer’s announced car and refuse a change mid-session', () => {
  const observer = new RaceSpectator(scope);
  assert.deepEqual(observer.builds, [null, null]);
  const packet = signBuild(sessionScope, 1, raimei, keys[1]!);
  observer.receive(packet); observer.receive(JSON.parse(JSON.stringify(packet)));
  assert.deepEqual(observer.builds, [null, raimei]);
  assert.throws(() => observer.receive(signBuild(sessionScope, 1, tokyoGt, keys[1]!)), /changed/);
  assert.throws(() => observer.receive(signBuild(sessionScope, 0, tokyoGt, keys[1]!)), /signature/);
  assert.deepEqual(observer.builds, [null, raimei]);
  observer.close();
});

test('live racers keep each other’s builds, and their replay keeps them as presentation only', () => {
  class Transport implements PeerTransport {
    onMessage = (_packet: PeerMessage) => {}; onEvent = (_event: MeshEvent) => {}; onReplayChunk = (_slot: number, _value: unknown) => {};
    onBuild?: PeerTransport['onBuild'];
    get connectedSlots() { return []; }
    broadcast() {}
    offer(): Promise<string> { throw new Error('Unit transport has no SDP'); }
    accept(): Promise<string | null> { throw new Error('Unit transport has no SDP'); }
    connectSignaling(): Promise<void> { throw new Error('Unit transport has no signaling'); }
    async sendReplay() { throw new Error('Unit transport has no replay channel'); }
    close() {}
  }
  const transport = new Transport();
  const controller = new MultiplayerRaceController({ scope, slot: 0, privateKey: keys[0]!, input: () => 1, transport, build: tokyoGt });
  try {
    assert.deepEqual(controller.builds, [tokyoGt, null], 'a racer without an announcement draws the factory car');
    // The mesh delivers a peer's build only after verifyBuild (mesh.ts); a racer cannot overwrite their own.
    transport.onBuild!(1, raimei); transport.onBuild!(0, raimei);
    assert.deepEqual(controller.builds, [tokyoGt, raimei]);
    const replay = controller.exportReplay(), plain = validateReplay({ ...replay, builds: undefined });
    assert.deepEqual(validateReplay(replay).builds, [tokyoGt, raimei]);
    assert.deepEqual(replayState(validateReplay(replay)), replayState(plain), 'builds never change the simulation');
  } finally { controller.stop(); }
});

test('a RaceV1 replay keeps builds beside its inputs, null where a racer had none', () => {
  const original = { version: 1, rules: 'RaceV1', rulesHash: RACE_RULES_HASH, trackId: 0, names: ['A', 'B'], skins: [0, 1],
    inputs: Array.from({ length: 12 }, () => [1, 1]), savedAt: new Date(0).toISOString(), source: 'multiplayer' };
  const decorated = validateReplay({ ...original, builds: [tokyoGt, null] });
  assert.deepEqual(decorated.builds, [tokyoGt, null]);
  assert.deepEqual(replayState(decorated), replayState(validateReplay(original)));
  assert.equal(validateReplay(original).builds, undefined);
  assert.throws(() => validateReplay({ ...original, builds: [tokyoGt] }), /roster/);
  assert.throws(() => validateReplay({ ...original, builds: [tokyoGt, { ...raimei, wheels: 'gold-spinners' }] }), /wheels/);
  const first = Object.fromEntries(BUILD_KEYS_V1.map(key => [key, tokyoGt[key]]));
  assert.deepEqual(validateReplay({ ...original, builds: [first, null] }).builds, [{ ...first, ...BUILD_ADDITIONS }, null], 'a first-format build in a replay');
  assert.deepEqual(replayState(validateReplay({ ...original, builds: [first, null] })), replayState(validateReplay(original)));
});
