import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packageStreetAssets } from '../scripts/package-street-assets.ts';

const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
import { streetGenerationFixture as fixture } from './helpers/street-generation-fixture';
const rewrite = (root: string, generation: string, manifest: any) => writeFile(join(root, generation), JSON.stringify(manifest));
async function noPublication(root: string) { await assert.rejects(access(join(root, 'public')), { code: 'ENOENT' }); }

test('packages the exact selected fresh generation path with relative content-addressed assets', async () => {
  await fixture(async (root, _manifest, generation, bundle) => {
    const result = await packageStreetAssets(root, generation);
    assert.equal(result.bundleSha256, hash(bundle)); assert.equal(result.bundleBytes, bundle.length);
    assert.deepEqual(await readFile(join(root, 'public', result.bundlePath)), bundle);
    assert.equal((await readFile(join(root, 'public', result.musicPath))).toString(), 'test-only music');
    assert.match(await readFile(join(root, 'src/game/street/asset-manifest.ts'), 'utf8'), new RegExp(result.bundleSha256));
    assert.ok(!result.bundlePath.startsWith('/') && !result.musicPath.startsWith('/'));
  });
});

test('changed producer or selected bundle never publishes', async () => {
  for (const target of ['source', 'bundle']) await fixture(async (root, manifest, generation) => {
    await writeFile(join(root, target === 'source' ? 'scripts/fixture.ts' : manifest.bundles[6].path), 'changed');
    await assert.rejects(packageStreetAssets(root, generation), target === 'source' ? /Producer differs/ : /differs/);
    await noPublication(root);
  });
});

test('changed selected native layout rejects stale app copies and manifest', async () => {
  await fixture(async (root, _manifest, generation) => {
    await writeFile(join(root, 'native/crates/iroha_data_model/src/street_v1/layout.rs'), 'new-layout');
    await assert.rejects(packageStreetAssets(root, generation), /Selected native source differs/); await noPublication(root);
  });
});

test('bundle producer inventory must match generation even with recomputed bundle digest', async () => {
  await fixture(async (root, manifest, generation, bundle) => {
    const data = JSON.parse(bundle.toString()); data.sources = { 'scripts/other.rs': hash('other') };
    const changed = Buffer.from(JSON.stringify(data)); await writeFile(join(root, manifest.bundles[6].path), changed);
    Object.assign(manifest.bundles[6], { bytes: changed.length, sha256: hash(changed) }); await rewrite(root, generation, manifest);
    await assert.rejects(packageStreetAssets(root, generation), /Producer inventory or bundle structure differs/); await noPublication(root);
  });
});

test('malformed, incomplete and ambiguous generation manifests fail before publication', async () => {
  const mutations = [
    (m: any) => { m.version = 2; }, (m: any) => { m.sources = null; }, (m: any) => { m.extra = true; },
    (m: any) => { delete m.native; }, (m: any) => { m.bundles.pop(); },
    (m: any) => { m.bundles[0].roster = 8; }, (m: any) => { m.bundles[6].bytes = -1; },
    (m: any) => { m.bundles[6].sha256 = '00'; }, (m: any) => { m.qualification.proof = true; },
    (m: any) => { m.bundles[6].path = 'output/elsewhere/foreign.json'; },
    (m: any) => { m.bundles[6].path = 'output/fresh generation/../foreign.json'; },
  ];
  for (const mutate of mutations) await fixture(async (root, manifest, generation) => {
    mutate(manifest); await rewrite(root, generation, manifest);
    await assert.rejects(packageStreetAssets(root, generation)); await noPublication(root);
  });
});

test('missing selected artifact cannot fall back to the retired output/street-race path', async () => {
  await fixture(async (root, manifest, generation, bundle) => {
    await mkdir(join(root, 'output/street-race'), { recursive: true });
    await writeFile(join(root, 'output/street-race/tokyo-1986-8.json'), bundle);
    await rm(join(root, manifest.bundles[6].path));
    await assert.rejects(packageStreetAssets(root, generation), { code: 'ENOENT' }); await noPublication(root);
  });
});

test('packaging CLI requires explicit generation and accepts its path as one argument', async () => {
  await fixture(async (root, _manifest, generation, bundle) => {
    const script = fileURLToPath(new URL('../scripts/package-street-assets.ts', import.meta.url));
    const tsx = resolve('node_modules/tsx/dist/cli.mjs');
    const missing = spawnSync(process.execPath, [tsx, script], { cwd: root, encoding: 'utf8' });
    assert.notEqual(missing.status, 0); assert.match(missing.stderr, /Use --generation/); await noPublication(root);
    const applied = spawnSync(process.execPath, [tsx, script, '--generation', generation], { cwd: root, encoding: 'utf8' });
    assert.equal(applied.status, 0, applied.stderr); assert.equal(JSON.parse(applied.stdout).bundleSha256, hash(bundle));
  });
});
