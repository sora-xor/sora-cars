#!/usr/bin/env node
/** Real Chromium → retained native Torii → native worker → independent CLI. No Cargo or proof mocks.
 * Explicit pinned binaries, original prestate and a genuine retained producer fixture are required.
 * All source stores remain read-only; only a new owned Kura copy is opened.
 * The native test router serves shipping Torii; no browser fetch/proof mocks.
 * The OS chooser alone is replaced by a real Chromium OPFS directory.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants as fsConstants, createReadStream, watch } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, open, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer, createConnection } from 'node:net';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  assert.ok(['--native', '--fixture-dir', '--kura-store', '--output', '--binary', '--expected-binary-sha256', '--torii-binary', '--expected-torii-sha256', '--computation'].includes(key), `Unknown argument: ${key}`);
  assert.ok(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `Missing value for ${key}`);
  assert.equal(options[key], undefined, `Duplicate argument: ${key}`);
  options[key] = process.argv[i + 1];
}
for (const key of ['--native', '--fixture-dir', '--kura-store', '--output', '--binary', '--expected-binary-sha256', '--torii-binary', '--expected-torii-sha256', '--computation']) assert.ok(options[key], `Required: ${key}`);
const computation = options['--computation'];
assert.ok(['street', 'stock_race'].includes(computation), 'Explicit native computation must be street or stock_race');
const proofByteLimit = computation === 'stock_race' ? 4 * 1024 * 1024 + 4096 : 524288;
const provingBudget = Object.freeze({ workerJobMs: 600000, browserCompletionMs: 630000 });
for (const key of ['--native', '--fixture-dir', '--kura-store', '--output', '--binary', '--torii-binary']) assert.ok(isAbsolute(options[key]), `Absolute path required: ${key}`);
const native = resolve(options['--native']), output = resolve(options['--output']);
const fixtureSource = resolve(options['--fixture-dir']), sourceStore = resolve(options['--kura-store']);
const binarySource = resolve(options['--binary']), toriiSource = resolve(options['--torii-binary']);
const expectedBinary = options['--expected-binary-sha256'], expectedTorii = options['--expected-torii-sha256'];
for (const value of [expectedBinary, expectedTorii]) assert.match(value, /^[a-f0-9]{64}$/);
await mkdir(output, { recursive: false });
const report = {
  schema: 'sora-cars.native-replay-browser.v1', status: 'running', started_at: new Date().toISOString(),
  computation,
  proof_format: computation === 'stock_race' ? 'canonical ExecutionProofEnvelopeV1' : 'Street component stream',
  integration_byte_limits: { replay: 131072, proof: proofByteLimit },
  integration_proving_budgets: { ...provingBudget, performance_qualified: false,
    scope: 'Explicit unoptimized integration allowances; not performance qualification. Other phase, upload, download and negative-case deadlines are unchanged.' },
  separate_gates: 'StockRace evidence does not qualify Street. The original Street hydration and complete Street proof gates remain independently required.',
  scope: 'Shipping native Torii router restores exact original producer prestate and copied genuine Kura store through native recovery; actual Chromium public evidence upload, replay download, OPFS staging, native proof worker and independent CLI. The prestate remains synthetic and zero-funded, with no admitted lifecycle, live validators, authenticated snapshot or committed WSV qualification.',
  limits: { wallet_actions: false, browser_verification: false, production_isolation_qualified: false, full_race_qualified: false, funded_game_qualified: false, deployment: false },
  chooser: 'Only showDirectoryPicker is substituted; actual Chromium OPFS directories, Files and writable streams are used.',
  source_scope: 'Selected app and native transport sources plus executed binary hash; not complete reproducible native build provenance.',
  integer_encoding: 'Report-only integers beyond the JavaScript safe range are decimal strings; retained original and copied native manifests preserve exact integer tokens.',
  inputs: {}, sources: [], processes: [], scenarios: [], checks: [], source_drift: [],
};
let persistQueue = Promise.resolve();
function persist() {
  const value = `${JSON.stringify(report, (_key, item) => typeof item === 'bigint' ? item.toString(10) : item, 2)}\n`;
  persistQueue = persistQueue.then(async () => {
    await writeFile(join(output, 'report.json.tmp'), value);
    await rename(join(output, 'report.json.tmp'), join(output, 'report.json'));
  });
  return persistQueue;
}
const hash = value => createHash('sha256').update(value).digest('hex');
// Concurrent response waits can reject during another wait or context cleanup.
// Observe immediately while preserving the original rejection for its await.
function observed(promise) { void promise.catch(() => {}); return promise; }
async function requireToriiReplaySuccess(response, result) {
  if (response.status() === 200) return response;
  const diagnostic = { url: response.url(), status: response.status() };
  result.torii_http_error = diagnostic;
  try {
    diagnostic.headers = await response.allHeaders();
    const declared = diagnostic.headers['content-length'];
    const media = diagnostic.headers['content-type'] ?? '';
    // Only a small, declared textual native error is eligible for diagnostic
    // capture. This never reads or replaces the successful replay response.
    if (/^\d+$/.test(declared ?? '') && Number(declared) <= 8192 && /^(?:application\/json|text\/)/i.test(media)) {
      let timer;
      try {
        const bytes = await Promise.race([
          observed(response.body()),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native error-body diagnostic deadline')), 1000); }),
        ]);
        assert.equal(bytes.length, Number(declared), 'Native error response length differs from declaration');
        assert.ok(bytes.length <= 8192, 'Native error response exceeds diagnostic bound');
        diagnostic.text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } finally { clearTimeout(timer); }
    } else diagnostic.body = 'Unavailable: absent, oversized, or non-textual declared response';
  } catch (error) { diagnostic.capture_error = String(error?.message ?? error).slice(0, 1024); }
  throw new Error(`Native Torii replay export returned HTTP ${diagnostic.status}`);
}
// Cleanup diagnostics must not replace the scenario's original proof failure.
// Any recorded cleanup error still prevents a successful qualification below.
async function recordScenarioCleanup(result, stage, operation) {
  try { await operation(); }
  catch (error) { (result.cleanup_errors ??= []).push({ stage, error: error?.stack ?? String(error) }); }
}
async function closeScenarioResources(result, snapshot, closeContext, pending) {
  await recordScenarioCleanup(result, 'final-diagnostics', snapshot);
  await recordScenarioCleanup(result, 'network-observations-before-close', async () => {
    let timer;
    try {
      await Promise.race([
        Promise.allSettled(pending.slice()),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Pre-close network metadata drain exceeded 2 seconds')), 2000); }),
      ]);
    } finally { clearTimeout(timer); }
  });
  try { await recordScenarioCleanup(result, 'browser-context', closeContext); }
  finally {
    const settled = await Promise.allSettled(pending);
    for (const item of settled) if (item.status === 'rejected') {
      await recordScenarioCleanup(result, 'network-observations', () => { throw item.reason; });
    }
  }
}
function downloadedReplayFromOpfs(files, declaredLength, expectedReplay) {
  assert.match(declaredLength ?? '', /^[1-9][0-9]*$/, 'Native download requires canonical Content-Length');
  const length = Number(declaredLength);
  assert.ok(Number.isSafeInteger(length) && length >= 40 && length <= 131072, 'Native download exceeds this integration replay bound');
  assert.equal(length, expectedReplay.length, 'Native response length differs from the original producer replay');
  const staged = Object.entries(files).filter(([name]) => name.startsWith('sora-cars-replay-'));
  assert.equal(staged.length, 1, 'Exactly one actual OPFS replay download is required');
  const [path, encoded] = staged[0];
  assert.match(path, /^sora-cars-replay-[a-f0-9-]{36}\/replay\.nrt$/, 'Unexpected OPFS replay staging path');
  assert.ok(typeof encoded === 'string' && encoded.length <= Math.ceil(131072 / 3) * 4, 'OPFS replay observation exceeds its bound');
  const bytes = Buffer.from(encoded, 'base64');
  assert.equal(bytes.length, length, 'Actual OPFS download differs from Content-Length');
  assert.deepEqual(bytes, expectedReplay, 'Actual OPFS download differs from the original native producer');
  return { path, bytes };
}
async function fileHash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
const children = [];
let browser, activePage, interrupted = false;
const interrupt = signal => { interrupted = true; report.interrupted_by = signal; void activePage?.close().catch(() => {}); };
const onInt = () => interrupt('SIGINT'), onTerm = () => interrupt('SIGTERM');
process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
async function snapshot(source, kind) {
  const bytes = await readFile(source), sha256 = hash(bytes);
  const destination = join(output, 'sources', `${String(report.sources.length).padStart(4, '0')}-${source.split('/').at(-1)}`);
  await writeFile(destination, bytes, { flag: 'wx' });
  assert.equal(await fileHash(source), sha256, `Source changed while snapshotting: ${source}`);
  report.sources.push({ source, snapshot: relative(output, destination), kind, bytes: bytes.length, sha256 });
}
async function copyInput(source, name) {
  source = resolve(source);
  const maximum = { 'request.nrt': 4096, 'evidence.nrt': 16 * 1024 * 1024, 'replay.nrt': 131071,
    'state-prestate.json': 16 * 1024 * 1024, 'producer-kura-store.json': 4096 }[name];
  assert.ok(maximum, 'Unknown native fixture input');
  const stat = await lstat(source);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size > 0 && stat.size <= maximum, 'Public integration input must be one bounded regular file');
  const bytes = await readFile(source), sha256 = hash(bytes);
  await writeFile(join(output, name), bytes, { flag: 'wx' });
  assert.equal(await fileHash(source), sha256, `Input changed while copying: ${source}`);
  report.inputs[name] = { source, bytes: bytes.length, sha256 };
  return bytes;
}
async function freePort() {
  const listener = createServer();
  await new Promise((ok, fail) => listener.once('error', fail).listen(0, '127.0.0.1', ok));
  const { port } = listener.address();
  await new Promise((ok, fail) => listener.close(error => error ? fail(error) : ok()));
  return port;
}
async function launch(label, argv, cwd, environment = {}) {
  const receipt = { label, argv, cwd, status: 'starting', started_at: new Date().toISOString() };
  report.processes.push(receipt);
  // Persist intent even if opening a log or synchronous spawn validation fails.
  await persist();
  const started = performance.now();
  let stdout, stderr, owned;
  try {
    // fs.open has completed before its numeric descriptors are passed to spawn.
    // A newly constructed WriteStream can still have fd:null here.
    stdout = await open(join(output, `${label}.stdout`), 'wx', 0o600);
    stderr = await open(join(output, `${label}.stderr`), 'wx', 0o600);
    const child = spawn(argv[0], argv.slice(1), { cwd, env: { ...process.env, ...environment }, stdio: ['ignore', stdout.fd, stderr.fd] });
    const exited = new Promise(resolveExit => {
      child.once('error', error => { receipt.error = error.message; });
      child.once('close', (code, signal) => {
        receipt.exit = code; receipt.signal = signal; receipt.status = 'finished';
        receipt.seconds = (performance.now() - started) / 1000;
        resolveExit(receipt);
      });
    });
    owned = { child, receipt, exited };
    children.push(owned);
    await new Promise((resolveSpawn, rejectSpawn) => {
      child.once('spawn', resolveSpawn);
      child.once('error', rejectSpawn);
    });
    receipt.pid = child.pid; receipt.status = 'running';
  } catch (error) {
    receipt.startup_failed = true; receipt.error = error.message;
    if (owned) await owned.exited;
    else {
      receipt.status = 'finished'; receipt.exit = null; receipt.signal = null;
      receipt.seconds = (performance.now() - started) / 1000;
    }
    throw error;
  } finally {
    // The spawned child owns duplicated descriptors; close only the parent's
    // handles, including when the second open or synchronous spawn fails.
    const closed = await Promise.allSettled([stdout?.close(), stderr?.close()]);
    const failures = closed.filter(result => result.status === 'rejected');
    if (failures.length) receipt.parent_log_close_errors = failures.map(result => String(result.reason));
    await persist();
  }
  assert.equal(receipt.parent_log_close_errors, undefined, `${label}: could not close parent log descriptors`);
  return owned;
}
async function waitUntil(predicate, message, milliseconds = 30_000) {
  const deadline = Date.now() + milliseconds;
  while (!await predicate()) {
    assert.equal(interrupted, false, 'Runner interrupted');
    assert.ok(Date.now() < deadline, message);
    await delay(100);
  }
}
async function listenReady(process, port) {
  await waitUntil(async () => {
    assert.equal(process.receipt.status, 'running', `${process.receipt.label} exited before readiness`);
    return new Promise(ok => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(200);
      socket.once('connect', () => { socket.destroy(); ok(true); });
      socket.once('error', () => { socket.destroy(); ok(false); });
      socket.once('timeout', () => { socket.destroy(); ok(false); });
    });
  }, `${process.receipt.label} listener readiness timeout`);
}
async function stopOwned(owned) {
  if (owned.receipt.status === 'finished') return;
  owned.receipt.stop_requested_at = new Date().toISOString();
  if (owned.control) { try { await writeFile(join(owned.control, 'stop'), '', { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; } }
  else owned.child.kill('SIGTERM');
  const finished = await Promise.race([owned.exited.then(() => true), delay(60_000, undefined, { ref: false }).then(() => false)]);
  assert.ok(finished, `Owned ${owned.receipt.label} has not finished cleanup; retained PID ${owned.receipt.pid}`);
}
async function command(label, argv, timeout = 180_000) {
  const owned = await launch(label, argv, output);
  const result = await Promise.race([owned.exited, delay(timeout, undefined, { ref: false }).then(() => null)]);
  if (!result) { owned.receipt.timeout = true; await stopOwned(owned); throw new Error(`${label} timed out`); }
  assert.equal(result.exit, 0, `${label} failed; inspect retained logs`);
  return result;
}

const ids = {
  network_id: '#native-network-id', trusted_context_id: '#native-context-id', first_height: '#native-first-height',
  target_height: '#native-target-height', target_block_hash: '#native-block-hash', session_id: '#native-session-id',
  revision: '#native-revision', terminal_tick: '#native-terminal-tick',
};
const phase = async page => page.locator('#native-proof-status').getAttribute('data-phase');
async function waitPhase(page, values, timeout = 180_000) {
  await page.waitForFunction(values => values.includes(document.querySelector('#native-proof-status')?.getAttribute('data-phase')), values, { timeout });
  return phase(page);
}
async function fill(page, selection, workerOrigin, toriiOrigin) {
  await page.locator('#native-worker-origin').fill(workerOrigin);
  for (const [key, id] of Object.entries(ids)) await page.locator(id).fill(String(selection[key]));
  await page.locator('#native-mode').selectOption(selection.mode.kind);
  await page.locator('#native-computation').selectOption(computation);
  await page.locator('#native-request-file').setInputFiles(join(output, 'request.nrt'));
  await page.locator('#native-replay-source').selectOption('torii');
  await page.locator('#native-torii-origin').fill(toriiOrigin);
  await page.locator('#native-evidence-file').setInputFiles(join(output, 'evidence.nrt'));
  await page.locator('#native-pins-reviewed').check();
}
async function readOpfsSnapshot(maximum) {
  // Failure to access the root is not cleanup success. Only a descendant that
  // disappears during traversal permits a bounded whole-snapshot retry.
  const root = await navigator.storage.getDirectory();
  for (let attempt = 0; attempt < 8; attempt++) {
    const files = {};
    async function walk(directory, prefix) {
      for await (const [name, handle] of directory.entries()) {
        const path = `${prefix}${name}`;
        if (handle.kind === 'directory') await walk(handle, `${path}/`);
        else {
          const file = await handle.getFile();
          if (file.size > maximum) throw new Error('Unexpectedly large OPFS integration artifact');
          const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
          for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
          files[path] = btoa(binary);
        }
      }
    }
    try { await walk(root, ''); return files; }
    catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'NotFoundError' || attempt === 7) throw error;
      // Discard every partial entry. Never turn a failed read into an empty map.
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
}
async function opfsFiles(page) {
  return page.evaluate(readOpfsSnapshot, proofByteLimit);
}
async function newScenario(label, appOrigin, workerOrigin, toriiOrigin, { chooser = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(({ chooser }) => {
    // This is the only browser API substitution. File uploads, fetch, the SDK,
    // the application, native worker and all storage operations stay real.
    window.showDirectoryPicker = chooser ? async options => {
      window.__nativeProofPicker = { options, userActivation: navigator.userActivation.isActive };
      return navigator.storage.getDirectory();
    } : undefined;
  }, { chooser });
  const page = await context.newPage(); activePage = page;
  const result = { label, requests: [], responses: [], console: [], page_errors: [], failed_requests: [], cdp_requests: [], cdp_extra_headers: [], cdp_responses: [], cdp_response_extra_headers: [], checks: [] };
  report.scenarios.push(result);
  const pending = [];
  const record = promise => { pending.push(promise.catch(error => { result.recording_error = error.message; })); };
  page.on('console', message => result.console.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', error => result.page_errors.push(error.message));
  page.on('requestfailed', request => result.failed_requests.push({ url: request.url(), method: request.method(), error: request.failure()?.errorText }));
  page.on('request', request => record((async () => {
    const url = new URL(request.url());
    if (![workerOrigin, toriiOrigin].includes(url.origin)) {
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) && ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
        (result.external_requests ??= []).push({ url: request.url(), method: request.method() });
      }
      return;
    }
    const body = request.postDataBuffer();
    result.requests.push({ url: request.url(), path: url.pathname, method: request.method(), headers: await request.allHeaders(),
      bytes: body?.length ?? null, sha256: body ? hash(body) : null,
      body_observation: body ? 'Playwright exposed request bytes' : 'Playwright did not expose body bytes; null is unavailable, not an empty upload' });
  })()));
  page.on('response', response => record((async () => {
    if (![workerOrigin, toriiOrigin].includes(new URL(response.url()).origin)) return;
    const entry = { url: response.url(), path: new URL(response.url()).pathname, method: response.request().method(), status: response.status(), headers: await response.allHeaders() };
    if (!entry.path.endsWith('/proof') && entry.path !== '/v1/games/replay') {
      try { const text = await response.text(); assert.ok(text.length <= 1_052_672); entry.body = text; }
      catch (error) { entry.body_error = error.message; }
    }
    result.responses.push(entry);
  })()));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', event => {
    if ([workerOrigin, toriiOrigin].some(origin => event.request.url.startsWith(`${origin}/`))) result.cdp_requests.push({ requestId: event.requestId, method: event.request.method, url: event.request.url, headers: event.request.headers });
  });
  cdp.on('Network.requestWillBeSentExtraInfo', event => result.cdp_extra_headers.push({ requestId: event.requestId, headers: event.headers }));
  cdp.on('Network.responseReceived', event => {
    if ([workerOrigin, toriiOrigin].some(origin => event.response.url.startsWith(`${origin}/`))) result.cdp_responses.push({ requestId: event.requestId, url: event.response.url, status: event.response.status, headers: event.response.headers });
  });
  // Chromium exposes a blocked CORS response through ExtraInfo even when it
  // deliberately withholds the response from JavaScript and Playwright.
  cdp.on('Network.responseReceivedExtraInfo', event => result.cdp_response_extra_headers.push({ requestId: event.requestId, status: event.statusCode, headers: event.headers }));
  await page.goto(`${appOrigin}/#/prove`);
  await page.locator('#native-proof-form').waitFor();
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  assert.equal(new URL(page.url()).hash, '#/prove');
  return { page, result, async close() {
    await closeScenarioResources(result, async () => {
      if (!page.isClosed()) {
        result.final_phase = await phase(page).catch(() => null);
        result.storage_files = Object.keys(await opfsFiles(page));
      }
    }, () => context.close(), pending);
    await recordScenarioCleanup(result, 'network-evidence-validation', () => {
      const workerIds = new Set(result.cdp_requests.map(event => event.requestId));
      result.cdp_extra_headers = result.cdp_extra_headers.filter(event => workerIds.has(event.requestId));
      result.cdp_response_extra_headers = result.cdp_response_extra_headers.filter(event => workerIds.has(event.requestId));
      assert.deepEqual(result.page_errors, [], `${label}: browser exception`);
      assert.deepEqual(result.external_requests ?? [], [], `${label}: unexpected external network request`);
      assert.equal(result.recording_error, undefined, `${label}: incomplete network evidence`);
    });
    await recordScenarioCleanup(result, 'scenario-receipt', persist);
  } };
}
async function screenshot(page, name) {
  const path = join(output, `${name}.png`); await page.screenshot({ path, fullPage: true });
  return { file: relative(output, path), sha256: await fileHash(path) };
}
async function screenshotResult(page, name) {
  const cli = page.locator('.native-cli');
  if (await cli.getAttribute('open') === null) await cli.locator('summary').click();
  await page.locator('#native-proof-status').scrollIntoViewIfNeeded();
  const status = await screenshot(page, `${name}-status`);
  await page.locator('#native-verification-command').scrollIntoViewIfNeeded();
  const command = await screenshot(page, `${name}-command`);
  await page.locator('.native-proof-heading').scrollIntoViewIfNeeded();
  const top = await screenshot(page, `${name}-top`);
  return { top, status, command };
}
async function emptySpool(spool, timeout = 60_000) {
  await waitUntil(async () => (await readdir(spool)).every(name => name === '.public-proof-worker.lock'), 'Native spool did not finish cleanup', timeout);
}

/** Observe, never write to, the owned native staging directory. Open descriptors
 * survive rapid native rejection/unlink, so a failed replay still has real byte
 * evidence. No input-file contents are used to manufacture received hashes.
 */
