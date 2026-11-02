import { LIVERIES } from './rules';
import type { Bilingual } from './story';

/**
 * 1986 cars and how each is built: its body, paint, wheels, aero, stance and extras. A build is presentation only. It
 * never reaches the driving model, RaceV1, proofs or hit boxes: every body races on the same 3.9 m by 1.62 m car,
 * performance comes from the garage tech tree. Live XOR races race RaceV1's equal car; a racer's build only changes how
 * the others draw it (a signed cosmetic, network/appearance.ts).
 */
export const BODY_IDS = ['hachiroku', 'kakeru', 'hokuto', 'mikazuki', 'raimei', 'hibari'] as const;
export type BodyId = typeof BODY_IDS[number];
export const WHEEL_STYLES = ['stock', 'hachi', 'mesh', 'dish', 'star', 'disc', 'steel'] as const;
export type WheelStyle = typeof WHEEL_STYLES[number];
export const WHEEL_COLOURS = ['silver', 'gold', 'white', 'black', 'bronze', 'gunmetal'] as const;
export type WheelColour = typeof WHEEL_COLOURS[number];
export const LOWER_TONES = ['stock', 'body', 'black', 'grey', 'silver', 'gold', 'white'] as const;
export type LowerTone = typeof LOWER_TONES[number];
export const STRIPES = ['none', 'pin', 'twin', 'fade', 'group-a'] as const;
export type Stripe = typeof STRIPES[number];
export const STRIPE_COLOURS = ['white', 'black', 'red', 'gold', 'blue', 'pink', 'teal', 'orange'] as const;
export type StripeColour = typeof STRIPE_COLOURS[number];
export const FRONT_AERO = ['stock', 'lip', 'deppa'] as const;
export type FrontAero = typeof FRONT_AERO[number];
export const SPOILERS = ['stock', 'ducktail', 'wing', 'roof'] as const;
export type Spoiler = typeof SPOILERS[number];
export const FENDERS = ['stock', 'flares'] as const;
export type Fenders = typeof FENDERS[number];
export const STANCES = ['stock', 'low', 'oni', 'rally'] as const;
export type Stance = typeof STANCES[number];
export const LAMPS = ['none', 'fog', 'rally'] as const;
export type Lamps = typeof LAMPS[number];
export const EXHAUSTS = ['stock', 'sport', 'takeyari'] as const;
export type Exhaust = typeof EXHAUSTS[number];
export const MIRRORS = ['stock', 'fender'] as const;
export type Mirrors = typeof MIRRORS[number];
/** Window film: the factory glass, light or dark smoke, or a gold mirror film. */
export const TINTS = ['stock', 'light', 'dark', 'gold'] as const;
export type Tint = typeof TINTS[number];
/** Headlamp bulbs: white, or the yellow bulbs of the period's night runners. */
export const HEADLIGHTS = ['white', 'yellow'] as const;
export type Headlights = typeof HEADLIGHTS[number];
export const TAILS = ['stock', 'smoked'] as const;
export type Tails = typeof TAILS[number];
/** Underglow neon tubes, lighting the road under the car after dark. */
export const NEONS = ['none', 'pink', 'cyan', 'purple', 'green', 'orange'] as const;
export type Neon = typeof NEONS[number];
export const BONNETS = ['stock', 'scoop', 'vents', 'black'] as const;
export type Bonnet = typeof BONNETS[number];
/** A roof rack, or the ski carrier of the late-80s ski boom. */
export const ROOFS = ['none', 'rack', 'skis'] as const;
export type Roof = typeof ROOFS[number];
/** Lip, deppa, skirts and wing in black plastic or painted to match. */
export const AERO_COLOURS = ['black', 'body'] as const;
export type AeroColour = typeof AERO_COLOURS[number];
/** Racing numbers: 0 for none, else 1 to 99 on a roundel on each side. */
export const MAX_RACE_NUMBER = 99;

