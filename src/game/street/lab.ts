import './lab.css';
import { StreetRaceRenderer } from './renderer';
import { StreetRaceSession, type StreetRaceState } from './session';
import { streetDriver } from './test-driver';
import { loadStreetRoute, loadStreetRouteMusic } from './assets';
import { GameAudio, type DriveDetail } from '../audio';

const canvas = document.querySelector<HTMLCanvasElement>('#street-canvas')!;
const renderer = new StreetRaceRenderer(canvas);
const status = document.querySelector<HTMLElement>('#lab-status')!;
const detail = document.querySelector<HTMLElement>('#lab-detail')!;
const button = (id: string) => document.querySelector<HTMLButtonElement>(`#lab-${id}`)!;
const keys = new Set<string>(), touch = new Set<string>();
const audio = new Audio(); audio.preload = 'auto'; audio.volume = 0.65;
const engine = new GameAudio();
const names = ['YOU · 空本アキ', '空井レン', '天羽メイ', '雲野ダイチ', '空木ユイ', '天野ジュン', '空城レイ', 'SORA ゲスト'];
let session: StreetRaceSession | undefined, previous: StreetRaceState | undefined;
let paused = true, started = false, automatic = false, music = true, manual = false;
let accumulator = 0, last = performance.now(), time = 0, controls = 0, stepMs = 0;
let error: string | null = null;
let pendingImpact: DriveDetail['impact'];
const codeBits: Record<string, number> = { ArrowUp: 1, KeyW: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 4,
  KeyA: 4, ArrowRight: 8, KeyD: 8, Space: 16, ShiftLeft: 32, ShiftRight: 32, KeyX: 32 };

