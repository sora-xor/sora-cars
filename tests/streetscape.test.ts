import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishedStreetBundle } from './helpers/published-street';
import { createStreetscape, selectStreetscape, streetscapePlantingClear,
  type StreetscapeCourse, type StreetscapeFootprint } from '../src/game/three/streetscape';
import { TRACKS, curvature } from '../src/game/rules';

const tau = Math.PI * 2;
function tokyo(): StreetscapeCourse {
  const { track } = publishedStreetBundle();
  return { length: track.lengthMm / 1000, circuit: true, style: 3,
    poses: track.samples.map((sample) => ({ p: sample.progressMm! / 1000, x: -sample.eastMm! / 1000,
      z: sample.northMm! / 1000, heading: -sample.headingMicroturn! * tau / 1e6, width: sample.halfWidthMm! / 1000 })) };
}
function rural(style: number): StreetscapeCourse {
  const track = TRACKS[style]!, poses = [];
  let x = 0, z = -100, heading = 0;
  for (let p = -100; p <= track.length / 1000 * 3 + 500; p += 5) {
    poses.push({ p, x, z, heading, width: 6 });
    heading -= curvature(track, Math.max(0, p * 1000)) * 5 / 760;
    x += Math.sin(heading) * 5; z += Math.cos(heading) * 5;
  }
  return { length: track.length / 1000 * 3, circuit: false, style, poses };
}
function straight(style = 3): StreetscapeCourse {
  return { length: 1680, circuit: false, style,
    poses: Array.from({ length: 357 }, (_, i) => ({ p: i * 5, x: 0, z: i * 5, heading: 0, width: 6 })) };
}
const plans = [tokyo(), rural(0), rural(1), rural(2)].map(createStreetscape);

// Independent corner/projection implementation checks the returned metre-scale
// geometry, rather than calling the planner's private overlap helper.
function corners(box: StreetscapeFootprint): [number, number][] {
  return [-1, 1].flatMap(x => [-1, 1].map(z => [box.x + Math.cos(box.heading) * box.halfX * x + Math.sin(box.heading) * box.halfZ * z,
    box.z - Math.sin(box.heading) * box.halfX * x + Math.cos(box.heading) * box.halfZ * z] as [number, number]));
}
function separated(a: StreetscapeFootprint, b: StreetscapeFootprint): boolean {
  const ca = corners(a), cb = corners(b);
  return [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2].some(angle => {
    const project = (points: [number, number][]) => points.map(([x, z]) => x * Math.cos(angle) - z * Math.sin(angle));
    const pa = project(ca), pb = project(cb);
    return Math.max(...pa) <= Math.min(...pb) + 1e-7 || Math.max(...pb) <= Math.min(...pa) + 1e-7;
  });
}
function pointDistance(box: StreetscapeFootprint, x: number, z: number): number {
  const dx = x - box.x, dz = z - box.z, localX = Math.cos(box.heading) * dx - Math.sin(box.heading) * dz,
    localZ = Math.sin(box.heading) * dx + Math.cos(box.heading) * dz;
  return Math.hypot(Math.max(0, Math.abs(localX) - box.halfX), Math.max(0, Math.abs(localZ) - box.halfZ));
}

test('authored plans are immutable with respect to native inputs and repeat exactly', () => {
  for (const plan of plans) {
    const original = JSON.stringify(plan.course);
    const repeat = createStreetscape(plan.course);
    assert.equal(JSON.stringify(plan.course), original);
    assert.deepEqual(plan, repeat);
    const all = [...plan.buildings, ...plan.apartments, ...plan.trees];
    assert.equal(new Set(all.map(item => item.id)).size, all.length);
    assert.ok(all.every(item => Number.isFinite(item.p) && Number.isFinite(item.clearance)));
    assert.ok(plan.buildings.length > 20);
  }
});

