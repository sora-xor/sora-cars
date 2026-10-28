# Native sumcheck and sparse scalar reduction

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


8 September 2026. This laboratory implements a generic native arithmetic reduction, two prover algorithms and a lossless adapter for the existing scalar computation. Successful verification returns **pending polynomial evaluations**. It does not yet authenticate those evaluations or prove a complete game. Live XOR and NFT settlement remain disabled.

The implementation uses the retained whole Iroha Goldilocks/Fp4, execution-domain hashing, canonical reader and Fiat–Shamir transcript modules. It introduces no external zkVM, foreign proof library, privacy-format change or race-specific ISI. All code and standalone build output are under `sora-cars`; the maintained Iroha checkout and its Cargo/dependency lane were not changed.

## What the reduction establishes

Let `K` be Iroha's quartic extension of the Goldilocks field. A compiled program fixes `n` Boolean variables, an ordered collection of multilinear factors `f_j`, and the expression

```text
g(x) = Σ_t a_t · ∏_(j in term_t) f_j(x)
S    = Σ_(b in {0,1}^n) g(b).
```

Factor occurrences can repeat; their multiplicity determines the individual degree. Constants use an empty product. The compiler fixes every coefficient, factor index and dimension. The descriptor preserves zero coefficients, repeated terms and unused factor identities. A proof cannot supply a different expression or choose a looser degree.

At round `i`, the prover sends the ascending coefficients of a polynomial `q_i(T)` of degree at most `d`. The verifier requires `q_i(0) + q_i(1) = S_i`, absorbs the round index and all coefficients, derives a uniform native extension-field challenge `r_i`, and sets `S_(i+1) = q_i(r_i)`. At the end, the claim is about `g(r_0,…,r_(n−1))`.

This last claim must be checked against authenticated evaluations of the original committed factors. `PendingEvaluations` deliberately exposes no acceptance method. An internally consistent round chain alone can describe a false oracle, as an independent test demonstrates. The component is public and has no zero-knowledge masking.

Boolean rows use low-bit-first order: row `b` has coordinates `(bit_0(b), bit_1(b), …)`, and adjacent-pair folding binds the first variable. Zero-variable and zero-degree programs have explicit behavior; they still leave terminal authentication pending. Challenges equal to zero or one are supported without division or rejection.

## Binding and encoding

Before the first sumcheck challenge, the transcript binds:

1. The exact compiled expression, native field/suite identity, dimensions, degree and admitted limits.
2. A length-framed external scope and public statement, plus the indexed, ordered oracle identities.
3. The externally expected sum.

Every round then binds its index and its exact fixed number of canonical Fp4 coefficients before the next challenge. A streamed verifier is permanently poisoned by malformed, extra or inconsistent rounds.

The wire frame is eight bytes of version magic followed by exactly `n·(d+1)` canonical 32-byte extension elements. Its length is `8 + 32n(d+1)` bytes. The dimensions come from the compiled verifier; there is no proof-selected length, dimension or degree. Strict exhaustion rejects every truncation and trailing byte. These bytes contain the **sumcheck rounds only**: roots, terminal openings and the remaining execution proof are additional obligations.

Opaque scope/statement bytes must eventually be constructed by the native game execution admission layer from immutable ledger context. This laboratory does not construct or authenticate network IDs, accepted input histories, dispute decisions, first-terminal claims or custody state.

## Preserving the scalar relation

The [sparse adapter](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/sparse_sumcheck.rs) consumes an immutable [operand program](operand_program.rs). For every original scalar equation it preserves

```text
E_e(V) = c_e + Σ_l a_(e,l) V_(addr_l)
             + Σ_q b_(e,q) V_(left_q) V_(right_q) = 0.
```

Operands can also be compiler-fixed constants. The original descriptor includes all equations, ranges, fixed tables and indexed reads, values, ports and aliases. The sparse profile hashes that complete descriptor and the exact layout. It does not reduce the source to an assumed rank-one equation or remove disconnected constraints.

The original value commitment identity is bound with the public statement **before** deriving the equation challenge `rho`. Define the multilinear equality weight

```text
eq(rho,e) = ∏_k (bit_k(e) ? rho_k : 1−rho_k).
```

The target is the weighted residual `Σ_e eq(rho,e) E_e(V) = 0`. A six-factor table over `N = next_power_of_two(max(equations, linear terms, quadratic terms, 1))` expresses exactly that residual:

| Factor | Boolean-row value | Terminal obligation |
| --- | --- | --- |
| `C` | Equation constant times its equality weight | Recomputed from the compiled source |
| `Lw` | Ordered linear coefficient times its equation weight | Recomputed from the compiled source |
| `Lv` | Corresponding original value or fixed constant | Authenticated indexed read |
| `Qw` | Ordered quadratic coefficient times its equation weight | Recomputed from the compiled source |
| `Ql` | Corresponding left operand | Authenticated indexed read |
| `Qr` | Corresponding right operand | Authenticated indexed read |

