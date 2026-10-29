import type { CityMeshBuilder } from './geometry';
import type { PeriodDistrict } from './layout';
import { neonIndex, neonPrint, noboriIndex, SORA_NEON, SORA_NOBORI, SORA_VNEON, vneonIndex } from './signs';

/**
 * Street life on the buildings: neon tube signs on bar buildings and
 * rooftops (flickering, some blinking), chasing bulbs, nobori banners
 * rippling on their poles, SORA banners hung down facades, and red
 * aviation lights. Building-local coordinates as in geometry.ts (facade at
 * z = 0 facing -Z); each takes its own random stream so the buildings it
 * decorates keep their look.
 */
type Random = () => number;

/** Neon by district: Kanda's bars and coffee shops, the onsen town's snack bars, the harbour's clubs. */
const NEON_WORDS: Partial<Record<PeriodDistrict, readonly string[]>> = {
  kanda: ['BAR', 'スナック', 'カラオケ', 'COFFEE', 'GAME', 'CLUB', 'PUB', '麻雀', '焼肉', '喫茶', 'ラーメン', 'LIVE'],
  residential: ['スナック', '喫茶', '麻雀', 'カラオケ', '焼肉', 'ラーメン', 'BAR'],
  town: ['スナック', '喫茶', 'カラオケ', '焼肉', 'ラーメン'],
  office: ['COFFEE', '喫茶', '麻雀', 'BAR', 'PUB'],
  government: ['COFFEE', '喫茶'],
  onsen: ['スナック', 'カラオケ', 'BAR', 'HOTEL', '麻雀', '喫茶', 'GAME'],
  nikko: ['喫茶', 'HOTEL', 'COFFEE'],
  harbour: ['BAR', 'CLUB', 'PUB', 'DISCO', 'LIVE', 'HOTEL', 'COFFEE'],
};
/** Tall vertical neon by district: Kanda's snack bars and record shops, the onsen town's hotels, the harbour's clubs. */
const VNEON_WORDS: Partial<Record<PeriodDistrict, readonly string[]>> = {
  kanda: ['スナック', 'カラオケ', '喫茶', '麻雀', 'ラーメン', 'パブ', '居酒屋', 'ビデオ', '中古レコード', 'ゲーム', '焼肉'],
  town: ['スナック', '喫茶', '居酒屋', 'ラーメン'],
  residential: ['スナック', '喫茶', '麻雀', '居酒屋', 'カラオケ'],
  office: ['喫茶', '麻雀', '居酒屋', 'パブ'],
  onsen: ['ホテル', 'スナック', 'カラオケ', 'ゲーム', '居酒屋'],
  harbour: ['クラブ', 'ディスコ', 'パブ', 'ホテル', 'カラオケ'],
};
/** Nobori by district and trade: Hakone's yosegi and manju, Nikko's yuba and yokan, pachinko's grand reopenings. */
const NOBORI_WORDS: Readonly<Record<PeriodDistrict | 'pachinko' | 'station' | 'ryokan', readonly string[]>> = {
  kanda: ['ラーメン', '営業中', '大売出し', 'たこ焼', '焼き鳥', 'うどん', 'カレー', 'コーヒー', 'ビール', '寿司', '天ぷら', 'そば', '焼肉', '質', 'セール', '大特価'],
  residential: ['営業中', '酒', 'たこ焼', '質', 'セール', 'コーヒー', 'うどん'],
  office: ['営業中', 'コーヒー', 'そば', 'カレー'],
  government: ['営業中'],
  onsen: ['温泉', 'ゆ', '饅頭', '寄木', 'みやげ', '甘酒', 'そば', '団子', '営業中'],
  nikko: ['湯波', '羊羹', '甘味処', '団子', 'みやげ', 'そば', '甘酒', '営業中'],
  town: ['営業中', 'そば', 'うどん', 'ラーメン', '大売出し', 'コーヒー', '焼き鳥', 'セール'],
  harbour: ['ビール', '営業中', '寿司'],
  pachinko: ['新装開店', '大売出し', '新装開店', '大特価'],
  station: ['セール', '大特価'],
  ryokan: ['温泉', 'ゆ'],
  moat: ['営業中'], park: ['営業中'], shrine: ['甘酒', '団子'], temple: ['御朱印', '線香'], pond: ['営業中'], rural: ['営業中'], forest: ['営業中'], quay: ['営業中'],
};

