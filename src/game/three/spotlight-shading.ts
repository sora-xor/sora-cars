import * as THREE from 'three';

const installed = new WeakSet<THREE.WebGLRenderer>();
const directCall = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

/** Skip the physical BRDF only when Three has already found exactly zero spot
 * illumination. The light's attenuation, cookies and shadows stay unchanged.
 * This saves the many out-of-range street/shop/headlight fragment evaluations.
 */
export function installSpotlightEarlyOut(renderer: THREE.WebGLRenderer): void {
  if (installed.has(renderer)) return;
  const source = THREE.ShaderChunk.lights_fragment_begin;
  const start = source.indexOf('#if ( NUM_SPOT_LIGHTS > 0 )');
  const end = source.indexOf('#pragma unroll_loop_end', start);
  const spots = source.slice(start, end);
  // Retain Three's default shading if a future shader layout no longer matches.
  if (start < 0 || end < 0 || spots.split(directCall).length !== 2) return;
  const guarded = source.slice(0, start) + spots.replace(directCall,
    `if ( directLight.visible ) { ${directCall} }`) + source.slice(end);
  installed.add(renderer);

  const materials = new WeakSet<THREE.Material>();
  const renderBufferDirect = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (...args) {
    const material = args[3];
    if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial && !materials.has(material)) {
      materials.add(material);
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
      // Three's default key reads onBeforeCompile.toString(). Preserve the old
      // hook's identity before replacing it; custom keys may remain dynamic.
      const defaultKey = key === THREE.Material.prototype.customProgramCacheKey ? key.call(material) : undefined;
      material.onBeforeCompile = function (shader, activeRenderer) {
        compile.call(this, shader, activeRenderer);
        if (activeRenderer === renderer) {
          shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', guarded);
        }
      };
      material.customProgramCacheKey = function () {
        return `${defaultKey ?? key.call(this)}:sora-spotlight-early-out-v1`;
      };
      material.needsUpdate = true;
    }
    // This public entry point precedes Three's program selection. Decorating
    // once here also covers asynchronously loaded and newly created materials,
    // without traversing the scene again or editing global ShaderChunk state.
    return renderBufferDirect.apply(this, args);
  };
}
