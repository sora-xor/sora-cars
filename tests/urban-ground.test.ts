import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedStreetBundle } from './helpers/published-street';
import * as THREE from 'three';
import { createUrbanGround } from '../src/game/three/urban-ground';

interface Pose { x: number; y: number; z: number; heading: number; width: number; p: number }
type Point = { x: number; y: number; z: number };
type Triangle = readonly [Point, Point, Point];
interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
const GRID_METRES = 32;
// Float32 render coordinates can turn an analytically shared edge into a tiny
// polygon. One square millimetre is below any visible intrusion at this scale.
const AREA_EPSILON = 1e-6;

const published = publishedStreetBundle();
const tokyo: Pose[] = published.track.samples.map((s: { progressMm: number; eastMm: number; northMm: number; elevationMm: number; headingMicroturn: number; halfWidthMm: number }) => ({
  p: s.progressMm / 1000, x: -s.eastMm / 1000, z: s.northMm / 1000,
  y: s.elevationMm / 1000, heading: -s.headingMicroturn * Math.PI * 2 / 1e6, width: s.halfWidthMm / 1000,
}));

function pointAt(pose: Pose, lateral: number, up = 0): Point {
  return { x: pose.x + Math.cos(pose.heading) * lateral, y: pose.y + up, z: pose.z - Math.sin(pose.heading) * lateral };
}

// These are the exact corners and diagonal used by world.ts's native ribbon,
// independently reconstructed and rounded as its Float32BufferAttribute is.
function ribbonTriangles(poses: readonly Pose[], halfWidth: (pose: Pose) => number, up = 0): Triangle[] {
  const result: Triangle[] = [];
  for (let i = 0; i + 1 < poses.length; i++) {
    const a = poses[i]!, b = poses[i + 1]!;
    const corners = [pointAt(a, -halfWidth(a), up), pointAt(a, halfWidth(a), up), pointAt(b, halfWidth(b), up), pointAt(b, -halfWidth(b), up)]
      .map(v => ({ x: Math.fround(v.x), y: Math.fround(v.y), z: Math.fround(v.z) }));
    result.push([corners[0]!, corners[2]!, corners[1]!], [corners[0]!, corners[3]!, corners[2]!]);
  }
  return result;
}

function triangleBounds(triangle: Triangle): Bounds {
  return { minX: Math.min(...triangle.map(v => v.x)), maxX: Math.max(...triangle.map(v => v.x)),
    minZ: Math.min(...triangle.map(v => v.z)), maxZ: Math.max(...triangle.map(v => v.z)) };
}

class TriangleGrid {
  readonly bounds: Bounds[];
  private readonly cells = new Map<string, number[]>();
  constructor(readonly triangles: readonly Triangle[]) {
    this.bounds = triangles.map(triangleBounds);
    this.bounds.forEach((bounds, index) => {
      this.visit(bounds, key => { const cell = this.cells.get(key); if (cell) cell.push(index); else this.cells.set(key, [index]); });
    });
  }
  private visit(bounds: Bounds, fn: (key: string) => void): void {
    for (let x = Math.floor(bounds.minX / GRID_METRES); x <= Math.floor(bounds.maxX / GRID_METRES); x++) {
      for (let z = Math.floor(bounds.minZ / GRID_METRES); z <= Math.floor(bounds.maxZ / GRID_METRES); z++) fn(`${x},${z}`);
    }
  }
  candidates(bounds: Bounds): number[] {
    const result = new Set<number>();
    this.visit(bounds, key => { for (const i of this.cells.get(key) ?? []) {
      const candidate = this.bounds[i]!;
      if (candidate.maxX >= bounds.minX && candidate.minX <= bounds.maxX && candidate.maxZ >= bounds.minZ && candidate.minZ <= bounds.maxZ) result.add(i);
    } });
    return [...result];
  }
}

const cross = (a: Point, b: Point, p: Point) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);

// Sutherland–Hodgman intersection in XZ, independent of the production ground
// polygon subtraction. Shared boundaries have zero area and are permitted.
function intersectionArea(subject: Triangle, clip: Triangle): number {
  let polygon: Point[] = [...subject];
  const winding = Math.sign(cross(clip[0], clip[1], clip[2]));
  if (!winding) return 0;
  for (let edge = 0; edge < 3 && polygon.length; edge++) {
    const a = clip[edge]!, b = clip[(edge + 1) % 3]!, output: Point[] = [];
    let previous = polygon.at(-1)!, previousDistance = winding * cross(a, b, previous);
    for (const current of polygon) {
      const distance = winding * cross(a, b, current);
      if ((distance >= 0) !== (previousDistance >= 0)) {
        const t = previousDistance / (previousDistance - distance);
        output.push({ x: previous.x + (current.x - previous.x) * t, y: 0, z: previous.z + (current.z - previous.z) * t });
      }
      if (distance >= 0) output.push(current);
      previous = current; previousDistance = distance;
    }
    polygon = output;
  }
  if (polygon.length < 3) return 0;
  // A fan relative to the first point avoids cancellation at large world coordinates.
  let twiceArea = 0;
  for (let i = 1; i + 1 < polygon.length; i++) twiceArea += cross(polygon[0]!, polygon[i]!, polygon[i + 1]!);
  return Math.abs(twiceArea) / 2;
}

