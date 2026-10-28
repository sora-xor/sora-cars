# Checked scalar constraint obligations for the street draft

This is an independent arithmetic design review of the proposed std-only checked
lowering. It specifies field equations and adversarial witness tests; it does not
qualify a STARK, street profile, consensus transition or settlement. Maintained
Iroha was read only. No Cargo/dependency build or maintained source edit was made.

The implementer is adding `checked_constraints.rs`; the parent is adding a closed
all-node street lowering. The equations below must be present in the constraint
system, not only in an honest Rust witness generator. A report of zero scalar
residues with unresolved geometry must remain explicitly incomplete.

## Evidence and scope

Inspected on 2026-09-07:

| Source | SHA-256 |
| --- | --- |
| `../iroha/crates/iroha_core/src/execution_proofs/integer_air.rs` | `5d591f0009d21ae8de8e79e8be48db83bf662bf7351d676b9a94410708d01d32` |
| `../iroha/crates/iroha_core/src/execution_proofs/checked_integer_air.rs` | `b579ccc43663fc8a0377b2937395ff4e1148f39eb9b45b07274d95899b78a6a1` |
| `output/qualification/street-hazard-proof-inventory/inventory.json` | `e8c1cdabe24df8c324161c22fd4e127c90bdf3b2388acd24c870687686db8172` |
| `output/street-race/tokyo-1986-8.json` | `6252044dafbd15986aeb3d5bf703ee0bc8c6298edb5e9754f7e3f81be3017642` |

The frozen bundle contains 101,808 nodes, 416 positive variable divisions, 953
nonnegative constant remainders and 910 singleton assertions. All 910 assertions
are outside the output backward slice. The inventory separately identifies 80
geometry calls and 40 distinct progress arguments. These counts belong to that
bundle hash; later source additions need fresh measurements.

The maintained raw `IntegerAirV1::input` creates interval metadata without proving
it. Its `select` equation does not itself prove selector Booleanity. The maintained
checked helper does emit range/Boolean equations, but its endpoint limit is
±2^45 and the module remains test-only. Its constant-divisor API is not a variable
division gadget. The executable `export_graph` intentionally omits constraint-only
witnesses and cannot serve as a proof interchange format.

## Integer meaning of a field witness

Use Goldilocks `p = 18,446,744,069,414,584,321` and canonical field representatives.
An integer `z` means the field encoding `z mod p`. Signed meaning comes from a
proved interval of width below `p`; it must never come from casting the canonical
unsigned residue to an `i64`. A raw witness verifier should reject noncanonical
field encodings, or canonicalize them through a single documented field API.

The proposed normal interval constructor admits ordered endpoints strictly inside
±2^50. Auxiliary widths, differences and decomposition sums can exceed 2^50 even
when both ordinary endpoints obey that limit. Derive those auxiliary bounds with
checked `i128` arithmetic; do not silently narrow them or reuse the old helper's
`bits < 50` precondition. Reject unsafe construction before mutating the circuit.

Opaque wires must retain owner identity as well as index and bounds. Matching
indices from different circuits are not interchangeable. A caller must not be
able to replace interval metadata on an already constructed wire.

For every equation intended as integer equality, prove that its entire integer
residual lies strictly between `-p` and `p`. Bounding each participating witness
below `p`, or even below 2^50, is insufficient for multiplication and division.
Use the actual allowed auxiliary ranges, including binary decomposition slack,
rather than bounds that an honest witness happens to satisfy.

## Exact signed range and Boolean constraints

For `[L,H]`, let `W=H-L`. A direct exact-range construction is:

```
Y = Σ 2^i y_i             Z = Σ 2^i z_i
y_i(y_i-1) = 0            z_i(z_i-1) = 0
x - L - Y = 0            H - x - Z = 0
```

Use `k=ceil(log2(W+1))` bits for each slack; for `W=0`, emit `x-L=0` without
unnecessary slack columns. The equations imply `Y+Z=W` as integer equality once
`2(2^k-1)+W < p` is established. Therefore `0<=Y<=W` and `x=L+Y` is the unique
signed representative in the declared interval. This excludes the power-of-two
slack above `H`; proving only a bit decomposition of `x-L` does not.