test('frontage footprints clear one another and every native road segment in Tokyo and all three arcade courses', () => {
  for (const plan of plans) {
  const structures = [...plan.buildings, ...plan.apartments];
  for (let i = 0; i < structures.length; i++) {
    const a = structures[i]!;
    for (let j = i + 1; j < structures.length; j++) assert.ok(separated(a.footprint, structures[j]!.footprint), `${a.id} intersects ${structures[j]!.id}`);
    // Half-metre subdivisions also test segment interiors between native samples.
    for (let segment = 1; segment < plan.course.poses.length; segment++) {
      const start = plan.course.poses[segment - 1]!, end = plan.course.poses[segment]!;
      if (Math.hypot(start.x - a.footprint.x, start.z - a.footprint.z) > 40) continue;
      const count = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.z - start.z) * 2));
      for (let j = 0; j <= count; j++) {
        const t = j / count, width = start.width + (end.width - start.width) * t;
        assert.ok(pointDistance(a.footprint, start.x + (end.x - start.x) * t, start.z + (end.z - start.z) * t) >= width + 1.3,
          `${a.id} intersects road segment ${segment} at ${t}`);
      }
    }
  }
  }
});

test('decorative tree crowns and the existing forest exclusion never intersect building envelopes', () => {
  for (const plan of plans) for (const tree of plan.trees) {
    const radius = tree.footprint.halfX;
    for (const building of [...plan.buildings, ...plan.apartments]) assert.ok(pointDistance(building.footprint, tree.footprint.x, tree.footprint.z) >= radius + .399,
      `${tree.id} crown intersects ${building.id}`);
    assert.ok(streetscapePlantingClear(plan, tree.p, tree.side, tree.clearance, radius));
  }
  const plan = plans[0]!, building = plan.buildings[0]!;
  assert.equal(streetscapePlantingClear(plan, building.p, building.side, building.clearance, 5.1), false);
});

test('pool selection is stable across laps, backwards visits and the circuit seam with source variant budgets', () => {
  const plan = plans[0]!;
  const ids = (p: number) => { const window = selectStreetscape(plan, p); return { buildings: window.buildings.map(item => item.id), apartments: window.apartments.map(item => item.id), trees: window.trees.map(item => item.id) }; };
  for (const p of [0, .01, 20, 289.4, 1800, plan.course.length - .01]) {
    assert.deepEqual(ids(p), ids(p + plan.course.length));
    assert.deepEqual(ids(p), ids(p - plan.course.length * 3));
    const first = selectStreetscape(plan, p); selectStreetscape(plan, p + 620);
    assert.deepEqual(selectStreetscape(plan, p), first);
    assert.ok(first.buildings.length <= 48 && first.apartments.length <= 20 && first.trees.length <= 40);
    for (let variant = 0; variant < 4; variant++) assert.ok(first.buildings.filter(item => item.variant === variant).length <= 12);
  }
  const before = new Set(selectStreetscape(plan, plan.course.length - .01).buildings.map(item => item.id));
  const after = new Set(selectStreetscape(plan, .01).buildings.map(item => item.id));
  assert.deepEqual(before, after);
});

test('market blocks form connected shop runs with short service alleys and real-scale taller street layers', () => {
  const plan = createStreetscape(straight());
  const ordered = plan.buildings.filter(item => item.blockId === 'town:0:-1').sort((a, b) => a.footprint.z - b.footprint.z);
  assert.ok(ordered.length >= 10, 'a market block should read as an occupied frontage');
  const gaps = ordered.slice(1).map((item, i) => item.footprint.z - item.footprint.halfX - ordered[i]!.footprint.z - ordered[i]!.footprint.halfX);
  assert.ok(gaps.filter(gap => gap < 1).length >= 7, 'adjacent shops share one frontage rhythm');
  assert.ok(gaps.filter(gap => gap >= 3 && gap <= 5).length >= 2, 'short service alleys punctuate the row');
  assert.ok(Math.max(...gaps) <= 5, 'the market must not acquire an accidental empty house-sized lot');
  assert.ok(ordered.reduce((sum, item) => sum + item.footprint.halfX * 2, 0) > 105, 'at least three quarters of the block has real architecture');
  const garages = plan.buildings.filter(item => item.block === 'garage-court' && item.clearance >= 11);
  assert.ok(garages.some(item => item.variant === 0) && garages.some(item => item.variant === 2), 'recessed garage access remains distinct from the continuous shop rows');
  assert.ok(plan.apartments.some(item => item.block === 'residential') && plan.apartments.some(item => item.block === 'planted-court'));
  for (const item of plan.apartments) {
    const front = item.clearance - (item.variant ? 10 : 8.8) / 2;
    assert.ok(front >= 5 && front <= 8, 'taller architecture must be visible from the street instead of hidden 19m behind low roofs');
    assert.deepEqual(item.scale, [1, 1, 1]);
  }
  assert.ok(new Set(ordered.map(item => item.variant)).size === 4);
  for (const item of plan.buildings) {
    assert.ok(item.scale[0] >= .93 && item.scale[0] <= 1.08);
    assert.ok(item.scale[1] >= .94 && item.scale[1] <= 1.06);
    assert.ok(item.scale[2] >= .94 && item.scale[2] <= 1.08);
  }
  assert.notEqual(plan.sections.find(item => item.id === 'town:0:-1')!.block, plan.sections.find(item => item.id === 'town:0:1')!.block);
});

