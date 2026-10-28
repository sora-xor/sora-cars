**Native finalized merge records — September 8, 2026**

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


The [shared ledger verifier](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/finalized_ledger.rs) authenticates a complete merge
sidecar using native global finality. The [write-set extractor](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/merge_write_set.rs)
then authenticates the full committed delta and extracts one complete game-session
record. This works for merge-only carriers with no ordinary transaction to select.
The record represents the **certified marker-inclusive batch revision**. It does
not establish latest-state freshness, every intermediate transition, or settlement
semantics.

The existing [successful external-entry adapter](NATIVE_FINALIZED_ENTRY.md)
delegates its finality and executed-block checks to the same shared verifier.
Both interfaces use native formats and independently selected trust pins.

**How authority reaches the record**

1. The caller fixes the network, initial trusted height context, consecutive
   height interval and target block hash independently of the downloaded data.
2. The native finality verifier checks every required certificate. The target
   certificate binds the exact executed block wire hash **and length**.
3. The signed merge projection and executed block's compact merge reference must
   agree. The complete canonical `MergeLedgerEntry` must match their hash,
   encoded length and native reference fields, with the expected carrier context.
4. A sealed `FinalizedMergeBatch` supplies its `write_set_root`. The caller cannot
   substitute a root or construct this capability by decoding a response.
5. Before interpreting any section, the extractor hashes the **complete** delta
   under the native `iroha:merge:execution-write-set:v1` domain, including its
   terminating zero byte. This must equal the marker-inclusive root.
6. The parser consumes the ordered sections, exact membership suffix and EOF.
   The selected key and full record use canonical native **bare** Norito payloads.
   The record's version, session identifier and network must match expectations.

The resulting receipt has private fields, no decoder and immutable accessors.
Its explicit state-point enum prevents silently describing a merge revision as
an ordinary-block snapshot. Application relation, lifecycle, accepted history
and deadline/removal validation remain separate obligations. The globally signed
sidecar authenticates its fields; this adapter does not separately verify the
merge committee's certificate, reexecute the lanes or recompute the private core
batch-identity algorithm.

**Complete delta parsing**

The [generated section registry](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/merge_write_set_schema.rs) contains 289 possible
sections in native producer order. Only changed sections need appear. It includes
23 cells, the executor, 10 trigger stores, 253 ordinary stores, optional external
events and the final membership vector. The generator (retired source path `scripts/generate-merge-write-set-schema.py`)
requires the exact source hashes of the two inspected core producers and fails
on source drift. The qualification runner regenerates the registry from retained
copies of those source files.

The grammar uses length-delimited components and explicit storage operation
tags. All game-session keys must have native canonical encodings and strictly
increasing typed order. Unrelated keys and values remain bounded opaque payloads;
this is not a full validator for every world-state schema. A tag embedded inside
an opaque value cannot select a record. The exact sorted membership set includes
both batch entrypoint identities and their authenticated signed replay aliases.

Missing means this batch did not prove a write of the requested session; it does
**not** prove that the session does not exist. An explicit deletion returns a
distinct error. Neither case returns a present-record receipt, and both are
reported only after the complete grammar and suffix have been checked.

**Resource bounds**

The shared verifier preserves the finalized-entry limits on heights, total
carrier bytes, finality archives and executed block bytes. It also enforces the
native complete-sidecar and execution-batch envelope limits. Local policy may
only tighten these ceilings.

| Delta boundary | Hard ceiling |
| --- | ---: |
| Complete delta | 64 MiB |
| Individual opaque component or selected record | 16 MiB |
| Storage key | 64 KiB |
| Aggregate scanned storage rows | 1,000,000 |
| Native decoded aggregate elements | 1,000,000 |
| Membership | Twice the native maximum merge entrypoint count |
| Tracked decode allocations per decoded value | 512 MiB |

The complete delta also fits within the original finality stream's remaining
cumulative byte allowance. Counts and component sizes are checked before loops
or generic decoding. Record canonicality is checked by streaming a native
re-encoding against the supplied bytes. These are admission and tracked-allocation
bounds, not a process-RSS or complete consensus-performance qualification.

**Qualification boundary**

The [completed report](../../output/qualification/native-finalized-entry-merge-attempt-1/report.json)
has SHA-256 `26971dd83ac2a1e0be7500169d40fd68586a244ac6cf80436cab0c0ae92a640c`.
Both the standalone library and test harness compile with warnings denied.
All **27 listed tests pass**, with no ignored tests: the original 13 finality
and inclusion cases remain, alongside 14 new merge/extraction cases.

The new cases cover a merge-only carrier, complete-record extraction, record
substitution, marker-inclusive versus application-root confusion, sidecar hash
and length substitution, inconsistent carrier/batch projections, absent/deleted
records, embedded section tags, duplicates and ordering, invalid operations,
truncated/oversized framing, canonical keys and full record binding, replay-alias
membership, all 289 registered sections and local/cumulative limits.

Independent source review found that the first implementation compared **bare**
batch length with a native **framed** archive limit. The implementation now uses
native frame-length counting with fixed encoding flags. Its regression constructs
a batch whose bare payload is exactly 12 MiB but whose framed archive exceeds
the limit; the adapter rejects it before returning a batch capability. This is
an actual adapter admission test, not only a test of a size formula.

The local fixtures use real native global BLS signatures and proofs of possession,
with manually assembled merge sidecars and deltas. Their lane evidence, merge
committee certificates and execution roots are synthetic. The full record fixture
comes from the retained accepted-history CLI evidence. These tests must not be
described as an actual native delta-producer capture or four-validator execution.

Compiled model, crypto and Norito types come from one retained coherent dependency
family. The separately frozen current core producer sources are **grammar reference
inputs**, not compiled dependencies. Current maintained model files have changed
since that retained family; this test cannot establish interoperability with a
new maintained build by implication. No Cargo or dependency rebuild is involved.

The runner (retired source path `scripts/test-native-finalized-entry.py`) retains eight new
sources, the two complete producer reference sources, the public record fixture,
exact commands, logs and binaries: 49 artifacts totaling 85,529,318 bytes. It
checks all 464 dependency nodes and 2,421 retained files before and after the
run, plus all ten direct dependencies and initial/final compiler, harness and
binary identities. Source and grammar generation checks also pass. Successful
native test execution took about 17 seconds on this local host; this is not a
validator or full-race performance measurement.

To reproduce using this retained local family, choose a fresh evidence lane:

Recorded retired invocation:

```text
python3 scripts/test-native-finalized-entry.py --lane native-finalized-entry-merge-review
```

No existing evidence directory is overwritten. The retained Norito version
provides native frame counting through `core::encoded_frame_len`; this adapter
uses that API directly, with no runtime alternate-format fallback.

The subsequent [finalized-history component](NATIVE_FINALIZED_HISTORY.md) binds
the exact certified state origin inside a freshly generated computation proof
and associates both sealed receipts. The native producer currently does not
export and retain this full delta preimage with the sidecar. Native export/retention
and a genuine producer-to-verifier test remain necessary. Ordinary-block
transition evidence, legal removal history, before/after settlement association
and final freshness remain open. Passing local tests does not qualify composed
128-bit security or enable live stakes.

See the [research follow-up](../../docs/research/crypto-2026-authentication-followup.md)
for why improved accumulation and polynomial commitments do not supply a missing
ledger-state relation.
