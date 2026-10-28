# Maltese: native fit review, 22 September 2026

Maltese is a useful lattice PCS comparator, but its published 335 KB parameter
set does not establish our required 128-bit composed security or a direct
Goldilocks/Fp4 implementation. No backend adoption or native code change follows
from this review.

Primary sources: [paper and metadata](https://eprint.iacr.org/2026/2067),
[current PDF](https://eprint.iacr.org/2026/2067.pdf), and
[Wilson Nguyen's publication listing](https://c.rypto.systems/publications/).
The ePrint records receipt on September 17 and approval on September 19, 2026,
and lists ASIACRYPT 2026. This review uses the 90-page PDF fetched September 22;
its SHA-256 is `a345f54a7ab317b00664377ac89b41c149e83e5f71649fa1ad258b699f6c84c1`
(992,111 bytes; HTTP Last-Modified September 17, 2026). The PDF is CC BY according
to its primary metadata. Section/page references below refer to that artifact.

## What the size and security numbers mean

Section 6 and Figures 5-6 (pp. 46-47) provide **computed PCS opening-size
accounting**, not an implemented full-SNARK or game-proof benchmark. The input is
`2^30` base-field elements, equivalently `2^30/d` ring elements. The headline
335 KB is parameterization P3:

| Parameter | P3 |
| --- | --- |
| Base field | 32-bit prime, not a concrete prime listed in this table |
| Cyclotomic degree `d`; factor degree `e` | 64; 8 |
| Ajtai dimension `n`; decomposition base `b` | 32; 2 |
| Folding challenge; truncation `k` | sparse `C_sp(32,8)`; 7 |
| Main cycles | 6, approximately 43.8 KB each |
| Finishing contribution | approximately 72 KB, including modified Greyhound |
| MSIS hardness estimate | 240 bits, using the lattice estimator |
| Challenge-set size | `log2 |C| = 124` |
| Inversion condition | deterministic Theorem 2; no heuristic for this row |

The 335 KB includes the PCS's norm-check/fold/decomposition cycles and finishing
protocol; it does not include a complete execution arithmetization, authenticated
input history, finality evidence, or a whole-race settlement envelope. Greyhound
size inputs for 32-bit fields come from the cited Greyhound paper's Table 1.
All 64-bit rows and the degree-128 rows mark the finishing contribution as rough
estimates because the current Greyhound implementation does not support those
parameters. No Maltese prover/verifier timing, peak-memory benchmark or execution
artifact is presented in this evaluation.

The authors explicitly leave the full composed concrete security bound
unreported. They suggest taking the minimum table component as a rough indicator
with some loss. **P3's 124-bit challenge-set component cannot substantiate a
128-bit target**, regardless of its 240-bit MSIS estimate or 256-bit extension
field. Footnote 6 adds a material exception: the written norm-decomposition
bound, Eq. (67), has a batching term linear in tree size. It suggests a different
tensor-product challenge check to reduce this to logarithmic scaling; that
modification is not the bound of the written protocol.

## Assumptions, algebra and verifier state

Definitions 17-19 use standard Module-SIS for short nonzero vectors in the kernel
of a uniformly random module matrix. The Ajtai tree commitment is combined with
sumcheck norm checking, folding, decomposition and a modified Greyhound finish
(Section 5.4.3, Corollary 5), whose two MSIS parameter obligations must also be
included. Some alternative rows use a heuristic dense-ternary inversion bound
(Lemma 7); P3 does not. Post-quantum plausibility is not a complete concrete
Fiat-Shamir/QROM security calculation. This review found no such end-to-end
calculation and does not transfer the table bits to a noninteractive native
protocol.

Section 3.2 requires `R_F = F_q[X]/(X^d+1)`, power-of-two `e | d`, `d/e > 1`, and
`q = 2(d/e)+1 mod 4(d/e)`. The modulus splits into degree-`e` irreducible factors;
`K = F_q[Y]/(Y^e-nu)` and `R_K` support the stated NTT/CRT reductions. These
factorization and sampling-set obligations are part of the construction.

The paper advertises transparent parameters constant in polynomial length:
the tree setup samples public `A` in `R_F^(n x r*n*alpha)`, `alpha=ceil(log_b q)`
(Definition 19). This is not zero verifier state or a tiny hash seed specified
by the paper. **Derived storage illustration:** P3 with binary `r=2` gives a
16 MiB coefficient representation for `A` and an 8 KiB root commitment when
32-bit coefficients are packed in four bytes. These are representation counts,
not measured memory. Definition 23 additionally introduces finishing matrices
`B1/B2`; their setup/generation/storage and the rest of verifier state must be
accounted for separately. No implementation-backed total setup/RSS figure was
established here.

## Iroha fit: inference from the paper and local source

The native guarded commitment imports Goldilocks and its quartic extension from
the existing transparent substrate. Its base modulus is
`p = 2^64 - 2^32 + 1`, with `v2(p-1)=32`.
For Maltese's table pairs `(d,e) = (64,8),(64,4),(64,2),(128,4),(128,2)`, this
prime has remainder **1** modulo `4(d/e)`, whereas the paper requires respectively
17, 33, 65, 65, or 129. At these cyclotomic degrees it instead fully splits into
linear factors. Therefore its existing Fp4 type does not instantiate the paper's
specified degree-`e` factor field/CRT structure. Equal extension bit length is
not an algebraic equivalence.

A different prime requires new field/ring arithmetic, parameter analysis, and
either a recompiled relation or a proven encoding of current Goldilocks
constraints. Changing to 32-bit arithmetic cannot silently preserve the native
integer/range/overflow arguments. Ajtai commitments and low-norm reductions also
do not substitute directly for the current Poseidon/Merkle PCS API. This is a
separate research backend, not a parameter change to the existing verifier.

## Implementation search and limits of this review

No primary Maltese implementation link was found in the PDF, ePrint metadata,
Nguyen's current publication listing, or the checked
[Tyagi publication listing](https://homes.cs.washington.edu/~tyagi/publications/).
Targeted public searches did not locate an author repository. This records a
search result, not proof that no implementation exists. Greyhound's referenced
implementation is not a Maltese implementation. No code was built or benchmarked.

Read: introduction, algebra/setup definitions, challenge-set definitions and
Lemma 7, finishing setup/Corollary 5, Section 6 and its security footnote. Figure 5
was also rendered and visually checked. The complete Appendix B proofs,
Appendix A field-polynomial adaptation, estimator inputs, all finishing-key
dimensions, and a concrete Fiat-Shamir/QROM composition were **not independently
verified**. These remain explicit gaps before any adoption decision.

Downloaded sources and exact native comparison-file pins are recorded in
`2026-09-22-maltese-source-pins.json`; PDF/text/render artifacts are retained under
`tmp/pdfs/maltese-2026-09-22/`. Research only: no Cargo commands, native edits,
dependency adoption or deployment.
