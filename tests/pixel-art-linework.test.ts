import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLampHeadSlots, FOLIAGE_GLINTS, FOLIAGE_TONE_COLOURS, FOLIAGE_TONES, GLOW_REACH, LAMP_HEAD_CORE, LAMP_HEAD_SLOTS, LAMP_RING_COLOURS,
  LAMP_TIER_HALO, LINEWORK_COLOURS, LINEWORK_DEFAULTS, lineworkOptionsFromQuery, MAX_LAMP_HEADS, nearestPaletteIndex,
} from '../src/game/three/pixel-art/linework';
import { hueDistance, oklabFromHex, oklch, PIXEL_PALETTE } from '../src/game/three/pixel-art/palette';

const lchOf = (index: number) => oklch(Array.from(PIXEL_PALETTE.oklab.subarray(index * 4, index * 4 + 3)));

test('?pixelLinework selects linework stages for A/B captures', () => {
  assert.deepEqual(lineworkOptionsFromQuery(''), {});
  assert.deepEqual(lineworkOptionsFromQuery('?picture=pixel'), {});
  assert.deepEqual(lineworkOptionsFromQuery('?pixelLinework=off'), { lines: 0, glints: 0, glow: 0, cleanup: 0, foliage: 0 });
  assert.deepEqual(lineworkOptionsFromQuery('?picture=pixel&pixelLinework=lines, glow'),
    { lines: 1, glints: 0, glow: 1, cleanup: 0, foliage: 0 });
});

test('every palette entry is its own nearest entry', () => {
  PIXEL_PALETTE.hex.forEach((hex, i) => assert.equal(nearestPaletteIndex(PIXEL_PALETTE, hex), i, hex));
});

test('glints and lamp cores snap to cream/amber palette entries, never white or grey', () => {
  for (const name of ['glintCream', 'glintGold', 'glintAmber', 'glintPeach', 'lampCore', 'lampRim', 'lampSmall'] as const) {
    const [L, C, h] = lchOf(nearestPaletteIndex(PIXEL_PALETTE, LINEWORK_COLOURS[name]));
    assert.ok(L > 0.78 && L < 0.99, `${name} L ${L}`);
    assert.ok(C > 0.03 && hueDistance(h, 80) < 40, `${name} C ${C} h ${h}`);
  }
  // The brightest glint is the lightest cream; the lamp rim is a saturated amber.
  const cream = lchOf(nearestPaletteIndex(PIXEL_PALETTE, LINEWORK_COLOURS.glintCream));
  const rim = lchOf(nearestPaletteIndex(PIXEL_PALETTE, LINEWORK_COLOURS.lampRim));
  assert.ok(cream[0] > 0.95 && rim[1] > 0.1);
});

test('linework defaults are in range', () => {
  for (const [key, value] of Object.entries(LINEWORK_DEFAULTS)) assert.ok(Number.isFinite(value), key);
  const d = LINEWORK_DEFAULTS;
  assert.ok(d.lineGapStart < d.lineGapFull && d.lineFadeStart < d.lineFadeEnd);
  // Lines fade out by 90-140 m and never reach far terrain or the skyline.
  assert.ok(d.lineFadeStart >= 90 && d.lineFadeEnd <= 140);
  assert.ok(d.glowMaxRadius <= GLOW_REACH && d.glowRadius >= 2);
  for (const key of ['rimBeadKeep', 'creaseBeadKeep', 'glowSpeckle', 'cleanupKeep'] as const) {
    assert.ok(d[key] >= 0 && d[key] <= 1, key);
  }
});

test('refine round 1: analytic lamp heads, warm halo rings, no beaded world rims, foliage glints', () => {
  const d = LINEWORK_DEFAULTS;
  // Lamp heads: a flat cream core (harbor-wide) on every street lamp, halos of a few cells.
  const core = lchOf(nearestPaletteIndex(PIXEL_PALETTE, LAMP_HEAD_CORE));
  assert.ok(core[0] > 0.95 && core[1] < 0.06, `${core}`);
  assert.ok(d.lampHeads === 1 && d.lampHeadSize > 0.1 && d.lampHeadSize < 1 && MAX_LAMP_HEADS >= 16);
  assert.ok(d.lampHeadHalo + d.lampHeadHaloNear <= d.glowMaxRadius);
  // Halo speckle halved (0.3 -> 0.15): rings read as rings, not a fuzzball.
  assert.ok(d.glowSpeckle <= 0.2);
  // World rims off: stair-stepped rails read as strings of blinking lights.
  assert.equal(d.rimBeadKeep, 0);
  // Leaf glints are the cutscenes' amber and gold, on about a third of lit canopy edges.
  for (const hex of Object.values(FOLIAGE_GLINTS)) {
    const [L, C, h] = lchOf(nearestPaletteIndex(PIXEL_PALETTE, hex));
    assert.ok(L > 0.75 && C > 0.1 && hueDistance(h, 75) < 25, hex);
  }
  assert.ok(d.foliageFill >= 5 && d.foliageFill <= 8 && d.foliageGlint > 0 && d.foliageGlint < 0.5);
  assert.ok(d.glintCarFadeEnd < d.glintFadeEnd);
});

