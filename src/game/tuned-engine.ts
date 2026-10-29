import generated from './generated/race-v1-kernels.json';
import { RULES, TRACKS } from './rules';
import { raceFinished, type RaceState } from './engine';
import { setEnvironmentContacts, type EnvironmentContact } from './environment-events';

/** Per-car physics for local garage races. STOCK_TUNE reproduces the RaceV1
 * circuit exactly; live and staked sessions never use this module.
 * Fractions are sixteenths so tuned values keep RaceV1's truncating integer steps.
 */
export interface CarTune {
  readonly accel: number; readonly coast: number; readonly brake: number;
  readonly topSpeed: number; readonly boostSpeed: number;
  readonly boostCost: number; readonly boostRecharge: number;
  readonly steer: number; readonly driftSteer: number;
  /** Lateral velocity kept per tick on a dry road (14/16) and in rain or on oil (15/16). */
  readonly dryDamping: number; readonly wetDamping: number;
  /** Steering available in rain (12/16) and on oil (8/16). */
  readonly rainSteer: number; readonly oilSteer: number;
  readonly lateralLimit: number; readonly wetLateralLimit: number;
  /** Corner and crosswind push felt by the car (16/16). */
  readonly cornerLoad: number; readonly windLoad: number;
  readonly offroadLoss: number; readonly treeLoss: number; readonly signLoss: number; readonly contactLoss: number;
  /** Garage-only mechanics. Zero at stock, so RaceV1 never sees them.
   * boostKick: extra acceleration while boosting. driftCharge: boost energy per
   * tick of drifting into a curvature-2 corner. draft: speed cap raised in another car's wake.
   * traction: extra acceleration below TRACTION_SPEED, for launches and recoveries.
   */
  readonly boostKick: number; readonly driftCharge: number; readonly draft: number; readonly traction: number;
}
export const STOCK_TUNE: CarTune = Object.freeze({
  accel: 40, coast: 12, brake: 100, topSpeed: 2400, boostSpeed: 3000, boostCost: 25, boostRecharge: 4,
  steer: 18, driftSteer: 28, dryDamping: 14, wetDamping: 15, rainSteer: 12, oilSteer: 8,
  lateralLimit: 320, wetLateralLimit: 280, cornerLoad: 16, windLoad: 16,
  offroadLoss: 90, treeLoss: 600, signLoss: 260, contactLoss: 120,
  boostKick: 0, driftCharge: 0, draft: 0, traction: 0,
});
/** A wake starts beyond contact range and reaches about 0.3 s ahead at full speed. */
export const DRAFT_RANGE = Object.freeze({ near: 3600, far: 22000, width: 1800 });
/** Drift charging needs cornering speed, a held drift and steering into the corner,
 * against its push; wiggling the wheel on the way out charges nothing. */
export const DRIFT_CHARGE_SPEED = 1600;
export const TRACTION_SPEED = 1500;
export const TUNE_FIELDS = Object.freeze(Object.keys(STOCK_TUNE) as (keyof CarTune)[]);
/** Inclusive bounds keep every tuned state inside the stock renderer and HUD ranges. */
export const TUNE_BOUNDS: Readonly<Record<keyof CarTune, readonly [number, number]>> = Object.freeze({
  accel: [30, 72], coast: [6, 16], brake: [80, 140], topSpeed: [2200, 2800], boostSpeed: [2800, 3500],
  boostCost: [15, 30], boostRecharge: [3, 8], steer: [14, 26], driftSteer: [22, 38],
  dryDamping: [12, 15], wetDamping: [13, 15], rainSteer: [8, 16], oilSteer: [4, 14],
  lateralLimit: [280, 360], wetLateralLimit: [240, 340], cornerLoad: [8, 18], windLoad: [4, 20],
  offroadLoss: [40, 110], treeLoss: [200, 700], signLoss: [40, 320], contactLoss: [40, 160],
  boostKick: [0, 30], driftCharge: [0, 24], draft: [0, 200], traction: [0, 60],
});
export function isStockTune(tune: CarTune): boolean { return TUNE_FIELDS.every(field => tune[field] === STOCK_TUNE[field]); }
export function validateTune(value: unknown): CarTune {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...TUNE_FIELDS].sort().join()) throw new TypeError('Invalid garage tune');
  const tune = value as CarTune;
  for (const field of TUNE_FIELDS) {
    const [lo, hi] = TUNE_BOUNDS[field];
    if (!Number.isInteger(tune[field]) || tune[field] < lo || tune[field] > hi) throw new RangeError(`Garage tune ${field} is out of bounds`);
  }
  if (tune.boostSpeed <= tune.topSpeed) throw new RangeError('Garage boost must raise top speed');
  return Object.freeze({ ...tune });
}

interface Environment {
  length_mm: number; centers: number[]; kinds: number[]; laterals: number[];
  rain_pattern: number[]; rain_ticks: number; wind_pattern: number[]; wind_ticks: number; wind_strength: number;
  oil_half_length: number; oil_half_width: number; tree_radius: number; sign_radius: number; tree_push: number;
}
const environments = (generated as unknown as { environment: Environment[] }).environment;
const kinds = ['tree', 'sign', 'oil'] as const;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** Rust-style Euclidean remainder and truncating division. */
const wrap = (n: number, d: number) => ((n % d) + d) % d;
const div = (a: number, b: number) => Math.trunc(a / b) || 0;