async function observeNativeInputs(spool, label) {
  assert.deepEqual((await readdir(spool)).filter(name => name !== '.public-proof-worker.lock'), [], 'Received-byte observer requires an empty dedicated worker spool');
  const opened = new Map();
  let directory, scanning = Promise.resolve(), failure, stopped = false;
  const observation = {
    label, began_at: new Date().toISOString(), directory: null,
    binding: 'The dedicated native worker spool was empty before submission. Exact files are read from its sole public-game directory, then bound to the matching HTTP reservation and upload job ID. Native directory names are independent of HTTP IDs.',
    files: {},
  };
  async function scan() {
    if (stopped || failure) return;
    const entries = (await readdir(spool, { withFileTypes: true })).filter(entry => entry.name !== '.public-proof-worker.lock');
    assert.ok(entries.length <= 1, 'More than one native staging owner appeared');
    if (!entries.length) return;
    const entry = entries[0];
    assert.ok(entry.isDirectory() && /^public-game-/.test(entry.name), 'Unexpected native staging entry');
    const current = join(spool, entry.name);
    if (directory) assert.equal(current, directory, 'Native staging owner changed during received-byte observation');
    directory = current; observation.directory = current;
    for (const name of ['request.nrt', 'replay.nrt']) {
      if (opened.has(name)) continue;
      let handle;
      try {
        const path = join(directory, name), before = await lstat(path);
        assert.ok(before.isFile() && before.nlink === 1, 'Native input must be one regular file');
        handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
        const actual = await handle.stat();
        assert.equal(actual.dev, before.dev); assert.equal(actual.ino, before.ino);
        opened.set(name, { handle, path, opened_at: new Date().toISOString(), dev: actual.dev, ino: actual.ino });
      } catch (error) {
        await handle?.close();
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  const schedule = () => { scanning = scanning.then(scan).catch(error => { failure ??= error; }); };
  const watcher = watch(spool, { recursive: true }, schedule);
  watcher.on('error', error => { failure ??= error; });
  const interval = setInterval(schedule, 5);
  schedule();
  async function stopWatching() {
    stopped = true; watcher.close(); clearInterval(interval); await scanning;
  }
  return {
    observation,
    async capture(jobId) {
      assert.match(jobId, /^[a-f0-9]{64}$/);
      await waitUntil(async () => { await scanning; if (failure) throw failure; return opened.size === 2; }, 'Native received input descriptors were not observed', 10_000);
      await stopWatching(); if (failure) throw failure;
      observation.http_job_id = jobId;
      const destination = join(output, 'server-received', label); await mkdir(destination, { recursive: true });
      for (const [name, file] of opened) {
        const before = await file.handle.stat();
        const maximum = name === 'request.nrt' ? 4096 : 131072;
        assert.ok(before.isFile() && before.size > 0 && before.size <= maximum, 'Native received bytes exceed configured integration bound');
        assert.equal(before.dev, file.dev); assert.equal(before.ino, file.ino);
        const bytes = await file.handle.readFile(), after = await file.handle.stat();
        assert.equal(bytes.length, before.size); assert.equal(after.size, before.size);
        assert.equal(after.mtimeMs, before.mtimeMs); assert.equal(after.dev, before.dev); assert.equal(after.ino, before.ino);
        const retained = join(destination, name); await writeFile(retained, bytes, { flag: 'wx' });
        const sha256 = hash(bytes); assert.equal(await fileHash(retained), sha256);
        observation.files[name] = { source: file.path, retained: relative(output, retained), bytes: bytes.length, sha256,
          opened_at: file.opened_at, dev: file.dev, ino: file.ino, native_unlinked_after_open: after.nlink === 0 };
      }
      observation.captured_at = new Date().toISOString();
      return observation;
    },
    async close() {
      await stopWatching();
      await Promise.all([...opened.values()].map(file => file.handle.close()));
    },
  };
}

async function copyStore(source, destination, prefix = '') {
  const before = await lstat(source); assert.ok(before.isDirectory() && !before.isSymbolicLink(), 'Kura input must be a direct directory');
  await mkdir(destination, { mode: 0o700 });
  for (const entry of (await readdir(source, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const from=join(source,entry.name), to=join(destination,entry.name), name=prefix+entry.name;
    assert.ok(!entry.isSymbolicLink(), 'Kura store copy refuses symbolic links');
    if (entry.isDirectory()) await copyStore(from,to,name+'/');
    else {
      const stat=await lstat(from);assert.ok(stat.isFile()&&stat.nlink===1&&stat.size<=256*1024*1024,'Kura contains an unsupported storage entry');
      const sha256=await fileHash(from);await copyFile(from,to,fsConstants.COPYFILE_EXCL);
      assert.equal(await fileHash(to),sha256);assert.equal(await fileHash(from),sha256);
      report.store_files.push({source:from,file:name,bytes:stat.size,sha256});
    }
  }
}
async function storeInventory(directory, prefix = '') {
  const directoryStat = await lstat(directory);
  assert.ok(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(), 'Kura inventory refuses symbolic or non-directory roots');
  const inventory = [{ file: prefix || '.', kind: 'directory' }];
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name), stat = await lstat(path), file = prefix + name;
    assert.ok(!stat.isSymbolicLink(), 'Kura inventory refuses symbolic links');
    if (stat.isDirectory()) inventory.push(...await storeInventory(path, file + '/'));
    else {
      assert.ok(stat.isFile() && stat.nlink === 1 && stat.size <= 256 * 1024 * 1024, 'Kura inventory contains an unsupported storage entry');
      inventory.push({ file, kind: 'file', bytes: stat.size, sha256: await fileHash(path) });
    }
  }
  return inventory;
}
async function pinBinary(source, destination, expected) {
  const stat=await lstat(source);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Pinned executable must be a direct regular file');
  assert.equal(await fileHash(source),expected,'Native binary differs from explicit expected pin; do not rebuild automatically');
  await copyFile(source,destination,fsConstants.COPYFILE_EXCL);await chmod(destination,0o500);
  assert.equal(await fileHash(destination),expected);assert.equal(await fileHash(source),expected);
  return {source,file:relative(output,destination),sha256:expected,bytes:stat.size};
}
await persist();
let worker, vite, torii;
const spool=join(output,'spool'), control=join(output,'torii-control');
try {
  await mkdir(join(output,'sources'));
  const appSources=(await filesUnder(join(project,'src'))).filter(path=>/\.(ts|css|json)$/.test(path));
  for(const name of ['package.json','package-lock.json','vite.config.ts','index.html','scripts/test-native-replay-browser.mjs'])appSources.push(join(project,name));
  for(const source of appSources.sort())await snapshot(source,'app');
  const selectedNative=['crates/iroha_torii/tests/game_replay_retained_endpoint.rs','crates/iroha_core/src/kura/game_bundle_export.rs','crates/iroha_core/src/execution_proofs/bundle.rs','crates/iroha_core/src/state.rs','crates/iroha_core/src/state/deserialize_core.rs','crates/iroha_core/src/state/deserialize_world.rs','crates/iroha_core/src/state/captured_merge_game_tests.rs','crates/iroha_core/src/snapshot.rs','crates/iroha_data_model/src/execution_proofs/game_bundle.rs','javascript/iroha_js/package.json','javascript/iroha_js/game-replay.d.ts','javascript/iroha_js/game-proof-worker.d.ts'];
  selectedNative.push('crates/iroha_core/src/execution_proofs/bundle/stock.rs','crates/iroha_core/src/execution_proofs/bundle/stock_tests.rs');
  for(const name of ['gameReplay.js','gameProofWorker.js','norito.js','noritoGameCodecs.js','strictLosslessJson.js'])for(const folder of ['src','dist'])selectedNative.push(`javascript/iroha_js/${folder}/${name}`);
  for(const name of selectedNative)await snapshot(join(native,name),'native-public-transport');
  const manifestBytes=await copyInput(join(fixtureSource,'kura-store.json'),'producer-kura-store.json');
  const {parseStrictLosslessIntegerJson,stringifyStrictLosslessIntegerJson}=await import(pathToFileURL(join(native,'javascript/iroha_js/src/strictLosslessJson.js')).href);
  const producerManifest=parseStrictLosslessIntegerJson(new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes),'native retained fixture manifest');
  assert.equal(producerManifest.version,1);assert.equal(producerManifest.path,sourceStore,'Explicit Kura directory differs from genuine retained producer manifest');
  assert.equal(producerManifest.prestate?.file,'state-prestate.json','Original native prestate fixture is required');
  assert.ok(Number.isSafeInteger(producerManifest.prestate.bytes)&&producerManifest.prestate.bytes>0&&producerManifest.prestate.bytes<=16*1024*1024,'Native prestate size exceeds the fixture bound');
  assert.match(producerManifest.prestate.sha256,/^[a-f0-9]{64}$/);
  assert.ok(typeof producerManifest.chain_id==='string'&&producerManifest.chain_id.length>0,'Original producer chain ID is required');
  const prestateHeight=producerManifest.prestate_height;
  assert.ok((typeof prestateHeight==='bigint'||Number.isSafeInteger(prestateHeight))&&BigInt(prestateHeight)>=0n&&BigInt(prestateHeight)<=0xffffffffffffffffn,'Original producer prestate height must be a u64');
  const prestateBytes=await copyInput(join(fixtureSource,'state-prestate.json'),'state-prestate.json');
  assert.equal(prestateBytes.length,producerManifest.prestate.bytes,'Original prestate length differs from native manifest');
  assert.equal(hash(prestateBytes),producerManifest.prestate.sha256,'Original prestate hash differs from native manifest');
  const requestBytes=await copyInput(join(fixtureSource,'request.nrt'),'request.nrt');
  const evidenceBytes=await copyInput(join(fixtureSource,'evidence.nrt'),'evidence.nrt');
  const replayBytes=await copyInput(join(fixtureSource,'replay.nrt'),'replay.nrt');
  report.store_inventory_before=await storeInventory(sourceStore);
  report.store_files=[];await copyStore(sourceStore,join(output,'kura'));
  assert.deepEqual(await storeInventory(join(output,'kura')),report.store_inventory_before,'Owned Kura copy differs from complete source inventory');
  assert.deepEqual(await storeInventory(sourceStore),report.store_inventory_before,'Source Kura changed while copying');
  const fixture=join(output,'retained-fixture');await mkdir(fixture);
  for(const name of ['request.nrt','evidence.nrt','replay.nrt','state-prestate.json']){
    await copyFile(join(output,name),join(fixture,name),fsConstants.COPYFILE_EXCL);
    assert.equal(await fileHash(join(fixture,name)),report.inputs[name].sha256,'Owned native fixture copy differs from original');
  }
  const ownedManifest=stringifyStrictLosslessIntegerJson({...producerManifest,path:join(output,'kura')},'owned native retained fixture manifest')+'\n';
  assert.ok(Buffer.byteLength(ownedManifest)<=4096,'Owned native fixture manifest exceeds native input bound');
  await writeFile(join(fixture,'kura-store.json'),ownedManifest,{flag:'wx'});
  report.retained_fixture={source:fixtureSource,producer_manifest:producerManifest,owned_fixture:relative(output,fixture),owned_store:'kura',prestate_scope:'Exact original producer State bytes, restored natively; not an independently authenticated snapshot'};
  report.fixture_inventory_before=await storeInventory(fixture);
  const executable=join(output,'iroha'),toriiExecutable=join(output,'torii-core-routes');
  report.binary=await pinBinary(binarySource,executable,expectedBinary);
  report.torii_binary=await pinBinary(toriiSource,toriiExecutable,expectedTorii);
  const sdk=await import(pathToFileURL(join(native,'javascript/iroha_js/src/gameProofWorker.js')).href);
  const replaySdk=await import(pathToFileURL(join(native,'javascript/iroha_js/src/gameReplay.js')).href);
  for(const[entry,name]of[['game-proof-worker','gameProofWorker.js'],['game-replay','gameReplay.js']])assert.equal(await fileHash(fileURLToPath(import.meta.resolve('@iroha/iroha-js/'+entry))),await fileHash(join(native,'javascript/iroha_js/dist',name)));
  const selection=sdk.decodeGameVerificationRequestV1(requestBytes),evidence=replaySdk.decodeGameReplayEvidenceV1(evidenceBytes);
  assert.equal(selection.computation.kind,computation,'Native fixture differs from explicitly selected computation; never substitute a different producer');
  const expectedEnvelope=replaySdk.encodeGameReplayExportRequestV1({request:selection,evidence});
  await writeFile(join(output,'export-request.nrt'),expectedEnvelope,{flag:'wx'});
  report.fixture_selection={provenance:'Frozen native producer fixture provides independent test pins; not an external network trust distribution.',value:selection};
  const appPort=await freePort(),workerPort=await freePort(),appOrigin=`http://127.0.0.1:${appPort}`,workerOrigin=`http://127.0.0.1:${workerPort}`;
  await mkdir(control,{mode:0o700});
  torii=await launch('native-torii',[toriiExecutable,'--exact','game_replay_retained_endpoint::serve_retained_native_export_for_browser','--ignored','--nocapture'],output,{
    SORA_CARS_REPLAY_TORII_FIXTURE:fixture,SORA_CARS_REPLAY_TORII_CONTROL:control,SORA_CARS_REPLAY_BROWSER_ORIGIN:appOrigin,
  });torii.control=control;
  await waitUntil(async()=>{assert.equal(torii.receipt.status,'running','Native Torii exited before readiness');try{return(await lstat(join(control,'ready.json'))).isFile();}catch(e){if(e.code==='ENOENT')return false;throw e;}},'Native Torii readiness timeout',60000);
  const ready=JSON.parse(await readFile(join(control,'ready.json'),'utf8'));assert.equal(ready.version,1);assert.match(ready.origin,/^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/);const toriiOrigin=ready.origin;report.torii_ready=ready;
  await mkdir(spool,{mode:0o700});
  const config=join(output,'worker.toml');
  await writeFile(config,`listen = "127.0.0.1:${workerPort}"\nallowed_origins = ["${appOrigin}"]\nallowed_authorities = ["127.0.0.1:${workerPort}"]\nresult_ttl_ms = 120000\ndownload_timeout_ms = 30000\nshutdown_grace_ms = 1000\nconnections = 8\n[worker]\nspool_dir = ${JSON.stringify(spool)}\nupload_timeout_ms = 30000\njob_timeout_ms = ${provingBudget.workerJobMs}\nreplay_bytes = 131072\nproof_bytes = ${proofByteLimit}\n`,{flag:'wx'});
  worker=await launch('native-worker',[executable,'app','execution','serve-finalized','--worker-config',config],output);await listenReady(worker,workerPort);
  vite=await launch('vite',[process.execPath,join(project,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(appPort),'--strictPort'],project);await listenReady(vite,appPort);
  browser=await chromium.launch({headless:true});report.browser={engine:'Chromium',version:browser.version(),runtime:process.version};
  const success=await newScenario(`${computation}-actual-retained-export-and-proof`,appOrigin,workerOrigin,toriiOrigin);let observer;
  try {
    const {page,result}=success;await fill(page,selection,workerOrigin,toriiOrigin);
    await page.locator('#native-replay-source').scrollIntoViewIfNeeded();result.source_screenshot=await screenshot(page,'native-torii-source');
    observer=await observeNativeInputs(spool,'native-replay-browser');
    const downloaded=observed(page.waitForResponse(r=>r.url()===toriiOrigin+'/v1/games/replay'&&r.request().method()==='POST'));
    const reserved=observed(page.waitForResponse(r=>r.url()===workerOrigin+'/v1/jobs'&&r.request().method()==='POST'&&r.status()===202));
    const uploaded=observed(page.waitForResponse(r=>new URL(r.url()).origin===workerOrigin&&r.request().method()==='PUT'&&r.status()===202));
    await page.locator('#native-proof-start').click();
    const toriiResponse=await requireToriiReplaySuccess(await downloaded,result);
    result.torii_download={status:toriiResponse.status(),headers:await toriiResponse.allHeaders(),
      byte_evidence:'Pending actual Chromium OPFS staging observation; not a socket-body capture'};
    const uploadResponse=await uploaded,uploadStatus=await uploadResponse.json();
    const reservationResponse=await reserved,reservationStatus=await reservationResponse.json();
    assert.match(uploadStatus.id,/^[a-f0-9]{64}$/);
    assert.equal(new URL(uploadResponse.url()).pathname,`/v1/jobs/${uploadStatus.id}/replay`);
    assert.equal(reservationStatus.id,uploadStatus.id,'Native reservation and upload responses disagree about job identity');
    await waitUntil(async()=>result.requests.filter(r=>r.url===workerOrigin+'/v1/jobs'&&r.method==='POST').length>0,'Native reservation request observation missing',10000);
    assert.equal(result.requests.filter(r=>r.url===workerOrigin+'/v1/jobs'&&r.method==='POST').length,1,'Expected exactly one native reservation');
    result.job_association={reservation_url:reservationResponse.url(),reservation_id:reservationStatus.id,upload_url:uploadResponse.url(),upload_id:uploadStatus.id};
    // A real accepted worker upload follows the application's stage.finish().
    // Observe the retained disk file; Chromium may discard CDP response bodies.
    const stagedDownload=downloadedReplayFromOpfs(await opfsFiles(page),result.torii_download.headers['content-length'],replayBytes);
    const receivedReplay=stagedDownload.bytes;
    const observedFile=join(output,'chromium-opfs-replay.nrt');
    await writeFile(observedFile,receivedReplay,{flag:'wx'});
    assert.equal(await fileHash(observedFile),hash(receivedReplay));
    Object.assign(result.torii_download,{bytes:receivedReplay.length,sha256:hash(receivedReplay),
      byte_evidence:'Actual Chromium OPFS download read after native worker accepted the upload; not a direct socket-body capture',
      opfs_path:stagedDownload.path,retained_file:relative(output,observedFile)});
    result.worker_received=await observer.capture(uploadStatus.id);await observer.close();observer=null;
    for(const[name,bytes]of[['request.nrt',requestBytes],['replay.nrt',replayBytes]])assert.equal(result.worker_received.files[name].sha256,hash(bytes));
    assert.equal(result.worker_received.files['replay.nrt'].sha256,hash(receivedReplay),'Native worker received bytes differ from actual Chromium OPFS download');
    assert.equal(result.worker_received.files['replay.nrt'].bytes,receivedReplay.length);
    // The fixture's Torii serving window is 240 seconds. Its replay is fully staged and
    // uploaded now; proving must continue without a running replay server.
    await stopOwned(torii);
    assert.equal(torii.receipt.exit,0,'Consumed Torii server did not stop gracefully');
    const toriiStoppedAfterDownload=JSON.parse(await readFile(join(control,'stopped.json'),'utf8'));
    assert.equal(toriiStoppedAfterDownload.graceful,true);
    result.replay_server_handoff={stopped_at:new Date().toISOString(),graceful:true,
      scope:'Owned Torii stopped after exact OPFS/native-worker input association. Proof creation and verification continue without a running replay server.'};
    assert.equal(await waitPhase(page,['complete','failed','error'],provingBudget.browserCompletionMs),'complete');
    assert.equal(result.requests.filter(r=>r.url===workerOrigin+'/v1/jobs'&&r.method==='POST').length,1,'Completion unexpectedly reserved a second native job');
    const staged=Object.entries(await opfsFiles(page)).filter(([name])=>name.startsWith('sora-cars-replay-'));
    assert.equal(staged.length,1);assert.equal(staged[0][0],stagedDownload.path);assert.deepEqual(Buffer.from(staged[0][1],'base64'),receivedReplay,'Disk staging changed after the real worker upload');
    assert.deepEqual(Buffer.from(staged[0][1],'base64'),replayBytes,'Completed disk staging differs from native producer');
    await page.locator('#native-proof-save').click();assert.equal(await waitPhase(page,['downloaded','failed','error'],30000),'downloaded');
    const visible=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.equal(visible.nativeProof.independentVerification,false);assert.equal(visible.nativeProof.settlementEnabled,false);assert.equal(visible.nativeProof.replaySource,'torii');assert.equal(visible.nativeProof.computation,computation);result.browser_assurance=visible.nativeProof;
    const files=Object.entries(await opfsFiles(page)).filter(([name])=>name.startsWith('sora-cars-proof-'));assert.equal(files.length,5);
    const saved=join(output,'browser-export');await mkdir(saved);result.output_files={};
    for(const[name,encoded]of files){const leaf=name.split('/').at(-1);assert.ok(['request.nrt','replay.nrt','proof.nrt','endpoint-report.json','verify.txt'].includes(leaf));const bytes=Buffer.from(encoded,'base64');await writeFile(join(saved,leaf),bytes,{flag:'wx'});result.output_files[leaf]={bytes:bytes.length,sha256:hash(bytes)};}
    assert.equal(result.output_files['request.nrt'].sha256,hash(requestBytes));assert.equal(result.output_files['replay.nrt'].sha256,hash(replayBytes));
    const endpoint=JSON.parse(await readFile(join(saved,'endpoint-report.json'),'utf8'));assert.equal(endpoint.authentication,'endpoint-reported-unverified');
    // Independent verification explicitly uses the ORIGINAL pinned request, never a downloaded replacement.
    await command('independent-native-verify',[executable,'app','execution','verify-finalized','--request',join(output,'request.nrt'),'--replay',join(saved,'replay.nrt'),'--proof',join(saved,'proof.nrt')]);
    const verified=sdk.parseGameExecutionReportV1(await readFile(join(output,'independent-native-verify.stdout'),'utf8'));assert.deepEqual(endpoint.report,verified);
    assert.equal(verified.computation.kind,computation,'Native verifier report changed the independently selected computation');
    for(const flag of['profile_registered','settlement_verified','composed_security_qualified','latest_freshness_verified','removal_transitions_replayed'])assert.equal(verified[flag],false);
    assert.equal(verified.record_finality_verified,true);assert.equal(verified.computation_verified,true);result.independent_native_report=verified;
    const toriiUpload=result.requests.find(r=>r.url===toriiOrigin+'/v1/games/replay');assert.ok(toriiUpload);assert.equal(toriiUpload.headers['content-length'],String(expectedEnvelope.length));if(toriiUpload.sha256!==null)assert.equal(toriiUpload.sha256,hash(expectedEnvelope));
    for(const r of result.requests){assert.equal(r.headers.cookie,undefined);assert.equal(r.headers.authorization,undefined);assert.equal(r.headers.origin,appOrigin);}
    result.desktop=await screenshotResult(page,'native-replay-desktop');await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);result.mobile=await screenshotResult(page,'native-replay-mobile');
    await page.locator('#native-proof-cancel').click();await waitUntil(async()=>Object.keys(await opfsFiles(page)).every(name=>!name.startsWith('sora-cars-replay-')),'Replay staging cleanup timeout');
    result.checks.push('Actual shipping Torii200 and exact declared length accompany the real Chromium OPFS download','Actual OPFS download and native worker-received bytes both match the original producer replay','Fresh native worker proof verifies separately using ORIGINAL pinned request','Honest endpoint-only browser flags; independent native report retains every unqualified field','Cancellation removes only temporary replay while completed verification folder remains');
  }finally{await recordScenarioCleanup(success.result,'native-observer',()=>observer?.close());await success.close();}
  await emptySpool(spool);
  const negative=await newScenario(`${computation}-independent-pin-mismatch`,appOrigin,workerOrigin,toriiOrigin);
  try{await fill(negative.page,selection,workerOrigin,toriiOrigin);await negative.page.locator('#native-revision').fill(String(BigInt(selection.revision)+1n));await negative.page.locator('#native-pins-reviewed').check();await negative.page.locator('#native-proof-start').click();await waitPhase(negative.page,['failed']);assert.equal(negative.result.requests.length,0);assert.deepEqual(await opfsFiles(negative.page),{});negative.result.checks.push('Mismatch rejected before Torii upload, staging or worker reservation');}finally{await negative.close();}
  const wrongComputation=await newScenario(`${computation}-cross-computation-rejection`,appOrigin,workerOrigin,toriiOrigin);
  try{await fill(wrongComputation.page,selection,workerOrigin,toriiOrigin);await wrongComputation.page.locator('#native-computation').selectOption(computation==='stock_race'?'street':'stock_race');await wrongComputation.page.locator('#native-pins-reviewed').check();await wrongComputation.page.locator('#native-proof-start').click();await waitPhase(wrongComputation.page,['failed']);assert.equal(wrongComputation.result.requests.length,0);assert.deepEqual(await opfsFiles(wrongComputation.page),{});wrongComputation.result.checks.push('Cross-computation substitution rejected before Torii upload, staging or worker reservation');}finally{await wrongComputation.close();}
  assert.ok(report.scenarios.every(s=>!s.cleanup_errors?.length),'Scenario cleanup or diagnostic collection was incomplete; inspect scenario cleanup_errors');
  report.checks=report.scenarios.flatMap(s=>s.checks.map(check=>`${s.label}: ${check}`));report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack??String(error);}
finally{
  await browser?.close().catch(error=>{report.status='failed';report.browser_cleanup_error=error.message;});
  for(const owned of children.toReversed()){try{await stopOwned(owned);}catch(error){report.status='failed';(report.cleanup_errors??=[]).push(error.message);}}
  if(worker&&worker.receipt.exit!==0){report.status='failed';report.worker_shutdown_error='Native worker did not exit zero';}
  if(torii){try{assert.equal(torii.receipt.exit,0);report.torii_stopped=JSON.parse(await readFile(join(control,'stopped.json'),'utf8'));assert.equal(report.torii_stopped.graceful,true);}catch(error){report.status='failed';report.torii_shutdown_error=error.message;}}
  try{report.spool_entries=(await readdir(spool)).sort();assert.ok(report.spool_entries.every(name=>name==='.public-proof-worker.lock'));}catch(error){report.status='failed';report.spool_cleanup_error=error.message;}
  for(const source of [...report.sources,...Object.values(report.inputs),...(report.store_files??[])]){try{const current=await lstat(source.source);assert.ok(current.isFile()&&!current.isSymbolicLink(),'Source input replaced by nonregular entry');if(await fileHash(source.source)!==source.sha256)report.source_drift.push(source.source);}catch(error){report.source_drift.push({path:source.source,error:error.message});}}
  if(report.store_inventory_before){try{report.store_inventory_after=await storeInventory(sourceStore);assert.deepEqual(report.store_inventory_after,report.store_inventory_before,'Source Kura inventory changed during browser qualification');}catch(error){report.source_drift.push({path:sourceStore,error:error.message});}}
  if(report.fixture_inventory_before){try{report.fixture_inventory_after=await storeInventory(join(output,'retained-fixture'));assert.deepEqual(report.fixture_inventory_after,report.fixture_inventory_before,'Owned native fixture input inventory changed during browser qualification');}catch(error){report.source_drift.push({path:join(output,'retained-fixture'),error:error.message});}}
  if(report.source_drift.length||interrupted)report.status='failed';report.finished_at=new Date().toISOString();await persist();
  process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);console.log(JSON.stringify({status:report.status,report:join(output,'report.json')}));
}
if(report.status!=='passed')process.exitCode=1;
