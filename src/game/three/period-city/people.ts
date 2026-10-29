import * as THREE from 'three';
import { hashInts, poseAt, seeded, type PeriodCityLayout, type PeriodDistrict, type PeriodSide } from './layout';
import { cityNight } from './materials';
import { streetCrossings } from './street';
import { SPRITE_CELL, SPRITE_COLUMNS, SPRITE_LAYOUT, SPRITE_PIXELS_PER_METRE, SPRITE_ROWS, spriteRow } from './street-sprites';

/**
 * People on the 1986 streets as pixel-art sprites (street-sprites.ts):
 * salarymen, office ladies, police officers (some signalling traffic at the
 * crossings), schoolgirls and sukeban, gakuran schoolboys, bosozoku gangs
 * lounging by their bikes, SORA's crew and fans (cheering with SORA's flag at
 * the start), shoppers, obaachan, yukata strollers in the onsen town, school
 * trips in Nikko, dock workers on the quay, cyclists on mamachari and stray
 * cats. Each sprite turns to the camera and shows its front, back or side
 * (mirrored for the other side) for the way it faces, walking, cheering and
 * pedalling on the render clock, with a soft shadow at its feet.
 * Presentation only: deterministic per course position and the clock.
 */
const CAPACITY = 420;
/** Spacing of the candidate spots along each side, and how far around the player they live. */
const STATION = 6, BEHIND = 40, AHEAD = 230;
/** One cyclist per this many metres of each pavement, riding either way. */
const RIDE = 55;
/** The pavement (infrastructure.ts): its top from 0.31 m to 1.6 m beyond the road edge, the guard rail at 0.6 m. */
const PAVEMENT = { top: .18, edge: 1.67, ground: -.08 } as const;
/** Fans gather this far either side of the start line. */
const START_CROWD = 130;
/** A sprite cell's height in the world. */
const CELL_HEIGHT = SPRITE_CELL.height / SPRITE_PIXELS_PER_METRE;

type Cast = readonly (readonly [string, number])[];
interface Crowd { readonly density: number; readonly cast: Cast; readonly cats: number; readonly gangs?: boolean }
/** Who walks each district, how thickly, and how many cats. Kanda's 1980s shopping streets are busiest. */
const CROWDS: Partial<Record<PeriodDistrict, Crowd>> = {
  kanda: { density: .92, cats: .05, gangs: true, cast: [['salaryman', 10], ['trench', 4], ['office-lady', 7], ['schoolgirl', 6], ['sukeban', 1],
    ['schoolboy', 5], ['youth', 4], ['denim', 4], ['housewife', 4], ['obaachan', 2], ['old-man', 2], ['crew', 1], ['fan', 2], ['drunk', 1], ['police', 1]] },
  residential: { density: .4, cats: .14, gangs: true, cast: [['housewife', 6], ['obaachan', 5], ['old-man', 4], ['schoolgirl', 3], ['schoolboy', 3],
    ['salaryman', 3], ['youth', 2], ['denim', 2], ['sukeban', 1], ['drunk', 1]] },
  office: { density: .45, cats: .01, cast: [['salaryman', 12], ['trench', 6], ['office-lady', 8], ['police', 1], ['old-man', 1]] },
  government: { density: .18, cats: 0, cast: [['salaryman', 8], ['trench', 4], ['office-lady', 3], ['police', 3]] },
  onsen: { density: .6, cats: .1, cast: [['yukata-woman', 6], ['yukata-man', 6], ['tourist', 4], ['obaachan', 2], ['old-man', 2], ['housewife', 1]] },
  nikko: { density: .5, cats: .08, cast: [['tourist', 6], ['schoolgirl', 4], ['schoolboy', 4], ['obaachan', 2], ['old-man', 2], ['yukata-woman', 1]] },
  harbour: { density: .16, cats: .08, gangs: true, cast: [['dock', 8], ['salaryman', 2], ['denim', 2], ['youth', 1]] },
  moat: { density: .16, cats: .02, cast: [['salaryman', 3], ['office-lady', 2], ['youth', 2], ['denim', 2], ['old-man', 2], ['tourist', 1]] },
  park: { density: .14, cats: .06, cast: [['old-man', 3], ['obaachan', 2], ['housewife', 2], ['youth', 2], ['schoolgirl', 1], ['denim', 1]] },
  shrine: { density: .2, cats: .12, cast: [['tourist', 3], ['obaachan', 3], ['old-man', 2], ['schoolgirl', 1], ['yukata-woman', 1]] },
};
const FANS: Cast = [['fan', 5], ['crew', 3], ['youth', 2], ['denim', 2], ['schoolgirl', 2], ['schoolboy', 1]];
/** Friends who walk together. */
const COMPANIONS: Readonly<Record<string, readonly string[]>> = {
  schoolgirl: ['schoolgirl', 'schoolgirl', 'sukeban'], schoolboy: ['schoolboy', 'schoolgirl'], youth: ['denim', 'youth'], denim: ['youth'],
  'yukata-woman': ['yukata-man', 'yukata-woman'], tourist: ['tourist', 'obaachan', 'old-man'], 'office-lady': ['office-lady', 'salaryman'],
  salaryman: ['salaryman', 'trench', 'office-lady'],
};
const CATS = ['calico', 'orange-tabby', 'black-cat'] as const;
const GANG = ['bosozoku', 'bosozoku-black'] as const;
const CYCLED: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'residential', 'office', 'onsen', 'nikko']);
/** Walker actions (the shader's spriteA.z): standing, walking, a drunk's sway; cats sit, walk or curl up. */
const ACT = { stand: 0, walk: 1, sway: 2, sit: 0, prowl: 1, curl: 2 } as const;

