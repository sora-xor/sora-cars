import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

// Real production app and packaged files under a CID-shaped directory.
// This local HTTP check does not establish provider publication or live NFTs.
const root = resolve(process.env.STATIC_ROOT ?? 'dist'), prefix = '/sorafs/cid/soundtrack-local-check/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json', '.txt': 'text/plain' };
const requests = [], misses = [], errors = [], checks = [];
const manifest = JSON.parse(await readFile('src/game/music-assets.generated.json', 'utf8'));
const trackCount = Object.keys(manifest).length, packagedAssets = trackCount * 5;
assert.equal(trackCount, 26);
assert.ok(manifest['meet-me-at-yasukuni']);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
  requests.push(pathname);
  try {
    assert.ok(pathname.startsWith(prefix), 'Request escaped CID directory');
    const file = resolve(root, decodeURIComponent(pathname.slice(prefix.length)) || 'index.html');
    assert.ok(file.startsWith(root + '/'));
    const info = await stat(file); assert.ok(info.isFile());
    const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return; }
      response.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${info.size}` });
      createReadStream(file, { start, end }).pipe(response);
    } else {
      response.writeHead(200, { ...headers, 'Content-Length': info.size });
      if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response);
    }
  } catch (error) { misses.push({ pathname, error: error.message }); response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
const output = process.env.MUSIC_STATIC_OUTPUT ?? 'artifacts/music-static'; await mkdir(output, { recursive: true });
try {
  for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['narrow', 320, 740]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith(origin) && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) errors.push(`Unexpected external request: ${request.url()}`); });
    await page.goto(`${origin}${prefix}#/soundtrack`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'soundtrack');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelector('.record-sleeve img').complete && document.querySelector('.record-sleeve img').naturalWidth >= 1024);
    assert.equal(await page.locator('.record-row').count(), trackCount);
    assert.equal(await page.locator('.record-availability').innerText().then(t => t.includes('RELEASE IN PREPARATION')), true);
    assert.equal(await page.locator('[data-record^="buy:"]').count(), 0, 'Unreleased site cannot manufacture a buy button');
    const layout = async () => page.evaluate(() => {
      const shop = document.querySelector('.record-shop'), player = document.querySelector('.record-player');
      return { documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight, width: document.documentElement.scrollWidth, viewportWidth: innerWidth, shopOverflow: shop.scrollWidth > shop.clientWidth, playerBottom: player.getBoundingClientRect().bottom };
    });
    for (const target of ['.record-masthead', '.record-bottom', '.record-tracklist']) {
      await page.locator(target).scrollIntoViewIfNeeded();
      const bounds = await layout();
      assert.ok(bounds.documentHeight <= bounds.viewportHeight + 1, `${label} document must not scroll`);
      assert.ok(bounds.width <= bounds.viewportWidth && !bounds.shopOverflow, `${label} horizontal overflow`);
      assert.ok(Math.abs(bounds.playerBottom - height) < 1, `${label} player stays at viewport bottom`);
    }
    const rows = await page.locator('.record-row').evaluateAll(nodes => nodes.map(n => n.dataset.record));
    if (label === 'desktop') for (const row of rows) {
      await page.locator(`[data-record="${row}"]`).click();
      const file = row.slice('select:music-'.length);
      await page.waitForFunction(expected => JSON.parse(window.render_game_to_text()).soundtrack.selected === expected, row.slice(7));
      assert.ok(new URL(await page.locator('.record-sleeve img').getAttribute('src'), page.url()).pathname.startsWith(prefix));
      const response = await page.request.get(`${origin}${prefix}${manifest[file].cover.path}`);
      assert.equal(response.status(), 200);
      assert.equal(createHash('sha256').update(await response.body()).digest('hex'), manifest[file].cover.sha256);
    }
    // 裏 URA: the same song's back-jacket NFT shows its own packaged sleeve.
    for (const file of ['midnight-transistor', 'meet-me-at-yasukuni']) {
      await page.locator(`[data-record="select:music-${file}"]`).first().click();
      await page.locator('[data-record="sleeve:ura"]').click();
      await page.waitForFunction(expected => JSON.parse(window.render_game_to_text()).soundtrack.selected === expected, `music-${file}-ura`);
      assert.ok((await page.locator('.record-sleeve img').getAttribute('src')).endsWith(manifest[file].coverUra.path));
      const response = await page.request.get(`${origin}${prefix}${manifest[file].coverUra.path}`);
      assert.equal(response.status(), 200);
      assert.equal(createHash('sha256').update(await response.body()).digest('hex'), manifest[file].coverUra.sha256);
      await page.locator('[data-record="sleeve:omote"]').click();
    }
    const auditioned = ['midnight-transistor', 'one-umbrella-two-chairs', 'side-b-press-record', 'meet-me-at-yasukuni'];
    for (const file of auditioned) {
      await page.locator(`[data-record="select:music-${file}"]`).click();
      await page.locator('.record-player-toggle').click();
      await page.waitForFunction(() => { const p = JSON.parse(window.render_game_to_text()).soundtrack.preview; return p.playing && p.seconds > .1; });
      await page.locator('.record-player-toggle').click();
      assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).soundtrack.preview.playing), false);
      await page.locator('#record-seek').evaluate(input => { input.value = '12'; input.dispatchEvent(new Event('input', { bubbles: true })); });
      assert.ok(Math.abs(await page.evaluate(() => JSON.parse(window.render_game_to_text()).soundtrack.preview.seconds) - 12) < .1);
    }
    const license = await page.request.get(new URL(await page.locator('.record-link').first().getAttribute('href'), page.url()).href);
    assert.equal(license.status(), 200); assert.match(await license.text(), /perpetual/i);
    await page.locator('[data-record="select:music-meet-me-at-yasukuni"]').click();
    await page.evaluate(() => document.querySelector('.record-shop').scrollTop = 0);
    await page.waitForFunction(() => document.querySelector('.record-sleeve img').complete);
    await page.screenshot({ path: `${output}/${label}.png` });
    await page.locator('.record-player-toggle').click();
    await page.locator('.header [data-action="story"]').click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'story');
    assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).soundtrack.preview.playing), false);
    await page.locator('.header [data-action="soundtrack"]').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'soundtrack');
    checks.push({ label, tracks: trackCount, layout: await layout(), playbackPauseSeek: auditioned.length, auditioned, screenshotSong: 'meet-me-at-yasukuni', routeLeaveStopsAudio: true, reload: true });
    await page.close();
  }
  for (const assets of Object.values(manifest)) for (const name of ['wav', 'mp3', 'preview', 'cover', 'coverUra']) {
    const file = assets[name], bytes = await readFile(resolve(root, file.path));
    assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  assert.deepEqual(errors, []); assert.deepEqual(misses, []);
  const report = { passed: true, checkedAt: new Date().toISOString(), checks, completePackagedAssets: packagedAssets, requests: [...new Set(requests)], errors, misses, scope: 'Local production build under CID-shaped prefix. No live publication, minting or purchase.' };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, viewports: checks.length, packagedAssets }));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
