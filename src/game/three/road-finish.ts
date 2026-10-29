import * as THREE from 'three';

export interface RoadFinish {
  /** Weather saturation, from scattered residual dampness (0) to wet pavement (1). */
  setWetness(value: number): void;
  /** Allows comparing the original scanned asphalt with the physical finish. */
  setEnabled(enabled: boolean): void;
  /**
   * Soft ceiling (linear radiance, before exposure) on the directional key
   * light's specular on the road; 0 or less removes it. Lamp and shop
   * (spot) highlights are never limited.
   */
  setKeySpecularLimit(value: number): void;
  /**
   * The same soft ceiling on the spot lights' specular (street-lamp pools,
   * shop lights, headlights); 0 or less removes it (the default). The
   * pixel-art finish sets it (refine round 2): the road's smooth spot
   * highlights read as airbrushed blobs there, and the renderer draws lamp
   * reflections itself (dashed columns and flecks).
   */
  setSpotSpecularLimit(value: number): void;
  /**
   * Share (0-1) of the environment's reflection taken off the road (refine
   * round 4): on a soaked night road the dusk HDR's lavender mirrored over
   * the whole carriageway, where the rain-night target keeps it navy under
   * the lamps' and signs' own reflections. 0 (the default) keeps it all.
   */
  setEnvironmentDim(value: number): void;
}

const decorated = new WeakMap<THREE.MeshStandardMaterial, RoadFinish>();
/** A road finish's ceiling uniforms, shared with its neighbours (shareSpecularLimits). */
type CeilingUniforms = { enabled: { value: number }; keySpecular: { value: number }; spotSpecular: { value: number } };
const ceilings = new WeakMap<RoadFinish, CeilingUniforms>();
const limited = new WeakSet<THREE.Material>();

const fragmentParameters = /* glsl */ `
  varying vec3 soraRoadFinishWorldPosition;
  uniform float soraRoadWetness;
  uniform float soraRoadFinishEnabled;

  float soraRoadFinishHash(vec2 p) {
    vec3 h = fract(vec3(p.xyx) * 0.1031);
    h += dot(h, h.yzx + 33.33);
    return fract((h.x + h.y) * h.z);
  }

  float soraRoadFinishNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    vec2 blend = f * f * (3.0 - 2.0 * f);
    return mix(mix(soraRoadFinishHash(cell), soraRoadFinishHash(cell + vec2(1.0, 0.0)), blend.x),
      mix(soraRoadFinishHash(cell + vec2(0.0, 1.0)), soraRoadFinishHash(cell + vec2(1.0)), blend.x), blend.y);
  }
`;

// After the physical BRDF: route the key (the only directional light) through
// a soft specular ceiling. A low sun on damp, glossy patches otherwise makes
// one blown glare disc (sunrise-wide keeps its road dark, #372c38). Lamp and
// shop spots keep their full amber streaks unless setSpotSpecularLimit gives
// them a ceiling too (the pixel-art finish, which draws its own reflections).
const keySpecularLimit = /* glsl */ `
  uniform float soraRoadKeySpecular;
  uniform float soraRoadSpotSpecular;
  bool soraRoadKeyLight = false;
  #if NUM_DIR_LIGHTS > 0
  void soraRoadKeyLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
    getDirectionalLightInfo( directionalLight, light );
    soraRoadKeyLight = true;
  }
  #define getDirectionalLightInfo soraRoadKeyLightInfo
  #endif
  void soraRoadDirect( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal,
      const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material,
      inout ReflectedLight reflectedLight ) {
    vec3 before = reflectedLight.directSpecular;
    RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    float soraRoadLimit = soraRoadKeyLight ? soraRoadKeySpecular : soraRoadSpotSpecular;
    if ( soraRoadLimit > 0.0 && soraRoadFinishEnabled > 0.5 ) {
      vec3 added = reflectedLight.directSpecular - before;
      float peak = max( added.r, max( added.g, added.b ) );
      float knee = 0.5 * soraRoadLimit;
      // Linear below the knee, then an exponential shoulder toward the ceiling.
      float limited = peak <= knee ? peak : knee + knee * ( 1.0 - exp( -( peak - knee ) / knee ) );
      reflectedLight.directSpecular = before + added * ( peak > 0.0 ? limited / peak : 0.0 );
    }
    soraRoadKeyLight = false;
  }
  #undef RE_Direct
  #define RE_Direct soraRoadDirect
  #if NUM_RECT_AREA_LIGHTS > 0
  // The shop tubes' area-light highlights on the road take the spot ceiling
  // too: a smooth LTC lobe read as an airbrushed blob in the pixel-art finish.
  void soraRoadRectArea( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal,
      const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material,
      inout ReflectedLight reflectedLight ) {
    vec3 before = reflectedLight.directSpecular;
    RE_Direct_RectArea_Physical( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    if ( soraRoadSpotSpecular > 0.0 && soraRoadFinishEnabled > 0.5 ) {
      vec3 added = reflectedLight.directSpecular - before;
      float peak = max( added.r, max( added.g, added.b ) );
      float knee = 0.5 * soraRoadSpotSpecular;
      float limited = peak <= knee ? peak : knee + knee * ( 1.0 - exp( -( peak - knee ) / knee ) );
      reflectedLight.directSpecular = before + added * ( peak > 0.0 ? limited / peak : 0.0 );
    }
  }
  #undef RE_Direct_RectArea
  #define RE_Direct_RectArea soraRoadRectArea
  #endif
`;

