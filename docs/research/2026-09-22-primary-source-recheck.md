# Primary-source recheck — September 22, 2026

This is a targeted update to the September briefing, not an exhaustive new survey
or an independent cryptographic review. No native cryptographic parameter or
admitted profile changes follow from this source check.

- [Fenzi, generated-R1CS Fiat–Shamir limitations](https://eprint.iacr.org/2026/1838)
  now lists a September 9 revision (received August 31). Its mitigation binds the
  actual generated statement before the first challenge, under the underlying
  protocol's security premise. This reinforces the existing native requirement
  to bind complete emitted relations, rather than compiler code identity alone.
- [Midpoint Reset](https://eprint.iacr.org/2026/1760) remains the August 21/22
  preprint. It constructs a full-round original-Poseidon collision with a linear
  layer selected after fixed round constants. It does not establish a collision
  in the pinned native Goldilocks/Poseidon2 instance. Parameter provenance and
  restrictions on profile registration remain necessary.
- The official [Plonky3 challenger advisory](https://github.com/Plonky3/Plonky3/security/advisories/GHSA-vj64-rjf3-w3v7)
  lists fixes in 0.4.3 and 0.5.3. Its absorption-length ambiguity, dropped digest
  bits and challenge-conversion issues remain concrete transcript test patterns.
  This is not evidence that Iroha imports the affected challenger.
- [Jeronimo, Reed–Solomon list decoding/proximity](https://eccc.weizmann.ac.il/report/2026/169/)
  retains the September 6 publication and asymptotic field/block-length/slack
  conditions. These must be instantiated in a concrete composition argument;
  the result alone does not authorize fewer native FRI queries.


## Newly checked September 11–19 directions

[Akita](https://eprint.iacr.org/2026/1983) was received September 11 and revised
September 18. The authors report Module-SIS security, setup offloading that yields
verification around N^(1/K) for fixed K, and 61–72 KB PCS proofs in their benchmark
suite. The polynomial itself still occupies memory; their extra prover memory
is sublinear. These are author results, not reproduced Iroha measurements or
full-race proof sizes. The [author Rust implementation](https://github.com/LayerZero-Labs/akita)
provides a concrete candidate for a separate native PCS comparison, without
adopting its Jolt zkVM integration. The complete paper security argument and
native Goldilocks/Fp4 embedding still require review.

The [pinned implementation review](2026-09-22-akita-native-fit.md) identifies a
concrete integration gap: the shipped 32-, 64- and 128-bit primes differ from
Goldilocks. The paper proves classical-ROM knowledge soundness; its quantum-ROM
proof is future work. A lattice estimator's quantum-security target is a separate
claim. The review pins author source to September 21 and distinguishes that code
from the paper's benchmark artifact.

[Maltese](https://eprint.iacr.org/2026/2067) was received September 17 and approved
September 19; the primary page lists ASIACRYPT 2026 publication. It combines an
Ajtai-hash Merkle commitment with folding and sumcheck reductions controlling
norm growth. The authors claim standard Module-SIS security and polylogarithmic
verification. The [paper's §6, Figures 5–6](https://eprint.iacr.org/2026/2067.pdf)
compute a 335 KB opening for a multilinear polynomial of size 2^30; this is size
accounting, not an end-to-end measured SNARK. Its P3 parameters have a 124-bit
challenge-set size, despite a 240-bit MSIS estimate. The authors explicitly leave
the full concrete security bound for the composition unreported, so those
parameters do not establish our 128-bit target. It remains a research comparator;
these reported numbers cannot be ranked against Akita without matching fields,
security targets, setup accounting and workloads.

Footnote 6 also identifies a norm-decomposition batching error that grows with
the decomposed tree size and proposes an alternative check. That proposed
change must not be credited as the implemented or proved concrete parameter
bound. A native experiment needs this security accounting resolved first.
The [detailed Maltese review](2026-09-22-maltese-native-fit.md) pins the paper,
explains the incompatible Goldilocks modulus condition and separates estimated
setup storage from measured process memory. No primary implementation was found
in the sources checked.

My design inference is to add both to the existing hash-based/FACS/WARP
comparison, keeping the same complete native statement and final-decision cost.
Neither a PCS substitution nor smaller per-segment proofs alone establishes
compact whole-race settlement. No production backend or dependency is selected.

## Decisions for native Iroha

The priorities below are engineering judgments from the sources, not claims that
their authors evaluated Iroha or that the full constructions compose unchanged.

| Priority | Candidate | Purpose and required comparison |
| --- | --- | --- |
| 1 | [FACS](https://eprint.iacr.org/2025/737), [WARP](https://eprint.iacr.org/2025/753), with [SuperNeo](https://eprint.iacr.org/2026/242) as a separate lattice alternative | Accumulate ordered game transitions. Include authenticated inputs, state continuity, accumulator storage and the final decision procedure. |
| 2 | [Twist/Shout](https://www.microsoft.com/en-us/research/publication/twist-and-shout-faster-memory-checking-arguments-via-one-hot/) | Reduce the cost of immutable track and range lookups. Preserve every lookup occurrence, index bound and table commitment. |
| 3 | Akita, Maltese and [LiftWHIR](https://eprint.iacr.org/2026/1561) | Compare commitment layers on the same complete relation. Include setup/preprocessing, polynomial storage, all openings, proof bytes and validator work. |
| 4 | [BinarySpartan](https://eprint.iacr.org/2026/1656), [Limber](https://eprint.iacr.org/2026/1635) | Separate experiments for bit operations and integer arithmetic. Hash throughput and RSA benchmarks do not predict signed fixed-point driving costs. |

Use a native Rust experiment with the existing computation semantics. Compare
zero-motion, short collision-heavy and complete-duration histories at 2 and 8
players, recording relation construction, proving, verification, peak process
memory and final transport size separately. Keep the same accepted-history and
finalized-record checks across candidates. An unsupported field embedding or an
unaccounted security term fails admission; it does not justify silently weakening
the relation or its target.

The immediate security lessons are complete generated-statement binding before
challenges, canonical transcript framing and fixed hash-parameter provenance.
The 128-bit target must cover the composed execution argument. In parallel,
wallet/input signatures and finality certificates need their own authentication
analysis: [NIST's current status](https://csrc.nist.gov/projects/post-quantum-cryptography)
lists ML-KEM, ML-DSA and SLH-DSA as finalized, with Falcon and HQC standardization
ongoing. A post-quantum proof construction does not itself migrate those keys.

One apparent September result was a metadata false lead: the publisher dates
[Fold-DCS](https://cic.iacr.org/p/2/1/15) to April 8, 2025. Its divide-and-conquer
sumcheck remains relevant background, but it is not a newly published September
2026 advance.

The research tool could open the primary pages above directly (some required following the author’s publication link). Its current-week
archive request was blocked, and broad searches also returned stale or incorrectly dated results;
therefore this check establishes no claim that every September 10–22 development
has been covered. Earlier dated source findings remain in the
[September briefing](september-2026-briefing.md).

Current implementation progress concerns native memory ownership and transport:
complete witness recipes with checked local reservations, and canonical frame
streaming without a second output-sized encoded buffer. Neither is a new proof
construction or a qualification of full-race performance or composed 128-bit
soundness. Whole-history accumulation, final decision cost and complete
security accounting remain necessary.
