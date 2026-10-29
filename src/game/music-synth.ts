import type { MusicFx, SynthPatch } from './music-composer';

/** Early-1980s analog/FM palette for the original score: detuned polysynth pads,
 * filter-swept basses, FM electric piano and bells, and a drum machine kit.
 * Everything is synthesized locally; no sampled instruments or recordings. */
type Wave = OscillatorType | 'pulse25' | 'pulse12';
interface Envelope { attack: number; decay: number; sustain: number; release: number; }
interface PatchSpec {
  osc: readonly { wave: Wave; detune?: number; octave?: number; gain: number }[];
  /** Sine modulator on every carrier: ratio to the note, index in multiples of the note frequency. */
  fm?: { ratio: number; index: number; decay: number; sustain: number; carriers?: number };
  /** Electric-piano tine: a second, quickly fading high-ratio FM pair. */
  tine?: { ratio: number; index: number; decay: number; gain: number };
  filter?: { type: BiquadFilterType; cutoff: number; keytrack: number; q: number; env: number; attack: number; decay: number; sustain: number; poles: 1 | 2 };
  formants?: readonly (readonly [frequency: number, q: number, gain: number])[];
  amp: Envelope; vibrato?: { rate: number; depth: number; delay: number };
  scoop?: number; drift?: number; drive?: number; gain: number;
  sends: MusicFx;
}
const PATCHES: Record<SynthPatch, PatchSpec> = {
  'round-bass': { osc: [{ wave: 'sawtooth', gain: .55 }, { wave: 'square', detune: -4, gain: .32 }],
    filter: { type: 'lowpass', cutoff: 210, keytrack: .5, q: 3.5, env: 2.3, attack: .002, decay: .2, sustain: .25, poles: 2 },
    amp: { attack: .003, decay: .3, sustain: .72, release: .07 }, drive: 1.6, drift: 3, gain: .42, sends: { reverb: .02, delay: 0, chorus: 0 } },
  'rubber-bass': { osc: [{ wave: 'square', gain: .65 }, { wave: 'sawtooth', detune: 7, gain: .35 }],
    filter: { type: 'lowpass', cutoff: 150, keytrack: .4, q: 8, env: 3.1, attack: .002, decay: .13, sustain: .12, poles: 1 },
    amp: { attack: .002, decay: .2, sustain: .55, release: .05 }, drive: 1.3, drift: 3, gain: .46, sends: { reverb: .03, delay: 0, chorus: .05 } },
  'moog-bass': { osc: [{ wave: 'sawtooth', detune: -5, gain: .45 }, { wave: 'sawtooth', detune: 5, gain: .45 }, { wave: 'square', gain: .3 }],
    filter: { type: 'lowpass', cutoff: 270, keytrack: .45, q: 2.6, env: 2.1, attack: .002, decay: .26, sustain: .3, poles: 2 },
    amp: { attack: .002, decay: .4, sustain: .78, release: .08 }, drive: 2.1, drift: 2, gain: .36, sends: { reverb: .02, delay: 0, chorus: 0 } },
  'fm-bass': { osc: [{ wave: 'sine', gain: .85 }, { wave: 'sine', gain: .35 }], fm: { ratio: 1, index: 3.4, decay: .1, sustain: .35, carriers: 1 },
    amp: { attack: .002, decay: .38, sustain: .55, release: .06 }, drive: 1.2, gain: .5, sends: { reverb: .03, delay: 0, chorus: .1 } },
  pulse: { osc: [{ wave: 'square', gain: .7 }, { wave: 'pulse25', octave: 1, gain: .16 }],
    filter: { type: 'lowpass', cutoff: 2300, keytrack: .6, q: 1.1, env: 1, attack: .004, decay: .3, sustain: .6, poles: 1 },
    amp: { attack: .006, decay: .3, sustain: .82, release: .14 }, vibrato: { rate: 5.6, depth: 13, delay: .26 }, drift: 2, gain: .28, sends: { reverb: .26, delay: .28, chorus: .18 } },
  'sync-lead': { osc: [{ wave: 'sawtooth', detune: -8, gain: .5 }, { wave: 'sawtooth', detune: 8, gain: .5 }, { wave: 'square', octave: 1, gain: .16 }],
    filter: { type: 'lowpass', cutoff: 1500, keytrack: .7, q: 5, env: 2, attack: .005, decay: .32, sustain: .45, poles: 1 },
    amp: { attack: .005, decay: .2, sustain: .86, release: .16 }, vibrato: { rate: 5.2, depth: 10, delay: .32 }, scoop: 28, drift: 3, gain: .42, sends: { reverb: .24, delay: .3, chorus: .22 } },
  'fm-reed': { osc: [{ wave: 'sine', gain: .8 }, { wave: 'triangle', gain: .18 }], fm: { ratio: 1, index: 2.1, decay: .45, sustain: .62 },
    filter: { type: 'lowpass', cutoff: 3400, keytrack: .3, q: .7, env: .4, attack: .04, decay: .3, sustain: .8, poles: 1 },
    amp: { attack: .035, decay: .25, sustain: .86, release: .16 }, vibrato: { rate: 5, depth: 17, delay: .3 }, scoop: 38, drift: 2, gain: .245, sends: { reverb: .3, delay: .2, chorus: .12 } },
  whistle: { osc: [{ wave: 'sine', gain: .9 }, { wave: 'triangle', octave: 1, gain: .08 }],
    amp: { attack: .025, decay: .12, sustain: .9, release: .2 }, vibrato: { rate: 5.8, depth: 19, delay: .22 }, scoop: 24, gain: .245, sends: { reverb: .34, delay: .26, chorus: .14 } },
  vocoder: { osc: [{ wave: 'sawtooth', detune: -6, gain: .55 }, { wave: 'pulse25', detune: 6, gain: .45 }],
    formants: [[700, 7, 1], [1220, 8, .6], [2600, 9, .32], [3500, 10, .16]],
    amp: { attack: .03, decay: .2, sustain: .9, release: .18 }, vibrato: { rate: 4.6, depth: 9, delay: .35 }, drift: 2, gain: 2.2, sends: { reverb: .32, delay: .22, chorus: .35 } },
  'fm-bell': { osc: [{ wave: 'sine', gain: .9 }, { wave: 'sine', octave: 2, gain: .1 }], fm: { ratio: 3.5, index: 2.8, decay: .55, sustain: .04 },
    amp: { attack: .002, decay: 1.1, sustain: 0, release: .45 }, gain: .25, sends: { reverb: .38, delay: .32, chorus: .18 } },
  glass: { osc: [{ wave: 'sine', gain: .8 }, { wave: 'sine', octave: 1, detune: 6, gain: .22 }], fm: { ratio: 3.01, index: 1.7, decay: .8, sustain: .18 },
    amp: { attack: .004, decay: 1.5, sustain: .08, release: .6 }, gain: .25, sends: { reverb: .42, delay: .34, chorus: .25 } },
  pluck: { osc: [{ wave: 'sawtooth', detune: -4, gain: .5 }, { wave: 'sawtooth', detune: 4, gain: .5 }],
    filter: { type: 'lowpass', cutoff: 420, keytrack: .8, q: 3, env: 3.1, attack: .001, decay: .15, sustain: 0, poles: 1 },
    amp: { attack: .002, decay: .26, sustain: .18, release: .08 }, drift: 3, gain: .28, sends: { reverb: .26, delay: .3, chorus: .16 } },
  marimba: { osc: [{ wave: 'sine', gain: 1 }], fm: { ratio: 4, index: 2, decay: .045, sustain: 0 },
    amp: { attack: .002, decay: .42, sustain: 0, release: .1 }, gain: .28, sends: { reverb: .3, delay: .18, chorus: .1 } },
  koto: { osc: [{ wave: 'triangle', gain: .7 }, { wave: 'sine', gain: .4 }], fm: { ratio: 3, index: 2.3, decay: .1, sustain: .08 },
    amp: { attack: .002, decay: .65, sustain: 0, release: .14 }, scoop: -32, gain: .24, sends: { reverb: .32, delay: .3, chorus: .12 } },
  clav: { osc: [{ wave: 'pulse12', gain: 1 }],
    filter: { type: 'lowpass', cutoff: 1500, keytrack: .6, q: 3, env: 1.6, attack: .001, decay: .08, sustain: .2, poles: 1 },
    amp: { attack: .001, decay: .16, sustain: .25, release: .04 }, gain: .28, sends: { reverb: .12, delay: .12, chorus: .1 } },
  epiano: { osc: [{ wave: 'sine', gain: 1 }], fm: { ratio: 1, index: 1.3, decay: .8, sustain: .22 }, tine: { ratio: 14, index: .85, decay: .045, gain: .3 },
    amp: { attack: .002, decay: 1.5, sustain: .26, release: .32 }, gain: .2, sends: { reverb: .26, delay: .1, chorus: .62 } },
  'warm-pad': { osc: [{ wave: 'sawtooth', detune: -9, gain: .42 }, { wave: 'sawtooth', detune: 9, gain: .42 }, { wave: 'triangle', octave: 1, gain: .12 }],
    filter: { type: 'lowpass', cutoff: 1250, keytrack: .3, q: .8, env: .8, attack: .45, decay: 1.2, sustain: .55, poles: 2 },
    amp: { attack: .38, decay: .7, sustain: .86, release: .75 }, drift: 4, gain: .085, sends: { reverb: .46, delay: .04, chorus: .55 } },
  'hollow-pad': { osc: [{ wave: 'pulse25', detune: -6, gain: .45 }, { wave: 'pulse25', detune: 6, gain: .45 }, { wave: 'triangle', octave: 1, gain: .25 }],
    filter: { type: 'lowpass', cutoff: 1450, keytrack: .3, q: 1.2, env: .5, attack: .5, decay: 1, sustain: .7, poles: 1 },
    amp: { attack: .42, decay: .5, sustain: .86, release: .85 }, drift: 4, gain: .085, sends: { reverb: .5, delay: .05, chorus: .45 } },
  'string-pad': { osc: [{ wave: 'sawtooth', detune: -12, gain: .36 }, { wave: 'sawtooth', gain: .36 }, { wave: 'sawtooth', detune: 12, gain: .36 }],
    filter: { type: 'lowpass', cutoff: 2600, keytrack: .2, q: .5, env: .3, attack: .5, decay: 1, sustain: .9, poles: 1 },
    amp: { attack: .48, decay: .5, sustain: .9, release: .9 }, drift: 4, gain: .083, sends: { reverb: .5, delay: .04, chorus: .72 } },
  brass: { osc: [{ wave: 'sawtooth', detune: -6, gain: .5 }, { wave: 'sawtooth', detune: 6, gain: .5 }],
    filter: { type: 'lowpass', cutoff: 480, keytrack: .5, q: 2, env: 2.5, attack: .06, decay: .42, sustain: .5, poles: 1 },
    amp: { attack: .014, decay: .3, sustain: .8, release: .22 }, scoop: 18, drift: 3, gain: .1, sends: { reverb: .28, delay: .06, chorus: .32 } },
  'vox-pad': { osc: [{ wave: 'sawtooth', detune: -7, gain: .5 }, { wave: 'sawtooth', detune: 7, gain: .5 }],
    formants: [[650, 6, 1], [1080, 7, .55], [2650, 8, .28]],
    amp: { attack: .55, decay: .6, sustain: .9, release: .95 }, vibrato: { rate: 4.4, depth: 7, delay: .5 }, drift: 4, gain: .34, sends: { reverb: .52, delay: .05, chorus: .5 } },
};
export const patchSends = (patch: SynthPatch): MusicFx => PATCHES[patch].sends;

