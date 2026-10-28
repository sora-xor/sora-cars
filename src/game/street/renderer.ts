import type { CompiledStreetTrack } from './track';
import type { StreetObject } from './objects';
import { streetPresentation, type StreetPresentation } from './presentation';
import { drawIllustratedShop, drawIllustratedTree } from '../illustrated-scenery';
import { getRaceWorld } from '../three/world';
import { PIXEL_OVERLAY_COLOURS, dashedCellLine, pixelOverlayGrid, rainColumn } from '../three/pixel-art/overlay';

/** Presentation-only view of the native street session. These floats never return to physics. */
export interface StreetRenderCar {
  progressMm: number;
  lateralMm: number;
  speedMmPerTick: number;
  bodyYawMicroturn: number;
  velocityYawMicroturn: number;
  status: number;
  rank: number;
  skin: number;
  energy?: number;
  boosting?: number;
  drifting?: number;
  wallContact?: number;
  carContact?: number;
  oil?: number;
  oilCrossed?: number;
  propHitMask?: number;
}
export interface StreetRenderState { tick: number; cars: readonly StreetRenderCar[]; worldBrokenMask?: number }
export interface StreetRenderOptions {
  playerSlot: number;
  names: readonly string[];
  controls: number;
  paused?: boolean;
  rain?: number;
  /** Frozen catalog order is the native broken-mask bit order. */
  objects?: readonly StreetObject[];
  camera?: 'chase' | 'bumper' | 'aerial';
  hud?: boolean;
  raceMode?: string;
  bottomInset?: number;
  /** Hide film titles behind menus/results; paused replay can keep them visible. */
  presentationTitles?: boolean;
  /** Minimum mobile title top in CSS pixels, measured by the owning UI. */
  presentationTopInset?: number;
}

