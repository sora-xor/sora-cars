import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountAddress } from '@iroha/iroha-js/address';
import { ed25519 } from '@noble/curves/ed25519';
import { nftContentHashV1, nftSaleOfferHashV1 } from '@iroha/iroha-js/nft';
import type { NftInventoryItemV1, NftSaleRecordV1 } from '@iroha/iroha-js/nft';
import { garageInventory, musicInventory, resolveMusicNft, reviewCatalogOffer, reviewGarageOffer, reviewMusicOffer } from '../src/chain/inventory';
import type { NftCatalogConfig } from '../src/chain/inventory';
import { mergeNftCatalogs } from '../src/chain/catalog';
import { validateClubAppearance } from '../src/game/catalog';
import { RaceChainClient } from '../src/chain/client';

const account = (n: number) => AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(n)) }).toI105();
const seller = account(7), custody = account(11), cosmeticSeller = account(13);
const applicationId = nftContentHashV1({ application: 'music-market-fixture' });
const network = nftContentHashV1({ network: 'music-market-fixture' });
const metadata = {
  sora_cars: { version: 1, application_id: applicationId, sku: 'music-fixture', kind: 'music' },
  title: 'An explicitly synthetic test song',
  audio: { sha256: 'a'.repeat(64), path: 'assets/music/audio/fixture.wav' },
  artwork: { sha256: 'b'.repeat(64), path: 'assets/music/covers/fixture.png' },
  license: { sha256: 'c'.repeat(64), path: 'assets/music/fixture-license.txt', licensor: 'Fixture issuer only' },
};
const contentHash = nftContentHashV1(metadata);
const catalog: NftCatalogConfig = { applicationId, domain: 'sora_cars.universal', xorAssetDefinition: '62Fk4FPcMuLvW5QjDGNF2a4jAmjM', sellers: [seller], items: [{ sku: 'music-fixture', kind: 'music', contentHash, price: '1', sellers: [seller] }] };
const nft: NftInventoryItemV1 = { id: 'music_fixture_0001$sora_cars.universal', ownedBy: custody, metadata };
function quote(changes: Partial<NftSaleRecordV1['offer']> = {}): NftSaleRecordV1 {
  const offer = { network_id: network, offer_id: nftContentHashV1({ offer: 'music-fixture' }), nft_id: nft.id, seller, payment_asset: catalog.xorAssetDefinition, price: '1', expires_at_height: '100', reserved_buyer: null, metadata_hash: contentHash, ...changes };
  return { version: 1, offer, offer_hash: nftSaleOfferHashV1(offer), custody, status: { kind: 'open', value: null }, created_at_height: '1', closed_at_height: null };
}

test('a music sale binds exactly one XOR, the pinned network, seller, edition and asset', () => {
  assert.equal(reviewMusicOffer(quote(), nft, catalog, network).quote.offer.price, '1');
  assert.equal(reviewMusicOffer(quote(), nft, catalog, network).item.licensor, 'Fixture issuer only');
  for (const changes of [
    { price: '0.1' }, { price: '1.0000000000000000000000000001' }, { price: '2' },
    { seller: cosmeticSeller }, { nft_id: 'another_edition$sora_cars.universal' },
    { metadata_hash: nftContentHashV1({ replaced: true }) },
    { network_id: nftContentHashV1({ foreign: true }) },
  ]) assert.throws(() => reviewMusicOffer(quote(changes), nft, catalog, network));
  assert.throws(() => reviewMusicOffer(quote(), nft, { ...catalog, xorAssetDefinition: 'unreviewed-asset' }, network));
  assert.throws(() => reviewMusicOffer(quote(), { ...nft, ownedBy: seller }, catalog, network));
  assert.throws(() => reviewMusicOffer({ ...quote(), status: { kind: 'cancelled', value: null }, closed_at_height: '2' }, nft, catalog, network));
});

