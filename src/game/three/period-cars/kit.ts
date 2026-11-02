import * as THREE from 'three';
import type { CarBuild, WheelStyle } from '../../car-builds';
import { resolvedBuild } from '../../car-builds';
import { Buckets, box, cap, circle, grid, lerp, roundedRect, sweep, type V2, type V3 } from './shapes';
import { NO_PART, PART, parsePieceKey, pieceKey, tube, type BodyFrame, type PieceMaterial } from './shell';

/**
 * A build's bolt-on parts, fitted from a body's frame so each part suits every body: wheels, front and rear aero,
 * over-fenders, lamps, louvres, exhausts, mirrors, bonnet scoops and vents, roof racks and underglow. Geometry is cached
 * per body and part; a build only picks them. Bonnet and roof parts keep clear of SORA's emblems centred there.
 */
export interface KitPiece { readonly material: PieceMaterial; readonly part: number; readonly geometry: THREE.BufferGeometry }
export interface WheelGeometry { readonly spin: readonly KitPiece[]; readonly fixed: readonly KitPiece[] }

const kitCache = new Map<string, readonly KitPiece[]>();
function cached(key: string, make: (buckets: Buckets) => void): readonly KitPiece[] {
  let pieces = kitCache.get(key);
  if (!pieces) {
    const buckets = new Buckets(); make(buckets);
    pieces = [...buckets.build()].map(([bucket, geometry]) => ({ ...parsePieceKey(bucket), geometry }));
    kitCache.set(key, pieces);
  }
  return pieces;
}

/** Extra half-track a build's wheels stand out by: wider under over-fenders. */
export const flareTrack = (build: CarBuild, blisters = false) => build.fenders === 'flares' ? 0.04 : blisters ? 0.015 : 0;

/**
 * Every bolt-on part a build fits on this body (`body` names the frame for the cache). `own` marks parts the body
 * already draws in its stock form (the licensed hachiroku's door mirrors and tailpipe).
 */
export function kitPieces(body: string, frame: BodyFrame, build: CarBuild, own: { mirrors?: boolean; exhaust?: boolean } = {}): KitPiece[] {
  const b = resolvedBuild(build), out: KitPiece[] = [];
  const add = (name: string, make: (buckets: Buckets) => void) => out.push(...cached(`${body}:${name}`, make));
  if (b.front === 'lip') add('lip', k => frontLip(k, frame, false));
  if (b.front === 'deppa') add('deppa', k => frontLip(k, frame, true));
  if (b.skirts) add('skirts', k => skirts(k, frame));
  if (b.spoiler === 'ducktail') add('ducktail', k => ducktail(k, frame));
  if (b.spoiler === 'wing') add('wing', k => wing(k, frame));
  if (b.spoiler === 'roof') add('roof', k => roofSpoiler(k, frame));
  if (b.fenders === 'flares') add('flares', k => flares(k, frame));
  if (b.lamps === 'fog') add('fog', k => fogLamps(k, frame, false));
  if (b.lamps === 'rally') add('rally', k => fogLamps(k, frame, true));
  if (b.louvers) add('louvres', k => louvres(k, frame));
  if (!own.exhaust) add(`exhaust-${b.exhaust}`, k => exhaust(k, frame, b.exhaust));
  if (!own.mirrors) add(`mirrors-${b.mirrors}`, k => mirrors(k, frame, b.mirrors));
  if (b.stance === 'rally') add('mudflaps', k => mudflaps(k, frame));
  if (b.bonnet === 'scoop') add('scoop', k => scoop(k, frame));
  if (b.bonnet === 'vents') add('vents', k => bonnetVents(k, frame));
  if (b.roof !== 'none') add(`roof-${b.roof}`, k => roofRack(k, frame, b.roof === 'skis'));
  if (b.neon !== 'none') add('neon', k => neonTubes(k, frame));
  return out;
}

