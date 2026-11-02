import * as THREE from 'three';

/**
 * Sun flecks through tree crowns. Closed leaf meshes and dense leaf cards fill a crown's shadow solid: Nara's two rows
 * of roadside maples in front of the forest left its afternoon road in one even shade, where the cutscenes paint
 * dappled sun on the ground under the trees (nara-detail-v1). Every crown's shadow pass shares one gap field, laid out
 * in the plane across the key light's direction: a gap opens a whole column of leaves along the sunbeam, through every
 * crown it crosses, so the light reaches the ground as flecks stretched by the sun's elevation. The field is fixed in
 * the world, so the flecks hold still while the shadow volume follows the race.
 */
export const CANOPY_GAP_SHARE = 0.5;
/** The coarser octave's cell (m); the finer octave is 2.7 times smaller. */
const CANOPY_GAP_METRES = 1.1;

const across = { value: new THREE.Vector3(1, 0, 0) }, along = { value: new THREE.Vector3(0, 0, 1) };
const threshold = { value: gapThreshold(CANOPY_GAP_SHARE) };
const up = new THREE.Vector3(0, 1, 0);

/** The noise level above which the field is open. Measured on 200,000 samples of the field below: within 0.01 of
 * the exact quantile for shares 0.2-0.6. */
function gapThreshold(share: number): number {
  return Number.isFinite(share) && share > 0 ? 0.72 - 0.44 * THREE.MathUtils.clamp(share, 0, 1) : 2;
}

/** The share of every crown's shadow that lets the key light through (0 solid crowns). */
export function setCanopyGapShare(share: number): void { threshold.value = gapThreshold(share); }

/** Lays the gap field across the key light: `direction` points from the ground toward the light. */
export function setCanopyGapLight(direction: THREE.Vector3): void {
  across.value.crossVectors(direction, up);
  if (across.value.lengthSq() < 1e-8) across.value.set(1, 0, 0);
  across.value.normalize();
  along.value.crossVectors(across.value, direction).normalize();
}

const VARYING = 'varying vec3 vCanopyWorld;';
const WORLD_VERTEX = /* glsl */ `
{
  vec4 world = vec4(transformed, 1.);
  #ifdef USE_BATCHING
    world = batchingMatrix * world;
  #endif
  #ifdef USE_INSTANCING
    world = instanceMatrix * world;
  #endif
  vCanopyWorld = (modelMatrix * world).xyz;
}`;
const GAP_FRAGMENT = /* glsl */ `
${VARYING}
uniform vec3 canopyGapAcross, canopyGapAlong;
uniform float canopyGapThreshold;
float canopyGapHash(vec2 p) {
  vec3 h = fract(vec3(p.xyx) * .1031);
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}
float canopyGapNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p), w = f * f * (3. - 2. * f);
  return mix(mix(canopyGapHash(cell), canopyGapHash(cell + vec2(1., 0.)), w.x),
    mix(canopyGapHash(cell + vec2(0., 1.)), canopyGapHash(cell + vec2(1.)), w.x), w.y);
}`;

/** Opens the shared gap field in a crown's directional-shadow depth material. */
export function withCanopyGaps(material: THREE.MeshDepthMaterial): THREE.MeshDepthMaterial {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { canopyGapAcross: across, canopyGapAlong: along, canopyGapThreshold: threshold });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VARYING}`)
      .replace('#include <project_vertex>', `#include <project_vertex>${WORLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GAP_FRAGMENT}`)
      .replace('#include <clipping_planes_fragment>', /* glsl */ `#include <clipping_planes_fragment>
  vec2 canopyGapCell = vec2(dot(vCanopyWorld, canopyGapAcross), dot(vCanopyWorld, canopyGapAlong)) / ${CANOPY_GAP_METRES.toFixed(2)};
  if (.62 * canopyGapNoise(canopyGapCell) + .38 * canopyGapNoise(canopyGapCell * 2.7 + 17.3) > canopyGapThreshold) discard;`);
  };
  material.customProgramCacheKey = () => 'sora-canopy-gaps-v1';
  return material;
}

let solidCrownDepth: THREE.MeshDepthMaterial | undefined;
/** The shadow-pass material for a crown of closed leaf geometry (no cutout map). */
export function canopyDepthMaterial(): THREE.MeshDepthMaterial {
  if (!solidCrownDepth) solidCrownDepth = withCanopyGaps(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  return solidCrownDepth;
}
