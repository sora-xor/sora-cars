import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CarModel } from './car';
import { createDetailedDriver } from './driver';
import { buildColours, isFactoryHachiroku, resolvedBuild, type CarBuild } from '../car-builds';
import { HACHIROKU_BONNET, HACHIROKU_FRAME, HACHIROKU_WHEEL_WIDTH } from './period-cars/hachiroku';
import { flareTrack, kitPieces, wheelGeometry } from './period-cars/kit';
import { carMaterials, headLamp, neonGlow, neonGlowOpacity, NUMBER_SIZE, STANCE, stripeFrame, tailGlow, tintGlass, type CarDecals } from './period-cars/model';
import { applyFinish, stripeShader, stripeUniforms } from './period-cars/paint';

/** Martin Trafas's detailed period AE86, independently adapted for the race.
 * Primary attribution, licensed redistribution and checksums accompany the GLB.
 */
const MODEL_URL = `${import.meta.env.BASE_URL}assets/models/sora-ae86/ae86.glb`;
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const WHEEL_NAMES = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'] as const;
const SOURCE_WHEELS = ['WHEEL_LF', 'WHEEL_RF', 'WHEEL_LR', 'WHEEL_RR'] as const;
const SOURCE_CALIPERS = ['FL_Caliper', 'FR_Caliper', 'RL_Caliper', 'RR_Caliper'] as const;
interface Surface { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; wheel: number; fixed: boolean; headlight: boolean; shadowIndex?: THREE.BufferAttribute }
interface Wheel { center: THREE.Vector3; radius: number; front: boolean }
interface Template {
  surfaces: Surface[]; wheels: Wheel[]; decals: THREE.BufferGeometry; emblems: THREE.BufferGeometry | null;
  /** The panels the flags and emblems sit on, by their runs in those geometries: a decal goes when its panel does. */
  decalRuns: DecalRun[]; emblemRuns: DecalRun[];
  strip: THREE.BufferGeometry | null; aero: THREE.BufferGeometry; flame: THREE.BufferGeometry;
  /** A build's racing-number roundels (both rear quarters) and windscreen banner. */
  numbers: THREE.BufferGeometry | null; banner: THREE.BufferGeometry | null;
  /** Breakable panels, in CAR_PARTS bit order (src/game/drive/damage.ts). */
  breakage: Breakage;
}
/** Each body surface's index is sorted shell-first, then panel by panel, so a car with missing panels
 * draws the remaining runs of the same shared index as geometry groups: no per-car GPU buffers. */
interface Breakage {
  ranges: ({ shell: number; parts: { start: number; count: number }[] } | null)[];
  /** Per panel: compact pieces centred on the panel, and the centre it tumbles about (car space). */
  parts: { pieces: { surface: number; geometry: THREE.BufferGeometry }[]; centre: THREE.Vector3; size: number }[];
}
const NO_PART = 255;
const PART_COUNT = 12;
/** One patch of a merged decal: its vertices, and the panel it sits on (NO_PART on the shell). */
interface DecalRun { start: number; count: number; part: number }
/** Merge decal patches, keeping each one's run so a car can stop drawing a patch with no extra draw call. */
function mergeDecals(patches: readonly { geometry: THREE.BufferGeometry; part: number }[]): { geometry: THREE.BufferGeometry | null; runs: DecalRun[] } {
  const geometry = patches.length ? mergeGeometries(patches.map(patch => patch.geometry), false) : null, runs: DecalRun[] = [];
  let start = 0;
  for (const { geometry: patch, part } of patches) { const count = patch.getAttribute('position').count; runs.push({ start, count, part }); start += count; }
  for (const { geometry: patch } of patches) patch.dispose();
  return { geometry, runs };
}

/** Which breakable panel a triangle belongs to, from its centroid in the normalized car
 * (metres; +Z forward, ground at y = 0). `left` is the sign of x on the driver's left. */
function panelAt(surface: Surface, x: number, y: number, z: number, left: number): number {
  const material = surface.material.name, onLeft = Math.sign(x) === left, glass = material === 'Windows';
  if (surface.wheel >= 0) return NO_PART;
  if (material === 'LicensePlate') return z > 0 ? 0 : 5;
  if (surface.headlight) return onLeft ? 2 : 3;
  if (material === 'Mirror' || !glass && Math.abs(x) > 0.7 && y > 0.86 && y < 1.08 && z > 0.05 && z < 0.55) return onLeft ? 8 : 9;
  if (z > 1.76 && y < 0.6) return 1;
  if (z < -1.8 && y < 0.64) return 6;
  if (!glass && z > 0.62 && z < 1.95 && y > 0.6 && Math.abs(x) < 0.6) return 4;
  if (!glass && z < -1.25 && y > 0.7 && Math.abs(x) < 0.62) return 7;
  if (!glass && Math.abs(x) > 0.62 && z > -0.5 && z < 0.66 && y > 0.3 && y < 0.88) return onLeft ? 10 : 11;
  return NO_PART;
}