With the normal endpoint limit, `W<2^51`, `k<=51` and the conservative sum bound
is far below `p`. Every bit equation must be checked even when the value is used
only in an unselected branch or an inactive stage. Radix-four digits are an
alternative only with `d(d-1)(d-2)(d-3)=0`, correct weights and a separate bound
for the actual decomposed ceiling. Booleanity is always the explicit equation
`b(b-1)=0`; interval metadata `[0,1]` is not a substitute.

All graph inputs, operation results whose intervals narrow their natural range,
and singleton assertions need exact range obligations. An optimization may reuse
established bounds only through checked arithmetic induction. The initial
all-node lowering should prefer explicit obligations over unproved elimination.

## Bidirectional comparisons and equality

The implementer's selected strict-less construction uses Boolean `t`, nonnegative
binary slacks `U,V`, and:

```
t (b-a-1-U) = 0
(1-t) (a-b-V) = 0
```

When `t=1`, the first equation proves `a<b`; when `t=0`, the second proves `a>=b`.
Both `a` and `b` need established signed ranges. Bound each active residual using
the actual bit ceiling of its slack and exclude multiples of `p`; these residuals
can involve differences above 2^50. The maximum ordinary signed difference is
below 2^51, so appropriately sized slacks remain practical over Goldilocks.
If canonical inactive slacks are promised, also constrain `(1-t)U=0` and `tV=0`.
Generating zero auxiliaries without those equations does not enforce that promise.
Unconstrained inactive slacks do not invalidate the comparison if they are ranged
and never reused, but they must not be described as uniquely canonical.

An alternative shifted-difference/top-bit gadget is also valid: choose a strict
power-of-two offset `T > max |a-b|`, decompose `a-b+T` into its full width, and
set `t=1-top_bit`. Using a non-strict offset or too few bits mishandles endpoints.
The two constructions must not be mixed in a way that loses one implication.

For equality `e=[a=b]`, use a Boolean `e` and an inverse witness `I`:

```
D = a-b
e D = 0
D I = 1-e
```

The first equation forbids `e=1` when `D!=0`; the second forces `e=1` when `D=0`.
There is no integer range obligation on `I`: it is a field inverse witness. The
signed operand intervals must ensure `a-b` cannot be a nonzero multiple of `p`.
At `D=0`, the inverse can remain arbitrary unless the design explicitly requires
canonical zero and adds `e I=0`. Neither a Rust equality branch nor only one of
the two equations provides the intended Boolean relation.

## Select, eager branches, assertions and padding

For `out=select(c,yes,no)`, independently constrain `c(c-1)=0` and:

```
out - no - c(yes-no) = 0
```

Both branch computations and their declared ranges remain constrained. A false
selector does not authorize an impossible quotient, a negative nonnegative
remainder input, or an out-of-range value in the other branch. With Boolean `c`,
the selected integer is one of the two ranged operands; also enforce a narrower
output interval when the graph declares one.

In particular, `require_true(c)` is encoded as `select(c,1,0)` with output `[1,1]`.
All such nodes need both the select relation and the singleton range even if no
executable output depends on the node. Preserving only the public output slice
would remove every one of the frozen bundle's 910 assertions.

The same rule applies to inactive cars and terminal padding. Dataflow still
executes; activity controls which values carry, not which scalar constraints
exist. A later stage schedule may gate ordinary equations only using a
verifier-fixed or fully constrained stage selector, with copy/carry constraints
and all required bit/digit range equations. Honest zero padding is not evidence
that adversarial nonzero padding is rejected.

## Signed truncating division by a positive variable

For `q=trunc(a/B)` with proved `B>=1`, introduce:

```
s = [a<0]               A = (1-2s) a
Q >= 0                  q = (1-2s) Q
0 <= R < B              B Q + R - A = 0
```

Prove `s` with the strict comparison gadget; a freely chosen sign bit is
insufficient. Prove `A` and `Q` nonnegative with correct maximum magnitudes,
prove the signed output interval of `q`, and constrain `R` both nonnegative and
strictly below the actual variable `B`. A range `[0,Bmax-1]` alone is insufficient.
At `a=0`, the sign is canonically zero; the reconstruction and bounds force
`Q=R=q=0`. Negative inputs with magnitude below `B` still produce quotient zero.

