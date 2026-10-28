import * as THREE from 'three';

const WELD_METRES = 1e-5;
const TOPOLOGY_VERSION = 2;
const CURVATURE_START = 2;
const CURVATURE_FULL = 18;

interface WeldedVertex {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  fallbackNormal: THREE.Vector3;
  neighbours: Set<number>;
}

export interface EnamelTopologyRecord {
  mesh: string;
  vertices: number;
  weldedVertices: number;
  triangles: number;
  seamDuplicates: number;
  degenerateTriangles: number;
  zeroNormals: number;
  convexVertices: number;
  cavityVertices: number;
  maxConvexPerMetre: number;
  maxCavityPerMetre: number;
}

export interface EnamelTopologyDiagnostics {
  meshesPrepared: number;
  geometriesPrepared: number;
  meshesAlreadyPrepared: number;
  vertices: number;
  weldedVertices: number;
  triangles: number;
  convexVertices: number;
  cavityVertices: number;
  records: EnamelTopologyRecord[];
}

function smoothMask(curvature: number): number {
  const x = THREE.MathUtils.clamp((curvature - CURVATURE_START) / (CURVATURE_FULL - CURVATURE_START), 0, 1);
  return x * x * (3 - 2 * x);
}

function prepareGeometry(source: THREE.BufferGeometry): {
  geometry: THREE.BufferGeometry;
  record: Omit<EnamelTopologyRecord, 'mesh'>;
} {
  const positions = source.getAttribute('position');
  const normals = source.getAttribute('normal');
  const indices = source.index;
  if (!positions || positions.itemSize !== 3) throw new Error('Enamel topology needs vec3 positions.');
  const indexCount = indices?.count ?? positions.count;
  if (indexCount % 3) throw new Error('Enamel topology needs triangle geometry.');
  if (normals && normals.count !== positions.count) throw new Error('Enamel topology normal count differs from positions.');

  const vertices: WeldedVertex[] = [];
  const weld = new Uint32Array(positions.count);
  const cells = new Map<string, number[]>();
  const rest = new Float32Array(positions.count * 3);
  const point = new THREE.Vector3();
  const toleranceSquared = WELD_METRES * WELD_METRES;
  const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('Enamel topology found a non-finite position.');
    rest.set([point.x, point.y, point.z], i * 3);
    const x = Math.floor(point.x / WELD_METRES);
    const y = Math.floor(point.y / WELD_METRES);
    const z = Math.floor(point.z / WELD_METRES);
    let found = -1;
    // Neighbour cells matter: a single rounded key would split two positions
    // less than the tolerance apart when they straddle a grid-cell boundary.
    search: for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const candidate of cells.get(cellKey(x + dx, y + dy, z + dz)) ?? []) {
        if (vertices[candidate]!.position.distanceToSquared(point) <= toleranceSquared) {
          found = candidate;
          break search;
        }
      }
    }
    if (found < 0) {
      found = vertices.length;
      vertices.push({ position: point.clone(), normal: new THREE.Vector3(),
        fallbackNormal: new THREE.Vector3(), neighbours: new Set() });
      const key = cellKey(x, y, z);
      const bucket = cells.get(key) ?? [];
      bucket.push(found);
      cells.set(key, bucket);
    }
    weld[i] = found;
    if (normals) {
      const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
      if ([nx, ny, nz].every(Number.isFinite)) vertices[found]!.fallbackNormal.add(new THREE.Vector3(nx, ny, nz));
    }
  }

  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), bc = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  let degenerateTriangles = 0;
  for (let offset = 0; offset < indexCount; offset += 3) {
    const original = [0, 1, 2].map(corner => indices ? indices.getX(offset + corner) : offset + corner);
    if (original.some(index => !Number.isInteger(index) || index < 0 || index >= positions.count)) {
      throw new Error('Enamel topology found an out-of-range triangle index.');
    }
    const [ia, ib, ic] = original.map(index => weld[index]!) as [number, number, number];
    const a = vertices[ia]!, b = vertices[ib]!, c = vertices[ic]!;
    ab.subVectors(b.position, a.position);
    ac.subVectors(c.position, a.position);
    bc.subVectors(c.position, b.position);
    faceNormal.crossVectors(ab, ac);
    const twiceArea = faceNormal.length();
    if (ia === ib || ib === ic || ic === ia || twiceArea < 1e-14) {
      degenerateTriangles++;
      continue;
    }
    faceNormal.multiplyScalar(1 / twiceArea);
    // Angle weighting is independent of texture seams and less sensitive than
    // face-area weighting to large planar triangles next to narrow bevels.
    const angleA = Math.atan2(twiceArea, ab.dot(ac));
    const angleB = Math.atan2(twiceArea, -ab.dot(bc));
    const angleC = Math.max(0, Math.PI - angleA - angleB);
    a.normal.addScaledVector(faceNormal, angleA);
    b.normal.addScaledVector(faceNormal, angleB);
    c.normal.addScaledVector(faceNormal, angleC);
    a.neighbours.add(ib).add(ic);
    b.neighbours.add(ia).add(ic);
    c.neighbours.add(ia).add(ib);
  }

  let zeroNormals = 0;
  for (const vertex of vertices) {
    if (vertex.normal.lengthSq() < 1e-16) vertex.normal.copy(vertex.fallbackNormal);
    if (vertex.normal.lengthSq() < 1e-16) { zeroNormals++; vertex.normal.set(0, 0, 0); }
    else vertex.normal.normalize();
  }
  const convex = new Float32Array(vertices.length), cavity = new Float32Array(vertices.length);
  const edge = new THREE.Vector3(), normalDelta = new THREE.Vector3();
  const tangent = new THREE.Vector3(), bitangent = new THREE.Vector3();
  let maxConvexPerMetre = 0, maxCavityPerMetre = 0;
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i]!;
    if (current.normal.lengthSq() < .5) continue;
    // Fit dN = S dP in the local tangent plane. Averaging directional normal
    // changes instead would make curvature depend on triangulation: long
    // axial edges can almost erase a tightly curved cylindrical bevel.
    tangent.set(Math.abs(current.normal.x) < .8 ? 1 : 0,
      Math.abs(current.normal.x) < .8 ? 0 : 1, 0);
    tangent.addScaledVector(current.normal, -tangent.dot(current.normal)).normalize();
    bitangent.crossVectors(current.normal, tangent);
    let xx = 0, xy = 0, yy = 0, nx = 0, ny = 0, bx = 0, by = 0;
    for (const neighbourIndex of current.neighbours) {
      const neighbour = vertices[neighbourIndex]!;
      if (neighbour.normal.lengthSq() < .5) continue;
      edge.subVectors(neighbour.position, current.position);
      const distanceSquared = edge.lengthSq();
      if (distanceSquared <= toleranceSquared * 4) continue;
      normalDelta.subVectors(neighbour.normal, current.normal);
      const x = edge.dot(tangent), y = edge.dot(bitangent);
      const normalX = normalDelta.dot(tangent), normalY = normalDelta.dot(bitangent);
      // Equal weight for directional samples keeps the fit independent of
      // edge length while retaining inverse-metre units in the operator.
      const weight = 1 / distanceSquared;
      xx += x * x * weight; xy += x * y * weight; yy += y * y * weight;
      nx += normalX * x * weight; ny += normalX * y * weight;
      bx += normalY * x * weight; by += normalY * y * weight;
    }
    const determinant = xx * yy - xy * xy;
    if (determinant > 1e-10 * (xx + yy) * (xx + yy)) {
      const a = (nx * yy - ny * xy) / determinant;
      const d = (by * xx - bx * xy) / determinant;
      const b = ((ny * xx - nx * xy) + (bx * yy - by * xy)) / (2 * determinant);
      const centre = (a + d) * .5;
      const radius = Math.hypot((a - d) * .5, b);
      // The symmetric operator's eigenvalues are the principal curvatures:
      // +1/r on an outward sphere; {0,+1/r} on a cylinder; reversed in a
      // cavity. Keep convex and concave contributions separate at saddles.
      const first = THREE.MathUtils.clamp(centre + radius, -250, 250);
      const second = THREE.MathUtils.clamp(centre - radius, -250, 250);
      const positive = (Math.max(0, first) + Math.max(0, second)) * .5;
      const negative = (Math.max(0, -first) + Math.max(0, -second)) * .5;
      maxConvexPerMetre = Math.max(maxConvexPerMetre, positive);
      maxCavityPerMetre = Math.max(maxCavityPerMetre, negative);
      convex[i] = smoothMask(positive);
      cavity[i] = smoothMask(negative);
    }
  }

  // Two strictly local 2cm steps extend a lip softly by at most 4cm along its
  // connected surface. They cannot jump to another nearby disconnected panel.
  const soften = (sourceMask: Float32Array): Float32Array => {
    let current = sourceMask;
    for (let pass = 0; pass < 2; pass++) {
      const next = current.slice();
      for (let i = 0; i < vertices.length; i++) {
        for (const neighbour of vertices[i]!.neighbours) {
          const distance = vertices[i]!.position.distanceTo(vertices[neighbour]!.position);
          const falloff = Math.max(0, 1 - distance / .02) * .75;
          next[i] = Math.max(next[i]!, current[neighbour]! * falloff);
        }
      }
      current = next;
    }
    return current;
  };
  const softConvex = soften(convex), softCavity = soften(cavity);
  const forms = new Float32Array(positions.count * 2);
  let convexVertices = 0, cavityVertices = 0;
  for (let i = 0; i < positions.count; i++) {
    const welded = weld[i]!;
    const x = THREE.MathUtils.clamp(softConvex[welded]!, 0, 1);
    const y = THREE.MathUtils.clamp(softCavity[welded]!, 0, 1);
    forms[i * 2] = x;
    forms[i * 2 + 1] = y;
    if (x > .01) convexVertices++;
    if (y > .01) cavityVertices++;
  }
  const geometry = source.clone();
  // BufferGeometry.copy shares userData by reference in the installed Three
  // version. Own the marker dictionary as well as the cloned attributes.
  geometry.userData = { ...source.userData };
  geometry.setAttribute('enamelRestPosition', new THREE.Float32BufferAttribute(rest, 3));
  geometry.setAttribute('enamelForm', new THREE.Float32BufferAttribute(forms, 2));
  geometry.userData.enamelTopologyVersion = TOPOLOGY_VERSION;
  return { geometry, record: { vertices: positions.count, weldedVertices: vertices.length,
    triangles: indexCount / 3, seamDuplicates: positions.count - vertices.length,
    degenerateTriangles, zeroNormals, convexVertices, cavityVertices,
    maxConvexPerMetre, maxCavityPerMetre } };
}

