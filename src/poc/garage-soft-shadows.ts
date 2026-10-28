import * as THREE from 'three';

const shadowInclude = '#include <shadowmap_pars_fragment>';
const pcfSignature = 'float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {';
const pcfEnd = '#elif defined( SHADOWMAP_TYPE_VSM )';

// Check the installed implementation, including projection/bias/frustum/intensity
// semantics, so a Three upgrade cannot silently apply this patch to changed code.
const expectedPCF = /* glsl */ `
float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
  float shadow = 1.0;
  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.z += shadowBias;
  bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
  bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
  if ( frustumTest ) {
    // Hardware PCF with LinearFilter gives us 4-tap filtering per sample
    // 5 samples using Vogel disk + IGN = effectively 20 filtered taps with better distribution
    vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
    float radius = shadowRadius * texelSize.x;
    // Use IGN to rotate sampling pattern per pixel
    float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
    shadow = (
      texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
      texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
      texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
      texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
      texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
    ) * 0.2;
  }
  return mix( 1.0, shadow, shadowIntensity );
}
`;

const garagePCF = /* glsl */ `
uniform float soraGarageShadowStrength;
${pcfSignature}
  float shadow = 1.0;
  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.z += shadowBias;
  bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
  bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
  if ( frustumTest ) {
    vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
    vec2 radius = texelSize * mix( 1.0, shadowRadius, soraGarageShadowStrength );
    float weightedShadow = 0.0;
    float totalWeight = 0.0;
    for ( int i = 0; i < 32; i ++ ) {
      // Fixed in shadow-map axes: moving the viewing camera never rotates the
      // kernel. Each lookup still benefits from the sampler's hardware PCF.
      vec2 offset = vogelDiskSample( i, 32, 0.0 );
      // Taper the outer samples without throwing them away. This reduces the
      // visible circular tail of a large, uniformly weighted disk footprint.
      float weight = 1.0 - 0.65 * dot( offset, offset );
      weightedShadow += weight * texture( shadowMap, vec3( shadowCoord.xy + offset * radius, shadowCoord.z ) );
      totalWeight += weight;
    }
    shadow = weightedShadow / totalWeight;
  }
  return mix( 1.0, shadow, shadowIntensity );
}
`;

function localShadowChunk() {
  const source = THREE.ShaderChunk.shadowmap_pars_fragment;
  const start = source.indexOf(pcfSignature);
  const end = source.indexOf(pcfEnd, start);
  // Three's distributed build strips comments from its source GLSL chunks.
  const normalize = (value: string) => value.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  if (start < 0 || end < 0 || source.indexOf(pcfSignature, start + 1) !== -1
    || normalize(source.slice(start, end)) !== normalize(expectedPCF)) {
    throw new Error('Garage soft-shadow patch requires the expected Three PCF getShadow implementation.');
  }
  return source.slice(0, start) + garagePCF + source.slice(end);
}

/** POC-only fixed-radius PCF; this does not model an area emitter or PCSS. */
export function createGarageSoftShadows() {
  const strength = { value: 1 };
  const styled = new WeakSet<THREE.Material>();
  const chunk = localShadowChunk();
  return {
    // Zero retains this deterministic 32-sample filter at one texel. It does
    // not restore Three's five-sample, screen-noise-rotated implementation.
    setStrength(value: number) {
      strength.value = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
    },
    apply(root: THREE.Object3D) {
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          // Physical inherits Standard; transparent receivers need the same
          // light-space filter so their lighting agrees with nearby bodywork.
          if (!(material instanceof THREE.MeshStandardMaterial) || styled.has(material)) continue;
          styled.add(material);
          const previous = material.onBeforeCompile;
          const previousKey = material.customProgramCacheKey();
          material.onBeforeCompile = (shader, renderer) => {
            previous.call(material, shader, renderer);
            const start = shader.fragmentShader.indexOf(shadowInclude);
            if (start < 0 || shader.fragmentShader.indexOf(shadowInclude, start + 1) !== -1) {
              throw new Error(`Garage soft-shadow patch requires one shadow chunk in material ${material.name || material.uuid}.`);
            }
            shader.uniforms.soraGarageShadowStrength = strength;
            shader.fragmentShader = shader.fragmentShader.replace(shadowInclude, chunk);
          };
          material.customProgramCacheKey = () => `${previousKey}:poc-garage-vogel32-shadows-v1`;
          material.needsUpdate = true;
        }
      });
    },
  };
}
