/**
 * GLSL ES 3.00 building blocks shared by the pixel-art stages. Every stage is
 * a RawShaderMaterial drawn with a full-screen triangle into an explicit target;
 * art-resolution stages address texels with texelFetch(gl_FragCoord).
 *
 * Uniform names are prefixed (art*, scene*, palette*) so Three never mistakes
 * them for its built-in camera uniforms.
 */
export const PIXEL_ART_VERTEX = /* glsl */ `precision highp float;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

/** Uniforms every stage can declare; see PixelArtSharedUniforms in stages.ts. */
export const PIXEL_ART_COMMON = /* glsl */ `precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
uniform vec2 artSize;
uniform vec2 artOutputSize;
uniform int artSupersample;
uniform float artCameraNear;
uniform float artCameraFar;
uniform float artCameraPerspective;
uniform float artCellWorldScale;
uniform mat4 artProjection;
uniform mat4 artProjectionInverse;
uniform mat4 artCameraWorld;
uniform mat4 artPreviousViewProjection;
uniform float artHasPrevious;
uniform float artTime;
uniform sampler2D sceneColor;
uniform sampler2D sceneDepth;
uniform sampler2D resolvedColor;
uniform sampler2D resolvedData;
uniform sampler2D normals;
uniform sampler2D hdr;
uniform sampler2D graded;
uniform sampler2D accumulated;
uniform float artAccumReady;
uniform float artAccumOffset;
uniform sampler2D image;
uniform sampler2D marks;
uniform sampler2D anchors;
uniform sampler2D surfaceFields;
uniform float artSurfaceReady;
uniform sampler2D history;
uniform float artHistoryReady;
uniform sampler2D cars;
uniform float artCarsReady;
uniform sampler2D groundFields;
uniform sampler2D paletteColors;
uniform sampler2D paletteLab;
uniform sampler2D paletteRamps;
uniform sampler2D paletteLut;
uniform int paletteSize;

ivec2 artCell() { return ivec2(gl_FragCoord.xy); }
ivec2 artClamp(ivec2 cell) { return clamp(cell, ivec2(0), ivec2(artSize) - 1); }
/** Car mask (cars.ts): the car covering a cell (0 none, mover slot + 1) and its kind (1 body, 2 glass). */
int artCarId(ivec2 cell) { return artCarsReady > .5 ? int(texelFetch(cars, artClamp(cell), 0).r * 255. + .5) : 0; }
int artCarKind(ivec2 cell) { return artCarsReady > .5 ? int(texelFetch(cars, artClamp(cell), 0).g * 255. + .5) : 0; }
/** Car feature under a cell, from the car's own lamp and plate boxes: 0 none, 1 taillight frame, 2 rear plate. */
int artCarFeature(ivec2 cell) { return artCarsReady > .5 ? int(texelFetch(cars, artClamp(cell), 0).b * 255. + .5) : 0; }

/** Opaque asphalt writes alpha .875; pure water (.5) and other opaque materials (1) are excluded. */
float artRoadShare(ivec2 cell) {
  ivec2 origin = cell * artSupersample;
  int s = artSupersample, count = s * s;
  float road = 0.;
  for (int i = 0; i < 9; i++) {
    if (i >= count) break;
    float a = texelFetch(sceneColor, origin + ivec2(i % s, i / s), 0).a;
    road += step(.84, a) * step(a, .91);
  }
  return road / float(count);
}

/** Positive view distance along the camera axis from a [0, 1] depth sample. */
float artLinearDepth(float depth) {
  float perspective = artCameraNear * artCameraFar / max(artCameraFar - depth * (artCameraFar - artCameraNear), 1e-5);
  return mix(mix(artCameraNear, artCameraFar, depth), perspective, artCameraPerspective);
}
/** View-space position of an art cell centre at a linear view depth. */
vec3 artViewPosition(vec2 cellCentre, float linearDepth) {
  vec2 ndc = cellCentre / artSize * 2. - 1.;
  vec4 onRay = artProjectionInverse * vec4(ndc, 1., 1.);
  vec3 ray = onRay.xyz / onRay.w;
  return artCameraPerspective > .5 ? ray * (linearDepth / max(-ray.z, 1e-6)) : vec3(ray.xy, -linearDepth);
}
vec3 artWorldPosition(vec2 cellCentre, float linearDepth) {
  return (artCameraWorld * vec4(artViewPosition(cellCentre, linearDepth), 1.)).xyz;
}
vec3 artWorldRay(vec2 cellCentre) {
  vec3 view = artViewPosition(cellCentre, 1.);
  vec3 dir = artCameraPerspective > .5 ? view : vec3(0., 0., -1.);
  return normalize(mat3(artCameraWorld) * dir);
}
/** World size of one art cell at a linear view depth. */
float artCellWorldSize(float linearDepth) {
  return artCellWorldScale * mix(1., linearDepth, artCameraPerspective);
}
/**
 * Stable anchor of a cell for hashes and fields: xyz is the world position
 * (w = 0), a moving car's local position (w = car slot + 1) or, on the sky,
 * the view direction (w = -1). Without the surface stage: world or direction.
 */
vec4 artAnchor(ivec2 cell, vec4 data) {
  if (artSurfaceReady > .5) return texelFetch(anchors, cell, 0);
  vec2 centre = vec2(cell) + .5;
  return data.w >= .5 ? vec4(artWorldRay(centre), -1.) : vec4(artWorldPosition(centre, data.x), 0.);
}