/** The front bumper's lower edge, left to right, as a path a lip or a deppa can follow. */
function frontEdge(frame: BodyFrame, inset: number): { at: V3; side: V3; up: V3 }[] {
  const y = frame.bumpers.front[0], radius = 0.2, z0 = frame.front - inset, half = frame.half(frame.nose - 0.12) + 0.02 - inset;
  const path: { at: V3; side: V3; up: V3 }[] = [];
  for (let s = 0; s <= 6; s++) {
    const a = s / 6 * Math.PI / 2;
    path.push({ at: [half - radius + Math.cos(a) * radius, y, z0 - radius + Math.sin(a) * radius], side: [Math.cos(a), 0, Math.sin(a)], up: [0, 1, 0] });
  }
  for (let s = 0; s <= 6; s++) {
    const a = Math.PI / 2 - s / 6 * Math.PI / 2;
    path.push({ at: [-(half - radius) - Math.cos(a) * radius, y, z0 - radius + Math.sin(a) * radius], side: [-Math.cos(a), 0, Math.sin(a)], up: [0, 1, 0] });
  }
  return path;
}

/** A chin lip under the bumper, or the bosozoku deppa: a shelf jutting forward and turned up at its tips. */
function frontLip(k: Buckets, frame: BodyFrame, deppa: boolean): void {
  const part = PART.frontBumper;
  if (!deppa) {
    sweep(k, pieceKey('aero', part), [[-0.06, -0.012], [0.035, -0.012], [0.045, 0.004], [-0.06, 0.012]], frontEdge(frame, 0.02));
    return;
  }
  // The shelf: wide and flat, 30 cm proud of the bumper, with upswept end plates.
  const y = frame.bumpers.front[0] - 0.01, half = frame.half(frame.nose - 0.12) + 0.04, z0 = frame.front - 0.08, z1 = frame.front + 0.3;
  const top: V3[] = [[half, y + 0.03, z0], [half - 0.05, y + 0.015, z1], [-half + 0.05, y + 0.015, z1], [-half, y + 0.03, z0]];
  const lift = (p: V3, dy: number): V3 => [p[0], p[1] + dy, p[2]];
  const quad = (a: V3, b: V3, c: V3, d: V3) => { k.flat(pieceKey('aero', part), a, b, c); k.flat(pieceKey('aero', part), a, c, d); };
  const [a, b, c, d] = top as [V3, V3, V3, V3], [e, f, g, h] = top.map(p => lift(p, -0.035)) as [V3, V3, V3, V3];
  quad(d, c, b, a); quad(e, f, g, h); quad(b, c, g, f); quad(a, b, f, e); quad(c, d, h, g);
  for (const side of [-1, 1]) box(k, pieceKey('aero', part), [side * half - 0.012, y - 0.03, z0], [side * half + 0.012, y + 0.11, z1 - 0.02]);
  sweep(k, pieceKey('chrome', part), circle(0.008, 5), tube([[half - 0.05, y + 0.018, z1 + 0.002], [-half + 0.05, y + 0.018, z1 + 0.002]]));
}

/** Side skirts along the rockers between the arches. */
function skirts(k: Buckets, frame: BodyFrame): void {
  const w = frame.wheels, from = w.rear + w.arch + 0.01, to = w.front - w.arch - 0.01;
  for (const side of [-1, 1]) {
    const path: { at: V3; side: V3; up: V3 }[] = [];
    for (let s = 0; s <= 10; s++) {
      const z = lerp(from, to, s / 10);
      path.push({ at: [side * (frame.half(z) - 0.005), frame.sill + 0.045, z], side: [side, 0, 0], up: [0, 1, 0] });
    }
    sweep(k, pieceKey('aero'), roundedRect(0.07, 0.1, 0.02, 2), side > 0 ? path : path.reverse());
  }
}

/** The boot or hatch's trailing edge: where a ducktail sits and a wing stands. */
function rearDeck(frame: BodyFrame): { z: number; y: number; half: number } {
  const z = frame.hatch ? Math.min(frame.cabinTail - 0.02, frame.tail + 0.16) : frame.tail + 0.1;
  return { z, y: frame.top(z, 0), half: frame.half(z) - 0.1 };
}

function ducktail(k: Buckets, frame: BodyFrame): void {
  const { half } = rearDeck(frame), z = frame.tail + 0.07;
  const path: { at: V3; side: V3; up: V3 }[] = [];
  for (let s = 0; s <= 12; s++) { const x = lerp(-half, half, s / 12); path.push({ at: [x, frame.top(z, x) - 0.005, z], side: [0, 0, -1], up: [0, 1, 0] }); }
  // Right-handed with the lip's face to the rear: travel +X (left).
  sweep(k, pieceKey('paint', PART.trunk), [[-0.07, 0], [0.06, 0], [0.075, 0.05], [0.02, 0.05]], path);
}

