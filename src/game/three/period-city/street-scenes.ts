/**
 * How each street route is dressed: districts by route sector, landmarks,
 * crossings, far silhouettes, planting and light. Presentation only; the
 * native road table and physics never read any of it.
 */
import { TOKYO_1986_CROSSINGS, TOKYO_1986_DISTRICTS, TOKYO_1986_LANDMARKS, TOKYO_1986_STREET,
  type PeriodCrossing, type PeriodDistrict, type PeriodLandmark, type PeriodLocals, type PeriodSide, type PeriodStreetPlan } from './layout';
import { farLand, type FarLandPlan } from './far-land';
import { AIZU_WAKAMATSU_1986_LAND } from './generated/aizu-wakamatsu-1986-land';
import { IROHAZAKA_1986_LAND } from './generated/irohazaka-1986-land';
import { NARA_1986_LAND } from './generated/nara-1986-land';
import { buildLandmark } from './landmarks';
import { mountain, type PeriodDistant } from './skyline';
import { guideIndex, type SIGN_REGIONS } from './signs';

/** Light over a route. Daylight runs 0 night, .45 dusk, 1 sunrise. */
export interface StreetSceneMood {
  readonly night: 'mountain' | 'harbor' | 'city';
  readonly stars: number;
  /** Road wetness when dry. */
  readonly damp: number;
  readonly lamp: string;
  /** Daylight at the start of each soundtrack chapter and at the finish, or
   * Tokyo's night-to-sunrise arc. */
  readonly daylight: readonly number[] | 'dawn-arc';
  /** Compass bearing (degrees) toward the low sun of a late-day route, its true late-afternoon bearing. By afternoon
   * light (daylight 0.9 and up) the key light and the painted sun stand there, easing back to the dusk key below 0.6
   * (world.ts): the climbs that head into it drive toward a golden sky, and the streets that head away from it are lit
   * gold from behind under a rose and violet sky. Absent: Tokyo's sunrise bearing. */
  readonly sun?: number;
  /** Degrees above the horizon for the painted low sun, for a route whose own hills stand higher toward the sun than
   * world.ts's low sun on the horizon. Absent: the low sun on the horizon. */
  readonly sunHeight?: number;
  /** Share of upper and ground-floor windows lit at dusk (0–1), for a town whose cutscenes light nearly every room by
   * evening, as the repaints of Gion's machiya and Aizu's merchant streets do. world.ts lifts the dusk window lights
   * toward it, easing back to the night's own share. Absent: the period city's dusk share. */
  readonly windows?: number;
}
export interface StreetScene {
  /** 3 lays the period city's paved ground; 0–2 borrow an Arcade landscape's
   * forest banks, planting and guard rails. */
  readonly style: 0 | 1 | 2 | 3;
  /** 'slope' replaces the banks with one hillside for a road that folds back on itself. */
  readonly terrain?: 'slope';
  /** Districts right and left of the road, indexed by the route's `sector`. */
  readonly districts: readonly { readonly right: PeriodDistrict; readonly left: PeriodDistrict }[];
  readonly crossings: readonly PeriodCrossing[];
  readonly landmarks: readonly PeriodLandmark[];
  readonly street?: PeriodStreetPlan;
  /** Far silhouettes, in render metres from the route's origin (X west, Z north). */
  readonly distant: readonly PeriodDistant[];
  /** Tokyo's 1986 skyline towers at their real bearings. */
  readonly tokyoSkyline: boolean;
  readonly snow: number;
  /** Flowering cherries or autumn maples along the listed sectors: on the
   * left-hand curb only (Tokyo's moat side), or on both sides. */
  readonly trees?: { readonly kind: 'sakura' | 'momiji'; readonly sectors: readonly number[]; readonly bothSides: boolean };
  /** Regional shop signs; absent keeps the whole original atlas (Tokyo). */
  readonly signs?: keyof typeof SIGN_REGIONS;
  /** People and animals found only on this route, by sector (people.ts). */
  readonly locals?: readonly (PeriodLocals & { readonly sectors: readonly number[] })[];
  readonly mood: StreetSceneMood;
}

