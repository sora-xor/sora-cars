import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NetworkId, createConnectSessionPreview } from '@iroha/iroha-js/connect-browser';
import { RaceChainClient } from '../src/chain/client';
import { releaseNetworkId, TAIRA_NETWORK_ID, TAIRA_TORII_URL } from '../src/chain/taira';

test('unconfigured app builds bind Connect to the native public Taira genesis identity', () => {
  const deployment = JSON.parse(readFileSync(new URL('../../iroha/configs/soranexus/taira/explorer.runtime-config.json', import.meta.url), 'utf8'));
  assert.equal(TAIRA_NETWORK_ID, deployment.networkId);
  assert.equal(TAIRA_TORII_URL, deployment.toriiBaseUrl);
  for (const override of [undefined, '']) {
    const networkId = releaseNetworkId(override);
    assert.equal(NetworkId.parse(networkId).toString(), deployment.networkId);
    const preview = createConnectSessionPreview({ networkId: NetworkId.parse(networkId), node: TAIRA_TORII_URL });
    assert.equal(preview.networkId.toString(), deployment.networkId);
    const client = new RaceChainClient({ networkId, toriiUrl: TAIRA_TORII_URL });
    assert.notEqual(client.state.phase, 'unconfigured');
    assert.equal(client.canStake, false, 'pairing readiness cannot qualify a game profile');
  }
});

test('a replacement endpoint cannot change the bundled network binding', async () => {
  const foreign = JSON.parse(readFileSync(new URL('../../iroha/javascript/iroha_js/test/fixtures/game-v1-codec.json', import.meta.url), 'utf8')).network_id;
  assert.notEqual(foreign, TAIRA_NETWORK_ID);
  const client = new RaceChainClient({ toriiUrl: 'https://alternative.example', networkId: releaseNetworkId(), fetchImpl: async () => Response.json({ version: 1, enabled: true, native_game_sessions: true, network_id: foreign, profiles: [] }) });
  await client.probe();
  assert.match(client.state.reason!, /Endpoint network identity differs/);
  assert.equal(client.canStake, false);
  assert.equal(releaseNetworkId(foreign), foreign, 'reviewed build-time deployments can supply an explicit pin');
});
