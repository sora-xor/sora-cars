import * as THREE from 'three';
import type { CityMeshBuilder, Vec3 } from './geometry';
import { hashInts, periodCityPlantingClear, periodCityReach, poseAt, seeded, type PeriodCityLayout, type PeriodDistrict, type PeriodSide } from './layout';
import { IROHA, neonPrint, NEON_COUNTS, printSlice, signPrint, SORA_BOARDS, SORA_NOBORI } from './signs';
import { FLORA_KIND } from './flora';

/**
 * The street itself, as 1980s Japan furnished it: zebra crossings under
 * horizontal signals, blue steel footbridges (歩道橋) with their name plates,
 * blue overhead guide signs, and the shopping-street lamps (商店街) of Kanda,
 * Hakone and Nikko with their globes and banners. Each item is built in a
 * route frame at its progress: local +X left across the road, +Z forward.
 */
const TOWN: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'residential', 'town', 'office', 'government', 'onsen', 'nikko', 'harbour']);
const SHOPPING: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'town', 'onsen', 'nikko']);
/** Streets that string SORA's cloth banners across the road between their pavements. */
const BANNERED: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'town', 'onsen', 'nikko', 'residential', 'office', 'harbour']);
/** Pedestrians cross to the palace moats, parks and the shrine too, never into forest or the harbour water. */
const CROSSABLE: ReadonlySet<PeriodDistrict> = new Set([...TOWN, 'moat', 'park', 'shrine', 'temple', 'pond']);
/** Spacing of the candidate stations for lamps and crossings. */
const STATION = 8;
/**
 * Streets strung with utility poles and overhead wires (電柱と電線), as every cutscene street is: the shopping
 * streets, backstreets and towns (Marunouchi's and Kasumigaseki's lines ran underground).
 */
const POLED: ReadonlySet<PeriodDistrict> = new Set(['kanda', 'residential', 'town', 'onsen', 'nikko', 'harbour']);
/** A pole every POLE_STATIONS stations on each side (the two sides offset by half that), standing at the kerb. */
const POLE_STATIONS = 4, POLE_KERB = .55;

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

/** Points (route-frame local x, height) where a pole's wires hang: the crossarm's three, then the cable below. */
const WIRE_POINTS: readonly (readonly [number, number])[] = [[-.6, 8.62], [0, 8.62], [.6, 8.62], [.18, 6.9]];
/** The telephone and cable-TV lines lower on the poles of the autumn routes' towns, as the cutscenes and their repaints
 * string five or six wires over every street. */
const LOW_CABLES: readonly (readonly [number, number])[] = [[-.2, 5.6], [.22, 5.1]];
/** Whether a pole stands at station k on `side` (chunk-independent). */
function poleAt(layout: PeriodCityLayout, k: number, side: PeriodSide): boolean {
  if (((k + (side > 0 ? 0 : POLE_STATIONS / 2)) % POLE_STATIONS + POLE_STATIONS) % POLE_STATIONS !== 0) return false;
  const p = k * STATION;
  if (!inCourse(layout, p) || !POLED.has(layout.districtAt(p, side))) return false;
  // A landmark keeps its own side's kerb clear only where its front comes near the road (a moat wall, a gate); across
  // the street and before a set-back hall (Kudan Kaikan) the poles stand as usual.
  return streetCrossings(layout).every(c => apart(layout, c, p) > 10) && layout.street.footbridges.every(f => apart(layout, f, p) > 12)
    && layout.street.guides.every(g => apart(layout, g.p, p) > 10)
    && layout.landmarks.every(l => l.side !== side || l.clearance > 2 || apart(layout, l.p, p) > l.length / 2 + 4);
}
/**
 * A concrete utility pole at the kerb: its shaft, the crossarm with its insulators, a transformer can on some, and a
 * number plate at eye height (route-frame local x).
 */
function utilityPole(b: CityMeshBuilder, x: number, side: PeriodSide, roll: number): void {
  b.colour.set('#8c8b86'); b.cylinder('stone', x, 0, 0, .15, 9.4, 8);
  b.colour.set('#34343a'); b.box('metal', x - .8, x + .8, 8.5, 8.62, -.05, .05);
  b.box('metal', x - .03, x + .03, 7.9, 8.5, -.03, .03, 'b');
  b.colour.set('#d6d2c6');
  for (const [dx] of WIRE_POINTS.slice(0, 3)) b.box('metal', x + dx - .04, x + dx + .04, 8.62, 8.74, -.04, .04, 'b');
  if (roll < .35) {
    b.colour.set('#7c807c'); b.cylinder('metal', x - side * .38, 6.55, 0, .24, .9, 8);
    b.colour.set('#34343a'); b.box('metal', x - side * .38 - .05, x - side * .05, 6.9, 6.96, -.03, .03);
  }
  b.colour.set('#e8e6dc'); b.box('metal', x - .155, x + .155, 2.4, 2.75, -.02, .02);
}
/**
 * The autumn towns' extras on a pole: clamps for the low cables, and on about a third of the poles a crime-prevention
 * light (防犯灯) on a short arm over the kerb, lit after dark, as the Nanokamachi repaint hangs one on its pole.
 */
