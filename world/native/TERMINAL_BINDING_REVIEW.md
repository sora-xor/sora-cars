# Terminal and public-input binding review

Reviewed September 7, 2026. Source inspection only; no Iroha writes, Cargo builds, network operations, or cryptographic qualification. This report concerns the new street computation, not the already distinct stock/Touring computations.

**Recommendation:** preserve `ExecutionTrace` as a generic structural verifier, and introduce a compiled admission/boundary program for complete computations. A street settlement profile must require the first terminal state, bind its exact executed step count and action prefix, project the canonical result from that state, and reconcile the complete accepted consensus history. Neither a Merkle commitment to rows nor a successful three-tick structural verification supplies those semantics.

## Existing guarantees and their limits

| Component | What the inspected code establishes | Remaining admission obligation |
| --- | --- | --- |
| [`ExecutionTrace::new`, `verifier`, `verify_step`, `finish`](execution_trace.rs) | Copies the boundary map, initial values, public actions, and final claim. Each verified output supplies the next state through fixed port indices. Exact row/action lengths and canonical fields are enforced; failure poisons the stream. | The caller selects the initial context and action tape. `finish` means the supplied trace is complete, not that an application has terminated. Accepting a valid unfinished three-tick trace is intentional. |
| [`StagedCircuit`, `StreamVerifier`](staged_constraints.rs) | Detached polynomials and all limb memberships, fixed-value obligations, wire-identity carry, unused-column zero padding, and input/output equalities. | This is raw verification. The lookup checks, boundaries, and constraints still need a complete cryptographic representation. Stage-local zero padding does not define extra power-of-two proof rows. |
| [`race::build`](../../output/qualification/native-street-export-20261018/preimage/app/world/native/street_race.rs) | Validates the exact grid when `tick=0`; recomputes prior `done` from prior car states; constrains complete movement, hazards, lifecycle, ranking, and output state. | Controls and `consensusForfeit` are numerical inputs. They are not authenticated merely because their ranges are proved. A caller must bind the complete graph, geometry, catalog, and roster to the compiled profile. |
| [`append_step`, `append_ranking`](../../output/qualification/native-street-export-20261018/preimage/app/world/native/street_lifecycle.rs) | Canonical lifecycle fields, ordered gates, exact finish fractions, forfeit precedence before closure, timeout, and competition ranks. | A display ranking exists for a running race. An admission layer must require a terminal computation before deriving payout winners. |

The relevant maintained-Iroha precedent is a separation of responsibilities. [`ExecutionPublicInputsV1`](../../../iroha/crates/iroha_data_model/src/execution_proofs.rs) contains network, session, manifest, roster/admission, transcript, dispute, and outcome commitments. [`SettleGameSessionV1`](../../../iroha/crates/iroha_core/src/smartcontracts/isi/game.rs) checks the expected session context, calls the compiled proof/history adapter, then applies payouts and records settlement. Those interfaces are useful precedents, not evidence that a new street profile is admitted.

## P0: define canonical completion separately from valid prefixes

Let `S_i` be the state before active transition `i`, `A_i` its accepted action, `D_i` its derived `done` bit, `N` the number of executed transitions, and `T` the final native tick.

For the current full-genesis street relation, the minimal complete-computation policy is:

```text
S_0 = the compiled/admitted genesis state, with tick=0 and done=0
1 <= N <= profile.max_ticks
D_i = 0 for every i < N
S_(i+1) = NativeStep(S_i, A_i) for every i < N
D_N = 1
T = S_N.tick = N
public final state = S_N
```

These are proposed compiled predicates, not implemented acceptance rules. The first-terminal requirement excludes extra gameplay rows after closure; the final `done` requirement excludes arbitrary prefixes. `T=N` agrees with the current graph's one-tick increment while executing and frozen tick after closure. It must not be inferred from an untrusted serialized length. A resumed segment instead needs a separately authenticated initial checkpoint and a specified offset; a terminal checkpoint with no further execution needs a deliberately separate zero-step policy.

