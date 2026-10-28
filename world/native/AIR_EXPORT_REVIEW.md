# Immutable staged AIR export

September 8, 2026. Implemented and tested as an exact read-only export of the existing scalar schedule. This does not implement the authenticated lookup protocol, a STARK, terminal-result admission, or a security claim.

The implementation is [staged_constraints.rs](staged_constraints.rs). Its frozen qualification is [street-air-export/report.json](../../output/qualification/street-air-export/report.json), SHA256 `deb31f667b2ecb734173c9f637bd80456e7087f46cdc3b6183c79dd0500c80d7`. The report pins the compiler, source copies, harnesses, binaries and test logs. No maintained Iroha source, Cargo target, or native dependency was rebuilt or modified.

## What the view represents

`StagedCircuit::air_view()` borrows the exact detached program that the streaming raw verifier already uses. `AirView` and `AirStageView` have private fields and no deserializer or public constructor. The view cannot outlive its compiled program. It does not re-lower a scalar graph, inspect honest `Source` recipes, derive obligations from witness values, or trust declared integer bounds.

Compiler ownership is distinct from profile admission: a caller can still construct a new scalar circuit through the existing public API. An eventual verifier must select and authenticate the intended compiled computation. Having an `AirView` alone does not identify a sanctioned Street profile.

The export retains these exact obligations:

| API | Meaning |
| --- | --- |
| `AirView::stats()` / `equations_per_stage()` | Existing immutable schedule counts and original polynomial bank size. |
| `stage(index)` / `stages()` | Bounds-checked stage access and exact ordered stage enumeration. |
| `AirStageView::equations()` | Every original equation slot, after the existing exact constant substitution. |
| `AirStageView::range_lookups()` | Every original lookup occurrence assigned to this stage, in original source order within the stage. |
| `input_port(index)` / `output_port(index)` | Constant-time access to an exact ordered port binding, including aliases. Out-of-range access returns `None`. |
| `input_ports()` / `output_ports()` | Exact-size iterators over those same ordered ports. |
| `placements()` / `fixed_wires()` | Original scalar wire identities, closed live intervals and compiled fixed values. |
| `cell_rules()` | A fallible, row-major stream of every cell's fresh, carry or zero rule. |

`AirPolynomialView` contains the absolute `source_equation`, its `bank_slot`, canonical Goldilocks `constant`, and immutable linear and quadratic term slices. Terms reference the current stage's columns. Coefficients, term ordering and original equation slots are unchanged. Empty identities and nonzero constant contradictions remain visible. The export does not replace a residual by an assertion that its honest witness happened to pass.

`AirRangeLookup` contains the original `source_index`, `source_wire`, exact `equation_anchor`, assigned `stage`, `bits`, and `AirBinding`. The binding is either `Column(column)` or `Constant(value)`. Membership is exactly in the integers `[0, 2^bits)`; the partial top width remains exact. Duplicate occurrences, repeated reads with different widths, and valid or invalid fixed queries all remain distinct. The final anchor is the final existing stage, including stage zero for a circuit with no polynomial equations. Lookup anchors and source identity are copied into private compiled metadata, not recovered from mutable caller records.

This is the occurrence information required by [LOOKUP_PROTOCOL_V1.md](LOOKUP_PROTOCOL_V1.md). An eventual lookup compiler may share one reciprocal for repeated reads of the same committed cell, but it must preserve each width's occurrence multiplicity and fixed-query contribution. Exporting only `equations()` would omit the membership relation.

`AirBoundaryPort` retains the ordered `port`, original `source_wire`, exact stage, and column-or-constant binding. Input ports are at stage zero; output ports are at the last local stage. Duplicate and cross-input/output aliases are not deduplicated: each public occurrence still imposes its own equality. Fixed public ports remain equalities against their compiled values.

## Structural constraints and ownership

`AirCellRule` gives a `stage`, `column`, and one of:

- `Zero`: this inactive cell must equal zero.
- `Fresh { source_wire }`: this original wire begins its lifetime here. It has no preceding-row carry equality; its local, lookup and public obligations still apply.
- `Carry { source_wire, previous_stage, previous_column }`: this exact original wire continues from the stated preceding cell and must equal it.

