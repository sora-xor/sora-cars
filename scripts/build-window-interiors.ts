// Build public/assets/sprites/window-interiors.png, the rooms seen through
// the period city's lit windows (src/game/three/period-city/materials.ts),
// from the generated sheet art/interiors/window-interiors.png (prompt and
// source: docs/art-prompts/window-interiors-v1.json). The sheet is a 4 x 4
// grid of rooms between black gutters: row 1 offices, row 2 homes, row 3
// eateries and bars, row 4 shops. Each room is cut out inside its gutters
// (found as the darkest lines near the nominal grid, since image models keep
// only roughly to a grid), reduced with a box filter to 256 x 160 and packed
// in the same order.
//
// usage: npx tsx scripts/build-window-interiors.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = join(root, 'art/interiors/window-interiors.png');
const OUT = join(root, 'public/assets/sprites/window-interiors.png');
/** Rooms per side of the grid, and each room's size in the atlas. */
export const ROOMS = 4, ROOM = { width: 256, height: 160 } as const;

interface Image { readonly width: number; readonly height: number; readonly data: Uint8Array | Uint8ClampedArray }

/** Where the gutters run: the darkest line within 30% of a cell of each nominal boundary, and the sheet's edges. */
function gutters(count: number, length: number, darkness: (at: number) => number): number[] {
  const cuts = [0];
  for (let k = 1; k < count; k++) {
    const nominal = k * length / count, reach = .3 * length / count;
    let best = Math.round(nominal), least = Infinity;
    for (let at = Math.round(nominal - reach); at <= Math.round(nominal + reach); at++) {
      const d = darkness(at);
      if (d < least) { least = d; best = at; }
    }
    cuts.push(best);
  }
  cuts.push(length);
  return cuts;
}

/** The first and last bright line inside [from, to): the room without its gutter edges. */
function inside(from: number, to: number, darkness: (at: number) => number): [number, number] {
  let a = from, b = to - 1;
  while (a < b && darkness(a) < 24) a++;
  while (b > a && darkness(b) < 24) b--;
  return [a + 3, b - 2];
}

/** Box-filter the region down to the room size. */
function reduce(image: Image, x0: number, y0: number, x1: number, y1: number, out: Uint8ClampedArray, ox: number, oy: number, stride: number): void {
  const sx = (x1 - x0) / ROOM.width, sy = (y1 - y0) / ROOM.height;
  for (let ty = 0; ty < ROOM.height; ty++) for (let tx = 0; tx < ROOM.width; tx++) {
    const ax = x0 + tx * sx, ay = y0 + ty * sy, bx = ax + sx, by = ay + sy;
    let r = 0, g = 0, b = 0, area = 0;
    for (let y = Math.floor(ay); y < Math.ceil(by); y++) for (let x = Math.floor(ax); x < Math.ceil(bx); x++) {
      const w = (Math.min(x + 1, bx) - Math.max(x, ax)) * (Math.min(y + 1, by) - Math.max(y, ay));
      const i = (y * image.width + x) * 4;
      r += image.data[i]! * w; g += image.data[i + 1]! * w; b += image.data[i + 2]! * w; area += w;
    }
    const o = ((oy + ty) * stride + ox + tx) * 4;
    out[o] = r / area; out[o + 1] = g / area; out[o + 2] = b / area; out[o + 3] = 255;
  }
}

export function buildWindowInteriors(sheet: Image): Uint8ClampedArray {
  const luminance = (x: number, y: number) => {
    const i = (y * sheet.width + x) * 4;
    return .2126 * sheet.data[i]! + .7152 * sheet.data[i + 1]! + .0722 * sheet.data[i + 2]!;
  };
  const rowDark = (y: number) => { let s = 0; for (let x = 0; x < sheet.width; x += 2) s += luminance(x, y); return s / (sheet.width / 2); };
  const columnDark = (x: number, y0 = 0, y1 = sheet.height) => { let s = 0; for (let y = y0; y < y1; y += 2) s += luminance(x, y); return s / ((y1 - y0) / 2); };
  const rows = gutters(ROOMS, sheet.height, rowDark);
  const atlas = new Uint8ClampedArray(ROOMS * ROOM.width * ROOMS * ROOM.height * 4);
  for (let r = 0; r < ROOMS; r++) {
    const [y0, y1] = inside(rows[r]!, rows[r + 1]!, rowDark);
    const columns = gutters(ROOMS, sheet.width, x => columnDark(x, y0, y1));
    for (let c = 0; c < ROOMS; c++) {
      const [x0, x1] = inside(columns[c]!, columns[c + 1]!, x => columnDark(x, y0, y1));
      reduce(sheet, x0, y0, x1, y1, atlas, c * ROOM.width, r * ROOM.height, ROOMS * ROOM.width);
    }
  }
  return atlas;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sheet = PNG.sync.read(readFileSync(SHEET));
  const atlas = buildWindowInteriors(sheet);
  mkdirSync(dirname(OUT), { recursive: true });
  const png = new PNG({ width: ROOMS * ROOM.width, height: ROOMS * ROOM.height });
  png.data.set(atlas);
  writeFileSync(OUT, PNG.sync.write(png));
  console.log(`wrote ${OUT} (${ROOMS * ROOM.width} x ${ROOMS * ROOM.height}) from ${SHEET}`);
}
