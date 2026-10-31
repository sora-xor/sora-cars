import { CONTROL } from '../rules';
import { courseGap, courseHeading, sampleCourse, type DriveCourse } from './course';
import { DAMAGE_LIMIT, addDamage, breakParts, damageEffects, emptyDamage, impactPoints, type CarDamage } from './damage';
import { atan, atan2, clamp, cos, sin, wrapAngle } from './dmath';
import type { VehicleSpec } from './vehicle';

/** Local practice and story races: a rigid-body car model in road coordinates.
 *
 * Cars carry momentum. Tyres follow a combined-slip Pacejka curve with load
 * transfer and downforce; the rear-drive coupe can power-slide and drift.
 * Walls, other cars and breakaway props exchange impulses with restitution and
 * friction at the actual contact point, so contact deflects, spins and slows a
 * car instead of stopping it. Damage builds from each impact's delta-v; panels
 * break away and a car past DAMAGE_LIMIT is wrecked.
 *
 * Everything is deterministic: fixed steps, fixed order and only exact IEEE
 * operations (see dmath.ts), so a replay of the controls reproduces the race.
 * Live and staked races keep the native RaceV1 relation; this model never
 * reaches a proof, a ledger or settlement.
 */
export const DRIVE_RULES = 'SoraDriveV1';
export const DRIVE_HZ = 30;
const SUBSTEPS = 4;
const DT = 1 / (DRIVE_HZ * SUBSTEPS);
const G = 9.81;
/** Tyre curve: peak near 9° of slip, about 80% of the peak when sliding. */
const TYRE_B = 11, TYRE_C = 1.4;
/** Wall and car contact: some bounce, plenty of scrape. */
const WALL_RESTITUTION = 0.22, WALL_FRICTION = 0.26;
const CAR_RESTITUTION = 0.28, CAR_FRICTION = 0.38;
/** A wreck stays solid this long, then is towed (becomes a ghost). */
const WRECK_SOLID_TICKS = 90;
/** Brake held at a standstill this long selects reverse. */
const REVERSE_DELAY_TICKS = 8;
const REVERSE_SPEED = 9;
/** A car that gains no ground for this long (stuck, spun round or driving the
 * wrong way) is put back on the road by the marshals. */
export const RECOVERY_TICKS = 150;
/** Sideslip (rad) a held drift settles at with full steering lock, and how
 * fast (per second) the rear tyres let go and bite again. */
const DRIFT_ANGLE = 0.45, SLIDE_RATE = 4;
/** Everyone tows in a slipstream; the garage's wind-tunnel body tows more. */
const NATURAL_DRAFT = 0.15;
/** The garage's launch traction works up to 160 km/h, as its card says. */
export const LAUNCH_SPEED = 160 / 3.6;
/** Drift charge: bends of at least this curvature (1/m) count, and a tight corner
 * (380 m radius, curve 2 in RaceV1) earns the spec's full charge per tick. */
export const DRIFT_BEND = 0.001;
const TIGHT_CORNER = 1 / 380;

/** Path curvature (1/m) at full steering lock. Slow, it is the wheels' lock;
 * at speed, the tyres' dry cornering limit with a little to spare, so a held key
 * corners as hard as the car can and a tap at 250 km/h is a gentle correction. */
export function steeringCurvature(spec: VehicleSpec, forward: number, speed: number): number {
  const lock = sin(spec.steerLock) / cos(spec.steerLock) / (spec.cgToFront + spec.cgToRear);
  const limit = spec.grip * G * (1 + spec.downforce * speed * speed / 5184) * 1.15 / Math.max(1, forward * forward);
  return Math.min(lock, limit);
}

/** The steering position after one substep towards `target` (−1, 0 or 1).
 * It winds on in a fifth of a second at town speeds and in half a second at
 * 250 km/h, so a tap at speed stays a small correction, and it always unwinds
 * in a sixth of a second when the key is released. */
export function steerSubstep(steer: number, target: number, forward: number): number {
  const delta = target - steer;
  const unwinding = delta !== 0 && Math.sign(delta) !== Math.sign(steer) && steer !== 0;
  const rate = unwinding ? 6 : 5 / (1 + Math.max(0, forward - 15) / 40);
  return steer + clamp(delta, -rate * DT, rate * DT);
}
/** The steering position after a whole tick with `target` held. */
export function steerTick(steer: number, target: number, forward: number): number {
  for (let sub = 0; sub < SUBSTEPS; sub++) steer = steerSubstep(steer, target, forward);
  return steer;
}

export const enum DriveStatus { Racing = 0, Finished = 1, Wrecked = 2, TimedOut = 3 }

export interface DriveCar {
  readonly slot: number;
  /** Progress (m, unwrapped), lateral offset (m, right positive) and heading relative to the road (rad, clockwise). */
  s: number; d: number; psi: number;
  /** Body-frame velocity (m/s forward, m/s right) and yaw rate (rad/s, clockwise). */
  u: number; v: number; r: number;
  /** Steering position −1 (full left) to 1 (full right), and the front wheel angle it produced (rad). */
  steer: number; wheel: number;
  energy: number;
  status: DriveStatus;
  /** Finishing time in ticks, including the fraction of the tick when the line was crossed. */
  finishTime: number;
  wreckTick: number;
  damage: CarDamage;
  /** Bitmask over CAR_PARTS. */
  detached: number;
  reverse: boolean; stillTicks: number;
  /** Furthest progress reached (m) and ticks since it last grew: the marshals'
   * watch. It starts a wait early, so a slow getaway is left alone. */
  best: number; idle: number;
  /** How far the rear has let go for a drift (0–1), easing in and out. */
  slide: number;
  /** Smoothed longitudinal acceleration for load transfer (m/s²). */
  surge: number;
  /** This tick's feedback for the HUD, effects and sound. */
  boosting: boolean; drifting: boolean; braking: boolean;
  oil: boolean; offroad: boolean; wall: boolean; contact: boolean;
  slipFront: number; slipRear: number;
}

