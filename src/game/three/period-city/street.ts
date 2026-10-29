import type { CityMeshBuilder } from './geometry';
import { hashInts, poseAt, seeded, type PeriodCityLayout, type PeriodDistrict, type PeriodSide } from './layout';
import { neonPrint, NEON_COUNTS, printSlice, signPrint, SORA_BOARDS, SORA_NOBORI } from './signs';

/**
 * The street itself, as 1980s Japan furnished it: zebra crossings under
 * horizontal signals, blue steel footbridges (歩道橋) with their name plates,
 * blue overhead guide signs, and the shopping-street lamps (商店街) of Kanda,
 * Hakone and Nikko with their globes and banners. Each item is built in a
 * route frame at its progress: local +X left across the road, +Z forward.
 */
const TOWN: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'residential', 'office', 'government', 'onsen', 'nikko', 'harbour']);
const SHOPPING: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'onsen', 'nikko']);
/** Streets that string SORA's cloth banners across the road between their pavements. */
const BANNERED: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'onsen', 'nikko', 'residential', 'office', 'harbour']);
/** Pedestrians cross to the palace moats, parks and the shrine too, never into forest or the harbour water. */
const CROSSABLE: ReadonlySet<PeriodDistrict> = new Set([...TOWN, 'moat', 'park', 'shrine']);
/** Spacing of the candidate stations for lamps and crossings. */
const STATION = 8;

function routeFrame(b: CityMeshBuilder, layout: PeriodCityLayout, p: number): number {
  const at = poseAt(layout.course, p);
  b.frame(at.x, at.y, at.z, at.heading);
  return at.width;
}
/** Progress distance on the course (wrapping on circuits). */
function apart(layout: PeriodCityLayout, a: number, b: number): number {
  const { course } = layout;
  if (!course.circuit) return Math.abs(a - b);
  const d = ((a - b) % course.length + course.length) % course.length;
  return Math.min(d, course.length - d);
}
/** Whether the road runs straight and clear of landmarks, rivers and footbridges around `p`. */
function openStraight(layout: PeriodCityLayout, p: number): boolean {
  const before = poseAt(layout.course, p - 25).heading, after = poseAt(layout.course, p + 25).heading;
  if (Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before))) > .12) return false;
  return layout.landmarks.every(l => apart(layout, l.p, p) > l.length / 2 + 6)
    && layout.crossings.every(c => apart(layout, c.p, p) > 45) && layout.street.footbridges.every(f => apart(layout, f, p) > 40);
}
/** A station's crossing draw, uniform in [0, 1). */
const draw = (k: number) => seeded(hashInts(k, 41))();
/** Crossings stand at least 120 m apart: a station wins only against its neighbours' draws (chunk-independent). */
function crossingStation(k: number): boolean {
  const own = draw(k);
  if (own >= .035) return false;
  for (let j = k - 15; j <= k + 15; j++) if (j !== k && draw(j) < Math.min(.035, own)) return false;
  return true;
}
/** Street banners hang at least 120 m apart, chunk-independent like the crossings. */
const bannerDraw = (k: number) => seeded(hashInts(k, 43))();
function bannerStation(k: number): boolean {
  const own = bannerDraw(k);
  if (own >= .14) return false;
  for (let j = k - 15; j <= k + 15; j++) if (j !== k && bannerDraw(j) < Math.min(.14, own)) return false;
  return true;
}
/** No pole on the quay edge or out in the woods. */
const UNSTRUNG: ReadonlySet<PeriodDistrict> = new Set(['quay', 'forest', 'rural']);
const inCourse = (layout: PeriodCityLayout, p: number) => layout.course.circuit
  ? p >= 0 && p < layout.course.length : p >= layout.course.poses[0]!.p && p <= layout.course.poses.at(-1)!.p;
const crossingCache = new WeakMap<PeriodCityLayout, readonly number[]>();
/** Every zebra crossing's progress on the course, ascending (deterministic, chunk-independent). */
export function streetCrossings(layout: PeriodCityLayout): readonly number[] {
  const cached = crossingCache.get(layout); if (cached) return cached;
  const { course } = layout, list: number[] = [];
  const first = course.circuit ? 0 : Math.ceil(course.poses[0]!.p / STATION), last = course.circuit ? course.length : course.poses.at(-1)!.p;
  for (let k = first; k * STATION < last; k++) {
    const p = k * STATION;
    if (!inCourse(layout, p)) continue;
    const right = layout.districtAt(p, -1), left = layout.districtAt(p, 1);
    if ((TOWN.has(right) || TOWN.has(left)) && CROSSABLE.has(right) && CROSSABLE.has(left) && crossingStation(k) && openStraight(layout, p)) list.push(p);
  }
  crossingCache.set(layout, list);
  return list;
}

