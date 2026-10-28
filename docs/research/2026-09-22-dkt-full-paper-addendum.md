# September 22, 2026: DKT full-paper theorem review

The full-paper access gap in the earlier [coding and verifier note](2026-09-22-coding-and-verifier-delta.md) is now closed. The 145-page PDF linked directly from [Quang Dao's homepage](https://quangvdao.github.io/) and the [ePrint download](https://eprint.iacr.org/2026/2056.pdf?download=1) are byte-identical: 1,105,181 bytes, SHA-256 `b67c188ec477b6063caf9c1c06b214c71e358ff09b9517adcdb1db212ea2700a`. Both copies were retrieved September 22. The PDF says September 2026; ePrint records receipt September 16 and approval September 17. The retrieval date is not an independently established author revision date. This is a preprint, not a reproduced security audit.

This review read the finite Johnson statement, its interpolation and closed-constant appendix, the distinction between line, affine and polynomial-curve batching, and the beyond-Johnson characteristic conditions. Pages 6, 53, 66, 116 and 117 were also rendered; the theorem's ceilings, strict inequalities and reduced rate were checked visually. No upstream implementation, Lean build, prover, benchmark, or native parameter change was executed.

## The finite Johnson statement

Theorem 5.12, printed page 53 of the [author PDF](https://quangvdao.github.io/papers/authored/reed-solomon-codes-beyond-johnson.pdf#page=53), takes a field with distinct evaluation points and maximum message degree `D=k-1`, satisfying `1 ≤ D ≤ n-2`. Its degree ratio is `rho_minus=D/n`, rather than the nominal code rate `k/n`. For `eta0>0` and `a=sqrt(rho_minus)+eta0≤1`, it sets:

```text
A = ceil(a*n)
m = max(ceil(sqrt(rho_minus)/(2*eta0)), 3)
t = m + 1/2
Bjet = ceil(t/sqrt(rho_minus)) - 1
Bz   = ceil(t*t/(3*rho_minus)) - 1
```

The bound applies in every characteristic. For each received line `f+z*g`, one exceptional set works for every qualifying candidate polynomial at every remaining challenge. Outside it, the recovered two polynomials share exactly the candidate's full agreement set. The finite exceptional count is bounded by `Bcf`, with:

```text
Bcf < C = 8*n*t^3 / (3*rho_minus)
```

Uniform challenges in `F_q` therefore give this single line an exceptional probability at most `Bcf/q`. This is an MCA term, not a complete proof-system soundness bound. The constant-code endpoint `D=0` is outside this theorem; it has a separate treatment.

Appendix B.1, printed page 116, constructs a primitive symbolic interpolant. The multiplicity argument needs `m*eta0 ≥ sqrt(rho_minus)/2`; Appendix B.2 includes the integral rounding when deriving the closed `C`. Thus dropping the `-1` in `D=k-1`, rounding an integer threshold downward, or using a multiplicity incompatible with the agreement threshold would not reproduce this finite theorem. [Appendix B](https://quangvdao.github.io/papers/authored/reed-solomon-codes-beyond-johnson.pdf#page=116).

## What the Plonky3 commit adds

At [commit `8cdc0e8f`](https://github.com/Plonky3/Plonky3/commit/8cdc0e8f47a5db8d5572f211fa49075d9a24137c), `security/src/proximity.rs` uses precisely this reduced-rate closed count. `assumption.rs` documents a sufficient agreement contract `alpha=(1+1/(2m))*sqrt(k/n)`. Its gap above `sqrt((k-1)/n)` is at least `sqrt((k-1)/n)/(2m)`, so the supplied integer `m≥3` satisfies the interpolation requirement, even when larger than the theorem's minimum. The helper rejects unsupported `m` and inverse rates, and treats dimension one separately. The batching API requires at least two words.

For powers batching of several words with one challenge, the commit additionally derives a degree-`ell` curve bound `ell*C`. That formula is not obtained by applying the line theorem unchanged. The derivation scales the challenge cutoff before integral rounding and invokes the ordinary curve transfer of Lemma 5.3 / equation (88). The paper's Proposition B.1 itself states the line interpolant. Its general ordinary transfer is characteristic-free, while Corollary 7.3 is a separate positive-order result with extra characteristic premises. [Paper, pages 66–67](https://quangvdao.github.io/papers/authored/reed-solomon-codes-beyond-johnson.pdf#page=66).

The source derivation keeps the support surplus explicit. For `s=t*sqrt(n/D)`, it uses `M=ceil(D*s)`, `B=ceil(s)-1` and `H=ceil(ell*s*s/3)-1`, and compares the complete sums of interpolation coefficients and constraints. Its rounding distinction matters: at `k=2,n=8,m=3`, the line cutoff is 32, whereas degree-three batching needs 97 rather than `3*32`. This review checked that arithmetic independently; it did not run the upstream tests or mechanically verify the general curve derivation.

Affine batching is different again. Corollary 7.2 gives `E/(q-1)` for a positive-dimensional family sampled using independent uniform coefficients, and `E/q` for a line. An exceptional set small in the full affine space can contain an entire powers curve. Which result applies must follow the actual challenge schedule, not merely the number of columns.

## Beyond Johnson: characteristic and cardinality are separate

The first-order counting guarantee in Theorem 1.1 and the finite first-order support analysis require characteristic zero or `p>max(k-1,B_derivative)`. Here `B_derivative` is the certified maximum exponent of the hidden derivative variable; it is not the total interpolation degree. The finite support must also pass its strict coefficient-versus-constraint and challenge-degree checks. A diagram of the limiting rate curve does not establish those finite checks. [Paper, pages 6 and 49–51](https://quangvdao.github.io/papers/authored/reed-solomon-codes-beyond-johnson.pdf#page=49).

The eventual capacity theorem (6.9) instead permits `p>k-1`, subject to a positive fixed gap `delta`, a gap-dependent minimum length, and the stated gap-dependent exceptional-count function. The proof handles the remaining small-characteristic-relative-to-support case through a Johnson fallback. This does not remove the support conditions from a separately chosen finite first-order or higher-order certificate. Nor does a polynomial asymptotic count imply useful security at a specific field size. [Paper, pages 64–65](https://quangvdao.github.io/papers/authored/reed-solomon-codes-beyond-johnson.pdf#page=64).

For Goldilocks, `p=2^64-2^32+1=18446744069414584321`. Passing to `Fp4` changes field cardinality to `p^4`; its characteristic remains `p`. Consequently, the extension can reduce an `E/q` probability without helping a failed `p>B_derivative` condition. This is a field-arithmetic implication, not a certificate that a selected support meets either requirement.

## Native fit and a limited arithmetic illustration

Read-only inspection of `execution_proofs/guarded/whir_geometry.rs` found an immutable experimental geometry with 256 queries, inverse rate 16, initial variable counts 2–20, domains up to `2^24`, and folds of at most four variables. Its `ConditionalError` explicitly excludes composed Fiat–Shamir, hash and knowledge-security claims. Initial base-field encoding and later extension-field encoding are storage representations; they alone do not prove how each random challenge is sampled.

An independent standard-library arithmetic script accompanies this note. For illustration only, take the largest initial shape `k=2^20,n=2^24` and the *chosen illustrative* agreement `a=21/80`, which yields `A=4404020,m=10,Bjet=42,Bz=588`. It checks the exact finite `Bcf<C`, with `C<2^40`. Since `p≥2^63` and `p^4≥2^255`, the resulting coarse bound for this one line term is below `2^-23` with a base-field challenge, or below `2^-215` with a uniform quartic-extension challenge. These are arithmetic bounds on an illustrative term: the native profile does not select this `m` or agreement, and neither number is the game's security level.

The practical next analysis is to map every native combination, shifted opening, query batch and fold to its actual code dimension, sampling field and agreement contract. Only then can a complete sum of failure probabilities include relation reduction, proximity testing, algebraic identities, transcript transformation and commitments. This review recommends no query reduction or profile change, and establishes neither a native vulnerability nor native cryptographic qualification.

## Formal-source scope and retained evidence

The authors pin their mathematical ArkLib revision to `a5aa2677fee4e3a79d6bb05136631cce4a08587d`, and their separate decoder revision to `ffab000e71c5b19e8a19bebadcc0050eac1366e3`. The [pinned supplement](https://github.com/quangvdao/rs-beyond-johnson/tree/fd6d84edd50dcca7c0b3f388e0b4824d9daa082d) and its literal-source manifest were retrieved. The Johnson theorem source confirms the distinct-domain, degree, positive-gap and threshold premises and quantifier order. Its dependency proofs were not rebuilt or audited here. The paper itself excludes the fast decoder's bit complexity and complete deployed systems from its formalization claims; its statement-excerpt checker is not a Lean rebuild.

Both PDFs, extracted text, selected page renders, exact upstream source snapshots, retrieval failures, local source hashes and independent arithmetic outputs are inventoried in [the retained source index](../../tmp/dkt-theorem-review-2026-09-22/source-identities.json). Existing research documents, native sources, qualification controls and profile parameters were preserved.
