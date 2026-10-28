# Native Street completion admission

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


September 8, 2026. The native Street adapter now combines the complete compiled
physics with generic first-terminal admission and an exact result projection.
This is **raw field verification**, not a full racing STARK, accepted-history
authentication, finalized ledger inclusion or permission to release escrow.

## Implementation

[`CompiledStreet`](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/street_terminal.rs) constructs the native graph, exact frozen
geometry lowering, every scalar polynomial and range membership, and the entire
staged circuit. It derives input/output maps from the compiled names. Its private
fields prevent a replay from replacing the graph, genesis vector or port map.
Rules, track and catalog are still host compilation inputs; a ledger profile
must independently select and bind the admitted version.

The adapter uses [`CompleteExecution`](execution_terminal.rs) to require zero
initial tick and halt, exact cursor increments, no halt before the last active
transition, and a halt at that final transition. Every persistent state field
and action remains bound by the original structural verifier. All final outputs
are bound, including catalog constants and transient feedback such as
`justFinished`. A valid unfinished prefix or absorbing post-finish gameplay tick
does not satisfy this completion policy.

`verify_complete` always creates its verifier from the adapter's own compiled
relation. It accepts a lazy step iterator, verifies every row of each step, then
derives the result. It retains no full-race witness matrix. The compiler exports
the additional terminal and global padding equations for future cryptographic
lowering; the existing small lookup proof has not yet incorporated them.

`project_final_claim` is deliberately named as a claim operation: calling it
alone proves neither the trace nor the claim's authority. It checks every final
field's canonical encoding and compiled bound, requires closure and zero final
speeds, then independently recomputes competition ranks from exact finish
fractions or unfinished progress. It preserves the native fraction encoding.

- All forfeits produce a refund result with no winners, despite their ranks
  being one.
- A sole eligible racer produces a technical win, including when its individual
  status remains running.
- Exact ties retain every eligible rank-one slot, in ascending encoding order.

The result projection contains no caller-selected payout list. XOR amounts,
wallet ownership, explicitly pledged NFTs, atomic reserve release and duplicate
settlement prevention remain generic ledger obligations.

## Current validation

The focused [generic qualification](../../output/qualification/execution-terminal/report.json)
passes eight tests covering first halt, cursor/alias/genesis bindings, immutable
equation/descriptor exports, exact padding and poisoned streams. The
[generic documentation](EXECUTION_TERMINAL.md) records their precise scope.

The [retained Street runner source](../../output/qualification/street-terminal/source/scripts/test-street-terminal.py)
froze the then-current sources and Tokyo route before compiling with standalone
Rust. Its [retained native harness](../../output/qualification/street-terminal/source/scripts/native/street_terminal_qualification.rs)
checked two- and eight-car cases from their actual initial grid:

- Three-tick technical wins and all-forfeit refunds, using explicitly synthetic
  numerical removal tapes.
- Structural acceptance and completion rejection for a three-tick prefix and
  a fourth absorbing gameplay tick.
- Independent mutation of every final field: 112 for two cars and 244 for eight.
- A physically valid forfeit trace paired with a different public tape, and a
  truncated trace.
- All 36,856 / 223,502 exported completion and padding equalities on the actual
  short Street rows, plus positive and altered-padding raw-verifier cases.
- Exact tie projection and rejection of a slot tiebreak or incorrect refund
  flag. These projection-only constructed claims are not reachable-race tests.

The full-race case uses the exact retained browser replay's 8,462 eight-car
control rows from genesis. It first reexecutes the native graph, requires the
first terminal exactly at tick 8,462, and compares all 244 outputs against that
replay. A second pass constructs and verifies every scalar, range membership,
stage carry, stage zero and execution/terminal boundary for every tick. Its
completion status and measured costs are recorded by the runner in
[`report.json`](../../output/qualification/street-terminal/report.json).
The completed run passes and retains the following measured evidence:

| Full eight-car run | Result |
| --- | ---: |
| First terminal tick | 8,462 |
| Winner slot | 7 |
| Final browser/native output comparisons | 244 |
| Native-node/field-wire parity comparisons | 861,499,296 |
| Original polynomial checks | 2,436,802,140 |
| Exact range-membership checks | 1,855,175,032 |
| Stage carry checks | 45,085,536 |
| Stage-local zero checks | 411,151,656 |
| Native reference prepass | 1.484 seconds |
| Complete raw verification pass | 266.351 seconds |
| Full process peak resident memory | 297,517,056 bytes |

The timing includes native node/witness generation, all-node parity, staging,
complete row/boundary/terminal verification and final projection. Compilation
is excluded. Peak RSS is measured for the process, including the compiled graph
and both passes. These are one-run CPU measurements on this Mac. The full
unrounded staged matrix would contain 27,232,882,272 bytes, but was not stored.
The report SHA-256 is
`2151180745a0ced2290653f604fbd481b15b7eddaf98f83d23bacf90b568071b`.

A separate [maximum-duration run](../../output/qualification/street-terminal-timeout/report.json)
reuses that exact compiled binary. Two cars receive zero controls from genesis
for all 9,000 ticks. The first terminal is exactly at the cap, with both slots
retained as tied winners. Every active raw constraint passes: 202,536,000
polynomials, 149,148,000 memberships and 50,283,000 native-node comparisons.
The complete raw pass takes 30.743 seconds. This is a genuine full-genesis tied
result, separate from the constructed projection-only finish-fraction tests.
It has no browser outcome or authenticated input history. The report SHA-256 is
`eb7ed532c2b1dfc881b89c0155479035051b09fa875ba0386d00c8a322718478`.
Its [retained runner source](../../output/qualification/street-terminal-timeout/producer.py)
records the historical no-compilation invocation; it is not a current build entrypoint.

Global proof padding is checked in the short cases. The long raw run verifies
the entire active computation; it does not construct an LDE, lookup auxiliary
trace, commitment, proof or full padded matrix. The retained browser tape has
no signed/consensus input authority. It is also distinct from the previously
recorded all-bot native tape that ends at the same tick with a different winner.

The standalone Street runner, timeout driver, native harness and summary
recorder have been retired. Their frozen source snapshots, reports, inputs and
logs remain unchanged historical evidence. These measurements concern the old
raw relation and are not cryptographic proving or validator verification costs.
Current completion and proof testing uses the maintained
[Native owned-sequence and finalized tests](../../docs/native-finalized-execution.md);
those current tests do not relabel this 8,462-tick raw run as a full-race proof.

## Remaining integration

The [terminal/history specification](STREET_TERMINAL_SPEC.md) selects a coherent
first-terminal policy with conditional consensus removals and a separately
committed complete accepted history. This preserves pending certificates and
the unexecuted suffix of a signed batch. That authority adapter is still a
specification; the numerical forfeit column does not implement it.

The complete Street relation still needs a practical cryptographic layout and
native proof path. The [layout study](STREET_PROOF_LAYOUT.md) measures the cost
of the current dense schedule and identifies the next representation changes.
Full-duration proving, composed 128-bit soundness, external review, supported
targets/accelerators, generic settlement and independent finality remain open.
No live XOR or NFT transfer is enabled by this admission work.
