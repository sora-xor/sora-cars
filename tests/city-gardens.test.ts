import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedStreetBundle } from './helpers/published-street';
import * as THREE from 'three';
import { createCityBlocks, selectCityBlocks, type CityBlockBounds, type CityBlockTemplates } from '../src/game/three/city-blocks';
import { createStreetscape, type StreetscapeCourse, type StreetscapeFootprint } from '../src/game/three/streetscape';
import { createUrbanGround } from '../src/game/three/urban-ground';
import { createGroundHeightSampler } from '../src/game/three/ground-sampler';
import { createCityPlots } from '../src/game/three/city-plots';
import { createCityGardens, createCityGardenSources, CityGardenBatch, type CityGardenMaterials } from '../src/game/three/city-gardens';

const bounds = (minX: number, maxX: number, maxY: number, minZ: number, maxZ: number): CityBlockBounds => ({ minX, maxX, minY: 0, maxY, minZ, maxZ });
const templates: CityBlockTemplates = {
  buildings: [bounds(-4.876, 4.876, 8.19, -4.159, 3.466), bounds(-4.426, 4.426, 9.19, -4.459, 3.766),
    bounds(-5.576, 7.211, 7.89, -4.217, 3.516), bounds(-4.851, 4.851, 9.096, -4.317, 3.326)],
  apartments: [bounds(-6.626, 6.626, 15.7, -5.396, 4.601), bounds(-7.726, 7.726, 21.8, -5.996, 5.201)],
};
const published = publishedStreetBundle();
const poses = published.track.samples.map((s) => ({ p: s.progressMm! / 1000, x: -s.eastMm! / 1000,
  z: s.northMm! / 1000, y: s.elevationMm! / 1000, heading: -s.headingMicroturn! * Math.PI * 2 / 1e6, width: s.halfWidthMm! / 1000 }));
const course: StreetscapeCourse = { length: published.track.lengthMm / 1000, circuit: true, style: 3, poses };
const frontages = createStreetscape(course), groundMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const ground = createUrbanGround(poses, groundMaterial), groundHeightAt = createGroundHeightSampler(ground);
const city = createCityBlocks(frontages, templates, { groundHeightAt });
const plots = createCityPlots(city, frontages, templates, { groundHeightAt });
const gardens = createCityGardens(plots, { groundHeightAt });
const inverse = (f: StreetscapeFootprint) => new THREE.Matrix4().makeRotationY(f.heading).setPosition(f.x, 0, f.z).invert();
const sources = createCityGardenSources();

test('actual Tokyo planting is deterministic, uses all three detailed sources, and preserves its verified court inputs', t => {
  const before = JSON.stringify(plots);
  assert.deepEqual(createCityGardens(plots, { groundHeightAt }), gardens);
  assert.equal(JSON.stringify(plots), before);
  assert.ok(gardens.placements.length >= 60 && gardens.placements.length <= plots.plots.length * 2);
  assert.equal(new Set(gardens.placements.map(p => p.id)).size, gardens.placements.length);
  assert.deepEqual([...new Set(gardens.placements.map(p => p.variant))].sort(), [0, 1, 2]);
  assert.equal(gardens.stats.accepted + gardens.stats.rejected, gardens.stats.candidates);
  t.diagnostic(JSON.stringify({ courts: plots.plots.length, ...gardens.stats, sourceTriangles: sources.map(s => s.triangles),
    sourceBounds: sources.map(s => ({ min: s.bounds.min.toArray(), max: s.bounds.max.toArray() })) }));
});

test('every transformed source vertex remains within the clear court and leaves its central entrance corridor open', () => {
  let checked = 0;
  for (const placement of gardens.placements) {
    const plot = plots.plots.find(p => p.id === placement.plotId)!;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...placement.position), new THREE.Quaternion(...placement.quaternion), new THREE.Vector3(1, 1, 1));
    const local = inverse(plot.court).multiply(m), vertex = new THREE.Vector3();
    for (const geometry of Object.values(sources[placement.variant]!.parts)) {
      const p = geometry.getAttribute('position'); if (!p) continue;
      for (let i = 0; i < p.count; i++) {
        vertex.fromBufferAttribute(p, i).applyMatrix4(local); checked++;
        assert.ok(Math.abs(vertex.x) < plot.court.halfX - .18 && Math.abs(vertex.z) < plot.court.halfZ - .2, `${placement.id} leaves court`);
        assert.ok(Math.abs(vertex.x) > 1.2, `${placement.id} crosses entrance corridor`);
      }
    }
  }
  assert.ok(checked > 1_000_000, 'checks real finished source geometry, not metadata alone');
});

test('ground contact follows the actual paved plane without floating saucers or buried foliage', () => {
  let contacts = 0;
  for (const placement of gardens.placements) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...placement.position), new THREE.Quaternion(...placement.quaternion), new THREE.Vector3(1, 1, 1));
    const vertex = new THREE.Vector3();
    for (const role of ['clay', 'concrete'] as const) {
      const position = sources[placement.variant]!.parts[role].getAttribute('position'); if (!position) continue;
      for (let i = 0; i < position.count; i++) if (Math.abs(position.getY(i)) < 1e-7) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(m); const y = groundHeightAt(vertex.x, vertex.z);
        assert.notEqual(y, null); assert.ok(Math.abs(vertex.y - y! - .024) < .005); contacts++;
      }
    }
  }
  assert.ok(contacts > 1000);
});

