import { createRace, raceFinished, rankCars, type RaceState } from '../../src/game/engine';
import { environmentContacts } from '../../src/game/environment-events';
import { garageBotControl, type DriverSkill } from '../../src/game/garage-ai';
import {
  TECH_NODES, applyAward, buyPart, fieldRivals, fitPart, garageTune, newGarage, partState, raceAward, storyRivals, techNode, tuneFor,
  type FieldId, type GarageSave, type PartAudience, type Rival, type TechNode,
} from '../../src/game/garage-tech';
import { nextPick } from '../../src/game/story-pit';
import { CONTROL as C, RULES, TRACKS, curvature } from '../../src/game/rules';
import { CHAPTERS, chapterPosition, storyObjectiveMet } from '../../src/game/story';
import { STOCK_TUNE, stepTunedRace, type CarTune } from '../../src/game/tuned-engine';

/** Balance reference drivers. A rookie corrects late, ignores corner push,
 * loses concentration in short spells and fires the turbo whenever it is full.
 * A regular reads corners a little, slips up less often and saves boost for
 * straights. Seeds vary both, so outcomes form a distribution rather than one
 * race. Club, pro and ace are the shipped opponent drivers.
 */
export type DriverProfile = DriverSkill | 'rookie' | 'regular';
export const PROFILES: readonly DriverProfile[] = ['rookie', 'regular', 'club', 'pro', 'ace'];
/** The drivers each `bestFor` tag promises to help. */
export const AUDIENCE_PROFILES: Readonly<Record<PartAudience, readonly DriverProfile[]>> = {
  everyone: PROFILES, boost: ['rookie', 'regular', 'pro', 'ace'], drift: ['ace'],
  recovery: ['rookie', 'regular'], traffic: ['club', 'regular', 'pro'], clean: ['pro', 'ace'],
};
const hash = (a: number, b: number, c: number) => {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) / 4294967296;
};
export function rookieControl(state: RaceState, slot: number, tune: CarTune, seed: number, regular = false): number {
  const car = state.cars[slot]!;
  let target = ((slot % 3) - 1) * 2400;
  for (const other of state.cars) {
    const dz = other.progress - car.progress;
    if (other.slot === slot || other.finishTick !== null || other.dnfTick !== null) continue;
    if (dz > -1000 && dz < 9000 && Math.abs(other.x - target) < 2100) target = car.x <= other.x ? other.x - 2700 : other.x + 2700;
    // Even a rookie gives a car alongside some room instead of leaning on it.
    if (Math.abs(dz) < 5000 && Math.abs(other.x - car.x) < 2300) target = car.x + (car.x < other.x || car.x === other.x && slot < other.slot ? -2800 : 2800);
  }
  target = Math.max(-4200, Math.min(4200, target));
  let input = C.throttle;
  const distracted = hash(Math.floor(state.tick / 20), slot, seed) < (regular ? 0.05 : 0.12);
  const curve = curvature(TRACKS[state.trackId]!, car.progress);
  const error = car.x + car.vx * (regular ? 4 : 2) + (regular ? Math.trunc(curve * car.speed * tune.cornerLoad / 1920) * 3 : 0) - target;
  const deadband = regular ? 500 + Math.floor(hash(seed, slot, 99) * 300) : 900;
  if (!distracted && error > deadband) input |= C.left;
  if (!distracted && error < -deadband) input |= C.right;
  const burst = car.speed > tune.topSpeed && car.energy >= tune.boostCost;
  if (regular ? burst || car.energy >= 800 && Math.abs(curve) <= 1 : burst || car.energy > 1000 - tune.boostRecharge) input |= C.boost;
  return input;
}
export function profileControl(profile: DriverProfile, state: RaceState, slot: number, tune: CarTune, seed = 0): number {
  return profile === 'rookie' || profile === 'regular' ? rookieControl(state, slot, tune, seed, profile === 'regular') : garageBotControl(state, slot, tune, profile);
}
/** Finish tick, or the projected tick for a car still running at the limit. */
export function raceTicks(state: RaceState, slot: number): number {
  const car = state.cars[slot]!;
  return car.finishTick ?? RULES.maxTicks + Math.ceil((TRACKS[state.trackId]!.length * RULES.laps - car.progress) / 2400);
}
export const place = (state: RaceState, slot: number): number => rankCars(state).findIndex(car => car.slot === slot) + 1;

