import { readFile, writeFile } from 'node:fs/promises';
import { TRACKS } from '../src/game/rules';

/** The Arcade courses' roads, from the real roads they are set on (world/research/arcade/README.md). Each course is
 * three laps drawn end to end, so its whole length follows one stretch of real road at true scale: progress p on the
 * course is `startM + p` metres along the traced road. Writes src/game/generated/arcade-roads.json, which the driving
 * model and the 3D world both read (src/game/arcade-geography.ts): the road's height every 20 m and its plan (its
 * heading every 5 m), so the local races take the real road's bends and hairpins as well as its hills.
 *
 * Usage: tsx scripts/build-arcade-geography.ts [--check]
 */
const COURSES = [
  { track: 0, road: 'hakone-route-1', startM: 200 },
  // From Sakuragichō station; the first trace started past Bankoku-bashi, on a route with two side streets in it.
  { track: 1, road: 'yokohama-waterfront', startM: 100 },
  { track: 2, road: 'nikko-route-119-120', startM: 100 },
] as const;
/** The world draws 100 m of road before the line and up to 500 m beyond the finish, as far as the traced road goes
 * (Yokohama's ends at Honmoku's D pier, 300 m on). */
const LEAD = 100, RUNOFF = 500, STEP = 20;
/** The plan is a heading every 5 m, smoothed over σ 7.5 m (OpenStreetMap draws a curve as straight pieces 10–30 m
 * long) and eased to no tighter than a 15 m radius at the centre line, the tightest a 12 m road turns on. */
const PLAN_STEP = 5, PLAN_SIGMA = 7.5, MIN_RADIUS = 15;
/** Two stretches of the course nearer than this (centre line to centre line) would share asphalt. */
const LEG_CLEARANCE = 24;
const OUTPUT = 'src/game/generated/arcade-roads.json';
const EARTH = 6371008.8, RAD = Math.PI / 180, TAU = Math.PI * 2;

interface TracedRoad { id: string; lengthM: number; stations: [number, number, number, number][] }

/** A graded road surface from ground heights sampled every 5 m along a mapped centreline. The mapped line strays a
 * few metres onto cut walls and fills, and the elevation model shows the river bed under a bridge, not its deck
 * (Nikko's Arasawa bridge: 16 m down for 40 m). A 35 m median drops the strays, a closing over 100 m spans the
 * bridges, and a Gaussian (σ 30 m) leaves the vertical curves a road is built with, so a car at speed feels the hill
 * and not the survey. */
function graded(ground: readonly number[]): number[] {
  const known = ground.map(v => Number.isNaN(v) ? null : v);
  // Open water has no data: carry the nearest land across it.
  for (let i = 0, last: number | null = null; i < known.length; i++) { if (known[i] === null) known[i] = last; else last = known[i]!; }
  for (let i = known.length - 1, last: number | null = null; i >= 0; i--) { if (known[i] === null) known[i] = last; else last = known[i]!; }
  const filled = known.map(v => v ?? 0);
  const median = filled.map((_, i) => { const window = filled.slice(Math.max(0, i - 3), i + 4).sort((a, b) => a - b); return window[window.length >> 1]!; });
  const span = 10;   // stations of 5 m either side
  const extreme = (values: readonly number[], pick: (...numbers: number[]) => number) =>
    values.map((_, i) => pick(...values.slice(Math.max(0, i - span), i + span + 1)));
  const decked = extreme(extreme(median, Math.max), Math.min);
  return gaussian(decked, 6);
}

/** A Gaussian over samples (σ in samples), holding the end values beyond either end. */
function gaussian(values: readonly number[], sigma: number): number[] {
  const reach = Math.ceil(sigma * 3), weights = Array.from({ length: 2 * reach + 1 }, (_, j) => Math.exp(-((j - reach) ** 2) / (2 * sigma * sigma)));
  return values.map((_, i) => {
    let sum = 0, weight = 0;
    for (let j = -reach; j <= reach; j++) {
      const w = weights[j + reach]!, k = Math.min(values.length - 1, Math.max(0, i + j));
      sum += values[k]! * w; weight += w;
    }
    return sum / weight;
  });
}

/** The road's heading (rad, clockwise from north, unwrapped) at every 5 m station of the trace: each station takes the
 * bearing of the 5 m that follow it, smoothed, then eased wherever it turns tighter than MIN_RADIUS. Easing spreads a
 * corner's turn onto its neighbours and keeps the total, so the road still leaves the corner on its real bearing. */
function headings(traced: TracedRoad): number[] {
  const [, lat0, lon0] = traced.stations[0]!, scale = Math.cos(lat0 * RAD);
  const at = traced.stations.map(([, lat, lon]) => [(lon - lon0) * RAD * scale * EARTH, (lat - lat0) * RAD * EARTH] as const);
  const raw: number[] = [];
  for (let i = 0; i + 1 < at.length; i++) {
    let bearing = Math.atan2(at[i + 1]![0] - at[i]![0], at[i + 1]![1] - at[i]![1]);
    if (raw.length) bearing += TAU * Math.round((raw.at(-1)! - bearing) / TAU);
    raw.push(bearing);
  }
  raw.push(raw.at(-1)!);
  const smooth = gaussian(raw, PLAN_SIGMA / PLAN_STEP), limit = PLAN_STEP / MIN_RADIUS;
  for (let pass = 0; pass < 100000; pass++) {
    let eased = false;
    for (let i = 1; i + 1 < smooth.length; i++) {
      if (Math.abs(smooth[i + 1]! - smooth[i]!) <= limit && Math.abs(smooth[i]! - smooth[i - 1]!) <= limit) continue;
      smooth[i] = (smooth[i - 1]! + smooth[i]! + smooth[i + 1]!) / 3; eased = true;
    }
    if (!eased) break;
  }
  return smooth;
}

