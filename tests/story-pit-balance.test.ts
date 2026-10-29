import test from 'node:test';
import assert from 'node:assert/strict';
import { techNode } from '../src/game/garage-tech';
import { CHAPTERS } from '../src/game/story';
import { COURSE_TIPS } from '../src/game/story-pit';
import { courseTicks, mean, purchasable, storyCampaign, type Campaign, type SpendPolicy } from './helpers/garage-drivers';

// Whole-story campaigns with the reference drivers, played as main.ts runs story
// mode: each chapter's cutscenes, the pre-race garage, the race, prize money, and
// retries until the objective is met. `npm run balance:garage` prints the tables.
const seeds = [1, 2, 3, 4, 5, 6, 7, 8], LIMIT = 10;
const campaigns = new Map<string, Campaign[]>();
const play = (profile: 'rookie' | 'regular', policy: SpendPolicy) => {
  const key = `${profile}:${policy}`;
  if (!campaigns.has(key)) campaigns.set(key, seeds.map(seed => storyCampaign(profile, seed, policy, LIMIT)));
  return campaigns.get(key)!;
};
const stuck = (runs: Campaign[]) => runs.flatMap(run => run.tries.flatMap((tries, chapter) => tries > LIMIT ? [chapter + 1] : []));
const races = (run: Campaign) => run.tries.reduce((sum, tries) => sum + tries, 0);
const triesAt = (runs: Campaign[], chapter: number) => mean(runs.map(run => run.tries[chapter]!));

test('each course plan opens with the best value for that course', () => {
  // Re-measured: each of the first three picks, the ones early chapters can afford,
  // saves rookies and regulars at least 90% as much time per yen as any part on offer.
  for (const [trackId, tip] of COURSE_TIPS.entries()) {
    const owned: string[] = [];
    for (const id of tip.plan.slice(0, 3)) {
      const base = courseTicks(trackId, owned), perYen = (part: string) => (base - courseTicks(trackId, [...owned, part])) / techNode(part)!.cost;
      const best = Math.max(...purchasable(owned).map(node => perYen(node.id)));
      assert.ok(perYen(id) >= best * 0.9, `track ${trackId}: ${id} ${(perYen(id) * 1000).toFixed(2)} vs best ${(best * 1000).toFixed(2)} ticks per ¥1k`);
      owned.push(id);
    }
  }
});

test('following the crew’s picks carries rookies and regulars through the whole story', () => {
  for (const profile of ['rookie', 'regular'] as const) {
    const runs = play(profile, 'picks');
    assert.deepEqual(stuck(runs), [], `${profile} never stalls`);
    // The first harbor night is the hard lesson; nothing else averages two races.
    assert.ok(triesAt(runs, 1) <= 4, `${profile} chapter 2: ${triesAt(runs, 1)}`);
    CHAPTERS.forEach((_, chapter) => chapter !== 1 && assert.ok(triesAt(runs, chapter) < 2, `${profile} chapter ${chapter + 1}: ${triesAt(runs, chapter)}`));
  }
});

test('the pre-race garage is what gets a struggling driver through Yokohama', () => {
  const stock = play('rookie', 'stock'), picks = play('rookie', 'picks');
  const harbor = new Set(CHAPTERS.filter(chapter => chapter.trackId === 1).map(chapter => chapter.id + 1));
  assert.ok(stuck(stock).filter(chapter => harbor.has(chapter) && chapter !== 11).length >= seeds.length / 2, `stock rookies stall in the harbor: ${stuck(stock)}`);
  assert.ok(mean(picks.map(races)) * 2 < mean(stock.map(races)), `races: picks ${mean(picks.map(races))}, stock ${mean(stock.map(races))}`);
});

test('casual shopping never walls off the story', () => {
  for (const policy of ['cheapest', 'priciest'] as const) for (const profile of ['rookie', 'regular'] as const) {
    assert.deepEqual(stuck(play(profile, policy)), [], `${profile} buying the ${policy} part`);
  }
});

test('Rei contests the lead through Act 3 without running away', () => {
  // First-try margin over the faster of Rei and Toru in chapters 7–12: a driver on
  // the crew's picks wins those races, by under two seconds on average.
  for (const profile of ['rookie', 'regular'] as const) {
    const lead = mean(play(profile, 'picks').flatMap(run => run.leads.slice(6)));
    assert.ok(lead > 0 && lead < 60, `${profile} leads by ${lead.toFixed(1)} ticks`);
  }
  // Casual builds race Rei for the win and often lose it.
  assert.ok(mean(play('rookie', 'cheapest').flatMap(run => run.leads.slice(6))) < mean(play('rookie', 'picks').flatMap(run => run.leads.slice(6))));
});
