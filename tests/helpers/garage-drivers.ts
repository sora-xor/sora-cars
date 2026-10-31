import {
  TECH_NODES, applyAward, buyPart, fieldRivals, fitPart, garageTune, newGarage, partState, raceAward, storyRivals, techNode,
  type FieldId, type GarageSave, type PartAudience, type Rival, type TechNode,
} from '../../src/game/garage-tech';
import { CONTROL } from '../../src/game/rules';
import { CHAPTERS, chapterPosition, storyObjectiveMet } from '../../src/game/story';
import { nextPick } from '../../src/game/story-pit';
import { STOCK_TUNE, type CarTune } from '../../src/game/tuned-engine';
import { DRIVER_SKILLS, DriveAI } from '../../src/game/drive/ai';
import { courseGap, sampleCourse } from '../../src/game/drive/course';
import { atan2, clamp, sin } from '../../src/game/drive/dmath';
import { DriveStatus, steerTick, steeringCurvature, type DriveCar, type DriveRace } from '../../src/game/drive/race';
import { arcadeDriveRace } from '../../src/game/drive/setup';

/** Garage balance reference drivers on the local driving model. Rookie and
 * regular are keyboard players: they steer from what the car did a moment ago,
 * aim a little ahead, read bends imperfectly, tap keys rather than hold a
 * steady angle, lift or brake when they run wide and keep their own boost
 * habits. Seeds vary their lane, judgement and lapses. Club, pro and ace are
 * the shipped DriveAI opponents.
 */
export type DriverProfile = 'rookie' | 'regular' | 'club' | 'pro' | 'ace';
export const PROFILES: readonly DriverProfile[] = ['rookie', 'regular', 'club', 'pro', 'ace'];
/** The drivers each `bestFor` tag promises to help. */
export const AUDIENCE_PROFILES: Readonly<Record<PartAudience, readonly DriverProfile[]>> = {
  everyone: PROFILES, boost: ['rookie', 'regular', 'pro', 'ace'], drift: ['ace'],
  recovery: ['rookie', 'regular'], traffic: ['regular', 'club', 'pro'], clean: ['pro', 'ace'],
};

export interface HumanStyle {
  /** Perception lag (ticks): the driver steers from what the car did this long ago. */
  readonly delay: number;
  /** Seconds ahead the driver aims. */
  readonly preview: number;
  /** Share of the bend ahead the driver allows for; the rest becomes a wide line. */
  readonly anticipation: number;
  /** Steering-position error tolerated before pressing a key. */
  readonly deadband: number;
  /** Ticks between steering decisions: a key stays pressed or released at least this long. */
  readonly cadence: number;
  /** Chance per 40 m of a lapse that doubles the lag. Tied to the road, so before-and-after runs share them. */
  readonly lapse: number;
  /** Fire the boost on a straight only with a full tank, or from 80% of one. */
  readonly boost: 'full' | 'straights';
  /** Seconds of look-ahead in which heading for the outside rail of a bend makes the driver lift, then brake. */
  readonly panic: number;
}
export const HUMAN_STYLES: Readonly<Record<'rookie' | 'regular', HumanStyle>> = {
  rookie: { delay: 6, preview: 1, anticipation: 0.8, deadband: 0.22, cadence: 3, lapse: 0.08, boost: 'full', panic: 0.5 },
  regular: { delay: 5, preview: 0.9, anticipation: 0.85, deadband: 0.12, cadence: 2, lapse: 0.05, boost: 'straights', panic: 0.35 },
};