Each factor is zero beyond its own source list. Their expression `C + Lw·Lv + Qw·Ql·Qr` has individual degree at most three after multilinear extension. The three lists share a Boolean domain but keep their separate lengths and exact order. The identity holds on the Boolean cube; off-cube multiplication uses these multilinear factors, not a multilinear extension of the already multiplied result.

The six factor identities are bound after `rho` and before the cubic sumcheck. The verifier reconstructs the three public factor evaluations by traversing the complete source lists and checks the final scalar expression. It recomputes equality products, so field work scales with both term counts and challenge-vector lengths. A succinct matrix-closing argument has not been substituted for that explicit traversal.

`PendingSparseClaim` retains the original value identity, all six factor identities and claimed evaluations, terminal point, transcript state and original source obligations. Six polynomial openings would still be insufficient: every `Lv/Ql/Qr` slot must be proved equal to the compiler-selected original value, fixed constant or padding zero. Range and ROM membership, stage/execution links, public boundaries, first terminal and accepted input history must also be discharged. Neither copied reads nor numeric forfeit fixtures are authoritative inputs.

## Dense and streaming provers

The [dense prover](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/native_sumcheck.rs) copies and folds full factor tables. Its shared admission check includes borrowed input payload, owned copies and local buffers, as well as work for unused factors. The sparse materializer uses that same check before allocating tables.

The [streaming prover](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/native_sumcheck_stream.rs) rescans a replayable source. It retains two endpoint vectors, final factor claims, challenge arrays and the short round messages. Prefix equality weights are recomputed without retaining a folded matrix or an exponential weight table. A source adapter for the sparse relation borrows the original values and compiler maps and materializes just one six-factor row at a time.

For `N = 2^n`, the algorithm performs exactly `n+1` complete source passes, including an initial claim check, and reads `(n+1)N` rows. Prefix weighting alone uses `N·n(n−1)/2` field multiplications. This implementation trades memory for extra work; it is not an implementation of every time-space technique in the research survey.

Every pass checks exact shape, canonical values, source identity and EOF, and computes a native rolling consistency digest over every column, including unused ones. A changed source aborts. This digest establishes consistency with the first scan; it does not authenticate the source to any PCS root. Its hashing cost is included in the measured streaming time.

Tracked scratch excludes source-owned tables/maps, retained compiler descriptors and opaque allocations within native primitives. It must never be reported as process peak RSS. Both limits and measured RSS are recorded separately. The current bounds admit at most 24 variables and degree eight; these are resource limits, not a security profile or full-duration capacity claim.

## Tests and qualification

All 26 focused native tests pass: nine core tests, six streaming tests, three sparse tests and eight independent tests. These cover product expansion and exact round coefficients; true extension values; degree zero through eight; repeated factors; empty expressions; dense/stream byte, point and terminal-value parity; strict codecs; context changes; and permanently poisoned rounds. The independent suite also checks mutable or failing sources and limits before reads.

The sparse fixture includes multiplication, comparison, conditional selection, a real fixed ROM read, signed ranges, a fixed value and aliased output ports. An independent padding attack satisfies both sumcheck and terminal algebra while returning the wrong copied value in a padded slot. It remains pending, demonstrating why the future indexed-read relation is mandatory. A second coherent changed-read example similarly preserves the terminal scalar expression without becoming an accepted proof.

Run the combined suite with:

Recorded retired invocation:

```text
python3 scripts/test-native-sumcheck.py --lane native-sumcheck-combined \
  --module native_sumcheck_stream --module sparse_sumcheck --audit --filter sumcheck
```

The runner freezes whole native modules and local source, verifies the retained compiler, 404 cached compiled dependencies and two native archives, and records commands, logs and source/binary hashes. It invokes `rustc` directly against those artifacts. No Cargo or dependency build is performed. See the [independent review](NATIVE_SUMCHECK_REVIEW.md) for its exact scope and adversarial evidence.

The separate [multilinear basis module](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/multilinear_basis.rs) supplies the next arithmetic prerequisite. Its LSB Möbius and inverse butterflies convert Boolean evaluations to and from monomial coefficients. Coefficient index `b` denotes the product of variables selected by the set bits of `b`; under `X_i = z^(2^i)` it therefore becomes univariate exponent `b`. Direct corner-weight evaluation, direct coefficient evaluation and univariate Horner evaluation cross-check that identity. A roots-of-unity IFFT comparison explicitly distinguishes the two representations. Shapes use the minimal power-of-two domain, an explicit zero tail and checked canonical/resource bounds. Coefficient-only evaluation remains arithmetic and does not authenticate the implied padding or a commitment.

Its six separate native tests pass; the [basis report](../../output/qualification/native-multilinear-basis/build-report.json) is distinct from the 26-test sumcheck suite. The recorded invocation was `python3 scripts/test-native-multilinear-basis.py`. These conversions do not yet implement Reed–Solomon commitment encoding or WHIR proximity/opening verification.

