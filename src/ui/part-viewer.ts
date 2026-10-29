import * as THREE from 'three';
import { getPixelFinish } from '../game/three/graphics';
import { createPartModel, type PartAnimation, type PartTextures } from '../game/three/part-models';
import { PIXEL_PALETTE } from '../game/three/pixel-art/palette';
import { soraEmblemTexture } from '../game/three/sora-emblem';

// Spinning 3D parts for the tech tree. One offscreen WebGL renderer draws every
// <canvas data-part-art> on the page: card icons and the detail panel's turntable.
// With the pixel finish (the default) each part is supersampled, resolved to one
// art pixel per cell, matched to the cutscene palette and outlined, like the
// race's pixel-art renderer; without it the parts render smooth.

/** A card icon, or the large turntable in the detail panel. */
export type PartArtKind = 'icon' | 'hero';
export interface PartArtGrid {
  /** Canvas size: art pixels with the pixel finish, device pixels without. */
  readonly width: number; readonly height: number;
  /** Scene samples per output pixel along each axis. */
  readonly supersample: number;
  readonly pixel: boolean;
}
/** CSS pixels per art pixel with the pixel finish, close to the cutscenes' density on a laptop. */
export const CSS_PER_ART_PIXEL = 2;
export function partArtGrid(cssWidth: number, cssHeight: number, devicePixelRatio: number, pixel: boolean): PartArtGrid {
  const width = Math.max(1, cssWidth), height = Math.max(1, cssHeight);
  if (pixel) return { width: Math.max(8, Math.round(width / CSS_PER_ART_PIXEL)), height: Math.max(8, Math.round(height / CSS_PER_ART_PIXEL)), supersample: 4, pixel };
  const ratio = Math.min(2, Math.max(1, devicePixelRatio || 1));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio), supersample: 2, pixel };
}

/** Turntable speeds in radians per second; a hovered card spins its part faster. */
const SPIN = { idle: 0.7, hover: 2.6 } as const;
/** Three-quarter view used when motion is reduced. */
const REST_ANGLE = -0.6;
const CELEBRATION = 1.2;
const ELEVATION = THREE.MathUtils.degToRad(20);
const SPARKS = ['#fdd176', '#fbf5d2', '#e24a3a', '#fee192'];
/** Cutscene ink (#161625), the outline round every sprite, as display sRGB. */
const OUTLINE = new THREE.Vector3(0x16 / 255, 0x16 / 255, 0x25 / 255);

const RESOLVE_VERTEX = /* glsl */ `precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0., 1.); }`;
// Average each cell's samples; with the pixel finish, outline the silhouette and
// snap every covered cell to the nearest cutscene colour in OKLab.
const RESOLVE_FRAGMENT = /* glsl */ `precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D sceneColor;
uniform sampler2D paletteLab;
uniform sampler2D paletteRgb;
uniform int paletteSize;
uniform ivec2 artSize;
uniform int supersample;
uniform bool quantize;
uniform vec3 outline;
uniform float exposure;
out vec4 fragColor;
vec4 cell(ivec2 at) {
  if (at.x < 0 || at.y < 0 || at.x >= artSize.x || at.y >= artSize.y) return vec4(0.);
  vec4 sum = vec4(0.);
  for (int y = 0; y < 4; y++) {
    if (y >= supersample) break;
    for (int x = 0; x < 4; x++) {
      if (x >= supersample) break;
      sum += texelFetch(sceneColor, at * supersample + ivec2(x, y), 0);
    }
  }
  return sum / float(supersample * supersample);
}
vec3 tonemap(vec3 c) { c *= exposure; return clamp((c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14), 0., 1.); }
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
vec3 oklab(vec3 c) {
  vec3 lms = pow(max(vec3(.4122214708 * c.r + .5363325363 * c.g + .0514459929 * c.b,
    .2119034982 * c.r + .6806995451 * c.g + .1073969566 * c.b,
    .0883024619 * c.r + .2817188376 * c.g + .6299787005 * c.b), 0.), vec3(1. / 3.));
  return vec3(.2104542553 * lms.x + .793617785 * lms.y - .0040720468 * lms.z,
    1.9779984951 * lms.x - 2.428592205 * lms.y + .4505937099 * lms.z,
    .0259040371 * lms.x + .7827717662 * lms.y - .808675766 * lms.z);
}
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 here = cell(at);
  if (!quantize) {
    fragColor = here.a > 0. ? vec4(srgb(tonemap(here.rgb / here.a)) * here.a, here.a) : vec4(0.);
    return;
  }
  if (here.a < .5) {
    float near = max(max(cell(at + ivec2(1, 0)).a, cell(at - ivec2(1, 0)).a), max(cell(at + ivec2(0, 1)).a, cell(at - ivec2(0, 1)).a));
    fragColor = near >= .5 ? vec4(outline, 1.) : vec4(0.);
    return;
  }
  vec3 lab = oklab(tonemap(here.rgb / here.a));
  int best = 0;
  float bestDistance = 1e9;
  for (int i = 0; i < 256; i++) {
    if (i >= paletteSize) break;
    vec3 d = lab - texelFetch(paletteLab, ivec2(i, 0), 0).xyz;
    d.x *= 1.3;
    float distance = dot(d, d);
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  }
  fragColor = vec4(texelFetch(paletteRgb, ivec2(best, 0), 0).rgb, 1.);
}`;

