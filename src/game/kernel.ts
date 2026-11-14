import generated from './generated/race-v1-kernels.json';
import { createNativeRaceExecutor } from './kernel-runtime';

/** RaceV1's kernel layout: the real roads of 1986, at most 8,100 ticks. */
export const RACE_KERNEL_LAYOUT = Object.freeze({ maxTicks: 8100, realRoads: true });
/** Stock RaceV1 selects its exact native control, weather and arithmetic catalog, on the real roads of 1986. */
export const executeRaceKernel = createNativeRaceExecutor(generated, RACE_KERNEL_LAYOUT);
