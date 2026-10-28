import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PixelClusterPass } from '../../poc/pixel-cluster-pass';
import { cutsceneGrade } from './cutscene-grade';

export interface CinematicPass {
  /** Dimensions are physical output pixels. The caller owns camera projection. */
  render(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, time: number): void;
  setPixelation(enabled: boolean): void;
  setPaintedPixelGroups(enabled: boolean): void;
  /** Pixel-lattice ink from continuous 3D folds; zero disables the study. */
  setGeometricInkStrength(strength: number): void;
  /** Contrast of already assigned fine regions relative to merged regions. */
  setFineToneContrast(contrast: number): void;
  /** Opt-in, depth-gated local display-value contrast before pixel grouping. */
  setPreRegionContrast(strength: number): void;
  dispose(): void;
}

const MAX_SCENE_PIXELS = 1920 * 1080;

/** The race's single HDR-to-display tone mapper. Every race output path
 * (this pass, the pixel-art pass, the renderer default) applies exactly this
 * operator once, at RACE_TONE_MAPPING_EXPOSURE; render targets stay linear
 * until then. Neutral keeps amber lamps, rails and reflections saturated and
 * leaves mid tones nearly unchanged, where ACES bleaches amber toward cream.
 * The race painted sky (src/poc/painted-sky.ts raceRadiance) inverts the
 * active operator and exposure so its authored display colours land exactly.
 */
export const RACE_TONE_MAPPING: THREE.ToneMapping = THREE.NeutralToneMapping;
/** Neutral's quadratic toe crushes dusk shadows (linear .06 -> .02); the
 * extra exposure lifts them toward the cutscenes' L .25 median. */
export const RACE_TONE_MAPPING_EXPOSURE = 1.3;

