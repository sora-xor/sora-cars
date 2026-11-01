import { CONTROL as C, RULES, TRACKS, curvature } from './rules';
import { executeRaceKernel } from './kernel';
import { RACE_RULES_HASH } from './environment';
import { copyEnvironmentContacts, environmentContacts, setEnvironmentContacts, type EnvironmentContact } from './environment-events';
import { validateClubAppearance, type ClubAppearance } from './catalog';
import { validateReplayBuilds, type CarBuild } from './car-builds';

export interface CarState {
  slot: number; progress: number; x: number; speed: number; vx: number;
  energy: number; finishTick: number | null; dnf: boolean; dnfTick: number | null;
  /** Presentation from the local driving model (src/game/drive); RaceV1 never sets or reads these.
   * Heading relative to the road and body slip (rad, clockwise), front wheel angle (rad, right),
   * damage points and the detached-part mask. */
  heading?: number; slip?: number; wheel?: number; damage?: number; detached?: number;
  /** Damage points by zone: front, rear, left, right. */
  zones?: readonly [number, number, number, number];
  braking?: boolean; boosting?: boolean; drifting?: boolean; reverse?: boolean;
  /** False once a wreck has been towed: the car no longer collides or shows. */
  solid?: boolean;
  /** Seconds until the marshals recover a car that has stopped gaining ground, once the HUD shows the wait. */
  recovery?: number;
}
export interface RaceState { tick: number; trackId: number; cars: CarState[]; }
export interface ReplayV1 {
  version: 1; rules: 'RaceV1'; rulesHash: string; trackId: number; names: string[]; skins: number[];
  inputs: number[][]; savedAt: string; source: 'practice' | 'multiplayer';
  dnfEvents?: { tick: number; slots: number[] }[];
  /** Optional presentation metadata; excluded from the native replay/proof transcript. */
  appearances?: ClubAppearance[];
  /** Each racer's car as built (car-builds.ts), null where none was announced; presentation only, like appearances. */
  builds?: (CarBuild | null)[];
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function createRace(trackId: number, count: number): RaceState {
  if (!Number.isInteger(count) || count < 2 || count > 8 || !TRACKS[trackId]) throw new RangeError('Invalid race grid');
  return { tick: 0, trackId, cars: Array.from({ length: count }, (_, slot) => ({
    slot, progress: 0 - Math.floor(slot / 2) * 4000, x: slot % 2 ? 1800 : -1800,
    speed: 0, vx: 0, energy: 1000, finishTick: null, dnf: false, dnfTick: null,
  })) };
}
export function copyRace(state: RaceState): RaceState {
  const snapshot = { ...state, cars: state.cars.map(c => ({ ...c })) };
  copyEnvironmentContacts(state, snapshot);
  return snapshot;
}
export function raceFinished(state: RaceState): boolean {
  return state.tick >= RULES.maxTicks || state.tick % 6 === 0 && (state.cars.filter(c => c.dnfTick === null).length < 2 || state.cars.every(c => c.finishTick !== null || c.dnf));
}
/** Only feed removals obtained from finalized native dispute state. */
export function applyRaceDnf(state: RaceState, slots: readonly number[]): void {
  if (!slots.length || slots.some((s, i) => !Number.isInteger(s) || !state.cars[s] || state.cars[s]!.dnfTick !== null || i > 0 && slots[i - 1]! >= s)) throw new RangeError('Invalid consensus DNF slots');
  for (const slot of slots) { const car = state.cars[slot]!; car.dnf = true; car.dnfTick = state.tick; }
}
/** All operations are integral and remain within the exact JS integer range. */
export function stepRace(state: RaceState, inputs: readonly number[]): void {
  if (inputs.length !== state.cars.length || inputs.some(v => !Number.isInteger(v) || v < 0 || v > 63)) throw new RangeError('Noncanonical RaceV1 controls');
  if (raceFinished(state)) return;
  executeRaceKernel(state, inputs);
}
/** Retain every native contact in one bounded network batch for presentation. */
export function stepRaceBatch(state: RaceState, frames: readonly (readonly number[])[]): void {
  if (!frames.length || frames.length > 6 || frames.some(inputs => inputs.length !== state.cars.length || inputs.some(v => !Number.isInteger(v) || v < 0 || v > 63))) throw new RangeError('Noncanonical RaceV1 batch');
  const contacts: EnvironmentContact[] = [];
  for (const inputs of frames) {
    const before = state.tick; stepRace(state, inputs);
    if (state.tick !== before) contacts.push(...environmentContacts(state));
  }
  setEnvironmentContacts(state, contacts);
}
export function rankCars(state: RaceState): CarState[] {
  return [...state.cars].sort((a, b) => {
    const eligibility = Number(a.dnfTick !== null) - Number(b.dnfTick !== null);
    if (eligibility) return eligibility;
    if (a.finishTick !== null && b.finishTick !== null) return a.finishTick - b.finishTick || a.slot - b.slot;
    if (a.finishTick !== null) return -1;
    if (b.finishTick !== null) return 1;
    return b.progress - a.progress || a.slot - b.slot;
  });
}
export function botControl(state: RaceState, slot: number): number {
  const car = state.cars[slot]!, track = TRACKS[state.trackId]!;
  const curve = curvature(track, car.progress);
  let target = ((slot % 3) - 1) * 2900;
  for (const other of state.cars) {
    const dz = other.progress - car.progress;
    if (other.slot === slot || other.finishTick !== null || other.dnf) continue;
    if (dz > 0 && dz < 14500 && Math.abs(other.x - target) < 2100) target = car.x <= other.x ? other.x - 2600 : other.x + 2600;
    // Side-by-side cars keep their lateral ordering until there is room to merge.
    if (Math.abs(dz) < 6000 && Math.abs(other.x - car.x) < 2400) target = car.x + (car.x < other.x || car.x === other.x && slot < other.slot ? -3000 : 3000);
  }
  target = clamp(target, -4800, 4800);
  const expectedX = car.x + car.vx * 5 + curve * car.speed / 24;
  let input = C.throttle;
  if (expectedX > target + 180) input |= C.left;
  if (expectedX < target - 180) input |= C.right;
  if (Math.abs(curve) >= 2 && Math.abs(expectedX - target) > 1700) input |= C.drift;
  if (Math.abs(curve) < 2 && car.energy > 500 && moduloPhase(state.tick, slot)) input |= C.boost;
  return input;
}
function moduloPhase(tick: number, slot: number): boolean { return (tick + slot * 79) % 370 < 65; }
export function validateReplay(value: unknown): ReplayV1 {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid replay');
  const r = value as ReplayV1;
  if (r.version !== 1 || r.rules !== 'RaceV1' || r.rulesHash !== RACE_RULES_HASH || !TRACKS[r.trackId] || !Array.isArray(r.names) || r.names.length < 2 || r.names.length > 8 || r.names.some(n => typeof n !== 'string' || n.length > 64) || !Array.isArray(r.skins) || r.skins.length !== r.names.length || r.skins.some(n => !Number.isInteger(n) || n < 0 || n > 5) || !Array.isArray(r.inputs) || r.inputs.length > RULES.maxTicks || r.inputs.some(row => !Array.isArray(row) || row.length !== r.names.length || row.some(v => !Number.isInteger(v) || v < 0 || v > 63)) || !['practice', 'multiplayer'].includes(r.source) || typeof r.savedAt !== 'string') throw new TypeError('Invalid or unsupported RaceV1 replay');
  const events = r.dnfEvents ?? [];
  if (r.appearances !== undefined) {
    if (!Array.isArray(r.appearances) || r.appearances.length !== r.names.length) throw new TypeError('Cosmetic replay roster mismatch');
    r.appearances.forEach(validateClubAppearance);
  }
  const builds = validateReplayBuilds(r.builds, r.names.length);
  if (!Array.isArray(events) || events.length > r.names.length || events.some((event, i) => !event || !Number.isInteger(event.tick) || event.tick < 0 || event.tick > r.inputs.length || i > 0 && events[i - 1]!.tick >= event.tick || !Array.isArray(event.slots) || !event.slots.length || event.slots.some((slot, j) => !Number.isInteger(slot) || slot < 0 || slot >= r.names.length || j > 0 && event.slots[j - 1]! >= slot))) throw new TypeError('Noncanonical DNF history');
  const state = createRace(r.trackId, r.names.length);
  for (let tick = 0; tick <= r.inputs.length; tick++) {
    const event = events.find(e => e.tick === tick); if (event) applyRaceDnf(state, event.slots);
    if (tick < r.inputs.length) { if (raceFinished(state)) throw new TypeError('Replay contains trailing terminal frames'); stepRace(state, r.inputs[tick]!); }
  }
  if (!Number.isFinite(Date.parse(r.savedAt))) throw new TypeError('Invalid replay date');
  return structuredClone(builds ? { ...r, builds } : r);
}

export function applyReplayDnf(state: RaceState, replay: ReplayV1): void {
  const event = replay.dnfEvents?.find(event => event.tick === state.tick);
  if (event) applyRaceDnf(state, event.slots);
}

/** The same event ordering used by native replay verification and live reconciliation. */
export function replayState(replay: ReplayV1): RaceState {
  const state = createRace(replay.trackId, replay.names.length);
  for (const row of replay.inputs) { applyReplayDnf(state, replay); stepRace(state, row); }
  applyReplayDnf(state, replay);
  return state;
}
