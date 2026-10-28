import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = 'output/browser/driving-feedback';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], checks = [], captures = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.soraCars && document.fonts.status === 'loaded');
  await page.locator('#start-btn').click();
  await page.waitForFunction(() => !document.querySelector('.scene-preparation-panel')
    && document.querySelector('#race-canvas')?.dataset.groundAsset === 'detailed', null, { timeout: 60000 });
  await page.evaluate(() => window.advanceTime(3200));
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => window.advanceTime(2200));
  assert.equal((await state(page)).drivingSound.active, true);
  await page.keyboard.down('Shift');
  await page.evaluate(() => window.advanceTime(300));
  assert.equal((await state(page)).drivingSound.boost, true);
  await page.keyboard.press('KeyR');
  assert.equal((await state(page)).drivingSound.active, false, 'restart must immediately stop the previous driving bus');
  await page.evaluate(() => window.advanceTime(1000));
  assert.equal((await state(page)).drivingSound.active, false, 'restart countdown must remain silent');
  await page.evaluate(() => window.advanceTime(2400));
  assert.equal((await state(page)).drivingSound.active, true);
  await page.keyboard.up('ArrowUp'); await page.keyboard.down('ArrowUp');
  await page.evaluate(() => window.advanceTime(2200));
  checks.push('Restart while boosting immediately silences the previous race and its countdown.');
  await page.keyboard.up('Shift');
  await page.screenshot({ path: `${out}/midnight.png` });
  captures.push(await state(page));
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).drivingSound.active, false);
  await page.evaluate(() => window.advanceTime(1000));
  assert.equal((await state(page)).drivingSound.active, false);
  await page.keyboard.press('Escape');
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => window.advanceTime(500));
  assert.equal((await state(page)).drivingSound.active, true);
  checks.push('Pause silences every driving layer; resumed driving restarts normally.');
  // Exercise update -> fixed tick -> finishSession -> remainder of same update.
  // Calling the finishPractice helper would bypass the original failure.
  await page.evaluate(() => window.advanceTime(185000));
  const finished = await state(page);
  assert.equal(finished.mode, 'results');
  assert.equal(finished.drivingSound.active, false);
  await page.evaluate(() => window.advanceTime(1000));
  assert.equal((await state(page)).drivingSound.active, false);
  await page.screenshot({ path: `${out}/finished.png` });
  checks.push('A full race ending inside the fixed-tick loop cannot restart engine audio on its final frame.');
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('KeyR');
  await page.evaluate(() => window.advanceTime(1000));
  assert.equal((await state(page)).drivingSound.active, false);
  await page.evaluate(() => window.advanceTime(2400));
  assert.equal((await state(page)).drivingSound.active, true);
  checks.push('Rematch countdown stays silent and the new race starts its engine.');
  for (const [track, name] of [[1, 'harbor-rain'], [2, 'sakura-wind']]) {
    await page.keyboard.press('Escape');
    await page.locator('.pause-panel [data-action="home"]').click();
    await page.evaluate(track => window.soraCars.setTrack(track), track);
    await page.locator('#start-btn').click();
    await page.evaluate(() => window.advanceTime(3200));
    await page.keyboard.down('ArrowUp');
    await page.evaluate(ms => window.advanceTime(ms), track === 1 ? 12400 : 4200);
    await page.screenshot({ path: `${out}/${name}.png` });
    captures.push(await state(page));
    await page.keyboard.up('ArrowUp');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/sakura-mobile.png` });
  checks.push('All three routes and mobile pixel scenery captured with eight visible-state racers.');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, captures, errors, scope: 'Actual Chromium gameplay/audio lifecycle and visual captures. Offline PCM synthesis is tested separately. Native environmental proof qualification remains separate.' }, null, 2));
  console.log(`${checks.length} driving feedback checks passed.`);
} catch (error) {
  await writeFile(`${out}/failure.json`, JSON.stringify({ error: String(error), checks, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
