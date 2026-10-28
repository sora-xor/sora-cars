import { manifestCommitment } from '../src/chain/certificates';
import { formatGameCommitmentLiteralV1 } from '@iroha/iroha-js/game-certificates';
import { currentGameFixtures } from '../scripts/lib/current-game-fixtures.mjs';
import { RACE_PROFILE_ID } from '../src/game/environment';
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { launchChromium } from '../scripts/lib/browser-launch.mjs';
import { createServer } from 'vite';
import { blake3 } from '@noble/hashes/blake3';
import { gameHashLiteralV1 } from '@iroha/iroha-js/game';
import { raceManifest } from '../src/chain/races';

const fixture = currentGameFixtures();
const open = fixture.vectors.find((row: { name: string }) => row.name === 'OpenGameSessionV1')!.value;
const hash = (byte: number) => gameHashLiteralV1(new Uint8Array(32).fill(byte | 1));
function lobby() {
  const manifest = raceManifest({ trackId: 0, maxRacers: 2, applicationId: open.manifest.application_id, profileId: RACE_PROFILE_ID });
  return { version: 1, network_id: fixture.network_id, session_id: open.session_id, manifest, profile_id: manifest.profile_id,
    manifest_commitment: manifestCommitment(fixture.network_id, open.session_id, manifest),
    asset_definition: open.asset_definition, stake: '1', custody: fixture.vectors.find(row => row.name === 'GameItemStakeV1')!.value.custody, liability: '0', payout_scale: 28, payout_claims: [], item_stakes: [], resources: [], participants: [],
    verification_id: null, terminal_at_height: null, phase: { kind: 'lobby', value: null }, revision: '1', deadline_height: '100', result: null,
    admission_commitment: null, dispute_commitment: formatGameCommitmentLiteralV1(new Uint8Array(48).fill(31)), epoch: '0', next_tick: 0, checkpoint: null, pending_certificate: null,
    input_commitments: [], input_reveals: [], checkpoint_history: [], certified_batches: [], forced_batches: [] };
}
function otherAsset(): string {
  const body = Uint8Array.of(1, ...Array<number>(16).fill(55));
  const bytes = Buffer.concat([body, blake3(body).subarray(0, 4)]);
  let value = BigInt(`0x${bytes.toString('hex')}`), encoded = '';
  while (value > 0n) { encoded = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Number(value % 58n)]! + encoded; value /= 58n; }
  return encoded;
}
interface LiveTermsHarness {
  open(id: string): void; refresh(): void; join(): void; deactivate(): void; switchClient(network?: string): void;
  resolve(index: number, value: unknown): void;
  admission(ready: boolean): void; reviewCreate(): void; submitCreate(): void;
  view(): { requests: number; finished: number; errors: string[]; shown: number; id: string | null; stake: string | null; sent: unknown[] };
}
declare global { interface Window { liveTermsHarness: LiveTermsHarness } }

