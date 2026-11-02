import * as THREE from 'three';
import { autumnFoliage } from './autumn-foliage';
import { withCanopyGaps } from './canopy-gaps';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface DetailedScenery {
  /** Compatibility alias for createMatureTree; the road now uses a full broadleaf crown. */
  createPine(): THREE.Group;
  /** Authored broadleaf tree with detailed near geometry and distributed 3D leaf clusters in the distance. */
  createMatureTree(seed?: number): THREE.Group;
  /** Same source species and materials, scaled to a 6.2 m roadside hazard. */
  createHazardTree(seed?: number): THREE.Group;
  /** A 3 × 3 m shutter; front faces -Z, origin is at the bottom center. */
  createShutter(): THREE.Group;
  /** Two assembled façade service pipes, approximately 6 m tall; fittings face -Z. */
  createPipes(): THREE.Group;
}

const assetRoot = `${import.meta.env.BASE_URL}assets/models/roadside/`;
let pending: Promise<DetailedScenery> | undefined;

function findPart(scene: THREE.Group, name: string): THREE.Object3D {
  const part = scene.getObjectByName(name);
  if (!part) throw new Error(`Detailed scenery is missing source part ${name}`);
  return part;
}

/** Keep source transforms inside the template so callers can scale the returned group normally. */
function normalizedTemplate(source: THREE.Object3D, name: string, height: number, width?: number, depthScale?: number): THREE.Group {
  const template = new THREE.Group();
  template.name = name;
  const pivot = new THREE.Group();
  const content = source.clone(true);
  pivot.add(content);
  template.add(pivot);
  template.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(content);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  content.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  const verticalScale = height / size.y;
  const horizontalScale = width === undefined ? verticalScale : width / Math.max(size.x, size.z);
  pivot.scale.set(horizontalScale, verticalScale, depthScale ?? horizontalScale);
  template.updateMatrixWorld(true);
  return template;
}

function configureMeshes(template: THREE.Group, depthMaterials: Map<THREE.Material, THREE.MeshDepthMaterial>, distanceMaterials: Map<THREE.Material, THREE.MeshDistanceMaterial>): void {
  template.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materialList) {
      const surface = material as THREE.MeshStandardMaterial;
      if (!surface.isMeshStandardMaterial) continue;
      for (const texture of [surface.map, surface.normalMap, surface.roughnessMap, surface.metalnessMap, surface.aoMap]) {
        if (texture) texture.anisotropy = 8;
      }
      // Keep leaf cutout coverage identical in color, directional and point-light shadow passes.
      if (material.alphaTest > 0 && materialList.length === 1) {
        let depth = depthMaterials.get(material);
        if (!depth) {
          depth = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: surface.map,
            alphaMap: surface.alphaMap,
            alphaTest: material.alphaTest,
            side: material.side,
          });
          // The crowns' shadows share the sun-fleck gaps of every other canopy (canopy-gaps.ts).
          if (/leaves/i.test(material.name)) withCanopyGaps(depth);
          depthMaterials.set(material, depth);
        }
        let distance = distanceMaterials.get(material);
        if (!distance) {
          distance = new THREE.MeshDistanceMaterial({
            map: surface.map,
            alphaMap: surface.alphaMap,
            alphaTest: material.alphaTest,
            side: material.side,
          });
          distanceMaterials.set(material, distance);
        }
        mesh.customDepthMaterial = depth;
        mesh.customDistanceMaterial = distance;
      }
    }
  });
}

/** Assemble authored fittings in their native meter units; never display the source parts catalog. */
function assemblePipes(source: THREE.Group): THREE.Group {
  const materialParts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (name: string, position: THREE.Vector3, rotation = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1)) => {
    const sourcePart = findPart(source, name) as THREE.Mesh;
    if (!sourcePart.isMesh || Array.isArray(sourcePart.material)) {
      throw new Error(`Unexpected modular pipe structure: ${name}`);
    }
    // Catalog translations are presentation-only; geometry itself is authored around connector origins.
    const transform = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
    const geometry = sourcePart.geometry.clone().applyMatrix4(transform);
    const parts = materialParts.get(sourcePart.material) ?? [];
    parts.push(geometry);
    materialParts.set(sourcePart.material, parts);
  };

  const primaryX = -0.45;
  const secondaryX = 0.45;
  // A 100 mm metal service riser with an inline valve, continuous joints, and a return into the wall.
  add('pipe_200cm_metal', new THREE.Vector3(primaryX, 0, 0), undefined, new THREE.Vector3(1, 0.6, 1));
  add('pipe_valve_small_1_metal', new THREE.Vector3(primaryX, 1.2, 0));
  add('pipe_200cm_metal', new THREE.Vector3(primaryX, 1.6, 0), undefined, new THREE.Vector3(1, 0.975, 1));
  add('pipe_200cm_metal', new THREE.Vector3(primaryX, 3.55, 0), undefined, new THREE.Vector3(1, 1.1, 1));
  add('pipe_turn_long_metal', new THREE.Vector3(primaryX, 5.75, 0), new THREE.Euler(0, Math.PI / 2, 0));
  for (const y of [0.45, 2.8, 5.3]) add('pipe_support_metal', new THREE.Vector3(primaryX, y, -0.1));

  // A separate 60 mm PVC drain with its own wall brackets. Thin source lengths run along local X.
  const vertical = new THREE.Euler(0, 0, Math.PI / 2);
  for (const y of [0, 2, 4]) {
    add('pipe_thin_200cm_pvc', new THREE.Vector3(secondaryX, y, 0), vertical, new THREE.Vector3(y === 4 ? 0.8 : 1, 1, 1));
  }
  for (const y of [0.55, 2.85, 5.25]) add('pipe_thin_support_pvc', new THREE.Vector3(secondaryX, y, -0.1));

  const assembly = new THREE.Group();
  for (const [material, parts] of materialParts) {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) throw new Error('Could not merge detailed pipe fittings');
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material.name;
    assembly.add(mesh);
  }
  assembly.rotation.y = Math.PI;
  return normalizedTemplate(assembly, 'detailed-facade-pipes', 6);
}

