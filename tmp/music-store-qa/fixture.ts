import '/src/style.css';
import '/src/ui/music-store.css';
import { MusicStore } from '/src/ui/music-store.ts';
import { MUSIC_ITEMS, musicItemMetadata } from '/src/game/music-catalog.ts';
import { releaseMusicCatalog } from '/src/chain/catalog.ts';
import { reviewMusicOffer, resolveMusicNft } from '/src/chain/inventory.ts';
import { AccountAddress } from '@iroha/iroha-js/address';
import { ed25519 } from '@noble/curves/ed25519';
import { buildNftMarketInstructionV1, nftContentHashV1, nftSaleOfferHashV1 } from '@iroha/iroha-js/nft';

const account = n => AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(n)) }).toI105();
const buyer = account(23), seller = account(7), custody = account(11), other = account(31);
const network = nftContentHashV1({ network: 'EXPLICIT MUSIC STORE TEST FIXTURE' });
const app = nftContentHashV1({ app: 'EXPLICIT MUSIC STORE TEST FIXTURE' });
const licensor = 'Explicit test fixture issuer';
const requestedSong = new URLSearchParams(location.search).get('song');
const song = requestedSong ? MUSIC_ITEMS.find(item => item.file === requestedSong) : MUSIC_ITEMS[0];
if (!song) throw new Error('Unknown explicitly requested music fixture song.');
const catalog = releaseMusicCatalog(JSON.stringify({ domain: 'sora_cars.universal', sellers: [seller], licensor }), app, '62Fk4FPcMuLvW5QjDGNF2a4jAmjM');
const metadata = musicItemMetadata(song, app, licensor);
const nft = { id: 'music_store_fixture_1$sora_cars.universal', ownedBy: custody, metadata };
const offer = { network_id: network, offer_id: nftContentHashV1({ fixture: 'music store offer' }), nft_id: nft.id, seller, payment_asset: catalog.xorAssetDefinition, price: '1', expires_at_height: '100', reserved_buyer: null, metadata_hash: nftContentHashV1(metadata) };
let quote = { version: 1, offer, offer_hash: nftSaleOfferHashV1(offer), custody, status: { kind: 'open', value: null }, created_at_height: '1', closed_at_height: null };
let items = [], active = true, qualified = true, delivered = false, listingFails = false, inventoryFails = false;
let gate = null, releaseGate = null, gateTarget = null, ownerReads = 0, failOwnerRead = 0;
const errors = [], notifications = [], purchases = [], attempts = [];
let finished = 0;
async function pause(target) { if (gateTarget === target) await gate; }
const ownedRecord = () => ({ ...nft, ownedBy: buyer });
const makeClient = () => ({
  config: { toriiUrl: 'https://fixture.invalid', networkId: network, nftCatalog: catalog }, state: { account: buyer },
  listOwnedNfts: async () => { await pause('inventory'); if (inventoryFails) throw new Error('Explicit inventory fixture failure'); return { ownerAccountId: buyer, verification: 'endpoint_reported', items: [...items] }; },
  listNftOffers: async () => { if (listingFails) throw new Error('Explicit listing fixture failure'); return { items: quote.status.kind === 'open' ? [quote] : [], nextCursor: null, hasMore: false }; },
  getNftOffer: async id => { await pause('review'); if (id !== quote.offer.offer_id) throw new Error('Wrong offer ID'); return quote; },
  reviewMusicNftOffer: async q => reviewMusicOffer(q, nft, catalog, network),
  probeNftMarket: async () => ({ ready: qualified, reason: qualified ? 'Explicit qualified fixture only' : 'Explicit unqualified fixture' }),
  getOwnedMusicNft: async id => {
    ownerReads++; const result = items.find(item => item.id === id);
    await pause('ownership');
    if (!result || failOwnerRead === ownerReads) throw new Error('Music NFT ownership could not be established.');
    return resolveMusicNft(result, catalog);
  },
  purchaseNft: async (q, fee) => {
    attempts.push({ price: q.offer.price, offerHash: q.offer_hash });
    if (!qualified) throw new Error('Native purchase qualification required');
    if (q.offer_hash !== quote.offer_hash || quote.status.kind !== 'open') throw new Error('Offer changed or closed.');
    reviewMusicOffer(q, nft, catalog, network);
    purchases.push({ quote: structuredClone(q), fee: structuredClone(fee), instruction: buildNftMarketInstructionV1('BuyNftV1', { offer: q.offer }) });
    quote = { ...quote, status: { kind: 'purchased', value: buyer }, closed_at_height: '2' };
    if (delivered) items = [ownedRecord()];
    await pause('purchase');
    return { hash: offer.offer_id, status: { fixture: true } };
  },
});
let client = makeClient();
const dialog = document.querySelector('#dialog'), body = document.querySelector('#dialog-body');
const store = new MusicStore({ client: () => client, screen: document.querySelector('#screen'), active: () => active,
  showDialog: html => { body.innerHTML = html; dialog.showModal(); }, closeDialog: () => dialog.close(), notify: message => notifications.push(message) });
store.render();
const run = action => { void store.action(action).catch(error => errors.push(error.message)).finally(() => finished++); };
window.musicStoreHarness = {
  run, refresh: () => run('refresh'), store, song, buyer, seller, custody, licensor, offerId: offer.offer_id,
  view: () => ({ state: store.state, finished, errors: [...errors], notifications: [...notifications], purchases: structuredClone(purchases), attempts: [...attempts], ownerReads }),
  qualify: value => { qualified = value; }, deliver: () => { delivered = true; items = [ownedRecord()]; }, loseOwnership: () => { items = []; },
  failOwnershipRead: n => { failOwnerRead = n; }, failListings: value => { listingFails = value; }, failInventory: value => { inventoryFails = value; },
  beginGate: target => { gateTarget = target; gate = new Promise(resolve => { releaseGate = resolve; }); },
  release: () => { gateTarget = null; releaseGate?.(); },
  replaceClient: () => { client = makeClient(); store.invalidate(); },
  changeWallet: () => { client.state.account = other; store.invalidate(); },
  disconnect: () => { client.state.account = null; store.invalidate(); },
  reconnectSameWallet: () => { client.state.account = buyer; store.invalidate(); store.render(); },
  leave: () => { active = false; store.close(); },
  reenter: () => { active = true; store.render(); },
  replaceDialog: () => { body.innerHTML = '<h2 id="replacement-modal">A NEWER MODAL</h2>'; dialog.showModal(); },
  closeDialog: () => dialog.close(),
  changeOfferPrice: price => { const changed = { ...quote.offer, price }; quote = { ...quote, offer: changed, offer_hash: nftSaleOfferHashV1(changed) }; },
};
window.render_game_to_text = () => JSON.stringify({ mode: 'soundtrack', fixture: 'Explicit mocked wallet/ledger only', records: store.state });
window.advanceTime = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(1000, Number(ms) || 0))));
