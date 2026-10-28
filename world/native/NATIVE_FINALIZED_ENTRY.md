**Native finalized external-entry verification**

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


The [adapter](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/finalized_entry.rs) verifies one successful external transaction
using the retained native Iroha finality and inclusion verifiers. It returns a
private receipt that can be used by application-specific checks. It does not
authenticate a separately supplied game-session record, execute the transaction,
or verify the new accepted-history computation.

**Admission and trust**

The caller supplies independently obtained network identity, initial height
context, first height, target height, target block hash and transaction entry
hash. These expectations are fixed when constructing the verifier. They must
not be adopted from the endpoint supplying the proof.

Each pushed finality carrier is a bounded canonical native archive. The adapter
requires every height in the selected interval exactly once, and invokes
`BridgeFinalityVerifier::with_context` and `verify` for the native network,
context transition, quorum, proof-of-possession and signature checks. An error
permanently poisons that stream; replacing the failed carrier cannot recover it.
Counts retain only successfully admitted carriers.

Finishing consumes the stream. It requires the complete interval, canonical
`SignedBlockWire`, the pinned target header, and the exact executed-wire
commitment. It constructs `TrustedBlockProofAnchor` using the same finality
artifact admitted by the pinned stream, then verifies `BlockProofs` against that
anchor. The selected entry must occur exactly once, have a successful result,
be an external transaction, and contain the expected network identity.

The receipt has no decoder or unchecked public constructor. It exposes immutable
transaction and anchor references plus the pinned context and admitted counts.
Its API contains no game snapshot, removal-authority claim or broad
`ledgerVerified` switch. A future settlement consumer must still inspect the
instruction and establish every binding to its own verified computation.

**Resource limits**

| Boundary | Hard ceiling |
| --- | ---: |
| Consecutive finality heights | 65,536 |
| Total admitted carrier bytes | 4 GiB |
| Each canonical finality archive | 9 MiB |
| Executed block wire | 32 MiB |
| Entry/result proof archive | 16 MiB |
| Native tracked decode allocations per carrier | 512 MiB |
| Decode nesting | At most 128 and the native canonical limit |

Local policy can tighten these ceilings. Length and cumulative-byte checks run
before decoding. The native canonical decoder also bounds field sizes, sequence
lengths and aggregate element counts. These are admission and tracked-allocation
limits, not a process peak-memory qualification: native verification, cloning
and canonical re-encoding incur additional allocations. The wrapper and native
verifier each retain the latest height's proof; replacing it creates transient
copies. Earlier heights do not accumulate in the wrapper.

**Qualification**

The current implementation shares its finality and block checks with the
[merge-record verifier](NATIVE_FINALIZED_MERGE.md). Its subsequent combined
qualification passes **27 tests**, including every original 13-test case below.
The entry fixture changed only helper visibility so the new fixture could reuse
its real signing setup. The shared verifier also checks the signed wire length
explicitly. The following report preserves the original implementation snapshot;
the merge document identifies the current sources and test report.

The [original completed native report](../../output/qualification/native-finalized-entry-attempt-2/report.json)
has SHA-256 `a8e6db01b921c457c5400dc86ff6254b2ea9c9d7873f54fac360d3fe5494d476`.
The library and test harness compile with warnings denied, and all **13 native
tests pass**. Coverage includes genuine consecutive certificates, a separately
pinned non-genesis starting height, announced epoch transition and continuation,
foreign committees, altered PoPs and signatures, wrong quorum, missing/reordered
heights, wrong target identities, altered executed wire with the same header,
entry/result position swaps, failed execution, cross-network transactions,
noncanonical/malformed carriers, exact resource bounds and poisoned-stream
retries. The scheduled-entry `NonExternal` rejection branch is not exercised by
this suite.

The [first attempt's compiler diagnostic](../../output/qualification/native-finalized-entry-attempt-1/test-compile.stderr)
is retained: its fixture used `Hash` where the native `HeightContextId` requires
`HashOf<HeightContext>`. Correcting that test constructor required no adapter
behavior change. The completed suite also adds the epoch cases and a first-height
PoP mutation that reaches native cryptographic verification directly.

The runner (retired source path `scripts/test-native-finalized-entry.py`) builds only the new
standalone Rust adapters and their entry fixtures (retired source path `scripts/native/finalized_entry_fixture.rs`)
and merge fixtures (retired source path `scripts/native/finalized_merge_fixture.rs`).
It uses the same retained 464-node, 2,421-file model/crypto/Norito family as the
[custody tests](NATIVE_ACCEPTED_HISTORY_CUSTODY.md). It rehashes that family before
and after the run, freezes the new sources, and verifies that the harness,
compiler, compiled library and tested binary remain unchanged. No Cargo or
dependency build is used. The old CLI31/CLI33 dependency families are not mixed
into this component.

To reproduce with the retained local dependency family, choose a fresh evidence
directory name; existing evidence directories are never overwritten:

Recorded retired invocation:

```text
python3 scripts/test-native-finalized-entry.py --lane native-finalized-entry-review
```

The test evidence uses local validator keys and actual native BLS signatures and
proofs of possession. Its committed execution state hashes are fixture values.
Passing these tests is not evidence of four-validator execution, public Taira
finality, game-session extraction, actual XOR/NFT transfers or complete proof
security. The maintained Iroha source/build hold remains in effect; this adapter
has not been wired into the maintained CLI or consensus settlement path.

**Remaining state association**

The ordinary execution root does not currently commit complete game-session
records. The merge delta includes changed game records, and native code rechecks
the complete marker-inclusive overlay before voting on a merge-only carrier.
Its state point remains the specified certified batch revision, and its root is
a flat commitment to the entire ordered delta. Post-finality metadata has a
separate native authorization.
Neither fact permits treating any downloaded record as the finalized session
snapshot. The [research follow-up](../../docs/research/crypto-2026-authentication-followup.md)
records the native source findings, proposed transition-receipt boundary and
required stale-state/substitution attacks.

The next integration must authenticate the exact selected session state and
associate pre-settlement, deadline/removal transitions and the final settlement.
The accepted-history computation and this finalized-entry receipt remain
separate verified objects until that association is implemented and tested.
The [merge extractor](NATIVE_FINALIZED_MERGE.md) implements complete-delta
authentication at a named batch revision. Actual native producer export/capture
and integration with accepted-computation selection remain unqualified.
