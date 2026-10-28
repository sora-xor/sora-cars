# Iroha game proof foundations — completion goals

Updated October 25, 2026. This is the active acceptance record for reusable
native execution proofs in Iroha 3 for SORA CARS and other games on SORA Nexus.
The release is **not qualified**. The complete preceding source and evidence
record is retained unchanged in [the October 23 history](zk-foundations-history-20261023.md).

## Design decisions

- Use generic game lifecycle, escrow and settlement instructions. Game rules
  belong in immutable compiled adapters; registration cannot upload verifier code.
- Native Rust, canonical Norito and one first-release format per boundary.
  Remove superseded implementations and update their consumers together.
- Every Norito outer frame has a 40-byte header immediately followed by its
  encoded payload. Delete host-layout padding and permissive readers across
  Rust and the SDKs; regenerate affected fixtures, hashes and signatures.
- Street's full-history work uses the existing compiler-owned operand programs,
  bounded guarded segments, native WHIR membership proofs and finalized-record
  binding. Do not install the parallel monolithic whole-history STARK scaffold.
  It duplicates that architecture and exceeds the current proof envelope.
- Qualify the installed extension-field constraint check in the STARK driver
  used by Stock and Grid. The [current-source audit](../output/qualification/deep-air-current-source-audit-20261024/review.json)
  confirms the mandatory DEEP-point AIR identity is implemented in the actual
  verifier. Fresh Stock/Touring native execution now passes; remaining
  profile-specific execution and exact-protocol security review remain open.
- Preserve all accepted input commitments, reveals, retained checkpoints,
  removals and pending certified inputs in the execution relation. Derive the
  settlement statement from consensus state; reject incomplete histories.
- Public replay soundness is required. This application does not claim witness
  privacy. Any private-game mode needs a separately qualified hiding design.
- Keep funded profile admission closed until exact-protocol cryptographic
  review and operational qualification pass. No copied parameter label, short
  proof, simulated network or endpoint response replaces those gates.
- Charge proof execution by an immutable calibrated maximum for its exact
  compiled profile, including complete accepted-history work and late rejection.
  Until calibrated, reject verification and settlement instructions even for
  zero-stake sessions. Initialize compiled descriptors before transaction execution.

## October 25 continuation

Codex has taken over Claude's `Cryptographic proof system performance` session,
both follow-up sessions and all 28 recorded child tasks. The
[takeover packet](../output/qualification/codex-proof-takeover-20261025/README.md)
maps ownership and retains the original transcripts, reports and pending checks.
The October 24 status below is historical: statements there that candidates are
uninstalled or that Core cannot compile do not describe the later native tree.

The [completed predecessor](../output/qualification/claude-native-optimized-20261025-000952/README.md)
records the Core/Torii/node API migration, genuine native proof runs and a full
Touring proof. Its source-bound passes are retained. The subsequent
[streaming/Metal packet](../output/qualification/claude-20261025-prover-memory-gpu/)
contains lab byte-parity and memory measurements. Fresh repaired Stock lab
proofs match the dense reference byte-for-byte at 1, 2 and 16 threads, with
5.18–5.59 GB peak RSS and 4.73–5.11 GB peak footprint. The recovered dense
predecessor recorded a 20.27 GB footprint. Those measurements are not a new
current-native release qualification or comparable unloaded timing run.

The [sixth independent review](../output/qualification/codex-proof-takeover-20261025/reviews/codex-review-6.md)
found reconstructed-row cleanup and recoverable-allocation gaps. Their source
repairs and wider parity tests pass nine focused standalone lab tests and all
14 final native proof tests. The native run includes thread parity at 1/2/16
workers, a genuine current Stock corpus, full Touring proof plus separate
verification, and adversarial bindings for Stock and all three Touring tracks.
The [full eight-car Touring run](../output/qualification/codex-proof-takeover-20261025/memory/touring-full8/qualification-metrics.json)
used 5.213 GB peak footprint / 5.705 GB peak RSS, with 128.220 seconds for proving
plus self-verification and 2.413 seconds for separate history/proof verification.
Those timings were measured under shared machine load. A profile identity
changes when its committed source changes; algorithmic proof identity in the
lab holds the profile/public-input bindings fixed.

Final CLI/profile exports, wire/proof corpora, installed kernels and the rebuilt
addon passed [artifact consistency checks](../output/qualification/codex-proof-takeover-20261025/memory/app-artifacts-ready.json).
Current Stock and Touring profile IDs begin `130847df` and `c5326256`; neither
is registered or release-qualified. The app's 39 focused regressions all pass;
the full suite passes 522 of 524 tests and TypeScript passes. The two remaining
app failures concern artwork palette/provenance, with no proof-related failures.

All 24 test-triage children and 1,208 named later-baseline failures are tracked
in the [Core recovery report](../output/qualification/codex-proof-takeover-20261025/triage/README.md).
The older 1,211 figure belongs to a different run. Partial child edits are not
test passes. Existing app fixes are preserved and have now been checked against
the rebuilt addon and current corpora. Broader Core package results and
unresolved production/fixture questions remain in the recovery report.
All eight selected packages completed: the 1,208 original obligations now map
to 618 passes, 423 failures, 166 deferred p1 cases and one unavailable original
canonical-success expectation. Supplemental and replacement passes are separate.
A single exact browser-adapter retry passed with the required current wire
corpus; its original environment-configuration failure is retained.

All four intended Torii filter regressions pass using their exact test names;
the inherited command matched zero tests. All nine exact regressions for the
three newly reviewed Core fixes pass in the final shared release binary. These
focused passes do not imply a clean complete Core suite.

The [Street redesign research](../output/qualification/codex-proof-takeover-20261025/reviews/codex-street-research-answer.md)
is a proposal for a new phased, multi-table relation. Its 25–40 minute full-race
estimate is unmeasured; no new Street relation has been installed or qualified.
The currently selected guarded-segment design and all release gates remain in
force.

## October 24 source and evidence (historical)

