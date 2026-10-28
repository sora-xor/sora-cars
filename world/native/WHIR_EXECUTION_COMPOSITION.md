# Single-value-oracle scalar equation composition

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


8 September 2026. This specifies the implemented composition and its independent source and verifier checks. It leaves the previously pinned [sparse sumcheck](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/sparse_sumcheck.rs), [generic sumcheck](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/native_sumcheck.rs), [operand program](operand_program.rs) and [standalone WHIR protocol](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_protocol.rs) unchanged. This is a small scalar-equation relation over the native quartic Goldilocks field, not a full game proof, accepted-history proof, ledger verification or composed 128-bit claim.

The intended result is `VerifiedScalarEquations`: every compiler-selected scalar equation, explicit value-tail equation and supplied public port equality is checked through one committed value oracle. The result must retain the original unresolved range, ROM, base-field membership and execution-history obligations. A matching descriptor binds those obligations; it does not discharge them.

## Exact immutable relation

Let `F` be Goldilocks, `K=F[w]/(w^4-7)`, and `q=|K|`. Coefficients and fixed source operands are canonically embedded from F; all sumcheck and WHIR challenges and intermediate values belong to K. The laboratory fixes a 64-entry committed Boolean value table `V` with six LSB-ordered variables. Let `n=OperandProgram.table_len()≤64`.

The verifier compiles the augmented scalar relation itself, in an explicitly bound order:

1. Every original `OperandProgram` equation, preserving all ordered linear and quadratic occurrences, constant equations and disconnected contradictions.
2. One equation `operand(input_port[i])−expected_input[i]=0` for each ordered input port.
3. One equation `operand(output_port[i])−expected_output[i]=0` for each ordered output port.
4. One equation `V[a]=0` for each `a=n,...,63` in ascending order.

The exact implemented ordering must be reflected in the final descriptor; another fixed order is possible only as a distinct relation version. An original `Value(a)` must have `a<n`. Only compiler-created tail equations may introduce the otherwise unused ordinals `n..63`. Fixed `Constant(c)` operands are actual constants, not unconstrained table entries. Public values and lengths are externally selected and canonical. Repeated or aliased ports remain separate equalities; inconsistent expected values for the same source ordinal must make the relation unsatisfiable. A constant port with the wrong public value yields a nonzero constant equation.

The tail requirement is an actual polynomial predicate here. Honest zero extension or a `BasisPlan` parameter alone would not authenticate zero padding. A nonzero tail must be rejected by the augmented equation proof. This differs from zero padding of the sparse *factor-row* arrays, which is a public definition of those virtual arrays rather than an additional witness.

The relation identity must bind the full original operand descriptor and the exact augmentation, including source equation IDs, ordered terms/coefficients, fixed-source mapping, dynamic ordinals, liveness/placements, every range/ROM table and event, public port identity/order/expected value, and each tail ordinal. Matching dimensions, counts or a friendly relation name are insufficient: same-shaped circuits with different constraints are different relations. Preserve empty/zero/constant-only terms and exact counts; do not silently optimize away a contradiction or reorder an occurrence without changing the versioned identity.

## Equation batching and the six virtual factors

For each augmented equation `e`, write

`E_e(V)=c_e + Σ_(linear occurrences t in e) l_t*operand_t(V) + Σ_(quadratic occurrences u in e) q_u*left_u(V)*right_u(V)`.

Let `E` be the equation count, `N_E=nextpow2(max(1,E))`, and `m_E=log2(N_E)`. After the value commitment and its initial WHIR compiler OOD reply are fixed, sample `rho∈K^m_E`. Define `lambda_e=eq(rho,bits(e))`, using bit 0 as the first coordinate. Padded equation residuals are zero.

Flatten all linear occurrences in exact equation/term order into one list of length `T_L`, and quadratic occurrences similarly into length `T_Q`. Define an independent factor-row domain

`L=nextpow2(max(1,E,T_L,T_Q))`, `m_L=log2(L)`.

The factor domain L and value domain 64 generally differ. They must never share a challenge vector or array bound merely because one fixture happens to give equal lengths.

