import { copyRace, rankCars, type RaceState } from './engine';

/** Display competition places: a stable slot order never breaks an exact performance tie. */
export function raceResultPlaces(state: RaceState): Map<number, number> {
  const ranked = rankCars(state), places = new Map<number, number>();
  let place = 1;
  ranked.forEach((car, index) => {
    const previous = ranked[index - 1];
    const tied = previous && (car.dnfTick !== null) === (previous.dnfTick !== null) && (car.finishTick !== null
      ? car.finishTick === previous.finishTick
      : previous.finishTick === null && car.progress === previous.progress);
    if (!tied) place = index + 1;
    places.set(car.slot, place);
  });
  return places;
}

/** Cosmetic interpolation only. No sampled value is fed back into simulation or certificates. */
export class RacePresentation {
  #previous: RaceState | null = null;
  #latest: RaceState | null = null;
  #receivedAt = 0;
  #duration = 1000 / 30;
  reset(): void { this.#previous = null; this.#latest = null; }
  sample(state: RaceState, now: number, immediate = false): RaceState {
    const latest = this.#latest;
    if (immediate || !latest || latest.trackId !== state.trackId || latest.cars.length !== state.cars.length || state.tick < latest.tick) {
      this.#previous = this.#latest = copyRace(state); this.#receivedAt = now; return state;
    }
    const changed = state.tick !== latest.tick || state.cars.some((car, slot) => {
      const before = latest.cars[slot]!;
      return car.progress !== before.progress || car.x !== before.x || car.speed !== before.speed
        || car.vx !== before.vx || car.energy !== before.energy || car.finishTick !== before.finishTick
        || car.dnfTick !== before.dnfTick;
    });
    if (changed) {
      this.#previous = this.#interpolate(now);
      this.#duration = Math.min(200, Math.max(1000 / 30, (state.tick - latest.tick) * 1000 / 30));
      this.#latest = copyRace(state); this.#receivedAt = now;
    }
    return this.#interpolate(now);
  }
  #interpolate(now: number): RaceState {
    const latest = this.#latest!, previous = this.#previous!;
    const alpha = Math.min(1, Math.max(0, (now - this.#receivedAt) / this.#duration));
    const rendered = copyRace(latest);
    for (let slot = 0; slot < rendered.cars.length; slot++) {
      const car = rendered.cars[slot]!, from = previous.cars[slot]!;
      car.progress = from.progress + (car.progress - from.progress) * alpha;
      car.x = from.x + (car.x - from.x) * alpha;
      car.vx = from.vx + (car.vx - from.vx) * alpha;
      // Driving-model headings turn smoothly between ticks, by the short way round.
      if (car.heading !== undefined && from.heading !== undefined) {
        const turn = car.heading - from.heading, short = turn - Math.PI * 2 * Math.round(turn / (Math.PI * 2));
        car.heading = from.heading + short * alpha;
      }
    }
    return rendered;
  }
}
