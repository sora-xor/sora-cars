# Proof-security additions checked on 8 September 2026

The strongest additions to the [7 September soundness study](2026-09-proof-soundness.md) are a late-August attack on generated proof relations, a separate full-round collision for an adaptively selected Poseidon matrix, and more precise tools for reviewing FRI, transcripts and Merkle commitments. They strengthen the case for binding the exact compiled relation, preserving fixed parameter provenance, and deriving a composed security bound before activation. They do not establish an attack on the current Iroha execution verifier or qualify its security.

This is a targeted update, not an exhaustive new survey. Dates come from primary records and manuscript covers, not search crawl dates. Four primary PDFs were fetched directly from IACR after the web reader could not open them; the sections listed below were inspected. The [source manifest](../../output/research/2026-09-08-proof-security/manifest.json) pins those PDF/text bytes and the native source observations. No cryptanalytic experiment, Lean build, crypto implementation change or Iroha mutation was performed for this research.

## Bind the generated relation before the first challenge

**Giacomo Fenzi, ePrint 2026/1838:** manuscript cover **30 August**, received **31 August**, approved **1 September 2026**; preprint. The paper extends concrete-hash Fiat–Shamir attacks to sufficiently expressive generated relations, with variants of Spartan and Aurora as examples. Its adversary controls generating code and exploits a protocol that permits a convincing transcript before statement binding. Section 5.2, Proposition 5.5, gives a useful mitigation: the first challenge binds the generated statement's encoding. Security then reduces to the underlying nongenerated protocol, with one extra evaluation of the generating map. This is not a theorem that every use of these systems is broken. [Primary record and manuscript](https://eprint.iacr.org/2026/1838).

**Iroha implication:** a future native generic profile must bind the actual compiled constraints, tables, ports and public statement before its first challenge. A compiler name, executable digest or source program alone is insufficient as the proposed relation identity. Keep registration restricted to reviewed compiled relations. The new operand descriptors are raw compiler artifacts; this paper does not turn them into a proof or establish that any later transcript uses them correctly.

## Distinguish the new hash attacks from our exact instance

