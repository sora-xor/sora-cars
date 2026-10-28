# Iroha game proof foundations — completion goals

Resumed October 23, 2026. This is the current work and acceptance record for
reusable native execution proofs in Iroha 3 for SORA CARS and other games on
SORA Nexus. The release is **not qualified**. The earlier detailed record is
preserved in [the dated history](zk-foundations-history-20261013.md).

## Design decisions

- Use generic game lifecycle, escrow and settlement instructions. Game rules
  belong in immutable compiled adapters; registration cannot upload verifier code.
- Native Rust, canonical Norito and one first-release format per boundary.
  Remove superseded implementations and update their consumers together.
- Street's full-history work uses the existing compiler-owned operand programs,
  bounded guarded segments, native WHIR membership proofs and finalized-record
  binding. Do not install the parallel monolithic whole-history STARK scaffold.
  It duplicates that architecture and exceeds the current proof envelope.
- Repair the extension-field constraint check in the STARK driver currently
  used by Stock and Grid. A separate calculation or base-field spot check does
  not supply the missing DEEP-point identity.
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

## Current source and evidence

The October 18 baseline observation identifies Native source
`6c039e470fa1b625b0965dc9a8a904e6790428e34c8421213c17bb79245f6a0d`
at Git revision `c000f91384ff1b1d82a3c9e5c3b10f30139763e4` with local changes.
The checkout is `/Users/takemiyamakoto/dev/iroha-sora-cars-native`.
The coordinated repair has since changed that source. Evidence below belongs to
its recorded source, not automatically to a later edit.

The [mandatory fallible decoder installation](../output/qualification/norito-fallible-decoder-integration-20261023/manifest.json)
removes the original infallible `DeserializePayload::deserialize`, its inherited
fallback, and obsolete callers across 123 files. Borrowed strings and byte slices
retain bounds and access tracking without charging nonexistent allocations;
owned strings and long `ConstString` values charge their retained storage.
PeersGossip rejects the retired vector payload, and uptime rejects noncanonical
nanoseconds. Independent source reviews and a census of 5,463 Rust files found
no remaining original archived infallible methods in crates/integration tests.
The [first full Norito run](../output/qualification/norito-fallible-decoder-integration-20261023/report.json)
on source `39b54c797e092b057a77d4ffb425dc4a75205d3a43f46ae14c8ba975910bc806`
passed 563 library tests (one ignored), then stopped at three grouped failures:
two validation fixtures requested retired layout flags; one allocation fixture
counted unrelated concurrent test threads. All children exited and were reaped,
with the installed source unchanged. Corrections and fresh complete lower-suite
qualification are required; the existing allocation limit is not relaxed.
The [test-counter and layout correction](../output/qualification/norito-test-roots-successor-20261023/report.json)
then exposed a private-helper call in the new regression; its public-encoder
successor preserved that failed compiler evidence. The next grouped target
exposed one more obsolete expectation that reserved flags were masked away.
The [current successor run](../output/qualification/norito-reserved-flags-fixture-20261023/report.json)
uses source `dc9ea5c17f68c72447a2dde870d33aa4d101de92b25b321af400c135a5dfc446`.
All 1,419 Norito library, integration and documentation tests now pass, with one
existing ignored test. The caller suites are still running; their completion
and complete source stability remain unqualified until the runner closes.

The [payload lifetime audit](../output/qualification/norito-payload-capability-owner-audit-20261023/review.json)
confirms an existing safe-API defect: address-only payload context and static
slice accessors do not retain the source buffer's lifetime. The replacement must
pass an explicit borrowed payload capability through the original decoder and
derive APIs, make owned archives lend from their owner, and delete the payload
and root pointer TLS, setters and guards together. Compile-fail lifetime cases,
nested decoding, compressed ownership and reached caller migration are required;
the current passing codec tests do not qualify that replacement.
The [primitive decoder migration](../output/qualification/norito-primitives-payload-capability-20261023/review-candidate.json)
now stages nine original files with explicit borrowed cursors. It removes Json's
owned retry and numeric alignment dispatch, retains typed decoder failures,
admits SmallVec storage fallibly, and reuses already admitted collection buffers.
All 241 original test selectors are accounted for, including four explicit
replacement tests for retired APIs or behavior, with five additional regressions.
The [payload-boundary tests](../output/qualification/norito-payload-boundary-tests-owner-20261023/review-candidate.json)
replace raw-marker context assertions with bounded borrowed storage, every
truncated string prefix, misaligned zero-copy decoding and independent cursors.
Both leaves are source-only; installation requires the complete Core, derive,
manual decoder and caller composition, including field-size and nesting checks
at the original slice field decoder boundary.

The [InstructionBox removal](../output/qualification/instruction-box-owned-decoder-retirement-20261023/review-candidate.json)
is source-reviewed but not installed. It uses one canonical borrowed pair parser,
preserves actual errors, rejects outer tails before inner decoding, and removes
the production `InvalidInstruction` sentinel and its executor. The review caught
stale registry counts and identity digests; the
[golden successor](../output/qualification/instruction-registry-retirement-goldens-20261023/review-candidate.json)
derives the corrected values from the original inventory, removing exactly one
assignment. Retired frames remain rejection fixtures. A
[reviewed allocation successor](../output/qualification/instruction-registry-owned-box-20261023/review-candidate.json)
replaces the final unchecked box in both registered decoder routes with the
existing fallible allocation owner and exact-budget refusal tests. That change
is staged, not runtime-qualified. Outward JSON/SDK/FFI error propagation remains
separate mandatory work.

The [signing-directory successor](../output/qualification/core-drain-directory-durability-successor-20261023/review-candidate.json)
fixes another source-reviewed durability gap: reopening a visible directory must
repeat synchronization of its resolved ancestry after an uncertain creation.
Its failure-injection regressions also exercise a visible renamed record after
directory fsync fails. This successor is not installed or runtime-qualified;
the complete State, consensus and signing caller composition is still required.

The [WHIR commitment source review](../output/qualification/whir-commitment-independent-review-20261023/review.json)
found no new blocking issue in the frozen original commitment owner, its 12
retained tests and five added regressions. It checks actual allocation causes,
caller-owned parallel row buffers, pre-allocation opening validation and complete
terminal error propagation. Fourteen upper caller files still require migration;
the packet is not standalone installable. Authentication of commitment leaves
does not establish degree, proximity, hiding or the full proof security target.

The completed lower-boundary validation is recorded in the
[current binding and layout run](../output/qualification/jvm-layout-fixture-feedback-20261023/report.json).
The source remained
`f7434b9fddcd330d24dc2f05bc24d504a8c2a96a497fc7a8ae3cfd170c569c2a`
through the JVM and full Model tests and codec-retirement guard. All children
exited and were reaped. Proof/Core consumer migration and release gates remain open.
The subsequent [Model drain producer run](../output/qualification/model-drain-producer-integration-20261023/report.json)
installs source
`3455df1b27d0c0681ee835c10578b4e39b3dd49aef5cb40efe92f62659e792ce`.
Its interrupted child has no observed exit status; the original report is retained.
The separate [check-only recovery](../output/qualification/model-drain-check-recovery-20261023/report.json)
passed all 21 focused merge tests and the codec-retirement guard on that exact
unchanged source. All recovery children exited and were reaped; this does not
retroactively establish the interrupted child's result. The three original drain hash/signing
methods now return actual codec failures; hashes stream the canonical frame,
and the signing preimage uses one checked destination. Their old infallible
methods are removed. Core/Node/integration callers still require migration.
The [one-file Model lifecycle replacement](../output/qualification/model-lifecycle-integration-20261023/manifest.json)
is installed. Its first compiled run passed 59 tests and exposed one original
codec dispatch failure. The replacement removes unchecked
buffer-based commitment hashing and temporary validation collections, retains
actual encoding/allocation failures, and charges exposed vector capacity.
The [source review](../output/qualification/model-lifecycle-hash-root-review-20261023/review.json)
identified and corrected strict lane-ID ordering and excess-capacity accounting
before installation. The full outward Core/HTTP lifecycle graph remains pending.

The [original Norito dispatch correction](../output/qualification/norito-layout-dispatch-feedback-20261023/manifest.json)
validates effective layout flags before payload dispatch or destination writes.
Its new regression then exposed the original raw flag setter silently discarding
unsupported bits: 557 tests passed, one failed, one was ignored. The
[raw-flag successor](../output/qualification/norito-raw-layout-flags-feedback-20261023/manifest.json)
deletes that normalization and retains the original invalid-layout assertions.
On source `92f26bd5b50ca2b2614fa11119749abd8bbba525a156079c58ab3b4a8881d900`,
all 558 Norito library tests passed (one ignored),
all 60 selected Model tests pass, and the grouped lifecycle fixture passes.
The [completed source-bound run](../output/qualification/norito-raw-layout-flags-feedback-20261023/report.json)
also passed the Config library check; every child exited and was reaped, with
source unchanged throughout. The [full Model regression](../output/qualification/norito-layout-full-model-regression-20261023/report.json)
then passed 3,834 tests, failed two and ignored eight. Both failures came from
multisig tests using unsupported `0x1b`/`0x3f` layouts as valid cases, relying on
the deleted normalization. Their positive matrices now use the actual supported
`0x26`/`0x27` layouts. A new regression rejects all 246 invalid bytes while
checking canonical encoding and outer-context restoration.
The [14-file composition](../output/qualification/norito-binding-model-layout-integration-20261023/manifest.json)
also installs Python/Java/Kotlin constructor, integer-range and codec-context
alignment. Its first compile stopped at three calls to a crate-private helper
in the new Model test. The [test-only correction](../output/qualification/model-layout-test-api-feedback-20261023/manifest.json)
uses the existing public buffer serializer and checks destination preservation.
The machine's Node/Python/JDK paths advanced between runs; the
[tool baseline successor](../output/qualification/model-layout-binding-tools-successor-20261023/tool-environment.json)
records their current identities, while Rust, the Cargo wrapper, and the warm
target remain unchanged. On source `3da11270bbbd7f6fcb4b1e10f80c6910bb8a6385ac7c726f200b960cc86ae665`,
all seven focused Model tests and all ten Python tests passed. The first JVM
run found one original Java-consumer guard test accepting reserved flag `0x12`.
Its [test correction](../output/qualification/jvm-layout-fixture-feedback-20261023/manifest.json)
requires rejection and retains the original success/restoration assertions using
valid flags. The completed successor passed all 73 JVM Norito tests, all 3,837
Model library tests (eight ignored), and the codec-retirement guard. These
results do not qualify the staged Core/proof caller graph.

The preceding [certificate corpus and lower-boundary run](../output/qualification/certificate-corpus-consumer-successor-20261023/report.json)
passed 221 browser certificate tests, eight Model streaming roundtrip tests,
21 ToriiShared quote tests, 11 Config consensus-policy tests, the Config library
check, codec-retirement guard, and historical archive check on unchanged source
`988c3f077d0ff9eabe6fcad97da30414084546b0e781c65a60c4f89dfe4c99a2`.
All children exited and were reaped. The fresh native certificate export changes
only malformed-case disposition metadata and provenance; every positive fixture
and binary artifact remains unchanged. Actual native allocation refusal is an
operational abort, while the same valid public bytes still decode in the browser.

