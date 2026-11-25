// Calibration probe for live RaceV1 races on the real roads (docs/live-races-real-roads.md, "Calibration still to do:
// rain and oil"). By default the probe uses the published kernels. --dry-damping tests an offline alternative.
// Run: npx tsx scripts/race-weather-check.ts [out-dir] [--dry-damping]
import { mkdirSync, writeFileSync } from 'node:fs';
import generated from '../src/game/generated/race-v1-kernels.json';
import { botControl, copyRace, createRace, raceFinished, speedForBendsAhead, stepRace as stepNativeRace, type RaceState } from '../src/game/engine';
import { stepTunedRace, STOCK_TUNE } from '../src/game/tuned-engine';
import { environmentAt, environmentContacts } from '../src/game/environment';
import { HELD_WHEEL_PUSH, bendForce } from '../src/game/race-roads';
import { CONTROL as C, RULES, TRACKS } from '../src/game/rules';

const args = process.argv.slice(2);
const dryDamping = args.includes('--dry-damping');
const paths = args.filter(arg => arg !== '--dry-damping');
if (paths.length > 1 || paths.some(path => path.startsWith('--'))) throw new Error('Usage: race-weather-check.ts [out-dir] [--dry-damping]');
const out = paths[0] ?? (dryDamping ? 'output/race-weather-dry-damping' : 'output/race-weather-check');
mkdirSync(out, { recursive: true });
type Env = (typeof generated.environment)[number] & { road: number[] };
const envs = generated.environment as Env[];
const original = envs.map(e => ({ rain: [...e.rain_pattern], wind: [...e.wind_pattern], road: e.road }));
type Weather = 'scheduled' | 'dry' | 'rain';
function setWeather(weather: Weather, opts: { windOff?: boolean; straight?: boolean } = {}): void {
  envs.forEach((e, i) => {
    e.rain_pattern = weather === 'scheduled' ? [...original[i]!.rain] : weather === 'dry' ? [0] : [1];
    e.wind_pattern = opts.windOff ? [0] : [...original[i]!.wind];
    e.road = opts.straight ? original[i]!.road.map(() => 0) : original[i]!.road;
  });
}
const rainingAt = (trackId: number, tick: number): boolean => {
  const e = envs[trackId]!; return e.rain_pattern[Math.floor(tick / e.rain_ticks) % e.rain_pattern.length] === 1;
};
const RAIL = 6520;
const rainTune = { ...STOCK_TUNE, wetDamping: STOCK_TUNE.dryDamping };
const oilPatches = TRACKS.map(track => environmentAt(track.id, 0).objects.filter(object => object.kind === 'oil'));
function stepRace(state: RaceState, inputs: readonly number[]): void {
  if (!dryDamping || !rainingAt(state.trackId, state.tick)) {
    stepNativeRace(state, inputs);
    return;
  }
  // Apply dry damping only to rain. The stock mirror keeps oil's 15/16 damping on an oil patch.
  const tunes = state.cars.map(car => oilPatches[state.trackId]!.some(patch =>
    Math.abs(car.progress - patch.progress) <= patch.halfLength && Math.abs(car.x - patch.x) <= patch.halfWidth,
  ) ? STOCK_TUNE : rainTune);
  stepTunedRace(state, inputs, tunes);
}

// ---- A. Steering authority: the steady lateral speed a held wheel (or drift) reaches, on a straight road. ----
function authority(weather: Weather, extra: number, speedTarget: number): { plateau: number; peak: number; ticksTo90: number; contacts: number } {
  setWeather(weather, { windOff: true, straight: true });
  const state = createRace(0, 2);
  let contacts = 0;
  // Accelerate both cars in their lanes up to the target speed, then hold it with throttle taps.
  while (state.cars[0]!.speed < speedTarget && state.tick < 3000) stepRace(state, [C.throttle, C.throttle]);
  state.cars[0]!.x = -6000; state.cars[0]!.vx = 0;
  const vx: number[] = [];
  for (let i = 0; i < 70 && !raceFinished(state); i++) {
    const hold = state.cars[0]!.speed < speedTarget ? C.throttle : 0;
    stepRace(state, [C.right | extra | hold, hold]);
    contacts += environmentContacts(state).filter(c => c.slot === 0).length;
    vx.push(state.cars[0]!.vx);
    if (state.cars[0]!.x >= RAIL - 200) break;
  }
  const peak = Math.max(...vx), plateau = vx.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, vx.length);
  return { plateau: Math.round(plateau), peak, ticksTo90: vx.findIndex(v => v >= 0.9 * peak) + 1, contacts };
}
const authorityRows: Record<string, unknown>[] = [];
for (const speed of [1000, 1600, 2200]) for (const [label, extra] of [['wheel', 0], ['drift', C.drift]] as const) {
  const dry = authority('dry', extra, speed), rain = authority('rain', extra, speed);
  authorityRows.push({ speed, input: label, dryPlateau: dry.plateau, rainPlateau: rain.plateau, ratio: +(rain.plateau / dry.plateau).toFixed(3), dryTicksTo90: dry.ticksTo90, rainTicksTo90: rain.ticksTo90, contacts: dry.contacts + rain.contacts });
}
setWeather('scheduled');

