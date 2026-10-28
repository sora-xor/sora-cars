import * as THREE from 'three';
import { scannedSurface } from './surfaces';

export interface UrbanGroundPose { x: number; y: number; z: number; heading: number; width: number; p: number }
type Point = { x: number; z: number };
type Line = { a: number; b: number; c: number };
type Cut = { lines: Line[]; minX: number; maxX: number; minZ: number; maxZ: number };
type Segment = { a: UrbanGroundPose; b: UrbanGroundPose; dx: number; dz: number; length2: number };

const GRID = 8;
const CHUNK = 256;
const EXTENT = 110;
// A small margin lives beneath the existing 1.65 m shoulder. It also separates
// float32 ground vertices from the exact road boundary after GPU upload.
const ROAD_MARGIN = 0.08;
const HEIGHT_OFFSET = -0.08;
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const area2 = (p: readonly Point[]) => p.slice(1, -1).reduce((sum, a, i) => sum + cross(p[0]!, a, p[i + 2]!), 0);
const distance = (line: Line, p: Point) => line.a * p.x + line.b * p.z + line.c;

function split(polygon: readonly Point[], line: Line): [Point[], Point[]] {
  const inside: Point[] = [], outside: Point[] = [];
  let a = polygon.at(-1)!, da = distance(line, a);
  for (const b of polygon) {
    const db = distance(line, b);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db), intersection = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      inside.push(intersection); outside.push(intersection);
    }
    (db >= 0 ? inside : outside).push(b);
    a = b; da = db;
  }
  return [inside, outside];
}

/** Subtract one convex road triangle. Each emitted fragment is still convex;
 * successive cuts therefore compute the union of all excluded road footprints,
 * including overlapping corners, hairpins, and crossings at different heights.
 */
function subtract(polygon: Point[], cut: Cut): Point[][] {
  if (cut.lines.some(line => polygon.every(p => distance(line, p) <= 0))) return [polygon];
  const fragments: Point[][] = [];
  let remaining = polygon;
  for (const line of cut.lines) {
    const [inside, outside] = split(remaining, line);
    if (outside.length >= 3 && Math.abs(area2(outside)) > 1e-8) fragments.push(outside);
    remaining = inside;
    if (remaining.length < 3) break;
  }
  return fragments;
}

function roadCut(points: Point[]): Cut | null {
  if (Math.abs(area2(points)) < 1e-8) return null;
  // Minkowski sum with an 8 cm square. A convex hull gives a bounded buffer
  // even for nearly degenerate road triangles; offset-line miters could stretch
  // arbitrarily far at an acute bend.
  const cloud = points.flatMap(p => [-ROAD_MARGIN, ROAD_MARGIN].flatMap(dx =>
    [-ROAD_MARGIN, ROAD_MARGIN].map(dz => ({ x: p.x + dx, z: p.z + dz })))).sort((a, b) => a.x - b.x || a.z - b.z);
  const half = (values: Point[]): Point[] => {
    const hull: Point[] = [];
    for (const p of values) {
      while (hull.length > 1 && cross(hull.at(-2)!, hull.at(-1)!, p) <= 0) hull.pop();
      hull.push(p);
    }
    hull.pop(); return hull;
  };
  const expanded = [...half(cloud), ...half([...cloud].reverse())];
  const lines = expanded.map((a, i): Line => {
    const b = expanded[(i + 1) % expanded.length]!, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    return { a: -dz / length, b: dx / length, c: (dz * a.x - dx * a.z) / length };
  });
  return { lines, minX: cloud[0]!.x, maxX: cloud.at(-1)!.x,
    minZ: Math.min(...cloud.map(p => p.z)), maxZ: Math.max(...cloud.map(p => p.z)) };
}

class SpatialIndex<T> {
  private readonly cells = new Map<string, T[]>();
  constructor(private readonly size: number) {}
  add(value: T, minX: number, maxX: number, minZ: number, maxZ: number): void {
    for (let x = Math.floor(minX / this.size); x <= Math.floor(maxX / this.size); x++)
      for (let z = Math.floor(minZ / this.size); z <= Math.floor(maxZ / this.size); z++) {
        const key = `${x}:${z}`, items = this.cells.get(key);
        if (items) items.push(value); else this.cells.set(key, [value]);
      }
  }
  at(x: number, z: number): readonly T[] { return this.cells.get(`${Math.floor(x / this.size)}:${Math.floor(z / this.size)}`) ?? []; }
  box(minX: number, maxX: number, minZ: number, maxZ: number): T[] {
    const result = new Set<T>();
    for (let x = Math.floor(minX / this.size); x <= Math.floor(maxX / this.size); x++)
      for (let z = Math.floor(minZ / this.size); z <= Math.floor(maxZ / this.size); z++)
        for (const value of this.cells.get(`${x}:${z}`) ?? []) result.add(value);
    return [...result];
  }
}

