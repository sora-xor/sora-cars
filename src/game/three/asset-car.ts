import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CarModel } from './car';
import { createDetailedDriver } from './driver';

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
  strip: THREE.BufferGeometry | null; aero: THREE.BufferGeometry; flame: THREE.BufferGeometry;
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
  const flagPatches = [-1, 1].map(side => new DecalGeometry(bodyMesh,
    new THREE.Vector3(side * 0.79, 0.76, 0.14), new THREE.Euler(0, side * Math.PI / 2, 0), new THREE.Vector3(0.34, 0.21, 0.2)));
  const decals = mergeGeometries(flagPatches, false);
  if (!decals || decals.getAttribute('position').count === 0) throw new Error('Detailed coupe flag projection missed its body.');
  for (const patch of flagPatches) patch.dispose();
  // SORA's emblem centred on the roof and the bonnet, upright from the chase camera. The roof's is large (refine round 4):
  // seen at the chase camera's grazing angle a 0.62 m roundel foreshortened to a few rows and its emblem to a smudge,
  // where the cutscenes draw a bold red disc across the roof.
  const upright = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
  const emblemPatches = ([[new THREE.Vector3(0, 1.27, -0.4), 0.84], [new THREE.Vector3(0, 0.84, 1.3), 0.5]] as const)
    .map(([at, size]) => new DecalGeometry(bodyMesh, at, upright, new THREE.Vector3(size, size, 0.3)))
    .filter(patch => patch.getAttribute('position').count > 0);
  const emblems = emblemPatches.length ? mergeGeometries(emblemPatches, false) : null;
  for (const patch of emblemPatches) patch.dispose();
  // The club strip across the top of the rear window, read upright from the chase camera.
  const glass = surfaces.find(surface => surface.wheel < 0 && surface.material.name === 'Windows');
  let strip: THREE.BufferGeometry | null = null;
  if (glass) {
    const slope = new THREE.Vector3(0, .354, .935), across = new THREE.Vector3(-1, 0, 0);
    const facing = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, slope, across.clone().cross(slope)));
    const patch = new DecalGeometry(new THREE.Mesh(glass.geometry), new THREE.Vector3(0, 1.147, -1.14), facing, new THREE.Vector3(1, .16, .2));
    if (patch.getAttribute('position').count) strip = patch; else patch.dispose();
  }
  const lip = new THREE.BoxGeometry(1.5, 0.025, 0.13); lip.translate(0, 0.19, 2.0);
  const aero = lip;
  const flame = new THREE.ConeGeometry(0.064, 0.38, 12, 1, true);
  flame.rotateX(-Math.PI / 2); flame.translate(0, 0, -0.19);
  return { surfaces, wheels, decals, emblems, strip, aero, flame };
}

/**
 * The most irradiance (scene-linear luminance) a street lamp's, shop light's or headlight's cone puts on a car (refine
 * round 4). With the lamps every 22 m a pool often stands right over the cars, and its full 600 cd a few metres up
 * washed a red coupe out to salmon and its windows to pale grey, where the cutscenes keep the paint red under a soft
 * highlight. The key light and the sky are untouched.
 */
export const CAR_SPOT_CAP = { value: 1 };

