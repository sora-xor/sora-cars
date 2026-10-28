import test from 'node:test';
import assert from 'node:assert/strict';
import { currentGameFixtures } from '../scripts/lib/current-game-fixtures.mjs';
import { encodeRaceFrameV1, decodeRaceFrameV1 } from '@iroha/iroha-js/race';
import { NetworkId, gameCertificateCommitmentV1 } from '@iroha/iroha-js/game-certificates';
import { certificateScope } from '../src/chain/certificates';

// Required fresh Rust-exported fixtures, never browser-authored expected bytes.
const corpus = currentGameFixtures();
const value = (name: string) => {
  const rows = corpus.vectors.filter(row => row.name === name);
  assert.equal(rows.length, 1, `required unique native ${name}`);
  return rows[0]!.value;
};
test('framed state binding matches the native semantic checkpoint commitment', () => {
  const checkpoint = value('GameCheckpointV1'), payload = value('RaceProofPayloadV1');
  const matches = payload.checkpoint_states.filter((state: { tick: number }) => state.tick === checkpoint.tick);
  assert.equal(matches.length, 1, 'exactly one retained native state matches the selected checkpoint');
  const selectedState = matches[0];
  assert.equal(payload.final_state.tick, 6);
  assert.equal(checkpoint.tick, 12, 'accepted history extends beyond physical completion');
  const frame = encodeRaceFrameV1('RaceStateV1', selectedState);
  const root = gameCertificateCommitmentV1({ networkId: NetworkId.parse(corpus.network_id), sessionId: NetworkId.parse(checkpoint.session_id).toBytes() }, 3,
    { scope: certificateScope(checkpoint.scope), tick: checkpoint.tick, adapter_state: frame });
  assert.equal(root, checkpoint.state_root);
  assert.deepEqual(decodeRaceFrameV1('RaceStateV1', frame), selectedState);
  const wrongStateRoot = gameCertificateCommitmentV1({ networkId: NetworkId.parse(corpus.network_id), sessionId: NetworkId.parse(checkpoint.session_id).toBytes() }, 3,
    { scope: certificateScope(checkpoint.scope), tick: checkpoint.tick, adapter_state: encodeRaceFrameV1('RaceStateV1', payload.final_state) });
  assert.notEqual(wrongStateRoot, checkpoint.state_root, 'physical finish state cannot replace the accepted checkpoint state');
});
test('economic outcome frame equals the exact native canonical settlement bytes', () => {
  const economic = value('RaceSettlementResultV1');
  const row = corpus.vectors.find(row => row.name === 'RaceSettlementResultV1')!;
  assert.equal(Buffer.from(encodeRaceFrameV1('RaceSettlementResultV1', economic)).toString('hex').toUpperCase(), row.framed_hex);
  assert.deepEqual(decodeRaceFrameV1('RaceSettlementResultV1', Buffer.from(row.framed_hex, 'hex')), economic);
});
