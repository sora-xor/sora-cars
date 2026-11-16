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
 * shoulder they stay the repaints' saturated orange and gold. z: how much of the sun the crowns answer (their gold tips
 * and the light through their leaves): 1, or less where the route's hills hide the sun (world.ts VALLEY_CROWN_SUN).
 */
export const crownLight = { value: new THREE.Vector3(.3, .5, 1) };

/**
 * Maple leaves drawn larger with distance (finish pass, round thirteen), as the repaints draw every maple: crisp stars
 * about eight to twelve art cells across in any crown, near or far. At true size a crown's leaves fall under five art
 * cells beyond about 25 m, so the cell resolve broke them into a red speckle with sky showing through in pinholes. A leaf
 * grows about its own stalk by its distance over x metres (none nearer), at most y times; z 1 on, 0 off for A/B. The
 * roadside maples (scenery.ts) and the flora maples' leaf cards (period-city/flora.ts) take their own values.
 */
export const roadsideLeafGrowth = { value: new THREE.Vector3(14, 2.6, 1) };
export const floraLeafGrowth = { value: new THREE.Vector3(14, 1.8, 1) };

/**
 * GLSL after `#include <begin_vertex>` of a leaf material: grows each leaf about its stalk (the vec4 attribute
 * `leafCentre`, in the object's space, w 0 for a maple leaf that may grow, 1 for any other) by its distance from the
 * camera. A geometry without the attribute reads (0, 0, 0, 1) and never grows. `growth` names the material's vec3
 * uniform (x metres, y most, z on). Shadows keep the leaves' true size (their depth materials lack this).
 */
export function leafGrowthGlsl(growth: string): string {
  return `
  if (${growth}.z > 0. && leafCentre.w < .5) {
    vec4 soraLeafAt = vec4(leafCentre.xyz, 1.);
#ifdef USE_BATCHING
    soraLeafAt = batchingMatrix * soraLeafAt;
#endif
#ifdef USE_INSTANCING
    soraLeafAt = instanceMatrix * soraLeafAt;
#endif
    soraLeafAt = modelMatrix * soraLeafAt;
    float soraGrow = mix(1., clamp(length(soraLeafAt.xyz - cameraPosition) / ${growth}.x, 1., ${growth}.y), ${growth}.z);
    transformed = leafCentre.xyz + (transformed - leafCentre.xyz) * soraGrow;
  }`;
}

/**
 * GLSL for just before `#include <opaque_fragment>` of a lit standard material: the crown keeps its own hue through light
 * and shade, its sunlit leaves warm toward gold (crimson through vermilion to orange, the repaints' highlights) and its
 * highlights stay under the tone curve's shoulder. Plants holding more green than half their red (cedars, pines,
 * willows, the buff susuki) keep their hue. `amount` (a GLSL float) blends it in; the material declares soraCrownLight.
 * October 31: gold only where a leaf faces the sun (the key, the first directional light). The direct share alone
 * (`sunlit`) is high on any leaf the sun reaches, so it warmed most of every crown and the maples read orange (crown hue
 * median 41-43 degrees against the repaints' 31-34); now a lit leaf turned from the sun stays crimson. A red or orange
 * crown's shaded side takes the sun through its leaves (crownTranslucencyGlsl), so it glows red as the repaints paint
 * it, not maroon; `translucent` false leaves that to the material.
 */
export function crownLightGlsl(amount: string, translucent = true): string {
  return `{
    const vec3 luma = vec3(.2126, .7152, .0722);
    float facing = 0.;
#if NUM_DIR_LIGHTS > 0
    facing = dot(normal, directionalLights[0].direction);
#endif
    ${translucent ? crownTranslucencyGlsl(`${amount} * soraCrownLight.z`) : ''}
    float sunlit = dot(reflectedLight.directDiffuse, luma) / max(dot(totalDiffuse, luma), 1e-5);
    vec3 hue = diffuseColor.rgb;
    hue.g = mix(hue.g, max(hue.g, hue.r * .55), max(pow(sunlit, 3.) * .6, smoothstep(.7, 1., facing) * sunlit * .85 * soraCrownLight.z));
    vec3 painted = dot(outgoingLight, luma) * hue / max(dot(hue, luma), 1e-4);
    float peak = max(painted.r, max(painted.g, painted.b)), knee = soraCrownLight.x, top = soraCrownLight.y;
    if (peak > knee) painted *= (knee + (top - knee) * (1. - exp(-(peak - knee) / (top - knee)))) / peak;
    outgoingLight = mix(outgoingLight, painted, ${amount});
  }
  `;
}

