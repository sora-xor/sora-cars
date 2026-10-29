import * as THREE from 'three';
import type { PixelArtGrid } from './grid';
import { PIXEL_ART_BAND_OFFSET, PIXEL_ART_COMMON, PIXEL_ART_VERTEX } from './glsl';
import type { PixelPalette } from './palette';

/**
 * Stage contract of the pixel-art renderer. Stages run in order at art
 * resolution between the supersampled scene render and the final upscale:
 *
 *   scene (HDR, MSAA) -> resolve -> normals -> [surface, reflect] -> grade -> quantize
 *     -> [temporal] -> [lines, glints, glow, cleanup] -> [sparkle] -> [debug] -> upscale
 *
 * Stages communicate through shared uniforms rather than direct references:
 *  - `hdr`: current linear HDR art colour (resolve output; the reflect stage
 *    composites wet-ground reflections into its own target and rebinds it);
 *  - `image`: current paletted art image, RGBA8 sRGB with the palette index in
 *    alpha (index / 255). Stages that rewrite it draw into
 *    frame.beginImageWrite() and then call frame.endImageWrite().
 */
export interface PixelArtStage {
  readonly name: string;
  enabled: boolean;
  setSize(grid: PixelArtGrid): void;
  /** Optional per-frame reset, called for every stage (enabled or not) before any stage renders. */
  beginFrame?(frame: PixelArtFrame): void;
  render(frame: PixelArtFrame): void;
  dispose(): void;
}

export interface PixelArtFrame {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly grid: PixelArtGrid;
  readonly time: number;
  readonly uniforms: PixelArtSharedUniforms;
  readonly targets: PixelArtTargets;
  /** Draw a full-screen triangle with `material` into `target` (null = canvas). */
  draw(material: THREE.RawShaderMaterial, target: THREE.WebGLRenderTarget | null): void;
  beginImageWrite(): THREE.WebGLRenderTarget;
  endImageWrite(): void;
}

type U<T> = THREE.IUniform<T>;
/** Uniform objects shared by reference between every stage material. */
export interface PixelArtSharedUniforms {
  [name: string]: THREE.IUniform;
  artSize: U<THREE.Vector2>;
  artOutputSize: U<THREE.Vector2>;
  artSupersample: U<number>;
  artCameraNear: U<number>;
  artCameraFar: U<number>;
  artCameraPerspective: U<number>;
  /** World size of one art cell at unit view depth (perspective) or anywhere (orthographic). */
  artCellWorldScale: U<number>;
  artProjection: U<THREE.Matrix4>;
  artProjectionInverse: U<THREE.Matrix4>;
  artCameraWorld: U<THREE.Matrix4>;
  /** Previous frame's projection x view, for reprojection (temporal stages). */
  artPreviousViewProjection: U<THREE.Matrix4>;
  artHasPrevious: U<number>;
  artTime: U<number>;
  sceneColor: U<THREE.Texture | null>;
  sceneDepth: U<THREE.Texture | null>;
  /** rgb: linear HDR colour of the owning sample set; a: its max sample luminance. */
  resolvedColor: U<THREE.Texture | null>;
  /** x: linear depth (m); y: coverage of the owning set; z: nearest depth in the cell; w: sky fraction. */
  resolvedData: U<THREE.Texture | null>;
  /** xyz: world-space normal reconstructed at art resolution; w: 1 on geometry, 0 on sky. */
  normals: U<THREE.Texture | null>;
  hdr: U<THREE.Texture | null>;
  /** Graded OKLab (L, a, b) before quantisation. */
  graded: U<THREE.Texture | null>;
  /**
   * Accumulation history written this frame (accumulate.ts; valid while
   * artAccumReady is 1): xyz accumulated OKLab, w linear depth (negative where
   * the cell took the current frame only, 0 on sky).
   */
  accumulated: U<THREE.Texture | null>;
  artAccumReady: U<number>;
  /** 1 while `accumulated` xyz already carries the band offset: quantize and temporal read it as is. */
  artAccumOffset: U<number>;
  image: U<THREE.Texture | null>;
  /**
   * Linework marks at art resolution, next to `image`: r dark line, g bright
   * line/rim/glint, b emitter/glow (0 or 1 each). All zero until the linework
   * stages run (see linework.ts).
   */
  marks: U<THREE.Texture | null>;
  /**
   * Surface stage (surfaces.ts), valid while artSurfaceReady is 1:
   * anchors: xyz stable anchor (world position, a car's local position or the
   * sky direction), w kind (0 world, car slot + 1, -1 sky); surfaceFields:
   * x band offset, y wet-ground weight, z dash mask (sign) and calm (1 at
   * rest, 0 sliding fast: (1 + calm) / 2 in the magnitude), w sparkle hash.
   */
  anchors: U<THREE.Texture | null>;
  surfaceFields: U<THREE.Texture | null>;
  artSurfaceReady: U<number>;
  /**
   * Temporal history written this frame (valid while artHistoryReady is 1):
   * r index, gb 16-bit log depth, a kind + 16 x state (0 new, 1 same, 2 held)
   * + 64 when the surface carried a glint last frame.
   */
  history: U<THREE.Texture | null>;
  artHistoryReady: U<number>;
  /**
   * Car mask (cars.ts), valid while artCarsReady is 1: r car id / 255 (0 none,
   * mover slot + 1), g kind / 255 (1 body, 2 glass seen through the car),
   * b feature / 255 (1 taillight frame, 2 rear plate).
   * GLSL: artCarId(cell), artCarKind(cell), artCarFeature(cell).
   */
  cars: U<THREE.Texture | null>;
  artCarsReady: U<number>;
  /**
   * Ground stage (surfaces.ts), valid while artSurfaceReady is 1: x ground
   * dash segment value, y row hash, z ground level (upward ground, 0-1),
   * w lamp-lit fraction of the cell's light.
   */
  groundFields: U<THREE.Texture | null>;
  paletteColors: U<THREE.Texture | null>;
  paletteLab: U<THREE.Texture | null>;
  /** Per entry: darker index, lighter index, family ramp id, step (bytes). */
  paletteRamps: U<THREE.Texture | null>;
  paletteLut: U<THREE.Texture | null>;
  paletteSize: U<number>;
}

