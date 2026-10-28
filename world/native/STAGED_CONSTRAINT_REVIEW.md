# Fixed-stage scalar constraint review

> Historical laboratory record. The standalone raw-constraint implementation and its runners have been retired. Current implementation and test obligations live in Iroha Core; see the [current foundation goals](../../docs/zk-foundations-goals.md). Source hashes and measurements below describe the original reviewed revision and do not qualify the current verifier.

The proposed scheduler can preserve the complete checked scalar relation. The
argument requires **closed wire lifetimes, exact polynomial remapping, identity
preserving carry equations, and explicit boundary equalities**. This is a design
review of structural staging, not approval of an implemented AIR or STARK.

Reviewed on 2026-09-07 independently of the scheduler author. Only this document
was added; no maintained Iroha source or build was used. The scheduler was still
under construction when this review was written, so implementation tests and
actual staged resource measurements are prerequisites, not reported results.

## Scalar source context

| Reviewed source | SHA-256 |
| --- | --- |
| `world/native/checked_constraints.rs` | `b4e63b00e8f4549ef77b8ffd4580850999c64c7d493951f9e46fa658c5617958` |
| `world/native/street_checked_lowering.rs` | `c3215c84a7f779b98ee80e9e29bdd2cd87d892e107fdaf947f9d6526e7f2fcaf` |
| `world/native/street_constraint_plan.rs` | `4918c13f657da7331dc522235def3b1163f96117f2108854d9e3fc7206e3b7fa` |
| `world/native/fixed_rom.rs` | `8d1d3f8b2bb40e65c44b42839bff1acc87edac53be3596606f6d43c5e6011fb5` |
| `world/native/street_geometry_constraints.rs` | `977e2dcf77ce56e836b2973d334fc40388bdd8a05b194fd8c4f1e1bc9b60a34e` |

`Circuit::inspect_equations` exports every original polynomial, including bit,
range, inverse, division, ROM and disconnected assertion equations. Its maximum
degree is two. Its derived ranges depend on the complete operand equations;
placing values in different rows does not justify dropping those obligations.

## Fixed construction contract

1. Partition **all** original equations into deterministic bounded stages. Keep
   original indices and order. Include constant-only and disconnected equations;
   an unsatisfied constant polynomial must not disappear for lack of wires.
2. For each referenced wire, compute its first and last occurrence over every
   linear term and both factors of every quadratic term. Extend input-pin
   lifetimes to stage zero and output-pin lifetimes to the final stage. A pin
   makes an otherwise unused wire live. Explicitly define the empty-circuit case.
3. Treat lifetimes as closed intervals `[first,last]`. Two wires used in the same
   stage must occupy different slots, even if an evaluator would use them at
   different times within that stage. Reuse a slot only when `old.last < new.first`.
   Sorting by `(first,wire_id)` and choosing the lowest free slot makes interval
   coloring reproducible. A fixed slot per lifetime keeps carry checks simple.
4. Remap every original polynomial occurrence to its compiled slot in that
   stage, preserving all coefficients, constants, repeated factors and terms.
   For each wire live in adjacent stages, retain an equality between those two
   cells. Determine continuity by **wire identity**, never merely by matching
   physical slot numbers across a reuse boundary.
5. Constrain every cell outside a live interval to zero. Padding is not free
   witness space. The immutable schedule owns row masks, polynomial assignments,
   slot lifetimes and boundary maps; raw rows cannot supply replacement tables,
   selectors, active flags, stage numbers or a claimed schedule identity.
6. Bind each ordered public input/output pin with an equality to the externally
   supplied canonical field element. Enforce exact public-array arity. Preserve
   duplicate/aliased pins as distinct public positions: contradictory public
   claims for the same wire must fail. Do not manufacture expected public values
   by reading the row being verified.

Validate dimensions, budgets, wire references and all checked size arithmetic
before allocation. Limit dense `rows * columns`, bytes, terms, boundaries and
staging work, not only original equations per stage. Bound read-only diagnostic
exports as well as the main verifier.

The current `Wire` has a private circuit owner. If the scheduler accepts typed
`Wire` pins, it needs a same-circuit validation method from `Circuit`; comparing
public indices and bounds is insufficient. An API accepting explicit integer
indices instead must describe them as indices into this circuit, without claiming
typed ownership authentication. Public borrowed schedule views must not expose
mutable backing storage or allow a deserialized object to impersonate a compiled
schedule.

## Why the staging preserves the relation

Given a scalar witness, place each wire's value in its assigned slot throughout
its closed lifetime and write zero elsewhere. Exact remapping preserves each
scalar residual. Carry, zero and matching public boundary equations then vanish.

Conversely, take canonical rows satisfying all compiled checks. The adjacent
carry equations make every cell in one wire's lifetime equal. Extract that value
as its scalar witness value; unreferenced, unpinned scalar cells can be zero.
Every original equation is present in a stage and uses those extracted values,
so every original scalar residual vanishes. Boundary equations bind the extracted
values to the declared public pins. Slot reuse does not affect this argument
because simultaneously live wires cannot alias.

Raw row verification must enforce exact row count, exact width of every row and
`cell < p` for **every** cell, including inactive slots, before evaluating fixed
polynomials and carry/zero/boundary equalities. It must check each equation, not a
fixed unchallenged sum in which residuals can cancel. It must not call witness
recipes, trust interval annotations or require honest recomputation as a
substitute for accepting arbitrary canonical field rows. Honest witness packing
is a separate convenience path.

## Required coherent adversaries

