import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { encodeGameCertifiedSettlementDownloadHeaderV1, decodeGameCertifiedSettlementExportRequestV1, GAME_SETTLEMENT_FILE_ROLES_V1 as roles } from '@iroha/iroha-js/game-settlement';
const fixture = JSON.parse(await readFile('tests/fixtures/certified-settlement/request.json', 'utf8'));
const trust = { networkId: fixture.network_id, trustedContextId: fixture.trusted_context_id, expectedEntryHash: fixture.expected_entry_hash, sessionId: fixture.session_id, profileId: fixture.profile_id, outcomeCommitment: fixture.outcome_commitment, firstHeight: fixture.first_height, sourceHeight: fixture.source.height, sourceBlockHash: fixture.source.block_hash, sourceRevision: fixture.source.revision, settledHeight: fixture.settled.height, settledBlockHash: fixture.settled.block_hash, settledRevision: fixture.settled.revision, expectedVerifierBinarySha256: 'a'.repeat(64) };
const evidence = process.env.SORA_CARS_TEST_OUTPUT ?? 'output/playwright/finality-storage';
// These bytes are deliberately not native proofs, blocks or finality archives.
const parts = roles.map((_, i) => Buffer.alloc(31 + i, i + 1));
const packet = Buffer.concat([encodeGameCertifiedSettlementDownloadHeaderV1({ version: 1, part_lengths: parts.map(bytes => bytes.length) }), ...parts]);
const origin = 'https://finality.example.test';
const server = await createServer({ cacheDir: 'node_modules/.vite-finality-storage', server: { host: '127.0.0.1', port: 0 } });
await server.listen(); const address = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true }), errors = [], checks = [];
await mkdir(evidence, { recursive: true });
async function setup(mode) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.on('pageerror', error => errors.push(error.message)); let requests = 0;
  await page.route(`${origin}/**`, async route => {
    assert.equal(route.request().method(), 'POST'); assert.equal(new URL(route.request().url()).pathname, '/v1/games/settlement/export');
    assert.deepEqual(decodeGameCertifiedSettlementExportRequestV1(route.request().postDataBuffer()), fixture); requests++;
    await route.fulfill({ body: packet, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(packet.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Expose-Headers': 'x-content-type-options,content-length,cache-control' } });
  });
  await page.goto(`${address}/tests/finality-storage-harness.html`);
  await page.evaluate(async ({ trust, origin, mode }) => {
    const { selectFinalityDirectory } = await import('/src/ui/finality-export.ts');
    const { collectCertifiedSettlement, settlementVerificationCommand } = await import('/src/chain/finality.ts');
    let release; const gate = new Promise(resolve => { release = resolve; }); window.releasePhysical = release; window.physicalEntered = false;
    const controller = new AbortController(); let current = true; window.cancelExport = () => { current = false; controller.abort(); };
    const wrappedDirectory = directory => ({ getDirectoryHandle: async (name, options) => wrappedDirectory(await directory.getDirectoryHandle(name, options)), removeEntry: (...args) => directory.removeEntry(...args), getFileHandle: async (name, options) => {
      const handle = await directory.getFileHandle(name, options);
      return { createWritable: async () => { const stream = await handle.createWritable(); const op = async (operation, arg) => {
        if ((mode === 'write' && name === 'finality.nrt' && operation === 'write') || (mode === 'descriptor-write' && name === 'descriptor.json' && operation === 'write') || (mode === 'descriptor-close' && name === 'descriptor.json' && operation === 'close')) { window.physicalEntered = true; await gate; }
        return operation === 'write' ? stream.write(arg) : stream[operation]();
      }; return { write: arg => op('write', arg), close: () => op('close'), abort: () => op('abort') }; } };
    } });
    if (mode !== 'unsupported') window.showDirectoryPicker = async () => { window.pickerHadActivation = navigator.userActivation.isActive; return wrappedDirectory(await navigator.storage.getDirectory()); };
    document.querySelector('#save').onclick = async () => {
      const button = document.querySelector('#save'), status = document.querySelector('#status'); button.disabled = true; let directory;
      try {
        directory = await selectFinalityDirectory({ signal: controller.signal, isCurrent: () => current, onProgress: (done, total) => { status.textContent = `未検証ファイル: ${done} / ${total}`; } });
        const receipt = await collectCertifiedSettlement(origin, trust, directory.sink, { signal: controller.signal });
        await directory.publish(receipt); document.querySelector('#command').textContent = settlementVerificationCommand(trust, `${directory.folder}/descriptor.json`);
        window.result = 'published'; status.textContent = '保存完了。ネイティブ検証が必要です。 / Saved; native verification remains required.';
      } catch (error) { try { await directory?.abort(); window.result = 'cancelled'; } catch (cleanup) { window.result = `cleanup-failed: ${cleanup}`; } window.failure = String(error); status.textContent = window.failure; }
      finally { button.disabled = false; }
    };
  }, { trust, origin, mode });
  return { page, requests: () => requests };
}
async function persisted(page) { return page.evaluate(async () => { const root = await navigator.storage.getDirectory(), files = {}; for await (const [folder, directory] of root.entries()) for await (const [name, handle] of directory.entries()) files[`${folder}/${name}`] = Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer())); return files; }); }
try {
  for (const mode of ['success', 'write', 'descriptor-write', 'descriptor-close', 'unsupported']) {
    const { page, requests } = await setup(mode); await page.locator('#save').click();
    if (!['success','unsupported'].includes(mode)) {
      await page.waitForFunction(() => window.physicalEntered); await page.evaluate(() => window.cancelExport());
      await page.waitForTimeout(30); assert.equal(await page.locator('#save').isDisabled(), true);
      assert.ok(Object.entries(await persisted(page)).filter(([key]) => key.endsWith('descriptor.json')).every(([, bytes]) => bytes.length === 0)); await page.evaluate(() => window.releasePhysical());
    }
    await page.waitForFunction(() => window.result !== undefined);
    const files = await persisted(page), result = await page.evaluate(() => ({ result: window.result, failure: window.failure }));
    if (['success','descriptor-close'].includes(mode)) {
      assert.equal(result.result, 'published', result.failure); assert.equal(Object.keys(files).length, 8); assert.equal(requests(), 1);
      const descriptorKey = Object.keys(files).find(key => key.endsWith('/descriptor.json')), descriptor = JSON.parse(Buffer.from(files[descriptorKey]).toString('utf8'));
      roles.forEach((role, i) => { const bytes = Buffer.from(files[descriptorKey.replace('descriptor.json', `${role}.nrt`)]); assert.deepEqual(bytes, parts[i]); assert.equal(descriptor.files[role].sha256, createHash('sha256').update(bytes).digest('hex')); assert.equal(descriptor.files[role].bytes, bytes.length); });
      const command = await page.locator('#command').innerText(); assert.equal((command.match(/ --/g) ?? []).length, 18);
      if (mode === 'success') { assert.equal(await page.evaluate(() => window.pickerHadActivation), true); await page.screenshot({ path: `${evidence}/saved-unverified.png`, fullPage: true }); }
    } else { assert.equal(result.result, 'cancelled', result.failure); assert.equal(Object.keys(files).length, 0); assert.equal(requests(), mode === 'unsupported' ? 0 : 1); }
    checks.push(`${mode}: real OPFS handles, awaited physical completion, correct publication/cleanup outcome`); await page.close();
  }
  assert.deepEqual(errors, []); await writeFile(`${evidence}/report.json`, JSON.stringify({ status: 'passed', assurance: 'synthetic transport and browser storage only', currentNativeWireGateRun: false, nativeFinalityVerified: false, checks, errors }, null, 2)); console.log(JSON.stringify({ evidence, checks }));
} finally { await browser.close(); await server.close(); }
