import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileStreetTrack, streetRustTable, type AuthoredStreetTrack } from '../scripts/lib/street-track-compiler';
import { streetSampleAt, streetHeadingAt, streetHeadingChange, streetIntervalAt, MAX_STREET_PROGRESS_MM } from '../src/game/street/track';

const source = JSON.parse(readFileSync(new URL('../world/authoring/tokyo-1986.json', import.meta.url), 'utf8')) as AuthoredStreetTrack;
test('street authoring freezes one closed integer circuit with ordered crossing gates', () => {
  const track = compileStreetTrack(source);
  assert.equal(track.topology, 'circuit');
  assert.ok(track.lengthMm > 5_000_000 && track.lengthMm < 9_000_000);
  assert.equal(track.laps, 2);
  assert.equal(track.targetMs, 254952);
  assert.ok(track.maxTicks > 5400, 'The song format must not alias the existing180-second relation.');
  const last = track.samples.at(-1)!;
  assert.equal(Math.abs(last.headingMicroturn - track.samples[0]!.headingMicroturn), 1000000);
  assert.deepEqual(last, { ...track.samples[0], progressMm: track.lengthMm, headingMicroturn: last.headingMicroturn });
  assert.equal(track.samples[0]!.progressMm, 0);
  assert.ok(track.gates.length >= 10);
  assert.ok(track.gates.some(g => g.id === 'shrine-front'));
  assert.ok(track.gates.some(g => g.id === 'diet-front'));
  for (let i = 1; i < track.samples.length; i++) {
    assert.ok(track.samples[i]!.progressMm > track.samples[i - 1]!.progressMm);
    assert.ok(track.samples[i]!.progressMm - track.samples[i - 1]!.progressMm <= 5000);
    assert.ok(Object.values(track.samples[i]!).every(Number.isSafeInteger));
  }
  assert.deepEqual(track.qualification, { historicalAlignment: false, nativeParity: false, proof: false });
});
test('street samples wrap negative grid positions and retain exact half-open cells', () => {
  const track = compileStreetTrack(source);
  const firstBoundary = track.samples[1]!.progressMm;
  assert.equal(streetSampleAt(track, firstBoundary - 1), track.samples[0]);
  assert.equal(streetSampleAt(track, firstBoundary), track.samples[1]);
  assert.equal(streetSampleAt(track, track.lengthMm), track.samples[0]);
  assert.equal(streetSampleAt(track, -1), track.samples.at(-2));
  assert.equal(streetSampleAt(track, -track.lengthMm), track.samples[0]);
  assert.throws(() => streetSampleAt(track, 0.5));
});
test('Rust table emits the same eight exact integer columns as browser geometry', () => {
  const track = compileStreetTrack(source);
  const rows = [...streetRustTable(track).matchAll(/^    \[([-\d, ]+)\],$/gm)].map(row => row[1]!.split(',').map(Number));
  assert.deepEqual(rows, track.samples.map(p => [p.progressMm, p.eastMm, p.northMm, p.elevationMm, p.halfWidthMm, p.headingMicroturn, p.turnPerMetre, p.sector]));
  assert.equal(compileStreetTrack(source).samples.length, rows.length);
});
test('invalid geographic, time, soundtrack and integer authoring cannot emit a native table', () => {
  const mutate = (edit: (value: any) => void) => { const value = structuredClone(source); edit(value); assert.throws(() => compileStreetTrack(value)); };
  mutate(v => v.maxTicks = 5400);
  mutate(v => v.points[0].positionE7[1] = 900000001);
  mutate(v => v.points[1].positionE7 = v.points[0].positionE7);
  mutate(v => v.points[1].halfWidthMm = 5000.5);
  mutate(v => v.points[1].id = v.points[0].id);
  mutate(v => v.sound.cuesMs = [0, 2000, 1000]);
  mutate(v => v.sound.durationMs = 10000);
  mutate(v => v.sound.asset = '../escape.m4a');
  mutate(v => v.points[0].gate = false);
  mutate(v => v.points[1].gate = 'false');
  mutate(v => v.name.ja = 17);
  mutate(v => v.points[1].positionE7 = null);
  mutate(v => v.points[1].elevationMm = 4000000);
  mutate(v => { v.points[1].cornerRadiusMm = v.points[1].cornerTrimMm; delete v.points[1].cornerTrimMm; });
  mutate(v => v.points[1] = null);
  mutate(v => delete v.topology);
  mutate(v => v.topology = 'loop');
  mutate(v => v.topology = true);
});

