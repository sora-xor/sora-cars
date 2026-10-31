import { CONTROL, LIVERIES, TRACKS, curvature, modulo, type Livery } from './rules';
import { type RaceState } from './engine';
import type { DriveEvent } from './drive/race';
import { raceResultPlaces } from './presentation';
import { clubItem, clubLivery, type ClubAppearance } from './catalog';
import { environmentAt, type TrackEnvironment, type EnvironmentContact } from './environment';
import { drawIllustratedTree, drawIllustratedShop } from './illustrated-scenery';
import { getRaceWorld } from './three/world';
import { drawDamageGauge, drawWreckBanner } from './drive/hud';
import { PIXEL_OVERLAY_COLOURS, drawAtmosphere, fillArtCells, pixelOverlayGrid, rainColumn } from './three/pixel-art/overlay';

export type ReplayCamera = 'chase' | 'bumper' | 'aerial';
export interface RenderOptions {
  camera?: ReplayCamera;
  playerSlot: number; names: string[]; skins: number[]; attract?: boolean; countdown?: number;
  controls?: number; raceMode?: string; hud?: boolean;
  /** Presentation-only; never feeds physics, proof inputs or hit boxes. */
  appearances?: Readonly<Record<number, ClubAppearance>>;
  contacts?: readonly EnvironmentContact[];
  /** Display weather/objects from the selected compiled relation. */
  environment?: Readonly<TrackEnvironment>;
  /** Driving model only: RaceV1 ids of roadside objects knocked down, and crash events since the last frame. */
  broken?: readonly number[];
  events?: readonly DriveEvent[];
}
interface RoadPoint { x: number; y: number; half: number; z: number; scale: number; progress: number; }
const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;
export class RaceRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly backdrop = new Image();
  readonly flag = new Image();
  width = 960; height = 540;
  #time = 0;
  #wind = 0;
  readonly #reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  #impacts = new Map<number, { time: number; tick: number }>();
  #lastTrack = -1;
  #lastTick = 0;
  #lastEventTick = -1;
  #cameraMotion = 0;
  #cameraBoost = 0;
  #cameraBrake = 0;
  #cameraTurn = 0;
  #cameraTime: number | null = null;
  readonly #tintedBackdrops = new Map<number, HTMLCanvasElement>();
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!;
    this.backdrop.src = asset('alpine-dusk.png'); this.flag.src = asset('sora-flag.png');
    this.resize();
  }
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.height = 540; this.width = Math.max(180, Math.round(540 * rect.width / Math.max(1, rect.height)));
    // Keep projection and HUD coordinates stable while rasterizing at display
    // resolution. Bound fill cost on Retina/ultrawide screens to about 2 MP.
    const ratio = Math.min(Math.max(1, rect.height / this.height * Math.min(window.devicePixelRatio || 1, 2)), Math.sqrt(2073600 / (this.width * this.height)));
    this.canvas.width = Math.round(this.width * ratio); this.canvas.height = Math.round(this.height * ratio);
    this.canvas.style.imageRendering = 'auto';
    this.#prepareCanvas();
  }
  #prepareCanvas(): void {
    this.ctx.setTransform(this.canvas.width / this.width, 0, 0, this.canvas.height / this.height, 0, 0);
    this.ctx.imageSmoothingEnabled = true; this.ctx.imageSmoothingQuality = 'high';
  }
  draw(state: RaceState, options: RenderOptions, time: number): void {
    this.#prepareCanvas();
    this.#time = time;
    const world = getRaceWorld(this.canvas);
    if (world) {
      const environment = options.environment ?? environmentAt(state.trackId, state.tick);
      const player = state.cars[options.playerSlot]!;
      this.#wind = environment.wind;
      this.ctx.drawImage(world.renderArcade(state, options, time), 0, 0, this.width, this.height);
      if (environment.rain > 0) this.#weather(state, time, environment);
      // Hakone's winter night snows; Nikko's Sakura Pass blows with petals.
      else if (state.trackId !== 1) drawAtmosphere(this.ctx, this.canvas, this.width, this.height, state.trackId === 0 ? 'snow' : 'blossom',
        this.#reducedMotion.matches ? 0 : time, environment.wind);
      if (options.hud && player.speed > 150 && options.camera !== 'aerial') {
        this.#cornerCue(TRACKS[state.trackId]!, player.progress, this.width < 400);
      }
      if (options.hud) this.#hud(state, options);
      this.#countdown(options);
      this.#lastTrack = state.trackId; this.#lastTick = state.tick;
      return;
    }
    if (options.camera === 'aerial') { this.#drawAerial(state, options); return; }
    const ctx = this.ctx, w = this.width, h = this.height, track = TRACKS[state.trackId]!, player = state.cars[options.playerSlot]!;
    const kmh = Math.max(0, player.speed * 0.108);
    const velocity = Math.min(1, kmh / 280);
    const boosting = !!((options.controls ?? 0) & CONTROL.boost) && player.energy >= 25 && player.speed > 0;
    const drifting = !!((options.controls ?? 0) & CONTROL.drift) && player.speed > 200 && Math.abs(player.vx) > 10;
    const resetCamera = this.#cameraTime === null || this.#lastTrack !== state.trackId || state.tick < this.#lastTick;
    const cameraDt = resetCamera ? 0 : Math.max(0, Math.min(0.1, time - this.#cameraTime!));
    this.#cameraTime = time;
    if (resetCamera || this.#reducedMotion.matches) {
      this.#cameraMotion = this.#reducedMotion.matches ? 0 : velocity;
      this.#cameraBoost = 0;
      this.#cameraBrake = 0;
      this.#cameraTurn = 0;
    } else {
      this.#cameraMotion += (velocity - this.#cameraMotion) * (1 - Math.exp(-cameraDt * 7));
      this.#cameraBoost += ((boosting ? 1 : 0) - this.#cameraBoost) * (1 - Math.exp(-cameraDt * 10));
      this.#cameraBrake += (((options.controls ?? 0) & CONTROL.brake ? velocity : 0) - this.#cameraBrake) * (1 - Math.exp(-cameraDt * 8));
      this.#cameraTurn += (Math.max(-1, Math.min(1, player.vx / 220)) * velocity - this.#cameraTurn) * (1 - Math.exp(-cameraDt * 6));
    }
    const motion = this.#cameraMotion, surge = this.#cameraBoost;
    const cameraSway = this.#cameraTurn * w * 0.028;
    // Shorter perspective and denser road texture make real progress visible at racing speed.
    // One projection is shared by the road, cars and solid objects; geometry stays simulation-bound.
    const horizon = h * ((options.camera === 'bumper' ? 0.49 : 0.435) - motion * 0.09 - surge * 0.02 + this.#cameraBrake * 0.016);
    const focal = 36000 - motion * 22500 - surge * 2500 + this.#cameraBrake * 2300;
    const segmentLength = 5000, cameraOffset = options.camera === 'bumper' ? 1500 : 9000;
    const cameraProgress = player.progress - cameraOffset;
    const mobile = w < 400;
    // Keep the shoulders in view near the car: close posts, shopfronts and trees
    // sweep past faster on screen than a distant, wide-open verge.
    const roadHalfPixels = w * (0.78 - motion * 0.12);
    const projectScale = (z: number) => 1 / (1 + z / focal);
    // The player's rear axle anchors the projection. Cars at equal progress
    // share its depth and apparent size, including during a boost camera pullback.
    const playerScale = projectScale(cameraOffset);
    const carGround = h * (mobile ? 0.78 : 0.865);
    const projectionHeight = options.camera === 'bumper' ? (h - horizon) * 1.08 : (carGround - horizon) / playerScale;
    const environment = options.environment ?? environmentAt(state.trackId, state.tick), raining = environment.rain > 0;
    this.#wind = environment.wind;
    if (this.#lastTrack !== state.trackId || state.tick < this.#lastTick) { this.#impacts.clear(); this.#lastEventTick = -1; }
    this.#lastTrack = state.trackId; this.#lastTick = state.tick;
    for (const event of options.contacts ?? []) if (event.kind !== 'oil' && event.tick > this.#lastEventTick) this.#impacts.set(event.objectId, { time, tick: event.tick });
    for (const event of options.contacts ?? []) this.#lastEventTick = Math.max(this.#lastEventTick, event.tick);
    for (const [id, impact] of this.#impacts) if (time - impact.time > 1.2) this.#impacts.delete(id);
    ctx.fillStyle = track.sky; ctx.fillRect(0, 0, w, h);
    if (this.backdrop.complete && this.backdrop.naturalWidth) {
      const bgw = Math.max(w + 130, (horizon + 110) * 1.5);
      const shift = Math.sin(player.progress / 650000) * 30 - player.x / 500 - cameraSway * 0.3;
      ctx.drawImage(this.#backdropFor(state.trackId), (w - bgw) / 2 + shift, -80, bgw, horizon + 215);
    }
    const landscape = ctx.createLinearGradient(0, horizon, 0, h);
    landscape.addColorStop(0, state.trackId === 2 ? '#8b7c86' : '#596276');
    landscape.addColorStop(0.45, state.trackId === 2 ? '#605762' : '#353d4b');
    landscape.addColorStop(1, '#242d36');
    ctx.fillStyle = landscape; ctx.fillRect(0, horizon, w, h - horizon);
    this.#scenery(horizon, state.trackId, player.progress);
    const points: RoadPoint[] = [];
    let bend = 0, bendVelocity = 0;
    for (let i = 0; i < 100; i++) {
      const z = Math.max(1, i * segmentLength - modulo(cameraProgress, segmentLength) + segmentLength);
      const scale = projectScale(z);
      bendVelocity += curvature(track, cameraProgress + z) * 0.4; bend += bendVelocity;
      const half = roadHalfPixels * scale;
      points.push({ x: w / 2 - cameraSway - player.x / 6000 * half * 0.73 + bend * scale * w / 1400,
        y: horizon + projectionHeight * scale, half, scale, z, progress: cameraProgress + z });
    }
    const roadPointAt = (z: number): RoadPoint => {
      const index = Math.max(0, Math.min(points.length - 2, Math.floor((z - points[0]!.z) / segmentLength)));
      const a = points[index]!, b = points[index + 1]!, scale = projectScale(z);
      // Interpolate on the drawn road segment, including the moving first
      // sample's offset. Cars and solid objects must not jump sideways at 5 m.
      const along = (scale - a.scale) / (b.scale - a.scale);
      return { x: a.x + (b.x - a.x) * along, y: horizon + projectionHeight * scale,
        half: roadHalfPixels * scale, scale, z, progress: cameraProgress + z };
    };
    const asphalt = ctx.createLinearGradient(0, horizon, 0, h);
    asphalt.addColorStop(0, raining ? '#616b80' : '#646071');
    asphalt.addColorStop(0.35, raining ? '#3f495c' : '#41404c');
    asphalt.addColorStop(1, raining ? '#242e3d' : '#292b34');
    for (let i = points.length - 2; i >= 0; i--) {
      const p = points[i]!, q = points[i + 1]!, light = Math.floor(p.progress / segmentLength) % 2 === 0;
      // Small verge variation supplies motion without striping the entire landscape.
      const vergeWidth = p.half * 1.35, nextVergeWidth = q.half * 1.35;
      this.#quad(p.x - vergeWidth, p.y, p.x + vergeWidth, p.y, q.x + nextVergeWidth, q.y, q.x - nextVergeWidth, q.y, track.ground);
      this.#quad(p.x - p.half * 1.065, p.y, p.x + p.half * 1.065, p.y, q.x + q.half * 1.065, q.y, q.x - q.half * 1.065, q.y, light ? '#c6b9ad' : '#91434b');
      // Overlap adjacent asphalt samples by half a logical pixel. Subpixel
      // antialiasing otherwise lets the curb underpaint bleed through as rows.
      this.#quad(p.x - p.half, p.y + 0.5, p.x + p.half, p.y + 0.5, q.x + q.half, q.y - 0.5, q.x - q.half, q.y - 0.5, asphalt);
      if (raining) {
        for (const lane of [-0.72, 0.19, 0.66]) {
          const phase = Math.sin(Math.floor(p.progress / segmentLength) * 1.7 + lane * 9);
          const start = 0.28 + phase * 0.16, end = start + 0.11;
          const px = p.x + (q.x - p.x) * start, qx = p.x + (q.x - p.x) * end;
          const py = p.y + (q.y - p.y) * start, qy = p.y + (q.y - p.y) * end;
          const half = p.half + (q.half - p.half) * start, farHalf = p.half + (q.half - p.half) * end;
          const offset = lane + phase * 0.05, width = 0.07 + (phase + 1) * 0.025;
          ctx.globalAlpha = 0.22;
          this.#quad(px + half * offset, py, px + half * (offset + width), py, qx + farHalf * (offset + width), qy, qx + farHalf * offset, qy, '#a3b2c1');
          ctx.globalAlpha = 1;
        }
      }
      for (const direction of [-1, 1]) {
        this.#quad(p.x + direction * p.half * 0.95 - 1.1 * p.scale, p.y, p.x + direction * p.half * 0.95 + 1.1 * p.scale, p.y, q.x + direction * q.half * 0.95 + q.scale, q.y, q.x + direction * q.half * 0.95 - q.scale, q.y, '#e6dddf');
      }
      if (light) for (const lane of [-0.5, 0, 0.5]) {
        const thick = p.half * 0.007, thin = q.half * 0.007;
        this.#quad(p.x + p.half * lane - thick, p.y, p.x + p.half * lane + thick, p.y, q.x + q.half * lane + thin, q.y, q.x + q.half * lane - thin, q.y, '#bab4c2');
      }
      // Small patches of road aggregate are fixed in world space. Their optical
      // flow supplies near-field speed without blurring opponents or the apex.
      if (p.scale > 0.17) for (const lane of [-0.88, -0.66, -0.27, 0.23, 0.65, 0.87]) {
        const peripheral = Math.abs(lane) > 0.6;
        for (let grain = 0; grain < (peripheral ? 4 : 1); grain++) {
          const seed = Math.floor(p.progress / segmentLength) * 4 + grain;
          const z = p.z + segmentLength * (grain + 0.18 + modulo(seed * 0.17 + lane, 0.6)) / (peripheral ? 4 : 1);
          const point = roadPointAt(z), offset = lane + Math.sin(seed + lane) * 0.035;
          const x = point.x + point.half * offset, y = point.y;
          // A short shutter follows actual distance travelled, not elapsed
          // wall time. Only peripheral aggregate trails; cars and hazards stay sharp.
          const shutter = peripheral ? player.speed * 30 * 0.012 * motion : 0;
          const previous = roadPointAt(z + shutter);
          const tailX = previous.x + previous.half * offset, tailY = previous.y;
          ctx.strokeStyle = raining ? '#8194a3' : '#948a95';
          ctx.globalAlpha = peripheral ? 0.23 : 0.16;
          ctx.lineWidth = Math.max(0.45, point.scale * 1.6);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tailX, tailY + Math.max(0.5, point.scale)); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      const segment = Math.floor(p.progress / segmentLength);
      // Closely spaced curb reflectors give the eye a physical distance cue.
      // They use the same 5 m world grid at every speed, including standstill.
      if (p.scale > 0.12) for (const side of [-1, 1]) {
        const x = p.x + p.half * 1.075 * side;
        const postHeight = 32 * p.scale, postWidth = Math.max(1, 5 * p.scale);
        ctx.fillStyle = '#292d3e'; ctx.fillRect(Math.round(x), Math.round(p.y - postHeight), postWidth, postHeight);
        ctx.fillStyle = segment % 2 ? '#f8e2b3' : '#e96865';
        ctx.fillRect(Math.round(x), Math.round(p.y - postHeight), postWidth, Math.max(1, 9 * p.scale));
      }
      // Layered groves occupy the verge all the way to the vanishing point.
      // All their centres stay outside the native racing corridor.
      if (segment % 2 === 0 && p.scale > 0.028) for (const side of [-1, 1]) {
        const outer = state.trackId === 1 ? 2.5 : 1.9;
        const size = (180 + modulo(segment * 13, 80)) * p.scale;
        this.#tree(p.x + p.half * (outer + modulo(segment * 0.17, 0.7)) * side, p.y, size, state.trackId === 2, segment + side * 3);
      }
      if (segment % 3 === 0 && p.scale > 0.055) this.#roadside(p, segment, state.trackId);
      if (segment % 2 === 0 && p.scale > 0.09) this.#guardrail(p, state.trackId);
      const lapPosition = modulo(p.progress, track.length);
      if (lapPosition < segmentLength) this.#finishGate(p);
    }
    const shake = motion * (Math.sin(time * 39) * 0.7 + Math.sin(time * 73) * (boosting ? 1.1 : 0.35));
    const carX = w / 2 + player.x / 6000 * w * 0.075 + shake;
    const carY = carGround + shake;
    const carWidth = Math.min(w * (mobile ? 0.34 : 0.22), 185) * (1 - surge * 0.095);
    const visible = state.cars.filter(c => c.slot !== player.slot && !c.dnf).map(car => ({ car, z: car.progress - player.progress + cameraOffset })).filter(c => c.z > 1500 && c.z < 440000).sort((a, b) => b.z - a.z);
    const nameLabels: { text: string; x: number; y: number; size: number }[] = [];
    const sprites: { z: number; draw: () => void }[] = [];
    for (const object of environment.objects) {
      const z = object.progress - player.progress + cameraOffset;
      if (z < 500 || z > 480000) continue;
      const point = roadPointAt(z);
      sprites.push({ z, draw: () => this.#trackObject(point, object, state.trackId) });
    }
    for (const { car, z } of visible) {
      const point = roadPointAt(z), scale = point.scale;
      const x = point.x + car.x / 6000 * point.half;
      const y = point.y;
      const size = Math.max(8, carWidth * scale / projectScale(9000));
      sprites.push({ z, draw: () => this.drawCar(x, y, size, LIVERIES[options.skins[car.slot] ?? car.slot % 6]!, car.vx / 100, false, false, options.appearances?.[car.slot]) });
      if (!options.attract && scale > 0.13) {
        nameLabels.push({ text: options.names[car.slot] ?? `ドライバー ${car.slot + 1}`, x, y: y - size * 0.59 - 7, size: Math.max(7, 11 * scale + 3) });
      }
    }
    for (const sprite of sprites.sort((a, b) => b.z - a.z)) sprite.draw();
    const placed = [{ x: carX - carWidth * 0.53, y: carY - carWidth * 0.65, width: carWidth * 1.06, height: carWidth * 0.72 }];
    for (const label of nameLabels.reverse()) {
      ctx.font = `${label.size}px SoraJP, monospace`; const width = ctx.measureText(label.text).width;
      const box = { x: label.x - width / 2, y: label.y - label.size, width, height: label.size + 5 };
      if (box.x < 4 || box.x + box.width > w - 4) continue;
      if (placed.some(p => box.x < p.x + p.width + 4 && box.x + box.width + 4 > p.x && box.y < p.y + p.height && box.y + box.height > p.y)) continue;
      placed.push(box); ctx.textAlign = 'center'; ctx.fillStyle = '#faf5ed'; ctx.fillText(label.text, label.x, label.y);
    }
    if (player.speed > 200 && (Math.abs(player.x) > 6000 || drifting)) this.#smoke(carX, carY, carWidth, time);
    if (options.camera !== 'bumper') this.drawCar(carX, carY, carWidth, LIVERIES[options.skins[player.slot] ?? 0]!, player.vx / (drifting ? 4 : 15), !!((options.controls ?? 0) & 2), boosting, options.appearances?.[player.slot]);
    if (options.camera === 'bumper') {
      ctx.fillStyle = '#202233'; ctx.fillRect(w * 0.14, h - 19, w * 0.72, 19);
      ctx.fillStyle = '#b4b7bc'; ctx.fillRect(w * 0.17, h - 19, w * 0.66, 2);
      if (this.flag.complete && this.flag.naturalWidth) ctx.drawImage(this.flag, w / 2 - 14, h - 16, 28, 16);
    }
    if (raining && player.speed > 200) this.#spray(carX, carY, carWidth, time);
    if (motion > 0.4) this.#speedLines(player.progress, Math.min(1, (motion - 0.4) * 1.65 + surge * 0.3), horizon);
    this.#weather(state, time, environment);
    if (drifting && options.hud) this.#driftFeedback(carX, carY, carWidth, player.vx);
    if (options.hud && player.speed > 150) this.#cornerCue(track, player.progress, w < 400);
    // Quiet lens falloff frames the road without putting a screen texture over it.
    const vignette = ctx.createRadialGradient(w * 0.5, h * 0.43, h * 0.28, w * 0.5, h * 0.5, Math.max(w * 0.68, h * 0.72));
    vignette.addColorStop(0, '#10172300'); vignette.addColorStop(1, '#10172355');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
    if (options.hud) this.#hud(state, options);
    this.#countdown(options);
  }
  #countdown(options: RenderOptions): void {
    if (options.countdown !== undefined && options.countdown > -0.7) {
      const ctx = this.ctx, w = this.width, h = this.height;
      const label = options.countdown > 0 ? String(Math.ceil(options.countdown)) : '走れ!';
      ctx.textAlign = 'center'; ctx.font = 'italic 900 110px Sora, SoraJP, sans-serif'; ctx.fillStyle = '#f2f0e5';
      ctx.shadowColor = '#d31932'; ctx.shadowOffsetX = 6; ctx.shadowOffsetY = 6; ctx.fillText(label, w / 2, h * 0.53); ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
    }
  }
  #drawAerial(state: RaceState, options: RenderOptions): void {
    const ctx = this.ctx, w = this.width, h = this.height, track = TRACKS[state.trackId]!, player = state.cars[options.playerSlot]!;
    const half = Math.min(94, w * 0.21), step = 5000;
    const points: { progress: number; x: number; y: number }[] = [];
    const origin = Math.floor((player.progress - 95000) / step) * step;
    let bend = 0;
    ctx.fillStyle = track.ground; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 95; i++) {
      const progress = origin + i * step;
      bend += curvature(track, progress) * 0.48;
      points.push({ progress, x: w / 2 + bend, y: h * 0.77 - (progress - player.progress) / 380000 * h });
    }
    const center = (progress: number) => {
      const f = Math.max(0, Math.min(points.length - 1.001, (progress - origin) / step));
      const i = Math.floor(f), a = points[i]!, b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * (f - i), y: a.y + (b.y - a.y) * (f - i) };
    };
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!, b = points[i + 1]!, stripe = Math.floor(a.progress / step) % 2 === 0;
      this.#quad(a.x - half - 6, a.y, a.x + half + 6, a.y, b.x + half + 6, b.y, b.x - half - 6, b.y, stripe ? '#eee1cb' : '#cf3a52');
      this.#quad(a.x - half, a.y, a.x + half, a.y, b.x + half, b.y, b.x - half, b.y, '#454553');
      if (stripe) for (const lane of [-0.5, 0, 0.5]) { ctx.fillStyle = '#c0b7bb'; ctx.fillRect(a.x + half * lane, b.y, 1, a.y - b.y); }
      if (i % 9 === 0) for (const side of [-1, 1]) {
        this.#tree(a.x + side * (half + 39), a.y, 38, state.trackId === 2, i);
        ctx.fillStyle = '#b7384b'; ctx.fillRect(a.x + side * (half + 65), a.y - 45, 29, 22);
        if (this.flag.complete && this.flag.naturalWidth) ctx.drawImage(this.flag, a.x + side * (half + 65) + 5, a.y - 42, 18, 11);
      }
    }
    const env = options.environment ?? environmentAt(state.trackId, state.tick);
    for (const object of env.objects) {
      const z = object.progress - player.progress; if (z < -95000 || z > 350000) continue;
      const point = center(object.progress), x = point.x + object.x / 6000 * half;
      ctx.fillStyle = object.kind === 'oil' ? '#242437' : object.kind === 'tree' ? '#71958a' : '#ffe098';
      ctx.fillRect(Math.round(x - object.halfWidth / 6000 * half), Math.round(point.y - 3), Math.max(3, object.halfWidth / 3000 * half), object.kind === 'oil' ? 8 : 5);
    }
    for (const car of state.cars) {
      if (car.dnf || car.progress < player.progress - 90000 || car.progress > player.progress + 330000) continue;
      const point = center(car.progress), color = clubLivery(LIVERIES[options.skins[car.slot] ?? 0]!, options.appearances?.[car.slot]);
      ctx.save(); ctx.translate(Math.round(point.x + car.x / 6000 * half), Math.round(point.y));
      ctx.rotate(Math.max(-0.32, Math.min(0.32, car.vx / 500)));
      ctx.fillStyle = '#1e2333'; ctx.fillRect(-9, -16, 18, 32); ctx.fillStyle = color.color; ctx.fillRect(-7, -19, 14, 35);
      ctx.fillStyle = '#536578'; ctx.fillRect(-5, -10, 10, 8); ctx.fillStyle = '#292e45'; ctx.fillRect(-5, 6, 10, 5);
      ctx.fillStyle = '#ff5965'; ctx.fillRect(-6, 13, 4, 2); ctx.fillRect(2, 13, 4, 2);
      if (this.flag.complete && this.flag.naturalWidth) ctx.drawImage(this.flag, -5, -1, 10, 6);
      if (car.slot === player.slot) { ctx.strokeStyle = '#fff0ac'; ctx.strokeRect(-11, -22, 22, 42); }
      ctx.restore();
    }
    if (options.hud) this.#hud(state, options);
  }
  #backdropFor(trackId: number): CanvasImageSource {
    let tinted = this.#tintedBackdrops.get(trackId);
    if (!tinted) {
      // Fixed track palettes need one raster pass, rather than a full-image
      // Canvas filter on every frame (especially costly on software renderers).
      tinted = document.createElement('canvas');
      tinted.width = this.backdrop.naturalWidth; tinted.height = this.backdrop.naturalHeight;
      const ctx = tinted.getContext('2d', { alpha: false, willReadFrequently: true })!;
      ctx.filter = trackId === 0 ? 'saturate(0.52) brightness(0.72)' : trackId === 1 ? 'hue-rotate(-12deg) saturate(0.28) brightness(0.74)' : 'hue-rotate(32deg) saturate(0.48) brightness(0.94)';
      ctx.drawImage(this.backdrop, 0, 0);
      this.#tintedBackdrops.set(trackId, tinted);
    }
    return tinted;
  }
  #quad(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, color: string | CanvasGradient): void {
    const ctx = this.ctx; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath(); ctx.fill();
  }
  #scenery(horizon: number, track: number, progress: number): void {
    const ctx = this.ctx, w = this.width;
    // Coastal water, a distant harbor, and sakura groves make the routes recognizable.
    if (track !== 2) {
      const water = ctx.createLinearGradient(0, horizon, 0, horizon + 100);
      water.addColorStop(0, track === 1 ? '#647a88' : '#686778');
      water.addColorStop(0.75, track === 1 ? '#3d5561' : '#454b60');
      water.addColorStop(1, track === 1 ? '#3d556100' : '#454b6000');
      ctx.fillStyle = water; ctx.fillRect(0, horizon, w, 100);
      for (let i = 0; i < 25; i++) {
        const y = horizon + 3 + i * 3.5, x = modulo(i * 137 - progress / (13000 - i * 290), w);
        ctx.fillStyle = track === 1 ? '#668b9b' : '#726487'; ctx.fillRect(x, y, 4 + i * 1.3, 1);
      }
      if (track === 1) {
        for (let i = 0; i < 9; i++) {
          const x = modulo(i * 71 - progress / 29000, w), bh = 8 + i % 3 * 7;
          ctx.fillStyle = '#385261'; ctx.fillRect(x, horizon - bh, 28, bh);
          ctx.fillStyle = '#b9c5ab'; for (let j = 0; j < 3; j++) ctx.fillRect(x + 4 + j * 8, horizon - bh + 5, 3, 2);
        }
        for (const x of [w * 0.08, w * 0.88]) {
          ctx.fillStyle = '#536775'; ctx.fillRect(x, horizon - 50, 3, 51); ctx.fillRect(x - 18, horizon - 50, 52, 3);
          ctx.fillRect(x + 30, horizon - 48, 1, 18);
        }
      }
    }
    // Distant wooded ridges bridge the painted backdrop and moving roadside.
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = ['#687078', '#4e5d63', '#374d53'][layer]!;
      ctx.beginPath(); ctx.moveTo(0, horizon + 25 + layer * 14);
      for (let x = 0; x <= w + 16; x += 16) {
        const world = x + progress / (65000 - layer * 16000);
        const bank = Math.sin(world * 0.008 + layer * 2) * 9 + Math.sin(world * 0.033 + layer) * 2.5;
        ctx.lineTo(x, horizon + 12 + layer * 11 + bank);
      }
      ctx.lineTo(w, horizon + 55 + layer * 10); ctx.lineTo(0, horizon + 55 + layer * 10); ctx.closePath(); ctx.fill();
    }
  }
  #roadside(p: RoadPoint, index: number, track: number): void {
    const ctx = this.ctx, scale = p.scale, direction = index % 12 === 0 ? -1 : 1;
    const x = p.x + p.half * 1.25 * direction, size = 160 * scale;
    ctx.fillStyle = '#393041'; ctx.fillRect(x - 2 * scale, p.y - size, 4 * scale, size);
    if (index % 18 === 0) {
      const fw = size * 0.85, fh = fw * 0.6;
      if (this.flag.complete && this.flag.naturalWidth) ctx.drawImage(this.flag, x, p.y - size, fw, fh);
      ctx.fillStyle = '#eee5e3'; ctx.font = `${Math.max(3, 12 * scale)}px SoraJP, monospace`; ctx.textAlign = 'center';
      if (scale > 0.13) ctx.fillText('SORA CARS', x + fw / 2, p.y - size - 4);
    } else if (index % 12 === 0) {
      ctx.fillStyle = '#e6e1d3'; ctx.fillRect(x - size * 0.3, p.y - size, size * 0.6, size * 0.7);
      ctx.fillStyle = '#bb213c'; ctx.textAlign = 'center'; ctx.font = `bold ${Math.max(6, size * 0.19)}px sans-serif`;
      ctx.fillText(['走', '峠', '空'][Math.abs(index / 6) % 3]!, x, p.y - size * 0.69);
    } else {
      this.#tree(x, p.y, size * 1.25, track === 2, index);
      if (scale > 0.14) this.#tree(p.x - p.half * direction * 1.75, p.y, size * 1.5, track === 2, index + 1);
    }
    if (index % 6 === 3 && scale > 0.09) this.#streetBlock(p, index, track);
    else if (index % 12 === 0 && scale > 0.1) this.#shopfront(p.x - p.half * 1.7 * direction, p.y, size, track);
  }
  #streetBlock(p: RoadPoint, index: number, track: number): void {
    const side = index % 12 === 3 ? -1 : 1;
    drawIllustratedShop(this.ctx, p.x + p.half * 1.52 * side, p.y, p.scale * (track === 1 ? 235 : 185), index,
      this.flag.complete && this.flag.naturalWidth ? this.flag : null);
  }
  #tree(x: number, y: number, size: number, sakura: boolean, seed: number): void {
    drawIllustratedTree(this.ctx, x, y, size, sakura, seed, this.#reducedMotion.matches ? 0 : this.#time, this.#wind);
  }
  #trackObject(p: RoadPoint, object: { kind: 'tree' | 'sign' | 'oil'; id: number; x: number; halfWidth: number; halfLength: number }, track: number): void {
    const ctx = this.ctx, x = p.x + object.x / 6000 * p.half;
    const impact = this.#impacts.get(object.id), age = impact ? this.#time - impact.time : 2;
    ctx.save();
    if (age < 1) { ctx.translate(x, p.y); ctx.rotate(Math.sin(age * 36) * (1 - age) * 0.22); ctx.translate(-x, -p.y); }
    if (object.kind === 'oil') {
      const half = p.half * object.halfWidth / 6000;
      const depth = Math.max(2, object.halfLength / 43000 * p.scale * p.scale * (this.height * 0.595));
      const oil = ctx.createLinearGradient(x - half, p.y - depth, x + half, p.y + depth);
      oil.addColorStop(0, '#1c2639'); oil.addColorStop(0.4, '#384555'); oil.addColorStop(0.65, '#3e354d'); oil.addColorStop(1, '#182430');
      ctx.fillStyle = oil; ctx.beginPath(); ctx.ellipse(x, p.y, half, depth, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 5; i++) {
        const width = half * (0.5 + (i % 3) * 0.15);
        ctx.strokeStyle = ['#71617f88', '#355b6888', '#59527988', '#95837988', '#46657088'][i]!;
        ctx.lineWidth = Math.max(0.5, p.scale); ctx.beginPath();
        ctx.ellipse(x + Math.sin(object.id + i * 7) * half * 0.1, p.y, width, depth * (0.3 + i * 0.12), 0, 0.1, Math.PI * 1.5); ctx.stroke();
      }
    } else if (object.kind === 'tree') {
      this.#tree(x, p.y, p.half * 0.48, track === 2, object.id);
      // Reflective club trail marker distinguishes solid course objects from
      // the distant background grove. Its location comes from native rules.
      ctx.fillStyle = '#eee2a8'; ctx.fillRect(Math.round(x), Math.round(p.y - p.scale * 25), Math.max(1, p.scale * 4), Math.max(1, p.scale * 8));
    } else {
      const u = Math.max(1, Math.round(p.scale * 3));
      ctx.fillStyle = '#2b2938'; ctx.fillRect(Math.round(x - 9 * u), Math.round(p.y - u), 18 * u, 2 * u);
      ctx.fillStyle = '#7d8490'; ctx.fillRect(Math.round(x - u), Math.round(p.y - 23 * u), 2 * u, 23 * u);
      ctx.fillStyle = '#342e47'; ctx.fillRect(Math.round(x - 10 * u), Math.round(p.y - 28 * u), 20 * u, 13 * u);
      ctx.fillStyle = '#eed78e'; ctx.fillRect(Math.round(x - 9 * u), Math.round(p.y - 27 * u), 18 * u, 11 * u);
      ctx.fillStyle = '#963746';
      for (let i = 0; i < 3; i++) { ctx.fillRect(Math.round(x - 6 * u + i * 4 * u), Math.round(p.y - 24 * u), 2 * u, 5 * u); }
      if (p.scale > 0.15) {
        ctx.fillStyle = '#fff0d9'; ctx.textAlign = 'center'; ctx.font = `bold ${Math.max(5, 9 * p.scale)}px SoraJP, monospace`; ctx.fillText('SORA  徐行', x, p.y - 30 * u);
      }
    }
    ctx.restore();
    if (age < 0.9) for (let i = 0; i < 12; i++) {
      ctx.fillStyle = object.kind === 'tree' ? track === 2 ? '#f4bcd1' : '#9ba87b' : '#f6d18f';
      ctx.fillRect(Math.round(x + Math.sin(i * 17) * age * 140 * p.scale), Math.round(p.y - p.scale * 50 - age * 80 * p.scale + age * age * 100 + i % 3), Math.max(1, 4 * p.scale), Math.max(1, 2 * p.scale));
    }
  }
  #guardrail(p: RoadPoint, track: number): void {
    const ctx = this.ctx, s = p.scale;
    for (const side of [-1, 1]) {
      const x = p.x + p.half * 1.15 * side, width = Math.max(2, p.half * 0.22);
      ctx.fillStyle = track === 2 ? '#6b4c54' : '#667781'; ctx.fillRect(Math.round(x), Math.round(p.y - s * 37), Math.max(1, s * 4), s * 37);
      ctx.fillStyle = '#a8a9ae'; ctx.fillRect(Math.round(x - (side < 0 ? width : 0)), Math.round(p.y - s * 30), width, Math.max(1, s * 6));
      ctx.fillStyle = '#e7d8b9'; ctx.fillRect(Math.round(x), Math.round(p.y - s * 26), Math.max(1, s * 4), Math.max(1, s * 4));
    }
  }
  #shopfront(x: number, y: number, size: number, track: number): void {
    drawIllustratedShop(this.ctx, x, y, size * 0.85, track + 3, this.flag.complete && this.flag.naturalWidth ? this.flag : null);
  }
  #weather(state: RaceState, time: number, weather: Readonly<TrackEnvironment>): void {
    const ctx = this.ctx, w = this.width, h = this.height, rain = weather.rain > 0;
    // Atmospheric particles are presentation only; track traction and wind forces
    // are supplied by the native generated simulator, never this render clock.
    // Over a pixel-art frame the same particles become whole art cells in
    // palette colours, drawn in backing pixels; clean frames keep the strokes.
    const grid = pixelOverlayGrid(this.canvas), sx = grid ? grid.artWidth / w : 0, sy = grid ? grid.artHeight / h : 0;
    const pixel = PIXEL_OVERLAY_COLOURS;
    if (grid) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); }
    if (rain) {
      for (let i = 0; i < 150; i++) {
        const layer = 1 + i % 3, x = modulo(i * 137 + time * (weather.wind * 3 + layer * 15), w + 30) - 15, y = modulo(i * 71 + time * (140 + layer * 100), h);
        if (grid) {
          // The cutscenes draw rain as vertical dashed columns of single cells.
          ctx.fillStyle = pixel.rainBody[layer - 1]!;
          rainColumn(ctx, grid, x * sx, (y + layer * 6) * sy, Math.max(2, Math.round(layer * 6 * sy)), i, pixel.rainHead[layer - 1]);
          continue;
        }
        ctx.strokeStyle = layer === 3 ? 'rgba(189,220,239,.32)' : 'rgba(156,191,216,.17)';
        ctx.lineWidth = 0.5 + layer * 0.12; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x + layer * 2 * Math.sign(weather.wind), y + layer * 6); ctx.stroke();
      }
      for (let i = 0; i < 22; i++) {
        const phase = modulo(time * 3 + i * 0.43, 1), x = modulo(i * 67, w), y = h * 0.51 + modulo(i * 53, h * 0.44);
        if (phase >= 0.42) continue;
        if (grid) { ctx.fillStyle = pixel.splash; fillArtCells(ctx, grid, (x - phase * 7) * sx, y * sy, Math.max(1, Math.round((2 + phase * 14) * sx))); }
        else { ctx.fillStyle = 'rgba(182,211,224,.25)'; ctx.fillRect(Math.floor(x - phase * 7), Math.floor(y), 2 + Math.floor(phase * 14), 1); }
      }
    } else {
      for (let i = 0; i < 28; i++) {
        const x = Math.floor(modulo(i * 97 + time * (weather.wind * 2 + 8 + i % 7), w + 25) - 10), y = Math.floor(modulo(i * 73 + time * (15 + i % 9), h));
        const sakura = state.trackId === 2;
        if (grid) {
          // Petals are small stamped pink clusters, dust a single cell or two.
          ctx.fillStyle = sakura ? pixel.petals[i % 3]! : pixel.dust;
          fillArtCells(ctx, grid, x * sx, y * sy, sakura ? 2 : 1 + i % 2);
          if (sakura && i % 3 === 0) fillArtCells(ctx, grid, x * sx + 1, y * sy - 1);
          continue;
        }
        ctx.fillStyle = sakura ? ['#f8c9d9', '#e9aac4', '#fff0dc'][i % 3]! : '#b7b591';
        ctx.fillRect(x, y, 2 + i % 3, 1 + i % 2); if (sakura && i % 3 === 0) ctx.fillRect(x + 1, y - 1, 2, 1);
      }
    }
    if (grid) ctx.restore();
  }
  #spray(x: number, y: number, width: number, time: number): void {
    const ctx = this.ctx;
    for (let i = 0; i < 20; i++) {
      const f = modulo(time * 3 + i / 20, 1), side = i % 2 ? 1 : -1;
      ctx.fillStyle = `rgba(194,218,228,${(1 - f) * 0.4})`;
      ctx.fillRect(Math.round(x + side * (width * 0.39 + f * 25)), Math.round(y + f * 30), 2 + Math.floor(f * 7), 1 + Math.floor(f * 3));
    }
  }
  #finishGate(p: RoadPoint): void {
    const ctx = this.ctx, top = p.y - 350 * p.scale, span = p.half * 2.08;
    ctx.fillStyle = '#b91930'; ctx.fillRect(p.x - span / 2, top, span, 24 * p.scale);
    ctx.fillRect(p.x - span / 2, top, 9 * p.scale, p.y - top); ctx.fillRect(p.x + span / 2 - 9 * p.scale, top, 9 * p.scale, p.y - top);
    ctx.fillStyle = '#fff5ec'; ctx.font = `900 ${Math.max(4, 18 * p.scale)}px Sora, SoraJP, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('SORA   天   CARS', p.x, top + 18 * p.scale);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#eee6e1' : '#24212c'; ctx.fillRect(p.x - p.half + i * p.half / 8, p.y - j * 8 * p.scale, p.half / 8 + 1, 8 * p.scale);
    }
  }
  drawCar(x: number, y: number, width: number, color: Livery, lean = 0, braking = false, boost = false, appearance?: ClubAppearance): void {
    color = clubLivery(color, appearance);
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.scale(width / 100, width / 100);
    const yaw = Math.max(-0.22, Math.min(0.22, lean / 120));
    // A detailed, coachbuilt 1986 coupe in the same cool-shadow / warm-light
    // palette as the story artwork. Silhouette still uses the existing anchor.
    const gradient = (top: number, bottom: number, colors: string[]) => {
      const g = ctx.createLinearGradient(-30, top, 24, bottom);
      colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c)); return g;
    };
    const shape = (points: number[][], fill: string | CanvasGradient, stroke?: string) => {
      ctx.beginPath(); points.forEach(([px, py], i) => i ? ctx.lineTo(px!, py!) : ctx.moveTo(px!, py!)); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.45; ctx.stroke(); }
    };
    const box = (px: number, py: number, w: number, h: number, fill: string | CanvasGradient) => { ctx.fillStyle = fill; ctx.fillRect(px, py, w, h); };
    const shadow = ctx.createRadialGradient(0, 1, 9, 0, 1, 55);
    shadow.addColorStop(0, '#0c101ddd'); shadow.addColorStop(1, '#0c101d00');
    ctx.save(); ctx.scale(1, 0.24); ctx.fillStyle = shadow; ctx.beginPath(); ctx.arc(0, 4, 55, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.rotate(yaw); ctx.transform(1 - Math.abs(yaw) * 0.12, 0, yaw * 0.5, 1, 0, 0);
    // Rounded tyre shoulders, sidewalls and narrow alloy rims remain legible at speed.
    for (const side of [-1, 1]) {
      ctx.fillStyle = gradient(-22, 5, ['#111923', '#262a31', '#0e131b']);
      ctx.beginPath(); ctx.roundRect(side * 38 - 6, -24, 12, 27, 3); ctx.fill();
      box(side * 42 - 0.8, -16, 1.6, 13, '#74747c');
      for (let tread = 0; tread < 5; tread++) box(side * 38 - 4, -4 + tread * 1.1, 8, 0.3, '#41414a');
    }
    shape([[-47,-9],[-46,-29],[-39,-37],[39,-37],[46,-29],[47,-9],[40,-4],[-40,-4]], gradient(-35,0,[color.light,color.color,color.dark,'#343747']), '#232b3b');
    // Rear quarter panels taper into the hatch, rather than a stack of boxes.
    shape([[-44,-28],[-37,-42],[-27,-59],[26,-59],[37,-42],[44,-28]], gradient(-60,-27,[color.light,color.color,color.dark]), '#393c49');
    shape([[-35,-36],[-25,-56],[24,-56],[35,-36]], '#1b2636', '#a5a7af');
    shape([[-31,-37],[-23,-54],[22,-54],[31,-37]], gradient(-55,-36,['#a1aaba','#536077','#253449']), '#243043');
    // Soft sky reflection, window heater wires and a rear wiper add material scale.
    ctx.globalAlpha = 0.38;
    shape([[-23,-53],[17,-53],[-4,-39],[-30,-39]], '#acb7c1');
    ctx.globalAlpha = 1;
    for (let line = 0; line < 5; line++) {
      const yy = -50 + line * 2.5, half = 23 + line * 1.3;
      box(-half, yy, half * 2, 0.3, '#cbb6a15c');
    }
    ctx.strokeStyle = '#18222f'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-3,-37); ctx.lineTo(13,-43); ctx.stroke();
    shape([[-27,-59],[26,-59],[30,-56],[-30,-56]], gradient(-60,-55,[color.light,color.color]));
    shape([[-41,-34],[41,-34],[45,-27],[-45,-27]], gradient(-35,-27,[color.light,color.color]), '#5e5b66');
    // Sculpted rear panel with a recessed, continuous lamp housing.
    shape([[-45,-27],[45,-27],[44,-11],[-44,-11]], gradient(-28,-10,[color.color,color.dark]), '#555564');
    box(-42,-24.5,84,11,gradient(-25,-13,['#19232c','#34343b','#151d29']));
    const skin = clubItem(appearance?.skin);
    if (skin) {
      box(-42,-28,84,1.7,skin.accent);
      for (let i = 0; i < 5; i++) box(-19+i*8,-32,4,1.2,skin.accent);
    }
    for (const side of [-1,1]) {
      const left = side < 0 ? -40 : 16;
      box(left,-23,24,7.5,gradient(-23,-15,braking ? ['#ffdfb2','#ff7668','#b33142'] : ['#ed8a7a','#b73547','#74273a']));
      box(side < 0 ? left : left + 18,-23,6,7.5,gradient(-23,-15,['#ffd8a0','#b86b50']));
      box(side < 0 ? left + 17 : left+3,-22,4,4,'#efdebe');
      for (let line = 0; line < 4; line++) box(left,-22+line*1.55,24,0.35,'#391d3260');
      box(left+11,-23,0.6,7.5,'#222b3c');
      if (braking) {
        const glow = ctx.createRadialGradient(left+12,-19,2,left+12,-19,18);
        glow.addColorStop(0,'#ff6b4d66'); glow.addColorStop(1,'#ff6b4d00');
        ctx.fillStyle=glow;ctx.fillRect(left-6,-37,36,36);
      }
    }
    box(-45,-12,90,6,gradient(-12,-6,['#727079','#282e3a','#171f2c']));
    box(-43,-11,86,0.8,'#aeb3b7');
    box(-9,-13,18,7,'#ded7bd'); box(-8.5,-12.5,17,6,'#eee7cf');
    ctx.fillStyle='#3e4846';ctx.font='2.8px sans-serif';ctx.textAlign='center';ctx.fillText('湘南  86',0,-10);ctx.font='bold 3.4px sans-serif';ctx.fillText('19-86',0,-6.8);
    box(-13,-22.5,26,7,'#252c37');
    if (this.flag.complete && this.flag.naturalWidth) ctx.drawImage(this.flag,-4.8,-22,9.6,5.8);
    ctx.fillStyle='#ddcfaf';ctx.font='2.4px sans-serif';ctx.textAlign='left';ctx.fillText('SORA',-11,-18);ctx.textAlign='right';ctx.fillText('TWIN CAM',39,-29);
    // Thin lip spoiler and hardware, retaining the entitled aero silhouette.
    box(-36,-34,2.3,5,'#272e3b');box(33.7,-34,2.3,5,'#272e3b');
    shape([[-45,-35],[45,-35],[46,-32],[-46,-32]],gradient(-35,-31,[color.light,color.dark]),'#3a3c49');
    if (appearance?.upgrade === 'club-aero-86') {
      box(-39,-42,2.5,10,'#273040');box(36.5,-42,2.5,10,'#273040');
      shape([[-51,-44],[51,-44],[51,-40],[-51,-40]],gradient(-44,-40,['#efe3ce','#bb4553']),'#292e3b');
    }
    for (const tx of [-31,31]) {
      ctx.fillStyle='#adb4b8';ctx.beginPath();ctx.ellipse(tx,-5.5,3.3,2,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#131b26';ctx.beginPath();ctx.ellipse(tx,-5.5,2.4,1.35,0,0,Math.PI*2);ctx.fill();
      if (boost) {
        const flame = 10 + Math.sin(this.#time*90)*3;
        shape([[tx-2.8,-5],[tx+2.8,-5],[tx+1.1,flame*.7],[tx,flame],[tx-1.3,flame*.6]],gradient(-5,flame,[appearance?.upgrade==='club-neon-pulse'?'#f39ddd':'#72d5ef','#cceefa88','#cceefa00']));
        shape([[tx-1.3,-5],[tx+1.3,-5],[tx,flame*.55]],'#fff1ce');
      }
    }
    // Highlights follow the body contours, leaving the glass dark and readable.
    ctx.strokeStyle='#fff0d1aa';ctx.lineWidth=0.55;ctx.beginPath();ctx.moveTo(-43,-28);ctx.lineTo(-35,-42);ctx.lineTo(-26,-58);ctx.lineTo(25,-58);ctx.stroke();
    ctx.restore();
  }
  drawShowroom(carId: number, time: number, appearance?: ClubAppearance): void {
    this.#prepareCanvas();
    const ctx = this.ctx, w = this.width, h = this.height, c = clubLivery(LIVERIES[carId]!, appearance);
    ctx.fillStyle = '#e6ded3'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d4c9be'; ctx.lineWidth = 1;
    for (let i = -w; i < w * 2; i += 50) { ctx.beginPath(); ctx.moveTo(i, h * 0.48); ctx.lineTo(w / 2 + (i - w / 2) * 3, h); ctx.stroke(); }
    for (let y = h * 0.5; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = '#dbcfca'; ctx.font = `900 ${Math.min(w * 0.35, h * 0.65)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(LIVERIES[carId]!.japanese, w * 0.61, h * 0.65);
    ctx.save(); ctx.translate(w * (w < 600 ? 0.59 : 0.70), h * (w < 600 ? 0.79 : 0.72) + Math.sin(time * 1.8)); const s = Math.min(w * 0.0021, h * 0.006); ctx.scale(s, s);
    ctx.fillStyle = '#ad9e9b'; ctx.fillRect(-115, 6, 237, 7);
    for (const wx of [-73, 76]) {
      ctx.fillStyle = '#22202a'; ctx.fillRect(wx - 18, -20, 36, 35); ctx.fillRect(wx - 13, -25, 26, 45);
      ctx.fillStyle = '#bec0c4'; ctx.fillRect(wx - 11, -14, 22, 24);
      ctx.save(); ctx.translate(wx, -2); ctx.rotate(time * 0.15);
      ctx.strokeStyle = '#494754'; ctx.lineWidth = 2;
      for (let spoke = 0; spoke < 6; spoke++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke(); }
      ctx.restore();
    }
    this.#quad(-119, -14, 122, -14, 118, -38, -108, -45, c.color);
    this.#quad(-80, -42, 65, -42, 24, -74, -43, -74, c.color);
    this.#quad(-68, -45, 52, -45, 21, -68, -40, -68, '#283440');
    ctx.fillStyle = '#d8d4d1'; ctx.fillRect(-109, -40, 38, 3); ctx.fillRect(58, -39, 57, 3);
    ctx.fillStyle = c.dark; ctx.fillRect(-119, -16, 242, 6); ctx.fillRect(-33, -44, 2, 29); ctx.fillRect(47, -39, 2, 24);
    ctx.fillStyle = c.light; ctx.fillRect(-63, -42, 103, 2); ctx.fillRect(103, -36, 17, 6);
    ctx.fillStyle = '#eb3037'; ctx.fillRect(-118, -37, 8, 10);
    const skin = clubItem(appearance?.skin);
    if (skin) { ctx.fillStyle = skin.accent; ctx.fillRect(-117, -23, 234, 4); for (let i = 0; i < 6; i++) ctx.fillRect(-60 + i * 15, -31, 7, 3); }
    if (this.flag.complete && this.flag.naturalWidth) ctx.drawImage(this.flag, -11, -38, 32, 19);
    ctx.fillStyle = '#504857'; ctx.fillRect(-27, -36, 10, 2);
    ctx.fillStyle = c.dark; ctx.fillRect(-116, -50, 38, 4); ctx.fillRect(-109, -47, 3, 8);
    if (appearance?.upgrade === 'club-aero-86') { ctx.fillStyle = '#373043'; ctx.fillRect(-107, -59, 4, 17); ctx.fillStyle = '#e63445'; ctx.fillRect(-127, -63, 60, 5); }
    ctx.restore();
  }
  #smoke(x: number, y: number, size: number, time: number): void {
    const ctx = this.ctx;
    for (let i = 0; i < 6; i++) {
      const f = (time * 2 + i / 6) % 1, radius = 5 + f * 19;
      const cx = x + (i % 2 ? 1 : -1) * (size * 0.38 + f * 36), cy = y + f * 20;
      const smoke = ctx.createRadialGradient(cx,cy,0,cx,cy,radius);
      smoke.addColorStop(0, '#d0cadb66'); smoke.addColorStop(1, '#d0cadb00');
      ctx.globalAlpha = 1 - f; ctx.fillStyle = smoke; ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);
    }
    ctx.globalAlpha = 1;
  }
  #speedLines(progress: number, intensity: number, horizon: number): void {
    const ctx = this.ctx;
    // Fine peripheral shutter streaks follow distance travelled, so stopping
    // freezes them. The central road and approaching cars stay unobstructed.
    const vanishX = this.width / 2, vanishY = horizon;
    ctx.lineWidth = 0.65;
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1, phase = modulo(progress / 28000 + i * 0.381966, 1);
      const depth = phase * phase, spread = this.width * (0.39 + depth * 0.35);
      const endX = vanishX + side * spread;
      const endY = vanishY + (i % 7 + 1) * 0.2 * (this.height - vanishY) * (0.42 + depth * 0.72);
      const length = (0.025 + depth * 0.16) * intensity;
      ctx.strokeStyle = `rgba(221,226,237,${Math.sin(phase * Math.PI) * (0.08 + depth * 0.22) * intensity})`;
      ctx.beginPath();ctx.moveTo(endX,endY);ctx.lineTo(endX-(endX-vanishX)*length,endY-(endY-vanishY)*length);ctx.stroke();
    }
  }

  #driftFeedback(x: number, y: number, width: number, vx: number): void {
    const ctx = this.ctx, direction = Math.sign(vx);
    ctx.fillStyle = '#262333';
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      ctx.fillRect(Math.round(x + side * width * 0.35 - direction * i * 6), Math.round(y + i * 6), 3, 5);
    }
    const compact = this.width < 500;
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffe29b'; ctx.font = `bold ${compact ? 10 : 14}px SoraJP, monospace`;
    ctx.fillText('横滑り / DRIFT', x, y - width * 0.7);
    ctx.font = `${compact ? 7 : 9}px SoraJP, monospace`; ctx.fillStyle = '#fff4d8';
    ctx.fillText('旋回力 ↑ · 滑りを操る / CONTROL THE SLIDE', x, y - width * 0.7 + 14);
  }
  #cornerCue(track: (typeof TRACKS)[number], progress: number, compact: boolean): void {
    const current = curvature(track, progress), upcoming = curvature(track, progress + 95000);
    const turn = Math.abs(upcoming) > Math.abs(current) ? upcoming : current;
    if (Math.abs(turn) < 2) return;
    const ctx = this.ctx, x = this.width / 2, y = compact ? 151 : 97;
    ctx.fillStyle = Math.abs(turn) >= 3 ? '#ffac8b' : '#ffe4a1'; ctx.textAlign = 'center';
    ctx.font = `bold ${compact ? 17 : 24}px SoraJP, monospace`;
    ctx.fillText(turn > 0 ? '›› 右カーブ' : '左カーブ ‹‹', x, y);
    ctx.font = `${compact ? 7 : 10}px SoraJP, monospace`;
    ctx.fillText(Math.abs(turn) >= 3 ? '減速 → ドリフト / BRAKE → DRIFT' : '進入ラインを整える / SET YOUR LINE', x, y + 15);
  }
  #hud(state: RaceState, options: RenderOptions): void {
    const ctx = this.ctx, w = this.width, h = this.height, car = state.cars[options.playerSlot]!, rank = raceResultPlaces(state).get(car.slot)!;
    const mobile = w < 400, pad = mobile ? 13 : w < 600 ? 20 : 35;
    ctx.save(); ctx.shadowColor = 'rgba(12,16,28,.8)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1;
    ctx.textAlign = 'left'; ctx.fillStyle = '#f8f4eb'; ctx.font = `900 italic ${mobile ? 34 : 58}px Sora, SoraJP, sans-serif`; ctx.fillText(String(rank).padStart(2, '0'), pad, mobile ? 60 : 88);
    ctx.font = `${mobile ? 7 : 12}px SoraJP, monospace`; ctx.fillStyle = '#d9d1df'; ctx.fillText(`/ ${state.cars.length}${mobile ? '' : '  順位 / POS'}`, pad + (mobile ? 55 : 100), mobile ? 56 : 83);
    ctx.font = `${mobile ? 7 : 11}px SoraJP, monospace`; ctx.fillText(options.raceMode ?? 'PRACTICE', pad, mobile ? 22 : 32);
    const lap = Math.min(3, Math.floor(Math.max(0, car.progress) / TRACKS[state.trackId]!.length) + 1);
    const lapX = mobile ? w * 0.64 : w / 2, hudBottom = mobile ? 108 : h - 48;
    ctx.textAlign = 'center'; ctx.font = `900 ${mobile ? 12 : 18}px Sora, SoraJP, sans-serif`; ctx.fillStyle = '#faf4ee'; ctx.fillText(`${lap} / 3 周 · LAP`, lapX, mobile ? 43 : 34);
    ctx.font = `${mobile ? 8 : 13}px SoraJP, monospace`; ctx.fillText(formatTime(state.tick), lapX, mobile ? 60 : 58);
    ctx.textAlign = 'right'; ctx.font = `900 italic ${mobile ? 30 : 54}px Sora, SoraJP, sans-serif`; ctx.fillText(String(Math.round(car.speed * 0.108)).padStart(3, '0'), w - pad, hudBottom);
    ctx.font = `${mobile ? 7 : 11}px SoraJP, monospace`; ctx.fillText('KM/H', w - pad, hudBottom + (mobile ? 13 : 20));
    ctx.textAlign = 'left'; ctx.font = `${mobile ? 7 : 10}px SoraJP, monospace`; ctx.fillText('ブースト / BOOST', pad, hudBottom - 18);
    ctx.fillStyle = '#2b2136'; ctx.fillRect(pad, hudBottom - 4, Math.min(w * 0.26, 180), 7);
    ctx.fillStyle = '#ede0a4'; ctx.fillRect(pad, hudBottom - 4, Math.min(w * 0.26, 180) * car.energy / 1000, 7);
    if (!mobile) { ctx.fillStyle = '#d1c8d4'; ctx.font = '10px SoraJP, monospace'; ctx.fillText(w < 600 ? 'ターボ' : 'SHIFT / X  ·  ターボ / TURBO', pad, hudBottom + 19); }
    // Driving model: the car's damage by zone, and the wreck banner.
    if (car.zones && car.damage !== undefined) {
      const [front, rear, left, right] = car.zones;
      drawDamageGauge(ctx, pad, hudBottom - (mobile ? 34 : 44), { front, rear, left, right, total: car.damage }, this.#time, mobile);
      if (car.dnf) drawWreckBanner(ctx, w, h);
    }
    // Progress ribbon provides a compact live view of the entire grid.
    const mapX = w - pad - (mobile ? 30 : 85), mapY = mobile ? 144 : 39, mapH = mobile ? 60 : 100;
    // A dark keyline under the light stroke and a dark ring around each dot
    // keep the map legible over bright sunrise skies and pale clouds.
    ctx.beginPath();
    ctx.moveTo(mapX + 20, mapY + mapH); ctx.bezierCurveTo(mapX - 32, mapY + 70, mapX + 86, mapY + 30, mapX + 20, mapY);
    ctx.strokeStyle = 'rgba(20,14,30,.55)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = 'rgba(246,238,251,.35)'; ctx.lineWidth = 2; ctx.stroke();
    for (const other of state.cars) {
      const t = Math.min(1, Math.max(0, modulo(other.progress, TRACKS[state.trackId]!.length) / TRACKS[state.trackId]!.length));
      const mx = mapX + 20 + Math.sin(t * Math.PI * 2) * 15, my = mapY + mapH * (1 - t);
      const s = other.slot === car.slot ? 5 : 3;
      ctx.fillStyle = '#1c1625'; ctx.fillRect(mx - s / 2 - 1, my - s / 2 - 1, s + 2, s + 2);
      ctx.fillStyle = other.slot === car.slot ? '#fff8dd' : LIVERIES[options.skins[other.slot] ?? other.slot % 6]!.color;
      ctx.fillRect(mx - s / 2, my - s / 2, s, s);
    }
    ctx.restore();
  }
}
export function formatTime(ticks: number): string {
  const seconds = ticks / 30; return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}.${Math.floor(seconds * 100 % 100).toString().padStart(2, '0')}`;
}
