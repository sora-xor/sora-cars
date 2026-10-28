import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { CLUB_ITEMS } from '../src/game/catalog';
import { LIVERIES } from '../src/game/rules';
import { CAR_COLOURS } from '../src/game/three/pixel-art/cars';
import { FOLIAGE_GLINTS, LAMP_HEAD_CORE, LINEWORK_COLOURS } from '../src/game/three/pixel-art/linework';
import generated from '../src/game/three/pixel-art/palette.generated.json';
import { hueDistance, oklabFromHex, oklch, PIXEL_PALETTE } from '../src/game/three/pixel-art/palette';
import { OIL_COLOURS, SPARKLE_COLOURS } from '../src/game/three/pixel-art/surfaces';

const SHADOW_HUE = 295; // cutscene shadows sit around h285-305 (indigo/violet)
const HIGHLIGHT_HUE = 75; // highlights around h60-95 (amber/cream)
const TEAL_CAR_HUE = 177; // the cutscene teal car (sunrise-wide v2/v3), C 0.04-0.05
const lchOf = (index: number) => oklch(Array.from(PIXEL_PALETTE.oklab.subarray(index * 4, index * 4 + 3)));
const nearestDistance = (hex: string) => {
  const [L, a, b] = oklabFromHex(hex);
  let best = Infinity;
  for (let i = 0; i < PIXEL_PALETTE.size; i++) {
    best = Math.min(best, Math.hypot(PIXEL_PALETTE.oklab[i * 4]! - L, PIXEL_PALETTE.oklab[i * 4 + 1]! - a, PIXEL_PALETTE.oklab[i * 4 + 2]! - b));
  }
  return best;
};
const isTeal = (hue: number) => hue >= 160 && hue <= 215;
const liveries = [
  ...LIVERIES.map(livery => ({ name: livery.name, hex: livery.color.toLowerCase() })),
  ...CLUB_ITEMS.filter(item => item.kind === 'skin').map(item => ({ name: item.sku, hex: item.color.toLowerCase() })),
];

test('the palette is a limited 96-128 colour set of unique sRGB entries', () => {
  assert.ok(PIXEL_PALETTE.size >= 96 && PIXEL_PALETTE.size <= 128, `size ${PIXEL_PALETTE.size}`);
  assert.equal(new Set(PIXEL_PALETTE.hex).size, PIXEL_PALETTE.size);
  generated.colors.forEach((color, i) => {
    const hex = '#' + color.rgb.map(v => v.toString(16).padStart(2, '0')).join('');
    assert.equal(color.hex, hex);
    const lab = oklabFromHex(hex);
    lab.forEach((v, k) => assert.ok(Math.abs(v - PIXEL_PALETTE.oklab[i * 4 + k]!) < 1e-5));
  });
  // Shadows are indigo/plum, not neutral grey: most dark entries carry chroma.
  const darks = PIXEL_PALETTE.hex.map((_, i) => lchOf(i)).filter(([L]) => L > 0.12 && L < 0.35);
  assert.ok(darks.filter(([, C]) => C >= 0.02).length / darks.length > 0.8);
  // Highlights are cream/amber, not white.
  const lightest = PIXEL_PALETTE.hex.map((_, i) => lchOf(i)).sort((a, b) => b[0] - a[0])[0]!;
  assert.ok(lightest[0] < 0.99 && hueDistance(lightest[2], 90) < 30, `lightest ${lightest}`);
});

test('provenance names every cutscene input with its current SHA-256', () => {
  const pngs = ['angles', 'beats'].flatMap(dir => readdirSync(`public/assets/story/${dir}`)
    .filter(file => file.endsWith('.png')).map(file => `public/assets/story/${dir}/${file}`)).sort();
  assert.deepEqual(generated.inputs.map(input => input.file).sort(), pngs);
  for (const input of generated.inputs) {
    const digest = createHash('sha256').update(readFileSync(input.file)).digest('hex');
    assert.equal(digest, input.sha256, `${input.file} changed; rerun node scripts/build-pixel-palette.mjs`);
  }
  assert.equal(generated.generator, 'scripts/build-pixel-palette.mjs');
  assert.ok(generated.method.length >= 4 && generated.parameters.paletteSize === 128);
  assert.ok(generated.quantizationErrorOKLab.mean < 0.03);
  // The renderer colours it holds were read from these sources.
  assert.deepEqual([...new Set(generated.rendererEntrySources.map(source => source.file))].sort(),
    ['src/game/three/pixel-art/cars.ts', 'src/game/three/pixel-art/linework.ts', 'src/game/three/pixel-art/surfaces.ts']);
});

