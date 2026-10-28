import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileStreetTrack, type AuthoredStreetTrack } from '../scripts/lib/street-track-compiler';
import { compileStreetObjects, streetObjectRustTable, type AuthoredStreetObjects } from '../scripts/lib/street-object-compiler';
import { snapshotStreetObjectCatalog } from '../src/game/street/objects';

const load = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const track = compileStreetTrack(load('../world/authoring/tokyo-1986.json') as AuthoredStreetTrack);
const source = load('../world/authoring/tokyo-1986.objects.json') as AuthoredStreetObjects;

test('street catalog freezes gate-relative objects into ordered integer native rectangles', () => {
  const catalog = compileStreetObjects(track, source);
  assert.equal(catalog.trackId, track.id);
  assert.equal(catalog.objects.length, 12);
  assert.deepEqual([...new Set(catalog.objects.map(o => o.kind))].sort(), ['breakaway_sign', 'oil', 'tree_planter']);
  const first = catalog.objects[0]!;
  assert.equal(first.progressMm, track.samples[track.gates.find(g => g.id === source.objects[0]!.anchorGate)!.sample]!.progressMm + source.objects[0]!.offsetMm);
  const changed = structuredClone(source);
  (changed.objects[0] as { lateralMm: number }).lateralMm = 0;
  assert.notEqual(first.lateralMm, compileStreetObjects(track, changed).objects[0]!.lateralMm);
  assert.ok(Object.isFrozen(catalog) && Object.isFrozen(catalog.objects) && catalog.objects.every(Object.isFrozen));
});

test('street catalog rejects foreign rules, bad anchors, tiny oil zones and off-road/overlapping props', () => {
  const invalid = (mutate: (draft: any) => void) => { const draft = structuredClone(source); mutate(draft); assert.throws(() => compileStreetObjects(track, draft)); };
  invalid(s => s.trackId = 'another-race');
  invalid(s => s.objects[0].retainedSpeedQ256 = 256);
  invalid(s => s.objects[0].anchorGate = 'unrecognized');
  invalid(s => s.objects[0].id = s.objects[2].id);
  invalid(s => s.objects[0].lateralMm = 16000);
  invalid(s => s.objects[0].offsetMm = '100');
  invalid(s => s.objects[0].kind = 'solid_tree');
  invalid(s => { s.objects[0].anchorGate = 'manaita-bridge'; s.objects[0].offsetMm = 0; });
  invalid(s => s.objects[1].halfLengthMm = 100);
  invalid(s => { s.objects[2] = { ...s.objects[0], id: 'overlap' }; });
  invalid(s => s.objects = [...s.objects, ...s.objects]);
});

test('authoring rejects holes, collection overrides, accessors and non-data schemas without invoking them', () => {
  let callbacks = 0;
  const invalid = (mutate: (draft: any) => void) => {
    const draft = structuredClone(source); mutate(draft);
    assert.throws(() => compileStreetObjects(track, draft), RangeError);
  };
  invalid(s => s.objects = new Array(1));
  invalid(s => { delete s.objects[2]; });
  invalid(s => { s.objects.map = () => { callbacks++; return []; }; });
  invalid(s => { s.objects[Symbol.iterator] = () => { callbacks++; return [][Symbol.iterator](); }; });
  invalid(s => { Object.defineProperty(s.objects, '0', { enumerable: true, get() { callbacks++; return source.objects[0]; } }); });
  invalid(s => { Object.defineProperty(s.objects[0], 'offsetMm', { enumerable: true, get() { callbacks++; return 0; } }); });
  invalid(s => { Object.defineProperty(s, 'objects', { enumerable: true, get() { callbacks++; return source.objects; } }); });
  invalid(s => { Object.setPrototypeOf(s.objects, class extends Array {}.prototype); });
  invalid(s => { Object.setPrototypeOf(s.objects[0], { performance: 'unbounded' }); });
  invalid(s => { Object.setPrototypeOf(s, { version: 1 }); });
  invalid(s => { s.objects[0][Symbol('rules')] = 99; });
  invalid(s => { Object.defineProperty(s.objects[0], 'secret', { value: 99 }); });
  invalid(s => { Object.defineProperty(s.objects[0], 'offsetMm', { enumerable: false }); });
  invalid(s => { s.objects[0]['id kind'] = s.objects[0].id; delete s.objects[0].id; delete s.objects[0].kind; });
  assert.equal(callbacks, 0, 'untrusted getters, iterators and map functions must never execute');
});

