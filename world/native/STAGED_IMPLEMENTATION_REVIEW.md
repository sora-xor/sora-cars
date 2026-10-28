# Staged raw-trace implementation review

> Historical laboratory record. The standalone constraint-plan runners have been retired. Current checks run in the native Iroha Core modules; their compilation and results must be established on the selected revision. Recorded counts below describe the original source, not current proof cost or full-history qualification.


No raw-trace acceptance defect was identified in the inspected scheduler,
multi-step verifier, or native street binding harness. This conclusion concerns
the exact compiled field equations and raw rows. It does **not** qualify a STARK,
the univariate AIR degree, cryptographic soundness, an authenticated action tape,
ledger finality, or settlement.

Reviewed on 2026-09-07 independently of the authors of
`staged_constraints.rs`, `execution_trace.rs` and their binding harness. The
reviewer authored earlier checked primitives; this is not an independent review
of all original arithmetic gadgets. This review changed documentation only and
used no maintained Iroha source writes, Cargo builds or deployed systems.

## Implementation findings

- **Every source polynomial remains present.** `StagedCircuit::new` scans all
  linear terms and both quadratic factors, and copies every polynomial in order
  into owned flattened coefficient arrays. Constants and disconnected equations
  remain. Remapping changes only wire indices to their fixed columns. The source
  circuit can subsequently change or be dropped without changing this schedule.
- **Ownership is checked before using indices.** `Circuit::validate_wire` invokes
  the existing private owner/index/bounds check. Duplicate input/output pins are
  allowed, with separate ordered boundary equalities. This prevents foreign
  circuit handles with identical indices and bounds from aliasing admitted pins.
- **Lifetime coloring uses closed intervals.** Slots are freed only when an old
  lifetime ends strictly before the new start. Input pins extend to row zero;
  output pins extend to the final row. Simultaneously live wires cannot share a
  column. Unreferenced, unpinned source wires cause construction to reject rather
  than silently disappear. A genuinely empty circuit has one exact empty row.
- **Carry and padding are fixed checks.** The verifier advances compiled wire
  owners, compares any continuing owner to the preceding row's same column and
  requires zero in every ownerless column. A newly starting wire in a reused slot
  is not incorrectly copied from the previous, unrelated owner. Exact row width,
  count and field canonicality are checked before polynomial evaluation.
- **Raw verification is separate from witness generation.** `push_row` evaluates
  the retained equations and fixed carry/zero/boundary relations. It never calls
  scalar witness recipes, evaluates the native game or trusts interval metadata.
  `witness_rows` only packs a canonical scalar vector and explicitly does not
  certify its arithmetic. Each residual must vanish individually.
- **Failures permanently poison a stream.** A malformed row, failed boundary,
  local residual or extra row prevents recovery by retrying a corrected row.
  `finish` consumes the stream and requires every row. The outer trace sets its
  poison flag before accepting any claimed output or stage data, clearing it only
  after complete successful verification of that step.
- **The outer trace binds state, actions and final outputs separately.** Compiled
  `InputSource` descriptors are copied. Initial state comes from those descriptors;
  later state comes only from the preceding completely verified output vector.
  Public action rows and the final claim are copied on verifier creation, with
  exact arity, canonical field checks and length limits. The last step must match
  the complete final claim. Missing or extra steps cannot be accepted by `finish`.
- **Native bindings cover all declared ports.** The harness obtains all graph
  inputs and all outputs from the compiled native graph. Controls and
  `consensusForfeit` fields map to distinct public action columns; all other input
  names map to the corresponding preceding output, using the native initial
  input value for step zero. The checked lowering requires compiled geometry and
  has no unresolved geometry input. Output aliases remain explicit public ports.

The comparison/copy branches used by this direct verifier are equivalent to
degree-one equality residual checks over already canonical field cells. They are
not yet an exported cryptographic AIR implementation.

## Regression findings and resolutions

The original implementation already covered each-cell mutations on a small
circuit, slot reuse, exact costs, duplicate pins, ownership/resource rejection,
padding, stream shape/canonicality, disconnected assertions, and a coherent row
splice whose local equations and both public boundaries hold independently.
Only the carry check rejects that splice. A detached-source regression confirms
that later circuit mutations do not change an existing compiled schedule.

Review requested two concrete additions without identifying a production defect:

1. Submit an independently valid native transition with `consensusForfeit=1`
   against a public tape that contains zero for that field. This exercises the
   distinct forfeit action binding, not just the controls binding. The harness
   now constructs and scalar-verifies that witness before the trace rejects it.
2. Retry after a failed final claim or truncated step. The generic trace tests
   now require `Poisoned` on retry and on finalization. The native harness also
   checks poisoned finalization after changed controls, forged forfeit and
   truncated stages.

