# Compiler-selected native WHIR geometry

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


8 September 2026. [whir_geometry.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_geometry.rs) selects an immutable opening profile for exactly `2^m` value positions, with `2 ≤ m ≤ 20`. This is a new profile family. The existing fixed 64-value, rate `1/128` profile and its retained evidence remain unchanged.

The compiler supplies `m`; the proof cannot supply dimensions, folds, rate, sample count, encoding or resource limits. The source adapter must bind its entire compiled source relation and expected public statement alongside the profile digest. A profile describes the opening geometry, not a particular source program. Zero-variable and one-variable inputs are explicitly rejected; callers with smaller relations must use at least four positions and prove their required zero tail.

## Selected geometry

The protocol field is native `K = F[w]/(w^4−7)`, with Goldilocks `p = 2^64−2^32+1` and `|K| = p^4`. Variables, monomials and Boolean value tables use low-bit-first order. Native FFT evaluations use natural indices. For a stage with `m_i` remaining variables, choose `k_i = min(4, m_i−1)` and then `m_(i+1)=m_i−k_i`. The terminal polynomial has one variable and exactly two monomial coefficients.

Every committed stage uses `C_i=2^m_i` coefficients, `N_i=16*C_i` evaluations, and `2^k_i` symbols per packed Merkle leaf. All new stages start on coset 7. Leaf `j` contains natural FFT positions `j+a*(N_i/2^k_i)` in ascending `a` order. Its folded point is `(7*omega_i^j)^(2^k_i)`; the preceding folded coset is therefore `7^16`, `7^4`, `7^2`, or `7^8`, depending on the fold count. It is not replaced with the new stage's coset 7.

| Initial variables | Values | Folds | Remaining variables, including terminal | Domain sizes |
|---:|---:|---|---|---|
| 2 | 4 | 1 | 2, 1 | 64 |
| 6 | 64 | 4, 1 | 6, 2, 1 | 1,024; 64 |
| 15 | 32,768 | 4, 4, 4, 2 | 15, 11, 7, 3, 1 | 524,288; 32,768; 2,048; 128 |
| 19 | 524,288 | 4, 4, 4, 4, 2 | 19, 15, 11, 7, 3, 1 | 8,388,608; 524,288; 32,768; 2,048; 128 |
| 20 | 1,048,576 | 4, 4, 4, 4, 3 | 20, 16, 12, 8, 4, 1 | 16,777,216; 1,048,576; 65,536; 4,096; 256 |

The greedy four-variable schedule reduces the number of retained shifted commitments; it is a compiler policy, not a proven optimum. At most five stages are created. All domain sizes have log at most 24, within both Goldilocks' 32-bit two-adic capacity and the unchanged commitment module's `2^24` domain ceiling. Tests check exact root order for every selected stage, not just `omega^N=1`.

Each predecessor/final comparison draws 256 independent ordered indices with replacement. A small domain still receives all 256 logical draws. Only Merkle authentication deduplicates and sorts indices; repeated samples remain present in weighted equations. Uniform sampling needs the native rejection procedure, not biased integer reduction.

The descriptor binds modulus, extension degree/nonresidue, selected dimensions, inverse rate, fold policy, terminal dimensions, sample count, distance numerator/denominator, strict inner degree bound, maximum external queries, wire widths, coset, replacement mode, proof ceiling, order string and every stage's geometry. Initial Base versus Extension encoding belongs to the enclosing expected binding and stage spec; every later stage uses Extension. Local allocation limits do not change profile or commitment identity.

## Conservative opening-wire bounds

Let `s` be the number of committed stages, `u_i=min(256,leaf_count_i)`, `h_i=log2(leaf_count_i)` and `b_i` the stage encoding width, 8 for initial Base and 32 otherwise. The fixed message body, including magic, is

`104 + 96*(m−1) + 80*(s−1)` bytes.

This includes one initial OOD reply, all quadratic coefficient triples, shifted roots/OOD replies and two terminal coefficients. A conservative opening bound is

`sum_i u_i*(2^k_i*b_i + 48*h_i)`.

The frontier term is a safe independent-path upper bound, not a claim that a canonical minimal multiproof always uses that many digests. Actual proof length depends on sampled unique positions. No prover-supplied counts or indices are included. These formulas concern the opening wire; any outer arithmetic transcript requires its separately checked additional bytes.

| Initial variables | Initial Base upper bound | Initial Extension upper bound |
|---:|---:|---:|
| 2 | 8,392 B | 9,928 B |
| 6 | 37,016 B | 61,592 B |
| 15 | 605,336 B | 703,640 B |
| 19 | 970,344 B | 1,068,648 B |
| 20 | 1,132,232 B | 1,230,536 B |

Every admitted profile is checked against the strict global ceiling `<4 MiB`. These are computed upper bounds, not generated proof sizes or measured proof throughput.

## Commitment memory and work admission

