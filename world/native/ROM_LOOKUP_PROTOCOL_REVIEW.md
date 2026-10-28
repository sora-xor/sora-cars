# Native ROM lookup protocol design and review

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


September 8, 2026. This document specifies the bounded native ROM lookup attachment and records its independent source/evidence review. It builds on the [measured layout decision](STREET_PROOF_LAYOUT.md) and [existing native lookup laboratory](NATIVE_LOOKUP_PROOF.md). The tested execution scope below is a closed indexed-read laboratory, not a full Street proof, consensus adapter or 128-bit soundness certificate. No maintained-Iroha source, Cargo or dependency build is part of this review.

## Exact compiler-owned reads

Replace only the expanded fixed-table output sums with explicit read obligations. Retain the reference scalar implementation for equivalence tests. A read consists of one bounded index wire and every requested output-column wire, with an immutable equation anchor and table-column identity. All requested columns share that read's index identity. The compiler owns the complete table bytes, row count, min/max values and namespaces; proof bytes cannot provide alternative tables or weaker bounds.

The helper API exports `FixedRomTableView { table_id, column, low, high }` and `FixedRomLookupView { table_id, index_wire, value_wire, equation_anchor }`. Identical complete column vectors may be interned by the compiler, but requested occurrences—including duplicate or fixed-value reads—must remain. Distinct contents, row order, length or values cannot acquire the same identity. The scheduler must carry both nonconstant operands to the obligation's anchored row and export their actual staged bindings. A reused physical column is not a permanent wire identity.

The raw verifier must test the actual tuple `table[index] == value` independently of witness recipes. The proof attachment must consume the same detached table/read records. The previous range-only AIR must explicitly reject a compiled program with ROM obligations until it has a ROM attachment; successfully proving only its remaining scalar/range subset is invalid.

For a table column with **real** row count `R`, exact min/max `L,U`, bounded index `i` and signed value `v`, use:

```text
K_table(i,v) = i + R*(v-L) in Goldilocks F
0 <= i < R <= 4096
L <= v <= U
R*(U-L+1)-1 < 2^63 < p
p = 18446744069414584321
```

These are actual proved input/output bounds, not metadata assumptions. The helper's strict integer endpoints inside ±2^50 imply `U-L < 2^51`; checked host arithmetic must additionally validate the displayed key ceiling. Integer equality follows from canonical field equality without wrap. Reducing equal integer keys modulo `R` recovers the same index, then the same value. Repeated equal table values therefore remain distinguishable by row.

Independent index bounds are essential: `(i=R,v=a-1)` collides with `(i=0,v=a)` even before field reduction. Signed output ranges and the no-wrap ceiling are equally essential. `R` is 1,403 for Tokyo's adjacent-interval table, whose source road has 1,404 sample rows; it is not the padded proof size 2,048.

Do not create an ordinary integer `Wire` for a key potentially approaching 2^63. The existing bounded integer API does not support that range. Evaluate the affine expression directly from the committed, already bounded index/value columns. A materialized key would instead need a private field-key type and its defining polynomial; widening ordinary integer metadata is not a constraint.

## Namespace and inverse-column discipline

Each range width and each distinct canonical ROM column is a separate lookup namespace. Its fixed table, multiplicities and accumulator are independent. Combining their sums would permit a query for one table to be matched against another. The affine key does not itself encode the namespace; separation is therefore part of the compiled relation and descriptor.

Use an inverse cache keyed by the **entire static affine expression**, including index binding, value binding, `R` and `L`. Range inverses and ROM inverses are distinct unless their full expressions are intentionally proven identical. Output column alone is not a valid cache key: two simultaneous ROM queries can have the same value-column binding and different index/table keys. Reuse between identical expressions is allowed even across different namespaces because their accumulators still count the occurrences separately.

A compiler-interned duplicate column is one canonical namespace with multiple retained read occurrences. Do not count one inverse once when its query appears twice; inverse reuse saves columns, not membership multiplicity. Fixed queries must either be rejected immediately when contradictory or be represented as explicit fixed contributions. No all-constant, disconnected, inactive or unselected read is silently removed merely because it cannot influence a selected display output.

