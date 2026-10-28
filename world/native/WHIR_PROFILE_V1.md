# Native WHIR linear-query laboratory profile V1

September 8, 2026. This is the explicit implementation profile for a **generic Fp4 polynomial opening laboratory**. It follows WHIR Constructions 5.1, 5.5 and the single-oracle case of 7.4. It is not a production parameter selection, game proof, base-field membership proof, zero-padding proof, privacy protocol, or composed 128-bit security claim. Maintained Iroha changes remain outside this work.

## Fixed geometry and representation

Write `F = Goldilocks`, `K = F[w]/(w^4-7)`, `p = 2^64-2^32+1`, and `q = |K| = p^4`. **The paper's protocol field is K.** Every challenge scalar, coefficient, weight and reply uses canonical native K. The initial commitment may use a verifier-selected compact Base encoding when its coefficients are in F; its symbols are then embedded into K for the protocol. Initial Extension encoding and every later commitment carry all four coordinates. The mode is bound externally and cannot be chosen by the proof. Evaluation domains are smooth cosets in the embedded base field `F* ⊂ K*`.

The original polynomial `f_hat_0` has six variables, degree at most one in each, and 64 Boolean evaluations. Bit 0 indexes its first variable. Its monomial coefficient at index `b` multiplies the variables selected by set bits of `b`. The univariate embedding is

`U_i(z) = f_hat_i(z,z^2,...,z^(2^(m_i-1)))`.

Boolean evaluation tables are converted by the separately tested Möbius transform in `multilinear_basis.rs`; they are not interpolated as roots-of-unity evaluations. The coefficient arrays have exactly the declared lengths, including leading zero coefficients. Their RS encodings pad **univariate coefficients** with zero to the domain length.

| Stage i | Remaining variables m_i | Fold count k_i | Coefficients | Domain size N_i | Packed leaf width | Packed leaves | Ordered sample count t_i |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0 | 6 | 2 | 64 | 8192 | 4 | 2048 | 256 |
| 1 | 4 | 2 | 16 | 2048 | 4 | 512 | 256 |
| 2 | 2 | 1 | 4 | 512 | 2 | 256 | 256 |
| Terminal | 1 | — | 2 | — | — | — | — |

For stages 0–2, let `omega_i` be the native exact-order root for `N_i`, and `L_i = {7*omega_i^j : 0≤j<N_i}`. All these codes and their intermediate folded codes have rate `1/128`. The new stage always starts on coset 7. In particular, the domain sampled from the preceding stage after a two-variable fold has coset `7^4`, **not** 7; after the last one-variable fold it has coset 49. This distinction must appear in tests.

Profile V1 does not accept variable counts other than six. A zero-variable PCS needs a separately specified authenticated constant case. An all-zero 64-entry input is supported normally. All 64 input positions are generic K entries: a game that requires an inactive tail to be zero or values to lie in F must authenticate those additional predicates. Honest conversion or a descriptor label does not establish them.

## Public linear queries and binding

The verifier owns an ordered set of one to three distinct 32-byte query IDs. Each entry contains exactly 64 canonical K weight values and an externally expected claim `a_j`. Let `W_j` be the unique LSB multilinear extension of that weight table. The relation being opened is

`sum_(b in {0,1}^6) W_j(b)*f_hat_0(b) = a_j`.

Equal weight tables with different IDs remain distinct ordered constraints. Duplicate IDs are rejected. The proof cannot replace the query set, choose its count, choose weights, or supply a more convenient expected claim.

The protocol transcript context is `iroha:execution:whir-linear-query:lab-v1`. `whir_linear::Profile` serializes the fixed geometry, field, strict round-degree bound, query limits, proximity parameter, wire widths, sampling mode and maximum proof bytes into 328 versioned bytes. The commitment module has its own native domain, `iroha:native-whir-codeword:v1`. Its caller binding must include the full protocol-profile digest and expected public scope/statement digest; every commitment additionally binds its exact role, stage, coefficient count, domain, coset, packing and extension encoding.

## Complete message and check schedule

This section normalizes the paper's indices to zero-based stages and prefix-variable folding. In a local sumcheck round `s=0..k_i-1`, the already fixed prefix has length `s`, the current variable is one coordinate, and the Boolean suffix has length `m_i-s-1`. This resolves the apparent off-by-one in the printed Construction 5.1 sum. Prefix restriction agrees with the RS Fold definition and Claim 4.15; do not use the later proof notation's reversed suffix convention.

