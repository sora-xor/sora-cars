import { composeSong, type SongSpec } from '../music-composer.ts';
import type { MusicScore } from '../music-score';

/**
 * Original songs for the street routes. Each pairs a composed movement with an
 * answering second movement in the same key and voices, cut on an eight-bar
 * section boundary and set to the tempo that fills the route's race. They are
 * rendered offline by `scripts/export-street-songs.mjs`. They are not part of the
 * synthesizer's soundtrack library; the music store sells each one after Tokyo's song
 * (music-catalog.ts), from the same render as the route's AAC (`--store`).
 */
export interface StreetRouteSong {
  readonly route: string;
  readonly name: string; readonly japanese: string;
  /** The song's slug: its music-store recordings, sleeves and SKUs (music-<file>, music-<file>-ura). */
  readonly file: string;
  readonly first: SongSpec; readonly second: SongSpec;
  /** Eight-bar sections played, from the first movement into the second (8–16). */
  readonly sections: number;
  /** Length of the score itself; the rendered file adds the lead-in and release tail. */
  readonly seconds: number;
}

const FORTY_EIGHT_TURNS: StreetRouteSong = {
  route: 'irohazaka-1986', name: 'Forty-Eight Turns', japanese: '四十八の曲がり角', file: 'forty-eight-turns', sections: 13, seconds: 186,
  first: { name: 'Forty-Eight Turns', japanese: '四十八の曲がり角', file: 'forty-eight-turns', bpm: 132, root: 40, mode: 'dorian',
    groove: 'drive', bass: 'octave', arp: 'up16', pad: 'sustain', patches: ['moog-bass', 'sync-lead', 'koto', 'string-pad'],
    verse: 'i9 IV9 i9 IV9 | bIIImaj7 IV7 v7 bVII6',
    chorus: 'bIIImaj7 IV7 i9 i9 | bVImaj7 bVII6 V7sus4:2 V7:2 i9',
    bridge: 'iv7 iv7 bVIImaj7 bVIImaj7 | bIIImaj7 bVImaj7 V7sus4 V7',
    hookA: 'B4:.5 E5:.5 F#5:.5 G5:1 F#5:.5 E5:.5 D5:.5 | E5:1.5 B4:.5 C#5:2 | B4:.5 E5:.5 F#5:.5 A5:1 G5:.5 F#5:.5 E5:.5 | F#5:1 D5:1 E5:2',
    hookB: 'G5:1 A5:.5 B5:.5 D6:1 B5:1 | A5:1.5 G5:.5 F#5:2 | G5:1 F#5:.5 E5:.5 D5:1 B4:1 | C#5:1 E5:1 B4:2',
    hookBEnd: 'E5:3 r:1', lift: 2 },
  second: { name: 'Forty-Eight Turns II', japanese: '四十八の曲がり角 II', file: 'forty-eight-turns-ii', bpm: 132, root: 40, mode: 'dorian',
    groove: 'motorik', bass: 'sequencer16', arp: 'updown16', pad: 'stab', patches: ['moog-bass', 'sync-lead', 'koto', 'string-pad'],
    verse: 'i7 bVIImaj7 bVImaj7 bVII6 | i7 bVIImaj7 IV9 V7sus4',
    chorus: 'IV9 bIIImaj7 i9 bVII6 | IV9 bIIImaj7 V7sus4:2 V7:2 i9',
    bridge: 'bVImaj7:8 bIIImaj7:8 | iv7:8 V7sus4 V7',
    hookA: 'E5:.5 G5:.5 B5:1 A5:.5 G5:.5 E5:1 | D5:.5 E5:.5 G5:1 F#5:2 | E5:.5 G5:.5 B5:1 C#6:.5 B5:.5 A5:1 | G5:1.5 F#5:.5 E5:2',
    hookB: 'B5:1 D6:1 E6:1.5 D6:.5 | B5:1 A5:1 G5:2 | A5:1 B5:.5 A5:.5 G5:1 E5:1 | F#5:3 r:1', lift: 2 },
};

