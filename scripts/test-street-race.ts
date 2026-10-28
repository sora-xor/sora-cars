import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadStreetGeneration, streetGenerationArgument } from './lib/street-generation';
import { StreetRaceSession, STREET_CAR_FIELDS, type StreetRaceBundle, type StreetRaceState } from '../src/game/street/session';
import { createStreetGraphExecutor } from '../src/game/street/graph';
import { streetDriver } from '../src/game/street/test-driver';
import { streetSampleAt } from '../src/game/street/track';

const generation = await loadStreetGeneration(process.cwd(), streetGenerationArgument(process.argv.slice(2)));
const output = generation.directory;
const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const scriptPath = fileURLToPath(import.meta.url);
const sourcePaths = ['src/game/street/graph.ts', 'src/game/street/track.ts',
  'src/game/street/session.ts', 'src/game/street/objects.ts', 'src/game/street/test-driver.ts', scriptPath];
const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(path))])));
const cases = new Map<number, { inputs: string[]; expected: string[]; rejected: number }>();
const summaries: object[] = [], timings: number[] = [];
const bundles = new Map<number, StreetRaceBundle>();
for (const entry of generation.entries) {
  const { bundle } = await generation.readBundle(entry.roster);
  bundles.set(entry.roster, bundle); cases.set(entry.roster, { inputs: [], expected: [], rejected: 0 });
}
assert.deepEqual([...bundles.keys()], [2, 3, 4, 5, 6, 7, 8]);
const stable = (state: StreetRaceState) => ({ tick: state.tick, done: state.done, worldBrokenMask: state.worldBrokenMask,
  cars: state.cars.map(car => Object.fromEntries(STREET_CAR_FIELDS.map(name => [name, car[name]]))) });
function recordStep(session: StreetRaceSession, controls: number[], forfeits = Array(session.roster).fill(0)) {
  const before = session.values;
  const inputs = session.bundle.graph.inputs.map(port => {
    if (port.name.endsWith('.controls')) return controls[Number(port.name.slice(1, port.name.indexOf('.')))];
    if (port.name.endsWith('.consensusForfeit')) return forfeits[Number(port.name.slice(1, port.name.indexOf('.')))];
    return before[port.name];
  });
  const began = performance.now(); const state = session.step(controls, forfeits); timings.push(performance.now() - began);
  const group = cases.get(session.roster)!; group.inputs.push(inputs.join(' '));
  group.expected.push(session.bundle.graph.outputs.map(port => session.values[port.name]).join(' '));
  return state;
}
function invariants(bundle: StreetRaceBundle, state: StreetRaceState) {
  for (const car of state.cars) {
    assert.ok(STREET_CAR_FIELDS.every(name => Number.isSafeInteger(car[name])), 'integer car state');
    const width = streetSampleAt(bundle.track, car.progressMm).halfWidthMm - 900;
    assert.ok(Math.abs(car.lateralMm) <= width, `road bounds at tick${state.tick}: ${car.lateralMm}/${width}`);
    if (car.status !== 0 || state.done) assert.equal(car.speedMmPerTick, 0, 'terminal engine speed');
  }
  for (let i = 0; i < state.cars.length; i++) for (let j = i + 1; j < state.cars.length; j++) {
    const a = state.cars[i]!, b = state.cars[j]!; if (a.status !== 0 || b.status !== 0) continue;
    let gap = Math.abs(a.progressMm - b.progressMm);
    if (bundle.track.topology === 'circuit') { gap %= bundle.track.lengthMm; gap = Math.min(gap, bundle.track.lengthMm - gap); }
    assert.ok(gap >= 3600 || Math.abs(a.lateralMm - b.lateralMm) >= 1800,
      `overlap at tick${state.tick}: ${i}/${j} ds${gap} dx${Math.abs(a.lateralMm-b.lateralMm)}`);
  }
}
for (const [roster, bundle] of bundles) {
  const session = new StreetRaceSession(bundle);
  const initial = stable(session.state);
  assert.equal(session.state.tick, 0); assert.equal(session.actions.length, 0);
  for (let tick = 0; tick < 120; tick++) {
    const state = session.state;
    invariants(bundle, recordStep(session, state.cars.map((_, i) => streetDriver(bundle.track, state, i))));
  }
  assert.ok(session.state.cars.some(car => car.progressMm > 10000), 'roster must actually drive');
  const before = session.values, count = session.actions.length;
  assert.throws(() => session.step(Array(roster).fill(64)));
  assert.throws(() => session.step(Array(roster).fill(1), Array(roster).fill(2)));
  assert.equal(session.values, before); assert.equal(session.actions.length, count);
  session.reset(); assert.deepEqual(stable(session.state), initial); assert.equal(session.actions.length, 0);
  const refunds = recordStep(session, Array(roster).fill(0), Array(roster).fill(1));
  assert.equal(refunds.done, true); assert.equal(refunds.refundAllForfeit, true); assert.equal(refunds.technicalWin, false);
  assert.ok(refunds.cars.every(car => car.status === 2 && car.rank === 1));
  for (let i = 0; i < 3; i++) assert.deepEqual(stable(recordStep(session, Array(roster).fill(63))), stable(refunds));
  session.reset(); const technical = recordStep(session, Array(roster).fill(1), Array.from({ length: roster }, (_, i) => Number(i !== 0)));
  assert.equal(technical.done, true); assert.equal(technical.technicalWin, true); assert.equal(technical.refundAllForfeit, false);
  assert.equal(technical.cars[0]!.rank, 1); assert.ok(technical.cars.slice(1).every(car => car.rank === 2));
  assert.deepEqual(stable(recordStep(session, Array(roster).fill(63), Array(roster).fill(1))), stable(technical));
  const execute = createStreetGraphExecutor(bundle.graph, bundle.track);
  for (const mutate of [
    (inputs: number[]) => { inputs[0] = -1; },
    (inputs: number[]) => { inputs[1] = 1; },
    (inputs: number[]) => { inputs[2] = 1; },
    (inputs: number[]) => { inputs[3] = 100; },
    (inputs: number[]) => { inputs[3 + 7] = 1; },
    (inputs: number[]) => { inputs[3 + 9] = 1; },
    (inputs: number[]) => { inputs[3 + 11] = 64; },
  ]) {
    const inputs = [...bundle.initialInputs]; mutate(inputs); assert.throws(() => execute(inputs));
    const group = cases.get(roster)!;group.inputs.push(inputs.join(' '));group.expected.push('REJECT');group.rejected++;
  }
  const bad = structuredClone(bundle); bad.initialInputs = [...bad.initialInputs];
  (bad.initialInputs as number[])[3 + 11] = 32; assert.throws(() => new StreetRaceSession(bad), /genesis actions/);
  summaries.push({ roster, nodes: bundle.graph.nodes.length, smokeTicks: 120, genesis: true, refunds: true,
    technicalWin: true, donePadding: true, atomicInvalidInput: true });
  console.log(`${roster} racers: genesis, driving, forfeit outcomes and frozen padding pass.`);
}

