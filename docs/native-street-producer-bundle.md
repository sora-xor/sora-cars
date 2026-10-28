# Native retained Street transition and public bundle export

The native producer/export lane passes production builds, 32 selected native
tests, 10 separate CLI outcomes and an independent retained-evidence audit.
The previous [public bundle/CLI qualification](native-public-game-bundles.md)
remains separate evidence. Street stays unregistered and unqualified for live
stakes or composed 128-bit security.

The isolated native worktree adds `Kura::write_game_replay_v1(request, evidence,
output)`. The caller supplies independent network, initial height context,
height range, target carrier hash and exact game selection. Kura retrieves
consecutive native finality artifacts, the original executed block, the complete
merge entry and the retained marker-inclusive write set. The existing public
writer authenticates them and selects the entire requested record. Missing or
expired retention is an error; the exporter does not substitute another revision
or reconstruct a delta from current State.

Output is a byte count, not a verified computation capability. Public accepted
input evidence is checked later by the native prover/verifier. Storage locks are
released before invoking the output sink. A concurrent prune can abort a later
read; previously owned bytes may still form a valid historical bundle under the
independent pins. Callers discard partial output on error and publish owned
files atomically after success. Existing native storage bounds and offline frame
caps remain in force; the extra block-size check follows native encoding and is
not a whole-process memory guarantee.

The new producer case deliberately seeds a synthetic, zero-value Street
ForcedReveal prestate. One actual signed `AdvanceGameDeadlineV1` runs through
native source certification, batch production, independent certified replay,
write-set capture and Kura persistence. An independently projected complete
poststate must match the emitted record, speculative overlay and retained delta.
Both missing players forfeit at tick zero, yielding one genuine boundary proof.
Separate ordinary CLI processes verify the public bundle, generate a new proof
and verify that new file. After all producer State/Kura handles close, strict
Kura startup reproduces the exact replay stream. This is a storage-only restart
check, not WSV recovery. The execution overlay is dropped before public export;
the test confirms committed State still contains the synthetic prestate.

This distinguishes real native execution of the deadline from the synthetic
starting history. It does not demonstrate admitted Street Open/Join/Start,
committed WSV, full legal removal history, active driving signatures, payouts,
full-duration proving or four-validator operation. The test preserves closed
registration, creation, joining, starting and settlement for the unqualified
Street profile, including attempted settlement using genuine offline proof
bytes. All existing six native Start/Kura capture cases remain present.

The retained [original draft](../output/implementation/native-street-producer-export-draft/plan.md)
remains unchanged and is not execution evidence. The maintained `../iroha`
checkout and deployed Taira/SoraFS are unchanged.

## Passing evidence

The [closed attempt-3 report](../output/qualification/native-street-producer-bundle-attempt-3/report.json)
has SHA-256 `1455eaac90ce7f0c8bd1a728b5e2a776988b525e6e61f1b9c5ad44db6ac04982`.
It retains 160 source pairs (157 native), 55 literal identity includes, two exact
Cargo-emitted executables, 287 original artifacts totaling 1,348,959,129 bytes
and 30 command receipts. Source/artifact drift lists are empty. Only Kura's
module declaration, the new exporter and captured-game test source differ from
the preceding public-bundle baseline. This is a selected source closure, not
the complete transitive compiler, dependency or platform closure.

All 32 tests pass exactly once with source/list/pass identity: seven State
capture cases, four ordinary bundle guards, twelve finalized-ledger and eight
write-set guards, and one archive-boundary test. The prior public N0/N6 and
compiler-owned proof tests are excluded. CLI/model unit tests are not rerun.

The new case retains eighteen fixed artifacts plus six original finality
archives (heights 1–6): the synthetic prestate, independent expected poststate,
actual selected record, signed deadline transaction and entrypoint, original
executed wire, complete merge sidecar/delta, request, accepted evidence,
replay/proof, separate prover/verifier reports, diagnostics and typed negatives.
The actual revision advances from 3 to 4. Complete expected and selected record
bytes match; the production exporter and exporter after strict reopen both
match the original framed evidence exactly.

