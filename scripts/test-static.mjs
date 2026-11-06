import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(process.env.STATIC_ROOT ?? 'dist'), prefix = '/sorafs/cid/local-publication-test/';
// Serve like the SoraFS site gateway: its media types (iroha_torii_shared content_mime), with every
// other file an attachment, nosniff, at most 8 MiB per response and single byte ranges above that.
const MAX_SITE_RESPONSE = 8 * 1024 * 1024;
const mime = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.map': 'application/json', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject' };
const misses = [], requests = [], served = new Map();
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
    assert.ok(path.startsWith(prefix), 'asset escaped CID directory');
    let file = resolve(root, decodeURIComponent(path.slice(prefix.length)) || 'index.html');
    assert.ok(file.startsWith(`${root}/`));
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const body = await readFile(file), type = mime[extname(file).toLowerCase()], entry = served.get(path) ?? { size: body.length, refused: 0, ranges: [] };
    served.set(path, entry);
    const headers = { 'Content-Type': type ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', ...type ? {} : { 'Content-Disposition': 'attachment' } };
    const refuse = message => { entry.refused++; response.writeHead(413, { 'Content-Type': 'application/json', 'Accept-Ranges': 'bytes' }).end(JSON.stringify({ error: message })); };
    if (!request.headers.range) {
      if (body.length > MAX_SITE_RESPONSE) return refuse(`site file exceeds ${MAX_SITE_RESPONSE} bytes; request one bounded byte range`);
      entry.ranges.push([0, body.length - 1]); response.writeHead(200, headers).end(body); return;
    }
    const range = siteRange(request.headers.range, body.length);
    if (range.status === 413) return refuse(`site byte ranges are limited to ${MAX_SITE_RESPONSE} bytes`);
    if (range.status !== 206) { response.writeHead(range.status, { 'Content-Range': `bytes */${body.length}` }).end(); return; }
    entry.ranges.push([range.start, range.end]);
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${body.length}` }).end(body.subarray(range.start, range.end + 1));
  } catch (error) { misses.push(`${path}: ${error.message}`); response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(origin) && !request.url().startsWith('data:') && !request.url().startsWith(`blob:${origin}/`)) errors.push(`Unexpected runtime dependency: ${request.url()}`); });
  await page.goto(`${origin}${prefix}#/garage`);
  await page.waitForFunction(() => window.soraCars && document.fonts.status === 'loaded');
  assert.equal(await page.locator('#app').getAttribute('data-view'), 'garage');
  await page.locator('[data-action="practice"]').click();
  await page.evaluate(() => window.advanceTime(5000));
  assert.equal(await page.locator('#app').getAttribute('data-view'), 'race');
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
  assert.ok(new URL(await page.locator('.workshop-scene').getAttribute('src'), page.url()).pathname.startsWith(prefix));
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
  // Every file the gateway refused whole was then read completely through byte ranges.
  const ranged = [...served].filter(([, entry]) => entry.refused).map(([path, entry]) => {
    let covered = 0; for (const [start, end] of [...entry.ranges].sort((a, b) => a[0] - b[0])) if (start <= covered) covered = Math.max(covered, end + 1);
    assert.equal(covered, entry.size, `${path} was not read completely through byte ranges`);
    return { path, bytes: entry.size, ranges: entry.ranges.length };
  });
  assert.ok(ranged.some(({ path }) => /\.(glb|bin|hdr)$/.test(path)), 'the race reads at least one model or lighting file above 8 MiB');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/static-cid-path.json', JSON.stringify({ kind: 'local-static-path-test', prefix, gateway: { maxSiteResponseBytes: MAX_SITE_RESPONSE, ranged }, requests: [...new Set(requests)], errors, published: false }, null, 2));
  console.log(`Production static bundle passes nested CID path, SoraFS gateway types and 8 MiB response limit (${ranged.length} files read through byte ranges), hash-route reload, local fonts/images/MIDI, hash-checked Tokyo course/song, and offline practice checks. No SoraFS publication claimed.`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