export function createSharedUniforms(): PixelArtSharedUniforms {
  return {
    artSize: { value: new THREE.Vector2(1, 1) }, artOutputSize: { value: new THREE.Vector2(1, 1) },
    artSupersample: { value: 2 }, artCameraNear: { value: 0.1 }, artCameraFar: { value: 600 },
    artCameraPerspective: { value: 1 }, artCellWorldScale: { value: 0.004 },
    artProjection: { value: new THREE.Matrix4() }, artProjectionInverse: { value: new THREE.Matrix4() },
    artCameraWorld: { value: new THREE.Matrix4() },
    artPreviousViewProjection: { value: new THREE.Matrix4() }, artHasPrevious: { value: 0 }, artTime: { value: 0 },
    sceneColor: { value: null }, sceneDepth: { value: null }, resolvedColor: { value: null }, resolvedData: { value: null },
    normals: { value: null }, hdr: { value: null }, graded: { value: null }, accumulated: { value: null }, artAccumReady: { value: 0 }, artAccumOffset: { value: 0 }, image: { value: null }, marks: { value: null },
    anchors: { value: null }, surfaceFields: { value: null }, artSurfaceReady: { value: 0 }, history: { value: null },
    artHistoryReady: { value: 0 }, cars: { value: null }, artCarsReady: { value: 0 }, groundFields: { value: null },
    paletteColors: { value: null }, paletteLab: { value: null }, paletteRamps: { value: null }, paletteLut: { value: null },
    paletteSize: { value: 1 },
  };
}

/** Explicit targets owned by the pass. Post targets are single-sample. */
export interface PixelArtTargets {
  readonly scene: THREE.WebGLRenderTarget;
  readonly resolved: THREE.WebGLRenderTarget;
  readonly normals: THREE.WebGLRenderTarget;
  readonly graded: THREE.WebGLRenderTarget;
  readonly images: readonly [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  readonly lut: THREE.WebGLRenderTarget;
}

export function artTarget(type: THREE.TextureDataType, name: string, count = 1): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    count, type, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false, samples: 0,
  });
  target.textures.forEach((texture, i) => {
    texture.name = count > 1 ? `${name} ${i}` : name;
    texture.colorSpace = THREE.NoColorSpace;
  });
  return target;
}

/** The cell resolve: colour (0) in half float (HDR, and half the bandwidth), depth and coverage (1) in float. */
function resolveTarget(): THREE.WebGLRenderTarget {
  const target = artTarget(THREE.FloatType, 'SORA pixel-art cell resolve', 2);
  target.textures[0]!.type = THREE.HalfFloatType;
  return target;
}

export function createTargets(renderer: THREE.WebGLRenderer): PixelArtTargets {
  const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  depth.name = 'SORA pixel-art scene depth';
  depth.minFilter = depth.magFilter = THREE.NearestFilter;
  const scene = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: true, depthTexture: depth, resolveDepthBuffer: true, stencilBuffer: false,
    generateMipmaps: false, samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  scene.texture.name = 'SORA pixel-art scene linear HDR';
  scene.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const lut = artTarget(THREE.UnsignedByteType, 'SORA pixel-art OKLab palette LUT');
  lut.setSize(LUT_ATLAS, LUT_ATLAS);
  return {
    scene,
    resolved: resolveTarget(),
    normals: artTarget(THREE.HalfFloatType, 'SORA pixel-art normals'),
    graded: artTarget(THREE.HalfFloatType, 'SORA pixel-art graded OKLab'),
    images: [artTarget(THREE.UnsignedByteType, 'SORA pixel-art image A'), artTarget(THREE.UnsignedByteType, 'SORA pixel-art image B')],
    lut,
  };
}

export function stageMaterial(name: string, shared: PixelArtSharedUniforms, fragment: string,
  own: Record<string, THREE.IUniform> = {}): THREE.RawShaderMaterial {
  const material = new THREE.RawShaderMaterial({
    name, uniforms: { ...shared, ...own }, vertexShader: PIXEL_ART_VERTEX,
    fragmentShader: `${PIXEL_ART_COMMON}\n${fragment}`, glslVersion: THREE.GLSL3,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
  });
  return material;
}

/** A stage that is one full-screen draw into one target. */
export function drawStage(name: string, material: THREE.RawShaderMaterial,
  target: (frame: PixelArtFrame) => THREE.WebGLRenderTarget, after?: (frame: PixelArtFrame) => void): PixelArtStage {
  return {
    name, enabled: true,
    setSize() { /* targets are sized by the pass */ },
    render(frame) { frame.draw(material, target(frame)); after?.(frame); },
    dispose() { material.dispose(); },
  };
}

// --- palette LUT -----------------------------------------------------------------
/** The OKLab LUT is LUT_SIZE^3 nodes stored as LUT_TILES x LUT_TILES slices of L. */
export const LUT_SIZE = 64;
const LUT_TILES = 8;
const LUT_ATLAS = LUT_SIZE * LUT_TILES;
/** Half-range of the a/b axes covered by the LUT; beyond it the border node is used. */
export const LUT_AB_RANGE = 0.32;

