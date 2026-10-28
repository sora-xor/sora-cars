import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { GAME_SETTLEMENT_FILE_ROLES_V1 as roles, createCertifiedGameSettlementClientV1, encodeGameCertifiedSettlementDownloadHeaderV1, decodeGameCertifiedSettlementExportRequestV1 } from '@iroha/iroha-js/game-settlement';
import { collectCertifiedSettlement, assertSettlementWalletBinding, settlementExportOrigin, settlementExportRequest, settlementVerificationCommand, settlementVerificationTrust, type SettlementVerificationTrust } from '../src/chain/finality';
import { selectFinalityDirectory } from '../src/ui/finality-export';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/certified-settlement/request.json', import.meta.url), 'utf8'));
const trust: SettlementVerificationTrust = { networkId: fixture.network_id, trustedContextId: fixture.trusted_context_id, expectedEntryHash: fixture.expected_entry_hash, sessionId: fixture.session_id, profileId: fixture.profile_id, outcomeCommitment: fixture.outcome_commitment, firstHeight: fixture.first_height, sourceHeight: fixture.source.height, sourceBlockHash: fixture.source.block_hash, sourceRevision: fixture.source.revision, settledHeight: fixture.settled.height, settledBlockHash: fixture.settled.block_hash, settledRevision: fixture.settled.revision, expectedVerifierBinarySha256: 'a'.repeat(64) };
// Explicitly synthetic role payloads exercise transport/storage, never native finality.
const parts = roles.map((_, index) => Uint8Array.of(index + 1, 42));
const packet = () => Buffer.concat([encodeGameCertifiedSettlementDownloadHeaderV1({ version: 1, part_lengths: parts.map(p => p.length) }), ...parts]);
const fetchImpl: typeof fetch = async (_url, options) => {
  assert.equal(options?.method, 'POST'); assert.deepEqual(decodeGameCertifiedSettlementExportRequestV1(new Uint8Array(await (options!.body as Blob).arrayBuffer())), fixture);
  const bytes = packet(); return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
};
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function filesystem(intercept: (name: string, operation: string) => Promise<void> = async () => {}, removeFails = false) {
  const files = new Map<string, Uint8Array>(), events: string[] = []; let removed = false;
  const notFound = () => { throw new DOMException('missing', 'NotFoundError'); };
  const directory = { async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!options?.create) return files.has(name) ? {} : notFound();
    files.set(name, new Uint8Array());
    return { async createWritable() {
      await intercept(name, 'open'); let buffer = new Uint8Array();
      return { async write(bytes: Uint8Array) { events.push(`write:${name}`); await intercept(name, 'write'); buffer = new Uint8Array([...buffer, ...bytes]); }, async close() { events.push(`close:${name}`); await intercept(name, 'close'); files.set(name, buffer); }, async abort() { events.push(`abort:${name}`); await intercept(name, 'abort'); } };
    } };
  } };
  const parent = { async getDirectoryHandle(_name: string, options?: { create?: boolean }) { return options?.create ? directory : notFound(); }, async removeEntry() { events.push('remove'); await intercept('', 'remove'); if (removeFails) throw Error('filesystem removal denied'); removed = true; files.clear(); } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { showDirectoryPicker: async () => parent } });
  return { files, events, get removed() { return removed; } };
}

