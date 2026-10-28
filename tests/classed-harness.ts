import { GameAudio } from '../src/game/audio';
import { botControl } from '../src/game/engine';
import { environmentContacts } from '../src/game/environment-events';
import { createTouringRace, copyTouringRace, stepTouringRace, restoreTouringRace, touringDisplayState, touringFinished, touringResult, touringEnvironmentAt, TOURING_PROFILE_ID, TOURING_RULES_HASH } from '../src/game/classed';
import type { ClassedRaceStateV1 } from '@iroha/iroha-js/classed-race';
import { RaceRenderer } from '../src/game/renderer';

const renderer = new RaceRenderer(document.querySelector('#touring-race')!), audio = new GameAudio();
let race = createTouringRace(0, 8), active = false, paused = false, accumulator = 0, elapsed = 0, manual = false;
const keys = new Set<string>();
const controls = () => Number(keys.has('ArrowUp')) | Number(keys.has('ArrowDown')) * 2 | Number(keys.has('ArrowLeft')) * 4 | Number(keys.has('ArrowRight')) * 8 | Number(keys.has('Space')) * 16 | Number(keys.has('ShiftLeft')) * 32;
const sound = () => {
  const car = race.state.cars[0]!;
  if (!active || paused || touringFinished(race) || car.finish_tick !== null || car.dnf_tick !== null) { audio.stopDrive(); return; }
  audio.drive(car.speed_mm_per_tick, true, Boolean(controls() & 32), { controls: controls(), lateral: car.lateral_velocity_mm_per_tick, offroad: Math.abs(car.lateral_mm) > 6000, rain: touringEnvironmentAt(touringDisplayState(race).trackId, race.state.tick).rain });
};
function draw() {
  const state = touringDisplayState(race);
  renderer.draw(state, { playerSlot: 0, names: ['あなた', 'アキ', 'レン', 'メイ', 'ダイチ', 'ユイ', 'ジュン', 'SORA'], skins: [0, 1, 2, 3, 4, 5, 1, 2], controls: controls(), contacts: environmentContacts(state), environment: touringEnvironmentAt(state.trackId, state.tick), hud: true, raceMode: '試走 / TOURING S1' }, elapsed);
}
function update(seconds: number) {
  elapsed += seconds;
  if (active && !paused) {
    accumulator += seconds;
    while (accumulator >= 1 / 30 && !touringFinished(race)) {
      accumulator -= 1 / 30;
      const view = touringDisplayState(race);
      stepTouringRace(race, view.cars.map(car => car.slot === 0 ? controls() : botControl(view, car.slot)));
    }
    if (touringFinished(race)) active = false;
  }
  sound(); draw();
}
document.querySelector('#start-btn')!.addEventListener('click', () => { void audio.unlock().then(() => { active = true; paused = false; document.querySelector('#start-btn')!.setAttribute('hidden', ''); }); });
window.addEventListener('keydown', e => {
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'Escape') { paused = !paused; sound(); return; }
  keys.add(e.code);
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); paused = true; sound(); });
window.addEventListener('resize', () => { renderer.resize(); draw(); });
const read = () => ({ mode: active ? 'race' : touringFinished(race) ? 'results' : 'ready', tick: race.state.tick, profileId: race.profileId, rulesHash: race.rulesHash, classId: race.state.class_id.kind, track: race.state.track.kind, paused, controls: controls(), native: race.state, result: touringResult(race), drivingSound: audio.driveState, contacts: environmentContacts(touringDisplayState(race)) });
Object.assign(window, {
  touringHarness: {
    read,
    create: (track: number) => { audio.stopDrive(); race = createTouringRace(track, 8); active = false; accumulator = 0; paused = false; document.querySelector('#start-btn')!.removeAttribute('hidden'); draw(); },
    restore: (state: ClassedRaceStateV1) => { race = restoreTouringRace(state, TOURING_PROFILE_ID, TOURING_RULES_HASH); draw(); },
    step: (row: number[]) => { stepTouringRace(race, row); draw(); return copyTouringRace(race).state; },
  },
  render_game_to_text: () => JSON.stringify(read()),
  advanceTime: (ms: number) => { manual = true; update(ms / 1000); },
});
let previous = performance.now();
function frame(now: number) { if (!manual) update(Math.min(0.1, (now - previous) / 1000)); previous = now; requestAnimationFrame(frame); }
requestAnimationFrame(frame);
