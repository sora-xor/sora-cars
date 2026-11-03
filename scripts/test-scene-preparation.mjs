import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Real application and native simulation. Only network timing/failure, Vite HMR,
// and the explicitly named existing live-controller counterpart are intercepted.
const base = new URL(process.env.GAME_URL ?? 'http://127.0.0.1:5173');
const out = process.env.SCENE_PREPARATION_OUT ?? 'output/browser/scene-preparation';
const args = process.env.RENDERER_BROWSER_ARGS ? JSON.parse(process.env.RENDERER_BROWSER_ARGS)
  : process.platform === 'darwin' ? ['--use-angle=metal'] : [];
assert.ok(Array.isArray(args) && args.every(value => typeof value === 'string'));
const assetKeys = ['carAsset', 'sceneryAsset', 'lightingAsset', 'understoryAsset', 'groundAsset', 'shaderAsset'];
const carPath = '/assets/models/sora-ae86/ae86.glb';
const groundPath = '/assets/materials/forest_ground_04/color.jpg';
const nativePaths = ['src/game/engine.ts', 'src/game/rules.ts', 'src/game/generated/race-v1-kernels.json',
  'src/game/street/session.ts', 'src/game/street/track.ts'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = async () => Object.fromEntries(await Promise.all(nativePaths.map(async path => [path, hash(await readFile(path))])));
const report = { base: base.href, args, scope: 'Actual Metal app, real held/failed local asset requests, unchanged native simulation. Live case uses the existing explicit local controller counterpart; no network/auth/ledger qualification.',
  cases: [], captures: [], consoleErrors: [], pageErrors: [], requestFailures: [], forbiddenRequests: [], hmrBlocked: [], mediaCancellations: [], checks: [] };
await mkdir(out, { recursive: true });
report.nativeBefore = await sourceHashes();
const browser = await chromium.launch({ headless: process.env.RENDERER_HEADFUL !== '1', channel: process.env.RENDERER_BROWSER_CHANNEL ?? 'chromium', args });
let failure = null;

function check(value, message) { assert.ok(value, message); report.checks.push(message); }

async function setup(label, { mobile = false, holdCar = false, failGround = false, live = false } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const state = { label, held: [], failures: [], failGround, liveRewrites: 0, released: !holdCar,
    mediaRequests: new Set(), expectedMediaAborts: new Map(), expectedMediaUrls: new Map(), cancellation: null };
  const registerMediaCancellation = request => {
    const operation = state.cancellation;
    if (!operation) return;
    state.expectedMediaAborts.set(request, operation.reason);
    if (!operation.urls.includes(request.url())) operation.urls.push(request.url());
  };
  const withMediaCancellation = async (reason, action) => {
    assert.equal(state.cancellation, null, 'explicit media cancellation operations do not overlap');
    // Audio starts loading asynchronously. Chromium can report both request and
    // requestfailed after the click promise, so observe the real element's exact
    // source before Exit/Reload removes it, not only the later network events.
    const audioSources = page.isClosed() ? [] : await page.evaluate(() => (window.__sceneAudioInstances ?? [])
      .map(audio => audio.getAttribute('src'))
      .filter(src => src?.startsWith(`blob:${location.origin}/`)));
    const operation = { label, reason, urls: [...new Set(audioSources)], audioSources: [...new Set(audioSources)] };
    state.cancellation = operation;
    for (const url of audioSources) state.expectedMediaUrls.set(url, reason);
    for (const request of state.mediaRequests) registerMediaCancellation(request);
    report.mediaCancellations.push(operation);
    try { return await action(); }
    finally { state.cancellation = null; }
  };
  page.on('pageerror', error => report.pageErrors.push({ label, message: error.message }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text(), location = message.location();
    const expected = state.failures.length > 0 && (
      text.startsWith('Ground surface failed to load.') || text.startsWith('Detailed roadside assets failed to load.')
      || /Failed to load resource: net::ERR_FAILED/.test(text) && location.url.includes(groundPath));
    report.consoleErrors.push({ label, text, location, expected });
  });
  page.on('request', request => {
    if (request.resourceType() !== 'media' || !request.url().startsWith(`blob:${base.origin}/`)) return;
    state.mediaRequests.add(request);
    // The browser can emit an overlapping range request during the awaited
    // click itself. Attribute that exact request to the active Exit/Reload/
    // close operation, rather than taking an incomplete pre-click URL snapshot.
    registerMediaCancellation(request);
  });
  page.on('requestfinished', request => {
    state.mediaRequests.delete(request);
    state.expectedMediaAborts.delete(request);
  });
  page.on('requestfailed', request => {
    const url = request.url(), error = request.failure()?.errorText;
    const inducedGroundFailure = new URL(url).pathname.endsWith(groundPath) && state.failures.length > 0;
    const cancellationReason = state.expectedMediaAborts.get(request) ?? state.expectedMediaUrls.get(url);
    const canceledSoundtrack = request.resourceType() === 'media' && error === 'net::ERR_ABORTED' && cancellationReason !== undefined;
    report.requestFailures.push({ label, url, error, resourceType: request.resourceType(), expected: inducedGroundFailure || canceledSoundtrack,
      category: inducedGroundFailure ? 'forced-ground-failure' : canceledSoundtrack ? `soundtrack-canceled-by-${cancellationReason}` : 'unexpected' });
    state.mediaRequests.delete(request);
    state.expectedMediaAborts.delete(request);
  });
  await page.routeWebSocket(/.*/, socket => {
    report.hmrBlocked.push({ label, url: socket.url() });
    socket.send(JSON.stringify({ type: 'connected' }));
  });
  await page.addInitScript(origin => {
    localStorage.setItem('sora-cars:prefs:v1', JSON.stringify({ car: 0, track: 0, music: 0, effects: 0, torii: origin }));
    // Transparent observation of the application's real media elements. Their
    // constructor, sources, playback, preload and cancellation remain native.
    window.__sceneAudioInstances = [];
    window.Audio = new Proxy(window.Audio, { construct(target, args) {
      const audio = Reflect.construct(target, args, target);
      window.__sceneAudioInstances.push(audio);
      return audio;
    } });
    // Observe cover removals; never write asset flags or readiness states.
    window.__sceneReveals = [];
    const observe = () => new MutationObserver(records => {
      for (const record of records) {
        const element = record.target;
        if (!(element instanceof HTMLElement) || !element.classList.contains('scene-preparation-cover') || !element.hidden) continue;
        const game = window.render_game_to_text ? JSON.parse(window.render_game_to_text()) : null;
        window.__sceneReveals.push({ assets: { ...document.querySelector('#race-canvas')?.dataset }, game });
      }
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    if (document.documentElement) observe(); else document.addEventListener('DOMContentLoaded', observe, { once: true });
  }, base.origin);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['http:', 'https:'].includes(url.protocol)) { await route.continue(); return; }
    if (url.origin !== base.origin) {
      report.forbiddenRequests.push({ label, url: url.href }); await route.abort('blockedbyclient'); return;
    }
    if (url.pathname === '/v1/games/capabilities') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, enabled: false,
        native_game_sessions: true, profiles: [], network_id: 'local-readiness-test-only' }) }); return;
    }
    if (live && url.pathname === '/src/main.ts') {
      const response = await route.fetch(), source = await response.text();
      const pattern = /from\s+(["'])\/src\/ui\/live\.ts(?:\?[^"']*)?\1/g;
      assert.equal([...source.matchAll(pattern)].length, 1, 'only the existing live-panel fixture import is replaced');
      state.liveRewrites++;
      await route.fulfill({ response, body: source.replace(pattern, 'from "/tests/lifecycle-live.ts"') }); return;
    }
    if (url.pathname.endsWith(carPath) && !state.released) {
      state.held.push(url.href); await gate;
    }
    if (url.pathname.endsWith(groundPath) && state.failGround) {
      state.failures.push(url.href); await route.abort('failed'); return;
    }
    await route.continue();
  });
  return { page, context, state, withMediaCancellation,
    release: () => { state.released = true; release(); },
    close: async () => withMediaCancellation('explicit-context-close', async () => {
      state.released = true; release(); await context.close();
    }) };
}

