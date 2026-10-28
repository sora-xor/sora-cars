import * as THREE from 'three';

/** Glass-only coverage for post ink; it never writes into the beauty depth. */
export function createGlazingMask(renderer: THREE.WebGLRenderer) {
  const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  depth.minFilter = depth.magFilter = THREE.NearestFilter;
  const target = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RedFormat, type: THREE.UnsignedByteType, internalFormat: 'R8',
    depthTexture: depth, depthBuffer: true, stencilBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });
  target.texture.name = 'Visible glazing mask';
  target.texture.colorSpace = THREE.NoColorSpace;
  const scene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    name: 'Glazing coverage against copied opaque depth',
    vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'void main(){gl_FragColor=vec4(1.);}',
    side: THREE.FrontSide, depthTest: true, depthWrite: false,
    blending: THREE.NoBlending, toneMapped: false,
  });
  const entries: { source: THREE.Mesh; proxy: THREE.Mesh }[] = [];
  const clearColor = new THREE.Color();

  return {
    texture: target.texture,
    setSize(width: number, height: number) { target.setSize(width, height); },
    setMeshes(meshes: THREE.Mesh[]) {
      scene.clear();
      entries.length = 0;
      // These are glass-only meshes. Geometry is shared and remains owned by
      // the car; the mask owns only proxies, its shader and its render target.
      for (const source of new Set(meshes)) {
        const proxy = new THREE.Mesh(source.geometry, material);
        proxy.matrixAutoUpdate = proxy.matrixWorldAutoUpdate = false;
        scene.add(proxy);
        entries.push({ source, proxy });
      }
    },
    render(opaqueDepth: THREE.DepthTexture, camera: THREE.Camera, beautyScene: THREE.Scene) {
      for (const { source, proxy } of entries) {
        let visible = true, inScene = false;
        for (let ancestor: THREE.Object3D | null = source; ancestor; ancestor = ancestor.parent) {
          visible = visible && ancestor.visible;
          if (ancestor === beautyScene) inScene = true;
        }
        const materials = Array.isArray(source.material) ? source.material : [source.material];
        proxy.visible = visible && inScene && materials.some(value => value.visible);
        proxy.geometry = source.geometry;
        proxy.matrix.copy(source.matrixWorld);
        proxy.matrixWorld.copy(source.matrixWorld);
        proxy.layers.mask = source.layers.mask;
        proxy.frustumCulled = source.frustumCulled;
      }
      const previousTarget = renderer.getRenderTarget();
      const previousFace = renderer.getActiveCubeFace();
      const previousMip = renderer.getActiveMipmapLevel();
      const previousAutoClear = renderer.autoClear;
      const previousClearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      try {
        renderer.initRenderTarget(target);
        // The supplied depth is the resolved beauty snapshot. Copying into
        // our own attachment prevents glass from changing AO or paint depth.
        renderer.copyTextureToTexture(opaqueDepth, depth);
        renderer.setRenderTarget(target);
        renderer.autoClear = false;
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false);
        renderer.render(scene, camera);
      } finally {
        renderer.autoClear = previousAutoClear;
        renderer.setClearColor(clearColor, previousClearAlpha);
        // Restores the target's viewport/scissor as well as its attachment.
        renderer.setRenderTarget(previousTarget, previousFace, previousMip);
      }
    },
    dispose() {
      scene.clear();
      entries.length = 0;
      material.dispose();
      target.dispose();
    },
  };
}
