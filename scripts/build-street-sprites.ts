// Build public/assets/sprites/street-people.png, the race's street-people
// sprite atlas (src/game/three/period-city/street-sprites.ts), from the
// generated sprite sheets in art/street-sprites (prompts and sources:
// docs/art-prompts/street-sprites-v1.json). Each sheet cell is cropped to its
// figure, reduced with a box filter to the atlas scale (a 1.70 m adult is 117
// pixels), its feet set on the baseline and its head centred. Rows with no
// sheet yet fall back to the code-drawn sprites (sprites.ts), enlarged to the cell.
//
// usage: npx tsx scripts/build-street-sprites.ts [--review <png>] [--allow-stand-ins]
// It refuses to overwrite the atlas while any sheet is missing unless
// --allow-stand-ins is given, so a checkout without the sheets cannot
// silently replace the generated art with the code-drawn stand-ins.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import { drawnRow, drawSprites, DRAWN_CELL, type Pixels, type Prints } from '../src/game/three/period-city/sprites';
import { SPRITE_ATLAS, SPRITE_BASELINE, SPRITE_CELL, SPRITE_ROWS, SPRITE_SCALE, spriteRow } from '../src/game/three/period-city/street-sprites';
import { EMBLEM_CIRCLE } from '../src/game/three/sora-emblem';

const { PNG } = pngjs;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEETS = join(root, 'art/street-sprites');
const OUT = join(root, 'public/assets/sprites/street-people.png');

interface Image { readonly width: number; readonly height: number; readonly data: Uint8Array | Uint8ClampedArray }
const read = (file: string): Image => PNG.sync.read(readFileSync(file));

