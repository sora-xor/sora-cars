import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedStreetBundle } from './helpers/published-street';
import * as THREE from 'three';
import { createCityBlocks, selectCityBlocks, cityBlocksPlantingClear, CITY_BLOCK_CAPACITIES,
  type CityBlockBounds, type CityBlockTemplates } from '../src/game/three/city-blocks';
import { createStreetscape, type StreetscapeCourse, type StreetscapeFootprint,
  type StreetscapeLayout, type StreetscapePlacement } from '../src/game/three/streetscape';
import { createUrbanGround } from '../src/game/three/urban-ground';
import { createGroundHeightSampler } from '../src/game/three/ground-sampler';

// Representative conservative bounds measured from the current source roofs,
// balconies, entry stairs and house-side annex. Runtime uses the fully attached batch bounds.
const bounds = (minX: number, maxX: number, maxY: number, minZ: number, maxZ: number): CityBlockBounds =>
  ({ minX, maxX, minY: 0, maxY, minZ, maxZ });
const templates: CityBlockTemplates = {
  buildings: [bounds(-4.876, 4.876, 8.19, -4.159, 3.466), bounds(-4.426, 4.426, 9.19, -4.459, 3.766),
    bounds(-5.576, 7.211, 7.89, -4.217, 3.516), bounds(-4.851, 4.851, 9.096, -4.317, 3.326)],
  apartments: [bounds(-6.626, 6.626, 15.7, -5.396, 4.601), bounds(-7.726, 7.726, 21.8, -5.996, 5.201)],
};
const published = publishedStreetBundle();
const poses = published.track.samples.map((s) => ({
  p: s.progressMm! / 1000, x: -s.eastMm! / 1000, z: s.northMm! / 1000, y: s.elevationMm! / 1000,
  heading: -s.headingMicroturn! * Math.PI * 2 / 1e6, width: s.halfWidthMm! / 1000,
}));
const tokyo: StreetscapeCourse = { length: published.track.lengthMm / 1000, circuit: true, style: 3, poses };
const frontages = createStreetscape(tokyo);
const groundMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const ground = createUrbanGround(poses, groundMaterial), groundHeightAt = createGroundHeightSampler(ground);
const city = createCityBlocks(frontages, templates, { groundHeightAt });

function corners(box: StreetscapeFootprint): THREE.Vector2[] {
  return [-1, 1].flatMap(x => [-1, 1].map(z => new THREE.Vector2(
    box.x + Math.cos(box.heading) * box.halfX * x + Math.sin(box.heading) * box.halfZ * z,
    box.z - Math.sin(box.heading) * box.halfX * x + Math.cos(box.heading) * box.halfZ * z)));
}
// Independent polygon edge normals/projections, rather than the planner's SAT helper.
function separated(a: StreetscapeFootprint, b: StreetscapeFootprint, gap = 0): boolean {
  const ca = corners(a), cb = corners(b);
  return [ca, cb].some(points => [1, 2].some(i => {
    const edge = points[i]!.clone().sub(points[0]!), axis = new THREE.Vector2(-edge.y, edge.x).normalize();
    const pa = ca.map(p => p.dot(axis)), pb = cb.map(p => p.dot(axis));
    return Math.max(...pa) + gap <= Math.min(...pb) + 1e-6 || Math.max(...pb) + gap <= Math.min(...pa) + 1e-6;
  }));
}
function distance(f: StreetscapeFootprint, x: number, z: number): number {
  const worldToLocal = new THREE.Matrix4().makeRotationY(f.heading).setPosition(f.x, 0, f.z).invert();
  const p = new THREE.Vector3(x, 0, z).applyMatrix4(worldToLocal);
  const closest = p.clone().clamp(new THREE.Vector3(-f.halfX, 0, -f.halfZ), new THREE.Vector3(f.halfX, 0, f.halfZ));
  return p.distanceTo(closest);
}
function existingFootprint(item: StreetscapePlacement, plan = frontages): StreetscapeFootprint {
  const hi = plan.course.poses.findIndex(p => p.p >= item.p), b = plan.course.poses[Math.max(1, hi)]!, a = plan.course.poses[Math.max(0, hi - 1)]!;
  const t = (item.p - a.p) / (b.p - a.p);
  const turn = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
  const direction = a.heading + turn * t, heading = direction + item.side * Math.PI / 2 + item.yaw;
  const source = (item.kind === 'building' ? templates.buildings : templates.apartments)[item.variant]!;
  const root = new THREE.Matrix4().compose(new THREE.Vector3(
    a.x + (b.x - a.x) * t + Math.cos(direction) * item.side * (a.width + (b.width - a.width) * t + item.clearance), 0,
    a.z + (b.z - a.z) * t - Math.sin(direction) * item.side * (a.width + (b.width - a.width) * t + item.clearance)),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading), new THREE.Vector3(...item.scale));
  const center = new THREE.Vector3((source.minX + source.maxX) / 2, 0, (source.minZ + source.maxZ) / 2).applyMatrix4(root);
  return { x: center.x, z: center.z, heading, halfX: (source.maxX - source.minX) * item.scale[0] / 2 + .25,
    halfZ: (source.maxZ - source.minZ) * item.scale[2] / 2 + .25 };
}
function straight(style = 3): StreetscapeCourse {
  return { length: 1680, circuit: false, style,
    poses: Array.from({ length: 337 }, (_, i) => ({ p: i * 5, x: 0, z: i * 5, heading: 0, width: 6 })) };
}

