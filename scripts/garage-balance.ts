// Garage tech-tree balance on the local driving model. Run after changing part effects,
// prices, opponent builds, the reference drivers or the driving model:
//   npm run balance:garage            measure everything and write tests/fixtures/garage-balance.json
//   npm run balance:garage -- --quick  a rough pass for iterating on effects; writes tmp/ only
// Races run on every core (WORKERS=n to change). tests/garage-balance.test.ts and
// tests/story-pit-balance.test.ts re-run the report's fingerprint races and enforce its limits.
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { PRACTICE_FIELDS, STORY_REI, STORY_TORU, TECH_NODES, buildValue } from '../src/game/garage-tech';
import { TRACKS } from '../src/game/rules';
import { CHAPTERS } from '../src/game/story';
import { AUDIENCE_PROFILES, PROFILES, STORY_TRIES, mean } from '../tests/helpers/garage-drivers';
import {
  FIELD_BUILDS, FULL_PLAN, POLICIES, QUICK_PLAN, REPORT_PATH, RESCUE_BUILDS, audienceGains, measureBalance, raceGains, runJob,
  type BalanceReport, type Job, type JobResult, type JobRunner,
} from '../tests/helpers/garage-balance';

if (!isMainThread) parentPort!.on('message', ({ id, job }: { id: number; job: Job }) => parentPort!.postMessage({ id, result: runJob(job) }));
else await main();

/** Every core races jobs off one queue; results come back in job order. */
function pool(size: number): { run: JobRunner; close: () => Promise<void> } {
  const waiting: { id: number; job: Job }[] = [], pending = new Map<number, (result: JobResult) => void>(), idle: Worker[] = [];
  let next = 0, done = 0, total = 0;
  const workers = Array.from({ length: size }, () => {
    const worker = new Worker(new URL(import.meta.url));
    worker.on('message', ({ id, result }: { id: number; result: JobResult }) => { pending.get(id)!(result); pending.delete(id); done++; dispatch(worker); });
    worker.on('error', error => { console.error(error); process.exit(1); });
    return worker;
  });
  const dispatch = (worker: Worker) => { const task = waiting.shift(); if (task) worker.postMessage(task); else idle.push(worker); };
  idle.push(...workers);
  const progress = setInterval(() => { if (total > done) process.stderr.write(`\r${done}/${total} races   `); }, 2000);
  return {
    run: jobs => Promise.all(jobs.map(job => new Promise<JobResult>(resolve => {
      const id = next++; total++;
      pending.set(id, resolve); waiting.push({ id, job });
      const worker = idle.pop(); if (worker) dispatch(worker);
    }))),
    close: async () => { clearInterval(progress); await Promise.all(workers.map(worker => worker.terminate())); },
  };
}

