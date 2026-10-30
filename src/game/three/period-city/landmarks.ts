import * as THREE from 'three';
import { type CityMeshBuilder, type CityMaterialKey, type Vec3, WINDOW_KIND } from './geometry';
import { printSlice, signIndex, signPrint } from './signs';

/**
 * Famous buildings standing in 1986 along the routes, simplified to the
 * massing, rhythm and colour that read at the art grid's resolution. Each
 * builds in its lot frame: the reserved footprint's front edge at z = 0
 * facing the road (-Z), x along the road. Dates are completion years.
 */
type Random = () => number;
export type PeriodLandmarkKind = 'diet' | 'budokan' | 'kudan-kaikan' | 'national-theatre' | 'justice' | 'police'
  | 'daiichi' | 'kaijo' | 'palace-side' | 'jack' | 'queen' | 'king' | 'pagoda' | 'fujiya' | 'new-grand' | 'zenrinmon' | 'nikko-station'
  | 'pagoda-toji' | 'pagoda-yasaka' | 'pagoda-kofukuji' | 'tsuruga-keep' | 'sazaedo' | 'kyoto-tower' | 'yasaka-gate'
  | 'nandaimon' | 'daibutsuden' | 'nara-station'
  | 'honganji-goeido' | 'honganji-amidado' | 'nishi-goeido' | 'minamiza' | 'keage-power' | 'kyoto-museum' | 'kyoto-station-1952'
  | 'otenmon' | 'kasuga-torii' | 'pagoda-yakushiji' | 'pagoda-yakushiji-west' | 'dreamland-castle' | 'ikoma-towers';

/** A quad wound to face `hint`, with its true normal. */
function quad(b: CityMeshBuilder, key: CityMaterialKey, points: readonly [Vec3, Vec3, Vec3, Vec3], hint: Vec3): void {
  const [a, c, , e] = points, ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = e[0] - a[0], vy = e[1] - a[1], vz = e[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length; ny /= length; nz /= length;
  if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
  b.face(key, points, [nx, ny, nz]);
}
function block(b: CityMeshBuilder, key: CityMaterialKey, colour: string | THREE.Color, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, skip = 'b'): void {
  b.colour.set(colour); b.box(key, x0, x1, y0, y1, z0, z1, skip);
}
/** Surfaces of revolution about a vertical axis at (x, z): octagonal drums, roofs, domes. */
function revolve(b: CityMeshBuilder, key: CityMaterialKey, colour: string, profile: readonly (readonly [number, number])[],
  segments: number, x: number, z: number, phase = 0): void {
  b.colour.set(colour);
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i]!, [r1, y1] = profile[i + 1]!;
    for (let k = 0; k < segments; k++) {
      const a = phase + k / segments * Math.PI * 2, c = phase + (k + 1) / segments * Math.PI * 2, m = (a + c) / 2;
      const point = (r: number, y: number, t: number): Vec3 => [x + Math.cos(t) * r, y, z + Math.sin(t) * r];
      const slope = r0 - r1, rise = y1 - y0, n = Math.hypot(slope, rise) || 1;
      quad(b, key, [point(r0, y0, a), point(r0, y0, c), point(r1, y1, c), point(r1, y1, a)],
        [Math.cos(m) * rise / n, slope / n, Math.sin(m) * rise / n]);
    }
  }
}
/** A hipped roof over a rectangle: eaves at y0, a ridge along the longer side at y1. */
function hipRoof(b: CityMeshBuilder, colour: string, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): void {
  b.colour.set(colour);
  const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, inset = Math.min(x1 - x0, z1 - z0) / 2;
  const r0 = x1 - x0 > z1 - z0 ? x0 + inset : xm, r1 = x1 - x0 > z1 - z0 ? x1 - inset : xm;
  const s0 = x1 - x0 > z1 - z0 ? zm : z0 + inset, s1 = x1 - x0 > z1 - z0 ? zm : z1 - inset;
  quad(b, 'roof', [[x0, y0, z0], [x1, y0, z0], [r1, y1, s0], [r0, y1, s0]], [0, 1, -1]);
  quad(b, 'roof', [[x0, y0, z1], [x1, y0, z1], [r1, y1, s1], [r0, y1, s1]], [0, 1, 1]);
  b.face('roof', [[x0, y0, z0], [r0, y1, s0], [x0, y0, z1]], [-1, 1, 0]);
  b.face('roof', [[x1, y0, z0], [r1, y1, s1], [x1, y0, z1]], [1, 1, 0]);
  if (r0 !== r1 || s0 !== s1) quad(b, 'roof', [[r0, y1, s0], [r1, y1, s0], [r1, y1, s1], [r0, y1, s1]], [0, 1, 0]);
}
/** A four-sided eave skirt around a square or rectangular storey: from the eave
 * edge (half-extents ex, ez at `low`) up to the wall (wx, wz at `high`), with its soffit. */
function skirt(b: CityMeshBuilder, colour: string, x: number, z: number, ex: number, ez: number, wx: number, wz: number, low: number, high: number): void {
  b.colour.set(colour);
  const p = (hx: number, hz: number, y: number, k: number): Vec3 => [x + (k === 0 || k === 3 ? -hx : hx), y, z + (k < 2 ? -hz : hz)];
  quad(b, 'roof', [p(ex, ez, low, 0), p(ex, ez, low, 1), p(wx, wz, high, 1), p(wx, wz, high, 0)], [0, 1, -1]);
  quad(b, 'roof', [p(ex, ez, low, 3), p(ex, ez, low, 2), p(wx, wz, high, 2), p(wx, wz, high, 3)], [0, 1, 1]);
  quad(b, 'roof', [p(ex, ez, low, 0), p(ex, ez, low, 3), p(wx, wz, high, 3), p(wx, wz, high, 0)], [-1, 1, 0]);
  quad(b, 'roof', [p(ex, ez, low, 1), p(ex, ez, low, 2), p(wx, wz, high, 2), p(wx, wz, high, 1)], [1, 1, 0]);
  b.colour.set('#2a2224'); b.flat('roof', x - ex, x + ex, z - ez, z + ez, low - .02, -1);
}
/** A grid of flush, lit panes on a face toward the road (z, facing -Z). */
function panes(b: CityMeshBuilder, random: Random, x0: number, x1: number, y0: number, y1: number, z: number,
  columns: number, rows: number, w: number, h: number, kind: number = WINDOW_KIND.office, glass = '#323a4a'): void {
  for (let r = 0; r < rows; r++) {
    const floor = random();
    for (let c = 0; c < columns; c++) {
      const cx = x0 + (x1 - x0) * (c + .5) / columns, cy = y0 + (y1 - y0) * (r + .5) / rows;
      b.window = [kind === WINDOW_KIND.office ? floor * .75 + random() * .25 : random(), kind]; b.colour.set(glass);
      b.front('glass', cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2, z - .03);
    }
  }
}
function sidePanes(b: CityMeshBuilder, random: Random, x: number, facing: -1 | 1, z0: number, z1: number, y0: number, y1: number,
  columns: number, rows: number, w: number, h: number): void {
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const cz = z0 + (z1 - z0) * (c + .5) / columns, cy = y0 + (y1 - y0) * (r + .5) / rows;
    b.window = [random(), WINDOW_KIND.office]; b.colour.set('#323a4a');
    b.side('glass', x + facing * .03, cz - w / 2, cz + w / 2, cy - h / 2, cy + h / 2, facing);
  }
}