### 1. Initial compiler OOD phase

1. Commit `f_0 = U_0|L_0` with the stage-0 spec; the verifier receives the expected root.
2. After absorbing that root, sample `zeta_0` uniformly from K and set `p_0 = pow(zeta_0,6)`.
3. Receive and absorb `y_0 = f_hat_0(p_0)` before generating any dependent outer randomness.
4. For the standalone fixed-query opening, now absorb the exact expected `QuerySet` descriptor. For an outer sumcheck integration, the initial-OOD API must instead return a typed context only after step 3; the entire intervening outer protocol and its query/claim derivation must be bound before opening proceeds. Supplying an already finished, unrelated outer transcript is not this compiler. The current `PendingOodAnchor` records the initial phase but does not implement a resumed outer execution protocol.

Include the initial OOD constraint as query index 0. The corresponding linear weight is `eq(p_0,X)` and claim `y_0`. The caller must later check that this same reply is included in the opening; it is not disposable advice.

Construction 7.4's oracle-combination exponent is zero with a single original oracle, so its virtual oracle is exactly `f_0` and its combination error is zero. This profile retains the construction's otherwise unused full-K combination draw with a separate transcript label after the query descriptor. It does not replace the independently drawn constraint-batching challenge below.

### 2. Batch the fixed constraints and perform stage 0

After the OOD reply and all expected query data have been absorbed, draw fresh uniform `beta∈K`. Following Construction 5.5, form

`W_0(X) = eq(p_0,X) + sum_(j=0)^(J-1) beta^(j+1)*W_j(X)`

`sigma_0 = y_0 + sum_(j=0)^(J-1) beta^(j+1)*a_j`.

The constrained-code weight is `w_0(Z,X)=Z*W_0(X)`. Each variable has degree at most one in `W_0`; thus `d*=d=3` in the paper's **strict** degree notation. Every internal sumcheck polynomial has degree at most two and carries **exactly three ascending K coefficients**. The outer sparse execution's cubic sumcheck is a different protocol and has four coefficients per round.

For each of the two stage-0 rounds, send and absorb the degree-at-most-two polynomial summing `f_hat_0 * W_0` over its unfixed Boolean suffix. Check `h(0)+h(1)` against `sigma_0` for the first round and the preceding challenged value for the second. Draw a fresh uniform K challenge only after absorbing the polynomial; call the two challenges `alpha_0=(a_0,a_1)`.

### 3. Main shifts i=1,2

For each new stage i:

1. Commit the new codeword `f_i = U_i|L_i`, where honestly `f_hat_i(X)=f_hat_(i-1)(alpha_(i-1),X)`. Absorb its root.
2. Draw uniform `zeta_i∈K`, form `p_(i,0)=pow(zeta_i,m_i)`, receive and absorb `y_i=f_hat_i(p_(i,0))`.
3. Draw **256 independent, ordered, with-replacement** block indices in the folded previous domain `L_(i-1)^(2^k_(i-1))`, then fresh uniform `gamma_i∈K`. Let the actual sampled field points be `s_(i,j)` for `j=1..256`, and let `p_(i,j)=pow(s_(i,j),m_i)`.
4. Define the new weight exactly as

   `W_i(X) = W_(i-1)(alpha_(i-1),X) + sum_(j=0)^256 gamma_i^(j+1)*eq(p_(i,j),X)`.

   Set the expected first sumcheck sum to

   `sigma_i = previous_h(previous_alpha) + gamma_i*y_i + sum_(j=1)^256 gamma_i^(j+1)*g_(i-1)(s_(i,j))`,

   where `g_(i-1)=Fold(f_(i-1),alpha_(i-1))` is evaluated exclusively from authenticated packed blocks of the previous commitment.
5. Perform `k_i` exact quadratic sumcheck rounds for `f_hat_i*W_i`, checking the initial sum above and then ordinary round continuity. This gives two rounds at stage 1 and one at stage 2.

Opening paths may be supplied at the end of the proof. If `sigma_i` cannot be checked until those paths arrive, it remains an explicit unresolved verifier obligation; no successful result is returned until it is discharged.