Preflight a bound for the **whole** reconstruction residual. A conservative
sufficient test is:

```
Bmax * Qmax + (Bmax-1) + Amax < p
```

Tighter signed interval envelopes are possible, but equality at `p` is unsafe.
Unsafe plans must fail before adding witnesses/constraints, or use an explicitly
constrained limb-and-carry multiplication/division construction. Do not reduce
the product modulo `p` and then compare that reduced value to the integer bound.
The absolute-value/sign equations also require their own lift bounds.

All 416 frozen street division envelopes fit below `p` after real range proofs.
The largest conservative bound is `415,977,588,223,999`. This is a property of
these exact operand ranges, not permission to accept all individually small
components in the reusable helper. The hazard window code divides before
clamping; raw quotient witnesses reach 393,287,535 longitudinally and
1,448,411,135 laterally. Giving those raw witnesses a 17-bit subtick range would
change the eager computation rather than prove it.

## Euclidean remainder is a separate contract

The current `street_graph::remainder` accepts only a proved nonnegative operand
and a positive fixed divisor. Its circuit wrapping first shifts the operand into
that nonnegative domain. Lower this as unsigned `a=dQ+R`, `Q>=0`, `0<=R<d`, with
the same reconstruction/lift obligations. Do not silently expand that graph API
to signed inputs when translating it.

A future general signed Euclidean remainder must use `a=dQe+R`, `0<=R<d`, where
`Qe=floor(a/d)` for positive `d`. It is not `a-trunc(a/d)*d` for negative `a`.
For example, `a=-7,d=3` has truncating quotient `-2`, Euclidean quotient `-3`, and
Euclidean remainder `2`. Any shortcut via truncation needs an explicitly proved
negative-and-nonzero-remainder adjustment. The geometry lowering will need this
distinction for circuit laps, negative grid positions and reverse movement.

## Modular aliases that component ranges do not prevent

Two concrete counterexamples must remain regression fixtures for constructor
admission and raw field residues:

1. Division: `A=0`, `B=1,048,576`, `Q=17,592,186,040,320`, `R=1` satisfies
   `B*Q+R-A=p`. Every component is within ±2^45 and `0<=R<B`. A zero field
   reconstruction residue therefore proves the wrong integer quotient if the
   unsafe envelope is admitted.
2. Multiplication: `a=2^32`, `b=2^32-1`, `out=-1` satisfies `a*b-out=p`. All
   three component values are inside ±2^50. The equation `out-a*b=0` over the
   field alone accepts this impossible integer product. Compute the envelope
   from operand ranges plus output range and reject it, even if each wire has
   its own valid exact range proof.

The normal street builder already restricts full mathematical product bounds,
but the reusable checked helper must enforce its own contract. These examples
are intentionally outside the frozen graph's admitted reconstruction envelopes;
they demonstrate a generic failure that honest current inputs cannot expose.

## Required adversarial witness matrix

Tests must call the polynomial residue verifier on canonical field assignments.
Do not pass the forged assignment through an honest integer witness constructor
that rejects it before any equation is checked. Recompute all affected arithmetic
auxiliaries whenever possible, so a test fails for the missing semantic constraint
rather than only because one stale dependent witness was left inconsistent.