test('refine round 2: lamp heads are flat and wide, halos squashed, lamp heads held on slots with hysteresis', () => {
  const d = LINEWORK_DEFAULTS;
  // A near head is 5-7 cells wide (half-width capped at 3 cells), its halo wider than tall.
  assert.ok(d.lampHeadSize >= 0.3 && d.lampHeadSize <= 0.7 && d.lampHeadSquash > 1 && d.lampHeadSquash <= 2);
  assert.ok(LAMP_HEAD_SLOTS >= 2 * MAX_LAMP_HEADS);
  const slots = createLampHeadSlots(LAMP_HEAD_SLOTS);
  const state = (i: number) => [slots.fresh[i], slots.cellX[i], slots.cellY[i], slots.half[i], slots.halo[i]];
  slots.beginFrame();
  const a = slots.hold(10, 6.6, -40, 100.4, 200.2, 2.2, 4.1);
  assert.ok(a >= 0);
  assert.deepEqual(state(a), [1, 100, 200, 2, 4]);
  // Next frame, the same lamp keeps its slot; sub-cell drift and small size changes hold.
  slots.beginFrame();
  assert.equal(slots.hold(10, 6.6, -40, 101.6, 200.9, 2.3, 4.6), a);
  assert.deepEqual(state(a), [0, 100, 200, 2, 4]);
  // A move past 0.75 cell outside the held cell, or a clear size change, updates it.
  slots.beginFrame();
  assert.equal(slots.hold(10, 6.6, -40, 101.8, 199.1, 2.5, 5.0), a);
  assert.deepEqual(state(a), [0, 101, 199, 2.5, 5]);
  // Another lamp takes a free slot; a lamp missing for a frame starts afresh.
  slots.beginFrame();
  const b = slots.hold(30, 6.6, -80, 300, 210, 1, 3);
  assert.ok(b >= 0 && b !== a);
  assert.equal(state(b)[0], 1);
  slots.beginFrame();
  slots.beginFrame();
  const c = slots.hold(10, 6.6, -40, 110, 205, 2.5, 5);
  assert.ok(c >= 0);
  assert.equal(state(c)[0], 1);
});

test('refine round 2: leaf glints cluster on lit canopy edges, lone bright leaves calm into the mass', () => {
  const d = LINEWORK_DEFAULTS;
  assert.ok(d.foliageGlint > 0 && d.foliageGlint < 0.5 && d.foliageCalm > 0 && d.foliageCalm < 0.3);
});

test('refine round 3: distant lamp heads collapse to dots on tiers with hysteresis', () => {
  const d = LINEWORK_DEFAULTS;
  assert.ok(d.lampHeadMid >= 30 && d.lampHeadMid <= 50 && d.lampHeadFar >= 70 && d.lampHeadFar <= 100 && d.lampHeadTierBand > 0);
  // Collapsed rings are one cell: no chain of orbs.
  assert.ok(LAMP_TIER_HALO[1] <= 2 && LAMP_TIER_HALO[2] <= 1.5);
  // The far ring is the style spec's tan (#ae8773), the mid rings amber-tan then dim brown.
  const far = lchOf(nearestPaletteIndex(PIXEL_PALETTE, LAMP_RING_COLOURS.farRing));
  assert.ok(far[0] > 0.6 && far[0] < 0.7 && hueDistance(far[2], 48) < 15, `${far}`);
  const slots = createLampHeadSlots(LAMP_HEAD_SLOTS);
  // One lamp (a fixed world position) seen from a camera at a changing distance.
  const hold = (depth: number) => { slots.beginFrame(); return slots.hold(5, 6.6, -60, 200, 150, 1, 3, depth, d.lampHeadMid, d.lampHeadFar, d.lampHeadTierBand); };
  const tiers: number[] = [];
  // A lamp approaching from 100 m: far dot, then 2 x 1 head, then the near shape; each step once.
  for (let depth = 100; depth >= 20; depth -= 0.5) tiers.push(slots.tier[hold(depth)]!);
  const steps = tiers.filter((t, i) => i > 0 && t !== tiers[i - 1]).length;
  assert.equal(tiers[0], 2);
  assert.equal(tiers.at(-1), 0);
  assert.equal(steps, 2);
  // Hovering at a boundary never steps back and forth.
  const around: number[] = [];
  for (let k = 0; k < 20; k++) around.push(slots.tier[hold(d.lampHeadMid + (k % 2 ? 1 : -1))]!);
  assert.equal(new Set(around).size, 1);
  // Receding past the far boundary: the mid tier (a 2 x 1 head) holds within the band, then collapses.
  const farAt = d.lampHeadFar, band = d.lampHeadTierBand / 2;
  assert.equal(slots.tier[hold(farAt - 10)], 1);
  assert.equal(slots.half[hold(farAt + band - 0.5)], 1);
  assert.equal(slots.tier[hold(farAt + band - 0.5)], 1);
  assert.equal(slots.tier[hold(farAt + band + 0.5)], 2);
  assert.equal(slots.tier[hold(farAt - band + 0.5)], 2);
  assert.equal(slots.tier[hold(farAt - band - 0.5)], 1);
});