const lutAddress = /* glsl */ `
const int LUT_SIZE = ${LUT_SIZE};
const int LUT_TILES = ${LUT_TILES};
const float LUT_AB_RANGE = ${LUT_AB_RANGE.toFixed(4)};
ivec2 lutTexel(ivec3 node) {
  return ivec2(node.y + (node.x % LUT_TILES) * LUT_SIZE, node.z + (node.x / LUT_TILES) * LUT_SIZE);
}
ivec3 lutNode(vec3 lab) {
  vec3 t = clamp(vec3(lab.x, lab.yz / (2. * LUT_AB_RANGE) + .5), 0., 1.) * float(LUT_SIZE - 1);
  return ivec3(floor(t + .5));
}
`;
/** GLSL: lutNode(lab) -> lutTexel(node) addressing of the palette LUT, for stages that re-snap colours. */
export const PIXEL_ART_LUT_ADDRESS = lutAddress;

/**
 * Builds the palette LUT once: every OKLab node stores its nearest and second
 * nearest palette entries (R, G bytes) and their distance margin (B). The
 * lightness weight above one keeps value structure (form) ahead of hue.
 */
export function createLutBuilder(shared: PixelArtSharedUniforms) {
  const weights = { value: new THREE.Vector2(1.6, 1) };
  const material = stageMaterial('SORA pixel-art LUT build', shared, /* glsl */ `
${lutAddress}
uniform vec2 lutWeights;
layout(location = 0) out vec4 lutOut;
void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  ivec3 node = ivec3((texel.x / LUT_SIZE) + (texel.y / LUT_SIZE) * LUT_TILES, texel.x % LUT_SIZE, texel.y % LUT_SIZE);
  vec3 lab = vec3(float(node.x), (vec2(node.yz) / float(LUT_SIZE - 1) - .5) * 2. * LUT_AB_RANGE);
  lab.x /= float(LUT_SIZE - 1);
  float best = 1e9, second = 1e9; int bestIndex = 0, secondIndex = 0;
  for (int i = 0; i < 256; i++) {
    if (i >= paletteSize) break;
    vec3 entry = texelFetch(paletteLab, ivec2(i, 0), 0).xyz;
    vec3 d = (lab - entry) * vec3(lutWeights.x, lutWeights.y, lutWeights.y);
    float e = dot(d, d);
    if (e < best) { second = best; secondIndex = bestIndex; best = e; bestIndex = i; }
    else if (e < second) { second = e; secondIndex = i; }
  }
  lutOut = vec4(float(bestIndex) / 255., float(secondIndex) / 255., clamp((sqrt(second) - sqrt(best)) * 10., 0., 1.), 1.);
}`, { lutWeights: weights });
  return { material, weights };
}