/** The National Diet Building (1936): granite wings, a portico and the stepped-pyramid tower. */
function diet(b: CityMeshBuilder, random: Random): void {
  const granite = '#cfc8b8', shadow = '#bdb6a6';
  // The forecourt: a low wall with gate posts, lawns either side of the approach.
  block(b, 'stone', '#8e8a80', -110, -8, -.3, 1.1, 0, .6); block(b, 'stone', '#8e8a80', 8, 110, -.3, 1.1, 0, .6);
  for (const x of [-9, 8]) block(b, 'stone', '#9a958a', x - .1, x + 1.1, -.3, 2.8, -.1, .7);
  b.colour.set('#4f6a3e'); b.flat('ground', -105, -5, 1, 48, -.04); b.flat('ground', 5, 105, 1, 48, -.04);
  b.colour.set('#b8b2a4'); b.flat('stone', -5, 5, .6, 50, -.03);
  block(b, 'floodlit', granite, -32, 32, -.5, 21, 52, 92);
  panes(b, random, -30, 30, 3, 20, 52, 12, 4, 1.6, 2.4);
  for (const s of [-1, 1]) {
    block(b, 'floodlit', granite, s < 0 ? -103 : 32, s < 0 ? -32 : 103, -.5, 17, 54, 82);
    panes(b, random, s < 0 ? -100 : 35, s < 0 ? -35 : 100, 3, 16, 54, 14, 4, 1.5, 2.2);
    block(b, 'floodlit', shadow, s < 0 ? -104 : 88, s < 0 ? -88 : 104, -.5, 20, 49, 85);
    panes(b, random, s < 0 ? -102 : 90, s < 0 ? -90 : 102, 3, 19, 49, 3, 5, 1.6, 2.2);
  }
  // The portico of six columns under its entablature.
  for (let i = 0; i < 6; i++) { const x = -12 + i * 4.8; block(b, 'floodlit', shadow, x - .9, x + .9, 0, 14, 46.2, 47.8); }
  block(b, 'floodlit', granite, -14, 14, 14, 16.5, 45, 52);
  // The tower: a colonnaded shaft and the stepped pyramid (65 m).
  block(b, 'floodlit', granite, -11, 11, 21, 38, 61, 83);
  for (let i = 0; i < 4; i++) { const x = -8.25 + i * 5.5; b.window = [random(), WINDOW_KIND.dark]; b.colour.set('#2a2c34'); b.front('glass', x - 1.3, x + 1.3, 23, 36, 60.95); }
  for (let i = 0; i < 7; i++) { const hw = 11 - i * 1.25, y = 38 + i * 3.2; block(b, 'floodlit', i % 2 ? granite : shadow, -hw, hw, y, y + 3.2, 72 - hw, 72 + hw); }
  block(b, 'floodlit', granite, -2.4, 2.4, 60.4, 65.4, 69.6, 74.4);
  b.colour.setRGB(3.5, .3, .2); b.box('lamp', -.4, .4, 65.4, 66.2, 71.6, 72.4);
}

/** The Nippon Budokan (1964): an octagonal hall under a sweeping roof and its gold giboshi. */
function budokan(b: CityMeshBuilder, random: Random): void {
  const x = 0, z = 70, phase = Math.PI / 8;
  b.colour.set('#a8a294'); b.flat('stone', -58, 58, -4, 126, -.04);
  revolve(b, 'floodlit', '#d8cfbf', [[40, -.5], [40, 11]], 8, x, z, phase);
  // The glazed band around the drum, dimly lit.
  for (let k = 0; k < 8; k++) {
    const a = phase + k / 8 * Math.PI * 2, c = phase + (k + 1) / 8 * Math.PI * 2, m = (a + c) / 2;
    const p = (t: number, y: number): Vec3 => [x + Math.cos(t) * 40.08, y, z + Math.sin(t) * 40.08];
    b.window = [random(), WINDOW_KIND.lobby]; b.colour.set('#3a3a44');
    const inset = (c - a) * .12;
    quad(b, 'glass', [p(a + inset, 4.5), p(c - inset, 4.5), p(c - inset, 8), p(a + inset, 8)], [Math.cos(m), 0, Math.sin(m)]);
  }
  revolve(b, 'roof', '#8f8c84', [[47, 10.4], [40, 13]], 8, x, z, phase);
  const profile: [number, number][] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; profile.push([6 + 34 * (1 - t) ** 1.7, 13 + 24 * t]); }
  revolve(b, 'roof', '#9a978e', profile, 8, x, z, phase);
  revolve(b, 'floodlit', '#d8cfbf', [[6, 37], [6, 39.5]], 8, x, z, phase);
  revolve(b, 'roof', '#8f8c84', [[7.4, 39.4], [1.5, 41.6]], 8, x, z, phase);
  revolve(b, 'metal', '#d6a646', [[.5, 41.5], [2.2, 42.6], [2.5, 43.7], [1.5, 45.2], [.2, 46.8]], 12, x, z);
}

/** Kudan Kaikan (1934): brown tile with a tiled "imperial crown" roof over the centre and turrets. */
function kudanKaikan(b: CityMeshBuilder, random: Random): void {
  const tile = '#8a6a52', roof = '#3e4248';
  block(b, 'floodlit', tile, -35, 35, -.5, 16, 0, 28);
  block(b, 'stone', '#b8ad98', -35.2, 35.2, -.5, 1.4, -.2, 28.2);
  panes(b, random, -33, 33, 2, 15, 0, 18, 4, 1.3, 2);
  block(b, 'floodlit', tile, -10, 10, -.5, 21, -1.5, 26);
  panes(b, random, -9, 9, 2, 20, -1.5, 5, 5, 1.4, 2);
  hipRoof(b, roof, -12.5, 12.5, -3, 28, 21, 27.5);
  hipRoof(b, roof, -36, -10, -1, 29, 16, 19); hipRoof(b, roof, 10, 36, -1, 29, 16, 19);
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -35 : 28, x1 = s < 0 ? -28 : 35;
    block(b, 'wall', tile, x0, x1, 16, 19, 0, 7);
    hipRoof(b, roof, x0 - .8, x1 + .8, -.8, 7.8, 19, 23);
  }
}

/** The National Theatre (1966): a long dark storehouse (校倉) of horizontal battens under a broad roof. */
function nationalTheatre(b: CityMeshBuilder, random: Random): void {
  block(b, 'stone', '#8a8478', -60, 60, -.5, 1.2, 0, 50);
  block(b, 'wall', '#4b3a2f', -55, 55, 1.2, 15, 4, 46);
  b.colour.set('#5c4838');
  for (let y = 1.6; y < 14.8; y += .75) b.box('wall', -55, 55, y, y + .42, 3.72, 4, 'bk');
  block(b, 'metal', '#3a3a3c', -58, 58, 15, 16.2, 1, 49);
  b.window = [random() * .4, WINDOW_KIND.lobby]; b.colour.set('#4a4a50'); b.front('glass', -16, 16, 1.2, 4.2, 3.68);
}

/** The Metropolitan Police headquarters (1980) at Sakuradamon: its slab, crown and antenna mast. */
function police(b: CityMeshBuilder, random: Random): void {
  block(b, 'stone', '#bdb5a5', -25, 25, -.5, 14, 0, 40);
  panes(b, random, -24, 24, 2, 13, 0, 14, 3, 1.6, 2.2);
  block(b, 'wall', '#cbc4b6', -20, 20, 14, 64, 6, 30);
  panes(b, random, -19, 19, 15, 63, 6, 14, 14, .9, 2.6);
  sidePanes(b, random, -20, -1, 7, 29, 15, 63, 8, 14, .9, 2.6);
  sidePanes(b, random, 20, 1, 7, 29, 15, 63, 8, 14, .9, 2.6);
  block(b, 'wall', '#b5ad9e', -16, 16, 64, 70, 9, 27);
  block(b, 'wall', '#aea697', -11, 11, 70, 73.5, 12, 24);
  block(b, 'metal', '#c8ccd0', -.6, .6, 73.5, 108, 17.4, 18.6);
  for (const y of [80, 90, 100]) block(b, 'metal', '#c8ccd0', -3, 3, y, y + .3, 17.7, 18.3);
  b.colour.setRGB(3.5, .3, .2); for (const y of [90, 108]) b.box('lamp', -.8, .8, y, y + 1, 17.2, 18.8);
}

/** The Ministry of Justice (1895): Meiji red brick, stone bands, a slate roof with dormers. */
function justice(b: CityMeshBuilder, random: Random): void {
  const brick = '#8a4638', stone = '#d8cdb5', slate = '#3e4448';
  block(b, 'floodlit', brick, -48, 48, -.5, 15, 6, 36);
  for (const y of [1.2, 5.4, 10.2]) block(b, 'stone', stone, -48.2, 48.2, y - .25, y, 5.8, 36.2);
  panes(b, random, -46, 46, 1.8, 14.4, 6, 24, 3, 1.2, 2.5);
  block(b, 'floodlit', brick, -11, 11, -.5, 19, 3, 34);
  for (const y of [5.4, 10.2, 15]) block(b, 'stone', stone, -11.2, 11.2, y - .3, y, 2.8, 34.2);
  panes(b, random, -10, 10, 1.8, 18, 3, 5, 4, 1.3, 2.5);
  hipRoof(b, slate, -49, 49, 5, 37, 15, 21);
  hipRoof(b, slate, -12, 12, 2, 35, 19, 28);
  for (let x = -44; x <= 44; x += 8) {
    if (Math.abs(x) < 14) continue;
    block(b, 'wall', slate, x - 1, x + 1, 16, 18.2, 6.6, 8.2);
    b.window = [random(), WINDOW_KIND.office]; b.colour.set('#2a2c34'); b.front('glass', x - .55, x + .55, 16.3, 17.8, 6.55);
  }
}

