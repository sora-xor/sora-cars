import { createHash } from 'node:crypto';
import {
  CLEAN_BONUS, PRACTICE_FIELDS, PURSE, STARTING_FUNDS, STORY_REI, STORY_TORU, TECH_NODES, applyAward, fieldRivals, fittedParts, newGarage, raceAward, rivalBuild,
  storyClearBonus, techNode, tuneFor, type FieldId, type PartAudience, type RivalStyle,
} from '../../src/game/garage-tech';
import { CHAPTERS, chapterPosition } from '../../src/game/story';
import { COURSE_TIPS } from '../../src/game/story-pit';
import { DRIVER_SKILLS } from '../../src/game/drive/ai';
import {
  AUDIENCE_PROFILES, HUMAN_STYLES, PROFILES, interquartileMean, mean, packRace, partContext, purchasable, shop, soloRace, storyCampaign, storyRace,
  type Campaign, type DriverProfile, type GarageRun, type SpendPolicy,
} from './garage-drivers';

/** The garage balance on the driving model, measured once and checked cheaply.
 * A driving-model race costs a few hundred milliseconds and a rookie's race
 * time swings by seconds with every spin, so the measurements need thousands of
 * races. `npm run balance:garage` runs them on every core and writes the report
 * (tests/fixtures/garage-balance.json); the balance tests re-run its fingerprint
 * races and check the tree's inputs, so the report must match the current model.
 */
export const REPORT_PATH = new URL('../fixtures/garage-balance.json', import.meta.url);

export type Job =
  | { readonly kind: 'road'; readonly trackId: number; readonly profile: DriverProfile; readonly parts: readonly string[]; readonly seed: number }
  | { readonly kind: 'pack'; readonly trackId: number; readonly slot: number; readonly profile: DriverProfile; readonly parts: readonly string[]; readonly seed: number; readonly field?: FieldId }
  | { readonly kind: 'story'; readonly chapter: number; readonly profile: DriverProfile; readonly parts: readonly string[]; readonly seed: number; readonly equal: boolean }
  | { readonly kind: 'campaign'; readonly profile: DriverProfile; readonly seed: number; readonly policy: SpendPolicy };
export type JobResult = GarageRun | { readonly cleared: boolean; readonly run: GarageRun } | Campaign;
export function runJob(job: Job): JobResult {
  switch (job.kind) {
    case 'road': return soloRace(job.trackId, job.profile, tuneFor(job.parts), job.seed);
    case 'pack': return packRace(job.trackId, job.slot, job.profile, tuneFor(job.parts), job.seed, job.field ? fieldRivals(job.field, 8, job.slot) : undefined);
    case 'story': return storyRace(job.chapter, job.profile, tuneFor(job.parts), job.seed, job.equal);
    case 'campaign': return storyCampaign(job.profile, job.seed, job.policy);
  }
}
export type JobRunner = (jobs: readonly Job[]) => Promise<JobResult[]>;
export const runSerially: JobRunner = async jobs => jobs.map(runJob);

export interface BalancePlan {
  readonly name: string;
  /** Seeds per profile for clear-road time trials. The AI drivers are deterministic. */
  readonly road: Readonly<Record<DriverProfile, readonly number[]>>;
  /** Grid slots and seeds per profile for pack races, against a club night. */
  readonly pack: { readonly slots: readonly number[]; readonly seeds: Readonly<Record<DriverProfile, readonly number[]>> };
  /** Seeds for the practice-field ladder: each moves the pro test car's lane (laneShift). A single AI race from the
   * player's grid spot is chaotic: one finished car placed 4/4/7 there and podiumed 15 times in 18 from the next slots. */
  readonly fields: readonly number[];
  /** Seeds for story clear rates, the first harbor night's rescue builds, and whole-story campaigns. 12 seeds put a
   * clear rate within about ±0.14; the Act 3 leads moved by a second between 8-campaign runs. */
  readonly story: readonly number[];
  readonly rescue: readonly number[];
  readonly campaigns: readonly number[];
}
const seeds = (count: number) => Array.from({ length: count }, (_, i) => i + 1);
export const FULL_PLAN: BalancePlan = {
  name: 'full',
  road: { rookie: seeds(40), regular: seeds(12), club: [0], pro: [0], ace: [0] },
  pack: { slots: [0, 1, 2, 3, 4, 5, 6, 7], seeds: { rookie: [1, 2], regular: [1, 2], club: [0], pro: [0], ace: [0] } },
  fields: [0, ...seeds(7)], story: seeds(12), rescue: seeds(96), campaigns: seeds(16),
};
/** For iterating on effects only: too few rookie seeds to set the cards. */
export const QUICK_PLAN: BalancePlan = {
  name: 'quick',
  road: { rookie: seeds(8), regular: seeds(4), club: [0], pro: [0], ace: [0] },
  pack: { slots: [1, 3, 5, 6], seeds: { rookie: [1], regular: [1], club: [0], pro: [0], ace: [0] } },
  fields: [0], story: seeds(4), rescue: seeds(8), campaigns: seeds(2),
};
/** Parts whose tag is about other cars are measured in a pack; everything else on a clear road. */
export const PACK_AUDIENCES: ReadonlySet<PartAudience> = new Set<PartAudience>(['traffic']);
export const TRACKS = [0, 1, 2] as const;