export interface CarBuild {
  readonly body: BodyId;
  /** A PAINTS id. */
  readonly paint: string;
  /** The lower body below the side moulding: 'stock' keeps the body's factory scheme, 'body' paints it all one colour. */
  readonly lower: LowerTone;
  readonly stripe: Stripe; readonly stripeColour: StripeColour;
  readonly wheels: WheelStyle; readonly wheelColour: WheelColour;
  readonly front: FrontAero; readonly skirts: boolean; readonly spoiler: Spoiler; readonly fenders: Fenders;
  readonly stance: Stance; readonly lamps: Lamps; readonly louvers: boolean; readonly exhaust: Exhaust; readonly mirrors: Mirrors;
  readonly tint: Tint; readonly headlights: Headlights; readonly tails: Tails; readonly neon: Neon;
  readonly bonnet: Bonnet; readonly roof: Roof; readonly number: number; readonly aeroColour: AeroColour;
  /** The SORA club banner across the top of the windscreen (ハチマキ). */
  readonly banner: boolean;
}
/** The first build format's keys (November 1, 2026), in its stored and signed order. */
export const BUILD_KEYS_V1 = ['body', 'paint', 'lower', 'stripe', 'stripeColour', 'wheels', 'wheelColour', 'front', 'skirts', 'spoiler',
  'fenders', 'stance', 'lamps', 'louvers', 'exhaust', 'mirrors'] as const satisfies readonly (keyof CarBuild)[];
/** Key order is the stored and replayed order: the first format's keys, then those added after it. */
export const BUILD_KEYS = [...BUILD_KEYS_V1, 'tint', 'headlights', 'tails', 'neon', 'bonnet', 'roof', 'number', 'aeroColour', 'banner'] as const satisfies readonly (keyof CarBuild)[];
/** What a build from before an option existed reads as: the factory part. */
export const BUILD_ADDITIONS = { tint: 'stock', headlights: 'white', tails: 'stock', neon: 'none', bonnet: 'stock', roof: 'none', number: 0,
  aeroColour: 'black', banner: false } as const satisfies Omit<CarBuild, typeof BUILD_KEYS_V1[number]>;

export interface BodyInfo {
  readonly id: BodyId; readonly name: Bilingual; readonly kind: Bilingual; readonly blurb: Bilingual;
  /** The sky kanji the garage paints behind the car. */
  readonly mark: string;
  /** The wheels, lower body and mirrors the factory fits. */
  readonly stockWheels: Exclude<WheelStyle, 'stock'>; readonly stockLower: Exclude<LowerTone, 'stock'>;
  readonly stockMirrors: 'door' | 'fender';
  /** A factory rear spoiler the 'stock' choice keeps (none: a clean tail). */
  readonly stockSpoiler: Exclude<Spoiler, 'stock'> | 'none';
}
/**
 * Original SORA designs after the period's archetypes, each named for SORA's sky (空): the heavens, soaring, the Big
 * Dipper, the crescent moon, thunder and the skylark. Only the hachiroku is a licensed model of a real car. Names keep
 * clear of the period's warplanes (疾風, 雷電, 流星 and the like).
 */
