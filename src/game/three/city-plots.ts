import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CityBlockLayout, CityBlockPlacement, CityBlockTemplates, CityBlockWindow } from './city-blocks';
import type { StreetscapeFootprint, StreetscapeLayout, StreetscapePose } from './streetscape';

type Point = { readonly x: number; readonly z: number };
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type GroundSample = (x: number, z: number) => number | null;
interface Segment { a: Point; b: Point; radius: number }
export interface CityPlotSolid {
  readonly role: 'stone' | 'coping';
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly heading: number;
}
export interface CityPlot {
  readonly id: string; readonly buildingId: string; readonly p: number;
  readonly court: StreetscapeFootprint;
  /** Centerline from the existing paved frontage to the open court gate. */
  readonly access: readonly Point[];
  readonly accessLength: number;
  /** Ground-following top and shallow solid edge triangles, in world metres. */
  readonly paving: readonly number[];
  readonly solids: readonly CityPlotSolid[];
}
export interface CityPlotLayout {
  readonly course: CityBlockLayout['course']; readonly plots: readonly CityPlot[];
  readonly stats: { readonly candidates: number; readonly accepted: number; readonly rejected: number;
    readonly accessMetres: number; readonly gates: number; readonly searchExpansions: number };
}
export interface CityPlotMaterials { readonly paving: THREE.Material; readonly stone: THREE.Material; readonly coping: THREE.Material }
const mod = (n: number, length: number) => (n % length + length) % length;
const PATH_HALF = .9, WALK_CLEARANCE = 1.32, CELL = 2;
const plotIndices = new WeakMap<CityPlotLayout, Grid<StreetscapeFootprint>>();

