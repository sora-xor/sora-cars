import { formatGameCommitmentLiteralV1 } from '@iroha/iroha-js/game-certificates';
import { RaceChainClient, type ChainConfig } from '../src/chain/client';
import { buildGameInstructionV1 } from '@iroha/iroha-js/game';
import type { BrowserFeePayment } from '@iroha/iroha-js/transaction-codec';
import type { NftSaleRecordV1 } from '@iroha/iroha-js/nft';
const fixture = await fetch('/fixture').then(response => response.json());
const config: ChainConfig = { ...fixture.config, toriiUrl: location.origin };
let client = new RaceChainClient(config);
const pairingEvents: { phase: string; account: string | null; hasWalletUri: boolean }[] = [];
function observePairing(next: RaceChainClient) {
  next.onState = state => pairingEvents.push({ phase: state.phase, account: state.account, hasWalletUri: state.walletUri !== null });
}
observePairing(client);
const fee: BrowserFeePayment = { payer: 'authority', chargeLimits: [{ kind: 'nexus', assetDefinitionId: fixture.asset, maxAmount: '0.25' }] };
const join = () => buildGameInstructionV1('JoinGameSessionV1', fixture.join);
const stake = () => buildGameInstructionV1('StakeGameItemV1', fixture.stake);
let pending: { done: boolean; error?: string; hash?: string } | null = null;
let pendingPairing: { done: boolean; error?: string; walletUri?: string; account?: string | null } | null = null;
const api = {
  fixture,
  get state() { return client.state; },
  get canStake() { return client.canStake; },
  async probe() { return client.probe(); },
  async connect() { await client.probe(); const session = await client.connect(); await session.waitForApproval; return { account: client.state.account, canStake: client.canStake, walletUri: session.walletUri }; },
  startHeldConnect() {
    pendingPairing = { done: false };
    const state = pendingPairing, attempt = client;
    void attempt.connect().then(async session => {
      state.walletUri = session.walletUri;
      const approval = await session.waitForApproval;
      state.account = approval.accountId;
    }).catch(error => { state.error = String(error); }).finally(() => { state.done = true; });
  },
  get pendingPairing() { return pendingPairing; },
  get pairingEvents() { return pairingEvents; },
  async open() { return client.submit(buildGameInstructionV1('OpenGameSessionV1', { ...fixture.open, manifest: { ...fixture.open.manifest, profile_id: client.config.profileId } }), fee); },
  async openForeignProfile() { return client.submit(buildGameInstructionV1('OpenGameSessionV1', { ...fixture.open, manifest: { ...fixture.open.manifest, profile_id: fixture.foreign } }), fee); },
  async join() { return client.submitJoinWithItem(join(), stake(), fee); },
  async purchase(quote: NftSaleRecordV1 = fixture.quote) { return client.purchaseNft(quote, fee); },
  async settle() { return client.submit(buildGameInstructionV1('SettleGameSessionV1', fixture.settlement), fee); },
  async badBatch(mode: string) {
    if (mode === 'equipment' || mode === 'equipment-wager-overlap') {
      const resources = [{ nft_id: mode === 'equipment' ? 'engine$sora_cars.universal' : fixture.stake.nft_id, expected_metadata_hash: fixture.foreign, role_id: fixture.foreign, policy: { kind: 'return_to_original_owner_at_terminal', value: null } }];
      return client.submitJoinWithItem(buildGameInstructionV1('JoinGameSessionV1', { ...fixture.join, resources }), stake(), fee);
    }
    const altered = mode === 'other-session' ? buildGameInstructionV1('StakeGameItemV1', { ...fixture.stake, session_id: fixture.foreign }) : mode === 'other-manifest' ? buildGameInstructionV1('StakeGameItemV1', { ...fixture.stake, expected_manifest_commitment: formatGameCommitmentLiteralV1(new Uint8Array(48).fill(35)) }) : { ...stake(), ExtraInstruction: {} };
    return client.submitJoinWithItem(join(), altered, fee);
  },
  startHeldJoin() { pending = { done: false }; const state = pending; void api.join().then(result => { state.hash = result.hash; }).catch(error => { state.error = String(error); }).finally(() => { state.done = true; }); },
  startHeldSettlement() { pending = { done: false }; const state = pending; void api.settle().then(result => { state.hash = result.hash; }).catch(error => { state.error = String(error); }).finally(() => { state.done = true; }); },
  get pending() { return pending; },
  disconnect() { client.disconnect(); },
  async reset(override: Partial<ChainConfig> = {}) { client.disconnect(); client = new RaceChainClient({ ...config, ...override }); observePairing(client); },
};
Object.assign(window, { connectHarness: api });
