import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadStreetGeneration, streetGenerationArgument } from './lib/street-generation';
import { createStreetGraphExecutor } from '../src/game/street/graph';
import { STREET_CAR_FIELDS } from '../src/game/street/session';

// Explicit non-genesis component fixtures. Each result executes every node of
// the complete composed race graph; no fixture is a ledger or genesis proof.
const generation = await loadStreetGeneration(process.cwd(), streetGenerationArgument(process.argv.slice(2)));
const directory = generation.directory;
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const scriptPath = fileURLToPath(import.meta.url), scriptSha256 = hash(await readFile(scriptPath));
const sourcePaths = ['src/game/street/graph.ts', 'src/game/street/track.ts', 'src/game/street/session.ts', 'src/game/street/objects.ts', scriptPath];
const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(path))])));
const { bytes, bundle } = await generation.readBundle(2);
const execute = createStreetGraphExecutor(bundle.graph, bundle.track);
const milestones = Array.from({ length: bundle.track.laps }, (_, lap) => bundle.track.gates.map(gate =>
  lap * bundle.track.lengthMm + bundle.track.samples[gate.sample]!.progressMm)).flat().concat(bundle.track.lengthMm * bundle.track.laps);
type Values = Readonly<Record<string, number>>;
const cases: { input: number[]; output: string }[] = [];
const checks: string[] = [];
function fixture(progress: number, lateral: number, speed = 2400, body = 0): Values {
  const values: Record<string, number> = { tick: 100, done: 0, worldBrokenMask: 0 };
  for (const slot of [0, 1]) {
    const p = progress + slot * 20000;
    const car = [p, slot ? 0 : lateral, slot ? 0 : speed, body, 0, 1000,
      milestones.findIndex(gate => p < gate), 0, 0, 0, 1];
    STREET_CAR_FIELDS.forEach((name, i) => { values[`c${slot}.${name}`] = car[i]!; });
  }
  return values;
}
function inputs(values: Values, controls = [1, 0], forfeits = [0, 0]): number[] {
  return bundle.graph.inputs.map(port => port.name.endsWith('.controls') ? controls[Number(port.name[1])]!
    : port.name.endsWith('.consensusForfeit') ? forfeits[Number(port.name[1])]! : values[port.name]!);
}
function step(values: Values, controls = [1, 0], forfeits = [0, 0]): Values {
  const input = inputs(values, controls, forfeits), result = execute(input);
  cases.push({ input, output: bundle.graph.outputs.map(port => result[port.name]).join(' ') });
  return result;
}
function reject(values: Values): void {
  const input = inputs(values); assert.throws(() => execute(input)); cases.push({ input, output: 'REJECT' });
}
for (const [index, object] of bundle.objects.entries()) {
  const bit = 2 ** index;
  if (object.kind === 'oil') {
    const old = fixture(object.progressMm, object.lateralMm, 1600, 30000);
    const wet = step(old), dry = step({ ...old, 'c0.lateralMm': object.lateralMm > 0 ? -3000 : 3000 });
    assert.equal(wet['c0.oil'], 1); assert.equal(wet['c0.oilCrossed'], 1);
    assert.equal(dry['c0.oil'], 0);
    assert.notEqual(wet['c0.velocityYawMicroturn'], dry['c0.velocityYawMicroturn'], 'oil must alter handling, not just visual feedback');
    assert.equal(wet.worldBrokenMask, 0, 'oil never becomes broken');
    const entered = step(fixture(object.progressMm - object.halfLengthMm - 2000, object.lateralMm));
    assert.equal(entered['c0.oil'], 0, 'grip is sampled at tick start');
    assert.equal(entered['c0.oilCrossed'], 1, 'the complete step sweeps into oil');
    assert.equal(step(entered)['c0.oil'], 1, 'entering the zone changes next tick handling');
    const outside = step(fixture(object.progressMm + object.halfLengthMm + 1900, object.lateralMm));
    assert.equal(outside['c0.oil'], 0); assert.equal(outside['c0.oilCrossed'], 0);
    reject({ ...old, worldBrokenMask: bit });
    checks.push(`${object.id}: native oil grip, entry, exit and invalid broken bit`);
    continue;
  }
  const old = fixture(object.progressMm - object.halfLengthMm - 2000, object.lateralMm);
  const hit = step(old), broken = step({ ...old, worldBrokenMask: bit });
  assert.equal(hit['c0.propHitMask'], bit); assert.equal(hit.worldBrokenMask, bit);
  assert.equal(broken['c0.propHitMask'], 0); assert.equal(broken.worldBrokenMask, bit);
  const retention = object.kind === 'breakaway_sign' ? 224 : 160;
  assert.equal(hit['c0.speedMmPerTick'], Math.trunc(broken['c0.speedMmPerTick']! * retention / 256));
  for (const field of ['progressMm', 'lateralMm', 'nextGate', 'finishNumerator', 'finishDenominator']) {
    assert.equal(hit[`c0.${field}`], broken[`c0.${field}`], `breakaway hit cannot rewrite ${field}`);
  }
  assert.equal(step(hit)['c0.propHitMask'], 0, 'a broken prop cannot hit again');
  // Both nonoverlapping cars begin in the same expanded prop footprint. The
  // mask is shared and simultaneous, not consumed by whichever slot runs first.
  const shared: Record<string, number> = { ...fixture(object.progressMm - 1801, object.lateralMm, 1000) };
  shared['c1.progressMm'] = object.progressMm + 1801; shared['c1.lateralMm'] = object.lateralMm;
  shared['c1.speedMmPerTick'] = 1000; shared['c1.nextGate'] = milestones.findIndex(gate => shared['c1.progressMm']! < gate);
  const both = step(shared, [1, 1]), bothDry = step({ ...shared, worldBrokenMask: bit }, [1, 1]);
  assert.equal(both.worldBrokenMask, bit);
  for (const slot of [0, 1]) {
    assert.equal(both[`c${slot}.propHitMask`], bit);
    assert.equal(both[`c${slot}.speedMmPerTick`], Math.trunc(bothDry[`c${slot}.speedMmPerTick`]! * retention / 256));
  }
  const closed = step(hit, [0, 0], [1, 1]);
  assert.equal(closed.done, 1); assert.equal(closed.worldBrokenMask, bit);
  const padded = step(closed, [63, 63]);
  assert.equal(padded.worldBrokenMask, bit); assert.equal(padded.tick, closed.tick);
  for (const slot of [0, 1]) for (const field of STREET_CAR_FIELDS) assert.equal(padded[`c${slot}.${field}`], closed[`c${slot}.${field}`]);
  const nextLap = step({ ...old, 'c0.progressMm': old['c0.progressMm']! + bundle.track.lengthMm,
    'c0.nextGate': milestones.findIndex(gate => old['c0.progressMm']! + bundle.track.lengthMm < gate), worldBrokenMask: bit });
  assert.equal(nextLap['c0.propHitMask'], 0, 'shared breakage persists across circuit laps');
  checks.push(`${object.id}: dissipative hit, shared mask, no repeat or lap reset, terminal freeze`);
}
reject({ ...fixture(100000, 0), worldBrokenMask: 2 ** bundle.objects.length });
await generation.verifyUnchanged();
const native = (await generation.evaluateInputs(2, cases.map(row => row.input))).map(row => row === null ? 'REJECT' : row.join(' '));
assert.deepEqual(native, cases.map(row => row.output), 'every complete output and rejection must match Rust');
await generation.verifyUnchanged();
for (const [path, expected] of Object.entries(sources)) assert.equal(hash(await readFile(path)), expected, `consumer source changed: ${path}`);
await writeFile(`${directory}/hazard-composition.json`, JSON.stringify({ version: 1, bundleSha256: hash(bytes),
  generationSha256: hash(generation.manifestBytes), generation: generation.provenance(), scriptPath, scriptSha256, sources,
  transitionsAndRejections: cases.length, checks, fixture: 'explicit non-genesis native/browser composition',
  qualification: { proof: false, ledger: false, playability: false } }, null, 2) + '\n', { flag: 'wx' });
console.log(`${cases.length} composed native/browser hazard transitions and rejections pass.`);
