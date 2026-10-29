import * as THREE from 'three';
import { type CityMeshBuilder, type CityMaterialKey, type Vec3, WALL_PATTERN, WINDOW_KIND } from './geometry';
import { hashInts, seeded, type PeriodDistrict, type PeriodLot } from './layout';
import { aviationLight, hangingBanner, neonBlade, neonFor, nobori, noboriFor, rooftopNeon, verticalNeon, vneonFor, windowNeon } from './nightlife';
import { boxIndex, fasciaTitle, lanternIndex, NEON_COUNTS, neonIndex, neonPrint, pickSign, signIndex, signPrint, printSlice, SORA_BOARDS, SORA_NOBORI, SORA_VNEON,
  vneonIndex, type PrintRect } from './signs';
import { AWNING_VALANCE, awningFor, awningPrint, NOREN_HEIGHT, norenFor, norenIndex, norenPrint, norenWidth } from './awnings';

/** A shop light the race can assign to one of its spot lights (world space). */
export interface CityFixture { readonly position: THREE.Vector3; readonly target: THREE.Vector3 }
type Random = () => number;
interface Facade { wall: THREE.Color; reveal: THREE.Color; trim: THREE.Color; flank: THREE.Color; frame: THREE.Color; glass: THREE.Color; kind: number; weathered?: boolean }
interface Context {
  readonly b: CityMeshBuilder; readonly lot: PeriodLot; readonly random: Random;
  /** A second stream for the street life (neon, nobori, banners), so adding it leaves each building as it was. */
  readonly extra: Random;
  /** 2 frontage (full detail), 1 second row, 0 distant rows (flush panes, simple roofs). */
  readonly detail: 0 | 1 | 2;
  /** The local X direction that faces drivers approaching along the route. */
  readonly toward: -1 | 1;
  readonly fixtures: CityFixture[];
}

// Period palettes (sRGB). Kanda's mortar and small tiles, Marunouchi's
// beige and brown cladding, copper kanban fronts, pastel 1980s mansions.
const MORTAR = ['#cfc4ae', '#d8cdb5', '#bfb6a4', '#c9b79a', '#b9b2a6', '#d6c9a8', '#c2b8a8'];
const TILE_WARM = ['#8a6a55', '#9b7a5e', '#b39373', '#c4a684', '#7a5446', '#a5826a', '#c9b190', '#6e4a3e'];
const TILE_LIGHT = ['#e4dccb', '#ddd3bf', '#e9e2d3', '#d4cbb7', '#efe7d6', '#d9d2c4'];
const CONCRETE = ['#a7a59f', '#9c9a95', '#b3b0a8', '#8f8e8a', '#aaa49a'];
const COPPER = ['#5e8f7d', '#6f9a86', '#4f7f6e', '#7d6a4f', '#5a7f84'];
const SHEET = ['#3f6f78', '#7a4038', '#4a5f7a', '#5d6b4a', '#8a8a82', '#9a5a3a'];
const PASTEL = ['#e8dccc', '#e3d8cb', '#d9cbb7', '#e6dccf', '#d7cdbd', '#e4d8cc', '#dcd6c4', '#ddd3c4'];
const STATELY = ['#9a968c', '#b4aa94', '#a39b88', '#8c8a84', '#b9ae98', '#a0927e'];
const FRAMES = ['#b9bcbc', '#b9bcbc', '#4b3f36', '#e2e0da', '#2a2a2e'];
const GLASS = ['#3c4a5e', '#4a4038', '#2f3a40', '#465868', '#3a3f52'];
// Deep enough that an awning's stripes stand out from its cream under a street lamp (refine round 4).
const AWNINGS = ['#b8352f', '#2f6a4f', '#2f4f8a', '#b8502a', '#7a4a3a', '#a07a26', '#2f6a6a', '#8a2f4a'];
/** Noren cloth: indigo most of all, then maroon, plum, dark green and brown. */
const NOREN = ['#26346a', '#26346a', '#2a2f5e', '#6a2226', '#4a2c5e', '#2c4a36', '#6a4428'];
const BODY = ['#c23a30', '#2f5fa8', '#e9e6dc', '#e7b53a', '#2f7a52'];
const LAUNDRY = ['#e8e0f0', '#f0c8c8', '#c8d8f0', '#f4ecd0', '#5a7ab0', '#c8504a', '#e8c86a', '#6a9a7a', '#f0f0e8'];

const colour = (random: Random, list: readonly string[]) => new THREE.Color(list[Math.floor(random() * list.length)]!);
/** Small hue/value drift so neighbours from one palette never match exactly. */
function drift(c: THREE.Color, random: Random, amount = .04): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
  return c.setHSL(hsl.h + (random() - .5) * amount * .5, THREE.MathUtils.clamp(hsl.s + (random() - .5) * amount, 0, 1),
    THREE.MathUtils.clamp(hsl.l + (random() - .5) * amount * 1.5, 0, 1));
}
const shade = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);
function facade(random: Random, wall: THREE.Color, kind: number): Facade {
  // Party walls are plain concrete or mortar whatever the street face is clad in.
  const flank = wall.clone().lerp(new THREE.Color(colour(random, CONCRETE)), .6).multiplyScalar(.9);
  return { wall, reveal: shade(wall, .72), trim: shade(wall, .86), flank, frame: colour(random, FRAMES), glass: drift(colour(random, GLASS), random), kind };
}

/** A window opening: reveals, a recessed pane, mullions and a sill. `seed` decides when it is lit. */
function opening(x: Context, f: Facade, x0: number, x1: number, y0: number, y1: number, mullions = 1, kind = f.kind, seed = x.random()): void {
  const { b, detail } = x, recess = detail ? .16 : .02;
  if (detail) {
    b.colour.copy(f.reveal);
    b.side('wall', x0, 0, recess, y0, y1, 1); b.side('wall', x1, 0, recess, y0, y1, -1);
    b.flat('wall', x0, x1, 0, recess, y1, -1); b.flat('wall', x0, x1, 0, recess, y0, 1);
  }
  b.window = [seed, kind]; b.colour.copy(f.glass);
  b.front('glass', x0, x1, y0, y1, recess);
  if (!detail) return;
  b.colour.copy(f.frame);
  for (let i = 1; i <= mullions; i++) {
    const m = x0 + (x1 - x0) * i / (mullions + 1);
    b.box('metal', m - .025, m + .025, y0, y1, recess - .05, recess - .005, 'bkt');
  }
  if (detail === 2) b.box('metal', x0, x1, y1 - .05, y1, recess - .05, recess - .005, 'bk');
  b.colour.copy(f.trim);
  b.box('wall', x0 - .05, x1 + .05, y0 - .06, y0, -.05, 0, 'bk');
  // A little rain hood (霧除け) over the windows of a third of the homes, as the cutscenes' houses have them (refine
  // round 4); chosen by the lot, so no draw from its streams.
  if (detail === 2 && kind === WINDOW_KIND.home && x.lot.seed % 3 === 0) {
    b.colour.copy(f.frame).multiplyScalar(.8);
    b.box('metal', x0 - .1, x1 + .1, y1 + .04, y1 + .1, -.32, 0, 'k');
    b.box('metal', x0 - .1, x1 + .1, y1 - .02, y1 + .04, -.33, -.3, 'kt');
  }
}

/**
 * Storeys of punched or banded windows on the facade plane (z = 0), wall
 * strips left between the openings. `columns` are window centres and widths;
 * gaps narrower than 0.2 m become metal frames (ribbon windows).
 */
function windowRows(x: Context, f: Facade, x0: number, x1: number, floors: readonly number[],
  columns: readonly (readonly [number, number])[], sill: number, head: number, mullions = 1,
  skip?: (floor: number, column: number) => boolean): void {
  const { b, random } = x;
  for (let floor = 0; floor < floors.length - 1; floor++) {
    const y0 = floors[floor]!, y1 = floors[floor + 1]!, ws = y0 + sill, wh = Math.min(y1 - .2, y0 + head);
    // Offices work late floor by floor: their panes share most of a floor's seed.
    const floorSeed = random(), shared = f.kind === WINDOW_KIND.office ? .78 : .25;
    b.colour.copy(f.wall);
    b.front('wall', x0, x1, y0, ws, 0); b.front('wall', x0, x1, wh, y1, 0);
    let edge = x0;
    columns.forEach(([centre, width], column) => {
      const a = centre - width / 2, c = centre + width / 2;
      if (a > edge + .001) {
        if (a - edge < .2) { b.colour.copy(f.frame); b.front('metal', edge, a, ws, wh, -.01); }
        else { b.colour.copy(f.wall); b.front('wall', edge, a, ws, wh, 0); }
      }
      if (skip?.(floor, column)) { b.colour.copy(f.wall); b.front('wall', a, c, ws, wh, 0); }
      else {
        opening(x, f, a, c, ws, wh, mullions, f.kind, floorSeed * shared + random() * (1 - shared));
        // An air conditioner under some upper windows of the frontage, as the cutscenes hang them under nearly every
        // flat's window (refine round 4); chosen by a hash of the lot, floor and window, so no draw from its streams.
        if (x.detail === 2 && floor > 0 && c - a > 1 && (hashInts(x.lot.seed, floor, column, 61) >>> 0) % 100 < (f.kind === WINDOW_KIND.office ? 8 : 22))
          acUnit(x, (a + c) / 2 + ((hashInts(x.lot.seed, floor, column, 67) >>> 0) % 2 ? .25 : -.25), ws - .68, -.02);
        if (x.detail && f.weathered && random() < .4) {
          // Rain streaks run down 1980s concrete and tile below the sills.
          const half = (c - a) * (.12 + random() * .18), mid = (a + c) / 2;
          b.colour.copy(f.wall).multiplyScalar(.8);
          b.front('wall', mid - half, mid + half, Math.max(y0 + .1, ws - 1 - random() * 1.4), ws - .07, -.02);
        }
      }
      edge = c;
    });
    if (x1 > edge + .001) { b.colour.copy(f.wall); b.front('wall', edge, x1, ws, wh, 0); }
  }
}
const evenColumns = (x0: number, x1: number, count: number, width: number) =>
  Array.from({ length: count }, (_, i) => [x0 + (x1 - x0) * (i + .5) / count, width] as const);
const levels = (ground: number, storey: number, storeys: number) => Array.from({ length: storeys + 1 }, (_, i) => i === 0 ? 0 : ground + (i - 1) * storey);

/** Side, back and roof faces of the main volume; small flush windows on long flanks. */
function shell(x: Context, f: Facade, w: number, d: number, h: number, roof = true, flankWindows = true): void {
  const { b, random, detail, toward } = x;
  b.colour.copy(f.flank);
  b.side('wall', -w / 2, 0, d, 0, h, -1); b.side('wall', w / 2, 0, d, 0, h, 1);
  b.colour.copy(shade(f.flank, .92)); b.front('wall', -w / 2, w / 2, 0, h, d, 1);
  if (roof) { b.colour.set('#77736c'); b.flat('wall', -w / 2, w / 2, 0, d, h); }
  // A rain downpipe down one front corner from the gutter, as every cutscene facade has (refine round 4), with its
  // brackets; on the frontage, chosen by the lot (no draw from its streams).
  if (detail === 2 && h > 4 && x.lot.seed % 5 < 3) {
    const px = (x.lot.seed % 2 ? 1 : -1) * (w / 2 - .12);
    b.colour.set(x.lot.seed % 7 < 3 ? '#4a4c4e' : '#8a8478');
    b.box('metal', px - .045, px + .045, .1, h - .1, -.14, -.05, 'b');
    b.box('metal', px - .045, px + .045, h - .25, h - .1, -.14, 0, 'b');
    for (let y = 1.6; y < h - .5; y += 2.4) b.box('metal', px - .07, px + .07, y, y + .05, -.16, 0, 'b');
  }
  if (!flankWindows || h < 7) return;
  if (detail === 0) { flankGrid(x, f, w, d, h, 0, 1); return; }
  let advertised = 0;
  if (h > 11 && d > 9 && random() < .3) {
    // A painted advertisement on the flank that faces oncoming traffic.
    const aw = Math.min(d * .75, 11), ah = aw / 2, y = h - ah - 1 - random() * Math.max(0, h - ah - 6);
    b.print = signPrint('board', pickSign(x.b.signs, 'board', random)); b.colour.set('#c8c2b8');
    b.side('sign', toward * (w / 2 + .03), d / 2 - aw / 2, d / 2 + aw / 2, y, y + ah, toward);
    advertised = toward;
  }
  // Japanese flanks are mostly blank; a few stair and toilet windows.
  for (const s of [-1, 1] as const) {
    const count = Math.floor(random() * 3);
    for (let i = 0; i < count; i++) {
      const z = d * (.2 + random() * .6), y = 3 + random() * (h - 5);
      b.window = [random(), f.kind]; b.colour.copy(f.glass);
      b.side('glass', s * (w / 2 + .02), z - .4, z + .4, y, y + 1.1, s);
    }
  }
  flankGrid(x, f, w, d, h, advertised, detail === 1 ? 1 : .7);
}

