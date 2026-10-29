import * as THREE from 'three';
import { FarLand, type FarLandPlan } from './far-land';
import { CityMeshBuilder } from './geometry';
import { hashInts, seeded } from './layout';

/**
 * Real 1986 towers seen over the city: Tokyo Tower with its decks and the
 * bulbs along its edges (the floodlighting came in 1989), the Kasumigaseki
 * Building, Akasaka's hotels, Hamamatsucho's World Trade Center, ARK Hills,
 * Sunshine 60 and Shinjuku's west-side towers. Positions are approximate
 * (WGS84, a few tens of metres). Each is drawn at most PLACE metres from the
 * camera in its true direction, scaled to its true angular size, so it never
 * meets the far plane or the fog.
 */
const PLACE = 520;
const METRES_PER_DEGREE_NORTH = 110574;
type Builder = CityMeshBuilder;
type Random = () => number;
interface Landmark { readonly lat: number; readonly lon: number; readonly build: (b: Builder, random: Random) => void }

/** A plain slab tower: two paints for form, lit floor runs, red aviation lights. */
function tower(w: number, d: number, h: number, paint: string, crown: 'flat' | 'step' | 'mast' = 'flat', lit = .45) {
  return (b: Builder, random: Random) => {
    const c = new THREE.Color(paint);
    b.colour.copy(c); b.front('wall', -w / 2, w / 2, 0, h, -d / 2, -1); b.front('wall', -w / 2, w / 2, 0, h, d / 2, 1);
    b.colour.copy(c).multiplyScalar(.78); b.side('wall', -w / 2, -d / 2, d / 2, 0, h, -1); b.side('wall', w / 2, -d / 2, d / 2, 0, h, 1);
    b.colour.copy(c).multiplyScalar(.6); b.flat('wall', -w / 2, w / 2, -d / 2, d / 2, h);
    if (crown === 'step') { b.colour.copy(c).multiplyScalar(.85); b.box('wall', -w * .3, w * .3, h, h + 9, -d * .3, d * .3); }
    if (crown === 'mast') { b.colour.set('#6a6a70'); b.box('wall', -1, 1, h, h + 28, -1, 1, 'b'); }
    // Lit runs of windows, floor by floor, on all four faces.
    const warm = new THREE.Color(1, .66, .34).multiplyScalar(2.4), cool = new THREE.Color(.62, .66, 1).multiplyScalar(2);
    for (let y = 9; y < h - 4; y += 3.8) for (let face = 0; face < 4; face++) {
      if (random() > lit) continue;
      const span = face < 2 ? w : d, length = span * (.12 + random() * .5), start = -span / 2 + random() * (span - length) + 1;
      b.colour.copy(random() < .7 ? cool : warm);
      // Floor-high bands: kilometres away a lit floor must still cover an art cell.
      if (face === 0) b.front('lamp', start, start + length - 2, y, y + 3.2, -d / 2 - .4, -1);
      else if (face === 1) b.front('lamp', start, start + length - 2, y, y + 3.2, d / 2 + .4, 1);
      else b.side('lamp', face === 2 ? -w / 2 - .4 : w / 2 + .4, start, start + length - 2, y, y + 3.2, face === 2 ? -1 : 1);
    }
    b.colour.setRGB(4, .3, .2);
    const top = crown === 'mast' ? h + 28 : crown === 'step' ? h + 9 : h;
    for (const [x, z] of [[-w / 2, -d / 2], [w / 2, d / 2]] as const) b.box('lamp', x - 2, x + 2, top, top + 3, z - 2, z + 2);
  };
}

