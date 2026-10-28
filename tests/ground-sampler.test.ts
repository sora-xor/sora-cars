import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGroundHeightSampler } from '../src/game/three/ground-sampler';
import { createUrbanGround } from '../src/game/three/urban-ground';

test('ground samples match actual transformed mesh ray intersections across triangle and grid boundaries', () => {
  const root = new THREE.Group(), geometry = new THREE.PlaneGeometry(160, 160, 4, 4);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) positions.setY(i, Math.sin(positions.getX(i) / 31) * 2 + positions.getZ(i) * .04);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.position.set(11, 5, -9); mesh.rotation.y = .31; root.add(mesh);
  const before = Array.from(positions.array), sample = createGroundHeightSampler(root);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  for (const x of [-100, -64, -32, -11.3, 0, 32, 64, 96]) for (const z of [-100, -64, -32, -.7, 0, 32, 64, 96]) {
    ray.set(new THREE.Vector3(x, 100, z), down);
    const hit = ray.intersectObject(root, true)[0], actual = sample(x, z);
    if (!hit) assert.equal(actual, null);
    else assert.ok(actual !== null && Math.abs(actual - hit.point.y) < 1e-6);
  }
  assert.deepEqual(Array.from(positions.array), before, 'sampling never changes source geometry');
  assert.equal(sample(NaN, 0), null);
  geometry.dispose(); mesh.material.dispose();
});

test('native pavement exclusions remain holes in the decoration height sampler', () => {
  const poses = Array.from({ length: 21 }, (_, i) => ({ x: 0, y: i * .13, z: i * 5,
    heading: 0, width: 6, p: i * 5 }));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ground = createUrbanGround(poses, material), sample = createGroundHeightSampler(ground);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  for (const z of [1, 10, 32, 48, 64, 92]) {
    for (const x of [-5.9, -2, 0, 3, 5.9]) assert.equal(sample(x, z), null, 'do not place buildings on clipped pavement');
    for (const x of [-52, -27, -7, 7, 23, 46]) {
      ray.set(new THREE.Vector3(x, 100, z), down);
      const hit = ray.intersectObject(ground, true)[0], height = sample(x, z);
      assert.ok(hit && height !== null && Math.abs(hit.point.y - height) < 1e-6);
    }
  }
  assert.equal(sample(1000, 1000), null);
  ground.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  material.dispose();
});