| Factor slot | Virtual Boolean row at index j | Row outside its list |
| --- | --- | --- |
| 0, `C` | `lambda_j*c_j` for equation j | zero |
| 1, `Lw` | `lambda_equation(t_j)*l_(t_j)` | zero |
| 2, `Lv` | `operand_(t_j)(V)` | zero |
| 3, `Qw` | `lambda_equation(u_j)*q_(u_j)` | zero |
| 4, `Ql` | `left_(u_j)(V)` | zero |
| 5, `Qr` | `right_(u_j)(V)` | zero |

Let each tilde denote the unique LSB multilinear extension of its own length-L table. Then the exact Boolean identity is

`Σ_(x∈{0,1}^m_L) [C̃(x)+Lw̃(x)*Lṽ(x)+Qw̃(x)*Ql̃(x)*Qr̃(x)] = Σ_e lambda_e*E_e(V)`.

The outer sumcheck proves this sum is zero. Each factor is multilinear; the product expression has individual degree at most three. Every outer round therefore has **four ascending coefficients**, degree at most three. This is distinct from the inner WHIR round's three coefficients and degree at most two. The protocol must bind both bounds and preserve them even for a lower-degree or identically zero instance.

At terminal point `r∈K^m_L`, the verifier computes `C̃(r),Lw̃(r),Qw̃(r)` directly from its compiled equations and sampled rho. The prover supplies only three canonical values `v_L,v_QL,v_QR`. The verifier checks

`C̃(r)+Lw̃(r)*v_L+Qw̃(r)*v_QL*v_QR = outer_terminal_claim`.

This product equation alone is insufficient: coherent changes to two read values can preserve it. The three values must also be authenticated through the following exact linear queries on the original V. No separate six-factor commitments, synthetic factor roots or streaming consistency hashes become PCS commitments in this new profile.

## The three virtual reads

For each read role `s∈{Lv,Ql,Qr}`, let `a_s(j)` be its compiler-owned operand at factor row j. An absent row has value zero. Define

`offset_s(r)=Σ_(j with a_s(j)=Constant(c_j)) eq(r,bits(j))*c_j`,

`W_s,r[a]=Σ_(j with a_s(j)=Value(a)) eq(r,bits(j))`, for `a=0,...,63`.

The exact required identity is

`v_s = offset_s(r) + Σ_(a=0)^63 W_s,r[a]*V[a]`.

Consequently the WHIR query has target `y_s=v_s−offset_s(r)` and multilinear weight

`W̃_s,r(X)=Σ_(a=0)^63 W_s,r[a]*eq(X,bits_6(a))`.

Its linear-Σ query is `Z*W̃_s,r(X)`. No prover-selected address, weight vector, fixed-value offset or expected claim substitutes for this compiler computation. Query IDs distinguish the ordered roles Lv, Ql and Qr; their surrounding transcript binds the concrete augmented relation and point context.

Repeated addresses accumulate all occurrence weights, including occurrences on both sides of a quadratic term or across distinct equations. A map assignment that overwrites the previous weight is wrong. Constant occurrences contribute to the offset, never to a fabricated value-table slot. Missing factor rows contribute exactly zero. An all-constant read can have an identically zero dynamic query with nonzero offset; an empty read has both zero. These cases still have well-defined required values and must not bypass outer terminal checks.

The explicit tail equations introduce genuine reads of the tail values into the linear read list, so they are covered by the same three queries. No fourth opening is required for zero-tail enforcement. The verifier's direct weight construction is charged work: straightforward scattering costs O((E+T_L+T_Q)*m_L+64) field operations; cached equality tables can trade O(L) storage for O(L+E+T_L+T_Q+64) work. These are structural estimates, not measured proving/verification costs or a succinct-validator claim.

## Compiler-ordered transcript continuation

The new continuation must have a distinct protocol/version domain from the pinned standalone fixed-query opening. Both prover and verifier reconstruct the same ordered channel:

