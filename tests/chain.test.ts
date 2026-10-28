import { admissionCommitment, certificateContext, certificateScope, keyBytes, outcomeCommitment, prepareRaceTranscript } from '../src/chain/certificates.ts';
import { settlementResult } from '../src/chain/history';
import { currentGameFixtures, currentGameProofFixtures } from '../scripts/lib/current-game-fixtures.mjs';
import { RACE_PROFILE_ID } from '../src/game/environment';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519';
import { encodeGameCertificateFrameV1, formatGameCommitmentLiteralV1 } from '@iroha/iroha-js/game-certificates';
import { gameHashLiteralV1, encodeGameValueV1, decodeGameValueV1 } from '@iroha/iroha-js/game';
import type { ExecutionProofEnvelopeV1, GameOutcomeV1, GameSessionRecordV1 } from '@iroha/iroha-js/game';
import { encodeRaceValueV1, decodeRaceFrameV1, raceInputPayloadV1 } from '@iroha/iroha-js/race';
import type { RaceReplayV1, RaceProverRequestV1, RaceProofPayloadV1 } from '@iroha/iroha-js/race';
import { RaceChainClient } from '../src/chain/client';
import { assertSameRaceTerms, joinRace, raceInvitation, parseRaceRecord, nativeTrack, raceContext, raceOutcome, parsePayoutClaims, claimRacePayout } from '../src/chain/races';
import type { RaceRecord } from '../src/chain/races';
import { buildRaceProverRequest, nativeRaceResult, parseRaceProofBundle, raceProofSourceMatches, assertRaceProofSourceUnchanged } from '../src/chain/proof';
import { createRace } from '../src/game/engine';
import { simulateNativeReplay } from '../src/network/controller';
const fixture = currentGameFixtures();
const byName = (name: string) => {
  const row = fixture.vectors.find(v => v.name === name);
  assert.ok(row, `required current native row ${name}`);
  return row.value;
};
const profileId = RACE_PROFILE_ID;
const networkId = fixture.network_id;
const hash = (n: number) => gameHashLiteralV1(new Uint8Array(32).fill(n | 1));
const commitment = (n: number) => formatGameCommitmentLiteralV1(new Uint8Array(48).fill(n));
const capability = (qualified: boolean) => ({ version: 1, enabled: true, native_game_sessions: true, execution_transport_ready: true, network_id: networkId, profiles: [{ version: 1, profile_id: profileId, qualified }] });

test('retained payout views preserve exact quantities and original slot identity', () => {
  const claims = [{ slot: 0, amount: '1.5', remaining: '0.5' }, { slot: 2, amount: '0.0000000000000000000000000001', remaining: '0' }];
  assert.deepEqual(parsePayoutClaims(claims, 3), claims);
  assert.throws(() => parsePayoutClaims([...claims].reverse(), 3), /claim/);
  assert.throws(() => parsePayoutClaims([{ ...claims[0], remaining: '1.5000000000000000000000000001' }], 3), /claim/);
  assert.throws(() => parsePayoutClaims([{ ...claims[0], slot: 3 }], 3), /claim/);
  assert.throws(() => parsePayoutClaims(undefined, 3), /list/);
  const native = byName('ClaimGamePayoutV1');
  assert.deepEqual(claimRacePayout(native.session_id, native.slot, native.destination, native.amount), { ClaimGamePayoutV1: native });
});