The active checkout is `/Users/takemiyamakoto/dev/iroha-sora-cars-native`, branch
`codex/sora-cars-native`, at Git revision
`c000f91384ff1b1d82a3c9e5c3b10f30139763e4` with local changes.
The [lower-suite predecessor](../output/qualification/norito-reserved-flags-fixture-20261023/report.json)
lost its process and session without a terminal Crypto result. Its
[interruption evidence](../output/qualification/norito-reserved-flags-recovery-20261024/interruption-evidence.json)
confirms the missing processes and unchanged source. The
[recovery run](../output/qualification/norito-reserved-flags-recovery-20261024/report.json)
repeats the unfinished Crypto package and queued consumers against source
`dc9ea5c17f68c72447a2dde870d33aa4d101de92b25b321af400c135a5dfc446`.
All 1,419 Norito tests, 73 derive tests and 336 primitive tests passed; one
existing Norito test was ignored. The recovery run closed with all 1,413 Crypto
unit tests passing and three ignored, then failed two integration assertions
that still expected obsolete untagged shielded roots. Its final source matched
its initial source and all processes were reaped. The
[domain correction](../output/qualification/shielded-merkle-current-domains-20261024/review-candidate.json)
regenerates eight vectors independently, checks omitted/swapped domains and
corrects documentation. It changes no production behavior. The
[successor run](../output/qualification/shielded-merkle-current-domains-20261024/report.json)
passed 75 focused Merkle unit tests, all 202 Crypto integration tests, five
doctests and 3,841 Model tests (eight ignored) on source
`833af9cc2b31e96243efcabaec944f61d492fce64b0947f93519f12d6aaa6d26`.
The prior complete unit pass remains explicitly bound to its original source.
It then closed on a configuration test that still called the retired JSON-error
`Clone` API; source remained unchanged and all children were reaped. The
[original test correction](../output/qualification/config-json-owned-error-recovery-20261024/review-candidate.json)
constructs the two errors independently and preserves both original assertions.
[Independent source review](../output/qualification/config-json-owned-error-independent-review-20261024/review.json)
confirms that no production behavior or compatibility API changed. The
[continuation](../output/qualification/config-json-owned-error-recovery-20261024/report.json)
closed successfully with 35 configuration-base tests, two snapshot tests, two
status-wire tests and the codec-retirement guard passing. Its final source is
`35cb789f14bc5848b784ab0a67a2e17275861e334e0ceced31285482cb5ae0e0`,
unchanged after installation; all logs were verified and child processes reaped.
These are source-bound subsets, not a complete Core or release qualification.

The [current integration chain](../output/qualification/merkle-baseline-integration-chain-20261024/review-candidate.json)
retains that actual closed baseline. Its registry stage removes the obsolete
instruction placeholder and owned fallback decoder. Its [closed run](../output/qualification/instruction-owned-decoder-merkle-baseline-successor-20261024/report.json)
passed all 3,846 Model tests (eight ignored) and the codec guard on unchanged
source `1b10c94bd5ba83d08561cbb089455468b8b94999c9c1c0022e0623f0ef5a2eca`.
[Source review](../output/qualification/registry-merkle-baseline-independent-review-20261024/review.json)
confirms the fifteen exact actions; [runtime review](../output/qualification/registry-merkle-baseline-independent-review-20261024/runtime-review.json)
rehashes all logs and confirms every child exited. The three Core commands remain mandatory
and unpassed: they must follow the complete Core API migration, whose new error
carrier requires separate verdict and abort types. No compatibility defaults
are added. The [capture successor](../output/qualification/fixture-capture-merkle-baseline-successor-20261024/manifest.json)
and its [review](../output/qualification/capture-merkle-baseline-independent-review-20261024/review.json)
retain all five source actions and 325 required selectors. Its [actual run](../output/qualification/fixture-capture-merkle-baseline-successor-20261024/report.json)
installed those five files, then failed compilation with 396 missing JSON-trait
diagnostics: the capture's generic bounds assumed JSON support for instruction
types that do not provide it. [Runtime review](../output/qualification/capture-merkle-baseline-independent-review-20261024/runtime-review.json)
rehashes every log, confirms all children exited, and pins unchanged installed
source `25cfcbe2d19a01e391e5597f950f895f294c323068cdd06af5d8e5f31e57d857`.
No semantic output was produced. The [typed field correction](../output/qualification/fixture-semantic-fields-owner-20261024/review-candidate.json)
generates complete test-only adapters from the original instruction declarations,
preserving every field and all four frame comparisons. [Source review](../output/qualification/fixture-semantic-fields-independent-review-20261024/review.json)
accepts it for native compilation; nested field codecs remain an actual compiler
gate. Its [capture runner](../output/qualification/fixture-capture-semantic-fields-recovery-20261024/manifest.json)
requires the closed failure, six exact changes, three retained owners, derive
tests and 328 Model selectors before export. Its [closed run](../output/qualification/fixture-capture-semantic-fields-recovery-20261024/report.json)
passed 31 derive tests, including all three new field-adapter tests, but failed
the existing FFI inventory assertion. The actual inventory has the same 98
types, with the renamed `ContractErrorVariantDescriptor` replacing the retired
`ContractErrorCodeDescriptor`. [Runtime review](../output/qualification/capture-semantic-fields-independent-runtime-review-20261024/review.json)
confirms unchanged source `5c8ac2c6c009edabc624736bbed903d1bfb05f1ea15402ce83c0274d9730df42`
and all children closed. Model tests and export did not run. The [one-line inventory correction](../output/qualification/direct-ffi-inventory-current-owner-20261024/review-candidate.json)
preserves the full assertion and the other 97 entries. The [next capture run](../output/qualification/fixture-capture-ffi-inventory-recovery-20261024/report.json)
passed all 32 derive tests, then failed Model compilation with six missing
JSON-trait errors for nested transfer entries and public-lane reward shares.
Its installed source remained `af37ff72a6eddddb92a9c12ce249ca717619ef275880f35223f55c8cb8c3ee2d`.
The [runtime review](../output/qualification/fixture-capture-ffi-inventory-runtime-upper-review-20261024/review.json)
confirms all six commands closed, every log hash and the unchanged source.
No Model tests or semantic export ran. The [nested-field correction](../output/qualification/fixture-semantic-nested-fields-owner-20261024/review-candidate.json)
selects complete record/sequence adapters at the original field declarations
and handles both reward-role variants exhaustively. Four new tests cover
malformed selections, nested key sets and equality of all four frames. Native
compilation and output remain pending; no binary fallback or omitted fields
can satisfy the capture gate.
The [conditional lower composition](../output/qualification/lower-fixture-ffi-inventory-composition-20261024/review-preparation.json)
contains 285 paths and 25 prerequisites, including the retained FFI inventory.
It requires genuine capture output and independent output review; its eleven
checks still require a coherent Core composition and the nested-field successor.