The generic boundary program can remain application-neutral: fixed input/output port maps, an admitted initial vector, action-column bindings, a Boolean halt output, a bounded monotone cursor, exact step-count predicates, and terminal-vs-prefix purpose. Port identities and policy are compiled into the relation/profile. They are not optional flags supplied by the proof. The street adapter selects the actual `done` and `tick` ports and the game's initial state.

Do not add a blanket “all car statuses are terminal” predicate. The current graph legitimately closes when exactly one non-forfeited racer remains, even if that car's status is still `RUNNING`; its speed is then zeroed and it receives a technical win. The existing derived `done` predicate captures this correctly.

## P0: distinguish three different kinds of padding

1. **Unused cells inside a staged tick:** already forced to zero according to compiled wire liveness.
2. **Gameplay after the first terminal state:** the native graph accepts absorbing transitions and keeps its tick fixed. This is useful for rendering/testing, but a canonical complete replay should not append arbitrary such actions.
3. **Extra rows needed for a proof domain:** not yet defined by the structural trace API. The proof profile must derive the active length, stage count, final-active row, padding selectors, and domain size independently of the prover.

Choose an exact proof-padding layout. One viable policy copies the final carried state through designated boundary columns and forces non-state witness cells to fixed canonical values, using separately compiled padding constraints. Another is a fully specified inactive transition layout. In either case, constrain the selector schedule, all padding cells, and the final claim at the last active transition; do not bind the result merely to the last power-of-two row.

Not every output is persistent state. `justFinished`, contact feedback, and similar diagnostics can change on an absorbing transition even while every carried car field remains frozen. The adapter must explicitly distinguish state ports, outcome ports, and transient feedback. It cannot silently repeat or zero an arbitrary whole output vector.

## P0: bind accepted history without losing pending inputs

The proof-facing action tape needs a deterministic adapter from authenticated consensus/session history, not a worker-authored list of plausible controls. At minimum bind:

- Network, session, immutable manifest/profile, compiled rules/track/catalog, roster order, wallet-to-slot and authorized-input-key mapping, equipment/performance admission, initial state, and proof representation version.
- Every executed control, its slot/tick, and every applied consensus removal, with exact shapes and canonical ordering.
- The latest selected certified checkpoint, all retained transcript anchors, the pending certified commitment set, matching reveals, forced batches, and the selected dispute epoch/history root.
- Exact executed length, final state, canonical outcome, and replay bytes sufficient to reconstruct the commitments.

A commitment set is not the revealed input tape. A valid signature is not finalized consensus inclusion. A `consensusForfeit=1` field is not a consensus decision. Either consensus checks this evidence and the proof binds its resulting canonical tape, or the proof relation must itself verify the corresponding evidence with an admitted trust context. A standalone verifier must receive an independently authenticated expected statement; accepting the envelope's own statement establishes computation relative to a claim, not its authority to spend escrow.

The maintained [`classed_race_v1/history.rs`](../../../iroha/crates/iroha_core/src/execution_proofs/classed_race_v1/history.rs) is a concrete pattern: it derives expected statement values from a supplied session, checks checkpoint key signatures and state/transcript roots, compares exact removals with retained participant history, and verifies contiguous forced batches. Its comment explicitly leaves finality authentication to the caller. The generic [`game.rs`](../../../iroha/crates/iroha_core/src/smartcontracts/isi/game.rs) also retains pending certificates and prevents their replacement at the same checkpoint. A street adapter must preserve these obligations with its own timing semantics.

**Intra-batch finish needs an explicit rule.** Street can finish on any tick. A jointly certified six-tick input batch may contain an unexecuted suffix after that finish. Do not discard the certificate or rewrite the signed bytes to make the transcript appear shorter. Bind the complete accepted batch/certificate history and a deterministic executed prefix ending at `T`; specify whether these use separate roots or an explicitly typed combined commitment. Proof-domain padding is not additional accepted gameplay. The existing stock/Touring adapter's six-tick terminal alignment cannot simply be copied.

