# Iroha game proof foundations — completion goals

Set on September 28, 2026 at the user's request. The active conversation goal is
to finish and qualify reusable native proof foundations for SORA CARS and other
deterministic games. This file is the milestone and acceptance record for that
goal, reaffirmed against the current installed source on October 13, 2026. No
milestone below is complete merely because a design or patch exists.

**Current goal status: active; Production-7 passed all six checks, and Qualification-7 finished with eight successful builds and 615 passed / 34 incomplete scheduled checks.**

The Tokyo arithmetic measurements are complete. The immediate sequence is to
verify the resulting SDK/CLI/browser consumers. Full-duration proof work
follows on the next source revision. No full-race proof, 128-bit security
qualification, funded-settlement qualification or release approval is claimed.

<details>
<summary>Retained baseline failures and recovery</summary>

The previous disk
shortfall was confirmed across three consecutive turns and retained in the
[blocked audit](../output/qualification/f2-capacity-blocked-audit-20261012/third-turn.json).
On resumption, free capacity recovered to about 103 GiB. The reviewed
[preparation](../tmp/f2-qualification-current-root-activation-4/preparation.json)
passed fresh closure, source-inventory and resource checks, and the existing
durable owner was launched. Seven builds completed before the October 12,
15:46 JST reboot interrupted integration compilation. The [reboot observation](../output/qualification/f2-qualification4-reboot-observation-20261012/report.json)
confirms the old processes and launchd job are absent and all 1,364 guarded
source files still match `f6f7798e…`. The interrupted command has no terminal
receipt. Fresh admission then launched Qualification-5 in the same
warm target. All eight builds passed, including the integration harness in
2,369.54 seconds. Registration checks and the lifecycle/wire exports passed;
the run then stopped at the Touring CLI catalog test, which expected 38 source
files while the current catalog contains 40. All 64 child commands were reaped,
final source cleanup matched `f6f7798e…`, and fresh process/launchd observations
confirm closure. The exact missing expectations are the accepted-input
transcript and game-retention modules. Their reviewed test correction is
installed at `1f54a6fa…`, with the other 1,363 guarded files unchanged. Its
focused rerun passed with one test, no failures and unchanged source. All eight
child commands were reaped, and the owner exited zero. Production-6 passed
all six checks and unchanged-source cleanup. Fresh closure and resource
observations then admitted Qualification-6 in the existing warm target; its
Core test-harness build passed in 1,901.73 seconds, followed by the model,
codec and CLI test-harness builds. The standalone CLI verifier also passed in
905.03 seconds, and the prover example passed in 882.43 seconds. The Torii
test harness passed in 1,556.12 seconds and the integration test harness passed
in 1,529.65 seconds, both with their children reaped. All eight builds have
passed. The run then passed 254 scheduled nodes, including lifecycle, wire and
certificate exports, before `core-ordinary-134` failed. Its Grid fixture tried
to unwrap a malformed generic transcript that the constructor correctly
rejects. All 249 commands were reaped; final source is unchanged and the owner
and launchd job are closed. Six other ordinary Grid cases subsequently passed
against the same binary with unchanged source. The test-only correction has
[independent source review](../tmp/f2-grid-malformed-fixture-independent-review-20261012/review.json)
and is installed in the nine-file successor below. The [remaining 346 ordinary diagnostics](../output/qualification/f2-q6-remaining-ordinary-20261012/report.json)
finished with 340 passes and six failures. All 350 commands were reaped, the
source lock was released, and full source/inventory checks stayed unchanged.
The failures concern checkpoint-bound contexts, partial-prefix construction,
checkpoint error labels, legal integer intervals, removed-slot dispute
construction, and seeded Street restoration wording. Their focused repairs
preserve the rejected inputs and production bounds; source review is complete.
These diagnostics cannot change Qualification-6's failed status. Current proof
export and remaining qualification are still pending.
No certificate or proof exporter ran in Qualification-5. All foundation
requirements remain in scope.

</details>

The [nine-file successor](../output/qualification/f2-q6-repairs-install-20261012/report.json)
was installed at `06263b0e869d631f61f8dbfd8feed2c0bc3c11ac919bfaae414569505777cb45`
and qualified as recorded below. The later F6 source transition is recorded separately.
It contains the seven fixture corrections and the early fixed-field settlement
check with two adversarial tests. Ten owned observations were reaped; nine
exact preimages were backed up, 1,355 other guarded files remained unchanged,
and Git membership stayed identical. The [independent installation review](../tmp/f2-q6-repairs-install-independent-review-20261012/review.json)
verified the retained candidates, backups and inventory. Source review is
complete. [Production-7](../output/qualification/f2-production-current-7/report.json)
passed all six compilation scopes, with unchanged source and all eight child
commands reaped. Its owner exited zero. [Qualification-7](../output/qualification/f2-qualification-current-7/report.json)
finished with all eight builds passed, 615 passed scheduled nodes and 34
incomplete nodes. All 609 child commands were reaped, and all source observations
and cleanup match `06263b0e…`. The [supervisor completion](../output/qualification/f2-qualification-current-7-supervisor/completion.json)
records the expected owner exit 2 for the terminal `blocked-incomplete` report;
fresh process and launchd observations confirm closure. This preserves the
incomplete status for separately admitted measurements and external gates.
The report SHA-256 is `74eee2595914de6bbe7bbf6bbad36792f1b63d887bc39f487bf9311d5bd64674`;
the completion SHA-256 is `13ded85488b2b4efd4f8cab9d1ac83e9a08d1cc0d131e50516297d69ecfff00d`.
This is current native test evidence, not complete release qualification.
The successor schedule
adds only the two settlement tests and their final source-check dependencies.
F4's prover-memory changes remain staged until genuine F6 consumers complete.
The [Grid fixture carry-forward](../tmp/f4-grid-fixture-carry-forward-independent-review-20261012/review.json)
preserves the installed malformed-input repair and the staged canonical-proof
parity test. It has source review only; the full F4 composition and execution
remain pending.

The Q7 [Grid measurement owner](../tmp/f7-grid-row20-focused-owner-qualification7-independent-review-20261012/review.json),
[SDK repair installer](../tmp/f6-native-frame-repair-installer-q7-independent-review-20261012/review.json),
[CLI/app consumer](../tmp/f6-cli-app-generation-owner-q7-independent-review-20261012/review.json)
and [native SDK consumer](../tmp/f6-addon-consumer-owner-q7-independent-review-20261012/review.json)
have source review. They require actual successful producer steps, unchanged
source and clean process closure before execution. The separate Tokyo census
traced only zero and two motions; its 5,400/9,000-tick counts are algebraic
layout measurements, not long-race execution or proof evidence.

The [separate Grid measurement](../output/qualification/f7-grid-row20-q7-measurement-2-20261013/report.json)
now passed: a two-player, seven-turn proof with two retained checkpoints,
a distinct native verifier and the existing negative controls. Its encoded
proof is 3,462,685 bytes, with 623.279 seconds for production (including driver
self-verification and encoding), 67.170 seconds for separate verification,
and a whole-child peak RSS of 862,289,920 bytes. These are observed local timings,
not a validator throughput qualification. All 13 commands exited zero and were
reaped; final source remains `06263b0e…`. The report digest is
`b1b058a5fe2f8ab9e9874d02bca59d6692ef6d1413cb1a285d62e8b820881122`.
This advances generic reuse but does not establish funded settlement, ledger
finality or cryptographic qualification. The [Tokyo measurement owner](../output/qualification/street-phase-a-q7-measurement-20261013/report.json)
also completed with exit zero. All 19 command receipts and stream hashes were
verified; source remained unchanged and cleanup was empty. The report digest is
`9639279d5db23f823b4cd9391d3792adb50b6d56076a50b9c38b4af7c1eb552e`.
The two-car layout uses 2 boundary stages and 27 motion stages; the eight-car
layout uses 11 and 405 respectively. Stages reach 8,192 columns. Whole-child
peak RSS was 155,762,688 bytes and 1,327,529,984 bytes respectively. These are
compiler and short-trace measurements, not full-history proofs. The reviewed
reductions need new native measurements before their savings can be claimed.

The [F6 fixture publication](../output/qualification/f6-certificate-publication-q7-20261013/report.json)
and [exact SDK test correction](../output/qualification/f6-sdk-frame-repair-q7-20261013/report.json)
both completed with exit zero and nine reaped observations apiece. The resulting
1,374-file native inventory has source identity
`a585b7c38979b49fd3b53e7de46e908f7191d89a32999bc993fa85ad3671a6aa`.
These fixture/test changes preserve the compiled proof relation sources. The
first CLI preflight rejected Git's canonical trailing-slash directory markers
for nested scratch repositories before any build or export. That
[failure](../output/qualification/f6-cli-pre-dispatch-failure-q7-20261013/report.json)
is retained. A reviewed app-specific parser now preserves exact raw membership,
rejects malformed paths and overlaps, and leaves Native parsing and the selected
300-file app snapshot unchanged. Its 23 focused controls passed. The corrected
[CLI/app owner](../output/qualification/f6-cli-app-generation-q7-20261013/report.json)
passed preflight and is compiling this source. All twenty downstream SDK/browser
commands remain required; a running build does not establish their success. The
first CLI owner later lost its process after Cargo emitted a successful binary
and before the owner could retain its terminal report; that interrupted record
is preserved. A fresh producer lane then completed all 16 owned commands and
generated the 21-grid export plus exactly three app artifacts. The reviewed
addon consumer started against that producer but stopped at its native
certificate fixture stage: four of 216 tests fail because the fixture adapter
converts numeric geometry `slots` into an empty byte array. This is retained as
a real SDK gate failure; no downstream consumer or qualification claim follows
it. A narrowly scoped source repair is being reviewed before another consumer
attempt.

The next proof-layout revision now has an
[independent composition review](../output/qualification/f4-private-projection-retention-20261013/review/review.json).
It projects 16 replacements and 12 additions onto the current source, preserving
all 1,358 untouched entries, the F6 fixture changes and genuine proof-success
tests. Its 57 focused ordinary tests and two bounded census measurements still
need compilation and execution after F6 closes. The revision is not installed.
The strict v3 measurement collector and a bounded installer are being prepared
separately; their source reviews cannot establish performance improvements.
The [retention manifest](../output/qualification/f4-private-projection-retention-20261013/retention.json)
preserves the exact candidate and review bytes outside temporary storage.

The [whole-history checkpoint candidate](../tmp/f4-street-whole-history-checkpoint-list-20261012/manifest.json)
now has [independent source review](../tmp/f4-street-whole-history-checkpoint-list-independent-review-20261012/review.json).
It replaces the single raw checkpoint with a bounded, strictly ordered list and
uses the existing boundary constraints, without adding trace columns or raising
the degree. Three authored native tests cover genesis, interior and terminal
anchors, malformed lists, and the distinction between raw state and later
forfeit normalization. These tests are not yet compiled or executed. The
[companion accepted-history constructor](../tmp/f4-street-accepted-whole-history-tape-visibility-20261012/manifest.json)
now has [independent source review](../tmp/f4-street-accepted-whole-history-tape-visibility-independent-review-20261012/review.json),
with eight additional authored tests. Review corrected six new declarations
to stay within the execution-proof module; executable logic and tests are
unchanged. The constructor preserves the existing pre-plan validation, requires every
certified anchor, derives controls and removals from validated history, and
releases the old compiled sequence before constructing the new relation.
The [driver integration map](../tmp/f4-street-whole-history-driver-map-20261012/handoff.json)
identifies the remaining canonical statement, deterministic domain padding,
driver dimension checks, complete source identity and receipt association.
The existing segmented receipt does not authenticate this new relation.
Neither candidate is installed, compiled or proof-qualified yet.

The [driver resource audit](../tmp/f4-whole-history-driver-resource-bounds-20261012/REPORT.md)
found a concrete whole-history size obstruction: an 8,192-column trace needs
17.5 MiB for mandatory query and DEEP values alone, before other proof fields.
That width was confirmed by the current Tokyo stage census; whole-history
geometry measurements are still pending. The
unchanged 4 MiB wire limit therefore requires a narrower relation, while full
eight-car histories also need fewer rows. The new driver adapter must reject
oversized geometry before matrix allocation. Genuine proof tests must still
require successful proving and verification; resource rejection is a separate
negative test, never proof completion.

The [first constraint reduction](../tmp/f4-street-full-union-select-reduction-20261012/manifest.json)
has [independent source review](../tmp/f4-street-full-union-select-reduction-independent-review-20261012/review.json).
It removes a Select output's duplicate range decomposition only when its full
interval follows from the already constrained branches and Boolean selection.
Narrowed intervals and all source assertions remain constrained. Six authored
native tests cover signed bounds, both branches, tampering and stage cuts;
three formatting checks pass. Native tests and actual savings are unmeasured.
Its changed allocation schema and stage geometry require fresh measurements;
the old Tokyo counts and collectors cannot qualify the optimized source.
There is also a constraint-count obstruction: the historical eight-car graphs
contain 105,898 source nodes across boundary and motion. The current lowering
and these narrow reductions retain at least one non-range equation per node,
already exceeding the driver's 65,535-residue limit before whole-history
equations. This is a source-derived lower bound using historical graph counts,
not a new measurement. Full eight-car support needs a more compact constraint
representation as well as fewer columns and rows.

The [input-range successor](../tmp/f4-street-input-range-reuse-20261012/manifest.json)
also has [independent source review](../tmp/f4-street-input-range-reuse-independent-review-20261012/review.json).
It retains the existing complete input-bound constraint and removes only its
immediate duplicate. Carry imports still constrain their own bounds. Five new
native tests cover signed extremes, tampering and retries; execution and
measured savings remain pending.

The [exact scalar successor](../tmp/f4-street-exact-scalar-range-reduction-recovery-20261013/manifest.json)
has [independent source review](../tmp/f4-street-exact-scalar-range-reduction-independent-review-20261013/review.json).
It preserves Add/Sub/Mul equations and drops an output range decomposition only
when its exact interval follows from constrained operands. It also removes
tautological constant equalities, while preserving narrowed bounds, eager
assertions and carry-import bounds. Ten native regressions are authored but
unexecuted. The separately [reviewed v3 census successor](../tmp/f4-street-optimized-census-v3-independent-review-20261013/review.json)
keeps the historical test prefix and raw AIR parity checks; it does not reuse old
numeric counts to claim savings for the optimized source.

The [stage-ordinal candidate](../tmp/f4-street-one-hot-checked-tail-successor-20261013/manifest.json)
groups equations whose authenticated stage selectors are mutually exclusive.
Unconditional range checks and global constraints remain separate. Its
[source review](../tmp/f4-street-one-hot-independent-review-20261013/review.json)
accepts the implementation with explicit integration gates; native tests and
full-history geometry are not measured.
Grouping reduces the number of combined polynomials but retains original
equation evaluation work, which needs separate deterministic resource accounting
and measurement. The [source catalog addition](../tmp/f4-street-whole-history-slots-catalog-independent-review-20261013/review.json)
has independent review and includes the new production module in the compiled
proof profile's source identity. These staged changes remain uninstalled.

The [whole-history proof bridge](../tmp/f4-street-whole-history-native-proof-20261012/manifest.json)
is written and has [independent source review](../tmp/f4-street-whole-history-native-proof-independent-review-20261012/review.json).
Its 147 selected semantic dependencies include the exact authored modules,
simulation, accepted-history validation, serialization and shared proof driver.
The canonical statement binds every accepted control/removal, checkpoint,
physical output and complete record context. Verification reconstructs the
expected statement from a separately prepared owner. Five ordinary tests, two
geometry observations and two success-required proof tests are authored;
none has run. This private bridge is not installed or registered and produces
no ledger-verification receipt. Its source catalog is not binary provenance.
Later composition must include the exact optimization and prover-memory
postimages before generating proof identities.

The first release proves public accepted inputs and their correct execution.
SORA CARS publishes its replay; witness secrecy is not part of that application.
Any future private-game mode needs its own hiding construction, leakage model
and zero-knowledge argument before it can be described as zero knowledge.

## Scope and completion rule

- Keep reusable computation, proof profiles, typed verification, game lifecycle,
  escrow and settlement in native Iroha Rust. Game-specific rules belong in
  compiled, versioned adapters. No race-specific ISIs or external zkVM.
- Registration selects a supported compiled relation and qualified parameters;
  it cannot install arbitrary verifier code or relax resource/security limits.
- Use one canonical first-release Norito format at each boundary. Remove
  obsolete partial requests and fallback codecs as coordinated changes; produce
  fresh genuine fixtures and source-derived identities.
- Derive settlement claims from the ledger's actual current record, including
  pending accepted inputs, revision, economic obligations and dispute history.
  A self-consistent record or endpoint response does not establish finality.
- Require an explicit composed security target of at least 128 bits for the
  exact execution-proof protocol. State the attack model, assumptions and
  authentication/finality boundaries; do not inherit a component's headline
  security number or imply quantum-safe wallets/consensus. Distinguish
  per-attempt error, success at a stated total adversarial-work budget, and the
  work required for constant success; do not choose an arbitrary small query
  budget merely to label the protocol 128-bit secure.
- The goal is complete only when F0–F8 have retained passing evidence and the
  review findings are resolved. Full-race success, integration readiness and
  external cryptographic review cannot be replaced by short synthetic tests.
  Live staked admission stays closed until the required reviews and rollout
  qualification pass.

Game artwork, story and music continue as separate product work. SoraFS and a
healthy Taira deployment remain necessary for the eventual game release; they
do not replace any proof-foundation gate below.

## Active completion gates

These are the current goals, ordered by dependency rather than by how much
source has been written. Passing evidence must identify the exact source,
parameters, commands and outputs; historical passes remain tied to their epochs.

| Goal | Current work | Required completion evidence |
| --- | --- | --- |
| F0/F1: qualify the current baseline | Source `06263b0e…` passed all six production checks and all eight qualification builds. Qualification-7 is terminal with 615 passed / 34 incomplete nodes, all 609 children reaped and unchanged source; earlier failures remain retained. Current SDK/browser consumer qualification is pending | Current installed source passes the complete selected native, SDK and browser suite with complete record binding |
| F2: prove accepted inputs and execution | Current native ordinary checks and three short genuine-proof cases passed, including retained checkpoint adversaries. Full Street whole-history construction and proof bridge have source review but are not installed or executed | Complete legal histories and adversarial cases cover every input, transition, inactive row, collision, checkpoint, dispute and terminal outcome |
| F3: qualify cryptographic security | Exact field algebra, conditional pre-challenge candidate coverage and adaptive near/far false-claim composition have retained review. Applying their premises to installed acceptance, completing the extension-field identity and execution semantics, and qualifying the deployed primitives remain open | Reviewed protocol and implementation establish at least 128 bits for the exact admitted parameters; the staged extension-point repair remains uninstalled and unqualified |
| F4: make full races practical | Stock/Touring full-race rows fit; dense prover memory remains open. All 12 retained Rust reference cases (two/eight cars, three tracks, both adapters) complete 5,400 ticks with eligible finishers and exact replay equality. Integrated history/AIR/proof execution and memory-lifetime parity measurements remain pending | Genuine two- and eight-player 5,400-tick proofs independently verify, with retained time, memory, wire size and validator cost measurements |
| F5: settle protected assets | Corrected genuine-proof funded Grid tests have independent and root source review; native compilation/execution pending | Genuine funded XOR/NFT settlement, exact ties, forfeits, disputes and duplicate/custody rejection pass atomically from consensus-derived statements |
| F6: deliver verification tools | Native exports and independent shipping CLI verification passed. Fresh fixture publication and SDK test correction completed; CLI/app generation is running. SDK/browser consumer checks remain pending | Current exports, independent expectations, wallet binding and native proof/finalized-inclusion verification pass end to end |
| F7: prove reuse | The current separate Grid proof, native verifier and negative controls passed with unchanged source; proof 3,462,685 bytes, production 623.279 s, separate verification 67.170 s. Funded settlement and operational cost qualification remain open | A genuine Grid proof and funded settlement pass through the same generic framework |
| F8: qualify the release | Current Torii and integration harnesses compiled and their selected ordinary tests passed. Four-validator scenarios are not yet executed; independent cryptographic review remains open | Supported-target parity, real four-validator partition/restart recovery and independent cryptographic review pass before integration and staked admission |