/**
 * Call on the normalized car BEFORE openGarageHood. Primary positions are
 * already in metres, with source transforms baked by asset-car.ts. The new rest
 * attribute survives the bonnet's position-only hinge translation and keeps
 * paint anchored to the same source surface while it articulates.
 *
 * Only Primary meshes receive owned geometry clones. Original geometry, UVs,
 * normals, indices, materials and triangle counts are unchanged; the closed
 * fleet cars therefore never acquire another instance's attributes. Shared
 * Primary geometry within this one root may reuse its one prepared clone.
 */
export function prepareEnamelTopology(root: THREE.Object3D): EnamelTopologyDiagnostics {
  const result: EnamelTopologyDiagnostics = { meshesPrepared: 0, geometriesPrepared: 0,
    meshesAlreadyPrepared: 0, vertices: 0, weldedVertices: 0, triangles: 0,
    convexVertices: 0, cavityVertices: 0, records: [] };
  const prepared = new Map<THREE.BufferGeometry, ReturnType<typeof prepareGeometry>>();
  const assignments: Array<{ mesh: THREE.Mesh; prepared: ReturnType<typeof prepareGeometry> }> = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some(material => material.name === 'Primary')) return;
    const source = object.geometry;
    if (source.userData.enamelTopologyVersion === TOPOLOGY_VERSION
      && source.getAttribute('enamelRestPosition')?.count === source.getAttribute('position')?.count
      && source.getAttribute('enamelForm')?.count === source.getAttribute('position')?.count) {
      result.meshesAlreadyPrepared++;
      return;
    }
    let entry = prepared.get(source);
    if (!entry) {
      entry = prepareGeometry(source);
      prepared.set(source, entry);
      result.geometriesPrepared++;
    }
    assignments.push({ mesh: object, prepared: entry });
  });
  // Complete validation/preparation before changing any mesh in the root.
  for (const { mesh, prepared: entry } of assignments) {
    mesh.geometry = entry.geometry;
    result.meshesPrepared++;
    for (const key of ['vertices', 'weldedVertices', 'triangles', 'convexVertices', 'cavityVertices'] as const) {
      result[key] += entry.record[key];
    }
    result.records.push({ mesh: mesh.name, ...entry.record });
  }
  return result;
}
