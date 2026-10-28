import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import { AccountAddress } from '@iroha/iroha-js/address';
import { gameHashLiteralV1, type GameSessionRecordV1, type GameInputRevealV1, type GameInputCommitmentV1, type ExecutionProofEnvelopeV1 } from '@iroha/iroha-js/game';
import { formatGameCommitmentLiteralV1 } from '@iroha/iroha-js/game-certificates';
import { encodeRaceFrameV1, raceGameTranscriptV1, type RaceReplayV1, type RaceProofPayloadV1 } from '@iroha/iroha-js/race';
import { RACE_PROFILE_ID } from '../src/game/environment';
import { prepareRaceTranscript, activeScope, admissionCommitment, inputDigest, inputSigningFrame, manifestCommitment, outcomeCommitment } from '../src/chain/certificates';
import { encodePublicReplayJson, PUBLIC_REPLAY_JSON_LIMIT } from '../src/chain/proof-limits';
import { buildRaceProverRequest, nativeRaceResult, parseRaceProofBundle } from '../src/chain/proof';
import { collectAcceptedHistory, settlementResult, validateDrivingProjection } from '../src/chain/history';
import { checkpointOpenings, mergeRaceReveals, mergeRaceCommitments, recoveryInputs, nativeState, nativeTrack, parseRaceRecord, publishCheckpoint, raceAdmission, raceContext, raceManifest, raceOutcome, stateRoot } from '../src/chain/races';
import { replayConsensusFrontier, simulateNativeReplay } from '../src/network/controller';

// Synthetic application consistency controls: unsigned certificates and invented
// custody identities. These are not native fixtures, valid STARKs or ledger evidence.
const hash = (n: number) => gameHashLiteralV1(new Uint8Array(32).fill(n | 1));
const commitment = (n: number) => formatGameCommitmentLiteralV1(new Uint8Array(48).fill(n));
const account = (n: number) => AccountAddress.fromAccount({ publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(n)) }).toI105();
function example() {
  const manifest = raceManifest({ trackId: 0, maxRacers: 2, applicationId: hash(3), profileId: RACE_PROFILE_ID });
  const source: GameSessionRecordV1 = {
    version: 1, network_id: hash(1), session_id: hash(5), manifest, profile_id: RACE_PROFILE_ID,
    manifest_commitment: manifestCommitment(hash(1), hash(5), manifest), admission_commitment: null,
    asset_definition: '7hRQeXR7CypB6XD9Avoog24ND7ZU', stake: '1', payout_scale: 0,
    custody: account(3), liability: '2', payout_claims: [], item_stakes: [], resources: [],
    participants: [1, 2].map((n, slot) => ({ account: account(n), input_key: 'ed0120' + Buffer.from(ed25519.getPublicKey(new Uint8Array(32).fill(n))).toString('hex').toUpperCase(), application_data: [slot], dnf_at_tick: slot === 1 ? 18 : null })),
    phase: { kind: 'awaiting_proof', value: null }, revision: '1', epoch: '1', deadline_height: '100', checkpoint: null,
    pending_certificate: null, next_tick: 24, input_commitments: [null, null], input_reveals: [null, null],
    checkpoint_history: [], certified_batches: [], forced_batches: [], dispute_commitment: commitment(7), verification_id: null, terminal_at_height: null, result: null,
  };
  const admission = { version: 1 as const, participants: source.participants.map(({ account, input_key, application_data }) => ({ account, input_key, application_data })), wagers: [], resources: [] };
  source.admission_commitment = admissionCommitment(source.network_id, source.session_id, admission);
  const context = { networkId: source.network_id, raceId: source.session_id, activeScope: activeScope(source) };
  const replay: RaceReplayV1 = { track: nativeTrack(0), player_count: 2, frames: Array.from({ length: 18 }, (_, tick) => ({ tick, controls: [1, 1] })), dnf_events: [{ tick: 18, slots: [1] }] };
  const transcript = raceGameTranscriptV1(replay);
  transcript.batches.push({ start_tick: 18, inputs: [Array.from({ length: 12 }, (_, i) => i % 2 ? 0 : 1), []] });
  const prepared = prepareRaceTranscript(context, transcript, source.next_tick, source.participants.length);
  const anchors = [6, 12, 18].map(tick => ({ epoch: '0', tick, transcript_root: prepared.checkpointRoot(tick), state_root: stateRoot(context, simulateNativeReplay({ ...replay, frames: replay.frames.slice(0, tick), dnf_events: [] })) }));
  source.checkpoint_history = anchors.slice(0, 2);
  source.checkpoint = { checkpoint: { session_id: source.session_id, scope: activeScope(source), ...anchors[2]!, terminal: false }, signatures: [] };
  source.certified_batches = transcript.batches.slice(0, 3).map(row => ({ ...structuredClone(row), epoch: '0', parent_transcript_root: prepared.checkpointRoot(row.start_tick), frontier_id: commitment(row.start_tick + 11) }));
  source.forced_batches = [{ epoch: '0', ...structuredClone(transcript.batches[3]!), dnf_slots: [1], certified_frontier_id: commitment(31) }];
  const evidence = { transcript, current_commitments: [], current_reveals: [] };
  return { source, replay, evidence, record: parseRaceRecord(source) };
}