const hash = (a: number, b: number, c: number) => {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

interface Seen { readonly s: number; readonly d: number; readonly psi: number; readonly u: number }
export class HumanDriver {
  readonly #seen: Seen[] = [];
  readonly #lane: number; readonly #anticipation: number; readonly #deadband: number;
  #steer = 0; #next = 0; #stuck = 0; #reverse = 0; #pass: { slot: number; side: number } | null = null;
  constructor(readonly style: HumanStyle, readonly slot: number, readonly seed: number) {
    this.#lane = [-2, 0, 2][Math.floor(hash(seed, slot, 7) * 3)]!;
    this.#anticipation = style.anticipation * (0.9 + 0.2 * hash(seed, slot, 11));
    this.#deadband = style.deadband * (0.8 + 0.4 * hash(seed, slot, 13));
  }
  control(race: DriveRace): number {
    const car = race.cars[this.slot]!, spec = race.specs[this.slot]!, style = this.style, course = race.course;
    if (car.status !== DriveStatus.Racing || race.done) return 0;
    this.#seen.push({ s: car.s, d: car.d, psi: car.psi, u: car.u });
    if (this.#seen.length > style.delay * 2 + 1) this.#seen.shift();
    // Stuck against a rail or facing backwards: back out, as anyone would.
    if (this.#reverse > 0) { this.#reverse--; return CONTROL.brake | (car.psi > 0 ? CONTROL.right : CONTROL.left); }
    if (race.tick > 60 && (car.u < 1.5 || Math.abs(car.psi) > 1.9)) this.#stuck++; else this.#stuck = 0;
    if (this.#stuck > 45) { this.#stuck = 0; this.#reverse = 30; return CONTROL.brake; }
    const lapse = hash(Math.floor(car.s / 40), this.slot, this.seed) < style.lapse;
    const seen = this.#seen[Math.max(0, this.#seen.length - 1 - (lapse ? style.delay * 2 : style.delay))]!, speed = Math.max(seen.u, 0);
    // The point the driver aims at, and the bend they see before it.
    const L = clamp(speed * style.preview, 10, 120);
    let bend = 0;
    for (let k = 1; k <= 4; k++) bend += sampleCourse(course, seen.s + L * k / 4).kappa / 4;
    const width = sampleCourse(course, car.s + L).halfWidth - 1.4;
    // The nearest car in the way: pick a side to pass it and stick to it.
    let target = this.#lane, ahead: DriveCar | null = null, aheadGap = Infinity;
    for (const other of race.cars) {
      if (other === car || !race.solid(other)) continue;
      const gap = courseGap(course, car.s, other.s);
      if (gap > 0 && gap < Math.max(14, car.u * 0.8) && gap < aheadGap && (Math.abs(other.d - target) < 2.1 || Math.abs(other.d - car.d) < 2.1)) { ahead = other; aheadGap = gap; }
    }
    if (ahead) {
      if (this.#pass?.slot !== ahead.slot) {
        const left = ahead.d - 2.7, right = ahead.d + 2.7;
        this.#pass = { slot: ahead.slot, side: left < -width ? 1 : right > width ? -1 : car.d <= ahead.d ? -1 : 1 };
      }
      target = ahead.d + this.#pass.side * 2.7;
    } else this.#pass = null;
    // Room for a car alongside.
    for (const other of race.cars) {
      if (other === car || !race.solid(other) || Math.abs(courseGap(course, car.s, other.s)) >= 5 || Math.abs(other.d - car.d) >= 2.3) continue;
      target = other.d > car.d ? Math.min(target, other.d - 2.4) : Math.max(target, other.d + 2.4);
    }
    target = clamp(target, -width, width);
    const angle = atan2(target + 0.5 * this.#anticipation * bend * L * L - seen.d, L) - seen.psi;
    const desired = clamp(2 * sin(angle) / L / steeringCurvature(spec, Math.max(seen.u, 0.1), speed), -1, 1);
    // Keys, every few ticks: the one that keeps the wheel nearest the angle wanted.
    if (race.tick >= this.#next && Math.abs(desired - car.steer) > this.#deadband) {
      this.#next = race.tick + style.cadence;
      let best = Infinity;
      for (const [bit, aim] of [[0, 0], [CONTROL.left, -1], [CONTROL.right, 1]] as const) {
        let wheel = car.steer, error = 0;
        for (let t = 0; t < style.cadence; t++) { wheel = steerTick(wheel, aim, car.u); error += Math.abs(wheel - desired); }
        if (error < best - 1e-9) { best = error; this.#steer = bit; }
      }
    }
    let input = this.#steer | CONTROL.throttle;
    // Heading for the outside rail of a bend: lift, and brake when it is close.
    const rail = sampleCourse(course, car.s).halfWidth + course.railOffset - spec.halfWidth;
    const soon = seen.d + speed * sin(seen.psi) * style.panic, outside = bend !== 0 && soon * bend < 0 && car.u > 30;
    if (outside && Math.abs(soon) > rail - 0.8) input &= ~CONTROL.throttle;
    if (outside && Math.abs(soon) > rail + 0.5) input |= CONTROL.brake;
    // Boost habits, never straight into the back of a car.
    const clear = !race.cars.some(other => other !== car && race.solid(other) && Math.abs(other.d - car.d) < 2.2
      && courseGap(course, car.s, other.s) > 0 && courseGap(course, car.s, other.s) < 35);
    if (input & CONTROL.throttle && clear && (car.boosting ? car.energy >= spec.boostCost * 2
      : Math.abs(bend) < 0.0015 && car.energy >= (style.boost === 'full' ? 1000 - spec.boostRecharge * 2 : 800))) input |= CONTROL.boost;
    return input;
  }
}

/** AI lanes, as main.ts spreads a field across the road. */
const LANES = [0, 0.5, -0.5, 1, -0.3, -1, 0.3, 0.8];
function driver(profile: DriverProfile, slot: number, seed: number, ai: DriveAI): (race: DriveRace) => number {
  if (profile === 'rookie' || profile === 'regular') { const human = new HumanDriver(HUMAN_STYLES[profile], slot, seed); return race => human.control(race); }
  return race => ai.control(race, slot);
}

export interface GarageRun {
  /** Race time in ticks. A wreck or a timeout counts as the time limit plus the distance left at stock top speed. */
  readonly ticks: number;
  readonly wrecked: boolean;
  readonly damage: number;
  /** Rail, car and sign hits above 4 m/s of delta-v, as the clean-run bonus counts them. */
  readonly impacts: number;
  readonly place: number;
  /** Every car's race time and place, by slot: final only when the race ran to the end. */
  readonly field: readonly number[];
  readonly places: readonly number[];
}
function raceTicks(race: DriveRace, slot: number): number {
  const car = race.cars[slot]!;
  return car.status === DriveStatus.Finished ? car.finishTime : race.course.maxTicks + (race.course.finish - car.s) / (STOCK_TUNE.topSpeed * 0.03);
}
function finish(race: DriveRace, slot: number, impacts: number): GarageRun {
  const car = race.cars[slot]!, places = race.ranking();
  return { ticks: raceTicks(race, slot), wrecked: car.status === DriveStatus.Wrecked, damage: car.damage.total, impacts,
    place: places[slot]!, field: race.cars.map(other => raceTicks(race, other.slot)), places };
}

/** A time trial on a clear road: the test car alone beside a parked stock car on the grid. */
export function soloRace(trackId: number, profile: DriverProfile, tune: CarTune, seed = 0): GarageRun {
  const race = arcadeDriveRace(trackId, [tune, STOCK_TUNE]);
  const ai = new DriveAI([{ ...DRIVER_SKILLS[profile === 'rookie' || profile === 'regular' ? 'club' : profile], lane: 0 }, DRIVER_SKILLS.club]);
  const drive = driver(profile, 0, seed, ai);
  let impacts = 0;
  while (!race.done && race.cars[0]!.status === DriveStatus.Racing) {
    race.step([drive(race), 0]);
    impacts += race.events.filter(event => event.slot === 0 && (event.kind === 'wall' || event.kind === 'car' || event.kind === 'prop') && event.strength > 4).length;
  }
  return finish(race, 0, impacts);
}

/** An eight-car garage race: the test driver in `slot`, everyone else from `rivals` (a club night by default).
 * It runs until the test car is done, unless `full` asks for every car's finish. */
export function packRace(trackId: number, slot: number, profile: DriverProfile, tune: CarTune, seed = 0, rivals: readonly (Rival | null)[] = fieldRivals('club', 8, slot), full = false): GarageRun {
  const tunes = rivals.map((rival, index) => index === slot ? tune : rival?.tune ?? STOCK_TUNE);
  const race = arcadeDriveRace(trackId, tunes);
  const ai = new DriveAI(rivals.map((rival, index) => ({ ...DRIVER_SKILLS[index === slot && profile !== 'rookie' && profile !== 'regular' ? profile : rival?.skill ?? 'club'], lane: LANES[index]! })));
  const drive = driver(profile, slot, seed, ai);
  let impacts = 0;
  while (!race.done && (full || race.cars[slot]!.status === DriveStatus.Racing)) {
    race.step(race.cars.map(car => car.slot === slot ? drive(race) : ai.control(race, car.slot)));
    impacts += race.events.filter(event => event.slot === slot && (event.kind === 'wall' || event.kind === 'car' || event.kind === 'prop') && event.strength > 4).length;
  }
  return finish(race, slot, impacts);
}

/** A part's prerequisites, taking the first option wherever a fork must be owned. */
export function partContext(id: string): string[] {
  const owned = new Set<string>();
  const add = (part: string) => {
    if (owned.has(part)) return;
    const node = techNode(part)!;
    node.requires.forEach(add);
    if (node.requiresAny && !node.requiresAny.some(req => owned.has(req))) add(node.requiresAny[0]!);
    owned.add(part);
  };
  const node = techNode(id)!;
  node.requires.forEach(add);
  if (node.requiresAny) add(node.requiresAny[0]!);
  return [...owned];
}
/** Parts a garage holding `owned` could buy next, money aside. */
export const purchasable = (owned: readonly string[]): TechNode[] => TECH_NODES.filter(node => !owned.includes(node.id)
  && node.requires.every(id => owned.includes(id)) && (!node.requiresAny || node.requiresAny.some(id => owned.includes(id)))
  && !(node.fork && owned.some(id => techNode(id)!.fork === node.fork)));
export const mean = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;
/** Mean of the middle half: a spin or a wreck in one run does not swamp the rest. */
export function interquartileMean(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b), cut = Math.floor(sorted.length / 4);
  return mean(sorted.length > 3 ? sorted.slice(cut, sorted.length - cut) : sorted);
}

/** Whether an Arcade story chapter's objective is met from the player's slot, with tuned or equal rivals. `chapter` is its id. */
export function storyRace(chapter: number, profile: DriverProfile, tune: CarTune, seed = 0, equalCars = false): { run: GarageRun; cleared: boolean } {
  const index = chapterPosition(chapter);
  const rivals = equalCars ? fieldRivals('club', 8, 6) : storyRivals(chapter, 8, 6);
  const run = packRace(CHAPTERS[index]!.trackId!, 6, profile, tune, seed, rivals, true);
  return { run, cleared: storyObjectiveMet(index, run.place, run.places[7]) };
}

/** How a player spends at each pre-race garage: the crew's picks, nothing at all,
 * or a casual habit of buying the cheapest or the priciest part on offer. */
export type SpendPolicy = 'picks' | 'stock' | 'cheapest' | 'priciest';
export interface Campaign {
  /** Races per Arcade chapter until its objective was met; `limit + 1` marks a chapter never cleared. */
  readonly tries: readonly number[];
  /** First try per chapter: ticks ahead of the faster of the two non-crew cars (negative behind). */
  readonly leads: readonly number[];
  readonly spent: number;
}
/** Retries before a campaign counts a chapter as a wall. */
export const STORY_TRIES = 15;
/** Plays the story's Arcade chapters from a new garage, as main.ts runs them: pre-race garage, race, prize money, retry until cleared. */
export function storyCampaign(profile: DriverProfile, seed: number, policy: SpendPolicy, limit = STORY_TRIES): Campaign {
  let save = newGarage();
  const tries: number[] = [], leads: number[] = [];
  for (const [index, chapter] of CHAPTERS.entries()) {
    // Street-race chapters run equal cars for no prize money: they neither spend nor earn.
    if (chapter.trackId === undefined) continue;
    let races = 0, cleared = false;
    while (!cleared && races < limit) {
      for (let part = shoppingChoice(save, chapter.trackId, policy); part; part = shoppingChoice(save, chapter.trackId, policy)) {
        save = partState(save, part.id) === 'stored' ? fitPart(save, part.id) : buyPart(save, part.id);
      }
      const run = packRace(chapter.trackId, 6, profile, garageTune(save), seed * 1000 + chapter.id * 20 + races, storyRivals(chapter.id, 8, 6), true);
      cleared = storyObjectiveMet(index, run.place, run.places[7]);
      if (!races) leads.push(Math.min(run.field[5]!, run.field[7]!) - run.ticks);
      save = applyAward(save, raceAward(save, { place: run.place, cars: 8, field: null, chapter: chapter.id, objective: cleared, clean: run.impacts === 0 }), chapter.id);
      races++;
    }
    tries.push(cleared ? races : limit + 1);
  }
  return { tries, leads, spent: save.earned + 12000 - save.money };
}
function shoppingChoice(save: GarageSave, trackId: number, policy: SpendPolicy): TechNode | null {
  if (policy === 'stock') return null;
  if (policy === 'picks') { const pick = nextPick(save, trackId); return pick && ['available', 'stored'].includes(partState(save, pick.id)) ? pick : null; }
  const open = TECH_NODES.filter(node => partState(save, node.id) === 'available').sort((a, b) => policy === 'cheapest' ? a.cost - b.cost : b.cost - a.cost);
  return open[0] ?? null;
}
/** Finishing place in a practice field from the usual player slot. */
export const fieldPlace = (field: FieldId, trackId: number, profile: DriverProfile, tune: CarTune, seed = 0): number =>
  packRace(trackId, 6, profile, tune, seed, fieldRivals(field, 8, 6)).place;
