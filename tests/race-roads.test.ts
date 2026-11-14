import test from 'node:test';
import assert from 'node:assert/strict';
import roads from '../src/game/generated/arcade-roads.json';
import kernels from '../src/game/generated/race-v1-kernels.json';
import { RACE_ROAD, raceRoadCoefficients } from '../src/game/race-roads-table';
import { HELD_DRIFT_PUSH, HELD_WHEEL_PUSH, RACE_RAIL_MM, bendForce, bendSpeedLimit, raceRoad } from '../src/game/race-roads';
import { arcadePlan } from '../src/game/arcade-geography';

test('live races run the road the local races drive: the native table is the plan\'s own bends', () => {
  const environment = (kernels as unknown as { environment: { road: number[] }[] }).environment;
  for (let track = 0; track < 3; track++) {
    const derived = raceRoadCoefficients(roads, track);
    assert.deepEqual(environment[track]!.road, derived, `track ${track}: regenerate the native road table`);
    assert.deepEqual(raceRoad(track), derived);
    // Each coefficient is the bend between two of the driving model's 5 m headings, outward, at 7/1000 x 2^24.
    const plan = arcadePlan(track)!;
    for (const station of [20, 400, derived.length - 1]) {
      const kappa = (plan.headings[station + 1]! - plan.headings[station]!) / plan.step;
      assert.ok(Math.abs(derived[station]! + kappa * 7 / 1000 * RACE_ROAD.forceDivisor) <= 0.5 + 1e-6, `track ${track} station ${station}`);
    }
  }
});

test('the bend force balances a held wheel at 1.65 g and a held drift at 2.57 g', () => {
  // A 15 m hairpin: kappa = 1/15 rad/m.
  const hairpin = Math.round(7 / 15 / 1000 * RACE_ROAD.forceDivisor);
  const wheel = bendSpeedLimit(hairpin, HELD_WHEEL_PUSH), drift = bendSpeedLimit(hairpin, HELD_DRIFT_PUSH);
  assert.ok(Math.abs(wheel * 30 / 1000 * 3.6 - 56.1) < 0.2, `${wheel} mm/tick`);
  assert.ok(Math.abs(drift * 30 / 1000 * 3.6 - 70.0) < 0.2, `${drift} mm/tick`);
  assert.equal(RACE_RAIL_MM, 6520);
  // The push on the real road is outward: Hakone's sharpest right-hander (negative coefficient; about 18 m) pushes the
  // car left, its sharpest left-hander (the Ohiradai hairpin, 15 m) pushes it right.
  const road = raceRoad(0), at = (station: number) => station * RACE_ROAD.stationMm - RACE_ROAD.leadMm + 1000;
  const right = road.indexOf(Math.min(...road)), left = road.indexOf(Math.max(...road));
  assert.ok(road[right]! < -6000 && road[left]! > 7000, 'Hakone has hairpins both ways');
  assert.ok(bendForce(0, at(right), 2000) < 0, 'a right-hand hairpin pushes left');
  assert.ok(bendForce(0, at(left), 2000) > 0, 'a left-hand hairpin pushes right');
});
