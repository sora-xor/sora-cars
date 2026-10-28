# Native lookup protocol integration review

September 8, 2026. Read-only review of the first closed arithmetic laboratory protocol against its native PCS and compiled AIR contracts. No concrete acceptance gap was found in the phase ordering, public binding, canonical decoding or verifier call path inspected here. This is an implementation review, not a cryptographic security certificate or Street deployment qualification.

Reviewed source SHA256 values:

| Source | SHA256 |
| --- | --- |
| `lookup_protocol.rs` | `b915f5aea0340391054a4fa5e1c2e50684240bc3cc4b2abdd1d446b29b3d9292` |
| `lookup_common.rs` | `641dcc5a3ebbf00547cb95d415cdd033c69c96040e1efdddd287f10a6dec44d2` |
| `lookup_pcs.rs` | `8326721515a95b95f1384ce053d0dce5cec4f6cfa13bb13d2b40cba4439869ea` |
| `lookup_air.rs` | `6476db07120029b1956802bf90fef88bb83622a0ccba378a5114583ea139b721` |
| `lookup_fixture.rs` | `c339e53bec9ec365c5b0c929a099279599db8ef298a4178fa2d57956a914d80c` |

The parent integration run owns end-to-end test evidence. This review does not rerun it or promote an in-progress run to a pass. The separately completed PCS component evidence is [native-lookup-pcs/build-report.json](../../output/qualification/native-lookup-pcs/build-report.json), SHA256 `dbb10648271d3d2f006551b24b67db81ec6dc7a7add2a265af0b3523b79b2720`: four component tests passed using the frozen native Iroha closure. No maintained Iroha or Cargo work was performed for this review.

## Exact transcript order

Both proving and verification begin with a fresh native execution transcript initialized with the suite, verifier-recomputed profile digest and verifier-recomputed public digest. The profile digest frames the fixed parameter encoding, closed relation ID, semantic description and complete compiled AIR descriptor as separate fields.

The subsequent order is identical on both paths:

1. Absorb the base role, exact base width and base root. This binds witness and multiplicity columns before sampling `β`.
2. Sample native `β` with the fixed public predicate `β ∉ F`.
3. Absorb the auxiliary role, exact auxiliary width and auxiliary root before sampling the composition challenge `θ`.
4. Absorb the two-piece quotient commitment before sampling `ζ ∉ F`.
5. Decode or compute every column evaluation at `ζ` and `gζ`, using the same degree-<256 polynomial in both cases. The AIR quotient identity is checked at `ζ`.
6. The PCS repeats the exact ordered descriptors and all OODS values under distinct labels, then samples its DEEP mixing challenge. No OODS value is added after that challenge.
7. For each of eight FRI layers, absorb that layer's root before sampling its native fold challenge. Absorb all 16 terminal values before deriving 96 unique initial pair positions.

Reading roots from the proof header before absorbing them does not change this ordering: only the designated phase absorption changes the transcript. The verifier reconstructs each challenge, rather than reading challenges, retries or query indices from proof bytes. The non-base predicates exclude every base-field table point and both DEEP base-domain denominators; the predicate is independent of the witness. The native samplers retain their bounded failure behavior.

The OODS quotient check is

```text
C(ζ) = (ζ^256 − 1) · (Q0(ζ) + ζ^256 Q1(ζ)).
```

`CompiledLookupAir::evaluate` requires the exact compiled base/aux widths and canonical evaluations at both points. Both quotient pieces are subsequently included in the same PCS batch. The extra quotient claims at `gζ` are also authenticated, although the composition identity needs only their values at `ζ`. There is no skipped commitment group or unbound copied query stream.

## Public and compiled binding

The verifier receives the statement independently of proof bytes. Canonical statement encoding includes the network bytes, execution bytes, dispute epoch, accepted-history bytes, exactly three public action rows and exactly five final outputs. Action and final field values must decode canonically; the closed fixture also checks the action integer/control ranges without computing a resulting state.

The initial state `−9`, fixed three-step count, state carry source, public action port mapping and final output mapping come from the closed compiled fixture and actual exported boundary equations. They are included in the complete AIR descriptor. The descriptor also retains the scalar relation, stage schedule, fixed values, exact memberships, local carry/zero obligations and deterministic global padding. A semantic label alone does not substitute for these equations.

