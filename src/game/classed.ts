import generated from './generated/classed-race-v1-kernels.json';
import { decodeClassedRaceValueV1, encodeClassedRaceValueV1 } from '@iroha/iroha-js/classed-race';
import type { ClassedRaceStateV1, ClassedRaceReplayV1, ClassedRaceResultV1, ClassedRaceTrackV1 } from '@iroha/iroha-js/classed-race';
import { gameHashLiteralV1 } from '@iroha/iroha-js/game';
import { createNativeRaceExecutor } from './kernel-runtime';
import { environmentContacts, setEnvironmentContacts, type EnvironmentContact } from './environment-events';
import { rankCars, type RaceState } from './engine';
import { createNativeEnvironment } from './environment';

/** Touring owns a distinct native wire state and complete compiled relation.
 * It is not a per-car multiplier or a stock replay. Ledger equipment admission
 * and profile qualification remain prerequisites for funded Touring sessions.
 */
export interface TouringRace {
  readonly profileId: string;
  readonly rulesHash: string;
  state: ClassedRaceStateV1;
}
const trackNames = ['neon_tokyo', 'harbor', 'sakura'] as const;
const classId = Object.freeze({ kind: 'touring_s1', value: null } as const);
if (generated.computation !== 'ClassedRaceV1' || generated.class_id.kind !== classId.kind || generated.class_id.value !== null
  || generated.state_width !== 7 || generated.max_ticks !== 5400 || generated.batch_ticks !== 6 || generated.laps !== 3
  || !/^[0-9a-f]{64}$/.test(generated.profile_id) || !/^[0-9a-f]{64}$/.test(generated.rules_hash)) throw new Error('Generate the exact native Touring relation.');
export const TOURING_PROFILE_ID = gameHashLiteralV1(Uint8Array.from(generated.profile_id.match(/../g)!, byte => parseInt(byte, 16)));
export const TOURING_RULES_HASH = generated.rules_hash;
export const TOURING_PERFORMANCE = Object.freeze({ ...generated.performance });
export const touringEnvironmentAt = createNativeEnvironment(generated, generated.laps, generated.max_ticks);
const execute = createNativeRaceExecutor(generated);
const contacts = new WeakMap<TouringRace, readonly EnvironmentContact[]>();
const integer = (value: number, minimum: number, maximum: number) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;

function validate(race: TouringRace): number {
  if (race?.profileId !== TOURING_PROFILE_ID || race.rulesHash !== TOURING_RULES_HASH) throw new Error('Touring profile or rules mismatch.');
  const state = race.state, track = trackNames.indexOf(state?.track?.kind);
  if (track < 0 || state.track.value !== null || state.class_id?.kind !== classId.kind || state.class_id.value !== null
    || !integer(state.tick, 0, generated.max_ticks) || !Array.isArray(state.cars) || state.cars.length < 2 || state.cars.length > 8) throw new Error('Invalid Touring state.');
  const finish = generated.environment[track]!.length_mm * generated.laps;
  for (const car of state.cars) {
    const progress = Number(car.progress_mm);
    if (!/^-?(0|[1-9][0-9]*)$/.test(String(car.progress_mm)) || !integer(progress, -12000, finish)
      || !integer(car.lateral_mm, -15300, 15300) || !integer(car.speed_mm_per_tick, 0, TOURING_PERFORMANCE.boost_speed)
      || !integer(car.lateral_velocity_mm_per_tick, -320, 320) || !integer(car.boost_energy, 0, TOURING_PERFORMANCE.boost_capacity)
      || car.finish_tick !== null && !integer(car.finish_tick, 1, state.tick)
      || car.dnf_tick !== null && !integer(car.dnf_tick, 0, state.tick)
      || (car.finish_tick !== null) !== (progress === finish)
      || car.finish_tick !== null && car.dnf_tick !== null && car.finish_tick > car.dnf_tick) throw new Error('Touring state exceeds native bounds.');
  }
  return track;
}