export const BODIES: readonly BodyInfo[] = [
  { id: 'hachiroku', mark: '天', name: { ja: '天空86', en: 'TENKU 86' }, kind: { ja: 'FR・3ドアハッチ', en: 'FR THREE-DOOR HATCH' },
    blurb: { ja: '天空（てんくう）、どこまでも続く空。SORAの仲間のハチロクは、軽い車体と素直な後輪駆動で峠を駆ける。',
      en: 'Tenku: the open heavens. The SORA crew’s hachiroku, a light body and honest rear drive, made for the mountain passes.' },
    stockWheels: 'hachi', stockLower: 'black', stockMirrors: 'door', stockSpoiler: 'none' },
  { id: 'kakeru', mark: '翔', name: { ja: '翔 MR', en: 'KAKERU MR' }, kind: { ja: 'ミッドシップ・ウェッジ', en: 'MIDSHIP WEDGE' },
    blurb: { ja: '翔（かける）、空へ舞い上がる。くさび形の二人乗り。リトラクタブルを上げて、夜の峠へ。',
      en: 'Kakeru: to soar. A mid-engined two-seat wedge. Raise the pop-ups and climb into the night pass.' },
    stockWheels: 'dish', stockLower: 'grey', stockMirrors: 'door', stockSpoiler: 'ducktail' },
  { id: 'hokuto', mark: '星', name: { ja: '北斗 GT', en: 'HOKUTO GT' }, kind: { ja: 'ロングノーズGT', en: 'LONG-NOSE GT' },
    blurb: { ja: '北斗（ほくと）、夜空の北斗七星。長いボンネットにターボの直6。星の下、高速道路を夜通し走る。',
      en: 'Hokuto: the Big Dipper. A long bonnet over a turbo straight six, cruising the expressway all night beneath the stars.' },
    stockWheels: 'disc', stockLower: 'grey', stockMirrors: 'door', stockSpoiler: 'none' },
  { id: 'mikazuki', mark: '月', name: { ja: '三日月 RE', en: 'MIKAZUKI RE' }, kind: { ja: 'ロータリー・クーペ', en: 'ROTARY COUPE' },
    blurb: { ja: '三日月（みかづき）、細い月。月のように弧を描くガラスハッチに、甲高いロータリーの歌。',
      en: 'Mikazuki: the crescent moon. A glass hatch curved like the new moon, and the high song of a rotary.' },
    stockWheels: 'star', stockLower: 'body', stockMirrors: 'door', stockSpoiler: 'ducktail' },
  { id: 'raimei', mark: '雷', name: { ja: '雷鳴ターボ', en: 'RAIMEI TURBO' }, kind: { ja: '4ドア・ハードトップ', en: 'FOUR-DOOR HARDTOP' },
    blurb: { ja: '雷鳴（らいめい）、空にとどろく雷。角張ったハードトップに、雷のように吠えるターボの直6。',
      en: 'Raimei: a thunderclap. A square-cut hardtop whose turbo six roars like a storm. Company presidents and street racers alike.' },
    stockWheels: 'mesh', stockLower: 'silver', stockMirrors: 'fender', stockSpoiler: 'none' },
  { id: 'hibari', mark: '雲', name: { ja: '雲雀ターボ', en: 'HIBARI TURBO' }, kind: { ja: 'ホットハッチ', en: 'HOT HATCH' },
    blurb: { ja: '雲雀（ひばり）、空高くさえずる小鳥。背の高い小さな箱に、張り出したフェンダー。',
      en: 'Hibari: the skylark, singing high over the city. A tall little box with blistered fenders.' },
    stockWheels: 'hachi', stockLower: 'black', stockMirrors: 'door', stockSpoiler: 'roof' },
];
export const bodyInfo = (id: BodyId): BodyInfo => BODIES.find(body => body.id === id)!;

export type Finish = 'solid' | 'metallic' | 'pearl';
export interface Paint {
  readonly id: string; readonly name: Bilingual; readonly color: string; readonly finish: Finish;
  /** The standard colour (rules.ts LIVERIES id) this paint is, raced in live XOR races. */
  readonly livery?: number;
}
const STANDARD_IDS = ['shiro', 'akai', 'midori', 'murasaki', 'kiiro', 'aoi'] as const;
/** The six standard colours first (live races use them), then period colours for local races. */
export const PAINTS: readonly Paint[] = [
  ...LIVERIES.map((livery, i): Paint => ({ id: STANDARD_IDS[i]!, name: { ja: livery.japanese, en: livery.name.toUpperCase() }, color: livery.color, finish: 'solid', livery: livery.id })),
  // Period colours, named for SORA's sky from dawn to the night.
  { id: 'pearl', name: { ja: '白雲パール', en: 'WHITE CLOUD PEARL' }, color: '#efe8de', finish: 'pearl' },
  { id: 'black', name: { ja: '夜空ブラック', en: 'NIGHT SKY BLACK' }, color: '#1d1d24', finish: 'solid' },
  { id: 'gunmetal', name: { ja: '雷雲ガンメタ', en: 'STORM CLOUD GUNMETAL' }, color: '#555a64', finish: 'metallic' },
  { id: 'silver', name: { ja: '月影シルバー', en: 'MOONLIGHT SILVER' }, color: '#b6babf', finish: 'metallic' },
  { id: 'champagne', name: { ja: '黄昏ゴールド', en: 'TWILIGHT GOLD' }, color: '#c9b089', finish: 'metallic' },
  { id: 'wine', name: { ja: '茜空ワイン', en: 'RED SKY WINE' }, color: '#71202e', finish: 'metallic' },
  { id: 'midnight', name: { ja: '星夜ブルー', en: 'STARRY NIGHT BLUE' }, color: '#22305a', finish: 'metallic' },
  { id: 'green', name: { ja: 'オーロラグリーン', en: 'AURORA GREEN' }, color: '#265341', finish: 'metallic' },
  { id: 'sunset', name: { ja: '夕焼けオレンジ', en: 'SUNSET ORANGE' }, color: '#e2722f', finish: 'solid' },
  { id: 'beige', name: { ja: '朝霞ベージュ', en: 'MORNING HAZE BEIGE' }, color: '#cfba94', finish: 'solid' },
  { id: 'sky', name: { ja: '青空ブルー', en: 'CLEAR SKY BLUE' }, color: '#8fc0e2', finish: 'solid' },
  { id: 'pink', name: { ja: '桜雲ピンク', en: 'BLOSSOM CLOUD PINK' }, color: '#ee9cb6', finish: 'solid' },
  { id: 'mint', name: { ja: '春空ミント', en: 'SPRING SKY MINT' }, color: '#a9e0cd', finish: 'solid' },
];
export const paintInfo = (id: string): Paint => PAINTS.find(paint => paint.id === id) ?? PAINTS[0]!;
/** The paint of a standard colour (rules.ts LIVERIES id). */
export const liveryPaint = (livery: number): Paint => PAINTS.find(paint => paint.livery === livery) ?? PAINTS[0]!;

