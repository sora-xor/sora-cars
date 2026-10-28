# Native authenticated lookup proof

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


September 8, 2026. A complete native prover and independent verifier now run for
the closed arithmetic laboratory computation. This connects the exact compiled
AIR to range lookups, commitments, composition, DEEP openings and FRI. It is a
working bounded implementation, **not an admitted Street proof or a 128-bit
security qualification**.

The source and test identities are recorded in
[the evidence manifest](../../artifacts/native-lookup-proof.json). The earlier
[protocol proposal](LOOKUP_PROTOCOL_V1.md) is retained at its recorded version;
the degree correction below supersedes its plain-DEEP FRI bound.

## Computation and public statement

The closed [fixture](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_fixture.rs) has three transitions from state −9.
Each transition adds signed thrust, performs signed truncating division and
Euclidean remainder, checks negative/equal conditions, clamps the quotient and
selects either the new state or the previous state with a Boolean active flag.
This exercises signed ranges, comparisons, division/remainder, inactive
branches, repeated exact widths and state carry through the same native scalar
and immutable stage/outer exports used by Street.

The fixture has 24 witness columns and 15 actual rows. It retains 198 original
polynomials, 138 exact memberships and 17 outer equalities across the three
steps. Five distinct tables use widths 2, 3, 4, 7 and 8. Nineteen inverse columns
serve the actual queried witness columns; separate width sums retain duplicate
occurrences. The original witness columns have explicitly constrained zero
padding to the fixed 256-row proof domain. Multiplicity and lookup auxiliary
columns follow their own full-domain predicates.

The verifier selects this compiled fixture from code. Proof bytes cannot upload
a replacement graph, table, width, schedule or public boundary map. The complete
compiled descriptor is bound in the transcript; a semantic label alone does not
stand in for the equations.

The caller supplies the expected network identifier, execution identifier,
dispute epoch, history label, exact public actions and final outputs independently
of the proof. Canonical decoding requires exactly three action rows and five
final outputs. These context bytes are bound, but this laboratory does not
authenticate them against a ledger or signatures. In particular, a field named
`accepted_history` does not establish its acceptance or authenticate a preimage.
The bundled default identifiers are synthetic laboratory identifiers, not Taira.

## Implemented proof path

The five new modules separate public admission, arithmetic, proof construction
and verification:

| Module | Responsibility |
| --- | --- |
| [lookup_common.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_common.rs) | Fixed parameters, execution-only domain, canonical field/digest readers and four-MiB proof writer. |
| [lookup_air.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_air.rs) | Immutable sparse selectors, exact stage/outer/padding equations, range multiplicities and auxiliaries, composition evaluation and quotient construction. |
| [lookup_pcs.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_pcs.rs) | Native column commitments, all OODS claims, joint DEEP binding, FRI, canonical multiproofs and strict proof codec. |
| [lookup_fixture.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_fixture.rs) | Closed arithmetic computation and separate honest witness generation. |
| [lookup_protocol.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_protocol.rs) | Complete statement binding, challenge order, quotient check and composed prover/verifier. |

The actual sequence is:

1. Bind the full compiled descriptor, fixed parameters and public statement.
2. Commit original witness columns and exact table multiplicities before the
   lookup challenge `β ∈ Fp4 \ Goldilocks`.
3. Commit the query reciprocals, weighted table reciprocals and cyclic running
   sums; then derive the composition challenge `θ`.
4. Construct `C/(X^256−1)`, reject nonzero remainder or excess degree, and commit
   two quotient pieces of degree below 256.
5. Derive `ζ` outside the base field. Bind every base, auxiliary and quotient
   evaluation at both `ζ` and `gζ`; check the quotient identity at `ζ`.
6. Derive the DEEP batching challenge and commit `X·D(X)`. Authenticate original
   column openings at every initial `x,−x` query and reconstruct that exact value.
7. Verify all eight binary FRI folds, all native multiproofs and the complete
   16-value terminal vector with its constant-degree check. The 96 distinct
   initial query pairs come from the completed transcript.

All original polynomial bank slots remain. Coefficient selectors have their
actual interpolation degree; local quadratic degree two is not treated as total
polynomial degree two. Lookup table padding, inactive inverses, per-width
multiplicity counts, closing cyclic equations and running-sum origins are
explicit constraints. The verifier recomputes fixed selectors and reads no
witness, honest generator, raw trace or replay to accept a proof.

Canonical proof bytes contain fixed-version framing, compiled/public digests,
three phase roots, fixed-count OODS values and the complete PCS payload. Widths
and geometry come from the compiled relation. The outer and inner readers both
require exact end-of-input. Base opening cells occupy one field word;
extension cells use four canonical words. Whole proof size is capped before
decoding, and encoding checks the cap before allocation/copy.