The baseline removed the infallible payload method and its inherited fallback
across 123 files. Except for the registry stage identified above, the following
reviewed or in-progress corrections remain uninstalled. Source review and
formatting are not runtime passes.
The [combined lower-codec source](../output/qualification/norito-lower-codec-composition-20261024/review-candidate.json)
now contains 271 files from 24 complete source packets. [Independent composition review](../output/qualification/norito-lower-codec-composition-independent-review-20261024/review.json)
reconstructed all four overlapping edits without dropping either change. The
[prepared installer](../output/qualification/norito-lower-codec-integration-20261024/preparation.json)
adds current status/roadmap updates and requires successful baseline and registry
runs first. [Independent installer review](../output/qualification/norito-lower-codec-installer-independent-review-20261024/review.json)
checked all 273 files, prerequisites, commands and failure handling. It has not
run. A subsequent [fixture audit](../output/qualification/instruction-record-frame-audit-20261024/review.json)
found 16 padded frames in the selected instruction corpus (321 types, 356 cases,
1,424 frames). The prepared lower installer therefore needs a fixture-generation
successor before execution. Preserve the populated values through the native
typed owner, then regenerate frames with the strict current writer; do not add
an old-format reader or weaken the fixture comparisons. Native tests and
regeneration remain required.
The [two-phase fixture source](../output/qualification/fixture-export-filesystem-identity-successor-20261024/review-candidate.json)
preserves the original values before removing the current decoder, then replaces
that temporary capture with the permanent typed-value exporter at the same owner.
[Independent review](../output/qualification/fixture-export-filesystem-identity-independent-review-20261024/review.json)
confirms the complete four-frame equality checks, explicit trigger reconstruction
and corrected filesystem-identity output guard. Eleven isolated runner tests pass;
no native fixture has been generated. The [prepared capture installer](../output/qualification/fixture-capture-integration-20261024/preparation.json)
requires the closed registry stage, all 325 original and new Model test selectors,
and the identical test executable for the ignored native exporter. Its six local
admission tests pass. [Installer review](../output/qualification/fixture-capture-integration-independent-review-20261024/review.json)
confirms the five-file source ancestry, complete selector list and preservation
before replacement. Its successor installed the capture, but the actual compile
failure above leaves semantic output review and coherent lower/SDK gates pending.
The [remaining lower-suite fixture audit](../output/qualification/lower-fixture-consumer-audit-20261024/review.json)
found thirteen more padded accepted frames across integer schema, streaming
ticket and concrete event owners. All 396 streaming identity rows also retain
obsolete padding metadata. Their original typed factories are available; the
[current-writer export packet](../output/qualification/lower-current-fixture-export-owner-20261024/review-candidate.json)
adds four ignored native exporters and retains the original eleven tests and
57 assertions. [Independent source review](../output/qualification/lower-current-fixture-export-independent-review-20261024/review.json)
confirms their original factories, feature sets and complete assertion retention.
Actual regeneration remains pending. Exact outer
geometry in other scanned frames does not qualify their nested semantics.
The [coherent lower cutover](../output/qualification/lower-fixture-cutover-composition-20261024/review-candidate.json)
combines 281 paths against the expected successful capture state. Its
[independent review](../output/qualification/lower-fixture-cutover-composition-independent-review-20261024/review.json)
verifies both overlaps, seventeen prerequisites and the sequence of five real
exports, reviewed generated outputs, nine generated-owner updates and the
original eleven lower checks. The [concrete installer and exporter runner](../output/qualification/lower-fixture-install-export-preparation-20261024/review-candidate.json)
now enforces the closed capture, independently reviewed semantic output,
archive-before-write and five source-bound native exports. Its eight isolated
helper tests pass. [Independent review](../output/qualification/lower-fixture-install-export-independent-review-20261024/review.json)
checked all 281 source paths, seventeen prerequisites and exact commands.
It stops for review of actual generated outputs; neither installation nor
native export has run. The following golden-update and lower-check stages
still require those real outputs and their review.
The [SDK composition](../output/qualification/sdk-frame-journal-composition-20261024/review-candidate.json)
contains 109 files from 17 complete packets. [Independent composition review](../output/qualification/sdk-frame-journal-composition-independent-review-20261024/review.json)
walked each source chain and reproduced the full patch in both directions.
The [Java journal retirement](../output/qualification/java-connect-journal-retirement-20261024/review-candidate.json)
deletes three duplicate implementations and their old suite, moving all six
scenarios to Kotlin's Java-consumer tests. The [combined source](../output/qualification/sdk-frame-journal-retirement-composition-20261024/review-candidate.json)
contains 116 paths, including four explicit deletions; [independent review](../output/qualification/sdk-retirement-composition-independent-review-20261024/review.json)
reproduced every final hash and absence. All [40 combined Kotlin/Java tests](../output/qualification/kotlin-sdk-coherent-runtime-20261024/review-candidate.json)
pass with JDK 8 API guards. [Evidence review](../output/qualification/kotlin-sdk-coherent-runtime-independent-review-20261024/review.json)
confirms exact sources, selectors and results. These SDK changes remain uninstalled;
full native bridge, generated fixture and supported-target qualification is open.
The [prepared SDK installer](../output/qualification/sdk-native-integration-node-inventory-successor-20261024/preparation.json)
archives the originals and applies all replacements and deletions together after
the lower-codec gate. [Independent review](../output/qualification/sdk-native-installer-successor-independent-review-20261024/review.json)
confirms its corrected dependency ordering and installed-source checks for 63 JS,
11 Python and 40 Kotlin/Java tests. The installer has not executed.

