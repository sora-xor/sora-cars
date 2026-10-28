import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedStreetBundle } from './helpers/published-street';
import * as THREE from 'three';
import { createCityBlocks, selectCityBlocks,
  type CityBlockBounds, type CityBlockTemplates } from '../src/game/three/city-blocks';
import { createStreetscape, type StreetscapeCourse, type StreetscapeFootprint,
  type StreetscapePlacement } from '../src/game/three/streetscape';
import { createUrbanGround } from '../src/game/three/urban-ground';
import { createCityPlots, CityPlotBatch, cityPlotsPlantingClear } from '../src/game/three/city-plots';
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
const plots = createCityPlots(city, frontages, templates, { groundHeightAt });

type Polygon = readonly THREE.Vector2[];
const transform = (f: StreetscapeFootprint) => new THREE.Matrix4().makeRotationY(f.heading).setPosition(f.x, 0, f.z);
function polygon(f: StreetscapeFootprint): Polygon {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => {
    const p = new THREE.Vector3(x! * f.halfX, 0, z! * f.halfZ).applyMatrix4(transform(f)); return new THREE.Vector2(p.x, p.z);
  });
}
function frontageEnvelope(p: StreetscapePlacement): StreetscapeFootprint {
  const i = Math.max(1, tokyo.poses.findIndex(s => s.p >= p.p)), a = tokyo.poses[i - 1]!, b = tokyo.poses[i]!;
  const t = (p.p - a.p) / (b.p - a.p), h = a.heading + Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading)) * t;
  const heading = h + p.side * Math.PI / 2 + p.yaw, halfWidth = a.width + (b.width - a.width) * t;
  const source = (p.kind === 'building' ? templates.buildings : templates.apartments)[p.variant]!;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(a.x + (b.x - a.x) * t + Math.cos(h) * p.side * (halfWidth + p.clearance), 0,
    a.z + (b.z - a.z) * t - Math.sin(h) * p.side * (halfWidth + p.clearance)),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading), new THREE.Vector3(...p.scale));
  const center = new THREE.Vector3((source.minX + source.maxX) / 2, 0, (source.minZ + source.maxZ) / 2).applyMatrix4(m);
  return { x: center.x, z: center.z, heading, halfX: (source.maxX - source.minX) * p.scale[0] / 2 + .25,
    halfZ: (source.maxZ - source.minZ) * p.scale[2] / 2 + .25 };
}
function signedArea(points: Polygon): number {
  return points.reduce((sum, a, i) => { const b = points[(i + 1) % points.length]!; return sum + a.x * b.y - a.y * b.x; }, 0) / 2;
}
// Independent convex clipping measures actual triangle overlap area; point
// tests alone would miss an obstacle passing through a triangle interior.
function intersectionArea(subject: Polygon, clip: Polygon): number {
  let output = [...subject]; const direction = Math.sign(signedArea(clip));
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i]!, b = clip[(i + 1) % clip.length]!, input = output; output = [];
    const side = (p: THREE.Vector2) => direction * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    for (let j = 0; j < input.length; j++) {
      const previous = input[(j + input.length - 1) % input.length]!, current = input[j]!, s = side(previous), e = side(current);
      if ((s >= 0) !== (e >= 0)) output.push(previous.clone().lerp(current, s / (s - e)));
      if (e >= 0) output.push(current);
    }
  }
  return output.length < 3 ? 0 : Math.abs(signedArea(output));
}
const obstacles: Polygon[] = [...city.placements.map(p => polygon(p.footprint)),
  ...[...frontages.buildings, ...frontages.apartments].map(p => polygon(frontageEnvelope(p)))];
