import { checkpointSigningFrame, frontierSigningFrame, inputDigest, inputSigningFrame } from '../src/chain/certificates.ts';
const commitmentLiteral = value => 'game384:' + value.toString(16).padStart(2, '0').toUpperCase().repeat(48);
const certificateFrame = (network, kind, body) => { if (kind === 'checkpoint') return checkpointSigningFrame(network, body); if (kind === 'commitment-set') return frontierSigningFrame(network, body); throw new Error('Unknown signed certificate purpose'); };
import { readFileSync } from 'node:fs';
import { gameHashLiteralV1 } from '@iroha/iroha-js/game';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ed25519 } from '@noble/curves/ed25519';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { AccountAddress } from '@iroha/iroha-js';
import { raceHashLiteralV1 } from '@iroha/iroha-js/race';
import { noritoEncodeInstructionBoxArchive, noritoDecodeInstructionBoxArchive } from '@iroha/iroha-js/norito';

const nativeProfile = JSON.parse(readFileSync(new URL('../src/game/generated/race-v1-kernels.json', import.meta.url), 'utf8')).profile_id;
const profileId = gameHashLiteralV1(Buffer.from(nativeProfile, 'hex'));
const origin = process.env.SORA_CARS_TEST_ORIGIN ?? 'http://127.0.0.1:5173';
const output = process.env.SORA_CARS_TEST_OUTPUT ?? 'output/browser/withheld-collision';
const reportPath = process.env.SORA_CARS_TEST_REPORT ?? 'artifacts/mesh-withheld-collision.json';
const keys = Array.from({ length: 4 }, (_, slot) => new Uint8Array(32).fill(slot + 41));
const scope = {
  networkId: NetworkId.fromBytes(new Uint8Array(32).fill(3)).toString(),
  raceId: raceHashLiteralV1(new Uint8Array(32).fill(51)),
  profileId, activeScope: { manifest: commitmentLiteral(53), admission: commitmentLiteral(55) },
  track: { kind: 'neon_tokyo', value: null }, epoch: 0,
  participants: keys.map((key, slot) => {
    const publicKey = ed25519.getPublicKey(key);
    return { slot, account: AccountAddress.fromAccount({ algorithm: 'ed25519', publicKey }).toI105(), inputKeyHex: Buffer.from(publicKey).toString('hex') };
  }),
};
const verify = (domain, body, signatures) => {
  const bytes = certificateFrame(scope.networkId, domain, body);
  assert.deepEqual(signatures.map(signature => signature.slot), [0, 1, 2, 3]);
  for (const signature of signatures) assert.ok(ed25519.verify(Buffer.from(signature.signature, 'hex'), bytes, ed25519.getPublicKey(keys[signature.slot]), { zip215: false }));
};
const browser = await chromium.launch({ headless: true });
const pages = [], errors = [];
try {
  for (let slot = 0; slot < 4; slot++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push(`${slot}: ${error.message}`));
    await page.goto(`${origin}/tests/mesh-harness.html`);
    await page.waitForFunction(() => typeof globalThis.makeRaceController === 'function');
    await page.evaluate(({ scope, slot, key }) => {
      const controller = globalThis.makeRaceController({ scope, slot, privateKey: Uint8Array.from(key), input: () => slot % 2 ? 5 : 9, peerTimeoutMs: 5000 });
      globalThis.controller = controller; globalThis.dispute = null; globalThis.withheld = [];
      controller.onDispute = evidence => { globalThis.dispute = evidence; };
      const broadcast = controller.transport.broadcast.bind(controller.transport);
      controller.transport.broadcast = packet => {
        // Fault injection is in this test participant's send path. All other
        // packets and every honest participant use genuine WebRTC delivery.
        if (slot === 0 && packet.kind === 'checkpoint' && packet.round === 2) { globalThis.withheld.push(packet); return; }
        broadcast(packet);
      };
      controller.start();
    }, { scope, slot, key: Array.from(keys[slot]) });
  }
  for (let lower = 0; lower < 4; lower++) for (let higher = lower + 1; higher < 4; higher++) {
    const offer = await pages[lower].evaluate(slot => globalThis.controller.createOffer(slot), higher);
    const answer = await pages[higher].evaluate(packet => globalThis.controller.acceptSignal(packet), offer);
    assert.equal(typeof answer, 'string');
    await pages[lower].evaluate(packet => globalThis.controller.acceptSignal(packet), answer);
  }
  await Promise.all(pages.map(page => page.waitForFunction(() => globalThis.dispute !== null, undefined, { timeout: 45_000 })));
  const snapshots = await Promise.all(pages.map(page => page.evaluate(() => ({
    status: globalThis.controller.status, state: globalThis.controller.state,
    predicted: globalThis.controller.predictedState, evidence: globalThis.dispute,
    replay: globalThis.controller.exportNativeReplay(), withheld: globalThis.withheld,
  }))));
  assert.deepEqual(errors, []);
  assert.equal(snapshots[0].withheld.length, 1, 'fault was actually exercised');
  assert.equal(snapshots[0].withheld[0].round, 2);
  assert.equal(snapshots[0].state.tick, 18, 'withholder privately received the complete next certificate');
  const honest = snapshots.slice(1);
  for (const snapshot of honest) {
    const { evidence } = snapshot;
    assert.equal(snapshot.status.phase, 'disputed');
    assert.equal(snapshot.status.connectedSlots.length, 3, 'withholding is detected even with live connections');
    assert.equal(snapshot.state.tick, 12);
    assert.deepEqual(snapshot.predicted, snapshot.state, 'prediction rolls back but accepted evidence remains');
    assert.ok(snapshot.state.cars.every(car => !car.dnf), 'a browser never imposes a forfeit');
    assert.equal(evidence.checkpoint.checkpoint.tick, 12);
    verify('checkpoint', evidence.checkpoint.checkpoint, evidence.checkpoint.signatures);
    assert.equal(evidence.frontier.start_tick, 12);
    assert.equal(evidence.frontier.parent_transcript_root, evidence.checkpoint.checkpoint.transcript_root);
    const { signatures, ...body } = evidence.frontier;
    verify('commitment-set', body, signatures);
    assert.deepEqual(evidence.frontier, honest[0].evidence.frontier);
    assert.deepEqual(evidence.revealedInputs, honest[0].evidence.revealedInputs);
    assert.equal(evidence.commitments.length, 4); assert.equal(evidence.revealedInputs.length, 4);
    for (const reveal of evidence.revealedInputs) {
      const commitment = evidence.commitments[reveal.slot];
      const { signature, ...commitmentBody } = commitment;
      assert.equal(commitment.commitment, evidence.frontier.commitments[reveal.slot]);
      assert.equal(inputDigest(scope.networkId, reveal), commitment.commitment);
      assert.ok(ed25519.verify(Buffer.from(signature, 'hex'), inputSigningFrame(scope.networkId, commitmentBody), ed25519.getPublicKey(keys[reveal.slot]), { zip215: false }));
    }
    assert.deepEqual(evidence.instructions.map(instruction => Object.keys(instruction)[0]), ['ChallengeGameSessionV1', 'CommitGameCheckpointV1']);
    for (const instruction of evidence.instructions) assert.deepEqual(noritoDecodeInstructionBoxArchive(noritoEncodeInstructionBoxArchive(instruction)), instruction);
  }
  const reconstructed = await pages[1].evaluate(async ({ replay, reveals }) => {
    const { simulateNativeReplay } = await import('/src/network/controller.ts');
    const { stepRace, copyRace } = await import('/src/game/engine.ts');
    const state = simulateNativeReplay(replay), before = copyRace(state);
    const losses = [];
    for (let tick = 0; tick < 6; tick++) {
      const speeds = state.cars.map(car => car.speed);
      stepRace(state, reveals.map(reveal => reveal.payload[tick * 2] | reveal.payload[tick * 2 + 1] << 8));
      if (state.cars.some((car, slot) => car.speed < speeds[slot])) losses.push(state.tick);
    }
    return { before, state, collisionSlowdownTicks: losses };
  }, { replay: honest[0].replay, reveals: honest[0].evidence.revealedInputs });
  assert.deepEqual(reconstructed.state, snapshots[0].state, 'public accepted controls reconstruct the hidden collision result');
  assert.ok(reconstructed.collisionSlowdownTicks.length > 0, 'inward throttle inputs actually caused collision speed loss');
  assert.ok(reconstructed.state.cars[0].speed < reconstructed.before.cars[0].speed, 'withholder cannot erase its unfavorable collision');
  await mkdir(output, { recursive: true });
  await pages[1].screenshot({ path: `${output}/honest-certified-prefix.png` });
  await pages[0].screenshot({ path: `${output}/withheld-collision-state.png` });
  await writeFile(`${output}/public-evidence.json`, JSON.stringify({ scope, snapshots, reconstructed }, null, 2));
  const report = { passed: true, contexts: 4, webrtcLinks: 6, withheldCheckpointTick: 18, honestCheckpointTick: 12, retainedInputInterval: [12, 18], collisionSlowdownTicks: reconstructed.collisionSlowdownTicks, allOriginalSignaturesVerified: true, matchingRevealsReconstructHiddenState: true, browserImposedForfeits: 0, nativeInstructionsCanonical: true, browserErrors: errors.length, nativeConsensusExecution: false, note: 'Real browser/WebRTC withholding test with one participant send fault; no ledger or wallet transaction was submitted. Consensus recovery is qualified separately.' };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await Promise.all(pages.map(page => page.evaluate(() => globalThis.controller?.stop()).catch(() => {})));
  await browser.close();
}
