import * as THREE from 'three';
import { WINDOW_KIND, type CityMeshBuilder, type CityMaterialKey, type Vec3 } from './geometry';
import { MOAT, RIVER, hashInts, moatWidth, periodCityReach, poseAt, seeded, landmarkFootprint,
  type PeriodCityLayout, type PeriodCrossing, type PeriodLandmark, type PeriodOpenRun } from './layout';
import { SORA_BOARDS, signIndex, signPrint } from './signs';
import { buildLandmark, isBuildingLandmark } from './landmarks';
import { FLORA_KIND } from './flora';

/**
 * The palace side of the route: Uchibori's moats (a grass bank, dark water,
 * the battered stone wall 石垣 with white plaster walls and a turret), the
 * Kitanomaru park lawns and the Yasukuni shrine front with its great torii.
 * Strips follow the route, drawn perpendicular to it in world space.
 */
export const STEP = 4;
export const SIDEWALK = 1.67;

/** A world-space quad wound to face `hint`, with its true normal. */
export function quad(b: CityMeshBuilder, key: CityMaterialKey, a: Vec3, c: Vec3, d: Vec3, e: Vec3, hint: Vec3): void {
  const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = e[0] - a[0], vy = e[1] - a[1], vz = e[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length; ny /= length; nz /= length;
  if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
  b.face(key, [a, c, d, e], [nx, ny, nz]);
}

export interface Section { readonly p: number; readonly x: number; readonly y: number; readonly z: number; readonly cx: number; readonly cz: number; readonly width: number; readonly reach: number }
export function sections(layout: PeriodCityLayout, run: PeriodOpenRun, from: number, to: number, max: number): Section[] {
  const list: Section[] = [];
  for (let p = from; ; p = Math.min(to, p + STEP)) {
    const at = poseAt(layout.course, p);
    list.push({ p, x: at.x, y: at.y, z: at.z, cx: Math.cos(at.heading) * run.side, cz: -Math.sin(at.heading) * run.side,
      width: at.width, reach: periodCityReach(layout, p, run.side, max) });
    if (p >= to) break;
  }
  return list;
}
/** A point `e` metres beyond the road edge, `dy` above the road. */
export const at = (s: Section, e: number, dy: number): Vec3 => [s.x + s.cx * (s.width + e), s.y + dy, s.z + s.cz * (s.width + e)];
export const UP: Vec3 = [0, 1, 0];
const toRoad = (s: Section): Vec3 => [-s.cx, 0, -s.cz];
const away = (s: Section): Vec3 => [s.cx, 0, s.cz];
/** A strip between two sections from (e0, y0) to (e1, y1). */
export function strip(b: CityMeshBuilder, key: CityMaterialKey, s0: Section, s1: Section, e0: (s: Section) => number, y0: number,
  e1: (s: Section) => number, y1: number, hint: (s: Section) => Vec3): void {
  quad(b, key, at(s0, e0(s0), y0), at(s1, e0(s1), y0), at(s1, e1(s1), y1), at(s0, e1(s0), y1), hint(s0));
}

/** The moat cross-section clipped to the clear reach beside the road. */
function profile(s: Section): { water: number; wall: number; top: number } {
  let water = moatWidth(s.p), platform: number = MOAT.platform;
  const room = s.reach - 4 - (MOAT.water + MOAT.batter);
  if (water + platform > room) { platform = Math.max(4, room - water); water = Math.max(6, Math.min(water, room - platform)); }
  const wall = MOAT.water + water;
  return { water, wall, top: wall + MOAT.batter + platform };
}

function moat(b: CityMeshBuilder, layout: PeriodCityLayout, run: PeriodOpenRun, from: number, to: number): void {
  const list = sections(layout, run, from, to, MOAT.water + 48 + MOAT.batter + MOAT.platform + 4);
  const grass = new THREE.Color('#5d6b45'), bank = new THREE.Color('#4f5e3c'), curb = new THREE.Color('#9a958a');
  const stone = new THREE.Color('#a19a8c'), plaster = new THREE.Color('#ebe5d6'), tile = new THREE.Color('#3e4248');
  for (let i = 0; i < list.length - 1; i++) {
    const s0 = list[i]!, s1 = list[i + 1]!;
    if (profile(s0).wall < MOAT.water + 4) continue;
    const across = causeway(layout, run.side, (s0.p + s1.p) / 2);
    if (across) {
      // An earth causeway (土橋) to a palace gate: gravel at road level, dressed-stone sides.
      b.colour.set('#a39e8e'); strip(b, 'ground', s0, s1, () => SIDEWALK, -.05, s => profile(s).wall + MOAT.batter * .5, -.05, () => UP);
      for (const [s, other] of [[s0, list[i - 1]], [s1, list[i + 2]]] as const) {
        if (other && causeway(layout, run.side, (s.p + other.p) / 2)) continue;
        const forward = s === s0 ? -1 : 1, hint: Vec3 = [-s.cz * forward * run.side, 0, s.cx * forward * run.side];
        b.colour.copy(stone);
        quad(b, 'stone', at(s, MOAT.bank, -.05), at(s, profile(s).wall, -.05), at(s, profile(s).wall, MOAT.level - .3), at(s, MOAT.bank, MOAT.level - .3), hint);
      }
      continue;
    }
    b.colour.copy(grass);
    strip(b, 'ground', s0, s1, () => SIDEWALK, -.05, () => MOAT.curb, -.05, () => UP);
    // A low dressed-stone curb with a pipe rail along the moat edge.
    b.colour.copy(curb);
    strip(b, 'stone', s0, s1, () => MOAT.curb, -.1, () => MOAT.curb, .5, toRoad);
    strip(b, 'stone', s0, s1, () => MOAT.curb, .5, () => MOAT.curb + .3, .5, () => UP);
    strip(b, 'stone', s0, s1, () => MOAT.curb + .3, .5, () => MOAT.curb + .3, -.1, away);
    b.colour.set('#3a3a3e');
    strip(b, 'metal', s0, s1, () => MOAT.curb + .15, .98, () => MOAT.curb + .15, 1.04, toRoad);
    const post = at(s0, MOAT.curb + .15, 0);
    b.frame(post[0], post[1] + .5, post[2], Math.atan2(s0.cx, s0.cz));
    b.box('metal', -.04, .04, 0, .52, -.04, .04, 'b');
    b.frame(0, 0, 0, 0);
    b.colour.copy(grass);
    strip(b, 'ground', s0, s1, () => MOAT.curb + .3, -.05, () => MOAT.bank, -.05, () => UP);
    b.colour.copy(bank);
    strip(b, 'ground', s0, s1, () => MOAT.bank, -.05, () => MOAT.water, MOAT.level, () => UP);
    b.colour.set('#ffffff');
    strip(b, 'water', s0, s1, () => MOAT.water, MOAT.level, s => profile(s).wall, MOAT.level, () => UP);
    // The far wall: battered dressed stone rising out of the water.
    b.colour.copy(stone);
    strip(b, 'stone', s0, s1, s => profile(s).wall, MOAT.level - .2, s => profile(s).wall + MOAT.batter, MOAT.top, toRoad);
    b.colour.copy(grass);
    strip(b, 'ground', s0, s1, s => profile(s).wall + MOAT.batter, MOAT.top, s => profile(s).top, MOAT.top, () => UP);
    b.colour.copy(shade(stone, .7));
    strip(b, 'stone', s0, s1, s => profile(s).top, MOAT.top, s => profile(s).top, -.3, away);
    // Black pines (黒松) along the top of a castle moat's wall, leaning out over the water (the autumn routes' Tsuruga-jō
    // and Nijō-jō; flora.ts), one every eight to twelve metres.
    if (layout.street.autumn) {
      const station = Math.round(s0.p / STEP), pines = seeded(hashInts(station, run.side, 61));
      if (station % 3 === 0 && pines() < .8) {
        const base = at(s0, profile(s0).wall + MOAT.batter + 1 + pines() * 3, MOAT.top);
        b.frame(base[0], base[1], base[2], Math.atan2(s0.cx, s0.cz));
        // Local -Z faces the road (the lot frame's convention), so a pine leans toward the water at a yaw near pi.
        b.plant(FLORA_KIND.pine, 0, 0, 0, Math.PI + (pines() - .5) * 1.2, .8 + pines() * .45, .1, .2, .09, Math.floor(pines() * 1000));
        b.frame(0, 0, 0, 0);
      }
    }
    // White plaster walls (塀) with a tiled cap along some stretches.
    const random = seeded(hashInts(Math.floor(s0.p / 120), run.side, 77));
    if (random() < .45) {
      const e = (s: Section) => profile(s).wall + MOAT.batter + 1.2;
      b.colour.copy(shade(stone, .85)); strip(b, 'stone', s0, s1, e, MOAT.top, e, MOAT.top + .5, toRoad);
      b.colour.copy(plaster); strip(b, 'wall', s0, s1, e, MOAT.top + .5, e, MOAT.top + 2.1, toRoad);
      b.colour.copy(tile);
      strip(b, 'roof', s0, s1, s => e(s) - .45, MOAT.top + 2.05, s => e(s) + .25, MOAT.top + 2.45, s => [-s.cx * .7, .7, -s.cz * .7]);
      strip(b, 'roof', s0, s1, s => e(s) + .25, MOAT.top + 2.45, s => e(s) + .9, MOAT.top + 2.05, s => [s.cx * .7, .7, s.cz * .7]);
    }
  }
  // Earth causeways close the basin where the moat run starts and ends.
  for (const [s, forward] of [[list[0]!, 1], [list.at(-1)!, -1]] as const) {
    if (s.p !== run.start && s.p !== run.end) continue;
    const { wall, top } = profile(s), hx = -s.cz * forward, hz = s.cx * forward;
    b.colour.copy(stone);
    quad(b, 'stone', at(s, MOAT.bank, -.05), at(s, wall + MOAT.batter, -.05), at(s, wall + MOAT.batter, MOAT.level - .3), at(s, MOAT.bank, MOAT.level - .3), [hx * run.side, 0, hz * run.side]);
    quad(b, 'stone', at(s, wall, -.05), at(s, top, -.05), at(s, top, MOAT.top), at(s, wall, MOAT.top), [hx * run.side, 0, hz * run.side]);
    b.colour.copy(grass);
    // Grass over the causeway covers the ground cut's ragged edge outside the run.
    const outside = { ...s, x: s.x - hx * 6 * run.side, z: s.z - hz * 6 * run.side };
    quad(b, 'ground', at(s, MOAT.bank, -.04), at(s, wall + MOAT.batter, -.04), at(outside, wall + MOAT.batter, -.04), at(outside, MOAT.bank, -.04), UP);
  }
  // A white two-storey turret (櫓) over the water at the middle of a long run.
  const middle = (run.start + run.end) / 2;
  if (run.end - run.start > 380 && middle >= from && middle < to) {
    const s = sections(layout, run, middle, middle, 120)[0]!, { wall } = profile(s);
    const base = at(s, wall + MOAT.batter + 6, MOAT.top);
    b.frame(base[0], base[1], base[2], Math.atan2(s.cx, s.cz));
    turret(b);
    b.frame(0, 0, 0, 0);
  }
}

/** The moat's causeway half-length at a palace gate, if one stands at `p`. */
function causeway(layout: PeriodCityLayout, side: number, p: number): number {
  for (const l of layout.landmarks) if (l.side === side && (l.kind === 'sakurada-gate' || l.kind === 'hanzo-gate')
    && Math.abs(l.p - p) < (l.kind === 'sakurada-gate' ? 9 : 6)) return l.kind === 'sakurada-gate' ? 9 : 6;
  return 0;
}
/**
 * A palace gate across the moat, built from the road edge (z = 0): the
 * Korai-mon at the causeway's far end in a gap of the stone wall; Sakuradamon
 * adds the great white gatehouse (渡櫓) behind its square court.
 */
function gate(b: CityMeshBuilder, great: boolean, wall: number): void {
  const z = wall + MOAT.batter * .5, stone = '#a19a8c', timber = '#3a2a22', tile = '#3e4248';
  b.colour.set(stone);
  for (const [x0, x1] of [[-16, -5], [5, 16]] as const) b.box('stone', x0, x1, -.1, MOAT.top, z - 1.6, z + 2.6);
  b.colour.set(timber);
  for (const x of [-3.4, 3.4]) b.box('wall', x - .5, x + .5, -.05, 6.2, z - .8, z + .2);
  b.box('wall', -4.4, 4.4, 5.3, 6, z - .9, z + .3);
  b.colour.set(tile); b.gableRoof('roof', -4.8, 4.8, z - 1.6, z + 1, 6.2, 1.5, .5);
  b.colour.set(timber); b.gableEnds('wall', -4.8, 4.8, z - 1.6, z + 1, 6.2, 1.5);
  if (!great) return;
  // The court's walls and the gatehouse over its inner gateway.
  const g = z + 12;
  b.colour.set(stone);
  for (const x of [-16, 15]) b.box('stone', x, x + 1, -.1, MOAT.top, z + 2.6, g);
  b.box('stone', -18, -4, -.1, MOAT.top, g, g + 9); b.box('stone', 4, 18, -.1, MOAT.top, g, g + 9);
  b.box('stone', -4, 4, 5.4, MOAT.top, g, g + 9, 'b');
  b.colour.set('#2c2a2c'); b.box('wall', -18, 18, MOAT.top, MOAT.top + 1.3, g, g + 9, 'b');
  b.colour.set('#ece6d8'); b.box('floodlit', -18, 18, MOAT.top + 1.3, MOAT.top + 4.8, g + .1, g + 8.9, 'b');
  b.colour.set('#202024'); for (const x of [-12, -6, 6, 12]) b.front('wall', x - .6, x + .6, MOAT.top + 2.2, MOAT.top + 3.4, g + .08);
  b.colour.set(tile); b.gableRoof('roof', -18.5, 18.5, g, g + 9, MOAT.top + 4.8, 2.6, 1.3);
  b.colour.set('#ece6d8'); b.gableEnds('wall', -18.5, 18.5, g, g + 9, MOAT.top + 4.8, 2.6);
}

/**
 * Nijubashi (二重橋): the double-arched granite bridge across the moat to the
 * palace's main gate, its six iron lanterns lit. Built from the road edge
 * (z = 0) across to the far wall; the water runs on under its arches.
 */
function nijubashi(b: CityMeshBuilder, wall: number): void {
  const granite = '#c8c2b4', deck = .7, start = MOAT.bank, span = wall - start, half = 3.6;
  const springing = MOAT.level + .3, radius = span * .2, centres = [start + span * .29, start + span * .71];
  const rise = (deck - .9 - springing) / radius;
  const under = (z: number) => {
    for (const c of centres) { const d = Math.abs(z - c); if (d < radius) return springing + Math.sqrt(radius * radius - d * d) * rise; }
    return MOAT.level - .3;
  };
  b.colour.set(granite); b.flat('stone', -half, half, start, wall, deck);
  for (let z = start; z < wall - .01; z += .5) {
    const z1 = Math.min(wall, z + .5), low = under((z + z1) / 2);
    b.colour.set(granite);
    b.side('floodlit', -half, z, z1, low, deck, -1); b.side('floodlit', half, z, z1, low, deck, 1);
    if (low > MOAT.level) { b.colour.set('#8a857a'); b.face('stone', [[-half, under(z), z], [half, under(z), z], [half, under(z1), z1], [-half, under(z1), z1]], [0, -1, 0]); }
  }
  b.colour.set(granite);
  for (const x of [-half, half - .4]) b.box('stone', x, x + .4, deck, deck + .9, start, wall);
  for (const t of [.18, .5, .82]) for (const x of [-half + .2, half - .2]) {
    const z = start + span * t;
    b.colour.set('#2a2a2e'); b.box('metal', x - .1, x + .1, deck + .9, deck + 3.7, z - .1, z + .1, 'b');
    b.colour.set('#ffd9a0'); b.box('lamp', x - .3, x + .3, deck + 3.7, deck + 4.4, z - .3, z + .3);
    b.colour.set('#2a2a2e'); b.box('metal', x - .38, x + .38, deck + 4.4, deck + 4.6, z - .38, z + .38, 'b');
  }
  gate(b, false, wall);
}

/** Fushimi-yagura-like: plaster walls over black boards, tiled roofs with deep eaves. */
function turret(b: CityMeshBuilder): void {
  b.colour.set('#2c2a2c'); b.box('wall', -7, 7, 0, 1.6, 0, 9, 'b');
  b.colour.set('#ece6d8'); b.box('floodlit', -7, 7, 1.6, 6, 0, 9, 'b');
  b.colour.set('#202024');
  for (const x of [-4.6, -1.6, 1.6, 4.6]) b.front('wall', x - .6, x + .6, 3.2, 4.4, -.02);
  b.colour.set('#3e4248'); b.gableRoof('roof', -7, 7, 0, 9, 6.4, 2.2, 1.4);
  b.colour.set('#ece6d8'); b.gableEnds('wall', -7, 7, 0, 9, 6.4, 2.2); b.box('wall', -4.8, 4.8, 6.2, 10, 1.6, 7.4, 'b');
  b.colour.set('#202024'); for (const x of [-2.4, 0, 2.4]) b.front('wall', x - .5, x + .5, 7.6, 8.6, 1.58);
  b.colour.set('#3e4248'); b.gableRoof('roof', -4.8, 4.8, 1.6, 7.4, 10.2, 2.1, 1.2);
  b.colour.set('#ece6d8'); b.gableEnds('wall', -4.8, 4.8, 1.6, 7.4, 10.2, 2.1);
}

function park(b: CityMeshBuilder, layout: PeriodCityLayout, run: PeriodOpenRun, from: number, to: number): void {
  const list = sections(layout, run, from, to, 66);
  for (let i = 0; i < list.length - 1; i++) {
    const s0 = list[i]!, s1 = list[i + 1]!, end = (s: Section) => Math.max(MOAT.curb + 1, Math.min(64, s.reach - 3));
    b.colour.set('#56653f'); strip(b, 'ground', s0, s1, () => SIDEWALK, -.05, end, -.05, () => UP);
    b.colour.set('#9a958a');
    strip(b, 'stone', s0, s1, () => MOAT.curb, -.1, () => MOAT.curb, .4, toRoad);
    strip(b, 'stone', s0, s1, () => MOAT.curb, .4, () => MOAT.curb + .3, .4, () => UP);
    // A clipped hedge behind the curb.
    b.colour.set('#2f4a33');
    strip(b, 'ground', s0, s1, () => MOAT.curb + .4, .3, () => MOAT.curb + .4, 1.25, toRoad);
    strip(b, 'ground', s0, s1, () => MOAT.curb + .4, 1.25, () => MOAT.curb + 1.3, 1.25, () => UP);
  }
}

function shrine(b: CityMeshBuilder, layout: PeriodCityLayout, run: PeriodOpenRun, from: number, to: number): void {
  const list = sections(layout, run, from, to, 40);
  for (let i = 0; i < list.length - 1; i++) {
    const s0 = list[i]!, s1 = list[i + 1]!;
    // The precinct's stone fence (玉垣) on a granite base.
    b.colour.set('#a39d90');
    strip(b, 'stone', s0, s1, () => MOAT.curb, -.1, () => MOAT.curb, .6, toRoad);
    strip(b, 'stone', s0, s1, () => MOAT.curb, .6, () => MOAT.curb + .45, .6, () => UP);
    b.colour.set('#b4ae9f');
    strip(b, 'stone', s0, s1, () => MOAT.curb + .1, 1.35, () => MOAT.curb + .1, 1.5, toRoad);
    const post = at(s0, MOAT.curb + .2, 0);
    b.frame(post[0], post[1] + .6, post[2], Math.atan2(s0.cx, s0.cz));
    b.box('stone', -.1, .1, 0, .95, -.1, .1, 'b');
    b.frame(0, 0, 0, 0);
    if (Math.round(s0.p / STEP) % 5 === 0) {
      // Stone lanterns (灯籠) along the approach, faintly lit.
      const base = at(s0, 7, 0);
      b.frame(base[0], base[1], base[2], Math.atan2(s0.cx, s0.cz));
      b.colour.set('#9b968a');
      b.box('stone', -.55, .55, 0, .35, -.55, .55); b.box('stone', -.18, .18, .35, 1.6, -.18, .18, 'b');
      b.box('stone', -.45, .45, 1.6, 1.75, -.45, .45, 'b'); b.box('stone', -.6, .6, 2.45, 2.62, -.6, .6, 'b');
      b.colour.set('#ffbe73'); b.box('lamp', -.3, .3, 1.75, 2.45, -.3, .3, 'b');
      b.frame(0, 0, 0, 0);
    }
  }
  // The great steel torii (大鳥居) facing the street, near the start of the precinct.
  const gate = run.start + Math.min(60, (run.end - run.start) * .2);
  if (gate >= from && gate < to) {
    const s = sections(layout, run, gate, gate, 40)[0]!, base = at(s, 15, 0);
    b.frame(base[0], base[1], base[2], Math.atan2(s.cx, s.cz));
    torii(b);
    b.frame(0, 0, 0, 0);
  }
}

/**
 * A Buddhist temple's frontage: the tile-capped earthen wall (築地塀) with the
 * five white rules of a high-ranking temple's 筋塀, behind a granite curb, and
 * stone lanterns inside. Unlike a shrine there is no torii.
 */
/** A prism (or frustum) of `sides` faces in the current frame, `r0` at y0 narrowing (or widening) to `r1` at y1, capped. */
function prism(b: CityMeshBuilder, key: CityMaterialKey, sides: number, r0: number, y0: number, r1: number, y1: number, turn = 0, caps = true): void {
  const ring = (r: number, y: number) => Array.from({ length: sides }, (_, i) => {
    const a = turn + i / sides * Math.PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r] as Vec3;
  });
  const low = ring(r0, y0), high = ring(r1, y1), slope = (r0 - r1) / Math.max(.01, y1 - y0);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, a = turn + (i + .5) / sides * Math.PI * 2;
    b.face(key, [low[i]!, low[j]!, high[j]!, high[i]!], [Math.cos(a), slope, Math.sin(a)]);
  }
  if (!caps) return;
  for (let i = 1; i < sides - 1; i++) {
    b.face(key, [high[0]!, high[i]!, high[i + 1]!], [0, 1, 0]);
    b.face(key, [low[0]!, low[i + 1]!, low[i]!], [0, -1, 0]);
  }
}
/**
 * A Kasuga stone lantern (春日灯籠) in the current frame, standing on its base at the origin: a hexagonal footing, a
 * round post with a collar, the lotus-carved middle platform, the firebox (its windows lit at dusk), a hexagonal roof
 * whose six corners curl up (蕨手), and the jewel finial. About 2.3 m tall, as the lanterns lining Nara's and Kyoto's
 * temple walls and ponds.
 */
