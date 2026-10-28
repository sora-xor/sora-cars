**September 2026 cryptography study for native Iroha games**

Cutoff: **September 8, 2026**. This updates the [earlier September survey](2026-09-08-cryptography-update.md) against the newly measured two-phase membership proof. It studies cryptography for verifiable computation, with supporting coverage of cryptanalysis and post-quantum standards. It is a primary-source literature and implementation review; external benchmarks and mathematical proofs have not been independently reproduced. New preprints are identified as such. No native proof profile, dependency, chain setting or custody behavior changes as a consequence of this document.

**Recommendation:** preserve the complete native arithmetic/membership baseline while investigating a substantially more efficient representation of repeated computation. Evaluate newer commitment schemes within that complete construction. Prioritize an explicit security reduction and a bounded-memory history prover before selecting production parameters. Generic execution/game facilities, with versioned application relations, remain the architecture.

**The current baseline makes the priorities concrete.**

The [completed native report](../../output/qualification/native-membership-street-qualified/report.json), SHA-256 `b195ac0182677306d62bc965efb0322021e9494e2d7b1e753a1ed266f2383c2c`, contains six accepted fixture/prover/verifier commands and fourteen rejected mutations. Its proof covers the compiled scalar equations, range/ROM membership equations, public ports and zero padding of two/eight-car **one-tick** Street instances using two authenticated oracles. It does not yet qualify base-field extraction, complete integer execution, accepted input histories, composed security, finality or settlement.

| One-tick native CPU measurement | Two cars | Eight cars |
| --- | ---: | ---: |
| Proof bytes | 798,764 | 1,186,540 |
| Whole prover process | 13.709 s | 62.112 s |
| Prover peak RSS | 174,129,152 B | 1,572,601,856 B |
| Whole verifier process | 6.005 s | 16.214 s |
| Verifier peak RSS | 99,106,816 B | 989,118,464 B |
| Membership compilation inside prover | 1.036 s | 7.621 s |
| Phase-0 commitment inside prover | 4.937 s | 21.996 s |
| Adapter proving operation | 7.694 s | 32.179 s |

These are single local observations from the retained report, not medians or full-race estimates. The adapter operation includes several activities; internal proving subphase timings are not exposed. Multiplying a one-tick figure by 5,400 would not establish the performance of a batched or accumulated race proof. Compare candidates on the same workload, public statement, semantic obligations and security target; record changes to representation and proof geometry explicitly.

**New commitment and verifier techniques**

**LiftWHIR** was received July 30 and revised August 28, 2026; it remains a preprint. It combines interleaved Reed–Solomon encoding, DEEP checks and WHIR. In the authors' 2²⁰-element, 255-bit-field benchmarks, evaluation proving is 4.4–6.7 times faster, while total proving including commitment improves 1.55–1.61 times. Proofs grow 33–46%; verifier time also increases. Measurements use one thread on an i7-13700 under WSL2. Crucially, §5 uses **conjectured capacity-regime parameters** for the reported 128-bit target. The security sections distinguish a Johnson-bound analysis from that conditional regime. [Paper and version record](https://eprint.iacr.org/2026/1561), [retained full PDF](../../output/research/crypto-2026-september/liftwhir-paper.pdf).