/**
 * Down a straight street the flanks that rise above their neighbours are what the camera sees of the far city.
 * Blank, they read as dark slabs where the user's rain-night concept paints layers of lit windows, so they carry
 * windows floor by floor, lit at night like the fronts (offices whole floors at a time): every grid position on the
 * back rows, `keep` of them on the frontage, whose flanks stay mostly blank. `skip` is a flank (-1 or 1) already
 * carrying an advertisement. Their own stream (extra), so the building is unchanged.
 */
function flankGrid(x: Context, f: Facade, w: number, d: number, h: number, skip: number, keep: number): void {
  const { b, extra } = x, columns = Math.floor((d - 1.6) / 3.4), shared = f.kind === WINDOW_KIND.office ? .78 : .3;
  if (h < 10 || columns < 1) return;
  for (const s of [-1, 1] as const) {
    if (s === skip) continue;
    for (let y = 3.2; y + 1.4 < h - 1; y += 3.2) {
      const floorSeed = extra();
      for (let i = 0; i < columns; i++) {
        const z = .8 + (d - 1.6) * (i + .5) / columns, seed = floorSeed * shared + extra() * (1 - shared);
        if (keep < 1 && extra() > keep) continue;
        b.window = [seed, f.kind]; b.colour.copy(f.glass);
        b.side('glass', s * (w / 2 + .035), z - .7, z + .7, y, y + 1.4, s);
      }
    }
  }
}
function parapet(x: Context, colour: THREE.Color, w: number, d: number, h: number, height = .9, thickness = .2): void {
  const { b } = x;
  b.colour.copy(colour);
  b.box('wall', -w / 2, w / 2, h, h + height, -.04, thickness, 'b');
  b.box('wall', -w / 2, w / 2, h, h + height, d - thickness, d, 'bf');
  b.box('wall', -w / 2, -w / 2 + thickness, h, h + height, thickness, d - thickness, 'bfk');
  b.box('wall', w / 2 - thickness, w / 2, h, h + height, thickness, d - thickness, 'bfk');
}

/** Rooftop plant: elevator room, water tank on its stand, cooling tower, antennas, a billboard. */
function rooftop(x: Context, w: number, d: number, h: number, options: { billboard?: number; tank?: boolean; tower?: boolean } = {}): void {
  const { b, random, detail, toward } = x;
  if (w > 6 && d > 7) {
    const pw = Math.min(4.2, w * .35), pd = Math.min(4, d * .3), px = (random() - .5) * (w - pw - 1), pz = d * (.45 + random() * .3);
    b.colour.copy(drift(new THREE.Color(colour(random, CONCRETE)), random));
    b.box('wall', px - pw / 2, px + pw / 2, h, h + 2.7, pz - pd / 2, pz + pd / 2);
    b.colour.set('#5a5650'); b.box('metal', px - pw / 2 - .1, px + pw / 2 + .1, h + 2.7, h + 2.85, pz - pd / 2 - .1, pz + pd / 2 + .1, 'b');
  }
  if (options.tank ?? random() < .65) {
    const tx = (random() - .5) * (w - 3), tz = d * (.2 + random() * .5), stand = 1.2 + random() * 2.2;
    b.colour.set('#4a4c50');
    for (const [lx, lz] of [[-.8, -.6], [.8, -.6], [-.8, .6], [.8, .6]] as const) b.box('metal', tx + lx - .06, tx + lx + .06, h, h + stand, tz + lz - .06, tz + lz + .06, 'bt');
    b.box('metal', tx - 1, tx + 1, h + stand, h + stand + .12, tz - .8, tz + .8, 'b');
    if (random() < .5) { b.colour.set(random() < .5 ? '#c9c7bf' : '#9fb3bd'); b.box('metal', tx - .9, tx + .9, h + stand + .12, h + stand + 1.5, tz - .7, tz + .7, 'b'); }
    else { b.colour.set('#b8babc'); b.cylinder('metal', tx, h + stand + .12, tz, .75, 1.6, detail ? 12 : 8); }
  }
  if (options.tower) {
    const cx = (random() - .5) * (w - 6), cz = d * .7;
    b.colour.set('#8a8e8c'); b.box('metal', cx - 1.8, cx + 1.8, h, h + 2.6, cz - 1.8, cz + 1.8);
    b.colour.set('#3a3c3e'); b.cylinder('metal', cx, h + 2.6, cz, 1.2, .5, 12);
  }
  if (detail) for (let i = 0, n = 1 + Math.floor(random() * 3); i < n; i++) {
    const ax = (random() - .5) * (w - 1), az = d * (.3 + random() * .6), tall = 2 + random() * 2.5;
    b.colour.set('#2e2e32');
    b.box('metal', ax - .03, ax + .03, h, h + tall, az - .03, az + .03, 'b');
    for (let k = 0; k < 3; k++) b.box('metal', ax - .5 + k * .1, ax + .5 - k * .1, h + tall - .3 - k * .35, h + tall - .26 - k * .35, az - .02, az + .02, 'b');
  }
  if (options.billboard !== undefined) billboard(x, w, d, h, options.billboard, toward);
}

/** A lit rooftop billboard on a steel stand, turned to face approaching drivers or the street. */
function billboard(x: Context, w: number, d: number, h: number, index: number, toward: -1 | 1): void {
  const { b, random } = x;
  const along = random() < .6, bw = Math.min(along ? d * .8 : w * .85, 9), bh = bw / 2, lift = 1.4 + random();
  const print = signPrint('board', index), key: CityMaterialKey = 'sign';
  b.colour.set('#2c2c30');
  if (along) {
    const px = toward * (w / 2 - .6), z0 = d / 2 - bw / 2, z1 = d / 2 + bw / 2;
    for (const z of [z0 + .4, z1 - .4]) b.box('metal', px - .08, px + .08, h, h + lift + bh, z - .08, z + .08, 'b');
    b.box('metal', px - .12 - (toward > 0 ? .05 : 0), px + .12, h + lift - .15, h + lift + bh + .1, z0, z1, 'b');
    b.print = print; b.colour.set('#ffffff'); b.side(key, px + toward * .13, z0 + .05, z1 - .05, h + lift, h + lift + bh, toward);
    b.colour.set('#ffd9a0');
    for (let i = 0; i < 4; i++) b.box('lamp', px + toward * .5 - .06, px + toward * .5 + .06, h + lift - .25, h + lift - .15, z0 + bw * (i + .5) / 4 - .15, z0 + bw * (i + .5) / 4 + .15);
  } else {
    const z = Math.min(2.5, d * .25), x0 = -bw / 2, x1 = bw / 2;
    for (const px of [x0 + .4, x1 - .4]) b.box('metal', px - .08, px + .08, h, h + lift + bh, z - .08, z + .08, 'b');
    b.box('metal', x0, x1, h + lift - .15, h + lift + bh + .1, z - .1, z + .12, 'b');
    b.print = print; b.colour.set('#ffffff'); b.front(key, x0 + .05, x1 - .05, h + lift, h + lift + bh, z - .12);
  }
}

/** A protruding vertical sign (袖看板): prints on both flanks, lit from within. */
function verticalSign(x: Context, px: number, y0: number, y1: number, reach: number, panels: number, word?: string): void {
  // A third deeper than life (refine round 4): the concept paints its signs big, so their lettering reads far down
  // the street; at true size it fell under a few art cells.
  const { b, random } = x, t = .26, out = reach * 1.35, z0 = -out, z1 = -.18;
  b.colour.set('#2f2d30');
  b.box('metal', px - t / 2, px + t / 2, y0 - .06, y1 + .06, z0 - .04, z1, 'b');
  for (const y of [y0 + .4, y1 - .4]) b.box('metal', px - .04, px + .04, y - .04, y + .04, z1, 0, 'b');
  const base = word ? signIndex('vertical', word) : pickSign(b.signs, 'vertical', random), step = (y1 - y0) / panels;
  const pool = word ? null : b.signs?.vertical, at = pool ? pool.indexOf(base) : -1;
  for (let i = 0; i < panels; i++) {
    // A stacked sign gives each floor's tenant its own panel.
    const tenant = pool && at >= 0 ? pool[(at + i * 7) % pool.length]! : base + i * 7;
    const print = panels === 1 ? signPrint('vertical', base) : printSlice(signPrint('vertical', tenant), .3 + random() * .1, .7 + random() * .1);
    const a = y0 + step * i + (panels > 1 ? .08 : 0), c = y0 + step * (i + 1) - (panels > 1 ? .08 : 0);
    b.print = print; b.colour.set('#ffffff');
    b.side('sign', px - t / 2 - .01, z0, z1, a, c, -1);
    b.side('sign', px + t / 2 + .01, z0, z1, a, c, 1);
  }
}
/** A shop fascia board above the opening. */
function fascia(x: Context, x0: number, x1: number, y0: number, y1: number, print: PrintRect): void {
  const { b } = x;
  b.colour.set('#2f2d30'); b.box('metal', x0, x1, y0, y1, -.24, 0, 'bk');
  b.print = print; b.colour.set('#ffffff'); b.front('sign', x0 + .04, x1 - .04, y0 + .04, y1 - .04, -.25);
}
/** A sloping awning with its valance; both faces, so a low camera sees the underside. */
/**
 * A canvas shop awning (テント) mounted where the fascia would be: steep, as
 * 1980s shop awnings are (so the pixel-art ground stage never takes its slope
 * for wet road), striped in its colour over cream with the shop's trade
 * printed across it and a scalloped valance (awnings.ts), its underside in
 * shadow. Its outer edge stays above head height. `design` is an awning design.
 */
function awning(x: Context, x0: number, x1: number, y: number, depth: number, tint: THREE.Color, design = 0): void {
  const { b } = x, d = depth * .7, drop = Math.min(d * 1.3, y - 2.05), n = Math.hypot(d, drop), lip = .26;
  const print = awningPrint(design), plain = awningPrint(0);
  b.colour.copy(tint);
  // The slope: the print's top at the wall, read left to right from the street.
  b.print = printSlice(print, AWNING_VALANCE, 1);
  b.face('awning', [[x1, y - drop, -d], [x0, y - drop, -d], [x0, y, 0], [x1, y, 0]], [0, d / n, -drop / n]);
  b.print = printSlice(print, 0, AWNING_VALANCE);
  b.front('awning', x0, x1, y - drop - lip, y - drop, -d);
  // Side flaps in the plain stripes.
  b.print = printSlice(plain, AWNING_VALANCE, 1);
  b.face('awning', [[x0, y - drop - lip, -d], [x0, y - drop, -d], [x0, y, 0]], [-1, 0, 0]);
  b.face('awning', [[x1, y - drop - lip, -d], [x1, y - drop, -d], [x1, y, 0]], [1, 0, 0]);
  const pattern = b.pattern;
  b.pattern = WALL_PATTERN.plain;
  b.colour.copy(shade(tint, .4));
  b.face('wall', [[x0, y - .03, 0], [x1, y - .03, 0], [x1, y - drop - .03, -d], [x0, y - drop - .03, -d]], [0, -d / n, drop / n]);
  b.pattern = pattern;
}
/**
 * Red paper lanterns (赤提灯) either side of a door, printed with the shop's word (signs.ts lanterns) on the faces
 * toward the street and lit from within, steady (the neon material's lamp mode); `word` picks the print, by default
 * from the street-life stream.
 */
function lanterns(x: Context, cx: number, y: number, spacing: number, word?: string): void {
  const { b, extra } = x, sides = 8, radius = .22, height = .6, z = -.38;
  const design = word ? lanternIndex(word) : Math.floor(extra() * NEON_COUNTS.lantern), print = neonPrint('lantern', design);
  for (const s of [-1, 1]) {
    const px = cx + s * spacing, y0 = y - .1 - height;
    for (let i = 0; i < sides; i++) {
      // Faces round the lantern; the four toward the street (-Z) carry the print across them, the rest glow plain.
      const a0 = Math.PI + (i - 2) * Math.PI * 2 / sides, a1 = a0 + Math.PI * 2 / sides, m = (a0 + a1) / 2;
      const p0: Vec3 = [px + Math.sin(a0) * radius, 0, z + Math.cos(a0) * radius], p1: Vec3 = [px + Math.sin(a1) * radius, 0, z + Math.cos(a1) * radius];
      // Faces 0-3 run from +X to -X, the street viewer's left to right: the print's u runs the same way.
      const u0 = i < 4 ? i / 4 : .02, u1 = i < 4 ? (i + 1) / 4 : .08, v0 = i < 4 ? 0 : .4, v1 = i < 4 ? 1 : .5;
      b.print = [print[0] + (print[2] - print[0]) * u0, print[1] + (print[3] - print[1]) * v0, print[0] + (print[2] - print[0]) * u1, print[1] + (print[3] - print[1]) * v1];
      b.colour.setRGB(.5, 4, 0);
      b.face('neon', [[p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], y0 + height, p1[2]], [p0[0], y0 + height, p0[2]]], [Math.sin(m), 0, Math.cos(m)]);
    }
    b.colour.set('#1c1a1c'); b.cylinder('metal', px, y0 + height, z, .14, .05, 8); b.cylinder('metal', px, y0 - .05, z, .14, .05, 8);
    b.box('metal', px - .01, px + .01, y0 + height + .05, y + .1, z - .01, z + .01, 'b');
    b.beacon(px, y0 + height / 2, z, 2.6, .5, .2, .45);
  }
}

