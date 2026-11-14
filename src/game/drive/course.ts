import { arcadePlan, arcadeRoadHeight } from '../arcade-geography';
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
  /** Progress of each station within one lap; stations are about 5 m apart. A sprint's stations cover the whole
   * road, and an Arcade road's begin before its start line (its lead-in) and run on past the finish. */
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

/** How long a local Arcade race may run: five minutes at 30 Hz. Eight stock cars take 2:44–2:56 over Hakone's bends
 * and 2:26–2:36 along Yokohama's streets (`npm run check:drive`); a live RaceV1 race may run 8,100 ticks on the same road. */
export const ARCADE_REAL_MAX_TICKS = 9000;

/** An Arcade course for the driving model: one stretch of its real road from 100 m before the start line to the end of
 * the run-off beyond the finish, with the road's own plan and heights every 5 m (arcade-geography.ts). Its three laps
 * are distances along it. The 3D world draws the course the race runs on. */
export function arcadeDriveCourse(trackId: number): DriveCourse {
  const track = TRACKS[trackId], plan = arcadePlan(trackId);
  if (!track || !plan) throw new RangeError('Unknown arcade track');
  const lap = track.length / 1000, count = plan.headings.length, stations = Float64Array.from({ length: count }, (_, i) => plan.first + i * plan.step);
  return Object.freeze({ id: `arcade-${trackId}`, topology: 'sprint', wraps: false, lapLength: lap, laps: 3, finish: lap * 3,
    maxTicks: ARCADE_REAL_MAX_TICKS, stations, heading: plan.headings, halfWidth: new Float64Array(count).fill(6),
    elevation: Float64Array.from(stations, s => arcadeRoadHeight(trackId, s)), winding: plan.headings[count - 1]! - plan.headings[0]!,
    railOffset: RAIL_OFFSET });
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

/** Where a course's stations begin and end: a lap, or a sprint's whole road. */
export const courseFirst = (course: DriveCourse): number => course.stations[0]!;
export const courseLast = (course: DriveCourse): number => course.stations[course.stations.length - 1]!;

/** Lap index and within-lap position. Sprints extend straight beyond both ends of their road. */
function locate(course: DriveCourse, s: number): { lap: number; position: number } {
  if (course.topology === 'sprint') return { lap: 0, position: clamp(s, courseFirst(course), courseLast(course)) };
  const lap = Math.floor(s / course.lapLength);
  return { lap, position: s - lap * course.lapLength };
}

export function sampleCourse(course: DriveCourse, s: number): CourseSample {
  const { position } = locate(course, s);
  const i = interval(course, position), a = course.stations[i]!, b = course.stations[i + 1]!;
  const span = b - a;
  const beyond = course.topology === 'sprint' && (s < courseFirst(course) || s > courseLast(course));
  const t = clamp((position - a) / span, 0, 1);
  return {
    kappa: beyond ? 0 : (course.heading[i + 1]! - course.heading[i]!) / span,
    halfWidth: course.halfWidth[i]! + (course.halfWidth[i + 1]! - course.halfWidth[i]!) * t,
    grade: beyond ? 0 : (course.elevation[i + 1]! - course.elevation[i]!) / span,
  };
}

/** Road height (m) at a distance along the course, linear between stations as the model's grade is; a circuit's
 * repeats each lap, and a sprint holds its end heights beyond its road. */
export function courseElevation(course: DriveCourse, s: number): number {
  const { position } = locate(course, s);
  const i = interval(course, position), a = course.stations[i]!, b = course.stations[i + 1]!;
  const t = clamp((position - a) / (b - a), 0, 1);
  return course.elevation[i]! + (course.elevation[i + 1]! - course.elevation[i]!) * t;
}

/** One pose of the road as the 3D world draws it: `x` to the driver's left at the start line, `z` ahead, `heading` the
 * world's (anticlockwise from +z, the model's mirrored), `width` the half-width. */
export interface CoursePose { readonly p: number; readonly x: number; readonly y: number; readonly z: number; readonly heading: number; readonly width: number }
/** Poses split a model interval wherever it turns more than this (2°), so a hairpin is drawn as the arc the cars follow. */
const POSE_TURN = Math.PI / 90;
/** A course as the 3D world draws it (three/world.ts), from the lead-in to the end of its road (a circuit: 100 m before
 * the line to 500 m past the finish). The model's heading is linear over each 5 m interval, an arc of constant
 * curvature, and the poses lie on those arcs exactly, so a car at (s, d) is drawn where the race has it. The start
 * line stands at the origin heading +z. */
export function courseDrawing(course: DriveCourse): CoursePose[] {
  const sprint = course.topology === 'sprint';
  const from = sprint ? courseFirst(course) : -100, to = sprint ? courseLast(course) : course.finish + 500;
  const at: number[] = [];
  for (let s = from; s < to - 1e-9; s += 5) {
    const end = Math.min(s + 5, to), turns = Math.max(1, Math.ceil(Math.abs(courseHeading(course, end) - courseHeading(course, s)) / POSE_TURN));
    for (let k = 0; k < turns; k++) at.push(s + (end - s) * k / turns);
  }
  at.push(to);
  const step = (a: number, b: number): [number, number] => {
    const ha = courseHeading(course, a), hb = courseHeading(course, b), length = b - a, kappa = (hb - ha) / length;
    return Math.abs(kappa) > 1e-9 ? [(Math.cos(hb) - Math.cos(ha)) / kappa, (Math.sin(hb) - Math.sin(ha)) / kappa]
      : [-Math.sin((ha + hb) / 2) * length, Math.cos((ha + hb) / 2) * length];
  };
  const zero = at.findIndex(s => Math.abs(s) < 1e-6), xs = new Float64Array(at.length), zs = new Float64Array(at.length);
  if (zero < 0) throw new RangeError('A drawn course must have a station on its start line');
  for (let i = zero + 1; i < at.length; i++) { const [dx, dz] = step(at[i - 1]!, at[i]!); xs[i] = xs[i - 1]! + dx; zs[i] = zs[i - 1]! + dz; }
  for (let i = zero - 1; i >= 0; i--) { const [dx, dz] = step(at[i]!, at[i + 1]!); xs[i] = xs[i + 1]! - dx; zs[i] = zs[i + 1]! - dz; }
  return at.map((p, i) => ({ p, x: xs[i]!, y: courseElevation(course, p), z: zs[i]!, heading: -courseHeading(course, p), width: sampleCourse(course, p).halfWidth }));
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
