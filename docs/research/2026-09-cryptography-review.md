# Cryptography review for native Iroha games — 7 September 2026

**Recommendation:** evaluate a native, transparent proof backend with heterogeneous operation tables, batched range/lookup arguments, and a deliberately bounded-memory prover. Compare a conservative FRI route with a sumcheck/WHIR route on the same computation. Keep the current exact scalar verifier as the reference oracle. The research supports changing the representation of the computation; it does not establish a deployable proof system or a 128-bit result yet.

This study interprets “recent crypto advances” in the context of Iroha execution proofs. It covers primary papers, publication records, standards and author implementations available through **2026-09-07**, including relevant 2024–2025 foundations and 2026 revisions. It is not a market survey or an exhaustive cryptography literature review. Publication, preprint, prototype and local inference are distinguished below. This is a literature and design review, not an independent reproduction of the cited benchmarks or attacks.

The accepted product architecture remains **generic Iroha game/execution instructions**, with racing implemented as a compiled application relation. None of the proposed work requires an external zkVM. No maintained Iroha source, dependency build, deployed verifier or live-stake setting was changed for this study.

## What our measurements require us to solve

The frozen [native qualification manifest](../../artifacts/street-rom-basis.json), SHA-256 `7bc65dd4dd0a83f2d98bdb34424e0279e5576d0d7e1fe7cbb5d46acc54ebceec`, records the current eight-car circuit:

| Quantity | Measured count or arithmetic projection |
| --- | ---: |
| Scalar witness cells per tick | 1,670,866 |
| Scalar equations per tick | 1,827,393 |
| Staged rows × columns per tick | 112 × 15,483 |
| Dense cells per tick | 1,734,096 |
| Raw fields across Tokyo's 9,000-tick cap | 124,854,912,000 bytes; 116.28 GiB |

The last number excludes power-of-two rounding, fixed polynomials, low-degree extension, Merkle data and prover scratch space. It is **not measured proving memory**. Tokyo has a song-length exception of 300 simulated seconds; ordinary 180-second races have a 5,400-tick cap. Short raw-witness qualification is not full-duration cryptographic qualification.

The new layout is only 3.78% larger than one cell per scalar wire. More slot scheduling therefore has little room to fix the main problem. An output-only audit additionally finds **1,539,863 SlackBit witnesses (92.16%)** in the eight-car circuit, with no duplicate exact definitions even after normalizing the simple wire equalities it proves. Of these, 1,005,285 support comparisons, 534,138 explicit ranges, and 440 unsigned decomposition. A useful limb/lookup experiment must therefore preserve comparison semantics too. This points to the representation of bounded integers, rather than a large cache of repeated identical range proofs. See the [range cost audit](../../output/qualification/street-range-audit/README.md) for its completed evidence and scope.

These are our measurements and design deductions, not conclusions or benchmarks from the external papers.

## Advances that change the design choices

### 1. Soundness assumptions need updating before optimization