function stoneLantern(b: CityMeshBuilder, scale = 1): void {
  const s = scale, granite = new THREE.Color('#9a958b');
  b.colour.copy(granite).multiplyScalar(.85);
  prism(b, 'wall', 6, .5 * s, 0, .42 * s, .22 * s);
  b.colour.copy(granite);
  prism(b, 'wall', 8, .15 * s, .22 * s, .13 * s, 1.1 * s, 0, false);
  prism(b, 'wall', 8, .19 * s, .62 * s, .19 * s, .7 * s);
  prism(b, 'wall', 6, .2 * s, 1.1 * s, .44 * s, 1.24 * s);
  prism(b, 'wall', 6, .44 * s, 1.24 * s, .4 * s, 1.34 * s);
  // The firebox: posts at the corners and the lit paper behind its open windows.
  b.colour.set('#ffbe73'); prism(b, 'lamp', 6, .22 * s, 1.36 * s, .22 * s, 1.72 * s, Math.PI / 6);
  b.colour.copy(granite).multiplyScalar(.95);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, x = Math.cos(a) * .27 * s, z = Math.sin(a) * .27 * s;
    b.box('wall', x - .05 * s, x + .05 * s, 1.34 * s, 1.76 * s, z - .05 * s, z + .05 * s, 'b');
  }
  prism(b, 'wall', 6, .3 * s, 1.34 * s, .3 * s, 1.38 * s);
  // The roof: a broad, low hexagonal hat, its corners curling up.
  b.colour.copy(granite).multiplyScalar(.9);
  prism(b, 'wall', 6, .62 * s, 1.76 * s, .62 * s, 1.84 * s);
  prism(b, 'wall', 6, .62 * s, 1.84 * s, .14 * s, 2.08 * s, 0, false);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, x = Math.cos(a) * .6 * s, z = Math.sin(a) * .6 * s;
    b.box('wall', x - .045 * s, x + .045 * s, 1.84 * s, 1.97 * s, z - .045 * s, z + .045 * s, 'b');
  }
  b.colour.copy(granite);
  prism(b, 'wall', 6, .1 * s, 2.08 * s, .07 * s, 2.14 * s);
  prism(b, 'wall', 8, .09 * s, 2.14 * s, .01 * s, 2.32 * s, 0, false);
}