The [six-file lane/fixture composition](../output/qualification/model-runtime-projection-integration-20261023/manifest.json)
removes the derived borrowed-field wrapper that changed packed field classification,
uses explicit projection purpose, and refreshes only the four game-event records
for the current 48-byte dispute commitment. Its
[completed check](../output/qualification/model-runtime-projection-integration-20261023/report.json)
reached five obsolete ToriiShared quote API callers through Config and exited 101;
all children were reaped on unchanged source
`323147a6129ef6b8048509816f3d8157bde74b476efaf6ded74376d4e1caef2b`.
No runtime tests ran in that attempt.

The [next 27-file lower composition](../output/qualification/model-certificate-signature-integration-20261023/manifest.json)
is installed. Its [completed compilation attempt](../output/qualification/model-certificate-signature-integration-20261023/report.json)
found three denied missing-`Copy` lints on pure fixed-payload verdict enums; no tests ran,
all children were reaped, and source remained `a26d80fbedcfd5df47a0d9be460809c3794e8be0f88492f9ae9517f16f671bf5`.
The [three exact derive corrections](../output/qualification/model-pure-verdict-compiler-feedback-20261023/manifest.json)
are installed. Their [completed attempt](../output/qualification/model-pure-verdict-compiler-feedback-20261023/report.json)
compiled production Model, then found seven test-harness diagnostics on unchanged
source `cb47499eb18fb11edb2fc97dd39fb9c4be7d601daf3dd7c52c57fc36f861d95b`; all children were reaped.
The [three-file original test correction](../output/qualification/model-test-owner-compiler-feedback-20261023/manifest.json)
qualifies the Norito JSON error path, uses coercion instead of denied trivial casts,
supplies the metadata projection purpose, and retains the actual signature parser
error through the generic budget scope. All existing assertions remain. The
[completed full Model run](../output/qualification/model-test-owner-compiler-feedback-20261023/report.json)
passed 3,827 tests, failed one exporter assertion, and ignored eight tests on
source `527adf1427aff837e4131cffa3ed37af17dce7d129a43711cad7ece158b17e62`.
The [original exporter correction](../output/qualification/certificate-export-budget-feedback-20261023/report.json)
then passed that regression, the explicit create-only export, and six external
JSON-key tests on source `2c246ccaaa1b53a84f2fae7449fc655ce3af6d35b34388cea8e042d5a8e2b502`.
Its next command named an unregistered standalone test target and ran no tests;
the correct grouped streaming target passed in the subsequent lower run above.
Operational error owners gain no compatibility traits. The composition removes the coarse certificate
error and both redundant signature-parsing helpers, preserves actual computed failures,
replaces ticket Merkle heap buffers with a fixed array, and migrates the original
quote callers. Its [source review](../output/qualification/model-certificate-signature-integration-20261023/review.json)
includes the root-found certificate capacity-accounting correction: requested bytes
are admitted before reservation and exposed excess capacity before publication.
This is not an allocator RSS or peak-memory guarantee. The original malformed-input
and signature assertions remain, alongside actual budget/depth refusal controls.
Core, HTTP and relay consumers remain staged; no complete graph or release pass is claimed.
The [independent fixture and projection review](../output/qualification/model-runtime-queue-independent-review-20261023/review.json)
rechecked the retained runtime capture and all original assertions without finding
an additional defect in that bounded change.

The [foundational lower composition](../output/qualification/foundational-lower-composition-closure-20261023/manifest.json)
and original compiler/test corrections are installed. The
[earlier completed run](../output/qualification/foundational-model-versioned-feedback-20261023/report.json)
passed 29 Versioned tests, then failed Model/ABI compilation on unchanged source
`6752d72aa5dced342adee4f15e7ebd8fe581c799b2ec2541b23cb57150ecc185`;
all children exited and were reaped. The [bounded counting and exact allocation replacement](../output/qualification/bounded-counter-allocation-integration-20261023/manifest.json)
first failed compilation on three unchanged test constructor calls. Their
[original fixture correction](../output/qualification/bounded-counter-fixture-feedback-20261023/report.json)
passed 557 Norito tests (one ignored) and all 29 Versioned tests on source
`d42cd1fa50d859ee772bf1da274be5267544c7bcc69e427c4b0baf3da53fcd57`;
all children exited and were reaped with unchanged source. The current source
adds the [12-file Model correction](../output/qualification/model-original-owner-integration-20261023/manifest.json),
[original predicate cleanup](../output/qualification/model-predicate-compiler-feedback-20261023/manifest.json)
and [ABI quantity/allocation correction](../output/qualification/abi-original-owner-feedback-20261023/manifest.json).
On source `a1f85ee2739207f70c3f1facbf489308d0f0b339e90af7b4352c17ac19cb5fc7`,
[Model/ABI library checks and all 188 ABI library tests passed](../output/qualification/abi-original-owner-feedback-20261023/report.json);
the Model harness then failed on 48 original test callers. All children exited
and were reaped on unchanged source. The [37-file test correction](../output/qualification/model-owned-error-fixture-feedback-20261023/manifest.json)
retains all 750 original lexical test selectors and changes 42 below-limit JSON
assertions to exact variant matches, replaces the private key-error constructor
with the actual producer, and removes two obsolete duplicate unwraps. No owned-error
compatibility traits or aliases are added. Its [Model validation](../output/qualification/model-owned-error-fixture-feedback-20261023/report.json)
finished with the harness compiling and 3,803 Model library tests passing, seven failing
and eight ignored. All children exited and were reaped with unchanged source. The
failures cover two lane-projection layouts, one stale game-event capture, one
certificate allocation-scope fixture and three predicate/account expectations.
Their corrections are included in the current lower run; full Model, IVM and Core qualification
remains open. The earlier Display successor's 550 Norito and 24 display checks
belong to code source
`6fc0744033c154ca66c41d0e2dc00e8861806fa8c89ee0912a900893718400cc`,
before the [Native status/history update](../output/qualification/native-lower-owner-status-20261023/report.json)
and later changes.
The [149-file fallible projection repair](../output/qualification/fallible-projection-integration-20261018/installation.json)
replaces obsolete error-converting APIs and migrates their consumers together.
Its [independent composition review](../output/qualification/fallible-projection-integration-20261018/successor-validation-review.json)
checks all 523 source guards and exact overlap ancestry; 36 runner controls pass.
The [native validation](../output/qualification/fallible-projection-integration-20261018/run-1/report.json)
failed with all eight child commands closed and reaped. Seven Cargo checks stopped
at the same multiline `displaydoc` variant comment; no Core test ran. The formal
checker separately reported 77 distinct failures. A reviewed correction preserves
all 295 Core obligations and adds six recovery cases. Formal failures remain failed
gates even when subsequent compiler and Core tests provide useful feedback.
The [four-file correction](../output/qualification/fallible-projection-feedback-20261018/installation.json)
is now installed; its [fresh validation](../output/qualification/fallible-projection-feedback-20261018/run-1/report.json)
failed against unchanged source. Both child commands closed and were reaped:
formal exited 1, native compilation exited 101 with five errors at three stale
test callers. No Core test ran. Independent review retained all 523 guards,
301 Core selectors, 13 CLI selectors, six external package gates and five focused
interface groups. All 48 controller controls passed. External packages, CLI, SDK
and network checks remain unqualified on this source.

The October 20 successor combines fourteen source changes: compiler caller
repairs and obsolete-code deletion, recovery retry/durability ownership, and
formal bindings for the current compact participant control and authenticated
projection. Its composition retains all prior guards and obligations, now
527 guards and 316 exact Core selectors. The formal mutation suite passes
122 cases; the immutable source runner passes 18 controls. Independent composition
review passed, and all fourteen changes are installed. The
[first validation](../output/qualification/recovery-integration-20261020/run-1/report.json)
closed with both children reaped and unchanged source. The full formal checker
ran inside the verified snapshot and still failed; compilation found eighteen
missing test-scope imports and two stale persistence-phase test callers. Those
three test files are now corrected in the
[installed compiler feedback repair](../output/qualification/recovery-compile-feedback-20261020/installation.json).
Its composition retains 528 guards, 318 Core selectors and all external gates;
the 49 controller and eight formal-closure controls passed twice. Its
[fresh validation](../output/qualification/recovery-compile-feedback-20261020/run-1/report.json)
closed with every child reaped. Aggregate native compilation, Python, Torii tests
and daemon checks passed; three focused checks found stale STARK, benchmark and
fixture-generator callers. Formal qualification still fails. No Core runtime
test ran in that attempt.

The [next thirteen-file integration](../output/qualification/recovery-context-integration-20261020/installation.json)
is installed. It propagates storage-read errors through native signing/context
decisions and updates those original compiler callers. The Torii benchmark now
uses explicit fixture visibility and must check both visible and hidden results
at runtime. Independent review checked all 535 source guards, retained 318 Core
selectors within the new 347, and preserved CLI, SDK, formal and deep-proof
obligations. All 64 controller and eight formal-closure controls passed twice.
Its [fresh native validation](../output/qualification/recovery-context-integration-20261020/run-1/report.json)
passed aggregate native, Python, Core zk-test, Core benchmark/example, and Torii
test compilation. Formal qualification failed. The owner then disappeared during
the Torii benchmark typecheck; the [interruption record](../output/qualification/recovery-context-integration-20261020/interrupted-owner-20261020/reconciliation.json)
pins the retained report and logs and verifies that its recorded processes are
absent. The final command's exit and reaping are unknown. This run is incomplete
and cannot qualify the source.

The broader execution-abort migration is installed for compiler qualification.
The [202-file composition](../output/qualification/execution-abort-composition-20261020/integration-1/report.json)
and [19-file successor](../output/qualification/execution-abort-composition-20261020/integration-2/report.json)
replace the original execution APIs and their consumers without compatibility
wrappers. The first command stopped at an incorrect package selector; the corrected
check found an infallible merge-reference constructor. That constructor now returns
its original serialization error and streams identity and length together once.
The successor's focused `iroha_primitives`, `ivm_abi` and `iroha_data_model` library
check passed. The Core check then stopped at 124 stale IVM callers.
The [14-file IVM repair](../output/qualification/execution-abort-composition-20261020/integration-3/report.json)
is installed. Its focused library check stopped at two callers of the original
state-value decoder; the next coordinated closure repairs that original producer.
Both attempted compiler runs exited and were reaped. Core compilation, runtime
tests and remaining outward consumer closure remain incomplete; a passing
foundational check does not qualify them. The IVM repair also removes the debug
JSON raw-codec fallback, making canonical validation independent of local logging.


