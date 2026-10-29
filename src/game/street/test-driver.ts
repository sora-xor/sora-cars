import { streetHeadingAt, streetSampleAt, type CompiledStreetTrack } from './track';
import type { StreetRaceState } from './session';

/** A 20 m heading change (microturns) sharper than any corner on the Tokyo route. */
const HAIRPIN_TURN = 170000;
/** Roads narrower than any Tokyo street (its narrowest half-width is 4,408 mm). */
const NARROW_HALF_WIDTH = 4400;
/** The fastest speed (mm/tick) whose steering can follow a curvature of `k`
 * microturns per millimetre. Native handling turns the body by
 * clamp(9000 − 2v, 1800, 9000) × min(v, 600) / 600 per tick, while the road
 * turns v·k. Below about a 10.6 m radius no speed is slow enough, so the car
 * keeps a crawl and lets the guard rail turn it. */
function steerableSpeed(k: number): number {
  const speed = k <= 13 ? 9000 / (Math.max(0, k) + 2) : (9000 - 600 * k) / 2;
  return Math.max(260, Math.floor(speed));
}

function relativeProgress(track: CompiledStreetTrack, from: number, to: number): number {
  const gap = to - from;
  if (track.topology !== 'circuit') return gap;
  const half = Math.floor(track.lengthMm / 2);
  return ((gap + half) % track.lengthMm + track.lengthMm) % track.lengthMm - half;
}