### 4. Terminal polynomial and final checks

Send and absorb exactly two canonical monomial coefficients of the one-variable `f_hat_3`; then draw 256 independent ordered block indices from `L_2^2` (coset 49, domain size 256).

For every final sample `s`, verify `f_hat_3(s)=Fold(f_2,alpha_2)(s)` from its authenticated packed pair. Also check

`f_hat_3(0)*W_2(alpha_2,0) + f_hat_3(1)*W_2(alpha_2,1) = final_h(alpha_2)`.

Verify every intermediate continuity check, every OOD contribution, all ordered sample contributions, all three commitment multiproofs and the final equality before returning the profile's successful opening result. The implemented one-shot `verify` returns `Err` and no authenticated result on any parser, field, phase, arithmetic or authentication failure. It exposes no resumable verifier state. A future resumable API must make such failures terminal rather than permit continuation after them. The result authenticates this laboratory opening relation under its stated assumptions; it does not close game range/ROM or execution-boundary obligations.

## RS folding, sampling and zero/one behavior

For one fold, use authenticated evaluations at `x` and `-x`:

`Fold(f,alpha)(x^2) = (f(x)+f(-x))/2 + alpha*(f(x)-f(-x))/(2*x)`.

Natural FFT indices pair `j` with `j+N/2`, not adjacent Boolean-table indices. For a two-variable packed leaf, columns at indices `j`, `j+N/4`, `j+N/2`, `j+3N/4` are first paired `(0,2)` and `(1,3)` at `x` and `x*omega^(N/4)`. The resulting evaluations at `x^2` and `-x^2` are folded again with the second alpha. Thus a packed leaf index j identifies the folded point `(7*omega^j)^(2^k)`.

The original sampled sequence is retained for weight exponents and sum identities. Sort/deduplicate only the authentication request, then map each ordered occurrence back to its authenticated row. Duplicate samples must not be removed from the algebra or replaced by fresh samples.

Uniform sampling over the power-of-two block domain must avoid reduction bias. The implementation takes coordinate zero of a native uniform K draw, obtaining a uniform base-field word, rejects the single value `p-1` (because `p mod 2^r=1` for these block sizes), and reduces the remaining word to r bits. Bind every sample slot and use the native transcript's advancing challenge sequence for retries. A bounded rejection loop must fail closed on exhaustion. Do not reuse a helper that enforces unique indices: this profile samples with replacement.

All `alpha`, `beta`, `gamma` and OOD `zeta` values are uniform over **all K**, including zero and one. OOD names the protocol step; it does not impose the old DEEP protocol's point-exclusion predicate. The only fold denominators are 2 and nonzero base-domain x, which are invertible by construction. Neither sumcheck nor these linear weights require division by a challenge or an equality weight.

## Canonical proof messages and resource ceilings

Expected profile, binding, initial root and QuerySet are verifier inputs. No proof-side parameter, weight, query ID, expected claim, row index or count replaces them. The fixed outer wire required of the root-owned codec is:

1. The exact eight-byte protocol/version magic `IWHIR001`.
2. Initial compiler OOD reply, then two stage-0 quadratic coefficient triples.
3. Stage-1 root, OOD reply, and two quadratic triples.
4. Stage-2 root, OOD reply, and one quadratic triple.
5. The two final polynomial coefficients.
6. Stage-0, stage-1 and stage-2 packed multiproof payloads, in that order.

K values use native canonical 32-byte big-endian coefficient encoding; Base-mode stage-0 opening values use canonical eight-byte big-endian F encoding. Digests use native canonical 48-byte little-endian encoding; reject noncanonical coordinates in every encoding. For each stage, values appear row-major for its **verifier-derived ascending unique leaf IDs**, with columns `index+j*leaf_count`. They are followed by the exact canonical minimal frontier: bottom-up levels, ascending node index, only missing siblings. No serialized frontier positions or prover-chosen counts are needed. The native frontier geometry determines the exact number of digests before reading them. A canonical public-transcript replay may derive those sizes; parsing/replay success alone is not verification of the arithmetic or authentication obligations.

