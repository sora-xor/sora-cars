import * as THREE from 'three';

/**
 * Canvas shop awnings (テント), as the user's rain-night concept draws them
 * over the yakitori shop: stripes of the awning's colour over cream, the
 * shop's word printed big across the slope with a dark outline, and a
 * scalloped valance. The atlas holds masks, not colours, so one design takes
 * any awning colour (materials.ts): red the stripes, green the lettering
 * (0.5 its outline, 1 its face), blue the shading, alpha the valance's
 * scallops. Each cell is 512 x 160: the slope above, the valance in the
 * bottom quarter (AWNING_VALANCE).
 */
const CELL = { width: 512, height: 160 } as const, COLUMNS = 2;
/** Words printed on awnings; design 0 is plain stripes. */
const WORDS = ['', 'やきとり', '寿司', 'そば', '中華', 'とんかつ', '喫茶', '書籍', '時計', 'くすり', 'カメラ', 'レコード', '居酒屋', 'ラーメン',
  '漬物', '甘味', '扇子', 'お茶', '奈良漬', '地酒', '漆器', '湯波', 'みやげ', 'パン', '不動産', '歯科', '旅館', 'SORA', '墨'] as const;
/**
 * Noren (暖簾): the split cloth curtains hung in an eatery's doorway, one character to a panel, as the
 * cutscene-style repaint of a race frame hangs them (art/reference/mockups). They share the atlas and the awning
 * material: solid cloth (the red mask full), cream lettering with a dark outline, the slits between panels cut out of
 * the alpha. A one-character word spans two panels, the slit through it, as real noren do.
 */
const NOREN_WORDS = ['そば', 'すし', 'めし', '甘味', '酒', 'うどん', 'おでん', '天ぷら', '居酒屋', 'やきとり', 'ラーメン', 'とんかつ'] as const;
/** A noren's height and the width of one panel (m). */
export const NOREN_HEIGHT = .72;
const NOREN_PANEL = .55;
const ROWS = Math.ceil((WORDS.length + NOREN_WORDS.length) / COLUMNS), WIDTH = COLUMNS * CELL.width, HEIGHT = ROWS * CELL.height;
/** The valance's share of a print, from its bottom edge. */
export const AWNING_VALANCE = 40 / CELL.height;
const STRIPES = 14;
const FONT = '"Hiragino Kaku Gothic ProN", SoraJP, "Noto Sans JP", sans-serif';
/** Which word suits a shop, by the keywords of its fascia title (signs.ts). */
const BY_TITLE: readonly (readonly [string, string])[] = [
  ['やきとり', 'やきとり'], ['寿司', '寿司'], ['そば', 'そば'], ['中華', '中華'], ['とんかつ', 'とんかつ'], ['喫茶', '喫茶'], ['書店', '書籍'],
  ['時計', '時計'], ['薬局', 'くすり'], ['カメラ', 'カメラ'], ['レコード', 'レコード'], ['居酒屋', '居酒屋'], ['漬物', '漬物'], ['甘味', '甘味'],
  ['扇子', '扇子'], ['茶舗', 'お茶'], ['奈良漬', '奈良漬'], ['酒造', '地酒'], ['会津塗', '漆器'], ['湯波', '湯波'], ['寄木', 'みやげ'],
  ['不動産', '不動産'], ['歯科', '歯科'], ['旅館', '旅館'], ['SORA', 'SORA'], ['墨', '墨'],
];

