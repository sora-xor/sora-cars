import * as THREE from 'three';
import { terrainBankAt, terrainBankFactor } from './terrain';
import { SpatialIndex, area2, roadCut, subtract, type Cut, type Point } from './urban-ground';

export interface ArcadeGroundPose { x: number; y: number; z: number; heading: number; width: number; p: number }
/** How the land stands on one side of one road station: the ground ends `edge` metres past the road's edge (at a quay,
 * a sea wall, a gorge under a bridge; Infinity where it runs on), and a `flat` side stays at the road's level (quays,
 * harbour, a gorge's banks) where other sides keep the 18 m strip and then rise or fall with the banks
 * (terrain.ts `terrainHeightAt`, shaped by the course's relief). */
export interface ArcadeGroundSide { readonly edge: number; readonly flat: boolean }
export type ArcadeGroundShape = (p: number, side: -1 | 1) => ArcadeGroundSide;

export interface ArcadeGroundField {
  /** The ground's height at a point, or null over water and gorges and beyond its reach. */
  heightAt(x: number, z: number): number | null;
  /** The height and whether the point lies on the level strip or a flat side (the strip's material), not the banks. */
  sample(x: number, z: number): { height: number | null; strip: boolean };
  /** Whether a point stands clear of every stretch of road but the one at `p`, by `margin` metres past its edge. */
  clearOfOtherLegs(x: number, z: number, p: number, margin: number): boolean;
}

interface Station {
  readonly x: number; readonly y: number; readonly z: number; readonly cos: number; readonly sin: number;
  readonly width: number; readonly p: number; readonly left: ArcadeGroundSide; readonly right: ArcadeGroundSide;
  /** `terrainBankFactor` either side, found once. */
  readonly leftBank: number; readonly rightBank: number;
  /** Whether the blend counts this station: every other one, 10 m apart, is plenty for land this smooth. */
  readonly blends: boolean;
}
/** Stations used for the field, how far it reaches past the centre line, its index cells, and how much farther than
 * the nearest station the blend looks (a station that much farther counts under a twentieth as much). */
const STATION_STEP = 5, REACH = 150, CELL = 25, BLEND = 45;
const cellKey = (ix: number, iz: number) => (ix + 32768) * 65536 + iz + 32768;

/**
 * The land round an Arcade course on its real road. On RaceV1's gentle bends the ground was a ribbon either side of
 * the road and the banks strips beyond it, measured out from the road; on the real road a hairpin turns back inside
 * those strips, and two stretches of road a hillside apart each lay their own banks over the other. Here each road
 * station says what the land does beside it (`shape`: the 18 m strip, then the banks rising to a hillside or falling
 * to a valley) and the ground at a point blends what the stations round it say, nearer ones counting far more, so
 * one stretch of road alone keeps its own banks and two stretches meet in one hillside between them. Within a few
 * metres of a road's edge the ground is that road's own level.
 */