test('start fillets take effect and both route directions preserve exact winding', () => {
  const track = compileStreetTrack(source), sharp = structuredClone(source);
  (sharp.points[0] as { cornerTrimMm: number }).cornerTrimMm = 0;
  assert.notDeepEqual(track.samples, compileStreetTrack(sharp).samples);
  assert.notEqual(track.samples[0]!.eastMm, 0, 'start moves onto the first cyclic fillet');
  const reverse = compileStreetTrack({ ...source, points: [source.points[0]!, ...source.points.slice(1).reverse()] });
  for (const candidate of [track, reverse]) {
    const winding = candidate.samples.at(-1)!.headingMicroturn - candidate.samples[0]!.headingMicroturn;
    assert.equal(Math.abs(winding), 1000000);
    for (const p of [-candidate.lengthMm - 1, -12000, -1, 0, 4999, 5000, candidate.lengthMm - 1]) {
      assert.equal(streetHeadingAt(candidate, p + candidate.lengthMm) - streetHeadingAt(candidate, p), winding);
      assert.equal(streetHeadingAt(candidate, p + 3 * candidate.lengthMm) - streetHeadingAt(candidate, p), 3 * winding);
    }
  }
  assert.equal(streetHeadingChange(track, 0, track.lengthMm), -streetHeadingChange(reverse, 0, reverse.lengthMm));
});

test('heading changes telescope exactly across cells, closure and negative grid positions', () => {
  const track = compileStreetTrack(source), end = track.lengthMm;
  for (const [a, b, c] of [[-12000, -1, 5001], [4999, 5000, 5001], [end - 2000, end, end + 1999], [0, end - 1, end * 2]]) {
    assert.equal(streetHeadingChange(track, a!, c!), streetHeadingChange(track, a!, b!) + streetHeadingChange(track, b!, c!));
    assert.equal(streetHeadingChange(track, a!, b!), -streetHeadingChange(track, b!, a!) || 0);
  }
  // Pin signed truncation with a known negative-slope cell and a nonuniform last cell.
  for (const i of [track.samples.findIndex((p, i) => i < track.samples.length - 1 && track.samples[i + 1]!.headingMicroturn < p.headingMicroturn), track.samples.length - 2]) {
    const a = track.samples[i]!, b = track.samples[i + 1]!;
    const offset = Math.floor((b.progressMm - a.progressMm) / 2);
    assert.equal(streetHeadingAt(track, a.progressMm + offset), a.headingMicroturn + Math.trunc((b.headingMicroturn - a.headingMicroturn) * offset / (b.progressMm - a.progressMm)));
  }
  assert.throws(() => streetHeadingAt(track, 0.25));
  assert.throws(() => streetHeadingAt(track, Number.MAX_SAFE_INTEGER + 1));
  assert.throws(() => streetHeadingAt(track, 100000001));
});

test('a crossing route cannot masquerade as one simple circuit', () => {
  const coordinates = [[1397530000,356830000],[1397620000,356920000],[1397500000,356920000],[1397620000,356800000],[1397500000,356800000]];
  const crossing = { ...source, points: coordinates.map((positionE7, i) => ({ id: `pt-${i}`, positionE7: positionE7 as [number, number], elevationMm: 0, halfWidthMm: 5000, sector: 0, cornerTrimMm: 100000, gate: true })) };
  assert.throws(() => compileStreetTrack(crossing), /centerline intersects/);
});

