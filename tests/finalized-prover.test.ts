import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decodeGameVerificationRequestV1, encodeGameVerificationRequestV1, parseGameExecutionReportV1,
  GAME_WORKER_PROTOCOL_V1,
} from '@iroha/iroha-js/game-proof-worker';
import type {
  FinalizedGameWorkerClientV1, FinalizedGameWorkerJobV1, GameExecutionReportV1,
  GameWorkerStatusV1,
} from '@iroha/iroha-js/game-proof-worker';
import {
  FINALIZED_PROOF_LIMITS, FinalizedProofController, finalizedVerificationCommand,
  validateFinalizedProofInputs,
} from '../src/chain/finalized-prover';
import type { FinalizedProofInputs, FinalizedProofSelection, FinalizedProofSink } from '../src/chain/finalized-prover';

// Use the installed isolated SDK's native-produced fixture, never the maintained checkout.
// game-finalized-v1/report.json predates the required proof count; the SDK keeps it only as a rejection control.
const fixture = new URL('../test/fixtures/game-finalized-segmented-v1/zero-motion/', import.meta.resolve('@iroha/iroha-js/game-proof-worker'));
const requestBytes = readFileSync(new URL('request.nrt', fixture));
const request = decodeGameVerificationRequestV1(requestBytes);
const nativeReport = parseGameExecutionReportV1(readFileSync(new URL('report.json', fixture), 'utf8'));
const expected: FinalizedProofSelection = {
  computation: 'street',
  network_id: 'hash:425B650340E8D68CD48809C9F3E453F6F8D037D1150CE3A14A39B73B1D384E61#B329',
  trusted_context_id: 'hash:A7ADC1B272550E362F48BF85CF416D64EA527937CFF3E2CCAAB9FD3AD3FF317F#A135',
  first_height: '2', target_height: '2',
  target_block_hash: 'hash:DD4E31E9836B6900AA368FD1D1C6812D90898C1961A3267F0A0871F31C021D81#F86A',
  session_id: 'hash:5AA2D7F71C0F4125883DDF16EF96C97963E340184D6F35DE13AA79C8F592F5FB#BAC0',
  revision: '8', mode: 'selection', terminal_tick: 0,
};
const origin = 'https://worker.example';
const id = 'a'.repeat(64);
const inputs = (): FinalizedProofInputs => ({
  requestFile: new Blob([requestBytes]),
  // This deliberately is opaque fake replay data. Browser acceptance is only
  // bounded transport admission; actual replay authentication belongs to native Core.
  replay: new Blob([new Uint8Array(80)]), expected: { ...expected },
});
const report = (proofBytes = 3): GameExecutionReportV1 => ({ ...nativeReport, proof_bytes: String(proofBytes), replay_bytes: '80' });
function status(phase: 'running' | 'cancelling' | 'failed' | 'complete', proofBytes = 3): GameWorkerStatusV1 {
  const base = { protocol: GAME_WORKER_PROTOCOL_V1, id, assurance: 'endpoint-reported' as const, replay_path: `/v1/jobs/${id}/replay`, status_path: `/v1/jobs/${id}` };
  if (phase === 'complete') return { ...base, status: phase, report: report(proofBytes), proof_path: `/v1/jobs/${id}/proof` };
  if (phase === 'failed') return { ...base, status: phase, error: 'native_job_failed' };
  return { ...base, status: phase };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixtureClient(overrides: Partial<FinalizedGameWorkerJobV1> = {}) {
  const calls: string[] = [];
  const job: FinalizedGameWorkerJobV1 = {
    id, request,
    async uploadReplay(replay, options) { calls.push('upload'); assert.equal(replay.size, 80); assert.ok(options?.signal); return status('running'); },
    async status() { calls.push('status'); return status('complete'); },
    async cancel(options) { calls.push('cancel'); assert.equal(options?.signal?.aborted, false); return status('cancelling'); },
    async downloadProof(write) { calls.push('download'); await write(Uint8Array.of(1, 2, 3)); return { assurance: 'endpoint-reported', report: report(), bytesWritten: 3 }; },
    ...overrides,
  };
  const client: FinalizedGameWorkerClientV1 = {
    origin,
    async reserve(bytes, options) {
      calls.push('reserve'); assert.deepEqual(bytes, new Uint8Array(requestBytes)); assert.ok(options?.signal);
      return job;
    },
  };
  return { client, job, calls };
}
function controller(client: FinalizedGameWorkerClientV1, limits: { [key: string]: number } = {}) {
  return new FinalizedProofController({ origin, client, limits: { pollIntervalMs: 1, operationTimeoutMs: 1000, cleanupTimeoutMs: 30, downloadTimeoutMs: 1000, ...limits } });
}
const nullSink = (): FinalizedProofSink => ({ async write() {}, async close() {}, async abort() {} });

test('native canonical request round-trips and independent expectations preserve u64 precision', async () => {
  const checked = await validateFinalizedProofInputs(inputs());
  assert.deepEqual(checked.requestBytes, new Uint8Array(requestBytes));
  assert.deepEqual(checked.request, request);
  assert.ok(Object.isFrozen(checked.request.mode));
  const revision = '18446744073709551615';
  const high = inputs(); high.requestFile = new Blob([Uint8Array.from(encodeGameVerificationRequestV1({ ...request, revision }))]); high.expected.revision = revision;
  assert.equal((await validateFinalizedProofInputs(high)).request.revision, revision);
  high.expected.revision = '018446744073709551615';
  await assert.rejects(validateFinalizedProofInputs(high), /canonical decimal/);
});

test('every independently selected pin is compared before any worker reservation', async () => {
  const changes: Partial<FinalizedProofSelection>[] = [
    { computation: 'stock_race' },
    { network_id: expected.session_id }, { trusted_context_id: expected.session_id },
    { first_height: '1' }, { target_height: '7' }, { target_block_hash: expected.session_id },
    { session_id: expected.network_id }, { revision: '5' }, { mode: 'archived_settled' }, { terminal_tick: 1 },
  ];
  for (const change of changes) {
    const f = fixtureClient(); const c = controller(f.client); const value = inputs(); Object.assign(value.expected, change);
    await assert.rejects(c.start(value), new RegExp(`independently selected ${Object.keys(change)[0]}`));
    assert.deepEqual(f.calls, []); assert.equal(c.state.phase, 'failed');
    await c.dispose();
  }
});

test('StockRace requires its own independent computation selection and exact original request', async () => {
  const stockRequest = { ...request, computation: { kind: 'stock_race' as const, value: null } };
  const stockBytes = encodeGameVerificationRequestV1(stockRequest);
  const value = { ...inputs(), requestFile: new Blob([Uint8Array.from(stockBytes)]), expected: { ...expected, computation: 'stock_race' as const } };
  const decoded = await validateFinalizedProofInputs(value);
  assert.equal(decoded.request.computation.kind, 'stock_race'); assert.deepEqual(Buffer.from(decoded.requestBytes), Buffer.from(stockBytes));
  await assert.rejects(validateFinalizedProofInputs({ ...value, expected: { ...expected } }), /independently selected computation/);
});

test('oversized/noncanonical requests and obvious wrong replay inputs fail before transport', async () => {
  const wrong: FinalizedProofInputs[] = [
    { ...inputs(), requestFile: new Blob([new Uint8Array(FINALIZED_PROOF_LIMITS.requestBytes + 1)]) },
    { ...inputs(), requestFile: new Blob([requestBytes, Uint8Array.of(0)]) },
    { ...inputs(), replay: new Blob([new Uint8Array(39)]) },
    { ...inputs(), replay: new Blob(['  {"localDrivingTranscript":', '0'.repeat(50), '}']) },
    { ...inputs(), replay: { size: 80, arrayBuffer() { throw new Error('must not call duck type'); } } as unknown as Blob },
  ];
  const f = fixtureClient(); const c = controller(f.client);
  for (const input of wrong) { await assert.rejects(c.start(input)); assert.deepEqual(f.calls, []); }
  await c.dispose();
});

test('selection is snapshotted and complete report stays immutable and endpoint-reported', async () => {
  const f = fixtureClient(); const c = controller(f.client); const selected = inputs();
  const pending = c.start(selected); selected.expected.revision = '9';
  await pending;
  assert.equal(c.state.phase, 'complete'); assert.equal(c.state.assurance, 'endpoint-reported');
  assert.equal(c.state.request?.revision, '8');
  assert.throws(() => { c.state.request!.revision = '7'; }, TypeError);
  for (const key of ['latest_freshness_verified', 'removal_transitions_replayed', 'profile_registered', 'settlement_verified', 'composed_security_qualified'] as const) assert.equal(c.state.report?.[key], false);
  await assert.rejects(c.start(inputs()), /previous native job/);
  await c.cancel(); assert.equal(c.state.closureRequested, true); assert.equal(c.state.endpointStatus, 'cancelling');
  await c.dispose();
});

test('download awaits each bounded write and publishes only after the exact complete stream', async () => {
  const events: string[] = []; let writing = false;
  const f = fixtureClient({ async downloadProof(write) {
    await write(Uint8Array.of(1, 2)); assert.equal(writing, false);
    await write(Uint8Array.of(3));
    return { assurance: 'endpoint-reported', report: report(), bytesWritten: 3 };
  } });
  const c = controller(f.client); await c.start(inputs());
  const result = await c.download({
    async write(chunk) { assert.equal(writing, false); writing = true; events.push(`write:${chunk.length}`); await new Promise(resolve => setTimeout(resolve, 2)); writing = false; },
    async close(value) { assert.equal(c.state.phase, 'downloading'); assert.equal(value.report.settlement_verified, false); events.push('close'); },
    async abort() { events.push('abort'); },
  });
  assert.equal(result.bytesWritten, 3); assert.equal(result.assurance, 'endpoint-reported'); assert.equal(c.state.phase, 'downloaded');
  assert.deepEqual(events, ['write:2', 'write:1', 'close']);
  assert.equal(finalizedVerificationCommand(), './iroha app execution verify-finalized --request request.nrt --replay replay.nrt --proof proof.nrt');
  await c.dispose();
});

test('cancellation aborts a pending poll, requests native closure once, and blocks overlapping starts', async () => {
  const entered = deferred<AbortSignal>(); const never = deferred<GameWorkerStatusV1>();
  const f = fixtureClient({ async status(options) { entered.resolve(options!.signal!); return never.promise; } });
  const c = controller(f.client); const started = c.start(inputs()); const rejected = assert.rejects(started, { name: 'AbortError' });
  const signal = await entered.promise;
  await assert.rejects(c.start(inputs()), /previous native job|already active/);
  await Promise.all([c.cancel(), c.cancel()]); await rejected;
  assert.equal(signal.aborted, true); assert.equal(c.state.phase, 'cancelled'); assert.equal(c.state.closureRequested, true);
  assert.equal(f.calls.filter(call => call === 'cancel').length, 1);
  never.resolve(status('complete')); await Promise.resolve(); assert.equal(c.state.phase, 'cancelled');
  await c.dispose();
});

test('a reservation that resolves after cancellation gets closure without replay upload', async () => {
  const f = fixtureClient(); const entered = deferred<void>(); const reserved = deferred<FinalizedGameWorkerJobV1>();
  const client: FinalizedGameWorkerClientV1 = { origin, async reserve() { entered.resolve(); return reserved.promise; } };
  const c = controller(client); const started = c.start(inputs()); const rejected = assert.rejects(started, { name: 'AbortError' });
  await entered.promise; await c.cancel(); await rejected;
  reserved.resolve(f.job);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(f.calls, ['cancel']); assert.equal(c.state.phase, 'cancelled');
  await c.dispose();
});

test('cancelling replay upload aborts its signal and does not begin status polling', async () => {
  const entered = deferred<AbortSignal>(); const pending = deferred<GameWorkerStatusV1>();
  const f = fixtureClient({ async uploadReplay(_replay, options) { entered.resolve(options!.signal!); return pending.promise; } });
  const c = controller(f.client); const started = c.start(inputs()); const rejected = assert.rejects(started, { name: 'AbortError' });
  const uploadSignal = await entered.promise;
  await c.cancel(); await rejected;
  assert.equal(uploadSignal.aborted, true); assert.deepEqual(f.calls, ['reserve', 'cancel']);
  pending.resolve(status('running')); await Promise.resolve(); assert.equal(c.state.phase, 'cancelled');
  await c.dispose();
});

test('disposing before validation runs performs no transport and publishes no later state', async () => {
  const f = fixtureClient(); const c = controller(f.client); const started = c.start(inputs());
  const rejected = assert.rejects(started, { name: 'AbortError' });
  await c.dispose(); await rejected;
  assert.deepEqual(f.calls, []); assert.equal(c.state.phase, 'disposed');
});

test('operation deadline bounds a transport that ignores abort and native closure that never resolves', async () => {
  let pollSignal: AbortSignal | undefined; let cancelSignal: AbortSignal | undefined;
  const f = fixtureClient({
    async status(options) { pollSignal = options!.signal; return new Promise(() => {}); },
    async cancel(options) { cancelSignal = options!.signal; return new Promise(() => {}); },
  });
  const c = controller(f.client, { operationTimeoutMs: 40, cleanupTimeoutMs: 20 }); const began = Date.now();
  await assert.rejects(c.start(inputs()), { name: 'TimeoutError' });
  assert.ok(Date.now() - began < 500); assert.equal(pollSignal?.aborted, true); assert.equal(cancelSignal?.aborted, true);
  assert.equal(c.state.phase, 'failed'); assert.equal(c.state.closureRequested, true);
  await c.dispose();
});

test('status polling is sequential and exhausts its finite attempt budget', async () => {
  let concurrent = 0; let count = 0;
  const f = fixtureClient({ async status() {
    assert.equal(concurrent++, 0); count++; await new Promise(resolve => setTimeout(resolve, 2)); concurrent--;
    return status('running');
  } });
  const c = controller(f.client, { maxPolls: 3 });
  await assert.rejects(c.start(inputs()), /polling deadline/); assert.equal(count, 3); assert.equal(concurrent, 0);
  await c.dispose();
});

for (const stage of ['write', 'close', 'short-result'] as const) test(`${stage} failure aborts owned output and never marks it downloaded`, async () => {
  const events: string[] = [];
  const f = fixtureClient(stage === 'short-result' ? { async downloadProof(write) { await write(Uint8Array.of(1)); return { assurance: 'endpoint-reported', report: report(), bytesWritten: 1 }; } } : {});
  const c = controller(f.client); await c.start(inputs());
  const sink = {
    async write() { events.push('write'); if (stage === 'write') throw new Error('disk full'); },
    async close() { events.push('close'); if (stage === 'close') throw new Error('publish failed'); },
    async abort() { events.push('abort'); await new Promise(resolve => setTimeout(resolve, 2)); events.push('aborted'); },
  };
  await assert.rejects(c.download(sink), stage === 'write' ? /disk full/ : stage === 'close' ? /publish failed/ : /length/);
  assert.equal(c.state.phase, 'failed'); assert.deepEqual(events.slice(-2), ['abort', 'aborted']);
  if (stage !== 'close') assert.equal(events.includes('close'), false);
  assert.equal(f.calls.at(-1), 'cancel'); await c.dispose();
});

test('cancelling or disposing during a pending write aborts output and prevents close', async () => {
  for (const action of ['cancel', 'dispose'] as const) {
    const entered = deferred<void>(); const pendingWrite = deferred<void>(); let aborted = 0; let closed = 0;
    const f = fixtureClient(); const c = controller(f.client); await c.start(inputs());
    const downloading = c.download({
      async write() { entered.resolve(); await pendingWrite.promise; },
      async close() { closed++; }, async abort() { aborted++; },
    });
    const rejected = assert.rejects(downloading, { name: 'AbortError' });
    await entered.promise; await c[action](); await rejected;
    assert.equal(aborted, 1); assert.equal(closed, 0); assert.equal(c.state.phase, action === 'cancel' ? 'cancelled' : 'disposed');
    pendingWrite.resolve(); await Promise.resolve(); assert.equal(closed, 0);
    if (action === 'dispose') await assert.rejects(c.start(inputs()), /disposed/);
    await c.dispose();
  }
});

test('download deadline aborts a stalled writer and disposes without late publication', async () => {
  const f = fixtureClient(); const c = controller(f.client, { downloadTimeoutMs: 20 }); await c.start(inputs());
  let aborted = false; let closed = false;
  const sink = nullSink(); sink.write = async () => new Promise(() => {}); sink.abort = async () => { aborted = true; }; sink.close = async () => { closed = true; };
  await assert.rejects(c.download(sink), { name: 'TimeoutError' }); assert.equal(aborted, true); assert.equal(closed, false); assert.equal(c.state.phase, 'failed');
  await c.dispose();
});

test('origin, endpoint phase and timing checks fail closed', async () => {
  for (const value of ['http://worker.example', 'https://user:password@worker.example', 'https://worker.example/path']) assert.throws(() => new FinalizedProofController({ origin: value }));
  const f = fixtureClient({ async status() { return status('failed'); } });
  assert.throws(() => controller(f.client, { maxPolls: FINALIZED_PROOF_LIMITS.maxPolls + 1 }), /tighten/);
  const c = controller(f.client); await assert.rejects(c.start(inputs()), /endpoint stopped/); assert.equal(c.state.report, undefined);
  await c.dispose();
});
