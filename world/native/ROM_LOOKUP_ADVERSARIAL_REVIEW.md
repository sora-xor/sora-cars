# Independent ROM lookup acceptance review

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


September 8, 2026. This review covers the closed native N=2,048 indexed-ROM component in `lookup_common.rs`, `lookup_air.rs`, `lookup_pcs.rs`, `lookup_protocol.rs`, `rom_lookup_fixture.rs` and its generated table. It follows the compiler/scheduler admission reviewed in [ROM_LOOKUP_PROTOCOL_REVIEW.md](ROM_LOOKUP_PROTOCOL_REVIEW.md). It does not certify 128-bit security, a full Street computation, player/roster authorization, terminal race settlement, or finalized ledger inclusion.

No accepting ROM forgery was identified in the inspected implementation. This is a bounded source review and adversarial test exercise, not a formal proof of the implementation or its cryptographic reduction. The reviewed source pins and executed component evidence are recorded below.

## Findings and resolutions

**The generated quotient bound was stronger than the admitted bound.** The quotient constructor rejects nonzero remainder, composition coefficients above `3N−3`, and quotient coefficients above `2N−3`. However, the verifier authenticates two degree-at-most-`N−1` PCS columns and reconstructs `Q0 + X^N Q1`. That admits a malicious quotient of degree `2N−1`; the constructor's two zero top coefficients are not a verifier constraint. The implementation now distinguishes the generated bound from the admitted bound. At N=2,048 these are 4,093 and 4,095, respectively; the complete malicious OODS identity residual is bounded by 6,143, rather than the honest composition bound 6,141. This changes future soundness accounting; it is not a demonstrated acceptance attack. A tighter admitted bound would require a real authenticated degree restriction.

**The initial foreign-table candidate used an extra length prefix absent from the actual wire format.** The other reviewer identified this test defect. Such bytes could fail parsing without establishing algebraic rejection. The corrected regression now serializes exactly the production header followed immediately by `LPC1` PCS bytes, independently checks native PCS verification and the alternate table's nonzero quotient identity, and asserts failure of the real closed relation specifically at the OODS quotient identity. Honest-prover refusal alone is insufficient.

## Binding and arithmetic checks

The verifier compiles the fixture and derives its boundary equations independently of witness generation. The profile digest includes the fixed relation/specification, all compiled table bytes/order/extrema, source wire and read identities, exact staged rules and boundary snapshot, and closed profile parameters. A proof cannot replace the compiled table or select a weaker domain. N=256 rejects ROM-bearing contexts; N=2,048 has a distinct digest context, transcript suite and public statement domain.

The three-step public statement binds network/execution bytes, dispute epoch, an accepted-history digest, the complete action tape, and five exact final outputs. Every action column and its fixed length is checked; initial state, cross-step state carry, and final output bindings are retained in the composition. These are byte/computation bindings only. The component has no player roster, input-key signatures, accepted-history authority or ledger trust validation. It intentionally proves a fixed three-step indexed-read computation, not complete race termination or world-progress geometry.

Each ROM inverse is identified by the complete static affine expression `(index binding, value binding, real row count R, lower bound L)`. This permits safe reuse between identical expressions, including different table namespaces, while retaining every occurrence separately in its namespace's sum. It cannot merge different index bindings merely because their output value is constant or shares a physical column. Scheduler identity and liveness proofs are essential when slots are reused.

Actual retained range equations enforce `0 <= i < R` and `L <= v <= U`. For the signed table bounds, `i+R*(v−L)` lies below the checked integer envelope, itself below `2^63 < p`. Canonical field equality therefore recovers exact integer index/value equality. The key alone is insufficient: `(R,a−1)` collides with `(0,a)` before field reduction. This is why independently constrained index bounds must remain in the composition.

The base witness and every namespace's multiplicity polynomial are committed before beta. Beta lies in `Fp4 \ F`, so no trace-row denominator for a canonical base-field key can vanish. Post-beta inverse and accumulator columns are committed before the composition challenge. Each fixed selector is recomputed by the verifier. The reciprocal equation applies on every row, including inactive rows; no extra selector multiplication weakens it. Separate table equations, padded-multiplicity zeros, the cyclic accumulator recurrence including the last row, and the accumulator origin are present for each range width and each ROM table namespace. Repeated occurrences change sums even when inverse columns are shared.

Arbitrary pre-beta field multiplicity advice is not a claim of bounded integer counters. Under bound low-degree oracles, an invalid key absent from its table has positive query multiplicity below the field characteristic, so its rational residue cannot vanish identically. The configured total occurrence bound is 65,536, far below p. Any complete security argument still needs the conditional rational-identity error, shared-challenge/namespace handling, composition batching, admitted OODS degree, DEEP reduction, FRI, hash/transcript assumptions and adaptive composition.

## Polynomial opening and profile checks

