# Authenticated native range lookup: candidate V1

**Status: proposed protocol, not implemented or admitted.** September 7, 2026. This specifies a first complete commitment-to-verification path for the exact memberships in `checked_constraints.rs`. The current raw membership checker and commitment adapter do not implement this protocol. No composed security level, full-race proving cost, ledger activation, or zero-knowledge property is claimed.

The recommendation is a **conventional univariate inverse/running-sum LogUp attachment to the same committed columns as the native execution AIR**. Keep exact partial-width tables separate. Start with bounded 8-bit qualification circuits. Use the existing native Goldilocks/Fp4, execution-domain hashing, Merkle, FFT and FRI primitives, with a new execution-specific transcript and relation adapter. Do not add an unauthenticated copied query stream, substitute a standalone rational sum for a proof, or reuse another protocol's security certificate.

The first objective is a complete small authenticated proof with adversarial tests. The present eight-car stage width does not fit the proposed first qualification profile. A proof for that graph requires measured restaging or a more capable authenticated opening/layout backend. None of the original constraints may be omitted to meet a size limit.

## Primary basis and what is newly proposed

[Haböck, *Multivariate lookups based on logarithmic derivatives*, ePrint 2022/1530](https://eprint.iacr.org/2022/1530), received November 4, 2022, last revision February 20, 2025, establishes the pole/multiplicity lookup approach. The relevant identity is equality between query reciprocals and table reciprocals weighted by multiplicity. The native univariate layout, fixed selectors, transcript, boundary handling and degree budget below are our proposed instantiation, not an implementation certified by that paper.

[Papini–Haböck, *Improving logarithmic derivative lookups using GKR*, ePrint 2023/1284](https://eprint.iacr.org/2023/1284), received August 27, 2023, last revision February 20, 2025, is an informal preprint. Its abstract describes fractional-sum GKR with a table-sized multiplicity commitment and a univariate-to-multilinear commitment transformation. That could remove substantial inverse-column commitment work. V1 defers it because every terminal multilinear claim would need that authenticated transformation, including its degree/opening constraints. The current scalar scheduler does not provide that bridge.

[Eagen–Haböck, *Bypassing the characteristic bound in logUp*, ePrint 2024/2067](https://eprint.iacr.org/2024/2067), received December 23, 2024, revised February 20, 2025, explains the conventional `query_count < characteristic` condition and a generalized alternative. Its [PDF](https://eprint.iacr.org/2024/2067.pdf), whose title page is dated December 20, 2024, also discusses a univariate inverse/running-sum instantiation. V1 uses ordinary multiplicities with explicit count bounds, not the generalized protocol.

The ePrint metadata and the 2024/2067 PDF were accessible in this review. Full PDF retrieval for 2022/1530 and 2023/1284 failed; no unread theorem or detailed GKR security bound is adopted here. The [September research review](../../docs/research/2026-09-cryptography-review.md) and [range relation review](LIMB_RANGE_REVIEW.md) give the wider evidence and qualification limits.

## Field, statement and compiled shape

Use `F = GF(p)`, `p = 2^64−2^32+1`, and `K = F[u]/(u^4−7)`. The existing native representation orders the four canonical coefficients by ascending power. Canonical decoding is mandatory for every base and extension field element.

The verifier selects a closed compiled relation. Its descriptor fixes the computation/rules/geometry identity, limb mode, ordered original equations, original wire identity, stage schedule, every membership occurrence and anchor, public boundary mapping, proof dimensions and transcript version. A prover cannot upload a table, change a partial width, choose a schedule, or declare an interval proved.

The public statement fixes the network/execution domain, accepted action transcript, initial state, claimed output, and any shard index, tick range and total execution length. Public values are absorbed canonically or through a verifier-recomputed digest of those exact public bytes. Merely including a prover-supplied state hash does not bind its preimage. The ledger/input-certificate/finality adapters that establish these public inputs are outside this protocol and remain required.

For Street qualification, the compiled relation must additionally contain the obligations in the [terminal and accepted-history binding review](TERMINAL_BINDING_REVIEW.md): exact cross-tick state port carries; the admitted genesis or authenticated checkpoint; `done=0` before each executed transition and `done=1` at the claimed first terminal state; and separate global proof-padding predicates. Bind the public final state to the last **active** transition, not the last power-of-two row. A technical win need not mark every remaining car terminal. These conditions must be actual AIR equations/selectors, not host assertions or prover-supplied admission flags.

Accepted-history binding must preserve the checkpoint, pending certified commitments/reveals, dispute epochs and consensus-authorized roster changes. If a complete signed input batch extends past the first terminal tick, retain the entire signed batch and authenticate the deterministically executed prefix; do not truncate or rewrite signed bytes to fit the proof. The treatment of a roster removal at a terminal boundary must be frozen in the compiled policy. Absorbing gameplay transitions, unused scalar cells and global FRI padding are different cases and need distinct constraints. A generic valid execution prefix alone does not prove a completed Street result.

For one proof shard, let `n` be a fixed power of two, `H={1,g,…,g^(n−1)}` with `g` of order `n`, and `Z_H(X)=X^n−1`. Use the base-field coset `D=7·<ω>`, `|D|=B*n`, with the exact native FFT ordering. All original staged rows occupy a verifier-fixed prefix of `H`; the rest are padding. The prefix cannot be chosen by a witness. Padding preserves the required state/public endpoints and fixes unused witness cells to zero.

This first design uses a **common domain** with `n ≥ 2^b` for every admitted width `b`. The table for width `b` is exactly `T_b={0,…,2^b−1}`. Let `e_b(h_i)=1` for `i<2^b` and zero otherwise, and let the public fixed polynomial `t_b` interpolate `t_b(h_i)=i` on that prefix and zero after it. A table supplied as witness advice is never accepted. Fixed columns and their evaluations at extension points are recomputed from the compiled relation, not taken on trust from proof bytes.

Let `W_c` be the base-field staged witness columns. For each width and column, the compiler fixes a polynomial `s_bc` whose value on a row is the number of original width-`b` membership occurrences bound to that column on that row. It is usually zero or one, but duplicates are retained. Let `e_c` be the fixed Boolean indicator that some membership uses column `c` on that row. One inverse can serve repeated reads, including different widths, because its denominator is the same cell. Distinct widths still have separate identities.

The compiler preserves fixed-value obligations after constant substitution. A known invalid membership makes the relation unsatisfiable and the verifier rejects. Known valid fixed queries contribute an explicitly compiled term `f_b(h_i;β)` to their anchored row. They must not disappear from the counted query collection. The total public query count is

```text
N_b = Σ_rows,c s_bc(row) + number_of_fixed_width_b_queries.
```

Require `N_b < p` for every actual batched width/shard relation. Authenticated independent shards may have separate counts. A count for a single tick is insufficient when one identity batches multiple ticks.

## Committed columns and exact AIR identities

All unmasked trace polynomials below have degree `<n`. This is a public-execution, non-ZK candidate; adding trace masking requires a new degree and hiding analysis.

Before the lookup challenge, commit:

- Every original base witness column `W_c`, including columns used by unused outputs, eager assertions, carries and padding.
- One base-field multiplicity column `M_b` per admitted width. On table rows its honest value counts all corresponding queries; after the table prefix it is zero.

The **query commitment is the commitment to `W` itself**, together with the fixed selector/binding descriptor. There is no separate unproved copy of the queries. Raw table multiplicities are not trusted counts: their correctness is established by the identities below and the lookup argument.

After challenge `β`, commit the extension-field auxiliary columns:

- `I_c` for each column that has at least one membership in the shard.
- `U_b`, the table's weighted reciprocal column, and `A_b`, a running sum, for each admitted width.

For every `h∈H`, require:

```text
(β − W_c(h)) I_c(h) − e_c(h) = 0                          [query reciprocal]
(β − t_b(h)) U_b(h) − M_b(h) = 0                          [weighted table reciprocal]
(1 − e_b(h)) M_b(h) = 0                                  [table padding]

A_b(g h) − A_b(h)
    − Σ_c s_bc(h) I_c(h) − f_b(h;β) + U_b(h) = 0         [cyclic running sum]
A_b(1) = 0.                                             [canonical origin]
```

The running-sum transition includes the last row's transition back to row zero. Omitting that closing equation would lose the sum equality. At an inactive query position, the first equation forces `I_c=0`; no unconstrained inverse advice remains. `f_b` is the sum of `1/(β−v)` for the fixed queries scheduled on that row, computed by the verifier from compiled values.

Summing the cyclic equations gives exactly

```text
Σ_width-b original queries q 1/(β−q)
    = Σ_t∈T_b M_b(t)/(β−t).
```

Both sides refer to authenticated column values. They are not a replacement for the AIR proof. Every original scalar equation, exact integer reconstruction, comparator branch/inactive condition, carry, zero cell and public boundary equation remains in the same proved relation.

Ordinary field multiplicities suffice here without an extra range-gadget recursion. With a distinct fixed table and `N_b<p`, any out-of-table value has nonzero integer multiplicity modulo `p`; it cannot lose its pole. If the rational functions are identical, residues force the field multiplicities to the actual integer counts. This argument depends on committing `W` and `M` **before** sampling `β` and on proving all their polynomial bindings.

## Denominators and exact challenge order

Sample `β` uniformly from `K\F`, using the deterministic public predicate that at least one coefficient of `u,u²,u³` is nonzero. Every query and table value is in `F`, so all lookup denominators are nonzero, including for malicious canonical query values. There is no witness-dependent denominator retry or accepted exceptional branch. A fixed bounded sampler fails closed if it exhausts its attempts. The predicate and attempt bound are profile-fixed and are included in the sampler/Fiat–Shamir analysis.

Use a new execution-only domain, for example `native-range-lookup-candidate-v1`, with distinct framed labels for each phase, role, group and index. The proposed transcript order is:

1. Absorb the exact compiled profile/shape and complete public statement.
2. Absorb the ordered base commitments to `W` and `M`.
3. Derive `β∈K\F`. No auxiliary root or prover-chosen retry counter participates in this challenge.
4. Absorb the ordered auxiliary commitments to `I,U,A`.
5. Derive an independent composition challenge `θ∈K`. A fixed sequence of powers combines the canonically ordered AIR constraints. The resulting cancellation term depends on the number of constraints and must be counted.
6. Commit the two low-degree composition quotient pieces described below.
7. Derive an independent out-of-domain point `ζ∈K\F`. Then `ζ,gζ` and every denominator used for DEEP openings are outside the base trace/LDE domains.
8. Absorb all claimed polynomial evaluations at `ζ` and, where shifts are used, at `gζ`, in a fixed oracle/point order.
9. Derive the DEEP batching challenge, commit its initial FRI oracle, and execute every FRI commit/fold round in order.
10. Absorb the complete terminal polynomial/vector, then derive the fixed number of unique initial query-pair representatives in `[0,|D|/2)`. Their paired indices differ by `|D|/2` in the fixed FFT ordering. Later overlapping paths use the exact canonical multiproof deduplication rule, not a witness-selected query subset. Authenticate every required original and FRI opening and verify all folding and degree checks.

No grinding is included in the first qualification candidate. Adding it changes the transcript and soundness/work analysis. The absence of an explicit nonce does not remove adversarial Fiat–Shamir search over candidate commitments; the chosen hash/FS model still has to account for that adversary.

## Polynomial degrees and composition

Convert the fixed stage program into a fixed bank of row-wise equations. A coefficient that varies with the stage is a **public polynomial of degree `<n`**, not a degree-zero constant in the trace variable. For example, a gate bank can contain

```text
c_j(X) + Σ_c a_jc(X) W_c(X) + Σ_c,d b_jcd(X) W_c(X)W_d(X).
```

Its degree is at most `3n−3`, although its degree in raw witness cells is two. The compiler supplies exact coefficient-selector evaluations; no witness chooses which original equation applies to a row. All bank slots and all original equations are retained.

| Identity | Maximum degree in `X` before division by `Z_H` |
| --- | ---: |
| Stage-selected original quadratic gate | `3n−3` |
| Query/table reciprocal | `2n−2` |
| Table padding or selected carry/zero condition | `2n−2` |
| Running sum with fixed selectors | `2n−2` |
| Public boundary via its fixed Lagrange selector | `2n−2` |

Let `C(X)=Σ_j θ^j C_j(X)`. Require `C=Z_H Q`. Honest `Q` has degree at most `2n−3`. Commit it as

```text
Q(X) = Q0(X) + X^n Q1(X),       deg Q0, deg Q1 < n.
```

The verifier checks the single out-of-domain equality

```text
C(ζ) = (ζ^n−1) [ Q0(ζ) + ζ^n Q1(ζ) ].
```

All values on the right and all witness/shifted values used on the left must pass the opening argument. This quotient split puts every committed oracle in the same degree class `<n`. Simply batching a degree-`<2n` quotient together with trace columns and checking only the larger bound would not prove the required trace degree.

The displayed equality is a PIOP reduction, not an unbound evaluation claim. Conditional on the declared polynomial degree bounds, its residual has degree at most `3n−1`; `ζ` is sampled only after the commitments that fix it. A bad original constraint can also be lost in the random composition with probability depending on the number of bank identities. Both errors belong in the final bound.

## Exact PCS/FRI opening binding

Commit each phase's LDE rows with canonical row order, exact width/field types and native execution-domain row/parent hashing. Base rows contain base words; extension columns contain four canonical words per value. Shape, phase and row identity are not interchangeable. Use exact canonical Merkle paths or multiproofs; reject missing, extra, duplicate, reordered or trailing material according to the chosen canonical schema.

The inspected native aggregate row leaf encodes its flattened base-word width as `u16`. The lab profile fits this bound, including four words for every extension value. A larger layout must enforce that exact limit or use a separately specified canonical group split with every group bound and opened; truncating a width or silently dropping columns is invalid.

For each claimed evaluation `v_P,a` at point `a∈{ζ,gζ}`, define

```text
D_P,a(X) = [P(X) − v_P,a]/(X−a).
D(X) = Σ_(P,a) ρ^(fixed_index(P,a)) D_P,a(X).
```

Include every original base column, every multiplicity and auxiliary column, and both quotient pieces. At least the `ζ` opening is required for every oracle, including a column not used in a particular scalar expression. Shifted claims refer to the **same polynomial**, not a separately supplied next-row vector. Honest `D` has degree at most `n−2`.

FRI must test this exact `D`, not an unrelated prover oracle. At every initial FRI query pair `x,−x`, verify the base/auxiliary/quotient row openings against their previously absorbed roots and reconstruct the claimed `D(x),D(−x)` using those opened values and the already absorbed OODS claims. The values must equal the opened initial FRI leaves. Each subsequent opening must satisfy the native binary fold at its canonical coset point using the transcript-derived fold challenge, and authenticate against the corresponding round root.

The verifier obtains the **entire** bounded terminal vector or coefficient list, checks its root and its exact folded degree cap, and checks its consistency with the final queried fold. A terminal constant assertion without the whole degree test, or sampling only a public digest row, does not establish the polynomial commitment claim. FRI coefficients are sampled from the full extension field, including zero; no arbitrary nonzero restriction is introduced.

This is a specified batch opening protocol, not a claim that the existing primitive methods already prove its security. The required joint DEEP/FRI proximity and opening theorem, including the number of original oracles, remains a qualification obligation.

## First bounded qualification profile and resource consequences

A concrete **non-activated laboratory profile** can fix:

```text
limb mode                  8 bits; exact top widths 1…8
trace size n               256
maximum original columns   256
maximum inverse columns    256
maximum widths             8
maximum original gate-bank slots 1024
maximum membership occurrences  65536, including duplicates/fixed queries
LDE blowup B               16, hence |D|=4096
quotient pieces            2, each degree<256
FRI terminal length        16 after 8 binary folds
terminal degree cap        0 for the DEEP oracle (floor(254/256))
unique query pairs         96
grinding                   absent
proof byte ceiling         4 MiB, enforced before allocation/decoding
```

These are engineering fixtures, **not a derivation of 128-bit security**. The 256-row/256-column laboratory relation is a component milestone and does not replace the full racing goal. Rejection of an oversized circuit/proof is the correct behavior. First tests should use closed compiled arithmetic fixtures containing signed range, comparison, divide/remainder, inactive branches, repeated widths and a small native transition. Do not advertise a full native racing profile until it actually fits and passes the complete proof tests, including the compiled terminal, accepted-history and global-padding obligations above.

At the stated maxima, a fully materialized LDE for base `W,M`, auxiliary `I,U,A` and the two quotient pieces occupies about 44.6 MB before FRI, trees, public selectors and working buffers. This is a dimension calculation, not a measured prover memory figure. It should still be generated and committed in bounded column blocks. Evaluate public selector expressions from the original sparse equation/membership schedule and precomputed Lagrange weights; do not allocate a dense gate-by-row-by-column-pair coefficient tensor. Fix the exact sparse term limit in the compiled qualification relation. Limit all row/column/count products with checked arithmetic, exact allocation preflight and a fixed proof ceiling.

Current eight-car 8-bit staging has 22,349 original columns and 18 rows per tick under its 16,384-equation row budget. It therefore fails the proposed column cap. Increasing only the cap would cause very wide authenticated query rows and may exceed the current Iroha execution envelope. Restage with smaller row budgets and measure resulting width, carries, padding, selector work and proof bytes. Every original wire/boundary/lookup binding must remain intact. If that is insufficient, use an independently specified heterogeneous AIR or authenticated column-opening reduction; a raw copied query stream is not an escape hatch.

Uniform-domain 16-bit tables require `n≥65536` even for a short shard. A heterogeneous table proof can avoid padding all source columns to that size, but needs authenticated cross-group sum identities and correct per-group degree/opening guarantees. The existing aggregate substrate has trace groups, yet also derives a common LDE domain from the largest group; that facility alone does not establish a memory saving or a qualified lookup adapter. This is why the first candidate uses 8-bit tables despite 16-bit mode's smaller raw scalar rectangle.

For larger execution shards, use bounded replay passes: generate the deterministic original witness and multiplicities before `β`; retain or regenerate exactly the committed base data; generate challenge-dependent inverses and prefix sums; commit column LDE blocks; generate quotient and FRI data; retain canonical Merkle frontiers or deterministic on-disk artifacts until the late query positions are known. Never retain every full-race base/extension/LDE matrix in RAM by default. Regeneration must reproduce the same roots byte-for-byte. Measure disk traffic and total work as well as peak memory.

Time sharding alone does not produce a succinct full-race proof. The verifier must authenticate each shard, enforce exact initial/final state continuity, bind every action slice, and reject omitted, repeated, reordered or extra shards. Without a separately qualified aggregation/recursion mechanism, proof bytes and verifier work grow with the number of shards. Both the 5,400-tick race and 9,000-tick street profiles remain unqualified full-race targets.

## Native substrate inventory and required implementation

Read-only inspection found these reusable native components:

- `execution_proofs/stark/transparent_stark.rs`: execution-only framed transcript, `challenge_fp4_where`, canonical Goldilocks/Fp4 FFT/coset operations, Merkle verification, binary FRI folds and full terminal-degree checks. Its header explicitly requires caller binding of witness columns and quotient openings and calls the new execution suite unqualified.
- The field representation is reused from `privacy_engines/transparent_stark.rs`, including `u^4=7`. The execution module uses separate execution-domain hashing; this proposal does not change privacy wire formats.
- `execution_proofs/stark/aggregate_stark.rs`: canonical row hashing/multiproofs, ordered trace groups, quotient coefficient chunks and opened-query relation callbacks. These are substrate capabilities, not an implementation of the above lookup phases or its soundness analysis.
- `iroha_data_model/src/execution_proofs.rs`: a 4 MiB execution-proof envelope ceiling.

The next native work must implement the immutable lookup-aware AIR export, exact public selectors and degree planner, pre-`β` multiplicity commitments, challenge-dependent auxiliary generation, quotient construction/splitting, the above transcript/wire format, complete joint opening verification and adversarial proof tests. In the current `StagedCircuit`, the post-substitution polynomials and boundary port maps remain private: the export must expose a detached, immutable, complete compiled program, including fixed contradictions, membership occurrences, carry/zero rules and input/output port bindings. Metadata, original pre-substitution equations or honest generated rows alone cannot reconstruct that program safely. The outer cross-tick/terminal/padding program must also be exported and proved. Existing raw `verify_equations` or a successful Merkle row opening cannot substitute for those steps. Maintained Iroha source edits and Cargo builds were not performed for this specification.

Inspected Iroha SHA-256 pins:

| Source relative to `../iroha` | SHA-256 |
| --- | --- |
| `crates/iroha_core/src/execution_proofs/stark/transparent_stark.rs` | `86f684bddd22e4f59f328a6096c6cf647b142b917c6773444e5f11c692b481cd` |
| `crates/iroha_core/src/privacy_engines/transparent_stark.rs` | `a1425266d801ca69b52b4f4bdac045307e73b988eea3aeb402e16da749558192` |
| `crates/iroha_core/src/execution_proofs/stark/aggregate_stark.rs` | `b16e8e505a1bcbc99584807ef06f66ad723cfc95ee9fa0c618a7914f0f28db0d` |
| `crates/iroha_core/src/execution_proofs/poseidon2.rs` | `a6af6d9a59a6df6fd8f211386707d413d68062201af0c35a85dd84b86780e118` |
| `crates/iroha_data_model/src/execution_proofs.rs` | `a05f78869a1499bb9509d4b194ff53b03b8e8d6798dd9b903472b8430b1b12be` |

## Composed security and adversarial gates still open

Conditioned on fixed polynomial oracles and ordinary multiplicities with `N_b<p`, an invalid width-`b` rational identity has numerator degree at most `N_b+2^b−1`. Sampling `β` from `K\F` therefore gives the conservative algebraic term `(N_b+2^b−1)/(p^4−p)`. This is only one reduction. It is not the security of a Merkle/FRI/Fiat–Shamir implementation.

The complete analysis must also cover composition cancellation, the degree-`≤3n−1` OODS identity, DEEP batching and its actual oracle count, Reed–Solomon proximity/list behavior on the chosen fixed domain, all FRI folds and query correlation, commitment binding under the selected Poseidon2 parameters, canonical sampling and its hash model, Fiat–Shamir adaptivity/grinding and any shard/aggregation composition. There is no inherited 128-bit conclusion from Fp4, 96 queries, an existing parameter struct, or a similarly named library profile.

Required attacks include: the existing polynomial-valid limb aliases; changing a partial width or dropping one duplicate query; changing `M` after `β`; committing a different `W` for lookup and execution; missing last running-sum closure; nonzero table padding; forged inactive reciprocals; base-subfield `β`; an unrelated initial FRI oracle; inconsistent OODS/shifted claims; an excessive-degree trace hidden under a quotient bound; bad terminal coefficients; wrong roots, canonical multiproof frontiers or coset indices; every cross-network/profile/shard replay; and altered final/public action data. Proof tampering must be rejected by the authenticated verifier, not merely by honest witness generation or a host replay check.

Release remains blocked on implementation, composed cryptographic review, full-size resource measurements and the separate consensus/finality/settlement gates. This document authorizes none of those qualifications by itself.
