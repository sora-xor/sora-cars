import { prepareGameTranscriptV1, NetworkId, formatGameCommitmentLiteralV1, parseGameCommitmentLiteralV1, formatGameNonceLiteralV1, parseGameNonceLiteralV1, gameCertificateCommitmentV1, encodeGameCertificateFrameV1 } from '@iroha/iroha-js/game-certificates';
import type { GameCertificateContextV1, GameActiveScopeV1 as CertificateScope } from '@iroha/iroha-js/game-certificates';
import { raceControlsFromPayloadV1 } from '@iroha/iroha-js/race';
import { encodeGameValueV1, decodeGameValueV1 } from '@iroha/iroha-js/game';
import type { GameActiveScopeV1, GameCheckpointV1, GameCommitmentSetV1, GameInputCommitmentV1, GameInputRevealV1, GameManifestV1, GameAdmissionBodyV1, GameOutcomeV1, GameTranscriptV1, GameSessionRecordV1 } from '@iroha/iroha-js/game';

export interface GameContext { networkId: string; raceId: string; activeScope: GameActiveScopeV1 }
export const gameCommitment = (value: string) => formatGameCommitmentLiteralV1(parseGameCommitmentLiteralV1(value));
export function certificateContext(networkId: string, sessionId: string): GameCertificateContextV1 {
  return { networkId: NetworkId.parse(networkId), sessionId: NetworkId.parse(sessionId).toBytes() };
}
export function certificateScope(scope: GameActiveScopeV1): CertificateScope {
  // The wire owner rejects extra fields before adapting the branded leaves.
  const checked = decodeGameValueV1('GameActiveScopeV1', encodeGameValueV1('GameActiveScopeV1', scope)) as GameActiveScopeV1;
  return { manifest: gameCommitment(checked.manifest), admission: gameCommitment(checked.admission) };
}
export function activeScope(record: Pick<GameSessionRecordV1, 'manifest_commitment' | 'admission_commitment'>): GameActiveScopeV1 {
  if (record.admission_commitment === null) throw new Error('A started session requires a frozen admission commitment.');
  return certificateScope({ manifest: record.manifest_commitment, admission: record.admission_commitment });
}
export function inputPreimage(input: GameInputRevealV1) {
  const value = decodeGameValueV1('GameInputRevealV1', encodeGameValueV1('GameInputRevealV1', input)) as GameInputRevealV1;
  return { scope: certificateScope(value.scope), epoch: BigInt(value.epoch), start_tick: value.start_tick, slot: value.slot, payload: Uint8Array.from(value.payload), nonce: formatGameNonceLiteralV1(parseGameNonceLiteralV1(value.nonce)) };
}
export function inputDigest(networkId: string, input: GameInputRevealV1): string { return gameCertificateCommitmentV1(certificateContext(networkId, input.session_id), 1, inputPreimage(input)); }
export function revealSigningFrame(networkId: string, input: GameInputRevealV1): Uint8Array { return encodeGameCertificateFrameV1(certificateContext(networkId, input.session_id), 102, inputPreimage(input)); }
export function inputSigningFrame(networkId: string, input: Omit<GameInputCommitmentV1, 'signature'>): Uint8Array {
  const { session_id, scope, epoch, start_tick, slot, commitment } = input;
  if (Object.keys(input).sort().join(',') !== 'commitment,epoch,scope,session_id,slot,start_tick') throw new Error('Unexpected commitment certificate fields.');
  return encodeGameCertificateFrameV1(certificateContext(networkId, session_id), 101, { scope: certificateScope(scope), epoch: BigInt(epoch), start_tick, slot, commitment: gameCommitment(commitment) });
}
export function checkpointBody(checkpoint: GameCheckpointV1) {
  const cp = decodeGameValueV1('GameCheckpointV1', encodeGameValueV1('GameCheckpointV1', checkpoint)) as GameCheckpointV1;
  return { scope: certificateScope(cp.scope), epoch: BigInt(cp.epoch), tick: cp.tick, transcript_root: gameCommitment(cp.transcript_root), state_root: gameCommitment(cp.state_root), terminal: cp.terminal };
}
export function checkpointSigningFrame(networkId: string, checkpoint: GameCheckpointV1): Uint8Array { return encodeGameCertificateFrameV1(certificateContext(networkId, checkpoint.session_id), 104, checkpointBody(checkpoint)); }
export function checkpointId(networkId: string, checkpoint: GameCheckpointV1): string { return gameCertificateCommitmentV1(certificateContext(networkId, checkpoint.session_id), 8, checkpointBody(checkpoint)); }
export function frontierBody(frontier: Omit<GameCommitmentSetV1, 'signatures'>) {
  const { session_id: _id, scope, epoch, start_tick, parent_transcript_root, commitments } = frontier;
  if (Object.keys(frontier).sort().join(',') !== 'commitments,epoch,parent_transcript_root,scope,session_id,start_tick') throw new Error('Unexpected frontier certificate fields.');
  return { scope: certificateScope(scope), epoch: BigInt(epoch), start_tick, parent_transcript_root: gameCommitment(parent_transcript_root), commitments: commitments.map(gameCommitment) };
}
export function frontierSigningFrame(networkId: string, frontier: Omit<GameCommitmentSetV1, 'signatures'>): Uint8Array { return encodeGameCertificateFrameV1(certificateContext(networkId, frontier.session_id), 103, frontierBody(frontier)); }
export function frontierId(networkId: string, frontier: Omit<GameCommitmentSetV1, 'signatures'>): string { return gameCertificateCommitmentV1(certificateContext(networkId, frontier.session_id), 9, frontierBody(frontier)); }
export function manifestCommitment(networkId: string, sessionId: string, value: GameManifestV1): string {
  const m = decodeGameValueV1('GameManifestV1', encodeGameValueV1('GameManifestV1', value)) as GameManifestV1;
  return gameCertificateCommitmentV1(certificateContext(networkId, sessionId), 4, { ...m, application_id: NetworkId.parse(m.application_id).toBytes(), profile_id: NetworkId.parse(m.profile_id).toBytes(), application_parameters: Uint8Array.from(m.application_parameters), access: m.access.kind === 'public' ? { kind: 'public' } : { kind: 'invite', public_key: keyBytes(m.access.public_key) }, payout_policy: { kind: m.payout_policy.kind } });
}
export function keyBytes(value: string): Uint8Array {
  if (!/^ed0120[0-9A-F]{64}$/.test(value)) throw new Error('Expected a canonical Ed25519 input key.');
  return Uint8Array.from(value.slice(6).match(/../g)!, pair => parseInt(pair, 16));
}
export function admissionCommitment(networkId: string, sessionId: string, value: GameAdmissionBodyV1): string {
  const a = decodeGameValueV1('GameAdmissionBodyV1', encodeGameValueV1('GameAdmissionBodyV1', value)) as GameAdmissionBodyV1;
  return gameCertificateCommitmentV1(certificateContext(networkId, sessionId), 5, { version: a.version, participants: a.participants.map(p => ({ account: p.account, input_key: keyBytes(p.input_key), application_data: Uint8Array.from(p.application_data) })), wagers: a.wagers.map(w => ({ ...w, metadata_hash: NetworkId.parse(w.metadata_hash).toBytes() })), resources: a.resources.map(r => ({ ...r, metadata_hash: NetworkId.parse(r.metadata_hash).toBytes(), role_id: NetworkId.parse(r.role_id).toBytes(), policy: { kind: r.policy.kind } })) });
}
export function outcomeCommitment(context: GameContext, outcome: GameOutcomeV1): string {
  const o = decodeGameValueV1('GameOutcomeV1', encodeGameValueV1('GameOutcomeV1', outcome)) as GameOutcomeV1;
  return gameCertificateCommitmentV1(certificateContext(context.networkId, context.raceId), 7, { scope: certificateScope(context.activeScope), outcome: { terminal_tick: o.terminal_tick, winner_slots: Uint8Array.from(o.winner_slots), result: Uint8Array.from(o.result) } });
}
/** Stock RaceV1's complete inputs, including unused suffixes, must pass its
 * compiled control format before entering the generic transcript preparation.
 * This is local consistency only; the caller selects the original ledger roster. */
