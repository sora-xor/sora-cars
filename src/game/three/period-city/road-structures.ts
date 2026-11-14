import * as THREE from 'three';
import type { CityMeshBuilder, CityMaterialKey, Vec3 } from './geometry';
import { poseAt, type PeriodCityLayout, type PeriodStreetPlan } from './layout';

/**
 * Structures the real roads pass through, over and beside (the Arcade courses' 1986 settings; sources in
 * world/research/arcade): Hakone's Kanrei-dōmon rock shed, its concrete tied-arch bridges and the Tozan Railway's
 * girder at Deyama, the Yamashita Rinkō freight viaduct along Yamashita Park, and the railways the 1986 streets still
 * shared: the Keihan and JNR level crossings at Shijō and Nara, and the Keishin trams' track down Sanjō-dōri. Each
 * follows the road's own line and grade, built in world coordinates from the course's poses, so a piece that crosses
 * a chunk seam meets its neighbour exactly. Presentation only: none is a wall to the driving model.
 */
type Gallery = NonNullable<PeriodStreetPlan['galleries']>[number];
type Arch = NonNullable<PeriodStreetPlan['arches']>[number];

/** A point `lateral` metres to the left of the centre line at progress `p`, `up` metres above the road. */
function at(layout: PeriodCityLayout, p: number, lateral: number, up: number): Vec3 {
  const pose = poseAt(layout.course, p);
  return [pose.x + Math.cos(pose.heading) * lateral, pose.y + up, pose.z - Math.sin(pose.heading) * lateral];
}
/** A quad wound to face `hint`. */
function quad(b: CityMeshBuilder, key: CityMaterialKey, a: Vec3, c: Vec3, d: Vec3, e: Vec3, hint: Vec3): void {
  const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = e[0] - a[0], vy = e[1] - a[1], vz = e[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length; ny /= length; nz /= length;
  if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
  b.face(key, [a, c, d, e], [nx, ny, nz]);
}
/** A beam along the road from p0 to p1 between two lateral offsets and two heights: its four long faces. */
function beam(b: CityMeshBuilder, layout: PeriodCityLayout, key: CityMaterialKey, p0: number, p1: number,
  l0: number, l1: number, y0: number, y1: number): void {
  const pose = poseAt(layout.course, (p0 + p1) / 2), left: Vec3 = [Math.cos(pose.heading), 0, -Math.sin(pose.heading)];
  const right: Vec3 = [-left[0], 0, -left[2]], P = (p: number, l: number, y: number) => at(layout, p, l, y);
  quad(b, key, P(p0, l0, y1), P(p0, l1, y1), P(p1, l1, y1), P(p1, l0, y1), [0, 1, 0]);
  quad(b, key, P(p0, l0, y0), P(p0, l1, y0), P(p1, l1, y0), P(p1, l0, y0), [0, -1, 0]);
  quad(b, key, P(p0, l0, y0), P(p0, l0, y1), P(p1, l0, y1), P(p1, l0, y0), l0 < l1 ? right : left);
  quad(b, key, P(p0, l1, y0), P(p0, l1, y1), P(p1, l1, y1), P(p1, l1, y0), l0 < l1 ? left : right);
}
/** An upright post in the road's frame at progress `p`: `half` metres square. */
function post(b: CityMeshBuilder, layout: PeriodCityLayout, key: CityMaterialKey, p: number, lateral: number, half: number, y0: number, y1: number): void {
  const pose = poseAt(layout.course, p);
  b.frame(pose.x, pose.y, pose.z, pose.heading);
  b.box(key, lateral - half, lateral + half, y0, y1, -half, half, 'b');
  b.frame(0, 0, 0, 0);
}

const CONCRETE = '#8f8c86', STAINED = '#75736e';

/**
 * Kanrei-dōmon (函嶺洞門, 1931): a concrete rock shed 100.9 m long in six bays, its portals styled after a Chinese
 * palace gate. The cliff is on one side and the bays open to the Haya-kawa on the other; Route 1 ran through it
 * until 2014. The real carriageway is 5.8 m; here it spans the course's road.
 */
function rockShed(b: CityMeshBuilder, layout: PeriodCityLayout, g: Gallery, from: number, to: number): void {
  const open = g.side, closed = -g.side, length = g.to - g.from, bay = length / 6, ceiling = 7.4, roof = 8.5;
  const lo = Math.max(from, g.from), hi = Math.min(to, g.to);
  for (let k = Math.ceil(lo / 5); k * 5 < hi; k++) {
    const p0 = k * 5, p1 = Math.min(g.to, p0 + 5), w = poseAt(layout.course, p0).width + 2.3;
    b.colour.set(CONCRETE);
    beam(b, layout, 'wall', p0, p1, -w - .6, w + .6, ceiling, roof);
    // The cliff-side wall, stained by seepage, and the earth the cliff has shed onto the roof.
    b.colour.set(STAINED);
    beam(b, layout, 'wall', p0, p1, closed * w, closed * (w + 1.1), -.1, ceiling);
    b.colour.set('#4a4d3c');
    quad(b, 'ground', at(layout, p0, closed * (w + .6), roof), at(layout, p0, closed * (w + 17), roof + 9),
      at(layout, p1, closed * (w + 17), roof + 9), at(layout, p1, closed * (w + .6), roof), [0, 1, 0]);
    quad(b, 'ground', at(layout, p0, closed * (w + .6), roof + .02), at(layout, p0, open * (w + .2), roof + .5),
      at(layout, p1, open * (w + .2), roof + .5), at(layout, p1, closed * (w + .6), roof + .02), [0, 1, 0]);
    // A low parapet between the open bays' columns.
    b.colour.set(CONCRETE);
    beam(b, layout, 'wall', p0, p1, open * (w - .2), open * (w + .25), -.1, .95);
    // Sodium lamps under the roof.
    if (k % 3 === 0) {
      const lamp = at(layout, p0 + 2.5, 0, ceiling - .12), pose = poseAt(layout.course, p0 + 2.5);
      b.frame(pose.x, lamp[1], pose.z, pose.heading);
      b.colour.setRGB(2.6, 1.7, .8); b.box('lamp', -.45, .45, -.1, 0, -.9, .9);
      b.frame(0, 0, 0, 0);
    }
  }
  // Seven columns frame the six bays.
  for (let i = 0; i <= 6; i++) {
    const p = g.from + bay * i;
    if (p < from || p >= to) continue;
    const w = poseAt(layout.course, p).width + 2.3;
    b.colour.set(CONCRETE); post(b, layout, 'wall', p, open * w, .75, -.1, ceiling);
  }
  // The portals: a heavier frame with a stepped cornice and the plaque over the road.
  for (const [p, facing] of [[g.from, -1], [g.to, 1]] as const) {
    if (p < from || p >= to) continue;
    const pose = poseAt(layout.course, p), w = pose.width + 2.3;
    b.frame(pose.x, pose.y, pose.z, pose.heading);
    b.colour.set(CONCRETE);
    for (const side of [-1, 1]) b.box('wall', side * (w + .3) - 1.1, side * (w + .3) + 1.1, -.1, roof + 1.4, -.9, .9, 'b');
    b.box('wall', -w - 1.4, w + 1.4, ceiling, roof + 1.4, -.9, .9, '');
    b.box('wall', -w - 2.2, w + 2.2, roof + 1.4, roof + 2, -1.2, 1.2, '');
    b.box('wall', -w * .55, w * .55, roof + 2, roof + 3, -1, 1, '');
    b.box('wall', -w * .3, w * .3, roof + 3, roof + 3.5, -1.15, 1.15, '');
    b.colour.set('#2a2c2e'); b.front('metal', -2.6, 2.6, ceiling + .5, roof + 1, facing * .92, facing);
    b.colour.set('#b79a52'); b.front('metal', -2.2, 2.2, ceiling + .75, roof + .75, facing * .94, facing);
    b.frame(0, 0, 0, 0);
  }
}

/**
 * The Yamashita Rinkō line's viaduct (1965; freight ended on 1 November 1986) along the road-side edge of Yamashita
 * Park: a single non-electrified track on a pale concrete rigid-frame viaduct, a pair of columns every 20 m.
 */
function viaduct(b: CityMeshBuilder, layout: PeriodCityLayout, g: Gallery, from: number, to: number): void {
  const lo = Math.max(from, g.from), hi = Math.min(to, g.to), deck = 6.1;
  for (let k = Math.ceil(lo / 5); k * 5 < hi; k++) {
    const p0 = k * 5, p1 = Math.min(g.to, p0 + 5), centre = g.side * (poseAt(layout.course, p0).width + (g.clearance ?? 6));
    b.colour.set('#a9a69e');
    beam(b, layout, 'wall', p0, p1, centre - 2.3, centre + 2.3, deck, deck + .9);
    // Haunched edge beams, darker in their own shadow.
    b.colour.set('#8b8982');
    beam(b, layout, 'wall', p0, p1, centre - 1.5, centre + 1.5, deck - .7, deck);
    b.colour.set('#3c3e42');
    for (const edge of [-2.25, 2.2]) beam(b, layout, 'metal', p0, p1, centre + edge, centre + edge + .05, deck + .9, deck + 1.85);
    if (k % 4 === 0) {
      const pose = poseAt(layout.course, p0);
      b.frame(pose.x, pose.y, pose.z, pose.heading);
      b.colour.set('#9a9790');
      for (const x of [centre - 1.3, centre + 1.3]) b.box('wall', x - .42, x + .42, -.1, deck - .7, -.42, .42, 'b');
      b.box('wall', centre - 1.9, centre + 1.9, deck - 1.5, deck - .7, -.5, .5, '');
      b.frame(0, 0, 0, 0);
    }
  }
}

/**
 * A concrete tied-arch bridge of the early 1930s (Hakone's Asahi-bashi, 39.5 m, and Chitose-bashi, 25.5 m): an arch
 * rib rising beside each kerb, hangers down to the deck, and lamp pillars at the four corners.
 */
function tiedArch(b: CityMeshBuilder, layout: PeriodCityLayout, a: Arch): void {
  const span = a.span ?? 40, rise = span / 5.5, steps = Math.max(8, Math.round(span / 3));
  const w = poseAt(layout.course, a.p).width;
  if (a.beside) {
    // Shin-Asahi-bashi (1967) beside it: a plain steel box girder carrying the downhill lane, pale green, with a
    // pipe rail and two lamps.
    const side = a.beside, l0 = side * (w + 4), l1 = side * (w + 13), p0 = a.p - span / 2 - 2, p1 = a.p + span / 2 + 2;
    b.colour.set('#8e8b85'); beam(b, layout, 'wall', p0, p1, l0, l1, -.45, .02);
    b.colour.set('#5f7a6e'); beam(b, layout, 'metal', p0, p1, l0 + side * 1.2, l1 - side * 1.2, -2.6, -.45);
    b.colour.set('#3e4442');
    for (const edge of [l0 + side * .15, l1 - side * .15]) beam(b, layout, 'metal', p0, p1, edge - .05, edge + .05, .9, 1.05);
    for (const p of [a.p - span / 4, a.p + span / 4]) {
      const pose = poseAt(layout.course, p);
      b.colour.set('#2e3032'); post(b, layout, 'metal', p, l1 - side * .4, .09, 0, 7.6);
      b.frame(pose.x, pose.y, pose.z, pose.heading);
      b.colour.setRGB(2.6, 1.7, .8); b.box('lamp', l1 - side * 1.6 - .35, l1 - side * 1.6 + .35, 7.35, 7.5, -.5, .5);
      b.frame(0, 0, 0, 0);
    }
  }
  for (const side of [-1, 1]) {
    const l0 = side * (w + .55), l1 = side * (w + 1.45);
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps, p0 = a.p - span / 2 + span * t0, p1 = a.p - span / 2 + span * t1;
      const y0 = .5 + Math.sin(t0 * Math.PI) * rise, y1 = .5 + Math.sin(t1 * Math.PI) * rise;
      const P = (p: number, l: number, y: number) => at(layout, p, l, y), out: Vec3 = [side * Math.cos(poseAt(layout.course, a.p).heading), 0, -side * Math.sin(poseAt(layout.course, a.p).heading)];
      b.colour.set(CONCRETE);
      quad(b, 'wall', P(p0, l0, y0), P(p0, l1, y0), P(p1, l1, y1), P(p1, l0, y1), [0, 1, 0]);
      quad(b, 'wall', P(p0, l0, y0 - 1), P(p0, l1, y0 - 1), P(p1, l1, y1 - 1), P(p1, l0, y1 - 1), [0, -1, 0]);
      quad(b, 'wall', P(p0, l0, y0 - 1), P(p0, l0, y0), P(p1, l0, y1), P(p1, l0, y1 - 1), [-out[0], 0, -out[2]]);
      quad(b, 'wall', P(p0, l1, y0 - 1), P(p0, l1, y0), P(p1, l1, y1), P(p1, l1, y1 - 1), out);
      // A hanger under each joint of the rib.
      if (i > 0 && y0 > 1.9) { b.colour.set(STAINED); post(b, layout, 'wall', p0, side * (w + 1), .16, .1, y0 - .9); }
    }
    // The tie along the kerb, and the lamp pillars at the bridge's ends.
    b.colour.set(CONCRETE);
    beam(b, layout, 'wall', a.p - span / 2, a.p, l0, l1, -.1, .55); beam(b, layout, 'wall', a.p, a.p + span / 2, l0, l1, -.1, .55);
    for (const end of [-1, 1]) {
      const p = a.p + end * (span / 2 + .8), pose = poseAt(layout.course, p);
      b.colour.set(CONCRETE); post(b, layout, 'wall', p, side * (w + 1), .6, -.1, 3.1);
      b.frame(pose.x, pose.y, pose.z, pose.heading);
      b.colour.setRGB(2.4, 1.9, 1.2); b.box('lamp', side * (w + 1) - .34, side * (w + 1) + .34, 3.1, 3.9, -.34, .34);
      b.beacon(side * (w + 1), 3.5, 0, 2.4, 1.9, 1.2, .9);
      b.frame(0, 0, 0, 0);
    }
  }
}