/** A GT wing on two uprights, with end plates. */
function wing(k: Buckets, frame: BodyFrame): void {
  const { z, y, half } = rearDeck(frame), height = frame.hatch ? 0.16 : 0.2, chord = 0.26, span = Math.min(half + 0.08, 0.82);
  // An inverted aerofoil (the curved face down), counter-clockwise: along the bottom to the trailing edge, back over the top.
  const airfoil: V2[] = [[0, 0], [chord * 0.35, -0.03], [chord, -0.012], [chord, 0.004], [chord * 0.4, 0.014], [0.02, 0.012]];
  const path: { at: V3; side: V3; up: V3 }[] = [];
  // Profile u runs back along -Z, v up; travel +X keeps the frame right-handed (side x up = +X).
  for (let s = 0; s <= 8; s++) path.push({ at: [lerp(-span, span, s / 8), y + height, z + chord * 0.5], side: [0, 0, -1], up: [0, 1, 0] });
  sweep(k, pieceKey('aero', PART.trunk), airfoil, path);
  for (const side of [-1, 1]) {
    const x = side * (span - 0.2);
    box(k, pieceKey('aero', PART.trunk), [x - 0.016, frame.top(z, x) - 0.01, z - 0.06], [x + 0.016, y + height + 0.01, z + 0.06]);
    box(k, pieceKey('paint', PART.trunk), [side * span - 0.008, y + height - 0.07, z + chord * 0.5 - chord - 0.03], [side * span + 0.008, y + height + 0.07, z + chord * 0.5 + 0.03]);
  }
}

/** A spoiler on the roof's trailing edge, over the hatch glass. */
function roofSpoiler(k: Buckets, frame: BodyFrame): void {
  const z = frame.roofRear + 0.03, cab = frame.cabin(z) ?? frame.cabin(frame.roofRear), y = cab ? cab.top + 0.01 : frame.belt(z) + 0.4, half = (cab?.topHalf ?? 0.6) - 0.02;
  const path: { at: V3; side: V3; up: V3 }[] = [];
  for (let s = 0; s <= 10; s++) { const x = lerp(-half, half, s / 10), crown = 0.02 * (1 - (x / half) ** 2); path.push({ at: [x, y + crown, z], side: [0, 0, -1], up: [0, 1, 0] }); }
  sweep(k, pieceKey('paint', frame.hatch ? PART.trunk : NO_PART), [[-0.02, -0.01], [0.2, -0.045], [0.22, -0.03], [0.05, 0.025], [-0.02, 0.015]], path);
}

/** Bolt-on over-fenders round each arch, with their rivets. */
function flares(k: Buckets, frame: BodyFrame): void {
  const w = frame.wheels, centre = w.radius + 0.02, radius = w.arch + 0.01;
  for (const wz of [w.front, w.rear]) for (const side of [-1, 1]) {
    const x = side * (frame.half(wz) - 0.008), path: { at: V3; side: V3; up: V3 }[] = [], rivets: V3[] = [];
    // Right-handed: the left side runs over the arch from the back (a = pi) to the front, the right side the other way.
    for (let s = 0; s <= 18; s++) {
      const t = s / 18, a = side > 0 ? Math.PI * (1 - t) : Math.PI * t;
      const reach = Math.sin(a) > 0.02 ? 1 : 0.6;
      path.push({ at: [x, centre + Math.sin(a) * radius, wz + Math.cos(a) * radius * (1 + 0.04)], side: [side, 0, 0], up: [0, Math.sin(a), Math.cos(a)] });
      if (s % 3 === 0 && s > 0 && s < 18) rivets.push([x + side * 0.058 * reach, centre + Math.sin(a) * (radius + 0.035), wz + Math.cos(a) * (radius + 0.035)]);
    }
    sweep(k, pieceKey('paint'), [[0, -0.02], [0.05, -0.02], [0.065, 0.01], [0.055, 0.06], [0, 0.07]], path);
    for (const [rx, ry, rz] of rivets) {
      const rivet = new THREE.CylinderGeometry(0.008, 0.008, 0.01, 6); rivet.rotateZ(Math.PI / 2); rivet.translate(rx, ry, rz);
      k.geometry(pieceKey('chrome'), rivet);
    }
  }
}

