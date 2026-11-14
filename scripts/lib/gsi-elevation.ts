import { mkdir, readFile, writeFile } from 'node:fs/promises';

/** Ground height from the Geospatial Information Authority of Japan's elevation tiles (国土地理院 標高タイル):
 * the 5 m laser model (dem5a, then dem5b and dem5c) at zoom 15, falling back to the 10 m model (dem, zoom 14).
 * Tiles are cached in output/gsi-elevation-tiles. Authoring only; nothing at run time fetches them. */
const CACHE = 'output/gsi-elevation-tiles', SIZE = 256, Z = 15;
const tiles = new Map<string, Float32Array | null>();
const tileX = (lon: number, z: number) => (lon + 180) / 360 * 2 ** z;
const tileY = (lat: number, z: number) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; };

async function tile(layer: string, z: number, x: number, y: number): Promise<Float32Array | null> {
  const key = `${layer}/${z}/${x}/${y}`;
  if (tiles.has(key)) return tiles.get(key)!;
  await mkdir(CACHE, { recursive: true });
  const path = `${CACHE}/${layer}-${z}-${x}-${y}.txt`;
  let text = await readFile(path, 'utf8').catch(() => null);
  if (text === null) {
    const response = await fetch(`https://cyberjapandata.gsi.go.jp/xyz/${layer}/${z}/${x}/${y}.txt`);
    // A layer has no tile where it was never surveyed; remember that as an empty file.
    if (!response.ok && response.status !== 404) throw new Error(`${layer}/${z}/${x}/${y}: HTTP ${response.status}`);
    text = response.ok ? await response.text() : '';
    await writeFile(path, text);
  }
  if (!text.trim()) { tiles.set(key, null); return null; }
  const rows = text.trim().split('\n');
  if (rows.length !== SIZE) throw new Error(`${path}: expected ${SIZE} rows`);
  const values = new Float32Array(SIZE * SIZE);
  rows.forEach((row, j) => row.split(',').forEach((v, i) => { values[j * SIZE + i] = v === 'e' ? NaN : Number(v); }));
  tiles.set(key, values); return values;
}

async function pixel(px: number, py: number): Promise<number> {
  const x = Math.floor(px / SIZE), y = Math.floor(py / SIZE), i = (py % SIZE) * SIZE + (px % SIZE);
  for (const layer of ['dem5a', 'dem5b', 'dem5c']) {
    const value = (await tile(layer, Z, x, y))?.[i];
    if (value !== undefined && !Number.isNaN(value)) return value;
  }
  const hx = Math.floor(px / 2), hy = Math.floor(py / 2);
  const value = (await tile('dem', Z - 1, Math.floor(hx / SIZE), Math.floor(hy / SIZE)))?.[(hy % SIZE) * SIZE + (hx % SIZE)];
  return value === undefined ? NaN : value;
}

/** Bilinear ground height (m) at a point; NaN over open water with no data. */
export async function gsiElevation(lat: number, lon: number): Promise<number> {
  const gx = tileX(lon, Z) * SIZE - .5, gy = tileY(lat, Z) * SIZE - .5, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const [a, b, c, d] = [await pixel(x0, y0), await pixel(x0 + 1, y0), await pixel(x0, y0 + 1), await pixel(x0 + 1, y0 + 1)];
  const known = [a, b, c, d].filter(v => !Number.isNaN(v));
  if (known.length < 4) return known.length ? known.reduce((sum, v) => sum + v, 0) / known.length : NaN;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