/** Builds the ladder and story checks race, by label. */
export const FINISHED_BUILD = rivalBuild('power', 640000);
export const FIELD_BUILDS: Readonly<Record<string, readonly string[]>> = Object.fromEntries([
  ['stock', []], ...(['power', 'boost', 'tough'] as RivalStyle[]).flatMap(style => [60000, 120000, 180000, 420000, 640000].map(budget => [`${style} ${budget / 1000}k`, rivalBuild(style, budget)])),
]);
export const HARBOR_CHAPTERS = [4, 7] as const;
/** The crew's picks for a course, in order, as far as `budget` goes. */
export function planBuild(trackId: number, budget: number): string[] {
  const parts: string[] = [];
  for (const id of COURSE_TIPS[trackId]!.plan) { if (techNode(id)!.cost > budget) break; budget -= techNode(id)!.cost; parts.push(id); }
  return parts;
}
/** Harbor builds that follow Daichi's picks. */
export const harborBuild = (chapter: number): string[] => planBuild(1, 12000 + 7000 * chapter);
/** What a rookie with a garage habit has on the first harbor night (ID 1), as storyCampaign plays it: the Hakone
 * garage with the starting funds, a Hakone podium's story purse and first-clear bonus, then the Yokohama garage. */
export function firstHarborBuild(policy: SpendPolicy): string[] {
  let save = shop(newGarage(), CHAPTERS[chapterPosition(0)]!.trackId!, policy);
  save = applyAward(save, raceAward(save, { place: 2, cars: 8, field: null, chapter: 0, objective: true, clean: false }), 0);
  return fittedParts(shop(save, CHAPTERS[chapterPosition(1)]!.trackId!, policy));
}
/** The first harbor night: the crew's picks (Yui's intake, then Daichi's boost controller) and the same funds spent
 * cheapest-first (tyres, coilovers, roll cage, bumpers), as rookies have them there, then ¥46k of engine and boost
 * parts, more than a rookie can have by then, and a stock car. */
export const RESCUE_BUILDS: Readonly<Record<'picks' | 'cheapest' | 'power' | 'stock', readonly string[]>> = {
  picks: firstHarborBuild('picks'), cheapest: firstHarborBuild('cheapest'), power: ['engine-intake', 'engine-cams', 'turbo-controller'], stock: [],
};
/** The rescue scenario the report measures and its input hash covers: the chapter, the driver and the resolved builds. */
export const RESCUE = { chapter: 1, profile: 'rookie', builds: RESCUE_BUILDS } as const;
export const POLICIES: readonly SpendPolicy[] = ['picks', 'cheapest', 'priciest', 'stock'];

