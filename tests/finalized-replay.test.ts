import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeGameVerificationRequestV1, encodeGameVerificationRequestV1 } from '@iroha/iroha-js/game-proof-worker';
import { encodeGameReplayEvidenceV1, decodeGameReplayExportRequestV1 } from '@iroha/iroha-js/game-replay';
import type { FinalizedGameReplayClientV1 } from '@iroha/iroha-js/game-replay';
import { ToriiReplayController, type ToriiReplayInputs } from '../src/chain/finalized-replay';
import type { ReplayStaging } from '../src/ui/replay-staging';
const fixture = new URL('../test/fixtures/game-finalized-v1/request.nrt', import.meta.resolve('@iroha/iroha-js/game-proof-worker'));
const requestBytes = readFileSync(fixture), request = decodeGameVerificationRequestV1(requestBytes);
const expected = { ...request, computation: request.computation.kind, mode: request.mode.kind, first_height: String(request.first_height), target_height: String(request.target_height), revision: String(request.revision) };
// Codec/controller transport fixture only. Native Core must authenticate actual accepted history.
const evidence = { transcript: { batches: [{ start_tick: 0, inputs: [[1, 2, 3]] }], dnf_events: [] }, current_reveals: [], current_commitments: [] };
const inputs = (): ToriiReplayInputs => ({ requestFile: new Blob([requestBytes]), evidenceFile: new Blob([Uint8Array.from(encodeGameReplayEvidenceV1(evidence))]), expected: { ...expected } });
const origin = 'https://torii.example';
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject}; };
function setup(overrides: Partial<FinalizedGameReplayClientV1> = {}, stageOverrides: Partial<ReplayStaging> = {}) {
  const calls: string[] = [], chunks: Uint8Array[] = [];
  const stage: ReplayStaging = {
    async write(bytes) { calls.push('write'); chunks.push(Uint8Array.from(bytes)); },
    async finish(size) { calls.push('finish'); assert.equal(size,80); return new File(chunks as BlobPart[], 'replay.nrt'); },
    async abort() { calls.push('abort'); }, ...stageOverrides,
  };
  const client: FinalizedGameReplayClientV1 = {
    origin,
    async downloadReplay(bytes,write,options) {
      calls.push('fetch'); const decoded=decodeGameReplayExportRequestV1(bytes);
      assert.deepEqual(decoded,{request,evidence}); assert.equal(options?.maxReplayBytes,256*1024*1024); assert.ok(options?.signal);
      await write(new Uint8Array(40)); await write(new Uint8Array(40));
      return {assurance:'endpoint-reported',request,bytesWritten:80};
    }, ...overrides,
  };
  const c = new ToriiReplayController({ origin, client, staging: async({signal})=>{calls.push('stage');assert.equal(signal.aborted,false);return stage;} });
  return {c,calls,stage,client};
}
test('Torii source compares independent request before upload, stages exact replay and preserves original verifier input',async()=>{
  const {c,calls}=setup(); const selected=inputs();const pending=c.load(selected);selected.expected.revision='9';
  const result=await pending;assert.deepEqual(Buffer.from(await result.requestFile.arrayBuffer()),requestBytes);assert.equal(result.replay.size,80);
  assert.deepEqual(calls,['stage','fetch','write','write','finish']);assert.equal(c.state.phase,'ready');assert.equal(c.state.assurance,'endpoint-reported');
  await assert.rejects(c.load(inputs()),/only once/);await c.dispose();assert.equal(calls.at(-1),'abort');assert.equal(c.state.phase,'cancelled');
});
test('every mismatched independent pin and malformed evidence fails before staging/network',async()=>{
  for(const patch of [{computation:'stock_race' as const},{network_id:request.session_id},{trusted_context_id:request.session_id},{first_height:'2'},{target_height:'7'},{target_block_hash:request.session_id},{session_id:request.network_id},{revision:'99'},{terminal_tick:1},{mode:'archived_settled' as const}]){
    const {c,calls}=setup();const selected=inputs();Object.assign(selected.expected,patch);await assert.rejects(c.load(selected));assert.deepEqual(calls,[]);await c.dispose();
  }
  for(const file of [new Blob(['{"localStreet":true}']),new Blob([new Uint8Array(16*1024*1024+1)]),new Blob([Uint8Array.from(encodeGameReplayEvidenceV1(evidence)),Uint8Array.of(0)]),{size:80,arrayBuffer(){throw new Error('duck');}} as unknown as Blob]){
    const {c,calls}=setup();await assert.rejects(c.load({...inputs(),evidenceFile:file}));assert.deepEqual(calls,[]);await c.dispose();
  }
});
test('StockRace Torii source keeps the original computation pin through export and disk staging', async () => {
  const stock = { ...request, computation: { kind: 'stock_race' as const, value: null } };
  const stockBytes = encodeGameVerificationRequestV1(stock);
  const f = setup({ async downloadReplay(bytes, write) {
    assert.deepEqual(decodeGameReplayExportRequestV1(bytes), { request: stock, evidence });
    await write(new Uint8Array(80)); return { assurance: 'endpoint-reported', request: stock, bytesWritten: 80 };
  } });
  const selected: ToriiReplayInputs = { ...inputs(), requestFile: new Blob([Uint8Array.from(stockBytes)]), expected: { ...expected, computation: 'stock_race' } };
  const pending = f.c.load(selected); selected.expected.computation = 'street';
  const result = await pending; assert.deepEqual(Buffer.from(await result.requestFile.arrayBuffer()), Buffer.from(stockBytes));
  assert.equal(f.c.state.assurance, 'endpoint-reported'); await f.c.dispose();
});
test('request or response stream failure removes staged data and never returns a file',async()=>{
  for(const mode of ['network','write','length','close'] as const){
    const f=setup(mode==='network'?{async downloadReplay(){throw new Error('unavailable');}}:mode==='length'?{async downloadReplay(_bytes,write){await write(new Uint8Array(80));return{assurance:'endpoint-reported',request,bytesWritten:81};}}:{},mode==='write'?{async write(){throw new Error('quota');}}:mode==='close'?{async finish(){throw new Error('close failed');}}:{});
    await assert.rejects(f.c.load(inputs()));assert.equal(f.c.state.phase,'failed');assert.equal(f.calls.at(-1),'abort');assert.ok(mode==='close'||!f.calls.includes('finish'));await f.c.dispose();
  }
});
test('navigation during a late staging open disposes the resulting file without contacting Torii',async()=>{
  const f=setup(),opened=deferred<void>(),late=deferred<ReplayStaging>();
  const c=new ToriiReplayController({origin,client:f.client,staging:async()=>{opened.resolve();return late.promise;}});
  const pending=c.load(inputs());const rejected=assert.rejects(pending,{name:'AbortError'});await opened.promise;
  const closing=c.dispose();late.resolve(f.stage);await closing;await rejected;assert.deepEqual(f.calls,['abort','abort']);assert.equal(c.state.phase,'cancelled');
});
test('cancellation aborts transfer and late transfer completion cannot publish a replay',async()=>{
  const entered=deferred<AbortSignal>(),late=deferred<void>();const f=setup({async downloadReplay(_bytes,write,options){entered.resolve(options!.signal!);await late.promise;await write(new Uint8Array(80));return{assurance:'endpoint-reported',request,bytesWritten:80};}});
  const pending=f.c.load(inputs());const rejected=assert.rejects(pending,{name:'AbortError'});const signal=await entered.promise;const closing=f.c.dispose();assert.equal(signal.aborted,true);late.resolve();await rejected;await closing;assert.equal(f.calls.includes('finish'),false);assert.equal(f.calls.includes('write'),false);
});
test('origin policy, mismatched dependency origin and disposed source reject without work',async()=>{
  for(const bad of ['http://public.example','https://user:pass@example.com','https://torii.example/path'])assert.throws(()=>new ToriiReplayController({origin:bad}));
  const f=setup();assert.throws(()=>new ToriiReplayController({origin,client:{...f.client,origin:'https://other.example'}}));await f.c.dispose();await assert.rejects(f.c.load(inputs()));assert.deepEqual(f.calls,[]);
});

