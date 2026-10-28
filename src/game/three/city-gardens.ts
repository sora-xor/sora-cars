import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CityBlockWindow } from './city-blocks';
import type { CityPlotLayout } from './city-plots';
import type { StreetscapeFootprint } from './streetscape';

type Point = { readonly x: number; readonly z: number };
type Role = 'clay' | 'concrete' | 'soil' | 'foliage' | 'wood';
export type CityGardenMaterials = Readonly<Record<Role, THREE.Material>>;
export interface CityGardenPlacement {
  readonly id: string; readonly plotId: string; readonly buildingId: string; readonly p: number;
  readonly variant: number; readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  /** Conservative envelope includes all foliage, including its small ground tilt. */
  readonly footprint: StreetscapeFootprint;
}
export interface CityGardenLayout {
  readonly placements: readonly CityGardenPlacement[];
  readonly stats: { readonly candidates: number; readonly accepted: number; readonly rejected: number };
}
export interface CityGardenSource {
  readonly parts: Readonly<Record<Role, THREE.BufferGeometry>>;
  readonly bounds: THREE.Box3; readonly triangles: number;
}
const ROLES: readonly Role[] = ['clay', 'concrete', 'soil', 'foliage', 'wood'];
const CAPACITY = 72, ENVELOPE_RADIUS = .76, MAX_SOURCE_RADIUS = .65, MAX_SOURCE_HEIGHT = 1.65;
const UP = new THREE.Vector3(0, 1, 0);
function world(f: StreetscapeFootprint, x: number, z: number): Point {
  return { x: f.x + Math.cos(f.heading) * x + Math.sin(f.heading) * z,
    z: f.z - Math.sin(f.heading) * x + Math.cos(f.heading) * z };
}
function local(f: StreetscapeFootprint, point: Point): Point {
  const x = point.x - f.x, z = point.z - f.z;
  return { x: Math.cos(f.heading) * x - Math.sin(f.heading) * z,
    z: Math.sin(f.heading) * x + Math.cos(f.heading) * z };
}
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z, t = THREE.MathUtils.clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
function hash(value: string): number { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** Place only inside an already obstruction-tested court. The complete foliage
 * envelope stays inside its boundary, away from masonry and all access strips,
 * and leaves the central 2.4 m entrance corridor entirely open. */
export function createCityGardens(plots: CityPlotLayout, options: {
  readonly groundHeightAt: (x: number, z: number) => number | null;
}): CityGardenLayout {
  const placements: CityGardenPlacement[] = [], stats = { candidates: 0, accepted: 0, rejected: 0 };
  if (plots.course.style !== 3) return { placements, stats };
  for (const plot of plots.plots) for (const side of [-1, 1]) {
    stats.candidates++;
    const court = plot.court, x = side * (court.halfX - ENVELOPE_RADIUS - .18), z = .14;
    if (Math.abs(x) - ENVELOPE_RADIUS < 1.2 || Math.abs(z) + ENVELOPE_RADIUS > court.halfZ - .2) { stats.rejected++; continue; }
    const center = world(court, x, z);
    const nearSolid = plot.solids.some(solid => {
      const p = local({ x: solid.position[0], z: solid.position[2], heading: solid.heading, halfX: 0, halfZ: 0 }, center);
      return Math.hypot(Math.max(0, Math.abs(p.x) - solid.size[0] / 2), Math.max(0, Math.abs(p.z) - solid.size[2] / 2)) < ENVELOPE_RADIUS + .12;
    });
    // Check every ribbon, not only this court's approach: a future layout may
    // permit a neighbouring path to pass alongside it.
    const nearPath = plots.plots.some(other => other.access.some((b, i) => i > 0
      && distanceToSegment(center, other.access[i - 1]!, b) < ENVELOPE_RADIUS + 1.3));
    if (nearSolid || nearPath) { stats.rejected++; continue; }
    const sample = options.groundHeightAt, y = sample(center.x, center.z), r = .3;
    const west = sample(center.x - r, center.z), east = sample(center.x + r, center.z);
    const north = sample(center.x, center.z - r), south = sample(center.x, center.z + r);
    if ([y, west, east, north, south].some(v => v === null || !Number.isFinite(v))) { stats.rejected++; continue; }
    const dx = (east! - west!) / (r * 2), dz = (south! - north!) / (r * 2);
    // Upright residential pots can sit on gentle paving grades; larger slopes
    // or discontinuities are rejected, never hidden by a floating foundation.
    if (Math.hypot(dx, dz) > .06) { stats.rejected++; continue; }
    let level = true;
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
      const at = sample(center.x + sx * .55, center.z + sz * .55);
      if (at === null || !Number.isFinite(at) || Math.abs(at - y! - dx * sx * .55 - dz * sz * .55) > .0035) level = false;
    }
    if (!level) { stats.rejected++; continue; }
    const id = `${plot.id}/garden/${side < 0 ? 'left' : 'right'}`, seed = hash(id);
    const tilt = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(-dx, 1, -dz).normalize());
    const turn = new THREE.Quaternion().setFromAxisAngle(UP, court.heading + (seed % 17 - 8) * .035);
    tilt.multiply(turn);
    placements.push({ id, plotId: plot.id, buildingId: plot.buildingId, p: plot.p, variant: seed % 3,
      position: [center.x, y! + .025, center.z], quaternion: tilt.toArray(),
      footprint: { ...center, heading: court.heading, halfX: ENVELOPE_RADIUS, halfZ: ENVELOPE_RADIUS } });
    stats.accepted++;
  }
  return { placements, stats };
}

