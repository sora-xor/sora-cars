import { streetHeadingAt, streetSampleAt, type CompiledStreetTrack } from './track';
import type { StreetRaceState } from './session';

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
  const targetYaw = escapeYaw ?? Math.max(-110000, Math.min(110000, Math.trunc(upcoming / 3) + (lane - car.lateralMm) * 3));
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
