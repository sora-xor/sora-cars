import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nativeSourceRoot } from '../scripts/lib/native-source-root.mjs';
import { encodeClassedRaceValueV1 } from '@iroha/iroha-js/classed-race';
import type { ClassedRaceReplayV1, ClassedRaceStateV1 } from '@iroha/iroha-js/classed-race';
import { applyTouringDnf, copyTouringRace, createTouringRace, restoreTouringRace, simulateTouringReplay, stepTouringRace, touringDisplayState, touringFinished, touringResult, TOURING_PROFILE_ID, TOURING_RULES_HASH } from '../src/game/classed';
import { RACE_PROFILE_ID, RACE_RULES_HASH, environmentContacts } from '../src/game/environment';
import { verifyClassedNativeSources } from '../scripts/lib/classed-native-sources.mjs';
import generated from '../src/game/generated/classed-race-v1-kernels.json';

const corpus = JSON.parse(readFileSync(new URL('./fixtures/native-classed-race-v1.json', import.meta.url), 'utf8'));
const canonicalState = (value: ClassedRaceStateV1) => encodeClassedRaceValueV1('ClassedRaceStateV1', value);
const names = ['neon_tokyo', 'harbor', 'sakura'] as const;
const replay = (fixture: typeof corpus.fixtures[number]): ClassedRaceReplayV1 => ({ version: 1, class_id: { kind: 'touring_s1', value: null }, track: { kind: names[fixture.trackId]!, value: null }, player_count: fixture.players, frames: fixture.inputs.map((controls: number[], tick: number) => ({ tick, controls })), dnf_events: fixture.dnfEvents });

test('Touring browser artifacts match their distinct complete current native relation', async () => {
  assert.notEqual(TOURING_PROFILE_ID, RACE_PROFILE_ID); assert.notEqual(TOURING_RULES_HASH, RACE_RULES_HASH);
  assert.equal(corpus.profileId, generated.profile_id); assert.equal(corpus.rulesHash, generated.rules_hash);
  assert.equal(corpus.kernelSha256, generated.sources['reference.rs']);
  await verifyClassedNativeSources(generated, async name => readFileSync(join(nativeSourceRoot(), name)));
  await assert.rejects(verifyClassedNativeSources({ ...generated, profile_sources: { ...generated.profile_sources, '../unexpected': '0'.repeat(64) } }, async () => { throw new Error('must not read untrusted paths'); }), /inventory/);
});

for (const fixture of corpus.fixtures) test(`native Touring adapter parity: track ${fixture.trackId}, ${fixture.players} cars, ${fixture.inputs.length} ticks`, () => {
  const race = createTouringRace(fixture.trackId, fixture.players);
  for (let tick = 0; tick <= fixture.inputs.length; tick++) {
    const event = fixture.dnfEvents.find((event: { tick: number }) => event.tick === tick); if (event) applyTouringDnf(race, event.slots);
    const bytes = Buffer.alloc(4 + race.state.cars.length * 56); bytes.writeUInt32LE(tick); let offset = 4;
    for (const car of race.state.cars) for (const value of [car.progress_mm, car.lateral_mm, car.speed_mm_per_tick, car.lateral_velocity_mm_per_tick, car.boost_energy, car.finish_tick ?? 0, car.dnf_tick === null ? 0 : car.dnf_tick + 1]) { bytes.writeBigInt64LE(BigInt(value), offset); offset += 8; }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.state_hashes[tick], `native state at tick ${tick}`);
    if (tick < fixture.inputs.length) stepTouringRace(race, fixture.inputs[tick]);
  }
  assert.deepEqual(touringResult(race), fixture.result);
  assert.equal(touringFinished(race), true);
  assert.throws(() => stepTouringRace(race, Array(fixture.players).fill(0)), /terminal/);
  const restored = simulateTouringReplay(replay(fixture), TOURING_PROFILE_ID, TOURING_RULES_HASH);
  assert.deepEqual(canonicalState(restored.state), canonicalState(race.state));
});