async function navigate(fixture, mode) {
  await fixture.page.goto(`${base.origin}/?picture=clean${mode === 'street' ? '#/street/tokyo-1986' : ''}`, { waitUntil: 'domcontentloaded' });
  await fixture.page.waitForFunction(() => window.soraCars && window.render_game_to_text && document.fonts.status === 'loaded', null, { timeout: 60000 });
}
async function inspect(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#race-canvas'), cover = document.querySelector('.scene-preparation-cover');
    const style = cover && getComputedStyle(cover), rect = cover?.getBoundingClientRect(), canvasRect = canvas.getBoundingClientRect();
    return { game: JSON.parse(window.render_game_to_text()), arcadeNative: window.soraCars.state(), assets: { ...canvas.dataset },
      rootPreparation: document.querySelector('#app').dataset.scenePreparation,
      cover: cover ? { hidden: cover.hidden, display: style.display, opacity: style.opacity, background: style.backgroundColor,
        backgroundImage: style.backgroundImage, zIndex: style.zIndex, canvasZIndex: getComputedStyle(canvas).zIndex,
        ariaHidden: cover.getAttribute('aria-hidden'), inert: cover.inert, pointerEvents: style.pointerEvents,
        interactiveChildren: cover.querySelectorAll('button,a,input,select,textarea,[tabindex]').length,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        canvasRect: { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height } } : null,
      screen: document.querySelector('#screen').innerText, reveals: window.__sceneReveals };
  });
}
function native(snapshot, mode) { return mode === 'street' ? snapshot.game.street.fullStreetState : snapshot.arcadeNative; }
function assertCovered(snapshot, label) {
  const cover = snapshot.cover;
  check(cover && !cover.hidden && cover.display !== 'none', `${label}: cover is visible`);
  assert.equal(cover.opacity, '1'); assert.equal(cover.background, 'rgb(23, 17, 36)');
  assert.ok(cover.backgroundImage.includes('garage-wide-v2.png'));
  assert.ok(Number(cover.zIndex) > Number(cover.canvasZIndex));
  assert.equal(cover.pointerEvents, 'none'); assert.equal(cover.ariaHidden, 'true'); assert.equal(cover.inert, true); assert.equal(cover.interactiveChildren, 0);
  assert.ok(cover.rect.x <= cover.canvasRect.x + 1 && cover.rect.y <= cover.canvasRect.y + 1
    && cover.rect.width >= cover.canvasRect.width - 1 && cover.rect.height >= cover.canvasRect.height - 1, 'opaque cover spans the actual canvas');
}
function assertReady(snapshot, label) {
  assert.equal(snapshot.assets.renderer, 'webgl-3d');
  for (const key of assetKeys) assert.equal(snapshot.assets[key], 'detailed', `${label}: ${key}`);
  assert.ok(snapshot.cover.hidden && snapshot.cover.display === 'none', `${label}: cover hidden after ready frame`);
  for (const reveal of snapshot.reveals.filter(reveal => !reveal.game?.spectating && !reveal.game?.networkRace)) {
    if (!['race', 'street', 'home'].includes(reveal.game?.mode)) continue;
    for (const key of assetKeys) assert.equal(reveal.assets[key], 'detailed', `${label}: no premature reveal (${key})`);
  }
}
async function capture(page, label) {
  const screenshot = `${out}/${label}.png`, snapshot = await inspect(page);
  await page.screenshot({ path: screenshot });
  await writeFile(`${out}/${label}.json`, JSON.stringify(snapshot, null, 2));
  report.captures.push({ label, screenshot, gameText: `${out}/${label}.json` });
  return snapshot;
}
async function waitReady(page, mode) {
  await page.waitForFunction(mode => {
    const data = document.querySelector('#race-canvas')?.dataset, cover = document.querySelector('.scene-preparation-cover');
    return data?.renderer === 'webgl-3d' && ['carAsset', 'sceneryAsset', 'lightingAsset', 'understoryAsset', 'groundAsset', 'shaderAsset'].every(key => data[key] === 'detailed')
      && cover?.hidden && (mode !== 'street' || JSON.parse(window.render_game_to_text()).street?.phase === 'ready');
  }, mode, { polling: 100, timeout: 90000 });
}
async function gpu(page) {
  return page.evaluate(async () => {
    const path = '/src/game/three/world.ts';
    const url = performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname === path).at(-1)?.name ?? path;
    const world = (await import(url)).getRaceWorld(document.querySelector('#race-canvas'));
    const gl = world.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), error: gl.getError() };
  });
}
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);

