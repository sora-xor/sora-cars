import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CAR_COLOURS, CAR_DEFAULTS, carOptionsFromQuery, createCarFeatures, liveryRampFor } from '../src/game/three/pixel-art/cars';
import { CLUB_ITEMS } from '../src/game/catalog';
import { LIVERIES } from '../src/game/rules';
import { nearestPaletteIndex } from '../src/game/three/pixel-art/linework';
import { hueDistance, oklabFromHex, oklch, PIXEL_PALETTE } from '../src/game/three/pixel-art/palette';
import { createMovers, MAX_MOVERS } from '../src/game/three/pixel-art/surfaces';

const lchOf = (index: number) => oklch(Array.from(PIXEL_PALETTE.oklab.subarray(index * 4, index * 4 + 3)));

test('?pixelCars selects the car stages for A/B captures', () => {
  assert.deepEqual(carOptionsFromQuery(''), {});
  assert.deepEqual(carOptionsFromQuery('?pixelCars=off'), { carMask: 0, carBand: 0, carPaint: 0, carLines: 0 });
  assert.deepEqual(carOptionsFromQuery('?picture=pixel&pixelCars=mask, lines'), { carMask: 1, carBand: 0, carPaint: 0, carLines: 1 });
});

test('car defaults follow the measured car rules', () => {
  for (const [key, value] of Object.entries(CAR_DEFAULTS)) assert.ok(Number.isFinite(value), key);
  const d = CAR_DEFAULTS;
  // Streaks only at the band field's extremes (sparse), glints need a clear rise.
  assert.ok(d.carStreakStart >= 0.3 && d.carStreakFull > d.carStreakStart && d.carStreakFull <= 0.5);
  assert.ok(d.carGlintRise >= 0.08 && d.carLobeKeep > 0 && d.carLobeKeep < 1 && d.carLobeKnee > 0.6);
  // Interior lines at material steps, not at band steps (about 0.05-0.07 L apart).
  assert.ok(d.carEdgeStart > 0.07 && d.carEdgeFull > d.carEdgeStart);
  // Dark glass: a navy floor, never lighter than the paint around it.
  assert.ok(d.carGlassFloor > 0.05 && d.carGlassFloor + d.carGlassKeep * d.carGlassMax < 0.35);
  assert.ok(d.carHazeEnd > d.carHazeStart && d.carRimKeep > 0.5 && d.carRimKeep <= 1);
  // Distant cars (refine round 1): livery ramp and outline from about 30 m, at
  // least a palette step off the road, with no sub-cell sparkle.
  assert.ok(d.carFarStart >= 20 && d.carFarFull > d.carFarStart && d.carFarContrast >= 0.07);
  assert.ok(d.carMarksFar <= d.carFarStart && d.carHueLock > 0 && d.carHueLock <= 45);
});

test('every livery and club skin has its own palette ramp for distant cars', () => {
  const ramps = PIXEL_PALETTE.ramps.filter(ramp => ramp.kind === 'livery');
  for (const livery of LIVERIES) {
    assert.equal(liveryRampFor(PIXEL_PALETTE, livery.color), ramps.find(ramp => ramp.name === `livery/${livery.name}`)!.indices, livery.name);
  }
  for (const item of CLUB_ITEMS.filter(item => item.kind === 'skin')) {
    assert.equal(liveryRampFor(PIXEL_PALETTE, item.color.toUpperCase()), ramps.find(ramp => ramp.name === `livery/${item.sku}`)!.indices, item.sku);
  }
  // An unknown colour takes the ramp nearest in hue: a teal paint lands on a teal ramp.
  const teal = liveryRampFor(PIXEL_PALETTE, '#3fb8a8')!;
  const mid = lchOf(teal[3]!);
  assert.ok(hueDistance(mid[2], 185) < 30, `${mid}`);
  assert.equal(liveryRampFor(PIXEL_PALETTE, 'not a colour'), null);
  // The distant cars' taillights are the cutscene lamp red.
  const red = lchOf(nearestPaletteIndex(PIXEL_PALETTE, CAR_COLOURS.lampRed));
  assert.ok(red[1] > 0.15 && hueDistance(red[2], 28) < 10);
});

test('the crimson ramp and car glints land on red, peach and cream palette entries', () => {
  // Lit red paint must reach crimson entries, never coral or salmon (C < 0.13 at L > 0.65).
  for (const hex of ['#99221f', '#ae2e2b', '#c23935', '#d1423f']) {
    const [L, C, h] = lchOf(nearestPaletteIndex(PIXEL_PALETTE, hex));
    const [targetL] = oklabFromHex(hex);
    assert.ok(C > 0.15 && hueDistance(h, 27) < 6 && Math.abs(L - targetL) < 0.035, `${hex}: ${L} ${C} ${h}`);
  }
  const highlight = lchOf(nearestPaletteIndex(PIXEL_PALETTE, CAR_COLOURS.glintPeach));
  assert.ok(highlight[0] > 0.7 && highlight[1] > 0.12 && hueDistance(highlight[2], 55) < 12, `${highlight}`);
  const cream = lchOf(nearestPaletteIndex(PIXEL_PALETTE, CAR_COLOURS.glintCream));
  assert.ok(cream[0] > 0.9 && hueDistance(cream[2], 95) < 25, `${cream}`);
});