interface View {
  readonly canvas: HTMLCanvasElement; readonly context: CanvasRenderingContext2D;
  readonly part: string; readonly kind: PartArtKind;
  grid: PartArtGrid | null; visible: boolean; hover: boolean;
}
interface Spin { angle: number; boost: number; held: number; celebrated: number }
interface Gpu {
  /** Shaders compile in the background; parts draw once they are ready. */
  ready: boolean;
  readonly renderer: THREE.WebGLRenderer; readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera;
  readonly stage: THREE.Group; readonly textures: PartTextures;
  readonly resolve: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>; readonly resolveScene: THREE.Scene; readonly resolveCamera: THREE.Camera;
  readonly targets: Map<string, THREE.WebGLRenderTarget>;
}

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function carbonWeave(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d')!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { context.fillStyle = (x + y) % 4 < 2 ? '#585c6c' : '#2c2e39'; context.fillRect(x * 4, y * 4, 4, 4); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(4, 4); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class PartViewer {
  #gpu: Gpu | null = null;
  #failed = false;
  #views: View[] = [];
  #models = new Map<string, THREE.Group>();
  #spins = new Map<string, Spin>();
  #frame = 0;
  #last = 0;
  #even = false;
  #drag: { part: string; x: number; time: number; velocity: number } | null = null;
  readonly #observer: IntersectionObserver | null;
  readonly #reduced = matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private readonly active: () => boolean) {
    this.#observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      for (const entry of entries) { const view = this.#views.find(v => v.canvas === entry.target); if (view) view.visible = entry.isIntersecting; }
    }) : null;
  }

  /** Pick up the part canvases under `root` after it re-renders, draw them at once and keep them turning. */
  attach(root: ParentNode): void {
    // The first visit sets up WebGL after the page has painted.
    if (!this.#gpu && !this.#failed) { setTimeout(() => this.#gpuFor(), 0); }
    this.#prune();
    const now = performance.now() / 1000;
    for (const canvas of root.querySelectorAll<HTMLCanvasElement>('canvas[data-part-art]')) {
      if (this.#views.some(view => view.canvas === canvas)) continue;
      const context = canvas.getContext('2d'), part = canvas.dataset.part ?? '';
      if (!context) continue;
      const view: View = { canvas, context, part, kind: canvas.dataset.partArt === 'hero' ? 'hero' : 'icon', grid: null, visible: true, hover: false };
      this.#views.push(view);
      this.#observer?.observe(canvas);
      const card = canvas.closest<HTMLElement>('.tech-part');
      card?.addEventListener('pointerenter', () => { view.hover = true; });
      card?.addEventListener('pointerleave', () => { view.hover = false; });
      if (view.kind === 'hero') this.#draggable(view);
      this.#draw(view, now);
    }
    if (!this.#frame && this.#views.length) this.#frame = requestAnimationFrame(this.#tick);
  }
  /** A part was just bought or swapped in: spin it up and burst sparks round the turntable. */
  celebrate(part: string): void {
    const spin = this.#spin(part);
    spin.celebrated = performance.now() / 1000;
    if (!this.#reduced.matches) spin.boost = 18;
  }

  #tick = (time: number): void => {
    this.#frame = 0;
    this.#prune();
    if (!this.#views.length || !this.active() || this.#failed) { this.#last = 0; return; }
    const seconds = time / 1000, dt = this.#last ? Math.min(0.1, seconds - this.#last) : 0;
    this.#last = seconds; this.#even = !this.#even;
    const hovered = new Set(this.#views.filter(view => view.hover).map(view => view.part));
    for (const part of new Set(this.#views.map(view => view.part))) {
      const spin = this.#spin(part);
      if (this.#reduced.matches) { if (seconds > spin.held && !this.#drag) spin.angle += (REST_ANGLE - spin.angle) * Math.min(1, dt * 4); continue; }
      if (this.#drag?.part !== part) spin.angle += dt * ((seconds > spin.held ? hovered.has(part) ? SPIN.hover : SPIN.idle : 0) + spin.boost);
      spin.boost *= Math.exp(-dt * 2.4);
    }
    for (const view of this.#views) {
      // Idle icons turn at half rate; the turntable, hovered and celebrating parts every frame.
      if (view.visible && (view.kind === 'hero' || view.hover || this.#even || seconds - this.#spin(view.part).celebrated < CELEBRATION)) this.#draw(view, seconds);
    }
    this.#frame = requestAnimationFrame(this.#tick);
  };

  /** Forget canvases a re-render replaced. */
  #prune(): void {
    for (const view of this.#views) if (!view.canvas.isConnected) this.#observer?.unobserve(view.canvas);
    this.#views = this.#views.filter(view => view.canvas.isConnected);
  }
  #spin(part: string): Spin {
    let spin = this.#spins.get(part);
    if (!spin) this.#spins.set(part, spin = { angle: REST_ANGLE + hash(part.length * 13 + part.charCodeAt(0)) * 0.8, boost: 0, held: 0, celebrated: -Infinity });
    return spin;
  }
  #draggable(view: View): void {
    const { canvas, part } = view, spin = this.#spin(part);
    canvas.addEventListener('pointerdown', event => { canvas.setPointerCapture(event.pointerId); this.#drag = { part, x: event.clientX, time: event.timeStamp, velocity: 0 }; spin.boost = 0; });
    canvas.addEventListener('pointermove', event => {
      const drag = this.#drag; if (!drag || drag.part !== part) return;
      const turn = (event.clientX - drag.x) * 0.012;
      spin.angle += turn; spin.held = performance.now() / 1000 + 1.2;
      drag.velocity = turn / Math.max(8, event.timeStamp - drag.time) * 1000; drag.x = event.clientX; drag.time = event.timeStamp;
      if (!this.#frame) this.#draw(view, performance.now() / 1000);
    });
    const release = () => { if (this.#drag?.part === part) { spin.boost = THREE.MathUtils.clamp(this.#drag.velocity, -14, 14); this.#drag = null; } };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  }

  #gpuFor(): Gpu | null {
    if (this.#gpu || this.#failed) return this.#gpu;
    try {
      const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: false, premultipliedAlpha: true });
      renderer.setPixelRatio(1); renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = false;
      renderer.domElement.addEventListener('webglcontextlost', () => { this.#failed = true; });
      // Cutscene night lighting: warm amber key, violet rim, cool harbour fill and a top light
      // for the metals' shine. No reflection map: its shaders would stall the first visit.
      const scene = new THREE.Scene(), key = new THREE.DirectionalLight(0xffd8a6, 3), rim = new THREE.DirectionalLight(0x9b86ff, 2.6),
        fill = new THREE.DirectionalLight(0x7fd8ff, 0.8), top = new THREE.DirectionalLight(0xfff4e0, 1.4);
      key.position.set(2.5, 3.5, 3); rim.position.set(-3, 1.6, -2.6); fill.position.set(-2.6, -0.6, 2); top.position.set(0.4, 5, 0.8);
      scene.add(new THREE.HemisphereLight(0xc6ccff, 0x3d2836, 1.3), key, rim, fill, top);
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.04, 0.07, 64), new THREE.MeshStandardMaterial({ color: 0x2b2142, metalness: 0.4, roughness: 0.45, side: THREE.DoubleSide }));
      const glow = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.016, 8, 96), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb35c, emissiveIntensity: 1.6, side: THREE.DoubleSide }));
      glow.rotation.x = Math.PI / 2; glow.position.y = 0.036;
      const stage = new THREE.Group(); stage.add(deck, glow);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      const lab = new THREE.DataTexture(PIXEL_PALETTE.oklab, PIXEL_PALETTE.size, 1, THREE.RGBAFormat, THREE.FloatType);
      const rgb = new THREE.DataTexture(PIXEL_PALETTE.rgba, PIXEL_PALETTE.size, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
      lab.needsUpdate = rgb.needsUpdate = true;
      const material = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: RESOLVE_VERTEX, fragmentShader: RESOLVE_FRAGMENT, depthTest: false, depthWrite: false,
        uniforms: {
          sceneColor: { value: null }, paletteLab: { value: lab }, paletteRgb: { value: rgb }, paletteSize: { value: PIXEL_PALETTE.size },
          artSize: { value: new THREE.Vector2(1, 1) }, supersample: { value: 4 }, quantize: { value: true }, outline: { value: OUTLINE }, exposure: { value: 1.05 },
        },
      });
      const resolve = new THREE.Mesh(geometry, material); resolve.frustumCulled = false;
      const resolveScene = new THREE.Scene(); resolveScene.add(resolve);
      const textures = { emblem: soraEmblemTexture(`${import.meta.env.BASE_URL}assets/branding/sora-emblem-source.png`), carbon: carbonWeave() };
      const gpu: Gpu = this.#gpu = {
        ready: false, renderer, scene, camera: new THREE.PerspectiveCamera(22, 1, 0.1, 50), stage, textures, resolve, resolveScene, resolveCamera: new THREE.Camera(), targets: new Map(),
      };
      // Compile every program the parts use without blocking the page: the bonnet carries all
      // three material kinds. Programs depend on the target, so compile against a scene target.
      const sample = createPartModel('body-light', textures);
      scene.add(sample, stage);
      renderer.setRenderTarget(this.#target(gpu, 64, 64));
      const parts = renderer.compileAsync(scene, gpu.camera);
      renderer.setRenderTarget(null);
      scene.remove(sample, stage);
      void Promise.all([parts, renderer.compileAsync(resolveScene, gpu.resolveCamera)]).then(() => {
        gpu.ready = true;
        this.#prune();
        for (const view of this.#views) this.#draw(view, performance.now() / 1000);
        if (!this.#frame && this.#views.length) this.#frame = requestAnimationFrame(this.#tick);
      }, () => { this.#failed = true; });
    } catch {
      this.#failed = true;
    }
    return this.#gpu;
  }
  #model(gpu: Gpu, part: string): THREE.Group | null {
    let model = this.#models.get(part);
    if (!model) {
      try { model = createPartModel(part, gpu.textures); } catch { return null; }
      const size = new THREE.Box3().setFromObject(model, true).getSize(new THREE.Vector3());
      model.userData.reach = Math.hypot(size.x, size.z) / 2; model.userData.halfHeight = size.y / 2;
      this.#models.set(part, model);
    }
    return model;
  }
  #target(gpu: Gpu, width: number, height: number): THREE.WebGLRenderTarget {
    const key = `${width}x${height}`;
    let target = gpu.targets.get(key);
    if (!target) gpu.targets.set(key, target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: true }));
    return target;
  }

  #draw(view: View, seconds: number): void {
    const gpu = this.#gpu, model = gpu?.ready ? this.#model(gpu, view.part) : null;
    if (!gpu || !model) return;
    const { canvas, context } = view, rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const grid = partArtGrid(rect.width, rect.height, devicePixelRatio, getPixelFinish());
    if (!view.grid || view.grid.width !== grid.width || view.grid.height !== grid.height || view.grid.pixel !== grid.pixel) {
      canvas.width = grid.width; canvas.height = grid.height; view.grid = grid;
    }
    const { renderer, scene, camera, stage } = gpu, hero = view.kind === 'hero', spin = this.#spin(view.part);
    const reach = model.userData.reach as number, halfHeight = model.userData.halfHeight as number;
    model.rotation.y = spin.angle;
    model.position.y = hero && !this.#reduced.matches ? Math.sin(seconds * 1.7) * 0.025 : 0;
    if (!this.#reduced.matches) (model.userData.animate as PartAnimation | undefined)?.(seconds);
    // Frame the turning part (and its turntable) whatever its angle.
    const floor = -halfHeight - 0.12, top = halfHeight, bottom = hero ? floor - 0.06 : -halfHeight;
    stage.visible = hero; stage.position.y = floor; stage.scale.setScalar(Math.max(0.75, reach * 1.02));
    const centerY = (top + bottom) / 2, aspect = grid.width / grid.height, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const halfV = ((top - bottom) / 2) * Math.cos(ELEVATION) + reach * Math.sin(ELEVATION), distance = Math.max(halfV / tanV, reach / (tanV * aspect)) * 1.04 + reach * 0.45;
    camera.aspect = aspect; camera.position.set(0, centerY + Math.sin(ELEVATION) * distance, Math.cos(ELEVATION) * distance);
    camera.lookAt(0, centerY, 0); camera.updateProjectionMatrix();

    const target = this.#target(gpu, grid.width * grid.supersample, grid.height * grid.supersample);
    scene.add(model, stage);
    renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    scene.remove(model, stage);

    const output = renderer.domElement;
    if (output.width < grid.width || output.height < grid.height) renderer.setSize(Math.max(output.width, grid.width), Math.max(output.height, grid.height), false);
    const uniforms = gpu.resolve.material.uniforms;
    uniforms.sceneColor!.value = target.texture; (uniforms.artSize!.value as THREE.Vector2).set(grid.width, grid.height);
    uniforms.supersample!.value = grid.supersample; uniforms.quantize!.value = grid.pixel;
    renderer.setRenderTarget(null); renderer.setViewport(0, 0, grid.width, grid.height); renderer.clear(); renderer.render(gpu.resolveScene, gpu.resolveCamera);
    context.clearRect(0, 0, grid.width, grid.height);
    context.drawImage(output, 0, output.height - grid.height, grid.width, grid.height, 0, 0, grid.width, grid.height);
    if (hero) this.#sparks(view, grid, seconds - spin.celebrated);
  }
  /** The purchase burst: a flash over the part, a ring across the deck, then sparks thrown off it. */
  #sparks(view: View, grid: PartArtGrid, age: number): void {
    if (age < 0 || age > CELEBRATION) return;
    const { context } = view, unit = grid.pixel ? 1 : Math.max(2, Math.round(grid.height / 52));
    const snap = (value: number) => Math.round(value / unit) * unit, dot = (x: number, y: number, size: number) => context.fillRect(snap(x), snap(y), size * unit, size * unit);
    if (age < 0.22) {
      context.save(); context.globalCompositeOperation = 'source-atop';
      context.fillStyle = `rgba(253, 245, 213, ${(1 - age / 0.22) * 0.9})`; context.fillRect(0, 0, grid.width, grid.height); context.restore();
    }
    if (this.#reduced.matches) return;
    const cx = grid.width / 2, cy = grid.height * 0.5, deck = grid.height * 0.78;
    if (age < 0.5) {
      // A shockwave ring across the deck, dotted like the cutscenes' light rings.
      const radius = grid.height * 0.9 * (age / 0.5) ** 0.6;
      context.fillStyle = age < 0.3 ? '#fee192' : '#f1853a';
      for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; dot(cx + Math.cos(a) * radius * 1.6, deck + Math.sin(a) * radius * 0.35, 1); }
    }
    for (let i = 0; i < 40; i++) {
      if (hash(i + 7) * CELEBRATION < age) continue;
      const angle = -Math.PI * (0.06 + hash(i) * 0.88), speed = grid.height * (0.7 + hash(i + 31) * 1.1);
      const x = cx + Math.cos(angle) * speed * age * 1.5, y = cy + Math.sin(angle) * speed * age + grid.height * 1.3 * age * age;
      context.fillStyle = SPARKS[i % SPARKS.length]!;
      if (i % 3) dot(x, y, i % 4 ? 2 : 3);
      else for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) dot(x + dx * unit, y + dy * unit, 1);
    }
  }
}
