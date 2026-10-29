import * as THREE from 'three';
import { soraStripTexture } from '../sora-emblem';
import { hashInts, poseAt, seeded, type PeriodCityLayout, type PeriodDistrict, type PeriodLot } from './layout';
import { neonAtlasTexture, neonPrint, NEON_COUNTS, SORA_NOBORI } from './signs';

/**
 * The sky over the 1986 streets. SORA's airship (飛行船) shadows the race,
 * holding over the road ahead as a broadcast blimp would, its envelope
 * printed with the exact emblem centred between SORA and CARS and the print
 * lit at night. Ad balloons (アドバルーン) ride on their tethers over tall
 * roofs, trailing SORA's and the shops' banners. At night two searchlights
 * sweep the sky from the roofs of clubs. Presentation only: placed by course
 * position and the render clock.
 */
const PLACE = 460;
/**
 * The airship holds over the road this far ahead of the player (drifting nearer and farther), this high, and wanders this
 * far either side: in the narrow sky between the street's buildings, high in the frame.
 */
const LEAD = 340, ALTITUDE = 92, WANDER = 32;
const BALLOON_DISTRICTS: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'office', 'residential', 'harbour', 'onsen']);
const SEARCHLIGHT_DISTRICTS: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'harbour', 'onsen']);

/** The roof centre of a lot, low enough that a tether's foot stays inside the building (2.8 m a storey at least). */
function roof(lot: PeriodLot): THREE.Vector3 {
  return new THREE.Vector3(lot.x + Math.sin(lot.yaw) * lot.depth / 2, lot.base + lot.storeys * 2.8, lot.z + Math.cos(lot.yaw) * lot.depth / 2);
}
/** Tall frontage lots in the given districts, at least `spacing` metres of course apart, chosen by hash (chunk-independent). */
function anchors(layout: PeriodCityLayout, districts: ReadonlySet<PeriodDistrict>, storeys: number, spacing: number, salt: number, limit: number): PeriodLot[] {
  const { course } = layout, picked: PeriodLot[] = [];
  const apart = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return course.circuit ? Math.min(d, course.length - d) : d;
  };
  for (const lot of [...layout.lots].sort((a, b) => a.p - b.p)) {
    if (picked.length >= limit) break;
    if (lot.row > 2 || lot.storeys < storeys || !districts.has(lot.district) || (hashInts(lot.seed, salt) >>> 0) % 3 !== 0) continue;
    if (picked.every(other => apart(other.p, lot.p) > spacing)) picked.push(lot);
  }
  return picked;
}

