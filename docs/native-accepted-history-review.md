# Accepted-history bridge review

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](native-research-retirement.md).


September 8, 2026. Independent read-only review of the new laboratory components. This note does not establish ledger authority, integer extraction, cryptographic soundness parameters, a 128-bit target or deployment qualification. No native build or maintained Iroha edit was performed for this review.

Reviewed source identities:

| Source | SHA-256 |
| --- | --- |
| [accepted_history.rs](../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/accepted_history.rs) | `a28e5fc665abfcb8ff4aca53b8b578b7959b367b4298d9141c97c557ea99b91c` |
| [accepted_guarded.rs](../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/accepted_guarded.rs) | `d409e216778a0331ff43eed1e9599b865f3788f627aaf79ca4cc0d2c5b682d02` |
| native_accepted_history.rs (retired source path `scripts/native/native_accepted_history.rs`) | `5540f13e363d5b18a0426a16f531d41b04109ccd3beacea56e2e0b7ba90e178d` |
| Independent history fixture (retired source path `scripts/native/accepted_history_fixture.rs`) | `caf5ebca93fb8192af8232d07383d85cfbb9217e5c836fdd9791ca976365fd6b` |

## 1. The generic bridge does not check the declared relation against its actual sequence

[`AcceptedVerifier::new`](../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/accepted_guarded.rs:54) checks the externally expected snapshot, history context, terminal length, removal tape and decoded input tape. It never derives the compiled relation identity from the supplied `CompiledGuardedSequence` and compares it with `history.policy().compiled_relation`. The declared relation identifier is merely included in the history context and state-hash context.

Consequently a caller can construct another valid compiled boundary/motion relation, preserve the history context and action tapes, and obtain a computation receipt for that different relation. Genuine component proofs do not repair this mismatch: they authenticate the relation actually compiled into the sequence. A changed boundary relation that admits an earlier halt illustrates the significance. The problem concerns the generic composition interface; it is not a demonstrated proof-byte attack against the current CLI. The CLI currently derives its policy from the same `GuardSource` used by `guard_compile`, at lines 52–71 (retired source path `scripts/native/native_accepted_history.rs`), so that specific path supplies the missing invariant externally.

The smallest complete fix is a compiler-owned relation identity function, called by the bridge on the actual sequence before any proof processing. Its canonical descriptor must include both complete original relation descriptors, exact ordered boundary/motion maps, carry indices, genesis, cursor/halt/max-step policy, and the fixed application input/state/outcome codec version. Compare the result with the policy's declared compiled relation. Existing immutable sequence getters already expose the necessary descriptors and maps; no change to the frozen sequence implementation is needed. Local resource ceilings should not become application protocol identity.

A callback supplied by the compiled application is acceptable if it is verifier code selected by the immutable profile, never proof-selected code or an imported expected digest. Share the descriptor implementation with the CLI's policy construction to avoid two subtly different identity algorithms. Also require the compiled state commitment of `sequence.genesis()` to equal `policy.genesis_state_root`, including when the selected checkpoint is later than genesis.

Required regression: same history, same source shape, same maps/tapes/genesis, but a different boundary equation and freshly generated valid component proofs. The bridge must reject the source identity before admitting a component. Separately vary a carry map, fixed control decoder version and genesis-state commitment.

## 2. Archived outcome metadata is not compared with the proved outcome

The archived branch in [`accepted_history::metadata`](../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/accepted_history.rs:496) checks terminal tick, eligible ordered winners, claim arithmetic, remaining liabilities, item recipients and resource release metadata. It explicitly treats the archived outcome as metadata rather than newly proved execution. These checks do not establish which eligible racer won.

[`AcceptedVerifier::finish`](../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/accepted_guarded.rs:143) finishes the genuine sequence and compares its private raw state, but never compares the stored `session.result` with an application projection of the proved final outputs. The CLI's verification path (retired source path `scripts/native/native_accepted_history.rs`) likewise prints proved outputs without this comparison. Hashing an eligible-but-incorrect archived outcome into the snapshot binds it as context; it does not constrain that outcome to equal the execution result. A fresh proof can therefore bind one archived award while establishing different rankings.

Preserve `ArchivedSettled` support and add an application-owned outcome projection. After successful sequence completion, derive the exact canonical `GameOutcomeV1` from the proved adjudicated final outputs, with any required immutable session terms. Compare the complete result with the archived result, including terminal tick, all ordered winners and opaque canonical result bytes. Apply the same projection for an unsettled selection and expose it in the composed receipt. The projection must use the final boundary result after removals, not the pre-removal raw checkpoint state. It must not re-filter winners using removals after the selected terminal tick.

Required regression: two eligible finishers and a retained settled record naming the wrong eligible winner, with internally consistent claims/items and genuine proof of the actual other winner. Full composition must reject. Also test a changed result payload with identical winners, an exact tie and a later removal that leaves the original award unchanged.

## 3. Checks that are present and correctly separated

The new history validator binds the full canonical native record and supplied block context; the legacy dispute projection remains only a consistency check. It validates the entire accepted interval through `next_tick`, canonical retained suffixes, original-key certificates, exact salt-bearing reveal envelopes and signed individual commitment envelopes when a pending certificate does not supply them. The pending inactive-slot commitment exception and automatic forced-phase transitions match the maintained lifecycle. Expired current snapshots remain possible without claiming that a deadline transition occurred.

The new prefix identity binds an explicit tick and the complete partially consumed batch, excludes same-boundary removals from the raw-state prefix, and uses a distinct domain without old-format fallback. The receipt exposes controls only for ticks below the selected terminal and removals only through it. Its ledger-authority and deadline-expiry methods return false.

The composed verifier checks the selected checkpoint against its raw shadow state before the same-boundary removals. That state changes only after genuine motion verification. A failed boundary, motion or checkpoint check permanently poisons the outer verifier; finalization requires both a checked checkpoint and the complete guarded sequence. Native proof framing remains bounded, role-ordered and exact-EOF through the retained reader and sequence verifier. The CLI reconstructs the source and policy for verification and does not evaluate a private witness in that path.

## 4. Compilation and evidence status

Static signatures match the eleven independent history fixtures, including the `u16` batch argument, exact input error type, borrowed receipt, sidecar structures and private cutoff accessors. The current native source interfaces inspected for encoding, decoding limits, signature verification and resource-owner validation match the calls. An actual standalone compile is still required, using one consistent retained dependency family; this review is not a successful-build claim.

The eleven fixture tests are written and formatted but had not been executed when this review was recorded. They exercise intrabatch termination, complete retained tails, genesis removals, original-key signatures, exact current commitments/reveals, native phase shapes, archived metadata, all 31 session-record fields and prefix-domain/cursor separation. Source compilation can proceed in the designated laboratory lane; successful composition should not be frozen as complete until the two bridge checks above and their regressions are added.