/** Actual production panel and DOM, with an explicit fake node/wallet and controlled reply order. */
test('live terms remain reviewed across asynchronous node replies and room navigation', { timeout: 45_000 }, async t => {
  const raw = lobby();
  const html = `<!doctype html><html><body><div id="app"><main id="screen"></main><dialog id="dialog"></dialog></div><script type="module">
import { LiveRacingPanel } from '/src/ui/live.ts';
const raw = ${JSON.stringify(raw)};
const requests = [], errors = [], sent = []; let finished = 0, shown = 0;
// Each test invokes the real refresh method explicitly; periodic scheduling is
// disabled so only the chosen reply order can affect the result.
window.setInterval = () => 0;
const makeClient = network => ({ config: { networkId: network ?? raw.network_id, applicationId: raw.manifest.application_id, profileId: raw.profile_id }, state: { capability: { current_height: '1' }, account: null }, canStake: false,
 getRace: id => new Promise(resolve => requests.push({ id, resolve })), probe: async () => {},
 submit: async instruction => { sent.push(instruction); return { hash: 'reviewed-fixture-transaction' }; } });
let client = makeClient();
const panel = new LiveRacingPanel({ client: () => client, screen: document.querySelector('#screen'), showRoom: () => { shown++; }, showDialog: content => { document.querySelector('#dialog').innerHTML = content; }, notify: message => errors.push(message), carId: () => 0, input: () => 0, begin: () => {}, state: () => {}, status: () => {}, finished: () => {}, spectate: () => {} });
const begin = operation => { Promise.resolve().then(operation).catch(error => errors.push(error.message)).finally(() => { finished++; }); };
window.liveTermsHarness = { admission: ready => { client.canStake = ready; }, reviewCreate: () => begin(() => panel.createDialog(0, 2, '1')), submitCreate: () => begin(() => panel.action('create')), open: id => begin(() => panel.open(id)), refresh: () => begin(() => panel.refresh()), join: () => begin(() => panel.action('join')), deactivate: () => panel.deactivate(), switchClient: network => { client = makeClient(network); }, resolve: (index, value) => requests[index].resolve(value), view: () => ({ requests: requests.length, finished, errors: [...errors], shown, id: panel.record?.race_id ?? null, stake: panel.record?.stake ?? null, sent }) };
</script></body></html>`;
  const server = await createServer({ cacheDir: 'node_modules/.vite-live-terms', server: { host: '127.0.0.1', port: 0, strictPort: false },
    define: { 'import.meta.env.VITE_XOR_ASSET_DEFINITION': JSON.stringify(open.asset_definition) },
    plugins: [{ name: 'isolated-live-terms-page', configureServer(server) { server.middlewares.use((request, response, next) => {
      if (request.url !== '/__live-terms') return next();
      void server.transformIndexHtml('/__live-terms', html).then(content => { response.setHeader('Content-Type', 'text/html'); response.end(content); }).catch(next);
    }); } }] });
  await server.listen();
  const address = server.httpServer!.address(); assert.ok(address && typeof address === 'object'); const port = address.port;
  const browser = await launchChromium({ headless: true });
  async function page(): Promise<Page> {
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${port}/__live-terms`);
    await page.waitForFunction(() => Boolean(window.liveTermsHarness)); return page;
  }
  async function openInitial(page: Page): Promise<void> {
    await page.evaluate(id => window.liveTermsHarness.open(id), raw.session_id);
    await page.waitForFunction(() => window.liveTermsHarness.view().requests === 1);
    await page.evaluate(raw => window.liveTermsHarness.resolve(0, raw), raw);
    await page.waitForFunction(() => window.liveTermsHarness.view().finished === 1);
  }
  try {
    await t.test('loss of release readiness blocks both a new review and an already-reviewed creation', async () => {
      const p = await page();
      await p.evaluate(() => window.liveTermsHarness.reviewCreate());
      await p.waitForFunction(() => window.liveTermsHarness.view().finished === 1);
      assert.equal(await p.locator('[data-live="create"]').count(), 0);
      assert.match((await p.evaluate(() => window.liveTermsHarness.view())).errors.join(), /must be ready/);
      await p.evaluate(() => { window.liveTermsHarness.admission(true); window.liveTermsHarness.reviewCreate(); });
      await p.waitForFunction(() => window.liveTermsHarness.view().finished === 2);
      assert.equal(await p.locator('[data-live="create"]').count(), 1);
      await p.evaluate(() => { window.liveTermsHarness.admission(false); window.liveTermsHarness.submitCreate(); });
      await p.waitForFunction(() => window.liveTermsHarness.view().finished === 3);
      const view = await p.evaluate(() => window.liveTermsHarness.view());
      assert.equal(view.sent.length, 0); assert.equal(view.errors.length, 2); assert.match(view.errors[1]!, /must be ready/);
      await p.close();
    });
    await t.test('wrong denomination cannot appear as a joinable XOR room', async () => {
      const p = await page();
      await p.evaluate(id => window.liveTermsHarness.open(id), raw.session_id);
      await p.waitForFunction(() => window.liveTermsHarness.view().requests === 1);
      await p.evaluate(value => window.liveTermsHarness.resolve(0, value), { ...raw, asset_definition: otherAsset() });
      await p.waitForFunction(() => window.liveTermsHarness.view().finished === 1);
      const view = await p.evaluate(() => window.liveTermsHarness.view()); assert.equal(view.shown, 0); assert.equal(view.id, null); assert.match(view.errors.join(), /XOR asset pinned/);
      await p.close();
    });
    await t.test('same-revision stake changes never replace the displayed or signed amount', async () => {
      const p = await page(); await openInitial(p);
      assert.match(await p.locator('.session-equipment').textContent() ?? '', /一時装備。/);
      assert.match(await p.locator('.session-equipment [lang="en"]').allTextContents().then(rows => rows.join(' ')), /Equipment is separate from wagers/);
      assert.match(await p.locator('.session-equipment').textContent() ?? '', /reserves no equipment/);
      await p.evaluate(() => window.liveTermsHarness.refresh()); await p.waitForFunction(() => window.liveTermsHarness.view().requests === 2);
      await p.evaluate(value => window.liveTermsHarness.resolve(1, value), { ...raw, stake: '1000' });
      await p.waitForFunction(() => window.liveTermsHarness.view().finished === 2);
      assert.equal((await p.evaluate(() => window.liveTermsHarness.view())).stake, '1');
      assert.match(await p.locator('.body-copy').textContent() ?? '', /1 XOR/);
      await p.evaluate(() => window.liveTermsHarness.join());
      // Successful submission refreshes the room. Resolve that explicit fake
      // node reply so completion tests the entire submit/refresh sequence.
      await p.waitForFunction(() => {
        const view = window.liveTermsHarness.view();
        return view.requests === 3 || view.finished === 3;
      });
      const duringJoin = await p.evaluate(() => window.liveTermsHarness.view());
      assert.equal(duringJoin.sent.length, 1, `Join must submit the reviewed terms: ${duringJoin.errors.join('; ')}`);
      assert.equal(duringJoin.requests, 3, 'Successful join must refresh the current room');
      await p.evaluate(raw => window.liveTermsHarness.resolve(2, raw), raw);
      await p.waitForFunction(() => window.liveTermsHarness.view().finished === 3);
      const afterJoin = await p.evaluate(() => window.liveTermsHarness.view());
      assert.equal(afterJoin.sent.length, 1, `Join must submit the reviewed terms: ${afterJoin.errors.join('; ')}`);
      const sent = afterJoin.sent as { JoinGameSessionV1: { expected_stake: string; resources: unknown[] } }[];
      assert.equal(sent[0]!.JoinGameSessionV1.expected_stake, '1'); assert.deepEqual(sent[0]!.JoinGameSessionV1.resources, []); await p.close();
    });
    await t.test('late open cannot override a newer room', async () => {
      // The manifest commitment binds the session id, so a distinct room carries its own commitment.
      const p = await page(), second = { ...raw, session_id: hash(45), manifest_commitment: manifestCommitment(fixture.network_id, hash(45), raw.manifest) };
      await p.evaluate(([a, b]) => { window.liveTermsHarness.open(a!); window.liveTermsHarness.open(b!); }, [raw.session_id, second.session_id]);
      await p.waitForFunction(() => window.liveTermsHarness.view().requests === 2);
      await p.evaluate(value => window.liveTermsHarness.resolve(1, value), second);
      await p.waitForFunction(() => window.liveTermsHarness.view().finished === 1);
      await p.evaluate(value => window.liveTermsHarness.resolve(0, value), raw);
      await p.waitForFunction(() => window.liveTermsHarness.view().finished === 2);
      const view = await p.evaluate(() => window.liveTermsHarness.view()); assert.equal(view.id, second.session_id); assert.equal(view.shown, 1); await p.close();
    });
    await t.test('leaving the room invalidates an in-flight open', async () => {
      const p = await page(); await p.evaluate(id => window.liveTermsHarness.open(id), raw.session_id);
      await p.waitForFunction(() => window.liveTermsHarness.view().requests === 1);
      await p.evaluate(value => { window.liveTermsHarness.deactivate(); window.liveTermsHarness.resolve(0, value); }, raw);
      await p.waitForFunction(() => window.liveTermsHarness.view().finished === 1);
      const view = await p.evaluate(() => window.liveTermsHarness.view()); assert.equal(view.shown, 0); assert.equal(view.id, null); await p.close();
    });
    await t.test('client replacement discards old node replies', async () => {
      const p = await page(); await p.evaluate(id => window.liveTermsHarness.open(id), raw.session_id);
      await p.waitForFunction(() => window.liveTermsHarness.view().requests === 1);
      await p.evaluate(value => { window.liveTermsHarness.switchClient(); window.liveTermsHarness.resolve(0, value); }, raw);
      await p.waitForFunction(() => window.liveTermsHarness.view().finished === 1);
      const view = await p.evaluate(() => window.liveTermsHarness.view()); assert.equal(view.shown, 0); assert.equal(view.id, null); await p.close();
    });
    await t.test('a different current network cannot sign a previously displayed room', async () => {
      const p = await page(); await openInitial(p);
      await p.evaluate(network => { window.liveTermsHarness.switchClient(network); window.liveTermsHarness.join(); }, hash(53));
      await p.waitForFunction(() => window.liveTermsHarness.view().finished === 2);
      const view = await p.evaluate(() => window.liveTermsHarness.view()); assert.equal(view.sent.length, 0); assert.match(view.errors.join(), /network/i); await p.close();
    });
  } finally { await browser.close(); await server.close(); }
});
