import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scannedSurface } from './surfaces';

type RoadPose = { x: number; y: number; z: number; heading: number; width: number; p: number };

const position = (p: RoadPose, side: number, height: number) => new THREE.Vector3(
  p.x + Math.cos(p.heading) * side, p.y + height, p.z - Math.sin(p.heading) * side,
);

/** Roadside civil work uses the same route samples as the tarmac. */
/** `boundaryWalls` (default on) may choose per progress and side, so a town can drop the walls its lots replace. */
export function createRoadsideInfrastructure(poses: RoadPose[], urban: boolean,
  boundaryWalls: boolean | ((p: number, side: number) => boolean) = true): THREE.Group {
  const group = new THREE.Group(); group.name = 'Route sidewalks, retaining stone and utility service';
  const concrete = new THREE.MeshStandardMaterial({ ...scannedSurface('grey_plaster_03'), color: '#aaa9a3', roughness: 0.92, normalScale: new THREE.Vector2(0.3, 0.3) });
  const stone = new THREE.MeshStandardMaterial({ ...scannedSurface('japanese_stone_wall'), color: '#b1ada2', roughness: 0.97, normalScale: new THREE.Vector2(0.7, 0.7) });
  const metal = new THREE.MeshStandardMaterial({ color: '#4d4d45', roughness: 0.68, metalness: 0.42 });
  const ceramic = new THREE.MeshStandardMaterial({ color: '#908e85', roughness: 0.4, metalness: 0.03 });
  const cable = new THREE.MeshStandardMaterial({ color: '#222425', roughness: 0.86 });
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4) => {
    if (matrix) geometry.applyMatrix4(matrix);
    const parts = batches.get(material) ?? []; parts.push(geometry); batches.set(material, parts);
  };
  const transform = (p: RoadPose, lateral: number, up: number) => new THREE.Matrix4().compose(position(p, lateral, up),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading), new THREE.Vector3(1, 1, 1));
  const tube = (points: THREE.Vector3[], radius: number, segments: number, material: THREE.Material) =>
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 5, false), material);

  // Continuous curb cross-sections with a beveled upper edge. The walkable
  // shoulder lies outside the native road edge and never changes its width.
  const section = (material: THREE.Material, profile: number[][], side: number, name: string,
    include: (p: RoadPose) => boolean = () => true) => {
    const vertices: number[] = [], uvs: number[] = [];
    for (let i = 0; i < poses.length - 1; i++) {
      const a = poses[i]!, b = poses[i + 1]!; if (!include(a)) continue;
      for (let j = 0; j < profile.length - 1; j++) {
        const edge = profile[j]!, next = profile[j + 1]!;
        const corners = [position(a, side * (a.width + edge[0]!), edge[1]!), position(b, side * (b.width + edge[0]!), edge[1]!),
          position(b, side * (b.width + next[0]!), next[1]!), position(a, side * (a.width + next[0]!), next[1]!)];
        const uv = [[a.p / 2.4, edge[1]! / 2.4], [b.p / 2.4, edge[1]! / 2.4], [b.p / 2.4, (next[1]! + next[0]! - edge[0]!) / 2.4], [a.p / 2.4, (next[1]! + next[0]! - edge[0]!) / 2.4]];
        for (const k of side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { vertices.push(...corners[k]!.toArray()); uvs.push(...uv[k]!); }
      }
    }
    if (!vertices.length) return;
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  };
  for (const side of [-1, 1]) {
    section(concrete, [[0.25, -0.04], [0.25, 0.12], [0.31, 0.18], [1.6, 0.18], [1.67, 0.1], [1.67, -0.04]], side, 'Beveled curb and sidewalk');
    const height = urban ? 1.25 : 1.85;
    const walled = (p: RoadPose) => typeof boundaryWalls === 'function' ? boundaryWalls(p.p, side) : boundaryWalls;
    const wallRuns = (p: RoadPose) => walled(p) && (urban ? Math.floor(p.p / 24) % 5 !== 0 : Math.floor(p.p / 32) % 6 !== 0);
    section(stone, [[13.6, -0.08], [13.6, height], [14.05, height], [14.05, -0.08]], side, 'Masonry boundary retaining wall', wallRuns);
    section(concrete, [[13.52, height], [13.52, height + 0.13], [14.13, height + 0.13], [14.13, height]], side, 'Stone wall coping', wallRuns);
  }

  // Cast-concrete utility poles, crossarms, ceramic insulators and gravity-sagged
  // service conductors put ordinary, human-scale detail against the sky.
  const poles: RoadPose[] = [];
  let last = -Infinity;
  for (const p of poses) {
    if (p.p - last < 46) continue; last = p.p; poles.push(p);
    const lateral = -(p.width + 2.4);
    add(new THREE.CylinderGeometry(0.095, 0.19, 9.2, 10), concrete, transform(p, lateral, 4.6));
    add(new THREE.BoxGeometry(1.5, 0.12, 0.15), metal, transform(p, lateral, 8.5));
    add(new THREE.BoxGeometry(0.15, 1.15, 0.1), metal, transform(p, lateral, 8.05));
    for (const arm of [-0.6, 0, 0.6]) {
      for (let ring = 0; ring < 3; ring++) add(new THREE.CylinderGeometry(0.07, 0.095, 0.04, 8), ceramic, transform(p, lateral + arm, 8.64 + ring * 0.055));
    }
    for (const y of [3.7, 4.0, 4.3, 4.6]) add(new THREE.BoxGeometry(0.36, 0.025, 0.035), metal, transform(p, lateral, y));
  }
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i]!, b = poles[i + 1]!;
    for (const arm of [-0.6, 0, 0.6]) {
      const start = position(a, -(a.width + 2.4) + arm, 8.8), end = position(b, -(b.width + 2.4) + arm, 8.8);
      const middle = start.clone().lerp(end, 0.5); middle.y -= 0.9;
      tube([start, middle, end], 0.012, 12, cable);
    }
  }
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  return group;
}

/** Pressed W-beam steel profile, one metre along local Z for instancing. */
export function guardrailGeometry(): THREE.BufferGeometry {
  const profile = [[-0.01, -0.14], [0.045, -0.11], [-0.025, -0.035], [-0.035, 0], [-0.025, 0.035], [0.045, 0.11], [-0.01, 0.14]];
  const shape = new THREE.Shape();
  profile.forEach(([x, y], i) => i ? shape.lineTo(x!, y!) : shape.moveTo(x!, y!));
  [...profile].reverse().forEach(([x, y]) => shape.lineTo(x! + 0.007, y!)); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, steps: 1, bevelEnabled: false }); geometry.translate(0, 0, -0.5);
  return geometry;
}
