import * as THREE from 'three';

export interface LocalReflectionOptions {
  /** 128 resolves nearby architecture at the cars' authored paint/glass roughness. */
  resolution?: 128 | 256;
  /** Minimum travel before another six-face capture begins. */
  updateDistance?: number;
  /** Refresh stationary cars when roadside lighting changes. Seconds. */
  updateInterval?: number;
  /** Cars beyond this radius retain the scene's distant HDR environment. */
  influenceRadius?: number;
}

export interface LocalReflectionUpdate {
  stage: 'idle' | 'capture' | 'filter';
  face: number;
  ready: boolean;
  generations: number;
}

export interface LocalCarReflections {
  /** Call once per displayed frame, after moving scenery/cars and before the beauty pass.
   * Position is the centre of the followed car, at its glazing height (about 1.1 m).
   * Each call renders at most ONE cubemap face, or filters an already complete cube.
   */
  update(scene: THREE.Scene, cars: readonly THREE.Object3D[], position: THREE.Vector3, time: number): LocalReflectionUpdate;
  /** Discard the old location after changing courses, without reallocating targets. */
  invalidate(): void;
  dispose(): void;
}

interface MaterialBinding {
  map: THREE.Texture | null;
  rotation: THREE.Euler;
}

/** A small, amortized HDR probe for the nearby cars. The scene itself continues
 * to use the source HDR: neither reflected cars nor a previous probe can feed
 * back into this capture. PMREM is generated only after all six faces exist.
 */
