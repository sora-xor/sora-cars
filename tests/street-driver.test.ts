import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileStreetTrack, type AuthoredStreetTrack } from '../scripts/lib/street-track-compiler';
import { streetDriver } from '../src/game/street/test-driver';
import type { StreetCarState, StreetRaceState } from '../src/game/street/session';

const track = compileStreetTrack(JSON.parse(readFileSync(new URL('../world/authoring/tokyo-1986.json', import.meta.url), 'utf8')) as AuthoredStreetTrack);
const car = (progressMm: number, lateralMm: number, speedMmPerTick: number): StreetCarState => ({
  progressMm, lateralMm, speedMmPerTick, bodyYawMicroturn: 0, velocityYawMicroturn: 0, energy: 1000,
  nextGate: 1, status: 0, finishTick: 0, finishNumerator: 0, finishDenominator: 1,
  rank: 1, boosting: 0, drifting: 0, wallContact: 0, carContact: 0, skin: 0, oil: 0, oilCrossed: 0, propHitMask: 0,
});
const state = (...cars: StreetCarState[]): StreetRaceState => ({ tick: 100, done: false, worldBrokenMask: 0, rain: 0,
  windMmPerTick: 0, refundAllForfeit: false, technicalWin: false, cars });

test('street followers brake early and hold when both passing sides are blocked', () => {
  assert.equal(streetDriver(track, state(car(50000, -1100, 2400), car(75000, -1100, 0)), 0) & 3, 2);
  const blocked = state(car(50000, -1100, 0), car(54000, -1100, 0), car(50000, -3300, 0), car(50000, 1100, 0));
  assert.equal(streetDriver(track, blocked, 0) & 3, 2);
  const open = streetDriver(track, state(car(50000, -1100, 0), car(54000, -1100, 0)), 0);
  assert.equal(open & 3, 1, 'an open side permits a deliberate powered crawl');
  assert.ok((open & 12) !== 0, 'crawl must steer into the open side');
});

test('street passing lanes see the same physical car across circuit lap offsets', () => {
  const occupied = state(car(50000, -1100, 0), car(54000, -1100, 0), car(50000, -3300, 0), car(50000, 1100, 0));
  const control = streetDriver(track, occupied, 0);
  assert.equal(control & 3, 2);
  for (const lap of [-1, 1, 2]) {
    const offset = structuredClone(occupied);
    offset.cars[3]!.progressMm += track.lengthMm * lap;
    assert.equal(streetDriver(track, offset, 0), control);
  }
});

test('street practice driver emits controls without modifying simulation state', () => {
  const race = state(car(50000, -1100, 1000), car(55000, -1100, 1000));
  const before = structuredClone(race), controls = streetDriver(track, race, 0);
  assert.deepEqual(race, before);
  assert.ok(Number.isInteger(controls) && controls >= 0 && controls < 64);
  assert.equal(streetDriver(track, { ...race, done: true }, 0), 0);
  for (const status of [1, 2, 3]) {
    const terminal = structuredClone(race); terminal.cars[0]!.status = status;
    assert.equal(streetDriver(track, terminal, 0), 0);
  }
});