/**
 * A noren (暖簾) in the shop's doorway, hung from its rod just inside the facade, before the lit room (the
 * cutscene-style repaint of a race frame hangs one in its eatery's doorway): `design` from awnings.ts, centred at cx.
 */
function noren(x: Context, cx: number, top: number, design: number, tint: THREE.Color): void {
  const { b } = x, w = norenWidth(design), y1 = top - .03, y0 = y1 - NOREN_HEIGHT, z = .14;
  b.colour.set('#2a2622'); b.box('metal', cx - w / 2 - .06, cx + w / 2 + .06, y1, y1 + .04, z - .02, z + .02, 'b');
  b.print = norenPrint(design); b.colour.copy(tint);
  b.front('awning', cx - w / 2, cx + w / 2, y0, y1, z);
}

/**
 * An eatery hangs its noren in its doorway; on the shopping and nightlife streets other open shops often do too:
 * `shop` the fascia sign (its title picks the trade), across the shop front x0..x1 under its top. Only where no
 * awning hangs (it would hide the doorway). The street-life stream, so the building is unchanged.
 */
function shopNoren(x: Context, shop: number, x0: number, x1: number, top: number): void {
  const own = norenFor(fasciaTitle(shop)), street = SHOPPING.has(x.lot.district) || NIGHTLIFE.has(x.lot.district);
  const design = own >= 0 ? own : street && x.extra() < .4 ? norenIndex(['酒', 'めし', 'おでん', 'やきとり', 'そば'][Math.floor(x.extra() * 5)]!) : -1;
  const span = x1 - x0 - .2, cloth = design >= 0 ? norenWidth(design) : 0;
  if (design >= 0 && cloth <= span) noren(x, (x0 + x1) / 2 + (x.extra() - .5) * (span - cloth), top, design, colour(x.extra, NOREN));
}

/** A small lit box sign (行灯看板) on a bracket beside the shop, both faces toward the street's two directions. */
function boxSign(x: Context, px: number, y: number, word?: string): void {
  const { b, extra } = x, size = .62, z0 = -.32, z1 = z0 - size;
  const design = word ? boxIndex(word) : Math.floor(extra() * NEON_COUNTS.box);
  b.colour.set('#1c1a1c');
  b.box('metal', px - .1, px + .1, y - .04, y + size + .04, z1 - .04, z0, 'b');
  b.box('metal', px - .03, px + .03, y + size * .5 - .03, y + size * .5 + .03, z0, 0, 'b');
  b.print = neonPrint('box', design); b.colour.setRGB(extra(), 4, 0);
  b.side('neon', px - .11, z1, z0, y, y + size, -1);
  b.side('neon', px + .11, z1, z0, y, y + size, 1);
  b.beacon(px, y + size / 2, (z0 + z1) / 2, 1.9, 1.55, 1.05, size);
}
/** A glowing period vending machine against the facade. */
function vending(x: Context, px: number, facing = -1): void {
  const { b, random } = x;
  b.colour.copy(colour(random, BODY)); b.box('metal', px - .5, px + .5, 0, 1.83, -.75 * -facing - .02, -.02, 'b');
  b.colour.set('#e9f1ff'); b.front('lamp', px - .42, px + .42, .95, 1.7, -.78);
  b.colour.set('#ff9a6a'); b.front('lamp', px - .42, px + .42, .78, .88, -.78);
}
function acUnit(x: Context, px: number, y: number, z: number): void {
  const { b } = x;
  b.colour.set('#d9d4c6'); b.box('metal', px - .4, px + .4, y, y + .55, z - .28, z, 'bk');
  b.colour.set('#3a3a3e'); b.front('metal', px - .3, px + .1, y + .08, y + .47, z - .285);
  // Its covered refrigerant pipe up the wall into the building, and the drain hose down it (refine round 4: the
  // cutscenes' facades are laced with pipes).
  b.colour.set('#c9c3b2'); b.box('metal', px + .4, px + .48, y + .2, y + 1.15, z - .12, z - .02, 'b');
  b.colour.set('#5a5c60'); b.box('metal', px - .36, px - .33, Math.max(.05, y - 1.8), y, z - .1, z - .07, 'b');
}

/**
 * Shop-front clutter (refine round 4: the cutscenes' shop fronts are crowded): a mamachari parked against the
 * facade, stacked beer crates, a blue bin, an A-board with the shop's word. A few of these by the shop's corners,
 * clear of its doorway; from the street-life stream, so the building is unchanged.
 */
function shopClutter(x: Context, w: number): void {
  const { b, extra } = x;
  for (const s of [-1, 1] as const) {
    const roll = extra(), px = s * (w / 2 - .55 - extra() * .5);
    if (roll < .32) bicycle(b, px, -.42, colour(extra, ['#c8c8cc', '#a8323a', '#2f4f8a', '#2a2a2e', '#d8c070']));
    else if (roll < .52) {
      // Beer crates (P箱), stacked two to four high.
      const tint = colour(extra, ['#e8b830', '#c03028', '#d86828', '#3a6a3a']), stack = 2 + Math.floor(extra() * 3);
      for (let i = 0; i < stack; i++) {
        b.colour.copy(tint).multiplyScalar(1 - i * .04); b.box('metal', px - .23, px + .23, i * .29, i * .29 + .28, -.62, -.28, i ? 'b' : '');
        b.colour.copy(tint).multiplyScalar(.45); b.front('metal', px - .17, px + .17, i * .29 + .07, i * .29 + .2, -.625);
      }
    } else if (roll < .64) {
      b.colour.set('#2f6aa8'); b.cylinder('metal', px, 0, -.45, .22, .62, 8);
      b.colour.set('#244e80'); b.cylinder('metal', px, .62, -.45, .24, .05, 8);
    } else if (roll < .8) {
      // An A-board (立て看板) with a vertical print, leaning out from the shop front.
      const z = -.55;
      b.colour.set('#3a3632'); b.box('metal', px - .3, px + .3, 0, .08, z - .2, z + .2);
      b.print = printSlice(signPrint('vertical', pickSign(b.signs, 'vertical', extra)), .2, .8); b.colour.set('#f0ece2');
      b.face('sign', [[px - .27, .08, z - .12], [px + .27, .08, z - .12], [px + .27, 1.05, z + .02], [px - .27, 1.05, z + .02]], [0, .14, -.99]);
    }
  }
}

/**
 * A mamachari (ママチャリ) parked along the facade at px, its wheels in the plane z facing the street: flat octagonal
 * wheels, a step-through frame, saddle, handlebar and front basket, drawn as thin quads (a pixel-art bicycle).
 */
function bicycle(b: CityMeshBuilder, px: number, z: number, tint: THREE.Color): void {
  const r = .32, rim = .05, back = px - .52, front = px + .52, hub = .34;
  const strut = (ax: number, ay: number, bx: number, by: number, t: number) => {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l * t / 2, ny = dx / l * t / 2;
    b.face('metal', [[ax - nx, ay - ny, z], [bx - nx, by - ny, z], [bx + nx, by + ny, z], [ax + nx, ay + ny, z]], [0, 0, -1]);
  };
  b.colour.set('#1a1a1e');
  for (const cx of [back, front]) for (let i = 0; i < 8; i++) {
    const a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2;
    b.face('metal', [[cx + Math.cos(a0) * r, hub + Math.sin(a0) * r, z], [cx + Math.cos(a1) * r, hub + Math.sin(a1) * r, z],
      [cx + Math.cos(a1) * (r - rim), hub + Math.sin(a1) * (r - rim), z], [cx + Math.cos(a0) * (r - rim), hub + Math.sin(a0) * (r - rim), z]], [0, 0, -1]);
  }
  b.colour.copy(tint);
  strut(back, hub, px - .05, hub + .05, .05); strut(px - .05, hub + .05, front - .12, hub + .58, .05);
  strut(back, hub, px - .18, hub + .5, .045); strut(px - .05, hub + .05, px - .2, hub + .52, .05);
  strut(front, hub, front - .12, hub + .58, .04);
  b.colour.set('#2a2a2e'); strut(px - .3, hub + .56, px - .08, hub + .56, .07);
  strut(front - .22, hub + .66, front - .02, hub + .66, .035);
  b.colour.set('#7a7c80'); b.box('metal', front - .12, front + .2, hub + .36, hub + .6, z - .14, z + .14, 'b');
}

/** The street-level shop: lit interior with shelf silhouettes, or a closed shutter. */
function shopfront(x: Context, x0: number, x1: number, top: number, open: boolean): void {
  const { b, random, lot, fixtures } = x;
  const recess = .5, frame = new THREE.Color(colour(random, ['#b9bcbc', '#4b3f36', '#2a2a2e']));
  b.colour.set('#3a3632');
  b.side('wall', x0, 0, recess, 0, top, 1); b.side('wall', x1, 0, recess, 0, top, -1); b.flat('wall', x0, x1, 0, recess, top, -1);
  if (open) {
    // Shops stay lit (a low seed); the seed also picks the room seen inside (materials.ts), per lot without using the lot's streams.
    b.window = [(lot.seed % 997) / 997 * .2, WINDOW_KIND.shop]; b.colour.set('#6a5a48');
    b.front('glass', x0, x1, .12, top, recess);
    // The room itself is the glass's: an eatery or a shop from the interiors atlas (materials.ts), lit from within;
    // the earlier tubes and shelves of glowing boxes before it read as one cream band (refine round 4).
    b.colour.copy(frame);
    for (let i = 0, n = Math.max(2, Math.round((x1 - x0) / 1.1)); i <= n; i++) {
      const m = x0 + (x1 - x0) * i / n;
      b.box('metal', m - .03, m + .03, 0, top, recess - .06, recess - .01, 'bkt');
    }
    b.box('metal', x0, x1, top - .08, top, recess - .06, recess - .01, 'bk');
    const centre = new THREE.Vector3((x0 + x1) / 2, top - .3, -.6), aim = new THREE.Vector3((x0 + x1) / 2, .2, -2.4);
    fixtures.push({ position: x.b.world(centre), target: x.b.world(aim) });
  } else {
    // Roll-down shutter: ribbed steel in its box.
    // Darker steel than before: under a street lamp a pale shutter blazed as a blank board (refine round 4).
    b.colour.copy(colour(random, ['#6a6e70', '#5e6264', '#4f5a55', '#6e6a62']));
    b.front('metal', x0, x1, 0, top, .06);
    b.colour.multiplyScalar(.7);
    for (let y = .3; y < top - .1; y += .32) b.box('metal', x0, x1, y, y + .05, .02, .06, 'bkt');
  }
}


/**
 * Pavement life before a street-front shop: a lit phone booth, a red post
 * box, a lit standing sign (電飾看板), potted plants, or, in Kanda, a
 * bookseller's cart of spines as along Jimbocho's Yasukuni-dori.
 */
