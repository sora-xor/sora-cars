import { finalizeBrowserInstructionTransaction as finalize } from '@iroha/iroha-js/transaction-codec';
import { withOwnedResources, closeWebSocketServer } from './lib/harness-lifecycle.mjs';
import { currentGameFixtures, currentGameProofFixtures } from './lib/current-game-fixtures.mjs';
import { nativeSourceRoot } from './lib/native-source-root.mjs';
import { manifestCommitment, outcomeCommitment } from '../src/chain/certificates.ts';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'vite';
import { WebSocketServer } from 'ws';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { AccountAddress } from '@iroha/iroha-js/address';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { buildGameInstructionV1, decodeGameValueV1, encodeGameValueV1, gameHashLiteralV1 } from '@iroha/iroha-js/game';
import { decodeRaceFrameV1 } from '@iroha/iroha-js/race';
import { nftContentHashV1, nftMarketProfileIdV1, nftSaleOfferHashV1, buildNftMarketInstructionV1 } from '@iroha/iroha-js/nft';
import { browserSignedTransactionHashHex, browserTransactionPayloadHashHex, buildBrowserInstructionTransactionPayload, validateBrowserInstructionTransactionSignable } from '@iroha/iroha-js/transaction-codec';
import { noritoDecodeInstructionBoxArchive } from '@iroha/iroha-js/norito';
import { createTestWallet, compactFields } from './fixtures/connect-wallet.mjs';

