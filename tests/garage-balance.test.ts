import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TECH_BRANCHES, TECH_NODES, techNode, type PartAudience, type TechNode } from '../src/game/garage-tech';
import { RACE_GAINS } from '../src/game/part-effects';
import { vehicleSpec } from '../src/game/drive/vehicle';
import { buildValue, tuneFor } from '../src/game/garage-tech';
import { AUDIENCE_PROFILES, mean } from './helpers/garage-drivers';
import { FULL_PLAN, HARBOR_CHAPTERS, REPORT_PATH, RESCUE_BUILDS, TRACKS, audienceGains, balanceInputs, fingerprints, raceGains, runSerially, type BalanceReport } from './helpers/garage-balance';

// The garage balance on the local driving model. A driving-model race costs a few
// hundred milliseconds, so `npm run balance:garage` measures it once on every core
// (tests/fixtures/garage-balance.json) and prints the tables these limits come from.
// The first test re-runs the report's fingerprint races, so it must match the model.
const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as BalanceReport;
/** Ticks saved a race for the drivers a tag names, averaged over the three courses. */
const value = (node: TechNode, audience: PartAudience = node.bestFor) => {
  const gains = report.parts[node.id]!.gains;
  return mean(AUDIENCE_PROFILES[audience].map(profile => mean(gains[profile] ?? [])));
};
const perYen = (node: TechNode, audience: PartAudience = node.bestFor) => value(node, audience) / node.cost * 1000;

test('the balance report measures the current driving model, tree and drivers', async () => {
  assert.equal(report.plan, FULL_PLAN.name);
  assert.equal(report.inputs, balanceInputs(FULL_PLAN), 'parts, prices, rivals, story budgets or reference drivers changed: run npm run balance:garage');
  assert.deepEqual(await fingerprints(runSerially), report.fingerprints, 'the driving model or its AI changed: run npm run balance:garage');
});

test('every part saves real time for the drivers its tag names', () => {
  // A tenth of a second a race at least: the durability parts mostly protect the car, and are priced for it.
  for (const node of TECH_NODES) assert.ok(value(node) >= 3, `${node.id} for ${node.bestFor}: ${value(node).toFixed(1)} ticks`);
});

test('the garage shows the race time each part was measured to save on each course', () => {
  // Rounded to 0.1 s; `npm run balance:garage` prints RACE_GAINS after a rebalance.
  const measured = raceGains(report);
  for (const node of TECH_NODES) assert.deepEqual([...RACE_GAINS[node.id]!], measured[node.id], node.id);
  for (const node of TECH_NODES) assert.deepEqual(audienceGains(report, node.id).length, TRACKS.length);
});

test('each tier is a worse deal than the one before, and tiers are priced alike across branches', () => {
  for (const branch of TECH_BRANCHES) {
    const tiers = [1, 2, 3, 4].map(tier => Math.max(...TECH_NODES.filter(node => node.branch === branch.id && node.tier === tier).map(node => perYen(node))));
    for (let tier = 1; tier < 4; tier++) assert.ok(tiers[tier]! <= tiers[tier - 1]! * 1.25, `${branch.id} tier ${tier + 1} is no bargain: ${tiers.map(v => v.toFixed(2))}`);
    assert.equal(Math.min(...tiers), tiers[3], `${branch.id} capstone is the priciest gain`);
  }
  for (const tier of [1, 2, 3, 4]) {
    const deals = TECH_NODES.filter(node => node.tier === tier).map(node => perYen(node));
    assert.ok(Math.max(...deals) / Math.min(...deals) <= 3, `tier ${tier} spread ${deals.map(v => v.toFixed(2))}`);
  }
});

test('every setup fork is a real choice', () => {
  // Each option is the better buy, in time saved per yen, for the drivers its own tag names.
  const better = (a: string, b: string, audience: PartAudience) => perYen(techNode(a)!, audience) > perYen(techNode(b)!, audience);
  for (const [a, b] of [['engine-highrev', 'engine-torque'], ['chassis-touge', 'chassis-rally'], ['body-light', 'body-armor']]) {
    assert.ok(better(a!, b!, techNode(a!)!.bestFor) && better(b!, a!, techNode(b!)!.bestFor), `${a} / ${b}`);
  }
  // Both turbos serve boost users; each must win somewhere.
  const big = report.parts['turbo-big']!.gains, twin = report.parts['turbo-twin']!.gains;
  const cells = AUDIENCE_PROFILES.boost.flatMap(profile => TRACKS.map(track => big[profile]![track]! - twin[profile]![track]!));
  assert.ok(cells.some(d => d > 2) && cells.some(d => d < -2), `turbo fork ${cells.map(Math.round)}`);
  // Armour trades lightweight's speed for half the damage per hit.
  const armor = vehicleSpec(tuneFor(['body-cage', 'body-bumpers', 'body-armor'])).toughness, light = vehicleSpec(tuneFor(['body-cage', 'body-bumpers', 'body-light'])).toughness;
  assert.ok(armor <= light / 1.4, `damage per hit: armour ${armor}, lightweight ${light}`);
});

