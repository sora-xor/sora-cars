# Street terminal closure: first-release adapter contract

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


September 8, 2026. This is the selected contract for the next native Street closure adapter. It replaces the incompatible timing choices in the retained [Street draft](../world/native/STREET_TERMINAL_SPEC.md) and [Stock/Touring history policy](game-terminal-history.md) for a **new compiled profile**. Those files and their evidence remain unchanged. This document does not activate that profile, authenticate a session snapshot, establish a cryptographic security target or authorize settlement.

The generic execution, history and escrow interfaces remain application-independent. Street supplies its immutable state/action maps, termination rule and award projection. An authority-context hash is an identity input; possession of that hash does not establish that its contents came from consensus.

## 1. Use the earliest terminal state, checking removals before motion

Let `S_b` be the exact native state after `b` executed transitions and **before** removals effective at boundary `b`. Let `D_b` be the unique, sorted set of original roster slots whose consensus removal becomes effective there. Let `B` be the immutable accepted-input batch length, and `M` the compiled simulation cap.

The final first-release target is a boundary-aware computation. Define `J(S_b,D_b)` as the exact no-driving application of that boundary's removals and recomputation of eligibility and terminality. The admitted prefix is:

```text
0 <= N <= M
S_0 = compiled genesis
for b in 0 .. N:
    S_b.tick = b; S_b.done = 0
    J(S_b,D_b) is nonterminal
    S_(b+1) = exact Street motion after applying D_b once,
              with accepted controls at tick b
    S_(b+1).tick = b+1
J(S_N,D_N) is terminal
final_state = stop speeds without movement in J(S_N,D_N)
awards = exact ranking projection of final_state
```

The loop's upper endpoint is exclusive. For every `b<N`, both the state before removals and the adjudicated state must still be open. At `N`, either the preceding driving transition first produced a terminal state, or removals make an open boundary state terminal. In both cases apply `D_N` before awards. This also admits removal-only closure at genesis. `N` counts exactly the driving transitions actually executed; it is not the next accepted-batch boundary. No divisibility condition `N % B == 0` is imposed. No absorbing tick is appended, and no driving transition occurs in the adjudicator.

The existing [sequence verifier](../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/membership_sequence.rs) has a narrower interface: nonempty execution with the last **driving transition** setting `done=1`. It does not establish this boundary-aware grammar, action authority or adjudication. The new already-`done=1` finalizer closes the post-driving award adjustment only. A general proved prefix plus before-driving/genesis closure remains a required computation revision; current receipts must preserve that distinction.

| Removal boundary | Required effect |
| --- | --- |
| `b < N` | Apply authenticated removals once before motion and prove the boundary remains nonterminal; only then execute the tick. |
| `b = N` | Apply before awards, without a tick or new driving input. A finished winner can become ineligible. |
| `b > N` | Validate and retain the removal as subsequent input-key inactivity; leave the proved awards unchanged. |

For a six-tick batch and the retained finish at `N=8462`, the batch starting at `8460` has two executed controls per active slot and four retained suffix controls. The award boundary is `8462`, **not** `8466`. Existing generic forced removals occur only at batch starts. Consequently a removal at `8466` cannot affect this result, and an at-`N` removal is possible under that lifecycle only when `N` is itself a valid batch start. The application adapter must not invent a nonaligned removal or round one to a different tick.

The old Street draft treated `b=N` as economically ineffective and processed every preterminal removal through a driving tick; those choices are explicitly superseded for this new profile. The old Stock/Touring candidate uses a different batch-aligned termination predicate, so neither its proof nor its profile identifier qualifies this one.

## 2. The adjudication relation is separate from driving

The closure must bind the preceding verified prefix identity (or exact compiled genesis for `N=0`), complete pre-removal boundary state, all available last-transition outputs, complete selected-history identity, `N`, original roster and the **derived** set `D_N`. The verifier must derive that set from validated history; it cannot accept an unrelated prover-selected mask merely because the mask is hashed. Today's already-done finalizer must additionally require the exact complete terminal sequence receipt and cannot accept an unfinished prefix as that receipt.

