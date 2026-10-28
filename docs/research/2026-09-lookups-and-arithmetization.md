# Native execution proofs: lookups and arithmetization, September 2026

Research cutoff: **September 7, 2026**. This note evaluates primary papers, author documentation, repositories, and operator announcements available by that date. Dates below distinguish initial publication, inspected revision, and deployment announcements. Undated implementation documentation is an access-time observation, not evidence that every feature existed in an earlier release.

**Recommendation:** keep the native Rust integer semantics, but stop treating bit decomposition as the only representation of range obligations. Prototype a reusable, typed lookup layer for bounded limbs and fixed geometry rows, then compare a conventional LogUp/LogUp-GKR construction with Logup* for small indexed tables. Evaluate heterogeneous AIR tables or a multilinear backend after measuring the resulting obligations. This is an implementation recommendation inferred from the sources, not a claim that a selected protocol already proves the game.

The requested architecture remains a native, reusable Iroha execution-proof framework. These sources supply algorithms and engineering evidence; they do not authorize adopting Jolt, SP1, OpenVM, or any other external zkVM. In particular, no RISC Zero dependency is proposed. No researched construction automatically supplies the project's 128-bit security target.

## Local problem and evidence boundary

The pinned [scalar-lowering report](../../output/qualification/street-rom-basis/lowering/report.json) contains **1,670,866 witness wires and 1,827,393 degree-two scalar equations per eight-car tick**, including exact compiled geometry. The [staging report](../../output/qualification/street-rom-basis/staging/report.json) has 112 rows of width 15,483 per tick, or 1,734,096 dense cells. Its 9,000-tick storage estimate is **124,854,912,000 bytes, approximately 116.28 GiB**, before low-degree extension, commitment trees, extension-field workspaces, or proof generation. This is arithmetic accounting, not an allocated full-race proof benchmark.

Report SHA-256 pins:

- Lowering: `b81f057d86a5888598fd640ae655dfab87c43cb296624ee0b9f8c710ca44a4e3`.
- Staging: `1ab47b15057258463101c42074722e11d37c19e4c429596e80945917c1071abe`.
- Their native helper: `fc7a73556c492a17810dc0e4fc3f00377024ece3b5c86b69be61c0808a246ded`.
- Their fixed-ROM implementation: `29fc3dfb267724eac154aa179fbb5acf229eb03e074e1b491cc2cd3c77ae70ff`.
- Range census: `f002d8d592dd93703118c2681de84fade84b122d0b4500559a0dd6c221a7d0e3`.

The [independent ROM comparison](../../output/qualification/street-rom-basis-audit/native_comparison.json) already measured the exact shared-basis ROM improvement: 22,711 to 774 wires for one 1,403-row, 16-column table query. This construction uses fixed coefficients and exact polynomial equations. It is **not** a probabilistic lookup argument or an implementation of Shout.

The completed [range census](../../output/qualification/street-range-audit/README.md) identifies **1,539,863 SlackBit witnesses, 92.16% of the eight-car circuit**: 1,005,285 arise from comparisons, 534,138 from explicit ranges, and 440 from unsigned decomposition. It finds zero duplicate exact slack definitions, including after normalizing 8,200 simple equality aliases, and no duplicate emitted narrowing calls. It does not perform full expression congruence or prove that every possible reuse opportunity is absent. These counts support changing the range/comparison representation; they do not predict an end-to-end lookup speedup. In particular, an ordinary range-API replacement alone would miss the larger comparison cost.

These reports qualify finite scalar relations and limited multi-tick boundary checks. They do not qualify a full-race STARK, a public execution profile, settlement, or a 128-bit security bound.

## What the research actually establishes

### LogUp and LogUp-GKR: the nearest fit for range checks

