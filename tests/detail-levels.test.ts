import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { addDetailLevels, detailLevels, levelForView, MAX_PIXEL_ERROR, selectDetailByScreen } from '../src/game/three/detail-levels';

/** A finely tessellated unit sphere: like the drivers' subdivided skin, most of its triangles add nothing far away. */
function sphere(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.5, 160, 120);
}

test('levels append simplified triangles over the same vertices and keep the full mesh drawn by default', async () => {
  const geometry = sphere();
  const original = Array.from(geometry.index!.array), vertices = geometry.getAttribute('position').count;
  assert.equal(await addDetailLevels(geometry), true);
  const levels = detailLevels(geometry)!;
  assert.ok(levels.length >= 3, `expected several levels, got ${levels.length}`);
  assert.deepEqual(levels[0], { start: 0, count: original.length, error: 0 });
  assert.deepEqual(Array.from(geometry.index!.array.slice(0, original.length)), original);
  assert.deepEqual({ ...geometry.drawRange }, { start: 0, count: original.length });
  // Levels follow one another in the index buffer, each smaller and coarser than the last.
  for (let i = 1; i < levels.length; i++) {
    assert.equal(levels[i]!.start, levels[i - 1]!.start + levels[i - 1]!.count);
    assert.ok(levels[i]!.count < levels[i - 1]!.count && levels[i]!.count % 3 === 0);
    assert.ok(levels[i]!.error > levels[i - 1]!.error);
  }
  assert.equal(geometry.index!.count, levels.at(-1)!.start + levels.at(-1)!.count);
  // Only the original vertices are used: positions, normals, UVs and skin weights stay exact.
  let highest = 0;
  for (const value of geometry.index!.array) highest = Math.max(highest, value);
  assert.ok(highest < vertices);
  // A second call is a no-op.
  assert.equal(await addDetailLevels(geometry), true);
  assert.equal(detailLevels(geometry), levels);
});

test('the full mesh is drawn near the camera and coarser levels only within half a pixel', async () => {
  const geometry = sphere();
  await addDetailLevels(geometry);
  const levels = detailLevels(geometry)!;
  const mesh = new THREE.Mesh(geometry), camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 500);
  geometry.computeBoundingSphere();
  const at = (distance: number, height = 940) => {
    mesh.position.set(0, 0, -distance); mesh.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    return levelForView(levels, mesh, camera, height);
  };
  assert.equal(at(0.6), levels[0]);
  const far = at(400);
  assert.equal(far, levels.at(-1));
  // Every choice keeps its deviation within MAX_PIXEL_ERROR at the sphere's nearest point.
  for (const distance of [1, 2, 4, 8, 16, 32, 64]) {
    const level = at(distance), nearest = distance - 0.5;
    const pixelsPerMetre = 940 / (2 * Math.tan(THREE.MathUtils.degToRad(55) / 2) * nearest);
    assert.ok(level.error * pixelsPerMetre <= MAX_PIXEL_ERROR + 1e-9, `${distance} m: ${level.error * pixelsPerMetre} px`);
  }
  // A taller image keeps more detail at the same distance; scaling the mesh up does too.
  assert.ok(at(16, 2160).count >= at(16, 470).count);
  mesh.scale.setScalar(4);
  assert.ok(at(16).count >= (mesh.scale.setScalar(1), at(16)).count);
  // Cameras without a perspective projection draw the full mesh.
  assert.equal(levelForView(levels, mesh, new THREE.OrthographicCamera(), 940), levels[0]);
});

test('each draw selects its level and restores the full draw range afterwards', async () => {
  const geometry = sphere();
  await addDetailLevels(geometry);
  geometry.computeBoundingSphere();
  const levels = detailLevels(geometry)!;
  const mesh = new THREE.Mesh(geometry), camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 500);
  let earlier = 0, later = 0;
  mesh.onBeforeRender = () => { earlier++; };
  mesh.onAfterRender = () => { later++; };
  selectDetailByScreen(mesh);
  mesh.position.set(0, 0, -300); mesh.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const renderer = { getRenderTarget: () => ({ height: 940 }), getDrawingBufferSize: (v: THREE.Vector2) => v.set(1920, 1080) } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene(), material = mesh.material as THREE.Material;
  const group = new THREE.Group();
  mesh.onBeforeRender(renderer, scene, camera, geometry, material, group);
  assert.deepEqual({ ...geometry.drawRange }, { start: levels.at(-1)!.start, count: levels.at(-1)!.count });
  mesh.onAfterRender(renderer, scene, camera, geometry, material, group);
  assert.deepEqual({ ...geometry.drawRange }, { start: 0, count: levels[0]!.count });
  assert.deepEqual([earlier, later], [1, 1]);
});

test('geometries that cannot take levels are left untouched', async () => {
  const unindexed = sphere().toNonIndexed();
  assert.equal(await addDetailLevels(unindexed), false);
  assert.equal(detailLevels(unindexed), undefined);
  const grouped = sphere();
  grouped.addGroup(0, grouped.index!.count, 0);
  const index = grouped.index;
  assert.equal(await addDetailLevels(grouped), false);
  assert.equal(grouped.index, index);
  // A tiny mesh has nothing worth removing.
  const box = new THREE.BoxGeometry();
  assert.equal(await addDetailLevels(box), false);
  assert.equal(box.drawRange.count, Infinity);
});
