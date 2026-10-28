import * as THREE from 'three';
import type { PixelArtGrid } from './grid';
import { PIXEL_ART_BAND_OFFSET } from './glsl';
import { artTarget, stageMaterial, type PixelArtSharedUniforms, type PixelArtStage } from './stages';
import { MAX_MOVERS, type MoverSlots } from './surfaces';

/**
 * Reprojected OKLab accumulation (docs/pixel-art-renderer.md, "Temporal
 * stability and surfaces"): between carPaint and quantize, every world and car
 * cell blends its graded OKLab with last frame's accumulated value at the
 * point where its anchor was (world points directly, car cells through their
 * car's previous transform). The history is accepted only where last frame's
 * depth there matches (bilinear over the matching cells, or the best depth
 * match in the 3 x 3 around it for foliage and thin geometry) and is clamped to
 * the current 3 x 3 OKLab neighbourhood, so sub-cell aliasing (canopy, facade
 * texture, far ground, rival paint) is supersampled over a few frames while
 * disocclusions, cuts and changes of light show at once. The palette snap then
 * sees a steady value and stops flipping between neighbouring entries.
 *
 * Sky cells (direction anchored, already stable) and ground drawn with the
 * screen-row dashes at speed (whose dashes hold still in screen space while the
 * world slides under them) take the current value.
 */
export interface AccumulateOptions {
  /** 1 runs the accumulation (0: the A/B baseline, the graded image goes straight to quantize). */
  temporalAccumulate: number;
  /** Share of the current frame in the blend on world cells (the rest is the clamped history). */
  accumulateCurrent: number;
  /** The same on car cells (reprojected with their car). */
  accumulateCarCurrent: number;
  /** Widening of the clamp box (OKLab L; a and b take half). */
  accumulatePad: number;
  /** Relative depth mismatch at which a history cell is another surface. */
  accumulateDepthTolerance: number;
  /** Extra current share per cell of reprojection distance beyond 8 cells (fast walls keep crisp edges). */
  accumulateSpeedCurrent: number;
  /**
   * Current share on ground drawn with the screen-row dashes at speed, whose
   * history is the same dash where its row's scroll register moved it (the
   * rendered asphalt streams under the dashes at tens of cells per frame and
   * its texture is noise there; lane paint and reflections take the current
   * frame). 1: no accumulation on screen-row ground.
   */
  accumulateRowCurrent: number;
  /**
   * 1: the value accumulated is the graded lightness plus the band offset
   * (the quantize stage's dither field), so a band field that aliases on
   * sliding walls or re-rolls on leaf hits is smoothed over time too; the
   * quantize and temporal stages then read the accumulated value as is.
   */
  accumulateOffset: number;
}

export const ACCUMULATE_DEFAULTS: AccumulateOptions = {
  temporalAccumulate: 1, accumulateCurrent: 0.35, accumulateCarCurrent: 0.4, accumulatePad: 0.01,
  accumulateDepthTolerance: 0.05, accumulateSpeedCurrent: 0, accumulateOffset: 1, accumulateRowCurrent: 0.35,
};