function temple(b: CityMeshBuilder, layout: PeriodCityLayout, run: PeriodOpenRun, from: number, to: number): void {
  const list = sections(layout, run, from, to, 40), wall = MOAT.curb + 1.2;
  for (let i = 0; i < list.length - 1; i++) {
    const s0 = list[i]!, s1 = list[i + 1]!;
    b.colour.set('#8f8a7e');
    strip(b, 'stone', s0, s1, () => wall - .2, -.1, () => wall - .2, .45, toRoad);
    b.colour.set('#d8c79a');
    strip(b, 'floodlit', s0, s1, () => wall, .45, () => wall, 3.4, toRoad);
    b.colour.set('#f1ece0');
    for (const y of [1.1, 1.55, 2, 2.45, 2.9]) strip(b, 'floodlit', s0, s1, () => wall - .02, y, () => wall - .02, y + .1, toRoad);
    // The coping: a small tiled roof (築地塀の瓦屋根) over the wall's thickness, eaves out both sides, a ridge of round tiles.
    const ridge = wall + .45, front = wall - .55, back = wall + 1.45;
    b.colour.set('#2e3136');
    strip(b, 'wall', s0, s1, () => wall, 3.3, () => front, 3.3, () => [0, -1, 0]);
    b.colour.set('#4a4f56');
    strip(b, 'roof', s0, s1, () => front, 3.3, () => ridge, 3.86, s => [-s.cx, 1.6, -s.cz]);
    strip(b, 'roof', s0, s1, () => ridge, 3.86, () => back, 3.3, s => [s.cx, 1.6, s.cz]);
    b.colour.set('#3a3e44');
    strip(b, 'roof', s0, s1, () => front, 3.3, () => front, 3.18, toRoad);
    b.colour.set('#2a2d32');
    strip(b, 'roof', s0, s1, () => ridge - .14, 3.86, () => ridge - .14, 4.02, toRoad);
    strip(b, 'roof', s0, s1, () => ridge - .14, 4.02, () => ridge + .14, 4.02, () => UP);
    if (Math.round(s0.p / STEP) % 4 === 0) {
      const base = at(s0, wall - 1.3, 0);
      b.frame(base[0], base[1], base[2], Math.atan2(s0.cx, s0.cz));
      stoneLantern(b, .9);
      b.frame(0, 0, 0, 0);
    }
  }
}