/**
 * The Hakone Tozan Railway over Route 1 at Deyama (1917): the road passes under a plate-girder span on stone
 * abutments, and the double-Warren truss of the Haya-kawa bridge runs on from it, out over the gorge to the right.
 */
function railGirder(b: CityMeshBuilder, layout: PeriodCityLayout, a: Arch): void {
  const pose = poseAt(layout.course, a.p), w = pose.width, green = '#3c5a4c', under = 7.6;
  b.frame(pose.x, pose.y, pose.z, pose.heading);
  // Stone abutments either side, and the girder between them.
  b.colour.set('#7b776d');
  for (const side of [-1, 1]) b.box('stone', side * (w + 2.6) - 1.5, side * (w + 2.6) + 1.5, -.1, under, -2.6, 2.6, 'b');
  b.colour.set(green);
  for (const z of [-1.7, 1.45]) b.box('metal', -w - 4.2, w + 4.2, under, under + 1.9, z, z + .25, '');
  b.colour.set('#2e3230'); b.box('metal', -w - 4.2, w + 4.2, under + .2, under + .45, -1.45, 1.45, '');
  // On the hill side the track runs into its cutting; on the valley side the truss carries it over the river.
  b.colour.set('#4a4d3c'); b.box('ground', w + 4.1, w + 22, -.1, under + .4, -3.4, 3.4, 'b');
  const x0 = -(w + 4.2), x1 = x0 - 61, top = under + 8.6, panels = 8, step = (x1 - x0) / panels;
  b.colour.set(green);
  for (const z of [-2.4, 2.15]) {
    b.box('metal', x1, x0, under - .4, under, z, z + .25, ''); b.box('metal', x1, x0, top - .35, top, z, z + .25, '');
    for (let i = 0; i <= panels; i++) { const x = x0 + step * i; b.box('metal', x - .14, x + .14, under, top - .35, z, z + .25, 'b'); }
    for (let i = 0; i < panels; i++) {
      const xa = x0 + step * i, xc = xa + step, zf = z + (z < 0 ? -.01 : .26);
      for (const [ya, yc] of [[under, top - .35], [top - .35, under]] as const) {
        b.face('metal', [[xa - .16, ya, zf], [xa + .16, ya, zf], [xc + .16, yc, zf], [xc - .16, yc, zf]], [0, 0, z < 0 ? -1 : 1]);
      }
    }
  }
  b.colour.set('#2e3230'); b.box('metal', x1, x0, under - .15, under + .1, -2.2, 2.2, '');
  // The pier where the truss lands on the far wall of the gorge.
  b.colour.set('#7b776d'); b.box('stone', x1 - 2.4, x1, -46, under - .4, -3, 3, 'b');
  b.frame(0, 0, 0, 0);
}

