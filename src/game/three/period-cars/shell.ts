import * as THREE from 'three';
import { BODY_SPECS, type BodySpec, type ProceduralBody } from './bodies';
import { Buckets, box, cap, circle, curve, grid, lerp, roundedRect, sweep, type V2, type V3 } from './shapes';

/**
 * A period body's shell, lamps, bumpers and cabin, generated from its BodySpec. Geometry is sorted by material and by
 * breakable panel (CAR_PARTS bit order, src/game/drive/damage.ts), shared by every car of that body; materials and
 * kit parts are each car's own (model.ts, kit.ts).
 */
export type PieceMaterial = 'paint' | 'lower' | 'under' | 'trim' | 'chrome' | 'glass' | 'head' | 'tail' | 'tailFrame' | 'amber'
  | 'reverse' | 'plate' | 'interior' | 'seat' | 'tyre' | 'rim' | 'disc' | 'caliper' | 'aero';
export const NO_PART = -1;
/** CAR_PARTS bits (damage.ts). +X is the driver's left. */
export const PART = { frontPlate: 0, frontBumper: 1, headLeft: 2, headRight: 3, hood: 4, rearPlate: 5, rearBumper: 6, trunk: 7,
  mirrorLeft: 8, mirrorRight: 9, doorLeft: 10, doorRight: 11 } as const;
export const PART_COUNT = 12;
export const pieceKey = (material: PieceMaterial, part: number = NO_PART) => `${material}|${part}`;
export function parsePieceKey(key: string): { material: PieceMaterial; part: number } {
  const [material, part] = key.split('|');
  return { material: material as PieceMaterial, part: Number(part) };
}

/**
 * Where a body's surfaces are, for its kit parts and decals. The same shape describes the licensed hachiroku from its
 * measured anchors (hachiroku.ts), so every kit part fits every body.
 */
export interface BodyFrame {
  readonly front: number; readonly rear: number; readonly nose: number; readonly tail: number;
  readonly sill: number; readonly lowerLine: number;
  readonly wheels: { readonly front: number; readonly rear: number; readonly track: number; readonly radius: number; readonly width: number; readonly arch: number };
  half(z: number): number; belt(z: number): number;
  /** The top surface's height at (x, z), outside the cabin. */
  top(z: number, x: number): number;
  /** The cabin's roof edge at z: its half width and height, or null outside the cabin. */
  cabin(z: number): { readonly base: number; readonly baseHalf: number; readonly top: number; readonly topHalf: number } | null;
  readonly roofFront: number; readonly roofRear: number; readonly cowl: number; readonly cabinTail: number; readonly hatch: boolean;
  readonly bumpers: { readonly front: V2; readonly rear: V2 };
  /** Door panels along z, and the bonnet. */
  readonly doors: readonly V2[]; readonly hood: V2;
  readonly seat: V3;
}

export interface BreakPiece { readonly material: PieceMaterial; readonly geometry: THREE.BufferGeometry }
export interface BodyTemplate {
  readonly id: ProceduralBody;
  readonly frame: BodyFrame;
  readonly pieces: readonly { readonly material: PieceMaterial; readonly part: number; readonly geometry: THREE.BufferGeometry }[];
  /** Per CAR_PARTS bit: the panel as compact pieces about its centre, to throw down the road when it breaks. */
  readonly breakage: readonly { readonly pieces: readonly BreakPiece[]; readonly centre: V3; readonly size: number }[];
}

const templates = new Map<ProceduralBody, BodyTemplate>();
/** The shared shell of a body, built once. */
export function bodyTemplate(id: ProceduralBody): BodyTemplate {
  let template = templates.get(id);
  if (!template) templates.set(id, template = buildTemplate(BODY_SPECS[id]));
  return template;
}

