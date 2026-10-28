import { MultiplayerRaceController } from '../src/network/controller';
import type { MultiplayerConfig } from '../src/network/controller';
import { RaceRenderer } from '../src/game/renderer';
import { RacePresentation } from '../src/game/presentation';
import { RaceSpectator } from '../src/network/spectator';
import type { RaceScope } from '../src/network/session';
const renderer = new RaceRenderer(document.querySelector('#mesh-race')!);
window.addEventListener('resize', () => renderer.resize());
const presentation = new RacePresentation();
let active: MultiplayerRaceController | null = null, ownSlot = 0, capturedControls = 0;
let spectator: RaceSpectator | null = null;
let rafCount = 0, renderCount = 0, capturedInputCount = 0;
let drawTotalMs = 0, drawMaxMs = 0, drawLastMs = 0;
let lastRafTimestampMs: number | null = null;
Object.assign(globalThis, {
  getMeshRenderStats: () => ({
    sampledAtMs: performance.now(), rafCount, renderCount,
    drawTotalMs, drawMaxMs, drawLastMs, lastRafTimestampMs,
    visibilityState: document.visibilityState, hidden: document.hidden,
    capturedInputCount, capturedControls,
  }),
  makeRaceController: (config: MultiplayerConfig) => {
    ownSlot = config.slot; capturedControls = 0; capturedInputCount = 0;
    active = new MultiplayerRaceController({ ...config, input: () => {
      // Capture once at the controller's input cadence. Rendering must never
      // consume a second value from a caller's possibly stateful input source.
      capturedControls = config.input();
      capturedInputCount++;
      return capturedControls;
    } });
    return active;
  },
  makeRaceSpectator: (scope: RaceScope) => { spectator = new RaceSpectator(scope); return spectator; },
});
function timedDraw(...args: Parameters<RaceRenderer['draw']>): void {
  const started = performance.now();
  try {
    renderer.draw(...args);
    renderCount++; // Completed draws; errors still propagate to the page.
  } finally {
    drawLastMs = performance.now() - started;
    drawTotalMs += drawLastMs;
    drawMaxMs = Math.max(drawMaxMs, drawLastMs);
  }
}
function frame(now: number): void {
  rafCount++; lastRafTimestampMs = now;
  if (active) timedDraw(presentation.sample(active.predictedState, now), { playerSlot: ownSlot, appearances: active.appearances, skins: active.state.cars.map(c => c.slot % 6), names: active.state.cars.map(c => c.slot === ownSlot ? 'YOU' : `DRIVER ${c.slot + 1}`), controls: capturedControls, attract: false, hud: true, raceMode: '対戦 / LIVE' }, now / 1000);
  else if (spectator) timedDraw(presentation.sample(spectator.state, now), { playerSlot: 0, appearances: spectator.appearances, skins: spectator.state.cars.map(c => c.slot % 6), names: spectator.state.cars.map(c => `ドライバー ${c.slot + 1}`), attract: false, hud: true, raceMode: '観戦 / SPECTATOR' }, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