class Grid<T> {
  private readonly cells = new Map<string, T[]>();
  private keys(b: Bounds, fn: (key: string) => void): void {
    for (let x = Math.floor(b.minX / 32); x <= Math.floor(b.maxX / 32); x++)
      for (let z = Math.floor(b.minZ / 32); z <= Math.floor(b.maxZ / 32); z++) fn(`${x}:${z}`);
  }
  add(item: T, bounds: Bounds): void { this.keys(bounds, key => { const items = this.cells.get(key) ?? []; items.push(item); this.cells.set(key, items); }); }
  query(bounds: Bounds): T[] { const result = new Set<T>(); this.keys(bounds, key => { for (const item of this.cells.get(key) ?? []) result.add(item); }); return [...result]; }
}
function box(f: StreetscapeFootprint, margin = 0): Bounds {
  const c = Math.abs(Math.cos(f.heading)), s = Math.abs(Math.sin(f.heading));
  const x = c * f.halfX + s * f.halfZ + margin, z = s * f.halfX + c * f.halfZ + margin;
  return { minX: f.x - x, maxX: f.x + x, minZ: f.z - z, maxZ: f.z + z };
}
function segmentBox(s: Segment): Bounds {
  return { minX: Math.min(s.a.x, s.b.x) - s.radius, maxX: Math.max(s.a.x, s.b.x) + s.radius,
    minZ: Math.min(s.a.z, s.b.z) - s.radius, maxZ: Math.max(s.a.z, s.b.z) + s.radius };
}
function local(p: Point, f: StreetscapeFootprint): Point {
  const x = p.x - f.x, z = p.z - f.z, c = Math.cos(f.heading), s = Math.sin(f.heading);
  return { x: c * x - s * z, z: s * x + c * z };
}
function fromLocal(f: StreetscapeFootprint, x: number, z: number): Point {
  return { x: f.x + Math.cos(f.heading) * x + Math.sin(f.heading) * z,
    z: f.z - Math.sin(f.heading) * x + Math.cos(f.heading) * z };
}
function pointDistance(p: Point, f: StreetscapeFootprint): number {
  const q = local(p, f); return Math.hypot(Math.max(0, Math.abs(q.x) - f.halfX), Math.max(0, Math.abs(q.z) - f.halfZ));
}
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
function overlaps(a: StreetscapeFootprint, b: StreetscapeFootprint, margin = 0): boolean {
  return [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2].every(angle => {
    const x = Math.cos(angle), z = -Math.sin(angle);
    const radius = (f: StreetscapeFootprint) => Math.abs(x * Math.cos(f.heading) - z * Math.sin(f.heading)) * f.halfX
      + Math.abs(x * Math.sin(f.heading) + z * Math.cos(f.heading)) * f.halfZ;
    return Math.abs((b.x - a.x) * x + (b.z - a.z) * z) < radius(a) + radius(b) + margin;
  });
}
function lineHitsBox(a: Point, b: Point, halfX: number, halfZ: number): boolean {
  let low = 0, high = 1;
  for (const [start, delta, half] of [[a.x, b.x - a.x, halfX], [a.z, b.z - a.z, halfZ]]) {
    if (Math.abs(delta!) < 1e-9) { if (Math.abs(start!) > half!) return false; continue; }
    const near = (-half! - start!) / delta!, far = (half! - start!) / delta!;
    low = Math.max(low, Math.min(near, far)); high = Math.min(high, Math.max(near, far)); if (low > high) return false;
  }
  return true;
}
function poseAt(course: CityBlockLayout['course'], value: number): StreetscapePose {
  const p = course.circuit ? mod(value, course.length) : value, poses = course.poses;
  let lo = 0, hi = poses.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (poses[mid]!.p <= p) lo = mid; else hi = mid; }
  const a = poses[lo]!, b = poses[hi]!, t = Math.max(0, Math.min(1, (p - a.p) / (b.p - a.p || 1)));
  return { p, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, width: a.width + (b.width - a.width) * t,
    heading: a.heading + Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading)) * t };
}
function lateral(p: StreetscapePose, side: number, clearance: number): Point {
  return { x: p.x + Math.cos(p.heading) * side * (p.width + clearance), z: p.z - Math.sin(p.heading) * side * (p.width + clearance) };
}
function corridor(a: Point, b: Point, half: number): StreetscapeFootprint {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, halfX: half,
    halfZ: Math.hypot(b.x - a.x, b.z - a.z) / 2, heading: Math.atan2(b.x - a.x, b.z - a.z) };
}

/** Pure once-per-course paths. The obstruction model includes all completed
 * architecture, native road/curb/guardrail corridors and the EXACT existing
 * retaining-wall runs. No native surface or collision data is changed.
 */
