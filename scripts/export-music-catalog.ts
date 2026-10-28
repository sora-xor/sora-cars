import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { releaseMusicCatalog } from '../src/chain/catalog';
import { prepareMusicEdition } from '../src/chain/music-release';
import { MUSIC_ITEMS, musicItem } from '../src/game/music-catalog';

const [applicationId, xorAssetDefinition, collectionJson, planPath, outputPath] = process.argv.slice(2);
if (!outputPath || process.argv.length !== 7) throw new Error('Usage: npx tsx scripts/export-music-catalog.ts <pinned-application-hash> <XOR-definition> <music-collection-JSON> <offer-plan.json> <output.json>');
const catalog = releaseMusicCatalog(collectionJson, applicationId, xorAssetDefinition)!;
const licensor = JSON.parse(collectionJson!).licensor as string;
const plan = JSON.parse(await readFile(resolve(planPath!), 'utf8'));
if (!plan || typeof plan !== 'object' || Object.keys(plan).sort().join(',') !== 'editions,expires_at_height,network_id,seller' || typeof plan.network_id !== 'string' || typeof plan.seller !== 'string' || typeof plan.expires_at_height !== 'string' || !Array.isArray(plan.editions) || plan.editions.length < 1 || plan.editions.length > 1000) throw new Error('Plan needs exact network_id, seller, expires_at_height and 1–1000 explicit editions.');
const publicRoot = resolve('public'), checked = new Map<string, string>();
async function checkFile(file: { path: string; sha256: string; bytes?: number }) {
  if (checked.get(file.path) === file.sha256) return;
  const path = resolve(publicRoot, file.path);
  if (!path.startsWith(publicRoot + sep) || !/^assets\/music\/[a-z0-9/_.,-]+$/.test(file.path)) throw new Error('Music file must be local to public/assets/music.');
  const bytes = await readFile(path);
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256 || file.bytes !== undefined && bytes.byteLength !== file.bytes) throw new Error(`Released bytes differ from the pinned music file: ${file.path}`);
  checked.set(file.path, file.sha256);
}
// Check the complete released collection, not only today's editions.
for (const item of MUSIC_ITEMS) {
  if (!item.assets) throw new Error(`Missing rendered music assets: ${item.sku}`);
  for (const name of ['wav', 'mp3', 'preview', 'cover'] as const) await checkFile(item.assets[name]);
  await checkFile(item.license);
}
const nftIds = new Set<string>(), offerIds = new Set<string>();
const editions = plan.editions.map((row: Record<string, unknown>) => {
  if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'nft_id,offer_id,sku' || typeof row.sku !== 'string' || typeof row.nft_id !== 'string' || typeof row.offer_id !== 'string' || !musicItem(row.sku)) throw new Error('Each edition needs an exact known sku, nft_id and offer_id.');
  if (nftIds.has(row.nft_id) || offerIds.has(row.offer_id)) throw new Error('NFT IDs and offer IDs must each be unique within an issuance plan.');
  nftIds.add(row.nft_id); offerIds.add(row.offer_id);
  return prepareMusicEdition({ catalog, networkId: plan.network_id, seller: plan.seller, licensor, sku: row.sku, nftId: row.nft_id, offerId: row.offer_id, expiresAtHeight: plan.expires_at_height });
});
const output = { version: 1, kind: 'sora-records-offline-issuance-input', network_id: plan.network_id, authority: plan.seller, catalog, checked_files: Object.fromEntries(checked), editions,
  note: 'Offline inputs only. No NFT registration, offer creation, wallet signature or submission occurred. The operator must check future expiry, unused IDs, domain authority and native market qualification against the pinned release before signing.' };
const path = resolve(outputPath); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(output, null, 2) + '\n');
console.log(path);
