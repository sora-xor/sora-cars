import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'output/browser/replay-cameras'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true }), errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.soraCars && document.fonts.status === 'loaded');
  await page.locator('#start-btn').click();
  await page.evaluate(() => window.advanceTime(3200));
  await page.keyboard.down('ArrowUp'); await page.evaluate(() => window.advanceTime(5000)); await page.keyboard.up('ArrowUp');
  await page.evaluate(() => window.soraCars.finishPractice());
  await page.locator('[data-action="watch-last"]').click();
  await page.evaluate(() => window.advanceTime(3800));
  const before = await page.evaluate(() => window.soraCars.state());
  for (const angle of ['chase', 'bumper', 'aerial']) {
    assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).replayCamera), angle);
    await page.screenshot({ path: `${out}/${angle}.png` });
    assert.deepEqual(await page.evaluate(() => window.soraCars.state()), before, 'camera switching must not alter the replay state or clock');
    await page.locator('[data-action="replay-camera"]').click();
    await page.evaluate(() => window.advanceTime(0));
    checks.push(angle);
  }
  await page.keyboard.press('KeyC');
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).replayCamera), 'bumper');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('[data-action="home"]').filter({ visible: true }).last().click();
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5173'}/#/settings`);
  await page.waitForSelector('.radio-track');
  const musicCount = await page.evaluate(async () => (await import('/src/game/music-score.ts')).MUSIC_LIBRARY.length);
  assert.equal(await page.locator('.radio-track').count(), musicCount);
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).music), true, 'music is enabled after loading the settings page');
  await page.locator('.sound-button').click();
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).music), false);
  await page.locator('[data-action="music-track-8"]').click();
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).music), true);
  await page.screenshot({ path: `${out}/jukebox.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, errors, scope: `Actual Chromium: three cameras preserve replay state, keyboard camera switch, mobile overflow, ${musicCount}-song jukebox playback activation.` }, null, 2));
  console.log(`Replay camera and ${musicCount}-song jukebox browser checks passed`);
} finally { await browser.close(); }