const TOKYO: StreetScene = {
  style: 3, districts: TOKYO_1986_DISTRICTS, crossings: TOKYO_1986_CROSSINGS, landmarks: TOKYO_1986_LANDMARKS,
  street: TOKYO_1986_STREET, distant: [], tokyoSkyline: true, snow: 0, trees: { kind: 'sakura', sectors: [2], bothSides: false },
  mood: { night: 'city', stars: .5, damp: .6, lamp: '#ffb065', daylight: 'dawn-arc' },
};

const forest = { right: 'forest', left: 'forest' } as const;
const sky = (origin: { lat: number; lon: number }, lat: number, lon: number, y: number, build: PeriodDistant['build'], hideWithin = 0): PeriodDistant =>
  ({ ...realBearing(origin, lat, lon), y, build, hideWithin });
/** Curve boards on the outside of each of the Second Irohazaka's twenty bends,
 * 20 m before the apex (positions from the research table). Curve た was opened
 * on 2026-10-29, which moved its apex and shortened the road after it by 18 m. */
const IROHAZAKA_CURVES: readonly (readonly [string, number, PeriodSide])[] = [
  ['い', 790, 1], ['ろ', 900, -1], ['は', 1259, 1], ['に', 1919, -1], ['ほ', 2179, 1], ['へ', 2989, -1], ['と', 3234, 1],
  ['ち', 3494, -1], ['り', 3698, 1], ['ぬ', 3918, -1], ['る', 4048, 1], ['を', 4233, -1], ['わ', 4318, 1], ['か', 4518, -1],
  ['よ', 4718, 1], ['た', 4898, -1], ['れ', 4995, 1], ['そ', 5730, 1], ['つ', 5895, 1], ['ね', 6129, -1],
];

/** The Second Irohazaka, Umagaeshi to Akechidaira: an autumn-coloured climb
 * through forest, its bridges over the Daiya gorge, with Nantai-san to the north-west. */
const IROHAZAKA_ORIGIN = { lat: 36.7387631, lon: 139.5272846 };
/** The mountains round the climb (far-land.ts): the Daiya valley falling east to Nikko and the ranges beyond, fading
 * into a blue-violet haze so they step back ridge by ridge, as the cutscene-style repaints of the hairpins paint them.
 * Without it the valley side showed the sky's own lower half, a flat pink sheet below the guard wall. */
