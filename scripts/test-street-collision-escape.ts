import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadStreetGeneration, streetGenerationArgument } from './lib/street-generation';
import { createStreetGraphExecutor } from '../src/game/street/graph';
import { STREET_CAR_FIELDS } from '../src/game/street/session';
import { streetSampleAt } from '../src/game/street/track';

// A bounded composition fixture at a nonzero tick, not a genesis/replay proof.
// Only ordinary control bits change after the fixture is constructed. The
// stationary car remains running and receives no relocation or forfeit action.
const generation = await loadStreetGeneration(process.cwd(), streetGenerationArgument(process.argv.slice(2)));
const directory = generation.directory;
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const scriptPath = fileURLToPath(import.meta.url), scriptSha256 = hash(await readFile(scriptPath));
const sourcePaths = ['src/game/street/graph.ts', 'src/game/street/track.ts', 'src/game/street/session.ts', 'src/game/street/objects.ts', scriptPath];
const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(path))])));
const { bytes: bundleBytes, bundle } = await generation.readBundle(2);
assert.equal(bundle.roster, 2);
const execute = createStreetGraphExecutor(bundle.graph, bundle.track);
const milestones = bundle.track.topology === 'circuit'
  ? Array.from({ length: bundle.track.laps }, (_, lap) => bundle.track.gates.map(gate =>
    lap * bundle.track.lengthMm + bundle.track.samples[gate.sample]!.progressMm)).flat()
    .concat(bundle.track.lengthMm * bundle.track.laps)
  : bundle.track.gates.map(gate => bundle.track.samples[gate.sample]!.progressMm);
const rearProgress = 100_000, frontProgress = rearProgress + 3_602;
type Values = Readonly<Record<string, number>>;
const cases: { inputs: number[]; expected: string }[] = [];
const scenarios: { name: string; [key: string]: unknown }[] = [];

function fixture(): Values {
  const values: Record<string, number> = { tick: 30, done: 0, worldBrokenMask: 0 };
  for (const [slot, progress] of [rearProgress, frontProgress].entries()) {
    const nextGate = milestones.findIndex(gate => progress < gate);
    assert.ok(nextGate >= 0, 'fixture precedes an expected milestone');
    const state = [progress, 0, 0, 0, 0, 1_000, nextGate, 0, 0, 0, 1];
    STREET_CAR_FIELDS.forEach((name, i) => { values[`c${slot}.${name}`] = state[i]!; });
  }
  return Object.freeze(values);
}

function step(before: Values, controls: number): Values {
  const inputs = bundle.graph.inputs.map(port => {
    if (port.name.endsWith('.controls')) return port.name.startsWith('c0.') ? controls : 0;
    if (port.name.endsWith('.consensusForfeit')) return 0;
    return before[port.name]!;
  });
  const after = execute(inputs);
  cases.push({ inputs, expected: bundle.graph.outputs.map(port => after[port.name]).join(' ') });
  assert.equal(after.done, 0, 'escape does not manufacture a terminal outcome');
  for (const slot of [0, 1]) {
    assert.equal(after[`c${slot}.status`], 0, 'both cars remain eligible running cars');
    const progress = after[`c${slot}.progressMm`]!, lateral = after[`c${slot}.lateralMm`]!;
    assert.ok(Math.abs(progress - before[`c${slot}.progressMm`]!) <= 6_000, 'bounded longitudinal movement');
    assert.ok(Math.abs(lateral - before[`c${slot}.lateralMm`]!) <= 3_032, 'bounded lateral movement');
    assert.ok(Math.abs(lateral) <= streetSampleAt(bundle.track, progress).halfWidthMm - 900, 'road bounds');
  }
  for (const name of STREET_CAR_FIELDS) {
    assert.equal(after[`c1.${name}`], before[`c1.${name}`], `stationary opponent ${name}`);
  }
  const gap = Math.abs(after['c1.progressMm']! - after['c0.progressMm']!);
  const lateralGap = Math.abs(after['c1.lateralMm']! - after['c0.lateralMm']!);
  assert.ok(gap >= 3_600 || lateralGap >= 1_800, 'cars never pass through each other');
  return after;
}