The November 2025 Crites–Stewart preprint, revised December 19, gives counterexamples to the original up-to-capacity Reed–Solomon proximity conjectures. That invalidates those premises in parameter calculations; it does not show that every FRI/STARK deployment is broken. New positive results improve proven bounds or concern particular folded/random code families. They cannot automatically certify our fixed FFT domain. [Counterexample paper](https://eprint.iacr.org/2025/2046), [improved proven proximity bounds](https://eccc.weizmann.ac.il/report/2025/169/).

The practical response is a parameter planner that identifies the exact theorem, code, radius, constants and composition error. Goldilocks/Fp4 is useful arithmetic headroom, but the size of a challenge field is not the security level of the complete noninteractive proof. The separate [soundness study](2026-09-proof-soundness.md) covers 2026 code-theory results, cross-table composition, Fiat–Shamir and recent hash attacks.

### 2. WHIR improves proof openings; it does not shrink our physics witness

WHIR, published at **EUROCRYPT 2025**, unifies useful polynomial queries with efficient proximity testing. The publication reports a degree-`2^22`, **100-bit** example with 63 KiB proofs and 360 μs verification. These are polynomial-commitment measurements, not complete racing results. [Publication record and abstract](https://cris.technion.ac.il/en/publications/whir-reed-solomon-proximity-testing-with-super-fast-verification/), [paper](https://eprint.iacr.org/2024/1586).

The author implementation still explicitly describes itself as an unreviewed academic prototype. Its inspected README defaults to `100` security bits and `ConjectureList`. Neither default belongs in our release profile merely because it runs successfully. [Author implementation](https://github.com/worldfnd/whir).

**Local implication:** benchmark WHIR as the commitment/opening layer after selecting the computation representation and a theorem-supported schedule. A faster opening does not remove the cost of constructing and committing billions of range witnesses.

### 3. Heterogeneous tables and lookup reductions fit our bottleneck

The inspected **March 13, 2026 SWIRL** manuscript combines multiple AIR components, differently shaped tables, LogUp-GKR interactions and WHIR. This is a concrete architecture to study for native execution proofs. Its security analysis is conditional on its stated protocol/model bounds; the paper's quantum-random-oracle result is not an end-to-end Iroha quantum-security certificate. [SWIRL manuscript](https://openvm.dev/swirl.pdf).

**Local implication:** separate arithmetic, ranges, geometry reads and ordered contacts into explicit tables with authenticated interactions. Replacing the current exact ROM or bit constraints with a probabilistic lookup changes the arithmetization and proof protocol; it must preserve the same accepted computation. This requires new multiplicity, tuple-encoding, denominator and transcript checks. Merely supplying a lookup result from Rust is not a proof.

The [lookup and arithmetization study](2026-09-lookups-and-arithmetization.md) compares LogUp-GKR, indexed Logup*, Lasso/Jolt, Twist/Shout, S-two, Binius and Flock. Original sparse-commitment speedups must not be copied into a hash-based commitment implementation without paying its actual commitment cost.

### 4. Low-memory proving now has several distinct, credible approaches

| Work and inspected status | What advances | What the result does not give us automatically |
| --- | --- | --- |
| **Scribe**, USENIX Security **August 2026**; first preprint December 2024. [Final paper](https://www.usenix.org/system/files/usenixsecurity26-baweja.pdf) | Read/write streaming moves intermediate state to disk. The evaluation uses BLS12-381/PST, a 12-core Xeon with a 750 MiB limit, and reports 145 GB of disk for `2^28` gates. | It is not a transparent Goldilocks STARK benchmark. Disk capacity, I/O and CPU work remain. The final publication supersedes the older abstract's 2 GB figure. |
| **Hobbit**, USENIX Security **August 2025**. [Paper](https://www.usenix.org/system/files/usenixsecurity25-pappas.pdf) | Streams arithmetic-circuit evaluation with a tunable buffer and a hash/code-based PCS. Space includes evaluation space and the buffer; smaller buffers increase proof/verifier costs. | Its C++ evaluation uses a 61-bit field extension, Blake3 and modified WHIR; PCS experiments target 100 bits. Published single-thread measurements are not 128-bit Rust race measurements. |
| **Time-Space Trade-Offs for Sumcheck**, TCC 2025; ePrint revision **February 25, 2026**. [Paper record](https://eprint.iacr.org/2025/1473) | Formal upper/lower bounds explain how extra passes buy less memory. Authors report up to 120× less memory with under 2× time overhead for their sumcheck experiments. | The result concerns the stated sumcheck models. A complete PCS, witness generator and lookup system must also obey the memory limit. |
| **Proving CPU Executions in Small Space**, received **April 3, 2025**, preprint. [Paper record](https://eprint.iacr.org/2025/611) | Develops low-memory Jolt proving without recursive SNARK composition, with modest prospective runtime overhead. | It relies on that proof system's structure. It is a source of techniques, not a reason to replace native Iroha with an external VM. |

**Local implication:** our current streaming *raw verifier* is not a streaming cryptographic *prover*. Prototype a bounded-memory witness producer and a real commitment/sumcheck/FRI pipeline. Account for RAM, OS cache, scratch disk, bytes read/written and repeated passes. Preserve exact committed state/action continuity across chunks. Choosing independent chunk proofs would additionally require an authenticated composition protocol and must include its cost.

### 5. New sumcheck and binary-field work is worth benchmarking selectively

**Projective/monomial sumcheck**, received April 17, 2026, changes polynomial representation and round identities to remove binding subtractions. Its reported roughly 10% end-to-end speedup for the sumcheck prover concerns BN254 and a 128-bit prime; a separate larger gain concerns particular 256-bit-field multiplication. These are not Goldilocks/Fp4 measurements or full-SNARK speedups. **Inference:** a candidate kernel experiment after selecting sumcheck, with exact transcript/representation equivalence or a new versioned protocol. [Primary preprint](https://eprint.iacr.org/2026/762).

**Ligerito**, author manuscript dated May 2025, provides flexible code-based commitments. Its Julia prototype reports 1.3 seconds and 255 KiB for `2^24` coefficients over a 32-bit binary field on an M1 MacBook Pro. The author's repository explicitly says experimental and unaudited. **Inference:** useful as a PCS comparison; its small coefficients and runtime say nothing by themselves about our signed physics and full-proof security. [Author manuscript](https://angeris.github.io/papers/ligerito.pdf), [author implementation](https://github.com/bcc-research/Ligerito.jl).

The binary-field path deserves a separate native experiment because bit operations can become cheaper. It also requires new integer encodings: characteristic-two field addition does not implement ordinary integer addition, comparisons or carries. Likewise M31/Circle arithmetic cannot preserve our existing single-field-element `±2^50` range arguments unchanged. Count the entire rewritten circuit, not just bytes per field element.

### 6. Privacy and post-quantum claims must remain separate

The February 25, 2026 **Zero-Knowledge IOPPs for Constrained Interleaved Codes** preprint adds composable honest-verifier zero-knowledge reductions with round-by-round knowledge soundness. Plain WHIR does not gain privacy from its name. Our first race proof uses public replay data, so hidden-witness machinery need not be on that critical path. Any future private game computation requires a separately specified complete zero-knowledge construction. [Primary preprint](https://eprint.iacr.org/2026/391).

For signatures, NIST advanced nine additional candidates in **May 2026**; these remain candidates. ML-DSA and SLH-DSA already have standards. NIST's August 2026 selected-algorithms page still lists Falcon and HQC standards as forthcoming. **Inference for Iroha:** a hash-based execution argument alone does not make wallet signatures, authorized input keys, consensus certificates or transport quantum resistant. Keep those migration claims separate and use exact algorithm/parameter identifiers. [NIST May status](https://csrc.nist.gov/pubs/ir/8610/final), [selected algorithms](https://csrc.nist.gov/projects/post-quantum-cryptography/post-quantum-cryptography-standardization/selected-algorithms).

## Proposed implementation sequence

These are proposed experiments and acceptance criteria, not completed implementations:

1. **Freeze the semantic oracle.** Retain every equation, range endpoint, inactive-state rule, collision order and public-boundary check from the measured native relation. Complete terminal and authenticated input/dispute bindings. Preserve malicious-witness rejection tests across every experimental representation.
2. **Measure one range-table prototype first.** Compare small fixed chunk tables with current two-sided bit decomposition on the actual emitted ranges. Include extra top-limb bounds, signed reconstruction, comparison guards, lookup multiplicities, table commitments and full proof overhead. Exact wire-identity reuse remains permissible where proved; equal honest values are never evidence of interchangeability.
3. **Evaluate two transparent backend lanes.** One conservative FRI/AIR lane and one heterogeneous sumcheck/WHIR lane, both native Rust and both using the same relation and security target. Freeze their transcript schedules, fixed table digests and degree accounting. Allow neither arbitrary verifier installation nor user-selected weaker parameters.
4. **Make memory bounded end to end.** Compare recomputation, sequential disk streaming and, only if needed, authenticated chunk composition. Demonstrate real commitment/opening work under an enforced budget before attempting a full-duration proof. Count proof size and validator work alongside prover savings.
5. **Recompute security before admission.** Use proved applicable proximity bounds, the actual extension and challenge distribution, and all lookup/batching/boundary/Fiat–Shamir terms. Review the exact hash instance against the 2025–August 2026 attacks. Keep conventional hashes in the comparison until an algebraic instance has an independently reviewed margin.
6. **Qualify the complete generic execution path.** Prove two through eight cars, standard maximum-duration races and the longer Tokyo exception; test CPU/accelerated parity, rejected mutations, malformed proofs, cross-session replay and bounded parsing/metering. Then exercise generic custody/disputes/settlement, four validators, wallet approvals and pinned finality verification. Network and SoraFS rollout remain separate prerequisites.

The parameter planner should carry a symbolic ledger of failure events before producing a number. For example, where the chosen composition theorem permits a union bound, record algebraic, lookup, proximity and binding events separately; then apply the actual Fiat–Shamir reduction rather than treating the interactive sum as the final noninteractive bound. Fix what “128 bits” means, including adversary type and allowed work. Neither a 256-bit challenge field nor a benchmark's security flag is sufficient evidence.

Every benchmark must pin source/compiler/parameters and report the relation digest, security assumptions, full proof bytes, wall/CPU time, peak RSS including relevant subprocesses, disk high-water mark, I/O bytes, thread count, hardware, validator verification/metering and whether recursion, setup, witness generation and input authentication are included. This makes a faster result comparable and reviewable.

## Decision boundary

Proceed with **lookup/range reduction and bounded-memory native proving experiments**. Investigate **WHIR/SWIRL as a complete composed backend**, not a cosmetic replacement of the final FRI call. Treat small-field/binary-field rewrites and very recent hash constructions as separately measured candidates. Do not transfer published speedup factors or nominal security settings to the game.

The study changes our next experiments; it does not qualify a proof or authorize live settlement. Current implementation facts remain in the pinned local manifest. Additional primary-source detail is in the [soundness study](2026-09-proof-soundness.md) and [lookup/arithmetization study](2026-09-lookups-and-arithmetization.md).
