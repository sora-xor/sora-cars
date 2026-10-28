/**
 * Authored, metre-scale frontage rhythm. This module owns presentation placement
 * only: route geometry, hazards, collision arithmetic and car state stay native.
 *
 * Layout is built once per course, before a camera or recycled mesh pool exists.
 * Select a window with selectStreetscape(), retaining meshes by placement.id and
 * matching placement.variant to createBuilding/createApartment's source variant.
 */
export type StreetscapeSide = -1 | 1;
export type StreetscapeKind = 'building' | 'apartment' | 'tree';
export type StreetscapeBlock = 'shop-row' | 'garage-court' | 'residential' | 'planted-court'
  | 'hamlet' | 'village' | 'forest' | 'overlook';
export interface StreetscapePose { readonly p: number; readonly x: number; readonly z: number; readonly heading: number; readonly width: number }
export interface StreetscapeCourse {
  readonly length: number;
  readonly circuit: boolean;
  /** The renderer's existing style: 3 is Tokyo; 0, 1 and 2 are arcade landscapes. */
  readonly style: number;
  readonly poses: readonly StreetscapePose[];
}
export interface StreetscapeFootprint {
  readonly x: number; readonly z: number;
  /** Angle of the building's local +Z axis, in the renderer's XZ convention. */
  readonly heading: number;
  readonly halfX: number; readonly halfZ: number;
}
export interface StreetscapePlacement {
  readonly id: string;
  readonly kind: StreetscapeKind;
  readonly block: StreetscapeBlock;
  readonly blockId: string;
  readonly variant: number;
  readonly p: number;
  readonly side: StreetscapeSide;
  /** Metres from the native road edge to the model origin, never its centerline. */
  readonly clearance: number;
  /** Local X/Y/Z scaling; height remains within 94–106% of real door dimensions. */
  readonly scale: readonly [number, number, number];
  /** Extra local yaw; buildings face the road with no random yaw. */
  readonly yaw: number;
  readonly footprint: StreetscapeFootprint;
}
export interface StreetscapeSection {
  readonly id: string; readonly block: StreetscapeBlock; readonly side: StreetscapeSide;
  readonly start: number; readonly length: number;
}
export interface StreetscapeLayout {
  readonly course: StreetscapeCourse;
  readonly buildings: readonly StreetscapePlacement[];
  readonly apartments: readonly StreetscapePlacement[];
  readonly trees: readonly StreetscapePlacement[];
  readonly sections: readonly StreetscapeSection[];
  readonly stats: { readonly rejectedBuildings: number; readonly rejectedTrees: number; readonly roadSegments: number };
}
export interface StreetscapeWindowOptions {
  readonly behind?: number; readonly ahead?: number;
  readonly buildingBudget?: number; readonly apartmentBudget?: number; readonly treeBudget?: number;
  readonly buildingVariants?: readonly number[]; readonly apartmentVariants?: readonly number[];
}
export interface StreetscapeWindow {
  readonly buildings: readonly StreetscapePlacement[];
  readonly apartments: readonly StreetscapePlacement[];
  readonly trees: readonly StreetscapePlacement[];
}

