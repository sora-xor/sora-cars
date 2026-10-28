// Actual Chromium public-data qualification; no wallet, Torii or funds are used.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { ed25519 } from '@noble/curves/ed25519';
import { AccountAddress } from '@iroha/iroha-js/address';
import { NetworkId } from '@iroha/iroha-js/connect-browser';

const root = resolve(import.meta.dirname, '..');
const nativeRoot = resolve(root, '../iroha-sora-cars-native');
const sdkRoot = resolve(nativeRoot, 'javascript/iroha_js');
const bindingDir = resolve(sdkRoot, 'native');
assert.ok(process.env.IROHA_JS_NATIVE_DIR === undefined ||
  (isAbsolute(process.env.IROHA_JS_NATIVE_DIR) && resolve(process.env.IROHA_JS_NATIVE_DIR) === bindingDir),
  'This qualification pins the isolated SDK native binding; alternate IROHA_JS_NATIVE_DIR is not admitted');
const out = process.env.SORA_CARS_TEST_OUTPUT;
assert.ok(out && isAbsolute(out), 'SORA_CARS_TEST_OUTPUT must be a fresh absolute evidence directory');
await mkdir(out, { recursive: false });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { scope: 'Local browser account/transaction codecs; no live wallet, finality or settlement qualification',
  status: 'running', checks: [], consoleErrors: [], externalRequests: [], sourceDrift: [], inputs: [] };
