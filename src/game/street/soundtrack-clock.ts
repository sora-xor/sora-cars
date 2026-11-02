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
  /** Seconds from the start line to the end of the player's race: the line, a wreck or the time limit. */
  raceEndSeconds?: number | null;
  /** Presentation seconds since the simulation stopped, while the coda plays over the results. */
  afterSeconds?: number;
  /** The song's own ending. Without one, the race end lets the current play finish. */
  ending?: StreetSongEnding;
}

/** The song's own final eight bars and the four-bar phrases that lead into them. */
export interface StreetSongEnding {
  /** Where the final eight bars begin in the file. */
  readonly codaSeconds: number;
  /** One four-bar phrase; phrase boundaries fall whole phrases either side of the coda. */
  readonly phraseSeconds: number;
}

export interface StreetSongPosition {
  /** File position; at or past the end of the song it is silent. */
  readonly seconds: number;
  /** Where the current pass began in the file: 0, or the coda. */
  readonly start: number;
  /** Counts the plays from the top, then the coda; it changes exactly when the position jumps. */
  readonly pass: number;
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
 * While the player races, the song plays from the top again at each authored end.
 * Once the player's race has ended, the current four-bar phrase finishes, then the
 * song's own final eight bars play once and the music stops; a race that ends
 * inside them lets them play on. The tick, the race end and the time after the
 * simulation stopped are the only inputs, so a replay seek finds the same note.
 */
export function streetSongPosition(clock: Pick<StreetSoundtrackClock,
  'tick' | 'durationSeconds' | 'raceEndSeconds' | 'afterSeconds' | 'ending'>): StreetSongPosition {
  const length = clock.durationSeconds;
  const after = Number.isFinite(clock.afterSeconds) && clock.afterSeconds! > 0 ? clock.afterSeconds! : 0;
  const time = Math.max(0, clock.tick / TICKS_PER_SECOND) + after;
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(time)) return { seconds: 0, start: 0, pass: 0 };
  const play = (at: number) => { const seconds = at % length; return { seconds, start: 0, pass: Math.round((at - seconds) / length) }; };
  const raceEnd = clock.raceEndSeconds;
  if (raceEnd === null || raceEnd === undefined || !Number.isFinite(raceEnd) || raceEnd < 0 || time < raceEnd) return play(time);
  const last = play(raceEnd), since = time - raceEnd;
  const coda = clock.ending?.codaSeconds ?? NaN, phrase = clock.ending?.phraseSeconds ?? NaN;
  const finishing = { ...last, seconds: last.seconds + since };
  if (!(coda >= 0 && coda < length && phrase > 0 && Number.isFinite(phrase)) || last.seconds >= coda) return finishing;
  const boundary = coda - Math.floor((coda - last.seconds) / phrase) * phrase;
  if (boundary >= coda || since < boundary - last.seconds) return finishing;
  return { seconds: coda + since - (boundary - last.seconds), start: coda, pass: last.pass + 1 };
}

/**
 * Never advances the simulation or changes playback rate. A pause or mute leaves
 * media alone until playback resumes, when the smaller drift tolerance applies.
 * Unknown/invalid metadata waits; a failed currentTime assignment can be retried
 * with the same inputs. A pending seek suppresses play until a subsequent call.
 *
 * An ended file stays stopped even if wall-clock playback outran the simulation.
 * It rewinds only on an explicit resyncEnded event or when the clock begins a new
 * pass (the song's restart or its coda), and never at or beyond the end of the
 * authored segment or the decoded file. Nothing else loops it.
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
  const position = validClock ? streetSongPosition(clock) : null;
  const expectedSeconds = position ? Math.min(end, position.seconds) : 0;
  const stopped: StreetSoundtrackPlan = { expectedSeconds, shouldPlay: false, seekTo: null };
  // Preserve a positive start interval even for very short authored segments.
  const endEpsilon = Math.min(END_EPSILON_SECONDS, end / 2);
  if (!position || !clock.active || !clock.enabled || !decodedDuration
    || clock.seeking || end <= 0 || expectedSeconds >= end - endEpsilon) return stopped;

  if (clock.ended) {
    const newPass = position.seconds - position.start <= PLAYING_DRIFT_SECONDS;
    return clock.resyncEnded || newPass ? { ...stopped, seekTo: expectedSeconds } : stopped;
  }
  const currentTimeValid = Number.isFinite(clock.currentTime) && clock.currentTime >= 0;
  const tolerance = clock.paused ? RESUME_DRIFT_SECONDS : PLAYING_DRIFT_SECONDS;
  if (!currentTimeValid || Math.abs(clock.currentTime - expectedSeconds) > tolerance) {
    return { ...stopped, seekTo: expectedSeconds };
  }
  return { expectedSeconds, shouldPlay: true, seekTo: null };
}
