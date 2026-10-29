/**
 * 1986 Tokyo lot layout for the street route. Presentation placement only:
 * route geometry, hazards, collision arithmetic and car state stay native.
 *
 * Every lot is a distinct building: its typology, size, storeys and seed come
 * from the district it stands in and a stable hash of its position, so the
 * same course always yields the same city, and no two buildings share a
 * template. Districts follow the route's authored sectors (Kanda's dense
 * mixed blocks, the palace moat, Kasumigaseki's ministries, Marunouchi's
 * 31 m office line); routes without a district table get Kanda.
 */
import type { PeriodLandmarkKind } from './landmarks';

export type PeriodSide = -1 | 1;
export type PeriodDistrict = 'kanda' | 'residential' | 'office' | 'government' | 'moat' | 'park' | 'shrine'
  | 'onsen' | 'rural' | 'nikko' | 'harbour' | 'forest' | 'quay';
export type PeriodTypology = 'shophouse' | 'machiya' | 'zakkyo' | 'office' | 'mansion' | 'ministry'
  | 'pachinko' | 'station' | 'parking' | 'ryokan' | 'hotel' | 'house' | 'warehouse' | 'containers';
export interface PeriodCityPose { readonly p: number; readonly x: number; readonly y: number; readonly z: number; readonly heading: number; readonly width: number }
export interface PeriodCityCourse { readonly length: number; readonly circuit: boolean; readonly poses: readonly PeriodCityPose[] }
/** An oriented rectangle: local +X is (cos yaw, -sin yaw), local +Z (the depth, away from the road) is (sin yaw, cos yaw). */
export interface PeriodFootprint { readonly x: number; readonly z: number; readonly yaw: number; readonly halfX: number; readonly halfZ: number }
export interface PeriodLot {
  readonly id: string;
  readonly seed: number;
  readonly typology: PeriodTypology;
  readonly district: PeriodDistrict;
  /** 1 is the street frontage; 2-4 stand progressively farther back. */
  readonly row: 1 | 2 | 3 | 4;
  readonly side: PeriodSide;
  readonly p: number;
  /** Front-centre of the facade at the lot's lowest grade; the facade faces -Z (the road). */
  readonly x: number; readonly z: number; readonly yaw: number;
  /** Metres from the road edge to the facade. */
  readonly clearance: number;
  readonly width: number; readonly depth: number; readonly storeys: number;
  readonly base: number;
  /** Grade difference under the footprint, closed by a plinth. */
  readonly rise: number;
  readonly footprint: PeriodFootprint;
}
/** A river crossing the route square at progress `p`, `span` metres each way: under the Shuto
 * Expressway (Manaita Bridge) or beside Nikko's vermilion Shinkyo. */
export interface PeriodCrossing { readonly p: number; readonly span: number; readonly kind?: 'expressway' | 'shinkyo' }
/** A single landmark beside the road, its footprint reserved before lots are placed. */
export interface PeriodLandmark {
  readonly p: number; readonly side: PeriodSide;
  readonly kind: 'marine-tower' | 'liner' | 'sakurada-gate' | 'hanzo-gate' | 'nijubashi' | PeriodLandmarkKind;
  /** Metres from the road edge to the near face, and the footprint along and across the road. */
  readonly clearance: number; readonly length: number; readonly depth: number;
}
/** Route furniture placed by hand: footbridges (歩道橋) and blue guide signs (`guide` atlas index), by progress. */
export interface PeriodStreetPlan { readonly footbridges: readonly number[]; readonly guides: readonly { readonly p: number; readonly sign: number }[] }
/** Where a district asks for open ground (moat, park, shrine precinct) instead of lots. */
export interface PeriodOpenRun { readonly district: PeriodDistrict; readonly side: PeriodSide; readonly start: number; readonly end: number }
export interface PeriodCityLayout {
  readonly course: PeriodCityCourse;
  readonly lots: readonly PeriodLot[];
  readonly open: readonly PeriodOpenRun[];
  readonly crossings: readonly PeriodCrossing[];
  readonly landmarks: readonly PeriodLandmark[];
  /** The district on each side, as the layout was built. */
  readonly districtAt: (p: number, side: PeriodSide) => PeriodDistrict;
  readonly street: PeriodStreetPlan;
  readonly chunkLength: number;
  readonly chunks: ReadonlyMap<number, readonly PeriodLot[]>;
  readonly stats: { readonly attempts: number; readonly placed: number; readonly road: number; readonly occupied: number; readonly grade: number };
}
export interface PeriodCityOptions {
  /** The district on one side of the road at a progress. */
  readonly districtAt?: (p: number, side: PeriodSide) => PeriodDistrict;
  /** Open runs already computed for the ground cut (periodCityOpenRuns). */
  readonly open?: readonly PeriodOpenRun[];
  readonly crossings?: readonly PeriodCrossing[];
  readonly landmarks?: readonly PeriodLandmark[];
  readonly street?: PeriodStreetPlan;
  /** The clipped urban ground; a missing hit rejects the lot. */
  readonly groundHeightAt: (x: number, z: number) => number | null;
  readonly chunkLength?: number;
}

