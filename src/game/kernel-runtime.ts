import { setEnvironmentContacts, type EnvironmentContact } from './environment-events';
import type { RaceState } from './engine';

/** State-producing slices of a reviewed native arithmetic relation. This module
 * executes bundled build artifacts only; it does not admit downloaded programs.
 * Constraint-only witnesses are omitted by the native exporter, never here.
 */
export interface NativeRaceKernel {
  track: number; player_count: number; input_count: number; fixed_count: number;
  control_table: number[][]; nodes: number[][]; outputs: number[][]; events: number[][];
}
export interface NativeRaceKernelCatalog {
  version: number; fixed_prefix: number; kernels: NativeRaceKernel[];
  environment: {
    length_mm: number; rain_pattern: number[]; wind_pattern: number[];
    rain_ticks: number; wind_ticks: number; wind_strength: number;
  }[];
}

function validateCatalog(catalog: NativeRaceKernelCatalog): void {
  const fail = () => { throw new Error('Invalid bundled native racing circuit'); };
  if (catalog.version !== 1 || catalog.fixed_prefix !== 9 || catalog.kernels.length !== 21 || catalog.environment.length !== 3) fail();
  for (const env of catalog.environment) {
    if (!Number.isSafeInteger(env.length_mm) || env.length_mm <= 0
      || !Number.isSafeInteger(env.rain_ticks) || env.rain_ticks <= 0
      || !Number.isSafeInteger(env.wind_ticks) || env.wind_ticks <= 0
      || !Number.isSafeInteger(env.wind_strength) || Math.abs(env.wind_strength) > 320
      || !env.rain_pattern.length || env.rain_pattern.some(v => v !== 0 && v !== 1)
      || !env.wind_pattern.length || env.wind_pattern.some(v => !Number.isSafeInteger(v) || Math.abs(v) > 8)) fail();
  }
  for (const [index, kernel] of catalog.kernels.entries()) {
    const players = index % 7 + 2;
    if (kernel.track !== Math.floor(index / 7) || kernel.player_count !== players
      || kernel.input_count !== players * 7 || kernel.fixed_count !== 9 + players * 4
      || kernel.outputs.length !== players * 7 || kernel.events.length !== players * 3
      || kernel.control_table.length !== 64 || kernel.control_table.some(row => row.length !== 3 || row.some(v => !Number.isSafeInteger(v)))) fail();
    const ref = (pair: readonly number[], before: number) => {
      const [kind, value] = pair;
      if (pair.length !== 2 || !Number.isSafeInteger(value) || !Number.isInteger(kind) || kind! < 0 || kind! > 3) fail();
      if (kind !== 0 && (value! < 0 || value! >= (kind === 1 ? kernel.fixed_count : kind === 2 ? before : kernel.input_count))) fail();
    };
    kernel.nodes.forEach((node, before) => {
      const op = node[0]!;
      if (!Number.isInteger(op) || op < 0 || op > 8 || node.length !== (op === 3 ? 7 : 5)) fail();
      ref(node.slice(1, 3), before); ref(node.slice(3, 5), before);
      if (op === 3) ref(node.slice(5, 7), before);
      // Native division and digit extraction use positive constant divisors.
      if ((op === 4 || op === 5) && (node[3] !== 0 || node[4]! <= 0)) fail();
      if ((op === 6 || op === 7) && (node[3] !== 0 || node[4]! < 0 || node[4]! > 52)) fail();
    });
    [...kernel.outputs, ...kernel.events].forEach(pair => ref(pair, kernel.nodes.length));
  }
}

/** Each compiled relation owns its scratch buffers, weather and control table.
 * Sharing the interpreter cannot substitute one class's parameters for another.
 */