const IROHAZAKA_LAND: FarLandPlan = {
  origin: IROHAZAKA_ORIGIN, grid: IROHAZAKA_1986_LAND, floor: 700,
  towns: [
    { lat: 36.7500, lon: 139.6050, rx: 1800, rz: 900, lit: .7 },    // Nikko, from the shrines down to the stations
    { lat: 36.7370, lon: 139.5650, rx: 700, rz: 350, lit: .5 },     // Kiyotaki and the Furukawa works
  ],
  roads: [[[36.7387, 139.5273], [36.7370, 139.5670], [36.7535, 139.6034], [36.7476, 139.6197]]],   // Route 120 down to Nikko
  parks: [], grass: [],
  light: 245, haze: { away: '#7a6c9c', toward: '#7a6c9c', metres: 3000 },
  // The mountainsides the road climbs between, crown by crown in autumn colour and at afternoon brightness.
  autumn: .6, canopy: true, dayGain: 2.5,
};
const IROHAZAKA: StreetScene = {
  style: 2, terrain: 'slope',
  districts: [{ right: 'rural', left: 'forest' }, forest, forest, forest, forest, forest,
    { right: 'forest', left: 'park' }, forest, forest, forest, { right: 'rural', left: 'forest' }],
  crossings: [{ p: 168, span: 80, kind: 'gorge', half: 30 }, { p: 654, span: 60, kind: 'gorge', half: 22 }],
  landmarks: [],
  street: { footbridges: [], guides: [{ p: 60, sign: guideIndex('中禅寺湖') }],
    markers: IROHAZAKA_CURVES.map(([text, p, side]) => ({ p: p - 20, side, text })),
    // Fallen maple leaves wherever the maples stand (`trees`: sectors 0-10, the whole climb).
    // Nikko's mountain roads run through cedar plantations and mixed forest, the cedars dark among the maples.
    // Gold leaves and thick kerb drifts through the afternoon chapters; the last chapter's dusk at Akechidaira keeps them
    // crimson and sparse (its repaint's dusk road is dark).
    litter: [[0, 7170]], cedars: [[0, 7170]], autumn: true, afternoonLeaves: { gold: .2, drifts: 12, until: 5730 } },
  // Nantai-san and Nyohō-san stand in the far land's own elevation grid, hazed by distance behind the nearer ridges; the
  // cone silhouettes they replaced filled the sky as one flat dark slab low on the climb.
  distant: [farLand(IROHAZAKA_LAND)],
  tokyoSkyline: false, snow: 0,
  trees: { kind: 'momiji', sectors: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bothSides: true },
  signs: 'nikko',
  // Macaque troops sit by the road all the way up, most of all at the Kurokamidaira rest area and Akechidaira.
  locals: [{ kind: 'monkeys', sectors: [0, 1, 2, 3, 4, 5, 7, 8], density: .02 }, { kind: 'monkeys', sectors: [6, 9], density: .08 },
    { kind: 'monkeys', sectors: [10], density: .2 }],
  // A wet evening (damp .75), so the dusk at Akechidaira stays dark between its lamps' streaks as the repaint paints it
  // (measured: .318 -> .252); by afternoon light the renderer dries the road toward its sunrise wetness, so the golden
  // climb stays dry (its frames unchanged).
  mood: { night: 'mountain', stars: .7, damp: .75, lamp: '#ffb468', daylight: [1, .97, .94, .9, .78, .52], sun: 245,
    // A mid-afternoon sun, about 9 degrees up: hidden behind the valley's ridges low on the climb, as it is in life, and
    // over them higher up, where the repaints set it.
    sunHeight: 9 },
};

/** Aizu-Wakamatsu: the station's merchant streets, Tsuruga-jō across its moats,
 * then up the wooded flank of Iimoriyama with Bandai-san beyond. */
const AIZU_ORIGIN = { lat: 37.5068315, lon: 139.9311888 };
/** The Aizu basin as the Byakkotai saw it from Iimoriyama (far-land.ts): 1986 Aizu-Wakamatsu round the dark castle
 * grounds, Kitakata and the villages over the harvested paddies, Bandai-san to the north-east. */