async function main(): Promise<void> {
  const quick = process.argv.includes('--quick'), plan = quick ? QUICK_PLAN : FULL_PLAN;
  const workers = Number(process.env.WORKERS ?? Math.max(1, availableParallelism() - 1)), started = performance.now();
  const { run, close } = pool(workers);
  const report = await measureBalance(plan, run, line => process.stderr.write(`\r${line}\n`));
  await close();
  print(report);
  const path = quick ? new URL('../tmp/garage-balance-quick.json', import.meta.url) : REPORT_PATH;
  mkdirSync(new URL('.', path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 1)}\n`);
  console.log(`\nWrote ${path.pathname} (${plan.name} plan, ${workers} workers, ${((performance.now() - started) / 60000).toFixed(1)} min).`);
}

function print(report: BalanceReport): void {
  const pad = (value: string | number, width: number) => String(value).padStart(width);
  console.log(`Ticks saved per race (30 ticks = 1 s), ${report.plan} plan, interquartile means. Columns: Hakone / Yokohama / Nikko.\n`);
  console.log(`${'part'.padEnd(18)} ${'where'.padEnd(5)} ${PROFILES.map(p => p.padEnd(15)).join('')} ${'audience'.padEnd(13)} value  per ¥1k`);
  for (const node of TECH_NODES) {
    const part = report.parts[node.id]!, value = mean(audienceGains(report, node.id));
    console.log(`${node.id.padEnd(18)} ${part.scenario.padEnd(5)} ${PROFILES.map(p => (part.gains[p]?.map(v => pad(Math.round(v), 4)).join('') ?? '   –').padEnd(15)).join('')} ${`${node.bestFor} (${AUDIENCE_PROFILES[node.bestFor].length})`.padEnd(13)} ${pad(value.toFixed(1), 5)}  ${pad((value / node.cost * 1000).toFixed(2), 6)}`);
  }
  console.log(`\nRACE_GAINS (seconds a race, Hakone / Yokohama / Nikko):\n${JSON.stringify(raceGains(report))}`);
  console.log(`\nA finished car saves ${(['regular', 'pro', 'ace'] as const).map(p => `${p} ${report.finished[p].map(v => `${(v * 100).toFixed(1)}%`).join('/')}`).join(', ')}.`);
  console.log(`Clear-road race times, stock → finished (s): ${PROFILES.map(p => `${p} ${report.pace[p].stock.map((t, i) => `${(t / 30).toFixed(1)}→${(report.pace[p].finished[i]! / 30).toFixed(1)}`).join(' ')}`).join(' | ')}`);
  console.log('\nPractice fields: a pro\'s podiums from the 7th grid spot, every lane on the three tracks (places per track).');
  for (const field of PRACTICE_FIELDS) console.log(`${field.id.padEnd(13)} ×${(field.prize / 100).toFixed(1)}  ${Object.keys(FIELD_BUILDS).map(label => {
    const places = report.fields[field.id][label]!;
    return `${label} ${places.flat().filter(place => place <= 3).length}/${places.flat().length} [${places.map(track => track.join('')).join(' ')}]`;
  }).join('  ')}`);
  console.log(`\nStock pro meets the objective: ${Object.entries(report.story.stock).map(([id, ok]) => `ID ${id} ${ok ? 'yes' : 'no'}`).join(', ')}.`);
  console.log(`Harbor chapters, regular clear rate stock → modest build: ${Object.entries(report.story.harbor).map(([id, h]) => `ID ${id} ${h.stock.toFixed(2)} → ${h.build.toFixed(2)} (¥${h.budget / 1000}k)`).join(', ')}.`);
  console.log(`First harbor night, rookie clear rate: ${Object.entries(report.story.rescue).map(([build, r]) => `${build} ${r.toFixed(2)} (¥${buildValue(RESCUE_BUILDS[build as keyof typeof RESCUE_BUILDS]) / 1000}k)`).join(', ')}.`);
  console.log(`Equal cars, regular clear rate by chapter id: ${Object.entries(report.story.equal).map(([id, r]) => `${id}:${Math.round(r * 100)}%`).join(' ')}.`);
  const arcade = CHAPTERS.filter(c => c.trackId !== undefined);
  console.log(`\nStory campaigns, as story mode plays them. Mean races per Arcade chapter (✗ = a driver still stuck after ${STORY_TRIES}). Rei/Toru budgets by chapter id: ${arcade.map(c => `${STORY_REI[c.id]}/${STORY_TORU[c.id]}`).join(' ')} (¥k).`);
  console.log(`${'garage habit'.padEnd(18)} ${arcade.map(c => `id${pad(c.id, 2)}`.padStart(5)).join('')}  total  Act 3 lead`);
  for (const policy of POLICIES) for (const profile of ['rookie', 'regular'] as const) {
    const runs = report.campaigns[`${profile}:${policy}`]!;
    const cells = arcade.map((_, i) => { const tries = runs.map(run => run.tries[i]!); return `${mean(tries).toFixed(1)}${tries.some(t => t > STORY_TRIES) ? '✗' : ' '}`.padStart(5); });
    const act3 = arcade.flatMap((c, i) => c.act === 3 ? [i] : []);
    console.log(`${`${policy} ${profile}`.padEnd(18)} ${cells.join('')}  ${pad(mean(runs.map(run => run.tries.reduce((a, b) => a + b, 0))).toFixed(1), 5)}  ${pad((mean(runs.flatMap(run => act3.map(i => run.leads[i]!))) / 30).toFixed(1), 5)} s`);
  }
  console.log('\nCourse plans: each opening pick against the best time per yen on offer (ticks per ¥1k).');
  report.coursePlans.forEach((steps, track) => console.log(`${TRACKS[track]!.name.padEnd(16)} ${steps.map(s => `${s.pick} ${s.perYen.toFixed(2)} (best ${s.bestPart} ${s.best.toFixed(2)})`).join('  →  ')}`));
  console.log('\nBest time per yen for rookies and regulars, re-measured after each part:');
  report.bestPlans.forEach((plan, track) => console.log(`${TRACKS[track]!.name.padEnd(16)} ${plan.join(' → ')}`));
}
