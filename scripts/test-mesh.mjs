import { checkpointSigningFrame, frontierSigningFrame, inputDigest, inputSigningFrame } from '../src/chain/certificates.ts';
const commitmentLiteral = value => 'game384:' + value.toString(16).padStart(2, '0').toUpperCase().repeat(48);
const certificateFrame = (network, kind, body) => { if (kind === 'checkpoint') return checkpointSigningFrame(network, body); if (kind === 'commitment-set') return frontierSigningFrame(network, body); throw new Error('Unknown signed certificate purpose'); };
// Actual eight-context transport/render qualification. Test-only input keys and
// nonspendable account labels do not authenticate a ledger roster or settlement.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { gameHashLiteralV1 } from '@iroha/iroha-js/game';
import { raceHashLiteralV1 } from '@iroha/iroha-js/race';
import { launchChromium } from './lib/browser-launch.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = process.env.SORA_CARS_TEST_ORIGIN ?? 'http://127.0.0.1:5173';
const endpoint = new URL(origin);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) && endpoint.protocol === 'http:' && endpoint.pathname === '/' && !endpoint.search && !endpoint.hash && !endpoint.username && !endpoint.password, 'use a local test origin');
const targetTick = Number(process.env.SORA_CARS_TEST_TICKS ?? 180);
if (!Number.isSafeInteger(targetTick) || targetTick < 180 || targetTick > 5400 || targetTick % 6) throw new Error('SORA_CARS_TEST_TICKS must be a multiple of six from 180 through 5400.');
const fullDuration = targetTick === 5400;
const timeoutMs = 45_000 + Math.ceil(targetTick / 30 * 2000);
const headed = process.env.SORA_CARS_TEST_HEADED === '1';
const channel = process.env.SORA_CARS_TEST_CHANNEL ?? 'default';
assert.ok(['default', 'chrome'].includes(channel), 'SORA_CARS_TEST_CHANNEL must be default or chrome');
const launchOptions = {
  headless: !headed, timeout: 20_000,
  ...(channel === 'chrome' ? { channel: 'chrome' } : {}),
  // CDP only exposes Browser.getBrowserCommandLine with this flag; current
  // Playwright defaults do not add it. Channel selection is independent of UI.
  args: ['--enable-automation', ...(channel === 'chrome' && process.platform === 'darwin' ? ['--use-angle=metal'] : [])],
};
const output = resolve(root, process.env.SORA_CARS_TEST_OUTPUT ?? `output/browser/eight-peer-${targetTick}-${new Date().toISOString().replaceAll(':', '-')}`);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const hex = bytes => Buffer.from(bytes).toString('hex');
const slots = Array.from({ length: 8 }, (_, slot) => slot);
const keys = slots.map(slot => new Uint8Array(32).fill(slot + 1));
const nativeProfile = JSON.parse(readFileSync(resolve(root, 'src/game/generated/race-v1-kernels.json'), 'utf8')).profile_id;
const scope = {
  networkId: NetworkId.fromBytes(new Uint8Array(32).fill(3)).toString(),
  raceId: raceHashLiteralV1(new Uint8Array(32).fill(1)), profileId: gameHashLiteralV1(Buffer.from(nativeProfile, 'hex')),
  activeScope: { manifest: commitmentLiteral(5), admission: commitmentLiteral(7) }, track: { kind: 'neon_tokyo', value: null }, epoch: 0,
  participants: keys.map((key, slot) => ({ slot, account: `nonspendable-eight-peer-fixture-${slot}`, inputKeyHex: hex(ed25519.getPublicKey(key)) })),
};
// This same function is sent to each page. Its argument is the next predicted
// simulation tick, never the number of capture callbacks while peers connect.
function scenarioControl(tick, slot, fullDuration) {
  if (fullDuration && tick >= 360) return 2;
  return 1 | (tick < 28 + slot * 3 ? 32 : 0) | (tick > 75 && tick < 100 ? (slot % 2 ? 4 : 8) | 16 : 0);
}
function treeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? treeFiles(path) : entry.isFile() ? [path] : [];
  });
}
// Both Node exports and Vite's browser entry points execute the SDK's built
// dist tree. Source hashes alone would miss a stale or replaced distribution.
const sdkEntries = Object.fromEntries(['race', 'game', 'connect-browser'].map(name => [
  `@iroha/iroha-js/${name}`, fileURLToPath(import.meta.resolve(`@iroha/iroha-js/${name}`)),
]));
const sdkRoot = dirname(dirname(sdkEntries['@iroha/iroha-js/race']));
const sdkPackagePath = resolve(sdkRoot, 'package.json');
const sdkPackage = JSON.parse(readFileSync(sdkPackagePath, 'utf8'));
const sdkResolution = {
  packagePath: sdkPackagePath, nodeEntries: sdkEntries,
  browserEntries: Object.fromEntries(['race', 'game', 'connect-browser'].map(name => {
    const entry = sdkPackage.exports[`./${name}`];
    assert.equal(sdkEntries[`@iroha/iroha-js/${name}`], resolve(sdkRoot, entry.import));
    return [`@iroha/iroha-js/${name}`, resolve(sdkRoot, entry.browser ?? entry.import)];
  })),
  browserReplacements: sdkPackage.browser ?? {},
};
const sourceFiles = () => [
  ...treeFiles(resolve(root, 'src')), ...treeFiles(resolve(sdkRoot, 'src')), ...treeFiles(resolve(sdkRoot, 'dist')),
  ...['scripts/test-mesh.mjs', 'scripts/lib/browser-launch.mjs', 'tests/mesh-harness.ts', 'tests/mesh-harness.html', 'package.json', 'package-lock.json', 'vite.config.ts'].map(path => resolve(root, path)),
  sdkPackagePath, ...Object.values(sdkEntries), ...Object.values(sdkResolution.browserEntries),
].sort();
const sourcePins = () => Object.fromEntries([...new Set(sourceFiles())].map(path => {
  const bytes = readFileSync(path); return [relative(root, path), { bytes: bytes.length, sha256: sha256(bytes) }];
}));
const sourcesBefore = sourcePins();
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Never overwrite evidence from an earlier attempt.
const writeJson = (name, value) => writeFile(resolve(output, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
await writeFile(resolve(output, 'stages.ndjson'), '', { flag: 'wx' });
await writeFile(resolve(output, 'runner-source.mjs'), readFileSync(fileURLToPath(import.meta.url)), { flag: 'wx' });
const report = {
  passed: false, startedAt: new Date().toISOString(), output, origin, headed, targetTick, fullDuration, nativeProfile, sdkResolution, sourcesBefore,
  launchRequested: { channel, options: launchOptions, platform: process.platform },
  launchDiagnostics: [], scenePreparation: { mode: 'sequential', observations: [] },
  scope: {
    accounts: 'Eight synthetic nonspendable labels with fixed Ed25519 test-only gameplay keys.',
    intendedBrowserContexts: 8, intendedWebRTCLinks: 28, nativeGeneratedPhysics: true, productionRenderer: true,
    ledgerRosterAuthenticated: false, nftOwnershipVerified: false, nativeProofVerified: false,
    nativeHostBindingQualified: false, nativeCodecParityQualified: false,
    inputDrivenPresentationControls: true, visualInspectionCompleted: false,
    finalizedLedgerInclusion: false, walletTransactionSubmitted: false, settlementVerified: false,
    coldSceneStartupPerformanceQualified: false,
    note: 'Scripted local browser transport/render test. Human participation, Internet latency and release qualification are separate.',
  },
  browserErrors: [], consoleMessages: [], httpFailures: [], protocolErrors: [], cleanupErrors: [],
  ownedBrowserClosure: 'not-created', checkpointsVerified: 0,
};
async function step(label, operation, timeout = 15_000) {
  await appendFile(resolve(output, 'stages.ndjson'), `${JSON.stringify({ at: new Date().toISOString(), label, phase: 'start', timeout })}\n`);
  let timer;
  try {
    const result = await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Observation deadline: ${label}`)), timeout);
    })]);
    await appendFile(resolve(output, 'stages.ndjson'), `${JSON.stringify({ at: new Date().toISOString(), label, phase: 'complete' })}\n`);
    return result;
  } catch (error) {
    await appendFile(resolve(output, 'stages.ndjson'), `${JSON.stringify({ at: new Date().toISOString(), label, phase: 'failed', error: String(error) })}\n`);
    throw error;
  } finally { clearTimeout(timer); }
}
function verifySignal(packet, from, to, type, sessionScope) {
  const signal = JSON.parse(packet);
  assert.equal(signal.v, 1); assert.equal(signal.scope, sessionScope);
  assert.equal(signal.from, from); assert.equal(signal.to, to); assert.equal(signal.description.type, type);
  const bytes = new TextEncoder().encode(JSON.stringify(['sora-cars/signal/v1', signal.v, signal.scope, signal.from, signal.to, signal.description.type, signal.description.sdp]));
  assert.ok(ed25519.verify(Buffer.from(signal.signature, 'hex'), bytes, ed25519.getPublicKey(keys[from]), { zip215: false }), 'manual signaling signature');
}
function verifyCheckpoint(certificate, tick) {
  const { checkpoint, signatures } = certificate;
  assert.equal(checkpoint.session_id, scope.raceId); assert.equal(String(checkpoint.epoch), String(scope.epoch));
  assert.equal(checkpoint.tick, tick);
  assert.deepEqual(signatures.map(signature => signature.slot), slots);
  const message = checkpointSigningFrame(scope.networkId, checkpoint);
  for (const { slot, signature } of signatures) assert.ok(ed25519.verify(Buffer.from(signature, 'hex'), message, ed25519.getPublicKey(keys[slot]), { zip215: false }), `checkpoint ${tick}, slot ${slot}`);
}
let browser, failure;
const contexts = [], pages = [], signals = [], readiness = [];
try {
  // This GameCheckpointV1 path uses the installed SDK's canonical JavaScript
  // codec and purpose-separated direct signature frame. It does not invoke the native host or
  // qualify Rust/browser parity. Guards on native APIs remain untouched.
  const checkpointFrame = checkpointSigningFrame(scope.networkId, { session_id: scope.raceId, scope: scope.activeScope, epoch: scope.epoch, tick: 0, transcript_root: commitmentLiteral(9), state_root: commitmentLiteral(11), terminal: false });
  assert.ok(checkpointFrame.length > 40);
  report.canonicalJsCodecPreflight = { status: 'passed', value: 'GameCheckpointV1', domain: 'checkpoint', nativeHostBindingExercised: false };
  // Do not race launch against an outer timeout: retain ownership of every
  // handle returned by Playwright, including its supported Chrome fallback.
  await writeJson('launch-requested.json', report.launchRequested);
  browser = await launchChromium(launchOptions);
  report.ownedBrowserClosure = 'pending'; report.chromiumVersion = browser.version();
  // executablePath() identifies the regular bundle, not necessarily the
  // headless shell or fallback Chrome process that was actually launched.
  // Keep the browser's own command line/GPU report without inferring that a
  // requested backend has been selected or that gameplay performance passed.
  const diagnosticsSession = await browser.newBrowserCDPSession();
  try {
    for (const [method, filename] of [
      ['Browser.getVersion', 'launch-browser-version.json'],
      ['Browser.getBrowserCommandLine', 'launch-command-line.json'],
      ['SystemInfo.getInfo', 'launch-system-info.json'],
      ['SystemInfo.getProcessInfo', 'launch-process-info.json'],
    ]) {
      const observation = { method, startedAt: new Date().toISOString() };
      let diagnosticFailure;
      try {
        observation.result = await step(`launch diagnostics: ${method}`, () => diagnosticsSession.send(method));
        observation.outcome = 'fulfilled';
      } catch (error) {
        diagnosticFailure = error; observation.outcome = 'rejected'; observation.error = String(error);
      }
      observation.finishedAt = new Date().toISOString();
      report.launchDiagnostics.push(observation);
      await writeJson(filename, observation);
      if (diagnosticFailure) throw diagnosticFailure;
    }
  } finally {
    await step('detach owned launch diagnostics session', () => diagnosticsSession.detach(), 5000)
      .catch(error => report.cleanupErrors.push(String(error)));
  }
  for (const slot of slots) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } }); contexts.push(context);
    context.setDefaultTimeout(15_000);
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => report.browserErrors.push({ slot, type: 'pageerror', message: error.message }));
    page.on('console', message => {
      const row = { slot, type: message.type(), message: message.text(), location: message.location() };
      report.consoleMessages.push(row); if (message.type() === 'error') report.browserErrors.push(row);
    });
    page.on('response', response => { if (response.status() >= 400) report.httpFailures.push({ slot, status: response.status(), url: response.url() }); });
    page.on('requestfailed', request => report.httpFailures.push({ slot, url: request.url(), failure: request.failure() }));
    await step(`slot ${slot}: navigate`, () => page.goto(`${endpoint.origin}/tests/mesh-harness.html`, { timeout: 15_000 }));
    await step(`slot ${slot}: initialize harness`, () => page.waitForFunction(() => typeof globalThis.makeRaceController === 'function', undefined, { timeout: 15_000 }), 17_000);
    await step(`slot ${slot}: construct idle controller`, () => page.evaluate(async ({ scope, slot, key, fullDuration, targetTick, controlSource }) => {
      const { CLUB_ITEMS } = await import('/src/game/catalog.ts');
      const { readSceneReadiness } = await import('/src/ui/scene-preparation.ts');
      const { stateRoot, checkpointTranscriptRoot } = await import('/src/chain/races.ts');
      const { simulateNativeReplay } = await import('/src/network/controller.ts');
      const { raceFinished } = await import('/src/game/engine.ts');
      const control = (0, eval)(`(${controlSource})`);
      const appearance = { skin: CLUB_ITEMS[slot % 6].sku, upgrade: slot % 2 ? 'club-aero-86' : 'club-neon-pulse' };
      Object.assign(globalThis, { raceErrors: [], protocolErrors: [], checkpoints: [], targetSnapshot: null, readSceneReadiness });
      const controller = globalThis.makeRaceController({ scope, slot, appearance, privateKey: Uint8Array.from(key), input: () => control(controller.predictedState.tick, slot, fullDuration), peerTimeoutMs: 60_000 });
      controller.onDispute = evidence => globalThis.raceErrors.push(evidence.reason);
      controller.onStatus = status => { if (status.reason.startsWith('Rejected peer packet:')) globalThis.protocolErrors.push(status); };
      const onTransportEvent = controller.transport.onEvent;
      controller.transport.onEvent = event => { if (event.type === 'error') globalThis.protocolErrors.push(event); onTransportEvent(event); };
      controller.onCheckpoint = checkpoint => {
        globalThis.checkpoints.push(checkpoint);
        if (checkpoint.checkpoint.tick === targetTick) {
          const replay = controller.exportNativeReplay(), result = controller.state, reconstructed = simulateNativeReplay(replay);
          globalThis.targetSnapshot = { checkpoint, replay, result, reconstructed, appearances: controller.appearances,
            replayRoot: checkpointTranscriptRoot(scope, replay), stateRoot: stateRoot(scope, reconstructed), terminal: raceFinished(reconstructed) };
        }
      };
      globalThis.controller = controller;
    }, { scope, slot, key: [...keys[slot]], fullDuration, targetTick, controlSource: scenarioControl.toString() }));
    // Prepare this real scene before creating the next one. Earlier scenes
    // remain live and keep rendering; only cold shader preparation is staged.
    const observation = { slot, startedAt: new Date().toISOString() };
    let preparationFailure;
    try {
      observation.result = await step(`slot ${slot}: prepare actual pixel-art scene`, async () => {
        await page.waitForFunction(() => globalThis.readSceneReadiness(document.querySelector('#mesh-race')).status !== 'loading', undefined, { polling: 100, timeout: 90_000 });
        return page.evaluate(async () => {
          for (let frame = 0; frame < 4; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
          const canvas = document.querySelector('#mesh-race');
          return { ...globalThis.readSceneReadiness(canvas), dataset: { ...canvas.dataset }, phase: globalThis.controller.status.phase, tick: globalThis.controller.state.tick, warmedFrames: 4, renderStats: globalThis.getMeshRenderStats() };
        });
      }, 95_000);
      observation.outcome = 'fulfilled';
    } catch (error) {
      preparationFailure = error; observation.outcome = 'rejected'; observation.error = String(error);
    }
    observation.finishedAt = new Date().toISOString();
    report.scenePreparation.observations.push(observation);
    // Retain each result before assertions/next slot, including errors; a
    // later scene timeout must not erase the earlier readiness evidence.
    await writeJson(`readiness-slot-${slot}.json`, observation);
    if (preparationFailure) throw preparationFailure;
    const ready = observation.result;
    readiness.push(ready);
    assert.equal(ready.status, 'ready'); assert.equal(ready.phase, 'idle'); assert.equal(ready.tick, 0);
    assert.equal(ready.dataset.renderStyle, 'pixel-art', 'exercise the current production pixel-art renderer');
  }
  assert.equal(readiness.length, 8);
  await writeJson('readiness.json', readiness);
  const sessionScopes = await Promise.all(pages.map(page => page.evaluate(() => globalThis.controller.session.scope)));
  assert.ok(sessionScopes.every(value => value === sessionScopes[0]));
  // Build and authenticate every edge before any input timer starts.
  for (let lower = 0; lower < 8; lower++) for (let higher = lower + 1; higher < 8; higher++) {
    const offer = await step(`link ${lower}-${higher}: signed offer`, () => pages[lower].evaluate(slot => globalThis.controller.createOffer(slot), higher), 20_000);
    verifySignal(offer, lower, higher, 'offer', sessionScopes[0]);
    const answer = await step(`link ${lower}-${higher}: signed answer`, () => pages[higher].evaluate(packet => globalThis.controller.acceptSignal(packet), offer), 20_000);
    assert.equal(typeof answer, 'string'); verifySignal(answer, higher, lower, 'answer', sessionScopes[0]);
    assert.equal(await step(`link ${lower}-${higher}: accept answer`, () => pages[lower].evaluate(packet => globalThis.controller.acceptSignal(packet), answer)), null);
    signals.push({ lower, higher, offer, answer });
  }
  await writeJson('signed-signals.json', signals);
  assert.equal(signals.length, 28);
  const beforeStart = await Promise.all(pages.map((page, slot) => step(`slot ${slot}: await seven live channels`, async () => {
    await page.waitForFunction(() => globalThis.controller.status.connectedSlots.length === 7 && globalThis.controller.appearances.every(a => a.skin && a.upgrade), undefined, { polling: 100, timeout: 20_000 });
    return page.evaluate(() => ({ status: globalThis.controller.status, appearances: globalThis.controller.appearances, checkpointCount: globalThis.checkpoints.length, replayFrames: globalThis.controller.exportNativeReplay().frames.length }));
  }, 22_000)));
  await writeJson('before-start.json', beforeStart);
  beforeStart.forEach((value, slot) => {
    assert.equal(value.status.phase, 'idle'); assert.equal(value.status.certifiedTick, 0); assert.equal(value.status.predictedTick, 0);
    assert.equal(value.checkpointCount, 0); assert.equal(value.replayFrames, 0);
    assert.deepEqual([...value.status.connectedSlots].sort((a, b) => a - b), slots.filter(other => other !== slot));
    assert.deepEqual(value.appearances, beforeStart[0].appearances);
  });
  await Promise.all(pages.map((page, slot) => step(`slot ${slot}: start prepared controller`, () => page.evaluate(() => globalThis.controller.start()))));
  await Promise.all(pages.map((page, slot) => step(`slot ${slot}: certify tick ${targetTick}`, () => page.waitForFunction(() => globalThis.targetSnapshot !== null || globalThis.raceErrors.length > 0 || globalThis.protocolErrors.length > 0, undefined, { polling: 100, timeout: timeoutMs }), timeoutMs + 2000)));
  const snapshots = await Promise.all(pages.map(page => page.evaluate(() => ({ ...globalThis.targetSnapshot, status: globalThis.controller.status, errors: globalThis.raceErrors, protocolErrors: globalThis.protocolErrors, checkpoints: globalThis.checkpoints.filter(cp => cp.checkpoint.tick <= globalThis.targetSnapshot?.result.tick) }))));
  await writeJson('snapshots.json', snapshots);
  for (const [slot, snapshot] of snapshots.entries()) {
    assert.deepEqual(snapshot.errors, []); assert.deepEqual(snapshot.protocolErrors, []);
    assert.deepEqual([...snapshot.status.connectedSlots].sort((a, b) => a - b), slots.filter(other => other !== slot));
    assert.equal(snapshot.result.tick, targetTick); assert.equal(snapshot.replay.player_count, 8);
    assert.deepEqual(snapshot.replay.dnf_events, []); assert.equal(snapshot.replay.frames.length, targetTick);
    assert.deepEqual(snapshot.checkpoint, snapshots[0].checkpoint); assert.deepEqual(snapshot.replay, snapshots[0].replay);
    assert.deepEqual(snapshot.result, snapshots[0].result); assert.deepEqual(snapshot.reconstructed, snapshot.result);
    assert.deepEqual(snapshot.appearances, beforeStart[0].appearances);
    assert.equal(snapshot.replayRoot, snapshot.checkpoint.checkpoint.transcript_root);
    assert.equal(snapshot.stateRoot, snapshot.checkpoint.checkpoint.state_root);
    assert.equal(snapshot.terminal, snapshot.checkpoint.checkpoint.terminal);
    assert.equal(snapshot.checkpoints.length, targetTick / 6 + 1);
    snapshot.checkpoints.forEach((certificate, index) => verifyCheckpoint(certificate, index * 6));
    report.checkpointsVerified += snapshot.checkpoints.length;
    assert.ok(snapshot.result.cars.every(car => !car.dnf), 'no browser-imposed forfeits');
    if (fullDuration) { assert.equal(snapshot.status.phase, 'finished'); assert.equal(snapshot.terminal, true); }
  }
  for (const [tick, frame] of snapshots[0].replay.frames.entries()) {
    assert.equal(frame.tick, tick);
    assert.deepEqual(frame.controls, slots.map(slot => scenarioControl(tick, slot, fullDuration)), `actual committed inputs at simulation tick ${tick}`);
  }
  // Capture the real animated scene before closing controllers. Short-prefix
  // screenshots may display a later tick; record that tick instead of claiming
  // the capture and the separately retained exact checkpoint are simultaneous.
  report.captures = [];
  for (const [slot, page] of pages.entries()) {
    const before = await page.evaluate(() => ({ status: globalThis.controller.status, state: globalThis.controller.state, predicted: globalThis.controller.predictedState, dataset: { ...document.querySelector('#mesh-race').dataset }, renderStats: globalThis.getMeshRenderStats() }));
    const filename = `driver-${slot + 1}.png`;
    await step(`slot ${slot}: actual gameplay screenshot`, () => page.screenshot({ path: resolve(output, filename), timeout: 15_000 }), 17_000);
    const after = await page.evaluate(() => ({ ...globalThis.controller.status, renderStats: globalThis.getMeshRenderStats() }));
    report.captures.push({ slot, filename, sha256: sha256(readFileSync(resolve(output, filename))), before, after });
  }
  const lateProtocol = await Promise.all(pages.map(page => page.evaluate(() => ({ errors: globalThis.raceErrors, protocolErrors: globalThis.protocolErrors }))));
  report.protocolErrors = lateProtocol;
  for (const value of lateProtocol) { assert.deepEqual(value.errors, []); assert.deepEqual(value.protocolErrors, []); }
  report.completed = { contexts: 8, webrtcLinks: 28, certifiedTick: targetTick, eightSignaturesPerCheckpoint: true, identicalReconstructedState: true, authenticatedCosmeticChoices: true, identicalTerminalState: fullDuration, verifiedInputScenario: fullDuration ? 'Simulation-tick boost and drift, then braking from tick 360 through the exact 5400-tick limit.' : 'Simulation-tick throttle, boost and drift through a certified prefix.' };
} catch (error) {
  failure = error; report.error = { message: error.message, code: error.code, stack: error.stack };
  report.failureSnapshots = await Promise.all(pages.map((page, slot) => step(`slot ${slot}: failure snapshot`, () => page.evaluate(() => ({ status: globalThis.controller?.status, errors: globalThis.raceErrors, protocolErrors: globalThis.protocolErrors, dataset: { ...document.querySelector('#mesh-race')?.dataset }, renderStats: globalThis.getMeshRenderStats?.() })), 5000).then(state => ({ slot, state }), error => ({ slot, error: String(error) }))));
} finally {
  // Normal lifecycle calls only; an observation timeout never proves exit.
  for (const [slot, page] of pages.entries()) await step(`slot ${slot}: stop owned controller`, () => page.evaluate(() => globalThis.controller?.stop()), 5000).catch(error => report.cleanupErrors.push(String(error)));
  for (const [slot, context] of contexts.entries()) await step(`slot ${slot}: close owned context`, () => context.close(), 5000).catch(error => report.cleanupErrors.push(String(error)));
  if (browser) {
    try { await step('close owned browser', () => browser.close(), 15_000); report.ownedBrowserClosure = 'playwright-close-completed'; }
    catch (error) { report.cleanupErrors.push(String(error)); report.ownedBrowserClosure = 'closure-unconfirmed'; }
  }
  try { report.sourcesAfter = sourcePins(); assert.deepEqual(report.sourcesAfter, sourcesBefore, 'sources changed during browser evidence capture'); }
  catch (error) { report.sourceError = String(error); failure ??= error; }
  report.passed = !failure && Boolean(report.completed) && !report.browserErrors.length && !report.httpFailures.length && !report.cleanupErrors.length;
  report.finishedAt = new Date().toISOString();
  await writeJson('console.json', { errors: report.browserErrors, messages: report.consoleMessages, httpFailures: report.httpFailures, cleanupErrors: report.cleanupErrors });
  await writeJson('report.json', report);
  console.log(JSON.stringify({ passed: report.passed, output, completed: report.completed, error: report.error, browserErrors: report.browserErrors.length, httpFailures: report.httpFailures.length, cleanupErrors: report.cleanupErrors.length }, null, 2));
}
if (failure) throw failure;
if (!report.passed) throw new Error('Eight-client qualification failed; inspect the retained report and console evidence.');