/** Yellow fog lamps under the bumper, or four rally lamps on a bar ahead of the grille. */
function fogLamps(k: Buckets, frame: BodyFrame, rally: boolean): void {
  const part = PART.frontBumper, [y0, y1] = frame.bumpers.front;
  const lamps: V3[] = rally ? [-0.52, -0.18, 0.18, 0.52].map(x => [x, y1 + 0.11, frame.front + 0.06])
    : [-0.56, 0.56].map(x => [x, y0 + 0.02, frame.front + 0.03]);
  const radius = rally ? 0.085 : 0.065;
  if (rally) box(k, pieceKey('trim', part), [-0.66, y1 + 0.02, frame.front - 0.02], [0.66, y1 + 0.04, frame.front + 0.05]);
  for (const [x, y, z] of lamps) {
    const housing = new THREE.CylinderGeometry(radius, radius * 0.86, 0.09, 18); housing.rotateX(Math.PI / 2); housing.translate(x, y, z - 0.02);
    k.geometry(pieceKey('trim', part), housing);
    const lens = new THREE.CylinderGeometry(radius * 0.86, radius * 0.86, 0.012, 18); lens.rotateX(Math.PI / 2); lens.translate(x, y, z + 0.028);
    k.geometry(pieceKey(rally ? 'head' : 'amber', part), lens);
    if (rally) box(k, pieceKey('trim', part), [x - 0.012, y1 + 0.02, z - 0.04], [x + 0.012, y - radius * 0.6, z - 0.01]);
  }
}

/** Slatted louvres over the backlight. */
function louvres(k: Buckets, frame: BodyFrame): void {
  const top = frame.roofRear - 0.03, bottom = frame.cabinTail + 0.05, part = frame.hatch ? PART.trunk : NO_PART;
  if (top <= bottom) return;
  const slats = 11;
  for (let i = 0; i <= slats; i++) {
    const z = lerp(top, bottom, i / slats), cab = frame.cabin(z);
    if (!cab) continue;
    const half = cab.topHalf - 0.03, y = cab.top + 0.025;
    const next = frame.cabin(Math.max(bottom, z - (top - bottom) / slats)) ?? cab, drop = Math.max(0.015, (cab.top - next.top) * 0.75);
    box(k, pieceKey('trim', part), [-half, y - drop, z - 0.035], [half, y, z - 0.03]);
  }
  for (const side of [-1, 1]) {
    const rail: V3[] = [];
    for (let i = 0; i <= 8; i++) { const z = lerp(top, bottom, i / 8), cab = frame.cabin(z); if (cab) rail.push([side * (cab.topHalf - 0.03), cab.top + 0.03, z]); }
    sweep(k, pieceKey('trim', part), roundedRect(0.03, 0.03, 0.01, 1), tube(rail));
  }
}

/** The tailpipe: the factory's small tip, a big-bore cannon, or bosozoku takeyari pipes rising high behind. */
function exhaust(k: Buckets, frame: BodyFrame, kind: CarBuild['exhaust']): void {
  const x = -0.5, y = Math.max(0.17, frame.bumpers.rear[0] - 0.02), z = frame.rear;
  if (kind === 'takeyari') {
    for (const dx of [-0.07, 0.07]) {
      const base: V3 = [x + dx, y, z + 0.25], bend: V3 = [x + dx, y, z - 0.08], tip: V3 = [x + dx * 2.2, y + 1.15, z - 0.85];
      sweep(k, pieceKey('chrome'), circle(0.034, 10), tube([base, bend, [lerp(bend[0], tip[0], 0.08), lerp(bend[1], tip[1], 0.08), lerp(bend[2], tip[2], 0.08)], tip]));
      sweep(k, pieceKey('trim'), circle(0.028, 10), tube([[tip[0], tip[1] - 0.06, tip[2] + 0.04], [tip[0], tip[1] + 0.01, tip[2] - 0.01]]));
    }
    return;
  }
  const radius = kind === 'sport' ? 0.055 : 0.03, length = kind === 'sport' ? 0.36 : 0.18;
  const pipe = new THREE.CylinderGeometry(radius, radius, length, 16, 1, true); pipe.rotateX(Math.PI / 2); pipe.translate(x, y, z + length / 2 - 0.05);
  k.geometry(pieceKey('chrome'), pipe);
  const hole = new THREE.CircleGeometry(radius * 0.82, 16); hole.rotateY(Math.PI); hole.translate(x, y, z - 0.045);
  k.geometry(pieceKey('trim'), hole);
}

