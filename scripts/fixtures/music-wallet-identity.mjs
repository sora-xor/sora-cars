// Local protocol counterpart only: no live wallet, ledger, spending signatures or submissions.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';
import { ed25519 } from '@noble/curves/ed25519';
import { createTestWallet, compactFields } from './connect-wallet.mjs';

/** Exercise production ownership/purchase guards after an actual encrypted Connect approval. */
export async function runMusicWalletIdentityChecks() {
  const checks = [], errors = [], external = [], requests = [], sessions = new Map();
  const privateKey = new Uint8Array(32).fill(91), publicKey = ed25519.getPublicKey(privateKey);
  let accountId, networkBytes, browser, server, sockets;
  const html = `<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Local wallet identity fixture<script type="module">
import { AccountAddress } from '@iroha/iroha-js/address';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { ed25519 } from '@noble/curves/ed25519';
import * as nftSdk from '@iroha/iroha-js/nft';
import * as transactions from '@iroha/iroha-js/transaction-codec';
import { RaceChainClient } from '/src/chain/client.ts';
window.musicWalletDeps = { AccountAddress, NetworkId, ed25519, nftSdk, transactions, RaceChainClient };
</script></body></html>`;
  const json = (response, value) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
  try {
    server = await createServer({ cacheDir: 'node_modules/.vite-music-market', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false }, plugins: [{ name: 'music-wallet-identity-fixture', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url === '/__music-wallet-identity') {
          void vite.transformIndexHtml(request.url, html).then(content => { response.setHeader('Content-Type', 'text/html'); response.end(content); }).catch(next);
          return;
        }
        if (!request.url.startsWith('/v1/')) return next();
        void (async () => {
          assert.equal(request.url, '/v1/connect/session', 'Only local Connect registration may reach HTTP');
          assert.equal(request.method, 'POST');
          const chunks = []; let bytes = 0;
          for await (const chunk of request) { bytes += chunk.length; assert.ok(bytes < 16_384); chunks.push(chunk); }
          const body = JSON.parse(Buffer.concat(chunks).toString());
          const uri = role => `iroha://connect?${new URLSearchParams({ sid: body.sid, network_id: body.network_id, app_pk: body.app_pk, nonce: body.nonce, node: body.node, role, v: '1', token: (role === 'app' ? 'A' : 'B').repeat(43), relay: 'D'.repeat(43) })}`;
          sessions.set(body.sid, body);
          json(response, { ...body, node: undefined, wallet_uri: uri('wallet'), app_uri: uri('app'), token_app: 'A'.repeat(43), token_wallet: 'B'.repeat(43), token_management: 'C'.repeat(43), token_relay: 'D'.repeat(43) });
        })().catch(error => { errors.push(String(error)); response.writeHead(500); response.end('Local fixture failed'); });
      });
    } }] });
    sockets = new WebSocketServer({ noServer: true });
    server.httpServer.on('upgrade', (request, socket, head) => {
      if (new URL(request.url, 'http://127.0.0.1').pathname === '/v1/connect/ws') sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws, request));
    });
    sockets.on('connection', (ws, request) => {
      const sid = new URL(request.url, 'http://127.0.0.1').searchParams.get('sid'), registered = sessions.get(sid);
      try {
        assert.ok(registered); assert.ok(accountId); assert.ok(networkBytes);
        // Network bytes and address were produced by the genuine browser SDK.
        const preview = { sidBytes: Buffer.from(sid, 'base64url'), appKeyPair: { publicKey: Buffer.from(registered.app_pk, 'base64url') }, networkId: { toBytes: () => Uint8Array.from(networkBytes) } };
        const wallet = createTestWallet(preview, { privateKey, publicKey, accountId }, 'D'.repeat(43));
        let approved = false;
        ws.on('message', raw => {
          try {
            const signing = wallet.request(Buffer.from(raw));
            if (!approved) { approved = true; ws.send(wallet.approve()); return; }
            if (!signing) return;
            requests.push({ seq: signing.seq, payload: Buffer.from(signing.txBytes), accountId });
            // Capturing the encrypted request proves authorization reached the wallet.
            // Stop before producing any spending signature or submission.
            ws.close(1000, 'Local fixture stops before signing');
          } catch (error) { errors.push(String(error)); ws.close(); }
        });
      } catch (error) { errors.push(String(error)); ws.close(); }
    });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const request = route.request();
      if (!request.url().startsWith(`${origin}/`)) { external.push(request.url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/__music-wallet-identity`);
    await page.waitForFunction(() => Boolean(window.musicWalletDeps));
    const identity = await page.evaluate(() => {
      const { AccountAddress, NetworkId, ed25519, nftSdk, RaceChainClient } = window.musicWalletDeps;
      const address = seed => AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(seed)) });
      const wallet = address(91), other = address(92), seller = address(93).toI105(369), custody = address(94).toI105(369);
      const network = nftSdk.nftContentHashV1({ network: 'local music wallet identity fixture' });
      const application = nftSdk.nftContentHashV1({ application: 'local music wallet identity fixture' });
      const metadata = { sora_cars: { version: 1, application_id: application, sku: 'music-wallet-identity-fixture', kind: 'music' }, license: { licensor: 'Explicit local fixture only' }, title: 'Local test only' };
      const contentHash = nftSdk.nftContentHashV1(metadata), asset = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
      const catalog = { applicationId: application, domain: 'sora_cars.universal', xorAssetDefinition: asset, sellers: [seller], items: [{ sku: 'music-wallet-identity-fixture', kind: 'music', contentHash, price: '1', sellers: [seller] }] };
      const ownedId = 'owned_music$sora_cars.universal', saleId = 'sale_music$sora_cars.universal';
      const fee = { payer: 'authority', chargeLimits: [{ kind: 'nexus', assetDefinitionId: asset, maxAmount: '0.25' }] };
      const state = { ownedBy: wallet.toI105(), reservedBuyer: wallet.toI105(), hold: false, pending: [], reads: 0, unexpected: [], download: null, listPages: [], listRequests: [], holdList: false, pendingLists: [], listing: null };
      const quote = () => {
        const offer = { network_id: network, offer_id: nftSdk.nftContentHashV1({ offer: 'local wallet identity fixture' }), nft_id: saleId, seller, payment_asset: asset, price: '1', expires_at_height: '100', reserved_buyer: state.reservedBuyer, metadata_hash: contentHash };
        return { version: 1, offer, offer_hash: nftSdk.nftSaleOfferHashV1(offer), custody, status: { kind: 'open', value: null }, created_at_height: '1', closed_at_height: null };
      };
      const response = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
      const client = new RaceChainClient({ toriiUrl: location.origin, networkId: network, nftCatalog: catalog, nftMarketQualified: true, nftMarketProfileId: nftSdk.nftMarketProfileIdV1(), fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        if (url.origin !== location.origin) throw new Error('Nonlocal fixture transport forbidden');
        if (url.pathname === '/v1/connect/session') return fetch(input, init);
        if (url.pathname === '/v1/nft-offers/capabilities') return response({ version: 1, network_id: network, native_nft_market: true, protocol_id: nftSdk.nftMarketProfileIdV1(), qualified: true });
        if (url.pathname.startsWith('/v1/nft-offers/')) return response(quote());
        if (url.pathname === '/v1/explorer/nfts') {
          const index = state.listRequests.length;
          state.listRequests.push({ method: init?.method ?? 'GET', params: Object.fromEntries(url.searchParams) });
          if (index >= state.listPages.length) throw new Error('Inventory fixture requested an unexpected extra page');
          const body = structuredClone(state.listPages[index]);
          if (state.holdList) return new Promise(resolve => state.pendingLists.push(() => resolve(response(body))));
          return response(body);
        }
        if (url.pathname.startsWith('/v1/explorer/nfts/')) {
          const id = decodeURIComponent(url.pathname.slice('/v1/explorer/nfts/'.length));
          state.reads++;
          const body = { id, owned_by: id === ownedId ? state.ownedBy : custody, metadata };
          if (state.hold) return new Promise(resolve => state.pending.push(() => resolve(response(body))));
          return response(body);
        }
        state.unexpected.push({ path: url.pathname, method: init?.method ?? 'GET' });
        throw new Error(`Unexpected fixture transport: ${url.pathname}`);
      } });
      window.musicWalletFixture = { client, state, quote, fee, ownedId, network, metadata, walletTaira: wallet.toI105(369), walletDefault: wallet.toI105(), other: other.toI105(), signingPublicKey: Array.from(ed25519.getPublicKey(new Uint8Array(32).fill(91))) };
      return { walletTaira: wallet.toI105(369), walletDefault: wallet.toI105(), networkBytes: Array.from(NetworkId.parse(network).toBytes()) };
    });
    accountId = identity.walletTaira; networkBytes = identity.networkBytes;
    const connect = () => page.evaluate(async () => { const session = await window.musicWalletFixture.client.connect(); await session.waitForApproval; return window.musicWalletFixture.client.state.account; });
    assert.equal(await connect(), identity.walletTaira);
    const owned = await page.evaluate(async () => { const f = window.musicWalletFixture; return f.client.getOwnedMusicNft(f.ownedId); });
    assert.equal(owned.owner, identity.walletDefault);
    checks.push('Real Taira wallet approval accepts music ownership with the same native account under the default display prefix');
    const wrongOwner = await page.evaluate(async () => {
      const f = window.musicWalletFixture; f.state.ownedBy = f.other;
      try { await f.client.getOwnedMusicNft(f.ownedId); return ''; } catch (error) { return String(error); }
    });
    assert.match(wrongOwner, /ownership could not be established/);
    const malformedOwner = await page.evaluate(async () => {
      const f = window.musicWalletFixture; f.state.ownedBy = f.walletDefault.slice(0, -1) + (f.walletDefault.endsWith('1') ? '2' : '1');
      try { await f.client.getOwnedMusicNft(f.ownedId); return ''; } catch (error) { return String(error); }
    });
    assert.ok(malformedOwner);
    assert.equal(requests.length, 0);
    checks.push('Approved music downloads reject a different controller and malformed account checksum without requesting a wallet signature');
    await page.evaluate(() => {
      const f = window.musicWalletFixture; f.state.ownedBy = f.walletDefault; f.state.hold = true;
      const attempt = f.state.download = { done: false };
      void f.client.getOwnedMusicNft(f.ownedId).then(value => { attempt.value = value; }).catch(error => { attempt.error = String(error); }).finally(() => { attempt.done = true; });
    });
    await page.waitForFunction(() => window.musicWalletFixture.state.pending.length === 1);
    await page.evaluate(() => window.musicWalletFixture.client.disconnect());
    accountId = identity.walletDefault;
    assert.equal(await connect(), identity.walletDefault);
    await page.evaluate(() => { const state = window.musicWalletFixture.state; state.hold = false; state.pending.splice(0).forEach(resolve => resolve()); });
    await page.waitForFunction(() => window.musicWalletFixture.state.download.done);
    const stale = await page.evaluate(() => ({ attempt: window.musicWalletFixture.state.download, account: window.musicWalletFixture.client.state.account }));
    assert.match(stale.attempt.error, /Wallet connection changed/);
    assert.equal(stale.attempt.value, undefined); assert.equal(stale.account, identity.walletDefault);
    checks.push('Disconnect and same-controller reconnect under another address literal invalidate an outstanding music download');
    accountId = identity.walletTaira;
    assert.equal(await connect(), identity.walletTaira);
    const listResults = await page.evaluate(async () => {
      const f = window.musicWalletFixture, expectedOwner = f.client.state.account, results = [];
      const item = (n, owned_by = f.walletDefault) => ({ id: `listed_music_${n}$sora_cars.universal`, owned_by, metadata: f.metadata });
      const page = (items, next_cursor = null, limit = 100) => ({ pagination: { limit, next_cursor, has_more: next_cursor !== null }, items });
      const cursor = 'cGFnZS0y', cursor3 = 'cGFnZS0z';
      async function run(name, pages, accepted, expectedRequests, errorPattern) {
        f.state.listPages = pages; f.state.listRequests = [];
        let inventory, error;
        try { inventory = await f.client.listOwnedNfts(); } catch (cause) { error = String(cause); }
        if (Boolean(inventory) !== accepted) throw new Error(`${name}: unexpected result ${error ?? 'accepted'}`);
        if (errorPattern && !new RegExp(errorPattern).test(error)) throw new Error(`${name}: unexpected rejection ${error}`);
        if (f.state.listRequests.length !== expectedRequests) throw new Error(`${name}: wrong page-request count`);
        f.state.listRequests.forEach((request, index) => {
          const expected = { limit: '100', owned_by: expectedOwner, domain: 'sora_cars.universal', ...(index ? { cursor: pages[index - 1].pagination.next_cursor } : {}) };
          if (request.method !== 'GET' || JSON.stringify(Object.entries(request.params).sort()) !== JSON.stringify(Object.entries(expected).sort())) throw new Error(`${name}: changed owner, cursor, domain or page limit in query`);
        });
        results.push({ name, accepted, error, requests: f.state.listRequests });
        return inventory;
      }
      const inventory = await run('Approved inventory follows exact owner/domain/cursor queries across mixed-prefix pages', [page([item(1), item(2, f.walletTaira)], cursor), page([item(3)])], true, 2);
      if (inventory.ownerAccountId !== expectedOwner || inventory.items.length !== 3 || inventory.items.some((value, index) => value.ownedBy !== expectedOwner || value.id !== item(index + 1).id || JSON.stringify(value.metadata) !== JSON.stringify(f.metadata))) throw new Error('Inventory did not preserve exact item identities and metadata while aligning the owner display literal');
      await run('Inventory rejects another native account controller', [page([item(1, f.other)])], false, 1, "another owner's item");
      const badChecksum = f.walletDefault.slice(0, -1) + (f.walletDefault.endsWith('1') ? '2' : '1');
      await run('Inventory rejects malformed owner checksums before display normalization', [page([item(1, badChecksum)])], false, 1);
      await run('Inventory rejects extra NFT record fields before display normalization', [page([{ ...item(1), extra: true }])], false, 1, 'unsupported field');
      await run('Inventory rejects missing NFT metadata', [page([{ id: item(1).id, owned_by: f.walletDefault }])], false, 1);
      await run('Inventory rejects non-object NFT metadata', [page([{ ...item(1), metadata: [] }])], false, 1, 'plain object');
      await run('Inventory rejects another collection domain', [page([{ ...item(1), id: 'listed_music_1$other.universal' }])], false, 1, "another domain's item");
      await run('Inventory rejects duplicate NFT IDs across pages', [page([item(1)], cursor), page([item(1)])], false, 2, 'repeated an item');
      await run('Inventory rejects a repeated cursor without bounded progress', [page([item(1)], cursor), page([item(2)], cursor)], false, 2, 'bounded progress');
      await run('Inventory rejects malformed cursor characters', [page([item(1)], 'not a cursor!')], false, 1, 'canonical base64url');
      await run('Inventory rejects noncanonical base64url cursor trailing bits', [page([item(1)], 'AB')], false, 1, 'canonical base64url');
      await run('Inventory rejects a response with the wrong requested limit', [page([item(1)], null, 99)], false, 1, 'page geometry');
      await run('Inventory rejects more items than the requested page limit', [page(Array.from({ length: 101 }, (_, i) => item(i)))], false, 1, 'must not exceed');
      await run('Inventory rejects extra page fields', [{ ...page([item(1)]), extra: true }], false, 1, 'unknown field');
      await run('Inventory rejects extra pagination fields', [{ ...page([item(1)]), pagination: { ...page([]).pagination, extra: true } }], false, 1, 'unknown field');
      await run('Inventory rejects an empty continuing page', [page([], cursor)], false, 1, 'bounded progress');
      const hundred = start => Array.from({ length: 100 }, (_, i) => item(start + i));
      await run('Inventory rejects continuation at the 256-item bound', [page(hundred(0), cursor), page(hundred(100), cursor3), page(Array.from({ length: 56 }, (_, i) => item(200 + i)), 'cGFnZS00')], false, 3, 'bounded progress');
      await run('Inventory rejects a 257th item even on the final page', [page(hundred(0), cursor), page(hundred(100), cursor3), page(Array.from({ length: 57 }, (_, i) => item(200 + i)))], false, 3, 'exceeds item bound');
      return results;
    });
    assert.equal(listResults.length, 18);
    checks.push(...listResults.map(result => result.name));
    assert.equal(requests.length, 0, 'Inventory reads never ask the wallet for a signature');
    await page.evaluate(() => {
      const f = window.musicWalletFixture;
      f.state.listPages = [{ pagination: { limit: 100, next_cursor: null, has_more: false }, items: [{ id: 'stale_list_music$sora_cars.universal', owned_by: f.walletDefault, metadata: f.metadata }] }];
      f.state.listRequests = []; f.state.holdList = true;
      const attempt = f.state.listing = { done: false };
      void f.client.listOwnedNfts().then(value => { attempt.value = value; }).catch(error => { attempt.error = String(error); }).finally(() => { attempt.done = true; });
    });
    await page.waitForFunction(() => window.musicWalletFixture.state.pendingLists.length === 1);
    const heldQuery = await page.evaluate(() => window.musicWalletFixture.state.listRequests);
    assert.deepEqual(heldQuery, [{ method: 'GET', params: { limit: '100', owned_by: identity.walletTaira, domain: 'sora_cars.universal' } }]);
    await page.evaluate(() => window.musicWalletFixture.client.disconnect());
    accountId = identity.walletDefault;
    assert.equal(await connect(), identity.walletDefault);
    await page.evaluate(() => { const state = window.musicWalletFixture.state; state.holdList = false; state.pendingLists.splice(0).forEach(resolve => resolve()); });
    await page.waitForFunction(() => window.musicWalletFixture.state.listing.done);
    const staleList = await page.evaluate(() => ({ attempt: window.musicWalletFixture.state.listing, account: window.musicWalletFixture.client.state.account, requests: window.musicWalletFixture.state.listRequests }));
    assert.match(staleList.attempt.error, /Wallet connection changed/);
    assert.equal(staleList.attempt.value, undefined); assert.equal(staleList.account, identity.walletDefault); assert.equal(staleList.requests.length, 1);
    checks.push('Outstanding inventory list is invalidated by disconnect and same-controller reconnect under another account literal');
    accountId = identity.walletTaira;
    assert.equal(await connect(), identity.walletTaira);
    const wrongBuyer = await page.evaluate(async () => {
      const f = window.musicWalletFixture; f.state.reservedBuyer = f.other;
      try { await f.client.purchaseNft(f.quote(), f.fee); return ''; } catch (error) { return String(error); }
    });
    assert.match(wrongBuyer, /reserved for another buyer/); assert.equal(requests.length, 0);
    checks.push('A reservation for another controller is rejected before any wallet signing request');
    const stopped = await page.evaluate(async () => {
      const f = window.musicWalletFixture; f.state.reservedBuyer = f.walletDefault;
      try { await f.client.purchaseNft(f.quote(), f.fee); return ''; } catch (error) { return String(error); }
    });
    assert.equal(requests.length, 1, 'Same-controller reservation reaches the actual encrypted wallet channel');
    assert.ok(stopped, 'The fixture closes the wallet before a signature can be returned');
    const captured = requests[0], creationTimeMs = compactFields(captured.payload)[2].readBigUInt64LE().toString();
    const exactPayload = await page.evaluate(({ payload, creationTimeMs }) => {
      const { nftSdk, transactions, NetworkId } = window.musicWalletDeps, f = window.musicWalletFixture;
      const bytes = Uint8Array.from(payload);
      const networkId = NetworkId.parse(f.network);
      transactions.validateBrowserInstructionTransactionSignable({ networkId, authority: f.walletTaira, signingPublicKey: Uint8Array.from(f.signingPublicKey), payloadBytes: bytes, payloadHashHex: transactions.browserTransactionPayloadHashHex(bytes) });
      const normalized = nftSdk.normalizeNftSaleRecordV1(f.quote(), f.network);
      const expected = transactions.buildBrowserInstructionTransactionPayload({ networkId, authority: f.walletTaira, instructions: [nftSdk.buildNftMarketInstructionV1('BuyNftV1', { offer: normalized.offer })], feePayment: f.fee, creationTimeMs: BigInt(creationTimeMs), ttlMs: 120_000 });
      return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
    }, { payload: Array.from(captured.payload), creationTimeMs });
    assert.equal(exactPayload, true);
    checks.push('Same-controller reserved buyer across prefixes reaches one encrypted signing request with exact immutable one-XOR terms and separate fee; wallet closes before signing or submission');
    const final = await page.evaluate(() => ({ unexpected: window.musicWalletFixture.state.unexpected, reads: window.musicWalletFixture.state.reads }));
    assert.deepEqual(final.unexpected, []); assert.equal(final.reads, 6);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    return checks;
  } finally {
    if (browser) await browser.close();
    if (sockets) { for (const ws of sockets.clients) ws.terminate(); await new Promise(resolve => sockets.close(resolve)); }
    if (server) await server.close();
  }
}