const releaseProvenance = JSON.parse(await readFile('src/game/generated/provenance.json', 'utf8'));
assert.equal(releaseProvenance.cryptographicQualification, false, 'exercise the actual unqualified release without overriding its evidence');
const native = currentGameFixtures();
const value = name => {
  const row = native.vectors.find(row => row.name === name);
  assert.ok(row, `required current native row ${name}`);
  return row.value;
};
const currentProof = currentGameProofFixtures();
const proofRow = name => {
  const row = currentProof.vectors.find(row => row.name === name);
  assert.ok(row, `required genuine native row ${name}`);
  return row;
};
const generated = JSON.parse(await readFile('src/game/generated/race-v1-kernels.json', 'utf8'));
const currentProfileId = gameHashLiteralV1(Buffer.from(generated.profile_id, 'hex'));
// Require a fresh native proof and its complete source/provenance. The bounded
// two-car proof covers six physical ticks and twelve accepted history ticks.
const corpusPath = process.env.SORA_CARS_GAME_CURRENT_PROOF_CORPUS ?? join(nativeSourceRoot(), 'javascript/iroha_js/test/fixtures/game_current_proof_v1/fixtures.json');
const proofPath = join(dirname(corpusPath), currentProof.source_proof_file);
const evidence = process.env.SORA_CARS_TEST_OUTPUT ?? 'output/playwright/wallet';
const proofBytes = await readFile(proofPath);
assert.equal(createHash('sha256').update(proofBytes).digest('hex'), currentProof.source_proof_sha256);
assert.equal(proofBytes.toString('hex').toUpperCase(), proofRow('ExecutionProofEnvelopeV1').encoded_hex);
const proof = decodeGameValueV1('ExecutionProofEnvelopeV1', proofBytes);
assert.equal(proof.profile_id, currentProfileId, 'wallet rejection fixture requires the current native execution profile');
const proofPayload = decodeRaceFrameV1('RaceProofPayloadV1', Uint8Array.from(proof.proof_bytes));
const context = { networkId: proof.statement.network_id, raceId: proof.statement.session_id, activeScope: { manifest: proof.statement.manifest_commitment, admission: proof.statement.admission_commitment } };
assert.equal(outcomeCommitment(context, proofPayload.outcome), proof.statement.outcome_commitment);
assert.equal(Buffer.from(encodeGameValueV1('GameOutcomeV1', proofPayload.outcome)).toString('hex').toUpperCase(), proofRow('GameOutcomeV1').encoded_hex);
assert.equal(proofPayload.replay.player_count, 2); assert.equal(proofPayload.replay.frames.length, 6);
assert.equal(proofPayload.accepted_through_tick, 12);
assert.equal(proofPayload.history_evidence.transcript.batches.length, 2);
const open = structuredClone(value('OpenGameSessionV1'));
open.manifest = structuredClone(proofPayload.manifest);
const network = NetworkId.parse(proof.statement.network_id);
const key = new Uint8Array(32).fill(87), publicKey = ed25519.getPublicKey(key);
const account = { privateKey: key, publicKey, accountId: AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey }).toI105() };
const accountId = seed => AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(seed)) }).toI105();
const seller = accountId(88), custody = accountId(89), foreign = nftContentHashV1({ foreign: 'test network' });
const metadata = { sora_cars: { version: 1, application_id: open.manifest.application_id, sku: 'test-livery', kind: 'skin' }, title: '試験専用 / TEST ONLY' };
const contentHash = nftContentHashV1(metadata), ownId = 'owned$sora_cars.universal', saleId = 'sale$sora_cars.universal';
const offer = { network_id: network.toString(), offer_id: nftContentHashV1({ offer: 'mock transport' }), nft_id: saleId, seller, payment_asset: open.asset_definition, price: '7.5', expires_at_height: 100, reserved_buyer: account.accountId, metadata_hash: contentHash };
const quote = { version: 1, offer, offer_hash: nftSaleOfferHashV1(offer), custody, status: { kind: 'open', value: null }, created_at_height: 1, closed_at_height: null };
const reviewedManifestHash = manifestCommitment(network.toString(), open.session_id, open.manifest);
const fixture = {
  config: { networkId: network.toString(), profileId: proof.profile_id, applicationId: open.manifest.application_id, nftMarketQualified: true, nftMarketProfileId: nftMarketProfileIdV1(), nftCatalog: { applicationId: open.manifest.application_id, domain: 'sora_cars.universal', xorAssetDefinition: open.asset_definition, sellers: [seller], items: [{ sku: 'test-livery', kind: 'skin', contentHash }] } },
  asset: open.asset_definition, quote, foreign, open,
  join: { ...value('JoinGameSessionV1'), session_id: open.session_id, expected_manifest_commitment: reviewedManifestHash, application_data: [0], resources: [], invitation: null },
  stake: { session_id: open.session_id, nft_id: ownId, expected_manifest_commitment: reviewedManifestHash },
  settlement: { session_id: proof.statement.session_id, proof, outcome: proofPayload.outcome },
};
const feePayment = { payer: 'authority', chargeLimits: [{ kind: 'nexus', assetDefinitionId: fixture.asset, maxAmount: '0.25' }] };
const settlementPayloadBytes = buildBrowserInstructionTransactionPayload({ networkId: network, authority: account.accountId,
  instructions: [buildGameInstructionV1('SettleGameSessionV1', fixture.settlement)], feePayment, creationTimeMs: 1n, ttlMs: 120_000 }).length;