The [94-file coordinated closure](../output/qualification/execution-abort-composition-20261020/integration-4/report.json)
is now installed. It replaces mixed string/structural/allocation errors in numeric,
JSON and account codecs; preserves failures through contract returns, fees, witness
preparation, queue status and recovery; and removes obsolete error-erasing APIs.
Independent review corrected a redundant infallible account reformat and retains
post-commit recovery requirements separately from the original abort cause.
Its first library check exited 101 and was reaped after a strict missing-`Copy`
lint. The [two-file compiler correction](../output/qualification/execution-abort-composition-20261020/integration-5/report.json)
adds the derived trait to the now payload-bounded error and deletes the unused
infallible padding helper. Its foundational library check passed; the IVM library check then failed at two
callers of the original Norito-normalization API. Both commands exited and were
reaped on unchanged source. Original normalization and registry callbacks are
being repaired; no new runtime pass is claimed. The audited additive inventory
retains all 123 tests, corrects 29 obsolete harness/module selectors, and requires
listing plus an exact nonignored one-test result. The [focused runtime run](../output/qualification/execution-abort-composition-20261020/lower-runtime-1/report.json)
passed 32 tests: seven Norito, 21 primitive and four crypto cases. Every exact
selector ran one nonignored test; all children exited and were reaped, with
unchanged source. This does not qualify IVM/Core execution or cryptographic soundness. The separate pending-entry predicate still needs
to propagate validation aborts instead of choosing a later candidate. Completed
sidecar retention is process-local; durable restart restoration remains unqualified.
The [model/ABI regression attempt](../output/qualification/execution-abort-composition-20261020/model-abi-runtime-1/report.json)
stopped while compiling the model test harness: a validation-fee test referenced
a private fixture in another module. The compiler exited 101 and was reaped;
zero tests ran and source remained unchanged. Its correction moves the original
test into its fixture-owning module, preserving the assertions and recording the
exact selector change. The [separate ABI build attempt](../output/qualification/execution-abort-composition-20261020/abi-runtime-1/report.json)
also exited 101 before running tests, exposing missing test-scope imports.
The [reviewed 33-file successor](../output/qualification/execution-abort-composition-20261020/closure-composition-5/report.json)
is now installed through [integration-6](../output/qualification/execution-abort-composition-20261020/integration-6/report.json).
It closes original query authentication, normalization, pending selection and
merge-certificate callers, preserves restart-required admission outcomes and
corrects both test-build failures. Its foundational and IVM library checks passed; Core compilation stopped at
82 identical diagnostics from a telemetry macro that still requires the literal
return-type name `Result`. The macro must accept the original typed execution
contract without counting local aborts as deterministic rejections. All children
exited and were reaped and source stayed unchanged; Torii was not reached.
Staged tests and source review are not runtime passes. The additive inventory
retains all 123 baseline obligations and includes 326 exact selectors across
14 harnesses; integration consumer typechecks are separate required gates.

The [13-file first-release successor](../output/qualification/execution-abort-composition-20261020/closure-composition-6/report.json)
is installed through [integration-7](../output/qualification/execution-abort-composition-20261020/integration-7/report.json).
It removes the telemetry macro's nominal return-type allowlist and five obsolete
fixtures. Metrics borrow typed results and exclude already-typed local aborts.
WHIR verification retains the complete private query transcript from decoding,
eliminating duplicate descriptor absorption without changing the proof grammar
or checks. This is a source change, not a measured speedup. The combined native
library check exited 101 and was reaped on unchanged source: the telemetry
allowlist errors are gone, but 200 stale Core callers remain. Torii was not reached.
The additive inventory retains all 326 predecessor tests and now requires 347 exact
tests, 19 harnesses, five consumer typechecks, a three-doctest suite, and two
separate measurement gates.

The [telemetry macro correction](../output/qualification/execution-abort-composition-20261020/macro-diagnostic-feedback-1/report.json)
stops expansion after rejecting an invalid function and refreshes eight observed
line-only diagnostic snapshots. The [clean focused run](../output/qualification/execution-abort-composition-20261020/macro-runtime-4/report.json)
passed default unit/runtime, instrumented unit, three doctest and all eleven
trybuild cases, with unchanged source and every child reaped. This does not
qualify Core. The [reviewed runner successor](../output/qualification/runner-v4-doctest-closure-20261021/root-review.json)
rejects mixed successful/failed/empty doctest summaries; its 35 synthetic controls
pass. The older runner is retained only as failed-audit evidence.
The [executor/permission decoder correction](../output/qualification/model-decode-runtime-20261021/report.json)
is installed. Its original bounded field decoder and permission JSON retain the
actual failure cause. The first test build exposed twelve stale callers; their
[test ownership correction](../output/qualification/model-test-feedback-20261021/report.json)
consumes requests and uses the public signature writer. Ten focused decoder tests
passed; the initial signature selection matched zero tests and was rejected.
The corrected selection passed four and failed two, exposing erased malformed
signature causes. These failures remain recorded.

The [twenty-file Model composition](../output/qualification/model-predicate-composition-20261021/manifest.json)
is installed. Original predicate/selector evaluation and conjunction now return
typed outcomes; owned predicate storage replaces dynamic cloned payloads. The
obsolete infallible query-signing wrapper and serialized local-error variants are
deleted. Typed transaction predicates retain their own atom grammar. The first
two compiler attempts exposed a schema record restriction, an unnecessary cast,
and the original builder's infallible filter contract. The corrections preserve
a typed height record and make the original filter/filter_with methods fallible,
without compatibility adapters. The [third focused run](../output/qualification/model-predicate-composition-20261021/runtime-3/report.json)
passed the Model library check and both signature-admission regressions, then
failed to compile two conjunction test callers. Every child was reaped; no Model
runtime suite ran in that attempt.

The [sixteen-file successor](../output/qualification/model-caller-retirement-composition-20261021/installation.json)
is installed. It deletes duplicate predicate serializers, a private redundant
canonical-text parser, unused error variants and obsolete account-search helpers.
Explicit JSON fixtures retain the removed serializers' unique comparisons.
CLI, executor, Torii and integration callers now consume the original fallible
query builder. The [fresh qualification](../output/qualification/model-caller-retirement-composition-20261021/run-1/report.json)
failed on twelve stale integration-test ownership errors; the command exited
and was reaped without running tests. The [three-file feedback](../output/qualification/model-test-ownership-feedback-20261021/manifest.json)
is installed. It preserves wire identity, signed-context tampering and the exact
zero-allocation assertions without restoring native `Clone` APIs. Its [first
successor run](../output/qualification/model-test-ownership-feedback-20261021/run-1/report.json)
passed six signature tests, then correctly failed a zero-test selector. The
[corrected selection](../output/qualification/model-test-ownership-feedback-20261021/run-2/report.json)
passed 15 signed-query, one builder-ownership and three query-error tests; the
DSL suite passed 50 and failed two stale error assertions. An independently
reviewed [two-assertion correction](../output/qualification/model-typed-error-assertions-20261021/manifest.json)
requires the actual typed parser error for generic JSON and the exact typed-wire
rejection for committed predicates; it changes no production behavior. The
[diagnostic continuation](../output/qualification/model-test-ownership-feedback-20261021/run-3/report.json)
passed 28 JSON, 20 transaction-predicate, one allocation and 11 frame-identity tests,
plus the Model test compilation and SDK/executor library checks. The assertion
correction is installed. Its first run ended without a terminal result; the
[interruption record](../output/qualification/model-typed-error-assertions-20261021/interrupted-owner-20261023/reconciliation.json)
preserves that incomplete evidence. The [fresh corrected suite](../output/qualification/model-typed-error-assertions-20261021/run-2-20261023/report.json)
passed all 52 original DSL tests with no ignored tests, exit zero, a reaped child
and unchanged source. The [scoped retirement guards](../output/qualification/model-typed-error-assertions-20261021/retirement-guard/report.json)
also passed. These cover the retired codec, Native AMX V1, lane handoff and PK2
compatibility paths; they do not establish total obsolete-code removal. Core,
Torii and the complete external-consumer graph remain unqualified.

The [original query-API audit](../output/qualification/query-predicate-abort-audit-20261021/manifest.json)
found JSON materialization, decoder probes and lazy rows erasing local failures.
Core provider/cursor, Kura and host/transport replacements remain output-only.
They preserve indexed planning and abort before partial batches can be published.
The State reader audit found 256 direct calls: original lossy block APIs and their
callers must migrate together. Authenticated snapshot bootstrap must explicitly
identify intentional hash-only storage; it must not treat any read error as an
absent parent. Source candidates and syntax checks do not qualify this closure.
Rejected-row source-work metering, expression construction, payload proof helpers,
canonical writer allocations and fresh shared block ownership remain explicit
obligations. Stable Rust's infallible Arc::new is not qualified by allocation-budget
admission alone. No total allocation-closure or release claim follows from these
partial checks.

The next Torii source slices are sealed for composition, not installed or runtime
qualified: [captured ledger time and readiness](../output/qualification/torii-ledger-time-aborts-20261021/manifest.json),
[typed visibility and paging](../output/qualification/torii-query-visibility-aborts-20261021/manifest.json),
[SNS history](../output/qualification/torii-sns-history-aborts-20261021/manifest.json),
[DA history](../output/qualification/torii-da-history-aborts-20261021/manifest.json),
and [pipeline storage and projection](../output/qualification/torii-pipeline-storage-aborts-20261021/manifest.json).
The pipeline slice deletes source-erasing hash, codec, storage and projection
adapters. Owned failures survive to HTTP classification; missing canonical trigger
history cannot become an empty successful response. Its independent source review
retains 121 exact tests, including four new regressions and one explicit replacement.
This is not a compiler or runtime pass. Its metadata readers still require the
original Kura indexed-reader recovery errors to be repaired before installation.
The [Block/body owner](../output/qualification/block-body-storage-aborts-20261021/manifest.json)
also retains owned storage failures and removes the obsolete recovery-to-abort
fallback. Its 207 exact test obligations remain unrun; Queue and V2 lane-work
consumers must be composed before that change can be installed.
The [routing consumer successor](../output/qualification/torii-queue-read-consumers-20261021/manifest.json)
removes state-taking payload APIs and preserves owned Queue failures through
original result-returning callers. The [Queue transport/reconfiguration consumers](../output/qualification/torii-queue-owned-error-consumers-20261021/manifest.json)
are sealed with 182 exact test obligations, including three new regressions;
installation still depends on the original Queue owner and is not qualified.
The [positive committed-block fixture](../output/qualification/torii-committed-fixture-finality-20261021/manifest.json)
now prepares exact four-validator finality before visible height publication;
its [independent source review](../output/qualification/torii-committed-fixture-finality-independent-review-20261023/review.json)
found no bounded blocker, but its two-height checks remain unrun.
The indexed storage recovery, SoraFS forwarder
source owners and historical lane reconstruction are explicit integration blockers;
source-only packets do not close those gates.

