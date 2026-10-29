import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Studio models of the garage tech tree's parts, built from primitives so they
// load instantly and stay crisp through the pixel-art resolve in
// src/ui/part-viewer.ts. Each part is centred on the origin with its longest
// side PART_SIZE, faces +Z, and carries the exact SORA emblem once, centred on
// its main face.

export const PART_SIZE = 1.6;
/** Name of the one emblem decal in every model. */
export const EMBLEM = 'sora-emblem';
/** Textures the models print: the exact emblem roundel and a carbon weave. */
export interface PartTextures { readonly emblem: THREE.Texture; readonly carbon: THREE.Texture }
/** Per-frame motion inside a part (spinning wheels, a sweeping needle, flames), in seconds. */
export type PartAnimation = (seconds: number) => void;

const TAU = Math.PI * 2;
type Finish = 'alloy' | 'chrome' | 'iron' | 'steel' | 'black' | 'rubber' | 'red' | 'gold' | 'carbon' | 'cream' | 'bronze' | 'blue'
  | 'glass' | 'hot' | 'flame' | 'core' | 'lamp' | 'needle' | 'led' | 'white';
interface Kit { readonly m: Readonly<Record<Finish, THREE.Material>>; readonly emblem: THREE.Material }

const kits = new WeakMap<PartTextures, Kit>();
function kit(textures: PartTextures): Kit {
  let made = kits.get(textures);
  if (made) return made;
  // One material type, double-sided throughout, so all parts share three shader programs
  // (plain, carbon-mapped and the emblem decal). Glowing finishes are emissive on black.
  // The studio has no reflection map, so metals stay part-diffuse and catch the lights.
  const standard = (color: number, metalness: number, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide, ...extra });
  const glow = (emissive: number) => standard(0x000000, 0, 1, { emissive, emissiveIntensity: 1.6 });
  const m: Record<Finish, THREE.Material> = {
    alloy: standard(0xc3c7d0, 0.45, 0.32), chrome: standard(0xeef0f6, 0.55, 0.16), iron: standard(0x5a5d68, 0.35, 0.5),
    steel: standard(0x7d84a3, 0.5, 0.3), black: standard(0x25222c, 0.1, 0.55), rubber: standard(0x2b2831, 0, 0.85),
    red: standard(0xc8312b, 0.05, 0.38), gold: standard(0xdba844, 0.5, 0.28), cream: standard(0xf2e9d6, 0, 0.5),
    carbon: standard(0xd8dbe6, 0.15, 0.3, { map: textures.carbon }), bronze: standard(0xa86236, 0.45, 0.34),
    blue: standard(0x3768d4, 0.3, 0.32), glass: standard(0x151a2e, 0.1, 0.1), white: standard(0xf7f3ea, 0, 0.45),
    hot: standard(0x5a2216, 0.5, 0.5, { emissive: 0xff5a1c, emissiveIntensity: 1.4 }),
    lamp: standard(0xffe08a, 0, 0.3, { emissive: 0xffbf3a, emissiveIntensity: 1 }),
    flame: glow(0xff8a2a), core: glow(0xfff0b0), needle: glow(0xff3b2f), led: glow(0xff6a3d),
  };
  const emblem = standard(0xffffff, 0.05, 0.4, { map: textures.emblem, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -4 });
  made = { m, emblem };
  kits.set(textures, made);
  return made;
}

// ---- Primitive helpers: Y up, +Z towards the viewer ----------------------------------

const at = <T extends THREE.Object3D>(object: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): T => {
  object.position.set(x, y, z); object.rotation.set(rx, ry, rz); return object;
};
const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => new THREE.Mesh(geometry, material);
const group = (...children: THREE.Object3D[]) => { const g = new THREE.Group(); if (children.length) g.add(...children); return g; };
const animated = <T extends THREE.Object3D>(object: T, animate: PartAnimation): T => { object.userData.animate = animate; return object; };
/** A cylinder along Y; `top` is the radius at the +Y end. */
const cyl = (radius: number, height: number, material: THREE.Material, top = radius, segments = 28) =>
  mesh(new THREE.CylinderGeometry(top, radius, height, segments), material);
