# Native execution evidence: producer integration

Implementation work in `/Users/takemiyamakoto/dev/iroha-sora-cars-native`,
branch `codex/sora-cars-native`, based on
`c000f91384ff1b1d82a3c9e5c3b10f30139763e4`. The maintained `optimizations`
checkout is not modified by this work. The final non-test Core check and 22
focused tests across two matched production-source builds pass. This is partial
native integration evidence, not deployment qualification.

## What the evidence authenticates

A certified merge execution commits to `MergeExecutionBatch.write_set_root`.
Its preimage is the native encoding of changed world-state fields, the exact
autonomous external events, and sorted merge entrypoint membership. The root
uses the existing `iroha:merge:execution-write-set:v1\0` domain.

`StateBlock` captures that preimage after real replay has passed the application
root, marker-inclusive root, post-state identity and batch-hash checks. A private
immutable `CertifiedMergeWriteSet` remains inside the move-only commit
authorization. Reading or copying its bytes grants no authority to commit state.

The state point is before finalized-carrier metadata. That later processing
records a separate `post_finality_write_set_root`. Its value may coincide when
the metadata changes only separately authorized block membership, topology or
autoscale state. Capturing the earlier preimage must not depend on that
coincidence: exporting a later overlay cannot replace the original capture.
The patch does not introduce a new Merkle membership claim for the complete
world state.

## Persistence contract

The live `V2ApplyService` requires a capture whenever its certified carrier has
an execution batch. It passes that capture to Kura before committing the state
overlay. Kura binds the capture to the exact carrier and full certified entry.
The intended durable order is the local association journal, the immutable
preimage file, then the canonical carrier. Recovery authenticates committed
files and discards only uncommitted journal-owned files. An already-applied
carrier cannot replace missing evidence with a snapshot of the current world.

Preimages use Kura's storage accounting and capacity reservations. Existing
source, batch and block byte limits do **not** bound expanded state writes. This
change therefore does not invent a smaller persistence-only consensus limit.
Recovery hashes a file incrementally with fixed-size scratch; an owned read
requires a caller-supplied allocation limit. Retention follows the configured
lane-history window, with a durable availability floor so a configuration
change or suffix rewind cannot resurrect already-deleted evidence. A rewind
clamps that floor to the next height; the next append persists the clamped
floor before advancing. Expired historical retries report unavailable evidence;
missing evidence within the retained range is a recovery failure. Evidence that
must outlive the window needs an exported verification bundle or separately
qualified archival storage.

## Producer test scope

The fixture creates a free Lobby through real generic Open and Join handlers,
then executes a signed `StartGameSessionV1` through QueuePlan source execution
and certified replay. The expected record comes from native decoding of the
captured bytes. Incorrect certified roots must reject even when their dependent
hashes and merge signatures are recomputed consistently.

This is a native producer unit fixture. Its four lane validators and one global
merge validator do not qualify four-validator global finality. Its explicit
metadata test authority does not establish a finalized public network state.
Storage tests do not establish that the world-state overlay committed, that a
gameplay proof was verified, or that escrow was paid.

Two additional tests use a caller-owned directory and reopen Kura through the
strict production configured-catalog constructor after every producer handle
has closed. They authenticate the exact carrier wire, entry, captured bytes and
decoded game record. Missing, truncated and same-length bit-flipped preimages
reject at startup with the exact capture-path error. The negative cases start
after a successful reopen and before any failed retry could introduce a poison
condition; startup leaves the missing or altered evidence untouched. Restoring
the original bytes between cases is explicit test reset, not a repair API.
These are orderly reopen tests, not process-kill or power-loss experiments,
and they do not reconstruct the committed game world after restart.

## Focused validation, September 8

The [consolidated report](../output/qualification/native-producer-capture-attempt-4/report.json)
records exact commands, log hashes, binary identities and source snapshots.
Its SHA-256 is
`722018ce5c5aec083a39bf8b591ee57638ee380621957628cd8ef79c37dd0337`.
The separate [retained-evidence audit](../output/qualification/native-producer-capture-attempt-4/audit-attempt4.json)
checks all eight logs, both source inventories, the unchanged current inputs and
the final executable hash. It found no contradictions within this scope; it
runs no native proof or consensus process.

| Check | Result | Source/build scope |
| --- | --- | --- |
| Native producer, metadata, false roots, retained read and strict reopen | 6 passed | Attempt 4 |
| File hashing, bounds, retention floor, rewind policy and atomic-temp retry | 8 passed | Attempt 3 |
| Exact FASTPQ source ownership handoff | 4 passed | Attempt 3 |
| Actual atomic transfer, missing authorization, event drift and failed-storage rollback | 4 passed | Attempt 3 |
| Non-test `iroha_core --lib` check | Passed; 3 unused-reader warning groups | Attempt 4 |

Only the private game test file changed between attempts 3 and 4. All 17
monitored source/configuration files stayed unchanged during their commands;
this is not an archive of the entire compiler dependency closure. Earlier
failed results remain in attempts 2 and 3: source-only fragment counts did not
represent full block execution, and a metadata test incorrectly required root
inequality. The real transfer also exposed a FASTPQ handoff inconsistency:
locally executed transcripts were removed while their source records remained
in the ordinary carrier accumulator. Exact all-or-nothing source transfer fixes
that inconsistency without relaxing inventory equality, sticky errors or seals.

Reproduce the focused producer checks from the native worktree with:

```sh
cargo iroha-fast --stable-local-metadata --no-incremental --linker off -- test --locked --offline -p iroha_core --lib captured_merge_game:: -- --nocapture
cargo iroha-fast --stable-local-metadata --no-incremental --linker off -- check --locked --offline -p iroha_core --lib
```

No whole-workspace gate ran. Three older synthetic executed-carrier helper
families still need migration to real native replay before their tests can
reach their intended storage assertions. Actual interrupted append/recovery,
live suffix pruning, wider V2Apply integration and external bundle export
remain open. The retained reader is currently internal and unused by shipping
consumers; the production check reports that fact rather than suppressing it.

## First-release application alignment still required

The pinned native registry exposes RaceV1; the current accepted-history
laboratory proves the more developed Street boundary/motion relation. Their
schemas are different: six `u16` control masks versus six `u8` masks, different
initial grids and state layouts, different state/transcript commitments, and
different compiled profiles and outcome encodings. A real RaceV1 Start capture
must not be relabeled as Street proof input.

The [shared Street contract candidate](native-street-contract.md) now places
scalar layout, genesis, control/outcome codecs and prefix commitment in native
code. Generic Start dispatches both initial commitments using ledger-owned
context. Its Core build, 63 focused native tests and exact graph/replay
comparisons pass; Street remains unregistered.
Checkpoints, replay exporters and complete proof verification must use the same
contract with new matching fixtures and proofs. There is no fallback for
earlier laboratory hashes or draft formats.

A useful later acceptance case is six actual motion ticks followed by a legal
on-chain removal boundary: Start, Challenge, deadline advancement, signed
commitments and salted reveals, then an expired input round. That produces an
actual terminal history for `B0, M0, …, M5, B6`. Fresh Start alone is not a
terminal zero-motion proof: every racer remains active. The proof registry,
history-cap validation, full signed evidence retention and atomic settlement
still need end-to-end integration and qualification.
