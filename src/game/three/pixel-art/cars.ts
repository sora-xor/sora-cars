import * as THREE from 'three';
import { CLUB_ITEMS } from '../../catalog';
import { LIVERIES } from '../../rules';
import type { PixelArtGrid } from './grid';
import { LINE_COLOURS, LINEWORK_COMMON, nearestPaletteIndex } from './linework';
import { oklabFromHex, type PixelPalette } from './palette';
import {
  artTarget, stageMaterial,
  type PixelArtFrame, type PixelArtSharedUniforms, type PixelArtStage,
} from './stages';
import { MAX_MOVERS, type MoverSlots } from './surfaces';

/**
 * Car definition stages of the pixel-art renderer (docs/pixel-art-renderer.md,
 * "Implementation notes: car definition"). The cutscene AE86s are drawn with a
 * crisp 1-cell tinted outline around the whole silhouette and along window
 * frames, bumpers, lamp blocks and panel gaps, flat 3-5 band paint with a few
 * horizontal reflection streaks and single-cell glints, dark glass, flat
 * two-tone lamp blocks and a pale plate with a dark border.
 *
 *   carMask  - (after normals) which car covers each art cell: the owning
 *              depth layer's world position tested against each mover's
 *              oriented box (slightly inflated), then glass cells that look
 *              through the car (glazing writes no depth) are filled when the
 *              view ray crosses that car's box and the car's own cells enclose
 *              them on all four sides. Shared as `cars` (artCarId, artCarKind);
 *              the band offset uses it for sparse streaks on paint;
 *   carPaint - (after grade) car paint in graded OKLab: an edge-preserving
 *              smoothing inside each material, soft specular lobes flattened to
 *              the lit band with their peak kept as a glint candidate, and red
 *              paint held on the crimson ramp under amber lamps;
 *   carLines - (after lines) silhouettes from the mask (a dark tinted line on
 *              the car side, lit top edges a beaded rim), interior lines from
 *              colour structure on the darker side, lamp blocks and plates,
 *              and the glints marked by carPaint.
 */
export interface CarOptions {
  /** 1 runs the car stages, 0 leaves cars to the generic stages (A/B). */
  carMask: number;
  carPaint: number;
  carLines: number;
  /** Box inflation: at least this many metres, and this fraction of a cell's footprint. */
  carPadMetres: number;
  carPadCells: number;
  /** Largest glass opening searched for enclosing body cells, in cells at a 315-cell short side. */
  carGlassReach: number;
  /** 1: paint takes sparse streaks instead of the band field (and glass none); 0 keeps the band field. */
  carBand: number;
  /** Band offset on paint: streak amplitude (bands) and the |field| where a streak starts / is full. */
  carStreakAmount: number;
  carStreakStart: number;
  carStreakFull: number;
  /** Edge-preserving paint smoothing: OKLab L and ab differences that still count as the same material. */
  carSmoothL: number;
  carSmoothAB: number;
  /** Highlight knee (OKLab L) of paint: soft specular lobes above it keep carLobeKeep of their rise (1 off). */
  carLobeKnee: number;
  carLobeKeep: number;
  /** Rise (OKLab L) of a lobe peak that becomes a glint cell. */
  carGlintRise: number;
  /** Red paint: weight of the crimson ramp mapping (0 off). */
  carCrimson: number;
  /** Dark glass (cabin cells darker than carGlassMax): L = floor + keep x L, chroma at least carGlassChroma, hue toward indigo. */
  carGlassFloor: number;
  carGlassKeep: number;
  carGlassChroma: number;
  carGlassMax: number;
  /** Interior colour lines: OKLab L step where a line starts / is certain, and the ab step that also counts. */
  carEdgeStart: number;
  carEdgeFull: number;
  carEdgeAB: number;
  /** Fill lightness below which an interior line is not drawn (already dark). */
  carEdgeMinFill: number;
  /** View depths (m) over which outlines turn hazy and interior lines fade. */
  carHazeStart: number;
  carHazeEnd: number;
  /** Fraction of lit top-edge cells that take a rim (1: a continuous line; below 1 beads on a car-local 3-cell lattice). */
  carRimKeep: number;
  /** Fraction of lit panel edges under a darker panel (boot lid, bumper) that take a bright line (1: continuous). */
  carEdgeBeadKeep: number;
  /** Smooth paint lightness (OKLab L) a panel edge needs to take its bright line (refine round 2: only lit edges). */
  carEdgeLit: number;
  /** Fill lightness above which a top edge can take a rim. */
  carRimMinFill: number;
  /**
   * Distant cars (refine round 1): beyond carFarStart .. carFarFull metres a
   * car's paint is drawn in its livery's palette ramp (setMoverColour), at
   * least carFarContrast OKLab L off the road around it, flat (no streaks,
   * interior lines, glints or beads), with its dark outline and a guaranteed
   * lamp-red taillight pair, so the pack stays readable at race speed.
   */
  carFarStart: number;
  carFarFull: number;
  carFarContrast: number;
  /** 1 draws the analytic taillight pair (the TailightFrame box's halves projected into cells) on distant cars. */
  carTaillights: number;
  /** Glints and panel-edge beads on car paint only nearer than this (m): farther they are sub-cell sparkle. */
  carMarksFar: number;
  /** Lit paint keeps its livery's hue within this many degrees (0 off): a teal car never turns olive under amber lamps. */
  carHueLock: number;
  /**
   * Refine round 3, rival-car flicker. carPlateHold 1: each car's rear plate
   * is the rectangle of its LicensePlate box projected into cells, its edges
   * held on whole cells (moved only when the projection leaves them by 0.75
   * cell), and its tone one step of the plate ramp chosen once per car with
   * hysteresis (carPlateStepHold OKLab L), instead of per cell from the
   * feature mask (plates stepped cream, pink and red at sub-cell motion).
   */
  carPlateHold: number;
  carPlateStepHold: number;
  /**
   * 1: lamp blocks take fixed palette tones per lens family (red, amber, the
   * pale reverse lens: shade, lit, lamp on), the lit tone on the upper half of
   * the taillight frame in the car's own frame, instead of the lens section's
   * mean colour split at its mean lightness (which flipped cell by cell).
   */
  carLampFlat: number;
  /**
   * 1: interior lines and lit panel edges are judged on the painted (and,
   * with temporalAccumulate, reprojected and accumulated) paint instead of the
   * raw grade, so they follow the steadied paint rather than the render's
   * sub-cell shimmer.
   */
  carEdgeSteady: number;
}

export const CAR_DEFAULTS: CarOptions = {
  carMask: 1, carPaint: 1, carLines: 1,
  carPadMetres: 0.05, carPadCells: 0.6, carGlassReach: 40,
  carBand: 1, carStreakAmount: 1, carStreakStart: 0.38, carStreakFull: 0.46,
  carSmoothL: 0.06, carSmoothAB: 0.035,
  carLobeKnee: 0.74, carLobeKeep: 0.35, carGlintRise: 0.09,
  carCrimson: 1,
  carGlassFloor: 0.1, carGlassKeep: 0.6, carGlassChroma: 0.04, carGlassMax: 0.32,
  carEdgeStart: 0.1, carEdgeFull: 0.16, carEdgeAB: 0.07, carEdgeMinFill: 0.14,
  carHazeStart: 70, carHazeEnd: 200,
  carRimKeep: 1, carEdgeBeadKeep: 1, carEdgeLit: 0.5, carRimMinFill: 0.22,
  carFarStart: 28, carFarFull: 42, carFarContrast: 0.1, carTaillights: 1, carMarksFar: 22, carHueLock: 25,
  // Refine round 3.
  carPlateHold: 1, carPlateStepHold: 0.03, carLampFlat: 1, carEdgeSteady: 1,
};

/**
 * The palette's livery ramp (palette.generated.json 'livery/<name>') for a
 * livery colour: the race liveries (rules.ts) and club skins (catalog.ts) by
 * their exact colour, else the ramp whose middle steps are nearest in OKLab.
 */
