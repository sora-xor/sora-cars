import { buildNftMarketInstructionV1, buildOwnedNftTransferInstructionV1, nftContentHashV1 } from '@iroha/iroha-js/nft';
import { encodeGameValueV1 } from '@iroha/iroha-js/game';
import type { NftCatalogConfig } from './inventory';
import { CLUB_ITEMS, clubItemMetadata } from '../game/catalog';
import { MUSIC_ITEMS, musicItemMetadata } from '../game/music-catalog';

function parseReleaseCollection(raw: string, applicationId: string | undefined, xorAssetDefinition: string | undefined, music: boolean) {
  if (!applicationId || !xorAssetDefinition) throw new Error('NFTカタログには承認済みアプリとXOR設定が必要です。 / Catalog needs pinned application and XOR identities.');
  encodeGameValueV1('RegisterExecutionProofProfileV1', { profile_id: applicationId });
  if (raw.length > 16_384) throw new Error('NFT catalog configuration is too large.');
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== (music ? 'domain,licensor,sellers' : 'domain,sellers') || typeof value.domain !== 'string' || !/^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/.test(value.domain) || !Array.isArray(value.sellers) || value.sellers.length < 1 || value.sellers.length > 32 || value.sellers.some((s: unknown) => typeof s !== 'string' || !s || s.length > 512) || new Set(value.sellers).size !== value.sellers.length) throw new Error('承認済みコレクション設定が無効です。 / Invalid release collection configuration.');
  if (music && (typeof value.licensor !== 'string' || !value.licensor.trim() || value.licensor !== value.licensor.trim() || value.licensor.length > 256 || /[\u0000-\u001f\u007f]/.test(value.licensor))) throw new Error('楽曲の権利許諾者名が必要です。 / Music collection needs the named licensor.');
  const sellers = value.sellers as string[];
  for (const seller of sellers) buildOwnedNftTransferInstructionV1({ ownerAccountId: seller, nftId: `catalog$${value.domain}`, destinationAccountId: seller });
  buildNftMarketInstructionV1('OfferNftV1', { offer_id: applicationId, nft_id: `catalog$${value.domain}`, payment_asset: xorAssetDefinition, price: '1', expires_at_height: '1', reserved_buyer: null });
  return { applicationId, xorAssetDefinition, domain: value.domain as string, sellers, licensor: value.licensor as string | undefined };
}

/** Only build-time release input can identify the collection and its primary sellers. */
export function releaseClubCatalog(raw: string | undefined, applicationId: string | undefined, xorAssetDefinition: string | undefined): NftCatalogConfig | undefined {
  if (!raw) return undefined;
  const { licensor: _licensor, ...config } = parseReleaseCollection(raw, applicationId, xorAssetDefinition, false);
  return { ...config, items: CLUB_ITEMS.map(item => ({ sku: item.sku, kind: item.kind, sellers: [...config.sellers], contentHash: nftContentHashV1(clubItemMetadata(item, config.applicationId)) })) };
}

/** Every sound master, cover and license hash must exist before music can be released. */
export function releaseMusicCatalog(raw: string | undefined, applicationId: string | undefined, xorAssetDefinition: string | undefined): NftCatalogConfig | undefined {
  if (!raw) return undefined;
  const { licensor, ...config } = parseReleaseCollection(raw, applicationId, xorAssetDefinition, true);
  return { ...config, items: MUSIC_ITEMS.map(item => ({ sku: item.sku, kind: 'music', price: '1', sellers: [...config.sellers], contentHash: nftContentHashV1(musicItemMetadata(item, config.applicationId, licensor!)) })) };
}

/** One wallet inventory domain, retaining each original collection's seller restrictions. */
export function mergeNftCatalogs(...values: (NftCatalogConfig | undefined)[]): NftCatalogConfig | undefined {
  const catalogs = values.filter((value): value is NftCatalogConfig => value !== undefined);
  if (!catalogs.length) return undefined;
  const first = catalogs[0]!;
  if (catalogs.some(catalog => catalog.applicationId !== first.applicationId || catalog.domain !== first.domain || catalog.xorAssetDefinition !== first.xorAssetDefinition)) throw new Error('NFTコレクションのアプリ・ドメイン・XOR設定が一致しません。 / NFT collections must share pinned application, domain and XOR identities.');
  const items = catalogs.flatMap(catalog => catalog.items.map(item => ({ ...item, sellers: [...(item.sellers ?? catalog.sellers)] })));
  if (new Set(items.map(item => item.sku)).size !== items.length) throw new Error('NFTカタログのSKUが重複しています。 / Duplicate NFT catalog SKU.');
  return { applicationId: first.applicationId, domain: first.domain, xorAssetDefinition: first.xorAssetDefinition, sellers: [...new Set(catalogs.flatMap(catalog => [...catalog.sellers]))], items };
}
