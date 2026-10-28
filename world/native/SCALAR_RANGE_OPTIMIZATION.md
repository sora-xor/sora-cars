# Derived scalar ranges: sound first reduction

The first safe reduction removes redundant result decompositions from **add,
subtract, multiply and select only**. Keep their operation equations and derive
their result intervals from already proved operands. Preserve every genuinely
narrower range, all external input ranges, all comparisons and all division and
remainder obligations.

On the pinned eight-car baseline, this removes 2,547,123 of 4,310,432 equations
(59.09%) and 2,424,762 auxiliary bit wires. The exact projected result is
**1,763,309 equations and 1,610,782 wires per simulated tick**. This is still far
from a practical complete racing AIR. Geometry, trace continuity, authenticated
inputs, the stage/copy schedule and cryptographic qualification remain open.

## Reproducible accounting

The baseline helper SHA-256 is
`c42473135b61445d4be0ee2db473e5749d85c6a8285c7d72e75f5a0f05837f76`.
The measured native graph has 101,808 nodes and the same 910 assertion nodes as
the street hazard proof inventory. The baseline lowering report is
`output/qualification/street-checked-lowering/report.json`.

`output/qualification/street-range-optimization/` retains byte-for-byte copies of
all ten native modules, the baseline harness, source pins, `measurement.rs`, its
binary and `report.json`. The measurement uses only public `Circuit` constructors,
returned immutable `Bounds`, equation/wire counts and `PolynomialView` exports.
It does not rewrite the helper or bypass its private provenance. It reproduces
the baseline totals exactly before predicting any elimination.

Run from the repository root:

```sh
rustc --edition=2024 -O -A dead_code output/qualification/street-range-optimization/measurement.rs -o output/qualification/street-range-optimization/measurement
output/qualification/street-range-optimization/measurement 8
output/qualification/street-range-optimization/measurement 2
```

For an ordinary result interval of width `W`, the current exact-range gadget adds
`2*bit_length(W)+2` equations and `2*bit_length(W)` auxiliary wires. Singletons add
one equation and no auxiliaries; `[0,1]` uses one Boolean equation and no
auxiliaries. The instrumenter checks that each add/sub/mul call contributes this
range cost plus its operation equation, and each select contributes its range
cost plus Boolean-selector and select equations. It then calls the original
`constrain_range` and counts all actual narrowing work separately.

| Operation | Eight-car nodes | Removable result-range equations | Removable auxiliary bit wires |
| --- | ---: | ---: | ---: |
| Add | 5,010 | 243,738 | 233,744 |
| Subtract | 18,125 | 414,869 | 387,512 |
| Multiply | 22,450 | 882,943 | 848,474 |
| Select | 29,127 | 1,005,573 | 955,032 |
| **Total** | **74,712** | **2,547,123** | **2,424,762** |

All **8,080 actual narrowings**, their **304,162 equations** and their **288,912
wires** remain. This includes all 910 assertion singletons. The corresponding
two-car prediction is 229,866→122,092 equations and 212,702→110,952 wires, retaining
all 595 narrowings and 121 assertion singletons. These are baseline accounting
predictions, not passing tests for an optimized implementation.

## The invariant that permits removal

Every public integer wire must have a proof of this statement:

> There exists one uniquely represented signed integer in this wire's immutable
> interval whose canonical field encoding equals the wire's field value.

The invariant may arise from an explicit exact-range gadget, a fixed constant
equation, or a checked arithmetic induction rule. **Raw interval metadata alone
never establishes it.** An externally supplied integer, geometry placeholder or
new unconstrained stage input always needs an explicit range proof or a completed
copy argument to an already proved value.

For each of the four permitted operations:

1. Check that all operands belong to this circuit and retain the invariant.
2. Compute the complete natural output interval using checked `i128` arithmetic.
3. Require ordered endpoints strictly inside the existing ±2^50 public domain.
4. Keep the defining operation equation, with the existing envelope checks.
5. Issue the result wire with private derived-range provenance. Do not emit a
   fresh result decomposition whose truth follows from steps 1–4.

The defining field equation determines the output field element uniquely from
the operand elements. The full mathematical result lies in the statically
computed supported interval, which has width below Goldilocks. Consequently its
canonical encoding has precisely the signed interpretation certified by that
interval. No assumption about an unproved output range is used in the argument.