/** Tokyo Tower (1958): an orange-and-white tapering lattice with two decks. */
function tokyoTower(b: Builder): void {
  const rings: readonly (readonly [number, number])[] = [[0, 44], [40, 32], [90, 21], [120, 15], [150, 12.5], [185, 9], [223, 6.5], [250, 4.4], [262, 2.2], [333, .8]];
  const orange = new THREE.Color('#d2532b'), white = new THREE.Color('#e9e4da'), bulbs = new THREE.Color(1, .74, .42).multiplyScalar(3);
  for (let i = 0; i < rings.length - 1; i++) {
    const [y0, h0] = rings[i]!, [y1, h1] = rings[i + 1]!, band = i % 2 ? white : orange;
    for (let face = 0; face < 4; face++) {
      const turn = (x: number, y: number, h: number): [number, number, number] => {
        const corners = [[x, -h], [h, x], [-x, h], [-h, -x]] as const, [px, pz] = corners[face]!;
        return [px, y, pz];
      };
      const normal: [number, number, number] = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]][face] as [number, number, number];
      b.colour.copy(band).multiplyScalar(face % 2 ? .78 : 1);
      b.face('wall', [turn(-h0, y0, h0), turn(h0, y0, h0), turn(h1, y1, h1), turn(-h1, y1, h1)], normal);
      // The edge bulbs outline the silhouette at night.
      if (y1 <= 262) {
        b.colour.copy(bulbs);
        const out = (p: [number, number, number]): [number, number, number] => [p[0] + normal[0] * .6, p[1], p[2] + normal[2] * .6];
        // Wide enough (6 m) to hold an art cell from three or four kilometres.
        b.face('lamp', [out(turn(-h0, y0, h0)), out(turn(-h0 + 6, y0, h0)), out(turn(-h1 + Math.min(6, h1), y1, h1)), out(turn(-h1, y1, h1))], normal);
        b.face('lamp', [out(turn(h0 - 6, y0, h0)), out(turn(h0, y0, h0)), out(turn(h1, y1, h1)), out(turn(h1 - Math.min(6, h1), y1, h1))], normal);
      }
    }
  }
  b.colour.set('#cfcac0'); b.box('wall', -18, 18, 120, 148, -18, 18);
  b.box('wall', -7.5, 7.5, 223, 250, -7.5, 7.5);
  b.colour.setRGB(2.6, 1.7, .9);
  for (const [y0, y1, h] of [[127, 141, 18.4], [233, 243, 7.9]] as const) {
    b.front('lamp', -h, h, y0, y1, -h, -1); b.front('lamp', -h, h, y0, y1, h, 1);
    b.side('lamp', -h, -h, h, y0, y1, -1); b.side('lamp', h, -h, h, y0, y1, 1);
  }
  b.colour.setRGB(4, .3, .2);
  for (const y of [150, 252, 330]) b.box('lamp', -2.5, 2.5, y, y + 4, -2.5, 2.5);
}

/** Akasaka Prince (1982): the white folded fan of guest rooms. */
function akasakaPrince(b: Builder, random: Random): void {
  for (let fold = -2; fold <= 2; fold++) {
    b.frame(fold * 13, 0, Math.abs(fold) * 6, fold * .32);
    tower(13, 18, 138, '#e7e4dc', fold === 0 ? 'step' : 'flat', .55)(b, random);
  }
  b.frame(0, 0, 0, 0);
}
/** Hotel New Otani (1964): a Y of wings under the round, blue-lit sky lounge. */
function newOtani(b: Builder, random: Random): void {
  for (const angle of [0, 2.09, 4.19]) { b.frame(Math.sin(angle) * 18, 0, Math.cos(angle) * 18, angle); tower(16, 36, 70, '#dcd6c8', 'flat', .5)(b, random); }
  b.frame(0, 0, 0, 0);
  b.colour.set('#bfc4c8'); b.cylinder('wall', 0, 70, 0, 14, 7, 18);
  b.colour.setRGB(.5, .9, 2.6); b.cylinder('lamp', 0, 72, 0, 14.3, 3, 18, false);
}

