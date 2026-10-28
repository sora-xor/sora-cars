# Street terminal admission and accepted-history specification

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


September 8, 2026. This is the selected design for the new Street adapter, based on current source and retained local evidence. It does not register an Iroha profile, authenticate a public network, or qualify a full-race cryptographic proof. The generic execution and escrow interfaces remain game-neutral; the Street adapter supplies compiled port identities, rules and result projection. No maintained-Iroha source or builds were changed for this audit.

This document resolves the timing choices identified in [the terminal review](TERMINAL_BINDING_REVIEW.md). The first implementation can qualify terminal predicates and result projection independently. It must describe accepted-history authority as pending until the consensus adapter below is implemented.

## 1. First terminal state is the result

For the compiled genesis state `S_0`, exact accepted actions `A_0..A_(N-1)` and native step function:

```text
1 <= N <= compiled max_ticks
S_0.tick = 0; S_0.done = 0; all other state = compiled genesis
for i = 0..N-1:
    S_i.tick = i; S_i.done = 0
    S_(i+1) = StreetStep(S_i, A_i)
    S_(i+1).tick = i+1
    S_(i+1).done = (i+1 == N)
public final output vector = every output of transition N-1
```

`N` is the number of active transitions, not a prover-selected stopping hint. Zero-step completion and resumed checkpoint segments are excluded from this initial policy. A future segment profile needs its own authenticated initial checkpoint, cursor offset and composition rule. The generic structural prefix verifier remains valid for unfinished computations.

For a staged tick with `R` rows and width `W`, the active row count is `N*R`, checked for overflow and profile capacity. Any proof-domain rows after that have **all W cells zero**, with fixed public selectors. They are not additional Street transitions. The terminal claim refers to the last active transition, never the last padded row. Stage-local unused cells, global proof padding, and the native graph's absorbing post-finish transitions are distinct. Complete admission rejects an appended absorbing gameplay tick even though the graph accepts it for presentation/testing.

The graph's [`append_ranking`](../../output/qualification/native-street-export-20261018/preimage/app/world/native/street_lifecycle.rs) defines `done` as either at most one eligible racer, or no remaining `RUNNING` racer. Therefore a sole eligible car can legitimately remain `RUNNING` at a technical win. Every car's final speed is nevertheless zero. Do not replace this predicate with “all car statuses are terminal.”

## 2. Exact compiled port map

These are **port indices**, not graph-node indices, lowered-wire indices or reusable staged columns. The adapter must derive/check them against its own compiled `RaceGraph` and bind the complete layout into its descriptor. It must not accept a replacement layout from replay bytes.

Let roster size be `P`, object count be `C`, and `B_s = 8 + 5*C + 22*s` for slot `s`.

| Meaning | Input port | Output port |
| --- | --- | --- |
| Tick cursor | 0 | 0 |
| Derived done bit | 1 | 1 |
| Broken-object state mask | 2 | 2 |
| Car persistent field `j`, in order below | `3 + 13*s + j` | `B_s + j` |
| Six-bit controls | `14 + 13*s` | No state output |
| Consensus forfeit pulse | `15 + 13*s` | No state output |
| Rain, wind feedback | Not carried | 3, 4 |
| All-forfeit refund, technical win | Derived, not carried | 5, 6 |
| Object count | Compiled constant | 7 |
| Object `o` descriptor fields | Compiled constants | `8 + 5*o .. 12 + 5*o` |
| Car rank | Derived, not carried | `B_s + 11` |

The eleven persistent fields, with `j=0..10`, are `progressMm`, `lateralMm`, `speedMmPerTick`, `bodyYawMicroturn`, `velocityYawMicroturn`, `energy`, `nextGate`, `status`, `finishTick`, `finishNumerator`, `finishDenominator`. Per-car feedback at offsets `12..21` is `drifting`, `boosting`, `slipMicroturn`, `oil`, `oilCrossed`, `propHitMask`, `wallContact`, `carContact`, `gatesCrossed`, `justFinished`. Object fields are `kind`, `progressMm`, `lateralMm`, `halfLengthMm`, `halfWidthMm`.

The current Tokyo bundle has `C=12`, so car outputs start at `68+22*s`. Eight racers have **107 inputs and 244 outputs**; two have 29 inputs and 112 outputs. Persistent state has `3+11*P` entries. There are `2*P` action columns; the adapter must freeze their order explicitly. A convenient native order is alternating `[controls_0, forfeit_0, controls_1, forfeit_1, ...]`. The browser session's action journal instead stores all controls followed by all forfeits; neither convention can be assumed from vector length alone.