export function createCityPlots(city: CityBlockLayout, frontages: StreetscapeLayout, templates: CityBlockTemplates,
  options: { readonly groundHeightAt: GroundSample }): CityPlotLayout {
  const plots: CityPlot[] = [], stats = { candidates: 0, accepted: 0, rejected: 0, accessMetres: 0, gates: 0, searchExpansions: 0 };
  const result: CityPlotLayout = { course: city.course, plots, stats }, planting = new Grid<StreetscapeFootprint>();
  plotIndices.set(result, planting);
  if (city.course.style !== 3) return result;
  const buildings = new Grid<StreetscapeFootprint>(), barriers = new Grid<Segment>();
  const sample = options.groundHeightAt, course = city.course;
  const addBuilding = (f: StreetscapeFootprint) => buildings.add(f, box(f));
  for (const p of city.placements) addBuilding(p.footprint);
  for (const p of [...frontages.buildings, ...frontages.apartments]) {
    const at = poseAt(course, p.p), origin = lateral(at, p.side, p.clearance), heading = at.heading + p.side * Math.PI / 2 + p.yaw;
    const b = (p.kind === 'building' ? templates.buildings : templates.apartments)[p.variant]!;
    const frame: StreetscapeFootprint = { ...origin, heading, halfX: 0, halfZ: 0 };
    const center = fromLocal(frame, (b.minX + b.maxX) * p.scale[0] / 2, (b.minZ + b.maxZ) * p.scale[2] / 2);
    addBuilding({ ...center, heading, halfX: (b.maxX - b.minX) * p.scale[0] / 2 + .25,
      halfZ: (b.maxZ - b.minZ) * p.scale[2] / 2 + .25 });
  }
  const anchors: { point: Point; p: number; side: number }[] = [];
  for (let i = 1; i < course.poses.length; i++) {
    const a = course.poses[i - 1]!, b = course.poses[i]!;
    const road = { a, b, radius: Math.max(a.width, b.width) + 3.1 }; barriers.add(road, segmentBox(road));
    for (const side of [-1, 1]) {
      if (Math.floor(a.p / 24) % 5 !== 0) {
        // Includes the 13.52–14.13 m coping overhang in infrastructure.ts.
        const wall = { a: lateral(a, side, 13.825), b: lateral(b, side, 13.825), radius: .36 };
        barriers.add(wall, segmentBox(wall));
      } else anchors.push({ point: lateral(a, side, 8.3), p: a.p, side });
    }
  }
  const clearRect = (f: StreetscapeFootprint, margin = .1): boolean =>
    !buildings.query(box(f, margin)).some(other => overlaps(f, other, margin))
    && !barriers.query(box(f)).some(s => lineHitsBox(local(s.a, f), local(s.b, f), f.halfX + s.radius, f.halfZ + s.radius));
  const clearPoint = (p: Point, radius = WALK_CLEARANCE): boolean => {
    const area = { minX: p.x - radius, maxX: p.x + radius, minZ: p.z - radius, maxZ: p.z + radius };
    return !buildings.query(area).some(f => pointDistance(p, f) < radius)
      && !barriers.query(area).some(s => segmentDistance(p, s.a, s.b) < radius + s.radius);
  };
  let routingCourt: StreetscapeFootprint | undefined;
  const clearLine = (a: Point, b: Point, half = WALK_CLEARANCE): boolean => {
    if (routingCourt && (overlaps(corridor(a, b, half), routingCourt)
      || pointDistance(a, routingCourt) < half || pointDistance(b, routingCourt) < half)) return false;
    if (!clearRect(corridor(a, b, half), 0) || !clearPoint(a, half) || !clearPoint(b, half)) return false;
    const length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(length));
    let last: number | null = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, y = sample(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (y === null || !Number.isFinite(y) || last !== null && Math.abs(y - last) > length / steps * .11 + .015) return false;
      last = y;
    }
    return true;
  };
  // The world grid and passability cache are shared across all plot searches.
  // Each search has a fixed expansion bound; no frame-time pathfinding occurs.
  const passable = new Map<string, boolean>();
  const gridPoint = (x: number, z: number): Point => ({ x: x * CELL, z: z * CELL });
  const allowed = (x: number, z: number): boolean => {
    const key = `${x}:${z}`; let value = passable.get(key);
    if (value === undefined) { const p = gridPoint(x, z), y = sample(p.x, p.z); value = y !== null && Number.isFinite(y) && clearPoint(p); passable.set(key, value); }
    return value;
  };
  const walkableAnchors = anchors.flatMap(a => {
    const x = Math.round(a.point.x / CELL), z = Math.round(a.point.z / CELL), point = gridPoint(x, z);
    return allowed(x, z) && clearLine(a.point, point) ? [{ ...a, point }] : [];
  });
  const findAccess = (start: Point, placement: CityBlockPlacement): Point[] | null => {
    const targets = walkableAnchors.filter(a => a.side === placement.side && Math.hypot(a.point.x - start.x, a.point.z - start.z) < 108)
      .sort((a, b) => Math.hypot(a.point.x - start.x, a.point.z - start.z) - Math.hypot(b.point.x - start.x, b.point.z - start.z)).slice(0, 8);
    if (!targets.length) return null;
    const direct = targets.find(t => clearLine(start, t.point)); if (direct) return [start, direct.point];
    const sx = Math.round(start.x / CELL), sz = Math.round(start.z / CELL);
    const starts = [-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dz => ({ x: sx + dx, z: sz + dz })))
      .filter(p => allowed(p.x, p.z) && clearLine(start, gridPoint(p.x, p.z)))
      .sort((a, b) => Math.hypot(a.x * CELL - start.x, a.z * CELL - start.z) - Math.hypot(b.x * CELL - start.x, b.z * CELL - start.z));
    if (!starts.length) return null;
    type Node = { x: number; z: number; g: number; score: number; parent?: Node };
    const targetKeys = new Set(targets.map(t => `${Math.round(t.point.x / CELL)}:${Math.round(t.point.z / CELL)}`));
    const heuristic = (p: Point) => Math.min(...targets.map(t => Math.hypot(t.point.x - p.x * CELL, t.point.z - p.z * CELL)));
    const first = starts[0]!, open: Node[] = [{ ...first, g: 0, score: heuristic(first) }], best = new Map<string, number>();
    let expansions = 0;
    while (open.length && expansions++ < 2400) {
      let nearest = 0; for (let i = 1; i < open.length; i++) if (open[i]!.score < open[nearest]!.score) nearest = i;
      const node = open.splice(nearest, 1)[0]!, key = `${node.x}:${node.z}`;
      if (node.g > (best.get(key) ?? Infinity)) continue;
      if (targetKeys.has(key)) {
        stats.searchExpansions += expansions;
        const path: Point[] = []; for (let n: Node | undefined = node; n; n = n.parent) path.push(gridPoint(n.x, n.z));
        path.reverse(); path.unshift(start);
        // Remove grid stair steps using full-width collision-checked sightlines.
        const smooth = [path[0]!]; let i = 0;
        while (i < path.length - 1) { let end = path.length - 1; while (end > i + 1 && !clearLine(path[i]!, path[end]!)) end--; smooth.push(path[end]!); i = end; }
        return smooth;
      }
      for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
        if (!dx && !dz) continue;
        const x = node.x + dx, z = node.z + dz, g = node.g + Math.hypot(dx, dz) * CELL, nextKey = `${x}:${z}`;
        if (g > 130 || g >= (best.get(nextKey) ?? Infinity) || !allowed(x, z)
          || !clearLine(gridPoint(node.x, node.z), gridPoint(x, z))) continue;
        best.set(nextKey, g); open.push({ x, z, g, score: g + heuristic({ x, z }), parent: node });
      }
    }
    stats.searchExpansions += expansions; return null;
  };
  // One access court per existing side/block prevents a repeated pavement/wall
  // strip. A failed house route may fall back to another accepted plot there.
  const usedBlocks = new Set<string>();
  for (const p of city.placements) {
    const block = p.id.split('/secondary/')[0]!; if (usedBlocks.has(block)) continue;
    stats.candidates++;
    const f = p.footprint, depth = p.kind === 'apartment' ? 3.6 : 2.8;
    const court: StreetscapeFootprint = { ...fromLocal(f, 0, -f.halfZ - .16 - depth / 2), heading: f.heading,
      halfX: Math.min(f.halfX - .4, p.kind === 'apartment' ? 4.2 : 3.3), halfZ: depth / 2 };
    if (court.halfX < 2 || !clearRect(court)) { stats.rejected++; continue; }
    const gate = fromLocal(court, 0, -court.halfZ), lead = fromLocal(court, 0, -court.halfZ - 2.5);
    // The last 2.5 m stays normal to the gate and outside all building bounds.
    if (!clearLine(gate, lead, PATH_HALF + .08)) { stats.rejected++; continue; }
    routingCourt = court;
    const route = findAccess(lead, p);
    routingCourt = undefined;
    if (!route) { stats.rejected++; continue; }
    const access = [...route].reverse(); access.push(gate);
    const accessLength = access.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - access[i]!.x, point.z - access[i]!.z), 0);
    if (accessLength > 130) { stats.rejected++; continue; }
    const paving = surfaceTriangles(court, access, sample);
    if (!paving) { stats.rejected++; continue; }
    // New courts and access strips may meet existing paving, but never another
    // plot ribbon at a different triangulation/height (no overlapping decals).
    const strips = access.slice(1).map((end, i) => corridor(access[i]!, end, PATH_HALF + .12));
    if ([court, ...strips].some(area => planting.query(box(area, .15)).some(other => overlaps(area, other, .15)))) { stats.rejected++; continue; }
    const index = Number(block.split(':')[1]), solids = index % 3 === 0 ? gateSolids(court, sample) : [];
    const plot: CityPlot = { id: `${p.id}/court`, buildingId: p.id, p: p.p, court, access, accessLength, paving, solids };
    plots.push(plot); usedBlocks.add(block); stats.accepted++; stats.accessMetres += accessLength; if (solids.length) stats.gates++;
    for (const area of [court, ...strips]) planting.add(area, box(area));
  }
  return result;
}