// ---- Drivers ----
type Driver = (state: RaceState, slot: number, history: RaceState[]) => number;
/** engine.ts botControl with the bend-speed planning scaled: scale 1 is the stock bot. */
function scaledBot(scale: (state: RaceState) => number): Driver {
  return (state, slot) => {
    const s = scale(state);
    if (s === 1) return botControl(state, slot);
    const car = state.cars[slot]!;
    let target = ((slot % 3) - 1) * 2900;
    for (const other of state.cars) {
      const dz = other.progress - car.progress;
      if (other.slot === slot || other.finishTick !== null || other.dnf) continue;
      if (dz > 0 && dz < 14500 && Math.abs(other.x - target) < 2100) target = car.x <= other.x ? other.x - 2600 : other.x + 2600;
      if (Math.abs(dz) < 6000 && Math.abs(other.x - car.x) < 2400) target = car.x + (car.x < other.x || car.x === other.x && slot < other.slot ? -3000 : 3000);
    }
    target = Math.max(-4800, Math.min(4800, target));
    const push = bendForce(state.trackId, car.progress, car.speed);
    const expectedX = car.x + car.vx * 5 + push * 5;
    const limit = speedForBendsAhead(state.trackId, car.progress, car.speed, HELD_WHEEL_PUSH * 0.9 * s);
    let input = car.speed > limit + 20 ? C.brake : car.speed + 40 > limit ? 0 : C.throttle;
    if (expectedX > target + 180) input |= C.left;
    if (expectedX < target - 180) input |= C.right;
    if (Math.abs(push) > 90 && Math.abs(expectedX - target) > 1200) input |= C.drift;
    if (Math.abs(push) < 30 && limit >= 2400 && car.energy > 500 && (state.tick + slot * 79) % 370 < 65) input |= C.boost;
    return input;
  };
}
const stock: Driver = (state, slot) => botControl(state, slot);
/** A slower human-like keyboard driver: it sees the race `delay` ticks late, plans bends with 75% of the held wheel,
 * and never drifts or boosts. */
function rookie(delay: number): Driver {
  const planner = scaledBot(() => 0.75);
  return (state, slot, history) => {
    const seen = history.length > delay ? history[history.length - 1 - delay]! : state;
    return planner(seen, slot, history) & ~(C.drift | C.boost);
  };
}

// ---- B-E. Races ----
interface CarReport { slot: number; driver: string; finishTick: number | null; railTicks: number; railHits: number; oil: number; signs: number; trees: number; oilThenRail: number; maxAbsVxAfterOil: number }
function race(trackId: number, weather: Weather, drivers: { name: string; drive: Driver }[]): { cars: CarReport[]; rainTicks: number; ticks: number } {
  setWeather(weather);
  const state = createRace(trackId, drivers.length);
  const history: RaceState[] = [];
  const reports: CarReport[] = drivers.map((d, slot) => ({ slot, driver: d.name, finishTick: null, railTicks: 0, railHits: 0, oil: 0, signs: 0, trees: 0, oilThenRail: 0, maxAbsVxAfterOil: 0 }));
  const atRail = drivers.map(() => false), lastOil = drivers.map(() => -1e9);
  let rainTicks = 0;
  while (!raceFinished(state)) {
    history.push(copyRace(state)); if (history.length > 40) history.shift();
    const inputs = drivers.map((d, slot) => state.cars[slot]!.finishTick === null ? d.drive(state, slot, history) : 0);
    if (rainingAt(trackId, state.tick)) rainTicks++;
    stepRace(state, inputs);
    for (const c of environmentContacts(state)) {
      const r = reports[c.slot]!;
      if (c.kind === 'oil') { r.oil++; lastOil[c.slot] = state.tick; } else if (c.kind === 'sign') r.signs++; else r.trees++;
    }
    state.cars.forEach((car, slot) => {
      const r = reports[slot]!, rail = car.finishTick === null && Math.abs(car.x) >= RAIL - 1;
      if (rail) r.railTicks++;
      if (rail && !atRail[slot]) { r.railHits++; if (state.tick - lastOil[slot]! <= 90) r.oilThenRail++; }
      atRail[slot] = rail;
      if (state.tick - lastOil[slot]! <= 30) r.maxAbsVxAfterOil = Math.max(r.maxAbsVxAfterOil, Math.abs(car.vx));
    });
  }
  state.cars.forEach((car, slot) => { reports[slot]!.finishTick = car.finishTick; });
  return { cars: reports, rainTicks, ticks: state.tick };
}
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)]! : NaN; };
const sec = (t: number | null): string => t === null ? 'DNF' : (t / RULES.hz).toFixed(1);
function summarize(label: string, result: ReturnType<typeof race>) {
  const finished = result.cars.filter(c => c.finishTick !== null).map(c => c.finishTick!);
  const sum = (k: keyof CarReport) => result.cars.reduce((a, c) => a + (c[k] as number), 0);
  return { label, cars: result.cars.length, finished: finished.length, best: sec(Math.min(...finished)), median: sec(median(finished)), worst: sec(Math.max(...finished)),
    railHits: sum('railHits'), railTicks: sum('railTicks'), oil: sum('oil'), oilThenRail: sum('oilThenRail'), signs: sum('signs'), rainShare: +(result.rainTicks / result.ticks).toFixed(2) };
}