/** Door mirrors on the window line, or the period's fender mirrors out on the front wings. */
function mirrors(k: Buckets, frame: BodyFrame, kind: 'door' | 'fender'): void {
  for (const side of [-1, 1]) {
    const part = side > 0 ? PART.mirrorLeft : PART.mirrorRight;
    if (kind === 'fender') {
      const z = frame.wheels.front + 0.22, x = side * (frame.half(z) - 0.17), y = frame.top(z, Math.abs(x));
      sweep(k, pieceKey('chrome', part), circle(0.007, 5), tube([[x, y, z], [x + side * 0.03, y + 0.11, z - 0.01]]));
      box(k, pieceKey('trim', part), [x + side * 0.03 - 0.045, y + 0.1, z - 0.04], [x + side * 0.03 + 0.045, y + 0.165, z + 0.02]);
      box(k, pieceKey('chrome', part), [x + side * 0.03 - 0.038, y + 0.106, z - 0.046], [x + side * 0.03 + 0.038, y + 0.158, z - 0.04]);
      continue;
    }
    const z = frame.cowl - 0.12, cab = frame.cabin(z), x = side * ((cab?.baseHalf ?? frame.half(z) - 0.08) + 0.02), y = frame.belt(z) + 0.075;
    // About as far out as the hachiroku's own (1.91 m across them).
    box(k, pieceKey('trim', part), [Math.min(x, x + side * 0.07) - 0.005, y - 0.03, z - 0.03], [Math.max(x, x + side * 0.07) + 0.005, y - 0.005, z + 0.05]);
    const housing = new THREE.BoxGeometry(0.15, 0.1, 0.09); housing.translate(x + side * 0.11, y, z);
    k.geometry(pieceKey('paint', part), housing);
    box(k, pieceKey('chrome', part), [x + side * 0.11 - 0.065, y - 0.04, z - 0.047], [x + side * 0.11 + 0.065, y + 0.04, z - 0.044]);
  }
}

/** Rubber mud flaps behind each wheel, for the rally stance. */
function mudflaps(k: Buckets, frame: BodyFrame): void {
  const w = frame.wheels;
  for (const wz of [w.front, w.rear]) for (const side of [-1, 1]) {
    const z = wz - w.arch - 0.02, x = side * (w.track + 0.02);
    box(k, pieceKey('trim'), [x - 0.13, 0.07, z - 0.012], [x + 0.13, w.radius + 0.12, z]);
  }
}

/**
 * Where bonnet parts go: the bonnet's rear half, behind and beside the emblem centred on it (model.ts bodyDecals), clear
 * of pop-up lamp pods, at |x| from 0.27 to 0.53 m.
 */
function bonnetSpot(frame: BodyFrame): { from: number; to: number; inner: number; outer: number } {
  const from = frame.hood[0] + 0.08;
  return { from, to: Math.min(frame.hood[1] - 0.1, from + 0.42), inner: 0.27, outer: 0.53 };
}

/** A turbo scoop on the driver's side of the bonnet (-X), its mouth facing forward, sinking into the bonnet behind. */
function scoop(k: Buckets, frame: BodyFrame): void {
  const { from, to, inner, outer } = bonnetSpot(frame), part = PART.hood, xs = [-outer, -outer + 0.025, -inner - 0.025, -inner];
  const rows: V3[][] = [];
  // Rows from the mouth back, columns across in +X: (column) x (row) points out of the shell.
  for (let s = 0; s <= 8; s++) {
    const z = lerp(to, from, s / 8), rise = 0.008 + 0.067 * (1 - s / 8) ** 1.4;
    const top = (frame.top(z, outer - 0.025) + frame.top(z, inner + 0.025)) / 2 + rise;
    rows.push(xs.map((x, i): V3 => [x, i === 0 || i === 3 ? frame.top(z, Math.abs(x)) - 0.006 : top, z]));
  }
  grid(k, rows, () => pieceKey('paint', part));
  cap(k, pieceKey('trim', part), rows[0]!, [0, 0, 1]);
  cap(k, pieceKey('paint', part), rows[rows.length - 1]!, [0, 0, -1]);
}