const AIZU_LAND: FarLandPlan = {
  origin: AIZU_ORIGIN, grid: AIZU_WAKAMATSU_1986_LAND, floor: 240,
  towns: [
    { lat: 37.4970, lon: 139.9280, rx: 1600, rz: 1500 },             // the station, Nanokamachi and the castle town
    { lat: 37.4750, lon: 139.9250, rx: 1300, rz: 1000, lit: .6 },    // Monden, south of the castle
    { lat: 37.5050, lon: 139.9050, rx: 1000, rz: 900, lit: .6 },     // west of the station
    { lat: 37.5200, lon: 139.9300, rx: 1000, rz: 700, lit: .5 },     // north along Route 121
    { lat: 37.4790, lon: 139.9630, rx: 400, rz: 300, lit: .7 },      // Higashiyama Onsen in its valley
    { lat: 37.6510, lon: 139.8740, rx: 1400, rz: 1200, lit: .8 },    // Kitakata
    { lat: 37.5880, lon: 139.9040, rx: 600, rz: 500, lit: .5 },      // Shiokawa
    { lat: 37.5610, lon: 139.8220, rx: 900, rz: 800, lit: .6 },      // Aizu-Bange
    { lat: 37.4710, lon: 139.8300, rx: 700, rz: 600, lit: .5 },      // Aizu-Takada
  ],
  roads: [
    [[37.505, 140.0], [37.505, 139.955], [37.505, 139.93], [37.53, 139.89], [37.56, 139.82], [37.58, 139.75]],                 // Route 49, over the pass from Inawashiro
    [[37.68, 139.87], [37.65, 139.875], [37.59, 139.90], [37.53, 139.92], [37.50, 139.93], [37.44, 139.935], [37.39, 139.94]], // Route 121, Kitakata to the south
    [[37.49, 139.92], [37.47, 139.83]],                                                                                          // the road west to Aizu-Takada
  ],
  parks: [{ lat: 37.4876, lon: 139.9298, rx: 450, rz: 400 }],   // Tsuruga-jō's grounds and moats
  grass: [],
  autumn: .5,
};
const AIZU: StreetScene = {
  style: 3,
  districts: [
    { right: 'town', left: 'town' }, { right: 'nikko', left: 'nikko' }, { right: 'town', left: 'town' },
    { right: 'town', left: 'town' }, { right: 'town', left: 'town' },
    { right: 'moat', left: 'town' }, { right: 'moat', left: 'government' }, { right: 'park', left: 'town' },
    { right: 'temple', left: 'town' }, { right: 'temple', left: 'town' }, { right: 'forest', left: 'town' },
    { right: 'rural', left: 'town' }, { right: 'rural', left: 'forest' },
  ],
  crossings: [],
  // The keep stands 276 m inside its moats at the nearest, so it is drawn as a
  // far silhouette (unfogged, like the cutscenes' distant shapes) the whole way.
  landmarks: [],
  // Fallen maple leaves under the maples (`trees`: sectors 9-12, the climb up Iimoriyama).
  street: { footbridges: [], guides: [{ p: 900, sign: guideIndex('鶴ヶ城') }, { p: 5880, sign: guideIndex('飯盛山') }], litter: [[5947, 8057]],
    // Iimoriyama's flank, where the Byakkotai graves stand under old cedars.
    // Its forests rise as banks beside the road (no shared hillside), so their verges hold only the understory.
    cedars: [[6932, 8057]], autumn: true, forestBanks: true },
  // From the finish on Iimoriyama the keep is still there, as the Byakkotai looked back to it.
  distant: [farLand(AIZU_LAND), sky(AIZU_ORIGIN, 37.6012, 140.0723, 230, mountain(1586, 9000, 1.01, '#4a5a72', '#e8e6ee')),
    sky(AIZU_ORIGIN, 37.48775, 139.92980, 220, (b, random) => buildLandmark(b, 'tsuruga-keep', random))],
  tokyoSkyline: false, snow: 0,
  trees: { kind: 'momiji', sectors: [9, 10, 11, 12], bothSides: true },
  signs: 'aizu',
  // A wet evening (damp .75): the renderer's dusk-road dim reaches near full, so the road stays dark between its streaks,
  // as the repaints paint Aizu's streets (measured: the station street .238 -> .198).
  mood: { night: 'mountain', stars: .4, damp: .75, lamp: '#ffb065', daylight: [.6, .55, .5, .46, .42, .38], windows: .9 },
};

/** Kyoto: Shiokōji, Karasuma and Shijō past Gion to Yasaka, Sanjō to Keage,
 * under Heian Jingū's great torii, and back by Marutamachi and Horikawa. */