/** Practice/test AI emits the same six control bits as a human. No state edits. */
export function streetDriver(track: CompiledStreetTrack, state: StreetRaceState, slot: number): number {
  const car = state.cars[slot]!;
  if (state.done || car.status !== 0) return 0;
  const upcoming = streetHeadingAt(track, car.progressMm + 20000) - streetHeadingAt(track, car.progressMm);
  const width = Math.min(streetSampleAt(track, car.progressMm).halfWidthMm,
    streetSampleAt(track, car.progressMm + 12000).halfWidthMm) - 1250;
  let lane = (slot % 2 === 0 ? -1 : 1) * Math.min(1100, width);
  let targetSpeed = Math.max(850, Math.min(2350, 2350 - Math.trunc(Math.abs(upcoming) / 90)));
  // Mountain hairpins turn harder than any Tokyo corner (its sharpest 20 m is
  // 169,571 microturns): brake from further ahead to the speed whose steering
  // can follow each bend, and take it on the outside line, where the radius is
  // largest. Tokyo's field never meets this branch.
  let hairpin = false;
  for (let ahead = 0; ahead <= 60000; ahead += 2500) {
    const at = car.progressMm + ahead, turn = Math.abs(streetHeadingAt(track, at + 20000) - streetHeadingAt(track, at));
    if (turn <= HAIRPIN_TURN) continue;
    if (ahead <= 10000) hairpin = true;
    const bend = Math.abs(streetHeadingAt(track, at + 5000) - streetHeadingAt(track, at)) / 5000;
    targetSpeed = Math.min(targetSpeed, Math.floor(Math.sqrt(steerableSpeed(bend * 1.15) ** 2 + 150 * ahead)));
  }
  if (hairpin) lane = -Math.sign(upcoming) * Math.min(width, 2600);
  // At 2400 mm/tick, braking at 96 mm/tick² needs about 30 metres.
  // Look far enough ahead to slow before the collision solver has to stop us.
  const followDistance = Math.max(14000, Math.ceil(car.speedMmPerTick ** 2 / 192) + car.speedMmPerTick + 8000);
  const lateralClearance = car.speedMmPerTick < 400 && Math.abs(car.bodyYawMicroturn) > 45000 ? 2200 : 1850;
  let lead: { car: StreetRaceState['cars'][number]; gap: number } | undefined;
  for (let i = 0; i < state.cars.length; i++) {
    if (i === slot || state.cars[i]!.status !== 0) continue;
    const other = state.cars[i]!;
    const gap = relativeProgress(track, car.progressMm, other.progressMm);
    if (gap > 0 && gap < followDistance && Math.abs(other.lateralMm - car.lateralMm) < lateralClearance) {
      if (!lead || gap < lead.gap) lead = { car: other, gap };
      const leadSpeed = Math.max(0, other.speedMmPerTick * Math.cos(other.velocityYawMicroturn * Math.PI / 500000));
      const stoppingRoom = Math.max(0, gap - 3604 - Math.max(500, car.speedMmPerTick));
      const safeSpeed = Math.floor(Math.sqrt(leadSpeed ** 2 + 192 * stoppingRoom));
      targetSpeed = Math.min(targetSpeed, safeSpeed);
      if (gap < 6000) targetSpeed = Math.min(targetSpeed, Math.max(0, other.speedMmPerTick - 60));
    }
  }
  const occupied = (candidate: number, distance: number) => state.cars.some((other, i) => i !== slot && other.status === 0
    && Math.abs(relativeProgress(track, car.progressMm, other.progressMm)) < distance
    && Math.abs(other.lateralMm - candidate) < 1850);
  let escapeYaw: number | undefined;
  if (lead) {
    // Either side can be open. A stationary car must not trap a whole lane
    // merely because its opposite side is occupied by the adjacent grid row.
    const preferred = slot % 2 === 0 ? -1 : 1;
    const stoppedLead = state.tick >= 30 && lead.car.speedMmPerTick < 60;
    const choices = stoppedLead
      ? [preferred, -preferred].map(side => Math.max(-width, Math.min(width, lead!.car.lateralMm + side * 2200)))
      : [lead.car.lateralMm <= 0 ? Math.min(width, 2300) : Math.max(-width, -2300)];
    // Bumper-separated cars can slide sideways in parallel. Treating a whole
    // seven-metre queue as side occupancy makes adjacent escape paths block
    // each other; at crawl speed use the actual expanded longitudinal footprint.
    const passingDistance = stoppedLead && car.speedMmPerTick < 400 ? 3602 : 7000;
    const passing = choices.filter(candidate => Math.abs(candidate - lead.car.lateralMm) >= 2000 && !occupied(candidate, passingDistance))
      .sort((a, b) => Math.abs(a - car.lateralMm) - Math.abs(b - car.lateralMm))[0];
    if (passing !== undefined) {
      lane = passing;
      if (stoppedLead && lead.gap < 6000 && car.speedMmPerTick < 400 && targetSpeed < 300) {
        // Powered steering is needed to move sideways from a stopped bumper.
        // A shallow ordinary lane correction would lose its forward component
        // on every contact and crawl laterally only a millimetre at a time.
        escapeYaw = Math.sign(passing - car.lateralMm) * 110000;
        targetSpeed = Math.max(targetSpeed, 160);
      }
    }
  }
  // Do not immediately merge back through a car still alongside us.
  if (occupied(lane, 4500) && !occupied(car.lateralMm, 4500)) lane = car.lateralMm;
  // On mountain roads a full corner anticipation would pin the car to the
  // inside wall, so lean less into the bend and hold the lane harder.
  const narrow = streetSampleAt(track, car.progressMm).halfWidthMm < NARROW_HALF_WIDTH;
  const targetYaw = escapeYaw ?? Math.max(-110000, Math.min(110000, narrow
    ? Math.trunc(upcoming / 8) + (lane - car.lateralMm) * 12 : Math.trunc(upcoming / 3) + (lane - car.lateralMm) * 3));
  let error = targetYaw - car.bodyYawMicroturn;
  if (error > 500000) error -= 1000000; else if (error < -500000) error += 1000000;
  // A genuinely blocked stop means brake/hold. An open passing lane above
  // explicitly requests a crawl speed instead of tapping gas accidentally.
  let controls = targetSpeed === 0 || car.speedMmPerTick > targetSpeed + 90 ? 2 : 1;
  if (error > 1000) controls |= 8; else if (error < -1000) controls |= 4;
  if (Math.abs(upcoming) > 70000 && car.speedMmPerTick > 1700 && Math.abs(error) > 18000) controls |= 16;
  if (Math.abs(upcoming) < 4000 && Math.abs(car.lateralMm - lane) < 300
    && car.energy > 500 && car.speedMmPerTick > 1800 && targetSpeed >= 2300) controls |= 32;
  return controls;
}
