import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRaceDnf, copyRace, createRace, stepRace, stepRaceBatch, validateReplay } from '../src/game/engine';
import { environmentAt, environmentContacts, RACE_RULES_HASH } from '../src/game/environment';
import { nativeState } from '../src/chain/races';

// These are explicit transition scenarios. The native-origin 21-grid replay
// corpus separately checks every observed checkpoint against the Rust reference.
test('a swept tree collision loses speed once, pushes the car, and emits the actual circuit contact', () => {
  const state = createRace(0, 2), tree = environmentAt(0, 0).objects.find(object => object.kind === 'tree')!;
  Object.assign(state.cars[0]!, { progress: tree.progress - 500, x: tree.x, speed: 1000 });
  stepRace(state, [1, 0]);
  assert.equal(state.cars[0]!.speed, 350); assert.equal(state.cars[0]!.x, -9000);
  assert.deepEqual(environmentContacts(state), [{ tick: 0, slot: 0, kind: 'tree', objectId: tree.id }]);
  assert.equal(Object.hasOwn(nativeState(state), 'contacts'), false, 'feedback is excluded from ledger state');
  stepRace(state, [1, 0]);
  assert.equal(state.cars[0]!.speed, 300);
  assert.deepEqual(environmentContacts(state), [], 'passing the center cannot charge another impact');
});

test('a roadside sign has a distinct native speed penalty and contact identity', () => {
  const state = createRace(0, 2), sign = environmentAt(0, 0).objects.find(object => object.kind === 'sign')!;
  Object.assign(state.cars[0]!, { progress: sign.progress - 500, x: sign.x, speed: 1000 });
  stepRace(state, [1, 0]);
  assert.equal(state.cars[0]!.speed, 780);
  assert.deepEqual(environmentContacts(state), [{ tick: 0, slot: 0, kind: 'sign', objectId: sign.id }]);
});

test('certified batch snapshots retain an early collision without changing native state or leaking mutable feedback', () => {
  const batched = createRace(0, 2), tree = environmentAt(0, 0).objects.find(object => object.kind === 'tree')!;
  Object.assign(batched.cars[0]!, { progress: tree.progress - 500, x: tree.x, speed: 1000 });
  const reference = copyRace(batched), frames = Array.from({ length: 6 }, () => [1, 0]);
  for (const row of frames) stepRace(reference, row);
  assert.deepEqual(environmentContacts(reference), [], 'final tick alone has no collision');
  stepRaceBatch(batched, frames);
  assert.deepEqual(nativeState(batched), nativeState(reference));
  const snapshot = copyRace(batched), retained = environmentContacts(snapshot);
  assert.deepEqual(retained, [{ tick: 0, slot: 0, kind: 'tree', objectId: tree.id }]);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), reference, 'contacts never enter serialized physics');
  assert.ok(Object.isFrozen(retained) && Object.isFrozen(retained[0]));
  snapshot.cars[0]!.speed = 123;
  assert.notEqual(snapshot.cars[0]!.speed, batched.cars[0]!.speed);
  stepRaceBatch(batched, frames);
  assert.deepEqual(environmentContacts(batched), []);
  assert.equal(environmentContacts(snapshot).length, 1, 'later simulation cannot erase delivered evidence');
});

test('a malformed or oversized contact batch rejects before any simulation mutation', () => {
  const state = createRace(0, 2), before = copyRace(state);
  for (const frames of [[], [[1, 0], [64, 0]], Array.from({ length: 7 }, () => [1, 0])]) {
    assert.throws(() => stepRaceBatch(state, frames), /batch/);
    assert.deepEqual(state, before);
  }
});

test('the native oil patch changes steering and emits contact, while a dry surface does neither', () => {
  const slick = createRace(0, 2), oil = environmentAt(0, 0).objects.find(object => object.kind === 'oil')!;
  Object.assign(slick.cars[0]!, { progress: oil.progress, x: oil.x, speed: 1000 });
  const dry = copyRace(slick); dry.cars[0]!.x = oil.x - oil.halfWidth - 1;
  stepRace(slick, [1 | 8, 0]); stepRace(dry, [1 | 8, 0]);
  assert.equal(slick.cars[0]!.vx, 8); assert.equal(dry.cars[0]!.vx, 15);
  assert.deepEqual(environmentContacts(slick), [{ tick: 0, slot: 0, kind: 'oil', objectId: oil.id }]);
  assert.deepEqual(environmentContacts(dry), []);
});

test('rain changes native handling on its exact published tick and inactive cars produce no object contact', () => {
  assert.equal(environmentAt(0, 599).rain, 0); assert.equal(environmentAt(0, 600).rain, 1);
  const wet = createRace(0, 3); wet.tick = 600;
  const dry = copyRace(wet); dry.tick = 599;
  stepRace(wet, [1 | 8, 0, 0]); stepRace(dry, [1 | 8, 0, 0]);
  assert.equal(wet.cars[0]!.vx, 12); assert.equal(dry.cars[0]!.vx, 15);
  const tree = environmentAt(0, 600).objects[0]!;
  const inactive = createRace(0, 3); inactive.tick = 600;
  Object.assign(inactive.cars[0]!, { progress: tree.progress - 500, x: tree.x, speed: 1000 });
  applyRaceDnf(inactive, [0]); const before = { ...inactive.cars[0]! };
  stepRace(inactive, [63, 1, 1]);
  assert.deepEqual(inactive.cars[0], before); assert.deepEqual(environmentContacts(inactive), []);
});

test('a replay requires the current complete rules commitment before any input is simulated', () => {
  const replay = { version: 1, rules: 'RaceV1', rulesHash: RACE_RULES_HASH, trackId: 0, names: ['A', 'B'], skins: [0, 1], inputs: [[1, 1]], savedAt: new Date(0).toISOString(), source: 'practice' };
  assert.deepEqual(validateReplay(replay), replay);
  const { rulesHash: _hash, ...unidentified } = replay;
  assert.throws(() => validateReplay(unidentified), /unsupported/);
  assert.throws(() => validateReplay({ ...replay, rulesHash: '0'.repeat(64) }), /unsupported/);
});