function input(): number {
  let bits = 0;
  for (const key of [...keys, ...touch]) bits |= codeBits[key] ?? 0;
  const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected);
  if (pad) {
    if ((pad.axes[0] ?? 0) < -0.25 || pad.buttons[14]?.pressed) bits |= 4;
    if ((pad.axes[0] ?? 0) > 0.25 || pad.buttons[15]?.pressed) bits |= 8;
    if (pad.buttons[7]?.pressed) bits |= 1;
    if (pad.buttons[6]?.pressed) bits |= 2;
    if (pad.buttons[4]?.pressed || pad.buttons[1]?.pressed) bits |= 16;
    if (pad.buttons[5]?.pressed || pad.buttons[0]?.pressed) bits |= 32;
  }
  return bits;
}
function pause(value: boolean) {
  paused = value; accumulator = 0; last = performance.now();
  button('pause').innerHTML = value ? 'つづける<small>RESUME</small>' : '一時停止<small>PAUSE</small>';
  if (value) { audio.pause(); engine.stopDrive(); pendingImpact = undefined; } else if (music) void audio.play().catch(() => {});
}
function start() {
  if (!session || session.state.done) return;
  void engine.unlock(); started = true; status.hidden = true; button('start').hidden = true; pause(false);
}
function advance() {
  if (!session || paused || !started || session.state.done || error) return;
  const state = session.state;
  controls = automatic ? streetDriver(session.bundle.track, state, 0) : input();
  const actions = state.cars.map((_, slot) => slot === 0 ? controls : streetDriver(session!.bundle.track, state, slot));
  previous = state;
  try {
    const began = performance.now(); const next = session.step(actions); stepMs = performance.now() - began;
    // Preserve the latest native contact across multiple physics ticks in one
    // render frame. Stable catalog order chooses one cue for simultaneous hits.
    // Presentation never collision-tests the geometry or creates damage state.
    const struck = session.bundle.objects.find((object, index) => object.kind !== 'oil'
      && Math.floor(next.cars[0]!.propHitMask / 2 ** index) % 2 === 1);
    if (struck) pendingImpact = { tick: next.tick, kind: struck.kind === 'tree_planter' ? 'tree' : 'sign' };
    if (next.done) {
      paused = true; audio.pause(); engine.stopDrive(); pendingImpact = undefined; engine.cue('finish'); status.hidden = false;
      const player = next.cars[0]!;
      status.innerHTML = next.refundAllForfeit ? '全員棄権<small>ALL RACERS FORFEITED · REFUND OUTCOME</small>'
        : next.technicalWin ? `相手が棄権<small>TECHNICAL RESULT · ${player.rank} / ${next.cars.length}</small>`
        : player.status === 1 ? `ゴール！<small>FINISHED · ${player.rank} / ${next.cars.length}</small>`
        : `時間切れ<small>TIME LIMIT · ${player.rank} / ${next.cars.length}</small>`;
    }
  } catch (failure) {
    error = String(failure); paused = true; audio.pause(); engine.stopDrive(); pendingImpact = undefined; status.hidden = false;
    status.textContent = `走行データを停止しました / Simulation rejected: ${error}`;
    console.error(failure);
  }
}
function draw() {
  if (!session) return;
  const state = session.state, alpha = manual || paused ? 1 : Math.min(1, accumulator / (1000 / 30));
  const cars = state.cars.map((car, slot) => {
    const before = previous?.cars[slot]; if (!before || alpha === 1) return car;
    const mix = (a: number, b: number) => a + (b - a) * alpha;
    const yaw = (a: number, b: number) => a + (((b - a + 1500000) % 1000000) - 500000) * alpha;
    return { ...car, progressMm: mix(before.progressMm, car.progressMm), lateralMm: mix(before.lateralMm, car.lateralMm),
      bodyYawMicroturn: yaw(before.bodyYawMicroturn, car.bodyYawMicroturn), velocityYawMicroturn: yaw(before.velocityYawMicroturn, car.velocityYawMicroturn) };
  });
  renderer.draw(session.bundle.track, { ...state, cars }, { playerSlot: 0, names, controls: paused ? 0 : controls,
    paused, rain: state.rain, objects: session.bundle.objects }, time);
  const player = state.cars[0]!;
  const slip = ((player.bodyYawMicroturn - player.velocityYawMicroturn + 1500000) % 1000000) - 500000;
  engine.drive(player.speedMmPerTick, started && !paused && !state.done && player.status === 0,
    player.boosting === 1, { controls, lateral: Math.trunc(slip / 100), rain: state.rain, offroad: player.wallContact === 1,
      ...(pendingImpact ? { impact: pendingImpact } : {}) });
  pendingImpact = undefined;
  detail.innerHTML = `俎橋 → 靖国通り → 国会議事堂<small>${state.tick} TICKS · ${stepMs.toFixed(1)} ms PHYSICS · LOCAL DRAFT</small>`;
}
function frame(now: number) {
  const elapsed = Math.min(250, now - last); last = now;
  if (!manual) {
    time += elapsed / 1000;
    if (!paused && started) {
      accumulator += elapsed;
      while (accumulator >= 1000 / 30) { advance(); accumulator -= 1000 / 30; }
    }
    draw();
  }
  requestAnimationFrame(frame);
}
button('start').onclick = start;
button('pause').onclick = () => { if (!started) start(); else pause(!paused); draw(); };
button('reset').onclick = () => {
  session?.reset(); previous = undefined; error = null; controls = 0; pendingImpact = undefined; started = true;
  audio.currentTime = 0; status.hidden = true; button('start').hidden = true; pause(false); draw();
};
button('auto').onclick = () => { automatic = !automatic; button('auto').setAttribute('aria-pressed', String(automatic)); };
button('music').onclick = () => {
  music = !music; button('music').setAttribute('aria-pressed', String(music));
  if (!music) audio.pause(); else if (!paused) void audio.play().catch(() => {});
};
button('download').onclick = () => {
  if (!session) return;
  const replay = { version: 1, domain: 'sora-cars.street-replay-draft.v1', track: session.bundle.track.id,
    sources: session.bundle.sources, objects: session.bundle.objects, roster: session.roster,
    actions: session.actions, outcome: session.values,
    qualification: { proof: false, finalized: false } };
  const url = URL.createObjectURL(new Blob([JSON.stringify(replay)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'sora-cars-street-replay-draft.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('keydown', event => {
  if (Object.hasOwn(codeBits, event.code)) { event.preventDefault(); keys.add(event.code); }
  if (event.code === 'KeyP' && !event.repeat) { event.preventDefault(); pause(!paused); }
  if (event.code === 'KeyF' && !event.repeat) { event.preventDefault();
    if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen(); }
});
window.addEventListener('keyup', event => { keys.delete(event.code); });
window.addEventListener('blur', () => { keys.clear(); touch.clear(); pause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); touch.clear(); pause(true); } });
for (const element of document.querySelectorAll<HTMLButtonElement>('[data-key]')) {
  const clear = () => { touch.delete(element.dataset.key!); element.classList.remove('held'); };
  element.onpointerdown = event => { event.preventDefault(); element.setPointerCapture(event.pointerId);
    touch.add(element.dataset.key!); element.classList.add('held'); if (!started) start(); };
  element.onpointerup = clear; element.onpointercancel = clear; element.onlostpointercapture = clear;
}
new ResizeObserver(() => { renderer.resize(); draw(); }).observe(canvas);
Object.assign(window, {
  render_game_to_text: () => JSON.stringify({ mode: 'street-lab', started, paused, automatic, controls,
    coordinates: 'progress/lateral:mm; speed:mm/tick at30Hz; clockwise yaw:microturn; ranks1-based',
    objectBitOrder: session?.bundle.objects.map(object => object.id) ?? [],
    state: session?.state ?? null, error, stepMs, musicPlaying: !audio.paused, drivingSound: engine.driveState, proofQualified: false }),
  advanceTime: (milliseconds: number) => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 300000) throw new Error('Invalid lab time step.');
    manual = true; accumulator += milliseconds;
    while (accumulator >= 1000 / 30) { advance(); accumulator -= 1000 / 30; time += 1 / 30; }
    draw();
  },
});
try {
  const [route, musicUrl] = await Promise.all([loadStreetRoute('tokyo-1986'), loadStreetRouteMusic('tokyo-1986')]);
  audio.src = musicUrl;
  session = new StreetRaceSession(route.bundle);
  for (const id of ['start', 'pause', 'reset', 'auto', 'download']) button(id).disabled = false;
  status.innerHTML = '東京、走ろう。<small>Eight cars · Native arithmetic · Local practice</small>';
  draw(); requestAnimationFrame(frame);
} catch (failure) { error = String(failure); status.textContent = error; console.error(failure); }
