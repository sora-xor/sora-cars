import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAPTERS } from '../src/game/story';
import { COURSE_TIPS } from '../src/game/story-pit';
import { STORY_TRIES, mean, type Campaign } from './helpers/garage-drivers';
import { FULL_PLAN, REPORT_PATH, balanceInputs, type BalanceReport } from './helpers/garage-balance';

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

test('each course plan opens with the best value for that course', () => {
  // Re-measured: each of the first three picks, the ones early chapters can afford,
  // saves rookies and regulars at least 90% as much time per yen as any part on offer.
  report.coursePlans.forEach((steps, track) => steps.forEach((step, i) => {
    assert.equal(step.pick, COURSE_TIPS[track]!.plan[i], `track ${track} step ${i + 1} was measured for the current plan`);
    assert.ok(step.perYen >= step.best * 0.9, `track ${track}: ${step.pick} ${step.perYen.toFixed(2)} vs ${step.bestPart} ${step.best.toFixed(2)} ticks per ¥1k`);
  }));
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
  for (const policy of ['cheapest', 'priciest'] as const) for (const profile of ['rookie', 'regular'] as const) {
    assert.deepEqual(stuck(play(profile, policy)), [], `${profile} buying the ${policy} part`);
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
