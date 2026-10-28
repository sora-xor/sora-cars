import * as THREE from 'three';
import type { PixelArtGrid } from './grid';
import { oklabFromHex, type PixelPalette } from './palette';
import type { LampHeads } from './surfaces';
import {
  artTarget, PIXEL_ART_LUT_ADDRESS, stageMaterial,
  type PixelArtFrame, type PixelArtSharedUniforms, type PixelArtStage,
} from './stages';

/**
 * Linework stages of the pixel-art renderer (docs/pixel-art-renderer.md,
 * "Implementation notes: linework"). They run on the paletted art image after
 * quantize, in this order:
 *
 *   lines   - colour-aware 1-cell silhouette lines on the nearer side of depth
 *             discontinuities, beaded bright rims on lit silhouettes, sparse
 *             interior creases from normal discontinuities;
 *   glints  - 3x3 non-maximum-suppressed single-cell speculars (cream/amber),
 *             short horizontal streaks where a row of cells peaks together;
 *   glow    - cell-space halo replacing bloom: emitter cells grow quantised
 *             rings through rose/plum toward the local background;
 *   cleanup - isolated cells that are no mark take their neighbours' majority.
 *
 * Every derived colour is snapped back through the palette LUT, so the image
 * stays palette-exact. Marks travel in the shared `marks` texture next to
 * `image` (RGBA8; a channel above 0.5 is a mark):
 *   r: 1 silhouette line, 0.8 interior crease;
 *   g: 1 rim, 0.8 bright ridge bead, 0.6 glint;
 *   b: 1 emitter (lamp core, lit panel), 0.6 halo.
 * Every decision is geometric or uses the smooth graded lightness, never the
 * quantized fill, so choices along an edge do not flicker cell by cell.
 */
export interface LineworkOptions {
  /** 1 draws the stage, 0 skips it. */
  lines: number;
  glints: number;
  glow: number;
  cleanup: number;
  /**
   * Foliage mass (refine round 1; surfaces.ts flags foliage cells): a
   * background cell with at least foliageFill of its 8 neighbours canopy in
   * front of it takes the darkest of them (sky holes and lace close up), and
   * under a warm key foliageGlint of the canopy edges facing the key or the
   * sky take 1-2-cell amber/gold leaf glints (nearer than foliageGlintFar m).
   */
  foliage: number;
  foliageFill: number;
  foliageGlint: number;
  foliageGlintFar: number;
  /** Refine round 2: an interior canopy cell this much lighter (OKLab L) than the canopy around it takes the canopy's common entry (0 off). */
  foliageCalm: number;
  /** Relative inverse-depth jump, beyond the planar trend, where silhouettes start and are full. */
  lineGapStart: number;
  lineGapFull: number;
  /** The same jump in metres must also exceed this, so lamp recesses and panel steps near the camera stay clean. */
  lineGapMetres: number;
  /** A top edge must stand this many metres above what lies beyond it; ground-level steps (kerbs) take no marks. */
  lineStepHeight: number;
  /** View depths (m) over which lines fade out; nothing is outlined beyond the end. */
  lineFadeStart: number;
  lineFadeEnd: number;
  /** Fill lightness (OKLab L) below which a silhouette is carried by value alone (no dark line). */
  lineMinFill: number;
  /** Exposure-scaled HDR luminance of a glow emitter (never glinted); 1.5x this is never inked. */
  emitterThreshold: number;
  /** Fraction of rim cells kept along a lit edge (the rest keep their fill: beads). */
  rimBeadKeep: number;
  /** Bead lattice size in cells: 1 gives single-cell beads, 2-3 short dashes. */
  rimBeadCells: number;
  /** Refine round 2: a silhouette must stay one surface this many cells inward to take a rim (thin rails keep their lit face). */
  rimThinCells: number;
  /** Minimum fill lightness of a silhouette that takes a rim. */
  rimMinFill: number;
  /** Alignment of a silhouette's outward direction with the key light in the image plane where the key rim starts and is full. */
  rimKeyStart: number;
  rimKeyFull: number;
  /** Refine round 3: 1 keeps ink (silhouettes, creases) off canopy cells, which read by clump tones (0 off). */
  lineSkipCanopy: number;
  /** Minimum angle (degrees) between neighbouring normals that makes an interior crease. */
  creaseAngle: number;
  /** Creases are drawn only nearer than this view depth (m). */
  creaseFadeEnd: number;
  /** Fraction of lit ridge cells that take a bright crease bead. */
  creaseBeadKeep: number;
  /** Minimum exposure-scaled peak sample luminance of a glint. */
  glintThreshold: number;
  /** Peak over the mean peak of the 8 neighbours needed for a glint (an isolated spike). */
  glintContrast: number;
  /** Horizontal neighbours suppress a glint only above peak / glintStreak (streaks). */
  glintStreak: number;
  /** Glints are drawn only nearer than this view depth (m). */
  glintFadeEnd: number;
  /** On cars, glints only nearer than this (m): farther a car is too small to carry one (sub-cell sparkle). */
  glintCarFadeEnd: number;
  /** Temporal hysteresis: a surface that carried a glint last frame keeps it at this fraction of every threshold. */
  glintHold: number;
  /** Halo radius in cells: base, per stop above the emitter threshold, per neighbouring emitter cell. */
  glowRadius: number;
  glowRadiusPerStop: number;
  glowRadiusPerCell: number;
  /** Largest halo radius in cells (at most GLOW_REACH). */
  glowMaxRadius: number;
  /** Emitter cells in a 5x5 window above which the emitter is a lit panel (keeps its detail, no halo). */
  glowPanelCells: number;
  /** An emitter is this many times brighter than the cells two and four away (lamps, not lit road pools). */
  glowContrast: number;
  /** Exposure-scaled surround luminance above which an emitter is a lit panel (no halo): halos are for lamps against the dark. */
  glowDarkSurround: number;
  /** Fraction of halo cells that drop one ring outward (speckled, broken rings). */
  glowSpeckle: number;
  /** OKLab lightness and chroma of the innermost halo ring. */
  glowLightness: number;
  glowChroma: number;
  /**
   * Analytic lamp heads (refine rounds 1 and 2): every street-lamp lens passed
   * to the ground stage (setGroundEmitters) is drawn while it is visible (one
   * decision per lamp, with hysteresis) as a flat, stair-stepped cream ellipse
   * about twice as wide as tall (half-width lampHeadSize metres, 0.5-3 cells)
   * with a 1-cell amber rim at its ends, held on whole cells, seeding a halo of
   * lampHeadHalo cells (+ lampHeadHaloNear for near lamps) whatever the HDR
   * threshold says, lampHeadSquash times wider than tall. 0 turns it off.
   */
  lampHeads: number;
  lampHeadSize: number;
  lampHeadHalo: number;
  lampHeadHaloNear: number;
  /** Width over height of a lamp head's halo (refine round 2: the cutscene lamps' halos are wider than tall). */
  lampHeadSquash: number;
  /** Fraction of isolated cells kept as intentional single-cell speckle. */
  cleanupKeep: number;
  /** OKLab distance under which two palette entries count as one colour when judging isolation. */
  cleanupSimilar: number;
  /** Refine round 2: 1 connects 1-cell gaps in lines and drops lone ink dots (dotted diagonals). */
  inkCleanup: number;
  /**
   * Refine round 3: ink fragments with fewer than this many ink cells within
   * 2 cells of them (itself excluded) are dropped, and knight's-move gaps are
   * bridged as well as straight ones (connect or drop; 0 keeps round 2).
   */
  inkRunCells: number;
  /**
   * Refine round 3, glint twinkle: a glint candidate is drawn only when the
   * temporal history shows a candidate at or next to its reprojected cell last
   * frame (two-frame confirmation; candidates are marked g 0.55 without being
   * drawn). 0 draws candidates at once.
   */
  glintConfirm: number;
  /**
   * Refine round 3, sunlit rails: a candidate whose surroundings stay at least
   * glintRidgeKeep of its peak on every ring out to glintRidgeCells cells is a
   * lit bar or ridge (drawn by the lighting as a solid bar), not a point: no
   * glint (0 off).
   */
  glintRidgeCells: number;
  glintRidgeKeep: number;
  /**
   * Refine round 3, false glow orbs and halo re-rolls: 1 = car cells never
   * seed an HDR emitter (car lamps are drawn by cars.ts; wheel and paint
   * speculars are glints), a new emitter waits one frame before it glows (it
   * must persist at its reprojected cell), the emitter decision, its panel
   * flag and its radius hold with hysteresis, halo rings are coloured by their
   * distance in cells (a radius step changes the last ring only) and the
   * speckle is keyed to the emitter's world anchor. 0 keeps round 2.
   */
  glowStable: number;
  /** Half-angle (deg) around the key light's mirror direction inside which a bright cell is the key's specular (sun glare on a kerb), not a lamp (0 off). */
  glowKeySpecular: number;
  /**
   * Under a warm key (dusk, sunrise) an HDR emitter needs 1 + glowKeyLift x
   * the key's strength times the emitter threshold (sun glare on a gutter
   * beside a dark rail post grew a lamp orb at sunrise; 0 off).
   */
  glowKeyLift: number;
  /** Cells over which a halo's colour ramp runs from the lamp colour to the background (with glowStable). */
  glowRampCells: number;
  /**
   * Refine round 3, far lamp rows: beyond lampHeadMid metres a street-lamp
   * head is a 2 x 1 cream core with a 1-cell ring, beyond lampHeadFar one
   * cell with a 1-cell tan ring (#ae8773), with lampHeadTierBand metres of
   * hysteresis; nearer heads shrink from 7 x 3 toward 3 x 1 as they approach
   * lampHeadMid. 0 turns the tiers off.
   */
  lampHeadMid: number;
  lampHeadFar: number;
  lampHeadTierBand: number;
  /**
   * Refine round 3, night foliage: dark canopies (local mean OKLab L below
   * foliageToneMax) are redrawn as world-anchored clumps of about
   * foliageToneCells cells in teal-navy, teal or olive palette tones one band
   * apart, the top cells of each clump a band lighter and the sky-side
   * silhouette a band lighter again; canopy within foliageLampReach metres of
   * a street lamp catches amber/gold glints on its lit clump tops (share
   * foliageLampGlint). The canopy mask is held with hysteresis (glow seed
   * pass). 0 turns the tones off.
   */
  foliageTones: number;
  foliageToneCells: number;
  foliageToneMax: number;
  foliageLampReach: number;
  foliageLampGlint: number;
  /**
   * Clump tones only nearer than this (m), thinning clump by clump from 0.7 x
   * it: a far crown is a few cells of sub-cell leaves, whose tones only
   * flickered (it keeps the render's dark mass); lamp-lit olive crowns only
   * nearer than 0.6 x it.
   */
  foliageToneFar: number;
  /** 1: the top cells of each clump take one step up (moonlit clump tops); 0: flat clumps. */
  foliageToneLift: number;
  /**
   * Refine round 3, perforated wires: thin geometry against the sky is drawn
   * as a continuous 1-cell stair line. A sky-owned cell that some nearer
   * geometry covers by at least wireCover (the resolve's sky fraction) and
   * that bridges two thin cells takes the darker one's colour; a 1-cell gap
   * in a straight thin run is closed; a lone partial speck is dropped (0 off).
   */
  wireConnect: number;
  wireCover: number;
}

export const LINEWORK_DEFAULTS: LineworkOptions = {
  lines: 1, glints: 1, glow: 1, cleanup: 1, foliage: 1, foliageFill: 5, foliageGlint: 0.35, foliageGlintFar: 90, foliageCalm: 0.12,
  lineGapStart: 0.03, lineGapFull: 0.08, lineGapMetres: 0.4, lineStepHeight: 0.35, lineFadeStart: 90, lineFadeEnd: 140, lineMinFill: 0.25,
  emitterThreshold: 0.9,
  // World rims are off (refine round 1, the user's "whatever looks cooler"):
  // on stair-stepped rails only the step corners pass the rim test, so a lit
  // rail read as a blinking string of fairy lights; without them the lighting
  // draws the rail as a solid lit bar, as garage-wide does. Car rims are
  // separate (carRimKeep).
  rimBeadKeep: 0, rimBeadCells: 3, rimThinCells: 8, rimMinFill: 0.35, rimKeyStart: 0.25, rimKeyFull: 0.6,
  creaseAngle: 50, creaseFadeEnd: 20, creaseBeadKeep: 0.7, lineSkipCanopy: 1,
  glintThreshold: 0.35, glintContrast: 1.35, glintStreak: 0.8, glintFadeEnd: 60, glintCarFadeEnd: 22, glintHold: 0.75,
  glowRadius: 3, glowRadiusPerStop: 1.5, glowRadiusPerCell: 0.25, glowMaxRadius: 8, glowPanelCells: 12, glowContrast: 2, glowDarkSurround: 0.3,
  glowSpeckle: 0.15,
  glowLightness: 0.76, glowChroma: 0.13,
  lampHeads: 1, lampHeadSize: 0.45, lampHeadHalo: 3.5, lampHeadHaloNear: 1.5, lampHeadSquash: 1.4,
  cleanupKeep: 0.2, cleanupSimilar: 0.08, inkCleanup: 1,
  // Refine round 3.
  inkRunCells: 2, glintConfirm: 1, glintRidgeCells: 3, glintRidgeKeep: 0.6,
  glowStable: 1, glowKeySpecular: 14, glowKeyLift: 1, glowRampCells: 5,
  lampHeadMid: 40, lampHeadFar: 80, lampHeadTierBand: 4,
  foliageTones: 1, foliageToneCells: 6, foliageToneMax: 0.3, foliageLampReach: 6, foliageLampGlint: 0.45, foliageToneFar: 45, foliageToneLift: 1,
  wireConnect: 1, wireCover: 0.2,
};

/** Largest halo radius the separable glow search covers, in cells. */
export const GLOW_REACH = 8;
/** Analytic lamp heads drawn per frame (the ground stage's emitters). */
export const MAX_LAMP_HEADS = 16;
/** Lamp-head slots (twice the heads, so a new lamp always finds one that was free last frame). */
export const LAMP_HEAD_SLOTS = 2 * MAX_LAMP_HEADS;
/** Cutscene lamp-head core (harbor-wide: a flat cream ellipse, #fefef8 / #fdf6e0). */
export const LAMP_HEAD_CORE = '#fbf5d2';
/** Leaf glints on lit canopy edges (sunrise-wide, community). */
export const FOLIAGE_GLINTS = { amber: '#fab55a', gold: '#fdd176' } as const;
/**
 * Refine round 3: canopy clump tones, dark to light, one palette band apart
 * (the style spec's night foliage masses #1d2239 / #292e4d / #313a1d and
 * garage-wide's dark teal trees): teal-navy, teal (the same darks, teal
 * lights) and olive (lamp-lit crowns, community-wide).
 */
export const FOLIAGE_TONES = {
  navy: ['#03040a', '#0a0d1d', '#161625', '#222239', '#2d3252'],
  teal: ['#03040a', '#0a0d1d', '#161625', '#22362d', '#36514a'],
  olive: ['#161112', '#1a1300', '#3f3900', '#666808', '#8b8b35'],
} as const;
/** Refine round 3: rings of collapsed far lamp heads (style spec: distant lamp #f4e9d9 -> #ae8773 -> background; harbour lamp #b47e5f, #714d49). */
export const LAMP_RING_COLOURS = { farRing: '#ae8675', midRing: '#be855e', midOuter: '#6d4635' } as const;
const STAGES = ['lines', 'glints', 'glow', 'cleanup', 'foliage'] as const;