The [provider payload owner](../output/qualification/provider-payload-owned-errors-20261023/manifest.json)
migrates its original trait: an associated concrete builder error replaces the
old abort-only variant. Its [reviewed Node slice is installed](../output/qualification/provider-payload-owned-errors-20261023/node-installation.json).
The [focused native run](../output/qualification/provider-payload-owned-errors-20261023/node-run-1/report.json)
matched all 76 compiled selectors and passed all 76 tests, including the new
actual-source/no-attempt-charge regression, with zero ignored tests. Both
commands exited zero and were reaped against unchanged source `d19fdd51…`.
The later [status/roadmap update](../output/qualification/provider-payload-owned-errors-20261023/status-update/report.json)
changes documentation only. The dependent daemon payload candidate keeps Queue,
history, codec and worker failures distinct from rejection, and uses one captured
State view and its finalized head time for routing and fees. The dependent daemon
ingress implementation is now staged with concrete acceptance, Queue, history
and worker errors; it still requires coherent Queue/State composition. Broader
source, storage and signer failures remain separate obligations.

The [ingress successor](../output/qualification/provider-ingress-owned-errors-20261023/manifest.json)
removes the old preflight-unavailability attempt-charging implementation and
changes the original prepare/expose/observe APIs to retain concrete failures.
Its [four Node files are installed](../output/qualification/provider-ingress-owned-errors-20261023/node-installation.json).
The [focused validation](../output/qualification/provider-ingress-owned-errors-20261023/focused-validation.json)
matched and passed 80 runtime plus 79 outbox tests, with zero ignored tests;
all four commands and the outer runner exited zero and were reaped. The tested
source was unchanged at `f1bb97f4…`; the later status edit changes documentation
only. Tests exercise actual IO and timer failures, unchanged attempt counts,
retained signed bytes and durable ambiguity after exposure. This does not
qualify daemon absence observations or the broader consensus integration.

The [Queue owner](../output/qualification/queue-owned-error-aborts-20261021/manifest.json)
retains 1,562 exact test obligations across 32 files, including four new cases.
Its optional snapshot-success channel is deleted. The [transport contract review](../output/qualification/torii-queue-contract-review-20261023.json)
finds no bounded producer/consumer mismatch, without claiming compilation.
A [publication-atomicity successor](../output/qualification/queue-selection-publication-atomicity-20261023-revision-2/manifest.json)
removes insert-then-rollback handling that could erase a prior owner on conflict.
It checks the full selection before mutation and adds two map-ownership tests;
[independent source review](../output/qualification/queue-selection-publication-atomicity-20261023-revision-2/independent-review.json)
has no bounded blocker; compiler and runtime execution remain open. The SoraFS forwarder's
[direct failure-owner packet](../output/qualification/torii-sorafs-forwarder-owned-errors-20261021/manifest.json)
retains 259 original plus seven new test obligations. Its [finalized-observer
successor](../output/qualification/torii-sorafs-finalized-observers-20261023/manifest.json)
adds four original-reader regressions and removes query-error-to-revocation
handling. A later review caught a moved repair-ticket String that the initial
source review missed. The [ownership correction](../output/qualification/torii-sorafs-observer-ticket-owner-20261023/root-source-review.json)
uses the query's retained ticket identity; all 270 runtime obligations and
coherent dependency compilation remain unrun.

First-release removal is also closing the original indexed-storage readers and
their production/test callers. The candidate separates explicit missing payload
components from actual storage failures, and removes hash-only acceptance of
input/receipt sidecars: a matching block hash cannot authenticate those contents.
Canonical ownership requires the finalized body and exact execution-context
membership. VM work is replacing the erased stored-host API with typed borrowed
execution and mandatory abort ownership, retaining both primary and recovery
failures. These candidates remain uninstalled and uncompiled. Block validation's
owned storage boundary, every original caller, batch rollback, and the full
qualification gates remain open; none is a compatibility path to retain.

The [original external caller candidate](../output/qualification/kura-indexed-external-production-20261023/IN_PROGRESS.json)
now covers 12 files (10 changed), retaining all 671 lexically inventoried test
names. Explicit canonical-publication cleanup keeps unknown commits for recovery
and retains primary plus independent cleanup failures. The
[Core cause producer candidate](../output/qualification/core-owned-execution-causes-20261023/IN_PROGRESS.json)
adds concrete storage/codec/allocation ownership and replaces history/query
cause erasure. Its 34 required selectors include 31 retained originals and
three new ownership tests. Both candidates pass source formatting; the Core
patch also passes exact forward/reverse application. These are source checks,
not compiler or runtime qualification. The initial Core selector inventory
omitted lib.rs tests; its failed record is retained and the inventory corrected.

The [original query consumer migration](../output/qualification/core-owned-query-consumers-20261023/IN_PROGRESS.json)
now replaces the old result arities in 11 original query, cursor and memory
owners. It retains 209 lexically identified original selectors and adds four
regressions. Concrete allocation, layout, policy, codec and column-shape causes
survive; a sink's own typed byte-budget/mismatch stop is distinct from unrelated
I/O after that stop. Terminal cleanup failure evicts consumed cursors while
retaining primary and cleanup causes. Formatting, predecessor pins and exact
forward/reverse patch application pass. Compilation, test execution and the
remaining Data Model/ISI/host/transport caller migration are still required.
The [fresh source observation](../output/qualification/core-owned-query-consumers-20261023/source-state-observation.json)
confirms Native remains unchanged at the source recorded above.

The [indexed storage source candidate](../output/qualification/kura-indexed-recovery-aborts-20261021/review-candidate.json)
freezes 16 original files, preserving 71 prior selector obligations and adding
11 tests in its own indexed-storage test module. Its
[canonical writer successor](../output/qualification/kura-canonical-writer-owner-20261023/review-candidate.json)
also replaces two remaining bool predicates with owned results and authenticated
body membership. The [VM external caller migration](../output/qualification/ivm-owned-abort-contract-20261023/external-callers-review.json)
pins 122 files and preserves 789 original explicit selectors. These are source
snapshots, not installed or runtime-qualified releases. Positive storage tests
must establish genuine finalized block evidence; finalized rollback must remain
rejected. The [complete VM source packet](../output/qualification/ivm-owned-abort-contract-20261023/manifest.json)
is now sealed with 144 changed files, 1,285 retained original explicit selectors
and 12 added selectors. Mandatory owner migration through lower codecs, Data
Model, Core and transport remains incomplete, so this is not an installed or
compiled VM release.

Independent review then [reproduced a terminal-unwind flaw](../output/qualification/vm-terminal-panic-owner-20261023/probe-report.json):
all eight original carrier tests passed, but both new cases failed when a
terminal unwind crossed executors with different generic error owners. The
[successor](../output/qualification/vm-terminal-panic-owner-20261023/review-candidate.json)
deletes the generic payload classifier and uses one nongeneric terminal marker
that owns the original concrete combined cause. Both VM catch sites and the
parallel regression use the new contract. Its [standalone native run](../output/qualification/vm-terminal-panic-owner-20261023/focused-run-1/report.json)
passes all ten exact carrier tests with zero ignored tests, unchanged candidate
source and all twelve child commands closed and reaped. This compiles only the
exact primitives source module, not the full IVM crate. The envelope still
allocates two boxes during unwinding; allocation-safe publication and full
VM integration remain open.

The [autonomous reader successor](../output/qualification/kura-autonomous-read-owner-20261023/review-candidate.json)
replaces original error-erasing Option projections with owned Results, binds
live pointers to their complete target and rejects marker-only namespace resets.
Authenticated retirement and archived namespaces remain distinct from corrupt
live pointers. Eight new regressions remain unrun. The separate
[bounded-index owner](../output/qualification/kura-bound-index-structure-owner-20261023/review-candidate.json)
retains exact malformed-index paths and actual reservation errors; its source
inventory retains 62 original tests and adds three (the preserved prose-count
correction is in that packet). Adjacent index writer ownership and external
caller compilation still require closure.

The [startup and fixture successor](../output/qualification/v2-authenticated-storage-closure-20261023/manifest.json)
removes startup's catch-all storage-to-metadata conversion and deletes a helper
that swallowed fixture store failures. Six fixture callers now authenticate
actual global finality, keeping global committee authority separate from lane
committee authority. Review caught two textual-include callers missed by the
initial inventory; the corrected four-file candidate retains 153 lexical test
selectors. Its retirement fixture now performs the actual geometry replacement
and publication, preserving the high lane-local slot and genuine global finality.
The [final independent review](../output/qualification/kura-owner-independent-review-20261023/v2-final-review.json)
closes the scoped source findings. The [startup corruption regression](../output/qualification/kura-startup-storage-cause-fixture-20261023/manifest.json)
retains 47 original selectors and adds one exact-cause storage test; the
[route-guard fixture](../output/qualification/kura-route-guard-fixture-owner-20261023/manifest.json)
checks precise rejection and unchanged bytes instead of treating any error as
success. These storage candidates have source/patch checks only; runtime and
coordinated integration are still required.

The [sealed autonomous caller candidate](../output/qualification/autonomous-reader-callers-20261023/manifest.json)
migrates 59 original reads across twelve files and retains 287 lexical selectors.
It composes nine existing fixture heads from their exact shared source instead
of overwriting parallel changes. Five negative controls now require the actual
codec, prune-recovery or storage-budget cause; corruption controls retain damaged
bytes and verify a healthy retry after restoration. Formatting and exact patch
roundtrips pass. Review caught a further marker-only overwrite fixture; its
[repair](../output/qualification/autonomous-reader-callers-20261023/marker-fixture-review-followup.json)
keeps that reset as a negative case, authenticates the original canonical carrier
and complete signed lifecycle, then performs real geometry archival before
recreation. The new incarnation has its own bound reservation identities, signed
Live cursor and exact READY certificate before restart. The
[final source review](../output/qualification/kura-owner-independent-review-20261023/autonomous-callers-final-review.json)
closes those fixture findings; compilation and runtime execution remain open.
The [operation-phase owner](../output/qualification/kura-indexed-operation-phase-owner-20261023/review-candidate.json)
replaces recursive storage error wrappers with an explicit phase, path and
original cause. Its [four-file external fixture successor](../output/qualification/kura-indexed-phase-external-fixtures-20261023/manifest.json)
retains 115 original selectors and 353 value assertions while checking the
precise recovery/publication state. The [autonomous validation successor](../output/qualification/kura-autonomous-validation-cause-owner-20261023/review-candidate.json)
preserves the five original lane validation causes instead of replacing them
with invalid-evidence strings. The [root review](../output/qualification/kura-autonomous-validation-root-review-20261023/review.json)
found no additional defect in that wrapper change. Lower lane producers still
erase some operational causes and need their own API migration. Eight related
certified-frontier writer/planner predicates are corrected in the
[sealed four-file source candidate](../output/qualification/kura-certified-frontier-authority-owner-20261023/manifest.json):
failure to authenticate an occupied namespace cannot grant repair, overwrite,
capacity-release or retirement permission. The
[root review](../output/qualification/kura-certified-frontier-root-review-20261023/review.json)
retains 47 original selectors and three new cases. These changes remain staged;
no integrated storage or four-validator runtime pass is claimed.

