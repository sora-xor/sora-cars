import * as THREE from 'three';

/**
 * Late-autumn colour for the authored broadleaf trees (the instanced "mature tree" crowns of the forest banks and the
 * woods up the hillsides). On the autumn routes every hillside in the cutscenes (iroha-wide, nara-wide, aizu-right) is
 * crimson, orange and gold among dark evergreens, where these crowns kept their summer green. Each tree takes one
 * tone from its own position, so a hillside is a patchwork rather than one tint; one in sixteen keeps its green. The
 * tones are the hues of the repaints' crowns, mostly crimson, and the crown's light keeps them: plain lighting paled
 * the sunlit leaves to peach and sank the shade toward maroon under the dusk sky (Umagaeshi: crown chroma .11-.14
 * against the repaint's .14-.16), where the repaints warm sunlit leaves toward orange and gold. The flora maples
 * (period-city/flora.ts) are lit the same way. The amount is shared by every leaf material and set per course
 * (period-city/index.ts).
 */
const autumn = { value: 0 };

/**
 * A painted crown's light, shared by these trees and the flora plants (period-city/flora.ts): x the brightest channel
 * where a sunlit crown's highlights begin to compress, y the ceiling they approach. The race tone curve (PBR Neutral at
 * the day exposure) fades anything brighter toward white, which paled sunlit orange leaves to peach; held under its
 * shoulder they stay the repaints' saturated orange and gold.
 */
export const crownLight = { value: new THREE.Vector2(.3, .5) };

/**
 * GLSL for just before `#include <opaque_fragment>` of a lit standard material: the crown keeps its own hue through light
 * and shade, its sunlit leaves warm toward gold (crimson through vermilion to orange, the repaints' highlights) and its
 * highlights stay under the tone curve's shoulder. Plants holding more green than half their red (cedars, pines,
 * willows, the buff susuki) keep their hue. `amount` (a GLSL float) blends it in; the material declares soraCrownLight.
 */
export function crownLightGlsl(amount: string): string {
  return `{
    const vec3 luma = vec3(.2126, .7152, .0722);
    float sunlit = dot(reflectedLight.directDiffuse, luma) / max(dot(totalDiffuse, luma), 1e-5);
    vec3 hue = diffuseColor.rgb;
    hue.g = mix(hue.g, max(hue.g, hue.r * .5), sunlit * sunlit * .8);
    vec3 painted = dot(outgoingLight, luma) * hue / max(dot(hue, luma), 1e-4);
    float peak = max(painted.r, max(painted.g, painted.b)), knee = soraCrownLight.x, top = soraCrownLight.y;
    if (peak > knee) painted *= (knee + (top - knee) * (1. - exp(-(peak - knee) / (top - knee)))) / peak;
    outgoingLight = mix(outgoingLight, painted, ${amount});
  }
  `;
}

/** Turn the authored trees' leaves (0 summer green .. 1 full late-autumn colour). */
export function setAutumnFoliage(amount: number): void {
  autumn.value = THREE.MathUtils.clamp(amount, 0, 1);
}

/** Patch a leaf material once so it follows `setAutumnFoliage`; its own shader and cache key are kept. */
export function autumnFoliage(material: THREE.MeshStandardMaterial): void {
  if (material.userData.soraAutumnFoliage) return;
  material.userData.soraAutumnFoliage = true;
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.soraAutumnLeaves = autumn;
    shader.uniforms.soraCrownLight = crownLight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSoraTree;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vSoraTree = (modelMatrix * instanceMatrix[3]).xz;
#else
  vSoraTree = modelMatrix[3].xz;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSoraTree;\nuniform float soraAutumnLeaves;\nuniform vec2 soraCrownLight;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  if (soraAutumnLeaves > 0.) {
    // One tone per tree (its position to the nearest 3 m, so a crown's leaves agree): crimson, vermilion, orange, gold,
    // a deep crimson, or its own green. The leaf texture's light and shade are kept.
    float pick = fract(sin(dot(floor(vSoraTree / 3.), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 tone = pick < .4 ? vec3(.95, .052, .04) : pick < .6 ? vec3(.92, .15, .03) : pick < .72 ? vec3(.92, .3, .05)
      : pick < .78 ? vec3(.88, .47, .09) : pick < .94 ? vec3(.55, .04, .03) : diffuseColor.rgb / max(dot(diffuseColor.rgb, vec3(.2126, .7152, .0722)), .02) * .18;
    float light = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
    diffuseColor.rgb = mix(diffuseColor.rgb, tone * clamp(light / .18, .35, 1.6), soraAutumnLeaves);
  }`)
      .replace('#include <opaque_fragment>', `if (soraAutumnLeaves > 0.) ${crownLightGlsl('soraAutumnLeaves')}
  #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${previousKey()}|sora-autumn-leaves-v3`;
  material.needsUpdate = true;
}
