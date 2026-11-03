import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAPTERS, chapterPosition } from '../src/game/story';
import { STORY_TRIES, mean, type Campaign } from './helpers/garage-drivers';
import { FULL_PLAN, PLAN_VISITS, REPORT_PATH, balanceInputs, visitGarage, visitOptions, type BalanceReport } from './helpers/garage-balance';

// Whole-story campaigns with the reference drivers, played as main.ts runs story
// mode: each chapter's cutscenes, the pre-race garage, the race, prize money and
// retries until the objective is met. Measured on the driving model by
// `npm run balance:garage` (tests/garage-balance.test.ts checks the report is current).
const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as BalanceReport;
const arcade = CHAPTERS.filter(chapter => chapter.trackId !== undefined);
const play = (profile: 'rookie' | 'regular', policy: string): readonly Campaign[] => report.campaigns[`${profile}:${policy}`]!;
/** Arcade chapters (by id) where a run never met the objective. */
const stuck = (runs: readonly Campaign[]) => runs.flatMap(run => run.tries.flatMap((tries, i) => tries > STORY_TRIES ? [arcade[i]!.id] : []));
const races = (run: Campaign) => run.tries.reduce((sum, tries) => sum + tries, 0);
const triesAt = (runs: readonly Campaign[], id: number) => mean(runs.map(run => run.tries[arcade.findIndex(chapter => chapter.id === id)]!));

test('the campaigns were measured on the current tree and drivers', () => {
  assert.equal(report.inputs, balanceInputs(FULL_PLAN), 'run npm run balance:garage');
  assert.equal(report.campaigns['rookie:picks']!.length, FULL_PLAN.campaigns.length);
});

test('Yui’s and Daichi’s plans buy what wins their first story nights', () => {
  // A rookie on the crew's picks at Hakone's and Yokohama's first nights (PLAN_VISITS), with the car and money story
  // mode gives them after 2nd places or clean wins: what the plan buys meets the objective within five points as often
  // as buying nothing, any one part on offer, or stopping the plan early, over the same seeds. Clear-road time per yen
  // from a stock car once put sport tyres second for Yokohama, where they cost a rookie podiums (docs/garage-tech-tree.md).
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(id => b.includes(id));
  assert.deepEqual(report.storyPlans.map(visit => [visit.chapter, visit.finish]), PLAN_VISITS.map(visit => [visit.chapter, visit.finish]));
  for (const visit of report.storyPlans) {
    const expected = visitOptions(visitGarage(visit.chapter, visit.finish), CHAPTERS[chapterPosition(visit.chapter)]!.trackId!);
    assert.deepEqual([visit.plan, visit.options.map(option => option.parts)], [expected.plan, expected.options], `chapter ID ${visit.chapter} raced the current plans`);
    const planned = mean(visit.options.find(option => same(option.parts, visit.plan))!.cleared);
    for (const option of visit.options) {
      assert.ok(mean(option.cleared) <= planned + 0.05, `chapter ID ${visit.chapter} after a ${visit.finish}: ${option.parts.join('+') || 'nothing'} `
        + `${(mean(option.cleared) * 100).toFixed(0)}% against the plan's ${visit.plan.join('+') || 'nothing'} ${(planned * 100).toFixed(0)}%`);
    }
  }
});

test('following the crew’s picks carries rookies and regulars through the whole story', () => {
  for (const profile of ['rookie', 'regular'] as const) {
    const runs = play(profile, 'picks');
    assert.deepEqual(stuck(runs), [], `${profile} never stalls`);
    // The windy harbor nights are the hard lesson; nothing else averages two races.
    for (const chapter of arcade) {
      const limit = chapter.trackId === 1 ? 4 : 2;
      assert.ok(triesAt(runs, chapter.id) <= limit, `${profile} chapter ID ${chapter.id}: ${triesAt(runs, chapter.id)}`);
    }
  }
});

test('the pre-race garage is what gets a struggling driver through Yokohama', () => {
  const stock = play('rookie', 'stock'), picks = play('rookie', 'picks');
  const harbor = new Set(arcade.filter(chapter => chapter.trackId === 1).map(chapter => chapter.id));
  assert.ok(stuck(stock).filter(chapter => harbor.has(chapter)).length >= FULL_PLAN.campaigns.length / 2, `stock rookies stall in the harbor: ${stuck(stock)}`);
  assert.ok(mean(picks.map(races)) * 1.5 < mean(stock.map(races)), `races: picks ${mean(picks.map(races))}, stock ${mean(stock.map(races))}`);
});

test('casual shopping never walls off the story', () => {
  // At most one stall in the 64 campaigns of each habit: a habit that walls off 5% of players fails that 84% of the
  // time (56% for none in 16), and one that walls off 1% passes it 86% of the time (85%).
  for (const policy of ['cheapest', 'priciest'] as const) for (const profile of ['rookie', 'regular'] as const) {
    const walls = stuck(play(profile, policy));
    assert.ok(walls.length <= 1, `${profile} buying the ${policy} part stalls at chapter IDs ${walls.join(', ')}`);
  }
});

test('Rei contests the lead through Act 3 without running away', () => {
  // First-try margin over the faster of Rei and Toru in Act 3: a regular on the
  // crew's picks wins those races, by under two seconds on average; a rookie
  // usually needs a retry.
  const act3 = (runs: readonly Campaign[]) => mean(runs.flatMap(run => arcade.flatMap((chapter, i) => chapter.act === 3 ? [run.leads[i]!] : [])));
  const regular = act3(play('regular', 'picks'));
  assert.ok(regular > 0 && regular < 60, `regular leads by ${regular.toFixed(1)} ticks`);
  assert.ok(act3(play('rookie', 'picks')) < 0, 'Rei beats a rookie on the first try');
  // A regular with a casual build races Rei for the win and loses it.
  for (const policy of ['cheapest', 'priciest'] as const) assert.ok(act3(play('regular', policy)) < 0, policy);
});