## Pre-challenge multiplicities and complete lookup equations

Let `H={g^r: 0<=r<N}`, and let `T_k(r)` be namespace k's fixed encoded table entry for `r<R_k`. Extend its table polynomial to N rows with a specified zero value after `R_k`; those extra rows are **not** table entries.

Commit the original witness columns `W` and one base-field multiplicity column `M_k` per namespace **before** sampling the shared lookup challenge `beta` in `Fp4 \ F`. Then construct and commit the inverse/accumulator auxiliary columns. For each static query expression j, the compiler supplies a fixed selector `E_j`, equal to one exactly on rows where that inverse is used. For namespace k, fixed selector polynomials count every query occurrence assigned to it.

The attachment must constrain all of the following on every row of H:

```text
(beta - Q_j) * I_j = E_j
(beta - T_k) * U_k = M_k
Padded_k * M_k = 0
A_k(g*X) - A_k(X) = QuerySum_k(X) - U_k(X)
L_0(X) * A_k(X) = 0
```

`QuerySum_k` counts repeated occurrences of each I_j with the exact fixed row selectors, plus fixed-query reciprocals. The accumulator recurrence is **cyclic**, including the last-to-first row. The origin equation removes its additive freedom. Table padding forces M to zero; because beta is outside F, the table equation also forces U to zero there. At unused query rows, `E_j=0` and the denominator cannot vanish, so I_j is zero. Auxiliary padding is defined by these equations; it is not a blanket assumption that every lookup auxiliary column is zero after the last active execution row.

All existing scalar polynomials, exact-width range namespaces, staged carries/zeros, and original execution boundaries remain in the composition. Optional complete-execution predicates require the separate [terminal export](EXECUTION_TERMINAL.md); merely accepting ROM membership does not incorporate it. The initial ROM laboratory may remain a clearly identified valid-prefix computation, as the existing arithmetic laboratory does.

Sampling beta outside F excludes every pole at a trace-domain row because every bounded key and canonical table value lies in F. It does not mean a query polynomial is base-valued at an arbitrary extension-field OODS point. There is no need to invert its OODS denominator: the verifier evaluates polynomial identities there.

Range/ROM membership counts must be bounded strictly below p. With arbitrary pre-challenge field multiplicity advice, an invalid queried key absent from its namespace has a rational-sum residue equal to its positive query count. That residue cannot vanish modulo p under the count bound. Unique index/value ROM keys prevent duplicate table poles from hiding table-row identity. No range proof for the honest multiplicities is automatically necessary for **membership** under these hypotheses; future claims about bounded counters or canonical advice would require their own constraints.

Conditional on already binding low-degree oracles, a nonzero rational difference in one namespace has at most `D-1` numerator roots when there are D distinct poles. Thus `(D-1)/(|Fp4|-|F|)` is a useful conditional lookup-error bound. It is not the error of the whole proof. Account separately for shared-challenge namespaces, constraint batching, quotient OODS testing, joint DEEP reduction, FRI proximity/query sampling, commitment/transcript security and adaptive use. Do not multiply “96 queries” by a nominal rate and label the result 128-bit security.

## Closed N=2,048 laboratory profile

The current n=256 profile cannot include 1,403 canonical Tokyo interval rows. Introduce a separately domain-separated, verifier-selected closed ROM laboratory profile. Select all dimensions from that compiled profile, never from an uploaded shape or proof header that can weaken them. Keep prior range-only evidence associated with its original profile and frozen source.

