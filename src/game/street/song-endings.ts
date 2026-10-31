import { STREET_ROUTE_SONGS } from './route-songs';
import type { StreetSongEnding } from './soundtrack-clock';

/** The rendered route songs open with this much silence (scripts/export-street-songs.mjs). */
const LEAD_IN_SECONDS = 0.08;
/** Tokyo's supplied recording has no score. Measured from its onsets: 107.49 bpm,
 * the first beat at 0.084 s and bar lines on beats 1, 5, 9…; the music stops on
 * beat 453 (4:12.94), so its final eight bars begin on beat 421. */
const TOKYO_BEAT_SECONDS = 60 / 107.49, TOKYO_FIRST_BEAT_SECONDS = 0.084;

/** Each route song's own ending: a composed song's final eight-bar fade, or Tokyo's last eight bars. */
export const STREET_SONG_ENDINGS: Readonly<Record<string, StreetSongEnding>> = Object.freeze({
  'tokyo-1986': Object.freeze({ codaSeconds: TOKYO_FIRST_BEAT_SECONDS + 421 * TOKYO_BEAT_SECONDS, phraseSeconds: 16 * TOKYO_BEAT_SECONDS }),
  ...Object.fromEntries(STREET_ROUTE_SONGS.map(song => [song.route, Object.freeze({
    codaSeconds: LEAD_IN_SECONDS + (song.sections - 1) * song.seconds / song.sections,
    phraseSeconds: song.seconds / song.sections / 2 })])),
});