type Vector2 = { x: number; z: number };
type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
type RoadSegment = { a: StreetscapePose; b: StreetscapePose; bounds: Box };
type BuildingSpec = { at: number; variant: number; front: number; scale: readonly [number, number, number] };
type TreeSpec = { at: number; clearance: number; scale: number; cluster: number };
const TAU = Math.PI * 2;
const STREET_SEQUENCE: readonly StreetscapeBlock[] = ['shop-row', 'garage-court', 'residential', 'planted-court', 'shop-row', 'residential'];
const RURAL_SEQUENCE: readonly StreetscapeBlock[] = ['hamlet', 'forest', 'forest', 'village', 'overlook', 'forest'];
const BUILDING_WIDTH = [8.8, 7.9, 10.2, 9.3] as const;
const BUILDING_DEPTH = [6, 6.6, 6.1, 6.3] as const;
const mod = (value: number, period: number) => (value % period + period) % period;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Broad-phase only; final clearance uses oriented footprints, not grid occupancy. */
class Grid<T> {
  private readonly cells = new Map<string, T[]>();
  constructor(private readonly size = 24) {}
  private keys(bounds: Box): string[] {
    const keys: string[] = [];
    for (let x = Math.floor(bounds.minX / this.size); x <= Math.floor(bounds.maxX / this.size); x++)
      for (let z = Math.floor(bounds.minZ / this.size); z <= Math.floor(bounds.maxZ / this.size); z++) keys.push(`${x}:${z}`);
    return keys;
  }
  add(value: T, bounds: Box): void {
    for (const key of this.keys(bounds)) { const items = this.cells.get(key) ?? []; items.push(value); this.cells.set(key, items); }
  }
  query(bounds: Box): T[] {
    const found = new Set<T>();
    for (const key of this.keys(bounds)) for (const item of this.cells.get(key) ?? []) found.add(item);
    return [...found];
  }
}
const indices = new WeakMap<StreetscapeLayout, { buildings: Grid<StreetscapePlacement>; road: Grid<RoadSegment> }>();

function poseAt(course: StreetscapeCourse, value: number): StreetscapePose {
  const poses = course.poses, p = course.circuit ? mod(value, course.length) : clamp(value, poses[0]!.p, poses.at(-1)!.p);
  let lo = 0, hi = poses.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (poses[mid]!.p <= p) lo = mid; else hi = mid; }
  const a = poses[lo]!, b = poses[hi]!, t = clamp((p - a.p) / (b.p - a.p || 1), 0, 1);
  // Headings on imported routes may wrap once per revolution.
  const turn = mod(b.heading - a.heading + Math.PI, TAU) - Math.PI;
  return { p, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    heading: a.heading + turn * t, width: a.width + (b.width - a.width) * t };
}
function centerAt(pose: StreetscapePose, side: StreetscapeSide, clearance: number): Vector2 {
  const lateral = side * (pose.width + clearance);
  return { x: pose.x + Math.cos(pose.heading) * lateral, z: pose.z - Math.sin(pose.heading) * lateral };
}
function boundsOf(footprint: StreetscapeFootprint, margin = 0): Box {
  const c = Math.abs(Math.cos(footprint.heading)), s = Math.abs(Math.sin(footprint.heading));
  const x = c * footprint.halfX + s * footprint.halfZ + margin;
  const z = s * footprint.halfX + c * footprint.halfZ + margin;
  return { minX: footprint.x - x, maxX: footprint.x + x, minZ: footprint.z - z, maxZ: footprint.z + z };
}
function local(point: Vector2, footprint: StreetscapeFootprint): Vector2 {
  const dx = point.x - footprint.x, dz = point.z - footprint.z, c = Math.cos(footprint.heading), s = Math.sin(footprint.heading);
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}
function overlaps(a: StreetscapeFootprint, b: StreetscapeFootprint, margin = 0): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  const axes = [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2];
  return axes.every(angle => {
    const x = Math.cos(angle), z = -Math.sin(angle);
    const radius = (f: StreetscapeFootprint) => Math.abs(x * Math.cos(f.heading) - z * Math.sin(f.heading)) * f.halfX
      + Math.abs(x * Math.sin(f.heading) + z * Math.cos(f.heading)) * f.halfZ;
    return Math.abs(dx * x + dz * z) < radius(a) + radius(b) + margin;
  });
}
function circleTouches(footprint: StreetscapeFootprint, center: Vector2, radius: number): boolean {
  const point = local(center, footprint);
  return Math.hypot(Math.max(0, Math.abs(point.x) - footprint.halfX), Math.max(0, Math.abs(point.z) - footprint.halfZ)) < radius;
}
function lineHitsBox(a: Vector2, b: Vector2, halfX: number, halfZ: number): boolean {
  let low = 0, high = 1;
  for (const [start, delta, half] of [[a.x, b.x - a.x, halfX], [a.z, b.z - a.z, halfZ]]) {
    if (Math.abs(delta!) < 1e-9) { if (Math.abs(start!) > half!) return false; continue; }
    const near = (-half! - start!) / delta!, far = (half! - start!) / delta!;
    low = Math.max(low, Math.min(near, far)); high = Math.min(high, Math.max(near, far));
    if (low > high) return false;
  }
  return true;
}
function hitsRoad(footprint: StreetscapeFootprint, grid: Grid<RoadSegment>): boolean {
  for (const segment of grid.query(boundsOf(footprint, 14))) {
    // A native road capsule, enlarged for the sidewalk, is deliberately
    // conservative at tight bends and crossings. Never move the road to fit art.
    const roadRadius = Math.max(segment.a.width, segment.b.width) + 1.35;
    if (lineHitsBox(local(segment.a, footprint), local(segment.b, footprint), footprint.halfX + roadRadius, footprint.halfZ + roadRadius)) return true;
  }
  return false;
}

