import { installNativeGeneratorLauncher } from './helpers/native-generator-launcher.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { generateNativeTouring, touringGenerationOptions, validateTouringExports } from '../scripts/generate-native-touring.mjs';
import { CLASSED_NATIVE_KERNEL_SOURCES, CLASSED_NATIVE_PROFILE_SOURCES, verifyClassedNativeSources } from '../scripts/lib/classed-native-sources.mjs';

// This corpus is used only as subprocess/validator test data here. Source qualification and real
// native/browser arithmetic parity belong to the actual native export and tests/classed.test.ts.
const originalKernels = JSON.parse(await readFile(new URL('../src/game/generated/classed-race-v1-kernels.json', import.meta.url), 'utf8'));
const originalParity = JSON.parse(await readFile(new URL('./fixtures/native-classed-race-v1.json', import.meta.url), 'utf8'));
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
// Explicit command-double source metadata, rebuilt from the current closed
// 43-file catalog. The retained arithmetic corpus below remains historical test
// data: this helper makes no current profile, native export or parity claim.
function syntheticKernelCatalog() {
  const kernels = structuredClone(originalKernels);
  kernels.profile_sources = Object.fromEntries(CLASSED_NATIVE_PROFILE_SOURCES.map(path => [path, digest(`test-only source: ${path}`)]));
  kernels.sources = Object.fromEntries(Object.entries(CLASSED_NATIVE_KERNEL_SOURCES).map(([name, path]) => [name, kernels.profile_sources[path]]));
  return kernels;
}
const paths = { 'classed-race-v1-kernels.json': 'src/game/generated/classed-race-v1-kernels.json', 'native-classed-race-v1.json': 'tests/fixtures/native-classed-race-v1.json', 'classed-provenance.json': 'src/game/generated/classed-provenance.json' };
async function fixture(t: { after: (fn: () => Promise<void>) => void }, behavior = '') {
  const root = await mkdtemp(join(tmpdir(), 'sora-touring-generator-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appRoot = join(root, 'app'), nativeRoot = join(root, 'native'), binary = join(nativeRoot, 'target/debug/iroha');
  await mkdir(join(appRoot, 'output'), { recursive: true });
  const kernels = syntheticKernelCatalog(), parity = structuredClone(originalParity);
  for (const name of CLASSED_NATIVE_PROFILE_SOURCES) {
    const path = join(nativeRoot, name), text = `test-only source: ${name}`;
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, text);
    kernels.profile_sources[name] = digest(text);
  }
  for (const [name, path] of Object.entries(CLASSED_NATIVE_KERNEL_SOURCES)) kernels.sources[name] = kernels.profile_sources[path];
  parity.kernelSha256 = kernels.sources['reference.rs'];
  await writeFile(join(nativeRoot, 'kernels.json'), JSON.stringify(kernels));
  await writeFile(join(nativeRoot, 'parity.json'), JSON.stringify(parity));
  await mkdir(dirname(binary), { recursive: true });
  await installNativeGeneratorLauncher(nativeRoot);
  // Explicitly synthetic native command double. Never retain this as real native build evidence.
  await writeFile(binary, `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nif (args.slice(0,3).join(' ') !== '--machine app execution' || args[4] !== '--output-file') process.exit(19);\nconst command = args[3];\nif (!['export-touring-kernels','export-touring-parity'].includes(command)) process.exit(20);\nconst bytes = fs.readFileSync(command === 'export-touring-kernels' ? 'kernels.json' : 'parity.json');\nfs.writeFileSync(args[5], bytes, {flag:'wx'});\n${behavior}\n`);
  await chmod(binary, 0o755);
  for (const [name, relative] of Object.entries(paths)) { const path = join(appRoot, relative); await mkdir(dirname(path), { recursive: true }); await writeFile(path, `old:${name}`); }
  return { options: { appRoot, nativeRoot, binary, evidenceDir: join(appRoot, 'output/attempt'), expectedCliSha256: digest(await readFile(binary)), install: false }, kernels, parity };
}
async function assertUnchanged(appRoot: string) {
  for (const [name, relative] of Object.entries(paths)) assert.equal(await readFile(join(appRoot, relative), 'utf8'), `old:${name}`);
}

test('Touring generation requires explicit root, executable, independent SHA and fresh absolute evidence path', () => {
  const env = { SORA_CARS_IROHA_ROOT: '/native', SORA_CARS_IROHA_CLI: '/native/target/debug/iroha', SORA_CARS_NATIVE_EXPORT_DIR: '/app/output/attempt', SORA_CARS_IROHA_CLI_SHA256: 'a'.repeat(64) };
  assert.equal(touringGenerationOptions(env, []).install, false);
  assert.equal(touringGenerationOptions(env, ['--install']).install, true);
  for (const key of Object.keys(env)) assert.throws(() => touringGenerationOptions({ ...env, [key]: 'relative' }, []));
  assert.throws(() => touringGenerationOptions(env, ['--install', '--install']), /Usage/);
  assert.throws(() => touringGenerationOptions(env, ['--stock']), /Usage/);
});

test('Touring validator rejects substitution, incomplete grids, circuit references and bounded input violations', () => {
  validateTouringExports(originalKernels, originalParity);
  const changes = [
    (k: any, _p: any) => { k.computation = 'RaceV1'; },
    (k: any, _p: any) => { k.class_id.kind = 'stock'; },
    (_k: any, p: any) => { p.profileId = '0'.repeat(64); },
    (_k: any, p: any) => { p.rulesHash = '0'.repeat(64); },
    (_k: any, p: any) => { p.kernelSha256 = '0'.repeat(64); },
    (k: any, _p: any) => { k.kernels[20] = k.kernels[19]; },
    (k: any, _p: any) => { k.kernels[0].nodes[0] = [0, 2, 0, 0, 1]; }, // future/self reference
    (k: any, _p: any) => { k.kernels[0].outputs[0] = [3, 14]; },
    (k: any, _p: any) => { k.kernels[0].nodes[0] = [4, 0, 3, 0, 0]; },
    (k: any, _p: any) => { k.kernels[0].nodes[0] = [7, 0, 3, 0, 53]; },
    (k: any, _p: any) => { k.kernels[0].control_table.pop(); },
    (k: any, _p: any) => { k.kernels[0].initial_inputs[0]++; },
    (k: any, _p: any) => { k.environment[0].rain_ticks = 0; },
    (k: any, _p: any) => { k.environment[0].centers[2] = k.environment[0].centers[1]; },
    (k: any, _p: any) => { delete k.performance.drift_steering; },
    (_k: any, p: any) => { p.fixtures[6].inputs.pop(); },
    (_k: any, p: any) => { p.fixtures[0].inputs[0][0] = 64; },
  ];
  for (const [index, change] of changes.entries()) {
    const kernels = structuredClone(originalKernels), parity = structuredClone(originalParity); change(kernels, parity);
    assert.throws(() => validateTouringExports(kernels, parity), /Invalid native Touring export/, `mutation ${index}`);
  }
});

test('Touring validator preserves every native checksum, DNF boundary, snapshot and terminal result', () => {
  const changes = [
    (p: any) => { p.fixtures[0].state_hashes.pop(); },
    (p: any) => { p.fixtures[0].state_hashes[0] = '0'.repeat(64); },
    (p: any) => { p.fixtures[0].dnfEvents = []; },
    (p: any) => { p.fixtures[1].dnfEvents[1].slots = [0]; },
    (p: any) => { p.fixtures[1].checkpoints.splice(1, 1); },
    (p: any) => { p.fixtures[0].checkpoints[0].cars[0].speed_mm_per_tick = 3301; },
    (p: any) => { p.fixtures[0].result.terminal = false; },
    (p: any) => { p.fixtures[0].result.standings[1] = p.fixtures[0].result.standings[0]; },
    (p: any) => { p.fixtures[0].result.winners = [1]; },
  ];
  for (const [index, change] of changes.entries()) {
    const parity = structuredClone(originalParity); change(parity);
    assert.throws(() => validateTouringExports(originalKernels, parity), /Invalid native Touring export/, `mutation ${index}`);
  }
});

test('Touring validator requires all wet/dry object edges, inactive cars, all 64 controls and AIR events', () => {
  const changes = [
    (p: any) => { p.transitions.pop(); },
    (p: any) => { p.transitions[1] = p.transitions[0]; },
    (p: any) => { p.transitions[0].before.track.kind = 'sakura'; },
    (p: any) => { p.transitions[0].before.cars[0].progress_mm++; },
    (p: any) => { p.transitions[0].events[0][2] = 3; },
    (p: any) => { p.transitions[5].after.cars[0].speed_mm_per_tick--; },
    (p: any) => { p.transitions[72].controls[0] = 1; },
    (p: any) => { p.transitions[72].before.cars[0].boost_energy = 25; },
  ];
  for (const [index, change] of changes.entries()) {
    const parity = structuredClone(originalParity); change(parity);
    assert.throws(() => validateTouringExports(originalKernels, parity), /Invalid native Touring export/, `mutation ${index}`);
  }
});

test('Touring source paths are closed before reads, and kernel source identity must match the full ordered 43-file profile', async () => {
  assert.equal(CLASSED_NATIVE_PROFILE_SOURCES.length, 43);
  const kernels = syntheticKernelCatalog();
  assert.deepEqual(Object.keys(kernels.profile_sources), [...CLASSED_NATIVE_PROFILE_SOURCES]);
  let reads = 0;
  const read = async () => { reads++; return new Uint8Array(); };
  await assert.rejects(verifyClassedNativeSources({ ...kernels, profile_sources: { ...kernels.profile_sources, '../escape': '0'.repeat(64) } }, read), /inventory/);
  await assert.rejects(verifyClassedNativeSources({ ...kernels, sources: { ...kernels.sources, '../escape': '0'.repeat(64) } }, read), /inventory/);
  await assert.rejects(verifyClassedNativeSources({ ...kernels, sources: { ...kernels.sources, 'reference.rs': '0'.repeat(64) } }, read), /identity differs/);
  for (const path of CLASSED_NATIVE_PROFILE_SOURCES) {
    const incomplete = structuredClone(kernels);
    delete incomplete.profile_sources[path];
    await assert.rejects(verifyClassedNativeSources(incomplete, read), /inventory/, `missing source ${path}`);
  }
  assert.equal(reads, 0);
});

test('Touring export stages fresh evidence with exact dedicated commands and refuses reuse', async t => {
  const { options } = await fixture(t); const result = await generateNativeTouring(options);
  assert.equal(result.status, 'passed'); assert.equal(result.installed, false); await assertUnchanged(options.appRoot);
  const bytes = await readFile(join(options.evidenceDir, 'report.json')), report = JSON.parse(bytes.toString());
  assert.equal(report.computation, 'ClassedRaceV1'); assert.equal(report.cryptographicQualification, false);
  assert.deepEqual(report.commands.map((command: any) => command.argv[4]), ['export-touring-kernels', 'export-touring-parity']);
  for (const command of report.commands) { assert.ok(command.pid > 0); assert.equal(command.exitCode, 0); assert.equal(command.signal, null); }
  assert.match(report.generator.lifecycleSha256, /^[0-9a-f]{64}$/);
  await assert.rejects(generateNativeTouring(options), /EEXIST/);
  assert.deepEqual(await readFile(join(options.evidenceDir, 'report.json')), bytes);
});

test('Touring installs only its three byte-identical artifacts after validation, retaining originals', async t => {
  const { options } = await fixture(t);
  const stock = join(options.appRoot, 'src/game/generated/provenance.json'); await writeFile(stock, 'untouched Stock');
  const report = await generateNativeTouring({ ...options, install: true }); assert.equal(report.installed, true);
  for (const [name, relative] of Object.entries(paths)) {
    assert.deepEqual(await readFile(join(options.appRoot, relative)), await readFile(join(options.evidenceDir, name)));
    assert.equal(await readFile(join(options.evidenceDir, 'previous', name), 'utf8'), `old:${name}`);
  }
  const provenance = JSON.parse(await readFile(join(options.evidenceDir, 'classed-provenance.json'), 'utf8'));
  assert.equal(provenance.cryptographicQualification, false); assert.equal(provenance.compiledIntoNativeRegistry, false);
  assert.equal(provenance.transitions, 816); assert.equal(Object.keys(provenance.profileSources).length, 43);
  assert.deepEqual(Object.keys(provenance.profileSources), [...CLASSED_NATIVE_PROFILE_SOURCES]);
  assert.equal(await readFile(stock, 'utf8'), 'untouched Stock');
  await assert.rejects(access(join(options.appRoot, 'output/.native-generation-install.lock')));
});

test('Touring rejects a different executable before any child process', async t => {
  const { options } = await fixture(t);
  await assert.rejects(generateNativeTouring({ ...options, install: true, expectedCliSha256: '0'.repeat(64) }), /CLI digest/);
  await assertUnchanged(options.appRoot);
  assert.equal(JSON.parse(await readFile(join(options.evidenceDir, 'report.json'), 'utf8')).commands.length, 0);
});

test('Touring rejects source drift, executable drift and stale verifier hashes without installation', async t => {
  for (const behavior of [
    `fs.appendFileSync('crates/iroha_data_model/src/game.rs', '\\nchanged');`,
    `fs.appendFileSync('target/debug/iroha', '// changed executable');`,
  ]) {
    const { options } = await fixture(t, behavior);
    await assert.rejects(generateNativeTouring({ ...options, install: true }), /sources changed|CLI digest/);
    await assertUnchanged(options.appRoot);
  }
  const { options, kernels } = await fixture(t); kernels.profile_sources['crates/iroha_data_model/src/game.rs'] = '0'.repeat(64);
  await writeFile(join(options.nativeRoot, 'kernels.json'), JSON.stringify(kernels));
  await assert.rejects(generateNativeTouring({ ...options, install: true }), /export is stale/);
  await assertUnchanged(options.appRoot);
  assert.equal(JSON.parse(await readFile(join(options.evidenceDir, 'report.json'), 'utf8')).commands.length, 1);
});

test('Touring retains invalid native parity output while rejecting replacement', async t => {
  const { options, parity } = await fixture(t); parity.transitions.pop();
  const invalid = JSON.stringify(parity); await writeFile(join(options.nativeRoot, 'parity.json'), invalid);
  await assert.rejects(generateNativeTouring({ ...options, install: true }), /complete environment/);
  await assertUnchanged(options.appRoot);
  assert.equal(await readFile(join(options.evidenceDir, 'native-classed-race-v1.json'), 'utf8'), invalid);
});

test('Touring installation preserves another writer and unexplained shared Stock/Touring lock', async t => {
  const { options } = await fixture(t, `fs.writeFileSync('../app/src/game/generated/classed-provenance.json', 'other writer');`);
  await assert.rejects(generateNativeTouring({ ...options, install: true }), /destination changed/);
  assert.equal(await readFile(join(options.appRoot, paths['classed-provenance.json']), 'utf8'), 'other writer');
  const next = await fixture(t), lock = join(next.options.appRoot, 'output/.native-generation-install.lock'); await writeFile(lock, 'retained unexplained lock');
  await assert.rejects(generateNativeTouring({ ...next.options, install: true }), /EEXIST/);
  await assertUnchanged(next.options.appRoot); assert.equal(await readFile(lock, 'utf8'), 'retained unexplained lock');
});

test('Touring source symlinks escaping the explicitly selected checkout are rejected before spawning', async t => {
  const { options } = await fixture(t), source = join(options.nativeRoot, CLASSED_NATIVE_PROFILE_SOURCES[0]!);
  await rm(source); await symlink(join(options.appRoot, paths['classed-provenance.json']), source);
  await assert.rejects(generateNativeTouring({ ...options, install: true }), /source escapes/);
  await assertUnchanged(options.appRoot);
  assert.equal(JSON.parse(await readFile(join(options.evidenceDir, 'report.json'), 'utf8')).commands.length, 0);
});

test('Touring generator rejects changed immutable history bounds with identical simulator source', async () => {
  const kernels = syntheticKernelCatalog();
  const path = 'crates/iroha_data_model/src/game_retention.rs';
  assert.ok(Object.hasOwn(kernels.profile_sources, path));
  const read = async (name: string) => Buffer.from(name === path ? 'changed retention admission' : `test-only source: ${name}`);
  await assert.rejects(verifyClassedNativeSources(kernels, read), /stale for crates\/iroha_data_model\/src\/game_retention.rs/);
});
