import * as THREE from 'three';
import type { CarBuild, Finish } from '../../car-builds';
import { STRIPES } from '../../car-builds';

/**
 * Paint finishes and painted stripes. Stripes are drawn in the paint's own shader from the car-space position and
 * normal, so the same pinstripe, twin stripes, 80s graphic or Group A livery follows every body, the licensed
 * hachiroku included, without decal geometry.
 */
export interface StripeFrame {
  /** The shoulder line as a straight line in (z, y): rear point, front point. */
  readonly belt: readonly [number, number, number, number];
  readonly sill: number; readonly lowerLine: number;
  /** The painted length: front and rear ends. */
  readonly front: number; readonly rear: number;
}

export function applyFinish(material: THREE.MeshStandardMaterial, finish: Finish): void {
  const physical = material instanceof THREE.MeshPhysicalMaterial ? material : null;
  if (finish === 'metallic') {
    material.metalness = 0.42; material.roughness = 0.34;
    if (physical) { physical.clearcoat = 1; physical.clearcoatRoughness = 0.08; }
  } else if (finish === 'pearl') {
    material.metalness = 0.1; material.roughness = 0.28;
    if (physical) {
      physical.clearcoat = 1; physical.clearcoatRoughness = 0.08;
      physical.iridescence = 0.5; physical.iridescenceIOR = 1.6; physical.iridescenceThicknessRange = [180, 420];
    }
  } else {
    // Solid enamel under a glossy dielectric coat (asset-car.ts): metalness one would mirror the dusk HDR.
    material.metalness = 0; material.roughness = 0.26;
    if (physical) { physical.clearcoat = 0.85; physical.clearcoatRoughness = 0.13; }
  }
}

export interface StripeUniforms {
  soraStripe: { value: number }; soraStripeColor: { value: THREE.Color };
  soraStripeBelt: { value: THREE.Vector4 }; soraStripeBody: { value: THREE.Vector4 };
}
export function stripeUniforms(build: CarBuild, colour: string, frame: StripeFrame): StripeUniforms {
  return {
    soraStripe: { value: STRIPES.indexOf(build.stripe) }, soraStripeColor: { value: new THREE.Color(colour) },
    soraStripeBelt: { value: new THREE.Vector4(...frame.belt) },
    soraStripeBody: { value: new THREE.Vector4(frame.sill, frame.lowerLine, frame.front, frame.rear) },
  };
}

/** Shader edits that paint a build's stripes over the body colour; `key` joins the program cache key. */
export function stripeShader(uniforms: StripeUniforms): { compile: (shader: THREE.WebGLProgramParametersWithUniforms) => void; key: string } {
  return {
    key: 'sora-stripes-v1',
    compile: shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vSoraCar;\nvarying vec3 vSoraCarNormal;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSoraCar = transformed;\nvSoraCarNormal = objectNormal;');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', /* glsl */ `
          varying vec3 vSoraCar;
          varying vec3 vSoraCarNormal;
          uniform int soraStripe;
          uniform vec3 soraStripeColor;
          uniform vec4 soraStripeBelt;
          uniform vec4 soraStripeBody;
          float soraBand(float v, float a, float b) { return step(a, v) * step(v, b); }
          // 0 none, 1 stripe colour, 2 the white keyline of a Group A livery.
          float soraStripeMask(vec3 p, vec3 n, out float keyline) {
            keyline = 0.;
            float belt = mix(soraStripeBelt.y, soraStripeBelt.w, clamp((p.z - soraStripeBelt.x) / (soraStripeBelt.z - soraStripeBelt.x), 0., 1.));
            float side = step(.55, abs(n.x)), up = step(.45, n.y);
            float t = clamp((p.z - soraStripeBody.w) / (soraStripeBody.z - soraStripeBody.w), 0., 1.);
            float inside = soraBand(p.z, soraStripeBody.w + .12, soraStripeBody.z - .12);
            float low = soraStripeBody.x + soraStripeBody.y;
            if (soraStripe == 1) return side * inside * max(soraBand(p.y, belt - .088, belt - .072), soraBand(p.y, belt - .062, belt - .054));
            if (soraStripe == 2) return up * soraBand(abs(p.x), .07, .21);
            if (soraStripe == 3) {
              float m = soraBand(p.y, low + .03, low + .085) * step(.06, t);
              m = max(m, soraBand(p.y, low + .115, low + .15) * step(.3, t));
              m = max(m, soraBand(p.y, low + .18, low + .2) * step(.52, t));
              return side * m * step(t, .93);
            }
            if (soraStripe == 4) {
              float line = mix(belt - .1, low + .08, t);
              keyline = side * soraBand(p.y, line + .012, line + .03);
              return side * step(p.y, line);
            }
            return 0.;
          }
          void main() {`)
        .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
          {
            float soraKeyline;
            float soraMask = soraStripeMask(vSoraCar, normalize(vSoraCarNormal), soraKeyline);
            diffuseColor.rgb = mix(diffuseColor.rgb, soraStripeColor, soraMask);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.86, .84, .8), soraKeyline * (1. - soraMask));
          }`);
    },
  };
}