/** Linear HDR scene rendering, local contact shading, and restrained light bloom. */
export function createCinematicPass(renderer: THREE.WebGLRenderer): CinematicPass {
  const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  depth.name = 'SORA cinematic resolved scene depth';
  depth.minFilter = depth.magFilter = THREE.NearestFilter;
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    depthTexture: depth,
    resolveDepthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  target.texture.name = 'SORA cinematic linear HDR';
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1);

  const emptyScene = new THREE.Scene();
  const initialCamera = new THREE.PerspectiveCamera();
  const beauty = new RenderPass(emptyScene, initialCamera);
  // Preserve beauty depth independently of the composer's color ping-pong.
  // In a single-sample framebuffer, sampling its attached depth while grading
  // back into it is a feedback loop even when depth writes are disabled.
  const preservedDepth = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RedFormat, type: THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthTexture: depth.clone(), depthBuffer: true, stencilBuffer: false,
    generateMipmaps: false, samples: 0,
  });
  preservedDepth.depthTexture!.name = 'SORA independent beauty depth';
  // Three requires a color attachment; its unused R8 allocation is minimal.
  // Copy only resolved depth, without drawing scene geometry a second time.
  const renderBeauty = beauty.render.bind(beauty);
  beauty.render = (...args) => {
    renderBeauty(...args);
    const activeTarget = renderer.getRenderTarget();
    try {
      renderer.initRenderTarget(preservedDepth);
      renderer.copyTextureToTexture(args[2].depthTexture!, preservedDepth.depthTexture!);
    } finally {
      renderer.setRenderTarget(activeTarget);
    }
  };
  // Construct the addon normally before replacing its G-buffer: its setSize
  // and dispose methods still expect the internal target to exist.
  const contact = new GTAOPass(emptyScene, initialCamera, 1, 1);
  contact.setGBuffer(depth);
  contact.blendIntensity = 0.28;
  contact.updateGtaoMaterial({
    radius: 0.24,
    thickness: 0.10,
    distanceFallOff: 1.0,
    scale: 1.0,
    samples: 16,
    screenSpaceRadius: false,
  });
  contact.updatePdMaterial({
    radius: 3,
    rings: 2,
    samples: 16,
    lumaPhi: 10,
    depthPhi: 2,
    normalPhi: 3,
  });

  // A linear threshold above 1 leaves ordinary diffuse surfaces alone. Emissive
  // lamps and intense reflections can bloom without a general soft-focus veil.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.15, 1.6);
  const grade = new ShaderPass({
    name: 'SORA cutscene material and value finish',
    uniforms: { tDiffuse: { value: null }, sceneDepth: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: .12 }, cameraFar: { value: 600 },
      cameraPerspective: { value: 1 }, finishStrength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: cutsceneGrade,
  });
  grade.material.depthTest = grade.material.depthWrite = false;
  grade.material.blending = THREE.NoBlending;
  grade.material.toneMapped = false;
  const pixel = new ShaderPass({
    name: 'SORA optional fine pixel sampling',
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      varying vec2 vUv;
      void main() {
        vec2 cells = max(floor(resolution * 0.5), vec2(1.0));
        vec2 sampleUv = (min(floor(vUv * cells), cells - 1.0) + 0.5) / cells;
        gl_FragColor = texture2D(tDiffuse, sampleUv);
      }
    `,
  });
  pixel.material.depthTest = false;
  pixel.material.depthWrite = false;
  pixel.material.blending = THREE.NoBlending;
  pixel.material.toneMapped = false;
  pixel.enabled = false;
  const output = new OutputPass();
  const clusters = new PixelClusterPass();
  clusters.configure({
    spacing: 5, compactness: 0.3, colorScale: 0.065, iterations: 4,
    paletteSteps: 0, mergeRounds: 6, mergeScale: 2, neighborStrength: 0.5,
    mergeColorScale: 0.055, detailStrength: 0.3, directionStrength: 1,
    fineToneStrength: 0.85, fineToneContrast: 2.25,
    edgeInkStrength: 0.35, curvatureInkStrength: 0.55,
    preRegionContrastStrength: 2,
    pixelSize: 1,
  });
  composer.addPass(beauty);
  composer.addPass(contact);
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(pixel);
  composer.addPass(output);
  // Output converts to display color once. The optional regions operate on
  // that result, as they do in the cutscene proof, while the legacy path ends
  // at Output unchanged.
  composer.addPass(clusters);

  const drawingBuffer = new THREE.Vector2();
  const savedViewport = new THREE.Vector4();
  const savedScissor = new THREE.Vector4();
  const savedClearColor = new THREE.Color();
  let internalWidth = 1;
  let internalHeight = 1;
  let pixelEnabled = false;
  let disposed = false;

  return {
    render(scene, camera, width, height, _time) {
      if (disposed || !Number.isFinite(width) || !Number.isFinite(height)
        || width <= 0 || height <= 0) return;

      const outputWidth = Math.max(1, Math.round(width));
      const outputHeight = Math.max(1, Math.round(height));
      const scale = Math.min(1, Math.sqrt(MAX_SCENE_PIXELS / (outputWidth * outputHeight)));
      const nextWidth = Math.max(1, Math.floor(outputWidth * scale));
      const nextHeight = Math.max(1, Math.floor(outputHeight * scale));
      if (internalWidth !== nextWidth || internalHeight !== nextHeight) {
        internalWidth = nextWidth;
        internalHeight = nextHeight;
        composer.setSize(internalWidth, internalHeight);
        preservedDepth.setSize(internalWidth, internalHeight);
        pixel.uniforms.resolution.value.set(internalWidth, internalHeight);
        grade.uniforms.resolution.value.set(internalWidth, internalHeight);
      }

      beauty.scene = scene;
      beauty.camera = camera;
      contact.scene = scene;
      contact.camera = camera;
      const perspective = camera.projectionMatrix.elements[11] === -1 ? 1 : 0;
      const projectionCamera = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      grade.uniforms.cameraNear.value = projectionCamera.near;
      grade.uniforms.cameraFar.value = projectionCamera.far;
      grade.uniforms.cameraPerspective.value = perspective;
      // ShaderPass clones initial uniforms, including textures. Bind the
      // initialized snapshot itself, never its unpopulated constructor clone.
      grade.uniforms.sceneDepth.value = preservedDepth.depthTexture;
      if (clusters.enabled) clusters.setDepth(preservedDepth.depthTexture!, camera);
      if (contact.gtaoMaterial.defines.PERSPECTIVE_CAMERA !== perspective) {
        contact.gtaoMaterial.defines.PERSPECTIVE_CAMERA = perspective;
        contact.gtaoMaterial.needsUpdate = true;
      }
      // The optional pass changes ping-pong parity. Always use the buffer that
      // RenderPass will populate this frame, including its resolved MSAA depth.
      if (contact.depthTexture !== composer.readBuffer.depthTexture) {
        contact.setGBuffer(composer.readBuffer.depthTexture!);
      }

      renderer.getDrawingBufferSize(drawingBuffer);
      if (drawingBuffer.x !== outputWidth || drawingBuffer.y !== outputHeight
        || renderer.getPixelRatio() !== 1) {
        renderer.setDrawingBufferSize(outputWidth, outputHeight, 1);
      }

      const savedTarget = renderer.getRenderTarget();
      const savedCubeFace = renderer.getActiveCubeFace();
      const savedMipmapLevel = renderer.getActiveMipmapLevel();
      const savedAutoClear = renderer.autoClear;
      const savedAutoClearColor = renderer.autoClearColor;
      const savedAutoClearDepth = renderer.autoClearDepth;
      const savedAutoClearStencil = renderer.autoClearStencil;
      const savedScissorTest = renderer.getScissorTest();
      const savedXrEnabled = renderer.xr.enabled;
      const savedToneMapping = renderer.toneMapping;
      const savedToneMappingExposure = renderer.toneMappingExposure;
      const savedOutputColorSpace = renderer.outputColorSpace;
      const savedClearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(savedClearColor);
      renderer.getViewport(savedViewport);
      renderer.getScissor(savedScissor);

      try {
        renderer.xr.enabled = false;
        renderer.autoClear = false;
        renderer.autoClearColor = renderer.autoClearDepth = renderer.autoClearStencil = true;
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, outputWidth, outputHeight);
        // Three leaves ordinary render targets linear and untone-mapped.
        // OutputPass applies these settings exactly once, at display output.
        renderer.toneMapping = RACE_TONE_MAPPING;
        renderer.toneMappingExposure = RACE_TONE_MAPPING_EXPOSURE;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        composer.render(0);
      } finally {
        renderer.setRenderTarget(savedTarget, savedCubeFace, savedMipmapLevel);
        renderer.setViewport(savedViewport);
        renderer.setScissor(savedScissor);
        renderer.setScissorTest(savedScissorTest);
        renderer.setClearColor(savedClearColor, savedClearAlpha);
        renderer.autoClear = savedAutoClear;
        renderer.autoClearColor = savedAutoClearColor;
        renderer.autoClearDepth = savedAutoClearDepth;
        renderer.autoClearStencil = savedAutoClearStencil;
        renderer.xr.enabled = savedXrEnabled;
        renderer.toneMapping = savedToneMapping;
        renderer.toneMappingExposure = savedToneMappingExposure;
        renderer.outputColorSpace = savedOutputColorSpace;
      }
    },
    setPixelation(enabled) {
      if (disposed) return;
      pixelEnabled = enabled;
      pixel.enabled = enabled && !clusters.enabled;
    },
    setPaintedPixelGroups(enabled) {
      if (disposed) return;
      clusters.enabled = enabled;
      pixel.enabled = pixelEnabled && !enabled;
    },
    setGeometricInkStrength(strength) {
      if (disposed) return;
      clusters.configure({ curvatureInkStrength: strength });
    },
    setFineToneContrast(contrast) {
      if (disposed) return;
      clusters.configure({ fineToneContrast: contrast });
    },
    setPreRegionContrast(strength) {
      if (disposed) return;
      clusters.configure({ preRegionContrastStrength: strength });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      contact.dispose();
      // These addon materials are omitted by Three r186's dispose methods.
      contact.gtaoMaterial.dispose();
      contact.blendMaterial.dispose();
      bloom.dispose();
      bloom.materialHighPassFilter.dispose();
      grade.dispose();
      preservedDepth.dispose();
      pixel.dispose();
      output.dispose();
      clusters.dispose();
      composer.dispose();
      composer.passes.length = 0;
      beauty.scene = contact.scene = emptyScene;
      beauty.camera = contact.camera = initialCamera;
    },
  };
}
