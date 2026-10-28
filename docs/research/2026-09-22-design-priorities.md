# September 2026 cryptography: decisions for Iroha games

Selected primary sources checked through **September 22, 2026**. This is a focused
verifiable-computation study for native Iroha and SORA CARS. The
[full briefing](september-2026-briefing.md) contains the wider survey and detailed
paper/source reviews. External benchmark results and formal proofs have not been
independently reproduced. The priorities below are engineering judgments.

**Prioritize complete-history accumulation and authenticated lookups.** Keep the
game relation separate from generic ledger execution and settlement facilities.
These techniques can be implemented in native Rust without adopting an external
zkVM. Preserve the complete simulation and accepted-input statement in every
comparison.

| Direction | Evidence available by the cutoff | Decision |
| --- | --- | --- |
| Accumulation: FACS and WARP | [FACS](https://eprint.iacr.org/2025/737) is published at CRYPTO 2026, with a May 20 revision. [WARP](https://eprint.iacr.org/2025/753) has a June 18 major revision of its TCC 2025 publication. Both target linear prover work per update; their verifier/query bounds and constructions differ. | First scaling experiment for many ordered transitions. Measure the final decision, retained accumulator, input authentication and state continuity as well as update cost. A small accumulator is not by itself a verified race result. |
| Memory and lookups: Twist/Shout | [CRYPTO 2026 publication](https://www.microsoft.com/en-us/research/publication/twist-and-shout-faster-memory-checking-arguments-via-one-hot/) distinguishes read/write Twist from read-only Shout. | Compare Shout-style immutable track/operand reads and range checks. Authenticate table commitments, indices and every lookup occurrence. Include sparse commitment and opening costs. |
| Concrete FRI/WHIR bounds: DKT26 | [September 16 submission, approved September 17](https://eprint.iacr.org/2026/2056) gives quantitative Reed–Solomon list-decoding and agreement bounds. Its beyond-Johnson results require sufficiently large characteristic. | Recalculate the exact finite-domain security budget. Fp4 increases field size but leaves Goldilocks' characteristic unchanged. No query-count reduction follows before all conditions and composition terms are checked. |
| Commitment alternatives: LiftWHIR and Akita | [LiftWHIR's August 28 revision](https://eprint.iacr.org/2026/1561) reports 1.55–1.61× commitment-plus-proving gains in its 255-bit-field experiment, with larger proofs and slower verification. [Akita's September 18 revision](https://eprint.iacr.org/2026/1983) reports 61–72 KB polynomial-opening proofs under Module-SIS. | Compare complete commitments and openings on the same workload. Akita needs a supported field/ring embedding and a separate assumptions review; its published opening sizes are not full-race proof sizes. |

BinarySpartan/Binius64, Limber, SuperNeo and Maltese remain separate research
comparators. Their bit/integer arithmetic, field embeddings, commitments and
security models are not interchangeable with the present Goldilocks/Fp4 system.
The [Limber](2026-09-22-limber-native-fit.md),
[Akita](2026-09-22-akita-native-fit.md) and
[Maltese](2026-09-22-maltese-native-fit.md) reviews document concrete admission gaps.

The most immediate security lesson is **bind the actual generated relation and
public statement before deriving challenges**. Fenzi's
[September 9 revision](https://eprint.iacr.org/2026/1838) formalizes this mitigation
for the affected generated-statement setting, conditional on the underlying
protocol's security. Compiler identity alone is insufficient there. Canonical
transcript framing and fixed hash parameters remain separate obligations.

September's upstream implementation work also supplies practical review cases:
authenticated memory reductions, malformed optional openings, Merkle-cap shape
validation and scalar/ARM field parity. The
[implementation review](2026-09-22-late-implementation-delta.md) and
[verifier review](2026-09-22-coding-and-verifier-delta.md) distinguish source-read
commits from tested native changes. In particular, standalone memory leaf claims
still need commitment authentication; the inspected generic memory handle does
not accept Goldilocks on 64-bit targets.

For qualification, compare zero-motion, collision-heavy short histories and full
2–8-player races with identical semantics. Record relation construction, proving,
final verification, peak process memory, complete transport bytes and validator
cost separately. Require the combined error budget to meet the stated 128-bit
target; a component parameter named `128` is not sufficient. Wallet signatures,
input-key authorization and ledger finality must also remain authenticated.

Post-quantum authentication is a distinct workstream. [NIST's current status](https://csrc.nist.gov/projects/post-quantum-cryptography)
lists ML-KEM, ML-DSA and SLH-DSA as finalized, with Falcon and HQC standardization
ongoing. A post-quantum proof backend alone would not migrate wallet or validator
keys. This study does not select new production parameters or qualify live stakes.
