import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { nearestPaletteIndex } from '../src/game/three/pixel-art/linework';
import { hueDistance, oklch, PIXEL_PALETTE } from '../src/game/three/pixel-art/palette';
import {
  createCameraTravel, createMovers, createSurfaces, MAX_MOVERS, SPARKLE_COLOURS, SURFACE_DEFAULTS, surfaceOptionsFromQuery,
  type GroundEmitter,
} from '../src/game/three/pixel-art/surfaces';
import { createSharedUniforms } from '../src/game/three/pixel-art/stages';

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
  // Refine round 4 glitter (the user's rain-night concept): a speck on some calm wet cells, never all of them,
  // lifted enough to read against the navy road without reaching cream.
  assert.ok(d.wetGlitter > 0 && d.wetGlitter <= 0.6 && d.wetGlitterLift >= 0.1 && d.wetGlitterLift <= 0.3);
  // Trails at speed are an option (the ripple dashes carry the texture now), never more than the still specks.
  assert.ok(d.wetGlitterTrail >= 0 && d.wetGlitterTrail <= 1);
  // Lit facades and shop fronts stretch into reflection columns too, with a ramp between start and full.
  assert.ok(d.wetColumnStart > 0 && d.wetColumnStart < d.wetColumnFull && d.wetColumnFull <= 1);
  // Upward-facing ground only, and the column window fits the composite shader (at most 224 cells down: every other
  // row past 32, every fourth past 96; and 8 up); the near road keeps some of the mirror, never all of it.
  assert.ok(d.wetNormal >= 0.8 && d.wetNormal < 1);
  assert.ok(d.wetColumnDown <= 224 && d.wetColumnUp <= 8 && d.wetColumnDown > d.wetColumnUp);
  // The ripple spread fits its shader's window (4 cells either side) and loses some light per cell.
  assert.ok(d.wetSpread >= 0 && d.wetSpread <= 4 && d.wetSpreadFalloff > 0 && d.wetSpreadFalloff < 0.25);
  // The organic ripple blobs are an option (the waves replaced them): a few cells across with holes and a few dark
  // specks, never solid or empty; the drizzle stays a light speckle.
  assert.ok(d.wetRippleCells >= 2 && d.wetRippleCells <= 8 && d.wetRippleRows >= 1 && d.wetRippleRows <= 8);
  assert.ok(d.wetRippleHoles > 0.2 && d.wetRippleHoles < 0.6 && d.wetRipplePebbles >= 0 && d.wetRipplePebbles < 0.15);
  assert.ok(d.wetDrizzle >= 0 && d.wetDrizzle <= 0.1);
  // Pale reflections lean toward the lamps' gold, never all the way.
  assert.ok(d.wetReflectionWarmth >= 0 && d.wetReflectionWarmth < 1);
  // Ripples near the camera are blobs, farther off taller, narrower streaks.
  assert.ok(d.wetRippleRowsFar > d.wetRippleRows && d.wetRippleCellsFar <= d.wetRippleCells && d.wetRippleFarStart > 0);
  assert.ok(d.wetFresnelFloor >= 0 && d.wetFresnelFloor <= 0.6);
  // The ground keeps its smoothing at speed; upright surfaces (shop interiors, lettering, walkers) stay crisp.
  assert.ok(d.groundSpeedSmooth > 0 && d.wallSpeedSmooth >= 0 && d.wallSpeedSmooth < d.groundSpeedSmooth);
  assert.ok(d.temporalMargin > 0 && d.temporalMargin < 0.05 && d.temporalDepthTolerance < 0.1);
  assert.ok(d.fieldMotionStretch >= 1);
});