function surfaceTriangles(court: StreetscapeFootprint, path: readonly Point[], sample: GroundSample): number[] | null {
  const triangles: number[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => triangles.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  const patch = (rows: Point[][]): boolean => {
    const points: THREE.Vector3[][] = [];
    for (const row of rows) {
      const vertices: THREE.Vector3[] = [];
      for (const point of row) { const y = sample(point.x, point.z); if (y === null || !Number.isFinite(y)) return false; vertices.push(new THREE.Vector3(point.x, y + .024, point.z)); }
      points.push(vertices);
    }
    const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): boolean => {
      const center = a.clone().add(b).add(c).multiplyScalar(1 / 3), y = sample(center.x, center.z);
      if (y === null || Math.abs(center.y - .024 - y) > .012) return false;
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      if (Math.abs(normal.y) < 1e-7 || Math.hypot(normal.x, normal.z) / Math.abs(normal.y) > .14) return false;
      if (normal.y > 0) push(a, b, c); else push(a, c, b); return true;
    };
    for (let r = 1; r < points.length; r++) for (let c = 1; c < points[r]!.length; c++) {
      const a = points[r - 1]![c - 1]!, b = points[r - 1]![c]!, d = points[r]![c - 1]!, e = points[r]![c]!;
      if (!face(a, b, e) || !face(a, e, d)) return false;
    }
    // Fifty-five millimetre paving thickness has real edge faces, embedded in
    // the unchanged ground. Surface UVs remain in world metres across patches.
    const boundary = [...points[0]!, ...points.slice(1).map(row => row.at(-1)!),
      ...points.at(-1)!.slice(0, -1).reverse(), ...points.slice(1, -1).reverse().map(row => row[0]!)];
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i]!, b = boundary[(i + 1) % boundary.length]!, c = b.clone().add(new THREE.Vector3(0, -.055, 0)), d = a.clone().add(new THREE.Vector3(0, -.055, 0));
      push(a, b, c); push(a, c, d);
    }
    return true;
  };
  const nx = Math.ceil(court.halfX * 2), nz = Math.ceil(court.halfZ * 2);
  if (!patch(Array.from({ length: nz + 1 }, (_, z) => Array.from({ length: nx + 1 }, (_, x) =>
    fromLocal(court, (x / nx * 2 - 1) * court.halfX, (z / nz * 2 - 1) * court.halfZ))))) return null;
  const rows: Point[][] = [];
  const direction = (a: Point, b: Point) => { const length = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: (b.x - a.x) / length, z: (b.z - a.z) / length }; };
  for (let i = 0; i < path.length; i++) {
    const previous = direction(path[Math.max(0, i - 1)]!, path[Math.max(1, i)]!);
    const next = direction(path[Math.min(i, path.length - 2)]!, path[Math.min(path.length - 1, i + 1)]!);
    const sum = { x: previous.z + next.z, z: -previous.x - next.x }, length = Math.hypot(sum.x, sum.z) || 1;
    const normal = { x: sum.x / length, z: sum.z / length };
    const factor = Math.min(1.42, 1 / Math.max(.1, normal.x * next.z - normal.z * next.x));
    const row = [-1, 0, 1].map(side => ({ x: path[i]!.x + normal.x * PATH_HALF * factor * side, z: path[i]!.z + normal.z * PATH_HALF * factor * side }));
    if (i) {
      const start = rows.at(-1)!, steps = Math.ceil(Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z));
      for (let step = 1; step < steps; step++) rows.push(row.map((point, c) => ({ x: start[c]!.x + (point.x - start[c]!.x) * step / steps,
        z: start[c]!.z + (point.z - start[c]!.z) * step / steps })));
    }
    rows.push(row);
  }
  return patch(rows) ? triangles : null;
}

