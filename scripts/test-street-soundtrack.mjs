import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchChromium } from './lib/browser-launch.mjs';

// Irohazaka's song lasts 3:07, and its races run about four minutes on the
// driving model. While the player races, the song plays from the top again;
// once the player's race is over (the line, a wreck or the time limit) it
// finishes its four-bar phrase and plays its own final eight bars once, over
// the results too. This checks the real <audio> element in practice and in
// replays. Usage: GAME_URL=<static build> node scripts/test-street-soundtrack.mjs
const base = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = 'output/browser/street-soundtrack'; await mkdir(out, { recursive: true });
const SONG = 187.08, CODA = 0.08 + 12 * 186 / 13, PHRASE = 186 / 13 / 2, TIME_LIMIT_TICKS = 12000;
const report = { kind: 'irohazaka-soundtrack-continuation', base, checks: [], errors: [], timings: {} };
const check = (value, label) => { assert.ok(value, label); report.checks.push(label); };
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const seek = (page, tick) => page.locator('#street-seek').evaluate((slider, tick) => {
  slider.value = String(tick); slider.dispatchEvent(new Event('change', { bubbles: true }));
}, tick);
/** The rule under test, in file seconds: `time` and `end` are seconds from the start line. */
function position(time, end) {
  if (end === null || time < end) return time % SONG;
  const at = end % SONG, boundary = CODA - Math.floor((CODA - at) / PHRASE) * PHRASE, since = time - end;
  return at >= CODA || boundary >= CODA || since < boundary - at ? at + since : CODA + since - (boundary - at);
}
/** Pumps frames until the recording plays where the clock wants it, or is silent at the song's end. */
async function music(page, expected, label) {
  const silent = expected >= SONG - 0.06;
  let street;
  for (let i = 0; i < 120; i++) {
    await advance(page, 0); await page.waitForTimeout(30);
    street = (await state(page)).street;
    if (silent ? !street.musicPlaying : street.musicPlaying && Math.abs(street.soundtrackSeconds - street.soundtrackTarget) < 0.55) break;
  }
  const target = silent ? street.soundtrackTarget >= SONG - 0.06 : Math.abs(street.soundtrackTarget - expected) < 0.1;
  check(target && (silent ? !street.musicPlaying : street.musicPlaying && Math.abs(street.soundtrackSeconds - street.soundtrackTarget) < 0.55),
    `${label} (${silent ? 'silent' : `${expected.toFixed(2)} s`})`);
}
async function ready(page, timeout) {
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text?.() ?? '{}').street?.phase === 'ready', null, { timeout });
}
const timed = async (name, work) => { const began = Date.now(); const result = await work(); report.timings[name] = Date.now() - began; return result; };

