import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TECH_NODES } from '../src/game/garage-tech';
import { EMBLEM, PART_MODEL_IDS, PART_SIZE, createPartModel, type PartAnimation } from '../src/game/three/part-models';
import { CSS_PER_ART_PIXEL, partArtGrid } from '../src/ui/part-viewer';

const textures = { emblem: new THREE.Texture(), carbon: new THREE.Texture() };
const meshes = (model: THREE.Object3D) => { const found: THREE.Mesh[] = []; model.traverse(child => { if ((child as THREE.Mesh).isMesh) found.push(child as THREE.Mesh); }); return found; };

test('every tech-tree part has a studio model, and only those parts', () => {
  assert.deepEqual([...PART_MODEL_IDS].sort(), TECH_NODES.map(node => node.id).sort());
  assert.throws(() => createPartModel('engine-warp-drive', textures), RangeError);
});

test('each model is centred, scaled to the studio size and light enough to keep spinning', () => {
  for (const id of PART_MODEL_IDS) {
    const model = createPartModel(id, textures), bounds = new THREE.Box3().setFromObject(model, true);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - PART_SIZE) < 1e-3, `${id} longest side ${Math.max(size.x, size.y, size.z)}`);
    assert.ok(center.length() < 1e-3, `${id} is centred`);
    const triangles = meshes(model).reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
    assert.ok(triangles < 10000, `${id}: ${triangles} triangles`);
    const animate = model.userData.animate as PartAnimation | undefined;
    if (animate) for (const seconds of [0, 0.4, 7.3]) animate(seconds);
  }
});

test('every model carries the exact emblem once, visible and centred on the face it sits on', () => {
  for (const id of PART_MODEL_IDS) {
    const model = createPartModel(id, textures), emblems = meshes(model).filter(mesh => mesh.name === EMBLEM);
    assert.equal(emblems.length, 1, `${id} has one emblem`);
    const emblem = emblems[0]!, material = emblem.material as THREE.MeshStandardMaterial;
    assert.equal(material.map, textures.emblem, `${id} prints the supplied emblem texture`);
    const position = emblem.getWorldPosition(new THREE.Vector3());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(emblem.getWorldQuaternion(new THREE.Quaternion())).normalize();
    // Nothing covers it: looking straight at it, the emblem is the first surface hit.
    const hits = new THREE.Raycaster(position.clone().addScaledVector(normal, 4), normal.clone().negate()).intersectObject(model, true);
    assert.equal(hits[0]?.object, emblem, `${id} emblem is unobstructed`);
    // Centred: within a fifth of the part's extent of its middle, across the face.
    const bounds = new THREE.Box3().setFromObject(model, true), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const facing = [0, 1, 2].reduce((best, axis) => Math.abs(normal.getComponent(axis)) > Math.abs(normal.getComponent(best)) ? axis : best, 0);
    for (const axis of [0, 1, 2].filter(axis => axis !== facing)) {
      const offset = Math.abs(position.getComponent(axis) - center.getComponent(axis)) / size.getComponent(axis);
      assert.ok(offset <= 0.2, `${id} emblem is ${(offset * 100).toFixed(0)}% off centre on axis ${'xyz'[axis]}`);
    }
  }
});

test('all parts share three shader programs, so the first visit compiles little', () => {
  const kinds = new Set<string>();
  for (const id of PART_MODEL_IDS) for (const mesh of meshes(createPartModel(id, textures))) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    assert.ok(material.isMeshStandardMaterial && material.side === THREE.DoubleSide, `${id} uses the shared material type`);
    kinds.add(`${material.map ? material.map === textures.carbon ? 'carbon' : 'emblem' : 'plain'}:${material.alphaTest > 0}`);
  }
  assert.deepEqual([...kinds].sort(), ['carbon:false', 'emblem:true', 'plain:false']);
});

test('part canvases use the cutscene art-pixel grid with the pixel finish, display pixels without', () => {
  assert.deepEqual(partArtGrid(52, 52, 2, true), { width: 52 / CSS_PER_ART_PIXEL, height: 52 / CSS_PER_ART_PIXEL, supersample: 4, pixel: true });
  assert.deepEqual(partArtGrid(330, 210, 2, true), { width: 165, height: 105, supersample: 4, pixel: true });
  assert.equal(partArtGrid(4, 4, 1, true).width, 8, 'never smaller than a readable sprite');
  assert.deepEqual(partArtGrid(52, 52, 2, false), { width: 104, height: 104, supersample: 2, pixel: false });
  assert.equal(partArtGrid(52, 52, 3, false).width, 104, 'clean renders cap the device pixel ratio at 2');
});