/** The airship: a lathe envelope, cruciform tail, gondola with lit windows, the SORA print on both flanks and blinking lights. */
function airship(print: THREE.Texture, materials: THREE.Material[]): { group: THREE.Group; strobe: THREE.Mesh; prints: THREE.MeshStandardMaterial; windows: THREE.MeshBasicMaterial } {
  const group = new THREE.Group(); group.name = 'SORA airship';
  const radius = (x: number) => 7.4 * Math.sqrt(Math.max(0, 1 - ((x - 3) / (x > 3 ? 28 : 34)) ** 2));
  const profile = Array.from({ length: 33 }, (_, i) => { const x = -31 + 62 * i / 32; return new THREE.Vector2(radius(x), x); });
  const hull = new THREE.LatheGeometry(profile, 28); hull.rotateZ(-Math.PI / 2);
  const envelope = new THREE.MeshStandardMaterial({ color: '#eeece6', roughness: .55, metalness: .05, fog: false });
  const red = new THREE.MeshStandardMaterial({ color: '#c8312b', roughness: .6, side: THREE.DoubleSide, fog: false });
  const grey = new THREE.MeshStandardMaterial({ color: '#4a4c54', roughness: .5, metalness: .4, fog: false });
  const prints = new THREE.MeshStandardMaterial({ map: print, emissiveMap: print, emissive: '#ffffff', emissiveIntensity: 0, roughness: .6, fog: false });
  const windows = new THREE.MeshBasicMaterial({ color: '#ffd9a0', fog: false });
  materials.push(envelope, red, grey, prints, windows);
  group.add(new THREE.Mesh(hull, envelope));
  // The print on each flank: a patch of the envelope 34 m long, reading left to right from either side.
  for (const side of [1, -1]) {
    const positions: number[] = [], uvs: number[] = [], normals: number[] = [], index: number[] = [], columns = 24, rows = 6;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
      const x = -17 + 34 * i / columns, a = -.55 + 1.1 * j / rows, r = radius(x) * 1.004;
      positions.push(x, r * Math.sin(a), side * r * Math.cos(a)); normals.push(0, Math.sin(a), side * Math.cos(a));
      uvs.push(side > 0 ? i / columns : 1 - i / columns, j / rows);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      const a = j * (columns + 1) + i, b = a + 1, c = a + columns + 1, d = c + 1;
      index.push(...(side > 0 ? [a, b, d, a, d, c] : [a, d, b, a, c, d]));
    }
    const patch = new THREE.BufferGeometry();
    patch.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); patch.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    patch.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); patch.setIndex(index);
    group.add(new THREE.Mesh(patch, prints));
  }
  // Red tail fins in a cross.
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, out = (r: number) => [Math.sin(a) * r, Math.cos(a) * r] as const;
    const [y0, z0] = out(radius(-21)), [y1, z1] = out(radius(-29) + .2), [y2, z2] = out(radius(-29) + 5.6), [y3, z3] = out(radius(-23) + 4.4);
    const fin = new THREE.BufferGeometry();
    fin.setAttribute('position', new THREE.Float32BufferAttribute([-21, y0, z0, -29, y1, z1, -30, y2, z2, -25, y3, z3], 3));
    fin.setIndex([0, 1, 2, 0, 2, 3]); fin.computeVertexNormals();
    group.add(new THREE.Mesh(fin, red));
  }
  // The gondola slung under the envelope, its windows lit after dark.
  const gondola = new THREE.Mesh(new THREE.BoxGeometry(9, 2.4, 2.6), grey); gondola.position.set(1.5, -radius(1.5) - .7, 0); group.add(gondola);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(7, .7, 2.7), windows); glass.position.set(2, -radius(1.5) - .3, 0); group.add(glass);
  for (const z of [-1.9, 1.9]) { const engine = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 2.2, 10), grey); engine.rotation.z = Math.PI / 2; engine.position.set(-3.6, -radius(-3.6) - .4, z); group.add(engine); }
  const lamp = (colour: string, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.45, 8, 6), new THREE.MeshBasicMaterial({ color: colour, fog: false }));
    mesh.position.set(x, y, z); materials.push(mesh.material as THREE.Material); group.add(mesh); return mesh;
  };
  lamp('#ff3020', 4, -1, radius(4) + .3); lamp('#30ff60', 4, -1, -radius(4) - .3);
  const strobe = lamp('#ffffff', -30.5, radius(-29) + 5.8, 0);
  group.traverse(object => { object.frustumCulled = false; });
  return { group, strobe, prints, windows };
}

/** One searchlight beam: an open cone 240 m long, brightest at the lamp and fading into the sky. */
function beamGeometry(): THREE.BufferGeometry {
  const cone = new THREE.CylinderGeometry(8, .35, 240, 18, 1, true); cone.translate(0, 120, 0);
  return cone;
}

/** The airship, ad balloons and searchlights for a course. */
export class PeriodSky {
  readonly group = new THREE.Group();
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly ship: ReturnType<typeof airship> | null;
  private readonly balloons: { readonly anchor: THREE.Vector3; readonly height: number; readonly phase: number; readonly yaw: number }[];
  private readonly spheres: THREE.InstancedMesh;
  private readonly tethers: THREE.InstancedMesh;
  private readonly banners: THREE.InstancedMesh;
  private readonly lights: { readonly base: THREE.Vector3; readonly beams: THREE.Mesh[]; readonly phase: number }[] = [];
  private readonly beam: THREE.ShaderMaterial;
  private readonly time = { value: 0 };
  private lead = NaN;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly turn = new THREE.Euler();