test('finished planter sources have hollow rims, open soil, non-flat leaves and bounded readable detail', () => {
  for (const [variant, source] of sources.entries()) {
    assert.ok(source.triangles > 10000 && source.triangles < 30000);
    const foliage = source.parts.foliage, position = foliage.getAttribute('position');
    assert.ok(source.bounds.max.y > .8 && source.bounds.max.y < 1.65);
    const normals = foliage.getAttribute('normal');
    const normalDirections = new Set(Array.from({ length: normals.count }, (_, i) => `${normals.getX(i).toFixed(1)},${normals.getY(i).toFixed(1)},${normals.getZ(i).toFixed(1)}`));
    assert.ok(normalDirections.size > 100, 'curved leaves retain varying surface normals');
    for (let i = 0; i < position.count; i++) assert.ok(Math.hypot(position.getX(i), position.getZ(i)) <= .65);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const pot = new THREE.Mesh(source.parts[variant === 1 ? 'concrete' : 'clay'], material);
    const soil = new THREE.Mesh(source.parts.soil, material); pot.updateMatrixWorld(); soil.updateMatrixWorld();
    const ray = new THREE.Raycaster(new THREE.Vector3(variant === 2 ? -.21 : 0, 2, variant === 2 ? .06 : 0), new THREE.Vector3(0, -1, 0));
    const clayHit = ray.intersectObject(pot)[0], soilHit = ray.intersectObject(soil)[0];
    assert.ok(soilHit && (!clayHit || soilHit.distance < clayHit.distance), 'center of vessel exposes inset soil instead of a capped cylinder');
    material.dispose();
  }
});

test('instanced gardens preserve stable IDs and transforms, bound all visible instances, clear rural scenes and retain caller materials', () => {
  const materials: CityGardenMaterials = Object.fromEntries(['clay', 'concrete', 'soil', 'foliage', 'wood'].map(role => [role, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })])) as unknown as CityGardenMaterials;
  let materialDisposals = 0; Object.values(materials).forEach(m => m.addEventListener('dispose', () => materialDisposals++));
  const batch = new CityGardenBatch(materials), window = selectCityBlocks(city, 435);
  batch.setGardens(gardens, window);
  const meshes = batch.group.children as THREE.InstancedMesh[];
  const snapshot = meshes.map(m => ({ geometry: m.geometry, version: m.instanceMatrix.version, buffer: Array.from(m.instanceMatrix.array), count: m.count }));
  batch.setGardens(gardens, window);
  meshes.forEach((m, i) => { assert.equal(m.geometry, snapshot[i]!.geometry); assert.equal(m.instanceMatrix.version, snapshot[i]!.version); });
  batch.setGardens(gardens, selectCityBlocks(city, 900)); batch.setGardens(gardens, window);
  meshes.forEach((m, i) => {
    assert.equal(m.count, snapshot[i]!.count);
    assert.deepEqual(Array.from(m.instanceMatrix.array).slice(0, m.count * 16), snapshot[i]!.buffer.slice(0, m.count * 16));
    if (m.count) assert.ok(m.boundingBox && !m.boundingBox.isEmpty() && m.boundingSphere && Number.isFinite(m.boundingSphere.radius));
  });
  assert.ok(batch.group.userData.cityGardenStats.visibleAssemblies > 0 && batch.group.userData.cityGardenStats.visibleAssemblies <= 72);
  assert.ok(batch.group.userData.cityGardenStats.meshBatches <= 12);
  batch.setGardens(null, { buildings: [], apartments: [] }); assert.ok(meshes.every(m => m.count === 0 && !m.visible));
  let geometryDisposals = 0;
  for (const source of batch.sources) Object.values(source.parts).forEach(g => g.addEventListener('dispose', () => geometryDisposals++));
  batch.dispose(); batch.dispose(); assert.equal(geometryDisposals, 15); assert.equal(materialDisposals, 0);
  assert.throws(() => batch.setGardens(gardens, window), /disposed/);
  Object.values(materials).forEach(m => m.dispose());
});

test('missing, steep or discontinuous support rejects decoration; rural layouts do not sample terrain', () => {
  assert.equal(createCityGardens(plots, { groundHeightAt: () => null }).placements.length, 0);
  assert.equal(createCityGardens(plots, { groundHeightAt: x => x * .1 }).placements.length, 0);
  assert.equal(createCityGardens(plots, { groundHeightAt: (x, z) => Math.sin(x * 20 + z * 31) * .15 }).placements.length, 0);
  assert.equal(createCityGardens({ ...plots, course: { ...plots.course, style: 0 } }, { groundHeightAt: () => { throw new Error('Must not sample rural terrain'); } }).placements.length, 0);
});