function streetFurniture(x: Context, w: number, books: boolean): void {
  const { b, lot, random } = x;
  if (lot.row !== 1 || x.detail !== 2 || lot.clearance < 2.6) return;
  const apron = -(lot.clearance - 2.15), px = (random() - .5) * Math.max(0, w - 2.4), roll = random();
  if (books) {
    const z = Math.max(apron + .2, -1.4);
    b.colour.set('#6a4a30'); b.box('wall', px - .85, px + .85, 0, .75, z, z + .6);
    for (let i = 0; i < 14; i++) {
      const bx = px - .8 + i * .115;
      b.colour.copy(colour(random, ['#7a2a2a', '#2e4f7a', '#c8b07a', '#3e6a4a', '#e8e0d0', '#5a3a6a']));
      b.box('wall', bx, bx + .1, .75, .97 + random() * .08, z + .05, z + .55, 'b');
    }
    b.print = printSlice(signPrint('vertical', signIndex('vertical', '古書')), .3, .7); b.colour.set('#ffffff');
    b.front('sign', px + .9, px + 1.3, .2, .9, z - .02);
    return;
  }
  if (roll < .12) {
    // A lit public phone booth under its green roof.
    const z = apron + .1;
    b.colour.set('#8a8e8a'); b.box('metal', px - .45, px + .45, 0, .12, z, z + .9);
    b.colour.set('#cfe6da');
    b.front('lamp', px - .42, px + .42, .15, 2.1, z, -1);
    b.side('lamp', px - .45, z + .03, z + .87, .15, 2.1, -1); b.side('lamp', px + .45, z + .03, z + .87, .15, 2.1, 1);
    b.colour.set('#3e7a5a'); b.box('metal', px - .48, px + .48, 2.1, 2.35, z - .03, z + .93);
  } else if (roll < .22) {
    b.colour.set('#c42a24'); b.cylinder('metal', px, 0, apron + .35, .24, 1.15, 10);
    b.colour.set('#2a2224'); b.cylinder('metal', px, 1.15, apron + .35, .28, .1, 10);
  } else if (roll < .55) {
    const z = apron + .2;
    b.colour.set('#3a3a3c'); b.box('metal', px - .3, px + .3, 0, .95, z, z + .06, 'b');
    b.print = printSlice(signPrint('vertical', pickSign(x.b.signs, 'vertical', random)), .25, .75); b.colour.set('#ffffff');
    b.front('sign', px - .26, px + .26, .1, .9, z - .01);
  } else if (roll < .75) {
    for (const dx of [-.4, .4]) {
      b.colour.set('#8a4a32'); b.box('stone', px + dx - .22, px + dx + .22, 0, .42, apron + .2, apron + .6);
      b.colour.set('#3e5a32'); b.box('ground', px + dx - .3, px + dx + .3, .42, .95 + random() * .3, apron + .14, apron + .66);
    }
  }
}

/** Where the bars are: neon is thickest in Kanda, the onsen town, the harbour and the backstreets. */
const NIGHTLIFE: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'onsen', 'harbour', 'residential']);
const SHOPPING: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'onsen', 'nikko']);
/** Nobori before a street-front shop and, in some lit windows, a neon sign. */
function shopLife(x: Context, w: number, shopTop: number | null): void {
  const { b, lot, extra, toward } = x;
  if (lot.row !== 1 || x.detail !== 2) return;
  // A small lit box sign at the shop's outer edge, clear of its awning (the concept's 酒 box).
  if ((SHOPPING.has(lot.district) || NIGHTLIFE.has(lot.district)) && extra() < .5) boxSign(x, -toward * (w / 2 - .12), 1.7);
  if (w > 3.2) shopClutter(x, w);
  if (shopTop !== null && shopTop > 2.2 && extra() < .3) windowNeon(b, (extra() - .5) * Math.max(0, w - 2), shopTop - .95, neonFor(lot.district, extra, .1), extra, .35);
  if (lot.clearance >= 2.6 && extra() < (SHOPPING.has(lot.district) ? .65 : .3)) {
    const apron = -(lot.clearance - 2.15) + .15;
    for (let i = 0, n = 1 + Math.floor(extra() * 2); i < n; i++) nobori(b, w / 2 - .4 - i * .8, apron, noboriFor(lot.district, extra), extra, toward);
  }
}

function shophouse(x: Context): void {
  const { b, lot, random, detail, toward } = x, w = lot.width, d = lot.depth;
  const style = random(), ground = 3.1 + random() * .35, storey = 2.6 + random() * .3;
  const wall = drift(style < .4 ? colour(random, MORTAR) : style < .6 ? colour(random, COPPER) : style < .82 ? colour(random, TILE_WARM) : colour(random, SHEET), random);
  b.pattern = style < .4 ? WALL_PATTERN.plain : style < .82 && style >= .6 ? WALL_PATTERN.tile : WALL_PATTERN.seams;
  const f = facade(random, wall, WINDOW_KIND.home), h = ground + storey * (lot.storeys - 1), front = h + .5 + random() * .7;
  // Kanban-kenchiku: a flat false front over a pitched roof.
  shell(x, f, w, d, h, false, false);
  b.colour.copy(wall); b.box('wall', -w / 2, w / 2, h, front, 0, .15, 'b');
  b.colour.copy(f.trim); b.box('wall', -w / 2 - .05, w / 2 + .05, front - .18, front, -.12, 0, 'bk');
  if (style >= .4 && style < .6 && detail) for (let k = 1; k < 4; k++) b.box('wall', -w / 2, w / 2, h + k * (front - h) / 4, h + k * (front - h) / 4 + .05, -.05, 0, 'bk');
  b.colour.copy(colour(random, ['#4f5357', '#6a4038', '#3f4f5a', '#5a5850']));
  b.gableRoof('roof', -w / 2 + .05, w / 2 - .05, .3, d, h, 1.1 + random() * .6, .3);
  b.colour.copy(shade(wall, .9)); b.gableEnds('wall', -w / 2, w / 2, .3, d, h, 1.1);
  // Most shops on the shopping streets are still open after dark (the concept's street is one lit shop after another).
  const open = random() < (SHOPPING.has(lot.district) ? .9 : .72), fasciaTop = ground - .05, shopTop = ground - .75;
  b.colour.copy(wall); b.front('wall', -w / 2, w / 2, shopTop, ground, 0);
  b.front('wall', -w / 2, -w / 2 + .25, 0, shopTop, 0); b.front('wall', w / 2 - .25, w / 2, 0, shopTop, 0);
  shopfront(x, -w / 2 + .25, w / 2 - .25, shopTop, open);
  // The shop's name on its fascia, or printed across a canvas awning mounted there instead; the same draws in the
  // same order as before, and the shopping streets' other open shops take an awning from their own stream.
  const shop = pickSign(x.b.signs, 'fascia', random), own = random() < .55;
  // An eatery on the shopping street hangs its noren rather than taking the street's extra awning (a steep awning
  // hides the doorway, and the noren with it).
  const eatery = open && detail === 2 && norenFor(fasciaTitle(shop)) >= 0;
  const cloth = own ? { depth: .9 + random() * .5, tint: colour(random, AWNINGS) }
    : open && SHOPPING.has(lot.district) && !eatery && x.extra() < .5 ? { depth: .9 + x.extra() * .5, tint: colour(x.extra, AWNINGS) } : null;
  if (cloth) awning(x, -w / 2 + .3, w / 2 - .3, fasciaTop, cloth.depth, cloth.tint, awningFor(fasciaTitle(shop)));
  else fascia(x, -w / 2 + .2, w / 2 - .2, shopTop + .1, fasciaTop, signPrint('fascia', shop));
  if (open && detail === 2 && !cloth) shopNoren(x, shop, -w / 2 + .25, w / 2 - .25, shopTop);
  const windows = Math.max(1, Math.round(w / 2.6));
  windowRows(x, f, -w / 2, w / 2, levels(ground, storey, lot.storeys).slice(1).map(v => v), evenColumns(-w / 2, w / 2, windows, Math.min(1.7, w / windows - .6)), .8, 2.15);
  if (detail === 2 && random() < .5) {
    // Balcony rail and a laundry pole across the first floor.
    b.colour.set('#3a3a3c');
    b.box('metal', -w / 2 + .3, w / 2 - .3, ground + .95, ground + 1.0, -.6, -.55, 'bk');
    for (let px = -w / 2 + .3; px <= w / 2 - .3; px += .12) b.box('metal', px - .01, px + .01, ground + .1, ground + .95, -.6, -.58, 'bkt');
    b.box('metal', -w / 2 + .3, w / 2 - .3, ground + .05, ground + .12, -.62, 0, 'k');
    if (random() < .5) {
      // Washing hung over the rail: shirts and towels, now and then a futon, each its own colour (refine round 4: one
      // big sheet under the street lamp read as a blank board). Its own stream keeps the building as it was.
      const first = colour(random, LAUNDRY), { extra } = x, pattern = b.pattern;
      b.pattern = WALL_PATTERN.plain;
      for (let px = -w / 2 + .5, n = 0; n < 8; n++) {
        const futon = extra() < .12, width = futon ? 1.1 + extra() * .4 : .32 + extra() * .3, drop = futon ? .9 : .42 + extra() * .4;
        if (px + width > w / 2 - .4) break;
        b.colour.copy(n === 0 ? first : colour(extra, LAUNDRY));
        b.front('wall', px, px + width, ground + 1.55 - drop, ground + 1.55, -.66);
        px += width + .1 + extra() * .3;
      }
      b.pattern = pattern;
    }
  }
  if (random() < .5) verticalSign(x, toward * (w / 2 - .45), ground + .4, Math.min(front - .1, ground + .4 + 2 + random() * 2.5), .95, 1);
  if (detail === 2) {
    // The shopping and nightlife streets hang lanterns at more doors, rows of red lights down the street as in the
    // user's rain-night concept (their own stream, so the building is unchanged).
    if (random() < .3 || (SHOPPING.has(lot.district) || NIGHTLIFE.has(lot.district)) && x.extra() < .8) lanterns(x, 0, shopTop - .05, Math.min(1.2, w / 3));
    if (random() < .3) vending(x, toward * (w / 2 - .7));
    if (random() < .5) acUnit(x, -toward * (w / 2 - .7), ground + .3, 0);
  }
  if (random() < .6) rooftopAntenna(x, w, d, h + 1.2);
  streetFurniture(x, w, lot.district === 'kanda' && random() < .25);
  shopLife(x, w, open ? shopTop : null);
}
function rooftopAntenna(x: Context, w: number, d: number, h: number): void {
  const { b, random, detail } = x;
  if (!detail) return;
  const ax = (random() - .5) * w * .6, az = d * (.4 + random() * .3);
  b.colour.set('#2e2e32');
  b.box('metal', ax - .03, ax + .03, h - .8, h + 1.8, az - .03, az + .03, 'b');
  for (let k = 0; k < 3; k++) b.box('metal', ax - .55, ax + .55, h + 1.6 - k * .3, h + 1.64 - k * .3, az - .02, az + .02, 'b');
}

function machiya(x: Context): void {
  const { b, lot, random, detail } = x, w = lot.width, d = lot.depth, ground = 3, upper = 2.5, h = ground + upper;
  const wood = drift(new THREE.Color('#4a3a30'), random, .06), plaster = drift(colour(random, ['#d9cfbd', '#cfc5b1', '#3a3430']), random);
  const f = facade(random, plaster, WINDOW_KIND.home);
  shell(x, f, w, d, h, false, false);
  // Ground floor: a lit shoji door behind a timber lattice (格子), in a timber frame.
  b.colour.copy(wood);
  b.front('wall', -w / 2, -w / 2 + .5, 0, ground, 0); b.front('wall', w / 2 - .5, w / 2, 0, ground, 0);
  b.front('wall', -w / 2 + .5, w / 2 - .5, ground - .35, ground, 0); b.front('wall', -w / 2 + .5, w / 2 - .5, 0, .15, 0);
  b.window = [random() * .6, WINDOW_KIND.home]; b.colour.set('#8a7a5c');
  b.front('glass', -w / 2 + .5, w / 2 - .5, .15, ground - .35, .35);
  b.colour.copy(shade(wood, .8));
  b.side('wall', -w / 2 + .5, 0, .35, .15, ground - .35, 1); b.side('wall', w / 2 - .5, 0, .35, .15, ground - .35, -1);
  b.flat('wall', -w / 2 + .5, w / 2 - .5, 0, .35, ground - .35, -1); b.flat('wall', -w / 2 + .5, w / 2 - .5, 0, .35, .15, 1);
  if (detail) for (let px = -w / 2 + .55; px < w / 2 - .5; px += .11) b.box('metal', px, px + .045, .15, ground - .35, .02, .07, 'bkt');
  // Pent roof between storeys and the main tiled roof, eaves to the street.
  b.colour.set('#3c3f45');
  b.face('roof', [[-w / 2 - .1, ground + .25, 0], [w / 2 + .1, ground + .25, 0], [w / 2 + .1, ground - .15, -.9], [-w / 2 - .1, ground - .15, -.9]], [0, .91, -.41]);
  b.gableRoof('roof', -w / 2, w / 2, 0, d, h, 2.1, .75);
  b.colour.copy(plaster); b.gableEnds('wall', -w / 2, w / 2, 0, d, h, 2.1);
  // Upper floor: plaster pierced by two glazed windows.
  windowRows(x, f, -w / 2, w / 2, [ground, h], [[-w / 4, 1.4], [w / 4, 1.4]], .6, upper - .45, 2);
  if (random() < .45) { b.colour.set('#2e3d5c'); b.front('wall', -.7, .7, ground - 1.25, ground - .35, -.05); }
  if (detail === 2 && random() < .5) { b.colour.set('#ffcf7a'); b.cylinder('lamp', w / 2 - .6, ground - .9, -.3, .16, .4, 8); }
  streetFurniture(x, w, false);
  shopLife(x, w, null);
}