/**
 * ?pixelLinework=off disables every linework stage; a comma list such as
 * ?pixelLinework=lines,glow keeps only those (A/B captures).
 */
export function lineworkOptionsFromQuery(search: string): Partial<LineworkOptions> {
  const value = new URLSearchParams(search).get('pixelLinework');
  if (value === null) return {};
  const enabled = new Set(value.split(',').map(name => name.trim()));
  return Object.fromEntries(STAGES.map(name => [name, enabled.has(name) ? 1 : 0]));
}

/** Palette entry nearest to a hex colour in OKLab (for the fixed glint and lamp colours). */
export function nearestPaletteIndex(palette: PixelPalette, hex: string): number {
  const [L, a, b] = oklabFromHex(hex);
  let best = 0, bestDistance = Infinity;
  for (let i = 0; i < palette.size; i++) {
    const d = (palette.oklab[i * 4]! - L) ** 2 + (palette.oklab[i * 4 + 1]! - a) ** 2 + (palette.oklab[i * 4 + 2]! - b) ** 2;
    if (d < bestDistance) { bestDistance = d; best = i; }
  }
  return best;
}

/** Measured cutscene glint and lamp colours (style spec: highlight and light-source rules). */
export const LINEWORK_COLOURS = {
  glintCream: '#fdf5d5', glintGold: '#fee59a', glintAmber: '#fdd176', glintPeach: '#f5c28d',
  lampCore: '#fee9ae', lampRim: '#fab55a', lampSmall: '#f4e9d9',
} as const;

/** Shared GLSL of the linework stages (also used by cars.ts); needs the `lineExposure` uniform. */
export const LINEWORK_COMMON = /* glsl */ `
${PIXEL_ART_LUT_ADDRESS}
uniform float lineExposure;
const float LINE_PI = 3.14159265;
const float HUE_AMBER = 1.30899694;    // 75 deg: lamps, rims, glints
const float HUE_VIOLET = 5.23598776;   // 300 deg: dark lines lean this way
const float HUE_LAVENDER = 5.14872129; // 295 deg: sky-facing rims
float hueArc(float from, float to) { return mod(to - from + LINE_PI, 2. * LINE_PI) - LINE_PI; }
float hueToward(float hue, float target, float amount) {
  float d = hueArc(hue, target);
  return hue + sign(d) * min(abs(d), amount);
}
vec3 lchOf(vec3 lab) {
  float chroma = length(lab.yz);
  return vec3(lab.x, chroma, chroma > 1e-5 ? atan(lab.z, lab.y) : HUE_VIOLET);
}
vec3 labOf(vec3 lch) { return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z)); }
int indexOf(vec4 texel) { return int(texel.a * 255. + .5); }
vec3 entryLab(int index) { return texelFetch(paletteLab, ivec2(index, 0), 0).xyz; }
vec4 entryTexel(int index) { return vec4(texelFetch(paletteColors, ivec2(index, 0), 0).rgb, float(index) / 255.); }
int snapToPalette(vec3 lab) { return int(texelFetch(paletteLut, lutTexel(lutNode(lab)), 0).r * 255. + .5); }
int rampNeighbour(int index, bool lighter) {
  vec4 ramp = texelFetch(paletteRamps, ivec2(index, 0), 0);
  return int((lighter ? ramp.y : ramp.x) * 255. + .5);
}
float cellLuminance(ivec2 cell) { return artLuminance(texelFetch(resolvedColor, artClamp(cell), 0).rgb) * lineExposure; }
/**
 * Stable hash in [0, 1) on a lattice about 'cells' art cells wide, anchored to
 * the surface (artAnchor: world position, a moving car's own frame) or, on the
 * sky, to the view direction. The lattice snaps to power-of-two sizes, so
 * marks slide with the world, and ride with the cars, instead of flickering
 * in screen space.
 */
float anchoredHash(ivec2 cell, vec4 data, float cells, int seed) {
  vec4 anchor = artAnchor(cell, data);
  bool sky = anchor.w < -.5;
  float size = (sky ? artCellWorldScale : artCellWorldSize(data.x)) * cells;
  float octave = floor(log2(max(size, 1e-6)) + .5);
  return artHash01(ivec3(floor(anchor.xyz / exp2(octave)))
    + ivec3(seed * 7919 + int(max(anchor.w, 0.)) * 131, int(octave) * 104729, seed * 1299709));
}
`;

/** Dark line and bright rim colours derived from a fill (after LINEWORK_COMMON; also used by cars.ts). */
export const LINE_COLOURS = /* glsl */ `
/**
 * Bright line: fill lifted (L x gain, C x ~1.8) and turned toward amber; the
 * lighter it gets, the further it turns (teal and blue paint catch amber and
 * cream on lit edges, as in the cutscenes, rather than a brighter cyan).
 */
vec3 brightLine(vec3 lch, float gain) {
  float L = min(max(lch.x * gain, lch.x + .1), .95);
  float turn = radians(mix(14., 80., smoothstep(.6, .88, L)));
  return vec3(L, clamp(lch.y * (gain * .5 + .9), .04, .14) * (1. - .45 * smoothstep(.8, .95, L)),
    lch.y < .02 ? HUE_AMBER : hueToward(lch.z, HUE_AMBER, turn));
}
vec3 darkLine(vec3 lch) {
  // Fill darkened ~45%, desaturated ~40%, hue turned ~10 deg toward violet.
  return lch.y < .02 ? vec3(lch.x * .56, .02, HUE_VIOLET)
    : vec3(lch.x * .56, lch.y * .6, hueToward(lch.z, HUE_VIOLET, radians(10.)));
}
int drawnIndex(vec3 lch, int index, bool lighter) {
  int drawn = snapToPalette(labOf(lch));
  return drawn == index ? rampNeighbour(index, lighter) : drawn;
}
`;

const LINES_FRAGMENT = /* glsl */ `
${LINEWORK_COMMON}
${LINE_COLOURS}
uniform float lineSkipCars; // 1: car cells belong to the car linework stage (cars.ts)
uniform float lineCanopy;   // 1: canopy cells take no ink (refine round 3)
uniform vec4 lineGap;       // x, y: relative jump start / full; z: min fill L; w: luminance never inked
uniform float lineGapMetres;
uniform float lineStepHeight; // m: a top edge must stand this much above what lies beyond it
uniform vec2 lineFade;      // m: fade start / end
uniform vec3 keyLightDirection;
uniform vec2 keyLight;      // x: strength, y: warmth (1 amber key, 0 cool key)
uniform vec3 keyLightScreen; // xy: key light direction in the image plane; z: strength of that projection
uniform vec4 rimParams;     // x: bead keep; y: min fill L; z, w: edge-toward-key start / full
uniform float rimBeadCells;
uniform float rimThin;      // cells inward a silhouette must stay one surface to take a rim
uniform vec4 creaseParams;  // x: cos of the crease angle; y: max depth (m); z: bright bead keep
layout(location = 0) out vec4 outImage;
layout(location = 1) out vec4 outMarks;

const ivec2 STEPS[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));

float inverseDepthAt(ivec2 cell) {
  vec4 data = texelFetch(resolvedData, artClamp(cell), 0);
  return data.w >= .5 ? -1. : 1. / max(data.x, 1e-4);
}
/**
 * Relative gap in inverse depth between this cell's surface and a
 * neighbour's, each continued as a plane (1/z is affine in screen space over a
 * plane, so receding roads and walls score zero at any slope). If the two
 * planes cross between the cell centres it is a crease, not a gap: zero.
 * Sky is -1.
 */
float depthJump(float wc, float wn, float wo, float wn2) {
  if (wn < 0.) return 1e3;
  float atNeighbour = (wo < 0. ? wc : 2. * wc - wo) - wn;
  float atCell = wc - (wn2 < 0. ? wn : 2. * wn - wn2);
  return atNeighbour * atCell <= 0. ? 0. : min(abs(atNeighbour), abs(atCell)) / wc;
}

void main() {
  ivec2 cell = artCell();
  vec4 current = texelFetch(image, cell, 0);
  vec4 prior = texelFetch(marks, cell, 0);
  outImage = current;
  outMarks = prior;
  // Lookups clamp at the image border, so the outer two cells have no real neighbours.
  if (any(lessThan(cell, ivec2(2))) || any(greaterThanEqual(cell, ivec2(artSize) - 2))) return;
  // Car silhouettes are drawn from the car mask by their own stage (cars.ts);
  // creases on car bodies stay here.
  bool carCell = lineSkipCars > .5 && artCarId(cell) > 0;
  vec4 data = texelFetch(resolvedData, cell, 0);
  if (data.w >= .5 || data.x >= lineFade.y) return;
  // Canopy (the surface stage's leaf flag) takes no ink (refine round 3):
  // leaf silhouettes put 1-cell dark dots all over the crowns, re-rolling
  // with every sub-cell shift; trees read by their clump tones and value.
  if (lineCanopy > .5 && artSurfaceReady > .5 && abs(texelFetch(anchors, cell, 0).w - .25) < .01) return;
  int index = indexOf(current);
  vec3 fill = entryLab(index);
  // Decisions use the smooth graded lightness: the quantized fill alternates
  // between neighbouring entries under the band offset and would make every
  // choice along an edge flicker cell by cell (dotted lines).
  float value = texelFetch(graded, cell, 0).x;
  // Emitters (lamp covers, lit signs) and near-white cells are never inked.
  if (cellLuminance(cell) > lineGap.w || value > .9) return;
  float wc = 1. / max(data.x, 1e-4);
  float near1[4], near2[4], near3[4];
  for (int k = 0; k < 4; k++) {
    near1[k] = inverseDepthAt(cell + STEPS[k]);
    near2[k] = inverseDepthAt(cell + 2 * STEPS[k]);
    near3[k] = inverseDepthAt(cell + 3 * STEPS[k]);
  }

  float silhouette = 0., skyward = 0.;
  vec2 outward = vec2(0.);
  int facing = 0, edges = 0;
  float thinLimit = 1. - lineGap.x;
  for (int k = 0; k < 4; k++) {
    int o = k ^ 1;
    float wn = near1[k];
    // Only the nearer side of a discontinuity draws.
    if (wn >= 0. && wn >= wc) continue;
    // Three cells inward must be this surface or nearer, so thin rails, poles,
    // wires and foliage fragments keep their fill instead of turning into ink
    // (or into a dotted string of rims along their stair steps).
    bool thick = near1[o] >= wc * thinLimit && near2[o] >= near1[o] * thinLimit && near3[o] >= near2[o] * thinLimit;
    float jump = depthJump(wc, wn, near1[o], near2[k]);
    float strength = thick ? smoothstep(lineGap.x, lineGap.y, jump)
      * smoothstep(.5 * lineGapMetres, lineGapMetres, data.x * jump) : 0.;
    if (strength > silhouette) { silhouette = strength; facing = k; }
    edges += strength > .5 ? 1 : 0;
    outward += vec2(STEPS[k]) * strength;
    if (wn < 0.) skyward = max(skyward, strength);
  }

  vec3 n = texelFetch(normals, cell, 0).xyz;
  vec3 lch = lchOf(fill);
  float fade = 1. - smoothstep(lineFade.x, lineFade.y, data.x);
  // A cell with background on three sides is a fragment (a leaf, a twig tip):
  // foliage reads by its value clusters, not by ink around every leaf.
  if (edges >= 3 && !carCell) return;
  if (silhouette * fade > .5 && !carCell) {
    vec2 dir = length(outward) > 1e-3 ? normalize(outward) : vec2(0.);
    // A top edge whose background is not clearly lower in the world is a
    // ground-level step (kerb, gutter, terrace), not an object: no marks.
    if (dir.y > .5 && near1[2] > 0.) {
      float drop = artWorldPosition(vec2(cell) + .5, data.x).y
        - artWorldPosition(vec2(cell + STEPS[2]) + .5, 1. / near1[2]).y;
      if (drop < lineStepHeight) return;
    }
    // The silhouette cell's own reconstructed normal is its least reliable one;
    // average it with the two cells inward so a whole edge decides alike.
    ivec2 inward = -STEPS[facing];
    vec3 normalSum = n + texelFetch(normals, cell + inward, 0).xyz + texelFetch(normals, cell + 2 * inward, 0).xyz;
    vec3 edgeNormal = normalize(normalSum + 1e-5);
    // Solid surfaces agree on their normal across the edge; leaves do not.
    bool foliage = length(normalSum) < 2.1;
    // Rim side, decided in the image plane so a straight edge decides once along
    // its length: edges facing the key light, and top edges under lamps and sky.
    // The surface itself must also face that light (no rims on shadowed sides).
    float keySide = smoothstep(rimParams.z, rimParams.w, dot(dir, keyLightScreen.xy)) * keyLightScreen.z
      * smoothstep(-.1, .2, dot(edgeNormal, keyLightDirection));
    float topSide = smoothstep(.35, .8, dir.y) * smoothstep(-.2, .3, edgeNormal.y);
    // Lightness beyond the edge and of the surface just inside it. Edge cells
    // are often partly covered (a grazing top face), so the surface decides:
    // a whole edge then chooses alike instead of alternating cell by cell.
    float behind = texelFetch(graded, cell + STEPS[facing], 0).x;
    float inside = .5 * (texelFetch(graded, cell + inward, 0).x + texelFetch(graded, cell + 2 * inward, 0).x);
    // A rim belongs to a lit surface (not a lone lit sliver on a dark bar)
    // against something darker; a dark rail before a lit pavement has none.
    float lit = max(keySide, topSide) * smoothstep(rimParams.y, rimParams.y + .08, inside);
    // An edge cell already brighter than the surface inside it is a highlight
    // the lighting drew (a lit kerb or rail edge, a bumper lip): keep it as is.
    if (value > inside + .1) return;
    if (lit > .5 && behind < inside + .05) {
      // Beads not kept (world rims are off by default) keep the fill: decided
      // before the thin-object walk below, which then costs nothing.
      if (anchoredHash(cell, data, rimBeadCells, 3) >= rimParams.x) return;
      // Thin lit objects (rails, sills, 3-4 cells deep) keep their own lit
      // edge; beaded rims along them read as strings of lights.
      // (Refine round 2: checked rimThinCells deep, so rails 5-7 cells deep
      // keep their own lit face too when world rims are on.)
      float deeper = near3[facing ^ 1];
      for (int k = 4; k <= 12; k++) {
        if (float(k) > rimThin) break;
        float next = inverseDepthAt(cell + k * inward);
        if (next < deeper * thinLimit) return;
        deeper = next;
      }
      // Lit silhouette: a beaded 1-cell rim instead of a dark line.
      bool cool = (skyward > .5 && dir.y > .3) || (keySide > topSide && keyLight.y < .5);
      vec3 rim = cool
        ? vec3(clamp(max(lch.x * 1.35, lch.x + .1), .5, .82), .1, HUE_LAVENDER)
        : brightLine(lch, 1.8);
      outImage = entryTexel(drawnIndex(rim, index, true));
      outMarks = vec4(prior.r, 1., prior.b, 1.);
      return;
    }
    // Dark fills already read against their background by value alone, and so
    // does a silhouette against a lighter sky (trees, roofs, poles): selective
    // outlining.
    if (foliage || inside < lineGap.z || (skyward > .5 && behind > inside - .04)) return;
    outImage = entryTexel(drawnIndex(darkLine(lch), index, false));
    outMarks = vec4(1., prior.g, prior.b, 1.);
    return;
  }

  // Sparse interior creases between neighbouring faces of one surface.
  if (data.x >= creaseParams.y) return;
  vec3 world = artWorldPosition(vec2(cell) + .5, data.x);
  for (int k = 0; k < 4; k++) {
    float wn = near1[k];
    if (wn < 0. || depthJump(wc, wn, near1[k ^ 1], near2[k]) > lineGap.x) continue;
    ivec2 other = artClamp(cell + STEPS[k]);
    vec3 otherNormal = texelFetch(normals, other, 0).xyz;
    if (dot(n, otherNormal) > creaseParams.x) continue;
    // A real crease runs between two smooth faces: along the crease this
    // cell's normal repeats. Foliage and rubble turn every way and draw none.
    ivec2 along = STEPS[k].yx;
    if (min(dot(n, texelFetch(normals, cell + along, 0).xyz), dot(n, texelFetch(normals, cell - along, 0).xyz)) < .9) continue;
    vec3 towards = artWorldPosition(vec2(other) + .5, 1. / wn) - world;
    bool ridge = dot(otherNormal - n, towards) > 0.;
    // One cell of each pair draws, chosen by depth so a whole crease picks the
    // same side: the nearer cell of a ridge, the farther cell of a valley.
    bool tie = abs(wc - wn) < 1e-6 * wc && (k & 1) == 1;
    if (ridge ? !(wc > wn || tie) : !(wc < wn || tie)) continue;
    if (ridge) {
      // A lit ridge takes bright beads, unless the lighting already drew it
      // as a highlight brighter than the face beyond (a lit kerb or sill).
      // Car bodies take their lit edges from the car stage (cars.ts) as
      // continuous lines; beads there read as rivets (refine round 2).
      bool lit = n.y > .5 || dot(n, keyLightDirection) * keyLight.x > .3;
      if (carCell || !lit || value < rimParams.y || value > texelFetch(graded, other, 0).x + .08
        || anchoredHash(cell, data, rimBeadCells, 5) >= creaseParams.z) continue;
      outImage = entryTexel(drawnIndex(brightLine(lch, 1.45), index, true));
      outMarks = vec4(prior.r, .8, prior.b, 1.);
    } else {
      if (value < lineGap.z) continue;
      outImage = entryTexel(drawnIndex(darkLine(lch), index, false));
      outMarks = vec4(.8, prior.g, prior.b, 1.);
    }
    return;
  }
}`;

