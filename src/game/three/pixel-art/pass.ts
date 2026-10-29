import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ACCUMULATE_DEFAULTS, createAccumulate, type AccumulateOptions } from './accumulate';
import { CAR_DEFAULTS, carOptionsFromQuery, createCars, type CarOptions } from './cars';
import { pixelArtGrid, sameGrid, type PixelArtGrid } from './grid';
import { createLinework, LINEWORK_DEFAULTS, lineworkOptionsFromQuery, type LineworkOptions } from './linework';
import { PIXEL_PALETTE } from './palette';
import { createSurfaces, SURFACE_DEFAULTS, surfaceOptionsFromQuery, type GroundEmitter, type GroundHazard, type SurfaceOptions } from './surfaces';
import {
  createDebugStage, createGradeStage, createLutBuilder, createNormalStage, createPaletteTextures,
  createQuantizeStage, createResolveStage, createSharedUniforms, createTargets, createUpscale,
  PIXEL_ART_DEBUG_VIEWS, TONE_MAPPING_IDS,
  type PixelArtDebugView, type PixelArtFrame, type PixelArtStage, type PixelArtToneMapping,
} from './stages';

export type { PixelArtDebugView, PixelArtFrame, PixelArtStage, PixelArtToneMapping } from './stages';
export { PIXEL_ART_DEBUG_VIEWS } from './stages';

/** Tunables. Angles are degrees; lightness values are OKLab L. Linework: linework.ts; surfaces and temporal: surfaces.ts; cars: cars.ts. */
export interface PixelArtOptions extends LineworkOptions, SurfaceOptions, CarOptions, AccumulateOptions {
  /** 'renderer' follows renderer.toneMapping, the race pipeline's single choice. */
  toneMapping: PixelArtToneMapping | 'renderer';
  /** Multiplies renderer.toneMappingExposure (the global exposure). */
  exposure: number;
  /**
   * Refine round 4: a further exposure multiplier at dusk and sunrise (night 0), eased out toward night. Measured
   * against cutscene-style repaints of race frames, the dusk and sunrise frames sat a step dark in their midtones
   * (OKLab L median 0.18-0.28 against 0.23-0.36) while the nights matched.
   */
  dayExposure: number;
  /** Mid-chroma darks lose this fraction of chroma; saturated paint keeps it. */
  darkChromaCompression: number;
  /** Chroma range over which the compression fades out (paint above it is kept). */
  darkChromaLow: number;
  darkChromaHigh: number;
  /** Lightness above which the compression has faded out. */
  darkChromaEnd: number;
  /** Share of the dark-chroma compression skipped on car paint (1: none; distant liveries keep their hue). */
  carChromaKeep: number;
  /** The same for highlights (white paint under amber lamps turns beige, not salmon). */
  lightChromaCompression: number;
  lightChromaLow: number;
  lightChromaHigh: number;
  lightChromaStart: number;
  shadowHue: number;
  /**
   * Night darks: the hue the shadow drive turns world darks toward in the plum
   * band (plum and plum-brown, not blue-slate), its share (0 off) and the
   * lightness where the band starts and is full. Sky, cars and lamp-lit ground keep their drive.
   */
  plumHue: number;
  plumStrength: number;
  plumStart: number;
  plumFull: number;
  /** Night ground: upward ground darker than groundFloor (OKLab L) is lifted toward it by groundLift (0 off), away from lamp pools. */
  groundFloor: number;
  groundLift: number;
  shadowStrength: number;
  shadowChroma: number;
  /** Lightness below which the shadow drive is full, and above which it is gone. */
  shadowStart: number;
  shadowEnd: number;
  highlightHue: number;
  highlightStrength: number;
  highlightChroma: number;
  /** Lightness where the highlight drive starts, and where it is full. */
  highlightStart: number;
  highlightFull: number;
  chroma: number;
  /**
   * Refine round 4 (the user's rain-night target): at night (setNight 1) the
   * grade eases to these values: darks keep more chroma, the shadow drive
   * turns navy instead of violet and chroma rises, so a wet road reads navy
   * under saturated amber reflections. Dusk and sunrise keep the day values.
   */
  nightDarkChromaCompression: number;
  nightShadowHue: number;
  nightChroma: number;
  /**
   * Lightness stretch about contrastPivot (OKLab L): below the pivot by day `contrast`, at night `nightContrast`;
   * above it `contrastLight` and `nightContrastLight`, gentler, so lights glow without washing out (0 off).
   */
  contrast: number;
  nightContrast: number;
  contrastLight: number;
  nightContrastLight: number;
  contrastPivot: number;
  /**
   * 1 snaps the whole image to the 128-colour cutscene palette (the build until refine round 4); 0 (the default) keeps
   * the graded colour of every cell, with the palette for the drawn marks only (lines, rims, glints, halos). The
   * user's concept holds about 195,000 colours at its art grid. `?pixelPalette=lock` sets 1.
   */
  paletteLock: number;
  /** At night the highlights keep more chroma (lit windows stay amber, not cream): lightChromaCompression's night value. */
  nightLightChromaCompression: number;
  /** OKLab L the deepest darks are lifted toward: by day `floor`, at night `nightFloor` (0 off). */
  floor: number;
  nightFloor: number;
  /**
   * At night, how far green and teal leaves turn toward olive and how much of the shadow drive's violet they are
   * spared (0 off, 1 all the way): the concept's street trees are dark olive with gold where the lamps catch them,
   * where the night grade turned ours teal and violet-grey.
   */
  nightFoliageOlive: number;
  /**
   * The share of the night contrast car paint takes (by day half, so liveries stay bright; 0-1). Refine round 4: all
   * of it at night, so the cars sit deep in the night like the concept's instead of reading as bright plastic.
   */
  nightCarContrast: number;
  /** Relative depth tolerance that groups samples into one surface layer. */
  depthTolerance: number;
  /** Band offset amplitude in bands (0 disables) and band size in OKLab L. */
  bandStrength: number;
  bandStep: number;
  /** Placeholder band offset feature size in art cells (only without the surface stage). */
  bandFeatureCells: number;
  /** Placeholder sky band offset relative to surfaces (only without the surface stage; see skyFieldScale). */
  bandSkyScale: number;
  /** Palette match weights: lightness and chroma axes. */
  lightnessWeight: number;
  chromaWeight: number;
  /** Output pixels blended at cell borders: 1 = sharp-bilinear, 0 = nearest. */
  upscaleSoftness: number;
  /**
   * MSAA samples of the supersampled scene render (capped by the GPU). Each art
   * cell already resolves S x S pixels, so two samples keep alpha-to-coverage
   * foliage (8+ coverage steps per cell) for less raster work than four.
   */
  sceneSamples: number;
}

