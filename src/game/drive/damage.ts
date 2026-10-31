import { clamp } from './dmath';

/** Body damage accumulates in four zones. Every hard contact adds points from
 * the car's change of velocity (its delta-v), the measure crash engineers use:
 * nudges below 3 m/s (about 11 km/h) leave no mark, a 30 m/s impact
 * (108 km/h) wrecks the car outright. Damage costs power, grip and drag, panels
 * break away at fixed thresholds, and at DAMAGE_LIMIT the car is wrecked.
 */
export const DAMAGE_LIMIT = 100;
export const ZONES = ['front', 'rear', 'left', 'right'] as const;
export type DamageZone = typeof ZONES[number];
export interface CarDamage { front: number; rear: number; left: number; right: number; total: number }

export interface CarPartDefinition {
  readonly id: string;
  readonly ja: string;
  readonly zone: DamageZone;
  readonly threshold: number;
  /** −1 left, 1 right: the near side breaks first, the far one later. */
  readonly side?: -1 | 1;
}
/** Bit order is the replay's detached-part mask; append only. */
export const CAR_PARTS: readonly CarPartDefinition[] = [
  { id: 'front-plate', ja: 'ナンバー', zone: 'front', threshold: 5 },
  { id: 'front-bumper', ja: 'フロントバンパー', zone: 'front', threshold: 13 },
  { id: 'headlight-left', ja: '左ライト', zone: 'front', threshold: 21, side: -1 },
  { id: 'headlight-right', ja: '右ライト', zone: 'front', threshold: 21, side: 1 },
  { id: 'hood', ja: 'ボンネット', zone: 'front', threshold: 32 },
  { id: 'rear-plate', ja: 'ナンバー', zone: 'rear', threshold: 5 },
  { id: 'rear-bumper', ja: 'リアバンパー', zone: 'rear', threshold: 13 },
  { id: 'trunk', ja: 'トランク', zone: 'rear', threshold: 30 },
  { id: 'mirror-left', ja: '左ミラー', zone: 'left', threshold: 4 },
  { id: 'mirror-right', ja: '右ミラー', zone: 'right', threshold: 4 },
  { id: 'door-left', ja: '左ドア', zone: 'left', threshold: 26 },
  { id: 'door-right', ja: '右ドア', zone: 'right', threshold: 26 },
];
/** The far-side twin of a sided part needs this many more points. */
const FAR_SIDE = 8;

export function emptyDamage(): CarDamage { return { front: 0, rear: 0, left: 0, right: 0, total: 0 }; }

/** Damage points for a change of velocity (m/s). */
export function impactPoints(deltaV: number, toughness: number): number {
  const x = deltaV - 3;
  return x <= 0 ? 0 : toughness * (0.9 * x + 0.12 * x * x);
}

/** Share an impact between zones by where on the body it landed:
 * x forward and y right, each as a fraction of the half length or width. */
export function addDamage(damage: CarDamage, points: number, fx: number, fy: number): void {
  if (points <= 0) return;
  const front = fx > 0 ? fx * fx : 0, rear = fx < 0 ? fx * fx : 0;
  const right = fy > 0 ? 0.6 * fy * fy : 0, left = fy < 0 ? 0.6 * fy * fy : 0;
  const sum = front + rear + left + right;
  if (sum <= 1e-9) { damage.front += points * 0.25; damage.rear += points * 0.25; damage.left += points * 0.25; damage.right += points * 0.25; }
  else {
    damage.front += points * front / sum; damage.rear += points * rear / sum;
    damage.left += points * left / sum; damage.right += points * right / sum;
  }
  damage.total = damage.front + damage.rear + damage.left + damage.right;
}

/** Parts newly broken off after an impact on side `side` (−1 left, 1 right, 0 centre). */
export function breakParts(damage: CarDamage, detached: number, side: number): number {
  let broken = 0;
  CAR_PARTS.forEach((part, bit) => {
    const mask = 2 ** bit;
    if (Math.floor(detached / mask) % 2 === 1) return;
    const needed = part.threshold + (part.side !== undefined && part.side !== side ? FAR_SIDE : 0);
    if (damage[part.zone] >= needed) broken += mask;
  });
  return broken;
}

export function partDetached(mask: number, bit: number): boolean { return Math.floor(mask / 2 ** bit) % 2 === 1; }
export function countParts(mask: number): number {
  let count = 0;
  for (let bit = 0; bit < CAR_PARTS.length; bit++) if (partDetached(mask, bit)) count++;
  return count;
}

export interface DamageEffects {
  /** Engine output share: a crushed nose loses its radiator and intake. */
  readonly power: number;
  /** Tyre grip share: bent suspension arms. */
  readonly grip: number;
  readonly rearGrip: number;
  /** Drag multiplier from torn bodywork. */
  readonly drag: number;
  /** Steady steering pull (rad, positive right) from a knocked-out alignment. */
  readonly pull: number;
}
export function damageEffects(damage: CarDamage, detached: number): DamageEffects {
  return {
    power: 1 - 0.35 * clamp(damage.front / 60, 0, 1),
    grip: 1 - 0.12 * clamp((damage.left + damage.right) / 80, 0, 1),
    rearGrip: 1 - 0.12 * clamp(damage.rear / 60, 0, 1),
    drag: 1 + 0.2 * countParts(detached) / CAR_PARTS.length + 0.15 * clamp(damage.total / DAMAGE_LIMIT, 0, 1),
    pull: 0.012 * clamp((damage.right - damage.left) / 40, -1, 1),
  };
}
