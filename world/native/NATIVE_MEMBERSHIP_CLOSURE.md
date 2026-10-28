# Native proof-linked terminal closure

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


8 September 2026. This laboratory adds an application-independent closure proof after a completed native execution sequence. Street supplies a separate no-driving award relation. The implemented Street branch accepts an **already terminal, positive-tick** state, applies the supplied boundary removals, and recomputes awards without moving a car or executing another transition.

This is narrower than the selected [first-release terminal closure policy](../../docs/native-terminal-closure-policy.md). That policy also requires removals to be checked before motion and supports removal-only closure of an open boundary or genesis. Those branches, authenticated history/removal decisions, extraction and integer-execution premises, composed security, ledger finality and settlement remain unqualified. No new race instruction or live XOR/NFT admission is introduced.

## Generic anchor and proof binding

[`membership_closure.rs`](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/membership_closure.rs) knows only compiled execution relations, public vectors and typed input maps. `CompiledClosure::new` takes a `CompiledSequence`, a closure `AirView`, an ordered map for every closure input, an immutable public vector, all expected closure outputs, external context and local admission limits.

Each input is derived by one of two fixed maps:

| Map | Source |
| --- | --- |
| `TerminalOutput { index }` | The exact final public output at that index in the compiled sequence statement. |
| `PublicValue { index }` | The exact field value at that index in the immutable closure public vector. |

Indices are checked; every public-vector entry must be used. Aliased input ports remain separate occurrences. All values must have canonical Goldilocks encodings. The full terminal vector remains bound even when a generic relation does not read every entry.

The closure compiles an owned `OperandProgram`, retaining every original equation, range/ROM occurrence, constant and public port. Its complete descriptor is hashed natively with its byte length. A new domain, `iroha:execution:membership-closure:lab-v1`, separates the closure identity from earlier components. The closure descriptor binds the sequence digest and step count, complete closure-source digest and length, exact ordered maps, full terminal/public/derived-input/expected-output vectors, and external context. Local allocation policy does not change this identity; the underlying frozen operand compiler is always called with the same fixed `ProgramLimits::default()`.

`prepare()` builds the existing two-phase membership relation with all derived inputs and expected outputs, and places the closure digest in its public binding before either commitment or OOD challenge. Phase 0 commits original values and table multiplicities; phase 1 commits the challenge-dependent inverse values. The established [membership protocol](NATIVE_MEMBERSHIP.md) proves the scalar, membership, public-port and both padded-tail equations, using continued native transcripts and genuine openings for both oracles.

`verify()` first requires the private native `VerifiedSequence` result produced by the sequence verifier. It checks its sequence digest, exact step count and full final outputs against the compiled closure before parsing the closure proof. A supplied output vector or an otherwise valid receipt from another sequence cannot replace this anchor. After the membership verifier succeeds, the returned closure receipt binds the sequence identity, closure identity, completed sequence transcript, closure binding and completed closure transcript. It contains the adjudicated outputs, both roots, inner proof length and equation census. This receipt establishes component composition under the inherited proof premises; it does not authenticate what the public context means.

## Street's complete terminal vector

[`street_adjudication.rs`](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/street_adjudication.rs) takes the selected `RaceGraph` and immutable `LifecycleSpec`. It checks the complete ordered output vocabulary and each referenced source node's exact bounds. Catalog outputs must be literal source nodes. Schema coherence alone does not prove that this is the application graph used by an earlier proof; the enclosing compiler must bind that selected source and sequence.

The first graph inputs are every original output, in unchanged order: the eight header/catalog-count fields; five fields for each catalog object; and each car's eleven `CAR_FIELDS`, rank and ten feedback fields. The last inputs are `cN.removeAtBoundary` bits in roster order. In the Street adapter all preceding-output inputs map directly to `TerminalOutput(i)`, and every removal maps to its corresponding `PublicValue(i)`.

Before any removal can erase metadata, the checked graph requires:

- `1 <= tick <= max_ticks`, prior `done=1`, and exact prior ranks, refund and technical-win flags derived by the unchanged native `LifecycleRanking`.
- Every car within the existing Street bounds, zero speed, and zero live-only `drifting`, `boosting`, `slipMicroturn` and `oil` feedback.
- Finished cars with complete gate cursors, progress at or past the final station, `0 < finishTick <= tick`, and `0 < numerator <= denominator <= 6000`.
- Every non-finished status with the sentinel `(finishTick,numerator,denominator)=(0,0,1)`. Running and timeout cars must have an incomplete cursor and progress before the next required milestone. Timeout requires the tick cap; a running technical winner must be before the cap.

