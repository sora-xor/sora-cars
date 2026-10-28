import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { nearestPaletteIndex } from '../src/game/three/pixel-art/linework';
import { hueDistance, oklch, PIXEL_PALETTE } from '../src/game/three/pixel-art/palette';
import {
  createCameraTravel, createMovers, MAX_MOVERS, SPARKLE_COLOURS, SURFACE_DEFAULTS, surfaceOptionsFromQuery,
} from '../src/game/three/pixel-art/surfaces';

const lchOf = (index: number) => oklch(Array.from(PIXEL_PALETTE.oklab.subarray(index * 4, index * 4 + 3)));

test('?pixelSurfaces selects the surface stages for A/B captures', () => {
  assert.deepEqual(surfaceOptionsFromQuery(''), {});
  assert.deepEqual(surfaceOptionsFromQuery('?picture=pixel'), {});
  assert.deepEqual(surfaceOptionsFromQuery('?pixelSurfaces=off'), { surfaceField: 0, wetGround: 0, temporal: 0 });
  assert.deepEqual(surfaceOptionsFromQuery('?picture=pixel&pixelSurfaces=field, temporal'),
    { surfaceField: 1, wetGround: 0, temporal: 1 });
});

test('surface defaults follow the measured wet-ground and dash rules', () => {
  for (const [key, value] of Object.entries(SURFACE_DEFAULTS)) assert.ok(Number.isFinite(value), key);
  const d = SURFACE_DEFAULTS;
  // Horizontal dashes: long axis several cells, short axis about one cell.
  assert.ok(d.fieldDashCells >= 3 * d.fieldRowCells && d.skyDashCells >= 3 * d.skyRowCells);
  // Wet-ground dashes are 2-6 cells long, more on than off (refine round 2:
  // 2-cell dashes at half duty read as a leopard-spot dissolve); sparkles 1-5% of lit wet cells.
  assert.ok(d.wetDashCells >= 2 && d.wetDashCells <= 6 && d.wetDashDuty >= 0.5 && d.wetDashDuty <= 0.8);
  assert.ok(d.sparkleLit >= 0.01 && d.sparkleLit <= 0.05 && d.sparkleRain <= 0.05);
  // Upward-facing ground only, and the column window fits the composite shader (at most 32 cells down, 8 up).
  assert.ok(d.wetNormal >= 0.8 && d.wetNormal < 1);
  assert.ok(d.wetColumnDown <= 32 && d.wetColumnUp <= 8 && d.wetColumnDown > d.wetColumnUp);
  assert.ok(d.temporalMargin > 0 && d.temporalMargin < 0.05 && d.temporalDepthTolerance < 0.1);
  assert.ok(d.fieldMotionStretch >= 1);
});

test('sparkles snap to warm amber/gold and cool lavender/pale palette entries', () => {
  const amber = lchOf(nearestPaletteIndex(PIXEL_PALETTE, SPARKLE_COLOURS.amber));
  const gold = lchOf(nearestPaletteIndex(PIXEL_PALETTE, SPARKLE_COLOURS.gold));
  const lavender = lchOf(nearestPaletteIndex(PIXEL_PALETTE, SPARKLE_COLOURS.lavender));
  const pale = lchOf(nearestPaletteIndex(PIXEL_PALETTE, SPARKLE_COLOURS.white));
  for (const [name, [L, C, h]] of [['amber', amber], ['gold', gold]] as const) {
    assert.ok(L > 0.7 && C > 0.08 && hueDistance(h, 70) < 30, `${name} ${L} ${C} ${h}`);
  }
  assert.ok(lavender[0] > 0.55 && lavender[1] > 0.06 && hueDistance(lavender[2], 295) < 30, `lavender ${lavender}`);
  assert.ok(pale[0] > 0.88 && pale[1] < 0.05, `pale ${pale}`);
});