/** Patchy dielectric response on the actual road surface. Existing scanned
 * albedo, normal and packed ARM maps remain the source of fine detail; metre
 * scale damp areas change their BRDF response to real lamps and the environment.
 * Keep the material's base roughness near .88 in both weather states and vary
 * setWetness instead of making the entire rainy road uniformly glossy.
 */
export function decorateRoadFinish(material: THREE.MeshStandardMaterial): RoadFinish {
  const existing = decorated.get(material); if (existing) return existing;
  const wetness = { value: 0 }, enabled = { value: 1 }, keySpecular = { value: 0 }, spotSpecular = { value: 0 }, environmentDim = { value: 0 };
  const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  // Three's default key reads this.onBeforeCompile. Capture that original hook
  // while continuing to evaluate authored dynamic cache keys at call time.
  const baseKey = previousKey === THREE.Material.prototype.customProgramCacheKey
    ? () => previousCompile.toString() : () => previousKey.call(material);

  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    if (!shader.vertexShader.includes('#include <project_vertex>')
      || !shader.fragmentShader.includes('#include <roughnessmap_fragment>')
      || !shader.fragmentShader.includes('#include <metalnessmap_fragment>')
      || !shader.fragmentShader.includes('#include <lights_physical_pars_fragment>')) {
      throw new Error('Unsupported road material shader layout');
    }
    shader.uniforms.soraRoadWetness = wetness;
    shader.uniforms.soraRoadFinishEnabled = enabled;
    shader.uniforms.soraRoadKeySpecular = keySpecular;
    shader.uniforms.soraRoadSpotSpecular = spotSpecular;
    shader.uniforms.soraRoadEnvironmentDim = environmentDim;
    shader.vertexShader = 'varying vec3 soraRoadFinishWorldPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', /* glsl */ `
      #include <project_vertex>
      vec4 soraRoadFinishPosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        soraRoadFinishPosition = batchingMatrix * soraRoadFinishPosition;
      #endif
      #ifdef USE_INSTANCING
        soraRoadFinishPosition = instanceMatrix * soraRoadFinishPosition;
      #endif
      soraRoadFinishWorldPosition = (modelMatrix * soraRoadFinishPosition).xyz;
    `);
    shader.fragmentShader = fragmentParameters + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', /* glsl */ `
      #include <roughnessmap_fragment>
      // Fixed world coordinates keep each patch attached to the graded road
      // across chunk boundaries, camera changes and moving native car poses.
      vec2 soraRoadPatchPosition = soraRoadFinishWorldPosition.xz;
      float soraRoadBasin = 0.64 * soraRoadFinishNoise(soraRoadPatchPosition * 0.23)
        + 0.26 * soraRoadFinishNoise(soraRoadPatchPosition * 0.73 + vec2(17.1, -9.4))
        + 0.10 * soraRoadFinishNoise(soraRoadPatchPosition * 1.91 + vec2(-6.3, 21.7));
      float soraRoadPatch = smoothstep(mix(0.69, 0.41, soraRoadWetness),
        mix(0.82, 0.61, soraRoadWetness), soraRoadBasin) * soraRoadFinishEnabled;
      // A drying road (sunrise, wetness 0.2) keeps no glossy patches: they
      // mirrored the pale lavender sky as a smear beside the cars, where
      // sunrise-wide's asphalt is dry and dark.
      soraRoadPatch *= smoothstep(0.2, 0.35, soraRoadWetness);

      float soraRoadScanRoughness = 1.0;
      #ifdef USE_ROUGHNESSMAP
        soraRoadScanRoughness = texelRoughness.g;
      #endif
      // Coarse aggregate interrupts the film. Its photographed ARM pattern,
      // not animated screen noise, breaks up the reflected lamp highlights.
      soraRoadPatch *= 1.0 - 0.30 * smoothstep(0.76, 0.98, soraRoadScanRoughness);
      float soraRoadDryRoughness = clamp(roughnessFactor, 0.55, 0.98);
      float soraRoadDampRoughness = mix(0.105, 0.28, soraRoadScanRoughness);
      roughnessFactor = mix(roughnessFactor,
        mix(soraRoadDryRoughness, soraRoadDampRoughness, soraRoadPatch), soraRoadFinishEnabled);
      // Wet aggregate loses diffuse brightness while its dielectric specular
      // reflection becomes more coherent. No light color is painted into it.
      // A soaked road darkens all over, not only in its patches (refine round
      // 4, the user's rain-night target: a navy road under bright reflections).
      diffuseColor.rgb *= (1.0 - 0.28 * soraRoadPatch) * (1.0 - 0.5 * smoothstep(0.55, 0.9, soraRoadWetness) * soraRoadFinishEnabled);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', /* glsl */ `
      #include <metalnessmap_fragment>
      metalnessFactor = 0.0;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',
      `#include <lights_physical_pars_fragment>\n${keySpecularLimit}`);
    shader.fragmentShader = 'uniform float soraRoadEnvironmentDim;\n' + shader.fragmentShader.replace('#include <lights_fragment_end>',
      '#include <lights_fragment_end>\nreflectedLight.indirectSpecular *= 1.0 - soraRoadEnvironmentDim * soraRoadFinishEnabled;');
  };
  material.customProgramCacheKey = () => `${baseKey()}:sora-road-finish-v3`;
  material.metalness = 0;
  material.needsUpdate = true;
  const controller: RoadFinish = {
    setWetness(value) { wetness.value = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0; },
    setEnabled(value) { enabled.value = value ? 1 : 0; },
    setKeySpecularLimit(value) { keySpecular.value = Number.isFinite(value) ? Math.max(0, value) : 0; },
    setSpotSpecularLimit(value) { spotSpecular.value = Number.isFinite(value) ? Math.max(0, value) : 0; },
    setEnvironmentDim(value) { environmentDim.value = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0; },
  };
  decorated.set(material, controller);
  ceilings.set(controller, { enabled, keySpecular, spotSpecular });
  return controller;
}

