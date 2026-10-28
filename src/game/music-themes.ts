import type { MusicScore, ScoreNote } from './music-score';

export type SynthPatch = 'round-bass' | 'rubber-bass' | 'pulse' | 'fm-bell' | 'fm-reed' | 'glass' | 'warm-pad' | 'hollow-pad';
export interface ThemeRecipe {
  name: string; japanese: string; file: string; bpm: number; root: number;
  chords: readonly number[]; voicing: readonly number[];
  melody: readonly number[]; response: readonly number[]; rhythm: readonly number[];
  bass: readonly number[]; bassNotes: readonly number[]; kick: readonly number[]; hats: number;
  arp: readonly number[]; swing: number; patches: readonly SynthPatch[];
}
// Each cue has its own harmonic route, two written phrases and drum/bass pattern.
// Interval values are relative to the cue's tonic, not shifted copies of one theme.
export const STORY_THEMES: readonly ThemeRecipe[] = [
  { name: 'Blank Side Promise', japanese: '空白のB面', file: 'blank-side-promise', bpm: 104, root: 48,
    chords: [0, 5, 2, 7, 0, 9, 5, 7], voicing: [0, 4, 7, 11], melody: [12, 16, 19, 18, 16, 14, 12], response: [19, 21, 23, 21, 19, 16, 14, 16], rhythm: [0, .75, 1.5, 2.5, 3, 4.5, 6],
    bass: [0, 3, 7, 8, 11, 14], bassNotes: [0, 7, 12, 4], kick: [0, 7, 8], hats: 2, arp: [0, 11, 7, 16, 7, 12], swing: .045, patches: ['round-bass', 'fm-bell', 'glass', 'warm-pad'] },
  { name: 'Three Weeks of Paper', japanese: '三週間の紙', file: 'three-weeks-of-paper', bpm: 92, root: 41,
    chords: [0, 0, 1, -2, -5, 1, 0, -1], voicing: [0, 3, 7, 14], melody: [19, 18, 15, 14, 12, 13], response: [12, 13, 19, 18, 15, 11, 12], rhythm: [0, 1.5, 2, 3.75, 5, 6.5],
    bass: [0, 5, 8, 13], bassNotes: [0, 0, 7, -1], kick: [0, 10], hats: 4, arp: [0, 7, 1, 12, 7], swing: 0, patches: ['rubber-bass', 'fm-reed', 'pulse', 'hollow-pad'] },
  { name: 'Milk Crates at Midnight', japanese: '真夜中の牛乳箱', file: 'milk-crates-at-midnight', bpm: 116, root: 43,
    chords: [0, 5, 0, -2, 3, 5, 7, 5], voicing: [0, 3, 7, 10], melody: [12, 15, 17, 19, 22, 19, 17, 15], response: [24, 22, 19, 17, 15, 17, 19, 12], rhythm: [0, .5, 1.75, 2.5, 3.5, 4.75, 5.5, 7],
    bass: [0, 2, 6, 8, 10, 15], bassNotes: [0, 12, 7, 10], kick: [0, 6, 9, 14], hats: 2, arp: [0, 7, 10, 15, 12, 7, 3], swing: .07, patches: ['rubber-bass', 'fm-reed', 'glass', 'warm-pad'] },
  { name: 'Carbon Copy Testimony', japanese: '複写紙の証言', file: 'carbon-copy-testimony', bpm: 108, root: 46,
    chords: [0, -2, -5, 0, 3, 1, -2, 0], voicing: [0, 2, 7, 10], melody: [12, 14, 15, 14, 19, 17, 14, 12, 10], response: [22, 19, 17, 15, 14, 10, 12], rhythm: [0, .5, 1.25, 2, 3, 4, 5.5, 6.25, 7],
    bass: [0, 3, 6, 8, 12], bassNotes: [0, 7, 10, 2], kick: [0, 8, 11], hats: 2, arp: [0, 2, 7, 14, 10, 7], swing: 0, patches: ['round-bass', 'pulse', 'fm-bell', 'hollow-pad'] },
  { name: 'Crown on the Grid', japanese: '回路の王冠', file: 'crown-on-the-grid', bpm: 120, root: 36,
    chords: [0, 1, 0, 6, 0, -1, 6, 1], voicing: [0, 6, 7, 13], melody: [24, 25, 19, 18, 24, 30, 25, 24], response: [31, 30, 25, 24, 19, 18, 13, 12], rhythm: [0, .75, 1.5, 2.25, 4, 4.75, 5.5, 7],
    bass: [0, 3, 6, 9, 12, 14], bassNotes: [0, 0, 6, 1], kick: [0, 6, 8, 14], hats: 1, arp: [0, 6, 7, 13, 12], swing: 0, patches: ['rubber-bass', 'fm-reed', 'pulse', 'hollow-pad'] },
  { name: 'Open Circuit Breakfast', japanese: '朝食の回路', file: 'open-circuit-breakfast', bpm: 124, root: 50,
    chords: [0, 7, 5, 2, 0, 4, 5, 7], voicing: [0, 4, 7, 14], melody: [12, 19, 16, 21, 19, 14, 16, 12, 14], response: [24, 21, 19, 16, 14, 19, 21, 23], rhythm: [0, .5, 1, 2.25, 3, 4, 4.75, 6, 7],
    bass: [0, 2, 5, 8, 10, 13, 15], bassNotes: [0, 4, 7, 12], kick: [0, 4, 8, 10, 12], hats: 2, arp: [0, 4, 14, 7, 12, 16, 7], swing: .035, patches: ['round-bass', 'fm-bell', 'pulse', 'warm-pad'] },
  { name: 'One Umbrella, Two Chairs', japanese: 'ひとつの傘、ふたつの椅子', file: 'one-umbrella-two-chairs', bpm: 82, root: 45,
    chords: [0, 5, 9, 4, 2, 7, 5, 0], voicing: [0, 4, 7, 14], melody: [16, 19, 21, 23, 19, 16], response: [14, 16, 19, 16, 14, 12, 11], rhythm: [0, 1, 2.5, 4, 5.5, 7],
    bass: [0, 6, 10], bassNotes: [0, 7, 4, 12], kick: [0, 9], hats: 4, arp: [0, 14, 7, 16, 11, 7], swing: .085, patches: ['round-bass', 'fm-bell', 'glass', 'warm-pad'] },
  { name: 'Glass Permission', japanese: '硝子の許可', file: 'glass-permission', bpm: 98, root: 40,
    chords: [0, 4, 1, -3, 0, 6, 1, -1], voicing: [0, 4, 8, 11], melody: [24, 20, 19, 16, 13, 12, 11], response: [16, 17, 20, 23, 24, 20, 18], rhythm: [0, 1.25, 2, 3.5, 4.25, 6, 7],
    bass: [0, 7, 8, 15], bassNotes: [0, 8, 11, 4], kick: [0, 8], hats: 4, arp: [0, 8, 4, 11, 16, 8], swing: 0, patches: ['rubber-bass', 'glass', 'fm-reed', 'hollow-pad'] },
  { name: 'Two A.M. Relay', japanese: '午前二時のリレー', file: 'two-am-relay', bpm: 132, root: 42,
    chords: [0, -2, 3, 0, 5, 3, -2, -5], voicing: [0, 3, 7, 14], melody: [12, 19, 14, 15, 19, 22, 19, 14, 12, 10], response: [24, 22, 19, 17, 15, 14, 19, 17], rhythm: [0, .25, 1, 1.75, 2.5, 3.5, 4, 5, 6, 7.25],
    bass: [0, 2, 4, 7, 8, 10, 12, 15], bassNotes: [0, 7, 0, 12], kick: [0, 4, 7, 8, 12], hats: 1, arp: [0, 7, 14, 15, 19, 14, 7], swing: 0, patches: ['rubber-bass', 'pulse', 'fm-bell', 'hollow-pad'] },
  { name: 'Dead Air Confession', japanese: '無音の告白', file: 'dead-air-confession', bpm: 68, root: 38,
    chords: [0, 1, -2, -5, 0, 6, 1, 0], voicing: [0, 3, 7, 13], melody: [19, 18, 15, 13, 12], response: [12, 10, 7, 8, 6, 3], rhythm: [0, 1.75, 3.5, 5, 7],
    bass: [0, 11], bassNotes: [0, 7, 1, -5], kick: [0], hats: 8, arp: [0, 7, 13, 3, 12], swing: 0, patches: ['round-bass', 'fm-reed', 'glass', 'hollow-pad'] },
  { name: 'Borrowed Power Waltz', japanese: '借りた電気のワルツ', file: 'borrowed-power-waltz', bpm: 94, root: 47,
    chords: [0, 5, 2, 7, 9, 4, 5, 0], voicing: [0, 4, 7, 11], melody: [12, 16, 14, 19, 16, 21, 19, 14], response: [23, 21, 19, 16, 14, 12, 16, 19], rhythm: [0, .75, 1.5, 2.25, 3.75, 4.5, 5.25, 6.75],
    bass: [0, 3, 6, 9, 12], bassNotes: [0, 7, 12, 4], kick: [0, 6, 12], hats: 3, arp: [0, 7, 16, 11, 7, 12], swing: .03, patches: ['round-bass', 'fm-bell', 'glass', 'warm-pad'] },
  { name: 'The Frequency Home', japanese: '帰り道の周波数', file: 'the-frequency-home', bpm: 110, root: 44,
    chords: [0, 3, 8, 5, 0, 7, 5, 3], voicing: [0, 3, 7, 10], melody: [12, 15, 22, 19, 17, 15, 14, 12], response: [19, 22, 24, 22, 19, 15, 17, 19], rhythm: [0, 1, 1.5, 2.75, 3.5, 4.5, 6, 7.25],
    bass: [0, 3, 5, 8, 11, 14], bassNotes: [0, 10, 7, 12], kick: [0, 5, 8, 14], hats: 2, arp: [0, 10, 7, 15, 12, 19], swing: .055, patches: ['rubber-bass', 'fm-reed', 'fm-bell', 'warm-pad'] },
  { name: 'No Master Key', japanese: '王様のいない鍵', file: 'no-master-key', bpm: 122, root: 41,
    chords: [0, 5, 7, 3, 0, 8, 5, 7], voicing: [0, 3, 7, 14], melody: [12, 12, 19, 17, 15, 19, 24, 22, 19], response: [24, 26, 27, 26, 22, 19, 17, 19], rhythm: [0, .5, 1.25, 2, 3.5, 4, 5, 6, 7.25],
    bass: [0, 2, 6, 7, 8, 12, 14], bassNotes: [0, 7, 12, 3], kick: [0, 4, 8, 11, 12], hats: 2, arp: [0, 7, 12, 14, 15, 19, 7], swing: 0, patches: ['rubber-bass', 'pulse', 'fm-bell', 'warm-pad'] },
  { name: 'Outrun the Dawn', japanese: '夜明けを追い越せ', file: 'outrun-the-dawn', bpm: 148, root: 45,
    chords: [0, -2, 5, 7, 0, 3, 8, 7], voicing: [0, 3, 7, 10], melody: [24, 19, 22, 24, 27, 26, 24, 19, 17, 19], response: [31, 29, 27, 26, 24, 22, 24, 19], rhythm: [0, .5, 1, 1.5, 2.5, 3, 4, 5, 6, 7],
    bass: [0, 2, 4, 6, 7, 8, 10, 12, 14, 15], bassNotes: [0, 12, 7, 10], kick: [0, 4, 8, 12, 15], hats: 1, arp: [0, 7, 10, 12, 19, 15, 14, 7], swing: 0, patches: ['rubber-bass', 'pulse', 'fm-bell', 'warm-pad'] },
  { name: 'Jun: The First Light', japanese: 'ジュン・最初の光', file: 'jun-the-first-light', bpm: 114, root: 48,
    chords: [0, 9, 5, 7, 4, 2, 5, 0], voicing: [0, 4, 7, 14], melody: [12, 14, 19, 16, 21, 19, 23, 24], response: [28, 26, 24, 23, 21, 19, 16, 14, 12], rhythm: [0, .75, 1.5, 2.75, 4, 5, 6, 7],
    bass: [0, 3, 6, 8, 11, 13, 15], bassNotes: [0, 4, 7, 11], kick: [0, 4, 8, 14], hats: 2, arp: [0, 4, 7, 14, 16, 19, 11], swing: .04, patches: ['rubber-bass', 'fm-bell', 'pulse', 'warm-pad'] },
  { name: 'Side B: Press Record', japanese: 'B面・録音を押して', file: 'side-b-press-record', bpm: 88, root: 50,
    chords: [0, 5, 9, 7, 2, 5, 7, 0], voicing: [0, 4, 7, 11], melody: [19, 16, 14, 12, 16, 19, 21], response: [24, 23, 21, 19, 16, 14, 12], rhythm: [0, 1, 2, 3.5, 4.5, 6, 7],
    bass: [0, 7, 10, 14], bassNotes: [0, 7, 4, 12], kick: [0, 10], hats: 4, arp: [0, 11, 16, 7, 14, 12], swing: .075, patches: ['round-bass', 'fm-bell', 'glass', 'warm-pad'] },
];

