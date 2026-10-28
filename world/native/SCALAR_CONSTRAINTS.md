# Native checked scalar lowering

> Historical laboratory record. The standalone constraint-plan runners have been retired. Current checks run in the native Iroha Core modules; their compilation and results must be established on the selected revision. Recorded counts below describe the original source, not current proof cost or full-history qualification.


The street computation now has Goldilocks polynomial constraints for every scalar node, including exact geometry selection from a verifier-compiled immutable table. Required intervals are proved by exact decompositions or checked derivation from previously proved operands. This is a reusable native Rust component outside the maintained Iroha checkout. It is not yet an AIR schedule, execution STARK, registered profile or ledger verifier. The release constructor requires compiled geometry; the old unauthenticated-width attack is retained only as a negative unit-test fixture and is rejected by the current constructor's equations.

## Components

- `street_graph.rs` exposes immutable operations and input order through `inspect` and `inspect_inputs`. These APIs cannot mutate a compiled graph. Source `Value` references remain structural node indices and bounds; they are not ownership capabilities.
- `street_constraint_plan.rs` retains every node, its interval, all dependencies and any unresolved geometry. Output reachability is diagnostic only. The plan has no mutable public node collection.
- `checked_constraints.rs` builds degree-at-most-two field equations with opaque circuit-owned wires. Exact range constraints establish integer meaning. Invalid or unsafe construction rejects before changing the circuit. Constants are interned, equations are never sliced, and immutable polynomial views expose all equations for later native staging and independent inspection.
- `fixed_rom.rs` selects fixed constants through a reduced Boolean DAG, constraining all index bits and rejecting padded indices. `street_geometry_constraints.rs` compiles full adjacent eight-column row pairs and constrains circuit/sprint normalization, exact rounded-station indexing, heading interpolation and width selection.
- `street_checked_lowering.rs` applies these constructors to every scalar node, then constrains its declared graph interval. Narrowed selects, including disconnected assertions, therefore retain their singleton equations. Geometry shares only by progress-node identity within one circuit and fixed table; no geometry advice is a release-constructor input. No ledger path consumes this lowerer yet.

The current eight-car graph contains 101,808 nodes, 107 carried/action inputs and 244 observed outputs. All 910 eager assertions lie outside the output dependency slice. A compiler that follows outputs alone would remove every one of those requirements. The native plan retains them, as well as 80 geometry obligations; the lowerer discharges those through 40 distinct compiled table queries. An independent TypeScript auditor compares every node, range, dependency, constant and port across all seven roster sizes.

## Exact integer meaning

The field is Goldilocks, `p = 18446744069414584321`. Public signed endpoints lie strictly inside ±2^50. An explicitly range-constrained field wire `x` with interval `[L,H]` has two independently Boolean-decomposed slacks:

```
x - L = lower_slack
H - x = upper_slack
```

Adding the equations yields `lower_slack + upper_slack = H-L`. The complete bit-sum envelope remains below `p`, so decomposition slack cannot admit values outside the intended interval through modular wrapping. Singleton ranges directly equate the wire to their constant. Boolean wires satisfy `b(b-1)=0`.

Arithmetic operations add their reconstruction equations. Comparisons prove both branches with nonnegative bit slacks; inactive slack is constrained to zero. Equality has both zero-difference and inverse-difference equations, with the inverse zero when inputs are equal. Selection constrains Booleanity and both source branches retain their own equations and ranges.

Addition, subtraction, multiplication and selection can instead derive their result interval from already constrained operands. A private constructor validates operand ownership, computes the complete natural interval with `i128` arithmetic and checks the permitted integer domain before retaining the defining field equation. The equation uniquely fixes the output residue; the established operand bounds and natural interval give that residue its signed integer interpretation. Selection keeps a Boolean selector equation. This induction permits removal of redundant output decompositions only. It does not accept caller-supplied range metadata as evidence. A genuinely narrower graph interval still adds explicit constraints, including every disconnected assertion. The exact induction and adversarial examples are recorded in [the range optimization review](SCALAR_RANGE_OPTIMIZATION.md).

Positive variable division proves signed truncation toward zero using bounded absolute numerator `A` and quotient `Q`, a constrained result sign, remainder `0 <= R < B`, and `B*Q + R = A`. The compiler checks the complete reconstruction envelope before construction. Component bounds alone are insufficient: the documented modular-alias fixture has bounded components and valid remainder but a false integer equation equal to exactly `p`.

The reusable remainder gadget implements signed Euclidean remainder with a floor quotient. The current street graph requires a nonnegative operand; its lowerer preserves that stricter condition. Circuit phase wrapping already uses explicitly nonnegative shifted inputs.

These arguments are detailed in [the independent design review](CHECKED_CONSTRAINT_REVIEW.md). They concern scalar relations; they do not establish a complete proof's 128-bit soundness target.

## Witness generation and adversaries

Honest witness construction and raw verification are separate. The verifier reads only canonical field cells and retained polynomial residuals. It does not replay host arithmetic or trust stored range metadata. A regression replaces all witness recipes and metadata after generation and confirms that raw verification still depends exclusively on the equations.

