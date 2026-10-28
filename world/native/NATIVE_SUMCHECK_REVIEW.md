# Native sumcheck independent review

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


Review date: 8 September 2026. Status: native source review completed and **8 independent external tests passed**. No algebraic, transcript-binding or parser defect was found in the reviewed reduction. Resource-accounting findings were corrected before the final run. This is an implementation review of pending proof obligations, not cryptographic qualification.

## Scope and acceptance boundary

The new component is a sumcheck reduction for an explicit expression

`g(x) = Σ_t coefficient[t] · Π_j factor[t,j](x)`

whose factors are multilinear polynomials over the native Goldilocks quartic extension. The sum is over a Boolean hypercube. Factor indices may repeat: the individual degree is bounded by the number of factor occurrences in a term, not the number of distinct factor identifiers. The constant term has an empty product equal to one. This review does not treat the source-polynomial adapter, sumcheck rounds, stream consistency digests, or prover-reported terminal values as an authenticated polynomial commitment opening.

A completed round sequence produces **pending terminal evaluations**, not a verified computation. For each round, the verifier checks `q_i(0) + q_i(1) = claim_i`, derives the challenge after absorbing the exact round message, and sets `claim_(i+1) = q_i(r_i)`. Acceptance still requires authenticating every referenced factor at the resulting point and checking the concrete expression against the terminal claim. A prover can fabricate an internally consistent sequence of round messages for a false sum if that final check is omitted.

## Review obligations

- Bind the complete emitted expression, field/profile version, dimensions, public statement, execution scope, ordered oracle roots and initial claim before the first challenge. A relation/compiler name alone is insufficient. Preserve repeated factors, zero coefficients and constants in the concrete descriptor unless a separate canonical normalization is defined and reviewed.
- Specify the Boolean row order and challenge-coordinate order. Low-bit-first means row `b` represents coordinates `(bit_0(b), bit_1(b), …)`; folding adjacent pairs consumes the first variable.
- Accept exactly the compiled number of rounds and exactly `degree_bound + 1` canonical extension coefficients per round, including trailing zero coefficients. Parse dimensions from the trusted compiled program, not from attacker-supplied proof headers. Reject missing, extra, noncanonical or trailing proof data within preflight bounds.
- Handle zero variables without inventing a round, and degree zero without reading nonexistent linear coefficients. Even a zero-round reduction leaves the original evaluation claim pending. Reject expressions whose actual product degree exceeds the bound, including repeated factors.
- Fail permanently after a malformed or inconsistent streamed round. Require exact exhaustion before returning the pending obligation. No reset or unchecked terminal-value helper may upgrade that obligation into acceptance.
- A streaming prover must reopen an identical source for each pass, read exactly the advertised rows and factor width, reject noncanonical values and read failures, and detect changed, truncated or extra data. An internally recomputed digest establishes consistency with the first pass; it does not establish equality with the public commitment roots.
- Test a fabricated polynomial sequence that satisfies every round identity but disagrees with the actual factor evaluations. One-round cross-binding replays may still produce pending obligations because the first identity precedes the first challenge; test the changed residual, rather than incorrectly requiring every such reduction to reject immediately.

## Source review findings

`native_sumcheck.rs` owns its validated expression, accepts no proof-side relation, and hashes exact ordered coefficients and factor occurrences alongside dimensions, the field/order suite and selected limits. Its binding separately length-frames scope, statement and indexed roots. The native transcript consumes the program digest, public binding digest and initial claim before challenges; each round absorbs its index and all fixed-width coefficients. The full-field native Fp4 sampler is used, including zero and one. The public result has private fields and only getters for the pending point, claim and bindings; it exposes no authentication or completion method.

`native_sumcheck_stream.rs` accumulates two factor endpoint vectors for each contiguous `2^(i+1)`-row group, multiplying prefix weights from absolute low-order row bits. It expands the ordered product at each group before adding group coefficients. This preserves products of multilinears, including repeated factors. Every pass validates the original shape, source descriptor, exhaustion and a rolling native digest that includes all columns, even unused factors. It retains no full folded factor matrix or exponential prefix-weight array. Its source digest is explicitly consistency with the first scan, not evidence that the source opens the bound oracle roots.