The fixed message body is 736 bytes plus the eight-byte magic. At most 256 unique packed rows per stage contribute at most 81,920 value bytes in Extension mode throughout; compact initial Base values reduce that bound. A conservative `256*(11+9+8)` frontier-node bound contributes at most 344,064 digest bytes, so this layout is below 426,729 bytes. Exact proof lengths depend on the sampled unique sets. The compiled global maximum remains `4 MiB`; no parser allocation may be selected by unvalidated lengths. Pin the actual outer codec before reporting a measured proof size.

## Soundness calculation and its limits

Use the theorem-supported unique-decoding regime of Corollary 4.11, with `delta_i=3/8` and list bounds `ell_(i,s)=1`. Every relevant code has rate `rho=1/128`, and `3/8 < (1-rho)/2 = 127/256`, strictly satisfying the bound. The corollary gives `err_star(C,2,delta)=|domain(C)|/q` for each post-fold code. No capacity/Johnson conjecture is used.

Substituting into Theorem 5.2 yields:

| Event | Conservative contribution |
|---|---:|
| Five folds, each strict bound d=3 | `(4096+2048+1024+512+256+15)/q = 7951/q` |
| Two main-loop OOD replies | `(16+4)/(2*q) = 10/q` |
| Two shifts | `2*(5/8)^256 + 514/q` |
| Final sampled comparison | `(5/8)^256` |
| Construction 5.1 total | `3*(5/8)^256 + 8475/q` |
| Initial compiler OOD, Theorem 7.5 | `64/(2*q) = 32/q` |
| Single-original-oracle combination | `0` |
| Up to four constraints, Theorem 5.6 | `3/q` |
| Opening subtotal | `3*(5/8)^256 + 8510/q` |

The first subtotal term is about `2^-172.00`; this is an interactive oracle-model bound under the paper's exact distance, list and message premises. A direct union bound is sufficient for the displayed accounting; it is not a tight performance claim. The whole SNARG must additionally account for its actual outer-protocol error, Fiat–Shamir/BCS transformation, native hash/Merkle binding, bounded sampling behavior and adversary/oracle model. Do not convert the interactive number into a composed security claim or label merely parsed advice as authenticated.

## Reusable native interfaces and required tests

`whir_linear.rs` owns the immutable profile, native context/hash helper and verifier-owned `QuerySet`. Its `combine_with_ood` computes the Construction 5.5 public arithmetic; it cannot enforce transcript order. `whir_commitment.rs` owns `Spec`, exact coefficient-to-coset encoding and packed canonical Merkle proofs. `whir_protocol.rs` contains the initial-OOD typestate, complete honest prover, one-shot verifier and exact codec; it does not expose a resumed outer-protocol API.

Commitment specs use coefficient counts `[64,16,4]`, domain sizes `[8192,2048,512]`, leaf widths `[4,4,2]` and coset 7. Stage 0 uses the externally bound `Encoding::Base` or `Encoding::Extension`; stages 1 and 2 always use Extension. The opening result remains scoped to the generic K polynomial relation and does not independently claim a game's membership predicates. A stage commitment authenticates its codeword entries; only the complete outer WHIR verifier authenticates the linear-opening relation. Retained helper/direct-evaluation outputs must not be promoted to proof results.

At minimum, exercise genuine extension coordinates, zero/one challenges, asymmetric weights and variable ordering, two successive weight carries, coset changes, nonconstant terminal coefficients, sample duplicates, and different query counts. Adversarial verifier tests must alter roots, OOD replies, each coefficient slot, the initial and intermediate sum resets, sampled block columns, repeated-sample multiplicities, query identities/claims/weights, terminal values and encoded canonicality. Include coherent committed false codewords and fake answers, not just corrupt bytes the honest prover refuses. Truncation, trailing data, omitted/extra frontier nodes, wrong stage/spec/binding, reordering and every phase failure must be rejected by the verifier. Keep native-source and test-report pins and measured time/memory separate from the theorem calculation.

## Primary evidence

The [WHIR paper](https://eprint.iacr.org/2024/1586), Constructions 5.1/5.5/7.4, Theorems 5.2/5.6/7.5, Corollary 4.11 and Claim 4.15 supply the construction and bounds. Its retained PDF is `output/research/sumcheck-openings/whir.pdf`, SHA-256 `ccacc62cf5529ff95c3cf115cf730b020336f8d95c310c8deb64e3beac30ce61`. The native field, transform, transcript and commitment code are implementation evidence; their availability does not substitute for the protocol's proof obligations.
