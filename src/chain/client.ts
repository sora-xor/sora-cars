import {
  createConnectSessionPreview, registerConnectSession, createConnectAppSession,
  NetworkId,
  validateConnectTransactionTransportStatus,
} from '@iroha/iroha-js/connect-browser';
import type { BrowserConnectAppSession, BrowserConnectApproval } from '@iroha/iroha-js/connect-browser';
import {
  buildBrowserInstructionTransactionPayload, finalizeBrowserInstructionTransaction,
  validateBrowserInstructionTransactionSignable,
  browserTransactionPayloadHashHex,
} from '@iroha/iroha-js/transaction-codec';
import type { BrowserFeePayment } from '@iroha/iroha-js/transaction-codec';
import { ToriiBrowserClient } from '@iroha/iroha-js/torii-browser';
import type { ToriiBrowserExplorerOwnedDomainOptions } from '@iroha/iroha-js/torii-browser';
import { buildGameInstructionV1, encodeGameValueV1, decodeGameValueV1 } from '@iroha/iroha-js/game';
import type { GameInstructionPayloadsV1, JoinGameSessionV1 } from '@iroha/iroha-js/game';
import {
  buildBrowserOwnedNftTransferPayloadV1, buildNftMarketInstructionV1,
  normalizeNftInventoryItemV1, normalizeNftSaleRecordV1, readOwnedNftInventoryV1, nftMarketProfileIdV1,
} from '@iroha/iroha-js/nft';
import type { NftInventoryV1, NftSaleRecordV1 } from '@iroha/iroha-js/nft';
import { resolveMusicNft, reviewCatalogOffer, reviewGarageOffer, reviewMusicOffer } from './inventory';
import { sameAccountIdentity } from './account-identity';
import { japaneseMessage, japaneseError } from '../ui/language';
import { RACE_PROFILE_ID } from '../game/environment';
import provenance from '../game/generated/provenance.json';
import type { NftCatalogConfig, GarageOffer, MusicNft, MusicOffer } from './inventory';

// Release evidence is bundled with the simulator; endpoint reports cannot qualify it.
const RELEASE_PROOF_QUALIFIED = provenance.cryptographicQualification === true;

export type ChainPhase = 'unconfigured' | 'checking' | 'unavailable' | 'ready' | 'pairing' | 'connected' | 'signing' | 'submitted';
export interface RaceCapability {
  version: number;
  enabled: boolean;
  /** Endpoint-reported status of the selected profile, not local release qualification. */
  proof_qualified: boolean;
  /** Endpoint-reported transport readiness; independent of consensus proof validity. */
  execution_transport_ready: boolean;
  network_id: string;
  [field: string]: unknown;
}
export interface ChainState {
  phase: ChainPhase;
  account: string | null;
  walletUri: string | null;
  reason: string | null;
  transactionHash: string | null;
  capability: RaceCapability | null;
}
export interface ChainConfig {
  toriiUrl: string;
  /** Release-pinned identity. Never copy a network ID from an arbitrary server response. */
  networkId?: string;
  /** Exact compiled application proof profile pinned by this release. */
  profileId?: string;
  /** SORA CARS application namespace used to filter the shared game platform. */
  applicationId?: string;
  appName?: string;
  appUrl?: string;
  fetchImpl?: typeof fetch;
  /** Exact reviewed SKU/domain/content identities and authorized primary sellers. */
  nftCatalog?: NftCatalogConfig;
  /** Explicit reviewed release policy; neither setting is inferred from a Torii response. */
  nftMarketProfileId?: string;
  nftMarketQualified?: boolean;
}

