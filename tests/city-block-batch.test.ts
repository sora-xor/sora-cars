import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CityBlockBatch } from '../src/game/three/city-block-batch';
import { CITY_BLOCK_CAPACITIES, type CityBlockPlacement, type CityBlockWindow } from '../src/game/three/city-blocks';

function fixture() {
  const texture = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map: texture });
  const glass = new THREE.MeshPhysicalMaterial({ roughness: .25, transmission: .6 });
  const depth = new THREE.MeshDepthMaterial(), distance = new THREE.MeshDistanceMaterial();
  const geometry = new THREE.BoxGeometry(7, 6, 5), roof = new THREE.CylinderGeometry(3, 5, 1, 24);
  const hiddenGeometry = new THREE.BoxGeometry(500, 500, 500);
  const parent = new THREE.Group(); parent.position.set(-115, 90, 233); parent.rotation.set(.05, .34, -.04); parent.scale.set(1.2, .92, 1.03);
  const templates = Array.from({ length: 6 }, (_, i) => {
    const group = new THREE.Group(); group.position.set(40 + i, -3, i * 12); group.rotation.y = -.76 + i * .12; group.scale.set(.95, 1.03, 1.05);
    group.visible = false; parent.add(group);
    const nested = new THREE.Group(); nested.position.set(1.7, 3, -.8); nested.rotation.y = .23; nested.scale.set(1.08, .95, 1.1); group.add(nested);
    const walls = new THREE.Mesh(geometry, [material, glass]); walls.name = 'walls'; walls.position.set(-1, 0, .6); walls.rotation.y = -.19;
    walls.castShadow = true; walls.receiveShadow = true; walls.customDepthMaterial = depth; walls.customDistanceMaterial = distance;
    walls.renderOrder = 3; walls.layers.set(2); nested.add(walls);
    const roofMesh = new THREE.Mesh(roof, material); roofMesh.name = 'roof'; roofMesh.position.set(3.1, 7.2, -.4); roofMesh.rotation.y = .4; group.add(roofMesh);
    const hiddenGroup = new THREE.Group(); hiddenGroup.visible = false; hiddenGroup.add(new THREE.Mesh(hiddenGeometry, material)); group.add(hiddenGroup);
    return group;
  });
  const before = templates.map(g => ({ position: g.position.toArray(), rotation: g.rotation.toArray(), scale: g.scale.toArray(), visible: g.visible }));
  const sourceBuffers = [geometry, roof, hiddenGeometry].map(g => Array.from(g.getAttribute('position').array));
  return { templates, before, sourceBuffers, geometry, roof, hiddenGeometry, material, glass, texture, depth, distance,
    batch: new CityBlockBatch({ buildings: templates.slice(0, 4), apartments: templates.slice(4) }) };
}
function placement(id: string, variant = 0, kind: 'building' | 'apartment' = 'building'): CityBlockPlacement {
  return { id, kind, variant, p: 200, side: 1, clearance: kind === 'building' ? 23 : 40,
    position: [145.2 + id.length, 3.2, -224.1], heading: .57,
    footprint: { x: 145.2, z: -224.1, heading: .57, halfX: 8, halfZ: 5 }, ground: { min: 3.21, max: 3.23, samples: 12 } };
}
function meshMatrices(batch: CityBlockBatch): Map<string, number[]> {
  const result = new Map<string, number[]>(), matrix = new THREE.Matrix4();
  for (const object of batch.group.children) {
    const mesh = object as THREE.InstancedMesh;
    for (const [index, id] of mesh.userData.cityBlockIds.entries()) {
      mesh.getMatrixAt(index, matrix); result.set(`${mesh.name}/${id}`, matrix.toArray());
    }
  }
  return result;
}
function closeMatrix(actual: THREE.Matrix4, expected: THREE.Matrix4): void {
  assert.ok(actual.elements.every((v, i) => Math.abs(v - expected.elements[i]!) < 2e-5), `${actual.elements} != ${expected.elements}`);
}
function disposeSources(f: ReturnType<typeof fixture>): void {
  f.geometry.dispose(); f.roof.dispose(); f.hiddenGeometry.dispose(); f.material.dispose(); f.glass.dispose();
  f.texture.dispose(); f.depth.dispose(); f.distance.dispose();
}

