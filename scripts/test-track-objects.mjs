import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const output = 'output/browser/track-objects';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], scenarios = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/tests/mesh-harness.html`);
  await page.waitForFunction(() => typeof window.makeRaceController === 'function');
  await page.evaluate(async () => {
    const { createRace, stepRace } = await import('/src/game/engine.ts');
    const { environmentAt, environmentContacts, RACE_RULES_HASH, RACE_PROFILE_ID } = await import('/src/game/environment.ts');
    const { RaceRenderer } = await import('/src/game/renderer.ts');
    const renderer = new RaceRenderer(document.querySelector('#mesh-race'));
    await Promise.all([renderer.flag.decode(), renderer.backdrop.decode()]);
    await document.fonts.ready;
    window.objectScenario = (kind, track = 0, tick = 0, approach = false) => {
      renderer.resize();
      const state = createRace(track, 8), object = environmentAt(track, tick).objects.find(object => object.kind === kind);
      state.tick = tick;
      for (const car of state.cars) { car.progress = object.progress + 24000 + car.slot * 18000; car.x = car.slot % 2 ? -1600 : 1600; }
      Object.assign(state.cars[0], { progress: object.progress - (approach ? 80000 : 500), x: object.x, speed: 1000 });
      const controls = Array(8).fill(0); controls[0] = kind === 'oil' ? 1 | 8 : 1;
      const before = structuredClone(state.cars[0]);
      stepRace(state, controls);
      const contacts = environmentContacts(state);
      const options = { contacts, playerSlot: 0, names: ['あなた', 'アキ', 'レン', 'ユイ', 'ダイチ', 'ミオ', 'シュン', 'SORA'], skins: [0, 1, 2, 3, 4, 5, 1, 2], controls: controls[0], hud: true, raceMode: 'コース試験 / COURSE TEST' };
      renderer.draw(state, options, 1); renderer.draw(state, options, 1.13);
      return { object, before, after: state.cars[0], contacts, weather: { rain: environmentAt(track,tick).rain, wind: environmentAt(track,tick).wind }, profile: RACE_PROFILE_ID, rules: RACE_RULES_HASH };
    };
  });
  for (const kind of ['tree', 'sign', 'oil']) {
    const scenario = await page.evaluate(kind => window.objectScenario(kind), kind);
    assert.ok(scenario.contacts.some(event => event.slot === 0 && event.kind === kind));
    if (kind === 'tree') { assert.equal(scenario.after.speed, 350); assert.equal(scenario.after.x, -9000); }
    if (kind === 'sign') assert.equal(scenario.after.speed, 780);
    if (kind === 'oil') assert.equal(scenario.after.vx, 8);
    scenarios.push(scenario);
    await page.screenshot({ path: `${output}/${kind}.png` });
  }
  const approach = await page.evaluate(() => window.objectScenario('oil', 0, 0, true));
  assert.equal(approach.contacts.length, 0); scenarios.push(approach);
  await page.screenshot({ path: `${output}/oil-approach.png` });
  const wet = await page.evaluate(() => window.objectScenario('oil', 1, 360));
  assert.equal(wet.weather.rain, 1); assert.ok(wet.contacts.some(event => event.kind === 'oil'));
  scenarios.push(wet); await page.screenshot({ path: `${output}/rain-oil.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  // The mesh harness also owns a renderer on this canvas. Let its resize
  // callback finish before the one-shot object scene is drawn.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => window.objectScenario('sign', 2, 0));
  const mobile = await page.evaluate(() => {
    const canvas = document.querySelector('#mesh-race');
    const pixel = [...canvas.getContext('2d').getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 3), 1, 1).data];
    return { width: canvas.width, height: canvas.height, pixel };
  });
  assert.ok(Math.abs(mobile.width - 390) <= 1, 'mobile backing width resolves display pixels');
  assert.equal(mobile.height, 844, 'mobile backing height resolves display pixels');
  assert.ok(mobile.pixel.slice(0, 3).some(channel => channel > 0), 'mobile course frame must be drawn after resize');
  await page.screenshot({ path: `${output}/sign-mobile.png` });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ scenarios, errors, scope: 'Actual Chromium native-generated transitions and production Canvas renderer. Explicit bounded test states are positioned near each hazard; these captures are not proofs of a complete race or network finality.' }, null, 2));
  console.log('Tree/sign collision, oil handling, native rain and mobile renderer checks passed.');
} finally { await browser.close(); }