try {
  for (const mode of ['arcade', 'street']) {
    const f = await setup(`cold-${mode}`, { holdCar: true, mobile: mode === 'street' });
    try {
      await navigate(f, mode);
      if (mode === 'arcade') await f.page.locator('[data-action="practice"]').first().click();
      await f.page.waitForFunction(mode => {
        const game = JSON.parse(window.render_game_to_text());
        return mode === 'street' ? game.street?.fullStreetState && game.street.phase === 'loading' : game.mode === 'race';
      }, mode, { timeout: 60000 });
      check(f.state.held.length > 0, `${mode}: the real AE86 request is held`);
      const before = await inspect(f.page); assertCovered(before, `${mode} loading`);
      assert.equal(native(before, mode).tick, 0); assert.equal(before.game.countdown, 3);
      if (mode === 'street') assert.equal(await f.page.locator('[data-action="street-start"]').count(), 0, 'Start is unavailable while Tokyo prepares');
      await f.page.keyboard.down('ArrowUp');
      // Exercise normal RAF time before switching to the app's existing manual clock.
      await f.page.waitForTimeout(1300);
      const realtime = await inspect(f.page);
      assert.deepEqual(native(realtime, mode), native(before, mode)); assert.equal(realtime.game.countdown, 3);
      await advance(f.page, 5000);
      const held = await capture(f.page, mode === 'street' ? 'mobile-tokyo-loading' : 'desktop-arcade-loading');
      assert.deepEqual(native(held, mode), native(before, mode)); assert.equal(held.game.countdown, 3);
      assert.equal(held.game.drivingSound.active, false);
      f.release(); await waitReady(f.page, mode);
      const ready = await capture(f.page, `${mode}-first-ready`); assertReady(ready, mode);
      assert.deepEqual(native(ready, mode), native(before, mode), 'loading and the completed first frame do not consume native ticks');
      assert.equal(ready.game.countdown, 3);
      const hardware = await gpu(f.page); assert.equal(hardware.error, 0);
      if (process.platform === 'darwin' && !process.env.RENDERER_BROWSER_ARGS) assert.match(hardware.renderer, /Metal/i);
      if (mode === 'street') await f.page.locator('[data-action="street-start"]').click();
      await advance(f.page, 3200);
      const driving = await inspect(f.page);
      check(native(driving, mode).tick > 0 && driving.game.controls === 1, `${mode}: held throttle begins only after the ordinary countdown`);
      await f.page.keyboard.up('ArrowUp');
      await f.page.keyboard.press('KeyR');
      await waitReady(f.page, mode);
      const rematch = await inspect(f.page); assert.equal(native(rematch, mode).tick, 0);
      if (mode === 'street') await f.page.locator('[data-action="street-start"]').click();
      assert.equal((await inspect(f.page)).game.countdown, 3, 'the ordinary start action resets the full countdown');
      await advance(f.page, 1000);
      assert.equal(native(await inspect(f.page), mode).tick, 0, 'warm rematch preserves the countdown');
      await advance(f.page, 2200);
      check(native(await inspect(f.page), mode).tick > 0, `${mode}: warm rematch resumes normal timing`);
      report.cases.push({ label: `cold-${mode}`, hardware, heldRequests: f.state.held, nativeInitialHash: hash(JSON.stringify(native(before, mode))),
        nativeHeldHash: hash(JSON.stringify(native(held, mode))), nativeReadyHash: hash(JSON.stringify(native(ready, mode))), realtime: realtime.game, driving: driving.game, rematch: rematch.game });
    } finally { await f.close(); }
  }

  for (const mode of ['arcade', 'street']) {
    const f = await setup(`cancel-${mode}`, { holdCar: true });
    try {
      await navigate(f, mode);
      if (mode === 'arcade') await f.page.locator('[data-action="practice"]').first().click();
      await f.page.waitForFunction(mode => mode === 'street'
        ? JSON.parse(window.render_game_to_text()).street?.fullStreetState
        : JSON.parse(window.render_game_to_text()).mode === 'race', mode, { timeout: 60000 });
      await advance(f.page, 0);
      await f.withMediaCancellation('explicit-exit', () => f.page.locator(mode === 'street'
        ? '[data-action="street-exit"]' : '.scene-preparation-panel [data-action="home"]').click());
      assert.equal((await inspect(f.page)).game.mode, 'home');
      f.release(); await waitReady(f.page, 'arcade'); await advance(f.page, 5000);
      const after = await inspect(f.page);
      check(after.game.mode === 'home' && after.rootPreparation === 'idle', `${mode}: completing canceled loading never starts a drive`);
      report.cases.push({ label: `cancel-${mode}`, heldRequests: f.state.held, after: after.game });
    } finally { await f.close(); }
  }

  for (const mode of ['arcade', 'street']) {
    const f = await setup(`failed-ground-${mode}`, { failGround: true });
    try {
      await navigate(f, mode);
      if (mode === 'arcade') await f.page.locator('[data-action="practice"]').first().click();
      await f.page.waitForFunction(mode => mode === 'street'
        ? JSON.parse(window.render_game_to_text()).street?.phase === 'error'
        : document.querySelector('#app')?.dataset.scenePreparation === 'failed', mode, { polling: 100, timeout: 60000 });
      const failed = await capture(f.page, `failed-ground-${mode}`); assertCovered(failed, `${mode} failed ground`);
      assert.equal(failed.assets.groundAsset, 'failed'); assert.equal(native(failed, mode).tick, 0);
      await advance(f.page, 5000);
      assert.deepEqual(native(await inspect(f.page), mode), native(failed, mode));
      const exit = mode === 'street' ? '[data-action="street-exit"]' : '.scene-preparation-panel [data-action="home"]';
      await f.withMediaCancellation('explicit-exit', () => f.page.locator(exit).click());
      check((await inspect(f.page)).game.mode === 'home', `${mode}: failed ground has a safe Back escape`);
      if (mode === 'street') await f.page.locator('[data-action="street-select"]').first().click();
      else await f.page.locator('[data-action="practice"]').first().click();
      const reload = mode === 'street' ? '[data-action="street-reload"]' : '[data-action="scene-reload"]';
      await f.page.locator(reload).waitFor();
      f.state.failGround = false;
      await f.withMediaCancellation('explicit-reload', () => Promise.all([
        f.page.waitForNavigation({ waitUntil: 'domcontentloaded' }), f.page.locator(reload).click(),
      ]));
      await f.page.waitForFunction(() => window.soraCars && window.render_game_to_text, null, { timeout: 60000 });
      await waitReady(f.page, mode);
      const recovered = await inspect(f.page); assertReady(recovered, `${mode} reload`);
      check(mode === 'street' ? recovered.game.street.phase === 'ready' && recovered.game.tick === 0 : recovered.game.mode === 'home', `${mode}: Reload recovers safely without starting the drive`);
      report.cases.push({ label: `failed-ground-${mode}`, abortedRequests: f.state.failures, failed: failed.game, recovered: recovered.game });
    } finally { await f.close(); }
  }

  // Existing local counterpart exercises the actual main begin/input callbacks.
  // No production native state, readiness flags, network peers or credentials are replaced.
  const live = await setup('live-invariance', { holdCar: true, live: true });
  try {
    await navigate(live, 'arcade');
    await live.page.waitForFunction(() => window.lifecycleLive);
    await live.page.locator('[data-action="practice"]').first().click();
    await advance(live.page, 0); assertCovered(await inspect(live.page), 'local preparation before live counterpart');
    await live.page.evaluate(() => window.lifecycleLive.begin()); await advance(live.page, 0);
    await live.page.keyboard.down('ArrowUp'); await advance(live.page, 1000);
    const active = await inspect(live.page), input = await live.page.evaluate(() => window.lifecycleLive.captureInput());
    assert.equal(active.game.mode, 'race'); assert.equal(active.assets.carAsset, 'loading'); assert.ok(active.cover.hidden); assert.equal(input, 1);
    check(active.game.tick === 120 && active.game.countdown === 0, 'live counterpart state/input are unaffected by local preparation');
    assert.equal(live.state.liveRewrites, 1);
    report.cases.push({ label: 'live-invariance', state: active.game, assets: active.assets, input, importRewrites: live.state.liveRewrites,
      scope: 'Existing tests/lifecycle-live.ts explicit local controller counterpart; actual main begin/input callbacks; no peers or ledger.' });
    await live.page.keyboard.up('ArrowUp'); live.release(); await waitReady(live.page, 'arcade');
  } finally { await live.close(); }

  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors.filter(error => !error.expected), [], 'only explicitly induced asset-failure console errors are allowed');
  assert.deepEqual(report.requestFailures.filter(error => !error.expected), []);
  assert.deepEqual(report.forbiddenRequests, [], 'the test never requests an external origin');
  check(report.consoleErrors.some(error => error.expected), 'forced failures were observed and categorized');
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  report.nativeAfter = await sourceHashes();
  report.nativeSourcesUnchanged = JSON.stringify(report.nativeBefore) === JSON.stringify(report.nativeAfter);
  report.passed = failure === null; report.failure = failure;
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
assert.equal(report.nativeSourcesUnchanged, true, 'native source files remain unchanged');
console.log(JSON.stringify({ passed: true, cases: report.cases.length, checks: report.checks.length, captures: report.captures.length,
  expectedConsoleErrors: report.consoleErrors.filter(error => error.expected).length, nativeSourcesUnchanged: true, report: `${out}/report.json` }, null, 2));
