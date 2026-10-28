# Generic native membership and two-phase WHIR

8 September 2026. This successor addresses the range and indexed-ROM obligations retained by the [Street scalar laboratory](NATIVE_WHIR_STREET.md). It is a generic compiled execution component, not a race instruction. Its relation preserves every source scalar equation, membership occurrence and public port. Both value domains have explicitly constrained zero tails.

**Current qualification is incomplete.** The complete two-phase adapter now proves and independently verifies the compiled scalar and membership equations for actual two/eight-car one-tick fixtures. Extraction/base-membership premises, full integer execution and accepted histories, composed security, external review, full-duration resources and ledger settlement remain unqualified. No live XOR/NFT settlement is enabled.

## Two committed oracles

`membership_relation.rs` compiles two independent Boolean domains:

- Phase 0: all original source values in their original address order, followed by one multiplicity per real public table row, then zero padding.
- Phase 1: one inverse per original range occurrence followed by one per original ROM occurrence, then zero padding.

The exact source descriptor is native-hashed in a streaming frame and bound with its byte length. The smaller owned descriptor binds that source digest, all public values, deterministic namespaces and occurrence order, actual dimensions and the protocol grammar. Local allocation limits do not change the semantic identity. A source table's unused rows remain part of the relation.

For the current eight-car Street source, range widths 1 through 8 have respectively 8,490; 11,609; 1,925; 6,016; 5,234; 12,083; 11,824; 162,055 occurrences. Widths are separate namespaces: substituting the largest range would weaken the relation. Sixteen ROM columns each have 1,403 real rows and 40 occurrences. Padding a commitment does not add valid table rows.

| Complete one-tick layout | Two cars | Eight cars |
|---|---:|---:|
| Original values | 24,406 | 340,566 |
| Public table entries | 22,958 | 22,958 |
| Phase-0 active values | 47,364 | 363,524 |
| Phase-0 padded domain | 65,536 | 524,288 |
| Phase-1 active inverses | 16,732 | 219,876 |
| Phase-1 padded domain | 32,768 | 262,144 |
| Augmented equations | 71,499 | 702,813 |
| Linear terms | 132,374 | 1,234,333 |
| Quadratic terms | 40,224 | 675,465 |
| Six-factor domain | 262,144 | 2,097,152 |

These counts are checked by the completed native Street proof runner. Performance measurements are recorded below; they cover one tick.

## Lookup equations

The field is native Goldilocks extension `K=Fp4`, with `p=2^64−2^32+1`. A range query is its value. A ROM query is `index + eta*value`; its public table key is `row_index + eta*signed_field(table[row_index])`. Table IDs identify separate namespaces. Signed table values use exact Goldilocks encodings; no unproved integer packing is assumed.

For every occurrence `i`, the compiled relation contains

```
(beta - query_i) * inverse_i = 1
```

For each namespace `k`, it also contains

```
sum_i inverse_i - sum_j multiplicity_k,j / (beta - table_key_k,j) = 0
```

The verifier computes all public table reciprocals. It rejects **every** public-table pole, including unused rows with zero multiplicity. Query poles cannot satisfy an inverse equation with right side one. No exceptional branch or retry is accepted. Every duplicate occurrence contributes independently. The total occurrence count is bounded below the field characteristic.

The multiplicities are committed before both `eta` and `beta`. The honest constructor uses literal integer counts; the pole argument itself permits arbitrary fixed field multiplicities and does not confer separate bounded-counter semantics. Committing multiplicities after beta is unsound: for table `{0}` and bad query `1`, `m=beta/(beta-1)` can satisfy the rational equation. Merging namespaces is also unsound: swapped queries for separate tables `{0}` and `{1}` cancel in a global sum.

The scalar lowering retains full-extension coefficients after lookup challenges. The fixed sparse expression remains `C + Lw*Lv + Qw*Ql*Qr`. Original scalar coefficients and terms are preserved rather than simplified away. The terminal read polynomials split into two oracle contributions; constant offsets belong to phase 0 only. The compiled adapter must reconstruct each of six linear query claims from its exact tagged operand map and check the scalar terminal equation on the sums of the two contributions.

## Ordered transcript and authentication

`phased_whir.rs` implements this affine grammar:

```
phase-0 root (V, multiplicities)
  -> phase-0 compiler OOD challenge and reply
  -> eta, beta
  -> phase-1 root (query inverses)
  -> phase-1 compiler OOD challenge and reply
  -> equation weights
  -> exact cubic sumcheck rounds from claim zero
  -> six terminal read claims
  -> both compiler-derived query-set digests
  -> two ordered, domain-separated WHIR opening branches
```

Phase 0 is Base encoded, phase 1 Extension encoded. Both have compiler-selected profiles and independent dimensions. Every branch binds the shared completed outer transcript, both query-set digests and its own oracle index/role. Branch bytes cannot be swapped or reused when a truthful sibling query changes. The final receipt hashes the binding, ordered roots, shared outer state, both query digests and both completed branch states. A separate getter identifies the pre-opening shared state.

All branch proof counts/indices come from external compiled geometry and transcript challenges; exact canonical decoding is separate from authentication. Affine phase objects have no public clone or constructor from a digest. A public binding can be cloned because it is immutable expected context.

## Conditional algebraic analysis

The partial-fraction reasoning is cross-checked against the OpenVM authors' [On the Soundness of Interactions via LogUp, Lemmas 2.1–2.4](https://github.com/openvm-org/stark-backend/blob/main/docs/Soundness_of_Interactions_via_LogUp.pdf). The bounds below are our application to this relation, conditional on the committed query and multiplicity polynomials being fixed before the lookup challenges.