export interface PartReport {
  readonly context: readonly string[];
  readonly scenario: 'road' | 'pack';
  /** Ticks saved per race, by profile and track: the interquartile mean over paired runs. */
  readonly gains: Readonly<Record<DriverProfile, readonly number[]>>;
}
export interface CoursePlanStep { readonly pick: string; readonly perYen: number; readonly best: number; readonly bestPart: string }
export interface BalanceReport {
  readonly version: 1;
  readonly plan: string;
  readonly inputs: string;
  readonly fingerprints: readonly { readonly job: Job; readonly ticks: number; readonly damage: number }[];
  readonly parts: Readonly<Record<string, PartReport>>;
  /** Share of race time a finished car saves over stock, by profile and track. */
  readonly finished: Readonly<Record<'regular' | 'pro' | 'ace', readonly number[]>>;
  /** Stock and finished race time (ticks) for each profile and track, on a clear road. */
  readonly pace: Readonly<Record<DriverProfile, { readonly stock: readonly number[]; readonly finished: readonly number[] }>>;
  /** A pro's place from the player's slot, by field, build label and track, one per field seed (its lane). */
  readonly fields: Readonly<Record<FieldId, Readonly<Record<string, readonly (readonly number[])[]>>>>;
  readonly story: {
    /** Arcade chapter id → objective met by a stock pro. */
    readonly stock: Readonly<Record<string, boolean>>;
    /** Share of regular drivers clearing each windy harbor chapter with a stock car and a modest build. */
    readonly harbor: Readonly<Record<string, { readonly stock: number; readonly build: number; readonly budget: number }>>;
    /** Whether a rookie cleared the first harbor chapter with each build (RESCUE_BUILDS), one per rescue seed
     * (1 cleared, 0 not), so builds compare seed by seed. */
    readonly rescue: Readonly<Record<'picks' | 'cheapest' | 'power' | 'stock', readonly number[]>>;
    /** Share of regular drivers meeting each objective in equal cars, by chapter id. */
    readonly equal: Readonly<Record<string, number>>;
  };
  readonly campaigns: Readonly<Record<string, readonly Campaign[]>>;
  readonly coursePlans: readonly (readonly CoursePlanStep[])[];
  /** Greedy best-per-yen purchase order for rookies and regulars on each course. */
  readonly bestPlans: readonly (readonly string[])[];
}