float artLuminance(vec3 linear) { return dot(linear, vec3(.2126, .7152, .0722)); }

// OKLab (Björn Ottosson). Inputs and outputs of the linear variants are
// linear-light sRGB; the display variants use the sRGB transfer curve.
vec3 artLinearToOklab(vec3 c) {
  vec3 lms = vec3(
    dot(c, vec3(.4122214708, .5363325363, .0514459929)),
    dot(c, vec3(.2119034982, .6806995451, .1073969566)),
    dot(c, vec3(.0883024619, .2817188376, .6299787005)));
  lms = sign(lms) * pow(abs(lms), vec3(1. / 3.));
  return vec3(
    dot(lms, vec3(.2104542553, .7936177850, -.0040720468)),
    dot(lms, vec3(1.9779984951, -2.4285922050, .4505937099)),
    dot(lms, vec3(.0259040371, .7827717662, -.8086757660)));
}
vec3 artOklabToLinear(vec3 lab) {
  vec3 lms = vec3(
    lab.x + .3963377774 * lab.y + .2158037573 * lab.z,
    lab.x - .1055613458 * lab.y - .0638541728 * lab.z,
    lab.x - .0894841775 * lab.y - 1.2914855480 * lab.z);
  lms = lms * lms * lms;
  return vec3(
    dot(lms, vec3(4.0767416621, -3.3077115913, .2309699292)),
    dot(lms, vec3(-1.2684380046, 2.6097574011, -.3413193965)),
    dot(lms, vec3(-.0041960863, -.7034186147, 1.7076147010)));
}
vec3 artLinearToDisplay(vec3 c) {
  c = clamp(c, 0., 1.);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(vec3(.0031308), c));
}

// Integer hashing for stable, world-anchored fields (never screen noise).
uint artHash(ivec3 p) {
  uvec3 q = uvec3(p);
  uint h = q.x * 0x8da6b343u ^ q.y * 0xd8163841u ^ q.z * 0xcb1ab31fu;
  h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
  return h;
}
float artHash01(ivec3 p) { return float(artHash(p) >> 8) * (1. / 16777216.); }
/** Smooth value noise in [0, 1]; 'seed' decorrelates octaves. */
float artValueNoise(vec3 p, int seed) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  ivec3 c = ivec3(i) + ivec3(seed * 7919, seed * 104729, seed * 1299709);
  float x00 = mix(artHash01(c), artHash01(c + ivec3(1, 0, 0)), f.x);
  float x10 = mix(artHash01(c + ivec3(0, 1, 0)), artHash01(c + ivec3(1, 1, 0)), f.x);
  float x01 = mix(artHash01(c + ivec3(0, 0, 1)), artHash01(c + ivec3(1, 0, 1)), f.x);
  float x11 = mix(artHash01(c + ivec3(0, 1, 1)), artHash01(c + ivec3(1, 1, 1)), f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}
`;

/**
 * Band offset in [-0.5, 0.5] added (in bands) before the palette lookup so
 * band boundaries interlock. The surface stage (surfaces.ts) computes the
 * stable field: world/object anchored with per-axis footprint lattices and
 * horizontal dashes, direction anchored on the sky. Without it (the
 * ?pixelSurfaces=off A/B baseline) this falls back to the core placeholder:
 * a value-noise field anchored to the reconstructed world position (surfaces)
 * or the view direction (sky), with an isotropic cell-size octave blend and
 * 3:1 lattices.
 */
export const PIXEL_ART_BAND_OFFSET = /* glsl */ `
uniform float bandFeatureCells;
uniform float bandSkyScale;
uniform vec3 carBandStreaks; // cars.ts: x amplitude (bands; < 0 off), y, z |field| where a streak starts / is full
uniform vec2 carFarBand;     // cars.ts: depth (m) over which distant cars lose their streaks (flat livery steps)
float artBandOffset(ivec2 cell, vec4 data) {
  if (artSurfaceReady > .5) {
    float band = texelFetch(surfaceFields, cell, 0).x;
    // Car paint is flat bands broken only by sparse horizontal reflection
    // streaks (the car-anchored field's extremes); glass takes no offset.
    int car = carBandStreaks.x < 0. ? 0 : artCarKind(cell);
    if (car == 1) return sign(band) * smoothstep(carBandStreaks.y, carBandStreaks.z, abs(band)) * carBandStreaks.x
      * (1. - smoothstep(carFarBand.x, carFarBand.y, data.x));
    if (car == 2) return 0.;
    return band;
  }
  vec2 centre = vec2(cell) + .5;
  if (data.w >= .5) {
    // The painted sky already carries cloud shapes; only rag its band edges.
    vec3 dir = artWorldRay(centre);
    float angle = artCellWorldScale * bandFeatureCells;
    return (artValueNoise(vec3(dir.x, dir.y * 3., dir.z) / max(angle * 3., 1e-5), 17) - .5) * bandSkyScale;
  }
  vec3 world = artWorldPosition(centre, data.x);
  float feature = max(artCellWorldSize(data.x) * bandFeatureCells, 1e-4);
  float level = log2(feature);
  float octave = floor(level);
  vec3 anisotropy = vec3(3., 1., 3.);
  float fine = artValueNoise(world / (exp2(octave) * anisotropy), int(octave) + 64);
  float coarse = artValueNoise(world / (exp2(octave + 1.) * anisotropy), int(octave) + 65);
  return mix(fine, coarse, level - octave) - .5;
}
`;