/** The Dai-ichi Seimei Building (1938): a granite colonnade facing the Hibiya moat. */
function daiichi(b: CityMeshBuilder, random: Random): void {
  const granite = '#bdb6a8', column = '#cac3b5';
  block(b, 'floodlit', granite, -37, 37, -.5, 31, 2, 40);
  panes(b, random, -35, 35, 5, 27, 2, 10, 6, 1.6, 2.3);
  for (let i = 0; i <= 10; i++) { const x = -35 + i * 7; block(b, 'floodlit', column, x - 1, x + 1, 4.5, 28, 0, 2, 'bk'); }
  block(b, 'floodlit', column, -37, 37, 28, 31, 0, 2, 'k');
  block(b, 'stone', column, -37, 37, -.5, 4.5, 0, 2, 'k');
  b.window = [random() * .3, WINDOW_KIND.lobby]; b.colour.set('#3a3a40'); b.front('glass', -4, 4, .2, 3.8, -.03);
  block(b, 'stone', granite, -30, 30, 31, 36, 8, 34);
  panes(b, random, -28, 28, 31.6, 35.4, 8, 14, 1, 1.4, 2);
}

/** The Tokyo Kaijo Building (1974): the dark red-brown tower that broke Marunouchi's 31 m line. */
function kaijo(b: CityMeshBuilder, random: Random): void {
  const tile = '#6a3a2f', fin = '#55302a';
  block(b, 'wall', tile, -25, 25, -.5, 13, 0, 40);
  panes(b, random, -23, 23, 1.5, 12, 0, 10, 3, 2, 2.4);
  block(b, 'wall', tile, -17, 17, 13, 100, 6, 32);
  b.colour.set(fin);
  for (let x = -16.8; x <= 16.9; x += 2.4) b.box('wall', x - .25, x + .25, 13, 100, 5.4, 6, 'bk');
  panes(b, random, -16.8, 16.8, 14, 99, 6, 14, 24, 1.3, 2.5);
  sidePanes(b, random, -17, -1, 7, 31, 14, 99, 10, 24, 1.3, 2.5);
  sidePanes(b, random, 17, 1, 7, 31, 14, 99, 10, 24, 1.3, 2.5);
  block(b, 'wall', fin, -15, 15, 100, 103, 8, 30);
  b.colour.setRGB(3.5, .3, .2); for (const x of [-14, 14]) b.box('lamp', x - .5, x + .5, 103, 104, 8.5, 9.5);
}

/** The Palace Side Building (1966): a long slab of aluminium louvres between two white cylinders. */
function palaceSide(b: CityMeshBuilder, random: Random): void {
  // Shortened along the route's bend at Takebashi; the real slab runs about 200 m.
  block(b, 'wall', '#d4d2cc', -50, 50, -.5, 33, 4, 26);
  for (let floor = 0; floor < 9; floor++) {
    const y = .4 + floor * 3.6;
    panes(b, random, -48, 48, y + .6, y + 2.9, 4, 34, 1, 2.4, 2.1);
    b.colour.set('#c9cdd1');
    for (const lift of [2.75, 3.25]) b.box('metal', -50, 50, y + lift, y + lift + .12, 2.4, 4, 'bk');
  }
  b.colour.set('#f0eee8');
  for (const x of [-42, 42]) b.cylinder('wall', x, -.5, 4, 6.5, 40, 20);
  block(b, 'wall', '#c8c6c0', -36, 36, 33, 36, 8, 22);
}

/** Yokohama's "Jack" (1917): the red-brick Port Opening Memorial Hall and its clock tower. */
function jack(b: CityMeshBuilder, random: Random): void {
  const brick = '#8a4638', stone = '#e0d6c0';
  block(b, 'floodlit', brick, -17, 17, -.5, 12, 0, 30);
  for (const y of [4.2, 11.4]) block(b, 'stone', stone, -17.2, 17.2, y - .3, y, -.2, 30.2);
  panes(b, random, -15, 9, 1, 11, 0, 7, 2, 1.4, 2.6);
  block(b, 'floodlit', brick, 10.5, 17, 12, 30, 0, 6.5);
  for (const y of [18, 24, 30]) block(b, 'stone', stone, 10.3, 17.2, y - .3, y, -.2, 6.7);
  b.colour.setRGB(2.2, 2, 1.6);
  b.front('lamp', 12.4, 15.1, 25, 27.6, -.06); b.side('lamp', 10.44, 1.9, 4.6, 25, 27.6, -1);
  revolve(b, 'metal', '#5e8f7d', [[3.9, 30], [3.4, 31.8], [2.2, 33.8], [.7, 35.6], [.1, 37]], 8, 13.75, 3.25, Math.PI / 8);
}

/** Yokohama's "Queen" (1934): the white Customs building and its green copper dome. */
function queen(b: CityMeshBuilder, random: Random): void {
  const white = '#e6e2d8';
  block(b, 'floodlit', white, -28, 28, -.5, 19, 0, 40);
  panes(b, random, -26, 26, 2, 18, 0, 16, 4, 1.3, 2.4);
  block(b, 'floodlit', white, -5, 5, 19, 40, 6, 16);
  panes(b, random, -4, 4, 21, 38, 6, 2, 5, .8, 2);
  revolve(b, 'wall', white, [[4.6, 40], [4.6, 42.5]], 16, 0, 11);
  revolve(b, 'metal', '#4f8a76', [[5.2, 42.5], [4.8, 44.6], [3.6, 46.6], [1.8, 48.2], [.3, 49.2]], 16, 0, 11);
  b.colour.set('#4f8a76'); b.cylinder('metal', 0, 49.2, 11, .15, 2.5, 6);
}

/** Yokohama's "King" (1928): the Kanagawa Prefectural Office tower under its Japanese pyramid roof. */
function king(b: CityMeshBuilder, random: Random): void {
  const tile = '#9a7a5e';
  block(b, 'floodlit', tile, -32, 32, -.5, 22, 0, 40);
  panes(b, random, -30, 30, 2, 21, 0, 18, 5, 1.2, 2.3);
  block(b, 'floodlit', tile, -7, 7, 22, 40, 4, 18);
  panes(b, random, -6, 6, 24, 39, 4, 3, 4, 1, 2.2);
  block(b, 'wall', '#8a6c52', -5.5, 5.5, 40, 43, 5.5, 16.5);
  hipRoof(b, '#3e4248', -6.6, 6.6, 4.4, 17.6, 43, 49.5);
}

/** A five-storey pagoda (五重塔) among Nikko's cedars: vermilion storeys under copper roofs. */
function pagoda(b: CityMeshBuilder, random: Random): void {
  const z = 8, vermilion = '#b8402e', roof = '#3e5048';
  block(b, 'stone', '#8a8478', -6, 6, -.3, 1.2, 2, 14);
  for (let i = 0; i < 5; i++) {
    const w = 3.4 - i * .32, y0 = 1.2 + i * 5.2, eave = w + 2.6;
    block(b, 'floodlit', vermilion, -w, w, y0, y0 + 3.4, z - w, z + w);
    b.window = [random() * .6, WINDOW_KIND.home]; b.colour.set('#4a3a2a'); b.front('glass', -.7, .7, y0 + .4, y0 + 2.6, z - w - .02);
    const top = y0 + 4.6, low = y0 + 3.5, p = (r: number, y: number, k: number): Vec3 => [(k === 0 || k === 3 ? -r : r), y, z + (k < 2 ? -r : r)];
    b.colour.set(roof);
    quad(b, 'roof', [p(eave, low, 0), p(eave, low, 1), p(w + .2, top, 1), p(w + .2, top, 0)], [0, 1, -1]);
    quad(b, 'roof', [p(eave, low, 3), p(eave, low, 2), p(w + .2, top, 2), p(w + .2, top, 3)], [0, 1, 1]);
    quad(b, 'roof', [p(eave, low, 0), p(eave, low, 3), p(w + .2, top, 3), p(w + .2, top, 0)], [-1, 1, 0]);
    quad(b, 'roof', [p(eave, low, 1), p(eave, low, 2), p(w + .2, top, 2), p(w + .2, top, 1)], [1, 1, 0]);
    b.colour.set('#2a2224'); b.flat('roof', -eave, eave, z - eave, z + eave, low - .02, -1);
  }
  block(b, 'metal', '#7a6a42', -.15, .15, 27, 36, z - .15, z + .15);
  for (let y = 28.5; y < 34; y += 1.1) block(b, 'metal', '#7a6a42', -.55, .55, y, y + .18, z - .55, z + .55);
}