Tests include signed arithmetic, full-span comparisons, exact non-power-of-two intervals, altered range bits, false equality inverses, coherent wrong quotients/remainders, both modular aliases, foreign wires, inactive auxiliaries and construction atomicity. A coherent disconnected-assertion forgery keeps the observed output unchanged and fails exactly its required singleton equation.

The full two/eight-car lowering test checks every node value against native execution for 12 canonical launch/control ticks. It then changes every eager assertion wire plus selected arithmetic/comparison wires, geometry fields, complete endpoint records, indices and index bits. The original complete witness is verified first. For each single-cell edit, the test independently enumerates every polynomial that mentions that cell and checks their residues; all other polynomial values are unchanged. This exact dependency check avoids repeatedly scanning millions of unchanged equations and does not alter the production raw verifier. The [geometry component](COMPILED_GEOMETRY.md) explains the exact table relation and its public-profile binding boundary.

Current finite relation checks run from the native Iroha checkout:

```sh
cargo iroha-fast -- test -p iroha_core --lib --profile release execution_proofs::street_v1::compiler::tests::finite_lowering:: -- --nocapture
cargo iroha-fast -- test -p iroha_core --lib --profile release execution_proofs::street_v1::compiler::geometry_constraints::adversarial_tests:: -- --nocapture
```

The current `emit()` path retains 8-bit range membership and indexed ROM membership. Its two/eight-car tests compare every graph node for twelve control ticks and all gameplay fixtures. Polynomial-preserving limb aliases must fail the complete operand membership verifier. A raw mutation with no rejecting polynomial must still fail the complete relation; detached ROM cells are not authenticated by arithmetic residuals alone. Browser scalar semantics are checked by `tests/street-graph.test.ts` without generated-plan artifacts.

These are finite computation tests, not a full-history proof or finality check. The old plan/binary evidence stays at its original source pins.

## Performance and remaining implementation

The private derived-range optimization removes only redundant result decompositions for add, subtract, multiply and selection. All true narrowings remain. The subsequent exact ROM replacement uses two shared Boolean indicator bases and fixed quadratic table coefficients, keeping full-column explicit output ranges and exact index admission. Neither change replaces arithmetic constraints with host metadata or table advice.

| Cars | Earlier scalar-only cells / equations | Exact DAG ROM baseline cells / equations | Shared-basis ROM cells / equations |
| --- | ---: | ---: | ---: |
| 2 | 110,952 / 122,092 | 286,655 / 459,907 | 125,976 / 138,116 |
| 8 | 1,610,782 / 1,763,309 | 2,294,085 / 3,095,060 | 1,670,866 / 1,827,393 |

The original decomposition-heavy scalar-only baseline had 4,035,544 cells and 4,310,432 equations for eight cars. Each column above has a different explicitly identified ROM scope; the current relation keeps exact compiled geometry. The new primitive shares existing complement/product equations across every output column, with no probabilistic lookup assumption. [The compiled geometry component](COMPILED_GEOMETRY.md) and [lookup review](ROM_SHARED_BASIS_REVIEW.md) describe the complete table relation and arithmetic bounds.

The current lowering run passes 20 primitive-helper, 3 ROM, 2 geometry and 3 lowering tests. For the two/eight-car graphs it matches 67,044 / 1,221,696 native node values across twelve ticks and rejects 512 / 3,049 selected raw witness edits, including every disconnected assertion and the same geometry endpoints/index bits as before. Existing finite geometry qualification also passes 19,324 complete field witnesses, 1,403 ROM rows, 774 raw rejections and 12 invalid tables. The separate 7,013,328-position integer/native sweep is not counted as full field-witness verification.

The same pinned scalar and staged binaries subsequently passed all intermediate three- through seven-car configurations. Every supported roster now has twelve-tick scalar parity/adversary checks and three-tick staged continuity checks; the additional ten runs retain separate logs and base-report hashes under `output/qualification/street-rom-basis/all-rosters`.

The current eight-car lowering harness measured 920,846,336 bytes peak resident memory, 122.78 ms construction and 1,308.18 ms for its twelve-tick witness/adversary exercise. These are local scalar host measurements, not a full-race proof or validator benchmark. Exact sources, frozen comparison evidence and raw reports are in [the optimization manifest](../../artifacts/street-rom-basis.json); the earlier scalar/geometry manifests remain historical at their recorded source versions.

The [staged implementation](STAGED_CONSTRAINTS.md) now substitutes only values proved by original singleton linear equations, retains every original equation slot including contradictions, and carries the remaining live values between stages. Its generic raw-trace verifier binds successive invocations through verified output/input ports and immutable public actions. Short two/eight-car runs pass. The combined eight-car rectangle projects to 116.3 GiB for 9,000 ticks before any STARK overhead, so range/Boolean representation and a practical proving design remain necessary.

Registered profile/table authentication, canonical initial/final acceptance, network/rules/roster/input/dispute bindings, transcript commitments and native STARK adapter integration remain unfinished. Complete univariate degree accounting, DEEP/FRI and commitment soundness, independent cryptographic review, supported-target parity and whole-validator costs are still required before a generic game profile can be qualified. This work introduces no race-specific instruction and enables no live stakes.