/**
 * The Tokyo route's sectors (route data, `sector` per sample), right and left of
 * the driver. The loop runs counter-clockwise around the palace, so its moats
 * and parks are on the left. Plausible period character, not a survey.
 */
export const TOKYO_1986_DISTRICTS: readonly { readonly right: PeriodDistrict; readonly left: PeriodDistrict }[] = [
  { right: 'kanda', left: 'kanda' },            // 0 Manaita Bridge to Kudanshita
  { right: 'shrine', left: 'park' },            // 1 Yasukuni-dori, the shrine front and Kitanomaru
  { right: 'residential', left: 'moat' },       // 2 Chidorigafuchi; Ichibancho's mansions and embassies
  { right: 'office', left: 'moat' },            // 3 Hanzomon to Miyakezaka
  { right: 'government', left: 'government' },  // 4 the Diet front
  { right: 'government', left: 'moat' },        // 5 Kasumigaseki to Sakuradamon
  { right: 'office', left: 'moat' },            // 6 the Hibiya turn
  { right: 'office', left: 'moat' },            // 7 Wadakura to Takebashi, Marunouchi and Otemachi
  { right: 'kanda', left: 'kanda' },            // 8 back into Kanda
];
/** The Shuto Expressway rides above the Nihonbashi River, which the route crosses at Manaita Bridge. */
export const TOKYO_1986_CROSSINGS: readonly PeriodCrossing[] = [{ p: 4, span: 300 }];
/** The river channel and the expressway deck, metres from the crossing's centre line and above the road. */
export const RIVER = { half: 11, level: -4.6, deck: 11.5, deckHalf: 8.5 } as const;
/**
 * The Arcade courses: repeating blocks of district per side, `block` metres
 * long (each course is three laps unrolled, so laps differ). Midnight Circuit
 * climbs the Hakone pass through onsen towns; Harbor Run follows Yokohama's
 * warehouse quays; Sakura Pass runs from Nikko's old street into the forest.
 */
export const ARCADE_1986_DISTRICTS: readonly { readonly block: number; readonly right: readonly PeriodDistrict[]; readonly left: readonly PeriodDistrict[] }[] = [
  { block: 320, right: ['onsen', 'onsen', 'forest', 'rural', 'forest', 'onsen', 'forest', 'forest'],
    left: ['onsen', 'forest', 'forest', 'rural', 'onsen', 'onsen', 'forest', 'rural'] },
  { block: 360, right: ['harbour', 'harbour', 'harbour', 'kanda', 'harbour', 'harbour'],
    left: ['quay', 'harbour', 'quay', 'quay', 'harbour', 'quay'] },
  { block: 300, right: ['nikko', 'nikko', 'forest', 'rural', 'forest', 'forest', 'nikko', 'forest'],
    left: ['nikko', 'forest', 'forest', 'rural', 'forest', 'nikko', 'rural', 'forest'] },
];
/**
 * Tokyo's 1986 landmarks at their places on the loop (route progress from the
 * authored gates): Kudan Kaikan, the Budokan, Hanzomon, the National Theatre,
 * the Diet, the Ministry of Justice and Police headquarters at Sakuradamon
 * with the gate across the moat, the Dai-ichi Seimei and Tokyo Kaijo
 * buildings along Hibiya, and the Palace Side Building at Takebashi.
 */
export const TOKYO_1986_LANDMARKS: readonly PeriodLandmark[] = [
  { p: 232, side: 1, kind: 'kudan-kaikan', clearance: 6, length: 70, depth: 28 },
  { p: 520, side: 1, kind: 'budokan', clearance: 22, length: 100, depth: 122 },
  { p: 1812, side: 1, kind: 'hanzo-gate', clearance: 4, length: 14, depth: 60 },
  { p: 1960, side: -1, kind: 'national-theatre', clearance: 12, length: 120, depth: 50 },
  { p: 2724, side: -1, kind: 'diet', clearance: 4, length: 220, depth: 150 },
  { p: 3560, side: -1, kind: 'justice', clearance: 14, length: 96, depth: 36 },
  { p: 3690, side: -1, kind: 'police', clearance: 10, length: 50, depth: 40 },
  { p: 3772, side: 1, kind: 'sakurada-gate', clearance: 4, length: 20, depth: 70 },
  { p: 4060, side: 1, kind: 'nijubashi', clearance: 4, length: 70, depth: 70 },
  { p: 4460, side: -1, kind: 'daiichi', clearance: 7, length: 74, depth: 40 },
  { p: 4900, side: -1, kind: 'kaijo', clearance: 8, length: 50, depth: 40 },
  { p: 6170, side: -1, kind: 'palace-side', clearance: 8, length: 104, depth: 30 },
];
/** Tokyo's footbridges and the guide signs before Kudanshita, Hanzomon, Kasumigaseki and Otemachi. */
export const TOKYO_1986_STREET: PeriodStreetPlan = { footbridges: [118, 2530, 5650, 6730],
  guides: [{ p: 60, sign: 0 }, { p: 1690, sign: 1 }, { p: 3090, sign: 2 }, { p: 5090, sign: 3 }, { p: 6560, sign: 7 }] };
