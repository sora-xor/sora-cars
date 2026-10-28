import * as THREE from 'three';

export interface GarageCarReflections {
  /** A linear HDR CubeUV texture; assign it directly to physical materials. */
  texture: THREE.Texture;
  position: THREE.Vector3;
  resolution: number;
  dispose(): void;
}

/**
 * Capture the actual workshop once, before its general painted material pass.
 * The first subject selects the probe position; all supplied subjects are hidden.
 * The sample offset is in world axes, independent of the subject's rotation.
 * This stationary-object proof has no moving-object or box-projected parallax
 * correction. Call after all scene assets are ready.
 * Material envMapRotation must be zero: this probe already uses world axes.
 */
export function captureGarageCarReflections(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  subjects: readonly THREE.Object3D[],
  hiddenObjects: readonly THREE.Object3D[] = [],
  worldSampleOffset: THREE.Vector3 = new THREE.Vector3(0, .8, 0),
): GarageCarReflections {
  if (!subjects.length) throw new Error('Garage reflection capture needs a subject position.');

  scene.updateMatrixWorld(true);
  const position = subjects[0].getWorldPosition(new THREE.Vector3()).add(worldSampleOffset);
  const resolution = 512;
  const cube = new THREE.WebGLCubeRenderTarget(resolution, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
  });
  cube.texture.name = 'Garage local HDR reflection capture';
  const camera = new THREE.CubeCamera(.06, 300, cube);
  camera.position.copy(position);
  const generator = new THREE.PMREMGenerator(renderer);
  let filtered: THREE.WebGLRenderTarget | undefined;
  let captureStarted = false;
  const shadows: THREE.LightShadow[] = [];
  scene.traverseVisible(object => {
    if (object.castShadow && (object instanceof THREE.DirectionalLight
      || object instanceof THREE.SpotLight || object instanceof THREE.PointLight)) {
      shadows.push(object.shadow);
    }
  });
  const visibility = new Map<THREE.Object3D, boolean>();
  for (const object of [...subjects, ...hiddenObjects]) {
    if (!visibility.has(object)) visibility.set(object, object.visible);
  }
  const previous = {
    target: renderer.getRenderTarget(),
    cubeFace: renderer.getActiveCubeFace(),
    mipLevel: renderer.getActiveMipmapLevel(),
    xr: renderer.xr.enabled,
    toneMapping: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
    outputColorSpace: renderer.outputColorSpace,
    autoClear: renderer.autoClear,
    clearColor: renderer.autoClearColor,
    clearDepth: renderer.autoClearDepth,
    clearStencil: renderer.autoClearStencil,
    clear: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(),
    scissorTest: renderer.getScissorTest(),
    viewport: renderer.getViewport(new THREE.Vector4()),
    scissor: renderer.getScissor(new THREE.Vector4()),
    shadowAutoUpdate: renderer.shadowMap.autoUpdate,
    shadowNeedsUpdate: renderer.shadowMap.needsUpdate,
    background: scene.background,
    environment: scene.environment,
    backgroundIntensity: scene.backgroundIntensity,
    environmentIntensity: scene.environmentIntensity,
    backgroundBlurriness: scene.backgroundBlurriness,
    backgroundRotation: scene.backgroundRotation.clone(),
    environmentRotation: scene.environmentRotation.clone(),
    overrideMaterial: scene.overrideMaterial,
  };

  try {
    for (const object of visibility.keys()) object.visible = false;
    // Subjects cannot reflect themselves; a planar Reflector would otherwise
    // start six nested mirror renders and sample an unrelated camera view.
    renderer.xr.enabled = false;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.autoClear = true;
    renderer.autoClearColor = renderer.autoClearDepth = renderer.autoClearStencil = true;
    renderer.setScissorTest(false);
    scene.overrideMaterial = null;

    // Keep the original environment as incident light during capture. Visible
    // walls, shelf labels, beams and emissive fixtures supply local structure.
    // No display transform or pixel/paint postprocessing is baked into this HDR.
    captureStarted = true;
    camera.update(renderer, scene);
    filtered = generator.fromCubemap(cube.texture);
    filtered.texture.name = 'Garage local reflection PMREM';
    let disposed = false;
    const result = filtered;
    return {
      texture: result.texture,
      position,
      resolution,
      dispose() {
        if (disposed) return;
        disposed = true;
        result.dispose();
      },
    };
  } catch (error) {
    filtered?.dispose();
    throw error;
  } finally {
    for (const [object, visible] of visibility) object.visible = visible;
    scene.background = previous.background;
    scene.environment = previous.environment;
    scene.backgroundIntensity = previous.backgroundIntensity;
    scene.environmentIntensity = previous.environmentIntensity;
    scene.backgroundBlurriness = previous.backgroundBlurriness;
    scene.backgroundRotation.copy(previous.backgroundRotation);
    scene.environmentRotation.copy(previous.environmentRotation);
    scene.overrideMaterial = previous.overrideMaterial;
    renderer.xr.enabled = previous.xr;
    renderer.toneMapping = previous.toneMapping;
    renderer.toneMappingExposure = previous.exposure;
    renderer.outputColorSpace = previous.outputColorSpace;
    renderer.autoClear = previous.autoClear;
    renderer.autoClearColor = previous.clearColor;
    renderer.autoClearDepth = previous.clearDepth;
    renderer.autoClearStencil = previous.clearStencil;
    renderer.shadowMap.autoUpdate = previous.shadowAutoUpdate;
    // Cube rendering may have overwritten shadow maps while the subjects were
    // hidden. Invalidate after restoring visibility, including on exceptions,
    // so the next ordinary render repairs them even with autoUpdate disabled.
    renderer.shadowMap.needsUpdate = captureStarted || previous.shadowNeedsUpdate;
    if (captureStarted) for (const shadow of shadows) shadow.needsUpdate = true;
    renderer.setClearColor(previous.clear, previous.alpha);
    // Restore logical canvas state before the target: setRenderTarget restores
    // its own physical viewport/scissor as well as the original cube face/mip.
    renderer.setViewport(previous.viewport);
    renderer.setScissor(previous.scissor);
    renderer.setScissorTest(previous.scissorTest);
    renderer.setRenderTarget(previous.target, previous.cubeFace, previous.mipLevel);
    cube.dispose();
    generator.dispose();
  }
}