function poleExtras(b: CityMeshBuilder, x: number, side: PeriodSide, lamp: boolean): void {
  b.colour.set('#34343a');
  for (const [dx, y] of LOW_CABLES) b.box('metal', x + dx - .05, x + dx + .05, y - .06, y + .06, -.06, .06, 'b');
  if (!lamp) return;
  const end = x - side * .75;
  b.box('metal', Math.min(x, end), Math.max(x, end), 4.92, 4.98, -.03, .03, 'b');
  b.box('metal', end - .03, end + .03, 4.75, 4.98, -.03, .03, 'b');
  b.colour.setRGB(2, 1.85, 1.5); b.box('lamp', end - .2, end + .2, 4.62, 4.75, -.07, .07);
  b.beacon(end, 4.66, 0, 1.6, 1.45, 1.15, .3);
}
/**
 * A wire hung from a to b (chunk-local coordinates), sagging `sag` at its middle: eight straight segments for the
 * chunk's screen-space wire lines (wires.ts), which keep about an art pixel wide at every distance.
 */
function wire(b: CityMeshBuilder, a: Vec3, c: Vec3, sag: number): void {
  const segments = 8;
  const point = (t: number): Vec3 => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t];
  for (let i = 0; i < segments; i++) b.wires.push(...point(i / segments), ...point((i + 1) / segments));
}
/** Where a pole's wire point lies, in chunk-local coordinates (the builder's frame is left at that pole). */
const wireAnchor = new THREE.Vector3();
function wireEnd(b: CityMeshBuilder, layout: PeriodCityLayout, p: number, x: number, point: readonly [number, number]): Vec3 {
  routeFrame(b, layout, p);
  const at = b.world(wireAnchor.set(x + point[0], point[1], 0));
  return [at.x - b.originX, at.y, at.z - b.originZ];
}

/** A shopping-street lamp: two globes on a post and a cloth banner, printed both sides, stirring on its arms. */
function shoppingLamp(b: CityMeshBuilder, x: number, z: number, banner: number, phase: number): void {
  b.colour.set('#3a3a40'); b.cylinder('metal', x, 0, z, .07, 4.2, 8);
  b.box('metal', x - .55, x + .55, 3.95, 4.02, z - .04, z + .04, 'b');
  // Warm globes bright enough (HDR) for the glow stage's halo, and a far light each (the user's rain-night concept).
  b.colour.setRGB(2, 1.3, .55);
  for (const dx of [-.5, .5]) { b.cylinder('lamp', x + dx, 3.55, z, .2, .38, 10); b.beacon(x + dx, 3.74, z, 2.2, 1.25, .4, .4); }
  // Arms toward the road carry the banner across the drivers' view.
  const s = Math.sign(x), near = x - s * .08, far = x - s * .54;
  b.colour.set('#2a2a30');
  for (const y of [1.78, 3.42]) b.box('metal', Math.min(near, far), Math.max(near, far), y, y + .04, z - .02, z + .02, 'b');
  b.print = neonPrint('nobori', banner); b.colour.setRGB(phase, .5, s < 0 ? 1 : 0);
  b.front('flag', Math.min(near, far), Math.max(near, far), 1.8, 3.42, z, -1);
}

/** Fallen maple leaves, mostly crimson as the repaints strew them: crimson, scarlet, vermilion, orange and browned. Gold
 * leaves, a fifth of them, turned the lamp-lit night verges at Iimoriyama into a gold speckle (L .48 against .24), so
 * only the afternoon routes take them (`street.afternoonLeaves`). */
const LEAF_TONES = ['#a3261b', '#b42d1c', '#c23f1d', '#d9681f', '#7e351c'].map(tone => new THREE.Color(tone));
const GOLD_LEAF = new THREE.Color('#d9a133');
/** The leaves share the city's 'ground' material, whose forest-floor scan averages sRGB (107, 89, 68): dividing the
 * leaf colours by that mean (linear) keeps each leaf its own colour on average, with the scan's grain as its veins. */
const GROUND_SCAN_MEAN = new THREE.Color(.147, .100, .058);
/** A colour on the 'ground' material, compensated for the scan as the leaves are, and varied by `spread`. */
function groundTone(b: CityMeshBuilder, tone: THREE.Color, random: () => number, spread: number): void {
  b.colour.setRGB(tone.r / GROUND_SCAN_MEAN.r, tone.g / GROUND_SCAN_MEAN.g, tone.b / GROUND_SCAN_MEAN.b).multiplyScalar(1 - spread / 2 + random() * spread);
}
/** Open ground whose verge, level with the road, takes the leaves too (in towns the pavement stands above it). */
const VERGES: ReadonlySet<PeriodDistrict> = new Set(['forest', 'park', 'rural', 'temple', 'shrine', 'pond']);
/** Open ground the autumn wood, its shrubs and its grass may grow on. A temple or shrine precinct stands behind its wall
 * and a pond's water begins at its stone curb, so there only the grass verge before them takes leaves. */
