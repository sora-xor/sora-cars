import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compileStreetTrack, streetRustTable, type AuthoredStreetTrack } from './lib/street-track-compiler';
import { createStreetGraphExecutor, type StreetGraph } from '../src/game/street/graph';
import { streetHeadingAt, type CompiledStreetTrack, type StreetSample } from '../src/game/street/track';

// Std-only Rust authoring lane; no Cargo or maintained Iroha modification.
const destination = resolve('output/qualification/street-handling');
await mkdir(destination, { recursive: true });
const authored = JSON.parse(await readFile('world/authoring/tokyo-1986.json', 'utf8')) as AuthoredStreetTrack;
const tokyo = compileStreetTrack(authored);
function fixture(sign: number): CompiledStreetTrack {
  let east = 0, north = 0;
  const samples: StreetSample[] = Array.from({ length: 101 }, (_, i) => {
    if (i) { const angle = sign * (Math.min(i, 99) - 0.5) * 900 / 1e6 * Math.PI * 2;
      east += Math.sin(angle) * 5000; north += Math.cos(angle) * 5000; }
    return { progressMm: i * 5000, eastMm: Math.round(east), northMm: Math.round(north), elevationMm: 0,
      halfWidthMm: 12000, headingMicroturn: sign * Math.min(i, 99) * 900, turnPerMetre: 0, sector: 0 };
  });
  return { ...tokyo, id: `handling-fixture-${sign}`, topology: 'sprint', lengthMm: 500000, laps: 1, samples,
    gates: [{ id: 'start', sample: 0 }, { id: 'finish', sample: 100 }] };
}
// Structural fixture that isolates the width lookup, not an authored road.
const pinch = fixture(0);
pinch.id = 'handling-width-cell-fixture';
pinch.samples = pinch.samples.map((row, i) => ({ ...row, halfWidthMm: i === 1 ? 10750 : 12000,
  headingMicroturn: i === 0 ? 0 : i === 1 ? 32000 : 64000 }));
const tracks = [tokyo, fixture(0), fixture(1), fixture(-1), pinch];
const modules = ['geometry', 'graph', 'handling'].map(name => {
  const filename = name === 'handling' ? 'street_handling' : name === 'graph' ? 'street_graph' : 'street_geometry';
  return `#[path = ${JSON.stringify(resolve(`world/native/${filename}.rs`))}] mod ${name};`;
}).join('\n');
const harness = `${modules}
${tracks.map((track, i) => `mod route_${i} { ${streetRustTable(track)} }`).join('\n')}
fn main() {
    let handling = handling::build();
    if std::env::args().nth(1).as_deref() == Some("--graph") {
        println!("{}", handling.graph.to_json(&handling.outputs)); return;
    }
    let routes = [${tracks.map((_, i) => `geometry::StreetGeometry::new(route_${i}::TOPOLOGY, route_${i}::LENGTH_MM, &route_${i}::ROAD).unwrap()`).join(',')}];
    use std::io::{BufRead, Write};
    let mut output = std::io::BufWriter::new(std::io::stdout().lock());
    for line in std::io::stdin().lock().lines() {
        let row: Vec<i64> = line.unwrap().split_whitespace().map(|v| v.parse().unwrap()).collect();
        match handling.graph.evaluate(&row[1..], &routes[row[0] as usize]) {
            Ok(values) => {
                for (i, (_, value)) in handling.outputs.iter().enumerate() {
                    if i > 0 { write!(output, " ").unwrap(); }
                    write!(output, "{}", values[value.index]).unwrap();
                }
                writeln!(output).unwrap();
            },
            Err(_) => writeln!(output, "REJECT").unwrap(),
        }
    }
}
`;
const harnessPath = resolve(destination, 'handling_cli.rs'), binary = resolve(destination, 'handling_cli');
await writeFile(harnessPath, harness);
execFileSync('rustc', ['--edition=2024', '-O', '-A', 'dead_code', harnessPath, '-o', binary], { stdio: 'pipe' });
const graphJson = execFileSync(binary, ['--graph'], { encoding: 'utf8' });
await writeFile(resolve(destination, 'handling.graph.json'), graphJson);
const graph = JSON.parse(graphJson) as StreetGraph;
const execute = tracks.map(track => createStreetGraphExecutor(graph, track));
const stateFields = ['progressMm', 'lateralMm', 'speedMmPerTick', 'bodyYawMicroturn', 'velocityYawMicroturn', 'energy'];
assert.deepEqual(graph.inputs.map(p => p.name), [...stateFields, 'controls', 'rain', 'oil', 'windMmPerTick', 'active']);
const initial = [20000, 0, 0, 0, 0, 1000];
type Output = Readonly<Record<string, number>>;
const cases: { route: number; inputs: number[]; output: Output | null; label: string }[] = [];
const behavior: string[] = [];
function step(state: readonly number[], controls: number, context: { route?: number; rain?: number; oil?: number; wind?: number; active?: number } = {}, label = 'step') {
  const route = context.route ?? 1;
  const inputs = [...state, controls, context.rain ?? 0, context.oil ?? 0, context.wind ?? 0, context.active ?? 1];
  const output = execute[route]!(inputs);
  cases.push({ route, inputs, output, label });
  return output;
}
const stateOf = (output: Output) => stateFields.map(key => output[key]!);
function drive(state: number[], frames: number, controls: number, context = {}, label = 'drive') {
  let last: Output | undefined;
  for (let i = 0; i < frames; i++) { last = step(state, controls, context, label); state = stateOf(last); }
  return last!;
}