/**
 * A townhouse on a pond's far bank, facing the water (local -Z), in the current frame: two storeys of dark timber or
 * plaster under a tiled roof with its eaves to the water, the street floor a row of lit shoji, the upper floor glazed
 * windows (lit rooms, as the period city's windows), and a lantern by the door. Seen 60-90 m off across the water, as
 * the inns and shops of Naramachi line Sarusawa-ike's south bank; their lights mirror in the pond.
 */
function bankHouse(b: CityMeshBuilder, random: () => number, w: number, d: number): void {
  const timber = new THREE.Color(random() < .55 ? '#4a3a30' : '#d8cdb8').multiplyScalar(.9 + random() * .15), ground = 3, h = ground + 2.7;
  const tile = new THREE.Color('#3e4248');
  b.colour.copy(timber);
  b.side('wall', -w / 2, 0, d, 0, h, -1); b.side('wall', w / 2, 0, d, 0, h, 1); b.front('wall', -w / 2, w / 2, 0, h, d, 1);
  // Street floor: timber posts between lit shoji (a lamp face, warm paper lit from within).
  b.colour.copy(timber).multiplyScalar(.75);
  b.front('wall', -w / 2, w / 2, ground - .4, ground, 0); b.front('wall', -w / 2, w / 2, 0, .25, 0);
  const bays = Math.max(2, Math.round(w / 2.2));
  for (let i = 0; i < bays; i++) {
    const x0 = -w / 2 + w * i / bays + .12, x1 = -w / 2 + w * (i + 1) / bays - .12;
    if (random() < .8) { b.colour.setRGB(1.05, .72, .36); b.front('lamp', x0, x1, .25, ground - .4, .15); }
    else { b.window = [random(), WINDOW_KIND.shop]; b.colour.set('#6a5a44'); b.front('glass', x0, x1, .25, ground - .4, .15); }
    b.colour.copy(timber).multiplyScalar(.7); b.box('wall', x1, x1 + .24, .25, ground - .4, -.04, .15, 'bk');
  }
  b.colour.copy(timber).multiplyScalar(.7); b.box('wall', -w / 2, -w / 2 + .12, 0, ground, -.04, .15, 'bk');
  // A pent roof between the storeys.
  b.colour.copy(tile);
  b.face('roof', [[-w / 2 - .1, ground + .2, 0], [w / 2 + .1, ground + .2, 0], [w / 2 + .1, ground - .2, -.8], [-w / 2 - .1, ground - .2, -.8]], [0, .9, -.43]);
  // Upper floor: plaster with two or three glazed windows.
  b.colour.copy(timber).multiplyScalar(1.1); b.front('wall', -w / 2, w / 2, ground + .2, h, 0);
  const windows = w > 9 ? 3 : 2;
  for (let i = 0; i < windows; i++) {
    const c = -w / 2 + w * (i + .5) / windows;
    b.window = [random(), WINDOW_KIND.home]; b.colour.set('#4a4038');
    b.front('glass', c - .8, c + .8, ground + .75, ground + 2.15, -.02);
  }
  // The roof, eaves to the water, and its ridge.
  b.colour.copy(tile); b.gableRoof('roof', -w / 2, w / 2, 0, d, h, 1.8, .7);
  b.colour.copy(timber); b.gableEnds('wall', -w / 2, w / 2, 0, d, h, 1.8);
  b.colour.copy(tile).multiplyScalar(.75); b.box('roof', -w / 2 - .3, w / 2 + .3, h + 1.75, h + 1.95, d / 2 - .15, d / 2 + .15, 'b');
  // A red lantern by the door, kept as a far light.
  const lx = (random() - .5) * (w - 2);
  b.colour.setRGB(2.4, .5, .25); b.box('lamp', lx - .2, lx + .2, ground - 1.1, ground - .5, -.5, -.1);
  b.beacon(lx, ground - .8, -.3, 2.4, .5, .2, .5);
  b.beacon(0, 1.4, -.2, 1.6, 1.05, .5, Math.min(2.4, w * .25));
}

