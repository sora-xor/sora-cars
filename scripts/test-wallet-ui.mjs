// Real main.ts UI against an explicitly local Connect protocol counterpart.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'vite';
import { WebSocketServer } from 'ws';
import { chromium } from 'playwright';
import { ed25519 } from '@noble/curves/ed25519';
import { AccountAddress } from '@iroha/iroha-js/address';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { createTestWallet } from './fixtures/connect-wallet.mjs';

const deployment = JSON.parse(await readFile('../iroha/configs/soranexus/taira/explorer.runtime-config.json', 'utf8'));
const privateKey = new Uint8Array(32).fill(91), publicKey = ed25519.getPublicKey(privateKey);
const account = { privateKey, publicKey, accountId: AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey }).toI105() };
const evidence = process.env.SORA_CARS_TEST_OUTPUT ?? 'output/browser/taira-connect/ui';
const requests = [], sessions = new Map(), connections = [], failures = [], results = [];
let hold = false, unavailable = false;
const wait = async predicate => {
  const end = Date.now() + 8000;
  while (!predicate()) { assert.ok(Date.now() < end, 'local protocol event arrived within deadline'); await delay(20); }
};
const server = await createServer({
  cacheDir: 'node_modules/.vite-wallet-ui',
  define: { 'import.meta.env.VITE_TAIRA_NETWORK_ID': '""' },
  server: { host: '127.0.0.1', port: 0, hmr: false },
  plugins: [{ name: 'local-wallet-ui-counterpart', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (!req.url.startsWith('/v1/')) return next();
      void (async () => {
        assert.equal(req.url, '/v1/connect/session', 'pairing alone must not submit transactions');
        assert.equal(req.method, 'POST');
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        assert.equal(body.network_id, deployment.networkId, 'main.ts uses the bundled Taira identity with no env override');
        const uri = role => `iroha://connect?${new URLSearchParams({ sid: body.sid, network_id: body.network_id, app_pk: body.app_pk, nonce: body.nonce, node: body.node, role, v: '1', token: (role === 'app' ? 'A' : 'B').repeat(43), relay: 'D'.repeat(43) })}`;
        const registered = { ...body, node: undefined, wallet_uri: uri('wallet'), app_uri: uri('app'), token_app: 'A'.repeat(43), token_wallet: 'B'.repeat(43), token_management: 'C'.repeat(43), token_relay: 'D'.repeat(43) };
        const pending = { body, registered, send: () => { res.writeHead(unavailable ? 503 : 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(unavailable ? { error: 'Local test: Connect unavailable' } : registered)); } };
        sessions.set(body.sid, pending); requests.push(pending);
        if (!hold) pending.send();
      })().catch(error => { failures.push(String(error)); res.writeHead(500); res.end('Counterpart assertion failed'); });
    });
  } }],
});
const sockets = new WebSocketServer({ noServer: true });
server.httpServer.on('upgrade', (request, socket, head) => {
  if (new URL(request.url, 'http://localhost').pathname === '/v1/connect/ws') sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws, request));
});
sockets.on('connection', (ws, request) => {
  const sid = new URL(request.url, 'http://localhost').searchParams.get('sid'), registered = sessions.get(sid).body;
  const preview = { sidBytes: Buffer.from(sid, 'base64url'), appKeyPair: { publicKey: Buffer.from(registered.app_pk, 'base64url') }, networkId: NetworkId.parse(registered.network_id) };
  const wallet = createTestWallet(preview, account, 'D'.repeat(43));
  const connection = { sid, ws, opened: false, closed: false, approve: () => ws.send(wallet.approve()) };
  connections.push(connection);
  ws.on('close', () => { connection.closed = true; });
  ws.on('message', data => {
    try { assert.equal(wallet.request(Buffer.from(data)), null, 'UI pairing must never request a spending signature'); connection.opened = true; }
    catch (error) { failures.push(String(error)); ws.close(); }
  });
});
await mkdir(evidence, { recursive: true });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1106, height: 1280 } });
  page.on('pageerror', error => failures.push(error.message));
  await page.addInitScript(torii => localStorage.setItem('sora-cars:prefs:v1', JSON.stringify({ car: 0, track: 0, music: 0, effects: 0, torii })), origin);
  await page.goto(origin); await page.locator('.wallet-button').waitFor();
  assert.match(await page.locator('.wallet-button').innerText(), /ウォレット接続[\s\S]*IROHA CONNECT · TAIRA/);
  for (const close of ['button', 'escape']) {
    hold = true; const count = requests.length;
    await page.locator('.wallet-button').click(); await wait(() => requests.length === count + 1);
    await page.locator('#wallet-message').waitFor();
    if (close === 'button') await page.locator('.dialog-close').click(); else await page.keyboard.press('Escape');
    await page.locator('#dialog').waitFor({ state: 'hidden' });
    requests.at(-1).send(); hold = false; await delay(100);
    assert.equal(connections.length, 0, 'a closed registration cannot open a socket');
    assert.equal(await page.locator('#dialog').isVisible(), false);
    assert.equal(await page.locator('.wallet-qr').count(), 0);
    results.push(`${close} cancels registration without a late modal, QR or socket`);
  }
  await page.locator('.wallet-button').click(); await page.locator('.wallet-qr').waitFor();
  await wait(() => connections.at(-1)?.opened);
  const uri = await page.locator('#dialog a.primary').getAttribute('href');
  assert.equal(uri, requests.at(-1).registered.wallet_uri);
  assert.equal(new URL(uri).protocol, 'iroha:');
  assert.equal(new URL(uri).searchParams.get('network_id'), deployment.networkId);
  assert.match(await page.locator('#dialog').innerText(), /Tairaテストネット[\s\S]*Iroha Connect/);
  await page.screenshot({ path: `${evidence}/desktop-pairing.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${evidence}/mobile-pairing.png` });
  const pairing = connections.at(-1);
  await page.keyboard.press('Escape'); await wait(() => pairing.closed);
  assert.equal(await page.locator('#dialog').isVisible(), false);
  results.push('default Taira pin, canonical QR/link, Japanese/English desktop/mobile UI and Escape socket cleanup');
  unavailable = true;
  await page.locator('.wallet-button').click();
  await page.getByText('接続できませんでした。', { exact: true }).waitFor();
  assert.equal(await page.locator('.wallet-qr').count(), 0);
  unavailable = false; await page.locator('#dialog [data-action="wallet"]').click();
  await page.locator('.wallet-qr').waitFor(); await wait(() => connections.at(-1)?.opened && connections.at(-1) !== pairing);
  const approved = connections.at(-1); approved.approve();
  await page.locator('#dialog').waitFor({ state: 'hidden' });
  assert.match(await page.locator('.wallet-button').innerText(), new RegExp(account.accountId.slice(0, 7)));
  await page.locator('.wallet-button').click();
  assert.equal(await page.locator('.account-address').innerText(), account.accountId);
  assert.match(await page.locator('#dialog').innerText(), /その都度ウォレットで承認/);
  await page.locator('[data-action="disconnect"]').click(); await wait(() => approved.closed);
  assert.match(await page.locator('.wallet-button').innerText(), /IROHA CONNECT · TAIRA/);
  results.push('service failure exposes retry; real signed Taira approval connects the account; disconnect releases the socket');
  assert.deepEqual(failures, []);
  await writeFile(`${evidence}/report.json`, JSON.stringify({ passed: true, results, networkId: deployment.networkId, transactionRequests: 0, pageErrors: failures, scope: 'Actual main.ts with bundled network default; local Connect node/wallet counterpart. Deployed wallet interoperability is unverified.' }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, results }));
} finally {
  await browser.close(); for (const ws of sockets.clients) ws.terminate(); sockets.close(); await server.close();
}
