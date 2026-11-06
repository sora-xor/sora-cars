import { NATIVE_GAME_CERTIFICATE_SOURCES } from './native-game-certificate-sources.mjs';
import { createHash } from 'node:crypto';

const proofRoot = 'crates/iroha_core/src/execution_proofs/';
export const NATIVE_KERNEL_SOURCES = Object.freeze([
  'race.rs', 'environment.rs', 'environment_air.rs', 'integer_air.rs', 'race_air.rs',
]);
export const NATIVE_PROFILE_SOURCES = Object.freeze([
  ...NATIVE_GAME_CERTIFICATE_SOURCES,
  "crates/iroha_core/src/execution_proofs/race.rs",
  "crates/iroha_core/src/execution_proofs/environment.rs",
  "crates/iroha_core/src/execution_proofs/environment_air.rs",
  "crates/iroha_core/src/execution_proofs/integer_air.rs",
  "crates/iroha_core/src/execution_proofs/integer_air/weighted.rs",
  "crates/iroha_core/src/execution_proofs/race_air.rs",
  "crates/iroha_core/src/execution_proofs/proof.rs",
  "crates/iroha_core/src/execution_proofs/record_binding.rs",
  "crates/iroha_core/src/execution_proofs/guarded/accepted_history.rs",
  "crates/iroha_data_model/src/game.rs",
  "crates/iroha_data_model/src/game_retention.rs",
  "crates/iroha_data_model/src/game_resources.rs",
  "crates/iroha_data_model/src/execution_proofs.rs",
  "crates/iroha_core/src/execution_proofs/poseidon2.rs",
  "crates/iroha_core/src/execution_proofs/poseidon2_constants.rs",
  "crates/iroha_core/src/privacy_engines/transparent_stark.rs",
  "crates/fastpq_isi/src/params.rs",
  "crates/fastpq_isi/src/poseidon.rs",
  "crates/fastpq_isi/src/poseidon_digest384.rs",
  "crates/fastpq_isi/src/assets/poseidon_goldilocks_width3_v1.bin",
  "crates/iroha_core/src/execution_proofs/stark/transparent_stark.rs",
  "crates/iroha_core/src/execution_proofs/stark/fft.rs",
  "crates/iroha_core/src/execution_proofs/stark/aggregate_stark.rs",
  "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark.rs",
  "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark_deep_air.rs",
  "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark_execution_fixed.rs",
  "crates/iroha_execution_stark/src/lib.rs",
  "crates/iroha_execution_stark/src/air.rs",
  "crates/iroha_execution_stark/src/circuit.rs",
  "crates/iroha_execution_stark/src/field.rs",
  "crates/iroha_execution_stark/src/fri.rs",
  "crates/iroha_execution_stark/src/hash.rs",
  "crates/iroha_execution_stark/src/merkle.rs",
  "crates/iroha_execution_stark/src/ntt.rs",
  "crates/iroha_execution_stark/src/params.rs",
  "crates/iroha_execution_stark/src/proof.rs",
  "crates/iroha_execution_stark/src/prover.rs",
  "crates/iroha_execution_stark/src/trace.rs",
  "crates/iroha_execution_stark/src/transcript.rs",
  "crates/iroha_execution_stark/src/verifier.rs",
  "crates/iroha_execution_stark/src/games/mod.rs",
  "crates/iroha_execution_stark/src/games/race_v1.rs",
]);
// Browser arithmetic and the verifier may use different implementations. Both closed
// inventories must be captured and checked, including arithmetic outside the proof profile.
export const NATIVE_SOURCE_PATHS = Object.freeze([...new Set([
  ...NATIVE_PROFILE_SOURCES,
  ...NATIVE_KERNEL_SOURCES.map(name => proofRoot + name),
])]);

function exactInventory(value, names, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\n') !== [...names].sort().join('\n')
      || Object.values(value).some(hash => typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash))) {
    throw new Error(`Unexpected native ${label} source catalog; rebuild the current native CLI.`);
  }
}

/** Verify both physics and the full explicitly committed verifier source inventory. */
export async function verifyNativeSources(kernels, readSource) {
  exactInventory(kernels.sources, NATIVE_KERNEL_SOURCES, 'browser');
  exactInventory(kernels.profile_sources, NATIVE_PROFILE_SOURCES, 'profile');
  // Names come from the closed local inventory, never paths supplied by the executable.
  const hashes = new Map();
  for (const name of NATIVE_SOURCE_PATHS) {
    const bytes = await readSource(name);
    hashes.set(name, createHash('sha256').update(bytes).digest('hex'));
  }
  for (const name of NATIVE_PROFILE_SOURCES) {
    if (hashes.get(name) !== kernels.profile_sources[name]) {
      throw new Error(`The native CLI is stale for ${name}; rebuild it before generation.`);
    }
  }
  for (const name of NATIVE_KERNEL_SOURCES) {
    if (hashes.get(proofRoot + name) !== kernels.sources[name]) {
      throw new Error(`The native CLI is stale for browser arithmetic ${name}; rebuild it before generation.`);
    }
  }
}