const roadPoint = (p: typeof poses[number], offset: number) => new THREE.Vector2(p.x + Math.cos(p.heading) * offset, p.z - Math.sin(p.heading) * offset);
for (let i = 1; i < poses.length; i++) {
  const a = poses[i - 1]!, b = poses[i]!;
  obstacles.push([roadPoint(a, -a.width - 1.67), roadPoint(a, a.width + 1.67), roadPoint(b, b.width + 1.67), roadPoint(b, -b.width - 1.67)]);
  if (Math.floor(a.p / 24) % 5 !== 0) for (const side of [-1, 1]) obstacles.push([
    roadPoint(a, side * (a.width + 13.52)), roadPoint(a, side * (a.width + 14.13)),
    roadPoint(b, side * (b.width + 14.13)), roadPoint(b, side * (b.width + 13.52)),
  ]);
}
const obstacleGrid = new Map<string, Set<Polygon>>();
function cells(poly: Polygon): string[] {
  const xs = poly.map(p => p.x), zs = poly.map(p => p.y), keys: string[] = [];
  for (let x = Math.floor(Math.min(...xs) / 32); x <= Math.floor(Math.max(...xs) / 32); x++)
    for (let z = Math.floor(Math.min(...zs) / 32); z <= Math.floor(Math.max(...zs) / 32); z++) keys.push(`${x}:${z}`);
  return keys;
}
for (const obstacle of obstacles) for (const cell of cells(obstacle)) {
  const set = obstacleGrid.get(cell) ?? new Set(); set.add(obstacle); obstacleGrid.set(cell, set);
}
function assertClear(poly: Polygon, id: string): void {
  const candidates = new Set(cells(poly).flatMap(cell => [...obstacleGrid.get(cell) ?? []]));
  for (const obstacle of candidates) assert.ok(intersectionArea(poly, obstacle) < 1e-6, `${id} crosses an existing building, native shoulder, or retaining-wall run`);
}

test('actual Tokyo access courts are deterministic, bounded, and preserve every input', () => {
  const before = JSON.stringify({ city, frontages, templates });
  assert.deepEqual(createCityPlots(city, frontages, templates, { groundHeightAt }), plots);
  assert.equal(JSON.stringify({ city, frontages, templates }), before);
  assert.ok(plots.plots.length >= 50 && plots.plots.length <= frontages.sections.length);
  assert.equal(new Set(plots.plots.map(p => p.buildingId.split('/secondary/')[0])).size, plots.plots.length);
  assert.equal(plots.stats.accepted + plots.stats.rejected, plots.stats.candidates);
  assert.ok(plots.stats.gates > 10 && plots.stats.gates < plots.plots.length / 2);
  assert.ok(plots.stats.searchExpansions <= plots.stats.candidates * 2401);
  for (const plot of plots.plots) {
    assert.ok(plot.accessLength > 2.5 && plot.accessLength <= 130);
    assert.ok(plot.access.length >= 3);
    const end = new THREE.Vector3(plot.access.at(-1)!.x, 0, plot.access.at(-1)!.z).applyMatrix4(transform(plot.court).invert());
    assert.ok(Math.abs(end.x) < 1e-7 && Math.abs(end.z + plot.court.halfZ) < 1e-7, 'path arrives at the gate center');
  }
});

test('every actual paving triangle and masonry solid clears completed footprints, native shoulders and continuous walls', () => {
  for (const plot of plots.plots) {
    for (let i = 0; i < plot.paving.length; i += 9) {
      const triangle = [0, 3, 6].map(offset => new THREE.Vector2(plot.paving[i + offset]!, plot.paving[i + offset + 2]!));
      if (Math.abs(signedArea(triangle)) > 1e-8) assertClear(triangle, plot.id);
    }
    for (const solid of plot.solids) assertClear(polygon({ x: solid.position[0], z: solid.position[2], heading: solid.heading,
      halfX: solid.size[0] / 2, halfZ: solid.size[2] / 2 }), plot.id);
    for (let i = 1; i < plot.access.length - 1; i++) {
      const a = plot.access[i - 1]!, b = plot.access[i]!;
      const strip = polygon({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, halfX: .9,
        halfZ: Math.hypot(b.x - a.x, b.z - a.z) / 2, heading: Math.atan2(b.x - a.x, b.z - a.z) });
      assert.ok(intersectionArea(strip, polygon(plot.court)) < 1e-6, `${plot.id} doubles back across its own court`);
    }
  }
});

test('paving has grounded top/edge faces and gates leave a human-scale clear opening', () => {
  for (const plot of plots.plots) {
    for (let i = 0; i < plot.paving.length; i += 3) {
      const x = plot.paving[i]!, y = plot.paving[i + 1]!, z = plot.paving[i + 2]!, ground = groundHeightAt(x, z);
      assert.ok(ground !== null);
      assert.ok(Math.abs(y - ground - .024) < 1e-7 || Math.abs(y - ground + .031) < 1e-7);
    }
    const gate = plot.access.at(-1)!;
    for (const solid of plot.solids) {
      const inverse = new THREE.Matrix4().makeRotationY(solid.heading).setPosition(...solid.position).invert();
      const local = new THREE.Vector3(gate.x, solid.position[1], gate.z).applyMatrix4(inverse);
      const closest = local.clone().clamp(new THREE.Vector3(-solid.size[0] / 2, 0, -solid.size[2] / 2), new THREE.Vector3(solid.size[0] / 2, 0, solid.size[2] / 2));
      assert.ok(local.distanceTo(closest) >= 1.159, 'coping leaves at least a 2.32 m gate opening');
    }
    assert.equal(cityPlotsPlantingClear(plots, plot.court.x, plot.court.z, 1), false);
    for (const p of plot.access) assert.equal(cityPlotsPlantingClear(plots, p.x, p.z, .2), false);
  }
});