test('the renderer\'s fixed colours are entries and its measured colours have a close entry', () => {
  // Drawn as palette entries by the car, oil and lamp-head stages.
  const exact = [...CAR_COLOURS.plateRamp, CAR_COLOURS.lampRed, LAMP_HEAD_CORE,
    ...Object.values(OIL_COLOURS.night), ...Object.values(OIL_COLOURS.dawn)];
  for (const hex of exact) assert.ok(PIXEL_PALETTE.hex.includes(hex), `${hex} is a palette entry`);
  // The oil gloss keeps two distinct tones per mood.
  for (const set of [OIL_COLOURS.night, OIL_COLOURS.dawn]) assert.notEqual(set.core, set.ring);
  // Measured glint, lamp and sparkle colours (snapped at load) and the style
  // spec's named cutscene colours stay within 0.015 of an entry (x1.15 on a/b
  // in the build), so a rebuild cannot drift the lamp ambers or car reds.
  const measured = [CAR_COLOURS.glintCream, CAR_COLOURS.glintGold, CAR_COLOURS.glintPeach, ...Object.values(LINEWORK_COLOURS),
    ...Object.values(FOLIAGE_GLINTS), ...Object.values(SPARKLE_COLOURS)].filter(hex => oklch(oklabFromHex(hex))[1] >= 0.03);
  const spec = Object.values(generated.measured.specAnchors).flat();
  for (const hex of [...measured, ...spec]) assert.ok(nearestDistance(hex) <= 0.018, `${hex} is ${nearestDistance(hex).toFixed(4)} from the palette`);
});

test('every ramp is ordered dark to light', () => {
  assert.ok(PIXEL_PALETTE.ramps.length > 10);
  for (const ramp of PIXEL_PALETTE.ramps) {
    assert.ok(ramp.indices.length >= 1, ramp.name);
    for (let i = 1; i < ramp.indices.length; i++) {
      assert.ok(lchOf(ramp.indices[i]!)[0] >= lchOf(ramp.indices[i - 1]!)[0], `${ramp.name} step ${i}`);
    }
  }
  // Each colour belongs to exactly one family ramp; its neighbours are in it.
  const owners = new Array(PIXEL_PALETTE.size).fill(0);
  for (const ramp of PIXEL_PALETTE.ramps) if (ramp.kind === 'family') for (const i of ramp.indices) owners[i]++;
  assert.ok(owners.every(count => count === 1));
  for (let i = 0; i < PIXEL_PALETTE.size; i++) {
    const [darker, lighter] = PIXEL_PALETTE.rampNeighbours.subarray(i * 4, i * 4 + 2);
    assert.ok(lchOf(darker!)[0] <= lchOf(i)[0] && lchOf(lighter!)[0] >= lchOf(i)[0]);
  }
});