| Parameter | Required ROM-laboratory value or rule |
| --- | --- |
| Trace size N | 2,048; trace-root exponent 11 |
| Fixed ROM table rows | 1,403 real rows; padding excluded |
| Range tables | Existing exact widths up to eight bits for this first profile |
| Active rows | Nonzero, at most N; exact count compiled from the fixture |
| Blowup | 16, an engineering candidate requiring its own soundness analysis |
| LDE size | 32,768; native root exponent 15 |
| Quotient construction coset | 8,192 = 4N; root exponent 13 |
| FRI folds | 11, then all 16 terminal values with degree zero |
| FRI input | X times joint two-point DEEP; honest degree at most 2,047 |
| Query pairs | 96 distinct antipodal pairs, fixed by this candidate profile |
| Proof byte ceiling | Preserve explicit bounded admission; remeasure rather than silently raising it |
| Width/table/query/bank/descriptor caps | Derive and freeze from the closed fixture before qualification |

For each static affine key, `deg Q <= N-1`. Its inverse equation has degree at most `2N-2`. Selector-weighted local quadratic equations have degree at most `3N-3`; selector-weighted query sums and table equations do not exceed that. Consequently the complete composition remains bounded by **6,141**, and division by `X^2048-1` yields quotient degree at most **4,093**. Two N-coefficient quotient pieces remain sufficient, provided no new higher-degree product is introduced. The quotient constructor must reject nonzero remainder and all coefficients above the specified bounds.

That last bound describes the honest quotient constructor, not the maximum adversarial quotient admitted by two ordinary PCS columns. The actual verifier admits each piece with degree at most `N-1`, so `Q_0 + X^N Q_1` can have degree **4,095 = 2N-1**. Consequently the OODS residual `C-(X^N-1)Q` can have degree **6,143 = 3N-1**. Its error analysis must use this larger admitted bound. The honest constructor's two top-zero coefficient checks do not impose a verifier constraint. A future tighter claim needs a separate authenticated restriction on those coefficients; no such restriction is assumed here. This distinction does not change the degree-safe static ROM inverse expression or the `N-1` cap on each individually committed column.

A dangerous alternative is to build a row-varying affine query with selector coefficients, already degree up to `2N-2`, and then multiply its inverse equation by another enable selector. That can reach `4N-4`, invalidating the two-piece accounting. The selected static-expression inverse cache avoids this extra degree. If that representation changes, recompute the degree instead of copying these parameters.

Bind **all** base, auxiliary and quotient columns at both `zeta` and `g*zeta`. The DEEP reconstruction uses the same opened P(x) in the two divided differences; it must not substitute a shifted oracle with a different authentication obligation. Preserve the X multiplier at the actual signed query point. With eleven folds, a coherent original oracle of degree 2,048 must not pass a rounded degree-2,047 cap. The adversarial acceptance test must assemble a complete candidate and call the actual verifier, not rely only on an honest prover's degree guard.

Absorb ordered group identities, shapes and roots before their dependent challenges: W/M before beta; I/U/A before theta; quotient before zeta; OODS claims before DEEP mixing; each FRI layer root before its folding challenge; full terminal data before query selection. Canonical multiproofs must use verifier-derived indices, correct domain sizes and all eleven fold roots. Enforce exact EOF, role/count ordering, canonical F/Fp4 values, proof-size bounds and distinct new profile/public-message domains.

## Resource consequences and fixture scope

For W original witness columns, C total lookup namespaces, and J distinct inverse expressions, this representation uses `W+C` base columns, `J+2C` auxiliary Fp4 columns, and two quotient columns. Recompute caps for these actual widths; the old base/auxiliary allowances assumed at most eight range namespaces and a range-only inverse cache.

Initial 96-pair opened values alone cost `192*[8*(W+C)+32*(J+2C+2)]` bytes. Two OODS claims add `64*(W+J+3C+2)` bytes. Those costs depend primarily on width; a domain increase still raises frontier paths and adds three FRI rounds. The current PCS stores all group LDE rows as Fp4 even for base groups, so N=2,048 uses exactly **1 MiB per group column** for those row values: `32768*32`. Coefficients, row-vector headers, trees, quotient evaluations, selectors and temporaries are additional. This is accounting, not measured RSS or proving time.

