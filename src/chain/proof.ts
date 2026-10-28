import { admissionCommitment, manifestCommitment, outcomeCommitment, prepareRaceTranscript } from './certificates';
import { validateDrivingProjection, settlementResult } from './history';
import type { GameReplayEvidenceV1 } from '@iroha/iroha-js/game-replay';
import { RACE_PROFILE_ID } from '../game/environment';
import { encodeGameValueV1, decodeGameValueV1 } from '@iroha/iroha-js/game';
import type { ExecutionProofEnvelopeV1, GameOutcomeV1, GameSessionRecordV1 } from '@iroha/iroha-js/game';
import { decodeRaceFrameV1, encodeRaceValueV1, deriveRaceResultV1, buildRaceProverRequestV1 } from '@iroha/iroha-js/race';
import type { RaceProverRequestV1, RaceReplayV1, RaceResultV1, RaceProofPayloadV1 } from '@iroha/iroha-js/race';
import { raceFinished } from '../game/engine';
import { hex } from '../network/session';
import type { RaceState } from '../game/engine';
import { simulateNativeReplayWithCheckpoints } from '../network/controller';
import { nativeState, raceOutcome, raceContext, stateRoot, raceAdmission, parseRaceRecord } from './races';
import type { RaceRecord } from './races';

export function nativeRaceResult(state: RaceState): RaceResultV1 {
  if (!raceFinished(state)) throw new Error('Only a terminal deterministic race has an outcome.');
  return deriveRaceResultV1(nativeState(state));
}
/** Check the application's public replay against its displayed native view.
 * Neither these consistency checks nor endpoint provenance authenticate finality. */
function validateReplay(record: RaceRecord, replay: RaceReplayV1, evidence: GameReplayEvidenceV1) {
  if (record.profile_id !== RACE_PROFILE_ID) throw new Error('This session requires a different compiled simulation profile.');
  const admission = raceAdmission(record);
  if (admission.resources.length !== 0) throw new Error('Stock RaceV1 does not admit equipment resources.');
  if (admissionCommitment(record.network_id, record.race_id, admission) !== record.admission_commitment) throw new Error('Native admission commitment mismatch.');
  const full = validateDrivingProjection(record, replay, evidence);
  const context = raceContext(record);
  if (replay.player_count !== record.participants.length || replay.track.kind !== record.rules.track.kind) throw new Error('Proof replay differs from the native session manifest.');
  const prepared = prepareRaceTranscript(context, full.transcript, record.next_tick, record.participants.length);
  const root = prepared.acceptedRoot(), checkpoint = record.checkpoint?.checkpoint;
  if (manifestCommitment(record.network_id, record.race_id, record.manifest) !== record.manifest_commitment) throw new Error('Native manifest commitment mismatch.');
  const anchors = [...record.checkpoint_history, ...(checkpoint ? [checkpoint] : [])];
  if (!checkpoint || anchors.length > 900 || record.checkpoint_history.some(anchor => anchor.tick === 0)) throw new Error('Proof requires the complete retained checkpoint history.');
  const simulation = simulateNativeReplayWithCheckpoints(replay, anchors.map(anchor => anchor.tick));
  const result = nativeRaceResult(simulation.state), outcome = raceOutcome(settlementResult(result, record.next_tick, full.transcript));
  const checkpointStates = simulation.checkpointStates.map((state, index) => {
    const anchor = anchors[index]!;
    if (prepared.checkpointRoot(anchor.tick) !== anchor.transcript_root || stateRoot(context, state) !== anchor.state_root) throw new Error('Replay rewrites a retained checkpoint state or certified input history.');
    return nativeState(state);
  });
  return { admission, outcome, transcriptRoot: root, checkpointStates };
}
/** Complete public source only. The native prover derives the statement and
 * record binding itself; the caller must supply an explicit observation height. */
