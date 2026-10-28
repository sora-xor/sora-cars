import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const origin = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const output = process.env.SORA_CARS_CLASSED_BROWSER_OUTPUT ?? 'output/browser/classed';
const corpus = JSON.parse(await readFile(new URL('../tests/fixtures/native-classed-race-v1.json', import.meta.url), 'utf8'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true }), errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${origin}/tests/classed-harness.html`);
  await page.waitForFunction(() => window.touringHarness && document.fonts.status === 'loaded');
  await page.evaluate(() => window.advanceTime(0));
  for (const track of [0, 1, 2]) {
    await page.evaluate(track => window.touringHarness.create(track), track);
    await page.locator('#start-btn').click();
    await page.waitForFunction(() => window.touringHarness.read().mode === 'race');
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.advanceTime(3000));
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('Space'); await page.keyboard.down('Shift');
    await page.evaluate(() => window.advanceTime(400));
    await page.keyboard.up('ArrowRight'); await page.keyboard.up('Space'); await page.keyboard.up('Shift');
    const state = await page.evaluate(() => window.touringHarness.read());
    assert.equal(state.classId, 'touring_s1'); assert.equal(state.native.cars.length, 8); assert.equal(state.drivingSound.active, true);
    await page.screenshot({ path: `${output}/track-${track}.png` });
    await page.keyboard.press('Escape');
    assert.equal((await page.evaluate(() => window.touringHarness.read())).drivingSound.active, false);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.advanceTime(181000));
    const finished = await page.evaluate(() => window.touringHarness.read());
    assert.equal(finished.mode, 'results'); assert.equal(finished.drivingSound.active, false);
    assert.equal(finished.result.terminal, true); assert.ok(finished.tick <= 5400);
    await page.evaluate(() => window.advanceTime(1000));
    assert.equal((await page.evaluate(() => window.touringHarness.read())).drivingSound.active, false);
    await page.keyboard.up('ArrowUp'); checks.push(`Track${track}: real keyboard/boost/drift, eight cars, full180s bound, pause and terminal silence`);
  }
  const sampled = ['tree', 'sign', 'oil'].map(kind => corpus.transitions.find(row => row.events.some(values => (values[0] || values[1]) && ['tree', 'sign', 'oil'][values[2]] === kind)));
  for (const [index, fixture] of sampled.entries()) {
    const native = await page.evaluate(fixture => { window.touringHarness.restore(fixture.before); return window.touringHarness.step(fixture.controls); }, fixture);
    const normalize = state => ({ ...state, cars: state.cars.map(car => ({ ...car, progress_mm: Number(car.progress_mm) })) });
    assert.deepEqual(normalize(native), normalize(fixture.after));
    const read = await page.evaluate(() => window.touringHarness.read());
    assert.ok(read.contacts.length > 0);
    await page.screenshot({ path: `${output}/contact-${['tree', 'sign', 'oil'][index]}.png` });
  }
  checks.push('Three genuine native contact transitions match in Chromium with current SDK codecs and Canvas renderer');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png` });
  assert.deepEqual(errors, []);
  const report = { checks, errors, profileId: corpus.profileId, rulesHash: corpus.rulesHash, scope: 'Actual Chromium native-generated Touring adapter, keyboard, audio lifecycle and production renderer. Qualification harness only; no Touring lobby, wallet, equipment admission, ledger settlement or deployed finality claimed.' };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(`${checks.length} Touring browser checks passed.`);
} catch (error) {
  await writeFile(`${output}/failure.json`, JSON.stringify({ error: String(error), errors, checks }, null, 2));
  throw error;
} finally { await browser.close(); }
