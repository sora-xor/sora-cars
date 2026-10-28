import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const out = 'output/browser/music-store', report = 'artifacts/music-store-browser.json';
const sources = ['src/ui/music-store.ts', 'src/ui/music-store.css', 'src/game/music-catalog.ts', 'src/game/music-assets.generated.json', 'src/chain/inventory.ts', 'src/chain/client.ts', 'tmp/music-store-qa/fixture.ts', 'tmp/music-store-qa/fixture.html', 'scripts/test-music-store.mjs'];
const hash = value => createHash('sha256').update(value).digest('hex');
const before = Object.fromEntries(await Promise.all(sources.map(async path => [path, hash(await readFile(path))])));
const manifest = JSON.parse(await readFile('src/game/music-assets.generated.json', 'utf8'));
const trackCount = Object.keys(manifest).length;
assert.equal(trackCount, 26, 'Generate the actual audio/cover manifest including the supplied Tokyo recording before testing the storefront.');
assert.ok(manifest['meet-me-at-yasukuni']);
await mkdir(out, { recursive: true });
const server = await createServer({ cacheDir: 'node_modules/.vite-music-store-test', server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const checks = [], errors = [], pages = [];
async function page(viewport = { width: 1440, height: 1000 }, song = '') {
  const p = await browser.newPage({ viewport, reducedMotion: 'reduce', acceptDownloads: true }); pages.push(p);
  p.on('pageerror', error => errors.push(error.message));
  await p.goto(`${origin}/tmp/music-store-qa/fixture.html${song ? `?song=${encodeURIComponent(song)}` : ''}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => Boolean(window.musicStoreHarness), undefined, { timeout: 60_000 });
  if (song) await run(p, `select:music-${song}`);
  return p;
}
const view = p => p.evaluate(() => window.musicStoreHarness.view());
async function run(p, action) {
  const finished = (await view(p)).finished;
  await p.evaluate(action => window.musicStoreHarness.run(action), action);
  await p.waitForFunction(expected => window.musicStoreHarness.view().finished === expected, finished + 1);
  return view(p);
}
async function review(p) {
  await run(p, 'refresh');
  const id = await p.evaluate(() => window.musicStoreHarness.offerId);
  await run(p, `review:${id}`);
  await p.waitForSelector('#record-fee-cap');
  return id;
}
async function owned(p) { await p.evaluate(() => window.musicStoreHarness.deliver()); await run(p, 'refresh'); }
async function checkDownloads(p) {
  const song = await p.evaluate(() => window.musicStoreHarness.song);
  for (const format of ['mp3', 'wav', 'cover', 'license']) {
    const downloadEvent = p.waitForEvent('download');
    const state = await run(p, `download:${format}`), download = await downloadEvent;
    const path = `${out}/${download.suggestedFilename()}`; await download.saveAs(path); const bytes = await readFile(path);
    if (format !== 'license') { assert.equal(hash(bytes), song.assets[format].sha256); assert.equal(bytes.length, song.assets[format].bytes); }
    else {
      const grant = await readFile(`public/${song.license.path}`, 'utf8'); const record = bytes.toString('utf8');
      assert.ok(record.endsWith(grant)); assert.match(record, /Licensor: Explicit test fixture issuer/); assert.match(record, /not independently verified finality/); assert.match(record, new RegExp(song.license.sha256));
      assert.ok(record.includes(song.name.en), 'License record identifies the selected recording');
    }
    assert.equal(state.errors.length, 0, state.errors.join());
  }
}
async function complete(label, operation) { await operation(); checks.push(label); console.log(`PASS: ${label}`); }
try {
  await complete('Actual 26-track desktop and 390px/320px mobile storefront is readable without horizontal overflow', async () => {
    const p = await page();
    assert.equal(await p.locator('.record-row').count(), trackCount);
    for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile-390', 390, 844], ['mobile-320', 320, 740]]) {
      await p.setViewportSize({ width, height });
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflow`);
      await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    }
    await p.close();
  });
  await complete('Bilingual checkout remains horizontally contained and the wallet button is reachable at desktop, 390px and 320px', async () => {
    const p = await page(); await review(p); await p.evaluate(() => document.fonts.ready);
    for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile-390', 390, 844], ['mobile-320', 320, 740]]) {
      await p.setViewportSize({ width, height });
      const button = p.locator('[data-record^="buy:"]');
      await button.scrollIntoViewIfNeeded();
      const layout = await p.locator('#dialog').evaluate(dialog => {
        const button = dialog.querySelector('[data-record^="buy:"]'), bounds = button.getBoundingClientRect();
        return {
          overflow: dialog.scrollWidth > dialog.clientWidth,
          reachable: bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
          labelsContained: [...button.children].every(label => { const r = label.getBoundingClientRect(); return r.left >= bounds.left && r.right <= bounds.right && r.top >= bounds.top && r.bottom <= bounds.bottom; }),
        };
      });
      assert.equal(layout.overflow, false, `${name} checkout horizontal overflow`);
      assert.equal(layout.reachable, true, `${name} wallet button outside viewport`);
      assert.equal(layout.labelsContained, true, `${name} checkout label clipped`);
      await button.click({ trial: true });
      await p.screenshot({ path: `${out}/checkout-${name}.png` });
    }
    await p.close();
  });
  await complete('1 XOR checkout shows exact license issuer and separate fee; consent required; receipt alone grants no download', async () => {
    const p = await page(), id = await review(p);
    assert.match(await p.locator('.record-checkout').innerText(), /Explicit test fixture issuer/);
    assert.match(await p.locator('.checkout-terms').innerText(), /1 XOR/);
    assert.match(await p.locator('.record-checkout').innerText(), /SEPARATE FROM THE 1 XOR PRICE/);
    let state = await run(p, `buy:${id}`);
    assert.equal(state.purchases.length, 0); assert.match(state.errors.join(), /review the license terms/);
    await p.locator('#record-license-consent').check(); await p.locator('#record-fee-cap').fill('0.025');
    state = await run(p, `buy:${id}`);
    assert.equal(state.purchases.length, 1);
    assert.equal(state.purchases[0].instruction.BuyNftV1.offer.price, '1');
    assert.equal(state.purchases[0].fee.chargeLimits[0].maxAmount, '0.025');
    assert.equal(state.state.purchase.received, false);
    assert.equal(await p.locator('[data-record="download:mp3"]').count(), 0);
    await owned(p); state = await view(p);
    assert.equal(state.state.purchase.received, true);
    assert.equal(await p.locator('[data-record^="download:"]').count(), 4);
    await p.screenshot({ path: `${out}/owned.png`, fullPage: true }); await p.close();
  });
  await complete('Qualification loss and malformed fee cannot reach mocked wallet purchase', async () => {
    const p = await page(); await p.evaluate(() => window.musicStoreHarness.qualify(false)); const id = await review(p);
    assert.equal(await p.locator(`[data-record="buy:${id}"]`).isDisabled(), true);
    await p.locator('#record-license-consent').check(); await p.locator('#record-fee-cap').fill('-2');
    const state = await run(p, `buy:${id}`); assert.equal(state.purchases.length, 0); assert.match(state.errors.join(), /fee limit/); await p.close();
  });
  await complete('Listing refresh cannot replace the frozen quote displayed for approval', async () => {
    const p = await page(), id = await review(p);
    await p.locator('#record-license-consent').check();
    await p.evaluate(() => window.musicStoreHarness.changeOfferPrice('2'));
    await run(p, 'refresh'); const state = await run(p, `buy:${id}`);
    assert.equal(state.attempts.length, 1); assert.equal(state.attempts[0].price, '1');
    assert.equal(state.purchases.length, 0); assert.match(state.errors.join(), /Offer changed or closed/); await p.close();
  });
  await complete('Replacing or closing a displayed checkout invalidates its detached controls', async () => {
    for (const mutation of ['replaceDialog', 'closeDialog']) {
      const p = await page(), id = await review(p);
      await p.locator('#record-license-consent').check(); await p.evaluate(name => window.musicStoreHarness[name](), mutation);
      const state = await run(p, `buy:${id}`); assert.equal(state.purchases.length, 0); assert.match(state.errors.join(), /Review the quote/); await p.close();
    }
  });
  await complete('A pending review cannot overwrite a newer shared modal', async () => {
    const p = await page(); await run(p, 'refresh');
    const finished = (await view(p)).finished;
    await p.evaluate(() => { const h = window.musicStoreHarness; h.beginGate('review'); h.run(`review:${h.offerId}`); });
    await p.evaluate(() => { const h = window.musicStoreHarness; h.replaceDialog(); h.release(); });
    await p.waitForFunction(n => window.musicStoreHarness.view().finished === n, finished + 1);
    assert.equal(await p.locator('#replacement-modal').count(), 1);
    assert.equal(await p.locator('#record-fee-cap').count(), 0);
    assert.match((await view(p)).errors.join(), /review|確認/); await p.close();
  });
  await complete('Changed wallet/client omits a delayed purchase receipt and notification', async () => {
    for (const mutation of ['changeWallet', 'replaceClient']) {
      const p = await page(), id = await review(p); await p.locator('#record-license-consent').check();
      const finished = (await view(p)).finished;
      await p.evaluate(id => { const h = window.musicStoreHarness; h.beginGate('purchase'); h.run(`buy:${id}`); }, id);
      await p.waitForFunction(() => window.musicStoreHarness.view().purchases.length === 1);
      await p.evaluate(name => { const h = window.musicStoreHarness; h[name](); h.release(); }, mutation);
      await p.waitForFunction(n => window.musicStoreHarness.view().finished === n, finished + 1);
      const state = await view(p); assert.equal(state.state.purchase, null); assert.equal(state.notifications.length, 0); await p.close();
    }
  });
  await complete('Leaving and reentering the store invalidates a delayed purchase completion', async () => {
    const p = await page(), id = await review(p); await p.locator('#record-license-consent').check();
    const finished = (await view(p)).finished;
    await p.evaluate(id => { const h = window.musicStoreHarness; h.beginGate('purchase'); h.run(`buy:${id}`); }, id);
    await p.waitForFunction(() => window.musicStoreHarness.view().purchases.length === 1);
    await p.evaluate(() => { const h = window.musicStoreHarness; h.leave(); h.reenter(); h.release(); });
    await p.waitForFunction(n => window.musicStoreHarness.view().finished === n, finished + 1);
    const state = await view(p);
    assert.equal(state.state.purchase, null); assert.equal(state.notifications.length, 0); assert.equal(state.errors.length, 0);
    assert.equal(await p.locator('.record-row').count(), trackCount); await p.close();
  });
  await complete('Reconnecting the same account invalidates the previous session purchase completion', async () => {
    const p = await page(), id = await review(p); await p.locator('#record-license-consent').check();
    const finished = (await view(p)).finished;
    await p.evaluate(id => { const h = window.musicStoreHarness; h.beginGate('purchase'); h.run(`buy:${id}`); }, id);
    await p.waitForFunction(() => window.musicStoreHarness.view().purchases.length === 1);
    await p.evaluate(() => { const h = window.musicStoreHarness; h.disconnect(); h.reconnectSameWallet(); h.release(); });
    await p.waitForFunction(n => window.musicStoreHarness.view().finished === n, finished + 1);
    const state = await view(p);
    assert.equal(state.state.purchase, null); assert.equal(state.notifications.length, 0); assert.equal(state.errors.length, 0); await p.close();
  });
  await complete('Ownership still loads when sale listings fail, while an inventory failure removes download access', async () => {
    const p = await page(); await p.evaluate(() => { const h = window.musicStoreHarness; h.deliver(); h.failListings(true); });
    await run(p, 'refresh'); assert.equal(await p.locator('[data-record="download:mp3"]').count(), 1);
    await p.evaluate(() => window.musicStoreHarness.failInventory(true)); await run(p, 'refresh');
    assert.equal(await p.locator('[data-record="download:mp3"]').count(), 0); await p.close();
  });
  await complete('Real MP3, WAV and artwork bytes download with exact hashes; license certificate retains the pinned grant and issuer', async () => {
    const p = await page(); await owned(p);
    await checkDownloads(p);
    assert.equal((await view(p)).ownerReads, 8); await p.close();
  });
  await complete('Supplied Tokyo recording previews its own cover/audio, purchases for one XOR in the fixture, and delivers all four exact downloads', async () => {
    const p = await page({ width: 390, height: 844 }, 'meet-me-at-yasukuni');
    const song = await p.evaluate(() => window.musicStoreHarness.song);
    assert.equal(song.file, 'meet-me-at-yasukuni'); assert.equal(song.artist, 'SORA Cars');
    await p.waitForFunction(() => { const image = document.querySelector('.record-sleeve img'); return image.complete && image.naturalWidth >= 1024; });
    assert.ok((await p.locator('.record-sleeve img').getAttribute('src')).endsWith(song.assets.cover.path));
    await p.locator('.record-player-toggle').click();
    await p.waitForFunction(() => { const preview = window.musicStoreHarness.view().state.preview; return preview.sku === 'music-meet-me-at-yasukuni' && preview.playing && preview.seconds > .1; });
    await p.screenshot({ path: `${out}/tokyo-preview-mobile.png` });
    await p.locator('.record-player-toggle').click();
    const id = await review(p);
    assert.match(await p.locator('.record-checkout').innerText(), /Meet Me at Yasukuni/);
    await p.locator('#record-license-consent').check(); await p.locator('#record-fee-cap').fill('0.025');
    await run(p, `buy:${id}`);
    assert.equal((await view(p)).purchases[0].instruction.BuyNftV1.offer.price, '1');
    assert.equal((await view(p)).state.purchase.received, false);
    await owned(p); assert.equal((await view(p)).state.purchase.received, true);
    assert.equal(await p.locator('[data-record^="download:"]').count(), 4);
    await checkDownloads(p); await p.screenshot({ path: `${out}/tokyo-owned-mobile.png` }); await p.close();
  });
  await complete('Corrupted or oversized assets cannot become downloads', async () => {
    for (const oversized of [false, true]) {
      const p = await page(); await owned(p); const song = await p.evaluate(() => window.musicStoreHarness.song);
      const original = await readFile(`public/${song.assets.mp3.path}`), corrupt = oversized ? Buffer.concat([original, Buffer.from([1])]) : Buffer.from(original);
      if (!oversized) corrupt[100] ^= 255;
      await p.route(`**/${song.assets.mp3.path}`, route => route.fulfill({ status: 200, contentType: 'audio/mpeg', body: corrupt }));
      const downloads = []; p.on('download', download => downloads.push(download)); const state = await run(p, 'download:mp3');
      assert.equal(downloads.length, 0); assert.match(state.errors.join(), oversized ? /File size mismatch/ : /File integrity check failed/); await p.close();
    }
  });
  await complete('Ownership loss after fetching a valid master blocks the final download', async () => {
    const p = await page(); await owned(p); await p.evaluate(() => window.musicStoreHarness.failOwnershipRead(2));
    const downloads = []; p.on('download', download => downloads.push(download)); const state = await run(p, 'download:mp3');
    assert.equal(state.ownerReads, 2); assert.equal(downloads.length, 0); assert.match(state.errors.join(), /ownership could not be established/); await p.close();
  });
  await complete('Refreshing unchanged inventory during an owned download preserves delivery and file integrity', async () => {
    const p = await page(); await owned(p);
    const song = await p.evaluate(() => window.musicStoreHarness.song), finished = (await view(p)).finished;
    const downloadEvent = p.waitForEvent('download');
    await p.evaluate(() => { const h = window.musicStoreHarness; h.beginGate('ownership'); h.run('download:mp3'); });
    await p.waitForFunction(() => window.musicStoreHarness.view().ownerReads === 1);
    await run(p, 'refresh');
    await p.evaluate(() => window.musicStoreHarness.release());
    await p.waitForFunction(n => window.musicStoreHarness.view().finished === n, finished + 2);
    const download = await downloadEvent, path = `${out}/refresh-during-download-${download.suggestedFilename()}`;
    await download.saveAs(path); const bytes = await readFile(path), state = await view(p);
    assert.equal(hash(bytes), song.assets.mp3.sha256); assert.equal(bytes.length, song.assets.mp3.bytes);
    assert.equal(state.ownerReads, 2); assert.equal(state.errors.length, 0); assert.equal(state.notifications.length, 1);
    assert.match(state.notifications[0], /Download started/); await p.close();
  });
  await complete('Wallet changes during an ownership lookup or file transfer cancel download delivery', async () => {
    for (const stage of ['ownership', 'file']) {
      const p = await page(); await owned(p); const finished = (await view(p)).finished, downloads = []; p.on('download', d => downloads.push(d));
      if (stage === 'ownership') {
        await p.evaluate(() => { const h = window.musicStoreHarness; h.beginGate('ownership'); h.run('download:mp3'); });
        await p.waitForFunction(() => window.musicStoreHarness.view().ownerReads === 1);
        await p.evaluate(() => { const h = window.musicStoreHarness; h.changeWallet(); h.release(); });
      } else {
        const song = await p.evaluate(() => window.musicStoreHarness.song); let seen; const requested = new Promise(resolve => { seen = resolve; }); let release; const gate = new Promise(resolve => { release = resolve; });
        const bytes = await readFile(`public/${song.assets.mp3.path}`);
        await p.route(`**/${song.assets.mp3.path}`, async route => { seen(); await gate; await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: bytes }).catch(() => {}); });
        await p.evaluate(() => window.musicStoreHarness.run('download:mp3')); await requested;
        await p.evaluate(() => window.musicStoreHarness.changeWallet()); release();
      }
      await p.waitForFunction(n => window.musicStoreHarness.view().finished === n, finished + 1);
      assert.equal(downloads.length, 0); assert.equal((await view(p)).notifications.length, 0); await p.close();
    }
  });
  await complete('A late inventory reply cannot repopulate a changed wallet or departed store', async () => {
    for (const mutation of ['changeWallet', 'replaceClient', 'leave']) {
      const p = await page();
      await p.evaluate(() => { const h = window.musicStoreHarness; h.deliver(); h.beginGate('inventory'); h.refresh(); });
      await p.evaluate(name => { const h = window.musicStoreHarness; h[name](); h.release(); }, mutation);
      await p.waitForFunction(() => window.musicStoreHarness.view().finished === 1);
      assert.deepEqual((await view(p)).state.owned, []); await p.close();
    }
  });
  assert.deepEqual(errors, []);
  const after = Object.fromEntries(await Promise.all(sources.map(async path => [path, hash(await readFile(path))])));
  assert.deepEqual(after, before, 'Source changed during storefront verification; rerun after edits settle.');
  await writeFile(report, JSON.stringify({ passed: true, checked_at: new Date().toISOString(), checks, errors, sources: after, scope: 'Actual MusicStore/controller/styles and real rendered asset bytes. Explicit synthetic issuer/NFTs/ledger/wallet transport; does not certify live network issuance or wallet settlement.' }, null, 2) + '\n');
  console.log(`PASS: ${checks.length} storefront groups, real-file downloads and responsive screenshots.`);
} catch (error) {
  await writeFile('artifacts/music-store-browser-failure.json', JSON.stringify({ at: new Date().toISOString(), checks, errors, failure: error.stack ?? String(error) }, null, 2) + '\n');
  throw error;
} finally { for (const p of pages) if (!p.isClosed()) await p.close(); await browser.close(); await server.close(); }