Let `q=|K|`, `N_k` be a namespace's query count and `R_k` its real table rows. An out-of-table compressed query has residue between 1 and `N_k`, nonzero because `N_k<p`. Table multiplicities cannot cancel a pole outside their support. Clearing denominators gives degree at most `N_k+R_k-1`, so a fixed invalid range namespace passes with probability at most `(N_k+R_k-1)/q`.

For an invalid ROM pair, collision with one of its real table pairs happens for at most `R_k` values of eta. Outside that event the same rational bound applies. This gives `(N_k+2*R_k-1)/q`. Collisions among queries retain positive residues. At eta zero, a wrong ROM value with the correct index can pass compression; tests deliberately expose this statistical event rather than rejecting valid field challenges.

For the retained Street census, the maximum bound for one fixed invalid namespace is `11311/q` for two cars and `162310/q` for eight. Conservative sums over namespaces are `62114/q` and `265258/q`. These are algebraic subtotals, **not composed security estimates**. Both compiler OOD reductions, PCS candidates/extraction, outer equation batching/sumcheck, two-oracle composition, hashing and Fiat–Shamir require separate accounting and proof.

Base encoding needs a qualified proximity premise. If a Base-valued word on distinct field points agrees with a K-polynomial of degree at most d at **more than d** points, coefficientwise Frobenius `sigma(f)-f` has degree at most d and must vanish identically. Its coefficients, and then the Boolean basis transform, are in the base field. At only d points, `u*product(X-s)` for non-base u is a counterexample. The Frobenius operation is coefficientwise; `f(X)^p-f(X)` has different degree. Sampled Base leaves or the honest commitment constructor alone do not establish the required extraction/agreement guarantee.

## Current evidence

The initial component lane passed 18 membership-selected tests (ten new relation/fixture tests and eight source regressions), plus four phased-opening tests. Review then removed local resource ceilings from the semantic descriptor and strengthened the returned receipt to include both completed opening branches.

The subsequent [phase audit report](../../output/qualification/native-membership-phases-audit/report.json), SHA-256 `aaf59754875475ef4343894c0160c1b0f02a4f3e98c9b219c7aefbe638bea76d`, passes the same 18 membership tests and nine phased-opening tests including five independent attacks. It checks truthful sibling changes, both OODs, phase roots, profiles/roles, shared rounds/reads and exact wire bounds.

The [composed suite](../../output/qualification/native-membership-composed-checked/report.json), SHA-256 `bb4727ec4eb3c922f81947fc197ee8366a771ecd9f2320005aa6416c8b622612`, passes 31 distinct tests, including coherent false outer relations with genuine openings for both inner commitments. The complete [Street report](../../output/qualification/native-membership-street-qualified/report.json), SHA-256 `b195ac0182677306d62bc965efb0322021e9494e2d7b1e753a1ed266f2383c2c`, records six accepted commands and fourteen rejected mutations.

| Retained native CPU measurement | Two cars | Eight cars |
| --- | ---: | ---: |
| Proof bytes | 798,764 | 1,186,540 |
| Whole prover process | 13.709 s | 62.112 s |
| Prover peak RSS | 174,129,152 B | 1,572,601,856 B |
| Whole verifier process | 6.005 s | 16.214 s |
| Verifier peak RSS | 99,106,816 B | 989,118,464 B |
| Membership compilation inside prover | 1.036 s | 7.621 s |
| Phase-0 commitment inside prover | 4.937 s | 21.996 s |
| Adapter proving operation | 7.694 s | 32.179 s |
| Adapter verification operation | 4.977 s | 10.071 s |

These are single observations of one tick, not medians, throughput estimates, validator measurements or accelerated-path results. Whole-process times include compilation and launch/exit; the separately timed adapter operations do not. Peak RSS includes the borrowed original source and allocator effects; payload-admission bounds are a separate quantity. Internal proving subphase timings are not exposed. The verifier runs in a directory containing only the public statement and proof while the witness is absent at its original path; it does not regenerate a witness. Full-game, integer-execution, base-extraction and composed-security qualification flags remain false.

The completed [supplemental CLI audit](../../output/qualification/native-membership-street-cli-audit/report.json), SHA-256 `5330a9bf4b17af3eb684709a5b763b1d0576f0d4fee0ae1c0cb5710776eb3909`, adds **67 rejected commands** against the same frozen two-car executable. It checks malformed public/witness fields, both roots and OOD anchors, altered context and rounds, both read-claim banks, exact two-opening framing, noncanonical/truncated/trailing data, missing/nonregular files and overwrite rejection. Every command exits with code one and its exact expected error, without panic, signal or OOM. Malformed-witness cases reject before commitment and create no proof. The audit performs no build, fixture generation or successful proof production; it also asserts the main report's complete two/eight-car census and qualification flags. These 67 commands are additional parser/context checks, not 67 new cryptographic theorems or an eight-car rerun.

The [membership evidence manifest](../../artifacts/native-membership.json) freezes these three final reports, their complete source and native-dependency provenance, binaries, logs and this document. Earlier component reports remain historical evidence. The manifest excludes the later, separately versioned multi-tick sequence work.

The [updated September research](../../docs/research/crypto-2026-september-update.md) uses this completed baseline to assess new PCS, accumulation and soundness work. It does not change the frozen proof implementation or qualify production admission.
