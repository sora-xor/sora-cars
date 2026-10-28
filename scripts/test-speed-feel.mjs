import { launchChromium } from './lib/browser-launch.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = 'output/browser/speed-feel';
await mkdir(`${out}/frames`, { recursive: true });
const browser = await launchChromium({ headless: true });
const errors = [], runs = [];
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => window.soraCars && document.fonts.status === 'loaded');
    await page.evaluate(() => window.advanceTime(0));
    await page.locator('#start-btn').click();
    const playerSlot = await page.evaluate(() => JSON.parse(window.render_game_to_text()).playerSlot);
    const advance = frames => page.evaluate(frames => {
      // Draw every frame so camera envelopes run exactly as during gameplay.
      for (let frame = 0; frame < frames; frame++) window.advanceTime(1000 / 60);
    }, frames);
    const capture = async name => {
      await page.screenshot({ path: `${out}/${reducedMotion}-${name}.png` });
      return page.evaluate(() => window.soraCars.state());
    };
    await advance(192);
    await page.keyboard.down('ArrowUp');
    await advance(60);
    const slow = await capture('slow');
    await advance(180);
    const fast = await capture('fast');
    assert.ok(fast.cars[playerSlot].speed * 0.108 >= 250, 'capture actual 250+ km/h driving');
    assert.ok(slow.cars[playerSlot].speed < fast.cars[playerSlot].speed);
    await page.keyboard.down('Shift');
    await advance(18);
    const boost = await capture('boost');
    assert.ok(boost.cars[playerSlot].speed > fast.cars[playerSlot].speed, 'boost has a real speed increase');
    assert.ok(boost.cars[playerSlot].energy < fast.cars[playerSlot].energy);
    if (reducedMotion === 'no-preference') {
      // A short 30 FPS strip allows inspection of motion, beyond isolated frames.
      for (let frame = 0; frame < 60; frame++) {
        await advance(2);
        await page.locator('#race-canvas').screenshot({ path: `${out}/frames/${String(frame).padStart(3, '0')}.png` });
      }
    } else await advance(120);
    await page.keyboard.up('Shift'); await page.keyboard.up('ArrowUp');
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('Space');
    await advance(12);
    const corner = await capture('corner');
    assert.ok(corner.cars[playerSlot].vx > 0, 'capture real steering and drift response');
    await page.keyboard.up('ArrowRight'); await page.keyboard.up('Space');
    await page.keyboard.down('ArrowDown'); await advance(42);
    const brake = await capture('brake');
    assert.ok(brake.cars[playerSlot].speed < boost.cars[playerSlot].speed, 'braking still reduces actual speed');
    await page.keyboard.up('ArrowDown');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('KeyR'); await advance(192);
    await page.keyboard.down('ArrowUp'); await advance(240);
    const mobile = await page.evaluate(() => window.soraCars.state());
    assert.ok(mobile.cars[playerSlot].speed * 0.108 >= 250, 'mobile capture must also show actual high-speed driving');
    await page.screenshot({ path: `${out}/${reducedMotion}-mobile.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.keyboard.up('ArrowUp');
    runs.push({ slow, fast, boost, corner, brake, mobile });
    await page.close();
  }
  assert.deepEqual(runs[0], runs[1], 'reduced-motion presentation must preserve all eight cars and race ticks');
  // The deterministic captures above deliberately bypass interpolation. Exercise
  // the normal animation clock too, using only real keyboard input and elapsed time.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
    recordVideo: { dir: `${out}/realtime`, size: { width: 960, height: 600 } } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.soraCars && document.fonts.status === 'loaded');
  await page.evaluate(async () => {
    // Observe the module actually loaded by Vite, including its HMR version.
    const moduleUrl = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/game/renderer.ts')?.name;
    if (!moduleUrl) throw new Error('Loaded renderer module is missing');
    const { RaceRenderer } = await import(moduleUrl);
    const draw = RaceRenderer.prototype.draw;
    RaceRenderer.prototype.draw = function (state, options, time) {
      const result = draw.call(this, state, options, time);
      window.speedTestRenderedProgress = state.cars[options.playerSlot].progress;
      return result;
    };
  });
  await page.locator('#start-btn').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).player.speed * 0.108 >= 250, {}, { timeout: 15000 });
  await page.screenshot({ path: `${out}/realtime-fast.png` });
  const samples = await page.evaluate(() => new Promise(resolve => {
    const frames = []; let start;
    const sample = now => {
      start ??= now;
      const { tick, player } = JSON.parse(window.render_game_to_text());
      frames.push({ now, tick, progress: player.progress, speed: player.speed, renderedProgress: window.speedTestRenderedProgress });
      if (now - start < 2000) requestAnimationFrame(sample); else resolve(frames);
    };
    requestAnimationFrame(sample);
  }));
  const seconds = (samples.at(-1).now - samples[0].now) / 1000;
  const ticks = samples.at(-1).tick - samples[0].tick;
  assert.ok(Math.abs(ticks - seconds * 30) <= 3, 'simulation keeps its actual 30 Hz clock');
  const distanceMm = samples.at(-1).progress - samples[0].progress;
  const expectedMm = samples.slice(1).reduce((sum, sample, i) => sum + (sample.speed + samples[i].speed) / 2 * 30 * (sample.now - samples[i].now) / 1000, 0);
  const renderedMm = samples.at(-1).renderedProgress - samples[0].renderedProgress;
  await writeFile(`${out}/realtime-distance.json`, JSON.stringify({ seconds, ticks, distanceMm, expectedMm, renderedMm, samples }, null, 2));
  assert.ok(samples.every(sample => Number.isFinite(sample.renderedProgress)), 'observe actual loaded renderer, including Vite HMR module identity');
  assert.ok(Math.abs(distanceMm / expectedMm - 1) < 0.06, 'speedometer matches distance travelled in real time');
  assert.ok(Math.abs(renderedMm / distanceMm - 1) < 0.06, 'visible world keeps pace with physics rather than slowly catching up');
  await page.keyboard.down('Shift');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).player.speed * 0.108 >= 300, {}, { timeout: 3000 });
  await page.screenshot({ path: `${out}/realtime-boost.png` });
  const boostState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(boostState.drivingSound.boost, true);
  await page.keyboard.up('Shift'); await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).player.speed * 0.108 < 100, {}, { timeout: 3000 });
  await page.keyboard.up('ArrowDown');
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(paused.drivingSound.active, false);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).tick), paused.tick);
  const deltas = samples.slice(1).map((frame, i) => frame.now - samples[i].now).sort((a, b) => a - b);
  const cadence = { frames: samples.length, medianMs: deltas[Math.floor(deltas.length * 0.5)],
    p95Ms: deltas[Math.floor(deltas.length * 0.95)], maxMs: deltas.at(-1) };
  const video = page.video();
  await context.close();
  await video.saveAs(`${out}/realtime-driving.webm`);
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify({ runs, errors, realtime: { samples, cadence, seconds, ticks, distanceMm, expectedMm, renderedMm, boostKmh: boostState.player.speed * 0.108 }, checks: ['Actual 250+ km/h acceleration, boost and brake', 'Identical normal/reduced-motion physics', 'Desktop and mobile capture', '60 motion frames at 30 FPS', 'Real-time interpolation path: displayed and simulated travel agree with speedometer, 300+ km/h boost, braking and silent pause'] }, null, 2));
  console.log('Speed presentation: acceleration, boost, braking, reduced-motion parity, mobile and real-time driving checks passed.');
} finally { await browser.close(); }
