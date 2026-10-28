#!/usr/bin/env node
/** Real Chromium / native finalized-proof integration. No Cargo or proof mocks.
 * node scripts/test-native-proof-browser.mjs --native ../iroha-sora-cars-native 
 *   --request PUBLIC/request.nrt --replay PUBLIC/replay.nrt --output NEW_DIRECTORY
 * The output directory must not exist. Only the OS directory chooser is replaced;
 * application writes use real Chromium OPFS. The public fixture is synthetic,
 * two-player, zero-motion, all-forfeit and starts from a zero-funded prestate.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants as fsConstants, createReadStream, watch } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, open, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer, createConnection } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  assert.ok(['--native', '--request', '--replay', '--output', '--binary', '--expected-binary-sha256'].includes(key), `Unknown argument: ${key}`);
  assert.ok(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `Missing value for ${key}`);
  assert.equal(options[key], undefined, `Duplicate argument: ${key}`);
  options[key] = process.argv[i + 1];
}
for (const key of ['--native', '--request', '--replay', '--output']) assert.ok(options[key], `Required: ${key}`);
const native = resolve(options['--native']), output = resolve(options['--output']);
const binarySource = resolve(options['--binary'] ?? join(native, 'target/debug/iroha'));
const expectedBinary = options['--expected-binary-sha256'] ?? '567b7a7ad104134d8ed5b9eda34fce75fdb9c79962fc7b560c99098c62679f46';
assert.match(expectedBinary, /^[a-f0-9]{64}$/);
await mkdir(output, { recursive: false });
const report = {
  schema: 'sora-cars.native-proof-browser.v1', status: 'running', started_at: new Date().toISOString(),
  scope: 'Real Chromium File uploads, CORS, native proof generation, OPFS export and separate native CLI verification. Synthetic two-player all-forfeit zero-motion zero-funded fixture.',
  limits: { wallet_actions: false, browser_verification: false, production_isolation_qualified: false, full_race_qualified: false, funded_game_qualified: false, deployment: false },
  chooser: 'Only showDirectoryPicker is substituted; actual Chromium OPFS directories, Files and writable streams are used.',
  source_scope: 'Selected app and native transport sources plus executed binary hash; not complete reproducible native build provenance.',
  inputs: {}, sources: [], processes: [], scenarios: [], checks: [], source_drift: [],
};
let persistQueue = Promise.resolve();
function persist() {
  const value = `${JSON.stringify(report, null, 2)}\n`;
  persistQueue = persistQueue.then(async () => {
    await writeFile(join(output, 'report.json.tmp'), value);
    await rename(join(output, 'report.json.tmp'), join(output, 'report.json'));
  });
  return persistQueue;
}
const hash = value => createHash('sha256').update(value).digest('hex');
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
  const stat = await lstat(source);
  assert.ok(stat.isFile() && stat.size > 0 && stat.size <= (name === 'request.nrt' ? 4096 : 131071), 'Public integration input must be one bounded regular file');
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
async function launch(label, argv, cwd) {
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
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['ignore', stdout.fd, stderr.fd] });
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
  owned.child.kill('SIGTERM');
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
async function fill(page, selection, workerOrigin, replayPath = join(output, 'replay.nrt')) {
  await page.locator('#native-worker-origin').fill(workerOrigin);
  for (const [key, id] of Object.entries(ids)) await page.locator(id).fill(String(selection[key]));
  await page.locator('#native-mode').selectOption(selection.mode.kind);
  await page.locator('#native-request-file').setInputFiles(join(output, 'request.nrt'));
  await page.locator('#native-replay-file').setInputFiles(replayPath);
  await page.locator('#native-pins-reviewed').check();
}
async function opfsFiles(page) {
  return page.evaluate(async () => {
    const files = {};
    async function walk(directory, prefix) {
      for await (const [name, handle] of directory.entries()) {
        const path = `${prefix}${name}`;
        if (handle.kind === 'directory') await walk(handle, `${path}/`);
        else {
          const file = await handle.getFile();
          if (file.size > 2 * 1024 * 1024) throw new Error('Unexpectedly large OPFS integration artifact');
          const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
          for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
          files[path] = btoa(binary);
        }
      }
    }
    await walk(await navigator.storage.getDirectory(), ''); return files;
  });
}
async function newScenario(label, appOrigin, workerOrigin, { chooser = true } = {}) {
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
    if (url.origin !== workerOrigin) {
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
    if (new URL(response.url()).origin !== workerOrigin) return;
    const entry = { url: response.url(), path: new URL(response.url()).pathname, method: response.request().method(), status: response.status(), headers: await response.allHeaders() };
    if (!entry.path.endsWith('/proof')) {
      try { const text = await response.text(); assert.ok(text.length <= 1_052_672); entry.body = text; }
      catch (error) { entry.body_error = error.message; }
    }
    result.responses.push(entry);
  })()));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', event => {
    if (event.request.url.startsWith(`${workerOrigin}/`)) result.cdp_requests.push({ requestId: event.requestId, method: event.request.method, url: event.request.url, headers: event.request.headers });
  });
  cdp.on('Network.requestWillBeSentExtraInfo', event => result.cdp_extra_headers.push({ requestId: event.requestId, headers: event.headers }));
  cdp.on('Network.responseReceived', event => {
    if (event.response.url.startsWith(`${workerOrigin}/`)) result.cdp_responses.push({ requestId: event.requestId, url: event.response.url, status: event.response.status, headers: event.response.headers });
  });
  // Chromium exposes a blocked CORS response through ExtraInfo even when it
  // deliberately withholds the response from JavaScript and Playwright.
  cdp.on('Network.responseReceivedExtraInfo', event => result.cdp_response_extra_headers.push({ requestId: event.requestId, status: event.statusCode, headers: event.headers }));
  await page.goto(`${appOrigin}/#/prove`);
  await page.locator('#native-proof-form').waitFor();
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  assert.equal(new URL(page.url()).hash, '#/prove');
  return { page, result, async close() {
    if (!page.isClosed()) {
      result.final_phase = await phase(page).catch(() => null);
      result.storage_files = Object.keys(await opfsFiles(page));
    }
    await context.close(); await Promise.all(pending);
    const workerIds = new Set(result.cdp_requests.map(event => event.requestId));
    result.cdp_extra_headers = result.cdp_extra_headers.filter(event => workerIds.has(event.requestId));
    result.cdp_response_extra_headers = result.cdp_response_extra_headers.filter(event => workerIds.has(event.requestId));
    assert.deepEqual(result.page_errors, [], `${label}: browser exception`);
    assert.deepEqual(result.external_requests ?? [], [], `${label}: unexpected external network request`);
    assert.equal(result.recording_error, undefined, `${label}: incomplete network evidence`);
    await persist();
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

await persist();
let worker, vite;
const spool = join(output, 'spool');
try {
  await mkdir(join(output, 'sources'));
  const appSources = (await filesUnder(join(project, 'src'))).filter(path => /\.(ts|css|json)$/.test(path));
  for (const name of ['package.json', 'package-lock.json', 'vite.config.ts', 'index.html', 'scripts/test-native-proof-browser.mjs']) appSources.push(join(project, name));
  for (const source of appSources.sort()) await snapshot(source, 'app');
  const nativeSources = [
    'Cargo.lock', 'crates/iroha_cli/Cargo.toml', 'crates/iroha_cli/src/execution.rs', 'crates/iroha_cli/src/main_shared.rs',
    'crates/iroha_config/src/execution_worker.rs', 'crates/iroha_config/src/execution_worker_http.rs',
    'javascript/iroha_js/package.json', 'javascript/iroha_js/package-lock.json',
    'javascript/iroha_js/scripts/build-dist.mjs', 'javascript/iroha_js/src/gameProofWorker.js',
    'javascript/iroha_js/src/norito.js', 'javascript/iroha_js/src/noritoGameCodecs.js',
    'javascript/iroha_js/src/strictLosslessJson.js',
    'javascript/iroha_js/dist/gameProofWorker.js', 'javascript/iroha_js/dist/norito.js',
    'javascript/iroha_js/dist/noritoGameCodecs.js', 'javascript/iroha_js/dist/strictLosslessJson.js',
  ].map(name => join(native, name));
  nativeSources.push(...(await readdir(join(native, 'crates/iroha_cli/src'))).filter(name => /^execution_worker.*\.rs$/.test(name)).map(name => join(native, 'crates/iroha_cli/src', name)));
  for (const source of nativeSources.sort()) await snapshot(source, 'native-transport');
  const requestBytes = await copyInput(options['--request'], 'request.nrt');
  const replayBytes = await copyInput(options['--replay'], 'replay.nrt');
  assert.ok(requestBytes.length > 0 && requestBytes.length <= 4096);
  assert.ok(replayBytes.length > 0 && replayBytes.length < 131072);
  const invalidReplay = Buffer.concat([replayBytes, Buffer.from([0])]);
  await writeFile(join(output, 'invalid-replay.nrt'), invalidReplay, { flag: 'wx' });
  report.inputs['invalid-replay.nrt'] = { derivation: 'Exact replay.nrt with one trailing zero byte, for native canonical-archive rejection', bytes: invalidReplay.length, sha256: hash(invalidReplay) };
  const executable = join(output, 'iroha');
  assert.equal(await fileHash(binarySource), expectedBinary, 'Native binary differs from explicit expected pin; do not rebuild automatically');
  await copyFile(binarySource, executable); await chmod(executable, 0o500);
  assert.equal(await fileHash(executable), expectedBinary); assert.equal(await fileHash(binarySource), expectedBinary);
  report.binary = { source: binarySource, file: 'iroha', sha256: expectedBinary, bytes: (await lstat(executable)).size };
  const sdk = await import(pathToFileURL(join(native, 'javascript/iroha_js/src/gameProofWorker.js')).href);
  const actualSdk = fileURLToPath(import.meta.resolve('@iroha/iroha-js/game-proof-worker'));
  report.sdk_resolution = { app_package_entry: actualSdk, sha256: await fileHash(actualSdk) };
  assert.equal(report.sdk_resolution.sha256, await fileHash(join(native, 'javascript/iroha_js/dist/gameProofWorker.js')), 'App dependency does not resolve to the selected native SDK distribution transport');
  const selection = sdk.decodeGameVerificationRequestV1(requestBytes);
  report.fixture_selection = { provenance: 'Decoded from frozen synthetic fixture, used as test inputs; this test does not authenticate an external trust source', value: selection };
  const workerPort = await freePort(), appPort = await freePort();
  const workerOrigin = `http://127.0.0.1:${workerPort}`, appOrigin = `http://127.0.0.1:${appPort}`;
  await mkdir(spool, { mode: 0o700 });
  const config = join(output, 'worker.toml');
  // JSON string spelling is valid TOML basic-string spelling for these local paths.
  await writeFile(config, `listen = "127.0.0.1:${workerPort}"\nallowed_origins = ["${appOrigin}"]\nallowed_authorities = ["127.0.0.1:${workerPort}"]\nresult_ttl_ms = 120000\ndownload_timeout_ms = 30000\nshutdown_grace_ms = 1000\nconnections = 8\n[worker]\nspool_dir = ${JSON.stringify(spool)}\nupload_timeout_ms = 30000\njob_timeout_ms = 180000\nreplay_bytes = 131072\nproof_bytes = 524288\n`, { flag: 'wx' });
  report.config = { file: 'worker.toml', sha256: await fileHash(config), app_origin: appOrigin, worker_origin: workerOrigin };
  worker = await launch('native-server', [executable, 'app', 'execution', 'serve-finalized', '--worker-config', config], output);
  await listenReady(worker, workerPort);
  vite = await launch('vite', [process.execPath, join(project, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], project);
  await listenReady(vite, appPort);
  browser = await chromium.launch({ headless: true }); report.browser = { engine: 'Chromium', version: browser.version(), headless: true, runtime: process.version };

  // Every scenario uses a new context, hence empty genuine OPFS and no cookies.
  for (const label of ['mismatched-pins', 'unsupported-directory']) {
    const test = await newScenario(label, appOrigin, workerOrigin, { chooser: label !== 'unsupported-directory' });
    try {
      await fill(test.page, selection, workerOrigin);
      if (label === 'mismatched-pins') {
        await test.page.locator('#native-revision').fill(String(BigInt(selection.revision) + 1n));
        await test.page.locator('#native-pins-reviewed').check();
      }
      await test.page.locator('#native-proof-start').click();
      await waitPhase(test.page, ['failed', 'error'], 10_000);
      test.result.status_text = `${await test.page.locator('#native-proof-status').innerText()}\n${await test.page.locator('#native-proof-error').innerText()}`;
      if (label === 'mismatched-pins') assert.match(test.result.status_text, /independently selected|一致|match/i);
      else assert.match(test.result.status_text, /folder|directory|フォルダー|対応|browser/i);
      await delay(200); assert.equal(test.result.requests.length, 0, `${label} must fail before worker transport`);
      await test.page.locator('#native-proof-status').scrollIntoViewIfNeeded();
      test.result.screenshot = await screenshot(test.page, label);
      test.result.checks.push('Failure before any native worker request');
    } finally { await test.close(); }
  }

  const success = await newScenario('real-native-proof', appOrigin, workerOrigin);
  let successInputs;
  try {
    const { page, result } = success;
    // Selecting the request must not populate independently selected trust fields.
    const before = Object.fromEntries(await Promise.all(Object.values(ids).map(async id => [id, await page.locator(id).inputValue()])));
    await page.locator('#native-request-file').setInputFiles(join(output, 'request.nrt'));
    for (const [id, value] of Object.entries(before)) assert.equal(await page.locator(id).inputValue(), value, `Request auto-populated independent input ${id}`);
    await fill(page, selection, workerOrigin);
    successInputs = await observeNativeInputs(spool, 'real-native-proof');
    const uploadAccepted = page.waitForResponse(response => new URL(response.url()).origin === workerOrigin && response.request().method() === 'PUT' && response.status() === 202);
    await page.locator('#native-proof-start').click();
    const uploadResponse = await uploadAccepted, uploadStatus = await uploadResponse.json();
    assert.equal(uploadStatus.status, 'running');
    assert.equal(new URL(uploadResponse.url()).pathname, `/v1/jobs/${uploadStatus.id}/replay`);
    result.server_received = await successInputs.capture(uploadStatus.id);
    result.server_received.native_server_pid = worker.receipt.pid;
    await successInputs.close(); successInputs = null;
    await persist();
    assert.equal(await waitPhase(page, ['complete', 'failed', 'error']), 'complete', 'Real native job failed');
    assert.equal(await page.locator('#native-proof-save').isEnabled(), true);
    result.endpoint_text = await page.locator('#native-proof-report').innerText();
    assert.match(result.endpoint_text, /worker.reported|ワーカーからの報告/i);
    assert.match(await page.locator('.native-proof-assurance').innerText(), /endpoint.reported.+not independently verified/is);
    result.before_save_screenshots = await screenshotResult(page, 'native-complete-unverified');
    const reservationsBeforeSave = result.requests.filter(request => request.method === 'POST' && request.path === '/v1/jobs').length;
    assert.equal(reservationsBeforeSave, 1);
    await page.evaluate(() => {
      window.showDirectoryPicker = async options => {
        window.__nativeProofDeniedPicker = { options, userActivation: navigator.userActivation.isActive };
        throw new DOMException('Integration test: folder access denied.', 'NotAllowedError');
      };
    });
    await page.locator('#native-proof-save').click();
    assert.equal(await waitPhase(page, ['failed'], 10_000), 'failed');
    assert.match(await page.locator('#native-proof-error').innerText(), /folder access denied/i);
    for (const id of [...Object.values(ids), '#native-mode', '#native-request-file', '#native-replay-file', '#native-worker-origin']) {
      assert.equal(await page.locator(id).isDisabled(), true, `Denied chooser unlocked ${id}`);
    }
    assert.equal(await page.locator('#native-proof-start').isDisabled(), true);
    assert.equal(await page.locator('#native-proof-save').isEnabled(), true, 'Denied chooser cannot retry the completed job');
    assert.equal(await page.locator('#native-proof-cancel').isEnabled(), true, 'Denied chooser removed cancellation');
    result.denied_picker = await page.evaluate(() => window.__nativeProofDeniedPicker);
    assert.equal(result.denied_picker.userActivation, true);
    assert.deepEqual(await opfsFiles(page), {}, 'Denied chooser created local output');
    assert.equal(result.requests.filter(request => request.method === 'POST' && request.path === '/v1/jobs').length, reservationsBeforeSave);
    assert.equal(result.requests.some(request => request.method === 'GET' && request.path.endsWith('/proof')), false);
    await page.locator('#native-proof-status').scrollIntoViewIfNeeded();
    result.denied_picker_screenshot = await screenshot(page, 'native-folder-denied-retry');
    await page.evaluate(() => {
      window.showDirectoryPicker = async options => {
        window.__nativeProofPicker = { options, userActivation: navigator.userActivation.isActive };
        return navigator.storage.getDirectory();
      };
    });
    await page.locator('#native-proof-save').click();
    assert.equal(await waitPhase(page, ['downloaded', 'failed', 'error'], 30_000), 'downloaded');
    assert.equal(result.requests.filter(request => request.method === 'POST' && request.path === '/v1/jobs').length, reservationsBeforeSave, 'Retry reserved another native job');
    const visibleState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(visibleState.nativeProof.independentVerification, false);
    assert.equal(visibleState.nativeProof.settlementEnabled, false);
    assert.ok(!['pairing', 'connected', 'signing', 'submitted'].includes(visibleState.network), 'Proof workflow changed wallet state');
    result.browser_assurance = visibleState.nativeProof;
    result.picker = await page.evaluate(() => window.__nativeProofPicker);
    assert.equal(result.picker.userActivation, true, 'Directory picker lost real click activation');
    const storage = await opfsFiles(page), entries = Object.entries(storage);
    assert.equal(entries.length, 5, 'The complete export contains exactly five files');
    const folders = new Set(entries.map(([name]) => name.split('/')[0]));
    assert.equal(folders.size, 1); assert.match([...folders][0], /^sora-cars-proof-/);
    const saved = join(output, 'browser-export'); await mkdir(saved);
    result.output_files = {};
    for (const [name, encoded] of entries) {
      const leaf = name.split('/').at(-1); assert.ok(['request.nrt', 'replay.nrt', 'proof.nrt', 'endpoint-report.json', 'verify.txt'].includes(leaf));
      const bytes = Buffer.from(encoded, 'base64'); await writeFile(join(saved, leaf), bytes, { flag: 'wx' });
      result.output_files[leaf] = { bytes: bytes.length, sha256: hash(bytes) };
    }
    assert.equal(result.output_files['request.nrt'].sha256, hash(requestBytes));
    assert.equal(result.output_files['replay.nrt'].sha256, hash(replayBytes));
    const endpoint = JSON.parse(await readFile(join(saved, 'endpoint-report.json'), 'utf8'));
    assert.equal(endpoint.format, 'sora-cars-native-endpoint-report'); assert.equal(endpoint.version, 1);
    assert.equal(endpoint.authentication, 'endpoint-reported-unverified');
    const commandText = await page.locator('#native-verification-command').inputValue();
    assert.equal(await readFile(join(saved, 'verify.txt'), 'utf8'), commandText);
    assert.match(commandText, /verify-finalized/); assert.match(commandText, /request\.nrt/); assert.match(commandText, /replay\.nrt/); assert.match(commandText, /proof\.nrt/);
    result.desktop_screenshots = await screenshotResult(page, 'native-export-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile horizontal overflow');
    result.mobile_screenshots = await screenshotResult(page, 'native-export-mobile');
    await command('independent-native-verify', [executable, 'app', 'execution', 'verify-finalized', '--request', join(saved, 'request.nrt'), '--replay', join(saved, 'replay.nrt'), '--proof', join(saved, 'proof.nrt')]);
    const verified = sdk.parseGameExecutionReportV1(await readFile(join(output, 'independent-native-verify.stdout'), 'utf8'));
    assert.deepEqual(endpoint.report, verified, 'Saved endpoint report differs from independent native verification');
    for (const flag of ['profile_registered', 'settlement_verified', 'composed_security_qualified', 'latest_freshness_verified', 'removal_transitions_replayed']) assert.equal(verified[flag], false, `${flag} was upgraded`);
    assert.equal(verified.record_finality_verified, true); assert.equal(verified.computation_verified, true);
    assert.equal(Number(verified.proof_bytes), result.output_files['proof.nrt'].bytes);
    result.independent_native_report = verified;
    await delay(100);
    const reservation = result.requests.find(request => request.method === 'POST' && request.path === '/v1/jobs');
    const upload = result.requests.find(request => request.method === 'PUT' && request.path.endsWith('/replay'));
    assert.ok(reservation); assert.ok(upload);
    const reserved = result.responses.find(response => response.method === 'POST' && response.path === '/v1/jobs' && response.status === 202);
    assert.equal(JSON.parse(reserved.body).id, result.server_received.http_job_id);
    assert.equal(upload.path, `/v1/jobs/${result.server_received.http_job_id}/replay`);
    const receivedRequest = result.server_received.files['request.nrt'], receivedReplay = result.server_received.files['replay.nrt'];
    assert.equal(receivedRequest.sha256, hash(requestBytes)); assert.equal(receivedRequest.bytes, requestBytes.length);
    assert.equal(receivedReplay.sha256, hash(replayBytes)); assert.equal(receivedReplay.bytes, replayBytes.length);
    assert.equal(reservation.headers['content-length'], String(receivedRequest.bytes));
    assert.equal(upload.headers['content-length'], String(receivedReplay.bytes));
    if (reservation.sha256 !== null) assert.equal(reservation.sha256, receivedRequest.sha256);
    if (upload.sha256 !== null) assert.equal(upload.sha256, receivedReplay.sha256);
    assert.equal(upload.headers['content-length'], String(replayBytes.length), 'Chromium did not send exact Content-Length');
    for (const request of [reservation, upload]) {
      assert.equal(request.headers.origin, appOrigin); assert.equal(request.headers.cookie, undefined); assert.equal(request.headers.authorization, undefined);
    }
    const proofResponse = result.responses.find(response => response.method === 'GET' && response.path.endsWith('/proof'));
    assert.equal(proofResponse?.status, 200); assert.equal(proofResponse.headers['access-control-allow-origin'], appOrigin);
    assert.equal(proofResponse.headers['content-length'], String(result.output_files['proof.nrt'].bytes));
    assert.equal(proofResponse.headers['access-control-allow-credentials'], undefined);
    result.checks.push('Server-received request/replay snapshots from the sole native job equal browser-selected input bytes', 'Browser-generated exact Content-Length and real CORS without credentials', 'Fresh proof generated by owned native service', 'Denied chooser retains locked inputs and allows save/cancel retry without new reservation', 'Actual OPFS export, no browser verification claim', 'Independent native CLI report agrees without qualification upgrades', 'Desktop/mobile top, result and expanded command views');
    // Do not rely on an asynchronous pagehide fetch for this integration receipt.
    // A real closed tab instead relies on the native owner's configured expiry.
    await page.locator('#native-proof-cancel').click();
    await waitPhase(page, ['cancelled'], 15_000);
    await waitUntil(() => result.requests.some(request => request.method === 'DELETE'), 'Successful export cleanup omitted native DELETE', 10_000);
    await emptySpool(spool);
    result.checks.push('Explicit post-verification cancellation completes native spool cleanup before the context closes');
  } finally { await successInputs?.close(); await success.close(); }
  await emptySpool(spool);

  for (const label of ['cancel-running-job', 'navigate-running-job']) {
    const test = await newScenario(label, appOrigin, workerOrigin);
    try {
      const { page, result } = test; await fill(page, selection, workerOrigin);
      const uploaded = page.waitForResponse(response => new URL(response.url()).origin === workerOrigin && response.request().method() === 'PUT' && response.status() === 202);
      await page.locator('#native-proof-start').click(); await uploaded;
      if (label === 'cancel-running-job') {
        await page.locator('#native-proof-cancel').click(); await waitPhase(page, ['cancelled', 'idle'], 15_000);
      } else {
        await page.locator('.header button.brand[data-action="home"]').click();
        await page.waitForFunction(() => !document.querySelector('#native-proof-form'));
      }
      await emptySpool(spool);
      await waitUntil(() => result.requests.some(request => request.method === 'DELETE'), `${label} omitted cancellation request`, 10_000);
      assert.equal(result.requests.some(request => request.method === 'GET' && request.path.endsWith('/proof')), false);
      assert.deepEqual(await opfsFiles(page), {}, 'Cancelled run published a browser file');
      if (label === 'navigate-running-job') {
        await page.goto(`${appOrigin}/#/prove`); await page.locator('#native-proof-form').waitFor();
        assert.equal(await page.locator('#native-proof-report').innerText(), '');
        assert.equal(await page.locator('#native-proof-save').isDisabled(), true);
      }
      result.screenshot = await screenshot(page, label);
      result.checks.push('Real upload accepted before cancellation', 'Native DELETE observed and owned spool cleaned', 'No proof download or published OPFS file');
    } finally { await test.close(); }
  }

  const invalid = await newScenario('native-invalid-replay', appOrigin, workerOrigin);
  let invalidInputs;
  try {
    await fill(invalid.page, selection, workerOrigin, join(output, 'invalid-replay.nrt'));
    invalidInputs = await observeNativeInputs(spool, 'native-invalid-replay');
    const uploadAccepted = invalid.page.waitForResponse(response => new URL(response.url()).origin === workerOrigin && response.request().method() === 'PUT' && response.status() === 202);
    await invalid.page.locator('#native-proof-start').click();
    const uploadResponse = await uploadAccepted, uploadStatus = await uploadResponse.json();
    assert.equal(new URL(uploadResponse.url()).pathname, `/v1/jobs/${uploadStatus.id}/replay`);
    invalid.result.server_received = await invalidInputs.capture(uploadStatus.id);
    invalid.result.server_received.native_server_pid = worker.receipt.pid;
    await invalidInputs.close(); invalidInputs = null;
    await persist();
    await waitPhase(invalid.page, ['failed', 'error'], 60_000);
    await waitUntil(() => invalid.result.responses.some(response => /"error"\s*:\s*"native_job_failed"/.test(response.body ?? '')), 'Missing actual native failure response', 10_000);
    const received = invalid.result.server_received.files;
    assert.equal(received['request.nrt'].sha256, hash(requestBytes));
    assert.equal(received['replay.nrt'].sha256, hash(invalidReplay)); assert.equal(received['replay.nrt'].bytes, invalidReplay.length);
    const upload = invalid.result.requests.find(request => request.method === 'PUT' && request.path === `/v1/jobs/${uploadStatus.id}/replay`);
    assert.equal(upload.headers['content-length'], String(received['replay.nrt'].bytes));
    const reserved = invalid.result.responses.find(response => response.method === 'POST' && response.path === '/v1/jobs' && response.status === 202);
    assert.equal(JSON.parse(reserved.body).id, uploadStatus.id);
    assert.equal(invalid.result.requests.some(request => request.path.endsWith('/proof')), false);
    assert.deepEqual(await opfsFiles(invalid.page), {});
    await invalid.page.locator('#native-proof-status').scrollIntoViewIfNeeded();
    invalid.result.screenshot = await screenshot(invalid.page, 'native-invalid-replay');
    invalid.result.checks.push('Actual server-received trailing-byte replay retained and hashed', 'Native archive rejection after real upload', 'Native failure surfaces without proof publication');
  } finally { await invalidInputs?.close(); await invalid.close(); }
  await emptySpool(spool);

  const lateChoice = await newScenario('late-folder-choice-after-navigation', appOrigin, workerOrigin);
  try {
    const { page, result } = lateChoice;
    result.coverage = 'Deferred directory chooser response after route navigation. Actual OPFS handle returned late; no pending OS write is simulated or qualified.';
    await fill(page, selection, workerOrigin);
    await page.locator('#native-proof-start').click();
    assert.equal(await waitPhase(page, ['complete', 'failed', 'error']), 'complete', 'Late-chooser scenario requires a genuinely completed native job');
    await page.evaluate(() => {
      window.showDirectoryPicker = options => new Promise(resolveChoice => {
        window.__nativeProofDelayedPicker = { options, userActivation: navigator.userActivation.isActive };
        window.__resolveNativeProofDirectory = async () => {
          const directory = await navigator.storage.getDirectory();
          resolveChoice(directory);
        };
      });
    });
    await page.locator('#native-proof-save').click();
    await page.waitForFunction(() => typeof window.__resolveNativeProofDirectory === 'function');
    result.delayed_picker = await page.evaluate(() => window.__nativeProofDelayedPicker);
    assert.equal(result.delayed_picker.userActivation, true);
    result.chooser_pending_phase = await phase(page);
    assert.equal(result.chooser_pending_phase, 'complete', 'Directory selection precedes proof download');
    assert.equal(await page.locator('#native-proof-save').isDisabled(), true);
    assert.equal(await page.locator('#native-request-file').isDisabled(), true);
    await page.locator('.header button.brand[data-action="home"]').click();
    await page.waitForFunction(() => !document.querySelector('#native-proof-form'));
    await waitUntil(() => result.requests.some(request => request.method === 'DELETE'), 'Navigation while choosing a folder omitted native cancellation', 10_000);
    await emptySpool(spool);
    // Resolve the chooser only after route closure and observed native cleanup.
    await page.evaluate(() => window.__resolveNativeProofDirectory());
    for (let check = 0; check < 5; check++) {
      await delay(100);
      const entries = await page.evaluate(async () => {
        const entries = [];
        for await (const [name, handle] of (await navigator.storage.getDirectory()).entries()) entries.push({ name, kind: handle.kind });
        return entries;
      });
      assert.deepEqual(entries, [], 'A late folder choice created an owned child or output after navigation');
      result.storage_entries_after_late_choice = entries;
    }
    assert.equal(result.requests.filter(request => request.method === 'POST' && request.path === '/v1/jobs').length, 1);
    assert.equal(result.requests.some(request => request.method === 'GET' && request.path.endsWith('/proof')), false, 'Late folder choice downloaded a proof');
    assert.equal(await page.locator('#native-proof-form').count(), 0, 'Late chooser reopened the closed workflow');
    assert.equal(await page.locator('#dialog').isVisible(), false, 'Late chooser opened an unrelated completion dialog');
    await page.evaluate(() => { window.location.hash = '#/prove'; });
    await page.locator('#native-proof-form').waitFor();
    assert.equal(await phase(page), 'idle');
    assert.equal(await page.locator('#native-proof-save').isDisabled(), true);
    assert.equal(await page.locator('#native-proof-report').innerText(), '');
    await page.locator('#native-proof-status').scrollIntoViewIfNeeded();
    result.screenshot = await screenshot(page, 'native-late-folder-choice-clean');
    result.checks.push('Another real native job completes before the deferred chooser opens', 'Navigation requests native DELETE and spool cleanup before chooser resolution', 'Late actual OPFS handle creates no child directory or file and triggers no proof download', 'Returning to the same app route has idle status and no stale report');
  } finally { await lateChoice.close(); }
  await emptySpool(spool);

  // Same actual Vite application, distinct browser Origin not on native allowlist.
  const rejected = await newScenario('alternate-origin-rejected', `http://localhost:${appPort}`, workerOrigin);
  try {
    await fill(rejected.page, selection, workerOrigin);
    await rejected.page.locator('#native-proof-start').click(); await waitPhase(rejected.page, ['failed', 'error'], 15_000);
    await delay(200);
    assert.ok(rejected.result.console.some(entry => /CORS|Access-Control-Allow-Origin|preflight/i.test(entry.text)), 'Missing actual Chromium CORS rejection');
    const workerIds = new Set(rejected.result.cdp_requests.map(request => request.requestId));
    assert.ok(rejected.result.cdp_responses.some(response => response.status === 403) || rejected.result.responses.some(response => response.status === 403) || rejected.result.cdp_response_extra_headers.some(response => workerIds.has(response.requestId) && response.status === 403), 'Missing real native HTTP 403 in browser network evidence');
    assert.equal(rejected.result.responses.some(response => response.method === 'POST' && response.status === 202), false);
    assert.equal(rejected.result.requests.some(request => request.method === 'PUT'), false);
    assert.deepEqual(await opfsFiles(rejected.page), {});
    rejected.result.screenshot = await screenshot(rejected.page, 'alternate-origin-rejected');
    rejected.result.checks.push('Real Chromium Origin differs from configured origin; CORS blocks reservation');
  } finally { await rejected.close(); }
  await emptySpool(spool);
  report.checks = report.scenarios.flatMap(scenario => scenario.checks.map(check => `${scenario.label}: ${check}`));
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack ?? String(error);
} finally {
  await browser?.close().catch(error => { report.status = 'failed'; report.browser_cleanup_error = error.message; });
  for (const owned of children.toReversed()) {
    try { await stopOwned(owned); }
    catch (error) { report.status = 'failed'; (report.cleanup_errors ??= []).push(error.message); }
  }
  if (worker && worker.receipt.exit !== 0) { report.status = 'failed'; report.native_shutdown_error = 'Native server did not exit zero'; }
  try {
    report.spool_entries = (await readdir(spool)).sort();
    if (report.spool_entries.some(name => name !== '.public-proof-worker.lock')) { report.status = 'failed'; report.spool_cleanup_error = 'Native spool retains job files'; }
  } catch (error) { report.spool_inspection_error = error.message; }
  for (const source of report.sources) {
    try { if (await fileHash(source.source) !== source.sha256) report.source_drift.push(source.source); }
    catch (error) { report.source_drift.push({ path: source.source, error: error.message }); }
  }
  if (report.source_drift.length || interrupted) report.status = 'failed';
  report.finished_at = new Date().toISOString(); await persist();
  process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm);
  console.log(JSON.stringify({ status: report.status, report: join(output, 'report.json') }, null, 2));
}
if (report.status !== 'passed') process.exitCode = 1;