/** The frame of a spec: its profile curves and cabin. */
export function bodyFrame(spec: BodySpec): BodyFrame {
  const half = curve(spec.half), belt = curve(spec.belt), deck = curve(spec.deck), roof = curve(spec.cabin.roof);
  const edge = (z: number) => half(z) - spec.tumble - spec.round;
  const top = (z: number, x: number) => {
    const xe = Math.max(0.05, edge(z)), b = belt(z) + 0.012, d = Math.max(deck(z), b + 0.004), t = Math.min(1, Math.abs(x) / xe);
    return d - (d - b) * t * t;
  };
  const c = spec.cabin, baseHalf = (z: number) => edge(z) - c.baseInset;
  const cabin = (z: number) => {
    if (z < c.tail - 1e-9 || z > c.cowl + 1e-9) return null;
    const bh = baseHalf(z), base = top(z, bh) - 0.006;
    let height: number, topHalf: number;
    if (z > c.roofFront) {
      // Windscreen: from the cowl up to the roof, easing into the roof line.
      const t = (c.cowl - z) / (c.cowl - c.roofFront), f = 1 - (1 - t) ** (1 + c.screenCurve);
      const from = top(c.cowl, baseHalf(c.cowl)) - 0.006;
      height = from + (roof(c.roofFront) - from) * f; topHalf = lerp(baseHalf(c.cowl) * 0.97, c.roofHalf, Math.min(1, t * 1.15));
    } else if (z >= c.roofRear) { height = roof(z); topHalf = c.roofHalf; }
    else {
      // Backlight (or hatch glass): down from the roof to its base, bulging as backCurve asks.
      const t = (z - c.tail) / (c.roofRear - c.tail), f = 1 - (1 - t) ** (1 + c.backCurve);
      const to = top(c.tail, baseHalf(c.tail)) - 0.006;
      height = to + (roof(c.roofRear) - to) * f; topHalf = lerp(baseHalf(c.tail) * 0.92, c.roofHalf, Math.min(1, t * 1.25));
    }
    return { base, baseHalf: bh, top: Math.max(base, height), topHalf: Math.min(topHalf, bh) };
  };
  return {
    front: spec.front, rear: spec.rear, nose: spec.nose, tail: spec.tail, sill: spec.sill, lowerLine: spec.lowerLine, wheels: spec.wheels,
    half, belt, top, cabin, roofFront: c.roofFront, roofRear: c.roofRear, cowl: c.cowl, cabinTail: c.tail, hatch: c.hatch,
    bumpers: { front: spec.bumpers.front, rear: spec.bumpers.rear }, doors: spec.panels.doors, hood: spec.panels.hood, seat: spec.seat,
  };
}

/** Lower-body regions, one per section segment from the rocker's underside to the centre of the top. */
const LOWER_REGIONS = ['under', 'lower', 'side', 'side', 'side', 'shoulder', 'ledge', 'top', 'top', 'top'] as const;
/** Cabin regions, from the glass's base to the centre of the roof. */
const CABIN_REGIONS = ['belt', 'window', 'drip', 'edge', 'roof'] as const;

function stations(from: number, to: number, step: number, extra: readonly number[]): number[] {
  const out = new Set<number>();
  for (let z = from; z < to; z += step) out.add(Math.round(z * 1e5) / 1e5);
  out.add(to);
  for (const z of extra) if (z > from && z < to) out.add(Math.round(z * 1e5) / 1e5);
  return [...out].sort((a, b) => a - b);
}

