import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { nftContentHashV1, nftMarketProfileIdV1 } from '@iroha/iroha-js/nft';
import type { NftInventoryItemV1 } from '@iroha/iroha-js/nft';
import type { ChainConfig } from './client';
import { reviewMusicOffer } from './inventory';
import { MUSIC_ITEMS, musicItemMetadata } from '../game/music-catalog';

export interface MusicLaunchSnapshot {
  config: Pick<ChainConfig, 'networkId' | 'nftCatalog' | 'nftMarketQualified' | 'nftMarketProfileId'>;
  capability: unknown;
  observedHeight: string;
  /** Explicit launch candidates, not an unfiltered marketplace listing. */
  editions: readonly { sku: string; nft: NftInventoryItemV1; offer: unknown }[];
}
export interface MusicLaunchIssue { code: string; message: string; sku?: string; editionIndex?: number }
export interface MusicLaunchReport {
  version: 1;
  kind: 'sora-records-launch-review';
  ready: boolean;
  verification: 'endpoint_reported';
  scope: string;
  networkId: string | null;
  observedHeight: string | null;
  requiredSkus: number;
  coveredSkus: number;
  coverage: { sku: string; nftIds: string[]; offerIds: string[] }[];
  issues: MusicLaunchIssue[];
}
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
function reason(error: unknown): string {
  // A broken local codec runtime is not evidence that an endpoint record is bad.
  if (object(error)?.code === 'ERR_IROHA_NATIVE_BINDING') throw error;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Review an explicit, bounded endpoint snapshot. This performs no fetch, signing,
 * issuance or publication and cannot authenticate finality or snapshot freshness.
 * Open offers require the quoted sale custody, not direct seller ownership.
 */
export function reviewMusicLaunch(input: MusicLaunchSnapshot): MusicLaunchReport {
  const report: MusicLaunchReport = {
    version: 1, kind: 'sora-records-launch-review', ready: false, verification: 'endpoint_reported',
    scope: 'Local review of supplied endpoint observations only. No independent finality, freshness, issuance, transaction submission or publication is established.',
    networkId: null, observedHeight: null, requiredSkus: MUSIC_ITEMS.length, coveredSkus: 0,
    coverage: MUSIC_ITEMS.map(item => ({ sku: item.sku, nftIds: [], offerIds: [] })), issues: [],
  };
  const issue = (code: string, message: string, sku?: string, editionIndex?: number) => report.issues.push({ code, message, ...(sku === undefined ? {} : { sku }), ...(editionIndex === undefined ? {} : { editionIndex }) });
  const raw = object(input);
  if (!raw || Object.keys(raw).sort().join(',') !== 'capability,config,editions,observedHeight') {
    issue('snapshot_shape', 'Snapshot requires exactly config, capability, observedHeight and editions.'); return report;
  }
  const config = object(raw.config);
  if (!config || Object.keys(config).some(key => !['networkId', 'nftCatalog', 'nftMarketQualified', 'nftMarketProfileId'].includes(key))) {
    issue('config_shape', 'Supply only the reviewed network, catalog and native-market release policy.'); return report;
  }
  const catalog = input.config.nftCatalog;
  const knownSkus = new Set(MUSIC_ITEMS.map(item => item.sku));
  if (!catalog || !Array.isArray(catalog.items) || catalog.items.length > 512 || !Array.isArray(catalog.sellers)
    || !catalog.sellers.length || catalog.sellers.length > 32 || typeof catalog.applicationId !== 'string'
    || typeof catalog.domain !== 'string' || typeof catalog.xorAssetDefinition !== 'string') {
    issue('catalog_shape', 'A complete reviewed music catalog is required.'); return report;
  }
  for (const song of MUSIC_ITEMS) {
    const entries = catalog.items.filter(entry => object(entry)?.sku === song.sku);
    if (entries.length !== 1 || entries[0]!.kind !== 'music' || entries[0]!.price !== '1') issue('catalog_coverage', 'Catalog must bind this music SKU exactly once at 1 XOR.', song.sku);
  }
  if (catalog.items.some(entry => !object(entry) || entry.kind === 'music' && !knownSkus.has(entry.sku))) issue('catalog_unknown_sku', 'Catalog contains an unknown music SKU or invalid entry.');
  try {
    if (typeof config.networkId !== 'string' || NetworkId.parse(config.networkId).toString() !== config.networkId) throw new Error('Use the exact canonical release-pinned network ID.');
    report.networkId = config.networkId;
  } catch (error) { issue('network', reason(error)); }
  const profile = nftMarketProfileIdV1();
  if (config.nftMarketQualified !== true || config.nftMarketProfileId !== profile) issue('release_qualification', 'Release must explicitly qualify the exact native NFT market profile.');
  const capability = object(raw.capability);
  if (!capability || capability.version !== 1 || capability.native_nft_market !== true || capability.qualified !== true
    || capability.network_id !== report.networkId || capability.protocol_id !== profile) issue('endpoint_qualification', 'Endpoint capability must report the qualified native market on the pinned network and profile.');
  let height: bigint | null = null;
  if (typeof raw.observedHeight === 'string' && /^(?:0|[1-9]\d{0,19})$/.test(raw.observedHeight) && BigInt(raw.observedHeight) <= 18_446_744_073_709_551_615n) {
    report.observedHeight = raw.observedHeight; height = BigInt(raw.observedHeight);
  } else issue('height', 'Supply an explicit canonical u64 block height for this endpoint snapshot.');
  if (!Array.isArray(raw.editions) || raw.editions.length > 1000) {
    issue('edition_bound', 'Supply at most 1000 explicit launch candidates.'); return report;
  }
  // Invalid trust context must never confer partial release readiness.
  if (report.issues.length) return report;
  const seenNfts = new Set<string>(), seenOffers = new Set<string>();
  for (const [editionIndex, value] of input.editions.entries()) {
    const row = object(value);
    if (!row || Object.keys(row).sort().join(',') !== 'nft,offer,sku' || typeof row.sku !== 'string' || !knownSkus.has(row.sku)) {
      issue('edition_shape', 'Each candidate requires a known music sku, nft and offer.', undefined, editionIndex); continue;
    }
    const sku = row.sku;
    try {
      const reviewed = reviewMusicOffer(row.offer, row.nft as NftInventoryItemV1, catalog, report.networkId!);
      const { item, quote } = reviewed;
      if (item.sku !== sku) { issue('sku_conflict', 'Candidate SKU differs from its exact NFT metadata.', sku, editionIndex); continue; }
      const song = MUSIC_ITEMS.find(entry => entry.sku === sku)!;
      if (nftContentHashV1(musicItemMetadata(song, catalog.applicationId, item.licensor)) !== item.contentHash) {
        issue('local_asset_conflict', 'Catalog/NFT metadata differs from this build’s exact recording, artwork or license.', sku, editionIndex); continue;
      }
      let usable = true;
      if (seenNfts.has(item.nftId)) { issue('duplicate_nft', 'NFT appears more than once in the candidate snapshot.', sku, editionIndex); usable = false; }
      if (seenOffers.has(quote.offer.offer_id)) { issue('duplicate_offer', 'Offer ID appears more than once in the candidate snapshot.', sku, editionIndex); usable = false; }
      seenNfts.add(item.nftId); seenOffers.add(quote.offer.offer_id);
      if (BigInt(quote.created_at_height) > height!) { issue('future_record', 'Offer was created after the supplied observation height.', sku, editionIndex); usable = false; }
      if (BigInt(quote.offer.expires_at_height) <= height!) { issue('expired_or_expiring', 'Launch offers must have expiry strictly beyond the observation height.', sku, editionIndex); usable = false; }
      if (quote.offer.reserved_buyer !== null) { issue('reserved_offer', 'A buyer-reserved edition cannot count as generally available launch stock.', sku, editionIndex); usable = false; }
      if (usable) { const coverage = report.coverage.find(entry => entry.sku === sku)!; coverage.nftIds.push(item.nftId); coverage.offerIds.push(quote.offer.offer_id); }
    } catch (error) { issue('invalid_edition', reason(error), sku, editionIndex); }
  }
  for (const row of report.coverage) if (!row.nftIds.length) issue('missing_sku', 'No verified open 1-XOR edition covers this song in the supplied snapshot.', row.sku);
  report.coveredSkus = report.coverage.filter(row => row.nftIds.length > 0).length;
  report.ready = report.issues.length === 0 && report.coveredSkus === report.requiredSkus;
  return report;
}