- **Explicit borrowed payloads:** the [lifetime audit](../output/qualification/norito-payload-capability-owner-audit-20261023/review.json)
  found address-only TLS and static-slice APIs that could outlive their buffers.
  The replacement changes the original Core, derive and manual decoder contract
  to `PayloadCursor`, makes owned archives lend actual storage, and deletes
  the raw payload/root context and marker APIs. Construction is observational;
  decoding scopes flags and budgets. The [independent review](../output/qualification/norito-payload-cursor-independent-review-20261024/review.json)
  also requires removal of serializer-based consumption inference, complete
  nested consumption, byte-array size/depth checks and heap capacity accounting.
  The [frozen replacement](../output/qualification/norito-payload-capability-owned-20261023/review-candidate.json)
  and [import successor](../output/qualification/norito-payload-capability-import-successor-20261024/review-candidate.json)
  retain the original test coverage. The [flatten-field successor](../output/qualification/norito-flatten-admission-owner-20261024/review-candidate.json)
  adds shared size/depth admission and actual prefix consumption for tuple,
  enum and unit slice decoders. Its 16 original tests remain and seven regressions
  are added; [source review](../output/qualification/norito-stream-frame-completion-owner-20261024/flatten-independent-review.json)
  found no introduced blocker. The [typed-caller correction](../output/qualification/norito-payload-typed-callers-successor-20261024/review-candidate.json)
  fixes 61 staged calls across 23 files that supplied the decoder trait instead
  of the concrete value type. [Independent source review](../output/qualification/norito-typed-callers-independent-review-20261024/review.json)
  confirms those types match each original parser. Final composition,
  compile-fail lifetime tests and full native qualification remain open.
- **Portable frame format:** the [Rust frame owner](../output/qualification/norito-rust-unpadded-frame-owner-20261024/review-candidate.json)
  removes padding APIs, writer insertion, reader skipping and type-specific
  view state. [JavaScript](../output/qualification/norito-js-unpadded-frame-owner-20261024/review-candidate.json),
  [Kotlin](../output/qualification/kotlin-canonical-frame-owner-20261024/review-candidate.json),
  [Swift](../output/qualification/swift-unpadded-frame-owner-20261024/review-candidate.json)
  and [Python](../output/qualification/norito-python-unpadded-frame-owner-20261024/manifest.json)
  have corresponding source candidates. Eleven Python header tests and 21
  JavaScript boundary tests pass on copied source. The JS changes also reject
  ASCII high-bit magic aliases, remove native alignment retries and fake
  roundtrip success, enforce exact journal boundaries, and correct journal
  checksums to CRC-64/XZ. The [package successor run](../output/qualification/js-package-browser-inventory-successor-20261024/runtime-report.json)
  passes 30 of 31 tests, including the actual browser bundle; the remaining
  Node account test requires a rebuilt native binding. The [Swift journal successor](../output/qualification/swift-journal-canonical-hash-20261024/review-candidate.json)
  removes its obsolete Blake3 path and uses BLAKE2b-256 with shared specification
  vectors. The [JavaScript uint64 successor](../output/qualification/js-journal-u64-owner-20261024/review-candidate.json)
  removes numeric/string wire-integer coercion and lossy timestamp conversion,
  checks expiry overflow before mutation, and fixes memory-queue expiry behind
  an unexpired head. Independent review then reproduced post-validation scalar
  mutation and caller-owned byte mutation. The [immutable record successor](../output/qualification/js-journal-immutable-owner-20261024/review-candidate.json)
  owns private validated storage and copies byte buffers on input and access.
  Its [50 tests pass](../output/qualification/js-journal-immutable-owner-20261024/runtime-report.json),
  including mutation regressions, all eight shared vectors and TypeScript.
  [Independent reproduction](../output/qualification/journal-moderation-independent-review-20261024/closure-review.json)
  confirms both mutation defects are closed in that successor.
  The [Kotlin uint64 successor](../output/qualification/kotlin-journal-uint64-owner-20261024/review-candidate.json)
  uses bounded Java-compatible `BigInteger` values and exact zero journal flags.
  Its [17 focused JUnit tests pass](../output/qualification/kotlin-journal-uint64-owner-20261024/runtime-qualification.json)
  after compiling Kotlin and Java against JDK 8 APIs, including all eight vectors.
  The [Swift uint64 successor](../output/qualification/swift-journal-uint64-owner-20261024/review-candidate.json)
  deletes floating retention and expiry saturation, checks queue configuration
  before storage, rejects foreign-direction records, and migrates recorder/CLI
  callers. Its 21 existing tests remain with two changed-behavior replacements
  and four new regressions; six Swift files parse. [Independent review](../output/qualification/swift-journal-uint64-independent-review-20261024/review.json)
  found no new source defect, but no Swift runtime is claimed.
  The [portable browser journal](../output/qualification/js-journal-browser-owner-20261024/review-candidate.json)
  removes Node-only imports and environment-selected hash/base64 fallbacks and
  exposes the same journal through the browser entry point. Its focused run
  passes 55 tests and 23 actual Chromium IndexedDB checks across reload.
  [Independent browser review](../output/qualification/js-journal-browser-independent-review-20261024/review.json)
  reproduced partial commits after callback failure, incorrect stored metadata
  bypassing expiry/quotas/direction, and acceptance of mismatched payload hashes.
  The [browser correction](../output/qualification/js-journal-consistency-owner-20261024/review-candidate.json)
  aborts and drains failed transactions, validates complete rows, and deletes
  duplicated stored length/expiry and caller-supplied hashes. Its 59 Node/type
  tests, one package test and 12 actual Chromium checks pass; [closure review](../output/qualification/js-journal-browser-independent-review-20261024/closure-review.json)
  confirms the fixes in source. The [Swift/Kotlin record correction](../output/qualification/sdk-journal-derived-hash-owner-20261024/review-candidate.json)
  deletes caller-supplied hashes, derives them from owned ciphertext, and rejects
  mismatches during decode. Kotlin also rejects expiry before receipt. All 20
  focused JVM tests pass, including the original 17, three new regressions,
  eight shared vectors and Java 8 consumers; Swift has parsing evidence only.
  [Independent review](../output/qualification/sdk-journal-derived-hash-independent-review-20261024/review.json)
  found no introduced hash defect, but reproduced Kotlin queue TTL coercion and
  missing file-direction validation. The [queue correction](../output/qualification/kotlin-journal-queue-invariants-successor-20261024/review-candidate.json)
  uses exact zero TTL and rejects foreign-direction records before mutation;
  all 22 focused Kotlin/Java tests pass. [Independent review](../output/qualification/kotlin-journal-queue-invariants-independent-review-20261024/review.json)
  confirms source ancestry, rejection order and retained assertions. Swift runtime parity, complete Kotlin
  consumers, generated fixtures and integrated native
  tests remain open. The [KAGEMUSHA frame successor](../output/qualification/kagemusha-unpadded-frame-successor-20261024/review-candidate.json)
  removes padded monetary descriptors and updates original circuit prefix
  checks. Its tests, authoritative fixture exporters and circuit key/protocol
  regeneration still require execution. The [streaming successor](../output/qualification/norito-stream-frame-completion-owner-20261024/review-candidate.json)
  closes incomplete EOF checks and preserves primary errors. Its [test correction](../output/qualification/norito-stream-test-element-successor-20261024/review-candidate.json)
  uses the actual generic element format; [independent source review](../output/qualification/norito-stream-independent-review-20261024/review.json)
  found no additional introduced blocker. The [raw-vector stream successor](../output/qualification/norito-raw-byte-stream-owner-20261024/review-candidate.json)
  selects explicit raw-byte or framed-element parsing from the container type;
  82 previous tests remain and ten byte-stream regressions are added.
  [Independent source review](../output/qualification/norito-raw-byte-stream-independent-review-20261024/review.json)
  found no introduced production blocker. Its [documentation composition](../output/qualification/norito-raw-byte-stream-doc-composition-20261024/review-candidate.json)
  preserves the allocation section from the newer parent. The [typed byte-vector successor](../output/qualification/norito-vec-byte-contract-owner-20261024/review-candidate.json)
  deletes four type-name checks and both unsafe Vec casts, sharing a sealed,
  type-preserving contract with streaming. It retains borrowed string encoding
  and adds nine regressions. [Independent review](../output/qualification/norito-vec-byte-contract-independent-review-20261024/review.json)
  found no introduced source blocker. Native runtime qualification remains
  open; none of these frame candidates is installed in Native.
