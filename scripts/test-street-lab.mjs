import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const base = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const args = process.argv.slice(2);
assert.ok(args.length === 2 && args[0] === '--output' && args[1],
  'Use --output output/<fresh-browser-run> (the output directory must not exist).');
const out = resolve(args[1]), outputTail = relative(resolve('output'), out);
assert.ok(outputTail && outputTail !== '..' && !outputTail.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  && !isAbsolute(outputTail), 'Browser evidence must be a fresh child of output/.');
await mkdir(dirname(out), { recursive: true });
await mkdir(out);
let browser, deadline;
const report = { browserTimeoutMs: 600000, qualification: { proof: false, finalized: false }, bundles: [], checks: [], failures: [], errors: [], media: [], captures: [], runs: [] };
let browserClose;
const closeOwnedBrowser = () => browserClose ??= (async () => {
  if (!browser) return;
  try { await browser.close(); }
  catch (error) { report.failures.push(`Owned browser close failed: ${error.stack ?? error}`); }
})();

const frontendFiles = ['scripts/test-street-lab.mjs', 'src/game/street/test-driver.ts', 'src/game/street/lab.ts', 'src/game/street/session.ts',
  'src/game/street/renderer.ts', 'src/game/street/assets.ts', 'src/game/street/asset-manifest.ts', 'src/game/street/objects.ts', 'src/game/street/graph.ts', 'src/game/audio.ts', 'src/game/street/lab.css', 'street-lab.html'];
async function frontendHashes() {
  return Object.fromEntries(await Promise.all(frontendFiles.map(async path =>
    [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
}
report.testedAt = new Date().toISOString();
const check = (condition, description) => {
  report.checks.push({ description, passed: !!condition });
  if (!condition) report.failures.push(description);
};
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ticks) => page.evaluate(ticks => {
  for (let i = 0; i < ticks; i++) window.advanceTime(1000 / 30);
}, ticks);
const capture = async (page, name) => {
  await page.screenshot({ path: `${out}/${name}.png` }); report.captures.push(`${name}.png`);
  return state(page);
};
async function open(context, label) {
  const page = await context.newPage();
  // Observe the actual unattached HTMLAudioElement created by the lab; this
  // neither supplies audio nor changes playback/physics behaviour.
  await page.addInitScript(() => {
    window.__streetLabAudio = [];
    window.Audio = new Proxy(window.Audio, { construct(target, args) {
      const element = Reflect.construct(target, args, target);
      window.__streetLabAudio.push(element); return element;
    } });
  });
  page.on('pageerror', error => report.errors.push({ label, type: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push({ label, type: 'console', message: message.text() });
  });
  page.on('requestfailed', request => {
    const entry = { label, type: 'requestfailed', url: request.url(), message: request.failure()?.errorText };
    report.errors.push(entry);
  });
  // Observe the exact live HTTP bytes using a pass-through route. Chromium's
  // DevTools body identifier can disappear during a cold Vite navigation;
  // route.fetch gives a stable observer without supplying a substitute bundle.
  let receive, reject;
  const loaded = new Promise((resolve, fail) => {
    const timeout = setTimeout(() => fail(new Error('Timed out observing the packaged Street bundle')), 30000);
    timeout.unref();
    receive = value => { clearTimeout(timeout); resolve(value); };
    reject = error => { clearTimeout(timeout); fail(error); };
  });
  await page.route(/\/assets\/street\/tokyo-[a-f0-9]{64}\.json(?:\?.*)?$/, async route => {
    try {
      const response = await route.fetch(), bytes = await response.body();
      receive({ status: response.status(), bytes });
      await route.fulfill({ response, body: bytes });
    } catch (error) { reject(error); await route.abort(); }
  });
  const [, response] = await Promise.all([page.goto(`${base}/street-lab.html`), loaded]);
  assert.equal(response.status, 200, 'native eight-car bundle is served');
  const bytes = response.bytes, bundle = JSON.parse(bytes.toString());
  report.bundles.push({ label, capture: 'Unmodified live HTTP bytes through a Playwright pass-through route',
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    nodes: bundle.graph.nodes.length, sources: bundle.sources, qualification: bundle.qualification,
    track: { id: bundle.track.id, maxTicks: bundle.track.maxTicks, lengthMm: bundle.track.lengthMm, laps: bundle.track.laps } });
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).state !== null, {}, { timeout: 30000 });
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('#street-canvas').getBoundingClientRect();
    const controls = document.querySelector('.lab-controls').getBoundingClientRect();
    const touch = document.querySelector('.lab-touch');
    return { controlsEnd: controls.bottom, canvasStart: canvas.top, canvasEnd: canvas.bottom,
      touchVisible: getComputedStyle(touch).display !== 'none', touchStart: touch.getBoundingClientRect().top };
  });
  check(layout.controlsEnd <= layout.canvasStart + 1 && (!layout.touchVisible || layout.touchStart >= layout.canvasEnd - 1),
    `${label}: action and touch controls reserve layout space outside the gameplay HUD`);
  check(bundle.qualification.proof === false && bundle.qualification.consensus === false && bundle.qualification.playability === false,
    `${label}: native bundle keeps all qualification flags false`);
  return { page, bundle };
}
async function mediaCheck(page, label, requirePlaying = false) {
  const elements = await page.evaluate(() => window.__streetLabAudio.map(a => ({ src: a.src, error: a.error?.code ?? null,
    readyState: a.readyState, paused: a.paused, currentTime: a.currentTime })));
  report.media.push({ label, elements });
  check(elements.length > 0 && elements.every(a => a.error === null), `${label}: actual media elements have no decoding/playback error`);
  if (requirePlaying) check(elements.some(a => !a.paused && a.readyState >= 2), `${label}: actual theme media is loaded and playing`);
}
function upcomingTurn(track, progress) {
  const heading = station => {
    const position = track.topology === 'circuit' ? ((station % track.lengthMm) + track.lengthMm) % track.lengthMm
      : Math.max(0, Math.min(track.lengthMm, station));
    let lo = 0, hi = track.samples.length - 1;
    while (lo + 1 < hi) { const middle = (lo + hi) >>> 1; if (track.samples[middle].progressMm <= position) lo = middle; else hi = middle; }
    const a = track.samples[lo], b = track.samples[hi];
    return a.headingMicroturn + (b.headingMicroturn - a.headingMicroturn) * (position - a.progressMm) / (b.progressMm - a.progressMm);
  };
  return ((heading(progress + 42000) - heading(progress) + 1500000) % 1000000) - 500000;
}