const GLINTS_FRAGMENT = /* glsl */ `
${LINEWORK_COMMON}
uniform vec4 glintParams;   // x: min peak; y: contrast vs neighbours; z: horizontal allowance; w: max depth (m)
uniform float glintEmitter; // emitter threshold: lamps glow instead
uniform ivec4 glintEntries; // cream, pale gold, gold, peach
uniform float glintHold;    // threshold factor for a surface that carried a glint last frame
uniform float glintCarFar;  // no glints on cars beyond this depth (m)
uniform float lineSkipCars; // 1: the car stage (cars.ts) draws car glints at its paint's highlight peaks
uniform vec3 glintConfirm;  // x: 1 two-frame confirmation; y: ridge rings (0 off); z: ridge keep (fraction of the peak)
layout(location = 0) out vec4 outImage;
layout(location = 1) out vec4 outMarks;
/** The temporal history's glint bit: this cell's surface carried a glint (or a candidate) last frame. */
bool carriedGlint(ivec2 c) { return (int(texelFetch(history, artClamp(c), 0).a * 255. + .5) & 64) != 0; }
float peakAt(ivec2 c) { return texelFetch(resolvedColor, artClamp(c), 0).a * lineExposure; }
/**
 * A lit bar or ridge (a sunlit guardrail, a lit sill): every ring around the
 * candidate out to glintConfirm.y cells still holds a cell at glintConfirm.z
 * of its peak. The lighting draws those as solid lit bars; a glint at each
 * stair step read as a crawling string of fairy lights (refine round 3).
 */
bool litRidge(ivec2 cell, float peak) {
  float keep = glintConfirm.z * peak;
  for (int k = 1; k <= 4; k++) {
    if (float(k) > glintConfirm.y) break;
    bool lit = false;
    for (int i = -4; i <= 4 && !lit; i++) {
      if (abs(i) > k) continue;
      lit = peakAt(cell + ivec2(i, k)) >= keep || peakAt(cell + ivec2(i, -k)) >= keep
        || peakAt(cell + ivec2(k, i)) >= keep || peakAt(cell + ivec2(-k, i)) >= keep;
    }
    if (!lit) return false;
  }
  return true;
}
void main() {
  ivec2 cell = artCell();
  vec4 current = texelFetch(image, cell, 0);
  vec4 prior = texelFetch(marks, cell, 0);
  outImage = current;
  outMarks = prior;
  if (prior.r > .5) return;
  // Car lamp blocks and plates are flat by design (cars.ts).
  int carFeature = artCarFeature(cell);
  if (carFeature == 1 || carFeature == 2) return;
  if (any(lessThan(cell, ivec2(2))) || any(greaterThanEqual(cell, ivec2(artSize) - 2))) return;
  vec4 data = texelFetch(resolvedData, cell, 0);
  if (data.w >= .5 || data.x > glintParams.w || (artCarId(cell) > 0 && (data.x > glintCarFar || lineSkipCars > .5))) return;
  // Canopy takes its leaf glints from the foliage stage, on its lit silhouette
  // only; so do leaves beside flagged canopy (the flag misses some of them).
  if (artSurfaceReady > .5) {
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++)
      if (abs(texelFetch(anchors, artClamp(cell + ivec2(x, y)), 0).w - .25) < .01) return;
  }
  vec4 centre = texelFetch(resolvedColor, cell, 0);
  float peak = centre.a * lineExposure;
  // Temporal hysteresis (surfaces.ts): the temporal stage reprojects last
  // frame's glints onto this frame's surfaces; those keep their glint with a
  // lower bar, so glints stop twinkling under sub-cell motion.
  float hold = artHistoryReady > .5 && carriedGlint(cell) ? glintHold : 1.;
  if (peak < glintParams.x * hold || artLuminance(centre.rgb) * lineExposure > glintEmitter) return;
  float around = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    if (x == 0 && y == 0) continue;
    float other = texelFetch(resolvedColor, cell + ivec2(x, y), 0).a * lineExposure;
    // 3x3 non-maximum suppression. Horizontal neighbours within the allowance
    // survive together, giving 1-cell-tall streaks on bumpers and trim.
    float rival = other * (y == 0 ? glintParams.z : 1.) * hold;
    if (rival > peak || (rival == peak && (y > 0 || (y == 0 && x > 0)))) return;
    // Every other neighbour must be clearly darker: rough lit textures and
    // bright diagonal lines (kerbs, lane paint) never break into beads.
    if (y != 0) around = max(around, other);
  }
  float contrast = peak / max(around, .02);
  if (contrast < glintParams.y * hold) return;
  int entry = peak > 2.5 || contrast > glintParams.y * 3. ? glintEntries.x
    : contrast > glintParams.y * 1.8 ? glintEntries.y : glintEntries.z;
  vec3 fill = lchOf(entryLab(indexOf(current)));
  // Dark warm surfaces (red paint, timber) catch a peach glint, not cream.
  if (entry == glintEntries.z && fill.x < .45 && fill.y > .06 && abs(hueArc(fill.z, .5)) < .6) entry = glintEntries.w;
  if (entryLab(entry).x <= fill.x + .02) return;
  if (glintConfirm.y > 0. && litRidge(cell, peak)) return;
  // Two-frame confirmation (refine round 3): 40-48% of glints away from the
  // player car lived one frame. A new candidate is only marked (g 0.55, no
  // colour); the temporal stage carries that mark to next frame's surface
  // (history bit 64), and a candidate there, or next to it (a specular drifts
  // by a cell), is drawn. glintHold then keeps it with lower thresholds.
  if (glintConfirm.x > .5 && artHistoryReady > .5) {
    bool seen = false;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) seen = seen || carriedGlint(cell + ivec2(x, y));
    if (!seen) { outMarks = vec4(prior.r, .55, prior.b, 1.); return; }
  }
  outImage = entryTexel(entry);
  outMarks = vec4(prior.r, .6, prior.b, 1.);
}`;

/**
 * Analytic lamp heads (glow seed and visibility passes): each head is held on
 * a cell centre with its half-width and halo radius held with hysteresis on
 * the CPU (projectLampHeads), and keeps a slot while it stays on screen so
 * its visibility decision carries from frame to frame.
 */
const LAMP_HEAD_SHAPE = /* glsl */ `
const int MAX_LAMP_HEADS = ${MAX_LAMP_HEADS};
uniform int lampHeadCount;
uniform vec4 lampHeadScreen[MAX_LAMP_HEADS]; // xy: held lens centre (a cell centre); z: view depth; w: held half-width (cells)
uniform vec4 lampHeadShape[MAX_LAMP_HEADS];  // x: held halo radius (cells, 0 none); y: slot; z: 1 on the slot's first frame; w: tier (0 near, 1 mid 2 x 1, 2 far dot)
/** The cream core: about twice as wide as tall. */
vec2 lampHeadCore(float w) { return vec2(w, max(w * .45, .5)); }
/** Core plus the amber rim at its ends (near heads only). */
vec2 lampHeadOuter(float w) { return w >= 1.5 ? lampHeadCore(w) + vec2(1., .6) : lampHeadCore(w); }
`;

const LAMP_VISIBILITY_FRAGMENT = /* glsl */ `
${LAMP_HEAD_SHAPE}
uniform sampler2D lampVisibilityPrevious;
uniform float lampVisibilityValid;
layout(location = 0) out vec4 outVisibility;
/**
 * One visibility decision per lamp head (a 16 x 1 target, one texel per
 * slot): the share of its core cells that nothing nearer hides, with
 * hysteresis against last frame's decision (on above 0.6, off below 0.3), so
 * leaves and wires aliasing in front of the lens cannot blink it.
 */
void main() {
  int slot = int(gl_FragCoord.x);
  outVisibility = vec4(0.);
  for (int i = 0; i < MAX_LAMP_HEADS; i++) {
    if (i >= lampHeadCount) break;
    if (int(lampHeadShape[i].y + .5) != slot) continue;
    vec4 h = lampHeadScreen[i];
    vec2 core = lampHeadCore(h.w);
    float seen = 0., total = 0.;
    for (int y = -2; y <= 2; y++) for (int x = -3; x <= 3; x++) {
      vec2 c = floor(h.xy) + vec2(x, y) + .5;
      vec2 e = (c - h.xy) / core;
      if (dot(e, e) > 1. || any(lessThan(c, vec2(0.))) || any(greaterThanEqual(c, artSize))) continue;
      vec4 data = texelFetch(resolvedData, ivec2(c), 0);
      total += 1.;
      seen += data.w >= .5 || data.x >= h.z * .92 - .5 ? 1. : 0.;
    }
    float share = total > 0. ? seen / total : 0.;
    float previous = lampVisibilityValid > .5 && lampHeadShape[i].z < .5
      ? texelFetch(lampVisibilityPrevious, ivec2(slot, 0), 0).r : -1.;
    float visible = previous < 0. ? step(.5, share) : previous > .5 ? step(.3, share) : step(.6, share);
    outVisibility = vec4(visible, share, 0., 1.);
    return;
  }
}`;

