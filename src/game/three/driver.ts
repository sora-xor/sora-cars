import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { addDetailLevels, detailLevels, selectDetailByScreen } from './detail-levels';

/** Authored CC0 driver. Coordinates fit the
 * normalized AE86 cabin: meters, +Y up, +Z forward, right-hand seat.
 * Detailed source, licensing and reproducible authoring are beside the asset.
 * Cabin fit and clean/pixel rendering are checked against the actual game.
 */
let sourcePromise: Promise<THREE.Group> | undefined;

async function source(): Promise<THREE.Group> {
  const decoder = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}assets/decoders/draco/`);
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  const { scene } = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/models/driver/driver.glb`)
    .finally(() => decoder.dispose());
  scene.updateMatrixWorld(true);
  const simplified: Promise<boolean>[] = [];
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    let cardMesh = false;
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const cards = /short01|eyebrow|eyelashes/.test(material.name);
      cardMesh ||= cards;
      material.transparent = false;
      material.alphaTest = cards ? 0.38 : 0;
      material.side = cards ? THREE.DoubleSide : THREE.FrontSide;
      material.depthWrite = true;
      material.needsUpdate = true;
    }
    // The skin and clothes were subdivided once for close views: seven seated drivers drew about a million triangles
    // a frame, mostly far smaller than a pixel. Their simplified levels (detail-levels.ts) are drawn only where the
    // difference stays under half a pixel. Hair, brows and lashes are alpha cards, which simplification would merge.
    if (!cardMesh) simplified.push(addDetailLevels(object.geometry, { lockBorder: true }).catch(error => {
      console.warn('A seated driver mesh keeps its full detail.', error); return false;
    }));
    // The opaque cabin already casts the exterior vehicle shadow. Avoid seven
    // extra skinned shadow draws for a figure fully enclosed by that shell.
    object.castShadow = false;
    object.receiveShadow = true;
    if (object instanceof THREE.SkinnedMesh) {
      object.computeBoundingBox();
      object.computeBoundingSphere();
    }
    object.frustumCulled = true;
  });
  await Promise.all(simplified);
  scene.name = 'DetailedSeatedDriver';
  return scene;
}

export interface DetailedDriver {
  group: THREE.Group;
  /** Independent bones, while immutable geometry/materials/textures are shared. */
  bones: Map<string, THREE.Bone>;
  resetPose: () => void;
}

export async function createDetailedDriver(): Promise<DetailedDriver> {
  sourcePromise ??= source().catch(error => { sourcePromise = undefined; throw error; });
  const group = clone(await sourcePromise) as THREE.Group;
  const bones = new Map<string, THREE.Bone>();
  const rest = new Map<THREE.Bone, THREE.Quaternion>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh && detailLevels(object.geometry)) selectDetailByScreen(object);
    if (!(object instanceof THREE.Bone)) return;
    bones.set(object.name, object);
    rest.set(object, object.quaternion.clone());
  });
  group.userData.source = 'MakeHuman Community CC0; generic authored seated adult';
  group.userData.prototype = true;
  return { group, bones, resetPose: () => { for (const [bone, rotation] of rest) bone.quaternion.copy(rotation); } };
}
