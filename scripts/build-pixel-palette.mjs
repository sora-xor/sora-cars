#!/usr/bin/env node
/**
 * Builds the pixel-art race palette from the cutscene illustrations.
 *
 *   node scripts/build-pixel-palette.mjs [--out <json>] [--swatch <png>] [--compare <json>]
 *                                        [--core <k>] [--no-liveries]
 *
 * Method (ported from the 2026-09-25 style analysis, tmp/pixel-art/research/
 * palette.js, ramps.js and finalize.js):
 *  1. Sample every 2nd pixel of all angles/*.png and beats/*.png and keep only
 *     art-cell interiors (3x3 max channel difference <= 22), which excludes the
 *     resampling blends between cells.
 *  2. Build a 6-bit/channel histogram; bins with >= 3 samples become points.
 *  3. Weighted OKLab k-means (weight = count^0.5 * (1 + chroma/0.1), a/b x1.15,
 *     deterministic k-means++ seeding), each centroid snapped to the nearest
 *     observed colour of its cluster. K starts at 98 and shrinks until steps
 *     3b-4 leave minGapFill slots for step 5 (--core <k> fixes it).
 * 3b. Anchors. The colours the renderer draws as fixed palette entries (the
 *     plate greys, the oil gloss sets, the lamp-head core, the foliage clump
 *     ramps and the car lamp tones, read from cars.ts, surfaces.ts and
 *     linework.ts) are kept verbatim.
 *     Its measured glint, lamp and sparkle colours and the style spec's named
 *     cutscene colours (ink, night sky, dusk violet, plum, neon, car red,
 *     vermilion, amber, cream, sage) each need an entry within 0.015. A
 *     missing one replaces the nearest core entry within 0.03 (the centroid
 *     moves onto the measured colour), else it is added.
 *     Without this the v3/v4 sunrise art pulled the core off the car reds and
 *     lamp ambers, merged the two oil gloss tones and moved the plate greys
 *     off their ramp.
 *  4. Hue-shifted livery ramps: every in-game livery and club skin gets a
 *     six-step ramp (dark end leaning toward indigo/violet, light end toward
 *     amber/cream, as measured in the cutscene ramps), whose two darkest steps
 *     stay in the paint's own hue below L 0.36 so dark paint in shade does not
 *     collapse to navy. Teal paint follows the cutscene teal car instead: a
 *     low-chroma sage-teal band measured per lightness and an amber highlight.
 *     Ramp steps reuse an existing entry when one is close enough.
 *  5. Greedy max-distance gap fill to the target size from cutscene material
 *     ramps (7-means per region), lamp-glow rings, small accent regions and
 *     8-band sky strata of seven cutscene skies.
 *  6. Organise the result as dark-to-light ramps (hue families split into
 *     muted/vivid tiers, plus one ramp per livery) and record provenance.
 *
 * Only node and pngjs are used. The output is deterministic (no timestamps).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORY = path.join(ROOT, 'public/assets/story');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const OUT = path.resolve(ROOT, option('--out', 'src/game/three/pixel-art/palette.generated.json'));
const SWATCH = option('--swatch', null);
const COMPARE = option('--compare', null);
const WITH_LIVERIES = !args.includes('--no-liveries');

const PARAMS = {
  sampleStride: 2,
  cellInteriorMaxChannelDiff: 22,
  histogramBits: 6,
  minBinCount: 3,
  weight: 'sqrt(count) * (1 + chroma / 0.1)',
  abWeight: 1.15,
  coreClusters: Number(option('--core', WITH_LIVERIES ? 98 : 116)),
  kmeansSeed: 12345,
  kmeansIterations: 40,
  paletteSize: 128,
  // The core shrinks until anchors and livery ramps leave this many slots for the gap fill.
  minGapFill: 8,
  // Anchors: a renderer entry (verbatim), or a spec colour with no entry
  // within specCover, replaces the nearest core entry within anchorSnap, else
  // it is added.
  anchorSnap: 0.03,
  specCover: 0.015,
  rendererCoverMinChroma: 0.03,
  skyBands: 8,
  skyBandMaxSpreadL: 0.25,
  regionRampClusters: 7,
  regionRampMinShare: 0.01,
  glowRingStepPx: 3,
  accentTopFraction: 0.03,
  // Six steps (cars.ts passes CAR_RAMP_STEPS = 6 to the shaders). The two
  // darkest sit below L 0.36 for every livery, so dark paint in shade keeps
  // two same-hue entries instead of snapping to navy (readability critique,
  // 2026-09-26); the middle steps (the distant-car tone pairs) stay where
  // they were.
  liveryRampLightness: [0.19, 0.31, 0.44, 0.56, 0.69, 0.82],
  liveryShiftTaper: 'shift x min(1, step / 2): the darkest step never moves',
  liveryShadowHue: 295,
  liveryHighlightHue: 75,
  liveryMaxShadowRotationDeg: 20,
  liveryShadowRotationExponent: 1.5,
  liveryShadowChromaLoss: 0.35,
  liveryMaxHighlightRotationDeg: 22,
  liveryMaxChroma: 0.16,
  liveryChromaFloorAtDark: 0.035,
  liveryChromaPerLightness: 0.25,
  liveryReuseLightness: 0.055,
  liveryReuseHueDeg: 14,
  liveryReuseDarkHueDeg: 12,
  liveryReuseDarkLightness: 0.035,
  liveryReuseDarkBelowL: 0.36,
  liveryReuseMinChromaRatio: 0.55,
  neutralLiveryChroma: 0.045,
  // Teal paint (h160-215) follows the cutscene teal car (sunrise-wide v2/v3)
  // instead of the generic ramp: a low-chroma sage-teal mid band measured per
  // lightness, and an amber highlight (style spec: cars, shading_ramp_rules).
  tealHueRange: [160, 215],
  tealSampleMinChroma: 0.02,
  tealSampleHalfWindowL: 0.06,
  tealChromaQuantile: 0.75,
  tealHighlight: [75, 0.075],
  qualityStride: 9,
};

// --- colour ---------------------------------------------------------------
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) { const v = i / 255; LIN[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
function oklab(r, g, b) {
  r = LIN[r]; g = LIN[g]; b = LIN[b];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function linearFromOklab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const encode = v => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)); };
const fromOklab = (L, a, b) => linearFromOklab(L, a, b).map(encode);
const inGamut = (L, a, b) => linearFromOklab(L, a, b).every(v => v >= -1e-4 && v <= 1 + 1e-4);
function lch(lab) { let h = Math.atan2(lab[2], lab[1]) * 180 / Math.PI; if (h < 0) h += 360; return [lab[0], Math.hypot(lab[1], lab[2]), h]; }
const fromLch = (L, C, h) => [L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)];
const hex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const parseHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const AB = PARAMS.abWeight;
const dist2 = (p, q) => (p[0] - q[0]) ** 2 + ((p[1] - q[1]) * AB) ** 2 + ((p[2] - q[2]) * AB) ** 2;
const dist = (p, q) => Math.sqrt(dist2(p, q));
const hueDelta = (from, to) => { let d = (to - from) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; };
const hueDistance = (a, b) => Math.abs(hueDelta(a, b));
const quantile = (values, f) => { const s = values.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };

// --- measured regions ---------------------------------------------------------
// Regions measured in the style analysis: [name, file, x, y, width, height].
const MATERIAL_REGIONS = [
  ['red_sunrise_hood', 'angles/sunrise-wide-v2.png', 655, 455, 115, 40],
  ['red_harbor_night', 'angles/harbor-wide-v2.png', 624, 370, 56, 40],
  ['red_garage_distant', 'angles/garage-wide-v2.png', 910, 466, 55, 30],
  ['red_blackout_night', 'beats/garage-blackout-v2.png', 880, 362, 45, 12],
  ['red_confession_hood', 'beats/public-confession-v4.png', 850, 470, 150, 50],
  ['white_sunrise_rear', 'angles/sunrise-wide-v2.png', 42, 430, 70, 35],
  ['white_harbor_hood', 'angles/harbor-wide-v2.png', 200, 425, 110, 33],
  ['white_garage_body', 'angles/garage-wide-v2.png', 255, 488, 45, 30],
  ['white_blackout_cool', 'beats/garage-blackout-v2.png', 210, 440, 150, 47],
  ['white_umbrella_night', 'beats/radio-umbrella-v2.png', 0, 495, 250, 30],
  ['teal_sunrise_hood', 'angles/sunrise-wide-v2.png', 1220, 473, 110, 60],
  ['teal_harbor_hood', 'angles/harbor-wide-v2.png', 1400, 442, 95, 75],
  ['blue_harbor_door', 'angles/harbor-wide-v2.png', 1080, 414, 90, 56],
];
// Lamp and sun halos: [name, file, centreX, centreY, rings].
const GLOW_RINGS = [
  ['streetlamp_dusk_harbor', 'angles/harbor-wide-v2.png', 458, 48, 10],
  ['streetlamp_rain_umbrella', 'beats/radio-umbrella-v2.png', 249, 205, 10],
  ['distant_lamp_night', 'beats/garage-blackout-v2.png', 743, 245, 5],
  ['sun_disc_sunrise', 'angles/sunrise-wide-v2.png', 548, 142, 10],
];
// Small saturated accents the histogram under-weights: [name, file, x, y, w, h].
const ACCENT_REGIONS = [
  ['neon pink', 'beats/radio-umbrella-v2.png', 160, 207, 36, 120],
  ['kissaten red neon', 'beats/radio-umbrella-v2.png', 228, 300, 40, 60],
  ['rain streak lavender', 'angles/radio-wide-v2.png', 20, 160, 200, 120],
  ['garage sky violet', 'angles/garage-wide-v2.png', 760, 125, 60, 12],
  ['teal jacket', 'angles/garage-wide-v2.png', 1420, 470, 60, 40],
  ['crane red light', 'angles/harbor-wide-v2.png', 0, 20, 250, 180],
  ['amber window', 'angles/radio-wide-v2.png', 0, 150, 250, 300],
];
// The teal race car's body (teal-hued cells only), for the teal livery ramp:
// [name, file, x, y, w, h]. Measured 2026-09-26: C median 0.040, p90 0.047,
// hue 171-183 across L 0.3-0.7 (the harbour teal car, under sodium lamps,
// sits at h142-164 with the same chroma).
const TEAL_CAR_REGIONS = [
  ['teal_car_sunrise_v2', 'angles/sunrise-wide-v2.png', 1150, 440, 480, 170],
  ['teal_car_sunrise_v3', 'angles/sunrise-wide-v3.png', 1180, 440, 480, 170],
];
// Sky strata, top to horizon, in bands of equal height (the style analysis's
// skyRampsTopToHorizon): [name, file, x, y, w, h]. The race skies are authored
// from these, and their posterised bands need an entry each.
const SKY_RAMPS = [
  ['dusk_violet_garage', 'angles/garage-wide-v2.png', 650, 112, 690, 150],
  ['dusk_confession', 'beats/public-confession-v4.png', 0, 0, 330, 190],
  ['sunrise_orange', 'angles/sunrise-wide-v2.png', 600, 0, 420, 140],
  ['sunrise_orange_v3', 'angles/sunrise-wide-v3.png', 600, 0, 420, 140],
  ['community_sunset', 'angles/community-wide-v2.png', 380, 0, 240, 150],
  ['night_harbor', 'angles/harbor-wide-v2.png', 150, 0, 300, 120],
  ['night_rain_blackout', 'beats/garage-blackout-v2.png', 790, 205, 300, 50],
];
// Named cutscene colours of the style spec (palette_observations: anchors).
const SPEC_ANCHORS = {
  ink: ['#0d0a0e', '#191215'], 'night sky': ['#151239', '#1d1a4d'], 'dusk violet': ['#362e95', '#493aa6', '#5e48b6'],
  plum: ['#4e3161', '#663176'], 'rose/neon': ['#de618e', '#fc5d75'], 'car red': ['#82191a', '#95211e', '#aa2921', '#c6362a'],
  vermilion: ['#e14231'], amber: ['#f1853a', '#fab55a'], cream: ['#fdd176', '#fee59a', '#fdf5d5'], sage: ['#5d7661', '#718d6e'],
};
// Colours the renderer draws, read from its source: [file, pattern whose
// first group holds the hex list, what it is, exact]. Exact ones are fixed
// palette entries (plate greys, oil gloss, lamp-head core, foliage clump ramps, car lamp tones); the
// others are measured cutscene colours it snaps to the nearest entry (glints,
// lamp rims and cores, sparkles), held like the spec colours.
const RENDERER_ENTRY_SOURCES = [
  ['src/game/three/pixel-art/cars.ts', /plateRamp:\s*\[([^\]]*)\]/, 'CAR_COLOURS.plateRamp', true],
  ['src/game/three/pixel-art/cars.ts', /lampRed:\s*('#[0-9a-fA-F]{6}')/, 'CAR_COLOURS.lampRed', true],
  ['src/game/three/pixel-art/cars.ts', /lampTones:\s*\{([\s\S]*?)\}/, 'CAR_COLOURS.lampTones', true],
  ['src/game/three/pixel-art/surfaces.ts', /export const OIL_COLOURS = \{([\s\S]*?)\} as const;/, 'OIL_COLOURS', true],
  ['src/game/three/pixel-art/linework.ts', /export const LAMP_HEAD_CORE = ('#[0-9a-fA-F]{6}')/, 'LAMP_HEAD_CORE', true],
  ['src/game/three/pixel-art/linework.ts', /export const FOLIAGE_TONES = \{([\s\S]*?)\} as const;/, 'FOLIAGE_TONES', true],
  ['src/game/three/pixel-art/cars.ts', /export const CAR_COLOURS = \{([\s\S]*?)\} as const;/, 'CAR_COLOURS', false],
  ['src/game/three/pixel-art/linework.ts', /export const LINEWORK_COLOURS = \{([\s\S]*?)\} as const;/, 'LINEWORK_COLOURS', false],
  ['src/game/three/pixel-art/linework.ts', /export const FOLIAGE_GLINTS = \{([\s\S]*?)\} as const;/, 'FOLIAGE_GLINTS', false],
  ['src/game/three/pixel-art/surfaces.ts', /export const SPARKLE_COLOURS = \{([\s\S]*?)\} as const;/, 'SPARKLE_COLOURS', false],
];
const REGION_FILES = () => new Set([...MATERIAL_REGIONS.map(r => r[1]), ...GLOW_RINGS.map(r => r[1]), ...ACCENT_REGIONS.map(r => r[1]),
  ...TEAL_CAR_REGIONS.map(r => r[1]), ...SKY_RAMPS.map(r => r[1])]);

// --- inputs ---------------------------------------------------------------
const files = [
  ...fs.readdirSync(path.join(STORY, 'angles')).map(f => 'angles/' + f),
  ...fs.readdirSync(path.join(STORY, 'beats')).map(f => 'beats/' + f),
].filter(f => f.endsWith('.png')).sort();
if (files.length === 0) throw new Error('No cutscene PNGs found under public/assets/story.');
const imageCache = new Map();
function load(file) {
  if (!imageCache.has(file)) imageCache.set(file, PNG.sync.read(fs.readFileSync(path.join(STORY, file))));
  return imageCache.get(file);
}
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// --- 1-2. cell-interior histogram ------------------------------------------
const BITS = PARAMS.histogramBits, SHIFT = 8 - BITS, BINS = 1 << (3 * BITS);
const hist = new Float64Array(BINS), sumR = new Float64Array(BINS), sumG = new Float64Array(BINS), sumB = new Float64Array(BINS);
let sampled = 0, kept = 0;
const inputs = [];
for (const file of files) {
  const { width: W, height: H, data: d } = load(file);
  inputs.push({ file: `public/assets/story/${file}`, width: W, height: H, sha256: sha256(path.join(STORY, file)) });
  for (let y = 1; y < H - 1; y += PARAMS.sampleStride) for (let x = 1; x < W - 1; x += PARAMS.sampleStride) {
    const i = (y * W + x) * 4; sampled++;
    let spread = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = ((y + dy) * W + x + dx) * 4;
      spread = Math.max(spread, Math.abs(d[j] - d[i]), Math.abs(d[j + 1] - d[i + 1]), Math.abs(d[j + 2] - d[i + 2]));
    }
    if (spread > PARAMS.cellInteriorMaxChannelDiff) continue;
    kept++;
    const k = ((d[i] >> SHIFT) << (2 * BITS)) | ((d[i + 1] >> SHIFT) << BITS) | (d[i + 2] >> SHIFT);
    hist[k]++; sumR[k] += d[i]; sumG[k] += d[i + 1]; sumB[k] += d[i + 2];
  }
  // Decoded images are large; keep only the few reused by region sampling.
  if (!REGION_FILES().has(file)) imageCache.delete(file);
}
const points = [];
let occupied = 0;
for (let k = 0; k < BINS; k++) {
  if (hist[k] <= 0) continue;
  occupied++;
  if (hist[k] < PARAMS.minBinCount) continue;
  const rgb = [sumR[k] / hist[k], sumG[k] / hist[k], sumB[k] / hist[k]];
  const lab = oklab(...rgb.map(Math.round));
  const chroma = Math.hypot(lab[1], lab[2]);
  points.push({ rgb, lab, n: hist[k], w: Math.sqrt(hist[k]) * (1 + chroma / 0.1), cluster: 0 });
}
console.log(`inputs ${files.length}; sampled ${sampled}; cell interiors ${kept}; bins ${occupied}; points ${points.length}`);

// --- 3. weighted k-means ----------------------------------------------------
function weightedKMeans(pts, K) {
  let seed = PARAMS.kmeansSeed;
  const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const C = [pts.reduce((a, b) => (a.w > b.w ? a : b)).lab.slice()];
  const nearest = pts.map(p => dist2(p.lab, C[0]));
  while (C.length < K) {
    let total = 0;
    for (let i = 0; i < pts.length; i++) total += nearest[i] * pts[i].w;
    let r = random() * total, i = 0;
    for (; i < pts.length; i++) { r -= nearest[i] * pts[i].w; if (r <= 0) break; }
    const c = pts[Math.min(i, pts.length - 1)].lab.slice();
    C.push(c);
    for (let j = 0; j < pts.length; j++) nearest[j] = Math.min(nearest[j], dist2(pts[j].lab, c));
  }
  for (let iteration = 0; iteration < PARAMS.kmeansIterations; iteration++) {
    const acc = C.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < K; c++) { const dd = dist2(p.lab, C[c]); if (dd < bestD) { bestD = dd; best = c; } }
      p.cluster = best;
      const a = acc[best]; a[0] += p.lab[0] * p.w; a[1] += p.lab[1] * p.w; a[2] += p.lab[2] * p.w; a[3] += p.w;
    }
    let moved = 0;
    for (let c = 0; c < K; c++) {
      const a = acc[c]; if (a[3] <= 0) continue;
      const next = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
      moved += dist(next, C[c]); C[c] = next;
    }
    if (moved < 1e-4) break;
  }
  const population = new Float64Array(K);
  for (const p of pts) population[p.cluster] += p.n;
  return C.map((centroid, index) => {
    let best = null, bestD = Infinity;
    for (const p of pts) { if (p.cluster !== index) continue; const dd = dist2(p.lab, centroid); if (dd < bestD) { bestD = dd; best = p; } }
    const rgb = best ? best.rgb.map(Math.round) : fromOklab(...centroid);
    return { rgb, origin: 'kmeans', share: population[index] };
  });
}

// --- 5 (candidates). material ramps, glow rings, accents -----------------------
for (const f of REGION_FILES()) if (!files.includes(f)) throw new Error(`Region source ${f} is missing.`);

function regionRamp(file, x0, y0, w, h) {
  const { width: W, data: d } = load(file);
  const pts = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * W + x) * 4; pts.push(oklab(d[i], d[i + 1], d[i + 2])); }
  const K = PARAMS.regionRampClusters;
  const sorted = pts.slice().sort((a, b) => a[0] - b[0]);
  let C = [...Array(K)].map((_, i) => sorted[Math.floor((i + 0.5) / K * sorted.length)].slice());
  const assignment = new Int32Array(pts.length);
  const plain = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  for (let iteration = 0; iteration < 30; iteration++) {
    const acc = C.map(() => [0, 0, 0, 0]);
    pts.forEach((p, j) => {
      let best = 0, bestD = Infinity;
      C.forEach((c, i) => { const dd = plain(p, c); if (dd < bestD) { bestD = dd; best = i; } });
      assignment[j] = best; const a = acc[best]; a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3]++;
    });
    C = C.map((c, i) => (acc[i][3] ? [acc[i][0] / acc[i][3], acc[i][1] / acc[i][3], acc[i][2] / acc[i][3]] : c));
  }
  const count = new Array(K).fill(0); assignment.forEach(a => count[a]++);
  return C.map((c, i) => ({ lab: c, share: count[i] / pts.length }))
    .filter(c => c.share > PARAMS.regionRampMinShare).sort((a, b) => a.lab[0] - b.lab[0]);
}
function glowRings(file, cx, cy, rings) {
  const { width: W, height: H, data: d } = load(file);
  const step = PARAMS.glowRingStepPx, out = [];
  for (let ring = 0; ring < rings; ring++) {
    const r0 = ring * step, r1 = r0 + step, sum = [0, 0, 0]; let n = 0;
    for (let y = Math.max(0, cy - r1); y <= Math.min(H - 1, cy + r1); y++) for (let x = Math.max(0, cx - r1); x <= Math.min(W - 1, cx + r1); x++) {
      const r = Math.hypot(x - cx, y - cy); if (r < r0 || r >= r1) continue;
      const i = (y * W + x) * 4; sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; n++;
    }
    if (n) out.push(sum.map(v => Math.round(v / n)));
  }
  return out;
}
function accent(file, x0, y0, w, h) {
  const { width: W, data: d } = load(file);
  const px = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * W + x) * 4; const [L, C] = lch(oklab(d[i], d[i + 1], d[i + 2]));
    px.push({ rgb: [d[i], d[i + 1], d[i + 2]], score: C + L * 0.3 });
  }
  px.sort((a, b) => b.score - a.score);
  const top = px.slice(0, Math.max(5, Math.floor(px.length * PARAMS.accentTopFraction)));
  return [0, 1, 2].map(k => Math.round(top.reduce((s, p) => s + p.rgb[k], 0) / top.length));
}
const candidates = [];
const materialRamps = {};
for (const [name, file, x, y, w, h] of MATERIAL_REGIONS) {
  const ramp = regionRamp(file, x, y, w, h);
  materialRamps[name] = { src: file, rect: [x, y, w, h], darkToLight: ramp.map(r => hex(fromOklab(...r.lab))) };
  for (const r of ramp) candidates.push({ rgb: fromOklab(...r.lab), origin: `ramp:${name}` });
}
const glowRamps = {};
for (const [name, file, cx, cy, rings] of GLOW_RINGS) {
  const ramp = glowRings(file, cx, cy, rings);
  glowRamps[name] = { src: file, centre: [cx, cy], ringStepPx: PARAMS.glowRingStepPx, coreToBackground: ramp.map(hex) };
  for (const rgb of ramp) candidates.push({ rgb, origin: `glow:${name}` });
}
for (const [name, file, x, y, w, h] of ACCENT_REGIONS) candidates.push({ rgb: accent(file, x, y, w, h), origin: `accent:${name}` });
for (const c of candidates) c.lab = oklab(...c.rgb);

// --- 3b. anchors: renderer entries and spec colours; sky strata as candidates -------
/** Per-channel median colour of each horizontal band, top to horizon; noisy bands (L spread) are skipped. */
function skyBands(file, x0, y0, w, h) {
  const { width: W, data: d } = load(file);
  const out = [], n = PARAMS.skyBands;
  for (let band = 0; band < n; band++) {
    const r = [], g = [], b = [], L = [];
    for (let y = y0 + Math.floor(band * h / n); y < y0 + Math.floor((band + 1) * h / n); y++) for (let x = x0; x < x0 + w; x++) {
      const i = (y * W + x) * 4; r.push(d[i]); g.push(d[i + 1]); b.push(d[i + 2]); L.push(oklab(d[i], d[i + 1], d[i + 2])[0]);
    }
    const spread = quantile(L, 0.9) - quantile(L, 0.1);
    out.push({ rgb: [quantile(r, 0.5), quantile(g, 0.5), quantile(b, 0.5)], spread: +spread.toFixed(3), used: spread <= PARAMS.skyBandMaxSpreadL });
  }
  return out;
}
function readRendererEntries() {
  const entries = [], sources = [];
  for (const [file, pattern, what, exact] of RENDERER_ENTRY_SOURCES) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8'), match = text.match(pattern);
    const hexes = match ? [...match[1].matchAll(/#[0-9a-fA-F]{6}/g)].map(m => m[0].toLowerCase()) : [];
    if (!hexes.length) throw new Error(`Could not read ${what} from ${file}.`);
    for (const h of hexes) {
      // Near-neutral measured colours (the small-lamp and sparkle whites) are
      // meant to land on a warm cream entry, not on themselves.
      if (!exact && lch(oklab(...parseHex(h)))[1] < PARAMS.rendererCoverMinChroma) continue;
      if (!entries.some(e => e.hex === h)) entries.push({ hex: h, what, exact });
    }
    sources.push({ file, what, exact, colours: hexes, sha256: sha256(path.join(ROOT, file)) });
  }
  return { entries, sources };
}
// Anchors. The renderer's fixed entries are kept verbatim, and each of its
// measured colours and of the style spec's named cutscene colours needs an
// entry within specCover. A missing one replaces the nearest core entry within
// anchorSnap (the centroid moves onto the measured colour), else it is added.
// Sky strata join the gap-fill candidates.
const rendererEntries = readRendererEntries();
const anchors = rendererEntries.entries.map(({ hex: h, what, exact }) => ({ rgb: parseHex(h), lab: oklab(...parseHex(h)), origin: `renderer:${what}`, cover: exact ? 0 : PARAMS.specCover }));
for (const [name, list] of Object.entries(SPEC_ANCHORS)) for (const h of list) anchors.push({ rgb: parseHex(h), lab: oklab(...parseHex(h)), origin: `spec:${name}`, cover: PARAMS.specCover });
const skyRamps = {};
for (const [name, file, x, y, w, h] of SKY_RAMPS) {
  const bands = skyBands(file, x, y, w, h);
  skyRamps[name] = { src: file, rect: [x, y, w, h], topToHorizon: bands.map(b => hex(b.rgb)), spreadL: bands.map(b => b.spread) };
  for (const band of bands) if (band.used) candidates.push({ rgb: band.rgb, lab: oklab(...band.rgb), origin: `sky:${name}` });
}
function placeAnchors(palette) {
  const report = { present: 0, moved: 0, added: 0 };
  for (const a of anchors) {
    let nearest = -1, nearestD = Infinity, free = -1, freeD = Infinity;
    palette.forEach((p, i) => {
      const d = dist(p.lab, a.lab);
      if (d < nearestD) { nearestD = d; nearest = i; }
      if (!p.anchor && p.origin === 'kmeans' && d < freeD) { freeD = d; free = i; }
    });
    if (hex(palette[nearest].rgb) === hex(a.rgb) || nearestD <= a.cover) {
      palette[nearest] = { ...palette[nearest], anchor: true, ...(a.cover ? {} : { origin: a.origin }) };
      report.present++;
      continue;
    }
    const entry = { rgb: a.rgb, lab: a.lab, origin: a.origin, anchor: true };
    if (free >= 0 && freeD <= PARAMS.anchorSnap) { palette[free] = entry; report.moved++; } else { palette.push(entry); report.added++; }
  }
  return report;
}

// --- 4. livery ramps ------------------------------------------------------------
function readLiveries() {
  const rulesFile = path.join(ROOT, 'src/game/rules.ts'), catalogFile = path.join(ROOT, 'src/game/catalog.ts');
  const rules = fs.readFileSync(rulesFile, 'utf8'), catalog = fs.readFileSync(catalogFile, 'utf8');
  const liveries = [];
  for (const m of rules.matchAll(/\{\s*id:\s*\d+,\s*name:\s*'([^']+)'[^}]*?color:\s*'(#[0-9a-fA-F]{6})'/g)) liveries.push({ source: 'LIVERIES', name: m[1], hex: m[2].toLowerCase() });
  for (const m of catalog.matchAll(/\{\s*sku:\s*'([^']+)',\s*kind:\s*'skin'[^\n]*?color:\s*'(#[0-9a-fA-F]{6})'/g)) liveries.push({ source: 'CLUB_ITEMS', name: m[1], hex: m[2].toLowerCase() });
  if (liveries.filter(l => l.source === 'LIVERIES').length < 6) throw new Error('Could not read the six race liveries from src/game/rules.ts.');
  return { liveries, sources: [rulesFile, catalogFile].map(f => ({ file: path.relative(ROOT, f), sha256: sha256(f) })) };
}
function clampChroma(L, C, h) {
  let lo = 0, hi = C;
  if (inGamut(...fromLch(L, C, h))) return C;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(...fromLch(L, mid, h))) lo = mid; else hi = mid; }
  return lo;
}
/**
 * The cutscene teal car's chroma and hue by lightness: teal-hued cells of
 * TEAL_CAR_REGIONS, as [L, C, h] samples.
 */
function tealCarSamples() {
  const [hueLo, hueHi] = PARAMS.tealHueRange, out = [];
  for (const [, file, x0, y0, w, h] of TEAL_CAR_REGIONS) {
    const { width: W, data: d } = load(file);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const i = (y * W + x) * 4, [L, C, hue] = lch(oklab(d[i], d[i + 1], d[i + 2]));
      // Teal-hued cells only: the sunrise car's own band, not sage (h142-164,
      // the harbour car under sodium lamps) or the stripe and tyres.
      if (C >= PARAMS.tealSampleMinChroma && hue >= hueLo && hue <= hueHi) out.push([L, C, hue]);
    }
  }
  if (out.length < 1000) throw new Error('Too few teal car samples; check TEAL_CAR_REGIONS.');
  return out;
}
let tealSamples = null;
/** [C, h] of the cutscene teal car at lightness L (nearest measured band when L is outside them). */
function tealAt(L) {
  tealSamples ??= tealCarSamples();
  const window = PARAMS.tealSampleHalfWindowL;
  let near = tealSamples.filter(s => Math.abs(s[0] - L) <= window);
  if (near.length < 50) {
    const byDistance = tealSamples.slice().sort((a, b) => Math.abs(a[0] - L) - Math.abs(b[0] - L));
    near = byDistance.slice(0, 200);
  }
  return [quantile(near.map(s => s[1]), PARAMS.tealChromaQuantile), quantile(near.map(s => s[2]), 0.5)];
}
/** Target OKLCh steps for one livery, dark to light. */
function liveryTargets(livery) {
  const [L0, C0, h0] = lch(oklab(...parseHex(livery.hex)));
  if (C0 < PARAMS.neutralLiveryChroma) {
    // White paint: the cutscene ramps go lavender in shade, beige-peach under
    // lamps and cream at the top (white_blackout_cool, white_sunrise_rear).
    return [[0.30, 0.045, 300], [0.41, 0.045, 318], [0.53, 0.05, 40], [0.65, 0.062, 58], [0.78, 0.07, 64], [0.91, 0.05, 84]];
  }
  const Ls = PARAMS.liveryRampLightness, n = Ls.length;
  const shift = Math.max(-0.1, Math.min(0.06, L0 - 0.62));
  // The livery's value moves the lit steps fully, the second step by half and
  // the darkest not at all: every ramp keeps two dark same-hue entries below
  // L 0.36.
  const lightness = Ls.map((base, i) => Math.max(0.16, Math.min(0.94, base + shift * Math.min(1, i / 2))));
  const [tealLo, tealHi] = PARAMS.tealHueRange;
  if (h0 >= tealLo && h0 <= tealHi) {
    // Teal reads teal only by contrast (style spec): a low-chroma sage-teal
    // band measured on the cutscene teal car, kept at the paint's own hue
    // offset from the car's, and an amber highlight on top.
    const [, carHue] = tealAt(0.5);
    return lightness.map((L, i) => {
      if (i === n - 1) return [L, PARAMS.tealHighlight[1], PARAMS.tealHighlight[0]];
      const [C, h] = tealAt(L);
      return [L, C, (h + (h0 - carHue) * 0.5 + 360) % 360];
    });
  }
  const mid = (lightness[0] + lightness[n - 1]) / 2, half = (lightness[n - 1] - lightness[0]) / 2;
  const chroma = Math.min(C0, PARAMS.liveryMaxChroma);
  return lightness.map(L => {
    const t = (L - mid) / half;
    let h = h0, C = chroma;
    if (t < 0) {
      // Shade leans toward indigo/violet, but only by 20 degrees: a dark red,
      // yellow or purple stays its own hue instead of turning navy.
      const toward = hueDelta(h0, PARAMS.liveryShadowHue);
      h = h0 + Math.sign(toward) * Math.min(Math.abs(toward), PARAMS.liveryMaxShadowRotationDeg * (-t) ** PARAMS.liveryShadowRotationExponent);
      C = chroma * (1 - PARAMS.liveryShadowChromaLoss * -t);
    } else {
      const toward = hueDelta(h0, PARAMS.liveryHighlightHue);
      h = h0 + Math.sign(toward) * Math.min(Math.abs(toward), PARAMS.liveryMaxHighlightRotationDeg * t ** 1.5);
      C = chroma * (1 - 0.4 * t * t);
    }
    // Cutscene chroma rises with value: saturated paint in shade is C 0.056-
    // 0.094 at L 0.22-0.29 (#3a0a11, #4d0d12, #2c1024), mean chroma across
    // all materials 0.02 below L 0.2 and ~0.10 at L 0.6.
    C = Math.min(C, PARAMS.liveryChromaFloorAtDark + PARAMS.liveryChromaPerLightness * Math.max(0, L - 0.1));
    return [L, C, (h + 360) % 360];
  });
}
/** Adds a ramp per livery (reusing close entries); returns [{ livery, indices }]. */
function buildLiveryRamps(palette, liveries) {
  const liveryRamps = [];
  for (const livery of liveries) {
    const indices = [];
    const targets = liveryTargets(livery);
    for (const [step, [L, C, h]] of targets.entries()) {
      const target = fromLch(L, clampChroma(L, C, h), h);
      const [tl, tc, th] = lch(target);
      // A cutscene colour of the same hue, value and comparable chroma already
      // serves as this ramp step; only genuinely missing steps are added.
      let best = -1, bestD = Infinity;
      palette.forEach((p, i) => {
        const [pl, pc, ph] = lch(p.lab);
        // Neutral by request, not by gamut: a dark lime clipped to C 0.035 is
        // still a lime step, not a stand-in for any near-black.
        const neutral = C < 0.04;
        // Dark steps reuse only a close hue and a dark value: navy (h274-283)
        // no longer stands in for a dark purple, blue-violet or teal, and the
        // two dark steps stay below L 0.36.
        const dark = tl < PARAMS.liveryReuseDarkBelowL;
        const hueTolerance = dark ? PARAMS.liveryReuseDarkHueDeg : PARAMS.liveryReuseHueDeg;
        const lightnessTolerance = dark ? PARAMS.liveryReuseDarkLightness : PARAMS.liveryReuseLightness;
        // A nearby hue on the cool side can erase the highlight's deliberate
        // turn toward amber. Keep its warmth when reusing the top step; one
        // degree allows for the colour's rounding to sRGB bytes.
        const warmHighlight = step < targets.length - 1
          || hueDistance(ph, PARAMS.liveryHighlightHue) <= hueDistance(th, PARAMS.liveryHighlightHue) + 1;
        const qualifies = warmHighlight && Math.abs(pl - tl) <= lightnessTolerance && (dark ? pl < PARAMS.liveryReuseDarkBelowL : true) && (neutral
          ? Math.abs(tc - pc) <= 0.03 && (pc < 0.02 || tc < 0.02 || hueDistance(th, ph) <= 2 * hueTolerance)
          : hueDistance(th, ph) <= hueTolerance && pc >= tc * PARAMS.liveryReuseMinChromaRatio && pc <= tc * 1.8 + 0.02);
        const d = dist(p.lab, target);
        if (qualifies && d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0) {
        if (!indices.includes(best)) indices.push(best);
        continue;
      }
      const rgb = fromOklab(...target);
      palette.push({ rgb, lab: oklab(...rgb), origin: `livery:${livery.name}` });
      indices.push(palette.length - 1);
    }
    liveryRamps.push({ livery, indices });
  }
  return liveryRamps;
}

// --- 3-4. core, anchors and livery ramps -------------------------------------------
// The core shrinks (deterministically) until anchors and liveries leave
// minGapFill slots; --core fixes it.
const liveryInput = WITH_LIVERIES ? readLiveries() : null;
const liveryProvenance = liveryInput?.sources ?? null;
const coreClustersRequested = PARAMS.coreClusters;
let core, palette, anchorReport, liveryRamps;
for (let K = coreClustersRequested; ;) {
  core = weightedKMeans(points, K);
  const totalPopulation = core.reduce((s, c) => s + c.share, 0);
  for (const c of core) c.share /= totalPopulation;
  palette = core.map(c => ({ ...c, lab: oklab(...c.rgb) }));
  anchorReport = placeAnchors(palette);
  liveryRamps = liveryInput ? buildLiveryRamps(palette, liveryInput.liveries) : [];
  const room = PARAMS.paletteSize - PARAMS.minGapFill;
  console.log(`core K=${K}: ${palette.length} entries after anchors and liveries (room ${room})`);
  if (palette.length <= room || option('--core', null)) { PARAMS.coreClusters = K; break; }
  K -= palette.length - room;
}
console.log(`anchors: ${rendererEntries.entries.length} renderer colours, ${anchors.length - rendererEntries.entries.length} spec colours (${JSON.stringify(anchorReport)})`);
for (const { livery, indices } of liveryRamps) {
  const added = indices.filter(i => palette[i].origin === `livery:${livery.name}`).length;
  const [L0, C0, h0] = lch(oklab(...parseHex(livery.hex)));
  console.log(`  livery ${livery.name.padEnd(20)} ${livery.hex} L${L0.toFixed(2)} C${C0.toFixed(3)} h${h0.toFixed(0)}: ${indices.length} steps, ${added} new`);
}
if (palette.length > PARAMS.paletteSize) {
  throw new Error(`Palette has ${palette.length} entries before gap fill; lower --core (now ${PARAMS.coreClusters}).`);
}

// --- 5. greedy max-distance gap fill -------------------------------------------
const gapFilled = [];
while (palette.length < PARAMS.paletteSize && candidates.length) {
  let bestIndex = -1, bestD = 0;
  candidates.forEach((c, i) => {
    let nearest = Infinity;
    for (const p of palette) nearest = Math.min(nearest, dist(c.lab, p.lab));
    if (nearest > bestD) { bestD = nearest; bestIndex = i; }
  });
  if (bestIndex < 0) break;
  const [c] = candidates.splice(bestIndex, 1);
  palette.push({ rgb: c.rgb, lab: c.lab, origin: c.origin });
  gapFilled.push(`${hex(c.rgb)} ${c.origin} d=${bestD.toFixed(3)}`);
}

// Remove exact duplicates (snapped centroids can coincide with candidates).
{
  const seen = new Map();
  palette.forEach((p, i) => { const key = hex(p.rgb); if (!seen.has(key)) seen.set(key, i); });
  if (seen.size !== palette.length) throw new Error('Duplicate palette colours; adjust the livery reuse distance.');
}

// --- 6. families, ordering and ramps ---------------------------------------------
const FAMILY_ORDER = ['ink', 'neutral-grey', 'highlight-neutral', 'indigo-navy', 'violet-plum', 'rose-crimson',
  'red-vermilion', 'orange-amber', 'gold-cream', 'olive-lime', 'sage-green', 'teal-cyan', 'steel-blue'];
function family(L, C, h) {
  if (C < 0.03) return L < 0.2 ? 'ink' : L > 0.85 ? 'highlight-neutral' : 'neutral-grey';
  if (h < 20 || h >= 345) return 'rose-crimson';
  if (h < 50) return 'red-vermilion';
  if (h < 75) return 'orange-amber';
  if (h < 100) return 'gold-cream';
  if (h < 125) return 'olive-lime';
  if (h < 165) return 'sage-green';
  if (h < 225) return 'teal-cyan';
  if (h < 268) return 'steel-blue';
  if (h < 295) return 'indigo-navy';
  return 'violet-plum';
}
const entries = palette.map(p => {
  const [L, C, h] = lch(p.lab);
  return { rgb: p.rgb, hex: hex(p.rgb), oklab: p.lab.map(v => +v.toFixed(5)), L: +L.toFixed(4), C: +C.toFixed(4),
    h: +h.toFixed(1), family: family(L, C, h), origin: p.origin, source: p };
});
const orderIndex = e => FAMILY_ORDER.indexOf(e.family);
entries.sort((a, b) => orderIndex(a) - orderIndex(b) || a.L - b.L || a.hex.localeCompare(b.hex));
const indexOfSource = new Map(entries.map((e, i) => [e.source, i]));

const ramps = [];
for (const name of FAMILY_ORDER) {
  const members = entries.map((e, i) => [e, i]).filter(([e]) => e.family === name);
  if (!members.length) continue;
  if (members.length <= 9 || name === 'ink' || name.includes('neutral')) {
    ramps.push({ name, kind: 'family', indices: members.map(([, i]) => i) });
    continue;
  }
  const chromas = members.map(([e]) => e.C).sort((a, b) => a - b);
  const split = chromas[Math.floor(chromas.length / 2)];
  ramps.push({ name: `${name}/muted`, kind: 'family', indices: members.filter(([e]) => e.C < split).map(([, i]) => i) });
  ramps.push({ name: `${name}/vivid`, kind: 'family', indices: members.filter(([e]) => e.C >= split).map(([, i]) => i) });
}
const liveryGroups = new Map();
for (const { livery, indices } of liveryRamps) {
  const sorted = indices.map(i => indexOfSource.get(palette[i])).sort((a, b) => entries[a].L - entries[b].L);
  // Reused entries can collapse two steps onto nearly equal lightness; keep a
  // strictly increasing ramp.
  const ramp = [];
  for (const i of sorted) if (!ramp.length || entries[i].L > entries[ramp[ramp.length - 1]].L + 0.005) ramp.push(i);
  const name = `livery/${livery.name}`;
  ramps.push({ name, kind: 'livery', indices: ramp, livery: { source: livery.source, name: livery.name, hex: livery.hex } });
  liveryGroups.set(livery.hex, name);
}

// --- quality -----------------------------------------------------------------------
function corpusError(pal) {
  const errors = [];
  const labs = pal.map(p => p.oklab ?? p.lab);
  for (const file of files) {
    const { width: W, height: H, data: d } = load(file);
    for (let y = 0; y < H; y += PARAMS.qualityStride) for (let x = 0; x < W; x += PARAMS.qualityStride) {
      const i = (y * W + x) * 4, lab = oklab(d[i], d[i + 1], d[i + 2]);
      let best = Infinity;
      for (const q of labs) { const e = (lab[0] - q[0]) ** 2 + (lab[1] - q[1]) ** 2 + (lab[2] - q[2]) ** 2; if (e < best) best = e; }
      errors.push(Math.sqrt(best));
    }
    if (!REGION_FILES().has(file)) imageCache.delete(file);
  }
  errors.sort((a, b) => a - b);
  const q = f => +errors[Math.min(errors.length - 1, Math.floor(f * errors.length))].toFixed(4);
  return { mean: +(errors.reduce((s, e) => s + e, 0) / errors.length).toFixed(4), median: q(0.5), p90: q(0.9), p99: q(0.99),
    note: `nearest palette entry, plain OKLab distance, every pixel at stride ${PARAMS.qualityStride} over all inputs` };
}
const quality = corpusError(entries);
console.log('quantization error (OKLab)', quality);

const output = {
  version: 1,
  description: 'SORA CARS pixel-art race palette: cutscene-derived, hue-shifted ramps plus livery ramps. Generated; do not edit by hand.',
  generator: 'scripts/build-pixel-palette.mjs',
  command: `node scripts/build-pixel-palette.mjs${WITH_LIVERIES ? '' : ' --no-liveries'}${option('--core', null) ? ` --core ${PARAMS.coreClusters}` : ''}`,
  method: [
    `Cell-interior samples (3x3 max channel diff <= ${PARAMS.cellInteriorMaxChannelDiff}, stride ${PARAMS.sampleStride}) of every input`,
    `${BITS}-bit/channel histogram; bins with >= ${PARAMS.minBinCount} samples`,
    `weighted OKLab k-means (weight ${PARAMS.weight}, a/b x${PARAMS.abWeight}, k-means++ seed ${PARAMS.kmeansSeed}), K=${PARAMS.coreClusters}, centroids snapped to the nearest observed colour`,
    `anchors: the renderer's fixed entries verbatim (${RENDERER_ENTRY_SOURCES.filter(r => r[3]).map(r => r[2]).join(', ')}); its measured colours (${RENDERER_ENTRY_SOURCES.filter(r => !r[3]).map(r => r[2]).join(', ')}, C >= ${PARAMS.rendererCoverMinChroma}) and the style spec's named cutscene colours within ${PARAMS.specCover}; a missing one replaces the nearest core entry within ${PARAMS.anchorSnap}, else it is added`,
    WITH_LIVERIES ? 'hue-shifted livery ramps for every race livery and club skin (two dark same-hue steps below L 0.36, dark end leaning toward indigo/violet, light end toward amber/cream; teal follows the cutscene teal car: sage-teal mid band, amber highlight), reusing close entries' : 'no livery ramps',
    `greedy max-distance gap fill to ${PARAMS.paletteSize} from cutscene material ramps, lamp/sun glow rings, accent regions and the ${PARAMS.skyBands}-band sky strata of ${SKY_RAMPS.length} cutscene skies`,
  ],
  parameters: { ...PARAMS, coreClustersRequested },
  statistics: { inputs: files.length, sampled, cellInteriors: kept, occupiedBins: occupied, points: points.length,
    coreEntries: palette.filter(p => p.origin === 'kmeans').length, anchors: anchorReport,
    liveryEntries: palette.filter(p => p.origin.startsWith('livery:')).length, gapFilled: gapFilled.length },
  quantizationErrorOKLab: quality,
  inputs,
  liverySources: liveryProvenance,
  rendererEntrySources: rendererEntries.sources,
  colors: entries.map(({ source: _source, ...e }) => e),
  ramps,
  measured: { materialRamps, glowRamps, skyRamps, specAnchors: SPEC_ANCHORS,
    tealCar: { regions: TEAL_CAR_REGIONS, byLightness: [0.25, 0.35, 0.45, 0.55, 0.65].map(L => { const [C, h] = tealAt(L); return { L, C: +C.toFixed(4), h: +h.toFixed(1) }; }) } },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(output, null, 1) + '\n');
console.log(`wrote ${path.relative(ROOT, OUT)}: ${entries.length} colours, ${ramps.length} ramps`);
for (const r of ramps) console.log(`  ${r.name.padEnd(28)} ${r.indices.map(i => entries[i].hex).join(' ')}`);
if (gapFilled.length) console.log('gap-filled:\n  ' + gapFilled.join('\n  '));

if (SWATCH) {
  const cell = 24, cols = Math.max(...ramps.map(r => r.indices.length));
  const png = new PNG({ width: cols * cell, height: ramps.length * cell });
  ramps.forEach((ramp, row) => ramp.indices.forEach((index, col) => {
    const rgb = entries[index].rgb;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const i = (((row * cell + y) * png.width) + col * cell + x) * 4;
      png.data[i] = rgb[0]; png.data[i + 1] = rgb[1]; png.data[i + 2] = rgb[2]; png.data[i + 3] = 255;
    }
  }));
  fs.writeFileSync(path.resolve(SWATCH), PNG.sync.write(png));
  console.log(`swatch ${SWATCH}`);
}
if (COMPARE) {
  const reference = JSON.parse(fs.readFileSync(path.resolve(COMPARE), 'utf8'));
  const refColors = (reference.entries ?? reference.colors).map(e => e.rgb);
  const mine = new Set(entries.map(e => e.hex));
  const exact = refColors.filter(rgb => mine.has(hex(rgb))).length;
  const distances = refColors.map(rgb => Math.min(...entries.map(e => Math.sqrt(dist2(oklab(...rgb), e.oklab)))));
  console.log(`compare: ${exact}/${refColors.length} reference colours reproduced exactly; mean nearest distance ${(distances.reduce((s, d) => s + d, 0) / distances.length).toFixed(4)}, max ${Math.max(...distances).toFixed(4)}`);
}
