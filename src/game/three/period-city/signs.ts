import * as THREE from 'three';
import { EMBLEM_CIRCLE } from '../sora-emblem';

/**
 * One canvas atlas of original 1986-style signage: vertical shop signs
 * (袖看板), shop fascias and rooftop billboards. Shop and company names are
 * invented; the SORA billboards draw the exact supplied emblem
 * (branding/sora-emblem-source.png), centred on the board above the
 * wordmark. Signs are internally lit boxes: the face is colour and emissive map.
 */
const WIDTH = 2048, HEIGHT = 5376;
const VERTICAL = { width: 128, height: 512, columns: 16, rows: 3, top: 0 } as const;
const FASCIA = { width: 512, height: 128, columns: 4, rows: 5, top: 1536 } as const;
const BOARD = { width: 512, height: 256, columns: 4, rows: 3, top: 2176 } as const;
const GUIDE = { width: 512, height: 256, columns: 4, rows: 5, top: 2944 } as const;
const KANA = { width: 128, height: 128, columns: 16, rows: 3, top: 4224 } as const;
/** Regional shop words for the street routes beyond Tokyo, after the original sets. */
const VERTICAL_LOCAL = { width: 128, height: 512, columns: 16, rows: 1, top: 4608 } as const;
const FASCIA_LOCAL = { width: 512, height: 128, columns: 4, rows: 2, top: 5120 } as const;
export type PrintRect = [number, number, number, number];
export type SignKind = 'vertical' | 'fascia' | 'board' | 'guide' | 'kana';

interface Scheme { readonly ground: string; readonly ink: string; readonly rule?: string }
/** Period sign colours: lacquer red, cream, ink black, cobalt, emerald, mustard. */
const SCHEMES: readonly Scheme[] = [
  { ground: '#c8312b', ink: '#fbf1d6' }, { ground: '#f3e9cf', ink: '#b3261f', rule: '#b3261f' },
  { ground: '#1d2a4a', ink: '#f6d77c' }, { ground: '#f2c53d', ink: '#2a1e1a' },
  { ground: '#1e6a4c', ink: '#f4ead2' }, { ground: '#f4f0e4', ink: '#1f3f7a', rule: '#1f3f7a' },
  { ground: '#2c2523', ink: '#f2a640' }, { ground: '#2f5fa8', ink: '#ffffff' },
  { ground: '#e7782c', ink: '#fff6e2' }, { ground: '#6b2a5c', ink: '#ffd9ef' },
  { ground: '#f6f2ea', ink: '#222222', rule: '#c8312b' }, { ground: '#8c1f24', ink: '#f6d77c' },
];
const VERTICAL_WORDS = ['喫茶', '麻雀', '焼肉', '寿司', '中華', '質', '薬局', '歯科', '内科', '不動産', '古書', '書店',
  '学習塾', '英会話', '理容', '写真', '時計', '電器', 'スナック', '居酒屋', 'ラーメン', 'そば', '天ぷら', '洋食',
  '旅館', '金融', 'カメラ', '碁会所', 'たばこ', 'レコード', 'ビデオ', 'やきとり',
  // Hakone and Nikko's onsen streets, Yokohama's quays.
  '温泉', 'ホテル', '湯波', '羊羹', 'みやげ', '民宿', '日光', '箱根', '倉庫', '海運', '運送', '冷蔵', '寄木', '饅頭', '茶屋', '♨'];
