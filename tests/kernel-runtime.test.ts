import test from 'node:test';
import assert from 'node:assert/strict';
import stock from '../src/game/generated/race-v1-kernels.json';
import { createNativeRaceExecutor, type NativeRaceKernelCatalog } from '../src/game/kernel-runtime';
import { createRace } from '../src/game/engine';

test('generated circuit rejects missing grids, forward witnesses and unsafe divisor metadata', () => {
  const mutations: ((catalog: NativeRaceKernelCatalog) => void)[] = [
    c => { c.kernels.pop(); },
    c => { c.kernels[0]!.track = 1; },
    c => { c.kernels[0]!.events.pop(); },
    c => { c.kernels[0]!.nodes[0] = [0, 2, 0, 0, 1]; },
    c => { c.kernels[0]!.nodes[0] = [4, 0, 1, 0, 0]; },
    c => { c.kernels[0]!.nodes[0] = [6, 0, 1, 0, 53]; },
    c => { c.kernels[0]!.outputs[0] = [3, 14]; },
    c => { c.environment[0]!.rain_ticks = 0; },
    c => { c.environment[0]!.rain_pattern = [2]; },
    c => { c.kernels[0]!.control_table[0]![0] = Number.NaN; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(stock); mutate(candidate);
    assert.throws(() => createNativeRaceExecutor(candidate), /bundled native racing circuit/);
  }
});

test('a direct kernel call rejects malformed controls and coordinates before state mutation', () => {
  const execute = createNativeRaceExecutor(stock);
  for (const row of [[1], [1, -1], [64, 0], [0.5, 0], [Infinity, 0]]) {
    const state = createRace(0, 2), before = structuredClone(state);
    assert.throws(() => execute(state, row), /kernel input/);
    assert.deepEqual(state, before);
  }
  for (const coordinate of [{ tick: -1 }, { tick: 5400 }, { tick: 0.5 }, { trackId: -1 }, { trackId: 3 }]) {
    const state = Object.assign(createRace(0, 2), coordinate), before = structuredClone(state);
    assert.throws(() => execute(state, [1, 1]), /kernel input/);
    assert.deepEqual(state, before);
  }
});