/** A neon design for a district; SORA's own sign about one time in seven. */
export function neonFor(district: PeriodDistrict, random: Random, sora = .14): number {
  if (random() < sora) return SORA_NEON;
  const words = NEON_WORDS[district] ?? NEON_WORDS.kanda!;
  return neonIndex(words[Math.floor(random() * words.length)]!);
}
/** A vertical neon for a district; SORA's own about one time in six. */
export function vneonFor(district: PeriodDistrict, random: Random, sora = .17): number {
  if (random() < sora) return SORA_VNEON;
  const words = VNEON_WORDS[district] ?? VNEON_WORDS.kanda!;
  return vneonIndex(words[Math.floor(random() * words.length)]!);
}
/** A nobori design for a district or trade; SORA's banner about one time in four. */
export function noboriFor(trade: keyof typeof NOBORI_WORDS, random: Random, sora = .25): number {
  if (random() < sora) return SORA_NOBORI[Math.floor(random() * SORA_NOBORI.length)]!;
  const words = NOBORI_WORDS[trade];
  return noboriIndex(words[Math.floor(random() * words.length)]!);
}

/**
 * A rectangle in a vertical plane through (cx, cz) whose normal (nx, nz) is
 * horizontal; the print reads left to right for a viewer facing it.
 */
function upright(b: CityMeshBuilder, key: 'neon' | 'flag' | 'metal', cx: number, cz: number, half: number, y0: number, y1: number, nx: number, nz: number): void {
  const rx = -nz * half, rz = nx * half;
  b.face(key, [[cx + rx, y0, cz + rz], [cx - rx, y0, cz - rz], [cx - rx, y1, cz - rz], [cx + rx, y1, cz + rz]], [nx, 0, nz]);
}
/** Neon phase and mode ride in the vertex colour (materials.ts): blinking, or spelled out letter by letter (`spelled` is the mode for that). */
function neonTint(b: CityMeshBuilder, random: Random, blink: number, reveal = 0, spelled = 2): void {
  const roll = random();
  b.colour.setRGB(random(), roll < reveal ? spelled : roll < reveal + blink ? 1 : 0, 0);
}

/** A neon blade (袖看板) standing out from the facade on its brackets, lit both sides toward the street's two directions. */
export function neonBlade(b: CityMeshBuilder, px: number, y0: number, out: number, index: number, random: Random): void {
  const height = out / 2, z0 = -.3, z1 = z0 - out;
  b.colour.set('#1a161c');
  b.box('metal', px - .08, px + .08, y0 - .05, y0 + height + .05, z1 - .05, z0, 'b');
  for (const y of [y0 + .12, y0 + height - .12]) b.box('metal', px - .03, px + .03, y - .03, y + .03, z0, 0, 'b');
  b.print = neonPrint('neon', index); neonTint(b, random, .25, .3);
  b.side('neon', px - .09, z1, z0, y0, y0 + height, -1);
  b.side('neon', px + .09, z1, z0, y0, y0 + height, 1);
}

/**
 * A tall vertical neon (縦型ネオン) standing out from the facade on its
 * brackets, one character above another, lit both sides; most spell
 * themselves out from the top, hold, flash and go dark.
 */
export function verticalNeon(b: CityMeshBuilder, px: number, y0: number, height: number, index: number, random: Random): void {
  const out = height / 4, z0 = -.3, z1 = z0 - out;
  b.colour.set('#1a161c');
  b.box('metal', px - .09, px + .09, y0 - .08, y0 + height + .08, z1 - .06, z0, 'b');
  for (const y of [y0 + .3, y0 + height / 2, y0 + height - .3]) b.box('metal', px - .03, px + .03, y - .03, y + .03, z0, 0, 'b');
  b.print = neonPrint('vneon', index); neonTint(b, random, .2, .55, 3);
  b.side('neon', px - .1, z1, z0, y0, y0 + height, -1);
  b.side('neon', px + .1, z1, z0, y0, y0 + height, 1);
}

/**
 * A big rooftop neon on its steel stand, turned toward approaching drivers
 * (`toward`), a row of chasing bulbs along its catwalk.
 */