export async function boundedJson(fetchImpl: typeof fetch, url: string, maximumBytes = 1024 * 1024): Promise<unknown> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(japaneseMessage(`Torii returned HTTP ${response.status} for ${new URL(url).pathname}.`));
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error(japaneseMessage('Torii did not return JSON.'));
  const reader = response.body?.getReader();
  if (!reader) throw new Error(japaneseMessage('Torii returned an empty body.'));
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) throw new Error(japaneseMessage('Torii response exceeds the bounded read limit.'));
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Wallet keys remain inside the wallet. Torii supplies transport, never transaction bytes to sign. */
export class RaceChainClient {
  readonly config: ChainConfig;
  readonly state: ChainState;
  onState: (state: Readonly<ChainState>) => void = () => {};
  #nftMarketReady = false;
  nftMarketReason = 'NFT市場はまだ有効化されていません。 / NFT marketplace is not activated.';
  get canPurchaseNfts(): boolean { return this.#nftMarketReady && this.config.nftMarketQualified === true && this.config.nftMarketProfileId === nftMarketProfileIdV1() && this.config.nftCatalog !== undefined; }
  #session: BrowserConnectAppSession | null = null;
  #registration: AbortController | null = null;
  #approval: BrowserConnectApproval | null = null;
  #generation = 0;
  #transaction: symbol | null = null;
  #fetch: typeof fetch;
  #network: NetworkId | null;

  constructor(config: ChainConfig) {
    const endpoint = new URL(config.toriiUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if (endpoint.username || endpoint.password || (!local && endpoint.protocol !== 'https:')) throw new Error(japaneseMessage('Torii requires HTTPS outside localhost and cannot contain credentials.'));
    if (endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error(japaneseMessage('Torii URL must be an origin.'));
    this.config = { ...config, toriiUrl: endpoint.origin };
    this.#fetch = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#network = config.networkId ? NetworkId.parse(config.networkId) : null;
    this.state = { phase: this.#network ? 'unavailable' : 'unconfigured', account: null, walletUri: null, reason: this.#network ? null : japaneseMessage('A release-pinned Taira network identity is required for wallet signing.'), transactionHash: null, capability: null };
  }

  #update(patch: Partial<ChainState>) { Object.assign(this.state, patch); this.onState(Object.freeze({ ...this.state })); }
  get signingPublicKey(): Uint8Array | null { return this.#approval ? this.#approval.signingPublicKey.slice() : null; }
  get canStake(): boolean { return RELEASE_PROOF_QUALIFIED && this.state.capability?.enabled === true && this.state.capability.proof_qualified === true && this.state.capability.execution_transport_ready === true && this.#network !== null && this.config.profileId === RACE_PROFILE_ID; }

  async probe(): Promise<Readonly<ChainState>> {
    this.#update({ phase: 'checking', reason: null, capability: null });
    try {
      const raw = await boundedJson(this.#fetch, `${this.config.toriiUrl}/v1/games/capabilities`);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(japaneseMessage('Malformed native racing capability response.'));
      const value = raw as Record<string, unknown>;
      if (value.version !== 1 || typeof value.enabled !== 'boolean' || value.native_game_sessions !== true || !Array.isArray(value.profiles) || value.profiles.length > 64 || typeof value.network_id !== 'string') throw new Error(japaneseMessage('The node does not advertise the native game-session V1 interface.'));
      if (!this.#network) throw new Error(japaneseMessage('This build has no release-pinned Taira network identity; signing remains disabled.'));
      if (NetworkId.parse(value.network_id).toString() !== this.#network.toString()) throw new Error(japaneseMessage('Endpoint network identity differs from this release.'));
      const profiles = value.profiles;
      const descriptor = profiles.find((p: unknown) => p && typeof p === 'object' && (p as { profile_id?: unknown }).profile_id === this.config.profileId) as { qualified?: unknown } | undefined;
      const capability = { ...value, proof_qualified: descriptor?.qualified === true && this.config.profileId === RACE_PROFILE_ID, execution_transport_ready: value.execution_transport_ready === true } as RaceCapability;
      const reason = !RELEASE_PROOF_QUALIFIED
        ? 'このアプリに同梱された実行証明は暗号学的な安全性の審査が未完了です。XORを賭ける対戦は無効です。 / This app’s bundled execution proof is not cryptographically qualified. XOR stakes are disabled.'
        : !capability.enabled || !capability.proof_qualified
        ? japaneseMessage('This release’s native execution proof profile is not qualified. XOR stakes are disabled.')
        : !capability.execution_transport_ready
          ? japaneseMessage('This endpoint cannot yet carry complete execution proof transactions. XOR stakes are disabled.')
          : null;
      this.#update({ capability, phase: this.#approval ? 'connected' : 'ready', reason });
    } catch (error) {
      this.#update({ phase: 'unavailable', reason: japaneseError(error) });
    }
    return Object.freeze({ ...this.state });
  }

  async connect(): Promise<{ walletUri: string; waitForApproval: Promise<BrowserConnectApproval> }> {
    if (!this.#network) throw new Error(japaneseMessage('Wallet connection requires the release-pinned network identity.'));
    this.disconnect();
    const generation = ++this.#generation;
    const registration = new AbortController();
    this.#registration = registration;
    this.#update({ phase: 'pairing', account: null, walletUri: null, reason: null });
    try {
      const preview = createConnectSessionPreview({ networkId: this.#network, node: this.config.toriiUrl });
      const signal = AbortSignal.any([registration.signal, AbortSignal.timeout(12_000)]);
      const registered = await registerConnectSession(this.config.toriiUrl, preview, {
        fetchImpl: (input, init) => this.#fetch(input, { ...init, signal }), node: this.config.toriiUrl,
      });
      if (generation !== this.#generation) throw new Error(japaneseMessage('Wallet connection was cancelled.'));
      const session = createConnectAppSession({
        baseUrl: this.config.toriiUrl, preview, session: registered,
        permissions: { methods: ['sign_transaction'], events: [], resources: [] },
        appMeta: { name: this.config.appName ?? 'SORA CARS', url: this.config.appUrl ?? (typeof location === 'undefined' ? null : location.origin) },
        allowInsecure: new URL(this.config.toriiUrl).protocol === 'http:',
      });
      this.#session = session;
      // The SDK has validated every field against our locally generated session.
      // Native wallet QR parsers require this canonical scheme without launcher rewriting.
      const walletUri = registered.wallet_uri;
      this.#update({ phase: 'pairing', account: null, walletUri, reason: null });
      const waitForApproval = session.waitForApproval().then((approval) => {
        if (generation !== this.#generation) throw new Error(japaneseMessage('Wallet approval belongs to a closed session.'));
        this.#approval = approval;
        this.#update({ phase: 'connected', account: approval.accountId, walletUri: null });
        return approval;
      }).catch((error: unknown) => {
        if (generation === this.#generation) {
          ++this.#generation;
          this.#session = null; this.#approval = null;
          // A rejected SDK session can already be closed logically while its socket is open.
          session.close(); session.socket.close();
          this.#update({ phase: 'unavailable', account: null, walletUri: null, reason: japaneseError(error) });
        }
        throw error;
      });
      // The UI may still be rendering its QR code when the wallet rejects or closes.
      void waitForApproval.catch(() => {});
      session.socket.addEventListener('close', () => {
        if (generation === this.#generation) { ++this.#generation; this.#transaction = null; this.#approval = null; this.#session = null; this.#update({ phase: 'ready', account: null, walletUri: null, reason: japaneseMessage('Wallet session closed.') }); }
      });
      return { walletUri, waitForApproval };
    } catch (error) {
      if (generation === this.#generation) this.#update({ phase: 'unavailable', account: null, walletUri: null, reason: japaneseError(error) });
      throw error;
    } finally {
      if (this.#registration === registration) this.#registration = null;
    }
  }

  disconnect(): void {
    ++this.#generation;
    this.#registration?.abort(); this.#registration = null;
    this.#transaction = null;
    this.#session?.close('Disconnected by SORA CARS');
    this.#session = null; this.#approval = null;
    this.#update({ phase: this.#network ? 'ready' : 'unconfigured', account: null, walletUri: null });
  }

  async submit(instruction: object, feePayment: BrowserFeePayment): Promise<{ hash: string; status: unknown }> {
    if (!this.#session || !this.#approval || !this.#network) throw new Error(japaneseMessage('Approve the wallet connection first.'));
    const kinds = Object.keys(instruction);
    if (kinds.length === 1 && kinds[0] === 'OpenGameSessionV1') {
      const body = (buildGameInstructionV1('OpenGameSessionV1', decodeGameValueV1('OpenGameSessionV1', encodeGameValueV1('OpenGameSessionV1', (instruction as { OpenGameSessionV1: unknown }).OpenGameSessionV1)) as GameInstructionPayloadsV1['OpenGameSessionV1']) as { OpenGameSessionV1: { manifest: { profile_id: string } } }).OpenGameSessionV1;
      if (body.manifest.profile_id !== this.config.profileId) throw new Error('対戦のプロファイルがこのリリースと一致しません。 / Session profile differs from this release.');
    }
    if (kinds.length === 1 && kinds[0] === 'JoinGameSessionV1') {
      const join = buildGameInstructionV1('JoinGameSessionV1', decodeGameValueV1('JoinGameSessionV1', encodeGameValueV1('JoinGameSessionV1', (instruction as { JoinGameSessionV1: unknown }).JoinGameSessionV1)) as GameInstructionPayloadsV1['JoinGameSessionV1']) as { JoinGameSessionV1: JoinGameSessionV1 };
      if (join.JoinGameSessionV1.resources.length) throw new Error('性能装備は認定済みの専用クラスで利用できます。 / Equipment needs a qualified class; stock entry authorizes no equipment.');
      instruction = join;
    }
    const recovery = kinds.length === 1 && ['CommitGameCheckpointV1', 'ChallengeGameSessionV1', 'CommitGameInputsV1', 'RevealGameInputsV1', 'AdvanceGameDeadlineV1', 'ExpireGameSessionV1', 'ClaimGamePayoutV1'].includes(kinds[0]!);
    if (!this.canStake && !recovery) throw new Error(this.state.reason ?? japaneseMessage('The native execution profile or transaction transport is not ready; stake and settlement signing is disabled.'));
    const payloadBytes = buildBrowserInstructionTransactionPayload({ networkId: this.#network, authority: this.#approval.accountId, instructions: [instruction], feePayment, creationTimeMs: Date.now(), ttlMs: 120_000 });
    return this.#signAndSubmit(payloadBytes);
  }

  /** Joining and reserving the selected NFT must either both commit or both fail. */
  async submitJoinWithItem(joinInstruction: object, stakeInstruction: object, feePayment: BrowserFeePayment): Promise<{ hash: string; status: unknown }> {
    if (!this.#session || !this.#approval || !this.#network) throw new Error('ウォレットを接続してください。 / Connect your wallet first.');
    if (!this.canStake) throw new Error(this.state.reason ?? 'このリリースでは対戦への参加を承認できません。 / Staked sessions are not ready for this release.');
    if (!joinInstruction || !stakeInstruction || Object.keys(joinInstruction).join() !== 'JoinGameSessionV1' || Object.keys(stakeInstruction).join() !== 'StakeGameItemV1') {
      throw new Error('参加とNFT預託の組み合わせだけを承認できます。 / Only a join followed by an NFT stake is allowed.');
    }
    const join = buildGameInstructionV1('JoinGameSessionV1', decodeGameValueV1('JoinGameSessionV1', encodeGameValueV1('JoinGameSessionV1', (joinInstruction as { JoinGameSessionV1: unknown }).JoinGameSessionV1)) as GameInstructionPayloadsV1['JoinGameSessionV1']);
    const stake = buildGameInstructionV1('StakeGameItemV1', decodeGameValueV1('StakeGameItemV1', encodeGameValueV1('StakeGameItemV1', (stakeInstruction as { StakeGameItemV1: unknown }).StakeGameItemV1)) as GameInstructionPayloadsV1['StakeGameItemV1']);
    const joinBody = (join as { JoinGameSessionV1: JoinGameSessionV1 }).JoinGameSessionV1;
    const stakeBody = (stake as { StakeGameItemV1: { session_id: string; nft_id: string; expected_manifest_commitment: string } }).StakeGameItemV1;
    if (joinBody.resources.some(resource => resource.nft_id === stakeBody.nft_id)) throw new Error('一時装備と勝負品に同じNFTは使えません。 / Equipment and wagers must use different NFTs.');
    if (joinBody.resources.length) throw new Error('性能装備は認定済みの専用クラスで利用できます。 / Equipment needs a qualified class; stock entry authorizes no equipment.');
    if (joinBody.session_id !== stakeBody.session_id) throw new Error('参加先とNFT預託先の対戦が一致しません。 / Join and NFT stake must target the same session.');
    if (joinBody.expected_manifest_commitment !== stakeBody.expected_manifest_commitment) throw new Error('参加とNFT預託の対戦条件が一致しません。 / Join and NFT stake must approve the same manifest.');
    const generation = this.#generation, account = this.#approval.accountId;
    const nft = normalizeNftInventoryItemV1(await this.#inventoryTorii().getExplorerNft(stakeBody.nft_id));
    if (generation !== this.#generation || account !== this.#approval?.accountId) throw new Error('ウォレット接続が変更されました。 / Wallet connection changed.');
    if (nft.id !== stakeBody.nft_id || nft.ownedBy !== account) throw new Error('選んだNFTを接続中のウォレットが所有していません。 / The connected wallet does not own the selected NFT.');
    if (this.config.nftCatalog && resolveMusicNft(nft, this.config.nftCatalog)) throw new Error('楽曲NFTはレースに預けられません。 / Music NFTs cannot be deposited in a race.');
    const payloadBytes = buildBrowserInstructionTransactionPayload({ networkId: this.#network, authority: account, instructions: [join, stake], feePayment, creationTimeMs: Date.now(), ttlMs: 120_000 });
    return this.#signAndSubmit(payloadBytes);
  }

  async #signAndSubmit(payloadBytes: Uint8Array): Promise<{ hash: string; status: unknown }> {
    if (!this.#session || !this.#approval || !this.#network) throw new Error('ウォレットを接続してください。 / Connect your wallet first.');
    if (this.#transaction !== null) throw new Error('現在の取引が完了するまでお待ちください。 / Wait for the current transaction.');
    const session = this.#session;
    const approval = this.#approval;
    const generation = this.#generation;
    const signable = { networkId: this.#network, authority: approval.accountId, signingPublicKey: approval.signingPublicKey, payloadBytes, payloadHashHex: browserTransactionPayloadHashHex(payloadBytes) };
    validateBrowserInstructionTransactionSignable(signable);
    const transaction = Symbol('wallet transaction');
    this.#transaction = transaction;
    this.#update({ phase: 'signing', reason: null, transactionHash: null });
    try {
      if (payloadBytes.byteLength > 64_000) {
        validateConnectTransactionTransportStatus(await boundedJson(this.#fetch, `${this.config.toriiUrl}/v1/connect/status`), payloadBytes.byteLength);
      }
      if (generation !== this.#generation || session !== this.#session || approval !== this.#approval) throw new Error(japaneseMessage('Wallet session changed during signing.'));
      const signature = await session.signTransaction(payloadBytes);
      if (generation !== this.#generation) throw new Error(japaneseMessage('Wallet session changed during signing.'));
      const finalized = finalizeBrowserInstructionTransaction(signable, signature, approval.signingPublicKey);
      this.#update({ phase: 'submitted', transactionHash: finalized.hashHex });
      const torii = new ToriiBrowserClient(this.config.toriiUrl, { networkId: this.#network, fetchImpl: this.#fetch });
      const status = await torii.submitTransactionAndWait(finalized.signedTransaction, { timeoutMs: 120_000, hashHex: finalized.hashHex });
      if (generation === this.#generation) this.#update({ phase: 'connected' });
      return { hash: finalized.hashHex, status };
    } catch (error) {
      if (generation === this.#generation) this.#update({ phase: this.#approval ? 'connected' : 'ready', reason: japaneseError(error) });
      throw error;
    } finally {
      if (this.#transaction === transaction) this.#transaction = null;
    }
  }

  #inventoryTorii(): ToriiBrowserClient {
    if (!this.#network) throw new Error('承認済みネットワーク設定が必要です。 / A release-pinned network is required.');
    return new ToriiBrowserClient(this.config.toriiUrl, { networkId: this.#network, fetchImpl: this.#fetch, allowInsecure: new URL(this.config.toriiUrl).protocol === 'http:' });
  }
  async probeNftMarket(): Promise<{ ready: boolean; reason: string }> {
    this.#nftMarketReady = false;
    try {
      if (!this.#network || this.config.nftMarketQualified !== true || this.config.nftMarketProfileId !== nftMarketProfileIdV1() || !this.config.nftCatalog) {
        throw new Error('このリリースではNFT購入が承認されていません。 / NFT purchases are not qualified for this release.');
      }
      const raw = await boundedJson(this.#fetch, `${this.config.toriiUrl}/v1/nft-offers/capabilities`) as Record<string, unknown>;
      if (!raw || raw.version !== 1 || raw.native_nft_market !== true || raw.network_id !== this.#network.toString() || raw.protocol_id !== this.config.nftMarketProfileId || raw.qualified !== true) {
        throw new Error('ノードのNFT市場は承認済みリリースと一致しません。 / Native marketplace is not qualified for the pinned release.');
      }
      this.#nftMarketReady = true;
      this.nftMarketReason = 'NFT市場の準備ができています。 / Native NFT marketplace is ready.';
    } catch (error) {
      this.nftMarketReason = `NFT購入を有効化できません。 / NFT purchases unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
    return { ready: this.canPurchaseNfts, reason: this.nftMarketReason };
  }
  async listOwnedNfts(): Promise<NftInventoryV1> {
    if (!this.#approval) throw new Error('ウォレットを接続してください。 / Connect your wallet first.');
    const generation = this.#generation, owner = this.#approval.accountId;
    const torii = this.#inventoryTorii();
    const inventory = await readOwnedNftInventoryV1({
      async listExplorerNfts<T>(options?: ToriiBrowserExplorerOwnedDomainOptions) {
        const page = await torii.listExplorerNfts<T>(options);
        if (!Array.isArray(page.items) || page.items.length > Number(options?.limit ?? 100)) return page;
        return { ...page, items: page.items.map(value => {
          // Validate the untouched record before aligning its owner display label.
          // The SDK still enforces page bounds, cursors, unique IDs and domain.
          const item = normalizeNftInventoryItemV1(value);
          return sameAccountIdentity(item.ownedBy, owner) ? Object.assign({}, value, { owned_by: owner }) : value;
        }) };
      },
    }, { ownerAccountId: owner, domain: this.config.nftCatalog?.domain });
    if (generation !== this.#generation || owner !== this.#approval?.accountId) throw new Error('ウォレット接続が変更されました。 / Wallet connection changed.');
    return inventory;
  }
  /** Download controls recheck exact released metadata and the current wallet's ownership. */
  async getOwnedMusicNft(nftId: string): Promise<MusicNft> {
    if (!this.#approval || !this.config.nftCatalog) throw new Error('承認済み楽曲コレクションとウォレット接続が必要です。 / Connect a wallet with a released music collection.');
    const generation = this.#generation, owner = this.#approval.accountId;
    const nft = normalizeNftInventoryItemV1(await this.#inventoryTorii().getExplorerNft(nftId));
    if (generation !== this.#generation || owner !== this.#approval?.accountId) throw new Error('ウォレット接続が変更されました。 / Wallet connection changed.');
    const item = resolveMusicNft(nft, this.config.nftCatalog);
    if (!item || nft.id !== nftId || !sameAccountIdentity(item.owner, owner)) throw new Error('この楽曲NFTの所有を確認できません。 / Music NFT ownership could not be established.');
    return item;
  }
  async getNftOffer(offerId: string): Promise<NftSaleRecordV1> {
    if (!this.#network) throw new Error('承認済みネットワーク設定が必要です。 / A release-pinned network is required.');
    // The codec validates the checked hash syntax before it becomes a URL component.
    buildNftMarketInstructionV1('CancelNftOfferV1', { offer_id: offerId, expected_offer_hash: offerId });
    const quote = normalizeNftSaleRecordV1(await boundedJson(this.#fetch, `${this.config.toriiUrl}/v1/nft-offers/${encodeURIComponent(offerId)}`), this.#network.toString());
    if (quote.offer.offer_id !== offerId) throw new Error('出品IDが一致しません。 / Offer ID mismatch.');
    return quote;
  }
  async listNftOffers(nftId?: string, cursor?: string): Promise<{ items: NftSaleRecordV1[]; nextCursor: string | null; hasMore: boolean }> {
    if (!this.#network) throw new Error('承認済みネットワーク設定が必要です。 / A release-pinned network is required.');
    const params = new URLSearchParams();
    if (nftId) params.set('nft_id', nftId);
    if (cursor) { buildNftMarketInstructionV1('CancelNftOfferV1', { offer_id: cursor, expected_offer_hash: cursor }); params.set('cursor', cursor); }
    const raw = await boundedJson(this.#fetch, `${this.config.toriiUrl}/v1/nft-offers${params.size ? `?${params}` : ''}`) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || Object.keys(raw).sort().join(',') !== 'has_more,items,network_id,next_cursor,version' || raw.version !== 1 || raw.network_id !== this.#network.toString()
      || !Array.isArray(raw.items) || raw.items.length > 32 || typeof raw.has_more !== 'boolean' || (raw.next_cursor !== null && typeof raw.next_cursor !== 'string')
      || raw.has_more !== (raw.next_cursor !== null) || raw.next_cursor !== null && raw.next_cursor === cursor) throw new Error('出品一覧を検証できません。 / Invalid offer page.');
    if (typeof raw.next_cursor === 'string') buildNftMarketInstructionV1('CancelNftOfferV1', { offer_id: raw.next_cursor, expected_offer_hash: raw.next_cursor });
    const items = raw.items.map(value => normalizeNftSaleRecordV1(value, this.#network!.toString()));
    if (new Set(items.map(item => item.offer.offer_id)).size !== items.length || items.some(item => item.status.kind !== 'open' || nftId !== undefined && item.offer.nft_id !== nftId)) throw new Error('出品一覧が検索条件と一致しません。 / Offer page does not match its query.');
    return { items, nextCursor: raw.next_cursor as string | null, hasMore: raw.has_more };
  }
  async reviewNftOffer(quote: NftSaleRecordV1): Promise<GarageOffer> {
    if (!this.config.nftCatalog || !this.#network) throw new Error('承認済みNFTカタログが必要です。 / A reviewed NFT catalog is required.');
    const nft = normalizeNftInventoryItemV1(await this.#inventoryTorii().getExplorerNft(quote.offer.nft_id));
    return reviewGarageOffer(quote, nft, this.config.nftCatalog, this.#network.toString());
  }
  async reviewMusicNftOffer(quote: NftSaleRecordV1): Promise<MusicOffer> {
    if (!this.config.nftCatalog || !this.#network) throw new Error('承認済みNFTカタログが必要です。 / A reviewed NFT catalog is required.');
    const nft = normalizeNftInventoryItemV1(await this.#inventoryTorii().getExplorerNft(quote.offer.nft_id));
    return reviewMusicOffer(quote, nft, this.config.nftCatalog, this.#network.toString());
  }
  async purchaseNft(quote: NftSaleRecordV1, feePayment: BrowserFeePayment): Promise<{ hash: string; status: unknown }> {
    if (!this.#approval || !this.#network) throw new Error('ウォレットを接続してください。 / Connect your wallet first.');
    const generation = this.#generation;
    await this.probeNftMarket();
    if (!this.canPurchaseNfts) throw new Error(this.nftMarketReason);
    const expected = normalizeNftSaleRecordV1(quote, this.#network.toString());
    const latest = await this.getNftOffer(expected.offer.offer_id);
    if (latest.offer_hash !== expected.offer_hash || latest.status.kind !== 'open') throw new Error('出品が変更または終了しました。 / Offer changed or closed.');
    const nft = normalizeNftInventoryItemV1(await this.#inventoryTorii().getExplorerNft(latest.offer.nft_id));
    reviewCatalogOffer(latest, nft, this.config.nftCatalog!, this.#network.toString());
    if (generation !== this.#generation || !this.#approval) throw new Error('ウォレット接続が変更されました。 / Wallet session changed.');
    if (latest.offer.reserved_buyer !== null && !sameAccountIdentity(latest.offer.reserved_buyer, this.#approval.accountId)) throw new Error('この出品は別の購入者向けです。 / Offer is reserved for another buyer.');
    const instruction = buildNftMarketInstructionV1('BuyNftV1', { offer: latest.offer });
    const bytes = buildBrowserInstructionTransactionPayload({ networkId: this.#network, authority: this.#approval.accountId, instructions: [instruction], feePayment, creationTimeMs: Date.now(), ttlMs: 120_000 });
    return this.#signAndSubmit(bytes);
  }
  async transferOwnedNft(nftId: string, destination: string, feePayment: BrowserFeePayment): Promise<{ hash: string; status: unknown }> {
    if (!this.#approval || !this.#network) throw new Error('ウォレットを接続してください。 / Connect your wallet first.');
    const generation = this.#generation, owner = this.#approval.accountId;
    const nft = normalizeNftInventoryItemV1(await this.#inventoryTorii().getExplorerNft(nftId));
    if (nft.id !== nftId || !sameAccountIdentity(nft.ownedBy, owner)) throw new Error('このNFTは接続中のウォレットが所有していません。 / Connected wallet does not own this NFT.');
    if (generation !== this.#generation) throw new Error('ウォレット接続が変更されました。 / Wallet session changed.');
    return this.#signAndSubmit(buildBrowserOwnedNftTransferPayloadV1({ networkId: this.#network, authority: owner, nftId, destinationAccountId: destination, feePayment, creationTimeMs: Date.now(), ttlMs: 120_000 }));
  }

  listRaces(status?: string): Promise<unknown> {
    const params = new URLSearchParams();
    if (status) params.set('status', status === 'racing' ? 'playing' : status);
    if (this.config.applicationId) params.set('application_id', this.config.applicationId);
    if (this.config.profileId) params.set('profile_id', this.config.profileId);
    const query = params.size ? `?${params}` : '';
    return boundedJson(this.#fetch, `${this.config.toriiUrl}/v1/games/sessions${query}`);
  }
  getVerificationReceipt(verificationId: string): Promise<unknown> {
    return boundedJson(this.#fetch, `${this.config.toriiUrl}/v1/games/verifications/${encodeURIComponent(verificationId)}`);
  }
  getRace(raceId: string): Promise<unknown> {
    return boundedJson(this.#fetch, `${this.config.toriiUrl}/v1/games/sessions/${encodeURIComponent(raceId)}`);
  }
}