export function prepareRaceTranscript(context: GameContext, transcript: GameTranscriptV1, throughTick: number, originalSlots: number) {
  if (!Number.isInteger(originalSlots) || originalSlots < 2 || originalSlots > 8) throw new Error('Stock RaceV1 requires 2–8 original slots.');
  const t = decodeGameValueV1('GameTranscriptV1', encodeGameValueV1('GameTranscriptV1', transcript)) as GameTranscriptV1;
  const removed = new Map(t.dnf_events.flatMap(event => event.slots.map(slot => [slot, event.tick] as const)));
  for (const row of t.batches) row.inputs.forEach((payload, slot) => {
    if ((removed.get(slot) ?? Infinity) > row.start_tick) raceControlsFromPayloadV1(payload);
    else if (payload.length) throw new Error('Removed slot retains accepted controls.');
  });
  return prepareGameTranscriptV1(certificateContext(context.networkId, context.raceId), certificateScope(context.activeScope),
    { batch_ticks: 6, max_ticks: 5400, slots: originalSlots, max_input_bytes: 12 }, throughTick,
    { batches: t.batches.map(b => ({ start_tick: b.start_tick, inputs: b.inputs.map(input => Uint8Array.from(input)) })), dnf_events: t.dnf_events.map(d => ({ tick: d.tick, slots: Uint8Array.from(d.slots) })) });
}