test('full static source meshes share materials and geometry, ignore live root placement, and start invisible', () => {
  const f = fixture(), batch = f.batch;
  assert.equal(batch.stats.meshBatches, 12);
  assert.equal(batch.stats.capacity, 36);
  assert.equal(batch.stats.capacityTriangles, 36 * (f.geometry.index!.count + f.roof.index!.count) / 3);
  assert.equal(batch.group.children.length, 12, 'hidden descendants are not resurrected');
  for (const child of batch.group.children) {
    const mesh = child as THREE.InstancedMesh;
    assert.equal(mesh.count, 0); assert.equal(mesh.visible, false);
    assert.ok(mesh.geometry === f.geometry || mesh.geometry === f.roof);
    if (mesh.geometry === f.geometry) {
      assert.deepEqual(mesh.material, [f.material, f.glass]); assert.equal(mesh.castShadow, true); assert.equal(mesh.receiveShadow, true);
      assert.equal(mesh.customDepthMaterial, f.depth); assert.equal(mesh.customDistanceMaterial, f.distance);
      assert.equal(mesh.renderOrder, 3); assert.equal(mesh.layers.mask, 1 << 2);
    } else assert.equal(mesh.material, f.material);
  }
  assert.deepEqual(f.templates.map(g => ({ position: g.position.toArray(), rotation: g.rotation.toArray(), scale: g.scale.toArray(), visible: g.visible })), f.before);
  assert.deepEqual([f.geometry, f.roof, f.hiddenGeometry].map(g => Array.from(g.getAttribute('position').array)), f.sourceBuffers);
  batch.dispose(); disposeSources(f);
});

test('bounds enclose every transformed roof and attachment vertex, independent of placed template roots', () => {
  const f = fixture();
  const envelope = new THREE.Box3();
  // Use local parent-matrix products rather than inverseWorld * meshWorld.
  const source = f.templates[0]!;
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.geometry === f.hiddenGeometry) return;
    const relative = object.matrix.clone();
    for (let parent = object.parent; parent && parent !== source; parent = parent.parent) relative.premultiply(parent.matrix);
    const positions = object.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) envelope.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(relative));
  });
  for (const b of [...f.batch.bounds.buildings, ...f.batch.bounds.apartments]) {
    assert.ok(b.minX <= envelope.min.x + 1e-7 && b.maxX >= envelope.max.x - 1e-7);
    assert.ok(b.minY <= envelope.min.y + 1e-7 && b.maxY >= envelope.max.y - 1e-7);
    assert.ok(b.minZ <= envelope.min.z + 1e-7 && b.maxZ >= envelope.max.z - 1e-7);
    assert.ok(b.maxX < 20 && b.maxY < 12, 'live parent scale/position and hidden geometry must not leak into source dimensions');
  }
  const p = placement('one'); f.batch.setPlacements({ buildings: [p], apartments: [] });
  const expectedRoot = new THREE.Matrix4().makeRotationY(p.heading).setPosition(...p.position);
  const part = f.batch.group.children.find(m => m.name === 'City buildings 0 / walls') as THREE.InstancedMesh;
  const walls = source.getObjectByName('walls')!;
  const expected = expectedRoot.clone().multiply(walls.parent!.matrix).multiply(walls.matrix), actual = new THREE.Matrix4();
  part.getMatrixAt(0, actual); closeMatrix(actual, expected);
  assert.ok(part.boundingBox && !part.boundingBox.isEmpty());
  assert.ok(part.boundingSphere && Number.isFinite(part.boundingSphere.radius));
  f.batch.dispose(); disposeSources(f);
});