test('a finished car is a big but bounded step over stock', () => {
  for (const profile of ['regular', 'pro', 'ace'] as const) for (const track of TRACKS) {
    const saved = report.finished[profile][track]!;
    assert.ok(saved >= 0.08 && saved <= 0.16, `${profile} on track ${track}: ${(saved * 100).toFixed(1)}%`);
  }
});

test('practice fields form a ladder: each needs a better car, the last needs a finished one', () => {
  // A pro from the player's grid spot, on all three tracks in every lane the plan races (FULL_PLAN.fields).
  const places = (field: keyof BalanceReport['fields'], build: string) => report.fields[field][build]!.flat();
  const podium = (field: keyof BalanceReport['fields'], build: string) => places(field, build).every(place => place <= 3);
  const shut = (field: keyof BalanceReport['fields'], build: string) => places(field, build).every(place => place > 3);
  const share = (field: keyof BalanceReport['fields'], build: string) => places(field, build).filter(place => place <= 3).length / places(field, build).length;
  assert.equal(places('legends', 'stock').length, TRACKS.length * FULL_PLAN.fields.length);
  assert.ok(!podium('club', 'stock') && podium('club', 'power 60k'), 'a modest build podiums club night');
  assert.ok(shut('touge', 'stock') && podium('touge', 'power 420k'));
  assert.ok(shut('championship', 'power 120k') && podium('championship', 'power 420k'));
  assert.ok(shut('legends', 'power 180k'));
  assert.ok(share('legends', 'power 640k') >= 2 / 3, `a finished car contends in Legends: ${places('legends', 'power 640k').join('')}`);
});

test('a stock car can meet every story objective; the harbor is where struggling drivers need parts', () => {
  // With equal cars a regular driver clears every chapter at least half the time; Yokohama's rain and crosswinds are the hardest.
  for (const [chapter, rate] of Object.entries(report.story.equal)) assert.ok(rate >= 0.5, `chapter ID ${chapter} in equal cars: ${rate}`);
  // Against the tuned rivals, a stock regular still wins through the windy harbor chapters more often than not.
  for (const chapter of HARBOR_CHAPTERS) assert.ok(report.story.harbor[chapter]!.stock >= 0.5, `chapter ID ${chapter}: ${JSON.stringify(report.story.harbor[chapter])}`);
});

/** One-sided 95% lower bound on the mean difference of seed-paired results (normal approximation). */
function pairedLowerBound(a: readonly number[], b: readonly number[]): number {
  const d = a.map((value, i) => value - b[i]!), m = mean(d);
  const sd = Math.sqrt(d.reduce((sum, value) => sum + (value - m) * (value - m), 0) / (d.length - 1));
  return m - 1.645 * sd / Math.sqrt(d.length);
}

test('the crew’s picks, not the cheapest parts, rescue a struggling driver in Yokohama', () => {
  // The first harbor night, with the cars rookies have there (RESCUE_BUILDS, one race per seed): Yui's intake and
  // Daichi's boost controller against the same funds spent cheapest-first on tyres, coilovers, roll cage and bumpers.
  // ¥46k of engine and boost parts clears it more often still: a harbor pack rewards top speed, which a rookie cannot
  // afford by then.
  const runs = report.story.rescue;
  const [picks, cheapest, power, stock] = (['picks', 'cheapest', 'power', 'stock'] as const).map(build => mean(runs[build]));
  for (const build of Object.values(runs)) assert.equal(build.length, FULL_PLAN.rescue.length);
  assert.ok(buildValue(RESCUE_BUILDS.cheapest) >= buildValue(RESCUE_BUILDS.picks), 'the cheapest parts cost no less');
  assert.ok(picks - stock >= 0.2, `picks ${picks} against stock ${stock}`);
  // At least ten points ahead of cheapest-first, and ahead seed for seed beyond chance.
  const bound = pairedLowerBound(runs.picks, runs.cheapest);
  assert.ok(picks - cheapest >= 0.1 && bound > 0, `picks ${picks}, cheapest ${cheapest} (paired lower bound ${bound.toFixed(3)}), power ${power}`);
});