const FASCIA_WORDS: readonly (readonly [string, string])[] = [
  ['喫茶 白鳥', 'COFFEE & TEA'], ['中華料理 龍門', 'CHINESE'], ['とんかつ 平八', '定食・弁当'], ['寿司 政', 'SUSHI'],
  ['そば処 長寿庵', '手打ち'], ['やきとり 鳥八', '炭火焼'], ['松風書店', '新刊・古書'], ['丸山時計店', 'WATCH & CLOCK'],
  ['小林薬局', '漢方・化粧品'], ['千代田歯科', '診療 9:00-19:00'], ['九段不動産', '賃貸・売買'], ['神田カメラ', 'CAMERA'],
  ['レコード 音楽堂', 'RECORDS'], ['SORA 自動車', '整備・板金・塗装'], ['純喫茶 夕凪', 'KISSA'], ['居酒屋 さくら', '酒・肴'],
  ['旅館 山水', '温泉旅館'], ['湯波 日光堂', '名物 ゆば・羊羹'], ['寄木細工 箱根堂', 'YOSEGI'], ['三栄倉庫', 'SANEI WAREHOUSE'],
];
const BOARD_WORDS: readonly (readonly [string, string, number])[] = [
  ['天空生命', 'TENKU LIFE', 7], ['SORA', 'MOTOR CLUB', -1], ['東雲電気', 'SHINONOME カラーテレビ', 2], ['朝凪銀行', 'ASANAGI BANK', 4],
  ['鳳凰ウイスキー', 'HOUOU WHISKY', 6], ['SORA', '走る、つながる。', -1], ['旭光石油', 'KYOKKO OIL', 0], ['北辰物産', 'HOKUSHIN', 10],
  ['ホテル 湯の花', '♨ 天然温泉 HOT SPRING', 9], ['三栄海運', 'SANEI KAIUN', 7], ['SORA', '海運 KAIUN', -1], ['みなと丸', 'MINATO MARU', 2],
];
/** Blue road guide signs (案内標識): two destinations each, kanji over romaji, with arrows; the last is Chinatown's plaque. */
const GUIDE_WORDS: readonly (readonly (readonly [string, string, string])[])[] = [
  [['九段下', 'Kudanshita', '↑'], ['皇居', 'Imperial Palace', '←']],
  [['半蔵門', 'Hanzomon', '↑'], ['三宅坂', 'Miyakezaka', '→']],
  [['霞が関', 'Kasumigaseki', '↑'], ['日比谷', 'Hibiya', '←']],
  [['大手町', 'Otemachi', '↑'], ['東京駅', 'Tokyo Sta.', '→']],
  [['箱根', 'Hakone', '↑'], ['小田原', 'Odawara', '←']],
  [['山下公園', 'Yamashita Park', '↑'], ['横浜駅', 'Yokohama Sta.', '→']],
  [['日光', 'Nikko', '↑'], ['中禅寺湖', 'Lake Chuzenji', '←']],
  [['神保町', 'Jimbocho', '↑'], ['御茶ノ水', 'Ochanomizu', '→']],
  // The street routes beyond Tokyo.
  [['中禅寺湖', 'Lake Chuzenji', '↑'], ['明智平', 'Akechidaira', '↑']],
  [['鶴ヶ城', 'Tsurugajo Castle', '↑'], ['七日町', 'Nanokamachi', '→']],
  [['飯盛山', 'Iimoriyama', '↑'], ['東山温泉', 'Higashiyama Onsen', '→']],
  [['四条通', 'Shijo-dori', '→'], ['烏丸御池', 'Karasuma-Oike', '↑']],
  [['祇園', 'Gion', '↑'], ['河原町', 'Kawaramachi', '←']],
  [['蹴上', 'Keage', '↑'], ['平安神宮', 'Heian Shrine', '←']],
  [['京都御所', 'Kyoto Imperial Palace', '↑'], ['二条城', 'Nijo Castle', '←']],
  [['京都駅', 'Kyoto Sta.', '↑'], ['西本願寺', 'Nishi Hongwanji', '→']],
  [['東大寺', 'Todai-ji', '↑'], ['春日大社', 'Kasuga Taisha', '→']],
  [['奈良公園', 'Nara Park', '↑'], ['奈良駅', 'Nara Sta.', '←']],
];
/** Kyoto, Nara and Aizu shop words (invented shop names; regional goods). */
const LOCAL_VERTICAL_WORDS = ['京菓子', '漬物', '湯葉', '扇子', '西陣織', '豆腐', '茶舗', '甘味', '酒蔵', '赤べこ', '会津塗', '鹿せんべい', '奈良漬', '墨', '筆', '仏具'];
const LOCAL_FASCIA_WORDS: readonly (readonly [string, string])[] = [
  ['京漬物 花よし', '千枚漬・すぐき'], ['甘味処 まつ乃', 'あんみつ・わらび餅'], ['京扇子 白梅堂', 'SENSU'], ['茶舗 宇治園', '玉露・抹茶'],
  ['会津塗 漆器 塗師屋', '会津塗・赤べこ'], ['酒造 鶴の井', '会津の地酒'], ['奈良漬 森の屋', '奈良名物'], ['奈良墨 古梅堂', '墨・筆'],
];
/** The iroha poem's kana, one per curve board on Irohazaka. */
export const IROHA = [...'いろはにほへとちりぬるをわかよたれそつねならむうゐのおくやまけふこえてあさきゆめみしゑひもせすん'];
const FONT = '"Hiragino Kaku Gothic ProN", SoraJP, "Noto Sans JP", sans-serif';
const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", SoraJP, serif';

let atlas: { texture: THREE.CanvasTexture; ready: Promise<void> } | undefined;

function rect(region: { width: number; height: number; columns: number; top: number }, index: number): PrintRect {
  const x = index % region.columns * region.width, y = region.top + Math.floor(index / region.columns) * region.height;
  // Canvas rows run down; texture v runs up (flipY). Inset half a texel per side.
  return [(x + .5) / WIDTH, 1 - (y + region.height - .5) / HEIGHT, (x + region.width - .5) / WIDTH, 1 - (y + .5) / HEIGHT];
}
/** The atlas rectangle of sign `index` of a kind (wraps). */
export function signPrint(kind: SignKind, index: number): PrintRect {
  // Indices past the original vertical and fascia sets select the regional words.
  if (kind === 'vertical' && index >= SIGN_COUNTS.vertical && index < SIGN_COUNTS.vertical + LOCAL_VERTICAL_WORDS.length) return rect(VERTICAL_LOCAL, index - SIGN_COUNTS.vertical);
  if (kind === 'fascia' && index >= SIGN_COUNTS.fascia && index < SIGN_COUNTS.fascia + LOCAL_FASCIA_WORDS.length) return rect(FASCIA_LOCAL, index - SIGN_COUNTS.fascia);
  const region = kind === 'vertical' ? VERTICAL : kind === 'fascia' ? FASCIA : kind === 'board' ? BOARD : kind === 'kana' ? KANA : GUIDE;
  return rect(region, ((index % (region.columns * region.rows)) + region.columns * region.rows) % (region.columns * region.rows));
}
/** A horizontal slice (0 bottom .. 1 top) of a print, for one tenant panel of a stacked sign. */
export function printSlice(print: PrintRect, from: number, to: number): PrintRect {
  return [print[0], print[1] + (print[3] - print[1]) * from, print[2], print[1] + (print[3] - print[1]) * to];
}
export const SIGN_COUNTS = { vertical: VERTICAL.columns * VERTICAL.rows, fascia: FASCIA.columns * FASCIA.rows, board: BOARD.columns * BOARD.rows,
  guide: GUIDE.columns * GUIDE.rows, kana: KANA.columns * KANA.rows } as const;