const waves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
function periodic(ctx: BaseAudioContext, wave: 'pulse25' | 'pulse12'): PeriodicWave {
  let cache = waves.get(ctx);
  if (!cache) waves.set(ctx, cache = new Map());
  let shape = cache.get(wave);
  if (!shape) {
    const duty = wave === 'pulse25' ? .25 : .125, size = 96, real = new Float32Array(size), imag = new Float32Array(size);
    for (let n = 1; n < size; n++) { real[n] = 2 / (n * Math.PI) * Math.sin(2 * Math.PI * n * duty); imag[n] = 2 / (n * Math.PI) * (1 - Math.cos(2 * Math.PI * n * duty)); }
    shape = ctx.createPeriodicWave(real, imag); cache.set(wave, shape);
  }
  return shape;
}
const curves = new Map<number, Float32Array<ArrayBuffer>>();
export function saturation(amount: number): Float32Array<ArrayBuffer> {
  let curve = curves.get(amount);
  if (!curve) {
    curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    curves.set(amount, curve);
  }
  return curve;
}

/** Schedules one note. `velocity` is 0–1; `seed` makes analog drift reproducible offline. */
export function playVoice(ctx: BaseAudioContext, out: AudioNode, patch: SynthPatch, pitch: number, time: number, duration: number, velocity: number, seed: number): void {
  const spec = PATCHES[patch], frequency = 440 * 2 ** ((pitch - 69) / 12), nodes: AudioNode[] = [], sources: OscillatorNode[] = [];
  const { attack: rawAttack, decay, sustain, release } = spec.amp, attack = Math.min(rawAttack, Math.max(.002, duration * .6));
  const end = time + Math.max(duration, attack + .005), stop = end + release * 1.2 + .03;
  const peak = spec.gain * (.35 + .65 * velocity) ** 1.5;
  const amp = ctx.createGain(); nodes.push(amp);
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(peak, time + attack);
  if (sustain < 1) amp.gain.setTargetAtTime(peak * sustain, time + attack, decay / 3);
  amp.gain.setTargetAtTime(0, end, release / 4);
  amp.connect(out);
  let input: AudioNode = amp;
  if (spec.drive) {
    const shaper = ctx.createWaveShaper(); shaper.curve = saturation(spec.drive); shaper.connect(input); input = shaper; nodes.push(shaper);
  }
  if (spec.filter) {
    const f = spec.filter, track = (frequency / 261.63) ** f.keytrack, base = Math.min(16000, f.cutoff * track);
    const top = Math.min(18000, base * 2 ** (f.env * (.55 + .45 * velocity))), rise = Math.min(f.attack, Math.max(.001, duration * .8));
    for (let pole = 0; pole < f.poles; pole++) {
      const filter = ctx.createBiquadFilter(); filter.type = f.type; filter.Q.value = pole ? .5 : f.q;
      filter.frequency.setValueAtTime(base, time);
      filter.frequency.linearRampToValueAtTime(top, time + rise);
      filter.frequency.setTargetAtTime(base + (top - base) * f.sustain, time + rise, f.decay / 3);
      filter.frequency.setTargetAtTime(base, end, release / 3);
      filter.connect(input); input = filter; nodes.push(filter);
    }
  }
  if (spec.formants) {
    // Parallel vowel bands that follow the pitch loosely, so high notes keep their vowel.
    const fan = ctx.createGain(), sum = ctx.createGain(), shift = (frequency / 261.63) ** .2;
    nodes.push(fan, sum); sum.connect(input);
    for (const [center, q, level] of spec.formants) {
      const band = ctx.createBiquadFilter(), gain = ctx.createGain();
      band.type = 'bandpass'; band.frequency.value = center * shift; band.Q.value = q; gain.gain.value = level;
      fan.connect(band).connect(gain).connect(sum); nodes.push(band, gain);
    }
    input = fan;
  }
  // Analog drift is deterministic per note, so offline renders stay byte-reproducible.
  const drift = spec.drift ? ((Math.sin(seed * 12.9898) * 43758.5453) % 1) * spec.drift : 0;
  const carriers: OscillatorNode[] = [];
  for (const osc of spec.osc) {
    const node = ctx.createOscillator(), level = ctx.createGain();
    if (osc.wave === 'pulse25' || osc.wave === 'pulse12') node.setPeriodicWave(periodic(ctx, osc.wave)); else node.type = osc.wave;
    node.frequency.value = frequency * 2 ** (osc.octave ?? 0);
    const cents = (osc.detune ?? 0) + drift;
    if (spec.scoop) { node.detune.setValueAtTime(cents - spec.scoop, time); node.detune.setTargetAtTime(cents, time, .028); }
    else node.detune.value = cents;
    level.gain.value = osc.gain; node.connect(level).connect(input);
    carriers.push(node); sources.push(node); nodes.push(level);
  }
  if (spec.fm) {
    const modulator = ctx.createOscillator(), depth = ctx.createGain(), index = spec.fm.index * frequency * (.6 + .4 * velocity);
    modulator.frequency.value = frequency * spec.fm.ratio;
    depth.gain.setValueAtTime(index, time);
    depth.gain.setTargetAtTime(index * spec.fm.sustain, time, spec.fm.decay / 3);
    depth.gain.setTargetAtTime(0, end, release / 4);
    modulator.connect(depth);
    carriers.slice(0, spec.fm.carriers ?? carriers.length).forEach((carrier, i) => { if (spec.osc[i]!.wave === 'sine' || spec.osc[i]!.wave === 'triangle') depth.connect(carrier.frequency); });
    sources.push(modulator); nodes.push(depth);
  }
  if (spec.tine) {
    const tine = ctx.createOscillator(), modulator = ctx.createGain(), mod = ctx.createOscillator(), level = ctx.createGain();
    tine.frequency.value = frequency; mod.frequency.value = frequency * spec.tine.ratio;
    modulator.gain.setValueAtTime(spec.tine.index * frequency, time); modulator.gain.setTargetAtTime(0, time, spec.tine.decay);
    level.gain.setValueAtTime(spec.tine.gain * (.4 + .6 * velocity), time); level.gain.setTargetAtTime(0, time, spec.tine.decay * 2.5);
    mod.connect(modulator).connect(tine.frequency); tine.connect(level).connect(input);
    sources.push(tine, mod); nodes.push(modulator, level);
  }
  if (spec.vibrato && duration > spec.vibrato.delay) {
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = spec.vibrato.rate;
    depth.gain.setValueAtTime(0, time); depth.gain.setValueAtTime(0, time + spec.vibrato.delay);
    depth.gain.linearRampToValueAtTime(spec.vibrato.depth, time + spec.vibrato.delay + .35);
    lfo.connect(depth); carriers.forEach(carrier => depth.connect(carrier.detune));
    sources.push(lfo); nodes.push(depth);
  }
  for (const source of sources) { source.start(time); source.stop(stop); }
  sources[0]!.onended = () => { sources.forEach(source => source.disconnect()); nodes.forEach(node => node.disconnect()); };
}