/**
 * A temple pond beside the road, such as Sarusawa-ike or Daibutsu-ike: a grass
 * verge with a stone curb, a dressed-stone edge falling to water a few metres
 * below the road, willows leaning over it and a grassy far bank.
 */
function pond(b: CityMeshBuilder, layout: PeriodCityLayout, run: PeriodOpenRun, from: number, to: number): void {
  const list = sections(layout, run, from, to, 90), edge = MOAT.curb + .6, level = -3.4;
  for (let i = 0; i < list.length - 1; i++) {
    // The water runs out to about 40 m (Sarusawa-ike is about that across from the road), its far bank rising steeply.
    const s0 = list[i]!, s1 = list[i + 1]!, far = (s: Section) => Math.max(edge + 8, Math.min(40, s.reach - 6));
    b.colour.set('#5d6b45'); strip(b, 'ground', s0, s1, () => SIDEWALK, -.05, () => MOAT.curb, -.05, () => UP);
    b.colour.set('#9a958a');
    strip(b, 'stone', s0, s1, () => MOAT.curb, -.1, () => MOAT.curb, .45, toRoad);
    strip(b, 'stone', s0, s1, () => MOAT.curb, .45, () => edge, .45, () => UP);
    b.colour.set('#8a8478'); strip(b, 'stone', s0, s1, () => edge, .45, () => edge + .4, level, away);
    b.colour.set('#ffffff'); strip(b, 'water', s0, s1, () => edge + .4, level, far, level, () => UP);
    b.colour.set('#4f5e3c'); strip(b, 'ground', s0, s1, far, level, s => far(s) + 6, .5, toRoad);
    strip(b, 'ground', s0, s1, s => far(s) + 6, .5, s => far(s) + 24, .5, () => UP);
    const station = Math.round(s0.p / STEP);
    // Townhouses along the far bank, one every 12-16 m where the ground beyond runs clear of the road's other legs, and
    // willows between them at the water's edge.
    if (station % 3 === 0) {
      const random = seeded(hashInts(station, run.side, 83)), bank = far(s0) + 7, w = 8 + random() * 5, depth = 9;
      if (periodCityReach(layout, s0.p, run.side, bank + depth + 12) >= bank + depth + 6) {
        const base = at(s0, bank + .5, .5);
        b.frame(base[0], base[1], base[2], Math.atan2(s0.cx, s0.cz));
        bankHouse(b, random, w, depth);
        b.frame(0, 0, 0, 0);
      }
    } else if (station % 3 === 1 && seeded(hashInts(station, run.side, 89))() < .6) {
      const random = seeded(hashInts(station, run.side, 89)), base = at(s0, far(s0) + 2, level + 1.2);
      random();
      b.frame(base[0], base[1], base[2], Math.atan2(s0.cx, s0.cz));
      b.plant(FLORA_KIND.willow, 0, 0, 0, -Math.PI / 2 + (random() - .5) * .5, .85 + random() * .3, .3, .36, .1, Math.floor(random() * 1000));
      b.frame(0, 0, 0, 0);
    }
    if (station % 7 === 0) {
      // A weeping willow on the near edge, leaning out over the water (flora.ts), its autumn strands yellow-green.
      const base = at(s0, edge - .4, .45);
      b.frame(base[0], base[1], base[2], Math.atan2(s0.cx, s0.cz));
      const random = seeded(hashInts(station, 77));
      b.plant(FLORA_KIND.willow, 0, 0, 0, Math.PI / 2 + (random() - .5) * .5, .9 + random() * .3, .3, .36, .1, Math.floor(random() * 1000));
      b.frame(0, 0, 0, 0);
    } else if (station % 7 === 3) {
      // A stone lantern on the curb between the willows.
      const base = at(s0, MOAT.curb + .8, .45);
      b.frame(base[0], base[1], base[2], Math.atan2(s0.cx, s0.cz));
      stoneLantern(b, .8);
      b.frame(0, 0, 0, 0);
    }
  }
}

/** A horizontal round beam along local X (a torii's lintel). */
function rod(b: CityMeshBuilder, x0: number, x1: number, y: number, radius: number, segments = 12): void {
  const ring = (i: number) => [Math.cos(i / segments * Math.PI * 2) * radius, Math.sin(i / segments * Math.PI * 2) * radius] as const;
  for (let i = 0; i < segments; i++) {
    const [ay, az] = ring(i), [cy, cz] = ring(i + 1), m = (i + .5) / segments * Math.PI * 2;
    b.face('metal', [[x0, y + ay, az], [x1, y + ay, az], [x1, y + cy, cz], [x0, y + cy, cz]], [0, Math.cos(m), Math.sin(m)]);
    for (const x of [x0, x1]) b.face('metal', [[x, y, 0], [x, y + ay, az], [x, y + cy, cz]], [x === x0 ? -1 : 1, 0, 0]);
  }
}
/** Yasukuni's great steel torii (大鳥居), Shinmei style (神明鳥居): straight
 * upright pillars, a straight tie beam (貫) and a straight round lintel (笠木). */