/** A street's own choice of shop signs, as atlas indices. */
export interface SignPools { readonly vertical: readonly number[]; readonly fascia: readonly number[]; readonly board: readonly number[] }
/** A sign from the street's pool, or from the whole original set exactly as before. Both draw `random` once. */
export function pickSign(pools: SignPools | null, kind: 'vertical' | 'fascia' | 'board', random: () => number): number {
  const pool = pools?.[kind];
  return pool?.length ? pool[Math.floor(random() * pool.length)]! : Math.floor(random() * SIGN_COUNTS[kind]);
}
const VERTICAL_ALL = [...VERTICAL_WORDS, ...LOCAL_VERTICAL_WORDS], FASCIA_ALL = [...FASCIA_WORDS, ...LOCAL_FASCIA_WORDS];
/** A fascia's shop title by its atlas index (awnings.ts prints the shop's trade from it); '' past the sets. */
export function fasciaTitle(index: number): string { return FASCIA_ALL[index]?.[0] ?? ''; }
const pick = (words: readonly string[], all: readonly string[]) => words.map(word => {
  const index = all.indexOf(word); if (index < 0) throw new Error(`No sign word ${word}.`); return index;
});
const fascias = (titles: readonly string[]) => pick(titles, FASCIA_ALL.map(([title]) => title));
/** Shop words found on any 1986 street; no Tokyo, Hakone, Nikko or harbour place names. */
const COMMON_VERTICAL = ['喫茶', '麻雀', '焼肉', '寿司', '中華', '質', '薬局', '歯科', '内科', '不動産', '古書', '書店', '学習塾', '英会話',
  '理容', '写真', '時計', '電器', 'スナック', '居酒屋', 'ラーメン', 'そば', '天ぷら', '洋食', '旅館', '金融', 'カメラ', 'たばこ', 'レコード', 'ビデオ', 'やきとり'];
const COMMON_FASCIA = ['喫茶 白鳥', '中華料理 龍門', 'とんかつ 平八', '寿司 政', 'そば処 長寿庵', 'やきとり 鳥八', '松風書店', '丸山時計店',
  '小林薬局', 'レコード 音楽堂', 'SORA 自動車', '純喫茶 夕凪', '居酒屋 さくら', '旅館 山水'];
const COMMON_BOARDS = BOARD_WORDS.flatMap(([title], index) => ['ホテル 湯の花', '三栄海運', 'みなと丸'].includes(title) ? [] : [index]);
/** Regional sign pools for the street routes; Tokyo and the Arcade keep the whole original set. */
export const SIGN_REGIONS: Readonly<Record<'kyoto' | 'nara' | 'aizu' | 'nikko', SignPools>> = {
  kyoto: { vertical: pick([...COMMON_VERTICAL, '京菓子', '漬物', '湯葉', '扇子', '西陣織', '豆腐', '茶舗', '甘味', 'みやげ', '茶屋'], VERTICAL_ALL),
    fascia: fascias([...COMMON_FASCIA, '京漬物 花よし', '甘味処 まつ乃', '京扇子 白梅堂', '茶舗 宇治園']), board: COMMON_BOARDS },
  nara: { vertical: pick([...COMMON_VERTICAL, '奈良漬', '鹿せんべい', '墨', '筆', '仏具', '甘味', '茶舗', 'みやげ', '茶屋', '饅頭'], VERTICAL_ALL),
    fascia: fascias([...COMMON_FASCIA, '奈良漬 森の屋', '奈良墨 古梅堂', '茶舗 宇治園']), board: COMMON_BOARDS },
  aizu: { vertical: pick([...COMMON_VERTICAL, '酒蔵', '赤べこ', '会津塗', 'みやげ', '民宿', '温泉', '饅頭', '茶屋'], VERTICAL_ALL),
    fascia: fascias([...COMMON_FASCIA, '会津塗 漆器 塗師屋', '酒造 鶴の井']), board: COMMON_BOARDS },
  nikko: { vertical: pick(['そば', '茶屋', 'みやげ', '民宿', '旅館', '湯波', '羊羹', '日光', '饅頭', 'ホテル', 'たばこ', 'カメラ'], VERTICAL_ALL),
    fascia: fascias(['そば処 長寿庵', '湯波 日光堂', '旅館 山水', '純喫茶 夕凪', 'SORA 自動車']), board: COMMON_BOARDS },
};
/** The guide sign naming `kanji` first, for the street plans. */
export function guideIndex(kanji: string): number {
  const index = GUIDE_WORDS.findIndex(([[first]]) => first === kanji);
  if (index < 0) throw new Error(`No guide sign for ${kanji}.`);
  return index;
}
/** SORA emblem billboards in the board region. */
export const SORA_BOARDS = BOARD_WORDS.flatMap(([, , scheme], index) => scheme < 0 ? [index] : []);
/** The atlas index of a named sign (vertical word, fascia or board title). */
export function signIndex(kind: SignKind, title: string): number {
  const index = kind === 'vertical' ? VERTICAL_WORDS.indexOf(title)
    : (kind === 'fascia' ? FASCIA_WORDS : BOARD_WORDS).findIndex(([name, subtitle]) => name === title || subtitle === title);
  if (index < 0) throw new Error(`No ${kind} sign "${title}".`);
  return index;
}

