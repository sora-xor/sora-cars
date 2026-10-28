import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface UnderstoryPatch {
  /** Stable world-station seed: retained patches must keep the same seed. */
  seed: number;
  x: number; y: number; z: number;
  heading: number;
  /** Patch dimensions in metres, centred on x/z. Local +Z follows heading. */
  width: number; depth: number;
  /** Optional local bank gradients. Roots follow the bank instead of floating. */
  slopeX?: number; slopeZ?: number;
  /** Override linear slopes for a curved bank; returns height relative to patch.y. */
  heightAt?: (localX: number, localZ: number) => number;
  density?: number;
  /** Keep shadows to nearby plants; distant cover still receives scene shadows. */
  castShadow?: boolean;
  /** 'far' is suitable beyond 12 m and is the default; 'near' retains fuller fern crowns. */
  detail?: 'near' | 'far';
}

export interface UnderstoryField {
  readonly group: THREE.Group;
  /** Call when the scenery window changes, not on every display frame. */
  setPatches(patches: readonly UnderstoryPatch[]): void;
  readonly stats: { plants: number; shadowPlants: number; triangles: number; batches: number; clipped: number };
  /** Releases instance buffers. Cached source geometry/maps remain shared. */
  dispose(): void;
}

interface Plant { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial }
const ROOT = `${import.meta.env.BASE_URL}assets/models/understory/`;
let templates: Promise<Plant[]> | undefined;

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state + 0x6D2B79F5) | 0; let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}

async function loadPlants(): Promise<Plant[]> {
  const loader = new GLTFLoader(), textureLoader = new THREE.TextureLoader();
  const ids = ['fern_02', 'grass_medium_01'];
  const sources = await Promise.all(ids.map(async id => {
    const [gltf, alpha] = await Promise.all([
      loader.loadAsync(`${ROOT}${id}/${id}_2k.gltf`),
      textureLoader.loadAsync(`${ROOT}${id}/textures/${id}_alpha_2k.png`),
    ]);
    alpha.flipY = false; alpha.colorSpace = THREE.NoColorSpace; alpha.anisotropy = 4;
    const first = gltf.scene.children.find(object => object instanceof THREE.Mesh) as THREE.Mesh;
    if (!first || Array.isArray(first.material) || !(first.material instanceof THREE.MeshStandardMaterial)) {
      throw new Error(`Understory ${id} has no supported source surface.`);
    }
    const material = first.material;
    // Poly Haven's glTF uses JPEG diffuse maps; add the original separate
    // opacity scan so the spaces between pinnae and grass blades stay open.
    material.alphaMap = alpha; material.alphaTest = 0.35; material.alphaToCoverage = true;
    material.transparent = false; material.depthWrite = true; material.side = THREE.DoubleSide;
    material.metalness = 0; material.roughness = 0.88; material.normalScale.setScalar(0.65);
    for (const map of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]) if (map) map.anisotropy = 4;
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking,
      alphaMap: alpha, alphaTest: material.alphaTest, side: THREE.DoubleSide });
    return { scene: gltf.scene, material, depth };
  }));
  const specifications = [
    [0, 'fern_02_b'], [0, 'fern_02_c'], [0, 'fern_02_a'], [0, 'fern_02_d'],
    [1, 'grass_medium_01_tall_a_LOD0'], [1, 'grass_medium_01_tall_b_LOD0'], [1, 'grass_medium_01_tall_c_LOD0'],
  ] as const;
  return specifications.map(([sourceIndex, name]) => {
    const source = sources[sourceIndex]!, mesh = source.scene.getObjectByName(name) as THREE.Mesh;
    if (!mesh?.isMesh) throw new Error(`Understory source is missing ${name}.`);
    // Ignore source-catalog translations: each specimen is independently rooted.
    const geometry = mesh.geometry.clone(); geometry.computeBoundingBox();
    geometry.translate(0, -geometry.boundingBox!.min.y, 0);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.name = `SORA understory ${name}`;
    return { geometry, material: source.material, depth: source.depth };
  });
}

/** Photographed fern fronds and curved grass blades, instanced as individual
 * 3D plants. No whole-plant billboard and no camera-facing geometry is used.
 * Sources, original checksums, and CC0 license are beside the model files.
 */
