/**
 * RaceV1's real roads: one integer bend coefficient per 5 m station of an Arcade course's unrolled three-lap road,
 * from the plan's headings in arcade-roads.json (the headings the local driving model integrates). The native
 * generator (scripts/generate-native-race-roads.ts) writes the same numbers into Iroha's rules, and the browser runs
 * them from the exported kernels; this module is the one place the derivation is written down.
 *
 * Station `s` covers progress `[s * stationMm - leadMm, (s + 1) * stationMm - leadMm)` mm, from 100 m before the start
 * line to the finish. With `dh` the road's change of heading over the station (radians x 10^5, clockwise),
 * `K = -round_half_away(dh * 7,340,032 / 31,250,000)`, which is `-round(kappa * 7/1000 * 2^24)` for curvature `kappa` in
 * rad/m. RaceV1 pushes a car at `v` mm/tick by `trunc(K * v * v / 2^24)` mm a tick: seven ticks of the bend's
 * centripetal acceleration, toward the outside of the bend, so holding the wheel (7 x 18 mm/tick) balances 1.65 g and a
 * held drift (7 x 28) 2.57 g.
 */
export const RACE_ROAD = Object.freeze({
  stationMm: 5_000, leadMm: 100_000,
  /** 7 * 2^24 / (5 m * 1000 * 10^5), reduced. */
  numerator: 7_340_032, denominator: 31_250_000,
  forceDivisor: 2 ** 24,
});

export interface RaceRoadPlans {
  readonly firstM: number;
  readonly planStepM: number;
  readonly courses: readonly { readonly track: number; readonly lengthM: number; readonly headingsE5: readonly number[] }[];
}

/** The coefficients of one course, station 0 at 100 m before the start line through the station holding the finish. */
export function raceRoadCoefficients(roads: RaceRoadPlans, track: number): number[] {
  const course = roads.courses.find(item => item.track === track);
  if (!course) throw new RangeError(`No real road for track ${track}`);
  if (roads.firstM * 1000 !== -RACE_ROAD.leadMm || roads.planStepM * 1000 !== RACE_ROAD.stationMm) {
    throw new Error('RaceV1 stations follow a plan that starts 100 m before the line in 5 m steps');
  }
  const finishMm = course.lengthM * 1000;
  if (!Number.isInteger(finishMm) || finishMm % RACE_ROAD.stationMm !== 0) throw new Error(`Track ${track}: the course length must be whole stations`);
  const count = (finishMm + RACE_ROAD.leadMm) / RACE_ROAD.stationMm + 1;
  const headings = course.headingsE5;
  if (headings.length < count + 1 || headings.some(value => !Number.isSafeInteger(value))) {
    throw new Error(`Track ${track}: the plan must run past the finish in integer headings`);
  }
  const half = RACE_ROAD.denominator / 2;
  return Array.from({ length: count }, (_, station) => {
    const dh = headings[station + 1]! - headings[station]!;
    // Exact integer rounding, half away from zero: every operand stays below 2^53.
    const scaled = Math.abs(dh) * RACE_ROAD.numerator + half;
    const magnitude = (scaled - scaled % RACE_ROAD.denominator) / RACE_ROAD.denominator;
    // Outward: a right-hand bend (heading growing clockwise) pushes the car left.
    return magnitude === 0 ? 0 : dh > 0 ? -magnitude : magnitude;
  });
}