These additions protect the binding and failure-state behavior; they do not
authenticate consensus authority for a nonzero forfeit. Root reran the complete
qualification after these additions and the scheduler's checked allocation-size
preflight. Source pins and final measured evidence are recorded below.

## Resource and qualification limits

The compiler checks overflow, source sizes, stages, width, dense cells,
constraint totals and individual vector capacity bytes. These remain provisional
engineering limits. A large allowed compiled circuit can still consume substantial
memory; the constructors do not constitute resource metering for untrusted ledger
proof admission.

The exact count identity is retained:

```text
total constraints = original equations + dense cells - source wires + boundary pins
```

The measured eight-car schedule has 189 rows and 22,118 columns per simulated
tick: 4,180,302 dense cells and 4,981,628 total constraints, including 1,204,769
carries, 681,448 padding zeros and 351 boundary checks. Fully materializing this
layout for 9,000 ticks would require **300,981,744,000 bytes** just for raw field
cells. This is arithmetic extrapolation, not a full-race run or a prover memory
measurement. Streaming raw verification avoids materializing the entire trace;
it does not remove a future prover's trace, LDE and commitment costs.

An accepted generic trace proves only the requested finite sequence of compiled
transitions. For example, the harness intentionally accepts three unfinished
driving ticks. The maximum-step bound does not establish race completion, accepted
input signatures, transcript/dispute provenance, canonical terminal padding or
the correct ledger-derived initial/final statement. An admitted application
profile must supply those requirements; callers choosing another initial state,
binding map, action tape or circuit construct a different relation.

Degree at most two refers to raw witness cells. Row selectors, fixed coefficient
tables, boundary/transition domains, last-to-first wraparound, quotient degrees
and polynomial composition remain unqualified. No ≥128-bit security target, full
race proof, supported-target/acceleration parity, finality verifier, consensus
settlement or Taira rollout claim follows from these tests.

## Pinned evidence

The final report is
`output/qualification/street-staging/report.json`, SHA-256
`a022de4c4e5074b54fdd57e9dd77a2ead03cb7f06b59a4e196f57590d559e4bc`,
dated `2026-09-07T12:47:11.350Z`. The reviewer independently checked that all its
current source hashes, frozen source copies, raw log digests, harness digest and
binary digests match. Tests were run by root; the reviewer inspected their
retained output rather than rerunning them or claiming a separate test harness.

| Final inspected source | SHA-256 |
| --- | --- |
| `world/native/checked_constraints.rs` | `60bd62892db2140522e862bd9cfe774b2242c66e8f0355cd7da3d526b5da68a5` |
| `world/native/staged_constraints.rs` | `c40ed5a6801da0ac53ce966d8e21260b2188171f576d7b0bb22d0c0089b91e49` |
| `world/native/execution_trace.rs` | `7aec3b33b0e4ee9da94259b7c3e2a7bee464270a879a99c6b9656aa039b03efb` |
| `scripts/test-street-staging.ts` | `f07f31d2ba5783ab46bb574fe010de8dcb02f1ce440f406aff77992e9efce6f4` |

The retained run passes **32 tests**: 17 checked-primitive, 12 scheduler and three
execution-trace tests. It separately verifies three complete consecutive native
transitions for both two and eight cars. Each roster rejects four boundary/shape
attacks: spliced state, changed control, coherent unauthorized forfeit, and a
truncated stage sequence. The last is a shape attack, not a coherent valid
transition. Exact term remapping and the preservation argument support the
general relation; these bounded fixtures alone do not exhaust it.

| Measured structural harness | 2 cars | 8 cars |
| --- | ---: | ---: |
| Input / output ports | 29 / 112 | 107 / 244 |
| Public action columns | 4 | 16 |
| Rows × columns per tick | 29 × 21,689 | 189 × 22,118 |
| Dense cells per tick | 628,981 | 4,180,302 |
| Total constraints per tick | 802,374 | 4,981,628 |
| Scheduler construction, ms | 44.178 | 349.391 |
| Three-tick honest raw verification, ms | 26.698 | 193.921 |
| Entire harness peak resident bytes | 229,261,312 | 1,721,827,328 |

The verification timer includes row packing and raw checks, after native/scalar
witness construction. Peak memory belongs to the whole harness, including the
native graph, scalar lowering and stored sample witnesses; it is not the memory
of a deployed validator or future prover. The original-equation stage budget is
16,384; extra carry, zero and boundary constraints are counted separately.

The standalone reproduction entry point is retired. Current native regressions are the `execution_proofs::arithmetic::staged_constraints::tests::` and `execution_proofs::guarded::guarded_segment_proof::tests::` Cargo selectors. These execute the selected native source; they do not regenerate the historical measurements below.

The report retains the exact frozen source tree, compiler version, stage limits,
generated Rust harness and machine logs under
`output/qualification/street-staging/`. The historical script checked its producer inventory before compilation and rechecked live and frozen source hashes after that run.