The proposed first fixture performs two indexed reads per step for three steps against the full 1,403-row Tokyo interval table, selecting the actual start/end heading and start/end road width columns. It must also retain bounded scalar arithmetic, original state continuity and range memberships. Its externally supplied expected statement fixes the actions/indices and final outputs. Verifier compilation supplies the table; the verifier must not open a witness/replay file or call the honest witness generator.

This proves the selected column-read computation. It is not the full sixteen-column geometry consumer, world-progress-to-interval calculation, interpolation/heading transformation, eight-car Street relation, canonical race completion, or signed accepted-history authority unless those computations are separately included. Measure the actual witness/table/inverse widths, rules, degree, proof bytes, prover/verifier time and peak RSS for this closed fixture before extending the claim.

## Required adversarial acceptance cases

1. Preserve every requested ROM occurrence, including duplicate, fixed, singleton and disconnected reads, through helper construction, scheduling, raw verification and AIR compilation. Test a legacy range-only AIR rejecting a ROM-bearing program.
2. Reject negative/index-R/padded-2048 indices, signed out-of-range outputs and the explicit `(R,a-1)` versus `(0,a)` key alias. Test canonical field encodings near the declared key limit without exceeding the integer API.
3. Reject a correct value from the wrong index, same repeated value at another row, swapped start/end or width/heading columns, different table bytes/order/length, wrong R/L, and separately valid columns spliced from different read indices.
4. Exercise two distinct affine keys sharing a staged value column, slot reuse across stages and tables, repeated same-key queries, equal-content compiler-interned columns, and constant contradictions. Sharing inverses must not erase repeated memberships or namespaces.
5. Mutate pre-beta multiplicities, range/ROM inverse selectors, inactive I cells, padded M/U cells, first accumulator value, last cyclic recurrence and a namespace's query count. A coherent attack that satisfies local equations but removes closure must be rejected by the complete attachment.
6. Build low-degree false-execution candidates with valid native commitments/PCS openings, then require the actual composed verifier to reject their OODS identity. Include a ROM-wrong/range-correct case and a range-wrong/ROM-correct case; an honest prover refusing them is insufficient evidence.
7. Reject beta in F, profile/domain replay between N=256 and N=2,048, wrong OODS shift/root, missing or duplicated FRI layers, wrong terminal degree, forged query indices/frontiers, noncanonical words, truncated/trailing proofs and byte-cap violations.
8. Test an internally consistent degree-2,048 candidate through actual verification, with authenticated openings and fold equalities intact, and require terminal degree rejection. Preserve the existing degree-256 regression in its original profile.

## Independent source review: helper and scheduler

The following source versions were read independently on September 8. No acceptance defect was found in these paths. This is a scoped source review, not a proof of implementation correctness.

| Inspected file | SHA-256 |
| --- | --- |
| [checked_constraints.rs](checked_constraints.rs) | `39b94c530d04affad95a89e5e7c4433840d29eef930fe4e4a9234f18e7365036` |
| [fixed_rom.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/fixed_rom.rs) | `feaf8cc37c2849b6e0d772e77d2b1c589274296bba4fa42fc7c74b01d2d5585a` |
| [staged_constraints.rs](staged_constraints.rs) | `3d75ac18695dcb36fcea4e9859b2300901b3bd11f0c85d9863ff1d8c0a4b45c6` |

The opt-in helper constructor retains the old expanded reference constructors, performs complete table/bounds/resource preflight before mutation, narrows and decomposes the actual index, and emits actual min/max output range constraints. Complete column interning retains each ordered read occurrence, including constant and duplicate outputs. The complete raw verifier checks each canonical index against the real table length before converting to a machine index, then checks the exact signed table value. It does not use the hint recipe or declared bounds as a substitute for membership.

The scheduler deep-copies all compiler table columns and validates ordinal identities, exact extrema and resource limits. Both nonconstant operand identities extend liveness to the original read anchor, including lookup-only wires and an anchor at the final equation boundary. Constant bindings remain explicit. The detached raw verifier checks the exact tuple, and its normal failure path poisons subsequent calls. Counts include every ROM membership separately from polynomial and range obligations. The AIR view exposes all immutable tables and all occurrences with their original source identities and actual staged bindings.