/** A frame: source cell (column, row) of a sheet to atlas row and column; `wide` frames span two atlas cells. */
interface Frame { readonly row: string; readonly column: number; readonly from: readonly [number, number]; readonly wide?: boolean }
interface Sheet {
  readonly file: string; readonly columns: number; readonly rows: number; readonly frames: readonly Frame[];
  /** The cell that sets the scale and its size in atlas pixels (height, or width for a bike's side view). */
  readonly reference: readonly [number, number]; readonly size: number; readonly axis?: 'height' | 'width';
  /** Centre each figure on its head (people) or on its whole extent (cats, bikes). */
  readonly centre?: 'head' | 'box';
  /** Clear stray clusters smaller than this share of the figure's largest, then re-crop (image models leave the odd speck). */
  readonly despeck?: number;
}
/** A walk sheet: row 1 front (standing, left foot, passing, right foot), row 2 back, row 3 a side walk cycle. */
function walker(name: string, size: number): Sheet {
  const cycle = [1, 2, 3, 2];
  return { file: `${name}.png`, columns: 4, rows: 3, reference: [0, 0], size, frames: [
    { row: name, column: 0, from: [0, 0] }, ...cycle.map((c, i) => ({ row: name, column: 1 + i, from: [c, 0] as const })),
    { row: name, column: 5, from: [0, 1] }, ...cycle.map((c, i) => ({ row: name, column: 6 + i, from: [c, 1] as const })),
    { row: name, column: 10, from: [1, 2] }, ...[0, 1, 2, 3].map((c, i) => ({ row: name, column: 11 + i, from: [c, 2] as const })),
  ] };
}
const CATS = ['calico', 'orange-tabby', 'black-cat'] as const;
export const SHEET_SPECS: readonly Sheet[] = [
  walker('salaryman', 78), walker('trench', 78), walker('drunk', 77), walker('office-lady', 73), walker('police', 80),
  walker('schoolgirl', 72), walker('sukeban', 74), walker('schoolboy', 77), walker('bosozoku', 82), walker('bosozoku-black', 81),
  walker('fan', 76), walker('crew', 77), walker('obaachan', 67), walker('housewife', 72), walker('youth', 75), walker('denim', 76),
  walker('yukata-woman', 73), walker('yukata-man', 77), walker('dock', 79), walker('tourist', 77), walker('old-man', 72),
  // Umbrellas open on wet nights: the size covers the canopy over a 1.65 m figure.
  walker('umbrella-salaryman', 90), walker('umbrella-woman', 84),
  // Fans' cheers in double-width cells (the flag swings wide): row 1 four front frames; row 2 two from behind,
  // one from the side, then standing for scale.
  { file: 'fan-cheer.png', columns: 4, rows: 2, reference: [3, 1], size: 76, frames: [
    ...[0, 1, 2, 3].map(c => ({ row: 'fan-cheer', column: c * 2, from: [c, 0] as const, wide: true })),
    { row: 'fan-cheer', column: 8, from: [0, 1], wide: true }, { row: 'fan-cheer', column: 10, from: [1, 1], wide: true },
    { row: 'fan-cheer', column: 12, from: [2, 1], wide: true }, { row: 'fan-cheer', column: 14, from: [2, 1], wide: true },
  ] },
  // Traffic signals in double-width cells: front, back and side, arm out then up; standing for scale last.
  { file: 'police-actions.png', columns: 4, rows: 2, reference: [3, 1], size: 80, frames: [
    ...[0, 1, 2, 3].map(c => ({ row: 'police-signal', column: c * 2, from: [c, 0] as const, wide: true })),
    { row: 'police-signal', column: 8, from: [0, 1], wide: true }, { row: 'police-signal', column: 10, from: [1, 1], wide: true },
  ] },
  // Yankee squats (front, side, back) and arms folded, a row for each coat.
  { file: 'bosozoku-actions.png', columns: 4, rows: 2, reference: [3, 0], size: 82, frames: [
    ...[0, 1, 2, 3].map(c => ({ row: 'bosozoku-squat', column: c, from: [c, 0] as const })),
    ...[0, 1, 2, 3].map(c => ({ row: 'bosozoku-black-squat', column: c, from: [c, 1] as const })),
  ] },
  // Cats, one per row: sitting front and side, two walking strides; then from behind, curled up, walking toward and away.
  { file: 'cats.png', columns: 4, rows: 3, reference: [0, 0], size: 24, centre: 'box', frames: CATS.flatMap((cat, r) => [
    { row: cat, column: 0, from: [0, r] as const }, { row: cat, column: 2, from: [1, r] as const },
    { row: cat, column: 3, from: [2, r] as const }, { row: cat, column: 4, from: [3, r] as const },
  ]) },
  { file: 'cats-2.png', columns: 4, rows: 3, reference: [0, 0], size: 24, centre: 'box', frames: CATS.flatMap((cat, r) => [
    { row: cat, column: 1, from: [0, r] as const }, { row: cat, column: 7, from: [1, r] as const },
    { row: cat, column: 5, from: [2, r] as const }, { row: cat, column: 6, from: [3, r] as const },
  ]) },
  // Cyclists: four side frames (double width), two front and two back.
  ...(['rider-housewife', 'rider-schoolboy'] as const).map((name): Sheet => ({ file: `${name}.png`, columns: 4, rows: 2, reference: [0, 0], size: 74,
    centre: 'box', frames: [...[0, 1, 2, 3].map(c => ({ row: name, column: c * 2, from: [c, 0] as const, wide: true })),
      ...[0, 1, 2, 3].map(c => ({ row: name, column: 8 + c, from: [c, 1] as const }))] })),
  // Parked bosozoku bikes: side (double width), front, back; a row per bike.
  { file: 'bosozoku-bikes.png', columns: 3, rows: 2, reference: [0, 0], size: 94, axis: 'width', centre: 'box', frames: (['bike-purple', 'bike-black'] as const)
    .flatMap((bike, r) => [{ row: bike, column: 0, from: [0, r] as const, wide: true }, { row: bike, column: 2, from: [1, r] as const },
      { row: bike, column: 3, from: [2, r] as const }]) },
  // The routes' locals. Gion's maiko (okobo and her tall hair make her 1.74 m), with a janome-gasa for wet nights.
  walker('maiko', 80), walker('umbrella-maiko', 92),
  // Irohazaka's monkeys on the cats' layout, a third larger than life: sitting front and side, two strides; then from behind,
  // eating, walking toward and away.
  ...(['monkey', 'monkey-mother'] as const).map((name): Sheet => ({ file: `${name}.png`, columns: 4, rows: 2, reference: [0, 0],
    size: name === 'monkey' ? 33 : 31, centre: 'box', frames: ([[0, 0, 0], [2, 1, 0], [3, 2, 0], [4, 3, 0], [1, 0, 1], [7, 1, 1], [5, 2, 1], [6, 3, 1]] as const)
      .map(([column, c, r]) => ({ row: name, column, from: [c, r] as const })) })),
  // Nara's deer: sides in double-width cells (standing, two strides, grazing, bowing, lying), then front and back, standing and walking.
  ...(['deer', 'deer-stag'] as const).map((name): Sheet => ({ file: `${name}.png`, columns: 4, rows: 3, reference: [0, 0],
    size: name === 'deer' ? 60 : 70, centre: 'box', despeck: .05, frames: [
      ...([[0, 0, 0], [2, 1, 0], [4, 2, 0], [6, 3, 0], [8, 0, 1], [10, 1, 1]] as const).map(([column, c, r]) => ({ row: name, column, from: [c, r] as const, wide: true })),
      ...([[12, 2, 1], [13, 3, 1], [14, 0, 2], [15, 1, 2]] as const).map(([column, c, r]) => ({ row: name, column, from: [c, r] as const })),
    ] })),
];