for (const delayedRead of [1, 2]) test(`cancellation during local preparation read ${delayedRead} releases the controller without awaiting a late unowned read`, async () => {
  const original = Blob.prototype.arrayBuffer, entered = deferred<void>(), late = deferred<ArrayBuffer>();
  let reads = 0;
  Blob.prototype.arrayBuffer = function () { if (++reads === delayedRead) { entered.resolve(); return late.promise; } return original.call(this); };
  const f = setup();
  try {
    const pending = f.c.load(inputs()), rejected = assert.rejects(pending, { name: 'AbortError' });
    await entered.promise; await f.c.dispose(); await rejected;
    assert.deepEqual(f.calls, []); assert.equal(f.c.state.phase, 'cancelled');
    late.reject(new Error('late disk read error')); await new Promise(resolve => setTimeout(resolve, 1));
    assert.deepEqual(f.calls, []);
  } finally { Blob.prototype.arrayBuffer = original; }
});

test('preparation deadline rejects a stalled read before staging or transport', async () => {
  const original = Blob.prototype.arrayBuffer;
  Blob.prototype.arrayBuffer = () => new Promise(() => {});
  const f = setup();
  const c = new ToriiReplayController({ origin, client: f.client, preparationTimeoutMs: 5, staging: async () => { throw new Error('must not stage'); } });
  try { await assert.rejects(c.load(inputs()), { name: 'TimeoutError' }); assert.deepEqual(f.calls, []); await c.dispose(); }
  finally { Blob.prototype.arrayBuffer = original; }
  for (const invalid of [0, 120001, 1.5]) assert.throws(() => new ToriiReplayController({ origin, preparationTimeoutMs: invalid }));
});
