/**
 * Surface relief shared by the asphalt material and its screen-space reflection.
 * Metre-scaled, stationary height fields: coarse aggregate over shallow surface
 * undulations. Analytic gradients avoid finite-difference shimmer, and each
 * frequency fades before its features fall below a pixel's surface footprint.
 * Geometric normals remain separate for road classification and silhouettes.
 */
export const ROAD_RELIEF_GLSL = /* glsl */ `
float soraRoadReliefHash(vec2 p) {
  vec3 h = fract(vec3(p.xyx) * .1031);
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}

// Derivative of cubic-interpolated value noise, in lattice-coordinate units.
// The derivative reaches zero at each cell boundary, so adjacent cells join.
vec2 soraRoadReliefGradient(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f), du = 6. * f * (1. - f);
  float a = soraRoadReliefHash(cell);
  float b = soraRoadReliefHash(cell + vec2(1., 0.));
  float c = soraRoadReliefHash(cell + vec2(0., 1.));
  float d = soraRoadReliefHash(cell + vec2(1.));
  return vec2(mix(b - a, d - c, u.y), mix(c - a, d - b, u.x)) * du;
}

vec3 soraRoadReliefNormal(vec3 position, vec3 geometricNormal, float footprint, float strength) {
  float norm2 = dot(geometricNormal, geometricNormal);
  // Degenerate normals, NaN controls and unbounded footprints never reach normalize().
  if (!(norm2 > 1e-8) || norm2 > 1e8) return vec3(0., 1., 0.);
  vec3 n = geometricNormal * inversesqrt(norm2);
  if (!(strength > 0.) || !(footprint >= 0.) || footprint > 1e3) return n;
  float aggregate = 1. - smoothstep(.25, .75, footprint / .10);
  float wear = 1. - smoothstep(.25, .75, footprint / .65);
  float undulation = 1. - smoothstep(.25, .75, footprint / 1.60);
  if (aggregate + wear + undulation <= 0.) return n;
  // Height amplitude / wavelength converts the gradient to dimensionless slope.
  // The middle and broad bands describe worn asphalt (18/20 mm height range),
  // not enlarged gravel. They survive the chase camera's grazing footprint
  // after individual stones become too small to resolve.
  vec2 gradient = vec2(0.);
  if (aggregate > 0.) gradient += soraRoadReliefGradient(position.xz / .10) * (.006 / .10) * aggregate;
  if (wear > 0.) gradient += soraRoadReliefGradient(position.xz / .65 + vec2(37.3, -19.7)) * (.018 / .65) * wear;
  if (undulation > 0.) gradient += soraRoadReliefGradient(position.xz / 1.60 + vec2(-51.6, 23.1)) * (.020 / 1.60) * undulation;
  vec3 slope = vec3(gradient.x, 0., gradient.y);
  slope -= n * dot(slope, n);
  // Tangential perturbation preserves banked-road orientation and scan normals.
  return normalize(n - slope * min(strength, 4.));
}
`;