export function createArcadeGroundField(poses: readonly ArcadeGroundPose[], shape: ArcadeGroundShape): ArcadeGroundField {
  const grid = new Map<number, Station[]>();
  let last = -Infinity, count = 0;
  for (const pose of poses) if (pose.p - last >= STATION_STEP - 1e-6) {
    last = pose.p;
    const station = { x: pose.x, y: pose.y, z: pose.z, cos: Math.cos(pose.heading), sin: Math.sin(pose.heading), width: pose.width, p: pose.p,
      left: shape(pose.p, 1), right: shape(pose.p, -1), leftBank: terrainBankFactor(pose.p, 1), rightBank: terrainBankFactor(pose.p, -1),
      blends: count++ % 2 === 0 };
    const key = cellKey(Math.floor(pose.x / CELL), Math.floor(pose.z / CELL));
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(station);
  }
  const near = (x: number, z: number, radius: number, visit: (station: Station, distance: number) => void) => {
    const span = Math.ceil(radius / CELL), ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
    for (let dx = -span; dx <= span; dx++) for (let dz = -span; dz <= span; dz++) {
      const stations = grid.get(cellKey(ix + dx, iz + dz)); if (!stations) continue;
      for (const station of stations) {
        const distance = Math.hypot(x - station.x, z - station.z);
        if (distance <= radius) visit(station, distance);
      }
    }
  };
  /** The nearest station, searching ring by ring out from the point's cell. */
  const closest = (x: number, z: number): { station: Station; distance: number } | null => {
    const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL), rings = Math.ceil((REACH + 20) / CELL);
    let best: Station | null = null, distance = Infinity;
    for (let ring = 0; ring <= rings; ring++) {
      if (best && (ring - 1) * CELL > distance) break;
      for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const stations = grid.get(cellKey(ix + dx, iz + dz)); if (!stations) continue;
        for (const station of stations) {
          const d = Math.hypot(x - station.x, z - station.z);
          if (d < distance) { distance = d; best = station; }
        }
      }
    }
    return best ? { station: best, distance } : null;
  };
  // The road's own heading at a station, as world.ts draws `point(p, lateral)`: lateral runs to the driver's left.
  const lateral = (station: Station, x: number, z: number) => (x - station.x) * station.cos - (z - station.z) * station.sin;
  /** What a station says of a point: metres above its asphalt, or null where it has no ground there. */
  const rise = (station: Station, across: number): number | null => {
    const side = across < 0 ? station.right : station.left, beyond = Math.max(0, Math.abs(across) - station.width);
    if (beyond > side.edge) return null;
    return beyond < 18 || side.flat ? -0.08 : terrainBankAt(beyond, station.p, across < 0 ? -1 : 1, across < 0 ? station.rightBank : station.leftBank);
  };
  const sample = (x: number, z: number): { height: number | null; strip: boolean } => {
    const found = closest(x, z);
    if (!found || found.distance > REACH) return { height: null, strip: true };
    const station = found.station, across = lateral(station, x, z), own = rise(station, across);
    const beyond = Math.max(0, Math.abs(across) - station.width), strip = beyond < 18 || (across < 0 ? station.right : station.left).flat;
    if (own === null) return { height: null, strip };
    let sum = 0, weight = 0;
    near(x, z, found.distance + BLEND, (other, distance) => {
      if (!other.blends && other !== station) return;
      const value = rise(other, lateral(other, x, z));
      if (value === null) return;
      const w = 1 / (distance * distance + 16) ** 1.5;
      sum += w * (other.y + value); weight += w;
    });
    if (!weight) return { height: null, strip };
    // Beside the road the ground keeps to its own level, then the blend of the land round it takes over.
    const away = THREE.MathUtils.smoothstep(beyond, 1, 9);
    return { height: THREE.MathUtils.lerp(station.y + Math.min(own, -0.08), sum / weight, away), strip };
  };
  const heightAt = (x: number, z: number): number | null => sample(x, z).height;
  const clearOfOtherLegs = (x: number, z: number, p: number, margin: number) => {
    let clear = true;
    near(x, z, 20 + margin, (station, distance) => { if (Math.abs(station.p - p) > 30 && distance < station.width + margin) clear = false; });
    return clear;
  };
  return { heightAt, sample, clearOfOtherLegs };
}

export interface ArcadeGroundMaterials {
  /** The level strip beside the road (where the field's `sample` says `strip`), and the banks beyond it. */
  readonly strip: THREE.Material; readonly bank: THREE.Material;
}

const GRID = 8, CHUNK = 192;
const ROAD_MARGIN = 0.08;

/**
 * The ground of an Arcade course on its real road: a grid of `GRID` metre cells out to the field's reach, with the
 * asphalt of every stretch of road cut out exactly (urban-ground.ts), so it can neither fold over a hairpin nor rise
 * through the road. Where the ground ends (a quay's edge, a sea wall, a gorge under a bridge) each triangle is clipped
 * at the edge, found by halving along its sides, so the bank runs in a clean line rather than in 8 m steps. Each
 * triangle takes the strip's or the banks' material by where most of its corners lie.
 */