Static affine query expressions have degree at most `N−1`; their reciprocal constraints have degree at most `2N−2`. Original selector-weighted quadratic gates have degree at most `3N−3`. The sparse compiler retains original polynomial bank slots, structural zero/carry rules, every range/ROM occurrence, boundary equations, and global zeros for witness columns after the compiled active rows. Lookup auxiliary columns have their own full-domain equations; they are not incorrectly blanket-zeroed after active execution.

All base, auxiliary and quotient columns are opened at zeta and `g*zeta`. Their ordered roots, roles, widths and OODS values are absorbed before DEEP mixing. The initial FRI layer is checked against the authenticated original rows at both signed points of each pair using `X·DEEP`. Each layer root precedes its fold challenge; the full terminal precedes verifier-derived query selection. Canonical multiproofs authenticate exact derived rows/frontiers. Shape, canonical encodings, roles, exact EOF and the outer 4 MiB ceiling are checked.

The closed N=2,048 profile uses 32,768 LDE rows, eleven binary folds, and all sixteen terminal values constrained to degree zero. The base-field root exponents are 11 (trace), 13 (4N quotient interpolation) and 15 (LDE), within the native Goldilocks two-adicity limit. An independent integer check gives `7^8192 mod p = 15094611910849701842` and `7^32768 mod p = 10529651373896570371`, so the selected nonzero cosets do not equal these subgroups. The existing coherent degree-N PCS regression is parameterized by N and checks actual authenticated openings/folds followed by terminal-degree rejection.

The PCS shape preflight conservatively budgets every opened group value at 32 bytes, including base values encoded in eight bytes. This can reject a profile before its actual wire size reaches 4 MiB; it does not weaken proof admission. Actual proving time, memory and proof-byte measurements must not be inferred from that conservative accounting.

## Independent additional regression scope

The separate `rom_lookup_adversarial.rs` module uses public immutable compiler/stager/AIR interfaces. It adds:

- Duplicate constant-column reads, different index expressions with the same constant output, exact multiplicity totals, and a coherent missing occurrence whose recomputed reciprocal/accumulator advice fails only the final cyclic recurrence.
- Different table namespaces sharing an identical affine expression through an actually reused physical value slot, with both original read identities retained and honest full-domain AIR acceptance. Its final wrong-value mutation checks the raw advice guard only; that assertion is not evidence of a malicious composed-AIR rejection.
- The explicit packed-key collision `(3,4)` versus `(0,5)` for a three-row table. The forged public action/final claim and lookup advice are coherent; retained scalar index/output equations must still reject it.

These are AIR-component acceptance tests. They are not described as full composed-protocol forgeries. A ROM-correct/range-wrong candidate with independently valid PCS and a nonzero alternate quotient remains unqualified unless separately recorded. Public helper APIs cannot construct arbitrary contradictory fixed ROM descriptors; fixed/contradictory descriptor injection is confined to scheduler tests. The composed AIR should not acquire a public constructor that bypasses that ownership boundary merely for test convenience.

## Final evidence

The independent module's retained [native report](../../output/qualification/native-lookup-rom-adversarial/build-report.json), SHA-256 `dc8682fcb68b3c9893111ecd905e6e2cc6fcdc90f4b0e96a8122f5bb015f4704`, records **3/3 passing tests in 5.93 seconds**. The runner executed the frozen native field/FFT source closure and cached dependencies without maintained-Iroha writes or Cargo/dependency builds. All 38 referenced live/source/artifact digests checked by this review matched. The test stdout/stderr are retained; the review did not rerun that binary.

The log confirms six duplicate occurrences with two index-distinct inverses; an undercount with recomputed U/A advice rejects only the final cyclic row. The actual same-slot fixture retains two distinct tables while sharing one complete affine inverse. The packed-key collision preserves lookup advice and forged boundary values but fails exactly five original scalar-equation rows under the full compiled AIR, and cannot produce a zero-remainder quotient. These measurements are component tests, not three complete cryptographic proofs.

| Reviewed source | SHA-256 |
| --- | --- |
| [lookup_common.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_common.rs) | `138698a40a22b9e46d146daccd6393a494f9f873d4f3b407b7b430e818982edf` |
| [lookup_air.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_air.rs) | `a02b0a32e533caf0ddce504f415c59ad3878aefc9e20a06db95cfd16456c1999` |
| [lookup_pcs.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_pcs.rs) | `59902424f94badb8704ff47635fed15bcd86a91f16c08338d5f1fbcc9a822eb3` |
| [lookup_protocol.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/lookup_protocol.rs) | `bfb91ce6cb1c42cabd4fbdb749dd76501ccb652f96d30ed3dde4f3efc50f4cd9` |
| [rom_lookup_fixture.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/rom_lookup_fixture.rs) | `b8c7e3338d0dd28e8304709e86b70a42f95bc784426b567152276fe5a658b0d2` |
| [rom_lookup_table.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/rom_lookup_table.rs) | `baaf772efc3dd96f3c806e1838b18885eb92756e223a22ecbc63a583aef3b8f2` |
| [rom_lookup_adversarial.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/rom_lookup_adversarial.rs) | `6de940258b7025b319264eff33227a612e6d200ae492e34c6c920f1c6e39ae44` |
| [checked_constraints.rs](checked_constraints.rs) | `39b94c530d04affad95a89e5e7c4433840d29eef930fe4e4a9234f18e7365036` |
| [staged_constraints.rs](staged_constraints.rs) | `3d75ac18695dcb36fcea4e9859b2300901b3bd11f0c85d9863ff1d8c0a4b45c6` |
| [execution_trace.rs](execution_trace.rs) | `587e6e495586862cc88af61c0a4ca57825ac28ee2d4d744ab2d2888071d94d4a` |