test('uniform integer stations cannot create a nearly empty closing cell', () => {
  const origin = source.points[0]!.positionE7;
  const scaled: AuthoredStreetTrack = { ...source, points: source.points.map(point => ({ ...point,
    positionE7: point.positionE7.map((value, axis) => Math.round(origin[axis]! + (value - origin[axis]!) * 1.00024)) as [number, number] })) };
  const track = compileStreetTrack(scaled);
  for (let i = 0; i < track.samples.length - 1; i++) {
    const a = track.samples[i]!, b = track.samples[i + 1]!, width = Math.max(a.halfWidthMm, b.halfWidthMm);
    assert.ok(b.progressMm - a.progressMm >= 4900);
    assert.ok(Math.abs(b.headingMicroturn - a.headingMicroturn) * width * 1000 <= 79000000 * (b.progressMm - a.progressMm));
  }
  for (const gate of track.gates) assert.equal(track.samples[gate.sample]!.sector, source.points.find(p => p.id === gate.id)!.sector);
});

const sprintSource: AuthoredStreetTrack = { ...source, id: 'tokyo-sprint-fixture', topology: 'sprint', laps: 1,
  points: source.points.slice(0, 16).map((point, i, points) => ({ ...point, gate: i === 0 || i === points.length - 1 || point.gate })) };

test('sprints keep authored endpoints and finish gates without a cyclic fillet or return leg', () => {
  const track = compileStreetTrack(sprintSource), first = track.samples[0]!, last = track.samples.at(-1)!;
  assert.equal(track.topology, 'sprint');
  assert.equal(track.laps, 1);
  assert.equal(first.eastMm, 0);
  assert.equal(first.northMm, 0);
  assert.notDeepEqual([last.eastMm, last.northMm], [first.eastMm, first.northMm]);
  assert.equal(first.elevationMm, sprintSource.points[0]!.elevationMm);
  assert.equal(last.elevationMm, sprintSource.points.at(-1)!.elevationMm);
  assert.equal(last.halfWidthMm, sprintSource.points.at(-1)!.halfWidthMm);
  assert.equal(last.sector, sprintSource.points.at(-1)!.sector);
  assert.deepEqual(track.gates[0], { id: sprintSource.points[0]!.id, sample: 0 });
  assert.deepEqual(track.gates.at(-1), { id: sprintSource.points.at(-1)!.id, sample: track.samples.length - 1 });
  assert.equal(last.headingMicroturn, track.samples.at(-2)!.headingMicroturn);
  assert.equal(first.turnPerMetre, 0);
  assert.equal(last.turnPerMetre, 0);
  assert.ok(track.lengthMm < compileStreetTrack(source).lengthMm / 2);
  const endpointTrims = { ...sprintSource, points: sprintSource.points.map((point, i, points) => ({ ...point,
    cornerTrimMm: i === 0 || i === points.length - 1 ? 0 : point.cornerTrimMm })) };
  assert.deepEqual(track.samples, compileStreetTrack(endpointTrims).samples, 'endpoint trim settings never move the actual sprint endpoints');
  assert.match(streetRustTable(track), /TOPOLOGY: crate::geometry::Topology = crate::geometry::Topology::Sprint/);
});

test('straight two-point sprints preserve exact endpoint position and chord heading', () => {
  const straight: AuthoredStreetTrack = { ...sprintSource, points: [
    { id: 'start', positionE7: [0, 0], elevationMm: 1000, halfWidthMm: 5000, sector: 0, cornerTrimMm: 100000, gate: true },
    { id: 'finish', positionE7: [100000, 0], elevationMm: 1000, halfWidthMm: 5000, sector: 1, cornerTrimMm: 100000, gate: true },
  ] };
  const track = compileStreetTrack(straight);
  assert.equal(track.lengthMm, 1111951);
  assert.equal(track.samples.at(-1)!.eastMm, 1111951);
  assert.equal(track.samples.at(-1)!.northMm, 0);
  for (const row of track.samples) {
    assert.equal(row.headingMicroturn, 250000);
    assert.equal(row.turnPerMetre, 0);
  }
});