test('proof requests retain all ordered state anchors before same-tick removal', () => {
  const { source, replay, evidence } = example();
  const request = buildRaceProverRequest(source, replay, 100, evidence);
  assert.deepEqual(request.checkpoint_states.map(state => state.tick), [6, 12, 18]);
  assert.ok(request.checkpoint_states.every(state => state.cars.every(car => car.dnf_tick === null)));
  assert.equal(nativeState(simulateNativeReplay(replay)).cars[1]!.dnf_tick, 18);
  for (const mutate of [
    (value: GameSessionRecordV1) => { value.checkpoint_history[0]!.state_root = commitment(99); },
    (value: GameSessionRecordV1) => { value.checkpoint_history.reverse(); },
    (value: GameSessionRecordV1) => { value.checkpoint_history[1] = structuredClone(value.checkpoint_history[0]!); },
    (value: GameSessionRecordV1) => { value.checkpoint!.checkpoint.state_root = stateRoot(raceContext(parseRaceRecord(value)), simulateNativeReplay(replay)); },
  ]) {
    const value = structuredClone(source); mutate(value);
    assert.throws(() => buildRaceProverRequest(value, replay, 100, evidence), /retained checkpoint|ordered, unique/);
  }
  const obsolete = { ...source, transcript_anchors: [] };
  assert.throws(() => parseRaceRecord(obsolete), /field|unknown|key/i);
});

test('accepted history checks certified bytes and preserves forced certificate association', () => {
  const { source, record, replay, evidence } = example();
  assert.deepEqual(collectAcceptedHistory(record, replay, { commitments: [], reveals: [] }), evidence);
  assert.equal(record.forced_batches[0]!.certified_frontier_id, source.forced_batches[0]!.certified_frontier_id);
  const forged = structuredClone(record); forged.source_record.certified_batches[0]!.inputs[0]![0] ^= 2;
  assert.throws(() => validateDrivingProjection(forged, replay, evidence), /retained consensus batch/);
  const repeated = structuredClone(record); repeated.source_record.certified_batches.push(structuredClone(repeated.source_record.certified_batches[0]!));
  assert.throws(() => validateDrivingProjection(repeated, replay, evidence), /repeats/);
  const prefix = { ...replay, dnf_events: [] };
  assert.deepEqual(replayConsensusFrontier(source.network_id, record, prefix), replay);
  const changed = structuredClone(record); changed.checkpoint!.checkpoint.state_root = commitment(97);
  assert.throws(() => replayConsensusFrontier(source.network_id, changed, prefix), /checkpoint state/);
});