function zakkyo(x: Context): void {
  const { b, lot, random, detail, toward } = x, w = lot.width, d = lot.depth, storeys = Math.max(3, lot.storeys);
  const ground = 3.5 + random() * .5, storey = 3 + random() * .35, h = ground + storey * (storeys - 1);
  const pick = random(), wall = drift(pick < .45 ? colour(random, TILE_WARM) : pick < .8 ? colour(random, TILE_LIGHT) : colour(random, CONCRETE), random);
  b.pattern = pick < .45 ? WALL_PATTERN.tile : pick < .8 ? WALL_PATTERN.mosaic : WALL_PATTERN.panels;
  const f = facade(random, wall, random() < .5 ? WINDOW_KIND.office : WINDOW_KIND.home);
  f.weathered = true;
  shell(x, f, w, d, h);
  parapet(x, f.trim, w, d, h, .8 + random() * .4);
  const band = random() < .5, floors = levels(ground, storey, storeys).slice(1);
  const panes = band ? Math.max(2, Math.round((w - 1.2) / 1.6)) : Math.max(1, Math.round(w / 3.2));
  const columns = band
    ? Array.from({ length: panes }, (_, i) => [-w / 2 + .6 + (w - 1.2) * (i + .5) / panes, (w - 1.2) / panes - .08] as const)
    : evenColumns(-w / 2, w / 2, panes, Math.min(1.9, w / panes - .9));
  windowRows(x, f, -w / 2, w / 2, floors, columns, band ? .85 : .9, band ? 2.4 : 2.3, band ? 0 : 1);
  // Ground: a lit shop beside a narrow lit lobby with its mailboxes.
  const split = w > 7.5 ? -w / 2 + 1.6 : null, shopTop = ground - .7;
  b.colour.copy(wall); b.front('wall', -w / 2, w / 2, shopTop, ground, 0);
  b.front('wall', w / 2 - .25, w / 2, 0, shopTop, 0); b.front('wall', -w / 2, -w / 2 + .25, 0, shopTop, 0);
  // The shop's open draw is the one shopfront took before, in the same order.
  let open: boolean;
  if (split !== null) {
    open = random() < .8;
    shopfront(x, split + .15, w / 2 - .25, shopTop, open);
    b.colour.copy(wall); b.front('wall', split - .05, split + .15, 0, shopTop, 0);
    b.window = [random() * .5, WINDOW_KIND.lobby]; b.colour.set('#5a5048'); b.front('glass', -w / 2 + .25, split - .05, 0, shopTop - .3, .8);
    b.colour.set('#3a3632'); b.side('wall', -w / 2 + .25, 0, .8, 0, shopTop, 1); b.side('wall', split - .05, 0, .8, 0, shopTop, -1);
    b.flat('wall', -w / 2 + .25, split - .05, 0, .8, shopTop, -1); b.front('wall', -w / 2 + .25, split - .05, shopTop - .3, shopTop, .8);
  } else { open = random() < .8; shopfront(x, -w / 2 + .25, w / 2 - .25, shopTop, open); }
  const shop = pickSign(x.b.signs, 'fascia', random), own = random() < .35;
  const eatery = open && detail === 2 && norenFor(fasciaTitle(shop)) >= 0;
  const cloth = own ? { depth: 1 + random() * .4, tint: colour(random, AWNINGS) }
    : SHOPPING.has(lot.district) && !eatery && x.extra() < .4 ? { depth: 1 + x.extra() * .4, tint: colour(x.extra, AWNINGS) } : null;
  if (cloth) awning(x, (split ?? -w / 2) + .3, w / 2 - .3, ground - .06, cloth.depth, cloth.tint, awningFor(fasciaTitle(shop)));
  else fascia(x, (split ?? -w / 2) + .2, w / 2 - .2, shopTop + .08, ground - .06, signPrint('fascia', shop));
  if (open && detail === 2 && !cloth) shopNoren(x, shop, (split ?? -w / 2) + .25, w / 2 - .25, shopTop);
  // The tenant tower: one lit panel per upper floor.
  if (random() < .78) verticalSign(x, toward * (w / 2 - .5), ground + .3, h - .3, 1.05 + random() * .3, Math.max(1, storeys - 1));
  // Tenant names on some upper windows.
  if (detail) for (let floor = 0; floor < storeys - 1; floor++) if (random() < .3) {
    const y = ground + floor * storey + 1.35;
    b.print = printSlice(signPrint('fascia', pickSign(x.b.signs, 'fascia', random)), .45, 1); b.colour.set('#d8d8d8');
    b.front('sign', -w / 2 + .9, Math.min(w / 2 - .9, -w / 2 + 4.4), y, y + .5, -.02);
  }
  if (detail && random() < .4) for (let floor = 1; floor < storeys - 1; floor++) if (random() < .45) acUnit(x, -toward * (w / 2 - .7), ground + floor * storey - .1, 0);
  if (detail === 2 && random() < .25) vending(x, -toward * (w / 2 - .7));
  if (detail === 2 && (random() < .2 || (NIGHTLIFE.has(lot.district) || SHOPPING.has(lot.district)) && x.extra() < .8)) lanterns(x, (split ?? -w / 2) / 2 + w / 4, shopTop - .05, 1);
  const board = random() < .5 ? (random() < .4 ? SORA_BOARDS[Math.floor(random() * SORA_BOARDS.length)]! : pickSign(x.b.signs, 'board', random)) : undefined;
  rooftop(x, w, d, h, { billboard: board });
  streetFurniture(x, w, false);
  // Bars and clubs hang neon at the corner: a tall vertical sign, or blades floor above floor; a rooftop neon where no billboard stands.
  const { extra } = x, night = NIGHTLIFE.has(lot.district) ? .5 : .16;
  if (detail && storeys >= 3 && extra() < night * .7)
    verticalNeon(b, -toward * (w / 2 - .25), ground + .5, Math.min(h - ground - .8, 4.4), vneonFor(lot.district, extra), extra);
  else if (detail) for (let floor = 0; floor < storeys - 1; floor++) if (extra() < night)
    neonBlade(b, -toward * (w / 2 - .2), floors[floor]! + (band ? 2.5 : 2.4), 1.7, neonFor(lot.district, extra), extra);
  if (board === undefined && extra() < night + .15) rooftopNeon(b, w, d, h, neonFor(lot.district, extra, .3), extra, toward);
  shopLife(x, w, null);
  if (detail === 2 && random() < .25) {
    // An exposed escape stair down the flank.
    const sx = -toward * (w / 2 + .6);
    b.colour.set('#4a4a4e');
    for (let floor = 1; floor < storeys; floor++) {
      const y = ground + (floor - 1) * storey;
      b.box('metal', sx - .55, sx + .55, y - .08, y, d * .45, d * .45 + 1.4, 'b');
      b.box('metal', sx - .55, sx + .55, y + .9, y + .95, d * .45, d * .45 + 1.4, 'b');
    }
    b.box('metal', sx - .05, sx + .05, 0, h, d * .45 - .05, d * .45 + .05, 'b');
  }
}

function office(x: Context): void {
  const { b, lot, random, detail } = x, w = lot.width, d = lot.depth, storeys = lot.storeys;
  const ground = 4.6 + random() * .8, storey = 3.5 + random() * .3, h = ground + storey * (storeys - 1);
  const style = random(), floors = levels(ground, storey, storeys).slice(1);
  const wall = drift(style < .3 ? colour(random, TILE_WARM) : style < .6 ? colour(random, STATELY) : style < .85 ? colour(random, TILE_LIGHT) : new THREE.Color('#5a5650'), random);
  b.pattern = style < .3 ? WALL_PATTERN.tile : style >= .6 && style < .85 ? WALL_PATTERN.mosaic : WALL_PATTERN.panels;
  const f = facade(random, wall, WINDOW_KIND.office);
  f.weathered = style < .85;
  shell(x, f, w, d, h);
  parapet(x, f.trim, w, d, h, .9 + random() * .5, .3);
  if (style < .55) {
    // Ribbon windows: horizontal bands between spandrels.
    const module = 1.6 + random() * .4, n = Math.max(3, Math.round((w - 1) / module));
    windowRows(x, f, -w / 2, w / 2, floors, Array.from({ length: n }, (_, i) => [-w / 2 + .5 + (w - 1) * (i + .5) / n, (w - 1) / n - .1] as const), 1, 2.65, 1);
  } else if (style < .85) {
    // Punched windows in stone or tile, a cornice above.
    const n = Math.max(3, Math.round(w / 2.6));
    windowRows(x, f, -w / 2, w / 2, floors, evenColumns(-w / 2, w / 2, n, Math.min(1.7, w / n - .8)), .95, 2.55, 1);
    b.colour.copy(f.trim); b.box('wall', -w / 2 - .2, w / 2 + .2, h - .2, h + .25, -.35, 0, 'bk');
  } else {
    // Dark curtain wall on a thin aluminium grid.
    const n = Math.max(4, Math.round(w / 1.8));
    f.glass.set('#2a3240'); f.frame.set('#9aa0a4');
    windowRows(x, f, -w / 2, w / 2, floors, Array.from({ length: n }, (_, i) => [-w / 2 + w * (i + .5) / n, w / n - .07] as const), .1, storey - .15, 0);
  }
  if (detail && style >= .55 && style < .85 && random() < .5) {
    // Vertical fins of the 1960s.
    b.colour.copy(f.trim);
    for (let i = 0, n = Math.round(w / 3.2); i <= n; i++) { const px = -w / 2 + w * i / n; b.box('wall', px - .12, px + .12, ground, h, -.55, 0, 'bk'); }
  }
  // Lobby: granite piers, a tall lit glass hall and an entrance canopy.
  b.colour.set(random() < .5 ? '#5a4e4a' : '#7a7470');
  b.front('stone', -w / 2, w / 2, ground - .9, ground, -.02);
  const piers = Math.max(3, Math.round(w / 6));
  for (let i = 0; i <= piers; i++) { const px = -w / 2 + w * i / piers; b.box('stone', px - .35, px + .35, 0, ground - .9, -.1, .3, 'bk'); }
  b.colour.set('#4a4a50');
  for (let i = 0; i < piers; i++) {
    b.window = [random(), WINDOW_KIND.lobby];
    b.front('glass', -w / 2 + w * i / piers + .35, -w / 2 + w * (i + 1) / piers - .35, 0, ground - .9, .6);
  }
  b.colour.set('#3a3632'); b.flat('wall', -w / 2, w / 2, 0, .6, ground - .9, -1);
  b.colour.set('#3a3a3c'); b.box('metal', -2.6, 2.6, ground - 1.4, ground - 1.15, -2.4, 0, 'k');
  b.colour.set('#ffe6b8'); b.flat('lamp', -2.4, 2.4, -2.2, -.2, ground - 1.41, -1);
  x.fixtures.push({ position: b.world(new THREE.Vector3(0, ground - 1.5, -1.2)), target: b.world(new THREE.Vector3(0, 0, -3)) });
  // The company name across the top.
  if (random() < .7) {
    const nw = Math.min(w * .6, 12);
    b.print = printSlice(signPrint('board', pickSign(x.b.signs, 'board', random)), .45, 1); b.colour.set('#ffffff');
    b.front('sign', -nw / 2, nw / 2, h - 1.3, h - .3, -.38);
  }
  const tower = random() < .6, tank = random() < .5, board = random() < .3 ? pickSign(x.b.signs, 'board', random) : undefined, { extra, toward } = x;
  rooftop(x, w, d, h, { tower, tank, billboard: board !== undefined && extra() < .35 ? SORA_BOARDS[Math.floor(extra() * SORA_BOARDS.length)]! : board });
  // A SORA banner hung down the front; red lights blinking on the tall roofs.
  if (detail && h > 15 && extra() < .2) hangingBanner(b, -toward * (w / 2 - 1.4), h - .5, 1.5, SORA_NOBORI[Math.floor(extra() * SORA_NOBORI.length)]!, extra);
  if (h > 28) for (const s of [-1, 1]) aviationLight(b, s * (w / 2 - .4), h + 1.5, .4, extra());
}

