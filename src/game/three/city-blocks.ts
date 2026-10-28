import type { StreetscapeLayout, StreetscapePose, StreetscapeFootprint, StreetscapeSide } from './streetscape';

export type CityBlockKind = 'building' | 'apartment';
/** Conservative local-space bounds of the COMPLETED architecture, including attachments. */
export interface CityBlockBounds {
  readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number;
  readonly minZ: number; readonly maxZ: number;
}
export interface CityBlockTemplates { readonly buildings: readonly CityBlockBounds[]; readonly apartments: readonly CityBlockBounds[] }
export interface CityBlockPlacement {
  readonly id: string; readonly kind: CityBlockKind; readonly variant: number;
  readonly p: number; readonly side: StreetscapeSide; readonly clearance: number;
  readonly position: readonly [number, number, number]; readonly heading: number;
  readonly footprint: StreetscapeFootprint;
  readonly ground: { readonly min: number; readonly max: number; readonly samples: number };
}
export interface CityBlockLayout {
  readonly course: StreetscapeLayout['course']; readonly placements: readonly CityBlockPlacement[];
  readonly stats: { readonly candidates: number; readonly accepted: number; readonly rejected: number;
    readonly roadAttempts: number; readonly occupiedAttempts: number; readonly gradeAttempts: number; readonly towerAttempts: number };
}
export interface CityBlockWindow { readonly buildings: readonly CityBlockPlacement[]; readonly apartments: readonly CityBlockPlacement[] }
export interface CityBlockOptions {
  /** Sample the actual clipped urban-ground surface, once per course. A missing hit rejects the plot. */
  readonly groundHeightAt: (x: number, z: number) => number | null;
}
export const CITY_BLOCK_CAPACITIES = { buildings: [7, 7, 6, 6], apartments: [7, 3] } as const;
const TAU = Math.PI * 2;
const mod = (v: number, n: number) => (v % n + n) % n;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(v, b));
type Point = { x: number; z: number };
type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
type Road = { a: StreetscapePose; b: StreetscapePose };
class Grid<T> {
  private readonly cells = new Map<string, T[]>();
  private visit(box: Box, fn: (key: string) => void): void {
    for (let x = Math.floor(box.minX / 32); x <= Math.floor(box.maxX / 32); x++)
      for (let z = Math.floor(box.minZ / 32); z <= Math.floor(box.maxZ / 32); z++) fn(`${x}:${z}`);
  }
  add(value: T, box: Box): void { this.visit(box, key => { const values = this.cells.get(key) ?? []; values.push(value); this.cells.set(key, values); }); }
  query(box: Box): T[] { const values = new Set<T>(); this.visit(box, key => { for (const item of this.cells.get(key) ?? []) values.add(item); }); return [...values]; }
}
const layoutIndices = new WeakMap<CityBlockLayout, Grid<StreetscapeFootprint>>();
function boxOf(f: StreetscapeFootprint, margin = 0): Box {
  const c = Math.abs(Math.cos(f.heading)), s = Math.abs(Math.sin(f.heading));
  const x = c * f.halfX + s * f.halfZ + margin, z = s * f.halfX + c * f.halfZ + margin;
  return { minX: f.x - x, maxX: f.x + x, minZ: f.z - z, maxZ: f.z + z };
}
function poseAt(course: CityBlockLayout['course'], value: number): StreetscapePose {
  const poses = course.poses, p = course.circuit ? mod(value, course.length) : clamp(value, poses[0]!.p, poses.at(-1)!.p);
  let lo = 0, hi = poses.length - 1;
  while (lo + 1 < hi) { const middle = (lo + hi) >>> 1; if (poses[middle]!.p <= p) lo = middle; else hi = middle; }
  const a = poses[lo]!, b = poses[hi]!, t = clamp((p - a.p) / (b.p - a.p || 1), 0, 1);
  return { p, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    heading: a.heading + (mod(b.heading - a.heading + Math.PI, TAU) - Math.PI) * t, width: a.width + (b.width - a.width) * t };
}
function local(point: Point, f: StreetscapeFootprint): Point {
  const x = point.x - f.x, z = point.z - f.z, c = Math.cos(f.heading), s = Math.sin(f.heading);
  return { x: c * x - s * z, z: s * x + c * z };
}
function overlaps(a: StreetscapeFootprint, b: StreetscapeFootprint, margin: number): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  return [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2].every(angle => {
    const x = Math.cos(angle), z = -Math.sin(angle);
    const radius = (f: StreetscapeFootprint) => Math.abs(x * Math.cos(f.heading) - z * Math.sin(f.heading)) * f.halfX
      + Math.abs(x * Math.sin(f.heading) + z * Math.cos(f.heading)) * f.halfZ;
    return Math.abs(dx * x + dz * z) < radius(a) + radius(b) + margin;
  });
}
function lineHitsBox(a: Point, b: Point, halfX: number, halfZ: number): boolean {
  let low = 0, high = 1;
  for (const [start, delta, half] of [[a.x, b.x - a.x, halfX], [a.z, b.z - a.z, halfZ]]) {
    if (Math.abs(delta!) < 1e-9) { if (Math.abs(start!) > half!) return false; continue; }
    const near = (-half! - start!) / delta!, far = (half! - start!) / delta!;
    low = Math.max(low, Math.min(near, far)); high = Math.min(high, Math.max(near, far));
    if (low > high) return false;
  }
  return true;
}
function hitsRoad(f: StreetscapeFootprint, roads: Grid<Road>): boolean {
  // Each road segment is indexed with its full width plus the sidewalk margin.
  // Expanding the oriented building box by that radius encloses the rounded
  // road capsule conservatively, including unrelated nearby route branches.
  for (const { a, b } of roads.query(boxOf(f))) {
    const radius = Math.max(a.width, b.width) + 1.35;
    if (lineHitsBox(local(a, f), local(b, f), f.halfX + radius, f.halfZ + radius)) return true;
  }
  return false;
}
function footprint(bounds: CityBlockBounds, x: number, z: number, heading: number,
  scale: readonly [number, number, number] = [1, 1, 1], margin = .25): StreetscapeFootprint {
  const cx = (bounds.minX + bounds.maxX) * scale[0] / 2, cz = (bounds.minZ + bounds.maxZ) * scale[2] / 2;
  return { x: x + Math.cos(heading) * cx + Math.sin(heading) * cz,
    z: z - Math.sin(heading) * cx + Math.cos(heading) * cz, heading,
    halfX: (bounds.maxX - bounds.minX) * scale[0] / 2 + margin,
    halfZ: (bounds.maxZ - bounds.minZ) * scale[2] / 2 + margin };
}
function groundRange(f: StreetscapeFootprint, sample: CityBlockOptions['groundHeightAt']): CityBlockPlacement['ground'] | null {
  // At most 4 m between samples: finer than the urban surface's 8 m source grid.
  // A missing sample or substantial relief rejects this plot rather than moving
  // native terrain or leaving a high foundation suspended above it.
  const nx = Math.max(2, Math.ceil(f.halfX * 2 / 4)), nz = Math.max(2, Math.ceil(f.halfZ * 2 / 4));
  let min = Infinity, max = -Infinity, samples = 0;
  for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
    const x = (ix / nx * 2 - 1) * f.halfX, z = (iz / nz * 2 - 1) * f.halfZ;
    const y = sample(f.x + Math.cos(f.heading) * x + Math.sin(f.heading) * z,
      f.z - Math.sin(f.heading) * x + Math.cos(f.heading) * z);
    if (y === null || !Number.isFinite(y)) return null;
    min = Math.min(min, y); max = Math.max(max, y); samples++;
  }
  return { min, max, samples };
}
function validateTemplates(templates: CityBlockTemplates): void {
  if (templates.buildings.length !== 4 || templates.apartments.length !== 2) throw new Error('City blocks require four completed house variants and two apartment variants.');
  for (const b of [...templates.buildings, ...templates.apartments]) {
    if (![b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].every(Number.isFinite)
      || b.maxX <= b.minX || b.maxY <= b.minY || b.maxZ <= b.minZ) throw new Error('City template bounds must be finite, nonempty metre-scale volumes.');
  }
}