test('proof import rejects omitted, reordered and forged interior checkpoint vectors locally', () => {
  const { record, source, replay, evidence } = example();
  const request = buildRaceProverRequest(source, replay, 100, evidence);
  const result = nativeRaceResult(simulateNativeReplay(replay)), outcome = raceOutcome(settlementResult(result, source.next_tick, evidence.transcript));
  const root = prepareRaceTranscript(raceContext(record), evidence.transcript, source.next_tick, source.participants.length).acceptedRoot();
  const payload: RaceProofPayloadV1 = { history_evidence: evidence, accepted_through_tick: source.next_tick, manifest: record.manifest, admission: raceAdmission(record), outcome,
    relation_inputs: { network_id: source.network_id, race_id: source.session_id, admission_commitment: source.admission_commitment!, rules_hash: hash(9), track: replay.track, transcript_root: root, dispute_commitment: source.dispute_commitment, result },
    replay, final_state: nativeState(simulateNativeReplay(replay)), checkpoint_states: request.checkpoint_states, stark_bytes: [0] };
  const envelope = (value: RaceProofPayloadV1): ExecutionProofEnvelopeV1 => ({ version: 1, profile_id: source.profile_id,
    statement: { network_id: source.network_id, session_id: source.session_id, source_record_binding: { bytes: '0100000000000000'.repeat(6) }, manifest_commitment: source.manifest_commitment, admission_commitment: source.admission_commitment!, dispute_commitment: source.dispute_commitment, transcript_root: root, outcome_commitment: outcomeCommitment(raceContext(record), outcome) }, proof_bytes: Array.from(encodeRaceFrameV1('RaceProofPayloadV1', value)) });
  // This parser only checks public consistency. The dummy STARK never goes to a verifier.
  assert.doesNotThrow(() => parseRaceProofBundle(envelope(payload), record));
  for (const mutate of [
    (value: RaceProofPayloadV1) => { value.checkpoint_states.splice(0, 1); },
    (value: RaceProofPayloadV1) => { value.checkpoint_states.reverse(); },
    (value: RaceProofPayloadV1) => { value.checkpoint_states[0]!.cars[0]!.lateral_mm += 1; },
  ]) {
    const value = structuredClone(payload); mutate(value);
    assert.throws(() => parseRaceProofBundle(envelope(value), record), /Proof public inputs differ/);
  }
});