The original range constraints enforce status, gate, physical-field and Boolean bounds. Narrowing checks are eager assertions before clamps; malformed inputs are not silently repaired. The relation contains no geometry node and never invokes the driving lifecycle step.

For each removal bit equal to one, the adjudicated status becomes `FORFEIT` and its finish fields become `(0,0,1)`, including a previously finished or timed-out car. No `!previous_done` gate suppresses the removal. Repeating a removal of an already forfeited slot is numerically idempotent; this is **not** permission for duplicate or previously applied decisions in an authenticated history. That separate validator must enforce the selected policy.

The output vector retains the exact original order and names, replacing only status, finish metadata, rank, `done`, `refundAllForfeit` and `technicalWin`. It then appends one `cN.winner` bit per slot. Tick, positions, lateral offsets, speeds, body/velocity headings, energy, gate cursors, world mask, weather and literal catalog descriptors pass through unchanged. So do final-tick historical diagnostics: oil crossing, prop/contact masks, gate crossings and `justFinished`. Those diagnostics describe the unchanged raw driving transition even when an award removal subsequently clears the adjudicated finish record.

Ranking uses the existing bounded integer comparisons and exact cross-products of finish fractions, without a slot-order tiebreak. Eligible cars outrank forfeits. An all-forfeit result has refund one and all winner bits zero; a sole eligible car has a technical win, including a running survivor; otherwise every eligible rank-one car wins. The graph also checks that the adjudicated result remains terminal.

## Admission and resource scope

The Street source supports 2–8 cars, up to 16 catalog objects, and exactly `8 + 5*objects + 22*roster` prior outputs: at most 264. At most eight removal inputs and eight winner outputs are added. Milestones retain the existing lifecycle limits, including at most 64 ordered entries, the native tick cap of 30–9000 and Street length/lap limits. The selected graph is inspected once to validate referenced output-node metadata; it is not executed by the constructor.

The generic closure admits at most 4096 maps, public values, prior outputs or expected outputs; context is at most 64 KiB and its compact descriptor at most 2 MiB. The fixed operand admission permits at most `2^20` values/equations, `2^23` terms, `2^22` lookup events, `2^24` active rows, `2^27` padded rows, a 256 MiB source descriptor and 1 GiB owned-core allocation accounting. These are ceilings, not claims that all maxima fit simultaneously.

The closure's local tracked-payload ceiling is at most 3 GiB. Admission conservatively reserves the full fixed core ceiling plus compact descriptor, vector/context and scratch allowances, then checks the membership adapter's dense, opening and verifier bounds within the remaining budget. Caller-owned graphs, process allocator behavior and native opaque scratch are outside this visible payload accounting. Measured process RSS therefore must be reported separately.

## Completed evidence and measurements

The completed [qualification report](../../output/qualification/native-membership-closure-attempt-2/report.json), SHA-256 `dc92fa009a6a38dc2f7bdfb4937792892aba4fc00b8efd4d34bb677ed25843db`, records **19 passing tests**: six generic closure tests, three Street owner tests and ten independent Street fixture tests. They cover genuine sequence-to-closure composition; foreign receipts; altered maps, public values, source tables, context and outputs; malformed canonical proof bytes and roots; all roster sizes; exact fractional ties and close fractions; finished-winner removal; technical/all-forfeit outcomes; repeated numerical removal; and preservation of every unaffected output. The independent Street fixture also produces and verifies complete membership proofs, rather than relying only on graph evaluation.

The actual two/eight-car runner reuses the retained three-transition sequence statements and proof files. Its closure fixture removes the remaining slot-zero technical winner at tick three, yielding all forfeits, refund one and no winners. The verifier reconstructs public relations, verifies every preceding component proof, obtains the actual sequence receipt, and then verifies the closure proof. Its working directory contains only the two statements and two proof files; the original closure-witness path is absent. The fixture generation alone evaluates the graph and checks every lowered node, staged row and operand row.

The runner completed six accepted CLI commands (fixture, prove and verify for each roster) and ten rejected commands. For each roster it rejects a changed removal, changed winner, changed sequence anchor, trailing statement data and an attempt to overwrite the proof. These are exact command/error checks, not ten additional cryptographic theorems. Both verified results keep tick three, set refund one and technical win zero, and return only zero winner flags. The runner independently compares every preserved raw output.