Apply at-`N` removals to eligible cars, including `Finished`, `Running` at a technical win, and `Timeout` at the cap if that removal is legal in the lifecycle. Reject out-of-range slots, duplicates, already-applied removals and changes to the original roster. Under the current round bound, no removal round may start at `M`, so `D_M` must be empty.

Preserve the original tick, world/object state, positions, headings, energy, gates and complete raw output binding. Removed cars become `Forfeit`; their adjudicated finish fields use the native non-finish sentinel `(0,0,1)`. At a terminal boundary set every final speed to zero without advancing position or time. This matters when an open moving state becomes a technical win through removals: preserving the survivor's moving speed is not a canonical stopped result. Today's already-done inputs already have zero speeds, so its smaller relation cannot demonstrate this general case. No new collision, weather sample, boost, gate crossing or finish event is evaluated. If a separate adjudicated full output vector is exposed, every preserved field and every changed field must be explicitly constrained; diagnostic fields cannot become unconstrained advice. Keeping the immutable raw vector alongside a separately derived compact award result is also valid.

Recompute all competition ranks from the adjudicated eligibility and exact native finish fractions, without a slot-order racing tiebreak. All forfeits rank below eligible cars. Zero eligible cars means all-forfeit refund and no winners; one means technical win and that sole winner; otherwise every eligible rank-one slot wins. A technical winner may have native `Running` status. The final XOR/NFT recipient calculation must use this result and immutable escrow policy, without a second filter using removals after `N`.

The existing [Street lifecycle](../output/qualification/native-street-export-20261018/preimage/app/world/native/street_lifecycle.rs:254) gates new forfeits by `!previous_done`. An extra StreetStep after completion therefore cannot implement this finalizer. The existing sequence correctly rejects that extra step.

## 3. Zero-step and before-driving closure are explicit remaining branches

The current nonempty sequence and already-done finalizer do **not** implement `N=0`. Ordinary Street genesis with 2–8 racers is open. The required zero-driving branch must take the exact compiled genesis, authenticate legal removals at boundary zero, apply a no-driving adjudicator, and prove the resulting terminal predicate. It cannot use a caller-supplied already-terminal state or an empty component-proof vector as a successful complete sequence.

Required zero-step cases are all-forfeit and a sole eligible technical winner, with genesis positions, zero elapsed time and no consumed driving control. If at least two racers remain eligible and no independent genesis-terminal rule exists, zero-step closure rejects. Pending or forced batch bytes beginning at zero remain retained history and must still be validated.

This is a real distinction from the current numerical fixture: a pre-transition removal pulse at `b=0` is processed by StreetStep and yields first `done` at tick 1. More generally a removal at open boundary `b` can produce terminal output at `b+1`; the surviving car can move during that native step. Those fixtures prove the current component convention, **not** the selected final rule: if removals already make boundary `b` terminal, stop at `b` without movement. The new compiled terminal interface must prove a nonterminal post-removal boundary before each driving tick, support a final boundary halt as well as a post-driving halt, and support its genesis case. Until those branches are implemented and qualified, full terminal-policy coverage remains false.

## 4. Checkpoints are before same-boundary removals

For a selected checkpoint at `c <= N`, compare its state root to the proven prefix state `S_c`, before `D_c`. Its transcript prefix contains controls at ticks `<c` and removals at boundaries `<c`. A checkpoint at `c=N` therefore binds the pre-removal boundary state, not the adjudicated award state; that state can be nonterminal if the removals cause closure. Validate the checkpoint's terminal flag against that same pre-removal state. A zero-step technical/refund closure can validly start from a nonterminal genesis checkpoint.

A selected terminal checkpoint inside a batch needs an explicitly versioned prefix commitment capable of representing the executed offset while preserving the original whole batch. The retained candidate's `transcript.batches[..c/B]` scheme cannot express this. Nonterminal checkpoints and anchors remain batch-aligned under the current lifecycle. A selected checkpoint after `N` cannot replace the required proved-prefix checkpoint; merely having valid signatures does not prove that it is the correct state.