function buildTemplate(spec: BodySpec): BodyTemplate {
  const frame = bodyFrame(spec), buckets = new Buckets(), w = spec.wheels;
  const archCentre = w.radius + 0.02;
  const archHeight = (z: number): number | null => {
    for (const wz of [w.front, w.rear]) {
      const dz = z - wz;
      if (Math.abs(dz) <= w.arch) return archCentre + Math.sqrt(Math.max(0, w.arch * w.arch - dz * dz));
    }
    return null;
  };
  const blister = (z: number) => {
    if (!spec.blisters) return 0;
    let bump = 0;
    for (const wz of [w.front, w.rear]) bump = Math.max(bump, THREE.MathUtils.smoothstep(w.arch + 0.16 - Math.abs(z - wz), 0, 0.2));
    return 0.035 * bump;
  };
  /** Half a lower-body section at z, from the rocker's underside to the centre of the top (x >= 0). */
  const lowerHalf = (z: number, inset = 0): V2[] => {
    const h = frame.half(z) - inset, belt = frame.belt(z) - inset * 0.6, sill = spec.sill + inset * 0.5;
    const waist = lerp(sill, belt, spec.waist), line = Math.min(sill + spec.lowerLine, waist - 0.02), bulge = blister(z);
    const xe = h - spec.tumble - spec.round, edgeY = belt + 0.012;
    let points: [number, number][] = [
      [h - 0.05 + bulge, sill], [h - 0.008 + bulge, sill + 0.06], [h - 0.003 + bulge, line], [h + bulge, waist],
      [h - spec.tumble * 0.6 + bulge * 0.6, belt - 0.03], [h - spec.tumble, belt],
      // The top: its edge, the line the cabin stands on, then across to the centre.
      [xe, edgeY], [xe - spec.cabin.baseInset, frame.top(z, xe - spec.cabin.baseInset) - inset * 0.6],
      [xe * 0.62, frame.top(z, xe * 0.62) - inset * 0.6], [xe * 0.3, frame.top(z, xe * 0.3) - inset * 0.6], [0, frame.top(z, 0) - inset * 0.6],
    ];
    const arch = archHeight(z);
    if (arch !== null) points = points.map(([x, y], i) => i < 5 && y < arch ? [h - 0.004 + bulge, Math.min(arch, belt - 0.04)] : [x, y]);
    return points;
  };
  const loop = (half: V2[], z: number): V3[] => [...half.map(([x, y]): V3 => [x, y, z]), ...half.slice(0, -1).reverse().map(([x, y]): V3 => [-x, y, z])];
  const segments = LOWER_REGIONS.length;
  const regionAt = (k: number) => LOWER_REGIONS[k < segments ? k : 2 * segments - 1 - k]!;
  const within = (z: number, [a, b]: V2) => z >= a && z <= b;

  // --- Lower body: sections from the tail to the nose, the wheel arches cut into the sides.
  // A station either side of each arch's edge, so the opening drops to the rocker in a clean vertical edge.
  const archEdges = [w.front, w.rear].flatMap(wz => [wz - w.arch - 1e-4, wz - w.arch, wz + w.arch, wz + w.arch + 1e-4]);
  const panelEdges = [...spec.panels.hood, ...spec.panels.trunk, ...spec.panels.doors.flat(), spec.cabin.cowl, spec.cabin.tail];
  const zs = stations(spec.tail, spec.nose, 0.045, [...archEdges, ...panelEdges, spec.tail + 0.03, spec.nose - 0.03]);
  const rows = zs.map((z, i) => loop(lowerHalf(z, i === 0 || i === zs.length - 1 ? 0.025 : 0), z));
  const lowerKey = (i: number, k: number): string | null => {
    const z = (zs[i]! + zs[i + 1]!) / 2, region = regionAt(k), left = k < segments;
    // Under the cabin the top gives way to the glass and the interior.
    if (region === 'top' && z > spec.cabin.tail && z < spec.cabin.cowl) return null;
    const material: PieceMaterial = region === 'under' ? 'under' : region === 'lower' ? 'lower' : 'paint';
    const top = region === 'top' || region === 'ledge';
    let part: number = NO_PART;
    if (top && within(z, spec.panels.hood)) part = PART.hood;
    else if (top && within(z, spec.panels.trunk)) part = PART.trunk;
    else if (region !== 'under' && !top && spec.panels.doors.some(door => within(z, door))) part = left ? PART.doorLeft : PART.doorRight;
    return pieceKey(material, part);
  };
  grid(buckets, rows, lowerKey);
  cap(buckets, pieceKey('paint'), rows[0]!, [0, 0, -1]);
  cap(buckets, pieceKey('paint'), rows[rows.length - 1]!, [0, 0, 1]);
  // The floor pan between the rockers.
  grid(buckets, rows.map(row => [row[0]!, row[row.length - 1]!]), () => pieceKey('under'), true);

  // Wheel wells: dark liners under each arch, so nobody sees into the shell.
  for (const wz of [w.front, w.rear]) for (const side of [-1, 1]) {
    const outer = frame.half(wz) - 0.01, inner = Math.max(0.2, w.track - w.width / 2 - 0.1), wellRows: V3[][] = [];
    for (let s = 0; s <= 16; s++) {
      const a = Math.PI * s / 16, r = w.arch - 0.008;
      wellRows.push([side * outer, side * inner].map((x): V3 => [x, archCentre + Math.sin(a) * r, wz + Math.cos(a) * r]));
    }
    grid(buckets, wellRows, () => pieceKey('under'), side < 0);
  }

  // --- Cabin: windscreen, roof, pillars, side glass and backlight.
  const c = spec.cabin, bw = 0.045;
  const sideGlass = (z: number) => z >= c.quarter && z <= c.cowl - 0.03 && Math.abs(z - c.bPillar) > bw;
  const cz = stations(c.tail, c.cowl, 0.035, [c.roofRear, c.roofFront, c.bPillar - bw, c.bPillar + bw, c.quarter, c.cowl - 0.03, c.tail + 0.004]);
  const cabinHalf = (z: number): V2[] => {
    const cab = frame.cabin(z)!, height = cab.top - cab.base;
    const at = (t: number): V2 => [lerp(cab.baseHalf, cab.topHalf, t), cab.base + height * t];
    const low = height > 1e-6 ? Math.min(0.03, height * 0.3) / height : 0, high = height > 1e-6 ? 1 - Math.min(0.045, height * 0.3) / height : 1;
    return [[cab.baseHalf, cab.base], at(low), at(high), [cab.topHalf, cab.top], [cab.topHalf - c.pillar, cab.top + c.crown * 0.4], [0, cab.top + c.crown]];
  };
  const cabinRows = cz.map(z => loop(cabinHalf(z), z));
  const cabinSegments = CABIN_REGIONS.length;
  grid(buckets, cabinRows, (i, k) => {
    const z = (cz[i]! + cz[i + 1]!) / 2, region = CABIN_REGIONS[k < cabinSegments ? k : 2 * cabinSegments - 1 - k]!;
    const glassSide = sideGlass(z), pillar = Math.abs(z - c.bPillar) <= bw;
    const zone = z > c.roofFront ? 'screen' : z >= c.roofRear ? 'roof' : 'back';
    if (region === 'belt' || region === 'drip') return pieceKey(glassSide || pillar ? 'trim' : 'paint');
    if (region === 'window') return pieceKey(glassSide ? 'glass' : pillar ? 'trim' : 'paint');
    if (region === 'edge') return pieceKey('paint');
    return pieceKey(zone === 'roof' ? 'paint' : 'glass');
  });
  // Black seals round the glass: the side windows, the windscreen and the backlight.
  const seal = (points: V3[], radius = 0.009) => { if (points.length > 1) sweep(buckets, pieceKey('trim'), circle(radius, 6), tube(points)); };
  const cabinPoint = (z: number, index: number, side: number): V3 => { const [x, y] = cabinHalf(z)[index]!; return [side * x, y, z]; };
  const glassRuns: V2[] = [[c.bPillar + bw, c.cowl - 0.03], [c.quarter, c.bPillar - bw]];
  for (const side of [-1, 1]) {
    for (const [a, b] of glassRuns) {
      const run = cz.filter(z => z >= a - 1e-6 && z <= b + 1e-6);
      seal(run.map(z => cabinPoint(z, 1, side))); seal(run.map(z => cabinPoint(z, 2, side)));
      for (const z of [a, b]) seal([cabinPoint(z, 1, side), cabinPoint(z, 2, side)], 0.011);
    }
    seal(cz.filter(z => z >= c.roofFront).map(z => cabinPoint(z, 4, side)), 0.011);
    seal(cz.filter(z => z <= c.roofRear).map(z => cabinPoint(z, 4, side)), 0.011);
  }
  for (const z of [c.roofFront, c.roofRear, c.cowl - 0.012, c.tail + 0.01]) {
    const row = cabinHalf(z), across = [...row.slice(3).map(([x, y]): V3 => [x, y, z]), ...row.slice(3, -1).reverse().map(([x, y]): V3 => [-x, y, z])];
    seal(across.slice(1, -1), 0.012);
  }
  // Wipers resting at the windscreen's foot.
  for (const x of [-0.36, 0.18]) sweep(buckets, pieceKey('trim'), circle(0.008, 5), tube([[x - 0.02, frame.top(c.cowl, x) + 0.02, c.cowl - 0.04], [x + 0.34, frame.top(c.cowl, x) + 0.035, c.cowl - 0.08]]));

  // --- Cabin interior, seen through the glass: floor, door cards, dash, seats and wheel.
  const cabinMid = (c.cowl + c.tail) / 2, floor = spec.sill + 0.12;
  const innerHalf = frame.half(cabinMid) - 0.09;
  box(buckets, pieceKey('interior'), [-innerHalf, floor - 0.02, c.tail + 0.04], [innerHalf, floor, c.cowl - 0.02]);
  for (const side of [-1, 1]) {
    const x = side * (frame.cabin(cabinMid)!.baseHalf - 0.035);
    box(buckets, pieceKey('interior'), [Math.min(x, x + side * 0.02), floor, c.tail + 0.08], [Math.max(x, x + side * 0.02), frame.belt(cabinMid) - 0.02, c.cowl - 0.06]);
  }
  const dashTop = frame.top(c.cowl, 0.3);
  box(buckets, pieceKey('interior'), [-innerHalf + 0.03, dashTop - 0.2, c.cowl - 0.42], [innerHalf - 0.03, dashTop + 0.02, c.cowl - 0.05]);
  const [, seatY, seatZ] = spec.seat;
  for (const x of [spec.seat[0], -spec.seat[0]]) {
    box(buckets, pieceKey('seat'), [x - 0.22, floor, seatZ - 0.05], [x + 0.22, seatY + 0.04, seatZ + 0.42]);
    const back = new THREE.BoxGeometry(0.46, 0.62, 0.12); back.rotateX(-0.22); back.translate(x, seatY + 0.33, seatZ - 0.12);
    buckets.geometry(pieceKey('seat'), back);
  }
  if (c.roofRear - c.tail > 0.5 || !c.hatch) {
    // A rear bench or the parcel shelf behind the seats.
    box(buckets, pieceKey('seat'), [-innerHalf + 0.05, floor, Math.max(c.tail + 0.06, seatZ - 0.95)], [innerHalf - 0.05, seatY + 0.2, seatZ - 0.62]);
  }
  const wheel = new THREE.TorusGeometry(0.17, 0.016, 6, 20);
  wheel.rotateX(-0.5); wheel.translate(spec.seat[0], seatY + 0.43, seatZ + 0.5); buckets.geometry(pieceKey('trim'), wheel);

  // --- Front: bumper, grille, lamps and plate.
  bumper(buckets, frame, spec, 'front'); bumper(buckets, frame, spec, 'rear');
  const noseZ = spec.nose;
  const g = spec.grille;
  if (g.kind === 'slot') box(buckets, pieceKey('trim'), [-g.half, g.y[0], noseZ - 0.02], [g.half, g.y[1], noseZ + 0.006]);
  else {
    box(buckets, pieceKey(g.kind === 'chrome' ? 'chrome' : 'trim'), [-g.half, g.y[0], noseZ - 0.02], [g.half, g.y[1], noseZ + 0.006]);
    box(buckets, pieceKey('trim'), [-g.half + 0.02, g.y[0] + 0.015, noseZ - 0.01], [g.half - 0.02, g.y[1] - 0.015, noseZ + 0.008]);
    const bars = g.kind === 'chrome' ? 9 : 4;
    for (let i = 0; i < bars; i++) {
      if (g.kind === 'chrome') { const x = lerp(-g.half + 0.04, g.half - 0.04, i / (bars - 1)); box(buckets, pieceKey('chrome'), [x - 0.006, g.y[0] + 0.015, noseZ], [x + 0.006, g.y[1] - 0.015, noseZ + 0.014]); }
      else { const y = lerp(g.y[0] + 0.025, g.y[1] - 0.025, i / (bars - 1)); box(buckets, pieceKey('trim'), [-g.half + 0.02, y - 0.006, noseZ], [g.half - 0.02, y + 0.006, noseZ + 0.014]); }
    }
  }
  headlamps(buckets, frame, spec);
  plate(buckets, [0, (spec.bumpers.front[0] + spec.bumpers.front[1]) / 2, spec.front + 0.002], 1, PART.frontPlate);

  // --- Rear: tail lamps on their frame, plate.
  taillamps(buckets, frame, spec);
  const rearPlateY = spec.tailLamps.kind === 'blocks' ? (spec.tailLamps.y[0] + spec.tailLamps.y[1]) / 2 : spec.tailLamps.y[0] - 0.1;
  const plateOnBumper = rearPlateY - 0.09 < spec.bumpers.rear[1];
  plate(buckets, [0, plateOnBumper ? (spec.bumpers.rear[0] + spec.bumpers.rear[1]) / 2 : rearPlateY, (plateOnBumper ? spec.rear : spec.tail) - 0.002], -1, PART.rearPlate);

  // --- Sides: rubbing strips at the two-tone line, door seams and handles, a midship's intakes.
  for (const side of [-1, 1]) {
    const lineY = spec.sill + spec.lowerLine + 0.012;
    const runs: [V2, number][] = [];
    const from = w.rear + w.arch + 0.02, to = w.front - w.arch - 0.02;
    const cuts = [from, ...spec.panels.doors.flat().filter(z => z > from && z < to), to].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const mid = (cuts[i]! + cuts[i + 1]!) / 2, door = spec.panels.doors.some(d => within(mid, d));
      runs.push([[cuts[i]! + 0.004, cuts[i + 1]! - 0.004], door ? side > 0 ? PART.doorLeft : PART.doorRight : NO_PART]);
    }
    for (const [[a, b], part] of runs) {
      const path: { at: V3; side: V3; up: V3 }[] = [];
      for (let s = 0; s <= 12; s++) {
        const z = lerp(a, b, s / 12), x = side * (sideX(lowerHalf(z), lineY) + 0.004);
        path.push({ at: [x, lineY, z], side: [side, 0, 0], up: [0, 1, 0] });
      }
      // Right-handed frames: on the left (+X) the strip runs forward, on the right backward.
      sweep(buckets, pieceKey('trim', part), roundedRect(0.022, 0.034, 0.008, 2), side > 0 ? path : path.reverse());
    }
    for (const [d0, d1] of spec.panels.doors) {
      const part = side > 0 ? PART.doorLeft : PART.doorRight;
      for (const z of [d0, d1]) {
        const half = lowerHalf(z), seam: V3[] = [];
        for (const [x, y] of half.slice(1, 6)) seam.push([side * (x + 0.0025), y, z]);
        sweep(buckets, pieceKey('trim', part), circle(0.004, 4), tube(seam), false, false);
      }
      const handleZ = d0 + 0.12, handleY = frame.belt(handleZ) - 0.07, hx = sideX(lowerHalf(handleZ), handleY);
      box(buckets, pieceKey('chrome', part), [side > 0 ? hx - 0.004 : -hx - 0.012, handleY - 0.016, handleZ - 0.07], [side > 0 ? hx + 0.012 : -hx + 0.004, handleY + 0.016, handleZ + 0.07]);
    }
    if (spec.vent) {
      const [z0, z1] = spec.vent.z, [y0, y1] = spec.vent.y, x = sideX(lowerHalf((z0 + z1) / 2), (y0 + y1) / 2);
      box(buckets, pieceKey('trim'), [side > 0 ? x - 0.03 : -x - 0.006, y0, z0], [side > 0 ? x + 0.006 : -x + 0.03, y1, z1]);
      for (let i = 1; i < 5; i++) { const y = lerp(y0, y1, i / 5); box(buckets, pieceKey('paint'), [side > 0 ? x - 0.01 : -x - 0.012, y - 0.007, z0 + 0.02], [side > 0 ? x + 0.012 : -x + 0.01, y + 0.007, z1 - 0.02]); }
    }
  }
  // Bonnet and boot shut lines across the top.
  for (const [z, part] of [[spec.panels.hood[0], PART.hood], [spec.panels.trunk[1], PART.trunk]] as const) {
    if (frame.cabin(z) && z > c.tail && z < c.cowl) continue;
    const xe = frame.half(z) - spec.tumble - spec.round, line: V3[] = [];
    for (let s = 0; s <= 10; s++) { const x = lerp(-xe, xe, s / 10); line.push([x, frame.top(z, x) + 0.002, z]); }
    sweep(buckets, pieceKey('trim', part), circle(0.004, 4), tube(line), false, false);
  }

  const built = buckets.build(), pieces: BodyTemplate['pieces'][number][] = [];
  for (const [key, geometry] of built) { const { material, part } = parsePieceKey(key); pieces.push({ material, part, geometry }); }
  return { id: spec.id, frame, pieces, breakage: breakagePieces(pieces) };
}

