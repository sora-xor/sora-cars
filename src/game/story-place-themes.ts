import { composeSong, type SongSpec } from './music-composer.ts';
import { makeScore, MUSIC_LIBRARY, type MusicScore } from './music-score';

/**
 * Cutscene themes for the street-race chapters, one for each town. They are scored
 * like the story themes (64 bars: statement, answer, sparse middle, lifted return) but
 * live outside the released soundtrack library, so its downloads, renders and sleeves
 * are unchanged. Cue sheets address them from PLACE_THEME_BASE upward.
 */
export const PLACE_THEME_BASE = 100;
export const PLACE_THEMES: readonly SongSpec[] = [
  { name: 'Akechidaira Teahouse', japanese: '明智平の茶屋', file: 'akechidaira-teahouse', bpm: 96, root: 50, mode: 'major',
    groove: 'citypop', swing: .04, bass: 'funk', arp: 'bells', pad: 'sustain', patches: ['round-bass', 'koto', 'fm-bell', 'warm-pad'],
    verse: 'Imaj7 V/I IVmaj7 I | vi7 iii7 IVmaj7 V7sus4',
    chorus: 'IVmaj7 V iii7 vi7 | ii7 V7sus4 Imaj7 Imaj7',
    bridge: 'bVIImaj7 IVmaj7 bVIImaj7 IVmaj7 | vi7 iii7 ii7 V7sus4',
    hookA: 'F#5:1 A5:.5 B5:.5 A5:1 F#5:1 | E5:1.5 F#5:.5 D5:2 | B4:1 D5:.5 E5:.5 F#5:1 A5:1 | A5:3 r:1 | F#5:1 A5:.5 B5:.5 D6:1 B5:1 | A5:1.5 F#5:.5 E5:2 | D5:1 E5:.5 F#5:.5 A5:1 E5:1 | D5:3 r:1',
    hookB: 'B5:1.5 A5:.5 F#5:1 E5:1 | D5:1 E5:1 A4:2 | B4:1 D5:.5 E5:.5 F#5:1 B5:1 | A5:2 F#5:2 | B5:1.5 A5:.5 F#5:1 E5:1 | D5:1 E5:1 F#5:2 | E5:1 F#5:.5 A5:.5 B5:1 A5:1 | A5:3 r:1',
    lift: 2 },
  { name: 'Kudan Before Dawn', japanese: '九段、夜明け前', file: 'kudan-before-dawn', bpm: 112, root: 45, mode: 'dorian',
    groove: 'citypop', swing: .05, bass: 'funk', arp: 'pulse16', pad: 'stab', patches: ['rubber-bass', 'sync-lead', 'glass', 'string-pad'],
    verse: 'i9 IV9 i9 IV9 | bIIImaj7 bVIImaj7 iv7 V7sus4',
    chorus: 'bIIImaj7 IV9 bVImaj7 bVII7 | i9 IV9 V7sus4 V7',
    bridge: 'iv9 iv9 bVImaj7 bVImaj7 | ii7 ii7 V7sus4 V7',
    hookA: 'E5:.5 A5:.5 G5:1 E5:.5 D5:.5 C5:1 | B4:1 C5:.5 D5:.5 E5:2 | E5:.5 A5:.5 B5:1 C6:.5 B5:.5 A5:1 | G5:1.5 F#5:.5 E5:2 | E5:.5 A5:.5 G5:1 E5:.5 D5:.5 C5:1 | B4:1 C5:.5 D5:.5 G5:2 | F#5:1 E5:.5 D5:.5 E5:1 B4:1 | A4:3 r:1',
    hookB: 'C6:1 B5:.5 A5:.5 E5:2 | G5:1 F#5:.5 E5:.5 D5:2 | C5:1 E5:.5 A5:.5 B5:1 C6:1 | B5:3 r:1 | C6:1 B5:.5 A5:.5 E5:2 | G5:1 A5:.5 B5:.5 D6:2 | C6:1 B5:1 A5:1 G5:1 | A5:3 r:1' },
  { name: 'Red Ink, Black Lacquer', japanese: '朱と漆', file: 'red-ink-black-lacquer', bpm: 78, root: 43, mode: 'minor',
    groove: 'ballad', bass: 'ballad', arp: 'bells', pad: 'sustain', patches: ['fm-bass', 'koto', 'fm-bell', 'hollow-pad'],
    verse: 'i9 bVII6 bVImaj7 bVImaj7 | iv9 bIImaj7 V7sus4 V7',
    chorus: 'bIIImaj7 bVII6 bVImaj7 bVImaj7 | iv9 bVII7 bIIImaj7 V7sus4',
    bridge: 'bVImaj7:8 bIIImaj7:8 | iv9:8 V7:8',
    hookA: 'D5:1.5 C5:.5 Bb4:1 A4:1 | G4:2 Bb4:1 D5:1 | Eb5:1.5 D5:.5 C5:1 Bb4:1 | A4:3 r:1 | D5:1.5 C5:.5 Bb4:1 A4:1 | G4:1 Bb4:1 D5:1 G5:1 | F#5:1.5 Eb5:.5 D5:1 C5:1 | D5:3 r:1',
    hookB: 'G5:2 F5:1 Eb5:1 | D5:1.5 C5:.5 Bb4:2 | C5:1 D5:.5 Eb5:.5 F5:1 G5:1 | A5:3 r:1 | Bb5:2 A5:1 G5:1 | F5:1.5 Eb5:.5 D5:2 | Eb5:1 D5:1 C5:1 A4:1 | G4:3 r:1' },
  { name: 'Canal Current', japanese: '疏水の流れ', file: 'canal-current', bpm: 104, root: 41, mode: 'lydian',
    groove: 'motorik', bass: 'sequencer16', arp: 'up16', pad: 'sustain', patches: ['moog-bass', 'pluck', 'marimba', 'string-pad'],
    verse: 'Imaj7 II7 Imaj7 II7 | vi7 iii7 IVmaj7 V7sus4',
    chorus: 'IVmaj7 iii7 vi9 vi9 | IVmaj7 II7 V7sus4 V7',
    bridge: 'bVImaj7 bVIImaj7 Imaj7 Imaj7 | bVImaj7 bVIImaj7 V7sus4 V7',
    hookA: 'C5:.5 F5:.5 A5:1 G5:.5 F5:.5 E5:1 | D5:1 E5:.5 F5:.5 G5:2 | A5:.5 B5:.5 C6:1 B5:.5 A5:.5 G5:1 | E5:3 r:1 | C5:.5 F5:.5 A5:1 G5:.5 F5:.5 E5:1 | D5:1 E5:.5 G5:.5 B5:2 | A5:1 G5:.5 F5:.5 E5:1 D5:1 | F5:3 r:1',
    hookB: 'A5:1.5 B5:.5 C6:2 | G5:1.5 A5:.5 B5:2 | F5:1 G5:.5 A5:.5 C6:1 E6:1 | D6:3 r:1 | A5:1.5 B5:.5 C6:2 | G5:1 B5:1 D6:2 | C6:1 B5:.5 A5:.5 G5:1 E5:1 | F5:3 r:1',
    lift: 1 },
  { name: 'A Handful of Earth', japanese: '一把の土', file: 'a-handful-of-earth', bpm: 90, root: 44, mode: 'major',
    groove: 'halftime', bass: 'pulse8', arp: 'bells', pad: 'sustain', patches: ['round-bass', 'fm-reed', 'epiano', 'vox-pad'],
    verse: 'Imaj7 iii7 IVmaj7 Imaj7 | vi7 iii7 ii9 V7sus4',
    chorus: 'IVmaj7 V iii7 vi7 | IVmaj7 V Imaj7 Imaj7',
    bridge: 'vi7 vi7 IVmaj7 IVmaj7 | ii7 iii7 IVmaj7 V7sus4',
    hookA: 'C5:1 Eb5:.5 F5:.5 Eb5:1 C5:1 | Bb4:1.5 C5:.5 Ab4:2 | Db5:1 C5:.5 Bb4:.5 Ab4:1 F4:1 | G4:3 r:1 | C5:1 Eb5:.5 F5:.5 Ab5:1 G5:1 | F5:1.5 Eb5:.5 C5:2 | Db5:1 Eb5:.5 F5:.5 Eb5:1 Bb4:1 | Ab4:3 r:1',
    hookB: 'Ab5:1.5 G5:.5 F5:1 Eb5:1 | F5:1 Eb5:1 C5:2 | Db5:1 Eb5:.5 F5:.5 Ab5:1 Bb5:1 | G5:3 r:1 | Ab5:1.5 G5:.5 F5:1 Eb5:1 | F5:1 Ab5:1 C6:2 | Bb5:1 Ab5:.5 G5:.5 F5:1 G5:1 | Ab5:3 r:1',
    lift: 2 },
];
/** The song a cutscene cue names: a soundtrack composition, or a place theme. */
export function storySong(track: number): SongSpec {
  const song = track >= PLACE_THEME_BASE ? PLACE_THEMES[track - PLACE_THEME_BASE] : MUSIC_LIBRARY[track];
  if (!song) throw new RangeError('Unknown SORA composition');
  return song;
}
const placeScores = new Map<number, MusicScore>();
/** The playable score for a cue's track. */
export function storyScore(track: number): MusicScore {
  if (track < PLACE_THEME_BASE) return makeScore(track);
  let score = placeScores.get(track);
  if (!score) { score = composeSong(storySong(track)); placeScores.set(track, score); }
  return score;
}