export interface PixelArtPass {
  /** Same contract as CinematicPass.render: physical output pixels; caller owns the camera. */
  render(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, time: number): void;
  configure(options: Partial<PixelArtOptions>): void;
  options(): PixelArtOptions;
  setDebugView(view: PixelArtDebugView): void;
  debugView(): PixelArtDebugView;
  /** Insert an art-resolution stage after a named stage (resolve, normals, grade, quantize, ...). */
  insertStage(stage: PixelArtStage, after: string): void;
  stageNames(): string[];
  grid(): PixelArtGrid | null;
  /** Road wetness (the road finish's 0.6 damp dusk .. 1 rain) and rain (0-1) for wet-ground reflections. */
  setWetness(wetness: number, rain: number): void;
  /** How much of the night grade applies (0 day, dusk and sunrise .. 1 night); see nightShadowHue. */
  setNight(night: number): void;
  /** Rigid moving objects (the cars, at most 8), anchored in their own frame and reprojected with their motion. */
  setMovers(objects: readonly THREE.Object3D[]): void;
  /** Drop the temporal history (camera cut, course change, seek). */
  resetHistory(): void;
  /** Spot lights whose pools become lit-ground flecks (street-lamp pools, shop lights, headlights; at most 16, read every frame). */
  setPoolLights(lights: readonly THREE.SpotLight[]): void;
  /** This frame's lamp heads and bright windows for the analytic wet-ground columns (the first `count`, at most 16). */
  setGroundEmitters(emitters: readonly GroundEmitter[], count: number): void;
  /** Ambient irradiance on upward ground (key, fill, environment), the reference the lamp pools are measured against. */
  setGroundAmbient(irradiance: THREE.Color): void;
  /** This frame's race hazards on the road (oil slicks, at most 8): drawn as flat outlined dark gloss. */
  setHazards(hazards: readonly GroundHazard[], count: number): void;
  /** Livery colour (sRGB hex) of a mover slot: distant cars are drawn in their livery ramp. */
  setMoverColour(slot: number, hex: string): void;
  /** Inspection: the local box of each mover slot (null when inactive). */
  moverBounds(): ({ min: number[]; max: number[] } | null)[];
  /**
   * Inspection (capture tools, never the frame loop): the named debug views of
   * the frame just drawn, as art-resolution RGBA8 rows from the top, read after
   * the frame so every view shows the same frame (null before the first frame).
   */
  inspectViews(views: readonly PixelArtDebugView[]): { width: number; height: number; views: Record<string, Uint8Array> } | null;
  /**
   * Inspection (perf tools, never the frame loop): re-runs the art-resolution
   * stages of the last frame `iterations` times (no scene render), waits for
   * the GPU (the upscale to the canvas and a 1-px read) and returns the mean
   * milliseconds per run ('all') and, when `perStage`, each stage's cost from
   * prefix timing (the chain up to it minus the chain before it; 'upscale' is
   * the upscale alone).
   */
  benchStages(iterations: number, perStage?: boolean): Record<string, number> | null;
  /** Inspection: this frame's camera sideways travel (m) and yaw change (rad) behind the ground's scroll registers. */
  scrollStep(): { side: number; turn: number; heading: readonly number[] };
  dispose(): void;
}

