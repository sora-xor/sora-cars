import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(process.env.STATIC_ROOT ?? 'dist'), prefix = '/sorafs/cid/local-publication-test/';
const selfContained = process.env.SORA_CARS_EXPECT_SELF_CONTAINED === '1';
const archive = JSON.parse(await readFile('src/archived-assets.generated.json', 'utf8'));
const archiveRoot = resolve(process.env.STATIC_ARCHIVE_ROOT ?? 'output/reviews/sorafs-publish-20261107/app/release/dist');
const archivePrefix = '/retained-native-publication/';
// Serve like the SoraFS site gateway: its media types (iroha_torii_shared content_mime), with every
// other file an attachment, nosniff, at most 8 MiB per response and single byte ranges above that.
const MAX_SITE_RESPONSE = 8 * 1024 * 1024;
const MAX_STARTUP_BYTES = Number(process.env.STATIC_MAX_STARTUP_BYTES ?? 64 * 1024 * 1024);
const mime = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.map': 'application/json', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject' };
const misses = [], requests = [], served = new Map();
let transferredBytes = 0;
async function sendBody(response, body, path) {
  // One real model is deliberately paced so this test can observe honest byte progress.
  // Every other response retains normal local speed. This is not a simulated progress value.
  const paced = path.endsWith('/sora-ae86/ae86.glb');
  if (!paced) { transferredBytes += body.length; response.end(body); return; }
  for (let offset = 0; offset < body.length && !response.destroyed; offset += 128 * 1024) {
    const chunk = body.subarray(offset, offset + 128 * 1024);
    transferredBytes += chunk.length; response.write(chunk);
    await new Promise(resolve => setTimeout(resolve, 64));
  }
  response.end();
}
function siteRange(header, size) {
  const spec = header.startsWith('bytes=') && !header.includes(',') ? header.slice(6).split('-') : null;
  if (!spec || spec.length !== 2) return { status: 400 };
  const [from, to] = spec, suffix = from === '' ? Number(to) : 0;
  if (size === 0 || from === '' && !(suffix > 0) || from !== '' && !/^\d+$/.test(from) || to !== '' && !/^\d+$/.test(to)) return { status: 416 };
  const start = from === '' ? Math.max(0, size - suffix) : Number(from), end = from === '' || to === '' ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size || end < start) return { status: 416 };
  return end - start + 1 > MAX_SITE_RESPONSE ? { status: 413 } : { status: 206, start, end };
}
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/favicon.ico') { response.writeHead(204).end(); return; }
  requests.push(path);
  try {
    const retained = path.startsWith(archivePrefix), selectedRoot = retained ? archiveRoot : root, selectedPrefix = retained ? archivePrefix : prefix;
    assert.ok(path.startsWith(selectedPrefix), 'asset escaped CID directory');
    let file = resolve(selectedRoot, decodeURIComponent(path.slice(selectedPrefix.length)) || 'index.html');
    assert.ok(file.startsWith(`${selectedRoot}/`));
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const body = await readFile(file), type = mime[extname(file).toLowerCase()], entry = served.get(path) ?? { size: body.length, refused: 0, ranges: [] };
    served.set(path, entry);
    const headers = { 'Content-Type': type ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', ...type ? {} : { 'Content-Disposition': 'attachment' } };
    const refuse = message => { entry.refused++; response.writeHead(413, { 'Content-Type': 'application/json', 'Accept-Ranges': 'bytes' }).end(JSON.stringify({ error: message })); };
    if (!request.headers.range) {
      if (body.length > MAX_SITE_RESPONSE) return refuse(`site file exceeds ${MAX_SITE_RESPONSE} bytes; request one bounded byte range`);
      entry.ranges.push([0, body.length - 1]); response.writeHead(200, { ...headers, 'Content-Length': body.length }); await sendBody(response, body, path); return;
    }
    const range = siteRange(request.headers.range, body.length);
    if (range.status === 413) return refuse(`site byte ranges are limited to ${MAX_SITE_RESPONSE} bytes`);
    if (range.status !== 206) { response.writeHead(range.status, { 'Content-Range': `bytes */${body.length}` }).end(); return; }
    entry.ranges.push([range.start, range.end]);
    response.writeHead(206, { ...headers, 'Content-Length': range.end - range.start + 1, 'Content-Range': `bytes ${range.start}-${range.end}/${body.length}` });
    await sendBody(response, body.subarray(range.start, range.end + 1), path);
  } catch (error) { misses.push(`${path}: ${error.message}`); response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.STATIC_BROWSER_CHANNEL === 'chrome' ? 'chrome' : undefined, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = [], graphicsWarnings = [];
  const archivedRequests = [];
  // Local emulation of the second, explicit immutable SoraFS origin. Public qualification
  // uses the actual gateway separately; this test never labels an intercepted run public.
  await page.route(`${archive.origin}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.slice(1);
    if (selfContained) {
      archivedRequests.push(path); errors.push(`Forbidden retired-publication dependency: ${request.url()}`);
      await route.abort('blockedbyclient'); return;
    }
    assert.ok(Object.hasOwn(archive.files, path), `unlisted archived asset: ${path}`);
    archivedRequests.push(path);
    const response = await route.fetch({ url: `${origin}${archivePrefix}${path}` });
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Encoding' } });
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type()) && /WebGL|GL_INVALID|shader|THREE\.WebGL|context lost/i.test(message.text())) graphicsWarnings.push(message.text());
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    const local = url.origin === origin && (url.pathname.startsWith(prefix) || url.pathname === '/favicon.ico');
    const retained = !selfContained && url.origin === archive.origin && Object.hasOwn(archive.files, url.pathname.slice(1));
    if (!local && !retained) errors.push(`Unexpected runtime dependency: ${request.url()}`);
  });
  await page.goto(`${origin}${prefix}#/garage`);
  await page.waitForFunction(() => window.soraCars && document.fonts.status === 'loaded');
  assert.equal(await page.locator('#app').getAttribute('data-view'), 'garage');
  await page.locator('[data-action="practice"]').click();
  await page.evaluate(() => window.advanceTime(100));
  assert.equal(await page.locator('#app').getAttribute('data-view'), 'race');
  const progress = [];
  for (let attempt = 0; attempt < 150; attempt++) {
    const sample = await page.locator('[data-scene-download]:visible').first().evaluate(element => {
      const meter = element.querySelector('progress');
      return { phase: element.getAttribute('data-phase'), value: meter?.hasAttribute('value') ? meter.value : null, detail: element.querySelector('[data-download-detail]')?.textContent };
    }).catch(() => null);
    if (sample) progress.push(sample);
    if (await page.locator('#race-tools [data-action="pause"]').isVisible()) break;
    await page.waitForTimeout(100);
    await page.evaluate(() => window.advanceTime(1000));
  }
  assert.ok(progress.some(sample => sample.phase === 'downloading' && sample.value > 0 && sample.value < 1), 'a visible progress bar reports received bytes before the scene is ready');
  assert.ok(new Set(progress.filter(sample => sample.phase === 'downloading').map(sample => sample.value)).size > 1, 'download progress advances while real bytes arrive');
  assert.ok(progress.every(sample => sample.value === null || sample.value >= 0 && sample.value <= 1), 'progress stays bounded');
  const startupBytes = transferredBytes;
  assert.ok(startupBytes <= MAX_STARTUP_BYTES, `cold garage through ready practice transferred ${startupBytes} bytes; budget is ${MAX_STARTUP_BYTES}`);
  await page.locator('#race-tools [data-action="pause"]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.soraCars.finishPractice());
  await page.locator('[data-action="home"]').first().click();
  await page.locator('[data-action="settings"]').click();
  for (const link of await page.locator('.music-downloads a').all()) {
    const url = new URL(await link.getAttribute('href'), page.url());
    assert.ok(url.pathname.startsWith(prefix));
    const response = await page.request.get(url.href); assert.equal(response.status(), 200);
    assert.equal((await response.body()).subarray(0, 4).toString(), 'MThd');
  }
  await page.reload();
  await page.waitForFunction(() => window.soraCars);
  assert.equal(await page.locator('#app').getAttribute('data-view'), 'settings');
  await page.goto(`${origin}${prefix}#/shop`);
  await page.waitForSelector('.club-shop');
  assert.equal(await page.locator('.item-swatch').count(), 8);
  await page.goto(`${origin}${prefix}#/shop/story/0`);
  await page.waitForSelector('.shop-story-context');
  await page.reload();
  await page.waitForSelector('.shop-story-context');
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).garage.storyChapter), 0);
  const workshopUrl = new URL(await page.locator('.workshop-scene').getAttribute('src'), page.url());
  assert.ok(workshopUrl.origin === origin && workshopUrl.pathname.startsWith(prefix)
    || !selfContained && workshopUrl.origin === archive.origin && Object.hasOwn(archive.files, workshopUrl.pathname.slice(1)));
  await page.goto(`${origin}${prefix}#/proofs`);
  await page.waitForSelector('#proof-canvas');
  await page.locator('[data-action="proof-stage-5"]').click();
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).proofWorkshop.name), 'FRI');
  await page.reload();
  await page.waitForFunction(() => window.soraCars);
  assert.equal(await page.locator('#app').getAttribute('data-view'), 'proofs');
  assert.equal(await page.locator('.proof-stages button').count(), 7);
  // The gateway serves MP3 previews as nosniff attachments; the player must still play them.
  await page.goto(`${origin}${prefix}#/soundtrack`);
  await page.locator('.record-primary[data-record="preview"]').click();
  await page.waitForFunction(() => !/^0:00 /.test(document.querySelector('#record-clock')?.textContent ?? '0:00 '), null, { timeout: 30000 });
  assert.ok(requests.some(p => p.endsWith('-preview.mp3')), 'preview is served from below the CID');
  const archiveChecks = [];
  if (selfContained || archivedRequests.length) {
    const path = 'assets/music/audio/midnight-transistor.wav', pin = archive.files[path];
    const url = selfContained ? `${origin}${prefix}${path}` : `${archive.origin}/${path}`;
    const result = await page.evaluate(async url => {
      const response = await fetch(url), bytes = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      return { status: response.status, bytes: bytes.byteLength, sha256: digest };
    }, url);
    assert.deepEqual(result, { status: 200, bytes: pin.bytes, sha256: pin.sha256 }, 'full WAV survives native ranges without changing catalog bytes');
    archiveChecks.push({ path, url, ...result });
  }
  await page.goto(`${origin}${prefix}#/story`);
  await page.locator('.story-chapter[data-action="chapter-0"]').click();
  await page.waitForSelector('#scene-japanese');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).story.cutscene?.cinema?.ready);
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => [...document.fonts].some(face => face.family.replaceAll('"', '') === 'SoraJP' && face.status === 'loaded')), 'Japanese face loads within the gateway limit');
  await page.goto(`${origin}${prefix}#/street/tokyo-1986`);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).street?.phase === 'ready', null, { timeout: 30000 });
  const streetPaths = requests.filter(p => p.includes('/assets/street/'));
  assert.equal(new Set(streetPaths).size, 2, 'course and song are both packaged below the CID');
  for (const path of new Set(streetPaths)) {
    const response = await page.request.get(`${origin}${path}`); assert.equal(response.status(), 200);
    const hash = createHash('sha256').update(await response.body()).digest('hex');
    assert.ok(path.includes(hash), 'shipped bytes match their content-addressed filename');
  }
  await page.context().setOffline(true);
  await page.locator('[data-action="street-start"]').click();
  await page.keyboard.down('ArrowUp'); await page.evaluate(() => window.advanceTime(5000)); await page.keyboard.up('ArrowUp');
  const street = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(street.street.phase, 'driving'); assert.ok(street.player.speedMmPerTick > 0);
  assert.equal(street.stakeEnabled, false);
  await page.locator('#race-tools [data-action="pause"]').click();
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).drivingSound.active), false);
  await page.context().setOffline(false);
  assert.ok(requests.some(p => p.includes('noto-sans-jp.woff')));
  assert.deepEqual(misses, []); assert.deepEqual(errors, []);
  assert.deepEqual(graphicsWarnings, [], 'no graphics driver or shader warnings/errors');
  if (selfContained) assert.deepEqual(archivedRequests, [], 'self-contained release never requests the retired publication');
  // Every file the gateway refused whole was then read completely through byte ranges.
  const ranged = [...served].filter(([, entry]) => entry.refused).map(([path, entry]) => {
    let covered = 0; for (const [start, end] of [...entry.ranges].sort((a, b) => a[0] - b[0])) if (start <= covered) covered = Math.max(covered, end + 1);
    assert.equal(covered, entry.size, `${path} was not read completely through byte ranges`);
    return { path, bytes: entry.size, ranges: entry.ranges.length };
  });
  // Optimized scene assets should fit ordinary responses. Range correctness remains enforced
  // for every actual refusal above, and independently by site-fetch's boundary tests.
  assert.ok(!ranged.some(({ path }) => path.includes('/drive-optimized/')), 'optimized scene assets fit a single native gateway response');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/static-cid-path.json', JSON.stringify({ kind: 'local-static-path-test', prefix, selfContained, archive: { origin: archive.origin, requests: [...new Set(archivedRequests)], checks: archiveChecks, locallyEmulated: !selfContained }, gateway: { maxSiteResponseBytes: MAX_SITE_RESPONSE, ranged }, startup: { transferredBytes: startupBytes, budgetBytes: MAX_STARTUP_BYTES, progress }, requests: [...new Set(requests)], errors, graphicsWarnings, published: false }, null, 2));
  console.log(`Production static bundle passes nested CID path, SoraFS gateway types and 8 MiB response limit (${ranged.length} files read through byte ranges), hash-route reload, local fonts/images/MIDI, hash-checked Tokyo course/song, and offline practice checks. No SoraFS publication claimed.`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
