# Native closure for pending sumcheck openings

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


September 8, 2026. **Implement a separately versioned native WHIR linear-query PCS prototype as the next opening experiment.** Preserve the present sumcheck and univariate PCS as reference implementations. This selects a concrete construction to evaluate; it does not select production parameters, prove security, authenticate today's pending values, or establish a faster full-race prover.

## Exact gap in the current code

[lookup_pcs.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_pcs.rs) commits univariate coefficient arrays, evaluates them on a fixed multiplicative coset, and authenticates claims at `zeta` and `omega * zeta`. Its joint opening uses an `X * DEEP` combination, three fixed commitment roles, canonical Merkle multiproofs and a fixed FRI schedule. The laboratory domains are only 256 or 2,048 source rows. These are not arbitrary multilinear openings, and its proof format and degree arguments do not become such openings by renaming `zeta`.

[native_sumcheck.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/native_sumcheck.rs) instead reduces a sum over Boolean factor tables to values at an arbitrary vector `r` of Fp4 challenges. [sparse_sumcheck.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/sparse_sumcheck.rs) currently retains six factor roots and the equation

`c0 + c1*c2 + c3*c4*c5 = terminal_claim`.

Its public factors 0, 1 and 3 are evaluated directly from the compiled equations. Factors 2, 4 and 5 are copies of compiler-addressed source values. `PendingSparseClaim` deliberately retains all six PCS openings and those three virtual-read relations, plus original range/ROM and execution-boundary obligations. Correct arithmetic using supplied values is not authentication to any root.

The following are exact identities of that local representation, not new proof protocols. For little-endian Boolean indexing,

`eq(r,b) = product_i ((1-r_i)*(1-b_i) + r_i*b_i)`

and a factor table `G` has multilinear evaluation

`G_tilde(r) = sum_j eq(r,bits(j))*G[j]`.

For a read factor with immutable address map `a(j)`, split constant and zero-padding rows from dynamic reads. Define

`W_r[a] = sum_{j with dynamic address a(j)=a} eq(r,bits(j))`.

Then its required value is exactly

`G_tilde(r) = constant_contribution(r) + sum_a W_r[a]*V[a]`.

Repeated addresses remain repeated contributions. This is a public linear form of the original value table `V`. The verifier must derive the weight function from the compiler-owned map; accepting a prover-supplied weight table would lose the read relation. The first oracle baseline explicitly charges public-weight computation and storage as detailed below; it is not a succinct final validator design.

### Preferred next profile: one value oracle, virtual read factors

The three public factors are computable from the compiled relation. The three copied read factors are also fixed once `V` is fixed; their separate commitments need not be fundamental to the next protocol. The proposed next profile therefore commits the original `V` and treats all six factors as virtual tables. It computes public terminal values directly and authenticates each dynamic terminal value by the linear identity above. This can eliminate all six factor-oracle commitments, but it is a **new protocol/profile proposal**, not a capability or completed proof of the current six-root `PendingSparseClaim` API.

Fix dimensions explicitly. If the value table contains `v` entries, let `M = next_power_of_two(max(1,v))` and `m_V = log2(M)`. Extend `V[a]` and every weight vector `W_r[a]` by zero through `M-1`. The factor-row domain has its own size `L` and challenge vector `r` of length `log2(L)`; it generally differs from `M`. For each read factor `j`, define its unique multilinear weight extension on the value domain:

`W_tilde_(j,r)(x) = sum_(a=0)^(M-1) W_(j,r)[a] * eq(x,bits_(m_V)(a))`.

Its WHIR linear query has weight `Z * W_tilde_(j,r)(X)` and target `y_j = c_j - constant_contribution_j(r)`, where `c_j` is the claimed read-factor evaluation. The verifier can evaluate that weight by scattering the factor-row equality weights over the exact source addresses, or directly summing `eq(r,row) * eq(x,address)` over all dynamic occurrences. Both retain duplicates. Computing each equality product directly costs O(reads * (log L + log M)) field operations per weight evaluation. Explicit equality-table caching instead costs O(L + M + reads) time and O(L + M) field-element storage; repeated query points require their corresponding work. No claimed weight table or address is trusted.

Once the terminal point and all three claimed read values are absorbed, a fresh verifier challenge `beta` can combine the three constraints on the **same** `V`:

`W_beta = W_(0,r) + beta*W_(1,r) + beta^2*W_(2,r)`

`y_beta = y_0 + beta*y_1 + beta^2*y_2`.

This is the form of multiple-constraint combination specified in WHIR Construction 5.5. The claims must precede `beta`; a prover must not choose the residuals after seeing it. A fixed nonzero three-claim error vector gives a nonzero polynomial in `beta` of degree at most two. That elementary observation alone is not the PCS/compiler soundness argument: Theorem 5.6's added batching error is `(t-1)*ell/|F|`, where `F` denotes the theorem's protocol field and `ell` bounds the proximity list, so these three constraints contribute `2*ell/|F|` under that theorem's hypotheses. The opening must authenticate `sum_a W_beta[a]*V[a] = y_beta`, and the outer verifier must separately check the terminal product equation using all six values.