export function makeThemeScore(theme: ThemeRecipe): MusicScore {
  const notes: ScoreNote[] = [];
  const add = (channel: number, beat: number, duration: number, pitch: number, velocity: number) => {
    if (beat + duration <= 256) notes.push({ channel, beat, duration, pitch, velocity: Math.round(velocity) });
  };
  for (let bar = 0; bar < 64; bar++) {
    const section = Math.floor(bar / 8), root = theme.root + theme.chords[Math.floor(bar / 2) % theme.chords.length]!;
    const thin = section === 0 || section === 4 || section === 7;
    for (const step of theme.bass) {
      if (section === 4 && step !== theme.bass[0]) continue;
      add(0, bar * 4 + step / 4, .22, root + theme.bassNotes[Math.floor(step / 4) % theme.bassNotes.length]!, step === 0 ? 91 : 72);
    }
    for (let step = 0; step < 16; step++) {
      const beat = bar * 4 + step / 4 + (step % 2 ? theme.swing : 0);
      if (step % (thin ? 4 : 2) === 0) add(2, beat, .17, root + 24 + theme.arp[(step / 2 + bar) % theme.arp.length]!, thin ? 35 : 46);
      if (step % theme.hats === 0 && (section !== 4 || step === 0)) add(9, beat, .05, section === 5 && step % 4 === 2 ? 46 : 42, thin ? 29 : step % 4 ? 43 : 56);
      if (theme.kick.includes(step) && section !== 4) add(9, beat, .1, 36, thin ? 62 : 86);
      if ((step === 4 || step === 12) && !thin) add(9, beat, .09, 38, 64);
      if (bar % 8 === 7 && [10, 13, 15].includes(step) && section !== 4) add(9, beat, .08, step === 15 ? 45 : 37, 49);
    }
    if (bar % 2 === 0) {
      const response = [2, 3, 5, 6].includes(section), melody = response ? theme.response : theme.melody;
      for (let n = 0; n < theme.rhythm.length; n++) {
        if (section === 4 && n % 2 !== 0) continue;
        const onset = theme.rhythm[n]!, next = theme.rhythm[n + 1] ?? 8;
        // Different second phrases, sparse middle-eight and a higher final answer.
        add(1, bar * 4 + onset, Math.min(next - onset - .12, thin ? 1.15 : .68), theme.root + 12 + melody[n % melody.length]! + (section === 6 ? 12 : 0), thin ? 56 : 75);
      }
    }
    for (const interval of theme.voicing) add(3, bar * 4, 3.75, root + 12 + interval, section === 4 ? 38 : 29);
  }
  return { name: theme.name, bpm: theme.bpm, beats: 256, patches: theme.patches,
    notes: notes.sort((a, b) => a.beat - b.beat || a.channel - b.channel || a.pitch - b.pitch) };
}
