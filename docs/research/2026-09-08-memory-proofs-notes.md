# Sparse and memory proof research — September 8, 2026

**Recommendation: compare direct sparse relation checking and virtual reads before implementing the current serialized operand bus as a full proof backend.** The new native census preserves the computation, but its explicit same-domain proof model still has large commitment matrices. Shout/Logup* and newer sumcheck algorithms are relevant because they can avoid committing a separate copy for every scalar use. Their savings require the complete opening reductions and a suitable commitment scheme; none supplies an Iroha performance or security result automatically.

This is a focused update to the [September 7 lookup study](2026-09-lookups-and-arithmetization.md), based on primary material checked September 8. It is not an exhaustive survey or independent reproduction of external benchmarks. No external zkVM, pairing commitment backend or new protocol implementation is adopted here. The native Rust semantics and generic Iroha execution framework remain the target.

## Current local evidence, separated from projections

The new [operand census](../../output/qualification/street-operand-census/report.json), SHA-256 `b7600867dc748b7b64f51ff988fe44a089196b33a47964a236a94e5c4a152031`, freezes 28 source files and 60 artifacts. It compiles all six complete detached-ROM relations, independently compares every retained coefficient, constant, equation slot, fixed source, lookup event, table and port, and checks three real native simulation ticks per configuration. The third tick supplies numerical forfeit inputs to exercise a technical win. These are test inputs, not consensus-authenticated decisions.

| Cars / limb bits | Mandatory values per tick | Dynamic core read occurrences | Active serial core rows per tick | Measured process peak RSS |
| --- | ---: | ---: | ---: | ---: |
| 2 / 8 | 24,406 | 105,159 | 146,861 | 62,111,744 B |
| 2 / 12 | 20,646 | 91,469 | 132,425 | 55,656,448 B |
| 2 / 16 | 17,285 | 79,091 | 119,264 | 50,921,472 B |
| 8 / 8 | 340,566 | 1,698,654 | 2,142,691 | 800,669,696 B |
| 8 / 12 | 283,571 | 1,431,266 | 1,894,732 | 714,145,792 B |
| 8 / 16 | 247,648 | 1,272,440 | 1,742,281 | 648,019,968 B |

All graph-node values are checked against the native evaluator; every scalar, staged and operand row is checked. The complete execution adapter also checks initial state, exact public actions, prior outputs, final outputs, first-terminal predicates and explicit padding. For eight cars, the three ticks contain 565 execution boundary equalities plus 12 first-terminal equalities, with 698 dynamic operand occurrences and 456 constant sides. All 61 fixed output-port occurrences remain. Every mandatory value has nonzero core multiplicity in these six graphs; this observed property is not a compiler permission to omit zero-multiplicity values in other computations.

The eight-car/8-bit run checks 12,582,912 padded operand rows across three ticks. Native preparation takes 57.012 ms and the combined raw operand/boundary/staged verification phase takes 122.602 ms in that single retained run. These timings do **not** include a cryptographic proof, commitment, LDE, FRI or validator verification. They are neither repeated throughput measurements nor a full-race proving estimate.

The runner separately models 1/4/16/64 independent gate lanes with complete table, gate, membership, public/terminal-boundary and padding costs. Under its **unimplemented** same-domain B=16/96-query construction, the smallest eight-car one-tick packed base/auxiliary/quotient matrix among the tested configurations is **10.125 GiB** for 12-bit limbs and 16 lanes. Storing all those columns as the current PCS's Fp4 matrices raises this to **14.4375 GiB**. Fixed-polynomial storage, Merkle trees, scratch buffers and authentication between shards remain additional costs. Sixteen-bit limbs require a 65,536-row range-table domain and can lose despite fewer raw scalar values. All eight-car/8-bit 9,000-tick projections exceed Goldilocks' two-adic domain. These are cost-model findings, not allocated matrices, actual proof sizes or chosen security parameters.

## Reverified and newly relevant research

### Shout is the relevant read-only argument; Twist is a separate capability