/**
 * The figures on a sheet, as a rows x columns grid of their boxes. Image
 * models keep to the grid only roughly (a bike's side view runs past its cell,
 * a raised glove nears the row above), so each cut between rows, then between
 * the figures of a row, goes along the emptiest line near its nominal place.
 */
export function figures(image: Image, columns: number, rows: number): ({ x0: number; y0: number; x1: number; y1: number } | null)[][] {
  const opaque = (x: number, y: number) => image.data[(y * image.width + x) * 4 + 3]! > 160;
  /** Cuts at the emptiest positions within 45% of a cell of each nominal boundary. */
  const cuts = (count: number, length: number, filled: (at: number) => number) => {
    const list = [0];
    for (let k = 1; k < count; k++) {
      const nominal = k * length / count, reach = .45 * length / count;
      let best = Math.round(nominal), least = Infinity;
      for (let at = Math.round(nominal - reach); at <= Math.round(nominal + reach); at++) {
        const n = filled(at), score = n + Math.abs(at - nominal) / reach * .5;
        if (score < least) { least = score; best = at; }
      }
      list.push(best);
    }
    list.push(length);
    return list;
  };
  const rowCuts = cuts(rows, image.height, y => { let n = 0; for (let x = 0; x < image.width; x++) if (opaque(x, y)) n++; return n; });
  return Array.from({ length: rows }, (_, r) => {
    const y0 = rowCuts[r]!, y1 = rowCuts[r + 1]!;
    const columnCuts = cuts(columns, image.width, x => { let n = 0; for (let y = y0; y < y1; y++) if (opaque(x, y)) n++; return n; });
    return Array.from({ length: columns }, (_, c) => extent(image, columnCuts[c]!, y0, columnCuts[c + 1]!, y1));
  });
}

/** The opaque extent of a sheet cell, ignoring the faint halo image models leave round figures. */
function extent(image: Image, x0: number, y0: number, x1: number, y1: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (image.data[(y * image.width + x) * 4 + 3]! > 160) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
}

/** Box-filter a region down by `scale` (atlas pixels per source pixel); pixels under half covered drop out. */
function reduce(image: Image, box: { x0: number; y0: number; x1: number; y1: number }, scale: number): Image {
  const width = Math.max(1, Math.round((box.x1 - box.x0) * scale)), height = Math.max(1, Math.round((box.y1 - box.y0) * scale));
  const data = new Uint8ClampedArray(width * height * 4), step = 1 / scale;
  for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) {
    const sx0 = box.x0 + tx * step, sy0 = box.y0 + ty * step, sx1 = sx0 + step, sy1 = sy0 + step;
    let r = 0, g = 0, b = 0, a = 0, area = 0;
    for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const w = (Math.min(x + 1, sx1) - Math.max(x, sx0)) * (Math.min(y + 1, sy1) - Math.max(y, sy0));
      const i = (y * image.width + x) * 4, alpha = image.data[i + 3]! / 255 * w;
      r += image.data[i]! * alpha; g += image.data[i + 1]! * alpha; b += image.data[i + 2]! * alpha; a += alpha; area += w;
    }
    const o = (ty * width + tx) * 4;
    if (area > 0 && a / area >= .5) { data[o] = r / a; data[o + 1] = g / a; data[o + 2] = b / a; data[o + 3] = 255; }
  }
  return { width, height, data };
}