test('camera travel is a smoothed per-frame velocity that resets on cuts and stalls', () => {
  const travel = createCameraTravel();
  const camera = new THREE.PerspectiveCamera();
  const out = new THREE.Vector4(0, 0, 0, 2);
  // 30 m/s along +z, sampled at 60 Hz: converges to 0.5 m per nominal frame.
  for (let i = 0; i <= 120; i++) {
    camera.position.set(0, 2, 30 * i / 60); camera.updateMatrixWorld();
    travel.update(camera, i / 60, out);
  }
  assert.ok(Math.abs(out.z - 0.5) < 0.01 && Math.abs(out.x) < 1e-9, `${out.z}`);
  assert.equal(out.w, 2, 'the stretch in w is kept');
  // A repeated timestamp (same simulation tick) changes nothing.
  travel.update(camera, 2, out);
  assert.ok(Math.abs(out.z - 0.5) < 0.01);
  // A camera cut (a jump of tens of metres) drops the velocity.
  camera.position.z += 80; camera.updateMatrixWorld();
  travel.update(camera, 2 + 1 / 60, out);
  assert.equal(out.z, 0);
  travel.reset();
  travel.update(camera, 3, out);
  assert.equal(out.z, 0);
});

test('mover boxes come from opaque visible meshes and stay above the resting plane', () => {
  const movers = createMovers();
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 4.2), new THREE.MeshBasicMaterial());
  body.position.y = 0.45; // wheels and underbody reach below y = 0
  const glass = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), new THREE.MeshBasicMaterial({ transparent: true }));
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(9, 9, 9), new THREE.MeshBasicMaterial());
  hidden.visible = false;
  car.add(body, glass, hidden);
  const scene = new THREE.Scene();
  scene.add(car);
  car.position.set(10, 0, 20); car.rotation.y = 0.3;
  scene.updateMatrixWorld(true);
  movers.set([car]);
  movers.update();
  assert.equal(movers.max[0]!.w, 1);
  assert.equal(movers.min[0]!.w, 0, 'no previous transform on the first frame');
  assert.ok(Math.abs(movers.max[0]!.x - 0.93) < 1e-6 && Math.abs(movers.max[0]!.z - 2.13) < 1e-6, 'opaque body only');
  assert.ok(Math.abs(movers.min[0]!.y - 0.08) < 1e-6, 'the road under the car stays world anchored');
  // World to local really is the inverse of the car's transform.
  const local = new THREE.Vector3(10, 1, 20).applyMatrix4(movers.toLocal[0]!);
  assert.ok(Math.abs(local.y - 1) < 1e-6 && local.length() < 1.01);
  // Second frame: last frame's transform is known and moves with the car.
  const before = car.matrixWorld.clone();
  car.position.z += 1; scene.updateMatrixWorld(true);
  movers.update();
  assert.equal(movers.min[0]!.w, 1);
  assert.deepEqual(movers.previous[0]!.elements, before.elements);
  // Hidden or missing objects free their slot.
  car.visible = false;
  movers.update();
  assert.equal(movers.max[0]!.w, 0);
  for (let i = 1; i < MAX_MOVERS; i++) assert.equal(movers.max[i]!.w, 0);
});

test('refine round 2: canopy, wall and ground motion defaults', () => {
  const d = SURFACE_DEFAULTS;
  // Canopy flags hold with hysteresis and canopies smooth into massed tones.
  assert.ok(d.foliageHysteresis > 0 && d.foliageHysteresis < 0.3 && d.foliageSmooth > 0 && d.foliageSmooth <= 1);
  assert.ok(d.foliageClumpOffset >= 1 && d.foliageClumpOffset <= 2);
  // Temporal stability round: walls stay crisp at speed (the OKLab accumulation
  // calms their strobe); the along-motion filter is an option, edge preserving.
  assert.equal(d.wallMotionFilter, 0);
  assert.ok(d.wallMotionStart >= 1 && d.wallMotionEdge >= 0);
  // Car cells hold their entry a little more than world cells; reflection columns are long dashes.
  assert.ok(d.temporalCarMargin > d.temporalMargin && d.temporalCarMargin < 0.08);
  assert.ok(d.wetColumnDashCells >= 3 && d.wetColumnDashDuty > 0.5 && d.wetColumnRowKeep > 0.5 && d.wetColumnRowKeep < 1);
});
