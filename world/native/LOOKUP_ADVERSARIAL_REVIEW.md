# Native lookup candidate: adversarial review and closed fixture

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


September 8, 2026. This review concerns the first bounded native lookup proof, not Street settlement. It records one correction to the frozen [candidate protocol](LOOKUP_PROTOCOL_V1.md), an attack matrix for the actual authenticated verifier, and a measured arithmetic fixture. The prior protocol document remains unchanged. Neither this review nor the raw fixture measurements establish composed cryptographic soundness.

## Correction adopted before the PCS implementation

The candidate sets `n=256`, expects the combined DEEP polynomial `D` to have degree at most 254, and uses eight binary FRI folds followed by a constant terminal. Those folds alone admit initial polynomial degree **255**, not 254. The native aggregate helper computes the maximum admitted input degree as

```text
(terminal_degree + 1) × 2^folds − 1 = 255.
```

A coherent counterexample to the claimed degree alignment is `P(X)=X^256` with correct claims `P(a)=a^256`. Its divided difference

```text
(P(X)−P(a))/(X−a) = Σ_{i=0}^{255} X^(255−i) a^i
```

has degree 255. It folds to a constant after eight rounds for every fold challenge, although the original oracle violates `deg P<256`. This is an exact degree-accounting defect; it does not by itself construct a false accepted execution proof.

The team accepted the following amendment: commit and FRI-test **`E(X)=X·D(X)`**, and multiply the reconstructed initial DEEP value by the actual signed coset point at both members of every query pair. The intended honest bound becomes `deg E≤255`, exactly aligned with the native terminal check. An uncancelled original degree-256 term then gives degree 256 in `E`, leaving a nonzero linear terminal coefficient after eight folds. The strengthened PCS test constructs a coherent higher-degree oracle outside its honest low-degree constructor and uses a test-only assembler to complete the malformed proof. Its 245,488-byte canonical encoding round-trips, all native multiproofs, 192 initial bindings and 768 fold checks pass independently, and the unchanged production verifier rejects it with `FriDegree`. Direct degree-255/256 folding controls also pass. This closes the earlier test-coverage gap in which only the prover's terminal guard rejected the coherent candidate.

This alignment is conditional on the polynomial/opening reduction. Inconsistent out-of-domain claims make `D` rational, and batching can cancel terms with small probability. For example, a mixing challenge of −1 can cancel the leading terms of the two divided differences of one polynomial. Zero is also a possible full-field batching or folding challenge. Do not retry those values merely to make an adversarial test deterministic. Account for the relevant exceptional probabilities and joint DEEP/FRI proximity argument; do not state that one FRI check deterministically proves each individual oracle's degree. Because both opening points are nonzero, multiplying by `X` does not cancel an erroneous claim's pole at either opening point.

## Native API integration checks

The native `fri_fold_pair_fp4_v1` computes the even/odd binary fold from authenticated values at `x` and `−x`. The fixed FFT ordering pairs indices `i` and `i+size/2`. After a fold, the domain is squared: the coset shift is squared as well as the root of unity. A query follows index reduction modulo the next domain size. Reversing this pairing or using the original coset shift at later rounds breaks the relation.

`ensure_fri_terminal_degree_fp4_v1` checks the complete vector with an inverse FFT and rejects every forbidden coefficient. It checks the terminal polynomial's bound, not the desired pre-fold bound unless the degree alignment above is enforced. At the selected length 16 and degree zero, all 16 values must be the same extension value. Checking sampled terminal cells alone is insufficient. A fully supplied terminal vector can be bound directly into the transcript before deriving queries; a separate terminal Merkle tree is unnecessary when that complete vector and all final folds are bound consistently.

`derive_unique_query_indices_v1` returns an ordered unbiased sample, not a sorted set. Sample 96 distinct representatives in `[0,2048)`, then derive and canonically sort the paired opening indices. At later rounds, paths overlap: deduplicate by the exact derived index while checking every original query's fold. Never accept prover-supplied indices, counts, or an early query subset. The sampled 96 pairs are correlated through shared later paths; they are not 96 independent terminal experiments for a security estimate.

Both `P(ζ)` and `P(gζ)` must refer to the same committed polynomial. Reconstruction at a queried `x` uses that same authenticated `P(x)` in both divided differences, with denominators `x−ζ` and `x−gζ`. It must not substitute an unauthenticated next-row value or a separately committed shifted polynomial. Every witness, multiplicity, auxiliary and quotient-piece column must participate, including columns absent from a particular composition expression. In the measured fixture this is 60 polynomials and 120 point claims.

