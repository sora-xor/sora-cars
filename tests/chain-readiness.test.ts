import test from 'node:test';
import assert from 'node:assert/strict';
import { nftMarketProfileIdV1 } from '@iroha/iroha-js/nft';
import { RaceChainClient, checkWalletTransactionTransport } from '../src/chain/client';
import { CONNECT_SIGN_REQUEST_TX_FRAME_OVERHEAD_V1, NetworkId } from '@iroha/iroha-js/connect-browser';
import { EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1 } from '@iroha/iroha-js/game';
import { TAIRA_NETWORK_ID } from '../src/chain/taira';
import { RACE_PROFILE_ID } from '../src/game/environment';
import provenance from '../src/game/generated/provenance.json';

const endpoint = 'https://test.example';
const config = { toriiUrl: endpoint, networkId: TAIRA_NETWORK_ID, profileId: RACE_PROFILE_ID };
const localReason = /bundled execution proof is not cryptographically qualified/;

test('endpoint qualification cannot enable staking in the unqualified bundled release', async () => {
  assert.equal(provenance.cryptographicQualification, false, 'test the actual release evidence without overriding it');
  for (const enabled of [false, true]) for (const qualified of [false, true]) for (const execution_transport_ready of [false, true]) {
    const report = { version: 1, enabled, native_game_sessions: true, network_id: TAIRA_NETWORK_ID,
      profiles: [{ profile_id: RACE_PROFILE_ID, qualified }], execution_transport_ready,
      proof_qualified: true, cryptographicQualification: true, localProofQualified: true };
    const client = new RaceChainClient({ ...config, fetchImpl: async () => Response.json(report) });
    const state = await client.probe();
    assert.equal(client.canStake, false);
    assert.match(state.reason!, localReason);
    assert.equal(state.phase, 'ready', 'wallet availability is independent of staking admission');
    assert.equal(state.capability?.enabled, enabled);
    assert.equal(state.capability?.proof_qualified, qualified);
    assert.equal(state.capability?.execution_transport_ready, execution_transport_ready);
  }
});

test('large wallet frames refresh public V1 game capabilities on the pinned network', async () => {
  const network = NetworkId.parse(TAIRA_NETWORK_ID);
  const ordinaryPayload = 64_000 - CONNECT_SIGN_REQUEST_TX_FRAME_OVERHEAD_V1;
  const report = { version: 1, native_game_sessions: true, enabled: true, profiles: [],
    network_id: TAIRA_NETWORK_ID, execution_transport_ready: true };
  let current: Record<string, unknown> = report;
  let reads = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    reads++;
    assert.equal(String(url), `${endpoint}/v1/games/capabilities`);
    assert.equal(init?.method ?? 'GET', 'GET');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.cache, 'no-store');
    assert.deepEqual([...new Headers(init?.headers)], [['accept', 'application/json']]);
    return Response.json(current);
  };
  const check = (size: number) => checkWalletTransactionTransport(size, fetchImpl, endpoint, network);
  await check(ordinaryPayload);
  assert.equal(reads, 0);
  await check(ordinaryPayload + 1);
  await check(EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1);
  assert.equal(reads, 2);
  for (const invalidSize of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1 + 1]) {
    await assert.rejects(check(invalidSize), RangeError);
  }
  assert.equal(reads, 2);
  for (const change of [
    { execution_transport_ready: false }, { execution_transport_ready: undefined },
    { execution_transport_ready: 'true' }, { enabled: false }, { native_game_sessions: false },
    { version: 2 }, { profiles: null }, { network_id: RACE_PROFILE_ID }, { network_id: 'invalid' },
  ]) {
    current = { ...report, ...change };
    await assert.rejects(check(ordinaryPayload + 1));
  }
  assert.equal(reads, 11);
});

test('an unqualified race release still attempts a network-bound wallet connection', async () => {
  let registration: { network_id: string } | undefined;
  const client = new RaceChainClient({ ...config, fetchImpl: async (input, init) => {
    assert.equal(String(input), `${endpoint}/v1/connect/session`);
    registration = JSON.parse(String(init?.body));
    return Response.json({ error: 'Test endpoint unavailable' }, { status: 503 });
  } });
  await assert.rejects(client.connect());
  assert.equal(registration?.network_id, TAIRA_NETWORK_ID, 'local race qualification must not block wallet pairing');
  assert.equal(client.canStake, false);
  client.disconnect();
});

test('race qualification does not replace the independent marketplace readiness policy', async () => {
  const nftMarketProfileId = nftMarketProfileIdV1();
  const nftCatalog = { applicationId: RACE_PROFILE_ID, domain: 'sora_cars.universal',
    xorAssetDefinition: '62Fk4FPcMuLvW5QjDGNF2a4jAmjM', sellers: [], items: [] };
  for (const nftMarketQualified of [false, true]) {
    let requests = 0;
    const client = new RaceChainClient({ ...config, nftCatalog, nftMarketProfileId, nftMarketQualified,
      fetchImpl: async input => {
        assert.equal(String(input), `${endpoint}/v1/nft-offers/capabilities`);
        requests++;
        return Response.json({ version: 1, native_nft_market: true, network_id: TAIRA_NETWORK_ID, protocol_id: nftMarketProfileId, qualified: true });
      } });
    assert.equal((await client.probeNftMarket()).ready, nftMarketQualified);
    assert.equal(client.canPurchaseNfts, nftMarketQualified);
    assert.equal(requests, nftMarketQualified ? 1 : 0);
    assert.equal(client.canStake, false, 'market readiness cannot qualify race execution');
  }
});