const KYOTO_ORIGIN = { lat: 34.9871862, lon: 135.758451 };
const KYOTO: StreetScene = {
  style: 3,
  districts: [
    { right: 'office', left: 'office' }, { right: 'kanda', left: 'temple' }, { right: 'office', left: 'office' },
    { right: 'kanda', left: 'kanda' }, { right: 'kanda', left: 'kanda' }, { right: 'nikko', left: 'nikko' },
    { right: 'park', left: 'kanda' }, { right: 'nikko', left: 'nikko' }, { right: 'forest', left: 'town' },
    { right: 'park', left: 'town' }, { right: 'park', left: 'park' }, { right: 'kanda', left: 'town' },
    { right: 'kanda', left: 'kanda' }, { right: 'park', left: 'kanda' }, { right: 'moat', left: 'town' },
    { right: 'office', left: 'office' }, { right: 'temple', left: 'kanda' }, { right: 'office', left: 'office' },
  ],
  crossings: [{ p: 3012, span: 120, kind: 'river', half: 30 }, { p: 7548, span: 120, kind: 'river', half: 30 }],
  landmarks: [
    { p: 50, side: -1, kind: 'kyoto-station-1952', clearance: 5, length: 160, depth: 100 },
    { p: 149, side: 1, kind: 'kyoto-tower', clearance: 32, length: 60, depth: 40 },
    // Higashi Honganji: the Amida-dō, the great gate on Karasuma, and the Goei-dō behind it.
    { p: 428, side: 1, kind: 'honganji-amidado', clearance: 113, length: 56, depth: 51 },
    { p: 539, side: 1, kind: 'nandaimon', clearance: 56, length: 34, depth: 18 },
    { p: 586, side: 1, kind: 'honganji-goeido', clearance: 124, length: 80, depth: 62 },
    // Minami-za, its lot running back across Kawabata-dōri to the river so the bridge sees it.
    { p: 3082, side: -1, kind: 'minamiza', clearance: 10, length: 76, depth: 42 },
    { p: 3554, side: -1, kind: 'yasaka-gate', clearance: 30, length: 22, depth: 20 },
    { p: 5274, side: 1, kind: 'keage-power', clearance: 11, length: 62, depth: 22 },
    { p: 6065, side: -1, kind: 'kyoto-museum', clearance: 40, length: 112, depth: 72 },
    { p: 6173, side: -1, kind: 'otenmon', clearance: 188, length: 32, depth: 13 },
    { p: 9832, side: -1, kind: 'sakurada-gate', clearance: 4, length: 20, depth: 70 },
    // Nishi Honganji on Horikawa: the Goei-dō and, on the street, its gate.
    { p: 12161, side: -1, kind: 'nishi-goeido', clearance: 111, length: 66, depth: 52 },
    { p: 12215, side: -1, kind: 'nandaimon', clearance: 14, length: 34, depth: 14 },
  ],
  street: { footbridges: [], guides: [{ p: 1880, sign: guideIndex('四条通') }, { p: 2840, sign: guideIndex('祇園') },
    { p: 4800, sign: guideIndex('蹴上') }, { p: 8000, sign: guideIndex('京都御所') }, { p: 11900, sign: guideIndex('京都駅') }],
    arches: [{ p: 6038, kind: 'heian-torii' }],
    // Fallen maple leaves under the maples (`trees`: sectors 8-10, Keage to Okazaki and the great torii).
    litter: [[4844, 6528]], autumn: true, forestBanks: true },
  distant: [sky(KYOTO_ORIGIN, 34.9806, 135.7476, 25, (b, random) => buildLandmark(b, 'pagoda-toji', random)),
    sky(KYOTO_ORIGIN, 34.98755, 135.75933, 28, (b, random) => buildLandmark(b, 'kyoto-tower', random), 420),
    // Yasaka's pagoda (Hōkan-ji) rises over Higashiyama's roofs south of the shrine.
    sky(KYOTO_ORIGIN, 34.99868, 135.78091, 50, (b, random) => buildLandmark(b, 'pagoda-yasaka', random)),
    sky(KYOTO_ORIGIN, 35.0670, 135.8358, 50, mountain(800, 4500, 1.01, '#3e4a5a', '#e8e6ee'))],
  tokyoSkyline: false, snow: 0,
  trees: { kind: 'momiji', sectors: [8, 9, 10], bothSides: true },
  signs: 'kyoto',
  // Maiko walk between the ochaya of Gion, and a few cross Shijō Ōhashi or turn up Higashiōji.
  locals: [{ kind: 'maiko', sectors: [5], density: .35 }, { kind: 'maiko', sectors: [4], density: .12 }, { kind: 'maiko', sectors: [3, 6], density: .05 }],
  mood: { night: 'city', stars: .3, damp: .55, lamp: '#ffb065', daylight: [.55, .5, .45, .4, .32, .22], windows: .9 },
};

/** Nara: Sanjō-dōri from the JNR station past Sarusawa-ike and Kōfuku-ji's
 * pagoda, Nara Park and Daibutsu-ike, then the Wakakusa-yama driveway's
 * switchbacks to the summit. */
const NARA_ORIGIN = { lat: 34.6819736, lon: 135.8189031 };
/** The basin below the driveway and the summit, out to the Ikoma ridge (far-land.ts): 1986 Nara, its western new
 * towns, Kōriyama and Tenri, the main roads, with Nara Park and the Heijō palace site dark between them. */
