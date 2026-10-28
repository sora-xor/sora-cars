import { manifestCommitment, activeScope } from '../src/chain/certificates';
import { settlementResult } from '../src/chain/history';
import { formatGameCommitmentLiteralV1 } from '@iroha/iroha-js/game-certificates';
import { raceGameTranscriptV1 } from '@iroha/iroha-js/race';
import type { GameReplayEvidenceV1 } from '@iroha/iroha-js/game-replay';
import { admissionCommitment } from '../src/chain/certificates.ts';
import { currentGameFixtures } from '../scripts/lib/current-game-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AccountAddress } from '@iroha/iroha-js/address';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { gameHashLiteralV1, validateGameSessionRecordV1 } from '@iroha/iroha-js/game';
import type { RaceReplayV1, RaceResultV1 } from '@iroha/iroha-js/race';
import { ed25519 } from '@noble/curves/ed25519';
import { RACE_PROFILE_ID } from '../src/game/environment';
import { botControl, createRace, raceFinished, stepRace } from '../src/game/engine';
import { nativeTrack, raceAdmission, parseRaceRecord, raceManifest, raceOutcome, raceContext, stateRoot, checkpointTranscriptRoot } from '../src/chain/races';
import type { ForcedBatch, RaceRecord } from '../src/chain/races';
import { buildRaceProverRequest, nativeRaceResult } from '../src/chain/proof';
import { replayConsensusFrontier, simulateNativeReplay } from '../src/network/controller';

const nativeCodecFixture = currentGameFixtures();
const networkId = NetworkId.fromBytes(new Uint8Array(32).fill(3)).toString();
const hash = (n: number) => gameHashLiteralV1(new Uint8Array(32).fill(n | 1));

function naturalFinish(): RaceReplayV1 {
  const state = createRace(0, 2);
  const replay: RaceReplayV1 = { track: nativeTrack(0), player_count: 2, frames: [], dnf_events: [] };
  while (!raceFinished(state)) {
    const controls = state.cars.map((_, slot) => botControl(state, slot));
    replay.frames.push({ tick: state.tick, controls });
    stepRace(state, controls);
  }
  assert.ok(state.tick < 5394 && state.cars.every(car => car.finishTick !== null), 'fixture reaches an actual natural finish before the time cap');
  return replay;
}

function batch(replay: RaceReplayV1, start: number, dnf: number[] = []): ForcedBatch {
  return { epoch: '0', start_tick: start, dnf_slots: dnf, certified_frontier_id: null, controls: Array.from({ length: replay.player_count }, (_, slot) => Array.from({ length: 6 }, (_, offset) => replay.frames[start + offset]?.controls[slot] ?? 0)) };
}