/** The Fujiya Hotel (1891) on the Hakone road: a Western hotel under Japanese roofs, and its 1936 wing. */
function fujiya(b: CityMeshBuilder, random: Random): void {
  const plaster = '#ece4d4', timber = '#6a3a28', roof = '#3e4a44';
  block(b, 'floodlit', plaster, -26, 26, -.3, 8, 4, 20);
  b.colour.set(timber);
  for (let x = -26; x <= 26; x += 3.25) b.box('wall', x - .12, x + .12, -.3, 8, 3.9, 4, 'bk');
  b.box('wall', -26, 26, 3.9, 4.3, 3.85, 4, 'bk');
  panes(b, random, -25, 25, .9, 7.4, 4, 15, 2, 1.3, 2.2, WINDOW_KIND.home, '#4a3a2a');
  hipRoof(b, roof, -27.5, 27.5, 2.6, 21.4, 8, 13);
  // The cusped porch (唐破風) at the door.
  for (const x of [-3.8, 3.8]) block(b, 'wall', timber, x - .2, x + .2, -.3, 4.2, .1, .5);
  hipRoof(b, roof, -5, 5, -.8, 4.6, 4.2, 6.2);
  b.colour.set('#ffd9a0'); b.box('lamp', -.3, .3, 3.4, 3.9, .3, .9);
  // The Flower Palace wing (1936), taller under its own high roof.
  block(b, 'floodlit', plaster, 21, 35, -.3, 11, 7, 21);
  panes(b, random, 22, 34, 1, 10.4, 7, 4, 3, 1.3, 2.2, WINDOW_KIND.home, '#4a3a2a');
  hipRoof(b, roof, 20, 36, 5.6, 22.4, 11, 17.5);
}

/** The Hotel New Grand (1927) facing Yamashita Park: cream tile, an arched ground floor, a cornice. */
function newGrand(b: CityMeshBuilder, random: Random): void {
  const tile = '#d8c8a8';
  block(b, 'floodlit', tile, -30, 30, -.3, 20, 0, 22);
  block(b, 'floodlit', '#bba98a', -30.2, 30.2, -.3, 4.6, -.2, 22.2);
  panes(b, random, -29, 29, 5.6, 19, 0, 20, 4, 1.2, 2.2, WINDOW_KIND.home);
  for (let i = 0; i < 10; i++) {
    const x = -27 + i * 6;
    b.window = [random() * .4, WINDOW_KIND.lobby]; b.colour.set('#4a4038'); b.front('glass', x - .95, x + .95, .6, 3.9, -.23);
  }
  block(b, 'stone', '#c8b898', -31, 31, 20, 21, -.6, 22.6);
  block(b, 'wall', tile, -12, 12, 21, 24, 4, 18);
  block(b, 'metal', '#3a3a3c', -4, 4, 3.4, 3.7, -2.4, 0, 'k');
  b.colour.set('#ffe2b6'); b.flat('lamp', -3.6, 3.6, -2.2, -.2, 3.39, -1);
}

/** Chinatown's Zenrinmon (善隣門): red pillars, painted beams, three green-tiled roofs. */
function zenrinmon(b: CityMeshBuilder): void {
  const red = '#c22e26', green = '#2f7a5a', gold = '#d6a646', tile = '#3f7a5e', z = 2;
  for (const x of [-4.2, 4.2]) { block(b, 'stone', '#8a8478', x - .6, x + .6, -.3, .6, z - .6, z + .6); block(b, 'floodlit', red, x - .35, x + .35, .6, 8.4, z - .35, z + .35); }
  for (const x of [-7.6, 7.6]) { block(b, 'stone', '#8a8478', x - .5, x + .5, -.3, .5, z - .5, z + .5); block(b, 'floodlit', red, x - .28, x + .28, .5, 6.2, z - .28, z + .28); }
  block(b, 'wall', green, -8, 8, 5.6, 6.2, z - .4, z + .4);
  block(b, 'wall', gold, -4.7, 4.7, 7.5, 8.3, z - .45, z + .45);
  block(b, 'wall', red, -1.1, 1.1, 6.2, 7.5, z - .5, z - .3);
  b.print = printSlice(signPrint('vertical', signIndex('vertical', '中華')), .2, .8); b.colour.set('#ffffff');
  b.front('sign', -.9, .9, 6.3, 7.4, z - .52);
  hipRoof(b, tile, -5.6, 5.6, z - 1.3, z + 1.3, 8.4, 9.8);
  hipRoof(b, tile, -8.8, -3.4, z - 1.1, z + 1.1, 6.2, 7.2); hipRoof(b, tile, 3.4, 8.8, z - 1.1, z + 1.1, 6.2, 7.2);
  b.colour.set(gold); b.cylinder('metal', 0, 9.8, z, .25, .8, 8);
}

/** JR Nikko Station (1912): white Western-style clapboard, green trim, a central gable and its clock. */
function nikkoStation(b: CityMeshBuilder, random: Random): void {
  const white = '#ece8de', trim = '#4a6a5a', roof = '#4a5550';
  block(b, 'floodlit', white, -18, 18, -.3, 7.5, 6, 18);
  panes(b, random, -17, 17, 1, 7, 6, 14, 2, 1.1, 2.2, WINDOW_KIND.home, '#3a4040');
  for (const y of [3.85, 7.5]) block(b, 'wall', trim, -18.1, 18.1, y - .25, y, 5.9, 18.1);
  hipRoof(b, roof, -19, 19, 5, 19, 7.5, 11);
  block(b, 'floodlit', white, -5, 5, -.3, 10, 4, 18);
  hipRoof(b, roof, -5.6, 5.6, 3.4, 18.6, 10, 13.5);
  b.colour.setRGB(2, 1.9, 1.6); b.front('lamp', -.7, .7, 8.2, 9.4, 3.97);
  block(b, 'metal', '#3a4a44', -6, 6, 3.4, 3.7, -1.2, 4, 'k');
  b.colour.set('#ffe2b6'); b.flat('lamp', -5.4, 5.4, -1, 3.8, 3.39, -1);
  b.window = [random() * .3, WINDOW_KIND.lobby]; b.colour.set('#4a4038'); b.front('glass', -3, 3, .2, 3.2, 3.95);
}

/**
 * A pagoda roof with its corners turned up (反り): each side falls from the top ring to an eave that runs level at the
 * middle and lifts `lift` at the corners, with a thick tile edge and a dark soffit. Flat eaves read as thin slabs.
 */
function pagodaRoof(b: CityMeshBuilder, tile: string, z: number, eave: number, top: number, low: number, high: number, lift: number, edge: number): void {
  const corner = (sx: number, sz: number, r: number, y: number): Vec3 => [sx * r, y, z + sz * r];
  const sides: readonly (readonly [number, number, number, number, Vec3])[] = [[-1, -1, 1, -1, [0, 1, -1]], [1, -1, 1, 1, [1, 1, 0]], [1, 1, -1, 1, [0, 1, 1]], [-1, 1, -1, -1, [-1, 1, 0]]];
  for (const [ax, az, bx, bz, hint] of sides) {
    const a = corner(ax, az, eave, low + lift), c = corner(bx, bz, eave, low + lift), m: Vec3 = [(a[0] + c[0]) / 2, low, (a[2] + c[2]) / 2];
    const ta = corner(ax, az, top, high), tc = corner(bx, bz, top, high);
    b.colour.set(tile);
    b.face('roof', [a, m, ta], hint); b.face('roof', [m, tc, ta], hint); b.face('roof', [m, c, tc], hint);
    // The tile edge, as deep as the tiles' thickness, along both halves of the eave.
    const out: Vec3 = [hint[0], 0, hint[2]];
    b.colour.set(tile).multiplyScalar(.72);
    for (const [p, q] of [[a, m], [m, c]] as const) b.face('roof', [p, q, [q[0], q[1] - edge, q[2]], [p[0], p[1] - edge, p[2]]], out);
  }
  b.colour.set('#2a2224'); b.flat('roof', -eave, eave, z - eave, z + eave, low - edge - .02, -1);
}
/**
 * The unpainted five-storey pagodas of Kyoto and Nara, as the Nara cutscene and its repaints paint Kōfuku-ji over
 * Sarusawa-ike: dark timber on every face (posts, a plank door, latticed side bays, plaster only in a band under the
 * beams), a railed veranda round each storey, a ring of bracket sets under deep grey-tiled eaves whose corners turn up,
 * and a bronze sōrin. Plaster walls with posts on one face read as a white tower. Tōji's (1644) is 55 m, Kōfuku-ji's
 * (1426) 50 m, Yasaka's (Hōkan-ji, 1440) 46 m. Yakushi-ji's pair, 34 m, are drawn the same way at their distance, the
 * west one (rebuilt 1981) in fresh vermilion.
 */