test('null-prototype data records remain valid and are detached from later mutations', () => {
  const raw = structuredClone(source);
  Object.setPrototypeOf(raw, null);
  for (const row of raw.objects) Object.setPrototypeOf(row, null);
  const catalog = compileStreetObjects(track, raw), before = structuredClone(catalog);
  Object.assign(raw.objects[0]!, { id: 'changed-later', offsetMm: 0, lateralMm: 0 });
  assert.deepEqual(catalog, before);
  const captured = snapshotStreetObjectCatalog(track, catalog);
  assert.deepEqual(captured, before);
  assert.notEqual(captured, catalog);
  assert.notEqual(captured.objects[0], catalog.objects[0]);
  assert.ok(Object.isFrozen(captured) && Object.isFrozen(captured.objects) && captured.objects.every(Object.isFrozen));
});

test('runtime catalog admission rejects forged rows and invalid mask identities', () => {
  const catalog = compileStreetObjects(track, source);
  const invalid = (mutate: (draft: any) => void) => {
    const draft = structuredClone(catalog); mutate(draft);
    assert.throws(() => snapshotStreetObjectCatalog(track, draft), RangeError);
    assert.throws(() => streetObjectRustTable(draft, track), RangeError);
  };
  invalid(c => { c.objects = new Array(1); });
  invalid(c => { c.objects.map = () => []; });
  invalid(c => { c.objects[0].progressMm = '1000 }; malicious_code(); //'; });
  invalid(c => { c.objects[0].progressMm = Number.NaN; });
  invalid(c => { c.objects[0].halfWidthMm = 500.5; });
  invalid(c => { c.objects[0].halfLengthMm = Number.POSITIVE_INFINITY; });
  invalid(c => { c.objects[0].kind = 'Oil'; });
  invalid(c => { c.objects[0].id = 'invalid id'; });
  invalid(c => { c.objects[0].id = c.objects[1].id; });
  invalid(c => { c.objects[0].maskBit = 0; });
  invalid(c => { c.objects[0][Symbol('rules')] = true; });
  invalid(c => { Object.setPrototypeOf(c.objects[0], { kind: 'oil' }); });
  invalid(c => { Object.defineProperty(c.objects[0], 'progressMm', { get() { throw new Error('getter executed'); } }); });
  invalid(c => { Object.defineProperty(c.objects[0], 'progressMm', { enumerable: false }); });
  invalid(c => { c.version = 2; });
  invalid(c => { c.trackId = 'another-track'; });
  const empty = snapshotStreetObjectCatalog(track, { version: 1, trackId: track.id, objects: [] });
  assert.equal(empty.objects.length, 0);
  assert.ok(Object.isFrozen(empty.objects));
});