The viewed new `lookup_pcs.rs` uses three closed roles, includes ordered roots/widths in its OODS transcript, reconstructs `X·D` from all opened role rows, derives all indices internally, checks native canonical multiproofs at every layer, and tests all terminal values. This was a read-only spot review during implementation, not a complete cryptographic audit. Its caller still has to supply verifier-derived expected descriptors and the proper transcript state after the lookup/composition phases. The recorded four-test PCS run passed, including the strengthened actual-verifier degree test above. The production PCS prefix stayed unchanged while adding its test-only malformed-proof assembler.

## Lookup and AIR obligations that must remain explicit

All `W` and `M` commitments must precede `β`; all challenge-dependent `I,U,A` commitments must precede composition challenge `θ`. Commit quotient pieces before `ζ`, and bind both evaluation lists before deriving DEEP mixing. A valid Merkle opening with a caller-selected transcript is not the required protocol.

For each width, count **all** membership occurrences across all three steps, including duplicate occurrences and fixed queries, as an ordinary integer before reducing coefficients into the field. Require the total to be less than `p`. The fixture counts are only 36, 36, 12, 6 and 48 for widths 2, 3, 4, 7 and 8. The characteristic condition is therefore comfortably satisfied. This condition concerns each entire batched identity, not just one step or one table row.

With distinct verifier-fixed table values and those counts below `p`, ordinary field multiplicities do not require recursively proving their integer ranges. The conventional argument is that an out-of-table value's positive integer multiplicity cannot vanish modulo `p`; a rational identity would retain its pole. This reasoning requires the pre-challenge commitments and the authenticated degree/opening reduction. A single honestly generated reciprocal sum is insufficient evidence. Full composed soundness remains open.

One inverse may serve repeated queries of a column, but width-specific selector coefficients must preserve every occurrence. The union-of-query selector `e_c` is Boolean; the separate `s_bc` values are occurrence counts. Do not replace counts by presence bits. Do not conflate exact top widths with 8-bit tables. Known invalid fixed memberships must reject; valid fixed memberships contribute their compiled reciprocal terms and query counts.

Original-witness global padding and lookup auxiliary padding are different. In the 15-active-row fixture, all original witness columns are explicitly zero on rows 15…255, and original gates/carries are disabled there by fixed selectors. But table multiplicities may occupy the entire 256-row table; weighted table reciprocals and accumulators can remain nonzero after row 14. Zeroing all auxiliary padding would destroy honest lookup identities. The cyclic accumulator must close from row 255 to row zero, with its origin bound to zero. Intermediate accumulators are not public action/state claims.

Selected carries can be expressed as forward-shift relations anchored on the preceding row; both the stage and outer state carries in this fixture connect adjacent actual rows. Initial/final equations use their exact compiled row selectors. The final output belongs to row 14, not row 255. The fixture intentionally defines a three-step arithmetic computation with no gameplay terminal predicate. It cannot admit a completed Street result.

## Required adversarial matrix

The following cases must target the authenticated verifier. Where stated, construct internally coherent commitments and auxiliary data rather than relying only on bit-flipped proof bytes or refusal by an honest witness generator.

| Area | Required adversarial case and expected rejection |
| --- | --- |
| Degree alignment | Commit a degree-256 oracle with correct OODS values outside the honest constructor; the composed `X·D`/FRI path rejects unless a batching exceptional event occurs. Also retain a valid degree-255 control. |
| Joint opening | Supply an independently valid FRI proof for an unrelated oracle; initial authenticated reconstruction must reject. Change a valid shifted claim while retaining the original group commitment. Include an otherwise unused output column. |
| Shift/index convention | Swap the ± half-domain values, use `gζ` with a wrong root, skip coset-shift squaring, move an opening to another valid in-range index, and exercise later path collisions. |
| Terminal | Alter an unqueried terminal entry, provide the wrong terminal length, omit one fold, or replace a later root while keeping a matching local opening. Check the whole terminal and every queried inter-layer fold. |
| Challenge phases | Try post-β multiplicities, post-ζ quotient choices, reordered role commitments, reused challenge labels, base-subfield β/ζ, and witness-dependent challenge retries. |
| Range membership | Use polynomial-valid limb aliases such as low limb `+256` with the next limb `−1`; both local reconstructions can stay valid while exact membership must fail. Cover an exact partial-width overflow separately. |
| Multiplicity | Omit one repeated value, collapse repeated width occurrences to one, move multiplicity to a different width/table value, or write nonzero table-padding multiplicity. |
| Accumulator | Omit the last cyclic transition, shift the accumulator origin, set inactive reciprocal advice nonzero, or fabricate a fixed-value reciprocal contribution. |
| Original AIR | Change an inactive comparator slack coherently, forge signed division or Euclidean remainder, omit an eager identity, or use an invalid branch despite a locally valid selected output. All scalar equations remain in the composition. |
| Cross-step/public binding | Splice a valid standalone step with the wrong incoming state; alter one public action while keeping the old proof; alter any final output, including an auxiliary output. Reject shortened/extra tapes and wrong initial/profile/network labels. |
| Canonical framing | Reject noncanonical F/Fp4 words, wrong role widths, missing/extra/duplicate/reordered frontier material, wrong roots, truncated/trailing bytes, and over-limit counts before allocation. |