/** Nikolai Cathedral (1891; dome rebuilt 1929) at Surugadai: the green Byzantine dome and its bell tower. */
function nikolai(b: Builder): void {
  const stone = new THREE.Color('#d8cfbf'), copper = new THREE.Color('#5e9a82');
  b.colour.copy(stone); b.box('wall', -16, 16, 0, 12, -10, 10); b.box('wall', -7, 7, 0, 12, -22, 22);
  b.colour.copy(stone); b.cylinder('wall', 0, 12, 0, 8, 7, 16);
  for (let i = 0; i < 6; i++) {
    const t0 = i / 6, t1 = (i + 1) / 6, r0 = 9 * Math.cos(t0 * Math.PI / 2), r1 = 9 * Math.cos(t1 * Math.PI / 2);
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, c = (k + 1) / 16 * Math.PI * 2, m = (a + c) / 2;
      b.colour.copy(copper).multiplyScalar(.85 + .15 * Math.cos(m - 1));
      b.face('wall', [[Math.cos(a) * r0, 19 + Math.sin(t0 * Math.PI / 2) * 9, Math.sin(a) * r0], [Math.cos(c) * r0, 19 + Math.sin(t0 * Math.PI / 2) * 9, Math.sin(c) * r0],
        [Math.cos(c) * r1, 19 + Math.sin(t1 * Math.PI / 2) * 9, Math.sin(c) * r1], [Math.cos(a) * r1, 19 + Math.sin(t1 * Math.PI / 2) * 9, Math.sin(a) * r1]], [Math.cos(m), .5, Math.sin(m)]);
    }
  }
  b.colour.copy(stone); b.box('wall', -4, 4, 0, 30, 20, 28);
  b.colour.copy(copper); b.box('wall', -3, 3, 30, 36, 21, 27); b.box('wall', -.3, .3, 28, 40, -.3, .3);
}
/** A distant volcano: concave slopes and a snow cap with a ragged lower edge. */
export function mountain(height: number, radius: number, snowLine: number, body: string, snow: string) {
  return (b: Builder, random: Random) => {
    const rings = 18, segments = 44, rock = new THREE.Color(body), cap = new THREE.Color(snow), phase = random() * 10;
    const r = (t: number) => radius * (.03 + (1 - t) ** 1.9);
    for (let i = 0; i < rings; i++) for (let k = 0; k < segments; k++) {
      const t0 = i / rings, t1 = (i + 1) / rings, a0 = k / segments * Math.PI * 2, a1 = (k + 1) / segments * Math.PI * 2, m = (a0 + a1) / 2;
      const edge = snowLine + .05 * Math.sin(m * 7 + phase) + .03 * Math.sin(m * 17 + phase * 2);
      b.colour.copy((t0 + t1) / 2 > edge ? cap : rock).multiplyScalar(.82 + .18 * Math.cos(m - 1));
      const point = (t: number, a: number): [number, number, number] => [Math.cos(a) * r(t), t * height, Math.sin(a) * r(t)];
      b.face('wall', [point(t0, a0), point(t0, a1), point(t1, a1), point(t1, a0)], [Math.cos(m), .3, Math.sin(m)]);
    }
  };
}
/** Something far off at fixed render coordinates (Arcade courses have no real origin). */
export interface PeriodDistant {
  readonly x: number; readonly z: number; readonly build: (b: Builder, random: Random) => void;
  /** Ground elevation under it, in the route's metres (Tokyo's city stands near 10 m). */
  readonly y?: number;
  /** Hidden within this many metres, where the full landmark model stands instead. */
  readonly hideWithin?: number;
  /** The ground itself out to the horizon (far-land.ts), drawn instead of a far object. */
  readonly land?: FarLandPlan;
}
/** Mt. Fuji over the Hakone pass; Nantai-san behind Nikko. */
export const ARCADE_DISTANT: readonly (readonly PeriodDistant[])[] = [
  [{ x: 9000, z: 30000, build: mountain(3000, 14000, .58, '#4a5684', '#eceaf2') }],
  [],
  [{ x: -9000, z: 21000, build: mountain(1900, 7500, .8, '#3e5a62', '#e8e6ee') }],
];

function shinjuku(lat: number, lon: number, w: number, d: number, h: number, paint: string, crown: 'flat' | 'step' | 'mast'): Landmark {
  return { lat, lon, build: tower(w, d, h, paint, crown, .4) };
}
/** Approximate positions of the 1986 skyline. */
const LANDMARKS: readonly Landmark[] = [
  { lat: 35.65858, lon: 139.74543, build: tokyoTower },
  { lat: 35.67080, lon: 139.74960, build: tower(52, 32, 147, '#cdcbc4', 'mast', .5) },   // Kasumigaseki Building, 1968
  // Uchisaiwaichō, over Hibiya Park (heights approximate): Fukoku Seimei (1980, 29 floors), Hibiya Kokusai (1981)
  // and the Imperial Hotel's tower (1983).
  { lat: 35.67060, lon: 139.75510, build: tower(50, 40, 120, '#c8c6c0', 'flat', .45) },
  { lat: 35.66930, lon: 139.75510, build: tower(56, 40, 110, '#b7b2a6', 'flat', .45) },
  { lat: 35.67180, lon: 139.75920, build: tower(52, 30, 115, '#d8d2c4', 'step', .5) },
  { lat: 35.65550, lon: 139.75690, build: tower(48, 30, 163, '#5c5a5c', 'step', .45) },  // World Trade Center, Hamamatsucho
  { lat: 35.66690, lon: 139.74070, build: tower(46, 38, 153, '#bdb39e', 'step', .5) },   // ARK Mori Building, 1986
  { lat: 35.67960, lon: 139.73720, build: akasakaPrince },
  { lat: 35.68070, lon: 139.73390, build: newOtani },
  { lat: 35.72930, lon: 139.71930, build: tower(62, 42, 240, '#a9a8a6', 'mast', .45) },  // Sunshine 60, 1978
  shinjuku(35.68980, 139.69260, 56, 40, 178, '#e3e0d8', 'flat'),   // Keio Plaza
  shinjuku(35.69180, 139.69280, 58, 58, 210, '#c9c6be', 'step'),   // Sumitomo
  shinjuku(35.69230, 139.69430, 52, 40, 225, '#3e3e44', 'mast'),   // Mitsui
  shinjuku(35.69290, 139.69560, 50, 42, 210, '#b8ad98', 'step'),   // Nomura
  shinjuku(35.69300, 139.69660, 46, 40, 200, '#8e7f72', 'flat'),   // Yasuda Kasai
  shinjuku(35.69210, 139.69750, 54, 40, 223, '#cfcdc6', 'step'),   // Center Building
  shinjuku(35.68890, 139.69210, 38, 30, 165, '#d6d2c8', 'mast'),   // KDD
  shinjuku(35.68820, 139.69300, 52, 52, 134, '#c4c8cc', 'flat'),   // NS Building
  { lat: 35.69940, lon: 139.76530, build: nikolai },
  // Mt. Fuji, about 95 km west-southwest, over the city on clear evenings.
  { lat: 35.36060, lon: 138.72740, build: mountain(3776, 15000, .64, '#4a5684', '#eceaf2') },
];