/** The half section's x at height y on its side (between the rocker and the shoulder). */
function sideX(half: readonly V2[], y: number): number {
  let best = half[3]![0];
  for (let i = 0; i < 5; i++) {
    const [x0, y0] = half[i]!, [x1, y1] = half[i + 1]!;
    if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && Math.abs(y1 - y0) > 1e-6) return lerp(x0, x1, (y - y0) / (y1 - y0));
    if (Math.abs(y - y0) < 1e-6) best = x0;
  }
  return best;
}

/** Right-handed frames along a polyline, for a tube's round profile. */
export function tube(points: readonly V3[]): { at: V3; side: V3; up: V3 }[] {
  return points.map((at, i) => {
    const a = points[Math.max(0, i - 1)]!, b = points[Math.min(points.length - 1, i + 1)]!;
    const t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const reference = Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(reference, t).normalize(), up = new THREE.Vector3().crossVectors(t, side);
    return { at, side: side.toArray() as unknown as V3, up: up.toArray() as unknown as V3 };
  });
}

/**
 * A bumper wrapped round the car's end at `y`: straight across, round the corners and back along the sides to the
 * wheel arches, its face `depth` proud of the shell.
 */
function bumper(buckets: Buckets, frame: BodyFrame, spec: BodySpec, end: 'front' | 'rear'): void {
  const [y0, y1] = end === 'front' ? spec.bumpers.front : spec.bumpers.rear, sign = end === 'front' ? 1 : -1;
  const face = end === 'front' ? spec.front : spec.rear, shell = end === 'front' ? spec.nose : spec.tail;
  const depth = Math.max(0.07, Math.abs(face - shell) + 0.05), height = y1 - y0, y = (y0 + y1) / 2;
  const zEnd = end === 'front' ? spec.wheels.front + spec.wheels.arch + 0.03 : spec.wheels.rear - spec.wheels.arch - 0.03;
  const radius = 0.2, centreZ = face - sign * depth / 2;
  // Along the sides the bumper stands 2 cm proud of the body; its corners turn on a 20 cm radius.
  const legX = (z: number) => frame.half(z) + 0.02 - depth / 2;
  const cornerZ = centreZ - sign * radius, cornerX = legX(cornerZ);
  const path: { at: V3; side: V3; up: V3 }[] = [];
  const push = (x: number, z: number, outX: number, outZ: number) => {
    // Right-handed: side (outward) x up (+Y) is the direction of travel.
    path.push({ at: [x, y, z], side: [outX, 0, outZ], up: [0, 1, 0] });
  };
  // Travel: front bumpers run left (+X) to right; rear bumpers right to left. The side legs follow the body.
  const legs = 6, arc = 8;
  const [first, second] = (end === 'front' ? [1, -1] : [-1, 1]) as [number, number];
  for (let s = 0; s <= legs; s++) { const z = lerp(zEnd, cornerZ, s / legs); push(first * legX(z), z, first, 0); }
  for (let s = 1; s <= arc; s++) {
    const a = s / arc * Math.PI / 2, outX = first * Math.cos(a), outZ = sign * Math.sin(a);
    push(first * (cornerX - radius) + outX * radius, cornerZ + outZ * radius, outX, outZ);
  }
  for (let s = 0; s < arc; s++) {
    const a = Math.PI / 2 - s / arc * Math.PI / 2, outX = second * Math.cos(a), outZ = sign * Math.sin(a);
    push(second * (cornerX - radius) + outX * radius, cornerZ + outZ * radius, outX, outZ);
  }
  for (let s = 0; s <= legs; s++) { const z = lerp(cornerZ, zEnd, s / legs); push(second * legX(z), z, second, 0); }
  const sideX = cornerX;
  const part = end === 'front' ? PART.frontBumper : PART.rearBumper;
  sweep(buckets, pieceKey(spec.bumpers.colour === 'body' ? 'paint' : 'trim', part), roundedRect(depth, height, Math.min(0.04, height / 3), 3), path);
  // A rubbing strip along the bumper's face: chrome on a period saloon, black rubber on the rest.
  const strip = path.map(p => ({ ...p, at: [p.at[0] + p.side[0] * depth / 2, y + height * 0.12, p.at[2] + p.side[2] * depth / 2] as V3 }));
  sweep(buckets, pieceKey(spec.bumpers.chrome ? 'chrome' : 'trim', part), roundedRect(0.016, height * (spec.bumpers.chrome ? 0.16 : 0.3), 0.006, 2), strip);
  if (end === 'front') {
    // Indicators in the bumper's corners.
    for (const side of [-1, 1]) {
      const x = side * (sideX - 0.12);
      box(buckets, pieceKey('amber', part), [x - 0.09, y + height * 0.2 - 0.025, face - 0.01], [x + 0.09, y + height * 0.2 + 0.025, face + 0.006]);
    }
  }
}

