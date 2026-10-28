import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountAddress } from '@iroha/iroha-js/address';
import { ed25519 } from '@noble/curves/ed25519';
import { nftContentHashV1, nftSaleOfferHashV1, nftMarketProfileIdV1 } from '@iroha/iroha-js/nft';
import type { NftInventoryItemV1, NftSaleRecordV1 } from '@iroha/iroha-js/nft';
import { garageInventory, resolveGarageNft, reviewGarageOffer } from '../src/chain/inventory';
import type { NftCatalogConfig } from '../src/chain/inventory';
import { RaceChainClient } from '../src/chain/client';

const account = (n: number) => AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(n)) }).toI105();
const seller = account(7), custody = account(11);
const applicationId = nftContentHashV1({ application: 'SORA CARS' });
const network = nftContentHashV1({ network: 'fixture' });
const metadata = { sora_cars: { version: 1, application_id: applicationId, sku: 'aki-sakura', kind: 'skin' }, description: '桜のボディ / Sakura body' };
const contentHash = nftContentHashV1(metadata);
const catalog: NftCatalogConfig = { applicationId, domain: 'sora_cars.universal', xorAssetDefinition: '62Fk4FPcMuLvW5QjDGNF2a4jAmjM', sellers: [seller], items: [{ sku: 'aki-sakura', kind: 'skin', contentHash }] };
const nft: NftInventoryItemV1 = { id: 'skin_0001$sora_cars.universal', ownedBy: custody, metadata };
function quote(): NftSaleRecordV1 {
  const offer = { network_id: network, offer_id: nftContentHashV1({ offer: 1 }), nft_id: nft.id, seller, payment_asset: catalog.xorAssetDefinition, price: '5', expires_at_height: '100', reserved_buyer: null, metadata_hash: contentHash };
  return { version: 1, offer, offer_hash: nftSaleOfferHashV1(offer), custody, status: { kind: 'open', value: null }, created_at_height: '1', closed_at_height: null };
}
test('garage recognizes reviewed SKU/domain/native content hashes, ignoring externally named NFT images', () => {
  assert.equal(resolveGarageNft(nft, catalog)?.sku, 'aki-sakura');
  for (const altered of [
    { ...nft, id: 'skin_0001$forged.universal' },
    { ...nft, metadata: { ...metadata, image: 'https://attacker.invalid/script.svg' } },
    { ...nft, metadata: { sora_cars: { ...metadata.sora_cars, application_id: nftContentHashV1({ forged: 1 }) } } },
    { ...nft, metadata: { sora_cars: { ...metadata.sora_cars, sku: 'unknown' } } },
  ]) assert.equal(resolveGarageNft(altered, catalog), null);
  const inventory = garageInventory({ ownerAccountId: custody, verification: 'endpoint_reported', items: [nft, { ...nft, id: 'forged$other.universal' }] }, catalog);
  assert.equal(inventory.items.length, 1); assert.equal(inventory.ignoredItems, 1); assert.equal(inventory.verification, 'endpoint_reported');
});
test('checkout binds exact price terms to pinned sellers, payment denomination, content and native custody owner', () => {
  assert.equal(reviewGarageOffer(quote(), nft, catalog, network).quote.offer.price, '5');
  assert.throws(() => reviewGarageOffer(quote(), { ...nft, ownedBy: seller }, catalog, network), /カタログ/);
  assert.throws(() => reviewGarageOffer(quote(), nft, { ...catalog, sellers: [] }, network), /カタログ/);
  assert.throws(() => reviewGarageOffer(quote(), nft, { ...catalog, xorAssetDefinition: 'different' }, network), /カタログ/);
  assert.throws(() => reviewGarageOffer({ ...quote(), status: { kind: 'cancelled', value: null }, closed_at_height: '2' }, nft, catalog, network), /カタログ/);
  assert.throws(() => reviewGarageOffer(quote(), nft, catalog, nftContentHashV1({ foreign: 1 })), /network/);
});
test('NFT purchase readiness requires a reviewed local release and exact qualified native policy', async () => {
  const base = { toriiUrl: 'https://test.example', networkId: network, nftCatalog: catalog, nftMarketProfileId: nftMarketProfileIdV1(), nftMarketQualified: true };
  const capabilities = { version: 1, native_nft_market: true, network_id: network, protocol_id: nftMarketProfileIdV1(), qualified: true };
  const make = (raw: unknown, override = {}) => new RaceChainClient({ ...base, ...override, fetchImpl: async () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'application/json' } }) });
  const ready = make(capabilities); assert.equal((await ready.probeNftMarket()).ready, true);
  for (const qualified of [false, 'true', 1, undefined]) {
    const client = make({ ...capabilities, qualified }); assert.equal((await client.probeNftMarket()).ready, false);
  }
  for (const local of [{ nftMarketQualified: false }, { nftMarketProfileId: undefined }, { nftCatalog: undefined }]) {
    const client = make(capabilities, local); assert.equal((await client.probeNftMarket()).ready, false);
  }
  const wrongNetwork = make({ ...capabilities, network_id: nftContentHashV1({ foreign: 1 }) });
  assert.equal((await wrongNetwork.probeNftMarket()).ready, false);
});