[Multivariate lookups based on logarithmic derivatives](https://eprint.iacr.org/2022/1530), Ulrich Haböck, was received November 4, 2022 and revised February 20, 2025. It replaces a sorted union-style lookup construction with logarithmic-derivative identities and shared multiplicities, particularly useful when many columns query one table. Its reported 1.5–4× comparison is a **paper-and-pencil operation count** for columns of length 2¹², with gains depending on the number of columns; it is not a measured end-to-end prover improvement.

[Improving logarithmic derivative lookups using GKR](https://eprint.iacr.org/2023/1284), Shahar Papini and Ulrich Haböck, was received August 27, 2023 and revised February 20, 2025. This informal note uses a fractional-sum GKR reduction to reduce auxiliary commitments, including a single multiplicity column shared across lookup columns. It also describes a univariate-to-multivariate commitment transformation. Consequently, adding GKR to an existing FRI system requires an authenticated bridge between representations; an uncommitted sumcheck result is insufficient. The accessible primary abstract establishes the construction and its informal status; this review does not treat the note as a complete security analysis of our eventual composition.

The useful intuition is a rational-function identity. For queries `x_i`, table entries `t_j`, and their multiplicities `m_j`:

```text
sum_i 1 / (X - x_i) = sum_j m_j / (X - t_j).
```

A protocol checks a randomized version while binding its inputs, multiplicities, and intermediate claims. This equation alone is not a proof system. Its potential value here is sharing the work of checking many byte or word-sized limbs instead of materializing separate Boolean witnesses for every limb bit.

[Bypassing the characteristic bound in logUp](https://eprint.iacr.org/2024/2067), Liam Eagen and Ulrich Haböck, was received December 23, 2024 and revised February 20, 2025. It generalizes pole multiplicities to remove the characteristic restriction and extend the method to binary fields, including GKR-based constructions. This matters when considering smaller fields: passing to an extension field increases the challenge space but **does not change its characteristic**. A conventional count-based construction must account for possible count cancellation modulo the base characteristic, or implement the published generalized construction correctly.

**Decision:** highest-priority native prototype. Compare complete constructions, including range reconstruction, multiplicity work, commitment opening reductions, and soundness accounting. Do not count only the removed bit columns.

### Lasso, Jolt, and Twist/Shout: distinguish the frontend from its commitments

[Unlocking the lookup singularity with Lasso](https://eprint.iacr.org/2023/1216), Srinath Setty, Justin Thaler, and Riad Wahby, was received August 10, 2023. It supports multilinear commitments and exploits structured tables, including tables too large to materialize directly. Its efficient treatment of small field values is especially useful with multiexponentiation-based commitments. A byte range table is naturally structured; our arbitrary sampled road geometry is not automatically a compact structured Lasso table.

[Jolt: SNARKs for Virtual Machines via Lookups](https://eprint.iacr.org/2023/1217), Arasu Arun, Srinath Setty, and Justin Thaler, was also received August 10, 2023. It demonstrates an ISA frontend dominated by lookups. Its original per-instruction estimates concern that ISA and architecture, not one racing tick. The transferable lesson is to expose a computation's useful operations directly rather than flattening everything into generic scalar gates prematurely.

[Twist and Shout](https://eprint.iacr.org/2025/105), Setty and Thaler, was received January 22, 2025 and revised February 27, 2025. Shout handles read-only accesses; Twist adds read/write memory. One-hot addressing and increments reduce memory-checking costs. The headline gains above 10× come from detailed cost analysis at comparable logarithmic proof lengths; another 2–4× estimate concerns alternatives allowed larger proofs. The revision explicitly corrects local-Twist Booleanity-checking costs, so old figures cannot be copied uncritically. Efficient sparse commitments remain a major premise.

The [current Jolt documentation](https://jolt.a16zcrypto.com/) lists the August 18, 2025 Twist/Shout upgrade and October 15, 2025 RV64 support. Its [RAM documentation](https://jolt.a16zcrypto.com/how/architecture/ram.html) describes local Twist and implementation differences from the paper; parameters depend on both execution length and memory size. The [commitment appendix](https://jolt.a16zcrypto.com/how/appendix/pcs.html) identifies Dory. These are evidence of a concrete implementation, not evidence of an Iroha-compatible FRI backend or an independently verified settlement deployment.

**Decision:** adopt the architectural idea of native operations plus authenticated lookup claims. Do not import the VM or assume that curve-based sparse-commitment costs survive a substitution with Merkle trees and FRI. Read-only geometry needs no general mutable-memory protocol unless another computation justifies it.

### Logup* and the hash-based Twist/Shout bridge

[Logup*: faster, cheaper logup argument for small-table indexed lookups](https://eprint.iacr.org/2025/946), Lev Soukhanov, was received May 24, 2025. The [author's May 2025 note](https://levs57.github.io/logup_.pdf) avoids extra committed arrays as long as the indexing array, instead using table-sized objects and virtual evaluations. It specifically targets a small-table, many-query regime. Its informal construction is a promising match for shared range tables and the 1,403-row geometry table, but there is no end-to-end racing benchmark or deployment evidence here.

[Twist and Shout via logup*](https://www.powdr.org/papers/twist_shout_logup_star.pdf), Georg Wiese, is dated October 30, 2025. It explicitly addresses the difficulty of efficient sparse commitments with hash-based polynomial commitments. It uses Logup* to represent a one-hot matrix implicitly through a pushforward operation, then adapts Shout and Twist. This is the most directly relevant bridge from those techniques to a transparent native backend. However, its pushforward subprotocol delegates details to Logup*, and it does not establish a production-ready implementation or measured full-program speedup.

**Decision:** run a bounded comparison against ordinary LogUp-GKR. Measure table size, query count, virtual evaluation work, all additional commitments, and verifier work. For geometry, authenticate `(table_id, row_index, all selected fields)` together. Independent per-column membership could combine fields from different road samples and prove a false simulation.

### Multilinear systems and modern AIR: a layout choice, not a binary divide

[SP1 Hypercube's May 20, 2025 announcement](https://blog.succinct.xyz/sp1-hypercube/) describes a multilinear architecture with Jagged commitments and LogUp-GKR. Its initial Ethereum result used roughly 160 RTX 4090 GPUs and excluded RPC Merkle-witness fetching. That is a cluster result with a specified workload, not a single-CPU comparison. The [November 18, 2025 update](https://blog.succinct.xyz/real-time-proving-16-gpus/) reports 99.7% of sampled blocks proved within 12 seconds on 16 RTX 5090 GPUs. Neither measurement predicts the speed of our integer circuit.

The [February 19, 2026 Hypercube announcement](https://blog.succinct.xyz/sp1-hypercube-is-now-live-on-mainnet/) reports availability on the Succinct Prover Network. More concrete application evidence comes from [Celo's May 26, 2026 operator announcement](https://forum.celo.org/t/op-succinct-sp1-hypercube-upgrade-live-on-celo-mainnet/13349): OP-Succinct Lite's fault-proof infrastructure was upgraded on Celo mainnet. Its projected cost and time improvements are expectations, not measured post-upgrade results. This demonstrates deployed use of the architecture, without making its external VM appropriate for this project.

[S-two Whitepaper](https://eprint.iacr.org/2026/532), received March 16 and revised March 24, 2026, describes M31/Circle STARKs and a flat AIR supporting multiple tables. It addresses cross-domain correlated agreement, with proven results up to the Johnson bound and discussion of conjectural behavior beyond it. This is evidence that useful AIR designs need not be one enormous uniform rectangle. It is not evidence that arbitrary multi-table composition inherits single-table soundness. [StarkWare's January 27, 2026 S-two 2.0 release](https://starkware.co/blog/s-two-2-0-0-prover-for-developers/) reports production use for Starknet blocks and a library for custom AIRs; that release does not independently establish deployment of every later whitepaper optimization.

[SWIRL: Stacked WHIR with Interaction Reductions via LogUp](https://openvm.dev/swirl.pdf), inspected revision **March 13, 2026**, is especially relevant to layout. It stacks heterogeneous columns, uses multiple AIRs connected by interaction buses, and reduces interactions with customized LogUp-GKR before WHIR openings. Its theorem is conditional QROM adaptive soundness/knowledge soundness with explicit errors in equations 4.9/4.10. Those parameters must be instantiated and composed; the title or abstract does not qualify our parameters, implementation, or post-quantum security. It is a concrete design reference for avoiding excessive uniform padding, not proof that our current stage schedule can be relabeled as SWIRL.

**Decision:** prototype shared component tables for arithmetic, range limbs, and geometry, preserving exact cross-table messages. Compare their committed cell count and opening work against a multilinear representation. Keep Goldilocks initially: moving to M31 requires redesigning integer bounds and multi-limb arithmetic, even if its field operations are faster.

### Binary fields: useful packed operations, a substantially different arithmetic backend

[Succinct Arguments over Towers of Binary Fields](https://eprint.iacr.org/2023/1784), Benjamin Diamond and Jim Posen, was received November 17, 2023 and substantially revised through April 27, 2025 for EUROCRYPT 2025. Binius uses small binary fields without embedding every bit in a much larger prime-field element, combining binary-field commitments with arithmetization techniques including lookups. This directly challenges the assumption that each Boolean witness must occupy a Goldilocks word.

[Binius64's September 9, 2025 announcement](https://www.irreducible.com/posts/announcing-binius64) targets native 64-bit Boolean operations and integer multiplication on CPUs. Its launch limitations included missing zero knowledge, recursion, and succinct verification. The authors also corrected benchmark comparisons involving hardware costs, hash choices, and missing VM precompiles. Those launch comparisons are unsuitable as an adoption argument. Do not freeze the launch limitations as current facts: the [current repository](https://github.com/binius-zk/binius64) describes a succinct zero-knowledge system, while the [Blueprint](https://www.binius.xyz/blueprint/) directs readers to an updated specification and notes stale web sections. These current documents lack a verified release date here. [Irreducible's November 12, 2025 shutdown notice](https://www.irreducible.com/posts/irreducible-shutting-down) and relicensing are maintenance-history facts; they do not establish the state of all subsequent community work.

[GKR for Boolean Circuits with Sub-linear RAM Operations](https://eprint.iacr.org/2025/717), received April 21 and revised May 3, 2025, develops packed Boolean GKR and sumcheck for data-parallel circuits. Its random-Boolean-circuit benchmark is not a racing workload. The revision metadata explicitly removes an end-to-end Binius comparison after an incorrect Keccak-f circuit-size estimate. This is a useful warning to inspect benchmark inputs and revisions rather than extrapolate headline ratios.

**Decision:** a separate bounded backend experiment is justified for packed flags, input decoding, and selected word operations. A full replacement is premature. Binary-field addition is XOR; it is not signed integer addition. Carries, comparisons, truncating signed division, overflow exclusions, and interaction with any retained prime-field tables all need exact constraints and a sound binding protocol. A 64-bit representation advantage is not a 64× whole-game speedup.

### Developments actually available during 2026

[Flock's June 25, 2026 research announcement](https://blog.succinct.xyz/introducing-flock/) introduces a Boolean-R1CS approach for batched hashes and explicitly labels it a research prototype unsuitable for production. Its Apple CPU comparison excludes native SHA hardware instructions and uses a non-vectorized one-at-a-time native baseline. The [repository's July 17, 2026 benchmark description](https://github.com/succinctlabs/flock) uses a 32-core AMD 7970X with 256 GB RAM, reports warmed best-of-three measurements, and focuses on compression functions. It is relevant to packed Boolean work and transcript/hash costs; it does not establish efficient proof of the race's control flow or signed physics.

[Jolt Atlas](https://arxiv.org/abs/2602.17452), submitted February 19, 2026, illustrates applying lookup/sumcheck ideas directly to ONNX tensor operations instead of paying CPU instruction overhead. Its model/table transformations target neural-inference accuracy. That is a useful architecture precedent, but accuracy-preserving transformations must not be mistaken for the bit-identical integer semantics required here.

The [September 3, 2026 SP1–NVIDIA cuPQC announcement](https://blog.succinct.xyz/sp1-nvidia-cupqc/) concerns an ongoing integration of accelerated primitives. It is not a newly completed arithmetization or an independently reproduced racing benchmark. It reinforces the need to separate protocol savings from hardware-kernel improvements.

## Concrete native implementation sequence

The following is our engineering proposal, inferred from the research and local accounting.

1. **Use the completed census to select the prototype.** Start with both comparison slacks and explicit range decompositions; preserve the existing attribution and width distributions when measuring a replacement. The census calibrates its instrumented circuit against the full ordered scalar-polynomial serialization. Any proposed reuse still needs a proved wire/equation identity and measured effect on live intervals. Include unused outputs, unselected branches, and disconnected assertions. A value's range metadata must never substitute for an equation or an authenticated lookup.

2. **Preserve a typed proof-facing integer representation.** Retain signed bounds, canonical value representation, operation identity, and provenance. Encode a range with `a = x - low = sum_j limb_j * 2^(b*j)`, initially comparing 8-, 12-, and 16-bit limbs. A non-power-of-two upper bound still needs an exact bound check, such as a bounded slack satisfying `a + slack = high - low`. Constrain partial top limbs and establish reconstruction envelopes that exclude modular aliases. Comparisons and division still need their sign, carry, remainder, and quotient obligations. Only a proved implication may remove a redundant range check.

3. **Introduce reusable range and fixed-row lookup obligations.** Tables have compiled IDs, canonical schemas, immutable contents or authenticated digests, and explicit index bounds. Start with the range tables because they repeat throughout the computation. For geometry, the lookup message includes the index and the complete required row tuple. Keep the existing exact ROM as an independent oracle and fallback during qualification. Never let a prover provide an unbound replacement table.

4. **Batch actual accepted accesses.** Bind operation activation, tick, and any required slot identity to the surrounding relation. Prove activation bits Boolean and specify canonical padding. Account for the exact count of queries, table duplicates, multiplicity representation, and characteristic. Commit all requisite data before deriving dependent challenges. Every virtual column or pushforward evaluation ultimately needs a checked reduction to authenticated data.

5. **Implement one complete transparent candidate before widening scope.** Begin with a Goldilocks-compatible LogUp-family construction and explicit extension-field challenge handling. Compare a conventional construction against Logup* only after both include commitment bindings and all opening reductions. Add negative tests for wrong table IDs, mixed geometry columns, duplicated/dropped queries, out-of-range limbs, count wrapping, zero-denominator handling, unconstrained inactive rows, and challenges derived from an incomplete transcript. No retry/grinding policy may be improvised without soundness accounting.

6. **Then choose the layout and commitment backend together.** Range buses can serve heterogeneous AIR components without committing one field element per bit per stage. A multilinear layout may reduce padding further, but all sumcheck claims must reach a compatible commitment verifier. Benchmark SWIRL-like stacked components as a separate design candidate rather than assuming the current scalar schedule is an AIR. The [main cryptography study](2026-09-cryptography-review.md) evaluates the commitment and streaming choices in detail.

7. **Qualify the exact complete computation.** Use two- and eight-car traces, the full 9,000-tick bound, and adversarial events covering every branch, collision order, hazard, finish, and inactivity rule. Record native/browser parity, witness-generation time, total proving time, peak RSS, proof size, and validator verification cost. Report CPU model, cores, SIMD, GPU count, memory, compiler flags, cold/warm state, and excluded preprocessing. Measure multiple runs. Keep portable CPU and accelerated-path parity mandatory.

The 9,000-tick bound used here follows the current street-profile measurement. It must not silently replace the original 5,400-tick/180-second racing profile bound; duration is part of the versioned computation and statement.

## Soundness and adoption gates

For planning, maintain a composed error budget covering tuple compression, lookup identity checking, GKR/sumcheck, representation/opening reductions, polynomial commitments, transcript challenges, and hash assumptions. This is a bookkeeping outline, **not** a derived theorem. Instantiate degree, query-count, domain-size, repetition, and adversarial-query bounds for the complete maximum-size race. An Fp4 challenge space or a library setting named “128” does not prove a 128-bit bound. The separate [soundness review](2026-09-proof-soundness.md) addresses those assumptions in detail.

Do not adopt yet:

- An external VM, because the requested implementation is native and reusable inside Iroha.
- Sparse one-hot arguments without a suitable commitment construction; the witness representation and its commitment costs cannot be separated.
- A field migration justified only by faster field benchmarks; integer semantics and multiplicity characteristic must survive it.
- Approximate table compression or altered physics to fit a proof backend.
- Binary packing without exact carry/range/comparison semantics and authenticated interaction with the rest of the proof.
- A claimed full-race speedup derived from Boolean-gate, hash-only, Ethereum-cluster, or paper-operation-count benchmarks.
- Live settlement on the strength of scalar tests, vendor deployment claims, or a proof-system paper alone.

The next concrete deliverable should be a **fully counted native range-lookup prototype with complete bindings and an explicit unresolved-security list**, compared against the current exact decomposition on identical inputs. That will determine whether range work meaningfully reduces the 116 GiB raw-layout estimate before committing to a broader backend rewrite.