test('plot batches stay within three materials, preserve metre-scale UVs, reuse stable selections, and dispose geometry only', () => {
  const paving = new THREE.MeshStandardMaterial(), stone = new THREE.MeshStandardMaterial(), coping = new THREE.MeshStandardMaterial();
  const batch = new CityPlotBatch({ paving, stone, coping }); let materialDisposals = 0;
  for (const material of [paving, stone, coping]) material.addEventListener('dispose', () => materialDisposals++);
  assert.ok(batch.group.children.every(m => !m.visible));
  const window = selectCityBlocks(city, 435); batch.setPlots(plots, window);
  const snapshot = batch.group.children.map(o => (o as THREE.Mesh).geometry);
  const buffers = snapshot.map(g => Array.from(g.getAttribute('position').array));
  batch.setPlots(plots, window); assert.deepEqual(batch.group.children.map(o => (o as THREE.Mesh).geometry), snapshot);
  batch.setPlots(plots, selectCityBlocks(city, 900)); batch.setPlots(plots, window);
  assert.deepEqual(batch.group.children.map(o => Array.from((o as THREE.Mesh).geometry.getAttribute('position').array)), buffers);
  const pavement = (batch.group.children[0] as THREE.Mesh).geometry, positions = pavement.getAttribute('position'), uv = pavement.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) {
    assert.ok(Math.abs(uv.getX(i) - positions.getX(i) / 2.1) < .0001);
    assert.ok(Math.abs(uv.getY(i) - positions.getZ(i) / 2.1) < .0001);
  }
  assert.ok(batch.group.userData.cityPlotStats.meshBatches <= 3 && batch.group.userData.cityPlotStats.triangles < 12000);
  let disposals = 0; for (const mesh of batch.group.children as THREE.Mesh[]) mesh.geometry.addEventListener('dispose', () => disposals++);
  batch.dispose(); batch.dispose(); assert.equal(disposals, 3); assert.equal(materialDisposals, 0);
  assert.throws(() => batch.setPlots(plots, window), /disposed/);
  paving.dispose(); stone.dispose(); coping.dispose();
});

test('missing ground creates no access structures, and rural routes are not sampled or decorated', () => {
  assert.equal(createCityPlots(city, frontages, templates, { groundHeightAt: () => null }).plots.length, 0);
  const rural = { ...city, course: { ...city.course, style: 0 } };
  assert.equal(createCityPlots(rural, frontages, templates, { groundHeightAt: () => { throw new Error('Rural surface must not be sampled'); } }).plots.length, 0);
});

test('coping follows the official one-metre plaster scan while stone keeps its 2.4 m mapping', () => {
  const material = new THREE.MeshStandardMaterial(), batch = new CityPlotBatch({ paving: material, stone: material, coping: material });
  const source = plots.plots[0]!, building = city.placements.find(p => p.id === source.buildingId)!;
  const one = { ...source, solids: (['stone', 'coping'] as const).map(role => ({ role,
    position: [0, 0, 0] as const, size: [3.2, role === 'stone' ? .6 : .08, .4] as const, heading: 0 })) };
  batch.setPlots({ ...plots, plots: [one] }, { buildings: [building], apartments: [] });
  for (const [index, meters] of [[1, 2.4], [2, 1]]) {
    const geometry = (batch.group.children[index!] as THREE.Mesh).geometry, positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      const side = Math.abs(normals.getX(i)) > .5, top = Math.abs(normals.getY(i)) > .5;
      assert.ok(Math.abs(uv.getX(i) - (side ? positions.getZ(i) : positions.getX(i)) / meters!) < 1e-6);
      assert.ok(Math.abs(uv.getY(i) - (top ? positions.getZ(i) : positions.getY(i)) / meters!) < 1e-6);
    }
  }
  batch.dispose(); material.dispose();
});

test.after(() => {
  ground.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); groundMaterial.dispose();
});