The sparse adapter retains the original operand source and hashes its complete descriptor before deriving equation weights, alongside the public statement and the pre-existing value root. Its six-factor expression is `C + Lw·Lv + Qw·Ql·Qr`. Source constants, every ordered linear/quadratic occurrence and zero-padding are accounted for. The three public factor evaluations are recomputed exactly at the terminal point. `reduce` additionally checks the scalar terminal equation and still returns only `PendingSparseClaim`: the value root, all six factor roots/evaluations and the three virtual-read factors remain obligations. Range membership, ROM membership and execution boundaries remain required through the retained original source.

Three resource findings were addressed during review:

1. Dense work admission initially omitted unused-factor scanning/copying/folding. Its bound now includes factor work even for an empty expression, with a rejection test under a one-work-item cap.
2. Streaming scratch accounting initially counted the prefix and opposite-prefix arrays but omitted the core verifier's point array. It now includes that third array and the verifier's fixed size. Native opaque temporary allocations and source-owned memory remain explicitly outside the tracked buffer figure; it is not measured RSS.
3. The sparse dense materializer initially allocated all six tables before enforcing a corresponding dense payload ceiling. It now validates its challenge before allocation and calls the same `dense_admission()` helper as the core prover, including both work and payload limits.

## Independent adversarial coverage

The external test module (retired source path `scripts/native/native_sumcheck_audit.rs`) imports only the exposed APIs and native field operations. It does not access private prover/verifier implementation state. Its direct multilinear corner evaluation and Lagrange interpolation are independent of both implementations' product expansion and folding helpers.

The eight tests cover:

- Every round coefficient and final factor evaluation for a three-variable cubic expression with repeated factors, negative coefficients and non-base Fp4 values; dense and streaming byte/point/evaluation parity.
- A fabricated all-zero round sequence for an actually constant-one oracle. All round identities pass and produce a pending zero claim, which disagrees with the oracle's true terminal value. This demonstrates why reduction is not acceptance.
- Changed scope, statement, ordered roots, concrete coefficients and initial claim; a one-round replay that produces a changed pending point/claim under a changed binding.
- All 392 strict truncations of the fixture proof, extra bytes, altered magic, all 48 noncanonical coefficient-coordinate positions, extra/missing rounds and high-degree coefficient lists.
- Permanent poisoning after malformed/inconsistent/extra streamed rounds and incomplete termination.
- Zero variables, zero degree, no factors, repeated-factor degree overflow, invalid indices/dimensions, root arity, bounded proof size and unused-factor work admission.
- Sources that change used or unused values, truncate, append, change width/identity, fail reset or fail reads between passes; resource rejection before source access.
- A sparse read in a zero-coefficient padding slot deliberately changed to one. Scalar round and terminal identities still pass and yield a pending read claim, while the compiler's read map says the slot has no operand and must be zero. A changed public factor is rejected immediately. Authenticating factor openings alone cannot replace this indexed-read/padding relation.

## Retained evidence

Run command:

Recorded retired invocation:

```text
python3 scripts/test-native-sumcheck.py --lane native-sumcheck-independent --module native_sumcheck_stream --module sparse_sumcheck --audit --filter native_sumcheck_audit
```

The [independent report](../../output/qualification/native-sumcheck-independent/build-report.json), SHA-256 `629b080492bdeafa51866cb07badc7bcc768fc024d9205b5f53785f2ab80a3de`, records `8 passed; 0 failed` and the exact invocation, retained binary and native assembly. All **17 source entries** and **23 retained files** were independently rehashed after the run with no mismatch. The runner reused the retained native Iroha field/hash/transcript modules and cached dependencies, with no source transformations, Cargo builds or maintained Iroha edits.

