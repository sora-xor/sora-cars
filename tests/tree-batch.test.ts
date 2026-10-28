import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TreeBatch } from '../src/game/three/tree-batch';

function fixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.lookAt(0, 0, -1);
  const light = new THREE.DirectionalLight();
  light.position.set(0, 80, 0);
  light.target.position.set(0, 0, -10);
  Object.assign(light.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 300 });
  light.shadow.camera.updateProjectionMatrix();
  scene.add(camera, light, light.target);
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const material = new THREE.MeshStandardMaterial();
  function tree(x: number, z: number) {
    const group = new THREE.Group(), mesh = new THREE.Mesh(geometry, material);
    group.position.set(x, 0, z); mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh); scene.add(group);
    return { group, mesh };
  }
  function update(batch: TreeBatch) {
    // Same ordering as RaceWorld: include newly recycled source transforms and
    // the light target before creating the instance lists for this frame.
    scene.updateMatrixWorld(true); batch.update(camera, light);
  }
  return { scene, camera, light, geometry, material, tree, update };
}

function instances(batch: TreeBatch, shadow: boolean) {
  return batch.group.children.filter((object): object is THREE.InstancedMesh =>
    object instanceof THREE.InstancedMesh && object.castShadow === shadow);
}

function count(batch: TreeBatch, shadow = false): number {
  return instances(batch, shadow).reduce((sum, mesh) => sum + mesh.count, 0);
}

function assertMatrix(actual: THREE.Matrix4, expected: THREE.Matrix4): void {
  actual.elements.forEach((value, index) => assert.ok(Math.abs(value - expected.elements[index]!) < 1e-5,
    `instance matrix element ${index}: ${value} differs from source ${expected.elements[index]}`));
}

test('batched trees preserve nested transforms and remove recycled or hidden sources each frame', () => {
  const f = fixture(), a = f.tree(0, -12), b = f.tree(2, -14);
  a.group.scale.set(1.25, 1.7, 0.85); a.group.rotation.y = 0.7;
  a.mesh.position.set(0.3, 1.2, -0.4); a.mesh.rotation.x = 0.2;
  b.group.visible = false;
  const batch = new TreeBatch([a.group, b.group]); f.scene.add(batch.group);
  f.update(batch);
  assert.equal(count(batch), 1);
  const matrix = new THREE.Matrix4(), beauty = instances(batch, false)[0]!;
  beauty.getMatrixAt(0, matrix); assertMatrix(matrix, a.mesh.matrixWorld);

  // A recycled tree is moved through the same pool without rebuilding a batch.
  a.group.position.set(80, 0, -12); b.group.visible = true;
  f.update(batch); assert.equal(count(batch), 1);
  beauty.getMatrixAt(0, matrix); assertMatrix(matrix, b.mesh.matrixWorld);
  b.group.visible = false; f.update(batch);
  assert.equal(count(batch), 0); assert.equal(beauty.visible, false);
  a.group.position.set(0, 0, -12); f.update(batch);
  assert.equal(count(batch), 1); assert.equal(beauty.visible, true);
  batch.dispose();
});

test('camera movement selects exactly one authored LOD and preserves hysteresis', () => {
  const f = fixture(), group = new THREE.Group(), lod = new THREE.LOD();
  const near = new THREE.Mesh(f.geometry, f.material);
  const farGeometry = new THREE.IcosahedronGeometry(0.5);
  const far = new THREE.Mesh(farGeometry, f.material);
  near.castShadow = far.castShadow = true;
  lod.addLevel(near, 0); lod.addLevel(far, 20, 0.1);
  group.position.z = -10; group.add(lod); f.scene.add(group);
  const batch = new TreeBatch([group]); f.scene.add(batch.group);
  const activeGeometry = () => instances(batch, false).filter(mesh => mesh.count > 0).map(mesh => mesh.geometry);
  f.update(batch);
  assert.equal(count(batch), 1); assert.deepEqual(activeGeometry(), [f.geometry]);

  f.camera.position.z = 11; f.update(batch); // 21 m from the LOD origin.
  assert.equal(count(batch), 1); assert.deepEqual(activeGeometry(), [farGeometry]);
  f.camera.position.z = 9; f.update(batch); // Keep the far mesh inside the hysteresis interval.
  assert.deepEqual(activeGeometry(), [farGeometry]);
  f.camera.position.z = 7; f.update(batch);
  assert.equal(count(batch), 1); assert.deepEqual(activeGeometry(), [f.geometry]);
  assert.equal(count(batch, true), 1, 'only the selected LOD also casts shadows');
  batch.dispose(); farGeometry.dispose();
});

