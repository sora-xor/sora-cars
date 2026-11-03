import * as THREE from 'three';

/** WebGLShadowMap's side flip for PCF shadows (its `shadowSide`). */
const SHADOW_SIDE: Record<THREE.Side, THREE.Side> = {
  [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide,
};

type SurfaceMaterial = THREE.Material & {
  map?: THREE.Texture | null; alphaMap?: THREE.Texture | null;
  displacementMap?: THREE.Texture | null; displacementScale?: number; displacementBias?: number; wireframe?: boolean;
};

/** A caster's surface as the shadow pass draws it: what its depth material takes from the surface. */
interface ShadowSurface {
  readonly mesh: THREE.Mesh;
  readonly custom: THREE.Material | undefined;
  readonly side: THREE.Side;
  readonly alphaTest: number;
  readonly surface: SurfaceMaterial;
}

/** Everything about a shadow surface that selects its depth program. */
function programKey(shadow: ShadowSurface): string {
  const { mesh, surface } = shadow, attributes = Object.keys(mesh.geometry.attributes).sort().join('+');
  const channel = (texture: THREE.Texture | null | undefined) => texture ? texture.channel : -1;
  return [shadow.custom?.uuid ?? 'plain', shadow.side, shadow.alphaTest, channel(surface.map), channel(surface.alphaMap),
    surface.displacementMap && surface.displacementScale !== 0 ? channel(surface.displacementMap) : -1, !!surface.wireframe,
    !!(mesh as THREE.InstancedMesh).isInstancedMesh, !!(mesh as THREE.InstancedMesh).instanceColor,
    !!(mesh as unknown as THREE.BatchedMesh).isBatchedMesh, !!(mesh as THREE.SkinnedMesh).isSkinnedMesh, attributes].join('|');
}

/**
 * Dress a depth material as WebGLShadowMap's getDepthMaterial does for a directional light: the side, maps, alpha
 * test and displacement of the surface it stands for.
 */
function dress(material: THREE.Material, shadow: ShadowSurface): THREE.Material {
  const result = material as SurfaceMaterial, { surface } = shadow;
  result.side = shadow.side;
  result.alphaTest = shadow.alphaTest;
  result.alphaMap = surface.alphaMap ?? null;
  result.map = surface.map ?? null;
  result.displacementMap = surface.displacementMap ?? null;
  result.displacementScale = surface.displacementScale ?? 1;
  result.displacementBias = surface.displacementBias ?? 0;
  result.wireframe = surface.wireframe ?? false;
  return result;
}

/**
 * The scene's shadow casters as the shadow pass will draw them, in batches that can each compile at once: a stand-in
 * inherits everything from its caster (geometry, instancing, batching) but wears the depth material the shadow map
 * gives that surface. A custom depth material shared by casters with different surfaces (the shadow map re-dresses
 * it for each draw) appears once per batch, so each of its programs compiles in a batch of its own. Casters the
 * camera never draws count too: the tree batch's hidden sources stand for the hazard trees cloned from them later.
 */
export function shadowCasterBatches(scene: THREE.Object3D): (() => THREE.Object3D[])[] {
  const surfaces = new Map<string, ShadowSurface>();
  scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.castShadow) return;
    for (const surface of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as SurfaceMaterial[]) {
      if (!surface.visible) continue;
      const shadow: ShadowSurface = { mesh, surface, custom: mesh.customDepthMaterial,
        side: surface.shadowSide ?? SHADOW_SIDE[surface.side], alphaTest: surface.alphaToCoverage ? 0.5 : surface.alphaTest };
      const key = programKey(shadow);
      if (!surfaces.has(key)) surfaces.set(key, shadow);
    }
  });
  const layers: ShadowSurface[][] = [];
  const depth = (custom: THREE.Material | undefined) => layers.findIndex(layer => !layer.some(other => custom && other.custom === custom));
  for (const shadow of surfaces.values()) {
    const at = shadow.custom ? depth(shadow.custom) : 0;
    (layers[at < 0 ? layers.length : at] ??= []).push(shadow);
  }
  // Each batch dresses its depth materials when it compiles, after the batch before it has.
  return layers.map(layer => () => layer.map(shadow => {
    const standIn = Object.create(shadow.mesh) as THREE.Mesh;
    standIn.material = dress(shadow.custom ?? new THREE.MeshDepthMaterial(), shadow);
    return standIn;
  }));
}

/**
 * Every texture the materials under `root` sample, once each, shader uniforms included: three.js uploads a texture the
 * first time a material using it is drawn, inside that frame (eight 2048² understory maps took 330 ms of one frame on
 * Tokyo, 3 November), so the warm-up uploads the ones the race's first seconds draw. With `near`, only visible objects
 * whose bounds reach into it count: a whole route's scenery is about 130 textures and 1.7 GiB, too much to send to
 * the GPU before GO. Without it, hidden and pooled objects count too.
 */
export function materialTextures(root: THREE.Object3D, near?: THREE.Sphere): THREE.Texture[] {
  const textures = new Set<THREE.Texture>(), bounds = new THREE.Sphere();
  const add = (value: unknown) => { if ((value as THREE.Texture | null)?.isTexture) textures.add(value as THREE.Texture); };
  const reaches = (object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh & { computeBoundingSphere?: () => void; boundingSphere?: THREE.Sphere | null };
    // Pools refilled around the camera as it moves (dynamic instance matrices: the understory's ferns and grasses
    // sit empty and hidden until their patches arrive, 2-3 s after GO) count wherever they are now.
    if ((object as THREE.InstancedMesh).isInstancedMesh && (object as THREE.InstancedMesh).instanceMatrix.usage === THREE.DynamicDrawUsage) return true;
    for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
    // Instanced and batched meshes bound all their instances; a plain mesh, its geometry.
    if (mesh.computeBoundingSphere && !mesh.boundingSphere) mesh.computeBoundingSphere();
    if (!mesh.boundingSphere && mesh.geometry && !mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const sphere = mesh.boundingSphere ?? mesh.geometry?.boundingSphere;
    return !sphere || near!.intersectsSphere(bounds.copy(sphere).applyMatrix4(object.matrixWorld));
  };
  root.traverse(object => {
    const material = (object as THREE.Mesh).material;
    if (!material || near && !reaches(object)) return;
    for (const surface of Array.isArray(material) ? material : [material]) {
      Object.values(surface).forEach(add);
      const uniforms = (surface as THREE.ShaderMaterial).uniforms;
      if (uniforms) for (const uniform of Object.values(uniforms)) add(uniform?.value);
    }
  });
  return [...textures];
}

/**
 * Compile `objects`' programs against `scene`'s lights without drawing them: three.js otherwise builds a program on
 * its first draw, inside the frame, which stalls the race. With `fog: false` they compile as the shadow pass draws,
 * without the scene's fog. Stand-in materials are never disposed, so their programs stay cached for the materials
 * the renderer draws with later.
 */
export function compileFor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  objects: readonly THREE.Object3D[], options: { fog?: boolean } = {}): Promise<void> {
  if (!objects.length) return Promise.resolve();
  const group = {
    traverse: (callback: (object: THREE.Object3D) => void) => objects.forEach(callback),
    traverseVisible: () => undefined,
  } as unknown as THREE.Scene;
  const fog = scene.fog;
  if (options.fog === false) scene.fog = null;
  try {
    return renderer.compileAsync(group, camera, scene).then(() => undefined);
  } finally {
    scene.fog = fog;
  }
}