The lower JSON/DSL owner is now being repaired at its original codec boundary.
A shared concrete cause must survive binary, JSON and bounded
writer APIs; execution failures must not be converted back into deterministic
JSON rejection. The original decode traits and their callers change together,
without compatibility aliases. The independent [bounded query sink review](../output/qualification/core-owned-query-consumers-independent-review-20261023/review.json)
found no source-level blocker in its two-file scope; it does not qualify this
remaining lower-owner migration or full query execution.
The consuming builder and typed transaction-predicate constructor now return
failures instead of silently replacing invalid predicates with `Const(false)`.
Empty membership sets remain present for schema rejection. The
[Core integration review](../output/qualification/core-query-owned-api-root-review-20261023/review.json)
caught two budget fixtures relying on that removed fallback. Their
[reviewed successor](../output/qualification/core-query-owned-api-root-review-20261023/fixture-successor-review.json)
uses an explicit valid false predicate, preserves every original budget and
projection assertion, and separately checks malformed-builder rejection. These
changes are staged source; no integrated test pass is claimed.
The [sealed thirty-file lower producer](../output/qualification/data-model-owned-query-causes-20261023/manifest.json)
retains 636 original lexical selectors and adds ten. Only its self-contained
Norito portion and five external Norito test files are installed in the
[twenty-file codec integration](../output/qualification/norito-owned-causes-integration-20261023/report.json).
The initial twenty-file library check failed at two original base64 consumers
that assumed copyable sink errors. Its failed evidence remains intact.
The [six-file base64 and scratch integration](../output/qualification/norito-base64-owned-errors-20261023/report.json)
now passes both the JSON and supported minimal `base-codec` library checks.
The latter includes JSON; it is not a JSON-free build. Its test compilation
found two stale equality assertions. Their
[two-file successor](../output/qualification/norito-owned-error-test-assertions-20261023/report.json)
uses exact error-variant matching and passes all 24 selected native tests:
eleven base64, six scratch, five field encoding, one validated JSON and one
signature JSON test. All child processes exited and were reaped, and source
identity remained unchanged during those checks. The [broader Norito regression](../output/qualification/norito-owned-causes-regression-20261023/report.json)
passes 511 library tests (one ignored), all 65 tests in the five changed external
selections, and the retired-codec dependency guard. Source identity stayed fixed
and all child commands exited and were reaped. Downstream crate qualification
remains open.

The base64 bridge consumes its stored failure, stops all subsequent writes,
and retains both an independent encoder failure and any earlier sink failure.
A private instance-bound typed I/O marker distinguishes its own propagated stop
from another bridge's failure without comparing text. Direct byte encoding
uses the typed sink without that I/O bridge. The
[independent source review](../output/qualification/norito-base64-independent-source-review-20261023/review.json)
found no additional blocking defect in that bounded delta. A boxed aggregate
breaks the recursive type layout while preserving actual nested failures;
this does not establish bounded error-path allocation or arbitrary nested-error
memory safety. Those remain release qualification obligations. Exact, counting
and fixed-capacity binary writers have the same independent-error retention
problem and are being corrected at their original owners.

The [encoding scratch successor](../output/qualification/norito-encoding-scratch-budget-20261023/review-candidate.json)
is installed and its six new native tests pass. Five temporary-buffer owners
now charge their complete checked allocation, and two redundant hash-table
calculations are deleted. Review caught an unstable heap sort that reordered
equal-priority values with different payload bytes; indexed references currently
retain tie order without hidden sorting storage. A separate remaining canonicality
issue is insertion-dependent encoding for equal-priority values with distinct
payload bytes; preserving that behavior is not a first-release design guarantee.
The tests cover budget refusal, overflow, actual reservation failure,
empty/zero-sized storage, all five original owners, iterator count and tied payloads.
The [ten-file Primitives/Crypto integration](../output/qualification/primitives-crypto-owned-causes-integration-20261023/report.json)
was installed and failed the primitives check at the original literal parser's
removed blanket binary-to-JSON conversion. The failed source and logs remain
retained. The [fifteen-file original-owner successor](../output/qualification/codec-original-owner-successors-integration-20261023/report.json)
replaces that parser's broad error with an allocation-free domain error, deletes
`parse_without_diagnostics`, and migrates both callers. Canonical checksums now
reject the previously accepted `+17D` spelling; `017D` remains valid. Exact,
counting and fixed-capacity writers share one typed stop owner and preserve both
an earlier writer stop and an independent serializer failure. Numeric encoding's
computed-length mismatch remains an operational invariant through the ABI.
Both fixed-size JSON construction paths now classify the same protocol ceiling
consistently while retaining actual local budget failures. The independent
[composition review](../output/qualification/codec-original-owner-successors-kura-review-20261023/review.json)
verified all 15 source parents and the single `lib.rs` overlap. Norito
JSON/minimal library checks and 523 library tests passed (one ignored) on that
recorded source. Subsequent test callers now assert the concrete literal and
bounded JSON causes. The
[Primitives library run](../output/qualification/codec-domain-test-callers-20261023/report.json)
passed all 314 tests; Crypto test compilation then found two retired allocation
error fixtures. The [test correction and Crypto run](../output/qualification/crypto-hash-owned-budget-test-20261023/report.json)
exercise actual allocation-budget refusal and a healthy retry. The full Crypto
library suite passed 1,412 tests, with three ignored; every child exited and was
reaped, and the tested source stayed unchanged. This does not qualify the proof
system or any outward consumer. The
[reviewed six-file comparison candidate](../output/qualification/norito-comparison-encoding-closure-20261023/manifest.json)
deletes the old writer observers and consumes the comparison together with its
serialization result, retaining both computed failure and independently observed
byte mismatch. Its 84 original selectors and seven regressions are included in
the installed comparison/disposition composition below. Broader error-memory bounds and downstream
classification remain open.

The [combined comparison and disposition candidate](../output/qualification/norito-comparison-disposition-integration-20261023/review-candidate.json)
adds one exhaustive operational-failure classifier to each original Norito error
owner. Core and ABI consumers use those classifiers instead of maintaining
duplicate variant tables; resource retry policy remains a separate decision.
Its [independent review](../output/qualification/comparison-conststr-independent-review-20261023/review.json)
also checks the three-file retained-string correction: `ConstString` now returns
its actual native allocation failure directly, removing the artificial binary
decoding stage from Name and StatePath JSON. The
[comparison/disposition run](../output/qualification/norito-comparison-disposition-integration-20261023/report.json)
passed both Norito library configurations, 532 library tests (one ignored), seven
exact-slice tests, 37 Crypto hash tests, 75 Merkle tests, the Primitives JSON check
and the retired-codec guard. Source stayed unchanged and all children were reaped.

The [Model owner replacement](../output/qualification/model-owned-codec-causes-20261023/review-candidate.json)
and [Core consumer](../output/qualification/core-model-owned-abort-consumer-20261023/review-candidate.json)
retain actual causes through fee, Hijiri and Parliament computations, replacing
the former copied error summaries. Their
[independent review](../output/qualification/model-owned-causes-independent-review-20261023/review.json)
found no additional scoped defect; complete outward consumer migration and
runtime validation remain required. The
[seven-file Model leaf candidate](../output/qualification/model-leaf-native-causes-20261023/review-candidate.json)
preserves 149 original selectors and adds a real allocation-budget regression.
The [peer/address candidate](../output/qualification/peer-address-original-owner-20261023/review-candidate.json)
removes binary-codec errors from text address parsing. Only malformed addresses
permit a literal-parser fallback; local failures retain their actual cause.
Model leaf qualification remains pending. The literal composition below installs
the original address/peer changes but does not qualify Model consumers.

The [canonical contract-address replacement](../output/qualification/contract-address-owned-canonical-20261023/review-candidate.json)
deletes the alternate-checksum parser, intermediate payload/preimage buffers and
erased deployer/encoder errors. Only canonical Bech32m text with zero padding is
accepted. Fixed stack buffers and incremental hashing preserve the existing
derivation bytes; actual retained storage is admitted fallibly. It preserves 43
original selectors and adds three. Its
[independent review](../output/qualification/contract-address-tle-kura-review-20261023/review.json)
found no additional bounded source defect. This remains source-only; the original
infallible subject constructor and its caller graph are required follow-up work.

The [computed-value cause](../output/qualification/norito-computed-value-cause-owner-20261023/review-candidate.json)
retains the actual external encoding error. Its
[independent review](../output/qualification/norito-computed-value-independent-review-20261023/review.json)
checks source identity and nonresource classification. The implementation still
allocates to retain that source; arbitrary error nesting and allocation-safe
failure publication remain unqualified. Original account/key producers and
bounded JSON sink completion have reviewed source replacements awaiting integration.
The [seven-path lower-codec composition](../output/qualification/norito-bounded-value-integration-20261023/review-candidate.json)
deletes the original writer-stop module and uses one shared stop identity. Both
bounded JSON passes retain the first sink failure and any independently returned
serializer error. It retains 88 original selectors and adds 11. Its
[independent review](../output/qualification/norito-bounded-value-kura-review-20261023/review.json)
also checks the one-shot installer. Its
[first installed run](../output/qualification/norito-bounded-value-integration-20261023/report.json)
passed both library checks, then failed one of 543 tests because two original
codec probes shared a process-wide serialization-panic flag. The
[reviewed original test correction](../output/qualification/norito-recompute-probe-queue-review-20261023/review.json)
replaces that shared flag with thread-local state and scoped restoration, retaining
both original value/consumption assertions and adding a concurrent/unwind control.
The [successor run](../output/qualification/norito-recompute-probe-isolation-20261023/report.json)
passed 544 Norito tests (one ignored), seven exact-slice tests, all 314 Primitives
tests, the Crypto JSON check and retired-codec guard. Every child was reaped and
source stayed unchanged. The failed run remains recorded separately.

The [Display cause successor](../output/qualification/norito-display-observation-owner-20261023/review-candidate.json)
removes the formatter-error discard and the false `Unsupported` classification.
It retains the actual formatting result and first visitor failure without
assuming they are independent. Consuming completion substitutes only its own
opaque stop marker with the original sink cause. All 115 original selectors
remain, with six additions. [Root source review](../output/qualification/display-versioned-root-review-20261023/review.json)
found no additional bounded defect; the
[successor installer](../output/qualification/norito-display-probe-successor-20261023/prepared.json)
requires the corrected exact predecessor. Its
[installed run](../output/qualification/norito-display-probe-successor-20261023/report.json)
passed both Norito library configurations, 550 library tests (one ignored), 24
external formatting tests, Primitives/Crypto JSON checks and the retired-codec
guard. Every child exited and was reaped on unchanged source. Core/IVM exhaustive
observers and Model compilation remain required.

