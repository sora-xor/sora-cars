import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileStreetTrack, type AuthoredStreetTrack } from '../scripts/lib/street-track-compiler';
import { streetPresentation } from '../src/game/street/presentation';

const authored = JSON.parse(readFileSync(new URL('../world/authoring/tokyo-1986.json', import.meta.url), 'utf8')) as AuthoredStreetTrack;
const tokyo = compileStreetTrack(authored);
const neutral = compileStreetTrack({ ...authored, id: 'presentation-other-city' });
const cueTicks = [0, 1440, 3480, 5040, 6420] as const;
const chapterMs = [48000, 68000, 52000, 46000, 40952] as const;
const chapters = [
  ['序', '序・静かな点火', 'QUIET IGNITION'],
  ['破', '破・街の鼓動', 'CITY PULSE'],
  ['破', '破・交錯', 'CROSSCURRENTS'],
  ['急', '急・解放', 'BREAK FREE'],
  ['急', '急・暁へ', 'INTO THE DAWN'],
] as const;
const songMs = 254952;

function near(actual: number, expected: number, message = ''): void {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, received ${actual}`);
}

function freezeDeep(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeDeep(child);
  Object.freeze(value);
}
freezeDeep(tokyo);
freezeDeep(neutral);

test('the admitted Tokyo soundtrack selects the new chapter on each exact cue tick', () => {
  assert.equal(tokyo.id, 'tokyo-1986');
  assert.equal(tokyo.sound.durationMs, songMs);
  assert.deepEqual(tokyo.sound.cuesMs, [0, 48000, 116000, 168000, 214000]);
  for (const [index, tick] of cueTicks.entries()) {
    const at = streetPresentation(tokyo, tick);
    assert.equal(at.index, index);
    assert.equal(at.elapsedMs, 0);
    assert.equal(at.durationMs, chapterMs[index]);
    assert.equal(at.progress, 0);
    assert.equal(at.transition, 1);
    assert.deepEqual([at.stage, at.japanese, at.english], chapters[index]);
    const after = streetPresentation(tokyo, tick + 1);
    assert.equal(after.index, index);
    near(after.elapsedMs, 1000 / 30, 'one simulation tick into the chapter');
    if (index) {
      const before = streetPresentation(tokyo, tick - 1);
      assert.equal(before.index, index - 1);
      near(before.elapsedMs, chapterMs[index - 1]! - 1000 / 30);
      assert.ok(before.progress < 1 && before.progress > 0.99);
      assert.ok(at.dawn >= before.dawn, 'dawn does not reset at a chapter boundary');
      assert.notEqual(at.japanese, before.japanese, 'each cue introduces a different chapter');
      assert.notEqual(at.english, before.english);
    }
  }
});

test('chapter timing is local, while dawn stays bounded and advances through the entire song', () => {
  for (const [index, tick] of cueTicks.entries()) {
    const tenSeconds = streetPresentation(tokyo, tick + 300);
    assert.equal(tenSeconds.index, index);
    near(tenSeconds.elapsedMs, 10000);
    near(tenSeconds.progress, 10000 / chapterMs[index]!);
  }
  let previousDawn = -1;
  for (let tick = 0; tick <= 7649; tick++) {
    const view = streetPresentation(tokyo, tick);
    assert.ok(Number.isFinite(view.dawn) && view.dawn >= 0 && view.dawn <= 1);
    assert.ok(view.dawn >= previousDawn, `dawn rewound at tick ${tick}`);
    assert.ok(view.progress >= 0 && view.progress <= 1);
    previousDawn = view.dawn;
  }
  assert.equal(streetPresentation(tokyo, 0).dawn, 0);
  assert.equal(streetPresentation(tokyo, 7649).dawn, 1);
});

test('every chapter transition remains visible for three seconds and ends at four', () => {
  for (const tick of cueTicks) {
    for (const offset of [0, 1, 89, 90]) assert.equal(streetPresentation(tokyo, tick + offset).transition, 1);
    const halfway = streetPresentation(tokyo, tick + 105).transition;
    assert.ok(halfway > 0 && halfway < 1);
    const last = streetPresentation(tokyo, tick + 119).transition;
    assert.ok(last > 0 && last < halfway);
    assert.equal(streetPresentation(tokyo, tick + 120).transition, 0);
    assert.equal(streetPresentation(tokyo, tick + 300).transition, 0);
  }
});

test('the fractional 30 Hz song endpoint clamps only on the first tick after the final audio sample', () => {
  const before = streetPresentation(tokyo, 7648);
  assert.equal(before.index, 4);
  near(before.elapsedMs, 40933 + 1 / 3);
  near(before.durationMs - before.elapsedMs, 18 + 2 / 3);
  assert.ok(before.progress < 1 && before.dawn < 1);
  assert.deepEqual(streetPresentation(tokyo, songMs * 30 / 1000), before,
    'fractional render ticks use the last complete simulation tick');
  const end = streetPresentation(tokyo, 7649);
  assert.equal(end.index, 4);
  assert.equal(end.elapsedMs, 40952);
  assert.equal(end.durationMs, 40952);
  assert.equal(end.progress, 1);
  assert.equal(end.dawn, 1);
  assert.equal(end.transition, 0);
  assert.deepEqual(streetPresentation(tokyo, tokyo.maxTicks), end);
  assert.deepEqual(streetPresentation(tokyo, tokyo.maxTicks + 300), end);
});

test('rewinds and repeated paused ticks do not retain another scene or mutate compiled track data', () => {
  const original = structuredClone(tokyo), otherOriginal = structuredClone(neutral);
  const atStart = streetPresentation(tokyo, 0);
  const atFirstTurn = streetPresentation(tokyo, 1440);
  const paused = streetPresentation(tokyo, 3501);
  for (const tick of [7649, 6420, 5040, 3480, 0, 1440, 9000, 17]) {
    streetPresentation(tokyo, tick);
    streetPresentation(neutral, tick);
    assert.deepEqual(streetPresentation(tokyo, 3501), paused, 'same tick is independent of intervening samples');
  }
  assert.deepEqual(streetPresentation(tokyo, 0), atStart);
  assert.deepEqual(streetPresentation(tokyo, 1440), atFirstTurn);
  for (const tick of [-1, -30, NaN, Infinity, -Infinity]) assert.deepEqual(streetPresentation(tokyo, tick), atStart);
  assert.deepEqual(tokyo, original, 'presentation never writes geometry, gates, music timing or physics limits');
  assert.deepEqual(neutral, otherOriginal);
});

test('other tracks retain their own cue timing without Tokyo narration, dawn or transitions', () => {
  for (const [index, tick] of cueTicks.entries()) {
    const view = streetPresentation(neutral, tick);
    assert.equal(view.index, index);
    assert.equal(view.stage, '序');
    assert.equal(view.japanese, '走りの時間');
    assert.equal(view.english, 'ON THE ROAD');
    assert.equal(view.elapsedMs, 0);
    assert.equal(view.durationMs, chapterMs[index]);
    assert.equal(view.progress, 0);
    assert.equal(view.dawn, 0);
    assert.equal(view.transition, 0);
  }
  const later = streetPresentation(neutral, 6470);
  assert.equal(later.index, 4);
  near(later.elapsedMs, 5000 / 3);
  assert.equal(later.dawn, 0);
  assert.equal(later.transition, 0);
});