test('secondary Tokyo plots repeat without changing native routes, frontages, or source bounds', () => {
  const input = JSON.stringify({ frontages, templates });
  assert.deepEqual(createCityBlocks(frontages, templates, { groundHeightAt }), city);
  assert.equal(JSON.stringify({ frontages, templates }), input);
  assert.equal(new Set(city.placements.map(p => p.id)).size, city.placements.length);
  assert.ok(city.placements.length > 100, 'actual Tokyo surface must support useful city depth');
  assert.equal(city.stats.candidates, city.stats.accepted + city.stats.rejected);
  assert.equal(city.stats.accepted, city.placements.length);
  assert.ok(city.stats.gradeAttempts > 0, 'real sloped ground must exercise foundation rejection');
  for (const p of city.placements) {
    assert.ok(p.clearance >= (p.kind === 'building' ? 23 : 40));
    assert.ok(p.ground.max - p.ground.min <= (p.kind === 'building' ? .28 : .36));
    assert.ok(p.ground.samples >= 9);
    assert.ok(Math.abs(p.position[1] - p.ground.min + .01) < 1e-8);
    for (const point of corners(p.footprint)) {
      const y = groundHeightAt(point.x, point.y);
      assert.ok(y !== null && y >= p.ground.min - 1e-7 && y <= p.ground.max + 1e-7);
    }
  }
});

test('every secondary roof envelope clears all original frontages, secondary plots and native road branches', () => {
  const original = [...frontages.buildings, ...frontages.apartments].map(item => existingFootprint(item));
  for (const [i, p] of city.placements.entries()) {
    for (const f of original) assert.ok(separated(p.footprint, f, 1.5), `${p.id} overlaps a completed frontage envelope`);
    for (const other of city.placements.slice(i + 1)) assert.ok(separated(p.footprint, other.footprint, 1.5), `${p.id} overlaps ${other.id}`);
    for (let segment = 1; segment < poses.length; segment++) {
      const a = poses[segment - 1]!, b = poses[segment]!;
      // This broad phase is wider than any source footprint and road width.
      if (Math.hypot(a.x - p.footprint.x, a.z - p.footprint.z) > 80) continue;
      const samples = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2));
      for (let j = 0; j <= samples; j++) {
        const t = j / samples;
        assert.ok(distance(p.footprint, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) >= Math.max(a.width, b.width) + 1.349,
          `${p.id} intersects native segment ${segment}`);
      }
    }
  }
});