function gateSolids(court: StreetscapeFootprint, sample: GroundSample): CityPlotSolid[] {
  const result: CityPlotSolid[] = [], gateHalf = 1.2, pier = .32, wing = court.halfX - gateHalf - pier;
  const add = (x: number, width: number, height: number, depth: number): boolean => {
    const center = fromLocal(court, x, -court.halfZ + .05), footprint = { ...center, heading: court.heading, halfX: width / 2, halfZ: depth / 2 };
    const heights = [-1, 0, 1].flatMap(a => [-1, 1].map(b => fromLocal(footprint, a * footprint.halfX, b * footprint.halfZ)))
      .map(p => sample(p.x, p.z));
    if (heights.some(y => y === null || !Number.isFinite(y))) return false;
    const min = Math.min(...heights as number[]), max = Math.max(...heights as number[]); if (max - min > .14) return false;
    result.push({ role: 'stone', position: [center.x, min - .04 + height / 2, center.z], size: [width, height, depth], heading: court.heading });
    result.push({ role: 'coping', position: [center.x, min - .04 + height + .04, center.z], size: [width + .08, .08, depth + .08], heading: court.heading });
    return true;
  };
  for (const side of [-1, 1]) {
    if (!add(side * (gateHalf + pier / 2), pier, .84, .32)
      || !add(side * (gateHalf + pier + wing / 2), wing, .58, .24)) return [];
  }
  return result;
}

