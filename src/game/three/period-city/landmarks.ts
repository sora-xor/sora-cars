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
  | 'daiichi' | 'kaijo' | 'palace-side' | 'jack' | 'queen' | 'king' | 'pagoda' | 'fujiya' | 'new-grand' | 'zenrinmon' | 'nikko-station';

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

const BUILDERS: Readonly<Record<PeriodLandmarkKind, (b: CityMeshBuilder, random: Random) => void>> = {
  diet, budokan, 'kudan-kaikan': kudanKaikan, 'national-theatre': nationalTheatre, justice, police,
  daiichi, kaijo, 'palace-side': palaceSide, jack, queen, king, pagoda, fujiya, 'new-grand': newGrand,
  zenrinmon, 'nikko-station': nikkoStation,
};
export function isBuildingLandmark(kind: string): kind is PeriodLandmarkKind { return kind in BUILDERS; }
/** Build a landmark in the current frame (the reserved footprint's front-centre, facing the road). */
export function buildLandmark(b: CityMeshBuilder, kind: PeriodLandmarkKind, random: Random): void {
  BUILDERS[kind](b, random);
}