/** Louvred vents either side of the bonnet's emblem: a dark well under painted slats. */
function bonnetVents(k: Buckets, frame: BodyFrame): void {
  const { from, to, inner, outer } = bonnetSpot(frame), part = PART.hood, z0 = from + 0.03, z1 = Math.min(to, from + 0.36);
  const on = (x: number, z: number, lift: number): V3 => [x, frame.top(z, Math.abs(x)) + lift, z];
  for (const side of [-1, 1]) {
    const xs = side > 0 ? [inner, outer] : [-outer, -inner], well: V3[][] = [];
    for (let s = 0; s <= 4; s++) { const z = lerp(z1, z0, s / 4); well.push([0, 1, 2, 3].map(i => on(lerp(xs[0]!, xs[1]!, i / 3), z, 0.002))); }
    grid(k, well, () => pieceKey('trim', part));
    const slats = 6;
    for (let i = 0; i < slats; i++) {
      const z = lerp(z1 - 0.03, z0 + 0.03, i / (slats - 1)), a = xs[0]! + 0.012, b = xs[1]! - 0.012;
      // Each slat lifts at its leading edge, so the louvres read against the dark well.
      solid(k, pieceKey('paint', part), [on(a, z + 0.014, 0.001), on(b, z + 0.014, 0.001), on(b, z + 0.014, 0.017), on(a, z + 0.014, 0.017)],
        [on(a, z - 0.012, 0.001), on(b, z - 0.012, 0.001), on(b, z - 0.012, 0.007), on(a, z - 0.012, 0.007)]);
    }
  }
}

/**
 * A gutter-mounted roof rack: bars across the roof's ends with rails between them, open over the roof's emblem. The ski
 * carrier clamps a pair of skis on each side instead, outboard of the emblem, the period's late-80s ski-boom load.
 */
function roofRack(k: Buckets, frame: BodyFrame, skis: boolean): void {
  // The bars stand at the roof's very ends: a short coupe's roof emblem spans 90% of its roof (model.ts bodyDecals).
  const ends = [frame.roofFront - 0.012, frame.roofRear + 0.012], bars: { z: number; y: number; half: number }[] = [];
  for (const z of ends) {
    const cab = frame.cabin(z);
    if (!cab) continue;
    // Clear of the roof's crown (up to 5 cm at the centre).
    const y = cab.top + 0.075, half = cab.topHalf - 0.03;
    bars.push({ z, y, half });
    box(k, pieceKey('trim'), [-half, y, z - 0.012], [half, y + 0.022, z + 0.012]);
    for (const side of [-1, 1]) box(k, pieceKey('trim'), [side * half - 0.022, cab.top - 0.01, z - 0.024], [side * half + 0.022, y + 0.03, z + 0.024]);
  }
  if (bars.length < 2) return;
  const [front, rear] = bars as [typeof bars[0], typeof bars[0]];
  for (const side of [-1, 1]) {
    if (!skis) {
      const x = side * (Math.min(front.half, rear.half) - 0.04);
      sweep(k, pieceKey('trim'), roundedRect(0.02, 0.02, 0.006, 1), tube([[x, front.y + 0.024, front.z], [x, rear.y + 0.024, rear.z]]));
      continue;
    }
    // A pair of skis base to base: 1.7 m, tips turned up at the front, bindings and clamps on top.
    const x = side * (Math.min(front.half, rear.half) - 0.045), y = Math.max(front.y, rear.y) + 0.03, centre = (front.z + rear.z) / 2, length = 1.7;
    const path: { at: V3; side: V3; up: V3 }[] = [];
    for (let s = 0; s <= 10; s++) {
      const z = centre - length / 2 + (length - 0.16) * s / 10;
      path.push({ at: [x, y, z], side: [1, 0, 0], up: [0, 1, 0] });
    }
    for (let s = 1; s <= 4; s++) {
      const a = s / 4 * 0.75, r = 0.16 / 0.75;
      path.push({ at: [x, y + r * (1 - Math.cos(a)), centre + length / 2 - 0.16 + r * Math.sin(a)], side: [1, 0, 0], up: [0, Math.cos(a), -Math.sin(a)] });
    }
    sweep(k, pieceKey('ski'), roundedRect(0.075, 0.024, 0.008, 1), path);
    box(k, pieceKey('chrome'), [x - 0.03, y + 0.012, centre - 0.12], [x + 0.03, y + 0.04, centre + 0.08]);
    for (const bar of bars) {
      box(k, pieceKey('trim'), [x - 0.05, bar.y + 0.02, bar.z - 0.022], [x + 0.05, y + 0.026, bar.z + 0.022]);
    }
  }
}