// Drum machine: every hit is rendered once per context into a buffer.
export const DRUM_SENDS: Readonly<Record<number, readonly [reverb: number, gated: number, pan: number, level: number]>> = {
  36: [0, 0, 0, .82], 37: [.22, .05, -.08, .5], 38: [.2, .55, .04, .72], 39: [.3, .45, -.06, .62], 42: [.04, 0, .28, .3], 46: [.08, 0, .28, .32],
  45: [.22, .35, -.32, .7], 48: [.22, .35, 0, .68], 50: [.22, .35, .3, .66], 49: [.14, 0, -.22, .36], 51: [.1, 0, .32, .26],
  54: [.12, 0, .36, .3], 56: [.15, 0, -.34, .3], 70: [.06, 0, .4, .26], 75: [.22, 0, -.28, .34],
};
const kits = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();
export function drumKit(ctx: BaseAudioContext): Map<number, AudioBuffer> {
  let kit = kits.get(ctx);
  if (kit) return kit;
  kit = new Map();
  const rate = ctx.sampleRate;
  let state = 0x2468ace;
  const noise = () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return state / 2147483648; };
  const make = (seconds: number, channels: number, sample: (t: number, channel: number) => number) => {
    const buffer = ctx.createBuffer(channels, Math.ceil(seconds * rate), rate);
    let peak = 0;
    for (let c = 0; c < channels; c++) { const data = buffer.getChannelData(c); for (let i = 0; i < data.length; i++) { data[i] = sample(i / rate, c); peak = Math.max(peak, Math.abs(data[i]!)); } }
    for (let c = 0; c < channels; c++) { const data = buffer.getChannelData(c); for (let i = 0; i < data.length; i++) data[i]! /= peak || 1; }
    // Ten-sample fade-out guarantees silence at the buffer end.
    for (let c = 0; c < channels; c++) { const data = buffer.getChannelData(c); for (let i = 1; i <= 10; i++) data[data.length - i]! *= (i - 1) / 10; }
    return buffer;
  };
  const onePole = (cutoff: number) => { const a = Math.exp(-2 * Math.PI * cutoff / rate); let y = 0; return (x: number) => (y = (1 - a) * x + a * y); };
  const highPass = (cutoff: number) => { const low = onePole(cutoff); return (x: number) => x - low(x); };
  const bandPass = (center: number, q: number) => {
    const w = 2 * Math.PI * center / rate, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - alpha) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x: number) => { const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  };
  const metal = (scale: number) => { const freqs = [205.3, 304.4, 369.6, 522.7, 540, 800].map(f => f * scale); return (t: number) => freqs.reduce((sum, f) => sum + (((t * f) % 1) < .5 ? 1 : -1), 0) / 6; };

  // Kick: pitch-swept sine, a short click and gentle saturation.
  { let phase = 0; const click = highPass(1800);
    kit.set(36, make(.45, 1, t => { phase += 2 * Math.PI * (52 + 120 * Math.exp(-t / .028) + 60 * Math.exp(-t / .004)) / rate;
      const body = Math.sin(phase) * Math.exp(-t / .2) * Math.min(1, t / .0015), tick = click(noise()) * Math.exp(-t / .0025) * .55;
      return Math.tanh(1.6 * (body + tick)); })); }
  // Snare: two drum-head tones plus band-limited noise.
  { const hp = highPass(1100), lp = onePole(8500);
    kit.set(38, make(.32, 1, t => { const tone = (Math.sin(2 * Math.PI * 182 * t * (1 - t * .3)) * .6 + Math.sin(2 * Math.PI * 330 * t) * .35) * Math.exp(-t / .055);
      return tone * .55 + lp(hp(noise())) * Math.exp(-t / .1) * 1.1; })); }
  // Clap: three quick bursts and a short room tail.
  { const band = bandPass(1150, 1.1);
    kit.set(39, make(.38, 1, t => { const bursts = [0, .011, .022].reduce((sum, at) => sum + (t >= at ? Math.exp(-(t - at) / .0045) : 0), 0);
      const tail = t >= .031 ? Math.exp(-(t - .031) / .08) * .75 : 0; return band(noise()) * (bursts + tail); })); }
  // Hats, open hat, crash, ride and tambourine share the six-oscillator metal source.
  { const source = metal(1), hp = highPass(7200), lp = onePole(14000);
    kit.set(42, make(.09, 1, t => lp(hp(source(t) * .75 + noise() * .25)) * Math.exp(-t / .016))); }
  { const source = metal(1), hp = highPass(6500);
    kit.set(46, make(.5, 1, t => hp(source(t) * .7 + noise() * .3) * Math.exp(-t / .15) * Math.min(1, t / .002))); }
  { const sources = [metal(1.11), metal(1.13)], filters = [highPass(4200), highPass(4300)];
    kit.set(49, make(2.4, 2, (t, c) => filters[c]!(sources[c]!(t) * .45 + noise() * .55) * Math.exp(-t / .7) * Math.min(1, t / .004))); }
  { const source = metal(1.42), hp = highPass(5200);
    kit.set(51, make(1.4, 1, t => (hp(source(t) * .6 + noise() * .25) + (Math.sin(2 * Math.PI * 3150 * t) + Math.sin(2 * Math.PI * 3197 * t) + Math.sin(2 * Math.PI * 4620 * t) * .8) * .045 * Math.exp(-t / .2)) * Math.exp(-t / .42))); }
  { const source = metal(3.4), hp = highPass(7000);
    kit.set(54, make(.32, 1, t => hp(source(t) * .5 + noise() * .5) * Math.exp(-t / .085) * Math.min(1, t / .003))); }
  // Cowbell and claves: tuned two-tone and single-tone percussion.
  { const band = bandPass(2650, 1.4);
    kit.set(56, make(.45, 1, t => band((((t * 540) % 1) < .5 ? 1 : -1) + (((t * 800) % 1) < .5 ? 1 : -1)) * (Math.exp(-t / .012) * .6 + Math.exp(-t / .17) * .4))); }
  kit.set(75, make(.12, 1, t => Math.sin(2 * Math.PI * 2480 * t) * Math.exp(-t / .021)));
  // Rim click and shaker.
  { const hp = highPass(2500);
    kit.set(37, make(.08, 1, t => (Math.sin(2 * Math.PI * 1720 * t) * .7 + Math.sin(2 * Math.PI * 480 * t) * .5 + hp(noise()) * .5) * Math.exp(-t / .009))); }
  { const hp = highPass(6200);
    kit.set(70, make(.11, 1, t => hp(noise()) * Math.min(1, t / .012) * Math.exp(-Math.max(0, t - .012) / .03))); }
  // Electronic toms: fast downward sweep with a noise stick.
  for (const [pitch, base] of [[45, 96], [48, 138], [50, 196]] as const) {
    let phase = 0; const hp = highPass(900);
    kit.set(pitch, make(.55, 1, t => { phase += 2 * Math.PI * base * (1 + .9 * Math.exp(-t / .055)) / rate;
      return Math.sin(phase) * Math.exp(-t / .22) + hp(noise()) * Math.exp(-t / .012) * .35; }));
  }
  kits.set(ctx, kit);
  return kit;
}

