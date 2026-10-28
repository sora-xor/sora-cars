import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { nearestPaletteIndex } from '../src/game/three/pixel-art/linework';
import { oklch, PIXEL_PALETTE } from '../src/game/three/pixel-art/palette';
import {
  createCameraTravel, createLateralTravel, lampColumnScreen, MAX_GROUND_EMITTERS, MAX_HAZARDS, MAX_POOL_LIGHTS,
  createStepper, OIL_COLOURS, SURFACE_DEFAULTS, surfaceOptionsFromQuery,
} from '../src/game/three/pixel-art/surfaces';

const lchOf = (hex: string) => {
  const i = nearestPaletteIndex(PIXEL_PALETTE, hex);
  return oklch(Array.from(PIXEL_PALETTE.oklab.subarray(i * 4, i * 4 + 3)));
};

test('?pixelGround selects the ground stage parts for A/B captures', () => {
  assert.deepEqual(surfaceOptionsFromQuery('?picture=pixel'), {});
  assert.deepEqual(surfaceOptionsFromQuery('?pixelGround=off'),
    { groundDashes: 0, litFlecks: 0, lampColumns: 0, wetDryFade: 0, keyGlints: 0, oilHazards: 0 });
  assert.deepEqual(surfaceOptionsFromQuery('?pixelGround=flecks, columns'),
    { groundDashes: 0, litFlecks: 1, lampColumns: 1, wetDryFade: 0, keyGlints: 0, oilHazards: 0 });
  // Both switches combine.
  assert.deepEqual(surfaceOptionsFromQuery('?pixelSurfaces=off&pixelGround=dashes,oil'),
    { surfaceField: 0, wetGround: 0, temporal: 0, groundDashes: 1, litFlecks: 0, lampColumns: 0, wetDryFade: 0, keyGlints: 0, oilHazards: 1 });
});

test('ground defaults follow the measured dash, fleck and column rules', () => {
  const d = SURFACE_DEFAULTS;
  // Dashes 1 cell tall and 2-6 cells long: the lattice spreads lengths from half to twice the mean.
  assert.ok(d.groundDashCells >= 2 && d.groundDashCells <= 3.5);
  assert.ok(d.groundSpeckle > 0 && d.groundSpeckle < 1 && d.groundMottle > 0 && d.groundMottle < 1);
  assert.ok(d.groundDryMottle > 0 && d.groundDryMottle <= 1);
  // Flecks (refine round 2): lamp light on the ground is sparse amber flecks
  // over the violet-grey ground, never a wash: the density stays under half
  // even in full lamp light, the gaps between flecks keep little of the lamp
  // light, only its dim share (the floor) stays in every cell, and dim fringes
  // keep a share of the density.
  assert.ok(d.fleckDensity >= 0.15 && d.fleckDensity <= 0.5 && d.fleckGap > 0 && d.fleckGap <= 0.25 && d.fleckBoost >= 1);
  assert.ok(d.fleckSpeckle >= 0 && d.fleckSpeckle < 1);
  assert.ok(d.fleckFloor > 0 && d.fleckFloor < 0.1 && d.fleckKeep > 0.3 && d.fleckKeep <= 1 && d.fleckSparse > 0 && d.fleckSparse < 1);
  assert.ok(d.fleckSpeedKeep > 0.5);
  assert.ok(d.fleckLitFull > d.fleckLitStart && d.markingFull > d.markingStart && d.markingStart > 1);
  // Columns: up to a handful of cells wide (refine round 1: 1-3-cell columns
  // of flat, jittered dashes read as floating glyphs), longer on soaked ground,
  // fading with distance; a cream core over amber dashes with plum fringe cells.
  assert.ok(d.lampColumnWidth >= 3 && d.lampColumnWidth <= 8 && d.lampLobeWet > d.lampLobeDamp && d.lampColumnFar > 40);
  assert.ok(d.lampColumnCore > d.lampColumnEdge && d.lampColumnEdge > d.lampColumnFringe && d.lampColumnFringe > 0);
  // Ground at speed: screen-row dashes take over before the world rows slide a cell per frame.
  assert.ok(d.groundSpeedStart < d.groundSpeedFull && d.groundSpeedFull <= 1.5);
  // World rows at rest are about one cell tall (refine round 2: 2-4-cell rows read as bricks).
  assert.ok(d.groundRowOctave >= 0.25 && d.groundRowOctave <= 0.75 && d.groundSpeckle <= 0.4);
  // Lane paint stays brightest; far ground calms; the boost stays small.
  assert.ok(d.groundPaintCap > 1 && d.groundPaintCap < d.markingStart && d.fleckBoost <= 4);
  assert.ok(d.groundFarStart < d.groundFarEnd && d.groundFarCalm > 0 && d.groundFarCalm < 1);
  // Key glints nearly vanish on a dry road (sunrise-wide's calm asphalt).
  assert.ok(d.sparkleKeyDry * d.sparkleKey < 0.03);
  // The uniform arrays stay small enough for WebGL 2's fragment uniform budget.
  assert.ok(MAX_POOL_LIGHTS <= 16 && MAX_GROUND_EMITTERS <= 16);
});