The current compiled descriptor includes public boundary values as well as relation structure, so changing actions or final outputs may change both the profile digest and the public digest. This redundancy is consistent: the verifier recomputes both. A prover cannot admit an uploaded descriptor by copying or replacing header digests. The protocol tests include changed statements with both digests retagged, which is stronger than merely checking header inequality.

Network and accepted-history bytes are cryptographically bound labels in this laboratory. No signature, chain finality, checkpoint certificate or dispute evidence is authenticated here. An arbitrary 32-byte history tag is not proof of the history's preimage. The source comments correctly keep those external authentication obligations separate. There is likewise no first-terminal Street result claim: the closed computation executes exactly three arithmetic transitions.

## Canonical bounded decoding

The outer verifier checks the total proof length against 4 MiB before setup or decoding. The fixed header length is computed from compiled base/aux widths and the fixed two quotient columns, with checked addition and multiplication. Proof bytes cannot specify those widths or change the header split.

The header decoder reads the fixed version, canonical native digests, exactly three roots, and the exact number of native canonical Fp4 OODS values, then requires header EOF. The remaining slice is passed to the PCS decoder, which checks its own fixed version and complete EOF. A proof with trailing bytes is rejected; a short header never reaches an unchecked slice.

The PCS codec omits query indices and geometry. Its remaining length prefixes have fixed small bounds before allocation; verification then checks the exact transcript-derived row and minimal-frontier shapes. Base rows contain canonical F words; auxiliary, quotient and FRI rows contain canonical Fp4 words. Every authenticated row is checked through the unchanged native canonical multiproof verifier.

The common append-only writer enforces its 4 MiB ceiling before reservation and copy, uses checked length addition, and validates field encodings. Native digest decoding rejects noncanonical coordinates. Public statement decoding also requires its exact step count, output count and EOF. Byte caps are engineering limits, not soundness parameters.

## Verifier independence and remaining limits

The verifier calls `setup`, which compiles the closed scalar relation, validates public action shape/ranges, takes immutable public boundary snapshots, and compiles the fixed AIR. It does not invoke `Circuit::witness`, `honest_trace`, base/aux trace generation, polynomial interpolation, quotient construction, or the PCS prover. Evaluating fixed selectors and the AIR at `ζ` is part of proof verification, not replay of the computation.

Prover-side rejection of an invalid raw trace is useful but is not the verifier's trust boundary. The verifier instead checks the OODS identity, all joint committed polynomial openings, every queried initial `X·DEEP` binding and FRI fold, and the complete terminal polynomial degree condition.

The `X·DEEP` modification aligns the honest quotient's degree at most 254 with an eight-fold FRI target of degree at most 255. It does not turn a malicious rational DEEP expression into a polynomial by assertion. The combined DEEP/FRI reduction, batching cancellation, Fiat–Shamir accounting, 96-query soundness and whole-protocol security target still need a documented analysis and cryptographic review. No unconditional low-degree inference or 128-bit claim is justified by the passing finite tests.

This protocol is public and unmasked, restricted to its closed n=256 arithmetic fixture. It does not establish full Street physics, full-race proving feasibility, accepted input certificates, terminal race semantics, custody/settlement, live network authentication or ledger inclusion. These remain separate work.


## Additional verifier-level degree regression

After the read-only protocol review, the PCS test module gained a test-only malformed candidate assembler. Its production prefix remains byte-identical to the reviewed PCS implementation (SHA256 `d6f97e99301706fd14449543aa9d56ea71a0af370fca03bf7beb4aafe5f975e6`). No production flag or verifier bypass was introduced.

The assembler creates the actual native commitment to a coherent degree-256 base oracle, retains both correct OODS evaluations, and completes all native transcript phases, commitments, folding, terminal absorption, query selection and multiproofs while skipping only the honest prover's terminal-degree guard. The resulting 245,488-byte malformed proof is encoded and decoded through the production canonical codec and submitted to the unchanged production verifier, which rejects it with `FriDegree`.

The test independently authenticates every supplied native group/FRI multiproof, checks all 192 initial signed-point `X·DEEP` bindings and all 768 queried adjacent fold equalities. The malformed candidate is therefore rejected for its degree, rather than an unrelated inconsistent frontier, row or transcript. The direct native fold comparison still confirms that degree 255 reaches a constant after eight folds whereas degree 256 does not. All four PCS component tests passed in the updated evidence run above. This closes the earlier prover-only regression limitation; it does not replace the required probabilistic DEEP/FRI security analysis.