let server, browser;
try {
  const fixturePath = resolve(nativeRoot, 'fixtures/account/multisig_wire_v1.json');
  const fixtureBytes = await readFile(fixturePath);
  const fixture = JSON.parse(fixtureBytes);
  const malformedPath = resolve(sdkRoot, 'test/fixtures/malformedAccountKeys.js');
  const { BAD_KEYS } = await import(pathToFileURL(malformedPath));
  const { getNativeBinding } = await import(pathToFileURL(resolve(sdkRoot, 'dist/native.js')));
  const native = getNativeBinding();
  const { getCurveEntryById } = await import(pathToFileURL(resolve(sdkRoot, 'dist/curveRegistry.js')));
  const malformed = BAD_KEYS.map(([name, curve, hex]) => ({ name, curve, hex, algorithm: getCurveEntryById(curve).algorithm }));
  const key = new Uint8Array(32).fill(71); // Explicit public, unfunded test seed.
  const publicKey = ed25519.getPublicKey(key);
  const authority = AccountAddress.fromAccount({ publicKey }).toI105();
  const destination = fixture.positive.find(row => row.name === 'ed25519').i105;
  const networkId = NetworkId.fromBytes(new Uint8Array(32).fill(71));
  const input = { networkId: networkId.toString(), authority,
    sourceAssetHoldingId: `62Fk4FPcMuLvW5QjDGNF2a4jAmjM#${authority}`, quantity: '1.25',
    destinationAccountId: destination, feePayment: { payer: 'authority', chargeLimits: [] },
    metadata: { memo: '公開試験 / public test' }, creationTimeMs: 1700000000000, ttlMs: 5000, nonce: 42 };
  const nativePayload = native.buildTransferAssetPayload(networkId.toBytes(), authority,
    input.sourceAssetHoldingId, input.quantity, destination,
    JSON.stringify({ payer: 'authority', value: { charge_limits: [], gas_limit: null } }),
    JSON.stringify(input.metadata), input.creationTimeMs, input.ttlMs, input.nonce);
  const payloadHashHex = Buffer.from(nativePayload.payloadHash).toString('hex');
  const signature = ed25519.sign(Buffer.from(payloadHashHex, 'hex'), key);
  const finalized = native.finalizeSignedTransaction({ networkId: networkId.toBytes(),
    payloadBytes: nativePayload.payloadBytes, payloadHashHex, signature, publicKey, authority });
  const reference = { payload: Buffer.from(nativePayload.payloadBytes).toString('hex'), payloadHashHex,
    signature: Buffer.from(signature).toString('hex'), publicKey: Buffer.from(publicKey).toString('hex'),
    signed: Buffer.from(finalized.signedTransaction).toString('hex'), hash: Buffer.from(finalized.hash).toString('hex') };
  await writeFile(resolve(out, 'native-account-fixtures.json'), fixtureBytes, { flag: 'wx' });
  await writeFile(resolve(out, 'malformed-key-fixtures.json'), JSON.stringify(malformed, null, 2), { flag: 'wx' });
  await writeFile(resolve(out, 'native-transfer-reference.json'), JSON.stringify({ input, reference }, null, 2), { flag: 'wx' });
  const bundled = await build({ stdin: { resolveDir: root, contents: `
    import * as address from '@iroha/iroha-js/address';
    import * as transaction from '@iroha/iroha-js/transaction-codec';
    import { NetworkId } from '@iroha/iroha-js/connect-browser';
    import { encodeAccountIdNoritoValue, decodeAccountIdNoritoValue } from ${JSON.stringify(resolve(sdkRoot, 'dist/norito.js'))};
    window.accountQualification = { ...address, ...transaction, NetworkId, encodeAccountIdNoritoValue, decodeAccountIdNoritoValue };
  ` }, bundle: true, platform: 'browser', format: 'esm', target: 'es2020', write: false, metafile: true });
  const inputNames = Object.keys(bundled.metafile.inputs);
  assert.ok(inputNames.some(name => name.endsWith('/accountKeyAdmission.browser.js')));
  assert.ok(inputNames.some(name => name.endsWith('/addressCodec.js')));
  assert.equal(inputNames.some(name => /\/native\.js$/.test(name)), false);
  for (const path of [fixturePath, malformedPath, resolve(root, 'scripts/test-browser-accounts.mjs'), ...inputNames.filter(name => name !== '<stdin>').map(name => resolve(root, name)),
    resolve(sdkRoot, 'native/iroha_js_host.checksums.json'), resolve(sdkRoot, 'native/iroha_js_host.node')]) {
    const bytes = await readFile(path);
    report.inputs.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  }
  const source = bundled.outputFiles[0].text;
  await writeFile(resolve(out, 'browser-bundle.js'), source, { flag: 'wx' });
  server = createServer((req, res) => {
    if (req.url === '/bundle.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(source); }
    else if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><title>SORA account codec qualification</title><body style="background:#160e28;color:#f5eedf;font:18px monospace;padding:32px"><h1>SORA — アカウント検証</h1><p lang="en">Local browser account and transaction qualification. Public test data; no funds.</p><pre id="result">検証中 / Checking…</pre><script type="module" src="/bundle.js"></script></body></html>'); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', error => report.consoleErrors.push(String(error)));
  page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()); });
  await page.route('**/*', route => {
    if (!route.request().url().startsWith(`${origin}/`)) { report.externalRequests.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto(origin);
  await page.waitForFunction(() => Boolean(window.accountQualification));
  report.checks = await page.evaluate(({ fixture, malformed, input, reference }) => {
    const sdk = window.accountQualification;
    const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const bytes = str => Uint8Array.from(str.match(/../g) ?? [], pair => parseInt(pair, 16));
    const checks = [];
    const equal = (actual, expected, name) => { if (actual !== expected) throw new Error(`${name}: mismatch`); };
    const reject = (fn, name) => { try { fn(); } catch { checks.push(name); return; } throw new Error(`${name}: accepted`); };
    for (const row of fixture.positive) {
      const account = sdk.AccountAddress.fromI105(row.i105, fixture.chain_discriminant);
      equal(hex(account.canonicalBytes()), row.canonical_address_hex, row.name);
      equal(account.toI105(fixture.chain_discriminant), row.i105, row.name);
      equal(hex(sdk.encodeAccountIdNoritoValue(row.i105)), row.account_id_payload_hex, row.name);
      equal(sdk.decodeAccountIdNoritoValue(bytes(row.account_id_payload_hex)), row.i105, row.name);
      checks.push(`native account/controller bytes: ${row.name}`);
      reject(() => sdk.AccountAddress.fromI105(row.i105, fixture.chain_discriminant + 1), `network discriminant: ${row.name}`);
      reject(() => sdk.AccountAddress.fromI105(` ${row.i105}`), `noncanonical literal: ${row.name}`);
      account.canonicalBytes().fill(0);
      account._controller = { tag: 0, curve: 1, publicKey: new Uint8Array(32) };
      equal(account.canonicalHex(), `0x${row.canonical_address_hex}`, `owned state: ${row.name}`);
    }
    for (const row of fixture.negative) reject(() => sdk.decodeAccountIdNoritoValue(bytes(row.account_id_payload_hex)), `native negative: ${row.name}`);
    for (const row of malformed) reject(() => sdk.AccountAddress.fromAccount({ algorithm: row.algorithm, publicKey: bytes(row.hex) }), `malformed key: ${row.name}`);
    const payload = sdk.buildBrowserTransferPayload({ ...input, networkId: sdk.NetworkId.parse(input.networkId) });
    equal(hex(payload), reference.payload, 'native transfer payload'); checks.push('byte-identical native transfer payload');
    equal(sdk.browserTransactionPayloadHashHex(payload), reference.payloadHashHex, 'payload hash');
    const signable = { networkId: sdk.NetworkId.parse(input.networkId), payloadBytes: payload,
      payloadHashHex: reference.payloadHashHex, authority: input.authority,
      signingPublicKey: bytes(reference.publicKey), signatureAlgorithm: 'ed25519' };
    const signed = sdk.finalizeBrowserSignedTransaction(signable,
      { algorithm: 'ed25519', signature: bytes(reference.signature) }, bytes(reference.publicKey));
    equal(hex(signed.signedTransaction), reference.signed, 'signed transaction');
    equal(signed.hashHex, reference.hash, 'signed hash'); checks.push('native-identical signed transaction and locally verified signature');
    const badSignature = bytes(reference.signature); badSignature[0] ^= 1;
    reject(() => sdk.finalizeBrowserSignedTransaction(signable, { algorithm: 'ed25519', signature: badSignature }, bytes(reference.publicKey)), 'corrupted signature');
    reject(() => sdk.finalizeBrowserSignedTransaction({ ...signable, networkId: sdk.NetworkId.fromBytes(new Uint8Array(32).fill(73)) },
      { algorithm: 'ed25519', signature: bytes(reference.signature) }, bytes(reference.publicKey)), 'cross-network signing');
    reject(() => sdk.buildBrowserTransferPayload({ ...input, networkId: sdk.NetworkId.parse(input.networkId), feePayment: undefined }), 'missing explicit fee intent');
    document.querySelector('#result').textContent = `成功 / PASS — ${checks.length} checks\n\n${checks.join('\n')}`;
    return checks;
  }, { fixture, malformed, input, reference });
  await page.screenshot({ path: resolve(out, 'chromium-accounts.png'), fullPage: true });
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.externalRequests, []);
  for (const input of report.inputs) if (digest(await readFile(input.path)) !== input.sha256) report.sourceDrift.push(input.path);
  assert.deepEqual(report.sourceDrift, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error.stack ?? error); process.exitCode = 1;
} finally {
  report.cleanupErrors = [];
  try { if (browser) await browser.close(); }
  catch (error) { report.cleanupErrors.push(`browser: ${error}`); }
  try {
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose()));
    }
  } catch (error) { report.cleanupErrors.push(`server: ${error}`); }
  report.closed = report.cleanupErrors.length === 0;
  if (!report.closed) { report.status = 'failed'; process.exitCode = 1; }
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output: out, error: report.error }));
}
