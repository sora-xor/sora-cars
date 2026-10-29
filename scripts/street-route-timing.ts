import { loadStreetGeneration, streetGenerationArgument } from './lib/street-generation';
import { StreetRaceSession } from '../src/game/street/session';
import { streetDriver } from '../src/game/street/test-driver';

/** Pace a route with the practice field: eight computer drivers on the native
 * graph, as in the game. Synthetic driving evidence only, not human pacing. */
const generation = await loadStreetGeneration(process.cwd(), streetGenerationArgument(process.argv.slice(2)));
const { bundle } = await generation.readBundle(8);
const session = new StreetRaceSession(bundle);
let wallTicks = 0;
const started = performance.now();
while (!session.state.done) {
  const state = session.state;
  session.step(state.cars.map((_, slot) => streetDriver(bundle.track, state, slot)));
  wallTicks += session.state.cars.filter(car => car.status === 0 && car.wallContact === 1).length;
}
const state = session.state, seconds = (tick: number) => (tick / 30).toFixed(1);
const finishes = state.cars.map(car => car.status === 1 ? car.finishTick : null);
const finished = finishes.filter((tick): tick is number => tick !== null).sort((a, b) => a - b);
console.log(JSON.stringify({ route: bundle.track.id, lengthKm: bundle.track.lengthMm * bundle.track.laps / 1e6,
  maxTicks: bundle.track.maxTicks, finished: finished.length, dnf: finishes.length - finished.length,
  winnerSeconds: finished[0] !== undefined ? Number(seconds(finished[0])) : null,
  lastSeconds: finished.length ? Number(seconds(finished.at(-1)!)) : null,
  finishSeconds: finishes.map(tick => tick === null ? null : Number(seconds(tick))),
  carWallContactTicks: wallTicks, simulationSeconds: Number(((performance.now() - started) / 1000).toFixed(1)) }, null, 2));
