import * as THREE from 'three';

/** Presentation of crashes from the local driving model: sparks where metal
 * meets metal or rail, smoke from damaged engines, flames on wrecks, and the
 * panels that break off, tumbling down the road. Nothing here feeds back into
 * the simulation; replays regenerate the same events from the same controls.
 */
export interface CrashCarView {
  readonly visible: boolean;
  /** The car's world transform (its group). */
  readonly object: THREE.Object3D;
  /** World velocity (m/s), for smoke drift. */
  readonly velocity: THREE.Vector3;
  /** Damage points; 100 is a wreck. */
  readonly damage: number;
  readonly wreck: boolean;
}
interface Debris {
  object: THREE.Object3D; velocity: THREE.Vector3; spin: THREE.Vector3;
  born: number; resting: boolean; size: number;
  /** Road height where it came off; a panel slides only a few metres. */
  floor: number;
}

const SPARKS = 220, SMOKE = 160, FIRE = 48, MAX_DEBRIS = 48;
/** A detached panel lies on the road this long, then is cleared away. */
const DEBRIS_LIFE = 30;

function quadGeometry(count: number, attributes: Record<string, number>): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(1, 1);
  geometry.index = quad.index; geometry.setAttribute('position', quad.attributes.position!); geometry.setAttribute('uv', quad.attributes.uv!);
  for (const [name, size] of Object.entries(attributes)) {
    const array = new Float32Array(count * size);
    if (name === 'born') array.fill(-100);
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage));
  }
  geometry.instanceCount = count;
  return geometry;
}