The new module models the unchanged [commitment implementation](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_commitment.rs), with transferred coefficient capacity equal to the exact declared count. For one stage, its tracked commitment allowance is

`32*C + b*N + 48*(2*leaves−1) + (Base ? 8*C : 0) + 3*b*leaf_width + metadata + 4096`.

Here `metadata=(height+1)*size_of(Vec<Digest>)+size_of(CommittedCodeword)`. This follows the actual native module's accounting, including the Base conversion overlap. It excludes opaque allocator overhead and is not RSS. Actual transferred capacity may be larger; the commitment module must still check its real capacity before allocating.

The opening scratch estimate follows that same module:

`32*u*leaf_width + 48*u*height + 8192*u + 3*b*leaf_width + 4096`.

The `8192*u` term is the existing conservative native tree-worklist allowance. It is not a measured per-node allocation. Opening an existing codeword requires its retained commitment allowance plus that scratch. Work slots are `N*(log2(N)+4)+2*leaves` for commitment and `u*(leaf_width+8*height)` for opening. These counts are structural loop slots, not native instruction or field-operation benchmarks.

Approximate dominant first-stage payloads, before the small metadata and opening additions:

| Initial variables | Base commitment | Extension commitment |
|---:|---:|---:|
| 15 | 8.25 MiB | 20 MiB |
| 19 | 132 MiB | 320 MiB |
| 20 | 264 MiB | 640 MiB |

The unchanged commitment module defaults to 512 MiB per owned object/operation and permits an explicit maximum of 1 GiB. Initial `m=20` Extension fails the default and passes the explicit 1 GiB structural preflight. Both encodings of `m=19` pass the default. This does not authorize allocating a complete prover: concurrent factor tables, input values, basis transforms, query weights, source descriptors, retained opening objects and other protocol state require a separate total budget. `ResourceEstimate` reports all individual stages, maxima, the conservative sum of all retained codeword allowances, and that sum plus one maximum opening scratch to support that additional decision.

`admit_commitments()` checks native configuration validity, domain/leaf/query caps, per-codeword-plus-opening memory, opening wire limits and work slots. It does not silently raise limits, mutate the profile, or claim that the complete application fits memory.

## Recalculated conditional error expression

The theorem inputs are the WHIR paper's unique-decoding corollary, per-fold/shift analysis, constraint batching and single-oracle compiler. With rate `rho=1/16`, `delta=3/8` satisfies the strict requirement `3/8 < (1−rho)/2=15/32`, and the list bound is one. No capacity conjecture is needed for this parameter check. The resulting terms below are our substitution for this geometry; they remain conditional on all theorem premises and the actual protocol interaction. [WHIR, Corollary 4.11 and Theorems 5.2, 5.6, 7.5](https://eprint.iacr.org/2024/1586).

For up to three external queries plus the initial OOD constraint, define

`A = sum_i sum_(j=1..k_i) N_i/2^j + 3*(m−1) + sum_(i=1..s−1) C_i/2 + 257*(s−1) + C_0/2 + 3`.

The terms are post-fold domain error, strict-degree fold checks, shifted OOD, shift batching, initial compiler OOD and four-constraint batching. The domain subtotal telescopes to `16*2^m−32`; changing fold group sizes does not erase those individual fold events. The conditional opening expression is

`s*(5/8)^256 + A/|K|`.

| Initial variables | Sample events | Domain numerator | Total field numerator A |
|---:|---:|---:|---:|
| 2 | 1 | 32 | 40 |
| 6 | 2 | 992 | 1,301 |
| 15 | 4 | 524,256 | 542,548 |
| 19 | 5 | 8,388,576 | 8,669,281 |
| 20 | 5 | 16,777,184 | 17,337,512 |

The sampling term alone ranges from about `2^-173.59` for one stage to `2^-171.26` for five. These numbers do not establish composed security. Hash/Merkle binding, Fiat–Shamir, bounded sampling, the adversary model, the knowledge-soundness compiler premises, exact outer interaction and implementation equivalence remain separate obligations. Outer equation aggregation and cubic sumcheck need their own terms; original range/ROM, integer interpretation, input history and settlement are also outside this geometry. There is no 128-bit, privacy, game or ledger claim.

## Qualification

The new standalone native runner (retired source path `scripts/test-native-whir-geometry.py`) reused nine whole frozen native modules and 404 retained dependency artifacts, without Cargo, dependency builds, source rewriting or maintained-Iroha edits. Five tests passed: exact schedules/numeric bounds; every supported domain's root order and full fold chain; identity/local-budget separation; estimated admission versus real small commitments and opening geometry for both encodings; and resource gates without large allocations. The small real commitments cover `m=2,6`; no `m=15,19,20` proof or FFT was run by this lane.

Report: `output/qualification/native-whir-geometry/build-report.json`, SHA-256 `d7697e5139249b198c1fc0519ee3e437e3ba34c501952048d9f8bd1d63f22e52`.
