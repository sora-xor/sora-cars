import test from 'node:test';
import assert from 'node:assert/strict';
import { readSceneReadiness, sceneDownloadPresentation } from '../src/ui/scene-preparation';

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

const downloading = { loadedBytes: 5_000_000, totalBytes: 20_000_000, completed: 2, total: 8, active: 3, failed: 0, retrying: false };
const loading = { status: 'loading' as const, message: '' };

test('download progress reflects received bytes and current file counts', () => {
  const state = sceneDownloadPresentation(downloading, loading);
  assert.equal(state.phase, 'downloading');
  assert.equal(state.fraction, .25);
  assert.match(state.detail, /5\.0 MB \/ 20\.0 MB/);
  assert.match(state.detail, /2 \/ 8/);
  assert.match(state.hint, /Current downloads/);
});

test('unknown download sizes and graphics preparation never present a made-up percentage', () => {
  assert.equal(sceneDownloadPresentation({ ...downloading, totalBytes: 0 }, loading).fraction, null);
  const downloaded = { ...downloading, loadedBytes: 20_000_000, completed: 8, active: 0 };
  const preparing = sceneDownloadPresentation(downloaded, loading);
  assert.equal(preparing.phase, 'preparing');
  assert.equal(preparing.fraction, null, 'all downloads finishing is not renderer readiness');
  assert.equal(sceneDownloadPresentation(downloaded, { status: 'ready', message: '' }).fraction, 1);
  assert.equal(sceneDownloadPresentation({ ...downloaded, completed: 7, active: 1 }, loading).fraction, null, 'never round active downloads up to 100% readiness');
});

test('retrying is distinct from failure, and a failed scene cannot appear ready', () => {
  const retry = sceneDownloadPresentation({ ...downloading, retrying: true }, loading);
  assert.equal(retry.phase, 'retrying');
  assert.match(retry.hint, /Retrying/);
  const failed = sceneDownloadPresentation({ ...downloading, loadedBytes: 20_000_000, completed: 8, active: 0 }, { status: 'failed', message: '' });
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.fraction, null);
  assert.match(failed.hint, /Reload/);
});
