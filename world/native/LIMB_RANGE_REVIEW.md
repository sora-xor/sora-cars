# Exact limb range relation: independent review

> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


Review date: September 7, 2026. Scope: the opt-in 8-, 12-, and 16-bit range backend in `checked_constraints.rs`, its detached obligations in `staged_constraints.rs`, and the native graph lowering that selects that backend. This is a review of a finite raw-witness relation. Exact host checks of fixed-table membership are **not a cryptographic lookup argument, a complete AIR composition, or a STARK**. This document makes no 128-bit security, full-race proving, ledger admission, or finality claim.

The reviewed design preserves the original accepted integer computation after projecting away the auxiliary representation. It changes how range and comparison slacks are represented; it does not change the physics, authorized actions, geometry table, integer endpoints, or settlement semantics. `Circuit::new()` remains the pure-bit reference. No maintained Iroha source or Cargo build was used for this review.

## Integer argument

Let `p = 18446744069414584321` be the Goldilocks prime. Public integer endpoints satisfy `−2^50 < low ≤ high < 2^50`. All raw field cells must be canonical integers in `[0,p)` before any equation or membership is evaluated.

For a nonnegative slack requiring `k` bits and configured chunk width `w ∈ {8,12,16}`, the compiler creates chunks at shifts `j*w`. The actual width of each chunk is `b_j = min(w, k − j*w)`. Its obligation is exactly

```text
u_j ∈ T_bj = {0, …, 2^b_j − 1}
S = Σ_j 2^(j*w) u_j.
```

These are immutable compiler-selected tables. The witness cannot select the width or provide table contents. Their exact top widths imply `0 ≤ S ≤ 2^k−1`. Every valid chunk vector expands into exactly `k` Boolean digits, and every original `k`-bit vector groups into exactly one valid chunk vector. Thus the changed auxiliary representation preserves the projected relation, provided every membership and reconstruction is retained.

For the range `[L,H]`, the two original equations remain:

```text
x − L − S_low = 0  (mod p)
H − x − S_high = 0 (mod p).
```

Writing `W=H−L` and `k=bit_width(W)`, adding the equations gives `S_low + S_high = W (mod p)`. Here `W ≤ 2^51−2` and each sum is at most `2^51−1`; the complete residual magnitude is less than `2^52 < p`. Therefore it is an integer equality. It follows that `0 ≤ S_low ≤ W` and `x` is the unique canonical field encoding of `L+S_low ∈ [L,H]`. This argument does not assume that the raw `x` already obeys its declared bounds. A singleton range keeps its original direct equality; Boolean public ranges keep their Boolean polynomial.

This envelope argument uses Goldilocks. Replacing it with a smaller base field, even with extension-field challenges, does not preserve these integer-lift bounds automatically.

For `t = (a < b)`, `a` and `b` already have proved integer ranges and `t` still satisfies `t²−t=0`. The original four equations remain:

```text
t (b − a − 1 − U) = 0
(1−t) (a − b − V) = 0
(1−t) U = 0
t V = 0.
```

The compiler retains the existing checked envelope for the active signed residual, using the actual complete slack ceiling `2^k−1`, rather than a smaller declared maximum. Chunking preserves that ceiling exactly. Hence `t=1` requires `b−a≥1` and `t=0` requires `a−b≥0`. Inactive aggregate zero also remains meaningful: every chunk is nonnegative and the whole weighted sum is below `p`, so aggregate zero forces all inactive chunks to zero. A source recipe that merely generates zero would not establish this property.

Division, remainder, true range narrowing, signed reconstruction, positive divisors, canonical selector bits, and the exact compiled-ROM equations remain necessary. The existing four-operation derived-range induction is unchanged: it may use operand ranges proved by these complete membership-plus-polynomial obligations. Exporting only the polynomials would break that induction's premises.

## Implementation and API boundary

The scalar helper stores `RangeLookupView { wire, bits, equation_anchor }` in a private list. Public views are copies; constructing or modifying a view does not install an obligation in a circuit. `Source::SlackLimb` is an honest generation hint. Raw `verify` first checks the canonical polynomial witness and then checks every stored membership using its raw cell and fixed width; it does not consult source recipes, bounds, or range provenance. `verify_equations`, `residues`, `constraint_count`, and the polynomial degree are explicitly polynomial-only diagnostics in limb mode.

