import generated from './palette.generated.json';

/**
 * The race palette as renderer data. palette.generated.json is produced by
 * scripts/build-pixel-palette.mjs from the cutscene PNGs (see its provenance).
 * Entries are sRGB display colours; ramps list palette indices dark to light.
 */
export interface PaletteRamp {
  readonly name: string;
  readonly kind: 'family' | 'livery';
  readonly indices: readonly number[];
}

export interface PixelPalette {
  readonly size: number;
  /** size x RGBA8 sRGB bytes (alpha 255). */
  readonly rgba: Uint8Array;
  /** size x (L, a, b, 1) in OKLab. */
  readonly oklab: Float32Array;
  readonly hex: readonly string[];
  readonly ramps: readonly PaletteRamp[];
  /**
   * size x (darker index, lighter index, family ramp id, step) bytes. Each
   * entry's family ramp gives its neighbours; the ends point at themselves.
   */
  readonly rampNeighbours: Uint8Array;
}

/** OKLab from 8-bit sRGB (Björn Ottosson's reference matrices). */
export function oklabFromSrgb(r: number, g: number, b: number): [number, number, number] {
  const linear = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lr = linear(r), lg = linear(g), lb = linear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

export function oklabFromHex(hex: string): [number, number, number] {
  return oklabFromSrgb(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
}

/** OKLCh lightness, chroma and hue in degrees [0, 360). */
export function oklch(lab: readonly number[]): [number, number, number] {
  let h = Math.atan2(lab[2]!, lab[1]!) * 180 / Math.PI;
  if (h < 0) h += 360;
  return [lab[0]!, Math.hypot(lab[1]!, lab[2]!), h];
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function buildPalette(): PixelPalette {
  const colors = generated.colors;
  const size = colors.length;
  if (size < 2 || size > 256) throw new Error(`Pixel palette must have 2-256 colours, not ${size}.`);
  const rgba = new Uint8Array(size * 4), oklab = new Float32Array(size * 4);
  colors.forEach((color, i) => {
    const [r, g, b] = color.rgb as [number, number, number];
    rgba.set([r, g, b, 255], i * 4);
    oklab.set([...oklabFromSrgb(r, g, b), 1], i * 4);
  });
  const ramps: PaletteRamp[] = generated.ramps.map(ramp => ({
    name: ramp.name, kind: ramp.kind === 'livery' ? 'livery' : 'family', indices: ramp.indices,
  }));
  const rampNeighbours = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) rampNeighbours.set([i, i, 255, 0], i * 4);
  ramps.forEach((ramp, rampId) => {
    if (ramp.kind !== 'family') return;
    ramp.indices.forEach((index, step) => {
      rampNeighbours.set([ramp.indices[Math.max(0, step - 1)]!, ramp.indices[Math.min(ramp.indices.length - 1, step + 1)]!,
        rampId, step], index * 4);
    });
  });
  return { size, rgba, oklab, hex: colors.map(color => color.hex), ramps, rampNeighbours };
}

export const PIXEL_PALETTE: PixelPalette = buildPalette();