1. Bind the new composition/profile identity, exact original and augmented relation, F/K representation and initial encoding, expected public scope/statement and port data. `OuterSpec` already fixes the equation-coordinate count, outer-round count, four coefficients per round, three read claims and initial target zero in this binding. Commit V and absorb its expected initial root and exact codeword spec.
2. Draw the initial WHIR compiler OOD scalar `zeta∈K`; its point is `(zeta,zeta²,...,zeta^32)`. Receive and absorb the one OOD reply before any dependent outer equation or round challenge. The reply remains unauthenticated at this stage.
3. Absorb the equation-challenge phase and its already bound count, then draw rho with a framed index for every coordinate. For each of `m_L` rounds, first check the canonical four-coefficient message and its zero/one sum against the current target; absorb its index and all four coefficients, then draw its fresh coordinate and update the target. The descriptor and initial zero target remain those bound in step 1; no new descriptor or reset is accepted here.
4. Receive exactly the ordered three terminal read claims. The adapter computes the public factors and requires the terminal product equation before `finish` absorbs all three claims into the continued channel. It derives the three query weights and offsets from the compiler-owned maps and r, and the opening phase binds their exact IDs, weights and adjusted claims. The honest prover constructs these queries before `finish`; the verifier constructs them after `finish`. Both bind the identical read claims and query set before any opening-batch challenge.
5. Resume the *same initial OOD obligation and channel*, including the complete intervening outer interaction. Retain the single-oracle compiler-combination randomness event and then draw the independent WHIR constraint-batching beta. The initial OOD constraint is index zero; the three reads have successive beta powers. Thus there are four same-oracle constraints in total.
6. Complete all existing WHIR shift, folding, OOD, Merkle, final sample and weighted-terminal checks. Require exact wire exhaustion. Only after both outer and inner decisions succeed may the adapter construct `VerifiedScalarEquations`.

The new [whir_continuation.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_continuation.rs) uses immutable `OuterSpec` and `Binding`, then the non-Clone phase types `InitialOodChallenge`, `PendingOodAnchor`, `OuterRounds` and `OpeningContext`. The equation challenge, round, finish, prove and verify transitions consume their phase object; errors cannot return a mutable state that continues after failure. There is no constructor from an arbitrary final transcript digest. The adapter replays canonical outer messages itself. The opening proof repeats the initial OOD reply and its decoder requires equality with the earlier absorbed reply. Private native-state copying supports parsing replay; it supplies no public restart operation or authenticated result.

The new [whir_execution.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_execution.rs) checks the concrete outer schema against its own compiled relation, reconstructs all round identities and the public terminal equation, derives its three maps, and only then invokes continuation verification. `OpeningContext` alone still permits a caller's own three linear queries and thus authenticates only those queries. `VerifiedScalarEquations` is constructed exclusively by the checked adapter after its compiler-derived queries pass; it is not a type alias for the weaker opening result.

The current crate-local adapter entry point is `CompiledArithmetic::new(&OperandProgram, expected_inputs: &[K], expected_outputs: &[K])`. Its immutable `binding(scope, statement, encoding)` constructs the concrete `OuterSpec`; `commit`, `prove` and `verify` reject a binding whose outer descriptor differs. `prove(&Binding, CommittedCodeword)` returns bytes. `verify(&Binding, expected_root, bytes)` requires only the compiled relation, expected public context/root and proof bytes, then returns `VerifiedScalarEquations` or an error. It does not receive the witness or accept an externally supplied `QuerySet`. The raw `decode` and `replay_outer` helpers produce no authenticated scalar result.

The outer wire starts with `IWHEX001`, followed by one canonical K initial OOD reply, exactly `m_L` rounds of four ascending K coefficients, three ordered canonical K read claims, and the remaining complete `IWHIC001` continuation opening. The outer fixed portion is `136+128*m_L` bytes; all K values use their canonical 32-byte encoding. The verifier derives the round count from its compiled relation and the inner opening layout from its continued transcript, with no proof-chosen dimensions or opening positions. Outer bytes are capped at `(4 MiB)+4096`; compiled limits are 4096 augmented equations, 65536 total term occurrences and a 1 MiB descriptor. These are admission limits, not measured execution costs.