The AIR source at this pin includes the separate generated/admitted quotient and OODS-residual degree fields. Its global-padding optimization factors the exact fixed selector sum and the exact weighted witness-column sum by distributivity; it does not remove padding predicates or alter the remaining rule banks. Source inspection found no mismatch in those factors. Separate test code compares the optimized evaluator with its naive reference, including nonzero padding, extension OODS values, and degenerate batching challenges; execution evidence for those tests belongs to its own qualification report.

### Final composed and external execution evidence

The final [combined native test report](../../output/qualification/native-lookup-rom-combined/test-report.json), SHA-256 `58db428183e246789e2ac2db17b37e60eb5ffbda4a20046fe5f02fa788969283`, records **29 passing tests** across four disjoint filters: 19 ROM/helper/scheduler/component tests, five complete-protocol tests, four native PCS tests, and one canonical-wire test. These totals include the three independent tests already described above; they must not be added to that earlier total. The live source hashes match the reviewed table above.

The retained output and the inspected test assertions establish the following distinct acceptance checks:

| Case | Actual acceptance boundary exercised |
| --- | --- |
| 122 auxiliary/padding mutations | The compiled AIR rejects 118 changes covering each auxiliary column at origin and final row, plus four padded-table multiplicity changes. |
| Coherent swapped table | All original non-ROM equations remain identical; the wrong table's witness/advice satisfy its AIR, while the original AIR rejects at one domain row. |
| Packed-key collision | Lookup advice closes, forged action/final values agree, but exactly five retained scalar-equation rows reject the invalid index/value lift. |
| 940,260-byte foreign-table candidate | The canonical native PCS proof and a genuine nonzero quotient for the foreign table pass independently. The production closed verifier rejects the correctly encoded candidate specifically with `OODS quotient identity`. This is a complete composed-protocol rejection, not an honest-advice or parser failure. |
| 500,300-byte degree-2,048 candidate | Actual native authentication, initial DEEP binding and fold equations remain valid; the production PCS verifier rejects specifically with `FriDegree`. This is a PCS degree regression, not a complete false-execution proof. |
| Three false-AIR candidates | The complete-protocol test constructs independently valid native PCS proofs for arbitrary low-degree phase columns and requires the actual closed verifier to reject their OODS identities. The cases cover zero witness/advice, missing auxiliary advice, and a false zero quotient. |

The [native CLI report](../../output/qualification/native-lookup-rom-cli/cli-report.json), SHA-256 `b340a2e3fbea319ccca02108ca74c64febda120836e70c86b14c27b4acf4b7d3`, records a **934,724-byte** valid proof. Its SHA-256 is `26b90518a289ad4e5975029221b8e57283cd4f9cf333034b245085d9b8ff62c9`; a second generation is byte-identical. An independent verifier process accepts using only the expected public statement and proof arguments, with the original witness pathname absent. The report's nine rejected external commands comprise **eight verifier rejection cases and one refusal to overwrite an existing proof**. They are not nine malformed-proof cases. The output continues to mark security qualification and ledger authentication false.

The [cross-profile CLI report](../../output/qualification/native-lookup-profile-replay/report.json), SHA-256 `865e09aebb4c99dba9e19aadb72b785d33a23f60338f50baf3dd9ff36d8be889`, records **six actual external rejections**, in both directions between the closed N=256 range and N=2,048 ROM profiles. A foreign proof fails its version binding; a foreign public statement fails its statement framing; transplanting the destination's 104-byte version/digest header onto the foreign proof still fails the actual OODS identity. The latter is a header-retagging regression, not a general arbitrary-profile admission test.

For this appendix, 73 distinct report/log/source/proof/context digest references were independently checked. The reported per-filter counts match retained stdout; the CLI proof size/hash and deterministic copy match; each cross-profile stderr matches its reported reason. These references overlap earlier evidence and are not an additional test count. No prover/verifier binaries were rerun by this review.

A **ROM-correct/range-wrong complete cryptographic candidate** remains outside the passing scope: the packed-key test is a compiled AIR rejection, and the three false-AIR candidates do not replace that missing coherent case. Signed roster/history admission, full Street computation and first-terminal completion, finalized ledger inclusion, and composed cryptographic soundness also remain unqualified. No cryptographic security approval follows from these pins or passing examples.