| Reviewed source | SHA-256 |
| --- | --- |
| `world/native/native_sumcheck.rs` | `0caa8fb105425c0afc1006921a42666d477bf4415e585104390b4ccc98c4ae49` |
| `world/native/native_sumcheck_stream.rs` | `b15355fcd9f075517e389a27b4c84589cd62ddf05bfc0ebf8976db50d495703f` |
| `world/native/sparse_sumcheck.rs` | `1b47e649b4b1675141d1ea18acc1d4d66d4e4b6741b035291d7eb0dd4c2a950b` |
| `scripts/native/native_sumcheck_audit.rs` | `860972ecc2abd5cabdcc31e1c1fd8fec444ab3bfbf0928b063f7c7111fbe5315` |
| `scripts/test-native-sumcheck.py` | `017baefac1cc1e255c6a6613bca1ac0a0d4d48b407aa2232541c5c4d46dbbd7c` |

The eight tests are independent of the component owners' test selection. This review did not reproduce a complete race, measure full-race proving resources, authenticate a PCS opening, validate accepted input history, or exercise consensus settlement.

## Separately scoped multilinear-basis review

The additional [basis module](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/multilinear_basis.rs) was reviewed for exact arithmetic and bounds. Its Boolean-to-monomial conversion subtracts the low half from the high half at each ascending bit; the inverse adds it back. Coefficient index `b` represents the monomial selected by the set bits of `b`, so substituting `X_i = z^(2^i)` yields univariate exponent `b`. The direct corner evaluator and Horner evaluator match these representations. They are not roots-of-unity interpolation.

The selected dimension must equal `log2(next_power_of_two(max(1, active_len)))`. Checked dimensions, output payload and work limits precede allocation. The zero tail applies to Boolean evaluations, including the empty-input one-row domain; coefficients can have a nonzero tail. Both conversion directions check the prescribed evaluation padding, while coefficient-evaluation methods explicitly perform arithmetic without authenticating padding. Per-call owned output payload excludes borrowed inputs, previously retained outputs, allocator/native scratch and process RSS. No remaining arithmetic, shape, allocation-bound or padding defect was found.

A test-only portability finding was fixed: malformed `K` injection through the native `from_base` constructor now runs only when debug assertions are disabled, because that constructor asserts its precondition in debug builds. Malformed base-input rejection and all four canonical extension-coordinate checks remain unconditional.

This was an independent **source review**, not another independent test run. The owner's **six basis tests** are distinct from the **eight external sumcheck tests** above. The [basis report](../../output/qualification/native-multilinear-basis/build-report.json), SHA-256 `a53b4e5bb4e297d10a594f2356bb134db8c47f22903022610d7f459186b89b0a`, records six passing tests; its **11 source entries** and **17 retained files** were independently rehashed without mismatch. Reviewed source `world/native/multilinear_basis.rs` is `6d70ecf149e49701fbda09f65cfae6600793621f14795b37d660b280c8df0de0`; runner `scripts/test-native-multilinear-basis.py` is `85896aa8ce9683ed404869220bc2464ed2041ff5071bea53008f52c19957eb4c`. These fixtures establish no commitment, authenticated padding, WHIR opening or security qualification.

## Cryptographic limits

For an interactive sumcheck with independently uniform challenges over a field `K`, a familiar algebraic error term is at most the sum of the admitted individual degrees divided by `|K|`, subject to the exact terminal authentication and protocol premises. That isolated term is not the security of this implementation. Concrete Fiat–Shamir hashing, transcript codecs, polynomial commitment binding/opening, random aggregation, multiple executions and any batching or recursion require a composed argument. Native field width or a sumcheck test suite does not establish 128-bit security.

Recent primary work makes the transcript boundary material: the generated-relation attacks of [Fenzi, ePrint 2026/1838](https://eprint.iacr.org/2026/1838), received 31 August 2026, bind the actual generated statement before the first challenge in the mitigation of §5.2. [Packed Sumcheck, ePrint 2025/719](https://eprint.iacr.org/2025/719), revised 3 October 2025, analyzes repetition with explicit round-by-round soundness; a repetition count alone is not a substitute for that argument. The [CFRG Fiat–Shamir draft 03](https://datatracker.ietf.org/doc/draft-irtf-cfrg-fiat-shamir/03/), August 2026, is useful implementation guidance for canonical codecs and instance/session binding, and remains a work-in-progress draft.
