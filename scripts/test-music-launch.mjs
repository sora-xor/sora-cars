import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Production browser adapter, synthetic endpoint records, actual catalog metadata.
const sources = ['src/chain/music-launch.ts', 'src/chain/inventory.ts', 'src/chain/catalog.ts', 'src/chain/music-release.ts', 'src/game/music-catalog.ts', 'src/game/music-assets.generated.json', 'tests/fixtures/music-launch.ts', 'scripts/check-music-launch.ts', 'scripts/test-music-launch.mjs'];
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const before = await hashes();
const html = '<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Launch snapshot verification</body></html>';
const server = await createServer({ cacheDir: 'node_modules/.vite-music-launch', server: { host: '127.0.0.1', port: 0, strictPort: false }, plugins: [{ name: 'music-launch-check-page', configureServer(server) { server.middlewares.use((request, response, next) => {
  if (request.url !== '/__music-launch') return next();
  void server.transformIndexHtml('/__music-launch', html).then(content => { response.setHeader('Content-Type', 'text/html'); response.end(content); }).catch(next);
}); } }] });
let browser;
const temporary = await mkdtemp(join(tmpdir(), 'sora-music-launch-'));
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__music-launch`);
  const result = await page.evaluate(async () => {
    const { createMusicLaunchFixture, nftContentHashV1, nftSaleOfferHashV1 } = await import('/tests/fixtures/music-launch.ts');
    const { reviewMusicLaunch } = await import('/src/chain/music-launch.ts');
    const { prepareMusicEdition } = await import('/src/chain/music-release.ts');
    const { snapshot, seller, outsider } = createMusicLaunchFixture();
    const checks = [], check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    const change = mutate => { const copy = structuredClone(snapshot); mutate(copy); return reviewMusicLaunch(copy); };
    const fails = (mutate, code, label) => { const report = change(mutate); check(!report.ready && report.issues.some(issue => issue.code === code), label); };
    const rehash = row => { row.offer.offer_hash = nftSaleOfferHashV1(row.offer.offer); };
    const offerChange = terms => copy => { Object.assign(copy.editions[0].offer.offer, terms); rehash(copy.editions[0]); };
    const ready = reviewMusicLaunch(snapshot);
    check(ready.ready && ready.requiredSkus === 52 && ready.coveredSkus === 52 && ready.coverage.every(row => row.nftIds.length === 1 && row.offerIds.length === 1), 'All 52 表/裏 exact local metadata bindings and open one-XOR editions satisfy launch coverage');
    check(ready.coverage.some(row => row.sku === 'music-meet-me-at-yasukuni') && ready.coverage.some(row => row.sku === 'music-meet-me-at-yasukuni-ura'), 'Launch coverage includes the supplied Tokyo recording in both sleeves');
    fails(copy => { copy.editions = copy.editions.filter(row => !row.sku.endsWith('-ura')); }, 'missing_sku', 'Front sleeves alone cannot launch the 表/裏 collection');
    check(ready.verification === 'endpoint_reported' && ready.scope.includes('No independent finality, freshness'), 'Success retains explicit endpoint-reported scope without freshness or finality claim');
    check(snapshot.editions.every(row => row.nft.ownedBy === row.offer.custody && row.nft.ownedBy !== seller), 'Launch stock is held by the quoted native sale custody');
    fails(copy => copy.editions.pop(), 'missing_sku', 'A missing song cannot launch the complete collection');
    fails(copy => { copy.editions = []; }, 'missing_sku', 'An empty snapshot lists every missing song');
    const extra = structuredClone(snapshot.editions[0]);
    extra.nft.id = `music_launch_extra$${snapshot.config.nftCatalog.domain}`;
    extra.offer.offer.nft_id = extra.nft.id;
    extra.offer.offer.offer_id = nftContentHashV1({ extra_edition: true }); rehash(extra);
    check(change(copy => copy.editions.push(extra)).ready, 'Distinct replenishment editions for a covered SKU are permitted');
    fails(copy => copy.editions.push(structuredClone(copy.editions[0])), 'duplicate_nft', 'Repeated NFT snapshot entries fail even when all SKUs are covered');
    fails(copy => { copy.editions[1].offer.offer.offer_id = copy.editions[0].offer.offer.offer_id; rehash(copy.editions[1]); }, 'duplicate_offer', 'One offer ID cannot represent two editions');
    fails(copy => { copy.editions[0].sku = copy.editions[1].sku; }, 'sku_conflict', 'Declared SKU must match the NFT exact metadata');
    for (const expires_at_height of ['19', '20']) fails(offerChange({ expires_at_height }), 'expired_or_expiring', `Expiry ${expires_at_height} does not provide stock beyond observed height 20`);
    fails(copy => { copy.editions[0].offer.created_at_height = '21'; }, 'future_record', 'Future-created records cannot belong to the supplied snapshot');
    fails(offerChange({ reserved_buyer: outsider }), 'reserved_offer', 'Buyer-reserved stock cannot satisfy the public launch');
    fails(offerChange({ price: '2' }), 'invalid_edition', 'Wrong price cannot satisfy one-XOR launch coverage');
    fails(offerChange({ metadata_hash: nftContentHashV1({ wrong_metadata: true }) }), 'invalid_edition', 'Changed offer metadata commitment cannot satisfy launch coverage');
    fails(copy => { copy.editions[0].nft.ownedBy = seller; }, 'invalid_edition', 'Direct seller ownership is not open sale custody');
    fails(copy => { copy.editions[0].offer.status = { kind: 'cancelled', value: null }; copy.editions[0].offer.closed_at_height = '2'; }, 'invalid_edition', 'Closed offers cannot cover launch stock');
    fails(copy => {
      const row = copy.editions[0]; row.nft.metadata.recording.wav.sha256 = 'f'.repeat(64);
      const contentHash = nftContentHashV1(row.nft.metadata);
      copy.config.nftCatalog.items[0].contentHash = contentHash; row.offer.offer.metadata_hash = contentHash; rehash(row);
    }, 'local_asset_conflict', 'Coherently substituted catalog and NFT master hashes still fail this build’s actual assets');
    fails(copy => { copy.config.nftMarketQualified = false; }, 'release_qualification', 'Missing release qualification cannot confer readiness');
    fails(copy => { copy.capability.network_id = nftContentHashV1({ foreign_network: true }); }, 'endpoint_qualification', 'Endpoint capability must match the qualified release network');
    fails(copy => { copy.capability.qualified = false; }, 'endpoint_qualification', 'An unqualified endpoint cannot confer readiness');
    for (const value of ['020', '18446744073709551616']) fails(copy => { copy.observedHeight = value; }, 'height', `Invalid observation height ${value} is rejected`);
    fails(copy => copy.config.nftCatalog.items.pop(), 'catalog_coverage', 'Incomplete reviewed catalog cannot confer readiness');
    fails(copy => copy.config.nftCatalog.items.push(structuredClone(copy.config.nftCatalog.items[0])), 'catalog_coverage', 'Duplicate catalog SKU cannot confer readiness');
    fails(copy => copy.config.nftCatalog.items.push({ ...copy.config.nftCatalog.items[0], sku: 'unknown-music' }), 'catalog_unknown_sku', 'Unknown music catalog SKU is rejected');
    fails(copy => { copy.editions[0] = { sku: snapshot.editions[0].sku, nft: null, offer: null }; }, 'invalid_edition', 'Malformed NFT and quote produce a bounded failure report');
    fails(copy => { copy.editions[0].extra = true; }, 'edition_shape', 'Unknown candidate fields cannot silently alter snapshot interpretation');
    fails(copy => { copy.editions = Array(1001).fill(copy.editions[0]); }, 'edition_bound', 'Candidate review is bounded at 1000 explicit editions');
    check(reviewMusicLaunch(null).issues[0].code === 'snapshot_shape', 'Malformed top-level input produces a failure report');
    const first = snapshot.editions[0];
    const prepared = prepareMusicEdition({ catalog: snapshot.config.nftCatalog, networkId: snapshot.config.networkId, seller, licensor: first.nft.metadata.license.licensor, sku: first.sku, nftId: first.nft.id, offerId: first.offer.offer.offer_id, expiresAtHeight: '100' });
    check(prepared.sku === first.sku && prepared.expected_offer.price === '1', 'Offline single-edition replenishment remains permitted independently of launch coverage');
    return { checks, snapshot, ready };
  });
  assert.deepEqual(errors, []);
  const cli = args => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-music-launch.ts', ...args], { encoding: 'utf8', timeout: 30000 });
  const malformed = join(temporary, 'malformed.json'), snapshotPath = join(temporary, 'snapshot.json'), oversized = join(temporary, 'oversized.json'), invalidShape = join(temporary, 'invalid-shape.json');
  await writeFile(malformed, '{'); await writeFile(snapshotPath, JSON.stringify(result.snapshot)); await writeFile(oversized, Buffer.alloc(32 * 1024 * 1024 + 1)); await writeFile(invalidShape, 'null');
  for (const [label, args, expected] of [['usage', [], /Usage:/], ['malformed JSON', [malformed], /JSON|Unexpected/], ['size bound', [oversized], /exceeds 32 MiB/], ['regular file', [temporary], /regular file/]]) {
    const run = cli(args); assert.equal(run.error, undefined, label); assert.equal(run.status, 2, label); assert.match(run.stderr, expected, label); result.checks.push(`CLI rejects ${label} with exit 2`);
  }
  const rejected = cli([invalidShape]); assert.equal(rejected.error, undefined); assert.equal(rejected.status, 1);
  assert.equal(JSON.parse(rejected.stdout).issues[0].code, 'snapshot_shape');
  result.checks.push('CLI emits a rejected-snapshot report and exit 1 for invalid JSON shape');
  const complete = cli([snapshotPath]); assert.equal(complete.error, undefined);
  let nodeRuntime;
  if (complete.status === 0) { assert.equal(JSON.parse(complete.stdout).ready, true); nodeRuntime = 'Qualified Node binding accepted the complete synthetic snapshot.'; }
  else { assert.equal(complete.status, 2); assert.match(complete.stderr, /ERR_IROHA_NATIVE_BINDING|source_provenance_error/); nodeRuntime = 'Node runtime blocked at native binding/source provenance admission; browser results do not certify Node execution.'; }
  result.checks.push('CLI preserves native runtime admission instead of presenting runtime failure as endpoint evidence');
  const after = await hashes(); assert.deepEqual(after, before, 'Reviewed sources changed during the test');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/music-launch-browser.json', JSON.stringify({ passed: true, checked_at: new Date().toISOString(), checks: result.checks, errors, sources: after, readyReport: result.ready, nodeRuntime, scope: 'Production browser adapter and real local metadata, synthetic endpoint observations only. No live NFT issuance, offer, wallet, publication, endpoint qualification or finality claim.' }, null, 2) + '\n');
  console.log(`PASS: ${result.checks.length} focused music launch checks. ${nodeRuntime}`);
} finally { if (browser) await browser.close(); await server.close(); await rm(temporary, { recursive: true, force: true }); }