- **Retained storage:** the [nine-file primitive migration](../output/qualification/norito-primitives-payload-capability-20261023/review-candidate.json)
  removes owned retries and alignment dispatch and retains actual failures.
  It has explicit successors for the [invalid UTF-8 fixture](../output/qualification/norito-conststr-invalid-fixture-successor-20261023/review-candidate.json)
  and [SmallVec excess capacity](../output/qualification/norito-smallvec-capacity-successor-20261024/review-candidate.json).
  The [decompression owner](../output/qualification/norito-decompression-payload-owner-20261024/review-candidate.json)
  admits one exact output buffer and uses it for CPU/GPU decoding, preserving
  actual I/O failures and rejecting short or overlong output. Its
  [GPU policy successor](../output/qualification/norito-gpu-decode-policy-successor-20261024/review-candidate.json)
  prevents helper discovery when policy refuses or quarantines the accelerator.
  The [actual-allocation owner](../output/qualification/norito-allocation-owner-successor-20261024/review-candidate.json)
  removes phantom borrowed-field charges after admitting owned buffers,
  planning tables, exposed capacity and canonical comparison scratch at their
  original owners. Its 621 existing tests remain with fourteen additions.
  [Independent review](../output/qualification/norito-allocation-independent-review-20261024/review.json)
  found one missed enum-name String allocation. The [original-owner correction](../output/qualification/norito-aos-enum-allocation-successor-20261024/review-candidate.json)
  adds exact storage admission with two regressions; [closure review](../output/qualification/norito-allocation-independent-review-20261024/closure-review.json)
  confirms the source fix. Runtime remains pending. The [KAGEMUSHA allocation successor](../output/qualification/kagemusha-bindings-allocation-owner-20261024/review-candidate.json)
  preserves reservation failures and exposed excess, and replaces a phantom
  allocation-bomb test with a measured real-allocation boundary test. The [SoraFS quarantine successor](../output/qualification/moderation-real-allocation-owner-20261024/review-candidate.json)
  replaces the retired alignment-copy multiplier with a schema-derived storage
  bound; its runtime qualification depends on that lower owner. Internal native
  workspace allocations and actual hardware parity remain open. The [borrowed reverse iterators](../output/qualification/norito-columnar-borrowed-reverse-owner-20261024/review-candidate.json)
  remove three materialized reverse vectors and per-name String clones.
  [Independent review](../output/qualification/norito-columnar-borrowed-reverse-independent-review-20261024/review.json)
  found an inherited UTF-8 offset validation hole in the original view constructors.
  The [constructor correction](../output/qualification/norito-columnar-utf8-boundary-owner-20261024/review-candidate.json)
  validates character boundaries at all five original admission branches while
  preserving arbitrary binary column offsets. [Closure review](../output/qualification/norito-columnar-borrowed-reverse-independent-review-20261024/closure-review.json)
  confirms the source fix; seven new tests and native runtime remain pending.
  Kotlin's [columnar correction](../output/qualification/kotlin-columnar-strict-utf8-owner-20261024/review-candidate.json)
  and [AoS successor](../output/qualification/kotlin-aos-strict-utf8-owner-20261024/review-candidate.json)
  remove all six identified lenient decoding branches. Nine focused tests pass
  with JDK 8 API enforcement; [independent review](../output/qualification/kotlin-strict-utf8-independent-review-20261024/review.json)
  confirms the exact replacements and recorded evidence. Complete SDK integration,
  Java duplicate retirement and current Rust-exporter parity remain open.
- **Instruction registry:** the [prepared integration](../output/qualification/instruction-owned-decoder-recovery-integration-20261024/preparation.json)
  removes the `InvalidInstruction` sentinel, uses one canonical borrowed parser,
  preserves decoder errors, and admits final boxes fallibly. Its original
  registry goldens and retired-frame rejection fixtures are updated. It can run
  only after the current lower-suite run closes successfully on unchanged source.
