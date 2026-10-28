**September 2026 cryptography: decisions for native Iroha games**

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


Reviewed through **September 8, 2026**. This follow-up checks recent primary records against the newer native sequence and terminal-closure evidence. It supplements the [September survey](crypto-2026-september-update.md); that survey and its frozen source manifest remain historical evidence. The scope is verifiable computation and its authentication boundary, rather than cryptocurrency prices. External performance results have not been reproduced, and this study does not qualify a production proof profile.

**The most useful direction is to reduce repeated computation and committed lookup data, then benchmark the commitment backend within that complete construction.** Keep the native Rust implementation and generic execution/game interfaces. Racing remains an application relation. Our current ordered proof bundle is valuable as a correctness baseline, but a practical race still needs efficient aggregation or accumulation, authenticated accepted inputs, and a complete security argument.

**What the new work actually offers**

| Work and inspected version | Advance | Decision for Iroha |
| --- | --- | --- |
| [LiftWHIR](https://eprint.iacr.org/2026/1561), August 28 revision; preprint | Interleaving and DEEP reduce opening work. The authors report 4.4–6.7× faster evaluation proving, but 1.55–1.61× faster commitment-plus-proving, with larger proofs. | Candidate PCS experiment, with both native oracles and all reductions included. |
| [PIPFRI / DEPIPFRI](https://www.usenix.org/system/files/usenixsecurity26-li-weihan.pdf), USENIX Security, August 12–14 | Fragmented polynomial encoding reduces commitment work; its distributed variant can split one polynomial among workers. | Relevant to bounded-memory and self-hosted public-data workers. Recalculate security and include communication. |
| [WARP](https://eprint.iacr.org/2025/753), June 18 revision; TCC 2025 | Hash-based accumulation with linear prover time, logarithmic verifier time and unbounded depth. | Strong transparent accumulation candidate; measure the final decider and the complete ordered state relation. |
| [Neo and SuperNeo](https://eprint.iacr.org/2026/242), September 4 revision; CRYPTO 2026 | SuperNeo supports general constraints over small fields and extensions, using Ajtai commitments under Module-SIS. | Credible alternative assumption set. It requires a separate native profile and norm/decider qualification. |
| [Celer](https://link.springer.com/chapter/10.1007/978-3-032-35424-2_9), published August 11; ePrint revised July 21 | Targets many queries into smaller lookup tables, reducing commitment work while retaining linear field work. | Read the complete construction before selecting an instantiation; compare against our range/ROM workload. |
| [Projective / monomial-basis sumcheck](https://eprint.iacr.org/2026/762), April 17 preprint | Aligns polynomial representation with WHIR and reports about 10% improvement for its sumcheck prover on the evaluated large prime fields. | Measure a separate basis-conversion experiment; rederive every round and final-read identity. |
| [Time–Space Trade-Offs for Sumcheck](https://eprint.iacr.org/2025/1473), February 25 revision; TCC 2025 | Trades recomputation for much smaller product-sumcheck working memory. | The most direct algorithmic experiment for our six dense factor arrays. |

These are different layers. An improved opening scheme cannot remove repeated circuit construction, a lookup protocol cannot remove state continuity, and an accumulator does not authenticate the player's controls by itself. This is our architectural inference, not a speed claim from any one paper.

WARP's final decider still has work depending on the accumulated relation and code encoding. Its Appendix D also warns that using larger-field challenges for a small-field relation can change the headline base-operation cost. The native comparison must include both effects. [Full paper, §10 and Appendix D](https://eprint.iacr.org/2025/753).

**Three benchmark qualifications change the shortlist**

LiftWHIR's reported 128-bit fast regime uses conjectured capacity parameters. Its full paper identifies both a correlated-agreement conjecture and an efficient-enumeration assumption; the benchmark is over a 255-bit prime field. Its separately analyzed Johnson regime must not be conflated with that experiment. Native Fp4 support and concrete security need their own derivation. [Paper/version record](https://eprint.iacr.org/2026/1561), [retained full paper, §5 and Appendix B](../../output/research/crypto-2026-september/liftwhir-paper.pdf).

PIPFRI §6.1 uses Goldilocks but sets **λ=100**, with conjectured list-polynomial binding; it describes a further DEEP-FRI reduction to a singleton. These are not matched 128-bit benchmarks. The experiments average ten runs and use different hardware from ours. Table 6 also excludes communication time from distributed timings. A native comparison must include extension-field advice, the complete binding/extraction argument and worker traffic. [Final proceedings paper, §§6.1–6.2](https://www.usenix.org/system/files/usenixsecurity26-li-weihan.pdf).

Celer's 25.9× improvement over plookup and 9.4× over LogUp use `2^28` queries and a `2^16` table. **The publisher's footnote 1 excludes committing to the query vector.** Those figures cannot be applied to the whole game prover. The accessible abstract and notes establish that scope; the full construction was not accessible in this follow-up, so its exact PCS assumptions and native adaptation remain unverified. [Publisher abstract and notes](https://link.springer.com/chapter/10.1007/978-3-032-35424-2_9).

The projective-sumcheck paper's large-prime Montgomery/challenge-subset optimization is distinct from its representation change. Neither predicts native Goldilocks/Fp4 performance. The author benchmark code has a **September 4 revision**; its kernels use precomputed challenges and degree-two or degree-two-times-equality workloads, rather than complete committed proofs. Keep that code date separate from the April manuscript record. [Primary paper record](https://eprint.iacr.org/2026/762), [pinned benchmark revision](https://github.com/quangvdao/monomial-sumcheck-benchmarks/tree/b2e6df5bb19a2af5313e7abe8fbd51313e30e6a1).

**The September coding results are relevant, including to extension fields**

The September 5 revision of **TR26-164** extends its prime-field, arbitrary-evaluation-set decoding result from low rates to all constant rates. That is a material development, but the asymptotic statement alone is not a numerical certificate for our code lengths. [Exact revision record](https://eccc.weizmann.ac.il/report/2026/164/).

**TR26-169**, published September 6, needs a more precise reading than “prime fields only.” Section 8.4 states that its geometric list and mutual-correlated-agreement arguments extend to finite fields when the characteristic satisfies `p > max(k−1, Bγ,L)` and evaluation points are distinct. Section 8.5 leaves practical constants and prescribed short-block certificates unresolved. Our characteristic is still Goldilocks `p`, even though challenges live in `Fp4`; replacing `p` with `p^4` in that condition would be wrong. [Primary record](https://eccc.weizmann.ac.il/report/2026/169/), [retained paper, §§8.4–8.5](../../output/research/crypto-2026-september/eccc-169-paper.pdf).

Our existing [base-extraction lemma](../native-membership-extraction-review.md) already uses an agreement threshold in unique decoding. New capacity results are therefore not necessary for that algebraic lemma. The remaining task is to establish that phase-0 values and multiplicities are fixed before `eta,beta`, and that phase-1 inverse advice is fixed before `rho`, then compose both openings and Fiat–Shamir. A theorem about codewords is one premise of that argument.

The CRYPTO 2026 **functional-commitment Fiat–Shamir** paper makes the composition obligation clearer: its premises include state-restoration security of the functional IOP and state-restoration function binding of the commitment. Ordinary binding alone does not instantiate that theorem for our arbitrary linear openings. [June 2 revised paper](https://eprint.iacr.org/2025/902).

**A whole execution needs its own error budget**

The selected [boundary-first policy](../native-terminal-closure-policy.md) has an illustrative proof grammar `B0, M0, B1, M1, …, BN`: one boundary check before each motion step and one final boundary check. If implemented as separate component proofs, it has `C=2N+1` components. This grammar is a target; the current positive-tick closure does not implement all of it.

For one bounded execution, suppose each component has statistical failure at most `2^-k` under the relevant adaptive composition. Reserving half a `2^-128` total error budget for those components gives the sufficient allocation:

```text
Σ ε_component ≤ C × 2^-k ≤ 2^-129
k = 129 + ceil(log2 C)
```

| Motion ticks N | Separate components C | Sufficient per-component statistical allocation k |
| ---: | ---: | ---: |
| 0 | 1 | 129 |
| 5,400 — 180 seconds at 30 Hz | 10,801 | 143 |
| 9,000 — current native maximum | 18,001 | 144 |

This is **allocation arithmetic, not a security estimate or new parameter setting**. The union bound needs no independence, but the individual bounds must hold under the complete adaptive attack and shared query budget, not just after an honest prefix. Fiat–Shamir retries are not counted by `C`; their costs belong in the corresponding reduction. Include all excluded lookup, extraction, hash and composition terms exactly once. Computational hash security is separate from these statistical bits. Multiple games or a lifetime claim need additional accounting. Aggregation changes the proof grammar and requires a fresh budget.

**The current native evidence supports experimentation, not deployment**

These are single retained arm64 CPU runs, including runtime relation construction/compilation and process overhead; Rust compilation is measured separately and excluded. The sequence executes three transitions; the closure verifies the preceding sequence and adjusts an already-terminal result without driving. These results verify compiled field relations. Base-extraction, integer-execution, accepted-history and composed-security qualification remain false.

| Evidence | Two cars | Eight cars |
| --- | ---: | ---: |
| Three-transition sequence proof bundle | 2,419,436 B | 3,577,548 B |
| Sequence whole proving process | 15.432 s | 152.431 s |
| Sequence whole verification process | 6.765 s | 54.355 s |
| Additional terminal-closure proof | 257,516 B | 527,500 B |
| Closure proving process, excluding preceding proofs | 0.729 s | 7.472 s |
| Combined sequence-plus-closure verification process | 7.094 s | 54.216 s |

Sources: [sequence report](../../output/qualification/native-membership-history-attempt-1/report.json), [closure report](../../output/qualification/native-membership-closure-attempt-2/report.json). Different verification runs have ordinary timing variation; the last row is not an isolated closure cost. No full-race time is extrapolated. The [sequence](../../world/native/NATIVE_MEMBERSHIP_SEQUENCE.md) and [closure](../../world/native/NATIVE_MEMBERSHIP_CLOSURE.md) documents retain exact source, test and qualification scopes.

The [current prover](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/phased_membership_proof.rs) allocates six dense factor tables and later drops them before openings. A blocked sumcheck experiment can target that allocation directly, measuring added passes and total RSS; saving factor memory does not remove the separate commitment and compiler allocations. A projective implementation changes mathematical identities and therefore belongs in a distinct experimental relation, rather than silently changing the frozen baseline.

There is a specific mixed-degree trap: our expression is `C + Lw·Lv + Qw·Ql·Qr`. Under a common cubic projective rule, lower-degree terms need homogenization. One candidate is `J=∏(1+Xi)` and `C·J² + Lw·Lv·J + Qw·Ql·Qr`, since J is one at every projective corner. This is an integration proposal requiring tiny-domain parity checks and new terminal/read identities; simply deleting binding subtractions is insufficient. [Author manuscript, §3.1](https://quangvdao.github.io/papers/authored/monomial-basis-sum-check.pdf).

**Implementation order informed by this study**

1. Complete boundary-before-motion and genesis termination, and bind the full accepted/pending history and consensus removal decisions. Use these semantic cases as mandatory fixtures for every candidate.
2. Add phase-level cost measurements, then compare blocked product-sumcheck with the existing dense implementation. Require identical rounds, challenges and final claims where the algorithm preserves the protocol.
3. Compare complete native lookup reductions on the actual namespace/table census. Include commitments to query values, multiplicities, all auxiliary data and both oracle tails. Celer remains a reading candidate until its complete assumptions are checked.
4. Compare structured chunks plus transparent accumulation, including initial/final state, input authorization, first-terminal behavior, final decider, proof size and validator work. Evaluate SuperNeo separately if its changed assumption set earns a complete-workload advantage.
5. Benchmark LiftWHIR or fragmented encoding only with the same statement, fields, hash instance and explicit error budget. Keep classical and quantum claims separate and require the planned external cryptographic review before activation.

The 2026 Poseidon-family cryptanalysis reinforces exact-instance review. **Skipping Class** distinguishes large relative algebraic improvements from breaking the claimed security target; **Midpoint Reset** assumes an adaptively selected MDS matrix after constants. Neither establishes a break of our pinned instance. Review our complete sponge mode and joint parameter provenance rather than respond by arbitrarily changing rounds. [Skipping Class](https://eprint.iacr.org/2026/306), [Midpoint Reset](https://eprint.iacr.org/2026/1760), [native provenance](../../../iroha/crates/iroha_core/src/execution_proofs/POSEIDON2_PROVENANCE.md).

For authentication, NIST still lists ML-KEM, ML-DSA and SLH-DSA as finalized, with Falcon and HQC standardization ongoing. Proof soundness, wallet/input signatures, Connect encryption and finalized-ledger certificates need separate migration decisions. A transparent proof does not make the whole game post-quantum. [NIST status, updated August 5](https://csrc.nist.gov/projects/post-quantum-cryptography).

Research stopped after primary-source checks covered the consequential decisions and identified the remaining theorem/access gaps. No external benchmark, supported-target build, native proof implementation, wallet flow or live settlement was changed by this follow-up. The complete SORA CARS goal remains active.