/** Additional planting exclusion, used together with cityBlocksPlantingClear. */
export function cityPlotsPlantingClear(layout: CityPlotLayout, x: number, z: number, radius: number): boolean {
  const reach = radius + .25;
  return (plotIndices.get(layout)?.query({ minX: x - reach, maxX: x + reach, minZ: z - reach, maxZ: z + reach }) ?? [])
    .every(f => pointDistance({ x, z }, f) >= reach);
}

function plotGeometries(plot: CityPlot): THREE.BufferGeometry[] {
  const paving = new THREE.BufferGeometry(), uv: number[] = [];
  for (let i = 0; i < plot.paving.length; i += 3) uv.push(plot.paving[i]! / 2.1, plot.paving[i + 2]! / 2.1);
  paving.setAttribute('position', new THREE.Float32BufferAttribute(plot.paving, 3)); paving.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); paving.computeVertexNormals();
  const result = [paving];
  for (const role of ['stone', 'coping'] as const) {
    const parts = plot.solids.filter(s => s.role === role).map(solid => {
      const [width, height, depth] = solid.size;
      let g: THREE.BufferGeometry;
      if (role === 'coping') {
        const shape = new THREE.Shape().moveTo(-depth / 2 + .012, -height / 2).lineTo(depth / 2 - .012, -height / 2)
          .lineTo(depth / 2, -height / 2 + .012).lineTo(depth / 2, height / 2 - .012).lineTo(depth / 2 - .012, height / 2)
          .lineTo(-depth / 2 + .012, height / 2).lineTo(-depth / 2, height / 2 - .012).lineTo(-depth / 2, -height / 2 + .012).closePath();
        g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false }); g.translate(0, 0, -width / 2); g.rotateY(Math.PI / 2);
      } else g = new THREE.BoxGeometry(width, height, depth).toNonIndexed();
      const position = g.getAttribute('position'), normal = g.getAttribute('normal'), uv = g.getAttribute('uv');
      const meters = role === 'coping' ? 1 : 2.4;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        const side = Math.abs(normal.getX(i)) > .5, top = Math.abs(normal.getY(i)) > .5;
        uv.setXY(i, (side ? z : x) / meters, (top ? z : y) / meters);
      }
      g.rotateY(solid.heading); g.translate(...solid.position); return g;
    });
    const merged = parts.length ? mergeGeometries(parts) : null; parts.forEach(g => g.dispose());
    result.push(merged ?? new THREE.BufferGeometry());
  }
  return result;
}

