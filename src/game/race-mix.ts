/** Playback volume for a recorded race song, from the player's music slider (0–1).
 *
 * Recorded songs play through a media element, outside the synthesizer's music bus, so the
 * race mix in `audio.ts` cannot lift them. They are mastered to −16 LUFS; this volume lands
 * them at about −24 LUFS at the default slider, the level the synthesized soundtrack reaches
 * while the engine sounds. A media element cannot exceed 1, so the top quarter of the slider
 * plays them at full level. */
export function raceSongVolume(musicVolume: number): number {
  return Math.max(0, Math.min(1, musicVolume * 4 / 3));
}