/** Which noren suits a shop, by the keywords of its fascia title (signs.ts). */
const NOREN_BY_TITLE: readonly (readonly [string, string])[] = [
  ['そば', 'そば'], ['寿司', 'すし'], ['鮨', 'すし'], ['やきとり', 'やきとり'], ['焼鳥', 'やきとり'], ['居酒屋', '居酒屋'], ['ラーメン', 'ラーメン'],
  ['中華', 'ラーメン'], ['とんかつ', 'とんかつ'], ['甘味', '甘味'], ['おでん', 'おでん'], ['天ぷら', '天ぷら'], ['うどん', 'うどん'],
  ['食堂', 'めし'], ['定食', 'めし'], ['酒', '酒'],
];
const norenPanels = (index: number) => Math.max(2, [...NOREN_WORDS[index]!].length);
/** The noren design for a shop's fascia title, or -1 when its trade hangs none. */
export function norenFor(title: string): number {
  const word = NOREN_BY_TITLE.find(([key]) => title.includes(key))?.[1];
  return word ? NOREN_WORDS.indexOf(word as typeof NOREN_WORDS[number]) : -1;
}
/** The noren design printed with `word`. */
export function norenIndex(word: string): number { return Math.max(0, NOREN_WORDS.indexOf(word as typeof NOREN_WORDS[number])); }
export const NOREN_COUNT = NOREN_WORDS.length;
/** A noren's width (m): its panels side by side. */
export function norenWidth(index: number): number { return norenPanels(index) * NOREN_PANEL; }
/** The atlas rectangle (u0, v0, u1, v1) of noren design `index`: the left part of its cell, at the noren's own proportions. */
export function norenPrint(index: number): [number, number, number, number] {
  const cell = WORDS.length + index, x = cell % COLUMNS * CELL.width, y = Math.floor(cell / COLUMNS) * CELL.height;
  const width = Math.round(CELL.height * norenWidth(index) / NOREN_HEIGHT);
  return [(x + .5) / WIDTH, 1 - (y + CELL.height - .5) / HEIGHT, (x + width - .5) / WIDTH, 1 - (y + .5) / HEIGHT];
}

/** The awning design for a shop's fascia title: its trade's word, or plain stripes. */
export function awningFor(title: string): number {
  const word = BY_TITLE.find(([key]) => title.includes(key))?.[1];
  return word ? WORDS.indexOf(word as typeof WORDS[number]) : 0;
}
/** The atlas rectangle (u0, v0, u1, v1) of awning design `index`. */
export function awningPrint(index: number): [number, number, number, number] {
  const i = ((index % WORDS.length) + WORDS.length) % WORDS.length;
  const x = i % COLUMNS * CELL.width, y = Math.floor(i / COLUMNS) * CELL.height;
  return [(x + .5) / WIDTH, 1 - (y + CELL.height - .5) / HEIGHT, (x + CELL.width - .5) / WIDTH, 1 - (y + .5) / HEIGHT];
}