export const ARCADE_1986_STREET: readonly PeriodStreetPlan[] = [
  { footbridges: [], guides: [{ p: 180, sign: 4 }] },
  { footbridges: [1560], guides: [{ p: 260, sign: 5 }] },
  { footbridges: [], guides: [{ p: 90, sign: 6 }] },
];
/** Nikko's Shinkyo beside the road bridge near the start of Sakura Pass. */
export const ARCADE_1986_CROSSINGS: readonly (readonly PeriodCrossing[])[] = [[], [], [{ p: 150, span: 150, kind: 'shinkyo' }]];
/** Yokohama: the Marine Tower (1961) inland and a moored liner at the quay. */
export const ARCADE_1986_LANDMARKS: readonly (readonly PeriodLandmark[])[] = [[
  { p: 150, side: -1, kind: 'fujiya', clearance: 6, length: 64, depth: 24 },
], [
  // Kannai's "three towers" (Jack, Queen, King) lead to Yamashita Park.
  { p: 380, side: -1, kind: 'jack', clearance: 8, length: 34, depth: 30 },
  { p: 520, side: -1, kind: 'queen', clearance: 10, length: 56, depth: 40 },
  { p: 660, side: -1, kind: 'king', clearance: 10, length: 64, depth: 40 },
  { p: 820, side: -1, kind: 'marine-tower', clearance: 30, length: 24, depth: 24 },
  { p: 1180, side: 1, kind: 'liner', clearance: 14, length: 150, depth: 24 },
  { p: 960, side: -1, kind: 'new-grand', clearance: 8, length: 62, depth: 24 },
  { p: 1130, side: -1, kind: 'zenrinmon', clearance: 4, length: 18, depth: 6 },
], [
  { p: 60, side: 1, kind: 'nikko-station', clearance: 8, length: 40, depth: 22 },
  { p: 420, side: 1, kind: 'pagoda', clearance: 24, length: 16, depth: 16 },
]];
/** The Arcade district on one side at a progress. */
export function arcadeDistrictAt(style: number, p: number, side: PeriodSide): PeriodDistrict {
  const table = ARCADE_1986_DISTRICTS[style] ?? ARCADE_1986_DISTRICTS[0]!, list = side < 0 ? table.right : table.left;
  return list[mod(Math.floor((p + 100) / table.block), list.length)]!;
}
const OPEN: ReadonlySet<PeriodDistrict> = new Set(['moat', 'park', 'shrine', 'forest', 'quay']);

type Range = readonly [number, number];
interface TypologySpec { readonly width: Range; readonly depth: Range; readonly storeys: Range; readonly setback: Range }
/** Real 1986 envelopes. Kanda lots are narrow (4-9 m frontage); the
 * Marunouchi office line stops at 31 m (eight or nine storeys). */