Generic terminal-policy mapping is cursor input/output `0/0`, halt input/output `1/1`, with both input sources `State { initial: 0, previous_output: same_output }`. All other state sources use the exact native `initial_inputs` values and matching output port by compiled name. Controls and forfeits are `Action`, never state. The compiled genesis car row is `[-1-3999*floor(s/2), lane, 0, 0, 0, 1000, 0, 0, 0, 0, 1]`, with lane `-950` for even slots and `950` for odd slots. The broken-object mask is zero.

The result binds **all** final outputs. `justFinished` can be one at the actual finish and zero on an absorbing step; persistent-state equality cannot stand in for full terminal-output equality. Decode signed fields using their compiled bounded integer interpretation in Goldilocks, reject noncanonical encodings, and use checked conversion. The output descriptors and native field bounds remain part of the compiled relation.

## 3. Accepted history and removal timing

### Selected policy: first-terminal priority with conditional consensus removals

A finalized removal decision at logical boundary `b` means: **forfeit this slot before transition b, if the computation is still open at S_b**. The decision is consensus-authorized, with its exact epoch, reason and expired block-height deadline. It is not a wallet-signed gameplay command. First-terminal priority is fixed in the profile; the prover cannot select it.

For a proven first terminal at `N`, every selected decision is retained and deterministically classified:

| Effective boundary | Required interpretation |
| --- | --- |
| `b < N` | Apply one pulse to that slot in `A_b`, before motion/checkpoints. Later pulses for the same slot are invalid. |
| `b >= N` | Retain the full decision with disposition `ClosedBeforeEffectiveTick`; it has no effect on eligibility or outcome. It is not removed from the history commitment. |

The second case handles delayed proof production and forced input rounds opened while a terminal checkpoint signature is withheld. It is deliberately **not** an unconditional disqualification subsequently ignored by the worker. Consensus must authorize the conditional rule, preserve the original roster identity, and distinguish an input key removed from subsequent input collection from an applied simulation forfeit. Once a terminal proof seals the result, later submissions cannot revise it. The old participant `dnf_at_tick` interpretation cannot simply be relabeled as this new record type.

When `b<N`, the current native transition can forfeit a car that already finished individually while other racers are still competing. Its finish fields become canonical non-finish sentinels, its previous progress is preserved, and it ranks below every eligible car. A forfeit that leaves one eligible racer produces a technical win at output tick `b+1`; removing all remaining racers produces an all-forfeit refund at `b+1`. No zero-step boundary result is invented. A decision at `b=N` cannot disqualify a winner after closure.

### Certified suffixes are retained, not replayed as padding

Maintain two explicitly typed commitments:

1. `acceptedHistoryRoot`: the full selected checkpoint/certificate chain, pending certified commitment sets, matching reveals, forced batches, conditional removal decisions, deadline/epoch resolutions and final history seal.
2. `executedActionsRoot`: the canonical `N` rows actually executed, including applied removal pulses, plus the deterministic mapping to that accepted history.

The seal binds the session's selected finalized history snapshot after its fixed challenge/deadline windows. A standalone verifier must authenticate that snapshot against a pinned network trust context; the proof envelope cannot supply its own authority. Bind the immutable network/session/profile, rule/track/catalog digests, initial state, ordered wallet/input-key roster, equipment admission, and escrow terms alongside these roots. Consensus queries alone do not establish finality.

If a six-tick batch starts at `b` and the native computation finishes at `N` inside it, execute precisely offsets `0..N-b-1`. Preserve the **entire original signed batch and reveals**, including the remaining offsets, under `acceptedHistoryRoot`. Record the executed offset/count explicitly and derive it from `N`; do not rewrite signed bytes or append ignored controls as gameplay rows. Later retained rounds are similarly classified as after closure, not silently omitted. The same rule works with other immutable batch sizes; Street does not require `N` divisible by six. In the retained full fixture, `8462 = 8460 + 2`, leaving four unexecuted offsets in a six-tick batch.

The latest selected certified checkpoint must be a state on the proved prefix (`tick <= N`), with exact state and transcript roots. Retained checkpoint candidates or messages after closure can remain audit data, but cannot replace this selected checkpoint or supply an unproved state. Every selected checkpoint/anchor and pending certificate must be reconciled against the full execution, rather than treating valid signatures as proof of correct physics.