The retained [helper report](../../output/qualification/street-detached-rom/helper-report.json), SHA-256 `f28345b5b8469482dc85f8266e1e495943e7fe666eda9daee80cb98cac53d1c3`, records 37 passing tests. Its two current source pins, seven artifact hashes/lengths and compiler hash were independently checked; its retained stdout confirms the count and explicit expanded-reference equivalence checks for modes 0/8/12/16. No tests were rerun by this review.

The [scheduler report](../../output/qualification/staged-fixed-rom/report.json), SHA-256 `7fc573d1aecdc129b596fda357bda44921aab2da48495c5a4f1a94f10613696e`, records 65 passing helper/scheduler tests, including seven new scheduler ROM tests, and a separate comparison of 12 old/new schedules and 60 complete witnesses. Its 20 source/snapshot/log/artifact/compiler digest references were independently checked. The retained logs agree with those counts. Source inspection confirms the new tests include a coherent alternate-table witness whose polynomials and ranges pass while exact membership fails, constant contradictions, independent namespaces, source lifetime separation, zero-equation lookup-only rows and a locally valid cross-stage tuple splice rejected by carry constraints. These helper and scheduler test totals overlap; do not add them as independent tests. Composed-proof execution evidence must be recorded separately.

The generated [Tokyo table](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/rom_lookup_table.rs), SHA-256 `baaf772efc3dd96f3c806e1838b18885eb92756e223a22ecbc63a583aef3b8f2`, was independently compared against all 1,403 adjacent pairs in the pinned browser bundle, SHA-256 `92da95c575ba50ab42e940702ec110173b44e19030ad006a800893eacd4592ca`. Every selected heading/half-width value matched. This comparison authenticates the selected source data; it does not establish historical geography or inclusion of the remaining geometry computations.

## Independent proof-attachment source review

| Inspected file | SHA-256 |
| --- | --- |
| [lookup_air.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_air.rs) | `a02b0a32e533caf0ddce504f415c59ad3878aefc9e20a06db95cfd16456c1999` |
| [lookup_common.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_common.rs) | `138698a40a22b9e46d146daccd6393a494f9f873d4f3b407b7b430e818982edf` |
| [lookup_pcs.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_pcs.rs) | `59902424f94badb8704ff47635fed15bcd86a91f16c08338d5f1fbcc9a822eb3` |
| [lookup_protocol.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_protocol.rs) | `bfb91ce6cb1c42cabd4fbdb749dd76501ccb652f96d30ed3dde4f3efc50f4cd9` |
| [rom_lookup_fixture.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/rom_lookup_fixture.rs) | `b8c7e3338d0dd28e8304709e86b70a42f95bc784426b567152276fe5a658b0d2` |

The inspected AIR copies complete compiler tables into its descriptor, retains every ROM query, keys inverse reuse by both static bindings plus real row count and lower endpoint, and gives each interned table its own multiplicity/reciprocal/accumulator columns. Both fixed and variable bindings contribute; duplicate inverse use is counted repeatedly in the namespace sum. Range and ROM inverse columns, table padding, cyclic closure and origin equations are present. The old range-only profile rejects any ROM-bearing compiled program. The new profile fixes N=2,048 and derives every trace/coset/LDE root exponent and FRI layer count accordingly. Its execution context, wire magic, protocol suite and public-statement prefix distinguish it from the range-only profile.

The verifier constructs the closed relation from compiler data and the independently supplied public statement. It does not call the honest witness generator. W/M, auxiliary and quotient commitments precede their dependent challenges. Both OODS evaluations for every group remain bound through the joint X-times-DEEP reconstruction, and canonical multiproofs use verifier-derived indices. The entire 16-value terminal is degree-checked after eleven folds. No concrete production acceptance defect was found in this scoped read; the conditional low-degree and composed soundness gaps described above remain.