export async function createUnderstory(options: { maxPlants?: number } = {}): Promise<UnderstoryField> {
  const plants = await (templates ??= loadPlants().catch(error => { templates = undefined; throw error; }));
  const budget = Math.max(128, Math.floor(options.maxPlants ?? 12000));
  const group = new THREE.Group(); group.name = 'SORA instanced forest understory';
  const stats = { plants: 0, shadowPlants: 0, triangles: 0, batches: 0, clipped: 0 };
  const object = new THREE.Object3D(), tint = new THREE.Color();
  // Separate near shadow casters from the bulk cover. Every variant has one
  // ordinary batch and one small shadow batch, regardless of patch count.
  const batches = plants.flatMap((plant, index) => [false, true].map(shadow => {
    const capacity = shadow ? Math.min(1024, budget) : Math.ceil(budget / 2);
    const mesh = new THREE.InstancedMesh(plant.geometry, plant.material, capacity);
    mesh.name = `Understory ${index} ${shadow ? 'near shadows' : 'cover'}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;
    mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.customDepthMaterial = plant.depth;
    mesh.userData.capacity = capacity;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); group.add(mesh); return mesh;
  }));
  let disposed = false;

  return {
    group, stats,
    setPatches(patches) {
      if (disposed) return;
      for (const mesh of batches) mesh.count = 0;
      stats.plants = stats.shadowPlants = stats.triangles = stats.batches = stats.clipped = 0;
      for (const patch of patches) {
        if (![patch.x, patch.y, patch.z, patch.heading, patch.width, patch.depth].every(Number.isFinite)
          || patch.width <= 0 || patch.depth <= 0) continue;
        const rng = random(patch.seed), c = Math.cos(patch.heading), s = Math.sin(patch.heading);
        const area = patch.width * patch.depth * Math.max(0, patch.density ?? 1);
        const far = patch.detail !== 'near';
        const fernCount = Math.round(area * (far ? 0.3 : 0.4));
        const grassCount = Math.round(area * (far ? 0.4 : 0.9));
        for (let index = 0; index < fernCount + grassCount; index++) {
          const fern = index < fernCount;
          const variant = fern ? (far ? 2 : 0) + Math.floor(rng() * 2) : 4 + Math.floor(rng() * 3);
          const mesh = batches[variant * 2 + (patch.castShadow ? 1 : 0)]!;
          const x = (rng() - 0.5) * patch.width, z = (rng() - 0.5) * patch.depth;
          const slopeX = patch.slopeX ?? 0, slopeZ = patch.slopeZ ?? 0;
          const y = patch.heightAt ? patch.heightAt(x, z) : x * slopeX + z * slopeZ;
          const scale = fern ? (far ? 2.5 : 1.65) + rng() * 0.6 : 1.8 + rng() * 1.2;
          const yaw = patch.heading + rng() * Math.PI * 2;
          const brightness = 0.76 + rng() * 0.24;
          if (!Number.isFinite(y)) continue;
          if (stats.plants >= budget || mesh.count >= mesh.userData.capacity) { stats.clipped++; continue; }
          object.position.set(patch.x + c * x + s * z, patch.y + y - 0.005, patch.z - s * x + c * z);
          // Roots remain upright while their elevations follow the real bank.
          object.rotation.set((rng() - 0.5) * 0.08, yaw, (rng() - 0.5) * 0.08);
          object.scale.set(scale, scale * (0.83 + rng() * 0.24), scale);
          object.updateMatrix(); mesh.setMatrixAt(mesh.count, object.matrix);
          tint.setRGB(brightness, brightness, brightness * (0.92 + rng() * 0.08));
          mesh.setColorAt(mesh.count, tint); mesh.count++;
          stats.plants++; if (patch.castShadow) stats.shadowPlants++;
          const geometry = plants[variant]!.geometry;
          stats.triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
        }
      }
      for (const mesh of batches) {
        mesh.visible = mesh.count > 0;
        if (!mesh.visible) continue;
        mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true;
        mesh.computeBoundingBox(); mesh.computeBoundingSphere(); stats.batches++;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; for (const mesh of batches) mesh.dispose(); group.clear();
    },
  };
}
