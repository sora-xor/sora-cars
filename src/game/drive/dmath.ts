/** Deterministic transcendental functions for the local driving model.
 *
 * Replays re-execute the simulation from recorded controls, so every result
 * must be bit-identical on every JavaScript engine. IEEE-754 guarantees that
 * for + − × ÷ and sqrt, but not for Math.sin, Math.atan2 or Math.exp, whose
 * accuracy each engine chooses. These polynomial forms use only exact
 * operations. Absolute error is below 1e-11 over the ranges the model uses.
 */
export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

/** Wrap an angle to [−π, π]. */
export function wrapAngle(angle: number): number {
  return angle - TAU * Math.round(angle / TAU);
}

/** Taylor series about zero, valid on [−π/2, π/2]. */
function sinCore(x: number): number {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880
    + x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000))))))));
}

export function sin(angle: number): number {
  const x = wrapAngle(angle);
  if (x > HALF_PI) return sinCore(PI - x);
  if (x < -HALF_PI) return sinCore(-PI - x);
  return sinCore(x);
}

export function cos(angle: number): number {
  return sin(angle + HALF_PI);
}

/** atan on [−1, 1]: two half-angle reductions, then a short odd series. */
function atanUnit(t: number): number {
  let x = t / (1 + Math.sqrt(1 + t * t));
  x = x / (1 + Math.sqrt(1 + x * x));
  const x2 = x * x;
  let sum = 0;
  for (let n = 21; n >= 1; n -= 2) sum = 1 / n - x2 * sum;
  return 4 * x * sum;
}

export function atan(t: number): number {
  if (t > 1) return HALF_PI - atanUnit(1 / t);
  if (t < -1) return -HALF_PI - atanUnit(1 / t);
  return atanUnit(t);
}

export function atan2(y: number, x: number): number {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
}

export const clamp = (value: number, low: number, high: number): number => value < low ? low : value > high ? high : value;