/**
 * Dusk on the autumn crowns (finish pass, round eighteen): 0 by day and by night, up to 1 in a dusk's afterglow (world.ts
 * sets it for a valley route's maples). At Akechidaira's dusk the maples stood as saturated red masses, where the
 * repaint draws lit palmate leaves, orange-red, gold where the light catches them and crimson beneath: the painted crown
 * light is off at dusk (world.ts mapleLight), and every leaf took the same deep red.
 * x the dusk's share (world.ts sets it each frame); y how much a leaf's facing the afterglow counts; z the gold's green
 * against its red (linear); w the gain of the most lit leaves, the least lit taking .45 of it. At 1.5 the crowns stayed
 * darker than the repaint's (warm crown pixels' OKLab L median .37, a fifth under .3, against .51 and 3%); 2.5 gives .44
 * and 6%; at 2.7 the far crown by the rest house turned yellow-orange.
 */
export const crownDusk = { value: new THREE.Vector4(0, .25, .32, 2.5) };

/**
 * GLSL for just before `#include <opaque_fragment>` of a crown's lit material, after crownLightGlsl where both apply: at
 * dusk (`amount`, a GLSL float; `shape` the vec4 uniform crownDusk) a red or orange leaf is relit by how squarely it faces
 * the afterglow (the key, the first directional light) and the open sky above, leaf by leaf (`leaf`, a GLSL float 0-1 of
 * the leaf's own): leaves facing them lighter and warmer, through orange to gold, those beneath and turned away deeper
 * crimson. The leaf keeps its red channel's light (lamps included), so a lit leaf brightens as it turns gold instead of
 * browning at crimson's luminance (round twelve's olive-brown leaves). `keep` (a GLSL vec3) is light left as it is: the
 * amber of a far lamp's glow on the leaves round its window (world.ts), which relit drew a red ring round the head.
 */
export function crownDuskGlsl(amount: string, shape: string, leaf: string, keep = 'vec3(0.)'): string {
  return `
  if (${amount} > 0. && ${leaf} >= 0. && diffuseColor.g < diffuseColor.r * .62) {
    float soraFacing = 0.;
#if NUM_DIR_LIGHTS > 0
    soraFacing = dot(normal, directionalLights[0].direction);
#endif
    float soraSky = dot(normal, normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz));
    float soraLit = clamp(.42 + ${shape}.y * soraFacing + .25 * soraSky + (${leaf} - .5) * .5, 0., 1.);
    // Green against red: crimson beneath, the tree's own tone a step warmer through the middle, gold where it is lit.
    float soraRed = diffuseColor.r, soraGreen = diffuseColor.g / max(soraRed, 1e-4);
    soraGreen = mix(soraGreen * .45, soraGreen + .1, smoothstep(.12, .78, soraLit));
    soraGreen = mix(soraGreen, max(soraGreen, ${shape}.z), smoothstep(.8, 1., soraLit));
    vec3 soraHue = vec3(1., soraGreen, diffuseColor.b / max(soraRed, 1e-4) * mix(.6, 1., soraLit)), soraKeep = ${keep};
    outgoingLight = mix(outgoingLight, max(outgoingLight.r - soraKeep.r, 0.) * mix(${shape}.w * .45, ${shape}.w, soraLit) * soraHue + soraKeep,
      ${amount});
  }`;
}

/** GLSL for a leaf material's vertex shader, after `#include <begin_vertex>`: `vSoraLeaf`, a value 0-1 of each maple leaf's
 * own from its stalk (the `leafCentre` attribute, w 0), and -1 on any other plant (w 1, or no attribute), which
 * crownDuskGlsl leaves alone. Declare `varying float vSoraLeaf`. */
export const LEAF_HASH_GLSL = 'vSoraLeaf = leafCentre.w < .5 ? fract(sin(dot(leafCentre.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453) : -1.;';

/** GLSL (where crownLightGlsl goes): the key light through a red or orange crown's leaves, on its side turned away;
 * `strength` the share of the key it passes. */
export function crownTranslucencyGlsl(amount: string, strength = .75): string {
  return `
#if NUM_DIR_LIGHTS > 0
    outgoingLight += diffuseColor.rgb * RECIPROCAL_PI * directionalLights[0].color * max(-dot(normal, directionalLights[0].direction), 0.)
      * ${strength.toFixed(2)} * step(diffuseColor.g, diffuseColor.r * .5) * (${amount});
#endif
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
      .replace('#include <common>', '#include <common>\nvarying vec2 vSoraTree;\nuniform float soraAutumnLeaves;\nuniform vec3 soraCrownLight;')
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
  material.customProgramCacheKey = () => `${previousKey()}|sora-autumn-leaves-v5`;
  material.needsUpdate = true;
}