const WOODED: ReadonlySet<PeriodDistrict> = new Set(['forest', 'park', 'rural']);
/** How far beyond the road edge the leaves may lie on a precinct's or pond's grass verge: short of its curb. */
const CURBED_VERGE = 3.3;
/** The road's shoulder strip runs this far past the asphalt at the road's own level (world.ts); the hillside beyond. */
const SHOULDER = 1.6;
/**
 * The ground under a route-frame point, as a height in the frame (0 at the road), or null where there is none. On the
 * climbs the hillside falls or rises away from the shoulder, so verge planting stands on it rather than floating at
 * the road's level. Near the road, more than `limit` metres of drop or rise belongs to another leg's cut or bank, and
 * nothing is planted; the wood's far rows, already kept short of other legs by their reach, climb the slope further.
 */
function verge(b: CityMeshBuilder, layout: PeriodCityLayout, roadY: number, x: number, z: number, limit = 6,
  groundHeightAt = layout.vegetationGroundHeightAt): number | null {
  const at = b.world(new THREE.Vector3(x, 0, z)), h = groundHeightAt(at.x, at.z);
  // A newly admitted hillside must not plant through a reserved landmark or a neighbouring building.
  if (h !== null && groundHeightAt !== layout.groundHeightAt && layout.groundHeightAt(at.x, at.z) === null
    && !periodCityPlantingClear(layout, at.x, at.z, 3)) return null;
  return h === null || !Number.isFinite(h) || Math.abs(h - roadY) > limit ? null : h - roadY;
}
/** One fallen leaf about a hand across, a broad diamond (one quad: the city's faces are stored unindexed, so a leaf
 * costs 6 vertices) at a random turn, lying `y` above the route frame's road. Leaves twice as long read as confetti
 * beside the repaints' maple leaves. */
function leaf(b: CityMeshBuilder, random: () => number, x: number, y: number, z: number, gold = 0): void {
  const size = .09 + random() * .08, turn = random() * Math.PI, c = Math.cos(turn) * size, s = Math.sin(turn) * size, pick = random();
  groundTone(b, pick < gold ? GOLD_LEAF : LEAF_TONES[Math.min(LEAF_TONES.length - 1, Math.floor((pick - gold) / (1 - gold) * LEAF_TONES.length))]!, random, .35);
  b.face('ground', [[x - c, y, z - s], [x + s * .65, y, z - c * .65], [x + c, y, z + s], [x - s * .65, y, z + c * .65]], [0, 1, 0]);
}
/** Autumn undergrowth: azalea and maple scrub turned crimson, orange and gold, russet bracken, and a few evergreens. */
const SHRUB_TONES = ['#8f2a1a', '#b5461c', '#cf7a22', '#b8902c', '#6e4122', '#2d4a2c'].map(tone => new THREE.Color(tone));
/**
 * One shrub: a mound of small tilted leaf plates, `radius` across and `height` tall, each plate a little lighter or
 * darker than the shrub's own tone and turned its own way, so the art cells catch a speckled, lit-and-shaded mass as the
 * repaints paint undergrowth. Solid six-sided mounds read as faceted gems. About thirty triangles.
 */
function shrub(b: CityMeshBuilder, random: () => number, x: number, y: number, z: number, radius: number, height: number): void {
  const tone = SHRUB_TONES[Math.floor(random() * SHRUB_TONES.length)]!, normal = new THREE.Vector3(), across = new THREE.Vector3(), along = new THREE.Vector3();
  for (let n = 0; n < 14; n++) {
    // A point in the mound's upper half-ellipsoid, denser toward its middle; plates face mostly up and out.
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * radius, lift = random() * (1 - (r / radius) ** 2) ** .5 * height;
    const cx = x + Math.cos(a) * r, cy = y + lift, cz = z + Math.sin(a) * r, size = .16 + random() * .14;
    normal.set(Math.cos(a) * (.4 + random()), 1.1 + random(), Math.sin(a) * (.4 + random())).normalize();
    across.set(-normal.z, 0, normal.x).normalize(); along.crossVectors(normal, across);
    const turn = random() * Math.PI, u = across.clone().multiplyScalar(Math.cos(turn) * size).addScaledVector(along, Math.sin(turn) * size);
    const v = across.clone().multiplyScalar(-Math.sin(turn) * size * .7).addScaledVector(along, Math.cos(turn) * size * .7);
    groundTone(b, tone, random, .55);
    b.face('ground', [[cx - u.x, cy - u.y, cz - u.z], [cx - v.x, cy - v.y, cz - v.z], [cx + u.x, cy + u.y, cz + u.z], [cx + v.x, cy + v.y, cz + v.z]],
      [normal.x, normal.y, normal.z]);
  }
}
/** How high the hillside stands (m above the road) six metres beyond the road's edge on one side, or null. */
function bankAt(layout: PeriodCityLayout, p: number, side: PeriodSide): number | null {
  const pose = poseAt(layout.course, p), lateral = side * (pose.width + 6);
  const h = layout.groundHeightAt(pose.x + Math.cos(pose.heading) * lateral, pose.z - Math.sin(pose.heading) * lateral);
  return h === null || !Number.isFinite(h) ? null : h - pose.y;
}
/** A retaining wall's height at a station: where the hillside stands more than 2.5 m over the road six metres out, the
 * road is cut into it and a wall holds the cut, as tall as the bank there. A lower bank stays a grassy, leaf-strewn slope,
 * as the repaints draw it at Umagaeshi. */
