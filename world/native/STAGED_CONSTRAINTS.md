# Native staged constraints and execution boundaries

> Historical laboratory record. The standalone constraint-plan runners have been retired. Current checks run in the native Iroha Core modules; their compilation and results must be established on the selected revision. Recorded counts below describe the original source, not current proof cost or full-history qualification.


The standalone Rust implementation verifies complete scalar circuits as fixed
rows and binds successive invocations through their verified outputs. It is a
reusable computation component: racing supplies the compiled circuit and port
bindings, while the scheduler and execution-boundary layer contain no racing
instructions or game rules.

This is **raw field-trace verification**, not a STARK or a qualified execution
profile. Exact constant substitution and shared ROM bases reduce the current
eight-car rectangle to **112 rows × 15,483 columns per tick**. The representation
still requires **124,854,912,000 bytes (116.3 GiB)** for 9,000 ticks before proving
overhead. No full-race trace was allocated. These modules do not authenticate
accepted-input signatures, ledger state, finality, XOR or NFTs.

## Implemented relation

`staged_constraints.rs` snapshots every polynomial from a circuit, preserving
original equation order. It infers a fixed wire value only from an original
canonical equation with exactly one linear term and no quadratic terms:

```text
a*x + c = 0, with a != 0 in Goldilocks
x = -c / a
```

This inference uses retained equations, never range metadata or honest witness
recipes. It does not recursively infer additional constants after substitution.
The first singleton value for a wire is substituted into every occurrence in
all linear and quadratic terms. Every original equation slot remains, including
zero identities, contradictory constant residuals, inactive-branch equations
and assertions disconnected from selected outputs. Conflicting equations cannot
be resolved by discarding one or by changing the stage partition.

Fixed wires require no witness column or carry. Each remaining active wire gets
a closed interval from its first through last stage occurrence, extended to the
first or last row when it is a public input or output. Simultaneously live wires
never share a column. Assignment is deterministic, and a column is reused only
after the previous wire's last use. The immutable compiled context owns the
substituted polynomials, fixed values, lifetimes and port maps; later edits to
the original circuit cannot change it.

Opaque input/output wire handles must belong to the circuit. Every ordered port
retains its own public equality, including aliases and fixed-value ports. A
fixed input or output is checked against its compiled field value even when the
entire row has zero columns. Contradictory public claims for aliased ports reject.

The verifier checks exact row width and canonical Goldilocks elements before
checking the compiled equalities:

```text
local:     each original polynomial after exact substitution and column remap
           equals 0, including constant-only residuals
carry:     cell(stage, column(wire)) = cell(stage-1, column(wire))
           whenever the same active wire is live in both stages
padding:   every column without a live wire equals 0
boundary:  first-row inputs and last-row outputs equal their public port values;
           fixed ports instead compare their compiled value to that public value
```

Carry identity follows the original wire, not a reused column number. A failed
row permanently poisons the stream. Missing or extra rows cannot be ignored.
The raw verifier consults only the compiled relation and canonical rows, without
honest recipes or host replay.

Packing a scalar witness is a separate iterator. It retains the original full
raw-vector length, checks every element is canonical, and checks every eliminated
cell equals its compiled fixed value. Thus a malformed full vector cannot gain
admission merely because its altered constant was removed from the rows. The
iterator still does not certify the remaining arithmetic. Count, shape and
buffer byte limits bound construction and streaming. The compiler counts exact
post-substitution linear and quadratic terms before reserving their buffers,
avoiding unchecked amortized growth. Supported-target runtime and full-race
resource qualification remain open.

The exact geometry ROM now uses two balanced Boolean indicator bases shared
across all output columns. Index narrowing and bit reconstruction select one
low/high pair, and each output equals a quadratic sum whose table entries are
compiled coefficients. Basis equations, explicit output ranges and padded-index
exclusion remain required. This replaces the old per-column selector graph;
it does not introduce probabilistic membership or trust a table-lookup hint.
See [the shared ROM basis review](ROM_SHARED_BASIS_REVIEW.md) for its exact
relation, integer bounds and adversaries.

