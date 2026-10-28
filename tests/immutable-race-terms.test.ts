import { manifestCommitment } from '../src/chain/certificates';
import { formatGameCommitmentLiteralV1 } from '@iroha/iroha-js/game-certificates';
import { admissionCommitment } from '../src/chain/certificates.ts';
import { currentGameFixtures } from '../scripts/lib/current-game-fixtures.mjs';
import test from 'node:test';
import { AccountAddress } from '@iroha/iroha-js/address';
import { ed25519 } from '@noble/curves/ed25519';
import assert from 'node:assert/strict';
import { gameHashLiteralV1 } from '@iroha/iroha-js/game';
import { assertSameRaceTerms, joinRace, parseRaceList, parseRaceRecord, parseRaceSummary, raceManifest } from '../src/chain/races';
import { RACE_PROFILE_ID } from '../src/game/environment';

const fixtures = currentGameFixtures();
const open = fixtures.vectors.find((row: { name: string }) => row.name === 'OpenGameSessionV1')!.value;
const join = fixtures.vectors.find((row: { name: string }) => row.name === 'JoinGameSessionV1')!.value;
const hash = (byte: number) => gameHashLiteralV1(new Uint8Array(32).fill(byte | 1));
const commitment = (network: string, manifest: ReturnType<typeof raceManifest>) => manifestCommitment(network, open.session_id, manifest);
function nativeLobby() {
  const manifest = raceManifest({ trackId: 0, maxRacers: 2, applicationId: open.manifest.application_id, profileId: RACE_PROFILE_ID });
  return { version: 1, network_id: fixtures.network_id, session_id: open.session_id, profile_id: manifest.profile_id,
    manifest, manifest_commitment: commitment(fixtures.network_id, manifest), stake: '1', asset_definition: open.asset_definition,
    payout_scale: 28, custody: fixtures.vectors.find((row: { name: string }) => row.name === 'GameItemStakeV1')!.value.custody, liability: '0', payout_claims: [], item_stakes: [], resources: [], participants: [], verification_id: null, terminal_at_height: null,
    phase: { kind: 'lobby', value: null }, revision: 1, deadline_height: 100, result: null,
    admission_commitment: null, dispute_commitment: formatGameCommitmentLiteralV1(new Uint8Array(48).fill(29)), epoch: 0, next_tick: 0, checkpoint: null, pending_certificate: null,
    checkpoint_history: [], certified_batches: [], forced_batches: [], input_commitments: [], input_reveals: [] };
}

test('full records cannot display a different manifest than their retained network/profile commitment', () => {
  const raw = nativeLobby(); assert.equal(parseRaceRecord(raw).rules.track.kind, 'neon_tokyo');
  const changedTrack = raceManifest({ trackId: 2, maxRacers: 2, applicationId: raw.manifest.application_id, profileId: raw.profile_id });
  for (const forged of [
    { ...raw, manifest: changedTrack }, { ...raw, manifest_commitment: formatGameCommitmentLiteralV1(new Uint8Array(48).fill(33)) },
    { ...raw, profile_id: hash(35) }, { ...raw, network_id: hash(37) },
  ]) {
    assert.throws(() => parseRaceRecord(forged), /manifest/);
    assert.throws(() => parseRaceSummary(forged), /manifest/);
  }
  const foreign = { ...raw, network_id: hash(39), manifest_commitment: commitment(hash(39), raw.manifest) };
  assert.throws(() => parseRaceRecord(foreign, raw.network_id), /manifest/);
  assert.throws(() => parseRaceSummary(foreign, raw.network_id), /manifest/);
});

test('actual native summary shape remains supported and cannot smuggle partial retained identity', () => {
  const raw = nativeLobby();
  const { network_id, manifest_commitment: _commitment, profile_id: _profile, ...summary } = raw;
  assert.equal(parseRaceList({ version: 1, network_id, items: [summary], next_cursor: null }, network_id).items[0]!.stake, '1');
  assert.throws(() => parseRaceSummary({ ...summary, profile_id: hash(41) }), /native text/);
  assert.throws(() => parseRaceSummary({ ...summary, stake: '-1' }));
  assert.throws(() => parseRaceSummary({ ...summary, asset_definition: 'not-a-native-asset' }));
});