test('thirteen ledger expectations and separate artifact hash round-trip retained request and command', () => {
  const encoded = settlementExportRequest(trust);
  assert.deepEqual(Buffer.from(encoded), readFileSync(new URL('./fixtures/certified-settlement/request.nrt', import.meta.url)));
  assert.deepEqual(decodeGameCertifiedSettlementExportRequestV1(encoded), fixture);
  assert.equal(Object.keys(settlementVerificationTrust(trust)).length, 14);
  const command = settlementVerificationCommand(trust, "folder's/descriptor.json");
  for (const flag of ['network-id','trusted-context-id','expected-entry-hash','session-id','profile-id','outcome-commitment','first-height','source-height','source-block-hash','source-revision','settled-height','settled-block-hash','settled-revision']) assert.ok(command.includes(`--${flag} '`), flag);
  assert.ok(command.startsWith("iroha-verify-pinned --binary 'iroha' --sha256 ")); assert.ok(command.includes("'folder'\\''s/descriptor.json'")); assert.ok(!command.includes('settlement-index'));
  const snapshot = settlementVerificationTrust(trust); assert.ok(Object.isFrozen(snapshot));
});
test('closed expectations, u64/order/work bounds and origins reject before I/O', () => {
  for (const change of [{ extra: true }, { firstHeight: 1 }, { sourceRevision: '01' }, { sourceRevision: '-1' }, { settledRevision: '18446744073709551616' }, { firstHeight: '0' }, { firstHeight: '3' }, { settledHeight: '2' }, { settledHeight: '65537' }, { sourceBlockHash: 'abc' }, { expectedVerifierBinarySha256: 'A'.repeat(64) }]) assert.throws(() => settlementVerificationTrust({ ...trust, ...change } as SettlementVerificationTrust));
  for (const value of ['http://example.com', 'https://user@example.com', 'https://example.com/api', 'https://EXAMPLE.com']) assert.throws(() => settlementExportOrigin(value));
  assert.equal(settlementExportOrigin('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
});
test('seven roles close before descriptor publication, exact bytes and digests, no verdict', async () => {
  const fs = filesystem(), controller = new AbortController();
  const directory = await selectFinalityDirectory({ signal: controller.signal, isCurrent: () => true });
  const receipt = await collectCertifiedSettlement('https://torii.example', trust, directory.sink, { signal: controller.signal, fetchImpl });
  assert.equal(receipt.assurance, 'endpoint-reported'); assert.equal(receipt.publicationState, 'files-complete-unpublished'); assert.equal(fs.files.has('descriptor.json'), false);
  assert.deepEqual([...fs.files.keys()], roles.map(role => `${role}.nrt`));
  await directory.publish(receipt);
  assert.equal(new TextDecoder().decode(fs.files.get('descriptor.json')), receipt.descriptorText);
  roles.forEach((role, i) => { assert.deepEqual(fs.files.get(`${role}.nrt`), parts[i]); assert.equal(receipt.descriptor.files[role].sha256, createHash('sha256').update(parts[i]!).digest('hex')); });
  assert.equal(await directory.abort(), false); assert.equal(fs.removed, false);
});
test('abort during a physical write waits for completion before cleanup and never publishes', async () => {
  const gate = deferred(), entered = deferred(), controller = new AbortController();
  const fs = filesystem(async (name, op) => { if (name === 'finality.nrt' && op === 'write') { entered.resolve(); await gate.promise; } });
  const directory = await selectFinalityDirectory({ signal: controller.signal, isCurrent: () => true });
  const download = collectCertifiedSettlement('https://torii.example', trust, directory.sink, { signal: controller.signal, fetchImpl });
  await entered.promise; controller.abort(); let settled = false;
  const result = download.then(() => { settled = true; }, () => { settled = true; });
  await new Promise(r => setTimeout(r, 10)); assert.equal(settled, false); assert.equal(fs.removed, false);
  gate.resolve(); await result; await directory.abort(); assert.equal(fs.removed, true); assert.equal(fs.events.includes('close:descriptor.json'), false);
});
test('pre-commit cancellation discards descriptor; cancellation after close begins waits and reports committed', async () => {
  for (const at of ['write', 'close']) {
    const gate = deferred(), entered = deferred(), controller = new AbortController();
    const fs = filesystem(async (name, op) => { if (name === 'descriptor.json' && op === at) { entered.resolve(); await gate.promise; } });
    const directory = await selectFinalityDirectory({ signal: controller.signal, isCurrent: () => true });
    const receipt = await collectCertifiedSettlement('https://torii.example', trust, directory.sink, { fetchImpl });
    const published = directory.publish(receipt); const outcome = published.then(() => 'published', () => 'rejected');
    await entered.promise; controller.abort(); let aborted = false; const abort = directory.abort().then(value => { aborted = true; return value; });
    await new Promise(r => setTimeout(r, 10)); assert.equal(aborted, false); gate.resolve();
    assert.equal(await outcome, at === 'close' ? 'published' : 'rejected');
    assert.equal(await abort, at !== 'close'); assert.equal(fs.removed, at !== 'close');
  }
});
test('ownership loss before publication prevents commit; failed cleanup is reported', async () => {
  let current = true; const fs = filesystem(undefined, true), controller = new AbortController();
  const directory = await selectFinalityDirectory({ signal: controller.signal, isCurrent: () => current });
  const receipt = await collectCertifiedSettlement('https://torii.example', trust, directory.sink, { fetchImpl });
  current = false; await assert.rejects(directory.publish(receipt), /cleanup also failed/);
  await assert.rejects(directory.abort(), /cleanup failed/); assert.equal(fs.removed, false); assert.equal(fs.files.has('descriptor.json'), false);
});
test('unsupported browser fails before creating or downloading files', async () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  await assert.rejects(selectFinalityDirectory({ signal: new AbortController().signal, isCurrent: () => true }), /folder saving support/);
});

test('wallet retained hexadecimal entry and original source bind independently selected expectations', () => {
  const wallet = { networkId: trust.networkId, sessionId: trust.sessionId, profileId: trust.profileId, expectedEntryHash: trust.expectedEntryHash.slice(5, 69).toLowerCase(), outcomeCommitment: trust.outcomeCommitment, sourceRevision: trust.sourceRevision };
  assert.doesNotThrow(() => assertSettlementWalletBinding(trust, wallet));
  assert.throws(() => assertSettlementWalletBinding({ ...trust, sourceRevision: '4' }, wallet), /wallet-approved/);
  assert.throws(() => assertSettlementWalletBinding({ ...trust, expectedEntryHash: trust.trustedContextId }, wallet), /wallet-approved/);
});

test('network deadline never races physical writes, closes or the quiescence barrier', async () => {
  for (const at of ['write', 'close', 'barrier']) {
    const gate = deferred(), entered = deferred(), controller = new AbortController();
    const fs = filesystem(async (name, op) => { if (name === 'finality.nrt' && op === at) { entered.resolve(); await gate.promise; } });
    const directory = await selectFinalityDirectory({ signal: controller.signal, isCurrent: () => true });
    const sink = at === 'barrier' ? { ...directory.sink, quiesce: async () => { entered.resolve(); await gate.promise; await directory.sink.quiesce(); } } : directory.sink;
    const client = createCertifiedGameSettlementClientV1({ origin: 'https://torii.example', fetchImpl, transferTimeoutMs: 40 });
    let settled = false;
    const result = client.downloadSettlement(settlementExportRequest(trust), sink).then(() => { settled = true; return 'unexpected success'; }, error => { settled = true; return String(error); });
    await entered.promise; await new Promise(r => setTimeout(r, 65)); assert.equal(settled, false); assert.equal(fs.removed, false);
    gate.resolve(); assert.match(await result, /deadline exceeded/); await directory.abort();
    assert.equal(fs.removed, true); assert.equal(fs.events.includes('close:descriptor.json'), false);
  }
});


test('artifact identity stays local and retired fields and invalid paths reject', () => {
  const alternate = { ...trust, expectedVerifierBinarySha256: 'b'.repeat(64) };
  assert.deepEqual(settlementExportRequest(alternate), settlementExportRequest(trust));
  assert.notEqual(settlementVerificationCommand(alternate), settlementVerificationCommand(trust));
  assert.ok(!settlementVerificationCommand(trust).includes('--expected-native-source-sha256'));
  assert.throws(() => settlementVerificationTrust({ ...trust, expectedNativeSourceSha256: 'a'.repeat(64) } as SettlementVerificationTrust));
  for (const path of ['', '\n', 'a\0b']) {
    assert.throws(() => settlementVerificationCommand(trust, path));
    assert.throws(() => settlementVerificationCommand(trust, 'descriptor.json', path));
  }
});

// The browser emits a POSIX command; do not count this shell-specific check as a Windows pass.
if (process.platform !== 'win32') {
test('POSIX bundle and binary paths cannot execute shell substitutions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'iroha-command-quote-'));
  try {
    const marker = join(directory, 'MUST_NOT_EXIST');
    const hostile = `dir's/$(touch ${marker})/\`touch ${marker}\`/file`;
    writeFileSync(join(directory, 'iroha-verify-pinned'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o700 });
    const command = settlementVerificationCommand(trust, hostile, hostile);
    const args = execFileSync('/bin/sh', ['-c', command], { env: { ...process.env, PATH: directory }, encoding: 'utf8' }).trimEnd().split('\n');
    assert.equal(args[args.indexOf('--binary') + 1], hostile);
    assert.equal(args[args.indexOf('--bundle') + 1], hostile);
    assert.equal(existsSync(marker), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
}