const GLOW_SEED_FRAGMENT = /* glsl */ `
${LINEWORK_COMMON}
uniform vec4 glowParams;    // x: emitter threshold; y: base radius; z: per stop; w: per neighbouring emitter cell
uniform vec3 glowLimits;    // x: max radius; y: 5x5 emitter count above which it is a lit panel; z: contrast over the outer ring
uniform float glowDark;     // surround luminance above which an emitter is a lit panel
${LAMP_HEAD_SHAPE}
uniform sampler2D lampVisibility;            // per slot: r 1 while the head is drawn (lampVisibility stage)
uniform sampler2D glowSeedPrevious;          // last frame's emitters (this pass's output, ping-ponged)
uniform float glowSeedValid;
uniform vec4 glowStable;     // x: 1 stable emitters (see LineworkOptions.glowStable); y: cos of the key-specular cone (< -1 off); z: 1 canopy mask; w: canopy clump size (cells)
uniform vec3 keyLightDirection;
uniform vec2 keyLight;       // x: strength, y: warmth
uniform float glowKeyLift;   // extra emitter threshold (x the key's strength) under a warm key
layout(location = 0) out vec4 outSeed;
int flagsOf(vec4 seed) { return int(seed.w + .5); }
/** This cell's world point in last frame's seed target (false: no history, not a world point, off screen). */
bool reproject(ivec2 cell, vec4 data, out ivec2 before) {
  before = ivec2(0);
  if (glowSeedValid < .5 || artHistoryReady < .5) return false;
  vec4 anchor = artAnchor(cell, data);
  if (abs(anchor.w) > .3) return false;
  vec4 clip = artPreviousViewProjection * vec4(anchor.xyz, 1.);
  if (clip.w <= 1e-4) return false;
  vec2 p = (clip.xy / clip.w * .5 + .5) * artSize;
  if (any(lessThan(p, vec2(0.))) || any(greaterThanEqual(p, artSize))) return false;
  before = ivec2(p);
  return true;
}
/**
 * Last frame's emitter at this world point (x: its radius, 0 none): a lamp
 * keeps its emitter decision and its radius unless they clearly change
 * (refine round 2: sub-cell camera motion, even the last metres of a stop,
 * reshaped shop tubes' halos every frame). With glowStable the emitter next
 * to that cell counts too (the brightest cell of a tube drifts by a cell).
 */
vec4 previousSeed(ivec2 before) {
  vec4 own = texelFetch(glowSeedPrevious, before, 0);
  if (own.x > 0. && (flagsOf(own) & 16) == 0) return own;
  if (glowStable.x < .5) return vec4(0.);
  vec4 best = vec4(0.);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec4 s = texelFetch(glowSeedPrevious, artClamp(before + ivec2(x, y)), 0);
    if (s.x > best.x && (flagsOf(s) & 16) == 0) best = s;
  }
  return best;
}
bool canopyAt(ivec2 c, float depth) {
  vec4 a = texelFetch(anchors, artClamp(c), 0);
  return abs(a.w - .25) < .01 && abs(texelFetch(resolvedData, artClamp(c), 0).x - depth) < .15 * depth;
}
/**
 * Emitters: x radius (0 = none), y hue (rad), z view depth, w flags (1
 * interior, 2 neon, 4 small, 8 panel, 16 analytic lamp head, 32 squashed
 * halo, 64 pending: a new emitter shown from next frame, 128 canopy mask
 * (then y is the held clump level when x is 0), 256 mid-distance lamp head,
 * 512 far lamp head).
 */
void main() {
  ivec2 cell = artCell();
  outSeed = vec4(0.);
  vec4 data = texelFetch(resolvedData, cell, 0);
  // Analytic lamp heads (refine round 2): a flat, stair-stepped cream ellipse
  // about twice as wide as tall at each visible lens, held on whole cells, and
  // a 1-cell amber rim at its ends; drawn whole whenever the lamp is visible
  // (one decision per lamp with hysteresis), so leaves and wires crossing the
  // lens no longer blink it cell by cell. Bright cells around it seed no
  // second halo; its halo is squashed wider than tall.
  vec2 centre = vec2(cell) + .5;
  for (int i = 0; i < MAX_LAMP_HEADS; i++) {
    if (i >= lampHeadCount) break;
    vec4 h = lampHeadScreen[i];
    vec2 core = lampHeadCore(h.w), outer = lampHeadOuter(h.w);
    vec2 d = (centre - h.xy) / outer;
    float r2 = dot(d, d);
    if (r2 > 3.3) continue;
    if (texelFetch(lampVisibility, ivec2(int(lampHeadShape[i].y + .5), 0), 0).r < .5) continue;
    if (r2 > 1.) return;
    vec2 e = (centre - h.xy) / core;
    // Far heads (refine round 3) draw a 2 x 1 or a single-cell core and a
    // 1-cell ring of fixed colour (flags 256, 512).
    float tier = lampHeadShape[i].w;
    outSeed = vec4(lampHeadShape[i].x, HUE_AMBER, h.z, 16. + 32. + (dot(e, e) <= 1. ? 1. : 0.)
      + (tier > 1.5 ? 512. : tier > .5 ? 256. : 0.));
    return;
  }
  if (data.w >= .5) return;
  ivec2 before;
  bool back = reproject(cell, data, before);
  // The canopy mask (refine round 3), for the foliage stage's clump tones:
  // the surface stage's canopy flag flips on about a third of its cells from
  // frame to frame (sub-cell leaves); a cell of this canopy layer with enough
  // flagged cells around it is canopy, and a cell that was canopy last frame
  // (reprojected) stays canopy with fewer. Its clump level (lattice size) is
  // held too, so a tree's clumps do not re-roll while the size hovers at a
  // power-of-two step.
  float canopy = 0.;
  if (glowStable.z > .5 && artSurfaceReady > .5 && artCarId(cell) == 0 && texelFetch(normals, cell, 0).y < .9) {
    int count = 0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) count += canopyAt(cell + ivec2(x, y), data.x) ? 1 : 0;
    vec4 was = back ? texelFetch(glowSeedPrevious, before, 0) : vec4(0.);
    bool held = back && (flagsOf(was) & 128) != 0 && was.x <= 0.;
    if (held ? count >= 2 : count >= 4) {
      float level = log2(max(artCellWorldSize(data.x) * glowStable.w, 1e-3));
      canopy = 128.;
      outSeed = vec4(0., held && abs(level - was.y) < .8 ? was.y : floor(level + .5), 0., canopy);
    }
  }
  // Car cells never emit (refine round 3): car lamps are drawn by the car
  // stage, and a lamp's specular on a wheel or on paint is a glint, not a
  // lantern with a halo.
  if (glowStable.x > .5 && artCarId(cell) > 0) return;
  vec3 color = texelFetch(resolvedColor, cell, 0).rgb;
  float luminance = artLuminance(color) * lineExposure;
  // Bright cells on upward-facing surfaces (wet road, roofs, bonnets) are
  // reflections of lamps overhead: glints and palette, never halos.
  if (texelFetch(normals, cell, 0).y > .6) return;
  vec4 held = back ? previousSeed(before) : vec4(0.);
  bool stable = glowStable.x > .5;
  float hold = held.x > 0. ? (stable ? .7 : .8) : 1.;
  float threshold = glowParams.x * hold;
  if (luminance < threshold) return;
  // Under a strong warm key (dusk, sunrise) the exposure lifts sunlit and
  // sun-glazed surfaces to lamp brightness (a gutter's glare beside a dark
  // rail post grew a lamp orb at sunrise): an emitter must then be 1 +
  // glowKeyLift x brighter; lamps and lit tubes are far brighter than that.
  // (Held emitters keep only a little of their hold here, so a glare that
  // once passed does not stay a lamp.)
  float keyLift = glowKeyLift * keyLight.x * keyLight.y;
  if (keyLift > 0. && luminance < glowParams.x * (1. + keyLift) * (held.x > 0. ? .85 : 1.)) return;
  // The key light's own specular (sun glare on a kerb or a wet wall) is not
  // a light source: a bright cell whose mirror direction (the normal averaged
  // with its four neighbours) points at a strong key is left to the palette.
  if (glowStable.y > -1. && keyLight.x > .3) {
    vec3 n = texelFetch(normals, cell, 0).xyz;
    for (int k = 0; k < 4; k++) n += texelFetch(normals, artClamp(cell + ivec2(k < 2 ? 2 * k - 1 : 0, k < 2 ? 0 : 2 * k - 5)), 0).xyz;
    vec3 view = normalize(artWorldPosition(vec2(cell) + .5, data.x) - artCameraWorld[3].xyz);
    if (length(n) > .5 && dot(reflect(view, normalize(n)), keyLightDirection) > glowStable.y) return;
  }
  float near = 0., area = 0., ring = 0., peak = luminance;
  bool interior = true;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    float other = cellLuminance(cell + ivec2(x, y));
    if (max(abs(x), abs(y)) == 2) ring += other;
    if (other < threshold) {
      if (abs(x) + abs(y) == 1) interior = false;
      continue;
    }
    area += 1.;
    if (max(abs(x), abs(y)) <= 1) { near += 1.; peak = max(peak, other); }
  }
  // A lamp stands out from its surroundings at two and four cells; lit road
  // pools and walls do not, and are left to the palette.
  float far = 0.;
  for (int k = 0; k < 16; k++) {
    float a = float(k) * .39269908;
    far += cellLuminance(cell + ivec2(round(vec2(cos(a), sin(a)) * 4.)));
  }
  float surround = max(ring, far) / 16.;
  if (area <= glowLimits.y && luminance < glowLimits.z * surround * hold) return;
  // Large or brightly surrounded emitters (lit windows, shop fixtures) are
  // lit panels: they keep their detail and grow no halo. Halos belong to
  // lamps against the dark. With glowStable a held emitter keeps its panel
  // decision unless it clearly changes (a tube's end cells flipped between
  // panel and halo as the camera settled, re-rolling whole halo discs).
  bool panel = area > glowLimits.y || surround > glowDark;
  if (stable && held.x > 0.) panel = (flagsOf(held) & 8) != 0
    ? area > glowLimits.y - 2. || surround > .8 * glowDark
    : area > glowLimits.y + 2. || surround > 1.25 * glowDark;
  vec3 lab = artLinearToOklab(color / max(max(color.r, color.g), max(color.b, 1e-4)));
  float chroma = length(lab.yz);
  float hue = chroma > 1e-4 ? atan(lab.z, lab.y) : HUE_AMBER;
  // Saturated non-amber emitters (neon, brake lamps) keep a 1-2 cell glow;
  // large bright panels (lit windows, shop interiors) keep their own detail
  // and grow no halo (the cutscenes draw them as flat lit panels).
  bool neon = chroma > .15 && abs(hueArc(hue, HUE_AMBER)) > radians(35.);
  // The radius follows the brightest emitter cell around (every cell of a
  // small lamp agrees) on whole cells, and keeps last frame's unless it moves
  // by 0.75 cell or more.
  float radius = glowParams.y + glowParams.z * log2(peak / glowParams.x) + glowParams.w * (near - 1.);
  radius = clamp(radius, 1., neon ? 2. : glowLimits.x);
  radius = held.x > 0. && abs(radius - held.x) < (stable ? 1.05 : .75) ? held.x : floor(radius + .5);
  // A new emitter waits a frame (refine round 3): it glows from the next
  // frame on if it is still there, so a one-frame specular never grows a
  // lamp halo, and halos no longer blink on for single frames at speed.
  float pending = stable && glowSeedValid > .5 && artHistoryReady > .5 && held.x <= 0. ? 64. : 0.;
  outSeed = vec4(radius, hue, data.x,
    (interior ? 1. : 0.) + (neon ? 2. : 0.) + (near <= 2. ? 4. : 0.) + (panel ? 8. : 0.) + pending);
}`;

/**
 * The halo field carries its winning emitter's radius, hue and halo shape in
 * one float (refine round 2, a 32-bit target): 8 x round(radius x 64), + 1
 * for a squashed halo, + 2 x the ring style (0 the warm ramp, 1 a collapsed
 * mid-distance lamp head, 2 a far lamp dot; refine round 3), plus hue / 2 pi.
 */
const GLOW_PACK = /* glsl */ `
float packHalo(float radius, float hue, bool squashed, int style) {
  return floor(radius * 64. + .5) * 8. + (squashed ? 1. : 0.) + float(2 * style) + fract(hue / 6.28318531) * .999;
}
void unpackHalo(float packed, out float radius, out float hue, out bool squashed, out int style) {
  float whole = floor(packed);
  hue = (packed - whole) / .999 * 6.28318531;
  squashed = mod(whole, 2.) > .5;
  style = int(mod(floor(whole * .5), 4.));
  radius = floor(whole / 8.) / 64.;
}
`;

const GLOW_SPREAD_FRAGMENT = /* glsl */ `
${LINEWORK_COMMON}
${GLOW_PACK}
uniform sampler2D glowSeed;
uniform float glowSquash;   // width over height of a lamp head's halo
layout(location = 0) out vec4 outSpread;
// Separable halo field, pass 1: max over the row of radius^2 - dx^2 (x; a
// lamp head's halo is squashed, wider than tall), with the winning emitter's
// packed radius, hue and shape, its depth and its column.
void main() {
  ivec2 cell = artCell();
  vec4 best = vec4(-1., 0., 0., 0.);
  for (int dx = -${GLOW_REACH}; dx <= ${GLOW_REACH}; dx++) {
    int x = cell.x + dx;
    if (x < 0 || x >= int(artSize.x)) continue;
    vec4 seed = texelFetch(glowSeed, ivec2(x, cell.y), 0);
    // Lit panels (flag 8) keep their detail and grow no halo; pending
    // emitters (64) glow from next frame.
    int flags = int(seed.w + .5);
    if (seed.x <= 0. || (flags & (8 | 64)) != 0) continue;
    bool squashed = (flags & 32) != 0;
    float value = seed.x * seed.x - float(dx * dx) / (squashed ? glowSquash * glowSquash : 1.);
    int style = (flags & 512) != 0 ? 2 : (flags & 256) != 0 ? 1 : 0;
    if (value > best.x) best = vec4(value, packHalo(seed.x, seed.y, squashed, style), seed.z, float(x));
  }
  outSpread = best;
}`;

const GLOW_FRAGMENT = /* glsl */ `
${LINEWORK_COMMON}
${GLOW_PACK}
uniform sampler2D glowSeed;
uniform sampler2D glowSpread;
uniform ivec4 glowEntries;  // lamp core, lamp rim, small lamp core, analytic lamp-head core (cream)
uniform ivec3 glowRings;    // far lamp ring, mid lamp ring, mid lamp outer ring (refine round 3)
uniform vec4 glowShape;     // x: speckle fraction; y, z: innermost ring L and C; w: ramp cells (0: rings by radius, round 2)
layout(location = 0) out vec4 outImage;
layout(location = 1) out vec4 outMarks;
void main() {
  ivec2 cell = artCell();
  vec4 current = texelFetch(image, cell, 0);
  vec4 prior = texelFetch(marks, cell, 0);
  outImage = current;
  outMarks = prior;
  vec4 seed = texelFetch(glowSeed, cell, 0);
  int seedFlags = int(seed.w + .5);
  if (seed.x > 0. && (seedFlags & 64) == 0) {
    // Emitter: a flat cream core with a 1-cell amber rim; neon keeps its hue.
    int flags = seedFlags;
    bool interior = (flags & 1) != 0, neon = (flags & 2) != 0, small = (flags & 4) != 0, panel = (flags & 8) != 0;
    bool head = (flags & 16) != 0;
    outMarks = vec4(0., prior.g, 1., 1.);
    if (panel) return;
    int entry = head ? ((flags & 512) != 0 ? glowEntries.z : interior ? glowEntries.w : glowEntries.y)
      : neon ? snapToPalette(labOf(interior ? vec3(.8, .12, seed.y) : vec3(.7, .17, seed.y)))
      : small ? glowEntries.z : interior ? glowEntries.x : glowEntries.y;
    outImage = entryTexel(entry);
    return;
  }
  // Separable halo field, pass 2: max over the column of spread - dy^2.
  vec4 best = vec4(-1., 0., 0., 0.);
  int sourceY = cell.y;
  for (int dy = -${GLOW_REACH}; dy <= ${GLOW_REACH}; dy++) {
    int y = cell.y + dy;
    if (y < 0 || y >= int(artSize.y)) continue;
    vec4 spread = texelFetch(glowSpread, ivec2(cell.x, y), 0);
    if (spread.x < 0.) continue;
    float value = spread.x - float(dy * dy);
    if (value > best.x) { best = vec4(value, spread.yzw); sourceY = y; }
  }
  if (best.x <= 0.) return;
  vec4 data = texelFetch(resolvedData, cell, 0);
  // A halo sits behind its lamp: nearer occluders keep their own colour.
  if (data.w < .5 && data.x < best.z * .9 - .5) return;
  float radius, hue;
  bool squashed;
  int style;
  unpackHalo(best.y, radius, hue, squashed, style);
  ivec2 source = ivec2(int(best.w), sourceY);
  // The cell's distance from its emitter (in squashed cells for lamp heads).
  float distance = sqrt(max(radius * radius - best.x, 0.));
  // Collapsed far lamp heads (refine round 3): a far dot takes one tan cell
  // (#ae8773) either side, a 2 x 1 mid-distance head an amber-tan cell either
  // side and dim brown ends and caps: squashed like the near heads' halos, so
  // a receding row reads as lamps, not as the sky's plus-shaped stars. No
  // speckle: the ring is part of the drawn lamp.
  if (style > 0) {
    bool row = sourceY == cell.y;
    if (style == 2 ? !row : !row && distance > 1.05) return;
    int ringEntry = style == 2 ? glowRings.x : row && distance <= 1.05 ? glowRings.y : glowRings.z;
    if (entryLab(ringEntry).x < lchOf(texelFetch(graded, cell, 0).xyz).x + .03) return;
    outImage = entryTexel(ringEntry);
    outMarks = vec4(0., prior.g, .6, 1.);
    return;
  }
  float t = distance / radius;
  float ring = 1. / radius;
  // Stable speckle: some ring cells drop one ring outward (broken rings). The
  // hash is anchored to the emitter cell the ring belongs to (refine round 2;
  // anchored to the background, the speckle crawled as the world slid behind
  // a still lamp). Refine round 3: keyed to that emitter cell's world anchor
  // rather than its radius, so a radius step or the tube's brightest cell
  // moving no longer re-rolls every ring at once.
  bool byDistance = glowShape.w > 0.;
  int key = 11 + int(radius * 4.);
  if (byDistance) {
    vec4 sourceData = texelFetch(resolvedData, artClamp(source), 0);
    key = 11 + int(anchoredHash(source, sourceData, 2., 61) * 4096.);
  }
  float speckle = artHash01(ivec3(cell - source, key));
  if (byDistance) {
    // Rings coloured by their distance in cells along a fixed ramp
    // (glowShape.w cells to the background): a radius step adds or removes
    // the last ring only, instead of recolouring every ring.
    distance += speckle < glowShape.x ? 1. : 0.;
    if (distance >= radius) return;
    ring = 1. / glowShape.w;
    t = min(distance / glowShape.w, 1. - ring);
    if (distance >= radius - 1.) t = max(t, 1. - ring);
  } else {
    t += speckle < glowShape.x ? ring : 0.;
    if (t >= 1.) return;
  }
  t = max(t, 0.);
  // The background from the smooth grade (the quantised entry alternates
  // under the band offset, and the rings followed it).
  vec3 background = lchOf(texelFetch(graded, cell, 0).xyz);
  float fromHue = hueToward(hue, HUE_AMBER, radians(15.));
  vec3 halo;
  if (abs(hueArc(fromHue, HUE_AMBER)) < radians(40.)) {
    // Warm lamps follow the spec's glow ramp (#dda06f #b47e5f #916452
    // #714d49 #57393e): amber easing to rose-brown with the chroma falling
    // first, and only the last ring turned toward the background (plum),
    // never through magenta (refine round 2: the hue arc to a violet sky
    // passed #99426d).
    // The lightness falls fast off the lamp, then slowly toward the
    // background (harbor-wide: #924c2e #754134 #3d2a3a around the rim).
    float last = 1. - ring;
    float warmHue = mix(radians(58.), radians(35.), smoothstep(0., max(last, .05), t));
    float toHue = background.y < .02 ? HUE_VIOLET : background.z;
    // Chroma falls before the hue turns: a saturated violet sky behind the
    // last ring gives a dim plum, not a red or magenta ring.
    float chroma = mix(glowShape.z, .045, smoothstep(.25, max(last, .3), t));
    halo = vec3(mix(glowShape.y, background.x, sqrt(t)), t >= last ? min(chroma, .05) : chroma,
      t >= last ? hueToward(warmHue, toHue, radians(50.)) : warmHue);
  } else {
    // Neon and cool lights: toward the background along the shorter hue arc.
    vec3 lab = entryLab(indexOf(current));
    vec3 own = lchOf(lab);
    float toHue = own.y < .02 ? HUE_VIOLET : own.z;
    halo = vec3(mix(glowShape.y, own.x, t), max(mix(glowShape.z, own.y, t), .03), fromHue + hueArc(fromHue, toHue) * t * t);
  }
  if (halo.x < background.x + .03) return;
  outImage = entryTexel(snapToPalette(labOf(halo)));
  outMarks = vec4(0., prior.g, .6, 1.);
}`;