One **test-only** issue was found and corrected in the inspected source. The foreign-table candidate initially inserted a PCS length word absent from the production codec and accepted any verifier error. The final test writes the same framing as production, round-trips the exact PCS suffix, checks that native PCS verification accepts it and the foreign-table quotient identity holds, then requires the actual closed verifier to return the specific `OODS quotient identity` error. Source inspection and the final execution evidence below confirm this repair.

The padding optimization also received an independent source review. It retains the complete original rule vector, descriptor and counts; only evaluation of the private contiguous global-zero slice is factored:

```text
sum_{r=active}^{N-1} sum_c L_r(x)*theta^(B+c)*W_c(x)
  = (sum_{r=active}^{N-1} L_r(x))
    * (sum_c theta^(B+c)*W_c(x)).
```

Here B is the original polynomial bank count. The skipped slice contains exactly zero-constant, current-column linear rules with coefficient one and bank B+c. Active-stage zero/carry rules, boundaries and every lookup contribution remain in the ordinary evaluator. This is an exact polynomial identity for arbitrary canonical oracle values, including nonzero padding, off-domain Fp4 values, theta zero/one and an empty padding slice. Comparing the explicit top-level test-module boundary avoids mistaking the new inline `#[cfg(test)]` method for the end of all production code.

The retained [factorization report](../../output/qualification/native-lookup-rom-factorization/factorization-report.json), SHA-256 `961b5a9253623596cbb9b2c9ca10bed357b7e32f499235ae82ab7856faf8de40`, records three passing N=256 tests and two passing N=2,048 tests. For each profile, the complete optimized expression equals the naive expression at every H row, 64 base-coset points, 32 Fp4 points and eight degenerate-theta cases, with arbitrary nonzero extension-valued oracle inputs. Separate cases cover an empty global padding slice and range-profile rejection of ROM. The 85 report/source/artifact digest references were independently checked and retained stdout agrees with the counts. The recorded diff preserves original rule/descriptor construction except for private slice metadata, and preserves the remaining validation and lookup/FFT evaluator code. Removing 733,872,128 individual global-rule visits from the N=2,048 quotient grid is exact operation counting, not an independently measured proving-time speedup.

## Final retained execution evidence

The following reports were checked against their current source hashes, frozen source copies, binaries, harnesses, proof bytes and retained command output. In total, this pass checked 329 direct digest references across the eight reports in this table, including repeated references; this is not a count of unique files. No build or test was rerun by the reviewer. The existing source pins above match the final native implementations.

| Report | SHA-256 |
| --- | --- |
| [ROM combined build](../../output/qualification/native-lookup-rom-combined/build-report.json) | `829cf67c4fa763ce666881e00e5b9dcb94a7200825f6b65fc84ebf0578d0f2a8` |
| [ROM test execution](../../output/qualification/native-lookup-rom-combined/test-report.json) | `58db428183e246789e2ac2db17b37e60eb5ffbda4a20046fe5f02fa788969283` |
| [ROM CLI build](../../output/qualification/native-lookup-rom-cli/build-report.json) | `ef47ca6cf5e234d0c86e50c9fa4fb3b2dae8a4cf9a521d69fa53d42a4099865d` |
| [ROM CLI execution](../../output/qualification/native-lookup-rom-cli/cli-report.json) | `b340a2e3fbea319ccca02108ca74c64febda120836e70c86b14c27b4acf4b7d3` |
| [Cross-profile replay](../../output/qualification/native-lookup-profile-replay/report.json) | `865e09aebb4c99dba9e19aadb72b785d33a23f60338f50baf3dd9ff36d8be889` |
| [Current N=256 regression](../../output/qualification/native-lookup-range-regression/build-report.json) | `55f8560f6b068796cb6d4c5dacd0c0956dafcde35efef462490bdbe1e93aa797` |
| [Current N=256 CLI build](../../output/qualification/native-lookup-range-cli-regression/build-report.json) | `5080c00706a3eb9ee9ef97350878f205ee0c897d39e0cb7e51c4b7ba61d1b55c` |
| [Current N=256 CLI execution](../../output/qualification/native-lookup-range-cli-regression/cli-report.json) | `96f45e02f19e406166f81ac6264dc88e733619ac7ab128af932c42825225ecdb` |

