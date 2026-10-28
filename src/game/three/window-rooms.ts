import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Role = 'body' | 'cloth' | 'emitter';
type Swatch = 'wall' | 'wood' | 'darkWood' | 'cloth' | 'navy' | 'mint' | 'red' | 'brass' | 'ceramic' | 'paper' | 'screen' | 'dark';
const COLORS: Record<Swatch, { color: string; roughness: number; metalness?: number }> = {
  wall: { color: '#c8bea7', roughness: .92 }, wood: { color: '#a58a66', roughness: .76 },
  darkWood: { color: '#65513f', roughness: .8 }, cloth: { color: '#d2ccb8', roughness: .99 },
  navy: { color: '#596a72', roughness: .9 }, mint: { color: '#839380', roughness: .83 },
  red: { color: '#ac6856', roughness: .82 }, brass: { color: '#bea16c', roughness: .39, metalness: .6 },
  ceramic: { color: '#e0d8c3', roughness: .34 }, paper: { color: '#d8caae', roughness: .9 },
  screen: { color: '#566562', roughness: .3 }, dark: { color: '#343f42', roughness: .69 },
};
const SWATCHES = Object.keys(COLORS) as Swatch[], WIDTH = 256, ROW_HEIGHT = 16, HEIGHT = 256;
const sources = new Map<string, THREE.Group>();
const materialSets = new Map<boolean, Record<Role, THREE.MeshStandardMaterial>>();
let lookup: { color: THREE.DataTexture; surface: THREE.DataTexture } | undefined;
const p = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** A material/irradiance lookup, not an image of a room. Source vertices retain
 * ordinary UVs through the architectural bake; no added vertex attribute or
 * shader hook is needed. Every triangle uses a single material row, while U
 * smoothly interpolates its bounded source-local lamp/ambient illumination. */
function illuminationLookup() {
  if (lookup) return lookup;
  const color = new Uint8Array(WIDTH * HEIGHT * 4), surface = new Uint8Array(color.length);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const swatch = COLORS[SWATCHES[Math.min(SWATCHES.length - 1, Math.floor(y / ROW_HEIGHT))]!]!;
    const illumination = x / (WIDTH - 1), value = new THREE.Color(swatch.color).multiplyScalar(.22 + illumination * .95);
    // A restrained warm lamp spectrum preserves ivory, muted green, blue and
    // brass instead of turning every surface into the same orange emission.
    value.r *= 1 + illumination * .075; value.g *= 1 + illumination * .006; value.b *= 1 - illumination * .13;
    value.convertLinearToSRGB(); const i = (y * WIDTH + x) * 4;
    color[i] = Math.min(255, Math.round(value.r * 255)); color[i + 1] = Math.min(255, Math.round(value.g * 255));
    color[i + 2] = Math.min(255, Math.round(value.b * 255)); color[i + 3] = 255;
    surface[i] = 255; surface[i + 1] = Math.round(swatch.roughness * 255); surface[i + 2] = Math.round((swatch.metalness ?? 0) * 255); surface[i + 3] = 255;
  }
  const make = (data: Uint8Array, srgb: boolean) => {
    const texture = new THREE.DataTexture(data, WIDTH, HEIGHT); texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
    return texture;
  };
  lookup = { color: make(color, true), surface: make(surface, false) };
  lookup.color.name = 'Window room material colors and bounded local illumination';
  lookup.surface.name = 'Window room ceramic, textile, timber and brass response';
  return lookup;
}
function materials(lit: boolean): Record<Role, THREE.MeshStandardMaterial> {
  const cached = materialSets.get(lit); if (cached) return cached;
  const maps = illuminationLookup();
  const body = new THREE.MeshStandardMaterial({ map: maps.color, roughnessMap: maps.surface, metalnessMap: maps.surface,
    roughness: 1, metalness: 1, emissiveMap: maps.color, emissive: '#ffffff', emissiveIntensity: lit ? .42 : .055 });
  const cloth = new THREE.MeshPhysicalMaterial({ map: maps.color, side: THREE.DoubleSide, roughness: .98,
    emissiveMap: maps.color, emissive: '#ffffff', emissiveIntensity: lit ? .38 : .045,
    sheen: .22, sheenRoughness: .95, sheenColor: new THREE.Color('#d6d1bc') });
  const emitter = new THREE.MeshStandardMaterial({ color: lit ? '#fff0c9' : '#a9a594',
    emissive: lit ? '#ffdeb0' : '#000000', emissiveIntensity: lit ? 1.15 : 0, roughness: .53 });
  for (const [role, material] of Object.entries({ body, cloth, emitter })) {
    material.name = `Window room ${lit ? 'lamplit' : 'quiet'} ${role}`;
    material.userData.windowRoomMaterial = true;
    material.userData.sourceLocalIllumination = true;
  }
  const result = { body, cloth, emitter }; materialSets.set(lit, result); return result;
}

