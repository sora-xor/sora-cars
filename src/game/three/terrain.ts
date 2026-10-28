import * as THREE from 'three';

export interface TerrainPose { x: number; y: number; z: number; heading: number; width: number; p: number }

const CLEARANCES = [18, 27, 48, 82, 145] as const;
const HEIGHTS = [0, 1.4, 7.5, 16, 22] as const;
const SEGMENTS = CLEARANCES.slice(1).map((x, i) => x - CLEARANCES[i]!);
const GRADIENTS = SEGMENTS.map((width, i) => (HEIGHTS[i + 1]! - HEIGHTS[i]!) / width);
const TANGENTS = [0, ...[1, 2, 3].map(i => {
  const before = SEGMENTS[i - 1]!, after = SEGMENTS[i]!;
  const a = 2 * after + before, b = after + 2 * before;
  return (a + b) / (a / GRADIENTS[i - 1]! + b / GRADIENTS[i]!);
}), 0];
const GROUND_OFFSET = -0.03;
const clamp = THREE.MathUtils.clamp;

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

/** Actual bank surface height relative to the road's elevation. Clearance is
 * measured OUTWARD from the road edge, independent of the left/right sign.
 * Use this for forest and understory roots; it includes the -3 cm ground offset.
 * The old 18/27/48/82/145 m control heights and longitudinal envelope are kept.
 */
export function terrainHeightAt(clearance: number, progress: number, side: number): number {
  if (!Number.isFinite(clearance) || !Number.isFinite(progress)) return GROUND_OFFSET;
  const distance = clamp(clearance, CLEARANCES[0], CLEARANCES.at(-1)!);
  let band = 0;
  while (band < CLEARANCES.length - 2 && distance > CLEARANCES[band + 1]!) band++;
  const width = SEGMENTS[band]!, t = (distance - CLEARANCES[band]!) / width;
  const t2 = t * t, t3 = t2 * t;
  const profile = (2 * t3 - 3 * t2 + 1) * HEIGHTS[band]!
    + (t3 - 2 * t2 + t) * width * TANGENTS[band]!
    + (-2 * t3 + 3 * t2) * HEIGHTS[band + 1]!
    + (t3 - t2) * width * TANGENTS[band + 1]!;
  const signedSide = side < 0 ? -1 : 1;
  const envelope = 0.72 + 0.28 * Math.sin(progress * 0.013 + signedSide * 2);
  // Low earth irregularity disappears with zero derivative at the preserved
  // control stations. It never creates ridges along the band boundaries.
  const blend = Math.sin(t * Math.PI) ** 2;
  const relief = (noise(progress * 0.12 + signedSide * 41, distance * 0.24) - 0.5)
    * Math.min(0.28, width * 0.025) * blend;
  return profile * envelope + relief + GROUND_OFFSET;
}

type GroundMaps = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; aoMap: THREE.Texture };
const groundMaps = new Map<string, GroundMaps>();
function groundScan(source: 'aerial_grass_rock' | 'sparse_grass') {
  const cached = groundMaps.get(source);
  if (cached) return cached;
  const loader = new THREE.TextureLoader();
  const load = (name: string, color = false) => {
    const texture = loader.load(`${import.meta.env.BASE_URL}assets/materials/${source}/${name}.jpg`);
    texture.name = `Poly Haven ${source} ${name}`;
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  };
  const arm = load('arm');
  const maps = { map: load('color', true), normalMap: load('normal'), roughnessMap: arm, aoMap: arm };
  groundMaps.set(source, maps);
  return maps;
}