try {
  report.frontendSources = await frontendHashes();
  browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
  deadline = setTimeout(() => {
    report.failures.push('Owned browser exceeded the 600000 ms suite deadline; owned browser closure requested.');
    void closeOwnedBrowser();
  }, report.browserTimeoutMs);
  deadline.unref();
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion, acceptDownloads: true });
    const { page, bundle } = await open(context, reducedMotion);
    await page.evaluate(() => window.advanceTime(0));
    const initial = await capture(page, `${reducedMotion}-grid`);
    check(initial.state.cars.length === 8 && initial.state.cars.every(c => c.status === 0), `${reducedMotion}: eight native cars on the grid`);
    check(initial.paused && !initial.drivingSound.active && !initial.proofQualified, `${reducedMotion}: grid is paused, silent and unqualified`);
    check(await page.locator('#lab-music').getAttribute('aria-pressed') === 'true', `${reducedMotion}: theme is enabled by default`);

    // Let the other seven cars pass under their own native steps, to inspect
    // their actual road placement. No state or bundle is edited by this test.
    await page.keyboard.down('ArrowDown'); await page.locator('#lab-start').click();
    // Twenty seconds leaves the cautious test driver time to use a genuinely
    // open passing lane; a permanently braked player must not jam the roster.
    await advance(page, 600);
    const traffic = await capture(page, `${reducedMotion}-traffic`);
    check(traffic.musicPlaying, `${reducedMotion}: supplied theme starts with the drive without a music toggle`);
    check(traffic.state.cars.slice(1).every(c => c.progressMm > traffic.state.cars[0].progressMm + 4000),
      `${reducedMotion}: seven native opponents fully pass the stopped player within twenty seconds`);
    await page.keyboard.up('ArrowDown'); await page.locator('#lab-reset').click();
    await page.locator('#lab-music').click();
    check(!(await state(page)).musicPlaying && await page.locator('#lab-music').getAttribute('aria-pressed') === 'false',
      `${reducedMotion}: music toggle mutes the supplied theme`);
    await page.locator('#lab-music').click();
    await page.keyboard.down('ArrowUp'); await advance(page, 24);
    const accelerating = await capture(page, `${reducedMotion}-accelerating`);
    check(accelerating.controls === 1 && accelerating.state.cars[0].speedMmPerTick > 300,
      `${reducedMotion}: real keyboard throttle accelerates the native player`);
    check(accelerating.drivingSound.active, `${reducedMotion}: engine active while driving`);
    check(accelerating.musicPlaying, `${reducedMotion}: supplied theme plays after muting and unmuting`);
    await mediaCheck(page, `${reducedMotion}-playing`, true);
    await page.keyboard.down('Shift'); await advance(page, 3);
    const boosting = await capture(page, `${reducedMotion}-boost`);
    check((boosting.controls & 33) === 33 && boosting.state.cars[0].boosting === 1 && boosting.drivingSound.boost,
      `${reducedMotion}: Shift invokes actual native boost and engine feedback`);
    check(boosting.state.cars[0].energy < accelerating.state.cars[0].energy,
      `${reducedMotion}: native boost spends energy`);
    await page.keyboard.up('Shift'); await page.keyboard.down('ArrowRight'); await page.keyboard.down('Space'); await advance(page, 3);
    const drifting = await capture(page, `${reducedMotion}-drift`);
    check((drifting.controls & 24) === 24 && drifting.state.cars[0].drifting === 1,
      `${reducedMotion}: Space and steering invoke native drift`);
    check(drifting.state.cars[0].bodyYawMicroturn !== drifting.state.cars[0].velocityYawMicroturn,
      `${reducedMotion}: drift body and velocity orientations differ`);
    await page.keyboard.up('ArrowRight'); await page.keyboard.up('Space');

    await page.keyboard.press('KeyP');
    const paused = await state(page); await advance(page, 12);
    const pausedAfter = await capture(page, `${reducedMotion}-paused`);
    check(pausedAfter.paused && JSON.stringify(paused.state) === JSON.stringify(pausedAfter.state),
      `${reducedMotion}: pause preserves every native state field`);
    check(!pausedAfter.drivingSound.active && !pausedAfter.musicPlaying, `${reducedMotion}: pause stops engine and theme`);
    await page.keyboard.press('KeyP'); await advance(page, 3);
    const resumed = await state(page);
    check(!resumed.paused && resumed.controls === 1 && resumed.state.tick > pausedAfter.state.tick,
      `${reducedMotion}: resume preserves physically held throttle`);
    await page.locator('#lab-reset').click(); await advance(page, 3);
    const restarted = await capture(page, `${reducedMotion}-restarted-held`);
    check(restarted.state.tick <= 4 && restarted.controls === 1 && restarted.state.cars[0].speedMmPerTick > 0,
      `${reducedMotion}: rematch resets native clock and preserves held throttle`);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blurred = await state(page);
    check(blurred.paused && !blurred.drivingSound.active, `${reducedMotion}: blur pauses and silences engine`);
    await page.locator('#lab-pause').click(); await advance(page, 3);
    const refocused = await state(page);
    check(refocused.controls === 0, `${reducedMotion}: blur clears stale held controls`);
    await page.keyboard.up('ArrowUp');
    await page.locator('#lab-auto').click(); await advance(page, 15);
    const automatic = await capture(page, `${reducedMotion}-test-driver`);
    check(automatic.automatic && automatic.controls !== 0 && automatic.state.tick > refocused.state.tick,
      `${reducedMotion}: automatic test driver supplies real control bits`);
    await page.locator('#lab-auto').click(); await advance(page, 2);
    const manual = await state(page);
    check(!manual.automatic && manual.controls === 0, `${reducedMotion}: test driver toggles back to manual controls`);

    const downloadWait = page.waitForEvent('download'); await page.locator('#lab-download').click();
    const download = await downloadWait; const downloadPath = `${out}/${reducedMotion}-replay.json`;
    await download.saveAs(downloadPath);
    const replayBytes = await readFile(downloadPath), replay = JSON.parse(replayBytes.toString());
    check(replay.domain === 'sora-cars.street-replay-draft.v1' && replay.roster === 8 && replay.track === bundle.track.id,
      `${reducedMotion}: download identifies the native draft and roster`);
    check(replay.qualification.proof === false && replay.qualification.finalized === false,
      `${reducedMotion}: download makes no proof or ledger finality claim`);
    check(replay.actions.length === manual.state.tick && replay.actions.every(row => row.length === 16
      && row.slice(0, 8).every(n => Number.isInteger(n) && n >= 0 && n <= 63)
      && row.slice(8).every(n => n === 0 || n === 1)), `${reducedMotion}: download contains compact eight-player input and dispute rows`);
    check(JSON.stringify(replay.sources) === JSON.stringify(bundle.sources) && replay.outcome.tick === manual.state.tick,
      `${reducedMotion}: download binds exact native source hashes and current outcome`);
    report.runs.push({ reducedMotion, initial, traffic, accelerating, boosting, drifting, pausedAfter, resumed, restarted, refocused, automatic, manual,
      replay: { bytes: replayBytes.length, actions: replay.actions.length, sha256: createHash('sha256').update(replayBytes).digest('hex') } });
    await context.close();
    console.log(`Street lab ${reducedMotion}: controls, pause, held keys, audio and replay checked.`);
  }
  check(JSON.stringify(report.runs[0].manual.state) === JSON.stringify(report.runs[1].manual.state),
    'Normal and reduced-motion manual scenarios produce identical native state');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const { page: mobile } = await open(mobileContext, 'touch');
  await mobile.evaluate(() => window.advanceTime(0));
  const gas = mobile.locator('[data-key="ArrowUp"]'), right = mobile.locator('[data-key="ArrowRight"]');
  check(await gas.isVisible(), 'Touch device exposes touch driving controls');
  const cdp = await mobileContext.newCDPSession(mobile);
  const center = async locator => { const box = await locator.boundingBox(); assert.ok(box); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
  const gasPoint = await center(gas), rightPoint = await center(right);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...gasPoint, id: 1 }] });
  await advance(mobile, 24);
  const touchGas = await capture(mobile, 'touch-accelerating');
  check(touchGas.started && touchGas.controls === 1 && touchGas.state.cars[0].speedMmPerTick > 0,
    'A held touch on gas starts the race and accelerates');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...gasPoint, id: 1 }, { ...rightPoint, id: 2 }] });
  await advance(mobile, 3);
  const touchTurn = await capture(mobile, 'touch-steering');
  check((touchTurn.controls & 9) === 9, 'Multitouch combines held throttle and steering');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(mobile, 2);
  const touchCancelled = await state(mobile);
  check(touchCancelled.controls === 0 && await mobile.locator('.lab-touch .held').count() === 0, 'Touch cancellation clears every captured control');
  check(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Touch viewport has no horizontal overflow');
  report.touch = { gas: touchGas, turn: touchTurn, cancelled: touchCancelled };
  await mediaCheck(mobile, 'touch');
  await mobileContext.close();

  // Inject only a standard input device. The application still polls its real
  // navigator.getGamepads path and submits normal controls to the native graph.
  // This is repeatable browser input coverage, not a physical hardware claim.
  const padContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await padContext.addInitScript(() => {
    const pad = { id: 'SORA QA standard gamepad fixture', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null], configurable: true });
    window.__streetLabPad = pad;
  });
  const { page: padPage } = await open(padContext, 'gamepad');
  await padPage.evaluate(() => window.advanceTime(0));
  const setPad = (pressed, axis = 0) => padPage.evaluate(({ pressed, axis }) => {
    const pad = window.__streetLabPad;
    pad.timestamp = performance.now(); pad.axes[0] = axis;
    pad.buttons.forEach((button, i) => { button.pressed = pressed.includes(i); button.touched = button.pressed; button.value = button.pressed ? 1 : 0; });
  }, { pressed, axis });
  await padPage.locator('#lab-start').click(); await setPad([7]); await advance(padPage, 24);
  const padAccelerating = await capture(padPage, 'gamepad-accelerating');
  check(padAccelerating.controls === 1 && padAccelerating.state.cars[0].speedMmPerTick > 300,
    'Real gamepad polling turns held right trigger into native throttle');
  await setPad([7, 0]); await advance(padPage, 3);
  const padBoosting = await capture(padPage, 'gamepad-boost');
  check((padBoosting.controls & 33) === 33 && padBoosting.state.cars[0].boosting === 1
    && padBoosting.state.cars[0].energy < padAccelerating.state.cars[0].energy,
    'Standard gamepad A boost invokes native boost and spends energy');
  await setPad([7, 1], .8); await advance(padPage, 3);
  const padDrifting = await capture(padPage, 'gamepad-drift');
  check((padDrifting.controls & 25) === 25 && padDrifting.state.cars[0].drifting === 1
    && padDrifting.state.cars[0].bodyYawMicroturn !== padDrifting.state.cars[0].velocityYawMicroturn,
    'Gamepad stick and drift button produce actual native body/velocity slip');
  await setPad([6]); await advance(padPage, 4);
  const padBraking = await capture(padPage, 'gamepad-braking');
  check(padBraking.controls === 2 && padBraking.state.cars[0].speedMmPerTick < padDrifting.state.cars[0].speedMmPerTick,
    'Standard gamepad L2 brake reduces actual native speed');
  await setPad([7]); await padPage.keyboard.press('KeyP');
  const padPaused = await state(padPage); await advance(padPage, 5);
  check(JSON.stringify((await state(padPage)).state) === JSON.stringify(padPaused.state), 'Pause freezes native state with the gamepad trigger held');
  await padPage.keyboard.press('KeyP'); await advance(padPage, 2);
  check((await state(padPage)).controls === 1, 'Resume retains the physically held gamepad trigger fixture');
  await padPage.locator('#lab-reset').click(); await advance(padPage, 3);
  const padRestarted = await state(padPage);
  check(padRestarted.state.tick <= 4 && padRestarted.controls === 1 && padRestarted.state.cars[0].speedMmPerTick > 0,
    'Rematch resets the native clock without dropping held gamepad input');
  await setPad([], .2); await advance(padPage, 1);
  check((await state(padPage)).controls === 0, 'Gamepad stick deadzone prevents unintended steering');
  await setPad([7], .8); await padPage.evaluate(() => { window.__streetLabPad.connected = false; }); await advance(padPage, 2);
  const padDisconnected = await state(padPage);
  check(padDisconnected.controls === 0, 'Disconnecting a gamepad clears its still-pressed buttons and axis');
  report.gamepad = { fixture: 'Injected standard Gamepad through navigator.getGamepads; no physical device or native-state mutation',
    accelerating: padAccelerating, boosting: padBoosting, drifting: padDrifting, braking: padBraking, paused: padPaused, restarted: padRestarted, disconnected: padDisconnected };
  await mediaCheck(padPage, 'gamepad');
  await padContext.close();

  // A separate context keeps the normal requestAnimationFrame path intact.
  const realtimeContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: `${out}/video`, size: { width: 960, height: 600 } } });
  const { page: realtime } = await open(realtimeContext, 'realtime');
  await realtime.locator('#lab-start').click(); await realtime.keyboard.down('ArrowUp');
  await realtime.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.cars[0].speedMmPerTick > 650, {}, { timeout: 15000 });
  await capture(realtime, 'realtime-driving');
  await realtime.keyboard.down('Shift');
  await realtime.waitForFunction(() => JSON.parse(window.render_game_to_text()).state.cars[0].boosting === 1, {}, { timeout: 5000 });
  const realtimeBoost = await capture(realtime, 'realtime-boost');
  const samples = await realtime.evaluate(() => new Promise(resolve => {
    const rows = []; let start;
    const frame = now => {
      start ??= now; const text = JSON.parse(window.render_game_to_text());
      rows.push({ now, tick: text.state.tick, progressMm: text.state.cars[0].progressMm, physicsMs: text.stepMs });
      if (now - start >= 1200) resolve(rows); else requestAnimationFrame(frame);
    }; requestAnimationFrame(frame);
  }));
  check(samples.at(-1).tick > samples[0].tick + 25, 'Real animation clock advances native physics at racing cadence');
  check(samples.at(-1).progressMm > samples[0].progressMm, 'Real animation clock advances actual road distance');
  await realtime.keyboard.up('Shift'); await realtime.keyboard.up('ArrowUp'); await realtime.keyboard.press('KeyP');
  const realtimePaused = await state(realtime); await realtime.waitForTimeout(250); const realtimeAfterPause = await state(realtime);
  check(realtimeAfterPause.paused && !realtimeAfterPause.drivingSound.active
    && JSON.stringify(realtimePaused.state) === JSON.stringify(realtimeAfterPause.state), 'Real-time pause freezes native state and silences engine');
  const intervals = samples.slice(1).map((sample, i) => sample.now - samples[i].now).sort((a, b) => a - b);
  report.realtime = { boosting: realtimeBoost, paused: realtimeAfterPause, samples,
    cadence: { frames: samples.length, medianMs: intervals[Math.floor(intervals.length / 2)], p95Ms: intervals[Math.floor(intervals.length * .95)], maxMs: intervals.at(-1) } };
  await mediaCheck(realtime, 'realtime');
  const video = realtime.video(); await realtimeContext.close(); await video.saveAs(`${out}/realtime-driving.webm`);
  console.log('Street lab real-time and touch paths checked. Advancing one untouched native race to termination.');

  // Completion uses only the regular test driver and advanceTime. We do not
  // replace the bundle, shorten the deadline, or edit terminal state.
  const finishContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page: finish, bundle: finishBundle } = await open(finishContext, 'completion');
  await finish.evaluate(() => window.advanceTime(0));
  await finish.locator('#lab-auto').click(); await finish.locator('#lab-start').click();
  let terminal = await state(finish);
  let rainCapture = null, cornerCapture = null;
  for (let count = 0; count < finishBundle.track.maxTicks + 60 && !terminal.state.done && !terminal.error; count += 150) {
    await advance(finish, 150); terminal = await state(finish);
    if (!rainCapture && terminal.state.rain === 1 && terminal.state.cars[0].status === 0) rainCapture = await capture(finish, 'native-rain');
    if (!cornerCapture && terminal.state.cars[0].status === 0
      && Math.abs(upcomingTurn(finishBundle.track, terminal.state.cars[0].progressMm)) > 12000) cornerCapture = await capture(finish, 'native-corner');
    if (count % 1500 === 0) console.log(`Street native completion: tick ${terminal.state.tick}, progress ${terminal.state.cars[0].progressMm} mm.`);
  }
  terminal = await capture(finish, 'native-complete');
  check(terminal.state.done && terminal.state.tick <= finishBundle.track.maxTicks, 'Unmodified native race reaches a bounded terminal outcome');
  check(terminal.state.cars.every(car => car.status === 1), 'All eight native test drivers finish the actual route before the deadline');
  check(terminal.paused && !terminal.drivingSound.active && !terminal.musicPlaying, 'Native termination stops engine and supplied theme');
  await advance(finish, 10); const afterEnd = await state(finish);
  check(JSON.stringify(terminal.state) === JSON.stringify(afterEnd.state), 'Terminal native state remains unchanged after further elapsed time');
  report.completion = terminal;
  report.nativeScenery = { rain: rainCapture, corner: cornerCapture };
  check(rainCapture !== null && rainCapture.state.rain === 1, 'Captured actual native rain during the complete race');
  check(cornerCapture !== null, 'Captured an actual frozen-route corner during the complete race');
  await mediaCheck(finish, 'completion');
  await finishContext.close();
  check(new Set(report.bundles.map(b => b.sha256)).size === 1, 'Every scenario loaded the exact same served native bundle');
  check(JSON.stringify(await frontendHashes()) === JSON.stringify(report.frontendSources), 'Frontend and test-driver sources stayed unchanged throughout the browser suite');
  check(report.errors.length === 0, 'No browser page, console or request errors');
} catch (error) {
  report.failures.push(error.stack ?? String(error));
} finally {
  clearTimeout(deadline);
  try { await closeOwnedBrowser(); }
  finally { await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); }
}
assert.equal(report.failures.length, 0, report.failures.join('\n'));
console.log(`Street lab: ${report.checks.length} actual-browser checks passed. Proof and finalized inclusion remain unqualified.`);