The earlier row-commitment integration's wrong-width/height cases tested malformed framing/index admission. They do not replace valid-shape domain/position attacks above. Current raw stage/export tests are useful controls, but proof rejection must come from the new authenticated composition/lookup/opening verifier.

## Closed fixture and measured size

The shared constructor is [lookup_fixture.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_fixture.rs). `compile()` reads no witness or public action tape. It fixes limb mode 8, bank size 16, three steps, initial state −9 and the following computation:

```text
state ∈ [−511,511], thrust ∈ [−7,7], divisor ∈ [1,7], active ∈ {0,1}
sum       = state + thrust
quotient  = truncation_toward_zero(sum / divisor)
remainder = Euclidean_remainder(sum,11)
negative  = sum < 0
divisible = remainder == 0
next      = active ? clamp(quotient,−511,511) : state
outputs   = [next, quotient, remainder, negative, divisible]
```

The default public actions are `[4,3,1]`, `[7,2,0]`, `[7,2,1]`. The outputs are respectively `[-1,-1,6,1,0]`, `[-1,3,6,0,0]`, `[3,3,6,0,0]`. This covers negative division, the distinction between truncation and Euclidean remainder, both signs of a comparison and an inactive state update. Additional raw cases cover both clamp limits and a zero remainder.

The compiled fixture has 71 raw wires, 66 polynomial equations and 46 lookups per step. All five outputs are retained. Its exact partial-width histogram is `{2:12,3:12,4:4,7:2,8:16}`. Across three steps, 25 `(width,value)` keys repeat, with a maximum honest multiplicity of 18. These are actual repeated queries, not fabricated counts. The release helper does not expose an unchecked same-wire duplicate-membership constructor; a dedicated closed compiler test is still needed for that distinct edge case.

| Bank | Stages/step | Actual rows | Width | Inverse columns | Carry/step | Zero/step |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 16 (selected) | 5 | 15 | 24 | 19 | 26 | 27 |
| 32 | 3 | 9 | 41 | 33 | 13 | 43 |
| 64 | 2 | 6 | 66 | 46 | 7 | 58 |
| 128 | 1 | 3 | 67 | 46 | 0 | 0 |

The selected layout retains 138 membership occurrences and 17 outer equalities. Tables have 412 total entries across five separate width tables; their largest table has 256 rows, so common `n=256` is sufficient. The packed LDE dimension is 5,013,504 bytes: 29 base columns, 29 Fp4 auxiliary columns and two Fp4 quotient pieces over 4096 rows. This excludes coefficient/FFT buffers, Rust representation overhead, selectors, trees, FRI, decoded proof and allocator effects. It is **not measured prover RSS**. Base rows represented as Fp4 values in a prototype cost more memory than this packed estimate.

`validate_actions` enforces exactly three rows and the fixed control ranges without computing a final result. Proof admission must call it: `execution()` deliberately wraps the generic prefix verifier, whose maximum-length check alone permits shorter tapes. `honest_trace` is explicitly separate prover functionality; the verifier must never derive or replace its public final claim through that method. `RELATION_ID` and `RELATION_SPEC` must be absorbed alongside the actual compiled descriptor and public statement; the semantic string alone is not a hash of exported equations.

All seven measured bank sizes passed raw streaming and outer equality checks. Two focused shared-constructor tests passed; the integrated constructor's measurements exactly match the initial output-only prototype. Evidence and source pins are in [the fixture report](../../output/qualification/native-lookup-fixture/report.json). Only standalone `rustc` was used; no maintained Iroha sources, Cargo targets or dependencies were changed. This small relation is a component milestone and does not replace the full Street proof, terminal/history admission or deployment goals.

