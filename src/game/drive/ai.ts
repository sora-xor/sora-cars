import { CONTROL } from '../rules';
import { courseGap, courseHeading, sampleCourse, type DriveCourse } from './course';
import { clamp, cos, sin } from './dmath';
import { damageEffects } from './damage';
import { DRIFT_BEND, DRIVE_HZ, DriveStatus, steerTick, steeringCurvature, type DriveCar, type DriveRace } from './race';
import type { VehicleSpec } from './vehicle';

/** Practice and story AI. It reads the race and returns the same six control
 * bits a human presses; it never edits the simulation. Each driver follows a
 * minimum-curvature racing line at a grip-limited speed, steers by pure
 * pursuit, overtakes around traffic and reverses out of a jam.
 */
export interface DriverSkill {
  /** Share of the tyres' cornering limit the driver dares to use. */
  readonly corner: number;
  /** Braking effort as a share of the limit. */
  readonly brake: number;
  /** Racing-line offset (m) that spreads the field across the road. */
  readonly lane: number;
  /** Boost when this much energy is banked; above 1000, never. A burst's speed
   * coasts down slowly, so long bursts gain far more than short ones and better
   * drivers wait longer. */
  readonly boostAt: number;
  /** Drifts through bends to charge the turbo when the car has drift charge. */
  readonly drift: boolean;
}
export const DRIVER_SKILLS = {
  club: { corner: 0.82, brake: 0.72, lane: 0, boostAt: 1001, drift: false },
  pro: { corner: 0.88, brake: 0.8, lane: 0, boostAt: 850, drift: false },
  ace: { corner: 0.93, brake: 0.86, lane: 0, boostAt: 950, drift: true },
} as const satisfies Record<string, DriverSkill>;

interface RacingLine { readonly offset: Float64Array; readonly curvature: Float64Array; readonly step: number; readonly count: number; readonly periodic: boolean }
const lines = new WeakMap<DriveCourse, RacingLine>();

/** Minimum-curvature line: relax the lateral offset towards d'' = −κ within the road, coarse to fine. */
export function racingLine(course: DriveCourse): RacingLine {
  const cached = lines.get(course); if (cached) return cached;
  const count = course.stations.length - 1, periodic = course.topology === 'circuit';
  const step = course.lapLength / count;
  const kappa = new Float64Array(count), limit = new Float64Array(count), offset = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    kappa[i] = (course.heading[i + 1]! - course.heading[i]!) / (course.stations[i + 1]! - course.stations[i]!);
    limit[i] = Math.max(0, Math.min(course.halfWidth[i]!, course.halfWidth[i + 1]!) - 1.05);
  }
  const at = (array: Float64Array, i: number) => periodic ? array[((i % count) + count) % count]! : array[clamp(i, 0, count - 1)]!;
  for (const stride of [32, 16, 8, 4, 2, 1]) {
    for (let sweep = 0; sweep < 60; sweep++) for (let i = 0; i < count; i++) {
      if (!periodic && (i < stride || i >= count - stride)) continue;
      let bend = 0;
      for (let k = -stride; k < stride; k++) bend += at(kappa, i + k);
      const target = (at(offset, i - stride) + at(offset, i + stride) + bend * step * step * stride / 2) / 2;
      offset[i] = clamp(target, -limit[i]!, limit[i]!);
    }
  }
  // Planning curvature: the line's, but never much below the road's own over a few metres,
  // because a car cannot hold the ideal line exactly through a hairpin.
  const curvature = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let line = 0, road = 0;
    for (let k = -1; k <= 1; k++) {
      const j = i + k, bend = at(kappa, j);
      line += bend / Math.max(0.3, 1 - bend * at(offset, j)) + (at(offset, j + 1) - 2 * at(offset, j) + at(offset, j - 1)) / (step * step);
      road += bend;
    }
    curvature[i] = Math.max(Math.abs(line), 0.8 * Math.abs(road)) / 3;
  }
  const line = { offset, curvature, step, count, periodic };
  lines.set(course, line);
  return line;
}

function lineIndex(line: RacingLine, course: DriveCourse, s: number): number {
  const position = course.topology === 'sprint' ? clamp(s, 0, course.lapLength) : s - course.lapLength * Math.floor(s / course.lapLength);
  return Math.min(line.count - 1, Math.floor(position / line.step));
}
function lineOffset(line: RacingLine, course: DriveCourse, s: number): number {
  const position = course.topology === 'sprint' ? clamp(s, 0, course.lapLength) : s - course.lapLength * Math.floor(s / course.lapLength);
  const exact = position / line.step, i = Math.min(line.count - 1, Math.floor(exact)), t = exact - i;
  const next = line.periodic ? (i + 1) % line.count : Math.min(i + 1, line.count - 1);
  return line.offset[i]! + (line.offset[next]! - line.offset[i]!) * t;
}