The [five-file literal composition](../output/qualification/literal-owned-causes-integration-20261023/review-candidate.json)
and its [independent installer review](../output/qualification/literal-integration-kura-review-20261023/review.json)
preserve actual ConstString, address and peer causes, with 81 original selectors
and one addition. The [installed successor run](../output/qualification/literal-owned-causes-probe-successor-20261023/report.json)
passed Primitives JSON compilation and all 315 library tests, the Crypto
JSON check and the retired-codec guard, with unchanged source and every child
reaped. Model consumers remain unqualified.

The [operational promotion helper](../output/qualification/primitive-operational-promotion-owner-20261023/review-candidate.json)
preserves terminal failed recovery while moving both primary and cleanup causes.
Its [standalone native validation](../output/qualification/primitive-operational-promotion-owner-20261023/focused-run-1/report.json)
passed all 14 exact tests with unchanged candidate bytes and every child reaped.
This checks the self-contained Primitives module, not the integrated VM/Core graph.
The [Account/PublicKey composition](../output/qualification/account-public-key-owned-admission-closure-20261023/manifest.json)
removes the duplicate canonical parser and coarse native-error projections,
retaining 235 original tests and adding five. A separate
[I105 scratch allocation correction](../output/qualification/i105-exact-scratch-admission-owner-20261023/review-candidate.json)
charges the actual validated layout before allocation and adds budget/retry
coverage. These Account changes have not run in Native.
The [root Account/I105 review](../output/qualification/account-admission-root-review-20261023/review.json)
checks the complete changed ownership and allocation path; it is source evidence.

The [Versioned producer](../output/qualification/versioned-owned-codec-causes-20261023/review-candidate.json)
and [computed-stage correction](../output/qualification/versioned-computed-owner-successor-20261023/review-candidate.json)
replace string/unit codec errors with actual owned causes. Both canonical Block
re-encoding paths retain their computed-stage error, and unsupported-version
retention is fallible. [Independent review](../output/qualification/versioned-owned-causes-kura-review-20261023/review.json)
found no additional scoped source blocker. The
[fallible encoder replacement](../output/qualification/versioned-fallible-encoder-owner-20261023/review-candidate.json)
deletes five duplicate encoder bodies and the unchecked JSON intermediate-map
helper. One checked encoder admits the version prefix and complete payload,
uses fixed flags and retains exact writer failures. It preserves 198 original
selectors and adds five. [Root source review](../output/qualification/display-versioned-root-review-20261023/review.json)
is complete; the original external caller graph and runtime validation remain open.

The [Torii operation and quote candidate](../output/qualification/torii-owned-execution-quote-consumer-20261023/review-candidate.json)
replaces its bare Core abort carrier with the complete execution failure. A
failed cleanup remains terminal through HTTP response retention; its original
diagnostic or operational primary and cleanup cause both survive. Quote routes
move actual Model causes instead of copying a generic abort summary. All 199
original selectors remain, with three additional controls. This is source-only;
[independent review](../output/qualification/torii-operation-owner-kura-review-20261023/review.json)
found two adjacent defects in the old storage branch: a phase-blind retry decision
and a response path that discarded the actual cause. The
[four-file successor](../output/qualification/torii-storage-owner-retirement-20261023/review-candidate.json)
deletes that Torii variant and moves storage failures through the existing Core
phase policy and complete execution carrier. It retains all 263 direct-file
selectors and adds two real budget/phase/failed-cleanup controls.
[Independent source review](../output/qualification/torii-storage-retirement-kura-review-20261023/review.json)
closes both findings; integrated runtime qualification remains pending.

The [six-file Core fee replacement](../output/qualification/core-validation-fee-owned-causes-20261023/manifest.json)
preserves actual VM, codec and Model failures, including failed cleanup. It
migrates the original fee fixtures without replacing typed assertions with text
comparisons, retaining 106 selectors and adding six. Its outward State/VM host
callers still require migration. The replacement design gives state an explicit
open/terminated execution capability and returns the original failure to its
caller; state must not copy the cause or reopen already failed recovery.
The [finite Core capability checkpoint](../output/qualification/core-terminal-capability-owner-20261023/review-candidate.json)
and its [independent source review](../output/qualification/core-terminal-capability-root-review-20261023/review.json)
retain actual validation, transaction, snapshot and existing diagnostic owners.
Original State/Block/Merge migration found a deeper defect: a pristine stage
could wrap a whole failed-recovery carrier inside a deterministic verdict. Those
original entrypoints are being split into pure verdicts plus the complete
execution result, with explicit capability revocation. Their caller closure,
concrete type layouts and runtime behavior are not qualified yet.
The [State lifecycle capability candidate](../output/qualification/state-lifecycle-capability-owner-20261023/review-candidate.json)
retains permission under the original mutex, revokes it after uncertain mutation
or failed restoration, and preserves it across replay-image installation.
[Root review](../output/qualification/state-lifecycle-capability-root-review-20261023/review.json)
found an unrelated incorrect telemetry error pattern; the
[exact successor](../output/qualification/state-lifecycle-capability-telemetry-successor-20261023/review-candidate.json)
restores the original JSON error match. The
[Queue admission candidate](../output/qualification/queue-lifecycle-admission-owner-20261023/review-candidate.json)
migrates thirteen original guard acquisitions, moves expiry reclamation behind
admission, removes the Torii operational-failure bypass, and preserves actual
Queue failures through five SoraFS boundaries and typed HTTP ownership.
[Finite outward review](../output/qualification/queue-lifecycle-outward-root-review-20261023/review.json)
does not close original journal replay, moderation, raw relay/replay guards,
durability, or the full Core/Torii compiler/runtime graph. These candidates are
not installed or release-qualified.
The [Versioned outward replacement](../output/qualification/versioned-outward-owned-causes-20261023/review-candidate.json)
retains 224 original selectors and adds four; its
[independent review](../output/qualification/versioned-outward-kura-review-20261023/review.json)
found no additional scoped source blocker. The
[game export replacement](../output/qualification/game-bundle-outward-owned-causes-20261023/review-candidate.json)
retains actual replay/settlement failures through HTTP, preserving 20 original
selectors and adding six. Its [independent review](../output/qualification/game-bundle-outward-kura-review-20261023/review.json)
found a lower transport producer that still discards codec and I/O causes. The
[eight-file transport replacement](../output/qualification/game-transport-owned-causes-20261023/review-candidate.json)
retains original received codec verdicts, computed encoding failures and actual
writer errors. Composite failures cannot become a sole deadline or size response.
It preserves 46 original selectors and adds four. Its
[independent review](../output/qualification/game-transport-queue-review-20261023/review.json)
found no additional finite-source blocker; native integration remains pending. Other bundle/proof producers still erase lower causes,
so this finite replacement does not qualify the complete export path.

The [committed casting-snapshot replacement](../output/qualification/tle-casting-owned-snapshot-20261023/review-candidate.json)
deletes the copied abort adapter and retains Model, native and authorization
causes in a complete execution carrier. Binding collection now uses bounded,
admitted fallible growth and an in-place canonical sort. It preserves 122
original selectors and adds two. The
[independent review](../output/qualification/contract-address-tle-kura-review-20261023/review.json)
checks the pure `Infallible` verdict and complete terminal failure promotion;
State/Core caller integration and native
validation remain pending. Lower authorization producers with collapsed
domain errors are separately recorded as unfinished work.

The [foundational composition proposal](../output/qualification/foundational-lower-composition-plan-20261023/report.json)
checks exact source ancestry for the next Model/Versioned library and test boundary.
It records eight remaining original owners; this proposal is not an installation
or a compile result. The [three-file ABI/allocation correction](../output/qualification/model-abi-allocation-owner-20261023/review-candidate.json)
retains actual reservation failures, admits the schema field table before allocation,
and migrates original exact-budget assertions. Existing string-prefix admission
already charges text bytes and is retained once. It preserves 37 selectors and
adds two; other state-value writer and traversal allocations remain open.

The [completed composition](../output/qualification/foundational-lower-composition-closure-20261023/manifest.json)
resolved those eight owners and installed 60 changed leaves from 78 exact pins;
18 leaves were retained. Its [first run](../output/qualification/foundational-lower-integration-20261023/report.json)
passed three Norito projection tests, then stopped on two denied fixture casts.
The [original coercion correction](../output/qualification/foundational-lower-feedback-20261023/report.json)
passed 327 Primitives and 140 public-key tests, then exposed a retired Versioned
error variant in a fixture. Its [wire-fixture successor](../output/qualification/foundational-lower-wire-feedback-20261023/report.json)
passed 16 Versioned library and five wire tests but failed one derive test that
compared errors from different serialization paths. The
[checked-writer fixture correction](../output/qualification/versioned-derive-checked-json-fixture-20261023/review-candidate.json)
retains the actual computed source and adds a separate unchecked-writer rejection
control. The [next run](../output/qualification/foundational-model-versioned-feedback-20261023/report.json)
passed all 29 Versioned tests. Model/ABI compilation then found original
account/domain conversions and signature callers that still assume old error
contracts. All these completed runs exited, were reaped and retained unchanged
source during each command. Those earlier attempts did not reach Model/ABI runtime tests;
the later ABI result is recorded below.

The [seven-file compiler correction](../output/qualification/model-original-compiler-feedback-20261023/manifest.json)
removes the obsolete domain resource conversion, gives the shared label constructor
an exhaustive owned error, borrows the multisig fixture error and specifies the
checked JSON sink type. Its [independent review](../output/qualification/model-original-compiler-feedback-independent-review-20261023/review.json)
found no additional scoped blocker. It is now installed with the
[original signature-consumer correction](../output/qualification/model-borrowed-signature-validation-20261023/review-candidate.json),
which deletes redundant retained copies and uses the exact existing borrowed
validator before verifying the original signature. Root
[signature review](../output/qualification/model-original-owner-integration-20261023/signature-root-review.json)
confirmed identical validation stages and retained original error arms; runtime
qualification is in progress.

The initial [ABI writer replacement](../output/qualification/state-value-bounded-payload-owner-20261023/review-candidate.json)
failed [root source review](../output/qualification/state-value-payload-root-review-20261023/review.json):
its unbounded count could traverse an oversized record before checking the cap.
The [corrective successor](../output/qualification/state-value-bounded-count-successor-20261023/review-candidate.json)
uses the original counter's optional byte ceiling for real and measured output,
retains a sticky stop through flush and preserves independent failure causes.
[Independent review](../output/qualification/state-value-bounded-count-independent-review-20261023/review.json)
verified this delta. The [exact allocator replacement](../output/qualification/norito-exact-destination-admission-owner-20261023/review-candidate.json)
moves admission to the allocator and deletes the canonical/Kura duplicate charges.
Both are [installed together](../output/qualification/bounded-counter-allocation-integration-20261023/manifest.json),
composing the rejected intermediate onto the actual installed ABI preimage.
Byte-output bounds do not qualify arbitrary pre-output work, nested measurement,
traversal/drop stacks or scratch/error allocation. Kura's broader receipt/indexed
branches still require explicit composition with its narrow precharge deletion.

