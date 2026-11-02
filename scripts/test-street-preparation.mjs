import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

// Exercise the real UI state machine with controlled asset/replay promises and
// renderer readiness. No browser/GPU, timers, RAF polling or native replacement
// is introduced into production code.
const source = await readFile(new URL('../src/ui/street-practice.ts', import.meta.url), 'utf8');
const compiled = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
// `drive` picks the session street practice opens: the driving model (the
// default) or `?physics=native`'s street draft. Both present the same street state.
function fixture({ drive = true } = {}) {
  const requests = [], verifications = [], draws = [], songs = [], events = [], sessions = [], controls = [];
  let visual = { status: 'loading', message: 'Preparing the detailed street…' }, drawError, reloads = 0;
  const native = () => ({ tick: 0, cars: [{ status: 0, propHitMask: 0, bodyYawMicroturn: 0, velocityYawMicroturn: 0, speedMmPerTick: 0 }], rain: 0, done: false });
  class Session {
    state = native(); values = [];
    constructor() { sessions.push(this); }
    step(input) { this.values.push(input); this.state = { ...this.state, tick: this.state.tick + 1 }; return this.state; }
  }
  class DriveSession extends Session {
    race = { tick: 0, done: false, events: [], props: [], cars: [{ wreckTick: -1 }] };
    constructor(track, objects, roster, skins) { super(); this.track = track; this.skins = skins; }
  }
  class AI { control(race, slot) { controls.push(slot); return 0; } }
  class Playback { state = native(); values = []; length = 120; tick = 0; }
  class Audio {
    paused = true; currentTime = 0; duration = 255; readyState = 0; seeking = false; ended = false;
    constructor(url) { this.url = url; songs.push(this); }
    pause() { this.paused = true; } removeAttribute() {} play() { this.paused = false; return Promise.resolve(); }
  }
  const audio = { musicEnabled: false, musicVolume: .5, setExternalMusic: value => events.push(['external', value]),
    stopDrive: () => events.push(['stop']), drive: () => events.push(['drive']), cue() {}, unlock: () => Promise.resolve() };
  const screen = { innerHTML: '', querySelector: () => null };
  const canvas = { width: 100, height: 100, getContext: () => ({ fillRect() {}, fillStyle: '' }) };
  const loaded = { bundle: { track: { id: 'tokyo-1986' }, objects: [] }, descriptor: { musicDurationSeconds: 255 } };
  const text = value => ({ ja: value, en: value });
  const require = id => {
    if (id.endsWith('.css')) return {};
    if (id.endsWith('/assets')) return {
      STREET_ROUTES: [{ id: 'tokyo-1986', musicDurationSeconds: 255 }],
      loadStreetRoute: () => { const item = deferred(); requests.push(item); return item.promise; },
      loadStreetRouteMusic: () => Promise.resolve('local-song.mp3'),
    };
    if (id.endsWith('/routes')) return { streetRouteStyle: () => ({ place: text('Tokyo'), title: text('Tokyo'), path: text('Route'), facts: text('Facts'), song: 'Song', provisional: text('Provisional') }) };
    if (id.endsWith('/song-endings')) return { STREET_SONG_ENDINGS: {} };
    if (id.endsWith('/session')) return { StreetRaceSession: Session };
    if (id.endsWith('/drive/street')) return { DriveStreetSession: DriveSession };
    if (id.endsWith('/drive/ai')) return { DRIVER_SKILLS: { club: {}, pro: {}, ace: {} }, DriveAI: AI };
    if (id.endsWith('/drive/mode')) return { drivePhysics: () => drive };
    if (id.endsWith('/car-builds')) return { rivalCar: () => null, storyCar: () => null };
    if (id.endsWith('/renderer')) return { StreetRaceRenderer: class {
      resize() {}
      draw(track, state, options, time) { draws.push({ track, state, options, time }); if (drawError) throw drawError; }
    } };
    if (id.endsWith('/presentation')) return { streetPresentation: () => ({ index: 0 }) };
    if (id.endsWith('/soundtrack-clock')) return {
      planStreetSoundtrack: () => ({ seekTo: null, shouldPlay: false, expectedSeconds: 0 }),
      streetSongPosition: () => ({ seconds: 0, start: 0, pass: 0 }),
    };
    if (id.endsWith('/test-driver')) return { streetDriver: () => 1 };
    if (id.endsWith('/replay')) return {
      decodeStreetReplay: JSON.parse, encodeStreetReplay: JSON.stringify, exportStreetReplay() {},
      verifyStreetReplay: (record, route, options) => { const item = deferred(); verifications.push({ ...item, record, route, options }); return item.promise; },
      StreetReplayPlayback: Playback,
    };
    if (id.endsWith('/scene-preparation')) return { readSceneReadiness: value => { assert.equal(value, canvas); assert.ok(draws.length > 0, 'readiness must follow actual course drawing'); return visual; } };
    if (id.endsWith('/audio')) return {};
    throw new Error(`Unexpected production import: ${id}`);
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'Audio', 'document', 'matchMedia', 'window', compiled.code)(
    require, module, module.exports, Audio, { querySelector: () => null }, () => ({ matches: false }), { location: { reload: () => reloads++ } });
  const street = new module.exports.StreetPractice({ canvas, screen, audio, onChange() {}, onSaved() {}, notify() {}, onExit: () => street.close() });
  return { street, screen, loaded, requests, verifications, draws, songs, events, sessions, controls,
    setVisual: value => { visual = value; }, setDrawError: value => { drawError = value; }, reloads: () => reloads };
}