function draw(context: CanvasRenderingContext2D, emblem: HTMLImageElement | null): void {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  const frame = (x: number, y: number, w: number, h: number, scheme: Scheme) => {
    context.fillStyle = scheme.ground; context.fillRect(x, y, w, h);
    // A darker box edge and an inner rule, as on enamel and acrylic boards.
    context.strokeStyle = 'rgba(20,14,24,.55)'; context.lineWidth = 6; context.strokeRect(x + 3, y + 3, w - 6, h - 6);
    if (scheme.rule) { context.strokeStyle = scheme.rule; context.lineWidth = 3; context.strokeRect(x + 12, y + 12, w - 24, h - 24); }
  };
  context.textAlign = 'center'; context.textBaseline = 'middle';
  VERTICAL_WORDS.forEach((word, index) => {
    const x = index % VERTICAL.columns * VERTICAL.width, y = VERTICAL.top + Math.floor(index / VERTICAL.columns) * VERTICAL.height;
    const scheme = SCHEMES[(index * 5 + 3) % SCHEMES.length]!, characters = [...word];
    frame(x, y, VERTICAL.width, VERTICAL.height, scheme);
    const step = Math.min(104, (VERTICAL.height - 44) / characters.length);
    context.fillStyle = scheme.ink; context.font = `800 ${Math.round(step * .9)}px ${index % 3 ? FONT : SERIF}`;
    characters.forEach((character, i) => context.fillText(character, x + VERTICAL.width / 2,
      y + VERTICAL.height / 2 + (i - (characters.length - 1) / 2) * step, VERTICAL.width - 22));
  });
  FASCIA_WORDS.forEach(([title, subtitle], index) => {
    const x = index % FASCIA.columns * FASCIA.width, y = FASCIA.top + Math.floor(index / FASCIA.columns) * FASCIA.height;
    const scheme = SCHEMES[(index * 7 + 1) % SCHEMES.length]!;
    frame(x, y, FASCIA.width, FASCIA.height, scheme);
    context.fillStyle = scheme.ink; context.font = `800 58px ${index % 4 === 1 ? SERIF : FONT}`;
    context.fillText(title, x + FASCIA.width / 2, y + 52, FASCIA.width - 36);
    context.font = `600 24px ${FONT}`; context.fillText(subtitle, x + FASCIA.width / 2, y + 100, FASCIA.width - 60);
  });
  GUIDE_WORDS.forEach((destinations, index) => {
    const x = index % GUIDE.columns * GUIDE.width, y = GUIDE.top + Math.floor(index / GUIDE.columns) * GUIDE.height;
    context.fillStyle = '#1f4fae'; context.fillRect(x, y, GUIDE.width, GUIDE.height);
    context.strokeStyle = '#f4f6fa'; context.lineWidth = 6; context.strokeRect(x + 10, y + 10, GUIDE.width - 20, GUIDE.height - 20);
    destinations.forEach(([kanji, romaji, arrow], row) => {
      const top = y + 28 + row * 108;
      context.fillStyle = '#f4f6fa'; context.textAlign = 'left';
      context.font = `800 64px ${FONT}`; context.fillText(kanji, x + 34, top + 34, 330);
      context.font = `600 24px ${FONT}`; context.fillText(romaji, x + 36, top + 86, 330);
      context.textAlign = 'center'; context.font = `800 88px ${FONT}`; context.fillText(arrow, x + 440, top + 50);
    });
    context.textAlign = 'center';
  });
  LOCAL_VERTICAL_WORDS.forEach((word, index) => {
    const x = index % VERTICAL_LOCAL.columns * VERTICAL_LOCAL.width, y = VERTICAL_LOCAL.top + Math.floor(index / VERTICAL_LOCAL.columns) * VERTICAL_LOCAL.height;
    const scheme = SCHEMES[(index * 5 + 1) % SCHEMES.length]!, characters = [...word];
    frame(x, y, VERTICAL_LOCAL.width, VERTICAL_LOCAL.height, scheme);
    const step = Math.min(104, (VERTICAL_LOCAL.height - 44) / characters.length);
    context.fillStyle = scheme.ink; context.font = `800 ${Math.round(step * .9)}px ${index % 3 ? SERIF : FONT}`;
    characters.forEach((character, i) => context.fillText(character, x + VERTICAL_LOCAL.width / 2,
      y + VERTICAL_LOCAL.height / 2 + (i - (characters.length - 1) / 2) * step, VERTICAL_LOCAL.width - 22));
  });
  LOCAL_FASCIA_WORDS.forEach(([title, subtitle], index) => {
    const x = index % FASCIA_LOCAL.columns * FASCIA_LOCAL.width, y = FASCIA_LOCAL.top + Math.floor(index / FASCIA_LOCAL.columns) * FASCIA_LOCAL.height;
    const scheme = SCHEMES[(index * 7 + 4) % SCHEMES.length]!;
    frame(x, y, FASCIA_LOCAL.width, FASCIA_LOCAL.height, scheme);
    context.fillStyle = scheme.ink; context.font = `800 54px ${index % 2 ? SERIF : FONT}`;
    context.fillText(title, x + FASCIA_LOCAL.width / 2, y + 52, FASCIA_LOCAL.width - 36);
    context.font = `600 24px ${FONT}`; context.fillText(subtitle, x + FASCIA_LOCAL.width / 2, y + 100, FASCIA_LOCAL.width - 60);
  });
  // Curve boards: a white enamel plate, a red ring and the kana in black.
  IROHA.forEach((kana, index) => {
    const x = index % KANA.columns * KANA.width, y = KANA.top + Math.floor(index / KANA.columns) * KANA.height;
    context.fillStyle = '#f6f4ee'; context.fillRect(x, y, KANA.width, KANA.height);
    context.strokeStyle = '#2b2b30'; context.lineWidth = 6; context.strokeRect(x + 3, y + 3, KANA.width - 6, KANA.height - 6);
    context.strokeStyle = '#c8312b'; context.lineWidth = 8; context.beginPath(); context.arc(x + 64, y + 64, 46, 0, Math.PI * 2); context.stroke();
    context.fillStyle = '#1c1c22'; context.font = `800 64px ${FONT}`; context.fillText(kana, x + 64, y + 68);
  });
  BOARD_WORDS.forEach(([title, subtitle, schemeIndex], index) => {
    const x = index % BOARD.columns * BOARD.width, y = BOARD.top + Math.floor(index / BOARD.columns) * BOARD.height;
    if (schemeIndex < 0) {
      // SORA: the exact emblem, centred on the board, over the wordmark.
      frame(x, y, BOARD.width, BOARD.height, { ground: '#ffffff', ink: '#c8312b', rule: '#c8312b' });
      if (emblem) context.drawImage(emblem, EMBLEM_CIRCLE.x, EMBLEM_CIRCLE.y, EMBLEM_CIRCLE.size, EMBLEM_CIRCLE.size,
        x + BOARD.width / 2 - 66, y + 20, 132, 132);
      context.fillStyle = '#2a2230'; context.font = `900 54px ${FONT}`;
      context.fillText(title, x + BOARD.width / 2, y + 186, BOARD.width - 80);
      context.fillStyle = '#c8312b'; context.font = `700 22px ${FONT}`; context.fillText(subtitle, x + BOARD.width / 2, y + 228, BOARD.width - 80);
      return;
    }
    const scheme = SCHEMES[schemeIndex % SCHEMES.length]!;
    frame(x, y, BOARD.width, BOARD.height, scheme);
    context.fillStyle = scheme.ink; context.font = `900 96px ${index % 2 ? SERIF : FONT}`;
    context.fillText(title, x + BOARD.width / 2, y + 102, BOARD.width - 40);
    context.font = `700 34px ${FONT}`; context.fillText(subtitle, x + BOARD.width / 2, y + 194, BOARD.width - 60);
  });
}