function groundMaterial(): THREE.MeshStandardMaterial {
  const moss = groundScan('aerial_grass_rock'), grass = groundScan('sparse_grass');
  const material = new THREE.MeshStandardMaterial({ ...moss, color: '#ffffff',
    vertexColors: true, roughness: 0.96, metalness: 0, normalScale: new THREE.Vector2(0.62, 0.62), aoMapIntensity: 0.7 });
  material.name = 'SORA scanned moss, grass and damp soil';
  // Keep all six original CC0 maps visible to asset readiness checks. The packed
  // surface texture is sampled once and shared by the roughness and AO paths.
  material.userData.terrainTextures = [moss.map, moss.normalMap, moss.roughnessMap,
    grass.map, grass.normalMap, grass.roughnessMap];
  material.customProgramCacheKey = () => 'sora-forest-ground-blend-v1';
  material.onBeforeCompile = shader => {
    shader.uniforms.soraGrassColor = { value: grass.map };
    shader.uniforms.soraGrassNormal = { value: grass.normalMap };
    shader.uniforms.soraGrassSurface = { value: grass.roughnessMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 terrainBlend;\nvarying vec2 vTerrainBlend;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTerrainBlend = terrainBlend;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vTerrainBlend;
uniform sampler2D soraGrassColor;
uniform sampler2D soraGrassNormal;
uniform sampler2D soraGrassSurface;
// Two independently oriented 2 m grass samples break the 15 m moss scan's
// repeated patches. All PBR channels use exactly the same transforms/weights.
const mat2 soraGrassRotationA = mat2(0.3713907, 0.9284767, -0.9284767, 0.3713907);
const mat2 soraGrassRotationB = mat2(-0.8137335, 0.5812382, -0.5812382, -0.8137335);
vec4 soraGrassSample(sampler2D source, vec2 uvA, vec2 uvB) {
  return mix(texture2D(source, uvA), texture2D(source, uvB), vTerrainBlend.y);
}
vec3 soraGrassNormalSample(vec2 uvA, vec2 uvB) {
  vec3 a = texture2D(soraGrassNormal, uvA).xyz * 2.0 - 1.0;
  vec3 b = texture2D(soraGrassNormal, uvB).xyz * 2.0 - 1.0;
  // Row-vector multiplication applies the inverse rotation, keeping each
  // sample's tangent-space relief aligned with its rotated albedo.
  a.xy = a.xy * soraGrassRotationA;
  b.xy = b.xy * soraGrassRotationB;
  return normalize(mix(a, b, vTerrainBlend.y));
}`)
      .replace('#include <map_fragment>', `
vec2 soraGrassUvA = soraGrassRotationA * vMapUv * 7.5 + vec2(17.31, 41.97);
vec2 soraGrassUvB = soraGrassRotationB * vMapUv * 7.5 + vec2(-29.73, 11.23);
vec4 soraTerrainSurface = mix(texture2D(roughnessMap, vRoughnessMapUv),
  soraGrassSample(soraGrassSurface, soraGrassUvA, soraGrassUvB), vTerrainBlend.x);
${THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )',
  'mix(texture2D(map, vMapUv), soraGrassSample(soraGrassColor, soraGrassUvA, soraGrassUvB), vTerrainBlend.x)')}`)
      .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment
        .replace('texture2D( roughnessMap, vRoughnessMapUv )', 'soraTerrainSurface'))
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps
        .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
          'vec3 mapN = normalize(mix(texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0, soraGrassNormalSample(soraGrassUvA, soraGrassUvB), vTerrainBlend.x));'))
      .replace('#include <aomap_fragment>', THREE.ShaderChunk.aomap_fragment
        .replace('texture2D( aoMap, vAoMapUv ).r', 'soraTerrainSurface.r'));
  };
  return material;
}

/** Continuous rural banks outside the existing 18 m clearance. Shared indexed
 * vertices and surface-derived normals avoid flat triangle/band shading.
 * Ground scans retain their measured 2/15 m scale, with independent orientations
 * and continuous world-space blending to suppress repeating texture rows.
 * Native road geometry, car motion, and collision widths are never modified.
 */
export function createTerrain(poses: readonly TerrainPose[], style: number): THREE.Group {
  const group = new THREE.Group(); group.name = 'SORA continuous forest banks';
  group.userData.terrainProfile = 'continuous-forest-bank-v1';
  if (style === 3 || poses.length < 2) return group;
  const material = groundMaterial();

  const stationAt = (p: number): TerrainPose => {
    let lo = 0, hi = poses.length - 1;
    const progress = clamp(p, poses[0]!.p, poses.at(-1)!.p);
    while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (poses[mid]!.p <= progress) lo = mid; else hi = mid; }
    const a = poses[lo]!, b = poses[hi]!, t = (progress - a.p) / (b.p - a.p || 1);
    return { p: progress, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t, width: a.width + (b.width - a.width) * t,
      heading: a.heading + (b.heading - a.heading) * t };
  };
  const positionAt = (p: number, distance: number, side: number, out: THREE.Vector3): THREE.Vector3 => {
    const pose = stationAt(p), lateral = side * (pose.width + distance);
    return out.set(pose.x + Math.cos(pose.heading) * lateral,
      pose.y + terrainHeightAt(distance, pose.p, side), pose.z - Math.sin(pose.heading) * lateral);
  };
  const columns: number[] = [];
  for (let band = 0; band < CLEARANCES.length - 1; band++) {
    const begin = CLEARANCES[band]!, length = SEGMENTS[band]!;
    const count = Math.ceil(length / [1.5, 2, 4, 7][band]!);
    for (let i = 0; i < count; i++) columns.push(begin + length * i / count);
  }
  columns.push(CLEARANCES.at(-1)!);
  const stations: number[] = [];
  for (let i = 0; i < poses.length - 1; i++) {
    const a = poses[i]!, b = poses[i + 1]!, count = Math.max(1, Math.ceil((b.p - a.p) / 2.5));
    for (let j = 0; j < count; j++) stations.push(a.p + (b.p - a.p) * j / count);
  }
  stations.push(poses.at(-1)!.p);
  const position = new THREE.Vector3(), before = new THREE.Vector3(), after = new THREE.Vector3();
  const along = new THREE.Vector3(), outward = new THREE.Vector3(), normal = new THREE.Vector3();
  const epsilon = 0.04;
  let start = 0;
  while (start < stations.length - 1) {
    let end = start + 1;
    while (end < stations.length - 1 && stations[end]! - stations[start]! < 160) end++;
    for (const side of [-1, 1]) {
      const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [], blends: number[] = [], indices: number[] = [];
      for (let row = start; row <= end; row++) for (const distance of columns) {
        const p = stations[row]!;
        positionAt(p, distance, side, position); positions.push(position.x, position.y, position.z);
        positionAt(p - epsilon, distance, side, before); positionAt(p + epsilon, distance, side, after); along.subVectors(after, before);
        positionAt(p, distance - epsilon, side, before); positionAt(p, distance + epsilon, side, after); outward.subVectors(after, before);
        normal.crossVectors(along, outward).multiplyScalar(side).normalize();
        normals.push(normal.x, normal.y, normal.z);
        // Rotate the measured 15 m scan away from the longitudinal road grid.
        const u = (position.x * 0.9323 + position.z * 0.3616) / 15;
        const v = (-position.x * 0.3616 + position.z * 0.9323) / 15;
        uvs.push(u, v);
        const broad = noise(position.x * 0.055, position.z * 0.055);
        const local = noise(position.x * 0.19 + 63, position.z * 0.19 - 19);
        const shade = 0.8 + broad * 0.14 + local * 0.08;
        colors.push(shade * (style === 2 ? 1.015 : 1), shade, shade * 0.97);
        blends.push(0.25 + noise(position.x * 0.12 - 83, position.z * 0.12 + 27) * 0.35,
          0.12 + noise(position.x * 0.25 + 17, position.z * 0.25 - 91) * 0.76);
      }
      for (let row = 0; row < end - start; row++) for (let column = 0; column < columns.length - 1; column++) {
        const a = row * columns.length + column, b = a + 1, c = a + columns.length, d = c + 1;
        indices.push(...(side > 0 ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setAttribute('terrainBlend', new THREE.Float32BufferAttribute(blends, 2));
      geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `Forest bank ${side < 0 ? 'left' : 'right'} ${stations[start]!.toFixed(1)}`;
      mesh.receiveShadow = true;
      mesh.userData.terrainSide = side; mesh.userData.stationStart = stations[start]; mesh.userData.stationEnd = stations[end];
      group.add(mesh);
    }
    start = end;
  }
  return group;
}