function torii(b: CityMeshBuilder): void {
  b.colour.set('#5f5c57');
  for (const x of [-9.6, 9.6]) {
    b.cylinder('metal', x, 0, 0, 1.25, 21.4, 16, false);
    b.colour.set('#47443f'); b.cylinder('metal', x, 0, 0, 1.55, 1.4, 16); b.colour.set('#5f5c57');
  }
  b.box('metal', -11.6, 11.6, 15.5, 16.9, -.6, .6);
  rod(b, -14.4, 14.4, 22.3, 1.05);
}

const shade = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);
/** The quay edge (metres beyond the road edge) and the harbour water level. */
export const QUAY = { edge: 4.6, level: -2.2 } as const;

/** Yokohama's quay: bollards, a dressed-stone edge and harbour water out toward the painted far shore. */
function quay(b: CityMeshBuilder, layout: PeriodCityLayout, run: PeriodOpenRun, from: number, to: number): void {
  const list = sections(layout, run, from, to, 300), edge = QUAY.edge;
  for (let i = 0; i < list.length - 1; i++) {
    const s0 = list[i]!, s1 = list[i + 1]!, far = (s: Section) => Math.max(edge + 6, Math.min(300, s.reach - 4));
    b.colour.set('#a39e92');
    strip(b, 'stone', s0, s1, () => edge - .4, .02, () => edge, .02, () => UP);
    strip(b, 'stone', s0, s1, () => edge, .02, () => edge, QUAY.level - .4, away);
    b.colour.set('#ffffff');
    strip(b, 'water', s0, s1, () => edge, QUAY.level, far, QUAY.level, () => UP);
    if (Math.round(s0.p / STEP) % 2 === 0) {
      const post = at(s0, edge - .9, 0);
      b.frame(post[0], post[1], post[2], Math.atan2(s0.cx, s0.cz));
      b.colour.set('#2a2c30'); b.cylinder('metal', 0, 0, 0, .2, .55, 8); b.cylinder('metal', 0, .55, 0, .28, .12, 8);
      b.frame(0, 0, 0, 0);
    }
  }
}

/** Yokohama Marine Tower (1961): a red-and-white decagonal lattice, the deck lit, the beacon on top. */
function marineTower(b: CityMeshBuilder): void {
  const rings: readonly (readonly [number, number])[] = [[0, 9], [30, 7], [60, 5], [86, 4.2], [94, 6.5], [100, 6.5], [101, 3], [106, 2]];
  for (let i = 0; i < rings.length - 1; i++) {
    const [y0, r0] = rings[i]!, [y1, r1] = rings[i + 1]!;
    b.colour.set(i % 2 ? '#e8e2d6' : '#c8362b');
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2, c = (k + 1) / 10 * Math.PI * 2, m = (k + .5) / 10 * Math.PI * 2;
      b.face('floodlit', [[Math.cos(a) * r0, y0, Math.sin(a) * r0], [Math.cos(c) * r0, y0, Math.sin(c) * r0],
        [Math.cos(c) * r1, y1, Math.sin(c) * r1], [Math.cos(a) * r1, y1, Math.sin(a) * r1]], [Math.cos(m), 0, Math.sin(m)]);
    }
  }
  b.colour.setRGB(2.4, 1.6, .9); b.cylinder('lamp', 0, 95, 0, 6.6, 3.5, 10, false);
  b.colour.setRGB(.4, 2.8, 1.2); b.cylinder('lamp', 0, 106, 0, 1.4, 2, 8);
  b.colour.set('#8a8680'); b.box('stone', -12, 12, 0, 4, -12, 12);
}

/** A moored liner dressed overall: dark hull, white decks, a funnel and strings of lights. */
function liner(b: CityMeshBuilder): void {
  const length = 150, beam = 20, hull = new THREE.Color('#1f2633');
  b.colour.copy(hull); b.box('metal', -length / 2, length / 2, QUAY.level - 1, 9, 0, beam);
  b.face('metal', [[length / 2, QUAY.level - 1, 0], [length / 2 + 14, 9, beam / 2], [length / 2, 9, beam]], [1, 0, 0]);
  b.face('metal', [[length / 2, 9, 0], [length / 2 + 14, 9, beam / 2], [length / 2, 9, beam]], [0, 1, 0]);
  b.colour.set('#ece8de'); b.box('wall', -length * .32, length * .3, 9, 13, 2, beam - 2); b.box('wall', -length * .2, length * .18, 13, 16, 4, beam - 4);
  b.colour.set('#c8362b'); b.cylinder('metal', -length * .02, 16, beam / 2, 3.2, 9, 12);
  b.colour.set('#1c1c20'); b.cylinder('metal', -length * .02, 25, beam / 2, 3.25, 1.2, 12);
  b.print = signPrint('board', signIndex('board', 'みなと丸')); b.colour.set('#ffffff');
  b.front('sign', length * .3, length * .3 + 16, 2.6, 6.6, -.05);
  // Lit portholes and promenade windows.
  b.colour.setRGB(2.2, 1.4, .7);
  for (let x = -length * .44; x < length * .44; x += 3.2) b.front('lamp', x - .5, x + .5, 5.4, 6.2, -.04);
  for (let x = -length * .3; x < length * .28; x += 2.6) b.front('lamp', x - .8, x + .8, 10.4, 11.6, 1.96);
  // Masts and the strings of bulbs from bow to stern.
  b.colour.set('#3a3a3e');
  for (const x of [-length * .36, length * .26]) b.box('metal', x - .25, x + .25, 9, 34, beam / 2 - .25, beam / 2 + .25, 'b');
  b.colour.setRGB(3, 2.2, 1.2);
  const strings: readonly (readonly [number, number, number, number])[] = [[-length / 2, 9, -length * .36, 34], [-length * .36, 34, length * .26, 34], [length * .26, 34, length / 2 + 12, 9]];
  for (const [xa, ya, xc, yc] of strings) for (let t = 0; t <= 1; t += .045) {
    const px = xa + (xc - xa) * t, py = ya + (yc - ya) * t - Math.sin(t * Math.PI) * (ya === yc ? 2.5 : .8);
    b.box('lamp', px - .35, px + .35, py - .35, py + .35, beam / 2 - .35, beam / 2 + .35);
  }
}