const impulses = new WeakMap<BaseAudioContext, { hall: AudioBuffer; gated: AudioBuffer }>();
function reverbImpulses(ctx: BaseAudioContext) {
  let pair = impulses.get(ctx);
  if (pair) return pair;
  const rate = ctx.sampleRate;
  let state = 0x1357bdf;
  const noise = () => { state = (Math.imul(state, 22695477) + 1) | 0; return state / 2147483648; };
  // A bright plate with darkening tail and a few early reflections.
  const hall = ctx.createBuffer(2, Math.ceil(2.8 * rate), rate);
  for (let c = 0; c < 2; c++) {
    const data = hall.getChannelData(c); let low = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate, damping = Math.exp(-2 * Math.PI * (9000 - 6400 * Math.min(1, t / 2)) / rate);
      low = (1 - damping) * noise() + damping * low;
      data[i] = t < .016 ? 0 : low * Math.exp(-(t - .016) * 6.9 / 2.5);
    }
    for (const [at, gain] of [[.019, .7], [.027, -.5], [.041, .42], [.058, -.33], [.073, .26]] as const) data[Math.floor((at + c * .0031) * rate)]! += gain;
  }
  // 1980s gated snare room: dense, flat, then cut.
  const gated = ctx.createBuffer(2, Math.ceil(.3 * rate), rate);
  for (let c = 0; c < 2; c++) {
    const data = gated.getChannelData(c); let low = 0;
    for (let i = 0; i < data.length; i++) { const t = i / rate; low = .55 * noise() + .45 * low; data[i] = low * (t < .008 ? t / .008 : t < .23 ? 1 - (t - .008) * .9 : Math.max(0, .8 * (1 - (t - .23) / .05))); }
  }
  impulses.set(ctx, pair = { hall, gated });
  return pair;
}