const commitment = (n: number) => formatGameCommitmentLiteralV1(new Uint8Array(48).fill(n));
function context(prefix: RaceReplayV1, batches: ForcedBatch[]): RaceRecord {
  const manifest = raceManifest({ trackId: 0, maxRacers: prefix.player_count, applicationId: hash(5), profileId: RACE_PROFILE_ID });
  const record: Omit<RaceRecord, 'source_record'> = {
    version: 1, network_id: networkId, race_id: hash(1), manifest, profile_id: RACE_PROFILE_ID,
    rules: { version: 1, track: prefix.track, max_racers: prefix.player_count },
    manifest_commitment: manifestCommitment(networkId, hash(1), manifest),
    admission_commitment: null, dispute_commitment: commitment(9), stake: '1', payout_scale: 9,
    asset_definition: nativeCodecFixture.vectors.find((row: { name: string }) => row.name === 'OpenGameSessionV1')!.value.asset_definition, payout_claims: [], item_stakes: [], resources: [],
    verification_id: null, terminal_at_height: null, phase: { kind: 'awaiting_proof' },
    revision: '1', deadline_height: '100', result: null,
    participants: Array.from({ length: prefix.player_count }, (_, slot) => {
      const key = ed25519.getPublicKey(new Uint8Array(32).fill(slot + 1));
      return { account: AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey: key }).toI105(), input_key: `ed0120${Buffer.from(key).toString('hex').toUpperCase()}`, car_id: slot, dnf_at_tick: batches.find(b => b.dnf_slots.includes(slot))?.start_tick ?? null };
    }),
    epoch: String(batches.length), next_tick: batches.at(-1)?.start_tick === undefined ? prefix.frames.length : batches.at(-1)!.start_tick + 6,
    checkpoint: null,
    pending_certificate: null, checkpoint_history: [], certified_batches: [], forced_batches: batches.map((b, i) => ({ ...b, epoch: String(i) })),
    input_commitments: Array(prefix.player_count).fill(null), input_reveals: Array(prefix.player_count).fill(null),
  };
  record.admission_commitment = admissionCommitment(networkId, record.race_id, raceAdmission(record));
  const scope = activeScope(record), publicContext = { networkId, raceId: record.race_id, activeScope: scope };
  record.checkpoint = { checkpoint: { session_id: record.race_id, scope, epoch: 0, tick: prefix.frames.length, transcript_root: checkpointTranscriptRoot(publicContext, prefix), state_root: stateRoot(publicContext, simulateNativeReplay(prefix)), terminal: raceFinished(simulateNativeReplay(prefix)) }, signatures: [] };
  // Scope: recovery from an already-authenticated view. These tests do not
  // substitute this unsigned fixture for native certificate/history validation.
  // Complete synthetic transport fixture; custody is a test identity and the
  // unsigned checkpoint is not evidence of finalized native state.
  const source_record = validateGameSessionRecordV1({
    version: 1, network_id: record.network_id, session_id: record.race_id,
    manifest: record.manifest, profile_id: record.profile_id, manifest_commitment: record.manifest_commitment,
    asset_definition: record.asset_definition, stake: record.stake, payout_scale: record.payout_scale,
    custody: nativeCodecFixture.vectors.find((row: { name: string }) => row.name === 'GameItemStakeV1')!.value.custody,
    liability: String(record.participants.length), payout_claims: [], item_stakes: [], resources: [],
    participants: record.participants.map(p => ({ account: p.account, input_key: p.input_key, application_data: [p.car_id], dnf_at_tick: p.dnf_at_tick })),
    admission_commitment: record.admission_commitment, phase: { kind: 'awaiting_proof', value: null },
    revision: record.revision, epoch: record.epoch, deadline_height: record.deadline_height,
    checkpoint: record.checkpoint ? { checkpoint: { session_id: record.race_id, scope, epoch: record.checkpoint.checkpoint.epoch, tick: record.checkpoint.checkpoint.tick, transcript_root: record.checkpoint.checkpoint.transcript_root, state_root: record.checkpoint.checkpoint.state_root, terminal: record.checkpoint.checkpoint.terminal }, signatures: [] } : null,
    pending_certificate: null, next_tick: record.next_tick,
    input_commitments: record.input_commitments, input_reveals: record.input_reveals,
    checkpoint_history: record.checkpoint_history, certified_batches: record.certified_batches,
    forced_batches: record.forced_batches.map(b => ({ epoch: b.epoch, start_tick: b.start_tick, inputs: b.controls.map((row, slot) => (record.participants[slot]!.dnf_at_tick !== null && record.participants[slot]!.dnf_at_tick! <= b.start_tick) ? [] : row.flatMap(word => [word & 255, word >>> 8])), dnf_slots: b.dnf_slots, certified_frontier_id: b.certified_frontier_id })),
    dispute_commitment: record.dispute_commitment, verification_id: null, terminal_at_height: null, result: null,
  });
  return { ...record, source_record };
}

function evidence(record: RaceRecord, drivingPrefix: RaceReplayV1): GameReplayEvidenceV1 {
  const transcript = raceGameTranscriptV1(drivingPrefix);
  for (const row of record.source_record.forced_batches) {
    if (row.start_tick < drivingPrefix.frames.length) continue;
    transcript.batches.push({ start_tick: row.start_tick, inputs: structuredClone(row.inputs) });
    if (row.dnf_slots.length) transcript.dnf_events.push({ tick: row.start_tick, slots: [...row.dnf_slots] });
  }
  return { transcript, current_commitments: [], current_reveals: [] };
}

const full = naturalFinish();
const terminal = full.frames.length;
const prefix = { ...full, frames: full.frames.slice(0, terminal - 6) };
const naturalResult = nativeRaceResult(simulateNativeReplay(full));
assert.equal(naturalResult.winners.length, 1);
const winner = naturalResult.winners[0]!;