test('Touring keeps native tree, sign and oil contacts through copies and renderer views', () => {
  let checked = 0;
  for (const fixture of corpus.transitions) {
    const race = restoreTouringRace(fixture.before, TOURING_PROFILE_ID, TOURING_RULES_HASH);
    stepTouringRace(race, fixture.controls);
    assert.deepEqual(canonicalState(race.state), canonicalState(fixture.after), fixture.name);
    const events = environmentContacts(touringDisplayState(race));
    const kinds = fixture.events.flatMap((values: number[], slot: number) => values[0] || values[1] ? [{ slot, kind: ['tree', 'sign', 'oil'][values[2]!] }] : []);
    assert.deepEqual(events.map(({ slot, kind }) => ({ slot, kind })), kinds, fixture.name);
    if (events.length) {
      const copy = copyTouringRace(race);
      assert.deepEqual(environmentContacts(touringDisplayState(copy)), events);
      copy.state.cars[0]!.speed_mm_per_tick = 0;
      assert.notEqual(copy.state.cars, race.state.cars);
      assert.ok(Object.isFrozen(events)); checked++;
    }
  }
  assert.ok(checked > 0);
});

test('Touring rejects stock, stale identities, malformed controls and out-of-bounds state before mutation', () => {
  const race = createTouringRace(0, 2), before = copyTouringRace(race);
  for (const profile of [RACE_PROFILE_ID, 'unknown']) assert.throws(() => restoreTouringRace(race.state, profile, TOURING_RULES_HASH), /mismatch/);
  assert.throws(() => restoreTouringRace(race.state, TOURING_PROFILE_ID, RACE_RULES_HASH), /mismatch/);
  for (const row of [[1], [64, 0], [-1, 0], [NaN, 0], [1.5, 0]]) { assert.throws(() => stepTouringRace(race, row)); assert.deepEqual(race, before); }
  for (const slot of [[0, 0], [1, 0], [2], [-1]]) { assert.throws(() => applyTouringDnf(race, slot)); assert.deepEqual(race, before); }
  const invalid = structuredClone(race.state); invalid.cars[0]!.speed_mm_per_tick = 3301;
  assert.throws(() => restoreTouringRace(invalid, TOURING_PROFILE_ID, TOURING_RULES_HASH), /classed speed must be 0\.\.3300/);
  assert.deepEqual(race, before);
});

test('Touring prizes exclude forfeited finishers and split eligible exact ties only after termination', () => {
  const race = createTouringRace(0, 3);
  assert.deepEqual(touringResult(race).winners, []);
  race.state.tick = 6;
  for (const car of race.state.cars) { car.progress_mm = 6_000_000; car.finish_tick = 3; }
  assert.deepEqual(touringResult(race).winners, [0, 1, 2]);
  applyTouringDnf(race, [0]);
  assert.deepEqual(touringResult(race).winners, [1, 2]);
  assert.equal(touringResult(race).standings.at(-1)!.slot, 0);
  assert.throws(() => applyTouringDnf(race, [0]), /removal/);
  applyTouringDnf(race, [1, 2]); assert.deepEqual(touringResult(race).winners, []);
});

test('Touring replay import rejects trailing terminal frames and repeated removals', () => {
  const fixture = corpus.fixtures[0], value = replay(fixture);
  assert.throws(() => simulateTouringReplay(value, RACE_PROFILE_ID, TOURING_RULES_HASH), /mismatch/);
  assert.throws(() => simulateTouringReplay({ ...value, frames: [...value.frames, { tick: value.frames.length, controls: [0, 0] }] }, TOURING_PROFILE_ID, TOURING_RULES_HASH), /terminal/);
  assert.throws(() => simulateTouringReplay({ ...value, dnf_events: [...value.dnf_events, ...value.dnf_events] }, TOURING_PROFILE_ID, TOURING_RULES_HASH), /order/);
});

test('mutating a returned Touring result cannot alter class selection or another result', () => {
  const race = createTouringRace(0, 2), first = touringResult(race), second = touringResult(race);
  assert.notEqual(first.class_id, second.class_id);
  (first.class_id as { kind: string }).kind = 'tampered';
  assert.equal(touringResult(race).class_id.kind, 'touring_s1');
  assert.equal(createTouringRace(1, 8).state.class_id.kind, 'touring_s1');
});
