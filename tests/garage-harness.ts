import { releaseClubCatalog } from '../src/chain/catalog';
import '../src/style.css';
import '../src/ui/story-workshop.css';
import { ClubGarage } from '../src/ui/garage';
import { CLUB_ITEMS, clubItemMetadata } from '../src/game/catalog';
import { buildNftMarketInstructionV1, nftContentHashV1, nftSaleOfferHashV1 } from '@iroha/iroha-js/nft';
import type { RaceChainClient } from '../src/chain/client';
import type { NftInventoryItemV1, NftSaleRecordV1 } from '@iroha/iroha-js/nft';
import type { BrowserFeePayment } from '@iroha/iroha-js/transaction-codec';
import { reviewGarageOffer } from '../src/chain/inventory';
declare global { interface Window { nativeGarageFixture: { network_id: string; vectors: { name: string; value: unknown }[] } } }
const fixture = window.nativeGarageFixture;
if (!fixture) throw new Error('Actual native current-wire fixture must be supplied by the test runner.');
const open = fixture.vectors.find(v => v.name === 'OpenGameSessionV1')!.value as unknown as { asset_definition: string; manifest: { application_id: string } };
const body = fixture.vectors.find(v => v.name === 'GameAdmissionBodyV1')!.value as unknown as { participants: { account: string }[] };
const owner = body.participants[0]!.account;
const catalog = releaseClubCatalog(JSON.stringify({ domain: 'sora_cars.universal', sellers: [owner] }), open.manifest.application_id, open.asset_definition)!;
const inventory: NftInventoryItemV1[] = [{ id: 'owned_0001$sora_cars.universal', ownedBy: owner, metadata: clubItemMetadata(CLUB_ITEMS[0]!, catalog.applicationId) }];
const saleNft = { id: 'sale_0002$sora_cars.universal', ownedBy: owner, metadata: clubItemMetadata(CLUB_ITEMS[1]!, catalog.applicationId) };
const offer = { network_id: fixture.network_id, offer_id: nftContentHashV1({ fixture: 'shop-offer' }), nft_id: saleNft.id, seller: owner, payment_asset: open.asset_definition, price: '12.5', expires_at_height: '100', reserved_buyer: null, metadata_hash: nftContentHashV1(saleNft.metadata) };
let quote: NftSaleRecordV1 = { version: 1, offer, offer_hash: nftSaleOfferHashV1(offer), custody: owner, status: { kind: 'open', value: null }, created_at_height: '1', closed_at_height: null };
const messages: string[] = [], purchases: { instruction: object; fee: BrowserFeePayment }[] = [];
const purchaseAttempts: { price: string; offerHash: string }[] = [];
let qualified = false;
const client = {
  config: { nftCatalog: catalog }, state: { account: owner as string | null },
  listOwnedNfts: async () => ({ ownerAccountId: owner, verification: 'endpoint_reported', items: inventory }),
  listNftOffers: async () => ({ items: quote.status.kind === 'open' ? [quote] : [], nextCursor: null, hasMore: false }),
  getNftOffer: async (id: string) => { if (id !== offer.offer_id) throw new Error('Offer lookup lost its canonical hash.'); return quote; },
  reviewNftOffer: async (q: NftSaleRecordV1) => reviewGarageOffer(q, saleNft, catalog, fixture.network_id),
  probeNftMarket: async () => ({ ready: qualified, reason: qualified ? null : '購入準備中 / MARKET NOT QUALIFIED' }),
  purchaseNft: async (q: NftSaleRecordV1, fee: BrowserFeePayment) => {
    if (!qualified) throw new Error('Qualification required');
    purchaseAttempts.push({ price: q.offer.price, offerHash: q.offer_hash });
    // Explicit mocked ledger revalidation, matching the production client's
    // immutable quote check before its wallet request is constructed.
    if (q.offer_hash !== quote.offer_hash || quote.status.kind !== 'open') throw new Error('出品が変更または終了しました。 / Offer changed or closed.');
    purchases.push({ instruction: buildNftMarketInstructionV1('BuyNftV1', { offer: q.offer }), fee });
    quote = { ...quote, status: { kind: 'purchased', value: owner }, closed_at_height: '2' };
    inventory.push(saleNft); return { hash: offer.offer_id, status: {} };
  },
};
let currentClient = client;
const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
const garage = new ClubGarage({ client: () => currentClient as unknown as RaceChainClient, screen: document.querySelector('#screen')!, active: () => true, showDialog: html => { document.querySelector('#dialog-body')!.innerHTML = html; dialog.showModal(); }, closeDialog: () => dialog.close(), notify: m => messages.push(m) });
garage.render();
Object.assign(window, { garageHarness: { garage, client, messages, purchases, purchaseAttempts, qualify: () => { qualified = true; }, loseItems: () => { inventory.length = 0; }, close: () => dialog.close(), replacePrice: (price: string) => { const changed = { ...quote.offer, price }; quote = { ...quote, offer: changed, offer_hash: nftSaleOfferHashV1(changed) }; }, replaceClient: () => { currentClient = { ...client, state: { ...client.state } }; }, disconnect: () => { currentClient.state.account = null; } } });
