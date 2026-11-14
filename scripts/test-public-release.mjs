// Actual public SoraFS qualification. No interception, local server, resource substitution,
// certificate bypass, or synthetic asset response is used by this runner.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const [urlArg, outputArg] = process.argv.slice(2);
assert.ok(urlArg && outputArg, 'Usage: node scripts/test-public-release.mjs <public-release-url> <new-evidence-directory>');
const base = new URL(urlArg); base.hash = ''; base.search = '';
assert.equal(base.protocol, 'https:', 'public HTTPS origin required');
assert.ok(base.pathname.endsWith('/'), 'release URL must end with /');
const output = resolve(outputArg), archive = JSON.parse(await readFile('src/archived-assets.generated.json', 'utf8'));
const startupOnly = process.env.SORA_CARS_PUBLIC_STARTUP_ONLY === '1';
const selfContained = process.env.SORA_CARS_EXPECT_SELF_CONTAINED === '1';
const maxStartupMs = Number(process.env.SORA_CARS_PUBLIC_MAX_STARTUP_MS ?? 45000);
assert.ok(Number.isSafeInteger(maxStartupMs) && maxStartupMs > 0, 'startup time budget must be a positive integer');
await mkdir(output, { recursive: true });
await readFile(resolve(output, 'public-gateway-browser.json')).then(() => { throw new Error('evidence already exists; choose a new output directory'); }, error => { if (error.code !== 'ENOENT') throw error; });
const report = { kind: 'public-native-gateway-browser', base: base.href, started: new Date().toISOString(), browser: 'Chrome / Metal', intercepted: false, tlsBypassed: false, published: true, success: false, stages: [], checks: [], captures: [], pageErrors: [], consoleErrors: [], graphicsWarnings: [], unexpectedOrigins: [], networkFailures: [], requests: [], progress: [], ranges: [] };
report.scope = startupOnly ? 'startup-performance-comparison' : 'full-functional';
report.selfContained = selfContained;
report.maxStartupMs = maxStartupMs;
const start = performance.now(), requests = new Map(), statuses = new Map(), served = new Map();
const elapsed = () => Math.round(performance.now() - start);
const check = (condition, description) => { assert.ok(condition, description); report.checks.push(description); };
const requestBytes = () => [...requests.values()].filter(item => item.url.startsWith('https://')).reduce((sum, item) => ({ decoded: sum.decoded + item.decodedBytes, encoded: sum.encoded + item.encodedBytes }), { decoded: 0, encoded: 0 });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
report.browserVersion = browser.version();
let page, finishTrace;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page = await context.newPage(); page.setDefaultTimeout(120000); page.setDefaultNavigationTimeout(120000);
  report.webglRenderer = await page.evaluate(() => {
    const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl2');
    if (!gl) return 'unavailable';
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext(); return renderer;
  });
  check(!/unavailable|swiftshader|llvmpipe|software/i.test(report.webglRenderer), 'public test uses native GPU rendering');
  const cdp = await context.newCDPSession(page); await cdp.send('Network.enable');
  if (startupOnly) {
    await cdp.send('Performance.enable'); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
    await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'v8.execute', 'blink.user_timing', 'disabled-by-default-devtools.timeline', 'gpu'] } });
    report.metricsBefore = (await cdp.send('Performance.getMetrics')).metrics;
    let stopped = false;
    finishTrace = async () => {
      if (stopped) return; stopped = true;
      report.metricsAfter = (await cdp.send('Performance.getMetrics')).metrics;
      const profile = await cdp.send('Profiler.stop');
      report.cpuProfile = resolve(output, 'startup.cpuprofile'); await writeFile(report.cpuProfile, JSON.stringify(profile.profile));
      const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end'); const { stream } = await completed;
      report.trace = resolve(output, 'startup-trace.json');
      const file = await open(report.trace, 'wx');
      try {
        for (;;) { const part = await cdp.send('IO.read', { handle: stream, size: 1024 * 1024 }); await file.write(part.base64Encoded ? Buffer.from(part.data, 'base64') : part.data); if (part.eof) break; }
      } finally { await file.close(); await cdp.send('IO.close', { handle: stream }); }
    };
  }
  cdp.on('Network.requestWillBeSent', event => requests.set(event.requestId, { url: event.request.url, method: event.request.method, startedMs: elapsed(), browserStartTimestamp: event.timestamp, decodedBytes: 0, encodedBytes: 0 }));
  cdp.on('Network.responseReceived', event => {
    const item = requests.get(event.requestId); if (!item) return;
    item.status = event.response.status; item.mime = event.response.mimeType; item.protocol = event.response.protocol; item.responseMs = elapsed(); item.browserResponseTimestamp = event.timestamp; item.transportTiming = event.response.timing; item.fromDiskCache = event.response.fromDiskCache ?? false;
  });
  cdp.on('Network.dataReceived', event => { const item = requests.get(event.requestId); if (item) item.decodedBytes += event.dataLength; });
  cdp.on('Network.loadingFinished', event => { const item = requests.get(event.requestId); if (item) { item.encodedBytes = event.encodedDataLength; item.finishedMs = elapsed(); item.browserFinishTimestamp = event.timestamp; } });
  cdp.on('Network.loadingFailed', event => { const item = requests.get(event.requestId); if (item) { item.failed = event.errorText; item.finishedMs = elapsed(); report.networkFailures.push({ url: item.url, error: event.errorText, canceled: event.canceled ?? false, atMs: elapsed() }); } });
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
    if (['warning', 'error'].includes(message.type()) && /WebGL|GL_INVALID|shader|THREE\.WebGL|context lost/i.test(message.text())) report.graphicsWarnings.push(message.text());
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    const current = url.origin === base.origin && url.pathname.startsWith(base.pathname);
    const retained = !selfContained && url.origin === archive.origin && Object.hasOwn(archive.files, url.pathname.slice(1));
    if (!current && !retained) report.unexpectedOrigins.push(request.url());
  });
  page.on('response', response => {
    const url = response.url(), status = response.status(); statuses.set(url, status);
    if (status === 206) {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers()['content-range'] ?? '');
      if (!range) { report.pageErrors.push(`206 lacks Content-Range: ${url}`); return; }
      const [, start, end, size] = range.map(Number);
      if (end < start || end - start + 1 > 8 * 1024 * 1024) report.pageErrors.push(`unbounded range: ${url}`);
      const entry = served.get(url) ?? { size, spans: [] }; entry.spans.push([start, end]); served.set(url, entry);
    }
  });
  await page.addInitScript(() => {
    window.__publicReleaseProgress = [];
    window.__publicReleaseLongTasks = [];
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => {
      window.__publicReleaseLongTasks.push(...list.getEntries().map(entry => entry.toJSON()));
    }).observe({ type: 'longtask', buffered: true });
    setInterval(() => {
      const element = [...document.querySelectorAll('[data-scene-download]')].find(node => node.getClientRects().length);
      if (!element) return;
      const meter = element.querySelector('progress');
      window.__publicReleaseProgress.push({ atMs: Math.round(performance.now()), phase: element.getAttribute('data-phase'), value: meter?.hasAttribute('value') ? meter.value : null, detail: element.querySelector('[data-download-detail]')?.textContent });
    }, 200);
  });
  if (startupOnly) await page.addInitScript(() => {
    window.__publicGpuCalls = [];
    for (const type of ['WebGLRenderingContext', 'WebGL2RenderingContext', 'CanvasRenderingContext2D']) {
      const prototype = window[type]?.prototype;
      if (!prototype) continue;
      for (const name of ['getProgramParameter', 'getProgramInfoLog', 'getUniformLocation', 'getAttribLocation', 'compileShader', 'linkProgram', 'texImage2D', 'generateMipmap', 'drawImage']) {
        if (!Object.hasOwn(prototype, name) || typeof prototype[name] !== 'function') continue;
        const original = prototype[name];
        prototype[name] = function timedPublicGpuCall(...args) {
          const start = performance.now();
          try { return Reflect.apply(original, this, args); }
          finally {
            const duration = performance.now() - start;
            if (duration > 25 && window.__publicGpuCalls.length < 1000) window.__publicGpuCalls.push({ type, name, startTime: start, duration, stack: new Error().stack });
          }
        };
      }
    }
  });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const capture = async name => { const path = resolve(output, `${name}.png`); await page.screenshot({ path, fullPage: true }); report.captures.push(path); };
  const stage = async (name, work) => { const startedMs = elapsed(); await work(); const result = { name, startedMs, completedMs: elapsed(), durationMs: elapsed() - startedMs, transferred: requestBytes() }; report.stages.push(result); console.log(JSON.stringify({ stage: result })); };
  const goto = route => page.goto(`${base.href}#/${route}`, { waitUntil: 'domcontentloaded' });

  await stage('cold-practice-ready', async () => {
    await goto('garage');
    await page.waitForFunction(() => window.soraCars && window.render_game_to_text);
    check(await page.locator('#app').getAttribute('data-view') === 'garage', 'garage renders');
    await page.locator('[data-action="practice"]').click();
    let captured = false;
    for (;;) {
      const current = await state();
      assert.notEqual(current.graphics.status, 'failed', current.graphics.message);
      if (!captured && await page.locator('[data-scene-download][data-phase="downloading"]').first().isVisible()) {
        await capture('loading-progress'); captured = true;
        report.loadingFocusPreserved = await page.evaluate(async () => {
          const button = document.querySelector('.scene-preparation-panel [data-action="home"]');
          if (!button) return null;
          button.focus(); await new Promise(resolve => setTimeout(resolve, 450));
          return button.isConnected ? document.activeElement === button : null;
        });
        if (report.loadingFocusPreserved !== null) check(report.loadingFocusPreserved, 'progress updates preserve keyboard focus');
      }
      if (await page.locator('#race-tools [data-action="pause"]').isVisible()) break;
      assert.ok(elapsed() < maxStartupMs, `cold practice is ready within ${maxStartupMs}ms`);
      await page.waitForTimeout(250);
    }
    report.progress = await page.evaluate(() => window.__publicReleaseProgress);
    report.longTasks = await page.evaluate(() => window.__publicReleaseLongTasks);
    if (startupOnly) report.slowGpuCalls = await page.evaluate(() => window.__publicGpuCalls);
    check(report.progress.some(item => item.phase === 'downloading' && item.value > 0 && item.value < 1), 'visible loading percentage reflects received bytes');
    check(new Set(report.progress.filter(item => item.phase === 'downloading').map(item => item.value)).size > 1, 'visible download progress advances');
    check(report.progress.every(item => item.value === null || item.value >= 0 && item.value <= 1), 'loading progress remains bounded');
    report.startup = { durationMs: elapsed(), ...requestBytes(), graphics: (await state()).graphics };
    check(report.startup.durationMs <= maxStartupMs, `cold startup stays below ${maxStartupMs}ms`);
    check(report.startup.decoded <= 64 * 1024 * 1024, 'cold startup stays below 64 MiB decoded bytes');
    await capture('practice-ready');
  });
  if (finishTrace) await finishTrace();

  if (!startupOnly) {
  await stage('driving-controls-pause-resume', async () => {
    await page.evaluate(() => window.advanceTime(4000));
    const before = await state();
    await page.keyboard.down('ArrowUp'); await page.evaluate(() => window.advanceTime(5000)); await page.keyboard.up('ArrowUp');
    const driven = await state();
    check(driven.player.speed > 0 && driven.player.progress !== before.player.progress, 'accelerator moves the practice car');
    await capture('practice-driving');
    await page.locator('#race-tools [data-action="pause"]').click();
    const paused = await state(); check(paused.paused, 'pause control pauses driving');
    await page.evaluate(() => window.advanceTime(1000));
    check((await state()).tick === paused.tick, 'paused race does not advance');
    await page.keyboard.press('Escape'); check(!(await state()).paused, 'Escape resumes driving');
    check(!(await state()).stakeEnabled, 'practice leaves stakes disabled');
    await page.evaluate(() => window.soraCars.finishPractice());
  });

  await stage('routes-shop-fonts', async () => {
    await goto('settings'); await page.waitForFunction(() => window.soraCars);
    for (const link of await page.locator('.music-downloads a').all()) {
      const url = new URL(await link.getAttribute('href'), page.url());
      check(url.origin === base.origin && url.pathname.startsWith(base.pathname), 'MIDI download remains in the new publication');
      const response = await page.request.get(url.href); assert.equal(response.status(), 200); assert.equal((await response.body()).subarray(0, 4).toString(), 'MThd');
    }
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.soraCars);
    check(await page.locator('#app').getAttribute('data-view') === 'settings', 'settings hash survives reload');
    await goto('shop'); await page.waitForSelector('.club-shop'); assert.equal(await page.locator('.item-swatch').count(), 8);
    await goto('shop/story/0'); await page.waitForSelector('.shop-story-context');
    check((await state()).garage.storyChapter === 0, 'story workshop route renders');
    await page.waitForFunction(() => { const image = document.querySelector('.workshop-scene'); return image?.complete && image.naturalWidth > 0; });
    await page.evaluate(() => document.fonts.ready);
    check(await page.evaluate(() => [...document.fonts].some(face => face.family.replaceAll('"', '') === 'SoraJP' && face.status === 'loaded')), 'Japanese font loads');
    await capture('story-workshop');
  });

  await stage(selfContained ? 'soundtrack-and-current-full-recording' : 'soundtrack-and-retained-full-recording', async () => {
    await goto('soundtrack'); await page.locator('.record-primary[data-record="preview"]').click();
    await page.waitForFunction(() => !/^0:00 /.test(document.querySelector('#record-clock')?.textContent ?? '0:00 '));
    await capture('soundtrack-playing');
    const path = 'assets/music/audio/midnight-transistor.wav', pin = archive.files[path];
    const url = selfContained ? new URL(path, base).href : `${archive.origin}/${path}`;
    const result = await page.evaluate(async url => {
      const response = await fetch(url), bytes = await response.arrayBuffer();
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      return { status: response.status, bytes: bytes.byteLength, sha256 };
    }, url);
    assert.deepEqual(result, { status: 200, bytes: pin.bytes, sha256: pin.sha256 });
    report.recording = { url, ...result };
    report.checks.push(`${selfContained ? 'current publication' : 'retained'} full WAV matches its exact catalog length and SHA-256 through public native ranges`);
  });

  await stage('story-cinema', async () => {
    await goto('story'); await page.locator('.story-chapter[data-action="chapter-0"]').click();
    await page.waitForSelector('#scene-japanese'); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).story.cutscene?.cinema?.ready);
    await capture('story-cinema'); report.checks.push('story illustration and bilingual dialogue render');
  });

  await stage('street-song-offline-driving', async () => {
    await goto('street/tokyo-1986'); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).street?.phase === 'ready');
    const urls = [...new Set([...requests.values()].map(item => item.url).filter(url => url.startsWith(base.href) && url.includes('/assets/street/')))];
    assert.equal(urls.length, 2);
    for (const url of urls) {
      const response = await page.request.get(url); assert.equal(response.status(), 200);
      const hash = createHash('sha256').update(await response.body()).digest('hex'); check(url.includes(hash), 'street course/song matches its hash-addressed filename');
    }
    await context.setOffline(true);
    await page.locator('[data-action="street-start"]').click();
    await page.keyboard.down('ArrowUp'); await page.evaluate(() => window.advanceTime(5000)); await page.keyboard.up('ArrowUp');
    const current = await state(); check(current.street.phase === 'driving' && current.player.speedMmPerTick > 0, 'cached street practice drives offline');
    check(!current.stakeEnabled, 'street practice leaves stakes disabled');
    await capture('street-driving-offline');
    await page.locator('#race-tools [data-action="pause"]').click(); check(!(await state()).drivingSound.active, 'pause stops driving audio');
    await context.setOffline(false);
  });
  }
  for (const [url, entry] of served) {
    let covered = 0;
    for (const [start, end] of entry.spans.sort((a, b) => a[0] - b[0])) if (start <= covered) covered = Math.max(covered, end + 1);
    check(covered === entry.size, `complete native range coverage: ${url}`);
    report.ranges.push({ url, bytes: entry.size, spans: entry.spans });
  }
  const misses = [...statuses].filter(([, status]) => status >= 400 && status !== 413);
  report.unresolvedNetworkFailures = report.networkFailures.filter(failure => !failure.canceled && ![...requests.values()].some(request => request.url === failure.url && !request.failed && request.finishedMs > failure.atMs));
  assert.deepEqual(misses, [], 'no unresolved HTTP errors'); assert.deepEqual(report.pageErrors, [], 'no page errors'); assert.deepEqual(report.unexpectedOrigins, [], selfContained ? 'only the new publication is contacted; no retired-CID dependency' : 'only the new publication and explicit retained assets are contacted');
  assert.deepEqual(report.unresolvedNetworkFailures, [], 'no unresolved failed asset transfers');
  assert.deepEqual(report.graphicsWarnings, [], 'no graphics driver or shader warnings/errors');
  report.success = true;
} catch (error) {
  report.failure = error.stack ?? String(error);
  if (page) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (finishTrace) await finishTrace().catch(error => { report.traceError = String(error); });
  report.completed = new Date().toISOString(); report.durationMs = elapsed(); report.requests = [...requests.values()];
  await writeFile(resolve(output, 'public-gateway-browser.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify({ success: report.success, startup: report.startup, output, checks: report.checks.length }));