function mansion(x: Context): number {
  const { b, lot, random, detail } = x, w = lot.width, d = lot.depth, storeys = lot.storeys;
  const ground = 3.3 + random() * .3, storey = 2.85 + random() * .15, h = ground + storey * (storeys - 1);
  const pastel = random() < .65, wall = drift(pastel ? colour(random, PASTEL) : colour(random, TILE_LIGHT), random);
  b.pattern = !pastel || lot.seed % 2 ? WALL_PATTERN.mosaic : WALL_PATTERN.plain;
  const f = facade(random, wall, WINDOW_KIND.home);
  f.weathered = true;
  shell(x, f, w, d, h);
  parapet(x, f.trim, w, d, h, 1, .25);
  const units = Math.max(2, Math.round(w / 6.2)), unit = w / units, solid = random() < .55, depth = 1.15;
  const rail = new THREE.Color(colour(random, ['#3a3a3c', '#e2e0da', '#6a5a4a']));
  // Upper floors: sliding doors behind balconies, a partition between units.
  for (let floor = 1; floor < storeys; floor++) {
    const y0 = ground + (floor - 1) * storey, y1 = y0 + storey;
    b.colour.copy(f.wall); b.front('wall', -w / 2, w / 2, y1 - .45, y1, 0);
    for (let u = 0; u < units; u++) {
      const ux0 = -w / 2 + u * unit, ux1 = ux0 + unit, door = Math.min(3.2, unit - 1.4), dx = ux0 + .5;
      b.colour.copy(f.wall);
      b.front('wall', ux0, dx, y0, y1 - .45, 0);
      opening(x, f, dx, dx + door, y0 + .05, y1 - .45, 1);
      b.colour.copy(f.wall); b.front('wall', dx, dx + door, y0, y0 + .05, 0);
      if (unit - door > 2.4) {
        // A second, smaller window: the wall closes around it.
        const wx0 = dx + door + .6, wx1 = ux1 - .4;
        b.front('wall', dx + door, wx0, y0, y1 - .45, 0); b.front('wall', wx1, ux1, y0, y1 - .45, 0);
        b.front('wall', wx0, wx1, y0, y0 + 1, 0); b.front('wall', wx0, wx1, y1 - .7, y1 - .45, 0);
        opening(x, f, wx0, wx1, y0 + 1, y1 - .7, 1);
      } else b.front('wall', dx + door, ux1, y0, y1 - .45, 0);
      if (detail && random() < .55) acUnit(x, ux1 - .7, y0 + .12, -.1);
      if (detail === 2 && random() < .18) { b.colour.copy(colour(random, ['#f4f0e8', '#f0c8d8', '#c8dcf4', '#f4e4b0'])); b.front('wall', dx + .3, dx + 1.6, y0 + .55, y0 + 1.15, -depth - .08); }
    }
    // The slab and its front: solid parapet or railing.
    b.colour.copy(f.trim); b.box('wall', -w / 2, w / 2, y0 - .18, y0, -depth, 0, 'k');
    if (solid) { b.colour.copy(f.wall); b.box('wall', -w / 2, w / 2, y0, y0 + 1.05, -depth, -depth + .12, 'k'); }
    else {
      b.colour.copy(rail); b.box('metal', -w / 2, w / 2, y0 + 1, y0 + 1.06, -depth, -depth + .05, 'k');
      if (detail) for (let px = -w / 2 + .1; px < w / 2; px += detail === 2 ? .14 : .3) b.box('metal', px, px + .025, y0, y0 + 1, -depth + .01, -depth + .035, 'bkt');
      else { b.colour.copy(shade(rail, .8)); b.front('metal', -w / 2, w / 2, y0, y0 + 1, -depth); }
    }
    b.colour.copy(f.wall);
    for (let u = 0; u <= units; u++) { const px = -w / 2 + u * unit; b.box('wall', px - .09, px + .09, y0, y1 - .45, -depth, 0, 'bk'); }
  }
  // Ground: a lit entrance hall, shops or open parking under the slab.
  b.colour.copy(f.wall); b.front('wall', -w / 2, w / 2, ground - .5, ground, 0);
  const hall = (random() - .5) * (w - 4);
  b.window = [random() * .4, WINDOW_KIND.lobby]; b.colour.set('#5a5048'); b.front('glass', hall - 1.3, hall + 1.3, 0, ground - .5, .6);
  b.colour.set('#3a3632'); b.side('wall', hall - 1.3, 0, .6, 0, ground - .5, 1); b.side('wall', hall + 1.3, 0, .6, 0, ground - .5, -1); b.flat('wall', hall - 1.3, hall + 1.3, 0, .6, ground - .5, -1);
  b.colour.copy(f.wall); b.front('wall', -w / 2, hall - 1.3, 0, ground - .5, 0); b.front('wall', hall + 1.3, w / 2, 0, ground - .5, 0);
  for (const s of [-1, 1]) if (random() < .5) {
    const sx = s < 0 ? (-w / 2 + hall - 1.3) / 2 : (w / 2 + hall + 1.3) / 2;
    b.window = [random(), WINDOW_KIND.home]; b.colour.copy(f.glass); b.front('glass', sx - 1, sx + 1, .9, ground - 1, -.02);
  }
  b.print = printSlice(signPrint('fascia', pickSign(x.b.signs, 'fascia', random)), .4, 1); b.colour.set('#ffffff');
  b.front('sign', hall - 1.1, hall + 1.1, ground - .48, ground - .1, -.03);
  x.fixtures.push({ position: b.world(new THREE.Vector3(hall, ground - .7, -.8)), target: b.world(new THREE.Vector3(hall, 0, -2.5)) });
  rooftop(x, w, d, h, { tank: random() < .75 });
  return h;
}

function ministry(x: Context): void {
  const { b, lot, random, detail } = x, w = lot.width, d = lot.depth, storeys = lot.storeys;
  const brick = random() < .14, ground = 4.4, storey = 3.7, h = ground + storey * (storeys - 1);
  const wall = drift(brick ? new THREE.Color('#9a4a38') : colour(random, STATELY), random, .03);
  b.pattern = brick ? WALL_PATTERN.brick : WALL_PATTERN.panels;
  const f = facade(random, wall, WINDOW_KIND.office);
  shell(x, f, w, d, h);
  if (brick) {
    // Meiji red brick: a steep slate roof with a stone string course.
    b.colour.set('#3e4448'); b.gableRoof('roof', -w / 2, w / 2, 0, d, h, 4.5, .5);
    b.colour.copy(wall); b.gableEnds('wall', -w / 2, w / 2, 0, d, h, 4.5);
  } else parapet(x, f.trim, w, d, h, 1.1, .35);
  const n = Math.max(6, Math.round(w / 2.9)), floors = levels(ground, storey, storeys).slice(1);
  windowRows(x, f, -w / 2, w / 2, floors, evenColumns(-w / 2, w / 2, n, 1.45), .95, 2.6, 1);
  b.colour.copy(brick ? new THREE.Color('#d8cdb5') : shade(wall, .78));
  b.front('stone', -w / 2, w / 2, 0, ground, -.05);
  for (const y of [ground, h - storey + .4]) b.box('stone', -w / 2 - .15, w / 2 + .15, y - .25, y, -.35, 0, 'bk');
  for (let i = 0; i < n; i++) {
    const px = -w / 2 + w * (i + .5) / n;
    if (Math.abs(px) < 4) continue;
    b.window = [random(), WINDOW_KIND.office]; b.colour.copy(f.glass); b.front('glass', px - .6, px + .6, .9, ground - .8, -.07);
  }
  // A portico of square columns at the centre entrance.
  b.window = [random(), WINDOW_KIND.lobby]; b.colour.set('#4a4a50'); b.front('glass', -3.5, 3.5, 0, ground - .5, -.08);
  b.colour.copy(shade(wall, .9));
  for (let i = 0; i < 5; i++) b.box('stone', -3.8 + i * 1.9 - .3, -3.8 + i * 1.9 + .3, 0, ground + storey, -2.4, -1.8, 'b');
  b.box('stone', -4.4, 4.4, ground + storey, ground + storey + .6, -2.6, 0, 'b');
  x.fixtures.push({ position: b.world(new THREE.Vector3(0, ground - .3, -1)), target: b.world(new THREE.Vector3(0, 0, -4)) });
  if (detail && lot.clearance > 4) {
    // The forecourt: a low stone wall with gate posts behind the sidewalk.
    const front = -(lot.clearance - 2);
    b.colour.set('#8e8a80');
    b.box('stone', -w / 2, -3, -.3, .9, front - .3, front, 'bk'); b.box('stone', 3, w / 2, -.3, .9, front - .3, front, 'bk');
    for (const s of [-1, 1]) b.box('stone', s * 3 - .35, s * 3 + .35, -.3, 1.9, front - .4, front + .1, 'b');
  }
  rooftop(x, w, d, h, { tank: false, tower: !brick && random() < .5 });
}

function pachinko(x: Context): void {
  const { b, lot, random, detail, toward } = x, w = lot.width, d = lot.depth, storeys = lot.storeys;
  const ground = 4.2, storey = 3.4, h = ground + storey * (storeys - 1);
  const wall = drift(colour(random, ['#e9e4da', '#d8d0c0', '#c9c2b2']), random);
  const f = facade(random, wall, WINDOW_KIND.dark);
  shell(x, f, w, d, h + 2.2);
  // A great sign face over the whole upper front, bulbs around it.
  b.colour.copy(wall); b.front('wall', -w / 2, w / 2, ground, h + 2.2, 0);
  b.print = signPrint('board', pickSign(x.b.signs, 'board', random)); b.colour.set('#ffffff');
  b.front('sign', -w / 2 + .6, w / 2 - .6, ground + .5, h + 1.9, -.2);
  const bulbs = new THREE.Color(colour(random, ['#ffd27a', '#ff6a5a', '#fff2d8']));
  b.colour.copy(bulbs);
  const step = detail === 2 ? .45 : .9;
  // The bulbs chase round the sign.
  let bulb = 0;
  for (let px = -w / 2 + .3; px < w / 2 - .2; px += step) for (const y of [ground + .25, h + 2.05]) {
    b.animation = [(bulb++ % 3) / 3, 1]; b.box('lamp', px - .07, px + .07, y - .07, y + .07, -.32, -.2, 'bk');
  }
  for (let y = ground + .25; y < h + 2; y += step) for (const s of [-1, 1]) {
    b.animation = [(bulb++ % 3) / 3, 1]; b.box('lamp', s * (w / 2 - .3) - .07, s * (w / 2 - .3) + .07, y - .07, y + .07, -.32, -.2, 'bk');
  }
  b.animation = [0, 0];
  // An open, blazing hall.
  b.colour.set('#3a3632'); b.front('wall', -w / 2, w / 2, ground - .6, ground, 0);
  b.front('wall', -w / 2, -w / 2 + .3, 0, ground - .6, 0); b.front('wall', w / 2 - .3, w / 2, 0, ground - .6, 0);
  b.side('wall', -w / 2 + .3, 0, .7, 0, ground - .6, 1); b.side('wall', w / 2 - .3, 0, .7, 0, ground - .6, -1);
  b.flat('wall', -w / 2 + .3, w / 2 - .3, 0, .7, ground - .6, -1);
  b.window = [0, WINDOW_KIND.hall]; b.colour.set('#7a6a5a'); b.front('glass', -w / 2 + .3, w / 2 - .3, 0, ground - .6, .7);
  b.colour.set('#fff0c8'); b.flat('lamp', -w / 2 + .3, w / 2 - .3, -.8, 0, ground - .61, -1);
  x.fixtures.push({ position: b.world(new THREE.Vector3(0, ground - .7, -.8)), target: b.world(new THREE.Vector3(0, 0, -2.6)) });
  verticalSign(x, toward * (w / 2 - .6), 1.2, h + 1.6, 1.3, 1);
  rooftop(x, w, d, h + 2.2, { tank: false });
  const { extra } = x;
  if (extra() < .6) rooftopNeon(b, w, d, h + 2.2, extra() < .3 ? neonFor(lot.district, extra, 1) : extra() < .7 ? neonIndex('パチンコ') : neonIndex('GAME'), extra, toward);
  // A tall パチンコ neon spelling itself down the far corner.
  if (detail && extra() < .7) verticalNeon(b, -toward * (w / 2 - .9), 1.4, Math.min(h + .6, 6), extra() < .25 ? SORA_VNEON : vneonIndex('パチンコ'), extra);
  if (detail === 2 && lot.clearance >= 2.6) {
    // A row of grand-reopening banners (新装開店) along the pavement.
    const apron = -(lot.clearance - 2.15) + .15, n = Math.max(3, Math.floor((w - 1) / 1.2));
    for (let i = 0; i < n; i++) nobori(b, w / 2 - .5 - i * (w - 1) / n, apron, noboriFor('pachinko', extra, .3), extra, toward);
  }
}