## CLI and authenticated rejection review

The native laboratory CLI requires `verify EXPECTED_STATEMENT PROOF`. Its verification branch reads the independently supplied expected statement and proof bytes, invokes the composed verifier, and has no fallback to fixture generation, raw witness files or replay. Setup recompiles the closed relation and derives its descriptor and public digests from that statement; it does not execute the action tape. The placeholder network/history bytes remain externally supplied context, not authenticated ledger facts, and the CLI reports `ledgerAuthenticated:false` and `securityQualified:false`.

Input reading checks both initial file metadata and a capped `cap+1` read, rejecting files that grow beyond the limit. The statement has a 4096-byte CLI ceiling, proofs the fixed 4 MiB ceiling, and witness input exactly 15×24×8 bytes. Statement and proof decoders check canonical field words, exact fixed counts and end-of-input. Output files use `create_new` and are synchronized after writing; existing destinations are never overwritten. The fixture command writes two separate files and does not claim that directory creation is transactional.

The new composed-protocol adversarial test creates three internally consistent low-degree commitments/PCS proofs: all-zero execution columns, honest base columns with missing lookup auxiliary columns, and honest base/lookup auxiliary columns with a zero quotient. It verifies each PCS proof separately with the same prior transcript, canonically encodes the complete candidate, and checks that the actual composed verifier rejects it specifically at the OODS quotient identity. Thus rejection is not merely an honest witness generator refusing bad rows or an unauthenticated polynomial assertion. These three cases do not replace the full matrix above.

The protocol's production prefix is byte-for-byte identical to the original reviewed revision; only tests were added in this pass. The fresh combined component log reports 22 passed tests, including the three authenticated rejection modes, and the CLI builds without compiler diagnostics. This review did not rerun those builds or operate the CLI; its independent work was source comparison, source-pin checks and inspection of recorded logs.

## Reviewed source identity

The raw fixture used these frozen sources:

- `checked_constraints.rs`: `d59444aed179f2159898e88e37ca493ea45ba1a49169586514d5c0d9abde53e4`
- `staged_constraints.rs`: `5698a3f23307b16c59bd950c46830bc70650f18db3ee12ef20cdc7726c2ef97a`
- `execution_trace.rs`: `587e6e495586862cc88af61c0a4ca57825ac28ee2d4d744ab2d2888071d94d4a`
- `lookup_fixture.rs`: `c339e53bec9ec365c5b0c929a099279599db8ef298a4178fa2d57956a914d80c`

The native fold/terminal API inspection refers to the unchanged execution transparent substrate `86f684bddd22e4f59f328a6096c6cf647b142b917c6773444e5f11c692b481cd` and aggregate substrate `b16e8e505a1bcbc99584807ef06f66ad723cfc95ee9fa0c618a7914f0f28db0d`.

Final reviewed implementation pins:

- `lookup_pcs.rs`: `8326721515a95b95f1384ce053d0dce5cec4f6cfa13bb13d2b40cba4439869ea`; unchanged production prefix `d6f97e99301706fd14449543aa9d56ea71a0af370fca03bf7beb4aafe5f975e6`.
- `lookup_protocol.rs`: `19dff477afd0daff731c5e065e5a4c298da6a96c3a16e5f24368a852fe03c748`; production prefix `650bf9a4b3e28fc5fbb6162d493b9948fcd2b091fb24802f13e73d2c88e5ae31`, identical to original full revision `b915f5aea0340391054a4fa5e1c2e50684240bc3cc4b2abdd1d446b29b3d9292` before its test-only additions.
- `scripts/native/native_lookup_cli.rs`: `3a5c6ffa583d45b7de93c2653c3b3aca76c7f84f2da09c94d4bc2ebb6dd0d3b1`.
- Four-test PCS [build report](../../output/qualification/native-lookup-pcs/build-report.json): `dbb10648271d3d2f006551b24b67db81ec6dc7a7add2a265af0b3523b79b2720`.
- Twenty-two-test combined [build report](../../output/qualification/native-lookup-combined/build-report.json): `dce43e84089176504ec19c975c5f1c34576301cc5151b7950c45e42be79cede7`.
- CLI [build report](../../output/qualification/native-lookup-cli/build-report.json): `c65164f527d730e5801b318857bcc9f36bd3dd383299425b57f7f64f6f1ba9c8`.
