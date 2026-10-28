/**
 * Art-grid sizing for the pixel-art race renderer (docs/pixel-art-renderer.md).
 *
 * The cutscene illustrations are drawn on a ~560x315 grid of hard-edged art
 * pixels. The race keeps that density: the short side of the view is 315 art
 * pixels (never finer than 2 backing pixels per cell), the long side follows
 * the aspect ratio, and the 3D scene is supersampled S x S per art cell so the
 * cell resolve has real sub-cell detail to choose from.
 */
export const ART_SHORT_SIDE = 315;
/** Smallest art cell, in backing pixels. */
export const MIN_CELL_BACKING_PIXELS = 2;
export const MIN_SCENE_SUPERSAMPLE = 2;
export const MAX_SCENE_SUPERSAMPLE = 3;

export interface PixelArtGrid {
  /** Backing (output) size in physical pixels. */
  readonly outputWidth: number;
  readonly outputHeight: number;
  /** Art grid size in cells. */
  readonly artWidth: number;
  readonly artHeight: number;
  /** Scene samples per art cell along each axis. */
  readonly supersample: number;
  /** Scene render target size: art size times the supersample. */
  readonly sceneWidth: number;
  readonly sceneHeight: number;
  /** Backing pixels per art cell along each axis (non-integer in general). */
  readonly cellWidth: number;
  readonly cellHeight: number;
}

/** Pure sizing rule shared by the pass, its tests and 2D overlay snapping. */
export function pixelArtGrid(outputWidth: number, outputHeight: number): PixelArtGrid {
  const width = Math.max(1, Math.round(Number.isFinite(outputWidth) ? outputWidth : 1));
  const height = Math.max(1, Math.round(Number.isFinite(outputHeight) ? outputHeight : 1));
  const landscape = width >= height;
  const backingShort = landscape ? height : width;
  const backingLong = landscape ? width : height;
  const artShort = Math.max(1, Math.min(ART_SHORT_SIDE, Math.floor(backingShort / MIN_CELL_BACKING_PIXELS)));
  const artLong = Math.max(1, Math.min(Math.floor(backingLong / MIN_CELL_BACKING_PIXELS),
    Math.round(artShort * backingLong / backingShort)));
  const supersample = Math.min(MAX_SCENE_SUPERSAMPLE,
    Math.max(MIN_SCENE_SUPERSAMPLE, Math.round(backingShort / artShort)));
  const artWidth = landscape ? artLong : artShort;
  const artHeight = landscape ? artShort : artLong;
  return {
    outputWidth: width, outputHeight: height, artWidth, artHeight, supersample,
    sceneWidth: artWidth * supersample, sceneHeight: artHeight * supersample,
    cellWidth: width / artWidth, cellHeight: height / artHeight,
  };
}

export function sameGrid(a: PixelArtGrid | null, b: PixelArtGrid): boolean {
  return a !== null && a.outputWidth === b.outputWidth && a.outputHeight === b.outputHeight
    && a.artWidth === b.artWidth && a.artHeight === b.artHeight && a.supersample === b.supersample;
}