export const LOWER_COLOURS: Readonly<Record<Exclude<LowerTone, 'stock' | 'body'>, string>> = {
  black: '#1f1f26', grey: '#4a4d55', silver: '#b4b8bd', gold: '#bfa169', white: '#ece7dc',
};
export const STRIPE_HEX: Readonly<Record<StripeColour, string>> = {
  white: '#f2ede2', black: '#1c1c22', red: '#e0343b', gold: '#d6ae4f', blue: '#3f86d6', pink: '#ec8db0', teal: '#3cc2aa', orange: '#ef8a2f',
};
export const NEON_HEX: Readonly<Record<Exclude<Neon, 'none'>, string>> = {
  pink: '#ff4fb8', cyan: '#3fe6ff', purple: '#a35bff', green: '#52ff8a', orange: '#ff8a2a',
};
/** Window film colours (the glass's own; model.ts sets its opacity). */
export const TINT_HEX: Readonly<Record<Tint, string>> = { stock: '#33444f', light: '#252c33', dark: '#0c0f12', gold: '#a47f36' };
export const WHEEL_HEX: Readonly<Record<WheelColour, string>> = {
  silver: '#c3c8cf', gold: '#c99a3e', white: '#ece9e2', black: '#26262c', bronze: '#8d6b3f', gunmetal: '#5d626b',
};