const ACCUMULATE_FRAGMENT = /* glsl */ `
${PIXEL_ART_BAND_OFFSET}
const int MAX_MOVERS = ${MAX_MOVERS};
uniform float bandStep;
uniform float bandStrength;
uniform float accumOffset;              // 1: the band offset is accumulated with the lightness
uniform vec4 moverMin[MAX_MOVERS];      // w: 1 when last frame's transform is known
uniform mat4 moverPrevious[MAX_MOVERS]; // last frame's local-to-world transform
uniform sampler2D accumPrevious;        // last frame's history: xyz OKLab, w linear depth (negative: current only; 0 sky)
uniform float accumValid;
uniform vec4 accumParams;               // x: current share (world); y: current share (cars); z: clamp pad; w: depth tolerance
uniform vec2 accumSpeed;                // x: extra current share per cell of reprojection beyond 8 cells
uniform vec4 speedParams;               // surfaces.ts: x, y slide where ground turns to screen-row dashes (start, full)
uniform float accumReflect;             // 1 when hdr alpha is the reflect composite's reflection share (+ 1 on road paint)
uniform float accumRow;                 // current share on screen-row ground (1: none accumulated)
uniform sampler2D scrollRows;           // surfaces.ts: per row, y the drawn scroll's step this frame
uniform vec4 scrollParams;              // surfaces.ts: x 1 when the scroll registers drive the screen-row dashes
layout(location = 0) out vec4 outGraded;
layout(location = 1) out vec4 outHistory;

/** The band offset (lightness) the quantize stage adds at a cell (0 unless accumOffset). */
float offsetAt(ivec2 c, vec4 d) { return accumOffset > .5 && bandStrength > 0. ? artBandOffset(c, d) * bandStep * bandStrength : 0.; }
void main() {
  ivec2 cell = artCell();
  vec4 current = texelFetch(graded, cell, 0);
  vec4 data = texelFetch(resolvedData, cell, 0);
  float offset = offsetAt(cell, data);
  outGraded = current;
  // History: the value quantized (with the band offset when accumOffset);
  // depth in w, negative where only the current frame was taken, 0 on sky
  // (never matches a surface).
  outHistory = vec4(current.xyz + vec3(offset, 0., 0.), data.w >= .5 ? 0. : -data.x);
  if (accumValid < .5 || data.w >= .5 || artSurfaceReady < .5 || artCameraPerspective < .5) return;
  vec4 anchor = texelFetch(anchors, cell, 0);
  int kind = int(floor(anchor.w + .5)); // canopy (w .25) is world
  if (kind < 0) return;
  // Ground drawn with screen-row dashes: those hold still on screen while the
  // world slides under them; the dashes and the smoothing already calm it.
  float share = 0.;
  bool rows = false;
  if (kind == 0) {
    vec4 g = texelFetch(groundFields, cell, 0);
    float motion = g.y - 4. * floor(g.y * .25 + .125);
    if (g.z > 0. && motion <= 1.) share = smoothstep(speedParams.x / speedParams.y, 1., motion) * g.z;
    // Screen-row ground: its history is the same screen dash (accumRow).
    rows = share >= .5 && accumRow < .999;
    if (share >= .999 && !rows) return;
  }
  vec2 p;
  float expected;
  if (rows) {
    float step = scrollParams.x > .5 ? texelFetch(scrollRows, ivec2(0, cell.y), 0).y : 0.;
    p = vec2(cell) + .5 - vec2(step, 0.);
    expected = data.x;
    if (p.x < 0. || p.x >= artSize.x) return;
  } else {
    vec4 world = vec4(anchor.xyz, 1.);
    if (kind > 0) {
      if (kind > MAX_MOVERS || moverMin[kind - 1].w < .5) return;
      world = moverPrevious[kind - 1] * world;
    }
    vec4 clip = artPreviousViewProjection * world;
    if (clip.w <= 1e-4) return;
    p = (clip.xy / clip.w * .5 + .5) * artSize;
    if (any(lessThan(p, vec2(0.))) || any(greaterThanEqual(p, artSize))) return;
    expected = clip.w;
  }
  // The current neighbourhood: the clamp box (surface cells only) and the depth slope.
  vec3 now = outHistory.xyz;
  vec3 lo = now, hi = now;
  float slope = 0.;
  for (int k = 0; k < 9; k++) {
    if (k == 4) continue;
    ivec2 other = artClamp(cell + ivec2(k % 3 - 1, k / 3 - 1));
    vec4 od = texelFetch(resolvedData, other, 0);
    if (od.w >= .5) continue;
    vec3 c = texelFetch(graded, other, 0).xyz + vec3(offsetAt(other, od), 0., 0.);
    lo = min(lo, c); hi = max(hi, c);
    if (k == 1 || k == 3 || k == 5 || k == 7) slope = max(slope, abs(od.x - data.x));
  }
  float tolerance = accumParams.w * expected + slope + .05;
  // Bilinear history over the four cells around p whose depth matches.
  vec2 q = p - .5;
  ivec2 base = ivec2(floor(q));
  vec2 f = q - vec2(base);
  vec3 sum = vec3(0.);
  float weight = 0.;
  for (int k = 0; k < 4; k++) {
    ivec2 o = ivec2(k & 1, k >> 1);
    vec4 h = texelFetch(accumPrevious, artClamp(base + o), 0);
    float w = (o.x == 1 ? f.x : 1. - f.x) * (o.y == 1 ? f.y : 1. - f.y);
    if (h.w != 0. && abs(abs(h.w) - expected) < tolerance) { sum += h.xyz * w; weight += w; }
  }
  vec3 history;
  if (weight >= .35) history = sum / weight;
  else {
    // Foliage and thin geometry: the best depth match in the 3 x 3 around p.
    ivec2 near = ivec2(floor(p));
    float best = tolerance * 1.5;
    bool found = false;
    for (int k = 0; k < 9; k++) {
      vec4 h = texelFetch(accumPrevious, artClamp(near + ivec2(k % 3 - 1, k / 3 - 1)), 0);
      float miss = abs(abs(h.w) - expected);
      if (h.w != 0. && miss < best) { best = miss; history = h.xyz; found = true; }
    }
    if (!found) return;
  }
  vec3 pad = accumParams.z * vec3(1., .5, .5);
  history = clamp(history, lo - pad, hi + pad);
  float currentShare = kind > 0 ? accumParams.y : accumParams.x;
  // Fast reprojection (a near wall at speed): more of the current frame, so
  // repeated bilinear resampling does not soften its edges.
  float travel = length(p - (vec2(cell) + .5));
  currentShare = clamp(currentShare + accumSpeed.x * max(travel - 8., 0.), 0., 1.);
  currentShare = rows ? accumRow : mix(currentShare, 1., share);
  // Wet reflections and lamp columns ride with their light, not with the
  // ground they lie on, and road paint streams past the screen-row dashes:
  // those cells take the current frame.
  if (accumReflect > .5) {
    float a = texelFetch(hdr, cell, 0).a;
    currentShare = a >= 1. ? 1. : mix(currentShare, 1., smoothstep(.2, .6, a));
  }
  vec3 lab = mix(history, now, currentShare);
  // Linework reads the graded image as smooth lightness: without this frame's offset.
  outGraded = vec4(lab - vec3(offset, 0., 0.), current.w);
  outHistory = vec4(lab, data.x);
}`;

