import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRaceDnf, createRace, copyRace, stepRace } from '../src/game/engine';
import { RacePresentation, raceResultPlaces } from '../src/game/presentation';

test('render interpolation bridges tick updates without changing certified integer state', () => {
  const view = new RacePresentation(), state = createRace(0, 8);
  view.sample(state, 0); stepRace(state, Array(8).fill(1));
  const snapshot = copyRace(state);
  view.sample(state, 100);
  const halfway = view.sample(state, 100 + 1000 / 60);
  assert.ok(halfway.cars[0]!.progress > 0 && halfway.cars[0]!.progress < state.cars[0]!.progress);
  assert.deepEqual(state, snapshot);
  assert.deepEqual(view.sample(state, 1000), state);
  const rollback = createRace(0, 8);
  assert.deepEqual(view.sample(rollback, 1100), rollback, 'rollback replaces stale presentation state');
});

test('result places preserve exact ties while keeping forfeits below eligible racers', () => {
  const state = createRace(0, 5);
  state.cars[0]!.finishTick = state.cars[1]!.finishTick = 100;
  state.cars[2]!.progress = state.cars[3]!.progress = 50_000;
  state.cars[4]!.progress = 60_000; state.cars[4]!.dnf = true; state.cars[4]!.dnfTick = 96;
  assert.deepEqual([...raceResultPlaces(state)], [[0, 1], [1, 1], [2, 3], [3, 3], [4, 5]]);
});

test('forfeited finishers cannot tie eligible finishers and their late departure updates presentation immediately', () => {
  const state = createRace(0, 4), view = new RacePresentation();
  state.tick = 120;
  state.cars[0]!.finishTick = state.cars[1]!.finishTick = 100;
  state.cars[0]!.progress = state.cars[1]!.progress = 6_000_000;
  view.sample(state, 0);
  applyRaceDnf(state, [0]);
  const rendered = view.sample(state, 1);
  assert.equal(rendered.cars[0]!.dnfTick, 120, 'same-tick consensus departure appears without another driving update');
  assert.equal(rendered.cars[0]!.finishTick, 100, 'finish history remains visible');
  assert.deepEqual([...raceResultPlaces(rendered)], [[1, 1], [2, 2], [3, 2], [0, 4]]);
  assert.deepEqual([...raceResultPlaces(state)], [...raceResultPlaces(rendered)]);
});