`execution_trace.rs` supplies the generic outer boundary relation. Each input
port has one compiled source: a fixed initial state element followed by a named
previous output, or a column of the immutable public action tape. All declared
action columns must be used. The verifier snapshots the tape and final claim,
checks exact shape/canonical values and derives each next input from previously
**fully verified** outputs. A purported intermediate state cannot replace them.
Only a completely verified invocation advances the stream. Final-output mismatch,
truncation, extra invocations and any inner failure poison acceptance.

This API does not infer an application's valid stopping condition. Its caller
selects a bounded nonempty action-tape length; an admitted game profile must
add the canonical terminal/result predicate, authenticate initial state and
actions, and bind network/session/rules/roster/keys/disputes and transcript
commitments. A forfeit bit in an untrusted tape is not a consensus decision.

## Preservation argument

Every satisfying scalar assignment gives each inferred constant the unique
value fixed by its singleton equation. Substitution therefore preserves all
residuals. Put each active value throughout its closed interval and zero in
inactive columns to satisfy the staged relation and matching public boundaries.

Conversely, satisfying carry equations give one value per active wire. Together
with the compiled fixed values, these reconstruct all original scalar cells.
Each substituted residual equals its original residual on that reconstruction,
and every equation remains present, including any contradictory constant.
Every declared boundary equality binds that same assignment. Closed intervals
prevent simultaneous aliases. Full raw-vector packing additionally checks the
removed cells agree with this reconstruction. This is a finite relation argument
with implementation and adversarial checks, not a machine-checked proof or
cryptographic security analysis.

For `E` original equations, `S` rows, `W` columns, `V` original source wires,
`A` active wires, `F` fixed wires, `K` occupied cells and `P` ordered public ports:

```text
V = A + F
K = sum(last_stage(wire) - first_stage(wire) + 1), over active wires only
carry equalities   C = K - A
zero equalities    Z = S*W - K
total equalities    = E + C + Z + P = E + S*W - A + P
```

`E` still includes constant identities and contradictions; `P` includes fixed and
aliased ports. Replacing `A` with the original raw-vector length would undercount
the constant-eliminated schedule's constraints.

The maximum polynomial degree is two **in witness cells**. That is not the
degree of a univariate AIR composition polynomial. Fixed selectors and
coefficient columns, vanishing sets, boundary denominators, domain padding,
next-row wrapping and quotient/LDE/FRI degree accounting remain to be designed.

## Qualification and reproduction

Current scheduler and selected boundary composition checks run from the native Iroha checkout:

```sh
cargo iroha-fast -- test -p iroha_core --lib --profile release execution_proofs::arithmetic::staged_constraints::tests:: -- --nocapture
cargo iroha-fast -- test -p iroha_core --lib --profile release execution_proofs::guarded::guarded_segment_proof::tests:: -- --nocapture
```

The earlier standalone `execution_trace` runner is retired. The selected segment relation binds scheduled state carry, accepted actions, halt/cursor values and every retained checkpoint; full-race proof cost remains unqualified. The combined implementation's
logs, source/harness/binary hashes, compiler version and exact counts are in
`output/qualification/street-rom-basis/staging/report.json`. Current source and
report pins are cross-linked by
[the combined artifact manifest](../../artifacts/street-rom-basis.json).

The combined run passes **39 focused tests: 20 scalar-helper, 16 stage-scheduler
and 3 execution-boundary tests**. They cover singleton field inversion, 343 small
full raw-vector equivalence cases, eliminated-cell mutations, fixed public pins,
constant contradictions, coherent row splicing with otherwise valid local
equations, small-composition cell mutations, disconnected assertions, slot
reuse, canonical padding, ownership, detached snapshots and poisoned retries.
The helper tests also exercise exact shared-basis selection and a coherent changed
hint table against unchanged compiled coefficients.

