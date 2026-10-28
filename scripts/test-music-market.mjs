import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { runMusicWalletIdentityChecks } from './fixtures/music-wallet-identity.mjs';

// Exercise the production browser SDK's supported browser address adapter.
// Node SDK native provenance is a separate requirement, never weakened here.
const html = `<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Music marketplace protocol checks<script type="module">
import { AccountAddress } from '@iroha/iroha-js/address';
import { ed25519 } from '@noble/curves/ed25519';
import * as nftSdk from '@iroha/iroha-js/nft';
window.musicMarketDeps = { AccountAddress, ed25519, nftSdk };
</script></body></html>`;
const server = await createServer({ cacheDir: 'node_modules/.vite-music-market', server: { host: '127.0.0.1', port: 0, strictPort: false }, plugins: [{ name: 'music-market-check-page', configureServer(server) { server.middlewares.use((request, response, next) => {
  if (request.url !== '/__music-market') return next();
  void server.transformIndexHtml('/__music-market', html).then(content => { response.setHeader('Content-Type', 'text/html'); response.end(content); }).catch(next);
}); } }] });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
try {
  const port = server.httpServer.address().port, page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/__music-market`);
  await page.waitForFunction(() => Boolean(window.musicMarketDeps));
  const checks = await page.evaluate(async () => {
    const { AccountAddress, ed25519, nftSdk } = window.musicMarketDeps;
    const inventory = await import('/src/chain/inventory.ts');
    const { mergeNftCatalogs, releaseClubCatalog, releaseMusicCatalog } = await import('/src/chain/catalog.ts');
    const { validateClubAppearance } = await import('/src/game/catalog.ts');
    const { MUSIC_ITEMS, musicItemMetadata } = await import('/src/game/music-catalog.ts');
    const { prepareMusicEdition } = await import('/src/chain/music-release.ts');
    const { sameAccountIdentity } = await import('/src/chain/account-identity.ts');
    const { RaceChainClient } = await import('/src/chain/client.ts');
    const checks = [], check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    const rejects = (call, label) => { try { call(); } catch { checks.push(label); return; } throw new Error(`Expected rejection: ${label}`); };
    const rejectsAsync = async (call, label) => { try { await call(); } catch { checks.push(label); return; } throw new Error(`Expected rejection: ${label}`); };
    const account = n => AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(n)) }).toI105();
    const seller = account(7), custody = account(11), cosmeticSeller = account(13);
    const applicationId = nftSdk.nftContentHashV1({ app: 'browser music test fixture' }), network = nftSdk.nftContentHashV1({ network: 'browser fixture' });
    const metadata = { sora_cars: { version: 1, application_id: applicationId, sku: 'music-fixture', kind: 'music' },
      audio: { sha256: 'a'.repeat(64) }, artwork: { sha256: 'b'.repeat(64) }, license: { sha256: 'c'.repeat(64), licensor: 'Fixture issuer only' } };
    const contentHash = nftSdk.nftContentHashV1(metadata);
    const catalog = { applicationId, domain: 'sora_cars.universal', xorAssetDefinition: '62Fk4FPcMuLvW5QjDGNF2a4jAmjM', sellers: [seller], items: [{ sku: 'music-fixture', kind: 'music', contentHash, price: '1', sellers: [seller] }] };
    const nft = { id: 'music_fixture_1$sora_cars.universal', ownedBy: custody, metadata };
    const quote = changes => {
      const offer = { network_id: network, offer_id: nftSdk.nftContentHashV1({ offer: 'fixture' }), nft_id: nft.id, seller, payment_asset: catalog.xorAssetDefinition, price: '1', expires_at_height: '100', reserved_buyer: null, metadata_hash: contentHash, ...changes };
      return { version: 1, offer, offer_hash: nftSdk.nftSaleOfferHashV1(offer), custody, status: { kind: 'open', value: null }, created_at_height: '1', closed_at_height: null };
    };
    check(inventory.reviewMusicOffer(quote(), nft, catalog, network).quote.offer.price === '1', 'Reviewed music accepts exactly 1 XOR');
    check(inventory.reviewMusicOffer(quote(), nft, catalog, network).item.licensor === 'Fixture issuer only', 'Reviewed issuer comes from exact committed metadata');
    for (const price of ['0.1', '1.0000000000000000000000000001', '2']) rejects(() => inventory.reviewMusicOffer(quote({ price }), nft, catalog, network), `Reject price ${price}`);
    for (const [label, changes] of Object.entries({ seller: { seller: cosmeticSeller }, edition: { nft_id: 'another$sora_cars.universal' }, metadata: { metadata_hash: nftSdk.nftContentHashV1({ changed: true }) }, network: { network_id: nftSdk.nftContentHashV1({ foreign: true }) } })) rejects(() => inventory.reviewMusicOffer(quote(changes), nft, catalog, network), `Reject changed ${label}`);
    rejects(() => inventory.reviewMusicOffer(quote(), nft, { ...catalog, xorAssetDefinition: 'another' }, network), 'Reject another payment denomination');
    rejects(() => inventory.reviewMusicOffer(quote(), { ...nft, ownedBy: seller }, catalog, network), 'Reject NFT outside quoted custody');
    rejects(() => inventory.reviewMusicOffer({ ...quote(), status: { kind: 'cancelled', value: null }, closed_at_height: '2' }, nft, catalog, network), 'Reject closed sale');
    for (const field of ['audio', 'artwork', 'license']) check(inventory.resolveMusicNft({ ...nft, metadata: { ...metadata, [field]: { ...metadata[field], sha256: 'd'.repeat(64) } } }, catalog) === null, `Reject changed ${field} bytes`);
    check(inventory.resolveMusicNft({ ...nft, metadata: { ...metadata, license: { ...metadata.license, licensor: 'Another issuer' } } }, catalog) === null, 'Reject changed license issuer');
    check(inventory.resolveMusicNft({ ...nft, id: 'music_fixture_1$foreign.universal' }, catalog) === null, 'Reject another collection domain');
    check(inventory.resolveMusicNft(nft, { ...catalog, items: [{ ...catalog.items[0], price: undefined }] }) === null, 'Reject a music catalog without one-XOR policy');
    const owned = { ownerAccountId: custody, verification: 'endpoint_reported', items: [nft] };
    check(inventory.musicInventory(owned, catalog).items.length === 1, 'Released music enters music inventory');
    check(inventory.garageInventory(owned, catalog).items.length === 0, 'Music excluded from garage and race wager inventories');
    rejects(() => inventory.musicInventory({ ...owned, ownerAccountId: seller }, catalog), 'Reject another owner inventory');
    rejects(() => inventory.reviewGarageOffer(quote(), nft, catalog, network), 'Garage offer cannot expose music as equipment');
    for (const kind of ['skin', 'upgrade']) rejects(() => validateClubAppearance({ skin: null, upgrade: null, [kind]: 'music-fixture' }), `Cannot equip music as ${kind}`);
    const cosmetics = releaseClubCatalog(JSON.stringify({ domain: catalog.domain, sellers: [cosmeticSeller] }), applicationId, catalog.xorAssetDefinition);
    check(cosmetics.items.length === 8, 'Original eight cosmetics still release');
    const combined = mergeNftCatalogs(cosmetics, catalog);
    check(combined.items.length === 9, 'Music and cosmetics combine without losing items');
    rejects(() => inventory.reviewMusicOffer(quote({ seller: cosmeticSeller }), nft, combined, network), 'Cosmetic seller cannot sell music after merge');
    for (const changed of [{ domain: 'foreign.universal' }, { applicationId: nftSdk.nftContentHashV1({ app: 2 }) }, { xorAssetDefinition: 'different' }]) rejects(() => mergeNftCatalogs(catalog, { ...cosmetics, ...changed }), 'Mismatched release identity rejected');
    rejects(() => mergeNftCatalogs(catalog, catalog), 'Duplicate SKU rejected');
    const client = new RaceChainClient({ toriiUrl: 'https://fixture.example', networkId: network, nftCatalog: combined, fetchImpl: async () => new Response(JSON.stringify({ id: nft.id, owned_by: nft.ownedBy, metadata }), { headers: { 'content-type': 'application/json' } }) });
    check((await client.reviewMusicNftOffer(quote())).item.kind === 'music', 'Client reviews actual music metadata');
    await rejectsAsync(() => client.reviewNftOffer(quote()), 'Client cosmetic review rejects music');
    client.state.account = custody;
    await rejectsAsync(() => client.getOwnedMusicNft(nft.id), 'Displayed account does not substitute wallet approval');
    await rejectsAsync(() => client.purchaseNft(quote(), { payer: 'authority', chargeLimits: [{ kind: 'nexus', assetDefinitionId: catalog.xorAssetDefinition, maxAmount: '1' }] }), 'Unapproved wallet cannot sign purchase');
    const capabilities = { version: 1, native_nft_market: true, network_id: network, protocol_id: nftSdk.nftMarketProfileIdV1(), qualified: true };
    for (const [label, local, response, expected] of [
      ['Reviewed matching policy', { nftMarketQualified: true, nftMarketProfileId: nftSdk.nftMarketProfileIdV1() }, capabilities, true],
      ['Missing release approval', { nftMarketQualified: false, nftMarketProfileId: nftSdk.nftMarketProfileIdV1() }, capabilities, false],
      ['Unqualified endpoint', { nftMarketQualified: true, nftMarketProfileId: nftSdk.nftMarketProfileIdV1() }, { ...capabilities, qualified: false }, false],
      ['Wrong endpoint network', { nftMarketQualified: true, nftMarketProfileId: nftSdk.nftMarketProfileIdV1() }, { ...capabilities, network_id: nftSdk.nftContentHashV1({ wrong: true }) }, false],
    ]) {
      const probe = new RaceChainClient({ toriiUrl: 'https://fixture.example', networkId: network, nftCatalog: combined, ...local, fetchImpl: async () => new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } }) });
      check((await probe.probeNftMarket()).ready === expected, label);
    }
    const actualCatalog = releaseMusicCatalog(JSON.stringify({ domain: catalog.domain, sellers: [seller], licensor: 'Explicit complete-collection fixture issuer' }), applicationId, catalog.xorAssetDefinition);
    check(actualCatalog.items.length === 26 && actualCatalog.items.every(item => item.kind === 'music' && item.price === '1'), 'All 26 real asset metadata entries release at exactly one XOR');
    check(actualCatalog.items.some(item => item.sku === 'music-meet-me-at-yasukuni'), 'Supplied Tokyo recording participates in the same reviewed release');
    check(new Set(actualCatalog.items.map(item => item.contentHash)).size === MUSIC_ITEMS.length, 'All released recordings have distinct exact native content commitments');
    for (const song of MUSIC_ITEMS) {
      const metadata = musicItemMetadata(song, applicationId, 'Explicit complete-collection fixture issuer');
      const entry = actualCatalog.items.find(item => item.sku === song.sku);
      if (!entry || entry.contentHash !== nftSdk.nftContentHashV1(metadata) || metadata.recording.wav.sha256 !== song.assets.wav.sha256 || metadata.artwork.sha256 !== song.assets.cover.sha256 || metadata.license.sha256 !== song.license.sha256) throw new Error(`Complete real metadata binding failed: ${song.sku}`);
    }
    checks.push('Every real recording, cover and license hash is included in its released NFT metadata');
    // Real production codec normalizes AccountId display prefixes. These are
    // explicitly simulated Taira offers/ownership, never endpoint or ledger claims.
    const tairaSeller = AccountAddress.fromI105(seller).toI105(369);
    const tairaCustody = AccountAddress.fromI105(custody).toI105(369);
    const tairaCatalog = { ...actualCatalog, sellers: [tairaSeller], items: actualCatalog.items.map(item => ({ ...item, sellers: [tairaSeller] })) };
    check(sameAccountIdentity(tairaSeller, seller), 'Same native seller controller matches across Taira and default display prefixes');
    check(!sameAccountIdentity(tairaSeller, custody), 'Different native controller is rejected');
    const badChecksum = tairaSeller.slice(0, -1) + (tairaSeller.endsWith('1') ? '2' : '1');
    for (const invalid of [badChecksum, 'not-an-account', '', null, ` ${tairaSeller}`]) {
      check(!sameAccountIdentity(invalid, invalid) && !sameAccountIdentity(invalid, seller), 'Malformed account cannot pass even an identical-string comparison');
    }
    const savedFromI105 = AccountAddress.fromI105;
    const nativeAdmissionError = Object.assign(new Error('Native admission fixture unavailable'), { code: 'ERR_IROHA_NATIVE_BINDING' });
    try {
      AccountAddress.fromI105 = () => { throw nativeAdmissionError; };
      let propagated = false;
      try { sameAccountIdentity(tairaSeller, seller); } catch (error) { propagated = error === nativeAdmissionError; }
      check(propagated, 'Native binding admission errors propagate unchanged');
    } finally { AccountAddress.fromI105 = savedFromI105; }
    const tairaFixtures = MUSIC_ITEMS.map((song, index) => {
      const realMetadata = musicItemMetadata(song, applicationId, 'Explicit complete-collection fixture issuer');
      const nft = { id: `taira_fixture_${index + 1}$${tairaCatalog.domain}`, ownedBy: tairaCustody, metadata: realMetadata };
      const offer = { network_id: network, offer_id: nftSdk.nftContentHashV1({ fixture: 'Taira music offer', index }), nft_id: nft.id, seller: tairaSeller, payment_asset: tairaCatalog.xorAssetDefinition, price: '1', expires_at_height: '100', reserved_buyer: null, metadata_hash: nftSdk.nftContentHashV1(realMetadata) };
      const quote = { version: 1, offer, offer_hash: nftSdk.nftSaleOfferHashV1(offer), custody: tairaCustody, status: { kind: 'open', value: null }, created_at_height: '1', closed_at_height: null };
      const before = JSON.stringify(quote), reviewed = inventory.reviewMusicOffer(quote, nft, tairaCatalog, network);
      check(reviewed.item.sku === song.sku && reviewed.quote.offer_hash === quote.offer_hash && nftSdk.nftSaleOfferHashV1(reviewed.quote.offer) === quote.offer_hash && JSON.stringify(quote) === before, `Taira seller/custody accepts real ${song.sku} metadata without changing offer commitments`);
      return { quote, nft };
    });
    const taira = tairaFixtures[0];
    rejects(() => inventory.reviewMusicOffer(taira.quote, { ...taira.nft, ownedBy: cosmeticSeller }, tairaCatalog, network), 'Taira offer rejects custody held by another controller');
    rejects(() => inventory.reviewMusicOffer(taira.quote, { ...taira.nft, ownedBy: badChecksum }, tairaCatalog, network), 'Taira offer rejects malformed endpoint owner');
    rejects(() => inventory.reviewMusicOffer(taira.quote, taira.nft, { ...tairaCatalog, sellers: [cosmeticSeller] }, network), 'Taira offer rejects another catalog seller controller');
    rejects(() => inventory.reviewMusicOffer(taira.quote, taira.nft, { ...tairaCatalog, sellers: [badChecksum] }, network), 'Taira offer rejects malformed catalog seller');
    rejects(() => inventory.reviewMusicOffer(taira.quote, taira.nft, { ...tairaCatalog, items: tairaCatalog.items.map(item => ({ ...item, sellers: [cosmeticSeller] })) }, network), 'Taira offer retains per-item seller restrictions');
    rejects(() => inventory.reviewMusicOffer(taira.quote, taira.nft, tairaCatalog, nftSdk.nftContentHashV1({ network: 'another network' })), 'Account identity equivalence does not relax the exact network pin');
    const badSellerOffer = { ...taira.quote.offer, seller: badChecksum };
    rejects(() => inventory.reviewMusicOffer({ ...taira.quote, offer: badSellerOffer }, taira.nft, tairaCatalog, network), 'Malformed quote seller remains rejected by the native-format codec');
    check(inventory.musicInventory({ ownerAccountId: custody, verification: 'endpoint_reported', items: [taira.nft] }, tairaCatalog).items.length === 1, 'Music inventory accepts exact owner controller across display prefixes');
    rejects(() => inventory.musicInventory({ ownerAccountId: seller, verification: 'endpoint_reported', items: [taira.nft] }, tairaCatalog), 'Music inventory still rejects a different owner controller');
    const tairaClient = new RaceChainClient({ toriiUrl: 'https://fixture.example', networkId: network, nftCatalog: tairaCatalog, fetchImpl: async () => new Response(JSON.stringify({ id: taira.nft.id, owned_by: taira.nft.ownedBy, metadata: taira.nft.metadata }), { headers: { 'content-type': 'application/json' } }) });
    check((await tairaClient.reviewMusicNftOffer(taira.quote)).item.sku === MUSIC_ITEMS[0].sku, 'Production client accepts Taira seller/custody through explicitly simulated endpoint transport');
    const { MusicStore } = await import('/src/ui/music-store.ts');
    document.body.innerHTML = '<div id="app"><div id="music-test-screen"></div><dialog id="dialog"></dialog></div>';
    const dialog = document.querySelector('#dialog'), screen = document.querySelector('#music-test-screen');
    const checkoutClient = { config: { nftCatalog: tairaCatalog }, state: { account: tairaCustody },
      listOwnedNfts: async () => ({ ownerAccountId: tairaCustody, verification: 'endpoint_reported', items: [] }),
      listNftOffers: async () => ({ items: [taira.quote], nextCursor: null, hasMore: false }),
      getNftOffer: async () => taira.quote,
      reviewMusicNftOffer: quote => tairaClient.reviewMusicNftOffer(quote),
      probeNftMarket: async () => ({ ready: false, reason: 'Explicit offline checkout fixture; spending disabled.' }),
    };
    const store = new MusicStore({ client: () => checkoutClient, screen, active: () => true, showDialog: html => { dialog.innerHTML = html; dialog.showModal(); }, closeDialog: () => dialog.close(), notify: message => { throw new Error(message); } });
    await store.action('refresh'); await store.action(`review:${taira.quote.offer.offer_id}`);
    const displayed = Object.fromEntries([...dialog.querySelectorAll('.checkout-terms > div')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]));
    check(displayed['出品者 / SELLER'] === tairaSeller && displayed['購入者 / BUYER'] === tairaCustody && displayed['出品ハッシュ / OFFER HASH'] === taira.quote.offer_hash, 'Checkout displays the reviewed Taira seller and current wallet literals while preserving the immutable offer hash');
    store.close(); dialog.close();
    // Isolated browser-only fixture assets exercise offline issuance structure.
    // These hashes do not claim to describe the final audio/art on disk.
    const song = MUSIC_ITEMS[0], originalAssets = song.assets;
    const file = path => ({ path, bytes: 100, sha256: 'f'.repeat(64) });
    try {
      song.assets = { wav: file(`assets/music/audio/${song.file}.wav`), mp3: file(`assets/music/audio/${song.file}.mp3`), preview: file(`assets/music/audio/${song.file}-preview.mp3`), cover: file(`assets/music/covers/${song.file}-v1.png`), durationSeconds: song.durationSeconds };
      const licensor = 'Synthetic issuance fixture only';
      const contentHash = nftSdk.nftContentHashV1(musicItemMetadata(song, applicationId, licensor));
      const issuanceCatalog = { ...catalog, items: [{ sku: song.sku, kind: 'music', contentHash, price: '1', sellers: [seller] }] };
      const input = { catalog: issuanceCatalog, networkId: network, seller, licensor, sku: song.sku, nftId: `music_edition_fixture$${catalog.domain}`, offerId: nftSdk.nftContentHashV1({ edition: 'fixture' }), expiresAtHeight: '100' };
      const prepared = prepareMusicEdition(input);
      check(prepared.offer_instruction.OfferNftV1.price === '1' && prepared.content_hash === contentHash, 'Offline edition binds one-XOR native offer to complete reviewed metadata');
      check(prepared.expected_offer_hash === nftSdk.nftSaleOfferHashV1(prepared.expected_offer), 'Offline edition binds network and seller in immutable offer hash');
      check(prepared.new_nft.id === input.nftId && prepared.new_nft.content.license.licensor === licensor, 'Offline NewNft input preserves explicit edition ID and licensor');
      for (const changed of [{ seller: cosmeticSeller }, { licensor: 'Another issuer' }, { nftId: 'music_fixture$foreign.universal' }, { sku: 'unknown' }, { expiresAtHeight: '0' }, { networkId: 'not-a-network-hash' }]) rejects(() => prepareMusicEdition({ ...input, ...changed }), `Reject invalid offline edition ${Object.keys(changed)[0]}`);
      song.assets = { ...song.assets, wav: { ...song.assets.wav, sha256: 'e'.repeat(64) } };
      rejects(() => prepareMusicEdition(input), 'Offline issuance rejects a changed master after catalog approval');
    } finally { song.assets = originalAssets; }
    return checks;
  });
  checks.push(...await runMusicWalletIdentityChecks());
  assert.equal(errors.length, 0, errors.join('\n'));
  const sources = {};
  for (const path of ['src/chain/account-identity.ts', 'src/chain/inventory.ts', 'src/chain/catalog.ts', 'src/chain/client.ts', 'src/chain/music-release.ts', 'src/ui/music-store.ts', 'src/game/music-catalog.ts', 'src/game/music-assets.generated.json', 'scripts/test-music-market.mjs', 'scripts/fixtures/music-wallet-identity.mjs']) sources[path] = createHash('sha256').update(await readFile(path)).digest('hex');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/music-market-browser.json', JSON.stringify({ passed: true, checked_at: new Date().toISOString(), checks, errors, sources, scope: 'Real production browser SDK and chain modules; explicitly synthetic NFT records and endpoint transport. No live wallet, issuance or purchase.' }, null, 2) + '\n');
  console.log(`PASS: ${checks.length} production-browser music marketplace checks.`);
} finally { await browser.close(); await server.close(); }