for (const drive of [true, false]) {
  const f = fixture({ drive }); let settled = false;
  const opened = f.street.open('tokyo-1986', 2).then(() => { settled = true; });
  f.requests[0].resolve(f.loaded); await flush();
  assert.equal(f.sessions.length, 1); assert.equal('race' in f.sessions[0], drive, drive ? 'the driving model races the street' : '?physics=native keeps the street draft');
  assert.equal(f.street.state.phase, 'loading'); assert.equal(settled, false);
  f.street.action('street-start'); f.street.update(10, 63);
  assert.equal(f.street.state.fullStreetState.tick, 0); assert.equal(f.street.activeInput, false);
  assert.deepEqual(f.controls, [], 'no rival drives before the start');
  f.street.draw(0); await flush();
  assert.equal(f.street.state.phase, 'loading'); assert.equal(settled, false);
  assert.match(f.screen.innerHTML, /Preparing the detailed street/);
  f.setVisual({ status: 'ready', message: '' });
  await flush(); assert.equal(settled, false, 'asset flags alone cannot reveal an undrawn frame');
  f.street.draw(0); await opened;
  assert.equal(f.street.state.phase, 'ready'); assert.equal(f.street.state.fullStreetState.tick, 0);
  assert.equal(f.draws.at(-1).options.paused, true); assert.equal(f.draws.at(-1).options.hud, false);
  assert.ok(f.songs.every(song => song.paused)); assert.ok(!f.events.some(([event]) => event === 'drive'));
  f.street.action('street-start'); assert.equal(f.street.activeInput, true); assert.equal(f.street.state.phase, 'countdown');
  f.street.close();
}
{
  const f = fixture(), record = { playerSlot: 0, names: ['YOU'], skins: [2] };
  let settled = false; const opened = f.street.open('tokyo-1986', 2, record).then(() => { settled = true; });
  record.names[0] = 'MUTATED CALLER'; f.requests[0].resolve(f.loaded); await flush();
  assert.equal(f.verifications[0].record.names[0], 'YOU', 'caller replay was snapshotted');
  f.setVisual({ status: 'ready', message: '' }); f.street.draw(0); await flush();
  assert.equal(f.draws.length, 0); assert.equal(settled, false); assert.equal(f.street.state.fullStreetState, null);
  f.verifications[0].resolve({}); await flush();
  assert.equal(f.street.state.phase, 'loading'); assert.equal(settled, false);
  f.street.draw(0); await opened;
  assert.equal(f.street.state.phase, 'ready'); assert.equal(f.street.state.verification, 'local-reexecution');
  f.street.close();
}
{
  const f = fixture(); let settled = false;
  const opened = f.street.open('tokyo-1986', 0).then(() => { settled = true; });
  f.street.close(); await opened; assert.equal(settled, true, 'close settles even before route requests finish');
  f.requests[0].resolve(f.loaded); await flush();
  assert.equal(f.street.state.fullStreetState, null); assert.equal(f.songs.length, 0); assert.equal(f.street.activeInput, false);
}
{
  const f = fixture(), record = { playerSlot: 0, names: ['YOU'], skins: [0] };
  const first = f.street.open('tokyo-1986', 0, record); f.requests[0].resolve(f.loaded); await flush();
  const verification = f.verifications[0]; assert.equal(verification.options.signal.aborted, false);
  const second = f.street.open('tokyo-1986', 1); await first;
  assert.equal(verification.options.signal.aborted, true);
  verification.resolve({}); await flush(); assert.equal(f.street.state.fullStreetState, null, 'cancelled verification cannot overwrite new opening');
  f.requests[1].resolve(f.loaded); await flush(); f.setVisual({ status: 'ready', message: '' }); f.street.draw(0); await second;
  assert.equal(f.street.state.replay, false); assert.equal(f.street.state.phase, 'ready'); f.street.close();
}
{
  const f = fixture(); const opened = f.street.open('tokyo-1986', 0); f.requests[0].resolve(f.loaded); await flush();
  f.setVisual({ status: 'failed', message: 'Lighting could not load <unsafe>' }); f.street.draw(0); await opened;
  assert.equal(f.street.state.phase, 'error'); assert.equal(f.street.state.fullStreetState.tick, 0);
  assert.match(f.screen.innerHTML, /street-reload/); assert.match(f.screen.innerHTML, /&lt;unsafe&gt;/);
  assert.doesNotMatch(f.screen.innerHTML, /street-start/); assert.doesNotMatch(f.screen.innerHTML, /street-retry/);
  const count = f.draws.length; f.street.draw(1); assert.equal(f.draws.length, count, 'failed rendering does not loop');
  f.street.action('street-reload'); assert.equal(f.reloads(), 1);
  f.street.close(); f.street.action('street-reload'); assert.equal(f.reloads(), 1, 'reload is inactive after leaving Tokyo');
}
{
  const f = fixture(); const opened = f.street.open('tokyo-1986', 0); f.requests[0].reject(new Error('Route verification failed')); await opened;
  assert.equal(f.street.state.phase, 'error'); assert.match(f.screen.innerHTML, /street-retry/); assert.doesNotMatch(f.screen.innerHTML, /street-reload/);
  f.street.action('street-reload'); assert.equal(f.reloads(), 0); f.street.close();
}
{
  const f = fixture(); const opened = f.street.open('tokyo-1986', 0); f.requests[0].resolve(f.loaded); await flush();
  f.setDrawError(new Error('WebGL could not draw')); f.street.draw(0); await opened;
  assert.equal(f.street.state.phase, 'error'); assert.equal(f.street.state.error, 'WebGL could not draw'); f.street.close();
}
console.log('Street preparation: route/replay + rendered readiness, tick-zero/input/audio hold on the driving model and the native draft, cancellation/replacement, visual failure/reload guards and verification errors pass.');
