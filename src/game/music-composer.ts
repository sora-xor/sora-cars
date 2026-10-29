import type { MusicScore, ScoreNote } from './music-score';

export type SynthPatch = 'round-bass' | 'rubber-bass' | 'moog-bass' | 'fm-bass'
  | 'pulse' | 'sync-lead' | 'fm-reed' | 'whistle' | 'vocoder'
  | 'fm-bell' | 'glass' | 'pluck' | 'marimba' | 'koto' | 'clav' | 'epiano'
  | 'warm-pad' | 'hollow-pad' | 'string-pad' | 'brass' | 'vox-pad';
export type Mode = 'major' | 'minor' | 'dorian' | 'mixolydian' | 'lydian' | 'phrygian' | 'harmonic';
export type Groove = 'technopop' | 'drive' | 'motorik' | 'citypop' | 'halftime' | 'ballad' | 'waltz12';
export type BassStyle = 'octave' | 'sequencer16' | 'funk' | 'pulse8' | 'ballad' | 'twelve8';
export type ArpStyle = 'up16' | 'updown16' | 'pulse16' | 'comp' | 'signal' | 'bells' | 'triplet';
export type PadStyle = 'sustain' | 'stab';
export interface MusicFx { reverb: number; delay: number; chorus: number; }

/** One original song. Harmony is written in Roman numerals relative to the tonic;
 * hooks are absolute pitches (`E5:.5`, `r:1`, `C#5:1/3`) with `|` between 4/4 bars. */
export interface SongSpec {
  readonly name: string; readonly japanese: string; readonly file: string;
  readonly bpm: number; readonly root: number; readonly mode: Mode;
  readonly groove: Groove; readonly swing?: number;
  readonly bass: BassStyle; readonly arp: ArpStyle; readonly pad: PadStyle;
  readonly patches: readonly [SynthPatch, SynthPatch, SynthPatch, SynthPatch];
  /** Eight bars each. The verse also carries the intro, solo and outro. */
  readonly verse: string; readonly chorus: string; readonly bridge: string;
  /** Four- or eight-bar melodies; four-bar hooks repeat with an optional final-bar ending. */
  readonly hookA: string; readonly hookB: string; readonly hookAEnd?: string; readonly hookBEnd?: string;
  /** Semitones the final chorus modulates upward; the outro turns back home before looping. */
  readonly lift?: number;
  readonly fx?: Partial<MusicFx>;
}

