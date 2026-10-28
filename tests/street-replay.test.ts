import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadStreetRoute, STREET_ROUTES, type LoadedStreetRoute } from '../src/game/street/assets';
import { StreetRaceSession } from '../src/game/street/session';
import { streetDriver } from '../src/game/street/test-driver';
import {
  decodeStreetReplay, encodeStreetReplay, exportStreetReplay, MAX_STREET_REPLAY_BYTES,
  StreetReplayPlayback, verifyStreetReplay, type StreetReplay, type VerifiedStreetReplay,
} from '../src/game/street/replay';

const metadata = { playerSlot: 2, names: ['空本アキ', '空井レン', 'YOU', '雲野ダイチ', '空木ユイ', '天野ジュン', '空城レイ', '天宮トオル'],
  skins: [5, 4, 3, 2, 1, 0, 5, 4], savedAt: '2026-09-07T12:34:56.000Z' };
let routePromise: Promise<LoadedStreetRoute> | undefined;
function route(): Promise<LoadedStreetRoute> {
  return routePromise ??= (async () => {
    const descriptor = STREET_ROUTES[0]!, original = globalThis.fetch;
    globalThis.fetch = async input => {
      const url = new URL(String(input), 'https://replay.test/');
      assert.equal(url.pathname, `/${descriptor.bundlePath}`);
      const payload = readFileSync(new URL(`../public/${descriptor.bundlePath}`, import.meta.url));
      return new Response(new Uint8Array(payload), { status: 200 });
    };
    try { return await loadStreetRoute(descriptor.id); }
    finally { globalThis.fetch = original; }
  })();
}
interface Fixture {
  loaded: LoadedStreetRoute;
  session: StreetRaceSession;
  replay: StreetReplay;
  snapshots: Map<number, Readonly<Record<string, number>>>;
}
let fixturePromise: Promise<Fixture> | undefined;
function fixture(): Promise<Fixture> {
  return fixturePromise ??= (async () => {
    const loaded = await route(), session = new StreetRaceSession(loaded.bundle);
    const wanted = new Set([0, 1, 29, 30, 31, 299, 300, 301, 699, 700, 701, 8999, 9000]);
    const snapshots = new Map<number, Readonly<Record<string, number>>>([[0, session.values]]);
    while (!session.state.done) {
      const before = session.state;
      // Genuine native handling/contacts first, then an idle finish at the cap.
      // No test-only shortened rules, state restoration, or forfeit authority.
      session.step(before.tick < 700 ? Array.from({ length: 8 }, (_, slot) => streetDriver(loaded.bundle.track, before, slot)) : Array(8).fill(0));
      if (wanted.has(session.state.tick)) snapshots.set(session.state.tick, session.values);
      if (session.state.tick % 120 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    assert.equal(session.state.tick, 9000);
    assert.ok(snapshots.get(300)!['c0.progressMm'] !== snapshots.get(0)!['c0.progressMm']);
    return { loaded, session, replay: exportStreetReplay(session, loaded, metadata), snapshots };
  })();
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test('street replay canonical roundtrip is bounded and contains controls plus every native outcome', async () => {
  const { replay, session } = await fixture(), encoded = encodeStreetReplay(replay), decoded = decodeStreetReplay(encoded);
  assert.deepEqual(decoded, replay);
  assert.deepEqual(replay.outcome, session.values);
  assert.equal(replay.controls.length, 9000);
  assert.ok(replay.controls.every(row => row.length === 8 && row.every(value => value >= 0 && value < 64)));
  assert.ok(new TextEncoder().encode(encoded).length < MAX_STREET_REPLAY_BYTES);
  assert.ok(Object.isFrozen(decoded) && Object.isFrozen(decoded.outcome) && Object.isFrozen(decoded.controls[0]));
  assert.throws(() => decodeStreetReplay(JSON.stringify(replay, null, 2)), RangeError);
  assert.throws(() => decodeStreetReplay(`${encoded} `), /canonical/);
  assert.throws(() => decodeStreetReplay(encoded.replace('{', '{"version":1,')), /canonical/);
  assert.throws(() => decodeStreetReplay(encoded.replace('"version":1', '"version":1e0')), /canonical/);
  assert.throws(() => decodeStreetReplay(' '.repeat(MAX_STREET_REPLAY_BYTES + 1)), /byte limit/);
  assert.throws(() => decodeStreetReplay('{'));

  const invalid = (edit: (value: any) => void) => {
    const changed = clone(replay); edit(changed); assert.throws(() => encodeStreetReplay(changed));
  };
  invalid(value => { value.graph = {}; });
  invalid(value => { value.consensusForfeits = Array(8).fill(0); });
  invalid(value => { value.controls[0].push(0); });
  invalid(value => { value.controls[0][0] = 64; });
  invalid(value => { value.controls[0][0] = -0; });
  invalid(value => { value.controls[0][0] = 0.5; });
  invalid(value => { value.controls.push(Array(8).fill(0)); value.outcome.tick++; });
  invalid(value => { value.outcome.done = 0; });
  invalid(value => { value.outcome.tick--; });
  invalid(value => { value.outcome['c0.speedMmPerTick'] = Number.MAX_SAFE_INTEGER + 1; });
  invalid(value => { value.computationHash = '0'.repeat(64); });
  invalid(value => { value.routeId = '../unreviewed'; });
  invalid(value => { value.savedAt = '2026-02-30T12:00:00.000Z'; });
  invalid(value => { value.skins[0] = 6; });
  invalid(value => { value.playerSlot = 8; });
  invalid(value => { value.names[0] = '\ud800'; });
  let invoked = false;
  const accessor = clone(replay);
  Object.defineProperty(accessor, 'names', { enumerable: true, get() { invoked = true; throw Error('must not invoke'); } });
  assert.throws(() => encodeStreetReplay(accessor)); assert.equal(invoked, false);
});

test('only loader-admitted computations and completed zero-forfeit sessions can export or verify', async () => {
  const { loaded, replay } = await fixture();
  const fake = { descriptor: loaded.descriptor, bundle: { graph: {} } } as unknown as LoadedStreetRoute;
  await assert.rejects(verifyStreetReplay(replay, fake), /admission/);
  const fresh = new StreetRaceSession(loaded.bundle);
  assert.throws(() => exportStreetReplay(fresh, loaded, metadata), /completed/);
  fresh.step(Array(8).fill(0), Array(8).fill(1));
  assert.equal(fresh.state.done, true);
  assert.throws(() => exportStreetReplay(fresh, loaded, metadata), /forfeits/);
  const changed = clone(loaded.bundle) as any;
  changed.sources['local-unreviewed-change'] = '0'.repeat(64);
  const foreign = new StreetRaceSession(changed);
  assert.throws(() => exportStreetReplay(foreign, loaded, metadata), /pinned route/);
  assert.throws(() => new StreetReplayPlayback({ replay, descriptor: loaded.descriptor, bundle: loaded.bundle,
    length: replay.controls.length, verification: 'local-reexecution' } as VerifiedStreetReplay), /genuine/);
  const wrongRoster = clone(replay) as any;
  wrongRoster.roster = 2; wrongRoster.playerSlot = 0;
  wrongRoster.names = wrongRoster.names.slice(0, 2); wrongRoster.skins = wrongRoster.skins.slice(0, 2);
  wrongRoster.controls = wrongRoster.controls.map((row: number[]) => row.slice(0, 2));
  await assert.rejects(verifyStreetReplay(wrongRoster, loaded), /roster/);
  const missingOutput = clone(replay) as any;
  delete missingOutput.outcome['c0.bodyYawMicroturn'];
  await assert.rejects(verifyStreetReplay(missingOutput, loaded), /field layout/);
  const extraOutput = clone(replay) as any;
  extraOutput.outcome['unreviewed.advice'] = 0;
  await assert.rejects(verifyStreetReplay(extraOutput, loaded), /field layout/);
});

test('full reexecution permits only private verified checkpoints and reproduces arbitrary seek order', async () => {
  const { loaded, replay, snapshots } = await fixture(), progress: number[] = [];
  const verified = await verifyStreetReplay(replay, loaded, { onProgress: completed => progress.push(completed) });
  assert.equal(verified.verification, 'local-reexecution');
  assert.equal(verified.length, 9000);
  assert.ok(progress.length >= 301 && progress[0] === 0 && progress.at(-1) === 9000);
  assert.ok(Object.isFrozen(verified));
  const playback = new StreetReplayPlayback(verified);
  for (const tick of [9000, 0, 31, 8999, 300, 1, 700, 29, 301, 30, 699, 701, 299]) {
    const state = playback.seek(tick);
    assert.deepEqual(playback.values, snapshots.get(tick));
    assert.equal(state.worldBrokenMask, snapshots.get(tick)!.worldBrokenMask);
    assert.deepEqual(state.cars.map(car => car.skin), metadata.skins);
    // A caller can edit its presentation snapshot without editing replay state.
    state.cars[0]!.bodyYawMicroturn++;
    assert.notEqual(state.cars[0]!.bodyYawMicroturn, playback.state.cars[0]!.bodyYawMicroturn);
  }
  playback.seek(29); playback.step(); assert.deepEqual(playback.values, snapshots.get(30));
  playback.seek(8999); playback.step(); assert.equal(playback.done, true);
  assert.deepEqual(playback.step(), playback.state);
  const terminal = playback.values;
  for (const tick of [-1, 9001, 0.5, NaN]) assert.throws(() => playback.seek(tick));
  assert.equal(playback.values, terminal);
  assert.throws(() => { (playback.values as Record<string, number>).worldBrokenMask = 999; });
});

test('a valid-looking full outcome edit is rejected after exact reexecution', async () => {
  const { loaded, replay } = await fixture(), changed = clone(replay) as any;
  changed.outcome.worldBrokenMask ^= 1;
  await assert.rejects(verifyStreetReplay(decodeStreetReplay(encodeStreetReplay(changed)), loaded), /full outcome/);
});

test('controls remain bound to the complete outcome and verification cancellation yields no playable result', async () => {
  const { loaded, replay } = await fixture(), changed = clone(replay) as any;
  changed.controls[changed.controls.length - 1][0] = 1;
  await assert.rejects(verifyStreetReplay(changed, loaded), /full outcome/);
  const controller = new AbortController();
  let progress = 0;
  await assert.rejects(verifyStreetReplay(replay, loaded, { signal: controller.signal,
    onProgress: tick => { progress = tick; if (tick > 0) controller.abort(); },
  }), error => error instanceof DOMException && error.name === 'AbortError');
  assert.ok(progress > 0 && progress < 9000);
});