/** Distant landmark silhouettes for a course whose origin is a real place. */
export class PeriodSkyline {
  readonly group = new THREE.Group();
  private readonly towers: { readonly mesh: THREE.Group; readonly x: number; readonly z: number; readonly y: number; readonly hideWithin: number }[] = [];
  private readonly land: FarLand | undefined;
  private readonly silhouette = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  private readonly lights = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  /** At night the far towers catch the city's glow: a violet skyline, as in the cutscenes' far shores. */
  private readonly night = new THREE.Color('#5a4a78');
  private readonly dawn = new THREE.Color('#b9a6b4');

  /** `origin`: the course's real (lat, lon), adding the 1986 skyline; render X is west, Z north. */
  constructor(origin: { readonly lat: number; readonly lon: number } | null, distant: readonly PeriodDistant[] = []) {
    this.group.name = 'SORA period skyline (1986 landmarks)';
    this.silhouette.name = 'period-skyline-silhouettes'; this.lights.name = 'period-skyline-lights';
    const east = origin ? 111320 * Math.cos(origin.lat * Math.PI / 180) : 0;
    const items: PeriodDistant[] = [...(origin ? LANDMARKS.map(landmark => ({ build: landmark.build,
      x: -(landmark.lon - origin.lon) * east, z: (landmark.lat - origin.lat) * METRES_PER_DEGREE_NORTH })) : []), ...distant];
    const land = distant.find(item => item.land)?.land;
    this.land = land ? new FarLand(land) : undefined;
    if (this.land) this.group.add(this.land.group);
    items.forEach((item, index) => {
      if (item.land) return;
      const b = new CityMeshBuilder(0, 0);
      b.frame(0, 0, 0, 0);
      item.build(b, seeded(hashInts(index, 1986)));
      const mesh = new THREE.Group();
      for (const [key, geometry] of b.finish()) {
        const part = new THREE.Mesh(geometry, key === 'lamp' ? this.lights : this.silhouette);
        part.frustumCulled = false; mesh.add(part);
      }
      this.group.add(mesh);
      this.towers.push({ mesh, x: item.x, z: item.z, y: item.y ?? 10, hideWithin: item.hideWithin ?? 0 });
    });
  }

  /** Re-place every tower around the camera; daylight 0 night .. 1 sunrise. */
  update(camera: THREE.Vector3, daylight: number): void {
    this.silhouette.color.lerpColors(this.night, this.dawn, THREE.MathUtils.smoothstep(daylight, .2, 1));
    this.lights.color.setScalar(THREE.MathUtils.lerp(1, .12, THREE.MathUtils.smoothstep(daylight, .45, 1)));
    this.land?.update(daylight);
    for (const tower of this.towers) {
      const dx = tower.x - camera.x, dz = tower.z - camera.z, distance = Math.hypot(dx, dz);
      const scale = distance > PLACE ? PLACE / distance : 1;
      // Graded at its own ground (Tokyo's city near 10 m above the datum).
      tower.mesh.position.set(camera.x + dx * scale, camera.y + (tower.y - camera.y) * scale, camera.z + dz * scale);
      tower.mesh.scale.setScalar(scale);
      tower.mesh.visible = distance >= tower.hideWithin;
    }
  }

  dispose(): void {
    this.group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.silhouette.dispose(); this.lights.dispose(); this.land?.dispose();
  }
}
