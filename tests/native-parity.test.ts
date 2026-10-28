import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { nativeSourceRoot } from '../scripts/lib/native-source-root.mjs';
import { applyRaceDnf, createRace, stepRace } from '../src/game/engine';
import { nativeRaceResult } from '../src/chain/proof';
import type { RaceResultV1 } from '@iroha/iroha-js/race';
import { verifyNativeSources } from '../scripts/lib/native-sources.mjs';

interface NativeCar {
  progress_mm: number; lateral_mm: number; speed_mm_per_tick: number;
  lateral_velocity_mm_per_tick: number; boost_energy: number;
  finish_tick: number | null; dnf_tick: number | null;
}
interface Fixture {
  trackId: number; players: number; inputs: number[][];
  dnfEvents: { tick: number; slots: number[] }[];
  checkpoints: { tick: number; cars: NativeCar[] }[];
  result: RaceResultV1;
}
const data = JSON.parse(readFileSync(new URL('./fixtures/native-race-v1.json', import.meta.url), 'utf8')) as { kernelSha256: string; rulesHash: string; fixtures: Fixture[] };
test('parity fixtures are pinned to the current native reference and verifier sources', async () => {
  const nativeRoot = nativeSourceRoot();
  const source = readFileSync(join(nativeRoot, 'crates/iroha_core/src/execution_proofs/race.rs'));
  assert.equal(createHash('sha256').update(source).digest('hex'), data.kernelSha256, 'Regenerate native golden fixtures after changing the reference source.');
  const kernels = JSON.parse(readFileSync(new URL('../src/game/generated/race-v1-kernels.json', import.meta.url), 'utf8')) as { rules_hash: string; sources: Record<string, string>; profile_sources: Record<string, string> };
  assert.equal(kernels.rules_hash, data.rulesHash, 'Native kernel and reference corpus describe the same complete relation.');
  await verifyNativeSources(kernels, async name => readFileSync(join(nativeRoot, name)));
});
for (const fixture of data.fixtures) test(`native/browser exact integer parity: track ${fixture.trackId}, ${fixture.players} cars, ${fixture.inputs.length} ticks`, () => {
  const state = createRace(fixture.trackId, fixture.players);
  let checked = 0;
  for (let tick = 0; tick <= fixture.inputs.length; tick++) {
    // Native snapshots include the current tick's consensus DNF phase.
    const event = fixture.dnfEvents.find(event => event.tick === tick);
    if (event) applyRaceDnf(state, event.slots);
    const checkpoint = fixture.checkpoints.find(cp => cp.tick === tick);
    if (checkpoint) {
      assert.deepEqual(state.cars.map(car => ({ progress_mm: car.progress, lateral_mm: car.x, speed_mm_per_tick: car.speed, lateral_velocity_mm_per_tick: car.vx, boost_energy: car.energy, finish_tick: car.finishTick, dnf_tick: car.dnfTick })), checkpoint.cars, `native snapshot at tick ${tick}`);
      checked++;
    }
    if (tick < fixture.inputs.length) stepRace(state, fixture.inputs[tick]!);
  }
  assert.equal(checked, fixture.checkpoints.length);
  assert.equal(state.tick, fixture.inputs.length);
  assert.deepEqual(nativeRaceResult(state), fixture.result, 'native and browser terminal outcomes agree exactly');
});
