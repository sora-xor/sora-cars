import type { CompiledStreetTrack } from './track';

export interface StreetPresentation {
  readonly index: number;
  readonly stage: '序' | '破' | '急';
  readonly japanese: string;
  readonly english: string;
  /** Time within this chapter, not audio-element or animation-clock time. */
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly progress: number;
  readonly dawn: number;
  /** A brief title hold, followed by a one-second fade. */
  readonly transition: number;
}

// Authored chapter names for the packaged Tokyo soundtrack. These are creative
// markers, not a claim that its tempo or musical structure has been measured.
const TOKYO_CHAPTERS = [
  { stage: '序', japanese: '序・静かな点火', english: 'QUIET IGNITION' },
  { stage: '破', japanese: '破・街の鼓動', english: 'CITY PULSE' },
  { stage: '破', japanese: '破・交錯', english: 'CROSSCURRENTS' },
  { stage: '急', japanese: '急・解放', english: 'BREAK FREE' },
  { stage: '急', japanese: '急・暁へ', english: 'INTO THE DAWN' },
] as const;
const NEUTRAL = { stage: '序', japanese: '走りの時間', english: 'ON THE ROAD' } as const;
const START_ONLY: readonly number[] = Object.freeze([0]);
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Presentation only: never modifies the admitted track, native state or proof
 * inputs. The simulation tick is its only clock, so seeking, pausing and muted
 * playback all select the same chapter. Unknown tracks keep neutral artwork.
 */
export function streetPresentation(track: CompiledStreetTrack, tick: number): Readonly<StreetPresentation> {
  const duration = Number.isSafeInteger(track.sound.durationMs) && track.sound.durationMs > 0
    ? track.sound.durationMs : 0;
  const supplied = track.sound.cuesMs;
  const valid = duration > 0 && Array.isArray(supplied) && supplied.length > 0 && supplied.length <= 256
    && supplied[0] === 0 && supplied.every((cue, index) => Number.isSafeInteger(cue)
      && cue >= 0 && cue < duration && (index === 0 || cue > supplied[index - 1]!));
  const cues = valid ? supplied : START_ONLY;
  const simulationTick = Number.isFinite(tick) ? Math.max(0, Math.trunc(tick)) : 0;
  // Bound before multiplying, including malformed but finite caller ticks.
  const time = Math.min(duration, Math.min(simulationTick, duration * 30 / 1000) * 1000 / 30);
  let index = 0;
  while (index + 1 < cues.length && time >= cues[index + 1]!) index++;
  const durationMs = Math.max(0, (cues[index + 1] ?? duration) - cues[index]!);
  const elapsedMs = Math.min(durationMs, Math.max(0, time - cues[index]!));
  const progress = durationMs > 0 ? clamp(elapsedMs / durationMs) : 0;
  const tokyo = valid && track.id === 'tokyo-1986' && cues.length === TOKYO_CHAPTERS.length;
  const chapter = tokyo ? TOKYO_CHAPTERS[index]! : NEUTRAL;
  return Object.freeze({ index, ...chapter, elapsedMs, durationMs, progress,
    dawn: tokyo ? clamp((index + progress) / TOKYO_CHAPTERS.length) : 0,
    transition: tokyo ? clamp((4000 - elapsedMs) / 1000) : 0 });
}
