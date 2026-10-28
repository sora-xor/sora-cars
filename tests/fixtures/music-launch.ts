import { AccountAddress } from '@iroha/iroha-js/address';
import { ed25519 } from '@noble/curves/ed25519';
import { nftContentHashV1, nftMarketProfileIdV1, nftSaleOfferHashV1 } from '@iroha/iroha-js/nft';
import { releaseMusicCatalog } from '../../src/chain/catalog';
import type { MusicLaunchSnapshot } from '../../src/chain/music-launch';
import { MUSIC_ITEMS, musicItemMetadata } from '../../src/game/music-catalog';
export { nftContentHashV1, nftSaleOfferHashV1 };

/** Synthetic public records over the actual build metadata; no issued NFTs. */
export function createMusicLaunchFixture() {
  const account = (n: number) => AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(n)) }).toI105();
  const seller = account(7), custody = account(11), outsider = account(13);
  const applicationId = nftContentHashV1({ app: 'synthetic launch fixture' });
  const networkId = nftContentHashV1({ network: 'synthetic launch fixture' });
  const licensor = 'Synthetic launch fixture issuer only';
  const catalog = releaseMusicCatalog(JSON.stringify({ domain: 'sora_cars.universal', sellers: [seller], licensor }), applicationId, '62Fk4FPcMuLvW5QjDGNF2a4jAmjM');
  if (!catalog) throw new Error('Actual music catalog must be complete for launch fixtures.');
  const snapshot = {
    config: { networkId, nftCatalog: catalog, nftMarketQualified: true, nftMarketProfileId: nftMarketProfileIdV1() },
    capability: { version: 1, native_nft_market: true, network_id: networkId, protocol_id: nftMarketProfileIdV1(), qualified: true },
    observedHeight: '20',
    editions: MUSIC_ITEMS.map((song, index) => {
      const metadata = musicItemMetadata(song, applicationId, licensor);
      const nft = { id: `music_launch_${index + 1}_1$${catalog.domain}`, ownedBy: custody, metadata };
      const offer = { network_id: networkId, offer_id: nftContentHashV1({ launch_fixture: song.sku }), nft_id: nft.id, seller,
        payment_asset: catalog.xorAssetDefinition, price: '1', expires_at_height: '100', reserved_buyer: null, metadata_hash: nftContentHashV1(metadata) };
      return { sku: song.sku, nft, offer: { version: 1, offer, offer_hash: nftSaleOfferHashV1(offer), custody,
        status: { kind: 'open', value: null }, created_at_height: '1', closed_at_height: null } };
    }),
  } satisfies MusicLaunchSnapshot;
  return { snapshot, seller, custody, outsider };
}