For unfinished races, the selected pending commitment set is immutable: same checkpoint/epoch cannot replace or discard it. Anyone can submit a matching reveal or valid certificate. If all relevant controls were already revealed, withholding the next checkpoint/final signature cannot undo their collisions: the dispute process admits those same controls. If a required reveal is still missing when its fixed deadline expires, consensus resolves that batch using its authorized removal at the batch's **start** boundary; it preserves every available reveal and the original commitment set. No peer invents replacement controls or applies a local forfeit.

Use one removal pulse per applied slot. Controls of a removed slot are zero from its effective boundary onward in executed rows; the retained history still contains the exact original commitments and any evidence required by the resolution. Eligible finished cars may retain exact committed six-bit controls while the overall race is open; the native graph ignores them. Do not introduce a state-dependent rewrite of signed control bytes. The whole public input tape must remain sufficient for independent reconstruction, with no replay server dependency.

These rules prevent active-race refunds due merely to a missing final signature: that invokes checkpoint selection/reveal resolution, followed by the already determined terminal result or bounded progress. Only a proven all-forfeit outcome refunds an active race. Unstarted expiry remains a separate generic cancellation policy.

### Maintained-Iroha integration boundary

Current [generic game code](../../../iroha/crates/iroha_core/src/smartcontracts/isi/game.rs) preserves a pending certificate at the same checkpoint, requires exact commitment-matching reveals, advances fixed block deadlines, and records forced batches. Its [Touring history adapter](../../../iroha/crates/iroha_core/src/execution_proofs/classed_race_v1/history.rs) checks session-derived statements, checkpoint signatures/roots, ordered removals and contiguous batches, but specifically permits a removal **at** a six-tick terminal boundary. [Touring admission](../../../iroha/crates/iroha_core/src/execution_proofs/classed_race_v1/admission.rs) also requires terminal alignment to six ticks.

That timing is incompatible with Street's first-terminal transition semantics. Implement the new conditional-decision/history projection in generic session facilities with a compiled adapter; do not copy Touring's terminal exception or introduce race-specific ISIs. A structural terminal test using caller-supplied forfeit numbers remains a numerical fixture until this authority bridge is tested. Reject unconditional legacy removal evidence for the new policy, and reject stale or partially supplied selected histories rather than manufacturing a seal.

## 4. Exact typed result and escrow boundary

The current [Street adapter](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/street_terminal.rs) derives this compact typed projection from the proven final outputs. Its adapter version binds the semantics; these Rust types are not yet a deployed canonical ledger codec:

```text
StreetOutcome {
    tick: u32,                    // 1..compiled max_ticks <=9000
    kind: Ranked | TechnicalWin | RefundAllForfeit,
    cars: Vec<CarOutcome>,        // exactly compiled roster, original slot order
    winner_slots: Vec<u8>         // bounded, sorted, unique; derived as below
}
CarOutcome {
    slot: u8, rank: u8,
    status: Running | Finished | Forfeit | Timeout,
    progress_mm: i64, next_gate: u8,
    finish: Option<FinishTime>
}
FinishTime {
    tick: u32, numerator: u32, denominator: u32
}
```

All fields additionally obey the compiled bounds, not merely the Rust storage width. Native status values map exactly `0=Running, 1=Finished, 2=Forfeit, 3=Timeout`; a future wire codec must fix these discriminants explicitly. The complete final claim separately contains the world mask, all eleven persistent car fields and all diagnostics/catalog values. These must remain bound even though the economic projection omits them. Do not reduce the simulation-generated finish fraction or accept a separately supplied equivalent pair. The projection checks zero speed for every final car. Non-finishers have `finish=None` only after checking the native sentinel fields are exactly `(0,0,1)`.

Derive eligibility as `status != Forfeit`. Recompute all ranks independently in the adapter and compare the native rank outputs: eligible beats forfeit; finished eligible beats unfinished; finished cars compare `finish_tick`, then exact cross-products of the two fractions; unfinished cars compare greater `next_gate`, then greater `progress_mm`. A rank is one plus the number of strictly better racers. This preserves exact ties with no slot tiebreak. The represented finish time is `(finish_tick-1 + numerator/denominator)/30` seconds. Small bounded `u64` cross-products suffice; use checked arithmetic.

Require native `done=1`, `refundAllForfeit == (eligible_count==0)`, and `technicalWin == (eligible_count==1)`. All-forfeit has **no winners**, even though every native rank is one. Technical has the sole eligible slot. Ranked has every eligible rank-one slot in ascending encoding order. With at least two eligible cars, terminal status must mean no `RUNNING`; some may be `TIMEOUT` at the cap. Do not infer “completed course” from `done` alone.

