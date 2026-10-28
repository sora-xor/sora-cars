import { formatGameNonceLiteralV1, encodeGameCertificateFrameV1, gameCertificateCommitmentV1 } from '@iroha/iroha-js/game-certificates';
import { certificateContext, certificateScope, activeScope, gameCommitment, keyBytes, manifestCommitment, admissionCommitment, inputDigest, inputSigningFrame, prepareRaceTranscript, type GameContext } from './certificates';
import { RACE_PROFILE_ID } from '../game/environment';
import { ed25519 } from '@noble/curves/ed25519';
import { encodeRaceValueV1, decodeRaceValueV1, encodeRaceFrameV1, decodeRaceFrameV1, raceGameTranscriptV1, raceHashLiteralV1, raceInputPayloadV1, raceControlsFromPayloadV1 } from '@iroha/iroha-js/race';
import type { RaceTrackV1, RaceReplayV1, RaceStateV1, RaceSettlementResultV1 } from '@iroha/iroha-js/race';
import { buildGameInstructionV1, buildJoinGameSessionV1, encodeGameValueV1, decodeGameValueV1, validateGameResourceRecordsV1, validateGameAdmissionBodyV1, validateGameSessionRecordV1 } from '@iroha/iroha-js/game';
import type { ExecutionProofEnvelopeV1, GameActiveScopeV1, SignedGameCheckpointV1, GameCommitmentSetV1, GameInputCommitmentV1, GameInputRevealV1, GameAccessV1, GameManifestV1, GameOutcomeV1, GamePayoutClaimV1, GameItemStakeV1, GameResourceReservationRecordV1, GameAdmissionBodyV1, GameSessionRecordV1, GameCheckpointAnchorV1, GameCertifiedBatchV1, GameInputOpeningV1 } from '@iroha/iroha-js/game';
import type { RaceState } from '../game/engine';
import { createInputKey, hex } from '../network/session';
import type { RaceParticipant, InputKeyPair } from '../network/session';