function wallHeight(layout: PeriodCityLayout, p: number, side: PeriodSide): number {
  const bank = bankAt(layout, p, side);
  return bank === null || bank < 2.5 ? 0 : Math.min(7, bank + .2);
}
/** The wall's footprint: its foot just beyond the shoulder strip, leaning back three in ten (間知石 masonry's batter). */
const WALL_FOOT = 1.75, WALL_BATTER = .3;
const STONE = new THREE.Color('#8e8a82'), COPING = new THREE.Color('#aaa69c');
/**
 * Retaining walls (擁壁) where a mountain road is cut into the hillside: battered masonry from the gutter to the slope,
 * capped with a concrete coping, as the uphill side of every hairpin is walled in the Irohazaka and Nara repaints. Built
 * in the chunk's own frame from the route's stations, so neighbouring metres (and chunks) meet edge to edge.
 */
function retainingWalls(b: CityMeshBuilder, layout: PeriodCityLayout, from: number, to: number): void {
  const ranges = layout.street.litter;
  if (!ranges?.length) return;
  const point = (p: number, lateral: number, up: number): Vec3 => {
    const pose = poseAt(layout.course, p);
    return [pose.x + Math.cos(pose.heading) * lateral - b.originX, pose.y + up, pose.z - Math.sin(pose.heading) * lateral - b.originZ];
  };
  b.frame(b.originX, 0, b.originZ, 0);
  for (let k = Math.ceil(from); k < to; k++) {
    if (!inCourse(layout, k) || !inCourse(layout, k + 1) || !ranges.some(([start, end]) => k >= start && k < end)) continue;
    for (const side of [-1, 1] as PeriodSide[]) {
      if (!VERGES.has(layout.districtAt(k, side))) continue;
      const h0 = wallHeight(layout, k, side), h1 = wallHeight(layout, k + 1, side);
      if (!h0 && !h1) continue;
      const w0 = poseAt(layout.course, k).width, w1 = poseAt(layout.course, k + 1).width;
      const top0 = Math.max(h0, .4), top1 = Math.max(h1, .4);
      const foot0 = point(k, side * (w0 + WALL_FOOT), -.15), foot1 = point(k + 1, side * (w1 + WALL_FOOT), -.15);
      const head0 = point(k, side * (w0 + WALL_FOOT + WALL_BATTER * top0), top0), head1 = point(k + 1, side * (w1 + WALL_FOOT + WALL_BATTER * top1), top1);
      const heading = poseAt(layout.course, k + .5).heading, inward: Vec3 = [-side * Math.cos(heading), WALL_BATTER, side * Math.sin(heading)];
      b.colour.copy(STONE).multiplyScalar(.9 + ((k * 7919) % 13) / 13 * .16);
      b.face('stone', [foot0, foot1, head1, head0], inward);
      // The coping: a concrete cap along the wall's head, its face catching the light as a crisp line.
      const capTop0 = point(k, side * (w0 + WALL_FOOT + WALL_BATTER * top0), top0 + .18), capTop1 = point(k + 1, side * (w1 + WALL_FOOT + WALL_BATTER * top1), top1 + .18);
      const capBack0 = point(k, side * (w0 + WALL_FOOT + WALL_BATTER * top0 + .4), top0 + .18), capBack1 = point(k + 1, side * (w1 + WALL_FOOT + WALL_BATTER * top1 + .4), top1 + .18);
      b.colour.copy(COPING);
      b.face('wall', [head0, head1, capTop1, capTop0], [inward[0], 0, inward[2]]);
      b.face('wall', [capTop0, capTop1, capBack1, capBack0], [0, 1, 0]);
    }
  }
}
/** The outward extent (m beyond the road edge) a retaining wall occupies at a station and side, or 0 where there is none. */
function wallExtent(layout: PeriodCityLayout, p: number, side: PeriodSide): number {
  const h = wallHeight(layout, Math.floor(p), side);
  return h ? WALL_FOOT + WALL_BATTER * h + .6 : 0;
}
/** Where the hillside falls away beside a mountain road (more than 0.4 m below it six metres out), a low parapet. */
function parapetAt(layout: PeriodCityLayout, p: number, side: PeriodSide): boolean {
  const bank = bankAt(layout, p, side);
  return bank !== null && bank < -.4 && !wallHeight(layout, p, side);
}
/**
 * Stone parapets (石積みの擁壁笠) along the downhill side of a mountain road: a low wall of dressed stone a metre high and
 * half a metre thick behind the guard rail, its concrete coping a pale line, its outer face falling to the slope below,
 * as the Irohazaka repaints draw the valley side of every bend, with the view open over it. Built station by station in
 * the chunk's frame, like the retaining walls, so they meet edge to edge.
 */