The generic envelope binds a canonical result encoding and the entire final native output vector; the projection is not permission to omit diagnostic or catalog output bindings. Neither the result nor its hash includes a prover-authored arbitrary payout list. The ledger derives wallet recipients and asset liabilities from immutable session escrow.

For XOR, preserve winner-takes-all for a sole winner, all eligible co-winners for exact ties, and exact original-stake refunds for all-forfeit. The existing generic [`winner_amounts`](../../../iroha/crates/iroha_core/src/smartcontracts/isi/game.rs) divides at the admitted payout scale, floors each share, and assigns at most one remaining quantum to each winner in ascending slot order. This small integer remainder policy must be frozen and displayed as part of the escrow terms; it never changes racing ranks. If a product instead promises literally identical integer payouts, session creation must require divisibility for every possible tied winner count rather than silently changing the ranking or leaving custody dust. Costs are separate from the no-house-fee prize pool.

For indivisible NFTs select the existing [generic wager policy](../../../iroha/crates/iroha_core/src/smartcontracts/isi/game_items.rs): a sole winner, including a technical winner, receives all explicitly pledged wager NFTs; tied winners or all-forfeit return every wager NFT to its original owner. Equipment/resource NFTs return to their owner independently unless separately and explicitly pledged. Buying or equipping a skin never by itself authorizes losing it. Bind exact NFT IDs, original owners, purpose, metadata/admission state and this tie policy before entry; retain atomic releases and duplicate-settlement checks in consensus. The Street result proves no NFT custody, eligibility or wallet ownership on its own.

## 5. Real completion fixture and test recipe

