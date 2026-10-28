# Immutable execution boundary equations

> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


September 8, 2026. `execution_trace.rs` now exposes the exact public boundary
equalities used by its generic raw execution verifier. This complements the
single-step [stage export](AIR_EXPORT_REVIEW.md). Neither API implements a
polynomial commitment or a cryptographic proof.

## Construction and meaning

`TraceVerifier::boundary_air()` returns an `ExecutionBoundaryAir` borrowing the
verifier's already validated, immutable public snapshot. Its fields are private;
it has no public constructor or deserializer. `ExecutionTrace::new` has already
validated every state/output mapping and action column. `verifier` has checked
the nonempty action tape, maximum length, field canonicality and final-claim
shape and copied those public values. Subsequent edits to the caller's arrays
cannot change either the raw verifier or the exported equations.

The view provides the compiled `stage_air`, exact step/row/equation counts,
read-only input sources, actions and final outputs, and a lazy equation iterator.
There are exactly `steps × input_ports + output_ports` outer equalities. This
number excludes the local scalar, lookup, structural and public port obligations
of the single-step stager.

Every exported `ExecutionBoundaryEquation` is `left − right = 0`. Each side is
either a canonical constant or a `{row, column}` in the concatenation of actual
staged steps. The compiler supplies each port's exact stage, column or substituted
constant; the view never derives a port from a witness value or generator recipe.

| Boundary kind | Left side | Right side |
| --- | --- | --- |
| Initial state | Input port of step zero | Compiled initial constant |
| Public action | Input port of that step | Snapshotted public action cell |
| State carry | Input port of step `s > 0` | Mapped output port of step `s−1` |
| Final output | Output port of the last actual step | Snapshotted final claim |

With `R` single-step stage rows, a port at stage `j` in step `s` addresses row
`sR+j`. The total row count uses checked multiplication before any equation is
exposed. Nonempty tape admission prevents a final-step underflow. Constant
substitution retains constant-only equalities, including contradictions. Aliased
and duplicate input/output ports remain separate obligations in their original
order. Constant-time port access avoids a repeated scan for each state carry.

Iteration reads neither the raw verifier's current progress nor its preceding
output claims. It represents the complete immutable public statement before and
after successful raw steps. A poisoned raw stream cannot obtain this view: the
accessor returns `Error::Poisoned` after a failed step. An existing borrowed view
also prevents mutating the verifier during that borrow under Rust's lifetime
rules.

## Validation

Five focused execution tests pass in the standalone Rust harness at
`output/qualification/execution-air-export`. The three existing tests continue
to exercise public state/action bindings, coherent state splicing, wrong actions,
invalid public shapes, exact lengths, final claims and poisoned streams.
The final combined build also passes all 58 helper, stage and execution tests
against the final stage-export source, including those same five execution tests.

Two new tests evaluate the exported equalities directly against staged rows:

- Caller-side source/action/final mutations leave the snapshot unchanged. Honest
  three-step rows satisfy every exported boundary. A replacement step that
  passes the complete standalone scalar and stage verifiers fails the expected
  outer carry or action equality. Iteration is unchanged after raw progress and
  denied after raw failure.
- Duplicate state ports remain duplicated, including their diagnostic identity.
  A substituted fixed input with a contradictory public action produces an
  explicit constant-only failure. A contradictory fixed final output also
  remains an explicit failure.

An independent read-only review found no concrete mismatch between exported
initial/action/carry/final equations and the raw verifier. It checked the source
pins and five-test log. This is implementation review, not an independent
cryptographic security review.

The additional `scripts/test-street-air-rows.ts` qualification uses the real two-
and eight-car native Street graphs for three ticks, rather than only the small
unit fixtures. A separate diagnostic consumer evaluates the exported predicates
directly with canonical field values and u128 modular arithmetic. The completed
spool is capped at 64 MiB; this checker intentionally reads that bounded fixture
into memory and is not a streaming full-race prover.

| Roster | Polynomials | Memberships | Stage carries | Unused zero cells | Outer equalities |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 cars | 67,512 | 49,716 | 237 | 31,227 | 199 |
| 8 cars | 863,910 | 657,708 | 15,984 | 145,764 | 565 |

Every original polynomial slot and membership occurrence is visited; identity
equations, fresh cells and constant obligations remain accounted for. The
eight-car outer count consists of 91 initial-state equalities, 48 public actions,
182 state carries and 244 final outputs. The producer still runs all-node,
scalar, membership and raw execution-state checks before this independent view
consumer. Both padded row spools match the earlier commitment experiment hashes
exactly. Diagnostic trailing zero rows are checked separately and never counted
as global AIR padding. This establishes fixture parity, not cryptographic
soundness or completed-race admission.

## Required next layers

This is a generic valid-prefix relation, exactly like the existing raw verifier.
It does not assert that a game has finished, that its first terminal tick was
selected, that public inputs were signed or accepted by consensus, or that global
FRI padding obeys a game policy. In particular, there are no silently appended
power-of-two rows in this view.

The [terminal and accepted-history requirements](TERMINAL_BINDING_REVIEW.md)
remain separate mandatory compiled constraints for completed Street results.
The [lookup protocol candidate](LOOKUP_PROTOCOL_V1.md) must incorporate these
outer equations and every single-step obligation into authenticated polynomials,
with selector degree accounting and full DEEP/FRI binding. A consumer that omits
any of those layers has not proved the execution or a settlement result.