/** Fastest speed the driver allows through a path curvature, with downforce. */
function cornerSpeed(spec: VehicleSpec, mu: number, kappa: number): number {
  const k = Math.abs(kappa), grip = mu * 9.81;
  const denominator = k - grip * spec.downforce / 5184;
  return denominator <= 1e-6 ? 200 : Math.sqrt(grip / denominator);
}

interface Memory { stuckTicks: number; reverseTicks: number; reverseSteer: number; offset: number }
/** How fast (m/s) a driver moves off the racing line for traffic, and back. The
 * wheel winds on slowly at speed, so a sudden swerve would overshoot into a rail;
 * at 5 m/s a quicker car stayed boxed in behind the pack. */
const MOVE_OVER = 8;

export class DriveAI {
  readonly #memory = new Map<number, Memory>();
  readonly #skills: readonly DriverSkill[];
  /** Each driver's latest target speed (m/s), for tuning tools. */
  readonly targets = new Map<number, number>();
  constructor(skills: readonly DriverSkill[]) { this.#skills = skills; }

  control(race: DriveRace, slot: number): number {
    const car = race.cars[slot]!;
    if (car.status !== DriveStatus.Racing || race.done) return 0;
    const course = race.course, spec = race.specs[slot]!, skill = this.#skills[slot] ?? DRIVER_SKILLS.club;
    const line = racingLine(course), memory = this.#memory.get(slot) ?? { stuckTicks: 0, reverseTicks: 0, reverseSteer: 0, offset: 0 };
    this.#memory.set(slot, memory);
    // Set back on the road by the marshals: drive on.
    if (race.events.some(event => event.kind === 'recover' && event.slot === slot)) { memory.stuckTicks = 0; memory.reverseTicks = 0; }
    // Jammed against a wall or a wreck, or facing the wrong way: back out.
    if (memory.reverseTicks > 0) {
      memory.reverseTicks--;
      return CONTROL.brake | (memory.reverseSteer > 0 ? CONTROL.right : CONTROL.left);
    }
    const wrongWay = Math.abs(car.psi) > 1.9;
    if (race.tick > 60 && (car.u < 1.5 || wrongWay)) memory.stuckTicks++;
    else memory.stuckTicks = 0;
    if (memory.stuckTicks > 40) {
      memory.stuckTicks = 0; memory.reverseTicks = 36;
      // Reversing with the wheel turned swings the nose back towards the road's direction.
      memory.reverseSteer = car.psi > 0 ? 1 : -1;
      return CONTROL.brake;
    }
    const effects = damageEffects(car.damage, car.detached);
    const rain = race.weather(race.tick).rain;
    const mu = spec.grip * effects.grip * (rain ? spec.rainGrip : 1) * skill.corner;
    // Target speed: the slowest corner within braking reach.
    const speed = Math.max(car.u, 0);
    // ABS holds the axles a little below lock; drag helps at speed.
    const decel = (v: number) => (0.78 * mu * 9.81 * (1 + spec.downforce * v * v / 5184) + spec.drag * v * v / spec.mass) * skill.brake;
    const reach = speed * speed / (2 * decel(speed * 0.7)) + speed * 0.3 + 10;
    let target = spec.boostTopSpeed;
    for (let ahead = 0; ahead <= reach; ahead += line.step) {
      const corner = cornerSpeed(spec, mu, line.curvature[lineIndex(line, course, car.s + ahead)]!);
      const allowed = Math.sqrt(corner * corner + 2 * decel(corner) * Math.max(0, ahead - speed * 0.2));
      if (allowed < target) target = allowed;
    }
    // Grinding along a rail at speed: lift until the tyres can pull the car off it.
    const railRoom = sampleCourse(course, car.s).halfWidth + course.railOffset - spec.halfWidth - Math.abs(car.d);
    const lift = car.wall && railRoom < 0.3 && speed > 20;
    // Choose a line: the racing line, spread a little, moved over for traffic.
    let sharpest = 0;
    for (let ahead = 0; ahead <= 15; ahead += line.step) sharpest = Math.max(sharpest, line.curvature[lineIndex(line, course, car.s + ahead)]!);
    const lookahead = clamp(Math.min(5 + speed * 0.36, 0.75 / Math.max(sharpest, 1e-3)), 6, 30);
    const racing = lineOffset(line, course, car.s + lookahead);
    let lateral = racing + skill.lane;
    const width = Math.max(0.3, sampleCourse(course, car.s + lookahead).halfWidth - 1.15);
    let blocked: DriveCar | null = null, blockedGap = Infinity;
    for (const other of race.cars) {
      if (other === car || !race.solid(other)) continue;
      const gap = courseGap(course, car.s, other.s);
      if (gap <= 0 || gap > Math.max(18, speed * 1.1)) continue;
      const closing = speed - Math.max(0, other.u), sideways = Math.abs(other.psi) > 0.5 || other.u < 8;
      if ((Math.abs(other.d - lateral) < 2.1 || Math.abs(other.d - car.d) < 2.0 || sideways && Math.abs(other.d - car.d) < 3.5)
        && (closing > -1 || gap < 9) && gap < blockedGap) { blocked = other; blockedGap = gap; }
    }
    let passing = false;
    if (blocked) {
      const left = blocked.d - 2.3, right = blocked.d + 2.3;
      const clearLeft = left >= -width && !this.#occupied(race, car, left), clearRight = right <= width && !this.#occupied(race, car, right);
      passing = clearLeft || clearRight;
      if (passing) lateral = clearLeft && (!clearRight || Math.abs(left - car.d) <= Math.abs(right - car.d)) ? left : right;
      // No way past: hold back and match its speed, braking hard if it has stopped or spun.
      else target = Math.min(target, Math.max(0, blocked.u) * 0.95 + Math.sqrt(2 * 9 * Math.max(0, blockedGap - 7)));
    }
    // Move over, and back onto the line, at a pace the steering can follow.
    memory.offset = clamp(lateral - racing, memory.offset - MOVE_OVER / DRIVE_HZ, memory.offset + MOVE_OVER / DRIVE_HZ);
    lateral = racing + memory.offset;
    // Never squeeze a car alongside: keep two metres from it on its side.
    for (const other of race.cars) {
      if (other === car || !race.solid(other) || Math.abs(courseGap(course, car.s, other.s)) > 4.8) continue;
      if (other.d > car.d) lateral = Math.min(lateral, other.d - 2);
      else lateral = Math.max(lateral, other.d + 2);
    }
    lateral = clamp(lateral, -width, width);
    // Pure pursuit to the target point, expressed in the car's body frame.
    const turn = courseHeading(course, car.s + lookahead) - courseHeading(course, car.s);
    const kappa = turn / lookahead, half = turn / 2;
    const chord = Math.abs(kappa) > 1e-6 ? 2 * sin(half) / kappa : lookahead;
    const tx = chord * cos(half) - lateral * sin(turn), ty = chord * sin(half) + lateral * cos(turn) - car.d;
    const c = cos(car.psi), s = sin(car.psi);
    const bx = tx * c + ty * s, by = -tx * s + ty * c;
    const pursuit = 2 * by / Math.max(1, bx * bx + by * by);
    const desired = clamp((pursuit - effects.pull / (spec.cgToFront + spec.cgToRear)) / steeringCurvature(spec, car.u, speed), -1, 1);
    // Pick the input whose steering position after this tick lands nearest.
    const options = [[CONTROL.left, steerTick(car.steer, -1, car.u)], [0, steerTick(car.steer, 0, car.u)], [CONTROL.right, steerTick(car.steer, 1, car.u)]] as const;
    let steering = 0, best = Infinity;
    for (const [bit, next] of options) { const error = Math.abs(next - desired); if (error < best - 1e-9) { best = error; steering = bit; } }
    this.targets.set(slot, target);
    let input = steering;
    if (speed > target + 0.6) input |= CONTROL.brake;
    else if (speed < target - 0.2 && !lift) input |= CONTROL.throttle;
    // With drift charge, drift through each bend while steering into it, banking boost for the straight.
    const bend = sampleCourse(course, car.s).kappa;
    const charging = skill.drift && spec.driftCharge > 0 && !car.boosting && car.energy < 1000 - spec.boostRecharge && speed > 25
      && Math.abs(bend) >= DRIFT_BEND && Math.sign(desired) === Math.sign(bend) && !blocked && (input & CONTROL.throttle) !== 0;
    // Boost on a clear straight, or past a car once nothing is in the way for a second, once enough energy is banked, and keep a burst going.
    const clearPath = passing && !race.cars.some(other => other !== car && race.solid(other) && Math.abs(other.d - car.d) < 2.4
      && courseGap(course, car.s, other.s) > -2 && courseGap(course, car.s, other.s) < Math.max(30, speed * 1.2));
    if (charging) input |= CONTROL.drift;
    else if (input & CONTROL.throttle && target >= spec.topSpeed && speed > 30 && (!blocked || clearPath)
      && (car.boosting ? car.energy > spec.boostCost * 2 : car.energy >= skill.boostAt)) input |= CONTROL.boost;
    return input;
  }

  #occupied(race: DriveRace, car: DriveCar, lateral: number): boolean {
    return race.cars.some(other => other !== car && race.solid(other) && Math.abs(courseGap(race.course, car.s, other.s)) < 7 && Math.abs(other.d - lateral) < 1.9);
  }
}