function addDissolve(material: THREE.Material, opacity: { value: number }): void {
  material.onBeforeCompile = shader => {
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
  material.customProgramCacheKey = () => 'sora-detailed-coupe-dissolve-v3';
}

/** Every detailed car's paint and emblem materials, for the night's street light (setDetailedCarNight). */
const nightPaint = new Set<THREE.MeshStandardMaterial>(), nightEmblems = new Set<THREE.MeshStandardMaterial>();
/**
 * After dark (refine round 4) the cars take more of the street's light from their local reflection probe, and SORA's
 * emblems light a little from within: the cutscenes keep a white car warm cream and its roof emblem a bold red disc
 * under the street's lamps, where ours went grey-mauve and the emblem a pink smudge. `night` 0 by day, 1 at night.
 */
export function setDetailedCarNight(night: number): void {
  const k = THREE.MathUtils.clamp(Number.isFinite(night) ? night : 0, 0, 1);
  for (const material of nightPaint) material.envMapIntensity = 1 + 1.2 * k;
  for (const material of nightEmblems) material.emissiveIntensity = .35 * k;
}

function instantiate(template: Template, flag: THREE.Texture, emblem: THREE.Texture | undefined, strip: THREE.Texture | undefined,
  index: number, driver: THREE.Group): CarModel {
  const group = new THREE.Group(); group.name = `SORA detailed period coupe ${index + 1}`;
  group.userData.asset = 'Toyota AE86 Sprinter Trueno Zenki';
  group.userData.attribution = 'Martin Trafas, CC BY 4.0';
  // Neutral tire contact locations for world-space trails and smoke.
  // Order is front left, front right, rear left, rear right; +Z is forward.
  group.userData.tyreContacts = template.wheels.map(wheel => [wheel.center.x, 0, wheel.center.z]);
  group.userData.rearTyreContacts = group.userData.tyreContacts.slice(2);
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
  group.add(driver);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const paint: THREE.MeshStandardMaterial[] = [], trim: THREE.MeshStandardMaterial[] = [], brakes: THREE.MeshStandardMaterial[] = [];
  const shadowMeshes: THREE.Mesh[] = [];
  const wheelGroups = template.wheels.map((wheel, wheelIndex) => {
    const steering = new THREE.Group(), spin = new THREE.Group();
    steering.name = WHEEL_NAMES[wheelIndex]!; spin.name = `${steering.name} spin`;
    steering.position.copy(wheel.center); steering.add(spin); group.add(steering);
    return { steering, spin, ...wheel };
  });
  for (const surface of template.surfaces) {
    const materialKey = `${surface.material.uuid}:${surface.headlight}`;
    let material = materials.get(materialKey);
    if (!material) {
      material = surface.material.clone(); materials.set(materialKey, material);
      material.envMapIntensity = 1;
      if (material.name === 'Primary') {
        paint.push(material); nightPaint.add(material);
        // Solid enamel color under a glossy dielectric coat. A metalness of
        // one turns pale period paint into a chrome mirror in the dusk HDR.
        material.metalness = 0;
        material.roughness = 0.26;
        material.envMapIntensity = 1;
        if (material instanceof THREE.MeshPhysicalMaterial) {
          material.clearcoat = 0.85; material.clearcoatRoughness = 0.13;
          material.ior = 1.5; material.specularIntensity = 1;
        }
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
        material.emissive.set(surface.headlight ? '#ffedd4' : '#ffffff');
        material.emissiveIntensity = surface.headlight ? 1.8 : 0.1;
        material.depthWrite = false;
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
      }
      addDissolve(material, opacity);
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
    if (surface.wheel < 0) group.add(mesh);
    else (surface.fixed ? wheelGroups[surface.wheel]!.steering : wheelGroups[surface.wheel]!.spin).add(mesh);
  }
  const flagMaterial = new THREE.MeshStandardMaterial({ map: flag, transparent: true, alphaTest: 0.03,
    roughness: 0.44, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  addDissolve(flagMaterial, opacity);
  const flags = new THREE.Mesh(template.decals, flagMaterial); flags.name = 'Exact SORA flag body decals'; group.add(flags);
  if (template.emblems && emblem) {
    const emblemMaterial = new THREE.MeshStandardMaterial({ map: emblem, transparent: true, alphaTest: 0.5,
      roughness: 0.4, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      emissive: 0xffffff, emissiveMap: emblem, emissiveIntensity: 0 });
    nightEmblems.add(emblemMaterial);
    addDissolve(emblemMaterial, opacity);
    const emblems = new THREE.Mesh(template.emblems, emblemMaterial); emblems.name = 'Exact SORA emblem roof and bonnet decals'; group.add(emblems);
  }
  if (template.strip && strip) {
    const stripMaterial = new THREE.MeshStandardMaterial({ map: strip, roughness: 0.35, metalness: 0.02,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    addDissolve(stripMaterial, opacity);
    const banner = new THREE.Mesh(template.strip, stripMaterial); banner.name = 'SORA club strip on the rear window'; group.add(banner);
  }
  const aeroMaterial = new THREE.MeshStandardMaterial({ color: '#20252b', metalness: 0.45, roughness: 0.32 });
  addDissolve(aeroMaterial, opacity);
  const aero = new THREE.Mesh(template.aero, aeroMaterial); aero.name = 'Club aero chin lip'; aero.visible = false; group.add(aero);
  const flameMaterial = new THREE.MeshBasicMaterial({ color: '#72d0ff', transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  addDissolve(flameMaterial, opacity);
  const exhaust = new THREE.Group(); exhaust.name = 'Boost exhaust'; exhaust.visible = false;
  const flame = new THREE.Mesh(template.flame, flameMaterial);
  flame.position.set(0.5, 0.16, -2.08); exhaust.add(flame);
  group.add(exhaust);
  let lastTime: number | null = null, angle = 0, lastColor = '', lastTrim = '';
  const car: CarModel = {
    group,
    setAppearance(color, accent = '#bbb9b0', hasAero = false) {
      if (color !== lastColor) { for (const material of paint) material.color.set(color); lastColor = color; }
      if (accent !== lastTrim) { for (const material of trim) material.color.set(accent).multiplyScalar(0.065); lastTrim = accent; }
      aero.visible = hasAero;
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
      for (const material of brakes) material.emissiveIntensity = braking ? 3.2 : 1.8;
      exhaust.visible = boosting; exhaust.scale.z = boosting ? 0.9 + Math.sin(now * 37) * 0.14 : 1;
    },
  };
  car.setAppearance('#e8e5d9');
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
  return drivers.map((driver, index) => instantiate(template, flag, emblem, strip, index, driver.group));
}