The inspected [Twist and Shout ePrint record](https://eprint.iacr.org/2025/105) still lists February 27, 2025 as its latest revision and labels that manuscript a preprint. However, [Microsoft's author publication record](https://www.microsoft.com/en-us/research/publication/twist-and-shout-faster-memory-checking-arguments-via-one-hot/) identifies a **CRYPTO 2026 publication**, includes Michael Zhu alongside Setty and Thaler, and describes end-to-end RV32IM comparisons against earlier Spice/Lasso-based Jolt. The older ePrint metadata must not override that publication status. Shout handles reads; Twist adds writes. The ePrint's corrected local-Twist/Booleanity cost analysis and Shout-based non-uniform constraint constructions remain useful, but its older estimates are distinct from the published benchmark claims. None measures this game; efficient sparse commitments remain a premise.

The [current Jolt RAM documentation](https://jolt.a16zcrypto.com/how/architecture/ram.html), inspected September 8, describes additional no-operation Hamming checks and reductions from virtual address polynomials to committed factors. It explicitly notes deviations from the paper. The [PCS documentation](https://jolt.a16zcrypto.com/how/appendix/pcs.html) identifies Dory. Thus an implementation reference exists, but its algebraic checks cannot be detached from its opening mechanism, nor can its costs be transferred to native Goldilocks/Fp4 and Merkle/FRI. These undated pages establish an access-time state, not a newly dated September release.

**Local inference:** our mandatory value table has immutable compiler-selected addresses; it has no mutable RAM write history. Start with read-only claims. Address maps are public but potentially large: their multilinear evaluations are not free merely because the verifier knows the compiled graph. Count preprocessing, committed fixed data, evaluation work and its amortization. Preserve every range, ROM, disconnected equation and output alias when replacing explicit operand copies.

### Logup* provides a hash-based route, with additional reductions to implement

[Logup*](https://eprint.iacr.org/2025/946) was received May 24, 2025 and remains an informal preprint in the inspected record. It avoids additional commitments whose length equals the indexing array, trading them for table-sized objects and checked virtual evaluations. The [October 30, 2025 Powdr manuscript](https://www.powdr.org/papers/twist_shout_logup_star.pdf) adapts one-hot addressing to hash-based commitments through a pushforward construction. Its opening protocol reduces virtual matrix evaluations through GKR and then authenticates both pushforward and dense-index claims with polynomial commitments. The pushforward subprotocol delegates details to Logup*. The note supplies an architectural bridge, not a released, fully qualified native implementation.

**Local inference:** range tables and 1,403-row geometry columns deserve the first comparison, but the operand table is different: eight-car/8-bit has 340,566 values and about five core reads per value. A small-table/many-query speedup cannot simply be copied into that regime. Compare table-sized extension-field commitments, total virtual-evaluation work, public address evaluation and all commitment openings against the explicitly committed read-copy design. The compiler already determines multiplicities; introducing general witness-dependent memory merely to resemble a VM would add obligations we do not need.

### Lasso remains useful foundational work, not a new 2026 release

The inspected [Lasso record](https://eprint.iacr.org/2023/1216) still has its August 2023 receipt/approval dates. Its structured-table treatment and strengthened sparse-metadata analysis remain relevant. Structured range/bitwise tables can have compact evaluation procedures; arbitrary sampled road geometry does not gain such a procedure automatically. Its efficient small-value commitment accounting depends on the selected PCS.

**Local inference:** preserve a distinction between range predicates, arbitrary fixed road columns and witness-valued operand tables. They need not share one physical trace domain. A heterogeneous proof requires authenticated cross-domain reductions; simply giving each table its own root leaves the relation incomplete.

### GAPP: a 2026 full revision and publication, with a different commitment model

[GAPP's ePrint record](https://eprint.iacr.org/2024/1685) identifies a June 13, 2026 full revision and CRYPTO 2026 publication, following October 16, 2024 receipt. It packs polynomial-protocol instances into bivariate relations and develops tuple-lookup and non-uniform computation applications. The current ePrint abstract gives logarithmic verification in the instance count; [IBM's August 17 conference page](https://research.ibm.com/publications/gapp-generic-aggregation-of-polynomial-protocols) still describes squared-logarithmic verification. Those versions should not be silently merged. The [paper](https://eprint.iacr.org/2024/1685.pdf) instantiates its framework with bPCLB, bilinear groups and KZG; its displayed model uses an algebraic-group adversary and a structured reference string. A generic polynomial-protocol formulation does not make this concrete instance transparent or post-quantum.

**Local inference:** its packing and non-uniform relation ideas are useful comparison points for avoiding uniform padding and repeatedly proving expensive components. A hash-based bivariate instantiation would be new work with new costs and security arguments. GAPP does not supply a ready aggregation step for our unqualified Street proofs, and aggregation cannot repair a missing core predicate or authenticate an unbound shard boundary.

### New 2026 sumcheck evidence has a closer implementation-level connection

[Speeding Up Sum-Check Proving, extended version](https://eprint.iacr.org/2026/587), received March 24, 2026, combines and extends earlier work. It develops high-degree product, small-value/streaming and equality-polynomial techniques. The [author-hosted manuscript](https://cs.nyu.edu/~zd2131/papers/26-587.pdf), Sections 8–9, evaluates BN254 on an Apple M4 Max with 12 performance cores and 64 GB RAM. Table 12 reports approximately 1.7–2.2× improvements for Shout's address-virtualization component, not the entire proof. Its memory evaluation distinguishes process peak RSS from setup-normalized incremental RSS and retained-object measurements. That distinction matters when comparing an alleged streaming prover with a process already holding its trace.

**Local inference:** Goldilocks values inside Fp4 create a relevant small-subfield setting, but every observed gain needs remeasurement with our native basis and arithmetic kernels. Canonical encodings of negative integers and unrestricted auxiliary field elements are not all small positive integers. A delayed-reduction implementation must retain explicit accumulator envelopes; substituting machine overflow for field arithmetic would alter the computation. This work complements a compact relation and bounded-memory PCS; it does not remove commitment costs by itself.

The still-current [Proving CPU Executions in Small Space preprint](https://eprint.iacr.org/2025/611), received April 3, 2025, further motivates non-recursive low-memory proving. It concerns Jolt's structure and prospective runtime overhead, so it is a source of techniques rather than permission to adopt its VM or claim our raw streaming checker is a streaming prover.

## Decision supported by the update

The bounded raw operand work is useful as a semantic oracle and exact occurrence census. It does not justify scaling its four-column serialization directly into a monolithic full-race STARK. The next proof-layout comparison should preserve that census while measuring:

1. A direct sparse constraint representation with virtual read evaluations, including static compiler-address evaluation costs.
2. Separate range, geometry and witness-value tables with complete authenticated interactions and their actual PCS commitments.
3. A bounded-memory sumcheck/commitment pipeline, accounting for all retained state, preprocessing, I/O and repeated passes.
4. Exact composed soundness for the resulting protocol. No curve/PCS benchmark, extension-field size or paper's nominal parameter setting supplies 128-bit security for Iroha.

These are engineering deductions from the local measurements and cited constructions. They do not select a new production backend, weaken integer semantics, enable live XOR/NFT settlement, or complete the full SORA CARS goal.