const TYPOLOGIES: Readonly<Record<PeriodTypology, TypologySpec>> = {
  shophouse: { width: [4.2, 8.6], depth: [8, 12], storeys: [2, 3], setback: [3.3, 3.7] },
  machiya: { width: [5.4, 9], depth: [9, 12], storeys: [2, 2], setback: [3.3, 3.8] },
  zakkyo: { width: [5.6, 11], depth: [11, 17], storeys: [4, 9], setback: [3.3, 3.7] },
  office: { width: [16, 42], depth: [16, 28], storeys: [6, 9], setback: [3.6, 6] },
  mansion: { width: [13, 28], depth: [10, 14], storeys: [5, 11], setback: [3.6, 5.5] },
  ministry: { width: [40, 84], depth: [18, 26], storeys: [6, 9], setback: [7, 12] },
  pachinko: { width: [11, 18], depth: [14, 20], storeys: [2, 4], setback: [3.3, 3.8] },
  station: { width: [18, 26], depth: [14, 18], storeys: [1, 1], setback: [3.3, 4] },
  parking: { width: [8, 16], depth: [10, 14], storeys: [0, 0], setback: [3.3, 3.6] },
  ryokan: { width: [12, 24], depth: [10, 14], storeys: [2, 4], setback: [3.6, 6] },
  hotel: { width: [16, 30], depth: [11, 15], storeys: [4, 8], setback: [4, 7] },
  house: { width: [7, 11], depth: [7, 10], storeys: [1, 2], setback: [4.5, 7.5] },
  warehouse: { width: [14, 36], depth: [16, 28], storeys: [1, 3], setback: [3.6, 8] },
  containers: { width: [18, 36], depth: [14, 24], storeys: [1, 4], setback: [4, 8] },
};
/** Typologies whose storeys always come from their own envelope, never a tall back row's. */
const LOW: ReadonlySet<PeriodTypology> = new Set(['shophouse', 'machiya', 'station', 'parking', 'pachinko', 'ryokan', 'house', 'warehouse', 'containers']);
type Weights = Partial<Record<PeriodTypology, number>>;
interface RowSpec { readonly weights: Weights; readonly clearance: Range; readonly storeys?: Range; readonly scale?: number }
interface DistrictSpec { readonly alley: number; readonly rows: readonly RowSpec[] }
/** Frontage and back-row mixes. Back rows stand taller so the skyline layers. */
const DISTRICTS: Readonly<Record<PeriodDistrict, DistrictSpec>> = {
  kanda: { alley: 0.16, rows: [
    { weights: { shophouse: 30, zakkyo: 36, machiya: 7, pachinko: 4, office: 6, parking: 7, station: 2, mansion: 4 }, clearance: [0, 0] },
    { weights: { zakkyo: 46, mansion: 26, office: 18, shophouse: 10 }, clearance: [16, 30] },
    { weights: { zakkyo: 30, mansion: 34, office: 36 }, clearance: [38, 60], storeys: [6, 12] },
    { weights: { office: 55, mansion: 45 }, clearance: [68, 96], storeys: [8, 14], scale: 1.25 },
  ] },
  residential: { alley: 0.2, rows: [
    { weights: { mansion: 40, office: 18, zakkyo: 18, shophouse: 12, parking: 8, machiya: 4 }, clearance: [0, 0] },
    { weights: { mansion: 56, office: 26, zakkyo: 18 }, clearance: [20, 34] },
    { weights: { mansion: 50, office: 50 }, clearance: [42, 64], storeys: [6, 12] },
    { weights: { office: 50, mansion: 50 }, clearance: [72, 98], storeys: [8, 15], scale: 1.2 },
  ] },
  office: { alley: 0.1, rows: [
    { weights: { office: 74, zakkyo: 10, ministry: 8, parking: 4, station: 4 }, clearance: [0, 0] },
    { weights: { office: 80, mansion: 8, ministry: 12 }, clearance: [30, 46] },
    { weights: { office: 100 }, clearance: [56, 76], storeys: [7, 12] },
    { weights: { office: 100 }, clearance: [84, 100], storeys: [9, 16], scale: 1.3 },
  ] },
  government: { alley: 0.06, rows: [
    { weights: { ministry: 64, office: 32, parking: 4 }, clearance: [0, 0] },
    { weights: { ministry: 46, office: 54 }, clearance: [34, 52] },
    { weights: { office: 70, ministry: 30 }, clearance: [62, 84], storeys: [7, 12] },
  ] },
  // Arcade towns stand on the flat strip before the pass's banks rise (18 m).
  onsen: { alley: .14, rows: [
    { weights: { ryokan: 30, shophouse: 22, hotel: 16, machiya: 12, house: 8, parking: 7, station: 3, zakkyo: 2 }, clearance: [0, 0] },
    { weights: { ryokan: 40, hotel: 35, house: 25 }, clearance: [15, 20] },
  ] },
  rural: { alley: .45, rows: [
    { weights: { house: 72, machiya: 10, shophouse: 10, parking: 4, station: 4 }, clearance: [0, 0] },
    { weights: { house: 100 }, clearance: [15, 21] },
  ] },
  nikko: { alley: .12, rows: [
    { weights: { machiya: 34, shophouse: 28, ryokan: 20, house: 10, parking: 5, station: 3 }, clearance: [0, 0] },
    { weights: { ryokan: 40, house: 40, machiya: 20 }, clearance: [15, 20] },
  ] },
  harbour: { alley: .2, rows: [
    { weights: { warehouse: 56, containers: 22, office: 8, parking: 8, station: 3, zakkyo: 3 }, clearance: [0, 0] },
    { weights: { warehouse: 60, containers: 40 }, clearance: [26, 44] },
    { weights: { warehouse: 55, containers: 30, office: 15 }, clearance: [52, 80] },
  ] },
  moat: { alley: 0, rows: [] },
  park: { alley: 0, rows: [] },
  shrine: { alley: 0, rows: [] },
  forest: { alley: 0, rows: [] },
  quay: { alley: 0, rows: [] },
};

