import { botControl, type RaceState } from './engine';
import { CONTROL as C, TRACKS, curvature } from './rules';
import { DRIFT_CHARGE_SPEED, inWake, type CarTune } from './tuned-engine';

/** Garage-race driving levels. Club is the unchanged practice AI. Pro and ace
 * read their own tune, prefer the oil-free centre lane, hold full boost bursts
 * and steer around traffic; ace also drift-charges when its build allows.
 */
export type DriverSkill = 'club' | 'pro' | 'ace';
const LANE = 2700, CLEAR_AHEAD = 9000, DRIFT_DEPTH = 1500;

export function garageBotControl(state: RaceState, slot: number, tune: CarTune, skill: DriverSkill): number {
  if (skill === 'club') return botControl(state, slot);
  const car = state.cars[slot]!, track = TRACKS[state.trackId]!, ace = skill === 'ace';
  const curve = curvature(track, car.progress), upcoming = curvature(track, car.progress + car.speed * 25);
  // A car that can slipstream lines up behind the next car and slingshots past once close.
  const passAt = tune.draft > 0 ? 6500 : 16000;
  let target = 0;
  if (tune.draft > 0) {
    const leader = state.cars.filter(other => other.slot !== slot && other.finishTick === null && other.dnfTick === null
      && other.progress - car.progress > passAt && other.progress - car.progress < 22000).sort((a, b) => a.progress - b.progress)[0];
    if (leader) target = leader.x;
  }
  for (const other of state.cars) {
    const dz = other.progress - car.progress;
    if (other.slot === slot || other.finishTick !== null || other.dnfTick !== null) continue;
    if (dz > -1000 && dz < passAt && Math.abs(other.x - target) < 2100) target = car.x <= other.x ? other.x - LANE : other.x + LANE;
    // Alongside: keep the existing order instead of turning into the other car.
    if (Math.abs(dz) < 5000 && Math.abs(other.x - car.x) < 2300) target = car.x + (car.x < other.x || car.x === other.x && slot < other.slot ? -2800 : 2800);
  }
  target = Math.max(-4000, Math.min(4000, target));
  const expected = car.x + car.vx * 5 + Math.trunc(curve * car.speed * tune.cornerLoad / 1920) * 5;
  // Above the unboosted cap means a burst is under way; keep it going rather than wasting the ramp.
  const boosting = car.speed > tune.topSpeed + (tune.draft > 0 && inWake(state, slot) ? tune.draft : 0);
  const clear = !state.cars.some(other => other.slot !== slot && other.finishTick === null && other.dnfTick === null
    && other.progress - car.progress > 0 && other.progress - car.progress < CLEAR_AHEAD && Math.abs(other.x - car.x) < 1900);
  const start = ace ? (tune.driftCharge ? 600 : 900) : 700;
  // Never sit on a full tank: spend it unless the next corner is a hairpin.
  const full = car.energy > 1000 - 2 * tune.boostRecharge && Math.abs(curve) <= 2 && Math.abs(upcoming) <= 2;
  let input = C.throttle;
  if (boosting ? car.energy >= tune.boostCost && Math.abs(curve) <= 2 : full || car.energy >= start && Math.abs(curve) <= 1 && Math.abs(upcoming) <= 2 && clear) input |= C.boost;
  // An ace with a drift-charging turbo drifts into each corner until it is well inside its line.
  const inward = -Math.sign(curve);
  if (ace && tune.driftCharge > 0 && curve !== 0 && !(input & C.boost) && car.energy < 1000
    && car.speed >= DRIFT_CHARGE_SPEED && (expected - target) * inward < DRIFT_DEPTH) return input | C.drift | (inward < 0 ? C.left : C.right);
  const deadband = ace ? 150 : 220;
  if (expected > target + deadband) input |= C.left;
  if (expected < target - deadband) input |= C.right;
  // Otherwise drift only to catch a wide line in a sharp corner.
  if (input & (C.left | C.right) && Math.abs(curve) >= 2 && Math.abs(expected - target) > (ace ? 900 : 1400)) input |= C.drift;
  return input;
}