class Parts {
  private readonly values: Record<Role, THREE.BufferGeometry[]> = { clay: [], concrete: [], soil: [], foliage: [], wood: [] };
  add(role: Role, source: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix = new THREE.Matrix4()): void {
    const g = source.index ? source.toNonIndexed() : source;
    if (g !== source) source.dispose();
    g.applyMatrix4(matrix);
    const shade = new THREE.Color(color), colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = shade.r; colors[i + 1] = shade.g; colors[i + 2] = shade.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); this.values[role].push(g);
  }
  finish(): CityGardenSource {
    const bounds = new THREE.Box3(); let triangles = 0;
    const entries = ROLES.map(role => {
      const parts = this.values[role], merged = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
      if (!merged) throw new Error('City garden geometry attributes disagree.');
      parts.forEach(g => g.dispose());
      if (merged.hasAttribute('position')) { merged.computeBoundingBox(); merged.computeBoundingSphere(); bounds.union(merged.boundingBox!); triangles += merged.getAttribute('position').count / 3; }
      return [role, merged] as const;
    });
    return { parts: Object.fromEntries(entries) as Record<Role, THREE.BufferGeometry>, bounds, triangles };
  }
}
function pose(x: number, y: number, z: number, turn = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(turn).setPosition(x, y, z);
}
function lathe(points: readonly (readonly [number, number])[], segments = 48): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}
function tube(points: THREE.Vector3[], radius: number, segments = 10): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 5, false);
}
/** Closed hollow vessel: curved foot, taper, rolled lip, interior wall and
 * recessed soil. The pot is not a solid capped cylinder under the leaves. */
function vessel(parts: Parts, x: number, z: number, scale: number, concrete = false): { x: number; y: number; z: number } {
  const transform = pose(x, 0, z).scale(new THREE.Vector3(scale, scale, scale));
  const profile: readonly (readonly [number, number])[] = [[.185, 0], [.205, .006], [.217, .02], [.217, .036], [.225, .045],
    [.253, .21], [.277, .398], [.285, .408], [.302, .418], [.305, .445], [.299, .464], [.283, .472],
    [.269, .463], [.267, .445], [.261, .434], [.244, .23], [.212, .057], [.185, .049], [.185, 0]];
  parts.add(concrete ? 'concrete' : 'clay', lathe(profile), concrete ? '#bbb4a5' : '#b77b60', transform);
  // Separate saucer catches a hard contact shadow; its shallow rim has real thickness.
  parts.add(concrete ? 'concrete' : 'clay', lathe([[.198, 0], [.286, 0], [.306, .015], [.313, .055], [.304, .068], [.292, .065], [.285, .022], [.198, .022], [.198, 0]]),
    concrete ? '#aba594' : '#a76c51', transform);
  const soil = new THREE.CylinderGeometry(.252, .247, .022, 48); soil.translate(0, .41, 0);
  parts.add('soil', soil, '#5e4b36', transform);
  // Subtle turned bands in the clay preserve recognisable craft detail close up.
  for (const [radius, y] of [[.251, .205], [.255, .232]] as const) {
    const band = new THREE.TorusGeometry(radius, .0018, 4, 48); band.rotateX(Math.PI / 2); band.translate(0, y, 0);
    parts.add(concrete ? 'concrete' : 'clay', band, concrete ? '#b2ab9c' : '#ba8065', transform);
  }
  // Small dimensional aggregate occupies the soil without repetitive large stones.
  for (let i = 0; i < 13; i++) {
    const a = i * 2.39996, radius = .205 * Math.sqrt((i + 1) / 14);
    const pebble = new THREE.IcosahedronGeometry(.011 + (i % 3) * .002, 1);
    pebble.scale(1.3, .55, .8); pebble.translate(Math.cos(a) * radius, .423, Math.sin(a) * radius);
    parts.add('soil', pebble, i % 3 === 0 ? '#a29678' : '#756347', transform);
  }
  return { x, y: .422 * scale, z };
}

