import { installNativeGeneratorLauncher } from './helpers/native-generator-launcher.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { generateNative, nativeGenerationOptions, validateNativeExports } from '../scripts/generate-native.mjs';
import { nativeSourceRoot } from '../scripts/lib/native-source-root.mjs';
import { NATIVE_KERNEL_SOURCES, NATIVE_PROFILE_SOURCES, NATIVE_SOURCE_PATHS } from '../scripts/lib/native-sources.mjs';
import originalKernels from '../src/game/generated/race-v1-kernels.json';
import originalParity from './fixtures/native-race-v1.json';

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const paths = { 'race-v1-kernels.json': 'src/game/generated/race-v1-kernels.json', 'native-race-v1.json': 'tests/fixtures/native-race-v1.json', 'provenance.json': 'src/game/generated/provenance.json' };
async function fixture(t: { after: (fn: () => Promise<void>) => void }, behavior = '') {
  const root = await mkdtemp(join(tmpdir(), 'sora-native-generator-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appRoot = join(root, 'app'), nativeRoot = join(root, 'native'), binary = join(nativeRoot, 'target/debug/iroha');
  await mkdir(join(appRoot, 'output'), { recursive: true });
  const kernels = structuredClone(originalKernels), parity = structuredClone(originalParity);
  const hashes: Record<string, string> = {};
  for (const name of NATIVE_SOURCE_PATHS) {
    const path = join(nativeRoot, name), text = `test-only source: ${name}`;
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, text);
    hashes[name] = digest(text);
  }
  kernels.profile_sources = Object.fromEntries(NATIVE_PROFILE_SOURCES.map(name => [name, hashes[name]!])) as typeof kernels.profile_sources;
  for (const name of NATIVE_KERNEL_SOURCES) (kernels.sources as Record<string, string>)[name] = hashes[`crates/iroha_core/src/execution_proofs/${name}`]!;
  parity.kernelSha256 = kernels.sources['race.rs'];
  await writeFile(join(nativeRoot, 'kernels.json'), JSON.stringify(kernels));
  await writeFile(join(nativeRoot, 'parity.json'), JSON.stringify(parity));
  await mkdir(dirname(binary), { recursive: true });
  await installNativeGeneratorLauncher(nativeRoot);
  // This executable is an explicitly synthetic subprocess fixture, never native evidence.
  await writeFile(binary, `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nif (args.slice(0,3).join(' ') !== '--machine app execution' || args[4] !== '--output-file') process.exit(19);\nconst command = args[3];\nconst bytes = fs.readFileSync(command === 'export-kernels' ? 'kernels.json' : 'parity.json');\nfs.writeFileSync(args[5], bytes);\n${behavior}\n`);
  await chmod(binary, 0o755);
  for (const [name, relative] of Object.entries(paths)) { const path = join(appRoot, relative); await mkdir(dirname(path), { recursive: true }); await writeFile(path, `old:${name}`); }
  const options = { appRoot, nativeRoot, binary, evidenceDir: join(appRoot, 'output/attempt'), expectedCliSha256: digest(await readFile(binary)), install: false };
  return { options, kernels, parity };
}
async function assertUnchanged(appRoot: string) {
  for (const [name, relative] of Object.entries(paths)) assert.equal(await readFile(join(appRoot, relative), 'utf8'), `old:${name}`);
}

test('native generation requires explicit absolute root, executable, fresh evidence path and independent digest', () => {
  const env = { SORA_CARS_IROHA_ROOT: '/native', SORA_CARS_IROHA_CLI: '/native/target/debug/iroha', SORA_CARS_NATIVE_EXPORT_DIR: '/app/output/attempt', SORA_CARS_IROHA_CLI_SHA256: 'a'.repeat(64) };
  assert.equal(nativeGenerationOptions(env, []).install, false);
  assert.equal(nativeGenerationOptions(env, ['--install']).install, true);
  for (const key of Object.keys(env)) assert.throws(() => nativeGenerationOptions({ ...env, [key]: 'relative' }, []));
  assert.throws(() => nativeGenerationOptions(env, ['--install', '--install']), /Usage/);
});

test('native catalog validation rejects duplicate grids, missing duration and unbound rules', () => {
  validateNativeExports(originalKernels, originalParity);
  const duplicate = structuredClone(originalKernels); duplicate.kernels[20] = duplicate.kernels[19]!;
  assert.throws(() => validateNativeExports(duplicate, originalParity), /grid/);
  const short = structuredClone(originalParity); short.fixtures[6]!.inputs.pop();
  assert.throws(() => validateNativeExports(originalKernels, short), /full-duration/);
  const mismatch = { ...originalParity, rulesHash: '0'.repeat(64) };
  assert.throws(() => validateNativeExports(originalKernels, mismatch), /identity mismatch/);
});

test('native export stages immutable evidence without installing and refuses attempt reuse', async t => {
  const { options } = await fixture(t);
  const result = await generateNative(options);
  assert.equal(result.status, 'passed'); assert.equal(result.installed, false);
  await assertUnchanged(options.appRoot);
  const reportBytes = await readFile(join(options.evidenceDir, 'report.json'));
  const report = JSON.parse(reportBytes.toString());
  assert.equal(report.commands.length, 2); assert.equal(report.cryptographicQualification, false);
  const before = JSON.parse(await readFile(join(options.evidenceDir, 'sources-before.json'), 'utf8'));
  const after = JSON.parse(await readFile(join(options.evidenceDir, 'sources-after.json'), 'utf8'));
  assert.deepEqual(Object.keys(before), [...NATIVE_SOURCE_PATHS]);
  assert.deepEqual(after, before);
  for (const command of report.commands) { assert.ok(command.pid > 0); assert.equal(command.exitCode, 0); assert.equal(command.signal, null); }
  await assert.rejects(generateNative(options), /EEXIST/);
  assert.deepEqual(await readFile(join(options.evidenceDir, 'report.json')), reportBytes);
});

test('native export installs byte-identical retained artifacts only after validation and retains previous files', async t => {
  const { options } = await fixture(t);
  const report = await generateNative({ ...options, install: true });
  assert.equal(report.installed, true);
  for (const [name, relative] of Object.entries(paths)) {
    assert.deepEqual(await readFile(join(options.appRoot, relative)), await readFile(join(options.evidenceDir, name)));
    assert.equal(await readFile(join(options.evidenceDir, 'previous', name), 'utf8'), `old:${name}`);
  }
  assert.equal(JSON.parse(await readFile(join(options.evidenceDir, 'provenance.json'), 'utf8')).cryptographicQualification, false);
  await assert.rejects(access(join(options.appRoot, 'output/.native-generation-install.lock')));
});

test('native export rejects a different executable before spawning or installation', async t => {
  const { options } = await fixture(t);
  await assert.rejects(generateNative({ ...options, install: true, expectedCliSha256: '0'.repeat(64) }), /CLI digest/);
  await assertUnchanged(options.appRoot);
  const report = JSON.parse(await readFile(join(options.evidenceDir, 'report.json'), 'utf8'));
  assert.equal(report.commands.length, 0); assert.equal(report.status, 'failed');
});

test('native export rejects stale full verifier sources before the parity command or installation', async t => {
  const { options, kernels } = await fixture(t);
  kernels.profile_sources['crates/iroha_data_model/src/game.rs'] = '0'.repeat(64);
  await writeFile(join(options.nativeRoot, 'kernels.json'), JSON.stringify(kernels));
  await assert.rejects(generateNative({ ...options, install: true }), /CLI is stale/);
  await assertUnchanged(options.appRoot);
  assert.equal(JSON.parse(await readFile(join(options.evidenceDir, 'report.json'), 'utf8')).commands.length, 1);
});

test('native export rejects changes to the selected CLI during its own export', async t => {
  const { options } = await fixture(t, `fs.appendFileSync('target/debug/iroha', '// changed executable');`);
  await assert.rejects(generateNative({ ...options, install: true }), /CLI digest/);
  await assertUnchanged(options.appRoot);
});

test('native export rejects source drift during export without replacing existing artifacts', async t => {
  const { options } = await fixture(t, `fs.appendFileSync('crates/iroha_data_model/src/game.rs', '\\nchanged');`);
  await assert.rejects(generateNative({ ...options, install: true }), /sources changed/);
  await assertUnchanged(options.appRoot);
});

test('native export rejects browser arithmetic drift during export without replacing existing artifacts', async t => {
  const { options } = await fixture(t, `fs.appendFileSync('crates/iroha_core/src/execution_proofs/environment_air.rs', '\\nchanged');`);
  await assert.rejects(generateNative({ ...options, install: true }), /sources changed/);
  await assertUnchanged(options.appRoot);
  assert.equal(JSON.parse(await readFile(join(options.evidenceDir, 'report.json'), 'utf8')).commands.length, 1);
});

test('native export preserves invalid native output and rejects installation after the second command', async t => {
  const { options, parity } = await fixture(t);
  parity.fixtures[20] = parity.fixtures[19]!;
  const invalid = JSON.stringify(parity); await writeFile(join(options.nativeRoot, 'parity.json'), invalid);
  await assert.rejects(generateNative({ ...options, install: true }), /grid/);
  await assertUnchanged(options.appRoot);
  assert.equal(await readFile(join(options.evidenceDir, 'native-race-v1.json'), 'utf8'), invalid);
  assert.equal(JSON.parse(await readFile(join(options.evidenceDir, 'report.json'), 'utf8')).commands.length, 2);
});

test('native source checks follow the isolated SDK checkout and reject relative overrides', () => {
  if (process.env.SORA_CARS_IROHA_ROOT === undefined) assert.match(nativeSourceRoot(), /\/iroha-sora-cars-native\/?$/);
  else assert.equal(nativeSourceRoot(), resolve(process.env.SORA_CARS_IROHA_ROOT));
  assert.equal(nativeSourceRoot('/selected/native/../native'), '/selected/native');
  assert.throws(() => nativeSourceRoot('../iroha'), /absolute/);
  assert.throws(() => nativeSourceRoot(''), /absolute/);
});

test('native installer preserves another writer’s changed destination', async t => {
  const { options } = await fixture(t, `fs.writeFileSync('../app/src/game/generated/provenance.json', 'other writer');`);
  await assert.rejects(generateNative({ ...options, install: true }), /destination changed/);
  assert.equal(await readFile(join(options.appRoot, paths['provenance.json']), 'utf8'), 'other writer');
  for (const name of ['race-v1-kernels.json', 'native-race-v1.json'] as const) assert.equal(await readFile(join(options.appRoot, paths[name]), 'utf8'), `old:${name}`);
});

test('native installer refuses an existing installation lock without removing it', async t => {
  const { options } = await fixture(t);
  const lock = join(options.appRoot, 'output/.native-generation-install.lock');
  await writeFile(lock, 'retained unexplained lock');
  await assert.rejects(generateNative({ ...options, install: true }), /EEXIST/);
  await assertUnchanged(options.appRoot);
  assert.equal(await readFile(lock, 'utf8'), 'retained unexplained lock');
});
