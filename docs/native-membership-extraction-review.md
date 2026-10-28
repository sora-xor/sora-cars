# Base extraction for two-phase native membership

Read-only review, 8 September 2026. Scope: the frozen two-phase membership adapter, its WHIR branches, and the initial Base versus auxiliary Extension encodings. No production source, test source, dependency, or build was changed. This is a mathematical review, not a composed security qualification.

**Finding:** the required base-field lemma holds with a large margin for the actual geometry. No additional Frobenius oracle is needed to establish that lemma. What remains is a precise application of constrained-proximity soundness to the two separate, differently sized, adaptively used commitments, followed by the Merkle/Fiat–Shamir compilation. The current code enforces the necessary message order; message order alone is not that theorem. I found no concrete accepted-proof counterexample to the current frozen protocol in this inspection. Below are explicit counterexamples to weaker premises that would make its use unsound.

## What the code actually binds

The [execution binding](../world/native/phased_whir.rs#L105) fixes two compiler-selected profiles and the encodings `Base, Extension`, including distinct oracle indices. Its [phase grammar](../world/native/phased_whir.rs#L175) is:

`root0 → z0 → y0 → eta,beta → root1 → z1 → y1 → rho → cubic rounds → six read claims → both query digests → indexed WHIR branches`.

The challenge points are `pow(z,m)=(z,z²,…,z^(2^(m−1)))`, so the MLE reply is an evaluation of the same univariate coefficient polynomial. `y0` is absorbed before `eta,beta`; `y1` is absorbed before equation randomness. Branch decoding requires the encoded initial OOD reply to equal the saved reply. Both query-set digests and the branch's index/binding enter its continuing transcript before opening randomness. The adapter derives all six queries from the exact tagged operand map, subtracts constants from phase-0 claims only, and checks the outer terminal equation before accepting both branches. See [branch construction](../world/native/phased_whir.rs#L256), [OOD equality](../world/native/phased_whir.rs#L496), [read reconstruction](../world/native/phased_membership_proof.rs#L235), and [final verification](../world/native/phased_membership_proof.rs#L360).

The [commitment spec](../world/native/whir_commitment.rs#L105) binds the exact coefficient slots, base-field coset/root, packed-leaf order, encoding, dimensions and role. Base leaves contain canonical 8-byte field elements; Extension leaves contain four coordinates. The verifier checks those encodings while authenticating opened leaves. The honest constructor checks all coefficients, but an adversarial prover is not required to call that constructor. Thus its checks cannot supply adversarial extraction.

The [membership relation](../world/native/membership_relation.rs#L179) binds the full source descriptor, public ports, namespaces, every occurrence and both Boolean zero tails. The [basis transform](../world/native/multilinear_basis.rs#L169) is the LSB-ordered Boolean Möbius transform and inverse, using only addition/subtraction over the base field. Its base-preserving algebra matters below; its honest padding check is not an authenticated padding predicate.

## Exact base-field and uniqueness lemma

Let `F=F_p`, `p=2^64−2^32+1`, and let `K/F` be the native degree-four field extension. Assume the field implementation and `K`'s field structure are correct. Let `M=2^m`, `d=M−1`, and

`L={7*omega^i : 0≤i<N} ⊂ F`, where `N=16M` and `omega` has exact order `N`.

Let a **fixed typed word** `w:L→F` agree with `f∈K[X]`, `deg f≤d`, at more than `d` points. Write `f=f0+u*f1+u²*f2+u³*f3`, with each `fj∈F[X]`. At every agreement point the last three coordinate polynomials vanish. Each has degree at most `d`, so all three vanish identically. Therefore `f∈F[X]`. Equivalently, coefficientwise Frobenius satisfies `sigma(f)−f=0`; taking `f(X)^p−f(X)` is a different operation and has the wrong degree bound.

At the current distance threshold `delta=3/8`, agreement is at least `5N/8=10M`, hence strictly greater than `d`. Any two degree-`d` polynomials within that distance of the same word agree at at least `N−2delta*N=4M>d` positions. Thus there is **at most one** nearby polynomial, and it is base-coefficient. These statements also hold when the nearby polynomial is constrained by additional linear claims.

| Actual phase-0 fixture | Coefficient slots M | Degree cap d | Base evaluation points N | Required agreement |
|---|---:|---:|---:|---:|
| Two cars, one tick | 65,536 | 65,535 | 1,048,576 | 655,360 |
| Eight cars, one tick | 524,288 | 524,287 | 8,388,608 | 5,242,880 |

Counts come from the [retained Street report](../output/qualification/native-membership-street-qualified/report.json). The same calculation covers every admitted [geometry profile](../world/native/whir_geometry.rs#L106). No list-decoding-at-capacity conjecture is needed for this uniqueness calculation.

Finally, let `c_j` be the coefficients of `f`. The implied Boolean value at address `b` is `V[b]=sum_(j subset b)c_j`, exactly the native inverse transform. Thus **all** original values, multiplicity positions and tail positions are in `F`. This does not prove tails equal zero, multiplicities are canonical integer counts, or original field equations express the intended bounded integers. The existing tail equations and a separate integer-semantics argument remain necessary. A zero Boolean tail does not imply a zero monomial coefficient tail.

Phase 1 must remain Extension encoded: `1/(beta−query)` generally lies outside `F`. Its extracted polynomial needs the same degree/proximity/claim guarantees over `K`, but no subfield claim. Original values at random extension-field OOD points can also be non-base even when all their coefficients and Boolean values are base-field elements.

## The missing application, stated precisely

For an interactive typed-oracle version of this exact protocol, establish the following lemma.

For each committed word `wb` on its bound domain, define `fb` to be its unique degree-`<Mb` polynomial within distance `delta`, or `⊥` if none exists. Except for an explicitly bounded bad event, acceptance implies `f0,f1≠⊥`; each saved OOD reply equals the appropriate `fb(zb)`; every one of the three final linear claims for bank `b` equals its compiler-defined functional on `fb`'s Boolean values; and the outer reduction accepts those same values.

This is a **prefix-consistent** statement. `f0`, when it exists, is a function of the phase-0 word alone, hence fixed before `eta,beta`; `f1` is fixed after `eta,beta` but before `rho`. The verifier need not execute a decoder before drawing challenges. Even if a mathematical extractor decodes only later, uniqueness ties its answer to the earlier word. Do not instead condition on eventual acceptance and then assume that the accepted `eta,beta` remain uniform: the soundness reduction must bound the bad-event intersection over the original randomness.

A useful proof route is to condition on the shared pre-opening transcript and both query sets. For any branch whose unique candidate is absent or violates a claimed functional, its word is farther than `delta` from the corresponding fully constrained code. Apply that branch's constrained-WHIR soundness/batching theorem using fresh branch randomness, then union-bound the two branch failure events. Combine this with the prefix-fixed lookup argument and the degree-bounded outer reduction. The ordinary four-coefficient cubic-round messages are fully read prover messages; they are not additional polynomial oracles requiring unmentioned OOD anchors.

This needs an explicit heterogeneous two-oracle composition lemma. [WHIR Construction 7.4 and Theorem 7.5](https://eprint.iacr.org/2024/1586) describe same-domain polynomial oracles combined into one oracle, under round-by-round knowledge-soundness premises; they do not literally describe this implementation's two separate branches and independent dimensions. Reusing their constrained-proximity ingredients is plausible, but merely adding two profile error numbers is not a proof of the adapter's extraction property. The direct-product argument above should avoid unnecessary interleaved-oracle assumptions, with a written state function/extractor if knowledge soundness is claimed.

Two further boundaries must be made explicit:

- **Merkle root to fixed typed word.** A canonical root and a few Base openings do not expose a complete valid word. State the binding/extraction reduction and its handling of missing or malformed leaf preimages. A suitable reduction may complete never-opened or malformed positions with fixed base values, provided every accepting authenticated query is consistent with that same pre-challenge completion. It cannot complete them afresh after each challenge. Specify adversary preprocessing/query budgets and the exact framed hash assumption; collision tests or the honest FFT constructor do not prove this.
- **Interactive randomness to native Fiat–Shamir.** The two indexed branches must correspond to independent random tapes conditional on the fixed shared transcript. Then prove the actual transcript compiler satisfies the required extraction/state-restoration property with its query losses. The [June 2026 functional-commitment theorem](https://eprint.iacr.org/2025/902) requires state-restoration FIOP security and state-restoration function binding; ordinary commitment binding alone is not its premise. It does not automatically instantiate our native sponge or WHIR branches.

The sample schedule deserves a small application lemma too. The code draws 256 independent positions with replacement, while final folded domains have 32 positions. The retained WHIR construction includes a repetition/domain-size restriction. Extend the sampling argument explicitly: for any fixed bad fraction `delta`, all `t` independent samples miss it with probability `(1−delta)^t`, including `t` larger than the domain. Repeated positions remain logical draws when Merkle storage deduplicates them. The 64-attempt rejection sampler aborts on exhaustion; it does not introduce a biased fallback. This is a theorem-application detail, not an identified attack.

## Concrete counterexamples and next checks

**Base multiplicities still need prefix fixation.** Let the range table be `{0,1,2,3}`, the sole invalid query be `4`, and `beta=u` where `u^4=7`. The following multiplicities are all in `F`:

`m=(7/249, −8/83, −18/83, 296/249)`.

They satisfy

`1/(u−4) = sum_(j=0..3) m_j/(u−j)`.

The denominators are nonzero. This identity was independently checked by rational coefficient arithmetic; both sides have coefficients `(-64,−16,−4,−1)/249`. More generally, for any `beta` of degree four over `F`, the four reciprocals at distinct base table points form an `F`-basis of `K`: a nontrivial dependence would give a degree-at-most-three polynomial vanishing at `beta`. Consequently an adaptive prover can choose **base-valued** multiplicities to represent the reciprocal of a bad base query. This defeats a weakened protocol allowing the extracted multiplicities to change after beta; it does not bypass the present root-before-beta protocol. Multiplicity range checks are not the required fix: prefix fixation is.

Other sharp boundaries are:

- At only `d` agreement points, `u*product_(s in S)(X−s)` agrees with the all-zero Base word but has non-base coefficients. This proves the strict `>d` requirement.
- If the evaluation domain were allowed to leave `F`, `f(X)=u⁻¹X` on a coset `u*H`, `H⊂F*`, would be Base valued everywhere despite non-base coefficients. The actual spec's Base shift/root prevents this.
- On any inspected subset of at most `d` distinct positions, the first construction passes all those Base-value checks. Seeing 256 authenticated leaves is not a deterministic substitute for whole-word proximity.

The next bounded work should be (1) the conditional two-oracle lemma above, with an explicit bad-state/extraction argument; and (2) a new independent native mathematical test module covering the strict agreement threshold, the domain counterexample, the concrete adaptive-base-multiplicity identity and the Boolean-basis implication. Then add small coherent adversarial oracles to the existing full verifier audit, including an OOD reply inconsistent with the unique nearby polynomial and a truthful auxiliary branch paired with a false original branch. Such tests check the implementation of the premises; they cannot certify the probabilistic theorem.

Keep `baseExtractionTheoremQualified`, integer execution, accepted-history and composed-security flags false until their respective obligations are discharged. No 128-bit or post-quantum conclusion follows from this review.

## Inspected source identities

SHA-256 at inspection; references above point to the original sources. The existing sources and evidence remain unchanged.

| Source | SHA-256 |
|---|---|
| `phased_whir.rs` | `ac09eb98de591451d4509bc27f6687a10f04ca567e7dcd5ac05eb3e125fe536a` |
| `phased_membership_proof.rs` | `770487137160c4f35c02aba369b312398b5cf3a31bbce9ef6601b70c01e31184` |
| `membership_relation.rs` | `8976e547d88f69a5f30b0cb16e66121cc1bebddcf6b30e1e094501f52f008d9d` |
| `whir_commitment.rs` | `84cd120373bac00177d70685977e6ef14cc4c94dcd257649daa4f6ee65690b46` |
| `whir_geometry.rs` | `b1b073a578dba3f9fef5de53db21d33f493194a7b7e61caa0da4bcd9c099daa2` |
| `multilinear_basis.rs` | `6d70ecf149e49701fbda09f65cfae6600793621f14795b37d660b280c8df0de0` |
| `NATIVE_MEMBERSHIP.md` | `77490c79cdc3bdb616ed84f39e71c3d3be40b8a097927fa65fd1c20f4336f42e` |
| [Retained WHIR PDF](../output/research/sumcheck-openings/whir.pdf), §§4.5, 5, 7.2 | `ccacc62cf5529ff95c3cf115cf730b020336f8d95c310c8deb64e3beac30ce61` |
| [Retained functional-commitment PDF](../output/research/crypto-2026-security/2025-902.pdf), June 2026 revision | `a3015f140ed9750b05e23a8b6fb3dcbb4d93be81cd388fb0ef39abb17dd06560` |