test('endpoint readiness matches the exact profile without qualifying the local release', async () => {
  const make = (value: unknown, pinned: string | undefined = profileId) => new RaceChainClient({ toriiUrl: 'https://test.example', networkId, profileId: pinned, fetchImpl: async () => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }) });
  const qualified = make(capability(true)); await qualified.probe(); assert.equal(qualified.canStake, false);
  assert.equal(qualified.state.capability?.proof_qualified, true, 'retain the endpoint report separately');
  assert.match(qualified.state.reason!, /bundled execution proof is not cryptographically qualified/);
  const foreignId = hash(27);
  const foreignQualified = make({ ...capability(true), profiles: [{ profile_id: foreignId, qualified: true }] }, foreignId);
  await foreignQualified.probe(); assert.equal(foreignQualified.canStake, false, 'a configured obsolete profile cannot enable the current simulator');
  assert.equal(foreignQualified.state.capability?.proof_qualified, false);
  const unqualified = make(capability(false)); await unqualified.probe(); assert.equal(unqualified.canStake, false);
  assert.equal(unqualified.state.capability?.proof_qualified, false);
  // Multiple compiled profiles can share RaceV1. A different profile's review
  // status must never enable the one frozen into this frontend's manifest.
  for (const profiles of [
    [{ profile_id: hash(27), qualified: true }, { profile_id: profileId, qualified: false }],
    [{ profile_id: profileId, qualified: false }, { profile_id: hash(27), qualified: true }],
  ]) {
    const mixed = make({ ...capability(true), profiles });
    await mixed.probe(); assert.equal(mixed.canStake, false);
    assert.equal(mixed.state.capability?.proof_qualified, false);
  }
  const selected = make({ ...capability(true), profiles: [{ profile_id: hash(27), qualified: false }, { profile_id: profileId, qualified: true }] });
  await selected.probe(); assert.equal(selected.canStake, false);
  assert.equal(selected.state.capability?.proof_qualified, true);
  for (const execution_transport_ready of [false, undefined, 'true', 1]) {
    const unavailable = make({ ...capability(true), execution_transport_ready });
    await unavailable.probe();
    assert.equal(unavailable.canStake, false);
    assert.equal(unavailable.state.capability?.execution_transport_ready, false);
    assert.match(unavailable.state.reason!, /bundled execution proof is not cryptographically qualified/);
  }
  const wrongProfile = make(capability(true), hash(27)); await wrongProfile.probe(); assert.equal(wrongProfile.canStake, false);
  const wrongNetwork = make({ ...capability(true), network_id: hash(31) }); await wrongNetwork.probe(); assert.equal(wrongNetwork.canStake, false); assert.equal(wrongNetwork.state.phase, 'unavailable');
  const old = make({ version: 1, enabled: true, network_id: networkId, proof_qualified: true }); await old.probe(); assert.equal(old.canStake, false);
});

test('private admission signs the typed session, manifest, wallet, input key and application data', () => {
  const join = byName('JoinGameSessionV1'), wallet = byName('GameAdmissionBodyV1').participants[0].account;
  const inviteKey = new Uint8Array(32).fill(9), publicHex = join.input_key.slice(6).toLowerCase();
  const signature = raceInvitation(networkId, join.session_id, join.expected_manifest_commitment, wallet, publicHex, 0, inviteKey);
  const body = { manifest: join.expected_manifest_commitment, wallet, input_key: keyBytes(join.input_key), application_data: Uint8Array.of(0), resources: [] };
  const verify = (context = certificateContext(networkId, join.session_id), value = body) => ed25519.verify(Buffer.from(signature, 'hex'), encodeGameCertificateFrameV1(context, 106, value), ed25519.getPublicKey(inviteKey), { zip215: false });
  assert.equal(verify(), true);
  assert.equal(verify(undefined, { ...body, application_data: Uint8Array.of(1) }), false);
  assert.equal(verify(undefined, { ...body, manifest: commitment(42) }), false);
  assert.equal(verify(certificateContext(networkId, hash(43))), false);
  const terms = { race_id: join.session_id, manifest_commitment: join.expected_manifest_commitment, asset_definition: join.expected_asset_definition, stake: join.expected_stake };
  const instruction = joinRace(terms, publicHex, 0, signature) as { JoinGameSessionV1: object };
  assert.ok(instruction.JoinGameSessionV1);
  assert.deepEqual(decodeGameValueV1('JoinGameSessionV1', encodeGameValueV1('JoinGameSessionV1', instruction.JoinGameSessionV1)), instruction.JoinGameSessionV1);
  assert.throws(() => joinRace(terms, publicHex, 6), /skin/);
  assert.deepEqual(instruction.JoinGameSessionV1, { ...join, application_data: [0], resources: [], invitation: signature });
});