function pick(cast: Cast, random: () => number): string {
  let total = 0; for (const [, w] of cast) total += w;
  let roll = random() * total;
  for (const [name, w] of cast) { roll -= w; if (roll < 0) return name; }
  return cast[0]![0];
}

interface Figure {
  p: number; side: PeriodSide; e: number; row: number; action: number; scale: number;
  /** Where a walker is along its pacing (0-2), and where its animation is in its cycle (0-1). */ phase: number; step: number;
  /** Walkers: +1 or -1 along the road. Everyone else: yaw from the road's heading. */
  facing: number;
  /** Walkers pace `span` metres at `speed`. */ span: number; speed: number;
  /** Animation cycles per second. */ rate: number;
  /** Ground shadow: half-width and half-length in metres. */ shadow: readonly [number, number];
}
interface Rider { p: number; side: PeriodSide; e: number; dir: 1 | -1; speed: number; phase: number; row: number; scale: number }

const mod = (value: number, length: number) => ((value % length) + length) % length;
const riderCache = new WeakMap<PeriodCityLayout, readonly Rider[]>();
/** The course's cyclists, each riding its pavement on from where it started (deterministic per course). */
function ridersOf(layout: PeriodCityLayout): readonly Rider[] {
  const cached = riderCache.get(layout); if (cached) return cached;
  const { course } = layout, start = course.circuit ? 0 : course.poses[0]!.p, end = course.circuit ? course.length : course.poses.at(-1)!.p;
  const list: Rider[] = [];
  for (const side of [-1, 1] as PeriodSide[]) for (let i = 0; start + i * RIDE < end; i++) {
    const random = seeded(hashInts(i, side, 4242));
    if (random() < .25) continue;
    list.push({ p: start + (i + random() * .8) * RIDE, side, e: 1.05 + random() * .3, dir: random() < .5 ? 1 : -1, speed: 3.4 + random() * 1.8,
      phase: random(), row: spriteRow(random() < .55 ? 'rider-housewife' : 'rider-schoolboy'), scale: .95 + random() * .08 });
  }
  riderCache.set(layout, list);
  return list;
}
/** Bosozoku gather at least 150 m apart, chunk-independent like the street banners. */
const gangDraw = (k: number) => seeded(hashInts(k, 77))();
function gangStation(k: number): boolean {
  const own = gangDraw(k);
  if (own >= .03) return false;
  for (let j = k - 25; j <= k + 25; j++) if (j !== k && gangDraw(j) < Math.min(.03, own)) return false;
  return true;
}