const bundle = bundles.get(8)!, session = new StreetRaceSession(bundle);
let carContactTicks = 0, wallContactTicks = 0, oilTicks = 0, propHitTicks = 0, furthest = 0, maximumSpeed = 0, endedAt: number | null = null;
for (let tick = 0; tick < bundle.track.maxTicks; tick++) {
  const state = session.state;
  const next = recordStep(session, state.cars.map((_, i) => streetDriver(bundle.track, state, i)));
  invariants(bundle, next);
  carContactTicks += Number(next.cars.some(car => car.carContact));
  wallContactTicks += Number(next.cars.some(car => car.wallContact));
  oilTicks += Number(next.cars.some(car => car.oil));
  propHitTicks += Number(next.cars.some(car => car.propHitMask));
  furthest = Math.max(furthest, ...next.cars.map(car => car.progressMm));
  maximumSpeed = Math.max(maximumSpeed, ...next.cars.map(car => car.speedMmPerTick));
  if (next.done && endedAt === null) endedAt = next.tick;
  if (tick % 1000 === 999) console.log(`8-car long drive: ${tick + 1} ticks evaluated, furthest ${(furthest / 1e6).toFixed(2)} km.`);
}
assert.equal(session.state.done, true, 'finite race must terminate');
assert.ok(furthest >= bundle.track.lengthMm * bundle.track.laps, 'at least one test driver must finish the actual route');
assert.ok(oilTicks > 0 && propHitTicks > 0 && session.state.worldBrokenMask > 0, 'complete race must exercise native catalog effects');
assert.ok(maximumSpeed >= 2400, 'complete sequence must include high-speed driving');
const ended = stable(session.state);
for (let i = 0; i < 30; i++) assert.deepEqual(stable(recordStep(session, Array(8).fill(63))), ended);
assert.ok(session.state.cars.some(car => car.status === 1), 'fractional finish state must exist');
assert.ok(session.state.cars.every(car => car.status === 1), 'all eight input-driven cars must finish the complete route before the cap');

// Reconstruct a complete replay through the same native-authored computation,
// using recorded actions only. Neither final ranking nor state is an input.
const replay = new StreetRaceSession(bundle);
for (const row of session.actions) replay.step(row.slice(0, 8), row.slice(8));
assert.deepEqual(stable(replay.state), ended);
await generation.verifyUnchanged();
for (const [roster, group] of cases) {
  const actual = (await generation.evaluateInputs(roster, group.inputs.map(line => line.split(' ').map(Number)))).map(row => row === null ? 'REJECT' : row.join(' '));
  assert.equal(actual.length, group.expected.length);
  for (let i = 0; i < actual.length; i++) assert.equal(actual[i], group.expected[i], `native/browser mismatch roster${roster} case${i}`);
}
for (const [path, digest] of Object.entries(sources)) assert.equal(hash(await readFile(path)), digest, `test source changed during run: ${path}`);
await generation.verifyUnchanged();
timings.sort((a, b) => a - b);
const report = { version: 1, scope: 'Production Core/browser scalar motion parity, not a STARK, consensus or historical qualification.',
  generationSha256: hash(generation.manifestBytes), generation: generation.provenance(), sources, rosters: summaries,
  comparedTransitions: [...cases.values()].reduce((n, g) => n + g.inputs.length, 0),
  rejections: [...cases.values()].reduce((n, g) => n + g.rejected, 0), replayExact: true,
  fullDrive: { evaluatedTicks: bundle.track.maxTicks, endedAt, furthestMm: furthest, maximumSpeedMmPerTick: maximumSpeed,
    carContactTicks, wallContactTicks, oilTicks, propHitTicks, final: session.state },
  hostStepMs: { median: timings[Math.floor(timings.length * .5)], p95: timings[Math.floor(timings.length * .95)], max: timings.at(-1) },
  qualification: { nativeBrowserComposition: true, fullGameplay: false, proof: false, consensus: false, historicalAlignment: false } };
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(`${report.comparedTransitions} composed native/browser transitions and rejections agree; complete replay matches.`);