export type DrivePropKind = 'oil' | 'sign' | 'planter';
export interface DriveProp {
  readonly kind: DrivePropKind;
  readonly s: number; readonly d: number;
  readonly halfLength: number; readonly halfWidth: number;
}
/** Breakaway props: mass, and the impulse their mounting absorbs as it snaps. */
const PROP_BODY: Readonly<Record<Exclude<DrivePropKind, 'oil'>, { mass: number; anchor: number }>> = {
  sign: { mass: 45, anchor: 300 }, planter: { mass: 180, anchor: 2200 },
};

export type DriveEventKind = 'wall' | 'scrape' | 'car' | 'prop' | 'part' | 'wreck' | 'finish' | 'recover';
/** Presentation record of something that happened this tick; never fed back into the simulation. */
export interface DriveEvent {
  readonly tick: number; readonly kind: DriveEventKind; readonly slot: number;
  /** Other car (car contacts), prop index (prop hits) or CAR_PARTS bit (parts). */
  readonly other: number;
  /** Contact point in road coordinates. */
  readonly s: number; readonly d: number;
  /** Delta-v of this car (m/s); for parts, the car's speed. */
  readonly strength: number;
  /** Velocity of a struck prop or a broken part, in road coordinates (m/s). */
  readonly vs: number; readonly vd: number;
}

export interface DriveWeather { readonly rain: boolean; readonly wind: number }
export interface DriveRaceSetup {
  readonly course: DriveCourse;
  readonly specs: readonly VehicleSpec[];
  readonly grid: readonly { readonly s: number; readonly d: number }[];
  readonly props: readonly DriveProp[];
  /** Deterministic weather by tick; wind is a crosswind force scale. */
  readonly weather: (tick: number) => DriveWeather;
}

export interface DriveSnapshot {
  readonly tick: number; readonly done: boolean; readonly broken: number;
  readonly propVelocity: readonly (readonly [number, number])[];
  readonly cars: readonly DriveCar[];
}

const copyCar = (car: DriveCar): DriveCar => ({ ...car, damage: { ...car.damage } });

function newCar(slot: number, s: number, d: number): DriveCar {
  return { slot, s, d, psi: 0, u: 0, v: 0, r: 0, steer: 0, wheel: 0, energy: 1000, status: DriveStatus.Racing,
    finishTime: 0, wreckTick: -1, damage: emptyDamage(), detached: 0, reverse: false, stillTicks: 0, best: s, idle: -RECOVERY_TICKS, slide: 0, surge: 0,
    boosting: false, drifting: false, braking: false, oil: false, offroad: false, wall: false, contact: false, slipFront: 0, slipRear: 0 };
}

/** Rigid-body view of a car in another car's road frame. */
interface Body { x: number; y: number; heading: number; vx: number; vy: number; w: number; m: number; inertia: number; hl: number; hw: number }

export class DriveRace {
  readonly course: DriveCourse;
  readonly specs: readonly VehicleSpec[];
  readonly props: readonly DriveProp[];
  /** Deterministic weather by tick. */
  readonly weather: (tick: number) => DriveWeather;
  tick = 0;
  done = false;
  /** Bitmask of props knocked down, in catalog order. */
  broken = 0;
  /** Velocity each prop was knocked away with (road coordinates), for its fall. */
  propVelocity: [number, number][];
  cars: DriveCar[];
  events: DriveEvent[] = [];

  constructor(setup: DriveRaceSetup) {
    const count = setup.specs.length;
    if (count < 2 || count > 8 || setup.grid.length !== count) throw new RangeError('Drive race needs 2–8 cars with grid places.');
    if (setup.props.length > 30) throw new RangeError('Too many props for the broken-prop mask.');
    this.course = setup.course; this.specs = setup.specs; this.props = setup.props; this.weather = setup.weather;
    this.cars = setup.grid.map((place, slot) => newCar(slot, place.s, place.d));
    this.propVelocity = setup.props.map(() => [0, 0]);
  }

  snapshot(): DriveSnapshot {
    return { tick: this.tick, done: this.done, broken: this.broken, propVelocity: this.propVelocity.map(v => [v[0], v[1]] as const),
      cars: this.cars.map(copyCar) };
  }
  restore(snapshot: DriveSnapshot): void {
    this.tick = snapshot.tick; this.done = snapshot.done; this.broken = snapshot.broken;
    this.propVelocity = snapshot.propVelocity.map(v => [v[0], v[1]]);
    this.cars = snapshot.cars.map(copyCar); this.events = [];
  }

  /** True while a car still collides: racing, or a fresh wreck not yet towed. */
  solid(car: DriveCar): boolean {
    return car.status === DriveStatus.Racing || car.status === DriveStatus.Wrecked && this.tick - car.wreckTick < WRECK_SOLID_TICKS;
  }

