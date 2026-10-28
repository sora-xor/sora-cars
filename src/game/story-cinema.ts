import { STORY_ANGLE_ART, type StoryFrame } from './story-scenes';

const mod = (x: number, n: number) => ((x % n) + n) % n;

/** Local cinematic presentation. Time animates the art, never story progression. */
export class StoryCinema {
  readonly #ctx: CanvasRenderingContext2D;
  readonly #images = new Map<string, HTMLImageElement>();
  #frame: StoryFrame = { scene: 'garage', shot: 'wide', art: STORY_ANGLE_ART.garage.wide };
  #clock = 0;
  #last: number | null = null;
  #ready = false;
  #initialized = false;
  constructor(readonly canvas: HTMLCanvasElement, frames: readonly StoryFrame[]) {
    this.#ctx = canvas.getContext('2d', { alpha: false })!;
    // Load the opening and look ahead a few dialogue lines, rather than downloading the campaign.
    this.preload(frames.slice(0, 5));
  }
  preload(frames: readonly StoryFrame[]): void { for (const frame of frames) this.#image(frame.art); }
  #image(art: string): HTMLImageElement {
    let image = this.#images.get(art);
    if (!image) {
      image = new Image(); image.decoding = 'async';
      image.src = `${import.meta.env.BASE_URL}assets/story/${art}`;
      this.#images.set(art, image);
    }
    return image;
  }
  get state() { return { ...this.#frame, animationTime: Math.round(this.#clock * 1000), ready: this.#ready }; }
  set(frame: StoryFrame): void {
    const image = this.#image(frame.art);
    if (this.#initialized && frame.art === this.#frame.art && frame.shot === this.#frame.shot && frame.scene === this.#frame.scene) return;
    this.#initialized = true; this.#frame = frame;
    this.#ready = image.complete && image.naturalWidth > 0;
  }
  draw(time: number, still: boolean, paused: boolean): void {
    if (!still && !paused && this.#last !== null) this.#clock += Math.max(0, time - this.#last);
    this.#last = time;
    const rect = this.canvas.getBoundingClientRect(), h = 540;
    const w = Math.max(240, Math.round(h * rect.width / Math.max(1, rect.height)));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const ctx = this.#ctx; ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#100e1d'; ctx.fillRect(0, 0, w, h);
    const image = this.#image(this.#frame.art);
    this.#ready = image.complete && image.naturalWidth > 0;
    // A cut never shows the previous scene under the new dialogue while artwork loads.
    if (this.#ready) this.#paint(this.#frame, w, h, still);
  }
  #paint(frame: StoryFrame, w: number, h: number, still: boolean): void {
    const image = this.#image(frame.art);
    if (!image.complete || !image.naturalWidth) return;
    const ctx = this.#ctx, time = still ? 0 : this.#clock;
    // Each illustration already supplies its camera angle. Preserve the whole frame
    // and move only inside the unused letterbox space, never across a canvas edge.
    const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
    const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale;
    const marginX = (w - iw) / 2, marginY = (h - ih) / 2;
    const x = marginX + (still ? 0 : Math.sin(time * .17) * Math.min(2, marginX));
    const y = marginY + (still ? 0 : Math.sin(time * .13) * Math.min(1, marginY));
    ctx.save();
    ctx.translate(x, y); ctx.scale(iw / 1680, ih / 945);
    ctx.drawImage(image, 0, 0, 1680, 945);
    if (!still) this.#effects(frame, time);
    ctx.restore();
  }
  #effects(frame: StoryFrame, time: number): void {
    const ctx = this.#ctx;
    // Old reel, needle, steam and window masks were painted for the old backgrounds.
    // New compositions only use atmosphere that does not assume a prop's position.
    if (frame.beat?.includes('blackout') || frame.beat === 'radio-betrayal') return;
    if (frame.scene === 'harbor' && frame.shot === 'wide') {
      for (let i = 0; i < 55; i++) {
        const x = Math.round(mod(i * 137 - time * 13, 1680)), y = Math.round(mod(i * 73 + time * (75 + i % 3 * 22), 945));
        ctx.fillStyle = '#a8bbdd22'; ctx.fillRect(x, y, 1, 6 + i % 5);
      }
    } else if (frame.scene === 'garage' || frame.scene === 'ledger') {
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = `rgba(255,221,168,${.09 + Math.sin(time + i) * .05})`;
        ctx.fillRect(Math.round(mod(i * 107 + time * 7, 1680)), Math.round(mod(i * 59 - time * 9, 945)), 2, 2);
      }
    }
  }
}
