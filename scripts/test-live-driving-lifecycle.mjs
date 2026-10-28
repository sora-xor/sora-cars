import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const output = process.env.SORA_CARS_TEST_OUTPUT ?? 'output/browser/live-driving-lifecycle';
const paths = ['src/main.ts', 'src/game/audio.ts', 'src/game/renderer.ts', 'src/ui/live.ts',
  'src/game/generated/race-v1-kernels.json', 'tests/lifecycle-live.ts', 'scripts/test-live-driving-lifecycle.mjs'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = async () => Object.fromEntries(await Promise.all(paths.map(async path => [path, digest(await readFile(path))])));
await mkdir(output, { recursive: true });
const before = await sourceHashes(), errors = [], checks = [], snapshots = [], unexpectedRequests = [];
const server = await createServer({ cacheDir: 'node_modules/.vite-live-driving-lifecycle',
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true });
let importReplacements = 0, transformedMain = null, rewrittenMain = null, failure = null;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(origin => {
    localStorage.setItem('sora-cars:prefs:v1', JSON.stringify({ car: 0, track: 0, music: 0, effects: 35, torii: origin }));
    let enabled = false;
    // Browser hardware counterpart only; keyboard events use real Playwright input.
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => enabled ? [{
      id: 'Explicit lifecycle test gamepad', index: 0, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: index === 7, touched: index === 7, value: Number(index === 7) })),
    }] : [] });
    window.lifecycleGamepad = active => { enabled = active; };
  }, origin);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpectedRequests.push(url.href); await route.abort('blockedbyclient'); return; }
    if (url.pathname === '/src/main.ts') {
      const response = await route.fetch(), source = await response.text();
      const importPattern = /from\s+(["'])\/src\/ui\/live\.ts(?:\?[^"']*)?\1/g;
      assert.equal([...source.matchAll(importPattern)].length, 1, 'replace exactly the transformed live-panel import');
      const rewritten = source.replace(importPattern, 'from "/tests/lifecycle-live.ts"');
      importReplacements++; transformedMain = digest(source); rewrittenMain = digest(rewritten);
      await writeFile(`${output}/main-transformed.js`, source);
      await writeFile(`${output}/main-test-import.js`, rewritten);
      await route.fulfill({ response, body: rewritten }); return;
    }
    if (url.pathname === '/v1/games/capabilities') {
      assert.equal(route.request().method(), 'GET');
      // Disabled local endpoint response keeps lobby rendering away from Taira.
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, enabled: false,
        native_game_sessions: true, profiles: [], network_id: 'local-lifecycle-counterpart-only' }) }); return;
    }
    await route.continue();
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.lifecycleLive && window.soraCars && document.fonts.status === 'loaded');
  await page.locator('#start-btn').click(); // Actual user activation unlocks the real AudioContext.
  await page.evaluate(() => { window.advanceTime(1); window.lifecycleLive.begin(); });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const captureInput = () => page.evaluate(() => window.lifecycleLive.captureInput());
  const advance = ms => page.evaluate(ms => window.advanceTime(ms), ms);
  const snapshot = async label => { snapshots.push({ label, ...(await state()) }); };
  const assertSilent = async label => { assert.equal((await state()).drivingSound.active, false, label); };

  await page.keyboard.down('ArrowUp'); await page.keyboard.down('Shift'); await advance(100);
  assert.equal((await state()).mode, 'race'); assert.equal((await state()).drivingSound.active, true);
  assert.equal((await state()).drivingSound.boost, true); assert.equal(await captureInput(), 33);
  await snapshot('racing-keyboard-boost'); await page.screenshot({ path: `${output}/racing.png` });
  for (const phase of ['disputed', 'connecting', 'synchronizing', 'stopped']) {
    await page.evaluate(phase => window.lifecycleLive.phase(phase), phase);
    await assertSilent(`${phase} callback silences immediately, before another frame`);
    await advance(1000); await assertSilent(`${phase} stays silent on later frames`);
    await snapshot(phase);
    await page.evaluate(() => window.lifecycleLive.phase('racing')); await advance(100);
    assert.equal((await state()).drivingSound.active, true, `racing resumes after ${phase}`);
  }
  await page.evaluate(() => window.lifecycleLive.phase('waiting')); await advance(100);
  assert.equal((await state()).drivingSound.active, true, 'normal certificate waiting does not pulse the engine off');
  await page.evaluate(() => window.lifecycleLive.phase('racing'));
  await page.keyboard.up('Shift'); await page.keyboard.up('ArrowUp');
  checks.push('Real main/audio callbacks immediately silence disputed/connecting/synchronizing/stopped phases; racing resumes and certificate waiting remains audible.');

  for (const kind of ['tree', 'sign']) {
    const contact = await page.evaluate(kind => window.lifecycleLive.contact(kind), kind);
    assert.ok(contact.contacts.some(event => event.slot === 0 && event.kind === kind));
    assert.equal(contact.car.speed, kind === 'tree' ? 350 : 780, 'genuine generated collision penalty');
    await advance(1);
    assert.equal((await state()).drivingSound.impact, kind, 'native host.state contact reaches actual main audio');
    await snapshot(`native-${kind}-audio`);
  }
  await page.evaluate(() => window.lifecycleLive.begin()); await advance(100);
  checks.push('Native-generated tree/sign transition contacts pass through actual host.state and main into distinct real synthesizer impact states; these explicit transition fixtures are not authenticated network inputs.');

  await page.evaluate(() => window.lifecycleGamepad(true));
  assert.equal(await captureInput(), 1, 'gamepad throttle reaches the actual live input provider while racing');
  for (const view of ['room', 'lobby']) {
    if (view === 'room') await page.locator('.session-button[data-action="room"]').click();
    else await page.evaluate(() => { location.hash = '#/lobby'; });
    await page.waitForFunction(view => JSON.parse(window.render_game_to_text()).mode === view, view);
    await assertSilent(`${view} transition immediately silences driving audio`);
    assert.equal(await captureInput(), 0, `${view} neutralizes held gamepad throttle`);
    await page.evaluate(() => window.lifecycleGamepad(false));
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('Shift');
    assert.equal(await captureInput(), 0, `${view} neutralizes fresh keyboard throttle and boost`);
    await advance(500); await assertSilent(`${view} stays silent`);
    await snapshot(`${view}-neutral-input`);
    await page.keyboard.up('Shift'); await page.keyboard.up('ArrowUp');
    await page.evaluate(() => { window.lifecycleGamepad(true); window.lifecycleLive.begin(); });
    await advance(100);
    assert.equal((await state()).mode, 'race'); assert.equal(await captureInput(), 1);
    assert.equal((await state()).drivingSound.active, true, `sound resumes only after returning from ${view} to race`);
  }
  checks.push('Actual main input provider receives gamepad/keyboard controls in race, returns zero in room/lobby, and resumes after returning to race.');

  await page.evaluate(() => window.lifecycleLive.finish());
  assert.equal((await state()).mode, 'results'); await assertSilent('terminal callback silences immediately');
  assert.equal(await captureInput(), 0, 'results neutralize held gamepad throttle');
  await advance(1000); await assertSilent('terminal audio stays stopped');
  await snapshot('terminal'); await page.screenshot({ path: `${output}/terminal.png` });
  checks.push('Generated two-car simulation reaches a terminal state; actual main finish callback enters results and keeps driving audio/input stopped.');
  assert.equal(importReplacements, 1); assert.deepEqual(unexpectedRequests, []); assert.deepEqual(errors, []);
  console.log(`${checks.length} main-UI live driving lifecycle checks passed.`);
} catch (error) { failure = error instanceof Error ? error.stack : String(error); throw error; }
finally {
  const after = await sourceHashes();
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: failure === null, failure, checks, snapshots,
    errors, unexpectedRequests, importReplacements, transformedMain, rewrittenMain, before, after,
    sourceUnchanged: JSON.stringify(before) === JSON.stringify(after),
    scope: 'Actual Chromium main UI, generated reference simulation and real GameAudio; only the transformed LiveRacingPanel import is replaced with a subclass capturing its host. Explicit local controller and gamepad counterparts; disabled local capability response. No WebRTC, wallet, proof, ledger finality, settlement, or Taira qualification. Audio lifecycle checks inspect the real synthesizer state; separate OfflineAudioContext tests measure PCM silence.' }, null, 2));
  await browser.close(); await server.close();
}