export function createArcadeGround(poses: readonly ArcadeGroundPose[], field: ArcadeGroundField, materials: ArcadeGroundMaterials): THREE.Group {
  const group = new THREE.Group(); group.name = 'Arcade ground round the real road';
  if (poses.length < 2) return group;
  const cuts = new SpatialIndex<Cut>(32);
  const edge = (pose: ArcadeGroundPose, sign: number): Point => ({ x: pose.x + Math.cos(pose.heading) * pose.width * sign,
    z: pose.z - Math.sin(pose.heading) * pose.width * sign });
  for (let i = 0; i < poses.length - 1; i++) {
    const a = poses[i]!, b = poses[i + 1]!, corners = [edge(a, -1), edge(a, 1), edge(b, 1), edge(b, -1)];
    for (const indices of [[0, 2, 1], [0, 3, 2]]) {
      const cut = roadCut(indices.map(index => corners[index]!));
      if (cut) cuts.add(cut, cut.minX - ROAD_MARGIN, cut.maxX + ROAD_MARGIN, cut.minZ - ROAD_MARGIN, cut.maxZ + ROAD_MARGIN);
    }
  }
  // The cells within the field's reach of the road: discs round every fourth station, so the open land beyond is
  // never visited.
  const cells = new Set<number>(), span = Math.ceil((REACH + GRID) / GRID);
  for (let i = 0; i < poses.length; i += 4) {
    const pose = poses[i]!, cx = Math.floor(pose.x / GRID), cz = Math.floor(pose.z / GRID);
    for (let dx = -span; dx <= span; dx++) for (let dz = -span; dz <= span; dz++)
      if (dx * dx + dz * dz <= span * span) cells.add(cellKey(cx + dx, cz + dz));
  }
  const samples = new Map<string, { height: number | null; strip: boolean }>();
  const at = (p: Point) => {
    const key = `${p.x.toFixed(4)}:${p.z.toFixed(4)}`;
    let value = samples.get(key);
    if (!value) samples.set(key, value = field.sample(p.x, p.z));
    return value;
  };
  const height = (p: Point): number | null => at(p).height;
  // Where the ground ends along a side from a point with ground to one without: halved seven times (8 m / 128). A side
  // shared by two triangles gives both the same point, so the clipped edge has no cracks.
  const edges = new Map<string, { p: Point; y: number }>();
  const boundary = (inside: Point, outside: Point): { p: Point; y: number } => {
    const key = `${inside.x.toFixed(4)}:${inside.z.toFixed(4)}>${outside.x.toFixed(4)}:${outside.z.toFixed(4)}`;
    const known = edges.get(key); if (known) return known;
    let lo = inside, hi = outside, y = height(inside)!;
    for (let i = 0; i < 7; i++) {
      const mid = { x: (lo.x + hi.x) / 2, z: (lo.z + hi.z) / 2 }, h = field.heightAt(mid.x, mid.z);
      if (h === null) hi = mid; else { lo = mid; y = h; }
    }
    const edge = { p: lo, y }; edges.set(key, edge); return edge;
  };
  // Triangles per chunk and material: [x, y, z] × 3 each.
  const batches = new Map<string, number[]>();
  for (const cell of cells) {
    const x = (Math.floor(cell / 65536) - 32768) * GRID, z = (cell % 65536 - 32768) * GRID;
    let fragments: Point[][] = [[{ x, z }, { x: x + GRID, z }, { x: x + GRID, z: z + GRID }, { x, z: z + GRID }]];
    for (const cut of cuts.box(x, x + GRID, z, z + GRID)) {
      if (cut.minX > x + GRID || cut.maxX < x || cut.minZ > z + GRID || cut.maxZ < z) continue;
      fragments = fragments.flatMap(polygon => subtract(polygon, cut));
      if (!fragments.length) break;
    }
    for (const polygon of fragments) for (let i = 1; i < polygon.length - 1; i++) {
      const triangle = [polygon[0]!, polygon[i + 1]!, polygon[i]!]; // +Y winding
      if (Math.abs(area2(triangle)) < 1e-8) continue;
      const ys = triangle.map(height);
      if (ys.every(y => y === null)) continue;
      // The part of the triangle with ground under it, in the triangle's own winding.
      const kept: { p: Point; y: number }[] = [];
      for (let k = 0; k < 3; k++) {
        const a = triangle[k]!, b = triangle[(k + 1) % 3]!, ya = ys[k]!, yb = ys[(k + 1) % 3]!;
        if (ya !== null) kept.push({ p: a, y: ya });
        if ((ya === null) !== (yb === null)) kept.push(ya !== null ? boundary(a, b) : boundary(b, a));
      }
      for (let k = 1; k + 1 < kept.length; k++) {
        const piece = [kept[0]!, kept[k]!, kept[k + 1]!];
        if (Math.abs(area2(piece.map(v => v.p))) < 1e-8) continue;
        // The strip's material where most of the piece's corners lie on the strip.
        const strips = piece.filter(v => at(v.p).strip).length;
        const key = `${strips >= 2 ? 'strip' : 'bank'}:${Math.floor(x / CHUNK)}:${Math.floor(z / CHUNK)}`;
        const batch = batches.get(key) ?? batches.set(key, []).get(key)!;
        for (const v of piece) batch.push(v.p.x, v.y, v.p.z);
      }
    }
  }
  for (const [key, triangles] of batches) {
    const strip = key.startsWith('strip:'), vertices = new Map<string, number>();
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [], blends: number[] = [], indices: number[] = [];
    for (let i = 0; i < triangles.length; i += 3) {
      const vx = triangles[i]!, vy = triangles[i + 1]!, vz = triangles[i + 2]!, id = `${vx.toFixed(4)}:${vz.toFixed(4)}`;
      let index = vertices.get(id);
      if (index === undefined) {
        index = positions.length / 3; vertices.set(id, index);
        positions.push(vx, vy, vz); normals.push(0, 0, 0);
        // The strip keeps the ribbon's 6 m scan; the banks their rotated 15 m one (terrain.ts).
        if (strip) uvs.push(vx / 6, vz / 6);
        else uvs.push((vx * .9323 + vz * .3616) / 15, (-vx * .3616 + vz * .9323) / 15);
        const shade = .8 + noise(vx * .055, vz * .055) * .14 + noise(vx * .19 + 63, vz * .19 - 19) * .08;
        colors.push(shade * 1.015, shade, shade * .97);
        blends.push(.25 + noise(vx * .12 - 83, vz * .12 + 27) * .35, .12 + noise(vx * .25 + 17, vz * .25 - 91) * .76);
      }
      indices.push(index);
    }
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i]! * 3, indices[i + 1]! * 3, indices[i + 2]! * 3];
      const abx = positions[b]! - positions[a]!, aby = positions[b + 1]! - positions[a + 1]!, abz = positions[b + 2]! - positions[a + 2]!;
      const acx = positions[c]! - positions[a]!, acy = positions[c + 1]! - positions[a + 1]!, acz = positions[c + 2]! - positions[a + 2]!;
      const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
      for (const v of [a, b, c]) { normals[v]! += nx; normals[v + 1]! += ny; normals[v + 2]! += nz; }
    }
    for (let v = 0; v < normals.length; v += 3) {
      const length = Math.hypot(normals[v]!, normals[v + 1]!, normals[v + 2]!) || 1;
      normals[v]! /= length; normals[v + 1]! /= length; normals[v + 2]! /= length;
    }
    const geometry = new THREE.BufferGeometry(); geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('terrainBlend', new THREE.Float32BufferAttribute(blends, 2));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, strip ? materials.strip : materials.bank);
    mesh.name = `Arcade ground ${key}`; mesh.receiveShadow = true; group.add(mesh);
  }
  return group;
}

function hash(x: number, y: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967295;
}
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
