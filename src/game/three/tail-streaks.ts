import * as THREE from 'three';
import type { CarModel } from './car';

/**
 * Wet roads mirror the cars' tail lamps in long red streaks running from
 * each lamp toward the camera, as a light's reflection in wet asphalt does
 * (straight down the screen under the lamp; the user's rain-night target):
 * two soft additive bands on the road per car, strongest at the lamp, as
 * strong as the road is wet. Presentation only; kept apart from the car
 * groups so the pixel-art car stages never take them for bodywork.
 */
const LAMP = { x: .55, z: -2.02 } as const, WIDTH = .26;
/**
 * Each streak starts this far under the car: from the chase camera the road
 * just behind the bumper shows through the gap under the rear overhang, in
 * the car's shadow, and a streak starting at the bumper line read as floating
 * a hand's width below the car. Starting beneath it, the streak runs out from
 * under the bumper as the concept's do.
 */
const UNDER = .9, LENGTH = 7 + UNDER;

export class TailStreaks {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly matrix = new THREE.Matrix4();
  private readonly lamp = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(capacity = 16) {
    // Flat on the road, running back from the lamp (uv.y 0 at the lamp, 1 at the far end).
    const geometry = new THREE.PlaneGeometry(WIDTH, LENGTH); geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0, -LENGTH / 2);
    this.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .035, .03), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.material.name = 'Wet-road tail lamp streaks';
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('void main() {', 'varying vec2 vStreak;\nvoid main() {\nvStreak = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'varying vec2 vStreak;\nvoid main() {')
        // A long red streak, as a light mirrored in wet asphalt (the user's concept and the cutscene-style repaint
        // of a race frame): a hot yellow core down its axis near the lamp, saturated red either side, ragged edges
        // row by row and small dark holes through it, more toward the far end; solid out from under the bumper.
        .replace('#include <alphamap_fragment>', /* glsl */ `#include <alphamap_fragment>
        {
          float row = floor(vStreak.y * 40.);
          float sway = fract(sin(row * 12.9898) * 43758.5453) - .5, reach = fract(sin(row * 78.233) * 43758.5453);
          float halfWidth = mix(.32, .5, reach) * (1. - .35 * vStreak.y);
          float x = abs(vStreak.x - .5 - sway * .1);
          float body = smoothstep(halfWidth, halfWidth - .12, x);
          float speck = fract(sin(dot(vec2(row, floor(vStreak.x * 8.)), vec2(12.9898, 78.233))) * 43758.5453);
          body *= speck < .3 * smoothstep(.15, 1., vStreak.y) ? 0. : 1.;
          float core = smoothstep(.15, .04, x) * (1. - smoothstep(0., .65, vStreak.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1., .72, .3), core * .85);
          diffuseColor.a *= body * (1. - vStreak.y) * 1.3;
        }`);
    };
    this.material.customProgramCacheKey = () => 'sora-tail-streaks-v6';
    this.mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
    this.mesh.name = 'Wet-road tail lamp streaks';
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  /** Follow the visible cars; `wetness` (0-1) is the road's; each streak points from its lamp toward `camera`. */
  update(cars: readonly CarModel[], wetness: number, camera: THREE.Vector3): void {
    this.material.opacity = THREE.MathUtils.clamp((wetness - .3) / .55, 0, 1) * .85;
    let n = 0;
    if (this.material.opacity > 0) for (const car of cars) {
      if (!car.group.visible || n + 2 > this.mesh.instanceMatrix.count) continue;
      car.group.updateMatrix();
      for (const side of [-1, 1]) {
        this.lamp.set(side * LAMP.x, .02, LAMP.z + UNDER).applyMatrix4(car.group.matrix);
        // The streak's length runs along its local -Z: turn that toward the camera across the ground.
        this.turn.setFromAxisAngle(this.up, Math.atan2(this.lamp.x - camera.x, this.lamp.z - camera.z));
        this.mesh.setMatrixAt(n++, this.matrix.compose(this.lamp, this.turn, this.one));
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void { this.mesh.geometry.dispose(); this.material.dispose(); this.mesh.dispose(); }
}