test('the plate steps are palette entries: warm, nearly neutral greys from dark to pale', () => {
  const steps = CAR_COLOURS.plateRamp.map(hex => {
    const index = nearestPaletteIndex(PIXEL_PALETTE, hex);
    assert.equal(PIXEL_PALETTE.hex[index]!.toLowerCase(), hex, `${hex} is a palette entry`);
    return lchOf(index);
  });
  for (let i = 0; i < steps.length; i++) {
    assert.ok(steps[i]![1] < 0.06, `${CAR_COLOURS.plateRamp[i]} chroma ${steps[i]![1]}`);
    if (i > 0) assert.ok(steps[i]![0] > steps[i - 1]![0] + 0.04, 'ordered dark to light');
  }
  assert.ok(steps.at(-1)![0] > 0.75 && steps[0]![0] < 0.55);
});

test('lamp, plate and cabin boxes come from the model in the car frame', () => {
  const movers = createMovers();
  const named = (name: string, size: [number, number, number], at: [number, number, number]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ name }));
    mesh.position.set(...at);
    return mesh;
  };
  const car = new THREE.Group();
  car.add(named('Primary', [1.6, 1.2, 4.1], [0, 0.7, 0]), named('LicensePlate', [0.29, 0.14, 0.03], [0, 0.65, -1.98]),
    named('TailightFrame', [1.46, 0.14, 0.13], [0, 0.68, -1.95]), named('Windows', [1.48, 0.7, 2.5], [0, 0.87, -0.5]));
  const plain = new THREE.Group();
  plain.add(named('Primary', [1.6, 1.2, 4.1], [0, 0.7, 0]));
  const scene = new THREE.Scene();
  scene.add(car, plain);
  car.position.set(12, 0, -40); car.rotation.y = 0.7;
  scene.updateMatrixWorld(true);
  movers.set([car, plain]);
  movers.update();
  const features = createCarFeatures(movers);
  features.update();
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-4;
  // Slot 0: boxes in the car's own frame, whatever its world pose.
  assert.ok(features.plateMin[0]!.w === 1 && near(features.plateMin[0]!.x, -0.145) && near(features.plateMax[0]!.y, 0.72));
  assert.ok(features.tailMin[0]!.w === 1 && near(features.tailMin[0]!.z, -2.015) && near(features.tailMax[0]!.x, 0.73));
  assert.ok(features.cabinMin[0]!.w === 1 && near(features.cabinMax[0]!.y, 1.22));
  // Slot 1 has no named meshes; empty slots have none either.
  assert.equal(features.plateMin[1]!.w, 0);
  assert.equal(features.tailMin[1]!.w, 0);
  for (let i = 2; i < MAX_MOVERS; i++) assert.equal(features.cabinMin[i]!.w, 0);
  // A hidden car drops its features.
  car.visible = false;
  movers.update(); features.update();
  assert.equal(features.plateMin[0]!.w, 0);
});

test('refine round 2: lit car edges are continuous warm lines, only where lit', () => {
  const d = CAR_DEFAULTS;
  // Continuous rims and panel-edge lines (beads read as LED strips or rivets).
  assert.equal(d.carRimKeep, 1);
  assert.equal(d.carEdgeBeadKeep, 1);
  // A panel edge needs clearly lit paint to take its bright line.
  assert.ok(d.carEdgeLit >= 0.4 && d.carEdgeLit <= 0.7 && d.carEdgeLit > d.carRimMinFill);
});

test('refine round 3: held plates, flat lamp tones and steady interior lines', () => {
  const d = CAR_DEFAULTS;
  assert.ok(d.carPlateHold === 1 && d.carPlateStepHold > 0 && d.carPlateStepHold < 0.06);
  assert.ok(d.carLampFlat === 1 && d.carEdgeSteady === 1);
  // Lamp tones are exact palette entries, shade < lit < lamp on, in their lens family's hue.
  for (const [family, tones] of Object.entries(CAR_COLOURS.lampTones)) {
    const lch = tones.map(hex => {
      const index = nearestPaletteIndex(PIXEL_PALETTE, hex);
      assert.equal(PIXEL_PALETTE.hex[index], hex, `${family} ${hex} is an entry`);
      return lchOf(index);
    });
    assert.ok(lch[0]![0] < lch[1]![0] && lch[1]![0] < lch[2]![0], `${family} ordered`);
    if (family === 'red') assert.ok(lch.every(([, C, h]) => C > 0.14 && hueDistance(h, 27) < 12), `${lch}`);
    if (family === 'amber') assert.ok(lch.every(([, C, h]) => C > 0.1 && hueDistance(h, 65) < 25), `${lch}`);
    if (family === 'pale') assert.ok(lch.every(([, C]) => C < 0.06), `${lch}`);
  }
  // The red lens's lit tone is the cutscene lamp red of the distant taillights.
  assert.equal(CAR_COLOURS.lampTones.red[1], CAR_COLOURS.lampRed);
});