test('changes to song master, art, license or issuer invalidate the entire NFT content binding', () => {
  assert.equal(resolveMusicNft(nft, catalog)?.sku, 'music-fixture');
  for (const replacement of [
    { ...metadata, audio: { ...metadata.audio, sha256: 'd'.repeat(64) } },
    { ...metadata, artwork: { ...metadata.artwork, sha256: 'd'.repeat(64) } },
    { ...metadata, license: { ...metadata.license, sha256: 'd'.repeat(64) } },
    { ...metadata, license: { ...metadata.license, licensor: 'Another issuer' } },
    { ...metadata, extra_license_terms: 'additional restrictions' },
  ]) assert.equal(resolveMusicNft({ ...nft, metadata: replacement }, catalog), null);
  assert.equal(resolveMusicNft({ ...nft, id: 'music_fixture_0001$other.universal' }, catalog), null);
  assert.equal(resolveMusicNft(nft, { ...catalog, items: [{ ...catalog.items[0]!, price: undefined }] }), null);
});

test('owned music never enters garage equipment or wager pickers and never grants another wallet access', () => {
  const inventory = { ownerAccountId: custody, verification: 'endpoint_reported' as const, items: [nft] };
  assert.equal(musicInventory(inventory, catalog).items.length, 1);
  assert.equal(garageInventory(inventory, catalog).items.length, 0);
  assert.throws(() => musicInventory({ ...inventory, ownerAccountId: seller }, catalog), /owner mismatch/);
  assert.throws(() => reviewGarageOffer(quote(), nft, catalog, network), /not garage equipment/);
  assert.throws(() => validateClubAppearance({ skin: 'music-fixture', upgrade: null }), /Unknown cosmetic/);
  assert.throws(() => validateClubAppearance({ skin: null, upgrade: 'music-fixture' }), /Unknown cosmetic/);
});

test('combining releases cannot authorize cosmetic sellers to sell music or mix network asset identities', () => {
  const cosmetics: NftCatalogConfig = { ...catalog, sellers: [cosmeticSeller], items: [{ sku: 'skin-fixture', kind: 'skin', contentHash: nftContentHashV1({ skin: true }) }] };
  const combined = mergeNftCatalogs(cosmetics, catalog)!;
  assert.equal(combined.items.length, 2);
  assert.equal(reviewCatalogOffer(quote(), nft, combined, network).item.kind, 'music');
  assert.throws(() => reviewCatalogOffer(quote({ seller: cosmeticSeller }), nft, combined, network));
  for (const changes of [{ domain: 'another.universal' }, { applicationId: nftContentHashV1({ app: 2 }) }, { xorAssetDefinition: 'other' }]) assert.throws(() => mergeNftCatalogs(catalog, { ...cosmetics, ...changes }), /must share/);
  assert.throws(() => mergeNftCatalogs(catalog, catalog), /Duplicate/);
  assert.equal(mergeNftCatalogs(undefined, undefined), undefined);
});

test('native client reviews music independently of cosmetics and does not trust a displayed account as wallet approval', async () => {
  const client = new RaceChainClient({ toriiUrl: 'https://fixture.example', networkId: network, nftCatalog: catalog, fetchImpl: async () => new Response(JSON.stringify({ id: nft.id, owned_by: nft.ownedBy, metadata: nft.metadata }), { headers: { 'content-type': 'application/json' } }) });
  assert.equal((await client.reviewMusicNftOffer(quote())).item.kind, 'music');
  await assert.rejects(client.reviewNftOffer(quote()), /not garage equipment/);
  client.state.account = custody;
  await assert.rejects(client.getOwnedMusicNft(nft.id), /Connect a wallet/);
  await assert.rejects(client.purchaseNft(quote(), { payer: 'authority', chargeLimits: [{ kind: 'nexus', assetDefinitionId: catalog.xorAssetDefinition, maxAmount: '1' }] }), /Connect your wallet/);
});