/** Boost energy earned this tick by drifting into a corner of curvature `curve`. */
function driftCharge(tune: CarTune, curve: number, control: number, speed: number, boosting: boolean): number {
  const direction = Number((control & 8) !== 0) - Number((control & 4) !== 0);
  return tune.driftCharge && !boosting && control & 16 && curve && direction === -Math.sign(curve) && speed >= DRIFT_CHARGE_SPEED ? div(tune.driftCharge * Math.abs(curve), 2) : 0;
}
/** True when another active car is far enough ahead, and close enough in line, to tow this one. */
export function inWake(state: RaceState, slot: number): boolean {
  const car = state.cars[slot]!;
  return car.finishTick === null && car.dnfTick === null && state.cars.some(other => other !== car
    && other.finishTick === null && other.dnfTick === null && other.progress - car.progress > DRAFT_RANGE.near
    && other.progress - car.progress <= DRAFT_RANGE.far && Math.abs(other.x - car.x) < DRAFT_RANGE.width);
}
/** Advance one tick with per-slot parameters, in the native slot and pair order. */
export function stepTunedRace(state: RaceState, inputs: readonly number[], tunes: readonly CarTune[]): void {
  if (inputs.length !== state.cars.length || inputs.some(v => !Number.isInteger(v) || v < 0 || v > 63)) throw new RangeError('Noncanonical garage controls');
  if (tunes.length !== state.cars.length) throw new RangeError('Every garage car needs a tune');
  if (raceFinished(state)) return;
  const env = environments[state.trackId]!, track = TRACKS[state.trackId]!, length = env.length_mm, tick = state.tick;
  const rain = env.rain_pattern[Math.floor(tick / env.rain_ticks) % env.rain_pattern.length] !== 0;
  const wind = env.wind_pattern[Math.floor(tick / env.wind_ticks) % env.wind_pattern.length]! * env.wind_strength;
  const contacts: EnvironmentContact[] = [];
  // Wakes are read from the start-of-tick grid so slot order never decides who drafts.
  const wake = state.cars.map((_, slot) => tunes[slot]!.draft > 0 && inWake(state, slot));
  state.cars.forEach((car, slot) => {
    if (car.finishTick !== null || car.dnfTick !== null) return;
    const tune = tunes[slot]!, control = inputs[slot]!;
    const boost = (control & 32) !== 0 && car.energy >= tune.boostCost;
    car.energy = boost ? car.energy - tune.boostCost : Math.min(car.energy + tune.boostRecharge, 1000);
    const acceleration = control & 2 ? -tune.brake : control & 1 ? tune.accel + (boost ? tune.boostKick : 0) + (car.speed < TRACTION_SPEED ? tune.traction : 0) : -tune.coast;
    car.speed = clamp(car.speed + acceleration, 0, (boost ? tune.boostSpeed : tune.topSpeed) + (wake[slot] ? tune.draft : 0));
    const wrapped = wrap(car.progress, length), cell = Math.floor(wrapped * 12 / length), kind = env.kinds[cell]!;
    const oil = kind === 2 && Math.abs(wrapped - env.centers[cell]!) <= env.oil_half_length && Math.abs(car.x - env.laterals[cell]!) <= env.oil_half_width;
    const direction = Number((control & 8) !== 0) - Number((control & 4) !== 0), curve = track.curves[cell]!;
    car.energy = Math.min(car.energy + driftCharge(tune, curve, control, car.speed, boost), 1000);
    let steer = direction * (control & 16 ? tune.driftSteer : tune.steer);
    if (rain) steer = div(steer * tune.rainSteer, 16);
    if (oil) steer = div(steer * tune.oilSteer, 16);
    const limit = rain ? tune.wetLateralLimit : tune.lateralLimit;
    car.vx = clamp(div((car.vx + steer) * (rain || oil ? tune.wetDamping : tune.dryDamping), 16), -limit, limit);
    const push = div(curve * car.speed * tune.cornerLoad, 1920) + div(wind * car.speed * tune.windLoad, 38400);
    car.x = clamp(car.x + car.vx + push, -9000, 9000);
    if (Math.abs(car.x) > RULES.roadHalf) car.speed = Math.max(car.speed - tune.offroadLoss, 0);
    const before = car.progress;
    car.progress += car.speed;
    let impact = false;
    if (kind !== 2 && wrapped < env.centers[cell]! && wrapped + car.speed >= env.centers[cell]!
      && Math.abs(car.x - env.laterals[cell]!) < (kind === 0 ? env.tree_radius : env.sign_radius)) {
      impact = true;
      if (kind === 0) {
        car.x = clamp(env.laterals[cell]! + (car.x > env.laterals[cell]! ? env.tree_push : -env.tree_push), -9000, 9000);
        car.speed = Math.max(car.speed - tune.treeLoss, 0);
      } else car.speed = Math.max(car.speed - tune.signLoss, 0);
    }
    if (oil || impact) contacts.push({ tick, slot, kind: kinds[kind]!, objectId: Math.floor(before / length) * 12 + cell });
  });
  // Every pair observes the preceding pairs' pushes, exactly as RaceV1 does.
  for (let i = 0; i < state.cars.length; i++) for (let j = i + 1; j < state.cars.length; j++) {
    const a = state.cars[i]!, b = state.cars[j]!;
    if (a.finishTick !== null || b.finishTick !== null || a.dnfTick !== null || b.dnfTick !== null
      || Math.abs(a.progress - b.progress) >= 3600 || Math.abs(a.x - b.x) >= 1800) continue;
    const push = div(1800 - Math.abs(a.x - b.x) + 1, 2);
    if (a.x <= b.x) { a.x -= push; b.x += push; } else { a.x += push; b.x -= push; }
    a.speed = Math.max(a.speed - tunes[i]!.contactLoss, 0);
    b.speed = Math.max(b.speed - tunes[j]!.contactLoss, 0);
  }
  state.tick++;
  const finish = length * RULES.laps;
  for (const car of state.cars) if (car.finishTick === null && car.dnfTick === null && car.progress >= finish) { car.progress = finish; car.finishTick = state.tick; }
  setEnvironmentContacts(state, contacts);
}