Direct Boolean controls, comparator selectors, select conditions, and `decompose_unsigned` index bits remain Boolean polynomials. Top chunks, including a one-bit top chunk, are exact memberships in the selected range backend. There is no mutable mode flag after construction and no caller-supplied table or claimed limb bound.

The scheduler copies and validates the complete list, including duplicate obligations and different widths on the same cell. Every obligation contributes to total resource accounting. A lookup-only wire extends liveness to its original equation anchor. An anchor equal to the original equation count is clamped to the last existing stage; a zero-polynomial circuit has one stage; an anchor beyond the count is rejected. Slot identity, carry, padding, public pins and polynomial positions remain compiler-owned.

Exact singleton substitution may remove a cell from the row layout, but its membership becomes a fixed-value obligation. Both true memberships and constant contradictions remain checked and counted. The detached verifier never consults the original circuit. It checks fixed memberships as well as row-bound memberships, and an error poisons the stream. Public schedule construction obtains obligations from the circuit; the synthetic obligation iterator used by negative tests is private.

This is a construction boundary, not network authentication. A native caller still has to select the admitted, immutable computation and bind state/actions/outputs. Being able to build or verify an arbitrary local circuit does not authorize it as an execution profile.

## Attacks and regression obligations

The important attacks make **all ordinary polynomials pass** before checking that membership rejects:

- Coherent carry alias: replace two adjacent base-`2^w` digits by `(u+2^w,v−1)`. Reconstruction is unchanged; the first digit exceeds its exact table. A canonical `p−1` digit can likewise represent a forbidden negative integer.
- Partial top width: for mode 16 and range `[0,2^50−1]`, forge `x=2^50`, lower sum `x`, and upper sum `p−1`. Their base-65536 digits satisfy both reconstruction equations modulo `p`. All digits fit 16 bits, but the top digits do not fit their required **two-bit** tables. Widening every top chunk to 16 bits would accept this out-of-range value.
- Inactive comparison cancellation: insert `(+2^w,−1)` into two inactive chunks. The weighted aggregate remains zero, so all comparison equations can survive; exact nonnegative membership must reject it.
- Change the node's generation recipe or claimed bounds while leaving the detached equations and memberships unchanged. Raw acceptance must not change. Likewise, modifying a copied exported descriptor must not modify the circuit.
- Preserve memberships on disconnected assertions, lookup-only wires, duplicate widths, and fixed negative/out-of-range values after constant substitution. Dropping any of these obligations is not an optimization.
- Preserve the same original wire across its anchored row and all intervening carries; do not evaluate a lookup on a later occupant of a reused column. Reject malformed anchors, widths, counts, canonical encodings, row shapes and inactive padding. Reject retries after an error.

The implementation owners are retaining focused regressions for these cases. Final source pins and reported test evidence are recorded below; this review does not substitute its own claim for their retained logs.

## Counting the replacement

For a non-Boolean, non-singleton `k`-bit range, the old construction uses `2k` auxiliary cells, `2k` Boolean equations and two reconstruction equations. Chunking uses `2 ceil(k/w)` auxiliary cells, that many membership obligations, and the same two reconstruction equations. For comparison slack widths `k_pos,k_neg`, replace `k_pos+k_neg` slack cells and Boolean equations by `ceil(k_pos/w)+ceil(k_neg/w)` cells and memberships. The result Booleanity and four gated/inactive equations remain. A zero-width slack contributes zero chunks.

The prior [range census](../../output/qualification/street-range-audit/README.md) counted 1,539,863 slack-bit cells in the eight-car scalar circuit: 534,138 for explicit ranges, 1,005,285 for comparisons and 440 for unsigned index decomposition. The first two categories are candidates here; the last remains Boolean. This census explains the potential reduction without predicting a prover speedup. Its report SHA-256 is `f002d8d592dd93703118c2681de84fade84b122d0b4500559a0dd6c221a7d0e3`.

The polynomial witness degree remains at most two. This statement excludes membership lowering, any lookup accumulator or GKR relation, stage selector degree, composition degree and polynomial commitment work. A membership counted as one exact raw check is not one proved arithmetic gate. Resource reports must separately count polynomial equations, membership occurrences, fixed memberships, table rows, dense staged cells, carries and padding. Future prover measurements must additionally include multiplicities, auxiliary/extension columns, commitments, opening reductions and workspaces.