function timberPagoda(b: CityMeshBuilder, height: number, wood = '#4a3428'): void {
  const s = height / 50, z = 10 * s, plaster = '#e6dfcf', tile = '#4b4f55', bronze = '#6b5a3a';
  const post = new THREE.Color(wood).multiplyScalar(.72), door = new THREE.Color(wood).multiplyScalar(.82);
  block(b, 'stone', '#8a8478', -7.4 * s, 7.4 * s, -.3, 1.4 * s, z - 7.4 * s, z + 7.4 * s);
  let y = 1.4 * s;
  for (let i = 0; i < 5; i++) {
    const w = (4.6 - i * .45) * s, h = 3.4 * s, eave = w + 3.4 * s, deck = w + .7 * s;
    block(b, 'floodlit', wood, -w, w, y, y + h, z - w, z + w);
    // Every face: the plaster band under the beams, four posts, the plank door in the middle bay and latticed side bays.
    const faces: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const [fx, fz] of faces) {
      const at = (u: number, out: number, y0: number, y1: number, half: number, depth: number, colour: string | THREE.Color) => {
        const cx = fx ? fx * (w + out) : u, cz = z + (fz ? fz * (w + out) : u);
        const hx = fx ? depth / 2 : half, hz = fz ? depth / 2 : half;
        block(b, 'wall', colour, cx - hx, cx + hx, y0, y1, cz - hz, cz + hz, 'b');
      };
      at(0, .02, y + h - 1.05 * s, y + h - .6 * s, w, .06, plaster);
      for (const u of [-w, -w / 3, w / 3, w]) at(u, .1 * s, y, y + h, .26 * s, .24 * s, post);
      at(0, .03, y + .25 * s, y + h - 1.15 * s, w / 3 - .3 * s, .06, door);
      for (const side of [-1, 1]) for (let k = 0; k < 4; k++) at(side * (w * 2 / 3) + (k - 1.5) * .34 * s, .06, y + 1 * s, y + h - 1.25 * s, .05 * s, .1, post);
    }
    // The veranda: a deck round the storey on its beams, and a rail on short posts.
    block(b, 'wall', post, -deck, deck, y - .05 * s, y + .15 * s, z - deck, z + deck);
    for (const [x0, x1, z0, z1] of [[-deck, deck, -deck, -deck + .1 * s], [-deck, deck, deck - .1 * s, deck], [-deck, -deck + .1 * s, -deck, deck], [deck - .1 * s, deck, -deck, deck]] as const)
      block(b, 'wall', wood, x0, x1, y + .75 * s, y + .85 * s, z + z0, z + z1, 'b');
    // The bracket sets (組物) under the eaves: a stepped ring of dark timber.
    block(b, 'wall', post, -w - .7 * s, w + .7 * s, y + h - .15 * s, y + h + .3 * s, z - w - .7 * s, z + w + .7 * s);
    block(b, 'wall', post, -w - 1.5 * s, w + 1.5 * s, y + h + .3 * s, y + h + .65 * s, z - w - 1.5 * s, z + w + 1.5 * s);
    pagodaRoof(b, tile, z, eave, w + .3 * s, y + h + .55 * s, y + h + 2.1 * s, .75 * s, .32 * s);
    y += h + 2.9 * s;
  }
  // The sōrin: a bronze mast with nine rings above the top roof.
  block(b, 'metal', bronze, -.9 * s, .9 * s, y - 1, y + .8 * s, z - .9 * s, z + .9 * s);
  block(b, 'metal', bronze, -.2 * s, .2 * s, y, height, z - .2 * s, z + .2 * s);
  for (let k = 0; k < 9; k++) { const ry = y + 2 * s + k * (height - y - 5 * s) / 9; block(b, 'metal', bronze, -.6 * s, .6 * s, ry, ry + .25 * s, z - .6 * s, z + .6 * s); }
}
/** Tsuruga-jō's keep (rebuilt in concrete, 1965): five white tiers on a battered stone
 * base. Its tiles were dark until the 2011 restoration brought back the red glaze. */
function tsurugaKeep(b: CityMeshBuilder, random: Random): void {
  const z = 16, stone = '#8d877b', plaster = '#efece4', tile = '#3a3d42', gold = '#d6a646';
  for (let i = 0; i < 6; i++) { const inset = i * .55, y0 = i * 1.8; block(b, 'stone', i % 2 ? stone : '#857f74', -15 + inset, 15 - inset, y0 - .3, y0 + 1.8, z - 12 + inset, z + 12 - inset); }
  const tiers: readonly (readonly [number, number, number])[] = [[12.2, 9.8, 4.6], [10.6, 8.4, 4.2], [9, 7.2, 4], [7.4, 5.8, 3.9], [5.8, 4.6, 4.4]];
  let y = 10.8;
  tiers.forEach(([hx, hz, h], i) => {
    block(b, 'floodlit', plaster, -hx, hx, y, y + h, z - hz, z + hz);
    for (let k = 0; k < 4 - Math.min(2, i); k++) {
      const x = -hx + (k + .5) * 2 * hx / (4 - Math.min(2, i));
      b.window = [random() * .4, WINDOW_KIND.dark]; b.colour.set('#2e2a28'); b.front('glass', x - .55, x + .55, y + 1.3, y + h - 1.2, z - hz - .03);
    }
    if (i < 4) {
      skirt(b, tile, 0, z, hx + 2, hz + 2, hx - .4, hz - .4, y + h + .1, y + h + 1.7);
      // A chidori gable on the front slope of the lower tiers.
      if (i % 2 === 0) { b.colour.set(plaster); b.face('wall', [[-2.4, y + h + .5, z - hz - 1.4], [2.4, y + h + .5, z - hz - 1.4], [0, y + h + 2.6, z - hz - .6]], [0, 0, -1]); }
      y += h + 1.6;
    } else {
      hipRoof(b, tile, -hx - 2, hx + 2, z - hz - 2, z + hz + 2, y + h, y + h + 3.6);
      for (const x of [-hx + 1.4, hx - 1.4]) { b.colour.set(gold); b.box('metal', x - .35, x + .35, y + h + 3.4, y + h + 4.6, z - .3, z + .3, 'b'); }
    }
  });
}
/** Sazaedō on Iimoriyama (1796): a hexagonal, three-storey timber hall whose double
 * spiral ramp never crosses itself, under a shingled cap. */
function sazaedo(b: CityMeshBuilder): void {
  const z = 6, wood = '#5a4636', dark = '#3a2e26';
  block(b, 'stone', '#7f7a70', -6, 6, -.3, .6, z - 6, z + 6);
  revolve(b, 'wall', wood, [[5.2, .6], [4.7, 5.4], [4.2, 5.4], [3.7, 10.2], [3.2, 10.2], [2.6, 14]], 6, 0, z, Math.PI / 6);
  revolve(b, 'roof', dark, [[5.4, 5.2], [4.4, 6]], 6, 0, z, Math.PI / 6);
  revolve(b, 'roof', dark, [[4.6, 10], [3.6, 10.8]], 6, 0, z, Math.PI / 6);
  revolve(b, 'roof', dark, [[3.9, 13.8], [.4, 16.2]], 6, 0, z, Math.PI / 6);
  block(b, 'metal', '#6b5a3a', -.15, .15, 16, 16.9, z - .15, z + .15);
}
/** Kyoto Tower (1964), 131 m: a white shaft on the Kyoto Tower Building with a ringed
 * observation drum and a red-tipped mast. */