const CLEANUP_FRAGMENT = /* glsl */ `
${LINEWORK_COMMON}
uniform float cleanupKeep;
uniform float cleanupEmitter;
uniform float cleanupSimilar; // OKLab distance under which two entries count as one colour
uniform float inkCleanup;     // 1: connect 1-cell gaps in lines and drop lone ink dots
uniform float inkRun;         // refine round 3: ink cells within 2 cells a line cell needs (0: round 2's lone-dot rule)
uniform vec2 wireShape;       // refine round 3: x 1 connects thin geometry against the sky; y: sky-owned cover that counts as the wire
layout(location = 0) out vec4 outImage;
const ivec2 CROSS[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
const ivec2 DIAGONAL[4] = ivec2[4](ivec2(1, 1), ivec2(-1, 1), ivec2(1, -1), ivec2(-1, -1));
bool isMark(vec4 m) { return max(m.r, max(m.g, m.b)) > .5; }
bool inked(ivec2 c) { return texelFetch(marks, artClamp(c), 0).r > .75; }
/** Ink cells within two cells (the 5 x 5 window, the cell itself excluded). */
int inkAround(ivec2 cell) {
  int n = 0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) n += (x != 0 || y != 0) && inked(cell + ivec2(x, y)) ? 1 : 0;
  return n;
}
bool inkKept(ivec2 c) { return inked(c) && (inkRun <= 0. || float(inkAround(c)) >= inkRun); }
/** Geometry owns the cell (the resolve's owning layer is not the sky). */
bool geometryAt(vec4 data) { return data.x < artCameraFar * .98; }
/** Thin geometry against the sky: owned by geometry that leaves part of the cell to the sky (a wire, a twig, a cable). */
bool thinAt(vec4 data) { return geometryAt(data) && data.w >= .2; }
/** A sky-owned cell partly covered by nearer geometry (its sky fraction below 1 - wireShape.y). */
float partialCover(vec4 data) { return geometryAt(data) || data.z >= artCameraFar * .98 ? 0. : 1. - data.w; }
/**
 * Connect or drop (refine round 3): whether this cell, not itself a member,
 * joins two members on opposite sides that nothing else joins (straight,
 * diagonal and knight's-move gaps). Of two gap cells that would join the
 * same pair, the one with more cover (then the lower, then the left) fills.
 * mode 0: ink lines (marks); mode 1: thin geometry against the sky.
 * Returns the offset of the darker member to copy (or ivec2(9) for none).
 */
ivec2 bridge(ivec2 cell, int mode, float cover) {
  bool member[9];
  vec4 data[9];
  for (int k = 0; k < 9; k++) {
    ivec2 o = ivec2(k % 3 - 1, k / 3 - 1);
    data[k] = mode == 1 ? texelFetch(resolvedData, artClamp(cell + o), 0) : vec4(0.);
    member[k] = k != 4 && (mode == 0 ? inked(cell + o) : geometryAt(data[k]) && data[k].w > .02);
  }
  for (int i = 0; i < 9; i++) {
    if (!member[i]) continue;
    ivec2 a = ivec2(i % 3 - 1, i / 3 - 1);
    for (int j = i + 1; j < 9; j++) {
      if (!member[j]) continue;
      ivec2 b = ivec2(j % 3 - 1, j / 3 - 1);
      if (max(abs(a.x - b.x), abs(a.y - b.y)) < 2) continue;
      if (mode == 1) {
        // The wire's own depth: both ends near the geometry covering this
        // cell (a partial cell), or, for an uncovered gap, a straight run of
        // two thin cells at one depth.
        float za = data[i].x, zb = data[j].x;
        if (cover > 0.) {
          float z = data[4].z;
          if (abs(za - z) > .25 * z || abs(zb - z) > .25 * z) continue;
        } else if (a != -b || !thinAt(data[i]) || !thinAt(data[j]) || abs(za - zb) > .15 * min(za, zb)) continue;
      }
      bool joined = false, second = false;
      for (int k = 0; k < 9; k++) {
        if (k == 4 || k == i || k == j) continue;
        ivec2 m = ivec2(k % 3 - 1, k / 3 - 1);
        if (max(abs(m.x - a.x), abs(m.y - a.y)) > 1 || max(abs(m.x - b.x), abs(m.y - b.y)) > 1) continue;
        if (member[k]) { joined = true; break; }
        // Another gap cell joining the same pair: one of the two fills.
        float other = mode == 1 ? partialCover(data[k]) : 0.;
        if (other > cover || (other == cover && (m.y < 0 || (m.y == 0 && m.x < 0)))) second = true;
      }
      if (joined || second) continue;
      // Ink fragments that the run rule drops are not joined.
      if (mode == 0 && (!inkKept(cell + a) || !inkKept(cell + b))) continue;
      vec4 one = texelFetch(image, artClamp(cell + a), 0), two = texelFetch(image, artClamp(cell + b), 0);
      return entryLab(indexOf(one)).x <= entryLab(indexOf(two)).x ? a : b;
    }
  }
  return ivec2(9);
}
/** The most common entry among the 4-neighbours that carry no mark (-1: none). */
int unmarkedMajority(ivec2 cell) {
  int votes[4];
  int winner = -1, best = 0;
  for (int k = 0; k < 4; k++) {
    ivec2 other = artClamp(cell + CROSS[k]);
    votes[k] = isMark(texelFetch(marks, other, 0)) ? -1 : indexOf(texelFetch(image, other, 0));
  }
  for (int k = 0; k < 4; k++) {
    if (votes[k] < 0) continue;
    int count = 0;
    for (int j = 0; j < 4; j++) count += votes[j] == votes[k] ? 1 : 0;
    if (count > best) { best = count; winner = votes[k]; }
  }
  return winner;
}
void main() {
  ivec2 cell = artCell();
  vec4 current = texelFetch(image, cell, 0);
  outImage = current;
  vec4 mark = texelFetch(marks, cell, 0);
  // Ink that dots a shallow diagonal (refine round 2, connect or drop): a
  // lone line cell with no ink among its 8 neighbours is dropped back to the
  // surface around it, and a 1-cell gap in a line (ink on both sides along
  // one axis, not across it) is filled with the line's colour.
  if (inkCleanup > .5 && mark.r > .75 && mark.g < .5 && mark.b < .5) {
    bool alone = true;
    if (inkRun > 0.) alone = float(inkAround(cell)) < inkRun;
    else for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) if ((x != 0 || y != 0) && inked(cell + ivec2(x, y))) alone = false;
    if (alone) {
      int back = unmarkedMajority(cell);
      if (back >= 0) outImage = entryTexel(back);
    }
    return;
  }
  vec4 data = texelFetch(resolvedData, cell, 0);
  // Perforated wires (refine round 3): thin geometry against the sky left a
  // sky cell wherever it covered too few samples for the resolve to give it
  // the cell, so wires read as dashes (the main source of checker quads).
  if (wireShape.x > .5 && !isMark(mark)) {
    float cover = partialCover(data);
    bool thin = thinAt(data);
    if (thin && data.w > .55) {
      // A lone speck of thin geometry (nothing around it in the sky) drops.
      bool near = false;
      for (int k = 0; k < 9 && !near; k++) {
        if (k == 4) continue;
        vec4 o = texelFetch(resolvedData, artClamp(cell + ivec2(k % 3 - 1, k / 3 - 1)), 0);
        near = geometryAt(o) || partialCover(o) >= wireShape.y;
      }
      if (!near) {
        int back = unmarkedMajority(cell);
        if (back >= 0) { outImage = entryTexel(back); return; }
      }
    } else if (!geometryAt(data) && (cover >= wireShape.y || cover == 0.)) {
      ivec2 from = bridge(cell, 1, cover >= wireShape.y ? cover : 0.);
      if (from.x < 9) { outImage = texelFetch(image, artClamp(cell + from), 0); return; }
    }
    // Diagonal steps: thin cells that touch only at a corner draw a checker
    // quad at every step of the wire. Of the two sky cells of such a step the
    // one with more cover (then the lower) fills, so a wire is a 4-connected
    // stair line, as radio-wide draws its wires.
    if (!geometryAt(data)) for (int k = 0; k < 4; k++) {
      ivec2 h = ivec2(k % 2 == 0 ? 1 : -1, 0), v = ivec2(0, k < 2 ? 1 : -1);
      vec4 dh = texelFetch(resolvedData, artClamp(cell + h), 0), dv = texelFetch(resolvedData, artClamp(cell + v), 0);
      vec4 dd = texelFetch(resolvedData, artClamp(cell + h + v), 0);
      if (!thinAt(dh) || !thinAt(dv) || geometryAt(dd) || abs(dh.x - dv.x) > .15 * min(dh.x, dv.x)) continue;
      if (isMark(texelFetch(marks, artClamp(cell + h), 0)) || isMark(texelFetch(marks, artClamp(cell + v), 0))) continue;
      float mine = partialCover(data), other = partialCover(dd);
      if (other > mine || (other == mine && v.y < 0)) continue;
      vec4 one = texelFetch(image, artClamp(cell + h), 0), two = texelFetch(image, artClamp(cell + v), 0);
      outImage = entryLab(indexOf(one)).x <= entryLab(indexOf(two)).x ? one : two;
      return;
    }
  }
  if (isMark(mark)) return;
  if (inkCleanup > .5 && cellLuminance(cell) < cleanupEmitter) {
    if (inkRun > 0.) {
      ivec2 from = bridge(cell, 0, 0.);
      if (from.x < 9) { outImage = texelFetch(image, artClamp(cell + from), 0); return; }
    } else for (int k = 0; k < 4; k++) {
      ivec2 a = k == 0 ? ivec2(1, 0) : k == 1 ? ivec2(0, 1) : k == 2 ? ivec2(1, 1) : ivec2(1, -1);
      ivec2 across = k == 0 ? ivec2(0, 1) : k == 1 ? ivec2(1, 0) : k == 2 ? ivec2(1, -1) : ivec2(1, 1);
      if (!inked(cell + a) || !inked(cell - a) || (inked(cell + across) && inked(cell - across))) continue;
      vec4 one = texelFetch(image, artClamp(cell + a), 0), two = texelFetch(image, artClamp(cell - a), 0);
      outImage = entryLab(indexOf(one)).x <= entryLab(indexOf(two)).x ? one : two;
      return;
    }
  }
  int index = indexOf(current);
  vec3 lab = entryLab(index);
  // Isolated: no 8-neighbour has this colour or a neighbouring palette entry.
  // Thin lit lines whose cells alternate between two close entries, and
  // diagonal runs such as wires, therefore survive.
  for (int k = 0; k < 4; k++) {
    if (length(entryLab(indexOf(texelFetch(image, artClamp(cell + DIAGONAL[k]), 0))) - lab) < cleanupSimilar) return;
  }
  int votes[4];
  for (int k = 0; k < 4; k++) {
    ivec2 other = artClamp(cell + CROSS[k]);
    votes[k] = indexOf(texelFetch(image, other, 0));
    if (length(entryLab(votes[k]) - lab) < cleanupSimilar) return;
    // Marks do not vote: lines and glints must not grow into their neighbours.
    if (isMark(texelFetch(marks, other, 0))) votes[k] = -1;
  }
  int winner = -1, winnerCount = 1;
  float winnerDistance = 1e9;
  for (int k = 0; k < 4; k++) {
    if (votes[k] < 0) continue;
    int count = 0;
    for (int j = 0; j < 4; j++) count += votes[j] == votes[k] ? 1 : 0;
    float distance = length(entryLab(votes[k]) - lab);
    if (count > winnerCount || (count == winnerCount && count > 1 && distance < winnerDistance)) {
      winner = votes[k]; winnerCount = count; winnerDistance = distance;
    }
  }
  if (winner < 0 || cellLuminance(cell) > cleanupEmitter) return;
  // A stable share of orphans stays as the cutscenes' sparse single-cell speckle.
  if (anchoredHash(cell, texelFetch(resolvedData, cell, 0), 1., 23) < cleanupKeep) return;
  outImage = entryTexel(winner);
}`;

