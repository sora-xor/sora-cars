import generated from './generated/race-v1-kernels.json';
import { createNativeRaceExecutor } from './kernel-runtime';

/** Stock RaceV1 selects its exact native control, weather and arithmetic catalog. */
export const executeRaceKernel = createNativeRaceExecutor(generated);