const TAU = Math.PI * 2;
const mod = (v: number, n: number) => (v % n + n) % n;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** A small stable hash (32-bit) of an integer tuple. */
export function hashInts(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const value of values) { h ^= value | 0; h = Math.imul(h, 0x01000193); h ^= h >>> 13; }
  return h >>> 0;
}
/** Seeded generator (mulberry32), the same family as scenery.ts. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = state + 0x6d2b79f5 | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const within = (random: () => number, [low, high]: Range) => low + (high - low) * random();
function pick<T extends string>(random: () => number, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  let roll = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [key, weight] of entries) { roll -= weight; if (roll <= 0) return key; }
  return entries.at(-1)![0];
}

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
type Segment = { a: PeriodCityPose; b: PeriodCityPose };
class Grid<T> {
  private readonly cells = new Map<string, T[]>();
  private visit(box: Box, fn: (key: string) => void): void {
    for (let x = Math.floor(box.minX / 32); x <= Math.floor(box.maxX / 32); x++)
      for (let z = Math.floor(box.minZ / 32); z <= Math.floor(box.maxZ / 32); z++) fn(`${x}:${z}`);
  }
  add(value: T, box: Box): void { this.visit(box, key => { const values = this.cells.get(key) ?? []; values.push(value); this.cells.set(key, values); }); }
  query(box: Box): T[] { const values = new Set<T>(); this.visit(box, key => { for (const item of this.cells.get(key) ?? []) values.add(item); }); return [...values]; }
}
const indices = new WeakMap<PeriodCityLayout, Grid<PeriodFootprint>>();
const roadIndices = new WeakMap<PeriodCityLayout, Grid<Segment>>();

function boxOf(f: PeriodFootprint, margin = 0): Box {
  const c = Math.abs(Math.cos(f.yaw)), s = Math.abs(Math.sin(f.yaw));
  const x = c * f.halfX + s * f.halfZ + margin, z = s * f.halfX + c * f.halfZ + margin;
  return { minX: f.x - x, maxX: f.x + x, minZ: f.z - z, maxZ: f.z + z };
}
/** A world point in the footprint's local frame. */
function local(x: number, z: number, f: PeriodFootprint): { x: number; z: number } {
  const dx = x - f.x, dz = z - f.z, c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
function overlaps(a: PeriodFootprint, b: PeriodFootprint, margin: number): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const yaw of [a.yaw, b.yaw]) for (const axis of [[Math.cos(yaw), -Math.sin(yaw)], [Math.sin(yaw), Math.cos(yaw)]] as const) {
    const radius = (f: PeriodFootprint) => Math.abs(axis[0] * Math.cos(f.yaw) - axis[1] * Math.sin(f.yaw)) * f.halfX
      + Math.abs(axis[0] * Math.sin(f.yaw) + axis[1] * Math.cos(f.yaw)) * f.halfZ;
    if (Math.abs(dx * axis[0] + dz * axis[1]) >= radius(a) + radius(b) + margin) return false;
  }
  return true;
}
function segmentHitsBox(a: { x: number; z: number }, b: { x: number; z: number }, halfX: number, halfZ: number): boolean {
  let low = 0, high = 1;
  for (const [start, delta, half] of [[a.x, b.x - a.x, halfX], [a.z, b.z - a.z, halfZ]] as const) {
    if (Math.abs(delta) < 1e-9) { if (Math.abs(start) > half) return false; continue; }
    const near = (-half - start) / delta, far = (half - start) / delta;
    low = Math.max(low, Math.min(near, far)); high = Math.min(high, Math.max(near, far));
    if (low > high) return false;
  }
  return true;
}
/** Conservative: the road capsule plus its 1.67 m sidewalk never meets a lot. */
function hitsRoad(f: PeriodFootprint, roads: Grid<Segment>): boolean {
  for (const { a, b } of roads.query(boxOf(f, 10))) {
    const radius = Math.max(a.width, b.width) + 1.75;
    if (segmentHitsBox(local(a.x, a.z, f), local(b.x, b.z, f), f.halfX + radius, f.halfZ + radius)) return true;
  }
  return false;
}
export function poseAt(course: PeriodCityCourse, value: number): PeriodCityPose {
  const poses = course.poses, p = course.circuit ? mod(value, course.length) : clamp(value, poses[0]!.p, poses.at(-1)!.p);
  let lo = 0, hi = poses.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (poses[mid]!.p <= p) lo = mid; else hi = mid; }
  const a = poses[lo]!, b = poses[hi]!, t = clamp((p - a.p) / (b.p - a.p || 1), 0, 1);
  return { p, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
    heading: a.heading + (mod(b.heading - a.heading + Math.PI, TAU) - Math.PI) * t, width: a.width + (b.width - a.width) * t };
}