function station(x: Context): void {
  const { b, lot, random, detail, toward } = x, w = lot.width, d = lot.depth;
  const brand = new THREE.Color(colour(random, ['#c8312b', '#1e6a4c', '#2f5fa8', '#e7782c'])), canopyY = 5;
  // The canopy: columns, a lit soffit and a brand-coloured fascia.
  b.colour.set('#d8d6d0');
  for (const px of [-w * .25, w * .25]) for (const pz of [d * .25, d * .55]) b.box('metal', px - .25, px + .25, 0, canopyY, pz - .25, pz + .25, 'bt');
  b.colour.copy(brand); b.box('metal', -w * .42, w * .42, canopyY, canopyY + .8, d * .05, d * .75, 'b');
  b.colour.set('#fff6e0'); b.flat('lamp', -w * .4, w * .4, d * .07, d * .73, canopyY - .01, -1);
  for (const px of [-w * .25, w * .25]) for (const pz of [d * .25, d * .55]) {
    // Pump islands.
    b.colour.set('#bfbcb4'); b.box('stone', px - 1.4, px + 1.4, 0, .2, pz - .5, pz + .5);
    b.colour.copy(brand); b.box('metal', px + .55, px + 1.05, .2, 2.05, pz - .3, pz + .3);
    b.colour.set('#f2ead8'); b.side('lamp', px + .54, pz - .25, pz + .25, 1.2, 1.8, -1);
  }
  x.fixtures.push({ position: b.world(new THREE.Vector3(0, canopyY - .2, d * .4)), target: b.world(new THREE.Vector3(0, 0, d * .2)) });
  // The kiosk at the back.
  const f = facade(random, new THREE.Color('#e4e0d6'), WINDOW_KIND.shop);
  b.colour.copy(f.wall); b.box('wall', -w * .35, w * .1, 0, 3.4, d * .8, d, 'b');
  // The kiosk's glass front: mullions, ceiling tubes and shelves of oil cans and snacks.
  const kz = d * .8 - .02, k0 = -w * .33, k1 = w * .08;
  b.window = [0, WINDOW_KIND.hall]; b.colour.set('#5a5048'); b.front('glass', k0, k1, .2, 2.6, kz);
  b.colour.set('#fff4dc'); b.box('lamp', k0 + .3, k1 - .3, 2.4, 2.46, kz - .3, kz - .24);
  b.colour.set('#3a3c40');
  for (let mx = k0; mx <= k1 + .01; mx += (k1 - k0) / Math.max(2, Math.round((k1 - k0) / 1.3))) b.box('metal', mx - .03, mx + .03, .2, 2.6, kz - .06, kz - .01, 'bkt');
  for (const y of [.7, 1.4]) for (let gx = k0 + .3; gx < k1 - .4; gx += .3 + random() * .2) {
    b.colour.copy(colour(random, ['#c23a30', '#2f5fa8', '#e7b53a', '#2f7a52'])).multiplyScalar(.3);
    b.box('lamp', gx, gx + .18, y, y + .25, kz - .3, kz - .1, 'bk');
  }
  // The brand sign on its pole, facing approaching drivers.
  const px = toward * (w / 2 - 1);
  b.colour.set('#6a6a6e'); b.box('metal', px - .14, px + .14, 0, 6.2, -1, -.72, 'b');
  b.colour.copy(brand); b.box('metal', px - .3, px + .3, 6.2, 8.4, -2.1, .4, 'b');
  b.print = signPrint('board', 6); b.colour.set('#ffffff');
  b.side('sign', px - .31, -2.05, .35, 6.3, 8.3, -1); b.side('sign', px + .31, -2.05, .35, 6.3, 8.3, 1);
  if (detail === 2) for (let i = 0, extra = x.extra, n = 2 + Math.floor(extra() * 3); i < n; i++)
    nobori(b, -toward * (w / 2 - .6) + toward * i * 1.3, -.5, noboriFor('station', extra, .6), extra, toward);
}

function parking(x: Context): void {
  const { b, lot, random, detail, toward } = x, w = lot.width, d = lot.depth;
  // A monthly car park (月極駐車場): painted bays, a chain, the board, a few cars.
  const bays = Math.max(2, Math.floor(w / 2.5)), level = lot.rise < .25;
  b.colour.set('#d8d2c2');
  if (level) for (let i = 0; i <= bays; i++) { const px = -w / 2 + w * i / bays; b.flat('wall', px - .06, px + .06, 1.2, d - .5, lot.rise + .03); }
  b.colour.set('#4a4a4e');
  for (const px of [-w / 2 + .2, w / 2 - .2]) b.box('metal', px - .05, px + .05, -.1, .7, .1, .2);
  b.box('metal', -w / 2 + .2, w / 2 - .2, .55, .58, .14, .16, 'b');
  b.print = signPrint('fascia', pickSign(x.b.signs, 'fascia', random)); b.colour.set('#e8e8e8');
  b.box('metal', toward * (w / 2 - .4) - .04, toward * (w / 2 - .4) + .04, -.1, 2.2, .15, .25);
  b.front('sign', toward * (w / 2 - .4) - .8, toward * (w / 2 - .4) + .8, 1.5, 1.9, .1);
  if (!detail || !level) return;
  for (let i = 0; i < bays; i++) {
    if (random() < .45) continue;
    // A boxy period saloon.
    const cx = -w / 2 + w * (i + .5) / bays, z0 = d * .35, body = colour(random, ['#e8e4da', '#3a4a6a', '#7a2a2a', '#b8b4aa', '#2a2a2e', '#c8b07a']);
    b.colour.copy(body); b.box('metal', cx - .82, cx + .82, .25, .95, z0, z0 + 4.4);
    b.box('metal', cx - .72, cx + .72, .95, 1.38, z0 + 1.2, z0 + 3.4);
    b.colour.set('#202630'); b.front('metal', cx - .66, cx + .66, 1.0, 1.33, z0 + 1.19);
    b.colour.set('#141416'); for (const s of [-1, 1]) for (const zz of [z0 + .8, z0 + 3.6]) b.box('metal', cx + s * .84 - .1, cx + s * .84 + .1, 0, .55, zz - .3, zz + .3, 'b');
  }
}


const HOUSE_WALLS = ['#d8cfbd', '#e2dccd', '#c9c2b4', '#bfae94', '#e6e1d6', '#b8b2a6', '#d1c3a8'];
/** 1970s-80s glazed roof tiles: blue-black, cobalt, brown and plain grey kawara. */
const ROOF_TILES = ['#3e4552', '#2f4f7a', '#7a4a32', '#5a5d63', '#8a3a2a', '#465a4a'];
const SHEETS = ['#7c8a90', '#c9c2ae', '#5e7a6a', '#7a3a32', '#9aa4a8', '#4f6a86'];
const CONTAINERS = ['#7a2e2a', '#2e4f7a', '#3e6a4a', '#8a8a86', '#b8662e', '#5a3a6a', '#c8b07a', '#2e6a72', '#9a2a2a'];

/** An onsen ryokan: timber and plaster storeys behind verandas, lit shoji, deep tiled eaves. */
function ryokan(x: Context): void {
  const { b, lot, random, detail, toward } = x, w = lot.width, d = lot.depth, storeys = Math.max(2, Math.min(4, lot.storeys));
  const ground = 3.2, storey = 2.9, h = ground + storey * (storeys - 1);
  const timber = drift(new THREE.Color('#4a3a2e'), random, .05), plaster = drift(colour(random, ['#e6dfcf', '#ddd4c0', '#d8cbb2']), random);
  const f = facade(random, plaster, WINDOW_KIND.home);
  f.flank.copy(shade(plaster, .9)); f.glass.set('#8a7a5c'); f.frame.copy(timber);
  shell(x, f, w, d, h, false, false);
  const bays = Math.max(3, Math.round(w / 2.6)), columns = evenColumns(-w / 2, w / 2, bays, w / bays - .7);
  for (let floor = 1; floor < storeys; floor++) {
    const y0 = ground + (floor - 1) * storey, y1 = y0 + storey;
    windowRows(x, f, -w / 2, w / 2, [y0, y1], columns, .45, 2.35, 2);
    b.colour.copy(timber);
    for (let i = 0; i <= bays; i++) { const px = -w / 2 + w * i / bays; b.box('wall', px - .1, px + .1, y0, y1, -.08, 0, 'bk'); }
    if (detail) {
      // The veranda (縁側) rail and its little tiled pent roof.
      b.box('wall', -w / 2, w / 2, y0 - .12, y0, -.9, 0, 'k');
      b.box('wall', -w / 2, w / 2, y0 + .82, y0 + .9, -.9, -.82, 'k');
      for (let px = -w / 2; px <= w / 2; px += detail === 2 ? .45 : .9) b.box('wall', px - .03, px + .03, y0, y0 + .82, -.88, -.84, 'bkt');
      b.colour.set('#3e4248');
      b.face('roof', [[-w / 2 - .1, y1 - .05, 0], [w / 2 + .1, y1 - .05, 0], [w / 2 + .1, y1 - .45, -1.1], [-w / 2 - .1, y1 - .45, -1.1]], [0, .94, -.34]);
    }
  }
  // Street floor: a lattice front, the entrance with its noren and lanterns.
  const door = (random() - .5) * (w - 5);
  b.colour.copy(timber);
  b.front('wall', -w / 2, w / 2, ground - .5, ground, 0);
  // Either side of the entrance, lit shoji behind the timber lattice (refine round 4: the cutscene-style repaint of a
  // Hakone race frame lights every inn's street floor; a timber wall here read as a long dark front).
  for (const [x0, x1] of [[-w / 2, door - 1.4], [door + 1.4, w / 2]] as const) {
    if (x1 - x0 < .4) continue;
    b.colour.copy(timber);
    b.front('wall', x0, x1, 0, .3, 0); b.front('wall', x0, x1, ground - .7, ground - .5, 0);
    // The shoji glow itself, warm paper lit from within (a lamp face, so it burns with the street's lights).
    b.colour.setRGB(1.05, .72, .36); b.front('lamp', x0, x1, .3, ground - .7, .22);
    // Bars 24 cm apart, with a rail across: finer, they fell about a cell apart at the street's distances and beat.
    if (detail) {
      b.colour.copy(shade(timber, .7));
      for (let px = x0 + .1; px < x1 - .06; px += .24) b.box('metal', px, px + .07, .3, ground - .7, -.06, -.01, 'bkt');
      b.box('metal', x0, x1, 1.45, 1.52, -.06, -.01, 'bk');
    }
  }
  b.window = [random() * .3, WINDOW_KIND.shop]; b.colour.set('#8a6a48');
  b.front('glass', door - 1.4, door + 1.4, 0, ground - .5, .5);
  b.colour.copy(shade(timber, .8));
  b.side('wall', door - 1.4, 0, .5, 0, ground - .5, 1); b.side('wall', door + 1.4, 0, .5, 0, ground - .5, -1); b.flat('wall', door - 1.4, door + 1.4, 0, .5, ground - .5, -1);
  b.colour.set('#2e3d5c'); b.front('wall', door - 1.3, door + 1.3, ground - 1.3, ground - .55, -.04);
  lanterns(x, door, ground - .55, 1.75);
  b.colour.set('#3e4248'); b.gableRoof('roof', -w / 2, w / 2, 0, d, h, 2.4 + random() * .6, 1.1);
  b.colour.copy(plaster); b.gableEnds('wall', -w / 2, w / 2, 0, d, h, 2.4);
  verticalSign(x, toward * (w / 2 - .5), 1.2, Math.min(h - .3, 1.2 + 3.6), .9, 1, random() < .7 ? '旅館' : random() < .5 ? '民宿' : '♨');
  x.fixtures.push({ position: b.world(new THREE.Vector3(door, ground - .6, -.9)), target: b.world(new THREE.Vector3(door, 0, -3)) });
  if (detail === 2) {
    // Stone lanterns either side of the gate.
    b.colour.set('#9b968a');
    for (const s of [-1, 1]) { const lx = door + s * 2.4; b.box('stone', lx - .3, lx + .3, 0, 1.1, -1.6, -1.0); b.box('stone', lx - .42, lx + .42, 1.1, 1.25, -1.72, -.88); }
    const { extra } = x;
    if (extra() < .6) for (const s of [-1, 1]) if (Math.abs(door + s * 3.2) < w / 2 - .3) nobori(b, door + s * 3.2, -1.3, noboriFor('ryokan', extra, .25), extra, toward);
  }
}

/** A 1970s concrete onsen hotel with its rooftop neon. */
function hotel(x: Context): void {
  const { lot, random, toward } = x, h = mansion(x);
  billboard(x, lot.width, lot.depth, h, random() < .8 ? signIndex('board', 'ホテル 湯の花') : SORA_BOARDS[0]!, toward);
  verticalSign(x, toward * (lot.width / 2 - .5), 3.6, Math.min(h - .5, 3.6 + 2.4 * 4), 1.1, 4, 'ホテル');
}