/** Head lamps: raised pop-up pods on the bonnet, or fixed units in the nose. */
function headlamps(buckets: Buckets, frame: BodyFrame, spec: BodySpec): void {
  const h = spec.head;
  for (const side of [-1, 1]) {
    const part = side > 0 ? PART.headLeft : PART.headRight, [x0, x1] = h.x, xc = side * (x0 + x1) / 2, width = x1 - x0;
    if (h.kind === 'popup') {
      const z = h.z!, base = frame.top(z, Math.abs(xc)) - 0.01, height = h.y[1];
      box(buckets, pieceKey('paint', part), [xc - width / 2, base, z - 0.07], [xc + width / 2, base + height, z + 0.04]);
      box(buckets, pieceKey('trim', part), [xc - width / 2 + 0.012, base + 0.012, z + 0.04], [xc + width / 2 - 0.012, base + height - 0.01, z + 0.05]);
      for (const offset of [-0.25, 0.25]) {
        const lamp = new THREE.CylinderGeometry(0.045, 0.045, 0.012, 16); lamp.rotateX(Math.PI / 2);
        lamp.translate(xc + offset * width, base + height * 0.52, z + 0.054); buckets.geometry(pieceKey('head', part), lamp);
      }
      continue;
    }
    const z = spec.nose, [y0, y1] = h.y;
    box(buckets, pieceKey('trim', part), [xc - width / 2, y0, z - 0.02], [xc + width / 2, y1, z + 0.012]);
    if (h.kind === 'quad') {
      for (const t of [0.25, 0.75]) {
        const x = xc + (t - 0.5) * width * side;
        box(buckets, pieceKey('head', part), [x - width * 0.22, y0 + 0.018, z], [x + width * 0.22, y1 - 0.018, z + 0.018]);
      }
    } else box(buckets, pieceKey('head', part), [xc - width / 2 + 0.014, y0 + 0.012, z], [xc + width / 2 - 0.014, y1 - 0.012, z + 0.018]);
  }
}

