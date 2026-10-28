# Native Street contract in accepted-history verification

The accepted-history laboratory now calls the real
`iroha_core::execution_proofs::street_v1` contract for controls, state roots,
transcript prefixes and terminal rankings. This connects the
[shared native contract](native-street-contract.md) to the complete guarded
computation verifier. It does not register Street, authorize removals, establish
ledger inclusion or enable settlement.

## Ownership and binding

`world/native/accepted_history.rs` requires a compiled `PrefixRoot` callback.
There is no default input-prefix hash and no alternate-domain fallback. The
callback receives the same immutable selected session, policy and complete
transcript used by history validation. Every checkpoint and retained anchor
uses it. The old laboratory prefix exists only in a synthetic test application.

`accepted_guarded.rs` passes that same immutable session to the compiled state
callback at genesis and the checkpoint. It still verifies the exact emitted
boundary and motion descriptors, input maps, carry map, genesis and codec
before checking the execution. Application callbacks are executable verifier
code; neither proof bytes nor profile registration can supply them.

The Street CLI derives its layout from the same compiled route, milestones and
ordered roadside objects as the graph builder. Oil indices supply the immutable
object bits. The manifest must contain the exact selected relation and geometry.
The native contract validates canonical six-byte controls, including unused
suffixes, exact state dimensions and status invariants, and every final rank
and winner. The complete terminal boundary remains in the result bytes.

The native prefix binds network, session, profile, concrete relation and logical
tick. It includes the whole partly consumed batch and only removals strictly
before that tick, after validating the complete supplied suffix. Pending
commitments and current reveals are not accepted driving inputs. Raw S0 remains
the original grid; a removal-adjusted B0 never becomes genesis or the input to
the first motion step. A checkpoint checks the raw state before its boundary's
removals; the final result comes from the verified terminal boundary.

The compiled codec identity now includes the native-prefix contract. New
fixtures, signatures, statements and proofs are required. Historical evidence
is retained as history, never accepted through a compatibility path.

The three laboratory commitment helpers now use the existing production
`goldilocks_digest384_frame_v1` API. Each caller already owns a complete byte
slice; the native framed implementation absorbs the borrowed slice with a
fixed-size sponge. This resolves the current native streaming helper's
test-only visibility without enabling test configuration in the CLI. Separate
tests exercise the actual three call paths against the streaming reference,
covering all nine labels, empty input, rate/chunk boundaries and one-MiB
boundaries. This is API/framing parity, not a new hash-security argument.

## Validation

[Attempt 4](../output/qualification/native-street-accepted-contract-attempt-4/report.json)
passes its current Core build, normal CLI link, separate libtest link, **74 tests**,
**eight fresh proofs** and **six positive public-input verifications**. Its 52
retained command receipts include 22 accepted CLI invocations and six expected
rejections. The report SHA-256 is
`a51d7823e30e9ce89d2b27dc0b468c674ca9d670b7bd4fa3576bd0449eef57b9`.

The runner selects eleven direct libraries from actual current Cargo artifacts
and exact dependency edges. It uses the isolated native worktree's existing
warm target, normal production CLI configuration and Apple linker; it does not
link a retained model facade. Source/library hashes are checked around use.
The recorded inventory is not a complete transitive-source or system-library
closure.

The regressions cover transplanted network/session/profile context, changed
geometry/caps/rosters, impossible state flags, noncanonical controls, unused
suffix bytes, old laboratory prefix separation, mandatory callback errors and
the same session at genesis/checkpoint. Digest tests compare all three real
helper paths with the native streaming reference. Finalized-history fixture
tests pass, but use synthetic merge material; the compiled finalized CLI's file
transport is not exercised by this runner.