test('checkpoint publication requires matching nonce-bearing openings for the old ledger frontier', () => {
  const { source, replay } = example();
  source.participants.forEach(p => { p.dnf_at_tick = null; });
  source.epoch = '0'; source.next_tick = 6; source.phase = { kind: 'playing', value: null };
  source.checkpoint_history = []; source.certified_batches = []; source.forced_batches = [];
  source.checkpoint!.checkpoint = { ...source.checkpoint!.checkpoint, tick: 6 };
  const reveals: GameInputRevealV1[] = [0, 1].map(slot => ({ session_id: source.session_id, scope: activeScope(source), epoch: '0', start_tick: 6, slot, payload: Array.from({ length: 12 }, (_, i) => i % 2 ? 0 : 1), nonce: 'nonce32:' + String(slot + 1).repeat(64) }));
  source.pending_certificate = { session_id: source.session_id, scope: activeScope(source), epoch: '0', start_tick: 6, parent_transcript_root: source.checkpoint!.checkpoint.transcript_root, commitments: reveals.map(value => inputDigest(source.network_id, value)), signatures: [] };
  const record = parseRaceRecord(source), cp = structuredClone(source.checkpoint!); cp.checkpoint.tick = 12;
  cp.checkpoint.state_root = stateRoot(raceContext(record), simulateNativeReplay({ ...replay, frames: replay.frames.slice(0, 12), dnf_events: [] }));
  const openings = checkpointOpenings(record, cp, null, reveals);
  assert.deepEqual(openings, reveals.map(({ payload, nonce }) => ({ payload, nonce })));
  assert.deepEqual((publishCheckpoint(cp, null, openings) as { CommitGameCheckpointV1: { old_frontier_openings: unknown } }).CommitGameCheckpointV1.old_frontier_openings, openings);
  assert.throws(() => checkpointOpenings(record, cp, null, reveals.slice(1)), /Missing matching public opening/);
  const forged = structuredClone(reveals); forged[0]!.nonce = 'nonce32:' + 'FF'.repeat(32);
  assert.throws(() => checkpointOpenings(record, cp, null, forged), /Missing matching public opening/);
  assert.equal(checkpointOpenings(record, source.checkpoint!, source.pending_certificate, []), null);
  assert.throws(() => checkpointOpenings(record, source.checkpoint!, null, reveals), /cannot be replaced/);
  for (const changed of [{ ...cp.checkpoint, epoch: '1' }, { ...cp.checkpoint, tick: 0 }, { ...cp.checkpoint, session_id: hash(99) }]) {
    assert.throws(() => checkpointOpenings(record, { ...cp, checkpoint: changed }, null, reveals), /current session frontier/);
  }
  const inactive = structuredClone(record); inactive.source_record.participants[1]!.dnf_at_tick = 6;
  assert.deepEqual(checkpointOpenings(inactive, cp, null, reveals.slice(0, 1)), [openings![0], null], 'inactive original slot keeps its place');
  assert.deepEqual(mergeRaceReveals(reveals, reveals), reveals, 'reconnect/export deduplicates exact already-public openings');
  assert.throws(() => mergeRaceReveals(Array(7201).fill(reveals[0])), /Oversized/);
  assert.throws(() => mergeRaceReveals(reveals, forged), /Conflicting/);
  assert.throws(() => mergeRaceReveals([{ ...reveals[0]!, payload: Array(4096).fill(1) }]), /twelve bytes/);
  const maximum = Array.from({ length: 7200 }, (_, index) => ({ ...reveals[index % 2]!, slot: index % 8, start_tick: Math.floor(index / 8) * 6 }));
  const archived = mergeRaceReveals(maximum);
  assert.equal(archived.length, 7200);
  assert.deepEqual(mergeRaceReveals(archived, archived, archived), archived, 'three full archives deduplicate before the total bound');
  assert.deepEqual(checkpointOpenings(record, cp, null, archived, archived, archived), openings, 'checkpoint openings accept duplicate complete archives');
  const encoded = encodePublicReplayJson({ recovery: { commitments: [], reveals: archived } });
  assert.ok(new TextEncoder().encode(encoded).length < PUBLIC_REPLAY_JSON_LIMIT);
  assert.equal(JSON.parse(encoded).recovery.reveals.length, 7200);
  assert.throws(() => encodePublicReplayJson('x'.repeat(PUBLIC_REPLAY_JSON_LIMIT)), /16 MiB/);
});