/** Neon tubes under the sills and both ends; their pool of light on the road is the car's own (model.ts neonGlow). */
function neonTubes(k: Buckets, frame: BodyFrame): void {
  const w = frame.wheels, y = frame.sill - 0.02, from = w.rear + w.arch + 0.05, to = w.front - w.arch - 0.05;
  for (const side of [-1, 1]) {
    const x = side * (frame.half((from + to) / 2) - 0.12);
    sweep(k, pieceKey('neon'), circle(0.012, 6), tube([[x, y, from], [x, y, to]]));
  }
  for (const [z, end] of [[frame.front - 0.3, frame.bumpers.front[0]], [frame.rear + 0.3, frame.bumpers.rear[0]]] as const) {
    sweep(k, pieceKey('neon'), circle(0.012, 6), tube([[-0.5, Math.min(y, end - 0.02), z], [0.5, Math.min(y, end - 0.02), z]]));
  }
}

// --- Wheels -------------------------------------------------------------------------------------------------------

/** A six-faced solid from its front and back quads, each face turned outward. */
function solid(k: Buckets, key: string, front: readonly V3[], back: readonly V3[]): void {
  const all = [...front, ...back], centre: V3 = [0, 1, 2].map(axis => all.reduce((sum, p) => sum + p[axis]!, 0) / all.length) as unknown as V3;
  const faces: (readonly V3[])[] = [front, [...back].reverse(), ...[0, 1, 2, 3].map(i => [front[i]!, back[i]!, back[(i + 1) % 4]!, front[(i + 1) % 4]!])];
  for (const face of faces) {
    const [a, b, c, d] = face as [V3, V3, V3, V3];
    const middle = [0, 1, 2].map(axis => (a[axis]! + b[axis]! + c[axis]! + d[axis]!) / 4);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const outward = n[0]! * (middle[0]! - centre[0]) + n[1]! * (middle[1]! - centre[1]) + n[2]! * (middle[2]! - centre[2]) >= 0;
    if (outward) { k.flat(key, a, b, c); k.flat(key, a, c, d); } else { k.flat(key, a, c, b); k.flat(key, a, d, c); }
  }
}

const wheelCache = new Map<string, WheelGeometry>();
/**
 * One wheel in its own frame: axle along X, the face outward at +X, centred on the hub. Right-hand wheels are this
 * wheel turned half round (model.ts), so their spokes still face out. `stock` styles resolve on the body (BODIES).
 */