Sixteen native negatives cover modified delta, all five closed-admission
operations, wrong trust/revision/mode/carrier/height, failed output, missing or
changed retained bytes, and public-verifier trust/order rejection. The live-file
tests restore only their original owned bytes; they do not demonstrate crash
repair. Seven expected CLI rejections cover foreign trust, frame ordering,
malformed/trailing proof, explicit client config, an existing output and
foreign-trust proving. Rejected jobs emit no success report or leaked temporary;
no-clobber preserves the existing file. CLI receives only public transport
inputs, never the prestate, source, witness or signing keys. Its malformed
default client configuration remains unread.

| Complete process | Time | Peak RSS |
| --- | ---: | ---: |
| Native producer/proof/verification/rejection/reopen test | 58.854 s | 269,647,872 B |
| CLI verifies original producer bundle | 17.565 s | 112,820,224 B |
| CLI generates fresh proof | 22.644 s | 117,161,984 B |
| Separate CLI verifies fresh proof | 17.490 s | 114,606,080 B |

The original proof is 252,685 bytes and replay 43,496 bytes, containing one
boundary component and no motion. Original block/merge/delta sizes are
1,278 / 18,601 / 3,203 bytes. The fresh CLI proof is also 252,685 bytes; its
separate verifier reproduces the entire fresh report. Whole unoptimized process
times include their different setup and verification work. They establish no
isolated proving benchmark, speedup or full-race feasibility.

Production Core checking and the ordinary CLI build reused valid current Cargo
outputs in 1.937 / 0.728 seconds; the current Core libtest build took 232.013
seconds. Core check/test warnings are 152/86 and the CLI reports one warning.
The two-file scoped formatter and retired-codec guard pass. No workspace-wide,
strict Clippy, hardware or four-validator gate is claimed.

The [independent audit](../output/qualification/native-street-producer-bundle-attempt-3/audit.json)
passes unchanged, SHA-256
`78a6e78dedb5e1d66ed4f0caf4e62fd07a1ccf8a1a28629daa4d0707a4f14f48`.
It checks retained artifacts, source snapshots, executable identities, exact
test names, scope/diagnostic exports and CLI outcomes. It runs no native code,
does not independently decode every Norito artifact or reread current sources,
and does not reopen replaceable warm libraries. The 1,007 / 892 library records
are per-build inventories, not unique totals.

The first attempt failed test compilation on a JSON-macro namespace and ran no
tests. The second passed 31 ordinary tests, then deadlocked when the new case
opened a second State writer before dropping the first. A retained process
sample established the lock wait; only that owned test process was terminated.
The fixture now releases its first overlay before export and admission checks.
Both failed lanes remain unchanged; the passing result is a fresh third run.

Run the current signed deadline producer test from the isolated Native checkout,
retaining its existing warm Cargo target:

```sh
cd /Users/takemiyamakoto/dev/iroha-sora-cars-native
cargo iroha-fast -- test --release -p iroha_core --lib \
  state::tests::captured_merge_game::native_seeded_street_deadline_capture_exports_verified_public_bundle \
  -- --exact --test-threads=1 --nocapture
```

Set `SORA_CARS_NATIVE_STREET_PRODUCER_OUTPUT` to an existing fresh absolute
directory when public artifacts are needed. The native test writes the
`producer-deadline-n0` bundle, verifies its genuine proof, checks Kura replay and
negative controls, and keeps the synthetic prestate and unregistered Street
scope explicit. It remains a separate producer test; running the ordinary bundle
tests alone does not establish producer coverage.

The old Python runner and its historical-report ancestry prerequisites have been
removed. Earlier reports, source snapshots and failed attempts remain unchanged;
new runs must use current sources and fresh output, without relabeling that
historical evidence as current qualification.

Next connect bounded serving and complete signed driving evidence, qualify the
admitted Street lifecycle and legal removals, integrate the native worker/SDK,
and finish compact full-duration proofs, composed security, hardware parity,
current custody/settlement and four-validator testing. The prior six-tick moving
proof still exceeds the ledger envelope; this zero-motion result does not alter
that limit or enable live stakes.

The original [native proof-worker supervisor draft](../output/implementation/native-public-proof-worker-draft/plan.md)
remains historical preparation. Its subsequent [native job integration](native-proof-worker.md)
now passes three builds, 34 selected tests, 16 CLI outcomes and an independent
audit, including actual proof/verify and interrupt cleanup. That evidence is
separate from this producer lane; HTTP service and public resource containment
remain open.