/** Everything besides the model's code that the measurements depend on (not the cards' wording). */
export function balanceInputs(plan: BalancePlan): string {
  const parts = TECH_NODES.map(({ id, tier, fork, cost, requires, requiresAny, bestFor, effects }) => ({ id, tier, fork, cost, requires, requiresAny, bestFor, effects }));
  const text = JSON.stringify({ plan, parts, fields: PRACTICE_FIELDS.map(({ id, prize, budget, skills, styles }) => ({ id, prize, budget, skills, styles })), STORY_REI, STORY_TORU, PURSE, CLEAN_BONUS, STARTING_FUNDS, clear: CHAPTERS.map(c => storyClearBonus(c.id)),
    chapters: CHAPTERS.map(c => [c.id, c.trackId ?? null]), plans: COURSE_TIPS.map(tip => tip.plan), builds: FIELD_BUILDS, rescue: RESCUE, HUMAN_STYLES, DRIVER_SKILLS, AUDIENCE_PROFILES,
    rivals: PRACTICE_FIELDS.map(field => fieldRivals(field.id, 8, 6)) });
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
/** Races that pin the report to the model: every driver kind, tuned cars, drift, slipstream, rivals and damage. */
export const FINGERPRINT_JOBS: readonly Job[] = [
  { kind: 'road', trackId: 0, profile: 'ace', parts: partContext('chassis-lsd').concat('chassis-lsd'), seed: 0 },
  { kind: 'road', trackId: 1, profile: 'rookie', parts: ['body-cage', 'body-bumpers', 'body-armor', 'engine-intake', 'engine-cams', 'engine-torque'], seed: 3 },
  { kind: 'road', trackId: 2, profile: 'regular', parts: rivalBuild('boost', 420000), seed: 2 },
  { kind: 'pack', trackId: 1, slot: 6, profile: 'regular', parts: partContext('body-windtunnel').concat('body-windtunnel'), seed: 1 },
  { kind: 'pack', trackId: 2, slot: 6, profile: 'pro', parts: FINISHED_BUILD, seed: 0, field: 'legends' },
  { kind: 'pack', trackId: 0, slot: 3, profile: 'club', parts: [], seed: 0, field: 'touge' },
];
const fingerprint = (result: JobResult) => 'ticks' in result ? result : (result as { run: GarageRun }).run;
export async function fingerprints(run: JobRunner): Promise<BalanceReport['fingerprints']> {
  const results = await run(FINGERPRINT_JOBS);
  return FINGERPRINT_JOBS.map((job, i) => ({ job, ticks: fingerprint(results[i]!).ticks, damage: fingerprint(results[i]!).damage }));
}

const key = (parts: readonly string[]) => [...parts].sort().join(',');
/** Race ticks by build, profile and track, one per seed (and slot, in a pack), measured on demand. */
class Trials {
  readonly #ticks = new Map<string, number[]>();
  constructor(readonly scenario: 'road' | 'pack', readonly plan: BalancePlan, readonly run: JobRunner, readonly log: (line: string) => void) {}
  get(parts: readonly string[], profile: DriverProfile, track: number): readonly number[] { return this.#ticks.get(`${key(parts)}|${profile}|${track}`)!; }
  async need(builds: readonly (readonly string[])[], profiles: readonly DriverProfile[], tracks: readonly number[] = TRACKS): Promise<void> {
    const jobs: Job[] = [];
    for (const parts of builds) for (const profile of profiles) for (const trackId of tracks) {
      const id = `${key(parts)}|${profile}|${trackId}`;
      if (this.#ticks.has(id)) continue;
      this.#ticks.set(id, []);
      if (this.scenario === 'road') for (const seed of this.plan.road[profile]) jobs.push({ kind: 'road', trackId, profile, parts, seed });
      else for (const slot of this.plan.pack.slots) for (const seed of this.plan.pack.seeds[profile]) jobs.push({ kind: 'pack', trackId, slot, profile, parts, seed });
    }
    if (!jobs.length) return;
    this.log(`${jobs.length} ${this.scenario === 'road' ? 'clear-road' : 'pack'} races…`);
    const results = (await this.run(jobs)) as GarageRun[];
    jobs.forEach((job, i) => { if (job.kind === 'road' || job.kind === 'pack') this.#ticks.get(`${key(job.parts)}|${job.profile}|${job.trackId}`)!.push(results[i]!.ticks); });
  }
  /** Ticks saved by `after` over `before`, run by run with the same seed and slot, as an interquartile mean. */
  gain(before: readonly string[], after: readonly string[], profile: DriverProfile, track: number): number {
    const a = this.get(before, profile, track), b = this.get(after, profile, track);
    return interquartileMean(a.map((ticks, i) => ticks - b[i]!));
  }
}

/** Measure everything the balance tests check. */
export async function measureBalance(plan: BalancePlan, run: JobRunner, log: (line: string) => void = () => {}): Promise<BalanceReport> {
  // Clear-road time trials: every part with and without, and the finished car.
  const road = new Trials('road', plan, run, log), pack = new Trials('pack', plan, run, log);
  const roadParts = TECH_NODES.filter(node => !PACK_AUDIENCES.has(node.bestFor)), packParts = TECH_NODES.filter(node => PACK_AUDIENCES.has(node.bestFor));
  await road.need([[], FINISHED_BUILD, ...roadParts.flatMap(node => [partContext(node.id), [...partContext(node.id), node.id]])], PROFILES);
  await pack.need(packParts.flatMap(node => [partContext(node.id), [...partContext(node.id), node.id]]), [...new Set(packParts.flatMap(node => AUDIENCE_PROFILES[node.bestFor]))]);
  const parts: Record<string, PartReport> = {};
  for (const node of TECH_NODES) {
    const context = partContext(node.id), scenario = PACK_AUDIENCES.has(node.bestFor) ? 'pack' : 'road', source = scenario === 'pack' ? pack : road;
    parts[node.id] = { context, scenario, gains: Object.fromEntries((scenario === 'pack' ? AUDIENCE_PROFILES[node.bestFor] : PROFILES)
      .map(profile => [profile, TRACKS.map(track => source.gain(context, [...context, node.id], profile, track))])) as Record<DriverProfile, number[]> };
  }
  const pace = Object.fromEntries(PROFILES.map(profile => [profile, { stock: TRACKS.map(t => interquartileMean(road.get([], profile, t))), finished: TRACKS.map(t => interquartileMean(road.get(FINISHED_BUILD, profile, t))) }]));
  const saved = (profile: DriverProfile) => TRACKS.map(t => road.gain([], FINISHED_BUILD, profile, t) / interquartileMean(road.get([], profile, t)));
  // Course plans: the best value per yen for rookies and regulars, re-measured after every purchase.
  log('course plans…');
  const learners = ['rookie', 'regular'] as const;
  const perYen = (base: readonly string[], id: string, track: number) => mean(learners.map(profile => road.gain(base, [...base, id], profile, track))) / techNode(id)!.cost * 1000;
  const ranked = async (base: readonly string[], track: number) => {
    const options = purchasable(base);
    await road.need([base, ...options.map(node => [...base, node.id])], learners, [track]);
    return options.map(node => ({ id: node.id, value: perYen(base, node.id, track) })).sort((a, b) => b.value - a.value);
  };
  const coursePlans: CoursePlanStep[][] = [], bestPlans: string[][] = [];
  for (const track of TRACKS) {
    const steps: CoursePlanStep[] = [], best: string[] = [];
    for (let step = 0, owned: string[] = []; step < 3; step++) {
      const pick = COURSE_TIPS[track]!.plan[step]!, top = (await ranked(owned, track))[0]!;
      steps.push({ pick, perYen: perYen(owned, pick, track), best: top.value, bestPart: top.id });
      owned = [...owned, pick];
    }
    for (let owned: string[] = []; purchasable(owned).length;) { const next = (await ranked(owned, track))[0]!.id; best.push(next); owned = [...owned, next]; }
    coursePlans.push(steps); bestPlans.push(best);
  }
  log('practice fields…');
  const labels = Object.keys(FIELD_BUILDS);
  const fieldJobs: Job[] = PRACTICE_FIELDS.flatMap(field => labels.flatMap(label => TRACKS.flatMap(trackId => plan.fields.map(seed =>
    ({ kind: 'pack', trackId, slot: 6, profile: 'pro', parts: FIELD_BUILDS[label]!, seed, field: field.id }) as Job))));
  const fieldRuns = (await run(fieldJobs)) as GarageRun[];
  const fieldPlace = (f: number, b: number, t: number, s: number) => fieldRuns[((f * labels.length + b) * TRACKS.length + t) * plan.fields.length + s]!.place;
  const fields = Object.fromEntries(PRACTICE_FIELDS.map((field, f) => [field.id, Object.fromEntries(labels.map((label, b) =>
    [label, TRACKS.map(t => plan.fields.map((_, s) => fieldPlace(f, b, t, s)))]))])) as unknown as BalanceReport['fields'];
  log('story chapters…');
  const arcade = CHAPTERS.filter(chapter => chapter.trackId !== undefined).map(chapter => chapter.id);
  const storyRuns = async (jobs: Job[]) => ((await run(jobs)) as { cleared: boolean }[]).map(result => result.cleared);
  const stockStory = await storyRuns(arcade.map(chapter => ({ kind: 'story', chapter, profile: 'pro', parts: [], seed: 0, equal: false })));
  const rate = async (chapter: number, profile: DriverProfile, parts: readonly string[], equal = false) =>
    mean((await storyRuns(plan.story.map(seed => ({ kind: 'story', chapter, profile, parts, seed, equal })))).map(Number));
  const harbor: Record<string, { stock: number; build: number; budget: number }> = {};
  for (const chapter of HARBOR_CHAPTERS) harbor[chapter] = { stock: await rate(chapter, 'regular', []), build: await rate(chapter, 'regular', harborBuild(chapter)), budget: 12000 + 7000 * chapter };
  const rescueRuns = async (parts: readonly string[]) =>
    (await storyRuns(plan.rescue.map(seed => ({ kind: 'story', chapter: RESCUE.chapter, profile: RESCUE.profile, parts, seed, equal: false })))).map(Number);
  const rescue = { picks: await rescueRuns(RESCUE.builds.picks), cheapest: await rescueRuns(RESCUE.builds.cheapest), power: await rescueRuns(RESCUE.builds.power), stock: await rescueRuns(RESCUE.builds.stock) };
  const equal: Record<string, number> = {};
  for (const chapter of arcade) equal[chapter] = await rate(chapter, 'regular', [], true);
  log('story campaigns…');
  const campaignJobs: Job[] = POLICIES.flatMap(policy => (['rookie', 'regular'] as const).flatMap(profile => plan.campaigns.map(seed => ({ kind: 'campaign', profile, seed, policy }) as Job)));
  const campaignRuns = (await run(campaignJobs)) as Campaign[];
  const campaigns: Record<string, Campaign[]> = {};
  campaignJobs.forEach((job, i) => { if (job.kind === 'campaign') (campaigns[`${job.profile}:${job.policy}`] ??= []).push(campaignRuns[i]!); });
  return {
    version: 1, plan: plan.name, inputs: balanceInputs(plan), fingerprints: await fingerprints(run), parts,
    finished: { regular: saved('regular'), pro: saved('pro'), ace: saved('ace') }, pace: pace as unknown as BalanceReport['pace'], fields,
    story: { stock: Object.fromEntries(arcade.map((chapter, i) => [chapter, stockStory[i]!])), harbor, rescue, equal },
    campaigns, coursePlans, bestPlans,
  };
}

/** Ticks saved for the drivers a tag names, by track. */
export const audienceGains = (report: BalanceReport, id: string): number[] => {
  const part = report.parts[id]!, node = techNode(id)!;
  return TRACKS.map(track => mean(AUDIENCE_PROFILES[node.bestFor].map(profile => part.gains[profile][track]!)));
};
/** RACE_GAINS as the garage shows them: seconds, to a tenth. */
export const raceGains = (report: BalanceReport): Record<string, number[]> =>
  Object.fromEntries(TECH_NODES.map(node => [node.id, audienceGains(report, node.id).map(ticks => Math.round(ticks / 3) / 10)]));