/** Open districts as runs along each side, for the moat, park and shrine builders. */
export function periodCityOpenRuns(course: PeriodCityCourse, districtAt: (p: number, side: PeriodSide) => PeriodDistrict): PeriodOpenRun[] {
  const start = course.circuit ? 0 : course.poses[0]!.p, end = course.circuit ? course.length : course.poses.at(-1)!.p, runs: PeriodOpenRun[] = [];
  for (const side of [-1, 1] as const) {
    let run: { district: PeriodDistrict; start: number } | null = null;
    for (let p = start; p < end; p += 4) {
      const district = districtAt(p, side);
      if (run && run.district !== district) { runs.push({ district: run.district, side, start: run.start, end: p }); run = null; }
      if (!run && OPEN.has(district)) run = { district, start: p };
    }
    if (run) runs.push({ district: run.district, side, start: run.start, end });
  }
  return runs;
}

/** The moat cross-section, metres beyond the road edge and above the road. */
export const MOAT = { curb: 3.6, bank: 4.4, water: 9.5, level: -3.2, batter: 3.2, top: 6.2, platform: 24 } as const;
/** The moat's width along the run: 26-48 m, varying smoothly like the real Uchibori. */
export function moatWidth(p: number): number {
  return 37 + 7 * Math.sin(p / 97 + .6) + 4 * Math.cos(p / 233 - 1.1);
}
/**
 * The nearest route point to (x, z) within `reach` metres of the road edge:
 * its progress, side and distance beyond the road edge. Null farther away.
 */
export function periodCityRouteFrame(course: PeriodCityCourse, reach: number): (x: number, z: number) => { p: number; side: PeriodSide; beyond: number } | null {
  const segments = new Grid<Segment>();
  for (let i = 1; i < course.poses.length; i++) {
    const a = course.poses[i - 1]!, b = course.poses[i]!, r = reach + Math.max(a.width, b.width);
    segments.add({ a, b }, { minX: Math.min(a.x, b.x) - r, maxX: Math.max(a.x, b.x) + r, minZ: Math.min(a.z, b.z) - r, maxZ: Math.max(a.z, b.z) + r });
  }
  return (x, z) => {
    let best: { p: number; lateral: number; width: number; distance: number } | null = null;
    for (const { a, b } of segments.query({ minX: x, maxX: x, minZ: z, maxZ: z })) {
      const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / length2, 0, 1), px = a.x + dx * t, pz = a.z + dz * t;
      const distance = Math.hypot(x - px, z - pz);
      if (best && distance >= best.distance) continue;
      const heading = a.heading + (mod(b.heading - a.heading + Math.PI, TAU) - Math.PI) * t;
      best = { p: a.p + (b.p - a.p) * t, lateral: (x - px) * Math.cos(heading) - (z - pz) * Math.sin(heading),
        width: a.width + (b.width - a.width) * t, distance };
    }
    return best ? { p: best.p, side: best.lateral < 0 ? -1 : 1, beyond: Math.abs(best.lateral) - best.width } : null;
  };
}

/** Where the park and moat replace the paved ground (a cut for createUrbanGround). */
export function periodCityGroundCut(course: PeriodCityCourse, runs: readonly PeriodOpenRun[],
  crossings: readonly PeriodCrossing[] = []): (x: number, z: number) => boolean {
  const cuts = runs.filter(run => run.district === 'moat' || run.district === 'park');
  if (!cuts.length && !crossings.length) return () => false;
  const frame = periodCityRouteFrame(course, MOAT.water + 48 + MOAT.batter + MOAT.platform + 8);
  return (x, z) => {
    const best = frame(x, z);
    if (!best) return false;
    const { side, beyond } = best;
    for (const crossing of crossings) {
      // The river channel, beside its own bridge only (never under another street).
      const near = course.circuit ? Math.abs(mod(best.p - crossing.p + course.length / 2, course.length) - course.length / 2) : Math.abs(best.p - crossing.p);
      if (near > 60) continue;
      const f = crossingFootprint(course, crossing), point = local(x, z, f);
      if (Math.abs(point.z) < RIVER.half + 1 && Math.abs(point.x) > poseAt(course, crossing.p).width + 2.5 && Math.abs(point.x) < crossing.span) return true;
    }
    return cuts.some(run => run.side === side && best!.p >= run.start && best!.p <= run.end && beyond >= 3
      && beyond <= (run.district === 'moat' ? MOAT.water + moatWidth(best!.p) + MOAT.batter + MOAT.platform : 64));
  };
}

/** The crossing's corridor: local X runs across the route (side +1 positive), local Z along it. */
export function crossingFootprint(course: PeriodCityCourse, crossing: PeriodCrossing): PeriodFootprint {
  const at = poseAt(course, crossing.p);
  return { x: at.x, z: at.z, yaw: at.heading, halfX: crossing.span, halfZ: RIVER.half + 2 };
}