const courses = [];
for (const { track, road, startM } of COURSES) {
  const traced = JSON.parse(await readFile(`world/research/arcade/${road}.road.json`, 'utf8')) as TracedRoad;
  const surface = graded(traced.stations.map(station => station[3]));
  const length = TRACKS[track]!.length / 1000 * 3, available = (traced.stations.length - 1) * 5 - startM - length;
  const runoff = Math.min(RUNOFF, Math.floor(available / STEP) * STEP);
  if (runoff < 200 || startM < LEAD) throw new Error(`${road}: the traced road must run ${LEAD} m before the line and 200 m past the finish`);
  // Linear between 5 m stations; held level beyond either end of the traced road.
  const at = (distance: number) => {
    const x = Math.min(surface.length - 1, Math.max(0, distance / 5)), i = Math.min(surface.length - 2, Math.floor(x));
    return surface[i]! + (surface[i + 1]! - surface[i]!) * (x - i);
  };
  const base = at(startM), heightsCm: number[] = [];
  for (let p = -LEAD; p <= length + runoff; p += STEP) heightsCm.push(Math.round((at(startM + p) - base) * 100));
  let steepest = 0;
  for (let i = 1; i < heightsCm.length; i++) steepest = Math.max(steepest, Math.abs(heightsCm[i]! - heightsCm[i - 1]!) / 100 / STEP);
  // The plan, every 5 m from the lead-in to the end of the run-off, turned so the start line heads along +0.
  const bearings = headings(traced), first = (startM - LEAD) / PLAN_STEP, start = startM / PLAN_STEP, zero = bearings[start]!;
  const headingsE5 = bearings.slice(first, (startM + length + runoff) / PLAN_STEP + 1).map(h => Math.round((h - zero) * 1e5));
  // Check the plan: the tightest bend, and no two stretches of road on top of each other.
  let tightest = Infinity, turning = 0;
  const xs = [0], zs = [0];
  for (let i = 1; i < headingsE5.length; i++) {
    const turn = (headingsE5[i]! - headingsE5[i - 1]!) / 1e5;
    if (turn) tightest = Math.min(tightest, PLAN_STEP / Math.abs(turn));
    turning += Math.abs(turn);
    xs.push(xs[i - 1]! + Math.sin(headingsE5[i - 1]! / 1e5) * PLAN_STEP); zs.push(zs[i - 1]! + Math.cos(headingsE5[i - 1]! / 1e5) * PLAN_STEP);
  }
  let closest = Infinity, closestAt = 0;
  for (let i = 0; i < xs.length; i++) for (let j = i + 20; j < xs.length; j++) {
    const d = Math.hypot(xs[i]! - xs[j]!, zs[i]! - zs[j]!);
    // A bend turns back on itself only beyond 80 m of road; nearer stations are one stretch.
    if ((j - i) * PLAN_STEP > 80 && d < closest) { closest = d; closestAt = i * PLAN_STEP - LEAD; }
  }
  if (tightest < MIN_RADIUS * 0.99) throw new Error(`${road}: a bend of ${tightest.toFixed(1)} m radius`);
  if (closest < LEG_CLEARANCE) throw new Error(`${road}: two stretches ${closest.toFixed(1)} m apart near ${closestAt} m`);
  // Where the course lies in the real world, every 250 m: far scenery takes its bearings from these.
  const axis: [number, number, number][] = [];
  for (let p = 0; p <= length; p += 250) {
    const station = traced.stations[Math.min(traced.stations.length - 1, Math.round((startM + p) / 5))]!;
    axis.push([p, station[1], station[2]]);
  }
  const origin = traced.stations[start]!;
  courses.push({ track, road, startM, lengthM: length, runoffM: runoff, startElevationM: +base.toFixed(1), finishElevationM: +(at(startM + length)).toFixed(1),
    steepestGrade: +steepest.toFixed(4), heightsCm, origin: [origin[1], origin[2]], bearingDeg: +((zero / RAD % 360 + 360) % 360).toFixed(2),
    tightestRadiusM: +tightest.toFixed(1), turningDeg: Math.round(turning / RAD), closestLegsM: +closest.toFixed(1), headingsE5, axis });
  console.log(`${TRACKS[track]!.name}: ${road} from ${startM} m, ${base.toFixed(0)} m → ${at(startM + length).toFixed(0)} m, steepest `
    + `${(steepest * 100).toFixed(1)}% over ${STEP} m; bends ${Math.round(turning / RAD)}°, tightest ${tightest.toFixed(1)} m radius, `
    + `nearest other stretch ${closest.toFixed(0)} m (at ${closestAt} m); run-off ${runoff} m`);
}
const text = `${JSON.stringify({ version: 2, stepM: STEP, firstM: -LEAD, planStepM: PLAN_STEP, courses })}\n`;
if (process.argv.includes('--check')) {
  if (await readFile(OUTPUT, 'utf8').catch(() => '') !== text) throw new Error(`${OUTPUT} is out of date: run tsx scripts/build-arcade-geography.ts`);
  console.log(`${OUTPUT} is current.`);
} else { await writeFile(OUTPUT, text); console.log(`wrote ${OUTPUT}`); }