const FOLIAGE_FRAGMENT = /* glsl */ `
${LINEWORK_COMMON}
uniform vec4 foliageShape;   // x: canopy neighbours (of 8) that fill a hole (0 off); y: glint share of lit canopy edges; z: glints only nearer (m); w: interior calm (L above the canopy around)
uniform ivec2 foliageGlints; // amber, gold
uniform vec3 keyLightDirection;
uniform vec2 keyLight;       // x: strength, y: warmth (1 amber key)
uniform vec3 keyLightScreen; // xy: key direction in the image plane; z: reliability
uniform sampler2D foliageMask;   // this frame's glow seeds: flag 128 the held canopy mask, y its held clump level
uniform float foliageMaskReady;
uniform vec4 foliageTone;        // x: 1 clump tones; y: clump size (cells); z: local mean L below which tones apply; w: lamp glint share
uniform float foliageLampReach;  // m
uniform float foliageToneFar;    // m: clump tones only nearer (thinning from 0.7 x)
uniform float foliageToneLift;   // 1: a clump's top cells take a step up
uniform mat4 foliageViewProjection; // this frame's projection x view (clump centres to cells)
uniform int foliageLampCount;
uniform vec4 foliageLamp[${MAX_LAMP_HEADS}]; // street-lamp heads (world xyz)
uniform int foliageTones[15];    // teal-navy, teal, olive: five palette steps each, dark to light
layout(location = 0) out vec4 outImage;
const ivec2 CROSS[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
bool rawCanopy(ivec2 c) { return abs(texelFetch(anchors, artClamp(c), 0).w - .25) < .01; }
/** Canopy: the held mask (glow seed pass) when it ran this frame, else the surface stage's flag. */
bool canopy(ivec2 c) {
  if (foliageMaskReady < .5) return rawCanopy(c);
  vec4 s = texelFetch(foliageMask, artClamp(c), 0);
  return s.x <= 0. && (int(s.w + .5) & 128) != 0;
}
float depthAt(ivec2 c) { vec4 d = texelFetch(resolvedData, artClamp(c), 0); return d.w >= .5 ? 1e9 : d.x; }
/** The clump lattice level of a canopy cell (held by the seed pass) or from its depth. */
float clumpLevel(ivec2 c, float depth) {
  if (foliageMaskReady > .5) {
    vec4 s = texelFetch(foliageMask, artClamp(c), 0);
    if (s.x <= 0. && (int(s.w + .5) & 128) != 0) return s.y;
  }
  return floor(log2(max(artCellWorldSize(depth) * foliageTone.y, 1e-3)) + .5);
}
/** A world-anchored, domain-warped clump of about foliageTone.y cells. */
ivec3 clumpId(vec3 p, float level) {
  vec3 q = p / exp2(level);
  vec3 warp = vec3(artValueNoise(q * 1.3, 91), artValueNoise(q * 1.3 + 7.7, 93), artValueNoise(q * 1.3 + 19.1, 97)) - .5;
  return ivec3(floor(q + warp * 1.1)) + ivec3(0, int(level) * 977, 0);
}
/**
 * Foliage mass (surfaces.ts flags canopy cells and gives each world clump
 * one band offset). Sky and far background showing through a canopy as 1-2
 * cell holes take the darkest canopy entry around them, so trees read as
 * massed clumps with only larger sky clusters left open; under a warm key,
 * canopy edges facing the key or the sky catch clusters of 1-2 amber and gold
 * leaf glints on a world-anchored lattice (sunrise-wide, community).
 */
int calmVotes[8];
int calmCount = 0;
/** The most common of the gathered canopy entries (ties: the darker). */
int commonEntry() {
  int winner = calmVotes[0], best = 0;
  for (int k = 0; k < 8; k++) {
    if (k >= calmCount) break;
    int c = 0;
    for (int j = 0; j < 8; j++) if (j < calmCount && calmVotes[j] == calmVotes[k]) c++;
    if (c > best || (c == best && entryLab(calmVotes[k]).x < entryLab(winner).x)) { best = c; winner = calmVotes[k]; }
  }
  return winner;
}
/** Local light of a canopy: the mean graded OKLab of its cells on this layer (13 cells). */
vec3 canopyLight(ivec2 cell, float depth) {
  vec3 sum = vec3(0.);
  float n = 0.;
  for (int k = 0; k < 13; k++) {
    ivec2 o = k < 9 ? ivec2(k % 3 - 1, k / 3 - 1) : k == 9 ? ivec2(2, 0) : k == 10 ? ivec2(-2, 0) : k == 11 ? ivec2(0, 2) : ivec2(0, -2);
    ivec2 c = cell + o;
    if (!canopy(c) || abs(depthAt(c) - depth) > .15 * depth) continue;
    sum += texelFetch(graded, artClamp(c), 0).xyz;
    n += 1.;
  }
  return n > 0. ? sum / n : texelFetch(graded, cell, 0).xyz;
}
/** Street-lamp light on a canopy point: 1 near a lamp head, 0 at foliageLampReach metres. */
float lampLit(vec3 p) {
  float lit = 0.;
  for (int i = 0; i < ${MAX_LAMP_HEADS}; i++) {
    if (i >= foliageLampCount) break;
    lit = max(lit, 1. - smoothstep(.3 * foliageLampReach, foliageLampReach, distance(p, foliageLamp[i].xyz)));
  }
  return lit;
}
/**
 * The front of a canopy around a cell: the nearest depth of its canopy cells
 * on this layer within two cells. World points built on it do not scatter
 * with each leaf's depth (a crown is metres deep: per-leaf points fell into a
 * different clump every cell, salt and pepper).
 */
float canopyFront(ivec2 cell, float depth) {
  float front = depth;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    ivec2 c = cell + ivec2(x, y);
    float d = depthAt(c);
    if (d < front && d > depth * .8 && canopy(c)) front = d;
  }
  return front;
}
/**
 * The sky around a canopy cell: straight up and along the two up-diagonals,
 * in 2-cell steps up to 32 cells. x: the lightest graded L found (9: none);
 * y: 1 when that sky is not violet or indigo (the sunrise's peach, coral and
 * mauve, where backlit trees keep round 2's dark silhouettes with gold rims). Three rays, not one
 * column: a single column scan changed the canopy's cap column by column
 * (vertical streaks through the crowns).
 */
vec2 skyAround(ivec2 cell) {
  float L = -1., warm = 0.;
  for (int r = 0; r < 3; r++) {
    ivec2 dir = r == 0 ? ivec2(0, 2) : ivec2(r == 1 ? -1 : 1, 2);
    for (int k = 1; k <= 16; k++) {
      ivec2 c = cell + dir * k;
      if (c.y >= int(artSize.y) || c.x < 0 || c.x >= int(artSize.x)) break;
      if (texelFetch(resolvedData, c, 0).w < .5) continue;
      vec3 g = texelFetch(graded, c, 0).xyz;
      if (g.x > L) {
        L = g.x;
        // Violet and indigo skies (night, the violet dusk) are cool; the
        // sunrise's peach, coral and mauve are not.
        warm = length(g.yz) > .03 && abs(hueArc(atan(g.z, g.y), radians(285.))) < radians(50.) ? 0. : 1.;
      }
      break;
    }
  }
  return vec2(L < 0. ? 9. : L, warm);
}
int toneEntry(int family, int s) { return foliageTones[family * 5 + s]; }
float toneL(int family, int s) { return texelFetch(paletteLab, ivec2(toneEntry(family, s), 0), 0).x; }
/**
 * Clump tone of a canopy cell (refine round 3; community-wide and
 * garage-wide draw trees as clumps one band apart). The family is chosen per
 * region of about four clumps, so a crown keeps one family: olive where a
 * street lamp lights it, else teal-navy (teal only on lighter canopies). The
 * step is the one nearest the canopy's smoothed light, one lighter on about
 * half the clumps, plus lift (1 a clump's top cells, 2 the sky-side rim), and
 * never above cap (a night crown stays darker than the sky behind it).
 */
int clumpTone(vec3 light, ivec3 id, ivec3 region, float lit, int lift, float cap) {
  float h1 = artHash01(region + ivec3(0, 0, 1103)), h2 = artHash01(id + ivec3(0, 0, 2207));
  int family = lit > .35 ? 2 : h1 < .65 ? 0 : 1;
  float L = light.x + (h2 - .5) * .03;
  int s = 0;
  for (int k = 1; k < 5; k++) if (abs(toneL(family, k) - L) < abs(toneL(family, s) - L)) s = k;
  s = clamp(s + (h2 > .5 ? 1 : 0) + lift, 0, 4);
  for (int k = 0; k < 4; k++) {
    if (s == 0 || toneL(family, s) <= cap) break;
    s--;
  }
  return toneEntry(family, s);
}
/**
 * The light of a whole clump (refine round 3): the canopy light at the cell
 * its lattice centre projects to (the same for every cell of the clump), or
 * this cell's own where the centre falls off the canopy. Chosen per cell, the
 * step followed each leaf's light and speckled and boiled.
 */
vec3 clumpLight(vec3 p, float level, ivec2 cell, float depth, vec3 own) {
  vec3 q = p / exp2(level);
  vec3 warp = vec3(artValueNoise(q * 1.3, 91), artValueNoise(q * 1.3 + 7.7, 93), artValueNoise(q * 1.3 + 19.1, 97)) - .5;
  vec3 centre = (floor(q + warp * 1.1) + .5 - warp * 1.1) * exp2(level);
  vec4 clip = foliageViewProjection * vec4(centre, 1.);
  if (clip.w <= 1e-4) return own;
  ivec2 c = ivec2(floor((clip.xy / clip.w * .5 + .5) * artSize));
  if (any(lessThan(c, ivec2(0))) || any(greaterThanEqual(c, ivec2(artSize)))) return own;
  float d = depthAt(c);
  if (!canopy(c) || abs(d - depth) > .25 * depth) return own;
  return canopyLight(c, d);
}
/** The tone of a canopy cell's clump body (no lift): a hole it closes takes it. */
int bodyTone(ivec2 c, float cap) {
  float depth = depthAt(c);
  float front = canopyFront(c, depth), level = clumpLevel(c, depth);
  vec3 p = artWorldPosition(vec2(c) + .5, front);
  float lit = lampLit(p);
  return clumpTone(clumpLight(p, level, c, depth, canopyLight(c, depth)), clumpId(p, level), clumpId(p, level + 2.), lit, 0, lit > .25 ? 9. : cap);
}
void main() {
  ivec2 cell = artCell();
  vec4 current = texelFetch(image, cell, 0);
  outImage = current;
  if (artSurfaceReady < .5) return;
  vec4 m = texelFetch(marks, cell, 0);
  if (max(m.r, max(m.g, m.b)) > .5) return;
  float depth = depthAt(cell);
  bool leaf = canopy(cell);
  // The canopy around: cells in front (holes), canopy in front (the darkest
  // closes a hole), and canopy on this cell's own layer (their entries vote).
  int nearer = 0, inFront = 0, darkest = -1;
  float darkL = 9., sumL = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    if (x == 0 && y == 0) continue;
    ivec2 other = cell + ivec2(x, y);
    float d = depthAt(other);
    bool front = d < depth * .85;
    nearer += front ? 1 : 0;
    if (!canopy(other)) continue;
    int index = indexOf(texelFetch(image, artClamp(other), 0));
    float L = entryLab(index).x;
    if (front) {
      inFront++;
      if (L < darkL) { darkL = L; darkest = index; }
    } else if (d < depth * 1.15) {
      calmVotes[calmCount++] = index;
      sumL += L;
    }
  }
  float ownL = entryLab(indexOf(current)).x;
  // Night foliage (refine round 3): a dark canopy (black masses) is redrawn
  // as clumps: teal-navy clumps one band apart, their top cells a band
  // lighter, the sky-side silhouette lighter again, and near street lamps
  // olive clumps with amber and gold glints on their lit tops. Every choice is
  // world-anchored (the clump), from smoothed light, or per crown (the sky
  // cap), so the canopy neither boils with the render's per-leaf light nor
  // streaks. An unflagged cell amid canopy on its own layer (a leaf the flag
  // missed) is part of the crown.
  bool crown = leaf || (depth < 1e8 && calmCount >= 5);
  if (foliageTone.x > .5 && crown) {
    float front = canopyFront(cell, depth), level = clumpLevel(cell, depth);
    vec3 p = artWorldPosition(vec2(cell) + .5, front);
    vec3 light = clumpLight(p, level, cell, depth, canopyLight(cell, depth));
    float lit = lampLit(p) * (1. - smoothstep(.45 * foliageToneFar, .6 * foliageToneFar, depth));
    bool dark = light.x < foliageTone.z;
    // Far crowns keep the render's dark mass, thinning out clump by clump.
    if (artHash01(clumpId(p, level) + ivec3(0, 0, 3313)) >= 1. - smoothstep(.7 * foliageToneFar, foliageToneFar, depth)) { dark = false; lit = 0.; }
    vec2 sky = dark || lit > .25 ? skyAround(cell) : vec2(9., 0.);
    // Toned where the sky around is cool (night, the violet dusk), or where
    // no sky shows and the key is cool; lamp-lit crowns everywhere.
    bool cool = sky.x < 8. ? sky.y < .5 : keyLight.y < .5;
    if ((dark && cool) || lit > .25) {
      ivec3 id = clumpId(p, level), region = clumpId(p, level + 2.);
      // The outer top silhouette: open (sky or far background) for two cells
      // above, with a neighbour along the edge open above too (no rim dots).
      bool open1 = depthAt(cell + ivec2(0, 1)) > depth * 1.3;
      bool rim = open1 && depthAt(cell + ivec2(0, 2)) > depth * 1.3
        && ((canopy(cell + ivec2(1, 0)) && depthAt(cell + ivec2(1, 1)) > depth * 1.3)
          || (canopy(cell - ivec2(1, 0)) && depthAt(cell + ivec2(-1, 1)) > depth * 1.3));
      // A clump's top cells: the cell above, at the same canopy front, lies in
      // another clump (one clean boundary, not a per-leaf depth comparison).
      bool top = foliageToneLift > .5 && !open1 && clumpId(artWorldPosition(vec2(cell + ivec2(0, 1)) + .5, front), level) != id;
      float cap = lit > .25 || sky.x > 8. ? 9. : sky.x + (rim ? .07 : top ? 0. : -.03);
      outImage = entryTexel(clumpTone(light, id, region, lit, rim ? 2 : top ? 1 : 0, cap));
      if (lit > .25 && (rim || top) && foliageTone.w > 0.
        && anchoredHash(cell, texelFetch(resolvedData, cell, 0), 2., 71) < foliageTone.w * lit) {
        outImage = entryTexel(rim ? foliageGlints.y : foliageGlints.x);
      }
      return;
    }
  }
  // A lone leaf far brighter than the canopy around it (backlit leaf edges,
  // speculars on the render's leaves) takes the canopy's most common entry
  // (refine round 2): a canopy reads as clump tones, only its lit silhouette
  // sparkles. The flag covers about half of a canopy's cells, so unflagged
  // cells amid five flagged ones count as canopy here.
  bool calm = calmCount >= (leaf ? 4 : 5) && ownL >= sumL / float(max(calmCount, 1)) + foliageShape.w;
  if (!leaf) {
    if (foliageShape.x <= 0.) return;
    // A hole closes when enough canopy stands in front of it, or six
    // neighbours do and one of them is canopy (refine round 2: backlit trees
    // at sunrise were peppered with single sky cells).
    if ((float(inFront) >= foliageShape.x || (nearer >= 6 && inFront >= 1)) && darkest >= 0) {
      outImage = entryTexel(darkest);
      // With clump tones a hole in a toned crown takes its clump's body tone.
      if (foliageTone.x > .5) {
        for (int k = 0; k < 4; k++) {
          ivec2 c = cell + CROSS[k];
          if (!canopy(c) || depthAt(c) >= depth * .85) continue;
          vec3 light = canopyLight(c, depthAt(c));
          if (light.x >= foliageTone.z) break;
          vec2 sky = skyAround(cell);
          if (sky.x < 8. ? sky.y < .5 : keyLight.y < .5) outImage = entryTexel(bodyTone(c, sky.x < 8. ? sky.x - .03 : 9.));
          break;
        }
      }
    }
    else if (calm) outImage = entryTexel(commonEntry());
    return;
  }
  bool glinting = keyLight.y > .5 && keyLight.x >= .2 && foliageShape.y > 0. && depth <= foliageShape.z;
  // Leaf glints (refine round 2) sit only on the lit side of a canopy mass:
  // within two cells of its outer silhouette against sky or far background
  // (a hole in the canopy does not count; neither does a wall or an eave
  // right behind it), on the side facing the key or the sky, and they come
  // in clusters of 2-4 cells on a world-anchored 3-cell lattice, a gold cell
  // on the edge and amber inward (community, sunrise-wide), instead of single
  // dots scattered over the whole canopy.
  vec2 outward = vec2(0.);
  int edge = 3;
  for (int d = 1; d <= 2; d++) for (int k = 0; k < 4; k++) {
    ivec2 step = CROSS[k];
    if (depthAt(cell + step * d) > depth * 1.15 && depthAt(cell + step * (d + 1)) > depth * 1.15
      && depthAt(cell + step * (d + 3)) > depth * 1.15) {
      outward += vec2(step) / float(d);
      edge = min(edge, d);
    }
  }
  if (edge > 2) {
    if (calm) outImage = entryTexel(commonEntry());
    return;
  }
  if (!glinting || dot(outward, outward) < .2) return;
  vec2 dir = normalize(outward);
  if (max(dot(dir, keyLightScreen.xy) * keyLightScreen.z, .8 * dir.y) < .35) return;
  // The edge of a canopy mass, not a stray detail cell (a roof ridge or a
  // railing that reads as foliage): most of the cells around are canopy.
  int mass = 0, crownMass = 0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) mass += (x != 0 || y != 0) && canopy(cell + ivec2(x, y)) ? 1 : 0;
  // Refine round 3: and a crown, not lace: backlit lacy tops put gold dots
  // all through the canopy (fireflies), so the 5 x 5 around must be half canopy.
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) crownMass += canopy(cell + ivec2(x, y)) ? 1 : 0;
  if (mass < 4 || crownMass < 12 || texelFetch(graded, cell, 0).x < .2) return;
  vec4 data = texelFetch(resolvedData, cell, 0);
  if (anchoredHash(cell, data, 3., 31) >= foliageShape.y) return;
  // Inner cells of a cluster thin out: 2-4 cells, not a lit band.
  if (edge == 2 && anchoredHash(cell, data, 1., 41) >= .5) return;
  int entry = edge == 1 && dir.y > .3 ? foliageGlints.y : foliageGlints.x;
  if (entryLab(entry).x < ownL + .1) return;
  outImage = entryTexel(entry);
}`;

