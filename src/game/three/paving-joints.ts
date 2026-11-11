import * as THREE from 'three';

/**
 * Jointed paving drawn into a ground material's albedo (finish pass, November 11, 2026): kerb stones and paving
 * slabs with dark joints and a tone of their own each, as every cutscene and cutscene-style repaint draws a
 * pavement. The scanned concrete alone resolved to one flat tone at the art grid.
 *
 * A joint is at least about an art cell wide (two scene pixels; the pixel-art pass supersamples 2-3 times), so the
 * cell resolve keeps it as a line rather than dropping every other cell, and it fades out where a slab spans only a
 * few cells, so the far pavement stays calm instead of shimmering.
 *
 * Joints that cross the direction of travel strobe at race speed (a 0.9 m kerb stone passes in one tick at 97 km/h),
 * so they and the slabs' own tones fade out as the camera's travel per tick nears a slab's length; the joints that run
 * with the travel hold still and stay. Standing or cornering slowly, the whole pattern shows.
 */
export const PAVING_JOINTS_GLSL = /* glsl */ `
uniform float soraPavingStrength; // 1: joints drawn; 0: the plain scan (A/B captures)
uniform vec2 soraPavingTravel;    // the camera's travel over the ground per simulation tick (m, world XZ)
float soraPavingHash(vec2 cell) { return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453); }
/** The detail kept across a joint direction at speed: travel (slab lengths per tick) under 0.3 keeps all, over 0.6 none. */
float soraTravelKeep(float travel) { return 1. - smoothstep(.3, .6, abs(travel)); }
/** How much of a slab's own detail survives: 1 near the camera, 0 where a slab spans under about three art cells. */
float soraSlabKeep(float footprint) { return 1. - smoothstep(.1, .22, footprint); }
/** A joint at every integer of p (slab units; footprint: slab units per scene pixel; width: the joint's own). 0-1. */
float soraJoint(float p, float footprint, float width) {
  float f = fract(p), d = min(f, 1. - f), w = max(width, footprint * 2.);
  return (1. - smoothstep(w * .5, w, d)) * soraSlabKeep(footprint);
}`;

/** Live controls shared by every jointed material (world.ts sets the travel each frame). */
export const pavingUniforms = { soraPavingStrength: { value: 1 }, soraPavingTravel: { value: new THREE.Vector2() } };
/** Shares the live controls with a material's program (call from its onBeforeCompile). */
export function sharePavingUniforms(shader: { uniforms: Record<string, THREE.IUniform> }): void {
  shader.uniforms.soraPavingStrength = pavingUniforms.soraPavingStrength;
  shader.uniforms.soraPavingTravel = pavingUniforms.soraPavingTravel;
}

/** The kerb's stones run to this far beyond the road edge (m); paving slabs beyond. */
export const KERB_STONE_END = 0.47;
/** A kerb stone's length, and a walkway slab's length and width (m). */
export const KERB_STONE = 0.9, WALK_SLAB = [0.6, 0.377] as const;

/**
 * The roadside kerb and its walkway (infrastructure.ts, 'Beveled curb and sidewalk'): granite kerb stones along the
 * road, then rows of slabs in a running bond. Needs the `roadEdge` attribute (metres beyond the road edge) and the
 * section's UVs (u: progress / 2.4). Meshes of the same material without the attribute are left alone.
 */
export function decorateKerb(material: THREE.MeshStandardMaterial): void {
  const previous = material.onBeforeCompile;
  material.customProgramCacheKey = () => 'sora-kerb-stones-v1';
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    sharePavingUniforms(shader);
    if (!shader.fragmentShader.includes('#include <map_fragment>') || !shader.vertexShader.includes('#include <uv_vertex>'))
      throw new Error('Unsupported kerb material shader layout');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float roadEdge;\nvarying float soraKerbEdge;\nvarying float soraKerbAlong;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nsoraKerbEdge = roadEdge;\nsoraKerbAlong = uv.x * 2.4;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float soraKerbEdge;\nvarying float soraKerbAlong;\n${PAVING_JOINTS_GLSL}`)
      .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
if (soraKerbEdge > .2 && soraKerbEdge < 1.7) {
  float soraAlongStep = fwidth(soraKerbAlong), soraEdgeStep = fwidth(soraKerbEdge), soraTone, soraTravel = length(soraPavingTravel);
  if (soraKerbEdge < ${KERB_STONE_END.toFixed(3)}) {
    // Kerb stones: pale granite, a joint between each.
    float q = soraKerbAlong / ${KERB_STONE.toFixed(3)}, fq = soraAlongStep / ${KERB_STONE.toFixed(3)};
    float keep = soraTravelKeep(soraTravel / ${KERB_STONE.toFixed(3)});
    soraTone = (.98 + .08 * (soraPavingHash(vec2(floor(q), 7.)) * 2. - 1.) * soraSlabKeep(fq) * keep) * (1. - .5 * soraJoint(q, fq, .035) * keep);
  } else {
    // Walkway slabs in a running bond, a shade darker than the kerb.
    vec2 q = vec2(soraKerbAlong / ${WALK_SLAB[0].toFixed(3)}, (soraKerbEdge - ${KERB_STONE_END.toFixed(3)}) / ${WALK_SLAB[1].toFixed(3)});
    vec2 fq = vec2(soraAlongStep / ${WALK_SLAB[0].toFixed(3)}, soraEdgeStep / ${WALK_SLAB[1].toFixed(3)});
    q.x += .5 * mod(floor(q.y), 2.);
    float keep = soraTravelKeep(soraTravel / ${WALK_SLAB[0].toFixed(3)});
    float joint = max(soraJoint(q.x, fq.x, .03) * keep, soraJoint(q.y, fq.y, .05));
    soraTone = (.8 + .07 * (soraPavingHash(floor(q)) * 2. - 1.) * soraSlabKeep(fq.x) * soraSlabKeep(fq.y) * keep) * (1. - .4 * joint);
  }
  // The seam where the kerb stones meet the slabs.
  float soraSeam = max(.02, soraEdgeStep * 2.);
  soraTone *= 1. - .45 * (1. - smoothstep(soraSeam * .5, soraSeam, abs(soraKerbEdge - ${KERB_STONE_END.toFixed(3)}))) * soraSlabKeep(soraEdgeStep / .3);
  diffuseColor.rgb *= mix(1., soraTone, soraPavingStrength);
}`);
  };
}
