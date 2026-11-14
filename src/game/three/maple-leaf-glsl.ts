/**
 * GLSL for a fallen maple leaf's outline, shared by the city's leaf material (period-city/materials.ts: the leaves strewn
 * on roads and walkways, one square each) and the autumn banks' leaf carpet (terrain.ts: leaves drawn into the ground).
 * Seven pointed lobes round a hub below the middle of the leaf's frame, the two lowest short, with a notch between them
 * where the stalk joins: the leaf every autumn repaint strews (finish pass, rounds nine and ten).
 */
export const MAPLE_LEAF_GLSL = /* glsl */ `
// One lobe: a kite from the leaf's hub along the unit direction d, widest (half-width w) a third of the way to its
// tip at length l. Returns how far inside the lobe p lies (negative outside), and its distance from the midrib in y.
vec2 leafLobe(vec2 p, vec2 d, float l, float w) {
  float along = dot(p, d), across = abs(p.x * d.y - p.y * d.x);
  return vec2(w * min(along / (.34 * l), (l - along) / (.66 * l)) - across, across);
}
// A maple leaf in its own frame (-1..1; the middle lobe's tip toward +y, the stalk toward -y): how far inside its
// outline the point lies (negative outside), and its distance from the midrib of the lobe it lies in (1 at the hub).
vec2 mapleLeaf(vec2 at) {
  vec2 p = vec2(abs(at.x), at.y + .22);
  vec2 lobe = leafLobe(p, vec2(0., 1.), 1.2, .23);
  vec2 next = leafLobe(p, vec2(.7431, .6691), 1.06, .2); if (next.x > lobe.x) lobe = next;
  next = leafLobe(p, vec2(.9848, -.1736), .8, .17); if (next.x > lobe.x) lobe = next;
  next = leafLobe(p, vec2(.5736, -.8192), .46, .11); if (next.x > lobe.x) lobe = next;
  return vec2(max(lobe.x, .2 - length(p)), lobe.x >= 0. ? lobe.y : 1.);
}
`;