export function createNativeRaceExecutor(catalog: NativeRaceKernelCatalog): (state: RaceState, controls: readonly number[]) => void {
  validateCatalog(catalog);
  const kernels = catalog.kernels;
  const scratch = kernels.map(kernel => ({
    inputs: new Float64Array(kernel.input_count), fixed: new Float64Array(kernel.fixed_count),
    values: new Float64Array(kernel.nodes.length),
  }));

  return function executeNativeRaceKernel(state: RaceState, controls: readonly number[]): void {
    if (!Number.isInteger(state.trackId) || state.trackId < 0 || state.trackId > 2
      || state.cars.length < 2 || state.cars.length > 8 || !Number.isInteger(state.tick) || state.tick < 0 || state.tick >= 5400
      || controls.length !== state.cars.length || controls.some(v => !Number.isInteger(v) || v < 0 || v > 63)) throw new RangeError('Invalid native race kernel input');
    const index = state.trackId * 7 + state.cars.length - 2;
    const kernel = kernels[index], work = scratch[index];
    if (!kernel || kernel.track !== state.trackId || kernel.player_count !== state.cars.length) throw new RangeError('Unsupported compiled native racing kernel');
    const { inputs, fixed, values } = work;
    const environment = catalog.environment[state.trackId]!;
    const weather = {
      rain: environment.rain_pattern[Math.floor(state.tick / environment.rain_ticks) % environment.rain_pattern.length]!,
      wind: environment.wind_pattern[Math.floor(state.tick / environment.wind_ticks) % environment.wind_pattern.length]! * environment.wind_strength,
    };
    fixed.set([state.tick, 1, Number(state.tick === 0), 1, 0, 0, Number(state.tick % 6 === 0), weather.rain, weather.wind]);
    for (let slot = 0; slot < state.cars.length; slot++) {
      const car = state.cars[slot]!;
      inputs.set([car.progress, car.x, car.speed, car.vx, car.energy, car.finishTick ?? 0, car.dnfTick === null ? 0 : car.dnfTick + 1], slot * 7);
      fixed.set([...kernel.control_table[controls[slot]!]!, 0], catalog.fixed_prefix + slot * 4);
    }
    const operand = (kind: number, value: number): number => kind === 0 ? value : kind === 1 ? fixed[value]! : kind === 2 ? values[value]! : inputs[value]!;
    for (let index = 0; index < kernel.nodes.length; index++) {
      const node = kernel.nodes[index]!, a = operand(node[1]!, node[2]!), b = operand(node[3]!, node[4]!);
      let value: number;
      switch (node[0]) {
        case 0: value = a + b; break;
        case 1: value = a - b; break;
        case 2: value = a * b; break;
        case 3: value = a === 0 ? operand(node[5]!, node[6]!) : b; break;
        case 4: value = Math.trunc(a / b); break;
        case 5: value = a % b; break;
        case 6: value = Math.floor(a / 2 ** b) % 2; break;
        case 7: value = Math.floor(a / 2 ** b) % 4; break;
        case 8: value = Number(a === b); break;
        default: throw new Error('Unknown generated circuit opcode');
      }
      values[index] = value === 0 ? 0 : value;
    }
    const contacts: EnvironmentContact[] = [];
    for (let slot = 0; slot < state.cars.length; slot++) {
      const car = state.cars[slot]!, out = (field: number) => { const ref = kernel.outputs[slot * 7 + field]!; return operand(ref[0]!, ref[1]!); };
      const event = (field: number) => { const ref = kernel.events[slot * 3 + field]!; return operand(ref[0]!, ref[1]!); };
      if (event(0) || event(1)) {
        const length = environment.length_mm;
        const wrapped = ((car.progress % length) + length) % length;
        const objectId = Math.floor(car.progress / length) * 12 + Math.floor(wrapped * 12 / length);
        const kind = (['tree', 'sign', 'oil'] as const)[event(2)]!;
        contacts.push({ tick: state.tick, slot, kind, objectId });
      }
      car.progress = out(0); car.x = out(1); car.speed = out(2); car.vx = out(3); car.energy = out(4);
      car.finishTick = out(5) || null; car.dnfTick = out(6) === 0 ? null : out(6) - 1; car.dnf = car.dnfTick !== null;
    }
    setEnvironmentContacts(state, contacts);
    state.tick++;
  };
}