Fully consumed scalar round messages are not additional committed polynomial oracles. The formal compiler mapping must state how these ordinary interactive messages and challenges are included in its round-by-round model. Merely concatenating two pre-existing proof blobs or citing ordinary sumcheck soundness does not establish the knowledge-soundness premise of WHIR Theorem 7.5. A resumed opening can authenticate its own supplied linear queries without automatically attesting that an arbitrary caller correctly executed the outer verifier; construction of the stronger result belongs to the checked adapter.

## Remaining obligations and conditional error budget

For a fixed value polynomial, a nonzero augmented residual vector gives a nonzero multilinear polynomial in rho of total degree at most `m_E`. Its random evaluation vanishes with probability at most `m_E/q`. Once rho and V are fixed, standard cubic sumcheck contributes at most `3*m_L/q`. At `m_E=0`, there is no equation-randomness loss and the constant residual is checked directly; at `m_L=0`, the terminal expression is checked directly with an empty point, with no nonexistent round access. The current adapter explicitly rejects an augmented equation count of zero; the continuation separately supports zero equation coordinates and zero outer rounds.

The same fixed64 WHIR profile has the previously documented conditional opening subtotal `3*(5/8)^256+8510/q`, including its initial OOD and four-constraint batch. There is no additional `2/q` batch fee for the three reads: that would double-count the same batching event. A candidate combined algebraic bound is therefore

`3*(5/8)^256 + (8510 + m_E + 3*m_L)/q`.

This expression is conditional on the exact unique-decoding/list hypotheses, admissible degrees, compiler-ordered interaction and the required round-by-round outer soundness/extraction mapping. It is not by itself a theorem that the composed native implementation achieves that bound. Hash/Merkle binding, Fiat–Shamir transformation, transcript composition, the adversary model, extraction details and implementation equivalence still require qualification. Changing geometry, query counts, rejection rules, fields or degree bounds requires a new derivation. No 128-bit claim follows from a field size or this sum.

The compiled scalar equations do not automatically establish original range membership, fixed-ROM membership, source-value membership in F when viewed as generic K values, machine integer interpretation, or external authenticity of supplied port values. All original catalogs and exact public-port bindings must remain accessible in the result as appropriate. The adapter also does not establish a complete multi-step execution boundary, first-terminal completion, accepted/revealed input history, signatures, consensus disputes, roster/epoch validity, escrow, payout, NFTs or ledger finality. Those omissions are explicit result scope, not checks an eventual admission path may drop.

The independent scope fixture makes this boundary concrete. A compiled input constrained to `[0,3]` has the three actual source values `x`, `x−0` and `3−x`. Set them to `[4,4,p−1]`, where p is the Goldilocks modulus, and bind input/output expectations to 4. All compiled scalar equations and public equalities hold, and the continued scalar proof verifies. The complete raw operand verifier nevertheless returns a range error for the retained two-bit slack predicates. The scalar result preserves the same source descriptor and reports remaining range reads. This is an intentionally accepted scalar-only example, not evidence of authenticated range membership.

## Independent verifier tests required

- Honest base and extension fixtures with `L≠64`, exact source-equation parity, nontrivial public ports, repeated operands and constant offsets; include zero and constant-only relations where supported.
- Reject same-shaped relation substitution, changed coefficients or fixed/ROM/range catalog data, changed port expectations, aliased inconsistent ports, network/statement/epoch changes, another root and swapped read-role IDs.
- Reject a nonzero committed tail through actual verifier equations, including a malicious proof whose original source equations are satisfied; do not count honest-prover rejection alone.
- Reject the previously demonstrated pair of false read evaluations that preserves the outer terminal product equation. Supply a coherent outer transcript, not merely an invalid parser input, and require the read opening to fail.
- Reject omitted constant offsets, overwritten repeated-address weights, wrong read addresses, nonzero factor-gap rows, a value-domain/factor-domain index mix-up and a dropped original constant contradiction.
- Reject an opening built from the old standalone transcript, changed initial OOD reply, replayed continuation from another outer transcript, moved read claims after beta, truncated/missing/extra rounds and unbound outer challenges.
- Exercise zero/one arithmetic coordinates without production challenge overrides; exact four-coefficient outer messages versus three-coefficient inner messages; zero-variable handling or explicit rejection.
- Reject altered Merkle material, terminal polynomials, canonicality violations, oversized/trailing proof bytes and failed-phase reuse. No parse-only or pending result may construct the stronger authenticated type.
- Preserve an example that satisfies scalar equations but violates a retained range or ROM predicate, demonstrating that the result still reports that unresolved obligation instead of claiming a full execution proof.

