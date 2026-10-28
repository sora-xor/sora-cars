import * as THREE from 'three';
import { scannedSurface } from './surfaces';

function pavingScan() {
  const scan = scannedSurface('concrete_pavement_03');
  return { map: scan.map, normalMap: scan.normalMap, surface: scan.roughnessMap };
}

/** Scanned concrete frontage gives way to the original soil behind buildings.
 * Requires createUrbanGround's roadDistance attribute and world XZ / 3.15 UVs.
 * The original native pavement footprint and all ground vertices are untouched.
 */
export function createUrbanPavingMaterial(): THREE.MeshStandardMaterial {
  const soil = scannedSurface('forest_ground_04'), paving = pavingScan();
  // Packed AO is applied explicitly below, after blending both scan channels.
  // Keeping the normal AO include intact lets later decorators (including the
  // vehicle visibility pass) compose without losing their insertion point.
  const material = new THREE.MeshStandardMaterial({ map: soil.map, normalMap: soil.normalMap,
    roughnessMap: soil.roughnessMap, color: '#ffffff', roughness: 1, metalness: 0,
    normalScale: new THREE.Vector2(1, 1) });
  material.name = 'SORA concrete frontage and rear soil';
  material.userData.urbanPavingTextures = [soil.map, soil.normalMap, soil.roughnessMap,
    paving.map, paving.normalMap, paving.surface];
  material.userData.urbanPaving = { fullDistance: 15, soilDistance: 22, pavingRepeat: 2.1, soilRepeat: 3.15 };
  material.customProgramCacheKey = () => 'sora-urban-frontage-paving-v1';
  material.onBeforeCompile = shader => {
    shader.uniforms.soraUrbanPavingColor = { value: paving.map };
    shader.uniforms.soraUrbanPavingNormal = { value: paving.normalMap };
    shader.uniforms.soraUrbanPavingSurface = { value: paving.surface };
    shader.uniforms.soraUrbanSoilTint = { value: new THREE.Color('#a9a2a6') };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float roadDistance;\nvarying float soraUrbanRoadDistance;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nsoraUrbanRoadDistance = roadDistance;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float soraUrbanRoadDistance;
uniform sampler2D soraUrbanPavingColor;
uniform sampler2D soraUrbanPavingNormal;
uniform sampler2D soraUrbanPavingSurface;
uniform vec3 soraUrbanSoilTint;`)
      .replace('#include <map_fragment>', `
// Both surfaces use continuous world-aligned UVs. A 1.5 ratio gives the
// concrete its measured 2.1 m repeat while soil retains its 3.15 m repeat.
float soraUrbanPavingWeight = 1.0 - smoothstep(15.0, 22.0, soraUrbanRoadDistance);
vec2 soraUrbanPavingUv = vMapUv * 1.5;
vec4 soraUrbanSurface = mix(texture2D(roughnessMap, vRoughnessMapUv),
  texture2D(soraUrbanPavingSurface, soraUrbanPavingUv), soraUrbanPavingWeight);
${THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )',
  'mix(texture2D(map, vMapUv) * vec4(soraUrbanSoilTint, 1.0), texture2D(soraUrbanPavingColor, soraUrbanPavingUv), soraUrbanPavingWeight)')}`)
      .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment
        .replace('texture2D( roughnessMap, vRoughnessMapUv )', 'soraUrbanSurface'))
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps
        .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `
vec3 soraUrbanSoilNormal = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
vec3 soraUrbanConcreteNormal = texture2D(soraUrbanPavingNormal, soraUrbanPavingUv).xyz * 2.0 - 1.0;
soraUrbanSoilNormal.xy *= 0.7;
soraUrbanConcreteNormal.xy *= 0.45;
vec3 mapN = normalize(mix(soraUrbanSoilNormal, soraUrbanConcreteNormal, soraUrbanPavingWeight));`))
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
float soraUrbanOcclusion = (soraUrbanSurface.r - 1.0) * mix(1.0, 0.8, soraUrbanPavingWeight) + 1.0;
reflectedLight.indirectDiffuse *= soraUrbanOcclusion;
#if defined(USE_CLEARCOAT)
  clearcoatSpecularIndirect *= soraUrbanOcclusion;
#endif
#if defined(USE_SHEEN)
  sheenSpecularIndirect *= soraUrbanOcclusion;
#endif
#if defined(USE_ENVMAP) && defined(STANDARD)
  float soraUrbanDotNV = saturate(dot(geometryNormal, geometryViewDir));
  reflectedLight.indirectSpecular *= computeSpecularOcclusion(soraUrbanDotNV, soraUrbanOcclusion, material.roughness);
#endif`);
  };
  return material;
}
