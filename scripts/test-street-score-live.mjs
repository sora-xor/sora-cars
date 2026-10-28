import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const out = 'output/browser/street-score-live';
await mkdir(out, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const paths = ['src/ui/street-practice.ts', 'src/game/street/presentation.ts',
  'src/game/street/soundtrack-clock.ts', 'src/game/street/renderer.ts', 'scripts/test-street-score-live.mjs'];
const sources = Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(path))])));
const report = { kind: 'tokyo-real-clock-driving-audio', sources, checks: [], errors: [],
  simulatedTimeHookUsed: false, fullHumanRace: false, proofQualified: false };
const check = (value, label) => { assert.ok(value, label); report.checks.push(label); };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5173'}/#/street/tokyo-1986`);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).street?.phase === 'ready');
  if (!(await state()).music) await page.keyboard.press('KeyM');
  await page.locator('[data-action="street-start"]').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.street?.phase === 'driving' && state.tick > 20 && state.street.musicPlaying && state.drivingSound.active;
  }, null, { timeout: 15000 });
  let current = await state();
  check(current.street.controls === 1 && current.player.speedMmPerTick > 0, 'real held throttle crosses countdown and moves the native car');
  check(Math.abs(current.street.soundtrackSeconds - current.tick / 30) < .6, 'recording and simulation align under the normal animation clock');
  check(current.drivingSound.active && current.street.musicPlaying, 'original recording and engine both play during actual driving');
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('Space'); await page.waitForTimeout(300);
  current = await state();
  check((current.street.controls & 25) === 25 && current.player.bodyYawMicroturn !== current.player.velocityYawMicroturn,
    'real steering and drift preserve distinct native body and velocity headings');
  await page.keyboard.up('Space'); await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: `${out}/driving.png` });
  await page.keyboard.press('KeyM'); await page.waitForTimeout(150);
  check(!(await state()).street.musicPlaying && (await state()).drivingSound.active, 'muting music preserves the driving engine');
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).street.musicPlaying);
  await page.keyboard.press('Escape'); const paused = await state(); await page.waitForTimeout(250);
  current = await state();
  check(current.tick === paused.tick && !current.street.musicPlaying && !current.drivingSound.active, 'real pause freezes simulation and stops both audio layers');
  await page.keyboard.press('Escape');
  await page.waitForFunction(tick => {
    const state = JSON.parse(window.render_game_to_text());
    return state.tick > tick && state.street.musicPlaying && state.drivingSound.active;
  }, paused.tick);
  check((await state()).tick > paused.tick, 'resume continues native simulation and both audio layers');
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).street.phase === 'ready');
  current = await state();
  check(current.tick === 0 && current.street.soundtrackSeconds === 0 && !current.drivingSound.active, 'restart returns to fresh genesis and an unplayed recording');
  await page.locator('[data-action="street-exit"]').click();
  check((await state()).mode === 'home' && !(await state()).drivingSound.active, 'exit restores home without an engine tail');
  check(report.errors.length === 0, 'real-time browser flow has no JavaScript or console errors');
  for (const [path, expected] of Object.entries(sources)) assert.equal(hash(await readFile(path)), expected);
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks: report.checks.length, errors: report.errors }));
} catch (error) {
  report.failure = String(error); throw error;
} finally {
  await writeFile(`${out}/observations.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