/** Clear 8-connected opaque clusters under `share` of the largest, and crop to what is left. */
function despeck(figure: Image, share: number): Image {
  const { width, height, data } = figure, label = new Int32Array(width * height).fill(-1), sizes: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (label[start]! >= 0 || !data[start * 4 + 3]) continue;
    const id = sizes.length, stack = [start]; let size = 0;
    label[start] = id;
    while (stack.length) {
      const k = stack.pop()!, x = k % width, y = (k - x) / width; size++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, n = ny * width + nx;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && label[n]! < 0 && data[n * 4 + 3]) { label[n] = id; stack.push(n); }
      }
    }
    sizes.push(size);
  }
  const keep = Math.max(0, ...sizes) * share;
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let k = 0; k < width * height; k++) if (label[k]! >= 0 && sizes[label[k]!]! >= keep) {
    const x = k % width, y = (k - x) / width;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
  }
  if (x1 <= x0) return figure;
  const out = new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const k = y * width + x; if (label[k]! < 0 || sizes[label[k]!]! < keep) continue;
    out.set(data.subarray(k * 4, k * 4 + 4), ((y - y0) * (x1 - x0) + x - x0) * 4);
  }
  return { width: x1 - x0, height: y1 - y0, data: out };
}

/** The x of a figure's head: the mean column of its top quarter. */
function headCentre(figure: Image): number {
  let sum = 0, count = 0;
  for (let y = 0; y < Math.ceil(figure.height / 4); y++) for (let x = 0; x < figure.width; x++)
    if (figure.data[(y * figure.width + x) * 4 + 3]) { sum += x; count++; }
  return count ? sum / count + .5 : figure.width / 2;
}

class Atlas {
  readonly data = new Uint8ClampedArray(SPRITE_ATLAS.width * SPRITE_ATLAS.height * 4);
  readonly filled = new Set<string>();
  /** Set a figure in cell (row, column), feet on the baseline, centred at `cx` (figure pixels). */
  place(row: number, column: number, figure: Image, cx: number, wide = false): void {
    const cellWidth = SPRITE_CELL.width * (wide ? 2 : 1), left = Math.round(column * SPRITE_CELL.width + cellWidth / 2 - cx);
    const top = row * SPRITE_CELL.height + SPRITE_BASELINE + 1 - figure.height;
    for (let y = 0; y < figure.height; y++) for (let x = 0; x < figure.width; x++) {
      const i = (y * figure.width + x) * 4; if (!figure.data[i + 3]) continue;
      const ax = left + x, ay = top + y;
      if (ax < column * SPRITE_CELL.width || ax >= column * SPRITE_CELL.width + cellWidth || ay < row * SPRITE_CELL.height) continue;
      const o = (ay * SPRITE_ATLAS.width + ax) * 4;
      this.data[o] = figure.data[i]!; this.data[o + 1] = figure.data[i + 1]!; this.data[o + 2] = figure.data[i + 2]!; this.data[o + 3] = 255;
    }
    this.filled.add(`${row}:${column}`); if (wide) this.filled.add(`${row}:${column + 1}`);
  }
  /** Copy a code-drawn cell, enlarged to the atlas cell's height (32 x 64 to 72 x 144), centred across it. */
  enlarge(drawn: Image, fromRow: number, fromColumn: number, row: number, column: number, wide = false): void {
    if (this.filled.has(`${row}:${column}`)) return;
    const enlarge = SPRITE_CELL.height / DRAWN_CELL.height;
    const cellWidth = SPRITE_CELL.width * (wide ? 2 : 1), drawnWidth = DRAWN_CELL.width * enlarge * (wide ? 2 : 1), margin = (cellWidth - drawnWidth) / 2;
    for (let y = 0; y < SPRITE_CELL.height; y++) for (let x = 0; x < cellWidth; x++) {
      const local = x - margin;
      if (local < 0 || local >= drawnWidth) continue;
      const sx = fromColumn * DRAWN_CELL.width + Math.floor(local / enlarge), sy = fromRow * DRAWN_CELL.height + Math.floor(y / enlarge);
      const i = (sy * drawn.width + sx) * 4, o = ((row * SPRITE_CELL.height + y) * SPRITE_ATLAS.width + column * SPRITE_CELL.width + x) * 4;
      for (let k = 0; k < 4; k++) this.data[o + k] = drawn.data[i + k]!;
    }
  }
}