function kyotoTower(b: CityMeshBuilder, random: Random): void {
  const z = 20, white = '#eceae4', grey = '#bdb9b0';
  block(b, 'floodlit', grey, -30, 30, -.3, 31, 0, 40);
  panes(b, random, -29, 29, 2, 30, 0, 20, 9, 1.4, 2);
  revolve(b, 'floodlit', white, [[5.6, 31], [4.6, 70], [3.8, 98]], 16, 0, z);
  revolve(b, 'floodlit', white, [[3.8, 98], [8.6, 100], [8.6, 108], [5, 110]], 16, 0, z);
  b.window = [random() * .3, WINDOW_KIND.lobby]; b.colour.set('#3a4050');
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; b.face('glass', [[Math.cos(a) * 8.65, 102, z + Math.sin(a) * 8.65], [Math.cos(a + Math.PI / 8) * 8.65, 102, z + Math.sin(a + Math.PI / 8) * 8.65], [Math.cos(a + Math.PI / 8) * 8.65, 106, z + Math.sin(a + Math.PI / 8) * 8.65], [Math.cos(a) * 8.65, 106, z + Math.sin(a) * 8.65]], [Math.cos(a + Math.PI / 16), 0, Math.sin(a + Math.PI / 16)]); }
  revolve(b, 'floodlit', white, [[5, 110], [2.4, 122], [.8, 126]], 12, 0, z);
  b.colour.set('#c8402e'); b.cylinder('metal', 0, 126, z, .5, 4.5, 8);
  b.colour.setRGB(3.5, .3, .2); b.box('lamp', -.4, .4, 130.5, 131.3, z - .4, z + .4);
}
/** Yasaka Shrine's west gate (西楼門, 1497) at the head of Shijō-dōri: a vermilion
 * two-storey gate under cypress-bark roofs, up its stone steps. */
function yasakaGate(b: CityMeshBuilder, random: Random): void {
  const z = 9, vermilion = '#c8402e', white = '#f0ebe0', bark = '#4a3a30';
  for (let i = 0; i < 6; i++) block(b, 'stone', i % 2 ? '#9a958a' : '#8e897e', -10, 10, -.3, (i + 1) * .42, i * 1.05, z + 6);
  const y = 2.5;
  for (const x of [-5.2, -1.75, 1.75, 5.2]) for (const zz of [z - 2.3, z + 2.3]) block(b, 'floodlit', vermilion, x - .32, x + .32, y, y + 5.2, zz - .32, zz + .32);
  for (const x of [-1, 1]) block(b, 'floodlit', white, x * 5.2 - .25, x * 5.2 + .25, y + .6, y + 4.6, z - 2.2, z + 2.2);
  block(b, 'floodlit', vermilion, -5.6, 5.6, y + 4.8, y + 5.6, z - 2.7, z + 2.7);
  skirt(b, bark, 0, z, 8, 4.8, 5.4, 2.6, y + 5.4, y + 6.8);
  block(b, 'floodlit', vermilion, -4.4, 4.4, y + 6.8, y + 9.6, z - 2, z + 2);
  b.window = [random() * .4, WINDOW_KIND.home]; b.colour.set('#3a2a22'); b.front('glass', -3.4, 3.4, y + 7.4, y + 9.1, z - 2.03);
  block(b, 'floodlit', vermilion, -4.8, 4.8, y + 6.8, y + 7.2, z - 2.5, z + 2.5);
  hipRoof(b, bark, -7.4, 7.4, z - 4.4, z + 4.4, y + 9.4, y + 12.4);
}
/** Tōdai-ji's Nandaimon (1199): a 29 m wide, 25 m high gate of unpainted timber under two tiled roofs. */
function nandaimon(b: CityMeshBuilder, random: Random): void {
  const z = 6, wood = '#5a4232', tile = '#4a4e54', plaster = '#e8e2d2';
  block(b, 'stone', '#8a857a', -16, 16, -.3, 1, z - 7, z + 7);
  for (let i = 0; i < 6; i++) for (const zz of [z - 5.4, z, z + 5.4]) { const x = -13 + i * 5.2; block(b, 'wall', wood, x - .55, x + .55, 1, 12.5, zz - .55, zz + .55); }
  skirt(b, tile, 0, z, 17.5, 9.4, 13.8, 6, 12.6, 15.2);
  block(b, 'wall', wood, -12.6, 12.6, 15, 19.2, z - 5, z + 5);
  b.window = [random() * .2, WINDOW_KIND.dark]; b.colour.set(plaster); b.front('wall', -11, 11, 15.6, 18.6, z - 5.03);
  hipRoof(b, tile, -17, 17, z - 9, z + 9, 19, 25.5);
}
/** The Great Buddha Hall (大仏殿, 1709), 57 m wide and 49 m high: a mokoshi skirt,
 * the main hipped-gable roof, the karahafu over its central window and gold shibi. */
function daibutsuden(b: CityMeshBuilder, random: Random): void {
  const z = 4, wood = '#4e3a2c', plaster = '#ebe4d4', tile = '#454a50', gold = '#d8a83c';
  block(b, 'stone', '#8e897e', -31, 31, -.3, 1.6, z, z + 52);
  block(b, 'floodlit', plaster, -26, 26, 1.6, 15, z + 3, z + 49);
  for (let i = 0; i <= 10; i++) { const x = -26 + i * 5.2; block(b, 'wall', wood, x - .5, x + .5, 1.6, 15, z + 2.9, z + 3.6, 'bk'); }
  skirt(b, tile, 0, z + 26, 29.5, 26.5, 25.6, 22.6, 14.4, 18.6);
  block(b, 'floodlit', plaster, -23, 23, 18.2, 32, z + 6, z + 46);
  for (let i = 0; i <= 8; i++) { const x = -23 + i * 5.75; block(b, 'wall', wood, x - .45, x + .45, 18.2, 32, z + 5.9, z + 6.5, 'bk'); }
  b.window = [random() * .3, WINDOW_KIND.lobby]; b.colour.set('#3a2c22'); b.front('glass', -3.2, 3.2, 19.5, 24.5, z + 5.8);
  b.colour.set(tile); b.face('roof', [[-6, 25, z + 5], [6, 25, z + 5], [0, 28.6, z + 6]], [0, .4, -1]);
  hipRoof(b, tile, -27.5, 27.5, z + 2, z + 50, 31.6, 46.6);
  for (const x of [-19.5, 19.5]) { b.colour.set(gold); b.box('metal', x - .9, x + .9, 46.4, 49.2, z + 25.2, z + 26.8, 'b'); }
}
/** JNR Nara Station (1934): a temple-roofed hall with its sōrin, between low white wings. */
function naraStation(b: CityMeshBuilder, random: Random): void {
  const white = '#ece6da', tile = '#3e4a4c', bronze = '#6b5a3a';
  block(b, 'floodlit', white, -20, 20, -.3, 7, 6, 18);
  panes(b, random, -19, 19, 1, 6.5, 6, 14, 2, 1.1, 2.2, WINDOW_KIND.home, '#3a4040');
  hipRoof(b, tile, -21, 21, 5, 19, 7, 10);
  block(b, 'floodlit', white, -7, 7, -.3, 12, 4, 18);
  b.window = [random() * .3, WINDOW_KIND.lobby]; b.colour.set('#4a4038'); b.front('glass', -4.5, 4.5, .3, 6, 3.95);
  skirt(b, tile, 0, 11, 9.5, 9.5, 7.2, 7.2, 11.6, 13.4);
  hipRoof(b, tile, -7.6, 7.6, 3.4, 18.6, 13.2, 19.6);
  block(b, 'metal', bronze, -.18, .18, 19.4, 24, 10.82, 11.18);
  for (let k = 0; k < 5; k++) block(b, 'metal', bronze, -.5, .5, 20.2 + k * .7, 20.4 + k * .7, 10.5, 11.5);
}

/** The great halls of the Hongan-ji, Kyoto's largest timber buildings: Higashi Honganji's
 * Goei-dō (1895), 76 m across and 38 m high, its Amida-dō (1895), and Nishi Honganji's
 * Goei-dō (1636). A veranda of columns before a wall of doors, a skirt roof, and a vast
 * tiled hipped-gable roof, on a stone podium. */