/** One garage race: the test driver in `slot`, everyone else from `rivals` (stock club drivers by default). */
export function garageRace(trackId: number, slot: number, profile: DriverProfile, tune: CarTune, seed = 0, rivals?: readonly (Rival | null)[]) {
  const state = createRace(trackId, 8), offroad = { ticks: 0 }, impacts = { count: 0 };
  const tunes = state.cars.map(car => car.slot === slot ? tune : rivals?.[car.slot]?.tune ?? STOCK_TUNE);
  while (!raceFinished(state)) {
    stepTunedRace(state, state.cars.map(car => car.slot === slot ? profileControl(profile, state, slot, tune, seed) : garageBotControl(state, car.slot, tunes[car.slot]!, rivals?.[car.slot]?.skill ?? 'club')), tunes);
    if (state.cars[slot]!.finishTick === null && Math.abs(state.cars[slot]!.x) > RULES.roadHalf) offroad.ticks++;
    impacts.count += environmentContacts(state).filter(contact => contact.slot === slot && contact.kind !== 'oil').length;
  }
  return { state, offroad: offroad.ticks, impacts: impacts.count };
}

/** Mean race ticks per profile and track for one tune, from mid-grid and back-of-grid starts. */
export type Evaluation = Readonly<Record<DriverProfile, readonly number[]>>;
export interface EvaluationPlan { readonly slots: readonly number[]; readonly seeds: Readonly<Record<DriverProfile, readonly number[]>> }
/** FULL_PLAN backs the tests. QUICK_PLAN is for fast iteration only: two grid slots
 * are too few to average out pack contacts, so single parts can change sign. */
export const FULL_PLAN: EvaluationPlan = { slots: [1, 3, 5, 6], seeds: { rookie: [1, 2, 3, 4, 5, 6, 7, 8], regular: [1, 2, 3, 4, 5, 6], club: [0], pro: [0], ace: [0] } };
export const QUICK_PLAN: EvaluationPlan = { slots: [3, 6], seeds: { rookie: [1, 2, 3, 4, 5, 6], regular: [1, 2, 3, 4], club: [0], pro: [0], ace: [0] } };
export function evaluateTune(tune: CarTune, plan = FULL_PLAN): Evaluation {
  const result = {} as Record<DriverProfile, number[]>;
  for (const profile of PROFILES) result[profile] = [0, 1, 2].map(trackId => {
    const runs = plan.slots.flatMap(slot => plan.seeds[profile].map(seed => raceTicks(garageRace(trackId, slot, profile, tune, seed).state, slot)));
    return runs.reduce((sum, ticks) => sum + ticks, 0) / runs.length;
  });
  return result;
}
const evaluations = new Map<string, Evaluation>();
export function evaluateParts(parts: readonly string[], plan = FULL_PLAN): Evaluation {
  const key = `${plan === FULL_PLAN ? 'full' : 'quick'}:${[...parts].sort().join()}`;
  if (!evaluations.has(key)) evaluations.set(key, evaluateTune(tuneFor(parts), plan));
  return evaluations.get(key)!;
}
/** Ticks saved by adding `part` to `context`, per profile and track. */
export function gain(context: readonly string[], part: string, plan = FULL_PLAN): Record<DriverProfile, number[]> {
  const before = evaluateParts(context, plan), after = evaluateParts([...context, part], plan);
  return Object.fromEntries(PROFILES.map(profile => [profile, before[profile].map((ticks, track) => ticks - after[profile][track]!)])) as Record<DriverProfile, number[]>;
}
export const mean = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;
/** Mean ticks saved for the drivers a tag promises to help, across all three tracks. */
export const audienceGain = (gains: Record<DriverProfile, number[]>, audience: PartAudience): number => mean(AUDIENCE_PROFILES[audience].map(profile => mean(gains[profile])));

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
/** Finishing place in a practice field from the usual player slot. */
export function fieldPlace(field: FieldId, trackId: number, profile: DriverProfile, tune: CarTune, seed = 0): number {
  return place(garageRace(trackId, 6, profile, tune, seed, fieldRivals(field, 8, 6)).state, 6);
}
/** Whether an Arcade story chapter's objective is met from the player's slot, with tuned or equal rivals. `chapter` is its id. */
export function storyCleared(chapter: number, profile: DriverProfile, tune: CarTune, seed = 0, equalCars = false): boolean {
  const index = chapterPosition(chapter);
  const { state } = garageRace(CHAPTERS[index]!.trackId!, 6, profile, tune, seed, equalCars ? undefined : storyRivals(chapter, 8, 6));
  return storyObjectiveMet(index, place(state, 6), place(state, 7));
}