/** Paint every design's masks; lettering comes from a scratch canvas drawn white on black. */
function paint(context: CanvasRenderingContext2D): void {
  const image = context.createImageData(WIDTH, HEIGHT), data = image.data;
  const scratch = document.createElement('canvas'); scratch.width = CELL.width; scratch.height = CELL.height;
  const text = scratch.getContext('2d', { willReadFrequently: true })!;
  const stripe = CELL.width / STRIPES, slope = CELL.height * (1 - AWNING_VALANCE), radius = stripe / 2 - .5, hang = slope + 18;
  WORDS.forEach((word, index) => {
    const ox = index % COLUMNS * CELL.width, oy = Math.floor(index / COLUMNS) * CELL.height;
    text.fillStyle = '#000'; text.fillRect(0, 0, CELL.width, CELL.height);
    if (word) {
      // Outline at half, face at full: the green mask.
      text.textAlign = 'center'; text.textBaseline = 'middle';
      text.font = `900 ${[...word].length > 3 ? 66 : 76}px ${FONT}`;
      text.lineJoin = 'round'; text.lineWidth = 13; text.strokeStyle = 'rgb(128,128,128)';
      text.strokeText(word, CELL.width / 2, slope / 2 + 4, CELL.width - 80);
      text.fillStyle = '#fff'; text.fillText(word, CELL.width / 2, slope / 2 + 4, CELL.width - 80);
    }
    const letters = text.getImageData(0, 0, CELL.width, CELL.height).data;
    for (let y = 0; y < CELL.height; y++) for (let x = 0; x < CELL.width; x++) {
      const band = Math.floor(x / stripe), within = x / stripe - band;
      // Stripe edges a pixel soft, so the mips blend the colours rather than flicker between them.
      const edge = Math.min(within, 1 - within) * stripe;
      const tinted = band % 2 === 0 ? 1 : 0, soft = Math.min(1, edge / 1.2);
      let r = tinted ? soft : 1 - soft, b = 1, a = 1;
      if (y < slope) b = 1 - .18 * (y / slope); // lit at the top under the shop's own light, a shade deeper at the fold
      else {
        // The valance: a band, then a scallop hanging from each stripe.
        b = .82; r = tinted;
        if (y > hang && Math.hypot(x - (band + .5) * stripe, y - hang) > radius) a = 0;
      }
      const o = ((oy + y) * WIDTH + ox + x) * 4, g = letters[(y * CELL.width + x) * 4]!;
      data[o] = r * 255; data[o + 1] = y < slope ? g : 0; data[o + 2] = b * 255; data[o + 3] = a * 255;
    }
  });
  NOREN_WORDS.forEach((word, n) => {
    const cell = WORDS.length + n, ox = cell % COLUMNS * CELL.width, oy = Math.floor(cell / COLUMNS) * CELL.height;
    const chars = [...word], panels = norenPanels(n), width = Math.round(CELL.height * norenWidth(n) / NOREN_HEIGHT);
    const panel = width / panels, sleeve = 20, slit = 3.5;
    text.fillStyle = '#000'; text.fillRect(0, 0, CELL.width, CELL.height);
    text.textAlign = 'center'; text.textBaseline = 'middle'; text.lineJoin = 'round';
    const size = Math.min(panel * .74, (CELL.height - sleeve) * .66), cy = sleeve + (CELL.height - sleeve) * .5;
    text.font = `900 ${Math.round(chars.length === 1 ? size * 1.25 : size)}px ${FONT}`;
    text.lineWidth = size * .16; text.strokeStyle = 'rgb(128,128,128)'; text.fillStyle = '#fff';
    const at = (i: number) => chars.length === 1 ? width / 2 : (i + .5) * panel;
    chars.forEach((c, i) => text.strokeText(c, at(i), cy));
    chars.forEach((c, i) => text.fillText(c, at(i), cy));
    const letters = text.getImageData(0, 0, CELL.width, CELL.height).data;
    for (let y = 0; y < CELL.height; y++) for (let x = 0; x < CELL.width; x++) {
      const o = ((oy + y) * WIDTH + ox + x) * 4;
      // Distance to the nearest slit between panels; the cloth curves into each slit, a shade darker there.
      let d = panel;
      for (let k = 1; k < panels; k++) d = Math.min(d, Math.abs(x + .5 - k * panel));
      const cut = x >= width || y > sleeve && d < slit;
      const fold = 1 - Math.min(1, d / (panel * .5));
      data[o] = 255; data[o + 1] = letters[(y * CELL.width + x) * 4]!;
      data[o + 2] = (y < sleeve ? .9 : 1 - .1 * (y / CELL.height) - .14 * fold * fold) * 255; data[o + 3] = cut ? 0 : 255;
    }
  });
  context.putImageData(image, 0, 0);
}

let atlas: THREE.CanvasTexture | undefined;
/** The awning mask atlas (linear data); it repaints once the bundled Japanese font is ready. */
export function awningAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;
  paint(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace; texture.anisotropy = 8; texture.name = 'SORA period shop awnings';
  void document.fonts.load(`900 76px SoraJP`, 'やきとり寿司').catch(() => []).then(() => document.fonts.ready)
    .then(() => { paint(context); texture.needsUpdate = true; });
  atlas = texture;
  return texture;
}