The final [integrated report](../../output/qualification/street-limbs/report.json) measures the following eight-car layouts:

| Range backend | Scalar cells | Polynomials | Memberships | Distinct table rows | Staged cells per tick |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pure bits | 1,670,866 | 1,827,393 | 0 | 0 | 1,734,096 |
| 8-bit chunks | 350,679 | 287,970 | 219,236 | 510 | 402,282 |
| 12-bit chunks | 293,684 | 287,970 | 162,241 | 8,190 | 345,366 |
| 16-bit chunks | 257,761 | 287,970 | 126,318 | 131,070 | 275,220 |

Independent accounting against the old census agrees exactly for all six two/eight-car limb profiles: subtract the 115,612 affected range/comparison bits for two cars, or 1,539,423 for eight cars, from the old polynomial count; subtract the same amount from the old scalar cells and add the new membership count. No additional eliminated obligation is needed to explain these totals. The explicit unsigned index bits remain included.

The 16-bit layout reduces the eight-car dense rectangle by approximately 84.13%, but has a much larger table domain than 8-bit mode. Its 9,000-tick raw projection is 19,815,840,000 bytes (about 18.45 GiB), excluding proof overhead and without allocating a full race. The smallest raw rectangle does not by itself select the best cryptographic lookup backend.

## Obligations before replacing exact membership with LogUp

The following is a design prerequisite list, not a completed protocol or security theorem. The [lookup research study](../../docs/research/2026-09-lookups-and-arithmetization.md) distinguishes conventional LogUp, LogUp-GKR and generalized characteristic-safe constructions.

1. **Authenticate the exact table type.** Partial-width tables differ. Separate relations per public width are a straightforward exact schema. A combined relation needs an analyzed tuple encoding. Deterministic packing `bits*65536 + value` is unsafe before `value` is range-proved: invalid `(bits=9,value=131072)` collides exactly with valid `(bits=11,value=0)`. Random tuple compression instead needs its own challenge, binding order, collision bound and compositional error accounting.
2. **Bind every actual query.** Query columns must be constrained to these exact original cells and public widths, including inactive zero chunks and fixed obligations. The witness cannot drop queries, choose table tags, change activation, or replace them with a host-generated valid list. Any batching/sharding has to preserve the complete collection and its public count.
3. **Justify characteristic and multiplicities.** In a conventional logarithmic-derivative identity, an out-of-table pole repeated `p` times can disappear in characteristic `p`. An extension field has the same characteristic. A sufficient conventional setting is a distinct fixed table and total query count `N<p`, with all query and multiplicity data committed before the evaluation challenge. Here `N` counts each actual batched relation over every execution tick assigned to it; authenticated independent shards may have separate counts, but no query may disappear between shards. Under the exact rational identity, residues then determine the correct integer table multiplicities; a separate multiplicity range gadget is not automatically necessary. A different count representation or generalized construction needs its own argument. Any small-field migration must recheck these conditions over the full proof, not merely one tick.
4. **Prove the rational identity and its bindings.** The equation `Σ_i 1/(z−q_i) = Σ_t m_t/(z−t)` is only an intuition until all evaluations, reciprocals, sums and openings are authenticated. The selected theorem must bound the resulting rational/polynomial identity error, denominator poles and challenge distribution. A GKR reduction still has to end at authenticated committed data. No arbitrary retry policy may silently discard bad challenges or supply grinding opportunities.
5. **Compose the whole proof.** Fix the computation/profile and table schema before Fiat–Shamir challenges. Account for tuple compression, count assumptions, lookup identity testing, sumcheck/GKR, representation bridges, PCS/FRI proximity analysis, hash assumptions and transcript security together. Goldilocks/Fp4 and degree-two local equations alone do not establish a 128-bit whole-proof target.

For the current engineering cap, even 16,000,000 membership occurrences per tick across the street profile's 9,000 ticks is 144,000,000,000, below the Goldilocks characteristic. This is a coarse integer upper bound, not a protocol parameter selection or a proof of all batching assumptions. The original 180-second race profile and the measured 9,000-tick street profile have different duration bounds; their statements must remain versioned explicitly.