The Model correction's [compile run](../output/qualification/model-original-owner-integration-20261023/report.json)
exposed a denied missing-Copy lint on a pure predicate verdict. Its
[successor](../output/qualification/model-predicate-compiler-feedback-20261023/report.json)
adds Copy only to that static-string/integer verdict, deletes the unused private
conversion wrapper and moves unchecked predicate fixture builders out of production.
The Model library then compiled; ABI compilation found two original return owners
that still expected broader errors. The quantity constructor now returns its exact
negative-quantity verdict. Metadata decoding now retains both real reservation
failures and uses the shared fallible box allocator with one admission charge.
Two real producer regressions cover reservation overflow and exact box-budget
rejection/retry. All 188 ABI tests passed. The Model harness then found 48 obsolete
fixture callers; the original 37-file correction and full Model runtime attempt
are recorded at the top of this ledger.

The [repository codec-retirement guard](../output/qualification/codec-retirement-observation-20261023/report.json)
passed on its recorded source. This checks its enumerated retired codec families,
not the complete absence of every superseded API.
The [Core trigger review](../output/qualification/core-trigger-parent-read-root-review-20261023/review.json)
found that a failed parent read could leave time-trigger dispatch permission open.
Its [source correction](../output/qualification/core-block-state-split-correction-20261023/review-candidate.json)
revokes that permission while returning the actual failure. The new regression
uses an unavailable captured parent and checks no event/gas effects, repeated
refusal and no commit. Core caller closure and runtime validation remain pending;
this source checkpoint is not installable by itself.

The [proof error-owner plan](../output/qualification/execution-proof-owned-cause-plan-20261023/report.json)
traces the original certificate, accepted-history, STARK/Grid and registry sources.
The outer error is already non-copyable but still erases actual codec/cryptographic
causes. Required replacements preserve deterministic received-data verdicts
separately from failures of local operations. Descriptor construction must never
be converted to an unknown profile or retried inside paid execution. This plan
is not an implemented proof, security claim or compiler result.

The [operand program computed-state correction](../output/qualification/operand-program-computed-state-owner-20261023/review-candidate.json)
distinguishes intrinsic schedule/count failures from received-data verdicts.
Further [root review](../output/qualification/operand-program-poison-root-finding-20261023/review.json)
found that reusing an aborted verifier still returned a deterministic `Poisoned`
verdict. The [required successor](../output/qualification/operand-program-terminated-state-owner-20261023/review-candidate.json)
removes that verdict and returns a fresh operational refusal without advancing
the cursor or reproducing the first error. These proof producers and their
outward callers remain source candidates, with no runtime or security qualification.
The [operand-source capacity successor](../output/qualification/operand-source-capacity-owner-20261023/review-candidate.json)
checks the retained source ordinal and expected cumulative witness length before
extracting or appending a segment. It removes a path where inconsistent internal
counts could trigger an unadmitted vector growth before final rejection. Fifteen
existing test selectors remain and one additional control checks real allocation
budgets, private count/ordinal corruption, and healthy multi-instance output.
The [segment-plan source replacement](../output/qualification/guarded-segment-plan-owned-causes-20261023/review-candidate.json)
retains failures from rechecking stored spans as computed failures, while received
checkpoint and payload limits remain explicit input conditions. Its
[finite root review](../output/qualification/guarded-segment-plan-root-review-20261023/review.json)
keeps post-admission arithmetic, boxing, outward callers and runtime qualification
open; six original selectors and four new controls are source-reviewed only.
The [transparent substrate source replacement](../output/qualification/transparent-stark-original-owner-20261023/review-candidate.json)
pins the existing mask-cleanup correction and separates actual allocation/random
source failures from protocol conditions. Original signatures now require owned
failure propagation, including Merkle roots and integer appends; no old error
alias remains in the candidate. Root review found allocation preceding received
algebra validation and a path reader accepting truncated retained Merkle levels.
The [preflight and retained-shape successor](../output/qualification/transparent-stark-preflight-feedback-20261023/review-candidate.json)
corrects those original methods, preserves eleven existing selectors, and adds
two controls using actual allocation limits and reconstructed Merkle paths.
These are source candidates; complete caller migration, compilation, runtime,
resource metering and cryptographic qualification remain open.

The [original game-admission replacement](../output/qualification/model-game-admission-owned-causes-20261023/review-candidate.json)
removes the string-valued failure API and uses pure geometry verdicts alongside
actual owned computation failures. [Independent source review](../output/qualification/model-game-admission-root-review-20261023/review.json)
confirmed the four original test bodies remain and account formatting now calls
the existing fallible canonical producer. Its Model certificate consumers are now
installed; Core consumers and original NFT/resource allocations remain open.
The [shared signature failure API](../output/qualification/model-typed-signature-hash-owner-20261023/outward-api/ledger.json)
and its [Core embedding review](../output/qualification/core-signature-execution-root-review-20261023/review.json)
preserve actual hash/sign/verify failures through the complete execution carrier.
Its original Model producer is installed. Core, HTTP and relay callers remain staged,
and the combined source still needs qualification.
The [State fee-source successor](../output/qualification/state-fee-replay-owned-causes-20261023/review-candidate.json)
retains stored binary/JSON and constructed-key errors; the partial-marker test
checks no cache or balance change. Its [finite source review](../output/qualification/state-fee-replay-root-review-20261023/review.json)
passed. These Core candidates remain uncompiled and are not installable separately.
The [State stable-hash successor](../output/qualification/state-stable-hash-owned-causes-20261023/review-candidate.json)
removes cloned sanitation from functional identity calculation and propagates hash
failure through identity/reset and binding decisions. Its
[finite source review](../output/qualification/state-stable-hash-root-review-20261023/review.json)
retains the original fixture assertions and two real depth-refusal regressions.
Full lifecycle callers and original Kura/Tiered geometry failures still require
their own source repair before this Core graph can be installed.

Model, Core and outward consumer integration remain open; passing lower-library
tests do not qualify those consumers or the execution-proof release.
The [five-file primitives successor](../output/qualification/primitives-owned-codec-causes-20261023/manifest.json)
retains actual Numeric ABI codec failures and gives negative quantity construction
its precise domain error. Its [independent source review](../output/qualification/primitives-owned-codec-independent-review-20261023/review.json)
found no additional defect in the bounded delta; all 133 original lexical test
selectors remain. Primitives library execution is covered by the 314-test run
above; its downstream consumers still need qualification.
The same ownership audit found signature admission turning local allocation
failure into invalid signature material. Its original retention and algorithm
parser APIs now have one staged checked constructor with separate invalid-input
and native failure causes. The duplicate admission constructor is deleted;
borrowed validation avoids copying already-owned signature material. All outward
callers must migrate before integration.
The [sealed Merkle cause repair](../output/qualification/merkle-owned-allocation-causes-20261023/manifest.json)
replaces its allocation catch-all with the actual budget, reservation or computed
capacity error, preserving that cause through binary and JSON boundaries. JSON
leaf storage now reserves through the same checked owner. Review found that a
growing buffer charged only its extra slots rather than its complete replacement;
the corrected owner charges the full destination and skips spare-capacity
reservations. It retains 71 lexical test selectors and adds four no-mutation,
budget/retry, growth and JSON reconstruction controls. The
[followup source review](../output/qualification/merkle-owned-allocation-independent-review-20261023/accounting-successor-review.json)
closes the accounting finding. Compiler/runtime validation remains open; shared
infallible construction APIs remain explicit unresolved obligations.

- [Qualification-7](../output/qualification/f2-qualification-current-7/report.json):
  eight builds passed; 615 scheduled checks passed and 34 remained incomplete.
  It predates the latest SDK fixture correction.
- [Installed fixture correction](../output/qualification/f6-certificate-fixture-repair-q7-successor-20261013/report.json):
  numeric geometry `slots` stay numbers; only slot lists become byte arrays.
  The focused native certificate selection passed 215/215 after the fix.
- [Short Grid measurement](../output/qualification/f7-grid-row20-q7-measurement-2-20261013/report.json):
  two players, seven turns, two checkpoints; 3,462,685 proof bytes,
  623.279 seconds production and 67.170 seconds separate verification.
  This is reuse evidence, not full-race or funded-settlement qualification.
- [Tokyo compiler census](../output/qualification/street-phase-a-q7-measurement-20261013/report.json):
  actual zero/two-motion traces only. Historical 5,400/9,000-tick counts are
  algebraic projections, not proof executions.
- [Baseline consumer run](../output/qualification/f6-recovery-20261018/run-1/report.json)
  and its [continuation](../output/qualification/f6-recovery-20261018/run-1-remainder/report.json):
  all twenty stages completed: fifteen passed and five failed. Failures exposed
  framed/bare codec confusion, signed-integer representation, a stale game-record
  fixture and an incorrect retained-checkpoint fixture. The certificate suite
  passed 221/221. These results describe the baseline, not the installed repair.
- [Installed coordinated repair](../output/qualification/coordinated-repair-20261018/manifest.json):
  111 file changes, including twelve deletions. It adds mandatory Fp4 DEEP
  constraint evaluation, fail-closed proof-work admission, bounded WHIR hashing,
  reduced segment ports, current-wire consumer fixes and binary-pinned local
  verification. Unused Street staging and per-component verifier wrappers were
  removed. Two subsequent compile attempts exposed denied test casts and an
  unsupported anonymous iterator lifetime on Rust 1.93; both are corrected.
  [The third build](../output/qualification/coordinated-repair-20261018/run-3/report.json)
  compiled and passed 137/138 tests on source `ede1a822…`. Its sole failure
  exposed a stale public-output count in six-motion bundle transport. The
  [installed correction](../output/qualification/final-segment-boundary-20261018/installation.json)
  makes transport, witness allocation and proof closure derive the count from
  the same final public boundary, excluding internal motion feedback.
  [Core4](../output/qualification/final-segment-boundary-20261018/run-1/report.json)
  passed all 153 exact tests on source
  `a312df585156fd0092a51b29b4890391bfbe60d73030b9bb609377b2a9be9333`,
  including the genuine six-motion public bundle. It retains all previous checks
  and adds eleven regressions and four existing degree/folding checks. Its
  all-roster census covers two-tick geometry, not full-duration proofs.
  Fresh fixtures and end-to-end consumer reruns remain pending.
- Source `a312df58…` passed its
  [SDK rebuild](../output/qualification/f6-successor-20261018/sdk-run-4/report.json)
  and [30 focused tests](../output/qualification/f6-successor-20261018/sdk-focus-4/report.json).
  Later native edits require fresh build provenance.