The integrated harness verifies three consecutive complete native ticks for
both two and eight cars, retaining compiled geometry and all native
state/action/output ports. These short launch/control sequences do not qualify
a full race or its terminal predicate. Four attacks reject for each roster:
replaying a valid first tick after the wrong preceding state, changing a public
control, inserting a valid native forfeit transition against a zero public
forfeit action, and omitting the final stage row. Public actions are fixtures,
not authenticated certificates.

At 16,384 original equations per stage, the current combined implementation has:

| Per simulated tick | Two cars | Eight cars |
| --- | ---: | ---: |
| Original source wires | 125,976 | 1,670,866 |
| Fixed wires removed from rows | 580 | 2,313 |
| Active wires | 125,396 | 1,668,553 |
| Original equations retained | 138,116 | 1,827,393 |
| Stage rows | 9 | 112 |
| Columns | 15,155 | 15,483 |
| Carry equalities | 804 | 37,223 |
| Zero-padding equalities | 10,195 | 28,320 |
| Input/output boundary equalities | 141 | 351 |
| Total equalities | 149,256 | 1,893,287 |
| Dense witness cells | 136,395 | 1,734,096 |

Eight cars bind 91 state inputs plus 16 action inputs to 244 output ports,
including legitimate aliases. The report retains schedule construction, packing
and raw verification times and whole-process peak resident memory. These local
structural harness measurements are not proving time or validator cost.

## Controlled historical comparison and remaining work

The earlier evidence remains frozen. At the same 16,384-equation stage budget,
the eight-car measurements compare as follows:

| Frozen implementation | Rows × columns per tick | Raw bytes for 9,000 ticks | GiB |
| --- | ---: | ---: | ---: |
| Original selector ROM and original staging | 189 × 22,118 | 300,981,744,000 | 280.3 |
| Original selector ROM with exact constant substitution | 189 × 15,498 | 210,896,784,000 | 196.4 |
| Shared ROM bases with exact constant substitution, current | 112 × 15,483 | 124,854,912,000 | 116.3 |

The first baseline is pinned under `output/qualification/street-staging`; the
constants-only experiment under `output/qualification/street-staging-constants`
uses that frozen scalar/ROM implementation to isolate the scheduler change.
Neither baseline describes the current source. The independent earlier staging
budget audit remains under `output/qualification/street-staging-audit`; its
parameter sweep was not rerun for the new ROM and cannot establish the current
optimal stage budget.

All three figures are arithmetic counts of unpadded rectangles at eight bytes
per field cell. No full-race rectangle was allocated. Power-of-two domain
padding, fixed columns, commitments and LDE add costs beyond these figures.
The 9,000-tick bound belongs to the longer song-bound Tokyo draft. A 5,400-tick
race scales raw storage to 60% and remains large. Streaming two rows reduces
this raw verifier's resident memory, not the prover's mathematical trace or
total work. The remaining 116.3 GiB base rectangle is still impractical for the
intended complete-race prover.

Further work must address range/Boolean representation, the actual AIR and its
fixed coefficient tables, whole-race layout and proving resources. The shared
basis is an exact constrained lookup; replacing it with advice would reopen a
correctness gap. Any later probabilistic lookup or aggregation needs its own
table/profile binding, challenge design and soundness analysis.

Native STARK integration, complete transcript/public/terminal constraints, a new
documented ≥128-bit analysis and independent cryptographic review, CPU/accelerated
parity, full-race resource qualification, generic ledger admission/custody/disputes,
finality verification and the Taira/SoraFS release gates remain open.

See [the original staging design review](STAGED_CONSTRAINT_REVIEW.md),
[the historical implementation review](STAGED_IMPLEMENTATION_REVIEW.md), and
[the current exact ROM review](ROM_SHARED_BASIS_REVIEW.md).