## Reviewed implementation and retained evidence

The final combined [qualification report](../../output/qualification/native-whir-execution-qualified/report.json) is the current source identity for this increment. Its complete `sources` map pins 12 selected local files; `nativeSources` pins nine retained native source, provenance and license files. Their retained copies and all 230 reported artifact hashes/sizes were checked against the report. The retained native modules were not transformed, and the lane reused 404 cached dependencies without a dependency build.

| Evidence | Exact identity or result |
| --- | --- |
| Final report SHA-256 | `01d77bc67904f980e03022237605e8628a201329f606d7ca78ce897b8e4cbd36` |
| `whir_continuation.rs` SHA-256 | `32d613607e47dc8b1bc33eea17db80421f82255547d744061cd6b5fd163e864b` |
| `whir_execution.rs` SHA-256 | `266904065c61dd8b63b9e1e97f769e8f7d3d01b20ef09ace195703a8a7c70151` |
| Combined native suite | 32 passed: 14 prior WHIR regression tests, five continuation tests, four adapter tests, two exact compiler-fixture tests and seven independent composition tests |
| Separate CLI processes | 66 commands: ten expected successes and 56 expected rejections; two additional runner optimization-guard rejections |
| Public verification inputs | Both encoding modes verify from the 377-byte expected public statement and proof in a directory containing no witness; the compile-only verifier path does not call the witness-generating fixture |

The independent source review found no mismatch in original-equation retention, public-port and tail augmentation, public-factor algebra, or the three linear read maps. The seven independent tests were written separately from the implementation and run by the integrating agent. One test-only range fixture assumption was corrected to retain the compiler's two actual slack wires; no native acceptance code changed in response. Tests include genuine continued openings around false scalar equations and false maps, so their rejection is not merely parser failure or refusal by the honest prover. They also include the deliberately accepted scalar-only, range-invalid example above.

The earlier 25-test owner run and seven-test independent run remain historical reports. The 32-test combined run uses the final fixture and runner source pins and is not 32 additional distinct tests. Passing these finite tests and local source review does not prove the conditional security bound or qualify the unresolved predicates. Timing and process-memory observations belong to the separate [implementation report](NATIVE_WHIR_EXECUTION.md); no full Street or 180-second race performance is inferred from this small fixture.

## Primary construction and immutable local evidence

The [WHIR paper](https://eprint.iacr.org/2024/1586), inspected revision 21 November 2024, supplies Constructions 5.1, 5.5 and 7.4 and Theorems 5.2, 5.6 and 7.5. Its retained PDF is `output/research/sumcheck-openings/whir.pdf`, SHA-256 `ccacc62cf5529ff95c3cf115cf730b020336f8d95c310c8deb64e3beac30ce61`. Section 7.2's compiler explicitly places each oracle's OOD phase before dependent verifier randomness; Theorem 7.5 requires outer round-by-round knowledge soundness. The exact sparse linear identities above are direct algebraic consequences of the immutable source representation, independently derived here.

Local reference boundaries are the [opening plan](SUMCHECK_OPENING_PLAN.md), [WHIR profile](WHIR_PROFILE_V1.md), [independent WHIR review](WHIR_REVIEW_CHECKLIST.md), [operand program](operand_program.rs), [sparse sumcheck](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/sparse_sumcheck.rs) and [native sumcheck](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/native_sumcheck.rs). Their existing pending APIs and pinned evidence remain unchanged; this composition is a new relation and protocol.
