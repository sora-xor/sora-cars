import assert from 'node:assert/strict';
import test from 'node:test';
import { pixelArtGrid } from '../src/game/three/pixel-art/grid';
import { PIXEL_PALETTE, oklabFromHex, oklch } from '../src/game/three/pixel-art/palette';
import {
  PIXEL_OVERLAY_COLOURS, dashedCellLine, fillArtCells, paletteColour, pixelOverlayGrid, rainColumn,
} from '../src/game/three/pixel-art/overlay';

type Rect = [number, number, number, number];
function recorder() {
  const rects: Rect[] = [], styles: string[] = [];
  const ctx = {
    fillStyle: '#000000',
    fillRect(x: number, y: number, w: number, h: number) { rects.push([x, y, w, h]); styles.push(this.fillStyle); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, styles };
}
const canvas = (width: number, height: number, renderStyle?: string) =>
  ({ width, height, dataset: renderStyle ? { renderStyle } : {} }) as unknown as HTMLCanvasElement;

test('overlays snap only when the frame came from the pixel-art renderer, using the backing size', () => {
  assert.equal(pixelOverlayGrid(canvas(1920, 1080)), null);
  assert.equal(pixelOverlayGrid(canvas(1920, 1080, 'cinematic')), null);
  assert.equal(pixelOverlayGrid(canvas(1920, 1080, 'grouped-pixels')), null);
  const grid = pixelOverlayGrid(canvas(1920, 1080, 'pixel-art'))!;
  assert.deepEqual([grid.artWidth, grid.artHeight], [560, 315]);
  assert.deepEqual(pixelOverlayGrid(canvas(390, 844, 'pixel-art')), pixelArtGrid(390, 844));
});

test('every overlay colour is a palette entry, and rain is lavender or periwinkle rather than cyan', () => {
  const palette = new Set(PIXEL_PALETTE.hex);
  const colours = Object.values(PIXEL_OVERLAY_COLOURS).flat();
  for (const colour of colours) assert.ok(palette.has(colour), colour);
  for (const colour of [...PIXEL_OVERLAY_COLOURS.rainBody, ...PIXEL_OVERLAY_COLOURS.rainHead, PIXEL_OVERLAY_COLOURS.splash]) {
    const [, chroma, hue] = oklch(oklabFromHex(colour));
    assert.ok(chroma > 0.05 && hue > 250 && hue < 300, `${colour} h${hue.toFixed(0)}`);
  }
  assert.equal(paletteColour(PIXEL_PALETTE.hex[17]!), PIXEL_PALETTE.hex[17]);
});

test('art cells tile the backing canvas exactly, with no gaps or overlaps at non-integer scales', () => {
  for (const [w, h] of [[1920, 1080], [960, 600], [390, 844], [844, 390]] as const) {
    const grid = pixelArtGrid(w, h), { ctx, rects } = recorder();
    for (let x = 0; x < grid.artWidth; x++) fillArtCells(ctx, grid, x + 0.7, 3.2);
    assert.equal(rects[0]![0], 0);
    for (let i = 1; i < rects.length; i++) assert.equal(rects[i]![0], rects[i - 1]![0] + rects[i - 1]![2], `${w}x${h} cell ${i}`);
    const last = rects.at(-1)!;
    assert.equal(last[0] + last[2], w);
    assert.ok(rects.every(rect => rect[1] === Math.round(3 * grid.cellHeight) && rect[2] >= 2 && rect[3] >= 2));
  }
  const grid = pixelArtGrid(960, 600), { ctx, rects } = recorder();
  fillArtCells(ctx, grid, -3, 5); fillArtCells(ctx, grid, grid.artWidth, 5); fillArtCells(ctx, grid, 4, -2);
  assert.equal(rects.length, 0, 'cells fully off the canvas are skipped');
});

test('rain columns are single cells wide, stable per drop, and always keep their leading dot', () => {
  const grid = pixelArtGrid(1920, 1080);
  const draw = (seed: number) => {
    const { ctx, rects, styles } = recorder();
    ctx.fillStyle = '#111111';
    rainColumn(ctx, grid, 40.4, 100.6, 8, seed, '#222222');
    return { rects, styles };
  };
  const a = draw(7), b = draw(7);
  assert.deepEqual(a.rects, b.rects);
  const column = Math.round(40 * grid.cellWidth);
  assert.ok(a.rects.every(rect => rect[0] === column && rect[2] === Math.round(41 * grid.cellWidth) - column));
  assert.ok(a.rects.length >= 2 && a.rects.length <= 8);
  assert.deepEqual(a.rects.at(-1)!.slice(1, 2), [Math.round(100 * grid.cellHeight)]);
  assert.equal(a.styles.at(-1), '#222222');
  let drawn = 0;
  for (let seed = 0; seed < 200; seed++) drawn += draw(seed).rects.length;
  assert.ok(drawn / 200 > 5.5 && drawn / 200 < 7.5, `about three cells in four are drawn (${drawn / 200})`);
});

test('speed-line dashes step one cell at a time and draw every second cell', () => {
  const grid = pixelArtGrid(960, 600), { ctx, rects } = recorder();
  dashedCellLine(ctx, grid, 10, 20, 20, 25);
  assert.equal(rects.length, 6);
  const cells = rects.map(rect => [Math.round(rect[0] / grid.cellWidth), Math.round(rect[1] / grid.cellHeight)]);
  assert.deepEqual(cells[0], [10, 20]);
  assert.deepEqual(cells.at(-1), [20, 25]);
});