const TRACKS: RaceTrackV1['kind'][] = ['neon_tokyo', 'harbor', 'sakura'];
export function nativeTrack(trackId: number): RaceTrackV1 {
  const kind = TRACKS[trackId]; if (!Number.isInteger(trackId) || !kind) throw new Error('Unknown compiled track.');
  return { kind, value: null };
}
export function gameTrack(track: RaceTrackV1): number {
  const index = TRACKS.indexOf(track?.kind); if (index < 0 || Object.keys(track).length !== 2 || track.value !== null) throw new Error('Unknown native track.');
  return index;
}
export function nativeState(state: RaceState): RaceStateV1 {
  return { tick: state.tick, track: nativeTrack(state.trackId), cars: state.cars.map(car => ({ progress_mm: car.progress, lateral_mm: car.x, speed_mm_per_tick: car.speed, lateral_velocity_mm_per_tick: car.vx, boost_energy: car.energy, finish_tick: car.finishTick, dnf_tick: car.dnfTick })) };
}
export function raceContext(record: Pick<RaceRecord, 'network_id' | 'race_id' | 'source_record'>): GameContext { return { networkId: record.network_id, raceId: record.race_id, activeScope: activeScope(record.source_record) }; }
export function stateRoot(context: GameContext, state: RaceState): string { return gameCertificateCommitmentV1(certificateContext(context.networkId, context.raceId), 3, { scope: certificateScope(context.activeScope), tick: state.tick, adapter_state: encodeRaceFrameV1('RaceStateV1', nativeState(state)) }); }
/** Physical checkpoint cut before same-tick removals. Final settlement uses the complete accepted transcript. */
export function checkpointTranscriptRoot(context: GameContext, replay: RaceReplayV1): string { return prepareRaceTranscript(context, raceGameTranscriptV1(replay), replay.frames.length, replay.player_count).checkpointRoot(replay.frames.length); }
export function newRaceId(): string { const bytes = crypto.getRandomValues(new Uint8Array(32)); bytes[31] = bytes[31]! | 1; return raceHashLiteralV1(bytes); }
/** A gameplay-only key; the JoinGameSessionV1 wallet transaction binds it to exactly this roster. */
export function newRaceInputKey(): InputKeyPair { return createInputKey(); }
export function inputKeyLiteral(key: InputKeyPair | string): string {
  const value = typeof key === 'string' ? key : key.publicKeyHex;
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('Expected a canonical Ed25519 gameplay public key.');
  return `ed0120${value.toUpperCase()}`;
}
export function raceManifest(input: { trackId: number; maxRacers: number; applicationId: string; profileId: string; access?: GameAccessV1 }): GameManifestV1 {
  if (!Number.isInteger(input.maxRacers) || input.maxRacers < 2 || input.maxRacers > 8) throw new Error('SORA CARS supports 2–8 racers.');
  const manifest: GameManifestV1 = { version: 1, application_id: input.applicationId, profile_id: input.profileId, application_parameters: Array.from(encodeRaceValueV1('RaceTrackV1', nativeTrack(input.trackId))), min_participants: 2, max_participants: input.maxRacers, batch_ticks: 6, max_ticks: 5400, max_input_bytes: 12, max_participant_data_bytes: 1, access: input.access ?? { kind: 'public', public_key: null }, payout_policy: { kind: 'equal_winners_or_refund', value: null } };
  return decodeGameValueV1('GameManifestV1', encodeGameValueV1('GameManifestV1', manifest)) as GameManifestV1;
}
export function openRace(input: { raceId: string; trackId: number; maxRacers: number; applicationId: string; profileId: string; access?: GameAccessV1; assetDefinition: string; stake: string; joinDeadlineHeight: string | number | bigint }): object {
  return buildGameInstructionV1('OpenGameSessionV1', { session_id: input.raceId, manifest: raceManifest(input), asset_definition: input.assetDefinition, stake: input.stake, join_deadline_height: input.joinDeadlineHeight });
}
export function raceInvitation(networkId: string, raceId: string, manifest: string, wallet: string, key: InputKeyPair | string, carId: number, invitationKey: Uint8Array): string {
  if (!Number.isInteger(carId) || carId < 0 || carId > 5) throw new Error('Unknown car skin.');
  const body = { manifest: gameCommitment(manifest), wallet, input_key: keyBytes(inputKeyLiteral(key)), application_data: Uint8Array.of(carId), resources: [] };
  return hex(ed25519.sign(encodeGameCertificateFrameV1(certificateContext(networkId, raceId), 106, body), invitationKey)).toUpperCase();
}
export function joinRace(terms: Pick<RaceRecord, 'race_id' | 'manifest_commitment' | 'asset_definition' | 'stake'>, key: InputKeyPair | string, carId: number, invitation: string | null = null): object {
  if (!Number.isInteger(carId) || carId < 0 || carId > 5) throw new Error('Unknown car skin.');
  return buildJoinGameSessionV1({ session_id: terms.race_id, input_key: inputKeyLiteral(key), application_data: [carId], resources: [], invitation,
    expected_manifest_commitment: terms.manifest_commitment, expected_asset_definition: terms.asset_definition, expected_stake: terms.stake });
}
export function stakeRaceItem(raceId: string, nftId: string, manifestHash: string): object {
  return buildGameInstructionV1('StakeGameItemV1', { session_id: raceId, nft_id: nftId, expected_manifest_commitment: manifestHash });
}
export function parseItemStakes(value: unknown, participantCount: number): GameItemStakeV1[] {
  const items = list(value, participantCount, item => decodeGameValueV1('GameItemStakeV1', encodeGameValueV1('GameItemStakeV1', item)) as GameItemStakeV1);
  if (items.some((item, index) => item.slot >= participantCount || index > 0 && items[index - 1]!.slot >= item.slot || item.claimed !== (item.recipient !== null)) || new Set(items.map(item => item.nft_id)).size !== items.length || new Set(items.map(item => item.custody)).size !== items.length) throw new Error('Invalid native game item stakes.');
  return items;
}
export function startRace(raceId: string): object { return buildGameInstructionV1('StartGameSessionV1', { session_id: raceId }); }
/** Callers must provide the old frontier openings selected against a fresh complete record. */
export function publishCheckpoint(checkpoint: SignedGameCheckpointV1, frontier: GameCommitmentSetV1 | null, oldFrontierOpenings: (GameInputOpeningV1 | null)[] | null): object {
  return buildGameInstructionV1('CommitGameCheckpointV1', { session_id: checkpoint.checkpoint.session_id, checkpoint, frontier, old_frontier_openings: oldFrontierOpenings });
}
/** Bound public recovery data across all 900 six-tick intervals; deduplicate exact
 * canonical values without treating imported openings as authenticated. */