Fresh proof cases cover two-car genesis technical wins and all-forfeit refunds,
two- and eight-car six-tick motion, an eight-car genesis technical win, a signed
incorrect checkpoint, an archived result and an incorrect archived outcome.
The independently parsed envelope contains **44 ordered boundary/motion
components** across the eight files. False checkpoints and false outcomes are
rejected, as are trailing, truncated and altered proof bytes and a substituted
snapshot pin. Each positive verification reads a separate directory containing
only the session, evidence, selection and proof. This demonstrates a public-input
verification path; the filesystem itself is not isolated from the retained
witness in the parent fixture directory.

Representative complete-process measurements from this single run:

| Fixture | Simulated ticks | Proof bytes | Proving | Verification | Prover peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Two-car motion | 6 | 6,652,185 | 30.48 s | 13.94 s | 193.33 MiB |
| Eight-car motion | 6 | 10,836,761 | 234.13 s | 82.58 s | 1,593.09 MiB |

Six ticks are **0.2 simulated seconds**. Timings include CLI source construction
and file work, but exclude the runner's surrounding source/artifact hash checks.
The current Cargo family differs from retained earlier measurements; there is
no cross-family speedup or historical proof-byte parity claim. These are
locally signed synthetic session records, not native admission, authorized
ledger removals, finalized Street sessions or settlement.

The first three failed attempts remain intact: [attempt 1](../output/qualification/native-street-accepted-contract-attempt-1/report.json)
identified the test-only streaming API, [attempt 2](../output/qualification/native-street-accepted-contract-attempt-2/report.json)
identified an ambiguous empty-slice test assertion, and [attempt 3](../output/qualification/native-street-accepted-contract-attempt-3/report.json)
correctly rejected a false checkpoint but exposed an incorrect harness expectation
for the CLI's Debug-formatted error. Attempt 4 changes only those three diagnostic
expectations relative to attempt 3; it regenerates and verifies the entire matrix.
A separate read-only rustfmt check reports style differences in the laboratory
modules; no formatting pass is claimed for this candidate.

The [independent retained-evidence audit](../output/qualification/native-street-accepted-contract-attempt-4/audit.json)
passes with SHA-256
`de891b360a1fc6bc55f59c6e53986cb7e56b01cccaabbe0bb9aa239907cc1122`.
It checks all 74 actual unique test names, proof framing, public-input invocation,
exact rejections and 481 file identities, including eleven direct Cargo libraries
and fourteen mapped runtime libraries from the exact Rust toolchain. It does
not rerun native code or independently rehash every transitive/system library.

## Profile family and concrete instance

The current laboratory profile is still derived from a roster-specific relation.
That is not the final native admission design: Open freezes the profile before
the final roster exists. The native profile must identify an immutable compiled
family; canonical track parameters and the admitted roster determine its exact
instance at Start. Start and verification must derive the same instance without
changing the family ID or trusting an instance digest supplied by a proof.

The instance must bind complete emitted boundary/motion descriptors, maps,
carry, genesis, policy, geometry/ROM constants and codecs. A layout hash or
generator-source hash alone is insufficient. Manifest and roster commitments
can bind the deterministic instance inputs without adding a mutable instance
field. If equipment changes physics, the resolver must consume validated
admission/resource data as well as participant count.

This resolver and genuine verifier must exist before adding an adapter to the
closed registry. An incomplete adapter with `qualified=false` would still admit
free sessions and is not an acceptable placeholder. The current registry remains
Race-only; the user-facing lifecycle and instruction architecture remain generic
for games.

## Remaining qualification

The short eight-car proof previously exceeded the native envelope budget. This
contract migration does not reduce that size or establish a 128-bit composed
security argument. Full-duration proving, complete retained salted input
evidence, legal native dispute history, finalized producer-to-verifier transport,
atomic settlement and actual multi-validator testing remain necessary. The
maintained `iroha` optimizations checkout and live Taira/SoraFS deployment are
unchanged by this candidate.

The [September cryptography briefing](research/september-2026-briefing.md) and
[September 9 primary-source refresh](research/2026-09-09-primary-source-refresh.md)
explain why accumulation and authenticated lookups are the next scaling
experiments after binding the complete native computation.