| Case | Required observation |
| --- | --- |
| Change a carried value and recompute every dependent cell after the split | Later local equations may remain valid; the first crossed carry equality rejects. Test early, middle and last carry edges. |
| Supply two locally valid branches of one execution around a stage boundary | Copy relations reject the splice, including derived-range and ROM intermediates. |
| Consistently replace all copies of an input and its descendants | Internal equations may hold; the fixed stage-zero public input rejects. |
| Change a final public output, or consistently change its last-row copy | Output boundary or preceding carry rejects. Test duplicate output pins with contradictory claims. |
| Reuse a freed slot for an unrelated wire with a different value | Honest witness passes without a spurious old-to-new carry. Wires sharing a stage never share a slot. |
| Change an inactive cell to one, or write `p` in any cell | Zero equation or canonical-field admission rejects, including otherwise untouched rows. |
| Drop, append, duplicate, truncate or reorder rows; alter a row width | Exact shape or compiled positional equations reject. |
| Use only an unchanged constant output while forging a disconnected false assertion | The original assertion still rejects; no output slicing is permitted. |
| Use a contradictory constant-only equation or a constraint-free circuit | The former rejects; the latter obeys its explicitly fixed empty layout. |
| Mutate signed division quotient/remainder, comparison bits/slacks, equality inverse, ROM index/padding, and narrowed result coherently | The same retained scalar obligations reject after remapping. Include the previous Goldilocks alias and unused-ROM-branch regressions. |
| Select foreign typed pins with the same index/bounds, invalid indices, zero/overflowing budgets or excessive dense dimensions | Construction rejects through explicit validation, without partial publication of a schedule. |

For small circuits, exhaust every raw cell mutation and compare scalar verification
with scheduled verification after packing; independent coherent forgeries remain
necessary because isolated mutations usually exercise only one easy equation.
Build the same circuit and schedule twice to compare deterministic layouts and
counts. Pin source, scalar circuit, public binding order and schedule parameters
in each qualification record.

## Resource accounting

Let `E` be original equations, `B` their per-stage budget, `S` stages, `W` columns,
`V` live wires, and `length(w)=last(w)-first(w)+1`. Without extra stages,
`S=max(1,ceil(E/B))`. Define:

```text
K = sum length(w)                 active cells
C = sum (length(w)-1) = K-V       carry equalities
Z = S*W-K                        inactive-cell zero equalities
P = input pin count + output pin count
total equalities = E+C+Z+P = E+S*W-V+P
dense field bytes = 8*S*W
```

These counts assume one equality per carry, inactive cell and public pin. They
show why a small original-equation budget is not automatically cheap: increased
row count can make carry/zero work dominate. With outgoing carries assigned to
the current row, carries plus inactive zeros use at most `W` constraints there;
boundary pins add their own work. Report maximum total constraints per row,
linear/quadratic terms, active and inactive cells, longest lifetime, peak width,
dense bytes, construction time and peak resident memory. Report witness packing
and raw verification separately. Streaming two neighboring rows can reduce raw
verification memory but does not reduce a prover's committed trace/LDE cost.

The existing scalar artifact records these counts (not staged measurements):

| Per simulated tick | 2 cars | 8 cars |
| --- | ---: | ---: |
| Original equations | 459,907 | 3,095,060 |
| Scalar witness cells | 286,655 | 2,294,085 |
| Stages at budget 256 | 1,797 | 12,091 |
| Stages at budget 4,096 | 113 | 756 |

The artifact is `artifacts/street-constraints.json`, SHA-256
`d631a7a86f4ec053731ceb96f3cbdcd8c160aff232aa674d81bcf40165e0dcbb`
at review time. Stage counts in the table are simple ceiling arithmetic, with no
measured width or feasibility implication. Repeating 12,091 stages for 9,000 ticks
would already require 108,819,000 rows before extra boundary/padding rows. Naively
materializing the eight-car scalar witness separately for 9,000 ticks is
165,174,120,000 bytes before staging, commitments or LDE. These arithmetic examples
are resource warnings about the proposed representation, not proving benchmarks.

## Degree and remaining qualification

Fixed remapping preserves degree at most two **in row witness cells**. Copy,
zero and public boundary equations have degree one. That fact alone is not an
AIR composition-degree bound. If row-specific coefficients or stage selectors
become univariate polynomials, their degrees contribute: a selector of degree
`d` multiplying a quadratic trace expression can reach `d+2*(N-1)` before the
appropriate vanishing-factor division. Even verifier-fixed tables require an
explicit preprocessed-column/domain design. Witness-supplied selector bits need
their own binding and cannot replace the fixed schedule.

The actual AIR must account for periodic selectors, next-row wraparound,
first/final rows, power-of-two padding, all constraint vanishing sets, quotient
degree and LDE domain size. Do not carry the scalar `max_degree=2` label into a
FRI/soundness estimate without that derivation. Generic profile admission must
resolve the immutable compiled relation and schedule; a prover-selected alternate
schedule or geometry table constructs a different relation.

This schedule binds one scalar invocation to its declared boundary values. It
does not yet bind adjacent **simulation ticks** to each other's state, constrain
the accepted controls/transcript, authenticate keys or disputes, or establish
initialization, full-race termination and padding. Those are additional outer
execution constraints. Network, game instance, rules, roster, input-key and
ledger-derived result bindings remain required. Structural staging, passing raw
row tests and exact ROM constants establish no STARK security level, proof size,
validator cost, finalized ledger inclusion, consensus settlement or Taira rollout
qualification.
