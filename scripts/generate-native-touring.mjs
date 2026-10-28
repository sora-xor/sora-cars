import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSED_NATIVE_PROFILE_SOURCES, verifyClassedNativeSources } from './lib/classed-native-sources.mjs';
import { generateNativeArtifacts } from './lib/native-artifact-generation.mjs';

const HASH = /^[0-9a-f]{64}$/;
const TRACKS = ['neon_tokyo', 'harbor', 'sakura'];
const CLASS = value => value?.kind === 'touring_s1' && value.value === null;
const integer = (value, low, high) => Number.isSafeInteger(value) && value >= low && value <= high;
const fail = message => { throw new Error(`Invalid native Touring export: ${message}.`); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function touringGenerationOptions(env = process.env, args = process.argv.slice(2)) {
  if (args.some(arg => arg !== '--install') || new Set(args).size !== args.length) throw new Error('Usage: node scripts/generate-native-touring.mjs [--install]');
  const absolute = name => {
    if (typeof env[name] !== 'string' || !isAbsolute(env[name])) throw new Error(`Set ${name} to an explicit absolute path.`);
    return resolve(env[name]);
  };
  if (!HASH.test(env.SORA_CARS_IROHA_CLI_SHA256 ?? '')) throw new Error('Set SORA_CARS_IROHA_CLI_SHA256 to the independently recorded lowercase SHA-256 of the selected native CLI.');
  return {
    appRoot: fileURLToPath(new URL('../', import.meta.url)),
    nativeRoot: absolute('SORA_CARS_IROHA_ROOT'), binary: absolute('SORA_CARS_IROHA_CLI'),
    evidenceDir: absolute('SORA_CARS_NATIVE_EXPORT_DIR'), expectedCliSha256: env.SORA_CARS_IROHA_CLI_SHA256,
    install: args.includes('--install'),
  };
}

function validateLayout(kernel, players) {
  if (kernel.input_count !== 7 * players || kernel.fixed_count !== 9 + 4 * players
    || !Array.isArray(kernel.initial_inputs) || kernel.initial_inputs.length !== 7 * players
    || kernel.initial_inputs.some(value => !Number.isSafeInteger(value))
    || !Array.isArray(kernel.outputs) || kernel.outputs.length !== 7 * players
    || !Array.isArray(kernel.events) || kernel.events.length !== 3 * players
    || !Array.isArray(kernel.nodes) || !kernel.nodes.length
    || !Array.isArray(kernel.control_table) || kernel.control_table.length !== 64
    || kernel.control_table.some(row => !Array.isArray(row) || row.length !== 3 || row.some(value => !Number.isSafeInteger(value)))) fail('incomplete arithmetic layout');
  const ref = (pair, before) => {
    const [kind, value] = pair;
    if (pair.length !== 2 || !integer(kind, 0, 3) || !Number.isSafeInteger(value)
      || kind !== 0 && !integer(value, 0, (kind === 1 ? kernel.fixed_count : kind === 2 ? before : kernel.input_count) - 1)) fail('invalid circuit reference');
  };
  kernel.nodes.forEach((node, before) => {
    if (!Array.isArray(node) || !integer(node[0], 0, 8) || node.length !== (node[0] === 3 ? 7 : 5)) fail('invalid circuit opcode');
    ref(node.slice(1, 3), before); ref(node.slice(3, 5), before);
    if (node[0] === 3) ref(node.slice(5, 7), before);
    if ((node[0] === 4 || node[0] === 5) && (node[3] !== 0 || node[4] <= 0)) fail('invalid constant divisor');
    if ((node[0] === 6 || node[0] === 7) && (node[3] !== 0 || !integer(node[4], 0, 52))) fail('invalid digit extraction');
  });
  for (const pair of [...kernel.outputs, ...kernel.events]) { if (!Array.isArray(pair)) fail('invalid circuit output'); ref(pair, kernel.nodes.length); }
}

function validateEnvironment(env) {
  const vector = (key, count, low, high) => Array.isArray(env?.[key]) && env[key].length === count && env[key].every(value => integer(value, low, high));
  if (!integer(env?.length_mm, 1, 100_000_000)
    || !vector('centers', 12, 0, env.length_mm - 1) || env.centers.some((value, i) => i > 0 && value <= env.centers[i - 1])
    || !vector('curvature', 12, -3, 3) || !vector('kinds', 12, 0, 2) || !vector('laterals', 12, -15300, 15300)
    || !vector('rain_pattern', 4, 0, 1) || !vector('wind_pattern', 8, -8, 8)
    || !integer(env.rain_ticks, 1, 5400) || !integer(env.wind_ticks, 1, 5400) || !integer(env.wind_strength, 0, 320)
    || ['oil_half_length', 'oil_half_width', 'sign_radius', 'sign_speed_loss', 'tree_push', 'tree_radius', 'tree_speed_loss'].some(key => !integer(env[key], 1, 100_000))) fail('incomplete environment descriptor');
}

function carValues(car) {
  return [car.progress_mm, car.lateral_mm, car.speed_mm_per_tick, car.lateral_velocity_mm_per_tick,
    car.boost_energy, car.finish_tick ?? 0, car.dnf_tick === null ? 0 : car.dnf_tick + 1];
}
function validateCars(cars, tick, players, finish, performance) {
  if (!Array.isArray(cars) || cars.length !== players) fail('missing state cars');
  for (const car of cars) {
    if (!integer(car?.progress_mm, -12000, finish) || !integer(car.lateral_mm, -15300, 15300)
      || !integer(car.speed_mm_per_tick, 0, performance.boost_speed) || !integer(car.lateral_velocity_mm_per_tick, -320, 320)
      || !integer(car.boost_energy, 0, performance.boost_capacity)
      || car.finish_tick !== null && !integer(car.finish_tick, 1, tick)
      || car.dnf_tick !== null && !integer(car.dnf_tick, 0, tick)
      || (car.finish_tick !== null) !== (car.progress_mm === finish)
      || car.finish_tick !== null && car.dnf_tick !== null && car.finish_tick > car.dnf_tick) fail('state exceeds native bounds');
  }
}
function stateChecksum(tick, cars) {
  // Native export diagnostic SHA-256 only; this is not the consensus state commitment.
  const bytes = Buffer.alloc(4 + cars.length * 56); bytes.writeUInt32LE(tick);
  let offset = 4;
  for (const car of cars) for (const value of carValues(car)) { bytes.writeBigInt64LE(BigInt(value), offset); offset += 8; }
  return createHash('sha256').update(bytes).digest('hex');
}
function trackIs(value, track) { return value?.kind === TRACKS[track] && value.value === null; }
function controlsAre(controls, players) { return Array.isArray(controls) && controls.length === players && controls.every(value => integer(value, 0, 63)); }

/** Validate the distinct native computation and its complete export corpus before any installation.
 * Replay execution against every native per-tick checksum remains the separate browser parity gate.
 */
export function validateTouringExports(kernels, parity) {
  if (kernels?.version !== 1 || parity?.version !== 1 || kernels.computation !== 'ClassedRaceV1'
    || parity.computation !== 'ClassedRaceV1' || !CLASS(kernels.class_id) || !CLASS(parity.class_id)
    || kernels.fixed_prefix !== 9 || kernels.state_width !== 7 || kernels.max_ticks !== 5400 || kernels.batch_ticks !== 6 || kernels.laps !== 3
    || !Array.isArray(kernels.kernels) || kernels.kernels.length !== 21
    || !Array.isArray(kernels.environment) || kernels.environment.length !== 3
    || !Array.isArray(parity.fixtures) || parity.fixtures.length !== 21) fail('expected ClassedRaceV1/TouringS1 and the complete 21-grid catalog');
  if (!HASH.test(kernels.profile_id ?? '') || !HASH.test(kernels.rules_hash ?? '')
    || kernels.profile_id !== parity.profileId || kernels.rules_hash !== parity.rulesHash
    || !HASH.test(parity.kernelSha256 ?? '') || kernels.sources?.['reference.rs'] !== parity.kernelSha256) fail('compiled profile/rules/reference identity mismatch');
  const performanceKeys = ['acceleration', 'normal_speed', 'boost_speed', 'brake', 'coast', 'steering', 'drift_steering', 'boost_capacity', 'boost_cost', 'boost_recharge', 'offroad_penalty', 'contact_penalty'];
  if (!kernels.performance || !same(Object.keys(kernels.performance).sort(), performanceKeys.sort())
    || performanceKeys.some(key => !integer(kernels.performance[key], 1, 10000))
    || kernels.performance.normal_speed > kernels.performance.boost_speed || kernels.performance.boost_cost > kernels.performance.boost_capacity) fail('incomplete class performance');
  for (const env of kernels.environment) validateEnvironment(env);
  for (let index = 0; index < 21; index++) {
    const track = Math.floor(index / 7), players = index % 7 + 2, kernel = kernels.kernels[index], fixture = parity.fixtures[index];
    if (kernel?.track !== track || kernel.player_count !== players || fixture?.trackId !== track || fixture.players !== players) fail(`duplicate, missing or reordered grid ${track}/${players}`);
    validateLayout(kernel, players);
    const finish = kernels.environment[track].length_mm * kernels.laps;
    if (!Array.isArray(fixture.inputs) || fixture.inputs.length !== (players === 8 ? 5400 : players === 2 ? 1200 : 600)
      || fixture.inputs.some(row => !controlsAre(row, players))) fail(`missing full-duration or bounded reference inputs for grid ${track}/${players}`);
    if (!Array.isArray(fixture.state_hashes) || fixture.state_hashes.length !== fixture.inputs.length + 1
      || fixture.state_hashes.some(hash => !HASH.test(hash))) fail('missing per-tick native checksums');
    const expectedDnf = players === 8 ? [{ tick: 5394, slots: [7] }] : players === 2 ? [{ tick: 1200, slots: [1] }]
      : [{ tick: 300, slots: [players - 1] }, { tick: 600, slots: Array.from({ length: players - 2 }, (_, i) => i + 1) }];
    if (!Array.isArray(fixture.dnfEvents) || fixture.dnfEvents.length !== expectedDnf.length
      || fixture.dnfEvents.some((event, i) => event?.tick !== expectedDnf[i].tick || !same(event.slots, expectedDnf[i].slots))) fail('missing canonical DNF boundary coverage');
    const expectedTicks = Array.from({ length: fixture.inputs.length + 1 }, (_, tick) => tick)
      .filter(tick => tick % 300 === 0 || [1, 6, 30, 60, 90, 5394, fixture.inputs.length].includes(tick));
    if (!Array.isArray(fixture.checkpoints) || !same(fixture.checkpoints.map(checkpoint => checkpoint?.tick), expectedTicks)) fail('missing ordered initial, DNF or terminal snapshots');
    for (const checkpoint of fixture.checkpoints) {
      validateCars(checkpoint.cars, checkpoint.tick, players, finish, kernels.performance);
      if (stateChecksum(checkpoint.tick, checkpoint.cars) !== fixture.state_hashes[checkpoint.tick]) fail('snapshot diagnostic checksum mismatch');
      for (let slot = 0; slot < players; slot++) {
        const removal = expectedDnf.find(event => event.tick <= checkpoint.tick && event.slots.includes(slot));
        if (checkpoint.cars[slot].dnf_tick !== (removal?.tick ?? null)) fail('snapshot DNF history mismatch');
      }
    }
    if (!same(kernel.initial_inputs, fixture.checkpoints[0].cars.flatMap(carValues))) fail('initial circuit/reference state mismatch');
    const result = fixture.result, finalCars = fixture.checkpoints.at(-1).cars;
    if (!result || result.ticks !== fixture.inputs.length || result.terminal !== true || !CLASS(result.class_id) || !trackIs(result.track, track)
      || !Array.isArray(result.standings) || result.standings.length !== players
      || !same(result.standings.map(car => car?.slot).sort((a, b) => a - b), Array.from({ length: players }, (_, slot) => slot))
      || result.standings.some(car => ['progress_mm', 'finish_tick', 'dnf_tick'].some(key => car[key] !== finalCars[car.slot][key]))
      || !Array.isArray(result.winners) || !result.winners.length
      || result.winners.some((slot, i) => !integer(slot, 0, players - 1) || finalCars[slot].dnf_tick !== null || i > 0 && slot <= result.winners[i - 1])) fail('incomplete or inconsistent terminal standings');
  }
  validateTransitions(kernels, parity.transitions);
}

function validateTransitions(kernels, transitions) {
  if (!Array.isArray(transitions) || transitions.length !== 3 * 2 * (12 * 6 + 64)) fail('missing complete environment and control transitions');
  let offset = 0;
  for (let track = 0; track < 3; track++) {
    const env = kernels.environment[track], finish = env.length_mm * kernels.laps;
    for (let wet = 0; wet < 2; wet++) {
      const tick = Array.from({ length: 1199 }, (_, i) => i + 1).find(tick => env.rain_pattern[Math.floor(tick / env.rain_ticks) % env.rain_pattern.length] === wet
        && env.wind_pattern[Math.floor(tick / env.wind_ticks) % env.wind_pattern.length] * env.wind_strength !== 0);
      if (tick === undefined) fail('missing wet/dry nonzero-wind coverage');
      const check = (name, control, position, lateral, inactive = false) => {
        const transition = transitions[offset++];
        if (transition?.name !== name || !controlsAre(transition.controls, 8)
          || transition.controls[0] !== control || transition.controls.slice(1).some(value => value !== 0)
          || !CLASS(transition.before?.class_id) || !CLASS(transition.after?.class_id)
          || !trackIs(transition.before?.track, track) || !trackIs(transition.after?.track, track)
          || transition.before.tick !== tick || transition.after.tick !== tick + 1) fail('missing, reordered or unbound environment transition');
        validateCars(transition.before.cars, tick, 8, finish, kernels.performance);
        validateCars(transition.after.cars, tick + 1, 8, finish, kernels.performance);
        const car = transition.before.cars[0];
        if (car.progress_mm !== position || car.lateral_mm !== lateral || car.dnf_tick !== (inactive ? tick : null)) fail('environment boundary coverage mismatch');
        if (!Array.isArray(transition.events) || transition.events.length !== 8
          || transition.events.some(row => !Array.isArray(row) || row.length !== 3 || !integer(row[0], 0, 1) || !integer(row[1], 0, 1) || !integer(row[2], 0, 2))) fail('invalid native AIR event outputs');
        if (inactive && !same(carValues(transition.before.cars[0]), carValues(transition.after.cars[0]))) fail('inactive transition mutated state');
        if (name === 'all-controls-low-energy' && (car.boost_energy !== 24 || car.lateral_velocity_mm_per_tick !== -319 || car.speed_mm_per_tick !== 2500)) fail('missing low-energy control coverage');
      };
      for (let cell = 0; cell < 12; cell++) {
        const cases = env.kinds[cell] === 2 ? [['inside', 0, 0], ['length-edge', -9000, 0], ['outside-length', -9001, 0], ['width-edge', 0, 1400], ['outside-width', 0, 1401], ['inactive', 0, 0]]
          : [['crossing', -500, 0], ['before-crossing', -4000, 0], ['center', 0, 0], ['past', 1, 0], ['radius-edge', -500, env.kinds[cell] === 0 ? 1400 : 1300], ['inactive', -500, 0]];
        for (const [name, position, lateral] of cases) check(name, 49, env.centers[cell] + position, env.laterals[cell] + lateral, name === 'inactive');
      }
      for (let control = 0; control < 64; control++) check('all-controls-low-energy', control, 0, -1800);
    }
  }
}

export async function generateNativeTouring(options) {
  return generateNativeArtifacts(options, {
    computation: 'ClassedRaceV1',
    artifacts: {
      'classed-race-v1-kernels.json': 'src/game/generated/classed-race-v1-kernels.json',
      'native-classed-race-v1.json': 'tests/fixtures/native-classed-race-v1.json',
      'classed-provenance.json': 'src/game/generated/classed-provenance.json',
    },
    sourcePaths: CLASSED_NATIVE_PROFILE_SOURCES, verifySources: verifyClassedNativeSources,
    validateExports: validateTouringExports,
    kernelCommand: 'export-touring-kernels', parityCommand: 'export-touring-parity',
    kernelFile: 'classed-race-v1-kernels.json', parityFile: 'native-classed-race-v1.json', provenanceFile: 'classed-provenance.json',
    kernelByteLimit: 32 * 1024 * 1024, parityByteLimit: 64 * 1024 * 1024,
    generatorUrl: import.meta.url, sourceVerifierUrl: new URL('./lib/classed-native-sources.mjs', import.meta.url),
    provenanceFields: (_kernels, parity) => ({ computation: 'ClassedRaceV1', classId: { kind: 'touring_s1', value: null }, transitions: parity.transitions.length, compiledIntoNativeRegistry: false }),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await generateNativeTouring(touringGenerationOptions());
    console.log(`${report.installed ? 'Installed' : 'Staged'} native Touring kernels and reference fixtures. Evidence: ${report.evidenceDir}`);
    console.log('Run the native/browser Touring parity tests. This export does not register or qualify an execution proof profile.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
