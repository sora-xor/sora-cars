import type { CompiledStreetTrack } from './track';
import { STREET_ROUTE_STYLES } from './routes';

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

const NEUTRAL = { stage: '序', japanese: '走りの時間', english: 'ON THE ROAD' } as const;
const START_ONLY: readonly number[] = Object.freeze([0]);
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Presentation only: never modifies the admitted track, native state or proof
 * inputs. The simulation tick is its only clock, so seeking, pausing and muted
 * playback all select the same chapter. Unknown tracks, and tracks whose cues
 * do not match their authored chapters, keep neutral artwork.
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
  const chapters = STREET_ROUTE_STYLES.find(route => route.id === track.id)?.chapters;
  const titled = valid && !!chapters && cues.length === chapters.length;
  const chapter = titled ? chapters[index]! : NEUTRAL;
  return Object.freeze({ index, ...chapter, elapsedMs, durationMs, progress,
    dawn: titled ? clamp((index + progress) / chapters.length) : 0,
    transition: titled ? clamp((4000 - elapsedMs) / 1000) : 0 });
}