test('refine round 3: night clump tones are palette steps one band apart, dark to light', () => {
  for (const [name, steps] of Object.entries(FOLIAGE_TONES)) {
    const L = steps.map(hex => lchOf(nearestPaletteIndex(PIXEL_PALETTE, hex))[0]);
    steps.forEach(hex => assert.equal(PIXEL_PALETTE.hex[nearestPaletteIndex(PIXEL_PALETTE, hex)], hex, `${name} ${hex} is an entry`));
    for (let i = 1; i < L.length; i++) assert.ok(L[i]! >= L[i - 1]!, `${name} ordered`);
    // Night masses: never near-black only, never brighter than a lit leaf.
    assert.ok(L[1]! > 0.15 && L[4]! < 0.65, `${name} ${L}`);
  }
  // Teal-navy darks (the spec's #1d2239 / #292e4d masses), teal lights, olive lamp-lit crowns.
  const navy = FOLIAGE_TONES.navy.map(hex => lchOf(nearestPaletteIndex(PIXEL_PALETTE, hex)));
  assert.ok(navy.slice(1).every(([, C, h]) => C < 0.07 && hueDistance(h, 280) < 25));
  const teal = lchOf(nearestPaletteIndex(PIXEL_PALETTE, FOLIAGE_TONES.teal[3]));
  assert.ok(hueDistance(teal[2], 170) < 25);
  const olive = lchOf(nearestPaletteIndex(PIXEL_PALETTE, FOLIAGE_TONES.olive[2]));
  assert.ok(hueDistance(olive[2], 100) < 25);
  const d = LINEWORK_DEFAULTS;
  assert.ok(d.foliageTones === 1 && d.foliageToneMax > 0.2 && d.foliageToneMax < 0.4 && d.foliageToneFar >= 30 && d.lineSkipCanopy === 1);
});

test('refine round 4: full-colour clump tones keep the palette steps, dark green and olive-gold', () => {
  for (const name of ['navy', 'teal', 'olive'] as const) {
    const L = FOLIAGE_TONE_COLOURS[name].map(hex => oklabFromHex(hex)[0]);
    for (let i = 1; i < L.length; i++) assert.ok(L[i]! > L[i - 1]!, `${name} ordered`);
    // Step for step about the palette tone's lightness, so the clump choice and the sky cap behave as before.
    FOLIAGE_TONES[name].forEach((hex, i) => assert.ok(Math.abs(L[i]! - oklabFromHex(hex)[0]) < .05, `${name} step ${i}`));
  }
  // Unlit crowns are dark green or teal-green (the concept's), never navy; lamp-lit crowns are olive-gold.
  for (const hex of [...FOLIAGE_TONE_COLOURS.navy.slice(1), ...FOLIAGE_TONE_COLOURS.teal.slice(1)])
    assert.ok(hueDistance(oklch(oklabFromHex(hex))[2], 160) < 30, hex);
  for (const hex of FOLIAGE_TONE_COLOURS.olive.slice(2)) assert.ok(hueDistance(oklch(oklabFromHex(hex))[2], 100) < 20, hex);
});

test('refine round 3: stable emitters, confirmed glints, no bead strings on lit bars, connected wires', () => {
  const d = LINEWORK_DEFAULTS;
  // Car cells never seed a lamp halo; a warm key lifts the emitter bar; halos ramp by distance.
  assert.ok(d.glowStable === 1 && d.glowKeyLift > 0 && d.glowKeySpecular > 0 && d.glowRampCells >= 3);
  // Glints need two frames; a lit bar or ridge takes none.
  assert.ok(d.glintConfirm === 1 && d.glintRidgeCells >= 2 && d.glintRidgeKeep > 0 && d.glintRidgeKeep < 1);
  // Rail rims stay off (the user's rule: a solid lit bar is cooler than a bead string).
  assert.equal(d.rimBeadKeep, 0);
  assert.ok(d.wireConnect === 1 && d.wireCover >= 0.1 && d.wireCover <= 0.3 && d.inkRunCells >= 1);
});