/** Curved, folded leaf mesh with lengthwise and crosswise tessellation. The
 * raised midrib, scalloped edge and rolled tip remain visible in silhouette. */
function leafGeometry(length: number, width: number, bend: number, segments = 12): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [], across = 6;
  for (let i = 0; i <= segments; i++) for (let j = 0; j <= across; j++) {
    const t = i / segments, s = j / across * 2 - 1;
    const shape = Math.pow(Math.sin(Math.PI * t), .74) * (1 + .025 * Math.sin(t * Math.PI * 20));
    positions.push(s * width * shape / 2, bend * t * t + width * .13 * (1 - Math.abs(s)) * Math.sin(Math.PI * t)
      - width * .06 * s * s * Math.sin(Math.PI * t * 1.4), t * length);
    uv.push(j / across, t);
    if (i < segments && j < across) { const a = i * (across + 1) + j, b = a + across + 1; indices.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}
function addLeaf(parts: Parts, at: THREE.Vector3, angle: number, pitch: number, length: number, width: number, color: string, arch = -.1): void {
  const m = pose(at.x, at.y, at.z, angle).multiply(new THREE.Matrix4().makeRotationX(pitch));
  parts.add('foliage', leafGeometry(length, width, arch), color, m);
  const midrib = [0, .25, .5, .75, .96].map(t => new THREE.Vector3(0, arch * t * t + width * .13 * Math.sin(Math.PI * t) + .001, t * length));
  parts.add('foliage', tube(midrib, .0012, 8), '#5c743c', m);
}
function broadleaf(parts: Parts, root: { x: number; y: number; z: number }, small = false): void {
  const count = small ? 12 : 21, size = small ? .67 : 1;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996, height = (.16 + (i % 6) * .047) * size;
    const lean = (.08 + (i % 4) * .015) * size;
    const at = new THREE.Vector3(root.x + Math.sin(angle) * lean, root.y + height, root.z + Math.cos(angle) * lean);
    parts.add('foliage', tube([new THREE.Vector3(root.x, root.y, root.z), new THREE.Vector3(root.x, root.y + height * .6, root.z), at], .003 * size, 7), '#465637');
    addLeaf(parts, at, angle, -.78 - (i % 4) * .14, (.36 + (i % 5) * .031) * size,
      (.092 + (i % 3) * .016) * size, ['#3c5833', '#49653a', '#354c2c', '#526c3d'][i % 4]!, -.11 * size);
  }
}
function shrub(parts: Parts, root: { x: number; y: number; z: number }): void {
  const trunk = [new THREE.Vector3(root.x, root.y, root.z), new THREE.Vector3(root.x + .035, root.y + .28, root.z - .012),
    new THREE.Vector3(root.x + .005, root.y + .69, root.z + .022)];
  parts.add('wood', tube(trunk, .014, 14), '#796248');
  for (let b = 0; b < 11; b++) {
    const angle = b * 2.39996, startY = root.y + .16 + (b % 5) * .078, rise = .21 + (b % 3) * .033;
    const reach = .23 + (b % 4) * .035;
    const start = new THREE.Vector3(root.x + .02, startY, root.z), end = new THREE.Vector3(root.x + Math.sin(angle) * reach, startY + rise, root.z + Math.cos(angle) * reach);
    const curve = new THREE.CatmullRomCurve3([start, start.clone().lerp(end, .45).add(new THREE.Vector3(0, .06, 0)), end]);
    parts.add('wood', new THREE.TubeGeometry(curve, 12, .0048, 5, false), '#856d4f');
    for (let l = 0; l < 9; l++) {
      const t = .18 + l * .087, at = curve.getPoint(t), side = l % 2 ? -1 : 1;
      const yaw = angle + side * (1 + (l % 3) * .13);
      addLeaf(parts, at, yaw, -.18 - (l % 4) * .09, .105 + (l % 3) * .017, .045 + (l % 3) * .006,
        ['#36512f', '#46623a', '#2d482c', '#537045'][((b + l) % 4)]!, -.013);
    }
  }
}

