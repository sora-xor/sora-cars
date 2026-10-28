import { readFileSync } from 'node:fs';
import { gameHashLiteralV1 } from '@iroha/iroha-js/game';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ed25519 } from '@noble/curves/ed25519';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { raceHashLiteralV1 } from '@iroha/iroha-js/race';
import { createSignalingRelay } from './signaling.mjs';
const nativeProfile = JSON.parse(readFileSync(new URL('../src/game/generated/race-v1-kernels.json', import.meta.url), 'utf8')).profile_id;
const profileId = gameHashLiteralV1(Buffer.from(nativeProfile, 'hex'));
const origin = process.env.SORA_CARS_TEST_ORIGIN ?? 'http://127.0.0.1:5173';
const relay = createSignalingRelay({ port: 0 });
await once(relay, 'listening');
const relayUrl = `ws://127.0.0.1:${relay.address().port}`;
const keys = [41, 42].map(n => Array.from(new Uint8Array(32).fill(n)));
const hash = n => raceHashLiteralV1(new Uint8Array(32).fill(n));
const scope = { networkId: NetworkId.fromBytes(new Uint8Array(32).fill(3)).toString(), raceId: hash(43), profileId, rulesHash: hash(45), track: { kind: 'harbor', value: null }, epoch: 0, participants: keys.map((key, slot) => ({ slot, account: `spectator-fixture-${slot}`, inputKeyHex: Buffer.from(ed25519.getPublicKey(Uint8Array.from(key))).toString('hex') })) };
const browser = await chromium.launch();
const pages = [], errors = [];
async function page() {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } }); pages.push(p);
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`${origin}/tests/mesh-harness.html`);
  await p.waitForFunction(() => typeof globalThis.makeRaceSpectator === 'function');
  return p;
}
async function observer() {
  const p = await page();
  await p.evaluate(async ({ scope, relayUrl }) => {
    globalThis.spectator = globalThis.makeRaceSpectator(scope);
    globalThis.observerStates = []; globalThis.observerCheckpoints = []; globalThis.observerMessages = [];
    globalThis.spectator.onState = s => globalThis.observerStates.push(s);
    globalThis.spectator.onCheckpoint = cp => globalThis.observerCheckpoints.push(cp);
    globalThis.spectator.onStatus = m => globalThis.observerMessages.push(m);
    await globalThis.spectator.connect(relayUrl);
  }, { scope, relayUrl });
  return p;
}
try {
  const watch = await observer();
  const drivers = [];
  for (let slot = 0; slot < 2; slot++) {
    const p = await page(); drivers.push(p);
    await p.evaluate(({ scope, slot, key }) => {
      globalThis.driverCheckpoints = []; globalThis.driverStates = []; globalThis.driverErrors = [];
      const appearance = { skin: slot ? 'ren-radio-night' : 'aki-first-light', upgrade: slot ? 'club-aero-86' : 'club-neon-pulse' };
      globalThis.controller = globalThis.makeRaceController({ scope, slot, appearance, privateKey: Uint8Array.from(key), publicFeed: true, input: () => 1, peerTimeoutMs: 60_000 });
      globalThis.controller.onCheckpoint = cp => globalThis.driverCheckpoints.push(cp);
      globalThis.controller.onState = s => globalThis.driverStates.push(s);
      globalThis.controller.onDispute = e => globalThis.driverErrors.push(e.reason);
      globalThis.controller.start();
    }, { scope, slot, key: keys[slot] });
  }
  // Higher slots subscribe first; both connection signaling and the read-only feed use the real optional relay.
  for (const p of [...drivers].reverse()) await p.evaluate(url => globalThis.controller.connectSignaling(url), relayUrl);
  await watch.waitForFunction(() => globalThis.spectator.state.tick >= 60, undefined, { timeout: 60_000 });
  const late = await observer();
  await Promise.all([watch, late].map(p => p.waitForFunction(() => globalThis.spectator.state.tick >= 180, undefined, { timeout: 60_000 })));
  const observed = await Promise.all([watch, late].map(p => p.evaluate(() => ({ checkpoint: globalThis.observerCheckpoints.find(cp => cp.checkpoint.tick === 180), state: globalThis.observerStates.find(s => s.tick === 180), appearances: globalThis.spectator.appearances, messages: globalThis.observerMessages }))));
  for (const o of observed) { assert.equal(o.state?.tick, 180); assert.equal(o.checkpoint?.checkpoint.tick, 180); }
  for (const p of drivers) {
    const d = await p.evaluate(() => ({ checkpoint: globalThis.driverCheckpoints.find(cp => cp.checkpoint.tick === 180), state: globalThis.driverStates.find(s => s.tick === 180), appearances: globalThis.controller.appearances, errors: globalThis.driverErrors }));
    assert.deepEqual(d.errors, []);
    for (const o of observed) { assert.deepEqual(o.checkpoint, d.checkpoint); assert.deepEqual(o.state, d.state); assert.deepEqual(o.appearances, d.appearances); }
  }
  for (const o of observed) assert.ok(!o.messages.some(m => m.startsWith('Rejected') || m.startsWith('Feed cannot')), o.messages.join('\n'));
  assert.deepEqual(errors, []);
  await mkdir('output/browser/spectator', { recursive: true });
  await watch.screenshot({ path: 'output/browser/spectator/live.png' });
  await late.setViewportSize({ width: 390, height: 844 });
  await late.evaluate(() => window.dispatchEvent(new Event('resize')));
  await late.screenshot({ path: 'output/browser/spectator/late-mobile.png' });
  await writeFile('artifacts/spectator-browser.json', JSON.stringify({ passed: true, browserContexts: 4, drivers: 2, observers: 2, lateObserver: true, certifiedTick: 180, realWebRtcAndWebSocket: true, sameCertifiedStatesAndAppearances: true, observersHaveGameplayOrWalletKeys: false, authoritativeLedger: false, errors }, null, 2));
  console.log('Real browser spectator relay passed: two drivers, two read-only observers, late join, exact certified state and authenticated cosmetics at tick180. No wallet keys or ledger authority.');
} finally {
  await Promise.all(pages.map(p => p.evaluate(() => { globalThis.controller?.stop(); globalThis.spectator?.close(); }).catch(() => {})));
  await browser.close();
  for (const socket of relay.clients) socket.terminate();
  await new Promise(resolve => relay.close(resolve));
}
