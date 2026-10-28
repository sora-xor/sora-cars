/** Presentation timing only: recorded music follows the 30 Hz simulation clock. */
export interface StreetSoundtrackClock {
  tick: number;
  durationSeconds: number;
  currentTime: number;
  mediaDuration: number;
  readyState: number;
  seeking: boolean;
  ended: boolean;
  paused: boolean;
  active: boolean;
  enabled: boolean;
  /** Explicit start, replay seek, resume or re-enable; never set every frame. */
  resyncEnded?: boolean;
}

export interface StreetSoundtrackPlan {
  expectedSeconds: number;
  shouldPlay: boolean;
  /** Assign currentTime and try again next frame; assignment may still throw. */
  seekTo: number | null;
}

const TICKS_PER_SECOND = 30;
const PLAYING_DRIFT_SECONDS = 0.5;
const RESUME_DRIFT_SECONDS = 0.1;
const END_EPSILON_SECONDS = 0.05;

/**
 * Never advances the simulation or changes playback rate. A pause or mute leaves
 * media alone until playback resumes, when the smaller drift tolerance applies.
 * Unknown/invalid metadata waits; a failed currentTime assignment can be retried
 * with the same inputs. A pending seek suppresses play until a subsequent call.
 *
 * An ended file stays stopped even if wall-clock playback outran the simulation.
 * Only an explicit resyncEnded event can rewind it, and only before the end of
 * BOTH the authored segment and the decoded file. This prevents accidental loops.
 */
export function planStreetSoundtrack(clock: StreetSoundtrackClock): StreetSoundtrackPlan {
  const validClock = Number.isFinite(clock.tick)
    && Number.isFinite(clock.durationSeconds) && clock.durationSeconds > 0;
  const authoredEnd = validClock ? clock.durationSeconds : 0;
  const metadataReady = Number.isInteger(clock.readyState)
    && clock.readyState >= 1 && clock.readyState <= 4;
  const decodedDuration = metadataReady && Number.isFinite(clock.mediaDuration)
    && clock.mediaDuration >= 0;
  const end = decodedDuration ? Math.min(authoredEnd, clock.mediaDuration) : authoredEnd;
  const expectedSeconds = validClock ? Math.min(end, Math.max(0, clock.tick / TICKS_PER_SECOND)) : 0;
  const stopped: StreetSoundtrackPlan = { expectedSeconds, shouldPlay: false, seekTo: null };
  // Preserve a positive start interval even for very short authored segments.
  const endEpsilon = Math.min(END_EPSILON_SECONDS, end / 2);
  if (!validClock || !clock.active || !clock.enabled || !decodedDuration
    || clock.seeking || end <= 0 || expectedSeconds >= end - endEpsilon) return stopped;

  if (clock.ended) {
    return clock.resyncEnded ? { ...stopped, seekTo: expectedSeconds } : stopped;
  }
  const currentTimeValid = Number.isFinite(clock.currentTime) && clock.currentTime >= 0;
  const tolerance = clock.paused ? RESUME_DRIFT_SECONDS : PLAYING_DRIFT_SECONDS;
  if (!currentTimeValid || Math.abs(clock.currentTime - expectedSeconds) > tolerance) {
    return { ...stopped, seekTo: expectedSeconds };
  }
  return { expectedSeconds, shouldPlay: true, seekTo: null };
}