- **Consensus failure propagation:** the [committee owner](../output/qualification/state-autoscale-committee-owner-20261024/review-candidate.json),
  [lane block owner](../output/qualification/lane-block-execution-owner-20261023/review-candidate.json)
  and [planner owner](../output/qualification/lane-block-planner-execution-successor-20261023/review-candidate.json)
  replace erased errors with complete execution outcomes. The
  [committee geometry successor](../output/qualification/state-autoscale-committee-geometry-successor-20261024/review-candidate.json),
  [live-key selection owner](../output/qualification/state-live-key-original-owner-20261024/review-candidate.json)
  and [Kura predicate owner](../output/qualification/kura-fallible-lane-predicate-owner-20261024/review-candidate.json)
  are frozen source candidates. The [participant role successor](../output/qualification/participant-consensus-role-owner-20261024/review-candidate.json)
  removes the Validator-role fallback for Committee participants and preserves
  lookup aborts during stake admission. The [original execution successor](../output/qualification/execute-core-abort-original-owner-20261024/review-candidate.json)
  carries `CoreExecutionAbort` through 439 instruction implementations and the
  original dispatcher, preserving concrete fee, sponsor, installed-policy and
  lane-stage recovery errors. Its 1,536 original tests remain, with five added.
  [Independent review](../output/qualification/execute-core-abort-independent-review-20261024/review.json)
  identified inherited sponsor-close reclassification and installed-registry
  identity errors. The [world correction](../output/qualification/execute-core-abort-world-correction-20261024/review-candidate.json)
  fixes both and retains all 357 world test bodies with two new regressions.
  Parsing and patch checks are not compilation. The [query closure census](../output/qualification/core-query-carrier-original-closure-census-20261024/review-preparation.json)
  identifies 164 query carriers and six instruction-test helpers in ten files.
  Shared SoraFS decode/allocation helpers and world relay helpers erase failures
  before those carriers; their original producers and Torii finalized-policy
  consumer need coordinated changes. The census retains 657 test selectors and
  is preparation only. The [singular-owner audit](../output/qualification/core-query-singular-prerequisite-independent-audit-20261024/review.json)
  found mismatched bounded-writer errors, erased local failures and stale decode
  probes in the earlier typed helper. The [source correction](../output/qualification/core-query-singular-ownership-successor-20261024/review-candidate.json)
  preserves concrete bounded failures, aborts on corrupt private charge state,
  and adopts consuming payload cursors. Its seventeen original tests and 45
  assertions remain, with seven explicit failure-class corrections and six new
  regressions. [Independent source review](../output/qualification/core-query-singular-ownership-independent-review-20261024/review.json)
  confirms the original tests, concrete error ownership and cleanup paths.
  Native execution is pending; supported measured allocation accounting remains
  in use. The [public query and Oracle migration](../output/qualification/core-query-trait-oracle-owner-20261024/review-candidate.json)
  carries explicit operational failures through the original traits, fourteen
  providers and ten iterable test consumers. [Source review](../output/qualification/core-query-trait-oracle-independent-review-20261024/review.json)
  found a nonexhaustive rejection helper. Its [correction](../output/qualification/core-query-oracle-terminal-helper-successor-20261024/review-candidate.json)
  rejects both local aborts and terminal recovery failures, retaining both
  terminal causes. [Closure review](../output/qualification/core-query-trait-oracle-independent-review-20261024/closure-review.json)
  confirms all 47 prior integration test bodies and two new regressions.
  The [relay helper migration](../output/qualification/core-query-verified-lane-owner-successor-20261024/review-candidate.json)
  preserves concrete pointer, codec, JSON, parse and allocation causes through
  its query and registration consumers. A [follow-up](../output/qualification/core-query-verified-lane-move-successor-20261024/review-candidate.json)
  deletes an unnecessary infallible buffer copy during insertion. Its
  [source review](../output/qualification/core-query-verified-lane-independent-review-20261024/closure-review.json)
  confirms all 359 original tests and seven added regressions remain.
  These changes require the remaining query providers and coherent compilation;
  they are not installed. The [Model reputation prerequisite](../output/qualification/reputation-model-owned-causes-20261024/review-candidate.json)
  deletes the erased canonical-encoding marker and carries actual writer failures
  through twelve original journal methods. [Independent source review](../output/qualification/reputation-model-owned-causes-independent-review-20261024/review.json)
  reconstructs all 25 prior tests and 146 assertions with 34 explicit carrier
  changes; three new regressions cover real allocation and writer failures.
  Core, Node and Rust client consumers remain required before installation.
  The [shared query allocation correction](../output/qualification/core-query-vector-capacity-owner-20261024/review-candidate.json)
  admits a complete replacement buffer, including observed excess capacity,
  before moving values. A failed reservation leaves the original owner intact.
  [Independent review](../output/qualification/core-query-vector-capacity-independent-review-20261024/review.json)
  preserves the original tests and adds measured allocation and retry coverage.
  Its [classifier successor](../output/qualification/core-query-codec-classifier-owner-20261024/review-candidate.json)
  removes calls to a retired Core helper and uses the actual Norito error owner.
  [Source review](../output/qualification/core-query-codec-classifier-independent-review-20261024/review.json)
  confirms that allocation behavior and all tests remain unchanged. Neither
  correction has been installed or compiled with the complete Core graph.
  The [Core reputation migration](../output/qualification/core-reputation-owned-causes-20261024/review-candidate.json)
  retains stored Model, codec and query causes. [Independent review](../output/qualification/core-reputation-owned-causes-independent-review-20261024/review.json)
  found a terminal-query classification error, a retired classifier call and an
  inherited ambient-layout state comparison. The [correction](../output/qualification/core-reputation-review-correction-20261024/review-candidate.json)
  removes those paths and uses an [owning primary transformation](../output/qualification/execution-primary-category-owner-20261024/review-candidate.json)
  that preserves independent cleanup failures. [Closure review](../output/qualification/core-reputation-correction-independent-review-20261024/review.json)
  accepts those source fixes. The [finalized reputation archive migration](../output/qualification/reputation-finalized-archive-owned-causes-20261024/review-candidate.json)
  retains complete Model, query, canonical-history and cleanup failures instead
  of reducing them to diagnostic strings. Its [source review](../output/qualification/reputation-finalized-archive-independent-review-20261024/review.json)
  confirms all 55 existing tests and four new failure/retry tests. Native
  execution, Node, client and remaining query-provider migrations are required.
  The [orderbook prerequisite census](../output/qualification/orderbook-query-owned-prerequisites-20261024/review-preparation.json)
  identifies an earlier loss of codec causes in the Manifest decoder, before
  Core receives the error. Its original decoder, reference validation and
  reached Model/Node/Torii consumers need one coherent ownership migration;
  changing only Core result signatures would preserve the defect. This direct
  call inventory is preparation, not a completed transitive migration.
  Public-key formatting/JSON, remaining callers and complete
  composition still require native qualification. The [consuming-dispatch design](../output/qualification/instruction-dispatch-ownership-preparation-20261024/review-candidate.json)
  pins the original clone path through transaction producers, overlays and the
  scheduler. Removing the dispatch clone requires uniquely owned effects,
  separated fee facts and retained authenticated replay input; relocating the
  clone or serializing to recreate ownership is not an implementation. This
  design is not yet code. The
  [signing-directory correction](../output/qualification/core-drain-directory-durability-successor-20261023/review-candidate.json)
  requires ancestry synchronization even when an earlier uncertain creation is
  already visible. These packets are not standalone installable.