/** A landmark in its reserved footprint, its face toward the road. */
function landmark(b: CityMeshBuilder, layout: PeriodCityLayout, l: PeriodLandmark): void {
  const f = landmarkFootprint(layout.course, l), pose = poseAt(layout.course, l.p);
  if (isBuildingLandmark(l.kind)) {
    const lateral = l.side * (pose.width + l.clearance);
    b.frame(pose.x + Math.cos(pose.heading) * lateral, pose.y - .08, pose.z - Math.sin(pose.heading) * lateral, f.yaw);
    buildLandmark(b, l.kind, seeded(hashInts(Math.round(l.p), l.side, 1986)));
  } else if (l.kind === 'nijubashi') {
    const moatRun = { district: 'moat' as const, side: l.side, start: l.p, end: l.p }, reach = MOAT.water + 48 + MOAT.batter + MOAT.platform + 4;
    const s = sections(layout, moatRun, l.p, l.p, reach)[0]!, edge = at(s, 0, -.05);
    b.frame(edge[0], edge[1], edge[2], f.yaw);
    nijubashi(b, profile(s).wall);
    // The Fushimi turret stands on the wall a little along.
    const t = sections(layout, moatRun, l.p + 32, l.p + 32, reach)[0]!, base = at(t, profile(t).wall + MOAT.batter + 6, MOAT.top);
    b.frame(base[0], base[1], base[2], Math.atan2(t.cx, t.cz));
    turret(b);
  } else if (l.kind === 'sakurada-gate' || l.kind === 'hanzo-gate') {
    const s = sections(layout, { district: 'moat', side: l.side, start: l.p, end: l.p }, l.p, l.p, MOAT.water + 48 + MOAT.batter + MOAT.platform + 4)[0]!;
    const edge = at(s, 0, -.05);
    b.frame(edge[0], edge[1], edge[2], f.yaw);
    gate(b, l.kind === 'sakurada-gate', profile(s).wall);
  } else if (l.kind === 'marine-tower') { b.frame(f.x, pose.y, f.z, f.yaw); marineTower(b); }
  else {
    // The liner floats beside the quay: its hull face toward the road.
    b.frame(f.x - Math.sin(f.yaw) * l.depth / 2, pose.y, f.z - Math.cos(f.yaw) * l.depth / 2, f.yaw);
    liner(b);
  }
  b.frame(0, 0, 0, 0);
}

/**
 * Nikko's Shinkyo (神橋): the vermilion arch over the Daiya gorge beside the
 * road bridge, stone piers, black-and-gold fittings, lanterns at its ends.
 */
function shinkyo(b: CityMeshBuilder, layout: PeriodCityLayout, c: PeriodCrossing): void {
  const pose = poseAt(layout.course, c.p), w = pose.width, edge = w + 1.7, level = -7;
  const left = w + periodCityReach(layout, c.p, 1, c.span), right = -(w + periodCityReach(layout, c.p, -1, c.span));
  b.frame(pose.x, pose.y, pose.z, pose.heading);
  const half = c.half ?? 12;
  for (const [x0, x1] of [[edge, left], [right, -edge]] as const) {
    if (x1 - x0 < 4) continue;
    b.colour.set('#ffffff'); b.flat('water', x0, x1, -half, half, level);
    // Rocky banks fall to the river.
    b.colour.set('#7d786c');
    b.face('stone', [[x0, -.05, -half - 3], [x1, -.05, -half - 3], [x1, level - .2, -half], [x0, level - .2, -half]], [0, .6, .8]);
    b.face('stone', [[x0, -.05, half + 3], [x1, -.05, half + 3], [x1, level - .2, half], [x0, level - .2, half]], [0, .6, -.8]);
  }
  // A plain mountain gorge has no arch beside its road bridge.
  if (c.kind === 'gorge') { b.frame(0, 0, 0, 0); return; }
  // The arch runs parallel to the road bridge, on the left, 18 m out.
  const vermilion = new THREE.Color('#c8362b'), x = w + 18, span = 2 * (half + 3), rise = 3.2;
  b.colour.set('#8a8478');
  for (const z of [-half - 3, half + 3]) b.box('stone', x - 4.4, x + 4.4, level, .4, z - 1.5, z + 1.5);
  const arch = (t: number) => .4 + Math.sin(t * Math.PI) * rise;
  for (let i = 0; i < 12; i++) {
    const t0 = i / 12, t1 = (i + 1) / 12, z0 = -span / 2 + span * t0, z1 = -span / 2 + span * t1;
    b.colour.copy(vermilion);
    b.face('wall', [[x - 3.7, arch(t0), z0], [x + 3.7, arch(t0), z0], [x + 3.7, arch(t1), z1], [x - 3.7, arch(t1), z1]], [0, 1, 0]);
    b.face('floodlit', [[x - 3.7, arch(t0) - 1.2, z0], [x - 3.7, arch(t0), z0], [x - 3.7, arch(t1), z1], [x - 3.7, arch(t1) - 1.2, z1]], [-1, 0, 0]);
    b.face('floodlit', [[x + 3.7, arch(t0) - 1.2, z0], [x + 3.7, arch(t0), z0], [x + 3.7, arch(t1), z1], [x + 3.7, arch(t1) - 1.2, z1]], [1, 0, 0]);
    for (const side of [-1, 1]) {
      const rx = x + side * 3.5;
      b.box('wall', rx - .12, rx + .12, arch(t0), arch(t0) + 1.1, z0 - .12, z0 + .12, 'b');
      b.face('wall', [[rx - .14, arch(t0) + 1.05, z0], [rx + .14, arch(t0) + 1.05, z0], [rx + .14, arch(t1) + 1.05, z1], [rx - .14, arch(t1) + 1.05, z1]], [0, 1, 0]);
      b.face('wall', [[rx - .14 * side * -1, arch(t0) + .85, z0], [rx - .14 * side * -1, arch(t0) + 1.05, z0], [rx - .14 * side * -1, arch(t1) + 1.05, z1], [rx - .14 * side * -1, arch(t1) + .85, z1]], [-side, 0, 0]);
    }
  }
  // Under-arch struts of black-lacquered timber.
  b.colour.set('#2a2224');
  for (const z of [-span / 4, 0, span / 4]) b.box('wall', x - 3.4, x + 3.4, level, arch(.5 + z / span) - 1.2, z - .4, z + .4, 'b');
  b.colour.set('#ffcf8a');
  for (const z of [-span / 2 - .5, span / 2 + .5]) for (const side of [-1, 1]) b.cylinder('lamp', x + side * 3.2, .4, z, .25, .7, 8);
  b.frame(0, 0, 0, 0);
}

/**
 * The Shuto Expressway over the Nihonbashi River (1960s, still bare concrete
 * and green steel in 1986): a walled channel, T-piers standing in the water,
 * the deck with its sodium lamps, and a SORA board on the fascia over the road.
 */
/**
 * A plain city river under its road bridge, such as the Kamo at Shijō Ōhashi:
 * a broad shallow channel between stone revetments and dry riverside walks
 * (河原), with low concrete parapets and bridge lamps; no expressway overhead.
 */
