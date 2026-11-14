import generated from './generated/race-v1-kernels.json';
import { RACE_ROAD } from './race-roads-table';

/**
 * RaceV1's real roads as the native rules hold them: the bend coefficient under every 5 m of each Arcade course's
 * unrolled three-lap road, read from the exported native catalog (race-v1-kernels.json), so the browser, the garage's
 * tuned mirror, the bots and the camera all use the numbers Iroha proves. A car at `speed` mm/tick is pushed
 * `trunc(K * speed^2 / 2^24)` mm a tick toward the outside of the bend (race-roads-table.ts has the derivation).
 */
interface RoadEnvironment { readonly road: readonly number[]; readonly road_station_mm: number; readonly road_lead_mm: number; readonly rail_mm: number }
const environments = (generated as unknown as { environment: readonly RoadEnvironment[] }).environment;
if (environments.length !== 3 || environments.some(env => !Array.isArray(env.road) || env.road_station_mm !== RACE_ROAD.stationMm
  || env.road_lead_mm !== RACE_ROAD.leadMm)) throw new Error('Generate the native real-road RaceV1 catalog.');

/** The guard rails' faces either side of the centre line (mm): no RaceV1 car goes beyond them. */
export const RACE_RAIL_MM = environments[0]!.rail_mm;
/** Beyond the road's edge (mm) a car is on the verge and loses speed. */
export const RACE_VERGE_MM = 6000;

/** The bend coefficients of a track, station 0 at 100 m before the start line. */
export function raceRoad(trackId: number): readonly number[] {
  const env = environments[trackId];
  if (!env) throw new RangeError('Unknown RaceV1 track');
  return env.road;
}

/** The 5 m station holding a progress (mm), or -1 off the road. */
export function raceStation(trackId: number, progress: number): number {
  const station = Math.floor((progress + RACE_ROAD.leadMm) / RACE_ROAD.stationMm);
  return Number.isSafeInteger(progress) && station >= 0 && station < raceRoad(trackId).length ? station : -1;
}

/** The bend coefficient under a progress (0 off the road, before the lead-in or past the finish). */
export function bendCoefficient(trackId: number, progress: number): number {
  const station = raceStation(trackId, progress);
  return station < 0 ? 0 : raceRoad(trackId)[station]!;
}

/** RaceV1's push (mm/tick) on a car at `speed` mm/tick over `progress`: positive to the right. */
export function bendForce(trackId: number, progress: number, speed: number): number {
  return Math.trunc(bendCoefficient(trackId, progress) * speed * speed / RACE_ROAD.forceDivisor) || 0;
}

/** The largest steady push a held wheel balances (7 × 18 mm/tick) and a held drift (7 × 28). */
export const HELD_WHEEL_PUSH = 126;
export const HELD_DRIFT_PUSH = 196;

/** The fastest speed (mm/tick) at which `push` (mm/tick) can be held against a bend of coefficient `k`. */
export function bendSpeedLimit(k: number, push = HELD_WHEEL_PUSH): number {
  return k === 0 ? Infinity : Math.sqrt(push * RACE_ROAD.forceDivisor / Math.abs(k));
}
