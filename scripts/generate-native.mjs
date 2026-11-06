import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIVE_SOURCE_PATHS, verifyNativeSources } from './lib/native-sources.mjs';
import { generateNativeArtifacts } from './lib/native-artifact-generation.mjs';

const APP_ROOT = fileURLToPath(new URL('../', import.meta.url));
const HASH = /^[0-9a-f]{64}$/;
const absolute = (value, name) => {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error(`Set ${name} to an explicit absolute path.`);
  return resolve(value);
};

export function nativeGenerationOptions(env = process.env, args = process.argv.slice(2)) {
  if (args.some(arg => arg !== '--install') || new Set(args).size !== args.length) throw new Error('Usage: node scripts/generate-native.mjs [--install]');
  const expectedCliSha256 = env.SORA_CARS_IROHA_CLI_SHA256;
  if (typeof expectedCliSha256 !== 'string' || !HASH.test(expectedCliSha256)) throw new Error('Set SORA_CARS_IROHA_CLI_SHA256 to the independently recorded lowercase SHA-256 of the selected native CLI.');
  return {
    appRoot: APP_ROOT,
    nativeRoot: absolute(env.SORA_CARS_IROHA_ROOT, 'SORA_CARS_IROHA_ROOT'),
    binary: absolute(env.SORA_CARS_IROHA_CLI, 'SORA_CARS_IROHA_CLI'),
    evidenceDir: absolute(env.SORA_CARS_NATIVE_EXPORT_DIR, 'SORA_CARS_NATIVE_EXPORT_DIR'),
    expectedCliSha256,
    install: args.includes('--install'),
  };
}

/** Check the complete ordered 3-track × 2–8-player native export, not merely its length. */
export function validateNativeExports(kernels, parity) {
  const fail = message => { throw new Error(`Invalid native export: ${message}.`); };
  if (kernels?.version !== 1 || kernels.fixed_prefix !== 9 || !Array.isArray(kernels.kernels)
    || kernels.kernels.length !== 21 || !Array.isArray(kernels.environment) || kernels.environment.length !== 3
    || !Array.isArray(parity?.fixtures) || parity.fixtures.length !== 21) fail('expected fixed prefix 9 and the complete 21-grid catalog');
  if (!HASH.test(kernels.profile_id ?? '') || !HASH.test(kernels.rules_hash ?? '') || kernels.rules_hash !== parity.rulesHash) fail('compiled profile/rules identity mismatch');
  if (kernels.sources?.['race.rs'] !== parity.kernelSha256) fail('reference and kernel source identity mismatch');
  for (let index = 0; index < 21; index++) {
    const track = Math.floor(index / 7), players = index % 7 + 2;
    const kernel = kernels.kernels[index], fixture = parity.fixtures[index];
    if (kernel?.track !== track || kernel.player_count !== players || fixture?.trackId !== track || fixture.players !== players) fail(`duplicate, missing or reordered grid ${track}/${players}`);
    if (kernel.input_count !== 7 * players || kernel.fixed_count !== 9 + 4 * players
      || !Array.isArray(kernel.outputs) || kernel.outputs.length !== 7 * players
      || !Array.isArray(kernel.events) || kernel.events.length !== 3 * players
      || !Array.isArray(kernel.nodes) || !kernel.nodes.length
      || !Array.isArray(kernel.control_table) || kernel.control_table.length !== 64
      || kernel.control_table.some(row => !Array.isArray(row) || row.length !== 3 || row.some(value => !Number.isSafeInteger(value)))) fail(`incomplete arithmetic layout for grid ${track}/${players}`);
    if (!Array.isArray(fixture.inputs) || fixture.inputs.length < 1 || fixture.inputs.length > 5400
      || fixture.inputs.some(row => !Array.isArray(row) || row.length !== players || row.some(control => !Number.isInteger(control) || control < 0 || control > 63))) fail(`invalid input corpus for grid ${track}/${players}`);
    if (players === 8 && fixture.inputs.length !== 5400) fail(`missing full-duration eight-player reference for track ${track}`);
    if (!Array.isArray(fixture.checkpoints) || fixture.checkpoints.length < 2
      || fixture.checkpoints[0]?.tick !== 0 || fixture.checkpoints.at(-1)?.tick !== fixture.inputs.length
      || fixture.checkpoints.some((checkpoint, i) => !Number.isInteger(checkpoint.tick) || checkpoint.tick < 0 || checkpoint.tick > fixture.inputs.length
        || (i > 0 && checkpoint.tick <= fixture.checkpoints[i - 1].tick) || !Array.isArray(checkpoint.cars) || checkpoint.cars.length !== players)) fail(`missing or invalid reference snapshots for grid ${track}/${players}`);
    if (!Array.isArray(fixture.dnfEvents) || !fixture.result || fixture.result.ticks !== fixture.inputs.length
      || !Array.isArray(fixture.result.standings) || fixture.result.standings.length !== players || !Array.isArray(fixture.result.winners)) fail(`missing terminal result for grid ${track}/${players}`);
  }
}

export async function generateNative(options) {
  return generateNativeArtifacts(options, {
    computation: 'RaceV1',
    artifacts: {
      'race-v1-kernels.json': 'src/game/generated/race-v1-kernels.json',
      'native-race-v1.json': 'tests/fixtures/native-race-v1.json',
      'provenance.json': 'src/game/generated/provenance.json',
    },
    sourcePaths: NATIVE_SOURCE_PATHS, verifySources: verifyNativeSources,
    validateExports: validateNativeExports,
    kernelCommand: 'export-kernels', parityCommand: 'export-parity',
    kernelFile: 'race-v1-kernels.json', parityFile: 'native-race-v1.json', provenanceFile: 'provenance.json',
    kernelByteLimit: 32 * 1024 * 1024, parityByteLimit: 64 * 1024 * 1024,
    generatorUrl: import.meta.url, sourceVerifierUrl: new URL('./lib/native-sources.mjs', import.meta.url),
    provenanceFields: () => ({}),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await generateNative(nativeGenerationOptions());
    console.log(`${report.installed ? 'Installed' : 'Staged'} native Stock kernels and reference fixtures. Evidence: ${report.evidenceDir}`);
    console.log('Run the native/browser parity tests. This export does not qualify an execution proof profile.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