/** A soft round shadow for the sprites' feet. */
function shadowTexture(): THREE.DataTexture {
  const size = 32, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
    data[(y * size + x) * 4 + 3] = Math.round(Math.max(0, 1 - r * r) ** 1.4 * 255);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true; texture.name = 'SORA crowd shadow';
  return texture;
}

/** The sprite crowd for a course; `update` re-places it around the player each frame. */
export class PeriodPeople {
  readonly mesh: THREE.InstancedMesh;
  readonly shadows: THREE.InstancedMesh;
  private readonly cellA: THREE.InstancedBufferAttribute;
  private readonly cellB: THREE.InstancedBufferAttribute;
  private readonly time = { value: 0 };
  private readonly cache = new Map<number, Figure[]>();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly axis = new THREE.Vector3(0, 1, 0);
  private readonly identity = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);

  /** `atlasUrl`: the street-people sprite atlas (public/assets/sprites/street-people.png). */
  constructor(atlasUrl?: string) {
    const atlas = atlasUrl && typeof document !== 'undefined' ? new THREE.TextureLoader().load(atlasUrl) : new THREE.Texture();
    atlas.colorSpace = THREE.SRGBColorSpace; atlas.magFilter = THREE.NearestFilter; atlas.minFilter = THREE.LinearMipmapLinearFilter;
    atlas.name = 'SORA street people';
    const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, .5, 0);
    this.cellA = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
    this.cellB = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
    for (const attribute of [this.cellA, this.cellB]) attribute.setUsage(THREE.DynamicDrawUsage);
    quad.setAttribute('spriteA', this.cellA); quad.setAttribute('spriteB', this.cellB);
    const material = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: .5, roughness: 1, metalness: 0 });
    material.name = 'period-city-street-sprites';
    const L = SPRITE_LAYOUT;
    material.onBeforeCompile = shader => {
      shader.uniforms.spriteTime = this.time; shader.uniforms.spriteNight = cityNight;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', /* glsl */ `uniform float spriteTime;
attribute vec4 spriteA; attribute vec4 spriteB;
// Toward the camera across the ground, from the sprite's foot.
vec2 spriteToCamera() {
  vec3 origin = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
  vec2 d = cameraPosition.xz - origin.xz;
  return length(d) > 1e-4 ? normalize(d) : vec2(0., 1.);
}
void main() {`)
        // Lit as if facing the camera and a little skyward, so the sun and the shop lights both reach it.
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n{ vec2 c = spriteToCamera(); objectNormal = normalize(vec3(c.x, .35, c.y)); }')
        .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        {
          vec2 toCam = spriteToCamera(), right = vec2(toCam.y, -toCam.x), facing = vec2(sin(spriteB.x), cos(spriteB.x));
          float front = dot(facing, toCam), across = dot(facing, right);
          float view = front > .707 ? 0. : front < -.707 ? 1. : 2.;
          float t = spriteTime * spriteB.y + spriteA.w, f4 = floor(fract(t) * 4.), f2 = floor(fract(t) * 2.);
          float sheet = spriteA.y, action = spriteA.z, column = 0., wide = 1., profile = view > 1.5 ? 1. : 0.;
          if (sheet < ${L.cheer - .5}) column = action > .5 ? (view < .5 ? 1. : view < 1.5 ? 6. : 11.) + f4 : view < .5 ? 0. : view < 1.5 ? 5. : 10.;
          else if (sheet < ${L.squat - .5}) { column = view < .5 ? f4 * 2. : (view < 1.5 ? 8. : 12.) + f2 * 2.; wide = 2.; }
          else if (sheet < ${L.signal - .5}) column = view < .5 ? 0. : view < 1.5 ? 2. : 1.;
          else if (sheet < ${L.cat - .5}) { column = (view < .5 ? 0. : view < 1.5 ? 4. : 8.) + f2 * 2.; wide = 2.; }
          else if (sheet < ${L.rider - .5}) {
            if (action > 1.5) { column = 7.; profile = 1.; }
            else column = action > .5 ? (view < .5 ? 5. : view < 1.5 ? 6. : 3. + f2) : view < .5 ? 0. : view < 1.5 ? 1. : 2.;
          }
          else if (sheet < ${L.bike - .5}) { if (view > 1.5) { column = f4 * 2.; wide = 2.; } else column = (view < .5 ? 8. : 10.) + f2; }
          else { if (view > 1.5) { column = 0.; wide = 2.; } else column = view < .5 ? 2. : 3.; }
          // Sprites face right in profile: mirror them for those facing the viewer's left.
          float u = profile > .5 && across < 0. ? 1. - uv.x : uv.x;
          float height = spriteB.z, width = height * wide * ${(SPRITE_CELL.width / SPRITE_CELL.height).toFixed(4)};
          vec3 side = vec3(right.x, 0., right.y);
          transformed = side * position.x * width + vec3(0., position.y * height, 0.);
          if (sheet < .5 && action > 1.5) transformed += side * sin(spriteTime * 1.9 + spriteA.w * 6.283) * .08 * position.y * height;
          vMapUv = vec2((column + u * wide) / ${SPRITE_COLUMNS}., 1. - (spriteA.x + 1. - uv.y) / ${SPRITE_ROWS.length}.);
        }`);
      // At night the shop fronts and signs light the crowd a little.
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float spriteNight;\nvoid main() {')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * spriteNight * .1;');
    };
    material.customProgramCacheKey = () => 'period-city-street-sprites-v1';
    this.mesh = new THREE.InstancedMesh(quad, material, CAPACITY);
    this.mesh.name = 'SORA street people (1986 sprites)';
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const ground = new THREE.PlaneGeometry(2, 2); ground.rotateX(-Math.PI / 2);
    const shade = new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x000000, transparent: true, opacity: .38, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    shade.name = 'period-city-street-sprite-shadows';
    this.shadows = new THREE.InstancedMesh(ground, shade, CAPACITY);
    this.shadows.name = 'SORA street people shadows';
    this.shadows.count = 0; this.shadows.frustumCulled = false;
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  clear(): void { this.cache.clear(); this.mesh.count = this.shadows.count = 0; }

  /** Progress distance on the course (wrapping on circuits). */
  private static apart(layout: PeriodCityLayout, a: number, b: number): number {
    const { course } = layout;
    if (!course.circuit) return Math.abs(a - b);
    const d = mod(a - b, course.length);
    return Math.min(d, course.length - d);
  }

  /** The figures of the 6 m station `k` (both sides), deterministic per course. */
  private station(layout: PeriodCityLayout, k: number): Figure[] {
    const cached = this.cache.get(k); if (cached) return cached;
    const list: Figure[] = [];
    const crossing = streetCrossings(layout).find(c => c >= k * STATION - 3 && c < (k + 1) * STATION - 3);
    const start = layout.course.circuit ? 0 : layout.course.poses[0]!.p;
    const fans = PeriodPeople.apart(layout, k * STATION + STATION / 2, start) < START_CROWD;
    const person: readonly [number, number] = [.3, .2];
    for (const side of [-1, 1] as PeriodSide[]) {
      const p = k * STATION, district = layout.districtAt(p, side), crowd = CROWDS[district];
      if (!crowd) continue;
      const random = seeded(hashInts(k, side, 1986));
      /** Facing the road (yaw from the heading) with a little turn of its own. */
      const roadward = (turn: number) => -side * Math.PI / 2 + (random() - .5) * turn;
      const stander = (row: string, at: number, e: number, facing: number, extra: Partial<Figure> = {}): Figure => ({ p: at, side, e,
        row: spriteRow(row), action: ACT.stand, phase: 0, step: random(), scale: .94 + random() * .1, facing, span: 0, speed: 0, rate: 0, shadow: person, ...extra });
      if (crossing !== undefined) {
        // A knot of people waiting at the zebra crossing; a fan cheers the race; at some a police officer signals.
        for (let i = 0, n = 3 + Math.floor(random() * 4); i < n; i++) {
          const cheer = random() < .18;
          list.push(stander(cheer ? 'fan-cheer' : pick(crowd.cast, random), crossing - .4 + random() * 4.8, 1 + random() * .55, roadward(.5),
            cheer ? { rate: 1.6 } : {}));
        }
        if ((hashInts(Math.round(crossing), 9) >>> 0) % 3 === 0 && side === ((hashInts(Math.round(crossing), 10) >>> 0) % 2 ? 1 : -1))
          list.push(stander('police-signal', crossing - 2.2, 1, roadward(.2), { rate: .45 }));
        continue;
      }
      if (fans) {
        // Fans two deep along the kerb either side of the start, most of them waving SORA's flag.
        for (let i = 0, n = 2 + Math.floor(random() * 2); i < n; i++) {
          const look = pick(FANS, random), cheer = look === 'fan' || random() < .3;
          list.push(stander(cheer ? 'fan-cheer' : look, p + random() * STATION, 1 + random() * .6, roadward(.6), cheer ? { rate: 1.4 + random() * .5 } : {}));
        }
        continue;
      }
      if (crowd.gangs && side === (k % 2 ? 1 : -1) && gangStation(k)) {
        // A bosozoku gang by their parked bikes: some squat, the rest stand about.
        const bikes = 1 + Math.floor(random() * 2);
        for (let i = 0; i < bikes; i++) list.push(stander(random() < .5 ? 'bike-purple' : 'bike-black', p + i * 2.6, 1.15, random() < .5 ? 0 : Math.PI,
          { scale: 1, shadow: [.45, 1.05] }));
        for (let i = 0, n = 2 + Math.floor(random() * 3); i < n; i++) {
          const coat = GANG[Math.floor(random() * GANG.length)]!, squat = random() < .45;
          list.push(stander(squat ? `${coat}-squat` : coat, p - 1 + random() * (bikes * 2.6 + 1), 1.9 + random() * .8, random() * Math.PI * 2));
        }
        continue;
      }
      if (random() < crowd.cats) {
        // A stray cat by the shop fronts: sitting, curled up or prowling.
        const roll = random(), prowl = roll > .72;
        list.push(stander(CATS[Math.floor(random() * CATS.length)]!, p + random() * STATION, random() < .6 ? 2 + random() * .8 : 1.1 + random() * .4,
          prowl ? random() < .5 ? 1 : -1 : random() * Math.PI * 2, prowl ? { action: ACT.prowl, span: 3 + random() * 3, speed: .45, rate: 1.1, shadow: [.2, .14] }
            : { action: roll < .42 ? ACT.sit : ACT.curl, shadow: [.18, .14] }));
      }
      const count = random() < crowd.density ? 1 + (random() < crowd.density * .55 ? 1 : 0) + (random() < crowd.density * .25 ? 1 : 0) : 0;
      if (count > 1 && random() < .3) {
        // Friends stopped to talk before the shops, turned toward each other.
        const at = p + random() * (STATION - 1.5), e = 2 + random() * .5;
        for (let i = 0; i < count; i++) list.push(stander(pick(crowd.cast, random), at + (i % 2) * .8, e + (i > 1 ? .55 : 0),
          i > 1 ? side * Math.PI / 2 + Math.PI : (i % 2 ? -Math.PI / 2 : Math.PI / 2) + (random() - .5) * .4));
        continue;
      }
      for (let i = 0; i < count; i++) {
        const look = pick(crowd.cast, random), walking = random() < .72;
        if (!walking) {
          // Some stand by the guard rail, others before the shops.
          const kerb = random() < .5;
          list.push(stander(look, p + random() * STATION, kerb ? 1 + random() * .5 : 2 + random() * .7, kerb ? roadward(1) : side * Math.PI / 2 + (random() - .5)));
          continue;
        }
        const drunk = look === 'drunk', speed = drunk ? .6 + random() * .25 : 1.1 + random() * .5, facing = random() < .5 ? 1 : -1;
        const walker: Figure = { p: p + random() * STATION, side, e: 1 + random() * .5, row: spriteRow(look), action: drunk ? ACT.sway : ACT.walk,
          phase: random() * 2, step: random(), scale: .94 + random() * .1, facing, span: 8 + random() * 16, speed, rate: speed / (drunk ? 1.2 : 1.5), shadow: person };
        list.push(walker);
        const friends = COMPANIONS[look];
        if (friends && random() < .4) {
          // A friend alongside, keeping pace, on the other foot.
          list.push({ ...walker, row: spriteRow(friends[Math.floor(random() * friends.length)]!), e: walker.e < 1.25 ? walker.e + .45 : Math.max(1, walker.e - .45),
            p: walker.p + (random() - .5) * .6, step: walker.step + .5, scale: .94 + random() * .1 });
        }
      }
    }
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(k, list);
    return list;
  }

  /** Write sprite `n`: its foot at lateral `e` off the course pose `at`, its frame data and its shadow. */
  private put(n: number, at: { x: number; y: number; z: number; heading: number; width: number }, side: PeriodSide, e: number, yaw: number,
    row: number, action: number, phase: number, rate: number, scale: number, shadow: readonly [number, number]): void {
    const lateral = side * (at.width + e);
    this.position.set(at.x + Math.cos(at.heading) * lateral, at.y + (e > PAVEMENT.edge ? PAVEMENT.ground : PAVEMENT.top), at.z - Math.sin(at.heading) * lateral);
    this.mesh.setMatrixAt(n, this.matrix.compose(this.position, this.identity, this.one));
    this.cellA.setXYZW(n, row, SPRITE_LAYOUT[SPRITE_ROWS[row]!.layout], action, phase);
    this.cellB.setXYZW(n, yaw, rate, CELL_HEIGHT * scale, 0);
    this.position.y += .015; this.rotation.setFromAxisAngle(this.axis, yaw); this.scale.set(shadow[0] * scale, 1, shadow[1] * scale);
    this.shadows.setMatrixAt(n, this.matrix.compose(this.position, this.rotation, this.scale));
  }

  /** Place everyone near `progress` at render time `time` (seconds). */
  update(layout: PeriodCityLayout | null, progress: number, time: number): void {
    this.time.value = time;
    if (!layout) { this.mesh.count = this.shadows.count = 0; return; }
    const { course } = layout, stations = Math.ceil(course.length / STATION);
    let n = 0;
    for (let k = Math.floor((progress - BEHIND) / STATION); k * STATION < progress + AHEAD && n < CAPACITY; k++) {
      const station = course.circuit ? mod(k, stations) : k;
      if (!course.circuit && (k * STATION < course.poses[0]!.p || k * STATION > course.poses.at(-1)!.p)) continue;
      for (const figure of this.station(layout, station)) {
        if (n >= CAPACITY) break;
        // Walkers pace a stretch of pavement and turn back; everyone else keeps their spot.
        const pacing = figure.span > 0, travel = pacing ? (time * figure.speed / figure.span + figure.phase) % 2 : 0;
        const forward = travel < 1, along = pacing ? (forward ? travel : 2 - travel) * figure.span * figure.facing : 0;
        const at = poseAt(course, figure.p + (k - station) * STATION + along);
        const yaw = at.heading + (pacing ? (forward === (figure.facing > 0) ? 0 : Math.PI) : figure.facing);
        this.put(n++, at, figure.side, figure.e, yaw, figure.row, figure.action, figure.step, figure.rate, figure.scale, figure.shadow);
      }
    }
    // Cyclists ride on through the town streets, either way along the pavement.
    const start = course.circuit ? 0 : course.poses[0]!.p, end = course.circuit ? course.length : course.poses.at(-1)!.p;
    for (const rider of ridersOf(layout)) {
      if (n >= CAPACITY) break;
      const p = start + mod(rider.p - start + rider.dir * rider.speed * time, end - start);
      const ahead = course.circuit ? mod(p - progress + course.length / 2, course.length) - course.length / 2 : p - progress;
      if (ahead < -BEHIND || ahead > AHEAD || !CYCLED.has(layout.districtAt(p, rider.side))) continue;
      const at = poseAt(course, p);
      this.put(n++, at, rider.side, rider.e, at.heading + (rider.dir > 0 ? 0 : Math.PI), rider.row, 0, rider.phase, rider.speed / 4, rider.scale, [.3, .85]);
    }
    this.mesh.count = this.shadows.count = n;
    this.mesh.instanceMatrix.needsUpdate = this.shadows.instanceMatrix.needsUpdate = true;
    this.cellA.needsUpdate = this.cellB.needsUpdate = true;
  }
}