function emittedTriangles(group: THREE.Group): Triangle[] {
  const triangles: Triangle[] = [];
  group.updateWorldMatrix(true, true);
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry, positions = geometry.getAttribute('position');
    const index = geometry.index, count = index ? index.count : positions.count;
    assert.equal(count % 3, 0, 'geometry must contain complete triangles');
    for (let i = 0; i < count; i += 3) {
      const vertices: Point[] = [];
      for (let corner = 0; corner < 3; corner++) {
        const j = index ? index.getX(i + corner) : i + corner;
        assert.ok(Number.isInteger(j) && j >= 0 && j < positions.count, 'indices stay inside the vertex buffer');
        const v = new THREE.Vector3().fromBufferAttribute(positions, j).applyMatrix4(object.matrixWorld);
        vertices.push({ x: v.x, y: v.y, z: v.z });
      }
      triangles.push(vertices as unknown as Triangle);
    }
    for (const attribute of Object.values(geometry.attributes)) {
      for (const value of attribute.array) assert.ok(Number.isFinite(value), 'all emitted attributes are finite');
    }
  });
  return triangles;
}

function assertNoRoadOverlap(ground: readonly Triangle[], road: readonly Triangle[]): void {
  const grid = new TriangleGrid(road);
  let comparisons = 0;
  for (let i = 0; i < ground.length; i++) {
    const bounds = triangleBounds(ground[i]!);
    // Include the tiny safety margin so a perfectly axis-aligned road still
    // exercises the clipping oracle even when adjacent AABBs never overlap.
    const nearby = { minX: bounds.minX - 1, maxX: bounds.maxX + 1, minZ: bounds.minZ - 1, maxZ: bounds.maxZ + 1 };
    for (const j of grid.candidates(nearby)) {
      const overlap = intersectionArea(ground[i]!, road[j]!); comparisons++;
      assert.ok(overlap <= AREA_EPSILON, `ground triangle ${i} covers ${overlap} m² of native road triangle ${j}`);
    }
  }
  assert.ok(comparisons > 0, 'the footprint regression must inspect adjacent ground and road geometry');
}

function rayHits(grid: TriangleGrid, x: number, z: number, top: number): Point[] {
  const ray = new THREE.Ray(new THREE.Vector3(x, top, z), new THREE.Vector3(0, -1, 0));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  const hits: Point[] = [];
  for (const i of grid.candidates({ minX: x, maxX: x, minZ: z, maxZ: z })) {
    const triangle = grid.triangles[i]!;
    a.set(triangle[0].x, triangle[0].y, triangle[0].z);
    b.set(triangle[1].x, triangle[1].y, triangle[1].z);
    c.set(triangle[2].x, triangle[2].y, triangle[2].z);
    if (ray.intersectTriangle(a, b, c, false, hit)) hits.push({ x: hit.x, y: hit.y, z: hit.z });
  }
  return hits;
}

function roadSampleHits(ground: readonly Triangle[], poses: readonly Pose[]): { pose: number; lateral: number; y: number }[] {
  const grid = new TriangleGrid(ground), hits: { pose: number; lateral: number; y: number }[] = [];
  let top = Math.max(...poses.map(pose => pose.y)) + 50;
  for (const triangle of ground) for (const v of triangle) top = Math.max(top, v.y + 50);
  poses.forEach((pose, index) => {
    // Includes both endpoints and every compiled sample, not a sparse screenshot path.
    for (const lateral of [-0.95, 0, 0.95]) {
      const point = pointAt(pose, pose.width * lateral);
      for (const hit of rayHits(grid, point.x, point.z, top)) hits.push({ pose: index, lateral, y: hit.y });
    }
  });
  return hits;
}

function assertBounds(triangles: readonly Triangle[], poses: readonly Pose[]): void {
  assert.ok(triangles.length > 0, 'ground is present');
  assert.ok(triangles.length < 500_000, 'ground has a bounded render budget');
  const area = triangles.reduce((sum, triangle) => sum + Math.abs(cross(triangle[0], triangle[1], triangle[2])) / 2, 0);
  assert.ok(area > 1000, 'the exclusion test must retain substantial visible ground, not empty or collapsed geometry');
  const minX = Math.min(...poses.map(pose => pose.x)) - 140, maxX = Math.max(...poses.map(pose => pose.x)) + 140;
  const minZ = Math.min(...poses.map(pose => pose.z)) - 140, maxZ = Math.max(...poses.map(pose => pose.z)) + 140;
  const minY = Math.min(...poses.map(pose => pose.y)) - 2, maxY = Math.max(...poses.map(pose => pose.y)) + 2;
  for (const triangle of triangles) for (const v of triangle) {
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), 'transformed ground vertices are finite');
    assert.ok(v.x >= minX && v.x <= maxX && v.z >= minZ && v.z <= maxZ, 'ground stays near the route bounds');
    assert.ok(v.y >= minY && v.y <= maxY, 'ground elevations remain bounded by the local route grade');
  }
}