const DEFAULTS: PixelArtOptions = {
  toneMapping: 'renderer', exposure: 1, dayExposure: 1.45,
  darkChromaCompression: 0.45, darkChromaLow: 0.06, darkChromaHigh: 0.13, darkChromaEnd: 0.5, carChromaKeep: 1,
  lightChromaCompression: 0.4, lightChromaLow: 0.1, lightChromaHigh: 0.18, lightChromaStart: 0.66,
  shadowHue: 295, plumHue: 335, plumStrength: 0, plumStart: 0.13, plumFull: 0.26, groundFloor: 0.22, groundLift: 0, shadowStrength: 0.9, shadowChroma: 0.025, shadowStart: 0.22, shadowEnd: 0.5,
  highlightHue: 78, highlightStrength: 0.8, highlightChroma: 0.04, highlightStart: 0.6, highlightFull: 0.9,
  chroma: 1, nightDarkChromaCompression: 0.45, nightShadowHue: 272, nightChroma: 1.3, contrast: 0, nightContrast: 0.5, contrastLight: 0,
  nightContrastLight: 0.12, contrastPivot: 0.38, nightLightChromaCompression: 0.1, floor: 0, nightFloor: 0.18, nightFoliageOlive: 0.7, nightCarContrast: 1, paletteLock: 0,
  depthTolerance: 0.06,
  // Refine round 4 (the user's rain-night target, "it looks shabby"): no band offset (the full-colour image needs no
  // dither between palette entries), and a crisper upscale.
  bandStrength: 0, bandStep: 0.07, bandFeatureCells: 2, bandSkyScale: 0.35,
  lightnessWeight: 1.6, chromaWeight: 1,
  upscaleSoftness: 0.4, sceneSamples: 4,
  ...LINEWORK_DEFAULTS,
  ...SURFACE_DEFAULTS,
  ...CAR_DEFAULTS,
  ...ACCUMULATE_DEFAULTS,
  // The orphan-cell cleanup mended palette speckle; in full colour it only erased one-cell detail (lettering strokes,
  // eyes), so it runs with the palette lock (?pixelPalette=lock) alone.
  cleanup: 0,
  // Temporal accumulation steadied palette flicker but smeared everything that moves against the world: walkers'
  // faces and clothes ghosted into blurs (refine round 4). The index hold (temporal) still steadies the line stages.
  temporalAccumulate: 0,
};