/** The shared sign atlas; it redraws once the bundled Japanese font and the emblem arrive. */
export function signAtlas(emblemUrl: string): { texture: THREE.CanvasTexture; ready: Promise<void> } {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;
  draw(context, null);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.name = 'SORA period sign atlas';
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  const emblem = new Image();
  const emblemReady = new Promise<HTMLImageElement | null>(resolve => {
    emblem.onload = () => resolve(emblem); emblem.onerror = () => resolve(null);
  });
  emblem.src = emblemUrl;
  const ready = Promise.all([emblemReady, document.fonts.load(`800 58px SoraJP`, '喫茶寿司').catch(() => [])])
    .then(() => document.fonts.ready).then(async () => {
      draw(context, await emblemReady); texture.needsUpdate = true;
    });
  atlas = { texture, ready };
  return atlas;
}

/**
 * The second atlas: neon tube signs on dark boards (16, 512 x 256), nobori
 * street banners (32, 128 x 512), cloth banners and tall vertical neon signs
 * (16, 128 x 512). The SORA designs draw the exact emblem, centred: a lit
 * plaque in a neon ring, a white roundel on red cloth.
 */
const NEON_WIDTH = 2048, NEON_HEIGHT = 3072;
const NEON = { width: 512, height: 256, columns: 4, rows: 4, top: 0 } as const;
const NOBORI = { width: 128, height: 512, columns: 16, rows: 2, top: 1024 } as const;
/** Cloth banners strung across the street (横断幕), the exact emblem centred between two words. */
const BANNER = { width: 1024, height: 128, columns: 2, rows: 2, top: 2048 } as const;
/** Tall vertical neon signs (縦型ネオン), one character above another; the bottom row of the atlas (materials.ts reads where it starts). */
const VNEON = { width: 128, height: 512, columns: 16, rows: 1, top: 2304 } as const;
/** Where the vertical neon row starts and ends in texture v (materials.ts spells those signs out from the top). */
export const VNEON_TOP_V = (NEON_HEIGHT - VNEON.top) / NEON_HEIGHT;
export const VNEON_BOTTOM_V = (NEON_HEIGHT - VNEON.top - VNEON.height) / NEON_HEIGHT;
/**
 * Shop-front lights (refine round 4, the user's rain-night concept): red paper lanterns (赤提灯) printed with the
 * shop's trade, and small lit box signs (行灯看板) of one or two characters, cream with ink lettering. The SORA
 * designs draw the exact emblem, centred.
 */
