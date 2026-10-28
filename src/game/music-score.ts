import { makeThemeScore, STORY_THEMES, type SynthPatch } from './music-themes.ts';
/** Original compositions: MIDI pitches, quarter-note beats; no sampled commercial music. */
export interface ScoreNote { beat: number; duration: number; pitch: number; velocity: number; channel: number; }
export interface MusicScore { name: string; bpm: number; beats: number; notes: ScoreNote[]; patches?: readonly SynthPatch[]; }
export const MUSIC_LIBRARY = [
  { name: 'Midnight Transistor', japanese: '真夜中のトランジスタ', file: 'midnight-transistor', bpm: 142, root: 45, style: 0 },
  { name: 'Harbor Signals', japanese: '港のシグナル', file: 'harbor-signals', bpm: 126, root: 38, style: 1 },
  { name: 'Sakura Express', japanese: '桜エクスプレス', file: 'sakura-express', bpm: 156, root: 42, style: 2 },
  { name: 'Soramotos Workshop', japanese: '空本工房の灯り', file: 'soramotos-workshop', bpm: 96, root: 48, style: 1 },
  { name: 'Paper Towers', japanese: '紙の摩天楼', file: 'paper-towers', bpm: 112, root: 41, style: 0 },
  { name: 'A Future We Build', japanese: '私たちがつくる明日', file: 'a-future-we-build', bpm: 118, root: 47, style: 2 },
  { name: 'After the Last Train', japanese: '終電のあとで', file: 'after-the-last-train', bpm: 102, root: 43, style: 1 },
  { name: 'Credit Line', japanese: '信用の向こう側', file: 'credit-line', bpm: 136, root: 40, style: 0 },
  { name: 'SORA Dawn Broadcast', japanese: 'SORA 夜明けの放送', file: 'sora-dawn-broadcast', bpm: 128, root: 50, style: 2 },
  ...STORY_THEMES,
] as const;
const harmonies = [[0, 0, 3, -2, -4, -2, 0, -5], [0, 3, 5, 0, 8, 5, 3, 7], [0, 3, 5, 0, -2, 3, 5, 7]];
const melodies = [[12, 19, 16, 14, 12, 7, 9, 12, 16, 19, 21, 19, 16, 14, 12, 7], [12, 14, 17, 19, 17, 14, 12, 9, 7, 12, 14, 17, 21, 19, 17, 14], [19, 16, 14, 12, 9, 12, 14, 16, 24, 21, 19, 16, 14, 12, 9, 7]];
export function makeScore(index: number): MusicScore {
  const song = MUSIC_LIBRARY[index];
  if (!song) throw new RangeError('Unknown SORA composition');
  if (index >= 9) return makeThemeScore(STORY_THEMES[index - 9]!);
  const notes: ScoreNote[] = [], style = 'style' in song ? song.style : 0;
  const add = (channel: number, beat: number, duration: number, pitch: number, velocity = 88) => notes.push({ channel, beat, duration, pitch, velocity });
  // Four-bar introduction, two themes, breakdown, developing solo and final chorus.
  // Changes in orchestration prevent a short loop from flattening an entire race.
  for (let bar = 0; bar < 64; bar++) {
    const section = Math.floor(bar / 8), quiet = section === 0 || section === 4;
    const root = song.root + harmonies[style]![Math.floor(bar / 2 + index) % 8]!;
    for (let step = 0; step < 16; step++) {
      const beat = bar * 4 + step / 4, swing = style === 1 && step % 2 ? 0.065 : 0;
      const bass = style === 1 ? [0, 3, 6, 8, 11, 14].includes(step) : style === 2 ? step % 2 === 0 : step % 2 === 0 || step === 7 || step === 15;
      if (bass && (bar >= 4 || step % 4 === 0)) add(0, beat + swing, style === 1 ? 0.27 : 0.17, root + ([0, 0, 12, 7][Math.floor(step / 4)] ?? 0), step % 4 ? 78 : 100);
      if (!quiet || step % 2 === 0) add(2, beat + swing, 0.14, root + 24 + [0, 7, 12, style === 2 ? 14 : 16, 19, 16, 12, 7][(step + bar + index) % 8]!, quiet ? 30 : 43);
      if (step % 2 === 0 && (bar > 3 || step % 4 === 0)) add(9, beat + swing, 0.05, 42, quiet ? 30 : step % 4 ? 45 : 65);
      const kick = style === 1 ? [0, 6, 8, 14].includes(step) : step % 4 === 0;
      if (kick && section !== 4) add(9, beat, 0.1, 36, 88);
      if (step % 8 === 4 && bar > 3 && section !== 4) { add(9, beat, 0.1, 38, 78); add(9, beat + 0.015, 0.08, 39, 45); }
      if (bar % 8 === 7 && step >= 12) add(9, beat, 0.08, 37, 45 + (step - 12) * 9);
    }
    if (!quiet) {
      const solo = section === 5, count = solo || style === 2 ? 8 : 4;
      for (let n = 0; n < count; n++) {
        const off = melodies[style]![(bar * 4 + n + index * 3) % 16]!;
        const response = section === 3 || section === 7 ? 12 : 0;
        add(1, bar * 4 + n * 4 / count + (style === 1 && n % 2 ? 0.15 : 0), count === 8 ? 0.27 : 0.55, root + 12 + off + response, solo ? 70 : 76);
      }
    } else if (bar % 2 === 0) add(1, bar * 4 + 2, 1.5, root + 36 + index % 3 * 2, 46);
    for (const off of style === 1 ? [0, 7, 14, 21] : [0, 7, 15, 22]) add(3, bar * 4, 3.6, root + 12 + off, quiet ? 38 : 28);
  }
  return { name: song.name, bpm: song.bpm, beats: 256, notes: notes.sort((a, b) => a.beat - b.beat || a.channel - b.channel || a.pitch - b.pitch) };
}