type Vec = { x: number; y: number; z: number };
type RoadPose = Vec & { heading: number; width: number; sector: number };
type ScreenPoint = { x: number; y: number; scale: number };
type Trail = { tick: number; points: Vec[] };
type DrawItem = { depth: number; draw: () => void };
const TAU = Math.PI * 2;
const NO_OBJECTS: readonly StreetObject[] = Object.freeze([]);
const objectBroken = (mask: number, index: number) => Math.floor(mask / 2 ** index) % 2 === 1;
const NEAR = 400;
const CREAM = '#fff0cb';
const LIVERIES = ['#e8e0d3', '#ea4f52', '#669ccd', '#ad7ac9', '#e9be51', '#64bba3'];
const GATE_NAMES: Record<string, readonly [string, string]> = {
  'manaita-bridge': ['俎橋', 'MANAITA BRIDGE'], kudanshita: ['九段下', 'KUDANSHITA'],
  'shrine-front': ['靖国通り', 'YASUKUNI-DORI'], 'moat-west': ['千鳥ヶ淵', 'CHIDORIGAFUCHI'],
  hanzomon: ['半蔵門', 'HANZOMON'], 'diet-front': ['国会議事堂', 'NATIONAL DIET'],
  kasumigaseki: ['霞が関', 'KASUMIGASEKI'], sakuradamon: ['桜田門', 'SAKURADAMON'],
  'hibiya-turn': ['日比谷', 'HIBIYA'], wadakura: ['和田倉門', 'WADAKURA'],
  otemachi: ['大手町', 'OTEMACHI'], takebashi: ['竹橋', 'TAKEBASHI'],
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mod = (v: number, n: number) => ((v % n) + n) % n;
const angle = (v: number) => mod(v + Math.PI, TAU) - Math.PI;

interface Atmosphere {
  sky: readonly [string, string, string];
  ground: string;
  skyline: readonly [string, string];
  windows: string;
  road: readonly [string, string];
  reflection: string;
}
const ATMOSPHERES: readonly Atmosphere[] = [
  { sky: ['#181a35', '#403657', '#785d7a'], ground: '#3a354b', skyline: ['#39384e', '#494158'], windows: '#d4b595', road: ['#354054', '#303a4d'], reflection: '#657b94' },
  { sky: ['#302342', '#745073', '#b67a8e'], ground: '#493c53', skyline: ['#584362', '#694c6c'], windows: '#ffce9c', road: ['#494454', '#424050'], reflection: '#a081a0' },
  { sky: ['#282e50', '#686984', '#ada6b6'], ground: '#444854', skyline: ['#505369', '#62627a'], windows: '#c4d5db', road: ['#3d4c60', '#374658'], reflection: '#8fa9b9' },
  { sky: ['#49344f', '#a8687c', '#e9ac8b'], ground: '#635267', skyline: ['#76596b', '#866676'], windows: '#ffdaad', road: ['#544b59', '#4b4553'], reflection: '#bd939b' },
  { sky: ['#686788', '#bd959e', '#f4d4ad'], ground: '#756877', skyline: ['#867587', '#9a8390'], windows: '#f7e5bb', road: ['#5e5867', '#565363'], reflection: '#d5b8ae' },
];
function mixColor(from: string, to: string, amount: number): string {
  const channels = [1, 3, 5].map(start => {
    const a = Number.parseInt(from.slice(start, start + 2), 16), b = Number.parseInt(to.slice(start, start + 2), 16);
    return Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}
function atmosphere(presentation: StreetPresentation): Atmosphere {
  const current = ATMOSPHERES[presentation.index] ?? ATMOSPHERES[0]!;
  const previous = ATMOSPHERES[Math.max(0, presentation.index - 1)] ?? current;
  // Six seconds of integer-colour interpolation avoids a full-screen flash at
  // a chapter boundary while the sky itself uses continuous gradients.
  const amount = clamp(presentation.elapsedMs / 6000, 0, 1);
  const mix = (a: string, b: string) => mixColor(a, b, amount);
  return { sky: [mix(previous.sky[0], current.sky[0]), mix(previous.sky[1], current.sky[1]), mix(previous.sky[2], current.sky[2])],
    ground: mix(previous.ground, current.ground), skyline: [mix(previous.skyline[0], current.skyline[0]), mix(previous.skyline[1], current.skyline[1])],
    windows: mix(previous.windows, current.windows), road: [mix(previous.road[0], current.road[0]), mix(previous.road[1], current.road[1])],
    reflection: mix(previous.reflection, current.reflection) };
}

/** Interpolates the frozen Cartesian table for drawing only, without integrating curvature. */
function poseAt(track: CompiledStreetTrack, progress: number): RoadPose {
  const p = track.topology === 'circuit' ? mod(progress, track.lengthMm) : clamp(progress, 0, track.lengthMm);
  let lo = 0, hi = track.samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (track.samples[mid]!.progressMm <= p) lo = mid; else hi = mid;
  }
  const a = track.samples[lo]!, b = track.samples[hi]!;
  const t = (p - a.progressMm) / (b.progressMm - a.progressMm);
  return {
    x: a.eastMm + (b.eastMm - a.eastMm) * t,
    y: a.elevationMm + (b.elevationMm - a.elevationMm) * t,
    z: a.northMm + (b.northMm - a.northMm) * t,
    heading: (a.headingMicroturn + (b.headingMicroturn - a.headingMicroturn) * t) * TAU / 1e6,
    width: a.halfWidthMm + (b.halfWidthMm - a.halfWidthMm) * t,
    sector: a.sector,
  };
}
function offset(p: RoadPose, lateral: number, up = 0, forward = 0, heading = p.heading): Vec {
  return { x: p.x + Math.cos(heading) * lateral + Math.sin(heading) * forward,
    y: p.y + up, z: p.z - Math.sin(heading) * lateral + Math.cos(heading) * forward };
}

/** Cinematic rear-following renderer. Drawing units stay independent of device pixels. */
export class StreetRaceRenderer {
  readonly #canvas: HTMLCanvasElement;
  #ctx: CanvasRenderingContext2D;
  #carLayer: HTMLCanvasElement | null = null;
  #carLayerContext: CanvasRenderingContext2D | null = null;
  readonly #flag = new Image();
  readonly #reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  #width = 960;
  #height = 540;
  #focal = 500;
  #fogColor = '#9298aa';
  #wet = false;
  #horizon = 180;
  #camera: Vec = { x: 0, y: 0, z: 0 };
  #heading = 0;
  #headingSin = 0;
  #headingCos = 1;
  #pitchSin = 0;
  #pitchCos = 1;
  #grade = 0;
  #pitch = 0;
  #lastCamera: StreetRenderOptions['camera'];
  #speedEnvelope = 0;
  #boostEnvelope = 0;
  #lastTime: number | null = null;
  #lastTrack: CompiledStreetTrack | null = null;
  #lastTick = -1;
  #trails: Trail[] = [];
  #previousTyres: (Vec[] | undefined)[] = [];
  #mapPath: readonly Vec[] = [];
  #lastObjects: readonly StreetObject[] = NO_OBJECTS;
  #lastBrokenMask = 0;
  // Presentation timing of observed native mask transitions, never collision state.
  #objectBreakTicks = new Map<number, number>();

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Street driving requires a Canvas 2D context.');
    this.#canvas = canvas; this.#ctx = context;
    this.#flag.src = `${import.meta.env.BASE_URL}assets/sora-flag.png`;
    canvas.style.imageRendering = 'auto';
    this.resize();
  }

  resize(): void {
    const rect = this.#canvas.getBoundingClientRect();
    this.#width = Math.max(200, 540 * Math.max(1, rect.width) / Math.max(1, rect.height));
    // A bounded native-resolution surface keeps mobile fill cost predictable.
    // All projection, input and HUD dimensions remain in the original 540-unit space.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const requestedScale = Math.max(1, rect.height * dpr / this.#height);
    const scale = Math.min(requestedScale, Math.sqrt(1920 * 1080 / (this.#width * this.#height)));
    this.#canvas.width = Math.round(this.#width * scale);
    this.#canvas.height = Math.round(this.#height * scale);
    this.#ctx.imageSmoothingEnabled = true;
    this.#ctx.imageSmoothingQuality = 'high';
  }

  draw(track: CompiledStreetTrack, state: StreetRenderState, options: StreetRenderOptions, time: number): void {
    const ctx = this.#ctx, w = this.#width, h = this.#height, player = state.cars[options.playerSlot];
    // The arcade and street views share this canvas and can reset its state on resize.
    ctx.setTransform(this.#canvas.width / w, 0, 0, this.#canvas.height / h, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 1;
    if (!player || track.samples.length < 2) { ctx.fillStyle = '#211b32'; ctx.fillRect(0, 0, w, h); return; }
    const camera = options.camera ?? 'chase';
    const chapter = streetPresentation(track, state.tick), sceneTime = Math.max(0, state.tick) / 30;
    const tokyo = track.id === 'tokyo-1986' && chapter.english !== 'ON THE ROAD';
    const palette = tokyo ? atmosphere(chapter) : null;
    this.#fogColor = palette ? mixColor(palette.sky[2], palette.skyline[1], 0.38) : '#8f7c98';
    this.#wet = (options.rain ?? 0) > 0;
    const chapterTitle = tokyo && options.presentationTitles !== false && chapter.transition > 0;
    const reset = track !== this.#lastTrack || state.tick < this.#lastTick || camera !== this.#lastCamera;
    if (reset) {
      this.#trails = []; this.#previousTyres = []; this.#lastTime = null;
      const stride = Math.max(1, Math.floor(track.samples.length / 220));
      this.#mapPath = track.samples.filter((_, i) => i % stride === 0 || i === track.samples.length - 1)
        .map(s => ({ x: s.eastMm, y: s.elevationMm, z: s.northMm }));
    }
    const objects = options.objects ?? NO_OBJECTS, brokenMask = state.worldBrokenMask ?? 0;
    if (reset || objects !== this.#lastObjects) {
      this.#objectBreakTicks.clear();
    } else if (state.tick > this.#lastTick) {
      objects.forEach((object, index) => {
        if (object.kind !== 'oil' && objectBroken(brokenMask, index) && !objectBroken(this.#lastBrokenMask, index)) {
          this.#objectBreakTicks.set(index, state.tick);
        }
      });
    }
    for (const [index, tick] of this.#objectBreakTicks) {
      if (state.tick - tick > 27 || !objectBroken(brokenMask, index)) this.#objectBreakTicks.delete(index);
    }
    this.#lastObjects = objects; this.#lastBrokenMask = brokenMask;
    const still = options.paused || player.status !== 0;
    const reduced = this.#reducedMotion.matches;
    const dt = this.#lastTime === null ? 1 : clamp(time - this.#lastTime, 0, 0.1);
    this.#lastTime = time;
    const kmh = Math.max(0, player.speedMmPerTick * 0.108);
    const speed = reduced ? 0 : clamp(kmh / 280, 0, 1);
    const boost = !still && !reduced && player.boosting === 1 ? 1 : 0;
    this.#speedEnvelope += (speed - this.#speedEnvelope) * (1 - Math.exp(-dt * 7));
    this.#boostEnvelope += (boost - this.#boostEnvelope) * (1 - Math.exp(-dt * 10));
    // A paused/seeked frame must not keep changing its sky framing as a wall-
    // clock envelope settles. This affects only the view, never native speed.
    if (reset || still) { this.#speedEnvelope = speed; this.#boostEnvelope = boost; }
    if (reduced) { this.#speedEnvelope = 0; this.#boostEnvelope = 0; }
    const velocity = this.#speedEnvelope, surge = this.#boostEnvelope;
    this.#focal = Math.max(w * 0.61, 370) * (1 - velocity * 0.13 - surge * 0.075);
    this.#horizon = h * (0.34 - velocity * 0.025 - surge * 0.018);
    const centre = poseAt(track, player.progressMm);
    const ahead = poseAt(track, player.progressMm + 18000);
    this.#heading = centre.heading;
    // The camera follows the table's tangent and elevation, including sprint endpoints.
    // A world-space offset behind the car avoids a degenerate camera on a clamped start row.
    const cameraDistance = w < 400 ? 9000 : 8000;
    const base = offset(centre, player.lateralMm * 0.65, 0, -cameraDistance);
    // Frame the rear bumper, not the centre of a four-metre car; this also
    // reserves the bottom mobile strip for the speed and energy indicators.
    const cameraHeight = (h * (w < 400 ? 0.76 : 0.89) - this.#horizon) * (cameraDistance - 2000) / this.#focal + 280;
    this.#camera = { ...base, y: base.y + cameraHeight };
    this.#grade = clamp((ahead.y - centre.y) / 18000, -0.25, 0.25);
    this.#pitch = 0;
    if (camera === 'bumper') {
      this.#camera = offset(centre, player.lateralMm, 850, 1800);
      this.#heading = centre.heading + player.bodyYawMicroturn * TAU / 1e6;
      this.#horizon = h * 0.42;
    } else if (camera === 'aerial') {
      this.#camera = offset(centre, player.lateralMm * 0.35, 42000, -28000);
      this.#pitch = -Math.atan2(42000, 28000);
      this.#grade = 0; this.#focal = Math.max(w * 0.8, 440); this.#horizon = h * 0.45;
    }
    this.#headingSin = Math.sin(this.#heading); this.#headingCos = Math.cos(this.#heading);
    this.#pitchSin = Math.sin(this.#pitch); this.#pitchCos = Math.cos(this.#pitch);
    const shake = !reduced && !still ? Math.sin(time * 41) * velocity * 0.3 + Math.sin(time * 67) * surge * 0.45 : 0;
    this.#horizon += shake;
    const world = getRaceWorld(this.#canvas);
    if (world) {
      ctx.drawImage(world.renderStreet(track, state, options, time), 0, 0, w, h);
      if (camera !== 'aerial' && !reduced && !still && velocity > 0.5) this.#speedLines(player.progressMm, velocity, surge);
      if ((options.rain ?? 0) > 0) this.#rain(sceneTime, reduced);
      if (chapterTitle) this.#chapterTitle(chapter, reduced, options.hud !== false, options.presentationTopInset ?? 0);
      if (options.hud !== false) this.#hud(track, state, options, player, centre, kmh, chapterTitle);
      this.#lastTrack = track; this.#lastTick = state.tick; this.#lastCamera = camera;
      return;
    }
    if (camera === 'aerial') { ctx.fillStyle = palette?.ground ?? '#3b3444'; ctx.fillRect(0, 0, w, h); }
    else this.#sky(centre, sceneTime, reduced, chapter, palette);
    const queue: DrawItem[] = [], roadQueue: DrawItem[] = [];
    const submit = (position: Vec, draw: () => void) => {
      const depth = this.#view(position).z;
      if (depth > NEAR && depth < 390000) queue.push({ depth, draw });
    };
    const roadStart = Math.floor((player.progressMm - (camera === 'aerial' ? 120000 : 10000)) / 5000) * 5000;
    const roadEnd = Math.min(player.progressMm + 350000, track.topology === 'sprint' ? track.lengthMm : Infinity);
    for (let p = roadStart; p < roadEnd; p += 5000) {
      if (track.topology === 'sprint' && p < 0) continue;
      const a = poseAt(track, p), b = poseAt(track, Math.min(p + 5000, roadEnd)), cell = Math.floor(p / 5000);
      const wet = (options.rain ?? 0) > 0;
      const roadDepth = this.#view({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }).z;
      if (roadDepth > -5000) roadQueue.push({ depth: roadDepth, draw: () => {
        const strip = (l: number, r: number, color: string, seal = false) => this.#poly([
          offset(a, a.width * l), offset(a, a.width * r), offset(b, b.width * r), offset(b, b.width * l),
        ], color, seal ? 0.6 : 0);
        const asphalt = wet ? palette?.road[0] ?? '#394656' : palette ? mixColor(palette.road[0], '#514a52', 0.3) : '#464550';
        // Seal subpixel raster coverage where consecutive ground polygons
        // meet. Their projected positions and native road geometry stay exact.
        strip(-1.55, 1.55, palette?.ground ?? '#655b67', true);
        strip(-1.1, 1.1, '#9a9290', true);
        strip(-1.035, 1.035, '#59545d', true);
        strip(-1, 1, asphalt, true);
        // Thin curb joints, fine lane paint and settled asphalt replace the
        // alternating full-width bars that made the street read as pixel art.
        for (const side of [-1, 1]) {
          strip(side * 0.925 - 0.008, side * 0.925 + 0.008, '#d7ccc0');
          this.#poly([offset(a, side * a.width * 1.04, 2), offset(a, side * a.width * 1.1, 2),
            offset(a, side * a.width * 1.1, 2, 75), offset(a, side * a.width * 1.04, 2, 75)], '#77717a');
        }
        strip(-0.017, -0.008, '#d9bb7d'); strip(0.008, 0.017, '#d9bb7d');
        if (cell % 2 === 0) for (const side of [-1, 1]) strip(side * 0.48 - 0.006, side * 0.48 + 0.006, '#b3adb3');
        const lane = (mod(cell * 17, 19) / 19 - 0.5) * 1.65;
        const surface = poseAt(track, p + 2400);
        if (wet) {
          const reflection = palette?.reflection ?? '#8492a5';
          // World-anchored, tapering puddles and lamp streaks follow the road
          // perspective; their geometry is identical in a paused frame.
          const puddle = [[-480, -1800], [-110, -2170], [390, -1530], [610, 260], [220, 1850], [-370, 1110]];
          ctx.globalAlpha = 0.12 + mod(cell, 3) * 0.025;
          this.#poly(puddle.map(([x, z]) => offset(surface, surface.width * lane + x!, 5, z!)), reflection);
          ctx.globalAlpha = 1;
          for (const side of [-1, 1]) {
            const edge = surface.width * side * 0.8, length = 1500 + mod(cell * 137, 1800);
            ctx.globalAlpha = 0.055;
            this.#poly([offset(surface, edge - 80, 7, -length), offset(surface, edge + 100, 7, -length),
              offset(surface, edge + 240, 7, length), offset(surface, edge - 240, 7, length)], '#ffcf9a');
            ctx.globalAlpha = 1;
          }
        } else if (mod(cell, 4) === 0) {
          ctx.globalAlpha = 0.18;
          this.#poly([offset(surface, surface.width * lane, 3, -1100), offset(surface, surface.width * lane + 12, 3, -1050),
            offset(surface, surface.width * lane + 240, 3, 500), offset(surface, surface.width * lane + 228, 3, 470)], '#b2a9ac');
          ctx.globalAlpha = 1;
        }
      } });
      for (const side of [-1, 1]) {
        const post = offset(a, side * (a.width + 300));
        submit(post, () => this.#post(post, a.heading, cell % 2 === 0));
        if (cell % 5 === 0) {
          const kind = mod(cell + side * 7 + a.sector, 7);
          const clearance = kind === 0 || kind === 2 || kind === 3 ? 2400 : 4900;
          const prop = offset(a, side * (a.width + clearance));
          submit(prop, () => this.#streetObject(prop, cell + side * 7, a.sector, sceneTime, reduced, side));
        }
      }
      if (mod(cell, 50) === 0 && p >= 0) {
        const at = poseAt(track, p + 1000);
        submit(at, () => this.#roadText(at, `${(mod(p, track.lengthMm) / 1e6).toFixed(2)} km`));
      }
    }
    const oilSurfaces: (() => void)[] = [];
    objects.forEach((object, index) => {
      const gap = track.topology === 'circuit'
        ? mod(object.progressMm - player.progressMm + track.lengthMm / 2, track.lengthMm) - track.lengthMm / 2
        : object.progressMm - player.progressMm;
      if (gap < -12000 - object.halfLengthMm || gap > 350000 + object.halfLengthMm) return;
      const road = poseAt(track, object.progressMm), at = { ...road, ...offset(road, object.lateralMm) };
      if (object.kind === 'oil') oilSurfaces.push(() => this.#oilSurface(at, object));
      else submit(at, () => {
        this.#catalogProp(at, object, objectBroken(brokenMask, index));
        const tick = this.#objectBreakTicks.get(index);
        if (tick !== undefined && !reduced) this.#propDebris(at, object, index, state.tick - tick);
      });
    });
    for (const gate of track.gates) {
      const sample = track.samples[gate.sample]; if (!sample) continue;
      const aheadMm = track.topology === 'circuit' ? mod(sample.progressMm - player.progressMm, track.lengthMm) : sample.progressMm - player.progressMm;
      if (aheadMm < -7000 || aheadMm > 340000) continue;
      const at = poseAt(track, player.progressMm + aheadMm), title = GATE_NAMES[gate.id] ?? [gate.id.replaceAll('-', ' '), 'CHECKPOINT'];
      submit(at, () => this.#gate(at, title[0], title[1]));
    }
    if (state.tick !== this.#lastTick && !options.paused) this.#recordTrails(track, state);
    this.#trails = this.#trails.filter(t => state.tick - t.tick < 100);
    const labels: { x: number; y: number; name: string; size: number }[] = [];
    state.cars.forEach((car, slot) => {
      // Native finish poses stop at the line and can overlap. Retire finished
      // opponents from the road presentation; their actual positions remain
      // on the minimap and the HUD reports the finish count. Always retain the
      // followed car, including when spectating a racer who already finished.
      if (car.status === 1 && slot !== options.playerSlot) return;
      const at = poseAt(track, car.progressMm), location = offset(at, car.lateralMm);
      const p = this.#project(location);
      if (!p || p.x < -160 || p.x > w + 160 || p.y < -100 || p.y > h + 200) return;
      const difference = car.progressMm - player.progressMm;
      const gap = track.topology === 'circuit' ? mod(difference + track.lengthMm / 2, track.lengthMm) - track.lengthMm / 2 : difference;
      // Cars behind the followed bumper can sit between a chase camera and its
      // subject. Fade those bodies out of the camera corridor instead of
      // letting their enormous near-plane roofs hide the player's steering.
      // Cars alongside/ahead remain opaque and every car stays on the minimap.
      const opacity = camera === 'bumper' && slot === options.playerSlot ? 0
        : camera === 'aerial' || slot === options.playerSlot || gap >= -700 ? 1 : clamp((gap + 2900) / 2200, 0, 1);
      if (opacity > 0) submit(location, () => {
        const drawCar = () => this.#car(at, car, slot === options.playerSlot, options.controls, reduced || options.paused ? 0 : time, !!options.paused);
        if (opacity < 1) this.#fadedCar(opacity, drawCar); else drawCar();
      });
      if (opacity > 0.8 && slot !== options.playerSlot && car.status !== 2 && p.scale * 1950 > 17) labels.push({
        x: p.x, y: p.y - p.scale * 1800 - 8,
        name: p.scale * 1950 > 45 ? options.names[slot] ?? `SORA ${slot + 1}` : String(slot + 1).padStart(2, '0'), size: p.scale * 1950,
      });
    });
    // Roads are a continuous ground layer; a segment centre must never occlude
    // the rear half of a car whose body spans that segment's near edge.
    roadQueue.sort((a, b) => b.depth - a.depth);
    for (const item of roadQueue) item.draw();
    for (const drawOil of oilSurfaces) drawOil();
    for (const trail of this.#trails) {
      ctx.globalAlpha = clamp(1 - (state.tick - trail.tick) / 100, 0, 0.7);
      this.#poly(trail.points, '#171b28'); ctx.globalAlpha = 1;
    }
    queue.sort((a, b) => b.depth - a.depth);
    for (const item of queue) item.draw();
    const vignette = ctx.createRadialGradient(w * 0.5, h * 0.46, h * 0.24, w * 0.5, h * 0.48, Math.max(w * 0.65, h * 0.8));
    vignette.addColorStop(0, 'rgba(16, 20, 35, 0)'); vignette.addColorStop(1, 'rgba(12, 15, 29, 0.28)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.font = 'bold 9px SoraJP, LabJP, sans-serif';
    const placed: { x: number; y: number }[] = [];
    for (const label of labels.sort((a, b) => b.size - a.size)) {
      const x = clamp(label.x, 45, w - 45);
      const y = label.y;
      if (placed.some(p => Math.abs(p.x - x) < 64 && Math.abs(p.y - y) < 13)) continue;
      placed.push({ x, y });
      ctx.lineWidth = 3; ctx.strokeStyle = '#292438'; ctx.strokeText(label.name, x, y, 105);
      ctx.fillStyle = CREAM; ctx.fillText(label.name, x, y, 105);
    }
    if (camera !== 'aerial' && !reduced && !still && velocity > 0.5) this.#speedLines(player.progressMm, velocity, surge);
    if ((options.rain ?? 0) > 0) this.#rain(sceneTime, reduced);
    if (chapterTitle) this.#chapterTitle(chapter, reduced, options.hud !== false, options.presentationTopInset ?? 0);
    if (options.hud !== false) this.#hud(track, state, options, player, centre, kmh, chapterTitle);

    this.#lastTrack = track; this.#lastTick = state.tick; this.#lastCamera = camera;
  }

  #view(p: Vec): Vec {
    const dx = p.x - this.#camera.x, dz = p.z - this.#camera.z;
    const z = dx * this.#headingSin + dz * this.#headingCos;
    const y = p.y - this.#camera.y - z * this.#grade;
    return { x: dx * this.#headingCos - dz * this.#headingSin,
      y: y * this.#pitchCos - z * this.#pitchSin,
      z: y * this.#pitchSin + z * this.#pitchCos };
  }
  #project(p: Vec): ScreenPoint | null {
    const v = this.#view(p); if (v.z < NEAR) return null;
    const scale = this.#focal / v.z;
    return { x: this.#width / 2 + v.x * scale, y: this.#horizon - v.y * scale, scale };
  }
  #poly(points: readonly Vec[], color: string | CanvasGradient, seamOverlap = 0): void {
    const vertices = points.map(p => this.#view(p)), clipped: Vec[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
      if (a.z >= NEAR) clipped.push(a);
      if ((a.z < NEAR) !== (b.z < NEAR)) {
        const t = (NEAR - a.z) / (b.z - a.z);
        clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR });
      }
    }
    if (clipped.length < 3) return;
    const ctx = this.#ctx; ctx.beginPath();
    clipped.forEach((p, i) => {
      const x = this.#width / 2 + p.x * this.#focal / p.z, y = this.#horizon - p.y * this.#focal / p.z;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    const depth = vertices.reduce((sum, vertex) => sum + vertex.z, 0) / vertices.length;
    const haze = clamp((depth - 25000) / 325000, 0, 0.84);
    ctx.fillStyle = typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
      ? mixColor(color, this.#fogColor, haze * haze) : color;
    ctx.fill();
    if (seamOverlap > 0) {
      ctx.save(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = seamOverlap; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
    }
  }

  #sky(centre: RoadPose, time: number, reduced: boolean, chapter: StreetPresentation, palette: Atmosphere | null): void {
    const ctx = this.#ctx, w = this.#width, h = this.#height, edge = this.#horizon + 25;
    const colors = palette?.sky ?? ['#293650', '#8c819c', '#e5b8aa'];
    const sky = ctx.createLinearGradient(0, 0, 0, edge);
    sky.addColorStop(0, colors[0]); sky.addColorStop(0.57, colors[1]); sky.addColorStop(1, colors[2]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    const dawn = palette ? chapter.dawn : 0.5;
    const sunX = w * 0.73 + Math.sin(centre.heading) * 20;
    const sunY = this.#horizon + 20 - (20 + dawn * 100), sunRadius = 12 + dawn * 10;
    const glow = ctx.createRadialGradient(sunX, sunY, 1, sunX, sunY, 160 + dawn * 70);
    glow.addColorStop(0, `rgba(255, 222, 186, ${0.12 + dawn * 0.16})`);
    glow.addColorStop(0.32, 'rgba(245, 177, 151, 0.08)'); glow.addColorStop(1, 'rgba(239, 176, 159, 0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, edge);
    ctx.fillStyle = `rgba(255, 235, 201, ${0.36 + dawn * 0.35})`;
    ctx.beginPath(); ctx.arc(sunX, sunY, sunRadius, 0, TAU); ctx.fill();
    // Long translucent cloud veils carry the same soft lighting as the film.
    const drift = reduced ? 0 : time * 0.24;
    for (let band = 0; band < 5; band++) {
      const cloudWidth = 170 + band * 37, y = edge * (0.19 + band * 0.115);
      const x = mod(band * 241 + drift * (band % 2 ? -1 : 1), w + cloudWidth * 2) - cloudWidth;
      const veil = ctx.createRadialGradient(x, y, 1, x, y, cloudWidth);
      veil.addColorStop(0, band % 2 ? 'rgba(255, 223, 208, 0.10)' : 'rgba(55, 58, 87, 0.11)');
      veil.addColorStop(1, 'rgba(111, 100, 125, 0)');
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.09); ctx.translate(-x, -y);
      ctx.fillStyle = veil; ctx.beginPath(); ctx.arc(x, y, cloudWidth, 0, TAU); ctx.fill(); ctx.restore();
    }
    if (!palette) {
      // Smooth, layered mountain silhouettes replace a magnified raster backdrop.
      for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = ['#9690a4', '#787c94', '#62667f'][layer]!;
        ctx.beginPath(); ctx.moveTo(-60, edge);
        for (let i = -1; i <= 13; i++) {
          const x = i * w / 11 - Math.sin(centre.heading) * (20 + layer * 9);
          const y = this.#horizon - 20 - (Math.sin(i * 1.27 + layer * 2.1) * 0.5 + 0.5) * (65 - layer * 17) + layer * 16;
          ctx.quadraticCurveTo(x - w / 26, y - 10, x, y);
        }
        ctx.lineTo(w + 80, edge + 60); ctx.lineTo(-80, edge + 60); ctx.closePath(); ctx.fill();
      }
    }
    ctx.fillStyle = palette?.ground ?? '#655c6d'; ctx.fillRect(0, edge - 3, w, h);
    // Overlapping silhouettes, roof equipment and fine windows give the distant
    // city a coherent scale without turning the horizon into a wall of sprites.
    for (let layer = 0; layer < 2; layer++) {
      const spacing = layer ? 45 : 34, baseline = edge + layer * 5;
      const base = palette?.skyline[layer] ?? (layer ? '#696278' : '#858099');
      for (let i = -3; i < Math.ceil(w / spacing) + 3; i++) {
        const seed = mod(i * i * 17 + i * 13 + layer * 29, 71);
        const x = i * spacing - mod(centre.heading * (20 + layer * 8), spacing);
        const height = 12 + seed * (layer ? 0.43 : 0.7), width = spacing - 3 - seed % 9;
        const roof = baseline - height;
        ctx.fillStyle = mixColor(base, colors[2], layer ? 0.10 : 0.28); ctx.fillRect(x, roof, width, height);
        ctx.fillStyle = mixColor(base, '#272d47', 0.1); ctx.fillRect(x + width - 4, roof + 2, 4, height - 2);
        if (seed % 3 === 0) ctx.fillRect(x + width * 0.25, roof - 3, width * 0.35, 3);
        if (seed % 7 === 0) { ctx.fillRect(x + width * 0.6, roof - 11, 0.8, 11); }
        ctx.fillStyle = palette?.windows ?? '#dcc4b4';
        ctx.globalAlpha = layer ? 0.6 : 0.28;
        for (let y = 6; y < height - 3; y += 6.5) for (let col = 4; col < width - 5; col += 6) {
          if (mod(i * 3 + Math.floor(y) + col, 5) > 1) ctx.fillRect(x + col, roof + y, 1.7, 2.5);
        }
        ctx.globalAlpha = 1;
      }
    }
    const haze = ctx.createLinearGradient(0, edge - 33, 0, edge + 27);
    haze.addColorStop(0, 'rgba(199, 170, 177, 0)'); haze.addColorStop(0.55, 'rgba(199, 170, 177, 0.15)'); haze.addColorStop(1, 'rgba(199, 170, 177, 0)');
    ctx.fillStyle = haze; ctx.fillRect(0, edge - 33, w, 60);
  }

  #chapterTitle(chapter: StreetPresentation, reduced: boolean, hud: boolean, inset: number): void {
    const ctx = this.#ctx, w = this.#width, mobile = w < 430;
    const pad = mobile ? 12 : 26;
    const width = mobile && hud ? Math.floor(w * 0.55) - pad : Math.min(280, w - pad * 2);
    const defaultTop = hud ? mobile ? 82 : 78 : 28;
    const top = mobile && Number.isFinite(inset) ? Math.max(defaultTop,
      Math.ceil(Math.max(0, inset) * this.#width / Math.max(1, this.#canvas.clientWidth))) : defaultTop;
    ctx.save();
    // Reduced motion keeps a static title for the same bounded entry interval.
    // Otherwise only its final second fades; there is no travelling typography.
    ctx.globalAlpha = reduced ? 1 : chapter.transition;
    ctx.fillStyle = '#19182c'; ctx.fillRect(pad - 6, top - 5, width + 12, mobile ? 57 : 65);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#e5b68f'; ctx.font = 'bold 8px Sora, LabSora, sans-serif';
    ctx.fillText(`SORA RADIO / 0${chapter.index + 1}`, pad, top + 8, width);
    ctx.fillStyle = CREAM; ctx.font = `bold ${mobile ? 16 : 25}px SoraJP, LabJP, sans-serif`;
    ctx.fillText(chapter.japanese, pad, top + (mobile ? 29 : 36), width);
    ctx.font = `bold ${mobile ? 8 : 10}px Sora, LabSora, sans-serif`;
    ctx.fillStyle = '#d7c4d4'; ctx.fillText(chapter.english, pad, top + (mobile ? 44 : 53), width);
    ctx.fillStyle = '#c77a83'; ctx.fillRect(pad, top + (mobile ? 50 : 59), Math.min(26, width), 2);
    ctx.restore();
  }

  #post(p: Vec, heading: number, bright: boolean): void {
    const pose = { ...p, heading, width: 0, sector: 0 };
    this.#poly([offset(pose, -50), offset(pose, 50), offset(pose, 50, 750), offset(pose, -50, 750)], '#272c3b');
    this.#poly([offset(pose, -70, 640), offset(pose, 70, 640), offset(pose, 70, 800), offset(pose, -70, 800)], bright ? '#ffe7ad' : '#ec6662');
  }

  #oilSurface(at: RoadPose, object: StreetObject): void {
    const width = object.halfWidthMm, length = object.halfLengthMm;
    const patch = (factor: number, height: number, color: string) => this.#poly([
      [-0.72, -1], [0.56, -1], [1, -0.62], [0.89, 0.44], [0.55, 1],
      [-0.58, 0.89], [-1, 0.37], [-0.93, -0.49],
    ].map(([x, z]) => offset(at, x! * width * factor, height, z! * length * factor)), color);
    patch(1, 12, '#202035'); patch(0.78, 14, '#313347'); patch(0.46, 16, '#282838');
    // Pixel-thin iridescence distinguishes a bounded oil slick from wet asphalt.
    for (const [side, color] of [[-1, '#5d5878'], [1, '#427779']] as const) {
      this.#poly([offset(at, side * width * 0.37, 18, -length * 0.6),
        offset(at, side * width * 0.53, 18, -length * 0.51), offset(at, side * width * 0.45, 18, length * 0.48),
        offset(at, side * width * 0.36, 18, length * 0.36)], color);
    }
  }

  #flagFace(topLeft: Vec, topRight: Vec, bottomLeft: Vec): void {
    if (!this.#flag.complete || !this.#flag.naturalWidth) return;
    const a = this.#project(topLeft), b = this.#project(topRight), c = this.#project(bottomLeft);
    if (!a || !b || !c || Math.abs(b.x - a.x) < 2) return;
    const ctx = this.#ctx; ctx.save();
    ctx.transform((b.x - a.x) / 60, (b.y - a.y) / 60, (c.x - a.x) / 36, (c.y - a.y) / 36, a.x, a.y);
    ctx.drawImage(this.#flag, 0, 0, 60, 36); ctx.restore();
  }

  #catalogProp(at: RoadPose, object: StreetObject, broken: boolean): void {
    const x = object.halfWidthMm, z = object.halfLengthMm;
    const p = (lateral: number, height: number, forward: number) => offset(at, lateral, height, forward);
    if (broken) {
      if (object.kind === 'tree_planter') {
        // A knocked-down, portable sapling: low leaves, trunk and terracotta
        // fragments replace its upright silhouette only after the native bit.
        this.#poly([p(-x, 24, -z), p(-x * 0.4, 70, -z * 0.6), p(-x * 0.6, 24, 0)], '#a85d52');
        this.#poly([p(x * 0.5, 24, z * 0.3), p(x, 80, 0), p(x * 0.85, 24, z)], '#ce8b68');
        this.#poly([p(-70, 45, -z), p(100, 45, -z), p(x * 0.35, 85, z), p(x * 0.15, 85, z)], '#a28666');
        this.#poly([p(-x * 0.7, 110, 0), p(x * 0.65, 125, -z * 0.1), p(x, 130, z * 0.6),
          p(x * 0.2, 100, z), p(-x * 0.8, 90, z * 0.7)], '#527861');
      } else {
        this.#poly([p(-x, 30, -z), p(x, 30, -z), p(x, 30, z), p(-x, 30, z)], '#b53b4a');
        this.#poly([p(-x * 0.8, 32, -z * 0.55), p(x * 0.8, 32, -z * 0.55),
          p(x * 0.8, 32, -z * 0.43), p(-x * 0.8, 32, -z * 0.43)], CREAM);
        this.#flagFace(p(-x * 0.45, 35, z * 0.55), p(x * 0.45, 35, z * 0.55), p(-x * 0.45, 35, -z * 0.35));
      }
      return;
    }
    if (object.kind === 'tree_planter') {
      // These catalog trees are small potted saplings, visibly unlike the
      // decorative mature trees beyond the pavement. Their pot is the footprint.
      this.#poly([p(-x, 520, -z), p(-x, 520, z), p(-x * 0.7, 30, z * 0.7), p(-x * 0.7, 30, -z * 0.7)], '#86514c');
      this.#poly([p(x, 520, -z), p(x, 520, z), p(x * 0.7, 30, z * 0.7), p(x * 0.7, 30, -z * 0.7)], '#9f6657');
      this.#poly([p(-x * 0.7, 30, -z * 0.7), p(x * 0.7, 30, -z * 0.7), p(x, 520, -z), p(-x, 520, -z)], '#be785e');
      this.#poly([p(-x, 520, -z), p(x, 520, -z), p(x, 520, z), p(-x, 520, z)], '#55463f');
      this.#flagFace(p(-x * 0.42, 420, -z - 10), p(x * 0.42, 420, -z - 10), p(-x * 0.42, 100, -z - 10));
      this.#poly([p(-55, 500, 0), p(55, 500, 0), p(65, 1920, 0), p(-35, 1920, 0)], '#a48a63');
      const crown = Math.max(x * 1.2, 400);
      this.#poly([p(-crown, 1390, 0), p(-crown, 1870, 0), p(-crown * 0.35, 1870, 0),
        p(-crown * 0.35, 2370, 0), p(crown * 0.48, 2370, 0), p(crown * 0.48, 2060, 0),
        p(crown, 2060, 0), p(crown, 1500, 0), p(crown * 0.1, 1500, 0), p(crown * 0.1, 1390, 0)], '#5c8a65');
      this.#poly([p(-crown * 0.25, 2140, -20), p(crown * 0.36, 2140, -20),
        p(crown * 0.36, 2300, -20), p(-crown * 0.25, 2300, -20)], '#99ad70');
    } else {
      for (const side of [-1, 1]) {
        // Narrow hinged feet make the breakaway construction visible.
        this.#poly([p(side * x - 60, 20, -z), p(side * x + 60, 20, -z),
          p(side * x + 60, 800, 0), p(side * x - 60, 800, 0)], '#c0b39b');
        this.#poly([p(side * x - 60, 20, z), p(side * x + 60, 20, z),
          p(side * x + 60, 800, 0), p(side * x - 60, 800, 0)], '#827c78');
      }
      this.#poly([p(-x, 660, 0), p(x, 660, 0), p(x, 1750, 0), p(-x, 1750, 0)], '#cc3c48');
      this.#flagFace(p(-x * 0.9, 1540, -12), p(-x * 0.12, 1540, -12), p(-x * 0.9, 1050, -12));
      const a = this.#project(p(x * 0.05, 1280, -15)), b = this.#project(p(x * 0.92, 1280, -15));
      if (a && b && b.x - a.x > 9) {
        const ctx = this.#ctx; ctx.fillStyle = CREAM; ctx.textAlign = 'left';
        ctx.font = `bold ${clamp(Math.round((b.x - a.x) / 3.2), 5, 24)}px Sora, LabSora, sans-serif`;
        ctx.fillText('SORA', a.x, a.y, b.x - a.x);
      }
      this.#poly([p(-x, 720, -15), p(x, 720, -15), p(x, 820, -15), p(-x, 820, -15)], CREAM);
    }
  }

  #propDebris(at: RoadPose, object: StreetObject, index: number, age: number): void {
    if (age < 0 || age > 27) return;
    const ctx = this.#ctx, t = age / 27;
    ctx.globalAlpha = 1 - t;
    for (let i = 0; i < 7; i++) {
      const direction = (index * 1.73 + i * 2.39), radius = 150 + t * (500 + i * 110);
      const centre = offset(at, Math.cos(direction) * radius, 100 + Math.sin(Math.PI * t) * (600 + i * 90), Math.sin(direction) * radius);
      const p = { ...at, ...centre };
      this.#poly([offset(p, -60, -40), offset(p, 75, -30), offset(p, 30, 90)],
        object.kind === 'tree_planter' ? i % 2 ? '#b98165' : '#86a474' : i % 2 ? '#e86661' : CREAM);
    }
    ctx.globalAlpha = 1;
  }

  #streetObject(p: Vec, seed: number, sector: number, time: number, reduced: boolean, side: number): void {
    const screen = this.#project(p); if (!screen || screen.scale < 0.0016) return;
    const ctx = this.#ctx, s = screen.scale * 100, kind = mod(seed + sector, 7);
    ctx.save(); ctx.translate(screen.x, screen.y); ctx.scale(s, s);
    if (kind === 0 || kind === 3) {
      drawIllustratedTree(ctx, 0, 0, kind === 0 ? 70 : 78, kind === 3 && sector % 3 === 1, seed, time, reduced ? 0 : 24);
    } else if (kind === 2) {
      // Parked period commuter bike and its pavement owner; decorative, not a collision assertion.
      ctx.strokeStyle = '#202a37'; ctx.lineWidth = 1.6;
      for (const x of [-10, 13]) {
        ctx.beginPath(); ctx.arc(x, -6, 6, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#acb3ad'; ctx.lineWidth = 0.5;
        for (let spoke = 0; spoke < 6; spoke++) {
          ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x + Math.cos(spoke * TAU / 6) * 5, -6 + Math.sin(spoke * TAU / 6) * 5); ctx.stroke();
        }
        ctx.strokeStyle = '#202a37'; ctx.lineWidth = 1.6;
      }
      ctx.strokeStyle = '#ac8a78'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.beginPath();
      ctx.moveTo(-10, -6); ctx.lineTo(-3, -16); ctx.lineTo(3, -6); ctx.lineTo(-10, -6);
      ctx.moveTo(-3, -16); ctx.lineTo(9, -17); ctx.lineTo(3, -6); ctx.moveTo(9, -20); ctx.lineTo(13, -6); ctx.stroke();
      ctx.strokeStyle = '#2a3542'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-6, -18); ctx.lineTo(0, -18); ctx.moveTo(9, -20); ctx.quadraticCurveTo(6, -22, 12, -22); ctx.stroke();
      this.#person(-23, -1, seed, time, reduced);
    } else {
      const height = kind === 5 ? 88 : 72;
      drawIllustratedShop(ctx, 0, 0, height, seed, this.#flag.complete && this.#flag.naturalWidth ? this.#flag : null);
      this.#person(side * height * 0.44, 2, seed, time, reduced);
    }
    ctx.restore();
  }

  #person(x: number, y: number, seed: number, time: number, reduced: boolean): void {
    const ctx = this.#ctx, arm = reduced ? 0 : Math.sin(time * 2 + seed) * 1.3;
    ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round';
    ctx.fillStyle = '#222a3a'; ctx.beginPath(); ctx.ellipse(0, -18.3, 3, 3.5, -0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d8ae91'; ctx.beginPath(); ctx.ellipse(0.6, -17.4, 2.4, 2.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#242c3a'; ctx.beginPath(); ctx.ellipse(-0.5, -19.2, 2.6, 1.9, -0.25, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#d8ae91'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-3.1, -12); ctx.lineTo(-5, -6 + arm); ctx.moveTo(3.3, -12); ctx.lineTo(4.9, -7 - arm); ctx.stroke();
    ctx.fillStyle = seed % 2 ? '#b98379' : '#8eaaa3'; ctx.beginPath(); ctx.moveTo(-2.5, -14);
    ctx.quadraticCurveTo(0, -15, 2.8, -14); ctx.lineTo(4.2, -5.2); ctx.lineTo(-3.8, -5.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#313948'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-1.7, -5); ctx.lineTo(-2, 0); ctx.moveTo(2, -5); ctx.lineTo(2.4, 0); ctx.stroke();
    ctx.restore();
  }

  #roadText(at: RoadPose, text: string): void {
    const a = this.#project(offset(at, -1800, 10, -1000)), b = this.#project(offset(at, 1800, 10, -1000)), c = this.#project(offset(at, -1800, 10, 1000));
    if (!a || !b || !c || Math.abs(b.x - a.x) < 15) return;
    const ctx = this.#ctx; ctx.save();
    ctx.transform((b.x - a.x) / 120, (b.y - a.y) / 120, (a.x - c.x) / 30, (a.y - c.y) / 30, c.x, c.y);
    ctx.fillStyle = '#ddd0b6'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.fillText(text, 60, 22, 118); ctx.restore();
  }

  #gate(at: RoadPose, ja: string, en: string): void {
    const left = offset(at, -at.width - 350), right = offset(at, at.width + 350);
    for (const post of [left, right]) {
      const p = { ...post, heading: at.heading, width: 0, sector: 0 };
      this.#poly([offset(p, -120), offset(p, 120), offset(p, 120, 5600), offset(p, -120, 5600)], '#daceb8');
    }
    this.#poly([offset(at, -at.width - 500, 4700), offset(at, at.width + 500, 4700), offset(at, at.width + 500, 5700), offset(at, -at.width - 500, 5700)], '#ad3448');
    const middle = this.#project(offset(at, 0, 5000));
    if (middle && middle.scale * at.width > 22) {
      const ctx = this.#ctx; ctx.fillStyle = CREAM; ctx.textAlign = 'center';
      ctx.font = `bold ${clamp(Math.round(middle.scale * 600), 7, 24)}px SoraJP, LabJP, sans-serif`;
      ctx.fillText(`SORA  ${ja}`, middle.x, middle.y, middle.scale * at.width * 1.8);
    }
    for (let i = -4; i < 4; i++) this.#poly([offset(at, i * at.width / 4, 10), offset(at, (i + 1) * at.width / 4, 10), offset(at, (i + 1) * at.width / 4, 10, 500), offset(at, i * at.width / 4, 10, 500)], i % 2 ? '#efe6ce' : '#343044');
    this.#roadText({ ...at, ...offset(at, 0, 0, -3500) }, en);
  }

  #fadedCar(opacity: number, draw: () => void): void {
    const destination = this.#ctx;
    if (!this.#carLayer) {
      this.#carLayer = document.createElement('canvas');
      this.#carLayerContext = this.#carLayer.getContext('2d');
    }
    const layer = this.#carLayer, ctx = this.#carLayerContext;
    if (!ctx) { draw(); return; }
    // Reuse one transparent surface, bounded by the same two-megapixel budget
    // as the main view. An opaque car is composited once so its own surfaces
    // cannot show through each other as it fades out of the camera corridor.
    if (layer.width !== this.#canvas.width || layer.height !== this.#canvas.height) {
      layer.width = this.#canvas.width; layer.height = this.#canvas.height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, layer.width, layer.height);
    ctx.setTransform(destination.getTransform()); ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    this.#ctx = ctx;
    try { draw(); } finally { this.#ctx = destination; }
    destination.save();
    try {
      destination.setTransform(1, 0, 0, 1, 0, 0); destination.globalAlpha *= opacity;
      destination.drawImage(layer, 0, 0);
    } finally { destination.restore(); }
  }

  #car(at: RoadPose, car: StreetRenderCar, player: boolean, controls: number, time: number, still: boolean): void {
    const ctx = this.#ctx, base = { ...at, ...offset(at, car.lateralMm) };
    const heading = at.heading + car.bodyYawMicroturn * TAU / 1e6;
    const sin = Math.sin(heading), cos = Math.cos(heading);
    const p = (x: number, y: number, z: number): Vec => ({ x: base.x + cos * x + sin * z,
      y: base.y + y, z: base.z - sin * x + cos * z });
    const carWidth = (this.#project(base)?.scale ?? 0) * 1950, detailed = carWidth > 70;
    const wheelSegments = detailed ? 16 : 8, wheelCapSegments = detailed ? 20 : 10;
    const body = LIVERIES[mod(Math.trunc(car.skin), LIVERIES.length)]!;
    const light = mixColor(body, '#fff2d7', 0.45), shade = mixColor(body, '#3e4c64', 0.5);
    const braking = player && !!(controls & 2) && car.status === 0;
    const depth = this.#view(base).z, haze = clamp((depth - 25000) / 325000, 0, 0.84) ** 2;
    const gradient = (a: Vec, b: Vec, stops: readonly [number, string][]): string | CanvasGradient => {
      const start = this.#project(a), end = this.#project(b);
      if (!start || !end) return stops[0]![1];
      const paint = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
      for (const [at, color] of stops) paint.addColorStop(at, mixColor(color, this.#fogColor, haze));
      return paint;
    };
    const faces: { points: Vec[]; color: string | CanvasGradient; depth: number }[] = [];
    const face = (points: Vec[], color: string | CanvasGradient) => faces.push({ points, color,
      depth: points.reduce((sum, vertex) => sum + this.#view(vertex).z, 0) / points.length });
    // Contact shadow and long, low-opacity lamp reflections stay on the ground.
    ctx.save();
    for (let layer = 0; layer < 4; layer++) {
      const x = 1300 - layer * 100, z = 2350 - layer * 90;
      ctx.globalAlpha *= layer === 0 ? 0.11 : 1.12;
      this.#poly([p(-x * 0.8, 10, -z), p(x * 0.8, 10, -z), p(x, 10, -z * 0.7), p(x, 10, z * 0.7),
        p(x * 0.8, 10, z), p(-x * 0.8, 10, z), p(-x, 10, z * 0.7), p(-x, 10, -z * 0.7)], '#141c2b');
    }
    ctx.restore();
    if (this.#wet) {
      ctx.save(); ctx.globalAlpha *= braking ? 0.23 : 0.1;
      for (const side of [-1, 1]) {
        this.#poly([p(side * 820, 14, -2000), p(side * 370, 14, -2000),
          p(side * 320, 14, -3350), p(side * 980, 14, -3350)], '#e7656d');
        ctx.globalAlpha *= 0.5;
        this.#poly([p(side * 980, 14, -3350), p(side * 320, 14, -3350),
          p(side * 170, 14, -4500), p(side * 1080, 14, -4500)], '#bd6c80');
        ctx.globalAlpha *= 2;
      }
      ctx.restore();
    }
    face([p(-860, 190, -1950), p(860, 190, -1950), p(900, 190, 1900), p(-900, 190, 1900)], '#1b2534');
    for (const side of [-1, 1]) {
      // Rounded tyres are actual projected cylinders, visible correctly from every camera.
      for (const z of [-1280, 1280]) {
        const wheel = (x: number, theta: number, radius = 345) => p(side * x, 355 + Math.sin(theta) * radius, z + Math.cos(theta) * radius);
        const disk = (x: number, radius: number) => Array.from({ length: wheelCapSegments }, (_, i) => wheel(x, i * TAU / wheelCapSegments, radius));
        for (let section = 0; section < wheelSegments; section++) {
          const a = section * TAU / wheelSegments, b = (section + 1) * TAU / wheelSegments;
          face([wheel(815, a), wheel(1040, a), wheel(1040, b), wheel(815, b)], section < wheelSegments / 2 ? '#303744' : '#171f2b');
        }
        face(disk(1042, 333), '#19232f'); face(disk(1044, 225), '#6e7a87');
        if (detailed) face(disk(1046, 188), '#273443');
        for (let spoke = 0; detailed && spoke < 6; spoke++) {
          const a = spoke * TAU / 6;
          face([wheel(1048, a, 62), wheel(1048, a - 0.13, 185), wheel(1048, a + 0.13, 185), wheel(1048, a + 0.3, 62)], '#adb6bd');
        }
        if (detailed) face(disk(1050, 60), '#bdc1be');
      }
      const flank = gradient(p(side * 970, 800, 0), p(side * 970, 240, 0), [[0, light], [0.2, body], [0.68, shade], [1, '#344051']]);
      const sill: Vec[] = [p(side * 950, 285, -1990), p(side * 985, 320, -1690)];
      for (const z of [-1280, 1280]) {
        if (z > 0) sill.push(p(side * 985, 310, 870));
        for (let i = 0; i <= 10; i++) {
          const theta = Math.PI - i * Math.PI / 10;
          sill.push(p(side * 985, 350 + Math.sin(theta) * 385, z + Math.cos(theta) * 390));
        }
      }
      sill.push(p(side * 950, 280, 1970), p(side * 970, 735, 1970), p(side * 960, 795, -1990));
      face(sill, flank);
      // A bright shoulder, inset door and dark rub strip make the metal feel formed.
      face([p(side * 960, 795, -1990), p(side * 800, 875, -920), p(side * 790, 900, 1060), p(side * 970, 735, 1970)],
        gradient(p(side * 980, 770, 0), p(side * 790, 880, 0), [[0, body], [0.7, light], [1, body]]));
      face([p(side * 991, 463, -885), p(side * 991, 490, -885), p(side * 991, 490, 875), p(side * 991, 463, 875)], '#404a58');
      face([p(side * 993, 494, -890), p(side * 993, 504, -890), p(side * 993, 504, 885), p(side * 993, 494, 885)], '#a2a7aa');
      face([p(side * 987, 535, -840), p(side * 987, 535, -827), p(side * 987, 780, -827), p(side * 987, 780, -840)], shade);
      face([p(side * 982, 755, -700), p(side * 982, 784, -700), p(side * 982, 784, -470), p(side * 982, 755, -470)], '#c5c6bf');
      face([p(side * 770, 864, -960), p(side * 642, 1390, -540), p(side * 642, 1370, 680), p(side * 785, 873, 1120)], shade);
      face([p(side * 777, 918, -840), p(side * 653, 1333, -502), p(side * 653, 1320, 648), p(side * 779, 924, 1000)],
        gradient(p(side * 650, 1340, 0), p(side * 779, 920, 0), [[0, '#aab6c1'], [0.27, '#70859a'], [0.65, '#304658'], [1, '#293b4e']]));
      face([p(side * 738, 1070, 425), p(side * 655, 1320, 342), p(side * 655, 1320, 385), p(side * 738, 1070, 475)], '#48586a');
      face([p(side * 748, 1040, -750), p(side * 660, 1305, -510), p(side * 660, 1305, -425), p(side * 748, 1040, -620)], '#9eaeb6');
      face([p(side * 910, 900, 770), p(side * 1120, 905, 730), p(side * 1110, 1000, 970), p(side * 875, 1020, 1010)], shade);
      face([p(side * 915, 949, 760), p(side * 1100, 950, 750), p(side * 1100, 990, 955), p(side * 910, 1002, 980)], light);
    }
    // Continuous gradients reflect the sky across the deck, roof and bonnet.
    face([p(-960, 795, -1990), p(960, 795, -1990), p(770, 870, -960), p(-770, 870, -960)],
      gradient(p(0, 795, -1990), p(0, 870, -960), [[0, light], [0.18, body], [0.7, '#b2b2b4'], [1, light]]));
    face([p(-770, 870, -960), p(770, 870, -960), p(642, 1390, -540), p(-642, 1390, -540)], '#384a5b');
    face([p(-706, 926, -920), p(706, 926, -920), p(605, 1342, -558), p(-605, 1342, -558)],
      gradient(p(0, 1342, -558), p(0, 926, -920), [[0, '#a5b5c3'], [0.18, '#7d90a4'], [0.48, '#4c647b'], [1, '#263a4e']]));
    for (const side of [-1, 1]) {
      face([p(side * 490, 945, -909), p(side * 230, 945, -909), p(side * 245, 1110, -770), p(side * 475, 1110, -770)], '#314659');
    }
    for (let line = 1; detailed && line < 6; line++) {
      const t = line / 7, y = 926 + t * 416, z = -923 + t * 362, x = 706 - t * 101;
      face([p(-x, y, z), p(x, y, z), p(x - 1, y + 3, z + 2), p(-x + 1, y + 3, z + 2)], '#6b8090');
    }
    face([p(-642, 1390, -540), p(642, 1390, -540), p(642, 1370, 680), p(-642, 1370, 680)],
      gradient(p(-642, 1390, 0), p(642, 1390, 0), [[0, body], [0.17, light], [0.47, '#ece6db'], [0.82, body], [1, shade]]));
    face([p(-642, 1370, 680), p(642, 1370, 680), p(785, 873, 1120), p(-785, 873, 1120)], '#354a5e');
    face([p(-597, 1320, 715), p(597, 1320, 715), p(717, 930, 1070), p(-717, 930, 1070)],
      gradient(p(0, 1320, 715), p(0, 930, 1070), [[0, '#a2b1bd'], [0.28, '#6f869e'], [1, '#2f455b']]));
    face([p(-785, 873, 1120), p(785, 873, 1120), p(970, 735, 1970), p(-970, 735, 1970)],
      gradient(p(0, 873, 1120), p(0, 735, 1970), [[0, light], [0.38, body], [0.88, light], [1, shade]]));
    for (const side of [-1, 1]) face([p(side * 610, 878, 1140), p(side * 626, 878, 1140),
      p(side * 730, 750, 1890), p(side * 713, 750, 1890)], light);
    face([p(-950, 280, -1990), p(950, 280, -1990), p(960, 735, -2020), p(-960, 735, -2020)],
      gradient(p(0, 735, -2020), p(0, 280, -1990), [[0, body], [0.38, shade], [1, '#354152']]));
    face([p(-960, 735, -2020), p(960, 735, -2020), p(960, 795, -1990), p(-960, 795, -1990)], light);
    face([p(-970, 470, -2030), p(970, 470, -2030), p(955, 678, -2030), p(-955, 678, -2030)], '#283241');
    face([p(-970, 290, -2038), p(970, 290, -2038), p(970, 368, -2038), p(-970, 368, -2038)], '#26313e');
    face([p(-970, 369, -2040), p(970, 369, -2040), p(962, 394, -2040), p(-962, 394, -2040)], '#a6afae');
    face([p(-950, 280, 1970), p(950, 280, 1970), p(970, 735, 1970), p(-970, 735, 1970)], shade);
    face([p(-330, 420, 1981), p(330, 420, 1981), p(330, 600, 1981), p(-330, 600, 1981)], '#27333e');
    for (const side of [-1, 1]) {
      face([p(side * 866, 508, -2040), p(side * 365, 508, -2040), p(side * 365, 645, -2040), p(side * 860, 645, -2040)],
        gradient(p(0, 645, -2040), p(0, 508, -2040), [[0, braking ? '#ffd4b4' : '#ee9790'], [0.22, braking ? '#ff8379' : '#d85061'], [1, '#983c52']]));
      face([p(side * 860, 575, -2042), p(side * 700, 575, -2042), p(side * 700, 641, -2042), p(side * 860, 641, -2042)], '#dab69e');
      face([p(side * 854, 490, 1988), p(side * 390, 490, 1988), p(side * 390, 666, 1988), p(side * 854, 666, 1988)], '#ddd9c5');
      face([p(side * 845, 523, 1990), p(side * 400, 523, 1990), p(side * 400, 643, 1990), p(side * 845, 643, 1990)], '#fff0c9');
      face([p(side * 780, 270, -2035), p(side * 630, 270, -2035), p(side * 630, 320, -2035), p(side * 780, 320, -2035)], '#a5adb0');
      face([p(side * 760, 278, -2042), p(side * 650, 278, -2042), p(side * 650, 307, -2042), p(side * 760, 307, -2042)], '#1f2a36');
      face([p(side * 690, 797, -1640), p(side * 620, 797, -1640), p(side * 620, 920, -1640), p(side * 690, 920, -1640)], shade);
    }
    face([p(-190, 478, -2040), p(190, 478, -2040), p(190, 680, -2040), p(-190, 680, -2040)], '#b83947');
    face([p(-252, 305, -2046), p(252, 305, -2046), p(252, 414, -2046), p(-252, 414, -2046)], '#273744');
    face([p(-232, 319, -2048), p(232, 319, -2048), p(232, 402, -2048), p(-232, 402, -2048)], '#d8dacb');
    face([p(-1030, 926, -1730), p(1030, 926, -1730), p(1030, 944, -1910), p(-1030, 944, -1910)],
      gradient(p(0, 926, -1730), p(0, 944, -1910), [[0, shade], [0.42, body], [1, light]]));
    face([p(-1030, 913, -1910), p(1030, 913, -1910), p(1030, 944, -1910), p(-1030, 944, -1910)], '#3e4b5a');
    faces.sort((a, b) => b.depth - a.depth);
    for (const f of faces) this.#poly(f.points, f.color);
    const mark = this.#project(p(0, 578, -2050));
    if (mark && Math.cos(heading - this.#heading) > 0.3 && mark.scale > 0.005 && this.#flag.complete && this.#flag.naturalWidth) {
      const tl = this.#project(p(-190, 680, -2050)), tr = this.#project(p(190, 680, -2050)), bl = this.#project(p(-190, 478, -2050));
      if (tl && tr && bl) {
        ctx.save(); ctx.transform((tr.x - tl.x) / 38, (tr.y - tl.y) / 38, (bl.x - tl.x) / 24, (bl.y - tl.y) / 24, tl.x, tl.y);
        ctx.drawImage(this.#flag, 0, 0, 38, 24); ctx.restore();
      }
    }
    if (!still && car.boosting === 1 && car.status === 0) for (const side of [-1, 1]) {
      const length = 700 + Math.sin(time * 41 + side) * 160;
      this.#poly([p(side * 700 - 90, 300, -2045), p(side * 700 + 90, 300, -2045), p(side * 700, 180, -2045 - length)], '#77d9ed');
      this.#poly([p(side * 700 - 40, 300, -2050), p(side * 700 + 40, 300, -2050), p(side * 700, 220, -2050 - length * 0.64)], '#e1faf3');
    }
    if ((car.wallContact === 1 || car.carContact === 1) && !still) {
      const point = this.#project(p(car.lateralMm > 0 ? 1100 : -1100, 600, 0));
      if (point) { ctx.fillStyle = '#ffdc83'; ctx.beginPath(); ctx.arc(point.x, point.y, 2, 0, TAU); ctx.fill(); }
    }
  }

  #recordTrails(track: CompiledStreetTrack, state: StreetRenderState): void {
    state.cars.forEach((car, slot) => {
      const at = poseAt(track, car.progressMm), centre = { ...at, ...offset(at, car.lateralMm) };
      const heading = at.heading + car.bodyYawMicroturn * TAU / 1e6;
      const tyres = [-760, 760].map(side => offset(centre, side, 12, -1450, heading));
      const slip = Math.abs(angle((car.bodyYawMicroturn - car.velocityYawMicroturn) * TAU / 1e6));
      const previous = this.#previousTyres[slot];
      if (previous && car.status === 0 && car.speedMmPerTick > 200 && (car.drifting === 1 || slip > 0.08)) {
        for (let side = 0; side < 2; side++) {
          const a = previous[side]!, b = tyres[side]!;
          if (Math.hypot(a.x - b.x, a.z - b.z) < 15000) this.#trails.push({ tick: state.tick, points: [
            { ...a, x: a.x - 65 }, { ...a, x: a.x + 65 }, { ...b, x: b.x + 65 }, { ...b, x: b.x - 65 },
          ] });
        }
      }
      this.#previousTyres[slot] = tyres;
    });
    if (this.#trails.length > 720) this.#trails.splice(0, this.#trails.length - 720);
  }

  #speedLines(progress: number, velocity: number, surge: number): void {
    const ctx = this.#ctx, w = this.#width, h = this.#height;
    // Over a pixel-art frame each line is a dash of single art cells in an
    // opaque palette colour (brighter while boosting) instead of a faint stroke.
    const grid = pixelOverlayGrid(this.#canvas), sx = grid ? grid.artWidth / w : 0, sy = grid ? grid.artHeight / h : 0;
    if (grid) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = surge > 0.5 ? PIXEL_OVERLAY_COLOURS.speedLineSurge : PIXEL_OVERLAY_COLOURS.speedLine;
    } else { ctx.strokeStyle = '#e7cfb2'; ctx.lineWidth = 1; ctx.globalAlpha = 0.13 + surge * 0.15; }
    for (let i = 0; i < 12; i++) {
      const phase = mod(progress / (22000 + i * 900) + i * 0.163, 1);
      const side = i % 2 ? -1 : 1, start = 0.72 + phase * 0.35;
      const x = w / 2 + side * w * start / 2, y = this.#horizon + (h - this.#horizon) * (0.25 + phase * 0.8);
      const endX = x + side * (10 + surge * 12) * velocity, endY = y + 5 + phase * 14;
      if (grid) dashedCellLine(ctx, grid, x * sx, y * sy, endX * sx, endY * sy);
      else { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke(); }
    }
    if (grid) ctx.restore();
    ctx.globalAlpha = 1;
  }
  #rain(time: number, still: boolean): void {
    const ctx = this.#ctx, grid = pixelOverlayGrid(this.#canvas);
    const sx = grid ? grid.artWidth / this.#width : 0, sy = grid ? grid.artHeight / this.#height : 0;
    if (grid) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); } else { ctx.fillStyle = '#bfd2da'; ctx.globalAlpha = 0.36; }
    for (let i = 0; i < 65; i++) {
      const x = mod(i * 137 + (still ? 0 : time * 95), this.#width), y = mod(i * 83 + (still ? 0 : time * 330), this.#height);
      if (grid) {
        // Vertical dashed columns of single cells, as the cutscenes draw rain.
        const layer = i % 3;
        ctx.fillStyle = PIXEL_OVERLAY_COLOURS.rainBody[layer]!;
        rainColumn(ctx, grid, x * sx, (y + 4 + i % 6) * sy, Math.max(2, Math.round((4 + i % 6) * sy)), i, PIXEL_OVERLAY_COLOURS.rainHead[layer]);
      } else ctx.fillRect(Math.round(x), Math.round(y), 1, 4 + i % 6);
    }
    if (grid) ctx.restore();
    ctx.globalAlpha = 1;
  }

  #hud(track: CompiledStreetTrack, state: StreetRenderState, options: StreetRenderOptions, car: StreetRenderCar, at: RoadPose, kmh: number, chapterTitle: boolean): void {
    const ctx = this.#ctx, w = this.#width, h = this.#height, mobile = w < 430, pad = mobile ? 12 : 26;
    ctx.fillStyle = '#251f35'; ctx.globalAlpha = 0.77; ctx.fillRect(0, 0, w, mobile ? 78 : 67); ctx.globalAlpha = 1;
    if (this.#flag.complete && this.#flag.naturalWidth) ctx.drawImage(this.#flag, pad, 12, 23, 14);
    ctx.textAlign = 'left'; ctx.fillStyle = CREAM; ctx.font = 'bold 11px Sora, LabSora, SoraJP, LabJP, sans-serif'; ctx.fillText('SORA CARS', pad + 30, 23);
    ctx.font = '9px SoraJP, LabJP, sans-serif'; ctx.fillStyle = '#cbbacb'; ctx.fillText(options.raceMode ?? '東京 1986 / TOKYO', pad, 39);
    ctx.font = `900 ${mobile ? 24 : 29}px Sora, LabSora, sans-serif`; ctx.fillStyle = CREAM;
    ctx.fillText(String(car.rank || 1).padStart(2, '0'), pad, mobile ? 66 : 65);
    ctx.font = '9px SoraJP, LabJP, sans-serif'; ctx.fillText(`/ ${state.cars.length} 順位 / POS`, pad + 42, mobile ? 63 : 61);
    const lap = Math.min(track.laps, Math.floor(Math.max(0, car.progressMm) / track.lengthMm) + 1);
    ctx.textAlign = mobile ? 'right' : 'center';
    const middle = mobile ? w - pad : w / 2;
    ctx.font = 'bold 13px SoraJP, LabJP, sans-serif'; ctx.fillText(track.topology === 'sprint' ? '目的地へ / SPRINT' : `${lap} / ${track.laps} 周 / LAP`, middle, 22);
    const seconds = Math.max(0, state.tick / 30);
    ctx.font = '11px monospace'; ctx.fillText(`${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`, middle, 39);
    const finished = state.cars.filter(c => c.status === 1).length;
    if (finished > 0) {
      ctx.font = '9px SoraJP, LabJP, sans-serif'; ctx.fillStyle = '#e5d3bc';
      ctx.fillText(`完走 ${finished} / ${state.cars.length} · FINISHED`, middle, mobile ? 60 : 57);
    }
    if (!mobile) this.#map(track, state, options.playerSlot, w - 120, 9, 93, 90);
    const next = track.gates.map(g => ({ gate: g, distance: track.topology === 'circuit' ? mod(track.samples[g.sample]!.progressMm - car.progressMm, track.lengthMm) : track.samples[g.sample]!.progressMm - car.progressMm }))
      .filter(g => g.distance > 0).sort((a, b) => a.distance - b.distance)[0];
    // During the brief mobile film cue, navigation retains a separate right
    // column. Neither the route warning nor title covers the other.
    const aside = mobile && chapterTitle;
    const navigationX = aside ? w - pad : w / 2;
    const navigationWidth = aside ? Math.floor(w * 0.4) - pad : w - pad * 2;
    if (next && car.status === 0) {
      const title = GATE_NAMES[next.gate.id]?.[0] ?? '通過点';
      ctx.textAlign = aside ? 'right' : 'center'; ctx.fillStyle = CREAM; ctx.font = 'bold 10px SoraJP, LabJP, sans-serif';
      ctx.fillText(`次 ${title}  ${Math.ceil(next.distance / 1000)} m`, navigationX, mobile ? 95 : 88, navigationWidth);
    }
    const turn = angle(poseAt(track, car.progressMm + 42000).heading - at.heading);
    if (Math.abs(turn) > 0.17 && car.status === 0 && kmh > 50) {
      ctx.textAlign = aside ? 'right' : 'center'; ctx.fillStyle = '#ffe3a0'; ctx.font = `bold ${mobile ? 12 : 17}px SoraJP, LabJP, sans-serif`;
      ctx.fillText(`${turn > 0 ? '右' : '左'}カーブ ${turn > 0 ? '»' : '«'}`, navigationX, mobile ? 117 : 113, navigationWidth);
      ctx.font = '8px Sora, LabSora, sans-serif'; ctx.fillText(aside ? 'BRAKE · TURN' : 'BRAKE · TURN · CONTROL THE SLIDE', navigationX, mobile ? 129 : 126, navigationWidth);
    }
    const bottom = (mobile ? h - 35 : h - 26) - (options.bottomInset ?? 0);
    ctx.textAlign = 'right'; ctx.fillStyle = CREAM; ctx.font = `900 italic ${mobile ? 35 : 48}px Sora, LabSora, sans-serif`;
    ctx.fillText(String(Math.round(kmh)).padStart(3, '0'), w - pad, bottom);
    ctx.font = '9px Sora, LabSora, sans-serif'; ctx.fillText('KM/H', w - pad, bottom + 14);
    const meterWidth = mobile ? 86 : 150;
    ctx.textAlign = 'left'; ctx.fillStyle = '#2b263a'; ctx.fillRect(pad, bottom - 7, meterWidth, 6);
    if (car.energy !== undefined) { ctx.fillStyle = '#f2da91'; ctx.fillRect(pad, bottom - 7, meterWidth * clamp(car.energy / 1000, 0, 1), 6); }
    ctx.fillStyle = '#e5d3bc'; ctx.font = '9px SoraJP, LabJP, sans-serif'; ctx.fillText('ターボ / TURBO', pad, bottom - 15);
    const slip = Math.abs(angle((car.bodyYawMicroturn - car.velocityYawMicroturn) * TAU / 1e6));
    if (car.status === 0 && (car.drifting === 1 || slip > 0.08) && kmh > 20) {
      ctx.fillStyle = '#ffe3a0'; ctx.font = 'bold 10px SoraJP, LabJP, sans-serif'; ctx.fillText('横滑り / DRIFT', pad, bottom - 33);
    }
    if (car.status === 0 && (car.oil === 1 || car.oilCrossed === 1)) {
      ctx.fillStyle = '#d3baff'; ctx.font = 'bold 10px SoraJP, LabJP, sans-serif';
      ctx.fillText(car.oil === 1 ? '油膜 / OIL' : '油膜を通過 / OIL CROSSED', pad, bottom - 48);
    }
    if (car.status === 0 && (car.propHitMask ?? 0) > 0) {
      ctx.fillStyle = '#ffd590'; ctx.font = 'bold 10px SoraJP, LabJP, sans-serif';
      ctx.fillText('接触 / IMPACT', pad, bottom - 63);
    }
    if (options.paused || car.status !== 0) {
      const label = car.status === 1 ? ['ゴール', 'FINISHED'] : car.status === 2 ? ['走行終了', 'FORFEIT'] : car.status === 3 ? ['制限時間', 'TIME LIMIT'] : ['一時停止', 'PAUSED'];
      ctx.fillStyle = '#211b30'; ctx.globalAlpha = 0.86; ctx.fillRect(0, h * 0.39, w, 75); ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.fillStyle = CREAM; ctx.font = 'bold 29px SoraJP, LabJP, sans-serif'; ctx.fillText(label[0]!, w / 2, h * 0.39 + 34);
      ctx.font = '11px Sora, LabSora, sans-serif'; ctx.fillText(label[1]!, w / 2, h * 0.39 + 56);
    }
  }

  #map(track: CompiledStreetTrack, state: StreetRenderState, playerSlot: number, x: number, y: number, width: number, height: number): void {
    if (!this.#mapPath.length) return;
    const minX = Math.min(...this.#mapPath.map(p => p.x)), maxX = Math.max(...this.#mapPath.map(p => p.x));
    const minZ = Math.min(...this.#mapPath.map(p => p.z)), maxZ = Math.max(...this.#mapPath.map(p => p.z));
    const scale = Math.min(width / Math.max(1, maxX - minX), height / Math.max(1, maxZ - minZ));
    const xy = (p: Vec) => ({ x: x + width / 2 + (p.x - (minX + maxX) / 2) * scale, y: y + height / 2 - (p.z - (minZ + maxZ) / 2) * scale });
    const ctx = this.#ctx; ctx.strokeStyle = '#ab90b4'; ctx.lineWidth = 2; ctx.beginPath();
    this.#mapPath.forEach((p, i) => { const s = xy(p); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); }); ctx.stroke();
    state.cars.forEach((car, slot) => {
      const p = xy(poseAt(track, car.progressMm)); ctx.fillStyle = slot === playerSlot ? '#fff0cb' : LIVERIES[mod(car.skin, 6)]!;
      const size = slot === playerSlot ? 5 : 3; ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
    });
  }
}