/** The same with its +Y end turned to face +Z (or +X), wrapped so `at` can place it. */
const cylZ = (radius: number, height: number, material: THREE.Material, top = radius, segments = 28) => group(at(cyl(radius, height, material, top, segments), 0, 0, 0, Math.PI / 2));
const cylX = (radius: number, height: number, material: THREE.Material, top = radius, segments = 28) => group(at(cyl(radius, height, material, top, segments), 0, 0, 0, 0, 0, -Math.PI / 2));
const box = (width: number, height: number, depth: number, material: THREE.Material, round = 0) =>
  mesh(round ? new RoundedBoxGeometry(width, height, depth, 2, round) : new THREE.BoxGeometry(width, height, depth), material);
/** A ring around Z. */
const ring = (radius: number, tube: number, material: THREE.Material, arc = TAU) => mesh(new THREE.TorusGeometry(radius, tube, 10, 40, arc), material);
const tube = (points: [number, number, number][], radius: number, material: THREE.Material, segments = 40) =>
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal'), segments, radius, 10), material);
/** Revolve a (radius, height) profile around Y. */
const lathe = (profile: [number, number][], material: THREE.Material, segments = 40) =>
  mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments), material);
/** The exact SORA emblem, a roundel facing +Z. */
const emblem = (k: Kit, radius: number) => { const decal = mesh(new THREE.CircleGeometry(radius, 40), k.emblem); decal.name = EMBLEM; return decal; };
/** A straight member from a to b, round or square in section. */
function strut(a: [number, number, number], b: [number, number, number], radius: number, material: THREE.Material, square = false): THREE.Mesh {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), length = from.distanceTo(to);
  const piece = square ? box(radius * 2, length, radius * 2, material) : cyl(radius, length, material, radius, 12);
  piece.position.copy(from).add(to).multiplyScalar(0.5);
  piece.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
  return piece;
}
/** A spur gear facing +Z, `depth` thick, centred on the origin. */
function gear(teeth: number, outer: number, root: number, hole: number, depth: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(), step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    for (const [j, [angle, radius]] of ([[0, root], [0.12, outer], [0.45, outer], [0.57, root]] as const).entries()) {
      const x = Math.cos((i + angle) * step) * radius, y = Math.sin((i + angle) * step) * radius;
      if (i || j) shape.lineTo(x, y); else shape.moveTo(x, y);
    }
  }
  shape.closePath();
  if (hole) shape.holes.push(new THREE.Path().absarc(0, 0, hole, 0, TAU, true));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  geometry.translate(0, 0, -depth / 2);
  return mesh(geometry, material);
}
class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly radius: number, private readonly height: number, private readonly turns: number) { super(); }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * this.turns * TAU;
    return target.set(Math.cos(angle) * this.radius, (t - 0.5) * this.height, Math.sin(angle) * this.radius);
  }
}
/** Move a subdivided box's vertices by `shift(x, z)` = [dy, dz], for crowned panels and curved beams. */
function bent(geometry: THREE.BufferGeometry, shift: (x: number, z: number) => [number, number]): THREE.BufferGeometry {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const [dy, dz] = shift(position.getX(i), position.getZ(i));
    position.setY(i, position.getY(i) + dy); position.setZ(i, position.getZ(i) + dz);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// ---- Shared assemblies ---------------------------------------------------------------

/** An inline six: iron block, alloy head, and the cover and intake that set each version apart. */
function inlineSix(k: Kit, cover: THREE.Material, intake: 'stacks' | 'plenum', leads = false): THREE.Group {
  const { m } = k, six = group(
    at(box(1.5, 0.5, 0.5, m.iron, 0.04), 0, -0.3), at(box(1.46, 0.16, 0.46, m.alloy, 0.02), 0, 0.03),
    at(box(1.4, 0.2, 0.4, cover, 0.08), 0, 0.2),
    at(box(1.22, 0.03, 0.03, m.alloy), 0, 0.305, 0.12), at(box(1.22, 0.03, 0.03, m.alloy), 0, 0.305, -0.12),
    at(emblem(k, 0.085), 0, 0.302, 0, -Math.PI / 2),
    at(cylX(0.2, 0.08, m.black), -0.8, -0.36), at(cylX(0.06, 0.12, m.chrome), -0.86, -0.36),
  );
  for (let i = 0; i < 6; i++) {
    const x = -0.6 + i * 0.24;
    if (intake === 'stacks') six.add(at(lathe([[0.055, 0], [0.055, 0.16], [0.075, 0.22], [0.11, 0.25], [0.12, 0.26]], m.chrome, 24), x, 0.05, 0.25, 1.2));
    else six.add(at(cylZ(0.05, 0.16, m.black), x, 0.03, 0.27));
    if (leads) six.add(tube([[x, 0.3, 0.06], [x + 0.05, 0.36, 0.03], [x + 0.12, 0.38, -0.12]], 0.014, m.red, 12));
  }
  for (const x of [-0.45, 0, 0.45]) six.add(tube([[x, 0, -0.24], [x, -0.12, -0.4], [x * 0.7, -0.48, -0.44]], 0.05, m.bronze, 16));
  if (intake === 'plenum') six.add(at(box(1.32, 0.3, 0.22, m.black, 0.08), 0, 0.08, 0.44), at(cylX(0.11, 0.18, m.alloy), 0.74, 0.08, 0.44));
  return six;
}
/** A turbocharger facing +Z: compressor cover and inlet in front, hot side behind. */
function turbo(k: Kit, hot = false, badge = true): THREE.Group {
  const { m } = k, wheel = group(at(cylZ(0.075, 0.18, m.chrome, 0.035), 0, 0, 0.29));
  for (let i = 0; i < 9; i++) wheel.add(at(group(at(box(0.012, 0.13, 0.15, m.chrome), 0, 0.1, 0.27, 0, 0.5)), 0, 0, 0, 0, 0, i / 9 * TAU));
  const housing = hot ? m.hot : m.iron, body = group(
    at(ring(0.31, 0.15, m.alloy, TAU * 0.86), 0, 0, 0.1, 0, 0, 0.6), at(cylZ(0.4, 0.06, m.alloy), 0, 0, -0.02),
    at(lathe([[0.17, 0], [0.2, 0.02], [0.2, 0.26], [0.23, 0.29], [0.18, 0.3], [0.17, 0.28]], m.alloy), 0, 0, 0.12, Math.PI / 2),
    at(cylX(0.1, 0.42, m.alloy), 0.36, 0.28, 0.1), at(cylX(0.115, 0.05, m.chrome), 0.58, 0.28, 0.1),
    at(cylZ(0.16, 0.2, m.iron), 0, 0, -0.16),
    at(ring(0.27, 0.15, housing, TAU * 0.86), 0, 0, -0.36, 0, 0, 2.4), at(cylZ(0.36, 0.05, housing), 0, 0, -0.27),
    at(cylZ(0.17, 0.14, m.iron), 0, 0, -0.52), at(cylZ(0.13, 0.02, m.black), 0, 0, -0.6),
    at(cyl(0.085, 0.14, m.gold), -0.3, 0.34, -0.1), strut([-0.3, 0.27, -0.1], [-0.18, 0.1, -0.3], 0.012, m.chrome),
    wheel, at(cylZ(0.072, 0.02, m.chrome), 0, 0, 0.39),
  );
  if (badge) body.add(at(emblem(k, 0.066), 0, 0, 0.401));
  return animated(body, seconds => { wheel.rotation.z = seconds * 9; });
}

// ---- The parts -------------------------------------------------------------------------

const BUILDERS: Readonly<Record<string, (k: Kit) => THREE.Group>> = {
  // A cone filter and a rolled chrome tip on a club bracket.
  'engine-intake': k => {
    const { m } = k, filter = group(cylZ(0.36, 0.62, m.red, 0.25, 36), at(cylZ(0.26, 0.05, m.chrome), 0, 0, 0.33),
      at(ring(0.365, 0.03, m.chrome), 0, 0, -0.3), at(cylZ(0.17, 0.32, m.chrome), 0, 0, -0.46));
    for (const z of [-0.18, -0.06, 0.06, 0.18]) filter.add(at(ring(0.36 - (z + 0.31) / 0.62 * 0.11 + 0.012, 0.016, m.black), 0, 0, z));
    const tip = group(at(lathe([[0.18, -0.45], [0.2, -0.4], [0.2, 0.3], [0.25, 0.36], [0.23, 0.41], [0.17, 0.38], [0.16, 0.3], [0.16, -0.45]], m.chrome), 0, 0, 0, Math.PI / 2),
      at(cylZ(0.155, 0.7, m.black), 0, 0, -0.06));
    return group(at(filter, -0.45), at(tip, 0.45), at(box(0.62, 0.12, 0.06, m.alloy, 0.02), 0, 0, -0.1),
      at(cylZ(0.1, 0.04, m.alloy), 0, 0, -0.06), at(emblem(k, 0.088), 0, 0, -0.038));
  },
  // A ported head with twin cams turning and two cam pulleys.
  'engine-cams': k => {
    const { m } = k, cams = [0.15, -0.15].map(z => {
      const shaft = group(cylX(0.045, 1.56, m.chrome, 0.045, 16));
      for (let i = 0; i < 6; i++) {
        const lobe = cylX(0.075, 0.075, m.steel, 0.075, 20); lobe.scale.set(1, 1, 1.4); lobe.position.z = 0.025;
        shaft.add(at(group(lobe), -0.6 + i * 0.24, 0, 0, i * TAU / 6));
      }
      return at(shaft, 0, 0.12, z);
    });
    const head = group(at(box(1.5, 0.32, 0.62, m.alloy, 0.03), 0, -0.12), ...cams,
      at(gear(24, 0.14, 0.125, 0.03, 0.05, m.gold), 0.82, 0.12, 0.15, 0, Math.PI / 2), at(gear(24, 0.14, 0.125, 0.03, 0.05, m.gold), 0.82, 0.12, -0.15, 0, Math.PI / 2),
      at(emblem(k, 0.1), 0, -0.07, 0.311));
    for (const x of [-0.66, -0.43, -0.2, 0.2, 0.43, 0.66]) head.add(at(cylZ(0.055, 0.04, m.black), x, -0.17, 0.3));
    return animated(head, seconds => { for (const cam of cams) cam.rotation.x = seconds * 3; });
  },
  'engine-highrev': k => inlineSix(k, k.m.red, 'stacks'),
  'engine-torque': k => inlineSix(k, k.m.bronze, 'plenum'),
  'engine-fulltune': k => inlineSix(k, k.m.gold, 'stacks', true),
  // An electronic boost controller: gauge, LED readout and two knobs.
  'turbo-controller': k => {
    const { m } = k, dial = group(at(box(0.016, 0.15, 0.012, m.needle), 0, 0.06, 0));
    const unit = group(box(1.1, 0.62, 0.3, m.black, 0.05), at(box(1.02, 0.54, 0.02, m.iron), 0, 0, 0.15),
      at(ring(0.2, 0.025, m.chrome), -0.28, 0, 0.17), at(cylZ(0.19, 0.02, m.glass), -0.28, 0, 0.165), at(dial, -0.28, 0, 0.18),
      at(cylZ(0.025, 0.02, m.chrome), -0.28, 0, 0.185), at(box(0.38, 0.16, 0.02, m.glass), 0.27, 0.07, 0.165),
      at(cylZ(0.05, 0.06, m.alloy), 0.17, -0.16, 0.19), at(cylZ(0.05, 0.06, m.alloy), 0.37, -0.16, 0.19),
      tube([[0.4, -0.2, -0.15], [0.5, -0.38, -0.2], [0.62, -0.46, -0.1]], 0.025, m.black, 16),
      at(emblem(k, 0.1), 0, 0.311, 0, -Math.PI / 2));
    for (let i = 0; i < 4; i++) unit.add(at(box(0.06, 0.1, 0.01, m.led), 0.15 + i * 0.08, 0.07, 0.177));
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.25 - i * 0.1875);
      unit.add(at(box(0.012, 0.035, 0.01, m.white), -0.28 + Math.cos(a) * 0.155, Math.sin(a) * 0.155, 0.177, 0, 0, a - Math.PI / 2));
    }
    return animated(unit, seconds => { dial.rotation.z = 1.1 - (Math.sin(seconds * 1.7) * 0.5 + 0.5) * 2.2; });
  },
  // A front-mount intercooler: finned core, end tanks and pipes.
  'turbo-intercooler': k => {
    const { m } = k, core = group(box(1.36, 0.6, 0.12, m.black));
    // Few, thick fins: thin ones alias into swirls on the art grid.
    for (let i = 0; i < 9; i++) core.add(at(box(1.34, 0.03, 0.13, m.alloy), 0, -0.26 + i * 0.065, 0));
    for (const side of [-1, 1]) {
      core.add(at(box(0.16, 0.64, 0.15, m.alloy, 0.03), side * 0.76), at(cylX(0.1, 0.16, m.alloy, 0.07), side * 0.9, 0.18, 0, 0, side < 0 ? Math.PI : 0),
        tube([[side * 0.96, 0.18, 0], [side * 1.06, 0.22, -0.06], [side * 1.1, 0.34, -0.24]], 0.065, m.chrome, 20));
    }
    return group(core, at(cylZ(0.13, 0.03, m.alloy), 0, 0, 0.075), at(emblem(k, 0.115), 0, 0, 0.091));
  },
  'turbo-big': k => turbo(k),
  // Two smaller turbos joined above by a crossover, a branded plate between them.
  'turbo-twin': k => {
    const { m } = k, left = turbo(k, false, false), right = turbo(k, false, false);
    left.scale.setScalar(0.62); right.scale.set(-0.62, 0.62, 0.62);
    const twin = group(at(left, -0.48, -0.1), at(right, 0.48, -0.1),
      tube([[-0.16, 0.08, 0.06], [-0.1, 0.3, 0.06], [0, 0.38, 0.06]], 0.06, m.chrome, 20), tube([[0.16, 0.08, 0.06], [0.1, 0.3, 0.06], [0, 0.38, 0.06]], 0.06, m.chrome, 20),
      at(cyl(0.09, 0.16, m.chrome), 0, 0.46, 0.06), at(cylZ(0.12, 0.05, m.alloy), 0, -0.1, 0.12), at(emblem(k, 0.1), 0, -0.1, 0.146));
    return animated(twin, seconds => { (left.userData.animate as PartAnimation)(seconds); (right.userData.animate as PartAnimation)(seconds + 0.3); });
  },
  // A turbo glowing hot, flame flickering from the exhaust.
  'turbo-antilag': k => {
    const { m } = k, part = turbo(k, true), spin = part.userData.animate as PartAnimation;
    const flame = group(at(cylZ(0.01, 0.42, m.flame, 0.11, 18), 0, 0, -0.21), at(cylZ(0.005, 0.26, m.core, 0.06, 14), 0, 0, -0.13));
    part.add(at(flame, 0, 0, -0.6));
    return animated(part, seconds => {
      spin(seconds);
      flame.scale.set(1, 1, 0.75 + 0.35 * Math.abs(Math.sin(seconds * 13) * Math.sin(seconds * 5.3)));
    });
  },
  // A grooved sport tyre on a gold mesh wheel.
  'chassis-tyres': k => {
    const { m } = k, tread: [number, number][] = [[0.48, -0.2], [0.62, -0.22], [0.71, -0.19], [0.75, -0.15], [0.75, -0.09], [0.73, -0.09], [0.73, -0.05], [0.75, -0.05],
      [0.75, 0.05], [0.73, 0.05], [0.73, 0.09], [0.75, 0.09], [0.75, 0.15], [0.71, 0.19], [0.62, 0.22], [0.48, 0.2]];
    const wheel = group(lathe(tread, m.rubber, 56), lathe([[0.47, -0.18], [0.5, -0.18], [0.5, 0.18], [0.47, 0.18]], m.alloy, 48),
      at(ring(0.49, 0.022, m.chrome), 0, 0.18, 0, Math.PI / 2), at(cyl(0.13, 0.12, m.gold), 0, 0.1), at(cyl(0.085, 0.04, m.chrome), 0, 0.17),
      at(emblem(k, 0.08), 0, 0.191, 0, -Math.PI / 2));
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * TAU;
      wheel.add(at(box(0.025, 0.36, 0.025, m.gold), Math.cos(a) * 0.3, 0.13, Math.sin(a) * 0.3, 0, -(a + (i % 2 ? 0.4 : -0.4)), Math.PI / 2));
    }
    return group(at(wheel, 0, 0, 0, Math.PI / 2));
  },
  // A red-spring coilover with a gold damper and an alloy top mount.
  'chassis-coilovers': k => {
    const { m } = k;
    return group(at(cyl(0.1, 1.0, m.gold), 0, -0.15), at(cyl(0.035, 0.4, m.chrome), 0, 0.42),
      at(mesh(new THREE.TubeGeometry(new Helix(0.2, 0.84, 6.5), 260, 0.035, 8), m.red), 0, 0.12),
      at(cyl(0.25, 0.04, m.alloy), 0, -0.32), at(cyl(0.22, 0.04, m.blue), 0, -0.37), at(cyl(0.25, 0.05, m.alloy), 0, 0.56),
      at(cyl(0.22, 0.08, m.alloy, 0.2), 0, 0.63), at(cyl(0.03, 0.12, m.chrome), 0.16, 0.72), at(cyl(0.03, 0.12, m.chrome), -0.16, 0.72),
      at(emblem(k, 0.11), 0, 0.671, 0, -Math.PI / 2),
      at(box(0.26, 0.18, 0.18, m.alloy, 0.03), 0, -0.73), at(cylZ(0.05, 0.2, m.black), 0, -0.75));
  },
  // A deep-dish touge wheel, the emblem on its horn button.
  'chassis-touge': k => {
    const { m } = k, wheel = group(at(ring(0.62, 0.065, m.rubber), 0, 0, 0.15), at(ring(0.62, 0.069, m.red, 0.28), 0, 0, 0.15, 0, 0, Math.PI / 2 - 0.14),
      at(cylZ(0.17, 0.08, m.black), 0, 0, -0.1), at(cylZ(0.14, 0.04, m.black), 0, 0, -0.05), at(emblem(k, 0.125), 0, 0, -0.028),
      at(cylZ(0.12, 0.22, m.alloy, 0.1), 0, 0, -0.26));
    for (const a of [0, Math.PI, Math.PI * 1.5]) wheel.add(strut([Math.cos(a) * 0.15, Math.sin(a) * 0.15, -0.09], [Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.15], 0.04, m.alloy, true));
    return wheel;
  },
  // A rally light bar: four lamps either side of a branded centre badge.
  'chassis-rally': k => {
    const { m } = k, bar = group(at(box(1.62, 0.07, 0.07, m.black), 0, -0.22, -0.05), at(box(0.05, 0.22, 0.05, m.black), 0, -0.11, -0.05),
      at(cylZ(0.09, 0.04, m.alloy), 0, 0, -0.02), at(emblem(k, 0.08), 0, 0, 0.001));
    for (const x of [-0.72, -0.27, 0.27, 0.72]) {
      bar.add(at(lathe([[0, -0.1], [0.12, -0.09], [0.17, 0], [0.17, 0.08]], m.black, 32), x, 0, 0, Math.PI / 2), at(cylZ(0.155, 0.02, m.lamp), x, 0, 0.08),
        at(ring(0.165, 0.02, m.chrome), x, 0, 0.09), at(cyl(0.025, 0.1, m.black), x, -0.17, -0.05));
    }
    return bar;
  },
  // A ring gear around a differential case, turning slowly.
  'chassis-lsd': k => {
    const { m } = k, spinning = group(gear(40, 0.62, 0.56, 0.3, 0.13, m.alloy), cylZ(0.3, 0.42, m.iron), at(emblem(k, 0.17), 0, 0, 0.211));
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; spinning.add(at(cylZ(0.03, 0.04, m.chrome), Math.cos(a) * 0.43, Math.sin(a) * 0.43, 0.08)); }
    return animated(group(spinning, at(cylZ(0.1, 0.3, m.chrome), 0, 0, -0.36)), seconds => { spinning.rotation.z = seconds * 0.8; });
  },
  // A six-point roll cage with an X brace; the emblem plate at the crossing.
  'body-cage': k => {
    const { m } = k, r = 0.035;
    const cage = group(
      tube([[-0.55, -0.5, -0.3], [-0.55, 0.32, -0.3], [-0.42, 0.5, -0.3], [0.42, 0.5, -0.3], [0.55, 0.32, -0.3], [0.55, -0.5, -0.3]], r, m.cream, 60),
      tube([[-0.55, -0.5, 0.55], [-0.52, 0.12, 0.42], [-0.46, 0.46, -0.28]], r, m.cream), tube([[0.55, -0.5, 0.55], [0.52, 0.12, 0.42], [0.46, 0.46, -0.28]], r, m.cream),
      strut([-0.52, 0.2, 0.39], [0.52, 0.2, 0.39], r, m.cream), strut([-0.55, -0.5, -0.3], [0.55, 0.47, -0.3], r, m.cream), strut([0.55, -0.5, -0.3], [-0.55, 0.47, -0.3], r, m.cream),
      strut([-0.5, 0.45, -0.3], [-0.5, -0.5, -0.85], r, m.cream), strut([0.5, 0.45, -0.3], [0.5, -0.5, -0.85], r, m.cream),
      at(box(0.86, 0.09, 0.09, m.red, 0.03), 0, 0.5, -0.3), at(cylZ(0.11, 0.04, m.red), 0, -0.015, -0.27), at(emblem(k, 0.1), 0, -0.015, -0.249));
    for (const [x, z] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.55], [0.55, 0.55], [-0.5, -0.85], [0.5, -0.85]] as const) cage.add(at(box(0.14, 0.02, 0.14, m.alloy), x, -0.51, z));
    return cage;
  },
  // A curved steel bumper beam on crash boxes, with a red tow hook.
  'body-bumpers': k => {
    const { m } = k, curve = (x: number): [number, number] => [0, -0.2 * (x / 0.8) ** 2];
    return group(mesh(bent(new THREE.BoxGeometry(1.6, 0.22, 0.12, 32, 1, 1), curve), m.iron),
      at(mesh(bent(new THREE.BoxGeometry(1.5, 0.04, 0.13, 32, 1, 1), curve), m.red), 0, 0.12),
      at(box(0.14, 0.17, 0.32, m.alloy, 0.02), -0.56, 0, -0.32), at(box(0.14, 0.17, 0.32, m.alloy, 0.02), 0.56, 0, -0.32),
      at(ring(0.07, 0.022, m.red), 0.36, -0.16, -0.02, 0, Math.PI / 2), at(cylZ(0.09, 0.03, m.alloy), 0, 0, 0.07), at(emblem(k, 0.08), 0, 0, 0.086));
  },
  // A vented carbon bonnet held by two pins.
  'body-light': k => {
    const { m } = k, slope = 0.08, surface = (x: number, z: number) => 0.12 * (1 - (x / 0.7) ** 2) - slope * z;
    const hood = group(mesh(bent(new THREE.BoxGeometry(1.4, 0.04, 1.0, 24, 1, 16), (x, z) => [surface(x, z), 0]), m.carbon));
    for (const x of [-0.32, 0.32]) {
      const tilt = -Math.sign(x) * 0.12;
      hood.add(at(box(0.26, 0.03, 0.3, m.black), x, surface(x, 0.12) + 0.012, 0.12, Math.atan(slope), 0, tilt));
      for (let i = 0; i < 4; i++) hood.add(at(box(0.24, 0.014, 0.022, m.carbon), x, surface(x, 0.12) + 0.032, 0.12 + (i - 1.5) * 0.06, Math.atan(slope), 0, tilt));
    }
    for (const x of [-0.56, 0.56]) hood.add(at(cyl(0.035, 0.05, m.chrome), x, surface(x, 0.42) + 0.03, 0.42));
    return group(hood, at(emblem(k, 0.1), 0, surface(0, 0) + 0.022, 0, -Math.PI / 2 + Math.atan(slope)));
  },
  // A riveted armour plate stencilled with the emblem.
  'body-armor': k => {
    const { m } = k, outline = new THREE.Shape(), w = 0.7, h = 0.47, c = 0.12;
    outline.moveTo(-w + c, -h); outline.lineTo(w - c, -h); outline.lineTo(w, -h + c); outline.lineTo(w, h - c);
    outline.lineTo(w - c, h); outline.lineTo(-w + c, h); outline.lineTo(-w, h - c); outline.lineTo(-w, -h + c); outline.closePath();
    const plate = new THREE.ExtrudeGeometry(outline, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 });
    plate.translate(0, 0, -0.04);
    const armor = group(mesh(plate, m.steel), at(box(1.2, 0.06, 0.04, m.iron), 0, 0.33, 0.07), at(box(1.2, 0.06, 0.04, m.iron), 0, -0.33, 0.07), at(emblem(k, 0.2), 0, 0, 0.066));
    for (let i = 0; i < 7; i++) for (const y of [-0.4, 0.4]) armor.add(at(cylZ(0.026, 0.03, m.chrome), -0.54 + i * 0.18, y, 0.07));
    for (const x of [-0.63, 0.63]) for (const y of [-0.18, 0, 0.18]) armor.add(at(cylZ(0.026, 0.03, m.chrome), x, y, 0.07));
    return armor;
  },
  // A GT wing: carbon airfoil, red end plates and gurney, alloy uprights.
  'body-windtunnel': k => {
    const { m } = k, foil = new THREE.Shape();
    foil.moveTo(-0.32, 0); foil.bezierCurveTo(-0.3, 0.07, 0.05, 0.1, 0.32, 0.03); foil.lineTo(0.32, 0.005); foil.bezierCurveTo(0.05, 0.02, -0.28, -0.04, -0.32, 0);
    const geometry = new THREE.ExtrudeGeometry(foil, { depth: 1.56, bevelEnabled: false, curveSegments: 12 });
    geometry.translate(0, 0, -0.78);
    const wing = group(at(mesh(geometry, m.carbon), 0, 0.1, 0, 0, Math.PI / 2), at(box(1.56, 0.035, 0.012, m.red), 0, 0.15, -0.33),
      at(emblem(k, 0.085), 0, 0.173, 0, -Math.PI / 2));
    for (const side of [-1, 1]) {
      wing.add(at(box(0.02, 0.38, 0.74, m.red, 0.008), side * 0.79, 0.08, -0.02), at(box(0.03, 0.46, 0.18, m.alloy), side * 0.38, -0.18, 0.02),
        at(box(0.16, 0.03, 0.26, m.alloy), side * 0.38, -0.42, 0.02));
    }
    return wing;
  },
};

export const PART_MODEL_IDS: readonly string[] = Object.keys(BUILDERS);
/** One part, centred and scaled to PART_SIZE; `userData.animate` drives its moving pieces. */
export function createPartModel(id: string, textures: PartTextures): THREE.Group {
  const build = BUILDERS[id];
  if (!build) throw new RangeError(`No model for garage part ${id}`);
  const content = build(kit(textures));
  content.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(content, true), size = bounds.getSize(new THREE.Vector3()), scale = PART_SIZE / Math.max(size.x, size.y, size.z);
  content.scale.multiplyScalar(scale);
  content.position.sub(bounds.getCenter(new THREE.Vector3()).multiplyScalar(scale));
  const model = group(content);
  model.name = id; model.userData.animate = content.userData.animate;
  model.updateMatrixWorld(true);
  return model;
}
