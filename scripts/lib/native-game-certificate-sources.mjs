// Shared committed game certificate sources. Order matches both native verifier catalogs.
export const NATIVE_GAME_CERTIFICATE_SOURCES = Object.freeze([
  "crates/iroha_core/src/execution_proofs/game_binding.rs",
  "crates/iroha_data_model/src/game_certificates.rs",
  "crates/iroha_data_model/src/game_certificates/history.rs",
  "crates/iroha_data_model/src/game_certificates/history/transcript.rs",
  "crates/iroha_data_model/src/game_certificates/lifecycle.rs",
  "crates/iroha_data_model/src/game_certificates/gameplay.rs",
  "crates/iroha_data_model/src/execution_proofs/game_bundle.rs",
  "crates/iroha_crypto/src/sha3_384.rs",
  "crates/iroha_crypto/src/lib.rs",
  "crates/iroha_crypto/src/signature/mod.rs",
  "crates/iroha_crypto/src/signature/ed25519.rs"
]);