/** Stable, full-course second-tier urban plots. Rural layouts remain empty.
 * Existing frontages reserve their completed source envelopes before any new
 * plot is considered. Placement never depends on the camera or mesh pool.
 */
export function createCityBlocks(frontages: StreetscapeLayout, templates: CityBlockTemplates, options: CityBlockOptions): CityBlockLayout {
  validateTemplates(templates);
  const course = frontages.course, placements: CityBlockPlacement[] = [];
  const stats = { candidates: 0, accepted: 0, rejected: 0, roadAttempts: 0, occupiedAttempts: 0, gradeAttempts: 0, towerAttempts: 0 };
  const result: CityBlockLayout = { course, placements, stats }, occupied = new Grid<StreetscapeFootprint>();
  layoutIndices.set(result, occupied);
  if (course.style !== 3) return result;
  const roads = new Grid<Road>(), towers: Point[] = [];
  for (let i = 1; i < course.poses.length; i++) {
    const a = course.poses[i - 1]!, b = course.poses[i]!, radius = Math.max(a.width, b.width) + 1.35;
    roads.add({ a, b }, { minX: Math.min(a.x, b.x) - radius, maxX: Math.max(a.x, b.x) + radius,
      minZ: Math.min(a.z, b.z) - radius, maxZ: Math.max(a.z, b.z) + radius });
  }
  for (const existing of [...frontages.buildings, ...frontages.apartments]) {
    const p = poseAt(course, existing.p), lateral = existing.side * (p.width + existing.clearance);
    const bounds = (existing.kind === 'building' ? templates.buildings : templates.apartments)[existing.variant]!;
    const f = footprint(bounds, p.x + Math.cos(p.heading) * lateral, p.z - Math.sin(p.heading) * lateral,
      p.heading + (existing.side < 0 ? -Math.PI / 2 : Math.PI / 2) + existing.yaw, existing.scale);
    occupied.add(f, boxOf(f)); if (existing.kind === 'apartment') towers.push(f);
  }
  for (const section of frontages.sections) {
    const index = Number(section.id.split(':')[1]), side = section.side;
    const blockHeading = poseAt(course, section.start + section.length / 2).heading;
    const lowCount = section.block === 'residential' ? 3 : 2;
    const specs = Array.from({ length: lowCount }, (_, ordinal) => ({ kind: 'building' as CityBlockKind,
      variant: mod(index + (side > 0 ? 2 : 0) + ordinal, 4), at: (lowCount === 3 ? [23, 68, 113] : [28, 104])[ordinal]!,
      clearance: [23, 27, 24][ordinal]!, yaw: ordinal === 1 && index % 3 === 0 ? Math.PI / 2 : 0 }));
    // Existing planted-court apartment blocks remain the only tall structures
    // in those sections. Elsewhere most new blocks have four floors; an
    // occasional six-floor source model breaks the roof height rhythm.
    if (section.block !== 'planted-court') specs.push({ kind: 'apartment', variant: mod(index + (side > 0 ? 1 : 0), 3) === 0 ? 1 : 0,
      at: index % 2 ? 78 : 57, clearance: index % 2 ? 46 : 40, yaw: index % 4 === 1 ? Math.PI / 2 : 0 });
    for (const [ordinal, spec] of specs.entries()) {
      const rawP = section.start + spec.at;
      if (!course.circuit && (rawP < course.poses[0]!.p || rawP > course.poses.at(-1)!.p)) continue;
      const p = poseAt(course, rawP), heading = blockHeading + (side < 0 ? -Math.PI / 2 : Math.PI / 2) + spec.yaw;
      const bounds = (spec.kind === 'building' ? templates.buildings : templates.apartments)[spec.variant]!;
      stats.candidates++; let accepted = false;
      for (const retreat of [0, 4, 8]) {
        const clearance = spec.clearance + retreat, lateral = side * (p.width + clearance);
        const x = p.x + Math.cos(p.heading) * lateral, z = p.z - Math.sin(p.heading) * lateral;
        const f = footprint(bounds, x, z, heading);
        if (hitsRoad(f, roads)) { stats.roadAttempts++; continue; }
        if (occupied.query(boxOf(f, 1.5)).some(other => overlaps(f, other, 1.5))) { stats.occupiedAttempts++; continue; }
        if (spec.kind === 'apartment' && towers.some(other => Math.hypot(f.x - other.x, f.z - other.z) < 38)) { stats.towerAttempts++; continue; }
        const ground = groundRange(f, options.groundHeightAt);
        if (!ground || ground.max - ground.min > (spec.kind === 'building' ? .28 : .36)) { stats.gradeAttempts++; continue; }
        const placement: CityBlockPlacement = { id: `${section.id}/secondary/${ordinal}`, kind: spec.kind, variant: spec.variant,
          p: p.p, side, clearance, position: [x, ground.min - bounds.minY - .01, z], heading, footprint: f, ground };
        placements.push(placement); occupied.add(f, boxOf(f)); if (spec.kind === 'apartment') towers.push(f);
        accepted = true; stats.accepted++; break;
      }
      if (!accepted) stats.rejected++;
    }
  }
  placements.sort((a, b) => a.p - b.p || a.id.localeCompare(b.id)); return result;
}