function parapets(b: CityMeshBuilder, layout: PeriodCityLayout, from: number, to: number): void {
  const ranges = layout.street.litter;
  if (!ranges?.length) return;
  const point = (p: number, lateral: number, up: number): Vec3 => {
    const pose = poseAt(layout.course, p);
    return [pose.x + Math.cos(pose.heading) * lateral - b.originX, pose.y + up, pose.z - Math.sin(pose.heading) * lateral - b.originZ];
  };
  b.frame(b.originX, 0, b.originZ, 0);
  for (let k = Math.ceil(from); k < to; k++) {
    if (!inCourse(layout, k) || !inCourse(layout, k + 1) || !ranges.some(([start, end]) => k >= start && k < end)) continue;
    for (const side of [-1, 1] as PeriodSide[]) {
      if (!VERGES.has(layout.districtAt(k, side)) || !parapetAt(layout, k, side) || !parapetAt(layout, k + 1, side)) continue;
      const w0 = poseAt(layout.course, k).width, w1 = poseAt(layout.course, k + 1).width, heading = poseAt(layout.course, k + .5).heading;
      const out: Vec3 = [side * Math.cos(heading), 0, -side * Math.sin(heading)], back: Vec3 = [-out[0], 0, -out[2]];
      const inner0 = side * (w0 + WALL_FOOT), inner1 = side * (w1 + WALL_FOOT), outer0 = side * (w0 + WALL_FOOT + .5), outer1 = side * (w1 + WALL_FOOT + .5);
      // Inner face toward the road, the coping on top, the outer face down past the slope's edge.
      b.colour.copy(STONE).multiplyScalar(.88 + ((k * 7919) % 13) / 13 * .16);
      b.face('stone', [point(k, inner0, -.1), point(k + 1, inner1, -.1), point(k + 1, inner1, .95), point(k, inner0, .95)], back);
      b.face('stone', [point(k, outer0, -2.2), point(k + 1, outer1, -2.2), point(k + 1, outer1, .95), point(k, outer0, .95)], out);
      b.colour.copy(COPING);
      b.face('wall', [point(k, inner0 - side * .04, .95), point(k + 1, inner1 - side * .04, .95), point(k + 1, inner1 - side * .04, 1.1), point(k, inner0 - side * .04, 1.1)], back);
      b.face('wall', [point(k, inner0 - side * .04, 1.1), point(k + 1, inner1 - side * .04, 1.1), point(k + 1, outer1 + side * .04, 1.1), point(k, outer0 + side * .04, 1.1)], [0, 1, 0]);
    }
  }
}

/** Curve mirrors (カーブミラー): an orange pole and a round convex mirror at the outside of every hairpin. */
const MIRROR = { orange: new THREE.Color('#e0601c'), glass: new THREE.Color('#c4ccd4') };
function curveMirror(b: CityMeshBuilder, x: number, side: PeriodSide): void {
  b.colour.copy(MIRROR.orange);
  b.box('metal', x - .04, x + .04, 0, 2.95, -.04, .04, 'b');
  // The mirror faces back down the road and a little across it, toward the drivers coming into the bend.
  const facing = new THREE.Vector3(-side * .55, -.08, -1).normalize(), right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), facing).normalize();
  const up = new THREE.Vector3().crossVectors(facing, right), centre = new THREE.Vector3(x, 2.72, 0), segments = 14, radius = .42;
  const ring = (r: number, along: number) => Array.from({ length: segments }, (_, i) => {
    const a = i / segments * Math.PI * 2;
    return centre.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).addScaledVector(facing, along);
  });
  const front = ring(radius * .9, .05), rim = ring(radius, .06), back = ring(radius, -.05), v = (p: THREE.Vector3): Vec3 => [p.x, p.y, p.z];
  const centreFront = centre.clone().addScaledVector(facing, .07);
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments, a = (i + .5) / segments * Math.PI * 2;
    const out = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    b.colour.copy(MIRROR.glass);
    b.face('metal', [v(centreFront), v(front[i]!), v(front[j]!)], [facing.x, facing.y, facing.z]);
    b.colour.copy(MIRROR.orange);
    b.face('metal', [v(front[i]!), v(rim[i]!), v(rim[j]!), v(front[j]!)], [facing.x * .5 + out.x * .5, facing.y * .5 + out.y * .5, facing.z * .5 + out.z * .5]);
    b.face('metal', [v(rim[i]!), v(back[i]!), v(back[j]!), v(rim[j]!)], [out.x, out.y, out.z]);
    b.face('metal', [v(centre), v(back[j]!), v(back[i]!)], [-facing.x, -facing.y, -facing.z]);
  }
}
/** Hairpins on the autumn mountain roads: where the road turns through more than 70 degrees within 30 m, at the turn's peak. */
function hairpinTurn(layout: PeriodCityLayout, p: number): number {
  const before = poseAt(layout.course, p - 15).heading, after = poseAt(layout.course, p + 15).heading;
  return Math.atan2(Math.sin(after - before), Math.cos(after - before));
}