// Eight eight-bar sections. Cue entrances rely on this form: 32 is the first full
// statement, 64/96 the chorus answer, 128 the sparse middle and 192 the lifted finale.
export const SONG_FORM = ['intro', 'verse', 'chorus', 'answer', 'bridge', 'solo', 'final', 'outro'] as const;
type Section = typeof SONG_FORM[number];
const ENERGY: Record<Section, number> = { intro: .76, verse: .8, chorus: 1, answer: .94, bridge: .7, solo: .9, final: 1.08, outro: .76 };
const SCALES: Record<Mode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
};
const MAJOR: Record<string, readonly number[]> = {
  '': [0, 4, 7], '6': [0, 4, 7, 9], '69': [0, 4, 7, 9, 14], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14],
  'maj7#11': [0, 4, 7, 11, 18], '9': [0, 4, 7, 10, 14], '13': [0, 4, 7, 10, 14, 21], add9: [0, 4, 7, 14], sus2: [0, 2, 7],
  sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], '7b9': [0, 4, 7, 10, 13], '+': [0, 4, 8], '7#5': [0, 4, 8, 10],
};
const MINOR: Record<string, readonly number[]> = {
  '': [0, 3, 7], '6': [0, 3, 7, 9], '7': [0, 3, 7, 10], '9': [0, 3, 7, 10, 14], '11': [0, 3, 7, 10, 14, 17],
  add9: [0, 3, 7, 14], maj7: [0, 3, 7, 11], 'ø': [0, 3, 6, 10], o: [0, 3, 6], o7: [0, 3, 6, 9],
};
const DEGREE: Record<string, number> = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };
const NUMERAL = 'VII|III|II|IV|VI|V|I|vii|iii|ii|iv|vi|v|i';
const CHORD = new RegExp(`^([b#]?)(${NUMERAL})([^/:]*)(?:/([b#]?)(${NUMERAL}))?(?::(\\d+(?:\\.\\d+)?))?$`);
const NOTE = /^([A-G])([#b]*)(-?\d)$/;
const KICK = 36, RIM = 37, SNARE = 38, CLAP = 39, HAT = 42, TOM_LO = 45, OPEN_HAT = 46, TOM_MID = 48;
const CRASH = 49, TOM_HI = 50, RIDE = 51, TAMBOURINE = 54, COWBELL = 56, SHAKER = 70, CLAVES = 75;

interface Chord { degree: number; tones: readonly number[]; bass: number; beats: number; }
interface Slot { start: number; end: number; root: number; tones: readonly number[]; bass: number; }
interface Phrase { beat: number; duration: number; pitch: number; }
interface Percussion { pitch: number; steps: readonly number[]; velocity: number; }
interface GrooveSpec {
  grid: 16 | 12; kick: readonly number[]; snare: readonly number[]; ghost?: readonly number[];
  hats: readonly number[]; accents: readonly number[]; open: readonly number[]; busy?: boolean;
  verseSnare?: number; versePerc?: Percussion; chorusPerc?: Percussion; clap?: boolean; fill: 'tom' | 'snare';
}
const ALL16 = Array.from({ length: 16 }, (_, i) => i), EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];
const GROOVES: Record<Groove, GrooveSpec> = {
  technopop: { grid: 16, kick: [0, 8, 10], snare: [4, 12], hats: EIGHTHS, accents: [2, 6, 10, 14], open: [14], busy: true,
    versePerc: { pitch: CLAVES, steps: [3, 6, 11], velocity: 50 }, chorusPerc: { pitch: COWBELL, steps: [2, 7, 10, 15], velocity: 52 }, clap: true, fill: 'tom' },
  drive: { grid: 16, kick: [0, 4, 8, 12], snare: [4, 12], hats: ALL16, accents: EIGHTHS, open: [2, 6, 10, 14],
    chorusPerc: { pitch: TAMBOURINE, steps: [4, 12], velocity: 56 }, clap: true, fill: 'snare' },
  motorik: { grid: 16, kick: [0, 4, 8, 12], snare: [4, 12], hats: EIGHTHS, accents: [0, 4, 8, 12], open: [],
    versePerc: { pitch: SHAKER, steps: ALL16, velocity: 34 }, chorusPerc: { pitch: TAMBOURINE, steps: [2, 6, 10, 14], velocity: 50 }, fill: 'tom' },
  citypop: { grid: 16, kick: [0, 7, 10], snare: [4, 12], ghost: [9, 15], hats: ALL16, accents: EIGHTHS, open: [14],
    chorusPerc: { pitch: TAMBOURINE, steps: [4, 12], velocity: 44 }, fill: 'tom' },
  halftime: { grid: 16, kick: [0, 3, 10], snare: [8], hats: ALL16, accents: [0, 4, 8, 12], open: [],
    versePerc: { pitch: RIM, steps: [6, 14], velocity: 46 }, chorusPerc: { pitch: CLAVES, steps: [2, 7, 13], velocity: 48 }, clap: true, fill: 'tom' },
  ballad: { grid: 16, kick: [0, 10], snare: [4, 12], verseSnare: RIM, hats: EIGHTHS, accents: [0, 4, 8, 12], open: [],
    chorusPerc: { pitch: SHAKER, steps: ALL16, velocity: 30 }, fill: 'tom' },
  waltz12: { grid: 12, kick: [0, 6], snare: [3, 9], verseSnare: RIM, hats: Array.from({ length: 12 }, (_, i) => i), accents: [0, 3, 6, 9], open: [],
    chorusPerc: { pitch: SHAKER, steps: [1, 2, 4, 5, 7, 8, 10, 11], velocity: 30 }, fill: 'tom' },
};
type BassHit = [step: number, length: number, note: 'R' | '5' | '8' | 'A', velocity: number];
const BASS: Record<BassStyle, { grid: 16 | 12; hits: readonly BassHit[] }> = {
  octave: { grid: 16, hits: [[0, 1.7, 'R', 100], [2, 1.7, '8', 80], [4, 1.7, 'R', 94], [6, 1.7, '8', 80], [8, 1.7, 'R', 98], [10, 1.7, '8', 80], [12, 1.7, 'R', 94], [14, 1.7, 'A', 86]] },
  sequencer16: { grid: 16, hits: (['R', 'R', '8', 'R', '5', 'R', '8', 'R', 'R', 'R', '8', 'R', '5', '8', 'R', 'A'] as const).map((note, step): BassHit => [step, .8, note, step % 4 ? 70 : 100]) },
  funk: { grid: 16, hits: [[0, 2, 'R', 104], [3, 1, 'R', 64], [6, 1, '8', 92], [8, 2, 'R', 96], [10, 1, '5', 74], [11, 1, '8', 56], [14, 2, 'A', 84]] },
  pulse8: { grid: 16, hits: EIGHTHS.map((step): BassHit => [step, 1.6, 'R', step % 4 ? 76 : 96]) },
  ballad: { grid: 16, hits: [[0, 6, 'R', 96], [6, 2, '5', 70], [8, 5, 'R', 86], [14, 2, 'A', 72]] },
  twelve8: { grid: 12, hits: [[0, 2.5, 'R', 98], [2, 1, '5', 62], [3, 2, '8', 80], [6, 2.5, 'R', 92], [8, 1, '5', 60], [9, 1.5, '8', 76], [11, 1, 'A', 70]] },
};
const DEFAULT_FX: Record<Groove, MusicFx> = {
  technopop: { reverb: .9, delay: 1, chorus: .8 }, drive: { reverb: .85, delay: 1, chorus: .8 }, motorik: { reverb: .75, delay: 1.1, chorus: .7 },
  citypop: { reverb: 1, delay: .8, chorus: 1.1 }, halftime: { reverb: 1.1, delay: 1.1, chorus: .9 },
  ballad: { reverb: 1.35, delay: .9, chorus: 1.15 }, waltz12: { reverb: 1.25, delay: .85, chorus: 1.1 },
};
const BELL_LIKE: ReadonlySet<SynthPatch> = new Set(['fm-bell', 'glass', 'marimba', 'koto', 'pluck']);

const mod = (value: number, size: number) => ((value % size) + size) % size;
function random(seed: string) {
  let state = 2166136261;
  for (const letter of seed) state = Math.imul(state ^ letter.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function degreeOf(accidental: string, numeral: string) {
  return DEGREE[numeral.toLowerCase()]! + (accidental === 'b' ? -1 : accidental === '#' ? 1 : 0);
}
export function parseProgression(text: string, label: string): Chord[] {
  const chords = text.split(/[\s|]+/).filter(Boolean).map(token => {
    const match = CHORD.exec(token);
    if (!match) throw new SyntaxError(`${label}: unreadable chord ${token}`);
    const [, accidental = '', numeral = '', quality = '', bassAccidental = '', bassNumeral, beats] = match;
    const tones = (numeral === numeral.toUpperCase() ? MAJOR : MINOR)[quality];
    if (!tones) throw new SyntaxError(`${label}: unknown quality ${token}`);
    const degree = degreeOf(accidental, numeral);
    return { degree, tones, bass: bassNumeral ? degreeOf(bassAccidental, bassNumeral) : degree, beats: beats ? Number(beats) : 4 };
  });
  const total = chords.reduce((sum, chord) => sum + chord.beats, 0);
  if (total !== 32) throw new RangeError(`${label}: progression lasts ${total} beats, not eight bars`);
  return chords;
}
export function noteNumber(name: string): number {
  const match = NOTE.exec(name);
  if (!match) throw new SyntaxError(`Unreadable pitch ${name}`);
  const letter = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1] as 'C'];
  return (Number(match[3]) + 1) * 12 + letter + [...match[2]!].reduce((sum, sign) => sum + (sign === '#' ? 1 : -1), 0);
}
export function parseMelody(text: string, label: string): Phrase[] {
  const notes: Phrase[] = [];
  const bars = text.split('|');
  bars.forEach((bar, index) => {
    let length = 0;
    for (const token of bar.trim().split(/\s+/).filter(Boolean)) {
      const [name = '', value = ''] = token.split(':');
      const [top, bottom] = value.split('/');
      const duration = bottom === undefined ? Number(top) : Number(top) / Number(bottom);
      if (!(duration > 0)) throw new SyntaxError(`${label}: unreadable duration ${token}`);
      if (name !== 'r') notes.push({ beat: index * 4 + length, duration, pitch: noteNumber(name) });
      length += duration;
    }
    if (Math.abs(length - 4) > 1e-6) throw new RangeError(`${label}: bar ${index + 1} lasts ${length} beats`);
  });
  if (bars.length !== 4 && bars.length !== 8) throw new RangeError(`${label}: hooks are four or eight bars`);
  return notes;
}

/** Arranges a complete 64-bar song from its written harmony, hooks and groove. */
export function composeSong(spec: SongSpec): MusicScore {
  const rng = random(spec.file), notes: ScoreNote[] = [], tonic = mod(spec.root, 12), lift = spec.lift ?? 0;
  const groove = GROOVES[spec.groove], scale = SCALES[spec.mode];
  const add = (channel: number, beat: number, duration: number, pitch: number, velocity: number) => {
    if (duration > 0 && beat >= 0 && beat < 256) notes.push({ channel, beat, duration: Math.min(duration, 256 - beat), pitch, velocity: Math.max(1, Math.min(127, Math.round(velocity))) });
  };
  const humanize = (velocity: number, spread = 5) => velocity + (rng() * 2 - 1) * spread;

  // Harmony timeline, including the pivot into the lifted finale and the turnaround home.
  const progressions = { verse: parseProgression(spec.verse, `${spec.name} verse`), chorus: parseProgression(spec.chorus, `${spec.name} chorus`), bridge: parseProgression(spec.bridge, `${spec.name} bridge`) };
  let slots: Slot[] = [];
  SONG_FORM.forEach((section, index) => {
    const chords = section === 'bridge' ? progressions.bridge : section === 'chorus' || section === 'answer' || section === 'final' ? progressions.chorus : progressions.verse;
    const shift = section === 'final' || section === 'outro' ? lift : 0;
    let at = index * 32;
    for (const chord of chords) { slots.push({ start: at, end: at + chord.beats, root: chord.degree + shift, tones: chord.tones, bass: chord.bass + shift }); at += chord.beats; }
  });
  const replace = (from: number, to: number, chords: readonly [number, string, number][]) => {
    slots = slots.flatMap(slot => slot.end <= from || slot.start >= to ? [slot]
      : [...slot.start < from ? [{ ...slot, end: from }] : [], ...slot.end > to ? [{ ...slot, start: to }] : []]);
    let at = from;
    for (const [degree, quality, beats] of chords) { slots.push({ start: at, end: at + beats, root: degree, tones: MAJOR[quality]!, bass: degree }); at += beats; }
    slots.sort((a, b) => a.start - b.start);
  };
  if (lift) { replace(188, 192, [[7 + lift, '7sus4', 2], [7 + lift, '7', 2]]); replace(248, 256, [[7, '7sus4', 4], [7, '7', 4]]); }
  const chordAt = (beat: number) => slots.find(slot => beat >= slot.start - 1e-9 && beat < slot.end - 1e-9) ?? slots[slots.length - 1]!;
  const pcs = (slot: Slot) => slot.tones.map(tone => mod(tonic + slot.root + tone, 12));
  const near = (pc: number, target: number, low: number, high: number) => {
    let best = low, cost = Infinity;
    for (let pitch = low; pitch <= high; pitch++) if (mod(pitch, 12) === pc && Math.abs(pitch - target) < cost) { best = pitch; cost = Math.abs(pitch - target); }
    return best;
  };

  // Strong-beat melody notes may not sit a half step above a chord tone.
  const fit = (pitch: number, beat: number, duration: number) => {
    if (!(beat % 1 === 0 && duration >= .5) && duration < 1) return pitch;
    const slot = chordAt(beat), tones = pcs(slot), core = tones.filter((_, i) => i < 4 && slot.tones[i]! < 12);
    return !tones.includes(mod(pitch, 12)) && core.includes(mod(pitch - 1, 12)) ? pitch - 1 : pitch;
  };
  const nearestTone = (slot: Slot, target: number, low: number, high: number) => pcs(slot)
    .map(pc => near(pc, target, low, high)).reduce((best, pitch) => Math.abs(pitch - target) < Math.abs(best - target) ? pitch : best);
  const hook = (text: string, ending: string | undefined, label: string) => {
    const phrase = parseMelody(text, label);
    if (text.split('|').length === 8) return phrase;
    const close = ending ? parseMelody(`${ending} | r:4 | r:4 | r:4`, `${label} ending`).map(note => ({ ...note, beat: note.beat + 28 })) : [];
    return [...phrase, ...phrase.filter(note => !close.length || note.beat < 12).map(note => ({ ...note, beat: note.beat + 16 })), ...close];
  };
  const verseHook = hook(spec.hookA, spec.hookAEnd, `${spec.name} hook A`), chorusHook = hook(spec.hookB, spec.hookBEnd, `${spec.name} hook B`);
  const leadPitches = [...verseHook, ...chorusHook].map(note => note.pitch);
  const leadLow = Math.min(...leadPitches), leadHigh = Math.max(...leadPitches), leadCenter = (leadLow + leadHigh) / 2;
  const arpDoubles = BELL_LIKE.has(spec.patches[2]) && spec.arp !== 'comp', doubleShift = leadHigh + 12 <= 93 ? 12 : 0;
  const melody = (phrase: Phrase[], start: number, transpose: number, velocity: number, options: { double?: 'octave-below' | 'arp'; limit?: number } = {}) => {
    for (const note of phrase) {
      if (options.limit !== undefined && note.beat >= options.limit) continue;
      const beat = start + note.beat, pitch = fit(note.pitch + transpose, beat, note.duration);
      const accent = note.beat % 4 === 0 ? 6 : note.beat % 1 === 0 ? 2 : -3;
      add(1, beat, note.duration - .04, pitch, humanize(velocity + accent, 3));
      if (options.double === 'octave-below') add(1, beat, note.duration - .04, pitch - 12, humanize(velocity * .62, 3));
      if (options.double === 'arp') add(2, beat, Math.min(note.duration, 1.5) - .04, pitch + doubleShift, humanize(velocity * .58, 3));
    }
  };

  // Lead line: statement, chorus, answer, sparse middle, solo, lifted finale and outro.
  melody(verseHook, 32, 0, 92);
  melody(chorusHook, 64, 0, 100);
  melody(chorusHook, 96, 0, 94, arpDoubles ? { double: 'arp' } : {});
  let held = Math.round(leadCenter);
  for (let bar = 36; bar < 40; bar++) for (const offset of [0, 2]) {
    const beat = bar * 4 + offset;
    held = nearestTone(chordAt(beat), held, leadLow, leadHigh);
    if (bar < 39 || offset === 0) add(1, beat, 1.9, held, humanize(58, 3));
  }
  // The solo borrows the verse's rhythm on alternate bars, answers in eighths,
  // climbs a sixteenth-note run and lands on a held chord tone.
  const steps = scale.map(degree => mod(tonic + degree, 12));
  const inScale = (pitch: number) => steps.includes(mod(pitch, 12));
  const stepFrom = (pitch: number, direction: number) => { let next = pitch + direction; while (!inScale(next)) next += direction; return next; };
  let line = Math.round(leadCenter);
  for (let bar = 0; bar < 8; bar++) {
    const borrowed = verseHook.filter(note => note.beat >= (bar % 4) * 4 && note.beat < (bar % 4) * 4 + 4).map(note => [note.beat % 4, note.duration] as const);
    const rhythm: readonly (readonly [number, number])[] = bar === 6 ? Array.from({ length: 16 }, (_, i) => [i / 4, .25] as const)
      : bar === 7 ? [[0, 2.5]] : bar % 2 || !borrowed.length ? [[0, .5], [.5, .5], [1, .5], [1.5, .5], [2, 1], [3, .5], [3.5, .5]] : borrowed;
    rhythm.forEach(([offset, length], index) => {
      const at = 160 + bar * 4 + offset;
      if (bar === 6) line = stepFrom(line, line >= leadHigh ? -1 : 1);
      else {
        const move = [-2, -1, -1, 1, 1, 2, 3, -3][Math.floor(rng() * 8)]!;
        for (let n = 0; n < Math.abs(move); n++) line = stepFrom(line, Math.sign(move));
        if (line > leadHigh) line = stepFrom(line - 7, -1);
        if (line < leadLow - 2) line = stepFrom(line + 7, 1);
      }
      if (at % 1 === 0 || length >= 1) line = nearestTone(chordAt(at), line, line - 6, line + 6);
      add(1, at, length - .04, line, humanize(bar === 6 ? 70 + index * 2 : 84, 4));
    });
  }
  melody(chorusHook, 192, lift, 104, { double: 'octave-below' });
  melody(verseHook, 224, lift, 80, { limit: 16 });

  // Voice-led pads: guide tones first, smallest total motion from the previous chord.
  const voicings = new Map<Slot, number[]>();
  let previous: number[] | null = null;
  for (const slot of slots) {
    const order = [1, 3, 4, 2, 5, 0].filter(index => index < slot.tones.length);
    // Melody-aware: leave out tones a half step under a held melody note (no minor ninths).
    const sung = new Set(notes.filter(note => note.channel === 1 && note.duration >= .45 && note.beat < slot.end && note.beat + note.duration > slot.start).map(note => mod(note.pitch, 12)));
    const ranked = [...new Set(order.map(index => mod(tonic + slot.root + slot.tones[index]!, 12)))];
    const clear = ranked.filter(pc => !sung.has(mod(pc + 1, 12)));
    const chosen = (clear.length >= 3 ? clear : ranked).slice(0, 4);
    const options = chosen.map(pc => Array.from({ length: 24 }, (_, i) => 54 + i).filter(pitch => mod(pitch, 12) === pc));
    let best: number[] = [], bestCost = Infinity;
    const search = (index: number, picked: number[]) => {
      if (index === options.length) {
        const sorted = [...picked].sort((a, b) => a - b);
        if (sorted[1]! - sorted[0]! < 3 || sorted[sorted.length - 1]! - sorted[0]! > 19) return;
        const cost = previous && previous.length === sorted.length
          ? sorted.reduce((sum, pitch, i) => sum + Math.abs(pitch - previous![i]!), 0)
          : Math.abs(sorted.reduce((sum, pitch) => sum + pitch, 0) / sorted.length - 65) * 2;
        if (cost < bestCost) { bestCost = cost; best = sorted; }
        return;
      }
      for (const pitch of options[index]!) search(index + 1, [...picked, pitch]);
    };
    search(0, []);
    if (!best.length) best = chosen.map(pc => near(pc, 64, 54, 77)).sort((a, b) => a - b);
    voicings.set(slot, best); previous = best;
  }

  // Bass, pads and arpeggios follow the same timeline.
  const bassPattern = BASS[spec.bass];
  let bassLast = near(tonic, 37, 31, 42);
  const bassNote = (offset: number) => (bassLast = near(mod(tonic + offset, 12), bassLast, 28, 47));
  const arpLow = 62, arpPool = (slot: Slot) => [...new Set(pcs(slot))].flatMap(pc => [near(pc, arpLow + 5, arpLow, arpLow + 11), near(pc, arpLow + 17, arpLow + 12, arpLow + 23)]).sort((a, b) => a - b);
  const signal = Array.from({ length: 16 }, (_, step) => step === 0 || (step % 4 !== 1 && rng() < .42));
  for (let bar = 0; bar < 64; bar++) {
    const section = SONG_FORM[Math.floor(bar / 8)]!, local = bar % 8, energy = ENERGY[section], at = bar * 4;
    // Bass enters in the third intro bar and sustains through the sparse middle.
    if (section === 'bridge' || (section === 'outro' && local >= 6)) {
      for (const slot of slots) if (slot.start >= at && slot.start < at + 4) add(0, slot.start, slot.end - slot.start - .06, bassNote(slot.bass), 84 * energy);
    } else if (section !== 'intro' || local >= 2) {
      const unit = 4 / bassPattern.grid;
      for (const [step, length, kind, velocity] of bassPattern.hits) {
        const beat = at + step * unit, slot = chordAt(beat), next = chordAt(Math.min(255.99, beat + length * unit + .01));
        const root = bassNote(slot.bass);
        const pitch = kind === 'R' ? root : kind === '5' ? root + 7 : kind === '8' ? root + 12
          : next.bass !== slot.bass ? near(mod(tonic + next.bass, 12), root, root - 6, root + 6) - 1 : spec.bass === 'octave' ? root + 12 : root;
        add(0, beat, length * unit - .03, pitch < 28 ? pitch + 12 : pitch, humanize(velocity * energy));
        bassLast = root;
      }
    }
    // Pads: sustained voicings, rhythmic stabs in choruses for brass-style songs.
    for (const slot of slots) {
      if (slot.end <= at || slot.start >= at + 4) continue;
      const from = Math.max(slot.start, at), to = Math.min(slot.end, at + 4), voicing = voicings.get(slot)!;
      const stabs = spec.pad === 'stab' && (section === 'chorus' || section === 'answer' || section === 'final');
      if (stabs) for (const [offset, length] of [[0, .5], [1.5, .4], [3, .3], [3.5, .4]] as const) {
        const beat = at + offset;
        if (beat >= from && beat < to) for (const pitch of voicing) add(3, beat, length, pitch, humanize(76 * energy, 3));
      } else if (from === slot.start) {
        const outroFade = section === 'outro' ? 1 - local / 24 : 1;
        for (const pitch of voicing) add(3, slot.start, slot.end - slot.start - .05, pitch, humanize(64 * energy * outroFade, 2));
      }
    }
    // Arpeggios and comping.
    if (section === 'answer' && arpDoubles) continue;
    const arpEnergy = energy * (section === 'intro' ? .86 + local * .02 : section === 'bridge' ? .85 : 1);
    if (spec.arp === 'comp') {
      const hits: readonly (readonly [number, number])[] = bar % 2 ? [[.5, .4], [1.5, .75], [3, .9]] : [[0, .75], [1.5, .4], [2.5, .9], [3.5, .4]];
      for (const [offset, length] of hits) {
        if (section === 'bridge' && offset % 1) continue;
        const beat = at + offset, slot = chordAt(beat), voicing = voicings.get(slot)!;
        for (const pitch of voicing.slice(-3)) add(2, beat, length, pitch + (Math.max(...voicing) < 70 ? 12 : 0), humanize(70 * arpEnergy, 4));
      }
    } else if (spec.arp === 'triplet') {
      for (let step = 0; step < 12; step++) {
        const beat = at + step / 3, pool = arpPool(chordAt(beat)), cycle = [...pool, ...pool.slice(1, -1).reverse()];
        if (section === 'bridge' && step % 3) continue;
        add(2, beat, .3, cycle[(step + bar * 12) % cycle.length]!, humanize((step % 3 ? 54 : 72) * arpEnergy, 4));
      }
    } else if (spec.arp === 'bells') {
      for (let step = 0; step < 8; step++) {
        if (rng() > (section === 'bridge' ? .3 : .46)) continue;
        const beat = at + step / 2, pool = arpPool(chordAt(beat)).map(pitch => pitch + (pitch + 12 <= 91 ? 12 : 0));
        add(2, beat, .45, pool[Math.floor(rng() * pool.length)]!, humanize(62 * arpEnergy, 8));
      }
    } else {
      for (let step = 0; step < 16; step++) {
        if (section === 'bridge' && step % 2) continue;
        const beat = at + step / 4, slot = chordAt(beat), pool = arpPool(slot);
        const accent = [96, 44, 66, 44, 88, 44, 66, 52, 92, 44, 66, 44, 84, 52, 72, 56][step]!;
        if (spec.arp === 'pulse16') {
          for (const pitch of voicings.get(slot)!.slice(-2)) add(2, beat, .16, pitch + 12, humanize(accent * .9 * arpEnergy, 3));
        } else if (spec.arp === 'signal') {
          if (!signal[step]) continue;
          const tones = pcs(slot), pitch = near(tones[Math.min(2, tones.length - 1)]!, 76, 70, 81) + (step % 8 === 6 ? 12 : 0);
          add(2, beat, .13, pitch, humanize((step % 4 ? 70 : 88) * arpEnergy, 4));
        } else {
          const index = Math.round((beat - slot.start) * 4), cycle = spec.arp === 'updown16' ? [...pool, ...pool.slice(1, -1).reverse()] : pool;
          add(2, beat, .2, cycle[index % cycle.length]!, humanize(accent * .82 * arpEnergy, 3));
        }
      }
    }
  }

  // Drums: groove by section, crashes on arrivals, fills into each new section.
  const unit = 4 / groove.grid;
  for (let bar = 0; bar < 64; bar++) {
    const section = SONG_FORM[Math.floor(bar / 8)]!, local = bar % 8, energy = ENERGY[section], at = bar * 4;
    const intro = section === 'intro', bridge = section === 'bridge', outro = section === 'outro';
    const chorusLike = section === 'chorus' || section === 'answer' || section === 'final';
    const kick = intro ? local >= 4 : bridge ? local >= 4 && local < 7 : true;
    const snare = intro ? local >= 6 : bridge ? false : outro ? local < 6 : true;
    const hats = intro ? local >= 2 || spec.groove === 'drive' || spec.groove === 'motorik' : true;
    const perc = chorusLike ? groove.chorusPerc : (section === 'verse' || section === 'solo' || (outro && local < 4)) ? groove.versePerc : undefined;
    const ride = section === 'answer' && (spec.groove === 'citypop' || spec.groove === 'ballad' || spec.groove === 'halftime');
    const sixteenths = groove.busy && (section === 'final' || section === 'answer');
    const fill = local === 7 && !bridge && !outro, roll = bridge && local === 7;
    const fillFrom = groove.fill === 'snare' ? groove.grid * .75 : groove.grid / 2;
    if ([1, 2, 3, 5, 6].includes(Math.floor(bar / 8)) && local === 0) add(9, at, .5, CRASH, humanize(92 * energy));
    if (section === 'final' && local === 4) add(9, at, .5, CRASH, humanize(72));
    if (outro && local === 0) add(9, at, .5, CRASH, 64);
    for (let step = 0; step < groove.grid; step++) {
      const beat = at + step * unit, filling = (fill && step >= fillFrom) || roll;
      if (roll) { add(9, beat, .1, SNARE, 26 + 80 * step / groove.grid); continue; }
      if (filling) {
        if (groove.fill === 'snare') add(9, beat, .1, SNARE, humanize(60 + (step - fillFrom) * 14));
        else {
          const at16 = (step - fillFrom) / (groove.grid - fillFrom), drum = at16 < .34 ? TOM_HI : at16 < .67 ? TOM_MID : TOM_LO;
          if (groove.grid === 12 || step % 2 === 0 || step >= groove.grid - 4) add(9, beat, .2, drum, humanize(72 + at16 * 38));
        }
        if (step === fillFrom) add(9, beat, .1, KICK, 100);
        continue;
      }
      if (kick && groove.kick.includes(step)) add(9, beat, .1, KICK, humanize((step === 0 ? 108 : 96) * Math.min(1, energy + .1), 3));
      if (snare && groove.snare.includes(step)) {
        const drum = section === 'verse' || intro || outro ? groove.verseSnare ?? SNARE : SNARE;
        add(9, beat, .1, drum, humanize(drum === RIM ? 74 : 98 * Math.min(1, energy + .08), 3));
        if (groove.clap && chorusLike) add(9, beat, .1, CLAP, humanize(78, 4));
      }
      if (snare && groove.ghost?.includes(step) && !intro) add(9, beat, .08, SNARE, humanize(24, 3));
      const hatSteps = sixteenths ? ALL16 : groove.hats;
      if (hats && hatSteps.includes(step)) {
        const open = (chorusLike || section === 'solo') && groove.open.includes(step);
        const accent = groove.accents.includes(step);
        const velocity = (accent ? 68 : 42) * (bridge || intro ? .72 : 1) * energy;
        if (ride) { if (step % (groove.grid === 12 ? 3 : 2) === 0) add(9, beat, .3, RIDE, humanize(velocity + 6, 4)); }
        else add(9, beat, open ? .2 : .06, open ? OPEN_HAT : HAT, humanize(open ? velocity * .9 : velocity, 4));
      }
      if (perc?.steps.includes(step)) add(9, beat, .1, perc.pitch, humanize(perc.velocity * energy, 4));
    }
  }

  // Swing the off sixteenths, then make every channel playable as clean MIDI.
  const swing = groove.grid === 16 ? spec.swing ?? 0 : 0;
  for (const note of notes) {
    if (swing && Math.abs(mod(note.beat * 4, 2) - 1) < 1e-6) note.beat += swing;
    note.beat = Math.round(note.beat * 480) / 480; note.duration = Math.round(note.duration * 480) / 480;
  }
  notes.sort((a, b) => a.beat - b.beat || a.channel - b.channel || a.pitch - b.pitch);
  const open = new Map<string, ScoreNote>();
  const clean = notes.filter(note => {
    const key = `${note.channel}:${note.pitch}`, before = open.get(key);
    if (before && before.beat === note.beat) { before.velocity = Math.max(before.velocity, note.velocity); return false; }
    if (before && before.beat + before.duration > note.beat - 1 / 240) before.duration = Math.max(1 / 240, note.beat - before.beat - 1 / 240);
    open.set(key, note);
    note.duration = Math.min(note.duration, 256 - note.beat);
    return note.duration > 0;
  });
  const base = DEFAULT_FX[spec.groove];
  return { name: spec.name, bpm: spec.bpm, beats: 256, notes: clean, patches: spec.patches,
    fx: { reverb: base.reverb * (spec.fx?.reverb ?? 1), delay: base.delay * (spec.fx?.delay ?? 1), chorus: base.chorus * (spec.fx?.chorus ?? 1) } };
}