test('public recovery commitments deduplicate eight slots, reject conflicts and filter stale rounds', () => {
  const { record } = example();
  const values: GameInputCommitmentV1[] = Array.from({ length: 8 }, (_, slot) => ({ session_id: record.race_id, scope: activeScope(record.source_record), epoch: record.epoch, start_tick: record.next_tick, slot, commitment: commitment(slot + 41), signature: 'AA'.repeat(64) }));
  const archive = mergeRaceCommitments(values, values.map(value => ({ ...value, epoch: Number(value.epoch) })));
  assert.equal(archive.length, 8, 'duplicate eight-slot export remains eight-slot import');
  const exported = encodePublicReplayJson({ version: 1, kind: 'sora-cars-public-replay', recovery: { commitments: archive, reveals: [] } });
  const imported = JSON.parse(exported).recovery.commitments as GameInputCommitmentV1[];
  assert.ok(imported.every(value => typeof value.epoch === 'string'), 'export normalizes native u64 counters');
  assert.deepEqual(mergeRaceCommitments(archive, imported), archive, 'actual export/import representation does not duplicate or replace eight retained slots');
  assert.throws(() => mergeRaceCommitments(archive, [{ ...archive[0]!, commitment: commitment(99) }]), /Conflicting/);
  assert.throws(() => mergeRaceCommitments(Array(7201).fill(archive[0])), /Oversized/);
  const maximum = Array.from({ length: 7200 }, (_, index) => ({ ...values[index % 8]!, start_tick: Math.floor(index / 8) * 6 }));
  const retained = mergeRaceCommitments(maximum, maximum);
  assert.equal(retained.length, 7200);
  const maximumReveals = mergeRaceReveals(retained.map(input => ({ session_id: input.session_id, scope: input.scope, epoch: input.epoch, start_tick: input.start_tick, slot: input.slot, payload: Array.from({ length: 12 }, (_, i) => i % 2 ? 0 : 63), nonce: 'nonce32:' + 'FF'.repeat(32) })));
  // Maximum-shaped JSON framing only. Repeated synthetic roots/identities here
  // are not an accepted history, native fixture, or valid ledger certificate.
  const frames = Array.from({ length: 5400 }, (_, tick) => ({ tick, controls: Array(8).fill(63) }));
  const batches = Array.from({ length: 900 }, (_, i) => ({ start_tick: i * 6, inputs: Array.from({ length: 8 }, () => Array.from({ length: 12 }, (_, byte) => byte % 2 ? 0 : 63)) }));
  const checkpoint_history = Array.from({ length: 899 }, (_, i) => ({ ...record.checkpoint_history[0]!, tick: (i + 1) * 6 }));
  const certified_batches = batches.map(batch => ({ ...batch, epoch: '18446744073709551615', parent_transcript_root: commitment(7), frontier_id: commitment(9) }));
  const source = { ...record.source_record, next_tick: 5400, checkpoint_history, certified_batches, forced_batches: [], participants: Array.from({ length: 8 }, (_, i) => record.source_record.participants[i % 2]) };
  const maximumBundle = { version: 1, kind: 'sora-cars-public-replay', authentication: 'endpoint-reported-unverified', record: { ...record, source_record: source, checkpoint_history, certified_batches }, replay: { track: nativeTrack(0), player_count: 8, frames, dnf_events: [] }, recovery: { commitments: retained, reveals: maximumReveals }, history_evidence: { transcript: { batches, dnf_events: [] }, current_commitments: retained.slice(-8), current_reveals: maximumReveals.slice(-8) } };
  const maximumJson = encodePublicReplayJson(maximumBundle);
  assert.ok(new TextEncoder().encode(maximumJson).length < PUBLIC_REPLAY_JSON_LIMIT, 'both 7,200-entry archives plus full Stock replay/source framing fit the shared bound');
  const maximumImport = JSON.parse(maximumJson).recovery;
  assert.equal(mergeRaceCommitments(maximumImport.commitments).length, 7200);
  assert.equal(mergeRaceReveals(maximumImport.reveals).length, 7200);
  const current = structuredClone(record); current.phase.kind = 'forced_commit';
  const body = { session_id: record.race_id, scope: activeScope(record.source_record), epoch: record.epoch, start_tick: record.next_tick, slot: 0, commitment: commitment(61) };
  const signed = { ...body, signature: Buffer.from(ed25519.sign(inputSigningFrame(record.network_id, body), new Uint8Array(32).fill(1))).toString('hex').toUpperCase() };
  const stale = { ...signed, epoch: '0', start_tick: 6 };
  const publicInputs = mergeRaceCommitments([stale], [signed]);
  assert.equal(publicInputs.length, 2, 'stale public evidence is retained rather than overwritten');
  assert.deepEqual(recoveryInputs(current, publicInputs, []).commitments, [signed], 'only the exact current ledger round is relayed');
});
