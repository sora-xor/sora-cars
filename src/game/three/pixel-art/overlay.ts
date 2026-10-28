import { pixelArtGrid, type PixelArtGrid } from './grid';
import { PIXEL_PALETTE, oklabFromHex, type PixelPalette } from './palette';

/**
 * 2D race overlays in pixel-art mode (docs/pixel-art-renderer.md, Integration).
 *
 * Rain, splashes, petals, dust and speed lines are drawn by the Canvas race
 * renderers after the 3D frame and before the HUD. When that frame came from
 * the pixel-art renderer they must look drawn on the same art grid: whole art
 * cells, opaque palette entries, no anti-aliased strokes and no alpha blends.
 * The HUD, chapter titles, corner cue and countdown stay crisp at display
 * resolution and never use these helpers.
 */

/** Palette entry nearest to a colour in OKLab, as a CSS `#rrggbb` string. */
export function paletteColour(hex: string, palette: PixelPalette = PIXEL_PALETTE): string {
  const [L, a, b] = oklabFromHex(hex);
  let best = 0, bestDistance = Infinity;
  for (let i = 0; i < palette.size; i++) {
    const d = (palette.oklab[i * 4]! - L) ** 2 + (palette.oklab[i * 4 + 1]! - a) ** 2 + (palette.oklab[i * 4 + 2]! - b) ** 2;
    if (d < bestDistance) { bestDistance = d; best = i; }
  }
  return palette.hex[best]!;
}

const RAIN_PERIWINKLE = paletteColour('#6078b0');
const RAIN_LAVENDER = paletteColour('#90a0d8');
const RAIN_PALE = paletteColour('#c8c8f0');

/**
 * Overlay colours, each snapped to the race palette. Rain follows the measured
 * cutscene streaks (office-window-rain, radio-window-rain-city): periwinkle
 * columns with lavender and pale lavender leading dots nearer the camera, never
 * cyan. Petals, dust and speed lines keep their clean-mode hues.
 */
export const PIXEL_OVERLAY_COLOURS = {
  /** Streak body and leading dot for the far, middle and near rain layers. */
  rainBody: [RAIN_PERIWINKLE, RAIN_PERIWINKLE, RAIN_LAVENDER] as const,
  rainHead: [RAIN_PERIWINKLE, RAIN_LAVENDER, RAIN_PALE] as const,
  splash: RAIN_LAVENDER,
  petals: [paletteColour('#f8c9d9'), paletteColour('#e9aac4'), paletteColour('#fff0dc')] as const,
  dust: paletteColour('#b7b591'),
  speedLine: paletteColour('#8a7a92'),
  speedLineSurge: paletteColour('#e7cfb2'),
} as const;

let cachedGrid: PixelArtGrid | null = null;

/**
 * The art grid of a race canvas whose current frame the pixel-art renderer
 * drew, or null for clean frames, comparison routes and the compatibility
 * renderer. The grid comes from the canvas backing size, exactly as the pass
 * sizes it, so overlay cells land on the rendered cells.
 */
export function pixelOverlayGrid(canvas: HTMLCanvasElement): PixelArtGrid | null {
  if (canvas.dataset.renderStyle !== 'pixel-art') return null;
  if (cachedGrid?.outputWidth !== canvas.width || cachedGrid.outputHeight !== canvas.height) {
    cachedGrid = pixelArtGrid(canvas.width, canvas.height);
  }
  return cachedGrid;
}

/**
 * Fills whole art cells [x, x + w) x [y, y + h). Coordinates are in cells and
 * floored to the cell that contains them. The context must draw in backing
 * pixels (identity transform); cell edges are rounded the same way the pass
 * places them, so a cell never straddles two rendered cells.
 */
export function fillArtCells(ctx: CanvasRenderingContext2D, grid: PixelArtGrid,
  x: number, y: number, w = 1, h = 1): void {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx + w <= 0 || cy + h <= 0 || cx >= grid.artWidth || cy >= grid.artHeight) return;
  const left = Math.round(cx * grid.cellWidth), top = Math.round(cy * grid.cellHeight);
  ctx.fillRect(left, top, Math.round((cx + w) * grid.cellWidth) - left, Math.round((cy + h) * grid.cellHeight) - top);
}

/** Stable [0, 1) hash of two integers (the dash pattern follows its particle). */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ h >>> 15, 0x2c1b3c6d);
  h = Math.imul(h ^ h >>> 12, 0x297a2d39);
  return ((h ^ h >>> 15) >>> 0) / 4294967296;
}

/**
 * A falling rain streak as the cutscenes draw it: a vertical column of single
 * cells, `length` cells long and ending at (x, y), with stable gaps (about one
 * cell in four) so it reads as dashed dots. The leading cell is always drawn,
 * in `head` when given. The fill style is the caller's.
 */
export function rainColumn(ctx: CanvasRenderingContext2D, grid: PixelArtGrid,
  x: number, y: number, length: number, seed: number, head?: string): void {
  const bottom = Math.floor(y);
  for (let k = 1; k < length; k++) if (hash01(seed, k) >= 0.25) fillArtCells(ctx, grid, x, bottom - k);
  if (head) ctx.fillStyle = head;
  fillArtCells(ctx, grid, x, bottom);
}

/**
 * A one-cell line from (x0, y0) to (x1, y1), in cells, drawing every
 * `period`-th cell of its stepping so it reads as a dash of single cells.
 */
export function dashedCellLine(ctx: CanvasRenderingContext2D, grid: PixelArtGrid,
  x0: number, y0: number, x1: number, y1: number, period = 2): void {
  const ax = Math.floor(x0), ay = Math.floor(y0);
  const steps = Math.max(Math.abs(Math.floor(x1) - ax), Math.abs(Math.floor(y1) - ay));
  for (let i = 0; i <= steps; i += period) {
    const t = steps ? i / steps : 0;
    fillArtCells(ctx, grid, ax + Math.round((Math.floor(x1) - ax) * t), ay + Math.round((Math.floor(y1) - ay) * t));
  }
}