Verify signatures against **all original roster input keys**, in unique slot order and exact network/session/epoch domains. Removing an input key does not retroactively weaken an earlier certificate's signer set. Genesis is the sole explicitly unsigned checkpoint exception and must match compiled genesis exactly. State roots, signature validity and transcript roots are separate checks.

## 5. Validate the entire retained input history

The new canonical selected-history snapshot must bind at least the network/session, profile and complete compiled rules/catalog/geometry identities; original wallets/input keys and admission/equipment/escrow terms; lifecycle revision, phase, epoch, deadline and finalized snapshot identity; checkpoint payload and certificate, immutable anchors, full forced batches and removal markers; pending certificate, current commitments, available matching reveals and `next_tick`. Bound lengths and aggregate input bytes before allocation, indexing, application decoding or hashing. This is a new complete snapshot identity, not the existing partial `dispute_root` with a stronger label.

Validate batches over the **whole accepted interval** through `next_tick`, even where the simulated prefix has already stopped:

1. Enforce immutable batch geometry, checked arithmetic, legal start `<M`, end `<=M`, exact epoch order and original slot count. Preserve cumulative native input limits. Forced batches may be separated by a certified interval; validate their placement relative to the selected checkpoint/epoch and require contiguous coverage from that checkpoint to `next_tick`.
2. Require a bijection between each original participant's single removal marker and exactly one forced batch's sorted `dnf_slots`. No invented, duplicate, omitted, relabeled or backdated removals. A slot already removed before a round is inactive; slots removed by that round count as active when checking whether the round was allowed to start. Reject rounds after the lifecycle has lost its minimum active participants, reached its cap or accepted a terminal checkpoint.
3. Canonically decode every surviving slot's full input payload, including the unexecuted suffix of a partly executed batch and all later batches. Previously removed slots have the exact inactive encoding, not an alternative all-zero active payload. Compare every executed control with the corresponding original payload offset; never rewrite signed bytes to shorten a batch.
4. Verify available reveals against the exact retained commitment with its network/session/epoch/start/slot domain. A commitment's mere presence is insufficient. Anyone may submit matching bytes; the submitter is not gameplay authority. Validate pending certificates with their exact parent checkpoint, epoch, commitment-set length and original-key signatures, and preserve the selected commitment set through dispute resolution.
5. A pending certificate supplies no missing pre-`N` controls. Do not replace an unrevealed accepted control with neutral input or select an earlier favorable checkpoint. When a whole committed batch lacks a required reveal, consensus resolves at its batch-start boundary; that removal may be before `N` and change the required replay. Known collisions cannot be undone by dropping the certified batch.
6. Later resolved controls and removals remain bounded, canonical and inside the full snapshot commitment. They do not become padding or change awards. A reveal for a batch starting at/after `N` may remain unresolved if the lifecycle permits that retained frontier; require exact available commitments/reveals and legal phase/deadline relationships rather than fabricating missing bytes. An unresolved batch overlapping the executed prefix cannot justify missing prefix controls.

Retain distinct identities for the complete accepted-history snapshot, the exactly executed `N` rows and the adjudicated output. Rebuilding a proof against changed selected history is mandatory even if the driving prefix and winners happen to be identical. Consensus must select/validate the authoritative snapshot, or a standalone verifier must authenticate it against a pinned finalized-ledger trust context. Neither this structural validator nor a supplied authority hash establishes that step.

## 6. Located native candidate and its exact limits

The private helper exists; it is not in the maintained `../iroha` execution-proof directory. These four inspected copies are byte-identical, SHA-256 `73f7007286247d9220c2c7bef04f5d07f5294d7e373ae29c86f3d623acb9f369`:

- [Original private implementation](../output/implementation/game-equipment-consensus-v1/registry/crates/iroha_core/src/execution_proofs/game_history.rs).
- [Attempt-5 frozen proof snapshot](../output/qualification/game-registry-v1/attempt-5-terminal-history/snapshot/crates/iroha_core/src/execution_proofs/game_history.rs).
- [Coherent integration candidate](../output/qualification/game-coherent-integration-v1/attempt-2/tree/iroha/crates/iroha_core/src/execution_proofs/game_history.rs).
- [Cross-repository release candidate](../output/qualification/cross-repo-release-candidate-v1/attempt-1/tree/iroha/crates/iroha_core/src/execution_proofs/game_history.rs).