function checkGround(poses: Pose[]): { ground: Triangle[]; dispose: () => void } {
  const before = JSON.stringify(poses);
  const input = Object.freeze(poses.map(pose => Object.freeze({ ...pose })));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const group = createUrbanGround(input, material);
  assert.equal(JSON.stringify(input), before, 'native samples remain byte-for-byte unchanged');
  const ground = emittedTriangles(group);
  assertBounds(ground, poses);
  return { ground, dispose: () => { group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); material.dispose(); } };
}

function hairpin(): Pose[] {
  const points: Omit<Pose, 'p' | 'y'>[] = [];
  for (let z = -70; z <= 30; z += 5) points.push({ x: -9, z, heading: 0, width: 5.5 });
  for (let step = 1; step <= 12; step++) {
    const angle = Math.PI - step * Math.PI / 12;
    points.push({ x: 9 * Math.cos(angle), z: 30 + 9 * Math.sin(angle), heading: Math.PI - angle, width: 5.5 });
  }
  for (let z = 25; z >= -70; z -= 5) points.push({ x: 9, z, heading: Math.PI, width: 5.5 });
  let progress = 0;
  return points.map((point, i) => {
    if (i) progress += Math.hypot(point.x - points[i - 1]!.x, point.z - points[i - 1]!.z);
    return { ...point, p: progress, y: 2 + progress * 0.06 };
  });
}

function crossing(): Pose[] {
  const points: Pose[] = [];
  let progress = 0;
  for (let i = 0; i <= 120; i++) {
    const t = i / 120 * Math.PI * 2;
    const x = 70 * Math.sin(t), z = 40 * Math.sin(2 * t);
    if (i) progress += Math.hypot(x - points[i - 1]!.x, z - points[i - 1]!.z);
    points.push({ x, y: 4 + 8 * Math.sin(t / 2), z, heading: Math.atan2(70 * Math.cos(t), 80 * Math.cos(2 * t)), width: 5.5, p: progress });
  }
  return points;
}

test('Tokyo ground leaves every native road triangle and every drivable sample uncovered', () => {
  assert.equal(tokyo.length, 1404, 'use the full published Tokyo route');
  const { ground, dispose } = checkGround(tokyo);
  try {
    assertNoRoadOverlap(ground, ribbonTriangles(tokyo, pose => pose.width));
    assert.deepEqual(roadSampleHits(ground, tokyo), [], 'vertical rays through all road samples and both lane edges must miss ground');
  } finally { dispose(); }
});

for (const [name, build] of [['graded 18 m diameter hairpin', hairpin], ['crossing road projections at different elevations', crossing]] as const) {
  test(`urban ground excludes the entire road footprint at ${name}`, () => {
    const poses = build(), { ground, dispose } = checkGround(poses);
    try {
      assertNoRoadOverlap(ground, ribbonTriangles(poses, pose => pose.width));
      assert.deepEqual(roadSampleHits(ground, poses), [], 'ground cannot cover either nearby or crossing route branch');
    } finally { dispose(); }
  });
}

test('a nearly degenerate road triangle and duplicate station cannot expand the ground buffer without bound', () => {
  // A 0.1 mm segment across a 12 m road produces an acute native triangle.
  // Extending its offset edge lines creates a huge miter; the repeated station
  // also supplies exactly degenerate triangles that must be harmless.
  const poses: Pose[] = [0, 0.0001, 0.0001, 5, 10, 15].map(z => ({
    x: 0, y: 2 + z * 0.02, z, heading: 0, width: 6, p: z,
  }));
  const { ground, dispose } = checkGround(poses);
  try {
    assertNoRoadOverlap(ground, ribbonTriangles(poses, pose => pose.width));
    assert.deepEqual(roadSampleHits(ground, poses), [], 'short and duplicated native stations retain a clear road footprint');
  } finally { dispose(); }
});

test('the Tokyo fixture reproduces the former wide ribbon covering the native road', t => {
  const legacy = ribbonTriangles(tokyo, () => 110, -0.08);
  const occlusions = roadSampleHits(legacy, tokyo).filter(hit => hit.y > tokyo[hit.pose]!.y + 0.02);
  assert.ok(occlusions.length > 0, 'this fixture must fail if the old road-following ground ribbon is restored');
  t.diagnostic(`${occlusions.length} old-ribbon hits above the road across ${new Set(occlusions.map(hit => hit.pose)).size} native samples`);
});