- **Proof commitments:** the [WHIR source review](../output/qualification/whir-commitment-independent-review-20261023/review.json)
  found no additional blocker in its frozen commitment leaf and 17 tests.
  The [geometry migration](../output/qualification/whir-upper-caller-owner-20261024/review-candidate.json)
  removes mixed error classification and obsolete opening estimates, preserves
  failures and admits actual allocations. Its [borrow correction](../output/qualification/whir-upper-caller-borrow-successor-20261024/review-candidate.json)
  and [actual-owner regression](../output/qualification/whir-geometry-owner-test-successor-20261024/review-candidate.json)
  address review findings; [closure review](../output/qualification/whir-geometry-independent-review-20261024/closure-review.json)
  confirms source changes and retention of five original tests plus five new
  tests. The [fallible profile copy](../output/qualification/whir-profile-fallible-copy-owner-20261024/review-candidate.json)
  removes the infallible `Clone` path and admits each of its four owned buffers
  through the existing allocation owner. [Source review](../output/qualification/whir-profile-fallible-copy-independent-review-20261024/review.json)
  confirms exact parent reconstruction, all ten existing tests and 66 assertions,
  plus two new allocation/refusal regressions. Driver and membership copies must
  migrate together. Native compilation and execution are pending. This is not independently
  installable: the fourteen-file lexical census does not bound the actual
  propagation through the phased driver, membership, segments and Street
  admission. An [include-graph correction](../output/qualification/allocation-measurement-selection-correction-20261024/review.json)
  confirms that `with_decode_limits_measured` remains a supported allocation
  owner. The unnecessary test-only migration based on its supposed retirement
  is deselected; the original typed dynamic-linear owner and width-corrected
  measurement tests remain selected. Historical reports are retained with this
  correction. Native execution and the remaining caller migrations are pending.
  The [basis owner migration](../output/qualification/multilinear-basis-owned-causes-20261024/review-candidate.json)
  removes the mixed error API, retains concrete allocation failures and guards
  buffer growth. [Independent source review](../output/qualification/multilinear-basis-owned-causes-independent-review-20261024/review.json)
  confirms unchanged arithmetic and transform loops, six original tests with
  exact typed negative mappings, and seven new regressions. The
  [phased driver migration](../output/qualification/phased-whir-owned-causes-20261024/review-candidate.json)
  replaces mixed resource errors and infallible owned copies with explicit
  verdicts, concrete abort causes and fallible storage admission. Its
  [independent source review](../output/qualification/phased-whir-owned-causes-independent-review-20261024/review.json)
  confirms eleven existing tests with 68 assertions, eight new regressions,
  unchanged arithmetic bodies and transcript labels. The
  [membership relation migration](../output/qualification/membership-relation-owned-causes-20261024/review-candidate.json)
  preserves all twelve existing tests and 107 assertions and adds six owner
  regressions. [Independent review](../output/qualification/membership-relation-owned-causes-independent-review-20261024/review.json)
  found that its two computed descriptor passes still reported an internal sizing
  failure as a caller limit rejection. The [two-pass correction](../output/qualification/membership-relation-descriptor-cause-successor-20261024/review-candidate.json)
  retains the original failure and any independent cleanup cause; two new tests
  distinguish public limit rejection from internal count/write failures.
  [Closure review](../output/qualification/membership-relation-owned-causes-independent-review-20261024/closure-review.json)
  confirms that source correction and unchanged prior test bodies.
  The [query ownership replacement](../output/qualification/whir-query-vector-ownership-20261024/review-candidate.json)
  deletes the boxed-slice input requirement and infallible query cloning. It
  moves admitted vectors, restores fixed logical owner charges and measures
  retained capacities separately. [Independent review](../output/qualification/whir-query-vector-ownership-independent-review-20261024/review.json)
  verifies all 25 original tests and 150 assertions, three new regressions and
  unchanged driver production. The membership adapter replacement below must
  be installed with it; source review does not establish runtime correctness.
  The [membership adapter replacement](../output/qualification/phased-membership-owned-causes-20261024/review-candidate.json)
  now uses those moved query buffers and carries concrete lower failures through
  its original prover and verifier. All nineteen prior selectors and 207
  assertions remain, with five new tests. [Review](../output/qualification/phased-membership-owned-causes-independent-review-20261024/review.json)
  found an obsolete terminal-failure constructor in a new test; its
  [public-API correction](../output/qualification/phased-membership-terminal-api-successor-20261024/review-candidate.json)
  and [closure review](../output/qualification/phased-membership-owned-causes-independent-review-20261024/closure-review.json)
  preserve both primary and cleanup causes. The [segment-plan ownership change](../output/qualification/guarded-segment-plan-vector-owner-20261024/review-candidate.json)
  removes span and component normalization copies and exposes actual retained
  capacity separately from logical charges. [Source review](../output/qualification/guarded-segment-plan-vector-owner-independent-review-20261024/review.json)
  confirms ten unchanged prior tests and three added regressions. Segment
  callers, neighboring allocation owners and complete composition remain open.
  The [segment-proof migration](../output/qualification/guarded-segment-proof-owned-causes-20261024/review-candidate.json)
  retains fifteen original tests and 159 assertions and removes the mixed error
  API and buffer normalization. [Independent review](../output/qualification/guarded-segment-proof-independent-review-20261024/review.json)
  requires correction of two malformed test patterns and private retained-state
  overflow classification. The [correction](../output/qualification/guarded-segment-proof-retained-provenance-successor-20261024/review-candidate.json)
  fixes both and distinguishes received witness membership failures from
  internal extraction failures. [Closure review](../output/qualification/guarded-segment-proof-independent-review-20261024/closure-review.json)
  confirms unchanged public signatures, all 21 prior tests and 195 assertions,
  plus two added regressions. Native execution and caller closure remain pending.
  The [accepted-computation migration](../output/qualification/accepted-guarded-owned-causes-20261024/review-candidate.json)
  removes the mixed error API and lets each compiled application own its callback
  failures. All thirteen original tests and ninety assertions remain.
  [Review](../output/qualification/accepted-guarded-independent-review-20261024/review.json)
  found an omitted allocator-capacity charge; the [original-owner correction](../output/qualification/accepted-guarded-capacity-successor-20261024/review-candidate.json)
  charges observed excess storage before returning the buffer and adds a native
  measurement regression. [Closure review](../output/qualification/accepted-guarded-independent-review-20261024/closure-review.json)
  records that source fix. Production Street, prover, bundle and CLI callers
  still need migration and genuine native execution.
  The [operand and sequence ownership correction](../output/qualification/operand-sequence-vector-owner-20261024/review-candidate.json)
  removes redundant vector-to-box copies and measures every retained buffer,
  including nested maps, terms and ROM columns. The [ROM catalog correction](../output/qualification/operand-rom-catalog-copy-removal-20261024/review-candidate.json)
  removes its obsolete cloning API. [Independent source review](../output/qualification/operand-sequence-vector-independent-review-20261024/review.json)
  verifies both exact patches and the scoped capacity accounting. The [program ownership replacement](../output/qualification/operand-program-vector-retirement-owner-20261024/review-candidate.json)
  deletes the redundant builder and all fifteen remaining vector-to-box
  conversions. Its [source review](../output/qualification/operand-program-vector-retirement-independent-review-20261024/review.json)
  verifies both patches, retained original assertions, complete capacity
  accounting and unchanged descriptor encoding. Graph-wide resource accounting
  and coherent Core compilation remain open.
  None of these proof changes is installed or runtime-qualified.
  Commitment authentication alone does not establish degree, proximity, hiding
  or composed security.