/** An overhead wire between two world points, as the street's own wires are drawn (wires.ts), sagging `sag` metres. */
function wire(b: CityMeshBuilder, a: Vec3, c: Vec3, sag = 0): void {
  const segments = sag > 0 ? 6 : 1;
  const point = (t: number): Vec3 => [a[0] + (c[0] - a[0]) * t - b.originX, a[1] + (c[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t - b.originZ];
  for (let i = 0; i < segments; i++) b.wires.push(...point(i / segments), ...point((i + 1) / segments));
}

const RAIL = '#6d6a66', BALLAST = '#4a4641';

/**
 * A railway crossing the road at grade, as the Keihan main line crossed Shijō-dōri until May 1987 and the JNR lines
 * crossed Sanjō-dōri beside Nara station until 2008: rails set flush in a planked crossing, ballasted track running
 * on between the buildings, overhead wires, and at each corner a striped post with its crossbuck and twin red lamps,
 * the barrier arm raised for the race.
 */
function levelCrossing(b: CityMeshBuilder, layout: PeriodCityLayout, a: Arch): void {
  const pose = poseAt(layout.course, a.p), w = pose.width, tracks = a.tracks ?? 2, gauge = a.gauge ?? 1.067, [right, left] = a.reach ?? [30, 30];
  const x0 = -(w + right), x1 = w + left, lines = Array.from({ length: tracks }, (_, i) => (i - (tracks - 1) / 2) * 3.8), half = (tracks - 1) / 2 * 3.8 + 1.5;
  b.frame(pose.x, pose.y, pose.z, pose.heading);
  // The planked crossing in the roadway, and the ballast beyond the kerbs.
  b.colour.set('#3b3835'); b.flat('stone', -w, w, -half, half, .016);
  b.colour.set(BALLAST);
  for (const [from, to] of [[x0, -(w + 1.7)], [w + 1.7, x1]] as const) if (to - from > 1) b.flat('ground', from, to, -half - .4, half + .4, .03);
  for (const z of lines) {
    b.colour.set(RAIL);
    for (const side of [-1, 1]) b.box('metal', x0, x1, .0, .05, z + side * gauge / 2 - .035, z + side * gauge / 2 + .035, 'b');
    // Sleepers on the open track.
    b.colour.set('#3a332c');
    for (const [from, to] of [[x0, -(w + 1.7)], [w + 1.7, x1]] as const) for (let x = from + .4; x < to; x += .65) b.box('wall', x - .11, x + .11, .03, .045, z - gauge / 2 - .45, z + gauge / 2 + .45, 'b');
  }
  // Crossing signals at the four corners: the post, the crossbuck, twin lamps and the raised arm.
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const x = side * (w + 1.05), z = end * (half + 1.4), face = -end as -1 | 1, zf = z - end * .1;
    for (let i = 0; i < 6; i++) { b.colour.set(i % 2 ? '#1c1c1e' : '#e6b422'); b.box('metal', x - .07, x + .07, i * .5, i * .5 + .5, z - .07, z + .07, 'b'); }
    b.colour.set('#e6b422');
    for (const lean of [-1, 1]) b.face('metal', [[x - lean * .62 - .07, 3.05, zf], [x - lean * .62 + .07, 3.05, zf], [x + lean * .62 + .07, 3.95, zf], [x + lean * .62 - .07, 3.95, zf]], [0, 0, face]);
    b.colour.set('#1c1c1e'); b.box('metal', x - .5, x + .5, 2.42, 2.82, z - .08, z + .08, '');
    b.colour.setRGB(3.2, .22, .14);
    for (const lamp of [-.28, .28]) b.front('lamp', x + lamp - .13, x + lamp + .13, 2.5, 2.76, zf - end * .02, face);
    // The arm stands upright beside the post while the gate is open.
    for (let i = 0; i < 9; i++) { b.colour.set(i % 2 ? '#1c1c1e' : '#e6b422'); b.box('metal', x + side * .32 - .035, x + side * .32 + .035, 1 + i * .6, 1.6 + i * .6, z - .035, z + .035, 'b'); }
  }
  // A station's staggered platforms (Keihan's Shijo until 1987): one each side of the road, beside opposite tracks,
  // concrete with a white edge line, a canopy on posts and its fluorescent tubes.
  if (a.station && tracks >= 2) for (const side of [-1, 1] as const) {
    const near = side > 0 ? lines.at(-1)! + gauge / 2 + .35 : lines[0]! - gauge / 2 - .35, far = near + side * 2.7;
    const along0 = w + 4.2, along1 = Math.min(w + 4.2 + 26, side > 0 ? left - 1 : right - 1);
    if (along1 - along0 < 6) continue;
    const xa = side * along0, xb = side * along1, z0 = Math.min(near, far), z1 = Math.max(near, far);
    b.colour.set('#9a958a'); b.box('stone', Math.min(xa, xb), Math.max(xa, xb), 0, .95, z0, z1, 'b');
    b.colour.set('#e8e4da'); b.flat('stone', Math.min(xa, xb), Math.max(xa, xb), side > 0 ? z0 : z1 - .2, side > 0 ? z0 + .2 : z1, .955);
    b.colour.set('#56605e');
    for (let x = along0 + 2; x < along1 - 1; x += 6) b.box('metal', side * x - .08, side * x + .08, .95, 3.6, (z0 + z1) / 2 - .08, (z0 + z1) / 2 + .08, 'b');
    b.box('metal', Math.min(xa, xb), Math.max(xa, xb), 3.6, 3.75, z0 - .4, z1 + .4, '');
    b.colour.setRGB(2.2, 2.3, 2.1);
    for (let x = along0 + 1.5; x < along1 - 1.5; x += 3) b.flat('lamp', side * x - .6, side * x + .6, (z0 + z1) / 2 - .06, (z0 + z1) / 2 + .06, 3.58, -1);
  }
  // Masts beyond the kerbs carry the contact wires over the road.
  for (const z of lines) {
    for (const x of [-(w + 3.4), w + 3.4]) if (x > x0 + 1 && x < x1 - 1) {
      b.colour.set('#4b4f4d'); b.box('metal', x - .11, x + .11, 0, 7.2, z + gauge / 2 + 1.25, z + gauge / 2 + 1.47, 'b');
      b.box('metal', x - .05, x + .05, 5.75, 5.85, z, z + gauge / 2 + 1.36, '');
    }
    const from = b.world(scratch.set(x0, 5.6, z)), to = b.world(other.set(x1, 5.6, z));
    wire(b, [from.x, from.y, from.z], [to.x, to.y, to.z]);
    const high = b.world(scratch.set(x0, 6.5, z)), far = b.world(other.set(x1, 6.5, z));
    wire(b, [high.x, high.y, high.z], [far.x, far.y, far.z], .35);
  }
  b.frame(0, 0, 0, 0);
}
const scratch = new THREE.Vector3(), other = new THREE.Vector3();

/**
 * A street tramway's double track down the middle of the road, as the Keihan Keishin line ran on Sanjō-dōri from the
 * Higashiōji corner to Keage until October 1997: grooved rails flush in the asphalt, a trolley wire over each track,
 * and span wires between kerbside poles every 30 m.
 */
function tramTrack(b: CityMeshBuilder, layout: PeriodCityLayout, g: Gallery, from: number, to: number): void {
  const lo = Math.max(from, g.from), hi = Math.min(to, g.to), gauge = 1.435, tracks = [-1.7, 1.7];
  for (let k = Math.ceil(lo / 5); k * 5 < hi; k++) {
    const p0 = k * 5, p1 = Math.min(g.to, p0 + 5);
    b.colour.set(RAIL);
    for (const centre of tracks) for (const side of [-1, 1]) {
      const l = centre + side * gauge / 2;
      beam(b, layout, 'metal', p0, p1, l - .04, l + .04, .0, .024);
    }
    for (const centre of tracks) wire(b, at(layout, p0, centre, 5.3), at(layout, p1, centre, 5.3));
    if (k % 6 === 0) {
      const w = poseAt(layout.course, p0).width;
      b.colour.set('#4b4f4d');
      for (const side of [-1, 1]) post(b, layout, 'metal', p0, side * (w + .75), .1, 0, 7.4);
      wire(b, at(layout, p0, -(w + .75), 6.4), at(layout, p0, w + .75, 6.4), .3);
      for (const centre of tracks) wire(b, at(layout, p0, centre, 6.1), at(layout, p0, centre, 5.3));
    }
  }
}

/** The road structures of [from, to) of the course. */
export function buildRoadStructures(b: CityMeshBuilder, layout: PeriodCityLayout, from: number, to: number): void {
  b.frame(0, 0, 0, 0);
  for (const g of layout.street.galleries ?? []) {
    if (g.to <= from || g.from >= to) continue;
    if (g.kind === 'rock-shed') rockShed(b, layout, g, from, to);
    else if (g.kind === 'viaduct') viaduct(b, layout, g, from, to);
    else tramTrack(b, layout, g, from, to);
  }
  for (const a of layout.street.arches ?? []) {
    if (a.p < from || a.p >= to) continue;
    if (a.kind === 'tied-arch') tiedArch(b, layout, a);
    else if (a.kind === 'rail-girder') railGirder(b, layout, a);
    else if (a.kind === 'level-crossing') levelCrossing(b, layout, a);
  }
  b.frame(0, 0, 0, 0);
}
