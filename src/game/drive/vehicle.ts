import { STOCK_TUNE, type CarTune } from '../tuned-engine';
import { clamp } from './dmath';

/** Physical car description, in SI units. One AE86-sized rear-drive coupe
 * with racing tyres and a little downforce: grippy enough for the game's
 * street-race pace, heavy enough that contact moves momentum around instead of
 * stopping anything dead.
 */
export interface VehicleSpec {
  readonly mass: number;
  /** Yaw moment of inertia (kg·m²). */
  readonly inertia: number;
  readonly cgToFront: number;
  readonly cgToRear: number;
  readonly cgHeight: number;
  /** Collision box: slightly inside the drawn body, so bumpers touch first. */
  readonly halfLength: number;
  readonly halfWidth: number;
  /** Engine power (W) and the rev limiter's road speed (m/s). */
  readonly power: number;
  readonly topSpeed: number;
  readonly boostPower: number;
  readonly boostTopSpeed: number;
  /** Extra push (N) while boosting, from anti-lag. */
  readonly boostKick: number;
  /** Energy units per tick, out of 1000. */
  readonly boostCost: number;
  readonly boostRecharge: number;
  /** Aerodynamic drag (N per (m/s)²) and rolling resistance (N). */
  readonly drag: number;
  readonly rolling: number;
  /** Engine braking off the throttle (N). */
  readonly coast: number;
  readonly brakeForce: number;
  /** Peak tyre friction coefficient on a dry road. */
  readonly grip: number;
  /** Normal-load gain from downforce at 72 m/s (scales with speed²). */
  readonly downforce: number;
  readonly rainGrip: number;
  readonly oilGrip: number;
  readonly offroadGrip: number;
  /** Extra resistance (N) beyond the road edge. */
  readonly offroadDrag: number;
  /** Front wheel angle (rad) at full lock, standing still. */
  readonly steerLock: number;
  /** Rear tyre grip share while the drift button is held. */
  readonly driftGrip: number;
  readonly windLoad: number;
  /** Damage taken per unit of impact; 1 for the stock body. */
  readonly toughness: number;
  /** Extra traction share for launches and recoveries. */
  readonly launch: number;
  /** Boost energy per tick of drifting into a corner. */
  readonly driftCharge: number;
  /** Drag removed in another car's wake (share). */
  readonly draft: number;
}

const G = 9.81;
const MASS = 1050;
/** Stock engine power: 100 km/h in about 2.3 s, limited by the rear tyres at first. */
const STOCK_POWER = 720_000;
/** Body drag would let the stock engine run on to about 105 m/s, so the 72 m/s limiter is reached briskly. */
const DRAG = (STOCK_POWER / 105 - 0.015 * MASS * G) / 105 ** 2;

/** Garage tunes keep their meaning: each RaceV1-scaled field becomes a physical property. */
export function vehicleSpec(tune: CarTune = STOCK_TUNE): VehicleSpec {
  const ratio = (field: keyof CarTune) => tune[field] / STOCK_TUNE[field];
  return Object.freeze({
    mass: MASS, inertia: 1750, cgToFront: 1.05, cgToRear: 1.35, cgHeight: 0.48,
    halfLength: 1.95, halfWidth: 0.81,
    power: STOCK_POWER * (0.55 + 0.45 * ratio('accel')),
    topSpeed: tune.topSpeed * 0.03,
    boostPower: STOCK_POWER * 0.9,
    boostTopSpeed: tune.boostSpeed * 0.03,
    boostKick: tune.boostKick * 180,
    boostCost: tune.boostCost,
    boostRecharge: tune.boostRecharge,
    drag: DRAG,
    rolling: 0.015 * MASS * G,
    coast: tune.coast * 120,
    brakeForce: 2.6 * MASS * G * ratio('brake'),
    grip: 2.35 * (1 + (STOCK_TUNE.cornerLoad - tune.cornerLoad) / 16 * 0.12) * (1 + (STOCK_TUNE.dryDamping - tune.dryDamping) * 0.02),
    downforce: 0.75,
    rainGrip: clamp(0.6 + 0.25 * tune.rainSteer / 16 + (STOCK_TUNE.wetDamping - tune.wetDamping) * 0.02, 0.6, 0.9),
    oilGrip: 0.22 + 0.3 * tune.oilSteer / 16,
    offroadGrip: 0.82,
    offroadDrag: tune.offroadLoss * 45,
    steerLock: 0.5 + (tune.steer - STOCK_TUNE.steer) * 0.01,
    driftGrip: clamp(0.6 - (tune.driftSteer - STOCK_TUNE.driftSteer) * 0.004, 0.5, 0.68),
    windLoad: tune.windLoad / 16,
    toughness: clamp(0.5 * ratio('contactLoss') + 0.3 * ratio('treeLoss') + 0.2 * ratio('signLoss'), 0.5, 1.4),
    launch: tune.traction / 120,
    driftCharge: tune.driftCharge / 4,
    draft: tune.draft / 400,
  });
}
