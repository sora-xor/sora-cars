import { environmentAt } from '../environment';
import type { StreetObject } from '../street/objects';
import type { CompiledStreetTrack } from '../street/track';
import { STOCK_TUNE, type CarTune } from '../tuned-engine';
import { arcadeDriveCourse, sampleCourse, streetDriveCourse, type DriveCourse } from './course';
import { DriveRace, type DriveProp } from './race';
import { vehicleSpec } from './vehicle';

/** Grid rows clear the 3.9 m collision boxes by 1.6 m. */
const ROW = 5.5;

function grid(course: DriveCourse, count: number, column: number): { s: number; d: number }[] {
  // A sprint has no road behind its start, so its grid sits just past the line.
  const front = course.topology === 'sprint' ? (Math.ceil(count / 2) - 1) * ROW + 0.5 : -0.001;
  const half = Math.min(column, Math.max(0.85, sampleCourse(course, Math.max(0, front)).halfWidth - 1.05));
  return Array.from({ length: count }, (_, slot) => ({ s: front - Math.floor(slot / 2) * ROW, d: slot % 2 ? half : -half }));
}

const arcadeCourses = new Map<number, DriveCourse>();
export function arcadeCourse(trackId: number): DriveCourse {
  let course = arcadeCourses.get(trackId);
  if (!course) arcadeCourses.set(trackId, course = arcadeDriveCourse(trackId));
  return course;
}

/** An Arcade circuit: RaceV1's public weather and roadside catalog. Trees stand behind the rails. */
export function arcadeDriveRace(trackId: number, tunes: readonly CarTune[]): DriveRace {
  const course = arcadeCourse(trackId);
  const props: DriveProp[] = environmentAt(trackId, 0).objects.filter(object => object.kind !== 'tree').map(object => object.kind === 'oil'
    ? { kind: 'oil', s: object.progress / 1000, d: object.x / 1000, halfLength: object.halfLength / 1000, halfWidth: object.halfWidth / 1000 }
    : { kind: 'sign', s: object.progress / 1000, d: object.x / 1000, halfLength: 0.25, halfWidth: 1.0 });
  return new DriveRace({ course, specs: tunes.map(vehicleSpec), grid: grid(course, tunes.length, 1.8), props,
    weather: tick => { const env = environmentAt(trackId, Math.min(tick, course.maxTicks)); return { rain: env.rain > 0, wind: env.wind * 25 }; } });
}

const streetCourses = new WeakMap<CompiledStreetTrack, DriveCourse>();
export function streetCourse(track: CompiledStreetTrack): DriveCourse {
  let course = streetCourses.get(track);
  if (!course) streetCourses.set(track, course = streetDriveCourse(track));
  return course;
}

/** Street routes keep the native draft's schedule: rain across the middle three fifths, a cycling crosswind. */
export function streetWeather(maxTicks: number): (tick: number) => { rain: boolean; wind: number } {
  return tick => ({ rain: tick >= Math.floor(maxTicks / 5) && tick < Math.floor(maxTicks * 4 / 5),
    wind: Math.trunc((Math.floor(tick / 6) % 33 - 16) / 2) * 100 });
}

/** A street route with equal stock cars, its oil and breakaway props. */
export function streetDriveRace(track: CompiledStreetTrack, objects: readonly StreetObject[], roster: number, tunes?: readonly CarTune[]): DriveRace {
  const course = streetCourse(track);
  const props: DriveProp[] = objects.map(object => ({ kind: object.kind === 'oil' ? 'oil' : object.kind === 'tree_planter' ? 'planter' : 'sign',
    s: object.progressMm / 1000, d: object.lateralMm / 1000, halfLength: object.halfLengthMm / 1000, halfWidth: object.halfWidthMm / 1000 }));
  return new DriveRace({ course, specs: Array.from({ length: roster }, (_, slot) => vehicleSpec(tunes?.[slot] ?? STOCK_TUNE)),
    grid: grid(course, roster, 1.1), props, weather: streetWeather(track.maxTicks) });
}