export function mergeRaceReveals(...groups: (readonly GameInputRevealV1[])[]): GameInputRevealV1[] {
  const values = new Map<string, { encoded: string; reveal: GameInputRevealV1 }>();
  for (const group of groups) {
    if (group.length > 7200) throw new Error('Oversized public reveal history.');
    for (const reveal of group) {
      raceControlsFromPayloadV1(reveal.payload);
      const bytes = encodeGameValueV1('GameInputRevealV1', reveal), encoded = hex(bytes);
      const checked = decodeGameValueV1('GameInputRevealV1', bytes) as GameInputRevealV1;
      const key = JSON.stringify([checked.session_id, checked.scope.manifest, checked.scope.admission, String(checked.epoch), checked.start_tick, checked.slot]);
      const old = values.get(key);
      if (old && old.encoded !== encoded) throw new Error('Conflicting public reveals for the same session slot and interval.');
      if (!old) values.set(key, { encoded, reveal: checked });
      if (values.size > 7200) throw new Error('Oversized public reveal history.');
    }
  }
  return [...values.values()].map(value => value.reveal);
}
/** Retain bounded signed public commitment evidence across reconnects. Old
 * rounds remain available; recoveryInputs selects and verifies the current one. */
export function mergeRaceCommitments(...groups: (readonly GameInputCommitmentV1[])[]): GameInputCommitmentV1[] {
  const values = new Map<string, { encoded: string; input: GameInputCommitmentV1 }>();
  for (const group of groups) {
    if (group.length > 7200) throw new Error('Oversized public commitment history.');
    for (const input of group) {
      const bytes = encodeGameValueV1('GameInputCommitmentV1', input), encoded = hex(bytes);
      const checked = decodeGameValueV1('GameInputCommitmentV1', bytes) as GameInputCommitmentV1;
      const key = JSON.stringify([checked.session_id, checked.scope.manifest, checked.scope.admission, String(checked.epoch), checked.start_tick, checked.slot]);
      const old = values.get(key);
      if (old && old.encoded !== encoded) throw new Error('Conflicting public commitments for the same session slot and interval.');
      if (!old) values.set(key, { encoded, input: checked });
      if (values.size > 7200) throw new Error('Oversized public commitment history.');
    }
  }
  return [...values.values()].map(value => value.input);
}
/** Public nonce-bearing openings for the exact pending certificate being retired.
 * This is local consistency, never a replacement for native certificate validation. */
export function checkpointOpenings(record: RaceRecord, checkpoint: SignedGameCheckpointV1, frontier: GameCommitmentSetV1 | null, ...observed: (readonly GameInputRevealV1[])[]): (GameInputOpeningV1 | null)[] | null {
  const source = record.source_record, cp = checkpoint.checkpoint, old = source.pending_certificate;
  if (cp.session_id !== source.session_id || String(cp.epoch) !== String(source.epoch) || cp.scope.manifest !== source.manifest_commitment || cp.scope.admission !== source.admission_commitment || cp.tick < source.next_tick) throw new Error('Checkpoint differs from the current session frontier.');
  if (!old) return null;
  if (!source.checkpoint) throw new Error('Retained pending certificate lacks its checkpoint.');
  if (cp.tick === source.checkpoint.checkpoint.tick) {
    if (frontier === null || hex(encodeGameValueV1('GameCommitmentSetV1', frontier)) !== hex(encodeGameValueV1('GameCommitmentSetV1', old))) throw new Error('Retained certified inputs cannot be replaced at the same checkpoint.');
    return null;
  }
  const reveals = mergeRaceReveals(...observed);
  return source.participants.map((participant, slot) => {
    if (participant.dnf_at_tick !== null) return null;
    const opening = reveals.find(reveal => reveal.session_id === source.session_id && reveal.slot === slot && String(reveal.epoch) === String(old.epoch) && reveal.start_tick === old.start_tick && reveal.scope.manifest === old.scope.manifest && reveal.scope.admission === old.scope.admission && inputDigest(source.network_id, reveal) === old.commitments[slot]);
    if (!opening) throw new Error(`Missing matching public opening for retained certified slot ${slot}.`);
    raceControlsFromPayloadV1(opening.payload);
    return nativeValue<GameInputOpeningV1>('GameInputOpeningV1', { payload: opening.payload, nonce: opening.nonce });
  });
}
export function challengeRace(context: GameContext, epoch: string | number | bigint, slot: number, privateKey: Uint8Array): object {
  const signature = hex(ed25519.sign(encodeGameCertificateFrameV1(certificateContext(context.networkId, context.raceId), 105, { scope: certificateScope(context.activeScope), epoch: BigInt(epoch), slot }), privateKey)).toUpperCase();
  return buildGameInstructionV1('ChallengeGameSessionV1', { session_id: context.raceId, epoch, slot, signature });
}
export function publishInputCommitment(input: GameInputCommitmentV1): object { return buildGameInstructionV1('CommitGameInputsV1', { input }); }
export function publishInputReveal(reveal: GameInputRevealV1): object { return buildGameInstructionV1('RevealGameInputsV1', { reveal }); }
export function advanceRaceDeadline(raceId: string): object { return buildGameInstructionV1('AdvanceGameDeadlineV1', { session_id: raceId }); }
export function expireRace(raceId: string): object { return buildGameInstructionV1('ExpireGameSessionV1', { session_id: raceId }); }
export function claimRacePayout(raceId: string, slot: number, destination: string, amount: string): object {
  return buildGameInstructionV1('ClaimGamePayoutV1', { session_id: raceId, slot, destination, amount });
}
/** Exact quantities; no floating-point rounding of retained payout obligations. */
export function parsePayoutClaims(value: unknown, count: number): GamePayoutClaimV1[] {
  const units = (amount: string) => {
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,28})?$/.test(amount)) throw new Error('Invalid payout quantity.');
    const [whole, fraction = ''] = amount.split('.');
    return BigInt(whole! + fraction.padEnd(28, '0'));
  };
  const claims = list(value, count, raw => decodeGameValueV1('GamePayoutClaimV1', encodeGameValueV1('GamePayoutClaimV1', raw)) as GamePayoutClaimV1);
  claims.forEach((claim, i) => {
    if (claim.slot >= count || i > 0 && claims[i - 1]!.slot >= claim.slot || units(claim.amount) <= 0n || units(claim.remaining) > units(claim.amount)) throw new Error('Invalid retained payout claim.');
  });
  return claims;
}
export function raceOutcome(result: RaceSettlementResultV1): GameOutcomeV1 { return { terminal_tick: result.physical_terminal_tick, winner_slots: [...result.winners], result: Array.from(encodeRaceFrameV1('RaceSettlementResultV1', result)) }; }
export function settleRace(raceId: string, proof: ExecutionProofEnvelopeV1, outcome: GameOutcomeV1): object {
  if (proof.statement.session_id !== raceId) throw new Error('Execution proof belongs to a different session.');
  return buildGameInstructionV1('SettleGameSessionV1', { session_id: raceId, proof, outcome });
}