const eight = (name: string, drive: Driver) => Array.from({ length: 8 }, () => ({ name, drive }));
const raceRows: Record<string, unknown>[] = [];
const rainAware: Driver = scaledBot(state => {
  // Plans bends for the push a held wheel actually balances in the current weather (the authority probe's ratio).
  return rainingAt(state.trackId, state.tick) ? rainRatio : 1;
});
const wheelAt1600 = authorityRows.find(r => r.speed === 1600 && r.input === 'wheel')!;
const rainRatio = (wheelAt1600.ratio as number);
for (const trackId of [0, 1, 2]) {
  const name = TRACKS[trackId]!.name;
  for (const weather of ['scheduled', 'dry', 'rain'] as const) raceRows.push({ track: name, weather, driver: 'stock bot ×8', ...summarize(`${name} ${weather} stock`, race(trackId, weather, eight('stock', stock))) });
  raceRows.push({ track: name, weather: 'rain', driver: 'rain-aware bot ×8', ...summarize(`${name} rain aware`, race(trackId, 'rain', eight('rain-aware', rainAware))) });
  raceRows.push({ track: name, weather: 'scheduled', driver: 'rain-aware bot ×8', ...summarize(`${name} scheduled aware`, race(trackId, 'scheduled', eight('rain-aware', rainAware))) });
  for (const delay of [6, 12]) raceRows.push({ track: name, weather: 'scheduled', driver: `rookie d${delay} ×8`, ...summarize(`${name} rookie ${delay}`, race(trackId, 'scheduled', eight(`rookie${delay}`, rookie(delay)))) });
  raceRows.push({ track: name, weather: 'rain', driver: 'rookie d12 ×8', ...summarize(`${name} rookie rain`, race(trackId, 'rain', eight('rookie12', rookie(12)))) });
}
setWeather('scheduled');

const report = { generatedAt: new Date().toISOString(), rules: RULES, heldWheelPush: HELD_WHEEL_PUSH, authority: authorityRows, races: raceRows,
  notes: [
    dryDamping ? 'Offline dry-damping candidate: wet ticks use the stock TypeScript mirror with 14/16 damping except on oil. No generated kernels change.'
      : 'Kernels are the bundled native RaceV1 kernels (src/game/generated/race-v1-kernels.json), unchanged.',
    'Weather is forced by swapping the rain/wind schedule the kernel runtime reads; the steering probe also swaps the bend table for zeros (a straight road) and turns wind off.',
    'rain-aware bot = engine.ts botControl planning bends for the held-wheel push scaled by the measured rain/dry plateau ratio while it rains.',
    'rookie = the bot seeing the race 6 or 12 ticks late, planning bends at 75% of the held wheel, never drifting or boosting.',
  ] };
writeFileSync(`${out}/racev1-weather.json`, `${JSON.stringify(report, null, 1)}\n`);
console.log('Steering authority (lateral mm/tick a held input settles at, straight road, no wind):');
console.table(authorityRows);
console.log('Races (8 cars each):');
console.table(raceRows.map(({ label, cars, ...rest }) => rest));
