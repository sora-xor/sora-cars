import { nftContentHashV1, normalizeNftSaleRecordV1 } from '@iroha/iroha-js/nft';
import type { NftInventoryItemV1, NftInventoryV1, NftSaleRecordV1 } from '@iroha/iroha-js/nft';
import { sameAccountIdentity } from './account-identity';

/** Release-reviewed identity; metadata never supplies images, scripts or performance code. */
export interface NftCatalogItem {
  sku: string;
  kind: 'skin' | 'upgrade' | 'music';
  /** Exact native Norito content hash reviewed with this release's local assets. */
  contentHash: string;
  /** Per-collection seller policy survives combining music and cosmetic catalogs. */
  sellers?: readonly string[];
  /** Music primary releases always bind the advertised exact one-XOR price. */
  price?: '1';
}
export interface NftCatalogConfig {
  applicationId: string;
  domain: string;
  xorAssetDefinition: string;
  sellers: readonly string[];
  items: readonly NftCatalogItem[];
}
export interface CatalogNft {
  nftId: string;
  owner: string;
  sku: string;
  kind: NftCatalogItem['kind'];
  contentHash: string;
  verification: 'endpoint_reported';
}
export interface GarageNft extends CatalogNft { kind: 'skin' | 'upgrade' }
export interface MusicNft extends CatalogNft { kind: 'music'; licensor: string }
export interface GarageInventory {
  owner: string;
  items: GarageNft[];
  ignoredItems: number;
  verification: 'endpoint_reported';
}
export interface GarageOffer {
  quote: NftSaleRecordV1;
  item: GarageNft;
  verification: 'endpoint_reported';
}
export interface MusicInventory extends Omit<GarageInventory, 'items'> { items: MusicNft[] }
export interface CatalogOffer extends Omit<GarageOffer, 'item'> { item: CatalogNft }
export interface MusicOffer extends Omit<GarageOffer, 'item'> { item: MusicNft }
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Recognize only the release's reviewed SKU/domain/content binding. Unknown NFTs confer no item. */
export function resolveCatalogNft(nft: NftInventoryItemV1, catalog: NftCatalogConfig): CatalogNft | null {
  const separator = nft.id.indexOf('$');
  if (separator < 1 || nft.id.slice(separator + 1) !== catalog.domain) return null;
  const identity = object(nft.metadata.sora_cars);
  if (!identity || Object.keys(identity).sort().join(',') !== 'application_id,kind,sku,version'
    || identity.version !== 1 || identity.application_id !== catalog.applicationId) return null;
  const matches = catalog.items.filter(item => item.sku === identity.sku && item.kind === identity.kind);
  if (matches.length !== 1) return null;
  const reviewed = matches[0]!;
  if (reviewed.kind === 'music' && reviewed.price !== '1') return null;
  const contentHash = nftContentHashV1(nft.metadata);
  if (contentHash !== reviewed.contentHash) return null;
  const item: CatalogNft = { nftId: nft.id, owner: nft.ownedBy, sku: reviewed.sku, kind: reviewed.kind, contentHash, verification: 'endpoint_reported' };
  if (reviewed.kind === 'music') {
    const licensor = object(nft.metadata.license)?.licensor;
    if (typeof licensor !== 'string' || !licensor.trim() || licensor !== licensor.trim() || licensor.length > 240 || /[\u0000-\u001f\u007f]/.test(licensor)) return null;
    return { ...item, kind: 'music', licensor } as MusicNft;
  }
  return item;
}
/** Songs confer licenses, never cosmetic equipment or native game resources. */
export function resolveGarageNft(nft: NftInventoryItemV1, catalog: NftCatalogConfig): GarageNft | null {
  const item = resolveCatalogNft(nft, catalog);
  return item && item.kind !== 'music' ? item as GarageNft : null;
}
export function resolveMusicNft(nft: NftInventoryItemV1, catalog: NftCatalogConfig): MusicNft | null {
  const item = resolveCatalogNft(nft, catalog);
  return item?.kind === 'music' ? item as MusicNft : null;
}
export function garageInventory(inventory: NftInventoryV1, catalog: NftCatalogConfig): GarageInventory {
  const items = inventory.items.map(nft => resolveGarageNft(nft, catalog)).filter((item): item is GarageNft => item !== null);
  if (items.some(item => !sameAccountIdentity(item.owner, inventory.ownerAccountId))) throw new Error('所有者が一致しません。 / Inventory owner mismatch.');
  return { owner: inventory.ownerAccountId, items, ignoredItems: inventory.items.length - items.length, verification: 'endpoint_reported' };
}
export function musicInventory(inventory: NftInventoryV1, catalog: NftCatalogConfig): MusicInventory {
  const items = inventory.items.map(nft => resolveMusicNft(nft, catalog)).filter((item): item is MusicNft => item !== null);
  if (items.some(item => !sameAccountIdentity(item.owner, inventory.ownerAccountId))) throw new Error('所有者が一致しません。 / Inventory owner mismatch.');
  return { owner: inventory.ownerAccountId, items, ignoredItems: inventory.items.length - items.length, verification: 'endpoint_reported' };
}
/** Match complete immutable native terms to reviewed metadata while the NFT is in custody. */
export function reviewCatalogOffer(raw: unknown, nft: NftInventoryItemV1, catalog: NftCatalogConfig, networkId: string): CatalogOffer {
  const quote = normalizeNftSaleRecordV1(raw, networkId);
  const item = resolveCatalogNft(nft, catalog);
  const reviewed = item && catalog.items.find(entry => entry.sku === item.sku && entry.kind === item.kind);
  if (!item || quote.status.kind !== 'open' || quote.offer.nft_id !== nft.id
      || !sameAccountIdentity(quote.custody, nft.ownedBy) || quote.offer.metadata_hash !== item.contentHash
      || quote.offer.payment_asset !== catalog.xorAssetDefinition || !catalog.sellers.some(seller => sameAccountIdentity(seller, quote.offer.seller))
      || reviewed?.sellers !== undefined && !reviewed.sellers.some(seller => sameAccountIdentity(seller, quote.offer.seller))
      || item.kind === 'music' && quote.offer.price !== '1') {
    throw new Error('この出品は承認済みカタログと一致しません。 / Offer does not match the reviewed catalog.');
  }
  return { quote, item, verification: 'endpoint_reported' };
}
export function reviewGarageOffer(raw: unknown, nft: NftInventoryItemV1, catalog: NftCatalogConfig, networkId: string): GarageOffer {
  const offer = reviewCatalogOffer(raw, nft, catalog, networkId);
  if (offer.item.kind === 'music') throw new Error('楽曲NFTは車庫の装備ではありません。 / Music NFTs are not garage equipment.');
  return offer as GarageOffer;
}
export function reviewMusicOffer(raw: unknown, nft: NftInventoryItemV1, catalog: NftCatalogConfig, networkId: string): MusicOffer {
  const offer = reviewCatalogOffer(raw, nft, catalog, networkId);
  if (offer.item.kind !== 'music') throw new Error('この出品は楽曲NFTではありません。 / This offer is not a music NFT.');
  return offer as MusicOffer;
}
