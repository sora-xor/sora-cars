/** Integer geometry for the new street relation. Existing RaceV1 never consumes this format. */
export interface StreetSample {
  progressMm: number;
  eastMm: number;
  northMm: number;
  elevationMm: number;
  halfWidthMm: number;
  /** Clockwise from north, unwrapped along the route; one turn is 1,000,000. */
  headingMicroturn: number;
  /** Diagnostic centered curvature estimate; do not integrate this for road heading. */
  turnPerMetre: number;
  /** Art/traffic section index, fixed by the compiled catalog. */
  sector: number;
}
export interface CompiledStreetTrack {
  version: 1;
  topology: 'circuit' | 'sprint';
  id: string;
  name: { ja: string; en: string };
  year: 1986;
  originE7: readonly [number, number];
  lengthMm: number;
  laps: number;
  maxTicks: number;
  targetMs: number;
  samples: readonly StreetSample[];
  gates: readonly { id: string; sample: number }[];
  sound: { asset: string; sha256: string; durationMs: number; cuesMs: readonly number[] };
  qualification: { historicalAlignment: false; nativeParity: false; proof: false };
}

/** Covers four 20 km laps plus look-ahead, with explicit shared arithmetic bounds. */
export const MAX_STREET_PROGRESS_MM = 100_000_000;

function sampleIndexAt(track: CompiledStreetTrack, progressMm: number): number {
  if (!Number.isSafeInteger(progressMm) || Math.abs(progressMm) > MAX_STREET_PROGRESS_MM || track.samples.length < 2
    || track.topology !== 'circuit' && track.topology !== 'sprint') throw new RangeError('Invalid street progress or topology.');
  const position = positionAt(track, progressMm);
  if (track.topology === 'sprint' && position === track.lengthMm) return track.samples.length - 1;
  let low = 0, high = track.samples.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (track.samples[middle]!.progressMm <= position) low = middle; else high = middle;
  }
  return low;
}

function positionAt(track: CompiledStreetTrack, progressMm: number): number {
  return track.topology === 'sprint' ? Math.max(0, Math.min(track.lengthMm, progressMm))
    : ((progressMm % track.lengthMm) + track.lengthMm) % track.lengthMm;
}

/** Circuits wrap with Euclidean division; sprints clamp to their actual endpoints.
 * The sprint terminal row has no following cell. This lookup cannot accept a
 * previous profile's track ID.
 */
export function streetSampleAt(track: CompiledStreetTrack, progressMm: number): StreetSample {
  return track.samples[sampleIndexAt(track, progressMm)]!;
}

/** The final sprint position uses its final nondegenerate cell. */
export function streetIntervalAt(track: CompiledStreetTrack, progressMm: number): readonly [StreetSample, StreetSample] {
  const index = Math.min(sampleIndexAt(track, progressMm), track.samples.length - 2);
  return [track.samples[index]!, track.samples[index + 1]!];
}

/** Integer interpolation of frozen headings. The endpoint includes the exact lap
 * winding, so a sequence of heading changes telescopes without accumulating drift.
 * Consumers must use compiler-validated geometry; this is not a proof verifier.
 */
export function streetHeadingAt(track: CompiledStreetTrack, progressMm: number): number {
  const index = sampleIndexAt(track, progressMm), sample = track.samples[index]!;
  if (index === track.samples.length - 1) {
    if (!Number.isSafeInteger(sample.headingMicroturn)) throw new RangeError('Street heading exceeds integer bounds.');
    return sample.headingMicroturn === 0 ? 0 : sample.headingMicroturn;
  }
  const lap = track.topology === 'circuit' ? Math.floor(progressMm / track.lengthMm) : 0;
  const position = positionAt(track, progressMm);
  const next = track.samples[index + 1]!;
  const winding = track.samples.at(-1)!.headingMicroturn - track.samples[0]!.headingMicroturn;
  const lapHeading = lap * winding;
  if (!Number.isSafeInteger(lapHeading)) throw new RangeError('Street lap heading exceeds integer bounds.');
  const result = sample.headingMicroturn + Math.trunc((next.headingMicroturn - sample.headingMicroturn)
    * (position - sample.progressMm) / (next.progressMm - sample.progressMm)) + lapHeading;
  if (!Number.isSafeInteger(result)) throw new RangeError('Street heading exceeds integer bounds.');
  return result === 0 ? 0 : result;
}

export function streetHeadingChange(track: CompiledStreetTrack, fromMm: number, toMm: number): number {
  const change = streetHeadingAt(track, toMm) - streetHeadingAt(track, fromMm);
  if (!Number.isSafeInteger(change)) throw new RangeError('Street heading change exceeds integer bounds.');
  return change;
}