/** Maple crowns, one picked per tree (linear tints over the near-white leaf atlas, at the hues of the repaints' crowns):
 * crimson, vermilion, orange, gold, a deep crimson, and now and then one still green. */
const MAPLE_TINTS = [[.95, .052, .04], [.92, .15, .03], [.92, .3, .05], [.88, .47, .09], [.55, .04, .03], [.26, .36, .12]] as const;
const MAPLE_ODDS = [.38, .2, .12, .07, .17, .06];
/** Sugi: a dark, cool green, the repaints' near-black conifers among the maples. */
const CEDAR_TINT = [.05, .1, .06] as const;
function mapleTint(random: () => number): readonly [number, number, number] {
  let roll = random();
  for (let i = 0; i < MAPLE_ODDS.length; i++) if ((roll -= MAPLE_ODDS[i]!) < 0) return MAPLE_TINTS[i]!;
  return MAPLE_TINTS[0]!;
}
/** Rows of the autumn wood behind the verge: nearest and farthest offsets beyond the road edge (m), a tree every so many metres. */
const WOOD_ROWS = [[4.5, 10, 5, 0], [10, 20, 5, 2], [20, 34, 6, 4], [34, 56, 7, 1]] as const;
/**
 * Fallen maple leaves (紅葉の落ち葉) along a route's autumn stretches (`street.litter`): drifts in the gutters, a scatter
 * across the carriageway and the open verges carpeted, as every autumn cutscene (iroha-wide, nara-detail) and every
 * cutscene-style repaint of these routes paints the ground. Behind the verge stands the autumn wood, three rows of
 * modelled maples (flora.ts) with sugi among them on the mountain roads (`street.cedars`), susuki and turned shrubs at
 * its edge. One draw stream per metre, so chunks never disagree.
 */