test('stable IDs retain exact instance transforms after reorder, backwards visits and template pool recycling', () => {
  const f = fixture(), a = placement('a'), b = { ...placement('b'), position: [230, 3.1, -119] as const };
  const window = { buildings: [b, a], apartments: [placement('tower', 1, 'apartment')] };
  f.batch.setPlacements(window); const first = meshMatrices(f.batch);
  f.templates.forEach((source, i) => { source.position.set(1000 + i, 300, 2000); source.rotation.y += 1.4; source.scale.setScalar(2); source.visible = true; });
  f.batch.setPlacements({ buildings: [a, b], apartments: window.apartments });
  assert.deepEqual(meshMatrices(f.batch), first);
  f.batch.setPlacements({ buildings: [placement('other', 3)], apartments: [] });
  f.batch.setPlacements(window); assert.deepEqual(meshMatrices(f.batch), first);
  f.batch.setPlacements({ buildings: [], apartments: [] });
  assert.ok(f.batch.group.children.every(m => !m.visible && (m as THREE.InstancedMesh).count === 0));
  assert.equal(f.batch.group.userData.cityBlockStats.visibleTriangles, 0);
  f.batch.dispose(); disposeSources(f);
});

test('all six variant capacities are enforced atomically before replacing live matrices', () => {
  const f = fixture();
  const full: CityBlockWindow = {
    buildings: CITY_BLOCK_CAPACITIES.buildings.flatMap((count, variant) => Array.from({ length: count }, (_, i) => placement(`b${variant}/${i}`, variant))),
    apartments: CITY_BLOCK_CAPACITIES.apartments.flatMap((count, variant) => Array.from({ length: count }, (_, i) => placement(`a${variant}/${i}`, variant, 'apartment'))),
  };
  f.batch.setPlacements(full); const snapshot = meshMatrices(f.batch);
  assert.equal(f.batch.group.userData.cityBlockStats.visibleTriangles, f.batch.stats.capacityTriangles);
  assert.equal(f.batch.group.userData.cityBlockStats.visibleBuildings, 26);
  assert.equal(f.batch.group.userData.cityBlockStats.visibleApartments, 10);
  const invalid = [
    { buildings: [...full.buildings, placement('overflow')], apartments: full.apartments },
    { buildings: [placement('same'), placement('same')], apartments: [] },
    { buildings: [{ ...placement('bad'), position: [NaN, 0, 0] as const }], apartments: [] },
    { buildings: [placement('unknown', 4)], apartments: [] },
  ];
  for (const window of invalid) {
    assert.throws(() => f.batch.setPlacements(window)); assert.deepEqual(meshMatrices(f.batch), snapshot);
  }
  f.batch.dispose(); disposeSources(f);
});

test('disposal releases instance ownership once and preserves every shared source resource', () => {
  const f = fixture(); let meshDisposals = 0, sourceDisposals = 0;
  for (const child of f.batch.group.children) (child as THREE.InstancedMesh).addEventListener('dispose', () => meshDisposals++);
  for (const resource of [f.geometry, f.roof, f.hiddenGeometry, f.material, f.glass, f.texture, f.depth, f.distance])
    resource.addEventListener('dispose', () => sourceDisposals++);
  f.batch.setPlacements({ buildings: [placement('one')], apartments: [] });
  f.batch.dispose(); f.batch.dispose();
  assert.equal(meshDisposals, 12); assert.equal(sourceDisposals, 0); assert.equal(f.batch.group.children.length, 0);
  assert.deepEqual([f.geometry, f.roof, f.hiddenGeometry].map(g => Array.from(g.getAttribute('position').array)), f.sourceBuffers);
  assert.throws(() => f.batch.setPlacements({ buildings: [], apartments: [] }), /disposed/);
  disposeSources(f);
});