const LANTERN = { width: 128, height: 256, columns: 8, rows: 1, top: 2816, left: 0 } as const;
const BOX = { width: 128, height: 128, columns: 8, rows: 2, top: 2816, left: 1024 } as const;
const LANTERN_WORDS: readonly (readonly [string, string, string])[] = [
  ['やきとり', '#c8312b', '#1a1012'], ['酒', '#c8312b', '#1a1012'], ['おでん', '#d8402c', '#1a1012'], ['居酒屋', '#c8312b', '#f6ead2'],
  ['ラーメン', '#c8312b', '#f6ead2'], ['焼肉', '#b8281f', '#f6ead2'], ['寿司', '#f2ead8', '#c8312b'], ['SORA', '#f6f2e8', '#c8312b'],
];
const BOX_WORDS: readonly (readonly [string, string, string])[] = [
  ['酒', '#f6efdc', '#1a1012'], ['焼鳥', '#f6efdc', '#1a1012'], ['喫茶', '#f6efdc', '#5a2a1a'], ['質', '#f6efdc', '#c8312b'],
  ['湯', '#f6efdc', '#1f4fae'], ['麺', '#f6efdc', '#c8312b'], ['寿司', '#f6efdc', '#1a1012'], ['薬', '#f6efdc', '#1e6a4c'],
  ['茶', '#f6efdc', '#1e6a4c'], ['本', '#f6efdc', '#1a1012'], ['酒場', '#f2c53d', '#1a1012'], ['BAR', '#2c2523', '#f2a640'],
  ['スナック', '#6b2a5c', '#ffd9ef'], ['理容', '#f6efdc', '#1f3f7a'], ['写真', '#f6efdc', '#1a1012'], ['SORA', '#f6f2e8', '#c8312b'],
];
const VNEON_WORDS: readonly (readonly [string, string])[] = [
  ['スナック', '#ff4fa0'], ['カラオケ', '#ffe040'], ['喫茶', '#ffe8c0'], ['麻雀', '#50ff9a'], ['ホテル', '#5a8aff'], ['パチンコ', '#ffd040'],
  ['ラーメン', '#ff5a3a'], ['SORA', '#ff3a3a'], ['クラブ', '#b070ff'], ['ディスコ', '#ff3ad8'], ['焼肉', '#ff8a3a'], ['ゲーム', '#50ff7a'],
  ['パブ', '#ff4a4a'], ['居酒屋', '#ff9a3a'], ['ビデオ', '#3ff0ff'], ['中古レコード', '#ff6ab8'],
];
const BANNER_WORDS: readonly (readonly [string, string, string, string])[] = [
  ['SORA', 'CARS', '#efe4cc', '#b3292a'], ['SORA', '1986', '#c8312b', '#ffffff'], ['ソラ', 'SORA', '#f6f2e8', '#c8312b'], ['SORA', 'RACING', '#1f2f5a', '#ffffff'],
];
const NEON_WORDS: readonly (readonly [string, string])[] = [
  ['BAR', '#ff4fa0'], ['スナック', '#3ff0ff'], ['カラオケ', '#ffe040'], ['COFFEE', '#ff9a3a'], ['GAME', '#50ff7a'], ['DISCO', '#ff3ad8'],
  ['HOTEL', '#5a8aff'], ['SORA', '#ff3a3a'], ['CLUB', '#b070ff'], ['PUB', '#ff4a4a'], ['麻雀', '#50ff9a'], ['焼肉', '#ff8a3a'],
  ['パチンコ', '#ffd040'], ['LIVE', '#3ff0ff'], ['喫茶', '#ffe8c0'], ['ラーメン', '#ff5a3a'],
];
const NOBORI_WORDS: readonly (readonly [string, string, string])[] = [
  ['SORA', '#c8312b', '#ffffff'], ['SORA', '#c8312b', '#ffffff'], ['SORA', '#c8312b', '#ffffff'], ['SORA', '#c8312b', '#ffffff'],
  ['ラーメン', '#c8312b', '#f6d77c'], ['営業中', '#f4f0e4', '#1f3f7a'], ['大売出し', '#f4f0e4', '#c8312b'], ['ゆ', '#1f4fae', '#ffffff'],
  ['たこ焼', '#e7782c', '#ffffff'], ['焼き鳥', '#2c2523', '#f2a640'], ['うどん', '#f4f0e4', '#2c2523'], ['カレー', '#e7b53a', '#8c1f24'],
  ['甘味処', '#1e6a4c', '#f4ead2'], ['団子', '#f8d2df', '#6b2a5c'], ['甘酒', '#f4f0e4', '#6b2a5c'], ['湯波', '#1e6a4c', '#ffffff'],
  ['みやげ', '#6b2a5c', '#ffd9ef'], ['温泉', '#1f4fae', '#ffffff'], ['酒', '#1f3f7a', '#ffffff'], ['新装開店', '#c8312b', '#f6d77c'],
  ['大特価', '#f2c53d', '#c8312b'], ['セール', '#c8312b', '#ffffff'], ['コーヒー', '#4a2a1a', '#f6d77c'], ['ビール', '#f2c53d', '#2c2523'],
  ['寿司', '#f4f0e4', '#1f3f7a'], ['天ぷら', '#e7b53a', '#2c2523'], ['そば', '#2c2523', '#f4ead2'], ['饅頭', '#f4f0e4', '#8c1f24'],
  ['羊羹', '#4a2a1a', '#f4ead2'], ['寄木', '#8a6a44', '#ffffff'], ['焼肉', '#2c2523', '#ff8a3a'], ['質', '#f4f0e4', '#c8312b'],
];
export type NeonKind = 'neon' | 'nobori' | 'banner' | 'vneon' | 'lantern' | 'box';
export const NEON_COUNTS = { neon: NEON.columns * NEON.rows, nobori: NOBORI.columns * NOBORI.rows, banner: BANNER.columns * BANNER.rows,
  vneon: VNEON.columns * VNEON.rows, lantern: LANTERN.columns * LANTERN.rows, box: BOX.columns * BOX.rows } as const;
/** The index of a lantern or box design by its word. */
export function lanternIndex(word: string): number { const i = LANTERN_WORDS.findIndex(([w]) => w === word); if (i < 0) throw new Error(`No lantern "${word}".`); return i; }
export function boxIndex(word: string): number { const i = BOX_WORDS.findIndex(([w]) => w === word); if (i < 0) throw new Error(`No box sign "${word}".`); return i; }
/** The SORA designs in each region. */
export const SORA_NEON = NEON_WORDS.findIndex(([word]) => word === 'SORA');
export const SORA_VNEON = VNEON_WORDS.findIndex(([word]) => word === 'SORA');
export const SORA_NOBORI = NOBORI_WORDS.flatMap(([word], index) => word === 'SORA' ? [index] : []);
export function neonPrint(kind: NeonKind, index: number): PrintRect {
  const region = kind === 'neon' ? NEON : kind === 'nobori' ? NOBORI : kind === 'vneon' ? VNEON : kind === 'lantern' ? LANTERN : kind === 'box' ? BOX : BANNER;
  const count = region.columns * region.rows, i = ((index % count) + count) % count, left = 'left' in region ? region.left : 0;
  const x = left + i % region.columns * region.width, y = region.top + Math.floor(i / region.columns) * region.height;
  return [(x + .5) / NEON_WIDTH, 1 - (y + region.height - .5) / NEON_HEIGHT, (x + region.width - .5) / NEON_WIDTH, 1 - (y + .5) / NEON_HEIGHT];
}
export function neonIndex(word: string): number {
  const index = NEON_WORDS.findIndex(([name]) => name === word);
  if (index < 0) throw new Error(`No neon "${word}".`);
  return index;
}
export function vneonIndex(word: string): number {
  const index = VNEON_WORDS.findIndex(([name]) => name === word);
  if (index < 0) throw new Error(`No vertical neon "${word}".`);
  return index;
}
export function noboriIndex(word: string): number {
  const index = NOBORI_WORDS.findIndex(([name]) => name === word);
  if (index < 0) throw new Error(`No nobori "${word}".`);
  return index;
}