test('Rust formatting revalidates data and emits the actual native enum with canonical integers', () => {
  const catalog = structuredClone(compileStreetObjects(track, source));
  Object.assign(catalog.objects[0]!, { lateralMm: -0 });
  const snapshot = snapshotStreetObjectCatalog(track, catalog), rust = streetObjectRustTable(catalog, track);
  assert.equal(Object.is(snapshot.objects[0]!.lateralMm, -0), false);
  assert.equal((rust.match(/crate::hazards::Hazard \{/g) ?? []).length, catalog.objects.length);
  assert.match(rust, /crate::hazards::Kind::Oil/);
  assert.match(rust, /crate::hazards::Kind::TreePlanter/);
  assert.match(rust, /crate::hazards::Kind::BreakawaySign/);
  assert.doesNotMatch(rust, /HazardKind|NaN|undefined|lateral_mm: -0/);
  Object.assign(catalog.objects[0]!, { lateralMm: 16000 });
  assert.throws(() => streetObjectRustTable(catalog, track), /road corridor/);
});

test('catalog boundary snapshots track widths and rejects accessor, sparse and unordered gate metadata', () => {
  let callbacks = 0;
  const invalid = (mutate: (draft: any) => void) => {
    const draft = structuredClone(track); mutate(draft);
    assert.throws(() => compileStreetObjects(draft, source), RangeError);
  };
  invalid(t => { t.samples = new Array(t.samples.length); });
  invalid(t => { t.samples.map = () => { callbacks++; return track.samples; }; });
  invalid(t => { Object.defineProperty(t.samples[0], 'halfWidthMm', { get() { callbacks++; return 6000; } }); });
  invalid(t => { Object.defineProperty(t, 'samples', { get() { callbacks++; return track.samples; } }); });
  invalid(t => { Object.defineProperty(t, 'gates', { get() { callbacks++; return track.gates; } }); });
  invalid(t => { t.gates = new Array(4); });
  invalid(t => { t.gates[1].sample = t.gates[0].sample; });
  invalid(t => { t.gates[1].id = t.gates[0].id; });
  invalid(t => { Object.defineProperty(t.gates[0], 'sample', { get() { callbacks++; return 0; } }); });
  invalid(t => { t.samples[1].progressMm++; });
  invalid(t => { t.samples[1].halfWidthMm = 2400; });
  invalid(t => { t.samples.at(-1).halfWidthMm--; });
  assert.equal(callbacks, 0);
});

test('footprint containment checks interior width stations and native shape/placement limits', () => {
  const road = structuredClone(track);
  for (const sample of road.samples) sample.halfWidthMm = 12000;
  const object = { id: 'test-object', kind: 'oil', progressMm: road.samples[100]!.progressMm, lateralMm: 2000,
    halfLengthMm: 20000, halfWidthMm: 2400 };
  const admit = (row: object, route = road) => snapshotStreetObjectCatalog(route, { version: 1, trackId: route.id, objects: [row] });
  assert.equal(admit(object).objects.length, 1);
  road.samples[100]!.halfWidthMm = 2500;
  assert.throws(() => admit(object), /road corridor/);
  road.samples[100]!.halfWidthMm = 12000;
  for (const kind of ['oil', 'tree_planter', 'breakaway_sign'] as const) {
    const oil = kind === 'oil';
    const row = { ...object, kind, halfLengthMm: oil ? 6000 : 250, halfWidthMm: oil ? 500 : 200 };
    assert.equal(admit(row).objects[0]!.kind, kind);
    assert.throws(() => admit({ ...row, halfLengthMm: row.halfLengthMm - 1 }), /half length/);
    assert.throws(() => admit({ ...row, halfWidthMm: row.halfWidthMm - 1 }), /half width/);
    assert.throws(() => admit({ ...row, halfLengthMm: oil ? 20001 : 1501 }), /half length/);
    assert.throws(() => admit({ ...row, halfWidthMm: oil ? 2401 : 1501 }), /half width/);
    assert.equal(admit({ ...row, progressMm: 14000 + row.halfLengthMm }).objects.length, 1);
    assert.throws(() => admit({ ...row, progressMm: 13999 + row.halfLengthMm }), /protected grid/);
    assert.equal(admit({ ...row, progressMm: road.lengthMm - 14000 - row.halfLengthMm }).objects.length, 1);
    assert.throws(() => admit({ ...row, progressMm: road.lengthMm - 13999 - row.halfLengthMm }), /protected grid/);
    const sprint = { ...road, topology: 'sprint' as const };
    assert.equal(admit({ ...row, progressMm: road.lengthMm - 6000 - row.halfLengthMm }, sprint).objects.length, 1);
    assert.throws(() => admit({ ...row, progressMm: road.lengthMm - 5999 - row.halfLengthMm }, sprint), /protected grid/);
  }
});

test('breakaway footprints may touch and oil may overlap, but props cannot overlap', () => {
  const row = { id: 'first-prop', kind: 'breakaway_sign', progressMm: track.samples[100]!.progressMm, lateralMm: 0,
    halfLengthMm: 500, halfWidthMm: 500 };
  const admit = (second: object) => snapshotStreetObjectCatalog(track, { version: 1, trackId: track.id, objects: [row, second] });
  assert.equal(admit({ ...row, id: 'second-prop', progressMm: row.progressMm + 1000 }).objects.length, 2);
  assert.equal(admit({ ...row, id: 'second-prop', lateralMm: 1000 }).objects.length, 2);
  assert.throws(() => admit({ ...row, id: 'second-prop', progressMm: row.progressMm + 999, lateralMm: 999 }), /footprints overlap/);
  assert.equal(admit({ ...row, id: 'oil-patch', kind: 'oil', halfLengthMm: 6000 }).objects.length, 2);
});