test('refine round 4 waves: horizontal wave bands and ripple dashes on the wet road', () => {
  const d = SURFACE_DEFAULTS;
  // On by default, in place of the blobs and the drizzle.
  assert.ok(d.wetWaves === 1 && d.wetRipple === 0 && d.wetDrizzle === 0);
  // Bands wider toward the camera; troughs a minority of rows that darken a reflection without erasing the road.
  assert.ok(d.wetWaveRowsNear > d.wetWaveRowsFar && d.wetWaveRowsFar >= 1 && d.wetWaveHorizon > 0 && d.wetWaveHorizon < 1);
  assert.ok(d.wetWaveThreshold > 0.1 && d.wetWaveThreshold < 0.5 && d.wetWaveTrough > 0 && d.wetWaveTrough < 0.5);
  // Streaks waver by a cell or two; a dense core, sparse ripple marks, and vertical streaks a few cells apart.
  assert.ok(d.wetWaveJitter >= 0 && d.wetWaveJitter <= 2);
  assert.ok(d.wetWaveDashFull > 0 && d.wetWaveDashBase > 0 && d.wetWaveDashBase < 0.3);
  assert.ok(d.wetWaveStreak >= 3 && d.wetWaveStreak <= 10 && d.wetWaveStreakFloor > 0 && d.wetWaveStreakFloor < 1);
  // The marks are a faint sheen, not a second road.
  assert.ok(d.wetWaveSheen > 0 && d.wetWaveSheen < 0.1);
});

test('refine round 4 stones: the wet road mirrors in a mosaic of small stones', () => {
  const d = SURFACE_DEFAULTS;
  // On by default, over the waves (their bands and streaks thin the reflections stone by stone).
  assert.ok(d.wetStones === 1 && d.wetWaves === 1);
  // Courses taller toward the camera, a cell or so at the horizon; stones wider than tall, flatter farther off.
  assert.ok(d.wetStoneRowsNear > d.wetStoneRowsFar && d.wetStoneRowsFar >= 1 && d.wetStoneRowsNear <= 6);
  assert.ok(d.wetStoneAspectFar >= d.wetStoneAspectNear && d.wetStoneAspectNear >= 1);
  // Dark gaps between stones (the ground there darker, never black) and a lifted rim on lit stones.
  assert.ok(d.wetStoneGap >= 0 && d.wetStoneGap < 0.5 && d.wetStoneGround > 0.4 && d.wetStoneGround < 1);
  assert.ok(d.wetStoneRim > 0 && d.wetStoneRim < 1);
  // Only the sun or the moon stretches a mirrored sky into a column.
  assert.ok(d.wetSkyColumn > 0.5);
  // Broad reflections keep under about half their width as streaks.
  assert.ok(d.wetStoneStreakDuty > 0.2 && d.wetStoneStreakDuty < 0.7);
  // By day and at dusk the column thresholds rise (lit facades no longer stretch into a pale mosaic), within reason.
  assert.ok(d.wetColumnDay >= 1 && d.wetColumnDay <= 10);
  // Streak cores keep gold rather than cream (a knee and a little more chroma), and fade toward the camera more
  // slowly than linearly, so the far street's streaks reach the bottom of the frame.
  assert.ok(d.wetReflectionKnee > 0 && d.wetReflectionChroma >= 1 && d.wetReflectionChroma < 2);
  assert.ok(d.wetColumnFade >= 1 && d.wetColumnFade <= 4);
});

test('shop fronts cast wet-ground columns but are no lamp heads', () => {
  const surfaces = createSurfaces(createSharedUniforms(), PIXEL_PALETTE,
    { exposure: { value: 1 }, lutWeights: { value: null } as never, band: { paletteFull: { value: 1 } } });
  const emitter = (y: number, head?: boolean): GroundEmitter => ({ position: new THREE.Vector3(0, y, 0), groundY: 0,
    color: new THREE.Color(1, .7, .4), intensity: 5, width: 1.2, head, maxCells: head === false ? 16 : 0 });
  surfaces.setGroundEmitters([emitter(6.6), emitter(2.4, false), emitter(6.6, true), emitter(2.5, false)], 4);
  // The linework's lamp heads (cores, halos, lamp-lit foliage) and the lamps' night level see only the lamps.
  assert.equal(surfaces.lampHeads.count, 2);
  for (let i = 0; i < 2; i++) assert.equal(surfaces.lampHeads.positions[i]!.y, 6.6);
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