/** Conservative template envelopes, including awnings and the variant-2 side workshop. */
function buildingFootprint(pose: StreetscapePose, side: StreetscapeSide, clearance: number,
  kind: StreetscapeKind, variant: number, scale: readonly [number, number, number]): StreetscapeFootprint {
  const apartment = kind === 'apartment', width = apartment ? (variant ? 15 : 12.8) : BUILDING_WIDTH[variant]!;
  const depth = apartment ? (variant ? 10 : 8.8) : BUILDING_DEPTH[variant]!;
  const edge = apartment ? .3 : .45;
  const minX = -(width / 2 + edge) * scale[0], maxX = (width / 2 + (!apartment && variant === 2 ? 2.2 : edge)) * scale[0];
  // Apartment entry stairs extend .995 m ahead of the facade; reserve their full
  // envelope alongside the shops' attached signs, pipes and frontage props.
  const minZ = -(depth / 2 + (apartment ? 1.1 : 1.45)) * scale[2], maxZ = (depth / 2 + (apartment ? .4 : .5)) * scale[2];
  const heading = pose.heading + (side === -1 ? -Math.PI / 2 : Math.PI / 2), origin = centerAt(pose, side, clearance);
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  return { x: origin.x + Math.cos(heading) * cx + Math.sin(heading) * cz,
    z: origin.z - Math.sin(heading) * cx + Math.cos(heading) * cz,
    heading, halfX: (maxX - minX) / 2, halfZ: (maxZ - minZ) / 2 };
}