/** Japanese and English names of every option, for the garage. */
export const OPTION_NAMES = {
  lower: { stock: { ja: '純正', en: 'FACTORY' }, body: { ja: '同色', en: 'ONE COLOUR' }, black: { ja: 'ブラック', en: 'BLACK' },
    grey: { ja: 'グレー', en: 'GREY' }, silver: { ja: 'シルバー', en: 'SILVER' }, gold: { ja: 'ゴールド', en: 'GOLD' }, white: { ja: 'ホワイト', en: 'WHITE' } },
  stripe: { none: { ja: 'なし', en: 'NONE' }, pin: { ja: 'ピンストライプ', en: 'PINSTRIPE' }, twin: { ja: 'ツインストライプ', en: 'TWIN STRIPES' },
    fade: { ja: '80sグラフィック', en: '80s GRAPHIC' }, 'group-a': { ja: 'グループA', en: 'GROUP A' } },
  stripeColour: { white: { ja: '白', en: 'WHITE' }, black: { ja: '黒', en: 'BLACK' }, red: { ja: '赤', en: 'RED' }, gold: { ja: '金', en: 'GOLD' },
    blue: { ja: '青', en: 'BLUE' }, pink: { ja: '桃', en: 'PINK' }, teal: { ja: '翠', en: 'TEAL' }, orange: { ja: '橙', en: 'ORANGE' } },
  wheels: { stock: { ja: '純正', en: 'FACTORY' }, hachi: { ja: '8本スポーク', en: 'EIGHT-SPOKE' }, mesh: { ja: 'メッシュ', en: 'MESH' },
    dish: { ja: '深リム', en: 'DEEP DISH' }, star: { ja: '5本スポーク', en: 'FIVE-SPOKE' }, disc: { ja: 'ディスク', en: 'AERO DISC' },
    steel: { ja: '鉄チン', en: 'STEEL' } },
  wheelColour: { silver: { ja: 'シルバー', en: 'SILVER' }, gold: { ja: 'ゴールド', en: 'GOLD' }, white: { ja: 'ホワイト', en: 'WHITE' },
    black: { ja: 'ブラック', en: 'BLACK' }, bronze: { ja: 'ブロンズ', en: 'BRONZE' }, gunmetal: { ja: 'ガンメタ', en: 'GUNMETAL' } },
  front: { stock: { ja: '純正', en: 'FACTORY' }, lip: { ja: 'リップ', en: 'LIP SPOILER' }, deppa: { ja: '出っ歯', en: 'DEPPA' } },
  spoiler: { stock: { ja: '純正', en: 'FACTORY' }, ducktail: { ja: 'ダックテール', en: 'DUCKTAIL' }, wing: { ja: 'GTウイング', en: 'GT WING' },
    roof: { ja: 'ルーフ', en: 'ROOF SPOILER' } },
  fenders: { stock: { ja: '純正', en: 'FACTORY' }, flares: { ja: 'オーバーフェンダー', en: 'OVER-FENDERS' } },
  stance: { stock: { ja: '純正', en: 'FACTORY' }, low: { ja: 'シャコタン', en: 'SLAMMED' }, oni: { ja: '鬼キャン', en: 'DEMON CAMBER' },
    rally: { ja: 'ラリー', en: 'RALLY' } },
  lamps: { none: { ja: 'なし', en: 'NONE' }, fog: { ja: 'フォグ', en: 'FOG LAMPS' }, rally: { ja: 'ラリーライト', en: 'RALLY LIGHTS' } },
  exhaust: { stock: { ja: '純正', en: 'FACTORY' }, sport: { ja: '砲弾マフラー', en: 'BIG-BORE' }, takeyari: { ja: '竹槍', en: 'TAKEYARI' } },
  mirrors: { stock: { ja: '純正', en: 'FACTORY' }, fender: { ja: 'フェンダーミラー', en: 'FENDER MIRRORS' } },
  skirts: { false: { ja: 'なし', en: 'NONE' }, true: { ja: 'サイドスカート', en: 'SIDE SKIRTS' } },
  louvers: { false: { ja: 'なし', en: 'NONE' }, true: { ja: 'ルーバー', en: 'LOUVRES' } },
  tint: { stock: { ja: '純正', en: 'FACTORY' }, light: { ja: 'ライトスモーク', en: 'LIGHT SMOKE' }, dark: { ja: 'フルスモーク', en: 'DARK SMOKE' },
    gold: { ja: 'ゴールドミラー', en: 'GOLD MIRROR' } },
  headlights: { white: { ja: 'ホワイト', en: 'WHITE' }, yellow: { ja: 'イエローバルブ', en: 'YELLOW BULBS' } },
  tails: { stock: { ja: '純正', en: 'FACTORY' }, smoked: { ja: 'スモークテール', en: 'SMOKED TAILS' } },
  neon: { none: { ja: 'なし', en: 'NONE' }, pink: { ja: 'ピンク', en: 'PINK' }, cyan: { ja: 'シアン', en: 'CYAN' }, purple: { ja: 'パープル', en: 'PURPLE' },
    green: { ja: 'グリーン', en: 'GREEN' }, orange: { ja: 'オレンジ', en: 'ORANGE' } },
  bonnet: { stock: { ja: '純正', en: 'FACTORY' }, scoop: { ja: 'エアスクープ', en: 'TURBO SCOOP' }, vents: { ja: 'ダクト', en: 'LOUVRED VENTS' },
    black: { ja: 'ブラックボンネット', en: 'BLACK BONNET' } },
  roof: { none: { ja: 'なし', en: 'NONE' }, rack: { ja: 'ルーフキャリア', en: 'ROOF RACK' }, skis: { ja: 'スキーキャリア', en: 'SKI CARRIER' } },
  aeroColour: { black: { ja: 'ブラック', en: 'BLACK' }, body: { ja: 'ボディ同色', en: 'BODY COLOUR' } },
  banner: { false: { ja: 'なし', en: 'NONE' }, true: { ja: 'ハチマキ', en: 'WINDSCREEN BANNER' } },
} as const;

