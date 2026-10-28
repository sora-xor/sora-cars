import * as THREE from 'three';
import { prepareEnamelTopology } from './enamel-topology';
import { createIllustratedMaterials } from './illustrated-materials';
import { pickIllustratedPigments } from './illustrated-pigments';

export interface RacingMaterialStudyTextures {
  /** Loaded data texture from loadPaintedMarks; retained by the caller. */
  paintMarks: THREE.Texture;
  /** Loaded Primary UV atlas from loadIllustratedEnamel; retained by the caller. */
  enamelAtlas: THREE.Texture;
  reflectionPaint?: THREE.Texture;
}

interface SurfaceBinding {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  sourceGeometry: THREE.BufferGeometry;
  geometry: THREE.BufferGeometry;
  material: MaterialBinding;
}

interface MaterialBinding {
  source: THREE.MeshStandardMaterial;
  painted: THREE.MeshStandardMaterial;
  geometry: THREE.BufferGeometry;
  signature: string;
  surfaces: SurfaceBinding[];
}

const STUDY_MATERIALS = new Set(['Primary', 'Secondary', 'Trim1', 'TireMaterial']);

/** Includes values captured by pigment selection/base-albedo uniforms. The
 * car's normal setAppearance changes colors without setting needsUpdate. */
function appearanceSignature(material: THREE.MeshStandardMaterial): string {
  const physical = material as THREE.MeshPhysicalMaterial;
  return [material.name, ...material.color.toArray(), material.metalness,
    material.roughness, material.map?.uuid ?? '', material.version,
    physical.isMeshPhysicalMaterial ? physical.clearcoat : '',
    physical.isMeshPhysicalMaterial ? physical.clearcoatRoughness : ''].join(':');
}

function carSurface(object: THREE.Object3D, root: THREE.Group): object is SurfaceBinding['mesh'] {
  if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh
    || object instanceof THREE.InstancedMesh || Array.isArray(object.material)) return false;
  for (let parent: THREE.Object3D | null = object; parent && parent !== root; parent = parent.parent) {
    if (parent.name === 'DetailedSeatedDriver' || parent instanceof THREE.Bone) return false;
  }
  const material = object.material;
  return material instanceof THREE.MeshStandardMaterial && STUDY_MATERIALS.has(material.name) && !material.transparent
    && material.opacity >= 1 && !material.userData.garageLeafPaint
    && !material.userData.garagePaintedFloor
    && !(material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0);
}

/**
 * Opt-in material experiment for the existing, closed detailed racing cars.
 * This module does not install itself in RaceWorld or change its lights, camera,
 * post-processing, geometry partitions, controls, simulation, or saved settings.
 *
 * Call prepare AFTER the normal draw has assigned the initial appearance. Call
 * synchronize after subsequent setAppearance/animate calls and before beauty
 * rendering. Source materials stay alive: CarModel closes over them for livery,
 * appearance and opacity. Owned clones receive the painting instead. Only
 * Primary, Secondary, Trim1 and TireMaterial participate; lamps, brakes,
 * interior, glazing, decals and drivers retain their native materials.
 *
 * Primary hues supported by pickIllustratedPigments receive its current family.
 * Other hues keep the existing generic physical-light/atlas fallback; this helper
 * does not recolor them into ivory/red or invent additional painted palettes.
 */