const EVENING_OVER_TSURUGA: StreetRouteSong = {
  route: 'aizu-wakamatsu-1986', name: 'Evening over Tsuruga', japanese: '鶴ヶ城の夕べ', file: 'evening-over-tsuruga', sections: 11, seconds: 160,
  first: { name: 'Evening over Tsuruga', japanese: '鶴ヶ城の夕べ', file: 'evening-over-tsuruga', bpm: 128, root: 48, mode: 'minor',
    groove: 'technopop', bass: 'sequencer16', arp: 'signal', pad: 'stab', patches: ['rubber-bass', 'brass', 'fm-bell', 'hollow-pad'],
    verse: 'i7 bIIImaj7 bVImaj7 V7 | i7 bIIImaj7 iv9 V7sus4',
    chorus: 'bVImaj7 bVII6 i9 i9 | bVImaj7 bVII6 V7sus4:2 V7:2 i9',
    bridge: 'iv9 iv9 bVImaj7 bVImaj7 | bIIImaj7 bIIImaj7 V7sus4 V7',
    hookA: 'G4:.5 C5:.5 Eb5:.5 D5:.5 C5:1 Bb4:1 | C5:2 r:1 G4:1 | Ab4:.5 C5:.5 F5:.5 Eb5:.5 D5:1 C5:1 | B4:3 r:1',
    hookAEnd: 'C5:2 D5:2',
    hookB: 'Eb5:1 G5:1 C6:1.5 Bb5:.5 | Ab5:1 G5:1 F5:2 | Eb5:1 F5:.5 G5:.5 Ab5:1 G5:1 | G5:3 r:1',
    hookBEnd: 'C6:3 r:1', lift: 1 },
  second: { name: 'Evening over Tsuruga II', japanese: '鶴ヶ城の夕べ II', file: 'evening-over-tsuruga-ii', bpm: 128, root: 48, mode: 'harmonic',
    groove: 'drive', bass: 'octave', arp: 'up16', pad: 'sustain', patches: ['rubber-bass', 'brass', 'fm-bell', 'hollow-pad'],
    verse: 'i9 bVImaj7 iv9 V7 | i9 bVImaj7 bIIImaj7 V7sus4',
    chorus: 'iv9 bVII9 bIIImaj7 bVImaj7 | iv9 V7 i9 i9',
    bridge: 'bVImaj7 bVImaj7 bVII6 bVII6 | iv9 iv9 V7sus4 V7',
    hookA: 'C5:1 Eb5:.5 G5:.5 C6:1 B5:1 | C6:2 G5:2 | Ab5:1 G5:.5 F5:.5 Eb5:1 D5:1 | Eb5:1 D5:1 B4:2',
    hookB: 'G5:1.5 Ab5:.5 G5:1 F5:1 | Eb5:1.5 F5:.5 G5:2 | Ab5:1 Bb5:.5 C6:.5 Bb5:1 Ab5:1 | G5:3 r:1', lift: 1 },
};

const KAMOGAWA_LIGHTS: StreetRouteSong = {
  route: 'kyoto-1986', name: 'Kamogawa Lights', japanese: '鴨川ライト', file: 'kamogawa-lights', sections: 13, seconds: 208,
  first: { name: 'Kamogawa Lights', japanese: '鴨川ライト', file: 'kamogawa-lights', bpm: 116, root: 41, mode: 'major',
    groove: 'citypop', swing: .04, bass: 'funk', arp: 'comp', pad: 'sustain', patches: ['fm-bass', 'fm-reed', 'epiano', 'string-pad'],
    verse: 'Imaj9 vi9 ii9 V13 | iii7 VI7 ii9 V7sus4',
    chorus: 'IVmaj7 V/IV iii7 vi7 | ii7 V7sus4 Imaj9 Imaj9',
    bridge: 'bVImaj7 bVImaj7 bVIImaj7 bVIImaj7 | IVmaj7 iii7 ii7 V7sus4',
    hookA: 'A5:1 G5:.5 F5:.5 C5:1 D5:1 | E5:1.5 F5:.5 G5:2 | A5:.5 Bb5:.5 A5:.5 G5:.5 F5:1 D5:1 | E5:2 C5:2',
    hookB: 'C6:1 A5:.5 G5:.5 A5:1 C6:1 | Bb5:1.5 A5:.5 G5:2 | A5:1 G5:.5 F5:.5 E5:1 D5:1 | E5:1 F5:1 G5:2',
    hookBEnd: 'F5:3 r:1', lift: 1, fx: { chorus: 1.1 } },
  second: { name: 'Kamogawa Lights II', japanese: '鴨川ライト II', file: 'kamogawa-lights-ii', bpm: 116, root: 41, mode: 'mixolydian',
    groove: 'technopop', bass: 'octave', arp: 'pulse16', pad: 'stab', patches: ['fm-bass', 'fm-reed', 'epiano', 'string-pad'],
    verse: 'I9 bVIImaj7 IVmaj7 I9 | vi7 bVIImaj7 IVmaj7 V7sus4',
    chorus: 'IVmaj7 bVIImaj7 Imaj9 vi7 | IVmaj7 bVIImaj7 V7sus4:2 V7:2 Imaj9',
    bridge: 'ii7 ii7 bIIImaj7 bIIImaj7 | IVmaj7 IVmaj7 V7sus4 V7',
    hookA: 'F5:.5 A5:.5 C6:1 Bb5:.5 A5:.5 G5:1 | F5:1 Eb5:1 F5:2 | G5:.5 A5:.5 Bb5:1 A5:.5 G5:.5 F5:1 | E5:3 r:1',
    hookB: 'C6:1.5 Bb5:.5 A5:1 F5:1 | Eb5:1 F5:1 G5:2 | A5:1 Bb5:.5 C6:.5 D6:1 C6:1 | A5:3 r:1', lift: 2 },
};