const CHOICES: Readonly<Record<Exclude<keyof CarBuild, 'paint' | 'skirts' | 'louvers' | 'banner' | 'number'>, readonly string[]>> = {
  body: BODY_IDS, lower: LOWER_TONES, stripe: STRIPES, stripeColour: STRIPE_COLOURS, wheels: WHEEL_STYLES, wheelColour: WHEEL_COLOURS,
  front: FRONT_AERO, spoiler: SPOILERS, fenders: FENDERS, stance: STANCES, lamps: LAMPS, exhaust: EXHAUSTS, mirrors: MIRRORS,
  tint: TINTS, headlights: HEADLIGHTS, tails: TAILS, neon: NEONS, bonnet: BONNETS, roof: ROOFS, aeroColour: AERO_COLOURS,
};

/** The factory car in a standard colour: exactly the car every race drew before builds. */
export function stockBuild(livery = 0, body: BodyId = 'hachiroku'): CarBuild {
  return { body, paint: liveryPaint(livery).id, lower: 'stock', stripe: 'none', stripeColour: 'white', wheels: 'stock', wheelColour: 'silver',
    front: 'stock', skirts: false, spoiler: 'stock', fenders: 'stock', stance: 'stock', lamps: 'none', louvers: false, exhaust: 'stock', mirrors: 'stock',
    ...BUILD_ADDITIONS };
}
/** True for the plain hachiroku in a standard colour: drawn by the original detailed model, untouched. */
export function isFactoryHachiroku(build: CarBuild): boolean {
  const stock = stockBuild(paintInfo(build.paint).livery ?? 0);
  // Colours of parts the factory car lacks (stripes, build wheels, aero) cannot show.
  return paintInfo(build.paint).livery !== undefined && BUILD_KEYS.every(key => key === 'stripeColour' || key === 'wheelColour' || key === 'aeroColour' || build[key] === stock[key]);
}

/** A stored or replayed build: exactly the build's keys, each a known choice. */
export function validateCarBuild(value: unknown): CarBuild {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid car build');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== [...BUILD_KEYS].sort().join(',')) throw new TypeError('Invalid car build');
  for (const [key, choices] of Object.entries(CHOICES)) if (typeof v[key] !== 'string' || !choices.includes(v[key] as string)) throw new TypeError(`Unknown car build ${key}`);
  if (typeof v.paint !== 'string' || !PAINTS.some(paint => paint.id === v.paint)) throw new TypeError('Unknown car build paint');
  if (typeof v.skirts !== 'boolean' || typeof v.louvers !== 'boolean' || typeof v.banner !== 'boolean') throw new TypeError('Invalid car build');
  if (!Number.isInteger(v.number) || (v.number as number) < 0 || (v.number as number) > MAX_RACE_NUMBER) throw new TypeError('Invalid car build number');
  return Object.fromEntries(BUILD_KEYS.map(key => [key, v[key]])) as unknown as CarBuild;
}
/**
 * A build in the current format or the first one (BUILD_KEYS_V1, before lights, glass, bonnet, roof and numbers): an
 * older build reads with the factory parts for every option it predates. Anything else must be exact.
 */
export function upgradeCarBuild(value: unknown): CarBuild {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...BUILD_KEYS_V1].sort().join(',')) {
    return validateCarBuild({ ...value, ...BUILD_ADDITIONS });
  }
  return validateCarBuild(value);
}
/**
 * A replay's builds, presentation metadata beside its inputs: one per car, null where a car raced without one (a live
 * racer whose client sent none drew the factory car). Absent in replays from before builds.
 */
export function validateReplayBuilds(value: unknown, cars: number): (CarBuild | null)[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== cars) throw new TypeError('Car build replay roster mismatch');
  return value.map(build => build === null ? null : upgradeCarBuild(build));
}
/** A saved build, or the factory car in the saved standard colour. */
export function readCarBuild(value: unknown, livery = 0): CarBuild {
  try {
    const v = value as { version?: unknown; build?: unknown } | null;
    if (v?.version === 1) return upgradeCarBuild(v.build);
  } catch { /* An unreadable save is the factory car. */ }
  return stockBuild(livery);
}
export const storedCarBuild = (build: CarBuild) => ({ version: 1 as const, build: validateCarBuild(build) });

