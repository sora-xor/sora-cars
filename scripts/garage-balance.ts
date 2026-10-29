// Garage tech-tree balance report. Run after changing part effects, prices,
// opponent builds or the race physics:  npm run balance:garage [-- --quick]
// Every number comes from simulated races with the reference drivers in
// tests/helpers/garage-drivers.ts; tests/garage-balance.test.ts and
// tests/story-pit-balance.test.ts enforce the limits.
import { TECH_NODES, PRACTICE_FIELDS, STORY_REI, STORY_TORU, rivalBuild, tuneFor, type RivalStyle } from '../src/game/garage-tech';
import { TRACKS } from '../src/game/rules';
import { CHAPTERS } from '../src/game/story';
import { COURSE_TIPS } from '../src/game/story-pit';
import { STOCK_TUNE } from '../src/game/tuned-engine';
import { AUDIENCE_PROFILES, FULL_PLAN, PROFILES, QUICK_PLAN, audienceGain, fieldPlace, gain, mean, partContext, storyCampaign, storyCleared, type SpendPolicy } from '../tests/helpers/garage-drivers';

const plan = process.argv.includes('--quick') ? QUICK_PLAN : FULL_PLAN;
const pad = (value: string | number, width: number) => String(value).padStart(width);
console.log(`Ticks saved per race (30 ticks = 1 s), ${plan === FULL_PLAN ? 'full' : 'quick'} plan. Columns: Hakone / Yokohama / Nikko.\n`);
console.log(`${'part'.padEnd(18)} ${PROFILES.map(p => p.padEnd(14)).join('')} audience          value  per ¥1k`);
for (const node of TECH_NODES) {
  const gains = gain(partContext(node.id), node.id, plan), value = audienceGain(gains, node.bestFor);
  console.log(`${node.id.padEnd(18)} ${PROFILES.map(p => gains[p].map(v => pad(Math.round(v), 4)).join('').padEnd(14)).join('')} ${`${node.bestFor} (${AUDIENCE_PROFILES[node.bestFor].length})`.padEnd(17)} ${pad(value.toFixed(1), 5)}  ${pad((value / node.cost * 1000).toFixed(2), 6)}`);
}

// Seconds a race on each course for each part's audience: RACE_GAINS in src/game/part-effects.ts.
const raceGains = Object.fromEntries(TECH_NODES.map(node => {
  const gains = gain(partContext(node.id), node.id, plan);
  return [node.id, [0, 1, 2].map(track => Math.round(mean(AUDIENCE_PROFILES[node.bestFor].map(profile => gains[profile][track]!)) / 3) / 10)];
}));
console.log(`\nRACE_GAINS (seconds a race, Hakone / Yokohama / Nikko):\n${JSON.stringify(raceGains)}`);
console.log('\nPractice fields: places on the three tracks from the player\'s 7th grid spot, by build value.');
const budgets = [0, 60000, 180000, 420000, 640000];
for (const field of PRACTICE_FIELDS) {
  const rows = (['power', 'boost', 'tough'] as RivalStyle[]).map(style => `${style.padEnd(6)} ${budgets.map(b => `${pad(b / 1000, 3)}k:${[0, 1, 2].map(t => fieldPlace(field.id, t, 'pro', tuneFor(rivalBuild(style, b)))).join('')}`).join(' ')}`);
  console.log(`${field.id.padEnd(13)} ×${(field.prize / 100).toFixed(1)}  ${rows.join('  |  ')}`);
}

console.log('\nStory campaigns, played as story mode runs: cutscenes, pre-race garage, race, prize money, retry until cleared.');
console.log(`Mean races per chapter over 8 drivers (✗ = a driver still stuck after 10). Rivals by chapter, Rei/Toru: ${CHAPTERS.map(c => `${STORY_REI[c.id]}/${STORY_TORU[c.id]}`).join(' ')} (¥k).`);
console.log(`${'garage habit'.padEnd(18)} ${CHAPTERS.map(c => `ch${pad(c.id + 1, 2)}`.padStart(5)).join('')}  total  Act 3 lead`);
const campaignSeeds = [1, 2, 3, 4, 5, 6, 7, 8];
for (const policy of ['picks', 'cheapest', 'priciest', 'stock'] as SpendPolicy[]) for (const profile of ['rookie', 'regular'] as const) {
  const runs = campaignSeeds.map(seed => storyCampaign(profile, seed, policy));
  const cells = CHAPTERS.map(c => { const tries = runs.map(run => run.tries[c.id]!); return `${mean(tries).toFixed(1)}${tries.some(t => t > 10) ? '✗' : ' '}`.padStart(5); });
  console.log(`${`${policy} ${profile}`.padEnd(18)} ${cells.join('')}  ${pad(mean(runs.map(run => run.tries.reduce((a, b) => a + b, 0))).toFixed(1), 5)}  ${pad(mean(runs.flatMap(run => run.leads.slice(6))).toFixed(0), 5)} ticks`);
}
const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
console.log(`\nEqual cars, the original game: share of 12 regular drivers meeting each objective.\n${CHAPTERS.map(c => `ch${pad(c.id + 1, 2)} ${pad(Math.round(seeds.filter(seed => storyCleared(c.id, 'regular', STOCK_TUNE, seed, true)).length / seeds.length * 100), 3)}%`).join('  ')}`);
console.log('\nCrew picks by course (best time per yen for rookies and regulars, re-measured after each part):');
for (const [trackId, tip] of COURSE_TIPS.entries()) console.log(`${TRACKS[trackId]!.name.padEnd(16)} ${tip.plan.join(' → ')}`);