/**
 * The road finish's specular ceilings alone (no damp patches) on the road's
 * neighbours: the gutter strip, kerbs and sidewalks (R3 Nikko shoulder
 * glare). Under the low sunrise key their rough concrete scattered one smooth
 * cream glare band along the shoulder, since only the road had the ceiling;
 * now they share its uniforms, so the road's setKeySpecularLimit and
 * setSpotSpecularLimit drive them too. Idempotent per material.
 */
export function shareSpecularLimits(material: THREE.MeshStandardMaterial, road: RoadFinish): void {
  const uniforms = ceilings.get(road);
  if (!uniforms || limited.has(material) || decorated.has(material)) return;
  limited.add(material);
  const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  const baseKey = previousKey === THREE.Material.prototype.customProgramCacheKey
    ? () => previousCompile.toString() : () => previousKey.call(material);
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    if (!shader.fragmentShader.includes('#include <lights_physical_pars_fragment>')) {
      throw new Error('Unsupported shoulder material shader layout');
    }
    shader.uniforms.soraRoadFinishEnabled = uniforms.enabled;
    shader.uniforms.soraRoadKeySpecular = uniforms.keySpecular;
    shader.uniforms.soraRoadSpotSpecular = uniforms.spotSpecular;
    shader.fragmentShader = 'uniform float soraRoadFinishEnabled;\n' + shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',
      `#include <lights_physical_pars_fragment>\n${keySpecularLimit}`);
  };
  material.customProgramCacheKey = () => `${baseKey()}:sora-road-ceiling-v1`;
  material.needsUpdate = true;
}
