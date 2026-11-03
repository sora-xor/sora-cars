import test from 'node:test';
import assert from 'node:assert/strict';
import { readSceneReadiness } from '../src/ui/scene-preparation';

const complete = {
  renderer: 'webgl-3d', carAsset: 'detailed', sceneryAsset: 'detailed',
  lightingAsset: 'detailed', understoryAsset: 'detailed', groundAsset: 'detailed', shaderAsset: 'detailed',
};
const assets = ['carAsset', 'sceneryAsset', 'lightingAsset', 'understoryAsset', 'groundAsset', 'shaderAsset'] as const;
const canvas = (dataset: Record<string, string | undefined>) => ({ dataset }) as unknown as HTMLCanvasElement;

test('preparation needs a 3D renderer and every asset group, including the current ground', () => {
  assert.equal(readSceneReadiness(canvas({})).status, 'loading');
  assert.equal(readSceneReadiness(canvas(complete)).status, 'ready');
  for (const renderer of [undefined, '', 'canvas-2d']) {
    assert.equal(readSceneReadiness(canvas({ ...complete, renderer })).status, 'loading');
  }
  for (const asset of assets) for (const state of [undefined, 'loading', 'unknown']) {
    assert.equal(readSceneReadiness(canvas({ ...complete, [asset]: state })).status, 'loading', `${asset}: ${state}`);
  }
});

test('a failed asset wins over another asset still loading', () => {
  for (const asset of assets) {
    const data = { ...complete, carAsset: 'loading', [asset]: 'failed' };
    assert.equal(readSceneReadiness(canvas(data)).status, 'failed', asset);
  }
  assert.equal(readSceneReadiness(canvas({ ...complete, renderer: 'failed' })).status, 'failed');
});

test('the compatibility renderer cannot pass using stale detailed-asset flags', () => {
  const state = readSceneReadiness(canvas({ ...complete, renderer: 'canvas-compatibility' }));
  assert.equal(state.status, 'failed');
  assert.match(state.message, /3D/);
});

test('readiness follows the current frame and never mutates or caches the dataset', () => {
  const data: Record<string, string | undefined> = { ...complete };
  const target = canvas(data), before = { ...data };
  assert.equal(readSceneReadiness(target).status, 'ready');
  assert.deepEqual(data, before);
  data.groundAsset = 'loading';
  assert.equal(readSceneReadiness(target).status, 'loading', 'a new course must prepare its own ground');
  data.groundAsset = 'failed';
  assert.equal(readSceneReadiness(target).status, 'failed');
  data.groundAsset = 'detailed';
  assert.equal(readSceneReadiness(target).status, 'ready');
});