const DEER_PARK_AFTERGLOW: StreetRouteSong = {
  route: 'nara-1986', name: 'Deer Park Afterglow', japanese: '鹿の夕映え', file: 'deer-park-afterglow', sections: 12, seconds: 178,
  first: { name: 'Deer Park Afterglow', japanese: '鹿の夕映え', file: 'deer-park-afterglow', bpm: 124, root: 38, mode: 'lydian',
    groove: 'motorik', bass: 'pulse8', arp: 'bells', pad: 'sustain', patches: ['round-bass', 'pulse', 'marimba', 'vox-pad'],
    verse: 'Imaj7 II7 Imaj7 II7 | vi7 iii7 IVmaj7 V7sus4',
    chorus: 'IVmaj7 V/IV iii7 vi7 | IVmaj7 V Iadd9 Iadd9',
    bridge: 'vi7 vi7 V/VII V/VII | IVmaj7 IVmaj7 V7sus4 V7',
    hookA: 'A5:1 F#5:.5 E5:.5 D5:1 A4:1 | B4:1.5 C#5:.5 E5:2 | F#5:.5 G#5:.5 A5:1 B5:1 A5:1 | F#5:3 r:1',
    hookB: 'D6:1 C#6:.5 B5:.5 A5:2 | B5:1 A5:.5 G5:.5 F#5:2 | E5:1 F#5:.5 A5:.5 B5:1 C#6:1 | D6:3 r:1',
    hookBEnd: 'D6:2 A5:2', lift: 2 },
  second: { name: 'Deer Park Afterglow II', japanese: '鹿の夕映え II', file: 'deer-park-afterglow-ii', bpm: 124, root: 38, mode: 'major',
    groove: 'drive', bass: 'octave', arp: 'signal', pad: 'stab', patches: ['round-bass', 'pulse', 'marimba', 'vox-pad'],
    verse: 'Iadd9 V/VII vi7 V | IVmaj7 iii7 ii7 V7sus4',
    chorus: 'IVmaj7 V iii7 vi7 | ii7 V7sus4 Iadd9 Iadd9',
    bridge: 'bVImaj7 bVIImaj7 Imaj7 Imaj7 | bVImaj7 bVIImaj7 V7sus4 V7',
    hookA: 'F#5:.5 A5:.5 D6:1 C#6:.5 B5:.5 A5:1 | B5:1 A5:1 F#5:2 | G5:.5 A5:.5 B5:1 A5:.5 G5:.5 F#5:1 | E5:3 r:1',
    hookB: 'A5:1.5 B5:.5 D6:1 E6:1 | F#6:2 E6:1 D6:1 | B5:1 D6:.5 E6:.5 F#6:1 E6:1 | D6:3 r:1', lift: 2 },
};

export const STREET_ROUTE_SONGS: readonly StreetRouteSong[] = [FORTY_EIGHT_TURNS, EVENING_OVER_TSURUGA, KAMOGAWA_LIGHTS, DEER_PARK_AFTERGLOW];

/** Both movements as one score, cut after `sections` eight-bar sections. */
export function composeStreetSong(song: StreetRouteSong): MusicScore {
  if (!Number.isInteger(song.sections) || song.sections < 8 || song.sections > 16 || !(song.seconds >= 60 && song.seconds <= 290)) {
    throw new RangeError(`${song.name}: 8–16 sections lasting 60–290 seconds`);
  }
  const first = composeSong(song.first), second = composeSong(song.second), beats = song.sections * 32;
  const notes = [...first.notes, ...second.notes.map(note => ({ ...note, beat: note.beat + first.beats }))]
    .filter(note => note.beat < beats).map(note => ({ ...note, duration: Math.min(note.duration, beats - note.beat) }));
  return { name: song.name, bpm: beats * 60 / song.seconds, beats, notes, patches: first.patches, fx: first.fx };
}

/** Where each eight-bar section begins in the rendered file, after its lead-in. */
export function streetSongSectionsMs(song: StreetRouteSong, leadInSeconds: number): number[] {
  return Array.from({ length: song.sections }, (_, section) => Math.round((leadInSeconds + section * song.seconds / song.sections) * 1000));
}
