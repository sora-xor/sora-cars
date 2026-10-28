import { RACE_RULES_HASH } from '../src/game/environment';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRaceDnf, botControl, copyRace, createRace, raceFinished, rankCars, replayState, stepRace, validateReplay, type ReplayV1 } from '../src/game/engine';
import { CONTROL as C, TRACKS, curvature } from '../src/game/rules';

test('RaceV1 rejects noncanonical controls before changing any state', () => {
  const state = createRace(0, 2), before = copyRace(state);
  for (const row of [[1], [1, 64], [1, -1], [0.5, 0], [NaN, 0], [Infinity, 0]]) {
    assert.throws(() => stepRace(state, row)); assert.deepEqual(state, before);
  }
});
test('integer acceleration, brake priority, negative steering truncation and boost exhaustion', () => {
  const state = createRace(0, 2);
  stepRace(state, [C.throttle | C.left, C.throttle | C.brake]);
  assert.deepEqual([state.cars[0]!.speed, state.cars[0]!.vx, state.cars[0]!.x], [40, -15, -1815]);
  assert.equal(state.cars[1]!.speed, 0);
  state.cars[0]!.energy = 25; state.cars[0]!.speed = 2700;
  stepRace(state, [C.throttle | C.boost, 0]);
  assert.equal(state.cars[0]!.energy, 0); assert.equal(state.cars[0]!.speed, 2740);
  stepRace(state, [C.throttle | C.boost, 0]);
  assert.equal(state.cars[0]!.energy, 4); assert.equal(state.cars[0]!.speed, 2400);
});
test('collision ties resolve by slot, exact contact boundaries do not collide', () => {
  const state = createRace(0, 2);
  for (const car of state.cars) { car.x = 0; car.speed = 1000; }
  stepRace(state, [0, 0]);
  assert.deepEqual(state.cars.map(car => [car.x, car.speed]), [[-900, 868], [900, 868]]);
  stepRace(state, [0, 0]);
  assert.deepEqual(state.cars.map(car => car.speed), [856, 856]);
  const separated = createRace(0, 2);
  for (const car of separated.cars) car.x = 0;
  separated.cars[1]!.progress = 3600;
  stepRace(separated, [0, 0]);
  assert.deepEqual(separated.cars.map(car => car.x), [0, 0]);
});
test('negative grid positions use Euclidean track wrapping', () => {
  assert.equal(curvature(TRACKS[0]!, -1), TRACKS[0]!.curves[11]);
  assert.equal(curvature(TRACKS[1]!, -2_400_001), TRACKS[1]!.curves[11]);
});
test('finish ties freeze cars while consuming the entire committed six-tick batch', () => {
  const state = createRace(0, 2);
  for (const car of state.cars) { car.progress = 5_999_999; car.speed = 200; }
  stepRace(state, [C.throttle, C.throttle]);
  assert.deepEqual(state.cars.map(car => car.finishTick), [1, 1]);
  assert.equal(raceFinished(state), false);
  const finished = structuredClone(state.cars);
  for (let i = 0; i < 5; i++) stepRace(state, [63, 63]);
  assert.equal(state.tick, 6); assert.equal(raceFinished(state), true);
  assert.deepEqual(state.cars, finished);
  assert.deepEqual(rankCars(state).map(car => car.slot), [0, 1]);
});
test('consensus forfeits remove collisions and rank below every eligible driver', () => {
  const state = createRace(0, 2);
  state.cars[0]!.x = 0; state.cars[1]!.x = 0;
  applyRaceDnf(state, [1]); state.cars[1]!.progress = 2_000_000;
  stepRace(state, [1, 63]);
  assert.equal(state.cars[1]!.speed, 0); assert.equal(state.cars[1]!.dnfTick, 0);
  assert.deepEqual(rankCars(state).map(car => car.slot), [0, 1]);
  assert.throws(() => applyRaceDnf(state, [1]));
  assert.throws(() => applyRaceDnf(state, [0, 0]));
});
test('technical wins stop at the certified boundary and disqualify a departed finisher', () => {
  const survivor = createRace(0, 2); stepRace(survivor, [1, 1]); applyRaceDnf(survivor, [1]);
  assert.equal(raceFinished(survivor), false);
  for (let tick = 1; tick < 6; tick++) stepRace(survivor, [1, 0]);
  assert.equal(raceFinished(survivor), true); assert.equal(rankCars(survivor)[0]!.slot, 0);
  const departedWinner = createRace(0, 2);
  departedWinner.cars[0]!.progress = 5_999_999; departedWinner.cars[0]!.speed = 40;
  stepRace(departedWinner, [1, 1]);
  for (let tick = 1; tick < 6; tick++) stepRace(departedWinner, [0, 1]);
  applyRaceDnf(departedWinner, [0]);
  assert.equal(departedWinner.cars[0]!.dnfTick, 6); assert.equal(departedWinner.cars[0]!.finishTick, 1);
  assert.equal(raceFinished(departedWinner), true); assert.equal(rankCars(departedWinner)[0]!.slot, 1);
});
test('replays retain consensus DNF events, reject terminal padding and out-of-order events', () => {
  const replay: ReplayV1 = { version: 1, rules: 'RaceV1', rulesHash: RACE_RULES_HASH, trackId: 0, names: ['A', 'B'], skins: [0, 1], inputs: Array.from({ length: 6 }, () => [1, 1]), dnfEvents: [{ tick: 1, slots: [1] }, { tick: 6, slots: [0] }], savedAt: '2026-09-05T00:00:00Z', source: 'multiplayer' };
  const state = replayState(validateReplay(replay));
  assert.equal(state.cars[1]!.dnfTick, 1); assert.equal(state.cars[0]!.dnfTick, 6);
  assert.throws(() => validateReplay({ ...replay, inputs: [...replay.inputs, [0, 0]] }));
  assert.throws(() => validateReplay({ ...replay, dnfEvents: [...replay.dnfEvents!].reverse() }));
  assert.throws(() => validateReplay({ ...replay, savedAt: 'invalid' }));
});
test('all three full eight-car AI races terminate and exactly replay within 180 seconds', () => {
  for (let trackId = 0; trackId < 3; trackId++) {
    const state = createRace(trackId, 8), inputs: number[][] = [];
    while (!raceFinished(state)) {
      const row = state.cars.map(car => botControl(state, car.slot)); inputs.push(row); stepRace(state, row);
      for (const car of state.cars) {
        assert.ok(Number.isSafeInteger(car.x) && Math.abs(car.x) <= 16200);
        assert.ok(car.speed >= 0 && car.speed <= 3000 && car.energy >= 0 && car.energy <= 1000);
      }
    }
    assert.ok(state.tick <= 5400 && state.tick % 6 === 0);
    const r: ReplayV1 = { version: 1, rules: 'RaceV1', rulesHash: RACE_RULES_HASH, trackId, names: state.cars.map(car => `AI${car.slot}`), skins: state.cars.map(car => car.slot % 6), inputs, savedAt: '2026-09-05T00:00:00Z', source: 'practice' };
    assert.deepEqual(replayState(validateReplay(r)), state);
    assert.ok(state.cars.every(car => car.finishTick !== null), 'all AI cars can finish each track');
  }
});