/** A wider visible window supplies roofs beyond the first frontage row. */
export function selectCityBlocks(layout: CityBlockLayout, progress: number): CityBlockWindow {
  const course = layout.course, p = course.circuit ? mod(progress, course.length) : progress;
  const delta = (placement: CityBlockPlacement) => course.circuit
    ? mod(placement.p - p + course.length / 2, course.length) - course.length / 2 : placement.p - p;
  const candidates = layout.placements.map(placement => ({ placement, delta: delta(placement) }))
    .filter(item => item.delta >= -100 && item.delta <= 520)
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.placement.id.localeCompare(b.placement.id));
  const buildings: CityBlockPlacement[] = [], apartments: CityBlockPlacement[] = [];
  const counts = { buildings: [0, 0, 0, 0], apartments: [0, 0] };
  for (const { placement } of candidates) {
    const kind = placement.kind === 'building' ? 'buildings' : 'apartments';
    if (counts[kind][placement.variant]! >= CITY_BLOCK_CAPACITIES[kind][placement.variant]!) continue;
    counts[kind][placement.variant]!++; (kind === 'buildings' ? buildings : apartments).push(placement);
  }
  const order = (a: CityBlockPlacement, b: CityBlockPlacement) => a.id.localeCompare(b.id);
  buildings.sort(order); apartments.sort(order); return { buildings, apartments };
}

/** Include the new plots when rejecting forest/understory roots near buildings. */
export function cityBlocksPlantingClear(layout: CityBlockLayout, x: number, z: number, radius: number): boolean {
  const grid = layoutIndices.get(layout);
  const reach = radius + .4;
  const bounds = { minX: x - reach, maxX: x + reach, minZ: z - reach, maxZ: z + reach };
  return (grid?.query(bounds) ?? layout.placements.map(p => p.footprint)).every(f => {
    const point = local({ x, z }, f);
    return Math.hypot(Math.max(0, Math.abs(point.x) - f.halfX), Math.max(0, Math.abs(point.z) - f.halfZ)) >= reach;
  });
}