## Measured Street workload

The [Street report](../../output/qualification/native-sumcheck-street/report.json) measures a single actual native Tokyo tick with eight-bit range limbs. The harness checks all native graph-node values and the original raw scalar, staged and operand relations before reduction. Dense and streaming runs use separate processes and must produce identical encoded round bytes, challenge points, factor evaluations and transcript states. Commitment roots in these runs are explicitly **synthetic identity labels**. The runs invoke no PCS.

| Racers | Prover | Factor rows | Round bytes | Prover seconds | Whole-process peak RSS |
| --- | --- | ---: | ---: | ---: | ---: |
| 2 | Dense | 65,536 | 2,056 | 0.04498 | 75,644,928 B |
| 2 | Streaming | 65,536 | 2,056 | 32.75414 | 51,363,840 B |
| 8 | Dense | 1,048,576 | 2,568 | 0.69951 | 1,055,096,832 B |
| 8 | Streaming | 1,048,576 | 2,568 | 946.96776 | 652,984,320 B |

The two-car relation contains 24,406 values, 20,394 equations, 41,603 linear terms, 23,332 quadratic terms, 16,572 range obligations and 160 ROM obligations. All 5,587 original graph-node values match. The range/ROM checks in this harness are raw checks, not cryptographic membership proofs. The one tick does not exercise complete-race termination or authenticated accepted history.

Streaming performs 17 passes and 1,114,112 row reads in this case, with a tracked scratch ceiling of 11,856 bytes plus its source-owned 192-byte row. Those small buffer figures exclude the resident original values, compiled source, sparse maps and native hash internals. The measured process RSS includes them. The full source descriptor is 11,099,357 bytes; hashing and sparse construction take approximately 0.387 seconds per process and are reported separately from prover time. Compilation of the native executable is excluded from all run times.

The eight-car relation retains 340,566 values, 279,530 equations, 568,240 linear terms, 454,949 quadratic terms, 219,236 ranges and 640 ROM obligations. It checks all 101,808 native graph-node values. The arithmetic lists contain 1,478,138 operand occurrences before the separate range/ROM consumers. Dense factor storage occupies 201,326,592 bytes; the core accounts for 402,670,344 bytes including its copies and buffers. The separate complete operand descriptor occupies 163,365,493 bytes. Native sparse compilation and full-descriptor hashing take 6.204 seconds in the dense process and 5.749 seconds in the streaming process.

The eight-car stream finishes all 21 passes, 22,020,096 source rows and 132,120,576 field-element reads. Its tracked scratch ceiling is 13,360 bytes plus the 192-byte source row; process peak RSS is 652,984,320 bytes. Exact byte/point/factor/transcript parity passes against the dense result. Whole-process times are 9.646 seconds dense and 954.645 seconds streaming, including the raw checks and compilation of the relation. Direct public-factor reduction takes approximately 1.49 seconds in each. The 2,568-byte artifact is only the 20-round reduction, with no authenticated commitments or complete execution proof.

This first streaming algorithm lowers memory while substantially increasing work. Repeated row-consistency hashing and prefix recomputation remain visible in its timings. These are single local CPU observations on one-tick reductions, not isolated hardware benchmarks, eight-player latency guarantees, validator measurements, full-race proof sizes or a production memory comparison with WHIR/FRI.

## Soundness remains to be composed

With independently uniform interactive challenges, fixed committed oracles and sound terminal authentication, the isolated sumcheck error term is at most `nd/|K|`. A nonzero weighted residual over `m` equation-index variables contributes a separate term at most `m/|K|`, provided the original value vector was fixed before `rho`. These conditional algebraic terms do not establish the security of the noninteractive implementation.

A complete analysis must include the concrete hash construction and shared primitive provenance, Fiat–Shamir model and query bounds, commitment binding and degree enforcement, indexed-read and membership reductions, batching, shard composition, and exact public/history admission. Native Fp4 width and successful tests do not establish 128-bit security. The [September research update](../../docs/research/2026-09-08-cryptography-update.md) explains why recent WHIR/FRI and transcript results need their own parameter and assumption accounting.

The next implementation must authenticate multilinear terminal evaluations and the original value/read relationship. The existing univariate DEEP/FRI opening does not automatically open a multilinear polynomial at an arbitrary vector: substituting one point for a vector is not a valid reduction. The [opening plan](SUMCHECK_OPENING_PLAN.md) proposes a new native WHIR profile with one committed original value oracle and compiler-derived linear queries for the virtual factors. It specifies distinct value/factor dimensions, constant and padding contributions, repeated addresses, claim-before-batching order and the full required OOD/compiler integration. That proposal could remove the six copied/public factor commitments; it does not close the current pending API. A native commitment/closing implementation and measured resources remain necessary before this component can become part of a complete generic execution proof.