function river(b: CityMeshBuilder, layout: PeriodCityLayout, c: PeriodCrossing): void {
  const pose = poseAt(layout.course, c.p), w = pose.width, edge = w + 1.7, half = c.half ?? RIVER.half, level = -3.2;
  const left = w + periodCityReach(layout, c.p, 1, c.span), right = -(w + periodCityReach(layout, c.p, -1, c.span));
  b.frame(pose.x, pose.y, pose.z, pose.heading);
  const walk = Math.min(9, half * .25), water = half - walk;
  for (const [x0, x1] of [[edge, left], [right, -edge]] as const) {
    if (x1 - x0 < 4) continue;
    b.colour.set('#ffffff'); b.flat('water', x0, x1, -water, water, level - .4);
    b.colour.set('#9a958a');
    for (const s of [-1, 1]) {
      b.flat('ground', x0, x1, Math.min(s * water, s * (half - .4)), Math.max(s * water, s * (half - .4)), level);
      b.front('stone', x0, x1, level - .4, level, s * water, -s as -1 | 1);
    }
    b.colour.set('#8a867c'); b.front('stone', x0, x1, level, -.05, -half, 1); b.front('stone', x0, x1, level, -.05, half, -1);
    b.colour.set('#b8b2a6'); b.box('stone', x0, x1, -.05, .95, -half - .45, -half, 'b'); b.box('stone', x0, x1, -.05, .95, half, half + .45, 'b');
  }
  for (const x of [-(w + .9), w + .9]) for (const z of [-half - .3, half + .3]) {
    b.colour.set('#2e3032'); b.cylinder('metal', x, 0, z, .1, 4.4, 8);
    b.colour.set('#ffd08a'); b.cylinder('lamp', x, 4.4, z, .28, .5, 10);
  }
  b.frame(0, 0, 0, 0);
}
function crossing(b: CityMeshBuilder, layout: PeriodCityLayout, c: PeriodCrossing): void {
  if (c.kind === 'shinkyo' || c.kind === 'gorge') { shinkyo(b, layout, c); return; }
  if (c.kind === 'river') { river(b, layout, c); return; }
  const pose = poseAt(layout.course, c.p), w = pose.width, edge = w + 1.7;
  const left = w + periodCityReach(layout, c.p, 1, c.span), right = -(w + periodCityReach(layout, c.p, -1, c.span));
  b.frame(pose.x, pose.y, pose.z, pose.heading);
  const { half, level, deck, deckHalf } = RIVER;
  for (const [x0, x1] of [[edge, left], [right, -edge]] as const) {
    if (x1 - x0 < 4) continue;
    b.colour.set('#ffffff'); b.flat('water', x0, x1, -half, half, level);
    b.colour.set('#8a867c');
    b.front('stone', x0, x1, level - .3, -.05, -half, 1); b.front('stone', x0, x1, level - .3, -.05, half, -1);
    b.colour.set('#a39e92');
    b.box('stone', x0, x1, -.05, .25, -half - .5, -half, 'b'); b.box('stone', x0, x1, -.05, .25, half, half + .5, 'b');
    b.colour.set('#3a3a3e');
    b.box('metal', x0, x1, 1.0, 1.06, -half - .3, -half - .24, 'b'); b.box('metal', x0, x1, 1.0, 1.06, half + .24, half + .3, 'b');
  }
  // Ornamental lamps at the bridge corners.
  for (const x of [-(w + .9), w + .9]) for (const z of [-half - .4, half + .4]) {
    b.colour.set('#2e3032'); b.cylinder('metal', x, 0, z, .12, 4.2, 8); b.box('metal', x - .3, x + .3, 0, .5, z - .3, z + .3);
    b.colour.set('#ffd08a'); b.cylinder('lamp', x, 4.2, z, .32, .6, 10);
  }
  const x0 = right, x1 = left, concrete = new THREE.Color('#8d8a84');
  // Deck, girders and parapets; the underside is what a driver sees.
  b.colour.copy(concrete); b.box('wall', x0, x1, deck, deck + 1.1, -deckHalf, deckHalf, '');
  b.colour.set('#6f7c78');
  for (const z of [-5.2, 0, 5.2]) b.box('metal', x0, x1, deck - 1.8, deck, z - 1.1, z + 1.1, 't');
  b.colour.copy(concrete);
  for (const z of [-deckHalf, deckHalf - .35]) b.box('wall', x0, x1, deck + 1.1, deck + 2.2, z, z + .35, 'b');
  b.colour.set('#3a3a3e');
  for (const z of [-deckHalf + .05, deckHalf - .1]) b.box('metal', x0, x1, deck + 2.2, deck + 2.3, z, z + .05, 'b');
  for (let x = x0 + 12, i = 0; x < x1 - 6; x += 38, i++) {
    const z = i % 2 ? deckHalf - .2 : -deckHalf + .2, arm = z > 0 ? -1 : 1;
    b.colour.set('#4a4c50'); b.box('metal', x - .09, x + .09, deck + 2.2, deck + 9, z - .09, z + .09, 'b');
    b.box('metal', x - .07, x + .07, deck + 8.9, deck + 9.05, Math.min(z, z + arm * 1.8), Math.max(z, z + arm * 1.8), 'b');
    b.colour.set('#ffb05a'); b.box('lamp', x - .22, x + .22, deck + 8.72, deck + 8.9, z + arm * 1.5 - .3, z + arm * 1.5 + .3);
  }
  // T-piers in the river, never in the street.
  b.colour.copy(shade(concrete, .92));
  for (let x = 0; x <= Math.max(-x0, x1); x += 34) for (const s of [-1, 1]) {
    const px = s * (x + 17);
    if (px < x0 + 4 || px > x1 - 4 || Math.abs(px) < w + 5) continue;
    b.box('wall', px - 1.1, px + 1.1, level, deck - 3.2, -1.3, 1.3, 'b');
    b.box('wall', px - 1.3, px + 1.3, deck - 3.2, deck - 1.8, -7.6, 7.6, '');
  }
  // The fascia board faces drivers arriving at the bridge.
  b.print = signPrint('board', SORA_BOARDS[1] ?? 1); b.colour.set('#ffffff');
  b.front('sign', -3.7, 3.7, deck - 1.7, deck + 2.1, -deckHalf - .08);
  b.frame(0, 0, 0, 0);
}

/** The open districts overlapping [from, to) of the course. */
/** Plowed snow banks heaped along both roadsides beyond the sidewalk. */
function snowBanks(b: CityMeshBuilder, layout: PeriodCityLayout, from: number, to: number): void {
  const lo = Math.max(from, layout.course.poses[0]!.p), hi = Math.min(to, layout.course.poses.at(-1)!.p);
  if (lo >= hi) return;
  for (const side of [-1, 1] as const) {
    const list = sections(layout, { district: 'forest', side, start: lo, end: hi }, lo, hi, 4);
    for (let i = 0; i < list.length - 1; i++) {
      const s0 = list[i]!, s1 = list[i + 1]!, crest = .28 + .16 * Math.sin(s0.p * .37 + side);
      b.colour.set('#e8ecf6');
      strip(b, 'ground', s0, s1, () => SIDEWALK, .02, () => SIDEWALK + .5, crest, s => [-s.cx * .6, .8, -s.cz * .6]);
      b.colour.set('#dfe4f0');
      strip(b, 'ground', s0, s1, () => SIDEWALK + .5, crest, () => SIDEWALK + 1.3, -.06, s => [s.cx * .6, .8, s.cz * .6]);
    }
  }
}

export function buildOpenGround(b: CityMeshBuilder, layout: PeriodCityLayout, from: number, to: number, snow = 0): void {
  if (snow > 0) snowBanks(b, layout, from, to);
  for (const c of layout.crossings) if (c.p >= from && c.p < to) crossing(b, layout, c);
  for (const l of layout.landmarks) if (l.p >= from && l.p < to) landmark(b, layout, l);
  b.frame(0, 0, 0, 0);
  for (const run of layout.open) {
    const a = Math.max(run.start, from), c = Math.min(run.end, to);
    if (a >= c) continue;
    if (run.district === 'moat') moat(b, layout, run, a, c);
    else if (run.district === 'park') park(b, layout, run, a, c);
    else if (run.district === 'shrine') shrine(b, layout, run, a, c);
    else if (run.district === 'temple') temple(b, layout, run, a, c);
    else if (run.district === 'pond') pond(b, layout, run, a, c);
    else if (run.district === 'quay') quay(b, layout, run, a, c);
    // Forest districts keep the race's own forest pools.
  }
}