test('a forfeit exactly at natural completion affects the winner without running terminal controls', () => {
  const record = context(prefix, [batch(full, terminal - 6), batch(full, terminal, [winner])]);
  const before = structuredClone(record);
  const replay = replayConsensusFrontier(networkId, record, prefix);
  assert.equal(replay.frames.length, terminal);
  assert.deepEqual(replay.frames, full.frames, 'every accepted pre-terminal driving input is retained');
  assert.deepEqual(replay.dnf_events, [{ tick: terminal, slots: [winner] }]);
  const result = nativeRaceResult(simulateNativeReplay(replay));
  assert.deepEqual(result.winners, [1 - winner]);
  assert.equal(result.standings.find(car => car.slot === winner)!.dnf_tick, terminal);
  const request = buildRaceProverRequest(record.source_record, replay, 100, evidence(record, prefix));
  assert.deepEqual(request.replay, replay);
  assert.equal(request.checkpoint_states.at(-1)!.tick, terminal - 6);
  assert.ok(request.checkpoint_states.at(-1)!.cars.every(car => car.dnf_tick === null));
  assert.equal(request.source_record.session_id, record.race_id);
  assert.deepEqual(request.source_record.forced_batches, record.source_record.forced_batches);
  assert.deepEqual(record, before, 'recovery never rewrites raw ledger history');
});

test('timeouts after completion preserve physical results but refund when every racer forfeits', () => {
  const record = context(prefix, [batch(full, terminal - 6), batch(full, terminal), batch(full, terminal + 6, [0, 1])]);
  const replay = replayConsensusFrontier(networkId, record, prefix);
  assert.equal(record.next_tick, terminal + 12);
  assert.ok(record.participants.every(p => p.dnf_at_tick === terminal + 6));
  assert.deepEqual(replay, full, 'later history adds no phantom driving or physical-state removals');
  const result = nativeRaceResult(simulateNativeReplay(replay));
  assert.deepEqual(result, naturalResult);
  assert.deepEqual(raceOutcome(settlementResult(result, record.next_tick, evidence(record, prefix).transcript)).winner_slots, []);
  assert.deepEqual(buildRaceProverRequest(record.source_record, replay, 100, evidence(record, prefix)).replay, full);
});

test('all forfeits at the exact finish boundary retain the explicit refund outcome', () => {
  const record = context(prefix, [batch(full, terminal - 6), batch(full, terminal, [0, 1])]);
  const replay = replayConsensusFrontier(networkId, record, prefix);
  assert.equal(replay.frames.length, terminal);
  assert.deepEqual(nativeRaceResult(simulateNativeReplay(replay)).winners, []);
  assert.deepEqual(replay.dnf_events, [{ tick: terminal, slots: [0, 1] }]);
});

test('boundary recovery preserves the actual native terminal-DNF parity fixture', () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/native-race-v1.json', import.meta.url), 'utf8')).fixtures[0] as { inputs: number[][]; dnfEvents: { tick: number; slots: number[] }[]; result: RaceResultV1 };
  const prefix: RaceReplayV1 = { track: nativeTrack(0), player_count: 2, frames: source.inputs.map((controls, tick) => ({ tick, controls })), dnf_events: [] };
  const record = context(prefix, [batch(prefix, prefix.frames.length, source.dnfEvents[0]!.slots)]);
  const replay = replayConsensusFrontier(networkId, record, prefix);
  assert.deepEqual(replay.dnf_events, source.dnfEvents);
  assert.deepEqual(nativeRaceResult(simulateNativeReplay(replay)), source.result);
  assert.equal(buildRaceProverRequest(record.source_record, replay, 100, evidence(record, prefix)).checkpoint_states.at(-1)!.cars[1]!.dnf_tick, null, 'checkpoint precedes the same-tick consensus removal');
});

test('unresolved controls before completion cannot be replaced by an early terminal replay', () => {
  const original = context(prefix, []);
  const source = structuredClone(original.source_record);
  source.phase = { kind: 'forced_reveal', value: null };
  source.pending_certificate = { session_id: source.session_id, scope: activeScope(source), epoch: 0, start_tick: prefix.frames.length, parent_transcript_root: checkpointTranscriptRoot(raceContext(original), prefix), commitments: [commitment(11), commitment(13)], signatures: [] };
  const record = parseRaceRecord(source);
  assert.equal(record.source_record.phase.kind, 'forced_reveal');
  assert.deepEqual(record.source_record.pending_certificate?.commitments, [commitment(11), commitment(13)]);
  const before = structuredClone(record.pending_certificate);
  const replay = replayConsensusFrontier(networkId, record, prefix);
  assert.deepEqual(replay, prefix);
  assert.throws(() => buildRaceProverRequest(record.source_record, replay, 100, evidence(record, prefix)), /terminal deterministic race/);
  assert.deepEqual(record.pending_certificate, before);
  assert.throws(() => replayConsensusFrontier(networkId, { ...record, forced_batches: [batch(full, terminal)] }, prefix), /Missing forced transcript interval/);
  const changed = structuredClone(prefix);
  changed.frames[0]!.controls[0] ^= 2;
  assert.throws(() => replayConsensusFrontier(networkId, record, changed), /chain-selected checkpoint/);
});