async function loadTemplates(): Promise<DetailedScenery> {
  const loader = new GLTFLoader();
  const [nearTree, middleTree, farTree, distantTree, shutterFile, pipesFile] = await Promise.all([
    loader.loadAsync(`${assetRoot}mature-tree/mature-tree-lod0.gltf`),
    loader.loadAsync(`${assetRoot}mature-tree/mature-tree-lod1.gltf`),
    loader.loadAsync(`${assetRoot}mature-tree/mature-tree-lod2.gltf`),
    loader.loadAsync(`${assetRoot}mature-tree/mature-tree-lod3.gltf`),
    loader.loadAsync(`${assetRoot}shutter/rollershutter_door_2k.gltf`),
    loader.loadAsync(`${assetRoot}pipes/modular_pipes_2k.gltf`),
  ]);

  const tree = new THREE.Group();
  tree.name = 'detailed-mature-broadleaf';
  const lod = new THREE.LOD();
  const treeMaterials = new Map<string, THREE.Material>();
  const leafAlpha = await new THREE.TextureLoader().loadAsync(`${assetRoot}mature-tree/source/textures/tree_small_02_leaves_alpha_2k.png`);
  // glTF UVs use an unflipped image origin. The source glTF pairs BLEND with a
  // JPEG color map; use its separate original alpha map to restore leaf edges.
  leafAlpha.flipY = false;
  leafAlpha.colorSpace = THREE.NoColorSpace;
  leafAlpha.anisotropy = 8;
  let nearTemplate: THREE.Group | undefined;
  [nearTree, middleTree, farTree, distantTree].forEach((file, index) => {
    file.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const shared = treeMaterials.get(mesh.material.name);
      if (shared) mesh.material = shared;
      else {
        if (mesh.material.name === 'tree_small_02_leaves') {
          const leaves = mesh.material as THREE.MeshStandardMaterial;
          leaves.alphaMap = leafAlpha;
          leaves.alphaTest = 0.4;
          leaves.transparent = false;
          leaves.depthWrite = true;
          // The autumn routes turn these crowns crimson, orange and gold (autumn-foliage.ts).
          autumnFoliage(leaves);
        }
        treeMaterials.set(mesh.material.name, mesh.material);
      }
    });
    let template: THREE.Group;
    if (index === 3) {
      // Card expansion is local to each leaf patch. Reuse the near tree's source
      // transform so normalizing the enlarged distant bounds cannot shrink its crown.
      template = new THREE.Group();
      template.name = 'mature-crown-lod-3';
      const pivot = new THREE.Group(), content = file.scene.clone(true);
      pivot.scale.copy(nearTemplate!.children[0]!.scale);
      content.position.copy(nearTemplate!.children[0]!.children[0]!.position);
      pivot.add(content); template.add(pivot);
    } else {
      template = normalizedTemplate(file.scene, `mature-crown-lod-${index}`, 8, 7);
      if (index === 0) nearTemplate = template;
    }
    lod.addLevel(template, [0, 32, 85, 150][index]!, 0.12);
  });
  tree.add(lod);
  const shutterSource = findPart(shutterFile.scene, 'rollershutter_door').clone(true);
  // Poly Haven's presentation front is +Z; road-facing scenery in this game uses -Z.
  shutterSource.rotation.y = Math.PI;
  const shutter = normalizedTemplate(shutterSource, 'detailed-roller-shutter', 3, 3, 1.25);
  shutter.traverse(object => {
    const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    if (!mesh.isMesh) return;
    // Aged galvanized steel keeps the source relief and maps without a bright white storefront patch.
    mesh.material.color.set('#90948f');
    mesh.material.roughness = 0.9;
    mesh.material.envMapIntensity = 0.6;
  });
  const pipes = assemblePipes(pipesFile.scene);
  const depthMaterials = new Map<THREE.Material, THREE.MeshDepthMaterial>();
  const distanceMaterials = new Map<THREE.Material, THREE.MeshDistanceMaterial>();
  for (const template of [tree, shutter, pipes]) configureMeshes(template, depthMaterials, distanceMaterials);

  const instantiate = (template: THREE.Group): THREE.Group => {
    const clone = template.clone(true);
    // Three's Object3D.clone shares geometry/materials but omits custom shadow materials.
    configureMeshes(clone, depthMaterials, distanceMaterials);
    return clone;
  };

  let nextTree = 0;
  const mature = (seed = nextTree++): THREE.Group => {
    const instance = instantiate(tree);
    // Rotate within the returned group so world placement can independently align the root transform.
    instance.children[0]!.rotation.y = seed * 2.399963229728653;
    return instance;
  };
  return {
    createPine: () => mature(),
    createMatureTree: mature,
    createHazardTree: seed => { const instance = mature(seed); instance.scale.setScalar(0.78); return instance; },
    createShutter: () => instantiate(shutter),
    createPipes: () => instantiate(pipes),
  };
}

/** Loads once; cloned instances share immutable source geometry, materials, textures and shadow materials. */
export function loadDetailedScenery(): Promise<DetailedScenery> {
  return pending ??= loadTemplates().catch(error => {
    pending = undefined;
    throw error;
  });
}