test('missing ground and foundation-exceeding relief reject plots; rural courses are untouched', () => {
  const frontage = createStreetscape(straight());
  for (const sample of [() => null, () => NaN, (x: number, z: number) => x + z]) {
    const rejected = createCityBlocks(frontage, templates, { groundHeightAt: sample });
    assert.equal(rejected.placements.length, 0);
    assert.ok(rejected.stats.gradeAttempts > 0);
  }
  const gentle = createCityBlocks(frontage, templates, { groundHeightAt: (x, z) => 7 + x * .002 + z * .002 });
  assert.ok(gentle.placements.length > 50);
  for (const style of [0, 1, 2]) {
    const rural = createStreetscape(straight(style)), before = JSON.stringify(rural);
    const result = createCityBlocks(rural, templates, { groundHeightAt: () => { throw new Error('Rural ground must never be sampled'); } });
    assert.equal(result.placements.length, 0); assert.deepEqual(selectCityBlocks(result, 20), { buildings: [], apartments: [] });
    assert.equal(JSON.stringify(rural), before);
  }
});

test('wider city windows retain stable IDs across laps and reverse visits within every variant budget', () => {
  for (let p = 0; p < tokyo.length; p += 20) {
    const window = selectCityBlocks(city, p);
    for (const key of ['buildings', 'apartments'] as const) {
      for (const [variant, max] of CITY_BLOCK_CAPACITIES[key].entries()) assert.ok(window[key].filter(v => v.variant === variant).length <= max);
      for (const placement of window[key]) assert.ok(city.placements.includes(placement), 'selection must preserve the full-route placement object');
    }
  }
  for (const p of [.01, 20, 251.2, 1800, tokyo.length - .01]) {
    const first = selectCityBlocks(city, p);
    assert.deepEqual(first, selectCityBlocks(city, p + tokyo.length));
    assert.deepEqual(first, selectCityBlocks(city, p - tokyo.length * 3));
    selectCityBlocks(city, p + 2000);
    assert.deepEqual(first, selectCityBlocks(city, p));
  }
  assert.deepEqual(selectCityBlocks(city, -.01), selectCityBlocks(city, .01));
});

test('planting roots and crowns respect original and added architecture including grid-edge margins', () => {
  for (const p of city.placements) assert.equal(cityBlocksPlantingClear(city, p.footprint.x, p.footprint.z, 5), false);
  for (const p of [...frontages.buildings, ...frontages.apartments]) {
    const f = existingFootprint(p); assert.equal(cityBlocksPlantingClear(city, f.x, f.z, 1), false);
  }
  // An original envelope ends just left of the 32 m grid boundary. A crown on
  // the next cell still needs the same 0.4 m separation as a crown within it.
  const b = bounds(-1, 1, 5, -1, 1), tiny: CityBlockTemplates = { buildings: [b, b, b, b], apartments: [b, b] };
  const p: StreetscapePlacement = { id: 'edge', kind: 'building', block: 'shop-row', blockId: 'none', variant: 0,
    p: 80, side: 1, clearance: 24.65, scale: [1, 1, 1], yaw: -Math.PI / 2,
    footprint: { x: 30.65, z: 80, heading: 0, halfX: 1, halfZ: 1 } };
  const edge: StreetscapeLayout = { course: straight(), buildings: [p], apartments: [], trees: [], sections: [],
    stats: { rejectedBuildings: 0, rejectedTrees: 0, roadSegments: 336 } };
  const indexed = createCityBlocks(edge, tiny, { groundHeightAt: () => 0 });
  assert.equal(cityBlocksPlantingClear(indexed, 33.1, 80, 1), false);
  assert.equal(cityBlocksPlantingClear(indexed, 33.31, 80, 1), true);
});

test.after(() => {
  ground.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  groundMaterial.dispose();
});