test('lamp columns hang under the light, from the ground under it down through its mirror image', () => {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.12, 600);
  camera.position.set(0, 2.7, 0);
  camera.lookAt(0, 1.2, -20);
  camera.updateMatrixWorld();
  const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const size = new THREE.Vector2(560, 315);
  const cellScale = 2 / (camera.projectionMatrix.elements[5]! * size.y);
  const out = new THREE.Vector4();
  // A lamp head 6.6 m up, 40 m ahead, on the road's centre line.
  assert.ok(lampColumnScreen(viewProjection, 0, 6.6, -40, 0, 0.45, size, cellScale, 3, out));
  assert.ok(Math.abs(out.x - 280) < 0.5, `centred: ${out.x}`);
  const mirrorDepth = out.z;
  assert.ok(Math.abs(mirrorDepth - 40) < 3, `depth of the mirror image: ${mirrorDepth}`);
  // The column's far end (the ground under the lamp) is above the mirror image, which is on screen.
  const top = out.y;
  const mirror = new THREE.Vector3(0, -6.6, -40).project(camera);
  assert.ok(top > (mirror.y * 0.5 + 0.5) * size.y, 'the ground under the lamp is above its mirror image');
  // Far lamps are one cell wide, nearer ones wider, up to the widest column.
  assert.ok(lampColumnScreen(viewProjection, 0, 6.6, -160, 0, 0.45, size, cellScale, 3, out));
  assert.equal(out.w, 1);
  assert.ok(lampColumnScreen(viewProjection, 0, 6.6, -90, 0, 0.45, size, cellScale, 3, out));
  assert.ok(out.w > 1 && out.w < 3, `${out.w}`);
  assert.ok(lampColumnScreen(viewProjection, 1.5, 6.6, -12, 0, 0.45, size, cellScale, 3, out));
  assert.equal(out.w, 3);
  // Behind the camera, or far off to the side: no column.
  assert.equal(lampColumnScreen(viewProjection, 0, 6.6, 30, 0, 0.45, size, cellScale, 3, out), false);
  assert.equal(lampColumnScreen(viewProjection, -300, 6.6, -40, 0, 0.45, size, cellScale, 3, out), false);
});

test('the ground at speed anchors dash ends to lateral world positions, not to the screen or the camera path', () => {
  const lateral = createLateralTravel();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 600);
  const out = new THREE.Vector4();
  const place = (x: number, z: number, yaw: number) => {
    camera.position.set(x, 2.7, z); camera.rotation.set(0, yaw, 0); camera.updateMatrixWorld();
    lateral.update(camera, out);
  };
  // A world point's dash coordinate: dot(p - camera, right) + travel.
  const coordinate = (p: THREE.Vector3) => (p.x - camera.position.x) * out.x + (p.z - camera.position.z) * out.z + out.w;
  const point = new THREE.Vector3(1.5, 0, -12);
  place(0, 0, 0);
  const at = coordinate(point);
  assert.ok(Math.abs(out.y) < 1e-9 && Math.abs(Math.hypot(out.x, out.z) - 1) < 1e-9, 'a level unit right vector');
  // Driving straight on: the point keeps its coordinate (its dash holds still).
  place(0, -5, 0);
  assert.ok(Math.abs(coordinate(point) - at) < 1e-9);
  // Steering sideways: the point keeps its coordinate too (the dashes slide with the world).
  place(0.8, -6, 0);
  assert.ok(Math.abs(coordinate(point) - at) < 1e-9);
  // Turning: the right vector turns with the camera and stays level.
  place(0.8, -6, 0.3);
  assert.ok(Math.abs(out.x - Math.cos(0.3)) < 1e-9 && Math.abs(out.z + Math.sin(0.3)) < 1e-9, `${out.toArray()}`);
  // A cut resets nothing but the reference.
  lateral.reset(); place(40, 60, 0);
  assert.ok(Number.isFinite(out.w));
});