  step(controls: readonly number[]): void {
    if (controls.length !== this.cars.length || controls.some(c => !Number.isInteger(c) || c < 0 || c > 63)) throw new RangeError('Invalid drive controls.');
    this.events = [];
    if (this.done) return;
    const weather = this.weather(this.tick);
    const before = this.cars.map(car => car.s);
    const wake = this.cars.map(car => this.#inWake(car));
    for (const car of this.cars) {
      car.wall = car.contact = car.oil = car.offroad = false;
      const control = car.status === DriveStatus.Racing ? controls[car.slot]! : 0;
      const spec = this.specs[car.slot]!;
      car.boosting = car.status === DriveStatus.Racing && (control & CONTROL.boost) !== 0 && (control & CONTROL.throttle) !== 0
        && car.energy >= spec.boostCost && car.u > 8;
      car.drifting = car.status === DriveStatus.Racing && (control & CONTROL.drift) !== 0;
      car.braking = (control & CONTROL.brake) !== 0;
      if (car.status === DriveStatus.Racing) {
        if (car.braking && !(control & CONTROL.throttle) && car.u < 0.4 && car.u > -0.4) car.stillTicks++;
        else if (!car.braking || control & CONTROL.throttle) car.stillTicks = 0;
        if (car.stillTicks >= REVERSE_DELAY_TICKS) car.reverse = true;
        if (!car.braking || control & CONTROL.throttle) car.reverse = false;
      } else car.reverse = false;
    }
    for (let sub = 0; sub < SUBSTEPS; sub++) {
      for (const car of this.cars) this.#drive(car, car.status === DriveStatus.Racing ? controls[car.slot]! : 0, weather, wake[car.slot]!);
      for (const car of this.cars) if (this.solid(car)) this.#walls(car);
      for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i]!, b = this.cars[j]!;
        if (this.solid(a) && this.solid(b)) this.#cars(a, b);
      }
      for (const car of this.cars) if (this.solid(car)) this.#props(car);
    }
    for (const car of this.cars) {
      const spec = this.specs[car.slot]!;
      if (car.status !== DriveStatus.Racing) continue;
      if (car.boosting) car.energy = Math.max(0, car.energy - spec.boostCost);
      else car.energy = Math.min(1000, car.energy + spec.boostRecharge);
      const kappa = sampleCourse(this.course, car.s).kappa;
      if (car.drifting && spec.driftCharge > 0 && car.u > 25 && Math.abs(kappa) >= DRIFT_BEND && car.slide > 0.9 && Math.abs(car.slipRear) > 0.02
        && Math.sign(car.steer) === Math.sign(kappa)) car.energy = Math.min(1000, car.energy + spec.driftCharge * Math.min(2, Math.abs(kappa) / TIGHT_CORNER));
    }
    this.tick++;
    for (const car of this.cars) {
      if (car.status !== DriveStatus.Racing) continue;
      const start = before[car.slot]!;
      if (car.s >= this.course.finish && start < this.course.finish) {
        car.status = DriveStatus.Finished;
        car.finishTime = this.tick - 1 + clamp((this.course.finish - start) / Math.max(1e-9, car.s - start), 0, 1);
        this.#event('finish', car, -1, car.s, car.d, car.u, 0, 0);
      }
    }
    for (const car of this.cars) {
      if (car.status !== DriveStatus.Racing) continue;
      if (car.s > car.best + 0.05) { car.best = car.s; car.idle = 0; } else car.idle++;
      if (car.idle >= RECOVERY_TICKS) this.#recover(car);
    }
    const remaining = this.cars.filter(car => car.status === DriveStatus.Racing);
    if (this.tick >= this.course.maxTicks) {
      for (const car of remaining) car.status = DriveStatus.TimedOut;
      this.done = true;
    } else if (remaining.length === 0) this.done = true;
  }

  /** Competition order: finishers by time, then running cars by distance, wrecks last. */
  ranking(): number[] {
    const order = this.cars.map(car => car.slot).sort((a, b) => {
      const x = this.cars[a]!, y = this.cars[b]!;
      const group = (car: DriveCar) => car.status === DriveStatus.Finished ? 0 : car.status === DriveStatus.Wrecked ? 2 : 1;
      return group(x) - group(y) || (group(x) === 0 ? x.finishTime - y.finishTime : y.s - x.s) || a - b;
    });
    const ranks = new Array<number>(this.cars.length);
    order.forEach((slot, index) => {
      const previous = index > 0 ? this.cars[order[index - 1]!]! : null, car = this.cars[slot]!;
      const tied = previous && previous.status === car.status && (car.status === DriveStatus.Finished ? previous.finishTime === car.finishTime : previous.s === car.s);
      ranks[slot] = tied ? ranks[previous.slot]! : index + 1;
    });
    return ranks;
  }

  #event(kind: DriveEventKind, car: DriveCar, other: number, s: number, d: number, strength: number, vs: number, vd: number): void {
    this.events.push({ tick: this.tick, kind, slot: car.slot, other, s, d, strength, vs, vd });
  }

  /** Marshals set a stuck car down, at rest and pointing up the road, where it
   * got furthest: as near its own line as the traffic allows. With no gap they
   * try again on the next tick. */
  #recover(car: DriveCar): void {
    const room = Math.max(0, sampleCourse(this.course, car.best).halfWidth - this.specs[car.slot]!.halfWidth - 0.3);
    for (const d of [clamp(car.d, -room, room), 0, -room / 2, room / 2, -room, room]) {
      if (this.cars.some(other => other !== car && this.solid(other)
        && Math.abs(courseGap(this.course, car.best, other.s)) < 7 && Math.abs(other.d - d) < 2.3)) continue;
      car.s = car.best; car.d = d; car.psi = 0; car.u = car.v = car.r = 0;
      car.steer = car.wheel = car.surge = car.slide = 0; car.reverse = false; car.stillTicks = 0; car.idle = 0;
      this.#event('recover', car, -1, car.s, car.d, 0, 0, 0);
      return;
    }
  }

  #inWake(car: DriveCar): boolean {
    if (car.status !== DriveStatus.Racing || car.u < 30) return false;
    return this.cars.some(other => other !== car && other.status === DriveStatus.Racing && Math.abs(other.d - car.d) < 1.6
      && courseGap(this.course, car.s, other.s) > 4.5 && courseGap(this.course, car.s, other.s) < 26);
  }

  /** One substep of tyre, engine, brake, aero and gravity forces. */
  #drive(car: DriveCar, control: number, weather: DriveWeather, wake: boolean): void {
    const spec = this.specs[car.slot]!, road = sampleCourse(this.course, car.s);
    const racing = car.status === DriveStatus.Racing, wrecked = car.status === DriveStatus.Wrecked;
    const effects = damageEffects(car.damage, car.detached);
    const throttle = racing && (control & CONTROL.throttle) !== 0;
    const brake = racing ? car.braking && !car.reverse : true;
    const drift = car.drifting;
    const target = racing ? Number((control & CONTROL.right) !== 0) - Number((control & CONTROL.left) !== 0) : 0;
    car.steer = steerSubstep(car.steer, target, car.u);
    const speed = Math.sqrt(car.u * car.u + car.v * car.v);
    const a = spec.cgToFront, b = spec.cgToRear, length = a + b;
    // Normal loads: weight with downforce, moved front-to-back by acceleration.
    const aero = 1 + spec.downforce * speed * speed / 5184;
    const weight = spec.mass * G * aero;
    const transfer = spec.mass * car.surge * spec.cgHeight / length;
    const front = Math.max(0.15 * weight, weight * b / length - transfer);
    const rear = Math.max(0.15 * weight, weight * a / length + transfer);
    // Surface: rain, oil under each axle, and the verge beyond the road edge.
    const c = cos(car.psi), s = sin(car.psi);
    const oilFront = this.#onOil(car, a, c, s), oilRear = this.#onOil(car, -b, c, s);
    car.oil = car.oil || oilFront || oilRear;
    const offroad = Math.abs(car.d) > road.halfWidth;
    car.offroad = car.offroad || offroad;
    const surface = (weather.rain ? spec.rainGrip : 1) * (offroad ? spec.offroadGrip : 1) * spec.grip * effects.grip;
    const muFront = surface * (oilFront ? spec.oilGrip : 1);
    // Steering assist. The held key asks for a path curvature, at speed the
    // tyres' cornering limit, so a tap at 250 km/h is a gentle correction. The
    // front wheels point where the front axle travels on that path (the body's
    // sideslip plus the turn), and a little further: the slip angle the tyres
    // need to carry their share of the corner on this surface. A slide is
    // therefore countersteered automatically, and the yaw-rate part of the front
    // tyre's slip (its natural damping) is left alone. At walking pace the
    // wheels simply turn to the kinematic angle.
    const curvature = car.steer * steeringCurvature(spec, car.u, speed);
    const moving = car.u > 0 ? clamp((car.u - 3) / 5, 0, 1) : 0;
    const sideslip = clamp(atan2(car.v, Math.max(Math.abs(car.u), 0.5)), -0.6, 0.6);
    const demand = Math.min(0.98, car.u * car.u * Math.abs(curvature) / Math.max(1e-6, muFront * G * aero));
    const lean = atan2(demand, Math.sqrt(1 - demand * demand)) / TYRE_C;
    const tyreSlip = (curvature < 0 ? -1 : 1) * sin(lean) / cos(lean) / TYRE_B;
    const wheel = clamp(moving * (sideslip + a * curvature) + (1 - moving) * atan(curvature * length) + tyreSlip, -0.6, 0.6) + effects.pull;
    car.wheel = wheel;
    // Slightly wider rear tyres: the car understeers gently at the limit.
    // Holding drift lets the rear go; releasing it lets the tyres bite again.
    car.slide = clamp(car.slide + (drift && Math.abs(car.u) > 6 ? SLIDE_RATE : -SLIDE_RATE) * DT, 0, 1);
    const muRear = surface * (oilRear ? spec.oilGrip : 1) * effects.rearGrip * 1.06 * (1 - car.slide * (1 - spec.driftGrip));
    // Longitudinal forces.
    let driveForce = 0, brakeFront = 0, brakeRear = 0;
    if (throttle) {
      const limit = wake ? ((car.boosting ? spec.boostTopSpeed : spec.topSpeed) + spec.draftSpeed) * 1.02 : car.boosting ? spec.boostTopSpeed : spec.topSpeed;
      const power = (spec.power + (car.boosting ? spec.boostPower : 0)) * effects.power;
      driveForce = power / Math.max(Math.abs(car.u), 6) + (car.boosting ? spec.boostKick : 0);
      driveForce *= clamp((limit - car.u) / (0.025 * limit), 0, 1);
      // Traction control trims wheelspin unless the driver asks for a slide.
      const traction = muRear * rear * (drift ? 1 : 0.92) * (1 + (car.u < LAUNCH_SPEED ? spec.launch : 0));
      driveForce = Math.min(driveForce, traction);
    } else if (car.reverse && racing) {
      driveForce = car.u > -REVERSE_SPEED ? -Math.min(6000, muRear * rear * 0.8) : 0;
    }
    if (brake) {
      const force = racing ? spec.brakeForce : wrecked ? 0.35 * spec.brakeForce : 0.25 * spec.brakeForce;
      // Front-biased, with ABS holding each axle below lock so the tyres can still steer.
      brakeFront = Math.min(0.68 * force, 0.85 * muFront * front);
      brakeRear = Math.min(0.32 * force, 0.7 * muRear * rear);
    }
    if (drift && !throttle && Math.abs(car.u) > 3) brakeRear = Math.max(brakeRear, 0.35 * muRear * rear);
    if (!throttle && !car.reverse && Math.abs(car.u) > 1) brakeRear += spec.coast;
    // Front tyre, in the wheel's own frame.
    const cw = cos(wheel), sw = sin(wheel);
    const frontLateralVelocity = car.v + a * car.r;
    const frontRoll = car.u * cw + frontLateralVelocity * sw, frontSlide = -car.u * sw + frontLateralVelocity * cw;
    const frontLong = -Math.sign(frontRoll) * Math.min(brakeFront, Math.abs(frontRoll) * spec.mass * 0.5 / DT);
    const frontCapacity = Math.sqrt(Math.max(0, (muFront * front) ** 2 - frontLong * frontLong));
    const slipFront = atan2(frontSlide, Math.max(Math.abs(frontRoll), 2));
    let frontLat = -frontCapacity * sin(TYRE_C * atan(TYRE_B * slipFront));
    frontLat = clamp(frontLat, -Math.abs(frontSlide) * spec.mass * (front / weight) / DT, Math.abs(frontSlide) * spec.mass * (front / weight) / DT);
    // Rear tyre: drive or braking, then what grip is left for cornering.
    const rearLateralVelocity = car.v - b * car.r;
    let rearLong = driveForce;
    if (brakeRear > 0) rearLong -= Math.sign(car.u) * Math.min(brakeRear, Math.abs(car.u) * spec.mass * 0.5 / DT);
    rearLong = clamp(rearLong, -muRear * rear, muRear * rear);
    const rearCapacity = Math.sqrt(Math.max(0, (muRear * rear) ** 2 - rearLong * rearLong));
    const slipRear = atan2(rearLateralVelocity, Math.max(Math.abs(car.u), 2));
    let rearLat = -rearCapacity * sin(TYRE_C * atan(TYRE_B * slipRear));
    rearLat = clamp(rearLat, -Math.abs(rearLateralVelocity) * spec.mass * (rear / weight) / DT, Math.abs(rearLateralVelocity) * spec.mass * (rear / weight) / DT);
    car.slipFront = slipFront; car.slipRear = slipRear;
    // Body forces: tyres, drag (less in a slipstream), rolling, verge, gravity on grades and crosswind.
    const draft = wake ? NATURAL_DRAFT + spec.draft : 0;
    const resist = spec.drag * effects.drag * (1 - draft) * speed + (speed > 0.1 ? spec.rolling / speed : 0)
      + (offroad && speed > 0.1 ? spec.offroadDrag / speed : 0);
    let fx = frontLong * cw - frontLat * sw + rearLong - resist * car.u;
    let fy = frontLong * sw + frontLat * cw + rearLat - resist * car.v;
    const slope = -spec.mass * G * road.grade;
    fx += slope * c; fy -= slope * s;
    const wind = weather.wind * spec.windLoad * clamp(speed / 72, 0, 1);
    fx += wind * s; fy += wind * c;
    let moment = a * (frontLong * sw + frontLat * cw) - b * rearLat;
    // Stability control outside a drift, as a modern chassis would have it:
    // yaw follows the steering's request within the grip limit and sideslip
    // stays small. Its authority is capped, so a hard hit still spins the car.
    // In a drift, and while the car gathers itself after one, it holds the
    // slide the steering asks for and damps its swing instead, so a held drift
    // settles into a controllable slide and letting go straightens the car.
    if (Math.abs(car.u) > 5) {
      const beta = atan2(car.v, Math.abs(car.u)), cap = 0.35 * spec.mass * G * length;
      if (!drift && car.slide === 0) {
        const yawCap = muFront * G * (1 + spec.downforce * speed * speed / 5184) / Math.abs(car.u);
        const request = clamp(car.u * car.steer * steeringCurvature(spec, car.u, speed), -yawCap, yawCap);
        const error = car.r - request;
        const gain = Math.sign(error) === Math.sign(car.r) && Math.abs(car.r) > Math.abs(request) ? 7 : 2;
        let correction = -error * gain * spec.inertia;
        if (Math.abs(beta) > 0.1) correction += (beta - Math.sign(beta) * 0.1) * 10 * spec.inertia;
        moment += clamp(correction, -cap, cap);
      } else {
        const want = drift ? -car.steer * DRIFT_ANGLE : 0;
        const swing = (car.u * fy - car.v * fx) / (spec.mass * (car.u * car.u + car.v * car.v)) - car.r;
        moment += clamp(((beta - want) * 25 + swing * 10) * spec.inertia, -3 * cap, 3 * cap);
      }
    }
    // The body turns under its velocity: rotate (u, v) exactly, which keeps
    // speed constant through a spin, then add the forces.
    const turn = car.r * DT, ct = cos(turn), st = sin(turn), forward = car.u;
    car.u = forward * ct + car.v * st + fx / spec.mass * DT;
    car.v = car.v * ct - forward * st + fy / spec.mass * DT;
    car.r += moment / spec.inertia * DT;
    car.surge += (fx / spec.mass - car.surge) * 0.12;
    // Settle to rest instead of creeping.
    if (!throttle && !car.reverse && Math.abs(car.u) < 0.3 && Math.abs(car.v) < 0.3 && Math.abs(car.r) < 0.15) {
      car.u *= 0.5; car.v *= 0.5; car.r *= 0.5;
    }
    // Frenet integration along the road's centre line.
    const kappa = road.kappa;
    const along = (car.u * c - car.v * s) / Math.max(0.2, 1 - kappa * car.d);
    car.s += along * DT;
    car.d += (car.u * s + car.v * c) * DT;
    car.psi = wrapAngle(car.psi + (car.r - kappa * along) * DT);
  }

  #onOil(car: DriveCar, offset: number, c: number, s: number): boolean {
    for (const prop of this.props) {
      if (prop.kind !== 'oil') continue;
      const gap = courseGap(this.course, prop.s, car.s + offset * c);
      if (Math.abs(gap) <= prop.halfLength && Math.abs(car.d + offset * s - prop.d) <= prop.halfWidth) return true;
    }
    return false;
  }

  #impact(car: DriveCar, deltaV: number, bodyX: number, bodyY: number, s: number, d: number): void {
    const spec = this.specs[car.slot]!;
    const points = impactPoints(deltaV, spec.toughness);
    if (points <= 0 || car.status === DriveStatus.Finished) return;
    addDamage(car.damage, points, clamp(bodyX / spec.halfLength, -1, 1), clamp(bodyY / spec.halfWidth, -1, 1));
    this.#breakage(car, bodyY, s, d);
  }

  #breakage(car: DriveCar, bodyY: number, s: number, d: number): void {
    const broken = breakParts(car.damage, car.detached, Math.sign(bodyY));
    if (broken) {
      car.detached += broken;
      const vs = car.u * cos(car.psi) - car.v * sin(car.psi), vd = car.u * sin(car.psi) + car.v * cos(car.psi);
      for (let bit = 0; bit < 31; bit++) if (Math.floor(broken / 2 ** bit) % 2 === 1) this.#event('part', car, bit, s, d, Math.sqrt(car.u * car.u + car.v * car.v), vs, vd);
    }
    if (car.status === DriveStatus.Racing && car.damage.total >= DAMAGE_LIMIT) {
      car.status = DriveStatus.Wrecked; car.wreckTick = this.tick; car.boosting = false;
      this.#event('wreck', car, -1, car.s, car.d, car.damage.total, 0, 0);
    }
  }

  /** Guard rails: each corner and the middle of each side against both rails. */
  #walls(car: DriveCar): void {
    const spec = this.specs[car.slot]!;
    const hl = spec.halfLength, hw = spec.halfWidth;
    const points: readonly (readonly [number, number])[] = [[hl, -hw], [hl, hw], [-hl, -hw], [-hl, hw], [0, -hw], [0, hw]];
    for (let pass = 0; pass < 2; pass++) {
      const c = cos(car.psi), s = sin(car.psi);
      const kappa = sampleCourse(this.course, car.s).kappa, stretch = Math.max(0.2, 1 - kappa * car.d);
      let deepest = 0, hit: { x: number; y: number; nx: number; ny: number; side: number } | null = null;
      for (const [px, py] of points) {
        const x = px * c - py * s, y = px * s + py * c;
        const lateral = car.d + y - kappa * x * x / 2;
        const rail = sampleCourse(this.course, car.s + x / stretch).halfWidth + this.course.railOffset;
        for (const side of [-1, 1]) {
          const depth = side * lateral - rail;
          if (depth > deepest) {
            const turn = kappa * x;
            deepest = depth; hit = { x, y, nx: side * sin(turn), ny: -side * cos(turn), side };
          }
        }
      }
      if (!hit) return;
      car.wall = true;
      // Push out along the wall normal, then resolve velocity at the contact point.
      car.d += hit.ny * deepest; car.s += hit.nx * deepest / stretch;
      this.#resolveStatic(car, hit.x, hit.y, hit.nx, hit.ny, WALL_RESTITUTION, WALL_FRICTION * spec.railFriction, 'wall', -1);
    }
  }

  /** Impulse against an immovable surface. Contact (x, y) is relative to the car, in its road frame. */
  #resolveStatic(car: DriveCar, x: number, y: number, nx: number, ny: number, restitution: number, friction: number, kind: 'wall', other: number): void {
    const spec = this.specs[car.slot]!;
    const c = cos(car.psi), s = sin(car.psi);
    let vx = car.u * c - car.v * s, vy = car.u * s + car.v * c, w = car.r;
    const pvx = vx - w * y, pvy = vy + w * x;
    const vn = pvx * nx + pvy * ny;
    if (vn >= 0) return;
    const rn = x * ny - y * nx;
    const j = -(1 + (vn < -1.5 ? restitution : 0)) * vn / (1 / spec.mass + rn * rn / spec.inertia);
    vx += j * nx / spec.mass; vy += j * ny / spec.mass; w += rn * j / spec.inertia;
    const tx = -ny, ty = nx;
    const tvx = vx - w * y, tvy = vy + w * x, vt = tvx * tx + tvy * ty;
    const rt = x * ty - y * tx;
    const jt = clamp(-vt / (1 / spec.mass + rt * rt / spec.inertia), -friction * j, friction * j);
    vx += jt * tx / spec.mass; vy += jt * ty / spec.mass; w += rt * jt / spec.inertia;
    car.u = vx * c + vy * s; car.v = -vx * s + vy * c; car.r = w;
    const deltaV = Math.sqrt(j * j + jt * jt) / spec.mass;
    const bodyX = x * c + y * s, bodyY = -x * s + y * c;
    const contactS = car.s + x, contactD = car.d + y;
    if (deltaV > 1.2) this.#event(kind, car, other, contactS, contactD, deltaV, 0, 0);
    if (Math.abs(vt) > 6) {
      this.#event('scrape', car, other, contactS, contactD, Math.abs(vt), 0, 0);
      // Grinding along the rail wears the side panels, in proportion to how hard the car leans on it.
      const pressure = clamp(j / spec.mass / 0.05, 0, 1);
      addDamage(car.damage, spec.toughness * 0.0003 * Math.abs(vt) * pressure, clamp(bodyX / spec.halfLength, -1, 1), clamp(bodyY / spec.halfWidth, -1, 1));
      this.#breakage(car, bodyY, contactS, contactD);
    }
    this.#impact(car, deltaV, bodyX, bodyY, contactS, contactD);
  }

  /** Both cars as rigid bodies in `a`'s road frame (x along the road, y right). */
  #pair(a: DriveCar, b: DriveCar): { A: Body; B: Body; turn: number; gap: number } | null {
    const gap = courseGap(this.course, a.s, b.s);
    if (Math.abs(gap) > 6 || Math.abs(b.d - a.d) > 5) return null;
    const turn = courseHeading(this.course, a.s + gap) - courseHeading(this.course, a.s);
    const kappa = Math.abs(gap) > 1e-6 ? turn / gap : sampleCourse(this.course, a.s).kappa;
    // The centre line between them is an arc: chord, then B's offset along its own normal.
    const half = turn / 2, chord = Math.abs(kappa) > 1e-6 ? 2 * sin(half) / kappa : gap;
    const cx = chord * cos(half), cy = chord * sin(half);
    const ct = cos(turn), st = sin(turn);
    const body = (car: DriveCar, x: number, y: number, rotate: number, rc: number, rs: number): Body => {
      const spec = this.specs[car.slot]!;
      const c = cos(car.psi), s = sin(car.psi);
      const vx = car.u * c - car.v * s, vy = car.u * s + car.v * c;
      return { x, y, heading: car.psi + rotate, vx: vx * rc - vy * rs, vy: vx * rs + vy * rc, w: car.r,
        m: spec.mass, inertia: spec.inertia, hl: spec.halfLength, hw: spec.halfWidth };
    };
    return { A: body(a, 0, a.d, 0, 1, 0), B: body(b, cx - b.d * st, cy + b.d * ct, turn, ct, st), turn, gap };
  }

  #cars(a: DriveCar, b: DriveCar): void {
    const pair = this.#pair(a, b);
    if (!pair) return;
    const { A, B, turn } = pair;
    const contact = collideBoxes(A, B);
    if (!contact) return;
    a.contact = b.contact = true;
    const { nx, ny, depth, px, py } = contact;
    // Separate the boxes in proportion to their inverse masses.
    const share = 1 / A.m / (1 / A.m + 1 / B.m), push = Math.max(0, depth - 0.005) * 0.85;
    A.x -= nx * push * share; A.y -= ny * push * share;
    B.x += nx * push * (1 - share); B.y += ny * push * (1 - share);
    const rax = px - A.x, ray = py - A.y, rbx = px - B.x, rby = py - B.y;
    const velocity = () => {
      const vax = A.vx - A.w * ray, vay = A.vy + A.w * rax, vbx = B.vx - B.w * rby, vby = B.vy + B.w * rbx;
      return [vbx - vax, vby - vay] as const;
    };
    const [rvx, rvy] = velocity();
    const vn = rvx * nx + rvy * ny;
    let j = 0, jt = 0;
    if (vn < 0) {
      const rna = rax * ny - ray * nx, rnb = rbx * ny - rby * nx;
      j = -(1 + (vn < -1.5 ? CAR_RESTITUTION : 0)) * vn / (1 / A.m + 1 / B.m + rna * rna / A.inertia + rnb * rnb / B.inertia);
      apply(A, -j * nx, -j * ny, rax, ray); apply(B, j * nx, j * ny, rbx, rby);
      const [tvx, tvy] = velocity();
      const tx = -ny, ty = nx, vt = tvx * tx + tvy * ty;
      const rta = rax * ty - ray * tx, rtb = rbx * ty - rby * tx;
      jt = clamp(-vt / (1 / A.m + 1 / B.m + rta * rta / A.inertia + rtb * rtb / B.inertia), -CAR_FRICTION * j, CAR_FRICTION * j);
      apply(A, -jt * tx, -jt * ty, rax, ray); apply(B, jt * tx, jt * ty, rbx, rby);
    }
    // Back to each car's own road frame.
    const store = (car: DriveCar, body: Body, rotate: number, x0: number, y0: number) => {
      const rc = cos(-rotate), rs = sin(-rotate);
      const vx = body.vx * rc - body.vy * rs, vy = body.vx * rs + body.vy * rc;
      const c = cos(car.psi), s = sin(car.psi);
      car.u = vx * c + vy * s; car.v = -vx * s + vy * c; car.r = body.w;
      const dx = body.x - x0, dy = body.y - y0;
      const along = dx * rc - dy * rs, across = dx * rs + dy * rc;
      const kappa = sampleCourse(this.course, car.s).kappa;
      car.s += along / Math.max(0.2, 1 - kappa * car.d); car.d += across;
    };
    const ax0 = 0, ay0 = a.d;
    const original = this.#pair(a, b)!;
    store(a, A, 0, ax0, ay0);
    store(b, B, turn, original.B.x, original.B.y);
    const impulse = Math.sqrt(j * j + jt * jt);
    if (impulse <= 0) return;
    const local = (body: Body, car: DriveCar, rotate: number) => {
      const c = cos(car.psi + rotate), s = sin(car.psi + rotate);
      const rx = px - body.x, ry = py - body.y;
      return [rx * c + ry * s, -rx * s + ry * c] as const;
    };
    const [axb, ayb] = local(A, a, 0), [bxb, byb] = local(B, b, turn);
    const sA = a.s + px, dA = py;
    if (impulse / A.m > 1.2) { this.#event('car', a, b.slot, sA, dA, impulse / A.m, 0, 0); this.#event('car', b, a.slot, sA, dA, impulse / B.m, 0, 0); }
    this.#impact(a, impulse / A.m, axb, ayb, sA, dA);
    this.#impact(b, impulse / B.m, bxb, byb, sA, dA);
  }

  /** Breakaway props snap off on first contact and fly with the momentum they took. */
  #props(car: DriveCar): void {
    for (let index = 0; index < this.props.length; index++) {
      const prop = this.props[index]!;
      if (prop.kind === 'oil' || Math.floor(this.broken / 2 ** index) % 2 === 1) continue;
      const gap = courseGap(this.course, car.s, prop.s);
      if (Math.abs(gap) > 4 || Math.abs(prop.d - car.d) > 4) continue;
      const spec = this.specs[car.slot]!, mounting = PROP_BODY[prop.kind];
      const c = cos(car.psi), s = sin(car.psi);
      const A: Body = { x: 0, y: car.d, heading: car.psi, vx: car.u * c - car.v * s, vy: car.u * s + car.v * c, w: car.r,
        m: spec.mass, inertia: spec.inertia, hl: spec.halfLength, hw: spec.halfWidth };
      const P: Body = { x: gap, y: prop.d, heading: 0, vx: 0, vy: 0, w: 0, m: mounting.mass, inertia: 1e9, hl: prop.halfLength, hw: prop.halfWidth };
      const contact = collideBoxes(A, P);
      if (!contact) continue;
      const { nx, ny, px, py } = contact;
      const rx = px - A.x, ry = py - A.y;
      const vn = -((A.vx - A.w * ry) * nx + (A.vy + A.w * rx) * ny);
      if (vn >= 0) continue;
      const rn = rx * ny - ry * nx;
      const j = -(1.15) * vn / (1 / A.m + 1 / P.m + rn * rn / A.inertia);
      apply(A, -j * nx, -j * ny, rx, ry);
      // The mounting snaps: a further impulse against the car's motion, never more than it has.
      const speed = Math.sqrt(A.vx * A.vx + A.vy * A.vy);
      if (speed > 0.1) {
        const snap = Math.min(mounting.anchor, speed * A.m * 0.5);
        A.vx -= snap * A.vx / speed / A.m; A.vy -= snap * A.vy / speed / A.m;
      }
      car.u = A.vx * c + A.vy * s; car.v = -A.vx * s + A.vy * c; car.r = A.w;
      this.broken += 2 ** index;
      this.propVelocity[index] = [j * nx / P.m, j * ny / P.m];
      const bodyX = rx * c + ry * s, bodyY = -rx * s + ry * c;
      const deltaV = (j + mounting.anchor) / A.m;
      this.#event('prop', car, index, car.s + px, py, deltaV, j * nx / P.m, j * ny / P.m);
      this.#impact(car, deltaV, bodyX, bodyY, car.s + px, py);
    }
  }
}