test('public technical-win replay keeps its unfinished sole survivor', () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/native-race-v1.json', import.meta.url), 'utf8')).fixtures[0];
  const replay: RaceReplayV1 = { track: nativeTrack(0), player_count: 2, frames: source.inputs.map((controls: number[], tick: number) => ({ tick, controls })), dnf_events: source.dnfEvents };
  const result = nativeRaceResult(simulateNativeReplay(replay));
  assert.equal(result.winners.length, 1);
  assert.ok(result.standings.every(car => car.finish_tick === null));
});

test('fresh native proof retains the complete source, accepted history and economic outcome', () => {
  const native = currentGameProofFixtures();
  const row = (name: string) => {
    const value = native.vectors.find(v => v.name === name);
    assert.ok(value, `required genuine native row ${name}`);
    return value;
  };
  const source = row('RaceProverRequestV1').value as RaceProverRequestV1;
  const raw = structuredClone(row('GameSessionRecordV1').value) as GameSessionRecordV1;
  const proof = row('ExecutionProofEnvelopeV1').value as ExecutionProofEnvelopeV1;
  const outcome = row('GameOutcomeV1').value as GameOutcomeV1;
  const payload = decodeRaceFrameV1('RaceProofPayloadV1', Uint8Array.from(proof.proof_bytes)) as RaceProofPayloadV1;
  const { replay, history_evidence: evidence, observation_height: observationHeight } = source;
  assert.equal(raw.profile_id, profileId, 'fresh native proof must match the compiled frontend profile');
  assert.equal(raw.network_id, native.network_id);
  const state = simulateNativeReplay(replay), result = nativeRaceResult(state);
  assert.equal(state.tick, 6); assert.equal(raw.next_tick, 12);
  assert.deepEqual(result.winners, []);
  assert.ok(result.standings.every(car => car.finish_tick === null && car.dnf_tick === 6));
  assert.equal(evidence.transcript.batches.length, 2);
  assert.deepEqual(evidence.transcript.batches[1]!.inputs, [[], []], 'postterminal removed slots remain explicit');
  const economic = settlementResult(result, raw.next_tick, evidence.transcript);
  assert.equal(economic.physical_terminal_tick, 6); assert.equal(economic.accepted_through_tick, 12);
  assert.deepEqual(raceOutcome(economic), outcome);
  assert.deepEqual(payload.history_evidence, evidence);
  assert.equal(payload.accepted_through_tick, raw.next_tick);
  const record: RaceRecord = parseRaceRecord(raw, native.network_id, raw.session_id);
  const context = raceContext(record);
  assert.equal(outcomeCommitment(context, outcome), proof.statement.outcome_commitment);
  assert.equal(prepareRaceTranscript(context, evidence.transcript, raw.next_tick, raw.participants.length).acceptedRoot(), proof.statement.transcript_root);
  assert.equal(record.race_id, raw.session_id); assert.equal(record.rules.max_racers, 2); assert.equal(record.participants[1]!.car_id, 1);
  assert.equal(record.terminal_at_height, null);
  assert.deepEqual(record.resources, []);
  assert.notEqual(record.source_record, raw, 'source is independently canonicalized');
  for (const field of ['custody', 'liability', 'pending_certificate']) {
    const missing = { ...raw } as Record<string, unknown>; delete missing[field];
    assert.throws(() => parseRaceRecord(missing), `missing ${field} cannot be synthesized`);
  }
  assert.throws(() => parseRaceRecord({ ...raw, settled_at_height: null }), /missing or unknown/);
  const missingResources = { ...raw } as Partial<typeof raw>; delete missingResources.resources;
  assert.throws(() => parseRaceRecord(missingResources));
  assert.throws(() => parseRaceRecord({ ...raw, admission_commitment: commitment(25) }), /immutable roster/);
  assert.throws(() => parseRaceRecord({ ...raw, terminal_at_height: 151 }), /Terminal height/);
  assert.throws(() => parseRaceRecord({ ...raw, phase: { kind: 'settled', value: null }, terminal_at_height: null }), /Terminal height/);
  assert.equal(parseRaceRecord({ ...raw, phase: { kind: 'settled', value: null }, terminal_at_height: '151', result: outcome, verification_id: hash(33) }).terminal_at_height, '151');
  const replacement = { ...raw, participants: raw.participants.map((p, i) => ({ ...p, application_data: [i + 1] })) };
  replacement.admission_commitment = admissionCommitment(raw.network_id, raw.session_id, { version: 1, participants: replacement.participants.map(({ account, input_key, application_data }) => ({ account, input_key, application_data })), wagers: [], resources: [] });
  assert.throws(() => assertSameRaceTerms(record, parseRaceRecord(replacement)), /Immutable session terms/);
  assert.doesNotThrow(() => assertSameRaceTerms(record, { ...record, participants: record.participants.map(p => ({ ...p, dnf_at_tick: 60 })) }));
  const request = buildRaceProverRequest(record.source_record, replay, observationHeight, evidence);
  assert.deepEqual(request.source_record.participants, record.source_record.participants);
  assert.equal(request.source_record.custody, raw.custody);
  assert.equal(request.source_record.liability, raw.liability);
  assert.equal(String(request.observation_height), String(observationHeight));
  assert.equal(request.source_record.session_id, raw.session_id); assert.equal(request.source_record.manifest_commitment, raw.manifest_commitment);
  assert.equal(Buffer.from(encodeRaceValueV1('RaceProverRequestV1', request)).toString('hex').toUpperCase(), row('RaceProverRequestV1').encoded_hex);
  const rewritten = structuredClone(record.source_record);
  rewritten.checkpoint!.checkpoint.transcript_root = commitment(31);
  assert.throws(() => buildRaceProverRequest(rewritten, replay, observationHeight, evidence), /rewrites/);
  assert.throws(() => buildRaceProverRequest(record.source_record, replay, observationHeight, { ...evidence, transcript: { ...evidence.transcript, batches: evidence.transcript.batches.slice(0, 1) } }), /Complete accepted history/);
  const driftedView = { ...record, stake: '999', revision: '999', phase: { kind: 'forced_reveal' as const },
    participants: record.participants.map(p => ({ ...p, dnf_at_tick: 0 })), pending_certificate: null };
  assert.deepEqual(buildRaceProverRequest(driftedView.source_record, replay, observationHeight, evidence), request,
    'display-view drift cannot rewrite the complete native prover source');
  const loaded = parseRaceProofBundle({ proof, outcome, sourceRecordHex: 'UNTRUSTED FILE CLAIM' }, record);
  assert.equal(raceProofSourceMatches(loaded, record), true);
  assert.equal(loaded.sourceRecordHex, Buffer.from(encodeGameValueV1('GameSessionRecordV1', record.source_record)).toString('hex'),
    'the local import pin covers exact canonical record bytes, not JSON key order or a projected view');
  const reordered = Object.fromEntries(Object.entries(record.source_record).reverse());
  assert.equal(raceProofSourceMatches(loaded, parseRaceRecord(reordered)), true);
  assert.equal(raceProofSourceMatches(loaded, parseRaceRecord({ ...record.source_record, revision: Number(record.source_record.revision) })), true,
    'equivalent canonical integer representations do not spuriously invalidate an import');
  assert.notEqual(loaded.sourceRecordHex, 'UNTRUSTED FILE CLAIM', 'source pin always comes from the locally observed record');
  assert.doesNotThrow(() => assertRaceProofSourceUnchanged(loaded, record));
  assert.equal(parseRaceProofBundle({ proof, outcome }, driftedView).sourceRecordHex, loaded.sourceRecordHex,
    'proof parser rederives its working view from the complete source');
  const sourceBefore = structuredClone(record.source_record);
  for (const edit of [
    (s: typeof record.source_record) => { s.revision = String(BigInt(s.revision) + 1n); },
    (s: typeof record.source_record) => { s.liability = '3'; },
    (s: typeof record.source_record) => { s.deadline_height = String(BigInt(s.deadline_height) + 1n); },
    (s: typeof record.source_record) => { s.custody = s.participants[1]!.account; },
    (s: typeof record.source_record) => { s.phase = { kind: 'forced_reveal', value: null }; },
    (s: typeof record.source_record) => { s.input_commitments[0] = commitment(17); },
    (s: typeof record.source_record) => { s.input_reveals[0] = raceInputPayloadV1([1, 1, 1, 1, 1, 1]); },
    (s: typeof record.source_record) => { s.checkpoint!.checkpoint.epoch = '7'; },
    (s: typeof record.source_record) => { s.pending_certificate = { session_id: s.session_id, scope: certificateScope(context.activeScope), epoch: s.epoch, start_tick: s.next_tick,
      parent_transcript_root: s.checkpoint!.checkpoint.transcript_root, commitments: [commitment(11), commitment(13)], signatures: [] }; },
  ]) {
    const changed = structuredClone(record.source_record); edit(changed);
    const current = parseRaceRecord(changed);
    assert.equal(raceProofSourceMatches(loaded, current), false);
    assert.throws(() => assertRaceProofSourceUnchanged(loaded, current), /complete session record changed/);
    assert.deepEqual(current.admission_commitment, record.admission_commitment);
    assert.deepEqual(current.manifest_commitment, record.manifest_commitment);
    assert.deepEqual(current.dispute_commitment, record.dispute_commitment);
  }
  assert.deepEqual(record.source_record, sourceBefore, 'source pinning does not mutate the endpoint record');
  // Deliberately corrupted derivative, never genuine-proof evidence: browser
  // structure checks cannot authenticate the claimed native record binding.
  const otherBinding = { ...proof, statement: { ...proof.statement, source_record_binding: { bytes: '0100000000000000'.repeat(6) } } };
  assert.equal(parseRaceProofBundle(otherBinding, record).sourceRecordHex, loaded.sourceRecordHex);
});

test('RaceV1 outcomes exclude forfeits from finish and distance awards', () => {
  const state = createRace(0, 4);
  state.tick = 5400;
  [40_000, 80_000, 80_000, 120_000].forEach((progress, slot) => { state.cars[slot]!.progress = progress; });
  state.cars[3]!.dnf = true; state.cars[3]!.dnfTick = 5394;
  assert.deepEqual(nativeRaceResult(state).winners, [1, 2], 'a forfeited leader cannot receive the timeout prize');
  state.cars[2]!.progress -= 1;
  assert.deepEqual(nativeRaceResult(state).winners, [1], 'one millimetre resolves a progress tie');
  state.cars[0]!.finishTick = 100; state.cars[0]!.progress = 6_000_000;
  assert.deepEqual(nativeRaceResult(state).winners, [0], 'a finisher outranks every timeout distance');
  state.cars[0]!.dnf = true; state.cars[0]!.dnfTick = 108;
  assert.deepEqual(nativeRaceResult(state).winners, [1], 'a forfeited finisher cannot receive the prize');
  state.cars.forEach(car => { car.dnf = true; car.dnfTick = 5394; });
  assert.deepEqual(nativeRaceResult(state).winners, [], 'all forfeits retain the explicit refund outcome');
});