/** World-space urban ground with the native pavement footprint removed.
 * Unlike a wide route ribbon, the ground cannot fold back over a sharp bend.
 * Its XZ polygons exclude every road triangle regardless of road elevation;
 * lowering the ground or relying on depth bias is not the protection mechanism.
 * The optional material lets the caller retain its shared scanned ground setup.
 */
export function createUrbanGround(poses: readonly UrbanGroundPose[], material?: THREE.Material): THREE.Group {
  const group = new THREE.Group(); group.name = 'Urban ground outside native pavement';
  group.userData.urbanGround = 'road-footprint-excluded-v1';
  if (poses.length < 2) return group;
  if (poses.some(p => ![p.x, p.y, p.z, p.heading, p.width, p.p].every(Number.isFinite) || p.width <= 0)) {
    throw new Error('Urban ground requires finite native route poses with positive road widths.');
  }
  const cuts = new SpatialIndex<Cut>(32), segments = new SpatialIndex<Segment>(64);
  let cutCount = 0;
  const edge = (pose: UrbanGroundPose, sign: number): Point => ({ x: pose.x + Math.cos(pose.heading) * pose.width * sign,
    z: pose.z - Math.sin(pose.heading) * pose.width * sign });
  for (let i = 0; i < poses.length - 1; i++) {
    const a = poses[i]!, b = poses[i + 1]!, dx = b.x - a.x, dz = b.z - a.z;
    const segment = { a, b, dx, dz, length2: dx * dx + dz * dz };
    if (segment.length2 > 1e-10) segments.add(segment, Math.min(a.x, b.x) - EXTENT - 16, Math.max(a.x, b.x) + EXTENT + 16,
      Math.min(a.z, b.z) - EXTENT - 16, Math.max(a.z, b.z) + EXTENT + 16);
    // These are exactly the two triangles emitted for the native asphalt by
    // world.ts, rather than an approximation using a centerline distance test.
    const corners = [edge(a, -1), edge(a, 1), edge(b, 1), edge(b, -1)];
    for (const indices of [[0, 2, 1], [0, 3, 2]]) {
      const cut = roadCut(indices.map(index => corners[index]!));
      if (cut) { cuts.add(cut, cut.minX, cut.maxX, cut.minZ, cut.maxZ); cutCount++; }
    }
  }

  const sampleGround = (x: number, z: number): { y: number; distance: number } => {
    const samples: { distance: number; y: number }[] = [];
    let nearest = Infinity;
    for (const segment of segments.at(x, z)) {
      const t = THREE.MathUtils.clamp(((x - segment.a.x) * segment.dx + (z - segment.a.z) * segment.dz) / segment.length2, 0, 1);
      const distance = Math.hypot(x - segment.a.x - t * segment.dx, z - segment.a.z - t * segment.dz);
      samples.push({ distance, y: segment.a.y + (segment.b.y - segment.a.y) * t }); nearest = Math.min(nearest, distance);
    }
    // A compact blend of neighboring route grades avoids abrupt Voronoi ridges
    // between streets while keeping nearby building foundations at local grade.
    let weightedHeight = 0, weights = 0;
    for (const sample of samples) {
      const support = Math.max(0, 1 - (sample.distance - nearest) / 12);
      const weight = support ** 3 / Math.max(4, sample.distance * sample.distance);
      weightedHeight += sample.y * weight; weights += weight;
    }
    return { y: (weights ? weightedHeight / weights : poses[0]!.y) + HEIGHT_OFFSET, distance: nearest };
  };

  const minX = Math.floor((Math.min(...poses.map(p => p.x)) - EXTENT) / GRID) * GRID;
  const maxX = Math.ceil((Math.max(...poses.map(p => p.x)) + EXTENT) / GRID) * GRID;
  const minZ = Math.floor((Math.min(...poses.map(p => p.z)) - EXTENT) / GRID) * GRID;
  const maxZ = Math.ceil((Math.max(...poses.map(p => p.z)) + EXTENT) / GRID) * GRID;
  const positions: number[] = [], normals: number[] = [], roadDistances: number[] = [];
  const vertices = new Map<string, number>(), batches = new Map<string, number[]>();
  const vertex = (p: Point): number => {
    const key = `${p.x.toFixed(6)}:${p.z.toFixed(6)}`, existing = vertices.get(key);
    if (existing !== undefined) return existing;
    const index = positions.length / 3; vertices.set(key, index);
    const sample = sampleGround(p.x, p.z);
    positions.push(p.x, sample.y, p.z); normals.push(0, 0, 0); roadDistances.push(sample.distance); return index;
  };
  for (let x = minX; x < maxX; x += GRID) for (let z = minZ; z < maxZ; z += GRID) {
    if (sampleGround(x + GRID / 2, z + GRID / 2).distance > EXTENT) continue;
    let fragments: Point[][] = [[{ x, z }, { x: x + GRID, z }, { x: x + GRID, z: z + GRID }, { x, z: z + GRID }]];
    for (const cut of cuts.box(x, x + GRID, z, z + GRID)) {
      if (cut.minX > x + GRID || cut.maxX < x || cut.minZ > z + GRID || cut.maxZ < z) continue;
      fragments = fragments.flatMap(polygon => subtract(polygon, cut));
      if (!fragments.length) break;
    }
    const key = `${Math.floor(x / CHUNK)}:${Math.floor(z / CHUNK)}`;
    let batch = batches.get(key);
    if (!batch) { batch = []; batches.set(key, batch); }
    for (const polygon of fragments) for (let i = 1; i < polygon.length - 1; i++) {
      const triangle = [polygon[0]!, polygon[i + 1]!, polygon[i]!]; // +Y winding
      if (Math.abs(area2(triangle)) < 1e-8) continue;
      const ids = triangle.map(vertex), a = ids[0]! * 3, b = ids[1]! * 3, c = ids[2]! * 3;
      const abx = positions[b]! - positions[a]!, aby = positions[b + 1]! - positions[a + 1]!, abz = positions[b + 2]! - positions[a + 2]!;
      const acx = positions[c]! - positions[a]!, acy = positions[c + 1]! - positions[a + 1]!, acz = positions[c + 2]! - positions[a + 2]!;
      const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
      for (const id of ids) { normals[id * 3]! += nx; normals[id * 3 + 1]! += ny; normals[id * 3 + 2]! += nz; }
      batch.push(...ids);
    }
  }
  const groundMaterial = material ?? new THREE.MeshStandardMaterial({ ...scannedSurface('forest_ground_04'),
    color: '#a9a2a6', normalScale: new THREE.Vector2(0.7, 0.7), roughness: 1 });
  let triangles = 0;
  for (const [key, indices] of batches) {
    if (!indices.length) continue;
    const local = new Map<number, number>(), positionsOut: number[] = [], normalsOut: number[] = [], uvs: number[] = [], distancesOut: number[] = [], indicesOut: number[] = [];
    for (const id of indices) {
      let index = local.get(id);
      if (index === undefined) {
        index = local.size; local.set(id, index);
        const at = id * 3, x = positions[at]!, z = positions[at + 2]!;
        positionsOut.push(x, positions[at + 1]!, z);
        const nx = normals[at]!, ny = normals[at + 1]!, nz = normals[at + 2]!, length = Math.hypot(nx, ny, nz) || 1;
        normalsOut.push(nx / length, ny / length, nz / length);
        uvs.push(x / 3.15, z / 3.15); distancesOut.push(roadDistances[id]!);
      }
      indicesOut.push(index);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setIndex(indicesOut);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionsOut, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalsOut, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    // Presentation-only material mask; all existing geometry and road exclusion stay unchanged.
    geometry.setAttribute('roadDistance', new THREE.Float32BufferAttribute(distancesOut, 1));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, groundMaterial); mesh.name = `Urban ground ${key}`; mesh.receiveShadow = true; group.add(mesh);
    triangles += indicesOut.length / 3;
  }
  group.userData.groundStats = { nativeRoadTrianglesExcluded: cutCount, marginMetres: ROAD_MARGIN, triangles, vertices: positions.length / 3,
    gridMetres: GRID, chunks: group.children.length };
  return group;
}