## Degree correction found during review

The original proposal gave plain DEEP polynomial `D` degree at most 254, but eight
binary folds ending in a constant only enforce the rounded bound 255. That
could leave an original degree-256 oracle within the rounded DEEP allowance.

The implementation commits and tests `X·D` instead: honest degree at most 255
aligns exactly with the eight-fold constant bound. Initial bindings multiply by
the actual signed query point. A coherent degree-256 candidate is now assembled
by a test-only malicious prover, encoded, decoded and submitted to the unchanged
verifier. Its native openings, 192 initial bindings and 768 fold equalities are
consistent; verification rejects its terminal degree with `FriDegree`.

This correction does not by itself prove the joint DEEP/FRI reduction. With
malicious OODS claims, the DEEP expression can be rational; no unconditional
inference that it is a polynomial is made. The modified reduction, oracle counts,
proximity bounds, transcript adaptivity and hash assumptions still need a
composed security analysis. See the [adversarial review](LOOKUP_ADVERSARIAL_REVIEW.md)
and [protocol review](LOOKUP_PROTOCOL_REVIEW.md).

## Executed evidence and measurements

The final combined native run passes 22 tests: 20 tests across the five new
modules and two matching existing lookup regressions. The AIR tests include
520 raw-cell mutations, fixed and contradictory queries, exact partial widths,
shared inverses with duplicate occurrences, last-row cyclic closure, padding,
changed public inputs and a coherent one-stage splice. PCS tests cover every
oracle role, OODS point, frontier, layer and terminal cell, and the coherent
degree attack described above.

Three deliberately false computation candidates have internally valid PCS
proofs. They represent zeroed computation columns, omitted lookup auxiliaries,
and a false zero quotient. Each passes separate PCS verification, then fails the
actual composed verifier's OODS identity. Rejections therefore do not depend
solely on an honest prover refusing to produce a candidate. Other tests alter
network, execution, epoch, history, actions and final claims, including after
retagging the two header digests.

The CLI test invokes separate native processes. It removes the expected witness
pathname before verification, reproduces identical proof bytes in a second prove
run, rejects nine malformed/context/overwrite commands and preserves an existing
proof on an attempted overwrite.

| Single-run measurement on this Mac | Result |
| --- | ---: |
| Complete arithmetic proof bytes | 466,600 |
| Native proving time | 1,205.24 ms |
| Separate verifier time | 175.43 ms |
| Prover process peak RSS, including self-verification | 21,577,728 B |
| Separate verifier process peak RSS | 4,898,816 B |

Compilation is excluded. Times come from the CLI's monotonic clock; RSS comes
from `/usr/bin/time -l`. These are one-run laboratory measurements, not full-race
or validator admission benchmarks. The PCS component's independent 248,240-byte
fixture is a different proof and is not this complete arithmetic result.

The complete proof SHA-256 is
`1166ff3f6bfb6d9404e0c697699a092b09aa96bef584c5d73dc342488cf7da40`.
The [CLI evidence](../../output/qualification/native-lookup-cli/cli-report.json)
retains the exact commands, results, bytes and timing logs.

## Native CLI and reproduction

Builds freeze whole, unchanged Iroha field, execution Poseidon2, FFT, transcript,
Merkle and FRI modules. They use the retained Rust 1.93.1 compiler and already
compiled, hash-pinned dependency artifacts. The compiler, 404 cached artifacts,
native archives and source identities are checked. No Cargo or dependency build,
maintained Iroha edit, source substitution or success-returning verifier shim is
used. This retained build corridor is not a current whole-Iroha release build or
cross-target/accelerator qualification.

The original build and CLI commands remain in the
[retained CLI report](../../output/qualification/native-lookup-cli/cli-report.json)
and its source snapshots. The old standalone runner, CLI helper and recorders
have been retired; these September artifacts are historical evidence, not an
operational dependency or a current proof format. Do not rebuild this old
laboratory against a newly generated Street bundle or relabel its timings as
current results. Current execution and bundle validation uses the maintained
[Native test and CLI paths](../../docs/native-public-game-bundles.md).

## Remaining qualification

The actual eight-car Street schedule does not fit this 256-column profile. Its
complete relation, first-terminal result, signed pending/history suffixes,
disputes and global game padding still need an admitted proof layout. Increasing
caps or omitting constraints is not a solution to proof-size and resource costs.
The current implementation materializes bounded laboratory LDE matrices; full
races need measured bounded-memory proving and an adequate opening/aggregation
design.

At-least-128-bit composed soundness and external cryptographic review remain
open, as do supported targets and accelerator parity, full-race proving costs,
generic consensus/custody/settlement, finalized inclusion, human/validator
integration and Taira/SoraFS deployment. No live XOR settlement is enabled by
this experiment.
