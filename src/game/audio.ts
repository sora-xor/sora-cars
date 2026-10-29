import { makeScore, MUSIC_LIBRARY, type MusicScore, type ScoreNote } from './music-score';
import type { CutsceneMusicCue, MusicArrangement, MusicTransition } from './music-cues';
import type { SynthPatch } from './music-themes';
import { DRUM_SENDS, drumKit, MusicEffects, patchSends, playVoice, saturation } from './music-synth';

export interface DriveDetail {
  /** RaceV1 six-bit controls; omitted controls infer throttle from acceleration. */
  controls?: number;
  /** Lateral velocity in millimetres per simulation tick. */
  lateral?: number;
  offroad?: boolean;
  /** Local presentation weather intensity, between zero and one. */
  rain?: number;
  /** A contact reported by the generated native circuit for the local car. */
  impact?: { tick: number; kind: 'tree' | 'sign' };
}
export interface DriveAudioState {
  active: boolean; gear: number; rpm: number; load: number; boost: boolean;
  tyreSlip: number; wind: number; offroad: boolean; rain: number;
  shifting: boolean; turboRelease: boolean; impact: 'tree' | 'sign' | null; voiceCount: number;
}
const bounded = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** A fixed voice bank: combustion, exhaust, intake, gearbox, turbo and road textures.
 * Every path ends at `bus`, after all filters and envelopes. A stop therefore
 * mutes ongoing loops and pending shift/release tails in the same audio quantum.
 */
