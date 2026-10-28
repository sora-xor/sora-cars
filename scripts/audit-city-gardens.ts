import type * as Three from 'three';
import type { CityGardenLayout, CityGardenSource } from '../src/game/three/city-gardens';
import type { CityPlotLayout } from '../src/game/three/city-plots';
import type { StreetscapeFootprint } from '../src/game/three/streetscape';

/** Browser-side, read-only audit for the ACTUAL completed course world.
 * After test-streetscape-3d has initialized window.__streetscapeCheck:
 *
 * const result = await page.evaluate(async () => {
 *   const { auditCityGardens } = await import('/scripts/audit-city-gardens.ts');
 *   return auditCityGardens(window.__streetscapeCheck);
 * });
 * assert.deepEqual(result.violations, []);
 *
 * This does not create synthetic layouts, mutate selection or render a frame.
 */
export function auditCityGardens(f: {
  THREE: typeof Three;
  world: {
    cityGardenLayout?: CityGardenLayout;
    cityPlotLayout?: CityPlotLayout;
    cityGround?: (x: number, z: number) => number | null;
    cityGardenBatch: { sources: readonly CityGardenSource[]; group: Three.Group };
  };
}) {
  const THREE = f.THREE, world = f.world, layout = world.cityGardenLayout, plots = world.cityPlotLayout;
  if (!layout || !plots || !world.cityGround) throw new Error('Audit requires the actual initialized Tokyo garden, court and ground layouts.');
  const batch = world.cityGardenBatch, sources = batch.sources, plotById = new Map(plots.plots.map(plot => [plot.id, plot]));
  const violations: string[] = [];
  const fail = (message: string) => { if (violations.length < 32) violations.push(message); };
  const sourceStats = sources.map((source, variant) => ({ variant, triangles: source.triangles,
    bounds: { min: source.bounds.min.toArray(), max: source.bounds.max.toArray() } }));
  type Point = readonly [number, number];
  const area = (polygon: readonly Point[]) => polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length]!; return sum + a[0] * b[1] - a[1] * b[0];
  }, 0) / 2;
  const intersection = (subject: readonly Point[], clip: readonly Point[]): number => {
    let out = [...subject]; const direction = Math.sign(area(clip));
    for (let edge = 0; edge < clip.length && out.length; edge++) {
      const a = clip[edge]!, b = clip[(edge + 1) % clip.length]!, input = out; out = [];
      const side = (p: Point) => direction * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
      for (let i = 0; i < input.length; i++) {
        const previous = input[(i + input.length - 1) % input.length]!, current = input[i]!, start = side(previous), end = side(current);
        if ((start >= 0) !== (end >= 0)) {
          const t = start / (start - end); out.push([previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t]);
        }
        if (end >= 0) out.push(current);
      }
    }
    return out.length < 3 ? 0 : Math.abs(area(out));
  };
  const rectangle = (frame: StreetscapeFootprint): Point[] => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => [
    frame.x + Math.cos(frame.heading) * frame.halfX * x! + Math.sin(frame.heading) * frame.halfZ * z!,
    frame.z - Math.sin(frame.heading) * frame.halfX * x! + Math.cos(frame.heading) * frame.halfZ * z!,
  ]);
  const obstructions: { id: string; polygon: readonly Point[]; minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  const addObstruction = (id: string, polygon: readonly Point[]) => obstructions.push({ id, polygon,
    minX: Math.min(...polygon.map(p => p[0])), maxX: Math.max(...polygon.map(p => p[0])),
    minZ: Math.min(...polygon.map(p => p[1])), maxZ: Math.max(...polygon.map(p => p[1])) });
  for (const plot of plots.plots) {
    for (const [index, solid] of plot.solids.entries()) addObstruction(`${plot.id}/solid/${index}`, rectangle({
      x: solid.position[0], z: solid.position[2], halfX: solid.size[0] / 2, halfZ: solid.size[2] / 2, heading: solid.heading }));
    for (let i = 1; i < plot.access.length; i++) {
      const a = plot.access[i - 1]!, b = plot.access[i]!;
      // 1.30 m encloses the actual 0.9 m paving strip including its 1.42x
      // corner mitres. Gate and corridor remain independently tested above.
      addObstruction(`${plot.id}/path/${i}`, rectangle({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2,
        halfX: 1.3, halfZ: Math.hypot(b.x - a.x, b.z - a.z) / 2, heading: Math.atan2(b.x - a.x, b.z - a.z) }));
    }
  }
  const samplePaving = (paving: readonly number[], x: number, z: number): number | null => {
    let highest: number | null = null;
    for (let i = 0; i < paving.length; i += 9) {
      const ax = paving[i]!, ay = paving[i + 1]!, az = paving[i + 2]!, bx = paving[i + 3]!, by = paving[i + 4]!, bz = paving[i + 5]!,
        cx = paving[i + 6]!, cy = paving[i + 7]!, cz = paving[i + 8]!;
      const divisor = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(divisor) < 1e-9) continue;
      const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / divisor,
        b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / divisor;
      if (a < -1e-7 || b < -1e-7 || a + b > 1 + 1e-7) continue;
      const y = a * ay + b * by + (1 - a - b) * cy; highest = highest === null ? y : Math.max(y, highest);
    }
    return highest;
  };
  const point = new THREE.Vector3(), model = new THREE.Matrix4(), courtInverse = new THREE.Matrix4(), courtPoint = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1), translation = new THREE.Vector3(), rotation = new THREE.Quaternion();
  let vertices = 0, contacts = 0, minimumCourtInset = Infinity, minimumCentralHalfWidth = Infinity;
  let maximumGroundContactError = 0, maximumPavingContactError = 0, maximumObstructionOverlap = 0;
  const rows: { id: string; plotId: string; variant: number; vertices: number; contacts: number; courtInset: number; corridorHalfWidth: number }[] = [];
  for (const placement of layout.placements) {
    const plot = plotById.get(placement.plotId);
    if (!plot || plot.buildingId !== placement.buildingId) { fail(`${placement.id}: missing completed court/building`); continue; }
    const source = sources[placement.variant]; if (!source) { fail(`${placement.id}: missing completed source`); continue; }
    model.compose(translation.fromArray(placement.position), rotation.fromArray(placement.quaternion), scale);
    courtInverse.makeRotationY(plot.court.heading).setPosition(plot.court.x, 0, plot.court.z).invert();
    const sourceEnvelope = new THREE.Box3();
    let rowVertices = 0, rowContacts = 0, rowInset = Infinity, rowHalfWidth = Infinity;
    for (const [role, geometry] of Object.entries(source.parts)) {
      const position = geometry.getAttribute('position'); if (!position) continue;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(model); courtPoint.copy(point).applyMatrix4(courtInverse);
        sourceEnvelope.expandByPoint(courtPoint); vertices++; rowVertices++;
        const inset = Math.min(plot.court.halfX - Math.abs(courtPoint.x), plot.court.halfZ - Math.abs(courtPoint.z)), halfWidth = Math.abs(courtPoint.x);
        minimumCourtInset = Math.min(minimumCourtInset, inset); minimumCentralHalfWidth = Math.min(minimumCentralHalfWidth, halfWidth);
        rowInset = Math.min(rowInset, inset); rowHalfWidth = Math.min(rowHalfWidth, halfWidth);
        if (inset < .18 - 1e-6 || halfWidth < 1.2 - 1e-6) fail(`${placement.id}: finished ${role} vertex leaves court/corridor clearance`);
        if ((role === 'clay' || role === 'concrete') && Math.abs(position.getY(i)) < 1e-7) {
          contacts++; rowContacts++;
          const ground = world.cityGround!(point.x, point.z), pavement = samplePaving(plot.paving, point.x, point.z);
          if (ground === null || pavement === null) { fail(`${placement.id}: saucer lacks actual ground/paving support`); continue; }
          const groundError = Math.abs(point.y - ground - .024), pavingError = Math.abs(point.y - pavement);
          maximumGroundContactError = Math.max(maximumGroundContactError, groundError);
          maximumPavingContactError = Math.max(maximumPavingContactError, pavingError);
          if (groundError > .005 || pavingError > .005) fail(`${placement.id}: saucer contact exceeds 5 mm (${groundError.toFixed(6)} ground, ${pavingError.toFixed(6)} paving)`);
        }
      }
    }
    // A convex rectangle containing every actual transformed vertex also
    // contains every triangle interior; clipping it cannot miss an obstacle
    // crossing through a leaf or vessel between sampled vertices.
    const center = sourceEnvelope.getCenter(new THREE.Vector3()), size = sourceEnvelope.getSize(new THREE.Vector3());
    center.applyMatrix4(courtInverse.clone().invert());
    const projection = rectangle({ x: center.x, z: center.z, heading: plot.court.heading, halfX: size.x / 2, halfZ: size.z / 2 });
    const xs = projection.map(p => p[0]), zs = projection.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    for (const obstacle of obstructions) if (maxX >= obstacle.minX && minX <= obstacle.maxX && maxZ >= obstacle.minZ && minZ <= obstacle.maxZ) {
      const overlap = intersection(projection, obstacle.polygon); maximumObstructionOverlap = Math.max(maximumObstructionOverlap, overlap);
      if (overlap > 1e-6) fail(`${placement.id}: completed source envelope overlaps ${obstacle.id} by ${overlap.toFixed(6)} m²`);
    }
    rows.push({ id: placement.id, plotId: placement.plotId, variant: placement.variant, vertices: rowVertices, contacts: rowContacts,
      courtInset: rowInset, corridorHalfWidth: rowHalfWidth });
  }
  const visibleIds = batch.group.userData.cityGardenStats.ids as string[];
  const selected = layout.placements.filter(p => visibleIds.includes(p.id));
  const instance = new THREE.Matrix4(), visible = batch.group.children as Three.InstancedMesh[];
  let checkedInstances = 0, maximumInstanceMatrixError = 0;
  for (const mesh of visible) {
    const match = /^City garden (\d+) (\w+)$/.exec(mesh.name);
    if (!match) { fail(`Unexpected garden mesh ${mesh.name}`); continue; }
    const variant = Number(match[1]), role = match[2] as keyof CityGardenSource['parts'];
    if (mesh.geometry !== sources[variant]!.parts[role]) fail(`${mesh.name}: instance geometry is not the shared finished source`);
    const expected = selected.filter(p => p.variant === variant);
    if (mesh.count !== expected.length || mesh.visible !== (expected.length > 0)) fail(`${mesh.name}: stale or missing selected instances`);
    for (const [i, placement] of expected.entries()) {
      mesh.getMatrixAt(i, instance); model.compose(translation.fromArray(placement.position), rotation.fromArray(placement.quaternion), scale);
      const error = Math.max(...model.elements.map((v, j) => Math.abs(v - instance.elements[j]!)));
      maximumInstanceMatrixError = Math.max(maximumInstanceMatrixError, error); checkedInstances++;
      if (error > .0003) fail(`${mesh.name}/${placement.id}: emitted transform differs by ${error}`);
    }
  }
  if (!layout.placements.length || !vertices || !contacts) fail('Actual full-course geometry/support evidence is empty.');
  return { pass: !violations.length, violations, courts: plots.plots.length, assemblies: layout.placements.length,
    visibleAssemblies: selected.length, sourceStats, vertices, contacts, checkedInstances, minimumCourtInset, minimumCentralHalfWidth,
    maximumGroundContactError, maximumPavingContactError, maximumObstructionOverlap, maximumInstanceMatrixError, rows };
}