test('the ground modes follow the camera speed in steps, never its frame-to-frame wobble', () => {
  const steps = createStepper(0.01);
  // 1.2 m per frame (259 km/h) wobbling +-6% frame to frame settles on one step (within its first dwell).
  const values = new Set<number>();
  for (let frame = 0; frame < 120; frame++) {
    const held = steps.update(1.2 * (1 + 0.06 * (frame % 2 ? 1 : -1)), frame / 60);
    if (frame > 40) values.add(held);
  }
  assert.equal(values.size, 1, `${[...values]}`);
  const [held] = [...values];
  assert.ok(Math.abs(held! / 1.2 - 1) < 0.1, `${held}`);
  // A real change is followed, a step at a time, at most every 0.3 s.
  let changes = 0, last = held;
  for (let frame = 120; frame < 240; frame++) {
    const value = steps.update(1.2 + (frame - 120) * 0.01, frame / 60);
    if (value !== last) { changes++; last = value; }
  }
  assert.ok(changes >= 2 && changes <= 7, `${changes}`);
  assert.ok(Math.abs(last! / 2.39 - 1) < 0.2, `${last}`);
  // Stopped is exactly zero.
  steps.reset();
  assert.equal(steps.update(0.001, 5), 0);
  assert.equal(steps.update(Number.NaN, 6), 0);
});

test('oil slicks are flat, dark, outlined gloss with light 1-cell streaks, in palette entries', () => {
  assert.ok(MAX_HAZARDS >= 4 && MAX_HAZARDS <= 8);
  for (const set of [OIL_COLOURS.night, OIL_COLOURS.dawn]) {
    const [core, ring, outline, streak] = [set.core, set.ring, set.outline, set.streak].map(lchOf);
    assert.ok(core[0] < 0.32 && ring[0] < 0.36, 'a dark gloss');
    assert.ok(outline[0] < core[0] && outline[0] < ring[0], 'the outline is darker than the gloss');
    assert.ok(streak[0] > ring[0] + 0.3, 'the highlight streaks read against it');
  }
  // Lavender streaks under the night moon, amber under a warm key.
  assert.ok(lchOf(OIL_COLOURS.night.streak)[2] > 240 && lchOf(OIL_COLOURS.dawn.streak)[2] < 90);
});

test('camera travel holds steady across the repeated frames of a 30 Hz simulation tick', () => {
  const travel = createCameraTravel();
  const camera = new THREE.PerspectiveCamera();
  const out = new THREE.Vector4(0, 0, 0, 2);
  const samples: number[] = [];
  // 30 m/s: the camera moves 1 m every second 60 Hz frame and holds in between.
  for (let frame = 0; frame <= 240; frame++) {
    camera.position.set(0, 2, Math.floor(frame / 2)); camera.updateMatrixWorld();
    travel.update(camera, frame / 60, out);
    if (frame > 180) samples.push(out.z);
  }
  const low = Math.min(...samples), high = Math.max(...samples);
  assert.ok(Math.abs((low + high) / 2 - 0.5) < 0.02, `0.5 m per nominal frame: ${low}..${high}`);
  assert.ok(high - low < 0.01, `no pulse between the frames of a tick: ${low}..${high}`);
  // A camera that stops is still after a quarter second.
  for (let frame = 241; frame <= 270; frame++) travel.update(camera, frame / 60, out);
  assert.equal(out.z, 0);
});