function specsFor(block: StreetscapeBlock, side: StreetscapeSide, index: number): { buildings: BuildingSpec[]; apartment?: BuildingSpec; trees: TreeSpec[] } {
  const buildings: BuildingSpec[] = [], trees: TreeSpec[] = [];
  const add = (at: number, variant: number, front = 3.3, x = 1, y = 1, z = 1) => buildings.push({ at, variant, front, scale: [x, y, z] });
  const cluster = (start: number, variants: readonly number[], front: number, scaleX = 1) => {
    let edge = start;
    variants.forEach((variant, i) => {
      // Account for the actual roof envelope and asymmetric side workshop when
      // adjoining lots. The origin shifts with the road-facing side; an annex
      // must not displace its neighbour or create an accidental missing shop.
      const x = scaleX * [1, .98, 1.02][i % 3]!, left = (BUILDING_WIDTH[variant]! / 2 + .45) * x;
      const right = (BUILDING_WIDTH[variant]! / 2 + (variant === 2 ? 2.2 : .45)) * x, width = left + right;
      add(edge + width / 2 + side * (right - left) / 2, variant, front, x, 1, 1);
      edge += width + .5;
    });
    return edge;
  };
  const order = [0, 1, 3, 2, 3, 0, 2, 1, 0, 3, 1, 2];
  const row = (count: number, offset = 0) => Array.from({ length: count }, (_, i) => order[mod(i + offset + index * 3 + (side > 0 ? 2 : 0), order.length)]!);
  const grove = (start: number, offsets: readonly number[], clearance: number, clusterId: number, scale = 1) => {
    offsets.forEach((offset, i) => trees.push({ at: start + offset, clearance: clearance + [0, 1.1, .4, 1.7][i % 4]!, scale: scale * [.88, 1.03, .95, 1.08][i % 4]!, cluster: clusterId }));
  };
  let apartment: BuildingSpec | undefined;
  switch (block) {
    case 'shop-row': {
      // One occupied market block, punctuated by two short service alleys.
      // Opposite streets use another source order and offset block boundaries.
      const first = cluster(4, row(4), 3.25);
      const second = cluster(first + 3.2, row(4, 4), 3.25);
      cluster(second + 4.2, row(3, 8), 3.4);
      break;
    }
    case 'garage-court':
      cluster(4, row(4), 3.25);
      add(64, 0, 8.3, 1, 1, 1); add(83, 2, 8.3, 1, 1, 1);
      cluster(102, row(3, 5), 3.25);
      grove(94, [0], 5.2, 0, .9);
      break;
    case 'residential':
      cluster(4, [1, 3, 0], 4.1); cluster(40, row(3, 3), 4.1);
      apartment = { at: 87, variant: mod(index + (side > 0 ? 1 : 0), 2), front: 6.5, scale: [1, 1, 1] };
      cluster(103, [3, 1, 0], 4.2);
      grove(98, [0], 4.8, 0, .9);
      break;
    case 'planted-court':
      cluster(4, row(3), 3.25);
      // The real four/six-storey source forms a visible street layer. The old
      // 19m setback hid it behind the repeated low roofs in the driving camera.
      apartment = { at: 60, variant: mod(index + (side > 0 ? 1 : 0), 2), front: 7.5, scale: [1, 1, 1] };
      cluster(78, row(5, 4), 3.4);
      grove(43, [0], 4.8, 0, .93);
      break;
    case 'hamlet': {
      // A continuous opening settlement ends before the unbuilt forest section.
      const first = cluster(9 + (side > 0 ? 7 : 0), row(4), 3.6);
      cluster(first + 3.8, row(3, 4), 3.6);
      add(115 + (side > 0 ? 8 : 0), 2, 7.4, 1, 1, 1);
      cluster(144 + (side > 0 ? 9 : 0), row(3, 8), 4.0);
      grove(101, [0], 5.2, 0, .95); grove(202, [0, 9, 20, 28], 5.6, 1, 1.1);
      break;
    }
    case 'village': {
      const first = cluster(7 + (side > 0 ? 11 : 0), row(4), 3.6);
      const second = cluster(first + 4.2, row(4, 4), 3.8);
      cluster(second + 5.2, row(4, 8), 3.8);
      add(181 + (side > 0 ? 7 : 0), 2, 8.4, 1, 1, 1);
      cluster(211, [1, 3], 4.3);
      grove(247, [0, 9, 18], 5.1, 0, 1.05);
      break;
    }
    case 'overlook':
      if (side === -1) { add(67, 0, 11, 1.04, 1, 1.07); grove(26, [0, 9, 19], 5.2, 0, 1.05); }
      // The opposite bank stays open for a view; trees frame its ends.
      grove(157, [0, 9, 19], 6.5, 1, 1.1); grove(235, [0, 9, 19], 5.7, 2, 1.1);
      break;
    case 'forest':
      grove(14, [0, 9, 20, 28], 4.3, 0, 1.12); grove(81, [0, 8, 18], 5.2, 1, 1.1);
      grove(143, [0, 9, 20, 28], 4.6, 2, 1.15); grove(218, [0, 9, 18, 28], 5.5, 3, 1.08);
      break;
  }
  return { buildings, apartment, trees };
}