export function createCrashEffects(scene: THREE.Scene) {
  const clock = { value: 0 };
  // Sparks: bright streaks thrown along the scrape, falling under gravity.
  const sparkGeometry = quadGeometry(SPARKS, { origin: 3, velocity: 3, born: 1 });
  const sparkMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { time: clock },
    vertexShader: /* glsl */ `
      attribute vec3 origin; attribute vec3 velocity; attribute float born;
      uniform float time; varying float age; varying vec2 vUv;
      void main() {
        age = time - born; vUv = uv;
        vec3 world = origin + velocity * age + vec3(0.0, -4.9 * age * age, 0.0);
        world.y = max(world.y, origin.y - 0.6);
        vec4 head = viewMatrix * vec4(world, 1.0);
        vec4 tail = viewMatrix * vec4(world - (velocity + vec3(0.0, -9.8 * age, 0.0)) * 0.06, 1.0);
        vec2 along = head.xy - tail.xy; float len = max(length(along), 1e-4); vec2 dir = along / len; vec2 side = vec2(-dir.y, dir.x);
        vec4 view = mix(tail, head, position.y + 0.5);
        view.xy += side * position.x * 0.11;
        gl_Position = projectionMatrix * view;
        if (age < 0.0 || age > 0.55) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float age; varying vec2 vUv;
      void main() {
        float fade = 1.0 - smoothstep(0.15, 0.55, age);
        vec3 hot = mix(vec3(1.0, 0.93, 0.62), vec3(1.0, 0.42, 0.12), smoothstep(0.0, 0.4, age));
        gl_FragColor = vec4(hot * 3.0 * fade, fade);
      }`,
  });
  const sparks = new THREE.Mesh(sparkGeometry, sparkMaterial); sparks.name = 'Crash sparks'; sparks.frustumCulled = false; sparks.renderOrder = 3;
  // Smoke: grey from a hurt engine, black from a wreck.
  const smokeGeometry = quadGeometry(SMOKE, { origin: 3, velocity: 3, born: 1, shade: 2 });
  const smokeMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: clock },
    vertexShader: /* glsl */ `
      attribute vec3 origin; attribute vec3 velocity; attribute float born; attribute vec2 shade;
      uniform float time; varying float age; varying vec2 vUv; varying vec2 vShade;
      void main() {
        age = time - born; vUv = uv; vShade = shade;
        vec3 world = origin + velocity * age + vec3(0.0, 0.9 * age, 0.0);
        vec4 view = viewMatrix * vec4(world, 1.0);
        view.xy += position.xy * (0.35 + age * (0.6 + shade.y * 0.5));
        gl_Position = projectionMatrix * view;
        if (age < 0.0 || age > 2.4) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float age; varying vec2 vUv; varying vec2 vShade;
      void main() {
        vec2 p = vUv * 2.0 - 1.0; float shape = max(0.0, 1.0 - dot(p, p));
        float opacity = shape * smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.8, 2.4, age)) * (0.25 + vShade.y * 0.4);
        if (opacity < 0.004) discard;
        gl_FragColor = vec4(vec3(vShade.x), opacity);
        #include <colorspace_fragment>
      }`,
  });
  const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial); smoke.name = 'Engine smoke'; smoke.frustumCulled = false; smoke.renderOrder = 2;
  // Flames licking out of a wreck's engine bay.
  const fireGeometry = quadGeometry(FIRE, { origin: 3, velocity: 3, born: 1 });
  const fireMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { time: clock },
    vertexShader: /* glsl */ `
      attribute vec3 origin; attribute vec3 velocity; attribute float born;
      uniform float time; varying float age; varying vec2 vUv;
      void main() {
        age = time - born; vUv = uv;
        vec3 world = origin + velocity * age + vec3(0.0, 1.6 * age, 0.0);
        vec4 view = viewMatrix * vec4(world, 1.0);
        view.xy += position.xy * vec2(0.32, 0.5) * (1.0 - age * 1.2);
        gl_Position = projectionMatrix * view;
        if (age < 0.0 || age > 0.6) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float age; varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0; float shape = max(0.0, 1.0 - dot(p * vec2(1.0, 0.7), p * vec2(1.0, 0.7)));
        float heat = 1.0 - smoothstep(0.0, 0.6, age);
        vec3 colour = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.85, 0.4), heat * shape);
        gl_FragColor = vec4(colour * 2.2 * shape * heat, shape * heat);
      }`,
  });
  const fire = new THREE.Mesh(fireGeometry, fireMaterial); fire.name = 'Wreck fire'; fire.frustumCulled = false; fire.renderOrder = 3;
  scene.add(sparks, smoke, fire);

  let nextSpark = 0, nextSmoke = 0, nextFire = 0, lastTime = -Infinity, seed = 1;
  /** Spawn counts since load, for tests and diagnosis. */
  const stats = { sparks: 0, smoke: 0, fire: 0, debris: 0 };
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const lastSmoke: number[] = [], lastFire: number[] = [];
  const debris: Debris[] = [];
  const engine = new THREE.Vector3(), scratch = new THREE.Vector3(), axis = new THREE.Vector3(), turn = new THREE.Quaternion();
  const write = (geometry: THREE.InstancedBufferGeometry, name: string, index: number, ...values: number[]) => {
    const attribute = geometry.attributes[name] as THREE.InstancedBufferAttribute;
    (attribute.array as Float32Array).set(values, index * attribute.itemSize); attribute.needsUpdate = true;
  };
  // Panel geometry and materials belong to the car template and its car; only the placement is ours.
  const removeDebris = (piece: Debris) => { scene.remove(piece.object); };

  return {
    stats,
    reset() {
      for (const piece of debris) removeDebris(piece);
      debris.length = 0; lastSmoke.length = lastFire.length = 0; lastTime = -Infinity;
      for (const geometry of [sparkGeometry, smokeGeometry, fireGeometry]) {
        const born = geometry.attributes.born as THREE.InstancedBufferAttribute; (born.array as Float32Array).fill(-100); born.needsUpdate = true;
      }
    },
    /** A shower of sparks at a contact point; strength is the delta-v (m/s). */
    sparks(at: THREE.Vector3, along: THREE.Vector3, strength: number, time: number, reduced: boolean) {
      if (reduced) return;
      const count = Math.min(26, 3 + Math.round(strength * 1.6));
      stats.sparks += count;
      for (let i = 0; i < count; i++) {
        const spread = 2 + strength * 0.35;
        write(sparkGeometry, 'origin', nextSpark, at.x, at.y, at.z);
        write(sparkGeometry, 'velocity', nextSpark, along.x * (0.4 + random() * 0.5) + (random() - 0.5) * spread,
          1 + random() * (2 + strength * 0.2), along.z * (0.4 + random() * 0.5) + (random() - 0.5) * spread);
        write(sparkGeometry, 'born', nextSpark, time - random() * 0.03);
        nextSpark = (nextSpark + 1) % SPARKS;
      }
    },
    /** A broken-off panel, already placed in world space, thrown with the given velocity and spin. */
    debris(object: THREE.Object3D, velocity: THREE.Vector3, spin: THREE.Vector3, time: number, size: number, floor: number) {
      object.matrixAutoUpdate = true;
      scene.add(object); stats.debris++;
      debris.push({ object, velocity: velocity.clone(), spin: spin.clone(), born: time, resting: false, size, floor });
      while (debris.length > MAX_DEBRIS) removeDebris(debris.shift()!);
    },
    update(cars: readonly CrashCarView[], time: number, reduced: boolean, near: THREE.Vector3) {
      if (!Number.isFinite(time)) return;
      if (time < lastTime || time - lastTime > 2) { lastSmoke.length = lastFire.length = 0; }
      const dt = Math.min(0.05, Math.max(0, time - lastTime));
      lastTime = time; clock.value = time;
      smoke.visible = fire.visible = sparks.visible = !reduced;
      cars.forEach((car, index) => {
        if (!car.visible || reduced) return;
        const hurt = Math.min(1, Math.max(0, (car.damage - 35) / 55));
        if (car.wreck || hurt > 0) {
          const interval = car.wreck ? 0.05 : 0.22 - hurt * 0.14;
          if (time - (lastSmoke[index] ?? -Infinity) > interval) {
            lastSmoke[index] = time;
            engine.set((random() - 0.5) * 0.5, 0.95, 1.25 + random() * 0.3).applyMatrix4(car.object.matrixWorld);
            write(smokeGeometry, 'origin', nextSmoke, engine.x, engine.y, engine.z);
            write(smokeGeometry, 'velocity', nextSmoke, car.velocity.x * 0.15 + (random() - 0.5) * 0.4, 0.2 + random() * 0.3, car.velocity.z * 0.15 + (random() - 0.5) * 0.4);
            write(smokeGeometry, 'born', nextSmoke, time);
            // Lit grey: black smoke would vanish against the night streets.
            write(smokeGeometry, 'shade', nextSmoke, car.wreck ? 0.2 : 0.5 - hurt * 0.22, car.wreck ? 1 : 0.4 + hurt * 0.6);
            nextSmoke = (nextSmoke + 1) % SMOKE; stats.smoke++;
          }
        }
        if (car.wreck && time - (lastFire[index] ?? -Infinity) > 0.045) {
          lastFire[index] = time;
          engine.set((random() - 0.5) * 0.6, 0.75, 1.3 + random() * 0.4).applyMatrix4(car.object.matrixWorld);
          write(fireGeometry, 'origin', nextFire, engine.x, engine.y, engine.z);
          write(fireGeometry, 'velocity', nextFire, (random() - 0.5) * 0.3, 0.3, (random() - 0.5) * 0.3);
          write(fireGeometry, 'born', nextFire, time);
          nextFire = (nextFire + 1) % FIRE; stats.fire++;
        }
      });
      // Panels: ballistic flight, a bounce and a slide on the road, then rest.
      for (let i = debris.length - 1; i >= 0; i--) {
        const piece = debris[i]!, object = piece.object;
        if (time - piece.born > DEBRIS_LIFE || object.position.distanceToSquared(near) > 500 * 500) { removeDebris(piece); debris.splice(i, 1); continue; }
        if (piece.resting || dt === 0) continue;
        piece.velocity.y -= 9.81 * dt;
        object.position.addScaledVector(piece.velocity, dt);
        const speed = piece.spin.length();
        if (speed > 1e-4) { turn.setFromAxisAngle(axis.copy(piece.spin).divideScalar(speed), speed * dt); object.quaternion.premultiply(turn); }
        const floor = piece.floor + Math.min(0.25, piece.size * 0.25);
        if (object.position.y < floor) {
          object.position.y = floor;
          if (piece.velocity.y < -1.5) {
            piece.velocity.y *= -0.32; piece.velocity.x *= 0.7; piece.velocity.z *= 0.7; piece.spin.multiplyScalar(0.6);
          } else {
            // Sliding: road friction, then the panel settles flat.
            piece.velocity.y = 0;
            const friction = Math.max(0, 1 - 6 * dt);
            piece.velocity.x *= friction; piece.velocity.z *= friction; piece.spin.multiplyScalar(friction);
            scratch.set(0, 1, 0).applyQuaternion(object.quaternion);
            turn.setFromUnitVectors(scratch, scratch.y >= 0 ? axis.set(0, 1, 0) : axis.set(0, -1, 0));
            object.quaternion.premultiply(new THREE.Quaternion().slerp(turn, Math.min(1, 4 * dt)));
            if (piece.velocity.lengthSq() < 0.04 && piece.spin.lengthSq() < 0.04) piece.resting = true;
          }
        }
      }
    },
    dispose() {
      this.reset(); scene.remove(sparks, smoke, fire);
      for (const geometry of [sparkGeometry, smokeGeometry, fireGeometry]) geometry.dispose();
      for (const material of [sparkMaterial, smokeMaterial, fireMaterial]) material.dispose();
    },
  };
}
export type CrashEffects = ReturnType<typeof createCrashEffects>;