/** Mean race ticks on one course for the drivers closest to new players: rookies and regulars. */
export function courseTicks(trackId: number, parts: readonly string[], plan = FULL_PLAN): number {
  const tune = tuneFor(parts);
  return mean((['rookie', 'regular'] as const).map(profile => mean(plan.slots.flatMap(slot => plan.seeds[profile].map(seed => raceTicks(garageRace(trackId, slot, profile, tune, seed).state, slot))))));
}
/** Parts a garage holding `owned` could buy next, money aside. */
export const purchasable = (owned: readonly string[]): TechNode[] => TECH_NODES.filter(node => !owned.includes(node.id)
  && node.requires.every(id => owned.includes(id)) && (!node.requiresAny || node.requiresAny.some(id => owned.includes(id)))
  && !(node.fork && owned.some(id => techNode(id)!.fork === node.fork)));

/** How a player spends at each pre-race garage: the crew's picks, nothing at all,
 * or a casual habit of buying the cheapest or the priciest part on offer. */
export type SpendPolicy = 'picks' | 'stock' | 'cheapest' | 'priciest';
export interface Campaign {
  /** Races per chapter until its objective was met; `limit + 1` marks a chapter never cleared. */
  readonly tries: readonly number[];
  /** First try per chapter: ticks ahead of the faster of the two non-crew cars (negative behind). */
  readonly leads: readonly number[];
  readonly save: GarageSave;
}
/** Plays the whole story from a new garage, as main.ts runs it: pre-race garage, race, prize money, retry until cleared. */
export function storyCampaign(profile: DriverProfile, seed: number, policy: SpendPolicy, limit = 10): Campaign {
  let save = newGarage();
  const tries: number[] = [], leads: number[] = [];
  for (const [index, chapter] of CHAPTERS.entries()) {
    // Street-race chapters run equal cars for no prize money: they neither spend nor earn.
    if (chapter.trackId === undefined) continue;
    const trackId = chapter.trackId;
    let races = 0, cleared = false;
    while (!cleared && races < limit) {
      for (let part = shoppingChoice(save, trackId, policy); part; part = shoppingChoice(save, trackId, policy)) {
        save = partState(save, part.id) === 'stored' ? fitPart(save, part.id) : buyPart(save, part.id);
      }
      const run = garageRace(trackId, 6, profile, garageTune(save), seed * 1000 + chapter.id * 20 + races, storyRivals(chapter.id, 8, 6));
      const mine = place(run.state, 6);
      cleared = storyObjectiveMet(index, mine, place(run.state, 7));
      if (!races) leads.push(Math.min(raceTicks(run.state, 5), raceTicks(run.state, 7)) - raceTicks(run.state, 6));
      save = applyAward(save, raceAward(save, { place: mine, cars: 8, field: null, chapter: chapter.id, objective: cleared, clean: run.impacts === 0 && run.offroad <= 30 }), chapter.id);
      races++;
    }
    tries.push(cleared ? races : limit + 1);
  }
  return { tries, leads, save };
}
function shoppingChoice(save: GarageSave, trackId: number, policy: SpendPolicy): TechNode | null {
  if (policy === 'stock') return null;
  if (policy === 'picks') { const pick = nextPick(save, trackId); return pick && ['available', 'stored'].includes(partState(save, pick.id)) ? pick : null; }
  const open = TECH_NODES.filter(node => partState(save, node.id) === 'available').sort((a, b) => policy === 'cheapest' ? a.cost - b.cost : b.cost - a.cost);
  return open[0] ?? null;
}
export { STOCK_TUNE };
