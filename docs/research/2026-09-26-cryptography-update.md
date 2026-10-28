# Cryptography review through September 26, 2026

This updates the [September briefing](september-2026-briefing.md) for native
Iroha games. The cutoff is September 26, 2026. The focus is verifiable computation,
proof compression, soundness and authentication. This is a selected primary-source
review, not an exhaustive survey or an independent cryptographic audit. External
benchmarks have not been reproduced.

**The new priorities are to compare BitZ for integer-heavy computation and
ReedWeave for commitment cost, alongside the existing accumulation and lookup
work.** This is an engineering judgment. None of these results alone qualifies
a complete race proof or changes an admitted Iroha profile.

## What changed late in September

**BitZ, submitted September 21, revised September 25.** BitZ commits to packed bits
while proving evaluations over other rings, and builds an integer-constraint
SNARK using fingerprinting. This makes it a strong comparator for mixed integer
physics and hash computations. However, its Table 1 and section 7 benchmarks
target **100-bit round-by-round knowledge soundness**, except the combined RSA
exponentiation/Poseidon comparison with Limber at 114 bits. Appendix A discusses
separate 128-bit round-by-round configurations and grinding;
the headline timings do not measure those configurations. That target still
needs a reduction to the complete deployed protocol's security. The implementation
does not currently provide zero knowledge. Public racing replays do not require
witness secrecy, but still need complete execution soundness. For bulk hashing,
the authors explicitly favor Flock or Binius64; BitZ's strongest fit here is mixed
integer computation. Its integer
multiplication benchmarks do not establish signed division, rounding, collision
ordering or race-state semantics. [Paper, sections 7 and A](https://eprint.iacr.org/2026/2141.pdf).

**ReedWeave, submitted September 22, revised September 24.** This combines
interleaving with an initial high-arity fold to reduce Reed-Solomon encoding and
opening costs. Its Rust benchmark uses Goldilocks, BLAKE3, 32 threads and a
**100-bit target**. At size `2^24`, rate `1/4`, the DEEP variant reports 475 ms
commitment, about 112 ms opening, 2.07 ms verification and 594.7 KiB. Table 2's
WHIR comparator is 232.2 KiB and verifies in 1.95 ms, so the new construction is
neither uniformly smaller nor faster to verify.
Moreover, WHIR proves a multilinear evaluation while ReedWeave proves a
univariate evaluation. Our native multilinear relation needs the conversion and
all its costs included. It merits a matched comparison with WHIR/LiftWHIR;
the published speed ratios are not Iroha speedups. [Paper, section 5 and Table 2](https://eprint.iacr.org/2026/2147.pdf).

**LaBinius, submitted September 18, approved September 22.** It separates lattice
commitment arithmetic from binary-field evaluation, with an optional LaBRADOR
compressor. The author's implementation reports hash-workload results on one
AVX-512 core at a 100-bit target. The compact result includes a compressor with
its own verification and security costs. Treat this as a binary/hash-workload
comparator: lattice assumptions, field conversion and supported CPU targets
require separate work. Neither an x86 hash benchmark nor a sub-100-KiB hash proof
establishes a portable full-race prover. [Primary paper](https://eprint.iacr.org/2026/2103),
[author's benchmark description](https://www.osdnk.me/blog/labinius).

**Accordion, submitted September 22, revised September 25.** Its main construction
batches independent instances using algebraic folding, followed by a Plonk/KZG
decider. The measured main fold is one-shot; Appendix C separately addresses
refolding. It therefore cannot simply replace an ordered-history accumulator.
The benchmark repository excludes setup/key generation and reports memory growing
with batch size. Study its batch/decider split, but account for state continuity,
the concrete setup assumptions and total retained memory. Its reported gains over
Plonk do not compare against our native transparent prover. [Paper](https://eprint.iacr.org/2026/2160),
[pinned benchmark methodology](https://github.com/davidbalbas/midnight-zk/blob/f021bb2e0587c2e9b93cff370e51cd0adf3e41bd/aggregation/scripts/README.md).

**Mist, submitted September 19, approved September 22.** This transparent
class-group PCS reports very short openings. Section 7.3 distinguishes a
1,312-byte weak/random-point opening from the 1,472-byte full adaptive-point
argument at `lambda = 128` with a 256-bit polynomial field modulus `q`.
These are calculated communication
sizes, not complete prover benchmarks. The class-group and extraction
assumptions require their own review. This is a commitment-layer comparator,
not a complete execution proof, a proven quantum-safe replacement, or evidence
that our ledger payload will be that size. [Paper](https://eprint.iacr.org/2026/2112).

**Flare/EA codes, revised September 23.** The paper supplies distance guarantees
for exact-weight expand-accumulate codes over sufficiently large fields and a
code-switching PCS. Its abstract's representative circuit proof is about 16 MiB.
That workload differs from ours, but the result does not presently demonstrate
our compact transport objective. Keep the coding technique on the research list,
behind the closer native comparisons. [Primary record](https://eprint.iacr.org/2026/1782).

**Simplified FRI analysis, archive revision September 25.** The retrieved PDF is
dated **August 25** and identifies itself as the TCC 2026 full version. These dates
must not be conflated. Theorem 5.2 separates folding errors, conditional on the
appropriate mutual-correlated-agreement property, from query error. Use this and
DKT26 to map the actual native challenge schedule to finite bounds. Neither paper
automatically certifies our parameters; the FRI paper's section 5.5 explicitly
says its simplified analysis does not improve the soundness error.
[FRI record and changelog](https://eprint.iacr.org/2025/1993),
[DKT26](https://eprint.iacr.org/2026/2056).

## Earlier 2026 advances that remain central

| Direction | Relevance to Iroha games | Next comparison |
| --- | --- | --- |
| [FACS, CRYPTO 2026](https://eprint.iacr.org/2025/737), [WARP, June revision](https://eprint.iacr.org/2025/753) | Accumulation addresses repeated execution steps. | Include update work, input authentication, state continuity, retained accumulator and final decision cost. |
| [Twist/Shout, CRYPTO 2026](https://www.microsoft.com/en-us/research/publication/twist-and-shout-faster-memory-checking-arguments-via-one-hot/) | Read-only Shout fits immutable geometry and operand lookups; Twist covers writes. | Authenticate table contents, addresses and every read, including openings. No external VM is needed. |
| [DKT26, September](https://eprint.iacr.org/2026/2056) | Concrete Reed-Solomon agreement bounds may improve parameter selection. Its improved above-Johnson bound works in every characteristic; its beyond-Johnson results require sufficiently large characteristic. | Check the exact theorem, finite domain and characteristic premises. Fp4 increases cardinality, not Goldilocks' characteristic. |
| [SuperNeo, September revision](https://eprint.iacr.org/2026/242) | A lattice-based folding alternative supporting small fields and their extensions. | Account for embeddings, norm bounds, commitments and final decision under the changed assumptions. |
| [Packed Sumcheck, September 14 revision; ASIACRYPT 2026](https://eprint.iacr.org/2025/719) | Couples repeated sumchecks with random matrix challenges to avoid extension-field multiplication. | A secondary arithmetic comparator. It needs matrix-weighted multilinear commitments; independent coordinate repetitions inside unchanged WHIR do not implement its construction. |
| [Limber, August revision](https://eprint.iacr.org/2026/1635) | Integer fingerprinting is relevant to fixed-point arithmetic. | Compare with BitZ after satisfying the exact field/range conditions recorded in the [native-fit review](2026-09-22-limber-native-fit.md). |

## Security lessons with immediate implementation value

Bind the **actual compiled relation and public statement before challenges**.
Fenzi's generated-statement result formalizes this mitigation for its affected
protocol class; hashing generator code alone is insufficient there. This is
particularly relevant to reusable game computations. [September revision](https://eprint.iacr.org/2026/1838).

Recent Plonky3 source changes provide useful adversarial cases, not evidence of
an Iroha vulnerability. September 25's WHIR change rejects an otherwise unused
final-sumcheck section when no closing rounds exist. September 23's verified
segment API explicitly leaves program/preprocessed-key pinning to the caller.
Native tests should reject inactive payloads and bind the full immutable program,
even when segment boundaries match. [Canonicality fix](https://github.com/Plonky3/Plonky3/commit/eaa1919887e417c20bb2ef99741a547d30bc5287),
[segment API](https://github.com/Plonky3/Plonky3/commit/0b926a5d6460c52bdc907402aab8f66a0e78ad96).

A [bounded native source audit](../../tmp/native-september-canonicality-review-work/review.md)
found no corresponding gap in the inspected Street path. Its fixed WHIR schedule
has no optional closing-sumcheck field, and parsing consumes each complete opening.
The binding includes actual operand equations, every immutable table entry,
public claims, accepted history and the segment partition before challenges.
Existing adversarial test bodies were inspected; this source review did not run
them or establish the complete protocol's soundness.

An upstream example described as targeting 128 bits actually asserts only
`>127.99` for its composed bound after a 128-bit hash cap. That distinction matters
for our literal **at least 128 bits** requirement. A component named `128`, a
large extension field, or a headline target does not establish the complete
security claim. [Exact example change](https://github.com/Plonky3/Plonky3/commit/b2adb8d60fdf1f6076a338d0ec18c1d3643cf231).

There is also a concrete native accounting issue. Iroha's
[`Hash::prehashed`](../../../iroha-sora-cars-native/crates/iroha_crypto/src/hash.rs)
forces one bit of its 32-byte digest to one, leaving 255 variable bits. An ideal
hash with that output space has a generic birthday-collision scale of
`2^127.5`, before any composition losses. The current
[accepted-history binding](../../../iroha-sora-cars-native/crates/iroha_core/src/execution_proofs/guarded/accepted_history.rs)
uses this type for record and evidence commitments. This source observation is
not a demonstrated attack, but these commitments cannot be credited with a
full 128-bit collision budget simply because they occupy 32 bytes. Hashing only
those digests into a wider execution digest cannot recover lost binding strength.
Execution-specific commitments to the complete bounded canonical inputs need
their own domain, output width and composed analysis; changing the general ledger
hash type is a separate decision. Neither has been qualified by this study.

For authentication, NIST still lists ML-KEM, ML-DSA and SLH-DSA as finalized,
with Falcon and HQC standardization ongoing. Proof-backend quantum resistance
would not migrate wallet, gameplay or consensus keys. [NIST status](https://csrc.nist.gov/projects/post-quantum-cryptography).

The wider [security review](crypto-2026-security.md) remains part of this
September assessment. **Poseidon2 needs analysis of the exact deployed instance.**
The 2026 *Skipping Class* and nonlinear-subspace papers strengthen algebraic
attack models. Neither establishes a break of our native instance. In particular,
the nonlinear-subspace paper's numerical table uses a different full-round count
and exponent; its headline cannot be converted into a native security level.
Review field, width, exponent, matrices, constants, round schedule, sponge mode,
capacity and output together before accepting the composed target.
[Skipping Class](https://eprint.iacr.org/2026/306),
[nonlinear-subspace analysis](https://eprint.iacr.org/2026/1792).

**Proof composition is a separate obligation from correct arithmetic.** The
June 2026 functional-commitment result requires state-restoration security and
state-restoration function binding for its Fiat–Shamir composition theorem.
Ordinary commitment binding does not satisfy that premise by itself. The
native staged openings and any replacement accumulator need an explicit mapping
to an applicable theorem and its finite reduction losses.
[CRYPTO 2026 paper](https://eprint.iacr.org/2025/902).

**Recent cryptanalysis does not justify treating all lattice schemes alike.**
NIST confirms HAWK's withdrawal following the July 28 vulnerability disclosure
and explicitly distinguishes its finalized standards. Separately, the August
DCP algorithm claim has a September 1 revised refutation with linked Lean code;
it is not established evidence that ML-KEM or ML-DSA is broken. This review did
not reproduce either quantum analysis or run that Lean development. NIST's
July 31 FIPS 204 planning note also lists minor potential corrections to track
when implementing ML-DSA.
[NIST HAWK notice](https://www.nist.gov/pqc),
[DCP claim](https://eprint.iacr.org/2026/1591),
[refutation](https://eprint.iacr.org/2026/1693),
[FIPS 204 status](https://csrc.nist.gov/pubs/fips/204/final).

## Resulting implementation priorities

1. Preserve one complete native semantic benchmark across every experiment:
   accepted inputs, signed bounds, collision order, checkpoints, forfeits,
   terminal ranking, replay commitments and ledger binding.
2. Prioritize FACS/WARP history accumulation and authenticated lookups. Add BitZ
   as the leading new integer/mixed-arithmetic comparator; retain a complete
   128-bit composition argument as an admission requirement.
3. Compare ReedWeave and WHIR/LiftWHIR with the same opening relation, security
   target, hardware and thread count. Measure relation preparation, proving,
   final verification, all serialized bytes and whole-process peak memory.
4. Keep binary, lattice and class-group alternatives separately specified until
   their complete costs and assumptions justify selection. Implement reusable
   native Rust computation facilities behind generic game ISIs.
5. Qualify full-duration 2- and 8-player races and adversarial rejection before
   enabling staked settlement. The [earlier 123-test native gate](../native-street-owned-sequence.md)
   passed, but its moving public proof covers only six ticks with two cars.
   The subsequent verifier-resource qualification passed its 119 selected tests;
   neither run establishes full-race performance or the composed security target.

This study changes the research comparison priorities. It does not select new
production parameters, reproduce external benchmarks or complete the wider game
implementation goal.

## First native experiment

The [implementation handoff](../../tmp/native-complete-history-accumulation-design/NEXT_PATCH.md)
first measures the existing complete proof path. Source inspection shows repeated
two-oracle proving and verification per segment; it does not establish which
phase dominates runtime. The retained eight-car, two-tick compiler census implies
768 MiB for six dense factor tables, which is an allocation calculation rather
than measured process memory. The [cost inventory](../../tmp/native-complete-history-accumulation-design/cost-evidence.json)
keeps those observations separate from timing and proof generation.

The subsequent [accumulation proposal](../../tmp/native-complete-history-accumulation-design/experiment.md)
preserves both phased commitment obligations and requires a complete final
decision plus authentication of every update. Batching openings alone leaves
linear outer transcripts; compact full-history transport requires additional
work. The native Base/Fp4 reduction remains a mathematical prerequisite. An
[independent source review](../../tmp/native-complete-history-accumulation-independent-review/review.md)
also clarified that comparison arms must use the same newly compiled source
identity. Changed identities require fresh fixtures; historical IDs must never
be substituted to force byte equality. No accumulator has been implemented.

A subsequent [native subfield review](../../tmp/native-base-subfield-review-work/review.md)
establishes one conditional algebraic step: a polynomial of degree below `k`
over an extension field has base-field coefficients if it takes base-field
values at `k` distinct base-field points. The inspected initial code geometry
has `n = 16k`, so the required actual agreement is at least `1/16` of the
domain. This is not an inference from the number of opened leaves. A complete
extraction argument must still establish low degree and that agreement with
the original committed word. The review also shows why extension-field folds
cannot retain the Base encoding merely because their inputs were base-valued.
An [independent root check](../../tmp/native-base-subfield-review-work/root-review.json)
confirms the lemma and source mapping; no native parameter or verifier changed.

The first measurement step now has a [revised native candidate](../../tmp/native-membership-cost-meter-v2-work/HANDOFF.md).
It times witness construction, relation compilation, commitments, sumcheck,
openings and verification on the same complete six-motion input for two and
eight participants. Its comparison requires identical proofs and receipts with
and without instrumentation, under the same newly compiled identity. An
[independent review](../../tmp/native-membership-cost-meter-independent-review/review.md)
corrected a failure-classification defect so malformed inputs cannot count as
resource exhaustion. A subsequent source check caught a missing Norito enum tag
in the diagnostic phase serializer. The revised candidate supplies the required
tag/content representation and a regression covering all 20 phase variants;
the report validator requires that exact representation. These checks are not
native compilation evidence. Following the completed CLI qualification and real SDK
fixture staging, the reviewed measurement runner was dispatched on September 26.
Its [retained report](../../output/qualification/native-membership-cost-attempt-1/report.json)
records a passed production Core check followed by a failed diagnostic test build:
Norito cannot serialize the diagnostic's `[usize; 3]` field. No proof measurement
ran. A [one-file diagnostic recovery](../../tmp/native-membership-cost-recovery-work/HANDOFF.md)
uses a numeric vector at that boundary and tests the complete serialized report;
it also corrects the diagnostic reader to require Norito's canonical uppercase
hexadecimal digests. The recovery preserves the failed evidence and does not
change production admission or proof parameters. After an independent read-only
evidence check, the recovery was [dispatched](../../output/qualification/native-membership-cost-attempt-2-dispatch/dispatch.json)
on September 26. The [second terminal report](../../output/qualification/native-membership-cost-attempt-2/report.json)
also passed production Core and codec checks, then failed at two `norito::json!`
expressions in the new regression. No diagnostic test or proof measurement ran.
A [seven-expression syntax correction](../../tmp/native-membership-cost-json-recovery-work/candidate.patch)
is prepared. Root independently compiled the exact corrected JSON bodies against
the actual Norito library, but that metadata-only probe is not the native proof
test. The [root review](../../output/qualification/native-membership-cost-json-recovery-root-review.json)
retains the failed source and evidence chain. The correction's reviewed owner was
[dispatched](../../output/qualification/native-membership-cost-attempt-3-dispatch/dispatch.json)
after the browser run closed. Attempt 3 passed production/release compilation,
five diagnostic tests and the two-car proof, then its report reader incorrectly
compared a checked Hash literal with bare hex representing the same bytes.
That failed report is preserved. On September 28 a strict representation reader
and reviewed successor admitted the retained result and ran only the missing
eight-car case from the same release binary. Both completed with identical
metered/unmetered proof bytes. The
[independent terminal review](../../tmp/native-membership-cost-resume-1-terminal-review/review.md)
checked 4,096 referenced files, source identity, exact native exits and reaping.

The two/eight-car six-tick proofs are 2,794,616 / 4,009,410 bytes; instrumented
bundle times are 123.151 / 806.147 seconds, and independent bundle verification
is 38.914 / 243.793 seconds. Whole-child peak RSS is 431,865,856 /
2,229,370,880 bytes. Initial commitments dominate openings in these observations,
which makes commitment implementation the first optimization experiment.
The timers include nested phases and cannot be summed as independent costs.
A 146.462-second Node UI test overlapped the eight-car run; no isolated benchmark,
instrumentation speedup, or clean two-versus-eight timing comparison is claimed.
Both cases remain short fixtures under an unregistered Street implementation,
not evidence of full-race performance, funded settlement or composed security.

The direct-record binding finding also has a coordinated
[native candidate](../../tmp/native-complete-record-binding-work/README.md):
the public statement gains six canonical Goldilocks limbs computed directly from
the complete bounded record bytes under a separate execution domain. Prover
requests carry that full record, and ledger verification derives it from current
consensus state. This avoids widening only an already truncated record hash.
Combined V3's native callers and SDK codecs were applied on September 28 after
the baseline owner closed. Its 1,172-source preflight passed; focused native
qualification is running, and fresh fixtures/browser qualification remain open.
This is neither a migration of every other Hash commitment nor
a 128-bit composition result. Browser code currently validates the claimed
binding's encoding but cannot compute the native execution digest; its UI must
continue to distinguish local consistency checks from native verification.

A September 28 [dispatch and mode review](../../tmp/execution384-security-premises-work/analysis.md)
confirmed that current execution uses one Poseidon2 Goldilocks sponge with
width 16, rate 8 and capacity 8, with six output coordinates. The separate
six-lane helper remains in privacy/legacy paths and is not this execution
dispatch. Existing constants/KAT evidence establishes implementation provenance;
the exact-instance algebraic analysis, adaptive transcript model and complete
security composition remain open. A
[boundary inventory](../../tmp/native-marked-hash-boundaries-v1-review/review.md)
also separates direct Stock record binding from Street's still-narrow accepted
context and from signatures, input commitments and ledger inclusion. Wider
output at one boundary cannot repair an earlier narrow authentication step.

An [exact staged-opening reduction](../../tmp/native-staged-linear-reduction-review-work/reduction.md)
now specifies how the two native commitment banks' opening equations expand into
Goldilocks coordinates while retaining their original typed roots. This exposes
an important parameter cost: on the native base-field evaluation domain,
flattening the Fp4 Reed–Solomon code into scalar coordinates reduces its relative
distance by a factor of four. Equation
equivalence therefore cannot justify inheriting the original soundness estimate.
The proposed full-witness reference decider remains unimplemented; original-root
attachment, extraction, adaptive composition and compact history verification
still require a complete accumulation construction.

## Review evidence

The current ePrint weekly listing, selected records and four root-reviewed PDFs
are retained in [the source inventory](2026-09-26-source-index.json). Selected
BitZ benchmark/security pages and the ReedWeave benchmark table were also rendered
and visually checked. The review read selected constructions, parameter and
benchmark sections; it did not verify every theorem or rebuild formal proofs.
The inventory also links independent selected-paper and upstream-source notes.

A [second selected-source audit](../../tmp/crypto-2026-09-26-afternoon-review/review.md)
confirmed the main dates and benchmark caveats and added Packed Sumcheck's
September 14 revision. That audit retrieved a fresh DKT author PDF matching the
previous hash; BitZ/ReedWeave numerical checks used the retained pinned papers
after fresh ePrint PDF retrieval failed. The current overview carries forward
the earlier hash and authentication findings; it does not present them as newly
discovered attacks. The source inventory distinguishes these checks from an
exhaustive archive survey.