assert.ok(settlementPayloadBytes > 64_000, 'retain the actual large-proof fixture; do not pad or replace it');
assert.ok(settlementPayloadBytes <= 4 * 1024 * 1024, 'the retained proof must fit the advertised large-transaction corridor');
const state = { profileQualified: true, marketQualified: true, saleOwner: custody, quote, holdNft: false, pendingReads: [], nftReads: 0, transportChecks: 0, holdRegistration: false, pendingRegistrations: [], connectedSids: [], wrongApprovalNetwork: false, corruptSignature: false, transportReady: false, signed: [], submitted: [], errors: [] };
const sessions = new Map();
const json = (response, value, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
async function body(request) { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; assert.ok(size <= 4 * 1024 * 1024 + 4096); chunks.push(chunk); } return Buffer.concat(chunks); }
function approveResponse(request, origin) {
  const uri = role => `iroha://connect?${new URLSearchParams({ sid: request.sid, network_id: request.network_id, app_pk: request.app_pk, nonce: request.nonce, v: '1', role, node: origin, token: (role === 'wallet' ? 'B' : 'A').repeat(43), relay: 'D'.repeat(43) })}`;
  return { ...request, node: undefined, wallet_uri: uri('wallet'), app_uri: uri('app'), token_app: 'A'.repeat(43), token_wallet: 'B'.repeat(43), token_management: 'C'.repeat(43), token_relay: 'D'.repeat(43) };
}
const reportPath = `${evidence}/qualification.json`;
await rm(reportPath, { force: true });
const report = await withOwnedResources(async own => {
own('wallet diagnostics', state, () => { if (state.errors.length) console.error(state.errors); });
const server = own('Vite server', await createServer({ cacheDir: 'node_modules/.vite-wallet', server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [{ name: 'local-wallet-test-only', configureServer(vite) {
  vite.middlewares.use((request, response, next) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname !== '/fixture' && !url.pathname.startsWith('/v1/')) return next();
    void (async () => {
      if (url.pathname === '/fixture') return json(response, fixture);
      if (url.pathname === '/v1/games/capabilities') return json(response, { version: 1, enabled: true, native_game_sessions: true, network_id: network.toString(), execution_transport_ready: true, profiles: [{ profile_id: fixture.config.profileId, qualified: state.profileQualified }] });
      if (url.pathname === '/v1/connect/status') {
        state.transportChecks++;
        return json(response, { enabled: true, policy: { frame_max_bytes: state.transportReady ? 4 * 1024 * 1024 + 4096 : 64000, session_buffer_max_bytes: state.transportReady ? 8 * 1024 * 1024 : 262144 } });
      }
      if (url.pathname === '/v1/nft-offers/capabilities') return json(response, { version: 1, network_id: network.toString(), protocol_id: nftMarketProfileIdV1(), native_nft_market: true, qualified: state.marketQualified });
      if (url.pathname === `/v1/nft-offers/${encodeURIComponent(offer.offer_id)}`) return json(response, state.quote);
      if (url.pathname.startsWith('/v1/explorer/nfts/')) {
        const id = decodeURIComponent(url.pathname.slice('/v1/explorer/nfts/'.length));
        state.nftReads++;
        const send = () => json(response, { id, owned_by: id === ownId ? account.accountId : state.saleOwner, metadata });
        if (state.holdNft) { state.pendingReads.push(send); state.notifyRead?.(); } else send(); return;
      }
      if (url.pathname === '/v1/connect/session') {
        const requestBody = JSON.parse((await body(request)).toString()); assert.equal(requestBody.network_id, network.toString());
        sessions.set(requestBody.sid, requestBody);
        const send = () => json(response, approveResponse(requestBody, requestBody.node));
        if (state.holdRegistration) { state.pendingRegistrations.push({ sid: requestBody.sid, send }); state.notifyRegistration?.(); } else send();
        return;
      }
      if (url.pathname === '/v1/pipeline/transactions') {
        const signed = await body(request), hash = browserSignedTransactionHashHex(signed);
        assert.equal(state.signed.at(-1)?.transactionHash, hash, 'only exact wallet-approved bytes are submitted');
        response.setHeader('x-iroha-entrypoint-hash', hash);
        response.setHeader('x-iroha-signed-transaction-hash', hash);
        state.submitted.push({ hash, bytes: signed.length }); return json(response, { hash }, 202);
      }
      if (url.pathname === '/v1/pipeline/transactions/status') return json(response, { hash: url.searchParams.get('hash'), status: { kind: 'Applied', block_height: 2 }, scope: 'global', resolved_from: 'state' });
      throw new Error(`Unexpected mock route ${request.method} ${url.pathname}`);
    })().catch(error => { state.errors.push(String(error)); json(response, { error: String(error) }, 500); });
  });
} }] }), resource => resource.close());
const sockets = own('wallet WebSocket server', new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 + 4096 }), closeWebSocketServer);
const upgrade = (request, socket, head) => {
  if (new URL(request.url, 'http://127.0.0.1').pathname === '/v1/connect/ws') sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws, request));
};
server.httpServer.on('upgrade', upgrade);
own('wallet upgrade listener', upgrade, handler => server.httpServer.off('upgrade', handler));
sockets.on('connection', (ws, request) => {
  const params = new URL(request.url, 'http://127.0.0.1').searchParams, registered = sessions.get(params.get('sid'));
  assert.ok(registered); assert.equal(params.get('role'), 'app');
  state.connectedSids.push(registered.sid);
  const preview = { sidBytes: Buffer.from(registered.sid, 'base64url'), appKeyPair: { publicKey: Buffer.from(registered.app_pk, 'base64url') }, networkId: network };
  const wallet = createTestWallet(preview, account, 'D'.repeat(43)); let approved = false;
  ws.on('message', raw => {
    try {
      const request = wallet.request(Buffer.from(raw));
      if (!approved) { approved = true; ws.send(wallet.approve(state.wrongApprovalNetwork ? { ...preview, networkId: NetworkId.parse(foreign) } : preview)); return; }
      if (!request) return;
      const payloadHashHex = browserTransactionPayloadHashHex(request.txBytes);
      validateBrowserInstructionTransactionSignable({ networkId: network, authority: account.accountId, signingPublicKey: publicKey, payloadBytes: request.txBytes, payloadHashHex }, { networkId: network, authority: account.accountId, signingPublicKey: publicKey });
      const payloadFields = compactFields(request.txBytes); assert.equal(payloadFields.length, 10);
      const creationTimeMs = payloadFields[2].readBigUInt64LE(), executable = payloadFields[3];
      assert.equal(executable.readUInt32LE(), 0, 'native instruction transaction');
      const instructionsVector = compactFields(executable.subarray(4))[0], archives = compactFields(instructionsVector.subarray(8));
      assert.equal(Number(instructionsVector.readBigUInt64LE()), archives.length);
      const instructions = archives.map(bytes => noritoDecodeInstructionBoxArchive(bytes));
      // This unqualified release may exercise its independently configured NFT
      // market, but no race instruction may reach the wallet for a signature.
      const expected = [buildNftMarketInstructionV1('BuyNftV1', { offer })];
      assert.deepEqual(instructions, expected, 'wallet reviews exact instruction terms');
      assert.deepEqual(request.txBytes, Buffer.from(buildBrowserInstructionTransactionPayload({ networkId: network, authority: account.accountId, instructions: expected, feePayment, creationTimeMs, ttlMs: 120_000 })), 'wallet reviews exact separate fee limit and network scope');
      const signature = ed25519.sign(Buffer.from(payloadHashHex, 'hex'), key);
      if (state.corruptSignature) signature[0] ^= 1;
      const canonicalHash = Buffer.from(canonicalEntryHash(request.txBytes)).toString('hex');
      state.signed.push({ instructions: instructions.map(value => Object.keys(value)[0]), payloadBytes: request.txBytes.length, transactionHash: canonicalHash, feeLimit: '0.25', price: '7.5' });
      ws.send(wallet.signed(request.seq, signature));
    } catch (error) { state.errors.push(error.stack ?? String(error)); ws.close(); }
  });
});
// Transaction entrypoint hash is the canonical domain-separated payload hash used by this SDK.
function canonicalEntryHash(payload) {
  // Obtain the exact entrypoint hash via SDK finalization, not a locally invented hash recipe.
  const signable = { networkId: network, authority: account.accountId, signingPublicKey: publicKey, payloadBytes: payload, payloadHashHex: browserTransactionPayloadHashHex(payload) };
  return finalize(signable, ed25519.sign(Buffer.from(signable.payloadHashHex, 'hex'), key), publicKey).hash;
}
await server.listen();
const port = server.httpServer.address().port, origin = `http://127.0.0.1:${port}`, browser = own('Chromium browser', await chromium.launch({ headless: true }), resource => resource.close());
const results = [];
  const page = await browser.newPage(); page.on('pageerror', error => state.errors.push(error.message));
  await page.goto(`${origin}/tests/connect-harness.html`); await page.waitForFunction(() => !!window.connectHarness);
  const holdRegistration = async () => {
    state.holdRegistration = true;
    let timer;
    const arrived = new Promise((resolve, reject) => { state.notifyRegistration = resolve; timer = setTimeout(() => reject(new Error('Held registration request did not arrive')), 5000); });
    await page.evaluate(() => window.connectHarness.startHeldConnect());
    await arrived.finally(() => clearTimeout(timer)); state.notifyRegistration = null;
    assert.equal(state.pendingRegistrations.length, 1);
    return state.pendingRegistrations.shift();
  };
  {
    const delayed = await holdRegistration();
    await page.evaluate(() => window.connectHarness.disconnect());
    const eventCount = await page.evaluate(() => window.connectHarness.pairingEvents.length);
    state.holdRegistration = false; delayed.send();
    await page.waitForFunction(() => window.connectHarness.pendingPairing?.done);
    const cancelled = await page.evaluate(() => ({ attempt: window.connectHarness.pendingPairing, state: window.connectHarness.state }));
    assert.match(cancelled.attempt.error, /cancelled|disconnect|closed|abort/i);
    assert.equal(cancelled.attempt.walletUri, undefined); assert.equal(cancelled.attempt.account, undefined);
    assert.equal(cancelled.state.account, null); assert.equal(cancelled.state.walletUri, null); assert.equal(cancelled.state.phase, 'ready');
    assert.equal(state.connectedSids.includes(delayed.sid), false, 'cancelled registration must not open a late wallet socket');
    assert.deepEqual(await page.evaluate(from => window.connectHarness.pairingEvents.slice(from), eventCount), [], 'late registration cannot restore pairing or mutate the cancelled client');
    results.push('disconnect during delayed canonical registration prevents a late pairing URI, wallet socket or approved account');
  }
  {
    const delayed = await holdRegistration();
    await page.evaluate(() => window.connectHarness.disconnect());
    state.holdRegistration = false;
    const replacement = await page.evaluate(() => window.connectHarness.connect());
    assert.equal(replacement.account, account.accountId);
    const replacementSid = new URL(replacement.walletUri).searchParams.get('sid');
    assert.notEqual(replacementSid, delayed.sid);
    const eventCount = await page.evaluate(() => window.connectHarness.pairingEvents.length);
    delayed.send();
    await page.waitForFunction(() => window.connectHarness.pendingPairing?.done);
    assert.match(await page.evaluate(() => window.connectHarness.pendingPairing.error), /cancelled|disconnect|closed|abort/i);
    assert.equal(await page.evaluate(() => window.connectHarness.state.account), account.accountId);
    assert.equal(await page.evaluate(() => window.connectHarness.state.phase), 'connected');
    assert.equal(state.connectedSids.includes(delayed.sid), false);
    assert.deepEqual(await page.evaluate(from => window.connectHarness.pairingEvents.slice(from), eventCount), [], 'late old registration cannot overwrite a genuinely signed replacement approval');
    results.push('late cancelled registration cannot replace or close a newer cryptographically approved wallet session');
  }
  const connected = await page.evaluate(() => window.connectHarness.connect()); assert.equal(connected.account, account.accountId); assert.equal(connected.canStake, false);
  const walletUri = new URL(connected.walletUri), registered = sessions.get(walletUri.searchParams.get('sid'));
  assert.ok(registered); assert.equal(walletUri.protocol, 'iroha:'); assert.equal(walletUri.hostname, 'connect');
  assert.equal(walletUri.pathname, ''); assert.equal(walletUri.hash, '');
  assert.equal(connected.walletUri, approveResponse(registered, origin).wallet_uri, 'pairing QR receives the exact canonical registered wallet URI without a launcher-only scheme rewrite');
  for (const field of ['sid', 'network_id', 'app_pk', 'nonce']) assert.equal(walletUri.searchParams.get(field), registered[field]);
  assert.equal(walletUri.searchParams.get('role'), 'wallet'); assert.equal(walletUri.searchParams.get('node'), origin);
  assert.equal(walletUri.searchParams.get('token'), 'B'.repeat(43)); assert.equal(walletUri.searchParams.get('relay'), 'D'.repeat(43));
  results.push('pairing QR URI preserves canonical iroha://connect and every network/session/key/nonce/role/node/token binding');
  const rejects = async (operation, pattern) => { const signed = state.signed.length, submitted = state.submitted.length; const message = await page.evaluate(async operation => { try { await window.connectHarness[operation](); return ''; } catch (error) { return String(error); } }, operation); assert.match(message, pattern); assert.equal(state.signed.length, signed); assert.equal(state.submitted.length, submitted); };
  const localQualification = /bundled execution proof is not cryptographically qualified/;
  for (const qualified of [false, true]) {
    state.profileQualified = qualified;
    const reported = await page.evaluate(() => window.connectHarness.probe());
    assert.equal(reported.capability.enabled, true);
    assert.equal(reported.capability.proof_qualified, qualified);
    assert.equal(reported.capability.execution_transport_ready, true);
    assert.match(reported.reason, localQualification);
    assert.equal(await page.evaluate(() => window.connectHarness.canStake), false);
    const reads = state.nftReads, transportChecks = state.transportChecks;
    for (const operation of ['open', 'join', 'settle']) await rejects(operation, localQualification);
    assert.equal(state.nftReads, reads, 'unqualified joins stop before NFT ownership reads');
    assert.equal(state.transportChecks, transportChecks, 'unqualified settlement stops before large-proof transport preflight');
  }
  results.push('endpoint profile and transport readiness remain reports; the bundled unqualified release rejects open, join and settlement before wallet signing');
  await rejects('openForeignProfile', /Session profile differs from this release/);
  results.push('wrong-profile new session cannot request a signature');
  for (const mode of ['other-session', 'other-manifest', 'extra', 'equipment', 'equipment-wager-overlap']) {
    const signed = state.signed.length, submitted = state.submitted.length;
    const message = await page.evaluate(async mode => { try { await window.connectHarness.badBatch(mode); return ''; } catch (error) { return String(error); } }, mode);
    assert.match(message, localQualification); assert.equal(state.signed.length, signed); assert.equal(state.submitted.length, submitted);
  }
  results.push('all tested join/item variants stop at local qualification; deeper qualified-batch validation is not claimed');
  await page.evaluate(() => window.connectHarness.purchase()); assert.equal(state.submitted.length, 1);
  assert.equal(await page.evaluate(() => window.connectHarness.canStake), false);
  results.push('real encrypted Connect approval and exact-price BuyNftV1 signature with separate wallet-approved fee while race staking remains disabled');
  state.marketQualified = false; await rejects('purchase', /Native marketplace is not qualified/); state.marketQualified = true;
  results.push('the independently pinned NFT policy still requires endpoint market readiness');
  state.saleOwner = seller; await rejects('purchase', /Offer does not match the reviewed catalog/); state.saleOwner = custody;
  results.push('changed NFT custody cannot request a purchase signature');
  const changedOffer = { ...offer, price: '8' }; state.quote = { ...quote, offer: changedOffer, offer_hash: nftSaleOfferHashV1(changedOffer) }; await rejects('purchase', /Offer changed/); state.quote = quote; results.push('changed exact purchase quote cannot request a signature');
  state.holdNft = true;
  let readTimer; const heldRead = new Promise((resolve, reject) => { state.notifyRead = resolve; readTimer = setTimeout(() => reject(new Error('Held NFT request did not arrive')), 5000); });
  const signedBeforeRead = state.signed.length;
  await page.evaluate(() => {
    const attempt = window.walletPurchaseAttempt = { done: false };
    void window.connectHarness.purchase().then(result => { attempt.hash = result.hash; }).catch(error => { attempt.error = String(error); }).finally(() => { attempt.done = true; });
  });
  await heldRead.finally(() => clearTimeout(readTimer)); state.notifyRead = null; assert.equal(state.pendingReads.length, 1);
  await page.evaluate(() => window.connectHarness.disconnect()); state.holdNft = false; state.pendingReads.splice(0).forEach(send => send());
  await page.waitForFunction(() => window.walletPurchaseAttempt?.done); assert.match(await page.evaluate(() => window.walletPurchaseAttempt.error), /Wallet session changed/);
  assert.equal(state.signed.length, signedBeforeRead); assert.equal(state.submitted.length, 1); results.push('stale wallet generation during purchase NFT read cannot sign');
  await page.evaluate(() => window.connectHarness.connect()); state.corruptSignature = true;
  const corrupt = await page.evaluate(async () => { try { await window.connectHarness.purchase(); return ''; } catch (error) { return String(error); } });
  assert.match(corrupt, /signature does not verify/); assert.equal(state.submitted.length, 1); state.corruptSignature = false; results.push('invalid wallet signature rejected locally before submission');
  state.wrongApprovalNetwork = true; await page.evaluate(() => window.connectHarness.reset());
  const wrongApproval = await page.evaluate(async () => { try { await window.connectHarness.connect(); return ''; } catch (error) { return String(error); } });
  assert.match(wrongApproval, /signature.*invalid|signature.*verify|approval.*signature/i); assert.equal(state.submitted.length, 1); results.push('foreign-network signed approval rejected by actual Connect SDK');
  {
    state.wrongApprovalNetwork = false; await page.evaluate(() => window.connectHarness.reset()); await page.evaluate(() => window.connectHarness.connect());
    for (const ready of [false, true]) {
      state.transportReady = ready;
      await page.evaluate(() => window.connectHarness.probe());
      await rejects('settle', localQualification);
      assert.equal(await page.evaluate(() => window.connectHarness.canStake), false);
    }
    assert.equal(state.transportChecks, 0, 'local qualification prevents even a transport-status request for the complete retained proof');
    results.push('a complete retained proof remains unsigned and unsubmitted regardless of advertised Connect corridor capacity');
  }
  await page.evaluate(() => window.connectHarness.disconnect());
  assert.deepEqual(state.errors, []);
  await mkdir(evidence, { recursive: true });
  return { passed: true, results, bundledExecutionQualified: releaseProvenance.cryptographicQualification, stakingEnabled: false, successfulRaceSigningTested: false, largeProofTransportPreflightTested: false, walletTransport: 'Local mock Torii + test wallet protocol counterpart; actual browser RaceChainClient, WebSocket, X25519, ChaCha20-Poly1305, canonical Norito wallet signable validation, Ed25519 approval and BuyNftV1 payload signatures. Race operations are rejected before signing.', retainedProof: { corpusPath, path: proofPath, physicalTicks: 6, acceptedThroughTick: 12, fullRaceQualified: false, sha256: createHash('sha256').update(proofBytes).digest('hex'), bytes: proofBytes.length, profileId: proof.profile_id, cryptographicallyReverifiedByThisTransportTest: false }, nativeFinalityVerified: false, deployedWalletInteroperability: false, submitted: state.submitted, walletRequests: state.signed };

});
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(`Wallet browser integration passed ${report.results.length} checks; actual Connect crypto/codecs, explicitly mocked node and wallet counterpart.`);
