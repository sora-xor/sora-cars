# Complete execution admission

> Historical laboratory record. The standalone raw-constraint implementation and its runners have been retired. Current implementation and test obligations live in Iroha Core; see the [current foundation goals](../../docs/zk-foundations-goals.md). Source hashes and measurements below describe the original reviewed revision and do not qualify the current verifier.

September 8, 2026. [`execution_terminal.rs`](../../output/qualification/raw-execution-retirement-20261018/preimage/app/world/native/execution_terminal.rs) adds a full-genesis completion policy over the unchanged [`ExecutionTrace`](../../output/qualification/raw-execution-retirement-20261018/preimage/app/world/native/execution_trace.rs). It implements raw field verification and exports the exact additional equality predicates required by a proof compiler. It does **not** lower these predicates into the current lookup proof, authenticate accepted actions, verify finality, authorize settlement, or establish a cryptographic security level.

The distinction identified in [TERMINAL_BINDING_REVIEW.md](TERMINAL_BINDING_REVIEW.md) is preserved: a structurally correct execution prefix remains valid for `ExecutionTrace`, while `CompleteExecution` requires the first halt and its exact cursor. This generic component has no race instruction, racing result projection, or uploaded policy format.

## Compiled policy and exact semantics

The application compiler constructs `TerminalPolicy` with `halt_input`, `halt_output`, `cursor_input`, `cursor_output`, and `max_steps`. `CompleteExecution::new(&program, policy)` attaches it to one verifier-owned structural program. Both selected inputs must be `InputSource::State` with initial value zero and a `previous_output` mapping to the respective selected output. The constructor cannot replace the program's initial vector. Identical halt/cursor port indices are rejected; the validated boundary snapshot also rejects different same-phase port indices that alias the same source wire.

The only supported initial cursor and halt are zero. There is no resumed checkpoint, nonzero offset, or zero-step admission path. All other initial state values come from the structural program's immutable source vector and retain its original input/output binding checks.

For a public action tape of exactly `N` active transitions, the extra equations require:

```text
1 <= N <= policy.max_steps <= 65536

for i in 0..N:
    input_halt(i)    = 0
    input_cursor(i)  = i
    output_cursor(i) = i + 1
    output_halt(i)   = 1 if i == N - 1, otherwise 0
```

These are four independent equalities per active transition. Their expected values are canonical Goldilocks constants. They give an exact integer cursor increment and bound every admitted cursor by `N`; no comparison witness or modular wrap can replace these values because `65536 < p`. The existing structural state carries connect each output to the next input, bind all public action cells, and bind the full final output vector to the last **active** staged row.

The halt port must be the application's compiled halt relation. For Street, the adapter must choose the actual `done` port whose value is constrained by lifecycle state; a proof worker cannot substitute a flag. The generic layer does not infer whether an arbitrary application should halt, or whether every entity in that application has an individually terminal status.

## Proof-facing interface

The main API is:

```rust
let complete = CompleteExecution::new(&execution, policy)?;
let mut verifier = complete.verifier(&actions, &final_outputs)?;
let extra = verifier.terminal_air(compiled_padded_rows)?;

// A proof compiler consumes all three, using the same compiled context:
let stage = extra.boundary_air().stage_air();
let original_boundaries = extra.boundary_air().equations();
let completion_and_padding = extra.extra_equations();
```

`TerminalAir` is private and immutable. Its records expose `left - right = 0` with `ExecutionAirValue::Cell` or `Constant` operands and a specific terminal/padding kind. A fixed-value obligation is retained as an equation, including a contradictory constant equality. Returned records and policy values are copies; changing one cannot alter the compiled object.

`extra_equations()` does not contain the original scalar equations, range memberships, staged carry/zero rules, or structural boundaries. A proof consumer must preserve **all** of them. No raw `finish()` result, generated witness, source recipe, or descriptor digest substitutes for compiling and proving these equations. The existing lookup laboratory has not yet been changed to consume this terminal export.

The canonical descriptor fixes the policy, caps, exact active length, staged row count/width, chosen padding domain, every initial/action source mapping, source wire and port identity, complete public action tape, and complete final output claim. It uses framed fixed-size numeric records and canonical field values inherited from the validated snapshot. It is not a digest of the whole computation: the verifier must separately bind the actual compiled staged program, profile/network context, and accepted-history statement. It cannot accept a descriptor or `TerminalPolicy` uploaded by a prover in place of its admitted compiler configuration.

