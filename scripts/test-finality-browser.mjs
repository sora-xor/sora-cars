import { withOwnedResources } from './lib/harness-lifecycle.mjs';
import { admissionCommitment, manifestCommitment } from '../src/chain/certificates.ts';
import { currentGameFixtures } from './lib/current-game-fixtures.mjs';
import { AccountAddress } from '@iroha/iroha-js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { ed25519 } from '@noble/curves/ed25519';
import { gameHashLiteralV1, encodeGameValueV1 } from '@iroha/iroha-js/game';
import { encodeRaceValueV1 } from '@iroha/iroha-js/race';
const evidence = process.env.SORA_CARS_TEST_OUTPUT ?? 'output/playwright/finality';
const fixture = currentGameFixtures();
const open = structuredClone(fixture.vectors.find(v => v.name === 'OpenGameSessionV1').value);
const generated = JSON.parse(await readFile('src/game/generated/race-v1-kernels.json', 'utf8'));
// Use the current browser computation for this explicitly synthetic ledger view.
// Canonical native codec vectors retain their original exact bytes separately.
// The native corpus is generic transport material, not a SORA CARS session.
// Build this explicitly synthetic browser scenario with the compiled race schema.
open.manifest.profile_id = gameHashLiteralV1(Buffer.from(generated.profile_id, 'hex'));
open.manifest.application_parameters = Array.from(encodeRaceValueV1('RaceTrackV1', { kind: 'neon_tokyo', value: null }));
open.manifest.max_participant_data_bytes = 1;
open.manifest.access = { kind: 'public', public_key: null };
const hash = n => gameHashLiteralV1(new Uint8Array(32).fill(n | 1));
const commitment = n => 'game384:' + n.toString(16).padStart(2, '0').toUpperCase().repeat(48);
const baseRecord = fixture.vectors.find(v => v.name === 'GameSessionRecordV1' && v.case === 'active').value;
const raw = { ...structuredClone(baseRecord), version: 1, network_id: fixture.network_id, session_id: open.session_id, manifest: open.manifest, profile_id: open.manifest.profile_id, manifest_commitment: hash(11), asset_definition: open.asset_definition, stake: '1', payout_scale: 28, verification_id: null, terminal_at_height: null, payout_claims: [], item_stakes: [], resources: [], participants: [27, 29].map((n, i) => ({ account: AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(n)) }).toI105(), input_key: `ed0120${Buffer.from(ed25519.getPublicKey(new Uint8Array(32).fill(n))).toString('hex').toUpperCase()}`, application_data: [i], dnf_at_tick: null })), admission_commitment: hash(13), phase: { kind: 'playing', value: null }, revision: '1', epoch: '0', deadline_height: '150', checkpoint: null, pending_certificate: null, next_tick: 0, input_commitments: [null, null], input_reveals: [null, null], checkpoint_history: [], certified_batches: [], forced_batches: [], dispute_commitment: commitment(15), result: null };
raw.manifest_commitment = manifestCommitment(raw.network_id, raw.session_id, raw.manifest);
raw.admission_commitment = admissionCommitment(raw.network_id, raw.session_id, { version: 1, participants: raw.participants.map(({ account, input_key, application_data }) => ({ account, input_key, application_data })), wagers: [], resources: [] });
// The synthetic starting state must itself have the exact current native record schema.
// In particular, inherited accepted history cannot survive resetting the frontier to zero.
encodeGameValueV1('GameSessionRecordV1', raw);
const pin = hash(5), origin = 'https://finality.example.test';
const { encodeGameCertifiedSettlementDownloadHeaderV1, decodeGameCertifiedSettlementExportRequestV1, GAME_SETTLEMENT_FILE_ROLES_V1: roles } = await import('@iroha/iroha-js/game-settlement');
// Synthetic opaque role payloads only: this test authenticates no finality or proof.
const parts = roles.map((_, i) => Buffer.alloc(31 + i, i + 1));
const packet = Buffer.concat([encodeGameCertifiedSettlementDownloadHeaderV1({ version: 1, part_lengths: parts.map(bytes => bytes.length) }), ...parts]);
const reportPath = `${evidence}/report.json`;
await rm(reportPath, { force: true });
const report = await withOwnedResources(async own => {
const server = own('Vite server', await createServer({ cacheDir: 'node_modules/.vite-finality-browser', server: { host: '127.0.0.1', port: 0 }, define: { 'import.meta.env.VITE_FINALITY_CONTEXT_ID': JSON.stringify(pin), 'import.meta.env.VITE_FINALITY_CONTEXT_HEIGHT': '"10"', 'import.meta.env.VITE_VERIFIER_BINARY_SHA256': JSON.stringify('a'.repeat(64)), 'import.meta.env.VITE_XOR_ASSET_DEFINITION': JSON.stringify(open.asset_definition) } }), resource => resource.close());
await server.listen();
const address = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = own('Chromium browser', await chromium.launch({ headless: true }), resource => resource.close()), errors = [], checks = [];
await mkdir(evidence, { recursive: true });
async function setup(mode = '') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  const requests = [];
  await page.route(`${origin}/**`, async route => {
    assert.equal(route.request().method(), 'POST'); assert.equal(new URL(route.request().url()).pathname, '/v1/games/settlement/export');
    const selection = decodeGameCertifiedSettlementExportRequestV1(route.request().postDataBuffer());
    assert.equal(selection.source.height, '20'); assert.equal(selection.settled.height, '30'); assert.equal('native_source_sha256' in selection, false);
    assert.equal(selection.source.revision, '1'); assert.equal(selection.settled.revision, '2'); assert.equal(selection.session_id, raw.session_id); requests.push(selection);
    await route.fulfill({ body: packet, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(packet.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Expose-Headers': 'x-content-type-options,content-length,cache-control' } });
  });
  await page.goto(`${address}/tests/live-harness.html`); await page.waitForFunction(() => typeof window.setupLiveHarness === 'function');
  await page.evaluate(async ({ raw, origin, mode }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    window.releasePhysical = release; window.physicalEntered = false;
    const wrappedDirectory = directory => ({
      getDirectoryHandle: async (name, options) => wrappedDirectory(await directory.getDirectoryHandle(name, options)),
      removeEntry: (...args) => directory.removeEntry(...args),
      getFileHandle: async (name, options) => {
        const handle = await directory.getFileHandle(name, options);
        return { createWritable: async () => {
          const stream = await handle.createWritable();
          const operation = async (op, arg) => {
            if ((mode === 'navigation-write' && name === 'finality.nrt' && op === 'write') || (mode === 'cancel-descriptor-write' && name === 'descriptor.json' && op === 'write') || (mode === 'cancel-descriptor-close' && name === 'descriptor.json' && op === 'close')) { window.physicalEntered = true; await gate; }
            return op === 'write' ? stream.write(arg) : stream[op]();
          };
          return { write: arg => operation('write', arg), close: () => operation('close'), abort: () => operation('abort') };
        } };
      },
    });
    window.showDirectoryPicker = async () => { window.pickerHadActivation = navigator.userActivation.isActive; return wrappedDirectory(await navigator.storage.getDirectory()); };
    await window.setupLiveHarness(raw, undefined, origin);
  }, { raw, origin, mode });
  await page.locator('details').filter({ has: page.locator('[data-live="finality-bundle"]') }).locator('summary').click();
  for (const [key, value] of Object.entries({ sessionId: raw.session_id, expectedEntryHash: hash(7), outcomeCommitment: commitment(13), sourceHeight: '20', sourceBlockHash: hash(9), sourceRevision: '1', settledHeight: '30', settledBlockHash: hash(11), settledRevision: '2' })) await page.locator(`#live-settlement-${key}`).fill(value);
  return { page, requests };
}
async function persisted(page) {
  return page.evaluate(async () => { const root = await navigator.storage.getDirectory(), files = {}; for await (const [folder, directory] of root.entries()) for await (const [name, handle] of directory.entries()) files[`${folder}/${name}`] = Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer())); return files; });
}
  const { page, requests } = await setup();
  await page.locator('[data-live="finality-bundle"]').click();
  await page.locator('#harness-dialog').waitFor({ state: 'visible' });
  const command = await page.locator('#harness-dialog textarea').inputValue();
  assert.equal((command.match(/ --/g) ?? []).length, 18); // binary + hash + separator + machine + bundle + thirteen ledger expectations
  assert.ok(command.startsWith("iroha-verify-pinned --binary 'iroha' --sha256 "));
  for (const flag of ['first-height','source-height','source-block-hash','source-revision','settled-height','settled-block-hash','settled-revision']) assert.ok(command.includes(`--${flag} `));
  assert.ok(command.includes('/descriptor.json')); assert.equal(requests.length, 1); assert.equal(await page.evaluate(() => window.pickerHadActivation), true);
  const files = await persisted(page), descriptorKey = Object.keys(files).find(key => key.endsWith('/descriptor.json'));
  assert.equal(Object.keys(files).length, 8); const descriptor = JSON.parse(Buffer.from(files[descriptorKey]).toString('utf8')); assert.equal(descriptor.format, 'iroha.game.certified-settlement-files');
  roles.forEach((role, i) => { const key = descriptorKey.replace('descriptor.json', `${role}.nrt`), bytes = Buffer.from(files[key]); assert.deepEqual(bytes, parts[i]); assert.equal(descriptor.files[role].sha256, createHash('sha256').update(bytes).digest('hex')); assert.equal(descriptor.files[role].bytes, bytes.length); });
  assert.match(await page.locator('#harness-dialog').innerText(), /No browser verification verdict/); assert.equal(await page.evaluate(() => window.liveHarness.sent.length), 0);
  await page.screenshot({ path: `${evidence}/seven-file-export.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${evidence}/seven-file-export-mobile.png`, fullPage: true });
  checks.push('one canonical POST, thirteen independent ledger expectations plus local verifier artifact pin, exact seven persisted native-role bytes and descriptor, endpoint-reported only');
  await page.locator('#harness-dialog').evaluate(node => node.close()); await page.evaluate(() => { window.showDirectoryPicker = undefined; });
  await page.locator('[data-live="finality-bundle"]').click(); await page.waitForFunction(() => window.liveHarness.messages.some(message => message.includes('folder saving support'))); assert.equal(requests.length, 1); checks.push('unsupported browser rejects before transport; no JSON fallback'); await page.close();
  for (const mode of ['navigation-write', 'cancel-descriptor-write', 'cancel-descriptor-close']) {
    const { page } = await setup(mode);
    await page.locator('[data-live="finality-bundle"]').click(); await page.waitForFunction(() => window.physicalEntered);
    if (mode === 'navigation-write') await page.evaluate(() => window.liveHarness.panel.deactivate());
    else await page.evaluate(() => window.liveHarness.panel.action('finality-cancel'));
    // A pending physical operation must keep ownership busy and cannot publish yet.
    await page.waitForTimeout(30); assert.equal(await page.locator('[data-live="finality-bundle"]').isDisabled(), true);
    const before = await persisted(page); assert.ok(Object.entries(before).filter(([key]) => key.endsWith('descriptor.json')).every(([, bytes]) => bytes.length === 0));
    await page.evaluate(() => window.releasePhysical());
    await page.waitForFunction(() => !document.querySelector('[data-live="finality-bundle"]').disabled);
    const after = await persisted(page);
    if (mode === 'cancel-descriptor-close') { assert.equal(Object.keys(after).length, 8); assert.ok(Object.entries(after).find(([key]) => key.endsWith('descriptor.json'))[1].length > 0); }
    else { assert.equal(Object.keys(after).length, 0); assert.equal(await page.locator('#harness-dialog').count(), 0); }
    checks.push(`${mode}: physical operations awaited, ${mode === 'cancel-descriptor-close' ? 'irrevocable commit outcome retained' : 'cleanup completed without descriptor publication'}`);
    await page.close();
  }
  assert.deepEqual(errors, []); return { status: 'passed', assurance: 'synthetic transport and browser storage only; no native proof or finalized-ledger verification', checks, errors };

});
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ evidence, checks: report.checks }));