All passing historical tests and failed compiler/runtime evidence remain in the
[dated record](zk-foundations-history-20261023.md) and their source-bound reports.
The last application captures establish gameplay and audio behavior only;
they do not qualify proof soundness, finality or funded settlement.

## Completion gates

| Gate | Next concrete outcome | Completion evidence |
| --- | --- | --- |
| F0/F1 — Current baseline and complete record binding | Resolve the remaining Core failures and complete outstanding SDK/browser integration checks | Current-source native and consumer tests pass; altered records, epochs, networks and histories reject |
| F2 — Accepted inputs and complete execution | Validate the selected generic segment path and regenerate browser parity from the installed production Core exporter | Every input, transition, integer bound, collision, inactive/padding row, checkpoint, removal and terminal outcome is constrained; adversarial tests pass |
| F3 — Exact cryptographic security | Qualify the installed Fp4 DEEP AIR check in the registered STARK driver; qualify the Street WHIR composition separately | Exact parameters, transcript, field/hash assumptions and all composition losses receive independent review establishing at least 128-bit classical soundness |
| F4 — Practical full races | Measure the actual segment path, reduce its bottlenecks and bound total transport/verification work | Genuine two- and eight-player 5,400-tick proofs and Tokyo's actual 9,000-tick cap independently verify; retain time, peak memory, proof bytes and validator cost |
| F5 — Protected settlement | Enforce exact-profile work admission, calibrate worst-case costs and complete genuine funded XOR/NFT lifecycle tests | Atomic settlement, exact ties, forfeits, disputes, duplicate rejection and custody protection pass from consensus-derived statements within reserved validator resources |
| F6 — Usable verification tools | Finish the fresh twenty-one-stage consumer run and native finalized-inclusion workflow | Canonical current fixtures, wallet/network/fee binding, proof verification and finalized inclusion against a pinned trust context pass end to end |
| F7 — Generic reuse | Complete funded Grid settlement and practical cost qualification | A second game proves and settles through the same generic framework without race-specific instructions |
| F8 — Release qualification | Run supported-target parity and real four-validator failure/recovery scenarios | Partitions, withheld inputs, competing checkpoints, restart/replay and identical state roots pass; independent crypto review and deployment prerequisites pass |

All gates remain open. Historical passing subtests are retained in the dated
record; they do not close a gate whose required end-to-end outcome is missing.

## Execution order

1. Resolve the remaining Core production and fixture failures from the takeover
   register, keeping every original negative assertion. Preserve the completed
   streaming repair, 14 native proof tests, nine exact Core regressions and
   source-bound full Touring result; future native edits require new applicable
   qualification evidence in the existing warm build lanes.
2. Complete the outstanding twenty-one-stage SDK/browser integration corridor.
   Current exports, corpora, addon, focused app regressions and the full unit
   suite have fresh evidence, with two artwork failures still recorded. Keep
   artifacts coherent after subsequent changes; historical artifacts cannot
   qualify new code.
3. Prove complete accepted Street segments, then complete full-duration races
   with bounded total resources. Optimize measured costs rather than raising
   admission caps to conceal an infeasible design.
4. Complete funded settlement, finalized verification, cross-target parity,
   four-validator recovery and independent cryptographic review.
5. Integrate the qualified native changes with the requested Iroha development
   branch and validate advancing Taira finality, wallet interoperability and
   SoraFS availability before live staked races or publication.

Operational evidence belongs under `output/qualification/`. Temporary paths,
stale tool versions and historical PID chains are not execution prerequisites.
A source review is not a test pass; a test pass is not a security qualification.