function apply(body: Body, jx: number, jy: number, rx: number, ry: number): void {
  body.vx += jx / body.m; body.vy += jy / body.m; body.w += (rx * jy - ry * jx) / body.inertia;
}

/** Separating-axis test for two boxes. Returns the normal from A to B, the depth and a contact point. */
export function collideBoxes(A: Body, B: Body): { nx: number; ny: number; depth: number; px: number; py: number } | null {
  const ca = cos(A.heading), sa = sin(A.heading), cb = cos(B.heading), sb = sin(B.heading);
  const axes: readonly (readonly [number, number, number])[] = [[ca, sa, 0], [-sa, ca, 0], [cb, sb, 1], [-sb, cb, 1]];
  const dx = B.x - A.x, dy = B.y - A.y;
  let best = Infinity, nx = 0, ny = 0, owner = 0;
  for (const [x, y, who] of axes) {
    const ra = A.hl * Math.abs(ca * x + sa * y) + A.hw * Math.abs(-sa * x + ca * y);
    const rb = B.hl * Math.abs(cb * x + sb * y) + B.hw * Math.abs(-sb * x + cb * y);
    const distance = dx * x + dy * y;
    const overlap = ra + rb - Math.abs(distance);
    if (overlap <= 0) return null;
    if (overlap < best) { best = overlap; owner = who; nx = distance < 0 ? -x : x; ny = distance < 0 ? -y : y; }
  }
  // The contact is the incident box's deepest corner (or the middle of its deepest edge).
  const incident = owner === 0 ? B : A, direction = owner === 0 ? -1 : 1;
  const ci = owner === 0 ? cb : ca, si = owner === 0 ? sb : sa;
  let deepest = -Infinity, second = -Infinity, p1x = 0, p1y = 0, p2x = 0, p2y = 0;
  for (const [fx, fy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const vx = incident.x + fx * incident.hl * ci - fy * incident.hw * si;
    const vy = incident.y + fx * incident.hl * si + fy * incident.hw * ci;
    const depth = direction * (vx * nx + vy * ny);
    if (depth > deepest) { second = deepest; p2x = p1x; p2y = p1y; deepest = depth; p1x = vx; p1y = vy; }
    else if (depth > second) { second = depth; p2x = vx; p2y = vy; }
  }
  const flat = deepest - second < 0.06;
  return { nx, ny, depth: best, px: flat ? (p1x + p2x) / 2 : p1x, py: flat ? (p1y + p2y) / 2 : p1y };
}