  constructor(private readonly layout: PeriodCityLayout, emblemUrl: string | null) {
    this.group.name = 'SORA period sky (airship, ad balloons, searchlights)';
    const browser = typeof document !== 'undefined' && emblemUrl !== null;
    this.ship = browser ? airship(soraStripTexture(emblemUrl, 'SORA', 'CARS', 256), this.materials) : null;
    if (this.ship) this.group.add(this.ship.group);
    // Ad balloons over tall roofs: red or white, each trailing a banner, SORA's on half of them.
    const lots = anchors(layout, BALLOON_DISTRICTS, 5, 240, 31, 14);
    this.balloons = lots.map(lot => {
      const random = seeded(hashInts(lot.seed, 32));
      // High enough to clear the street's roofline from a few hundred metres down the road, as they flew over department stores.
      return { anchor: roof(lot), height: 38 + random() * 12, phase: random() * 100, yaw: lot.yaw };
    });
    const count = Math.max(1, this.balloons.length);
    // A little larger than life (real ones were about 2.5 m), so balloon and banner read from far down the road.
    const ball = new THREE.SphereGeometry(3, 16, 12), rope = new THREE.CylinderGeometry(.05, .05, 1, 4), cloth = new THREE.PlaneGeometry(1, 1, 1, 8);
    rope.translate(0, .5, 0); cloth.translate(0, -.5, 0);
    this.geometries.push(ball, rope, cloth);
    const skin = new THREE.MeshStandardMaterial({ roughness: .35, metalness: 0, emissive: '#ffffff', emissiveIntensity: 0 });
    // The glow follows each balloon's own colour.
    skin.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * emissive.r;');
    };
    skin.customProgramCacheKey = () => 'period-sky-balloons-v1';
    const line = new THREE.MeshBasicMaterial({ color: '#2a2a2e' });
    const atlas = browser ? neonAtlasTexture(emblemUrl).texture : new THREE.Texture();
    const banner = new THREE.MeshStandardMaterial({ map: atlas, side: THREE.DoubleSide, roughness: .9, emissive: '#ffffff', emissiveIntensity: 0 });
    banner.name = 'period-sky-balloon-banners';
    banner.onBeforeCompile = shader => {
      shader.uniforms.skyTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform float skyTime; attribute vec4 balloonPrint; varying vec4 vBalloonPrint;\nvoid main() {')
        .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        {
          // The cloth hangs from the rope and ripples more toward its free foot.
          float phase = instanceMatrix[3].x * .37 + instanceMatrix[3].z * .23;
          transformed.z += sin(skyTime * 2.1 + position.y * 2.6 + phase) * .22 * -position.y;
          vBalloonPrint = balloonPrint;
          vMapUv = vec2(mix(balloonPrint.x, balloonPrint.z, uv.x), mix(balloonPrint.y, balloonPrint.w, uv.y));
        }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'varying vec4 vBalloonPrint;\nvoid main() {')
        .replace('#include <map_fragment>', /* glsl */ `
        {
          // Printed through: the back reads the right way round too.
          vec2 printUv = vMapUv;
          if (!gl_FrontFacing) printUv.x = vBalloonPrint.x + vBalloonPrint.z - printUv.x;
          diffuseColor *= texture2D(map, printUv);
        }`)
        // A little floodlight on the cloth after dark (emissive carries the intensity).
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * emissive.r;');
    };
    banner.customProgramCacheKey = () => 'period-sky-balloon-banners-v1';
    this.materials.push(skin, line, banner);
    this.spheres = new THREE.InstancedMesh(ball, skin, count); this.spheres.name = 'Ad balloons';
    this.tethers = new THREE.InstancedMesh(rope, line, count); this.tethers.name = 'Ad balloon tethers';
    this.banners = new THREE.InstancedMesh(cloth, banner, count); this.banners.name = 'Ad balloon banners';
    const prints = new Float32Array(count * 4);
    this.balloons.forEach((balloon, i) => {
      const random = seeded(hashInts(Math.round(balloon.phase * 1000), 33));
      const sora = i % 2 === 0, print = neonPrint('nobori', sora ? SORA_NOBORI[i % SORA_NOBORI.length]! : 4 + Math.floor(random() * (NEON_COUNTS.nobori - 4)));
      prints.set(print, i * 4);
      this.spheres.setColorAt(i, new THREE.Color(sora || random() < .5 ? '#d8382f' : '#f2f0ea'));
    });
    this.banners.geometry.setAttribute('balloonPrint', new THREE.InstancedBufferAttribute(prints, 4));
    for (const mesh of [this.spheres, this.tethers, this.banners]) {
      mesh.count = this.balloons.length; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(mesh);
    }
    // Searchlights: two beams from a club's roof, sweeping in turn.
    this.beam = new THREE.ShaderMaterial({
      uniforms: { beamStrength: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: /* glsl */ `varying float vAlong; varying vec3 vBeamNormal; varying vec3 vBeamView;
        void main() {
          vec4 at = modelViewMatrix * vec4(position, 1.);
          vAlong = uv.y; vBeamNormal = normalMatrix * normal; vBeamView = -at.xyz;
          gl_Position = projectionMatrix * at;
        }`,
      // Brightest along the beam's axis, soft at its edges, fading up into the sky. Clamped: the tip's
      // interpolated v can stray past 1, and pow of a negative is NaN, which would spread through the exposure.
      fragmentShader: /* glsl */ `uniform float beamStrength; varying float vAlong; varying vec3 vBeamNormal; varying vec3 vBeamView;
        void main() {
          float facing = abs(dot(normalize(vBeamNormal), normalize(vBeamView)));
          gl_FragColor = vec4(vec3(1., .93, .78) * beamStrength * pow(clamp(1. - vAlong, 0., 1.), 1.6) * facing * facing, 1.);
        }`,
    });
    this.beam.name = 'period-sky-searchlights';
    this.materials.push(this.beam);
    const cone = beamGeometry(); this.geometries.push(cone);
    for (const lot of anchors(layout, SEARCHLIGHT_DISTRICTS, 3, 450, 41, 4)) {
      const beams = [0, 1].map(() => { const mesh = new THREE.Mesh(cone, this.beam); mesh.frustumCulled = false; mesh.visible = false; this.group.add(mesh); return mesh; });
      this.lights.push({ base: roof(lot).add(new THREE.Vector3(0, 1.5, 0)), beams, phase: seeded(hashInts(lot.seed, 42))() * 10 });
    }
  }