export function createRacingMaterialStudy(textures: RacingMaterialStudyTextures) {
  const materials = createIllustratedMaterials();
  materials.setTexture(textures.paintMarks);
  materials.setEnamelAtlas(textures.enamelAtlas);
  materials.setLightingStyleStrength(.35);
  if (textures.reflectionPaint) materials.setReflectionMap(textures.reflectionPaint);

  const roots = new Set<THREE.Group>();
  const bindings: MaterialBinding[] = [];
  const surfaces: SurfaceBinding[] = [];
  const preparedGeometry = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const ownedGeometry = new Set<THREE.BufferGeometry>();
  let disposed = false, refreshes = 0;

  function assertActive() {
    if (disposed) throw new Error('Racing material study has been disposed.');
  }

  function paintMaterial(source: THREE.MeshStandardMaterial, geometry: THREE.BufferGeometry) {
    const painted = source.clone();
    // Material.clone does not copy these callbacks. Preserve the source's
    // dissolve uniform and any pre-existing material hooks without wrapping or
    // mutating the source used by the car's own appearance/animation closures.
    const compile = source.onBeforeCompile;
    const sourceKey = source.customProgramCacheKey();
    painted.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
    };
    painted.customProgramCacheKey = () => sourceKey;
    const proxy = new THREE.Mesh(geometry, painted);
    materials.apply(proxy);
    return painted;
  }

  return {
    materials,

    prepare(root: THREE.Group) {
      assertActive();
      if (roots.has(root)) return;
      if (root.userData.asset !== 'Toyota AE86 Sprinter Trueno Zenki') {
        throw new Error('Racing material study requires a loaded detailed AE86 car group.');
      }
      if (root.getObjectByName('Garage open bonnet') || root.getObjectByName('Garage painted front apron')) {
        throw new Error('Racing material study expects the original closed racing car.');
      }
      const selected: SurfaceBinding['mesh'][] = [];
      root.traverse(object => { if (carSurface(object, root)) selected.push(object); });
      if (!selected.some(mesh => mesh.material.name === 'Primary')) {
        throw new Error('Detailed racing car has no opaque Primary paint.');
      }

      // Prepare detached views of the exact geometry. Topology preparation only
      // adds attributes to owned clones; source vertex/index order is preserved.
      // The racing mesh's shadow callbacks may still exchange the original full
      // and simplified index buffers because both address identical vertices.
      const staging = new THREE.Group();
      const proxies = new Map<THREE.BufferGeometry, THREE.Mesh>();
      for (const mesh of selected) {
        if (mesh.material.name !== 'Primary' || preparedGeometry.has(mesh.geometry)
          || proxies.has(mesh.geometry)) continue;
        if (mesh.material.customProgramCacheKey().includes(':illustrated-light-')) {
          throw new Error('Detailed car is already owned by an illustrated material study.');
        }
        const proxy = new THREE.Mesh(mesh.geometry, mesh.material);
        proxy.name = mesh.name; staging.add(proxy); proxies.set(mesh.geometry, proxy);
      }
      prepareEnamelTopology(staging);
      for (const [source, proxy] of proxies) {
        preparedGeometry.set(source, proxy.geometry);
        if (source !== proxy.geometry) ownedGeometry.add(proxy.geometry);
      }

      const local = new Map<THREE.MeshStandardMaterial, Map<boolean, MaterialBinding>>();
      const nextSurfaces: SurfaceBinding[] = [], nextBindings: MaterialBinding[] = [];
      try {
        for (const mesh of selected) {
          const source = mesh.material, sourceGeometry = mesh.geometry;
          const geometry = source.name === 'Primary' ? preparedGeometry.get(sourceGeometry)! : sourceGeometry;
          const hasAtlas = source.name === 'Primary' && geometry.hasAttribute('enamelForm');
          let variants = local.get(source);
          if (!variants) { variants = new Map(); local.set(source, variants); }
          let binding = variants.get(hasAtlas);
          if (!binding) {
            binding = { source, painted: paintMaterial(source, geometry), geometry,
              signature: appearanceSignature(source), surfaces: [] };
            variants.set(hasAtlas, binding); nextBindings.push(binding);
          }
          const surface = { mesh, sourceGeometry, geometry, material: binding };
          binding.surfaces.push(surface); nextSurfaces.push(surface);
        }
      } catch (error) {
        for (const binding of nextBindings) binding.painted.dispose();
        throw error;
      }
      // Nothing touches the live car until every material/geometry is prepared.
      for (const surface of nextSurfaces) {
        surface.mesh.geometry = surface.geometry;
        surface.mesh.material = surface.material.painted;
      }
      bindings.push(...nextBindings); surfaces.push(...nextSurfaces); roots.add(root);
    },

    synchronize() {
      assertActive();
      let changed = 0;
      for (const binding of bindings) {
        const signature = appearanceSignature(binding.source);
        if (signature !== binding.signature) {
          const replacement = paintMaterial(binding.source, binding.geometry);
          const previous = binding.painted;
          for (const surface of binding.surfaces) {
            // An external replacement belongs to its caller, not this study.
            if (surface.mesh.material === previous) surface.mesh.material = replacement;
          }
          binding.painted = replacement; binding.signature = signature;
          previous.dispose(); changed++; refreshes++;
        }
        // Opacity is not part of the appearance signature. The live source
        // dissolve uniform is also shared through its original callback, so a
        // corridor fade never recompiles or resets the car's opacity state.
        binding.painted.opacity = binding.source.opacity;
        binding.painted.visible = binding.source.visible;
      }
      return changed;
    },

    setEnabled(enabled: boolean) { assertActive(); materials.setEnabled(enabled); },

    stats() {
      const families: Record<string, number> = {};
      for (const binding of bindings) {
        const family = pickIllustratedPigments(binding.source)?.family ?? 'physical-fallback';
        families[family] = (families[family] ?? 0) + 1;
      }
      return { cars: roots.size, meshes: surfaces.length, materials: bindings.length,
        preparedGeometries: ownedGeometry.size, refreshes, families, disposed,
        appearanceSynchronization: 'call after setAppearance/animate and before rendering',
        shading: materials.stats() };
    },

    dispose() {
      if (disposed) return;
      for (const surface of surfaces) {
        if (surface.mesh.material === surface.material.painted) surface.mesh.material = surface.material.source;
        if (surface.mesh.geometry === surface.geometry) surface.mesh.geometry = surface.sourceGeometry;
      }
      for (const binding of bindings) binding.painted.dispose();
      for (const geometry of ownedGeometry) geometry.dispose();
      surfaces.length = 0; bindings.length = 0; roots.clear();
      ownedGeometry.clear(); preparedGeometry.clear(); disposed = true;
    },
  };
}
