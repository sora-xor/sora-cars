import * as THREE from 'three';

export interface DrivingEffectCar {
  rearTyres: readonly THREE.Vector3[];
  heading: number;
  speed: number;
  slip: number;
  braking: boolean;
  visible: boolean;
}

/** World-space tyre evidence. These meshes only observe the native driving state. */
export function createDrivingEffects(scene: THREE.Scene) {
  const capacity = 2400, vertices = capacity * 6;
  const positions = new Float32Array(vertices * 3), births = new Float32Array(vertices).fill(-100);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const birth = new THREE.BufferAttribute(births, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position); geometry.setAttribute('birth', birth);
  geometry.setDrawRange(0, 0);
  const clock = { value: 0 };
  const material = new THREE.MeshBasicMaterial({ color: '#11141b', transparent: true, opacity: 0.46,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.onBeforeCompile = shader => {
    shader.uniforms.tyreTime = clock;
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'attribute float birth; varying float tyreBirth; void main() { tyreBirth = birth;');
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform float tyreTime; varying float tyreBirth; void main() {')
      .replace('#include <alphatest_fragment>', 'diffuseColor.a *= 1.0 - smoothstep(5.0, 9.0, tyreTime - tyreBirth); if(diffuseColor.a < 0.002) discard;\n#include <alphatest_fragment>');
  };
  material.customProgramCacheKey = () => 'sora-world-tyre-marks-v1';
  const marks = new THREE.Mesh(geometry, material); marks.name = 'World-space tyre rubber'; marks.frustumCulled = false; marks.renderOrder = 1; scene.add(marks);

  const count = 96;
  const puffGeometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  puffGeometry.index = quad.index; puffGeometry.setAttribute('position', quad.attributes.position!); puffGeometry.setAttribute('uv', quad.attributes.uv!);
  const origins = new Float32Array(count * 3), motion = new Float32Array(count * 4), particleBirths = new Float32Array(count).fill(-100);
  puffGeometry.setAttribute('origin', new THREE.InstancedBufferAttribute(origins, 3).setUsage(THREE.DynamicDrawUsage));
  puffGeometry.setAttribute('motion', new THREE.InstancedBufferAttribute(motion, 4).setUsage(THREE.DynamicDrawUsage));
  puffGeometry.setAttribute('particleBirth', new THREE.InstancedBufferAttribute(particleBirths, 1).setUsage(THREE.DynamicDrawUsage));
  puffGeometry.instanceCount = count;
  const puffMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { time: clock, tint: { value: new THREE.Color('#9b9ba7') } },
    vertexShader: /* glsl */ `
      attribute vec3 origin;
      attribute vec4 motion;
      attribute float particleBirth;
      uniform float time;
      varying vec2 vUv;
      varying float age;
      varying float seed;
      void main() {
        age = time - particleBirth; seed = motion.w;
        vUv = uv;
        vec3 world = origin + motion.xyz * max(age, 0.0);
        world.y += age * age * 0.18;
        vec4 view = viewMatrix * vec4(world, 1.0);
        view.xy += position.xy * (0.2 + max(age, 0.0) * 0.95);
        gl_Position = projectionMatrix * view;
        if(age < 0.0 || age > 1.45) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 tint;
      varying vec2 vUv;
      varying float age;
      varying float seed;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float shape = max(0.0, 1.0 - dot(p, p));
        float swirl = 0.72 + 0.28 * sin(p.x * 8.0 + seed) * sin(p.y * 9.0 - seed + age);
        float opacity = shape * shape * swirl * smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.3, 1.4, age)) * 0.16;
        if(opacity < 0.003) discard;
        gl_FragColor = vec4(tint, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const puffs = new THREE.Mesh(puffGeometry, puffMaterial); puffs.name = 'Tyre smoke in world space'; puffs.frustumCulled = false; puffs.renderOrder = 2; scene.add(puffs);
  let nextMark = 0, markCount = 0, nextPuff = 0, lastTime = -Infinity;
  const previous: (THREE.Vector3[] | undefined)[] = [];
  const lastEmission: number[] = [];
  const right = new THREE.Vector3(), corners = Array.from({ length: 4 }, () => new THREE.Vector3());
  const reset = () => {
    markCount = nextMark = nextPuff = 0; previous.length = lastEmission.length = 0;
    births.fill(-100); particleBirths.fill(-100); birth.needsUpdate = true;
    puffGeometry.attributes.particleBirth!.needsUpdate = true; geometry.setDrawRange(0, 0);
    lastTime = -Infinity;
  };
  return {
    reset,
    update(cars: readonly DrivingEffectCar[], time: number, wet: boolean, reduced: boolean) {
      if (!Number.isFinite(time)) return;
      if (time < lastTime || time - lastTime > 2) reset();
      clock.value = time;
      puffs.visible = !reduced;
      puffMaterial.uniforms.tint!.value.set(wet ? '#8e9aaa' : '#9b9ba7');
      if (time === lastTime) return;
      lastTime = time;
      let dirtyMarks = false, dirtyPuffs = false;
      cars.forEach((car, index) => {
        let emitted = false;
        const sliding = car.visible && car.speed > 12 && (Math.abs(car.slip) > 0.09 || car.braking && car.speed > 24);
        if (!sliding) { previous[index] = undefined; return; }
        const old = previous[index];
        right.set(Math.cos(car.heading), 0, -Math.sin(car.heading)).multiplyScalar(0.077);
        car.rearTyres.forEach((tyre, wheel) => {
          const previousTyre = old?.[wheel];
          if (!wet && previousTyre && tyre.distanceToSquared(previousTyre) > 0.01 && tyre.distanceToSquared(previousTyre) < 36) {
            corners[0]!.copy(previousTyre).sub(right); corners[1]!.copy(previousTyre).add(right);
            corners[2]!.copy(tyre).add(right); corners[3]!.copy(tyre).sub(right);
            let offset = nextMark * 6;
            for (const corner of [0, 2, 1, 0, 3, 2]) {
              const point = corners[corner]!; positions[offset * 3] = point.x; positions[offset * 3 + 1] = point.y + 0.006;
              positions[offset * 3 + 2] = point.z; births[offset++] = time;
            }
            nextMark = (nextMark + 1) % capacity; markCount = Math.min(capacity, markCount + 1); dirtyMarks = true;
          }
          if (!reduced && time - (lastEmission[index] ?? -Infinity) > 0.07) {
            origins.set([tyre.x, tyre.y + 0.11, tyre.z], nextPuff * 3);
            motion.set([-Math.sin(car.heading) * 0.4, 0.22, -Math.cos(car.heading) * 0.4, nextPuff * 2.39996], nextPuff * 4);
            particleBirths[nextPuff] = time; nextPuff = (nextPuff + 1) % count; dirtyPuffs = emitted = true;
          }
        });
        if (emitted) lastEmission[index] = time;
        previous[index] = car.rearTyres.map(p => p.clone());
      });
      if (dirtyMarks) { position.needsUpdate = birth.needsUpdate = true; geometry.setDrawRange(0, markCount * 6); }
      if (dirtyPuffs) for (const name of ['origin', 'motion', 'particleBirth']) puffGeometry.attributes[name]!.needsUpdate = true;
    },
    dispose() { scene.remove(marks, puffs); geometry.dispose(); material.dispose(); puffGeometry.dispose(); quad.dispose(); puffMaterial.dispose(); },
  };
}