test('opening driving windows keep their nearby rows complete within the existing source pools', () => {
  const tokyo = plans[0]!;
  for (const p of [0, 35, 100, 175, 230, 300]) {
    const window = selectStreetscape(tokyo, p), selected = new Set(window.buildings.map(item => item.id));
    assert.ok(window.buildings.length >= 42 && window.buildings.length <= 48);
    assert.ok(window.apartments.length >= 1 && window.apartments.length <= 20);
    for (const item of tokyo.buildings) {
      const distance = ((item.p - p + tokyo.course.length / 2) % tokyo.course.length + tokyo.course.length) % tokyo.course.length - tokyo.course.length / 2;
      if (distance >= -35 && distance <= 130) assert.ok(selected.has(item.id), `pool selection punched a hole in the nearby row: ${item.id} at ${p}`);
    }
    for (let variant = 0; variant < 4; variant++) assert.ok(window.buildings.filter(item => item.variant === variant).length <= 12);
  }
  assert.ok(tokyo.buildings.filter(item => item.p >= 0 && item.p < 300).length >= 36);
  const arcade = plans[1]!;
  for (const side of [-1, 1]) {
    assert.ok(arcade.buildings.filter(item => item.side === side && item.p >= 0 && item.p < 100).length >= 6,
      'the first arcade settlement should frame normal driving with a connected group of shops');
    assert.ok(arcade.buildings.filter(item => item.side === side && item.p >= 0 && item.p < 200).length >= 10);
  }
});

test('tight adjoining lots still enclose the completed source roof, annex and entry-step bounds', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/assets/models/architecture-ambient/manifest.json', import.meta.url), 'utf8')) as {
    templates: { id: string; meshes: { bounds: { min: number[]; max: number[] } }[] }[];
  };
  const plan = createStreetscape(straight());
  for (const item of [...plan.buildings, ...plan.apartments]) {
    const id = `detailed-${item.kind === 'building' ? 'neighborhood' : 'apartment'}-${item.variant}`;
    const source = manifest.templates.find(template => template.id === id)!;
    const minX = Math.min(...source.meshes.map(mesh => mesh.bounds.min[0]!)), maxX = Math.max(...source.meshes.map(mesh => mesh.bounds.max[0]!));
    const minZ = Math.min(...source.meshes.map(mesh => mesh.bounds.min[2]!)), maxZ = Math.max(...source.meshes.map(mesh => mesh.bounds.max[2]!));
    const heading = item.side * Math.PI / 2, originX = item.side * (6 + item.clearance);
    for (const localX of [minX, maxX]) for (const localZ of [minZ, maxZ]) {
      const x = originX + Math.cos(heading) * localX * item.scale[0] + Math.sin(heading) * localZ * item.scale[2];
      const z = item.p - Math.sin(heading) * localX * item.scale[0] + Math.cos(heading) * localZ * item.scale[2];
      assert.ok(pointDistance(item.footprint, x, z) < 1e-6, `${item.id} does not enclose its actual completed source`);
    }
  }
});

test('rural routes alternate actual settlements and long unbuilt forest stretches on both sides', () => {
  const plan = createStreetscape(straight(0));
  assert.ok(plan.buildings.some(item => item.block === 'hamlet') && plan.buildings.some(item => item.block === 'village'));
  const forest = plan.sections.filter(section => section.block === 'forest');
  assert.ok(forest.length >= 4 && forest.every(section => section.length >= 280));
  for (const section of forest) {
    assert.equal(plan.buildings.filter(item => item.blockId === section.id).length, 0);
    assert.ok(plan.trees.filter(item => item.blockId === section.id).length >= 10);
  }
  assert.ok(!plan.buildings.some(item => item.p >= 280 && item.p < 840));
  assert.equal(plan.apartments.length, 0);
});