## Padding is a separate compiled phase

`terminal_air(padded_rows)` accepts a host-selected power-of-two domain at least as large as the active staged prefix. The chosen domain is explicitly included in the descriptor; it may exceed the smallest power of two. The generic structural bounds are at most `2^32` rows and `2^35` additional equations, with checked arithmetic and a 64 MiB descriptor limit. A concrete proof backend must impose tighter domain, degree, blowup, memory, and proof-size limits.

For each row after the active prefix, every original staged witness column `W` is constrained to zero. This phase has no further gameplay actions or native transitions. The final claim still refers to the last active output, even though the padded `W` rows are zero. Stage-local unused-cell zero rules remain separate and unchanged.

These padding predicates address the original staged columns only. Future lookup multiplicity, reciprocal, accumulator, quotient, and FRI columns need their own compiled phase constraints; the terminal policy does not declare them all zero. An absorbing gameplay transition is also different from a padding row: the full-genesis policy rejects an extra action after the first halt.

## Raw verifier and failure behavior

`CompleteVerifier::verify_step` checks the same four terminal port equalities, then calls the unchanged structural verifier to tie those values to the actual rows, original computation, public tape, and preceding state. A wrong terminal/cursor claim, noncanonical output, failed scalar row, missing row, extra step, or padding failure permanently poisons the stream. A poisoned stream cannot provide `boundary_air` or `terminal_air` or be retried as successful.

`verify_padding(padded_rows, rows)` is an optional raw diagnostic. It may be called once, after all active transitions, and checks the exact number, width, canonical encoding, and zero values of the exported padding rows. `finish()` always checks the exact active action count and final-active output. Its `Completion` result explicitly reports `padded_rows_verified: None` if this separate padding diagnostic was not run. Reading a proof-facing export does not itself verify the rows or establish completion.

Accepted-history authentication remains outside this layer. In particular, a signed batch's unexecuted suffix and pending certified inputs must be preserved and reconciled by the history adapter. Numerical controls or forfeits are not consensus authorization. The layer cannot select a worker-chosen earlier close point and silently discard relevant accepted history.

## Focused qualification

The retired std-only harness and its recorded output are historical evidence. Its terminal, carry, action and padding obligations now run in [Iroha Core complete-execution tests](/Users/takemiyamakoto/dev/iroha-sora-cars-native/crates/iroha_core/src/execution_proofs/guarded/complete_execution_tests.rs).

The original runner froze the four native source modules and its own script, invoked the pinned local Rust compiler without Cargo or dependency builds, retained compiler/test output, and rechecked source hashes. [`output/qualification/execution-terminal/report.json`](../../output/qualification/execution-terminal/report.json) records the exact commands, compiler and binary pins, measured duration, and raw output. The eight focused tests passed. The small complete fixture uses three active transitions, fifteen staged rows, eighteen columns, and sixteen padded rows.

The tests cover:

- Honest first-halt completion and direct evaluation of every exported terminal/padding equality.
- A valid structural prefix rejected only by the missing final halt predicate.
- Early halt, appended absorbing transitions, and the corresponding valid one-step completion.
- Nonzero initial halt/cursor, bad carry maps, invalid caps, empty or malformed action tapes, and noncanonical claims.
- Different port indices hiding same-phase source-wire aliases.
- Cursor wrap/incorrect counts and a locally valid execution from a different payload genesis.
- Descriptor changes for full initial state, actions, final claim, maximum steps, and padding domain; mutated exported copies do not alter the relation.
- Missing/truncated/extra steps, wrong padding value/encoding/shape/domain/order, duplicate padding checks, and permanent poisoning.

Source SHA-256: `3041c74d4cbb7bb4d92a26eb57ebc44e83fad165164fb847270b0cf76146c805`.
Runner SHA-256: `ba058e9ce24b988c0e1e51172d3ccff138115691c859f461bbf73107048f4f0e`.
Report SHA-256: `bbd02a6e34d2a3c548f6b91cce5c36bbc2b921040863b078ad59c41b654bf3e4`.

Observed compile time was approximately 2.12 seconds; the test process took approximately 0.0041 seconds. These are local measurements for the bounded synthetic fixture, not full Street execution or proving measurements. No maintained Iroha source, shared structural module, native dependency, or Cargo build was changed by this component.