export function buildRaceProverRequest(sourceRecord: GameSessionRecordV1, replay: RaceReplayV1, observationHeight: string | number | bigint, historyEvidence: GameReplayEvidenceV1): RaceProverRequestV1 {
  const record = parseRaceRecord(sourceRecord);
  const { checkpointStates } = validateReplay(record, replay, historyEvidence);
  return buildRaceProverRequestV1({ history_evidence: historyEvidence, source_record: record.source_record, observation_height: observationHeight, replay, checkpoint_states: checkpointStates });
}
export interface RaceProofBundle {
  proof: ExecutionProofEnvelopeV1;
  outcome: GameOutcomeV1;
  /** Local canonical source bytes observed at import, not the execution384 digest
   * and not authenticated ledger inclusion. A different record invalidates this import. */
  readonly sourceRecordHex: string;
}
/** Detect definite local staleness without pretending to recompute execution384. */
export function raceProofSourceMatches(bundle: Pick<RaceProofBundle, 'sourceRecordHex'>, record: Pick<RaceRecord, 'source_record'>): boolean {
  return bundle.sourceRecordHex === hex(encodeGameValueV1('GameSessionRecordV1', record.source_record));
}
export function assertRaceProofSourceUnchanged(bundle: Pick<RaceProofBundle, 'sourceRecordHex'>, record: Pick<RaceRecord, 'source_record'>): void {
  if (!raceProofSourceMatches(bundle, record)) throw new Error('対戦記録が変わりました。新しい記録に対応する証明を読み込んでください。 / The complete session record changed. Load a proof for the new record before submitting.');
}
/** Structural/replay consistency only. The SDK cannot recompute execution384.
 * Complete source-record binding, STARK and current ledger state are verified
 * by native execution before settlement; no browser cryptographic verdict. */
export function parseRaceProofBundle(value: unknown, record: RaceRecord): RaceProofBundle {
  if (!value || typeof value !== 'object') throw new Error('Expected a native execution proof envelope or proof bundle.');
  const candidate = value as Record<string, unknown>;
  const envelope = Object.hasOwn(candidate, 'proof') ? candidate.proof : candidate;
  const proof = decodeGameValueV1('ExecutionProofEnvelopeV1', encodeGameValueV1('ExecutionProofEnvelopeV1', envelope)) as ExecutionProofEnvelopeV1;
  const payload = decodeRaceFrameV1('RaceProofPayloadV1', Uint8Array.from(proof.proof_bytes)) as RaceProofPayloadV1;
  const outcome = decodeGameValueV1('GameOutcomeV1', encodeGameValueV1('GameOutcomeV1', candidate.outcome ?? payload.outcome)) as GameOutcomeV1;
  // Work from the entire retained source, never reconstruct custody/liabilities
  // or pending certified inputs from the presentation model.
  record = parseRaceRecord(record.source_record, record.network_id, record.race_id);
  const statement = proof.statement;
  if (proof.profile_id !== record.profile_id || statement.network_id !== record.network_id || statement.session_id !== record.race_id || statement.manifest_commitment !== record.manifest_commitment || statement.admission_commitment !== record.admission_commitment || statement.dispute_commitment !== record.dispute_commitment || statement.outcome_commitment !== outcomeCommitment(raceContext(record), outcome)) throw new Error('Proof bundle is stale or belongs to a different session.');
  const expected = validateReplay(record, payload.replay, payload.history_evidence);
  const equalNative = (name: string, a: unknown, b: unknown) => {
    const left = encodeGameValueV1(name, a), right = encodeGameValueV1(name, b);
    return left.length === right.length && left.every((byte, index) => byte === right[index]);
  };
  if (payload.accepted_through_tick !== record.next_tick || statement.transcript_root !== expected.transcriptRoot
      || !equalNative('GameOutcomeV1', outcome, expected.outcome)
      || !equalNative('GameManifestV1', payload.manifest, record.manifest)
      || !equalNative('GameAdmissionBodyV1', payload.admission, expected.admission)
      || payload.checkpoint_states.length !== expected.checkpointStates.length
      || payload.checkpoint_states.some((state, index) => hex(encodeRaceValueV1('RaceStateV1', state)) !== hex(encodeRaceValueV1('RaceStateV1', expected.checkpointStates[index]!)))) {
    throw new Error('Proof public inputs differ from the replay, admission and session manifest.');
  }
  return { proof, outcome, sourceRecordHex: hex(encodeGameValueV1('GameSessionRecordV1', record.source_record)) };
}
