import test from 'node:test';
import assert from 'node:assert/strict';
import { TECH_BRANCHES, TECH_NODES, rivalBuild, techNode, tuneFor, type TechNode } from '../src/game/garage-tech';
import { RACE_GAINS } from '../src/game/part-effects';
import { CHAPTERS } from '../src/game/story';
import { STOCK_TUNE } from '../src/game/tuned-engine';
import { AUDIENCE_PROFILES, FULL_PLAN, audienceGain, evaluateParts, fieldPlace, gain, mean, partContext, storyCleared } from './helpers/garage-drivers';

// Simulated races with the reference drivers in helpers/garage-drivers.ts.
// `npm run balance:garage` prints the full tables these limits come from.
const value = (node: TechNode, audience = node.bestFor) => audienceGain(gain(partContext(node.id), node.id, FULL_PLAN), audience);
const perYen = (node: TechNode) => value(node) / node.cost * 1000;
const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
const clearRate = (chapter: number, profile: 'rookie' | 'regular', parts: readonly string[]) => seeds.filter(seed => storyCleared(chapter, profile, tuneFor(parts), seed)).length / seeds.length;

test('every part saves real time for the drivers its tag names', () => {
  for (const node of TECH_NODES) assert.ok(value(node) >= (node.tier <= 2 ? 4 : 10), `${node.id} for ${node.bestFor}: ${value(node).toFixed(1)} ticks`);
});

test('the garage shows the race time each part was measured to save on each course', () => {
  // Display values are rounded to 0.1 s; re-measure after any rebalance (npm run balance:garage prints them).
  for (const node of TECH_NODES) {
    const gains = gain(partContext(node.id), node.id, FULL_PLAN);
    [0, 1, 2].forEach(track => {
      const measured = mean(AUDIENCE_PROFILES[node.bestFor].map(profile => gains[profile][track]!)) / 30;
      assert.ok(Math.abs(measured - RACE_GAINS[node.id]![track]!) <= 0.06, `${node.id} track ${track}: measured ${measured.toFixed(2)} s, shown ${RACE_GAINS[node.id]![track]} s`);
    });
  }
});

test('each tier is a worse deal than the one before, and tiers are priced alike across branches', () => {
  for (const branch of TECH_BRANCHES) {
    const tiers = [1, 2, 3, 4].map(tier => Math.max(...TECH_NODES.filter(node => node.branch === branch.id && node.tier === tier).map(perYen)));
    for (let tier = 1; tier < 4; tier++) assert.ok(tiers[tier]! <= tiers[tier - 1]! * 1.25, `${branch.id} tier ${tier + 1} is no bargain: ${tiers.map(v => v.toFixed(2))}`);
    assert.equal(Math.min(...tiers), tiers[3], `${branch.id} capstone is the priciest gain`);
  }
  for (const tier of [1, 2, 3, 4]) {
    const deals = TECH_NODES.filter(node => node.tier === tier).map(perYen);
    assert.ok(Math.max(...deals) / Math.min(...deals) <= 3, `tier ${tier} spread ${deals.map(v => v.toFixed(2))}`);
  }
});

test('every setup fork is a real choice', () => {
  const better = (a: string, b: string, audience: TechNode['bestFor']) => value(techNode(a)!, audience) > value(techNode(b)!, audience);
  assert.ok(better('engine-highrev', 'engine-torque', 'clean') && better('engine-torque', 'engine-highrev', 'recovery'));
  assert.ok(better('chassis-touge', 'chassis-rally', 'drift') && better('chassis-rally', 'chassis-touge', 'recovery'));
  assert.ok(better('body-light', 'body-armor', 'clean') && better('body-armor', 'body-light', 'recovery'));
  // Both turbos serve boost users; each must win somewhere.
  const context = partContext('turbo-big'), big = gain(context, 'turbo-big', FULL_PLAN), twin = gain(context, 'turbo-twin', FULL_PLAN);
  const cells = AUDIENCE_PROFILES.boost.flatMap(profile => [0, 1, 2].map(track => big[profile][track]! - twin[profile][track]!));
  assert.ok(cells.some(d => d > 2) && cells.some(d => d < -2), `turbo fork ${cells.map(Math.round)}`);
});

test('a finished car is a big but bounded step over stock', () => {
  const finished = rivalBuild('power', 640000), stock = evaluateParts([], FULL_PLAN), built = evaluateParts(finished, FULL_PLAN);
  for (const profile of ['regular', 'pro', 'ace'] as const) for (const track of [0, 1, 2]) {
    const saved = 1 - built[profile][track]! / stock[profile][track]!;
    assert.ok(saved >= 0.06 && saved <= 0.14, `${profile} on track ${track}: ${(saved * 100).toFixed(1)}%`);
  }
});

test('practice fields form a ladder: each needs a better car, the last needs a finished one', () => {
  const places = (field: 'club' | 'touge' | 'championship' | 'legends', parts: readonly string[]) => [0, 1, 2].map(track => fieldPlace(field, track, 'pro', tuneFor(parts)));
  assert.deepEqual(places('club', []), [1, 1, 1], 'club night is the original practice');
  assert.ok(places('touge', []).every(p => p > 3) && places('touge', rivalBuild('power', 120000)).every(p => p <= 3));
  assert.ok(places('championship', rivalBuild('power', 60000)).every(p => p > 3) && places('championship', rivalBuild('boost', 420000)).every(p => p <= 3));
  assert.ok(places('legends', rivalBuild('power', 180000)).every(p => p > 3));
  assert.ok(places('legends', rivalBuild('power', 640000)).filter(p => p <= 3).length >= 2, 'a finished car contends in Legends');
});

test('a stock car can meet every story objective except Toru’s showdown', () => {
  // The rivals assume a player who upgrades in the pre-race garage (tests/story-pit-balance.test.ts).
  for (const chapter of CHAPTERS.keys()) assert.equal(storyCleared(chapter, 'pro', STOCK_TUNE), chapter !== 10, `chapter ${chapter + 1} with a stock car`);
  // The windy harbor chapters before the showdown reward a modest build.
  for (const chapter of [4, 7]) {
    const budget = 12000 + 7000 * chapter, upgraded = clearRate(chapter, 'regular', rivalBuild('tough', budget)), stock = clearRate(chapter, 'regular', []);
    assert.ok(upgraded >= 0.6 && upgraded - stock >= 0.4, `chapter ${chapter + 1}: stock ${stock}, ¥${budget} build ${upgraded}`);
  }
});

test('chassis recovery parts, not raw power, rescue a struggling driver in Yokohama', () => {
  const recovery = clearRate(1, 'rookie', ['chassis-tyres', 'chassis-coilovers', 'chassis-rally']);
  const power = clearRate(1, 'rookie', ['engine-intake', 'engine-cams', 'turbo-controller']), stock = clearRate(1, 'rookie', []);
  assert.ok(recovery >= 0.7 && recovery - power >= 0.25 && recovery - stock >= 0.4, `recovery ${recovery}, power ${power}, stock ${stock}`);
});