test('same-revision stake substitution cannot replace the terms used to construct Join', () => {
  const raw = nativeLobby(), displayed = parseRaceRecord(raw), incoming = parseRaceRecord({ ...raw, stake: '1000' });
  assert.equal(displayed.revision, incoming.revision); assert.equal(displayed.phase.kind, incoming.phase.kind);
  assert.throws(() => assertSameRaceTerms(displayed, incoming), /Immutable session terms changed/);
  const approved = joinRace(displayed, join.input_key.slice(6).toLowerCase(), 0) as { JoinGameSessionV1: { expected_stake: string; expected_asset_definition: string; expected_manifest_commitment: string } };
  assert.equal(approved.JoinGameSessionV1.expected_stake, '1');
  assert.equal(approved.JoinGameSessionV1.expected_asset_definition, displayed.asset_definition);
  assert.equal(approved.JoinGameSessionV1.expected_manifest_commitment, displayed.manifest_commitment);
});

test('all immutable terms stay pinned while consensus may advance dynamic deadlines and phases', () => {
  const raw = nativeLobby(), current = parseRaceRecord(raw);
  for (const changed of [
    { ...current, network_id: hash(43) }, { ...current, race_id: hash(45) },
    { ...current, manifest_commitment: formatGameCommitmentLiteralV1(new Uint8Array(48).fill(47)) }, { ...current, profile_id: hash(49) },
    { ...current, asset_definition: 'different-asset' }, { ...current, stake: '2' },
    { ...current, payout_scale: 18 },
    { ...current, manifest: { ...current.manifest, application_id: hash(51) } },
  ]) assert.throws(() => assertSameRaceTerms(current, changed), /Immutable session terms changed/);
  const differentTrack = raceManifest({ trackId: 1, maxRacers: 2, applicationId: raw.manifest.application_id, profileId: raw.profile_id });
  const internallyConsistent = parseRaceRecord({ ...raw, manifest: differentTrack, manifest_commitment: commitment(raw.network_id, differentTrack) });
  assert.throws(() => assertSameRaceTerms(current, internallyConsistent), /Immutable session terms changed/);
  const advanced = parseRaceRecord({ ...raw, revision: 2, deadline_height: 200, terminal_at_height: '200', phase: { kind: 'cancelled', value: null } });
  assert.doesNotThrow(() => assertSameRaceTerms(current, advanced));
  assert.doesNotThrow(() => assertSameRaceTerms(current, { ...current, manifest: Object.fromEntries(Object.entries(current.manifest).reverse()) as typeof current.manifest }));
});


test('joined lobbies and cancelled unstarted records retain empty native input frontiers', () => {
  for (const count of [1, 2]) {
    const raw = nativeLobby();
    const participants = Array.from({ length: count }, (_, slot) => {
      const key = ed25519.getPublicKey(new Uint8Array(32).fill(slot + 31));
      return { account: AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey: key }).toI105(),
        input_key: `ed0120${Buffer.from(key).toString('hex').toUpperCase()}`, application_data: [slot], dnf_at_tick: null };
    });
    const joined = { ...raw, participants, liability: String(count) };
    const lobby = parseRaceRecord(joined);
    assert.equal(lobby.participants.length, count);
    assert.deepEqual(lobby.source_record.input_commitments, []);
    assert.deepEqual(lobby.source_record.input_reveals, []);
    const cancelled = parseRaceRecord({ ...joined, phase: { kind: 'cancelled', value: null }, terminal_at_height: '101' });
    assert.equal(cancelled.phase.kind, 'cancelled');
    assert.deepEqual(cancelled.input_commitments, []);
    assert.deepEqual(cancelled.input_reveals, []);
    for (const phase of ['lobby', 'cancelled']) {
      const record = { ...joined, phase: { kind: phase, value: null }, terminal_at_height: phase === 'cancelled' ? '101' : null };
      assert.throws(() => parseRaceRecord({ ...record, input_commitments: Array(count).fill(null), input_reveals: Array(count).fill(null) }), /frontier mismatch/);
      const absent = { ...record } as Record<string, unknown>; delete absent.input_commitments;
      assert.throws(() => parseRaceRecord(absent), /missing or unknown/);
    }
    const started = { ...joined, phase: { kind: 'playing', value: null }, admission_commitment: admissionCommitment(joined.network_id, joined.session_id,
      { version: 1, participants: participants.map(({ account, input_key, application_data }) => ({ account, input_key, application_data })), wagers: [], resources: [] }) };
    assert.throws(() => parseRaceRecord(started), /frontier mismatch/);
    const active = parseRaceRecord({ ...started, input_commitments: Array(count).fill(null), input_reveals: Array(count).fill(null) });
    assert.equal(active.input_commitments.length, count);
    assert.equal(active.input_reveals.length, count);
  }
});