export function createPaletteTextures(palette: PixelPalette) {
  const colors = new THREE.DataTexture(palette.rgba, palette.size, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  const lab = new THREE.DataTexture(palette.oklab, palette.size, 1, THREE.RGBAFormat, THREE.FloatType);
  const ramps = new THREE.DataTexture(palette.rampNeighbours, palette.size, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  for (const [texture, name] of [[colors, 'colours'], [lab, 'OKLab'], [ramps, 'ramps']] as const) {
    texture.name = `SORA pixel-art palette ${name}`;
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
  }
  return { colors, lab, ramps };
}

// --- stages -----------------------------------------------------------------------
/**
 * S x S -> 1 depth-aware cell resolve. Samples are grouped into depth layers
 * from near to far (relative tolerance). The first layer that covers at least
 * ceil(S^2 / 3) samples owns the cell; otherwise the largest layer does. The
 * cell colour is the mean of the owning layer only, so colours never blend
 * across a silhouette.
 */
export function createResolveStage(shared: PixelArtSharedUniforms) {
  const depthTolerance = { value: 0.06 };
  const material = stageMaterial('SORA pixel-art cell resolve', shared, /* glsl */ `
uniform float depthTolerance;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outData;
void main() {
  ivec2 origin = artCell() * artSupersample;
  int s = artSupersample, n = s * s, need = (n + 2) / 3;
  float z[9]; vec3 c[9]; bool used[9];
  float sky = 0., nearest = 1e20;
  for (int i = 0; i < 9; i++) {
    used[i] = i >= n;
    if (i >= n) { z[i] = 0.; c[i] = vec3(0.); continue; }
    ivec2 p = origin + ivec2(i % s, i / s);
    float depth = texelFetch(sceneDepth, p, 0).r;
    sky += step(1., depth);
    z[i] = artLinearDepth(depth);
    c[i] = max(texelFetch(sceneColor, p, 0).rgb, vec3(0.));
    nearest = min(nearest, z[i]);
  }
  vec3 color = vec3(0.); float depth = 0., peak = 0.; int owner = 0, largest = 0;
  vec3 largestColor = vec3(0.); float largestDepth = 0., largestPeak = 0.;
  for (int layer = 0; layer < 9; layer++) {
    float front = 1e20;
    for (int i = 0; i < 9; i++) if (!used[i]) front = min(front, z[i]);
    if (front >= 1e20) break;
    float limit = front + front * depthTolerance + .01;
    int count = 0; vec3 sum = vec3(0.); float zSum = 0., zMax = 0.;
    for (int i = 0; i < 9; i++) {
      if (used[i] || z[i] > limit) continue;
      used[i] = true; count++; sum += c[i]; zSum += z[i]; zMax = max(zMax, artLuminance(c[i]));
    }
    if (count >= need) { owner = count; color = sum / float(count); depth = zSum / float(count); peak = zMax; break; }
    if (count > largest) { largest = count; largestColor = sum / float(count); largestDepth = zSum / float(count); largestPeak = zMax; }
  }
  if (owner == 0) { owner = largest; color = largestColor; depth = largestDepth; peak = largestPeak; }
  outColor = vec4(color, peak);
  outData = vec4(depth, float(owner) / float(n), nearest, sky / float(n));
}`, { depthTolerance });
  const stage = drawStage('resolve', material, frame => frame.targets.resolved);
  return { stage, depthTolerance };
}

/** World normals from art-resolution depth, using the smaller one-sided difference. */
export function createNormalStage(shared: PixelArtSharedUniforms): PixelArtStage {
  const material = stageMaterial('SORA pixel-art normals', shared, /* glsl */ `
layout(location = 0) out vec4 outNormal;
vec3 positionAt(ivec2 cell) {
  cell = artClamp(cell);
  return artViewPosition(vec2(cell) + .5, texelFetch(resolvedData, cell, 0).x);
}
void main() {
  ivec2 cell = artCell();
  vec4 data = texelFetch(resolvedData, cell, 0);
  if (data.w >= .5) { outNormal = vec4(0.); return; }
  vec3 p = positionAt(cell);
  vec3 left = p - positionAt(cell - ivec2(1, 0)), right = positionAt(cell + ivec2(1, 0)) - p;
  vec3 down = p - positionAt(cell - ivec2(0, 1)), up = positionAt(cell + ivec2(0, 1)) - p;
  vec3 dx = abs(left.z) < abs(right.z) ? left : right;
  vec3 dy = abs(down.z) < abs(up.z) ? down : up;
  vec3 n = cross(dx, dy);
  n = length(n) > 1e-12 ? normalize(n) : vec3(0., 0., 1.);
  if (dot(n, -p) < 0.) n = -n;
  outNormal = vec4(normalize(mat3(artCameraWorld) * n), 1.);
}`);
  return drawStage('normals', material, frame => frame.targets.normals);
}

export type PixelArtToneMapping = 'none' | 'neutral' | 'aces' | 'agx';
export const TONE_MAPPING_IDS: Record<PixelArtToneMapping, number> = { none: 0, neutral: 1, aces: 2, agx: 3 };

/**
 * GLSL of the grade (the single tone map and the OKLab grade): artGrade(cell,
 * radiance). The grade stage runs it on `hdr`; the reflect composite
 * (surfaces.ts) runs it on its own result, so the grade pass is skipped then.
 * Needs the grade stage's uniforms (createGradeStage().uniforms).
 */
export const PIXEL_ART_GRADE = /* glsl */ `
${THREE.ShaderChunk.tonemapping_pars_fragment}
uniform int toneMapper;
uniform float chromaGain;
uniform vec4 darkChroma;
uniform vec4 lightChroma;
uniform vec3 shadowDrive;
uniform vec2 shadowRange;
uniform vec2 shadowProtect;
uniform vec3 highlightDrive;
uniform vec2 highlightRange;
uniform vec2 highlightProtect;
uniform float carChromaKeep;
uniform vec4 plumDrive;
uniform vec3 groundFloor;
uniform float plumNight; // 1 at night (street lamps at night strength), 0 at sunrise: the plum drive and ground floor fade with it
uniform vec3 gradeContrast; // x: stretch below the pivot (0 off), y: the pivot, z: stretch above it (refine round 4, night)
uniform float gradeFloor;   // OKLab L the deepest darks are lifted toward (0 off): the concept's night darks are navy, never black
uniform float gradeCarContrast; // the share of the contrast stretch car paint takes
uniform float gradeSkyExposure; // the painted sky's exposure against the world's (the day exposure leaves the sky as authored)
uniform vec3 gradeFoliage;  // night canopy: x lightness and y chroma taken off its darker leaves, z green leaves' turn toward olive (0 off)
vec3 toneMap(vec3 c) {
  if (toneMapper == 1) return NeutralToneMapping(c);
  if (toneMapper == 2) return ACESFilmicToneMapping(c);
  if (toneMapper == 3) return AgXToneMapping(c);
  return clamp(c * toneMappingExposure, 0., 1.);
}
float arc(float from, float to) { return mod(to - from + 3.14159265, 6.28318531) - 3.14159265; }
/** Turns ab toward params.x; 'raw' is the chroma before any compression, which decides the protection. */
vec2 drive(vec2 ab, float weight, vec3 params, vec2 protect, float raw) {
  if (weight <= 0.) return ab;
  float chroma = length(ab);
  float turn = weight * (1. - .9 * smoothstep(protect.x, protect.y, raw));
  float hue = chroma > 1e-5 ? atan(ab.y, ab.x) : params.x;
  hue += arc(hue, params.x) * turn;
  ab = vec2(cos(hue), sin(hue)) * chroma;
  float floorChroma = params.z * weight;
  if (chroma < floorChroma) ab += vec2(cos(params.x), sin(params.x)) * (floorChroma - chroma);
  return ab;
}
/** The grade of a cell's linear HDR radiance: graded OKLab (see createGradeStage). */
vec3 artGrade(ivec2 cell, vec3 radiance) {
  radiance = max(radiance, vec3(0.));
  // The painted sky is authored in display colours: the dusk and sunrise exposure lift (dayExposure) is for the world.
  radiance *= mix(1., gradeSkyExposure, texelFetch(resolvedData, cell, 0).w);
  vec3 lab = artLinearToOklab(clamp(toneMap(radiance), 0., 1.));
  lab.yz *= chromaGain;
  // Night contrast (refine round 4, the user's rain-night concept): lightness
  // stretched about a low pivot, strongly below it so walls and asphalt sink
  // toward navy, gently above it so windows, signs and their reflections glow
  // amber without washing out to cream. It eases off toward black and white
  // (nothing crushes or clips); the authored sky keeps its paint and car
  // paint takes half.
  if (gradeContrast.x > 0. || gradeContrast.z > 0.) {
    float sky = texelFetch(resolvedData, cell, 0).w;
    float k = (lab.x < gradeContrast.y ? gradeContrast.x : gradeContrast.z) * (1. - sky) * (artCarKind(cell) == 1 ? gradeCarContrast : 1.)
      * smoothstep(.02, .14, lab.x) * (1. - smoothstep(.8, .97, lab.x));
    lab.x = clamp(lab.x + (lab.x - gradeContrast.y) * k, 0., 1.);
  }
  // Night foliage (refine round 4): the concept's street trees are dark green with lamp-lit leaves; ours turned lime
  // and teal under the night grade. Canopy cells (the surface stage's leaf flag) below mid lightness lose some
  // lightness and chroma; lamp-lit leaves above it keep theirs and take the highlight drive's gold.
  float canopy = 0.;
  if (gradeFoliage.x > 0. && artSurfaceReady > .5 && abs(texelFetch(anchors, cell, 0).w - .25) < .01) {
    canopy = 1.;
    float dark = 1. - smoothstep(.42, .66, lab.x);
    lab.x *= 1. - gradeFoliage.x * dark;
    lab.yz *= 1. - gradeFoliage.y * dark;
    // Green and teal leaves (OKLab hue about 105-225 degrees) turn toward the concept's olive (about 115), and the
    // shadow and plum drives below spare them as much, so dark leaves stay dark olive instead of violet-grey;
    // blossom, autumn reds and ginkgo gold lie outside the window and keep their colour.
    float hue = atan(lab.z, lab.y);
    float green = 1. - smoothstep(1.05, 1.4, abs(arc(2.88, hue)));
    hue += arc(hue, 2.) * gradeFoliage.z * green;
    lab.yz = length(lab.yz) * vec2(cos(hue), sin(hue));
  }
  // A soft floor under the night's darks (refine round 4): lightness below 2.5 x the floor is lifted toward it, the
  // lift fading out linearly, so shadows read as deep navy with their structure kept (the shadow drive gives the
  // hue) instead of crushing to black. Monotonic; the sky keeps its paint.
  if (gradeFloor > 0.) {
    float t = clamp(lab.x / (2.5 * gradeFloor), 0., 1.);
    lab.x += gradeFloor * (1. - t) * (1. - texelFetch(resolvedData, cell, 0).w);
  }
  // Monotonic in chroma: mid chroma is compressed in darks (lamp-lit asphalt)
  // and lights (white paint under amber lamps); saturated paint is kept.
  float chroma = length(lab.yz);
  float dark = 1. - smoothstep(darkChroma.w * .5, darkChroma.w, lab.x);
  float light = smoothstep(lightChroma.w, lightChroma.w + .15, lab.x);
  // Car paint keeps its chroma in the dark: compressed, a distant teal or
  // green livery fell under the shadow drive's protection and turned navy.
  float paint = artCarKind(cell) == 1 ? carChromaKeep : 0.;
  // The painted sky is authored in cutscene display colours: its bright
  // sunrise halo keeps its saturated peach (#fcaa67) instead of turning beige.
  float sky = texelFetch(resolvedData, cell, 0).w;
  lab.yz *= 1. - darkChroma.x * dark * (1. - paint) * (1. - smoothstep(darkChroma.y, darkChroma.z, chroma))
    - lightChroma.x * light * (1. - sky) * (1. - smoothstep(lightChroma.y, lightChroma.z, chroma));
  // Car paint takes less of it (refine round 4): the drive turned a white car's sky-lit roof mauve, where the
  // cutscenes keep a pale car warm cream under the street's light.
  float shadow = shadowDrive.y * (1. - smoothstep(shadowRange.x, shadowRange.y, lab.x)) * (1. - gradeFoliage.z * canopy)
    * (artCarKind(cell) == 1 ? .35 : 1.);
  float highlight = highlightDrive.y * smoothstep(highlightRange.x, highlightRange.y, lab.x);
  // The protection follows the chroma before the compression, so saturated
  // darks (a red vending machine, a teal car in shade) keep their hue.
  // Night darks: the cutscenes' L 0.2-0.3 darks are plum and plum-brown
  // (chroma-weighted hue 311-347), their deepest indigo (h285-303). World
  // cells in that band turn toward plum; the sky, car paint and lamp-lit
  // ground (which keeps its amber drive) do not.
  vec3 shadowTarget = shadowDrive;
  if (groundFloor.y * plumNight > 0. && artSurfaceReady > .5 && lab.x < groundFloor.x) {
    // The cutscenes' night ground between the lamps is plum-brown near L .25,
    // never near-black: the ground's darks are compressed into the band below
    // the floor (order kept; lamp pools and paint untouched).
    vec4 g = texelFetch(groundFields, cell, 0);
    float lift = groundFloor.y * plumNight * smoothstep(.5, .9, g.z) * (1. - smoothstep(0., groundFloor.z, g.w)) * (artCarKind(cell) > 0 ? 0. : 1.);
    lab.x = mix(lab.x, groundFloor.x * (.6 + .4 * lab.x / groundFloor.x), lift);
  }
  if (plumDrive.y * plumNight > 0.) {
    float lit = artSurfaceReady > .5 ? texelFetch(groundFields, cell, 0).w : 0.;
    float plum = plumDrive.y * plumNight * smoothstep(plumDrive.z, plumDrive.w, lab.x) * (1. - sky) * (artCarKind(cell) > 0 ? 0. : 1.) * (1. - lit)
      * (1. - gradeFoliage.z * canopy);
    shadowTarget.x += arc(shadowDrive.x, plumDrive.x) * plum;
  }
  lab.yz = drive(lab.yz, shadow, shadowTarget, shadowProtect, chroma);
  lab.yz = drive(lab.yz, highlight, highlightDrive, highlightProtect, length(lab.yz));
  return lab;
}`;

/**
 * The single tone map, then an OKLab grade by lightness, after the measured
 * cutscene ramps: mid-chroma darks (lamp-lit asphalt, timber) lose chroma
 * while saturated paint keeps it; shadows rotate toward indigo/violet with a
 * small chroma floor (charcoal-indigo, never grey); highlights rotate toward
 * amber/cream. Saturated colours rotate less, so paint keeps its identity.
 */
export function createGradeStage(shared: PixelArtSharedUniforms) {
  const uniforms = {
    toneMappingExposure: { value: 1 },
    toneMapper: { value: TONE_MAPPING_IDS.neutral },
    chromaGain: { value: 1 },
    // x: amount; chroma below y loses that fraction, above z it is kept.
    // w: lightness where the dark zone ends / the light zone starts.
    darkChroma: { value: new THREE.Vector4(0.45, 0.06, 0.13, 0.5) },
    lightChroma: { value: new THREE.Vector4(0.4, 0.1, 0.18, 0.66) },
    // x: hue (radians), y: strength, z: chroma floor; range: full below x, none above y.
    shadowDrive: { value: new THREE.Vector3(295 * Math.PI / 180, 0.9, 0.025) },
    shadowRange: { value: new THREE.Vector2(0.22, 0.5) },
    // Chroma range over which a colour becomes protected from the rotation.
    shadowProtect: { value: new THREE.Vector2(0.035, 0.1) },
    highlightDrive: { value: new THREE.Vector3(78 * Math.PI / 180, 0.8, 0.04) },
    highlightRange: { value: new THREE.Vector2(0.6, 0.9) },
    highlightProtect: { value: new THREE.Vector2(0.08, 0.16) },
    // Share of the dark-chroma compression skipped on car paint (cars.ts mask).
    carChromaKeep: { value: 1 },
    // Night darks (temporal stability and surfaces round): x hue (radians) the
    // shadow drive turns toward in the plum band instead of shadowDrive.x;
    // y strength (0 off); z, w lightness where the band starts / is full.
    plumDrive: { value: new THREE.Vector4(335 * Math.PI / 180, 0, 0.13, 0.26) },
    // Night ground floor (R3-dark-ramp-too-blue): upward ground below x (OKLab
    // L) is lifted toward it by y (0 off), away from lamp light (z: lit
    // fraction where the lift has gone), keeping the order of its tones.
    groundFloor: { value: new THREE.Vector3(0.22, 0, 0.5) },
    // Set each frame by the reflect stage (surfaces.ts) from the street lamps'
    // level: 1 at night, 0 once they fade at sunrise (sunrise-wide's ground is violet).
    plumNight: { value: 1 },
    gradeContrast: { value: new THREE.Vector3(0, .38, 0) },
    gradeFloor: { value: 0 },
    gradeFoliage: { value: new THREE.Vector3(0, 0, 0) },
    gradeCarContrast: { value: .5 }, gradeSkyExposure: { value: 1 },
  };
  const material = stageMaterial('SORA pixel-art grade', shared, /* glsl */ `
${PIXEL_ART_GRADE}
layout(location = 0) out vec4 outGraded;
void main() {
  ivec2 cell = artCell();
  outGraded = vec4(artGrade(cell, texelFetch(hdr, cell, 0).rgb), 1.);
}`, uniforms);
  const draw = drawStage('grade', material, frame => frame.targets.graded,
    frame => { frame.uniforms.graded.value = frame.targets.graded.texture; });
  /** Set by a stage that already graded this frame (the reflect composite): the grade pass is skipped. */
  const done = { value: false };
  const stage: PixelArtStage = {
    name: 'grade', enabled: true,
    setSize: grid => draw.setSize(grid),
    beginFrame() { done.value = false; },
    render(frame) { if (!done.value) draw.render(frame); },
    dispose: () => draw.dispose(),
  };
  return { stage, uniforms, done };
}

/**
 * Stable value-band offset, then the palette LUT. Writes the palette index
 * (alpha) into the art image chain, with the palette colour (sRGB bytes) or,
 * with `paletteFull`, the graded colour itself (refine round 4: the user's
 * concept holds about 195,000 colours at its own art grid where the palette
 * held 128, which turned lettering, faces and rooms into blotches). Later
 * stages read the index for their decisions and draw their marks in palette
 * colours either way.
 */
export function createQuantizeStage(shared: PixelArtSharedUniforms) {
  const uniforms = { bandStep: { value: 0.07 }, bandStrength: { value: 0.6 }, bandFeatureCells: { value: 2 }, bandSkyScale: { value: 0.35 },
    paletteFull: { value: 1 },
    carBandStreaks: { value: new THREE.Vector3(0.5, 0.3, 0.42) }, carFarBand: { value: new THREE.Vector2(1e4, 1e4 + 1) } };
  const material = stageMaterial('SORA pixel-art quantize', shared, /* glsl */ `
${lutAddress}
${PIXEL_ART_BAND_OFFSET}
uniform float bandStep;
uniform float bandStrength;
uniform float paletteFull; // 1: the graded colour itself; 0: the palette entry's
layout(location = 0) out vec4 outImage;
void main() {
  ivec2 cell = artCell();
  vec3 lab;
  // The accumulation stage may already carry the band offset (accumulate.ts).
  if (artAccumOffset > .5) lab = texelFetch(accumulated, cell, 0).xyz;
  else {
    lab = texelFetch(graded, cell, 0).xyz;
    if (bandStrength > 0.) lab.x += artBandOffset(cell, texelFetch(resolvedData, cell, 0)) * bandStep * bandStrength;
  }
  int index = int(texelFetch(paletteLut, lutTexel(lutNode(lab)), 0).r * 255. + .5);
  vec3 colour = paletteFull > .5 ? clamp(artLinearToDisplay(artOklabToLinear(lab)), 0., 1.) : texelFetch(paletteColors, ivec2(index, 0), 0).rgb;
  outImage = vec4(colour, float(index) / 255.);
}`, uniforms);
  const stage: PixelArtStage = {
    name: 'quantize', enabled: true,
    setSize() { /* art targets are sized by the pass */ },
    render(frame) { frame.draw(material, frame.beginImageWrite()); frame.endImageWrite(); },
    dispose() { material.dispose(); },
  };
  return { stage, uniforms };
}

export const PIXEL_ART_DEBUG_VIEWS = ['final', 'scene', 'resolve', 'grade', 'index', 'ramp', 'depth', 'normal',
  'coverage', 'offset', 'peak', 'lut', 'marks', 'wet', 'reflect', 'held', 'cars', 'ground', 'foliage', 'accum'] as const;
export type PixelArtDebugView = typeof PIXEL_ART_DEBUG_VIEWS[number];

/** Visualises an intermediate buffer as an art-resolution RGBA8 image. */
export function createDebugStage(shared: PixelArtSharedUniforms, bandUniforms: Record<string, THREE.IUniform>) {
  const view = { value: 0 };
  const debugAux = { value: null as THREE.Texture | null };
  const target = artTarget(THREE.UnsignedByteType, 'SORA pixel-art debug view');
  const material = stageMaterial('SORA pixel-art debug view', shared, /* glsl */ `
${THREE.ShaderChunk.tonemapping_pars_fragment}
${lutAddress}
${PIXEL_ART_BAND_OFFSET}
uniform int debugView;
// The history of the 'held' view or the accumulation of the 'accum' view (one
// sampler: the debug shader is at WebGL 2's 16-unit limit).
uniform sampler2D debugAux;
layout(location = 0) out vec4 outDebug;
vec3 falseColor(float t) { return .5 + .5 * cos(6.28318 * (t + vec3(0., .33, .67))); }
void main() {
  ivec2 cell = artCell();
  vec4 data = texelFetch(resolvedData, cell, 0);
  vec3 c = vec3(0.);
  if (debugView == 1) {
    ivec2 p = cell * artSupersample + artSupersample / 2;
    c = artLinearToDisplay(NeutralToneMapping(max(texelFetch(sceneColor, p, 0).rgb, vec3(0.))));
  } else if (debugView == 2) c = artLinearToDisplay(NeutralToneMapping(max(texelFetch(hdr, cell, 0).rgb, vec3(0.))));
  else if (debugView == 3) c = artLinearToDisplay(artOklabToLinear(texelFetch(graded, cell, 0).xyz));
  else if (debugView == 4) c = falseColor(texelFetch(image, cell, 0).a * 255. * .618034);
  else if (debugView == 5) {
    int index = int(texelFetch(image, cell, 0).a * 255. + .5);
    vec4 ramp = texelFetch(paletteRamps, ivec2(index, 0), 0) * 255.;
    c = falseColor(ramp.z * .618034) * (.35 + .1 * ramp.w);
  } else if (debugView == 6) c = vec3(1. - clamp(log2(1. + data.x) / log2(1. + artCameraFar), 0., 1.));
  else if (debugView == 7) c = texelFetch(normals, cell, 0).xyz * .5 + .5;
  else if (debugView == 8) c = vec3(data.y, step(data.z * 1.1 + .05, data.x), data.w);
  else if (debugView == 9) c = vec3(artBandOffset(cell, data) + .5);
  else if (debugView == 10) c = artLinearToDisplay(vec3(texelFetch(resolvedColor, cell, 0).a / 4.));
  else if (debugView == 11) {
    vec2 uv = (vec2(cell) + .5) / artSize;
    ivec2 texel = ivec2(uv * float(LUT_SIZE * LUT_TILES));
    int index = int(texelFetch(paletteLut, texel, 0).r * 255. + .5);
    c = texelFetch(paletteColors, ivec2(index, 0), 0).rgb;
  } else if (debugView == 12) {
    // Linework marks over the dimmed art image: red dark lines, green bright
    // lines/rims/glints, blue emitters and glow.
    vec4 m = texelFetch(marks, cell, 0);
    c = max(m.r, max(m.g, m.b)) > .5 ? m.rgb : texelFetch(image, cell, 0).rgb * .35;
  } else if (debugView == 13) {
    // Surface stage over the dimmed image: red wet weight, green dash mask on
    // wet ground, blue cells anchored to a moving car.
    vec4 f = texelFetch(surfaceFields, cell, 0);
    float mover = artSurfaceReady > .5 && texelFetch(anchors, cell, 0).w > .5 ? 1. : 0.;
    c = artSurfaceReady > .5 ? max(vec3(f.y, f.y * step(0., f.z), mover), texelFetch(image, cell, 0).rgb * .3) : vec3(0.);
  } else if (debugView == 14) {
    // Wet-ground reflections: the HDR the reflect stage added (tone-mapped).
    c = artLinearToDisplay(NeutralToneMapping(max(texelFetch(hdr, cell, 0).rgb - texelFetch(resolvedColor, cell, 0).rgb, vec3(0.))));
  } else if (debugView == 15) {
    // Temporal history: yellow held last frame's entry, dimmed image kept the
    // same entry, red had no valid history (disocclusion, cut, new surface).
    int state = (int(texelFetch(debugAux, cell, 0).a * 255. + .5) / 16) % 4;
    c = state == 2 ? vec3(1., .85, .1) : state == 1 ? texelFetch(image, cell, 0).rgb * .35 : vec3(.8, .1, .1);
  } else if (debugView == 16) {
    // Car mask (cars.ts): r = car id x 28 (exact bytes for tools), g = 100 on
    // body cells and 200 on glass seen through the car, b = 160 taillight
    // frame, 240 plate, 110 cabin, otherwise the dimmed image (<= 77).
    int id = artCarId(cell), kind = artCarKind(cell), feature = artCarFeature(cell);
    vec3 art = texelFetch(image, cell, 0).rgb;
    c = vec3(float(id * 28) / 255., float(kind * 100) / 255.,
      feature == 1 ? 160. / 255. : feature == 2 ? 240. / 255. : feature == 3 ? 110. / 255. : dot(art, vec3(.3, .59, .11)) * .3);
  } else if (debugView == 17) {
    // Ground stage (surfaces.ts) over the dimmed image: red lamp-lit
    // fraction, green the ground dash field, blue upward ground.
    vec4 g = artSurfaceReady > .5 ? texelFetch(groundFields, cell, 0) : vec4(0.);
    c = g.z > 0. ? vec3(g.w, fract(g.x) * .7 * g.z, .3 * g.z) : texelFetch(image, cell, 0).rgb * .3;
  } else if (debugView == 18) {
    // Foliage (surfaces.ts): canopy cells green, shaded by their clump's band
    // offset; hazard (oil) cells red; the rest the dimmed image.
    vec4 a = artSurfaceReady > .5 ? texelFetch(anchors, cell, 0) : vec4(0., 0., 0., -1.);
    float hazard = artSurfaceReady > .5 ? floor(texelFetch(groundFields, cell, 0).y * .25 + .125) : 0.;
    c = abs(a.w - .25) < .01 ? vec3(.1, .45 + .5 * texelFetch(surfaceFields, cell, 0).x, .15)
      : hazard > 0. ? vec3(.9, .15 * hazard, .1) : texelFetch(image, cell, 0).rgb * .3;
  } else if (debugView == 19) {
    // Accumulation (accumulate.ts): green took history, red current frame
    // only, over the dimmed image; sky dimmed.
    float w = artAccumReady > .5 ? texelFetch(debugAux, cell, 0).w : 0.;
    vec3 art = texelFetch(image, cell, 0).rgb * .3;
    c = w > 0. ? vec3(.1, .75, .2) : w < 0. ? vec3(.8, .12, .1) : art;
  }
  outDebug = vec4(c, 1.);
}`, { ...bandUniforms, debugView: view, toneMappingExposure: { value: 1 }, debugAux });
  /** Binds the view's own buffer (held: the temporal history; accum: the accumulation). */
  const prepare = () => {
    debugAux.value = PIXEL_ART_DEBUG_VIEWS[view.value] === 'accum' ? shared.accumulated.value : shared.history.value;
  };
  const stage: PixelArtStage = {
    name: 'debug', enabled: false,
    setSize(grid) { target.setSize(grid.artWidth, grid.artHeight); },
    render(frame) {
      prepare();
      frame.draw(material, target);
      frame.uniforms.image.value = target.texture;
    },
    dispose() { material.dispose(); target.dispose(); },
  };
  return { stage, view, material, target, prepare };
}

/**
 * Sharp-bilinear upscale of the art image to exactly the output size. Colours
 * blend only across `softness` output pixels at each cell border (1 = one
 * pixel, 0 = nearest), so non-integer scales such as 3.43 give no uneven 3/4
 * pixel columns. Cells near 2 pixels use nearest sampling.
 */
export function createUpscale(shared: PixelArtSharedUniforms) {
  const softness = { value: 1 };
  const material = stageMaterial('SORA pixel-art upscale', shared, /* glsl */ `
uniform float upscaleSoftness;
layout(location = 0) out vec4 outColor;
vec3 texelAt(ivec2 cell) { return texelFetch(image, artClamp(cell), 0).rgb; }
void main() {
  vec2 scale = artOutputSize / artSize;
  vec2 position = gl_FragCoord.xy / scale - .5;
  vec2 base = floor(position), f = position - base;
  // The blend band shrinks to nothing for ~2-pixel cells, where one blended
  // pixel in two would read as blur rather than as an anti-aliased cell edge.
  vec2 band = upscaleSoftness * clamp((scale - 2.25) / .75, 0., 1.);
  vec2 w = vec2(band.x > .05 ? clamp((f.x - .5) * scale.x / band.x + .5, 0., 1.) : step(.5, f.x),
    band.y > .05 ? clamp((f.y - .5) * scale.y / band.y + .5, 0., 1.) : step(.5, f.y));
  ivec2 b = ivec2(base);
  vec3 bottom = mix(texelAt(b), texelAt(b + ivec2(1, 0)), w.x);
  vec3 top = mix(texelAt(b + ivec2(0, 1)), texelAt(b + ivec2(1, 1)), w.x);
  outColor = vec4(mix(bottom, top, w.y), 1.);
}`, { upscaleSoftness: softness });
  return { material, softness };
}