/** Three visible material batches, re-merged only when selected source IDs
 * change. Caller owns the existing scanned materials and all their textures.
 */
export class CityPlotBatch {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.Mesh[];
  private readonly cache = new Map<CityPlot, THREE.BufferGeometry[]>();
  private layout?: CityPlotLayout;
  private signature = '';
  private disposed = false;
  constructor(materials: CityPlotMaterials) {
    this.group.name = 'SORA city access courts and garden gates';
    this.group.userData.cityPlotStats = { visiblePlots: 0, accessMetres: 0, triangles: 0, meshBatches: 0, ids: [] };
    this.meshes = [materials.paving, materials.stone, materials.coping].map((material, index) => {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material); mesh.visible = false; mesh.name = ['City access paving', 'City gate masonry', 'City gate coping'][index]!;
      mesh.castShadow = index > 0; mesh.receiveShadow = true; this.group.add(mesh); return mesh;
    });
  }
  setPlots(layout: CityPlotLayout | null, window: CityBlockWindow): void {
    if (this.disposed) throw new Error('Cannot update disposed city plot geometry.');
    const ids = new Set([...window.buildings, ...window.apartments].map(p => p.id));
    const selected = layout?.plots.filter(p => ids.has(p.buildingId)) ?? [];
    if (selected.length > 36) throw new Error('City plot window exceeds the architecture instance budget.');
    const signature = selected.map(p => p.id).sort().join('|');
    const nextLayout = layout ?? undefined;
    if (nextLayout === this.layout && signature === this.signature) return;
    if (nextLayout !== this.layout) { for (const parts of this.cache.values()) parts.forEach(g => g.dispose()); this.cache.clear(); }
    this.layout = nextLayout; this.signature = signature;
    const geometries = selected.map(plot => { let parts = this.cache.get(plot); if (!parts) { parts = plotGeometries(plot); this.cache.set(plot, parts); } return parts; });
    let triangles = 0;
    this.meshes.forEach((mesh, index) => {
      const parts = geometries.map(g => g[index]!).filter(g => g.hasAttribute('position'));
      const merged = parts.length ? mergeGeometries(parts) : null;
      mesh.geometry.dispose(); mesh.geometry = merged ?? new THREE.BufferGeometry(); mesh.visible = !!merged;
      if (merged) { merged.computeBoundingBox(); merged.computeBoundingSphere(); triangles += merged.getAttribute('position').count / 3; }
    });
    this.group.userData.cityPlotStats = { visiblePlots: selected.length, accessMetres: selected.reduce((sum, p) => sum + p.accessLength, 0),
      triangles, meshBatches: this.meshes.filter(m => m.visible).length, ids: selected.map(p => p.id) };
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const parts of this.cache.values()) parts.forEach(g => g.dispose()); this.cache.clear();
    this.meshes.forEach(m => m.geometry.dispose()); this.group.clear();
  }
}