function honganjiHall(b: CityMeshBuilder, random: Random, width: number, depth: number, height: number): void {
  const s = height / 38, hw = width / 2, z0 = 2, z1 = z0 + depth, zm = (z0 + z1) / 2, wood = '#5a4434', tile = '#464b52';
  block(b, 'stone', '#8e897e', -hw - 2, hw + 2, -.3, 1.5 * s, 0, z1 + 2);
  block(b, 'floodlit', '#e6dece', -hw + 4 * s, hw - 4 * s, 1.5 * s, 13 * s, z0 + 4 * s, z1 - 4 * s);
  const bays = Math.round(width / 6);
  for (let i = 0; i <= bays; i++) { const x = -hw + 2 * s + i * (width - 4 * s) / bays; block(b, 'wall', wood, x - .45 * s, x + .45 * s, 1.5 * s, 13 * s, z0 + 1.2 * s, z0 + 2.1 * s, 'bk'); }
  for (let i = 0; i < bays; i++) {
    const x = -hw + 4 * s + (i + .5) * (width - 8 * s) / bays;
    b.window = [random() * .4, WINDOW_KIND.lobby]; b.colour.set('#3a2c22'); b.front('glass', x - 1.6 * s, x + 1.6 * s, 2.4 * s, 9.5 * s, z0 + 3.95 * s);
  }
  skirt(b, tile, 0, zm, hw + 3 * s, depth / 2 + 3 * s, hw - 5 * s, depth / 2 - 5 * s, 12.6 * s, 17 * s);
  block(b, 'wall', wood, -hw + 6 * s, hw - 6 * s, 16.6 * s, 21 * s, z0 + 6 * s, z1 - 6 * s);
  hipRoof(b, tile, -hw - s, hw + s, z0 - s, z1 + s, 20.6 * s, height);
}
/** Minami-za (1929), the kabuki theatre at the east end of Shijō Ōhashi: a white four-storey
 * front under tiled eaves and karahafu gables, the yagura licence turret on the roof, and in
 * late November the maneki boards of the kaomise across its face. Its lot runs on along Shijō to the
 * river (local -X) across Kawabata-dōri, kept open so the theatre shows from the bridge. */
function minamiza(b: CityMeshBuilder, random: Random): void {
  const white = '#ece6da', tile = '#3e4246', c = 15;
  b.colour.set('#3e3e44'); b.flat('stone', -38, c - 22, 0, 42, -.03);
  block(b, 'floodlit', white, c - 22, c + 22, -.3, 18, 0, 40);
  panes(b, random, c - 20, c + 20, 1.6, 8.6, 0, 8, 2, 3.2, 2.6, WINDOW_KIND.lobby, '#3a3430');
  for (const y of [9.2, 14.2]) skirt(b, tile, c, 20, 23.4, 21.4, 22, 20, y, y + 1.2);
  for (let i = 0; i < 12; i++) { const x = c - 19.25 + i * 3.5; block(b, 'wall', '#e6d8b8', x - 1.4, x + 1.4, 10.6, 13.8, -.4, -.05); }
  b.colour.set(tile); for (const x of [c - 9, c + 9]) b.face('roof', [[x - 6, 18.4, -1.2], [x + 6, 18.4, -1.2], [x, 21.8, .4]], [0, .4, -1]);
  hipRoof(b, tile, c - 23, c + 23, -1, 41, 18, 23);
  block(b, 'wall', '#4a3a2e', c - 4, c + 4, 23, 27, 6, 12);
  block(b, 'wall', '#f0ebe0', c - 3.6, c + 3.6, 23.5, 26.5, 5.9, 6);
  hipRoof(b, tile, c - 5.2, c + 5.2, 4.8, 13.2, 27, 29.6);
}
/** Keage power station (1912) on the Lake Biwa canal: a long two-storey hall of red brick with
 * stone string courses and tall paired windows, under a slate hipped roof. */
function keagePower(b: CityMeshBuilder, random: Random): void {
  const brick = '#8c3f2c', stone = '#cfc6b4', dark = '#2a2422';
  // The canal (琵琶湖疏水) along its front: stone embankments down to the water, a rail on the road side, stairs at one end.
  b.colour.set('#8e8678'); b.flat('stone', -34, 34, -9.2, -1.4, -.04);
  b.colour.set('#7e7668'); b.front('stone', -34, 34, -2.8, -.04, -8.4, 1); b.front('stone', -34, 34, -2.8, -.04, -2.6, -1);
  b.colour.set('#ffffff'); b.flat('water', -34, 34, -8.4, -2.6, -2.4);
  b.colour.set('#3a3a3e');
  for (let x = -34; x <= 34; x += 2.4) b.box('metal', x - .04, x + .04, -.04, 1.05, -8.6, -8.5, 'b');
  b.box('metal', -34, 34, .98, 1.06, -8.62, -8.48, 'b');
  for (let k = 0; k < 9; k++) block(b, 'stone', '#9a9284', 22 + k * .45, 22.45 + k * .45, -2.4 + k * .27, -2.1 + k * .27, -8.4, -6.8, 'b');
  // The stone plinth, the brick walls between pilasters, stone string courses and a cornice with its parapet.
  block(b, 'floodlit', stone, -30.2, 30.2, -.3, 1.4, -.1, 20.1);
  block(b, 'floodlit', brick, -30, 30, 1.4, 12.6, 0, 20, 'b');
  for (let i = 0; i <= 12; i++) { const x = -30 + i * 5; block(b, 'floodlit', i % 6 === 0 ? stone : brick, x - .35, x + .35, 1.4, 12.6, -.25, 0, 'bk'); }
  for (const y of [6.2, 12.6]) block(b, 'floodlit', stone, -30.4, 30.4, y, y + .45, -.35, 20.2, 'b');
  block(b, 'floodlit', brick, -30.2, 30.2, 13.05, 14.1, -.2, 20.1, 'b');
  block(b, 'floodlit', stone, -30.4, 30.4, 14.1, 14.35, -.3, 20.2, 'b');
  // Tall arched windows, lit by the machine hall within: a pane with a round head (a polygon) in a stone surround.
  for (let i = 0; i < 12; i++) {
    const x = -27.5 + i * 5;
    for (const [y0, y1] of [[2.1, 5.5], [7.2, 11.6]] as const) {
      const w = 1.25, spring = y1 - w;
      b.window = [random() * .3, WINDOW_KIND.lobby]; b.colour.set('#4a3a2e');
      b.front('glass', x - w, x + w, y0, spring, -.03);
      for (let s = 0; s < 6; s++) {
        const a0 = Math.PI * s / 6, a1 = Math.PI * (s + 1) / 6;
        b.face('glass', [[x, spring, -.03], [x + Math.cos(a0) * w, spring + Math.sin(a0) * w, -.03], [x + Math.cos(a1) * w, spring + Math.sin(a1) * w, -.03]], [0, 0, -1]);
      }
      // The arch's stone voussoirs and keystone, and the sill.
      b.colour.set(stone);
      for (let s = 0; s < 6; s++) {
        const a0 = Math.PI * s / 6, a1 = Math.PI * (s + 1) / 6, r0 = w, r1 = w + .32;
        b.face('floodlit', [[x + Math.cos(a0) * r0, spring + Math.sin(a0) * r0, -.08], [x + Math.cos(a0) * r1, spring + Math.sin(a0) * r1, -.08],
          [x + Math.cos(a1) * r1, spring + Math.sin(a1) * r1, -.08], [x + Math.cos(a1) * r0, spring + Math.sin(a1) * r0, -.08]], [0, 0, -1]);
      }
      block(b, 'floodlit', stone, x - .22, x + .22, y1 - .05, y1 + .45, -.14, 0, 'bk');
      block(b, 'floodlit', stone, x - w - .15, x + w + .15, y0 - .22, y0, -.18, 0, 'bk');
      b.colour.set(dark);
      b.box('metal', x - .03, x + .03, y0, spring + w * .9, -.06, -.02, 'bkt');
      b.box('metal', x - w, x + w, (y0 + spring) / 2 - .03, (y0 + spring) / 2 + .03, -.06, -.02, 'bkt');
    }
  }
  // A low hipped roof behind the parapet, and period lamps along the canal rail.
  hipRoof(b, '#3e4044', -30.6, 30.6, -.6, 20.6, 14.1, 17.6);
  for (let x = -30; x <= 30; x += 12) {
    block(b, 'metal', '#2e3032', x - .08, x + .08, -.04, 3.6, -8.9, -8.75, 'b');
    b.colour.set('#ffd08a'); b.box('lamp', x - .22, x + .22, 3.6, 4.1, -9.05, -8.6, 'b');
    b.beacon(x, 3.85, -8.8, 2.6, 1.7, .9, .5);
  }
}
/** The Kyoto City Museum of Art (1933) at Okazaki, in the Imperial Crown style: long tan wings
 * either side of a central block crowned by a tiled Japanese roof. */
