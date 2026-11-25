import * as THREE from 'three';

const installed = new WeakSet<THREE.WebGLRenderer>();
const decorators = new WeakMap<THREE.WebGLRenderer, (material: THREE.Material) => void>();
const directCall = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const rectAreaCall = 'RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
/** Program cache suffix of the guarded light chunk. */
export const LIGHT_EARLY_OUT_KEY = 'sora-spotlight-early-out-v2';

/** Guard the one call inside the loop that starts at `marker`; null if the layout no longer matches. */
function guardLoop(source: string, marker: string, call: string, condition: string): string | null {
  const start = source.indexOf(marker);
  const end = source.indexOf('#pragma unroll_loop_end', start);
  if (start < 0 || end < 0) return null;
  const loop = source.slice(start, end);
  if (loop.split(call).length !== 2) return null;
  return source.slice(0, start) + loop.replace(call, `if ( ${condition} ) { ${call} }`) + source.slice(end);
}

/** Skip the physical BRDF only when Three has already found exactly zero spot
 * illumination. The light's attenuation, cookies and shadows stay unchanged.
 * This saves the many out-of-range street/shop/headlight fragment evaluations.
 *
 * Rect area lights get the same exact skip while their colour is zero: their
 * LTC integrals (two or three per light) ran for every lit fragment even with
 * the shop tubes dark, which they always are beside the period city's fixtures.
 * The condition is one uniform for the whole draw, so no fragments diverge.
 */
export function installSpotlightEarlyOut(renderer: THREE.WebGLRenderer): void {
  if (installed.has(renderer)) return;
  const source = THREE.ShaderChunk.lights_fragment_begin;
  // Retain Three's default shading if a future shader layout no longer matches.
  const spots = guardLoop(source, '#if ( NUM_SPOT_LIGHTS > 0 )', directCall, 'directLight.visible');
  if (spots === null) return;
  const guarded = guardLoop(spots, '#if ( NUM_RECT_AREA_LIGHTS > 0 )', rectAreaCall, 'rectAreaLight.color != vec3( 0.0 )') ?? spots;
  installed.add(renderer);

  const materials = new WeakSet<THREE.Material>();
  const decorate = (material: THREE.Material) => {
    if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial || materials.has(material)) return;
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
      return `${defaultKey ?? key.call(this)}:${LIGHT_EARLY_OUT_KEY}`;
    };
    material.needsUpdate = true;
  };
  decorators.set(renderer, decorate);
  const renderBufferDirect = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (...args) {
    // This public entry point precedes Three's program selection. Decorating
    // once here also covers asynchronously loaded and newly created materials,
    // without traversing the scene again or editing global ShaderChunk state.
    decorate(args[3]);
    return renderBufferDirect.apply(this, args);
  };
}

/** Decorate every standard material in `scene` now, so renderer.compile()
 * builds the same programs its draws will use (draws decorate lazily). */
export function prepareSpotlightEarlyOut(renderer: THREE.WebGLRenderer, scene: THREE.Object3D): void {
  const decorate = decorators.get(renderer);
  if (!decorate) return;
  scene.traverse(object => {
    const material = (object as THREE.Mesh).material;
    if (material) for (const each of Array.isArray(material) ? material : [material]) decorate(each);
  });
}