- [Regression migration and runner cleanup](../output/qualification/final-native-regressions-20261018/installation.json)
  removed 96 obsolete application files after retaining their unique adversarial
  checks in native tests. [Mirror cleanup](../output/qualification/final-mirror-cleanup-20261018/installation.json)
  deleted 42 unused Rust mirrors. The subsequent
  [exporter and memory correction](../output/qualification/native-export-memory-20261018/installation.json)
  installed 32 changes: production Core scalar export, removal of three remaining
  simulator mirrors, a lazy operand row schedule and a streamed first factor fold.
  Core and SDK builds on source `688a0358…` exposed wrong Norito macro paths in
  the new exporter; the failed reports are retained. The correction also covers
  the CLI calls and Norito's grouped-expression syntax. The subsequent
  [ten-file correction](../output/qualification/native-export-compile-successor-20261018/installation.json)
  installed bounded generation reads, streaming executable hashes and corrected
  native documentation on source `dc595726…`. Its installed application checks
  passed 18/18 tests and strict TypeScript compilation. Core6 and SDK6 both
  failed and were reaped: a formatted hazard expression still violated Norito's
  macro grammar, and Core6 also found unsupported fixed-array road serialization.
  The next correction uses named scalar values and serializable vector rows;
  an actual retained-Norito-library smoke confirms every exported road/hazard
  value. The [single-file correction](../output/qualification/native-export-json-successor-20261018/installation.json)
  is installed on source `3668e1f7…`; its fresh
  [SDK build](../output/qualification/f6-successor-20261018/sdk-run-7/report.json)
  and [30 focused checks](../output/qualification/f6-successor-20261018/sdk-focus-7/report.json)
  passed with unchanged sources. [Core7](../output/qualification/native-export-json-successor-20261018/run-1/report.json)
  passed all 174 exact native tests, including genuine six-motion proofs; all
  177 commands completed and their children were reaped. Independent completion
  review checked all 354 retained logs, the harness and unchanged source. The
  actual two/eight-car cost measurement completed against that captured
  harness; its source-specific results are recorded below.
- [Completed six-motion measurement](../output/qualification/post-json-successor-membership-cost-20261018/run-1/report.json)
  and [root completion review](../output/qualification/post-json-successor-membership-cost-20261018/root-completion-review.json):
  both two/eight-car cases passed with identical metered/unmetered bytes and
  separate segment and bundle verification. Bundles are 2,786,027 / 3,998,911
  bytes; whole cases 199.58 / 646.01 seconds; own-child peak process RSS
  390,758,400 / 2,868,346,880 bytes. Whole cases include both production arms
  and verification. All commands closed; source remained `3668e1f7…`.
  This is six motions, not a full race or a controlled performance comparison.
- [Installed bounded generation repair](../output/qualification/native-generation-bounded-successor-20261018/installation.json)
  shares one bounded reader/hasher and executes the captured exact native CLI.
  All Stock/Touring/Street consumers moved together. Its installed checks passed
  63/63 and full TypeScript compilation; Native source remains unchanged.
- [Installed logical-resource and retirement repair](../output/qualification/logical-execution-resources-20261018/installation.json)
  changes 39 native and 15 application files on source `af4d0f4d…`, including
  deletion of eleven obsolete files (9,417 lines). The retired tests have an
  explicit native obligation map. Fixed logical accounting replaces allocator
  capacity in proof admission; physical allocation refusals remain separate.
  Verification no longer requires prover codeword/dense-opening memory, and
  parallel commitment estimates include each task's scratch buffer. Immutable
  source/query/state owners and complete schedule predicates are enforced.
  Independent composition review checked 375 guards, five overlap owners and
  217 exact native selectors with eight explicit old-test replacements. 
  Core8 and SDK8 both failed compilation and closed. The errors are stale
  mutable-vector tests, mismatched native multiproof error types, and a manually
  maintained source-inventory length. Their corrections and additional typed
  resource propagation are installed in the following source epoch; no earlier
  pass is credited to this source.
- [Installed typed-resource integration repair](../output/qualification/typed-resource-integration-20261018/installation.json)
  advances Native to `63efb58a…` across 25 files. It fixes the observed compile
  errors, derives the source-inventory length, preserves memory-refusal types
  through compiler/prover/extraction, and makes settlement work independent of
  host layouts. Canonical write-set comparison stays in its decode budget.
  Both obsolete string-based memory classifiers are removed. The selection has
  237 ordinary Core tests (all 217 prior obligations retained) and 13 CLI tests;
  Core9 compiled, then passed 233/237 selected tests and closed with failure.
  Valid zero-motion evidence exceeded an invalid logical-to-physical allocation
  ratio; two HTTP tests expected obsolete codec errors; one commitment test
  omitted concurrent opening scratch from its quota. Reviewed successors repair
  these causes and remove the misleading decoder-budget API. SDK9 rebuilt and
  its 30 focused tests passed on this source. No measurement or integrated pass
  is credited to the uninstalled successors.
- [Fallible projection work](../output/qualification/fallible-owned-projection-successor-20261018/PLAN.txt)
  replaces duplicate eager/indexed projection and nested clones with one owned
  validated context. Fallible hashing, counted Merkle construction, ledger
  decoding and typed query refusal have independent scoped reviews. The final
  hash/Merkle modules passed 96 isolated tests with JSON enabled; Core/SDK/Torii
  integration remains pending. The reviewed candidate changes the original
  inclusion/reference APIs to typed results and migrates SDK/Python callers
  without compatibility wrappers. Unchecked block execution also needs a
  fallible API: its panic conversions are removed in the AMX candidate, and
  158 remaining fixture/example calls have a separately reviewed migration.
  The executable fixture generator propagates failure before state commit.
- The [registered-proof error audit](../output/qualification/registered-proof-resource-boundary-audit-20261018/REPORT.txt)
  identified a consensus boundary beyond error classification: a local memory
  refusal must abort tentative execution without a rejection result, fee,
  marker or vote. The shared AMX/body-store operational path is being repaired;
  Stock/Grid/session/ISI execution must use that same channel. Signature
  verification and generic allocation internals remain explicit open work.
- The [two-oracle composition review](../output/qualification/native-two-oracle-composition-20261018/REVIEW.txt)
  supplies a conditional argument for the differently sized Base/Extension
  branches and accounts for sampling with replacement. It stops at the
  challenge-instantiated equations: native commitment extraction,
  Fiat–Shamir compilation, lookup/integer semantics and complete security
  qualification remain open. Four staged arithmetic regressions exercise the
  base-field extraction premises and an adaptive-challenge counterexample;
  their isolated arithmetic smoke and the four selected Core9 tests passed.
  They do not establish the missing composed security argument.
- The [execution identity audit](../output/qualification/execution-identity-design-20261018/DESIGN.md)
  found that whole-file hashes currently mix semantic profile identity with
  build provenance. Complete adapter/protocol descriptors must replace that
  semantic coverage before those runtime source bindings are removed. Exact
  build provenance remains mandatory. The installed typed errors cover compiler helpers and finalized write-set
  extraction. Finalized block decoding, the shared merge projection, and some
  Stock adapter/cryptographic wrappers still need complete resource handling;
  deterministic admission and physical memory remain distinct.
- Seventeen obsolete application proof runners/helper entrypoints and their
  frozen public Street bundle were removed. Active Street consumers now require
  explicit current generation evidence. Fresh Tokyo generation passed 36 native
  graph tests, and the published asset passed 30 scenery tests. The active
  generation/package suite passed 15 tests; Rust/browser parity passed 9,961 race
  transitions, 704 collision-escape cases and 89 hazard cases. Hardware-rendered
  browser checks passed driving, verified music, pause/silence and rejection of
  altered route/music assets. The [complete headed browser run](../output/qualification/street-lab-assets-20261018/full-lab-3/report.json)
  passed 97/97 checks with no request-error suppression; all eight cars finish
  and music and engine audio stop. The healthy blob-audio cancellations in two
  earlier failed runs originated in metadata preloading, before disposal. Using
  full preloading for the already downloaded, hash-verified local blob fixed the
  cause. These results establish neither cryptographic proving nor ledger settlement.
- The [broader app unit run](../output/qualification/app-unit-current-20261018/run-1/report.json)
  completed 444 tests: 429 passed and 15 failed, with no source changes or skips.
  Missing fresh native corpora and stale generated source inventories remain
  explicit regeneration dependencies. The other failures exposed stale Touring
  catalog counts, palette provenance and a reporter flag incorrectly inherited
  by nested tests. [The reviewed app correction](../output/qualification/app-unit-roots-20261018/installation.json)
  updates the exact catalog assertions and regenerates the palette from all 79
  current art inputs; the consumer runner passes its reporter directly to Node.
  The [installed correction checks](../output/qualification/app-unit-roots-20261018/installed-verification.json)
  passed 23 focused tests and two headed browser cases without warnings or errors.
  No old native fixture is accepted as current.

## Completion gates

| Gate | Next concrete outcome | Completion evidence |
| --- | --- | --- |
| F0/F1 — Current baseline and complete record binding | Finish the fresh native CLI, SDK and browser run; repair real failures | Current-source native and consumer tests pass; altered records, epochs, networks and histories reject |
| F2 — Accepted inputs and complete execution | Validate the selected generic segment path and regenerate browser parity from the installed production Core exporter | Every input, transition, integer bound, collision, inactive/padding row, checkpoint, removal and terminal outcome is constrained; adversarial tests pass |
| F3 — Exact cryptographic security | Enforce AIR at the Fp4 DEEP point in the registered STARK driver; qualify the Street WHIR composition separately | Exact parameters, transcript, field/hash assumptions and all composition losses receive independent review establishing at least 128-bit classical soundness |
| F4 — Practical full races | Measure the actual segment path, reduce its bottlenecks and bound total transport/verification work | Genuine two- and eight-player 5,400-tick proofs and Tokyo's actual 9,000-tick cap independently verify; retain time, peak memory, proof bytes and validator cost |
| F5 — Protected settlement | Enforce exact-profile work admission, calibrate worst-case costs and complete genuine funded XOR/NFT lifecycle tests | Atomic settlement, exact ties, forfeits, disputes, duplicate rejection and custody protection pass from consensus-derived statements within reserved validator resources |
| F6 — Usable verification tools | Finish the fresh twenty-one-stage consumer run and native finalized-inclusion workflow | Canonical current fixtures, wallet/network/fee binding, proof verification and finalized inclusion against a pinned trust context pass end to end |
| F7 — Generic reuse | Complete funded Grid settlement and practical cost qualification | A second game proves and settles through the same generic framework without race-specific instructions |
| F8 — Release qualification | Run supported-target parity and real four-validator failure/recovery scenarios | Partitions, withheld inputs, competing checkpoints, restart/replay and identical state roots pass; independent crypto review and deployment prerequisites pass |

All gates remain open. Historical passing subtests are retained in the dated
record; they do not close a gate whose required end-to-end outcome is missing.

## Execution order

1. Compile and test the installed coordinated source changes in the existing
   warm Cargo lanes. Preserve every failure and fix its owning code; do not
   weaken negative tests.
2. Regenerate current-source native fixtures, proofs and binaries, then rerun
   all twenty-one SDK/browser stages, including the full application unit suite.
   Historical artifacts cannot qualify new code.
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