/**
 * Hand-drawn pixel-art finish (docs/pixel-art-renderer.md): the detailed 3D
 * scene is rendered at S x the art grid, resolved to one colour per art cell,
 * graded and tone-mapped once, snapped to the cutscene palette and upscaled to
 * the backing canvas. Every intermediate lives on an explicit target. Stages:
 * resolve, normals, carMask, surface, reflect, grade, carPaint, accumulate,
 * quantize, temporal, lines, carLines, glints, glow, cleanup, foliage, sparkle
 * (then the optional debug view and upscale).
 */
export function createPixelArtPass(renderer: THREE.WebGLRenderer): PixelArtPass {
  const shared = createSharedUniforms();
  const targets = createTargets(renderer);
  const palette = createPaletteTextures(PIXEL_PALETTE);
  shared.paletteColors.value = palette.colors;
  shared.paletteLab.value = palette.lab;
  shared.paletteRamps.value = palette.ramps;
  shared.paletteLut.value = targets.lut.texture;
  shared.paletteSize.value = PIXEL_PALETTE.size;
  shared.sceneColor.value = targets.scene.texture;
  shared.sceneDepth.value = targets.scene.depthTexture;
  shared.resolvedColor.value = targets.resolved.textures[0]!;
  shared.resolvedData.value = targets.resolved.textures[1]!;
  shared.normals.value = targets.normals.texture;

  const lut = createLutBuilder(shared);
  const resolve = createResolveStage(shared);
  const grade = createGradeStage(shared);
  const quantize = createQuantizeStage(shared);
  const debug = createDebugStage(shared, quantize.uniforms);
  const upscale = createUpscale(shared);
  const linework = createLinework(shared, PIXEL_PALETTE, grade.uniforms.toneMappingExposure, quantize.uniforms.paletteFull);
  const surfaces = createSurfaces(shared, PIXEL_PALETTE,
    { exposure: grade.uniforms.toneMappingExposure, lutWeights: lut.weights, band: quantize.uniforms, key: linework.carHandoff,
      grade: { uniforms: grade.uniforms, done: grade.done } });
  const { surface, reflect, temporal, sparkle } = surfaces.stages;
  linework.setLampHeads(surfaces.lampHeads);
  const cars = createCars(shared, PIXEL_PALETTE, { movers: surfaces.movers, exposure: grade.uniforms.toneMappingExposure,
    key: linework.carHandoff, band: quantize.uniforms });
  const accumulate = createAccumulate(shared, { movers: surfaces.movers, speedParams: surfaces.speedParams, reflectReady: surfaces.reflectReady,
    scrollRows: surfaces.scrollRows, scrollParams: surfaces.scrollParams, band: quantize.uniforms });
  const [lines, ...afterLines] = linework.stages;
  const stages: PixelArtStage[] = [resolve.stage, createNormalStage(shared), cars.stages.mask, surface, reflect, grade.stage,
    cars.stages.paint, accumulate.stage, quantize.stage, temporal, lines!, cars.stages.lines, ...afterLines, sparkle];
  const quad = new FullScreenQuad();

  const settings: PixelArtOptions = { ...DEFAULTS };
  let lutDirty = true;
  let debugIndex = 0;
  let grid: PixelArtGrid | null = null;
  let imageIndex = 0;
  let disposed = false;
  const lastViewProjection = new THREE.Matrix4();
  let hasLast = false;

  const drawingBuffer = new THREE.Vector2();
  const savedViewport = new THREE.Vector4();
  const savedScissor = new THREE.Vector4();
  const savedClearColor = new THREE.Color();

  const draw = (material: THREE.RawShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    quad.render(renderer);
  };
  const frame: PixelArtFrame & { scene: THREE.Scene; camera: THREE.Camera; grid: PixelArtGrid; time: number } = {
    renderer, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), grid: pixelArtGrid(1, 1), time: 0,
    uniforms: shared, targets, draw,
    beginImageWrite: () => targets.images[1 - imageIndex]!,
    endImageWrite: () => { imageIndex = 1 - imageIndex; shared.image.value = targets.images[imageIndex]!.texture; },
  };

  let night = 0;
  function applySettings() {
    const radians = Math.PI / 180, lerp = THREE.MathUtils.lerp;
    grade.uniforms.darkChroma.value.set(lerp(settings.darkChromaCompression, settings.nightDarkChromaCompression, night), settings.darkChromaLow,
      settings.darkChromaHigh, settings.darkChromaEnd);
    grade.uniforms.lightChroma.value.set(lerp(settings.lightChromaCompression, settings.nightLightChromaCompression, night), settings.lightChromaLow,
      settings.lightChromaHigh, settings.lightChromaStart);
    grade.uniforms.shadowDrive.value.set(lerp(settings.shadowHue, settings.nightShadowHue, night) * radians, settings.shadowStrength, settings.shadowChroma);
    grade.uniforms.shadowRange.value.set(settings.shadowStart, settings.shadowEnd);
    grade.uniforms.plumDrive.value.set(settings.plumHue * radians, THREE.MathUtils.clamp(settings.plumStrength, 0, 1),
      settings.plumStart, Math.max(settings.plumStart + 1e-3, settings.plumFull));
    grade.uniforms.groundFloor.value.set(THREE.MathUtils.clamp(settings.groundFloor, 0.05, 0.5), THREE.MathUtils.clamp(settings.groundLift, 0, 1), 0.5);
    grade.uniforms.highlightDrive.value.set(settings.highlightHue * radians, settings.highlightStrength, settings.highlightChroma);
    grade.uniforms.highlightRange.value.set(settings.highlightStart, settings.highlightFull);
    grade.uniforms.chromaGain.value = lerp(settings.chroma, settings.nightChroma, night);
    grade.uniforms.gradeContrast.value.set(Math.max(0, lerp(settings.contrast, settings.nightContrast, night)), settings.contrastPivot,
      Math.max(0, lerp(settings.contrastLight, settings.nightContrastLight, night)));
    grade.uniforms.gradeFloor.value = Math.max(0, lerp(settings.floor, settings.nightFloor, night));
    grade.uniforms.gradeFoliage.value.set(.3 * night, .5 * night, THREE.MathUtils.clamp(settings.nightFoliageOlive, 0, 1) * night);
    grade.uniforms.gradeCarContrast.value = lerp(.5, THREE.MathUtils.clamp(settings.nightCarContrast, 0, 1), night);
    grade.uniforms.carChromaKeep.value = THREE.MathUtils.clamp(settings.carChromaKeep, 0, 1);
    resolve.depthTolerance.value = settings.depthTolerance;
    quantize.uniforms.bandStrength.value = settings.bandStrength;
    quantize.uniforms.paletteFull.value = settings.paletteLock > 0 ? 0 : 1;
    quantize.uniforms.bandStep.value = settings.bandStep;
    quantize.uniforms.bandFeatureCells.value = settings.bandFeatureCells;
    quantize.uniforms.bandSkyScale.value = settings.bandSkyScale;
    upscale.softness.value = settings.upscaleSoftness;
    const samples = Math.max(0, Math.min(Math.round(settings.sceneSamples), renderer.capabilities.maxSamples));
    if (samples !== targets.scene.samples) {
      // Reallocated on the next render (three re-initialises a disposed target).
      targets.scene.samples = samples;
      targets.scene.dispose();
    }
    linework.configure(settings);
    surfaces.configure(settings);
    cars.configure(settings);
    accumulate.configure(settings);
    // The temporal stage snaps to the palette itself: the quantize pass runs only without it.
    quantize.stage.enabled = !temporal.enabled;
    if (lut.weights.value.x !== settings.lightnessWeight || lut.weights.value.y !== settings.chromaWeight) {
      lut.weights.value.set(settings.lightnessWeight, settings.chromaWeight);
      lutDirty = true;
    }
  }
  applySettings();

  function resize(next: PixelArtGrid) {
    grid = next;
    targets.scene.setSize(next.sceneWidth, next.sceneHeight);
    for (const target of [targets.resolved, targets.normals, targets.graded, ...targets.images]) {
      target.setSize(next.artWidth, next.artHeight);
    }
    for (const stage of stages) stage.setSize(next);
    debug.stage.setSize(next);
    shared.artSize.value.set(next.artWidth, next.artHeight);
    shared.artOutputSize.value.set(next.outputWidth, next.outputHeight);
    shared.artSupersample.value = next.supersample;
    hasLast = false;
  }

  function updateCamera(camera: THREE.Camera) {
    const projection = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const perspective = camera.projectionMatrix.elements[11] === -1;
    shared.artCameraNear.value = projection.near;
    shared.artCameraFar.value = projection.far;
    shared.artCameraPerspective.value = perspective ? 1 : 0;
    shared.artCellWorldScale.value = 2 / (camera.projectionMatrix.elements[5]! * shared.artSize.value.y);
    shared.artProjection.value.copy(camera.projectionMatrix);
    shared.artProjectionInverse.value.copy(camera.projectionMatrixInverse);
    shared.artCameraWorld.value.copy(camera.matrixWorld);
    shared.artPreviousViewProjection.value.copy(lastViewProjection);
    shared.artHasPrevious.value = hasLast ? 1 : 0;
    lastViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    hasLast = true;
  }

  const pass: PixelArtPass = {
    render(scene, camera, width, height, time) {
      if (disposed || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      if (!grid || grid.outputWidth !== Math.max(1, Math.round(width))
        || grid.outputHeight !== Math.max(1, Math.round(height))) {
        const next = pixelArtGrid(width, height);
        if (!sameGrid(grid, next)) resize(next);
      }
      const current = grid!;
      frame.scene = scene; frame.camera = camera; frame.grid = current; frame.time = time;

      renderer.getDrawingBufferSize(drawingBuffer);
      if (drawingBuffer.x !== current.outputWidth || drawingBuffer.y !== current.outputHeight
        || renderer.getPixelRatio() !== 1) {
        renderer.setDrawingBufferSize(current.outputWidth, current.outputHeight, 1);
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
        // Materials write linear HDR into render targets (Three tone-maps only
        // at the canvas); the grade stage applies the single tone map.
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        if (lutDirty) { draw(lut.material, targets.lut); lutDirty = false; }

        renderer.setRenderTarget(targets.scene);
        renderer.clear(true, true, false);
        renderer.render(scene, camera);

        updateCamera(camera);
        shared.artTime.value = time;
        grade.uniforms.toneMapper.value = TONE_MAPPING_IDS[settings.toneMapping === 'renderer'
          ? pipelineToneMapping(savedToneMapping) : settings.toneMapping];
        const dayLift = THREE.MathUtils.lerp(settings.dayExposure, 1, night);
        grade.uniforms.toneMappingExposure.value = renderer.toneMappingExposure * settings.exposure * dayLift;
        grade.uniforms.gradeSkyExposure.value = 1 / Math.max(dayLift, 1e-3);
        shared.hdr.value = shared.resolvedColor.value;
        shared.image.value = targets.images[imageIndex]!.texture;
        for (const stage of stages) stage.beginFrame?.(frame);
        for (const stage of stages) if (stage.enabled) stage.render(frame);
        if (debug.stage.enabled) debug.stage.render(frame);

        renderer.setRenderTarget(null);
        renderer.setViewport(0, 0, current.outputWidth, current.outputHeight);
        draw(upscale.material, null);
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
        renderer.outputColorSpace = savedOutputColorSpace;
      }
    },
    configure(options) {
      if (disposed) return;
      for (const key of Object.keys(options) as (keyof PixelArtOptions)[]) {
        const value = options[key];
        if (key === 'toneMapping') {
          if (value === 'renderer' || (typeof value === 'string' && value in TONE_MAPPING_IDS)) {
            settings.toneMapping = value as PixelArtOptions['toneMapping'];
          }
        } else if (key in DEFAULTS && typeof value === 'number' && Number.isFinite(value)) {
          (settings as unknown as Record<string, number>)[key] = value;
        }
      }
      applySettings();
    },
    options: () => ({ ...settings }),
    setDebugView(view) {
      const index = PIXEL_ART_DEBUG_VIEWS.indexOf(view);
      if (index < 0 || disposed) return;
      debugIndex = index;
      debug.view.value = index;
      debug.stage.enabled = index > 0;
    },
    debugView: () => PIXEL_ART_DEBUG_VIEWS[debugIndex]!,
    insertStage(stage, after) {
      const at = stages.findIndex(existing => existing.name === after);
      if (at < 0) throw new Error(`Unknown pixel-art stage "${after}".`);
      stages.splice(at + 1, 0, stage);
      if (grid) stage.setSize(grid);
    },
    stageNames: () => stages.map(stage => stage.name),
    grid: () => grid,
    setWetness: (wetness, rain) => surfaces.setWetness(wetness, rain),
    setNight: value => {
      const next = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
      // The grade's uniforms only: nothing else in applySettings depends on the night.
      if (Math.abs(next - night) < 1e-3) return;
      night = next;
      const radians = Math.PI / 180, lerp = THREE.MathUtils.lerp;
      grade.uniforms.darkChroma.value.x = lerp(settings.darkChromaCompression, settings.nightDarkChromaCompression, night);
      grade.uniforms.shadowDrive.value.x = lerp(settings.shadowHue, settings.nightShadowHue, night) * radians;
      grade.uniforms.chromaGain.value = lerp(settings.chroma, settings.nightChroma, night);
      grade.uniforms.gradeContrast.value.x = Math.max(0, lerp(settings.contrast, settings.nightContrast, night));
      grade.uniforms.gradeContrast.value.z = Math.max(0, lerp(settings.contrastLight, settings.nightContrastLight, night));
      grade.uniforms.lightChroma.value.x = lerp(settings.lightChromaCompression, settings.nightLightChromaCompression, night);
      grade.uniforms.gradeFloor.value = Math.max(0, lerp(settings.floor, settings.nightFloor, night));
      grade.uniforms.gradeFoliage.value.set(.3 * night, .5 * night, THREE.MathUtils.clamp(settings.nightFoliageOlive, 0, 1) * night);
      grade.uniforms.gradeCarContrast.value = lerp(.5, THREE.MathUtils.clamp(settings.nightCarContrast, 0, 1), night);
    },
    setMovers: objects => surfaces.setMovers(objects),
    resetHistory: () => { surfaces.resetHistory(); accumulate.reset(); },
    setPoolLights: lights => surfaces.setPoolLights(lights),
    setGroundEmitters: (emitters, count) => surfaces.setGroundEmitters(emitters, count),
    setGroundAmbient: irradiance => surfaces.setGroundAmbient(irradiance),
    setHazards: (hazards, count) => surfaces.setHazards(hazards, count),
    setMoverColour: (slot, hex) => cars.setMoverColour(slot, hex),
    moverBounds: () => surfaces.moverBounds(),
    scrollStep: () => surfaces.scrollStep(),
    benchStages(iterations, perStage) {
      if (disposed || !grid || !hasLast) return null;
      const n = Math.max(1, Math.floor(iterations));
      const saved = renderer.getRenderTarget();
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      const active = stages.filter(stage => stage.enabled);
      // Each run ends with the upscale to the canvas and a 1-px read of it,
      // which waits for every command before it.
      const run = (count: number) => {
        shared.hdr.value = shared.resolvedColor.value;
        shared.image.value = targets.images[imageIndex]!.texture;
        for (const stage of stages) stage.beginFrame?.(frame);
        for (let i = 0; i < count; i++) active[i]!.render(frame);
        renderer.setRenderTarget(null);
        renderer.setViewport(0, 0, grid!.outputWidth, grid!.outputHeight);
        draw(upscale.material, null);
      };
      const time = (count: number) => {
        run(count); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) run(count);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return (performance.now() - t0) / n;
      };
      const out: Record<string, number> = {};
      try {
        out.all = time(active.length);
        if (perStage) {
          // Prefix timing: each stage's cost is the chain up to it minus the chain before it.
          let before = time(0);
          out.upscale = before;
          for (let k = 0; k < active.length; k++) {
            const t = time(k + 1);
            out[active[k]!.name] = t - before;
            before = t;
          }
        }
      } finally {
        renderer.setRenderTarget(saved);
      }
      return out;
    },
    inspectViews(views) {
      if (disposed || !grid) return null;
      const { artWidth: width, artHeight: height } = grid;
      const out: Record<string, Uint8Array> = {};
      const saved = renderer.getRenderTarget();
      const savedView = debug.view.value;
      const rows = new Uint8Array(width * height * 4);
      try {
        for (const name of views) {
          const index = PIXEL_ART_DEBUG_VIEWS.indexOf(name);
          if (index < 0) continue;
          debug.view.value = index;
          debug.prepare();
          draw(debug.material, debug.target);
          renderer.readRenderTargetPixels(debug.target, 0, 0, width, height, rows);
          const image = new Uint8Array(width * height * 4);
          for (let y = 0; y < height; y++) image.set(rows.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
          out[name] = image;
        }
      } finally {
        debug.view.value = savedView;
        renderer.setRenderTarget(saved);
      }
      return { width, height, views: out };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stage of stages) stage.dispose();
      debug.stage.dispose();
      lut.material.dispose();
      upscale.material.dispose();
      targets.scene.depthTexture?.dispose();
      for (const target of [targets.scene, targets.resolved, targets.normals, targets.graded, ...targets.images, targets.lut]) target.dispose();
      palette.colors.dispose(); palette.lab.dispose(); palette.ramps.dispose();
      quad.dispose();
    },
  };

  const initialView = debugViewFromLocation();
  if (initialView) pass.setDebugView(initialView);
  if (searchParam('pixelUpscale') === 'nearest') pass.configure({ upscaleSoftness: 0 });
  if (searchParam('pixelPalette') === 'lock') pass.configure({ paletteLock: 1, cleanup: 1, temporalAccumulate: 1, bandStrength: 0.3 });
  if (searchParam('pixelLinework') !== null) pass.configure(lineworkOptionsFromQuery(window.location.search));
  if (searchParam('pixelSurfaces') !== null || searchParam('pixelGround') !== null) pass.configure(surfaceOptionsFromQuery(window.location.search));
  if (searchParam('pixelCars') !== null) pass.configure(carOptionsFromQuery(window.location.search));
  registerDebugHandle(pass);
  return pass;
}