export type RacePhase = 'lobby' | 'racing' | 'selecting_checkpoint' | 'forced_commit' | 'forced_reveal' | 'awaiting_proof' | 'settled' | 'cancelled';
export interface NativeParticipant { account: string; input_key: string; car_id: number; dnf_at_tick: number | null }
export interface ForcedBatch { epoch: string; start_tick: number; controls: number[][]; dnf_slots: number[]; certified_frontier_id: string | null }
export interface RaceSummary { manifest: GameManifestV1; race_id: string; rules: { version: 1; track: RaceTrackV1; max_racers: number }; stake: string; payout_scale: number; payout_claims: GamePayoutClaimV1[]; item_stakes: GameItemStakeV1[]; resources: GameResourceReservationRecordV1[]; verification_id: string | null; terminal_at_height: string | null; asset_definition: string; participants: NativeParticipant[]; phase: { kind: RacePhase }; revision: string; deadline_height: string; result: RaceSettlementResultV1 | null }
export interface RaceRecord extends RaceSummary {
  /** Complete canonical endpoint record retained without synthesizing absent fields.
   * Transport validation does not establish finalized ledger authenticity. */
  source_record: GameSessionRecordV1;
  version: 1; network_id: string; profile_id: string; manifest_commitment: string; admission_commitment: string | null; dispute_commitment: string;
  epoch: string; next_tick: number; checkpoint: SignedGameCheckpointV1 | null; pending_certificate: GameCommitmentSetV1 | null;
  checkpoint_history: GameCheckpointAnchorV1[]; certified_batches: GameCertifiedBatchV1[];
  forced_batches: ForcedBatch[]; input_commitments: (string | null)[]; input_reveals: (number[] | null)[];
}
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Expected a native race record.'); return v as Record<string, unknown>; };
const decimal = (v: unknown): string => { if (!(typeof v === 'string' && /^(0|[1-9][0-9]*)$/.test(v)) && !(typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)) throw new Error('Invalid native counter.'); if (BigInt(v) > 0xffffffffffffffffn) throw new Error('Native counter overflow.'); return String(v); };
const bounded = (v: unknown, max: number): number => { if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) throw new Error('Invalid native race integer.'); return v; };
const text = (v: unknown): string => { if (typeof v !== 'string' || !v || v.length > 512) throw new Error('Invalid native text.'); return v; };
const nativeValue = <T>(name: string, value: unknown): T => decodeGameValueV1(name, encodeGameValueV1(name, value)) as T;
function nativeHash(value: unknown): string { const v = text(value); buildGameInstructionV1('StartGameSessionV1', { session_id: v }); return v; }
function list<T>(value: unknown, maximum: number, decode: (v: unknown) => T): T[] { if (!Array.isArray(value) || value.length > maximum) throw new Error('Invalid native list.'); return value.map(decode); }
/** Check internal commitment consistency; this does not authenticate an endpoint's ledger view. */
function assertManifestBinding(value: Record<string, unknown>, manifest: GameManifestV1, expectedNetworkId?: string, required = false): void {
  const identity = ['network_id', 'profile_id', 'manifest_commitment'];
  // Native list summaries omit these fields. A full or partially supplied
  // identity must carry every field and agree with its displayed manifest.
  if (!required && !identity.some(name => Object.hasOwn(value, name))) return;
  const network = nativeHash(value.network_id), profile = nativeHash(value.profile_id), commitment = gameCommitment(text(value.manifest_commitment));
  if (expectedNetworkId !== undefined && network !== expectedNetworkId || profile !== manifest.profile_id
      || commitment !== manifestCommitment(network, nativeHash(value.session_id), manifest)) {
    throw new Error('表示された対戦条件と確定用ハッシュが一致しません。 / Displayed manifest does not match its network, profile or commitment.');
  }
}
/** Translate the generic native application fields into the SORA CARS rendering view. */
function raceView(value: unknown): Record<string, unknown> {
  const raw = object(value);
  if (Object.hasOwn(raw, 'settled_at_height')) throw new Error('Obsolete native session field.');
  const manifest = decodeGameValueV1('GameManifestV1', encodeGameValueV1('GameManifestV1', raw.manifest)) as GameManifestV1;
  if (manifest.profile_id !== RACE_PROFILE_ID) throw new Error('この対戦の実行規則は現在のゲームと一致しません。 / Session profile differs from the compiled game.');
  if (manifest.min_participants !== 2 || manifest.max_participants > 8 || manifest.batch_ticks !== 6 || manifest.max_ticks !== 5400 || manifest.max_input_bytes !== 12 || manifest.max_participant_data_bytes !== 1 || manifest.payout_policy.kind !== 'equal_winners_or_refund') throw new Error('This game manifest is not the SORA CARS input profile.');
  const track = decodeRaceValueV1('RaceTrackV1', Uint8Array.from(manifest.application_parameters));
  const participants = list(raw.participants, 8, value => { const p = object(value), data = list(p.application_data, 1, byte => bounded(byte, 5)); if (data.length !== 1) throw new Error('Missing SORA CARS participant data.'); return { account: p.account, input_key: p.input_key, car_id: data[0], dnf_at_tick: p.dnf_at_tick }; });
  const phase = object(raw.phase);
  if (Object.keys(phase).sort().join(',') !== 'kind,value' || phase.value !== null) throw new Error('Invalid native phase encoding.');
  let result: RaceSettlementResultV1 | null = null;
  if (raw.result !== null) {
    const outcome = decodeGameValueV1('GameOutcomeV1', encodeGameValueV1('GameOutcomeV1', raw.result)) as GameOutcomeV1;
    result = decodeRaceFrameV1('RaceSettlementResultV1', Uint8Array.from(outcome.result)) as RaceSettlementResultV1;
    if (result.physical_terminal_tick !== outcome.terminal_tick || JSON.stringify(result.winners) !== JSON.stringify(outcome.winner_slots)) throw new Error('SORA CARS outcome differs from the native payout outcome.');
  }
  // `...raw` carries manifest_commitment only when supplied; native list summaries omit the whole identity.
  return { ...raw, manifest, race_id: raw.session_id, rules: { version: 1, track, max_racers: manifest.max_participants }, phase: { kind: phase.kind === 'playing' ? 'racing' : phase.kind }, participants, result,
    checkpoint: raw.checkpoint === undefined || raw.checkpoint === null ? null : raw.checkpoint,
    pending_certificate: raw.pending_certificate === undefined || raw.pending_certificate === null ? null : raw.pending_certificate,
    forced_batches: raw.forced_batches === undefined ? [] : list(raw.forced_batches, 900, value => { const b = object(value); return { epoch: b.epoch, start_tick: b.start_tick, controls: list(b.inputs, 8, row => row).map((row, slot) => { if (Array.isArray(row) && row.length === 0 && participants[slot]?.dnf_at_tick !== null && Number(participants[slot]?.dnf_at_tick) <= Number(b.start_tick)) return Array<number>(6).fill(0); return raceControlsFromPayloadV1(row as number[]); }), dnf_slots: b.dnf_slots, certified_frontier_id: b.certified_frontier_id }; }),
    input_reveals: raw.input_reveals === undefined ? [] : list(raw.input_reveals, 8, row => row === null ? null : raceControlsFromPayloadV1(row as number[])),
  };
}
export function parseRaceSummary(value: unknown, expectedNetworkId?: string): RaceSummary {
  const v = raceView(value), phase = object(v.phase);
  assertManifestBinding(v, v.manifest as GameManifestV1, expectedNetworkId);
  if (Object.keys(phase).length !== 1 || !['lobby', 'racing', 'selecting_checkpoint', 'forced_commit', 'forced_reveal', 'awaiting_proof', 'settled', 'cancelled'].includes(String(phase.kind))) throw new Error('Unknown native race phase.');
  const participants = list(v.participants, 8, p => { const item = object(p), key = text(item.input_key); if (!/^ed0120[0-9A-F]{64}$/.test(key)) throw new Error('Race roster requires Ed25519 keys.'); return { account: text(item.account), input_key: key, car_id: bounded(item.car_id, 5), dnf_at_tick: item.dnf_at_tick === null ? null : bounded(item.dnf_at_tick, 5400) }; });
  if (new Set(participants.map(p => p.account)).size !== participants.length || new Set(participants.map(p => p.input_key)).size !== participants.length) throw new Error('Duplicate native race identities.');
  const terminalAtHeight = v.terminal_at_height === null ? null : decimal(v.terminal_at_height);
  if (terminalAtHeight === '0' || (['settled', 'cancelled'].includes(String(phase.kind))) !== (terminalAtHeight !== null)) throw new Error('Terminal height does not match the reported session phase.');
  const resources = validateGameResourceRecordsV1(v.resources as GameResourceReservationRecordV1[], participants.map(p => p.account));
  if (resources.some(resource => (resource.released_at_height === null ? null : String(resource.released_at_height)) !== terminalAtHeight)) throw new Error('Equipment release height differs from the terminal session transition.');
  // Stock RaceV1 has no equipment entitlements. Classed admission remains disabled
  // until a complete compiled adapter, proof profile and custody path qualify.
  if (resources.length !== 0) throw new Error('標準クラスには性能装備を持ち込めません。 / Stock RaceV1 does not admit equipment resources.');
  const raceId = nativeHash(v.race_id), deadlineHeight = decimal(v.deadline_height);
  const terms = decodeGameValueV1('OpenGameSessionV1', encodeGameValueV1('OpenGameSessionV1', { session_id: raceId, manifest: v.manifest, asset_definition: v.asset_definition, stake: v.stake, join_deadline_height: deadlineHeight })) as { asset_definition: string; stake: string };
  return { manifest: v.manifest as GameManifestV1, race_id: raceId, rules: v.rules as RaceSummary['rules'], stake: terms.stake, payout_scale: bounded(v.payout_scale, 28), payout_claims: parsePayoutClaims(v.payout_claims, participants.length), item_stakes: parseItemStakes(v.item_stakes, participants.length), resources, verification_id: v.verification_id === null ? null : nativeHash(v.verification_id), terminal_at_height: terminalAtHeight, asset_definition: terms.asset_definition, participants, phase: { kind: phase.kind as RacePhase }, revision: decimal(v.revision), deadline_height: deadlineHeight, result: v.result === null ? null : v.result as RaceSettlementResultV1 };
}
/** This validates wire structure only. The caller still needs its authenticated chain view. */
export function parseRaceRecord(value: unknown, expectedNetworkId?: string, expectedRaceId?: string): RaceRecord {
  const source = validateGameSessionRecordV1(value);
  const v = raceView(source), summary = parseRaceSummary(source, expectedNetworkId), network = nativeHash(v.network_id);
  assertManifestBinding(v, summary.manifest, expectedNetworkId, true);
  if (v.version !== 1 || expectedNetworkId && expectedNetworkId !== network || expectedRaceId && expectedRaceId !== summary.race_id) throw new Error('Native race identity mismatch.');
  const count = summary.participants.length;
  const record: RaceRecord = { ...summary, source_record: source, version: 1, network_id: network, profile_id: nativeHash(v.profile_id), manifest_commitment: gameCommitment(text(v.manifest_commitment)), admission_commitment: v.admission_commitment === null ? null : gameCommitment(text(v.admission_commitment)), dispute_commitment: gameCommitment(text(v.dispute_commitment)), epoch: decimal(v.epoch), next_tick: bounded(v.next_tick, 5400), checkpoint: v.checkpoint === null ? null : nativeValue('SignedGameCheckpointV1', v.checkpoint), pending_certificate: v.pending_certificate === null ? null : nativeValue('GameCommitmentSetV1', v.pending_certificate), checkpoint_history: list(source.checkpoint_history, 899, value => nativeValue<GameCheckpointAnchorV1>('GameCheckpointAnchorV1', value)), certified_batches: list(source.certified_batches, 900, value => nativeValue<GameCertifiedBatchV1>('GameCertifiedBatchV1', value)), forced_batches: list(v.forced_batches, 900, value => { const b = object(value); const controls = list(b.controls, 8, row => list(row, 6, word => bounded(word, 63))); if (controls.length !== count || controls.some(row => row.length !== 6)) throw new Error('Forced controls do not match the roster.'); const dnf = list(b.dnf_slots, count, slot => bounded(slot, count - 1)); if (dnf.some((slot, i) => i > 0 && dnf[i - 1]! >= slot)) throw new Error('Noncanonical native DNF slots.'); return { epoch: decimal(b.epoch), start_tick: bounded(b.start_tick, 5394), controls, dnf_slots: dnf, certified_frontier_id: b.certified_frontier_id === null ? null : gameCommitment(text(b.certified_frontier_id)) }; }), input_commitments: list(v.input_commitments, 8, item => item === null ? null : gameCommitment(text(item))), input_reveals: list(v.input_reveals, 8, row => row === null ? null : list(row, 6, word => bounded(word, 63))) };
  // Native lobbies retain empty frontiers through Join and cancellation;
  // only Start allocates one commitment/reveal entry per participant.
  const frontierSlots = record.phase.kind === 'lobby' || record.phase.kind === 'cancelled' ? 0 : count;
  if (record.input_commitments.length !== frontierSlots || record.input_reveals.length !== frontierSlots || record.checkpoint && record.checkpoint.checkpoint.session_id !== record.race_id || record.pending_certificate && record.pending_certificate.session_id !== record.race_id) throw new Error('Native race frontier mismatch.');
  const completed = ['settled', 'cancelled'].includes(record.phase.kind);
  if (record.item_stakes.some(item => item.claimed !== completed)) throw new Error('Item transfer state differs from session phase.');
  const admission = raceAdmission(record);
  if (record.phase.kind !== 'lobby' && record.phase.kind !== 'cancelled' && admissionCommitment(record.network_id, record.race_id, admission) !== record.admission_commitment) throw new Error('Admission differs from the immutable roster commitment.');

  return record;
}
/** Exact original admission body; mutable outcome/height fields are not part of this type. */
export function raceAdmission(record: Pick<RaceSummary, 'participants' | 'item_stakes' | 'resources'>): GameAdmissionBodyV1 {
  return validateGameAdmissionBodyV1({ version: 1,
    participants: record.participants.map(p => ({ account: p.account, input_key: p.input_key, application_data: [p.car_id] })),
    wagers: record.item_stakes.map(item => ({ slot: item.slot, nft_id: item.nft_id, metadata_hash: item.metadata_hash })),
    resources: record.resources.map(resource => ({ slot: resource.slot, nft_id: resource.nft_id, metadata_hash: resource.metadata_hash, role_id: resource.role_id, policy: resource.policy })),
  });
}
/** Pin reviewed immutable terms across polls, including polls with an unchanged revision. */
export function assertSameRaceTerms(current: RaceRecord, updated: RaceRecord): void {
  const terms = (record: RaceRecord) => ({ network: record.network_id, session: record.race_id,
    manifest: hex(encodeGameValueV1('GameManifestV1', record.manifest)), manifestHash: record.manifest_commitment,
    profile: record.profile_id, asset: record.asset_definition, stake: record.stake, payoutScale: record.payout_scale });
  const frozenAdmissionChanged = current.phase.kind !== 'lobby' && current.phase.kind !== 'cancelled' && (current.admission_commitment !== updated.admission_commitment || hex(encodeGameValueV1('GameAdmissionBodyV1', raceAdmission(current))) !== hex(encodeGameValueV1('GameAdmissionBodyV1', raceAdmission(updated))));
  if (JSON.stringify(terms(current)) !== JSON.stringify(terms(updated)) || frozenAdmissionChanged) {
    throw new Error('表示済みの対戦条件が変更されたため更新を拒否しました。 / Immutable session terms changed after review; refresh was rejected.');
  }
}
export function parseRaceList(value: unknown, expectedNetworkId: string): { items: RaceSummary[]; nextCursor: string | null } {
  const v = object(value); if (v.version !== 1 || v.network_id !== expectedNetworkId) throw new Error('Native race list network mismatch.');
  return { items: list(v.items, 100, item => parseRaceSummary(item, expectedNetworkId)), nextCursor: v.next_cursor === null ? null : nativeHash(v.next_cursor) };
}
export function raceRoster(record: RaceSummary): RaceParticipant[] { return record.participants.map((p, slot) => ({ slot, account: p.account, inputKeyHex: p.input_key.slice(6).toLowerCase() })); }

