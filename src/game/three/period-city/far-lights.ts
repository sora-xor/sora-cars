import * as THREE from 'three';
import { ART_SHORT_SIDE } from '../pixel-art/grid';
import { cityGroundLights } from './materials';

/**
 * Far lights (the user's rain-night concept, whose street glows with lamp
 * heads, rows of red lanterns and lit signs all the way to the vanishing
 * point). A lamp globe 100 m away covers well under one art cell, so the cell
 * resolve averages it into the dark around it and the far street goes dim.
 * Every lamp globe, lantern and box sign therefore also leaves a beacon
 * (CityMeshBuilder.beacon): a round additive point at the light, never drawn
 * smaller than MIN_CELLS art cells and bright enough (HDR) for the glow stage
 * to give it a halo. Beacons fade in beyond NEAR metres, where the light's own
 * geometry starts to fall below a few cells, are depth tested (buildings hide
 * them) and burn with the street's lights (0 by day, 1 at night).
 */
const NEAR = 24, FULL = 55, MIN_CELLS = 2;
/** Floats per beacon: position (3), linear HDR colour (3), the light's size in metres (1). */
export const BEACON_STRIDE = 7;

/** Target pixels per radian (vertical) and the smallest drawn size in pixels, fitted to each render. */
const pixels = { value: new THREE.Vector2(800, 4) };
let material: THREE.ShaderMaterial | undefined;
function farLightMaterial(): THREE.ShaderMaterial {
  if (material) return material;
  material = new THREE.ShaderMaterial({
    name: 'Period city far lights',
    uniforms: { farNight: cityGroundLights, farPixels: pixels },
    vertexShader: /* glsl */ `
      attribute vec3 lightColour;
      attribute float lightSize;
      uniform vec2 farPixels;
      varying vec3 vColour;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.);
        float distance = length(view.xyz);
        // Drawn just in front of the light's own surface, so its globe or lantern never hides it.
        view.xyz *= max(distance - lightSize, .05) / max(distance, 1e-3);
        gl_Position = projectionMatrix * view;
        gl_PointSize = max(lightSize / max(distance, .1) * farPixels.x, farPixels.y);
        vColour = lightColour * smoothstep(${NEAR}., ${FULL}., distance);
      }`,
    fragmentShader: /* glsl */ `
      uniform float farNight;
      varying vec3 vColour;
      void main() {
        vec2 d = gl_PointCoord - .5;
        if (dot(d, d) > .25) discard;
        gl_FragColor = vec4(vColour * farNight, 1.);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  });
  return material;
}

/** Fit the point sizes to the target being drawn (the pixel-art scene target, or the canvas) and the camera. */
const target = new THREE.Vector2();
function fitPixels(renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera): void {
  const current = renderer.getRenderTarget();
  if (current) target.set(current.width, current.height); else renderer.getDrawingBufferSize(target);
  const fov = camera instanceof THREE.PerspectiveCamera ? THREE.MathUtils.degToRad(camera.getEffectiveFOV()) : 1;
  pixels.value.set(target.y / (2 * Math.tan(fov / 2)), MIN_CELLS * Math.min(target.x, target.y) / ART_SHORT_SIDE);
}

function farLightPoints(geometry: THREE.BufferGeometry): THREE.Points {
  const points = new THREE.Points(geometry, farLightMaterial());
  points.name = 'Period city far lights'; points.renderOrder = 1;
  points.onBeforeRender = fitPixels;
  return points;
}

/** A chunk's beacons (BEACON_STRIDE floats each, in the chunk's frame) as one points object; null when it has none. */
export function farLights(beacons: readonly number[]): THREE.Points | null {
  const count = beacons.length / BEACON_STRIDE;
  if (!count) return null;
  const position = new Float32Array(count * 3), colour = new Float32Array(count * 3), size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * BEACON_STRIDE;
    for (let k = 0; k < 3; k++) { position[i * 3 + k] = beacons[o + k]!; colour[i * 3 + k] = beacons[o + 3 + k]!; }
    size[i] = beacons[o + 6]!;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('lightColour', new THREE.BufferAttribute(colour, 3));
  geometry.setAttribute('lightSize', new THREE.BufferAttribute(size, 1));
  geometry.computeBoundingSphere();
  return farLightPoints(geometry);
}

/** Beacons that move each frame (the race's own street lamps): fill with `set`, then `commit` the count. */
export class MovingFarLights {
  readonly points: THREE.Points;
  private readonly position: THREE.BufferAttribute;
  private readonly colour: THREE.BufferAttribute;
  private readonly size: THREE.BufferAttribute;

  constructor(capacity: number) {
    const geometry = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.colour = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('lightColour', this.colour);
    geometry.setAttribute('lightSize', this.size);
    geometry.setDrawRange(0, 0);
    this.points = farLightPoints(geometry);
    this.points.frustumCulled = false;
  }

  set(i: number, at: THREE.Vector3, colour: THREE.Color, size: number): void {
    this.position.setXYZ(i, at.x, at.y, at.z); this.colour.setXYZ(i, colour.r, colour.g, colour.b); this.size.setX(i, size);
  }

  commit(count: number): void {
    this.points.geometry.setDrawRange(0, count);
    this.position.needsUpdate = true; this.colour.needsUpdate = true; this.size.needsUpdate = true;
  }

  dispose(): void { this.points.geometry.dispose(); }
}