/** A 1980s detached house: glazed tile roof, aluminium sash, a balcony of laundry, a block wall and gate. */
function house(x: Context): void {
  const { b, lot, random, detail } = x, w = lot.width, d = lot.depth, storeys = Math.max(1, Math.min(2, lot.storeys));
  const ground = 2.9, storey = 2.7, h = ground + storey * (storeys - 1);
  const wall = drift(colour(random, HOUSE_WALLS), random), f = facade(random, wall, WINDOW_KIND.home);
  b.pattern = WALL_PATTERN.siding;
  f.flank.copy(shade(wall, .92));
  shell(x, f, w, d, h, false, false);
  windowRows(x, f, -w / 2, w / 2, [0, ground], [[-w * .18, 2.3], [w * .27, 1.1]], .35, 2.2, 1);
  if (storeys > 1) {
    windowRows(x, f, -w / 2, w / 2, [ground, h], evenColumns(-w / 2, w / 2, 2, Math.min(1.7, w / 2 - 1.2)), .85, 2.05, 1);
    if (detail && random() < .6) {
      b.colour.copy(f.trim); b.box('wall', -w * .45, w * .05, ground - .12, ground, -.85, 0, 'k');
      b.colour.set('#3a3a3c'); b.box('metal', -w * .45, w * .05, ground + .9, ground + .95, -.85, -.8, 'k');
      if (random() < .6) { b.colour.copy(colour(random, ['#f4f0e8', '#f0c8d8', '#c8dcf4', '#f4e4b0', '#e8f0c8'])); b.front('wall', -w * .4, -w * .1, ground + .3, ground + 1.3, -.82); }
    }
  }
  b.colour.copy(colour(random, ROOF_TILES));
  b.gableRoof('roof', -w / 2, w / 2, 0, d, h, 1.5 + random() * .7, .6);
  b.colour.copy(wall); b.gableEnds('wall', -w / 2, w / 2, 0, d, h, 1.5);
  // Porch light by the door.
  b.colour.set('#ffcf8a'); b.box('lamp', w * .27 - .1, w * .27 + .1, 2.3, 2.5, -.12, -.02);
  if (detail && lot.clearance > 4) {
    // The concrete-block wall (ブロック塀) at the lot line, a gate gap by the door.
    const z = -(lot.clearance - 2.1), gate = w * .27;
    b.colour.copy(colour(random, ['#a8a59c', '#b4aea2', '#9a9890']));
    b.box('wall', -w / 2 - .4, gate - .7, -.3, 1.2, z - .15, z, 'b'); b.box('wall', gate + .7, w / 2 + .4, -.3, 1.2, z - .15, z, 'b');
    if (random() < .4) {
      // A carport roof with a parked saloon.
      b.colour.set('#6a6a70'); b.box('metal', -w / 2, -w / 2 + .1, 0, 2.3, z + .4, z + .5, 'b'); b.box('metal', -w / 2 + 3, -w / 2 + 3.1, 0, 2.3, z + .4, z + .5, 'b');
      b.box('metal', -w / 2 - .1, -w / 2 + 3.2, 2.3, 2.38, z + .3, -.1);
      b.colour.copy(colour(random, ['#e8e4da', '#3a4a6a', '#7a2a2a', '#b8b4aa']));
      b.box('metal', -w / 2 + .7, -w / 2 + 2.4, .25, .95, z + .8, z + .8 + 4.3); b.box('metal', -w / 2 + .8, -w / 2 + 2.3, .95, 1.36, z + 2, z + 4);
    }
  }
  rooftopAntenna(x, w, d, h + 1);
}

/** Harbour warehouses: Meiji red brick, corrugated sheds or concrete stores, the operator's name on the face. */
/**
 * Bulkhead lamps along a warehouse front at height y (refine round 4: the Yokohama repaint lights its warehouse fronts,
 * whose pools and reflections carry the harbour road): warm lamp boxes about every 8 m, each a far light and a shop
 * fixture, so the race's shop lights and the wet road's reflection columns find them.
 */
function harbourLamps(x: Context, w: number, y: number): void {
  const { b } = x, count = Math.max(2, Math.round(w / 8));
  for (let i = 0; i < count; i++) {
    const cx = -w / 2 + w * (i + .5) / count;
    b.colour.set('#3a3a3e'); b.box('metal', cx - .04, cx + .04, y - .05, y + .25, -.42, -.02, 'b');
    b.colour.setRGB(1.7, 1.15, .55); b.box('lamp', cx - .2, cx + .2, y - .25, y - .05, -.44, -.18);
    b.beacon(cx, y - .15, -.48, 2.2, 1.35, .55, .4);
    x.fixtures.push({ position: b.world(new THREE.Vector3(cx, y - .3, -.6)), target: b.world(new THREE.Vector3(cx, 0, -3)) });
  }
}

function warehouse(x: Context): void {
  const { b, lot, random, detail } = x, w = lot.width, d = lot.depth, kind = random();
  if (kind < .25) {
    // Red brick (赤レンガ): iron-shuttered windows in rows, stone bands, a slate roof.
    // Refine round 4: the windows light like offices (some floors working late), as the Yokohama repaint lights them;
    // they were always dark.
    const h = 9 + random() * 3, wall = drift(new THREE.Color('#87493c'), random, .04), f = facade(random, wall, WINDOW_KIND.office);
    b.pattern = WALL_PATTERN.brick;
    f.flank.copy(shade(wall, .9)); f.glass.set('#2a2624');
    shell(x, f, w, d, h, false, false);
    windowRows(x, f, -w / 2, w / 2, [0, h / 2, h], evenColumns(-w / 2, w / 2, Math.max(3, Math.round(w / 3.4)), 1.3), .9, h / 2 - .9, 0);
    harbourLamps(x, w, h / 2 - .5);
    b.colour.set('#d8cdb5'); for (const y of [h / 2, h - .4]) b.box('stone', -w / 2 - .1, w / 2 + .1, y - .2, y, -.2, 0, 'bk');
    b.colour.set('#3e4448'); b.gableRoof('roof', -w / 2, w / 2, 0, d, h, 3, .4);
    b.colour.copy(wall); b.gableEnds('wall', -w / 2, w / 2, 0, d, h, 3);
  } else if (kind < .75) {
    // Corrugated shed: sliding doors, a dock canopy and the painted name.
    const h = 7 + random() * 3, sheet = drift(colour(random, SHEETS), random), f = facade(random, sheet, WINDOW_KIND.dark);
    b.pattern = WALL_PATTERN.seams;
    f.flank.copy(shade(sheet, .9));
    shell(x, f, w, d, h, false, false);
    b.colour.copy(sheet); b.front('wall', -w / 2, w / 2, 0, h, 0);
    if (detail) { b.colour.copy(shade(sheet, .8)); for (let px = -w / 2 + .3; px < w / 2; px += .6) b.box('wall', px, px + .08, 0, h, -.06, 0, 'bkt'); }
    const doors = Math.max(1, Math.floor(w / 9));
    for (let i = 0; i < doors; i++) {
      const cx = -w / 2 + w * (i + .5) / doors;
      b.colour.set(random() < .5 ? '#5a5e60' : '#6a5040'); b.front('metal', cx - 2.2, cx + 2.2, 0, 4.4, -.08);
      // The dock lamp over the door, warm and bright enough to glow (refine round 4; it was a dim cream box).
      b.colour.setRGB(1.7, 1.15, .55); b.box('lamp', cx - .2, cx + .2, 4.8, 5, -.4, -.08);
      b.beacon(cx, 4.9, -.45, 2.2, 1.35, .55, .4);
      x.fixtures.push({ position: b.world(new THREE.Vector3(cx, 4.7, -.6)), target: b.world(new THREE.Vector3(cx, 0, -3)) });
    }
    b.colour.set('#4a4c50'); b.box('metal', -w / 2, w / 2, 5.2, 5.45, -2.4, 0, 'k');
    b.print = signPrint('board', random() < .3 ? signIndex('board', '海運 KAIUN') : signIndex('board', random() < .5 ? '三栄海運' : '北辰物産'));
    b.colour.set('#d8d2c8'); b.front('sign', -Math.min(w * .35, 7), Math.min(w * .35, 7), h - .4 - Math.min(w * .35, 7), h - .4, -.1);
    b.colour.copy(shade(sheet, .85)); b.gableRoof('roof', -w / 2, w / 2, 0, d, h, 1.6, .3);
    b.colour.copy(sheet); b.gableEnds('wall', -w / 2, w / 2, 0, d, h, 1.6);
  } else {
    // A concrete store: few windows, a freight door on every floor.
    const storeys = Math.max(3, lot.storeys + 1), h = 4.4 * storeys, wall = drift(colour(random, CONCRETE), random), f = facade(random, wall, WINDOW_KIND.office);
    b.pattern = WALL_PATTERN.panels;
    shell(x, f, w, d, h);
    parapet(x, f.trim, w, d, h, .8, .25);
    windowRows(x, f, -w / 2, w / 2, levels(4.4, 4.4, storeys).slice(1), evenColumns(-w / 2, w / 2, Math.max(2, Math.round(w / 7)), 1.2), 2.4, 3.4, 0);
    b.colour.copy(f.wall); b.front('wall', -w / 2, w / 2, 0, 4.4, 0);
    b.colour.set('#4a4a4e'); b.front('metal', -2.6, 2.6, 0, 3.6, -.06);
    harbourLamps(x, w, 4);
    b.print = signPrint('fascia', signIndex('fascia', '三栄倉庫')); b.colour.set('#e8e8e8');
    b.front('sign', -Math.min(w * .3, 6), Math.min(w * .3, 6), h - 2.2, h - .6, -.06);
    rooftop(x, w, d, h, { tank: true });
  }
  if (detail === 2) {
    // Crates and drums on the apron, as on the harbour cutscene's quay.
    for (let i = 0, n = 2 + Math.floor(random() * 4); i < n; i++) {
      const cx = (random() - .5) * (w - 3), cz = -1.2 - random() * Math.max(.5, lot.clearance - 4);
      if (random() < .5) { b.colour.copy(colour(random, ['#7a5a3a', '#8a6a44', '#6a4a30'])); b.box('wall', cx - .6, cx + .6, 0, 1.1, cz - .6, cz + .6); }
      else { b.colour.copy(colour(random, ['#2e4f7a', '#7a2e2a', '#3e6a4a'])); b.cylinder('metal', cx, 0, cz, .3, .9, 8); }
    }
  }
}

/** A container yard: stacked boxes in rows, a fence and a floodlight mast. */
function containers(x: Context): void {
  const { b, lot, random, detail } = x, w = lot.width, d = lot.depth;
  const columns = Math.max(1, Math.floor((w - 2) / 6.4)), rows = Math.max(1, Math.floor((d - 2) / 2.75));
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const height = Math.floor(random() * (lot.storeys + 1));
    const x0 = -w / 2 + 1 + c * 6.4, z0 = 1 + r * 2.75;
    for (let level = 0; level < height; level++) {
      const tint = drift(colour(random, CONTAINERS), random, .06);
      b.colour.copy(tint); b.box('metal', x0, x0 + 6.06, level * 2.6, level * 2.6 + 2.59, z0, z0 + 2.44);
      if (detail) { b.colour.copy(shade(tint, .7)); b.side('metal', x0 - .01, z0 + .1, z0 + 2.34, level * 2.6 + .1, level * 2.6 + 2.5, -1); }
    }
  }
  b.colour.set('#5a5c60');
  if (detail) for (let px = -w / 2; px <= w / 2; px += 2.5) b.box('metal', px - .03, px + .03, -.2, 2.1, -.3, -.24, 'b');
  b.box('metal', -w / 2, w / 2, 1.95, 2.0, -.3, -.24, 'b');
  // The floodlight mast lights the yard and the street.
  const mast = (random() - .5) * w * .6;
  b.box('metal', mast - .15, mast + .15, 0, 18, d * .5 - .15, d * .5 + .15, 'b');
  b.colour.set('#fff0d0'); b.box('lamp', mast - 1.2, mast + 1.2, 18, 18.6, d * .5 - .5, d * .5 + .1);
  x.fixtures.push({ position: b.world(new THREE.Vector3(mast, 17.8, d * .4)), target: b.world(new THREE.Vector3(mast, 0, -2)) });
}

const BUILDERS: Readonly<Record<PeriodLot['typology'], (x: Context) => void>> = {
  shophouse, machiya, zakkyo, office, mansion, ministry, pachinko, station, parking, ryokan, hotel, house, warehouse, containers,
};

/** Write one lot's building into the chunk builder; shop lights go to `fixtures`. */
export function buildLot(b: CityMeshBuilder, lot: PeriodLot, fixtures: CityFixture[]): void {
  const random = seeded(lot.seed ^ 0x9e3779b9), lift = lot.typology === 'parking' ? 0 : lot.rise + .1;
  b.frame(lot.x, lot.base + lift, lot.z, lot.yaw);
  if (lift > 0) {
    // The plinth closes the slope under the ground floor.
    b.colour.set('#8f8a80'); b.box('stone', -lot.width / 2, lot.width / 2, -lift - .4, 0, 0, lot.depth, 'bt');
  }
  const x: Context = { b, lot, random, extra: seeded(lot.seed ^ 0x2f6b1d3c), detail: lot.row === 1 ? 2 : lot.row === 2 ? 1 : 0,
    toward: lot.side < 0 ? -1 : 1, fixtures };
  b.pattern = WALL_PATTERN.plain;
  BUILDERS[lot.typology](x);
  b.pattern = WALL_PATTERN.plain;
}