export function createStreetscape(course: StreetscapeCourse): StreetscapeLayout {
  if (!Number.isFinite(course.length) || course.length <= 0 || course.poses.length < 2) throw new Error('Streetscape needs a positive course length and at least two native route poses.');
  const road = new Grid<RoadSegment>(), occupied = new Grid<StreetscapePlacement>();
  for (let i = 1; i < course.poses.length; i++) {
    const a = course.poses[i - 1]!, b = course.poses[i]!, radius = Math.max(a.width, b.width) + 1.35;
    const bounds = { minX: Math.min(a.x, b.x) - radius, maxX: Math.max(a.x, b.x) + radius,
      minZ: Math.min(a.z, b.z) - radius, maxZ: Math.max(a.z, b.z) + radius };
    road.add({ a, b, bounds }, bounds);
  }
  const urban = course.style === 3, nominal = urban ? 140 : 280;
  const blockCount = Math.max(1, Math.round(course.length / nominal)), blockLength = course.circuit ? course.length / blockCount : nominal;
  const first = course.circuit ? 0 : Math.floor(course.poses[0]!.p / blockLength);
  const last = course.circuit ? blockCount - 1 : Math.floor(course.poses.at(-1)!.p / blockLength);
  const buildings: StreetscapePlacement[] = [], apartments: StreetscapePlacement[] = [], trees: StreetscapePlacement[] = [], sections: StreetscapeSection[] = [];
  const pendingTrees: { section: StreetscapeSection; spec: TreeSpec; ordinal: number; stretch: number }[] = [];
  let rejectedBuildings = 0, rejectedTrees = 0;
  const normalize = (p: number) => course.circuit ? mod(p, course.length) : p;
  const availableProgress = (p: number) => course.circuit || p >= course.poses[0]!.p && p <= course.poses.at(-1)!.p;
  const addBuilding = (section: StreetscapeSection, spec: BuildingSpec, ordinal: number, kind: 'building' | 'apartment', stretch: number) => {
    const p = normalize(section.start + spec.at * stretch);
    if (!availableProgress(p)) return;
    const at = poseAt(course, p), depth = kind === 'apartment' ? (spec.variant ? 10 : 8.8) : BUILDING_DEPTH[spec.variant]!;
    const baseClearance = spec.front + depth / 2 * spec.scale[2];
    // A tight inside bend may need a slightly deeper plot. Reject a plot that
    // still collides, rather than shrinking doors or modifying the native road.
    for (const retreat of [0, 2.5, 5]) {
      const clearance = baseClearance + retreat;
      const footprint = buildingFootprint(at, section.side, clearance, kind, spec.variant, spec.scale);
      if (hitsRoad(footprint, road) || occupied.query(boundsOf(footprint, .25)).some(other => overlaps(footprint, other.footprint, .25))) continue;
      const placement: StreetscapePlacement = { id: `${section.id}/${kind}/${ordinal}`, kind, block: section.block,
        blockId: section.id, variant: spec.variant, p, side: section.side, clearance, scale: spec.scale, yaw: 0, footprint };
      (kind === 'building' ? buildings : apartments).push(placement); occupied.add(placement, boundsOf(footprint)); return;
    }
    rejectedBuildings++;
  };
  for (let blockIndex = first; blockIndex <= last; blockIndex++) for (const side of [-1, 1] as const) {
    const sequence = urban ? STREET_SEQUENCE : RURAL_SEQUENCE;
    // Opposing urban blocks have different uses and offset lot boundaries.
    // Rural sides share a settlement/forest identity so villages really end.
    const patternIndex = mod(blockIndex + (urban && side > 0 ? 3 : 0) + (urban ? 0 : course.style * 2), sequence.length);
    const block = sequence[patternIndex]!;
    const start = blockIndex * blockLength + (urban && side > 0 ? blockLength * .24 : 0);
    const section: StreetscapeSection = { id: `${urban ? 'town' : 'country'}:${blockIndex}:${side}`, block, side,
      start: normalize(start), length: blockLength };
    sections.push(section);
    const specs = specsFor(block, side, blockIndex), stretch = Math.min(1.15, blockLength / nominal);
    specs.buildings.forEach((spec, i) => addBuilding(section, spec, i, 'building', stretch));
    if (specs.apartment) addBuilding(section, specs.apartment, 0, 'apartment', stretch);
    specs.trees.forEach((spec, ordinal) => pendingTrees.push({ section, spec, ordinal, stretch }));
  }
  for (const { section, spec, ordinal, stretch } of pendingTrees) {
    const p = normalize(section.start + spec.at * stretch); if (!availableProgress(p)) continue;
    const at = poseAt(course, p), center = centerAt(at, section.side, spec.clearance), radius = 5.1 * spec.scale;
    const footprint: StreetscapeFootprint = { ...center, heading: 0, halfX: radius, halfZ: radius };
    if (occupied.query(boundsOf(footprint)).some(building => circleTouches(building.footprint, center, radius + .4))) { rejectedTrees++; continue; }
    // Keep trunks on their own verge even where two native route segments meet.
    const trunk = { ...footprint, halfX: .45, halfZ: .45 };
    if (hitsRoad(trunk, road)) { rejectedTrees++; continue; }
    const placement: StreetscapePlacement = { id: `${section.id}/tree/${ordinal}`, kind: 'tree', block: section.block,
      blockId: section.id, variant: mod(ordinal + spec.cluster + (section.side > 0 ? 2 : 0), 4), p, side: section.side,
      clearance: spec.clearance, scale: [spec.scale, spec.scale, spec.scale],
      yaw: mod((ordinal + spec.cluster * 3) * 2.39996 + (section.side > 0 ? .83 : 0), TAU), footprint };
    trees.push(placement);
  }
  const order = (a: StreetscapePlacement, b: StreetscapePlacement) => a.p - b.p || a.id.localeCompare(b.id);
  buildings.sort(order); apartments.sort(order); trees.sort(order);
  const layout: StreetscapeLayout = { course, buildings, apartments, trees, sections,
    stats: { rejectedBuildings, rejectedTrees, roadSegments: course.poses.length - 1 } };
  indices.set(layout, { buildings: occupied, road }); return layout;
}