/** Shared returns for the music bus: plate reverb, gated drum room, ping-pong delay and ensemble chorus. */
export class MusicEffects {
  readonly reverb: GainNode; readonly gated: GainNode; readonly delay: GainNode; readonly chorus: GainNode;
  readonly tone: BiquadFilterNode;
  #delays: DelayNode[];
  #nodes: AudioNode[] = [];
  #sources: OscillatorNode[] = [];
  constructor(ctx: BaseAudioContext, destination: AudioNode) {
    const node = <T extends AudioNode>(value: T) => { this.#nodes.push(value); return value; };
    const { hall, gated } = reverbImpulses(ctx);
    this.tone = node(ctx.createBiquadFilter()); this.tone.type = 'lowpass'; this.tone.Q.value = .4; this.tone.frequency.value = 9000;
    this.tone.connect(destination);
    this.reverb = node(ctx.createGain());
    const plate = node(ctx.createConvolver()), plateReturn = node(ctx.createGain()), plateLow = node(ctx.createBiquadFilter());
    plate.buffer = hall; plateLow.type = 'highpass'; plateLow.frequency.value = 220; plateReturn.gain.value = .9;
    this.reverb.connect(plateLow).connect(plate).connect(plateReturn).connect(this.tone);
    this.gated = node(ctx.createGain());
    const room = node(ctx.createConvolver()), roomReturn = node(ctx.createGain());
    room.buffer = gated; roomReturn.gain.value = .55;
    this.gated.connect(room).connect(roomReturn).connect(this.tone);
    // Ping-pong delay with a darkening feedback path; repeats also feed the plate lightly.
    this.delay = node(ctx.createGain());
    const left = node(ctx.createDelay(2)), right = node(ctx.createDelay(2)), toRight = node(ctx.createGain()), toLeft = node(ctx.createGain());
    const dark = node(ctx.createBiquadFilter()), thin = node(ctx.createBiquadFilter()), merge = node(ctx.createChannelMerger(2)), delayReturn = node(ctx.createGain());
    dark.type = 'lowpass'; dark.frequency.value = 3800; thin.type = 'highpass'; thin.frequency.value = 320;
    toRight.gain.value = .36; toLeft.gain.value = .36; delayReturn.gain.value = .55;
    this.delay.connect(thin).connect(left);
    left.connect(dark).connect(toRight).connect(right); right.connect(toLeft).connect(left);
    left.connect(merge, 0, 0); right.connect(merge, 0, 1);
    merge.connect(delayReturn).connect(this.tone); delayReturn.connect(this.reverb);
    this.#delays = [left, right];
    // Two modulated short delays, inverted LFO phase per side (Juno-style ensemble).
    this.chorus = node(ctx.createGain());
    const chorusMerge = node(ctx.createChannelMerger(2)), chorusReturn = node(ctx.createGain()), lfo = ctx.createOscillator();
    lfo.frequency.value = .52; chorusReturn.gain.value = .8; this.#sources.push(lfo);
    [[.0062, .0019], [.0074, -.0019]].forEach(([base, depth], side) => {
      const line = node(ctx.createDelay(.05)), swing = node(ctx.createGain());
      line.delayTime.value = base!; swing.gain.value = depth!;
      lfo.connect(swing).connect(line.delayTime); this.chorus.connect(line); line.connect(chorusMerge, 0, side);
    });
    chorusMerge.connect(chorusReturn).connect(this.tone);
    lfo.start();
  }
  setTempo(bpm: number): void {
    const seconds = Math.min(1.9, .75 * 60 / bpm), at = this.#delays[0]!.context.currentTime;
    this.#delays.forEach(delay => delay.delayTime.setValueAtTime(seconds, at));
  }
  dispose(): void {
    this.#sources.forEach(source => { source.stop(); source.disconnect(); });
    this.#nodes.forEach(node => node.disconnect());
  }
}
