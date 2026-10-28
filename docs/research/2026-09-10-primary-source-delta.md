# September 10 primary-source update

Checked on September 10, 2026, Asia/Tokyo. This narrow follow-up to the
[September briefing](september-2026-briefing.md) checks selected September 9–10
proof-system changes. It is not an exhaustive survey of September publications.
The records below are official implementation commits, not independently
reproduced security proofs, audited releases or Iroha benchmarks.

| Exact change | Observation | Implication for native Iroha games |
| --- | --- | --- |
| September 9, `b4ef483de592f1a0e45056d928493d0ad543e2bc` | Plonky3 adds statement-specific multi-STARK security accounting, requiring PCS and collision evidence. Its WHIR changes account for initial claim batching and separate carried claims. [Official commit](https://github.com/Plonky3/Plonky3/commit/b4ef483de592f1a0e45056d928493d0ad543e2bc). | Budget every application and opening contribution, including batching, lookups, sumcheck and commitment-time candidate bounds. A component target does not establish a complete 128-bit result. |
| September 9, `8d764ed4d62a2921b4490f5862d3ac3454e39bce` | Plain WHIR now executes named transcript steps through its pattern machinery, retaining delegation boundaries for nested sumchecks. [Official commit](https://github.com/Plonky3/Plonky3/commit/8d764ed4d62a2921b4490f5862d3ac3454e39bce). | Check actual prover/verifier message ordering as well as the committed protocol description. Hashing a description alone does not enforce it. |
| September 9, `07c4c99d5435de43a6146e6297eca4c5a6373ca3` | Zero-difficulty grinding witnesses reject nonzero values that would otherwise be unused. [Official commit](https://github.com/Plonky3/Plonky3/commit/07c4c99d5435de43a6146e6297eca4c5a6373ca3). | Include inactive proof fields in canonical decoding and adversarial tests; do not give ignored witness values multiple accepted encodings. |
| September 9, `017177a323a57562aa6c7a4b608e30020d3c972f` | New checks compare transcript-recorded grinding difficulty with the security model, including protocol-specific conventions for omitted zero-bit steps. Coverage is FRI, its PCS, uni-STARK and batch-STARK; this commit explicitly excludes WHIR and other unconnected models. [Official commit](https://github.com/Plonky3/Plonky3/commit/017177a323a57562aa6c7a4b608e30020d3c972f). | Security credit must match work actually required and checked at the correct stage. Do not assume a check for one protocol covers a different native backend. |

The implications are engineering inferences for our qualification work. They
establish no native vulnerability, corrected security bound or performance gain.
Native profiles and parameters remain unchanged by this research.

The inspected ePrint histories for [FACS](https://eprint.iacr.org/2025/737),
[WARP](https://eprint.iacr.org/2025/753) and
[LiftWHIR](https://eprint.iacr.org/2026/1561) still identify the May 20, June 18 and
August 28 revisions respectively. The practical priority remains complete native
execution authentication followed by bounded transition batching, then matched
lookup/accumulation and final-decider measurements. Full-duration proving,
validator cost and composed security need their own evidence.

## Mapping to the current native implementation

A read-only review of the isolated Iroha worktree found concrete existing
protections. Street uses native code rather than delegating to Plonky3:
its [consuming phase objects](/Users/takemiyamakoto/dev/iroha-sora-cars-native/crates/iroha_core/src/execution_proofs/guarded/phased_whir.rs:338)
constrain protocol progression, and its shifted combination already starts new
claims at gamma while preserving the carried claim's coefficient. Its
[conditional error expression](/Users/takemiyamakoto/dev/iroha-sora-cars-native/crates/iroha_core/src/execution_proofs/guarded/whir_geometry.rs:111)
explicitly excludes complete Fiat–Shamir, hash and knowledge-security claims.

Stock binds its profile and public statement before challenges and follows a
fixed verifier sequence. The shared substrate's
[20-bit grinding requirement](/Users/takemiyamakoto/dev/iroha-sora-cars-native/crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark.rs:108)
is actually [checked before query derivation](/Users/takemiyamakoto/dev/iroha-sora-cars-native/crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark.rs:2535).
This does not establish an additive 20-bit improvement to the whole proof.
Street's current opening has no grinding nonce and should receive no grinding
credit. The upstream unused-zero-difficulty-witness finding therefore must not be
reported as an observed equivalent native bug.

The next native checks should compare recorded prover/verifier event sequences,
labels, framing and challenge counters; mutate genuinely conditional fields;
and enumerate the complete per-statement error contributions for every equation,
lookup occurrence, oracle branch and boundary/motion component. Future segment
links must enter the same accounting. A consistency test for a calculator is
useful, but does not establish the cryptographic reduction it implements.
The [native security review](/Users/takemiyamakoto/dev/iroha-sora-cars-native/crates/iroha_core/src/execution_proofs/SECURITY_REVIEW.md:29)
retains those open composition obligations. No native source, proof parameter or
release qualification was changed by this follow-up.