  /** The number of ad balloons and searchlights on this course (for tests). */
  get counts(): { balloons: number; searchlights: number } { return { balloons: this.balloons.length, searchlights: this.lights.length }; }

  /**
   * Fly everything for render time `time` (seconds) around `progress`; `camera` places the airship in its true direction,
   * `night` (0-1) lights its print and windows, the banners and the searchlights.
   */
  update(camera: THREE.Vector3, progress: number, time: number, night: number): void {
    this.time.value = time;
    const { course } = this.layout;
    // The airship keeps its station ahead of the leaders, easing after them and snapping only after a seek.
    const target = progress + LEAD + Math.sin(time * .15) * 80;
    if (!Number.isFinite(this.lead) || Math.abs(target - this.lead) > 400) this.lead = target;
    this.lead += (target - this.lead) * .03;
    if (this.ship) {
      const at = poseAt(course, this.lead), wander = Math.sin(time * .21 + 1) * WANDER;
      const x = at.x + Math.cos(at.heading) * wander, z = at.z - Math.sin(at.heading) * wander, y = at.y + ALTITUDE + Math.sin(time * .17) * 6;
      const dx = x - camera.x, dy = y - camera.y, dz = z - camera.z, distance = Math.hypot(dx, dy, dz), k = distance > PLACE ? PLACE / distance : 1;
      this.ship.group.position.set(camera.x + dx * k, camera.y + dy * k, camera.z + dz * k);
      this.ship.group.scale.setScalar(k);
      // Nose along the road at an angle that slowly swings, so its flank and print turn to the race; a slight bank.
      this.ship.group.rotation.set(-.05, at.heading - Math.PI / 2 + .55 + Math.sin(time * .09) * .35, 0, 'YXZ');
      this.ship.prints.emissiveIntensity = night * .85;
      this.ship.windows.color.copy(WINDOW_GLOW).multiplyScalar(.25 + night * .9);
      this.ship.strobe.visible = fractional(time * .8) < .12;
    }
    this.balloons.forEach((balloon, i) => {
      const sway = (k: number) => Math.sin(time * (.31 + k * .07) + balloon.phase * (k + 1));
      const top = this.position.set(balloon.anchor.x + sway(0) * 1.6, balloon.anchor.y + balloon.height + sway(1) * .5, balloon.anchor.z + sway(2) * 1.6);
      this.spheres.setMatrixAt(i, this.matrix.compose(top, this.rotation.identity(), this.scale.set(1, 1.08, 1)));
      // The tether from the roof to the balloon's foot.
      const foot = top.clone().setY(top.y - 3), rope = foot.clone().sub(balloon.anchor), length = rope.length();
      this.rotation.setFromUnitVectors(this.up, rope.normalize());
      this.tethers.setMatrixAt(i, this.matrix.compose(balloon.anchor, this.rotation, this.scale.set(1, length, 1)));
      // The banner hangs along the rope below the balloon, facing the street.
      const hang = foot.clone().lerp(balloon.anchor, 3 / length);
      this.rotation.setFromEuler(this.turn.set(0, balloon.yaw + Math.PI + sway(3) * .25, 0));
      this.banners.setMatrixAt(i, this.matrix.compose(hang, this.rotation, this.scale.set(2.4, 9.6, 1)));
    });
    for (const mesh of [this.spheres, this.tethers, this.banners]) mesh.instanceMatrix.needsUpdate = true;
    // Floodlit from their roofs after dark, balloon and banner both.
    (this.banners.material as THREE.MeshStandardMaterial).emissiveIntensity = night * .7;
    (this.spheres.material as THREE.MeshStandardMaterial).emissiveIntensity = night * .45;
    // Searchlights cross and recross the sky after dark.
    (this.beam.uniforms.beamStrength as { value: number }).value = Math.max(0, night - .15) * .3;
    for (const light of this.lights) light.beams.forEach((mesh, k) => {
      mesh.visible = night > .2;
      mesh.position.copy(light.base);
      mesh.rotation.set(.42 + .16 * Math.sin(time * .23 + light.phase + k * 2), time * .3 * (k ? -1 : 1) + light.phase + k * Math.PI, 0, 'YXZ');
    });
  }

  dispose(): void {
    this.group.traverse(object => { if (object instanceof THREE.Mesh && !this.geometries.includes(object.geometry)) object.geometry.dispose(); });
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.spheres.dispose(); this.tethers.dispose(); this.banners.dispose();
  }
}

const fractional = (value: number) => value - Math.floor(value);
const WINDOW_GLOW = new THREE.Color('#ffd9a0');
