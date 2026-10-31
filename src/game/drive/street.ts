import type { StreetObject } from '../street/objects';
import type { StreetCarState, StreetRaceState } from '../street/session';
import type { CompiledStreetTrack } from '../street/track';
import { TAU, atan2, wrapAngle } from './dmath';
import { DriveStatus, type DriveCar, type DriveRace } from './race';
import { streetDriveRace } from './setup';

/** A street route on the local driving model, presented in the street race
 * state the renderer, HUD, results and story already read. Status 2, which the
 * native draft calls a forfeit, is a wreck here; 3 is the time limit.
 */
export interface DriveStreetCar extends StreetCarState {
  /** Damage points (DAMAGE_LIMIT wrecks) and the detached-part mask. */
  damage: number; damageFront: number; damageRear: number; damageLeft: number; damageRight: number;
  detached: number;
  /** Front wheel angle (rad, right positive) and steering position for drawing. */
  wheel: number; steer: number;
  braking: number;
  /** 1 while the car still collides (a wreck is towed after three seconds). */
  solid: number;
}
export interface DriveStreetState extends StreetRaceState { readonly cars: readonly DriveStreetCar[]; readonly physics: 'drive' }

const status = (car: DriveCar) => car.status === DriveStatus.Racing ? 0 : car.status === DriveStatus.Finished ? 1 : car.status === DriveStatus.Wrecked ? 2 : 3;

/** Street race state for one tick of a drive race. */
export function driveStreetState(race: DriveRace, track: CompiledStreetTrack, skins: readonly number[]): DriveStreetState {
  const ranks = race.ranking(), weather = race.weather(Math.min(race.tick, race.course.maxTicks));
  const gates = track.gates.map(gate => track.samples[gate.sample]!.progressMm / 1000);
  const hits = race.cars.map(() => 0);
  for (const event of race.events) if (event.kind === 'prop') hits[event.slot]! += 2 ** event.other;
  return {
    tick: race.tick, done: race.done, worldBrokenMask: race.broken, rain: Number(weather.rain), windMmPerTick: Math.trunc(weather.wind / 100),
    refundAllForfeit: false, technicalWin: false, physics: 'drive',
    cars: race.cars.map((car, slot): DriveStreetCar => {
      const lap = track.topology === 'circuit' ? Math.floor(car.s / race.course.lapLength) : 0;
      const within = car.s - lap * race.course.lapLength;
      const passed = gates.filter(progress => progress <= within).length;
      const finish = car.status === DriveStatus.Finished ? car.finishTime : 0;
      const whole = Math.floor(finish);
      const slip = car.u > 0.5 || car.u < -0.5 ? atan2(car.v, Math.abs(car.u)) : 0;
      return {
        progressMm: car.s * 1000, lateralMm: car.d * 1000, speedMmPerTick: Math.sqrt(car.u * car.u + car.v * car.v) * 1000 / 30,
        bodyYawMicroturn: car.psi * 1e6 / TAU, velocityYawMicroturn: wrapAngle(car.psi + slip) * 1e6 / TAU,
        energy: car.energy, nextGate: Math.min(gates.length, lap * gates.length + passed), status: status(car),
        finishTick: car.status === DriveStatus.Finished ? whole + 1 : 0,
        finishNumerator: car.status === DriveStatus.Finished ? Math.round((finish - whole) * 10000) : 0, finishDenominator: 10000,
        rank: ranks[slot]!, boosting: Number(car.boosting), drifting: Number(car.drifting || Math.abs(car.slipRear) > 0.12 && car.u > 8),
        wallContact: Number(car.wall), carContact: Number(car.contact), oil: Number(car.oil), oilCrossed: 0, propHitMask: hits[slot]!,
        skin: skins[slot] ?? slot % 6,
        damage: car.damage.total, damageFront: car.damage.front, damageRear: car.damage.rear, damageLeft: car.damage.left, damageRight: car.damage.right,
        detached: car.detached, wheel: car.wheel, steer: car.steer, braking: Number(car.braking), solid: Number(race.solid(car)),
      };
    }),
  };
}

/** Integer summary of a finished race, recorded in a replay and checked on re-execution. */
export function driveOutcome(race: DriveRace): Readonly<Record<string, number>> {
  const ranks = race.ranking(), outcome: Record<string, number> = { tick: race.tick, done: Number(race.done), worldBrokenMask: race.broken };
  race.cars.forEach((car, slot) => {
    outcome[`c${slot}.status`] = status(car); outcome[`c${slot}.rank`] = ranks[slot]!;
    outcome[`c${slot}.finishMicroticks`] = Math.round(car.finishTime * 1e6);
    outcome[`c${slot}.progressMm`] = Math.round(car.s * 1000);
    outcome[`c${slot}.damage`] = Math.round(car.damage.total * 1000);
    outcome[`c${slot}.detached`] = car.detached;
  });
  return Object.freeze(outcome);
}

export class DriveStreetSession {
  readonly track: CompiledStreetTrack;
  readonly race: DriveRace;
  readonly roster: number;
  readonly #actions: number[][] = [];
  readonly #skins: readonly number[];
  constructor(track: CompiledStreetTrack, objects: readonly StreetObject[], roster: number, skins: readonly number[]) {
    this.track = track; this.roster = roster; this.#skins = skins;
    this.race = streetDriveRace(track, objects, roster);
  }
  get state(): DriveStreetState { return driveStreetState(this.race, this.track, this.#skins); }
  get actions(): readonly (readonly number[])[] { return this.#actions; }
  /** Diagnostic view in the native session's flat naming. */
  get values(): Readonly<Record<string, number>> {
    const state = this.state, values: Record<string, number> = { tick: state.tick, done: Number(state.done), worldBrokenMask: state.worldBrokenMask, rain: state.rain };
    state.cars.forEach((car, slot) => { for (const [key, value] of Object.entries(car)) if (typeof value === 'number') values[`c${slot}.${key}`] = value; });
    return values;
  }
  step(controls: readonly number[]): DriveStreetState {
    if (!this.race.done) this.#actions.push([...controls]);
    this.race.step(controls);
    return this.state;
  }
}