export function createLocalCarReflections(renderer: THREE.WebGLRenderer, options: LocalReflectionOptions = {}): LocalCarReflections {
  const resolution = options.resolution ?? 128;
  const updateDistanceSq = (options.updateDistance ?? 2.5) ** 2;
  const interval = options.updateInterval ?? 0.5;
  const influenceRadiusSq = (options.influenceRadius ?? 24) ** 2;
  const cube = new THREE.WebGLCubeRenderTarget(resolution, {
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: false, depthBuffer: true, stencilBuffer: false,
  });
  cube.texture.name = 'SORA local reflection HDR capture';
  cube.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const camera = new THREE.CubeCamera(0.15, 160, cube);
  camera.coordinateSystem = renderer.coordinateSystem;
  camera.updateCoordinateSystem();
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  let filtered: THREE.WebGLRenderTarget | null = null;
  let disposed = false, face = -1, generations = 0, lastStart = -Infinity;
  let sourceScene: THREE.Scene | null = null;
  let sourceEnvironment: THREE.Texture | null = null;
  const capturedPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
  const publishedPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
  const worldPosition = new THREE.Vector3();
  const bindings = new Map<THREE.MeshStandardMaterial, MaterialBinding>();
  const materialCache = new WeakMap<THREE.Object3D, THREE.MeshStandardMaterial[]>();
  const viewport = new THREE.Vector4(), scissor = new THREE.Vector4(), clearColor = new THREE.Color();

  function carMaterials(car: THREE.Object3D): THREE.MeshStandardMaterial[] {
    const existing = materialCache.get(car); if (existing) return existing;
    const found = new Set<THREE.MeshStandardMaterial>();
    car.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        if (/^(Primary|Secondary|Windows|Paint [12]|Glass|Rim|Chrome)/.test(material.name)
          || /^Coupe (paint|shade|accent|alloy|chrome|glass)$/.test(object.name)) found.add(material);
      }
    });
    const result = [...found]; materialCache.set(car, result); return result;
  }

  function restoreMaterial(material: THREE.MeshStandardMaterial, binding: MaterialBinding): void {
    // Leave a caller's subsequent explicit replacement alone.
    if (material.envMap !== filtered?.texture) return;
    material.envMap = binding.map;
    material.envMapRotation.copy(binding.rotation);
    material.needsUpdate = true;
  }

  function bindCars(cars: readonly THREE.Object3D[]): void {
    const active = new Set<THREE.MeshStandardMaterial>();
    if (filtered && Number.isFinite(publishedPosition.x)) for (const car of cars) {
      car.getWorldPosition(worldPosition);
      if (worldPosition.distanceToSquared(publishedPosition) > influenceRadiusSq) continue;
      for (const material of carMaterials(car)) {
        active.add(material);
        if (!bindings.has(material)) bindings.set(material, { map: material.envMap, rotation: material.envMapRotation.clone() });
        if (material.envMap === filtered.texture) continue;
        material.envMap = filtered.texture;
        // Captured directions are already in world space, unlike the rotated source HDR.
        material.envMapRotation.set(0, 0, 0);
        material.needsUpdate = true;
      }
    }
    for (const [material, binding] of bindings) if (!active.has(material)) {
      restoreMaterial(material, binding); bindings.delete(material);
    }
  }

  function withCaptureState(scene: THREE.Scene, cars: readonly THREE.Object3D[], operation: () => void): void {
    const target = renderer.getRenderTarget(), cubeFace = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    renderer.getViewport(viewport); renderer.getScissor(scissor); renderer.getClearColor(clearColor);
    const state = {
      scissorTest: renderer.getScissorTest(), clearAlpha: renderer.getClearAlpha(),
      autoClear: renderer.autoClear, color: renderer.autoClearColor, depth: renderer.autoClearDepth,
      stencil: renderer.autoClearStencil, xr: renderer.xr.enabled, toneMapping: renderer.toneMapping,
      outputColorSpace: renderer.outputColorSpace, shadowAuto: renderer.shadowMap.autoUpdate,
      shadowNeeds: renderer.shadowMap.needsUpdate, backgroundIntensity: scene.backgroundIntensity,
    };
    const visibility = cars.map(car => car.visible);
    const lods: [THREE.LOD, boolean, boolean[]][] = [];
    // Select one authored LOD even for trees outside the beauty camera's view.
    // Never call LOD.update(): its cached current level belongs to that camera.
    scene.traverse(object => {
      if (!(object instanceof THREE.LOD)) return;
      lods.push([object, object.autoUpdate, object.levels.map(level => level.object.visible)]);
      object.autoUpdate = false;
      object.getWorldPosition(worldPosition);
      const chosen = object.getObjectForDistance(worldPosition.distanceTo(capturedPosition));
      for (const level of object.levels) level.object.visible = level.object === chosen;
    });
    try {
      for (const car of cars) car.visible = false;
      renderer.xr.enabled = false;
      renderer.autoClear = renderer.autoClearColor = renderer.autoClearDepth = renderer.autoClearStencil = true;
      renderer.shadowMap.autoUpdate = renderer.shadowMap.needsUpdate = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.setScissorTest(false);
      // Reflection radiance follows the source environment, independent of the
      // artistic dimming used only for the directly visible background.
      scene.backgroundIntensity = scene.environmentIntensity;
      operation();
    } finally {
      cars.forEach((car, index) => { car.visible = visibility[index]!; });
      for (const [lod, autoUpdate, visible] of lods) {
        lod.autoUpdate = autoUpdate;
        lod.levels.forEach((level, index) => { level.object.visible = visible[index]!; });
      }
      scene.backgroundIntensity = state.backgroundIntensity;
      renderer.setRenderTarget(target, cubeFace, mip);
      renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(state.scissorTest);
      renderer.setClearColor(clearColor, state.clearAlpha);
      renderer.autoClear = state.autoClear; renderer.autoClearColor = state.color;
      renderer.autoClearDepth = state.depth; renderer.autoClearStencil = state.stencil;
      renderer.xr.enabled = state.xr; renderer.toneMapping = state.toneMapping;
      renderer.outputColorSpace = state.outputColorSpace;
      renderer.shadowMap.autoUpdate = state.shadowAuto; renderer.shadowMap.needsUpdate = state.shadowNeeds;
    }
  }

  function invalidate(): void {
    face = -1; lastStart = -Infinity;
    publishedPosition.set(Infinity, Infinity, Infinity);
    for (const [material, binding] of bindings) restoreMaterial(material, binding);
    bindings.clear();
  }

  return {
    update(scene, cars, position, time) {
      const result = (stage: LocalReflectionUpdate['stage'], renderedFace = -1): LocalReflectionUpdate =>
        ({ stage, face: renderedFace, ready: Number.isFinite(publishedPosition.x), generations });
      if (disposed || !Number.isFinite(position.lengthSq()) || !Number.isFinite(time)) return result('idle');
      if (sourceScene !== scene || sourceEnvironment !== scene.environment || time < lastStart
        || face >= 0 && capturedPosition.distanceToSquared(position) > influenceRadiusSq) {
        invalidate(); sourceScene = scene; sourceEnvironment = scene.environment;
      }
      if (face < 0 && (generations === 0 || !Number.isFinite(publishedPosition.x)
        || time - lastStart >= interval || publishedPosition.distanceToSquared(position) >= updateDistanceSq)) {
        capturedPosition.copy(position); camera.position.copy(position); camera.updateMatrixWorld(true);
        lastStart = time; face = 0;
      }
      if (face === 6) {
        withCaptureState(scene, cars, () => { filtered = pmrem.fromCubemap(cube.texture, filtered); });
        filtered!.texture.name = 'SORA local reflection roughness-filtered radiance';
        publishedPosition.copy(capturedPosition); generations++; face = -1;
        bindCars(cars); return result('filter');
      }
      bindCars(cars);
      if (face < 0) return result('idle');
      const renderedFace = face;
      withCaptureState(scene, cars, () => {
        renderer.setRenderTarget(cube, renderedFace, 0);
        renderer.setViewport(0, 0, resolution, resolution);
        renderer.render(scene, camera.children[renderedFace] as THREE.PerspectiveCamera);
      });
      face++;
      return result('capture', renderedFace);
    },
    invalidate,
    dispose() {
      if (disposed) return;
      invalidate(); disposed = true; cube.dispose(); filtered?.dispose(); pmrem.dispose();
      sourceScene = null; sourceEnvironment = null;
    },
  };
}