| Retained native CPU measurement | Two cars | Eight cars |
| --- | ---: | ---: |
| Closure statement bytes | 1,140 | 2,292 |
| Closure proof file bytes, including root prefix | 257,516 | 527,500 |
| Closure original operand values | 1,278 | 9,794 |
| Closure source scalar equations | 2,139 | 13,869 |
| Closure range occurrences | 486 | 3,986 |
| Closure ROM occurrences | 0 | 0 |
| Closure fixture node values independently compared | 789 | 4,875 |
| Whole closure prover process | 0.729 s | 7.472 s |
| Closure prover peak RSS | 50,511,872 B | 542,900,224 B |
| Whole sequence-plus-closure verifier process | 7.094 s | 54.216 s |
| Sequence-plus-closure verifier peak RSS | 111,263,744 B | 997,408,768 B |

Proof file sizes include the 48-byte initial-root prefix; the generic receipt's inner `proof_bytes()` excludes that prefix. These files do not include the three preceding component proofs, which are supplied separately. The scalar/range/ROM census describes only the no-driving closure. Its zero ROM count follows from the absence of geometry; the preceding Street transitions still verify their complete membership relations.

Times are single whole-process observations, including public graph/relation reconstruction, launch and exit. The verifier additionally verifies all three prior component proofs before the closure, so its measured time is **not standalone closure verification cost**. The prover creates only the closure proof; it reconstructs the public sequence statement but does not produce or verify the earlier proofs. No separate commitment, opening or closure-only verification timer is exposed. Peak RSS includes caller-owned graphs and allocator effects, and differs from the conservative payload admissions above. These are native CPU laboratory measurements, not medians or accelerator/validator benchmarks.

The final report pins 39 local sources, nine retained whole native sources without transformations, the compiler, harness, binaries and all logs/artifacts. It also pins the predecessor [sequence report](../../output/qualification/native-membership-history-attempt-1/report.json), SHA-256 `7bb445d774ab15bfcfb4830331ae725f6cfe4e04192ac9d0b16cf84f1452312c`. The CLI uses checked arithmetic for its maximum sequence-file bound. Attempt 1 remains a historical 64-bit run before that CLI size-calculation fix; the table above uses the complete attempt-2 rerun. This does not claim that a 32-bit execution lane was tested.

| Final source / executable | SHA-256 |
| --- | --- |
| `membership_closure.rs` | `18502d8265a554f5ee98509fcfe3d8bf9ad587e127b5909a611dc5527023c9fb` |
| `street_adjudication.rs` | `aafec82ccb208f5649bb02ba7692c86fca0e159f0e2823e94c0dabb1d0cc9855` |
| `scripts/native/native_membership_closure.rs` | `2cc88a7f84d594c5b134e8b9840ff70e6bea643588201c48beedc796f7f58379` |
| Qualification executable | `18fa8fc82395bdd57837831d88de1bd3b9df8d0f6b0ff764a9b16cf2bad050fb` |
| Rust compiler | `34a8f7034eeb844189a3c36ebb3fe36c2193fdb47b60028eb7f9392cb1f62484` |

## Remaining completion work

The selected policy's full computation must support a proved open prefix followed by removals that end the game **before** driving, and a distinct exact-genesis branch for zero transitions. The present complete-sequence interface instead requires a nonempty sequence whose final driving transition already set `done=1`. Its positive-tick finalizer cannot establish either missing branch.

Removal bits must ultimately be derived from a validated immutable history, including accepted batches, pending/revealed suffix inputs, dispute decisions, epochs and exact effective boundaries. A hashed numerical mask is insufficient. Removal legality at the simulation cap, duplicate decisions and decisions after the award boundary belong to that bridge. Neither global staged-padding elimination nor current proof receipts authenticate these rules. The API's narrow successful flag, `noDrivingAtAlreadyTerminalBoundaryVerified`, must not be promoted to the still-false full `terminalAdjudicationVerified`, accepted-history or settlement flags.

Base-field extraction, integer interpretation, multi-component soundness and a reviewed composed security target remain inherited open obligations. The measurements will qualify this bounded CPU laboratory only; they do not establish validator cost, accelerated-path parity, a full-duration race or production readiness.