class DriveSynth {
  readonly bus: GainNode;
  #ctx: BaseAudioContext;
  #sources: (OscillatorNode | AudioBufferSourceNode)[] = [];
  #nodes: AudioNode[] = [];
  #parameters: AudioParam[] = [];
  #combustion: OscillatorNode;
  #exhaust: OscillatorNode;
  #intake: OscillatorNode;
  #gearbox: OscillatorNode;
  #turbo: OscillatorNode;
  #tyre: OscillatorNode;
  #combustionGain: GainNode;
  #exhaustGain: GainNode;
  #intakeGain: GainNode;
  #gearboxGain: GainNode;
  #turboGain: GainNode;
  #turboAir: GainNode;
  #tyreGain: GainNode;
  #tyreNoise: GainNode;
  #windGain: GainNode;
  #gravelGain: GainNode;
  #rainGain: GainNode;
  #releaseGain: GainNode;
  #overrunGain: GainNode;
  #impactNoise: GainNode;
  #impactTone: OscillatorNode;
  #impactGain: GainNode;
  #impactUntil = 0;
  #lastImpactTick = -1;
  #engineMix: GainNode;
  #exhaustFilter: BiquadFilterNode;
  #intakeFilter: BiquadFilterNode;
  #windFilter: BiquadFilterNode;
  #shiftUntil = 0;
  #releaseUntil = 0;
  #lastSpeed = 0;
  #snapshot: DriveAudioState = { active: false, gear: 1, rpm: 950, load: 0, boost: false,
    tyreSlip: 0, wind: 0, offroad: false, rain: 0, shifting: false, turboRelease: false, impact: null, voiceCount: 0 };
  constructor(ctx: BaseAudioContext, noise: AudioBuffer, destination: AudioNode) {
    this.#ctx = ctx;
    this.bus = this.#gain(0); this.bus.connect(destination);
    const mix = this.#gain(1), saturation = ctx.createWaveShaper();
    const curve = new Float32Array(1025);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 512 - 1) * 1.65) / Math.tanh(1.65);
    saturation.curve = curve; saturation.oversample = '2x'; this.#nodes.push(saturation);
    mix.connect(saturation).connect(this.bus);
    this.#engineMix = this.#gain(1); this.#engineMix.connect(mix);
    this.#combustion = this.#oscillator('sawtooth', 38);
    // Uneven firing harmonics give the original SORA inline-four its rough edge.
    const real = new Float32Array(25), imaginary = new Float32Array(25);
    for (let n = 1; n < imaginary.length; n++) imaginary[n] = Math.sin(n * Math.PI * 0.23) / n * (n % 2 ? 1 : 0.72);
    this.#combustion.setPeriodicWave(ctx.createPeriodicWave(real, imaginary));
    this.#combustionGain = this.#gain(0); this.#combustion.connect(this.#combustionGain).connect(this.#engineMix);
    this.#exhaust = this.#oscillator('triangle', 19);
    this.#exhaustFilter = this.#filter('lowpass', 250, 0.8);
    this.#exhaustGain = this.#gain(0); this.#exhaust.connect(this.#exhaustFilter).connect(this.#exhaustGain).connect(this.#engineMix);
    this.#intake = this.#oscillator('sawtooth', 76);
    this.#intakeFilter = this.#filter('bandpass', 900, 1.1);
    this.#intakeGain = this.#gain(0); this.#intake.connect(this.#intakeFilter).connect(this.#intakeGain).connect(this.#engineMix);
    this.#gearbox = this.#oscillator('triangle', 210);
    this.#gearboxGain = this.#gain(0); this.#gearbox.connect(this.#gearboxGain).connect(this.#engineMix);
    this.#turbo = this.#oscillator('sine', 1400);
    this.#turboGain = this.#gain(0); this.#turbo.connect(this.#turboGain).connect(mix);
    this.#turboAir = this.#noiseLayer(noise, 'bandpass', 3300, 0.75, mix, 0.17);
    this.#releaseGain = this.#noiseLayer(noise, 'bandpass', 1900, 1.4, mix, 0.43);
    this.#overrunGain = this.#noiseLayer(noise, 'lowpass', 320, 0.6, this.#engineMix, 0.29);
    this.#tyre = this.#oscillator('triangle', 920);
    this.#tyreGain = this.#gain(0); this.#tyre.connect(this.#tyreGain).connect(mix);
    this.#tyreNoise = this.#noiseLayer(noise, 'bandpass', 2200, 1.6, mix, 0.63);
    this.#windFilter = this.#filter('lowpass', 900, 0.5);
    this.#windFilter.connect(mix);
    this.#windGain = this.#noiseLayer(noise, 'highpass', 160, 0.6, this.#windFilter, 0.07);
    this.#gravelGain = this.#noiseLayer(noise, 'bandpass', 570, 1.0, mix, 0.79);
    this.#rainGain = this.#noiseLayer(noise, 'highpass', 3200, 0.7, mix, 0.91);
    this.#impactNoise = this.#noiseLayer(noise, 'lowpass', 600, 0.6, mix, 0.53);
    this.#impactTone = this.#oscillator('sine', 100);
    this.#impactGain = this.#gain(0); this.#impactTone.connect(this.#impactGain).connect(mix);
    this.#snapshot.voiceCount = this.#sources.length;
  }
  #gain(value: number): GainNode {
    const node = this.#ctx.createGain(); node.gain.value = value;
    this.#nodes.push(node); this.#parameters.push(node.gain); return node;
  }
  #filter(type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
    const node = this.#ctx.createBiquadFilter(); node.type = type; node.frequency.value = frequency; node.Q.value = q;
    this.#nodes.push(node); this.#parameters.push(node.frequency); return node;
  }
  #oscillator(type: OscillatorType, frequency: number): OscillatorNode {
    const node = this.#ctx.createOscillator(); node.type = type; node.frequency.value = frequency;
    this.#parameters.push(node.frequency); this.#sources.push(node); node.start(); return node;
  }
  #noiseLayer(buffer: AudioBuffer, type: BiquadFilterType, frequency: number, q: number, out: AudioNode, offset: number): GainNode {
    const source = this.#ctx.createBufferSource(), filter = this.#filter(type, frequency, q), gain = this.#gain(0);
    source.buffer = buffer; source.loop = true; source.connect(filter).connect(gain).connect(out);
    this.#sources.push(source); source.start(0, offset); return gain;
  }
  #target(parameter: AudioParam, value: number, time: number, constant = 0.035): void {
    // Replace prior automation on every update; a long session cannot accumulate events.
    parameter.cancelAndHoldAtTime(time); parameter.setTargetAtTime(value, time, constant);
  }
  get state(): Readonly<DriveAudioState> {
    const now = this.#ctx.currentTime;
    return Object.freeze({ ...this.#snapshot, shifting: this.#snapshot.active && now < this.#shiftUntil,
      turboRelease: this.#snapshot.active && now < this.#releaseUntil,
      impact: this.#snapshot.active && now < this.#impactUntil ? this.#snapshot.impact : null });
  }
  drive(speed: number, active: boolean, boost: boolean, detail: DriveDetail): void {
    if (!active || !Number.isFinite(speed)) { this.stop(); return; }
    const now = this.#ctx.currentTime, was = this.#snapshot, velocity = bounded(speed, 0, 3300);
    const controls = detail.controls;
    const load = controls === undefined ? (velocity >= this.#lastSpeed ? 0.85 : 0.18) : controls & 2 ? 0.04 : controls & 1 ? 1 : 0.12;
    const offroad = !!detail.offroad, rain = bounded(Number.isFinite(detail.rain) ? detail.rain! : 0, 0, 1);
    const lateral = Number.isFinite(detail.lateral) ? Math.abs(detail.lateral!) : 0;
    const slip = bounded((lateral / 260 + (controls && controls & 16 ? 0.65 : 0)) * velocity / 1600, 0, 1);
    const thresholds = [490, 900, 1410, 1980, 2550], ratios = [12.1, 7, 4.7, 3.5, 2.75, 2.27];
    let gear = was.gear;
    // Hysteresis prevents gear chatter around one speed threshold.
    while (gear < 6 && velocity > thresholds[gear - 1]!) gear++;
    while (gear > 1 && velocity < thresholds[gear - 2]! - 135) gear--;
    const rpm = bounded(950 + velocity * ratios[gear - 1]! * (0.88 + load * 0.12) + load * 220 + (boost ? 140 : 0), 950, 8100);
    const firing = rpm / 30;
    if (was.active && gear !== was.gear) {
      this.#shiftUntil = now + 0.15;
      this.#engineMix.gain.cancelAndHoldAtTime(now);
      this.#engineMix.gain.linearRampToValueAtTime(0.26, now + 0.022);
      this.#engineMix.gain.linearRampToValueAtTime(1, this.#shiftUntil);
    } else if (!was.active) { this.#engineMix.gain.cancelScheduledValues(now); this.#engineMix.gain.setValueAtTime(1, now); }
    this.#target(this.#combustion.frequency, firing, now, 0.025);
    this.#target(this.#exhaust.frequency, firing * 0.5, now, 0.045);
    this.#target(this.#intake.frequency, firing * 2.015, now, 0.03);
    this.#target(this.#gearbox.frequency, 190 + velocity * 0.29 + gear * 37, now, 0.05);
    this.#target(this.#combustionGain.gain, 0.085 + load * 0.12 + (boost ? 0.035 : 0), now);
    this.#target(this.#exhaustGain.gain, 0.17 + load * 0.08, now);
    this.#target(this.#exhaustFilter.frequency, 160 + rpm * 0.044 + load * 180, now);
    this.#target(this.#intakeGain.gain, 0.025 + load * 0.145, now);
    this.#target(this.#intakeFilter.frequency, 500 + rpm * 0.17 + load * 500, now);
    this.#target(this.#gearboxGain.gain, velocity / 3300 * (0.008 + load * 0.017), now);
    this.#target(this.#turbo.frequency, 1200 + velocity * 0.68 + (boost ? 1100 : 0), now, 0.14);
    this.#target(this.#turboGain.gain, (boost ? 0.038 : load * 0.009) * velocity / 1800, now, 0.1);
    this.#target(this.#turboAir.gain, boost ? 0.1 : 0, now, 0.08);
    if (was.active && (was.boost && !boost || was.load > 0.8 && load < 0.2 && velocity > 700)) {
      this.#releaseUntil = now + 0.3;
      this.#releaseGain.gain.cancelAndHoldAtTime(now);
      this.#releaseGain.gain.linearRampToValueAtTime(was.boost ? 0.27 : 0.12, now + 0.012);
      this.#releaseGain.gain.linearRampToValueAtTime(0.07, now + 0.08);
      this.#releaseGain.gain.linearRampToValueAtTime(0.13, now + 0.115);
      this.#releaseGain.gain.linearRampToValueAtTime(0, this.#releaseUntil);
      this.#overrunGain.gain.cancelAndHoldAtTime(now);
      this.#overrunGain.gain.linearRampToValueAtTime(0.24, now + 0.01);
      this.#overrunGain.gain.linearRampToValueAtTime(0, now + 0.09);
    }
    this.#target(this.#tyre.frequency, 730 + velocity * 0.19 + lateral * 1.1, now, 0.018);
    this.#target(this.#tyreGain.gain, slip * (rain ? 0.045 : 0.035), now, 0.02);
    this.#target(this.#tyreNoise.gain, slip * 0.11, now, 0.025);
    const wind = (velocity / 3300) ** 1.6;
    // At highway speeds, the existing road-air voice becomes broader and more
    // present. It follows actual speed even when the driver lifts the throttle,
    // so coasting still sounds fast and braking progressively quiets the rush.
    const highSpeedAir = bounded((velocity - 1400) / 1900, 0, 1);
    this.#target(this.#windGain.gain, wind * (0.16 + highSpeedAir * 0.16), now, 0.08);
    this.#target(this.#windFilter.frequency, 550 + velocity * 0.82 + highSpeedAir * 2400, now, 0.08);
    this.#target(this.#gravelGain.gain, offroad ? 0.19 * velocity / 2200 : 0, now, 0.02);
    this.#target(this.#rainGain.gain, rain * (0.025 + wind * 0.075), now, 0.1);
    let impact = was.impact;
    const contact = detail.impact;
    if (contact && Number.isSafeInteger(contact.tick) && contact.tick >= 0
      && contact.tick !== this.#lastImpactTick && (contact.kind === 'tree' || contact.kind === 'sign')) {
      this.#lastImpactTick = contact.tick; impact = contact.kind;
      const wood = contact.kind === 'tree', duration = wood ? 0.18 : 0.26;
      this.#impactUntil = now + duration;
      this.#impactNoise.gain.cancelAndHoldAtTime(now);
      this.#impactNoise.gain.linearRampToValueAtTime(wood ? 0.44 : 0.15, now + 0.004);
      this.#impactNoise.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.8);
      this.#impactNoise.gain.linearRampToValueAtTime(0, this.#impactUntil);
      this.#impactTone.frequency.cancelAndHoldAtTime(now);
      this.#impactTone.frequency.setValueAtTime(wood ? 115 : 1150, now);
      this.#impactTone.frequency.exponentialRampToValueAtTime(wood ? 44 : 780, this.#impactUntil);
      this.#impactGain.gain.cancelAndHoldAtTime(now);
      this.#impactGain.gain.linearRampToValueAtTime(wood ? 0.22 : 0.15, now + 0.003);
      this.#impactGain.gain.exponentialRampToValueAtTime(0.0001, this.#impactUntil - 0.01);
      this.#impactGain.gain.linearRampToValueAtTime(0, this.#impactUntil);
    }
    this.#target(this.bus.gain, 0.64, now, was.active ? 0.02 : 0.012);
    this.#lastSpeed = velocity;
    this.#snapshot = { active: true, gear, rpm: Math.round(rpm), load, boost, tyreSlip: slip, wind,
      offroad, rain, shifting: now < this.#shiftUntil, turboRelease: now < this.#releaseUntil, impact, voiceCount: this.#sources.length };
  }
  stop(): void {
    const now = this.#ctx.currentTime;
    // Setting the final bus to exact zero is deliberate: exponential envelopes
    // never reach zero, and a queued shift or release must not reopen this bus.
    for (const parameter of this.#parameters) parameter.cancelAndHoldAtTime(now);
    this.bus.gain.cancelScheduledValues(now); this.bus.gain.setValueAtTime(0, now);
    this.#releaseGain.gain.setValueAtTime(0, now); this.#overrunGain.gain.setValueAtTime(0, now);
    this.#impactNoise.gain.setValueAtTime(0, now); this.#impactGain.gain.setValueAtTime(0, now);
    this.#shiftUntil = this.#releaseUntil = this.#impactUntil = 0; this.#lastImpactTick = -1; this.#lastSpeed = 0;
    this.#snapshot = { ...this.#snapshot, active: false, gear: 1, rpm: 950, load: 0, boost: false,
      tyreSlip: 0, wind: 0, offroad: false, rain: 0, shifting: false, turboRelease: false, impact: null };
  }
  dispose(): void {
    this.stop();
    for (const source of this.#sources) { source.stop(); source.disconnect(); }
    for (const node of this.#nodes) node.disconnect();
    this.#sources = []; this.#nodes = []; this.#parameters = [];
  }
}

type SendKind = 'reverb' | 'delay' | 'chorus' | 'gated';
interface MusicLayer {
  bus: GainNode; filter: BiquadFilterNode; pan: StereoPannerNode;
  stems: GainNode[]; positions: StereoPannerNode[]; retireAt: number;
  /** Effect sends taken after each stem's arrangement gain; `wet` fades with `bus`. */
  wet: Record<SendKind, GainNode>; sends: GainNode[]; drumVerb: GainNode; drumGate: GainNode;
}
/** Where a song has reached: every note before `index` (in pass `loop`) is already scheduled. */
interface Transport { score: MusicScore; start: number; entryBeat: number; index: number; loop: number }
/** Ramp from the parameter's present value. After a completed ramp, cancelAndHoldAtTime inserts
 * no event, so a following ramp would otherwise start from that old event and jump at once. */
function glide(param: AudioParam, now: number, end: number, target: number, curve: 'linear' | 'exponential' = 'linear'): void {
  param.cancelAndHoldAtTime(now); param.setValueAtTime(param.value, now);
  if (curve === 'linear') param.linearRampToValueAtTime(target, end); else param.exponentialRampToValueAtTime(target, end);
}
const FULL_MIX: MusicArrangement = { id: 'full-song', gains: [1, 1, 1, 1, 1], cutoff: 8800, width: .55, pan: 0 };
/** Seconds for the outgoing layer to go, the incoming one to arrive, and before the new song's first note. */
const TRANSITIONS: Record<MusicTransition, { out: number; in: number; lead: number }> = {
  fade: { out: .72, in: .78, lead: .08 },
  cut: { out: .04, in: .03, lead: .02 },
  slow: { out: 2.6, in: 3.2, lead: .08 },
  powerdown: { out: .8, in: 2.4, lead: .9 },
};
const DEFAULT_PATCHES: readonly SynthPatch[] = ['round-bass', 'pulse', 'pluck', 'warm-pad'];

/** Local analog/FM palette playing the exact original notes exported as MIDI. */
export class GameAudio {
  context: AudioContext | OfflineAudioContext | null = null;
  musicVolume = 0.3;
  effectsVolume = 0.35;
  musicEnabled = false;
  #externalMusic = false;
  #master: GainNode | null = null;
  #music: GainNode | null = null;
  #effects: GainNode | null = null;
  #drive: DriveSynth | null = null;
  #score: MusicScore = makeScore(0);
  #track = 0;
  #sceneCue: CutsceneMusicCue | null = null;
  /** A cutscene silence: no layer plays and the transport schedules nothing. */
  #silent = false;
  #arrangement: MusicArrangement = FULL_MIX;
  #layer: MusicLayer | null = null;
  #retiring: MusicLayer[] = [];
  /** Outgoing songs that keep playing into their retiring layer until their fade ends. */
  #fading: (Transport & { layer: MusicLayer; until: number })[] = [];
  #transitions = 0;
  #arrangementChanges = 0;
  #transitionUntil = 0;
  #start = 0;
  #entryBeat = 0;
  #index = 0;
  #loop = 0;
  #timer: ReturnType<typeof setInterval> | null = null;
  #noise: AudioBuffer | null = null;
  #mix: GainNode | null = null;
  #bus: AudioNode[] = [];
  #fx: MusicEffects | null = null;
  #kit: Map<number, AudioBuffer> | null = null;
  #openHat: GainNode | null = null;
  /** Diagnostics: called with every score note as the transport schedules it. */
  onNote: ((note: ScoreNote, time: number) => void) | null = null;
  constructor(context?: AudioContext | OfflineAudioContext) {
    if (context) this.#initialize(context);
  }
  #initialize(ctx: AudioContext | OfflineAudioContext): void {
    this.context = ctx;
    this.#master = ctx.createGain(); this.#master.gain.value = 0.7; this.#master.connect(ctx.destination);
    this.#music = ctx.createGain(); this.#music.connect(this.#master);
    // Music bus: dry layers and effect returns, gentle glue compression and tape-like warmth.
    this.#mix = ctx.createGain();
    const headroom = ctx.createGain(), rumble = ctx.createBiquadFilter(), glue = ctx.createDynamicsCompressor(), warmth = ctx.createWaveShaper(), trim = ctx.createGain();
    headroom.gain.value = .3; rumble.type = 'highpass'; rumble.frequency.value = 36; rumble.Q.value = .6;
    glue.threshold.value = -20; glue.knee.value = 8; glue.ratio.value = 2; glue.attack.value = .015; glue.release.value = .2;
    warmth.curve = saturation(1.1); warmth.oversample = '2x'; trim.gain.value = .38;
    this.#mix.connect(headroom).connect(rumble).connect(glue).connect(warmth).connect(trim).connect(this.#music);
    this.#bus = [headroom, rumble, glue, warmth, trim];
    this.#fx = new MusicEffects(ctx, this.#mix); this.#fx.setTempo(this.#score.bpm); this.#kit = drumKit(ctx);
    this.#effects = ctx.createGain(); this.#effects.connect(this.#master);
    this.#noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = this.#noise.getChannelData(0);
    // Cosmetic deterministic noise makes offline sound regression captures reproducible.
    let seed = 987234;
    for (let i = 0; i < samples.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; samples[i] = seed / 2147483648; }
    this.#drive = new DriveSynth(ctx, this.#noise, this.#effects);
    if (!this.#silent) this.#replaceLayer();
    this.#start = ctx.currentTime + 0.08;
    if (ctx instanceof AudioContext) this.#timer = setInterval(() => this.#schedule(), 30);
    this.#updateGains();
  }
  async unlock(): Promise<void> {
    if (!this.context) this.#initialize(new AudioContext());
    if (this.context instanceof AudioContext) await this.context.resume();
  }
  /** A copy of presentation-only sound state; no audio value enters race physics. */
  get driveState(): Readonly<DriveAudioState> {
    return this.#drive?.state ?? Object.freeze({ active: false, gear: 1, rpm: 950, load: 0, boost: false,
      tyreSlip: 0, wind: 0, offroad: false, rain: 0, shifting: false, turboRelease: false, impact: null, voiceCount: 0 });
  }
  get musicState() {
    const now = this.context?.currentTime ?? 0;
    return { enabled: this.musicEnabled, audible: this.musicEnabled && !this.#externalMusic && this.musicVolume > 0 && this.context?.state === 'running',
      external: this.#externalMusic, silent: this.#silent, track: this.#silent ? null : this.#track,
      title: this.#silent ? null : this.#score.name, file: this.#silent ? null : MUSIC_LIBRARY[this.#track]!.file,
      bpm: this.#score.bpm, source: this.#sceneCue ? 'cutscene' : 'song', cue: this.#sceneCue?.key ?? null,
      narrative: this.#sceneCue?.narrative ?? null, mood: this.#sceneCue?.mood ?? null, transition: this.#sceneCue?.transition ?? null,
      arrangement: this.#arrangement.id, stems: [...this.#arrangement.gains],
      // The clock starts when playback starts; the score may enter at a later phrase.
      entryBeat: this.#entryBeat, requestedEntryBeat: this.#sceneCue?.entryBeat ?? 0,
      transportBeat: Math.round((this.#entryBeat + Math.max(0, (now - this.#start) * this.#score.bpm / 60)) * 100) / 100,
      startedAt: this.#start, transitions: this.#transitions, arrangementChanges: this.#arrangementChanges,
      transitioning: now < this.#transitionUntil, volume: this.musicVolume, liveLayers: (this.#layer ? 1 : 0) + this.#retiring.length };
  }
  setTrack(index: number): void {
    const score = makeScore(index);
    this.#sceneCue = null; this.#arrangement = FULL_MIX;
    this.#selectScore(index, score);
  }
  /** Held dialogue leaves the transport untouched. Camera cuts morph stems; narrative
   * changes move between compositions, or into silence, with the cue's own transition. */
  setCutsceneCue(cue: CutsceneMusicCue): void {
    if (cue.key === this.#sceneCue?.key) return;
    if (cue.track === null) {
      this.#sceneCue = cue; this.#arrangement = cue.arrangement;
      if (!this.#silent) { this.#silent = true; this.#transitions++; this.#retireCurrent(cue.transition); }
      return;
    }
    const changedSong = this.#silent || cue.track !== this.#track || this.#sceneCue === null;
    const score = changedSong ? makeScore(cue.track) : this.#score;
    if (!Number.isFinite(cue.entryBeat) || cue.entryBeat < 0 || cue.entryBeat >= score.beats) throw new RangeError('Cutscene music entrance is outside the composition');
    this.#sceneCue = cue; this.#arrangement = cue.arrangement;
    if (changedSong) this.#selectScore(cue.track, score, cue.entryBeat, cue.transition);
    else { this.#arrangementChanges++; this.#applyArrangement(); }
  }
  endCutscene(): void {
    if (!this.#sceneCue) return;
    this.#sceneCue = null; this.#arrangement = FULL_MIX;
    // A scene skipped during a silence hands the next view its last song again.
    if (this.#silent) this.#selectScore(this.#track, makeScore(this.#track), 0, 'slow');
    else this.#applyArrangement();
  }
  #selectScore(index: number, score: MusicScore, entryBeat = 0, transition: MusicTransition = 'fade'): void {
    const outgoing = this.#outgoing();
    this.#score = score; this.#track = index; this.#entryBeat = entryBeat; this.#loop = 0; this.#silent = false;
    this.#index = score.notes.findIndex(note => note.beat >= entryBeat);
    // An entrance in a final rest still wraps at the composition's real end.
    if (this.#index === -1) { this.#index = 0; this.#loop = 1; }
    this.#start = (this.context?.currentTime ?? 0) + TRANSITIONS[transition].lead;
    this.#fx?.setTempo(score.bpm);
    this.#transitions++; this.#replaceLayer(transition, outgoing);
  }
  /** The playing song's position, so it can play on under its own fade-out. */
  #outgoing(): Transport | null {
    if (!this.context || !this.#layer || this.context.currentTime < this.#start) return null;
    return { score: this.#score, start: this.#start, entryBeat: this.#entryBeat, index: this.#index, loop: this.#loop };
  }
  /** Fade a layer out with the transition's timing. Fades let the outgoing song play on underneath;
   * a cut or powerdown stops it. A powerdown also stops feeding the effects at once and drags
   * the top end of the music and its echoes down, like a failing supply. */
  #retire(layer: MusicLayer, transition: MusicTransition, outgoing: Transport | null): void {
    const now = this.context!.currentTime, { out } = TRANSITIONS[transition], powerdown = transition === 'powerdown';
    glide(layer.bus.gain, now, now + out, 0);
    for (const wet of Object.values(layer.wet)) glide(wet.gain, now, now + (powerdown ? .2 : out), 0);
    // The sound collapses to a low thud well before it is gone. The next song's first
    // arrangement resets the shared effects tone.
    if (powerdown) for (const filter of [layer.filter, this.#fx?.tone]) if (filter) glide(filter.frequency, now, now + .35, 60, 'exponential');
    if (outgoing && (transition === 'fade' || transition === 'slow')) this.#fading.push({ ...outgoing, layer, until: now + out });
    layer.retireAt = now + out + .04; this.#retiring.push(layer);
    // Rapid Back/Next cannot retain an unbounded graph of silent mix buses.
    while (this.#retiring.length > 4) this.#disconnectLayer(this.#retiring.shift()!);
  }
  /** Into silence: the playing layer leaves and nothing replaces it. */
  #retireCurrent(transition: MusicTransition): void {
    if (!this.context || !this.#layer) return;
    this.#retire(this.#layer, transition, this.#outgoing()); this.#layer = null;
    this.#transitionUntil = this.context.currentTime + TRANSITIONS[transition].out;
  }
  #disconnectLayer(layer: MusicLayer): void {
    layer.bus.disconnect(); layer.filter.disconnect(); layer.pan.disconnect();
    layer.stems.forEach(stem => stem.disconnect()); layer.positions.forEach(position => position.disconnect());
    Object.values(layer.wet).forEach(wet => wet.disconnect()); layer.sends.forEach(send => send.disconnect());
    layer.drumVerb.disconnect(); layer.drumGate.disconnect();
  }
  #replaceLayer(transition: MusicTransition = 'fade', outgoing: Transport | null = null): void {
    if (!this.context || !this.#music) return;
    const ctx = this.context, now = ctx.currentTime, timing = TRANSITIONS[transition];
    if (this.#layer) this.#retire(this.#layer, transition, outgoing);
    const bus = ctx.createGain(), filter = ctx.createBiquadFilter(), pan = ctx.createStereoPanner();
    filter.type = 'lowpass'; filter.Q.value = .45; bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(1, now + timing.in);
    filter.connect(pan).connect(bus).connect(this.#mix ?? this.#music);
    const stems = Array.from({ length: 5 }, () => ctx.createGain());
    const positions = stems.map(stem => { const position = ctx.createStereoPanner(); stem.connect(position).connect(filter); return position; });
    // Each instrument's reverb/delay/chorus amount comes from its patch and the song's mix.
    const fx = this.#fx!, wet = { reverb: ctx.createGain(), delay: ctx.createGain(), chorus: ctx.createGain(), gated: ctx.createGain() };
    for (const kind of ['reverb', 'delay', 'chorus', 'gated'] as const) {
      wet[kind].gain.setValueAtTime(0, now); wet[kind].gain.linearRampToValueAtTime(1, now + timing.in); wet[kind].connect(fx[kind]);
    }
    const patches = this.#score.patches ?? DEFAULT_PATCHES, mix = this.#score.fx ?? { reverb: 1, delay: 1, chorus: 1 }, sends: GainNode[] = [];
    stems.slice(0, 4).forEach((stem, index) => {
      const amounts = patchSends(patches[index] ?? DEFAULT_PATCHES[index]!);
      for (const kind of ['reverb', 'delay', 'chorus'] as const) {
        if (!amounts[kind]) continue;
        const send = ctx.createGain(); send.gain.value = amounts[kind] * mix[kind]; stem.connect(send).connect(wet[kind]); sends.push(send);
      }
    });
    const drumVerb = ctx.createGain(), drumGate = ctx.createGain();
    drumVerb.connect(wet.reverb); drumGate.connect(wet.gated);
    this.#layer = { bus, filter, pan, stems, positions, retireAt: Infinity, wet, sends, drumVerb, drumGate };
    this.#transitionUntil = now + Math.max(timing.in, timing.out); this.#applyArrangement(true);
  }
  #applyArrangement(initial = false): void {
    const layer = this.#layer, ctx = this.context;
    if (!layer || !ctx) return;
    const set = (parameter: AudioParam, value: number) => {
      parameter.cancelAndHoldAtTime(ctx.currentTime);
      if (initial) parameter.setValueAtTime(value, ctx.currentTime);
      else parameter.setTargetAtTime(value, ctx.currentTime, .16);
    };
    layer.stems.forEach((stem, index) => set(stem.gain, this.#arrangement.gains[index]!));
    set(layer.drumVerb.gain, this.#arrangement.gains[4]); set(layer.drumGate.gain, this.#arrangement.gains[4]);
    if (this.#fx) set(this.#fx.tone.frequency, Math.min(16000, this.#arrangement.cutoff * 1.15));
    layer.positions.forEach((position, index) => set(position.pan, [0, -.24, .7, -.45, .12][index]! * this.#arrangement.width));
    set(layer.filter.frequency, this.#arrangement.cutoff); set(layer.pan.pan, this.#arrangement.pan);
  }
  async toggleMusic(): Promise<boolean> {
    await this.unlock(); this.musicEnabled = !this.musicEnabled; this.#updateGains(); return this.musicEnabled;
  }
  /** A recorded course song owns the music slot while its view is open.
   * Keep the user's toggle/volume, but mute scheduled MIDI tails immediately. */
  setExternalMusic(active: boolean): void {
    this.#externalMusic = active;
    if (active && this.#music && this.context) {
      this.#music.gain.cancelScheduledValues(this.context.currentTime);
      this.#music.gain.setValueAtTime(0, this.context.currentTime);
    }
    this.#updateGains();
  }
  setVolumes(music: number, effects: number): void {
    this.musicVolume = Math.max(0, Math.min(1, music)); this.effectsVolume = Math.max(0, Math.min(1, effects)); this.#updateGains();
  }
  #updateGains(): void {
    if (!this.context || !this.#music || !this.#effects) return;
    this.#music.gain.setTargetAtTime(this.musicEnabled && !this.#externalMusic ? this.musicVolume : 0, this.context.currentTime, 0.04);
    this.#effects.gain.setTargetAtTime(this.effectsVolume, this.context.currentTime, 0.04);
  }
  drive(speed: number, active: boolean, boost = false, detail: DriveDetail = {}): void {
    this.#drive?.drive(speed, active, boost, detail);
  }
  /** Immediately silence all driving voices and cancel queued shift/turbo tails. */
  stopDrive(): void { this.#drive?.stop(); }
  cue(kind: 'count' | 'go' | 'finish' | 'click'): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (kind === 'finish') [72, 76, 79, 84].forEach((pitch, i) => this.#tone(pitch, now + i * 0.12, 0.3, 0.2, 'square', this.#effects!));
    else this.#tone(kind === 'go' ? 84 : kind === 'count' ? 72 : 64, now, kind === 'go' ? 0.35 : 0.08, 0.18, 'sine', this.#effects!);
  }
  /** Audition utility: schedule a bounded interval before offline PCM rendering. */
  scheduleOfflineMusic(seconds: number): void {
    if (!(this.context instanceof OfflineAudioContext) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new RangeError('Offline music interval must be 0–300 seconds');
    this.#schedule(this.context.currentTime + seconds, true);
  }
  #schedule(until?: number, offline = false): void {
    const ctx = this.context;
    if (!ctx || (!offline && ctx.state !== 'running')) return;
    this.#retiring = this.#retiring.filter(layer => { if (ctx.currentTime < layer.retireAt) return true; this.#disconnectLayer(layer); return false; });
    const horizon = until ?? ctx.currentTime + 0.15;
    // An outgoing song plays on into its fading layer rather than stopping where the cue changed.
    this.#fading = this.#fading.filter(fade => {
      if (!this.#retiring.includes(fade.layer)) return false;
      this.#play(fade, fade.layer, Math.min(horizon, fade.until), offline);
      return fade.until > horizon;
    });
    if (!this.#layer) return;
    const beatDuration = 60 / this.#score.bpm;
    if (ctx.currentTime - this.#start > beatDuration * (this.#score.beats * (this.#loop + 2) - this.#entryBeat)) {
      this.#start = ctx.currentTime; this.#index = this.#score.notes.findIndex(note => note.beat >= this.#entryBeat); this.#loop = 0;
      if (this.#index === -1) { this.#index = 0; this.#loop = 1; }
    }
    const transport: Transport = { score: this.#score, start: this.#start, entryBeat: this.#entryBeat, index: this.#index, loop: this.#loop };
    this.#play(transport, this.#layer, horizon, offline);
    this.#index = transport.index; this.#loop = transport.loop;
  }
  /** Schedule a transport's notes into a layer up to `until`, advancing its position. */
  #play(transport: Transport, layer: MusicLayer, until: number, offline: boolean): void {
    const ctx = this.context!, { score } = transport, beatDuration = 60 / score.bpm;
    let scheduled = 0;
    while (scheduled++ < (offline ? 100000 : 200)) {
      const note = score.notes[transport.index]!;
      const time = transport.start + (transport.loop * score.beats + note.beat - transport.entryBeat) * beatDuration;
      if (time > until) break;
      if (time >= ctx.currentTime - 0.01 && this.musicEnabled && !this.#externalMusic) this.#note(note, Math.max(time, ctx.currentTime), beatDuration, layer, score);
      if (++transport.index === score.notes.length) { transport.index = 0; transport.loop++; }
    }
  }
  #note(note: ScoreNote, time: number, beat: number, layer: MusicLayer, score: MusicScore): void {
    this.onNote?.(note, time);
    if (note.channel === 9) { this.#drum(note.pitch, time, note.velocity / 127, layer); return; }
    const patch = score.patches?.[note.channel] ?? DEFAULT_PATCHES[note.channel]!;
    playVoice(this.context!, layer.stems[note.channel]!, patch, note.pitch, time, note.duration * beat, note.velocity / 127, note.beat * 31 + note.pitch);
  }
  #tone(pitch: number, time: number, duration: number, volume: number, type: OscillatorType, out: AudioNode): void {
    const ctx = this.context!, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.55), time + Math.max(0.02, duration * 0.65));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.06);
    osc.connect(gain).connect(out); osc.start(time); osc.stop(time + duration + 0.07);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  #drum(pitch: number, time: number, velocity: number, layer: MusicLayer): void {
    const ctx = this.context!, buffer = this.#kit?.get(pitch);
    if (!buffer) return;
    const [reverb, gated, pan, level] = DRUM_SENDS[pitch] ?? [.1, 0, 0, .4];
    const source = ctx.createBufferSource(), gain = ctx.createGain(), position = ctx.createStereoPanner(), nodes: AudioNode[] = [source, gain, position];
    source.buffer = buffer; gain.gain.value = level * velocity ** 1.3; position.pan.value = pan;
    source.connect(gain).connect(position).connect(layer.stems[4]!);
    for (const [amount, target] of [[reverb, layer.drumVerb], [gated, layer.drumGate]] as const) {
      if (!amount) continue;
      const send = ctx.createGain(); send.gain.value = amount; position.connect(send).connect(target); nodes.push(send);
    }
    // A closed hat chokes the ringing open hat, as on a drum machine.
    if (pitch === 42 && this.#openHat) this.#openHat.gain.setTargetAtTime(0, time, .008);
    if (pitch === 46) this.#openHat = gain;
    source.start(time); source.onended = () => nodes.forEach(node => node.disconnect());
  }
  dispose(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null; this.#drive?.dispose(); this.#drive = null;
    if (this.#layer) this.#disconnectLayer(this.#layer); this.#layer = null;
    this.#retiring.forEach(layer => this.#disconnectLayer(layer)); this.#retiring = []; this.#fading = [];
    this.#fx?.dispose(); this.#fx = null; this.#mix?.disconnect(); this.#bus.forEach(node => node.disconnect()); this.#bus = [];
    this.#music?.disconnect(); this.#effects?.disconnect(); this.#master?.disconnect();
    if (this.context instanceof AudioContext) void this.context.close();
    this.context = null;
  }
}