Carry identity follows the original wire's closed live interval. Reusing a column for a different wire does not create a carry. Every cell appears exactly once; the number of zero and carry rules equals the corresponding existing schedule counts. An all-fixed, zero-width circuit emits no cell rules while still exposing constant equations, fixed memberships and public ports.

`AirCellRules` allocates one checked width-sized owner map and streams `rows × width` records. It does not materialize a dense relation. Its exact remaining length decreases to zero and it is a fused iterator. New original-port metadata requires one `usize` per boundary occurrence; new lookup identity and anchor fields remain under the existing lookup-count and byte-cap checks. Existing stage, width, dense-cell and total-constraint limits still apply. These resource caps are engineering limits, not practical proving measurements.

The compiled program has no mutation interface. Polynomial/placement slices are shared borrows; scalar descriptor records are copies. Changing a copied `AirBoundaryPort`, `AirRangeLookup`, or `StageStats` cannot alter the stored relation. The two constant-time port getters return the same records as the ordered iterators. Rust rejects external construction of `AirView`, writes through exported slices, and an escaping borrow of a local schedule.

The original raw-witness mapper still checks each eliminated fixed scalar cell against its compiled value. Exposing `AirFixedWire` does not introduce an alternative raw-admission path. The export neither changes constant discovery nor discards contradictory equations.

## Exact qualification performed

The frozen helper is SHA256 `d59444aed179f2159898e88e37ca493ea45ba1a49169586514d5c0d9abde53e4`. The new stager is `5698a3f23307b16c59bd950c46830bc70650f18db3ee12ef20cdc7726c2ef97a`.

All 53 standalone native tests passed: 27 helper tests and 26 staging tests. Four new named export tests cover exact folded coefficients/slot order and aliased public ports; duplicate/fixed/final-anchor membership including the empty polynomial case; every cell mutation against an export-only evaluator; and disconnected constant contradictions plus detached snapshot behavior.

The export-only evaluator consumes only the public view, canonical rows and public values. It separately evaluates exported term slices, memberships, port equalities and structural rules. It does not call the schedule's private residual evaluator, owner-map update, raw verifier, or scalar witness recipes. The cell-mutation test covers pure-bit and 8/12/16-bit modes with bank sizes 1, 3, 16 and 4096. Existing coherent limb tests were also extended to require export-only rejection: the forged lower/high limb pair preserves every polynomial reconstruction, so rejection depends on the exported exact membership. A reused-column fixture checks fresh/carry/zero identity and lookup source order explicitly.

A separately compiled before/after harness compares the frozen original stager `a13862bd91956daf3ff5331a63a45bca45a7c6baa97127526b971aaecbdbc4fb` with the new implementation against the same frozen helper. Across 16 schedules and 336 signed-input witnesses, all schedule statistics, placements and 89,565 field cells were identical. Both raw stream verifiers accepted every honest case. This is a bounded preservation check, not a full-race benchmark.

Four external compile-fail fixtures check private view construction (`E0451`), mutation of a polynomial slice (`E0594`), mutation of a placement slice (`E0594`), and a view outliving its schedule (`E0515`). Their exact sources and compiler errors are retained in the report. The report's source copies and binaries are distinct from the previously frozen commitment lane; prior commitment evidence remains evidence for its original source hashes.

## Required outer and cryptographic work

The view describes one scheduled scalar transition. The outer execution program must bind the validated initial state, exact public action rows, cross-tick input/output mapping, and claimed final output. It must separately address first-terminal policy, accepted signed history/checkpoints/disputes and global proof padding. Local inactive scalar cells, a game's absorbing terminal transition, and extra power-of-two proof rows are different obligations. None is implied by the other.

Parent integration supplies a separate `ExecutionBoundaryAir`; this local report does not qualify that module or a completed race. A valid execution prefix is still only a prefix.

No univariate fixed-selector interpolation, composition quotient, authenticated lookup attachment, Fiat–Shamir schedule, DEEP opening, FRI verification, 128-bit soundness analysis, full-race economics, ledger settlement, or finality verification is implemented or qualified by this export. `StageStats::max_degree` remains the degree in local witness cells, at most two; it excludes selector interpolation and all eventual composed proof degrees. These limits from [LOOKUP_PROTOCOL_V1.md](LOOKUP_PROTOCOL_V1.md) remain in force.