test('off-camera trees remain shadow casters and camera turns replace the beauty list', () => {
  const f = fixture(), ahead = f.tree(0, -10), side = f.tree(100, -10), behind = f.tree(0, 20);
  const batch = new TreeBatch([ahead.group, side.group, behind.group]); f.scene.add(batch.group);
  f.update(batch);
  assert.equal(count(batch), 1); assert.equal(count(batch, true), 3);
  const matrix = new THREE.Matrix4(), beauty = instances(batch, false)[0]!, shadow = instances(batch, true)[0]!;
  beauty.getMatrixAt(0, matrix); assertMatrix(matrix, ahead.mesh.matrixWorld);

  f.camera.lookAt(0, 0, 20); f.update(batch);
  assert.equal(count(batch), 1); assert.equal(count(batch, true), 3);
  beauty.getMatrixAt(0, matrix); assertMatrix(matrix, behind.mesh.matrixWorld);
  behind.mesh.castShadow = false; f.update(batch);
  assert.equal(count(batch), 1); assert.equal(count(batch, true), 2);

  // Three invokes the beauty callbacks for the normal/depth override passes as
  // well. Neither pass may draw the independent off-camera shadow instances.
  for (const material of [f.material, new THREE.MeshNormalMaterial()]) {
    const originalCount = shadow.count, version = shadow.instanceMatrix.version;
    shadow.onBeforeRender(null as unknown as THREE.WebGLRenderer, f.scene, f.camera, shadow.geometry, material, null as unknown as THREE.Group);
    assert.equal(shadow.count, 0);
    shadow.onAfterRender(null as unknown as THREE.WebGLRenderer, f.scene, f.camera, shadow.geometry, material, null as unknown as THREE.Group);
    assert.equal(shadow.count, originalCount);
    assert.equal(shadow.instanceMatrix.version, version, 'color suppression must not upload or replace shadow matrices');
  }
  f.light.position.x = f.light.target.position.x = 1000; f.update(batch);
  assert.equal(count(batch), 1, 'moving the light must not change camera visibility');
  assert.equal(count(batch, true), 0); assert.equal(shadow.visible, false);
  f.light.position.x = f.light.target.position.x = 0; f.update(batch);
  assert.equal(count(batch, true), 2); assert.equal(shadow.visible, true);
  batch.dispose();
});

test('disabling and disposing restores source layers and releases only instance-owned resources', () => {
  const f = fixture(), a = f.tree(0, -10), b = f.tree(2, -10);
  a.mesh.layers.mask = 5; b.mesh.layers.mask = 10;
  const depth = new THREE.MeshDepthMaterial({ alphaTest: 0.4 });
  const distance = new THREE.MeshDistanceMaterial({ alphaTest: 0.4 });
  a.mesh.customDepthMaterial = b.mesh.customDepthMaterial = depth;
  a.mesh.customDistanceMaterial = b.mesh.customDistanceMaterial = distance;
  const batch = new TreeBatch([a.group, b.group]); f.scene.add(batch.group); f.update(batch);
  assert.equal(a.mesh.layers.mask, 0); assert.equal(b.mesh.layers.mask, 0);
  for (const mesh of [...instances(batch, false), ...instances(batch, true)]) {
    assert.equal(mesh.geometry, f.geometry); assert.equal(mesh.material, f.material);
    assert.equal(mesh.customDepthMaterial, depth); assert.equal(mesh.customDistanceMaterial, distance);
  }
  batch.setEnabled(false);
  assert.equal(batch.group.visible, false);
  assert.equal(a.mesh.layers.mask, 5); assert.equal(b.mesh.layers.mask, 10);
  batch.setEnabled(true); f.update(batch);
  assert.equal(batch.group.visible, true);
  assert.equal(a.mesh.layers.mask, 0); assert.equal(b.mesh.layers.mask, 0);

  let ownedDisposals = 0, sharedDisposals = 0;
  const meshes = [...instances(batch, false), ...instances(batch, true)];
  for (const mesh of meshes) mesh.addEventListener('dispose', () => ownedDisposals++);
  for (const resource of [f.geometry, f.material, depth, distance]) resource.addEventListener('dispose', () => sharedDisposals++);
  batch.dispose();
  assert.equal(ownedDisposals, meshes.length);
  assert.equal(sharedDisposals, 0, 'the source asset cache retains ownership of geometry and materials');
  assert.equal(batch.group.children.length, 0);
  assert.equal(a.mesh.layers.mask, 5); assert.equal(b.mesh.layers.mask, 10);
});
