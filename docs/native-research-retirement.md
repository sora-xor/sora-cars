# Current native proof regression coverage

SORA CARS uses the selected Iroha Core arithmetic, guarded segment, accepted-history and finalized-bundle implementations. The frozen laboratory command chain has been removed. Its old compiler archives, exact report hashes, data-model facade and per-component proof files are no longer executable prerequisites.

The exact removed source bytes are retained under `output/qualification/frozen-protocol-runner-retirement-20261018/preimage/`. Previous reports and artifact manifests remain unchanged. These historical records do not qualify the current source. No retired proof codec or compatibility branch is added to Native.

The deletion includes the frozen native adapter, sumcheck/WHIR/membership runners, comparison/cache/reuse runners, their report recorders, old finalized-history/merge runners and their exclusive Rust fixture/CLI helpers. The inventory is the candidate's `manifest.json`. The six constraint-plan runners and four native Street comparison runners are retired by their separately reviewed companion changes.

The 42 unreachable `world/native/*.rs` proof mirrors are also retired. Their exact removal snapshots are retained under `output/qualification/unused-proof-mirror-retirement-20261018/preimage/`. The four synthetic Street geometry/handling/hazard modules, generated layout and their current tests remain; see [the remaining local module inventory](../world/native/README.md).

Browser generation invokes the Core-owned Iroha CLI exporter. Current native game replay, proof browser/HTTP, wallet, CLI worker and bundle consumers remain. The four standalone raw operand/terminal runners, their audit harness and six duplicate modules are deleted. Their exact source snapshot and the old-to-current attack-obligation map are retained under `output/qualification/raw-execution-retirement-20261018/`. All 12 operand tests already passed against Core in the 174-test source epoch. Additional current native boundary tests and selected membership/planner tests must pass in the successor epoch; this retirement packet is not itself a test result.

The old prefix-only executor, positive-length-only terminal grammar and global boundary-row padding API are removed rather than reproduced. The current closed Boundary/Motion grammar supports a proved zero-motion final boundary and requires every scheduled segment. Duplicate source ports retain separate public equations; contradictory aliases and fixed public values cannot be accepted by treating port ordinals as distinct witness cells.

## Attack obligations retained in the selected implementation

Run focused Cargo tests from the selected Iroha worktree with its existing warm target. These module names identify current code, not a statement that a particular revision has passed. Exact source, test and result evidence must come from that revision's native run.

| Obligation | Current native coverage |
| --- | --- |
| Signed integer arithmetic, bounded division, complete fixed ROM, padding and coherent malformed advice | `arithmetic::checked_constraints`, `arithmetic::fixed_rom`, `integer_air::{fixed_rom_tests,variable_division}`, and `street_v1::compiler::{geometry_constraints::adversarial_tests,tests::finite_lowering}`. The latter two include the migrated finite geometry/gameplay controls and must be run after compilation. |
| Complete operand equations, exact maps, aliases, multiplicities, shared ROM and immutable source identity | `arithmetic::operand_program`, `arithmetic::operand_source::tests`, `guarded::complete_execution_tests` and `guarded::membership_relation::tests`; selected composition tests include genuine hidden-anchor proof rejection. The complete-execution tests cover contradictory duplicate/fixed ports, unused carry identity at zero motion, full public schedule binding and canonical cursor/halt/genesis predicates. |
| Full-extension basis and index order | `guarded::multilinear_basis::tests::{mixed_fp4_roundtrips_and_independent_corner_equations,roots_of_unity_interpolation_is_not_boolean_basis_conversion}`. |
| Commitment roots, role/domain/query binding, exact codeword shapes and bounded admission | `guarded::whir_commitment::tests`, including `every_scope_role_round_and_geometry_is_bound_even_for_zero_polynomial`, plus `guarded::whir_geometry::tests`. |
| Shared phase transcript and joint branch challenges | `guarded::phased_whir::tests::{phased_challenges_bind_both_ood_replies_and_oracle_roles,phased_both_query_sets_bind_each_branch_and_exact_bytes}`. |
| Range/ROM namespaces, wrong multiplicities, inverse advice, both padding banks and public poles | `guarded::membership_relation::tests`. These are explicit relation tests; they do not by themselves establish soundness of the complete proof. |
| Wrong predecessor, changed outputs/context/checkpoints, missing/reordered/extra segments, terminal policy and sticky rejection after genuine proofs | `guarded::guarded_segment_proof::tests`; specifically `guarded_segment_proof_two_segments_verify_independently_and_reject_mutations`, `guarded_segment_proof_checkpoint_is_raw_before_boundary_adjudication`, and the selected closed-port/carry tests. |
| Exact full signed input batches, unused suffixes, retained checkpoints and native state projection | `guarded::accepted_history_tests`, `street_v1::accepted::tests`, `street_v1::prover::tests` and `street_v1::tests`. |
| Actual network/epoch/validator trust, finalized executed bytes and marker-root merge membership | `finalized::ledger::tests`, `finalized::write_set::tests`, `finalized::street::history_join_tests` and current public bundle tests. |
| Canonical bounded frames, interrupted writes, failed sink cleanup, CLI cancellation and fresh output | `bundle::transport::tests`, current native `execution_bundle`, `execution_worker`, `execution_worker_command` and their retained browser/HTTP consumers. Genuine worker process gates remain distinct from ordinary unit tests. |

The arithmetic, guarded, Street, finalized and bundle Core paths above are under `execution_proofs::`; CLI worker tests live in their own native crate. For example:

```sh
cargo iroha-fast -- test -p iroha_core --lib execution_proofs::guarded::guarded_segment_proof::tests:: -- --nocapture
```

## Explicit remaining F2/F3 work

The old attack experiments are useful designs, not current acceptance evidence. Their executable grammar has been removed. The following work belongs in current Native tests and qualification; deleting old runners does not mark these items complete.

- **F3: complete opening/reduction adversaries.** Against the selected phased adapter, construct valid inner openings with false terminal values or compensating compiler reads; construct excessive-degree claims whose sampled equations are consistent; separate terminal-weight and final-sample rejection. Cover both extension branches, zero tails, every terminal coefficient and phase/role splice. Existing transcript, raw residual and ordinary byte-corruption tests cover parts of this boundary, not this entire adversarial matrix.
- **F3: genuine membership adversaries and soundness.** Exercise false ranges, changed ROM tuples, multiplicities and each advice tail using genuine authenticated branches against the complete selected membership verifier. Preserve the adaptive-after-challenge advice counterexample as a test of the required phase ordering. Complete the composed extraction/base-membership argument and parameter analysis separately; no finite test establishes 128-bit security or zero knowledge.
- **F2/F3: complete current Street history.** Run the current selected segment prover and independent verifier for full eight-car history with every retained checkpoint, malformed retained evidence and terminal suffixes. Measure actual proving memory/time, byte sizes and validator work. Prior frozen whole-race input tapes or component performance numbers cannot supply these results.
- **F2: actual maintained export and consumers.** Qualify the Core-owned browser export and rerun browser/native all-node parity and real worker/retained HTTP consumers against fresh authenticated artifacts. Preserve wallet/network/finality and fee admission checks.

These are open acceptance requirements. No Taira activation, cryptographic security level, full-race proof or deployment readiness follows from this code cleanup.