for (const controls of [4, 8]) {
  let values = fixture();
  for (let tick = 0; tick < 90; tick++) {
    const before = values;
    values = step(values, controls);
    for (const name of STREET_CAR_FIELDS) assert.equal(values[`c0.${name}`], before[`c0.${name}`], 'steering without throttle at rest cannot spin or move');
  }
  scenarios.push({ name: controls === 4 ? 'stationary-left' : 'stationary-right', ticks: 90, noMovement: true });
}

for (const side of [-1, 1]) {
  let values = fixture(), beside = false, passedAt: number | null = null, contactTicks = 0;
  const snapshots: object[] = [];
  // Human-reproducible maneuver: hold throttle, steer into the open side, then
  // countersteer to face along the road. No test driver or state patch is used.
  for (let tick = 0; tick < 360; tick++) {
    if (side * values['c0.lateralMm']! >= 2_200) beside = true;
    const targetYaw = beside ? 0 : side * 110_000;
    let error = targetYaw - values['c0.bodyYawMicroturn']!;
    if (error > 500_000) error -= 1_000_000;
    else if (error < -500_000) error += 1_000_000;
    const controls = 1 | (error > 1_000 ? 8 : error < -1_000 ? 4 : 0);
    values = step(values, controls);
    contactTicks += Number(values['c0.carContact']! !== 0);
    if (tick < 12 || tick % 30 === 29) snapshots.push({ tick: tick + 1, controls,
      progress: values['c0.progressMm'], lateral: values['c0.lateralMm'], speed: values['c0.speedMmPerTick'],
      body: values['c0.bodyYawMicroturn'], velocity: values['c0.velocityYawMicroturn'], contact: values['c0.carContact'] });
    if (values['c0.progressMm']! > frontProgress + 3_602) { passedAt = tick + 1; break; }
  }
  assert.ok(contactTicks > 0, 'maneuver begins with an actual bumper contact');
  assert.ok(beside, 'driver steers laterally clear of the parked bumper');
  assert.notEqual(passedAt, null, 'throttle and steering must escape the stationary bumper within 12 seconds');
  assert.ok(values['c0.speedMmPerTick']! > 100, 'escape restores useful powered movement');
  scenarios.push({ name: side < 0 ? 'left-bumper-escape' : 'right-bumper-escape', passedAt, contactTicks,
    final: Object.fromEntries(STREET_CAR_FIELDS.map(name => [name, values[`c0.${name}`]])), snapshots });
}

await generation.verifyUnchanged();
const native = (await generation.evaluateInputs(2, cases.map(row => row.inputs))).map(row => row === null ? 'REJECT' : row.join(' '));
assert.equal(native.length, cases.length);
native.forEach((row, i) => assert.equal(row, cases[i]!.expected, `native/browser escape parity at case ${i}`));
await generation.verifyUnchanged();
for (const [path, expected] of Object.entries(sources)) assert.equal(hash(await readFile(path)), expected, `consumer source changed: ${path}`);
const report = { version: 1, scope: 'Bounded two-car control recovery regression; not a full race, replay proof, or ledger qualification.',
  generationSha256: hash(generation.manifestBytes), generation: generation.provenance(), bundleSha256: hash(bundleBytes), scriptPath, scriptSha256, sources,
  fixture: { tick: 30, rearProgressMm: rearProgress, frontProgressMm: frontProgress, gapMm: 3_602, lateralMm: 0,
    status: 'both running', initialSpeed: 0, opponentControls: 0, consensusForfeits: [0, 0] },
  comparedTransitions: cases.length, nativeBrowserExact: true, scenarios };
await writeFile(`${directory}/collision-escape.json`, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(`${cases.length} native/browser transitions agree; left and right bumper escapes pass, unpowered steering stays stationary.`);
console.log(JSON.stringify(scenarios.map(({ name, ...rest }: { name?: string; [key: string]: unknown }) => ({ name, passedAt: rest.passedAt, contactTicks: rest.contactTicks }))));