Our inference: LiftWHIR is a useful native experiment, particularly for the extension-valued auxiliary oracle, but its opening speedup is not a forecast for our total prover. Evaluate both commitments, lookup phases, transcript binding, proof bytes and validator work together. Compare it with the previously studied [PIPFRI](https://www.usenix.org/system/files/usenixsecurity26-li-weihan.pdf) under the same explicit security assumptions. Neither paper supplies a qualified replacement profile for this game.

**Interactive Proofs for Batch Polynomial Evaluation**, published in ITC proceedings on August 12, 2026, reduces verification of a degree-d polynomial at m distinct points to O(d+m) field operations using an additional polynomial. Its simple protocol has error at most `(m+d)/(|F|−m)`; the multi-polynomial construction accounts separately for batching and evaluation errors. The paper also gives a compiler that reduces multiple evaluation queries to one per polynomial while preserving the underlying PIOP obligations. [Proceedings record](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ITC.2026.3), [full paper, Theorems 9–10 and Construction 17](https://drops.dagstuhl.de/storage/00lipics/lipics-vol385-itc2026/LIPIcs.ITC.2026.3/LIPIcs.ITC.2026.3.pdf).

Our inference: investigate this when a history or quotienting layer generates many point openings. Our current six terminal claims are arbitrary compiler-derived linear reads, so a univariate multi-point theorem cannot simply replace their authentication. The existing Boolean cubic sumcheck also has a small summation domain; the paper's large-domain sumcheck improvement is not automatically useful there.

**BinarySpartan**, received August 11 and revised September 3, 2026, combines binary-field Spartan, Ligerito commitments and ring switching. The author reports high hash throughput on a CPU-only M4 Max. This demonstrates an interesting direction for bit-oriented workloads; it does not benchmark signed fixed-point driving. [Primary preprint](https://eprint.iacr.org/2026/1656).

Our inference: measure hash/input-authentication kernels separately if they become material. A characteristic-two backend would need different encodings and constraints for integer carries, comparisons and signed arithmetic, plus a qualified cross-field composition if combined with Goldilocks physics. Keep the current arithmetic field until a complete-workload comparison warrants that change.

**Whole-history proofs and memory**

**WARP**, revised June 18, 2026 after TCC 2025, provides hash-based accumulation with linear prover time, logarithmic verifier time and unbounded depth. Its erasure-correction extraction approach makes it a particularly relevant transparent candidate. [Current primary paper](https://eprint.iacr.org/2025/753).

**Neo and SuperNeo** is a CRYPTO 2026 work with a September 4 revision adding extension-field CCS support and improved error bounds. SuperNeo supports general constraints and small fields including Goldilocks, using Ajtai commitments under Module-SIS. It is a significant folding candidate with a different assumption set from our hash-based stack. [Primary record and revision notes](https://eprint.iacr.org/2026/242).

Our inference: compare native transparent accumulation with a separately specified lattice-based alternative; account for the final decider, commitments to fresh inputs, recursion and boundary verification. A small folding message is not the final race proof. The [scaling study](crypto-2026-scaling.md) details Arc, memory trade-offs and acceleration. A new PCS alone does not eliminate the expanded per-tick relation, and independent workers still need authenticated ordered state boundaries and accepted gameplay inputs.

**Security research has moved substantially, including this week.**

The STOC 2026 work **On Proximity Gaps of Reed–Solomon Codes** improves bounds within the unique-decoding and Johnson regimes, while also proving limitations beyond Johnson for some code families. The companion work on subspace-design and random Reed–Solomon codes reaches stronger regimes for its specified families. These conclusions depend on the code and evaluation set. [STOC proceedings, both paper abstracts](https://acm-stoc.org/stoc2026/toc.html).

Two very recent developments require explicit version handling:

- **Brakensiek–Chen–Putterman–Zhang–Zheng, ECCC TR26-164:** September 4 initial result, September 5 revision extending from low rates to all constant rates over prime fields and arbitrary evaluation sets. The revision's Corollary 1.2 has sufficiently-large-length and field-size conditions and an asymptotic list bound. [Exact revision record](https://eccc.weizmann.ac.il/report/2026/164/), [revision 1 PDF](https://eccc.weizmann.ac.il/report/2026/164/revision/1/download).
- **Jeronimo, ECCC TR26-169:** submitted September 5, published September 6. It claims a prime-field capacity/list-decoding and mutual-correlated-agreement framework, with line error of the form `n^{Oγ(1)}/q`. This is a newly posted preprint, not an independently checked theorem in our qualification. [Primary record](https://eccc.weizmann.ac.il/report/2026/169/).

TR26-169 §8.5 explicitly leaves concrete short-block certification and practical constants open. Its decoder is polynomial in q for fixed slack, which does not mean practical in the bit length of a cryptographic field. [Retained full paper](../../output/research/crypto-2026-september/eccc-169-paper.pdf).

Our inference: study the new finite-parameter bounds and extraction requirements closely. An asymptotic prime-field result cannot be inserted as a numeric 128-bit certificate for our base/extension-valued, shifted-domain, two-oracle protocol. In particular, the field characteristic, extension degree, list size, agreement threshold, challenge schedule and extraction model must match. Stronger list decoding alone is not the entire Fiat–Shamir argument.

The Ethereum Foundation's August 20 **better.codes** initiative formalizes a concrete proximity challenge in Lean toward a 128-bit target. It is useful evidence of the shift toward machine-checked concrete bounds, not a certificate for Iroha's parameters. [Primary announcement](https://blog.ethereum.org/2026/08/20/better-codes-challenge).

Our own security work should produce a theorem/assumption ledger for lookup compression, rational membership, base-field extraction, outer sumcheck, both OOD reductions, both PCS branches, hash binding and Fiat–Shamir composition. Total field size and a query-count setting do not replace that ledger. The [membership study](crypto-2026-membership.md) and [security study](crypto-2026-security.md) cover the latest relevant constructions, real implementation failures, hash-parameter analysis and post-quantum boundaries.

Another directly relevant CRYPTO 2026 result, **On the Fiat–Shamir Security of Succinct Arguments from Functional Commitments**, supplies a composition framework under state-restoration security of the functional IOP and state-restoration function binding of the commitment. Ordinary binding alone is not its premise. This offers a more precise review target for our arbitrary linear-query opening interface. [June 2 revised primary paper](https://eprint.iacr.org/2025/902).

**Decisions for the next implementation work**

| Priority | Experiment or qualification task | Required evidence |
| --- | --- | --- |
| First | Close extraction and complete-history semantics against the measured relation | Exact two-phase reduction, integer interpretation, first-terminal behavior and authenticated accepted/pending inputs; no weakened padding or collision constraints |
| First | Reduce repeated relation and verifier work | Structured repeated computation or qualified public preprocessing, compiler-owned identities, correct dynamic ports, end-to-end measurements |
| Next | Compare existing WHIR with LiftWHIR/fragmented encoding | Same field, workload, security budget and supported CPU target; both oracles; total time/RSS/proof size/validator work |
| Next | Build bounded-memory chunks and qualify accumulation | Identical ordered boundary states, complete input/transcript binding, bounded RAM/disk/I/O, final decider cost |
| Conditional | Binary-field kernels, lattice folding or GPU paths | A measured bottleneck, exact native/reference parity, separately reviewed assumptions and complete verification |

Public replays make zero knowledge optional for the first game. Future private games need a separately qualified hiding construction. NIST's August status lists ML-KEM, ML-DSA and SLH-DSA as finalized, with Falcon and HQC standardization ongoing. [NIST primary status](https://csrc.nist.gov/projects/post-quantum-cryptography). Post-quantum proof claims must also remain separate from wallet/input signatures, session encryption and consensus certificates; the inspected Connect browser still uses X25519/Ed25519, as documented in the security study. No result in this study authenticates human participation or resolves network partitions without the game's consensus dispute rules.

Source snapshots and exact local measurements are indexed in [the research source manifest](crypto-2026-september-sources.json). The full SORA CARS implementation goal remains active; this study refines the design and qualification work.