| Obligation | Honest boundary cases | Coherent adversarial assignment |
| --- | --- | --- |
| Exact range | `[-10,17]` at -10,0,17; singleton7; intervals crossing0; widest supported endpoints | Set `x=18`, shifted slack28 with valid5-bit digits; the upper slack must reject. Test -11, field1/2, and singleton8 with recomputed auxiliaries. |
| Boolean/digits | 0/1 and radix-four0–3 | Field1/2,2,-1; for select `c=1/2,yes=2,no=0,out=1` satisfies affine selection but must fail Booleanity. |
| Strict less | equal operands; -1<0;0<-1; extreme signed differences | Flip `t` and recompute the active slack as a field value; its nonnegative decomposition/lift must reject. Include exact equality and both signs. |
| Equality | equal7/7 and unequal7/8 | For equal operands set `e=0`; for unequal set `e=1,I=0`; test fractional `e` and coherently recomputed inverse. Each implication needs its own test. |
| Select and unused nodes | both selector values; valid unused branch | Corrupt only an unselected branch and recompute consumers, leaving public selected output unchanged. Force a singleton assertion's condition0 while retaining out1. Both must fail. |
| Signed division | -7/3=-2,R1; -1/2=0,R1; -6/3=-2,R0;0/B; positive exact division; maximal admitted denominator | Change `Q→Q+1,R→R-B` or `Q→Q-1,R→R+B` so reconstruction stays zero; strict remainder/sign/range must reject. Flip quotient sign while retaining magnitude, fake `s=0` for a negative input, and submit B=0. |
| Nonnegative remainder | 0,d-1,d,d+1 and large admitted values | Change `Q,R` coherently by one divisor; reject negative input in the current graph API. A separately implemented signed API must check -7 mod3=2, not -1. |
| Alias admission | all416 exact frozen envelopes accepted if otherwise within helper bounds | Show the two counterexamples above have zero raw reconstruction residue; assert unsafe-plan rejection before mutation. Reject equality at the modulus threshold. |
| Inactive/padding | zero activity with unchanged state; fixed stage carries | Keep final output unchanged but alter an inactive branch's scalar witness/range. If canonical auxiliary zeros are promised, nonzero inactive comparison/inverse auxiliaries must fail their own equations. |
| Ownership/failure atomicity | same-owner operands and valid plans | Cross-circuit wires with identical index/bounds, reversed intervals, overflowed i128 calculations and unsafe envelopes must reject without changing circuit size. |

Also construct valid witnesses with the verifier independent of the witness
generator's host branches, then verify them. Merely mutating an output by +1 is
useful smoke coverage but cannot detect a coherently forged arithmetic proof.

## All-node lowering acceptance and remaining obligations

The lowering report should enumerate every original node and its scalar relation,
exact-range obligations, source wire identity and emitted constraint identifiers.
Track all 910 assertion nodes explicitly. Count field columns, bits, equations,
maximum degree and interval envelopes by operation. Source pins must bind the
closed native graph and catalog constants; arbitrary uploaded graphs remain
outside compiled profile admission.

Geometry outputs may be ranged symbolic inputs during this bounded prototype,
but the report must list every unresolved query and keep `complete=false`.
Host lookup values can build an honest test witness; they cannot satisfy the
missing table membership, canonical adjacent-cell, interpolation, lap/winding and
endpoint constraints. Include a negative test where a wrong but in-range geometry
value and recomputed downstream scalars satisfy the partial system, and assert
that this cannot be reported as a complete execution proof.

Subsequent work must prove tick/genesis continuity, all carried car/world state,
catalog/rules binding, accepted signed inputs, forfeit authority and retained
dispute history. Then measure a practical stage/copy/range-bank layout for full
eight-car duration. Raw row equations are not yet DEEP-ALI/FRI constraints, and
their local algebra does not establish commitment security, Fiat–Shamir binding,
composition degree accounting, validator cost or the required ≥128-bit target.

Design feedback sent to the implementer: use actual decomposed slack ceilings in
lift bounds; constrain canonical inactive auxiliaries if claimed; retain both
equality implications; reject both generic alias envelopes; expose raw canonical
field residue testing separately from honest integer witness generation.

The initial helper source was subsequently inspected during implementation. It
uses owner-tagged opaque wires, two explicit binary range slacks, the two gated
strict-less equations, both inverse-based equality equations, a Boolean select,
signed truncating division, and a separate signed floor-quotient Euclidean
remainder. Its raw `verify`/`residues` entry points inspect canonical field
witnesses and polynomial equations rather than replaying host operations. No
scalar acceptance defect was identified in that initial inspection. The
implementer then added aggregate inactive-slack-zero equations and `e*I=0`, making
those auxiliaries canonical; the adversarial matrix above includes direct tests
for both additions. This paragraph records design inspection, not passing test
evidence for a final source identity. Final source pins, measured circuit size and
raw-field test results must accompany the finished implementation separately.