/** A landmark's reserved footprint (local X along the road, local -Z toward it). */
export function landmarkFootprint(course: PeriodCityCourse, landmark: PeriodLandmark): PeriodFootprint {
  const at = poseAt(course, landmark.p), yaw = at.heading + (landmark.side < 0 ? -Math.PI / 2 : Math.PI / 2);
  const lateral = landmark.side * (at.width + landmark.clearance + landmark.depth / 2);
  return { x: at.x + Math.cos(at.heading) * lateral, z: at.z - Math.sin(at.heading) * lateral, yaw, halfX: landmark.length / 2, halfZ: landmark.depth / 2 };
}

/** Lay out the whole course once (lot records only, no geometry). */
export function createPeriodCityLayout(course: PeriodCityCourse, options: PeriodCityOptions): PeriodCityLayout {
  if (!(course.length > 0) || course.poses.length < 2) throw new Error('The period city needs a positive course length and at least two route poses.');
  const districtAt = options.districtAt ?? (() => 'kanda' as const), chunkLength = options.chunkLength ?? 80;
  const roads = new Grid<Segment>(), occupied = new Grid<PeriodFootprint>();
  for (let i = 1; i < course.poses.length; i++) {
    const a = course.poses[i - 1]!, b = course.poses[i]!, r = Math.max(a.width, b.width) + 2;
    roads.add({ a, b }, { minX: Math.min(a.x, b.x) - r, maxX: Math.max(a.x, b.x) + r, minZ: Math.min(a.z, b.z) - r, maxZ: Math.max(a.z, b.z) + r });
  }
  const start = course.circuit ? 0 : course.poses[0]!.p, end = course.circuit ? course.length : course.poses.at(-1)!.p;
  const lots: PeriodLot[] = [], open: PeriodOpenRun[] = [];
  const stats = { attempts: 0, placed: 0, road: 0, occupied: 0, grade: 0 };
  const place = (row: 1 | 2 | 3 | 4, side: PeriodSide, p: number, typology: PeriodTypology, district: PeriodDistrict,
    width: number, depth: number, storeys: number, clearances: readonly number[], seed: number): boolean => {
    stats.attempts++;
    const at = poseAt(course, p), yaw = at.heading + (side < 0 ? -Math.PI / 2 : Math.PI / 2);
    for (const clearance of clearances) {
      const lateral = side * (at.width + clearance);
      const x = at.x + Math.cos(at.heading) * lateral, z = at.z - Math.sin(at.heading) * lateral;
      // The footprint centre is half a depth behind the facade.
      const footprint = { x: x + Math.sin(yaw) * depth / 2, z: z + Math.cos(yaw) * depth / 2, yaw, halfX: width / 2, halfZ: depth / 2 };
      if (hitsRoad(footprint, roads)) { stats.road++; continue; }
      if (occupied.query(boxOf(footprint, .3)).some(other => overlaps(footprint, other, .3))) { stats.occupied++; continue; }
      let low = Infinity, high = -Infinity, missing = false;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, -1]] as const) {
        const gx = footprint.x + Math.cos(yaw) * u * width / 2 * .96 + Math.sin(yaw) * v * depth / 2 * .96;
        const gz = footprint.z - Math.sin(yaw) * u * width / 2 * .96 + Math.cos(yaw) * v * depth / 2 * .96;
        const y = options.groundHeightAt(gx, gz);
        if (y === null) { missing = true; break; }
        low = Math.min(low, y); high = Math.max(high, y);
      }
      if (missing || high - low > (row === 1 ? 2.6 : 4)) { stats.grade++; continue; }
      const lot: PeriodLot = { id: `${row}:${side}:${Math.round(p * 10)}`, seed, typology, district, row, side,
        p: course.circuit ? mod(p, course.length) : p, x, z, yaw, clearance, width, depth, storeys, base: low, rise: high - low, footprint };
      lots.push(lot); occupied.add(footprint, boxOf(footprint)); stats.placed++;
      return true;
    }
    return false;
  };
  open.push(...options.open ?? periodCityOpenRuns(course, districtAt));
  const crossings = options.crossings ?? [], landmarks = options.landmarks ?? [];
  for (const crossing of crossings) { const f = crossingFootprint(course, crossing); occupied.add(f, boxOf(f)); }
  for (const landmark of landmarks) { const f = landmarkFootprint(course, landmark); occupied.add(f, boxOf(f)); }
  for (const side of [-1, 1] as const) {
    for (let row = 1; row <= 4; row++) {
      let p = start + (side > 0 ? 3.1 : 0) + row * 1.7;
      while (p < end - 2) {
        const district = districtAt(p, side), spec = DISTRICTS[district].rows[row - 1];
        if (!spec) { p += 6; continue; }
        const seed = hashInts(row, side, Math.round(p * 10)), random = seeded(seed);
        const typology = pick(random, spec.weights), shape = TYPOLOGIES[typology], scale = spec.scale ?? 1;
        const width = within(random, shape.width) * (row > 2 ? scale * (1 + random() * .4) : 1);
        const depth = within(random, shape.depth) * (row > 2 ? scale : 1);
        const storeys = Math.round(within(random, LOW.has(typology) ? shape.storeys : spec.storeys ?? shape.storeys));
        const centre = p + width / 2;
        if (centre >= end && !course.circuit) break;
        const clearances = row === 1
          ? [within(random, shape.setback), shape.setback[1] + 1.2, shape.setback[1] + 3]
          : [0, .3, .6, 1].map(t => spec.clearance[0] + (spec.clearance[1] - spec.clearance[0]) * mod(t + random(), 1));
        const placed = place(row as 1 | 2 | 3 | 4, side, centre, typology, district, width, depth, storeys, clearances, seed);
        // Kanda's frontage is continuous: party walls touch, with an occasional
        // alley. A rejected lot (an inside bend, a junction) leaves its width.
        const gap = row === 1 ? random() < DISTRICTS[district].alley ? 1.1 + random() * 1.6 : .08 + random() * .25
          : 2 + random() * (row === 2 ? 5 : 12);
        p += (placed ? width : Math.min(width, 6)) + gap;
      }
    }
  }
  lots.sort((a, b) => a.p - b.p || a.id.localeCompare(b.id));
  const chunks = new Map<number, PeriodLot[]>();
  for (const lot of lots) {
    const key = Math.floor(lot.p / chunkLength), list = chunks.get(key) ?? [];
    list.push(lot); chunks.set(key, list);
  }
  const layout: PeriodCityLayout = { course, lots, open, crossings, landmarks, districtAt,
    street: options.street ?? { footbridges: [], guides: [] }, chunkLength, chunks, stats };
  indices.set(layout, occupied); roadIndices.set(layout, roads);
  return layout;
}