The helper should express this distinction with a private constructor or private
provenance variant. Do not add a caller-controlled `range_proven` Boolean, a public
unchecked wire constructor, mutable bounds, or an imported token that merely
asserts somebody else checked a range. `Wire` owner/index/bounds checks and the
closed constructor vocabulary must remain intact. A marker is useful only when
every construction path actually proves its assertion.

## Operation-specific induction

Let `a∈[La,Ha]`, `b∈[Lb,Hb]` be proved signed operands.

| Operation | Complete natural interval | Equation that must remain |
| --- | --- | --- |
| Add | `[La+Lb, Ha+Hb]` | `out-a-b=0` |
| Subtract | `[La-Hb, Ha-Lb]` | `out-a+b=0` |
| Multiply | Min/max of all four endpoint products | `out-a*b=0` |
| Select | `[min(Lyes,Lno), max(Hyes,Hno)]` | `out-no-c(yes-no)=0`, with proved Boolean `c` |

For multiplication, compute **all complete endpoint products**, not a claimed
output interval from the native node annotation. Refuse an out-of-domain natural
product even if a later range or branch claims a small result. A nonlinear field
congruence does not establish an arbitrary small integer interpretation.

The current envelope checks remain conservative construction guards. Their
reasoning must continue to use proved operand intervals and complete mathematical
results, not metadata whose proof was just removed. For example, the alias
`a=2^32`, `b=2^32-1`, `out=-1` makes `a*b-out=p`. Each component is individually
small, but the full mathematical product violates the normal interval contract.
The optimized multiplier must reject this plan rather than infer `out=-1` from
the zero field residue.

For select, `c` must already be proved 0 or 1. The first pass deliberately keeps
the existing selector Boolean reassertion as well as the select equation. Both
branch computations remain constrained even when unselected. If the derived
result interval is `[0,1]`, its own Boolean equation can be omitted because the
proved selector chooses between two already proved Boolean integers. This does
not justify removing independent comparison-result Booleanity or input bits.

Derived singleton results are likewise fixed by the retained operation equation
and proved operands. Removing their redundant result-range equation is safe;
removing the equations that establish an input constant or a **new narrowing to
a singleton** is not.

## Narrowed bounds are different obligations

After deriving an operation's complete interval, the graph may declare a proper
subset. `constrain_range` must continue to prove the intersection and connect its
new wire to the original operation result. Merely replacing stored bounds would
invalidate the invariant above.

The central example is `require_true(flag)`: its underlying select naturally has
range `[0,1]`, while its graph result requires `[1,1]`. The optimized select may
drop its redundant `[0,1]` result Boolean equation, but the new singleton equation
and copy relation must remain. Otherwise a disconnected assertion can become
false while all visible outputs remain unchanged.

Many min/max/clamp operations also declare bounds tighter than the plain select
union. Their comparisons and selected branches may allow a stronger induction
lemma eventually. This first pass has no such lemma: retain their explicit
narrowing gadgets. Do not label them redundant merely because honest executions
never reach the wider values.

Already implied or identical intervals may continue to reuse the same wire, as
the baseline does. The 8,080 measured narrowings count actual added proof work,
not every request to `constrain_range`.

## Equations and witnesses that stay

- State/action input ranges and the ranges on unresolved geometry placeholders.
  Geometry range proofs still do not prove authenticated table membership.
- Constant equations, true narrowed-range equations, copy relations and all 910
  eager assertion constraints, including disconnected and inactive branches.
- Strict-less result Booleanity, both comparison implications, every active
  slack's bit equations and canonical inactive-slack equations.
- Equality Booleanity, both inverse-based implications and the equal-case inverse
  zero equation.
- All variable-division and remainder result/absolute/remainder/quotient ranges,
  sign constraints, reconstruction equations, strict `R<B` and alias-envelope
  checks. Those helpers need a separate reviewed induction before any reduction.
- Per-node operation equations, including operations whose outputs are not used.
  No output slicing or exception based on activity is introduced.
- Every future trace/stage input's proof or authenticated copy relation. A
  provenance argument within one acyclic scalar circuit cannot silently become
  a range claim for unrelated field cells in another row.

The baseline polynomial export contains 29,102 repeated Boolean equations and
3,113 syntactically empty zero equations. They are separate possible reductions;
their counts are **not** included in the projected savings above. This first
pass does not change comparison/slack semantics or introduce equation
deduplication.

## Adversarial acceptance requirements

Retain the baseline raw-field tests and add these optimization-specific cases:

