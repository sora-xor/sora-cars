import { NATIVE_GAME_CERTIFICATE_SOURCES } from './native-game-certificate-sources.mjs';
import { createHash } from 'node:crypto';

const root = 'crates/iroha_core/src/execution_proofs/';
export const CLASSED_NATIVE_KERNEL_SOURCES = Object.freeze({
  'reference.rs': root + 'classed_race_v1/reference.rs',
  'rules.rs': root + 'classed_race_v1/rules.rs',
  'environment.rs': root + 'classed_race_v1/environment.rs',
  'environment_air.rs': root + 'classed_race_v1/environment_air.rs',
  'race_air.rs': root + 'classed_race_v1/race_air.rs',
  'integer_air.rs': root + 'integer_air.rs',
});
export const CLASSED_NATIVE_PROFILE_SOURCES = Object.freeze([
  ...NATIVE_GAME_CERTIFICATE_SOURCES,
  "crates/iroha_core/src/execution_proofs/classed_race_v1/history.rs",
  "crates/iroha_core/src/execution_proofs/classed_race_v1/admission.rs",
  "crates/iroha_core/src/execution_proofs/classed_race_v1/proof.rs",
  "crates/iroha_core/src/execution_proofs/classed_race_v1/reference.rs",
  "crates/iroha_core/src/execution_proofs/classed_race_v1/rules.rs",
  "crates/iroha_core/src/execution_proofs/classed_race_v1/environment.rs",
  "crates/iroha_core/src/execution_proofs/classed_race_v1/environment_air.rs",
  "crates/iroha_core/src/execution_proofs/classed_race_v1/race_air.rs",
  "crates/iroha_core/src/execution_proofs/classed_race_v1/staged_race_air.rs",
  "crates/iroha_core/src/execution_proofs/record_binding.rs",
  "crates/iroha_core/src/execution_proofs/guarded/accepted_history.rs",
  "crates/iroha_core/src/execution_proofs/integer_air.rs",
  "crates/iroha_core/src/execution_proofs/integer_air/weighted.rs",
  "crates/iroha_core/src/execution_proofs/checked_integer_air.rs",
  "crates/iroha_core/src/execution_proofs/poseidon2.rs",
  "crates/iroha_core/src/execution_proofs/poseidon2_constants.rs",
  "crates/iroha_core/src/execution_proofs/stark/transparent_stark.rs",
  "crates/iroha_core/src/execution_proofs/stark/fft.rs",
  "crates/iroha_core/src/execution_proofs/stark/aggregate_stark.rs",
  "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark.rs",
  "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark_deep_air.rs",
  "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark_execution_fixed.rs",
  "crates/iroha_core/src/privacy_engines/transparent_stark.rs",
  "crates/iroha_data_model/src/classed_race_v1.rs",
  "crates/iroha_data_model/src/game.rs",
  "crates/iroha_data_model/src/game_retention.rs",
  "crates/iroha_data_model/src/game_resources.rs",
  "crates/iroha_data_model/src/execution_proofs.rs",
  "crates/fastpq_isi/src/params.rs",
  "crates/fastpq_isi/src/poseidon.rs",
  "crates/fastpq_isi/src/poseidon_digest384.rs",
  "crates/fastpq_isi/src/assets/poseidon_goldilocks_width3_v1.bin",
]);
/** Source paths come from this closed local list, never from an export executable. */
export async function verifyClassedNativeSources(catalog, readSource) {
  if (catalog.computation !== 'ClassedRaceV1' || catalog.class_id?.kind !== 'touring_s1' || catalog.class_id.value !== null
    || !catalog.profile_sources || Object.keys(catalog.profile_sources).sort().join('\n') !== [...CLASSED_NATIVE_PROFILE_SOURCES].sort().join('\n')) throw new Error('Unexpected native Touring source inventory.');
  if (!catalog.sources || Object.keys(catalog.sources).sort().join('\n') !== Object.keys(CLASSED_NATIVE_KERNEL_SOURCES).sort().join('\n')) throw new Error('Unexpected native Touring kernel source inventory.');
  for (const [name, path] of Object.entries(CLASSED_NATIVE_KERNEL_SOURCES)) {
    if (catalog.sources[name] !== catalog.profile_sources[path]) throw new Error(`Native Touring kernel/profile source identity differs for ${name}.`);
  }
  for (const path of CLASSED_NATIVE_PROFILE_SOURCES) {
    const expected = catalog.profile_sources[path];
    if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected) || createHash('sha256').update(await readSource(path)).digest('hex') !== expected) throw new Error(`Native Touring export is stale for ${path}.`);
  }
}