Useful checks already present include bounded geometry; exact removal-set equality plus the observed-removal-round count; no rounds after quorum loss or a terminal checkpoint; checkpoint-before-removal prefix roots; original-key signatures; complete forced-tail canonical decoding and coverage; and preventing a pending certificate from supplying an unresolved pre-terminal prefix. These checks are implementation evidence to preserve, not a Street authority bridge.

Two concrete gaps prevent wholesale reuse. First, the helper requires `terminal % batch_ticks == 0` and exactly `terminal/B` replay batches; the paired [Touring reference](../output/qualification/game-registry-v1/attempt-5-terminal-history/snapshot/crates/iroha_core/src/execution_proofs/classed_race_v1/reference.rs:94) deliberately delays normal terminality to a batch boundary. Second, `game_history_root_v1` hashes only session ID, epoch, checkpoint payload, anchors and forced batches. It omits pending certificates, current commitments/reveals, `next_tick`, phase/deadline/revision and explicit participant removal markers. The helper checks some omitted fields structurally; that does not bind them into the root. Its available-reveal loop checks commitment presence and canonical payload shape, but does not recompute the reveal commitment. On an untrusted supplied snapshot, changing a canonical current reveal while preserving a present commitment illustrates this gap; it is not evidence of an accepted on-chain exploit because native reveal admission checks the match.

The retained [attempt-5 report](../output/qualification/game-registry-v1/attempt-5-terminal-history/report.json), SHA-256 `6aaf352f1306c3e82771a45c1469e2c92d17dcabbcc92e0bd6c159005b9f2e2f`, records five successful selected command groups, no source drift and `qualified=false`. It covers isolated native modules and short Stock/Touring proofs, not this new Street policy. The [coherent manifest](../output/qualification/game-coherent-integration-v1/attempt-2/manifest.json), SHA-256 `2d9ef223fe7b181531599500f51c8939ab6c2326dfaad131e640dfac4583b01c`, records `applied=false`. The earlier [helper attempt-1 report](../output/qualification/game-history-cutoff-v1/attempt-1/report.json) names a different helper hash; its tests must not be attributed to the four current copies without their own provenance.

The maintained [generic lifecycle](../../iroha/crates/iroha_core/src/smartcontracts/isi/game.rs:838) resolves forfeits at `next_tick`, records a complete fixed batch, increments tick/epoch, clears the pending/current frontier and stops progression below the minimum active count. [Checkpoint admission](../../iroha/crates/iroha_core/src/smartcontracts/isi/game.rs:313) permits unaligned **terminal** certificates but preserves same-frontier pending commitments; [reveal admission](../../iroha/crates/iroha_core/src/smartcontracts/isi/game.rs:793) verifies the exact commitment. These are relevant integration rules. The maintained history hash remains partial, and its older Touring history adapter rejects removals after terminal. No maintained source was edited or built for this review.

## 7. Required next evidence

The smallest useful closure proof should bind a real verified sequence receipt and unchanged raw terminal outputs to a complete no-driving adjudication relation. Exercise an at-`N` winner removal, all-forfeit and technical outcomes, exact ties, a removed finisher, a timeout candidate, unchanged world/cursor/diagnostics and foreign sequence/mask/history replay. Label supplied numerical removal masks as fixtures until the history authority bridge exists.

The next history suite must separately cover `N=B*k+2`, removals at `N-1/N/N+1` where lifecycle geometry permits them, a complete retained intra-batch suffix, a malformed later control, absent pre-terminal reveals, matching third-party reveals, altered pending/current reveals with an unchanged old dispute root, duplicate/omitted marker-to-batch matches, stale epochs/snapshot revisions, checkpoint state before same-boundary removal, and forbidden rounds after quorum loss or at the cap. Test zero-step genesis closure only once its distinct branch exists. A component proof or structural snapshot check must never report accepted history, ledger finality or economic settlement without the corresponding qualified adapter.