const browser = await launchChromium({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  // A long headless run must not pause on focus changes.
  await page.addInitScript(() => {
    addEventListener('blur', event => event.stopImmediatePropagation(), true);
    document.addEventListener('visibilitychange', event => event.stopImmediatePropagation(), true);
  });
  await page.goto(`${base}/#/street/irohazaka-1986`, { timeout: 120000 });
  await ready(page, 120000);
  check((await state(page)).music, 'music is on');

  console.log('Practice: the player waits at the start line while the field races past the song\'s end');
  await advance(page, 0); await page.locator('[data-action="street-start"]').click(); await advance(page, 3500);
  let s = await state(page);
  check(s.street.phase === 'driving', 'Irohazaka practice is racing');
  await music(page, s.tick / 30, 'the song starts with the race');
  await timed('liveRaceTo195sMs', async () => { while ((await state(page)).tick < 195 * 30) await advance(page, 5000); });
  s = await state(page);
  check(s.street.phase === 'driving' && s.street.fullStreetState.cars[0].status === 0, 'the player is still racing after the song\'s authored end');
  await music(page, position(s.tick / 30, null), 'the song plays again from the top while the player races');

  console.log('Practice: the time limit ends the player\'s race');
  await timed('timeLimitCompletionMs', () => page.evaluate(() => window.soraCars.finishStreetPractice()));
  s = await state(page);
  check(s.street.phase === 'results' && s.street.fullStreetState.cars[0].status === 3 && s.tick === TIME_LIMIT_TICKS, 'the time limit ends the player\'s race at 6:40');
  check(!s.drivingSound.active, 'results stop the engine');
  const limit = TIME_LIMIT_TICKS / 30, wait = CODA - Math.floor((CODA - limit % SONG) / PHRASE) * PHRASE - limit % SONG;
  await music(page, position(limit, limit), 'at the time limit the song finishes its four-bar phrase');
  await advance(page, (wait + 1) * 1000);
  await music(page, CODA + 1, 'then its own final eight bars play over the results');
  await advance(page, (SONG - CODA) * 1000);
  await music(page, SONG, 'then the music stops and does not start again');
  await page.screenshot({ path: `${out}/practice-results.png` });

  console.log('Replay of the time-limit run');
  await page.locator('[data-action="street-replay"]').click();
  await timed('timeLimitVerificationMs', () => ready(page, 300000));
  check((await state(page)).street.verification === 'local-reexecution', 'the replay re-executes the whole run');
  await page.locator('[data-action="street-start"]').click(); await advance(page, 500);
  await music(page, (await state(page)).tick / 30, 'the replay\'s song starts at the start line');
  for (const tick of [6000, 11850]) {
    await seek(page, tick); await page.keyboard.press('Escape');
    await music(page, position(tick / 30, null), `a replay seek to ${(tick / 30).toFixed(0)} s lands on the same note`);
    await page.keyboard.press('Escape');
  }
  await seek(page, TIME_LIMIT_TICKS);
  check((await state(page)).street.phase === 'results', 'seeking to the end shows the replay\'s results');
  await music(page, position(limit, limit), 'the replay\'s results finish the same phrase');
  await advance(page, (wait + 1) * 1000);
  await music(page, CODA + 1, 'and play the same final eight bars');

  console.log('Practice and replay: the player crosses the line');
  await page.locator('[data-action="street-restart"]').click(); await ready(page, 120000);
  await page.locator('[data-action="street-start"]').click(); await advance(page, 3500);
  await timed('finishCompletionMs', () => page.evaluate(() => window.soraCars.finishStreetPractice()));
  s = await state(page);
  const record = JSON.parse(await page.evaluate(() => JSON.parse(localStorage.getItem('sora-cars:street-history'))[0]));
  check(s.street.phase === 'results' && record.outcome['c0.status'] === 1, 'the player crosses the finish line');
  const line = record.outcome['c0.finishMicroticks'] / 1e6 / 30, last = record.outcome.tick / 30;
  report.finish = { playerSeconds: line, raceSeconds: last };
  await music(page, position(last, line), 'the results continue the phrase or ending begun at the player\'s line');
  await page.locator('[data-action="street-replay"]').click();
  await timed('finishVerificationMs', () => ready(page, 300000));
  await page.locator('[data-action="street-start"]').click(); await advance(page, 500);
  const before = Math.floor(line * 30) - 45;
  await seek(page, before); await page.keyboard.press('Escape');
  await music(page, position(before / 30, null), 'the replay seeks to just before the player\'s line');
  if (last - line >= 1) {
    await advance(page, 2000); s = await state(page);
    check(s.street.phase === 'driving' && s.tick / 30 > line, 'the replay crosses the player\'s line while the field races on');
    await music(page, position(s.tick / 30, line), 'crossing the line, the song finishes its phrase or begins its ending');
  }
  const coda = line + CODA - Math.floor((CODA - line % SONG) / PHRASE) * PHRASE - line % SONG + 1;
  if (line % SONG < CODA && coda * 30 < record.outcome.tick) {
    await page.keyboard.press('Escape'); await seek(page, Math.ceil(coda * 30)); await page.keyboard.press('Escape');
    await music(page, position(Math.ceil(coda * 30) / 30, line), 'a replay seek after the line lands in the song\'s own ending');
  }

  check(report.errors.length === 0, 'browser has no JavaScript or console errors');
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks: report.checks.length, timings: report.timings, finish: report.finish, errors: report.errors }));
} finally {
  await writeFile(`${out}/observations.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
