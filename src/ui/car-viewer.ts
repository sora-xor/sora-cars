import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import type { CarBuild } from '../game/car-builds';
import { addDissolve, carNight, loadDetailedCar, setDetailedCarNight } from '../game/three/asset-car';
import type { CarModel } from '../game/three/car';
import { createDetailedDriver } from '../game/three/driver';
import { createDuskEnvironment } from '../game/three/dusk-environment';
import { getPixelFinish } from '../game/three/graphics';
import { plateTexture } from '../game/three/period-cars/fleet';
import { createPeriodCar, type CarDecals } from '../game/three/period-cars/model';
import { soraEmblemTexture, soraStripTexture } from '../game/three/sora-emblem';
import { CSS_PER_ART_PIXEL } from './part-viewer';

/**
 * The garage's turntable: your car as built, turning on a lit deck. With the pixel finish (the default) it is drawn
 * like the race, at the cutscenes' art-pixel size in full colour with an ink outline; without it, smooth. One offscreen
 * WebGL renderer draws into whichever <canvas data-car-view> the garage page shows. Drag to turn it.
 */
const SPIN = 0.45, REST = -0.75, ELEVATION = THREE.MathUtils.degToRad(17);
const RESOLVE_VERTEX = /* glsl */ `precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0., 1.); }`;
// Each art cell is the average of its samples, tone mapped; empty cells beside the car take the cutscenes' ink.
const RESOLVE_FRAGMENT = /* glsl */ `precision highp float;
precision highp sampler2D;
uniform sampler2D sceneColor;
uniform ivec2 artSize;
uniform int supersample;
uniform bool pixel;
uniform float exposure;
out vec4 fragColor;
vec4 cell(ivec2 at) {
  if (at.x < 0 || at.y < 0 || at.x >= artSize.x || at.y >= artSize.y) return vec4(0.);
  vec4 sum = vec4(0.);
  for (int y = 0; y < 4; y++) { if (y >= supersample) break;
    for (int x = 0; x < 4; x++) { if (x >= supersample) break; sum += texelFetch(sceneColor, at * supersample + ivec2(x, y), 0); } }
  return sum / float(supersample * supersample);
}
vec3 tonemap(vec3 c) { c *= exposure; return clamp((c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14), 0., 1.); }
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 here = cell(at);
  if (pixel && here.a < .5) {
    float near = max(max(cell(at + ivec2(1, 0)).a, cell(at - ivec2(1, 0)).a), max(cell(at + ivec2(0, 1)).a, cell(at - ivec2(0, 1)).a));
    fragColor = near >= .5 ? vec4(.086, .086, .145, 1.) : vec4(0.);
    return;
  }
  fragColor = here.a > 0. ? vec4(srgb(tonemap(here.rgb / here.a)) * (pixel ? 1. : here.a), pixel ? 1. : here.a) : vec4(0.);
}`;

interface Gpu {
  readonly renderer: THREE.WebGLRenderer; readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera; readonly stage: THREE.Group;
  readonly resolve: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>; readonly resolveScene: THREE.Scene; readonly resolveCamera: THREE.Camera;
  target: THREE.WebGLRenderTarget | null; readonly decals: CarDecals;
}

export class CarViewer {
  #gpu: Gpu | null = null;
  #failed = false;
  #canvas: HTMLCanvasElement | null = null;
  #context: CanvasRenderingContext2D | null = null;
  #model: CarModel | null = null;
  #key = '';
  #generation = 0;
  #angle = REST;
  #held = 0;
  #drag: { x: number } | null = null;
  #frame = 0;
  #last = 0;
  #loading = false;
  readonly #reduced = matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private readonly active: () => boolean, private readonly onLoading: (loading: boolean) => void = () => {}) {}