/** Tail lamps on their black frame across the tail: a full-width band, round pairs, or tall corner blocks. */
function taillamps(buckets: Buckets, frame: BodyFrame, spec: BodySpec): void {
  const t = spec.tailLamps, z = spec.tail, [y0, y1] = t.y, outer = frame.half(z) - 0.035, back = z - 0.014;
  if (t.kind === 'blocks') {
    const [x0, x1] = t.x!;
    for (const side of [-1, 1]) {
      const a = side * x0, b = side * x1;
      box(buckets, pieceKey('tailFrame'), [Math.min(a, b) - 0.01, y0 - 0.01, back], [Math.max(a, b) + 0.01, y1 + 0.01, z + 0.012]);
      box(buckets, pieceKey('tail'), [Math.min(a, b), lerp(y0, y1, 0.32), back - 0.004], [Math.max(a, b), y1, back]);
      box(buckets, pieceKey('amber'), [Math.min(a, b), lerp(y0, y1, 0.14), back - 0.004], [Math.max(a, b), lerp(y0, y1, 0.3), back]);
      box(buckets, pieceKey('reverse'), [Math.min(a, b), y0, back - 0.004], [Math.max(a, b), lerp(y0, y1, 0.12), back]);
    }
    return;
  }
  box(buckets, pieceKey('tailFrame'), [-outer, y0 - 0.012, back], [outer, y1 + 0.012, z + 0.012]);
  if (t.kind === 'round') {
    for (const side of [-1, 1]) for (const [x, kind] of [[outer - 0.1, 'tail'], [outer - 0.29, 'tail'], [outer - 0.46, 'reverse']] as const) {
      const lamp = new THREE.CylinderGeometry((y1 - y0) * 0.42, (y1 - y0) * 0.42, 0.016, 20); lamp.rotateX(Math.PI / 2);
      lamp.translate(side * x, (y0 + y1) / 2, back - 0.006); buckets.geometry(pieceKey(kind), lamp);
    }
    return;
  }
  for (const side of [-1, 1]) {
    const inner = 0.2;
    box(buckets, pieceKey('tail'), [side > 0 ? inner + 0.16 : -outer + 0.012, y0, back - 0.005], [side > 0 ? outer - 0.012 : -inner - 0.16, y1, back]);
    box(buckets, pieceKey('amber'), [side > 0 ? inner + 0.06 : -inner - 0.15, y0, back - 0.005], [side > 0 ? inner + 0.15 : -inner - 0.06, y1, back]);
    box(buckets, pieceKey('reverse'), [side > 0 ? inner : -inner - 0.05, y0, back - 0.005], [side > 0 ? inner + 0.05 : -inner, y1, back]);
  }
}