/** SORA's flag and emblem reduced from the supplied artwork for the code-drawn fallback. */
function prints(): Prints {
  const flag = read(join(root, 'public/assets/sora-flag.png')), emblem = read(join(root, 'public/assets/branding/sora-emblem-source.png'));
  const shrink = (image: Image, width: number, height: number): Pixels => {
    const box = { x0: 0, y0: 0, x1: image.width, y1: image.height };
    const small = reduce(image, box, Math.min(width / image.width, height / image.height));
    return { width: small.width, height: small.height, data: small.data };
  };
  const roundel = (size: number): Pixels => {
    // White disc, the emblem clipped to its circle inside it (as sora-emblem.ts draws it), sampled 8 x 8 per pixel.
    const data = new Uint8ClampedArray(size * size * 4), r = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let red = 0, green = 0, blue = 0, hits = 0;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        const px = x + (i + .5) / 8, py = y + (j + .5) / 8, d = Math.hypot(px - r, py - r);
        if (d > r) continue;
        hits++;
        if (d > r * .9) { red += 255; green += 255; blue += 255; continue; }
        const u = EMBLEM_CIRCLE.x + (px - r * .1) / (r * 1.8) * EMBLEM_CIRCLE.size, v = EMBLEM_CIRCLE.y + (py - r * .1) / (r * 1.8) * EMBLEM_CIRCLE.size;
        const k = (Math.min(emblem.height - 1, Math.floor(v)) * emblem.width + Math.min(emblem.width - 1, Math.floor(u))) * 4;
        red += emblem.data[k]!; green += emblem.data[k + 1]!; blue += emblem.data[k + 2]!;
      }
      const o = (y * size + x) * 4;
      if (hits >= 32) { data[o] = red / hits; data[o + 1] = green / hits; data[o + 2] = blue / hits; data[o + 3] = 255; }
    }
    return { width: size, height: size, data };
  };
  return { flag: shrink(flag, 12, 7), flagSmall: shrink(flag, 8, 5), emblem: roundel(8), emblemSmall: roundel(4) };
}

/** Code-drawn stand-ins: atlas row to code-drawn row and column pairs (atlas column = index unless given). */
function fallbacks(atlas: Atlas, drawn: Image): void {
  const walkers: Record<string, string> = { salaryman: 'salaryman', trench: 'trench', drunk: 'drunk', 'office-lady': 'office-lady', police: 'police',
    schoolgirl: 'schoolgirl', sukeban: 'sukeban', schoolboy: 'schoolboy-cap', bosozoku: 'bosozoku', 'bosozoku-black': 'bosozoku-black', fan: 'fan',
    crew: 'crew', obaachan: 'obaachan', housewife: 'housewife', youth: 'brights', denim: 'denim', 'yukata-woman': 'yukata-white', 'yukata-man': 'yukata',
    dock: 'dock', tourist: 'tourist', 'old-man': 'old-man', 'umbrella-salaryman': 'salaryman', 'umbrella-woman': 'office-lady' };
  for (const [row, look] of Object.entries(walkers)) for (let c = 0; c < 15; c++) atlas.enlarge(drawn, drawnRow(look), c, spriteRow(row), c);
  [15, 16, 17, 18, 19, 20, 15, 16].forEach((from, c) => atlas.enlarge(drawn, drawnRow('fan'), from, spriteRow('fan-cheer'), c * 2));
  [24, 25, 26, 27, 24, 25].forEach((from, c) => atlas.enlarge(drawn, drawnRow('police-traffic'), from, spriteRow('police-signal'), c * 2));
  for (const [row, look] of [['bosozoku-squat', 'bosozoku'], ['bosozoku-black-squat', 'bosozoku-black']] as const)
    [21, 22, 23, 0].forEach((from, c) => atlas.enlarge(drawn, drawnRow(look), from, spriteRow(row), c));
  for (const [row, cat] of [['calico', 'calico'], ['orange-tabby', 'orange-tabby'], ['black-cat', 'black']] as const)
    [0, 1, 2, 3, 5, 7, 9, 11].forEach((from, c) => atlas.enlarge(drawn, drawnRow(cat), from, spriteRow(row), c));
  for (const row of ['rider-housewife', 'rider-schoolboy']) {
    for (let f = 0; f < 4; f++) atlas.enlarge(drawn, drawnRow(row), f * 2, spriteRow(row), f * 2, true);
    for (let c = 8; c < 12; c++) atlas.enlarge(drawn, drawnRow(row), c, spriteRow(row), c);
  }
  for (const row of ['bike-purple', 'bike-black']) {
    atlas.enlarge(drawn, drawnRow(row), 0, spriteRow(row), 0, true);
    for (const c of [2, 3]) atlas.enlarge(drawn, drawnRow(row), c, spriteRow(row), c);
  }
}

