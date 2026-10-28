import generated from './generated/race-v1-kernels.json';
import { gameHashLiteralV1 } from '@iroha/iroha-js/game';
import { RULES, TRACKS } from './rules';
export { environmentContacts, type EnvironmentContact } from './environment-events';

export type TrackObjectKind = 'tree' | 'sign' | 'oil';
export interface TrackObject {
  readonly id: number;
  readonly kind: TrackObjectKind;
  /** Course coordinates in millimetres. Solids collide on their center crossing. */
  readonly progress: number;
  readonly x: number;
  readonly halfLength: number;
  readonly halfWidth: number;
}
export interface TrackEnvironment {
  readonly rain: number;
  /** Native signed wind-force parameter; the circuit scales it by speed / 2400. */
  readonly wind: number;
  readonly objects: readonly Readonly<TrackObject>[];
}
interface NativeEnvironment {
  length_mm: number; centers: number[]; kinds: number[]; laterals: number[];
  rain_pattern: number[]; wind_pattern: number[];
  rain_ticks: number; wind_ticks: number; wind_strength: number;
  oil_half_length: number; oil_half_width: number;
  tree_radius: number; sign_radius: number;
}
interface NativeRuntimeIdentity {
  rules_hash: string; profile_id: string; fixed_prefix: number; environment: NativeEnvironment[];
}
const native = generated as unknown as NativeRuntimeIdentity;
/** Exported by the current compiled native relation, never supplied by a replay or relay. */
export const RACE_RULES_HASH = native.rules_hash;
if (!/^[0-9a-f]{64}$/.test(native.profile_id)) throw new Error('Invalid native compiled profile identity');
export const RACE_PROFILE_ID = gameHashLiteralV1(Uint8Array.from(native.profile_id.match(/../g)!, byte => Number.parseInt(byte, 16)));
if (native.fixed_prefix !== 9 || native.environment?.length !== TRACKS.length
  || typeof RACE_RULES_HASH !== 'string' || typeof RACE_PROFILE_ID !== 'string') throw new Error('Generate the current native RaceV1 environment before starting SORA CARS.');
const kinds: readonly TrackObjectKind[] = ['tree', 'sign', 'oil'];
/** Read display geometry and public weather from the selected native relation. */
export function createNativeEnvironment(source: { environment: NativeEnvironment[] }, laps: number, maxTicks: number): (trackId: number, tick: number) => Readonly<TrackEnvironment> {
  const objects = source.environment.map((env) => Object.freeze(Array.from({ length: laps }, (_, lap) =>
    env.centers.map((center, index) => {
      const kind = kinds[env.kinds[index]!]!;
      return Object.freeze({ id: lap * env.centers.length + index, kind,
        progress: center + lap * env.length_mm, x: env.laterals[index]!,
        halfLength: kind === 'oil' ? env.oil_half_length : 0,
        halfWidth: kind === 'oil' ? env.oil_half_width : kind === 'tree' ? env.tree_radius : env.sign_radius });
    })).flat()));
  /** Public fixed inputs, read from the same native catalog used to compile the circuit. */
  return (trackId: number, tick: number): Readonly<TrackEnvironment> => {
    const env = source.environment[trackId];
    if (!Number.isInteger(trackId) || !env || !Number.isInteger(tick) || tick < 0 || tick > maxTicks) throw new RangeError('Invalid native environment coordinate');
    const rain = env.rain_pattern[Math.floor(tick / env.rain_ticks) % env.rain_pattern.length]!;
    const wind = env.wind_pattern[Math.floor(tick / env.wind_ticks) % env.wind_pattern.length]! * env.wind_strength;
    return Object.freeze({ rain, wind, objects: objects[trackId]! });
  };
}
export const environmentAt = createNativeEnvironment(native, RULES.laps, RULES.maxTicks);
