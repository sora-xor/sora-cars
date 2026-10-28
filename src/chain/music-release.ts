import { buildNftMarketInstructionV1, buildOwnedNftTransferInstructionV1, nftContentHashV1, nftSaleOfferHashV1 } from '@iroha/iroha-js/nft';
import type { NftCatalogConfig } from './inventory';
import { musicItem, musicItemMetadata } from '../game/music-catalog';

/** Offline native issuance inputs. This does not mint, sign, submit or claim an open offer. */
export function prepareMusicEdition(input: {
  catalog: NftCatalogConfig; networkId: string; seller: string; licensor: string;
  sku: string; nftId: string; offerId: string; expiresAtHeight: string;
}) {
  const { catalog, networkId, seller, licensor, sku, nftId, offerId, expiresAtHeight } = input;
  const item = musicItem(sku), reviewed = catalog.items.find(entry => entry.sku === sku && entry.kind === 'music');
  if (!item || !reviewed || reviewed.price !== '1' || !catalog.sellers.includes(seller) || !(reviewed.sellers ?? catalog.sellers).includes(seller)) throw new Error('Edition must use a reviewed music SKU and its authorized seller.');
  if (nftId.slice(nftId.indexOf('$') + 1) !== catalog.domain) throw new Error('Edition NFT must use the released collection domain.');
  buildOwnedNftTransferInstructionV1({ ownerAccountId: seller, nftId, destinationAccountId: seller });
  const metadata = musicItemMetadata(item, catalog.applicationId, licensor);
  const metadataHash = nftContentHashV1(metadata);
  if (metadataHash !== reviewed.contentHash) throw new Error('Edition master, artwork, license or issuer differs from the reviewed release.');
  if (!/^[1-9]\d*$/.test(expiresAtHeight)) throw new Error('Supply an explicit positive future expiry block height.');
  const instruction = buildNftMarketInstructionV1('OfferNftV1', { offer_id: offerId, nft_id: nftId, payment_asset: catalog.xorAssetDefinition, price: '1', expires_at_height: expiresAtHeight, reserved_buyer: null });
  // Native hash construction validates the complete network-bound terms. These
  // are expected terms, not an endpoint record or a claim that custody exists.
  const terms = { network_id: networkId, seller, ...instruction.OfferNftV1, metadata_hash: metadataHash };
  return {
    sku, new_nft: { id: nftId, content: metadata }, content_hash: metadataHash,
    offer_instruction: instruction, expected_offer: terms, expected_offer_hash: nftSaleOfferHashV1(terms),
  };
}
