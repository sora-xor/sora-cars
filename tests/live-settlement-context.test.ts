import { admissionCommitment, manifestCommitment } from '../src/chain/certificates.ts';
import { currentGameProofFixtures } from '../scripts/lib/current-game-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { gameHashLiteralV1 } from '@iroha/iroha-js/game';
import type { ExecutionProofEnvelopeV1, GameOutcomeV1, GameSessionRecordV1 } from '@iroha/iroha-js/game';
import type { RaceProverRequestV1 } from '@iroha/iroha-js/race';
import { RACE_PROFILE_ID } from '../src/game/environment';
import { createRace } from '../src/game/engine';
import { simulateNativeReplay } from '../src/network/controller';
import { parseRaceRecord, raceAdmission, raceContext, stateRoot } from '../src/chain/races';
import type { RaceChainClient } from '../src/chain/client';

const fixture = currentGameProofFixtures();
const byName = (name: string) => {
  const row = fixture.vectors.find(value => value.name === name);
  assert.ok(row, `required genuine native row ${name}`);
  return row.value;
};
const a = structuredClone(byName('GameSessionRecordV1')) as GameSessionRecordV1;
const aView = parseRaceRecord(a);
const proof = byName('ExecutionProofEnvelopeV1') as ExecutionProofEnvelopeV1;
const outcome = byName('GameOutcomeV1') as GameOutcomeV1;
const request = byName('RaceProverRequestV1') as RaceProverRequestV1;
assert.equal(proof.profile_id, RACE_PROFILE_ID);
assert.deepEqual(request.source_record, a);
assert.equal(request.replay.frames.length, 6);
assert.equal(a.next_tick, 12);
const networkId = a.network_id, asset = a.asset_definition, applicationId = a.manifest.application_id;
const hash = (byte: number) => gameHashLiteralV1(new Uint8Array(32).fill(byte | 1));
const entryHash = hash(55);
// A is the actual fresh native proof source. B is solely an unverified alternate
// endpoint view for continuation ownership; no proof or finality is asserted for B.
function room(id: string): GameSessionRecordV1 {
  const record = structuredClone(a);
  if (id === a.session_id) return record;
  record.session_id = id;
  record.manifest_commitment = manifestCommitment(networkId, id, aView.manifest);
  record.admission_commitment = admissionCommitment(networkId, id, raceAdmission(aView));
  record.checkpoint = null; record.pending_certificate = null;
  record.checkpoint_history = []; record.certified_batches = []; record.forced_batches = [];
  return record;
}
const b = room(hash(3));
assert.notEqual(a.session_id, b.session_id);
const context = raceContext(aView);
assert.notEqual(stateRoot(context, createRace(0, 2)), stateRoot(context, simulateNativeReplay(request.replay)));
// Apply only the Vite compile-time environment substitution to the actual UI
// module. SDK codecs, proof import, session parsing and settlement ISIs remain real.
const liveUrl = new URL('../src/ui/live.ts', import.meta.url).href;
const environment = { VITE_XOR_ASSET_DEFINITION: asset, VITE_FINALITY_CONTEXT_ID: hash(59), VITE_FINALITY_CONTEXT_HEIGHT: '1', VITE_VERIFIER_BINARY_SHA256: 'a'.repeat(64) };
const hook = registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url !== liveUrl) return result;
  const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source as Uint8Array).toString('utf8');
  return { ...result, source: source.replaceAll('import.meta.env', JSON.stringify(environment)) };
} });
const { LiveRacingPanel } = await import('../src/ui/live');
hook.deregister();

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('settlement receipt stays with the room and source that requested wallet approval', { timeout: 30000 }, async t => {
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
  const install = (name: string, value: unknown) => {
    if (!originalGlobals.has(name)) originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  try {
    for (const scenario of ['room-switch', 'same-room-reopen', 'client-replace', 'source-change', 'proof-replace', 'unchanged', 'switch-during-final-refresh']) {
      await t.test(scenario, async () => {
        const listeners = new Map<string, (event: unknown) => void>();
        const screen = { innerHTML: '', querySelectorAll: () => [] };
        install('document', { querySelector: (selector: string) => selector === '#app' ? { addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn) } : null,
          createTreeWalker: () => ({ nextNode: () => null }) });
        install('NodeFilter', { SHOW_TEXT: 4 });
        install('history', { replaceState() {} });
        install('sessionStorage', { getItem: () => null, setItem() {} });
        const wallet = deferred<{ hash: string }>(), submitted = deferred<void>(), finalRefresh = deferred<void>(), finalReply = deferred<ReturnType<typeof room>>();
        const calls: string[] = [], notices: string[] = [], sent: unknown[] = [];
        let loadComplete = deferred<void>(), loadingProof = false, holdFinalRefresh = false, renders = 0;
        const makeClient = () => ({ config: { networkId, applicationId, profileId: RACE_PROFILE_ID }, state: { capability: {}, account: null }, canStake: false,
          async getRace(id: string) {
            calls.push(id);
            if (holdFinalRefresh && id === a.session_id) { finalRefresh.resolve(); return finalReply.promise; }
            return structuredClone(id === a.session_id ? a : b);
          },
          async submit(instruction: unknown) { sent.push(instruction); submitted.resolve(); return wallet.promise; },
        }) as unknown as RaceChainClient;
        let client = makeClient();
        const panel = new LiveRacingPanel({ client: () => client, screen: screen as unknown as HTMLElement,
          showRoom() {}, showDialog() {}, notify(message) { notices.push(message); if (loadingProof) { if (message.includes('Replay and public fields checked.')) loadComplete.resolve(); else loadComplete.reject(new Error(message)); } },
          carId: () => 0, input: () => 0, begin() {}, state() {}, status() {}, finished() {}, spectate() {} });
        const render = panel.render.bind(panel); panel.render = () => { renders++; render(); };
        const input = (id: string, value: string) => listeners.get('input')!({ target: { id, value, dataset: { settlementPin: id.slice('live-settlement-'.length) } } });
        const importProof = async () => {
          loadComplete = deferred<void>(); loadingProof = true;
          listeners.get('change')!({ target: { id: 'live-proof-file', files: [{ size: Buffer.byteLength(JSON.stringify({ proof, outcome })), text: async () => JSON.stringify({ proof, outcome }) }] } });
          try { await loadComplete.promise; } finally { loadingProof = false; }
        };
        try {
          await panel.open(a.session_id); await importProof();
          const settlement = panel.action('settle'); await submitted.promise;
          assert.equal((sent[0] as { SettleGameSessionV1: { session_id: string } }).SettleGameSessionV1.session_id, a.session_id);
          if (scenario === 'room-switch') await panel.open(b.session_id);
          if (scenario === 'same-room-reopen') await panel.open(a.session_id);
          if (scenario === 'client-replace') client = makeClient();
          if (scenario === 'source-change') panel.record = parseRaceRecord({ ...a, deadline_height: String(BigInt(a.deadline_height) + 1n) });
          if (scenario === 'proof-replace') await importProof();
          if (scenario === 'switch-during-final-refresh') holdFinalRefresh = true;
          input('live-settlement-expectedEntryHash', 'CURRENT_ROOM_ENTRY'); input('live-settlement-outcomeCommitment', 'CURRENT_ROOM_OUTCOME'); panel.render();
          const readsBefore = calls.length, rendersBefore = renders;
          wallet.resolve({ hash: entryHash });
          if (scenario === 'switch-during-final-refresh') {
            await finalRefresh.promise; holdFinalRefresh = false; await panel.open(b.session_id);
            input('live-settlement-expectedEntryHash', 'B_ENTRY'); input('live-settlement-outcomeCommitment', 'B_OUTCOME'); panel.render();
            const afterSwitchRenders = renders;
            finalReply.resolve(structuredClone(a)); await settlement;
            assert.equal(renders, afterSwitchRenders, 'A completion does not render B after the final refresh');
            assert.match(screen.innerHTML, /id="live-settlement-expectedEntryHash" data-settlement-pin="expectedEntryHash" value="B_ENTRY"/);
            assert.match(screen.innerHTML, /id="live-settlement-outcomeCommitment" data-settlement-pin="outcomeCommitment" value="B_OUTCOME"/);
          } else {
            await settlement;
            if (scenario === 'unchanged') {
              assert.equal(calls.length, readsBefore + 1, 'current receipt triggers its own room refresh');
              assert.match(screen.innerHTML, new RegExp(`id="live-settlement-expectedEntryHash" data-settlement-pin="expectedEntryHash" value="${entryHash}"`));
              assert.match(screen.innerHTML, new RegExp(`id="live-settlement-outcomeCommitment" data-settlement-pin="outcomeCommitment" value="${proof.statement.outcome_commitment}"`));
            } else {
              assert.equal(calls.length, readsBefore, 'stale acceptance must not refresh the current room');
              assert.equal(renders, rendersBefore, 'stale acceptance must not render the current room');
              panel.render();
              assert.match(screen.innerHTML, /id="live-settlement-expectedEntryHash" data-settlement-pin="expectedEntryHash" value="CURRENT_ROOM_ENTRY"/);
              assert.match(screen.innerHTML, /id="live-settlement-outcomeCommitment" data-settlement-pin="outcomeCommitment" value="CURRENT_ROOM_OUTCOME"/);
            }
          }
          assert.equal(sent.length, 1);
          assert.ok(notices.some(message => message.includes('Endpoint reported transaction acceptance:')), 'A acceptance is still reported, never retracted as an invalid transaction');
        } finally { panel.deactivate(); }
      });
    }
  } finally {
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});