function kyotoMuseum(b: CityMeshBuilder, random: Random): void {
  const tan = '#c9b48e', tile = '#4a4e52';
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -55 : 12, x1 = s < 0 ? -12 : 55;
    block(b, 'floodlit', tan, x0, x1, -.3, 14, 4, 70);
    panes(b, random, x0 + 2, x1 - 2, 3, 12, 4, 9, 2, 1.6, 3, WINDOW_KIND.dark, '#2e3036');
    hipRoof(b, tile, x0 - 1, x1 + 1, 3, 71, 14, 17.5);
  }
  block(b, 'floodlit', tan, -12, 12, -.3, 20, 0, 34);
  b.window = [random() * .3, WINDOW_KIND.lobby]; b.colour.set('#3a3430'); b.front('glass', -4, 4, .3, 8, -.03);
  hipRoof(b, tile, -15.5, 15.5, -3, 37, 20, 30);
}
/** Kyoto Station's third building (1952), opposite the tower: a long, low concrete block with a
 * tall central block, set back across its open forecourt. Its JNR signs became JR only in April 1987. */
function kyotoStation1952(b: CityMeshBuilder, random: Random): void {
  const concrete = '#d8d4c8', z = 70;
  b.colour.set('#8f8c86'); b.flat('stone', -80, 80, 0, z, -.03);
  block(b, 'floodlit', concrete, -80, 80, -.3, 9, z, z + 28);
  panes(b, random, -78, -18, 1, 8.4, z, 20, 2, 2.2, 2.4, WINDOW_KIND.lobby, '#3a4048');
  panes(b, random, 18, 78, 1, 8.4, z, 20, 2, 2.2, 2.4, WINDOW_KIND.lobby, '#3a4048');
  block(b, 'floodlit', concrete, -16, 16, -.3, 30, z + 2, z + 26);
  panes(b, random, -14, 14, 9.6, 29, z + 2, 8, 6, 2.2, 2.2, WINDOW_KIND.office, '#3a4048');
  b.window = [random() * .3, WINDOW_KIND.lobby]; b.colour.set('#3a3a40'); b.front('glass', -12, 12, .3, 7.6, z - .03);
}
/** Heian Jingū's Ōtenmon (1895): a vermilion two-storey gate under green-glazed tiles. */
function otenmon(b: CityMeshBuilder, random: Random): void {
  const z = 6, vermilion = '#c8402e', white = '#f0ebe0', green = '#4f8a6a';
  block(b, 'stone', '#9a958a', -16, 16, -.3, 1, z - 6, z + 6);
  for (let i = 0; i < 6; i++) for (const zz of [z - 3.6, z + 3.6]) { const x = -12.5 + i * 5; block(b, 'floodlit', vermilion, x - .45, x + .45, 1, 8, zz - .45, zz + .45); }
  skirt(b, green, 0, z, 15.5, 6.6, 13, 4.2, 7.8, 9.6);
  block(b, 'floodlit', vermilion, -11.5, 11.5, 9.6, 13.4, z - 3.4, z + 3.4);
  b.window = [random() * .3, WINDOW_KIND.home]; b.colour.set(white); b.front('wall', -10, 10, 10.2, 12.8, z - 3.43);
  hipRoof(b, green, -15, 15, z - 6.4, z + 6.4, 13.2, 18);
}
/** Kasuga Taisha's first torii (一之鳥居, 1634) where Sanjō-dōri enters Nara Park: vermilion,
 * 6.75 m high, with the straight kasagi of the Kasuga style. */
function kasugaTorii(b: CityMeshBuilder): void {
  const z = 1.5, vermilion = '#c8402e';
  for (const x of [-3, 3]) { b.colour.set(vermilion); b.cylinder('floodlit', x, -.3, z, .32, 6.05, 12); }
  block(b, 'floodlit', vermilion, -3.9, 3.9, 4.6, 5.1, z - .22, z + .22);
  block(b, 'floodlit', vermilion, -.25, .25, 5.1, 5.75, z - .2, z + .2);
  block(b, 'floodlit', vermilion, -4.6, 4.6, 5.75, 6.3, z - .4, z + .4);
  block(b, 'roof', '#2a2626', -4.8, 4.8, 6.3, 6.75, z - .5, z + .5);
}
/** Nara Dreamland's castle (1961), after Disneyland's Sleeping Beauty Castle: pale walls and towers
 * under blue spires with gilded tips. The park's lamps around it light up at night. */
function dreamlandCastle(b: CityMeshBuilder, random: Random): void {
  const z = 24, wall = '#ede0e4', spire = '#4c6aa8', gold = '#d6a646';
  block(b, 'floodlit', wall, -16, 16, -.3, 10, z - 8, z + 8);
  block(b, 'floodlit', wall, -6, 6, 10, 17, z - 5, z + 5);
  const towers: readonly (readonly [number, number, number, number])[] = [[-14, z - 6, 2.6, 14], [14, z - 6, 2.6, 14], [-7, z + 5, 2.2, 18], [7, z + 5, 2.2, 18], [0, z, 3, 21]];
  for (const [x, tz, r, h] of towers) {
    revolve(b, 'floodlit', wall, [[r, 0], [r, h]], 8, x, tz);
    revolve(b, 'roof', spire, [[r + .6, h], [.2, h + r * 2.6]], 8, x, tz);
    b.colour.set(gold); b.box('metal', x - .15, x + .15, h + r * 2.6, h + r * 2.6 + 1.2, tz - .15, tz + .15, 'b');
  }
  // The park's lamps along Main Street and the paths.
  for (let i = 0; i < 40; i++) {
    const a = random() * Math.PI * 2, d = 30 + random() * 110, x = Math.cos(a) * d, lz = z + Math.sin(a) * d * .7;
    b.colour.setRGB(2.6, 1.9, 1.1); b.box('lamp', x - .9, x + .9, 4, 5.8, lz - .9, lz + .9);
  }
}
/** The broadcast towers on Ikoma's summit, which carried Osaka's television to the whole Kinki
 * region: red-and-white lattice masts with red aviation lights. The exact 1986 set is unconfirmed. */
function ikomaTowers(b: CityMeshBuilder): void {
  const sites: readonly (readonly [number, number, number])[] = [[-260, 40, 110], [-120, -60, 130], [0, 30, 120], [140, -40, 100], [270, 60, 90]];
  for (const [x, z, h] of sites) {
    for (let k = 0; k < 7; k++) {
      const y0 = k * h / 7, y1 = (k + 1) * h / 7, w = 6 * (1 - k / 8);
      block(b, 'floodlit', k % 2 ? '#e8e4dc' : '#c8402e', x - w / 2, x + w / 2, y0, y1, z - w / 2, z + w / 2);
    }
    b.colour.setRGB(4, .3, .2);
    for (const y of [h, h * .62]) b.box('lamp', x - 1.4, x + 1.4, y, y + 2.4, z - 1.4, z + 1.4);
  }
}

const BUILDERS: Readonly<Record<PeriodLandmarkKind, (b: CityMeshBuilder, random: Random) => void>> = {
  diet, budokan, 'kudan-kaikan': kudanKaikan, 'national-theatre': nationalTheatre, justice, police,
  daiichi, kaijo, 'palace-side': palaceSide, jack, queen, king, pagoda, fujiya, 'new-grand': newGrand,
  zenrinmon, 'nikko-station': nikkoStation,
  'pagoda-toji': b => timberPagoda(b, 55), 'pagoda-yasaka': b => timberPagoda(b, 46),
  'pagoda-kofukuji': b => timberPagoda(b, 50), 'tsuruga-keep': tsurugaKeep, sazaedo,
  'kyoto-tower': kyotoTower, 'yasaka-gate': yasakaGate, nandaimon, daibutsuden, 'nara-station': naraStation,
  'honganji-goeido': (b, random) => honganjiHall(b, random, 76, 58, 38), 'honganji-amidado': (b, random) => honganjiHall(b, random, 52, 47, 29),
  'nishi-goeido': (b, random) => honganjiHall(b, random, 62, 48, 29), minamiza, 'keage-power': keagePower, 'kyoto-museum': kyotoMuseum,
  'kyoto-station-1952': kyotoStation1952, otenmon, 'kasuga-torii': kasugaTorii,
  'pagoda-yakushiji': b => timberPagoda(b, 34), 'pagoda-yakushiji-west': b => timberPagoda(b, 34, '#b8402e'),
  'dreamland-castle': dreamlandCastle, 'ikoma-towers': ikomaTowers,
};
export function isBuildingLandmark(kind: string): kind is PeriodLandmarkKind { return kind in BUILDERS; }
/** Build a landmark in the current frame (the reserved footprint's front-centre, facing the road). */
export function buildLandmark(b: CityMeshBuilder, kind: PeriodLandmarkKind, random: Random): void {
  BUILDERS[kind](b, random);
}