/** Sort every body triangle into a panel and build each panel's own geometry for when it breaks away. */
function prepareBreakage(surfaces: Surface[], left: number): Breakage {
  const parts = Array.from({ length: PART_COUNT }, () => ({ pieces: [] as { surface: number; geometry: THREE.BufferGeometry }[], centre: new THREE.Vector3(), size: 0.2 }));
  const bounds = parts.map(() => new THREE.Box3()), corner = new THREE.Vector3();
  const selections: { surface: number; part: number; index: Uint32Array }[] = [];
  const ranges = surfaces.map((surface, i) => {
    if (surface.wheel >= 0) return null;
    const index = surface.geometry.index!.array, position = surface.geometry.getAttribute('position');
    const buckets: number[][] = Array.from({ length: PART_COUNT + 1 }, () => []);
    for (let t = 0; t < index.length / 3; t++) {
      const a = index[t * 3]!, b = index[t * 3 + 1]!, c = index[t * 3 + 2]!;
      const part = panelAt(surface, (position.getX(a) + position.getX(b) + position.getX(c)) / 3,
        (position.getY(a) + position.getY(b) + position.getY(c)) / 3, (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3, left);
      buckets[part === NO_PART ? 0 : part + 1]!.push(a, b, c);
      if (part !== NO_PART) for (const vertex of [a, b, c]) bounds[part]!.expandByPoint(corner.fromBufferAttribute(position, vertex));
    }
    if (buckets.slice(1).every(bucket => !bucket.length)) return null;
    const sorted = new Uint32Array(index.length), result = { shell: buckets[0]!.length, parts: [] as { start: number; count: number }[] };
    let at = 0;
    buckets.forEach((bucket, k) => {
      sorted.set(bucket, at);
      if (k > 0) {
        result.parts.push({ start: at, count: bucket.length });
        if (bucket.length) selections.push({ surface: i, part: k - 1, index: Uint32Array.from(bucket) });
      }
      at += bucket.length;
    });
    surface.geometry.setIndex(new THREE.BufferAttribute(sorted, 1));
    return result;
  });
  parts.forEach((part, i) => {
    if (bounds[i]!.isEmpty()) return;
    bounds[i]!.getCenter(part.centre); part.size = bounds[i]!.getSize(new THREE.Vector3()).length() / 2;
  });
  for (const { surface, part, index } of selections) {
    parts[part]!.pieces.push({ surface, geometry: compactGeometry(surfaces[surface]!.geometry, index, parts[part]!.centre) });
  }
  return { ranges, parts };
}

/** A small standalone geometry holding only these triangles' vertices, moved so `centre` is its origin. */
function compactGeometry(source: THREE.BufferGeometry, index: Uint32Array, centre: THREE.Vector3): THREE.BufferGeometry {
  const remap = new Map<number, number>(), order: number[] = [];
  const local = index.map(vertex => { let mapped = remap.get(vertex); if (mapped === undefined) { mapped = order.length; remap.set(vertex, mapped); order.push(vertex); } return mapped; });
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize, array = new Float32Array(order.length * size);
    order.forEach((vertex, i) => { for (let k = 0; k < size; k++) array[i * size + k] = attribute.getComponent(vertex, k); });
    geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  geometry.setIndex(new THREE.BufferAttribute(local, 1));
  geometry.translate(-centre.x, -centre.y, -centre.z);
  geometry.computeBoundingSphere();
  return geometry;
}

/** One car's view of a shared surface: the same buffers and index, its own draw groups. */
function groupedGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(source.index);
  geometry.boundingBox = source.boundingBox; geometry.boundingSphere = source.boundingSphere;
  return geometry;
}

interface ShadowIndices { sourceIndexCount: number; vertexCount: number; index: THREE.BufferAttribute }
let templatePromise: Promise<Template> | undefined;

async function loadShadowIndices(): Promise<Map<string, ShadowIndices>> {
  const directory = `${import.meta.env.BASE_URL}assets/models/sora-ae86/`;
  try {
    const [metadataResponse, binaryResponse] = await Promise.all([fetch(`${directory}shadow-indices.json`), fetch(`${directory}shadow-indices.bin`)]);
    if (!metadataResponse.ok || !binaryResponse.ok) return new Map();
    const [metadata, binary] = await Promise.all([metadataResponse.json(), binaryResponse.arrayBuffer()]);
    if (metadata.version !== 1 || metadata.sourceSha256 !== 'cc67905d1d492bf0d2eb8fc632f9baa812449770801a7eea4f7a3b50d02057e0'
      || metadata.maximumErrorMeters !== 0.003 || metadata.byteLength !== binary.byteLength) return new Map();
    const result = new Map<string, ShadowIndices>();
    for (const record of metadata.records) {
      if (!Number.isInteger(record.byteOffset) || record.byteOffset % 4 || !Number.isInteger(record.indexCount)
        || record.indexCount % 3 || record.maxErrorMeters > 0.003) return new Map();
      const array = new Uint32Array(binary, record.byteOffset, record.indexCount);
      if (array.some(index => index >= record.vertexCount)) return new Map();
      result.set(record.key, { sourceIndexCount: record.sourceIndexCount, vertexCount: record.vertexCount, index: new THREE.BufferAttribute(array, 1) });
    }
    return result;
  } catch {
    // Full source shadows remain a correct fallback if a cached optimization
    // pack is missing or belongs to a different source model.
    return new Map();
  }
}

function prepareGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  // Keep authored vertex sharing. This model has detailed upholstery, lamps
  // and machining; expanding every triangle would multiply GPU vertex work.
  const result = geometry.clone();
  if (!result.index) result.setIndex(Array.from({ length: result.getAttribute('position').count }, (_, index) => index));
  for (const name of Object.keys(result.attributes)) if (!['position', 'normal', 'uv', 'uv1'].includes(name)) result.deleteAttribute(name);
  if (!result.hasAttribute('normal')) result.computeVertexNormals();
  for (const name of ['uv', 'uv1']) if (!result.hasAttribute(name)) {
    result.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(result.getAttribute('position').count * 2), 2));
  }
  return result;
}