  /** Show `build` in the turntable canvas under `root`, after the page re-renders. */
  attach(root: ParentNode, build: CarBuild): void {
    const canvas = root.querySelector<HTMLCanvasElement>('canvas[data-car-view]');
    if (!canvas) return;
    if (canvas !== this.#canvas) {
      this.#canvas = canvas; this.#context = canvas.getContext('2d');
      canvas.addEventListener('pointerdown', event => { canvas.setPointerCapture(event.pointerId); this.#drag = { x: event.clientX }; });
      canvas.addEventListener('pointermove', event => {
        if (!this.#drag) return;
        this.#angle += (event.clientX - this.#drag.x) * 0.012; this.#drag.x = event.clientX; this.#held = performance.now() / 1000 + 1.5;
      });
      const release = () => { this.#drag = null; };
      canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
    }
    if (!this.#gpu && !this.#failed) this.#setup();
    this.show(build);
    if (!this.#frame) this.#frame = requestAnimationFrame(this.#tick);
  }

  /** Swap the turntable's car to `build` (a detailed hachiroku loads its model first). */
  show(build: CarBuild): void {
    const key = JSON.stringify(build), gpu = this.#gpu;
    if (key === this.#key || !gpu) return;
    this.#key = key;
    const generation = ++this.#generation;
    this.#setLoading(true);
    const make = async (): Promise<CarModel> => {
      if (build.body === 'hachiroku') return loadDetailedCar(build, gpu.decals.flag, gpu.decals.emblem, gpu.decals.strip);
      const driver = await createDetailedDriver().catch(() => null);
      return createPeriodCar(build.body, build, gpu.decals, { dissolve: addDissolve, night: carNight }, driver?.group);
    };
    void make().then(model => {
      if (generation !== this.#generation) { model.dispose?.(); return; }
      if (this.#model) { gpu.scene.remove(this.#model.group); this.#model.dispose?.(); }
      this.#model = model; model.animate(0, 0, false, false, 0); gpu.scene.add(model.group);
      this.#setLoading(false);
    }, error => { console.error('The garage could not build this car.', error); this.#setLoading(false); });
  }

  #setLoading(loading: boolean): void { if (loading !== this.#loading) { this.#loading = loading; this.onLoading(loading); } }

  #setup(): void {
    try {
      const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: false, premultipliedAlpha: true });
      renderer.setPixelRatio(1); renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = false;
      renderer.domElement.addEventListener('webglcontextlost', () => { this.#failed = true; });
      // The cutscenes' night: a warm amber key, a violet rim, a cool fill, and the race's dusk sky in the paint.
      const scene = new THREE.Scene(), key = new THREE.DirectionalLight(0xffd8a6, 2.6), rim = new THREE.DirectionalLight(0x9b86ff, 2.2),
        fill = new THREE.DirectionalLight(0x7fd8ff, 0.6), top = new THREE.DirectionalLight(0xfff4e0, 1.0);
      key.position.set(-3, 4, 3.5); rim.position.set(3.5, 2, -3); fill.position.set(3, 0.5, 2.5); top.position.set(0.4, 6, 0.5);
      scene.add(new THREE.HemisphereLight(0xc6ccff, 0x3d2836, 0.9), key, rim, fill, top);
      new HDRLoader().load(`${import.meta.env.BASE_URL}assets/lighting/qwantani-dusk.hdr`, texture => {
        const target = createDuskEnvironment(renderer, texture); texture.dispose();
        scene.environment = target.texture; scene.environmentIntensity = 0.45;
      });
      setDetailedCarNight(0.5);
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.62, 0.08, 72), new THREE.MeshStandardMaterial({ color: 0x2b2142, metalness: 0.4, roughness: 0.45 }));
      deck.position.y = -0.04; deck.receiveShadow = true;
      const glow = new THREE.Mesh(new THREE.TorusGeometry(2.58, 0.022, 8, 128), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb35c, emissiveIntensity: 1.6 }));
      glow.rotation.x = Math.PI / 2; glow.position.y = 0.002;
      const stage = new THREE.Group(); stage.add(deck, glow); scene.add(stage);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      const material = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: RESOLVE_VERTEX, fragmentShader: RESOLVE_FRAGMENT, depthTest: false, depthWrite: false,
        uniforms: { sceneColor: { value: null }, artSize: { value: new THREE.Vector2(1, 1) }, supersample: { value: 3 }, pixel: { value: true }, exposure: { value: 1.05 } } });
      const resolve = new THREE.Mesh(geometry, material); resolve.frustumCulled = false;
      const resolveScene = new THREE.Scene(); resolveScene.add(resolve);
      const flag = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/sora-flag.png`); flag.colorSpace = THREE.SRGBColorSpace;
      const emblemUrl = `${import.meta.env.BASE_URL}assets/branding/sora-emblem-source.png`;
      this.#gpu = { renderer, scene, camera: new THREE.PerspectiveCamera(24, 1, 0.1, 60), stage, resolve, resolveScene, resolveCamera: new THREE.Camera(), target: null,
        decals: { flag, emblem: soraEmblemTexture(emblemUrl, 512, .3), strip: soraStripTexture(emblemUrl), plate: plateTexture() } };
    } catch {
      this.#failed = true;
    }
  }

  #tick = (time: number): void => {
    this.#frame = 0;
    if (!this.#canvas?.isConnected || !this.active() || this.#failed) { this.#last = 0; return; }
    const seconds = time / 1000, dt = this.#last ? Math.min(0.1, seconds - this.#last) : 0; this.#last = seconds;
    if (this.#reduced.matches) { if (!this.#drag && seconds > this.#held) this.#angle += (REST - this.#angle) * Math.min(1, dt * 4); }
    else if (!this.#drag && seconds > this.#held) this.#angle += dt * SPIN;
    this.#draw(seconds);
    this.#frame = requestAnimationFrame(this.#tick);
  };

  #draw(seconds: number): void {
    const gpu = this.#gpu, canvas = this.#canvas, context = this.#context;
    if (!gpu || !canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const pixel = getPixelFinish();
    const width = pixel ? Math.max(16, Math.round(rect.width / CSS_PER_ART_PIXEL)) : Math.round(rect.width * Math.min(2, devicePixelRatio || 1));
    const height = pixel ? Math.max(16, Math.round(rect.height / CSS_PER_ART_PIXEL)) : Math.round(rect.height * Math.min(2, devicePixelRatio || 1));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const supersample = pixel ? 3 : 1, { renderer, scene, camera } = gpu;
    if (this.#model) { this.#model.group.rotation.y = this.#angle; this.#model.animate(0, 0, false, false, seconds); }
    gpu.stage.rotation.y = this.#angle;
    // Frame the deck (a 4.45 m car turns inside its 2.55 m radius) and the roof from a little above, whatever the heading.
    const aspect = width / height, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const distance = Math.max(1.6 / tanV, 2.95 / (tanV * aspect)) * 1.04;
    camera.aspect = aspect; camera.position.set(0, 0.45 + Math.sin(ELEVATION) * distance, Math.cos(ELEVATION) * distance);
    camera.lookAt(0, 0.45, 0); camera.updateProjectionMatrix();
    const w = width * supersample, h = height * supersample;
    if (!gpu.target || gpu.target.width !== w || gpu.target.height !== h) {
      gpu.target?.dispose(); gpu.target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
    }
    renderer.setRenderTarget(gpu.target); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    const output = renderer.domElement;
    if (output.width < width || output.height < height) renderer.setSize(Math.max(output.width, width), Math.max(output.height, height), false);
    const uniforms = gpu.resolve.material.uniforms;
    uniforms.sceneColor!.value = gpu.target.texture; (uniforms.artSize!.value as THREE.Vector2).set(width, height);
    uniforms.supersample!.value = supersample; uniforms.pixel!.value = pixel;
    renderer.setRenderTarget(null); renderer.setViewport(0, 0, width, height); renderer.clear(); renderer.render(gpu.resolveScene, gpu.resolveCamera);
    context.clearRect(0, 0, width, height);
    context.drawImage(output, 0, output.height - height, width, height, 0, 0, width, height);
  }
}