export interface Accumulate {
  readonly stage: PixelArtStage;
  configure(options: AccumulateOptions): void;
  /** Drop the history (camera cut, course change, seek). */
  reset(): void;
}

/**
 * The accumulation stage (after carPaint, before quantize). Two art-size
 * RGBA16F MRT targets ping-pong: attachment 0 is the accumulated graded image
 * (the car stage's glint flags pass through in alpha), attachment 1 the history.
 */
export function createAccumulate(shared: PixelArtSharedUniforms,
  deps: { movers: MoverSlots; speedParams: THREE.IUniform<THREE.Vector4>; reflectReady: THREE.IUniform<number>;
    scrollRows: THREE.IUniform<THREE.Texture>; scrollParams: THREE.IUniform<THREE.Vector4>;
    /** The quantize stage's band uniforms (bandStep, bandStrength, car streaks), for the offset. */
    band: Record<string, THREE.IUniform> }): Accumulate {
  const targets = [artTarget(THREE.HalfFloatType, 'SORA pixel-art accumulation A', 2),
    artTarget(THREE.HalfFloatType, 'SORA pixel-art accumulation B', 2)] as const;
  const uniforms = {
    moverMin: { value: deps.movers.min }, moverPrevious: { value: deps.movers.previous },
    accumPrevious: { value: null as THREE.Texture | null }, accumValid: { value: 0 },
    accumParams: { value: new THREE.Vector4(0.35, 0.4, 0.01, 0.05) }, accumSpeed: { value: new THREE.Vector2() },
    speedParams: deps.speedParams, accumReflect: deps.reflectReady,
    ...deps.band, accumOffset: { value: 1 }, accumRow: { value: 1 }, scrollRows: deps.scrollRows, scrollParams: deps.scrollParams,
  };
  const material = stageMaterial('SORA pixel-art OKLab accumulation', shared, ACCUMULATE_FRAGMENT, uniforms);
  let index = 0, frameCount = 0, lastFrame = -2, reset = true;
  const stage: PixelArtStage = {
    name: 'accumulate', enabled: true,
    setSize(grid: PixelArtGrid) {
      for (const target of targets) target.setSize(grid.artWidth, grid.artHeight);
      reset = true;
    },
    beginFrame() { frameCount++; shared.artAccumReady.value = 0; shared.artAccumOffset.value = 0; },
    render(frame) {
      const write = targets[index]!, read = targets[1 - index]!;
      uniforms.accumPrevious.value = read.textures[1]!;
      uniforms.accumValid.value = !reset && lastFrame === frameCount - 1 && shared.artHasPrevious.value > 0.5 ? 1 : 0;
      frame.draw(material, write);
      shared.graded.value = write.textures[0]!;
      shared.accumulated.value = write.textures[1]!;
      shared.artAccumReady.value = 1;
      shared.artAccumOffset.value = uniforms.accumOffset.value;
      lastFrame = frameCount;
      index = 1 - index;
      reset = false;
    },
    dispose() { material.dispose(); for (const target of targets) target.dispose(); },
  };
  return {
    stage,
    configure(o) {
      const on = o.temporalAccumulate > 0;
      if (on && !stage.enabled) reset = true;
      stage.enabled = on;
      uniforms.accumParams.value.set(THREE.MathUtils.clamp(o.accumulateCurrent, 0.05, 1), THREE.MathUtils.clamp(o.accumulateCarCurrent, 0.05, 1),
        Math.max(0, o.accumulatePad), Math.max(0.005, o.accumulateDepthTolerance));
      uniforms.accumSpeed.value.set(Math.max(0, o.accumulateSpeedCurrent), 0);
      if ((o.accumulateOffset > 0 ? 1 : 0) !== uniforms.accumOffset.value) reset = true;
      uniforms.accumOffset.value = o.accumulateOffset > 0 ? 1 : 0;
      uniforms.accumRow.value = THREE.MathUtils.clamp(o.accumulateRowCurrent, 0.05, 1);
    },
    reset() { reset = true; },
  };
}
