# September 22 follow-up: coding bounds and verifier implementation

This targeted follow-up adds a September paper and four September 20–22 author
commits to the [September briefing](september-2026-briefing.md). The GitHub web
reader could not open these commits; their exact patches were retrieved through
GitHub's public API and independently fetched again with identical file patches.
No upstream code, Lean proof, benchmark or native cryptographic change was run.

Subsequent same-day review obtained the complete paper from the author and ePrint. See the [full-paper addendum](2026-09-22-dkt-full-paper-addendum.md) for the exact finite bounds and batching/characteristic conditions. The access limitation below describes this earlier pass.

## A concrete coding-theory addition

Dao, Kominers and Thaler's **Reed–Solomon Codes Beyond Johnson** was received
September 16 and approved September 17. Its abstract gives explicit list-decoding
and mutual-correlated-agreement bounds. Above Johnson, its error dependence
improves from the fifth to the third inverse power of the agreement margin,
in every characteristic. Beyond Johnson requires sufficiently large
characteristic. The authors report proof-size reductions of 4.63–11.1% in three
other systems and ArkLib formalization. Those are author results; neither the
formalization nor those measurements was reproduced here. The full PDF was
unavailable in this follow-up, so its theorem premises have not been independently
checked. [Primary paper record](https://eprint.iacr.org/2026/2056).

The September 22 Plonky3 change applies its Johnson-regime line bound with finite
rate `rho_minus = (k - 1)/n`. The code also derives a polynomial-curve extension
and carries a separate curve-degree factor. It documents a decoding-radius
contract and rejects unsupported parameter cases. **Inference for Iroha:**
review the full theorem, the implementation's additional derivation and our
actual batching schedule together. Neither the paper's title nor this commit
licenses substituting an asymptotic expression for our complete error budget.
No native FRI/WHIR query count changes follow.
[Exact implementation](https://github.com/Plonky3/Plonky3/commit/8cdc0e8f47a5db8d5572f211fa49075d9a24137c).

## Three implementation lessons

| Primary change | Observed issue and Iroha follow-up |
| --- | --- |
| [September 20: Goldilocks NEON Poseidon2](https://github.com/Plonky3/Plonky3/commit/429f38cc89fb4744ef57b34df4aed8c4d65becb4) | The ARM implementation stored unreduced constants while an addition path required canonical operands. The patch canonicalizes them at construction and adds scalar/packed comparisons. Native CPU/accelerated parity qualification should include legal noncanonical field representations at supported internal boundaries, while wire decoding still rejects noncanonical encodings. This is not evidence that Iroha uses the affected implementation. |
| [September 20: optional opening shape](https://github.com/Plonky3/Plonky3/commit/e2cb7e988848c693b4971cab21cbef58a7e17cb4) | An unused next-row opening encoded as a present empty vector passed a length-only check and could cause a later matrix-shape panic. The patch checks presence separately from width and strengthens directly callable constraint-checking paths. Native malformed-proof tests should distinguish absent, empty, full-width and mismatched openings and exercise every public verification entry point. |
| [September 21: Merkle cap decoding](https://github.com/Plonky3/Plonky3/commit/576a8fbdd3fd5650392744c3ba787e92f1286901) | Derived deserialization bypassed the constructor's power-of-two root-count invariant. The patch validates that invariant on both compact and self-describing decode paths. For native Norito proofs, enforce structural invariants at decoding and verification boundaries before indexing, logarithms or allocation derived from a count. A valid constructor alone does not constrain network bytes. |

These are source-backed upstream findings and proposed native checks, not a new
Iroha vulnerability report. No release-version coverage, complete upstream audit,
or absence of other September results is asserted.

## Decision

Keep the existing order: complete accepted-execution authentication; bounded
native execution and transport; matched lookup and accumulation experiments;
then a complete security and full-duration resource qualification. Add DKT26 to
the concrete FRI/WHIR analysis, with exact finite-domain premises and all
composition losses. Continue the separate Akita/Maltese comparison without
conflating polynomial openings with whole-race proofs.

The three implementation changes add useful adversarial cases to CPU/accelerated
parity and canonical proof decoding. They do not change the frozen candidate,
register a profile, import an external zkVM or enable XOR/NFT settlement.

Local retrieval identities are retained in
[the source index](2026-09-22-coding-and-verifier-source-pins.json).