1. **Unproved input:** an arbitrary field element with metadata `[0,1]` must never
   acquire derived Boolean provenance. The affine selection forgery
   `c=1/2,yes=2,no=0,out=1` must still fail a Boolean equation.
2. **Narrowed assertion:** build `flag[0,1]`, `require_true(flag)`, and disconnected
   constant output9. Assign every nonconstant scalar wire coherently to zero and
   restore constant wires. The visible output stays9; the assertion singleton
   must reject without relying on stale arithmetic dependents.
3. **Natural versus claimed bounds:** multiplication with the modulus alias
   above must reject before circuit mutation. Add/subtract must also reject a
   natural interval outside the supported domain even if later code requests
   a narrower interval.
4. **Inherited constraints:** corrupt an unselected derived arithmetic branch
   and recompute its downstream values. Its defining equation or retained true
   narrowing must reject even though the selected public output is unchanged.
5. **Boolean chains:** feed Boolean arithmetic results through further selects;
   test both branches and directly mutate the intermediate field values. The
   optimized proof must derive Booleanity from the retained operand equations,
   not accidentally lose it by deleting a duplicate-looking bit equation.
6. **Ownership and stage boundaries:** reject foreign wires with matching
   indices/bounds. An exported fixed layout must include every dependency needed
   for induction and retain copy relations when values cross rows/stages.
7. **No unrelated deletion:** actual optimized counts must equal the projected
   totals when applying only this rule. Investigate discrepancies instead of
   accepting a smaller number as automatically better.

Run the full scalar lowering over the same native graphs and input fixtures;
compare every original graph-node value to the native evaluator. Test raw field
mutations for all assertion nodes and the sampled arithmetic/comparison/selection
nodes, independently of honest witness generation. Keep explicit wrong-geometry
tests demonstrating that zero scalar residues cannot satisfy the missing lookup
obligation. These tests are necessary evidence, not a substitute for the induction
argument or later STARK soundness analysis.

## What remains after the first pass

| Remaining eight-car work | Equations per tick |
| --- | ---: |
| Strict comparisons and their auxiliaries | 1,036,143 |
| True output narrowings and copy relations | 304,162 |
| Division helpers | 242,412 |
| Four retained operation relations, including selector Boolean reassertions | 103,839 |
| Remainder helpers | 50,169 |
| Equality helpers | 20,032 |
| External input and geometry-placeholder ranges | 6,353 |
| Constants | 199 |
| **Total** | **1,763,309** |

The next practical work is a measured stage/copy/range-bank schedule and reviewed
reuse of already established comparison/range information. Authenticated geometry
must be added as real equations or a sound lookup argument. Reducing local row
equations does not by itself reduce a complete proof to the existing protocol's
width/row limits, qualify its degrees or establish the required ≥128-bit target.

## Independent implementation spot-check

The implemented helper was independently inspected at SHA-256
`af8fbcf25c75d2addcf13c38129f24f66bf6ff6ae85b4066671ec5f8ccdd4da8`.
Its private `Derivation` enum accepts only the four reviewed operations and
owner-checked `Wire` operands. It computes complete natural intervals and checks
envelopes before mutation, keeps defining equations and selector Booleanity, and
records private derived provenance. True narrowings still use the explicit
constructor. No scalar soundness defect was identified in this spot-check.

A separate temporary Rust probe compiled the actual optimized helper against the
pinned native graph/lowering modules. It independently reproduced both predicted
counts exactly: 122,092 equations / 110,952 wires for two cars, and 1,763,309
equations / 1,610,782 wires for eight. It found 74,712 derived result wires in the
eight-car circuit, matching precisely the four operation counts above. The helper
source hash stayed unchanged throughout the probe.

The probe also submitted the coherent disconnected assertion forgery described
above: output9 stayed unchanged, every nonconstant scalar was assigned zero, and
exactly one retained singleton residue rejected it. Unresolved geometry remained
an error in both complete graph constructions. Evidence is retained in
`output/qualification/street-range-optimization/optimized-spot-review.json`.

The implementer's separate candidate report at
`output/qualification/street-checked-lowering/derived-range-candidate/report.json`
matches the same helper hash and records 14 helper tests plus three lowering tests,
1,221,696 original-node parity values over 12 eight-car ticks and 1,658 rejected raw
node mutations. These tests and the spot-check support this scalar optimization;
they do not discharge geometry, full-trace, public-statement or STARK obligations.
