# Native finalized execution verification

Iroha Core now owns the path from a pinned finality stream to a complete game
record and its native Street computation proof. The ledger interface remains
generic game and execution instructions. This integration does not register
Street or enable staked play.

## What the verifier authenticates

The caller independently selects the network, first trusted height context,
consecutive height interval and target block hash. Native certificate checks
authenticate that interval and the exact executed carrier bytes. A complete
canonical merge sidecar must open under that carrier before the verifier
returns a private, sealed batch value.
Global finality authenticates the complete sidecar; the reader does not
separately verify its merge QC or replay its lanes.

The record reader checks the hash of the entire retained write set before
interpreting its ordered sections. It checks canonical game keys, the complete
selected record, entrypoint membership, replay aliases and the end of the
input. Missing and deleted records have distinct outcomes; neither outcome is
available before the remaining grammar and membership checks succeed.

The result describes the final per-key value at certified marker-inclusive
merge completion. It does not establish a transaction prestate, an entire
world-state opening, the end-of-block state or the latest session revision.

The native Street adapter derives its context from this sealed record. Its
proof statement binds the exact network, target context, carrier, merge entry,
batch, write-set root, base state, session and revision. The complete accepted
history supplies the controls and removals; callers cannot substitute a record,
root, computation or verifier callback. Each ordered component must verify
before an association receipt can be returned. A failed component poisons the
verifier, including attempts to retry or finish it.

The initial trust anchor binds the final association separately from the
computation's target-state identity. This lets independently anchored verifiers
check the same computation against the same finalized target. A trust file
downloaded alongside a proof is not an independent trust anchor.

## Shared producer grammar

One native inventory now supplies the world encoder, trigger encoder, suffix
encoder and record reader. Its 289 ordered sections comprise 23 cells, the
executor, ten trigger stores, 253 ordinary stores and two suffixes. Typed
encoding helpers and dirty-value checks retain their existing semantics.
There is no separate active schema copied from the game repository.

Unrelated world values are bounded opaque bytes. Local byte, scan and decode
limits can only tighten fixed ceilings, and the entire delta consumes the
finality stream's cumulative allowance. These are admission bounds rather than
whole-process memory measurements or new consensus persistence limits.

## Qualification

The [fresh native run](../output/qualification/native-finalized-street-attempt-3/report.json)
passes production Core checking and **51 native tests**: 20 finalized
ledger/record tests, three shared-layout tests, 20 trigger tests, six native
producer/reopen tests, one World field-inventory test and one Street proof
association test. Source declarations, emitted test names and passing names
match exactly. The independent
[retained-evidence audit](../output/qualification/native-finalized-street-attempt-3/audit.json)
also passes.

Two evidence paths have deliberately different scopes:

- The native State test starts a registered RaceV1 game through actual certified
  replay, retains the original carrier, sidecar and write set in Kura, then
  feeds them to the new native readers. The decoded full record must equal
  both the checked native overlay and the independent fixture parser. Altered
  retained bytes must reject. Network, first context and target pins come from
  independently constructed local fixture state before reading the transport.
- The Street case uses a locally signed carrier and a synthetic complete Street
  record, then generates and verifies one genuine native zero-motion proof.
  It checks wrong selections, malformed and trailing proof bytes, poisoned
  reuse, ordering and reuse against a coherently signed different revision.
  This case does not execute the State producer or replay legal forfeitures.
  Archived outcomes, motion histories and alternate-anchor portability are
  also outside this new fixture's coverage.

Both use native certificate verification with local test trust. Four signing
keys in a fixture do not establish operation of four validator nodes or trust
in a deployed network. The Street fixture's retained proof, ports and association
files are diagnostic artifacts rather than an admitted transaction envelope.

The Street case produces one **251,052-byte proof**. Its entire unoptimized
test takes **41.590 seconds**, with **186,286,080 bytes peak RSS**. This includes
setup, native relation compilation, signing, proving, verification, negative
checks and artifact writes; it is not an isolated prover benchmark or a speed
comparison. It retains 13 public artifacts and compares 547 native witness nodes.

The run records 148 source pairs (141 native and seven external inputs), 55
literal identity includes, 226 retained artifacts and 21 successful commands.
The 892 emitted library identities are hashed at build time; replaceable warm
libraries are not repeatedly reopened during direct test execution. This is a
selected source closure, not the complete transitive compiler/platform closure.
Scoped formatting and the retired-codec guard pass. Production checking emits
505 warnings and the test build 83; this does not qualify strict Clippy.

Report SHA-256: `9a70ba5397700791b6df6f35cc8c96c10550c83d034811f627345552dfec44f6`.
Audit SHA-256: `cc9aacf19481c21571bdf585a7013d079d88ea861bd187b24fcbacc3ea6041cc`.

The audit independently checks all 51 source/list/success names, source and
artifact identities, the retained native executable, complete delta framing
and record bytes, and the outer proof framing. It does not rerun certificate or
proof verification, independently decode every Norito artifact, or rehash the
892 replaceable warm-library files. Those library identities remain build-time
records. Its actual Race handoff finding combines the exact retained native
test source with that test's successful execution log.

The two earlier failures remain retained. Attempt 1 rejected a malformed input
earlier than its test expected; the fixture now reaches the intended bound
without weakening production admission. Attempt 2 found the parent reader
module was inaccessible from State; its visibility is now crate-private.
The final candidate passes both the corrected tests and production compilation.

## Reproduction

Run the current Native tests from the isolated checkout, preserving its warm
Cargo target and normal jobserver:

```sh
cd /Users/takemiyamakoto/dev/iroha-sora-cars-native
cargo iroha-fast -- test --release -p iroha_core --lib \
  execution_proofs::street_v1::compiler::tests::owned_sequence:: -- --test-threads=1
cargo iroha-fast -- test --release -p iroha_core --lib \
  execution_proofs::finalized::street:: -- --test-threads=1
```

The first group includes the technical win, refund, six-motion proof and
finalized-record proof. These tests verify current segment proofs, independently
check their receipts and reject malformed, reordered and cross-record inputs.
Set `SORA_CARS_NATIVE_OWNED_SEQUENCE_OUTPUT` to an existing fresh absolute output
directory to retain their public artifacts. Current exports use
`segment-N.proof`, `segment-N.ports.nrt` and `segment-plan.nrt`; logical computation
counts are distinct from actual proof counts.

The reports above retain their original sources and component-format artifacts
as historical evidence. The obsolete ancestry-dependent Python runners have
been removed. Current commands do not consume those reports or their executables.

## Remaining work

The subsequent [native public bundle and CLI](native-public-game-bundles.md)
passes 99 tests, 13 separate CLI outcomes and audit, including synthetic signed
N0/N6 Street records. Next connect actual producer exports, retain complete
signed input evidence and qualify a real finalized Street lifecycle. Settlement must derive its expected record from current consensus
state, not a historical receipt or its own future carrier hash. Legal removal
transitions, deadline enforcement and latest-state selection require their own
evidence.

The [previous six-tick native case](native-street-owned-sequence.md) already
exceeds the current 4 MiB proof envelope. Compact full-duration proofs, a
complete final decider, composed 128-bit security, supported hardware parity,
atomic custody and settlement, and four-validator qualification remain open.
No XOR or NFT payment, deployed wallet interoperability, or Taira/SoraFS
activation is established by this integration.
