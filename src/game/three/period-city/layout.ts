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
export type PeriodDistrict = 'kanda' | 'residential' | 'town' | 'office' | 'government' | 'moat' | 'park' | 'shrine' | 'temple' | 'pond'
  | 'onsen' | 'rural' | 'nikko' | 'harbour' | 'forest' | 'quay';
/** People and animals found on one route only (street-scenes.ts): Gion's maiko, Nara's deer, the Irohazaka monkeys. */
export type PeriodLocal = 'maiko' | 'deer' | 'monkeys';
/** Locals at a place: who, and how thick (maiko: their share of the walkers; deer and monkeys: a herd's or troop's chance per 6 m station). */
export interface PeriodLocals { readonly kind: PeriodLocal; readonly density: number }
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
export interface PeriodCrossing {
  readonly p: number; readonly span: number;
  /** The Nihonbashi River under the expressway (default), Nikko's Shinkyo gorge, or a plain river such as the Kamo. */
  readonly kind?: 'expressway' | 'shinkyo' | 'river' | 'gorge';
  /** Half the channel's width along the road, in metres (the Nihonbashi River's 11 m by default). */
  readonly half?: number;
}
/** A single landmark beside the road, its footprint reserved before lots are placed. */
export interface PeriodLandmark {
  readonly p: number; readonly side: PeriodSide;
  readonly kind: 'marine-tower' | 'liner' | 'sakurada-gate' | 'hanzo-gate' | 'nijubashi' | PeriodLandmarkKind;
  /** Metres from the road edge to the near face, and the footprint along and across the road. */
  readonly clearance: number; readonly length: number; readonly depth: number;
}
/** Route furniture placed by hand: footbridges (歩道橋) and blue guide signs (`guide` atlas index), by progress. */
export interface PeriodStreetPlan {
  readonly footbridges: readonly number[]; readonly guides: readonly { readonly p: number; readonly sign: number }[];
  /** Great structures that straddle the road: Heian Jingū's torii over Jingū-michi, a concrete tied-arch bridge of
   * `span` metres (Hakone's Asahi-bashi and Chitose-bashi), or a railway's girder crossing overhead (Deyama). */
  readonly arches?: readonly { readonly p: number; readonly kind: 'heian-torii' | 'tied-arch' | 'rail-girder' | 'level-crossing'; readonly span?: number;
    /** A level crossing's tracks, their gauge in metres, how far the line runs beyond the kerb to the right and left,
     * and whether a station's staggered platforms stand either side of the road (Keihan's Shijo). */
    readonly tracks?: number; readonly gauge?: number; readonly reach?: readonly [number, number]; readonly station?: boolean;
    /** A second bridge beside a tied arch on this side: Shin-Asahi-bashi's steel box girder (1967), the downhill lane. */
    readonly beside?: PeriodSide }[];
  /** Progress of a shrine front's great torii (absent: near the start of its precinct). Yasukuni's first torii. */
  readonly torii?: number;
  /** A park on `side` that ends at a sea wall `edge` metres beyond the road edge, with the harbour beyond it
   * (Yamashita Park, Hikawa Maru moored at its wall). */
  readonly seaPark?: { readonly from: number; readonly to: number; readonly side: PeriodSide; readonly edge: number };
  /** Progress ranges where flowering cherries stand along an Arcade road (absent: wherever it is wooded). Nikkō's
   * main street has no cherry avenue; they stand by the Daiya, round the Tamozawa villa and wild on the hillsides. */
  readonly blossom?: readonly (readonly [number, number])[];
  /** Structures that run along the road (road-structures.ts): a rock shed over it, open to `side` (Kanrei-dōmon); a
   * railway viaduct beside it on `side`, `clearance` metres beyond the road edge (the Yamashita Rinkō line); or a
   * street tramway's double track down the middle of it under its trolley wires (the Keishin line on Sanjō-dōri). */
  readonly galleries?: readonly { readonly from: number; readonly to: number; readonly kind: 'rock-shed' | 'viaduct' | 'tram-track'; readonly side: PeriodSide; readonly clearance?: number }[];
  /** Small roadside boards, such as Irohazaka's numbered kana at each curve. */
  readonly markers?: readonly { readonly p: number; readonly side: PeriodSide; readonly text: string }[];
  /** Progress ranges (metres, start and end) carpeted with fallen maple leaves, their open verges thick with autumn
   * shrubs: the routes' autumn stretches. */
  readonly litter?: readonly (readonly [number, number])[];
  /** Progress ranges where Japanese cedars (杉) stand dark among the trees behind the verge, as on Nikko's mountain roads. */
  readonly cedars?: readonly (readonly [number, number])[];
  /** Late autumn: the broadleaf woods along the route turn crimson, orange and gold (autumn-foliage.ts). */
  readonly autumn?: boolean;
  /** The share of fallen leaves that are gold (0 by default), and extra leaves a metre in each kerb drift, up to `until`
   * (progress, m; the route's end by default): the afternoon routes' repaints strew gold among the crimson and pile the
   * kerbs thick, where under the dusk routes' lamp pools gold leaves read as a gold speckle. */
  readonly afternoonLeaves?: { readonly gold: number; readonly drifts: number; readonly until?: number };
  /** The route's forest districts rise as forest banks (terrain.ts `createTerrain`), not a shared hillside: their verge is
   * paved up to the bank (periodCityGroundCut) and holds only its understory, the race's own forest standing on the bank. */
  readonly forestBanks?: boolean;
}
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
  /** The route's own locals at a progress, if any. */
  readonly localsAt: (p: number) => PeriodLocals | null;
  readonly street: PeriodStreetPlan;
  /** The ground's height used for lots and roadside structures. */
  readonly groundHeightAt: (x: number, z: number) => number | null;
  /** Vegetation can stand on a wooded hillside without admitting buildings onto that ground. */
  readonly vegetationGroundHeightAt: (x: number, z: number) => number | null;
  readonly chunkLength: number;
  readonly chunks: ReadonlyMap<number, readonly PeriodLot[]>;
  readonly stats: { readonly attempts: number; readonly placed: number; readonly road: number; readonly occupied: number; readonly grade: number };
}
export interface PeriodCityOptions {
  /** The district on one side of the road at a progress. */
  readonly districtAt?: (p: number, side: PeriodSide) => PeriodDistrict;
  readonly localsAt?: (p: number) => PeriodLocals | null;
  /** Open runs already computed for the ground cut (periodCityOpenRuns). */
  readonly open?: readonly PeriodOpenRun[];
  readonly crossings?: readonly PeriodCrossing[];
  readonly landmarks?: readonly PeriodLandmark[];
  readonly street?: PeriodStreetPlan;
  /** The clipped urban ground; a missing hit rejects the lot. */
  readonly groundHeightAt: (x: number, z: number) => number | null;
  /** Optional ground for vegetation only; defaults to the lot sampler. */
  readonly vegetationGroundHeightAt?: (x: number, z: number) => number | null;
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
 * The Arcade courses in the real world of 1986. Each is three laps drawn end to end, and that whole length follows
 * one real road at true scale (src/game/arcade-geography.ts carries its heights). The stretches below name the
 * places along it in order, each up to `to` metres along the course, with the district on either side of a driver.
 * Sources, real distances and what is unconfirmed are in world/research/arcade/README.md.
 *
 * - Midnight Circuit: National Route 1 from Hakone-Yumoto station up the Haya-kawa gorge through Tōnosawa and
 *   Ōhiradai to Miyanoshita and the Fujiya Hotel, 95 m to 415 m.
 * - Harbor Run: from Sakuragichō station along Honchō-dōri and over Bankoku-bashi onto Shinkō Pier, past its
 *   red-brick warehouses and back over Shinkō-bashi to Kaigan-dōri and Yamashita Park, under the 1984 expressway at
 *   Yamashita-bashi, below the Yamate bluff, sharp left at Kominato and out along Honmoku Pier to the Symbol Tower
 *   (July 1986). Past Bankoku-bashi the sea is on the left.
 * - Sakura Pass: from the JNR Nikkō station up the main street to Shinkyō, then Route 120 along the Daiya past
 *   Tamozawa to the rise before Kiyotaki, 532 m to 707 m.
 */
export interface ArcadeStretch {
  readonly to: number; readonly place: string; readonly right: PeriodDistrict; readonly left: PeriodDistrict;
  /** How the land stands beside the road, right then left, as a factor on the bank beyond the 18 m strip
   * (terrain.ts): 1 the plain 22 m bank, more a steeper hillside, negative a slope falling to a valley or river. */
  readonly banks: readonly [number, number];
}
const stretch = (to: number, place: string, banks: readonly [number, number], right: PeriodDistrict, left: PeriodDistrict = right): ArcadeStretch =>
  ({ to, place, right, left, banks });
export const ARCADE_1986_STRETCHES: readonly (readonly ArcadeStretch[])[] = [[
  // The station stands under its hill on the right, the Haya-kawa runs below on the left.
  stretch(470, '箱根湯本 駅前商店街', [1.3, -.4], 'onsen'),
  // Over Asahi-bashi to the south bank: Yusaka-yama's cliff on the left, the river on the right, and back over Chitose-bashi.
  stretch(990, '旭橋・函嶺洞門・千歳橋', [-.7, 1.9], 'forest'),
  stretch(1350, '塔ノ沢温泉 福住楼・環翠楼・一の湯', [1.4, -.4], 'onsen'),
  // The climb: Sengen-yama's flank on the left, the gorge falling away on the right toward Myōjōgatake.
  stretch(4080, '出山・常盤橋 早川渓谷', [-1, 1.8], 'forest'),
  stretch(4280, '大平台 ヘアピン', [-.6, 1.4], 'rural', 'forest'),
  stretch(4620, '大平台温泉', [-.5, 1.2], 'onsen'),
  stretch(5700, '大平台 → 宮ノ下', [-1, 1.8], 'forest'),
  stretch(6000, '宮ノ下 東', [-.7, 1.4], 'onsen', 'rural'),
  stretch(Infinity, '宮ノ下温泉 奈良屋・富士屋ホテル', [-.7, 1.4], 'onsen'),
], [
  // From Sakuragichō station along Honchō-dōri, the old bank street, over Benten-bashi and up to Bankoku-bashi.
  stretch(110, '桜木町駅前', [0, 0], 'kanda', 'office'),
  stretch(650, '本町通り 弁天橋・馬車道', [0, 0], 'office'),
  stretch(940, '万国橋通り', [0, 0], 'harbour', 'office'),
  stretch(1560, '新港埠頭 上屋と赤レンガ倉庫', [0, 0], 'harbour'),
  stretch(1640, '新港橋', [0, 0], 'harbour'),
  // South to Kaigan-dōri: the Customs stands back across the block on the right, Zō-no-hana's quay on the left.
  stretch(1890, '海岸通り 象の鼻・横浜税関', [0, 0], 'office', 'quay'),
  stretch(2050, '神奈川県庁', [0, 0], 'office', 'quay'),
  stretch(2190, '大さん橋入口 シルクセンター', [0, 0], 'office', 'quay'),
  stretch(3030, '山下公園通り', [0, 0], 'office', 'park'),
  stretch(3140, '山下埠頭入口・山下橋', [0, 0], 'harbour'),
  // The Yamate bluff stands some 40 m over Shin-Yamashita, Harbor View Park on its edge; the timber basin on the left.
  stretch(3290, '新山下 バンドホテル', [1.2, 0], 'town', 'quay'),
  stretch(3760, '新山下 山手の崖下', [1.9, 0], 'town', 'quay'),
  stretch(4160, '新山下 貯木場', [1.4, 0], 'town', 'quay'),
  stretch(4500, '小港', [.8, 0], 'town', 'harbour'),
  // A sharp left at Kominato onto the pier road, past the cleared ground of the old US Navy housing.
  stretch(4760, '小港 本牧ふ頭入口', [.5, 0], 'town', 'harbour'),
  stretch(5300, '本牧 接収解除地', [.3, 0], 'park', 'harbour'),
  stretch(5800, '本牧ふ頭入口', [0, 0], 'harbour'),
  stretch(6100, '本牧ふ頭 A突堤', [0, 0], 'harbour', 'quay'),
  stretch(6450, '本牧ふ頭 B・C突堤', [0, 0], 'harbour'),
  stretch(6950, '本牧ふ頭 D突堤 コンテナヤード', [0, 0], 'harbour'),
  stretch(7350, '本牧ふ頭 D突堤 岸壁', [0, 0], 'harbour', 'quay'),
  stretch(Infinity, '横浜港シンボルタワー', [0, 0], 'harbour'),
], [
  // The main street lies on the valley floor; City Hall's stone wall and the Kanaya's bluff stand on the left.
  stretch(120, '国鉄日光駅前', [.3, .3], 'nikko'),
  stretch(1740, '日光街道 松原町・石屋町・御幸町・鉢石', [.4, .7], 'nikko'),
  stretch(1920, '神橋・日光橋', [1.2, 1], 'forest'),
  // Route 120 under the Sannai hill, the Daiya below on the left.
  stretch(2440, '山内 大谷川沿い', [1.5, -.6], 'forest'),
  stretch(2640, '西参道', [1, -.3], 'nikko'),
  stretch(2950, '安川町・本町', [.8, -.3], 'nikko', 'town'),
  stretch(3480, '田母沢御用邸・日光植物園', [.8, -.4], 'town', 'park'),
  stretch(4060, '花石町・久次良町', [.9, -.4], 'town', 'rural'),
  stretch(4500, '久次良町 西', [1.3, -.8], 'rural', 'forest'),
  stretch(5420, '荒沢・白崖', [1.6, -1], 'forest'),
  stretch(Infinity, '清滝', [.8, .4], 'town'),
]];
/**
 * Tokyo's 1986 landmarks at their places on the loop (route progress; side 1 is the palace side, -1 the outer
 * side), placed by projecting each building's real position onto the route (world/research/routes/tokyo-1986.md).
 * The route's own line strays 40-220 m from the real streets in places, so positions hold to a few tens of metres.
 * In route order: Hotel Grand Palace 200 m behind Kudanshita, Kudan Kaikan, the Budokan deep in Kitanomaru Park, the
 * stone lighthouse opposite the shrine, the British Embassy, Hanzomon, the National Theatre and the Supreme Court
 * behind their forecourts, the Diet and its front garden's clock tower, Police headquarters on the left and the
 * Ministry of Justice on the right of Sakurada-dori, the gate and Nijubashi across the water, then Hibiya-dori's
 * frontage (Dai-ichi Seimei, the Kokusai Building and Imperial Theatre, Meiji Seimei Kan, the Yusen Building, Tokyo
 * Kaijo past Wadakura), the Palace Hotel and Mitsui & Co. facing the moats, and the Palace Side Building at Takebashi.
 */
export const TOKYO_1986_LANDMARKS: readonly PeriodLandmark[] = [
  { p: 257, side: -1, kind: 'grand-palace', clearance: 190, length: 48, depth: 34 },
  { p: 232, side: 1, kind: 'kudan-kaikan', clearance: 6, length: 70, depth: 28 },
  // The Budokan stands about 200 m into Kitanomaru Park; from Kudanzaka its roof shows over the trees.
  { p: 376, side: 1, kind: 'budokan', clearance: 120, length: 100, depth: 122 },
  { p: 409, side: 1, kind: 'kudan-lighthouse', clearance: 10, length: 9, depth: 9 },
  { p: 1520, side: -1, kind: 'british-embassy', clearance: 3, length: 182, depth: 56 },
  { p: 1812, side: 1, kind: 'hanzo-gate', clearance: 4, length: 14, depth: 60 },
  { p: 2045, side: -1, kind: 'national-theatre', clearance: 40, length: 110, depth: 50 },
  { p: 2160, side: -1, kind: 'supreme-court', clearance: 40, length: 100, depth: 50 },
  { p: 2592, side: 1, kind: 'clock-tower', clearance: 60, length: 14, depth: 16 },
  { p: 2724, side: -1, kind: 'diet', clearance: 4, length: 220, depth: 150 },
  { p: 3602, side: 1, kind: 'police', clearance: 8, length: 50, depth: 40 },
  { p: 3633, side: -1, kind: 'justice', clearance: 40, length: 96, depth: 36 },
  { p: 3772, side: 1, kind: 'sakurada-gate', clearance: 4, length: 20, depth: 70 },
  { p: 4060, side: 1, kind: 'nijubashi', clearance: 4, length: 70, depth: 70 },
  { p: 4445, side: -1, kind: 'daiichi', clearance: 7, length: 74, depth: 40 },
  { p: 4530, side: -1, kind: 'kokusai', clearance: 7, length: 84, depth: 40 },
  { p: 4790, side: -1, kind: 'meiji-seimei', clearance: 7, length: 71, depth: 40 },
  { p: 5070, side: -1, kind: 'yusen', clearance: 7, length: 46, depth: 40 },
  { p: 5240, side: -1, kind: 'kaijo', clearance: 8, length: 50, depth: 40 },
  { p: 5410, side: -1, kind: 'palace-hotel', clearance: 8, length: 100, depth: 40 },
  { p: 5620, side: -1, kind: 'mitsui-bussan', clearance: 12, length: 68, depth: 46 },
  { p: 6170, side: -1, kind: 'palace-side', clearance: 8, length: 104, depth: 30 },
];
/**
 * Where Tokyo's ground differs from its sector's district (OpenStreetMap's moats, parks and buildings sampled every
 * 20 m along the loop): the National Theatre's forecourt and the Supreme Court's grounds open on the outer side of
 * Hayabusacho; the Diet's front garden lies across the road from the Diet; Sakurada-dori runs between Kasumigaseki's
 * ministries, with no moat beside it until the Sakuradamon crossing; and Hibiya Park faces the moat from
 * Iwaida-bashi to the Hibiya crossing.
 */
export const TOKYO_1986_OVERRIDES: readonly { readonly from: number; readonly to: number; readonly side: PeriodSide; readonly district: PeriodDistrict }[] = [
  { from: 1990, to: 2215, side: -1, district: 'park' },
  { from: 2440, to: 2960, side: 1, district: 'park' },
  { from: 3199, to: 3745, side: 1, district: 'government' },
  { from: 3990, to: 4335, side: -1, district: 'park' },
];
/** Tokyo's district on one side at a lap position, its sector's unless an override covers it. */
export function tokyoDistrictAt(sector: number, p: number, side: PeriodSide): PeriodDistrict {
  const override = TOKYO_1986_OVERRIDES.find(item => item.side === side && p >= item.from && p < item.to);
  if (override) return override.district;
  const row = TOKYO_1986_DISTRICTS[sector] ?? TOKYO_1986_DISTRICTS[0]!;
  return side < 0 ? row.right : row.left;
}
/** Tokyo's footbridges and the guide signs before Kudanshita, Hanzomon, Kasumigaseki and Otemachi. */
export const TOKYO_1986_STREET: PeriodStreetPlan = { footbridges: [118, 2530, 5650, 6730], torii: 491,
  guides: [{ p: 60, sign: 0 }, { p: 1690, sign: 1 }, { p: 3090, sign: 2 }, { p: 5090, sign: 3 }, { p: 6560, sign: 7 }] };
/** Guide signs and footbridges along the Arcade roads. Yokohama's footbridge is France-bashi (1984) at Yamashita-bashi;
 * its freight viaduct is the Yamashita Rinkō line (1965, closed November 1986) along the park's road-side edge. */
export const ARCADE_1986_STREET: readonly PeriodStreetPlan[] = [
  { footbridges: [], guides: [{ p: 150, sign: 18 }, { p: 3560, sign: 18 }],
    arches: [{ p: 490, kind: 'tied-arch', span: 40, beside: -1 }, { p: 970, kind: 'tied-arch', span: 26 }, { p: 1960, kind: 'rail-girder' }],
    galleries: [{ from: 645, to: 745, kind: 'rock-shed', side: -1 }] },
  // A footbridge over Honchō 4-chōme's junction (1980s), and France-bashi (1984) at Yamashita-bashi. Past Bankoku-bashi
  // the Kisha-michi freight line crosses the road into Shinkō's yard (freight ran until 1 November 1986).
  { footbridges: [630, 3050], guides: [{ p: 2050, sign: 5 }, { p: 4560, sign: 19 }],
    arches: [{ p: 1050, kind: 'level-crossing', tracks: 2, gauge: 1.067, reach: [60, 60] }],
    galleries: [{ from: 2200, to: 3020, kind: 'viaduct', side: 1, clearance: 6.2 }],
    seaPark: { from: 2190, to: 3030, side: 1, edge: 62 } },
  { footbridges: [], guides: [{ p: 1620, sign: 6 }, { p: 2700, sign: 8 }], blossom: [[1900, 2460], [2940, 3490], [4040, 6000]] },
];
/** Rivers under the Arcade roads: the Haya-kawa at Asahi-bashi and Chitose-bashi; the canal at Shinkō-bashi and the
 * Hori-kawa under the Kariba Line's viaduct (1984) at Yamashita-bashi; the Daiya beside Shinkyō, and the Arasawa. */
export const ARCADE_1986_CROSSINGS: readonly (readonly PeriodCrossing[])[] = [
  [{ p: 490, span: 90, kind: 'gorge', half: 20 }, { p: 970, span: 90, kind: 'gorge', half: 13 }],
  [{ p: 270, span: 150, kind: 'river', half: 30 }, { p: 965, span: 150, kind: 'river', half: 15 }, { p: 1595, span: 150, kind: 'river', half: 25 },
    { p: 3100, span: 150, half: 30 }],
  [{ p: 1830, span: 150, kind: 'shinkyo' }, { p: 4567, span: 80, kind: 'gorge', half: 20 }],
];
/** The Arcade roads' landmarks at their real places (metres along the course; side 1 is the driver's left). */
export const ARCADE_1986_LANDMARKS: readonly (readonly PeriodLandmark[])[] = [[
  { p: 34, side: -1, kind: 'yumoto-station', clearance: 6, length: 64, depth: 20 },
  // Tōnosawa: Fukuzumirō on the river side, then Kansuirō at the bend and Ichinoyu across the road from it.
  { p: 1004, side: 1, kind: 'fukuzumiro', clearance: 2, length: 24, depth: 18 },
  // Kansuirō stands on the inside of a 38 m bend: set back so its corners clear the asphalt as the road turns past it.
  { p: 1092, side: 1, kind: 'kansuiro', clearance: 4, length: 24, depth: 18 },
  { p: 1100, side: -1, kind: 'ichinoyu', clearance: 2, length: 22, depth: 18 },
  { p: 6280, side: 1, kind: 'fujiya', clearance: 6, length: 64, depth: 24 },
], [
  // JNR Sakuragichō's 1927 station beside the grid, its plaza facing Benten-bashi; the Dai-Ichi Bank's colonnade and the
  // Specie Bank's dome (the prefectural museum since 1967) along Honchō-dōri; the Silk Conditioning House up the left
  // of Bankoku-bashi-dōri.
  { p: 13, side: 1, kind: 'sakuragicho-station', clearance: 25, length: 64, depth: 36 },
  { p: 524, side: 1, kind: 'daiichi-yokohama', clearance: 6, length: 40, depth: 22 },
  { p: 620, side: -1, kind: 'specie-bank', clearance: 40, length: 54, depth: 32 },
  { p: 745, side: 1, kind: 'silk-conditioning', clearance: 4, length: 120, depth: 28 },
  // Warehouse No. 2 stands back across the pier's sidings and sheds from the road down Shinkō's east side.
  { p: 1445, side: 1, kind: 'red-brick', clearance: 60, length: 150, depth: 24 },
  // The Customs' tower over the block to the right, then the Prefectural Office on Kaigan-dōri.
  { p: 1875, side: -1, kind: 'queen', clearance: 105, length: 56, depth: 40 },
  { p: 1930, side: -1, kind: 'king', clearance: 25, length: 64, depth: 40 },
  { p: 2080, side: -1, kind: 'silk-center', clearance: 8, length: 70, depth: 48 },
  { p: 2134, side: 1, kind: 'osanbashi', clearance: 4.6, length: 32, depth: 440 },
  // Hikawa Maru lies alongside Yamashita Park's sea wall, beyond its lawns.
  { p: 2689, side: 1, kind: 'liner', clearance: 65, length: 150, depth: 24 },
  { p: 2705, side: -1, kind: 'new-grand', clearance: 8, length: 62, depth: 24 },
  { p: 2843, side: -1, kind: 'marine-tower', clearance: 30, length: 24, depth: 24 },
  { p: 3175, side: -1, kind: 'bund-hotel', clearance: 6, length: 44, depth: 24 },
  { p: 7439, side: 1, kind: 'symbol-tower', clearance: 40, length: 28, depth: 28 },
], [
  // Both stations stand on the right of Route 119, the JNR station across its forecourt.
  { p: 40, side: -1, kind: 'nikko-station', clearance: 8, length: 40, depth: 22 },
  { p: 275, side: -1, kind: 'tobu-nikko-station', clearance: 6, length: 42, depth: 22 },
  { p: 805, side: 1, kind: 'nikko-city-hall', clearance: 5, length: 70, depth: 46 },
  // The old cedar leans over Route 120 just beyond the bridge.
  { p: 1900, side: -1, kind: 'taro-sugi', clearance: 1.9, length: 7, depth: 7 },
  { p: 3050, side: 1, kind: 'tamozawa-gate', clearance: 3, length: 120, depth: 54 },
]];
/** The Arcade district on one side at a progress. */
export function arcadeDistrictAt(style: number, p: number, side: PeriodSide): PeriodDistrict {
  const stretches = ARCADE_1986_STRETCHES[style] ?? ARCADE_1986_STRETCHES[0]!, at = stretches.find(item => p < item.to) ?? stretches.at(-1)!;
  return side < 0 ? at.right : at.left;
}
/** The bank factor beside an Arcade road (terrain.ts `setTerrainRelief`), eased over 160 m where two stretches meet. */
export function arcadeBankAt(style: number, p: number, side: PeriodSide): number {
  const stretches = ARCADE_1986_STRETCHES[style]; if (!stretches) return 1;
  const i = Math.max(0, stretches.findIndex(item => p < item.to)), column = side < 0 ? 0 : 1, value = (k: number) => stretches[k]!.banks[column];
  const ease = (from: number, to: number, edge: number) => { const t = clamp((p - (edge - 80)) / 160, 0, 1); return from + (to - from) * t * t * (3 - 2 * t); };
  if (i + 1 < stretches.length && p > stretches[i]!.to - 80) return ease(value(i), value(i + 1), stretches[i]!.to);
  if (i > 0 && p < stretches[i - 1]!.to + 80) return ease(value(i - 1), value(i), stretches[i - 1]!.to);
  return value(i);
}
/** The real place an Arcade course is passing, for notes and the HUD. */
export function arcadePlaceAt(style: number, p: number): string {
  const stretches = ARCADE_1986_STRETCHES[style] ?? [];
  return (stretches.find(item => p < item.to) ?? stretches.at(-1))?.place ?? '';
}
const OPEN: ReadonlySet<PeriodDistrict> = new Set(['moat', 'park', 'shrine', 'temple', 'pond', 'forest', 'quay']);

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
  // A provincial town of 1986 (Aizu's back streets, Nara, Kyoto's side streets):
  // low shop-houses, machiya and houses, with the odd small tenant building or mansion.
  town: { alley: 0.18, rows: [
    { weights: { shophouse: 30, machiya: 18, house: 22, zakkyo: 7, parking: 9, office: 5, mansion: 4, pachinko: 2, station: 3 }, clearance: [0, 0], storeys: [2, 4] },
    { weights: { house: 46, machiya: 20, shophouse: 16, mansion: 18 }, clearance: [15, 24], storeys: [2, 5] },
    { weights: { house: 52, mansion: 30, office: 18 }, clearance: [32, 50], storeys: [3, 6] },
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
  temple: { alley: 0, rows: [] },
  pond: { alley: 0, rows: [] },
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

/** Fill only forest vegetation's missing ground from a hillside. Parks, water, lots and the other road legs keep
 * their existing ground; the nearest road frame determines the district on the point's own side. */
export function periodCityForestVegetationGround(course: PeriodCityCourse,
  districtAt: (p: number, side: PeriodSide) => PeriodDistrict,
  groundHeightAt: (x: number, z: number) => number | null,
  slope: { heightAt(x: number, z: number): number; clearOfOtherLegs(x: number, z: number, p: number, margin: number): boolean },
): (x: number, z: number) => number | null {
  const frame = periodCityRouteFrame(course, 58);
  return (x, z) => {
    const ground = groundHeightAt(x, z);
    if (ground !== null) return ground;
    const at = frame(x, z);
    if (!at || at.beyond < FOREST_VERGE || at.beyond > 58 || districtAt(at.p, at.side) !== 'forest'
      || !slope.clearOfOtherLegs(x, z, at.p, 3)) return null;
    const height = slope.heightAt(x, z);
    return Number.isFinite(height) ? height : null;
  };
}

/** Where the park and moat replace the paved ground (a cut for createUrbanGround). */
/**
 * Where a forest bank (terrain.ts `createTerrain`, its first clearance) begins beyond the road edge. On the Arcade
 * courses a flat ribbon covers the ground before it; on a city route whose forests are banks (`street.forestBanks`)
 * the paving does, so a forest district keeps its paving up to here. Cut from the shoulder (1.7 m), the verge of
 * Kyoto's Keage and Aizu's forests was a 16 m hole that showed the sky dome's dusk below the horizon, and the autumn
 * understory had no ground to stand on. A hillside route (Nara) is cut from the shoulder: its slope covers the verge.
 * Lots keep off a forest's verge from the shoulder (`createPeriodCityLayout`), so the towns are placed as they were.
 */
const FOREST_BANK_START = 18;
/** Where the shoulder ends beyond the road edge, and a forest district's verge begins. */
const FOREST_VERGE = 1.7;
export function periodCityGroundCut(course: PeriodCityCourse, runs: readonly PeriodOpenRun[],
  crossings: readonly PeriodCrossing[] = [], forestBanks = false): (x: number, z: number) => boolean {
  const forestFrom = forestBanks ? FOREST_BANK_START : FOREST_VERGE;
  const cuts = runs.filter(run => run.district === 'moat' || run.district === 'park' || run.district === 'pond' || run.district === 'forest');
  if (!cuts.length && !crossings.length) return () => false;
  const frame = periodCityRouteFrame(course, MOAT.water + 48 + MOAT.batter + MOAT.platform + 8);
  // A sprint that finishes in a park or forest on a hill (Iimoriyama, Wakakusa-yama): paving past the finish
  // line would run on level with the road and read as a lake from the car. Leave that ground to the far land.
  const finish = course.poses.at(-1)!, openFinish = !course.circuit
    && cuts.some(run => run.end >= course.length - 1 && (run.district === 'forest' || run.district === 'park'));
  return (x, z) => {
    const best = frame(x, z);
    if (!best) return false;
    const { side, beyond } = best;
    if (openFinish && best.p >= course.length - 20
      && (x - finish.x) * Math.sin(finish.heading) + (z - finish.z) * Math.cos(finish.heading) > 4) return true;
    for (const crossing of crossings) {
      // The river channel, beside its own bridge only (never under another street).
      const near = course.circuit ? Math.abs(mod(best.p - crossing.p + course.length / 2, course.length) - course.length / 2) : Math.abs(best.p - crossing.p);
      if (near > 60) continue;
      const f = crossingFootprint(course, crossing), point = local(x, z, f);
      if (Math.abs(point.z) < (crossing.half ?? RIVER.half) + 1 && Math.abs(point.x) > poseAt(course, crossing.p).width + 2.5 && Math.abs(point.x) < crossing.span) return true;
    }
    // Forest districts on a city route take the Arcade's forest banks instead of paving.
    return cuts.some(run => run.side === side && best!.p >= run.start && best!.p <= run.end && beyond >= (run.district === 'forest' ? forestFrom : 3)
      && beyond <= (run.district === 'moat' ? MOAT.water + moatWidth(best!.p) + MOAT.batter + MOAT.platform : run.district === 'forest' ? 120 : run.district === 'pond' ? 90 : 64));
  };
}

/** The crossing's corridor: local X runs across the route (side +1 positive), local Z along it. */
export function crossingFootprint(course: PeriodCityCourse, crossing: PeriodCrossing): PeriodFootprint {
  const at = poseAt(course, crossing.p);
  return { x: at.x, z: at.z, yaw: at.heading, halfX: crossing.span, halfZ: (crossing.half ?? RIVER.half) + 2 };
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
  let forestVerge: (x: number, z: number) => boolean = () => false;
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
        const y = forestVerge(gx, gz) ? null : options.groundHeightAt(gx, gz);
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
  // A forest bank's verge is paved up to the bank (periodCityGroundCut) for the planting to stand on, never for lots.
  // Other routes keep their own ground there as before (a hillside's lots stand on its slope).
  const forestRuns = open.filter(run => run.district === 'forest');
  forestVerge = options.street?.forestBanks && forestRuns.length ? periodCityGroundCut(course, forestRuns, [], false) : () => false;
  const crossings = options.crossings ?? [], landmarks = options.landmarks ?? [];
  for (const crossing of crossings) { const f = crossingFootprint(course, crossing); occupied.add(f, boxOf(f)); }
  for (const landmark of landmarks) { const f = landmarkFootprint(course, landmark); occupied.add(f, boxOf(f)); }
  // A rock shed roofs the road and its verges, a viaduct's columns stand in a strip beside it, and a railway girder
  // brings its abutments and its truss: lots and planting keep clear of them all (road-structures.ts).
  const reserve = (p: number, lateral: number, halfAlong: number, halfAcross: number) => {
    const at = poseAt(course, p);
    const f = { x: at.x + Math.cos(at.heading) * lateral, z: at.z - Math.sin(at.heading) * lateral, yaw: at.heading + Math.PI / 2, halfX: halfAlong, halfZ: halfAcross };
    occupied.add(f, boxOf(f));
  };
  for (const gallery of options.street?.galleries ?? []) for (let p = gallery.from; p < gallery.to; p += 10) {
    const width = poseAt(course, p + 5).width;
    if (gallery.kind === 'rock-shed') reserve(p + 5, 0, 5.2, width + 21);
    else if (gallery.kind === 'viaduct') reserve(p + 5, gallery.side * (width + (gallery.clearance ?? 6)), 5.2, 2.7);
  }
  for (const arch of options.street?.arches ?? []) {
    const width = poseAt(course, arch.p).width;
    if (arch.kind === 'rail-girder') reserve(arch.p, -24, 4.5, width + 50);
    if (arch.kind === 'tied-arch' && arch.beside) reserve(arch.p, arch.beside * (width + 8.5), (arch.span ?? 40) / 2 + 3, 5);
    // A railway's corridor runs clear between the buildings either side of its crossing.
    if (arch.kind === 'level-crossing') {
      const [right, left] = arch.reach ?? [30, 30];
      reserve(arch.p, (left - right) / 2, (arch.tracks ?? 2) * 1.9 + 2.6, width + (left + right) / 2);
    }
  }
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
  const layout: PeriodCityLayout = { course, lots, open, crossings, landmarks, districtAt, localsAt: options.localsAt ?? (() => null),
    street: options.street ?? { footbridges: [], guides: [] }, groundHeightAt: options.groundHeightAt,
    vegetationGroundHeightAt: options.vegetationGroundHeightAt ?? options.groundHeightAt, chunkLength, chunks, stats };
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
