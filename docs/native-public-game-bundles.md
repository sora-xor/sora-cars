# Native public game proof bundles

The current candidate adds public replay publication, compiler-owned proving
and independent verification to native Iroha. Shared wire types live in
`iroha_data_model::execution_proofs::game_bundle`; the verifier and prover live
in `iroha_core::execution_proofs::bundle`. Generic game/execution instructions
remain the ledger interface. Street is still outside the admitted registry.

**The original public-bundle qualification passed.** Production builds, all 99 selected
native tests and 13 separate CLI jobs pass. The independent retained-evidence
audit also passes.

## Public inputs and authority

A verifier independently chooses a canonical `GameVerificationRequestV1`:
network, trusted initial height context, consecutive height interval, exact
target carrier hash, session, revision, record mode and terminal tick. The
replay stream contains no trust anchor. Downloading a request alongside an
untrusted replay does not establish its trust.

The ordered replay contains one header, the exact number of native finality
archives required by the request, the executed carrier, complete merge sidecar,
complete write set and accepted-input evidence. Every record uses its shared
native Norito schema. Framing, byte caps, canonical decoding and exact EOF are
checked before a completed receipt is available. No legacy laboratory framing
or alternate decoder is accepted.

The native reader authenticates the complete historical record under the
independent pins. The state point remains the final per-key value at certified,
marker-inclusive merge completion, as described in the
[finalized-record integration](native-finalized-execution.md). This is not a
claim of latest state, end-of-block state or local replay of legal forfeits.
Global finality authenticates the complete sidecar; this reader does not
separately verify the merge QC or replay its lanes.

Public report structs are ordinary serializable observations. Only successful
Core verification can construct `VerifiedGameExecutionV1`; decoding a report
with success flags grants no capability.

## Native proving and verification

The prover accepts only the independent request and public replay. It derives
the fixed Street relation, accepted tapes, policy, maps, initial state and
witnesses inside Core. The complete selected history, including unused
certified suffixes and pending inputs, must validate before graph evaluation.
No caller-supplied witness, circuit descriptor or callback can select the
computation being proved.

The compiler retains a private evaluation recipe from the same lowering pass.
Proving evaluates and releases one component's witness at a time, emits its
native proof, and independently verifies it before advancing. This avoids
retaining an entire race's witness tables. It does not bound complete process
RSS: compiled graphs, lowering metadata and commitment/prover allocations also
consume memory.

The proof stream starts with its computation, terminal tick, compiled sequence
digest and final public outputs. It then carries the exact ordered sequence
`B0, M0, B1, M1, …, BN`. Each frame binds its role, index, complete output ports,
commitment root and proof bytes. The verifier derives the expected native
sequence and checks every component without evaluating the driving graph.
Exact EOF precedes the final sealed association. Failed or incomplete streams
cannot return a successful receipt.

The final report binds record finality and verified computation. It explicitly
leaves freshness, legal-removal replay, registration, settlement and composed
security unqualified. Historical settled-record mode compares its archived
outcome; it does not establish that an XOR or NFT payout was executed correctly.

## Native CLI

These commands use the actual `iroha` executable and need no custody key or
client configuration:

```sh
iroha app execution prove-finalized \
  --request request.nrt --replay replay.nrt --output-file proof.bin

iroha app execution verify-finalized \
  --request request.nrt --replay replay.nrt --proof proof.bin
```

Inputs must be direct regular files. The CLI rejects symbolic links and bounds
the independent request before decoding. Proving writes a temporary file in
the destination directory, flushes and syncs it, then publishes without
overwriting an existing destination. A failed job removes its own partial
temporary output. The success report is printed only after publication.

The fixed local caps are 4 KiB per request, 4 GiB per replay stream, 512 MiB per
proof stream and 32 MiB per component proof, with narrower typed frame and
native semantic limits. They are offline processing ceilings, not consensus
admission limits or evidence of full-race feasibility. In particular, the
current generic ledger proof envelope remains 4 MiB.

## Qualification and remaining work

The [fresh attempt-3 report](../output/qualification/native-street-bundle-cli-attempt-3/report.json)
passes one production Core check and four executable builds: actual CLI, Core
tests, CLI tests and Data Model tests. Each uses the same warm target
sequentially; the exact emitted executable is retained before later builds can
replace warm artifacts. All 88 Core, nine CLI and two Model test names match
source declarations, executable listings and passing output exactly once.

Four positive CLI jobs pass: verification of both exported bundles, fresh
zero-motion proving, and separate verification of that new proof. Both original
reports match exactly. For the fresh proof, all source, context, outcome and
scope fields must match; its separate verifier must reproduce the complete new
report, including actual proof length and association digest.

Nine expected rejections pass: foreign trust and component ordering for both
cases, malformed/trailing proof framing, explicit client configuration, an
existing output destination, and proving against foreign trust. Rejected jobs
emit no success report; existing files remain intact and partial temporary
outputs are cleaned up. No replay server, wallet, private witness file or
signing key is supplied. The intentionally malformed default client file is
not read by the credential-free command route.

The two completed local fixtures use two cars. Their current measurements
cover the entire unoptimized native test, including setup, native signing,
relation preparation, proving, public verification, negative checks and writes:

| Case | Components | Complete proof | Replay | Whole test | Peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Zero-motion technical win | 1 | 256,781 B | 9,630 B | 80.069 s | 167,247,872 B |
| Six-tick technical win | 13 | 6,625,779 B | 10,026 B | 1,254.245 s | 306,413,568 B |

Six ticks are 0.2 simulated seconds. The moving proof exceeds the ledger's
4,194,304-byte envelope. These measurements establish neither full-race
feasibility nor a speedup over earlier workflows or build profiles. The 14
exported components exclude the additional genuine proof generated by the
failing-sink unit test and the fresh CLI proving job. The previous
`compiler::tests::owned_sequence` proof workloads are excluded from this run.