export function liveryRampFor(palette: PixelPalette, hex: string): readonly number[] | null {
  const key = hex.toLowerCase();
  const named = LIVERIES.find(livery => livery.color.toLowerCase() === key)?.name
    ?? CLUB_ITEMS.find(item => item.kind === 'skin' && item.color.toLowerCase() === key)?.sku;
  const ramps = palette.ramps.filter(ramp => ramp.kind === 'livery');
  const exact = named ? ramps.find(ramp => ramp.name === `livery/${named}`) : undefined;
  if (exact) return exact.indices;
  if (!/^#[0-9a-f]{6}$/.test(key) || ramps.length === 0) return null;
  const [L, a, b] = oklabFromHex(key);
  let best: readonly number[] | null = null, bestDistance = Infinity;
  for (const ramp of ramps) {
    for (const index of ramp.indices.slice(2, 5)) {
      const d = Math.hypot((palette.oklab[index * 4]! - L) * 0.5, palette.oklab[index * 4 + 1]! - a, palette.oklab[index * 4 + 2]! - b);
      if (d < bestDistance) { bestDistance = d; best = ramp.indices; }
    }
  }
  return best;
}
/** Steps of each car's livery ramp passed to the shaders (padded with the last step). */
export const CAR_RAMP_STEPS = 6;

const STAGES = { mask: 'carMask', band: 'carBand', paint: 'carPaint', lines: 'carLines' } as const;

/** ?pixelCars=off disables the car stages; ?pixelCars=mask,band,paint,lines keeps only those. */
export function carOptionsFromQuery(search: string): Partial<CarOptions> {
  const value = new URLSearchParams(search).get('pixelCars');
  if (value === null) return {};
  const enabled = new Set(value.split(',').map(name => name.trim()));
  return Object.fromEntries(Object.entries(STAGES).map(([name, key]) => [key, enabled.has(name) ? 1 : 0]));
}

/** Measured cutscene car colours (style spec: cars; red ramp from sunrise-wide). */
export const CAR_COLOURS = {
  glintCream: '#fdf5d5', glintGold: '#fee59a', glintPeach: '#ef915c',
  /** Warm pale greys of the palette for the plate, dark to light. */
  plateRamp: ['#7a5d62', '#926d61', '#a2817f', '#bd9a85', '#d1ae91'],
  /** The cutscenes' lamp red, for distant cars' analytic taillights. */
  lampRed: '#d13d32',
  /**
   * Refine round 3: flat lamp-block tones per lens family, [shade, lit, lamp
   * on] (the cutscene crimson ramp for red lenses; amber and the pale reverse
   * lens from the lamp ramps).
   */
  lampTones: {
    red: ['#95211e', '#d13d32', '#e24a3a'],
    amber: ['#b65d2e', '#fab15a', '#fdd176'],
    pale: ['#bd9a85', '#e7d3bb', '#fbf5d2'],
  },
} as const;

const CAR_BOXES = /* glsl */ `
const int MAX_CARS = ${MAX_MOVERS};
uniform vec4 moverMin[MAX_CARS];   // local box min (w: last transform known)
uniform vec4 moverMax[MAX_CARS];   // local box max (w: 1 active)
uniform mat4 moverToLocal[MAX_CARS];
uniform vec2 carPad;               // x: metres; y: fraction of the cell footprint
`;

/** Lamp and plate boxes of each car in its own frame (from the model's named meshes; w: 1 known). */
const CAR_FEATURES = /* glsl */ `
uniform vec4 carPlateMin[MAX_CARS];
uniform vec4 carPlateMax[MAX_CARS];
uniform vec4 carTailMin[MAX_CARS];
uniform vec4 carTailMax[MAX_CARS];
uniform vec4 carCabinMin[MAX_CARS];
uniform vec4 carCabinMax[MAX_CARS];
bool inFeature(vec3 p, vec4 lo, vec4 hi, vec3 grow) {
  return lo.w > .5 && all(greaterThanEqual(p, lo.xyz - grow)) && all(lessThanEqual(p, hi.xyz + grow));
}
`;

const MASK_DIRECT_FRAGMENT = /* glsl */ `
${CAR_BOXES}
layout(location = 0) out vec4 outDirect;
/** The car whose inflated box holds the owning layer's world position (deepest inside wins). */
void main() {
  ivec2 cell = artCell();
  outDirect = vec4(0.);
  vec4 data = texelFetch(resolvedData, cell, 0);
  if (data.w >= .5) return;
  vec3 world = artWorldPosition(vec2(cell) + .5, data.x);
  float pad = max(carPad.x, carPad.y * artCellWorldSize(data.x));
  int best = 0;
  float deepest = 0.;
  for (int i = 0; i < MAX_CARS; i++) {
    if (moverMax[i].w < .5) continue;
    vec3 local = (moverToLocal[i] * vec4(world, 1.)).xyz;
    // The box bottom stays at the mover's lifted floor: the road under the car is never car.
    vec3 inside3 = min(local - (moverMin[i].xyz - vec3(pad, 0., pad)), moverMax[i].xyz + pad - local);
    float inside = min(inside3.x, min(inside3.y, inside3.z));
    if (inside >= 0. && (best == 0 || inside > deepest)) { deepest = inside; best = i + 1; }
  }
  outDirect = vec4(float(best) / 255., 0., 0., 1.);
}`;

const MASK_FRAGMENT = /* glsl */ `
${CAR_BOXES}
${CAR_FEATURES}
uniform sampler2D carDirect;
uniform ivec2 carReach;            // glass enclosure search: horizontal / vertical cells
layout(location = 0) out vec4 outCar;
int directAt(ivec2 c) {
  if (any(lessThan(c, ivec2(0))) || any(greaterThanEqual(c, ivec2(artSize)))) return 0;
  return int(texelFetch(carDirect, c, 0).r * 255. + .5);
}
vec3 safeDirection(vec3 d) {
  return vec3(abs(d.x) < 1e-6 ? 1e-6 : d.x, abs(d.y) < 1e-6 ? 1e-6 : d.y, abs(d.z) < 1e-6 ? 1e-6 : d.z);
}
/** Entry distance of a ray into a box (negative: missed). */
float boxEntry(vec3 origin, vec3 direction, vec3 lo, vec3 hi) {
  vec3 inverse = 1. / safeDirection(direction);
  vec3 t0 = (lo - origin) * inverse, t1 = (hi - origin) * inverse;
  vec3 near = min(t0, t1), far = max(t0, t1);
  float enter = max(max(near.x, near.y), max(near.z, 0.)), exit = min(far.x, min(far.y, far.z));
  return exit > enter ? enter : -1.;
}
void main() {
  ivec2 cell = artCell();
  int id = directAt(cell);
  if (id > 0) {
    // Features in the car's own frame: 2 the rear plate, 1 the taillight
    // frame, 3 the cabin behind the glazing (interior seen through the glass).
    vec4 data = texelFetch(resolvedData, cell, 0);
    vec3 local = (moverToLocal[id - 1] * vec4(artWorldPosition(vec2(cell) + .5, data.x), 1.)).xyz;
    float grow = max(carPad.x, .5 * artCellWorldSize(data.x));
    vec3 reach = vec3(grow, grow, max(grow, .06));
    int feature = inFeature(local, carPlateMin[id - 1], carPlateMax[id - 1], reach) ? 2
      : inFeature(local, carTailMin[id - 1], carTailMax[id - 1], reach) ? 1
      : inFeature(local, carCabinMin[id - 1], carCabinMax[id - 1], vec3(-.02)) ? 3 : 0;
    outCar = vec4(float(id) / 255., 1. / 255., float(feature) / 255., 1.);
    return;
  }
  outCar = vec4(0.);
  // Glazing writes no depth, so glass cells resolve to what lies behind it:
  // the interior, or the scene beyond the car. They belong to the car when the
  // view ray crosses the car's box before reaching that surface and the car's
  // own cells enclose them on all four sides (pillars, roof, door, boot).
  vec4 data = texelFetch(resolvedData, cell, 0);
  vec2 centre = vec2(cell) + .5;
  float distance = data.w >= .5 ? 1e9 : length(artViewPosition(centre, data.x));
  vec3 origin = artCameraWorld[3].xyz, ray = artWorldRay(centre);
  int candidate = 0;
  float nearest = 1e9;
  for (int i = 0; i < MAX_CARS; i++) {
    if (moverMax[i].w < .5) continue;
    vec3 o = (moverToLocal[i] * vec4(origin, 1.)).xyz, d = mat3(moverToLocal[i]) * ray;
    float enter = boxEntry(o, d, moverMin[i].xyz - vec3(carPad.x, 0., carPad.x), moverMax[i].xyz + carPad.x);
    if (enter >= 0. && enter < distance - .05 && enter < nearest) { nearest = enter; candidate = i + 1; }
  }
  if (candidate == 0) return;
  bool left = false, right = false, below = false, above = false;
  for (int k = 1; k <= 128; k++) {
    if (k > carReach.x || (left && right)) break;
    left = left || directAt(cell - ivec2(k, 0)) == candidate;
    right = right || directAt(cell + ivec2(k, 0)) == candidate;
  }
  if (!(left && right)) return;
  for (int k = 1; k <= 128; k++) {
    if (k > carReach.y || (below && above)) break;
    below = below || directAt(cell - ivec2(0, k)) == candidate;
    above = above || directAt(cell + ivec2(0, k)) == candidate;
  }
  if (below && above) outCar = vec4(float(candidate) / 255., 2. / 255., 3. / 255., 1.);
}`;

/**
 * One tone pair per distant car (refine round 2), a texel per mover slot: the
 * pair of neighbouring livery steps nearest the ramp's middle whose tones both
 * stand carFar.z off the road around the car (sampled around the car's box on
 * screen), kept from last frame while it still stands 0.8 x that off. Chosen
 * per cell from the 8 road cells around it, the pair followed the lamp pools
 * and flecks cell by cell and the small cars' bands hopped.
 */
const TONE_FRAGMENT = /* glsl */ `
const int MAX_CARS = ${MAX_MOVERS};
const int RAMP_STEPS = ${CAR_RAMP_STEPS};
uniform vec4 carLivery[MAX_CARS];
uniform int carRamp[MAX_CARS * RAMP_STEPS];
uniform vec4 carFar;
uniform vec4 carScreen[MAX_CARS];   // the car's box on screen in cells: xy min, zw max (z < x: off screen)
uniform sampler2D carGradedIn;
uniform sampler2D carTonePrevious;
uniform float carToneValid;
uniform vec4 carPlateRect[MAX_CARS];  // the held plate rectangle in cells (x0, y0, x1, y1)
uniform vec4 carPlateState[MAX_CARS]; // x: view depth of the plate; y: 1 held
uniform int carPlateRamp[5];          // warm pale greys, dark to light
uniform float carPlateStepHold;       // OKLab L a new plate step must win by (negative: no plate steps)
layout(location = 0) out vec4 outTone;
float stepL(int base, int s) { return texelFetch(paletteLab, ivec2(carRamp[base + s], 0), 0).x; }
float pairScore(int base, int s, float road) { return min(abs(stepL(base, s) - road), abs(stepL(base, s + 1) - road)); }
float plateStepL(int s) { return texelFetch(paletteLab, ivec2(carPlateRamp[s], 0), 0).x; }
/**
 * The plate's tone, one step of the plate ramp per car (refine round 3): the
 * palest cell of the held plate rectangle (its background, not the
 * lettering), lifted 0.08 toward 0.78, kept on last frame's step unless
 * another step is closer by carPlateStepHold. Returns step + 1 (0: none).
 */
float plateStep(int slot) {
  vec4 rect = carPlateRect[slot];
  if (carPlateStepHold < 0. || carPlateState[slot].y < .5 || rect.z <= rect.x || rect.w <= rect.y) return 0.;
  float palest = -1.;
  for (int y = 0; y < 8; y++) for (int x = 0; x < 16; x++) {
    ivec2 c = ivec2(rect.xy) + ivec2(x, y);
    if (c.x >= int(rect.z) || c.y >= int(rect.w) || artCarId(c) != slot + 1) continue;
    palest = max(palest, texelFetch(carGradedIn, artClamp(c), 0).x);
  }
  if (palest < 0.) return 0.;
  float plateL = max(palest, min(palest + .08, .78));
  int best = 0;
  for (int s = 1; s < 5; s++) if (abs(plateStepL(s) - plateL) < abs(plateStepL(best) - plateL)) best = s;
  int previous = carToneValid > .5 ? int(texelFetch(carTonePrevious, ivec2(slot, 0), 0).b * 255. + .5) - 1 : -1;
  if (previous >= 0 && previous < 5 && abs(plateStepL(previous) - plateL) < abs(plateStepL(best) - plateL) + carPlateStepHold) best = previous;
  return float(best + 1);
}
void main() {
  int slot = int(gl_FragCoord.x);
  float plate = plateStep(slot) / 255.;
  outTone = vec4(0., 0., plate, 1.);
  vec4 box = carScreen[slot];
  if (carLivery[slot].w < .5 || box.z < box.x) return;
  float road = 0., count = 0.;
  for (int k = 0; k < 16; k++) {
    vec2 p = k < 8 ? vec2(mix(box.x - 2., box.z + 2., float(k) / 7.), box.y - 2.)
      : k < 12 ? vec2(box.x - 3., mix(box.y, box.w, float(k - 8) / 6.))
      : vec2(box.z + 3., mix(box.y, box.w, float(k - 12) / 6.));
    ivec2 c = ivec2(floor(p));
    if (any(lessThan(c, ivec2(0))) || any(greaterThanEqual(c, ivec2(artSize))) || artCarId(c) != 0) continue;
    if (texelFetch(resolvedData, c, 0).w >= .5) continue;
    road += texelFetch(carGradedIn, c, 0).x; count += 1.;
  }
  if (count < 1.) return;
  road /= count;
  int base = slot * RAMP_STEPS;
  int previous = carToneValid > .5 ? int(texelFetch(carTonePrevious, ivec2(slot, 0), 0).r * 255. + .5) : 0;
  if (previous >= 1 && previous <= 4 && pairScore(base, previous, road) >= .8 * carFar.z) {
    outTone = vec4(float(previous) / 255., road, plate, 1.);
    return;
  }
  int shade = 2;
  float bestScore = -1.;
  for (int k = 0; k < 4; k++) {
    int s0 = k == 0 ? 2 : k == 1 ? 3 : k == 2 ? 1 : 4;
    float score = pairScore(base, s0, road);
    if (score > bestScore + (bestScore >= carFar.z ? 1. : 0.)) { bestScore = score; shade = s0; }
  }
  outTone = vec4(float(shade) / 255., road, plate, 1.);
}`;

const PAINT_FRAGMENT = /* glsl */ `
const int MAX_CARS = ${MAX_MOVERS};
const int RAMP_STEPS = ${CAR_RAMP_STEPS};
uniform vec4 carLivery[MAX_CARS];     // OKLab of each car's livery colour (w: 1 known)
uniform int carRamp[MAX_CARS * RAMP_STEPS]; // its palette livery ramp, dark to light
uniform vec4 carFar;                  // x, y: depth (m) where paint turns into the livery ramp; z: L kept off the road around the car; w: glints only nearer (m)
uniform float carHueLock;             // radians a lit livery may turn off its own hue (0: off)
uniform sampler2D carGradedIn;
uniform float carExposure;
uniform float carEmitter;     // exposure-scaled HDR luminance of a lamp (left as is)
uniform vec2 carSmooth;       // x: L, y: ab difference that still counts as the same material
uniform vec3 carLobe;         // x: highlight knee (OKLab L); y: kept fraction above it; z: glint rise over the paint around a peak
uniform float carCrimson;
uniform vec4 carGlass;        // x: lightness floor; y: kept fraction of the interior's lightness; z: chroma floor; w: darkest-cell limit
uniform sampler2D carTone;    // per mover slot: r the distant car's tone pair (lower step, 1-4)
uniform vec4 moverMin[MAX_CARS];
uniform vec4 moverMax[MAX_CARS];
uniform float carSplit;       // car-local height (share of the box) above which a distant car takes its lighter tone
layout(location = 0) out vec4 outGraded;
const ivec2 RING[8] = ivec2[8](ivec2(3, 0), ivec2(-3, 0), ivec2(0, 2), ivec2(0, -2), ivec2(2, 2), ivec2(-2, 2), ivec2(2, -2), ivec2(-2, -2));
vec3 labAt(ivec2 c) { return texelFetch(carGradedIn, artClamp(c), 0).xyz; }
bool emitterAt(ivec2 c) { return artLuminance(texelFetch(hdr, artClamp(c), 0).rgb) * carExposure > carEmitter; }
bool paintAt(ivec2 c, int id) { return artCarId(c) == id && artCarKind(c) == 1 && !emitterAt(c); }
/**
 * Red paint weight: saturated crimson to lamp-lit orange-red (amber light on
 * red paint graded toward h40-56). Lamp-lit white paint (C < 0.09), yellow
 * paint (h > 64) and violet-rotated shade keep their own colours.
 */
float redness(vec3 lab) {
  float chroma = length(lab.yz), hue = degrees(atan(lab.z, lab.y));
  float window = smoothstep(-35., -20., hue) * (1. - smoothstep(56., 64., hue));
  float need = mix(.092, .105, smoothstep(30., 45., hue));
  return window * smoothstep(need, need + .02, chroma);
}
/**
 * The crimson ramp of the cutscene red cars (#491915 #99221f #ae2e2b #c23935
 * #d1423f, highlight #ef915c). Lightness keeps the rendered form; lit red
 * holds its hue and chroma on the ramp instead of turning coral or salmon
 * under amber lamps, and only the top band turns peach.
 */
vec3 crimsonRamp(vec3 lab) {
  float chroma = length(lab.yz), hue = atan(lab.z, lab.y);
  float lit = smoothstep(.36, .44, lab.x), top = smoothstep(.68, .72, lab.x);
  float L = mix(lab.x < .56 ? lab.x : .56 + (lab.x - .56) * .3, .744, top);
  float ramp = mix(.074, .18, smoothstep(.25, .56, L));
  float C = mix(mix(chroma, max(chroma, ramp), lit), .133, top);
  float h = mix(mix(hue, radians(26.), lit), radians(49.), top);
  return vec3(L, C * cos(h), C * sin(h));
}
void main() {
  ivec2 cell = artCell();
  vec4 source = texelFetch(carGradedIn, cell, 0);
  outGraded = vec4(source.xyz, 0.);
  int id = artCarId(cell);
  if (id == 0) return;
  // Glass: the dark cabin seen through the glazing (and the scene seen through
  // both windows) becomes the cutscenes' dark navy/indigo glass, keeping the
  // interior's silhouette as lighter shapes instead of near-black.
  if (artCarFeature(cell) == 3 && source.x < carGlass.w && !emitterAt(cell)) {
    float chroma = max(length(source.yz), carGlass.z), hue = atan(source.z, source.y);
    float turn = radians(285.) - hue;
    turn = mod(turn + 3.14159265, 6.28318531) - 3.14159265;
    hue += turn * .7;
    outGraded = vec4(carGlass.x + source.x * carGlass.y, chroma * cos(hue), chroma * sin(hue), 0.);
    return;
  }
  if (!paintAt(cell, id)) return;
  vec3 lab = source.xyz;
  // Edge-preserving smoothing within one material: 3x3 cells of the same car
  // whose colour is close; mottle and render noise go, edges stay.
  vec3 sum = lab;
  float weight = 1.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    if (x == 0 && y == 0) continue;
    ivec2 other = cell + ivec2(x, y);
    if (!paintAt(other, id)) continue;
    vec3 o = labAt(other);
    float w = (1. - smoothstep(.5 * carSmooth.x, carSmooth.x, abs(o.x - lab.x)))
      * (1. - smoothstep(.5 * carSmooth.y, carSmooth.y, length(o.yz - lab.yz)));
    sum += o * w; weight += w;
  }
  vec3 paint = sum / weight;
  // Soft specular lobes (a lamp or the sky mirrored in a roof or boot lid)
  // rise far above the lit band and quantise into rings. Above a knee the
  // paint keeps only a fraction of its rise: a lobe reads as one or two flat
  // lit bands, and its peak becomes a glint cell below. (A lower envelope per
  // panel was tried: its per-cell estimate mottled flat panels.)
  if (paint.x > carLobe.x) paint.x = carLobe.x + (paint.x - carLobe.x) * carLobe.y;
  // A highlight peak (a lamp or the sky caught by the paint): the strict
  // maximum of its 7x5 paint cells, risen above the paint around it, becomes
  // one glint cell instead of a soft lobe.
  float glint = 0.;
  bool top = true;
  for (int y = -2; y <= 2 && top; y++) for (int x = -3; x <= 3; x++) {
    if (x == 0 && y == 0) continue;
    ivec2 other = cell + ivec2(x, y);
    if (!paintAt(other, id)) continue;
    float o = labAt(other).x;
    if (o > lab.x || (o == lab.x && (y > 0 || (y == 0 && x > 0)))) { top = false; break; }
  }
  float depth = texelFetch(resolvedData, cell, 0).x;
  // Glints only where the car is big enough to carry one (farther they are sub-cell sparkle).
  if (top && depth < carFar.w) {
    float around = 0., count = 0.;
    for (int k = 0; k < 8; k++) {
      ivec2 other = cell + RING[k];
      if (!paintAt(other, id)) continue;
      around += labAt(other).x; count += 1.;
    }
    // A point highlight, not a lit line: a lit bumper lip or roof edge rose
    // above the ring too and took a glint at every local maximum along it, a
    // row of evenly spaced beads (refine round 2). Along the row the peak
    // must stand clear as well.
    float row = 0.;
    for (int k = 0; k < 2; k++) {
      ivec2 other = cell + RING[k];
      row = max(row, paintAt(other, id) ? labAt(other).x : 0.);
    }
    glint = count >= 5. && lab.x - around / count > carLobe.z && lab.x - row > .5 * carLobe.z ? 1. : 0.;
  }
  float red = redness(paint) * carCrimson;
  if (red > 0.) paint = mix(paint, crimsonRamp(paint), red);
  // Livery hue lock: lit paint stays near its livery's hue (a teal car under
  // an amber lamp stays teal instead of flipping to olive and back).
  vec4 livery = carLivery[id - 1];
  float liveryChroma = length(livery.yz), chroma = length(paint.yz);
  if (livery.w > .5 && carHueLock > 0. && liveryChroma > .05 && red <= 0. && chroma > .02) {
    float hue = atan(paint.z, paint.y), target = atan(livery.z, livery.y);
    hue = target + clamp(mod(hue - target + 3.14159265, 6.28318531) - 3.14159265, -carHueLock, carHueLock);
    paint.yz = vec2(cos(hue), sin(hue)) * chroma;
  }
  // Distant cars are drawn as a pixel artist draws a small car: two flat tones
  // of their livery's own mid steps (the lit upper body, the shaded rest,
  // split at the car's local mean lightness), one step darker when the road
  // around them is as light as those steps (lit haze, sunrise), so the pack
  // keeps its liveries at race speed instead of collapsing to navy.
  float far = smoothstep(carFar.x, carFar.y, depth);
  if (far > 0. && livery.w > .5) {
    int base = (id - 1) * RAMP_STEPS;
    // The car's tone pair (one per car, with hysteresis: carTone), split at a
    // height in the car's own frame (refine round 2): the lit upper body over
    // the shaded rest rides with the car, where the split at the local mean
    // lightness hopped with every lamp pool.
    int shade = int(texelFetch(carTone, ivec2(id - 1, 0), 0).r * 255. + .5);
    if (shade < 1 || shade > 4) shade = 2;
    vec4 anchor = texelFetch(anchors, cell, 0);
    float height = (anchor.y - moverMin[id - 1].y) / max(moverMax[id - 1].y - moverMin[id - 1].y, 1e-3);
    bool upper = artSurfaceReady > .5 && abs(anchor.w - float(id)) < .5 ? height >= carSplit : lab.x >= paint.x - .005;
    int best = carRamp[base + (upper ? shade + 1 : shade)];
    paint = mix(paint, texelFetch(paletteLab, ivec2(best, 0), 0).xyz, far);
    glint = 0.;
  }
  outGraded = vec4(paint, glint);
}`;

const LINES_FRAGMENT = /* glsl */ `
${LINEWORK_COMMON}
${LINE_COLOURS}
uniform sampler2D carGradedSource; // graded OKLab before carPaint: edges of materials, not of flattened bands
uniform float carPaintOn;          // 1 when carPaint ran this frame (graded alpha carries its glint flags)
uniform float carGlassMax;         // cabin cells darker than this are glass
uniform vec3 keyLightDirection;
uniform vec2 keyLight;         // x: strength, y: warmth
uniform vec3 keyLightScreen;   // xy: key direction in the image plane; z: reliability
uniform float carEmitter;
uniform vec4 carEdge;          // x, y: L step start / full; z: ab step; w: min fill L
uniform vec2 carHaze;          // m: outlines haze and interior lines fade
uniform vec3 carRim;           // x: rim keep (1: continuous); y: min fill L; z: panel-edge keep (1: continuous)
uniform float carEdgeLit;      // smooth paint L a lit panel edge needs for its bright line
uniform ivec4 carGlints;       // cream, gold, peach
uniform int carPlateRamp[5];   // warm pale greys, dark to light
const int MAX_CARS = ${MAX_MOVERS};
uniform vec4 carFar;           // x, y: depth (m) where a car is drawn as a distant car; w: glints and beads only nearer (m)
uniform vec4 carTail[MAX_CARS];      // analytic taillight pair: left (xy), right (zw) lamp centres in cells
uniform vec4 carTailState[MAX_CARS]; // x: view depth of the lamps; y: 1 when the rear faces the camera
uniform int carLampRed;              // the cutscene lamp red (#d13d32)
uniform vec4 carTailMin[MAX_CARS];   // taillight frame box in the car's own frame (w: 1 known)
uniform vec4 carTailMax[MAX_CARS];
uniform int carLampTones[9];         // refine round 3: red, amber, pale lens: shade, lit, lamp on
uniform float carLampFlat;           // 1: flat lamp tones (refine round 3)
uniform vec4 carPlateRect[MAX_CARS]; // held plate rectangle in cells (x0, y0, x1, y1)
uniform vec4 carPlateState[MAX_CARS];// x: view depth of the plate; y: 1 held
uniform sampler2D carTone;           // b: the held plate step + 1 (tone pass)
uniform float carToneReady;
uniform float carEdgeSteady;         // 1: interior lines judged on the painted, accumulated paint
layout(location = 0) out vec4 outImage;
layout(location = 1) out vec4 outMarks;
const ivec2 STEPS[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
const float LAMP_PI = 3.14159265;
vec3 sourceLab(ivec2 c) { return texelFetch(carGradedSource, artClamp(c), 0).xyz; }
/** Paint for interior lines: the painted and accumulated paint (refine round 3), or the raw grade. */
bool steadyEdges = false;
vec3 edgeLab(ivec2 c) { return steadyEdges ? texelFetch(graded, artClamp(c), 0).xyz : sourceLab(c); }
/** Whether a cell lies on this car's held plate rectangle (refine round 3); -1: no held plate, use the feature mask. */
int heldPlate(ivec2 c, int id, float depth) {
  vec4 rect = carPlateRect[id - 1], state = carPlateState[id - 1];
  if (state.y < .5 || rect.z <= rect.x || rect.w <= rect.y) return -1;
  bool inside = c.x >= int(rect.x) && c.x < int(rect.z) && c.y >= int(rect.y) && c.y < int(rect.w);
  return inside && artCarId(c) == id && abs(depth - state.x) < .3 + .05 * state.x ? 1 : 0;
}
float gradedL(ivec2 c) { return texelFetch(graded, artClamp(c), 0).x; }
bool emitterAt(ivec2 c) { return cellLuminance(c) > carEmitter; }
/** A lamp cell: inside the taillight frame, red to amber or lit. */
/** A lamp lens: red to amber, or lit. */
bool lensColour(ivec2 c) {
  if (emitterAt(c)) return true;
  vec3 lab = sourceLab(c);
  float hue = degrees(atan(lab.z, lab.y));
  return length(lab.yz) > .07 && hue > -40. && hue < 80.;
}
/**
 * A lamp cell: inside the taillight frame, a red or amber lens, or a pale
 * lens (the reverse lamp) held between red lenses on both sides.
 */
bool lampAt(ivec2 c, int id) {
  if (artCarId(c) != id || artCarFeature(c) != 1) return false;
  if (lensColour(c)) return true;
  if (sourceLab(c).x < .38) return false;
  bool left = false, right = false;
  for (int k = 1; k <= 3; k++) {
    left = left || (artCarFeature(c - ivec2(k, 0)) == 1 && lensColour(c - ivec2(k, 0)));
    right = right || (artCarFeature(c + ivec2(k, 0)) == 1 && lensColour(c + ivec2(k, 0)));
  }
  return left && right;
}
/**
 * Bright line for a lit car edge: amber/cream under a warm key, lavender where
 * the edge faces the sky under a cool key (the night views).
 */
vec3 carBright(vec3 lch, bool skyward, float gain) {
  return skyward && keyLight.y < .5 ? vec3(clamp(max(lch.x * 1.35, lch.x + .1), .45, .82), .1, HUE_LAVENDER) : brightLine(lch, gain);
}
/** Line colour for a car cell: the tinted dark line, hazier (lighter, lavender) with distance. */
vec3 carDark(vec3 lch, float haze) {
  vec3 dark = darkLine(lch);
  if (haze <= 0.) return dark;
  return vec3(mix(dark.x, lch.x * .8, haze), mix(dark.y, max(dark.y, .04), haze), hueToward(dark.z, HUE_LAVENDER, radians(40.) * haze));
}
/** The lit top edge of a panel under a darker one of the same car (a boot lip, a bumper under the lamps). */
bool litPanelEdge(ivec2 c, int id) {
  if (artCarId(c) != id || artCarId(c + ivec2(0, 1)) != id) return false;
  float L = edgeLab(c).x;
  return L >= max(carRim.y, carEdgeLit) && L - edgeLab(c + ivec2(0, 1)).x >= carEdge.y && L >= edgeLab(c - ivec2(0, 1)).x - .04;
}
bool heldGlint(ivec2 c) { return artHistoryReady > .5 && (int(texelFetch(history, artClamp(c), 0).a * 255. + .5) & 64) != 0; }
void main() {
  ivec2 cell = artCell();
  vec4 current = texelFetch(image, cell, 0);
  vec4 prior = texelFetch(marks, cell, 0);
  outImage = current;
  outMarks = prior;
  int id = artCarId(cell);
  if (id == 0) return;
  int feature = artCarFeature(cell);
  vec4 data = texelFetch(resolvedData, cell, 0);
  int index = indexOf(current);
  vec3 lch = lchOf(entryLab(index));
  // Bright edge colours follow the smooth paint, not the quantised fill, so a
  // bead or rim keeps one colour along an edge instead of flipping entries.
  vec3 smoothLch = lchOf(texelFetch(graded, cell, 0).xyz);
  float haze = smoothstep(carHaze.x, carHaze.y, data.x);
  float far = smoothstep(carFar.x, carFar.y, data.x);
  bool emitter = emitterAt(cell);
  bool lamp = lampAt(cell, id);
  // Distant cars keep a lamp-red taillight pair however small they get: the
  // car's own TailightFrame halves projected into cells.
  vec4 tail = carTail[id - 1], tailState = carTailState[id - 1];
  if (far > .5 && tailState.y > .5 && abs(data.x - tailState.x) < 1. + .04 * tailState.x
    && (all(equal(cell, ivec2(floor(tail.xy)))) || all(equal(cell, ivec2(floor(tail.zw)))))) {
    outImage = entryTexel(emitter ? index : carLampRed);
    outMarks = vec4(0., 0., prior.b, 1.);
    return;
  }

  // Silhouette: a neighbour that is not this car (another car only when it is
  // farther: the nearer car draws the shared edge).
  vec2 outward = vec2(0.);
  int sides = 0;
  for (int k = 0; k < 4; k++) {
    ivec2 other = cell + STEPS[k];
    int otherId = artCarId(other);
    if (otherId == id) continue;
    if (otherId > 0 && texelFetch(resolvedData, artClamp(other), 0).x < data.x) continue;
    outward += vec2(STEPS[k]);
    sides++;
  }
  // Lamps stay bright blocks at every distance.
  if (sides > 0 && !lamp && !emitter) {
    // The outward direction from the car's own cells in a 5 x 5 window, so
    // every cell of a straight (or stair-stepped diagonal) edge decides alike:
    // from the four neighbours alone, only the corners of each stair step
    // faced up, and a diagonal flank took a rim bead at every step.
    vec2 around = vec2(0.);
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      if (x == 0 && y == 0) continue;
      ivec2 other = cell + ivec2(x, y);
      int otherId = artCarId(other);
      if (otherId == id || (otherId > 0 && texelFetch(resolvedData, artClamp(other), 0).x < data.x)) continue;
      around += vec2(x, y) / float(x * x + y * y);
    }
    if (length(around) > 1e-3) outward = around;
    vec2 dir = length(outward) > 1e-3 ? normalize(outward) : vec2(0., 1.);
    // Lit top edges (roof, boot lid, bonnet lip) and edges toward the key take
    // a beaded rim when the paint inside is lit and the background darker.
    vec3 n = texelFetch(normals, cell, 0).xyz;
    ivec2 inward = ivec2(-sign(dir.x) * step(.5, abs(dir.x)), -sign(dir.y) * step(.5, abs(dir.y)));
    float inside = .5 * (gradedL(cell + inward) + gradedL(cell + 2 * inward));
    float behind = gradedL(cell + ivec2(round(dir)));
    float keySide = smoothstep(.25, .6, dot(dir, keyLightScreen.xy)) * keyLightScreen.z * smoothstep(-.1, .2, dot(n, keyLightDirection));
    float topSide = smoothstep(.35, .8, dir.y);
    // Under a cool key (the night moon) only top edges, which face the sky,
    // take a rim (lavender); a moonlit side edge keeps its dark outline
    // (refine round 2: lavender beads down the flanks read as LED strips).
    bool warm = keyLight.y > .5;
    float lit = (warm ? max(keySide, topSide) : topSide) * smoothstep(carRim.y, carRim.y + .08, inside) * (1. - haze);
    if (lit > .5 && behind < inside - .05) {
      // A continuous 1-cell line (carRimKeep 1), as the cutscene cars draw a
      // lit roof or boot edge, rather than a string of beads.
      if (carRim.x >= 1. || anchoredHash(cell, data, 3., 7) < carRim.x) {
        outImage = entryTexel(drawnIndex(carBright(smoothLch, !warm || keySide <= topSide, 1.8), index, true));
        outMarks = vec4(0., 1., prior.b, 1.);
      }
      return;
    }
    // Near-black fills (tyres, grilles, the underside) already read as ink.
    if (lch.x < .1) return;
    outImage = entryTexel(drawnIndex(carDark(lch, haze), index, false));
    outMarks = vec4(1., 0., prior.b, 1.);
    return;
  }

  // The rear plate: a flat pale rectangle (its lettering dropped) with a dark
  // border where the plate is big enough to carry one. Refine round 3: the
  // plate is the held rectangle of the car's plate box and its tone one held
  // step per car (the tone pass), so it no longer steps between tones or
  // changes shape at sub-cell motion.
  int onPlate = heldPlate(cell, id, data.x);
  if (onPlate == 1) {
    vec4 rect = carPlateRect[id - 1];
    int plateIndex = carToneReady > .5 ? int(texelFetch(carTone, ivec2(id - 1, 0), 0).b * 255. + .5) - 1 : -1;
    int plateEntry = carPlateRamp[clamp(plateIndex, 0, 4)];
    if (plateIndex < 0) {
      vec3 plate = sourceLab(cell);
      for (int y = 0; y < 8; y++) for (int x = 0; x < 16; x++) {
        ivec2 other = ivec2(rect.xy) + ivec2(x, y);
        if (other.x >= int(rect.z) || other.y >= int(rect.w) || artCarId(other) != id) continue;
        vec3 o = sourceLab(other);
        if (o.x > plate.x) plate = o;
      }
      float plateL = max(plate.x, min(plate.x + .08, .78));
      for (int k = 1; k < 5; k++) {
        if (abs(entryLab(carPlateRamp[k]).x - plateL) < abs(entryLab(plateEntry).x - plateL)) plateEntry = carPlateRamp[k];
      }
    }
    bool wide = rect.z - rect.x >= 3., tall = rect.w - rect.y >= 3.;
    bool border = (wide && (cell.x == int(rect.x) || cell.x == int(rect.z) - 1)) || (tall && (cell.y == int(rect.y) || cell.y == int(rect.w) - 1));
    if (border) {
      outImage = entryTexel(drawnIndex(carDark(lchOf(entryLab(plateEntry)), haze), plateEntry, false));
      outMarks = vec4(1., 0., prior.b, 1.);
    } else {
      outImage = entryTexel(plateEntry);
      outMarks = vec4(0., 0., prior.b, 1.);
    }
    return;
  }
  if (onPlate < 0 && feature == 2) {
    // The plate's background: the palest plate cell across most of the plate.
    vec3 plate = sourceLab(cell);
    for (int y = -2; y <= 2; y++) for (int x = -6; x <= 6; x++) {
      ivec2 other = cell + ivec2(x, y);
      if (artCarId(other) != id || artCarFeature(other) != 2) continue;
      vec3 o = sourceLab(other);
      if (o.x > plate.x) plate = o;
    }
    vec3 plateLch = lchOf(plate);
    // A pale, nearly neutral panel that reads as the plate against the dark
    // bumper at night too: the nearest step of the palette's warm pale greys
    // (the nearest colour alone lands on sage or mint entries).
    float plateL = max(plateLch.x, min(plateLch.x + .08, .78));
    int plateEntry = carPlateRamp[0];
    for (int k = 1; k < 5; k++) {
      if (abs(entryLab(carPlateRamp[k]).x - plateL) < abs(entryLab(plateEntry).x - plateL)) plateEntry = carPlateRamp[k];
    }
    plateLch = lchOf(entryLab(plateEntry));
    bool edgeX = artCarFeature(cell + ivec2(1, 0)) != 2 || artCarFeature(cell - ivec2(1, 0)) != 2;
    bool edgeY = artCarFeature(cell + ivec2(0, 1)) != 2 || artCarFeature(cell - ivec2(0, 1)) != 2;
    bool thinX = artCarFeature(cell + ivec2(1, 0)) != 2 && artCarFeature(cell - ivec2(1, 0)) != 2;
    bool thinY = artCarFeature(cell + ivec2(0, 1)) != 2 && artCarFeature(cell - ivec2(0, 1)) != 2;
    if ((edgeX && !thinX) || (edgeY && !thinY)) {
      outImage = entryTexel(drawnIndex(carDark(plateLch, haze), plateEntry, false));
      outMarks = vec4(1., 0., prior.b, 1.);
    } else {
      outImage = entryTexel(plateEntry);
      outMarks = vec4(0., 0., prior.b, 1.);
    }
    return;
  }

  // Lamp blocks: each lens section flattened to two tones (its lit and its
  // shaded half), framed by a dark bezel in the cells around the lamp.
  if (lamp) {
    vec3 own = sourceLab(cell);
    vec3 sum = vec3(0.);
    float count = 0.;
    for (int y = -1; y <= 1; y++) for (int x = -2; x <= 2; x++) {
      ivec2 other = cell + ivec2(x, y);
      if (!lampAt(other, id)) continue;
      vec3 o = sourceLab(other);
      if (abs(o.x - own.x) > .18 || length(o.yz - own.yz) > .07) continue;
      sum += o; count += 1.;
    }
    vec3 mean = sum / max(count, 1.);
    vec3 core = lchOf(mean);
    if (carLampFlat > .5) {
      // Flat lamp tones (refine round 3): the lens family from the section's
      // mean colour (red, amber, or the pale reverse lens), the lit tone on
      // the upper half of the taillight frame in the car's own frame and the
      // shade below it, one step up while the lamp is lit (brakes): fixed
      // palette entries that ride with the car instead of flipping with the
      // render's shimmer.
      int family = core.y < .07 ? 2 : degrees(core.z) < 42. ? 0 : 1;
      vec4 anchor = texelFetch(anchors, cell, 0);
      vec4 lo = carTailMin[id - 1], hi = carTailMax[id - 1];
      bool upper = artSurfaceReady > .5 && abs(anchor.w - float(id)) < .5 && lo.w > .5
        ? anchor.y >= mix(lo.y, hi.y, .5) : own.x >= mean.x - .015;
      outImage = entryTexel(carLampTones[family * 3 + (upper ? 1 : 0) + (emitter ? 1 : 0)]);
      outMarks = vec4(0., 0., prior.b, 1.);
      return;
    }
    if (emitter) core.x = max(core.x, .8);
    else if (own.x < mean.x - .015) core = vec3(core.x * .8, core.y * .92, hueToward(core.z, HUE_VIOLET, radians(6.)));
    else core = vec3(core.x + .03, core.y * 1.05, core.z);
    outImage = entryTexel(snapToPalette(labOf(core)));
    outMarks = vec4(0., 0., prior.b, 1.);
    return;
  }
  bool bezel = false;
  for (int k = 0; k < 4; k++) bezel = bezel || lampAt(cell + STEPS[k], id);
  if (bezel && haze < .8) {
    outImage = entryTexel(drawnIndex(carDark(lch, haze), index, false));
    outMarks = vec4(1., 0., prior.b, 1.);
    return;
  }

  // Glints marked by carPaint at the peak of a highlight, with hysteresis: a
  // glint the surface carried last frame (temporal history, reprojected with
  // the car) stays while its cell is still at the peak, and a new peak nearby
  // yields to it, so glints stop hopping cell to cell on the bumper.
  bool flagged = carPaintOn > .5 && texelFetch(graded, cell, 0).w > .5;
  bool held = carPaintOn > .5 && data.x < carFar.w && heldGlint(cell);
  if (held && !flagged) {
    float own = gradedL(cell), peak = own;
    for (int y = -1; y <= 1; y++) for (int x = -2; x <= 2; x++) {
      ivec2 other = cell + ivec2(x, y);
      if (artCarId(other) == id && artCarKind(other) == 1) peak = max(peak, gradedL(other));
    }
    flagged = own >= peak - .03;
  } else if (flagged && !held) {
    for (int y = -2; y <= 2 && flagged; y++) for (int x = -3; x <= 3; x++) {
      if ((x != 0 || y != 0) && artCarId(cell + ivec2(x, y)) == id && heldGlint(cell + ivec2(x, y))) { flagged = false; break; }
    }
  }
  if (flagged && haze < .6 && far < .5 && feature == 0 && lch.x > .42) {
    int entry = lch.x > .62 ? carGlints.x : lch.y > .07 && abs(hueArc(lch.z, .45)) < .5 ? carGlints.z : carGlints.y;
    if (entryLab(entry).x > lch.x + .04) {
      outImage = entryTexel(entry);
      outMarks = vec4(prior.r, .6, prior.b, 1.);
      return;
    }
  }

  // Interior lines from colour structure: a strong lightness or hue step to a
  // neighbour of the same car puts a dark line on the darker side (window
  // frames, bumper and stripe edges). Steps are judged before carPaint, so
  // flattened highlight bands draw no ink.
  // Refine round 3: judged on the painted paint (edge-preserving smoothing,
  // and reprojected accumulation when temporalAccumulate runs), except where
  // a distant car's two tones blend in (their split is no panel edge).
  steadyEdges = carEdgeSteady > .5 && far <= 0.;
  vec3 lab = edgeLab(cell);
  // Distant cars are flat livery with their outline: interior lines on a car
  // a dozen cells wide are noise, not drawing.
  if (emitter || haze >= 1. || far >= .5 || lab.x < carEdge.w) return;
  // Glass keeps the interior as soft shapes: only its frame is inked.
  bool glass = feature == 3 && sourceLab(cell).x < carGlassMax;
  float edge = 0.;
  for (int k = 0; k < 4; k++) {
    ivec2 other = cell + STEPS[k];
    if (artCarId(other) != id) continue;
    vec3 o = edgeLab(other);
    if (glass && artCarFeature(other) == 3 && sourceLab(other).x < carGlassMax) continue;
    float rise = o.x - lab.x;
    if (rise <= .02) continue;
    // The brighter side must be a region, not a 1-cell stroke (decal
    // lettering, a lit trim line): those keep their own crisp strokes.
    vec3 beyond = edgeLab(cell + 2 * STEPS[k]);
    if (artCarId(cell + 2 * STEPS[k]) != id || beyond.x - lab.x < .5 * rise) continue;
    // Hue steps from the raw grade: the crimson ramp's lit and shaded reds
    // differ in chroma, and ink along those band edges followed the bands.
    edge = max(edge, max(smoothstep(carEdge.x, carEdge.y, rise),
      smoothstep(carEdge.z, carEdge.z * 1.6, length(sourceLab(other).yz - sourceLab(cell).yz))));
  }
  if (edge * (1. - haze) >= .5) {
    outImage = entryTexel(drawnIndex(darkLine(lch), index, false));
    outMarks = vec4(.8, prior.g, prior.b, 1.);
    return;
  }
  // The lit top edge of a panel under a darker one (the boot lid under the
  // rear window, the bumper under the lamps) catches a bright line: the
  // cutscenes pair the dark frame line with a lit edge below it. Only where
  // the edge is actually lit (carEdgeLit) and faces up or out, never on a
  // bumper's underside, and warm: a lit edge catches the amber lamps or the
  // sun, never the moon's lavender (refine round 2).
  // A lone cell that passes is a dot, not an edge: the line needs a
  // neighbour along it that passes too.
  if (haze > .6 || data.x > carFar.w || texelFetch(normals, cell, 0).y < -.3) return;
  if (!litPanelEdge(cell, id) || !(litPanelEdge(cell + ivec2(1, 0), id) || litPanelEdge(cell - ivec2(1, 0), id))) return;
  if (carRim.z < 1. && anchoredHash(cell, data, 3., 13) >= carRim.z) return;
  outImage = entryTexel(drawnIndex(brightLine(smoothLch, 1.4), index, true));
  outMarks = vec4(prior.r, .8, prior.b, 1.);
}`;

export interface Cars {
  /** carMask (after normals), carPaint (after grade), carLines (after lines). */
  readonly stages: { readonly mask: PixelArtStage; readonly paint: PixelArtStage; readonly lines: PixelArtStage };
  /** Car options plus the linework emitter threshold (lamps are never inked or smoothed). */
  configure(options: CarOptions & { emitterThreshold: number }): void;
  /** Livery colour (sRGB hex) of a mover slot; cached, so calling it every frame costs a string compare. */
  setMoverColour(slot: number, hex: string): void;
}

export interface CarDependencies {
  /** Mover slots of the surface stage (boxes and transforms). */
  movers: MoverSlots;
  /** Grade exposure (shared by reference), for lamp thresholds. */
  exposure: THREE.IUniform<number>;
  /** The key light uniforms the lines stage refreshes, and its car handoff switch. */
  key: {
    keyLightDirection: THREE.IUniform<THREE.Vector3>;
    keyLight: THREE.IUniform<THREE.Vector2>;
    keyLightScreen: THREE.IUniform<THREE.Vector3>;
    lineSkipCars: THREE.IUniform<number>;
  };
  /** The quantize stage's band uniforms (carBandStreaks). */
  band: Record<string, THREE.IUniform>;
}

export function createCars(shared: PixelArtSharedUniforms, palette: PixelPalette, deps: CarDependencies): Cars {
  const entry = (hex: string) => nearestPaletteIndex(palette, hex);
  const directTarget = artTarget(THREE.UnsignedByteType, 'SORA pixel-art car ids (direct)');
  const maskTarget = artTarget(THREE.UnsignedByteType, 'SORA pixel-art car mask');
  const paintTarget = artTarget(THREE.HalfFloatType, 'SORA pixel-art car paint');
  const linesTarget = artTarget(THREE.UnsignedByteType, 'SORA pixel-art car lines', 2);
  // One texel per mover slot, ping-ponged: each distant car's tone pair.
  const toneTargets = [artTarget(THREE.UnsignedByteType, 'SORA pixel-art car tone A'),
    artTarget(THREE.UnsignedByteType, 'SORA pixel-art car tone B')] as const;
  for (const target of toneTargets) target.setSize(MAX_MOVERS, 1);
  let toneIndex = 0, toneFrame = -2, paintFrame = 0;
  const { movers } = deps;

  const boxes = {
    moverMin: { value: movers.min }, moverMax: { value: movers.max }, moverToLocal: { value: movers.toLocal },
    carPad: { value: new THREE.Vector2() },
  };
  const features = createCarFeatures(movers);
  const maskUniforms = {
    ...boxes, carDirect: { value: directTarget.texture }, carReach: { value: new THREE.Vector2(40, 20) },
    carPlateMin: { value: features.plateMin }, carPlateMax: { value: features.plateMax },
    carTailMin: { value: features.tailMin }, carTailMax: { value: features.tailMax },
    carCabinMin: { value: features.cabinMin }, carCabinMax: { value: features.cabinMax },
  };
  const carFar = { value: new THREE.Vector4(28, 42, 0.1, 22) };
  const paintUniforms = {
    carGradedIn: { value: null as THREE.Texture | null }, carExposure: deps.exposure, carEmitter: { value: 0.9 },
    carSmooth: { value: new THREE.Vector2() }, carLobe: { value: new THREE.Vector3() }, carCrimson: { value: 1 },
    carGlass: { value: new THREE.Vector4() },
    carLivery: { value: Array.from({ length: MAX_MOVERS }, () => new THREE.Vector4()) },
    carRamp: { value: new Array<number>(MAX_MOVERS * CAR_RAMP_STEPS).fill(0) },
    carFar, carHueLock: { value: 0 },
    carTone: { value: toneTargets[0].texture as THREE.Texture }, moverMin: { value: movers.min }, moverMax: { value: movers.max },
    carSplit: { value: 0.5 },
  };
  // Refine round 3: each car's held plate rectangle in cells, and its plate's view depth.
  const plateRect = { value: Array.from({ length: MAX_MOVERS }, () => new THREE.Vector4()) };
  const plateState = { value: Array.from({ length: MAX_MOVERS }, () => new THREE.Vector4()) };
  const plateRamp = { value: CAR_COLOURS.plateRamp.map(entry) };
  const toneUniforms = {
    carLivery: paintUniforms.carLivery, carRamp: paintUniforms.carRamp, carFar, carGradedIn: paintUniforms.carGradedIn,
    carScreen: { value: Array.from({ length: MAX_MOVERS }, () => new THREE.Vector4(1, 1, 0, 0)) },
    carTonePrevious: { value: toneTargets[1].texture as THREE.Texture }, carToneValid: { value: 0 },
    carPlateRect: plateRect, carPlateState: plateState, carPlateRamp: plateRamp, carPlateStepHold: { value: 0.03 },
  };
  const boxCorner = new THREE.Vector3(), boxClip = new THREE.Vector4(), boxViewProjection = new THREE.Matrix4();
  /** Each car's local box on screen, in art cells (allocation-free). */
  const projectCarBoxes = (frame: PixelArtFrame) => {
    const size = frame.uniforms.artSize.value;
    boxViewProjection.multiplyMatrices(frame.camera.projectionMatrix, frame.camera.matrixWorldInverse);
    for (let i = 0; i < MAX_MOVERS; i++) {
      const out = toneUniforms.carScreen.value[i]!, object = movers.objects[i];
      out.set(1, 1, 0, 0);
      if (!object || movers.max[i]!.w < 0.5) continue;
      const lo = movers.min[i]!, hi = movers.max[i]!;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ok = true;
      for (let c = 0; c < 8 && ok; c++) {
        boxCorner.set(c & 1 ? hi.x : lo.x, c & 2 ? hi.y : lo.y, c & 4 ? hi.z : lo.z).applyMatrix4(object.matrixWorld);
        boxClip.set(boxCorner.x, boxCorner.y, boxCorner.z, 1).applyMatrix4(boxViewProjection);
        if (boxClip.w <= 0.2) { ok = false; break; }
        const x = (boxClip.x / boxClip.w * 0.5 + 0.5) * size.x, y = (boxClip.y / boxClip.w * 0.5 + 0.5) * size.y;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      if (ok && x1 > -4 && x0 < size.x + 4 && y1 > -4 && y0 < size.y + 4) out.set(x0, y0, x1, y1);
    }
  };
  const liveryHex: (string | null)[] = new Array(MAX_MOVERS).fill(null);
  const linesUniforms = {
    lineExposure: deps.exposure,
    keyLightDirection: deps.key.keyLightDirection, keyLight: deps.key.keyLight, keyLightScreen: deps.key.keyLightScreen,
    carEmitter: { value: 0.9 }, carEdge: { value: new THREE.Vector4() }, carHaze: { value: new THREE.Vector2() },
    carRim: { value: new THREE.Vector3() }, carEdgeLit: { value: 0.5 }, carGradedSource: { value: null as THREE.Texture | null }, carPaintOn: { value: 0 },
    carGlassMax: { value: 0.32 }, carPlateRamp: plateRamp,
    carGlints: { value: new THREE.Vector4(entry(CAR_COLOURS.glintCream), entry(CAR_COLOURS.glintGold), entry(CAR_COLOURS.glintPeach), 0) },
    carFar, carLampRed: { value: entry(CAR_COLOURS.lampRed) },
    carTail: { value: Array.from({ length: MAX_MOVERS }, () => new THREE.Vector4()) },
    carTailState: { value: Array.from({ length: MAX_MOVERS }, () => new THREE.Vector4()) },
    carTailMin: { value: features.tailMin }, carTailMax: { value: features.tailMax },
    carLampTones: { value: [...CAR_COLOURS.lampTones.red, ...CAR_COLOURS.lampTones.amber, ...CAR_COLOURS.lampTones.pale].map(entry) },
    carLampFlat: { value: 1 }, carPlateRect: plateRect, carPlateState: plateState,
    carTone: { value: toneTargets[0].texture as THREE.Texture }, carToneReady: { value: 0 }, carEdgeSteady: { value: 1 },
  };
  let taillightsOn = true;
  const tailLocal = new THREE.Vector3(), tailWorld = new THREE.Vector3(), tailClip = new THREE.Vector4();
  const tailNormal = new THREE.Vector3(), cameraPosition = new THREE.Vector3(), tailViewProjection = new THREE.Matrix4();
  /** Projects each car's taillight pair (the TailightFrame box halves) into art cells, once per frame. */
  const projectTaillights = (frame: PixelArtFrame) => {
    const size = frame.uniforms.artSize.value;
    tailViewProjection.multiplyMatrices(frame.camera.projectionMatrix, frame.camera.matrixWorldInverse);
    cameraPosition.setFromMatrixPosition(frame.camera.matrixWorld);
    for (let i = 0; i < MAX_MOVERS; i++) {
      const state = linesUniforms.carTailState.value[i]!, tail = linesUniforms.carTail.value[i]!;
      const object = movers.objects[i], lo = features.tailMin[i]!, hi = features.tailMax[i]!;
      state.set(0, 0, 0, 0);
      if (!taillightsOn || !object || movers.max[i]!.w < 0.5 || lo.w < 0.5) continue;
      // The rear face is the box's z extreme farther from the car's origin.
      const rear = Math.abs(lo.z) > Math.abs(hi.z) ? lo.z : hi.z;
      const y = 0.5 * (lo.y + hi.y), inset = 0.18 * (hi.x - lo.x);
      tailNormal.set(0, 0, Math.sign(rear) || 1).transformDirection(object.matrixWorld);
      let depth = 0, ok = true;
      for (let side = 0; side < 2 && ok; side++) {
        tailLocal.set(side === 0 ? lo.x + inset : hi.x - inset, y, rear);
        tailWorld.copy(tailLocal).applyMatrix4(object.matrixWorld);
        if (side === 0 && tailNormal.x * (cameraPosition.x - tailWorld.x) + tailNormal.y * (cameraPosition.y - tailWorld.y)
          + tailNormal.z * (cameraPosition.z - tailWorld.z) <= 0) { ok = false; break; }
        tailClip.set(tailWorld.x, tailWorld.y, tailWorld.z, 1).applyMatrix4(tailViewProjection);
        if (tailClip.w <= 0.2) { ok = false; break; }
        const x = (tailClip.x / tailClip.w * 0.5 + 0.5) * size.x, yy = (tailClip.y / tailClip.w * 0.5 + 0.5) * size.y;
        if (side === 0) tail.set(x, yy, tail.z, tail.w); else tail.set(tail.x, tail.y, x, yy);
        depth += 0.5 * tailClip.w;
      }
      if (ok) state.set(depth, 1, 0, 0);
    }
  };
  let platesOn = true;
  const plateHeld = new Float32Array(MAX_MOVERS * 4), plateKnown = new Uint8Array(MAX_MOVERS);
  const plateCorner = new THREE.Vector3(), plateClip = new THREE.Vector4(), plateNormal = new THREE.Vector3();
  /**
   * Each car's rear plate as a rectangle of whole cells (refine round 3): the
   * LicensePlate box's rear face projected into cells, each edge held until
   * the projection leaves it by 0.75 cell, so the plate keeps its shape under
   * sub-cell motion. Allocation-free; after the mover slots updated.
   */
  const projectPlates = (frame: PixelArtFrame) => {
    const size = frame.uniforms.artSize.value;
    tailViewProjection.multiplyMatrices(frame.camera.projectionMatrix, frame.camera.matrixWorldInverse);
    cameraPosition.setFromMatrixPosition(frame.camera.matrixWorld);
    for (let i = 0; i < MAX_MOVERS; i++) {
      const rect = plateRect.value[i]!, state = plateState.value[i]!;
      const object = movers.objects[i], lo = features.plateMin[i]!, hi = features.plateMax[i]!;
      let ok = platesOn && !!object && movers.max[i]!.w > 0.5 && lo.w > 0.5;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, depth = 0;
      if (ok) {
        const rear = Math.abs(lo.z) > Math.abs(hi.z) ? lo.z : hi.z;
        plateNormal.set(0, 0, Math.sign(rear) || 1).transformDirection(object!.matrixWorld);
        for (let c = 0; c < 4 && ok; c++) {
          // The feature mask's 5 cm reach around the plate box (its round-2 size).
          plateCorner.set(c & 1 ? hi.x + 0.05 : lo.x - 0.05, c & 2 ? hi.y + 0.05 : lo.y - 0.05, rear).applyMatrix4(object!.matrixWorld);
          if (c === 0 && plateNormal.x * (cameraPosition.x - plateCorner.x) + plateNormal.y * (cameraPosition.y - plateCorner.y)
            + plateNormal.z * (cameraPosition.z - plateCorner.z) <= 0) { ok = false; break; }
          plateClip.set(plateCorner.x, plateCorner.y, plateCorner.z, 1).applyMatrix4(tailViewProjection);
          if (plateClip.w <= 0.2) { ok = false; break; }
          const x = (plateClip.x / plateClip.w * 0.5 + 0.5) * size.x, y = (plateClip.y / plateClip.w * 0.5 + 0.5) * size.y;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          depth += 0.25 * plateClip.w;
        }
        // Half a cell of frame on every side, as the feature mask grows the
        // plate box (the plate keeps its round-2 size); too small to draw as a
        // rectangle (a distant car) or off screen: none.
        x0 -= 0.5; y0 -= 0.5; x1 += 0.5; y1 += 0.5;
        ok = ok && x1 - x0 >= 2 && y1 - y0 >= 1.5 && x1 > 0 && y1 > 0 && x0 < size.x && y0 < size.y;
      }
      if (!ok) { plateKnown[i] = 0; rect.set(0, 0, 0, 0); state.set(0, 0, 0, 0); continue; }
      const b = i * 4, fresh = !plateKnown[i];
      if (fresh || Math.abs(x0 - plateHeld[b]!) > 0.75) plateHeld[b] = Math.round(x0);
      if (fresh || Math.abs(y0 - plateHeld[b + 1]!) > 0.75) plateHeld[b + 1] = Math.round(y0);
      if (fresh || Math.abs(x1 - plateHeld[b + 2]!) > 0.75) plateHeld[b + 2] = Math.round(x1);
      if (fresh || Math.abs(y1 - plateHeld[b + 3]!) > 0.75) plateHeld[b + 3] = Math.round(y1);
      if (plateHeld[b + 2]! <= plateHeld[b]!) plateHeld[b + 2] = plateHeld[b]! + 1;
      if (plateHeld[b + 3]! <= plateHeld[b + 1]!) plateHeld[b + 3] = plateHeld[b + 1]! + 1;
      plateKnown[i] = 1;
      rect.set(plateHeld[b]!, plateHeld[b + 1]!, plateHeld[b + 2]!, plateHeld[b + 3]!);
      state.set(depth, 1, 0, 0);
    }
  };
  const directMaterial = stageMaterial('SORA pixel-art car ids', shared, MASK_DIRECT_FRAGMENT, boxes);
  const maskMaterial = stageMaterial('SORA pixel-art car mask', shared, MASK_FRAGMENT, maskUniforms);
  const paintMaterial = stageMaterial('SORA pixel-art car paint', shared, PAINT_FRAGMENT, paintUniforms);
  const toneMaterial = stageMaterial('SORA pixel-art car tone', shared, TONE_FRAGMENT, toneUniforms);
  const linesMaterial = stageMaterial('SORA pixel-art car lines', shared, LINES_FRAGMENT, linesUniforms);
  let glassReach = CAR_DEFAULTS.carGlassReach;
  let paintRan = false;

  const mask: PixelArtStage = {
    name: 'carMask', enabled: true,
    setSize(grid: PixelArtGrid) {
      for (const target of [directTarget, maskTarget, paintTarget, linesTarget]) target.setSize(grid.artWidth, grid.artHeight);
      const scale = grid.artHeight / 315;
      maskUniforms.carReach.value.set(Math.max(4, Math.round(glassReach * scale)), Math.max(2, Math.round(glassReach * 0.5 * scale)));
    },
    beginFrame() { shared.artCarsReady.value = 0; paintRan = false; },
    render(frame: PixelArtFrame) {
      features.update();
      projectPlates(frame);
      frame.draw(directMaterial, directTarget);
      frame.draw(maskMaterial, maskTarget);
      shared.cars.value = maskTarget.texture;
      shared.artCarsReady.value = 1;
    },
    dispose() {
      directMaterial.dispose(); maskMaterial.dispose();
      for (const target of [directTarget, maskTarget, paintTarget, linesTarget]) target.dispose();
    },
  };
  const paint: PixelArtStage = {
    name: 'carPaint', enabled: true,
    setSize() { /* sized by the mask stage */ },
    render(frame) {
      if (shared.artCarsReady.value < 0.5) return;
      paintUniforms.carGradedIn.value = frame.uniforms.graded.value;
      // Distant cars' tone pairs, one per car, against last frame's.
      paintFrame++;
      projectCarBoxes(frame);
      const write = toneTargets[toneIndex], read = toneTargets[1 - toneIndex];
      toneUniforms.carTonePrevious.value = read.texture;
      toneUniforms.carToneValid.value = toneFrame === paintFrame - 1 ? 1 : 0;
      frame.draw(toneMaterial, write);
      paintUniforms.carTone.value = write.texture;
      toneIndex = 1 - toneIndex;
      toneFrame = paintFrame;
      frame.draw(paintMaterial, paintTarget);
      frame.uniforms.graded.value = paintTarget.texture;
      paintRan = true;
    },
    dispose() { paintMaterial.dispose(); toneMaterial.dispose(); for (const target of toneTargets) target.dispose(); },
  };
  const lines: PixelArtStage = {
    name: 'carLines', enabled: true,
    setSize() { /* sized by the mask stage */ },
    render(frame) {
      if (shared.artCarsReady.value < 0.5) return;
      projectTaillights(frame);
      // Material edges are judged on the grade before carPaint flattened it;
      // carPaint's glint flags (graded alpha) exist only when it ran.
      linesUniforms.carGradedSource.value = paintRan ? paintUniforms.carGradedIn.value : frame.uniforms.graded.value;
      linesUniforms.carPaintOn.value = paintRan ? 1 : 0;
      // The tone pass (carPaint) wrote this frame's held plate steps.
      linesUniforms.carTone.value = paintUniforms.carTone.value;
      linesUniforms.carToneReady.value = paintRan ? 1 : 0;
      frame.draw(linesMaterial, linesTarget);
      frame.uniforms.image.value = linesTarget.textures[0]!;
      frame.uniforms.marks.value = linesTarget.textures[1]!;
    },
    dispose() { linesMaterial.dispose(); },
  };

  return {
    stages: { mask, paint, lines },
    configure(o) {
      mask.enabled = o.carMask > 0;
      paint.enabled = mask.enabled && o.carPaint > 0;
      lines.enabled = mask.enabled && o.carLines > 0;
      deps.key.lineSkipCars.value = lines.enabled ? 1 : 0;
      boxes.carPad.value.set(Math.max(0, o.carPadMetres), Math.max(0, o.carPadCells));
      if (o.carGlassReach !== glassReach) {
        glassReach = Math.max(1, o.carGlassReach);
        const size = maskTarget.height;
        if (size > 1) {
          const scale = size / 315;
          maskUniforms.carReach.value.set(Math.max(4, Math.round(glassReach * scale)), Math.max(2, Math.round(glassReach * 0.5 * scale)));
        }
      }
      // A negative amplitude leaves the band field on car cells untouched (glsl.ts).
      (deps.band.carBandStreaks!.value as THREE.Vector3).set(o.carBand > 0 ? Math.max(0, o.carStreakAmount) : -1,
        o.carStreakStart, Math.max(o.carStreakFull, o.carStreakStart + 1e-3));
      paintUniforms.carSmooth.value.set(o.carSmoothL, o.carSmoothAB);
      paintUniforms.carLobe.value.set(o.carLobeKnee, THREE.MathUtils.clamp(o.carLobeKeep, 0, 1), o.carGlintRise);
      paintUniforms.carCrimson.value = o.carCrimson;
      paintUniforms.carGlass.value.set(o.carGlassFloor, o.carGlassKeep, o.carGlassChroma, o.carGlassMax);
      linesUniforms.carGlassMax.value = o.carGlassMax;
      paintUniforms.carEmitter.value = linesUniforms.carEmitter.value = o.emitterThreshold;
      linesUniforms.carEdge.value.set(o.carEdgeStart, Math.max(o.carEdgeFull, o.carEdgeStart + 1e-3), o.carEdgeAB, o.carEdgeMinFill);
      linesUniforms.carHaze.value.set(o.carHazeStart, Math.max(o.carHazeEnd, o.carHazeStart + 1));
      linesUniforms.carRim.value.set(o.carRimKeep, o.carRimMinFill, o.carEdgeBeadKeep);
      linesUniforms.carEdgeLit.value = o.carEdgeLit;
      carFar.value.set(o.carFarStart, Math.max(o.carFarStart + 1, o.carFarFull), Math.max(0, o.carFarContrast), Math.max(0, o.carMarksFar));
      paintUniforms.carHueLock.value = Math.max(0, o.carHueLock) * Math.PI / 180;
      taillightsOn = o.carTaillights > 0;
      platesOn = o.carPlateHold > 0;
      toneUniforms.carPlateStepHold.value = platesOn ? Math.max(0, o.carPlateStepHold) : -1;
      linesUniforms.carLampFlat.value = o.carLampFlat > 0 ? 1 : 0;
      linesUniforms.carEdgeSteady.value = o.carEdgeSteady > 0 ? 1 : 0;
      (deps.band.carFarBand!.value as THREE.Vector2).set(o.carFarStart, Math.max(o.carFarStart + 1, o.carFarFull));
    },
    setMoverColour(slot, hex) {
      if (!(slot >= 0 && slot < MAX_MOVERS) || liveryHex[slot] === hex) return;
      liveryHex[slot] = hex;
      const livery = paintUniforms.carLivery.value[slot]!;
      const ramp = typeof hex === 'string' ? liveryRampFor(palette, hex) : null;
      if (!ramp || ramp.length === 0) { livery.w = 0; return; }
      const [L, a, b] = oklabFromHex(hex);
      livery.set(L, a, b, 1);
      for (let k = 0; k < CAR_RAMP_STEPS; k++) paintUniforms.carRamp.value[slot * CAR_RAMP_STEPS + k] = ramp[Math.min(k, ramp.length - 1)]!;
    },
  };
}

/**
 * Lamp and plate boxes of each mover slot in the car's own frame, measured
 * once per object from the model's named meshes ('LicensePlate',
 * 'TailightFrame' and the 'Windows' glazing, whose box is the cabin, in the
 * detailed AE86). Models without them (the procedural fleet) get none, and
 * are drawn from colour structure alone.
 */
export function createCarFeatures(movers: MoverSlots) {
  const slots = () => Array.from({ length: MAX_MOVERS }, () => new THREE.Vector4());
  const plateMin = slots(), plateMax = slots(), tailMin = slots(), tailMax = slots(), cabinMin = slots(), cabinMax = slots();
  const known = new WeakMap<THREE.Object3D, { plate: THREE.Box3 | null; tail: THREE.Box3 | null; cabin: THREE.Box3 | null }>();
  const names = ['LicensePlate', 'TailightFrame', 'Windows'];
  const inverse = new THREE.Matrix4(), relative = new THREE.Matrix4(), box = new THREE.Box3();
  const measure = (object: THREE.Object3D) => {
    let entry = known.get(object);
    if (entry) return entry;
    const plate = new THREE.Box3(), tail = new THREE.Box3(), cabin = new THREE.Box3();
    inverse.copy(object.matrixWorld).invert();
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const name = materials.map(material => material?.name ?? '').find(n => names.includes(n));
      if (!name) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.copy(mesh.geometry.boundingBox!).applyMatrix4(relative.multiplyMatrices(inverse, mesh.matrixWorld));
      (name === 'LicensePlate' ? plate : name === 'Windows' ? cabin : tail).union(box);
    });
    entry = { plate: plate.isEmpty() ? null : plate, tail: tail.isEmpty() ? null : tail, cabin: cabin.isEmpty() ? null : cabin };
    known.set(object, entry);
    return entry;
  };
  const write = (min: THREE.Vector4, max: THREE.Vector4, from: THREE.Box3 | null) => {
    if (!from) { min.w = max.w = 0; return; }
    min.set(from.min.x, from.min.y, from.min.z, 1); max.set(from.max.x, from.max.y, from.max.z, 1);
  };
  return {
    plateMin, plateMax, tailMin, tailMax, cabinMin, cabinMax,
    /** After the mover slots updated this frame (matrixWorld current). */
    update() {
      for (let i = 0; i < MAX_MOVERS; i++) {
        const object = movers.objects[i];
        const entry = object && movers.max[i]!.w > 0.5 ? measure(object) : null;
        write(plateMin[i]!, plateMax[i]!, entry?.plate ?? null);
        write(tailMin[i]!, tailMax[i]!, entry?.tail ?? null);
        write(cabinMin[i]!, cabinMax[i]!, entry?.cabin ?? null);
      }
    },
  };
}
