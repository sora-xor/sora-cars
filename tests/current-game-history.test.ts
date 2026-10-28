import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRaceFrameV1, decodeRaceFrameV1, decodeRaceValueV1, encodeRaceValueV1 } from '@iroha/iroha-js/race';
import { ed25519 } from '@noble/curves/ed25519';
import { prepareRaceTranscript, inputDigest, inputSigningFrame } from '../src/chain/certificates';
import type { RaceRecord } from '../src/chain/races';
import { gameHashLiteralV1 } from '@iroha/iroha-js/game';
import { raceInputPayloadV1 } from '@iroha/iroha-js/race';
import type { RaceReplayV1, RaceResultV1 } from '@iroha/iroha-js/race';
import { collectAcceptedHistory, settlementResult } from '../src/chain/history';
import { nativeState } from '../src/chain/races';
import { createRace } from '../src/game/engine';

const physical: RaceResultV1 = { ticks: 12, standings: [
  { slot: 0, finish_tick: 10, dnf_tick: null, progress_mm: 1000 },
  { slot: 1, finish_tick: 11, dnf_tick: null, progress_mm: 1000 },
], winners: [0] };
test('late consensus removal changes economic winners without rewriting physical finish times', () => {
  const full = { batches: [], dnf_events: [{ tick: 18, slots: [0] }] };
  const economic = settlementResult(physical, 24, full);
  assert.deepEqual(economic.winners, [1]);
  assert.equal(economic.physical_terminal_tick, 12); assert.equal(economic.accepted_through_tick, 24);
  assert.equal(economic.standings.find(s => s.slot === 0)!.dnf_tick, 18);
  assert.deepEqual(physical.winners, [0]); assert.ok(physical.standings.every(s => s.dnf_tick === null));
  assert.deepEqual(decodeRaceFrameV1('RaceSettlementResultV1', encodeRaceFrameV1('RaceSettlementResultV1', economic)), decodeRaceValueV1('RaceSettlementResultV1', encodeRaceValueV1('RaceSettlementResultV1', economic)));
  assert.deepEqual(settlementResult(physical, 24, { batches: [], dnf_events: [{ tick: 18, slots: [0, 1] }] }).winners, []);
  assert.throws(() => settlementResult(physical, 12, { batches: [], dnf_events: [{ tick: 12, slots: [0] }] }), /Physical result/);
});
test('prepared checkpoint cuts exclude boundary removals and retain the complete partial batch', () => {
  const context = { networkId: gameHashLiteralV1(new Uint8Array(32).fill(3)), raceId: gameHashLiteralV1(new Uint8Array(32).fill(5)), activeScope: { manifest: `game384:${'01'.repeat(48)}`, admission: `game384:${'02'.repeat(48)}` } };
  const input = raceInputPayloadV1([1, 1, 1, 1, 1, 1]);
  const full = { batches: [{ start_tick: 0, inputs: [input, input] }, { start_tick: 6, inputs: [[], input] }], dnf_events: [{ tick: 6, slots: [0] }] };
  const prepared = prepareRaceTranscript(context, full, 7, 2);
  const atBoundary = prepareRaceTranscript(context, { batches: full.batches.slice(0, 1), dnf_events: full.dnf_events }, 6, 2);
  assert.equal(prepared.checkpointRoot(6), atBoundary.checkpointRoot(6));
  assert.notEqual(atBoundary.checkpointRoot(6), atBoundary.acceptedRoot());
  assert.equal(prepared.checkpointRoot(7), prepared.acceptedRoot());
  const changed = structuredClone(full); changed.batches[1]!.inputs[1]![10] = 2;
  assert.notEqual(prepareRaceTranscript(context, changed, 7, 2).checkpointRoot(7), prepared.checkpointRoot(7));
  assert.throws(() => prepared.checkpointRoot(1), /prepared cut set/);
  const impossibleSuffix = structuredClone(full); impossibleSuffix.batches[1]!.inputs[1]![11] = 1;
  assert.throws(() => prepareRaceTranscript(context, impossibleSuffix, 7, 2), /six control words/);
  const emptyActive = structuredClone(full); emptyActive.batches[1]!.inputs[1] = [];
  assert.throws(() => prepareRaceTranscript(context, emptyActive, 7, 2), /twelve bytes/);
  const nonemptyInactive = structuredClone(full); nonemptyInactive.batches[1]!.inputs[0] = input;
  assert.throws(() => prepareRaceTranscript(context, nonemptyInactive, 7, 2), /Removed slot/);
  assert.throws(() => prepareRaceTranscript(context, full, 7, 3), /original slot/);
});
test('adapter state codec rejects bare payloads, wrong schema, CRC, flags and trailing bytes', () => {
  const state = nativeState(createRace(0, 2)), frame = encodeRaceFrameV1('RaceStateV1', state);
  assert.deepEqual(decodeRaceFrameV1('RaceStateV1', frame), decodeRaceValueV1('RaceStateV1', encodeRaceValueV1('RaceStateV1', state)));
  assert.throws(() => decodeRaceFrameV1('RaceStateV1', encodeRaceValueV1('RaceStateV1', state)));
  for (const offset of [0, 6, 22, 23, 31, 39, 40]) { const bad = frame.slice(); bad[offset] = bad[offset]! ^ 1; assert.throws(() => decodeRaceFrameV1('RaceStateV1', bad)); }
  assert.throws(() => decodeRaceFrameV1('RaceStateV1', Uint8Array.from([...frame, 0])));
  assert.throws(() => decodeRaceFrameV1('RaceSettlementResultV1', frame));
});