test('sprint samples, intervals and headings clamp endpoints with bounded exact interpolation', () => {
  const track = compileStreetTrack(sprintSource), first = track.samples[0]!, last = track.samples.at(-1)!;
  for (const p of [-MAX_STREET_PROGRESS_MM, -1, 0]) {
    assert.equal(streetSampleAt(track, p), first);
    assert.equal(streetHeadingAt(track, p), first.headingMicroturn);
    assert.deepEqual(streetIntervalAt(track, p), [first, track.samples[1]]);
  }
  for (const p of [track.lengthMm, track.lengthMm + 1, MAX_STREET_PROGRESS_MM]) {
    assert.equal(streetSampleAt(track, p), last);
    assert.equal(streetHeadingAt(track, p), last.headingMicroturn);
    assert.deepEqual(streetIntervalAt(track, p), [track.samples.at(-2), last]);
  }
  for (let i = 0; i < track.samples.length - 1; i++) {
    const a = track.samples[i]!, b = track.samples[i + 1]!, middle = Math.floor((a.progressMm + b.progressMm) / 2);
    assert.deepEqual(streetIntervalAt(track, a.progressMm), [a, b]);
    assert.equal(streetSampleAt(track, b.progressMm - 1), a);
    assert.equal(streetSampleAt(track, b.progressMm), b);
    assert.equal(streetHeadingAt(track, middle), a.headingMicroturn + Math.trunc((b.headingMicroturn - a.headingMicroturn)
      * (middle - a.progressMm) / (b.progressMm - a.progressMm)) || 0);
  }
  for (const [a, b, c] of [[-10000, 0, 12000], [-1, track.lengthMm, MAX_STREET_PROGRESS_MM], [0, 333333, track.lengthMm + 1]]) {
    assert.equal(streetHeadingChange(track, a!, c!), streetHeadingChange(track, a!, b!) + streetHeadingChange(track, b!, c!));
  }
  for (const p of [MAX_STREET_PROGRESS_MM + 1, -MAX_STREET_PROGRESS_MM - 1, 0.5, NaN, Infinity]) {
    assert.throws(() => streetSampleAt(track, p));
    assert.throws(() => streetHeadingAt(track, p));
    assert.throws(() => streetIntervalAt(track, p));
  }
  const circuit = compileStreetTrack(source);
  assert.deepEqual(streetIntervalAt(circuit, circuit.lengthMm), [circuit.samples[0], circuit.samples[1]]);
  assert.deepEqual(streetIntervalAt(circuit, -1), [circuit.samples.at(-2), circuit.samples.at(-1)]);
});

test('sprint admission rejects missing endpoints, multiple laps, closure and first-to-last segment crossings', () => {
  const mutate = (edit: (value: any) => void) => { const value = structuredClone(sprintSource); edit(value); assert.throws(() => compileStreetTrack(value)); };
  mutate(v => v.laps = 2);
  mutate(v => v.points[0].gate = false);
  mutate(v => v.points.at(-1).gate = false);
  mutate(v => v.points.at(-1).positionE7 = v.points[0].positionE7);
  mutate(v => v.points = v.points.slice(0, 1));
  mutate(v => v.topology = 'Sprint');
  mutate(v => delete v.topology);
  const coordinates: [number, number][] = [[0, 0], [20000, 0], [20000, 20000], [10000, 20000], [10000, -10000]];
  const crossing: AuthoredStreetTrack = { ...sprintSource, points: coordinates.map((positionE7, i) => ({
    id: `pt-${i}`, positionE7, elevationMm: 0, halfWidthMm: 2500, sector: 0, cornerTrimMm: 50000, gate: true,
  })) };
  assert.throws(() => compileStreetTrack(crossing), /centerline intersects/);
  const wrongTopology = { ...compileStreetTrack(sprintSource), topology: 'loop' } as any;
  assert.throws(() => streetHeadingAt(wrongTopology, 0));
  assert.throws(() => streetRustTable(wrongTopology));
});