/** A Japanese plate (330 x 165 mm) facing `facing` (+1 forward, -1 back), with the plate texture across its face. */
function plate(buckets: Buckets, [x, y, z]: V3, facing: 1 | -1, part: number): void {
  const w = 0.165, h = 0.0825, d = facing * 0.006, n: V3 = [0, 0, facing];
  const corners: V3[] = facing > 0 ? [[x - w, y - h, z + d], [x + w, y - h, z + d], [x + w, y + h, z + d], [x - w, y + h, z + d]]
    : [[x + w, y - h, z + d], [x - w, y - h, z + d], [x - w, y + h, z + d], [x + w, y + h, z + d]];
  const [a, b, c2, e] = corners as [V3, V3, V3, V3];
  buckets.triangle(pieceKey('plate', part), a, b, c2, n, n, n, [0, 0], [1, 0], [1, 1]);
  buckets.triangle(pieceKey('plate', part), a, c2, e, n, n, n, [0, 0], [1, 1], [0, 1]);
  // The backing sits between the body and the plate's face.
  const [z0, z1] = facing > 0 ? [z - 0.002, z + d - 0.001] : [z + d + 0.001, z + 0.002];
  box(buckets, pieceKey('trim', part), [x - w - 0.008, y - h - 0.008, z0], [x + w + 0.008, y + h + 0.008, z1]);
}

/** Each breakable part's pieces, centred on the part, for the flying panels. */
function breakagePieces(pieces: readonly { material: PieceMaterial; part: number; geometry: THREE.BufferGeometry }[]): BodyTemplate['breakage'] {
  return Array.from({ length: PART_COUNT }, (_, bit) => {
    const own = pieces.filter(piece => piece.part === bit);
    if (!own.length) return { pieces: [], centre: [0, 0, 0], size: 0.2 };
    const bounds = new THREE.Box3();
    for (const piece of own) bounds.union(piece.geometry.boundingBox!);
    const centre = bounds.getCenter(new THREE.Vector3());
    return {
      pieces: own.map(piece => ({ material: piece.material, geometry: piece.geometry.clone().translate(-centre.x, -centre.y, -centre.z) })),
      centre: centre.toArray() as unknown as V3, size: bounds.getSize(new THREE.Vector3()).length() / 2,
    };
  });
}