/** Every colour a build is drawn in. A club livery (catalog.ts) replaces the paint. */
export interface BuildColours { paint: string; finish: Finish; lower: string | null; stripe: string; wheel: string; neon: string | null }
export function buildColours(build: CarBuild): BuildColours {
  const paint = paintInfo(build.paint), body = bodyInfo(build.body);
  const tone = build.lower === 'stock' ? body.stockLower : build.lower;
  return { paint: paint.color, finish: paint.finish, lower: tone === 'body' ? null : LOWER_COLOURS[tone], stripe: STRIPE_HEX[build.stripeColour], wheel: WHEEL_HEX[build.wheelColour],
    neon: build.neon === 'none' ? null : NEON_HEX[build.neon] };
}
/** The body's own parts where a build keeps 'stock'. */
export function resolvedBuild(build: CarBuild) {
  const body = bodyInfo(build.body);
  return { ...build, wheels: build.wheels === 'stock' ? body.stockWheels : build.wheels, spoiler: build.spoiler === 'stock' ? body.stockSpoiler : build.spoiler,
    mirrors: build.mirrors === 'stock' ? body.stockMirrors : build.mirrors };
}

/** A small deterministic generator (the same rivals' cars every race). */
function generator(seed: number): () => number {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function pick<T>(random: () => number, items: readonly T[]): T { return items[Math.floor(random() * items.length) % items.length]!; }
const PERIOD_PAINTS = PAINTS.filter(paint => paint.livery === undefined).map(paint => paint.id);

/**
 * A rival's car, from a seed. `flair` (0-1) is how far it has been modified: club-night regulars run nearly stock
 * cars on their own wheels, Legends run flares, wings and demon camber.
 */
export function rivalCar(seed: number, flair: number, body?: BodyId): CarBuild {
  const random = generator(seed), heavy = Math.min(1, Math.max(0, flair));
  const chosen = body ?? pick(random, BODY_IDS);
  const paint = random() < .3 ? pick(random, STANDARD_IDS) : pick(random, PERIOD_PAINTS);
  const modded = (share: number) => random() < share * (0.25 + heavy);
  const stripe = modded(.35) ? pick(random, STRIPES.slice(1)) : 'none';
  return validateCarBuild({
    body: chosen, paint, lower: modded(.3) ? pick(random, LOWER_TONES.slice(1)) : 'stock', stripe, stripeColour: pick(random, STRIPE_COLOURS),
    wheels: modded(.7) ? pick(random, WHEEL_STYLES.slice(1)) : 'stock', wheelColour: modded(.4) ? pick(random, WHEEL_COLOURS) : 'silver',
    front: modded(.5) ? random() < .25 + heavy * .3 ? 'deppa' : 'lip' : 'stock', skirts: modded(.4),
    spoiler: modded(.5) ? pick(random, SPOILERS.slice(1)) : 'stock', fenders: modded(.35 + heavy * .3) ? 'flares' : 'stock',
    stance: modded(.5) ? pick(random, ['low', 'low', 'oni', 'rally'] as const) : 'stock', lamps: modded(.3) ? pick(random, LAMPS.slice(1)) : 'none',
    louvers: modded(.3), exhaust: modded(.35) ? heavy > .6 && random() < .3 ? 'takeyari' : 'sport' : 'stock', mirrors: modded(.15) ? 'fender' : 'stock',
    tint: modded(.35) ? pick(random, ['light', 'dark', 'dark', 'gold'] as const) : 'stock', headlights: random() < .12 + heavy * .25 ? 'yellow' : 'white',
    tails: modded(.3) ? 'smoked' : 'stock', neon: heavy > .5 && random() < heavy * .3 ? pick(random, NEONS.slice(1)) : 'none',
    bonnet: modded(.3) ? pick(random, BONNETS.slice(1)) : 'stock', roof: random() < .08 ? pick(random, ROOFS.slice(1)) : 'none',
    number: heavy > .4 && random() < .5 ? 1 + Math.floor(random() * MAX_RACE_NUMBER) : 0, aeroColour: random() < .4 ? 'body' : 'black', banner: modded(.25),
  });
}

/** Practice fields: how modified the rivals' cars look, from Club night's to Legends'. */
export const FIELD_FLAIR: Readonly<Record<string, number>> = { club: .15, touge: .45, championship: .7, legends: 1 };
/** The practice grid's cars: the player's build in their slot, a field of varied period cars elsewhere. */
export function practiceCars(field: string, players: number, playerSlot: number, player: CarBuild): CarBuild[] {
  const flair = FIELD_FLAIR[field] ?? .3, field0 = Object.keys(FIELD_FLAIR).indexOf(field) + 1;
  return Array.from({ length: players }, (_, slot) => slot === playerSlot ? player : rivalCar(field0 * 101 + slot * 7919, flair));
}

/**
 * The story's cars. The crew drive the hachiroku the cutscenes draw, each with their own touches; the rivals and the
 * host clubs' guests bring their own period cars. Names are the story grids' (story.ts), with or without the furigana.
 */
const STORY_CARS: readonly { match: string; build: Partial<CarBuild> & Pick<CarBuild, 'body' | 'paint'> }[] = [
  { match: 'レン', build: { body: 'hachiroku', paint: 'shiro', stripe: 'fade', stripeColour: 'pink', wheels: 'mesh', wheelColour: 'gold', banner: true } },
  { match: 'メイ', build: { body: 'hachiroku', paint: 'aoi', lower: 'silver', wheels: 'hachi', louvers: true, tint: 'light' } },
  { match: 'ダイチ', build: { body: 'hachiroku', paint: 'midori', wheels: 'steel', wheelColour: 'white', lamps: 'rally', stance: 'rally', roof: 'rack' } },
  { match: 'ユイ', build: { body: 'hachiroku', paint: 'kiiro', stripe: 'pin', stripeColour: 'black', front: 'lip', spoiler: 'roof', wheels: 'disc', bonnet: 'vents' } },
  { match: 'ジュン', build: { body: 'hachiroku', paint: 'murasaki', stripe: 'twin', stripeColour: 'white', wheels: 'dish', stance: 'low', neon: 'purple' } },
  { match: 'レイ', build: { body: 'mikazuki', paint: 'silver', stripe: 'pin', stripeColour: 'blue', wheels: 'star', wheelColour: 'gunmetal', front: 'lip', number: 7 } },
  { match: 'トオル', build: { body: 'hokuto', paint: 'black', lower: 'gold', stripe: 'pin', stripeColour: 'gold', wheels: 'mesh', wheelColour: 'gold', front: 'lip', skirts: true, spoiler: 'wing',
    number: 8, tint: 'dark', headlights: 'yellow', aeroColour: 'body' } },
  { match: '港のドライバー', build: { body: 'raimei', paint: 'gunmetal', wheels: 'mesh', stance: 'low', front: 'lip' } },
  { match: 'ゲスト', build: { body: 'kakeru', paint: 'akai', wheels: 'dish', wheelColour: 'gold' } },
  { match: 'タクシー', build: { body: 'raimei', paint: 'kiiro', lower: 'black', wheels: 'steel', mirrors: 'fender' } },
  { match: '日光クラブ', build: { body: 'hibari', paint: 'sky', stripe: 'fade', stripeColour: 'white' } },
  { match: '明智平', build: { body: 'kakeru', paint: 'sunset', lower: 'black', wheels: 'star', wheelColour: 'black', front: 'lip' } },
  { match: '会津クラブ', build: { body: 'hibari', paint: 'wine', wheels: 'hachi', wheelColour: 'gold', fenders: 'flares', roof: 'skis' } },
  { match: '漆職人', build: { body: 'raimei', paint: 'black', lower: 'black', stripe: 'pin', stripeColour: 'red', wheels: 'dish', wheelColour: 'bronze' } },
  { match: '京都クラブ', build: { body: 'mikazuki', paint: 'pearl', wheels: 'mesh', wheelColour: 'gold', louvers: true } },
  { match: '奈良の走り屋', build: { body: 'hokuto', paint: 'midnight', stripe: 'group-a', stripeColour: 'red', wheels: 'hachi', front: 'deppa', stance: 'oni', exhaust: 'takeyari', fenders: 'flares',
    neon: 'pink', tails: 'smoked', bonnet: 'scoop', number: 27 } },
];
/** A story driver's car by grid name, or null for the player and unknown names. */
export function storyCar(name: string): CarBuild | null {
  const found = STORY_CARS.find(car => name.includes(car.match));
  return found ? validateCarBuild({ ...stockBuild(), ...found.build }) : null;
}