// Acceleration, braking, boost threshold and decay are behavior requirements,
// not golden snapshots copied from the arithmetic implementation.
const cruising = drive(initial, 180, 1);
assert.equal(cruising.speedMmPerTick, 2400);
assert.equal(cruising.bodyYawMicroturn, 0); assert.equal(cruising.lateralMm, 0);
const coasting = drive(stateOf(cruising), 30, 0);
const braking = drive(stateOf(cruising), 30, 3);
assert.ok(coasting.speedMmPerTick! > 0 && coasting.speedMmPerTick! < 2400);
assert.equal(braking.speedMmPerTick, 0);
behavior.push('throttle reaches 259.2 km/h; coast slows; brake overrides throttle and stops');
for (const energy of [19, 20, 21]) {
  const output = step([20000, 0, 2400, 0, 0, energy], 33);
  assert.equal(output.boosting, Number(energy >= 20));
  assert.equal(output.energy, energy >= 20 ? energy - 20 : energy + 3);
}
const boosted = drive([20000, 0, 2400, 0, 0, 1000], 20, 33);
assert.equal(boosted.speedMmPerTick, 3000);
const released = step(stateOf(boosted), 1);
assert.ok(released.speedMmPerTick! > 2400 && released.speedMmPerTick! < 3000);
assert.equal(step([20000, 0, 2400, 0, 0, 1000], 35).boosting, 0);
behavior.push('boost consumes energy only when permitted; release decays excess speed');

const start = [20000, 0, 1800, 0, 0, 1000];
const left = drive(start, 8, 5), right = drive(start, 8, 9);
for (const key of ['progressMm', 'speedMmPerTick', 'energy']) assert.equal(left[key], right[key]);
for (const key of ['lateralMm', 'bodyYawMicroturn', 'velocityYawMicroturn']) assert.equal(left[key], -right[key]!);
const cancelled = step(start, 13), straight = step(start, 1);
assert.deepEqual(stateOf(cancelled), stateOf(straight));
assert.equal(step(initial, 8).bodyYawMicroturn, 0);
const crawlRight = step(initial, 9), crawlLeft = step(initial, 5);
assert.ok(crawlRight.bodyYawMicroturn! > 0 && crawlRight.bodyYawMicroturn! < 5000);
assert.equal(crawlLeft.bodyYawMicroturn, -crawlRight.bodyYawMicroturn!);
assert.equal(crawlRight.velocityYawMicroturn, crawlRight.bodyYawMicroturn);
const stoppedProjection = step([20000, 0, 0, 0, 250000, 1000], 1);
assert.equal(stoppedProjection.velocityYawMicroturn, 0);
assert.ok(stoppedProjection.speedMmPerTick! > 0);
behavior.push('left/right mirror; opposed steering cancels; throttle crawl can steer after contact; zero momentum cannot invent launch slip');

const grip = drive(start, 8, 9), drift = drive(start, 8, 25);
assert.ok(Math.abs(drift.slipMicroturn!) > Math.abs(grip.slipMicroturn!) * 2);
assert.ok(Math.abs(drift.bodyYawMicroturn!) > Math.abs(grip.bodyYawMicroturn!));
const counter = step(stateOf(drift), 21), continuing = step(stateOf(drift), 25);
assert.ok(Math.abs(counter.slipMicroturn!) < Math.abs(continuing.slipMicroturn!));
const recovering = step(stateOf(drift), 0), stillDrifting = step(stateOf(drift), 16);
assert.ok(Math.abs(recovering.slipMicroturn!) < Math.abs(stillDrifting.slipMicroturn!));
assert.ok(recovering.speedMmPerTick! <= drift.speedMmPerTick!);
assert.ok(step(start, 9, { rain: 1 }).slipMicroturn! > step(start, 9).slipMicroturn!);
assert.ok(step(start, 9, { oil: 1 }).slipMicroturn! > step(start, 9, { rain: 1 }).slipMicroturn!);
behavior.push('drift increases body/travel separation; countersteer and grip recovery reduce it; rain/oil reduce grip');