export interface Linework {
  /** lines, glints, glow, cleanup, foliage: insert after quantize, in this order. */
  readonly stages: readonly PixelArtStage[];
  configure(options: LineworkOptions): void;
  /**
   * For the car stages (cars.ts): the key light uniforms the lines stage
   * refreshes every frame, and the switch that hands car cells over to them.
   */
  readonly carHandoff: {
    keyLightDirection: THREE.IUniform<THREE.Vector3>;
    keyLight: THREE.IUniform<THREE.Vector2>;
    keyLightScreen: THREE.IUniform<THREE.Vector3>;
    lineSkipCars: THREE.IUniform<number>;
  };
  /** The ground stage's lamp heads (surfaces.ts), read every frame for the analytic lamp heads. */
  setLampHeads(heads: LampHeads): void;
}

/**
 * Creates the linework stages. `exposure` is the grade stage's exposure
 * uniform (shared by reference) so emitter and glint thresholds follow the
 * same exposure as the single tone map.
 */
export function createLinework(shared: PixelArtSharedUniforms, palette: PixelPalette,
  exposure: THREE.IUniform<number>): Linework {
  const entry = (hex: string) => nearestPaletteIndex(palette, hex);
  const c = LINEWORK_COLOURS;
  // Two MRT targets (image, marks) ping-pong between the drawing stages.
  const targets = [artTarget(THREE.UnsignedByteType, 'SORA pixel-art linework A', 2),
    artTarget(THREE.UnsignedByteType, 'SORA pixel-art linework B', 2)] as const;
  // Never drawn into except one clear per resize: the "no marks yet" input.
  const noMarks = artTarget(THREE.UnsignedByteType, 'SORA pixel-art no marks');
  // Emitters, ping-ponged: the seed pass keeps last frame's decisions (refine round 2).
  const glowSeeds = [artTarget(THREE.HalfFloatType, 'SORA pixel-art glow emitters A'),
    artTarget(THREE.HalfFloatType, 'SORA pixel-art glow emitters B')] as const;
  let seedIndex = 0, seedFrame = -2;
  // 32-bit: the packed halo (radius, hue, shape) and the source column (refine round 2).
  const glowSpread = artTarget(THREE.FloatType, 'SORA pixel-art glow rows');
  // One texel per lamp-head slot, ping-ponged: the visibility decision with hysteresis.
  const lampVisibility = [artTarget(THREE.UnsignedByteType, 'SORA pixel-art lamp visibility A'),
    artTarget(THREE.UnsignedByteType, 'SORA pixel-art lamp visibility B')] as const;
  for (const target of lampVisibility) target.setSize(LAMP_HEAD_SLOTS, 1);
  let clearMarks = true;

  const keyDirection = new THREE.Vector3(0, 1, 0);
  const keyLight = new THREE.Vector2(0, 1);
  const keyScreen = new THREE.Vector3(0, 1, 0);
  const keyProbe = createKeyLightProbe();
  const lineUniforms = {
    lineExposure: exposure, lineSkipCars: { value: 0 }, lineCanopy: { value: 1 },
    lineGap: { value: new THREE.Vector4() }, lineGapMetres: { value: 0 }, lineStepHeight: { value: 0 }, lineFade: { value: new THREE.Vector2() },
    keyLightDirection: { value: keyDirection }, keyLight: { value: keyLight }, keyLightScreen: { value: keyScreen },
    rimParams: { value: new THREE.Vector4() }, rimBeadCells: { value: 1 }, rimThin: { value: 8 }, creaseParams: { value: new THREE.Vector4() },
  };
  const glintUniforms = {
    lineExposure: exposure, glintParams: { value: new THREE.Vector4() }, glintEmitter: { value: 1 }, glintHold: { value: 1 }, glintCarFar: { value: 22 },
    lineSkipCars: lineUniforms.lineSkipCars,
    glintEntries: { value: new THREE.Vector4(entry(c.glintCream), entry(c.glintGold), entry(c.glintAmber), entry(c.glintPeach)) },
    glintConfirm: { value: new THREE.Vector3() },
  };
  const glowUniforms = {
    lineExposure: exposure, glowParams: { value: new THREE.Vector4() }, glowLimits: { value: new THREE.Vector3(GLOW_REACH, 12, 2) }, glowDark: { value: 0.3 },
    glowSeed: { value: glowSeeds[0].texture as THREE.Texture }, glowSpread: { value: glowSpread.texture },
    glowSeedPrevious: { value: glowSeeds[1].texture as THREE.Texture }, glowSeedValid: { value: 0 },
    glowEntries: { value: new THREE.Vector4(entry(c.lampCore), entry(c.lampRim), entry(c.lampSmall), entry(LAMP_HEAD_CORE)) },
    glowRings: { value: new THREE.Vector3(entry(LAMP_RING_COLOURS.farRing), entry(LAMP_RING_COLOURS.midRing), entry(LAMP_RING_COLOURS.midOuter)) },
    glowStable: { value: new THREE.Vector4() }, glowKeyLift: { value: 1 },
    keyLightDirection: lineUniforms.keyLightDirection, keyLight: lineUniforms.keyLight,
    glowShape: { value: new THREE.Vector4() },
    lampHeadCount: { value: 0 },
    lampHeadScreen: { value: Array.from({ length: MAX_LAMP_HEADS }, () => new THREE.Vector4()) },
    lampHeadShape: { value: Array.from({ length: MAX_LAMP_HEADS }, () => new THREE.Vector4()) },
    lampVisibility: { value: lampVisibility[0].texture as THREE.Texture }, glowSquash: { value: 1.4 },
  };
  const visibilityUniforms = {
    lampHeadCount: glowUniforms.lampHeadCount, lampHeadScreen: glowUniforms.lampHeadScreen, lampHeadShape: glowUniforms.lampHeadShape,
    lampVisibilityPrevious: { value: lampVisibility[1].texture as THREE.Texture }, lampVisibilityValid: { value: 0 },
  };
  let lampHeads: LampHeads | null = null;
  let headsOn = true, headSize = LINEWORK_DEFAULTS.lampHeadSize, headHalo = LINEWORK_DEFAULTS.lampHeadHalo;
  let headHaloNear = LINEWORK_DEFAULTS.lampHeadHaloNear, headMaxRadius: number = GLOW_REACH;
  let headMid = LINEWORK_DEFAULTS.lampHeadMid, headFar = LINEWORK_DEFAULTS.lampHeadFar, headBand = LINEWORK_DEFAULTS.lampHeadTierBand;
  const headClip = new THREE.Vector4(), headViewProjection = new THREE.Matrix4();
  const heads = createLampHeadSlots(LAMP_HEAD_SLOTS);
  /** Projects this frame's lamp heads into art cells, held on slots with hysteresis (allocation-free). */
  const projectLampHeads = (frame: PixelArtFrame) => {
    let count = 0;
    heads.beginFrame();
    if (headsOn && lampHeads) {
      const camera = frame.camera, size = frame.uniforms.artSize.value, cellScale = frame.uniforms.artCellWorldScale.value;
      headViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      for (let i = 0; i < lampHeads.count && count < MAX_LAMP_HEADS; i++) {
        // Lamps fading out toward sunrise draw no head.
        const level = lampHeads.level[i] ?? 0;
        if (level < 0.5) continue;
        const p = lampHeads.positions[i]!;
        headClip.set(p.x, p.y, p.z, 1).applyMatrix4(headViewProjection);
        if (headClip.w <= 0.5) continue;
        const x = (headClip.x / headClip.w * 0.5 + 0.5) * size.x, y = (headClip.y / headClip.w * 0.5 + 0.5) * size.y;
        if (x < -4 || y < -4 || x > size.x + 4 || y > size.y + 4) continue;
        const depth = headClip.w;
        // Refine round 3: toward lampHeadMid a near head shrinks from 7 x 3
        // to 3 x 1 and its halo by 40%; beyond it the slot's tier collapses
        // it (see createLampHeadSlots), so a receding row reads as dots, not
        // a chain of orbs.
        const shrink = headMid > 0 ? THREE.MathUtils.smoothstep(depth, 0.5 * headMid, headMid) : 0;
        const halfWidth = THREE.MathUtils.clamp(headSize / Math.max(cellScale * depth, 1e-6), 0.5, 3 - 2 * shrink);
        const halo = (headHalo + headHaloNear * (1 - THREE.MathUtils.clamp(depth / 140, 0, 1)))
          * THREE.MathUtils.smoothstep(level, 0.5, 0.7) * (1 - 0.4 * shrink);
        const slot = heads.hold(p.x, p.y, p.z, x, y, halfWidth, halo >= 1 ? Math.min(halo, headMaxRadius) : 0,
          depth, headMid, headFar, headBand);
        if (slot < 0) continue;
        // A mid-distance head is 2 x 1: centred on the cell edge right of its held cell.
        const tier = heads.tier[slot]!;
        glowUniforms.lampHeadScreen.value[count]!.set(heads.cellX[slot]! + (tier === 1 ? 1 : 0.5), heads.cellY[slot]! + 0.5, depth, heads.half[slot]!);
        glowUniforms.lampHeadShape.value[count]!.set(heads.halo[slot]!, slot, heads.fresh[slot]!, tier);
        count++;
      }
    }
    glowUniforms.lampHeadCount.value = count;
  };
  let visibilityIndex = 0, visibilityFrame = -2, glowFrame = 0;
  const cleanupUniforms = { lineExposure: exposure, cleanupKeep: { value: 0 }, cleanupEmitter: { value: 1 }, cleanupSimilar: { value: 0.08 },
    inkCleanup: { value: 1 }, inkRun: { value: 0 }, wireShape: { value: new THREE.Vector2() } };
  const foliageUniforms = {
    lineExposure: exposure, foliageShape: { value: new THREE.Vector4() },
    foliageGlints: { value: new THREE.Vector2(entry(FOLIAGE_GLINTS.amber), entry(FOLIAGE_GLINTS.gold)) },
    keyLightDirection: lineUniforms.keyLightDirection, keyLight: lineUniforms.keyLight, keyLightScreen: lineUniforms.keyLightScreen,
    foliageMask: { value: glowSeeds[0].texture as THREE.Texture }, foliageMaskReady: { value: 0 },
    foliageTone: { value: new THREE.Vector4() }, foliageLampReach: { value: 6 }, foliageToneFar: { value: 45 }, foliageToneLift: { value: 1 }, foliageViewProjection: { value: new THREE.Matrix4() }, foliageLampCount: { value: 0 },
    foliageLamp: { value: Array.from({ length: MAX_LAMP_HEADS }, () => new THREE.Vector4()) },
    foliageTones: { value: [...FOLIAGE_TONES.navy, ...FOLIAGE_TONES.teal, ...FOLIAGE_TONES.olive].map(entry) },
  };
  /** This frame's street-lamp heads (world) for the foliage stage's lamp-lit clumps (allocation-free). */
  const updateFoliageLamps = () => {
    let count = 0;
    if (lampHeads) {
      for (let i = 0; i < lampHeads.count && count < MAX_LAMP_HEADS; i++) {
        if ((lampHeads.level[i] ?? 0) < 0.5) continue;
        const p = lampHeads.positions[i]!;
        foliageUniforms.foliageLamp.value[count++]!.set(p.x, p.y, p.z, 1);
      }
    }
    foliageUniforms.foliageLampCount.value = count;
  };

  const linesMaterial = stageMaterial('SORA pixel-art lines', shared, LINES_FRAGMENT, lineUniforms);
  const glintsMaterial = stageMaterial('SORA pixel-art glints', shared, GLINTS_FRAGMENT, glintUniforms);
  const seedMaterial = stageMaterial('SORA pixel-art glow emitters', shared, GLOW_SEED_FRAGMENT, glowUniforms);
  const spreadMaterial = stageMaterial('SORA pixel-art glow rows', shared, GLOW_SPREAD_FRAGMENT, glowUniforms);
  const glowMaterial = stageMaterial('SORA pixel-art glow', shared, GLOW_FRAGMENT, glowUniforms);
  const visibilityMaterial = stageMaterial('SORA pixel-art lamp visibility', shared, LAMP_VISIBILITY_FRAGMENT, visibilityUniforms);
  const cleanupMaterial = stageMaterial('SORA pixel-art cleanup', shared, CLEANUP_FRAGMENT, cleanupUniforms);
  const foliageMaterial = stageMaterial('SORA pixel-art foliage', shared, FOLIAGE_FRAGMENT, foliageUniforms);

  /** Draws into whichever linework target is not the current image, then rebinds image and marks. */
  const drawMarked = (frame: PixelArtFrame, material: THREE.RawShaderMaterial) => {
    const target = frame.uniforms.image.value === targets[0].textures[0] ? targets[1] : targets[0];
    frame.draw(material, target);
    frame.uniforms.image.value = target.textures[0]!;
    frame.uniforms.marks.value = target.textures[1]!;
  };

  const lines: PixelArtStage = {
    name: 'lines', enabled: true,
    setSize(grid: PixelArtGrid) {
      for (const target of [...targets, noMarks, ...glowSeeds, glowSpread]) target.setSize(grid.artWidth, grid.artHeight);
      seedFrame = -2;
      clearMarks = true;
    },
    beginFrame(frame) {
      if (clearMarks) {
        frame.renderer.setRenderTarget(noMarks);
        frame.renderer.setClearColor(0x000000, 0);
        frame.renderer.clear(true, false, false);
        clearMarks = false;
      }
      frame.uniforms.marks.value = noMarks.texture;
      // The foliage stage reads the held canopy mask only once the glow seed pass has drawn it this frame.
      foliageUniforms.foliageMaskReady.value = 0;
    },
    render(frame) {
      keyProbe.update(frame.scene, frame.camera, keyDirection, keyLight, keyScreen);
      drawMarked(frame, linesMaterial);
    },
    dispose() {
      linesMaterial.dispose();
      for (const target of [...targets, noMarks, ...glowSeeds, glowSpread]) target.dispose();
    },
  };
  const glints: PixelArtStage = {
    name: 'glints', enabled: true,
    setSize() { /* sized by the lines stage */ },
    render(frame) { drawMarked(frame, glintsMaterial); },
    dispose() { glintsMaterial.dispose(); },
  };
  const glow: PixelArtStage = {
    name: 'glow', enabled: true,
    setSize() { /* sized by the lines stage */ },
    render(frame) {
      glowFrame++;
      projectLampHeads(frame);
      // One visibility decision per lamp head, against last frame's.
      const write = lampVisibility[visibilityIndex], read = lampVisibility[1 - visibilityIndex];
      visibilityUniforms.lampVisibilityPrevious.value = read.texture;
      visibilityUniforms.lampVisibilityValid.value = visibilityFrame === glowFrame - 1 ? 1 : 0;
      frame.draw(visibilityMaterial, write);
      glowUniforms.lampVisibility.value = write.texture;
      visibilityIndex = 1 - visibilityIndex;
      visibilityFrame = glowFrame;
      const seed = glowSeeds[seedIndex];
      glowUniforms.glowSeedPrevious.value = glowSeeds[1 - seedIndex].texture;
      glowUniforms.glowSeedValid.value = seedFrame === glowFrame - 1 ? 1 : 0;
      frame.draw(seedMaterial, seed);
      glowUniforms.glowSeed.value = seed.texture;
      foliageUniforms.foliageMask.value = seed.texture;
      foliageUniforms.foliageMaskReady.value = glowUniforms.glowStable.value.z;
      seedIndex = 1 - seedIndex;
      seedFrame = glowFrame;
      frame.draw(spreadMaterial, glowSpread);
      drawMarked(frame, glowMaterial);
    },
    dispose() {
      seedMaterial.dispose(); spreadMaterial.dispose(); glowMaterial.dispose(); visibilityMaterial.dispose();
      for (const target of lampVisibility) target.dispose();
    },
  };
  const cleanup: PixelArtStage = {
    name: 'cleanup', enabled: true,
    setSize() { /* writes the shared image chain */ },
    render(frame) { frame.draw(cleanupMaterial, frame.beginImageWrite()); frame.endImageWrite(); },
    dispose() { cleanupMaterial.dispose(); },
  };
  const foliage: PixelArtStage = {
    name: 'foliage', enabled: true,
    setSize() { /* writes the shared image chain */ },
    render(frame) {
      if (frame.uniforms.artSurfaceReady.value < 0.5) return;
      updateFoliageLamps();
      foliageUniforms.foliageViewProjection.value.multiplyMatrices(frame.camera.projectionMatrix, frame.camera.matrixWorldInverse);
      frame.draw(foliageMaterial, frame.beginImageWrite()); frame.endImageWrite();
    },
    dispose() { foliageMaterial.dispose(); },
  };

  return {
    stages: [lines, glints, glow, cleanup, foliage],
    carHandoff: {
      keyLightDirection: lineUniforms.keyLightDirection, keyLight: lineUniforms.keyLight,
      keyLightScreen: lineUniforms.keyLightScreen, lineSkipCars: lineUniforms.lineSkipCars,
    },
    setLampHeads(heads) { lampHeads = heads; },
    configure(o) {
      lines.enabled = o.lines > 0; glints.enabled = o.glints > 0; glow.enabled = o.glow > 0; cleanup.enabled = o.cleanup > 0;
      foliage.enabled = o.foliage > 0;
      foliageUniforms.foliageShape.value.set(Math.max(0, o.foliageFill), THREE.MathUtils.clamp(o.foliageGlint, 0, 1), Math.max(0, o.foliageGlintFar),
        o.foliageCalm > 0 ? o.foliageCalm : 9);
      lineUniforms.lineGap.value.set(o.lineGapStart, Math.max(o.lineGapFull, o.lineGapStart + 1e-3), o.lineMinFill, 1.5 * o.emitterThreshold);
      lineUniforms.lineFade.value.set(o.lineFadeStart, Math.max(o.lineFadeEnd, o.lineFadeStart + 1e-3));
      lineUniforms.lineGapMetres.value = o.lineGapMetres;
      lineUniforms.lineStepHeight.value = o.lineStepHeight;
      lineUniforms.lineCanopy.value = o.lineSkipCanopy > 0 ? 1 : 0;
      lineUniforms.rimBeadCells.value = Math.max(1, o.rimBeadCells);
      lineUniforms.rimThin.value = THREE.MathUtils.clamp(o.rimThinCells, 4, 12);
      lineUniforms.rimParams.value.set(o.rimBeadKeep, o.rimMinFill, o.rimKeyStart, Math.max(o.rimKeyFull, o.rimKeyStart + 1e-3));
      lineUniforms.creaseParams.value.set(Math.cos(o.creaseAngle * Math.PI / 180), o.creaseFadeEnd, o.creaseBeadKeep, 0);
      glintUniforms.glintParams.value.set(o.glintThreshold, o.glintContrast, o.glintStreak, o.glintFadeEnd);
      glintUniforms.glintEmitter.value = o.emitterThreshold;
      glintUniforms.glintHold.value = THREE.MathUtils.clamp(o.glintHold, 0.1, 1);
      glintUniforms.glintCarFar.value = Math.max(0, o.glintCarFadeEnd);
      glowUniforms.glowParams.value.set(o.emitterThreshold, o.glowRadius, o.glowRadiusPerStop, o.glowRadiusPerCell);
      glowUniforms.glowLimits.value.set(Math.min(GLOW_REACH, Math.max(1, o.glowMaxRadius)), o.glowPanelCells, o.glowContrast);
      glowUniforms.glowDark.value = o.glowDarkSurround;
      const stable = o.glowStable > 0;
      glowUniforms.glowShape.value.set(o.glowSpeckle, o.glowLightness, o.glowChroma, stable ? Math.max(2, o.glowRampCells) : 0);
      glowUniforms.glowStable.value.set(stable ? 1 : 0, o.glowKeySpecular > 0 ? Math.cos(o.glowKeySpecular * Math.PI / 180) : -2,
        o.foliageTones > 0 ? 1 : 0, Math.max(1, o.foliageToneCells));
      glowUniforms.glowKeyLift.value = Math.max(0, o.glowKeyLift);
      glintUniforms.glintConfirm.value.set(o.glintConfirm > 0 ? 1 : 0, THREE.MathUtils.clamp(Math.round(o.glintRidgeCells), 0, 4),
        THREE.MathUtils.clamp(o.glintRidgeKeep, 0.05, 1));
      headsOn = o.lampHeads > 0;
      headSize = Math.max(0.01, o.lampHeadSize);
      headHalo = Math.max(0, o.lampHeadHalo);
      headHaloNear = Math.max(0, o.lampHeadHaloNear);
      headMaxRadius = Math.min(GLOW_REACH, Math.max(1, o.glowMaxRadius));
      headMid = Math.max(0, o.lampHeadMid);
      headFar = Math.max(0, o.lampHeadFar);
      headBand = Math.max(0, o.lampHeadTierBand);
      glowUniforms.glowSquash.value = THREE.MathUtils.clamp(o.lampHeadSquash, 1, 2);
      cleanupUniforms.cleanupKeep.value = o.cleanupKeep;
      cleanupUniforms.cleanupEmitter.value = o.emitterThreshold;
      cleanupUniforms.cleanupSimilar.value = o.cleanupSimilar;
      cleanupUniforms.inkCleanup.value = o.inkCleanup > 0 ? 1 : 0;
      cleanupUniforms.inkRun.value = Math.max(0, Math.round(o.inkRunCells));
      cleanupUniforms.wireShape.value.set(o.wireConnect > 0 ? 1 : 0, THREE.MathUtils.clamp(o.wireCover, 0.05, 0.9));
      foliageUniforms.foliageTone.value.set(Math.max(0, o.foliageTones), Math.max(1, o.foliageToneCells), o.foliageToneMax,
        THREE.MathUtils.clamp(o.foliageLampGlint, 0, 1));
      foliageUniforms.foliageLampReach.value = Math.max(0.5, o.foliageLampReach);
      foliageUniforms.foliageToneFar.value = Math.max(1, o.foliageToneFar);
      foliageUniforms.foliageToneLift.value = o.foliageToneLift > 0 ? 1 : 0;
    },
  };
}