/** Zebra stripes and stop lines across the road, signals on arms facing the approach. */
function crossing(b: CityMeshBuilder, w: number): void {
  b.colour.set('#e4e0d6');
  for (let x = -w + .3; x < w - .3; x += .9) b.flat('wall', x, x + .45, 0, 4, .017);
  b.flat('wall', -w, w, -2.2, -1.75, .017); b.flat('wall', -w, w, 5.75, 6.2, .017);
  for (const side of [-1, 1] as const) {
    const px = side * (w + 1), reach = side < 0 ? 4.2 : 2.6;
    b.colour.set('#5a5c60'); b.cylinder('metal', px, 0, -1.2, .1, 5.8, 8);
    b.box('metal', Math.min(px, px - side * reach), Math.max(px, px - side * reach), 5.3, 5.45, -1.27, -1.13, 'b');
    // The horizontal head: green, amber, red from the driver's left; the race runs on green.
    const hx = px - side * reach;
    b.colour.set('#3a3c40'); b.box('metal', hx - .7, hx + .7, 4.9, 5.35, -1.35, -1.05, 'b');
    const lamps: readonly (readonly [number, string])[] = [[.42, '#3cf0a0'], [0, '#4a3a18'], [-.42, '#40141a']];
    for (const [dx, colour] of lamps) { b.colour.set(colour); b.front('lamp', hx + dx - .16, hx + dx + .16, 4.96, 5.28, -1.36); }
    b.colour.set('#2a2c30'); b.box('metal', hx - .72, hx + .72, 5.35, 5.42, -1.55, -1.05, 'b');
  }
}

/** A blue steel footbridge over the road, stairs down each pavement, its place-name plate toward the approach. */
function footbridge(b: CityMeshBuilder, w: number, place: number): void {
  const steel = '#3f6f7a', span = w + 3.2, deck = 5.1;
  b.colour.set(steel);
  b.box('metal', -span, span, deck, deck + .55, -1.3, 1.3, '');
  for (const z of [-1.3, 1.22]) b.box('metal', -span, span, deck + .55, deck + 1.65, z, z + .08, 'b');
  b.colour.set('#2e5560');
  for (const z of [-1.32, 1.24]) b.box('metal', -span, span, deck + 1.6, deck + 1.68, z - .02, z + .1, 'b');
  for (const side of [-1, 1] as const) {
    const x = side * (w + 2.6);
    b.colour.set(steel);
    for (const z of [-1, 1]) b.box('metal', x - .14, x + .14, 0, deck, z - .14, z + .14, 'b');
    // The stair runs back along the pavement to the next landing.
    b.face('metal', [[x - .7, deck, 1.3], [x + .7, deck, 1.3], [x + .7, 0, 11.3], [x - .7, 0, 11.3]], [0, .9, -.45]);
    b.face('metal', [[x - .7, deck - .25, 1.3], [x + .7, deck - .25, 1.3], [x + .7, -.25, 11.3], [x - .7, -.25, 11.3]], [0, -.9, .45]);
    for (const dx of [-.72, .64]) b.face('metal', [[x + dx, deck, 1.3], [x + dx + .08, deck, 1.3], [x + dx + .08, 1, 11.3], [x + dx, 1, 11.3]], [side, 0, 0]);
    for (const dx of [-.72, .64]) b.face('metal', [[x + dx, deck + 1, 1.3], [x + dx, deck, 1.3], [x + dx, 0, 11.3], [x + dx, 1, 11.3]], [dx < 0 ? -1 : 1, 0, 0]);
  }
  b.print = printSlice(signPrint('guide', place), .52, .98); b.colour.set('#f0f0f0');
  b.front('sign', -2.6, 2.6, deck + .02, deck + .53, -1.32);
  // SORA's boards on the railing either side of the plate.
  for (const s of [-1, 1]) {
    const cx = s * Math.min(span - 1.4, 5.2);
    b.colour.set('#2a2c30'); b.box('metal', cx - 1.16, cx + 1.16, deck + .5, deck + 1.66, -1.38, -1.3, 'bk');
    b.print = signPrint('board', SORA_BOARDS[s < 0 ? 0 : SORA_BOARDS.length - 1]!); b.colour.set('#ffffff');
    b.front('sign', cx - 1.1, cx + 1.1, deck + .55, deck + 1.6, -1.39);
  }
}

/** A blue guide sign hung from an arm over the approaching lanes. */
function guide(b: CityMeshBuilder, w: number, sign: number): void {
  const px = -(w + 1.2);
  b.colour.set('#7a7e84'); b.cylinder('metal', px, 0, 0, .16, 6.4, 10);
  b.box('metal', px, px + 6, 6, 6.25, -.12, .12, 'b');
  b.colour.set('#5a5e64'); b.box('metal', px + 1, px + 5.4, 3.8, 5.95, 0, .12, 'b');
  b.print = signPrint('guide', sign); b.colour.set('#ffffff');
  b.front('sign', px + 1.05, px + 5.35, 3.85, 5.9, -.02);
}