const bend = step(start, 1, { route: 2 }), opposite = step(start, 1, { route: 3 });
assert.ok(bend.bodyYawMicroturn! < 0 && bend.velocityYawMicroturn! < 0);
assert.equal(bend.bodyYawMicroturn, bend.velocityYawMicroturn);
assert.equal(bend.bodyYawMicroturn, -bend.roadRotationMicroturn!);
assert.equal(bend.bodyYawMicroturn, -opposite.bodyYawMicroturn!);
const inside = step([20000, 4000, 1800, 0, 0, 1000], 1, { route: 2 });
const outside = step([20000, -4000, 1800, 0, 0, 1000], 1, { route: 2 });
assert.ok(inside.distanceMm! > bend.distanceMm! && outside.distanceMm! < bend.distanceMm!);
const reverse = step([20000, 0, 1000, -500000, -500000, 1000], 0);
assert.ok(reverse.distanceMm! < 0);
behavior.push('road frame rotates body and velocity once; turn mirrors and radius correction agree; reverse heading moves backward');

const contact = step([20000, 11000, 1800, 200000, 200000, 1000], 1);
assert.equal(contact.wallContact, 1); assert.equal(contact.lateralMm, 11100);
assert.equal(contact.velocityYawMicroturn, 0); assert.ok(contact.speedMmPerTick! < 1800);
const sidewaysWall = step([20000, 11100, 2400, 250000, 250000, 1000], 0);
assert.equal(sidewaysWall.wallContact, 1); assert.equal(sidewaysWall.speedMmPerTick, 0);
const reverseWall = step([20000, 11100, 2400, -500000, -500000, 1000], 0, { wind: 32 });
assert.equal(reverseWall.wallContact, 1); assert.equal(reverseWall.velocityYawMicroturn, -500000);
assert.ok(reverseWall.speedMmPerTick! > 0 && reverseWall.distanceMm! < 0);
const narrowed = step([4900, 11000, 3000, 0, 0, 1000], 33, { route: 4 });
assert.ok(narrowed.progressMm! > 10000, 'tick crosses both width-cell boundaries');
assert.equal(narrowed.wallContact, 1); assert.equal(narrowed.lateralMm, 9850);
const frozen = step([80000000, 16000, 3000, 499999, -500000, 19], 63, { active: 0, rain: 1, oil: 1, wind: 32, route: 0 });
assert.deepEqual(stateOf(frozen), [80000000, 16000, 3000, 499999, -500000, 19]);
for (const key of graph.outputs.map(p => p.name).filter(key => !stateFields.includes(key))) assert.equal(frozen[key], 0);
behavior.push('guardrail contact projects signed tangent momentum and detects skipped narrow cells; inactive output freezes all state');