interface Part { geometry: THREE.BufferGeometry; role: Role; swatch: Swatch }
class Room {
  readonly parts: Part[] = []; readonly occluders: THREE.Box3[] = [];
  readonly floor: number; readonly scale: number;
  lamp = p();
  constructor(readonly width: number, readonly height: number, readonly lit: boolean) {
    this.floor = -height / 2 - .018; this.scale = Math.min(width / 1.4, height / 1.65, 1.2);
  }
  add(geometry: THREE.BufferGeometry, swatch: Swatch, x = 0, y = 0, z = 0, role: Role = 'body', rotation = new THREE.Euler()): void {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation)); geometry.translate(x, y, z);
    this.parts.push({ geometry, role, swatch });
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, swatch: Swatch, bevel = .006, occludes = true): void {
    const geometry = bevel ? new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, w / 4, h / 4, d / 4))
      : new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / .18)), Math.max(1, Math.ceil(h / .18)), Math.max(1, Math.ceil(d / .18)));
    this.add(geometry, swatch, x, y, z);
    if (occludes) this.occluders.push(new THREE.Box3(p(x - w / 2, y - h / 2, z - d / 2), p(x + w / 2, y + h / 2, z + d / 2)));
  }
  rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, swatch: Swatch): void {
    const direction = b.clone().sub(a), g = new THREE.CylinderGeometry(radius, radius, direction.length(), 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(p(0, 1, 0), direction.normalize()));
    const middle = a.clone().add(b).multiplyScalar(.5); this.add(g, swatch, middle.x, middle.y, middle.z);
  }
  book(x: number, bottom: number, z: number, w: number, h: number, d: number, color: Swatch): void {
    this.box(w, h, d, x, bottom + h / 2, z, color, .003);
    this.box(w * .84, h - .018, .007, x, bottom + h / 2, z + d / 2 + .003, 'paper', .001, false);
    this.box(w * .6, .013, .007, x, bottom + h * .71, z - d / 2 - .004, 'brass', .001, false);
  }
  finish(identity: string): THREE.Group {
    const palette = materials(this.lit), pieces: Record<Role, THREE.BufferGeometry[]> = { body: [], cloth: [], emitter: [] };
    const point = p(), normal = p(), towardLight = p(), start = p(), hit = p(), ray = new THREE.Ray();
    let illuminationMin = Infinity, illuminationMax = -Infinity, occludedVertices = 0;
    for (const part of this.parts) {
      const g = part.geometry, position = g.getAttribute('position'), normals = g.getAttribute('normal');
      const uv = new THREE.Float32BufferAttribute(new Float32Array(position.count * 2), 2);
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i); normal.fromBufferAttribute(normals, i).normalize();
        towardLight.copy(this.lamp).sub(point); const distance = towardLight.length(); towardLight.normalize();
        const incidence = Math.max(0, normal.dot(towardLight)); let visibility = 1;
        if (this.lit && incidence > .005 && part.role !== 'emitter') {
          start.copy(point).addScaledVector(normal, .0035); ray.set(start, towardLight);
          if (this.occluders.some(box => ray.intersectBox(box, hit) && hit.distanceTo(start) < distance - .035)) {
            visibility = .13; occludedVertices++;
          }
        }
        const ambient = .08 + Math.max(0, normal.y) * .045 + Math.max(0, -normal.z) * .035;
        // A broad incandescent shade transmits a little light upward; its main
        // output falls onto furniture. Bounded inverse-square falloff prevents
        // a near-lamp vertex from turning the complete window into a white tile.
        const shade = point.y > this.lamp.y + .03 ? .28 : 1;
        const direct = this.lit ? (incidence * .9 + .09) * visibility * shade / (.62 + distance * distance * 2.3) : 0;
        const grain = part.swatch === 'wood' || part.swatch === 'darkWood' ? Math.sin(point.x * 91 + Math.sin(point.y * 5) * .4) * .012 : 0;
        const illumination = THREE.MathUtils.clamp(ambient + direct + grain, .035, 1);
        illuminationMin = Math.min(illuminationMin, illumination); illuminationMax = Math.max(illuminationMax, illumination);
        uv.setXY(i, (.5 + illumination * (WIDTH - 1)) / WIDTH, (SWATCHES.indexOf(part.swatch) * ROW_HEIGHT + ROW_HEIGHT / 2) / HEIGHT);
      }
      g.setAttribute('uv', uv);
      const normalized = g.index ? g.toNonIndexed() : g; if (normalized !== g) g.dispose();
      pieces[part.role].push(normalized);
    }
    const group = new THREE.Group(); group.name = `Window room ${identity} ${this.lit ? 'lamplit' : 'quiet'}`;
    let triangles = 0;
    for (const role of ['body', 'cloth', 'emitter'] as const) {
      if (!pieces[role].length) continue;
      const geometry = mergeGeometries(pieces[role]); if (!geometry) throw new Error('Window room material merge failed.');
      pieces[role].forEach(g => g.dispose()); geometry.userData.surfaceUv = true;
      geometry.computeBoundingBox(); geometry.computeBoundingSphere(); triangles += geometry.getAttribute('position').count / 3;
      const mesh = new THREE.Mesh(geometry, palette[role]); mesh.name = `${group.name}: ${role}`;
      mesh.castShadow = role !== 'emitter'; mesh.receiveShadow = true; group.add(mesh);
    }
    group.userData.windowRoom = { identity, lit: this.lit, triangles, lamp: this.lamp.toArray(), illuminationMin, illuminationMax,
      occludedVertices, sharedResources: true, width: this.width, height: this.height };
    return group;
  }
}