const commitment = (value: number) => `game384:${value.toString(16).padStart(2, '0').toUpperCase().repeat(48)}`;
const sourceBase = { network_id: gameHashLiteralV1(new Uint8Array(32).fill(3)), session_id: gameHashLiteralV1(new Uint8Array(32).fill(5)), epoch: '0', checkpoint_history: [], certified_batches: [], manifest_commitment: commitment(7), admission_commitment: commitment(9), phase: { kind: 'forced_commit', value: null }, pending_certificate: null, input_commitments: [null, null], input_reveals: [null, null] };
const payload = raceInputPayloadV1([1, 1, 1, 1, 1, 1]);
test('public history export retains post-finish forced rows and late removals without inventing missing intervals', () => {
  const replay = { track: { kind: 'neon_tokyo', value: null }, player_count: 2, frames: Array.from({ length: 6 }, (_, tick) => ({ tick, controls: [1, 1] })), dnf_events: [] } as RaceReplayV1;
  const participants = [0, 1].map(() => ({ dnf_at_tick: 12 }));
  const source = { ...sourceBase, participants, next_tick: 18, forced_batches: [{ start_tick: 6, inputs: [payload, payload], dnf_slots: [] }, { start_tick: 12, inputs: [[], []], dnf_slots: [0, 1] }] };
  const record = { next_tick: 18, participants, checkpoint_history: [], certified_batches: [], source_record: source } as unknown as RaceRecord;
  const collected = collectAcceptedHistory(record, replay, { commitments: [], reveals: [] });
  assert.deepEqual(collected.transcript.batches.map(b => b.start_tick), [0, 6, 12]);
  assert.deepEqual(collected.transcript.dnf_events, [{ tick: 12, slots: [0, 1] }]);
  assert.deepEqual(replay.dnf_events, []); assert.equal(replay.frames.length, 6);
  const missing = structuredClone(record); missing.source_record.forced_batches.shift();
  assert.throws(() => collectAcceptedHistory(missing, replay, { commitments: [], reveals: [] }), /interval is unavailable/);
});
test('public history export requires exact signed current commitments and nonce-bearing reveals', () => {
  const key = new Uint8Array(32).fill(17), input_key = `ed0120${Buffer.from(ed25519.getPublicKey(key)).toString('hex').toUpperCase().toUpperCase()}`;
  const participants = [0, 1].map(() => ({ dnf_at_tick: null, input_key }));
  const replay = { track: { kind: 'neon_tokyo', value: null }, player_count: 2, frames: Array.from({ length: 6 }, (_, tick) => ({ tick, controls: [1, 1] })), dnf_events: [] } as RaceReplayV1;
  const reveal = { session_id: sourceBase.session_id, scope: { manifest: sourceBase.manifest_commitment, admission: sourceBase.admission_commitment }, epoch: '0', slot: 0, start_tick: 6, payload, nonce: `nonce32:${'02'.repeat(32)}` };
  const body = { session_id: reveal.session_id, scope: reveal.scope, epoch: '0', slot: 0, start_tick: 6, commitment: inputDigest(sourceBase.network_id, reveal) };
  const signed = { ...body, signature: Buffer.from(ed25519.sign(inputSigningFrame(sourceBase.network_id, body), key)).toString('hex').toUpperCase() };
  const source = { ...sourceBase, participants, next_tick: 6, forced_batches: [], input_commitments: [body.commitment, null], input_reveals: [payload, null] };
  const record = { next_tick: 6, participants, checkpoint_history: [], certified_batches: [], source_record: source } as unknown as RaceRecord;
  assert.throws(() => collectAcceptedHistory(record, replay, { commitments: [], reveals: [reveal] }), /Missing public signed commitment/);
  assert.throws(() => collectAcceptedHistory(record, replay, { commitments: [signed], reveals: [] }), /nonce-bearing reveal/);
  assert.throws(() => collectAcceptedHistory(record, replay, { commitments: [signed], reveals: [{ ...reveal, nonce: `nonce32:${'04'.repeat(32)}` }] }), /nonce-bearing reveal/);
  const evidence = collectAcceptedHistory(record, replay, { commitments: [signed], reveals: [reveal] });
  assert.equal(evidence.current_commitments.length, 1); assert.equal(evidence.current_reveals[0]!.nonce, reveal.nonce);
  const broken = { ...signed, signature: '00'.repeat(64) };
  assert.throws(() => collectAcceptedHistory(record, replay, { commitments: [broken], reveals: [reveal] }), /signature/);
});
