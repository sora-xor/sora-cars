import { checkpointSigningFrame, frontierSigningFrame, inputDigest, inputSigningFrame } from '../src/chain/certificates.ts';
const commitmentLiteral = value => 'game384:' + value.toString(16).padStart(2, '0').toUpperCase().repeat(48);
const certificateFrame = (network, kind, body) => { if (kind === 'checkpoint') return checkpointSigningFrame(network, body); if (kind === 'commitment-set') return frontierSigningFrame(network, body); throw new Error('Unknown signed certificate purpose'); };
// Targeted app-only recovery regression. Synthetic account labels do not qualify
// a ledger roster, a native instruction codec, or native consensus execution.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './lib/browser-launch.mjs';
import { ed25519 } from '@noble/curves/ed25519';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { gameHashLiteralV1 } from '@iroha/iroha-js/game';
import { raceHashLiteralV1 } from '@iroha/iroha-js/race';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = process.env.SORA_CARS_TEST_ORIGIN ?? 'http://127.0.0.1:5173';
const headed = process.env.SORA_CARS_TEST_HEADED === '1';
const output = resolve(root, process.env.SORA_CARS_TEST_OUTPUT ?? 'output/browser/frontier-recovery-2026-09-22/targeted');
const sourceFiles = [
  'scripts/test-frontier-recovery.mjs', 'scripts/lib/browser-launch.mjs', 'src/chain/certificates.ts', 'src/chain/history.ts', 'src/network/controller.ts', 'src/network/session.ts',
  'src/network/mesh.ts', 'src/network/replay.ts', 'src/chain/races.ts',
  'src/game/generated/race-v1-kernels.json', 'src/ui/scene-preparation.ts', 'tests/mesh-harness.html', 'tests/mesh-harness.ts',
];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const sourcePins = () => Object.fromEntries(sourceFiles.map(path => [path, sha256(readFileSync(resolve(root, path)))]));
const sourcesBefore = sourcePins();
const nativeProfile = JSON.parse(readFileSync(resolve(root, 'src/game/generated/race-v1-kernels.json'), 'utf8')).profile_id;
const keys = [61, 62].map(value => new Uint8Array(32).fill(value));
const hex = value => Buffer.from(value).toString('hex');
const networkId = NetworkId.fromBytes(new Uint8Array(32).fill(3)).toString();
const hash = value => raceHashLiteralV1(new Uint8Array(32).fill(value));
const makeScope = scenario => ({
  networkId, raceId: hash(scenario === 'conflicting-frontier' ? 71 : 73),
  profileId: gameHashLiteralV1(Buffer.from(nativeProfile, 'hex')), activeScope: { manifest: commitmentLiteral(75), admission: commitmentLiteral(77) },
  track: { kind: 'neon_tokyo', value: null }, epoch: 0,
  participants: keys.map((key, slot) => ({
    slot, account: `nonspendable-frontier-browser-fixture-${slot}`, inputKeyHex: hex(ed25519.getPublicKey(key)),
  })),
});
// The SDK's typed JSON decoder renders u64 epochs as canonical decimal strings.
const canonicalEpoch = ({ epoch, ...body }) => ({ epoch: String(epoch), ...body });
const verify = (domain, body, signatures) => {
  assert.deepEqual(signatures.map(signature => signature.slot), [0, 1]);
  const message = certificateFrame(networkId, domain, body);
  for (const signature of signatures) assert.ok(ed25519.verify(
    Buffer.from(signature.signature, 'hex'), message, ed25519.getPublicKey(keys[signature.slot]), { zip215: false },
  ), `${domain}: slot ${signature.slot} signature must validate over the exact exported body`);
};
const writeJson = (name, value) => writeFile(resolve(output, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
// mkdir without recursive on the leaf deliberately refuses an existing run.
await mkdir(resolve(output, '..'), { recursive: true });
await mkdir(output);
await writeFile(resolve(output, 'stages.ndjson'), '', { flag: 'wx' });
async function step(label, operation, timeoutMs = 15_000) {
  await appendFile(resolve(output, 'stages.ndjson'), `${JSON.stringify({ at: new Date().toISOString(), label, phase: 'start', timeoutMs })}\n`);
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Observation deadline: ${label}`)), timeoutMs); }),
    ]);
    await appendFile(resolve(output, 'stages.ndjson'), `${JSON.stringify({ at: new Date().toISOString(), label, phase: 'complete' })}\n`);
    return result;
  } catch (error) {
    await appendFile(resolve(output, 'stages.ndjson'), `${JSON.stringify({ at: new Date().toISOString(), label, phase: 'failed', error: String(error) })}\n`);
    throw error;
  } finally { clearTimeout(timer); }
}
const startedAt = new Date().toISOString();
const report = {
  passed: false, startedAt, origin, output, headed, nativeProfile, sourcesBefore,
  scope: {
    actualChromium: true, actualWebRTC: true, manualSignedSignaling: true,
    inputKeys: 'Two fixed Ed25519 test-only keys; no custody or wallet keys.',
    accounts: 'Explicit synthetic nonspendable labels; no authenticated ledger roster.',
    nativeInstructionJsonShapeAndRetainedFields: 'An assertion in each completed scenario; not claimed for a failed or pending scenario.',
    nativeCodecRoundtrip: false, nativeConsensusExecution: false, proofVerification: false,
    ledgerRosterAuthenticated: false, walletTransactionSubmitted: false, finalizedLedgerInclusion: false,
    existingDisputeMeshTestUnchanged: true, existingViteServerReused: true,
    note: 'Two focused browser recovery cases only. This does not replace the broader native-codec dispute mesh qualification.',
  },
  scenarios: [], browserErrors: [], consoleMessages: [], httpFailures: [], cleanupErrors: [],
  ownedBrowserClosure: 'not-created',
};
let browser;
let failure;
try {
  // Use Playwright's own launch timeout so a late browser handle is never
  // discarded by an outer Promise.race. Once returned, this runner owns it.
  await appendFile(resolve(output, 'stages.ndjson'), `${JSON.stringify({ at: new Date().toISOString(), label: 'launch Chromium', phase: 'start', timeoutMs: 20_000 })}\n`);
  try {
    browser = await launchChromium({ headless: !headed, timeout: 20_000, ...(process.env.SORA_CARS_TEST_CHANNEL === 'chrome' ? { channel: 'chrome', args: ['--use-angle=metal'] } : {}) });
    report.ownedBrowserClosure = 'pending';
    await appendFile(resolve(output, 'stages.ndjson'), `${JSON.stringify({ at: new Date().toISOString(), label: 'launch Chromium', phase: 'complete' })}\n`);
  } catch (error) {
    report.ownedBrowserClosure = 'no-browser-handle-returned';
    await appendFile(resolve(output, 'stages.ndjson'), `${JSON.stringify({ at: new Date().toISOString(), label: 'launch Chromium', phase: 'failed', error: String(error) })}\n`);
    throw error;
  }
  report.chromiumVersion = browser.version();
  for (const scenario of ['conflicting-frontier', 'withheld-checkpoint']) {
    const scope = makeScope(scenario), contexts = [], pages = [], injected = [];
    try {
      for (let slot = 0; slot < 2; slot++) {
        const context = await step(`${scenario} slot ${slot}: create context`, () => browser.newContext({ viewport: { width: 1280, height: 800 } }));
        context.setDefaultTimeout(15_000);
        contexts.push(context);
        const page = await step(`${scenario} slot ${slot}: create page`, () => context.newPage()); pages.push(page);
        page.on('pageerror', error => report.browserErrors.push({ scenario, slot, type: 'pageerror', message: error.message }));
        page.on('console', message => {
          const row = { scenario, slot, type: message.type(), message: message.text(), location: message.location() };
          report.consoleMessages.push(row);
          if (message.type() === 'error') report.browserErrors.push(row);
        });
        page.on('response', response => {
          if (response.status() >= 400) report.httpFailures.push({ scenario, slot, status: response.status(), url: response.url() });
        });
        page.on('requestfailed', request => report.httpFailures.push({ scenario, slot, url: request.url(), failure: request.failure() }));
        if (slot === 1 && scenario === 'conflicting-frontier') {
          await page.exposeFunction('resignConflictingFrontier', packet => {
            assert.equal(packet.slot, 1); assert.equal(packet.kind, 'frontier'); assert.equal(packet.round, 0);
            assert.equal(packet.body[0].session_id, scope.raceId);
            const body = { ...packet.body[0], parent_transcript_root: commitmentLiteral(29) };
            assert.notEqual(body.parent_transcript_root, packet.body[0].parent_transcript_root);
            const forged = { ...packet, body: [body], signature: hex(ed25519.sign(frontierSigningFrame(networkId, body), keys[1])) };
            assert.ok(ed25519.verify(Buffer.from(forged.signature, 'hex'), frontierSigningFrame(networkId, body), ed25519.getPublicKey(keys[1]), { zip215: false }));
            injected.push({ original: packet, transmitted: forged });
            return forged;
          });
        }
        await step(`${scenario} slot ${slot}: navigate harness`, () => page.goto(`${origin}/tests/mesh-harness.html`, { timeout: 15_000 }));
        await step(`${scenario} slot ${slot}: wait harness initialization`, () => page.waitForFunction(() => typeof globalThis.makeRaceController === 'function', undefined, { polling: 100, timeout: 15_000 }), 17_000);
        await step(`${scenario} slot ${slot}: initialize controller`, () => page.evaluate(({ scope, slot, key, scenario }) => {
          const controller = globalThis.makeRaceController({
            scope, slot, privateKey: Uint8Array.from(key), input: () => slot === 0 ? 9 : 5, peerTimeoutMs: 5000,
          });
          Object.assign(globalThis, { controller, dispute: null, withheld: [], sent: [], checkpoints: [], stateEvents: [], timeline: [], faultErrors: [] });
          controller.onStatus = status => globalThis.timeline.push({ at: performance.now(), ...status });
          controller.onDispute = evidence => { globalThis.dispute = evidence; };
          controller.onCheckpoint = checkpoint => globalThis.checkpoints.push(checkpoint);
          controller.onState = (state, predicted) => globalThis.stateEvents.push({ at: performance.now(), certifiedTick: state.tick, predictedTick: predicted.tick });
          const broadcast = controller.transport.broadcast.bind(controller.transport);
          const send = packet => { globalThis.sent.push(structuredClone(packet)); broadcast(packet); };
          let sendTail = Promise.resolve();
          controller.transport.broadcast = packet => {
            if (slot === 1 && scenario === 'withheld-checkpoint' && packet.kind === 'checkpoint' && packet.round === 2) {
              globalThis.withheld.push(structuredClone(packet)); return;
            }
            if (slot === 1 && scenario === 'conflicting-frontier') {
              // Only this adversarial sender changes its own signed packet. The
              // actual RaceMesh/WebRTC receiver and honest protocol stay intact.
              sendTail = sendTail.then(async () => send(packet.kind === 'frontier' && packet.round === 0
                ? await globalThis.resignConflictingFrontier(packet) : packet))
                .catch(error => { globalThis.faultErrors.push(String(error)); });
            } else send(packet);
          };
        }, { scope, slot, key: [...keys[slot]], scenario }));
      }
      // Prepare the actual scene while controllers are idle. Cold asset/shader
      // work must not masquerade as a peer withholding its first input batch.
      const readiness = await Promise.all(pages.map(async (page, slot) => {
        await step(`${scenario} slot ${slot}: import scene readiness`, () => page.evaluate(async () => {
          globalThis.readSceneReadiness = (await import('/src/ui/scene-preparation.ts')).readSceneReadiness;
        }));
        await step(`${scenario} slot ${slot}: await detailed scene`, () => page.waitForFunction(() =>
          globalThis.readSceneReadiness(document.querySelector('#mesh-race')).status !== 'loading',
        undefined, { polling: 100, timeout: 30_000 }), 32_000);
        const ready = await step(`${scenario} slot ${slot}: read detailed scene`, () => page.evaluate(() => ({
          ...globalThis.readSceneReadiness(document.querySelector('#mesh-race')),
          dataset: { ...document.querySelector('#mesh-race').dataset }, controllerPhase: globalThis.controller.status.phase,
        })));
        assert.equal(ready.status, 'ready'); assert.equal(ready.controllerPhase, 'idle');
        await step(`${scenario} slot ${slot}: warm actual render frames`, () => page.evaluate(async () => {
          for (let frame = 0; frame < 4; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
        }), 10_000);
        return ready;
      }));
      await writeJson(`${scenario}-readiness.json`, readiness);
      await Promise.all(pages.map((page, slot) => step(`${scenario} slot ${slot}: start prepared controller`,
        () => page.evaluate(() => globalThis.controller.start()))));
      const offer = await step(`${scenario}: create signed offer`, () => pages[0].evaluate(() => globalThis.controller.createOffer(1)), 20_000);
      const answer = await step(`${scenario}: accept offer and create answer`, () => pages[1].evaluate(packet => globalThis.controller.acceptSignal(packet), offer), 20_000);
      assert.equal(typeof answer, 'string');
      await step(`${scenario}: accept signed answer`, () => pages[0].evaluate(packet => globalThis.controller.acceptSignal(packet), answer));
      await step(`${scenario}: honest dispute`, () => pages[0].waitForFunction(() => Boolean(globalThis.controller && globalThis.dispute && globalThis.controller.status.phase === 'disputed'), undefined, { polling: 100, timeout: 30_000 }), 32_000);
      if (scenario === 'withheld-checkpoint') await step(`${scenario}: withholder dispute`, () => pages[1].waitForFunction(() => Boolean(globalThis.controller && globalThis.dispute && globalThis.controller.status.phase === 'disputed'), undefined, { polling: 100, timeout: 30_000 }), 32_000);
      const snapshots = await step(`${scenario}: capture protocol state`, () => Promise.all(pages.map(page => page.evaluate(() => ({
        status: globalThis.controller.status, state: globalThis.controller.state, predicted: globalThis.controller.predictedState,
        checkpoint: globalThis.controller.checkpoint, evidence: globalThis.dispute, replay: globalThis.controller.exportNativeReplay(),
        sent: globalThis.sent, withheld: globalThis.withheld, checkpoints: globalThis.checkpoints,
        stateEvents: globalThis.stateEvents, timeline: globalThis.timeline, faultErrors: globalThis.faultErrors,
      })))));
      // Save evidence before assertions so a failing run remains reviewable.
      await writeJson(`${scenario}-evidence.json`, { scope, snapshots, injected });
      for (let slot = 0; slot < pages.length; slot++) {
        await step(`${scenario} slot ${slot}: wait render frames`, () => pages[slot].evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))), 5_000);
        await step(`${scenario} slot ${slot}: screenshot`, () => pages[slot].screenshot({ path: resolve(output, `${scenario}-slot-${slot}.png`), timeout: 10_000 }), 12_000);
      }
      const honest = snapshots[0], { evidence } = honest;
      for (const snapshot of snapshots) assert.deepEqual(snapshot.faultErrors, []);
      if (scenario === 'conflicting-frontier') {
        assert.equal(injected.length, 1, 'one validly re-signed conflicting frontier was sent');
        assert.match(evidence.reason, /different commitment frontiers/);
      }
      assert.equal(honest.status.phase, 'disputed');
      assert.deepEqual(honest.status.connectedSlots, [1], 'the dispute occurs with a live WebRTC connection');
      assert.deepEqual(honest.predicted, honest.state, 'honest prediction must roll back to its certified checkpoint');
      assert.ok(honest.stateEvents.some(row => row.predictedTick > honest.state.tick), 'prediction actually advanced beyond the rollback point');
      assert.ok(honest.state.cars.every(car => !car.dnf), 'the browser must not impose a forfeit');
      assert.deepEqual(evidence.checkpoint, honest.checkpoint);
      verify('checkpoint', evidence.checkpoint.checkpoint, evidence.checkpoint.signatures);
      assert.deepEqual(evidence.instructions.map(instruction => Object.keys(instruction)[0]), ['ChallengeGameSessionV1', 'CommitGameCheckpointV1']);
      const recovery = evidence.instructions[1].CommitGameCheckpointV1;
      assert.equal(recovery.session_id, scope.raceId);
      assert.deepEqual(recovery.checkpoint, { checkpoint: canonicalEpoch(evidence.checkpoint.checkpoint), signatures: evidence.checkpoint.signatures });
      let reconstructed;
      if (scenario === 'conflicting-frontier') {
        assert.equal(honest.state.tick, 0); assert.equal(honest.replay.frames.length, 0);
        assert.deepEqual(evidence.checkpoint, honest.checkpoints[0], 'the all-party genesis checkpoint remains recoverable');
        assert.equal(evidence.frontier, null); assert.equal(recovery.frontier, null);
        assert.equal(evidence.revealedInput, null, 'honest controls remain undisclosed after conflicting frontier signatures');
        assert.equal(honest.sent.filter(packet => packet.kind === 'reveal').length, 0);
        assert.ok(evidence.signedPackets.some(packet => packet.slot === 1 && packet.signature === injected[0].transmitted.signature));
      } else {
        assert.equal(injected.length, 0);
        assert.equal(snapshots[1].withheld.length, 1); assert.equal(snapshots[1].withheld[0].round, 2);
        assert.equal(honest.state.tick, 12); assert.equal(honest.replay.frames.length, 12);
        assert.equal(snapshots[1].state.tick, 18, 'withholder privately obtained the next all-party checkpoint');
        assert.match(evidence.reason, /did not complete the signed frontier/);
        const { signatures, ...body } = evidence.frontier;
        verify('commitment-set', body, signatures);
        assert.equal(body.start_tick, 12);
        assert.equal(body.parent_transcript_root, evidence.checkpoint.checkpoint.transcript_root);
        assert.deepEqual(recovery.frontier, canonicalEpoch(evidence.frontier), 'generic native JSON recovery carries the entire valid signed frontier');
        assert.equal(evidence.commitments.length, 2); assert.equal(evidence.revealedInputs.length, 2);
        assert.deepEqual(evidence.revealedInputs.map(reveal => reveal.slot), [0, 1]);
        assert.deepEqual(evidence.revealedInput, evidence.revealedInputs[0]);
        for (const reveal of evidence.revealedInputs) {
          const { signature, ...commitment } = evidence.commitments[reveal.slot];
          assert.equal(reveal.start_tick, 12); assert.equal(reveal.payload.length, 12);
          assert.equal(commitment.commitment, body.commitments[reveal.slot]);
          assert.equal(inputDigest(networkId, reveal), commitment.commitment);
          assert.ok(ed25519.verify(Buffer.from(signature, 'hex'), inputSigningFrame(networkId, commitment), ed25519.getPublicKey(keys[reveal.slot]), { zip215: false }));
        }
        reconstructed = await step(`${scenario}: reconstruct retained inputs`, () => pages[0].evaluate(async ({ replay, reveals }) => {
          const { simulateNativeReplay } = await import('/src/network/controller.ts');
          const { stepRace, copyRace } = await import('/src/game/engine.ts');
          const state = simulateNativeReplay(replay), before = copyRace(state);
          for (let tick = 0; tick < 6; tick++) stepRace(state, reveals.map(reveal => reveal.payload[tick * 2] | reveal.payload[tick * 2 + 1] << 8));
          return { before, state };
        }, { replay: honest.replay, reveals: evidence.revealedInputs }));
        assert.deepEqual(reconstructed.before, honest.state);
        assert.deepEqual(reconstructed.state, snapshots[1].state, 'retained public controls reconstruct the privately certified next state');
        await writeJson(`${scenario}-reconstruction.json`, reconstructed);
      }
      assert.deepEqual(report.browserErrors.filter(error => error.scenario === scenario), []);
      assert.deepEqual(report.httpFailures.filter(error => error.scenario === scenario), []);
      report.scenarios.push({
        scenario, passed: true, contexts: 2, genuineWebRTCLinks: 1,
        offerSha256: sha256(offer), answerSha256: sha256(answer), honestCertifiedTick: honest.state.tick,
        maximumPredictedTick: Math.max(...honest.stateEvents.map(row => row.predictedTick)),
        predictionRolledBack: true, browserImposedForfeits: 0,
        exportedFrontier: evidence.frontier === null ? null : { startTick: evidence.frontier.start_tick, signatureCount: evidence.frontier.signatures.length },
        retainedRevealCount: evidence.revealedInputs.length,
        checkpointSignaturesValidated: true, nativeInstructionJsonPreservesEvidence: true,
        preparedDetailedScenes: readiness.length, coldSceneStartupPerformanceQualified: false,
        reconstructionMatchesWithholder: Boolean(reconstructed),
        evidenceFile: `${scenario}-evidence.json`, screenshots: [0, 1].map(slot => `${scenario}-slot-${slot}.png`),
      });
    } catch (error) {
      const diagnostics = [];
      for (const [slot, page] of pages.entries()) {
        let snapshot, snapshotError, screenshotError;
        try { snapshot = await step(`${scenario} slot ${slot}: failure state`, () => page.evaluate(() => ({ url: location.href, readyState: document.readyState, harnessReady: typeof globalThis.makeRaceController === 'function', status: globalThis.controller?.status ?? null, dispute: globalThis.dispute ?? null, faultErrors: globalThis.faultErrors ?? null })), 5_000); }
        catch (failure) { snapshotError = String(failure); }
        try { await step(`${scenario} slot ${slot}: failure screenshot`, () => page.screenshot({ path: resolve(output, `${scenario}-failure-slot-${slot}.png`), timeout: 5_000 }), 7_000); }
        catch (failure) { screenshotError = String(failure); }
        diagnostics.push({ slot, snapshot, snapshotError, screenshotError });
      }
      await writeJson(`${scenario}-failure.json`, { error: String(error), diagnostics });
      throw error;
    } finally {
      for (const [slot, page] of pages.entries()) await step(`${scenario} slot ${slot}: stop owned controller`, () => page.evaluate(() => globalThis.controller?.stop()), 5_000).catch(error => report.cleanupErrors.push(String(error)));
      for (const [slot, context] of contexts.entries()) await step(`${scenario} slot ${slot}: close owned context`, () => context.close(), 5_000).catch(error => report.cleanupErrors.push(String(error)));
    }
  }
  report.sourcesAfter = sourcePins();
  assert.deepEqual(report.sourcesAfter, sourcesBefore, 'reviewed protocol sources must not change during this run');
  assert.deepEqual(report.browserErrors, []); assert.deepEqual(report.httpFailures, []); assert.deepEqual(report.cleanupErrors, []);
  report.passed = true;
} catch (error) {
  failure = error;
  report.error = { message: error.message, stack: error.stack };
} finally {
  if (browser) {
    try {
      // All owned contexts/controllers have already been closed above. Chrome's
      // GPU/process shutdown can outlast the old 10-second observation window
      // under native-build load. Await its real close completion for at most
      // 60 seconds; expiration still fails the qualification and never kills
      // unrelated browser processes or reports an unconfirmed close as success.
      const closeStarted = performance.now();
      await step('close owned Chromium through Playwright', () => browser.close(), 60_000);
      report.browserCloseElapsedMs = performance.now() - closeStarted;
      assert.equal(browser.isConnected(), false, 'owned browser transport must be disconnected after close');
      report.ownedBrowserClosure = 'playwright-close-completed';
    } catch (error) {
      report.cleanupErrors.push(String(error));
      report.ownedBrowserClosure = 'closure-unconfirmed';
      // An observation deadline neither signals a process nor confirms its exit.
    }
  }
  if (report.cleanupErrors.length) report.passed = false;
  report.finishedAt = new Date().toISOString();
  await writeJson('report.json', report);
  await writeJson('console.json', { errors: report.browserErrors, messages: report.consoleMessages, httpFailures: report.httpFailures, cleanupErrors: report.cleanupErrors });
  console.log(JSON.stringify({ passed: report.passed, output, scenarios: report.scenarios, error: report.error, browserErrors: report.browserErrors.length }, null, 2));
}
if (failure) throw failure;
if (!report.passed) throw new Error('Browser cleanup failed; inspect report.json.');