test('every race livery and club skin has a recognisable hue-shifted ramp', () => {
  assert.equal(liveries.length, 12);
  for (const livery of liveries) {
    const ramp = PIXEL_PALETTE.ramps.find(r => r.kind === 'livery'
      && (generated.ramps.find(g => g.name === r.name) as { livery?: { hex: string } }).livery?.hex === livery.hex);
    assert.ok(ramp, `${livery.name} ${livery.hex} has no ramp`);
    assert.ok(ramp.indices.length >= 5, `${livery.name} ramp has ${ramp.indices.length} steps`);
    const steps = ramp.indices.map(lchOf);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i]![0] > steps[i - 1]![0], `${livery.name} is dark to light`);
    const [L0, C0, h0] = oklch(oklabFromHex(livery.hex));
    assert.ok(steps[0]![0] < 0.35 && steps.at(-1)![0] > Math.min(0.75, L0 + 0.2), `${livery.name} spans shadow to highlight`);
    if (C0 < 0.045) {
      // White paint: lavender in shade, beige-peach under lamps, cream on top.
      assert.ok(hueDistance(steps[0]![2], SHADOW_HUE) < 30, `${livery.name} shadow ${steps[0]}`);
      assert.ok(steps.some(([L, C, h]) => L > 0.55 && L < 0.8 && C > 0.03 && h > 35 && h < 95), `${livery.name} lit beige`);
      continue;
    }
    // Two dark steps below L 0.36, neither of them navy: dark paint in shade
    // keeps its hue (readability critique: dark liveries collapsed to navy).
    const darks = steps.filter(([L]) => L < 0.36);
    assert.ok(darks.length >= 2, `${livery.name} dark steps ${JSON.stringify(steps)}`);
    if (isTeal(h0)) {
      // Teal is the cutscene teal car's low-chroma sage-teal (style spec: C
      // 0.03-0.05 in the mid band), with warm or teal darks and an amber top.
      const band = steps.filter(([L]) => L > 0.4 && L < 0.8);
      assert.ok(band.filter(([, C, h]) => C >= 0.03 && C <= 0.06 && hueDistance(h, TEAL_CAR_HUE) <= 20).length >= 2,
        `${livery.name} sage-teal band ${JSON.stringify(band)}`);
      assert.ok(band.every(([, C]) => C <= 0.065), `${livery.name} mid band is low chroma`);
      for (const [, C, h] of darks) assert.ok(C < 0.03 || hueDistance(h, 280) > 45, `${livery.name} dark step ${h} is not navy`);
      const top = steps.at(-1)!;
      assert.ok(hueDistance(top[2], HIGHLIGHT_HUE) <= 20, `${livery.name} highlight ${top}`);
      continue;
    }
    assert.ok(darks.filter(([, C, h]) => C >= 0.035 && hueDistance(h, h0) <= 25).length >= 2,
      `${livery.name} ${livery.hex} same-hue darks ${JSON.stringify(darks)}`);
    // The paint hue itself is present at mid value with real chroma.
    const body = steps.filter(([L, C, h]) => L > 0.4 && L < 0.8 && hueDistance(h, h0) <= 18 && C >= 0.5 * Math.min(C0, 0.16));
    assert.ok(body.length >= 2, `${livery.name} ${livery.hex} body steps ${JSON.stringify(steps)}`);
    // Hue shift: the dark end rotates toward indigo/violet and the light end
    // toward amber/cream (or fades toward cream), as in the cutscene ramps.
    const mid = body[0]!, dark = steps[0]!, light = steps.at(-1)!;
    assert.ok(hueDistance(dark[2], SHADOW_HUE) < hueDistance(mid[2], SHADOW_HUE) || hueDistance(dark[2], SHADOW_HUE) <= 25,
      `${livery.name} shadow hue ${dark[2].toFixed(0)} vs body ${mid[2].toFixed(0)}`);
    assert.ok(hueDistance(light[2], HIGHLIGHT_HUE) < hueDistance(mid[2], HIGHLIGHT_HUE)
      || hueDistance(light[2], HIGHLIGHT_HUE) <= 20 || light[1] < mid[1] * 0.75,
      `${livery.name} highlight hue ${light[2].toFixed(0)} vs body ${mid[2].toFixed(0)}`);
    assert.ok(dark[1] < mid[1] + 0.01, `${livery.name} shadows are not over-saturated`);
  }
});

test('the blue livery has its own family; teal is the cutscene sage-teal, not turquoise', () => {
  const entries = PIXEL_PALETTE.hex.map((_, i) => lchOf(i));
  const mid = ([L]: number[]) => L! > 0.4 && L! < 0.8;
  const blue = oklch(oklabFromHex('#578cde'))[2];
  assert.ok(entries.filter(e => mid(e) && e[1]! > 0.07 && hueDistance(e[2]!, blue) < 15).length >= 2, 'blue');
  // Teal (h160-215) in the mid band: sage-teal entries at C 0.03-0.06 and no
  // saturated turquoise (the critique measured the rival at C 0.056-0.098
  // against 0.037-0.041 in the cutscenes).
  const teal = entries.filter(e => mid(e) && isTeal(e[2]!) && e[1]! >= 0.03);
  assert.ok(teal.filter(([, C]) => C! <= 0.06).length >= 2, `teal ${JSON.stringify(teal)}`);
  assert.ok(teal.every(([, C]) => C! <= 0.065), `no turquoise ${JSON.stringify(teal)}`);
});