For removed input keys, choose one canonical unused-control encoding. The maintained Touring admission code requires zero controls after removal. The street graph's numerical constraints alone allow ignored nonzero controls, so transcript canonicalization belongs in the new adapter even though these controls cannot move an inactive car.

## P0: resolve terminal-boundary removal semantics

There is a real design mismatch to resolve before reusing the old history adapter:

- Street consumes a forfeit at the beginning of a simulated transition, can forfeit a previously finished car while the overall race remains open, and then advances the tick. Once `previous_done=1`, later forfeit inputs do not change the result.
- The maintained stock/Touring history supports a removal event at a six-tick terminal boundary, potentially ending a race before the following six controls execute. Touring's history verifier explicitly preserves this exception.

A new street profile must specify which consensus event boundaries map to which native transitions. It must reject or resolve a history containing relevant removals outside the proved execution; it cannot silently truncate them at a worker-selected earlier finish. Conversely, it cannot alter the street computation by retroactively applying a post-closure removal that its absorbing state machine ignores.

Keeping Street's first-terminal semantics is a coherent option if history selection seals the accepted prefix and resolves withheld reveals at or before that prefix. Supporting additional post-finish disqualification would require an explicit compiled adjudication/closure transition and new versioned semantics. This audit does not select a new rule on behalf of the game. The choice must be frozen before the proof's terminal predicate and history adapter are finalized.

## Canonical result projection for this street relation

The adapter should derive the entire typed outcome from the proven final state, not trust a separately supplied ranking or winner list. The current native ordering is:

- Eligible racers precede all forfeits. All forfeits tie below the eligible racers.
- Finished eligible racers precede unfinished eligible racers. Finish order compares `finishTick`, then exact cross-products of `finishNumerator/finishDenominator`, with no slot tiebreaker. The represented finish time is `(finishTick - 1) + numerator/denominator`.
- Among unfinished eligible racers, more gates then greater progress wins. At the cap, remaining running racers become `TIMEOUT`.
- Ranks are one plus the number of strictly better racers. Equal performances receive equal ranks.

When `done=1`, derive `winner_slots` as all eligible rank-one slots in canonical ascending slot order. **Exception:** when `refundAllForfeit=1`, derive an empty winner list and the explicit refund outcome; all forfeits having rank one must never be interpreted as all of them winning. Exactly one eligible racer produces the existing technical win. Preserve all exact ties for escrow splitting. Slot order may encode the list or support a separately specified indivisible-asset policy; it must not break a racing tie.

Bind the full native final-state encoding and the canonical generic result projection into the statement/proof transcript. Keep the simulation-generated finish numerator and denominator rather than accepting arbitrary equivalent fractions; complete trace constraints already determine them. Payout amounts, stake liabilities, NFT eligibility, integer remainder treatment, and duplicate-settlement prevention remain generic ledger obligations. A proof of correct ranking alone does not authorize an arbitrary transfer list.

## What the existing streaming code contributes

The inspected [`aggregate_stark.rs`](../../../iroha/crates/iroha_core/src/execution_proofs/stark/aggregate_stark.rs) supplies exact-width ordered column streaming, shaped Merkle commitments/frontiers, retained mask/polynomial material, and deterministic replay for openings. Several entry points are gated by `test` or `privacy-release-evidence`; some helpers are test-only. Their presence is not a deployed street prover.

These mechanisms bind the selected row/column data. They do not decide whether the data describes the intended network, race, accepted input history, or a terminal computation. The source callback is a witness producer, not an authority. The street integration needs the same commitment roots to cover all active/padding cells and every lookup obligation, and must bind the entire compiled schedule and public boundary context before deriving dependent Fiat–Shamir challenges.

