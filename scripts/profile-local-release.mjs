// Local frozen-release profiling. This is explicitly not a public-gateway qualification.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { installWebGlDiagnostics } from './diagnose-webgl.mjs';
const [rootArg, outputArg] = process.argv.slice(2);
assert.ok(rootArg && outputArg, 'Usage: node scripts/profile-local-release.mjs <frozen-dist> <new-evidence-directory>');
const root = resolve(rootArg), output = resolve(outputArg);
const selfContained = process.env.SORA_CARS_EXPECT_SELF_CONTAINED === '1';
await mkdir(output, { recursive: true });
const reportPath = resolve(output, 'local-performance.json');
await readFile(reportPath).then(() => { throw new Error('existing evidence; choose a new directory'); }, e => { if (e.code !== 'ENOENT') throw e; });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const report = { kind: 'local-frozen-release-performance', published: false, root, selfContained, started: new Date().toISOString(), success: false, note: 'Native Chrome/Metal, real RAF, no synthetic clock. Car response paced at 128KiB/64ms only to observe actual download progression. Self-contained mode rejects any external dependency.', requests: [], errors: [], consoleErrors: [], graphicsWarnings: [], externalRequests: [] };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/favicon.ico') return res.writeHead(204).end();
    const file = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    assert.ok(file.startsWith(root + sep));
    const body = await readFile(file);
    report.requests.push({ path: pathname, bytes: body.length });
    if (body.length > 8 * 1024 * 1024) return res.writeHead(413, { 'Content-Type': 'application/json', 'Accept-Ranges': 'bytes' }).end('{"error":"bounded range required"}');
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Length': body.length });
    if (pathname.endsWith('/sora-ae86/ae86.glb')) {
      for (let at = 0; at < body.length && !res.destroyed; at += 128 * 1024) { res.write(body.subarray(at, at + 128 * 1024)); await new Promise(r => setTimeout(r, 64)); }
      return res.end();
    }
    res.end(body);
  } catch (e) { report.errors.push(String(e)); res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
let profileStopped = false, cdp, page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page = await context.newPage(); page.setDefaultTimeout(120000);
  report.browser = browser.version();
  report.renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'), extension = gl?.getExtension('WEBGL_debug_renderer_info'); const renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable'; gl?.getExtension('WEBGL_lose_context')?.loseContext(); return renderer; });
  assert.ok(!/unavailable|swiftshader|llvmpipe|software/i.test(report.renderer));
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.origin !== origin) report.externalRequests.push(url.href);
    }
  });
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
    if (message.type() === 'warning' && /WebGL|GL_INVALID|shader|THREE\.WebGL|context lost/i.test(message.text())) report.graphicsWarnings.push(message.text());
  });
  if (process.env.SORA_CARS_DIAGNOSE_WEBGL === '1') await page.addInitScript(installWebGlDiagnostics);
  await page.addInitScript(() => {
    window.__profile = { longTasks: [], gpuCalls: [], progress: [] };
    new PerformanceObserver(list => window.__profile.longTasks.push(...list.getEntries().map(x => x.toJSON()))).observe({ type: 'longtask', buffered: true });
    for (const type of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const proto = window[type]?.prototype;
      if (!proto) continue;
      for (const name of ['getProgramParameter', 'getProgramInfoLog', 'getUniformLocation', 'getAttribLocation', 'compileShader', 'linkProgram', 'texImage2D', 'generateMipmap']) {
        if (!Object.hasOwn(proto, name)) continue;
        const original = proto[name];
        proto[name] = function (...args) { const startTime = performance.now(); try { return Reflect.apply(original, this, args); } finally { const duration = performance.now() - startTime; if (duration > 25) window.__profile.gpuCalls.push({ name, startTime, duration, stack: new Error().stack }); } };
      }
    }
    setInterval(() => { const el = [...document.querySelectorAll('[data-scene-download]')].find(x => x.getClientRects().length); if (!el) return; const meter = el.querySelector('progress'); window.__profile.progress.push({ at: performance.now(), phase: el.dataset.phase, value: meter?.hasAttribute('value') ? meter.value : null, detail: el.querySelector('[data-download-detail]')?.textContent }); }, 100);
  });
  cdp = await context.newCDPSession(page); await cdp.send('Performance.enable'); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
  const start = performance.now();
  await page.goto(`${origin}/#/garage`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.soraCars);
  await page.locator('[data-action="practice"]').click();
  let captured = false;
  while (!(await page.locator('#race-tools [data-action="pause"]').isVisible())) {
    assert.ok(performance.now() - start < 120000, 'scene readiness exceeds 120s');
    assert.notEqual(await page.evaluate(() => JSON.parse(window.render_game_to_text()).graphics.status), 'failed');
    if (!captured && await page.locator('[data-scene-download][data-phase="downloading"]').first().isVisible()) { await page.screenshot({ path: resolve(output, 'loading.png') }); captured = true; }
    await page.waitForTimeout(100);
  }
  report.readyMs = Math.round(performance.now() - start);
  report.state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  Object.assign(report, await page.evaluate(() => window.__profile));
  if (process.env.SORA_CARS_DIAGNOSE_WEBGL === '1') await writeFile(resolve(output, 'webgl-diagnostics.json'), JSON.stringify(await page.evaluate(() => window.__webglDiagnostics), null, 2));
  report.metrics = (await cdp.send('Performance.getMetrics')).metrics;
  const profile = await cdp.send('Profiler.stop'); profileStopped = true;
  await writeFile(resolve(output, 'startup.cpuprofile'), JSON.stringify(profile.profile));
  await page.screenshot({ path: resolve(output, 'ready.png') });
  await page.waitForFunction(() => [...document.querySelectorAll('canvas')]
    .some(canvas => Number(canvas.dataset.localReflectionGenerations) >= 1));
  report.reflection = await page.evaluate(() => [...document.querySelectorAll('canvas')]
    .map(canvas => ({ ready: canvas.dataset.localReflectionReady, generations: canvas.dataset.localReflectionGenerations }))
    .find(value => Number(value.generations) >= 1));
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).countdown <= 0);
  const beforeDriving = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(2500); await page.keyboard.up('ArrowUp');
  const driven = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.ok(driven.player.speed > 0 && driven.player.progress !== beforeDriving.player.progress, 'real RAF acceleration moves the car');
  await page.locator('#race-tools [data-action="pause"]').click();
  const paused = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.ok(paused.paused); await page.waitForTimeout(300);
  assert.equal((await page.evaluate(() => JSON.parse(window.render_game_to_text()))).tick, paused.tick);
  await page.keyboard.press('Escape');
  assert.equal((await page.evaluate(() => JSON.parse(window.render_game_to_text()))).paused, false);
  report.realRafControls = { acceleration: true, pause: true, resume: true, speed: driven.player.speed };
  await page.screenshot({ path: resolve(output, 'driving.png') });
  assert.ok(report.progress.some(x => x.phase === 'downloading' && x.value > 0 && x.value < 1));
  assert.equal(report.state.graphics.status, 'ready');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, [], 'browser console errors');
  assert.deepEqual(report.graphicsWarnings, [], 'graphics warnings');
  if (selfContained) assert.deepEqual(report.externalRequests, [], 'self-contained startup requires no external assets');
  assert.ok(report.readyMs < 45000, 'scene readiness exceeds 45s acceptance limit');
  report.success = true;
} catch (e) { report.failure = e.stack; throw e; }
finally {
  if (cdp && !profileStopped) await cdp.send('Profiler.stop').then(p => writeFile(resolve(output, 'startup.cpuprofile'), JSON.stringify(p.profile))).catch(() => {});
  report.completed = new Date().toISOString(); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await browser.close(); await new Promise(r => server.close(r));
}
console.log(JSON.stringify({ success: report.success, readyMs: report.readyMs, totalBytes: report.requests.reduce((sum, x) => sum + x.bytes, 0), longTaskMs: report.longTasks.reduce((sum, x) => sum + x.duration, 0), slowGpuMs: report.gpuCalls.reduce((sum, x) => sum + x.duration, 0), output }));