/** A cloth banner (横断幕) strung across the street between two poles, SORA's emblem in its centre. */
function streetBanner(b: CityMeshBuilder, w: number, index: number, phase: number): void {
  const px = w + 1.45, top = 7.4, half = Math.min(5.2, w - .4), y1 = top - .55, y0 = y1 - half / 4;
  b.colour.set('#5a5650');
  for (const s of [-1, 1]) b.cylinder('metal', s * px, 0, 0, .1, top, 8);
  b.colour.set('#2a2826');
  b.box('metal', -px, px, top - .36, top - .32, -.02, .02, 'b');
  for (const s of [-1, 1]) b.box('metal', s * half - .015, s * half + .015, y1, top - .34, -.015, .015, 'b');
  b.print = neonPrint('banner', index); b.colour.setRGB(phase, .7, 2);
  b.front('flag', -half, half, y0, y1, 0, -1);
}

/** A shopping-street lamp: two globes on a post and a cloth banner, printed both sides, stirring on its arms. */
function shoppingLamp(b: CityMeshBuilder, x: number, z: number, banner: number, phase: number): void {
  b.colour.set('#3a3a40'); b.cylinder('metal', x, 0, z, .07, 4.2, 8);
  b.box('metal', x - .55, x + .55, 3.95, 4.02, z - .04, z + .04, 'b');
  b.colour.set('#ffe2b6');
  for (const dx of [-.5, .5]) b.cylinder('lamp', x + dx, 3.55, z, .2, .38, 10);
  // Arms toward the road carry the banner across the drivers' view.
  const s = Math.sign(x), near = x - s * .08, far = x - s * .54;
  b.colour.set('#2a2a30');
  for (const y of [1.78, 3.42]) b.box('metal', Math.min(near, far), Math.max(near, far), y, y + .04, z - .02, z + .02, 'b');
  b.print = neonPrint('nobori', banner); b.colour.setRGB(phase, .5, s < 0 ? 1 : 0);
  b.front('flag', Math.min(near, far), Math.max(near, far), 1.8, 3.42, z, -1);
}

/** Build the street furniture whose progress falls in [from, to). */
export function buildStreet(b: CityMeshBuilder, layout: PeriodCityLayout, from: number, to: number): void {
  const crossings = streetCrossings(layout).filter(p => p >= from && p < to);
  for (const p of crossings) { const w = routeFrame(b, layout, p); crossing(b, w); }
  for (let k = Math.ceil(from / STATION); k * STATION < to; k++) {
    const p = k * STATION;
    if (k % 2 || !inCourse(layout, p) || crossings.some(c => Math.abs(c - p) < 14)) continue;
    for (const side of [-1, 1] as PeriodSide[]) {
      if (!SHOPPING.has(layout.districtAt(p, side))) continue;
      const w = routeFrame(b, layout, p);
      // Every other lamp flies SORA's banner; the rest the street's own.
      const roll = hashInts(k, side, 7) >>> 0, banner = (k / 2) % 2 === 0 ? SORA_NOBORI[roll % SORA_NOBORI.length]! : roll % NEON_COUNTS.nobori;
      shoppingLamp(b, side * (w + 1.25), 0, banner, (roll % 997) / 997);
    }
  }
  for (const p of layout.street.footbridges) if (p >= from && p < to && inCourse(layout, p)) {
    // The plate names the nearest place on the guide signs.
    const near = [...layout.street.guides].sort((a, c) => apart(layout, a.p, p) - apart(layout, c.p, p))[0];
    const w = routeFrame(b, layout, p); footbridge(b, w, near?.sign ?? 0);
  }
  for (let k = Math.ceil(from / STATION); k * STATION < to; k++) {
    const p = k * STATION;
    const right = layout.districtAt(p, -1), left = layout.districtAt(p, 1);
    if (!inCourse(layout, p) || !(BANNERED.has(right) || BANNERED.has(left)) || UNSTRUNG.has(right) || UNSTRUNG.has(left) || !bannerStation(k)) continue;
    if (!openStraight(layout, p) || streetCrossings(layout).some(c => apart(layout, c, p) < 20)
      || layout.street.guides.some(g => apart(layout, g.p, p) < 30)) continue;
    const roll = hashInts(k, 44) >>> 0, w = routeFrame(b, layout, p);
    streetBanner(b, w, roll % NEON_COUNTS.banner, (roll % 991) / 991);
  }
  for (const g of layout.street.guides) if (g.p >= from && g.p < to && inCourse(layout, g.p)) {
    const w = routeFrame(b, layout, g.p); guide(b, w, g.sign);
  }
  b.frame(0, 0, 0, 0);
}