/** Chunk keys within a window around a progress (wrapping on circuits). */
export function periodCityChunksNear(layout: PeriodCityLayout, progress: number, behind = 110, ahead = 560): number[] {
  const { course, chunkLength } = layout, count = Math.ceil(course.length / chunkLength), keys: number[] = [];
  const first = Math.floor(course.poses[0]!.p / chunkLength), last = Math.floor(course.poses.at(-1)!.p / chunkLength);
  for (let p = progress - behind; p <= progress + ahead; p += chunkLength) {
    const key = Math.floor((course.circuit ? mod(p, course.length) : p) / chunkLength);
    // Open ground and landmarks can fill a chunk with no lots.
    if ((course.circuit ? key < count : key >= first && key <= last) && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * How far open ground may reach beside the road (metres beyond its edge, up
 * to `max`) before it meets another part of the route: the inside of a bend
 * or a junction. Open strips are drawn perpendicular to the road.
 */
export function periodCityReach(layout: PeriodCityLayout, p: number, side: PeriodSide, max: number): number {
  const roads = roadIndices.get(layout), at = poseAt(layout.course, p);
  if (!roads) return max;
  const cx = Math.cos(at.heading) * side, cz = -Math.sin(at.heading) * side;
  for (let e = 6; e <= max; e += 3) {
    const x = at.x + cx * (at.width + e), z = at.z + cz * (at.width + e);
    for (const { a, b } of roads.query({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 })) {
      const near = layout.course.circuit ? Math.abs(mod(a.p - at.p + layout.course.length / 2, layout.course.length) - layout.course.length / 2) : Math.abs(a.p - at.p);
      if (near < 40) continue;
      const dx = b.x - a.x, dz = b.z - a.z, t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < Math.max(a.width, b.width) + 5) return Math.max(0, e - 6);
    }
  }
  return max;
}

/** The open district at a progress and side, if any. */
export function periodCityOpenAt(layout: PeriodCityLayout, p: number, side: PeriodSide): PeriodOpenRun | null {
  const at = layout.course.circuit ? mod(p, layout.course.length) : p;
  return layout.open.find(run => run.side === side && at >= run.start && at < run.end) ?? null;
}

/** Keep trees, understory and lamps out of every placed building. */
export function periodCityPlantingClear(layout: PeriodCityLayout, x: number, z: number, radius: number): boolean {
  const grid = indices.get(layout), reach = radius + .4;
  const nearby = grid?.query({ minX: x - reach, maxX: x + reach, minZ: z - reach, maxZ: z + reach }) ?? layout.lots.map(lot => lot.footprint);
  return nearby.every(f => {
    const point = local(x, z, f);
    return Math.hypot(Math.max(0, Math.abs(point.x) - f.halfX), Math.max(0, Math.abs(point.z) - f.halfZ)) >= reach;
  });
}
