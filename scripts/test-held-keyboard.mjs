import { launchChromium } from './lib/browser-launch.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = 'output/browser/held-keyboard';
const C = { throttle: 1, brake: 2, left: 4, right: 8, drift: 16, boost: 32 };
await mkdir(out, { recursive: true });
const browser = await launchChromium({ headless: true });
const errors = [], checks = [], captures = [];
let page;
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(ms => window.advanceTime(ms), ms);
const drive = async (name, expected, ms = 100) => {
  const before = await state();
  await advance(ms);
  const after = await state();
  captures.push({ name, ...after });
  assert.equal(after.mode, 'race', `${name}: race is still active`);
  assert.equal(after.paused, false, `${name}: race is not paused`);
  assert.equal(after.controls, expected, `${name}: held physical keys supply the expected controls`);
  assert.ok(after.tick > before.tick, `${name}: simulation ticks advance`);
  if (expected & C.throttle) assert.ok(after.player.progress > before.player.progress, `${name}: held throttle keeps the car moving forward`);
  return after;
};
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.soraCars && document.fonts.status === 'loaded');
  await page.evaluate(() => {
    window.advanceTime(0);
    window.heldKeyboardEvents = [];
    for (const type of ['keydown', 'keyup']) window.addEventListener(type, event => {
      window.heldKeyboardEvents.push({ type, code: event.code, repeat: event.repeat });
    });
  });
  await page.locator('#start-btn').click();
  // Cold visual preparation precedes the unchanged three-second countdown.
  await page.waitForFunction(() => !document.querySelector('.scene-preparation-panel')
    && document.querySelector('#race-canvas')?.dataset.groundAsset === 'detailed', null, { timeout: 60000 });
  await advance(3200);
  // This ArrowUp press stays physically down through boost cycling, depletion,
  // steering, drift, pause/resume and restart. No repeat events are required.
  await page.keyboard.down('ArrowUp');
  await drive('initial held throttle', C.throttle, 1000);
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.keyboard.down('ShiftLeft');
    await drive(`cycle ${cycle}: left shift`, C.throttle | C.boost);
    await page.keyboard.down('ShiftRight');
    await page.keyboard.down('KeyX');
    await drive(`cycle ${cycle}: overlapping boost keys`, C.throttle | C.boost);
    await page.keyboard.up('ShiftLeft');
    await drive(`cycle ${cycle}: left shift released`, C.throttle | C.boost);
    await page.keyboard.up('ShiftRight');
    await drive(`cycle ${cycle}: right shift released`, C.throttle | C.boost);
    await page.keyboard.up('KeyX');
    await drive(`cycle ${cycle}: all boost keys released`, C.throttle);
  }
  checks.push('One held ArrowUp survives repeated ShiftLeft, ShiftRight and X overlap/release cycles.');
  await page.keyboard.down('ShiftLeft');
  const beforeExhaustion = await state();
  let depleted;
  for (let step = 0; step < 30; step++) depleted = await drive(`boost depletion ${step}`, C.throttle | C.boost);
  assert.ok(depleted.player.energy < 25, 'boost depletes the battery while throttle stays held');
  assert.ok(depleted.player.energy < beforeExhaustion.player.energy, 'boost spends actual energy');
  await page.keyboard.up('ShiftLeft');
  const refilled = await drive('battery refills with forward still held', C.throttle, 1500);
  assert.ok(refilled.player.energy > depleted.player.energy, 'energy refills after releasing boost');
  await page.screenshot({ path: `${out}/boost-and-refill.png` });
  checks.push('Exhausting boost and refilling its battery keep forward input and progress continuous.');
  for (const [key, bit] of [['ArrowLeft', C.left], ['ArrowRight', C.right]]) {
    await page.keyboard.down(key);
    await page.keyboard.down('Space');
    await drive(`${key} with drift`, C.throttle | bit | C.drift);
    await page.keyboard.up('Space');
    await drive(`${key} after drift release`, C.throttle | bit);
    await page.keyboard.up(key);
    await drive(`${key} released`, C.throttle);
  }
  checks.push('Releasing steering or drift preserves the continuously held forward key.');
  await page.keyboard.down('ShiftLeft');
  await drive('boost before pause', C.throttle | C.boost);
  await page.keyboard.press('Escape');
  const paused = await state();
  assert.equal(paused.paused, true);
  await advance(1000);
  assert.equal((await state()).tick, paused.tick, 'pause freezes the simulation');
  assert.equal((await state()).drivingSound.active, false, 'pause silences driving audio');
  await page.keyboard.press('Escape');
  await drive('resume while ArrowUp and boost remain physically held', C.throttle | C.boost);
  await page.screenshot({ path: `${out}/held-after-resume.png` });
  checks.push('Pause/resume preserves held ArrowUp and boost without a repeat or second keydown.');
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.press('KeyR');
  assert.equal((await state()).countdown, 3);
  await advance(1000);
  assert.equal((await state()).drivingSound.active, false, 'restarted countdown stays silent');
  await advance(2400);
  await drive('restart with ArrowUp continuously held', C.throttle);
  await page.screenshot({ path: `${out}/held-after-restart.png` });
  checks.push('Restart and its countdown preserve the original physical forward press.');
  await page.keyboard.up('ArrowUp');
  await drive('real forward keyup clears throttle', 0);
  checks.push('An actual ArrowUp keyup clears throttle immediately.');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ShiftRight');
  await drive('keys held before releasing during pause', C.throttle | C.boost);
  await page.keyboard.press('Escape');
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ShiftRight');
  await page.keyboard.press('Escape');
  await drive('keys released during pause stay released on resume', 0);
  checks.push('Physical releases during pause are respected on resume.');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('KeyX');
  await drive('held keys before losing focus', C.throttle | C.boost);
  // Inject only the browser lifecycle notification. Keyboard input throughout
  // this regression uses Playwright's real down/up events, with no keyup here.
  await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
  assert.equal((await state()).paused, true, 'focus loss pauses driving');
  await page.keyboard.press('Escape');
  await drive('focus loss clears possibly stale keys before resume', 0);
  await page.keyboard.up('KeyX');
  await page.keyboard.up('ArrowUp');
  checks.push('Blur clears stale keyboard state even when keyup was never delivered.');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('KeyX');
  await drive('held keys before hiding a paused page', C.throttle | C.boost);
  await page.keyboard.press('Escape');
  // Explicit visibility lifecycle counterpart: no physical keyup arrives while
  // the page is hidden, including when the user had already paused it.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  assert.equal((await state()).paused, true);
  await page.keyboard.press('Escape');
  await drive('hidden paused page clears stale keys before resume', 0);
  await page.keyboard.up('KeyX');
  await page.keyboard.up('ArrowUp');
  checks.push('Hiding an already paused page clears stale keys before returning.');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ShiftLeft');
  await drive('held keys before leaving race', C.throttle | C.boost);
  await page.keyboard.press('Escape');
  await page.locator('.pause-panel [data-action="home"]').click();
  assert.equal((await state()).mode, 'home');
  await page.locator('#start-btn').click();
  await advance(3400);
  await drive('new race after menu exit has no stale held keys', 0);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ShiftLeft');
  checks.push('Leaving the race for a menu clears held controls before a later race.');
  assert.deepEqual(errors, [], 'browser console and page errors');
  const keyboardEvents = await page.evaluate(() => window.heldKeyboardEvents);
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, captures, keyboardEvents, errors }, null, 2));
  console.log(`${checks.length} held-keyboard regression checks passed.`);
} catch (error) {
  const snapshot = page ? await state().catch(() => null) : null;
  const keyboardEvents = page ? await page.evaluate(() => window.heldKeyboardEvents).catch(() => []) : [];
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  await writeFile(`${out}/failure.json`, JSON.stringify({ error: String(error), checks, captures, snapshot, keyboardEvents, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