/** Create one new active-slot commitment for the current consensus-forced input phase. */
export function forcedRaceInput(record: RaceRecord, slot: number, key: InputKeyPair, controls: number[]): { commitment: GameInputCommitmentV1; reveal: GameInputRevealV1 } {
  const participant = record.participants[slot];
  if (!participant || participant.dnf_at_tick !== null || inputKeyLiteral(key) !== participant.input_key || record.phase.kind !== 'forced_commit') throw new Error('Gameplay key is not active at this forced input frontier.');
  raceInputPayloadV1(controls);
  const nonce = formatGameNonceLiteralV1(crypto.getRandomValues(new Uint8Array(32)));
  const reveal: GameInputRevealV1 = { session_id: record.race_id, scope: activeScope(record.source_record), epoch: record.epoch, start_tick: record.next_tick, slot, payload: raceInputPayloadV1(controls), nonce };
  const body = { session_id: record.race_id, scope: reveal.scope, epoch: record.epoch, start_tick: record.next_tick, slot, commitment: inputDigest(record.network_id, reveal) };
  return { reveal, commitment: { ...body, signature: hex(ed25519.sign(inputSigningFrame(record.network_id, body), key.privateKey)).toUpperCase() } };

}

/** Select already authenticated evidence that is admissible at the exact current native phase. */
export function recoveryInputs(record: RaceRecord, commitments: readonly GameInputCommitmentV1[], reveals: readonly GameInputRevealV1[]): { commitments: GameInputCommitmentV1[]; reveals: GameInputRevealV1[] } {
  const current = (input: { session_id: string; scope: GameActiveScopeV1; epoch: string | number | bigint; start_tick: number; slot: number }) => input.session_id === record.race_id && input.scope.manifest === record.manifest_commitment && input.scope.admission === record.admission_commitment && String(input.epoch) === record.epoch && input.start_tick === record.next_tick && record.participants[input.slot]?.dnf_at_tick === null;
  const selectedCommitments = record.phase.kind === 'forced_commit' ? commitments.filter(input => current(input) && record.input_commitments[input.slot] === null).map(input => {
    const valid = nativeValue<GameInputCommitmentV1>('GameInputCommitmentV1', input), { signature, ...body } = valid;
    const publicKey = record.participants[valid.slot]!.input_key.slice(6);
    if (!ed25519.verify(Uint8Array.from(signature.match(/../g)!, s => parseInt(s, 16)), inputSigningFrame(record.network_id, body), Uint8Array.from(publicKey.match(/../g)!, s => parseInt(s, 16)), { zip215: false })) throw new Error('Recovery input commitment signature is invalid.');
    return valid;
  }) : [];
  const selectedReveals = record.phase.kind === 'forced_reveal' ? reveals.filter(input => current(input) && record.input_reveals[input.slot] === null && record.input_commitments[input.slot] === inputDigest(record.network_id, input)).map(input => nativeValue<GameInputRevealV1>('GameInputRevealV1', input)) : [];
  return { commitments: selectedCommitments, reveals: selectedReveals };
}

/** Endpoint-reported receipt only; finalized settlement still requires authenticated inclusion. */
export interface ExecutionVerificationReceipt { profile_id: string; statement_hash: string; proof_hash: string; verified_at_height: string }
export function parseExecutionVerificationReceipt(value: unknown): ExecutionVerificationReceipt {
  const v = object(value);
  if (Object.keys(v).sort().join(',') !== 'profile_id,proof_hash,statement_hash,verified_at_height') throw new Error('Unexpected native verification receipt fields.');
  const receipt = { profile_id: nativeHash(v.profile_id), statement_hash: nativeHash(v.statement_hash), proof_hash: nativeHash(v.proof_hash), verified_at_height: decimal(v.verified_at_height) };
  if (receipt.verified_at_height === '0') throw new Error('Verification height must be positive.');
  return receipt;
}