/** Three shared, metre-scale sources. All foliage is curved opaque geometry,
 * with actual petioles, woody branching, hollow pots and inset soil. */
export function createCityGardenSources(): readonly CityGardenSource[] {
  return Array.from({ length: 3 }, (_, variant) => {
    const parts = new Parts();
    if (variant === 0) shrub(parts, vessel(parts, 0, 0, 1.04));
    else if (variant === 1) broadleaf(parts, vessel(parts, 0, 0, .96, true));
    else {
      broadleaf(parts, vessel(parts, -.21, .06, .77), true);
      broadleaf(parts, vessel(parts, .245, -.09, .58), true);
    }
    const source = parts.finish();
    // These are source construction invariants, not a placement-only guess.
    // Include every vertex so changed leaves cannot silently cross a path.
    for (const g of Object.values(source.parts)) if (g.hasAttribute('position')) {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i), p.getZ(i)) > MAX_SOURCE_RADIUS || p.getY(i) > MAX_SOURCE_HEIGHT || p.getY(i) < -.001)
        throw new Error(`City garden source ${variant} exceeds its tested ground/foliage envelope.`);
    }
    return source;
  });
}

/** Fixed instanced material batches. No geometry rebuilding, asset requests or
 * camera-based decoration during draw; transforms change only with city IDs. */
export class CityGardenBatch {
  readonly group = new THREE.Group();
  readonly sources = createCityGardenSources();
  private readonly meshes: THREE.InstancedMesh[][];
  private signature = ''; private layout: CityGardenLayout | null = null; private disposed = false;
  private readonly matrix = new THREE.Matrix4(); private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion(); private readonly scale = new THREE.Vector3(1, 1, 1);
  constructor(materials: CityGardenMaterials) {
    this.group.name = 'SORA residential court planting';
    this.meshes = this.sources.map((source, variant) => ROLES.flatMap(role => {
      const geometry = source.parts[role]; if (!geometry.hasAttribute('position')) return [];
      const mesh = new THREE.InstancedMesh(geometry, materials[role], CAPACITY);
      mesh.name = `City garden ${variant} ${role}`; mesh.count = 0; mesh.visible = false; mesh.castShadow = mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(mesh); return [mesh];
    }));
    this.group.userData.cityGardenStats = { visibleAssemblies: 0, triangles: 0, meshBatches: 0, ids: [], sourceTriangles: this.sources.map(s => s.triangles) };
  }
  setGardens(layout: CityGardenLayout | null, window: CityBlockWindow): void {
    if (this.disposed) throw new Error('Cannot update disposed city garden geometry.');
    const buildings = new Set([...window.buildings, ...window.apartments].map(p => p.id));
    const selected = layout?.placements.filter(p => buildings.has(p.buildingId)) ?? [];
    if (selected.length > CAPACITY) throw new Error('City garden window exceeds the 72 assembly budget.');
    const signature = selected.map(p => p.id).join('|');
    if (this.layout === layout && signature === this.signature) return;
    this.layout = layout; this.signature = signature;
    const counts = [0, 0, 0];
    for (const p of selected) {
      this.matrix.compose(this.position.fromArray(p.position), this.rotation.fromArray(p.quaternion), this.scale);
      for (const mesh of this.meshes[p.variant]!) mesh.setMatrixAt(counts[p.variant]!, this.matrix);
      counts[p.variant]!++;
    }
    this.meshes.forEach((meshes, variant) => meshes.forEach(mesh => {
      mesh.count = counts[variant]!; mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.count) { mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
    }));
    this.group.userData.cityGardenStats = { visibleAssemblies: selected.length,
      triangles: counts.reduce((total, count, i) => total + count * this.sources[i]!.triangles, 0),
      meshBatches: this.meshes.flat().filter(m => m.visible).length, ids: selected.map(p => p.id), sourceTriangles: this.sources.map(s => s.triangles) };
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const mesh of this.meshes.flat()) mesh.dispose();
    for (const source of this.sources) Object.values(source.parts).forEach(g => g.dispose());
    this.group.clear();
  }
}