Existing adapters illustrate the missing bridge. Stock [`RaceAdapterV1::public_input_digest_v1`](../../../iroha/crates/iroha_core/src/execution_proofs/proof.rs) includes profile, typed statement, replay, final state, and checkpoint state. Touring's [`fixed_row`](../../../iroha/crates/iroha_core/src/execution_proofs/classed_race_v1/staged_race_air.rs) derives phase/first/final/checkpoint/control selectors from its stored public context. Touring [`validate_payload`](../../../iroha/crates/iroha_core/src/execution_proofs/classed_race_v1/admission.rs) separately rejects nonterminal results and mismatched commitments. Reuse this separation of responsibilities, not the old physics, batch assumptions, or proof parameters.

## Smallest next acceptance tests

Before a cryptographic complete-street profile is registered, require:

1. A valid three-tick prefix remains accepted by the structural API and is rejected by terminal admission.
2. Honest first-terminal completion is accepted; a shorter prefix, an appended absorbing gameplay tick, changed `T/N`, a second alleged terminal point, and malformed final/padding selectors are rejected.
3. Every carried final state field and outcome field is independently bound; altered winner ordering, omitted tied winners, all-forfeit rank-one-as-winners, wrong technical wins, and coherent alternative finish fractions fail.
4. The same valid trace cannot cross network/session/profile/roster/input-key/track/catalog/equipment contexts or use a worker-selected checkpoint.
5. A valid numerical forfeit without the selected consensus event fails. Reordered/omitted removals, stale epochs, discarded pending inputs, and competing checkpoint histories fail.
6. An intra-batch finish retains all signed input data while executing only its specified prefix. The chosen terminal-boundary removal policy has an explicit positive fixture and rejection fixtures for the competing interpretation.
7. Canonical proof padding and all limb membership checks survive the streaming commitment/opening path. A commitment-only success is never treated as successful relation verification.

## Source pins

SHA-256 at inspection; these are code-provenance pins, not release attestations:

| Source | SHA-256 |
| --- | --- |
| `world/native/execution_trace.rs` | `7aec3b33b0e4ee9da94259b7c3e2a7bee464270a879a99c6b9656aa039b03efb` |
| `world/native/staged_constraints.rs` | `a13862bd91956daf3ff5331a63a45bca45a7c6baa97127526b971aaecbdbc4fb` |
| `world/native/street_race.rs` | `57d2acefc5a5617c957e21475ca327f5c97fec9d5b82465da8d5630cf8d05a74` |
| `world/native/street_lifecycle.rs` | `4b5d7af573002ba56c620871e5c9227bf2d41392acc1bed8c8aee8c2250dd2b5` |
| `iroha/.../iroha_data_model/src/execution_proofs.rs` | `a05f78869a1499bb9509d4b194ff53b03b8e8d6798dd9b903472b8430b1b12be` |
| `iroha/.../execution_proofs/stark/aggregate_stark.rs` | `b16e8e505a1bcbc99584807ef06f66ad723cfc95ee9fa0c618a7914f0f28db0d` |
| `iroha/.../execution_proofs/proof.rs` | `9ec38c034184e0b355bcead2cf8a48476d27fc001f3ab122e6aa28b56ba1344f` |
| `iroha/.../classed_race_v1/admission.rs` | `7587f07c9edd95227275a303ffc548420c2fbceff59e58b30c7071ff9f4f2580` |
| `iroha/.../classed_race_v1/history.rs` | `07a11803be4082f09d00c8b6f36780216c2fc0cfefdec4730c2713e9f14e3157` |
| `iroha/.../classed_race_v1/staged_race_air.rs` | `cb521c1500654c2d9728cd8a5739ea3470c067eb0344f0acdfa34d399f55a2f2` |
| `iroha/.../smartcontracts/isi/game.rs` | `16c6c4dc0413dbceeae40eb858c47186c8cd9b8e8270ee6081b8a69815c161d2` |
