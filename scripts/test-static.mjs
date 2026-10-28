import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(process.env.STATIC_ROOT ?? 'dist'), prefix = '/sorafs/cid/local-publication-test/';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mid': 'audio/midi', '.m4a': 'audio/mp4', '.json': 'application/json' };
const misses = [], requests = [];
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/favicon.ico') { response.writeHead(204).end(); return; }
  requests.push(path);
  try {
    assert.ok(path.startsWith(prefix), 'asset escaped CID directory');
    let file = resolve(root, decodeURIComponent(path.slice(prefix.length)) || 'index.html');
    assert.ok(file.startsWith(`${root}/`));
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
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
  await page.goto(`${origin}${prefix}#/story`);
  await page.locator('.story-chapter[data-action="chapter-0"]').click();
  await page.waitForSelector('#scene-japanese');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).story.cutscene?.cinema?.ready);
  await page.evaluate(() => document.fonts.ready);
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
  assert.ok(requests.some(p => p.includes('noto-sans-jp.ttf')));
  assert.deepEqual(misses, []); assert.deepEqual(errors, []);
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/static-cid-path.json', JSON.stringify({ kind: 'local-static-path-test', prefix, requests: [...new Set(requests)], errors, published: false }, null, 2));
  console.log('Production static bundle passes nested CID path, hash-route reload, local fonts/images/MIDI, hash-checked Tokyo course/song, and offline practice checks. No SoraFS publication claimed.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