function shell(room: Room): void {
  const { width: w, height: h, floor } = room;
  room.box(w, h, .035, 0, 0, 1.1075, 'wall', 0);
  for (const side of [-1, 1]) room.box(.027, h, 1.005, side * (w / 2 - .0135), 0, .6075, 'wall', 0);
  room.box(w - .04, .035, 1.01, 0, floor, .605, 'wood', 0);
  room.box(w - .04, .025, 1.005, 0, h / 2 - .0125, .6075, 'wall', 0);
  room.box(w - .045, .045, .025, 0, floor + .04, 1.073, 'darkWood', .002, false);
  for (const side of [-1, 1]) room.box(.026, .045, .91, side * (w / 2 - .035), floor + .04, .65, 'darkWood', .002, false);
}
function curtain(room: Room, rhythm: number): void {
  const { width: w, height: h } = room;
  room.rod(p(-w / 2 + .04, h / 2 - .055, .19), p(w / 2 - .04, h / 2 - .055, .19), .012, 'brass');
  for (const side of [-1, 1]) {
    const fullWidth = w * (side === (rhythm % 2 ? 1 : -1) ? .22 : .12), edge = side * (w / 2 - .04);
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    const columns = 14, rows = 20, bottom = -h / 2 + .055, length = h - .135;
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
      const t = r / rows, u = c / columns, gather = .68 + .32 * Math.abs(t - .44) / .56;
      const width = fullWidth * gather, x = edge - side * width * u;
      const z = .205 + .037 * Math.sin(u * Math.PI * 10) + .02 * Math.sin(t * Math.PI) * (u - .5);
      positions.push(x, bottom + t * length - .009 * Math.cos(u * Math.PI * 10) * (1 - t), z); uv.push(u, t);
      if (r < rows && c < columns) { const a = r * (columns + 1) + c, b = a + columns + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    const cloth = new THREE.BufferGeometry(); cloth.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    cloth.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cloth.setIndex(indices); cloth.computeVertexNormals();
    room.add(cloth, rhythm % 4 === 2 ? 'mint' : 'cloth', 0, 0, 0, 'cloth');
    for (let ring = 0; ring < 5; ring++) room.add(new THREE.TorusGeometry(.017, .003, 5, 10), 'brass',
      edge - side * fullWidth * ring / 4, h / 2 - .06, .19, 'body', new THREE.Euler(0, Math.PI / 2));
    room.rod(p(edge, bottom + length * .44, .202), p(edge - side * fullWidth * .7, bottom + length * .44, .204), .008, 'brass');
  }
}
function lamp(room: Room, x: number, base: number, z: number, height: number, pendant = false): void {
  const s = room.scale, bulb = base + height;
  room.lamp.set(x, bulb, z);
  if (pendant) room.rod(p(x, room.height / 2 - .045, z), p(x, bulb + .12 * s, z), .006 * s, 'dark');
  else {
    room.add(new THREE.CylinderGeometry(.072 * s, .092 * s, .025 * s, 18), 'brass', x, base + .013 * s, z);
    room.rod(p(x, base + .02 * s, z), p(x, bulb + .04 * s, z), .009 * s, 'brass');
  }
  const shade = new THREE.LatheGeometry([[.155, -.035], [.16, -.026], [.093, .147], [.083, .154], [.077, .144], [.147, -.027]].map(([r, y]) => new THREE.Vector2(r! * s, y! * s)), 24);
  room.add(shade, pendant ? 'mint' : 'cloth', x, bulb, z, 'cloth');
  room.add(new THREE.SphereGeometry(.042 * s, 14, 10), 'ceramic', x, bulb - .004 * s, z, 'emitter');
}
function table(room: Room, x: number, top: number, z: number, width: number, depth: number): void {
  const s = room.scale;
  room.box(width, .045 * s, depth, x, top - .0225 * s, z, 'wood');
  for (const side of [-1, 1]) for (const end of [-1, 1]) room.box(.045 * s, top - room.floor - .045 * s, .045 * s,
    x + side * (width / 2 - .055 * s), (top + room.floor - .045 * s) / 2, z + end * (depth / 2 - .045 * s), 'darkWood', .004);
}
function radio(room: Room, x: number, bottom: number, z: number): void {
  const s = room.scale;
  room.box(.35 * s, .19 * s, .17 * s, x, bottom + .095 * s, z, 'wood', .012);
  room.box(.325 * s, .16 * s, .014 * s, x, bottom + .095 * s, z - .09 * s, 'dark', .005, false);
  for (let i = 0; i < 8; i++) room.box(.15 * s, .006 * s, .009 * s, x - .067 * s, bottom + (.046 + i * .014) * s, z - .1 * s, 'brass', 0, false);
  room.box(.113 * s, .03 * s, .007 * s, x + .096 * s, bottom + .137 * s, z - .1 * s, 'screen', .003, false);
  room.box(.003 * s, .025 * s, .008 * s, x + .075 * s, bottom + .137 * s, z - .105 * s, 'paper', 0, false);
  for (const offset of [-.025, .028]) room.add(new THREE.CylinderGeometry(.016 * s, .016 * s, .017 * s, 12), 'brass',
    x + (.094 + offset) * s, bottom + .056 * s, z - .105 * s, 'body', new THREE.Euler(Math.PI / 2));
}
function mug(room: Room, x: number, y: number, z: number): void {
  const s = room.scale;
  room.add(new THREE.LatheGeometry([[.038, 0], [.049, .081], [.049, .092], [.041, .093], [.032, .008], [.038, 0]].map(([r, h]) => new THREE.Vector2(r! * s, h! * s)), 18), 'ceramic', x, y, z);
  room.add(new THREE.TorusGeometry(.03 * s, .007 * s, 5, 14, Math.PI * 1.4), 'ceramic', x + .053 * s, y + .052 * s, z, 'body', new THREE.Euler(0, 0, -.63));
}
function living(room: Room): void {
  const s = room.scale, floor = room.floor;
  room.box(.77 * s, .17 * s, .39 * s, .13 * s, floor + .25 * s, .83, 'navy', .035);
  room.box(.78 * s, .38 * s, .11 * s, .13 * s, floor + .47 * s, 1.015, 'navy', .03);
  for (const side of [-1, 1]) room.box(.085 * s, .29 * s, .39 * s, (.13 + side * .385) * s, floor + .32 * s, .83, 'darkWood', .016);
  room.box(.26 * s, .12 * s, .25 * s, .14 * s, floor + .39 * s, .82, 'red', .045, false);
  table(room, .045 * s, floor + .31 * s, .365, .48 * s, .25);
  room.book(.035 * s, floor + .311 * s, .355, .23 * s, .043 * s, .18, 'mint');
  lamp(room, -.42 * s, floor + .016 * s, .76, 1.015 * s);
}
function desk(room: Room): void {
  const s = room.scale, top = room.floor + .65 * s;
  table(room, .02 * s, top, .82, 1.05 * s, .39);
  radio(room, -.25 * s, top, .845);
  for (let i = 0; i < 5; i++) room.book((.12 + i * .041) * s, top, .935, .034 * s, (.2 + i % 3 * .026) * s, .16,
    (['paper', 'red', 'navy', 'mint', 'paper'] as Swatch[])[i]!);
  mug(room, .11 * s, top, .71);
  table(room, .02 * s, room.floor + .335 * s, .395, .3 * s, .23);
  room.box(.32 * s, .18 * s, .045, .02 * s, room.floor + .535 * s, .47, 'darkWood', .015);
  lamp(room, .405 * s, top, .73, .375 * s);
}
function kitchen(room: Room): void {
  const s = room.scale, floor = room.floor, top = floor + .61 * s;
  room.box(1.09 * s, .57 * s, .36, 0, floor + .3 * s, .895, 'mint', .01);
  room.box(1.13 * s, .045 * s, .4, 0, top, .88, 'ceramic', .01);
  for (const side of [-1, 1]) {
    room.box(.49 * s, .43 * s, .022, side * .275 * s, floor + .3 * s, .701, 'mint', .006, false);
    room.rod(p(side * .275 * s - .06 * s, floor + .455 * s, .68), p(side * .275 * s + .06 * s, floor + .455 * s, .68), .009, 'brass');
  }
  for (let row = 0; row < 2; row++) for (let column = 0; column < 5; column++) room.box(.19 * s, .17 * s, .012,
    (-.4 + column * .2) * s, top + (.16 + row * .18) * s, 1.083, 'ceramic', .002, false);
  room.box(1.02 * s, .045 * s, .22, 0, floor + 1.13 * s, .98, 'wood', .006);
  for (let i = 0; i < 4; i++) mug(room, (-.32 + i * .21) * s, floor + 1.154 * s, .96);
  room.add(new THREE.LatheGeometry([[0, 0], [.1, .01], [.115, .06], [.1, .14], [.055, .185], [0, .185]].map(([r, y]) => new THREE.Vector2(r! * s, y! * s)), 22), 'ceramic', -.2 * s, top + .023 * s, .835);
  room.add(new THREE.TorusGeometry(.116 * s, .009 * s, 5, 20, Math.PI), 'brass', -.2 * s, top + .17 * s, .835);
  room.rod(p(-.11 * s, top + .1 * s, .835), p(-.02 * s, top + .2 * s, .835), .025 * s, 'ceramic');
  room.box(.28 * s, .023, .2, .3 * s, top + .036 * s, .85, 'wood', .01, false);
  lamp(room, -.15 * s, floor, .56, 1.39 * s, true);
}
function storage(room: Room): void {
  const s = room.scale, floor = room.floor;
  for (const side of [-1, 1]) for (const z of [.76, 1.06]) room.rod(p(side * .5 * s, floor + .04, z), p(side * .5 * s, floor + 1.26 * s, z), .019, 'dark');
  for (const height of [.32, .72, 1.12]) room.box(1.04 * s, .037, .33, 0, floor + height * s, .915, 'wood', .004);
  for (let i = 0; i < 7; i++) room.book((-.4 + i * .12) * s, floor + .742 * s, .92, .09 * s,
    (.25 + i % 3 * .026) * s, .23, (['navy', 'paper', 'red', 'mint'] as Swatch[])[i % 4]!);
  for (const side of [-1, 1]) {
    room.box(.4 * s, .24 * s, .28, side * .245 * s, floor + .455 * s, .915, 'paper', .009);
    room.box(.4 * s, .025, .29, side * .245 * s, floor + .58 * s, .915, 'wood', .003, false);
    room.box(.12 * s, .038, .01, side * .245 * s, floor + .49 * s, .764, 'dark', .002, false);
  }
  room.add(new THREE.CylinderGeometry(.07 * s, .075 * s, .4 * s, 16), 'cloth', -.18 * s, floor + 1.212 * s, .93, 'body', new THREE.Euler(0, 0, Math.PI / 2));
  room.add(new THREE.CylinderGeometry(.06 * s, .062 * s, .35 * s, 16), 'mint', .23 * s, floor + 1.205 * s, .93, 'body', new THREE.Euler(0, 0, Math.PI / 2));
  lamp(room, .355 * s, floor, .44, 1.35 * s, true);
}

/** Genuine shallow upper-room interiors, facing -Z through the caller's
 * existing glazing. Returned roots contain meshes only. Geometry/materials
 * are shared: callers clone geometry before translating or merging it.
 * No scene lights, external textures, canvas backdrops or custom shaders. */
export function createWindowRoom(width: number, height: number, lit: boolean, rhythm: number): THREE.Group {
  if (![width, height, rhythm].every(Number.isFinite) || width < .7 || width > 4 || height < .85 || height > 3)
    throw new Error('Window rooms require finite metre-scale openings.');
  const variant = ((Math.floor(rhythm) % 4) + 4) % 4, key = `${width}:${height}:${lit}:${variant}`;
  let source = sources.get(key);
  if (!source) {
    const room = new Room(width, height, lit); shell(room);
    [living, desk, kitchen, storage][variant]!(room); curtain(room, variant);
    source = room.finish(['living', 'desk-radio', 'kitchen', 'storage'][variant]!);
    sources.set(key, source);
  }
  return source.clone(true);
}
