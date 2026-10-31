import { TRACKS } from '../rules';
import type { CompiledStreetTrack } from '../street/track';
import { TAU, clamp } from './dmath';

/** Road geometry for the local driving model, in metres along the centre line.
 * Headings are clockwise from the course's start direction, so a positive
 * curvature turns right, matching the race state's positive-right lateral axis.
 * Both the arcade circuits and the street routes are described the same way,
 * and the 3D world draws them from the same stations, so a car at (s, d) is
 * drawn exactly where the simulation put it.
 */
export interface DriveCourse {
  readonly id: string;
  readonly topology: 'circuit' | 'sprint';
  /** Street circuits loop back on themselves, so cars a lap apart can touch.
   * Arcade courses are drawn unrolled: each lap is a new stretch of road. */
  readonly wraps: boolean;
  readonly lapLength: number;
  readonly laps: number;
  readonly finish: number;
  readonly maxTicks: number;
  /** Progress of each station within one lap; stations are about 5 m apart. */
  readonly stations: Float64Array;
  readonly heading: Float64Array;
  readonly halfWidth: Float64Array;
  readonly elevation: Float64Array;
  /** Heading gained over one complete lap (2π for a closed street circuit). */
  readonly winding: number;
  /** From the road edge to the guard rail's face, which is the wall. */
  readonly railOffset: number;
}

export interface CourseSample {
  /** Curvature (rad/m), positive to the right. */
  readonly kappa: number;
  readonly halfWidth: number;
  /** Rise per metre along the road. */
  readonly grade: number;
}

/** The world draws its guard rails 0.6 m beyond the road edge; their face is 0.08 m nearer. */
const RAIL_OFFSET = 0.52;

/** The arcade circuits as the 3D world draws them: 5 m stations whose heading
 * turns by curvature × 5 / 760 radians, with three laps laid end to end. */
export function arcadeDriveCourse(trackId: number): DriveCourse {
  const track = TRACKS[trackId];
  if (!track) throw new RangeError('Unknown arcade track');
  const lap = track.length / 1000, count = Math.round(lap / 5) + 1;
  const stations = new Float64Array(count), heading = new Float64Array(count);
  let theta = 0;
  for (let i = 0; i < count; i++) {
    stations[i] = i * 5; heading[i] = theta;
    theta += track.curves[Math.floor(Math.min(i * 5, lap - 1e-9) * 12 / lap)]! * 5 / 760;
  }
  return Object.freeze({ id: `arcade-${trackId}`, topology: 'circuit', wraps: false, lapLength: lap, laps: 3, finish: lap * 3,
    maxTicks: 5400, stations, heading, halfWidth: new Float64Array(count).fill(6), elevation: new Float64Array(count),
    winding: heading[count - 1]!, railOffset: RAIL_OFFSET });
}

export function streetDriveCourse(track: CompiledStreetTrack): DriveCourse {
  const count = track.samples.length;
  const stations = new Float64Array(count), heading = new Float64Array(count);
  const halfWidth = new Float64Array(count), elevation = new Float64Array(count);
  track.samples.forEach((sample, i) => {
    stations[i] = sample.progressMm / 1000;
    heading[i] = sample.headingMicroturn * TAU / 1e6;
    halfWidth[i] = sample.halfWidthMm / 1000;
    elevation[i] = sample.elevationMm / 1000;
  });
  const lap = track.lengthMm / 1000;
  return Object.freeze({ id: track.id, topology: track.topology, wraps: track.topology === 'circuit', lapLength: lap,
    // A third more time than the native draft allows: the driving model brakes and accelerates like a car,
    // so a mountain pass takes longer than its song.
    laps: track.laps, finish: lap * track.laps, maxTicks: Math.round(track.maxTicks * 4 / 3), stations, heading, halfWidth, elevation,
    winding: heading[count - 1]! - heading[0]!, railOffset: RAIL_OFFSET });
}

/** Station interval containing a within-lap position. */
function interval(course: DriveCourse, position: number): number {
  const stations = course.stations;
  let low = 0, high = stations.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (stations[middle]! <= position) low = middle; else high = middle;
  }
  return low;
}

/** Lap index and within-lap position. Sprints extend straight beyond both ends. */
function locate(course: DriveCourse, s: number): { lap: number; position: number } {
  if (course.topology === 'sprint') return { lap: 0, position: clamp(s, 0, course.lapLength) };
  const lap = Math.floor(s / course.lapLength);
  return { lap, position: s - lap * course.lapLength };
}

export function sampleCourse(course: DriveCourse, s: number): CourseSample {
  const { position } = locate(course, s);
  const i = interval(course, position), a = course.stations[i]!, b = course.stations[i + 1]!;
  const span = b - a;
  const beyond = course.topology === 'sprint' && (s < 0 || s > course.lapLength);
  const t = clamp((position - a) / span, 0, 1);
  return {
    kappa: beyond ? 0 : (course.heading[i + 1]! - course.heading[i]!) / span,
    halfWidth: course.halfWidth[i]! + (course.halfWidth[i + 1]! - course.halfWidth[i]!) * t,
    grade: beyond ? 0 : (course.elevation[i + 1]! - course.elevation[i]!) / span,
  };
}

/** Unwrapped road heading (rad, clockwise), continuous across laps. */
export function courseHeading(course: DriveCourse, s: number): number {
  const { lap, position } = locate(course, s);
  const i = interval(course, position), a = course.stations[i]!, b = course.stations[i + 1]!;
  const t = clamp((position - a) / (b - a), 0, 1);
  return course.heading[i]! + (course.heading[i + 1]! - course.heading[i]!) * t + lap * course.winding;
}

/** Signed along-road separation from `from` to `to`, using the nearest lap image on a closed street circuit. */
export function courseGap(course: DriveCourse, from: number, to: number): number {
  const gap = to - from;
  if (!course.wraps) return gap;
  const length = course.lapLength;
  return gap - length * Math.round(gap / length);
}