async function prepareTemplate(): Promise<Template> {
  const shadowIndicesPromise = loadShadowIndices();
  const decoder = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}assets/decoders/draco/`);
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  const { scene } = await loader.loadAsync(MODEL_URL).finally(() => decoder.dispose());
  scene.updateMatrixWorld(true);
  const sourceWheels = SOURCE_WHEELS.map(name => {
    const node = scene.getObjectByName(name);
    if (!node) throw new Error(`Detailed coupe is missing its ${name} wheel pivot.`);
    const center = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
    // Retain the authored wheel machining while removing any source steering.
    const axle = new THREE.Vector3().setFromMatrixColumn(node.matrixWorld, 0).normalize();
    const yaw = Math.atan2(-axle.z, axle.x);
    const adjustment = new THREE.Matrix4().makeTranslation(...center.toArray())
      .multiply(new THREE.Matrix4().makeRotationY(-yaw))
      .multiply(new THREE.Matrix4().makeTranslation(...center.clone().negate().toArray()));
    return { node, center, adjustment };
  });
  const calipers = SOURCE_CALIPERS.map(name => scene.getObjectByName(name));
  const baked: Surface[] = [];
  const allBounds = new THREE.Box3(), bodyBounds = new THREE.Box3();
  const originalGeometries = new Set<THREE.BufferGeometry>();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material;
    if (Array.isArray(material) || !(material instanceof THREE.MeshStandardMaterial)) {
      throw new Error(`Unexpected material on detailed coupe part ${object.name}.`);
    }
    // The source's "Shadow" material is opaque, dimensional grille and intake
    // backing. Preserve it: its name does not identify a flat ground decal.
    let wheel = -1, fixed = false, headlight = false;
    for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) {
      const index = sourceWheels.findIndex(candidate => candidate.node === ancestor);
      if (index >= 0) { wheel = index; break; }
      const caliper = calipers.indexOf(ancestor);
      if (caliper >= 0) { wheel = caliper; fixed = true; break; }
      if (ancestor.name === 'Headlights') headlight = true;
    }
    const matrix = object.matrixWorld.clone();
    if (wheel >= 0) matrix.premultiply(sourceWheels[wheel]!.adjustment);
    const geometry = prepareGeometry(object.geometry);
    geometry.applyMatrix4(matrix); geometry.computeBoundingBox();
    if (matrix.determinant() < 0) {
      // Baked mirrored calipers must keep the source's outward face winding.
      const indices = geometry.index!.array;
      for (let index = 0; index < indices.length; index += 3) {
        const next = indices[index + 1]!;
        indices[index + 1] = indices[index + 2]!;
        indices[index + 2] = next;
      }
    }
    allBounds.union(geometry.boundingBox!);
    if (material.name === 'Primary' && !headlight) bodyBounds.union(geometry.boundingBox!);
    baked.push({ geometry, material, wheel, fixed, headlight });
    originalGeometries.add(object.geometry);
  });
  if (baked.length === 0 || bodyBounds.isEmpty()) throw new Error('Detailed coupe has no paintable body.');
  const dimensions = allBounds.getSize(new THREE.Vector3());
  const center = allBounds.getCenter(new THREE.Vector3());
  const scale = new THREE.Vector3().setScalar(4.18 / dimensions.z);
  const normalization = new THREE.Matrix4().makeScale(...scale.toArray())
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -allBounds.min.y, -center.z));
  const wheelBounds = sourceWheels.map(() => new THREE.Box3());
  const wheels = sourceWheels.map((wheel, index) => ({ center: wheel.center.clone().applyMatrix4(normalization), radius: 0.35, front: index < 2 }));
  const batches = new Map<string, Surface[]>();
  for (const surface of baked) {
    surface.geometry.applyMatrix4(normalization);
    if (surface.wheel >= 0) {
      surface.geometry.computeBoundingBox(); wheelBounds[surface.wheel]!.union(surface.geometry.boundingBox!);
      surface.geometry.translate(...wheels[surface.wheel]!.center.clone().negate().toArray());
    }
    const key = `${surface.wheel}:${surface.fixed}:${surface.headlight}:${surface.material.uuid}`;
    const batch = batches.get(key) ?? []; batch.push(surface); batches.set(key, batch);
  }
  for (let index = 0; index < wheels.length; index++) {
    wheels[index]!.radius = wheelBounds[index]!.getSize(new THREE.Vector3()).y / 2;
  }
  const surfaces: Surface[] = [];
  const shadowIndices = await shadowIndicesPromise;
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.map(surface => surface.geometry), false);
    if (!geometry) throw new Error('Cannot batch detailed coupe geometry.');
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const surface = { ...batch[0]!, geometry };
    const shadow = shadowIndices.get(`${surface.wheel}:${surface.fixed}:${surface.headlight}:${surface.material.name}`);
    if (shadow && shadow.sourceIndexCount === geometry.index?.count && shadow.vertexCount === geometry.attributes.position!.count) surface.shadowIndex = shadow.index;
    surfaces.push(surface);
  }
  for (const surface of baked) surface.geometry.dispose();
  for (const geometry of originalGeometries) geometry.dispose();

  // Project the supplied flag onto the curved metal, retaining its exact art.
  const body = surfaces.find(surface => surface.wheel < 0 && surface.material.name === 'Primary' && !surface.headlight)!;
  const bodyMesh = new THREE.Mesh(body.geometry, body.material);
  bodyMesh.updateMatrixWorld(true);
  // Each flag sits on its door, and goes with it.
  const left = Math.sign(wheels[0]!.center.x) || 1;
  const { geometry: decals, runs: decalRuns } = mergeDecals([-1, 1].map(side => ({ part: side === left ? 10 : 11, geometry: new DecalGeometry(bodyMesh,
    new THREE.Vector3(side * 0.79, 0.76, 0.14), new THREE.Euler(0, side * Math.PI / 2, 0), new THREE.Vector3(0.34, 0.21, 0.2)) })));
  if (!decals || decals.getAttribute('position').count === 0) throw new Error('Detailed coupe flag projection missed its body.');
  // SORA's emblem centred on the roof and the bonnet, upright from the chase camera. The roof's is large (refine round 4):
  // seen at the chase camera's grazing angle a 0.62 m roundel foreshortened to a few rows and its emblem to a smudge,
  // where the cutscenes draw a bold red disc across the roof.
  const upright = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
  const { geometry: emblems, runs: emblemRuns } = mergeDecals(([[new THREE.Vector3(0, 1.27, -0.4), 0.84, NO_PART], [new THREE.Vector3(0, 0.84, 1.3), 0.5, 4]] as const)
    .map(([at, size, part]) => ({ part, geometry: new DecalGeometry(bodyMesh, at, upright, new THREE.Vector3(size, size, 0.3)) }))
    .filter(patch => patch.geometry.getAttribute('position').count > 0));
  // The club strip across the top of the rear window, read upright from the chase camera.
  const glass = surfaces.find(surface => surface.wheel < 0 && surface.material.name === 'Windows');
  let strip: THREE.BufferGeometry | null = null, banner: THREE.BufferGeometry | null = null;
  if (glass) {
    const slope = new THREE.Vector3(0, .354, .935), across = new THREE.Vector3(-1, 0, 0);
    const facing = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, slope, across.clone().cross(slope)));
    const patch = new DecalGeometry(new THREE.Mesh(glass.geometry), new THREE.Vector3(0, 1.147, -1.14), facing, new THREE.Vector3(1, .16, .2));
    if (patch.getAttribute('position').count) strip = patch; else patch.dispose();
    // A build's banner (ハチマキ) across the top of the windscreen, read from ahead (hachiroku.ts: the screen rises 0.325 m over 0.58 m).
    const screen = new THREE.Vector3(0, .325, -.58).normalize(), ahead = new THREE.Vector3(1, 0, 0);
    const front = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ahead, screen, ahead.clone().cross(screen)));
    const top = new DecalGeometry(new THREE.Mesh(glass.geometry), new THREE.Vector3(0, 1.17, .3), front, new THREE.Vector3(1, .12, .2));
    if (top.getAttribute('position').count) banner = top; else top.dispose();
  }
  // Racing numbers on the rear quarters, between the door and the rear wheel.
  const numberPatches = [-1, 1].map(side => new DecalGeometry(bodyMesh, new THREE.Vector3(side * 0.81, 0.7, -0.648), new THREE.Euler(0, side * Math.PI / 2, 0),
    new THREE.Vector3(NUMBER_SIZE, NUMBER_SIZE, 0.2))).filter(patch => patch.getAttribute('position').count > 0);
  const numbers = numberPatches.length ? mergeGeometries(numberPatches, false) : null;
  for (const patch of numberPatches) patch.dispose();
  const lip = new THREE.BoxGeometry(1.5, 0.025, 0.13); lip.translate(0, 0.19, 2.0);
  const aero = lip;
  const flame = new THREE.ConeGeometry(0.064, 0.38, 12, 1, true);
  flame.rotateX(-Math.PI / 2); flame.translate(0, 0, -0.19);
  const breakage = prepareBreakage(surfaces, left);
  return { surfaces, wheels, decals, decalRuns, emblems, emblemRuns, strip, aero, flame, breakage, numbers, banner };
}

/**
 * The most irradiance (scene-linear luminance) a street lamp's, shop light's or headlight's cone puts on a car (refine
 * round 4). With the lamps every 22 m a pool often stands right over the cars, and its full 600 cd a few metres up
 * washed a red coupe out to salmon and its windows to pale grey, where the cutscenes keep the paint red under a soft
 * highlight. The key light and the sky are untouched.
 */
export const CAR_SPOT_CAP = { value: 1 };

/** The race's screen-door fade and lamp cap on a car material; `extra` adds a shader edit of its own (painted stripes). */
export function addDissolve(material: THREE.Material, opacity: { value: number },
  extra?: { compile: (shader: THREE.WebGLProgramParametersWithUniforms) => void; key: string }): void {
  material.onBeforeCompile = shader => {
    extra?.compile(shader);
    shader.uniforms.soraAssetOpacity = opacity;
    shader.uniforms.soraCarSpotCap = CAR_SPOT_CAP;
    // The chunk is expanded here (onBeforeCompile sees only its #include), with the cap after each spot light's info.
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
      'getSpotLightInfo( spotLight, geometryPosition, directLight );',
      `getSpotLightInfo( spotLight, geometryPosition, directLight );
      { float soraSpot = dot( directLight.color, vec3( .2126, .7152, .0722 ) );
        if ( soraSpot > soraCarSpotCap ) directLight.color *= soraCarSpotCap / soraSpot; }`));
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', /* glsl */ `
      uniform float soraAssetOpacity;
      uniform float soraCarSpotCap;
      float soraBayer2(vec2 p) { vec2 c = mod(p, 2.0); return 2.0*c.x + 3.0*c.y - 4.0*c.x*c.y; }
      float soraBayer4(vec2 p) { vec2 c = mod(floor(p), 4.0); return (4.0*soraBayer2(c) + soraBayer2(floor(c*0.5)) + 0.5) / 16.0; }
      void main() {
        if (soraAssetOpacity < 1.0 && soraBayer4(gl_FragCoord.xy) >= soraAssetOpacity) discard;
    `);
  };
  material.customProgramCacheKey = () => extra ? `sora-detailed-coupe-dissolve-v3|${extra.key}` : 'sora-detailed-coupe-dissolve-v3';
}

/** Every detailed car's paint, emblem and underglow materials, for the night's street light (setDetailedCarNight). */
const nightPaint = new Set<THREE.MeshStandardMaterial>(), nightEmblems = new Set<THREE.MeshStandardMaterial>(), nightGlows = new Set<THREE.Material>();
/**
 * After dark (refine round 4) the cars take more of the street's light from their local reflection probe, and SORA's
 * emblems light a little from within: the cutscenes keep a white car warm cream and its roof emblem a bold red disc
 * under the street's lamps, where ours went grey-mauve and the emblem a pink smudge. `night` 0 by day, 1 at night.
 */
let nightLevel = 0;
export function setDetailedCarNight(night: number): void {
  const k = THREE.MathUtils.clamp(Number.isFinite(night) ? night : 0, 0, 1);
  nightLevel = k;
  for (const material of nightPaint) material.envMapIntensity = 1 + 1.2 * k;
  for (const material of nightEmblems) material.emissiveIntensity = .35 * k;
  for (const material of nightGlows) material.opacity = neonGlowOpacity(k);
}
/** Every car's paint, emblems and underglow take the night's street light; the release forgets a car that is replaced. */
export function carNight(paint: THREE.MeshStandardMaterial[], emblems: THREE.MeshStandardMaterial[], glows: THREE.Material[] = []): () => void {
  for (const material of paint) { nightPaint.add(material); material.envMapIntensity = 1 + 1.2 * nightLevel; }
  for (const material of emblems) { nightEmblems.add(material); material.emissiveIntensity = .35 * nightLevel; }
  for (const material of glows) { nightGlows.add(material); material.opacity = neonGlowOpacity(nightLevel); }
  return () => {
    for (const material of paint) nightPaint.delete(material);
    for (const material of emblems) nightEmblems.delete(material);
    for (const material of glows) nightGlows.delete(material);
  };
}

function instantiate(template: Template, { flag, emblem, strip, number }: CarDecals, index: number, driver: THREE.Group, build?: CarBuild): CarModel {
  const group = new THREE.Group(); group.name = `SORA detailed period coupe ${index + 1}`;
  group.userData.asset = 'Toyota AE86 Sprinter Trueno Zenki';
  group.userData.attribution = 'Martin Trafas, CC BY 4.0';
  // A build other than the factory car (car-builds.ts): its paint, stripes, wheels, kit, lights and stance.
  const custom = build && !isFactoryHachiroku(build) ? build : null, colours = custom ? buildColours(custom) : null;
  const stance = STANCE[custom?.stance ?? 'stock'], flares = custom ? flareTrack(custom) : 0;
  // Neutral tire contact locations for world-space trails and smoke.
  // Order is front left, front right, rear left, rear right; +Z is forward.
  group.userData.tyreContacts = template.wheels.map(wheel => [wheel.center.x + Math.sign(wheel.center.x) * flares, 0, wheel.center.z]);
  group.userData.rearTyreContacts = group.userData.tyreContacts.slice(2);
  if (custom) group.userData.build = custom;
  // Everything but the wheels rides on the suspension, so a stance can lower or lift it.
  const body = new THREE.Group(); body.name = 'Body'; body.position.y = stance.drop; group.add(body);
  const opacity = { value: 1 };
  const driverMaterials = new Map<THREE.Material, THREE.Material>();
  driver.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const withFade = (source: THREE.Material) => {
      let material = driverMaterials.get(source);
      if (!material) {
        material = source.clone(); addDissolve(material, opacity);
        driverMaterials.set(source, material);
      }
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(withFade) : withFade(object.material);
  });
  driver.userData.prototype = false;
  body.add(driver);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const paint: THREE.MeshStandardMaterial[] = [], trim: THREE.MeshStandardMaterial[] = [], brakes: THREE.MeshStandardMaterial[] = [];
  const shadowMeshes: THREE.Mesh[] = [];
  const wheelGroups = template.wheels.map((wheel, wheelIndex) => {
    const steering = new THREE.Group(), spin = new THREE.Group(), side = Math.sign(wheel.center.x) || 1;
    steering.name = WHEEL_NAMES[wheelIndex]!; spin.name = `${steering.name} spin`;
    steering.position.copy(wheel.center); steering.position.x += side * flares; steering.rotation.z = -side * stance.camber;
    steering.add(spin); group.add(steering);
    return { steering, spin, side, ...wheel };
  });
  const breakable: { mesh: THREE.Mesh; surface: Surface; material: THREE.Material; ranges: NonNullable<Breakage['ranges'][number]>;
    grouped?: THREE.BufferGeometry; beforeShadow: THREE.Mesh['onBeforeShadow']; afterShadow: THREE.Mesh['onAfterShadow'] }[] = [];
  const surfaceMaterials: THREE.Material[] = [];
  // Stripes and a black bonnet in the paint; the pop-up lamps' lids keep the body colour.
  const paintFrame = stripeFrame(HACHIROKU_FRAME, HACHIROKU_BONNET);
  const stripes = custom && (custom.stripe !== 'none' || custom.bonnet === 'black') ? stripeShader(stripeUniforms(custom, colours!.stripe, paintFrame)) : undefined;
  const lidStripes = custom && custom.stripe !== 'none' ? stripeShader(stripeUniforms(custom, colours!.stripe, paintFrame, false)) : undefined;
  const tails = tailGlow(custom ?? undefined);
  let bodyPaint: THREE.MeshStandardMaterial | undefined;
  const customWheels = custom && custom.wheels !== 'stock';
  for (const [surfaceIndex, surface] of template.surfaces.entries()) {
    const materialKey = `${surface.material.uuid}:${surface.headlight}`;
    let material = materials.get(materialKey);
    if (!material) {
      material = surface.material.clone(); materials.set(materialKey, material);
      material.envMapIntensity = 1;
      if (material.name === 'Primary') {
        paint.push(material); nightPaint.add(material);
        if (!surface.headlight) bodyPaint ??= material;
        // Solid enamel color under a glossy dielectric coat. A metalness of
        // one turns pale period paint into a chrome mirror in the dusk HDR.
        material.metalness = 0;
        material.roughness = 0.26;
        material.envMapIntensity = 1;
        if (material instanceof THREE.MeshPhysicalMaterial) {
          material.clearcoat = 0.85; material.clearcoatRoughness = 0.13;
          material.ior = 1.5; material.specularIntensity = 1;
        }
        if (colours) applyFinish(material, colours.finish);
      } else if (material.name === 'Secondary') {
        trim.push(material);
        material.metalness = 0; material.roughness = 0.34;
        if (material instanceof THREE.MeshPhysicalMaterial) {
          material.clearcoat = 0.7; material.clearcoatRoughness = 0.2;
        }
      }
      else if (/^(Interior|SteeringWheel|Seatbelt|Shadow)/.test(material.name)) material.metalness = 0;
      else if (material.name === 'Reflector') { material.metalness = 0.85; material.roughness = 0.18; }
      else if (material.name === 'RimMaterial') { material.metalness = 0.8; material.roughness = 0.3; }
      if (material.name === 'LampCovers' && material instanceof THREE.MeshPhysicalMaterial) {
        material.transmission = 0; material.opacity = 0.88; material.metalness = 0;
        material.roughness = 0.13; material.clearcoat = 0.7; material.clearcoatRoughness = 0.13;
        material.emissiveMap = material.map;
        material.emissive.set(surface.headlight ? headLamp(custom ?? undefined).emissive : '#ffffff');
        material.emissiveIntensity = surface.headlight ? 1.8 : 0.1;
        material.depthWrite = false;
        // A build's yellow bulbs tint the lenses; smoked tail lamps darken theirs.
        if (surface.headlight && custom?.headlights === 'yellow') material.color.multiply(new THREE.Color('#ffe08a'));
        if (!surface.headlight && custom?.tails === 'smoked') material.color.multiplyScalar(0.42);
        if (!surface.headlight) brakes.push(material);
      }
      // Small automotive windows use ordinary transparent glazing. This avoids
      // a second full-scene transmission render for each frame of the race.
      if (material.name === 'Windows') {
        if (material instanceof THREE.MeshPhysicalMaterial) material.transmission = 0;
        material.transparent = true; material.opacity = 0.36;
        material.color.set('#33444f'); material.roughness = 0.075; material.metalness = 0;
        material.envMapIntensity = 1;
        material.depthWrite = false; material.side = THREE.FrontSide;
        if (custom) tintGlass(material, custom.tint);
      }
      addDissolve(material, opacity, material.name === 'Primary' ? surface.headlight ? lidStripes : stripes : undefined);
    }
    const mesh = new THREE.Mesh(surface.geometry, material);
    mesh.name = `Detailed coupe ${material.name}`;
    mesh.userData.shadowKey = `${surface.wheel}:${surface.fixed}:${surface.headlight}:${material.name}`;
    mesh.castShadow = !['Windows', 'LampCovers'].includes(material.name); mesh.receiveShadow = mesh.castShadow;
    if (mesh.castShadow && surface.shadowIndex) {
      const sourceIndex = surface.geometry.index!;
      mesh.userData.shadowIndexCount = surface.shadowIndex.count;
      // Three invokes these around each shadow draw. Only the depth pass uses
      // the bounded indices; original UVs, normals and full beauty topology are
      // restored immediately, including for shared geometry on the next car.
      mesh.onBeforeShadow = (_renderer, _object, _camera, _shadowCamera, geometry) => { geometry.setIndex(surface.shadowIndex!); };
      mesh.onAfterShadow = (_renderer, _object, _camera, _shadowCamera, geometry) => { geometry.setIndex(sourceIndex); };
    }
    if (mesh.castShadow) shadowMeshes.push(mesh);
    surfaceMaterials[surfaceIndex] = material;
    const ranges = template.breakage.ranges[surfaceIndex];
    if (ranges) breakable.push({ mesh, surface, material, ranges, beforeShadow: mesh.onBeforeShadow, afterShadow: mesh.onAfterShadow });
    // A build's own wheels replace the source rims; the tyres, discs and calipers stay.
    if (customWheels && material.name === 'RimMaterial') mesh.visible = false;
    if (surface.wheel < 0) body.add(mesh);
    else (surface.fixed ? wheelGroups[surface.wheel]!.steering : wheelGroups[surface.wheel]!.spin).add(mesh);
  }
  const flagMaterial = new THREE.MeshStandardMaterial({ map: flag, transparent: true, alphaTest: 0.03,
    roughness: 0.44, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  addDissolve(flagMaterial, opacity);
  const flags = new THREE.Mesh(template.decals, flagMaterial); flags.name = 'Exact SORA flag body decals'; body.add(flags);
  // A flag or emblem goes with its panel: a car's own view of the shared decal draws the patches still on the car.
  const decalViews: { mesh: THREE.Mesh; shared: THREE.BufferGeometry; runs: readonly DecalRun[]; own?: THREE.BufferGeometry }[] = [{ mesh: flags, shared: template.decals, runs: template.decalRuns }];
  let emblemMaterial: THREE.MeshStandardMaterial | null = null;
  if (template.emblems && emblem) {
    emblemMaterial = new THREE.MeshStandardMaterial({ map: emblem, transparent: true, alphaTest: 0.5,
      roughness: 0.4, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      emissive: 0xffffff, emissiveMap: emblem, emissiveIntensity: 0 });
    nightEmblems.add(emblemMaterial);
    addDissolve(emblemMaterial, opacity);
    const emblems = new THREE.Mesh(template.emblems, emblemMaterial); emblems.name = 'Exact SORA emblem roof and bonnet decals'; body.add(emblems);
    decalViews.push({ mesh: emblems, shared: template.emblems, runs: template.emblemRuns });
  }
  let stripMaterial: THREE.MeshStandardMaterial | null = null;
  if (template.strip && strip) {
    stripMaterial = new THREE.MeshStandardMaterial({ map: strip, roughness: 0.35, metalness: 0.02,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    addDissolve(stripMaterial, opacity);
    const banner = new THREE.Mesh(template.strip, stripMaterial); banner.name = 'SORA club strip on the rear window'; body.add(banner);
    if (template.banner && custom?.banner) { const top = new THREE.Mesh(template.banner, stripMaterial); top.name = 'SORA club banner on the windscreen'; body.add(top); }
  }
  let numberMaterial: THREE.MeshStandardMaterial | null = null;
  if (template.numbers && custom?.number && number) {
    numberMaterial = new THREE.MeshStandardMaterial({ map: number(custom.number), transparent: true, alphaTest: 0.03, roughness: 0.42, metalness: 0.02,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    addDissolve(numberMaterial, opacity);
    const numbers = new THREE.Mesh(template.numbers, numberMaterial); numbers.name = `Racing number ${custom.number}`; body.add(numbers);
  }
  // Underglow lights the road round the car.
  const glow = colours?.neon ? neonGlow(HACHIROKU_FRAME, colours.neon) : null;
  if (glow) { addDissolve(glow.material, opacity); nightGlows.add(glow.material); glow.material.opacity = neonGlowOpacity(nightLevel); group.add(glow); }
  const aeroMaterial = new THREE.MeshStandardMaterial({ color: '#20252b', metalness: 0.45, roughness: 0.32 });
  addDissolve(aeroMaterial, opacity);
  const aero = new THREE.Mesh(template.aero, aeroMaterial); aero.name = 'Club aero chin lip'; aero.visible = false; body.add(aero);
  const flameMaterial = new THREE.MeshBasicMaterial({ color: '#72d0ff', transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  addDissolve(flameMaterial, opacity);
  const exhaust = new THREE.Group(); exhaust.name = 'Boost exhaust'; exhaust.visible = false;
  const flame = new THREE.Mesh(template.flame, flameMaterial);
  flame.position.set(0.5, 0.16, -2.08); exhaust.add(flame);
  body.add(exhaust);
  // The build's bolt-on parts and wheels, in its own materials; its paint is the body's.
  const kitMaterials = custom ? carMaterials(custom) : null, kitParted: THREE.Mesh[] = [];
  const thrown = new Map<number, THREE.BufferGeometry[]>();
  let ownHidden = 0;
  if (custom && kitMaterials) {
    for (const material of Object.values(kitMaterials)) addDissolve(material, opacity);
    const resolved = resolvedBuild(custom);
    for (const piece of kitPieces('hachiroku', HACHIROKU_FRAME, custom, { mirrors: resolved.mirrors === 'door', exhaust: resolved.exhaust === 'stock' })) {
      // Painted parts (and body-coloured aero) are painted with the body.
      const painted = piece.material === 'paint' || piece.material === 'aero' && custom.aeroColour === 'body';
      const mesh = new THREE.Mesh(piece.geometry, painted ? bodyPaint ?? paint[0]! : kitMaterials[piece.material]);
      mesh.name = `Kit ${piece.material}`; mesh.castShadow = !['glass', 'head', 'tail', 'amber'].includes(piece.material); mesh.receiveShadow = true;
      mesh.userData.part = piece.part; if (piece.part >= 0) kitParted.push(mesh);
      if (mesh.castShadow) shadowMeshes.push(mesh);
      body.add(mesh);
    }
    // Fender mirrors stand in for the source's door mirrors.
    if (resolved.mirrors === 'fender') ownHidden = 2 ** 8 + 2 ** 9;
    if (resolved.exhaust === 'takeyari') { flame.position.set(-0.65, Math.max(0.17, HACHIROKU_FRAME.bumpers.rear[0] - 0.02) + 1.15, HACHIROKU_FRAME.rear - 0.85); flame.rotation.x = -0.9; }
    if (customWheels) {
      const style = resolved.wheels as Exclude<typeof resolved.wheels, 'stock'>;
      for (const wheel of wheelGroups) {
        const rim = new THREE.Group(); rim.name = 'Build rim'; rim.rotation.y = wheel.side > 0 ? 0 : Math.PI;
        for (const piece of wheelGeometry(style, wheel.radius, HACHIROKU_WHEEL_WIDTH, true).spin) rim.add(new THREE.Mesh(piece.geometry, kitMaterials[piece.material]));
        wheel.spin.add(rim);
      }
    }
  }
  const lowerColour = custom && custom.lower !== 'stock' ? colours!.lower : undefined;
  let lastTime: number | null = null, angle = 0, lastColor = '', lastTrim = '', lastDetached = -1;
  const car: CarModel = {
    group,
    setDamage(detached) {
      if (detached === lastDetached) return;
      lastDetached = detached;
      for (const mesh of kitParted) mesh.visible = !(Math.floor(detached / 2 ** mesh.userData.part) % 2 === 1);
      for (const view of decalViews) {
        const kept = view.runs.filter(run => run.part === NO_PART || Math.floor(detached / 2 ** run.part) % 2 === 0);
        view.mesh.visible = kept.length > 0;
        if (kept.length === view.runs.length) view.mesh.geometry = view.shared;
        else if (kept.length) {
          // At most two patches, so what is left is one unbroken run.
          view.own ??= groupedGeometry(view.shared);
          view.own.setDrawRange(kept[0]!.start, kept.at(-1)!.start + kept.at(-1)!.count - kept[0]!.start);
          view.mesh.geometry = view.own;
        }
      }
      const hidden = detached | ownHidden;
      for (const body of breakable) {
        const { mesh } = body;
        if (!hidden) {
          mesh.geometry = body.surface.geometry; mesh.material = body.material;
          mesh.onBeforeShadow = body.beforeShadow; mesh.onAfterShadow = body.afterShadow;
          continue;
        }
        // Draw the shell and every attached panel; contiguous runs merge into one call.
        const grouped = body.grouped ??= groupedGeometry(body.surface.geometry);
        grouped.clearGroups();
        let start = 0, count = body.ranges.shell;
        body.ranges.parts.forEach((range, part) => {
          if (!range.count) return;
          if (Math.floor(hidden / 2 ** part) % 2 === 1) { if (count) grouped.addGroup(start, count, 0); start = range.start + range.count; count = 0; }
          else count += range.count;
        });
        if (count) grouped.addGroup(start, count, 0);
        // A damaged car's shadow uses its full index: the reduced shadow index has no panel runs.
        mesh.geometry = grouped; mesh.material = [body.material];
        mesh.onBeforeShadow = mesh.onAfterShadow = () => {};
      }
    },
    breakPart(bit) {
      const part = template.breakage.parts[bit];
      if (!part?.pieces.length) return null;
      const piece = new THREE.Group(); piece.name = `Broken-off panel ${bit}`;
      // Fender mirrors stand in for the source's door mirrors, which never break off.
      if (Math.floor(ownHidden / 2 ** bit) % 2 === 0) for (const { surface, geometry } of part.pieces) {
        const mesh = new THREE.Mesh(geometry, surfaceMaterials[surface]!); mesh.castShadow = true; mesh.receiveShadow = true;
        piece.add(mesh);
      }
      // The build's parts bolted to it (a scoop on the bonnet, a lip on the bumper): centred copies, made once per car and released with it.
      const bolted = kitParted.filter(mesh => mesh.userData.part === bit);
      let copies = thrown.get(bit);
      if (!copies) thrown.set(bit, copies = bolted.map(mesh => mesh.geometry.clone().translate(-part.centre.x, -part.centre.y, -part.centre.z)));
      bolted.forEach((mesh, i) => { const copy = new THREE.Mesh(copies![i]!, mesh.material); copy.castShadow = mesh.castShadow; copy.receiveShadow = true; piece.add(copy); });
      piece.position.copy(part.centre); piece.position.y += stance.drop;
      return { object: piece, size: part.size };
    },
    setAppearance(color, accent = '#bbb9b0', hasAero = false) {
      if (color !== lastColor) {
        for (const material of paint) material.color.set(color);
        if (custom?.lower === 'body') for (const material of trim) material.color.set(color);
        lastColor = color;
      }
      if (accent !== lastTrim) {
        for (const material of trim) if (lowerColour) material.color.set(lowerColour); else if (custom?.lower !== 'body') material.color.set(accent).multiplyScalar(0.065);
        lastTrim = accent;
      }
      aero.visible = hasAero && !(custom && custom.front !== 'stock');
    },
    setOpacity(value) {
      const next = Number.isFinite(value) ? clamp(value, 0, 1) : 1;
      if (opacity.value === next) return;
      opacity.value = next;
      for (const mesh of shadowMeshes) mesh.castShadow = next === 1;
    },
    animate(speedMetersPerSecond, steerRadians, braking, boosting, time) {
      const speed = Number.isFinite(speedMetersPerSecond) ? speedMetersPerSecond : 0;
      const now = Number.isFinite(time) ? time : 0;
      if (lastTime !== null && now < lastTime) angle = 0;
      const elapsed = lastTime === null ? 0 : clamp(now - lastTime, 0, 0.1); lastTime = now;
      // The source wheels share the +X axle after their authored poses are
      // corrected. Both sides therefore turn with the same angular sign.
      angle = (angle + speed * elapsed) % (TAU * 1000);
      const steering = Number.isFinite(steerRadians) ? clamp(steerRadians, -0.52, 0.52) : 0;
      for (const wheel of wheelGroups) {
        wheel.steering.rotation.y = wheel.front ? steering : 0;
        wheel.spin.rotation.x = angle / wheel.radius;
      }
      // Tail and parking lamps stay lit on the move, brighter under braking, so wet roads mirror them in red streaks
      // and they glow red-orange in the pixel art as in the user's concept (dim, they read as dark red blocks).
      for (const material of brakes) material.emissiveIntensity = tails[braking ? 1 : 0];
      exhaust.visible = boosting; exhaust.scale.z = boosting ? 0.9 + Math.sin(now * 37) * 0.14 : 1;
    },
    dispose() {
      for (const material of paint) nightPaint.delete(material);
      if (emblemMaterial) nightEmblems.delete(emblemMaterial);
      if (glow) { nightGlows.delete(glow.material); glow.geometry.dispose(); }
      for (const material of [...materials.values(), ...driverMaterials.values(), ...Object.values(kitMaterials ?? {}), flagMaterial, emblemMaterial,
        stripMaterial, numberMaterial, aeroMaterial, flameMaterial, glow?.material]) material?.dispose();
      for (const body of breakable) body.grouped?.dispose();
      for (const view of decalViews) view.own?.dispose();
      for (const copies of thrown.values()) for (const geometry of copies) geometry.dispose();
    },
  };
  car.setAppearance(colours?.paint ?? '#e8e5d9');
  car.setDamage!(0);
  return car;
}

/**
 * Geometry and texture uploads are shared; paint, lights and fade are per car. `emblem` adds SORA's roof and
 * bonnet roundels, `strip` the club strip across the rear window.
 */
export async function loadDetailedCarFleet(flag: THREE.Texture, emblem?: THREE.Texture, strip?: THREE.Texture): Promise<CarModel[]> {
  templatePromise ??= prepareTemplate().catch(error => { templatePromise = undefined; throw error; });
  const [template, drivers] = await Promise.all([
    templatePromise, Promise.all(Array.from({ length: 8 }, () => createDetailedDriver())),
  ]);
  return drivers.map((driver, index) => instantiate(template, { flag, emblem, strip }, index, driver.group));
}

/** One detailed hachiroku to a build (car-builds.ts), with its own seated driver. */
export async function loadDetailedCar(build: CarBuild, decals: CarDecals, index = 0): Promise<CarModel> {
  templatePromise ??= prepareTemplate().catch(error => { templatePromise = undefined; throw error; });
  const [template, driver] = await Promise.all([templatePromise, createDetailedDriver()]);
  return instantiate(template, decals, index, driver.group, build);
}