The [September 30 primary-source supplement](../tmp/f3-september-cutoff-primary-delta-20261013/NOTES.md)
adds a reduced-round Poseidon CICO-2 resultant attack to the exact-hash review.
The [primary preprint record](https://eprint.iacr.org/2026/1905) is available;
full-paper retrieval returned HTTP 403. Its applicability to the exact native
Poseidon2 instance and absorption mode remains an open review obligation. This
abstract-level screening supplies no break, bit-security bound or replacement
for the missing complete extension-point predicate. No verifier or profile was
changed by that research.

## Immediate execution priorities

The immediate source is now `06263b0e869d631f61f8dbfd8feed2c0bc3c11ac919bfaae414569505777cb45`.
All six production checks passed. The 649-node qualification schedule is terminal:
615 passed and 34 remain incomplete. The genuine current corpus contains a
1,334,446-byte two-player proof covering six physical ticks and acceptance
through tick 12; its independent shipping CLI verification passed. The retained
Touring and Stock checkpoint proofs also passed their native verifier and
negative controls, at 1,422,654 and 1,357,038 bytes respectively. These are short
proofs, not the full Street game or full-duration qualification.

Next, finish the two running Tokyo compiler measurements, then publish the
actual producer artifacts and validate the SDK/CLI/browser consumers. The Grid
measurement passed separately after a reviewed harness correction. Its original
pre-dispatch failure remains retained: a historical, already-reaped test PID had
been reused by a root-owned macOS service. Closure now validates the pinned wait4
receipts and freshly checks supervisor/owner birth identities; EPERM still fails.
After consumer validation, install the reviewed whole-history and arithmetic
reductions together, regenerate profile source identities and measure the real
layout before full-race proving. Every source change requires matching evidence.
The preceding source transitions and failed runs remain retained below.
The [Touring CLI test correction](../tmp/f2-touring-catalog-test-repair-20261012/manifest.json)
has [independent source review](../tmp/f2-touring-catalog-test-independent-review-20261012/review.json)
and is [installed](../output/qualification/f2-touring-test-repair-install-20261012/report.json).
It updates the exact catalog count from 38 to 40 and checks the two added
digests, preserving all 85 existing assertions and production code. Nine owned
observations exited zero and were reaped; full inventory and tracked/untracked
membership confirm exactly one file changed. The first installer attempt
stopped before output creation because an ownership check rejected Apple's
root-owned tools. The [reviewed successor](../tmp/f2-touring-installer-v2-independent-review-20261012/review.json)
validates only the exact admitted tools separately from user-owned evidence.
The [runner successor](../tmp/f2-qualification-touring-test-runtime-20261012/manifest.json)
preserves all 112 existing composition entries and adds the already-inventoried
CLI file as entry 113. The 647-node schedule and resource permissions are
unchanged. The [focused rerun](../output/qualification/f2-touring-focused-rerun-20261012/report.json)
passed the exact nonignored Touring CLI test. Cargo exited zero after 390.64
seconds, both source observations matched `1f54a6fa…`, all eight child commands
were reaped, and the root owner exited zero. The [Production-6 preparation](../tmp/f2-production-current-root-activation-6/preparation.json)
validated the actual installed source and reviewed runtime; its
[launch preparation](../output/qualification/f2-production-current-6-launchd/preparation.json)
was bootstrapped successfully. [Production-6](../output/qualification/f2-production-current-6/report.json)
passed all six checks, including Core in 174.3 seconds, the prover example in
183.7 seconds, CLI in 221.6 seconds and Torii in 281.1 seconds. Both source
observations match `1f54a6fa…`; all eight commands exited zero and were reaped.
[Supervisor completion](../output/qualification/f2-production-current-6-supervisor/completion.json)
confirms the owner exited zero and was reaped.
The [Q6 preparation](../tmp/f2-qualification6-preparation-20261012/manifest.json)
has [independent source review](../tmp/f2-qualification6-preparation-independent-review-20261012/review.json)
and twenty passing isolated controls. Its [actual execution](../tmp/f2-qualification-current-root-activation-6/preparation.json)
validated the successful production receipts, fresh normal closure, unchanged
source and resource headroom. It preserves the 647-node schedule and exactly
three short-proof admissions. [Qualification-6](../output/qualification/f2-qualification-current-6/report.json)
is closed with a retained failure; owner 37456 was reaped. Its source-start and
compiler-version checks passed.
The Core test harness built successfully in 1,901.73 seconds; the model, codec
and CLI test harnesses also passed, with all completed commands reaped. The
standalone CLI verifier also passed in 905.03 seconds, followed by the prover
example in 882.43 seconds. The Torii test harness passed in 1,556.12 seconds and
the integration test harness passed in 1,529.65 seconds. All eight builds have
passed. The run passed 254 nodes before the malformed Grid fixture test failed
at `core-ordinary-134`. All children were reaped and source cleanup matched
`1f54a6fa…`; [supervisor completion](../output/qualification/f2-qualification-current-6-supervisor/completion.json)
records exit one and owner reaping. The [subsequent focused diagnostic](../output/qualification/f2-grid-existing-controls-20261012/report.json)
confirmed fresh process/launchd closure and passed the six remaining ordinary
Grid controls, with unchanged source and all ten commands reaped. The
[one-file fixture correction](../tmp/f2-grid-malformed-fixture-repair-20261012/manifest.json)
retains every hostile case and asserts rejection at its actual owning layer;
its independent review is complete, and it is installed in the nine-file
successor at `06263b0e…`. Q6's lifecycle, wire
and certificate exports passed, but its proof exporter did not run. Its failed
receipt cannot satisfy the currently reviewed publication/consumer owners;
successors need genuine successful producer evidence after repair. This is not
complete qualification. Old Q5
publication bindings cannot publish: that run did not reach its
certificate exporter.

The preceding integration-repair source was `f6f7798e7c0c1bee6b213b3bd42ca46eb2bde423d691cc98a8ebd678b3bca086`.
The [reviewed integration repair](../tmp/f2-integration-compile-repair-independent-review-20261012/review.json)
is [installed](../output/qualification/f2-integration-repair-install-20261012/report.json):
exactly five edits in two test files, preserving all 117 assertion occurrences
and original test registrations. Both source observers exited zero and were
reaped; the other 1,362 guarded files are unchanged. The [runtime review](../tmp/f2-qualification-dispatcher-integration-independent-review-20261013/review.json)
binds 112 composition entries and the unchanged 647-node schedule. The added
entry is an existing integration helper, not a new verifier or proof relation.

[Production-5](../output/qualification/f2-production-current-5/report.json)
passed all six scopes against that source, using the same warm target and
normal Cargo jobserver. All eight commands, including the two source checks,
exited zero and were reaped. Core, prover example, CLI and Torii took 807.91,
707.46, 158.35 and 308.45 seconds respectively. Both source checks matched
`f6f7798e…`; [supervisor completion](../output/qualification/f2-production-current-5-supervisor/completion.json)
records a successful closed owner. The [short-proof applicability notes](../tmp/f2-three-small-proof-resource-notes-integration-successor-20261013/NOTES.txt)
confirm all eight relevant sizing source files are unchanged; they supply no
new RSS measurement or proof result. The independently reviewed
[Qualification-3 preparation](../tmp/f2-qualification3-preparation-independent-review-20261013/review.json)
has now [run successfully](../tmp/f2-qualification-current-root-activation-3/preparation.json),
confirming actual process/launchd closure and fresh resource headroom.
[Qualification-3](../output/qualification/f2-qualification-current-3/report.json)
closed with a disk-admission failure after the Core test harness compiled
successfully in 2,630.02 seconds. The pre-model check observed 13,384,101,888
free bytes, below the unchanged 16 GiB dispatch floor. All four child commands
exited zero and were reaped; both source observations matched `f6f7798e…`.
[Supervisor completion](../output/qualification/f2-qualification-current-3-supervisor/completion.json)
records the owner's exit one and reaping. [Fresh process and launchd observations](../output/qualification/f2-qualification3-disk-failure-closure-20261012/report.json)
confirm it is closed. No tests, registrations, exporters or proof nodes ran,
so this run cannot supply a certificate publication. Preserve its successful
Core build and failed evidence while recovering storage for a fresh admission.
The unchanged 647-node schedule admits exactly three short proof producers;
full-race and separate-owner gates remain closed.

The [bounded storage survey](../tmp/f2-storage-survey-readonly-20261013/REPORT.md)
found at most 0.63 GiB of byte-identical private extents potentially available
for sharing, insufficient to reach the 32 GiB initial
admission threshold from roughly 13 GiB free. No evidence or warm-target files
were deleted or replaced. Additional capacity was needed before the retry; the
user was asked to free space or provide an archive volume. The subsequent
[source and capacity check](../output/qualification/f2-capacity-blocked-audit-20261012/report.json)
confirmed all 1,364 guarded files still matched `f6f7798e…`, with only
14,297,559,040 free bytes. This historical capacity blocker has since cleared;
the fresh Qualification-4 admission below records the recovered headroom.

The [Qualification-4 preparation](../tmp/f2-qualification4-preparation-20261013/HANDOFF.txt)
has [independent source review](../tmp/f2-qualification4-preparation-independent-review-20261013/review.json)
with no findings and eight passing focused controls. It preserves the same
source, runtime, 647-node schedule, three short-proof admissions, warm target
and disk thresholds. Its new prerequisite checks the exact prior disk failure
and requires fresh process/launchd closure before creating admission. Root
reviewed the complete patch and retained file hashes. On resumption, preparation
[executed successfully](../tmp/f2-qualification-current-root-activation-4/preparation.json)
after capacity recovery. The [actual admission](../tmp/f2-qualification-current-root-activation-4/admission.json)
and [launch preparation](../output/qualification/f2-qualification-current-4-launchd/preparation.json)
bind the unchanged source and schedule. Seven builds completed, then a host
reboot interrupted the integration build. The [fresh recovery observation](../output/qualification/f2-qualification4-reboot-observation-20261012/report.json)
retains the unchanged running report and supervisor state, absent old processes,
the missing launchd job and the actual boot time. No terminal exit, reaping or
final source observation is invented for the lost owner. A new source observer
ran after reboot under the existing source lock and confirmed `f6f7798e…` and
all 1,364 inventory files. Tests, proofs and exports remain pending.

The [Qualification-4 publication wrapper](../tmp/f6-certificate-publication-qualification4-successor-20261013/manifest.json)
has [independent source review](../tmp/f6-certificate-publication-qualification4-independent-review-20261013/review.json)
with nine passing focused controls. Only four run bindings and its description
changed; all eleven function bodies and tests remain identical. It cannot
publish until a genuine exporter passes and fresh terminal closure is observed.
Qualification-4 produced no exports and has no terminal completion, so that
run cannot supply a publication. No producer result, publication or consumer
source identity has been assumed; any later run needs its own actual bindings.

The [Qualification-5 preparation](../tmp/f2-qualification5-preparation-20261012/manifest.json)
passed [independent review](../tmp/f2-qualification5-preparation-independent-review-20261012/review.json)
and [actual fresh admission](../tmp/f2-qualification-current-root-activation-5/preparation.json).
It binds the observed reboot, absent old processes, unchanged source and the
same 647-node schedule with three short-proof admissions. The narrowly reviewed
[runner successor](../tmp/f2-qualification-reboot-runtime-20261012/manifest.json)
confirms the already-completed Production-5 closure using its genuine preboot
receipt and fresh reboot evidence; it does not complete the interrupted
Qualification-4 owner. Both preparation and the newly launched supervisor
performed their own observations in separate directories. Fresh headroom was
94% reported free memory and 450,477,621,248 free disk bytes. The
[Qualification-5 report](../output/qualification/f2-qualification-current-5/report.json)
initially recorded seven successful cached builds and active integration
compilation. It later closed at the stale Touring assertion, as recorded above;
its certificate exporter never ran.

The [Qualification-5 publication wrapper](../tmp/f6-certificate-publication-qualification5-successor-20261012/manifest.json)
and its [publisher helper update](../tmp/f2-certificate-publication-reboot-successor-20261012/manifest.json)
passed [independent source review](../tmp/f6-certificate-publication-qualification5-independent-review-20261012/review.json).
The publisher's two helper references now select the reviewed runner; the
wrapper binds the actual new admission and launch preparation. All eleven
function bodies in each file are unchanged. This fixes the old helper's
rejection of the new runtime paths and reboot-closure request. Publication
still requires a genuine passed exporter and actual terminal owner closure.
These Q5 bindings are retained history and cannot publish from the failed run.

The [current Q6 publication wrapper](../tmp/f6-certificate-publication-qualification6-successor-20261012/manifest.json)
and [publisher](../tmp/f6-certificate-publisher-qualification6-successor-20261012/manifest.json)
have [independent source review](../tmp/f6-certificate-publication-qualification6-independent-review-20261012/review.json).
They bind the actual Q6 admission, launch preparation, `1f54a6fa…` inventory
and current runtime. Only exact admitted tools receive the root/current-owner
exception; ordinary source and evidence reads remain strict. The publisher's
direct entry point now rejects so execution must use the wrapper's actual
successful-export, child-reaping and fresh process-closure checks. Forty-one
guarded controls passed. The exact 47-file corpus validation, backups, atomic
publication, rollback, source lock and membership checks remain preserved.
Root verified 26 publisher, 20 wrapper and 32 joint-review pins. No genuine
export or publication has yet occurred in Q6. Publication must precede the SDK
test repair and F4 changes, which would invalidate the producer inventory.

The preceding `c45ecf6c…` source retains its own evidence below.
The [reviewed two-test repair](../tmp/f2-test-api-repair-independent-review-20261013/review.json)
was [installed](../output/qualification/f2-test-api-repair-install-20261012/report.json)
after [actual failed-owner closure](../output/qualification/f2-test-api-failure-observation-20261012/report.json).
Only the two compiler-failing tests changed; the other 1,362 guarded files stayed
unchanged, and both source observers exited zero and were reaped.
The [runtime successor review](../tmp/f2-qualification-dispatcher-test-api-independent-review-20261013/review.json)
confirms two updated composition entries, 109 unchanged entries, and the same
647-node schedule. [Production-4](../output/qualification/f2-production-current-4/report.json)
passed all six scopes from its [fresh admission](../tmp/f2-production-current-root-activation-4/preparation.json)
through the existing warm target and normal Cargo jobserver. All eight commands,
including both source observations, exited zero and were reaped; source stayed
`c45ecf6c…`. Core, prover, CLI and Torii took 85.00, 79.13, 107.21 and 184.56 seconds.
[Completion](../output/qualification/f2-production-current-4-supervisor/completion.json)
and [fresh closure checks](../tmp/f2-qualification-current-root-activation-2/preparation.json)
confirm the build owner is closed.

[Qualification-2](../output/qualification/f2-qualification-current-2/report.json)
failed at `integration-build`. Core, model, model codec, CLI test harness, CLI
verifier binary, prover example and Torii test harness all built successfully.
The integration harness failed on five errors in two files: an ambiguous Norito
schema method, JSON macro field expressions, a missing query predicate trait,
dispute-commitment logging and mismatched transaction-hash return types. All
eleven child commands were reaped. [Supervisor completion](../output/qualification/f2-qualification-current-2-supervisor/completion.json)
and [fresh closure observation](../output/qualification/f2-integration-failure-observation-20261012/report.json)
confirm the owner is closed and the source remains `c45ecf6c…`. No test,
registration, corpus exporter or proof-producing node ran. The seven successful
builds are compilation evidence only.

Its [reviewed preparation](../tmp/f2-qualification2-preparation-independent-review-20261013/manifest.json)
admitted three short log13 producers, but that admission does not imply that
any proof was generated. [Independent sizing notes](../tmp/f2-three-small-proof-resource-notes-20261013/NOTES.txt)
remain relevant to those exact source functions. After the minimal compiler
repair, observe the actual new source, bind its runtime and resource evidence,
and rerun production and qualification. Preserve this failed run unchanged.

The [reviewed browser consumer repair](../tmp/f6-browser-current-integration-independent-review-20261013/review.json)
is [installed](../output/qualification/f6-browser-consumer-install-20261012/report.json).
It updates the wallet-continuation test to the actual field IDs and DOM dataset,
clears inherited accepted history when a synthetic browser fixture resets its
frontier to zero, and validates that fixture through the current native-schema
SDK encoder. All seven continuation scenarios and genuine-fixture requirements
remain intact. Existing nine-unit and five-Chromium passes cover synthetic
transport/storage only; the two repaired consumers still require actual current
native exports and a matching SDK addon before they can be qualified.

A further [one-test SDK correction](../tmp/f6-native-frame-checkpoint-test-repair-20261013/README.md)
has [independent source review](../tmp/f6-native-frame-checkpoint-test-independent-review-20261013/review.json).
The current transport fixture selects checkpoint tick 12 but retains physical
`final_state` at tick 6. The corrected test requires the unique recorded state
at the selected tick and explicitly rejects the wrong-state substitution. It
is staged, not installed or executed. Publish the actual certificate export
against its actual successful producer inventory, observe that fixture-only
source change, then install and observe this separate one-file correction.
The publisher invokes neither SDK tests nor app generation.

The [one-file installer](../tmp/f6-native-frame-repair-installer-v2-20261012/manifest.json)
passed [independent source review](../tmp/f6-native-frame-repair-installer-independent-review-20261012/review.json)
after fixing an owned-child cleanup gap: a post-spawn receipt failure must still
attempt the wait before releasing the source lock. Sixteen guarded controls
and an independent regression passed; the original candidate remains preserved
and is not accepted. The installer requires the actual future successful Q5
publication report. It checks the original producer through retained fixture
bytes separately from the current published inventory, backs up and replaces
only the accepted test file, and observes the resulting source. It has not run.
The later root installer preflight exposed its shared helper's rejection of
root-owned system tools. The [v3 source successor](../tmp/f6-native-frame-repair-installer-v3-20261012/manifest.json)
adds a separate validator for exact admitted tools at both the direct read and
historical-constructor reader. Strict source/evidence ownership, retired-fixture
mapping and child cleanup remain unchanged. Its [independent review](../tmp/f6-native-frame-repair-installer-v3-independent-review-20261012/review.json)
accepted 23 inherited/focused controls and eight additional controls; root
verified 22 candidate and 17 review pins. V3 deliberately retains the historical
Q5 inputs. Q5 failed before certificate export, so actual future producer and
publication bindings still require a reviewed successor before execution.

The [Q6 repair successor](../tmp/f6-native-frame-checkpoint-test-repair-q6-20261012/manifest.json)
now binds the actual current inventory and Q6 admission while preserving the
reviewed test change. Its [independent review](../tmp/f6-native-frame-checkpoint-test-repair-q6-independent-review-20261012/review.json)
and the [Q6 installer's review](../tmp/f6-native-frame-repair-installer-q6-independent-review-20261012/review.json)
passed. The [current installer](../tmp/f6-native-frame-repair-installer-q6-20261012/manifest.json)
requires a genuine successful publication receipt and its observed source
inventory. It preserves every other file and actual inventory membership; it
does not assume the producer's file count survives publication. Neither
publication nor repair has executed. The finite
[CLI/app generation owner](../tmp/f6-cli-app-generation-owner-q6-v2-20261012/HANDOFF.txt)
has [independent source review](../tmp/f6-cli-app-generation-owner-q6-v2-independent-review-20261012/review.json).
Review caught a missing fresh disk check in its predecessor; the accepted
successor records and enforces the existing 16 GiB floor before each expensive
dispatch. It validates the distinct producer, published-fixture and repaired
source identities before building a matching CLI and generating exactly three
app artifacts. Actual publication, repair, source and app-baseline inputs are
still required. All agents must preserve app Git membership during that run.

The [Grid readiness map](../tmp/f5-f7-grid-readiness-20261012/HANDOFF.md)
joins thirteen retained source files to the current inventory. It identifies
seven genuine proofs across four existing gates, none admitted by Q6. The
single retained-checkpoint proof is the first proposed measurement: its
seven-turn transcript still uses an 8,192-row proof domain, with 1,257 base
columns, 71 fixed columns and 1,466 constraint residues. The
[allocation assessment](../tmp/f7-grid-row20-resource-assessment-20261012/ASSESSMENT.md)
has [independent source review](../tmp/f7-grid-row20-resource-independent-review-20261012/review.json).
Its selected late proving buffers,
query values and frontier digests total 833,817,440 bytes (about 795 MiB), with
explicit exclusions for allocator/container overhead, worker stacks and other
process memory. This is neither a peak-RSS bound nor an execution admission.
The schedule has no F6-consumer dependency for this test. The
[focused owner](../tmp/f7-grid-row20-focused-owner-20261012/manifest.json)
has [independent source review](../tmp/f7-grid-row20-focused-owner-independent-review-20261012/review.json)
and ten passing isolated controls. It can reuse the actual Q6 Core binary after
Q6 closes and before fixture publication, requiring unchanged source,
successful Core registration and ordinary Grid prerequisites, and fresh root
resource admission. It retains the actual proof, separate proving/verification
timings and whole-child memory usage. This owner has not run. The
funded Grid gate additionally requires profile qualification, which remains
disabled. No source-only readiness finding opens that gate.

The [current consumer execution handoff](../tmp/f6-consumer-readiness-20261012/HANDOFF.md)
identifies the existing CLI, app generator and SDK addon commands, the genuine
lifecycle/wire/certificate/proof consumers, and the broader existing browser and
app acceptance suite. Its 31 file pins were checked against current source.
The old consumer owners are bound to older source epochs and cannot be launched
unchanged. After actual publication and the one-file repair, bind consumers to
the observed new source, build matching tools and retain an independent CLI
proof verification. Synthetic browser transport remains separate from genuine
Stock-and-Grid finalized-inclusion verification. No consumer execution is
claimed by this handoff.

An [actual app-source capture](../tmp/f6-browser-lifecycle-capture-20261012/manifest.json)
found a cleanup gap in the live UI, wallet and finality browser harnesses:
partial startup happened before their cleanup blocks, one failed close could
skip the remaining resources, and passed reports were written before cleanup.
The [reviewed correction](../tmp/f6-browser-lifecycle-independent-review-20261012/review.json)
is now [installed and tested](../output/qualification/f6-browser-lifecycle-install-20261012-2/report.json).
It preserves all 145 existing assertions and writes success reports only after
every registered cleanup completes. Sixteen installed fault tests and five
parse checks passed; all six Node commands exited zero and were reaped. The
[independent evidence check](../tmp/f6-browser-lifecycle-install-independent-review-20261012/review.json)
found no discrepancy. The first installer attempt failed before any write or
child command because the system Python lacks `zip(strict=...)`; its failure
is retained separately. The successful successor used the admitted Python 3.14.
Capture the future CLI/app baseline after this five-file app-only change.
Native source was untouched and the real browser scenarios remain pending.

The [bounded addon and consumer handoff](../tmp/f6-addon-consumer-stage-plan-q6-20261012/HANDOFF.txt)
defines twenty fixed stages, including supported native addon publication,
complete SDK distribution equality, a separate native CLI proof verification
and the genuine-corpus browser suites. The [finite runner](../tmp/f6-addon-consumer-owner-q6-20261012/manifest.json)
is sealed, with nineteen passing guarded controls and three separately owned
Node selector fixtures. Root has read the full runner and checked its manifest
pins; [independent source review](../tmp/f6-addon-consumer-owner-independent-review-20261012/review.json)
found no issues and authenticated the retained control results. No actual
consumer stage has run. Execution still requires genuine Q6 closure and exports, publication,
the SDK test repair and the successful matching CLI/app generation receipt.

The [metering input assessment](../tmp/f5-generic-meter-input-assessment-20261012/ASSESSMENT.md)
identifies four internal count groups: encoded inputs, consensus record/history,
compiled verifier work and settlement effects. The instruction-only gas helper
cannot observe ledger history, so record work must be reserved before cloning
and bounded proof decoding. The model uses actual verifier work, not prover
LDE allocations. Its seventeen retained source matches and separate current
gas capture provide design inputs; implementation, coefficients and measured
block-capacity qualification remain open.
The [independent review](../tmp/f5-generic-meter-input-independent-review-20261012/review.json)
and [actual transaction-path capture](../tmp/f5-meter-transaction-capture-20261012/manifest.json)
show why a Game-local gas increment would be insufficient: successful and
rejected fee paths can still use the original static amount, separately from
the counter retained for block accounting. One conservative compiled-profile
tariff through the existing meter is the first option identified by the
[caller-seam assessment](../tmp/f5-meter-reservation-seam-20261012/REPORT.md).
It must cover worst-case common record work, compiled verification, submitted
bytes and cold catalogue initialization. Dynamic pricing would instead require
coordinated reservation and fee changes throughout those callers. Both designs
must preserve signed limits, fee charges and block limits across direct
instructions, overlays and mixed batches; authenticated IVM replay and nested
execution also need explicit charging coverage. Record and profile caps are
finite, but practical tariffs and block fit are not yet measured.

The [actual verifier cost study](../tmp/f5-verifier-cost-bounds-20261012/REPORT.md)
joins nineteen current source files and distinguishes query verification from
prover work. Full eight-car Stock verification reconstructs a 404 MiB fixed
matrix; matrix, roots and four concurrent inversion-buffer pairs give a
conservative 440 MiB selected element subtotal. This excludes the decoded
proof, record, graphs, containers, allocator and runtime overhead and is not a
peak-memory limit. Grid's corresponding subtotal is 5 MiB. The study also
identifies repeated full-record encodings, cold profile initialization and
worst-case exact column comparisons that proof-byte pricing misses. Its
structural bounds have [independent review](../tmp/f5-verifier-cost-bounds-independent-review-20261012/review.json);
actual verifier timing, memory and fee calibration remain required on supported targets. The existing Grid
measurement reports a separate warm verifier time, not isolated verifier RSS
or cold-start cost.

The [early settlement identity candidate](../tmp/f5-settlement-early-binding-20261012/manifest.json)
compares fixed fields in the borrowed consensus record before cloning it. It
preserves all later complete-record, proof and payout checks and leaves the
standalone verification API unchanged. Its two appended tests cover eleven
mismatch cases and require matching fields to continue to full-record
validation. Scratch formatting and patch-conservation checks passed, and the
[independent source review](../tmp/f5-settlement-early-binding-independent-review-20261012/review.json)
found no issues. It is not installed or Rust-tested, and establishes no new gas
coefficient or profile qualification. Its future native validation must execute
both new tests and all four preserved preflight tests against the installed
source, alongside genuine proof and settlement coverage.

The app's generated race profile also remains stale. Its existing native
generator requires a SHA-pinned CLI inside the selected Native checkout and
checks all 35 compiled profile sources before installation. Regenerate those
artifacts and build the matching authenticated SDK before genuine consumers.
The proof corpus requires its own successful admitted producer; lifecycle,
wire and certificate exports alone cannot satisfy proof verification tests.
Keep producer and consumer source identities separate throughout.
The [current genuine-consumer handoff](../tmp/f6-genuine-consumer-handoff-20261013/HANDOFF.md)
records the executable order, actual corpus sizes and distinct proof/finality
requirements. Its source inspection found 10 changed and 12 missing entries in
the app's old 23-source catalog. Neither the app generation nor the genuine
consumer commands have run at the new source yet.

The following earlier attempts retain their actual source identities.
The first [F2 production run](../output/qualification/f2-production-current-1/report.json)
passed model and model-codec, then failed Core with E0425. Its owner and every
child were reaped, and both source observations remained `d49518cb…`. The
[installed correction](../output/qualification/f2-namespace-repair-install-20261012/report.json)
adds only `lifecycle::` to the certificate-context type path; all other 1,363
guarded files remain unchanged. Run the same six scopes against this new source.

The subsequent [addon rebuild](../output/qualification/f2-sdk-addon-rebuild-20261012/report.json)
failed with E0061 after 709.27 seconds: initial game creation omitted the new
empty checkpoint-history argument. Its builder exited 101 and was reaped;
[independent observation](../output/qualification/f2-sdk-addon-failure-observation-20261012/report.json)
confirmed unchanged `5bbe94e3…` source and unchanged published addon bytes.
The [lobby correction](../output/qualification/f2-lobby-repair-install-20261013/report.json)
adds one empty vector, preserving the exact initial lobby projection and the
namespace repair. Only `game.rs` changed, yielding that `6397fe7b…` source.
The [second addon rebuild](../output/qualification/f2-sdk-addon-rebuild-2-20261013/report.json)
succeeded through the same warm target and existing provenance workflow:
build, authenticated publication and all ten selected app history tests passed.
All five commands exited zero and were reaped; both source observations are
`6397fe7b…`. The [independent retained audit](../tmp/f2-sdk-addon-success-review-20261013/review.json)
confirmed these scoped results. The subsequent [two native account checks](../output/qualification/f2-sdk-account-checks-20261013/report.json)
also pass without skips, covering twelve malformed-key vectors and caller
mutation isolation across source, distribution and public exports. Both source
observations and all 1,364 guarded files remained unchanged. These tests do not
establish native proof soundness or ledger authority.

The prepared production-2 launch belongs to the superseded source and was never
launched. A [fresh current-source admission](../tmp/f2-production-current-root-activation-3/preparation.json)
rechecked the actual source inventory, all 111 composition postimages and all
runtime/tool pins. [Production-3](../output/qualification/f2-production-current-3/report.json)
passed all six compilation scopes using the normal Cargo jobserver and the
existing Native target. All eight commands, including both source observers,
exited zero and were reaped; the source stayed `6397fe7b…`. Core, prover example,
CLI and Torii took 87.00, 199.02, 213.21 and 262.85 seconds respectively.
[Supervisor completion](../output/qualification/f2-production-current-3-supervisor/completion.json)
and the [fresh process/launchd observation](../output/qualification/f2-qualification-current-1-terminal-observations/receipt.json)
confirm actual closure.

The [first current-source qualification run](../output/qualification/f2-qualification-current-1/report.json)
failed during the Core test build under its [actual admission](../tmp/f2-qualification-current-root-activation-1/preparation.json).
The build exited 101 and was reaped; the source remained `6397fe7b…`.
[Supervisor completion](../output/qualification/f2-qualification-current-1-supervisor/completion.json)
and fresh process/launchd observations confirm that the owner is closed.
No selected tests, corpus exporters or proofs executed. Six errors are stale
`p.claim` accesses in the Grid removal-frontier test; two access private Street
layout fields. The minimal repair uses the ledger-derived prepared-claim
accessor and public layout getters, with a checked roster-size conversion.
Every assertion remains required. Install the reviewed two-file correction,
observe its actual new source identity, and rerun production and qualification
against that identity; retain this failed run without relabeling it.

The first 120 scheduled nodes need no additional per-test resource approval,
provided compilation and exact test registration succeed. These include the
three native corpus exporters. Nine separate-owner nodes and unadmitted heavy
tests remain blocked; successful exports do not imply that the complete suite,
full-race proofs or release qualification passed. Fixture publication must wait
for this owner to close and validate each actual producer independently.

The [certificate publisher successor](../tmp/f2-certificate-publication-creation-successor-20261013/manifest.json)
corrects its stale dispatcher binding and retains the identical, explicitly
pinned shared-lock helper. [Independent source review](../tmp/f2-certificate-publication-creation-independent-review-20261013/manifest.json)
found no issue and reran all eighteen existing controls successfully. Producer,
corpus, backup, swap, rollback and source-observation checks are unchanged.
The [test-repair publisher successor](../tmp/f2-certificate-publication-test-api-successor-20261013/manifest.json)
selected runtime `3386793d…` with only two binding literals changed.
[Independent review](../tmp/f2-certificate-publication-test-api-independent-review-20261013/manifest.json)
and the root diff confirm unchanged validation, lock, publication and test code;
the unchanged eighteen controls were not rerun. The current
[integration-repair successor](../tmp/f2-certificate-publication-integration-successor-20261013/manifest.json)
selects runtime `476ef486…` through the same two literal changes. Its
[independent review](../tmp/f2-certificate-publication-integration-independent-review-20261013/review.json)
checks 67 retained pins and confirms unchanged publication safeguards. Actual
fixture publication and consumer tests remain pending. Publication will create a new consumer source
identity; preserve the actual producer identity and validate the fixture-only
change without relabeling its binary.

The [SDK distribution rebuild](../output/qualification/f2-sdk-distribution-publication-20261012/report.json)
published all 161 actual SDK source files and preserved the native source
identity. It resolved the missing transcript export, initially exposing a
separate stale native-addon provenance failure: five history tests passed and
five stopped during account construction. The successful matching addon and
ten-test rerun above resolve that runtime delivery failure without bypassing
provenance validation.
The [initial import failure](../output/qualification/f2-app-history-controls-20261012/report.json)
and both failed runs remain evidence, not passing qualification.

The [full-duration fixture feasibility run](../tmp/f4-reference-fixture-feasibility-20261013/manifest.json)
uses genuine retained Rust reference bodies. All 12 cases reach 5,400 ticks,
without DNFs, with one or seven finishers and an unfinished final car, and match
an independent replay. This establishes controller/fixture feasibility only:
the cases request steering and boost, do not exercise drift or braking, and
have not run the integrated accepted-history, AIR or native proof selectors.

1. Retain the successful [durable six-production-check replacement](../output/qualification/native-foundations-copy-repaired-durable-20261012/report.json)
   after the [single-derive repair](../tmp/native-v4-selection-copy-repair-20261011/installation.json)
   at observed source `bf80d250…`. The first [V4 check](../output/qualification/native-foundations-v4-installed-20261011/report.json)
   failed on `missing_copy_implementations` in the new fixed-size settlement-selection
   type. Every child was reaped and both source observations remained `29520401…`.
   The repair adds `Copy` without changing wire fields. The preceding focused repair run passed CLI
   compilation, all eight finality tests and Torii compilation, with both source
   observations equal to `7a29e6b2…`; every child was reaped. Preserve both earlier
   failed runs. The V4 installation wrote22 reviewed files, retained all protected
   relation and finality sources, and did not include the rejected F3 rebase.
   All30 [installed SDK transport tests](../output/qualification/native-v4-sdk-installed-20261011/report.json)
   pass, including canonical seven-part framing and cancellation/physical-I/O
   ownership. These tests do not establish proof correctness or finalized inclusion.
   The [original Copy-repaired run](../output/qualification/native-foundations-v4-copy-repaired-20261011/report.json)
   passed model, model-codec, Core and prover-example before interruption during
   CLI. Its lost tool handle and absent owner/CLI processes do not establish
   exit or reap outcomes. The [recovery observation](../tmp/native-copy-repaired-recovery-20261012/recovery.json)
   preserves those unknowns and freshly confirms the same source. The replacement
   uses the reviewed durable lifecycle, warm target, source stamp and source lock;
   all six targets passed and every child exited zero and was reaped. Core,
   prover-example, CLI and Torii took 1,905.04, 396.32, 1,478.77 and 1,118.64
   seconds respectively. The final source observation matches `bf80d250…`.
   Report `7130e5c0…` and [supervisor completion](../output/qualification/native-foundations-copy-repaired-durable-20261012-supervisor/completion.json)
   `bdc6a48a…` retain the actual results. Independent [process](../tmp/native-cost-current-root-activation-1/baseline-process-closure.json)
   and [launchd](../tmp/native-cost-current-root-activation-1/baseline-launchd-closure.json)
   observations confirm absent baseline processes and launchd's successful terminal
   state. Compilation success alone does not qualify a proof or settlement.

2. Close the actual cost-meter failure first, with the
   [Copy-repaired focused runner](../tmp/native-membership-cost-copy-repaired-runner-20261011/manifest.json)
   and [durable supervisor](../tmp/native-membership-cost-copy-repaired-supervision-20261011/manifest.json).
   Their [independent review](../tmp/native-membership-cost-copy-repaired-independent-review-20261011/review.json)
   and [root review](../tmp/native-membership-cost-copy-repaired-root-review-20261012.json)
   found no material source issue; 24 source controls pass. That candidate binds
   the now-interrupted original run and cannot authorize cost execution. The
   [narrow durable-run successor](../tmp/native-cost-durable-prerequisite-20261012/manifest.json),
   with its [supervision binding](../tmp/native-cost-durable-prerequisite-20261012/supervision-manifest.json),
   now requires the actual replacement's terminal report, matching initial/final
   source, exact command/log/wait outcomes and supervisor completion. Its 26 pure
   controls pass; [independent review](../tmp/native-cost-durable-prerequisite-review-20261012/review.json)
   verifies that the cost execution loop is unchanged, with the baseline
   supervisor added to process-absence checks under the shared lock. This is
   source validation only. The actual successful baseline now admits
   [current cost run 1](../output/qualification/native-membership-cost-current-1/report.json),
   launched under [runtime config](../tmp/native-cost-current-root-activation-1/runtime-config.json)
   `adb78cff…` and [root admission](../tmp/native-cost-current-root-activation-1/root-admission.json)
   `fd52c646…`. The [actual bootstrap result](../tmp/native-cost-current-root-activation-1/launch-result.json)
   is zero; supervisor 34668 and owner 34724 were observed running, with the
   shared source mutex held. That run has now failed during release test-harness
   compilation: Cargo35919 exited101 and was reaped after 1,943.94 seconds;
   owner34724 exited1 and was reaped. Final source remains `bf80d250…` and no
   cost case executed. The [retained failure closure](../tmp/f8-nft-snapshot-repair-root-20261012/failure-closure.json)
   confirms absent processes and launchd's not-running/runs-one/last-exit-one.
   The failing helper compared `Owned<NftData>` values lacking `PartialEq` and
   `Debug`. Its [reviewed test-only repair](../tmp/f8-retained-assets-nft-snapshot-core-review-20261012/review.json)
   compares the complete canonical NFT bytes, preserving IDs, owner/content and
   every other snapshot/assertion. The [actual one-file installation](../tmp/f8-nft-snapshot-repair-root-20261012/installation.json)
   measured source `30263437…` under the shared mutex, with the other 1,351
   inventoried leaves unchanged. The codec-policy check passes. The
   [narrow corrected-source runner](../tmp/f8-corrected-cost-runner-20261012/manifest.json)
   and its [independent review](../tmp/f8-corrected-cost-runner-review-20261012/review.json)
   bind that measured source and exact test-only delta while retaining the
   original successful production baseline and actual failed cost outcome.
   Fourteen source controls and the complete retained-evidence join pass;
   unchanged build, selector, identity and ownership policies reject mutation.
   Root's [actual source review](../tmp/native-cost-current-root-activation-2/root-review.json)
   admits [runtime config](../tmp/native-cost-current-root-activation-2/runtime-config.json)
   `c27b9b55…` and [runtime manifest](../tmp/native-cost-current-root-activation-2/runtime-manifest.json)
   `b7d5f4e6…`. The [actual bootstrap](../tmp/native-cost-current-root-activation-2/launch-result.json)
   exits zero and starts `native-membership-cost-current-2`. That attempt also
   failed before any case: release-build84873 exited101 and was reaped after
   151.49 seconds; source start/final both remain30263437. Its
   [actual failed closure](../tmp/f8-grid-cli-import-repair-root-20261012/failure-closure.json)
   retains absent processes and launchd's not-running/runs-one/last-exit-one.
   Full diagnostic inspection corrected the first diagnosis: run1 already
   contained the private-import error alongside the two NFT errors; run2
   contained only that remaining private-import error.
   The [reviewed CLI fixture repair](../tmp/f8-grid-cli-public-api-repair-review-20261012/review.json)
   uses the public context and outcome-commitment constructors and preserves
   both original constant bounds. It does not expose the private module.
   [Actual installation](../tmp/f8-grid-cli-import-repair-root-20261012/installation.json)
   changes only cli_gate.rs from the30263437 source and measures2aae3f6a…;
   the complete1,352-path before/after inventory is retained. The
   [two-repair cost successor](../tmp/f8-grid-cli-corrected-cost-runner-20261012/manifest.json)
   binds this measured source and both exact test-only repairs. Its
   [independent review](../tmp/f8-grid-cli-corrected-cost-review-20261012/review.json)
   accepts the narrow provenance change, with18 guarded controls passing;
   runner and renderer bytes are unchanged. Root's actual
   [review](../tmp/native-cost-current-root-activation-3/root-review.json),
   [runtime configuration](../tmp/native-cost-current-root-activation-3/runtime-config.json)
   and [bootstrap result](../tmp/native-cost-current-root-activation-3/launch-result.json)
   start `native-membership-cost-current-3` at2aae3f6a. Its release harness now
   compiles successfully: Cargo4595 exited zero and was reaped after2,315.95
   seconds. Both compiled test listings and all five ordinary regressions also
   passed. The post-build source observation still matches2aae3f6a. The genuine
   two-car six-tick proof also passed: metered and unmetered complete public
   bundles are byte-identical at2,778,392 bytes and independently verify. Its
   owned child32552 exited zero and was reaped after96.25 seconds. The eight-car
   case also passed: child33904 exited zero and was reaped after841.11 seconds,
   with actual whole-child peak RSS3,357,261,824 bytes. The terminal report is
   `observed-two-short-proofs`; all thirteen children succeeded and were reaped,
   and the final source remains2aae3f6a. The supervisor records owner3899's
   successful exit. Fresh owned process and launchd observations are part of
   the following installer, separate from the supervisor's own completion.
   No old binary or historical six-check success is relabeled as new-source execution.
   The old production16-dependent runners and failed evidence remain unchanged.
   Run all five ordinary regressions, then genuine two- and eight-car six-tick
   cases on the current source. An eight-car resource rejection remains a
   rejection; do not count it as a generated proof. Preserve actual process
   outcomes, verifier results and measured resources.
3. Complete validation of the installed [coordinated transport/SDK/CLI/Grid successor](../tmp/native-game-foundations-source-composition-v4-work/manifest.json). Its five staged CLI JSON mutations now
   use checked Norito object access, and its preimages retain the installed CLI
   repair. Root diff review confirms all other 22 inventoried postimages are
   unchanged; exact forward/reverse scratch application passed.
   A [supplementary protected-leaf record](../tmp/native-game-foundations-v4-protected-source-update-20261011.json)
   preserves the later descriptor-fixture repair without rewriting V4 evidence. Include the reviewed funded-test successor
   without overriding its qualification prerequisite. Apply the separate reviewed
   F8 helper correction without reapplying the already installed scenario or
   dispute controls. Recheck affected production targets and derive
   the test schedule from the resulting compiled registrations.
   Refresh the complete native/SDK/browser corpus and explicitly run the nine
   omitted verifier components, the nonfinal-prefix gate and genuine
   Stock-and-Grid finalized-settlement verification. Keep remaining
   certified-command adversaries visible until implemented and passed. Migrate
   the frontend's actual finality export and command to the current seven-file
   certified settlement format, together with its unit/browser tests. The
   447-command suite includes those nine verifier components and the mandatory
   nonfinal-prefix gate, but omits all seven original cost-meter selectors.
   The separate [focused meter qualification](../tmp/native-cost-durable-prerequisite-20261012/plan.json)
   above covers those omissions. Neither historical passes nor the existing
   447-command schedule automatically qualify newly installed code or tests.
   After both current owners close, install the
   [reviewed F2 Native/SDK/app composition](../tmp/f2-incremental-final-composition-v2-20261012/manifest.json)
   with its exact preimages and backups, then qualify its new source identity,
   compiled registrations and fresh native exports. Prepare Native's SDK
   dependencies from its lockfile before claiming installed runtime parity.
   The [dependency readiness audit](../tmp/f2-native-sdk-dependency-readiness-20261012/manifest.json)
   identifies all 31 missing files in three already-locked `@noble` packages.
   Its normal `npm ci --ignore-scripts` command avoids lifecycle builds, but
   replaces the SDK's dependency tree; execute it only after current ownership
   closes, with actual tool/configuration checks and before/after source, addon
   and dependency-byte verification. Actual [dependency preparation](../output/qualification/f2-native-sdk-dependencies-20261012/report.json)
   now passes: all31 required byte pins match, the full1,364-leaf source map,
   package/lock, dist and native addon/checksum bytes are unchanged, and actual
   before/after source remainsd49518cb. Lifecycle scripts were disabled and no
   native build or fixture publication ran in that preparation.
   The [certificate publisher](../tmp/f2-certificate-publication-20261012/manifest.json)
   has [independent review](../tmp/f2-certificate-publication-review-20261012/review.json)
   and [root review](../tmp/f2-certificate-publication-root-review-20261012.json);
   all18 guarded scratch controls pass. Actual publication still requires a
   successful fresh native exporter and closed producer ownership. Preserve
   the producer's source and binary provenance, publish its exact47 files,
   then measure the consumer source and verify the complete fixture-only delta.
   The producer and consumer can have different whole-worktree identities.
   Do not relabel an old binary or repeatedly rebuild merely to force them equal.
   Verify unchanged compiled-source and profile identity inputs explicitly.
   The [installation wiring package](../tmp/f2-installer-wiring-20261012/manifest.json)
   provides the exact two-project inventory and nine passing source controls.
   The [current executable installer source](../tmp/f2-current-installer-20261012/manifest.json)
   reuses the byte-preserving writer, journal and process guards with a two-project
   admission. Fifteen scratch controls and an independent
   [full 151-path scratch exercise](../tmp/f2-installer-full-inventory-review-20261012/scratch-1791738803577559000/result.json)
   pass. Cross-package review then found two pinned source-observer scripts missing
   from the guarded source map. The [original proposal is superseded](../tmp/f2-current-installer-root-review-20261012/superseded.json)
   and must not be activated. Its [separate corrected successor](../tmp/f2-current-installer-v2-20261012/manifest.json)
   adds both unchanged observer scripts to admission and per-write source checks.
   All 18 controls pass, with [independent review](../tmp/f2-current-installer-v2-independent-review-20261012/review.json)
   and [root review](../tmp/f2-current-installer-v2-root-review-20261012/review.json).
   The writer is unchanged; actual map unions contain 1,356 preimages and 1,364
   postimages, including selected test files outside the older 1,352-pin inventory.
   This is reviewed installer source, not an actual installation or new source epoch.
   The later NFT test repair changes its expected preimage/source epoch. This
   bf80-bound installer and composition cannot be activated against30263437;
   preserve their reviews. The [minimal composition successor](../tmp/f2-nft-snapshot-composition-successor-20261012/manifest.json)
   has [independent lineage review](../tmp/f2-nft-snapshot-composition-review-20261012/review.json):
   only that NFT helper's installed and final pre/postimages change; the other
   110 Native rows and all40 app rows remain exact. Current installer and
   dispatcher bindings still need their narrow source successor and a genuine
   successful cost prerequisite before activation. The subsequently installed
   CLI helper repair has a [minimal current F2 successor](../tmp/f2-cli-public-api-composition-successor-20261012/manifest.json)
   and [independent review](../tmp/f2-cli-public-api-composition-review-20261012/review.json).
   It changes only cli_gate.rs while preserving the NFT repair and all other
   rows. No earlier installer or composition is activated against2aae3f6a.
   The [current installer](../tmp/f2-current-installer-cli-successor-20261012/manifest.json)
   now has [independent review](../tmp/f2-current-installer-cli-review-20261012/review.json)
   and [root review](../tmp/f2-current-installer-cli-root-review-20261012/review.json).
   Only three installer binding literals change; the writer, backups, process
   ownership and source guards remain unchanged. Its
   [current terminal adapter](../tmp/f2-terminal-closure-cli-successor-20261012/manifest.json),
   with [independent review](../tmp/f2-terminal-closure-cli-review-20261012/review.json),
   binds actual cost run3 and both retained test fixes. The previous failed runs
   cannot satisfy admission. All eleven imports and two renderer contracts are
   pinned before loading. These are source reviews: successful current cost
   execution and fresh owned process-closure observations are still required.
   The [original terminal-closure adapter](../tmp/f2-terminal-closure-adapter-20261012/manifest.json)
   has [root source review](../tmp/f2-terminal-closure-root-review-20261012/review.json)
   after correcting its launchd plist contract. Its real cost-closure path still
   requires completed cost evidence. The [concrete qualification dispatcher](../tmp/f2-qualification-dispatcher-20261012/manifest.json)
   is now sealed at `b35c37c5…`, with [Core review](../tmp/f2-qualification-dispatcher-core-review-20261012/review.json),
   [SDK review](../tmp/f2-dispatcher-sdk-review-20261012/review.json) and
   [root source review](../tmp/f2-qualification-dispatcher-root-review-20261012/review.json).
   All 39 pure controls pass in both independent reviews. Corrections preserve
   distinct certificate/lifecycle/wire validators, raw versus wrapped proof-byte
   accounting, exact ignored-test argument order, raw source observations and
   the current constructor-to-launcher contract. The runner has a separate
   same-source production producer; it requires actual installed source before
   activation. Its 647 planned nodes have zero current native executions. Nine
   jobs need separate cost, authenticated CLI, funded settlement, Torii/browser
   service or four-validator owners and remain explicitly blocked. The runner
   cannot alone complete all qualification gates; no future source identity,
   proof artifact or fixture has been invented. The
   [current dispatcher successor](../tmp/f2-qualification-dispatcher-cli-successor-20261012/manifest.json)
   carries only the three updated composition/schedule bindings, with
   [independent review](../tmp/f2-qualification-dispatcher-cli-review-20261012/review.json)
   and [root review](../tmp/f2-qualification-dispatcher-cli-root-review-20261012/review.json).
   Its other twenty-one runtime files and all execution policies are unchanged.
   Actual [F2 installation](../output/qualification/f2-current-source-install-1/application.json)
   now succeeds:137 originals were backed up before150 writes across111 Native
   and40 app paths. Its fresh [terminal observations](../output/qualification/f2-current-source-install-1-terminal-observations/observations.json)
   establish successful launchd closure and absent baseline/cost processes.
   Actual before/after source observations are2aae3f6a andd49518cb respectively.
   A separate root read checked all151 selected postimages and the complete
   [1,364-leaf source inventory](../tmp/f2-installed-source-observation-20261012/inventory.json).
   [Independent evidence review](../tmp/f2-actual-installation-review-20261012/review.json)
   also verifies every backup/write, the exact inventory projection and retained
   process-closure receipts; it does not substitute for new-source execution.
   No source installation is counted as a compiled or passing native test.
   The actual [production admission](../tmp/f2-production-current-root-activation-1/admission.json)
   and [root review](../tmp/f2-production-current-root-activation-1/root-review.json)
   bind this measured source, complete inventory, current tools and reviewed
   dispatcher. [Bootstrap](../tmp/f2-production-current-root-activation-1/launch-result.json)
   succeeded; the durable six-check owner is running in
   [f2-production-current-1](../output/qualification/f2-production-current-1/report.json).
   Its initial source observation matchesd49518cb. Preserve the warm target
   and frozen source until actual terminal completion; qualification is pending.
   The data-model check now passes in215.25 seconds. Separate read-only
   [codec-policy](../output/qualification/f2-codec-policy-20261012/report.json)
   and [app TypeScript](../output/qualification/f2-app-typecheck-20261012/report.json)
   checks pass on the installed sources. They do not replace fresh native
   exports, runtime browser parity or the remaining production checks.
4. Measure the current Stock/Touring engine, reduce retained prover storage with
   exact commitment and transcript parity, and produce independently verified
   two- and eight-player 5,400-tick proofs. Address Street's separate whole-history
   format and row limits. Retain exact proof size, verification work, proving time
   and peak memory; array-capacity arithmetic is not measured RSS.
5. Close the exact protocol's composed soundness analysis and cryptographic
   review. The retained-source schedule projection and conditional far-branch
   composition below now distinguish original primitive work from ideal
   completion. The new near result bounds false-claim acceptance only under
   explicit complete-semantics, timed-extraction and full-OOD premises; it does
   not bound the earlier all-acceptance near event or the installed verifier.
   Complete and qualify the extension-field AIR/OOD predicates and accepted-input relation, then
   review the full deployed protocol and its instantiation assumptions.
   The rejected profile-rebase action remains unretried; public
   execution proofs are not claimed to provide witness secrecy.
6. Qualify real XOR/NFT funding, dispute recovery and atomic settlement for both
   games, then four-validator restart/partition recovery, supported targets and
   integration into the user's `optimizations` checkout. Open staked admission
   only after all release gates pass.

## Transcript and proof coverage checkpoint — October 12

The [source scheduling audit](../tmp/f2-test-schedule-audit-20261011/REVIEW.md)
found no orphaned test modules, but the old 447-command schedule is incomplete
for the staged F2 source: two selectors were renamed, 130 impacted declarations
are absent, and eight ignored tests are only registered, not executed. Its
[exact target/selector inventory](../tmp/f2-test-schedule-audit-20261011/schedule.json)
must be reconciled with actual compiled registrations after coherent installation.
Source declarations are not passing tests.

The [refreshed schedule audit](../tmp/f2-test-schedule-audit-20261012/manifest.json)
now covers the 110-path composition plus the Street proof-test successor: 389
ordinary and 25 ignored declarations in affected files. Compared with the prior
F2 source set, 17 names are added and 30 bodies change. The old 447 plan omits
165 selectors, including 12 ignored cases. The audit preserves all seven grouped
codec consumers, exact renames, the nine new transcript tests and four genuine
retained-checkpoint proof cases. Its export prerequisites distinguish the
42/157 certificate corpus, 10/60 lifecycle corpus and 43 current-wire vectors.
Actual compiled registrations, fresh exports and execution remain mandatory.

The [corrected concrete schedule successor](../tmp/f2-qualification-schedule-successor-v2-20261012/manifest.json)
now plans 647 command nodes: 601 exact test executions (568 ordinary and 33
ignored), seven builds, 14 listings, seven registration gates, five exports and
13 retained owner operations. All counts are planned; observed compiled
registrations and executions are zero. Original command identities are retained
as lineage while exact removed selectors are replaced; superseded/no-op nodes
are not counted as tests. Sixteen pure controls pass. The preserved initial
draft lacked intermediate source-observation dependencies and hash checks before
reading two pinned inputs, and classified some producer outputs as prerequisites.
The corrected draft checks those inputs before parsing and makes generated proof
and measurement evidence postconditions. Proof consumers and funded settlement
still require their external evidence. The
[independent review](../tmp/f2-qualification-schedule-review-20261012/manifest.json)
reconstructs the schedule, reruns all 16 controls and verifies eight producer
admissions plus rejection of consumers missing external evidence. All three
initial findings are resolved within this source-only scope. The durable runner still
needs to consume this DAG, authenticate external prerequisites, validate the new
exports and reconcile counts by command kind. Its older hard-coded runtime
cannot execute this schedule unchanged.

Stock, Touring and Grid need genuine multi-checkpoint backend proof gates in
addition to their existing arithmetic and record-binding tests. Separate
append-only test drafts now exist for all three in
[`tmp/f2-retained-native-proof-tests-20261012`](../tmp/f2-retained-native-proof-tests-20261012/README.md).
Their [independent source review](../tmp/f2-retained-native-proof-tests-review-20261012/REVIEW.md)
found no blocking API mismatch. A [separate v2 draft](../tmp/f2-retained-native-proof-tests-v2-20261012/manifest.json)
strengthens the Stock/Touring history-verifier assertions to require exact
cryptographic rejection for well-formed forged states; the original reviewed
draft bytes are preserved. The drafts have passed formatting but have not been
installed, compiled or run. The [v2 assertion review](../tmp/f2-retained-native-proof-tests-v2-review-20261012/manifest.json)
confirms that both forged-state fixtures pass structural admission before the
expected cryptographic rejection; it verifies 49 pins and the exact two changes.
Each is intended to generate a real proof,
verifies it through a separate verifier call, and rejects changed interior states,
post-removal substitution at a pre-removal checkpoint, omissions and reordering.
Recomputed public commitments must not make a forged state acceptable. Guarded's
two existing genuine multi-checkpoint tests must also be executed. A separate
[Street proof-test successor](../tmp/f2-street-retained-complete-proof-20261012/manifest.json)
now covers all segments of a 12-motion history with B6/B12 pre-removal checkpoints,
an accepted frontier of 18 and all-forfeit adjudication at B12. It streams genuine
proof frames to artifacts, drops the producer, then constructs an independent
verifier. Omitted final segments, reordered segments, omitted/reversed snapshots
and a coherently re-rooted forged interior checkpoint must reject. Its
[independent source review](../tmp/f2-street-retained-complete-proof-review-20261012/review.json)
caught unsupported reference fields in Norito tuples; the preserved v2 repair
uses owned serializable fields. The combined leaf passes formatting and exact
patch roundtrip. This test is uninstalled, uncompiled and unexecuted; a passing
complete Street proof remains required.

The [corrected linear transcript design](../tmp/f2-linear-transcript-commitment-design-20261012.md)
addresses the [independent review](../tmp/f2-linear-transcript-design-independent-review-20261012.json), which
requires the prepared constructor to enforce alignment, contiguous complete batch
rows, permanent roster/removal rules and bounded geometry itself. Allowed root
queries are eagerly limited to aligned ticks through the accepted frontier, an
optional partial final frontier, and the accepted root; repeated queries only read
cached values. Temporary memory accounting includes nested vector headers and
capacities. These are implementation requirements, not assumptions delegated to
an unchecked caller.

The [12-file model successor](../tmp/f2-linear-transcript-model-20261012-work/manifest.json)
is sealed, with formatting and patch roundtrip checks. Its
[root source review](../tmp/f2-linear-transcript-model-root-review-20261012/review.json)
checks the exact pins and independently enumerates 131,072 maximal-payload
geometries; the largest hash-frame bound is 7,495,041 bytes. That arithmetic
excludes codec traversals, proof work and process RSS. Nine authored native
transcript tests remain uncompiled and unexecuted.

The [SDK/browser successor](../tmp/f2-linear-transcript-sdk-app-20261012-work/manifest.json)
contains 10 SDK and 18 app leaves. Seven synthetic SDK controls, 32
browser-conditioned Node controls, app TypeScript and DOM-only SDK types pass.
Its [native fixture gates](../tmp/f2-linear-transcript-sdk-app-20261012-work/checks/native-fixture-gates.json)
retain failures for the old purpose-2 corpus and missing current-game wire corpus;
neither corpus was fabricated. The native certificate producer now specifies
42 canonical rows, 157 malformed cases and six history commitment preimages.
The lifecycle corpus and 43-vector current-game wire corpus are separate
exports. Fresh generation and parity for each remain required.

The [32-file Core successor](../tmp/f2-linear-transcript-core-20261012/manifest.json)
is sealed. Its [independent review](../tmp/f2-linear-transcript-core-review-20261012/review.json)
found a missing dispute commitment in the Stock statement initializer; the
repair is included, and the failed predecessor is retained. The review verifies
79 file pins, 33 Rust formatting checks and a 32-file patch roundtrip, with no
unresolved actionable source finding. Native compilation and execution remain
required. Composition found one additional type-level defect missed by that
source review: Street's fixed source array declared 48 entries after adding a
49th source. A [separate repair](../tmp/f2-linear-source-array-repair-20261012/manifest.json)
and [independent review](../tmp/f2-linear-source-array-repair-review-20261012/manifest.json)
preserve the original evidence and correct the declaration.

The [complete Native/SDK composition](../tmp/f2-linear-native-composition-20261012/manifest.json)
now contains 110 inventoried paths, including 109 changed paths, the three v2
proof-test appends and that repair. Its source-only checks cover 91 Rust leaves,
14 JavaScript leaves, exact source inventories and patch roundtrip. The
[root lineage check](../tmp/f2-linear-native-composition-root-review-20261012.json)
independently reconstructs all 147 predecessor/successor steps and verifies the
110 installed preimages. It is not installed. Native stays frozen for baseline
and focused cost checks. The later composition below includes the incremental
SDK correction and complete Street proof test.

The [final combined source](../tmp/f2-incremental-final-composition-v2-20261012/manifest.json)
contains 111 native/SDK paths (110 changes, eight new) and 40 app paths (five new).
Both patches pass exact forward/reverse application in fresh scratch checkouts,
including the 438-byte binary settlement fixture; all installed preimages remain
unchanged. The initial text-only composer failed on that binary and is preserved.
Independent reviews verify all predecessor overlaps and exact equality of the
40 app and 19 SDK postimages to the tested staged tree. The five browser bundle
graphs retain 126 pinned inputs. Thirty-one of those inputs are dependency files
from the main Iroha checkout whose counterparts are absent in frozen Native;
installed dependency/runtime parity remains pending. No build or proof result
is inferred from composition. Native and live app files remain unchanged.

A [synthetic Node observation](../tmp/f2-browser-transcript-cost-20261012/observation.json)
found another cost issue: the browser session prepares the entire transcript
each six-tick round. Preparing 900 eight-player batches took 646.97 ms versus the
200 ms input-round interval. This was a single contended observation during
native compilation, not a browser or release benchmark. The separate SDK successor
implements authenticated opaque-owner extension that hashes only appended
events. Its controls cover full-preparation root parity, branch and mutation
isolation, same-boundary removals, failure atomicity and pending/certified owner
separation. The [sealed incremental successor](../tmp/f2-incremental-transcript-sdk-app-20261012-work/manifest.json)
contains six SDK and two app changes. It snapshots validated data before hashing
and only adopts the peer's preview owner after all required checkpoint
signatures. Review found caller-owned array/byte overrides and changing proxy
reads could bypass validation; the repaired boundary reads descriptor values and
copies bytes through intrinsic operations. All 21 SDK controls, 34
browser-conditioned Node controls (the preceding 32 plus two new peer cases),
app TypeScript and DOM-only SDK types pass. The separately executed staged SDK
certificate and current-wire fixture suites retain their actual failures.
Independent review found the app consensus-frontier attempt imported a helper
from frozen Native rather than the staged candidate; that failure does not
qualify the staged app gate. The original source seal and failed attempt are
preserved. A separate
[corrected run](../tmp/f2-incremental-transcript-staged-frontier-evidence-20261012/manifest.json)
now resolves the helper from the staged SDK using the supported root override;
it exits one on the missing staged current-wire fixture. Its
[independent review](../tmp/f2-incremental-transcript-staged-frontier-review-20261012/manifest.json)
checks 32 pins, the actual helper import and failure path. No frontier assertion
ran. The source seal is unchanged and fresh native fixtures remain required.

The [independent SDK review](../tmp/f2-incremental-transcript-sdk-review-20261012/manifest.json)
also passes 1,528 branch comparisons, 6,536 commitment-cut comparisons and 117
malformed-container/proxy controls. These synthetic checks do not substitute for
native/browser parity.

The final paired [synthetic measurement](../tmp/f2-incremental-transcript-sdk-app-20261012-work/checks/performance.json)
shows a 900-row median of 156.505 ms for full preparation versus 0.244 ms per
append, with an append p95 of 8.547 ms. Earlier timings are preserved against
their earlier source pins. These contended Node observations do not qualify real
browser performance. No native transcript format changes for this incremental
API, and genuine native-root parity remains required.

The first-release successor removes flat transcript
purpose 2 and introduces separate seed, batch, removal and root domains 11–14,
using the existing SHA3-384 certificate hash. It does not change execution-proof
cryptographic parameters or satisfy F3. Native codec fixtures, source identities,
resource measurements and genuine proofs must be regenerated and validated only
after the complete successor is installed. No admission or deployment gate opens
from this source work.

## Retained-history integration checkpoint — October 11

The [F2 source composition](../tmp/f2-foundations-composition-20261011/manifest.json)
currently contains 89 native/SDK paths. It is staged, not installed or qualified.
Its immutable checkpoint archive and certified-input retention are connected to
Stock, Touring, Grid and segmented Street state constraints. All 78 changed Rust
files in the latest composition passed formatting, including the reviewed
context and test successors. The formatter checks each explicit changed leaf;
unchanged module files are absent from this source-only overlay. Native
typechecking and actual adversarial tests remain required.

A [Touring shape-validation successor](../tmp/f2-touring-shape-validation-once-20261011/manifest.json)
preserves the old predicates while scanning the replay once per call, then
checking each checkpoint. The [Street context successor](../tmp/f2-street-state-context-reuse-20261011/manifest.json)
reuses the fixed-size certificate context owned by the exact validated history;
it retains per-state root checks and removes repeated whole-record validation.
These are source-level performance improvements, not measured native speedups.
The combined [staged SDK lifecycle and transport checks](../tmp/f2-foundations-composition-20261011/sdk-structural-checks/report.json)
passed all 55 tests. These are structural tests without native proof or finality
evidence. The [frontend migration](../tmp/f2-frontend-retention-20261011/HANDOFF.json)
passed TypeScript, nine multiplayer tests and four browser-conditioned retention
tests executed in Node. Its 900-checkpoint case reads exactly 5,400 frames in one
simulation pass. Public reveal data is retained across reconnects. The later
recovery merge correction is included in the reviewed app composition below.
The [final 32-file app composition](../tmp/f2-app-source-composition-v2-20261011-work/manifest.json)
also preserves the seven-file verification export and updated source catalogs.
Its recovery successor deduplicates commitments and reveals without replacing
older public evidence. Two focused regressions pass, including duplicate
eight-player archives and both 7,200-entry archives with full replay framing
inside the common 16 MiB import/export limit. Root verified all app preimages,
postimages and the ten matching staged SDK leaves. App installation and actual
browser recovery remain pending. The genuine-fixture browser suites still fail
before assertions because the current native fixture export is absent; that
failure is retained.

The current Copy-repaired V4 native run has passed the model, grouped codec and
Core checks and is compiling the prover example. Its source remains frozen until the run closes.
All later checks, fresh fixture exports, genuine proofs, maximum-shape resource
measurements and release review remain open.

## Current execution checkpoint — October 11

The conversation goal remains active and unbounded. Its scope is F0–F8 above;
the following work advances those gates without marking them complete:

- **F0/F1:** production15 was interrupted across a confirmed host reboot at
  source `6868b786…`. The [reboot observation](../tmp/native-production15-reboot-observation-20261007/recovery.json)
  records a boot later than the old process starts, absent supervisor 18945,
  owner 19015 and Core 7720, and an absent launchd service. Its two passed
  checks remain historical evidence; Core's result, owner/supervisor exit and
  reap outcomes, and final source observation are unknown. Original report and
  supervisor state remain unchanged. [Production16 preparation](../tmp/native-production16-reboot-rebind-20261007/review.json)
  preserves all five runner files byte for byte and changes only the seven
  runtime metadata files' output paths and derived pins. All 32 old evidence
  files are unchanged. [Fresh readiness](../tmp/native-production16-readiness-actual-1/application.json)
  observed the same source and verified all 1,352 source pins with no competing
  worktree build. [Bootstrap](../output/qualification/native-foundations-production-16-launchd/actual-bootstrap.json)
  exited zero. The original
  Background plist is retained alongside a derived Standard plist whose only
  change is scheduling. Source-start exited zero at the expected identity. The
  data-model, grouped codec, Core and prover-example checks exited zero and
  were reaped. CLI 23591 failed with exit 101 on two unsupported Norito
  `Value` index assignments; Torii was not reached. Source-final exited zero
  and matches source-start. Supervisor completion records owner 65089 reaped
  with exit 1; current process inspection finds those processes absent and
  launchd reports not running, last exit 1. The [two-file repair](../tmp/native-cli-json-object-repair-20261011/installation.json)
  uses Norito's mutable map API in production and tests. Its source observer
  returned `09077524c94a374b5aaa9277a975c37ce57b939097abf6308793b77518c77079`.
  Focused CLI compilation passed in 268.454 seconds. Test compilation then
  failed on two existing descriptor `json!` macro-expression sites; the source
  remained unchanged and every child was reaped. The [fixture correction](../tmp/native-cli-json-object-repair-20261011-v2/installation.json)
  preserves the exact fields through explicit Norito maps. Its observer returned
  `7a29e6b229cbfe5351728e3551c68cea6f95de5d2e30c21e4ad87a718bddd014`.
  The focused run passed CLI compilation in106.698seconds, all eight finality
  tests (test command207.553seconds), and Torii compilation in547.140seconds.
  Final source remained identical; every command was reaped and the owner exited0.
  [V4 installation](../tmp/native-game-foundations-v4-installation-20261011/installation.json)
  then installed22 reviewed files at source`29520401…`, preserving protected
  relation/crypto files and the latest finality repair. The first model check
  failed its denied missing-`Copy` lint. The fixed-size selection type now derives
  `Copy`; this one-line repair produced `bf80d250…`. A fresh six-target run is
  running on the same warm target. The failed report is retained unchanged. The installed SDK transport tests pass30/30. The warm target is preserved. The 447-command
  suite has not started and requires a genuinely
  successful current build with appropriate fresh prerequisite bindings.
- **F2:** a [focused Stock/Touring source review](../tmp/f2-race-relation-focused-review-20261007/review.json)
  found no new zero-residue counterexample in accepted-control projection,
  canonical collision ordering, inactive/padded carry, or the pre-removal
  checkpoint convention. Its small calendar/contact controls are not native
  proof tests. The subsequent lemmas below address integer division and selected-bank
  completeness at source level; native execution and the full accepted-history
  correction remain explicit obligations. F2 is not complete.
- **F2:** [Stock division and producer bounds](../tmp/f2-stock-division-range-20261007/analysis.md)
  have [root review](../tmp/f2-stock-division-range-root-review-20261007.json).
  The remainder comparison is justified before using its range; reconstruction
  remains below the field modulus, so integer division cannot gain a modular
  alias. All six retained files match the current source inventory. The
  [packed local-stage lemma](../tmp/f2-packed-bank-lemma-20261007/analysis.md)
  also has [root review](../tmp/f2-packed-bank-root-review-20261007.json):
  selected mappings are injective, equations/output reads are preserved, and
  branch flags have Boolean provenance. These are source/model arguments,
  separate from actual Native execution and OOD/security. The
  [Touring S1 induction](../tmp/f2-touring-producer-range-20261007/analysis.md)
  now has [independent source review](../tmp/f2-touring-producer-range-independent-review-20261011.json):
  the quotient-zero range gadget is noncircular, and producer, counterfactual,
  contact-prefix, inactive and padding bounds hold under the stated mapping
  assumptions. [Eight current source files](../tmp/f2-touring-current-source-check-20261011.json)
  match its retained pins. This closes the source-level arithmetic sublemma,
  not native proof tests or F2 as a whole.
- **F2/F5:** [checkpoint chronology review](../tmp/f2-checkpoint-suffix-chronology-review-20261007.json)
  found that a later unanimously signed checkpoint can replace earlier
  cooperative prefixes and pending commitments. Withholding alone cannot do
  this, and existing forced batches/removal anchors remain bound, but unanimous
  replacement does not meet the intended immutability of accepted inputs.
  Preserve prior cooperative checkpoint and pending-commitment anchors in
  bounded generic session state and require the final history to match them.
  The refined design retains state and transcript roots for every superseded
  checkpoint, validates pending openings before replacement, and records the
  accepted payloads plus certified frontier identifier. Forced dispositions
  retain their consensus-owned removal decisions. Old nonce/signature arrays
  need not be duplicated: current-record binding and finalized inclusion
  authenticate their prior validation. Admission storage bounds and prefix
  verification work are being checked before installation. The
  [partial generic validator](../tmp/f2-accepted-history-retention-20261011/status.json)
  and [eight-file prefix-context migration](../tmp/f2-prefix-context-adapter-migration-20261011/manifest.json)
  are staged. [Independent review](../tmp/f2-accepted-history-partial-independent-review-20261011.json)
  found no chronology/liveness defect in the inspected changes and checked
  6,756 abstract lifecycle states, including partial terminal batches. These
  are source/model checks; native tests and complete state-anchor constraints
  remain required. No retention fix is installed.
  The [model/Core stage](../tmp/f2-checkpoint-retention-v2-work/HANDOFF.md)
  now implements cooperative and forced retention plus admission budgets;
  [independent budget review](../tmp/f2-retention-budget-independent-review-20261011.json)
  found no source-sizing defect, while native maximum-shape encoding remains open.
  [Stock](../tmp/f2-stock-checkpoint-states-20261011-work/manifest.json),
  [Touring](../tmp/f2-touring-multicheckpoint-20261011/HANDOFF.md) and
  [Grid](../tmp/f2-grid-multicheckpoint-20261011/manifest.json) staged changes
  bind ordered checkpoint-state lists to all ledger roots and constrain each
  pre-removal boundary. Racing uses one expected-state fixed-column bank;
  the number of checkpoints does not multiply witness columns or constraints.
  Stock snapshot collection uses one replay pass. Full900-checkpoint canonical
  bounds and native arithmetic/proof tests are unexecuted. Guarded/Street traversal,
  source catalogs, owned-byte accounting and coherent SDK/fixture integration
  remain in progress. Source-level regressions and a formatting pass do not
  qualify the relation or its cryptographic security.
  Standalone supplied-record validation also cannot authenticate ledger
  authority: [the authority audit](../tmp/f2-accepted-history-authority-audit-20261007/analysis.md)
  confirms that current-record binding and finalized inclusion are indispensable.
- **F1/F6:** the installed app now requires its bundled
  `cryptographicQualification` for staking, in addition to the selected endpoint,
  profile, network and transaction transport checks. A Torii capability response
  cannot override the current local `false`. Three focused readiness tests and
  TypeScript pass; independent source review found no bypass in staking or
  settlement entrypoints. Wallet pairing and the independently qualified NFT
  marketplace remain separate. Native-dependent chain/inventory tests could not
  initialize because current wire fixtures and matching native bindings are
  unavailable. The wallet browser harness now checks that race actions cannot
  sign or submit in this real unqualified release, while preserving encrypted
  Connect and independently authorized NFT purchase scenarios. Its syntax check
  passes; browser execution remains pending those native prerequisites. No
  qualification override was introduced for testing.
  [Offline verification instructions](finalized-settlement.md) now describe the
  native seven-file contract and fourteen independent expectations, and explicitly
  identify the browser migration as staged rather than installed.
- **F0/F4:** the [focused cost runner](../tmp/native-membership-cost-current-runner-v2-work/manifest.json)
  selects all seven omitted meter tests and derives the current implementation
  identity from source. Independent review reproduced a late-interruption
  reporting defect in v1. The narrow v2 correction has [root source review](../tmp/native-membership-cost-current-runner-v2-root-review-20261007.json)
  and eleven passing controls, including late INT/TERM rejection. Actual
  successful current production build and measured execution remain required. The
  [durable supervisor has independent and root source review](../tmp/native-membership-cost-durable-supervision-v2-root-review-20261007.json),
  with nine source controls and four additional mocked lifecycle joins. Its
  runtime remains unbound and unlaunched. The future launcher uses standard
  scheduling. A narrowly scoped attempt to remove background scheduling from
  then-running build's own processes returned success but established no
  measurable speedup; that experiment did not restart or replace the build. Original
  failed candidates and scheduling observations are preserved.
- **F0/F4:** the [production16 cost-runner successor](../tmp/native-membership-cost-current-runner-v3-work/manifest.json)
  and [supervisor successor](../tmp/native-membership-cost-durable-supervision-v3-work/manifest.json)
  have [root source review](../tmp/native-membership-cost-production16-root-source-review-20261007.json).
  The runner, identity code and renderer are unchanged; only exact prerequisite
  paths, pins and diagnostics select the replacement production run. Eleven
  runner controls and nine supervisor controls pass. No runtime is bound or
  launched, and genuine production16 success remains mandatory. The unchanged
  historical numerical-PID guard can conservatively reject unrelated PID reuse
  after reboot; that requires identity analysis, not a silent bypass.
- **F1/F6:** the [CLI adversarial candidate](../tmp/native-certified-command-boundary-adversaries-v1/manifest.json)
  has [root source review](../tmp/native-certified-command-boundary-adversaries-root-review-20261007.json).
  It exercises independently selected network, outcome, height and revision
  expectations, native height limits and finality-stream trailing bytes using
  genuine Stock/Grid inputs. The candidate is uninstalled and those native
  tests have not run; the broader certified-command obligations remain open.
  Its [canonical-payload successor](../tmp/native-certified-command-semantic-adversaries-v2-work/HANDOFF.md)
  has [root source review](../tmp/native-certified-command-semantic-adversaries-v2-root-review-20261007.json).
  Six additional mutations per genuine profile exercise typed proof/statement
  tampering and source/archive association, with exact carrier or membership
  rejection and positive copied-bundle controls. They do not claim to reach
  deeper proof verification through an invalid signature. Native compilation
  and current genuine fixtures remain required; no selector is added.
- **F6:** the [typed admission candidate](../tmp/native-shipping-typed-pins-fix-v1/REVIEW.md)
  separates native checked Hash and 48-byte game commitments from artifact
  SHA-256 digests. [Root source review](../tmp/native-shipping-typed-pins-root-review-rebinding-20261007.json)
  and seven format tests pass. Genuine current Stock/Grid requests
  remain unavailable, so this is not evidence of successful shipping admission.
- **F6:** the [twelve-file browser candidate](../tmp/f6-browser-settlement-migration-v1-work/HANDOFF.md)
  implements the seven-file export, fourteen independent expectations,
  wallet binding and physically awaited cancellation/publication. Nine unit
  tests, TypeScript and five Chromium OPFS scenarios pass. Their payloads are
  synthetic transport data. The full live-browser test fails before startup
  because current native fixtures are absent. [Independent and root source review](../tmp/f6-browser-settlement-migration-v1-root-review-20261007.json)
  are complete. Coordinated Native/SDK/app installation, real picker testing
  and genuine proof/finality integration remain pending.
- **F3:** the [fixed-candidate analysis](../tmp/f3-fixed-candidate-lift-readonly-20261007/analysis.md)
  tightens the conditional candidate-list bound from fifteen to five and
  establishes pre-challenge candidate coverage under explicit whole-table and
  common-agreement premises. [Root mathematical review](../tmp/f3-fixed-candidate-lift-root-review-20261007.json)
  independently checked the incidence argument and all seven exact geometries.
  The [accepted-far-tuple analysis](../tmp/f3-far-tuple-bound-readonly-20261007/analysis.md)
  now has [independent and root mathematical review](../tmp/f3-far-tuple-bound-root-review-20261007.json).
  Exact rational checks cover fifteen captured Stock/Touring/Grid width/domain
  bounds. They give an error below `2^-160` only for the stated ideal,
  single-interaction subproblem. This is not the security of the installed
  verifier. The [sampler transfer lemma](../tmp/f3-concrete-sampler-transfer-readonly-20261007/analysis.md)
  also has [root mathematical review](../tmp/f3-concrete-sampler-transfer-root-review-20261007.json).
  It handles finite retries, conditional source bias and distinct queries,
  with fifteen independently checked hypothetical-density comparisons. Fresh
  field-valued ideal outputs make rejection sampling unbiased; canonical
  encoding alone does not establish that output law for Poseidon2. The subsequent
  primitive and chronological analyses below address transfer and adaptive
  attempts within explicit conditional models. Complete execution semantics,
  the missing extension-field predicate and deployed composition remain open.
  No native parameter or admission decision changes from these calculations.
- **F3:** the [block-level transcript analysis](../tmp/f3-block-fs-applicability-readonly-20261007/analysis.md)
  gives a conditional timed Merkle-consistency bound and shows why the complete
  query vector must stay one verifier challenge block. Its conditional claims
  have [independent and root mathematical review](../tmp/f3-block-fs-applicability-root-review-20261007.json),
  including a separate 375,000-transcript toy model and exact rational checks.
  The chronological successor below supplies conditional native transcript
  ancestry, completion of abandoned/out-of-order expansions and a total
  oracle-work budget. Every attempted
  nonce/seed block must count, including candidates whose work predicate is
  checked only after inspecting the query vector. Verifier evaluation order
  does not force the prover to use that order. These remain conditional
  ideal-oracle results, with no installed security qualification.
- **F3:** the [chronological transcript successor](../tmp/f3-chronological-block-compiler-readonly-20261007/analysis-v2.md)
  now has [independent mathematical review](../tmp/f3-chronological-block-compiler-v2-independent-review-20261007/review.md)
  and [root review](../tmp/f3-sponge-and-compiler-root-review-20261007.json)
  of its conditional ideal-oracle result. It counts pending input references,
  completes entire challenge blocks, and charges abandoned and out-of-order
  attempts. Its conservative graph bound uses an ex-ante work cap, not a
  favorable realized count. Unanchored requests consume work but have zero
  predictable FRI error charge: outside the graph failure event they cannot
  later enter an accepted path. Current adapter constructors perform hashes;
  recognition instead uses the constructive projection below. This is not a
  claim of a machine-checked implementation of the mathematical recognizer.
- **F3:** the [hash-free schedule projection](../tmp/f3-hash-free-geometry-projection-readonly-20261007/analysis.md)
  has [independent and root source review](../tmp/f3-hash-free-geometry-root-review-20261007.json).
  It resolves the identified constructor dependency for the three retained
  adapters: complete public bytes determine graph packing, fixed columns,
  residue counts and stage order before challenge inspection. The driver adds
  no residues. Grid's four public-hash fields all remain frozen; inner digest
  checks narrow eventual acceptance without selecting another schedule.
  The review corrects the note's Grid source-line shortcut: exclude commitment
  calls at lines 155–164 and retain the pure size check at 165–169. The explicit
  operation list governs. Native execution and machine-checked equivalence
  remain unestablished.
- **F3:** the [additive sponge analysis](../tmp/f3-additive-sponge-reduction-readonly-20261007/analysis.md)
  derives framing and work counts for the captured width-16, rate-8 field sponge
  and a conditional ideal-permutation construction bound. It has
  [independent review](../tmp/f3-additive-sponge-independent-review-20261007/review.md)
  and the root review above, including eighty framing configurations and
  sixty-eight exact finite-product checks. The composition first replaces the original sponge
  experiment, counting direct permutation queries and all absorbed words; only
  then does it complete the ideal transcript. Simulator oracle requests must
  count in the latter budget. The fixed public Poseidon2 algorithm is not thereby
  proved to be a random permutation. This supplies no deployed 128-bit claim,
  completed extension-field predicate, or witness privacy.
- **F3:** the [original-work composition](../tmp/f3-far-work-composition-readonly-20261007/analysis.md)
  has [independent review](../tmp/f3-hash-free-geometry-independent-review-20261007/composition-event-addendum.json)
  and exact rational controls. It bounds original acceptance by an explicit
  far-branch contribution plus `nu_near`, the still-unbounded accepting near
  branch in the augmented ideal experiment. It applies the primitive theorem
  to acceptance before making that ideal partition. The original draft's
  unsupported transport of a far predicate is retained and corrected.
  Work-bounded component estimates do not establish a full attack work factor
  or deployed security; completing the actual AIR/OOD predicate remains required.
- **F3:** the [field foundation](../tmp/f3-fp4-field-foundation-readonly-20261007/analysis.md)
  has [independent review](../tmp/f3-fp4-field-independent-review-20261007/review.json).
  A complete Lucas certificate establishes the Goldilocks prime and generator
  7; tower and polynomial certificates establish the quartic field. A universal
  interval argument covers the retained unsigned reduction formula, while exact
  domain/coset, FFT, fold and terminal-degree controls check its algebraic use.
  Independent controls include 372 reduction boundaries, 84 matrix inverses
  and 1,089 domain pairs both before and after folding. These are retained-source
  mathematical models, not Rust execution or current-source qualification.
  Canonical caller inputs, supported-target arithmetic and the full Fp4 AIR/OOD
  evaluator still require native validation. Interrupted prior analyses and the
  independent review's initial filename lookup error remain preserved.
- **F3:** the [adaptive near-branch analysis](../tmp/f3-near-adaptive-work-readonly-20261007/analysis.md)
  has [independent review](../tmp/f3-near-adaptive-independent-review-20261007.json)
  and [root exact controls](../tmp/f3-near-field-root-exact-controls-20261007.json).
  It compares the same `False(instance) AND Accept` event across the primitive
  hop, then bounds a new `nu_near_false` in the augmented ideal experiment.
  The older all-acceptance `nu_near` remains unbounded and can equal one for
  honest proofs; the new result does not replace that event silently. Under
  complete execution/claim semantics, timed candidate extraction, the reviewed
  block coupling and the mandatory full extension identity, pre-alpha and
  pre-z lists of at most five give local charges `5/p^4` and
  `5(11N/2)/(p^4-1-9N)`. All near and far stages share one injective work budget,
  yielding the conditional false-acceptance envelope
  `min(1, T(T+1)/(2p^8) + 3(262149T)^2/p^6 + T/2^160)`.
  Independent controls cover seven geometries and 20,944 finite-sampler cases.
  This is a hypothetical complete-verifier result: the installed driver lacks
  the full Fp4 AIR/OOD check, complete semantics and concrete Poseidon2
  instantiation remain obligations, and its near false-acceptance term is
  still unbounded. At `T=2^128`, the conditional envelope is below `2^-31`,
  not a `2^-128` failure probability or deployed 128-bit qualification.
- **F5/F7:** the [funded Grid v2 candidate](../tmp/native-grid-funded-settlement-rollback-source-v2-work/manifest.json)
  exercises normal wallet funding, XOR/NFT custody, a genuine proof, signed
  multi-instruction rollback, retry and duplicate settlement. It has not been
  compiled or run. [Independent and root source review](../tmp/native-grid-funded-settlement-rollback-source-v2-root-review-20261007.json)
  confirm exact settled NFT cardinality, an ordinary test that follows the
  real compiled qualification decision and an authoritative asset-domain oracle.
  The original findings and v1 remain retained. No
  qualification flag override, custody seeding or passing skip is permitted.
  Positive funded qualification must wait for a genuinely qualified profile.
  The [current staged-source boundary check](../tmp/f2-funded-qualification-boundary-20261012/manifest.json)
  confirms that the compiled Grid profile still returns unqualified. The funded
  test checks that decision before creating its funded lobby and producing its
  own genuine proof; an external cost or proof receipt cannot replace F3/F8.
- **F1/F5/F6/F7:** the [coordinated source composition v2](../tmp/native-f6-cli-grid-composition-v2-work/manifest.json)
  combines the reviewed transport/SDK, CLI adversaries, zero-stake Grid
  rollback and corrected funded tests in twenty-one proposed writes. Its separate frontend dependency
  remains uninstalled. Patch reconstruction and source conservation checks
  pass. [Root v2 composition review](../tmp/native-f6-cli-grid-composition-v2-root-review-20261007/review.json)
  independently reproduced all twenty-two inventoried postimages and verified
  conservation of unaffected v1 files. Its parent review checked current
  preimages, expected absences, the frontend and all forty-six protected leaves;
  fresh checks remain necessary at installation.
  Installation, current native exports and execution remain pending. The
  installed CLI reference fix is preserved. The [test delta](../tmp/native-f6-cli-grid-composition-v2-work/next-run-test-delta.json)
  requires the new ordinary funding test and retains the genuine positive's
  independent qualification prerequisite. The prover-memory change and rejected
  profile rebase are excluded.
  A [coordinated v3 successor](../tmp/native-game-foundations-source-composition-v3-work/HANDOFF.md)
  now includes that CLI extension and the F8 helper correction below. Seven
  isolated Git commands reproduced all twenty-three inventoried postimages;
  twenty-two writes are proposed. [Independent and root composition review](../tmp/native-game-foundations-source-composition-v3-root-review-20261007.json)
  are complete: both the full patch and sequential component patches reproduce
  all twenty-three postimages. All unaffected v2 files and the separate frontend
  patch are conserved. Installation and runtime qualification remain pending.
- **F8:** retained installed-source evidence confirms that the certified
  four-validator scenario and both dispute/expiry controls are already present.
  The [current-API correction](../tmp/native-game-certified-scenario-current-api-v2-work/manifest.json)
  changes only `to_value(report)` to `to_value(&report)` and has
  [independent and root source review](../tmp/native-game-certified-scenario-current-api-v2-root-review-20261007.json).
  It remains uninstalled pending the next coordinated source integration. The ten ordinary
  `core_api` tests are separate F8 coverage (nine off Unix); the two Core controls
  already belong to the 447 plan. The ignored four-validator scenario still
  requires a genuine run with current binaries. Parsing and source review do
  not establish type compatibility, finality or funded settlement.

The next qualifying outcomes are a successful current production build, the
focused meter run, fresh native fixtures and the complete selected suite. These
unlock meaningful full-race measurements and integration; they do not establish
composed cryptographic security, witness privacy or funded settlement. Preserve
failed evidence, keep live staked admission closed, and leave the previously
rejected cryptographic-profile rebase unapplied.

## Current baseline

Retained baseline and subsequent gates, updated October 5, 2026:

The full reusable-foundations goal remains active. The [V4 source installation](../tmp/native-foundations-install-certified-verifier-prefix-activated-4/application.json)
completed with actual exit zero and [parent wait4/reaping evidence](../tmp/native-certified-verifier-prefix-root-activation-4/installer-terminal.json).
It applied 25 native writes, retained 15 backups, and verified 217 final paths
and 1,352 source pins. The before/after observers report the same Git revision
and a changed source identity, now `8642797e9c9f34124bf01f20f071976be18013c278629d033b0ab351fcacd967`.
The [independent actual-install review and root closure](../tmp/native25-actual-install-root-independent-closure/review.json)
are complete. Fresh stamped builds remain required; the historical `cdae8228…`
build passes do not qualify this source.

The two earlier actual preflights failed before observation, backup or write;
their [retained failure evidence](../tmp/native-certified-verifier-prefix-root-activation-2/failed-preflight-review.json)
is unchanged. Independent review then rejected V3's redirected warm-target
case. V4 requires canonical native and warm-target paths before process
classification and has [closed independent/root source review](../tmp/native-certified-verifier-prefix-executable-v4-root-independent-closure/review.json).
Shared ownership, Cargo-lock checks, unknown-process rejection, source checks
and storage guards remain enforced.

The [V13 runnable qualifier source](../tmp/native-foundations-certified-qualifier-runner-source-proposal-v13-work/manifest.json)
has independent and [root source review](../tmp/native-certified-qualifier-v13-root-source-closure/review.json).
Its 417 ordinary and 21 ignored declarations are projections, with a mandatory
two-segment proof-prefix gate and separately admitted Stock/Grid shipping gate.
All actual source, build and owner bindings remain absent; activation requires
new stamped production receipts and the existing durable owner framework.
The [launcher source findings](../tmp/native-durable-owner-successor-design-blockers/review.json)
led to a reviewed native mode and an explicit owner contract that breaks the
plan/configuration hash dependency. Production12 used separately bound actual
runtime metadata. Native execution must never be labeled synthetic or admitted
through stale command pins.
The concrete owner/qualifier successor preserves the process supervision,
source mutex, native command bodies and all 32 schedules, but independent
review [found one remaining foundation path join](../tmp/native-durable-owner-qualifier-production-independent-review-20261004T162325836850Z/owner-review.json): the contract could select a
different application directory from the qualifier's actual report directory.
The rejected candidate remains unchanged. The [narrow common-validator correction is independently closed](../tmp/native-reviewed-owner-v4-root-source-closure/review.json),
so supervision and qualification reject that mismatch before native work.
[Production12's source review](../tmp/native-foundations-production12-root-independent-source-closure/review.json)
and [actual binding review](../tmp/native-foundations-production12-actual-root-binding-review/review.json)
are closed. Its [actual launch](../tmp/native-foundations-production12-root-launch-1/launch.json)
ran against source `8642797e…` after refreshed source, disk and ownership
admission. Model and model-codec checks exited zero, but Core exited 101 on
malformed JSON construction and an unresolved retained-write-set import. The
prover example, CLI and Torii checks did not run. All five created children
were actually reaped; start/final source identities match. The owner and
supervisor exited one, and [terminal launchd inspection, original process
absence and unload](../tmp/native-foundations-production12-root-terminal-close-2/review.json)
are retained. The [independent failed-run diagnostic and root closure](../tmp/native-production12-failure-root-independent-closure/review.json)
confirm those outcomes. This failed run grants no production or proof qualification.
The [two-file compile repair](../tmp/native-certified-settlement-compile-repair-v1-work/manifest.json)
now has [closed independent/root source review](../tmp/native-certified-settlement-compile-repair-root-independent-closure/review.json).
It changes only nine grouped report expressions and the retained-type import;
all Stock and Grid committed relation sources remain unchanged. The
[actual two-file installation](../tmp/native-certified-settlement-repair-activated-1/application.json)
completed with [parent exit zero and wait4/reaping evidence](../tmp/native-certified-settlement-repair-root-activation-1/installer-terminal.json).
Both observers exited zero, two backups and two writes were retained, and all
217 protected paths and 1,352 source pins were verified. The actual source is now
`47fd4eb9fa29f127573eb9814041560c0cdf0f2f5a20eb06184b582515d024f3`.
The [independent installation review and root closure](../tmp/native-source-delta-actual-root-independent-closure/review.json)
are complete. The freshly stamped production13 run below completed as a failure; the
old 25-write receipt is historical.
The repair composition and installer now have [closed independent/root source
reviews](../tmp/native-source-delta-root-source-closure-v1-work/installer-review.json),
including strict type conservation across all unchanged members. The first production13 binding proposal remains
[source-blocked](../tmp/native-production13-v1-root-blocker-closure/review.json)
because it accepted float copies of integer projection-completion counts. A
narrow [V2 successor](../tmp/native-foundations-production-13-source-v2-work/manifest-final.json)
has [closed independent and root source review](../tmp/native-production13-v2-root-independent-source-closure/review.json).
Its 103 source controls and 33 independent adversaries passed. The
[production13 wiring source review](../tmp/native-production13-wiring-root-source-closure/review.json)
is closed after 35 author and eight independent controls, with the exact five
runtime bodies and six Cargo checks preserved. The
[actual metadata construction](../tmp/native-foundations-production13-root-metadata-1/terminal.json)
exited zero with wait4/reaping evidence. Its new owner contract, stamped plan,
runtime manifest, binding, configuration and admission have
[closed independent and root actual review](../tmp/native-production13-actual-metadata-root-closure/review.json).
At that metadata snapshot, fresh source, ownership and disk readiness were still
required before launch. The actual readiness and launch are recorded below;
the earlier synthetic metadata finding does not establish a proof or payout bypass.
The readiness V1 and V2 candidates remain unexecuted after source review found
removable hash assertions and integer/float or Boolean/integer metadata aliases.
The [narrow V3 source successor](../tmp/native-production13-root-preflight-source-v3-work/manifest.json)
retains the exact guards and replaces the last two comparisons with recursive
type-aware equality. Its 28 source controls and independent adversaries pass;
[independent/root source closure](../tmp/native-production13-preflight-v3-root-source-closure/review.json)
is complete. The [actual readiness attempt](../tmp/native-foundations-production13-root-preflight-1/application.json)
matched the installed source, checked both source inventories and process scope,
then failed solely at the disk floor: 10,217,480,192 bytes available versus
17,179,869,184 required. Its [parent terminal receipt](../tmp/native-foundations-production13-root-readiness-parent-2/terminal.json)
records actual exit one and reaping; the source observer exited zero and was
reaped. Its [independent/root failed-readiness closure](../tmp/native-production13-readiness-failure-root-closure/review.json)
authenticates all six probe reaps and 44 retained raw copy joins. The reported
mutex release is supported by the reviewed finally path and reaped owner.
No Cargo, renderer or launch ran. This failed observation remains retained;
a future attempt needs fresh capacity and a fresh
observation lane, rather than treating the old source/process checks as current.
The separate [qualifier context correction](../tmp/native-foundations-qualifier-root-wiring-source-v1-work/qualifier-source-manifest.json)
now has [independent/root source closure](../tmp/native-qualifier-prior-context-root-source-closure/review.json).
It authenticates the preceding production validator in its own pinned folder
before executing captured, byte-exact reviewed code. The current validator and
all 32 schedules remain unchanged. Its 22 author and three independent controls
pass; retained fixture failures are separate. The [qualifier metadata producer](../tmp/native-foundations-qualifier-root-wiring-source-v1-work/manifest.json)
now has [closed independent and root source review](../tmp/native-qualifier-wiring-root-source-closure/review.json).
Its 75 repeated source controls and eight independent controls pass. Twelve
original helpers, seven runtime files, all 32 schedules and five gates remain
conserved. The producer requires the exact successful production13 receipts,
six named integer disk admissions and separate owner/launch closure. Synthetic
construction tests and pre-build metadata grant no native success. It remains
unactivated and cannot use failed production as its prerequisite.
No prior contract, current native source or profile is relaxed to bypass these gates.

The filesystem again reached ENOSPC during a source-only audit, before Python
could run. Subsequent readings recovered only about half a GiB, allowing small
review seals under a separate source-write guard. They do not satisfy the
unchanged 16 GiB native Cargo floor. No new native readiness, renderer or launch
ran. The next readiness attempt requires a fresh lane and current source,
ownership and capacity checks.

The [V4 readiness successor](../tmp/native-production13-root-preflight-source-v4-work/manifest.json)
now has [closed independent and root source review](../tmp/native-production13-preflight-v4-root-source-closure/review.json).
It changes only the fixed observation folder from lane 1 to lane 2. All eight
function bodies, the complete 28-test file and the owned wrapper remain byte
exact; author and independent source children returned 0, 1 and 0 with actual
wait4/reaping receipts. The [concrete parent3 source](../tmp/native-foundations-production13-root-readiness-parent-3/source-manifest.json)
now has [closed independent and root source review](../tmp/native-production13-readiness-parent3-root-source-closure/review.json).
Only five corresponding fixed literals change; all five helpers and remaining
executable bytes are conserved. Root authenticated 88 unique pins, including
the independent syntax exit zero and default no-arguments exit two with owned
wait4/reaping evidence. Storage recovered first to about 4.4 GiB and then to
100.7 GiB. The [actual parent3/readiness2 attempt](../tmp/native-foundations-production13-root-readiness-parent-3/terminal.json)
now passed exit zero with owned wait4/reaping evidence. It freshly confirmed
source 47fd4eb9…, 217 protected paths, 1,352 source pins and the unchanged
integer 16 GiB floor, observing 107,642,781,696 free bytes. The
[root actual-readiness closure](../tmp/native-production13-readiness2-root-actual-closure/review.json)
authenticates 60 raw and subject pins. Its [independent actual review and root
closure](../tmp/native-production13-readiness2-root-independent-closure/review.json)
are complete, checking 174 unique pins and actual reaping. The unchanged renderer
exited zero and the intended job label was absent at exit 113. The
[concrete dispatch preparation](../tmp/native-foundations-production13-root-launch-1/dispatch-root-preparation.json)
has [closed independent and root review](../tmp/native-production13-dispatch-root-independent-closure/review.json).
A fresh label check again reported absence; actual bootstrap then exited zero
with owned wait4/reaping evidence. The [actual launch receipt](../tmp/native-foundations-production13-root-launch-1/launch.json)
and [point-in-time launchd inspection](../tmp/native-foundations-production13-root-launch-1/job-print-1.receipt.json)
identify supervisor 64043 and owner 64063 under the intended job label.
The runner refreshed its source and admission checks: its source-start child
exited zero and observed the unchanged 47fd4eb9… source. The data-model library
and grouped game-codec compilation checks exited zero and were reaped. Core then
exited 101 on the enforced missing-copy-implementations lint for
CertifiedGameSelectionV1. Its u64, HashOf<BlockHeader> and u64 fields allow Copy;
the missing derive is the sole reported error. The prover example, CLI and
Torii checks did not run. All five created children were reaped; the final source
observer exited zero and matched source47. The owner and supervisor exited one.
The [terminal launchd, original process absence and unload closure](../tmp/native-foundations-production13-root-terminal-close-1/review.json)
retains actual print exit zero, the failed job's last exit one, exact owner and
supervisor absence, unload exit zero and post-unload absence exit113. The
[independent failure/terminal reviews and root closure](../tmp/native-production13-failure-root-independent-closure/review.json)
are complete: terminal integrity checks pass, while the real compiler finding
remains open and retained. The [actual immutable launch review](../tmp/native-production13-launch-independent-review-20261005T005600177616Z/review.json)
establishes bootstrap and its historical running snapshot only. The [one-file,
six-byte derive correction](../tmp/native-certified-selection-copy-repair-source-v1-work/manifest.json)
now has independent source review and root closures for its
[composition](../tmp/native-certified-selection-copy-repair-root-source-review/composition-review.json)
and [installer](../tmp/native-certified-selection-copy-repair-root-source-review/installer-review.json).
All 217 protected paths and 1,352 source members are conserved except that
derive. Two documentary errors remain retained with explicit errata; the full
compiled source lists contain 33 Stock, 38 Touring and 39 Grid members.
The [first actual installation attempt](../tmp/native-certified-selection-copy-repair-root-activation-1/installer-terminal.json)
exited one and was reaped, with a second wait confirming ECHILD. It failed
before locking, probes, observation, backup or mutation because the pinned Node
26.10.0_1 executable no longer exists. Node 26.10.0_2 requires a reviewed current
runtime binding; historical receipts retain their original Node identity.
The [reviewed runtime successor](../tmp/native-certified-selection-copy-repair-source-v2-work/manifest.json)
has [independent source review](../tmp/native-selection-copy-v2-independent-source-review-20261005T020925097322Z/manifest.json)
and [root source closure](../tmp/native-certified-selection-copy-v2-root-source-review/installer-review.json).
Its [actual installation](../tmp/native-certified-selection-copy-repair-activated-2/application.json)
now succeeded with [owned parent reaping and ECHILD](../tmp/native-certified-selection-copy-repair-root-activation-2/installer-terminal.json).
One backup and one write applied the Copy derive; both actual observers exited
zero and report a new source identity, `5dceae5aad77542c815c39ac2ede25dc5993573b010de3320b2b766776225867`.
The [root current-source audit](../tmp/native-selection-copy-v2-root-actual-audit/audit.json)
rechecked all 1,352 named source pins, 217 protected postimages and the backup.
The [independent actual-install review and root closure](../tmp/native-selection-copy-v2-actual-root-independent-closure/review.json)
now authenticate the installed derive and genuine before/after observations.
The [production14 successor](../tmp/native-foundations-production-14-source-v2-work/manifest.json)
has [closed source review](../tmp/native-production14-v2-root-source-closure/review.json).
Its new [actual runtime metadata](../tmp/native-production14-actual-metadata-root-closure/review.json)
was constructed successfully and independently reviewed against the genuine
installation records. The [readiness source](../tmp/native-production14-preflight-root-source-closure/review.json)
is also closed. Fresh [actual readiness](../tmp/native-production14-readiness1-root-actual-closure/review.json)
passed with the same source, 217 protected paths, 1,352 members and 75,227,480,064
bytes free. Its parent, observer and six empty-probe exit-one children were
reaped. The [independent interval review](../tmp/native-production14-readiness1-root-independent-closure/review.json)
and [dispatch review](../tmp/native-production14-dispatch-root-independent-closure/review.json)
are closed. [Actual bootstrap](../tmp/native-foundations-production14-root-launch-1/launch.json)
succeeded after fresh capacity and label-absence checks. The [immutable launch
review](../tmp/native-production14-actual-launch-root-independent-closure/review.json)
is also closed. Source-start, model, model-codec, Core and prover-example checks
exited zero and were reaped. CLI exited 101 on one E0308 error: the descriptor
length is passed by value to Norito's reference-taking JSON function. Torii did
not run. Source-final exited zero and matched `5dceae5a…`; all seven created
children were reaped. The owner exited one, and launchd recorded the supervisor's
exit one. Terminal inspection, exact process absence and unload are retained in
the [failed-run root closure](../tmp/native-production14-terminal-failure-root-independent-closure/review.json).
Independent review found no terminal-integrity issue; the compiler finding
remains open. These compilation checks do not qualify proofs or security.

The [three-byte CLI correction](../tmp/native-cli-json-reference-repair-source-v1-work/manifest.json)
has [closed independent and root source review](../tmp/native-cli-json-reference-root-source-closure/review.json).
It adds a reference around that one argument. All other source rows and the
complete Stock, Touring and Grid committed relation members are conserved.
The guarded installer has [closed independent and root source review](../tmp/native-cli-json-reference-installer-root-source-closure/installer-review.json).
Its [actual installation](../tmp/native-cli-json-reference-repair-activated-1/application.json)
exited zero with the installer reaped. Both observers exited zero: the source
changed from `5dceae5a…` to `6868b786245bcf0308a580fd1ee28fb19c1a8067808edc94cde19dd2cf48e4b3`
at the same revision. One backup and one write are retained. The [root live
audit](../tmp/native-cli-json-reference-actual-install-root-live-audit/review.json)
verified all 217 final paths and 1,352 source members. The [independent actual-install
review and root closure](../tmp/native-cli-json-reference-actual-root-independent-closure/review.json)
are complete, with the canonical twelve- and seventeen-field contracts and
eight actual evidence checks. The [production15 source successor](../tmp/native-foundations-production-15-source-v2-work/manifest.json)
has [closed independent/root source review](../tmp/native-production15-v2-root-source-closure/review.json).
The actual metadata constructor exited zero with its child reaped, and its
[independent/root metadata review](../tmp/native-production15-actual-metadata-root-closure/review.json)
binds the installed source and CLI installation evidence. The
[fresh-readiness source review](../tmp/native-production15-preflight-root-source-closure/review.json)
is also closed. The [actual readiness and dispatch reviews](../tmp/native-foundations-production15-root-launch-1/readiness-dispatch-root-closure.json)
passed. A fresh source/ownership/disk guard and exact absent-label check preceded
the [successful launchd bootstrap](../tmp/native-foundations-production15-root-launch-1/launch.json)
on October 7. Supervisor 18945 and owner 19015 were observed running, and two
checks subsequently passed. A later [confirmed host reboot](../tmp/native-production15-reboot-observation-20261007/recovery.json)
ended those processes without a retained Core, owner or supervisor terminal
result. Their exit codes and reaping are unknown; no final source observation
or successful production prerequisite exists. Production16 metadata is prepared
in a separate lane, preserving the old evidence and warm target; its fresh
readiness and launch remain pending. Bootstrap never qualified compilation,
proofs or parameters.
The [disabled full-suite producer successor](../tmp/native-foundations-qualifier-root-wiring-source-v2-work/manifest.json)
now stages the production14 prerequisite, genuine current installation context
and current Node binding. Its seven runtime bodies and 32 schedules are
conserved. Eight app-only controls and the disabled default passed their
expected zero/one exits with reaping. Its [independent source review and root
closure](../tmp/native-qualifier-production14-producer-v2-root-source-closure/review.json)
are now closed. Future successful build and runtime/authorization bindings
remain null. Actual-readiness evidence concerns only its recorded interval.
The failed production13 and production14 runs do not supply a successful
production prerequisite. The [447-command readiness source](../tmp/native-qualification447-readiness-root-source-closure/review.json)
is independently closed but remains disabled and bound to production14 only.
Both source proposals are retained historical work. The
[production15 producer successor](../tmp/native-qualifier-production15-producer-v3-root-source-closure/review.json)
and [447-command readiness successor](../tmp/native-qualification447-readiness-v2-root-source-closure/review.json)
now have closed source reviews. Each passed eight app-only controls and its
disabled-default check. They preserve the seven runtime bodies and all 32
schedules, reject the retained failed production14 prerequisite, and require
genuine successful production15 evidence before actual qualification metadata
can be created. That run is now incomplete after reboot, so these retained
producers need explicit rebinding to a genuinely successful replacement run;
the interrupted report cannot satisfy their prerequisite. No qualification run
is admitted yet.
The first intended broad run selects the four inherited optional
gates and leaves certified Stock/Grid shipping disabled, for 447 scheduled
commands. The fifth gate requires a separate genuine finalized Stock/Grid
bundle admission; its absence is an open F6/F7 obligation. Neither schedule
selection nor unchanged committed source members establishes current compiled
profile identities or proof compatibility. Fresh binaries and proofs must do
that.
The separate seven-file transport candidate remains uninstalled: [independent
review and root blocker closure](../tmp/native-certified-settlement-transport-root-blocker-closure/review.json)
reproduced late physical sink writes after logical cancellation and
cleanup, including a descriptor referring to deleted files. The [sealed SDK
successor](../tmp/native-certified-game-settlement-export-transport-v2-work/manifest.json)
physically awaits active writes and its one-shot quiescence barrier, rejects the
descriptor callback, and returns unpublished descriptor text only after exact
EOF and completed files. Its [root source review](../tmp/native-certified-settlement-transport-v2-root-source-review/review.json)
checked all 126 sealed payloads and the 19 actual child receipts, including
retained author failures. Thirty cases passed in both browser-bundle and direct
SDK paths; these are the same thirty cases and use synthetic transport data.
The [independent review and root closure](../tmp/native-certified-settlement-transport-v2-root-independent-closure/review.json)
close the reproduced sink race at source level. Seventeen additional independent
physical lifecycle cases passed through both paths, including real filesystem
cleanup; the same cases run twice are not counted as distinct cases. All fifteen
reviewer children were reaped, with one corrected reviewer helper failure retained.
Arbitrary physical sink completion is explicitly unbounded; native exports,
application publication and browser migration remain unimplemented or unqualified.
The nine [signed adversarial test candidates](../tmp/native-certified-settlement-semantic-source-candidate-v2-20261004T155809684983Z/manifest.json)
have a narrow successor correcting one independently identified assertion:
a missing fourth finality frame must return exact `UnexpectedEof`; seven
other pin mutations require their precise intended rejection messages.
The [narrow successor's independent root source review](../tmp/native-certified-settlement-semantic-v2-root-independent-source-review/review.json)
is complete; it has not been compiled or installed.
All ten semantic qualification obligations remain open, especially the genuine
funded positive and associations checked after successful proof verification.

At the historical `cdae8228…` source, all six production11 checks passed and
Focused8 closed failed at the disk guard after 338 Core passes. Those receipts
remain historical evidence; the new source needs fresh qualification.
**Focused7 is interrupted/incomplete**:
its tool handle and recorded owner/child are absent. Cargo stdout reports a
successful Core build, but the owner did not retain its exit/reaping/resource
receipt or continue to tests. Root's fresh reaped full-source observation
confirms unchanged `cdae8228…`; [recovery evidence](../tmp/native-foundations-focused-7-interruption-recovery/recovery.json)
preserves the original report and streams with unknown original exits.
Its reviewed schedule
contains 399 ordinary tests, 18 ignored registrations, seven explicitly executed
ignored tests, and 428 commands. It must produce fresh lifecycle/wire/proof
exports, pass the independent shipping CLI check, measure Tokyo compiler traces,
and generate both standalone and real Game-bound Grid proofs. A running owner
is not a passing gate. Root retains the actual launch in the
[admission record](../tmp/native-foundations-qualification-v10-root-admission/admission.json).
The successor must rerun the complete schedule on the warm target with durable
owner completion; the unreceipted build is not a qualification pass.

October 4 continuation: the same full goal remains active. The latest
[reaped source admission observation](../tmp/native-foundations-focused-8-source-admission/admission-observation.json)
still matches `cdae8228…`, with both warm-target Cargo locks closed and more
than 16 GiB available. Storage recovery preserved all 34 binary content hashes
and report joins while replacing 24 duplicate copies with hardlinks. Its
[actual application](../tmp/retained-artifact-dedup-root-3-work/application-root-3/application.json)
finished below the disk floor and therefore exited one; that historical result
is unchanged. A later [read-only physical-storage investigation](../tmp/retained-artifact-physical-storage-investigation-v1-work/latest-manifest.json)
observed over 40 GiB free after unrelated, unidentified Data allocation fell.
No snapshot, VM file, warm target or native source was deleted.

The durable owner now has actual launchd child reaping and cross-tool survival
evidence, but its first renderer removed the completed service before terminal
exit inspection. That failed closure remains retained. The
[minimal V2 correction](../tmp/native-durable-qualification-owner-v2-work/manifest.json)
removes only `LaunchOnlyOnce`, retains the identical supervisor and unchanged
428-command runner, and passed 24 source/mock controls. Independent review and
the three actual corrected-launcher cases precede the focused8 dispatch; none
of these launcher controls qualifies native proofs. Those cases now have
[actual runtime closure evidence](../tmp/native-durable-owner-root-activation-2/launchd-qualification.json):
zero exit, nonzero exit and termination by signal all preserve the real child
wait4/reaping result, observed terminal launchd exit and successful terminal
unload. The zero-exit child also survived across two tool calls under the same
supervisor identity. The earlier failed launcher observations remain retained.

The first focused8 durable admission then stopped **before configuration,
rendering or bootstrap** because free disk space fell below 16 GiB. Its
[actual admission failure](../tmp/native-foundations-focused-8-root-durable-activation/admission-failure.json)
records the root exit one and about 6.4 GiB available afterward. Both warm-target
Cargo locks and the source-owner lock were available; all three focused8 lanes
remained absent. Do not treat the earlier disk observation as current admission,
or count this as a launched native run. Preserve the warm target and require
fresh source, disk and process checks before the next activation.

Disk later recovered, and a second fresh admission actually launched focused8.
The [actual launch receipt](../tmp/native-foundations-focused-8-root-durable-activation-2/launch.json)
binds the newly reaped full source observation, closed Cargo/source locks,
available disk, exact config and zero/reaped bootstrap. The
[initial live observation](../tmp/native-foundations-focused-8-root-durable-activation-2/initial-live-observation.json)
records supervisor PID45183 with parent1 and runner PID45185 with the exact
supervisor parent/start identity. Its first 29 Core cases passed after a fresh
successful build/artifact admission. The full 428-command native report is
now closed **failed**: all 338 scheduled Core ordinary cases passed, but the
pre-model Cargo guard observed 10,660,003,840 free bytes, below its 16 GiB floor.
No model build, export or explicit proof gate ran. Root's
[failed-run review](../tmp/native-foundations-focused-8-root-terminal-observation-1/failed-run-review.json)
checked all 345 actual child closures, 690 streams and 691 retained output pins;
all three source observations remain `cdae8228…`. The durable supervisor actually
reaped runner45185 with exit one/wait4 status256. Root's
[terminal observation](../tmp/native-foundations-focused-8-root-terminal-observation-1/observation.json)
records launchd's terminal exit one, one run, no process and the absence of both
original process identities. The completed service was then unloaded successfully.
This closes the failed owner; it does not turn partial Core diagnostics into the
full qualification gate. Original focused7 exits remain unknown.

After actual terminal evidence, the next goals are fresh SDK/browser parity
(F6), measured Street compiler reduction and full-race proofs (F2/F4), the
separate Grid shipping-CLI gate (F7), and real four-validator recovery/finality
evidence (F8). The reviewed source-only attribution, CLI and publication
successors remain uninstalled pending the next coherent source admission. The composed
128-bit security obligation (F3) remains open and is required before stakes.

The next source contracts are reviewed, with execution still pending: the
[compiler measurement qualifier](../tmp/native-foundations-qualification-proposal-v11-work/manifest.json)
preserves all 417 previous declarations and adds six arithmetic controls and two
CLI seam registrations. Its 434-command schedule requires the original Tokyo
guards and the new per-operation measurement validator; 105 Python controls and
[independent source checks](../tmp/native-foundations-qualification-proposal-v11-independent-review/review.json)
passed. The [separate Grid CLI owner](../tmp/grid-shipping-cli-owner-source-proposal-v1-work/manifest.json)
retains all 58 gate commands and two native CLI producers; its 52 Python controls,
[independent review](../tmp/grid-shipping-cli-owner-independent-review-v1/review.json)
and [root review](../tmp/grid-shipping-cli-owner-source-proposal-v1-root-review/review.json)
are complete. Both entry points remain disabled until actual installation,
production and full qualification receipts are available for their exact source.

The [certified-dispute source composition](../tmp/native-foundations-certified-dispute-composition-v1-work/manifest.json)
now combines those reviewed candidates with the certified F8 migration and two
Execute dispute/expiry controls. Its 1,557 source controls and 4,622 pin checks
passed; [root review](../tmp/native-foundations-certified-dispute-composition-v1-root-review/review.json)
checked all 208 final paths and 203 live preimages. The
[independent composition review](../tmp/native-foundations-certified-dispute-composition-v1-independent-review-2/review.json)
also passed after repeating the source controls and exact scratch patch roundtrip.
Root checked the real zero/wait4/reaped child receipt and its retained streams.
The union proposes 13 writes, including five new paths, and
preserves all 417 prior test bodies, all fixture catalogue bytes and the Phase A
and F7 postimages. Main source selection projects to 407 ordinary/20 ignored
and 436 commands with all four flags. F8 stays separate at ten ordinary tests,
one ignored four-validator scenario and its original single proof producer.
Comprehensive source coverage is 1,347 pins: 1,330 owner pins plus 17 existing
API/custody dependencies. This is a source projection; no new source identity,
compiled registration, proof, finality or funded payout is admitted.

The next installer remains disabled. Its
[independent source review](../tmp/native-certified-dispute-installer-independent-review-v1-work/review.json)
repeated 79 controls and checked 1,393 pins, but three additional synthetic
probes exposed receipt-validation gaps: duplicate terminal argument blocks,
boolean proof-case counts and numeric values accepted as boolean gates. Root
also found that the proposed validator did not match the actual activation
config's six added input pins or the bootstrap receipt's `unixSeconds` schema.
A separately sealed correction must validate those original receipts without
rewriting them or inventing start/finish times. The predecessor's closed-failure
admission policy must also be explicit. The sealed V2 corrects the receipt gaps
but admits only failures with an actual nonzero child; it cannot represent the
actual pre-child disk-guard failure. The [sealed V3](../tmp/native-foundations-install-certified-dispute-source-proposal-v3-work/manifest.json) admits that
specific closed failure for unqualified source iteration while preserving the
complete expected schedule, exact successful prefix and unexecuted proof gates.
Its [independent review](../tmp/native-certified-dispute-installer-independent-review-v3-work/review.json)
repeated all 104 synthetic controls, checked 121 stable pins, and validated the
original raw closure schemas. Root's [source-review closure](../tmp/native-certified-dispute-installer-v3-root-independent-closure/review.json)
checked the two real zero/wait4/reaped reviewer children and retained streams.
The entry point remains disabled and future owner bindings remain null. The
13-write candidate will be incorporated into the broader next source update;
no installer activation or source installation is admitted by these reviews.

The [certified offline-verification design](../tmp/native-certified-game-cli-design-v1-work/manifest.json)
has [independent review](../tmp/native-certified-game-cli-design-v1-independent-review/review.json)
and [root source closure](../tmp/native-certified-game-cli-design-v1-root-review/review.json).
Its 16 transport-policy controls passed within their synthetic scope. The
[native implementation candidate](../tmp/native-certified-game-verification-v1-work/manifest.json)
is sealed, with [root source review](../tmp/native-certified-game-verification-v1-root-source-review/review.json),
[independent implementation review](../tmp/native-certified-game-verification-independent-review-v1-repeat-3-work/review.json)
and [root independent closure](../tmp/native-certified-game-verification-v1-root-independent-closure/review.json).
The reviewer repeated 567 assertions with five actual zero/wait4/reaped scratch
children and checked 271 stable pins. Two reviewer harness failures are retained.
One first-release `verify-settlement`
format authenticates an earlier complete source record and a later signed
settlement through the same finalized chain, then calls Core's existing
compiled-game verifier. It authenticates the entire certified batch before
selecting the settlement, compares immutable source/archive context, and admits
raw carriers and repeated finality-prefix work against shared remaining bounds.
Complete projection geometry is charged before eager projection. Nested clone
capacities, exporter intermediates and total process RSS remain unqualified.
The source adds a genuine retained Stock-and-Grid shipping-command gate and
explicitly maps the fourteen removed direct-format CLI test obligations. Its
567 source assertions, scratch patch round trip and formatter passed; no native
compilation or proof/finality execution ran. Main selection projects to
408 ordinary/20 ignored before the prefix test below. Future source identity,
compiled IDs, source stamp, emitted binary and owner outcomes remain null.
The independent review found a qualifier gap: the referenced unchanged native
finality/write-set component tests exist, but are absent from the inherited
main selection and separate F8 target. Add their exact selectors to the future
qualifier and retain all pending certified-command continuity, epoch, paired
entry/result, quorum/PoP, envelope, immutable-archive and authentic Stock/Grid
cases. Rehashed outer-header mutations do not close those internal adversarial
obligations. This is a source-composition acceptance with native coverage open.

The [F6 prefix successor](../tmp/native-street-f6-prefix-coverage-source-v2-work/manifest.json)
has [independent review](../tmp/native-street-f6-prefix-independent-review-v2-work/review.json)
and [root source closure](../tmp/native-street-f6-prefix-v2-root-source-closure/review.json).
It adds one ignored native producer that proves two nonfinal spans, then lets
fresh verifiers check prefixes of lengths one and two and reject completion
without the final segment. V2 replaces the mutable goals context with an exact
snapshot and corrects one formatter expansion; V1's actual formatter failure
is preserved. Native execution and the genuine eligible-finisher tie gate
remain open. The [coherent union](../tmp/native-foundations-certified-verifier-prefix-composition-v2-work/manifest.json)
is now sealed, with [root source review](../tmp/native-foundations-certified-verifier-prefix-composition-v2-root-source-review/review.json),
[independent review](../tmp/native-foundations-certified-verifier-prefix-union-independent-review-v1-repeat-3-work/review.json)
and [root independent closure](../tmp/native-foundations-certified-verifier-prefix-composition-v2-root-independent-closure/review.json).
The independent repeat passed 954 assertions and 847 author pin checks;
1,956 selected inputs stayed unchanged. All four scratch Git children and the
Python owner actually exited zero and were wait4-reaped. The union retains
217 paths and proposes 25 writes: 15 replacements and ten new files. It
preserves 403 prior test bodies and explicitly migrates the fourteen retired
CLI obligations. Comprehensive source coverage projects to 1,352 pins:
1,336 owner inputs plus sixteen unchanged API inputs. Its inherited main
selection projects to 408 ordinary/21 ignored, with the separate F8 owner
unchanged. Neither those counts nor inherited command arithmetic constitutes
a runnable qualification schedule. Nine component selectors, ten pending
certified-command cases, and both new ignored native dispatches remain explicit
requirements. The disabled installer successor's [independent review](../tmp/native-certified-verifier-prefix-installer-independent-review-v1-work/review.json)
and [root closure](../tmp/native-certified-verifier-prefix-installer-v1-root-independent-closure/review.json)
passed their source controls. Its [executable successor](../tmp/native-foundations-install-certified-verifier-prefix-executable-source-proposal-v1-work/manifest.json)
adds the existing shared source lock, fresh scoped process/Cargo-holder checks
and a separately calculated 69,205,749-byte source-storage allowance. Root's
[source review](../tmp/native-certified-verifier-prefix-executable-v1-root-source-review/review.json)
preserves all 35 unaffected functions/classes and the original 104 controls;
16 added activation controls passed. The 16 GiB Cargo guard is unchanged.
The [independent executable review](../tmp/native-certified-verifier-prefix-executable-independent-review-v1-work/review.json)
and [root closure](../tmp/native-certified-verifier-prefix-executable-v1-root-independent-closure/review.json)
also passed: three Python controls and their owner exited zero and were
wait4-reaped, and 1,964 selected pins were rechecked. Root explicitly bound the
18 source-review roles and the genuine historical owner outcomes in the
[source-only admission](../tmp/native-certified-verifier-prefix-root-activation-1/binding-review.json).
The [first actual preflight](../tmp/native-certified-verifier-prefix-root-activation-1/failed-preflight-review.json)
then stopped for a present same-UID Cargo process. The installer actually
exited one and was wait4-reaped; native Cargo locks were free and all five
historical PIDs were absent. No source observer, backup or native write ran.
Keep this failure and use a fresh evidence lane for the next attempt; no new
source identity, compilation or proof execution is admitted by this attempt.

The nine omitted component tests subsequently
[passed against the exact retained cdae binary](../tmp/native-component-gap-cdae-diagnostic-1-work/run-1/root-terminal-observation.json),
without a Cargo rebuild. Both source observations remained cdae; all twelve
created children (nine tests, listing and two observers) exited zero and were
wait4-reaped, and all 24 streams were checked. The direct tool observed the
outer exit zero, without a separately retained outer wait4/reaping receipt.
This is a scoped current-source diagnostic. The failed focused8 result is
unchanged, and all nine tests must run again for the compiled successor.

The [V12 qualifier design](../tmp/native-foundations-certified-qualifier-source-proposal-v12-work/manifest.json)
and its [independent review](../tmp/native-foundations-certified-qualifier-independent-source-review-20261004T142033589479Z/review.json)
now explicitly append those nine selectors, retain the fourteen CLI migrations
and project 417 ordinary/21 ignored registrations. All 32 schedules matched
independent derivation; 439/440/447/448 are mechanical command counts only.
The native prefix test is mandatory, and authentic Stock-and-Grid shipping
requires separate admission. Root's [source closure](../tmp/native-foundations-certified-qualifier-v12-root-source-closure/review.json)
retains all ten open semantic cases and requires correction of one inherited
prose exception before runner integration. V12 is a disabled design, with all
actual source/build/profile/binary/trust/owner bindings null. A runnable
successor, current compilation and actual execution remain required.

The [eligible-finisher tie feasibility finding](../tmp/native-street-f6-eligible-tie-feasibility-v2-work/FINDING.md)
also remains open. A valid fixture must drive both eligible cars from the
current canonical genesis through every checkpoint to exactly equal rational
finish times. A timeout tie, scalar comparison or all-forfeit fixture does not
meet that gate. The distance-only lower bound is 2,338 ticks for Tokyo1986;
this is not a reachability or proving-performance result. Before searching
public control tapes, export the current native reference and establish exact
browser/native parity. Historical browser motion and short proofs cannot
substitute for that current evidence.

| Area | Actual state | Evidence |
| --- | --- | --- |
| Native resource/CLI gates | Earlier scoped gates passed under their own source identities. They do not qualify later patches. | [Resource review](../output/qualification/native-verifier-resources-attempt-1-root-review.json), [CLI review](../output/qualification/native-final-cli-sdk-attempt-1-root-review.json) |
| Complete Street execution | Native accepted-history preparation and short segment proofs exist. Street remains unregistered; full-race transport and security are open. | [Native implementation status](native-street-owned-sequence.md) |
| Cost measurement attempt 3 | **Failed**: production, diagnostic and release builds passed; five ordinary tests and the two-car six-motion test exited 0. The outer checker then raised `ValueError: Fresh identity mismatch`; the eight-car case never ran. The reader compared a canonical checked Hash literal with bare hex representing the same bytes. The child observation of 251.55 seconds and 431,865,856 bytes peak RSS covers the entire two-car test, not isolated proving or an admitted benchmark. | [Retained failure report](../output/qualification/native-membership-cost-attempt-3/report.json), [independent audit](../tmp/zk-foundations-evidence-2026-09-28/summary.json) |
| Recovered cost baseline | **Passed within its short-fixture scope**: both two- and eight-car six-tick proofs verify, with identical metered/unmetered bytes and independently checked source identities. Eight cars produced 4,009,410 bytes; the complete child took 1,770.512 seconds and peaked at 2,229,370,880 bytes RSS. A 146.462-second Node test overlap prevents an isolated benchmark claim. | [Terminal report](../output/qualification/native-membership-cost-resume-1/report.json), [independent review](../tmp/native-membership-cost-resume-1-terminal-review/review.md) |
| Full-record binding | **Passed for the retained F1 epochs**: 118 native ordinary tests, genuine short proof and shipping CLI verification, fresh native codecs, 91 SDK source tests, four packed-browser tests and frontend checks. Current F2 changes require new qualification. | [Native gate](../output/qualification/native-record-binding-focused-5/report.json), [SDK4](../output/qualification/native-record-binding-post-sdk-4/report.json), [independent review](../tmp/f1-terminal-independent-review/review.json) |
| Browser source contract | The typed certificate, complete-history and separate economic-result migration is installed. After rebuilding the actual SDK distribution, the production build and 38 protocol/history tests, 14 source-catalog controls and 12 Touring generator controls pass. Staged two-browser dispute recovery also passed. Fresh native 43/7 parity remains pending. | [Post-install gate](../output/qualification/app-current-game-2/summary.json), [Touring gate](../output/qualification/app-touring-catalog-1/report.json) |
| Retained native qualification | **Focused8 closed failed** at source `cdae8228…`: all 338 scheduled Core ordinary tests passed, then the pre-model Cargo disk guard failed before creating a child. No model/export/proof gate ran. All 345 created children exited zero and were reaped; runner exit one and terminal launchd exit one were independently observed. All three source observations agree. Production11's six checks remain their scoped pass. | [Retained focused8 failure](../output/qualification/native-foundations-focused-8/report.json), [failed-run review](../tmp/native-foundations-focused-8-root-terminal-observation-1/failed-run-review.json), [actual terminal observation](../tmp/native-foundations-focused-8-root-terminal-observation-1/observation.json), [production11](../output/qualification/native-foundations-production-11/report.json) |
| Generic certificate primitives | **Passed for source `75caac8c…`**: 38 native tests and exporter; 33 canonical rows, five signed messages and 118 operation-specific negatives. This does not authenticate accepted gameplay or ledger origin. | [Native gate](../output/qualification/generic-certificate-native-2/report.json), [independent review](../tmp/generic-certificate-native-2-independent-review/review.json) |
| Native arithmetic | **Passed for source `448d8188…`**: 142 Core tests and one model test; production checks, exact test selection and unchanged source checks passed. Eleven ignored tests were only registered. No new full-race proof is implied. | [Native gate](../output/qualification/native-arithmetic-ordinary-3/report.json), [actual completion](../output/qualification/native-arithmetic-ordinary-3/completion.json) |
| Eight-client 5,400 ticks | All eight clients reached the same terminal state and certificate checks completed. The gate **failed** at its first screenshot; no full-run captures were retained. This is neither a smooth-gameplay pass nor a native proof. | [Terminal review](../tmp/eight-peer-frontier-cache-full-review-2026-09-26-1/terminal-review.json) |
| Research and security | September research is mapped to candidate experiments. Complete soundness, exact Poseidon parameters, accumulation and remaining narrow commitments are unqualified. | [September review](research/2026-09-26-cryptography-update.md) |
| Certified-settlement installation predecessor | **Installed at its retained epoch** `8642797e…`: 25 exact native writes, 15 retained backups, 217 final paths and 1,352 source pins. Actual installer exit zero and before/after source observers are retained. This integrates the generic certified settlement verifier/CLI, conserved dispute migration and mandatory nonfinal-prefix coverage. No new-source proof, security, profile activation or funded qualification is implied. | [Actual application](../tmp/native-foundations-install-certified-verifier-prefix-activated-4/application.json), [actual parent terminal](../tmp/native-certified-verifier-prefix-root-activation-4/installer-terminal.json), [source composition](../tmp/native-foundations-certified-verifier-prefix-composition-v2-work/manifest.json) |
| Historical CLI correction | **Installed at its retained epoch** `6868b786…`. The installer and observers exited zero; one backup/write and all 217/1,352 source checks are retained. Production14 failed and closed at its earlier source. Its passes and readiness interval do not qualify the new source or grant continuous quiescence. | [Actual CLI installation](../tmp/native-cli-json-reference-repair-activated-1/application.json), [live source audit](../tmp/native-cli-json-reference-actual-install-root-live-audit/review.json), [failed production closure](../tmp/native-production14-terminal-failure-root-independent-closure/review.json) |

The active native worktree is
`/Users/takemiyamakoto/dev/iroha-sora-cars-native` on `codex/sora-cars-native`,
observed HEAD `c000f91384ff1b1d82a3c9e5c3b10f30139763e4`.
The user's destination `/Users/takemiyamakoto/dev/iroha` is on `optimizations`,
observed HEAD `d6f5cad5067482245a99ee6dc7c5cb75d5b73d09`. Both contain ongoing
changes. Integration must preserve those changes and requalify the resulting
source identity; current evidence does not belong to an imagined clean merge.

## Milestones

### F0 — Establish an admitted native baseline

**Status: complete for the declared short baseline. Owner: root native build lane.**

Resolve the actual attempt-3 identity mismatch by tracing the producer,
canonical identity representation and report checker. Preserve the failed run.
Reject genuinely different identities; never substitute historical IDs, weaken
comparison or relabel old receipts. Retain focused positive and negative tests
for any reader fix, then obtain an admitted two-car and eight-car measurement.
If current bounds reject eight cars, record the precise resource rejection and
carry it into F4; do not report a successful eight-car proof.

The corrected reader validates the canonical Hash literal's spelling, checksum
and marker, separately validates diagnostic lowercase hex, and compares decoded
bytes. Nine reader tests passed, including malformed representations and genuine
mismatches; it admitted the retained two-car result without rerunning or
relabeling its proof. The successor runner passed eight lifecycle tests and
independent review. Its final preflight exited 0, checking 4,087 retained/current
inputs. The missing eight-car case completed from the exact retained release
binary, exited 0 and was reaped; the owner also exited 0 and was reaped. Root
strict validation and an independent review checked both cases, all 4,096
referenced files, the 1,156 selected native sources, actual implementation
identity, proof parity and external RSS before the F1 source changes.
The original attempt remains failed. See the
[reader receipt](../tmp/native-membership-cost-identity-recovery-work/terminal-receipt.json),
[runner review](../tmp/zk-foundations-evidence-2026-09-28/resume-review-v2.json)
and [terminal review](../tmp/native-membership-cost-resume-1-terminal-review/review.md).

The two/eight-car proofs occupy 2,794,616 / 4,009,410 bytes. Instrumented bundle
times are 123.151 / 806.147 seconds, and separate bundle verification takes
38.914 / 243.793 seconds. Initial commitments dominate openings in both cases;
the next measured implementation experiment targets that work. Phase times are
nested, not additive. The eight-car run overlapped a 146.462-second UI test, so
these are observed costs, not isolated comparisons or speedup evidence. Six ticks
do not qualify 5,400 ticks, ledger settlement, or security; those remain F3–F8.

**Done when:** source/binary/input/output identities, actual exits, process
closure, same-source metered/unmetered proof and receipt parity, phase costs and
external peak RSS are independently checked. The next architectural choice is
based on measured costs rather than a presumed bottleneck.

### F1 — Bind proofs to the complete current session

**Status: complete for the recorded F1 source epoch; later F2 changes require fresh qualification.**

Integrate the complete-record context, direct wide binding, callers, Touring
canonicality checks, SDK and frontend as a coherent change. Derive the statement
inside native execution from the immutable ledger record. Bind actual compiled
relation data before challenges, and exclude a future carrier block hash and a
changing observation height from computation identity.

Keep the bounded full-record and offline-request limits separate from the
4 MiB proof/ISI envelope limit. Reject missing fields, noncanonical limbs,
oversized objects and obsolete requests before expensive allocation or indexing.
The browser must invalidate stale loaded proofs and describe only the checks it
actually performs; it currently cannot compute the native execution digest.

A [packed-browser successor](../tmp/native-record-binding-packed-browser-v3-work/README.md)
adds direct coverage of the new record/request fixtures and switches game/race
declarations to the existing DOM-only NetworkId leaf. Source review found the
old root-index imports would defeat the intended DOM-only type gate. The patch
is staged with a passing application check; package/type execution awaits the
fresh native corpus. Its fixture SHA must be joined to the native export receipt;
codec agreement alone does not establish native origin or proof authenticity.
The latest source review also corrected a test inventory error: the 26 canonical
cases cover 23 types. The package test now checks the exact ordered type/case
pairs, seven proof-derived rows and nineteen explicitly synthetic rows. Root
reproduced that inventory directly from the seed function; runtime qualification
still awaits the real native export.

The original owner and example-build child are absent, and the tool handle is
gone. A successful Cargo log is not an observed exit/reaping receipt. Recovery
preserves that report and reuses only nine independently validated completed
commands; it reruns the exact example build through the same warm target. Five
admission controls and six successor controls passed. The successor preflight
passed with the unchanged 1,172-source inventory. Its separate report schema
and recovery pins preserve ownership and the unknown original exits; fixture
refresh needs an explicit reader for this schema before installation.

The first successor exited 1 before launching Cargo because free disk space was
below its unchanged 16 GiB threshold. Its cleanup confirms the source inventory
is unchanged. This is an infrastructure admission failure, not a native test
failure. Storage recovery preserves retained evidence and the warm build target.
Copy-on-write deduplication subsequently preserved 1,424 identical snapshot
assets and their metadata, recovering sufficient headroom. The next successor
passed the example build and both tests, then exited 1 during Core test
compilation: the complete request contains a phantom instruction trait object
that is not `RefUnwindSafe`. The malformed-item test now directly asserts the
precise rejection; a panic still fails the unit test automatically. No production
logic changed. A fresh ordinary qualification plan reran the complete
selection on the warm target with the corrected source identity. The recovery
reports and their unknown original exits remain preserved. The new
[ordinary qualification](../output/qualification/native-record-binding-focused-4/report.json)
passed production checks, the codec guard, both model tests, both example
tests, all 91 selected Core tests and five CLI tests. It then failed the CLI
Touring export assertion: the profile source inventory correctly contains 28
files, including accepted-history and complete-record binding, while the test
still expected 26. The actual owner exited 1 and was reaped; 100 of 118 ordinary
tests passed. The [test-only correction](../tmp/native-record-binding-cli-inventory-fix-work/manifest.json)
checks 28 entries and both new source digests without changing production logic
or racing corpus counts. The [fresh ordinary owner](../output/qualification/native-record-binding-focused-5/report.json)
has passed all 118 ordinary tests and its genuine two-player, six-tick proof
export. The proof occupies 1,692,390 bytes; the complete export test took
16.003 seconds. The separately built shipping CLI independently verified the proof in
0.707 seconds; its build took 1,568.207 seconds. All 137 commands passed, and
root observed the owner exit zero and reaped it. The exact report SHA is
`1d14737bbe466cc2af9079c64dee6ddc502733232179f06f38dfa6957de3e75b`.
No previous successful commands substitute for this complete selection.
The first fixture preparation was rejected before export because its reader
expected an absolute predecessor path while the owner retained the canonical
repository-relative spelling of the same pinned file. The failed preparation is
[preserved](../tmp/native-record-binding-fixture-prepare-failure-1/observation.json);
the reviewed V6 reader now accepts only the two exact spellings of that pinned
predecessor. Its 18 controls passed. Native export and standalone validation
then passed, producing a 12,850,773-byte corpus with 26 ordered cases across
23 types: seven proof-derived and nineteen explicitly synthetic. The fresh
corpus and packed-browser source changes were installed in four SDK files.
All five post-install native model tests passed. The first authenticated SDK
attempt failed after compilation: macOS rejected the addon's misaligned Mach-O
string table. A minimal Rust 1.93.1 experiment reproduced the failure with
debug stripping and loaded successfully without stripping. The reviewed fix
sets `strip = "none"` only for `iroha_js_host` in the dev, release and deploy
profiles. Cargo unit graphs differ only in stripping for that package and its
build script; other units and compiled relation source bodies are unchanged.
The SDK retry used a fresh full-source fingerprint and passed native addon
build/loading. It then failed two of 88 source tests: the JavaScript codec emitted
length-prefixed individual bytes for `ExecutionRecordBindingV1`, while the native
derived fixed-byte field is packed. The codec correction must match the fresh
native fixtures and reject alternate encodings; native proofs/fixtures are not
changed to accommodate it. Earlier native/model evidence retains its original
identity. The packed-byte correction now passes all 91 source tests against
unchanged native fixtures. The third SDK attempt passed addon build/loading and
three of four packed-browser tests, then failed the proof-worker test because its
report fixture does not match the native unsigned-integer token contract. The test now uses exact retained native zero-motion and six-motion report
exports, while the unchanged old report is a rejection control. These are
historical JSON transport vectors, not current-source proof or finality evidence.
SDK4 passed all 91 source tests and four packed browser tests, native addon
build/loading, distribution build and the final full-source fingerprint. The
owner exited zero and was reaped. Its report SHA is
`57280438dc91189caa2ca4e3f8a31bb92c1acc090e5596e635817313617a1bcf`.
The failed [third SDK report](../output/qualification/native-record-binding-post-sdk-3/report.json)
remains preserved alongside the [passing SDK4 report](../output/qualification/native-record-binding-post-sdk-4/report.json).
See the [failed SDK attempt](../output/qualification/native-record-binding-post-sdk-1/report.json),
[build fix](../tmp/native-sdk-linkedit-profile-fix-1/application.json),
[SDK retry](../output/qualification/native-record-binding-post-sdk-2/report.json),
[fresh fixture manifest](../output/qualification/native-record-binding-fixtures-1/manifest.json),
[installation](../tmp/native-record-binding-fixture-install-1/application.json)
and [model qualification](../output/qualification/native-record-binding-post-model-1/report.json).

Fresh Stock and Touring browser kernels and parity fixtures are installed from
the retained shipping CLI, including both added source digests. The seven-file
frontend record-binding change is now applied. Normal qualification passed all
51 simulation/kernel tests, 15 chain/context tests and eight UI regression tests
(including the parent), then typechecking, production build and an unchanged
full native source fingerprint. The owner exited zero and was reaped; the
[frontend report](../output/qualification/native-record-binding-frontend-1/report.json)
SHA is `e8997942121ba4ce2a337458d184f892cd83bb8bf043516aafc5d6d24ac55efc`.
The final SDK/native source tree for this epoch is
`1c3fad4bfff09bc584688f721b68b56d00662bcd47f57751d2a05631f6bdb295`.
These gates preserve the separate original Core/CLI proof source identity;
reference exports are not full-race proofs. The next F2 certificate changes
start a new source epoch and do not inherit a current-checkout qualification. See the [kernel installation review](../tmp/native-record-binding-frontend-install-1/kernels-review.json).

**Done when:** Core, CLI, example, model, SDK and browser agree on fresh native
fixtures; genuine proofs reject changed revision, deadlines, pending inputs,
economics, network/session, rules and roster. Rebinding old proof bytes to a new
claimed digest must fail cryptographic verification. Native settlement tests
use the executor's own record. Old source IDs and fixture bytes are not reused.

### F2 — Complete the reusable computation and accepted-input contract

**Status: partial native implementation. Depends on F1.**

Specify the reusable relation interface: canonical input decoder, immutable
parameters, bounded integer operations, genesis, transition, authenticated
lookups, state continuity, terminal result and resource accounting. Keep
SORA CARS physics and geometry in its compiled adapter and generate the browser
fixed-point rules from the same versioned specification.

Cover acceleration, steering, drift, boost, braking, boundaries, canonical
collision order, checkpoints, finish order, ties, inactive slots, padding,
forfeits and environmental interactions included in the selected game rules.
Authenticate every lookup table and read; constrain branch and comparison
witnesses and overflow behavior. Signed false checkpoints must not substitute
for correct computation. Every input/removal must come from accepted history.

The latest [combined certificate/history candidate](../tmp/generic-game-history-fixtures-v2-work/HANDOFF.md)
includes raw SHA3-384 commitments, distinct typed purposes, bounded canonical
input/checkpoint/frontier/challenge messages, cumulative transcript commitments
and opaque adapter-state commitments. Signatures use direct strict Ed25519
verification through the existing uncached admission path. State bytes remain
opaque until the compiled adapter checks its exact state schema and semantics;
a typed structural decode is not accepted-history authentication.

This coherent candidate subsumes the earlier primitive and gameplay patches.
The exact fourteen-file certificate/history candidate is now installed after
F1 completion. Its [native owner](../output/qualification/generic-certificate-native-1/report.json)
first passed both production checks, then stopped before any test build when
free space fell below the unchanged 16 GiB reserve. After byte-preserving
workspace deduplication and additional concurrent space release, the
[second native owner](../output/qualification/generic-certificate-native-2/report.json)
passed all 52 commands on the same warm Cargo target with the pinned Rust toolchain.
The new full-source tree is
`75caac8c26c73fea6411f71d07d7b246bdc8799f180820222d8aa588356bc1b6`.
All 4 crypto and 34 model tests passed, followed by the create-only native exporter.
The generated corpus contains 33 canonical rows, five signed messages, four
history preimages, 118 operation-specific negatives and 37 output files. The
negatives distinguish failed decoding, failed signatures, constructor rejection
and valid canonical claims whose commitments differ. The outer owner exited zero
and was reaped; root verified all 143 retained output pins and unchanged source
states. The report SHA is
`1986503bd370fc6207f4bb9c2c763d052e2c682eae7d2427a38083f0443dbea0`.
The old pre-history
25-row exporter and its receipts retain their original scope. Consensus lifecycle
migration, native/browser agreement and security qualification remain required.

The [lifecycle model successor](../tmp/generic-game-lifecycle-model-v1-work/HANDOFF.md)
adds canonical purpose 4–7 bodies, ledger-derived constructors and wide game
commitments while removing the superseded prehash helpers. Its successor is now
installed with Core, adapter and SDK migrations; current native tests and fresh
fixture parity are still required. The earlier arithmetic composition was installed:
35 remaining writes, preserving all 48 final candidate files, with actual source
`9b8dc70d82c0648f3987e522a27ef8bd9514c2a9b3012893f1a54b7a703c5346`.
It includes the Street integer-stage compiler, variable division, fixed lookups,
packed-range corrections, optional proof columns and GridClaim's reference/AIR.
The reviewed selection covers 143 ordinary native tests, starting with Grid
calendar and proof-size geometry checks. The
[ordinary native owner](../output/qualification/native-arithmetic-ordinary-1/report.json)
failed its first production check on a denied missing-`Copy` lint. No arithmetic
tests ran; the failed owner exited and was reaped. The narrow fixed-size derive
correction is applied to the model state/result and Core transition types. The
source identity at that stage was
`2627fb357489ec0d69fd86f2b15bbf8fc9fa3f9b10fc17208bfea42973d09027`.
The [reviewed retry](../tmp/native-arithmetic-qualification-v4-work/manifest.json)
preserves all 143 ordinary tests and four 16 GiB disk admissions. After storage
recovered and the removed Python 3.14.7 tool pin was updated to 3.14.8, the
[second ordinary owner](../output/qualification/native-arithmetic-ordinary-2/report.json)
started on October 4. Its actual initial source fingerprint matches2627fb;
production compilation stopped with ten visibility errors at the same private
Street compiler boundary. The owner exited1 and was reaped; no arithmetic tests
ran. The applied correction exposes that compiler only to its enclosing
`execution_proofs` module. Its actual source is
`448d81886083810301128040ef631e0c063b807a77ec2d535f06217bfa837b18`;
the [third ordinary run](../output/qualification/native-arithmetic-ordinary-3/report.json)
retains the full test selection and limits. Its production Core and model checks
passed in 128.036 and 380.663 seconds. The Core release test build completed in
2,290.079 seconds, followed by all 142 selected Core tests. The model build took
506.772 seconds and its selected test passed. All 156 owner commands exited zero
and were reaped; all 143 ordinary tests passed. Root checked all 314 output pins,
exact libtest results and matching source observations. The owner exited zero
and was reaped (tool chunk `555645`); report SHA
`b60cc37830947b04fdc3649006e0df4cd550d549cdf28f2c151def630006212c`.
The 11 ignored registrations are not execution evidence. Its future
packed integration must preserve
every range constraint, including non-column operands and overlapping ranges.
Neither source review qualifies a complete simulation proof.

The [native adapter checkpoint](../tmp/generic-game-native-adapters-v1-work/HANDOFF.md)
now separates the arithmetic proof's physical terminal result from its economic
settlement result. A legal dispute can record a forfeit after every car has
physically finished. Settlement must apply the complete authenticated removal
history, preserve its actual ticks, and refund only when all racers forfeit;
rejecting that legal history would strand escrow. Distinct Stock and Touring
settlement types retain both the physical terminal and accepted-input frontier.
The [combined adapter candidate](../tmp/native-adapter-after-arithmetic-v4-work/manifest.json)
includes the public-type-path correction, signature-dispatch source binding,
and adversarial Stock/Touring and shared-history tests. It is installed and
passes the current Core production check. Selected Stock/Touring adversarial
cases passed among focused5's 320 Core tests; its later model build failure
prevents a complete native qualification claim.
Street's equivalent economic projection is installed with a completed scoped
[source review](../tmp/arithmetic-source-reviews-20261004-work/street-economic-v2.md). It preserves
every physical output word and exact finish fraction while applying the selected
record's actual removal ticks to awards; native qualification remains open. The
[Grid consensus bridge](../tmp/grid-claim-consensus-bridge-v1-work/manifest.json)
now has an independently reviewed source candidate: it derives the expected
claim from the complete current record and accepted history before native
verification. Its ten ordinary bridge tests passed in focused5; genuine proof,
settlement and complete-epoch qualification remain pending, with registration
closed. The [browser certificate candidate](../tmp/generic-game-certificate-browser-native-v1-work/manifest.json)
passes 169 source tests against the exact native corpus, plus DOM typing,
browser bundle/VM and packed-package checks. This covers byte codecs and
direct signatures, not wallet authorization, accepted-history validation or
finalized ledger inclusion. The Grid bridge and succeeding browser certificate
code and browser application migration are installed; fresh native parity remains
pending.

**Done when:** a trace/constraint coverage document maps each rule and history
obligation to enforced constraints and negative tests; native/reference/browser
parity passes, including boundary values. Native proof verification consumes
proofs and public claims without rerunning the secret/witness execution graph.

### F3 — Qualify the exact cryptographic composition

**Status: open. Runs alongside F2/F4; final approval depends on their final code.**

Write a versioned security analysis for the exact field arithmetic, commitment
construction, Poseidon instance, transcript, sumcheck, DEEP/FRI/WHIR schedule,
lookup argument, accepted-history binding and any accumulation/final decider.
Account for all rounds, batches, maximum history length, grinding, adaptive
statements, extraction premises and reduction losses.

Resolve the Base/Fp4 mapping and staged-opening obligations. Field cardinality
is not characteristic; coordinate flattening does not preserve relative code
distance for free. Inventory every security-critical marked 255-bit `Hash`
boundary. Directly hashing full record bytes into a wider domain fixes only that
boundary, not remaining narrow commitments or their composed security.

The [bounded framing derivation](../tmp/execution384-framing-root-review/review-v2.md)
and [independent source review](../tmp/execution384-framing-independent-review/review-v2.json)
establish a left inverse for the current pre-permutation domain/message encoding
and its padding. This closes that scoped encoding ambiguity question only;
concrete Poseidon2 security, adaptive Fiat–Shamir and composed soundness remain
open. The separate [Street context candidate](../tmp/native-street-wide-context-work/manifest.json)
directly binds original record/evidence bytes, but is unapplied and its native
tests are unexecuted.

The [October 4 transcript analysis](../tmp/execution-fs-obligation-20261004-work/analysis.md)
identifies the exact next theorem obligation: the current six-coordinate
prehash-and-chain transcript is not the full-state duplex construction in the
cited theorem. A message-prehash collision merges subsequent transcript states;
the appropriate ideal full-output collision denominator is `p^6`. Eight exact
mathematical control groups passed and root independently reproduced the report.
The same analysis proves conditional sampler/exclusion facts and distinguishes
oracle-query budgets from constant-success attack work. These results assume
joint fresh-output uniformity; they do not establish concrete Poseidon2 security
or a false-proof bound. Next map the complete native interactive verifier to
state-restoration security and a hash-chain Fiat–Shamir reduction, including
all adaptive/restored queries and source/accepted-history bindings.

The ensuing source review identified a separate required check in the shared
execution STARK driver: DEEP openings are bound to the low-degree proof, but
the AIR/quotient identity is currently checked only at sampled base-domain
points. The verifier must also check that identity at its extension-field DEEP
point, with fixed-polynomial values derived by the verifier. A defensive source
correction using the existing exact weighted Fp4 evaluator is retained as an
unapplied candidate. The [retained progress note](../progress.md#october-4--core-arithmetic-tests-passed-browser-parity-corrections)
reports that a security-risk filter stopped the subsequent OOD rebase agent.
The [recovered original agent-error records](../output/qualification/f3-agent-error-provenance-20261012/report.json)
state only that the content was flagged for possible cybersecurity risk. They
do not identify a rejected command or specific technical rationale; the detailed
task argument is not available in readable form. This establishes an agent-turn
error, not a command-level approval receipt or a blanket restriction on other
defensive work. That historical task has not been retried or rerouted. The missing
predicate remains open in the installed source. Independent cryptographic review
is a separate explicit release requirement, not the stated reason for that error.
This observation is not a demonstrated complete forged game proof, nor does
adding the missing predicate alone establish the composed security target.

The [September-cutoff completion checklist](../tmp/f3-execution-soundness-completion-checklist-20261004T191150377877Z/report.md)
turns this gap into explicit acceptance obligations: the exact polynomial
relation and chunk stride; complete Fp4 adapter and carry coverage;
verifier-derived fixed interpolants; mandatory acceptance and rejection paths;
actual native qualification; the interactive theorem-to-code map; the precise
Fiat–Shamir/hash composition; and measured resource and release evidence.
It also identifies a documentation error: the claimed execution work-accounting
helper exists only in the privacy substrate. Neither that helper nor conditional
component arithmetic establishes the execution protocol's security exponent.
The checklist is read-only analysis, and no rejected action was retried.

The [conditional AIR/quotient analysis](../tmp/f3-air-quotient-conditional-bound-20261004T194420352704Z/report.md)
has [root review](../tmp/f3-air-quotient-conditional-bound-root-review/review.json).
It derives the complete residue-family degree bound, the actual chunk stride,
and the extension-point exclusion count for all seven supported domain sizes.
Its rejection lemma explicitly assumes fixed polynomials, exact openings,
uniform independent challenges and the missing complete extension predicate.
Strict, inclusive and finite-interpolant degree premises remain distinct;
the current mixed FRI check does not itself establish component extraction.
This closes a conditional algebra sub-obligation, not the installed verifier's
soundness or its 128-bit security target.

The [masked DEEP component analysis](../tmp/f3-deep-component-extraction-source-v2-work/analysis.md)
has [closed independent and root conditional review](../tmp/f3-deep-component-v2-root-review/review.json).
Exact quotient membership of degree at most K-1 implies a correct opening and
original component degree at most K, with K=9N/8. This is an inclusive bound;
honest prover degrees do not impose a stricter malicious-prover bound.
The source actually commits U=H+M, including a FRI mask fixed before batching.
For independent uniform coefficients and fixed component/opening/mask tables,
the exact-membership event is empty or has probability q^-r, where r is the
component-class rank modulo the low-degree subspace. A bad component gives
r>=1. An arbitrary fixed mask is covered; an adaptive mask chosen after the
coefficients is not. The original unmasked source-map omission remains retained
with its finding and is corrected only in this successor.
742,586 exhaustive component cases, 676 fixed-mask offsets and independent
division/affine controls pass with actual owned receipts. These checks do not
establish exact membership from native FRI proximity, whole-table consistency,
commitment extraction, actual challenge/Fiat–Shamir security, the missing full
AIR identity or witness secrecy. All those protocol and release gates remain open.

The [FRI proximity bridge analysis](../tmp/f3-fri-proximity-membership-bridge-readonly-20261005T010455292464Z/analysis-v2.md)
now has [independent and root conditional review](../tmp/f3-fri-proximity-bridge-root-review/review.json).
It maps the actual complete terminal degree check and authenticated sampled
folds. A one-coordinate perturbation can pass that FRI subpredicate when the
136 distinct queries avoid its antipodal pair; this is an exact-membership
obstruction, not a complete native game forgery. Common quotient agreement
conditionally repairs components to degree at most K, and agreement on at
least ceil(sqrt(7)D/6) points bounds the fixed interleaved candidate list by15.
The retained decoding-radius wording is corrected by a root erratum. Actual
affine-generator common agreement, table extraction, adaptive list selection,
AIR transfer, the missing complete extension predicate and Fiat-Shamir
composition remain open; this result grants no installed or 128-bit qualification.

The [affine batching analysis](../tmp/f3-affine-mca-normalization-readonly-20261005T013906234733Z/analysis.md)
has [independent mathematical review](../tmp/f3-affine-mca-normalization-root-independent-review/review.json).
For fixed extracted tables over the same linear code, invertible basis averaging
transfers the paper's universally quantified Powers MCA bound to uniform nonzero
coefficients. Conditioning and normalization then give the ideal affine bound
`min(1, epsilon_P * (1-q^-b)/(1-q^-1))`. This resolves only the generator-law
step. Exact local query/fold correspondence, extracted commitment tables, lists
fixed before the relevant challenges, complete Fp4 OOD AIR verification and the
real Fiat–Shamir/composed security argument remain open. No native numerical
certificate, parameter change, installed security or witness privacy follows.

The [source correspondence](../tmp/f3-interleaved-proximity-source-correspondence-readonly-20261005T020145436765Z/analysis.md)
has [independent conditional review](../tmp/f3-interleaved-proximity-root-independent-review/review.json).
The derived quotient tuple, sampled mask-plus-DEEP equation, binary folds and
complete terminal degree predicate match the paper's interleaved batched FRI
checks under fixed extracted-oracle and ideal-history premises. Native sampling
uses 136 distinct full-domain positions, which can share antipodal paths. For a
fixed accepting set of size a in domain D, the valid query comparison is
`(a)_136/(D)_136 <= (a/D)^136`; paths or pair entries are not extra independent
samples. Exact commitment extraction, field/root qualification, full OOD/AIR,
challenge timing and real Fiat–Shamir/grinding losses remain required before a
composed numerical security claim.

The [finite-list AIR transfer lemma](../tmp/f3-ideal-finite-list-air-transfer-readonly-20261005-work/analysis.md)
has [conditional independent and root mathematical review](../tmp/f3-ideal-finite-list-air-root-review/review.json).
For at most B bad trace candidates fixed before ideal alpha challenges and J
joint trace/chunk candidates fixed before a fresh ideal OOD point, the complete
identity's bad-pair probability is at most `min(1, B/q + J*d/|OOD|)`.
Quotients may depend on alpha, and selection may occur after z, while the
joint family must already be fixed before z. Fifteen joint pairs and fifteen
quotients per each of fifteen traces are different bounds. The installed
protocol still needs to establish those timed families, opening coverage,
complete Fp4 OOD acceptance and the actual challenge laws; post-z FRI repairs
cannot simply be declared pre-z candidates. This advances only the conditional
mathematical obligation and grants no installed or numerical security claim.

**Done when:** a reproducible finite-parameter calculation establishes the stated
at-least-128-bit execution-proof target under explicit assumptions; generated
relation and source identities are actually bound; independent cryptographic
review is recorded and material findings resolved. Correctness tests, paper
citations and wide output alone do not complete this milestone. If private
witness support is introduced, its simulator/hiding proof and leakage statement
become additional mandatory gates.

### F4 — Make complete full-race proofs fit operational bounds

**Status: open. Depends on F0/F2; parameter choices must satisfy F3.**

The [eight-file composition](../tmp/f4-combined-native-source-20261013/manifest.json)
combines five Core lifetime/full-duration changes and three CLI verification
files against the preceding `f6f7798e…` inventory. Its [independent composition
review](../tmp/f4-combined-native-source-independent-review-20261013/review.json)
confirms six exact existing preimages, two declared new CLI paths and unchanged
reviewed postimages. Root authenticated 75 retained pins. The [current Touring
successor](../tmp/f4-combined-native-source-touring-successor-20261012/manifest.json)
rebases the CLI file onto actual `1f54a6fa…`, carrying the count of 40 and both
source-identity checks into its preimage and postimage. The other seven files,
seventeen Core selectors, nine CLI selectors and output contracts are unchanged.
Its [independent review](../tmp/f4-touring-rebase-independent-review-20261012/review.json)
accepted the exact scratch forward/reverse patch checks; root verified 59
package/review pins. These source checks do not execute a full-race proof.
Installation must
check actual absence of the new paths and wait for the current owner to close;
the composition does not predict a future source identity. The earlier
[five-file composition](../tmp/f4-installed-f6-composition-20261013/README.md)
remains retained. Use the `f2` variants; `current` variants target superseded APIs.
The [profile/artifact applicability assessment](../tmp/f4-profile-artifact-applicability-20261013/ASSESSMENT.md)
joins sixteen retained Rust files to the current inventory. The shared driver
change alters Stock, Touring and Grid proof identities; their genuine proofs,
kernel exports and current catalog must be regenerated afterward. Finish the
current-source SDK/browser qualification before installing F4. Codec-only
certificate/lifecycle/wire data retains its original provenance; it does not
become new-source proof evidence. The exact eight-file patch leaves Street's
selected identities unchanged, without carrying over its runtime qualification.
The [single-case successor](../tmp/f4-full-proof-case-selectors-20261013/README.md)
has [independent source review](../tmp/f4-full-proof-case-selectors-independent-review-20261013/review.json).
It preserves every genuine proof/verification body while splitting the full
matrix into twelve exact ignored selectors: Stock/Touring × two/eight racers ×
three tracks. Each case must run in its own process with a fresh four-file
output directory. Two reference selectors and three lifetime-parity selectors
bring the addition to seventeen. A [narrow outcome-artifact successor](../tmp/f4-full-proof-outcome-artifacts-20261013/README.md)
adds the already reference-derived `expected-outcome.nrt` before proving and
the request's observation height in metrics, producing five files per case.
Its patch checks and [independent source review](../tmp/f4-outcome-contract-independent-review-20261013/outcome-review.json)
pass. They are absent from Qualification-3's unchanged 647-node schedule.
The [staged runner](../tmp/f4-runner-integration-20261013/manifest.json) and
[schedule successor](../tmp/f4-two-player-shipping-gate-20261013/manifest.json)
have [independent review](../tmp/f4-runner-integration-independent-review-20261013/review.json).
They preserve those rows and add seventeen Core tests, nine CLI tests and twelve
separate shipping CLI verification children, for 685 nodes. Thirteen isolated
controls pass, including missing-admission and failed-verifier scenarios.
Installation, compiled registration and native execution remain pending.
All six two-car cases must pass both producer and standalone CLI verification
before any eight-car case. The source-resolved review finding added exactly
36 dependency edges to six nodes; the other 679 nodes are unchanged.

Current F2 also changes the resource calculation: both staged AIRs have
`21 + 10 × players` fixed columns, including complete checkpoint state values.
At 5,400 ticks and the existing eightfold LDE expansion, fixed-LDE field payload
alone is 343,932,928 bytes for two cars and 3,388,997,632 bytes for eight cars.
The eight-car base-LDE caps add 12 GiB for Stock or 12.78125 GiB for Touring.
These are separate dense-array payloads, not peak RSS or an admission bound;
trace, quotient, commitment, opening and allocator storage remain additional.
Dropping fixed LDE after composition does not remove its earlier allocation.
The earlier 27/45-column estimates below describe the pre-F2 source only.
The host reports 128 GiB installed RAM; that does not establish available memory
or prove the full benchmark is safe or practical. The [allocation-lifetime
analysis](../tmp/f4-full-duration-resource-lifetimes-20261013/REPORT.md) has
[independent source/arithmetic review](../tmp/f4-full-duration-resource-lifetimes-independent-review-20261013/review.json)
and joins fourteen retained source bodies to this inventory. Eight-car Touring's selected
late-FRI array payload is 20.54–20.68 GiB. Early fixed-LDE release reduces that
checkpoint, but leaves an earlier composition checkpoint at 18.92–19.06 GiB.
These calculations exclude allocator overhead and other objects; they are
neither measured RSS nor a complete process-memory bound. Exact Stock geometry,
actual vector capacities, worker concurrency and individual child measurements
remain required. The source analysis grants no full-race resource admission.
The [first-case resource plan](../tmp/f4-first-two-player-resource-plan-20261013/PLAN.txt)
starts with a complete Stock two-car Neon Tokyo race. Its selected array payload
is about 4.10 GiB at the base-width cap, excluding other allocations; this is
not measured RSS or a process upper bound. Actual source, compiled geometry,
host conditions, binaries and observation budget remain unresolved in the
nonactivatable draft. Root can select the eventual budget under the active goal;
it is not a timeout or authority to signal an active build/prover.

The [five-file output validator](../tmp/f4-full-race-output-contract-20261013/README.md)
is staged with nineteen passing isolated controls and [independent source
review](../tmp/f4-outcome-contract-independent-review-20261013/review.json).
Runner/schedule integration has the scoped review above. It binds each result to the actual
source-derived kernel export, exact track/roster, successful native test receipt
and proof envelope size. It pins opaque Norito files without decoding or
independently verifying their history or proof. The
generic CLI catalog currently includes Stock and Grid; Touring has a kernel
export. The [staged paired CLI commands](../tmp/f4-touring-cli-verification-20261013/HANDOFF.md)
use both adapters' existing complete-history verification APIs with separately
supplied session, expected outcome and observation height. Their [independent
source review](../tmp/f4-cli-history-independent-review-20261013/review.json)
passes. The [test-only successor](../tmp/f4-history-cli-verification-v2-20261013/HANDOFF.md)
has [independent review](../tmp/f4-cli-history-v2-independent-review-20261013/review.json):
seven ordinary boundary tests are unchanged, and two distinct Stock/Touring
genuine-artifact consumers share the complete positive and rejection checks.
Each requires its own admitted case path. Native compilation and
execution remain pending. Actual per-case
independent execution and ledger
authentication remain separate gates. No catalog registration or staked
activation follows from adding that tool.

The [completed two-car diagnostic analysis](../tmp/native-cost-two-car-six-analysis-20261012/analysis.md)
provides actual measurements at the pre-F2 source2aae3f6a:39.58 seconds unmetered,
44.15 seconds metered,12.34 seconds for separate bundle verification, and
432.39 MiB peak resident memory for the entire owned test child. The two
commitment phases account for54.4% of the metered bundle time; nested phase
totals are not added to their children. This single sequential pair informs
WHIR commitment profiling, not a stable instrumentation-overhead estimate,
Stock fixed-LDE savings, full-race scaling or cryptographic qualification.
The completed [two/eight-car comparison](../tmp/native-membership-cost-current-3-analysis-20261012/ANALYSIS.md)
retains the same source and compiled identity for both cases. Eight cars took
355.45 seconds unmetered,377.16 seconds metered and107.90 seconds for separate
verification; the complete proof is4,005,426 bytes and the paired test child's
peak RSS is3.127 GiB. Both complete metered/unmetered wires match exactly.
Commitments consume49.22% of the eight-car metered time, followed by internal
segment verification19.27% and openings10.48%. These six-motion Street cases
use terminal forfeits; they establish neither full-race scalability nor the
eligible-finisher requirement. F2's new source must be qualified separately.

The [current-matching source roadmap](../tmp/native-full-history-practical-roadmap-source-v1-work/ROADMAP.md)
has [root arithmetic and source review](../tmp/native-full-history-practical-roadmap-root-review/review.json).
Stock/Touring schedule `1 + 7p + p(p-1)/2` rows per tick: a 5,400-tick race
uses 131,072 padded rows for two cars and 524,288 for eight, within the current
log19 domain cap. Stock's 384-column and Touring's 409-column caps are separate
from historical measured track widths. Dense eight-car LDE field payloads at
those caps are approximately 12.0 and 12.8 GiB before other retained arrays;
these capacities are not peak RSS or full-proof measurements. The current
bounded transform batches still retain every resulting column. Exact lossless
oracle storage/recomputation is an unimplemented candidate, with mandatory
commitment, transcript, randomness and query parity. Street's separate output
and row obstructions below do not apply to Stock's full-race row count. All
full eligible-finisher proof and settlement acceptance gates remain open.

A [one-statement lifetime candidate](../tmp/f4-fixed-lde-lifetime-source-v1-work-20261005T000425043660Z/manifest.json)
releases the owned fixed-column LDE immediately after successful composition,
before composition trees and later proof phases. Every other driver byte is
conserved. Source-derived fixed field payloads are 216 MiB for two cars and
1,440 MiB for eight; these are not measured RSS reductions, and the
pre-composition peak remains unaffected. The candidate is uninstalled and
uncompiled. The [independent finding and root closure](../tmp/f4-fixed-lde-lifetime-v1-root-finding-closure/review.json)
identify a qualification-plan issue: Stock, Touring and Grid all commit to this
driver through their source inventories. Installation would change the
Stock/Touring profile identities and Grid's compiled relation digest, which is
bound into its statement and proof; unchanged arithmetic and protocol parameters
do not preserve those identities. Same-entropy proof byte comparison must use
both implementations under one freshly compiled adapter and identical statement;
old and regenerated production statements cannot be asserted to produce
identical wires. The original plan and finding are retained. The
[narrow V2 plan correction](../tmp/f4-fixed-lde-lifetime-source-plan-v2-work-20261005T002253613924Z/manifest.json)
now has [closed independent and root source review](../tmp/f4-fixed-lde-lifetime-plan-v2-root-source-closure/review.json).
It conserves the Rust candidate, patch and eight original source/control
payloads; only two original qualification documents change. Root authenticated
142 unique pins and four actual zero/reaped source-control receipts. A minor
copy-list omission is corrected by the retained root HANDOFF erratum.
Native identity regeneration, meaningful parity tests, full-history
measurements and release qualification remain unperformed.

The [October 12 parity candidate](../tmp/f4-fixed-lde-lifetime-parity-20261012/manifest.json)
now implements the previously unregistered lifetime comparison. Its two source
preimages still match the retained current inventory and neither is changed by
F2. A private helper shares one prover body: production releases the fixed LDE
early, while the test variant retains it through self-verification. The authored
ignored test uses identical seeded entropy, compares complete encoded proofs
and every returned randomness request, then verifies both wires independently.
It exercises the existing constant adapter with fixed columns and both auxiliary
modes. [Independent review](../tmp/f4-fixed-lde-lifetime-parity-review-20261012/review.json)
and [root review](../tmp/f4-fixed-lde-lifetime-parity-root-review-20261012.json)
accept this source-only scope; exact patch, source-conservation, formatting and
syntax checks pass. The selector has not been compiled, listed or executed.
This shared-driver test does not replace canonical game comparisons, full-race
proofs, identity regeneration or measured memory savings. The candidate remains
separate from the frozen cost source and the reviewed F2 installation.

The [canonical Grid extension](../tmp/f4-canonical-grid-lifetime-parity-20261012/manifest.json)
and [Stock calibration](../tmp/f4-stock-lifetime-calibration-20261012/manifest.json)
now add those game comparisons in source. A shared test-only helper preserves
the reviewed production prover body. Grid uses its complete 32-turn claim and
8,192-row adapter; Stock uses eight cars and 120 simulated ticks on Neon Tokyo,
Harbor and Sakura, including the complete accepted removal round through tick
126. Each comparison uses one legitimate compiled relation and statement,
compares full canonical proof envelopes and entropy, and independently verifies
both proofs. Stock's terminal all-forfeit calibration is explicitly separate
from the required full-length races with eligible finishers.
[Independent review](../tmp/f4-canonical-lifetime-parity-review-20261012/review.json)
and [root review](../tmp/f4-canonical-lifetime-parity-root-review-20261012.json)
accept the source additions. Patch and syntax checks pass; compiled registration,
actual proof parity, source-identity regeneration and measured memory savings
remain pending. Neither review authorizes treating authored tests as results.
The [four-file composition](../tmp/f4-lifetime-parity-composition-20261012/manifest.json)
retains separate current-source and F2 preconditions, including their distinct
Grid and Stock test prefixes. Its [independent review](../tmp/f4-lifetime-composition-review-20261012/review.json)
and [root review](../tmp/f4-lifetime-composition-root-review-20261012.json)
accept the exact composition without changing the pending F2 installation.
Subsequent full-history fixture work found a current-variant compile defect:
the Stock calibration calls `fixed_row` with three arguments, but the retained
current API requires a fourth checkpoint-tick argument. The F2 variant's
three-argument call is correct. The earlier source reviews missed this call;
they did not include Rust typechecking. The [minimal current-only correction](../tmp/f4-stock-current-checkpoint-argument-repair-20261012/manifest.json)
uses the exact existing producer's checkpoint expression. Its
[independent review](../tmp/f4-stock-current-checkpoint-argument-review-20261012/review.json)
and [root review](../tmp/f4-stock-current-checkpoint-argument-root-review-20261012.json)
confirm that single-call change and preserve the F2 variant. The corrected
current postimage is `d1483df6…`; the earlier `90fab2fa…` must not be installed.
Native typechecking and proof execution remain pending. No affected source was
installed or used by the active cost run.

The [full-duration fixture successor](../tmp/f4-full-duration-finisher-fixtures-20261012/manifest.json)
adds Stock and Touring reference/proof cases for two and eight racers on all
three tracks through5,400 simulated ticks. Each case requires a real eligible
finisher and keeps one active racer until the time limit, without using forfeits
to produce a technical winner. The final accepted-input batch and physical
state are checked explicitly. [Independent source review](../tmp/f4-full-duration-finisher-review-20261012/review.json)
and a [Touring reference supplement](../tmp/f4-full-duration-touring-supplement-review-20261012/review.json)
confirm the retained APIs, speed bound, collision/finish ordering and unchanged
F2 reference bodies. Formatting and patch roundtrips pass. The subsequent
[retained Rust feasibility run](../tmp/f4-reference-fixture-feasibility-20261013/manifest.json)
has [independent review](../tmp/f4-reference-fixture-feasibility-review-20261013/manifest.json):
all twelve reference cases reach 5,400 ticks, preserve an unfinished tail,
produce eligible finishers without DNF, and match full replay exactly. Those
fixtures do not request drift or braking. The integrated accepted-history/AIR
tests and complete native proofs remain uninstalled and unexecuted; reference
feasibility does not supply proof or resource qualification.

Use the measured baseline to select the smallest justified improvement. Compare
accumulation, lookup/factor representation and commitment changes on the same
complete relation and security target. The September research shortlist is input
to those decisions, not a mandate to port every paper.

The first [implementation candidate](../tmp/native-whir-leaf-parallel-v2-work/ASSESSMENT.md)
uses bounded indexed leaf hashing under the same commitment protocol. Its
source/resource review passed; authored native parity tests and measurements
have not run. A separate [diagnostic layer](../tmp/native-whir-commitment-diagnostics-work/HANDOFF.md)
measures basis conversion, coset evaluation, joined leaf hashing and Merkle
parents for each oracle and stage. Its native source review passed; its strict
reader successor passed nine pure controls and independent review. Native
execution and new observations remain pending. Child timings are attribution
within existing aggregate phases, not additional elapsed time.

The [source-derived full-history bound](../tmp/native-full-history-compaction-seam-v2-work/BOUND.md)
identifies a separate format obstruction: at 5,400 ticks, the current Street
component outputs alone occupy 6,177,848 bytes for two cars and 15,250,472 bytes
for eight cars, before proof bytes. Both exceed the 4 MiB ledger envelope. Six
arithmetic controls and the reproducible source/evidence check passed. These
are conditional format bounds, not extrapolated proving measurements. Compact
settlement must prove the complete ordered chain with intermediate outputs in
the witness; optimizing opening bytes alone cannot close this gate. Compare a
direct whole-history trace with a native recursive decider before selecting the
design. The segmented format obstruction does not by itself require recursion.
Either approach needs complete relation, soundness and resource qualification.

The [whole-history comparison](../tmp/native-whole-history-air-alternatives-work/DESIGN.md)
selects a nonrecursive Street AIR experiment first. Stock/Touring already have
that architecture, but embedding every current Street scalar value unchanged
would require at least 3,594 columns under the existing maximum trace geometry,
before lookup auxiliaries. This is a conditional representation bound, not a
lower bound on every implementation. Root reproduced the source-pinned arithmetic.
The next isolated primitive is exact selection from larger immutable tables;
full Street scheduling, range constraints and genuine proof measurements follow.

The [exact fixed-ROM candidate](../tmp/native-fixed-rom-air-v1-work/HANDOFF.md)
now expresses complete immutable tuple selection with Boolean index bits,
constrained split bases and an explicit valid-row mask. Independent and root
source reviews found no remaining scoped blocker. Its nine native ordinary
tests passed in focused5. Tokyo's 1,403 adjacent road tuples require 222 added columns,
224 equations and 23,310 retained terms for one read. This is source accounting,
not measured proving performance: evaluator work across the full domain and
every gated stage must be included before claiming practical full-race costs.
Applying the primitive changes existing source-derived profile identities.

The [complete lowering census](../tmp/street-whole-history-lowering-v1-work/LOWERING.md)
and its [independent review](../tmp/street-whole-history-lowering-v1-source-review/REVIEW.md)
now account for all boundary/motion phases, integer ranges, complete road tuples,
ordered contacts, hazards and state/history continuity. The deliberately redundant
eight-car baseline needs at least 156 rows per tick at an illustrative 8,192-cell
phase budget, before carry; the current log19 geometry allows at most 97/58 for
5,400/9,000 ticks. This rejects that representation, not every direct AIR design.
The frozen Tokyo rules still allow 9,000 ticks; a 5,400-tick prefix does not qualify
its maximum. Next implement and count reusable contact/range kernels, weighted
ROM evaluation and a clean execution driver that omits unused note-copy machinery.
Any absent auxiliary phase must be explicit in commitments, openings and verifier
logic, without dummy columns or changes to the existing privacy proof protocol.
These remain source-derived experiments, not measured savings or native proofs.

The [complete staged-history candidate](../tmp/street-whole-history-air-v1-work/README.md)
now includes cross-stage live-register equations, raw state carried through both
boundary and motion phases, the full input calendar, raw checkpoint and complete
final output constraints, and canonical padding. It predicts exact row/column/
cell/residue geometry before cloning packed graphs and returns that geometry on
admission failure. Its seven ordinary tests passed in focused5; the two
explicit geometry gates did not run in that failed qualification. The installed
implementation also passed production compilation at source `3e10b50d…`.
The public tape and fixed polynomial binding must still be connected
to accepted history and the corrected proof driver; this is not a generated
full-history proof or a measured capacity result.

The [native Tokyo census](../output/qualification/street-staged-census-native-1/report.json)
passed for two and eight players using the completed arithmetic binary. Root
checked its eight original census lines and every algebraic expansion in the
[derived table](../output/qualification/street-staged-census-native-1/derived-census.json).
Two players use 2 boundary and 27 motion stages; eight use 11 and 405. At 5,400
ticks that gives 156,602 and 2,246,411 raw rows, respectively. The eight-player
layout requires at least a log22 domain, exceeding the proposed log19 bound
before considering carry columns. The next optimization must reduce actual
constraint expansion or change the complete proof architecture; raising the
bound alone is not qualification. Each test executed only zero/two-motion
traces; the long-duration counts are algebraic, not actual full-race execution.

The [Phase A measurement candidate](../tmp/street-select-phase-a-attribution-v1-work/manifest.json)
and its [independent review](../tmp/street-select-phase-a-independent-review-v1/review.json)
are now source-reviewed. Three test-only paths add exact source-interval
classification, per-class carry/operation/range costs and a diagnostic digest of
all source obligations. They preserve every constraint and the four Tokyo census
tuples. Six new ordinary controls are authored. The instrumentation is in the
current installed inventory, including the subsequently corrected legal-range
fixture. Its current census execution and actual measurements remain pending;
no eligible count or saving is inferred.

The [nested measurement validator](../tmp/street-select-phase-a-validator-v1-work/manifest.json)
has also passed independent and root source review. It preserves the original
collector and every Tokyo numeric guard, then checks the two Select classes,
all 52 width bins, phase costs, cuts and summary conservation. Twenty-one
synthetic controls passed; historical census files checked only the debug
grammar. A future admitted measurement owner must use both collectors against
actual new native output. Python does not recompute the unexported source-plan
digest or source classification; the pinned native instrumentation owns those
checks. This adds no measured saving or full-race proof evidence.

The source-reviewed V11 qualifier makes this nested measurement contract
mandatory. Its [root review](../tmp/native-foundations-qualification-proposal-v11-root-review/review.json)
and [independent closure](../tmp/native-foundations-qualification-proposal-v11-root-review/independent-closure-check.json)
are retained. Every previous allocation guard and test body remains preserved;
missing or malformed new measurements cannot use a legacy collector fallback.
The native source-plan digest is diagnostic, not a proof commitment. The next
optimization decision must use actual new native measurements, then qualify
the complete relation and operational proof cost.

The current [two-selector census owner](../tmp/street-phase-a-census-q7-independent-review-20261012/review.json)
and its separate [scope assessment](../tmp/street-phase-a-census-q7-independent-review-20261012/assessment-review.json)
have source review. Eleven focused controls passed. Execution requires the
closed current qualification run, its actual compiled Core prerequisites and
fresh resource checks. No current native census result is supplied by these
reviews.

Implement a complete native final decider and authenticate every update, both
commitment banks, segment ordering and state boundary. Pending/opening or folded
objects cannot be converted into verified receipts before final checks pass.
Opening batching that leaves linear outer history is not compact settlement.

**Done when:** genuine two-car and eight-car 5,400-tick proofs verify independently,
including worst legal dispute histories and each released profile's actual maximum
(including 9,000 ticks where the frozen Tokyo profile permits them);
the complete typed settlement payload, replay and framing fit the ledger cap;
worst-case prover time/RSS, proof bytes and validator time/RSS are measured on
declared supported hardware. Freeze concrete admission budgets against validator
block capacity before declaring performance qualified. Include prolonged active
driving/collisions and boundary cases; zero-motion or technical-win fixtures
cannot stand in for full-duration execution. Abort/resource-limit behavior must
also be deterministic and tested.

### F5 — Finish generic consensus settlement and protected assets

**Status: lifecycle pieces exist; complete Street settlement unqualified.**

**Depends on F1/F2/F4; activation additionally requires F3/F8.**

Connect the qualified compiled adapter to generic game creation, entry, start,
checkpoints, disputes, forced commitments/reveals, deadlines, cancellation and
settlement. Freeze profile/rules/roster authorization and declared asset terms.
Use non-signable custody and enforce XOR/NFT liabilities against every generic
transfer, burn, account mutation and unrelated escrow route.

Preserve the latest checkpoint and pending certified inputs through disputes.
Only consensus changes roster eligibility or imposes forfeits. Cover withheld
final signatures, progress through bounded forced rounds, exact ties, sole
survivors and all-forfeit refunds. Active races cannot be refunded just because
someone withholds cooperation. Proof and payout decisions must be atomic;
duplicate settlement/payout cannot succeed. Retained payout liabilities must
remain protected if an authorized transfer cannot yet complete.

The [Execute dispute/expiry regression candidate](../tmp/game-dispute-expiry-adversarial-v1-work/HANDOFF.md)
has passed independent and [root source review](../tmp/game-dispute-expiry-adversarial-v1-root-review/review.json).
Two new ordinary tests submit actual matching input reveals through a retained
certified frontier, and reject expiry across all five active phases while
preserving backed asset liability and NFT custody. All prior test bytes are
preserved except one child-module registration. Custody is explicitly seeded in
the expiry fixture; this does not qualify public funded entry or settlement.
Formatting and patch checks passed; installation, compilation and native test
execution remain pending.

The inspected instruction meter currently charges `250_000 + 5 * proof_bytes`
for verification and settlement. A [bounded current-source observation](../tmp/f5-current-meter-observation-20261012/report.json)
confirmed the formula in `gas.rs` on October 12, without a Native mutation or
whole-worktree identity claim. That source formula is not a calibrated bound
for complete-record traversal or native cryptography. Qualify a schedule against
the final compiled profiles' worst legal state/history/proof work and validator
block capacity, including rejection paths. Keep metering and allocation bounds
distinct from measured process RSS and wall time.

The [two-file Grid timing candidate](../tmp/f5-grid-settlement-timing-instrumentation-20261012/manifest.json)
instruments the existing signed zero-stake and funded fixtures. It separates
proving, warm standalone verification, transaction rollback, successful
settlement and duplicate rejection. Transaction construction stays outside
transaction timers, and the funded profile gate remains intact. Formatting
checks and [independent source review](../tmp/f5-grid-settlement-timing-instrumentation-independent-review-20261012/review.json)
passed; installation, native compilation and actual measurements remain
pending. All 226 existing assertions are preserved. These small warm samples
will not establish a worst-case fee schedule.

The [reviewed settlement preflight candidate](../tmp/game-settlement-preflight-v1-work/manifest.json)
rejects empty, oversized, wrongly versioned and cross-network/session envelopes
before cloning the retained record or hashing its context. It preserves every
later authoritative check and the existing limits. Four ordinary regressions
are installed at `cdae8228…` after independent source review; their native
execution is pending. Their empty-custody fixtures establish rejection order
and absence of new side effects, not preservation of funded reserves. Worst-case
state-aware metering and genuine funded proof settlement remain required.

One immediate atomicity regression must use a genuine short Grid proof in a
signed transaction containing a valid settlement followed by its duplicate.
The second instruction must fail and roll back the proof receipt, session,
events and sequence without manually reverting an instruction overlay. Retrying
the same sequence with one settlement must succeed exactly once. Existing
direct-Execute success and claim-only rollback tests do not cover this seam.
The [V2 candidate source review](../tmp/native-grid-rollback-v2-source-review-20261007.json)
confirms that the signed-transaction regression also snapshots both asset-definition
indexes after rollback, successful retry and duplicate rejection. This fixes
the retained V1 review finding. The regression is present in the current
installed inventory. Current native compilation, signed-envelope admission
and execution with a genuine proof remain pending.
This zero-stake regression does not qualify funded XOR/NFT settlement.

**Done when:** actual generic ISIs produce, verify and settle the complete proof
from current state, persist identical roots across restart and reject all
specified custody/history attacks. A standalone public bundle or synthetic
funding record is insufficient evidence.

### F6 — Deliver usable native and browser tooling

**Status: current native fixtures published and exact SDK test correction installed; fresh CLI/app generation running, SDK/browser consumer qualification pending. Depends on F1/F2/F4.**

Deliver a generic typed computation/profile API, CLI prover/verifier and bounded
self-hostable worker. Application-specific payload builders may exist, but
other games must not route through racing-only fields or commands. Workers use
public replay/source data and never custody keys.

Complete registry/allowlist/codecs and native-to-browser shared vectors.
Validate Iroha Connect's locally constructed canonical transactions, local
signatures, network binding and wallet-approved fee caps. Export proof and
finalized inclusion bundles for verification against a pinned trust context.
Keep endpoint-reported state distinct from independently authenticated results.
The October 5 source inspection confirms that `src/chain/finality.ts`,
`src/ui/live.ts`, `tests/finality.test.ts` and
`scripts/test-finality-browser.mjs` still produce the retired JSON
settlement-bundle/index and incomplete verifier arguments. This is an actual
frontend migration obligation, not merely a stale browser test. The installed
native CLI now requires the seven `.nrt` file roles and independently supplied
source/settled heights, hashes, revisions and native source identity. Migrate
these consumers together and exercise their real browser file writes using
fresh native exports. Torii's existing replay export service is a distinct
API; do not assume it supplies the new certified settlement transport or
invent an endpoint in browser mocks. A download remains unverified until the
native proof and finality verifier accepts it against independent pins.
The [actionable browser migration map](../tmp/f6-browser-seven-file-migration-source-map-20261004T210121292288Z/migration-map.md)
has [closed independent and root source review](../tmp/f6-migration-map-root-source-review/review.json),
with 28 repeated author assertions and fourteen independent assertions passing.
It covers all fourteen independent CLI origins and the concrete app/test changes.
The installed SDK lacks `@iroha/iroha-js/game-settlement`; an actual Node
resolution-only check returns `ERR_PACKAGE_PATH_NOT_EXPORTED`. The reviewed
transport supplies that API in uninstalled source. Coherent SDK/native staging
must precede importing it into the app. Private output ownership, cancellation,
atomic descriptor publication and physical cleanup remain separate app gates;
the SDK returns unpublished files after quiescence. No browser, native binary,
authenticated ledger or funded settlement qualification follows from this map.
The current public Torii path requires signature-bound `QueuePlanSynced`
admission. Wallet, CLI and integration flows must use that real certified
execution corridor and authenticate its actual result carrier; ordinary local
test-world execution does not qualify public submission.

The [typed browser certificate candidate](../tmp/generic-game-certificate-browser-native-v1-work/manifest.json)
uses raw SHA3-384 and direct strict Ed25519 with closed canonical Norito body
codecs. It reproduces all 33 canonical native rows and five native signatures;
169 tests, DOM-only types, a browser bundle/VM and packed subpath checks passed.
Its classification preserves 104 operation rejections, 12 valid canonical claims
with changed commitments and two native allocation-only vectors that are not
browser rejections. The independent source review found no scoped blocker.
The primitive candidate is now installed alongside the lifecycle successor below.
Wallet purposes 107–109, resource-content purpose 10 and actual mesh/wallet
migration remain outside those candidates. Codec/signature parity establishes
neither authorized accepted history nor ledger finality.

The [lifecycle successor](../tmp/generic-game-certificate-lifecycle-browser-v1-work/HANDOFF.md)
adds typed purposes 4–7 and 106, a native exporter and dedicated browser tests.
Its 187 source tests and scoped package controls passed, but independent review
found two acceptance mismatches: NFT names lacked native UTF-8 length/control
restrictions, and admission counted account display characters instead of UTF-8
bytes. The [corrective successor](../tmp/generic-game-certificate-identity-bounds-v2-work/manifest.json)
passed 191 source tests and scoped DOM/bundle controls, then was installed with
the lifecycle candidate. The native
lifecycle exporter has not run; no lifecycle native/browser parity is claimed.
The old generic instruction corpus also requires a fresh native export and
coherent codec migration; it must not be silently skipped or treated as current.
The [current-wire source candidate](../tmp/native-current-game-codec-v1-work/HANDOFF.md)
constructs 43 native vectors covering all 14 instruction archives. Root reviewed
its exact preimages and provenance boundaries. It is installed; focused5
failed during model library test compilation before the grouped codec harness
and exports could run. Export/parity remain pending. The compact NFT text-length
correction is installed with 193 browser source tests passing. Current typed SDK
code and mandatory instruction archive gates are also installed. The 41-file
application closure is installed with staged two-browser recovery passing.
After correcting stale generated SDK distribution files, the post-install build
and all 64 focused protocol/history/catalog tests pass. Actual lifecycle,
current-wire and fresh-proof native corpora must pass the browser consumers
before this milestone is complete.

The application's old standalone accepted-history driver still imports retired
world/native copies and an old model facade. Its assertions must migrate to the
canonical Core path before those copies are removed. Focused5 passed the 23
migrated structural/cap tests and nine generic accepted-segment tests. Driver
and finalized-association successors are installed at `cdae8228…` with native
qualification pending; exact Street ties,
a nonempty verified prefix missing its final segment, and the separate
false-checkpoint arithmetic-proof crosscheck remain open. The reviewed F6 V2
prefix candidate above addresses the missing-final test in source only; its
actual ignored producer still has to execute against the next admitted source.
An exact eligible-finisher tie needs a complete physical history, rather than
another scalar comparator or short all-forfeit fixture. The browser
generation catalogs now match the exact ordered native Stock/Touring source
entries; 14 catalog and 12 generator controls pass. Fresh source-derived
profile/kernel export and parity remain explicit F6 gates. Focused6's model
build passed, but its lifecycle exporter failed before any fresh corpus was
admitted. Consumer
admission still requires a complete passing native successor and its actual
source-bound exports and CLI; the fifteen-command consumer design is unbound.

The [consumer executor V2 proposal](../tmp/native-consumer-executor-proposal-v2-work/manifest.json)
remains unable to launch. Its staged profile and rules now match the actual
admitted native descriptor directly, including coherently altered artifacts
whose own file hashes agree. All 33 synthetic controls passed. Actual native
qualification, preparation receipts and a reviewed executable successor remain
required. Regeneration stages three artifacts and stops for a separate reviewed
installation and new baseline before later parity checks.

The local replay wrapper now passes the mandatory `--request-kind race-v1` to
the generic shipping CLI. Root installed the exact reviewed one-line change,
retained its beforeimage and observed the Node syntax check exit zero/reaped.
This separate script is outside the frozen native source and the existing
293-file consumer baseline; it grants no proof or fixture parity. See the
[installation receipt](../tmp/grid-cli-app-request-kind-install-1/application.json).

**Done when:** native and packed browser SDK round trips pass for success and
malformed inputs; worker cancellation/limits and untrusted inputs are tested;
a second independently invoked native verifier checks fresh proof/finality
exports. No runtime CDN, replay authority or hosted proving service is required.

### F7 — Demonstrate reuse with a second game

**Status: reference/AIR ordinary tests and ten bridge tests passed in their recorded epochs; genuine proof and consensus settlement qualification remain pending. Depends on F2/F5/F6.**

Use a small deterministic two-player grid strategy game, `GridClaimV1`, as the
independent adapter fixture: a fixed bounded grid, at most 32 turns, bounded
energy, legal move/claim controls, explicit contested-cell resolution, scores
and ties. The [selected rules](grid-claim-v1.md) define simultaneous actions,
state-dependent unavailable-action no-ops and exact removal boundaries. A
[native reference candidate](../tmp/grid-claim-reference-v1-work/HANDOFF.md)
has 26 authored tests and a completed [root source review](../tmp/grid-claim-reference-root-review/review.json);
it is installed and its ordinary tests passed in source `448d8188…`. The
registry adapter is now installed, with funded admission still disabled. Prove legal turns, terminal
wins/draws, rejection of claimed illegal movement,
input authorization and forfeit settlement through the same profile registry,
Game ISIs, proof worker, codecs and verifier. Keep the selected rules fixed
through proof and consensus qualification.

The [arithmetic candidate](../tmp/grid-claim-arithmetic-v1-work/ARITHMETIC.md)
adds a complete fixed 64-row transition graph, state carries, pre-removal
checkpoints, terminal results and constrained padding. Thirteen tests are
authored, including a 600,000-case differential sweep, and passed in the retained
arithmetic gate. Measured graph geometry is 64 AIR rows, 1,257 trace columns,
71 fixed columns and 1,466 residues at degree four. The padded proof geometry
uses 8,192 rows with a 3,564,112-byte STARK upper bound; this is not a measured
proof size. The native proof adapter is installed; its genuine-proof test has
not executed. The [reviewed consensus bridge](../tmp/grid-claim-consensus-bridge-v1-work/manifest.json)
is installed with a direct complete-record binding; its ten ordinary tests
passed in focused5. Genuine Grid proof generation, registry, Game ISI, worker
and settlement integration remain open.
Its [independent source review](../tmp/grid-claim-arithmetic-v1-source-review/review.json)
found no concrete blocker within that scope. The exhaustive authored sweep spans
positions, energy and controls over a fixed ownership pattern, not all boards.

The [registry integration design](../tmp/grid-claim-registry-design-v1-work/manifest.json)
and [lifecycle addendum](../tmp/grid-claim-registry-design-addendum-v1-work/ADDENDUM.md)
are implemented in the [installed source candidate](../tmp/grid-claim-registry-integration-v1-work/manifest.json).
It binds all eight generic statement fields,
including a mandatory typed dispute commitment, a bounded Grid request and
explicit CLI request-kind selection. The proposed descriptor remains unqualified.
Under the fixed two-player/minimum-two rules, the first removal closes further
consensus rounds; simultaneous all-forfeit and the unused terminal input row
retain their existing semantics. Real Game transition controls and two genuine
record-bound proof/zero-stake settlement cases are required. Archived Grid
verification needs a separate design and is explicitly unsupported by this
candidate. Three ordinary Execute fixtures and an explicit two-producer gate
are authored. The [Execute source review](../tmp/grid-claim-execute-fixtures-independent-review-v1/review.json)
found no scoped blocker; the [production source review](../tmp/grid-claim-registry-production-independent-review-v1/review.json)
also passed within its scope. Actual compilation, proof generation and settlement
qualification remain pending. This candidate is not a proof or settlement pass.

The [shipping-CLI qualification proposal](../tmp/grid-shipping-cli-qualification-v1-work/manifest.json)
has passed [independent source review](../tmp/grid-shipping-cli-qualification-v1-independent-review/review.json)
and root review. Two new ignored test seams export public requests from real
Execute fixtures and consume proofs made by the shipping CLI. Its separate
58-command contract includes two CLI producers, coherent claim mutations,
canonical decoding, stale-record and duplicate-settlement checks. Installation,
owner integration and actual proof/CLI outcomes remain pending. No measured proof
size, funded settlement or finalized inclusion is claimed.

Independent review of its disabled execution owner found a concrete reader
blocker: CLI proof diagnostics use lowercase hash bytes, while the typed profile
uses a checked Norito Hash literal. Direct string equality would reject a valid
proof. The [finding](../tmp/grid-shipping-cli-owner-independent-review-v1/finding-hash-format.json)
is retained; the strict owner-companion conversion has passed independent and
root source review, with 52 Python controls. It accepts only the exact marked
lowercase-byte spelling and compares the corresponding checked Hash literal. The
original sealed proposal and its 58 command rows remain preserved. No genuine
CLI proof is admitted by this source-only correction.

**Done when:** it needs no racing fields and no game-specific settlement ISI;
cross-profile replay and altered rules fail; native proof and settlement tests
pass alongside SORA CARS. This is a framework demonstration, not a second full
frontend product or a replacement for the full-race gate.

### F8 — Qualify, review and integrate the release

**Status: open. Depends on F0–F7.**

Run the adversarial matrix: impossible controls, arithmetic overflow, forged
collisions, skipped checkpoints, wrong rankings, malformed/trailing proofs,
cross-network/race/profile replay, stale epochs/records, conflicting checkpoint
certificates, withheld reveals, duplicate payout and custody bypasses.

Exercise both adapters with actual funded XOR/NFT lifecycle tests on real
four-validator signed consensus, including partitions and restarts while
certified inputs are pending, dispute resolution, replay and identical final
state roots. Retain genuine finalized settlement evidence. Run supported CPU
and accelerated-path parity and eight-client gameplay with inspected captures;
preserve the failed September screenshot gate until a new run passes.

The earlier four-validator test required a current client migration:
peer handles return the blocking facade, whose synchronous HTTP operations reject
an async runtime. A scratch successor uses quoted account-scoped transactions,
local signing and dedicated-thread reads, and retains actual proof, transaction,
block and consensus artifacts. The subsequent certified migration below is now
installed; compilation and the real network run remain pending. Artifact retention
alone cannot authenticate finalized inclusion.

Its [corrected publication candidate](../tmp/native-game-artifact-publication-v2-work/manifest.json)
passed [independent source review](../tmp/native-game-artifact-publication-v2-independent-review/review.json)
and root review. The first candidate's two versioned-decoder error-type blockers
are retained in its review; the successor changes only those two scope-wrapper
calls. The narrow Cargo.lock dependency change affects Grid's selected source
catalogue, so installation requires fresh Grid profile, descriptor and proof
provenance. The six helper tests and real validator scenario remain unrun.

The [finalized-inclusion readiness design](../tmp/native-game-finalized-inclusion-gate-design-v1-work/DESIGN.md)
identifies the next concrete export seam. The shipping settlement verifier needs
consecutive canonical finality archives, the actual block and native entry/result
Merkle proofs, plus independently selected genesis context, network, session,
profile and outcome. The historical game verifier additionally requires the
exact retained merge carrier and its complete write set. Missing retention must
stop that path. The original proof binds the pre-settlement record; the settled
record requires a separately produced proof. A local WSV hash cannot substitute
for authenticated inclusion. Packaging and actual native verification remain
pending; retained artifact files alone are not an F8 pass.

A subsequent [source trace](../tmp/native-game-ordinary-retention-trace-v1-work/TRACE.md)
and [independent review](../tmp/native-game-ordinary-retention-independent-review-v1/review.json)
confirm three integration blockers in the retained V2 scenario. Its signed
`Ordinary` transactions cannot pass current public Torii ingress. Hypothetical
internal ordinary execution also lacks the certified merge capture required by
the historical game verifier. Changing intent alone conflicts with its direct
external-transaction inclusion assertion: autonomous execution uses a certified
merge carrier. The reviewed migration below obtains QueuePlan admission,
execution and retention, then authenticate settlement through that carrier's
native provenance. Preserve the original scenario and findings; do not admit
its network run, invent missing write sets or remove inclusion checks to obtain
a passing result. These are source-established blockers, not an observed
four-validator test failure.

The [certified scenario migration](../tmp/native-game-certified-migration-v1-work/manifest.json)
now has [independent source review](../tmp/native-game-certified-migration-v1-independent-review-work-2/manifest.json).
It preserves all 79 scenario assertions, with two explicit replacements for
certified admission and carrier inclusion, one original proof producer and all
six inherited artifact tests. Four new bounded frame tests are authored.
The original submission future survives healing without resubmission; the
original computation proof selects its earlier authenticated carrier/revision,
while later archived selection and signed settlement/result inclusion remain
separate claims. No native compile, validator run, funded payout or finality
qualification has occurred for this patch. The
[integration map](../tmp/native-game-certified-v11-integration-map-v1-work/manifest.json)
keeps its ten ordinary F8 tests in the separate owner; it does not silently add
four to the main v11 count or omit the six inherited tests. Current retained
`6868b786…` evidence confirms that this migration and both reviewed dispute/expiry
controls are installed. The historical integration map must not be reapplied.
The [current-API successor](../tmp/native-game-certified-scenario-current-api-v2-work/HANDOFF.md)
preserves those installed sources and proposes only the borrowed JSON argument
fix, with [closed root source review](../tmp/native-game-certified-scenario-current-api-v2-root-review-20261007.json).
Its 204 source assertions and ten source-check commands passed; native type
checking, real validators and the finality/funding release gates remain open.

Integrate reviewed changes into the user's `iroha` `optimizations` branch while
preserving concurrent work. Rebuild and rerun affected acceptance gates for the
resulting source identity. Publish the specifications, fixtures, resource and
security reports, operational guide and unresolved-limitations record.

**Done when:** the reviewable integrated release has all required evidence and
cryptographic review sign-off. Any eventual Taira activation additionally
requires advancing finality, deployed native support and wallet interoperability;
SoraFS publication requires verified current provider availability. Unavailable
deployment infrastructure does not erase local foundation work or justify
enabling stakes.

## Historical execution order — October 4

This is the retained October 4 snapshot. Its source epochs, test counts and
storage observations are historical; the current completion gates and immediate
execution priorities at the top of this file govern the active work.

1. The arithmetic gate passed: production checks, all 143 ordinary tests and
   final source checks. Preserve its completed receipts and retained binaries
   for source `448d81886083810301128040ef631e0c063b807a77ec2d535f06217bfa837b18`;
   the retained-binary census is also complete. The Grid calendar and proof-size
   geometry tests passed first. Disk space is available;
   preserve the 16 GiB admission and all previous failed receipts.
2. The two/eight-player Tokyo compiler census passed with its short-trace scope.
   Investigate the observed eight-player row-budget failure. Fix actual compiler or
   relation failures without weakening constraints or the proof cap.
   Use the measured Grid dimensions and Street compiler
   census to choose the next complete proof experiment. Do not count ignored
   test registration as execution or a size estimate as a generated proof.
3. The reviewed lifecycle/adapter, Grid bridge, Street economic/whole-history
   code and browser certificates are installed. The succeeding 36-file closure
   fixes the observed Core types, adds the Rust 43-vector exporter, current SDK,
   compact NFT lengths, mandatory instruction archive test gates and test-only
   compiler attribution. That source was
   `347d54da145a6bf1a92faa10ba19e3f1c4f72a3981c07c853669d55a43bbe576`.
   Attempt 3 caught four codec-test compilation errors; the two-file correction
   is installed. Production attempt 4 passed model and grouped codec compilation,
   then failed a denied large error-variant lint in Core. Preserve that failed
   receipt. The diagnostic-only correction and fresh seven-value proof exporter
   are installed. All five production checks passed under this source identity,
   with matching before/after observations and the actual owner reaped. The shared
   browser framing companion is installed; all five checks passed again in
   production attempt 6. The reviewed 310-test qualification failed during the
   release Core test build with 20 compilation errors in test callers; zero
   tests or exports ran. The owner exited 1 and was reaped, and source remained
   unchanged. Its eight-file test correction and 23 canonical history controls
   are now installed at source
   `ec189856460e5c1e3c82196d814e84cc5cb123f812dc9c3d186a27a35de3ccca`.
   Production attempt 7 passed all five checks with unchanged source and an
   observed zero exit/reaped owner. The 363-test successor passed Core release
   compilation in 1,036.335 seconds, then rejected ten stale module-path test
   selectors against the actual compiled registrations. No tests or exports ran.
   Its final report shows all children reaped and unchanged source; the terminal
   owner tool receipt is unavailable and its exit is not inferred. Correct the
   exact selectors and rerun the complete selection on the warm target. The
   selector/tool successor passed 142 tests, then failed the late-forfeit fixture
   because its inputs do not finish both cars before the unchanged cap. Retain
   that actual failed/reaped run. The remaining 169 Core diagnostics finished
   with 157 passes and 12 failures, giving 299 passes and 13 failures across the
   selected Core tests. These two runs do not replace a complete passing gate.
   The reviewed legal-driving, frozen-admission, canonical NFT,
   archived-record and actual whole-history geometry fixture corrections with
   the current generic accepted-segment tests are now installed. The retired
   adapter fixture consumer now requires the freshly exported native 43-value
   corpus, preserving
   every selected test and canonical six-control input as twelve little-endian
   bytes. Installation7 observed zero exit and reaping; it preserves 188 final
   paths and writes 14, including three new test modules. Its source identity is
   `6046c75191732f2e20a54cfd79703cfe767ca2d694f419e1e556e9ca3b622d29`.
   Production8 passed all five checks, with zero owner exit and reaping. The
   complete successor stopped during Core release test compilation on a private
   `Name` import in the updated NFT fixture. No tests or exports ran. Its failed
   owner exited one and was reaped; source remained unchanged. Installation8
   corrects only that import and expands the existing selected controls test to
   all valid and invalid values at every offset, with no registration delta.
   Its actual source is
   `3e10b50dce8c38906b4b7f5ac0b900dea24d84a9a4098ff2ddbe6eaa952ddb45`.
   Production9 passed all five checks with unchanged source and an observed zero
   exit/reaped owner. Focused5 then passed all 320 Core cases scheduled before
   current43 export and failed model test compilation with ten errors. The
   model-build child exited 101 and was reaped; root observed outer exit 1 and
   reaping (tool chunk `84dace`). All 657 report outputs and final source `3e10b50d…`
   are retained. No model test, fresh export, shipping-CLI proof check, Tokyo
   census or Grid proof gate ran; `core-ordinary-185` remains deferred.
   The two observed model test/exporter fixtures are corrected using current
   typed scope, nonce and commitment APIs and canonical JSON export. Root
   installed only those two reviewed postimages, observed exit zero and reaped
   the installer. The actual new source is
   `fccbb071607046c0ccea9a47186031c7e1f5fd22c93c6ebf982f097490a6fa3d`;
   all 189 composition paths match, with no new test registrations. Production10
   passed all five exact targets; root observed exit zero and reaped the owner
   (tool chunk `c5ced4`) and verified all 14 retained outputs and unchanged source.
   Focused6 actually exited one and was reaped (tool chunk `024ed3`) after
   another 320 Core passes and a successful model build. The lifecycle exporter
   then rejected its synthetic all-zero Ed25519 seed. All 331 children and 664
   outputs were checked; source remained `fccbb071…`. Seven separately executed
   model codec tests passed on the exact emitted/retained binary; this does not
   convert the failed export owner into a success.
   The [composed source successor](../tmp/native-driver-grid-retention-composition-v1-work/manifest.json)
   combines the reviewed driver/finalized checks, settlement preflight, Grid
   adapter, fixture seed repair and four-validator retention admission. It has
   200 paths and 25 proposed writes, with 392 ordinary and 18 ignored declarations
   selected from source. Root installed all 25 exact postimages, retained all 19
   replacement backups, checked 200 paths and 1,308 source pins, and observed
   both source-reader children and the owner exit zero/reaped (tool `9801f5`).
   The actual source is `cdae8228c368a75ddb1b4ce8e8e36f06d741ae87421fb10084a121633c308c65`.
   Production11 now passed all six exact targets, including Torii, with eight
   child processes and the owner actually exited zero and reaped. Both source
   observations match `cdae8228…`; all 16 retained streams were checked. Focused7
   was interrupted without a retained owner/child terminal receipt. Both recorded
   processes and the tool handle are absent; a fresh reaped source observer still
   matches cdae. Preserve the incomplete run, restore the disk admission floor
   without discarding evidence, and use a durable owner for the full successor
   schedule on the same warm target.
   It includes the seven existing
   model codec selectors in the successor qualification, giving 399 ordinary
   candidates; derive actual registrations and command counts from compiled
   listings. Preserve the failed gate rather than combining its partial passes
   into a new-source success. Run lifecycle/current43 export, the deferred Core
   codec consumer, fresh seven-value proof export with independent CLI outcome
   equality, and the explicit Tokyo/Grid gates before consumer admission.
   The app's separate post-install build and 64 focused tests remain their
   recorded pass. Then bind a new consumer lane with all fifteen commands,
   adding the migrated raceAdapterCodec suite and source/dependency observations.
   Model bundle source changes can change compiled profile identities: discover
   the actual fresh CLI profile, stage real kernel/parity exports only if it
   differs, review installation and rerun parity. Never substitute profile IDs
   or synthetic transport rows for the genuine-proof gate. Browser mock-finality
   export and local Connect tests do not establish finalized ledger inclusion.
4. Produce a genuine Grid proof and complete its generic settlement path. In
   parallel, finish complete Street whole-history scheduling and its physical/
   economic result boundary. Prove the requested full 2- and 8-car histories;
   measure proving, verification, memory and wire size for the exact relation.
5. The extension-field AIR/quotient correction remains an unresolved release
   prerequisite; its rejected profile-rebase action is not being retried or
   rerouted. Close the exact F3 transcript/hash/field-mapping/soundness obligations and
   resource limits, then qualify protected XOR/NFT settlement, wallet/finality
   verification, supported targets and four-validator recovery. Complete F8
   cryptographic review and integration before opening staked admission.

Reuse the existing warm Cargo target and native jobserver/Apple linker. Do not
clean targets or restart work solely because it is slow. Keep measurements
separate from competing heavy browser/build workloads. Source reviews and
synthetic tests must be labeled as such. Record completion evidence and the next
concrete action here and in [progress.md](../progress.md) as the work advances.

## October 13 source-gate root-cause closure

The F6 native certificate consumer exposed a real type bug rather than a test-only mismatch: the browser fixture adapter treated numeric `GameTranscriptGeometryV1.slots` values as byte arrays. The first-release source correction now preserves numeric geometry and converts only array-valued slot lists. The reviewed installer applied exactly one file change and advanced the native source tree to `6c039e470fa1b625b0965dc9a8a904e6790428e34c8421213c17bb79245f6a0d`; focused native certificate coverage is 215/215. Previous CLI/addon reports are intentionally invalidated by this source epoch.

The installer itself now binds its manifest to the exact script, input, candidate patch, source inventory, source lock, and runtime pins; joins the lock descriptor to its pathname across the exclusive lease; records interruption signals with guaranteed child reaping; and fsyncs published files and directories. Independent review accepted these controls with no findings. The successor CLI chain remains open: its owner must authenticate the fresh installer report and process closure, confine evidence paths, and reject stale or unrelated installer bindings before fresh CLI and all twenty SDK/browser consumer stages can run.