const NARA_LAND: FarLandPlan = {
  origin: NARA_ORIGIN, grid: NARA_1986_LAND, floor: 95,
  towns: [
    { lat: 34.6825, lon: 135.8250, rx: 1500, rz: 1300 },             // the old town and both stations
    { lat: 34.6660, lon: 135.8180, rx: 1200, rz: 1000, lit: .7 },    // Kyōbate and Ōmori
    { lat: 34.6980, lon: 135.8150, rx: 1000, rz: 600, lit: .6 },     // Hokke-ji, under the Sahoyama hills
    { lat: 34.6860, lon: 135.8050, rx: 900, rz: 600, lit: .8 },      // Shin-Ōmiya on Ōmiya-dōri
    { lat: 34.6935, lon: 135.7825, rx: 800, rz: 700, lit: .8 },      // Saidaiji
    { lat: 34.6950, lon: 135.7550, rx: 1400, rz: 1100, lit: .6 },    // Gakuen-mae and Tomigaoka, the new towns on the western hills
    { lat: 34.6495, lon: 135.7830, rx: 1300, rz: 1300, lit: .8 },    // Yamato-Kōriyama
    { lat: 34.5965, lon: 135.8370, rx: 1200, rz: 1100, lit: .7 },    // Tenri
    { lat: 34.6200, lon: 135.7500, rx: 1000, rz: 900, lit: .4 },     // Koizumi, toward Hōryū-ji
    { lat: 34.7250, lon: 135.7900, rx: 800, rz: 600, lit: .5 },      // the Heijō new town on the northern hills
    { lat: 34.7350, lon: 135.8200, rx: 900, rz: 600, lit: .4 },      // Kizu, across the prefecture line
    { lat: 34.5300, lon: 135.7900, rx: 1500, rz: 1300, lit: .5 },    // Tawaramoto and Kashihara, far to the south
  ],
  roads: [
    [[34.78, 135.815], [34.72, 135.815], [34.69, 135.818], [34.66, 135.815], [34.62, 135.822], [34.597, 135.835], [34.55, 135.83]], // Route 24, Kyoto to Tenri
    [[34.684, 135.835], [34.684, 135.80], [34.69, 135.78], [34.695, 135.74]],    // Ōmiya-dōri, west toward the hills
    [[34.68, 135.815], [34.65, 135.783], [34.62, 135.735]],                        // Route 25 to Kōriyama and Hōryū-ji
    [[34.68, 135.835], [34.62, 135.845], [34.597, 135.84]],                         // the road south under the eastern hills
  ],
  parks: [
    { lat: 34.6860, lon: 135.8420, rx: 900, rz: 900 },   // Nara Park, Tōdai-ji and Kasuga Taisha
    { lat: 34.6920, lon: 135.7925, rx: 650, rz: 600 },   // the Heijō palace site, open fields in 1986
  ],
  grass: [{ lat: 34.6905, lon: 135.8512, rx: 640, rz: 360 }],   // Wakakusa-yama's lawns, from its foot to the summit
  autumn: .4, light: 240, haze: { away: '#8478a6', toward: '#d99a7c', metres: 9000 },
};
const NARA: StreetScene = {
  style: 3, terrain: 'slope',
  districts: [
    { right: 'town', left: 'town' }, { right: 'nikko', left: 'town' }, { right: 'pond', left: 'temple' },
    { right: 'nikko', left: 'temple' }, { right: 'park', left: 'temple' }, { right: 'park', left: 'government' },
    { right: 'pond', left: 'town' }, { right: 'forest', left: 'town' }, forest,
    { right: 'forest', left: 'onsen' }, forest, { right: 'park', left: 'forest' },
  ],
  crossings: [],
  landmarks: [
    { p: 73, side: -1, kind: 'nara-station', clearance: 12, length: 42, depth: 20 },
    { p: 1221, side: 1, kind: 'pagoda-kofukuji', clearance: 40, length: 20, depth: 20 },
    { p: 1448, side: -1, kind: 'kasuga-torii', clearance: 11, length: 11, depth: 3 },
    { p: 2433, side: -1, kind: 'daibutsuden', clearance: 270, length: 62, depth: 56 },
  ],
  // Fallen maple leaves under the maples (`trees`: sectors 1-11, Sarusawa-ike to the summit).
  street: { footbridges: [], guides: [{ p: 520, sign: guideIndex('奈良公園') }, { p: 1560, sign: guideIndex('東大寺') }], litter: [[1310, 6225]],
    afternoonLeaves: { gold: .2, drifts: 12 },
    // The driveway's climb through the Kasuga hill forest, cedars among its old broadleaves.
    cedars: [[2785, 5580]], autumn: true },
  // From the summit the city lies below: the Great Buddha Hall and Kōfuku-ji's pagoda, the Ikoma ridge beyond.
  distant: [farLand(NARA_LAND), sky(NARA_ORIGIN, 34.6781, 135.6786, 80, mountain(560, 9000, 1.01, '#4a5468', '#e8e6ee')),
    sky(NARA_ORIGIN, 34.68899, 135.83987, 100, (b, random) => buildLandmark(b, 'daibutsuden', random), 520),
    sky(NARA_ORIGIN, 34.68248, 135.83223, 90, (b, random) => buildLandmark(b, 'pagoda-kofukuji', random), 450),
    // Farther out over the basin: Yakushi-ji's two pagodas (the west one rebuilt in 1981), Nara Dreamland's
    // castle on the Sahoyama hills (1961–2006), and the broadcast towers along the Ikoma ridge.
    sky(NARA_ORIGIN, 34.6686, 135.7849, 63, (b, random) => buildLandmark(b, 'pagoda-yakushiji', random)),
    sky(NARA_ORIGIN, 34.6686, 135.784, 64, (b, random) => buildLandmark(b, 'pagoda-yakushiji-west', random)),
    sky(NARA_ORIGIN, 34.699444, 135.8225, 117, (b, random) => buildLandmark(b, 'dreamland-castle', random)),
    sky(NARA_ORIGIN, 34.6781, 135.6786, 621, (b, random) => buildLandmark(b, 'ikoma-towers', random))],
  tokyoSkyline: false, snow: 0,
  // From the Kasuga approach up: along Sanjō-dōri and Sarusawa-ike the view stays open to Kōfuku-ji's pagoda over the
  // temple wall and to the pond, as the cutscene and its repaint show them (roadside crowns hid the pagoda).
  trees: { kind: 'momiji', sectors: [3, 4, 5, 6, 7, 8, 9, 10, 11], bothSides: true },
  signs: 'nara',
  // Deer roam from Sanjō-dōri by Kōfuku-ji through the park to Tōdai-ji, a few in the hill forest, and graze the summit lawns.
  locals: [{ kind: 'deer', sectors: [1], density: .05 }, { kind: 'deer', sectors: [2, 3, 4, 5, 6], density: .15 }, { kind: 'deer', sectors: [7], density: .08 },
    { kind: 'deer', sectors: [8, 9, 10], density: .03 }, { kind: 'deer', sectors: [11], density: .12 }],
  mood: { night: 'mountain', stars: .5, damp: .12, lamp: '#ffb468', daylight: [.96, .93, .9, .9, .93, .97], sun: 240 },
};

const SCENES: Readonly<Record<string, StreetScene>> = { 'tokyo-1986': TOKYO, 'irohazaka-1986': IROHAZAKA, 'aizu-wakamatsu-1986': AIZU, 'kyoto-1986': KYOTO, 'nara-1986': NARA };

/** The scene for a street route, if it has one. */
export function streetScene(id: string): StreetScene | undefined {
  return SCENES[id];
}

/** Metres west (x) and north (z) of `origin` for a real place, as the skyline places Tokyo's towers. */
export function realBearing(origin: { readonly lat: number; readonly lon: number }, lat: number, lon: number): { x: number; z: number } {
  const east = 111320 * Math.cos(origin.lat * Math.PI / 180);
  return { x: -(lon - origin.lon) * east, z: (lat - origin.lat) * 110574 };
}