/** The exact emblem, clipped to its own circle (the crop's corners are white), centred at (cx, cy). */
function drawEmblem(context: CanvasRenderingContext2D, emblem: HTMLImageElement, cx: number, cy: number, radius: number): void {
  context.save(); context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.clip();
  context.drawImage(emblem, EMBLEM_CIRCLE.x, EMBLEM_CIRCLE.y, EMBLEM_CIRCLE.size, EMBLEM_CIRCLE.size, cx - radius, cy - radius, radius * 2, radius * 2);
  context.restore();
}

function drawNeon(context: CanvasRenderingContext2D, emblem: HTMLImageElement | null): void {
  context.clearRect(0, 0, NEON_WIDTH, NEON_HEIGHT);
  context.textAlign = 'center'; context.textBaseline = 'middle';
  NEON_WORDS.forEach(([word, colour], index) => {
    const x = index % NEON.columns * NEON.width, y = NEON.top + Math.floor(index / NEON.columns) * NEON.height;
    context.fillStyle = '#120a16'; context.fillRect(x, y, NEON.width, NEON.height);
    context.strokeStyle = 'rgba(80,60,90,.8)'; context.lineWidth = 4; context.strokeRect(x + 6, y + 6, NEON.width - 12, NEON.height - 12);
    // A glowing tube: a wide coloured halo, the tube, then its hot white core.
    const tube = (draw: () => void) => {
      context.shadowColor = colour; context.shadowBlur = 26; context.strokeStyle = colour; context.lineWidth = 12; draw();
      context.shadowBlur = 0; context.lineWidth = 6; draw();
      context.lineWidth = 2; context.strokeStyle = '#fff6f0'; draw();
    };
    if (word === 'SORA') {
      // The exact emblem centred in a neon ring, the name in tubes below it.
      const cx = x + NEON.width / 2, cy = y + 92;
      if (emblem) drawEmblem(context, emblem, cx, cy, 66);
      tube(() => { context.beginPath(); context.arc(cx, cy, 76, 0, Math.PI * 2); context.stroke(); });
      context.font = `800 64px ${FONT}`;
      tube(() => context.strokeText(word, cx, y + 214, NEON.width - 80));
      return;
    }
    context.font = `800 ${[...word].length > 3 ? 92 : 130}px ${FONT}`;
    tube(() => context.strokeText(word, x + NEON.width / 2, y + NEON.height / 2, NEON.width - 60));
  });
  NOBORI_WORDS.forEach(([word, cloth, ink], index) => {
    const x = index % NOBORI.columns * NOBORI.width, y = NOBORI.top + Math.floor(index / NOBORI.columns) * NOBORI.height;
    context.fillStyle = cloth; context.fillRect(x, y, NOBORI.width, NOBORI.height);
    context.fillStyle = 'rgba(0,0,0,.18)'; context.fillRect(x, y, NOBORI.width, 26); context.fillRect(x, y + NOBORI.height - 14, NOBORI.width, 14);
    if (word === 'SORA') {
      // The exact emblem centred in a white roundel, the name below.
      context.fillStyle = '#ffffff'; context.beginPath(); context.arc(x + NOBORI.width / 2, y + 120, 56, 0, Math.PI * 2); context.fill();
      if (emblem) drawEmblem(context, emblem, x + NOBORI.width / 2, y + 120, 48);
      context.fillStyle = ink; context.font = `900 62px ${FONT}`;
      [...'SORA'].forEach((character, i) => context.fillText(character, x + NOBORI.width / 2, y + 232 + i * 68));
      return;
    }
    const characters = [...word], step = Math.min(96, (NOBORI.height - 80) / characters.length);
    context.fillStyle = ink; context.font = `900 ${Math.round(step * .86)}px ${FONT}`;
    characters.forEach((character, i) => context.fillText(character, x + NOBORI.width / 2, y + 60 + step / 2 + i * step, NOBORI.width - 18));
  });
  BANNER_WORDS.forEach(([left, right, cloth, ink], index) => {
    const x = index % BANNER.columns * BANNER.width, y = BANNER.top + Math.floor(index / BANNER.columns) * BANNER.height;
    const cx = x + BANNER.width / 2, cy = y + BANNER.height / 2;
    context.fillStyle = cloth; context.fillRect(x, y, BANNER.width, BANNER.height);
    context.fillStyle = 'rgba(0,0,0,.14)'; context.fillRect(x, y, BANNER.width, 10); context.fillRect(x, y + BANNER.height - 10, BANNER.width, 10);
    // The exact emblem in the centre on a white roundel, a word either side.
    context.fillStyle = '#ffffff'; context.beginPath(); context.arc(cx, cy, 54, 0, Math.PI * 2); context.fill();
    if (emblem) drawEmblem(context, emblem, cx, cy, 48);
    context.fillStyle = ink; context.font = `900 76px ${FONT}`;
    context.fillText(left, cx - 80 - (BANNER.width / 2 - 120) / 2, cy + 4, BANNER.width / 2 - 140);
    context.fillText(right, cx + 80 + (BANNER.width / 2 - 120) / 2, cy + 4, BANNER.width / 2 - 140);
  });
  LANTERN_WORDS.forEach(([word, paper, ink], index) => {
    // A paper lantern seen flat: the paper between dark rims at top and bottom, ribbed, the word down its middle.
    const x = LANTERN.left + index * LANTERN.width, y = LANTERN.top, cx = x + LANTERN.width / 2;
    context.fillStyle = paper; context.fillRect(x, y, LANTERN.width, LANTERN.height);
    context.fillStyle = 'rgba(0,0,0,.16)';
    for (let r = y + 22; r < y + LANTERN.height - 20; r += 18) context.fillRect(x, r, LANTERN.width, 2);
    context.fillStyle = 'rgba(255,255,255,.18)'; context.fillRect(x + 18, y, 16, LANTERN.height);
    context.fillStyle = '#1c1416'; context.fillRect(x, y, LANTERN.width, 16); context.fillRect(x, y + LANTERN.height - 16, LANTERN.width, 16);
    if (word === 'SORA') {
      // The exact emblem centred on the paper, the name below it.
      if (emblem) drawEmblem(context, emblem, cx, y + 92, 44);
      context.fillStyle = ink; context.font = `900 36px ${FONT}`; context.fillText(word, cx, y + 182, LANTERN.width - 20);
      return;
    }
    const characters = [...word], step = Math.min(64, (LANTERN.height - 64) / characters.length);
    context.fillStyle = ink; context.font = `900 ${Math.round(step * .86)}px ${FONT}`;
    characters.forEach((character, i) => context.fillText(character, cx, y + LANTERN.height / 2 + (i - (characters.length - 1) / 2) * step, LANTERN.width - 28));
  });
  BOX_WORDS.forEach(([word, ground, ink], index) => {
    // A small lit box: a dark frame round a glowing face, the word big in the middle.
    const x = BOX.left + index % BOX.columns * BOX.width, y = BOX.top + Math.floor(index / BOX.columns) * BOX.height;
    const cx = x + BOX.width / 2, cy = y + BOX.height / 2;
    context.fillStyle = '#1c1416'; context.fillRect(x, y, BOX.width, BOX.height);
    context.fillStyle = ground; context.fillRect(x + 10, y + 10, BOX.width - 20, BOX.height - 20);
    if (word === 'SORA') {
      if (emblem) drawEmblem(context, emblem, cx, cy - 10, 36);
      context.fillStyle = ink; context.font = `900 22px ${FONT}`; context.fillText(word, cx, y + BOX.height - 24, BOX.width - 30);
      return;
    }
    const characters = [...word], size = characters.length === 1 ? 84 : characters.length === 2 ? 50 : 30;
    context.fillStyle = ink; context.font = `900 ${size}px ${FONT}`;
    if (characters.length === 2 && /[\u3000-\u9fff]/.test(word)) {
      // Two kanji stacked, as box signs set them.
      characters.forEach((character, i) => context.fillText(character, cx, cy + (i - .5) * 48, BOX.width - 26));
    } else context.fillText(word, cx, cy + 3, BOX.width - 26);
  });
  VNEON_WORDS.forEach(([word, colour], index) => {
    const x = index * VNEON.width, y = VNEON.top, cx = x + VNEON.width / 2;
    context.fillStyle = '#120a16'; context.fillRect(x, y, VNEON.width, VNEON.height);
    context.strokeStyle = 'rgba(80,60,90,.8)'; context.lineWidth = 4; context.strokeRect(x + 5, y + 5, VNEON.width - 10, VNEON.height - 10);
    const tube = (draw: () => void) => {
      context.shadowColor = colour; context.shadowBlur = 18; context.strokeStyle = colour; context.lineWidth = 9; draw();
      context.shadowBlur = 0; context.lineWidth = 4; draw();
      context.lineWidth = 1.5; context.strokeStyle = '#fff6f0'; draw();
    };
    // Characters stacked top to bottom (the reveal runs the same way); Latin letters too, as on 1980s towers.
    const characters = [...word], top = word === 'SORA' ? y + 150 : y + 34;
    if (word === 'SORA') {
      // The exact emblem centred in a neon ring above the name.
      if (emblem) drawEmblem(context, emblem, cx, y + 72, 44);
      tube(() => { context.beginPath(); context.arc(cx, y + 72, 52, 0, Math.PI * 2); context.stroke(); });
    }
    const step = Math.min(92, (y + VNEON.height - 30 - top) / characters.length);
    context.font = `800 ${Math.round(step * .82)}px ${FONT}`;
    characters.forEach((character, i) => tube(() => context.strokeText(character, cx, top + step / 2 + i * step, VNEON.width - 24)));
  });
}

let neonAtlas: { texture: THREE.CanvasTexture; ready: Promise<void> } | undefined;
/** The neon and nobori atlas; it redraws once the bundled font and the emblem arrive. */
export function neonAtlasTexture(emblemUrl: string): { texture: THREE.CanvasTexture; ready: Promise<void> } {
  if (neonAtlas) return neonAtlas;
  const canvas = document.createElement('canvas'); canvas.width = NEON_WIDTH; canvas.height = NEON_HEIGHT;
  const context = canvas.getContext('2d')!;
  drawNeon(context, null);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.name = 'SORA period neon and nobori atlas';
  const emblem = new Image();
  const emblemReady = new Promise<HTMLImageElement | null>(resolve => { emblem.onload = () => resolve(emblem); emblem.onerror = () => resolve(null); });
  emblem.src = emblemUrl;
  const ready = Promise.all([emblemReady, document.fonts.load('800 92px SoraJP', 'スナック').catch(() => [])])
    .then(() => document.fonts.ready).then(async () => { drawNeon(context, await emblemReady); texture.needsUpdate = true; });
  neonAtlas = { texture, ready };
  return neonAtlas;
}