/**
 * Lamp-head slots (refine round 2). Each lamp keeps its slot while it stays on
 * screen (matched by world position to a slot used last frame), so its
 * visibility decision carries from frame to frame, and its cell, half-width
 * and halo radius are held with hysteresis: the cell moves only when the
 * projected centre leaves it by more than 0.75 cell, the half-width snaps to
 * half cells when it drifts 0.35 off, the halo radius to whole cells when it
 * drifts 0.85 off. So a lamp no longer reshapes every frame as its sub-cell
 * position and depth change. Allocation-free.
 *
 * Refine round 3: given its depth and the tier distances (mid, far, band), a
 * slot also holds a tier: 0 near (the shape above), 1 beyond mid (a 2 x 1
 * core centred on the edge right of the held cell, which tracks x - 0.5, and
 * a 1.6-cell ring), 2 beyond far (a single cell and a 1.2-cell ring). A tier
 * changes only once the depth is band / 2 past a boundary, so an approaching
 * lamp steps once per boundary, never back and forth.
 */
export const LAMP_TIER_HALO = [0, 1.6, 1.2] as const;
export function createLampHeadSlots(size: number) {
  const position = new Float32Array(size * 3);
  const seen = new Int32Array(size).fill(-1000);
  const cellX = new Float32Array(size), cellY = new Float32Array(size), half = new Float32Array(size);
  const halo = new Float32Array(size), fresh = new Float32Array(size), tier = new Int8Array(size);
  let frame = 0;
  const snapHalf = (w: number) => Math.max(0.5, Math.round(w * 2) / 2);
  const tierFor = (depth: number, mid: number, far: number, band: number, was: number) => {
    if (!(mid > 0) || !(depth > 0)) return 0;
    const b = 0.5 * Math.max(0, band), farAt = far > mid ? far : Infinity;
    if (was < 0) return depth >= farAt ? 2 : depth >= mid ? 1 : 0;
    let t = was;
    if (t === 0 && depth > mid + b) t = depth > farAt + b ? 2 : 1;
    else if (t === 1) t = depth > farAt + b ? 2 : depth < mid - b ? 0 : 1;
    else if (t === 2 && depth < farAt - b) t = depth < mid - b ? 0 : 1;
    return t;
  };
  return {
    cellX, cellY, half, halo, fresh, tier,
    beginFrame() { frame++; },
    /** The slot holding this lamp (world position) this frame, updated from its projection (cells), or -1. */
    hold(wx: number, wy: number, wz: number, x: number, y: number, halfWidth: number, haloRadius: number,
      depth = 0, mid = 0, far = 0, band = 0): number {
      let slot = -1;
      for (let s = 0; s < size; s++) {
        if (seen[s] !== frame - 1) continue;
        const dx = position[s * 3]! - wx, dy = position[s * 3 + 1]! - wy, dz = position[s * 3 + 2]! - wz;
        if (dx * dx + dy * dy + dz * dz < 0.25) { slot = s; break; }
      }
      const held = slot >= 0;
      if (!held) {
        let oldest = Infinity;
        for (let s = 0; s < size; s++) if (seen[s]! < frame - 1 && seen[s]! < oldest) { oldest = seen[s]!; slot = s; }
        if (slot < 0) return -1;
      }
      const next = tierFor(depth, mid, far, band, held ? tier[slot]! : -1);
      const tx = next === 1 ? x - 0.5 : x;
      if (held && next === tier[slot]) {
        fresh[slot] = 0;
        if (tx < cellX[slot]! - 0.75 || tx >= cellX[slot]! + 1.75) cellX[slot] = Math.floor(tx);
        if (y < cellY[slot]! - 0.75 || y >= cellY[slot]! + 1.75) cellY[slot] = Math.floor(y);
        if (Math.abs(halfWidth - half[slot]!) > 0.35) half[slot] = snapHalf(halfWidth);
        if (Math.abs(haloRadius - halo[slot]!) > 0.85) halo[slot] = Math.round(haloRadius);
      } else {
        fresh[slot] = held ? 0 : 1;
        cellX[slot] = Math.floor(tx); cellY[slot] = Math.floor(y);
        half[slot] = snapHalf(halfWidth); halo[slot] = Math.round(haloRadius);
      }
      tier[slot] = next;
      if (next > 0) { half[slot] = next === 1 ? 1 : 0.5; halo[slot] = haloRadius > 0 ? LAMP_TIER_HALO[next]! : 0; }
      position[slot * 3] = wx; position[slot * 3 + 1] = wy; position[slot * 3 + 2] = wz;
      seen[slot] = frame;
      return slot;
    },
  };
}

/**
 * Finds the scene's key light (the strongest top-level shadow-casting
 * directional light) once per scene and reads, every frame and without
 * allocating: its world direction (toward the light), strength and warmth,
 * and its direction in the image plane (xy) with the reliability of that
 * projection (z: 0 when the light is straight along the view axis).
 */
function createKeyLightProbe() {
  let scene: THREE.Scene | null = null;
  let light: THREE.DirectionalLight | null = null;
  const from = new THREE.Vector3(), to = new THREE.Vector3();
  const find = (target: THREE.Scene) => {
    scene = target;
    light = null;
    for (const child of target.children) {
      const candidate = child as THREE.DirectionalLight;
      if (!candidate.isDirectionalLight) continue;
      if (!light || (candidate.castShadow && !light.castShadow)
        || (candidate.castShadow === light.castShadow && candidate.intensity > light.intensity)) light = candidate;
    }
  };
  return {
    update(target: THREE.Scene, camera: THREE.Camera, direction: THREE.Vector3, key: THREE.Vector2, screen: THREE.Vector3) {
      if (target !== scene || (light && light.parent !== target)) find(target);
      if (!light) { direction.set(0, 1, 0); key.set(0, 1); screen.set(0, 1, 0); return; }
      light.getWorldPosition(from);
      light.target.getWorldPosition(to);
      direction.subVectors(from, to);
      if (direction.lengthSq() < 1e-12) direction.set(0, 1, 0); else direction.normalize();
      const { r, g, b } = light.color;
      // Warm keys (dusk sun) rim in amber, cool keys (moon) in lavender.
      key.set(THREE.MathUtils.smoothstep(light.intensity, 0.3, 1.2), r + g * 0.5 >= b * 1.5 ? 1 : 0);
      to.copy(direction).transformDirection(camera.matrixWorldInverse);
      const planar = Math.hypot(to.x, to.y);
      if (planar < 1e-4) screen.set(0, 1, 0);
      else screen.set(to.x / planar, to.y / planar, key.x * THREE.MathUtils.smoothstep(planar, 0.15, 0.5));
    },
  };
}
