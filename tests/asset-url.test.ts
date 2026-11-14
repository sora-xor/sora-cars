import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARCHIVE_ORIGIN, archivedAssetPaths, resolveAssetPath } from '../src/asset-url';

test('only exact retained catalog paths move to the immutable native publication', () => {
  const path = 'assets/music/audio/midnight-transistor.wav';
  assert.ok(archivedAssetPaths[path]);
  assert.equal(resolveAssetPath(path, './', true), `${ARCHIVE_ORIGIN}/${path}`);
  assert.equal(resolveAssetPath(path, '/sorafs/cid/local/', false), `/sorafs/cid/local/${path}`);
  for (const path of ['assets/drive-optimized/v1/models/sora-ae86/ae86.glb', 'assets/music/audio/new-song.wav', 'assets/music/../story/new.png', 'v1/transactions']) {
    assert.equal(resolveAssetPath(path, './', true), `./${path}`);
  }
});

test('lossless startup derivatives take precedence over retained originals', () => {
  const hero = 'assets/story/angles/garage-wide-v2.png';
  assert.ok(archivedAssetPaths[hero]);
  for (const reuse of [false, true]) {
    assert.equal(resolveAssetPath(hero, './', reuse), './assets/startup-optimized/v1/story/angles/garage-wide-v2.webp');
    assert.equal(resolveAssetPath('assets/sprites/street-people.png', '/release/', reuse), '/release/assets/startup-optimized/v1/sprites/street-people.webp');
  }
  const unchanged = 'assets/story/angles/garage-bench.png';
  const anotherArchivedStory = Object.keys(archivedAssetPaths).find(path => path.startsWith('assets/story/') && path !== hero)!;
  assert.equal(resolveAssetPath(anotherArchivedStory, './', true), `${ARCHIVE_ORIGIN}/${anotherArchivedStory}`);
  assert.equal(resolveAssetPath(unchanged + '.unknown', './', true), './' + unchanged + '.unknown');
});