/**
 * Match current shared pools (12 instances of each house, 10 of each apartment).
 * IDs and transforms do not depend on this selection, travel direction or lap.
 */
export function selectStreetscape(layout: StreetscapeLayout, progress: number, options: StreetscapeWindowOptions = {}): StreetscapeWindow {
  const behind = options.behind ?? 70, ahead = options.ahead ?? 360, course = layout.course;
  const p = course.circuit ? mod(progress, course.length) : progress;
  const distance = (placement: StreetscapePlacement) => course.circuit
    ? mod(placement.p - p + course.length / 2, course.length) - course.length / 2 : placement.p - p;
  const select = (placements: readonly StreetscapePlacement[], budget: number, variantLimits?: readonly number[]) => {
    const candidates = placements.map(placement => ({ placement, distance: distance(placement) }))
      .filter(candidate => candidate.distance >= -behind && candidate.distance <= ahead)
      .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance) || a.placement.id.localeCompare(b.placement.id));
    const chosen: StreetscapePlacement[] = [], counts = new Map<number, number>();
    for (const candidate of candidates) {
      if (chosen.length >= budget) break;
      const variant = candidate.placement.variant, count = counts.get(variant) ?? 0;
      if (variantLimits && count >= (variantLimits[variant] ?? 0)) continue;
      chosen.push(candidate.placement); counts.set(variant, count + 1);
    }
    return chosen.sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id));
  };
  return { buildings: select(layout.buildings, options.buildingBudget ?? 48, options.buildingVariants ?? [12, 12, 12, 12]),
    apartments: select(layout.apartments, options.apartmentBudget ?? 20, options.apartmentVariants ?? [10, 10]),
    trees: select(layout.trees, options.treeBudget ?? 40) };
}

/** Apply this to the existing forest, woodland and understory placements as well. */
export function streetscapePlantingClear(layout: StreetscapeLayout, progress: number, side: StreetscapeSide, clearance: number, radius = 5.1): boolean {
  const at = poseAt(layout.course, progress), center = centerAt(at, side, clearance);
  const bounds = { minX: center.x - radius, maxX: center.x + radius, minZ: center.z - radius, maxZ: center.z + radius };
  const nearby = indices.get(layout)?.buildings.query(bounds) ?? [...layout.buildings, ...layout.apartments];
  return nearby.every(building => !circleTouches(building.footprint, center, radius + .4));
}