export function buildStreetSprites(): { atlas: Uint8ClampedArray; used: string[]; missing: string[] } {
  const atlas = new Atlas(), used: string[] = [], missing: string[] = [];
  for (const sheet of SHEET_SPECS) {
    const file = join(SHEETS, sheet.file);
    if (!existsSync(file)) { missing.push(sheet.file); continue; }
    used.push(sheet.file);
    const image = read(file), grid = figures(image, sheet.columns, sheet.rows);
    const cellBox = ([c, r]: readonly [number, number]) => grid[r]?.[c] ?? null;
    const ref = cellBox(sheet.reference);
    if (!ref) throw new Error(`${sheet.file}: the scale reference cell is empty.`);
    // Sheet sizes are at the first atlas scale (78 pixels to an adult).
    const scale = sheet.size * SPRITE_SCALE / (sheet.axis === 'width' ? ref.x1 - ref.x0 : ref.y1 - ref.y0);
    for (const frame of sheet.frames) {
      const box = cellBox(frame.from);
      if (!box) throw new Error(`${sheet.file}: cell ${frame.from} is empty.`);
      const figure = sheet.despeck ? despeck(reduce(image, box, scale), sheet.despeck) : reduce(image, box, scale);
      atlas.place(spriteRow(frame.row), frame.column, figure, sheet.centre === 'box' ? figure.width / 2 : headCentre(figure), frame.wide);
    }
  }
  fallbacks(atlas, drawSprites(prints()));
  return { atlas: atlas.data, used, missing };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { atlas, used, missing } = buildStreetSprites();
  if (missing.length && !process.argv.includes('--allow-stand-ins')) {
    console.error(`Missing sheets in art/street-sprites: ${missing.join(', ')}. Not writing ${OUT}; pass --allow-stand-ins to use the code-drawn sprites for them.`);
    process.exit(1);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  const png = new PNG({ width: SPRITE_ATLAS.width, height: SPRITE_ATLAS.height });
  png.data.set(atlas);
  writeFileSync(OUT, PNG.sync.write(png));
  console.log(`wrote ${OUT} (${SPRITE_ATLAS.width} x ${SPRITE_ATLAS.height}) from ${used.length} sheets; code-drawn stand-ins for: ${missing.join(', ') || 'none'}`);
  const review = process.argv.indexOf('--review');
  if (review > 0 && process.argv[review + 1]) {
    // An enlarged copy on a checkerboard for looking at.
    const k = 2, out = new PNG({ width: SPRITE_ATLAS.width * k, height: SPRITE_ATLAS.height * k });
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      const i = (Math.floor(y / k) * SPRITE_ATLAS.width + Math.floor(x / k)) * 4, o = (y * out.width + x) * 4;
      const checker = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? 150 : 128;
      for (let c = 0; c < 3; c++) out.data[o + c] = atlas[i + 3] ? atlas[i + c]! : checker;
      out.data[o + 3] = 255;
    }
    writeFileSync(process.argv[review + 1]!, PNG.sync.write(out));
  }
}