export function rooftopNeon(b: CityMeshBuilder, w: number, d: number, h: number, index: number, random: Random, toward: -1 | 1): void {
  const width = Math.min(w * .82, 8), height = width / 2, lift = 1.2 + random() * .9, cz = Math.min(2.2, d * .25);
  const turn = .45 + random() * .3, nx = toward * Math.sin(turn), nz = -Math.cos(turn), rx = -nz, rz = nx;
  b.colour.set('#2c2a2e');
  for (const s of [-1, 1]) {
    const lx = s * (width / 2 - .5) * rx, lz = cz + s * (width / 2 - .5) * rz;
    b.box('metal', lx - .1, lx + .1, h, h + lift + height, lz - .1 + .25, lz + .1 + .25, 'b');
  }
  upright(b, 'metal', -nx * .12, cz - nz * .12, width / 2 + .08, h + lift - .1, h + lift + height + .08, -nx, -nz);
  upright(b, 'metal', 0, cz + nz * .02, width / 2 + .08, h + lift - .1, h + lift + height + .08, nx, nz);
  b.print = neonPrint('neon', index); neonTint(b, random, .25, .4);
  upright(b, 'neon', nx * .01, cz + nz * .01, width / 2, h + lift, h + lift + height, nx, nz);
  // The catwalk and its running lights.
  b.colour.set('#3a3a3e');
  upright(b, 'metal', nx * .3, cz + nz * .3, width / 2, h + lift - .32, h + lift - .12, nx, nz);
  b.colour.set('#ffd9a0');
  for (let i = 0, n = Math.round(width / .42); i < n; i++) {
    const t = (i + .5) / n - .5, px = nx * .36 + t * width * rx, pz = cz + nz * .36 + t * width * rz;
    b.animation = [(i % 3) / 3, 1];
    b.box('lamp', px - .06, px + .06, h + lift - .3, h + lift - .18, pz - .06, pz + .06, 'b');
  }
  b.animation = [0, 0];
}

/** Neon in a coffee shop's or bar's window, just inside the glass. */
export function windowNeon(b: CityMeshBuilder, cx: number, y0: number, index: number, random: Random, z: number): void {
  b.print = neonPrint('neon', index); neonTint(b, random, .2);
  b.front('neon', cx - .6, cx + .6, y0, y0 + .6, z);
}

/**
 * A nobori on its pole at (px, pz): the cloth flies from the pole turned
 * toward approaching drivers (`toward`), rippling in the wind.
 */
export function nobori(b: CityMeshBuilder, px: number, pz: number, index: number, random: Random, toward: -1 | 1): void {
  const top = 2.7 + random() * .35, bottom = top - 2, width = .5, turn = .5 + random() * .5;
  const nx = toward * Math.sin(turn), nz = -Math.cos(turn), rx = -nz, rz = nx;
  b.colour.set('#d6d6ce'); b.cylinder('metal', px, 0, pz, .025, top + .12, 6);
  upright(b, 'metal', px - rx * width / 2, pz - rz * width / 2, width / 2 + .03, top, top + .04, nx, nz);
  b.colour.set('#3a3a3e'); b.cylinder('stone', px, 0, pz, .16, .12, 8);
  // The pole holds the print's left edge, the free edge waves (materials.ts).
  b.print = neonPrint('nobori', index); b.colour.setRGB(random(), 0, 0);
  b.face('flag', [[px, bottom, pz], [px - rx * width, bottom, pz - rz * width], [px - rx * width, top, pz - rz * width], [px, top, pz]], [nx, 0, nz]);
}

/** A long cloth banner (懸垂幕) hung down the facade from a batten under the parapet. */
export function hangingBanner(b: CityMeshBuilder, cx: number, y1: number, width: number, index: number, random: Random): void {
  const y0 = y1 - width * 4;
  b.colour.set('#2a2a2e'); b.box('metal', cx - width / 2 - .06, cx + width / 2 + .06, y1, y1 + .07, -.14, 0, 'bk');
  b.box('metal', cx - width / 2 - .03, cx + width / 2 + .03, y0 - .05, y0, -.12, -.06, 'bk');
  b.print = neonPrint('nobori', index); b.colour.setRGB(random(), 1, 0);
  b.front('flag', cx - width / 2, cx + width / 2, y0, y1, -.09);
}

/** A red aviation light that blinks slowly on a high roof or mast. */
export function aviationLight(b: CityMeshBuilder, px: number, y: number, pz: number, phase: number): void {
  b.colour.set('#ff2c1c'); b.animation = [phase, 2];
  b.box('lamp', px - .15, px + .15, y, y + .24, pz - .15, pz + .15, 'b');
  b.animation = [0, 0];
}