export function wheelGeometry(style: Exclude<WheelStyle, 'stock'>, radius: number, width: number, rimOnly = false): WheelGeometry {
  const key = `${style}:${radius.toFixed(3)}:${width.toFixed(3)}:${rimOnly}`;
  let found = wheelCache.get(key);
  if (found) return found;
  const spin = new Buckets(), fixed = new Buckets(), rim = radius * 0.62, face = width / 2 - 0.01;
  if (!rimOnly) {
    // A toroidal tyre: round shoulders, a flat tread and a sidewall down to the rim.
    const profile: [number, number][] = [[rim - 0.004, -width / 2 + 0.01], [rim + 0.03, -width / 2], [radius - 0.03, -width / 2 + 0.004], [radius - 0.004, -width / 2 + 0.03],
      [radius, 0], [radius - 0.004, width / 2 - 0.03], [radius - 0.03, width / 2 - 0.004], [rim + 0.03, width / 2], [rim - 0.004, width / 2 - 0.01]];
    const tyre = new THREE.LatheGeometry(profile.map(([r, a]) => new THREE.Vector2(r, a)), 36);
    tyre.rotateZ(-Math.PI / 2); spin.geometry(pieceKey('tyre'), tyre);
    const disc = new THREE.CylinderGeometry(rim * 0.82, rim * 0.82, 0.02, 24); disc.rotateZ(Math.PI / 2); disc.translate(face - 0.08, 0, 0);
    spin.geometry(pieceKey('disc'), disc);
    const caliper = new THREE.BoxGeometry(0.05, rim * 0.45, rim * 0.5); caliper.translate(face - 0.07, rim * 0.5, -rim * 0.3);
    fixed.geometry(pieceKey('caliper'), caliper);
  }
  // The barrel behind the face, and the dark well inside it.
  const barrel = new THREE.CylinderGeometry(rim, rim, width - 0.03, 28, 1, true); barrel.rotateZ(Math.PI / 2);
  spin.geometry(pieceKey('rim'), barrel);
  const lip = new THREE.TorusGeometry(rim - 0.006, style === 'dish' ? 0.016 : 0.009, 6, 32); lip.rotateY(Math.PI / 2); lip.translate(face, 0, 0);
  spin.geometry(pieceKey(style === 'steel' ? 'rim' : 'chrome'), lip);
  /** `count` spokes from `inner` to `outer` radius, their outer ends turned on by `twist` (a mesh wheel's crossing). */
  const spoke = (count: number, inner: number, outer: number, at: number, width0: number, width1: number, depth: number, twist = 0, material: PieceMaterial = 'rim') => {
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const turn = (x: number, y: number, r: number, angle: number): V3 => [x, y * Math.cos(angle) - r * Math.sin(angle), y * Math.sin(angle) + r * Math.cos(angle)];
      const ring = (x: number): V3[] => [turn(x, -width0 / 2, inner, a), turn(x, width0 / 2, inner, a), turn(x, width1 / 2, outer, a + twist), turn(x, -width1 / 2, outer, a + twist)];
      solid(spin, pieceKey(material), ring(at), ring(at - depth));
    }
  };
  const hub = (r: number, at: number, material: PieceMaterial = 'rim') => {
    const cap = new THREE.CylinderGeometry(r, r * 1.1, 0.03, 18); cap.rotateZ(-Math.PI / 2); cap.translate(at, 0, 0); spin.geometry(pieceKey(material), cap);
  };
  switch (style) {
    case 'hachi': spoke(8, rim * 0.22, rim * 0.96, face, rim * 0.16, rim * 0.2, 0.025); hub(rim * 0.25, face - 0.005); break;
    case 'mesh':
      spoke(12, rim * 0.24, rim * 0.95, face, rim * 0.05, rim * 0.05, 0.012, 0.18);
      spoke(12, rim * 0.24, rim * 0.95, face - 0.006, rim * 0.05, rim * 0.05, 0.012, -0.18);
      hub(rim * 0.24, face, 'chrome'); break;
    case 'dish': spoke(4, rim * 0.2, rim * 0.72, face - 0.05, rim * 0.22, rim * 0.3, 0.025); hub(rim * 0.22, face - 0.045);
      { const dish = new THREE.CylinderGeometry(rim * 0.99, rim * 0.72, 0.05, 32, 1, true); dish.rotateZ(Math.PI / 2); dish.translate(face - 0.025, 0, 0); spin.geometry(pieceKey('chrome'), dish); } break;
    case 'star': spoke(5, rim * 0.2, rim * 0.96, face, rim * 0.42, rim * 0.18, 0.03); hub(rim * 0.24, face); break;
    case 'disc': {
      const plate = new THREE.CylinderGeometry(rim * 0.96, rim * 0.96, 0.012, 32); plate.rotateZ(Math.PI / 2); plate.translate(face - 0.01, 0, 0); spin.geometry(pieceKey('rim'), plate);
      spoke(14, rim * 0.34, rim * 0.92, face + 0.004, rim * 0.05, rim * 0.09, 0.006, 0.35, 'trim'); hub(rim * 0.2, face + 0.006, 'chrome'); break;
    }
    case 'steel': {
      const plate = new THREE.CylinderGeometry(rim * 0.94, rim * 0.94, 0.012, 28); plate.rotateZ(Math.PI / 2); plate.translate(face - 0.025, 0, 0); spin.geometry(pieceKey('rim'), plate);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, hole = new THREE.CircleGeometry(rim * 0.11, 10); hole.rotateY(Math.PI / 2);
        hole.translate(face - 0.018, Math.sin(a) * rim * 0.62, Math.cos(a) * rim * 0.62); spin.geometry(pieceKey('trim'), hole);
      }
      hub(rim * 0.36, face - 0.02, 'chrome'); break;
    }
  }
  const pieces = (buckets: Buckets) => [...buckets.build()].map(([bucket, geometry]) => ({ ...parsePieceKey(bucket), geometry }));
  found = { spin: pieces(spin), fixed: pieces(fixed) };
  wheelCache.set(key, found);
  return found;
}