The separate ordinary CLI processes take 17.034 s / 112,640,000 B peak RSS to
verify N0, 281.797 s / 171,933,696 B to verify N6, 23.292 s / 116,310,016 B to
prove a fresh N0, and 17.121 s / 113,098,752 B to verify that new proof. These
are complete process measurements. CLI and libtest dependency features can
differ; no cross-profile speedup is inferred.

The closed report records 159 source pairs (156 native), 55 literal identity
includes, 319 retained artifacts and 42 command receipts. Source/artifact drift
lists are empty. The four builds retain 1,007 / 892 / 1,009 / 619 emitted
library records respectively; those are per-build inventories, not unique
library counts. They are hashed during build capture, without reopening
replaceable warm libraries later. This is a selected source closure, not the
complete compiler, dependency and platform closure.

Scoped formatting of 17 files and the retired-codec guard pass. Core production
checking reports 154 warnings, Core libtest 86, and each CLI target one CLI
warning; Model libtest reports none. No strict Clippy or workspace-wide gate is
claimed. Report SHA-256:
`27515478eb8473e4753d3d299d558df8bb0b37e2fc7266acd35b38bcf0057368`.

The [independent audit](../output/qualification/native-street-bundle-cli-attempt-3/audit.json)
passes without changes. It checks all 319 original artifacts, 159 source
snapshots, 55 includes, four retained executables, 42 commands and all
source/list/pass identities. It validates the public-only CLI files, exact
reports and negative outcomes. It executes no native code, does not
independently decode every Norito file and does not reopen warm libraries or
current source files. Its SHA-256 is
`1508756d25bdaebe7b365106d402ecf1237c473a808fd640cc6f206334305ebb`.

Current reproduction runs the native bundle and CLI transport tests directly
from the isolated checkout with its existing warm target:

```sh
cd /Users/takemiyamakoto/dev/iroha-sora-cars-native
cargo iroha-fast -- test --release -p iroha_core --lib \
  execution_proofs::bundle::tests:: -- --test-threads=1
cargo iroha-fast -- test --release -p iroha_cli --bin iroha \
  execution_bundle::tests:: -- --test-threads=1
```

The native zero-motion and six-motion cases prove and independently verify the
selected segment format, assert one and three proofs respectively, check exact
span ordering and byte totals, and reject changed trust, changed proofs and
retired component schemas. Optional `SORA_CARS_NATIVE_BUNDLE_OUTPUT` exports
fresh request, replay, proof, receipt and negative-control files under a caller
supplied existing absolute directory. Separate CLI process verification must use
those fresh artifacts and the corresponding current executable. No historical
report or executable is a prerequisite; the reports above remain unchanged records
of their original runs. The obsolete Python ancestry chain has been removed.

The first attempt stopped at Data Model compilation because the two new enum
JSON derives lacked native tag attributes. Those attributes were added before
the second attempt. No tests ran in the failed first attempt; its report and
logs remain unchanged. The second attempt passed production Core and CLI
builds, then stopped on new test-fixture visibility, typed-hash and JSON-macro
errors. Those fixture errors were corrected before the third attempt. No tests
ran in either failed attempt.

The fixture carriers use genuine native signatures and local independent
trust, while Street session execution and removal markers are synthetic.
Neither an actual Street State producer nor four-validator operation is
established by these tests. The prior actual Race producer evidence remains
separate.

The subsequent [native producer/exporter qualification](native-street-producer-bundle.md)
connects an actual signed Street deadline transition to Kura retention and the
public prover/CLI. Its separate 32-test/10-CLI lane and independent audit pass.
That case begins from a synthetic zero-value ForcedReveal prestate; it does not
establish admitted Street lifecycle, prior driving or committed State restart.
The original [producer test draft](../output/implementation/native-street-producer-export-draft/plan.md)
remains historical preparation; the new implementation and evidence are described
in the linked qualification note. These later results do not change this lane.

Next connect bounded serving and complete signed driving evidence, qualify legal
Street lifecycle transitions, and provide a self-hostable public-data worker
around the native job. The [worker assessment](../output/implementation/native-public-proof-worker/assessment.md)
and [original supervisor draft](../output/implementation/native-public-proof-worker-draft/plan.md)
remain historical preparation. The subsequent [native supervised command](native-proof-worker.md)
passes 34 tests and 16 CLI outcomes with a separate audit; HTTP/SDK integration
and public resource containment remain open.
Compact full-race proofs with a complete final decider,
the composed 128-bit analysis, CPU/accelerator parity, atomic custody and
settlement, wallet flows and four-validator testing remain required before
registration or live XOR/NFT activation. Taira and SoraFS are unchanged.

## Canonical streaming writer — September 22, 2026

The native writer now admits the exact canonical frame length, then streams to
a bounded sink without retaining a second output-sized encoded Vec. Its typed
schema, checksum, fixed canonical flags and frame/total byte limits remain in
force. Partial I/O, serializer size/checksum drift, zero progress and invalid write
counts permanently poison the writer; later frames cannot reuse partial output.
Short writes and `Interrupted` retries remain supported. Reader and wire types
are unchanged by this scoped change.

Production Torii checking and all 12 selected native tests pass (five new writer
cases and seven existing bundle/replay cases), with 20 completed commands. The
605.468-second run includes building and evidence checks; it is not a proving
or RSS benchmark. Report:
`output/qualification/native-streaming-transport-attempt-1/report.json`, SHA-256
`1ce479bfb0caeb8e05810f188e0786e04983862646952c70d3670407f2cc6627`.
This run does not regenerate proofs or repeat the historical 99-test CLI suite.
Aggregate caller memory and full-race qualification remain open.