The retained [browser replay](../../output/browser/street-practice/completed-replay.json) contains **8,462 eight-car control rows and all 244 first-terminal outputs**. It starts from normal compiled genesis, with initial browser inputs followed by the [explicit automation helper's ordinary bot controls](../../src/ui/street-practice.ts). It contains no forfeit field. The [browser evidence](../../artifacts/street-practice-browser.json) records a successful complete local reexecution, no human playthrough, no proof qualification, and no publication. All eight cars finish; this tape's winner is **slot 7**.

The separate [native/browser arithmetic report](../../output/qualification/street-race/report.json) records 9,961 compared transitions/rejections, an all-bot full drive first ending at tick 8,462, and all eight cars finishing. That is a **different tape**, with **slot 1** winning. The [runner](../../scripts/test-street-race.ts) continues evaluating to 9,000 ticks plus 30 absorbing steps and stores its final display state. It does not persist its full input tape or full first-terminal output vector. Never combine that report's final state with the browser replay or call its 9,030 rows canonical complete execution.

The Tokyo route is a 7,013,328 mm circuit, two laps, finish station 14,026,656 mm, 27 ordered milestones, and cap 9,000 ticks. Its current full completion is 282.067 simulated seconds; its pinned song is 254.952 seconds. Thus this fixture is a genuine complete route, but it is not evidence of exact song-duration alignment or historical street accuracy.

Implement the direct integration test as follows:

1. Verify the retained replay/bundle/source hashes below, strict control shape, route identity, all output names, and canonical format. The local replay is witness material, not an authenticated session. Convert each row to the adapter's explicit action-column order with zero forfeits.
2. Start from `RaceGraph.initial_inputs`; reexecute every replay row natively while carrying **all** persistent fields by compiled port mapping. Require input `tick=i, done=0`, output `tick=i+1`, no earlier done and final done. Capture the exact last output vector and compare all 244 values to this replay's outcome. Do not seed a car near the finish or start at the final checkpoint.
3. Project the typed result and require all eight `Finished`, kind `Ranked` with `winner_slots=[7]`, terminal tick 8,462 and the exact replay fractions/ranks. The first-terminal `c0.justFinished=1` must remain bound; an absorbing next output is not interchangeable.
4. Reject a one-row prefix, `N-1` rows, a changed final cursor/halt, one added absorbing transition, a mutated final diagnostic, a changed persistent carry, an omitted tied winner, false technical/refund flags and malformed global padding. For each negative test state whether it is a direct projection test, native sequence check, raw scalar test or cryptographic verifier test.
5. Separately exercise genuine **genesis-to-terminal** one-step all-forfeit and technical-win computations using explicit synthetic consensus-action fixtures. They are useful complete raw/staged tests, but not authenticated removals or a physically completed track. Existing lifecycle tests with hand-built near-finish states are transition fixtures only.
6. For full raw constraint qualification, lower/compile once, stream each real tick through the staged and complete execution verifiers, and compare its boundary/terminal AIR exports. Retain no full dense matrix in memory. Until that completes, report full native replay and boundary/projection checks separately from the existing short scalar/lookup qualification.

The retained 8-bit eight-car [limb report](../../output/qualification/street-limbs/report.json) has 18 rows per tick, width 22,349, and 402,282 dense cells per tick. At 8,462 ticks, storing just those u64 rows would cost 27,232,882,272 bytes before proof-domain padding, LDEs, lookup auxiliaries, commitments or proofs. A streamed native reexecution is not itself a full scalar or cryptographic proof benchmark. The closed three-step lookup proof is also not a replacement for this completion test.

## 6. Required history adversaries before settlement admission

Add explicit evidence-backed cases for: replayed foreign network/session/profile; swapped wallet/input-key slots; invented forfeit bits; missing/reordered/duplicate decisions; stale epoch/seal; replaced pending commitments; matching reveal submitted by a third party; conflicting checkpoints; withheld next/final signature with already revealed collision inputs; intra-batch finish with unchanged signed suffix; decisions at `N-1`, `N`, and after `N`; a finished racer removed while another is running; all-forfeit versus eligible technical closure; and a numeric first-terminal proof paired with unconditional legacy disqualification evidence. Verify conservation and atomicity of XOR/NFT liabilities independently. No unchecked selected-history suffix may be omitted to make any of these pass.

## Source and fixture pins

Read-only SHA-256 verification on September 8: all 13 generator source pins, all six native race test source pins, all nine browser-practice source pins, the retained native harness/binary, replay hash and bundle hash matched their existing reports. This audit did not rerun native or browser execution. The generic terminal API is being implemented separately and is deliberately not pinned as final here.

| File | SHA-256 |
| --- | --- |
| `world/native/street_race.rs` | `57d2acefc5a5617c957e21475ca327f5c97fec9d5b82465da8d5630cf8d05a74` |
| `world/native/street_lifecycle.rs` | `4b5d7af573002ba56c620871e5c9227bf2d41392acc1bed8c8aee8c2250dd2b5` |
| `world/native/street_graph.rs` | `e93077c4bbe99c4bbc6322dd12ab6f993d17ebe8ffff458d832952879958c196` |
| `output/qualification/street-race/generation.json` | `0e917665359f56c8f3affa93b76f145f1f148fcbb7c9d1f70ab8a6a2263c68db` |
| `output/qualification/street-race/street_race_cli.rs` | `31cbfd6d0e341d1f718496e17a6fdfb2f2082b35ff7ea933955084310798dd16` |
| `output/qualification/street-race/street_race_cli` | `d5e9723b31f12b063ca483df1f77315caa3b35f7d40a5b13eedf26a87ddaee1e` |
| `output/qualification/street-race/report.json` | `7be2a23b8a0157f3af15166ec68493252fe856fca0a8edfb197c5beedc8de7c1` |
| `output/street-race/tokyo-1986-8.json` | `92da95c575ba50ab42e940702ec110173b44e19030ad006a800893eacd4592ca` |
| `output/browser/street-practice/completed-replay.json` | `a1bdb890fb8b598055635a2e8c865e75be2beb182d745577a523591fbf784252` |
| `artifacts/street-practice-browser.json` | `3f4134298f5473239a29d452632c0df55e607e056785c91befbbb857eb7ce3e0` |
| `src/game/street/replay.ts` | `816999aa9f64a22fe8c0d8db337c9c00fb5e0fc6ca55098a7b2e335273d514b1` |
| `../iroha/.../classed_race_v1/history.rs` | `07a11803be4082f09d00c8b6f36780216c2fc0cfefdec4730c2713e9f14e3157` |
| `../iroha/.../classed_race_v1/admission.rs` | `7587f07c9edd95227275a303ffc548420c2fbceff59e58b30c7071ff9f4f2580` |
| `../iroha/.../smartcontracts/isi/game.rs` | `16c6c4dc0413dbceeae40eb858c47186c8cd9b8e8270ee6081b8a69815c161d2` |
| `../iroha/.../smartcontracts/isi/game_items.rs` | `1aae053cc8808b7a41819f92ad01ccebb035b91060e6175b10568a01d729ca58` |