The first complete prototype should use only this single `m_V`-variable committed oracle, with virtual factors evaluated through these linear queries. If additional committed oracles of different dimensions are introduced, their composition needs an explicit lift or a separately analyzed multi-domain construction. WHIR Construction 7.4 assumes equal variable counts and points to a correction for smaller oracles; it does not license silently batching mismatched domains. The single-oracle proposal avoids that mismatch, while retaining the distinct factor-row domain in its public query computation. [WHIR, Construction 5.5 and §7.2](https://eprint.iacr.org/2024/1586).

## Primary construction to implement

**WHIR.** The inspected paper gives a constrained Reed–Solomon IOPP in Construction 5.1, multiple-constraint batching in Construction 5.5, and a linear-Σ-IOP compiler in Construction 7.4. A multilinear opening is a linear query with weight `Z*eq(X,r)`. Its main protocol combines sumcheck folding with newly committed lower-dimensional codewords, out-of-domain replies, sampled consistency checks, and a final small-polynomial check. The compiler places out-of-domain sampling/replies after each oracle message and before dependent outer verifier randomness. Its theorems include the selected proximity regime and compiler error, not only a terminal FRI check. Follow that complete construction and message order. [WHIR, §§5 and 7](https://eprint.iacr.org/2024/1586).

The paper identifies a multilinear polynomial with a univariate polynomial through the monomial embedding `U(x)=f_tilde(x,x²,...,x^(2^(m-1)))`. Consequently, converting a Boolean evaluation table to that commitment requires its exact multilinear coefficient representation. This is a different operation from interpolating the same table on a roots-of-unity domain. The basis, variable order and encoding must be explicit. [WHIR, Definition 1 and §1.1](https://eprint.iacr.org/2024/1586).

The authors' repository describes its implementation as an academic prototype without careful code review; its exposed choices include conjectured and proven soundness regimes. Use it as a cross-check reference, not an already qualified native implementation or parameter authority. [Author repository](https://github.com/worldfnd/whir).

**BaseFold comparison.** The original BaseFold paper's Protocol 4 is an explicit multilinear evaluation construction interleaving sumcheck with foldable-code commitments and query checks. Section 5 fixes the coefficient ordering and final encoded-polynomial relation. It is a legitimate alternative, including its Reed–Solomon specialization, but replacing only the current FRI challenge schedule would omit its PCS argument. A candidate must resolve the paper's terminal division/zero-denominator behavior and include its exact soundness assumptions. [BaseFold, §5, Protocol 4](https://eprint.iacr.org/2023/1705).

**Decision, as a local engineering inference:** WHIR's linear-query interface is the closest fit to both ordinary factor openings and the public weighted reads above. BaseFold remains a useful independent candidate for ordinary multilinear openings; it does not by itself make indexed reads authoritative. No ad hoc univariate-to-multilinear reduction is selected. We have not found an existing native reduction in this worktree that discharges these obligations.

## What native code can actually reuse

- Reuse Iroha's exact Goldilocks/Fp4 operations, canonical readers, framed execution-domain transcript, Poseidon2 hash implementation, primitive-root/coset evaluation kernels, and canonical Merkle/frontier primitives. Preserve their source and build provenance.
- Reuse sumcheck coefficient construction and independent evaluation tests as arithmetic oracles. WHIR's internal transcript schedule, weight evolution and fold arities must be implemented from its construction; the present degree cap and generic round verifier do not automatically cover them.
- Reuse univariate PCS mutation tests as adversarial patterns: fully committed false oracles, malformed canonical encodings, wrong degree, cross-context roots, reordered queries and invalid terminal polynomials. Its fixed `N`, group-role assumptions, OODS format, query counts and `X*DEEP` proof object are not the new multilinear proof format.
- A root must identify a precise encoding, field, dimensions, oracle role and compiler profile. A native digest of raw factor rows, or the streaming reader's consistency digest, is not a Reed–Solomon commitment. Existing stand-in root identities cannot be relabeled as PCS commitments.

## Required protocol boundary

The first prototype must freeze these choices before generating evidence:

1. **Compiler-selected shape and representation.** Bind the exact generated relation, domain sizes, code rate, basis conversion, little-endian variable map, explicit padding, source-value addresses, public weights, all factor occurrences and opening-query identities. Distinguish base-field source values from extension-field weighted factors. A decoder accepting four-coordinate advice does not prove that a source value belongs to Goldilocks.
2. **Commitment and challenge schedule.** Commit the exactly encoded `V` before deriving equation randomness. For the chosen WHIR compiler, insert its specified OOD sampling/replies after that oracle message and before dependent outer challenges. Then conduct the outer sumcheck, absorb the three terminal read claims, derive their batching challenge in the construction's specified place, and complete all required proximity/opening checks. If a fallback retains dependent factor commitments, each also requires the specified oracle/OOD ordering before dependent randomness. Bind the externally expected scope, network/race/epoch, rules/profile, accepted history and public statement. This needs a new integrated transcript/profile; appending an opening blob to today's final transcript state is not evidence that Construction 7.4 was followed.
3. **Exact oracle claims and composition.** Specify the single-`V` virtual-factor outer protocol as a linear Σ-IOP, including its sumcheck soundness premise, public-factor computation, the three exact compiler-derived weight queries and their batching. Map its messages to the complete WHIR compiler before claiming the six factor commitments can be removed securely. Keep today's API unchanged and explicitly pending. A closure retaining today's six roots would instead have to authenticate all six named openings, all three weighted read relations against `V`, and any dimension lift; that is a comparison profile, not the preferred commitment layout.
4. **Complete native WHIR checks.** Specify every codeword commitment, folding/weight update, OOD reply, query index, canonical opening, terminal polynomial, batching challenge and final constraint. Preserve queries as compiler/verifier-selected identities. Decode exact counts with bounded allocations and reject trailing bytes. No field-size or polynomial-degree assumption may be imported from the old PCS merely because a shared primitive is reused.
5. **Security and resource accounting.** Calculate actual per-round degree/proximity bounds, candidate-list and batching errors, commitment-binding events, Fiat–Shamir losses and the oracle/adversary model. The first comparison should use a theorem-supported decoding regime. Measure full encoding, commitments, queries, weight evaluation, RAM, scratch storage and verification. Do not infer a composed 128-bit result from the Fp4 size, a hash name or a CLI setting.

## Most direct implementation sequence

1. Freeze a complete single-polynomial WHIR linear-query profile and message specification from the cited construction. Add basis-conversion and code-encoding fixtures that distinguish Boolean evaluations, multilinear coefficients and univariate coefficients. Keep native-field/base-field roles explicit.
2. Implement commitment plus complete opening verification for one small multilinear oracle, including both point evaluations and public linear forms. Cross-check direct multilinear/linear-form evaluation. Test zero variables, zero/one coordinates, mixed F/Fp4 claims, non-power-of-two active data with explicit padding, and malformed proof bytes. Compare with the primary reference only after pinning the exact source revision; do not run external build systems in the maintained Iroha lane.
3. Specify and implement the single-`V` virtual-factor linear Σ-IOP and the construction's multi-query batching/compiler order. Test factor-row and value domains with different lengths; separately test a future common-dimension lift before admitting multi-oracle batching. Produce an actual verifier-level attack suite: coherent changed oracle and answers, swapped roots, mismatched bases, stale scopes, omitted OOD replies, adaptive terminal claims or weight replacement, dropped duplicate addresses, nonzero padding, wrong terminal encodings and query splicing. A test rejected by only the honest prover is insufficient.
4. Connect a small complete native sparse execution using that separately versioned protocol. Authenticate its three read relations against `V`, derive the public factors, and check the terminal equation; independently require retained exact range/ROM, first-terminal and state/action/final predicates. Confirm that the deliberately false terminal advice currently accepted as *pending* is rejected by the complete verifier. Do not reinterpret today's six-root pending object as this different protocol.
5. Measure the complete eight-car workload and authenticated shard boundaries before choosing proof layout or release parameters. If direct public-weight evaluation dominates verification, evaluate a separately specified succinct matrix/read argument; do not hide that work in a host-only check or declare the arithmetic proof complete.

The present research establishes an implementation sequence, not an authenticated opening, memory bound for a full cryptographic prover, security review, or settlement qualification.

## Inspected evidence

- `world/native/lookup_pcs.rs`: univariate two-point `GroupOods`, fixed-role `ColumnGroup`, `shifted_deep`, native FRI and exact canonical proof decoding.
- `world/native/native_sumcheck.rs`: pending terminal API, full-field LSB challenge sequence and strict round-reduction codec.
- `world/native/sparse_sumcheck.rs`: six factor identities, direct public-factor checks, `read_operand` maps and retained virtual-read obligations.
- Retrieved primary PDFs are retained at `output/research/sumcheck-openings/whir.pdf` (SHA-256 `ccacc62cf5529ff95c3cf115cf730b020336f8d95c310c8deb64e3beac30ce61`) and `basefold.pdf` (SHA-256 `6c3589a81b0e25cdf12924b85e4a34fcdad01105d253f210570972ac45ccb094`). The WHIR ePrint record identifies the November 21, 2024 revision; the inspected BaseFold PDF is dated February 22, 2024. The author-repository observation is read-only and is not a pinned code qualification.