/** Restore only canonical native state under an explicitly selected compiled profile. */
export function restoreTouringRace(state: ClassedRaceStateV1, profileId: string, rulesHash: string): TouringRace {
  const race = { profileId, rulesHash, state: decodeClassedRaceValueV1('ClassedRaceStateV1', encodeClassedRaceValueV1('ClassedRaceStateV1', state)) };
  validate(race);
  return race;
}
export function createTouringRace(trackId: number, players: number): TouringRace {
  if (!integer(trackId, 0, 2) || !integer(players, 2, 8)) throw new RangeError('Invalid Touring grid.');
  const kernel = generated.kernels[trackId * 7 + players - 2]!;
  const cars = Array.from({ length: players }, (_, slot) => {
    const values = kernel.initial_inputs.slice(slot * 7, slot * 7 + 7);
    return { progress_mm: values[0]!, lateral_mm: values[1]!, speed_mm_per_tick: values[2]!, lateral_velocity_mm_per_tick: values[3]!, boost_energy: values[4]!, finish_tick: values[5] === 0 ? null : values[5]!, dnf_tick: values[6] === 0 ? null : values[6]! - 1 };
  });
  return restoreTouringRace({ tick: 0, class_id: classId, track: { kind: trackNames[trackId]!, value: null }, cars }, TOURING_PROFILE_ID, TOURING_RULES_HASH);
}
export function copyTouringRace(race: TouringRace): TouringRace {
  validate(race);
  const copy = { ...race, state: structuredClone(race.state) };
  const events = contacts.get(race); if (events) contacts.set(copy, events);
  return copy;
}
/** Renderer view only; canonical serialization uses race.state and the classed SDK. */
export function touringDisplayState(race: TouringRace): RaceState {
  const trackId = validate(race);
  const state = { tick: race.state.tick, trackId, cars: race.state.cars.map((car, slot) => ({ slot, progress: Number(car.progress_mm), x: car.lateral_mm, speed: car.speed_mm_per_tick, vx: car.lateral_velocity_mm_per_tick, energy: car.boost_energy, finishTick: car.finish_tick, dnfTick: car.dnf_tick, dnf: car.dnf_tick !== null })) };
  setEnvironmentContacts(state, contacts.get(race) ?? []);
  return state;
}
export function touringFinished(race: TouringRace): boolean {
  validate(race); const { tick, cars } = race.state;
  return tick === generated.max_ticks || tick % generated.batch_ticks === 0 && (cars.filter(car => car.dnf_tick === null).length < 2 || cars.every(car => car.finish_tick !== null || car.dnf_tick !== null));
}
/** Call only with removals authenticated by the native generic dispute lifecycle. */
export function applyTouringDnf(race: TouringRace, slots: readonly number[]): void {
  validate(race);
  if (!slots.length || slots.length > race.state.cars.length || slots.some((slot, i) => !integer(slot, 0, race.state.cars.length - 1) || race.state.cars[slot]!.dnf_tick !== null || i > 0 && slots[i - 1]! >= slot)) throw new Error('Invalid Touring consensus removal.');
  for (const slot of slots) race.state.cars[slot]!.dnf_tick = race.state.tick;
}
export function stepTouringRace(race: TouringRace, controls: readonly number[]): void {
  if (touringFinished(race)) throw new Error('Touring race is terminal.');
  const display = touringDisplayState(race);
  execute(display, controls);
  const next: TouringRace = { ...race, state: { ...race.state, tick: display.tick, cars: display.cars.map(car => ({ progress_mm: car.progress, lateral_mm: car.x, speed_mm_per_tick: car.speed, lateral_velocity_mm_per_tick: car.vx, boost_energy: car.energy, finish_tick: car.finishTick, dnf_tick: car.dnfTick })) } };
  validate(next);
  race.state = next.state;
  contacts.set(race, environmentContacts(display));
}
/** Prefix standings have no winners. Eligible finish ties and timeout distance ties split. */
export function touringResult(race: TouringRace): ClassedRaceResultV1 {
  const display = touringDisplayState(race), terminal = touringFinished(race), standings = rankCars(display).map(car => ({ slot: car.slot, finish_tick: car.finishTick, dnf_tick: car.dnfTick, progress_mm: car.progress }));
  const eligible = standings.filter(car => car.dnf_tick === null), leader = eligible[0];
  let winners: number[] = [];
  if (terminal && leader) {
    if (leader.finish_tick !== null) winners = eligible.filter(car => car.finish_tick === leader.finish_tick).map(car => car.slot);
    else if (eligible.length === 1) winners = [leader.slot];
    else if (race.state.tick === generated.max_ticks) winners = eligible.filter(car => car.progress_mm === leader.progress_mm).map(car => car.slot);
  }
  return { class_id: { ...classId }, track: { kind: trackNames[display.trackId]!, value: null } as ClassedRaceTrackV1, ticks: display.tick, terminal, standings, winners: winners.sort((a, b) => a - b) };
}
export function simulateTouringReplay(value: ClassedRaceReplayV1, profileId: string, rulesHash: string): TouringRace {
  const replay = decodeClassedRaceValueV1('ClassedRaceReplayV1', encodeClassedRaceValueV1('ClassedRaceReplayV1', value));
  if (profileId !== TOURING_PROFILE_ID || rulesHash !== TOURING_RULES_HASH || replay.class_id.kind !== classId.kind) throw new Error('Touring replay profile or rules mismatch.');
  if (replay.dnf_events.some((event, index) => event.tick > replay.frames.length || index > 0 && replay.dnf_events[index - 1]!.tick >= event.tick)) throw new Error('Invalid Touring replay removal order.');
  const race = createTouringRace(trackNames.indexOf(replay.track.kind), replay.player_count);
  let eventIndex = 0;
  for (let tick = 0; tick <= replay.frames.length; tick++) {
    const event = replay.dnf_events[eventIndex]; if (event?.tick === tick) { applyTouringDnf(race, event.slots); eventIndex++; }
    if (tick < replay.frames.length) {
      const frame = replay.frames[tick]!; if (frame.tick !== tick) throw new Error('Invalid Touring frame order.');
      stepTouringRace(race, frame.controls);
    }
  }
  return race;
}
