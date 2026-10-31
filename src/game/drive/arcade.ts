import { validateClubAppearance, type ClubAppearance } from '../catalog';
import { createRace, type RaceState } from '../engine';
import type { EnvironmentContact } from '../environment-events';
import { environmentAt } from '../environment';
import { TRACKS } from '../rules';
import { validateTune, type CarTune } from '../tuned-engine';
import { atan2 } from './dmath';
import { DRIVE_RULES, DriveStatus, type DriveRace } from './race';
import { arcadeDriveRace } from './setup';

/** A local Arcade race on the driving model: every car's tune and every tick's
 * controls. Replays re-execute the model; they are never RaceV1 transcripts.
 */
export interface DriveReplayV1 {
  version: 1; rules: typeof DRIVE_RULES; trackId: number;
  names: string[]; skins: number[]; tunes: CarTune[]; inputs: number[][]; savedAt: string; source: 'practice';
  appearances?: ClubAppearance[];
}
export const isDriveReplay = (replay: { rules: string }): replay is DriveReplayV1 => replay.rules === DRIVE_RULES;
/** The model's own limit; RaceV1 keeps 5,400 ticks. */
const MAX_TICKS = 5400;

export function validateDriveReplay(value: unknown): DriveReplayV1 {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid replay');
  const r = value as DriveReplayV1, cars = Array.isArray(r.names) ? r.names.length : 0;
  if (r.version !== 1 || r.rules !== DRIVE_RULES || !TRACKS[r.trackId] || cars < 2 || cars > 8
    || r.names.some(name => typeof name !== 'string' || name.length > 64) || !Array.isArray(r.skins) || r.skins.length !== cars
    || r.skins.some(n => !Number.isInteger(n) || n < 0 || n > 5) || !Array.isArray(r.tunes) || r.tunes.length !== cars
    || !Array.isArray(r.inputs) || r.inputs.length > MAX_TICKS
    || r.inputs.some(row => !Array.isArray(row) || row.length !== cars || row.some(v => !Number.isInteger(v) || v < 0 || v > 63))
    || r.source !== 'practice' || typeof r.savedAt !== 'string' || !Number.isFinite(Date.parse(r.savedAt))) throw new TypeError('Invalid or unsupported driving replay');
  const tunes = r.tunes.map(validateTune);
  if (r.appearances !== undefined && (!Array.isArray(r.appearances) || r.appearances.length !== cars)) throw new TypeError('Cosmetic replay roster mismatch');
  r.appearances?.forEach(validateClubAppearance);
  const race = arcadeDriveRace(r.trackId, tunes);
  for (const row of r.inputs) { if (race.done) throw new TypeError('Replay contains trailing terminal frames'); race.step(row); }
  return structuredClone({ ...r, tunes });
}

/** Re-execute a replay to its final frame. */
export function driveReplayRace(replay: DriveReplayV1): DriveRace {
  const race = arcadeDriveRace(replay.trackId, replay.tunes);
  for (const row of replay.inputs) race.step(row);
  return race;
}

/** Mirror the model into the RaceState every Arcade screen reads: millimetres,
 * millimetres per tick, the finishing tick (with its fraction) and wrecks as DNFs.
 * The presentation fields carry the car's real heading, slip and damage. */
export function syncDriveState(state: RaceState, race: DriveRace): RaceState {
  state.tick = race.tick;
  race.cars.forEach((car, slot) => {
    const target = state.cars[slot]!;
    target.progress = car.s * 1000; target.x = car.d * 1000;
    target.speed = Math.sqrt(car.u * car.u + car.v * car.v) * 1000 / 30;
    target.vx = car.v * 1000 / 30; target.energy = car.energy;
    target.finishTick = car.status === DriveStatus.Finished ? car.finishTime : null;
    target.dnf = car.status === DriveStatus.Wrecked; target.dnfTick = target.dnf ? car.wreckTick : null;
    target.heading = car.psi; target.wheel = car.wheel; target.slip = car.u > 0.5 ? atan2(car.v, car.u) : 0;
    target.damage = car.damage.total; target.detached = car.detached; target.braking = car.braking; target.boosting = car.boosting;
    target.zones = [car.damage.front, car.damage.rear, car.damage.left, car.damage.right];
    target.drifting = car.drifting || Math.abs(car.slipRear) > 0.12 && car.u > 8;
    target.solid = race.solid(car); target.reverse = car.reverse;
  });
  return state;
}

export function driveArcadeState(trackId: number, race: DriveRace): RaceState {
  return syncDriveState(createRace(trackId, race.cars.length), race);
}

/** Struck signs and the oil underfoot as the renderer's contact records (RaceV1 object ids). */
export function driveContacts(race: DriveRace, trackId: number): EnvironmentContact[] {
  const ids = environmentAt(trackId, 0).objects.filter(object => object.kind !== 'tree').map(object => object.id);
  const contacts: EnvironmentContact[] = [];
  for (const event of race.events) if (event.kind === 'prop') contacts.push({ tick: event.tick, slot: event.slot, kind: 'sign', objectId: ids[event.other]! });
  return contacts;
}

/** RaceV1 object ids of every knocked-down sign, for the 3D world. */
export function driveBrokenObjects(race: DriveRace, trackId: number): number[] {
  const ids = environmentAt(trackId, 0).objects.filter(object => object.kind !== 'tree').map(object => object.id);
  return ids.filter((_, index) => Math.floor(race.broken / 2 ** index) % 2 === 1);
}