// Every control encoding, environmental switch and input-range edge; seeded
// whole-domain fuzz plus closed-loop Tokyo ticks, all compared with Rust below.
for (const route of [0, 1, 2, 3]) for (const controls of Array.from({ length: 64 }, (_, i) => i)) {
  for (const energy of [0, 19, 20, 21, 1000]) for (const rain of [0, 1]) for (const oil of [0, 1]) {
    step([20000, 0, 2400, 0, 0, energy], controls, { route, rain, oil }, 'control matrix');
  }
}
let seed = 0x534f5241;
const random = (low: number, high: number) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return low + ((seed ^ (seed >>> 16)) >>> 0) % (high - low + 1);
};
for (let i = 0; i < 12000; i++) {
  const route = i % tracks.length;
  const inputs = graph.inputs.map(port => {
    const node = graph.nodes[port.node]!;
    return i % 17 === 0 ? node.low : i % 19 === 0 ? node.high : random(node.low, node.high);
  });
  const output = execute[route]!(inputs);
  cases.push({ route, inputs, output, label: 'bounded input fuzz' });
  // Closure: every accepted output can be used as the next state's inputs.
  step(stateOf(output), random(0, 63), { route }, 'state closure');
}
let simulation = [0, 0, 0, 0, 0, 1000];
let wallTicks = 0, distanceTravelledMm = 0, maxSpeedMmPerTick = 0;
for (let tick = 0; tick < 9000; tick++) {
  // Deterministic test driver keeps the long sequence moving through geometry.
  // Random button words alone can spend the entire run braking at standstill.
  const [progress, lateral, speed, body, , energy] = simulation as [number, number, number, number, number, number];
  const upcoming = streetHeadingAt(tokyo, progress + 20000) - streetHeadingAt(tokyo, progress);
  const targetYaw = Math.max(-125000, Math.min(125000, Math.trunc(upcoming / 3) - lateral * 2));
  const steeringError = targetYaw - body;
  const targetSpeed = Math.max(900, Math.min(2400, 2400 - Math.trunc(Math.abs(upcoming) / 90)));
  let controls = speed > targetSpeed + 100 ? 2 : 1;
  if (steeringError > 1200) controls |= 8; else if (steeringError < -1200) controls |= 4;
  if (Math.abs(upcoming) > 70000 && speed > 1500 && Math.floor(tick / 300) % 2 === 1) controls |= 16;
  if (Math.abs(upcoming) < 5000 && Math.abs(lateral) < 1000 && energy > 200 && speed > 1000) controls |= 32;
  const output = step(simulation, controls, { route: 0, rain: 1, wind: random(-8, 8) }, '9000-tick draft replay');
  wallTicks += output.wallContact!;
  distanceTravelledMm += Math.abs(output.distanceMm!);
  maxSpeedMmPerTick = Math.max(maxSpeedMmPerTick, output.speedMmPerTick!);
  simulation = stateOf(output);
}
assert.ok(distanceTravelledMm > tokyo.lengthMm, 'long replay must actually traverse at least one complete Tokyo lap');
assert.ok(maxSpeedMmPerTick >= 2400, 'long replay must include high-speed geometry transitions');
for (let input = 0; input < graph.inputs.length; input++) {
  const node = graph.nodes[graph.inputs[input]!.node]!;
  for (const bad of [node.low - 1, node.high + 1]) {
    const values = [...initial, 1, 0, 0, 0, 1]; values[input] = bad;
    assert.throws(() => execute[0]!(values));
    cases.push({ route: 0, inputs: values, output: null, label: 'out-of-range rejection' });
  }
}
const nativeInput = cases.map(c => [c.route, ...c.inputs].join(' ')).join('\n') + '\n';
const native = execFileSync(binary, [], { input: nativeInput, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 }).trim().split('\n');
assert.equal(native.length, cases.length);
for (let i = 0; i < cases.length; i++) {
  const c = cases[i]!;
  if (!c.output) assert.equal(native[i], 'REJECT');
  else assert.deepEqual(native[i]!.split(' ').map(Number), graph.outputs.map(port => c.output![port.name]), `${c.label} at case ${i}`);
}
const testBinary = resolve(destination, 'handling_tests');
execFileSync('rustc', ['--edition=2024', '-O', '--test', '-A', 'dead_code', harnessPath, '-o', testBinary], { stdio: 'pipe' });
const nativeTests = execFileSync(testBinary, [], { encoding: 'utf8' });
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const paths = ['world/native/street_geometry.rs', 'world/native/street_graph.rs', 'world/native/street_handling.rs',
  'src/game/street/track.ts', 'src/game/street/graph.ts', 'scripts/lib/street-track-compiler.ts',
  'scripts/test-street-handling.ts', 'world/authoring/tokyo-1986.json'];
const sources = Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(path))])));
const report = { version: 1, scope: 'Draft single-car arithmetic component; no complete race, AIR, STARK or live profile admission.',
  rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(), sources,
  graph: { nodes: graph.nodes.length, sha256: hash(graphJson), bytes: Buffer.byteLength(graphJson) },
  harnessSha256: hash(harness), binarySha256: hash(await readFile(binary)), nativeTests,
  cases: cases.length, inputMatrixAndFuzz: true, nativeBrowserExact: true, behavior,
  replay: { ticks: 9000, route: tokyo.id, controlSource: 'deterministic test steering driver with seeded wind',
    finalState: simulation, wallTicks, distanceTravelledMm, maxSpeedMmPerTick },
  qualification: { componentParity: true, fullSimulation: false, authenticatedGeometry: false, proof: false, playability: false } };
await writeFile(resolve(destination, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${cases.length} native/browser transitions and rejections agree; ${graph.nodes.length} native-authored nodes.`);
console.log(behavior.join('\n')); console.log(nativeTests.trim());