function leafLitter(b: CityMeshBuilder, layout: PeriodCityLayout, from: number, to: number): void {
  const ranges = layout.street.litter, cedars = layout.street.cedars, afternoon = layout.street.afternoonLeaves;
  if (!ranges?.length) return;
  const within = (list: readonly (readonly [number, number])[] | undefined, k: number) => !!list?.some(([start, end]) => k >= start && k < end);
  for (let k = Math.ceil(from); k < to; k++) {
    if (!inCourse(layout, k) || !within(ranges, k)) continue;
    const random = seeded(hashInts(k, 1031)), w = routeFrame(b, layout, k), roadY = poseAt(layout.course, k).y, sugi = within(cedars, k);
    const late = !afternoon || k >= (afternoon.until ?? Infinity), gold = late ? 0 : afternoon.gold, extra = late ? 0 : afternoon.drifts;
    for (const side of [-1, 1] as PeriodSide[]) {
      const district = layout.districtAt(k, side), open = VERGES.has(district), wooded = WOODED.has(district);
      const reach = open ? Math.min(periodCityReach(layout, k, side, 58), wooded ? 58 : CURBED_VERGE) : 0, wall = open ? wallExtent(layout, k, side) : 0;
      // Drifts piled against the kerb, thinning out into the lane; on the afternoon routes thicker, from their own stream.
      for (let n = 0; n < 10; n++) leaf(b, random, side * (w - .2 - random() * random() * 1.6 + random() * .5), .02, random() - .5, gold);
      const drift = seeded(hashInts(k, side, 1986, 47));
      for (let n = 0; n < extra; n++) leaf(b, drift, side * (w - .15 - drift() * drift() * 1.3 + drift() * .4), .021, drift() - .5, gold);
      if (!open) continue;
      // Beyond a retaining wall the verge planting starts at its top, on the hillside above.
      const clear = (off: number) => off > wall;
      for (let n = 0; n < 7; n++) {
        const off = .6 + random() * Math.min(4.4, reach), x = side * (w + off), z = random() - .5;
        const y = off < SHOULDER ? .03 : verge(b, layout, roadY, x, z);
        if (y !== null && (off < SHOULDER || clear(off))) leaf(b, random, x, y + .03, z, gold);
      }
      if (!wooded) continue;
      // Turned shrubs every other metre, beyond the guard rail and short of any other leg of the road.
      if (k % 2 === 0 && reach > 2) for (let n = 0; n < 2; n++) {
        if (random() < .45) continue;
        const off = SHOULDER + .2 + random() * Math.min(5, reach - 1), x = side * (w + off), z = random() * 2 - 1;
        const y = verge(b, layout, roadY, x, z), radius = .35 + random() * .45;
        if (y !== null && clear(off - radius)) shrub(b, random, x, y, z, radius, radius * (.9 + random() * .6));
      }
      // Low grass tufts carpet the bank beyond the shoulder, thickest near the road (the repaints' golden banks). Their own
      // stream, so the planting after them is unchanged.
      const tufts = seeded(hashInts(k, side, 1986, 43));
      if (reach > SHOULDER + 1) for (let n = 0; n < 5; n++) {
        const off = SHOULDER + .3 + tufts() * tufts() * Math.min(12, reach - .5), x = side * (w + off), z = tufts() - .5, y = verge(b, layout, roadY, x, z);
        const shade = .8 + tufts() * .3;
        if (y !== null && clear(off - .3)) b.plant(FLORA_KIND.grass, x, y, z, tufts() * Math.PI * 2, .7 + tufts() * .6, shade, shade * .97, shade * .9, Math.floor(tufts() * 1000));
      }
      // Susuki at the wood's edge.
      if (k % 2 === 1 && reach > 3 && random() < .5) {
        const off = SHOULDER + .5 + random() * Math.min(3.5, reach - 2), x = side * (w + off), z = random() * 2 - 1, y = verge(b, layout, roadY, x, z);
        const shade = .85 + random() * .2;
        if (y !== null && clear(off - .6)) b.plant(FLORA_KIND.susuki, x, y, z, random() * Math.PI * 2, .75 + random() * .45, shade, shade, shade, Math.floor(random() * 1000));
      }
      // The autumn wood; on the valley side (a parapet) only a thin near row, so the view over the valley stays open. A
      // forest bank's verge (`street.forestBanks`) keeps to its understory: the race's own forest stands on the bank.
      const valley = parapetAt(layout, k, side);
      if (!(layout.street.forestBanks && district === 'forest')) for (const [near, far, every, salt] of WOOD_ROWS) {
        if ((k + salt + (side > 0 ? 2 : 0)) % every !== 0 || reach < near + 1) continue;
        if (valley && (near > 5 || random() < .5)) continue;
        const off = near + random() * (Math.min(far, reach - 1) - near), x = side * (w + off), z = random() * 3 - 1.5;
        // The race already supplies its hillside forest. New slope sampling fills only the understory; adding these
        // tree rows there too closes the open valley views. Keep every existing modelled tree on its original ground.
        const y = verge(b, layout, roadY, x, z, near > 15 ? 30 : 6, layout.groundHeightAt);
        if (y === null || !clear(off - 1)) continue;
        const seed = Math.floor(random() * 10000);
        if (sugi && random() < (near > 15 ? .5 : .25)) b.plant(FLORA_KIND.cedar, x, y, z, random() * Math.PI * 2, .7 + random() * .45, ...CEDAR_TINT, seed);
        else b.plant(FLORA_KIND.maple, x, y, z, random() * Math.PI * 2, .7 + random() * .5, ...mapleTint(random), seed);
      }
    }
    for (let n = 5 + Math.floor(random() * 3); n > 0; n--) {
      const across = random() * 2 - 1, edgeward = Math.sign(across) * Math.sqrt(Math.abs(across));
      leaf(b, random, edgeward * (w - .6), .02, random() - .5, gold);
    }
  }
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
  // Utility poles, and the wires from each to the next pole on its side (and, from some, across the road to the
  // other side's next pole): hung in this chunk even where they reach into the next.
  for (let k = Math.ceil(from / STATION); k * STATION < to; k++) for (const side of [-1, 1] as PeriodSide[]) {
    if (!poleAt(layout, k, side)) continue;
    const p = k * STATION, roll = (hashInts(k, side, 53) >>> 0) / 4294967296, w = routeFrame(b, layout, p), x = side * (w + POLE_KERB);
    utilityPole(b, x, side, roll);
    const town = !!layout.street.autumn;
    if (town) poleExtras(b, x, side, (hashInts(k, side, 59) >>> 0) % 100 < 35);
    const lines: [Vec3, Vec3, number][] = [];
    const next = k + POLE_STATIONS;
    if (poleAt(layout, next, side)) {
      const wn = poseAt(layout.course, next * STATION).width;
      for (const point of town ? [...WIRE_POINTS, ...LOW_CABLES] : WIRE_POINTS) {
        const a = wireEnd(b, layout, p, x, point), c = wireEnd(b, layout, next * STATION, side * (wn + POLE_KERB), point);
        lines.push([a, c, point[1] < 6 ? 1.1 : point[1] < 8 ? .9 : .55]);
      }
    }
    const across = k + POLE_STATIONS / 2;
    if (side > 0 && roll > .45 && poleAt(layout, across, -1)) {
      const wa = poseAt(layout.course, across * STATION).width;
      lines.push([wireEnd(b, layout, p, x, WIRE_POINTS[1]!), wireEnd(b, layout, across * STATION, -(wa + POLE_KERB), WIRE_POINTS[1]!), .7]);
    }
    b.frame(b.originX, 0, b.originZ, 0);
    for (const [a, c, sag] of lines) wire(b, a, c, sag);
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
  for (const a of layout.street.arches ?? []) if (a.p >= from && a.p < to && inCourse(layout, a.p)) {
    const w = routeFrame(b, layout, a.p); heianTorii(b, w);
  }
  for (const m of layout.street.markers ?? []) if (m.p >= from && m.p < to && inCourse(layout, m.p)) {
    const w = routeFrame(b, layout, m.p); curveBoard(b, m.side * (w + .9), IROHA.indexOf(m.text));
  }
  leafLitter(b, layout, from, to);
  for (let k = Math.ceil(from / 5) * 5; k < to; k += 5) {
    if (!inCourse(layout, k) || !layout.street.litter?.some(([start, end]) => k >= start && k < end)) continue;
    const turn = hairpinTurn(layout, k);
    if (Math.abs(turn) < 1.2 || Math.abs(hairpinTurn(layout, k - 5)) > Math.abs(turn) || Math.abs(hairpinTurn(layout, k + 5)) >= Math.abs(turn)) continue;
    const side: PeriodSide = turn > 0 ? -1 : 1, w = routeFrame(b, layout, k);
    // In front of any retaining wall's foot, just behind the guard rail.
    curveMirror(b, side * (w + 1.3), side);
  }
  retainingWalls(b, layout, from, to);
  parapets(b, layout, from, to);
  b.frame(0, 0, 0, 0);
}

/** A curve board on its post at the road edge, facing the approaching traffic. */
function curveBoard(b: CityMeshBuilder, x: number, kana: number): void {
  if (kana < 0) return;
  b.colour.set('#8e9396'); b.box('metal', x - .05, x + .05, 0, 1.75, -.05, .05, 'b');
  b.colour.set('#3a3d42'); b.box('metal', x - .44, x + .44, 1.35, 2.23, .02, .1, 'b');
  b.print = signPrint('kana', kana); b.colour.set('#ffffff'); b.front('sign', x - .4, x + .4, 1.39, 2.19, 0);
}

/**
 * Heian Jingū's great torii (1929) across Jingū-michi: vermilion concrete
 * pillars 24.4 m high on black bases, a black kasagi lintel 33.9 m long with
 * upswept ends, the nuki tie beam and the central plaque.
 */
function heianTorii(b: CityMeshBuilder, w: number): void {
  const vermilion = '#c8402e', black = '#262022', x = w + 4.4, top = 24.4;
  for (const side of [-1, 1]) {
    b.colour.set(black); b.cylinder('stone', side * x, 0, 0, 2.3, 2.2, 14);
    b.colour.set(vermilion); b.cylinder('floodlit', side * x, 2.2, 0, 1.8, top - 4.2, 14);
  }
  b.colour.set(vermilion);
  b.box('floodlit', -x - 3.4, x + 3.4, 17.2, 18.8, -.9, .9, '');
  b.box('floodlit', -x - .6, x + .6, top - 2.3, top - 1.2, -1.2, 1.2, '');
  b.colour.set(black);
  b.box('wall', -x - 1, x + 1, top - 1.2, top, -1.5, 1.5, '');
  // The kasagi's ends sweep up past the pillars.
  for (const side of [-1, 1]) {
    const x0 = side * (x + 1), x1 = side * (x + 6.6);
    b.face('wall', [[x0, top, -1.5], [x1, top + 1.1, -1.5], [x1, top + 1.1, 1.5], [x0, top, 1.5]], [0, 1, 0]);
    b.face('wall', [[x0, top - 1.2, -1.5], [x1, top - .3, -1.5], [x1, top + 1.1, -1.5], [x0, top, -1.5]], [0, 0, -1]);
    b.face('wall', [[x0, top - 1.2, 1.5], [x1, top - .3, 1.5], [x1, top + 1.1, 1.5], [x0, top, 1.5]], [0, 0, 1]);
    b.face('wall', [[x0, top - 1.2, -1.5], [x1, top - .3, -1.5], [x1, top - .3, 1.5], [x0, top - 1.2, 1.5]], [0, -1, 0]);
  }
  b.colour.set('#2e2a30'); b.box('wall', -1.6, 1.6, 18.8, top - 2.3, -.5, .5, '');
  b.colour.set('#d6a646'); b.front('metal', -1.2, 1.2, 19.4, top - 2.9, -.52);
}