/** The grade implements Three's Neutral, ACES and AgX curves; others map to Neutral. */
function pipelineToneMapping(toneMapping: THREE.ToneMapping): PixelArtToneMapping {
  if (toneMapping === THREE.NoToneMapping || toneMapping === THREE.LinearToneMapping) return 'none';
  if (toneMapping === THREE.ACESFilmicToneMapping) return 'aces';
  if (toneMapping === THREE.AgXToneMapping) return 'agx';
  return 'neutral';
}

function searchParam(name: string): string | null {
  try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
}

function debugViewFromLocation(): PixelArtDebugView | null {
  const view = searchParam('pixelDebug');
  return PIXEL_ART_DEBUG_VIEWS.find(candidate => candidate === view) ?? null;
}

/**
 * Inspection hook: window.__soraPixelArt.setDebugView('depth'), .configure({...}),
 * .options(), .grid(). At load time, ?pixelDebug=<view> selects a view,
 * ?pixelUpscale=nearest replaces the sharp-bilinear upscale (palette checks),
 * ?pixelLinework=off|<stage list> selects linework stages,
 * ?pixelSurfaces=off|field,wet,temporal the surface stages,
 * ?pixelGround=off|dashes,flecks,columns,dry,glints the ground stage's parts and
 * ?pixelCars=off|mask,paint,lines the car stages (A/B captures).
 */
function registerDebugHandle(pass: PixelArtPass) {
  if (typeof window === 'undefined') return;
  (window as unknown as { __soraPixelArt?: unknown }).__soraPixelArt = {
    views: PIXEL_ART_DEBUG_VIEWS,
    setDebugView: pass.setDebugView, debugView: pass.debugView,
    configure: pass.configure, options: pass.options,
    stageNames: pass.stageNames, grid: pass.grid, resetHistory: pass.resetHistory, moverBounds: pass.moverBounds,
    inspectViews: pass.inspectViews, scrollStep: pass.scrollStep, benchStages: pass.benchStages,
  };
}