The combined N=2,048 test report records **29 distinct selected tests**: 19 ROM/helper/scheduler/adversarial tests, five protocol tests, four PCS tests and one canonical-wire test. Their names and counts match the retained stdout; this is not a claim that every test in the compiled binary ran. Important observed cases include:

- A **940,260-byte** foreign-table candidate has canonical native PCS openings and a valid nonzero quotient for the changed table. The actual expected-table verifier rejects its OODS quotient identity. The repaired test checks exact production framing and the specific error, so malformed encoding is no longer an alternative rejection reason.
- A **500,300-byte** coherent degree-2,048 candidate passes the independent native opening, initial DEEP-binding and fold checks, but the actual PCS verifier rejects `FriDegree`. The check constructs and codec-round-trips a complete candidate; it is not merely an honest constructor refusing a high-degree polynomial.
- The explicit integer alias `(index=3,value=4)` versus `(index=0,value=5)` in a three-row table closes the lookup identity, while the retained scalar bounds reject it. This isolates why range constraints cannot be replaced by affine-key membership alone.
- Independent table namespaces sharing one exact inverse expression retain both memberships. Duplicate/fixed reads preserve their occurrences, and a coherent missing occurrence is rejected at the cyclic last row. All 122 recorded auxiliary/padding mutations are rejected.

The retained honest [proof](../../output/qualification/native-lookup-rom-cli/case/proof.bin) is **934,724 bytes**, SHA-256 `26b90518a289ad4e5975029221b8e57283cd4f9cf333034b245085d9b8ff62c9`. Its canonical expected statement uses the closed action tape `[[0,1402,1],[701,702,0],[1402,0,1]]` and the exact five final outputs. The 12×44 witness words, statement framing, proof magic/length and EOF mutation bytes were independently inspected. A repeated proof is byte-identical.

| Observed CLI process | Native operation time | Peak process RSS |
| --- | ---: | ---: |
| First prove | 21,310.747458 ms | 211,828,736 bytes |
| Separate verify | 399.211917 ms | 15,630,336 bytes |
| Deterministic re-prove | 14,196.686667 ms | 210,845,696 bytes |

These are observed runs on the local CPU, excluding compilation; they are not full-race estimates or isolated comparative speedup measurements. Prover RSS includes its subsequent self-verification. The different repeat timing demonstrates run variability. The independent verification process receives only the expected statement and proof paths. Its former witness pathname was removed, and source inspection confirms that this command has no witness discovery or replay fallback.

The CLI report records nine failed commands, covering changed network/final statement, statement EOF, changed/noncanonical/truncated/trailing/oversized proof and refusal to overwrite an existing proof. Six additional cross-profile CLI attempts reject foreign proof framing, foreign statement framing and proofs retagged with the target's first 104 header bytes, in both directions. The retained retagged bytes and exact error logs match the replay script. Those are concrete N=256/N=2,048 cases, not qualification of arbitrary profile registration. The current range-only regression separately reports 25 passing selected tests; older frozen reports retain their historical scope. Test totals across helper/scheduler/profile lanes overlap and must not be added as independent coverage.

The observed scope is now a complete native proof of this closed three-step indexed-read computation, with verifier execution independent of witness generation. The adversarial cases above are requirements unless an actual retained test result is explicitly identified. In particular, a dedicated complete, canonically serialized ROM-correct/range-wrong candidate remains unexecuted; the raw index-alias case and shared range tests do not replace it. This evidence does not establish 128-bit soundness, the full Street relation, canonical race completion, accepted-history authority, ledger inclusion or live XOR/NFT settlement.