**Sunghyeon Jo, “Midpoint Reset,” ePrint 2026/1760:** received **21 August**, approved **22 August 2026**; preprint. Theorem 1 constructs a full 28-round collision for **original Poseidon over KoalaBear**, with width 16, exponent 3, eight full rounds and twenty partial rounds. The attacker selects an MDS matrix after the round constants are fixed. The collision targets the feed-forward function `H(x)=P(x)+x`, in all sixteen coordinates. The matrix passes the prescribed checks. Section 5 reports independent exact finite-field validation; those experiments were not reproduced here. [Primary record and manuscript](https://eprint.iacr.org/2026/1760).

The native [Poseidon2 implementation](/Users/takemiyamakoto/dev/iroha/crates/iroha_core/src/execution_proofs/poseidon2.rs) and [provenance record](/Users/takemiyamakoto/dev/iroha/crates/iroha_core/src/execution_proofs/POSEIDON2_PROVENANCE.md) were inspected read-only. They use Goldilocks, exponent 7, width 16, rate/capacity 8/8, eight full and twenty-two partial rounds, fixed Plonky3 matrices/constants, a framed sponge, and six canonical output coordinates. **Inference:** the Midpoint Reset example does not directly establish a collision for this different fixed construction. Its relevant lesson is that a matrix's algebraic checks cannot replace parameter-generation provenance or mode-specific review.

**Li–Liu–Wang, ePrint 2026/1792:** received **24 August**, approved **26 August 2026**; preprint, already listed in the previous study. The primary abstract still reports nonlinear-subspace methods that reach or exceed recommended internal rounds for some analyzed instances under a specified Gröbner-basis cost model. This is a separate reason to review the native instance's concrete margin; the inspected record does not resolve its exact security level. [Primary record](https://eprint.iacr.org/2026/1792).

The February **Skipping Class** paper separately studies Poseidon2 matrix structure and the actual sponge/compression modes. Its reported `2^106` relative improvement for one parameter set is not a 106-bit deduction from a claimed 128-bit security level; its abstract explicitly retains that distinction. [Primary record](https://eprint.iacr.org/2026/306). Neither these papers nor an upstream known-answer test justify silently trimming rounds or selecting a new fast matrix.

## FRI analysis and formalization are more usable, with explicit premises

**Garreta–Mohnblatt–Wagner, ePrint 2025/1993:** current PDF cover **27 March 2026**, archive revision **31 March**; preprint. Theorem 5.2 separates each folding-round mutual-correlated-agreement error from the query error `(1−min(θ,δ))^t`. The tradeoff parameter `θ` is continuous; choosing it affects both sides. The revision also adds stronger commitment properties and batched FRI. This gives a useful structure for a concrete parameter planner, while still requiring an applicable bound for the precise code/domain. [Primary record and manuscript](https://eprint.iacr.org/2025/1993).

The authors' associated **26 January 2026** formalization report explicitly leaves the cited mutual-correlated-agreement lemma unformalized, uses a December 2025 snapshot, and distinguishes the formal theorem from proving an implementation equivalent to it. Those are material limits when assessing “formally verified FRI.” [Author report](https://blog.zksecurity.xyz/posts/simple-rbr-fri/), [formalization repository](https://github.com/zksecurity/simple-rbr-fri).

The earlier warning remains: Crites–Stewart disproved the original capacity proximity conjectures; it is unsafe to recover their advertised rates just by changing an error calculator. [Primary counterexample](https://eprint.iacr.org/2025/2046). The current action–orbit abstract still explicitly depends on conjecture Q2 for general inputs, despite stronger language elsewhere in that abstract. It supplies no unconditional general-adversary shortcut for our profile. [Primary record](https://eprint.iacr.org/2026/861).

## Merkle-tree security is a construction property

**Coratger–Khovratovich–Mennink–Wagner, ePrint 2026/089:** received **20 January**, revised **22 July 2026**; the record lists ACM CCS 2026. The paper proves strong position binding and extractability for a specific prehashed Plonky3 Merkle construction despite its standalone compression function lacking those ordinary hash properties. Table 1 distinguishes assumptions: all results idealize the permutation, with different leaf-hash assumptions. Section 6 supplies a correlated-leaf-hash counterexample; Section 7 handles a particular sponge construction. Section 4's roughly 123-bit illustration uses eight 31-bit hash coordinates. [Primary record and manuscript](https://eprint.iacr.org/2026/089).

**Iroha implication:** retain an exact proof of the selected leaf/internal framing, digest space and opening semantics. Do not copy Plonky3's speed-oriented compression operation merely because we share a permutation family, and do not transfer its eight-coordinate numerical example to Iroha's six Goldilocks coordinates. Conversely, a claim that every truncated-permutation tree is broken would misread this positive result.

## Transcript and small-field implementation references

**CFRG Fiat–Shamir draft 03:** document date **17 August 2026**, datatracker update **16 August**. It is an active work-in-progress Internet-Draft, not an approved standard. It specifies codecs, canonical serialization/deserialization, instance/session binding, XOF duplex operations and test vectors, including extension-field elements and malformed/trailing data. This is useful for reviewing our byte-level transcript specification; adopting its interface does not prove the game relation or our concrete hash secure. [Version-pinned draft](https://datatracker.ietf.org/doc/draft-irtf-cfrg-fiat-shamir/03/).

**Packed Sumcheck, ePrint 2025/719:** received **22 April**, last listed revision **3 October 2025**; preprint. It combines repetition with folding to maintain round-by-round soundness in small prime fields. Its explicit round-by-round argument is a reason to analyze repetition under Fiat–Shamir rather than treat a repetition count alone as a soundness proof. Its concrete experiment uses BabyBear and a TFHE application; neither its speedup nor its challenge schedule transfers automatically to Goldilocks/Fp4 racing. [Primary record](https://eprint.iacr.org/2025/719).

## Concrete effect on the next native design

These are engineering conclusions, not newly proved cryptographic results:

- Bind the exact emitted relation and public history before challenges; include every table, fixed constant, boundary, terminal predicate, layout and scope. Check that the actual verifier transcript consumes those bindings.
- Keep a symbolic error ledger for the chosen IOP, lookup arguments, DEEP/quotient checks, multi-table or shard links, Fiat–Shamir reduction and commitment construction. Fixed raw checker tests do not fill missing reduction terms.
- In the prospective operand bus, base-field pairs are encoded as `value+u·address`. Its proposed challenge support excludes `span_F{1,u}`; the current range/ROM exclusion of only the base field would not exclude every tuple pole. Any such protocol change needs its own complete analysis.
- Audit actual admitted polynomial degrees. Two unrestricted degree-`<n` quotient chunks admit degree `2n−1` even if the honest quotient needs only `2n−3`; parameter accounting must include malicious candidates.
- Review the complete pinned Goldilocks Poseidon2 instance against the late-August cryptanalysis before live approval. Preserve the conventional-hash comparison as an implementation option, without claiming that a substitution alone repairs protocol soundness.

The findings change review priorities and parameter requirements. They do not enable staked races, settle the 128-bit qualification, or replace the unfinished full-race proof and consensus integration work.