For clarity, the measured eight-car range-query totals over 9,000 ticks are 1,973,124,000, 1,460,169,000 and 1,136,862,000 for 8-, 12- and 16-bit modes respectively. Even the largest is below the M31 characteristic `2147483647`; this experiment does **not** establish a current count-wrap failure in M31. The separate signed integer envelopes above still prohibit directly swapping this arithmetic relation to M31. Other batching choices or computations need their own count analysis.

## Evidence and unresolved qualification

This review found no scalar membership or scheduling acceptance defect in the final inspected sources. Source and artifact SHA-256 pins, rechecked against both live files and the report's frozen copies:

| Source or artifact | SHA-256 |
| --- | --- |
| `checked_constraints.rs` | `d59444aed179f2159898e88e37ca493ea45ba1a49169586514d5c0d9abde53e4` |
| `staged_constraints.rs` | `a13862bd91956daf3ff5331a63a45bca45a7c6baa97127526b971aaecbdbc4fb` |
| `street_checked_lowering.rs` | `184729b99fecbfe847c6353432c2a93a9b065d1f741ba628c9eff29ae632f177` |
| `execution_trace.rs` | `7aec3b33b0e4ee9da94259b7c3e2a7bee464270a879a99c6b9656aa039b03efb` |
| `scripts/native/street_limb_qualification.rs` | `2cad1915760f901c648246eb16dd3e0aca97287d8cfa9dc4d18cb14d4016fd1f` |
| `scripts/test-street-limbs.ts` | `288e6017d63349d7aa5e5eba6e90d6cb31acd56b1380a4a902828119c57dfaaf` |
| [Integrated report](../../output/qualification/street-limbs/report.json) | `344db9c411f5744714acb1740e755ef12cf1a44b3435c36b571ff041a6aed243` |
| [Helper/reference evidence](../../output/qualification/street-limb-range/helper-checks/evidence.json) | `e0708146d233099798e4d30076bf613c1a80a92527223f9c70ec5bcc65bf5da0` |
| [Intermediate-roster supplement](../../output/qualification/street-limbs/intermediate/report.json) | `6fe9a1a326bba2db0cac2c92c91740016c2659f8ed73cfecc2fce5e8f552d9ae` |

The integrated report retains 23 source pins, nine raw log digests, standalone `rustc` commands, binaries and measured host timings. Its 60 focused native tests pass. For each of four modes on two and eight cars, it checks twelve consecutive native transitions, 34 explicitly constructed valid component-state fixtures and one coherent unauthorized-forfeit state, comparing every graph node with its raw field witness. Three linked staged transitions and four public action/continuity/forfeit/truncation attacks are checked separately. Each limb profile additionally rejects a coherent digit forgery that first passes **every** ordinary polynomial, with the staged verifier specifically rejecting membership.

The helper evidence reports 27 tests, including 330 small arithmetic parity cases and 75 signed-endpoint pairs across the three modes. The extreme top-width, negative-limb, inactive comparison, metadata/hint, copied-view and atomicity regressions were independently inspected in source. The two/eight-car default polynomial fingerprint files were independently checked byte-for-byte against the old census, and all helper artifact hashes matched. The combined runner logs were inspected and their digests checked; these are retained implementation-run observations, not a separately claimed replay of the entire test suite by this reviewer.

The supplement runs the exact final parent binary on rosters three through seven in 12-bit mode, without changing the primary report or rerunning its 60 unit tests. Each run has the same twelve consecutive native transitions, 34 component fixtures, three staged transitions, four boundary attacks and one polynomial-valid membership forgery. Across those five runs it records 8,506,483 all-node parity values, 20 boundary rejections and five coherent membership rejections. This reviewer rechecked all 44 supplemental artifact hashes, its parent/source/binary binding and the five raw log records. Together the reports exercise every supported roster from two through eight at 12 bits; the other three layouts are exercised at the two/eight-car endpoints.

The synthetic component fixtures are not a proof that their initial states are reachable from genesis. These checks do not constitute an independent full campaign, full-race trace allocation, native AIR/STARK prover run, cryptographic protocol review, validator rollout or finalized ledger inclusion test. Cryptographic lookup, complete AIR degree accounting, full-race proving, 128-bit soundness and consensus qualifications remain false in the report.
