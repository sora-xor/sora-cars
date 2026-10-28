# Exact compiled geometry constraints

> Historical laboratory record. The standalone constraint-plan runners have been retired. Current checks run in the native Iroha Core modules; their compilation and results must be established on the selected revision. Recorded counts below describe the original source, not current proof cost or full-history qualification.


The scalar street relation now obtains road geometry from verifier-compiled constants. A prover supplies the race-state inputs; it cannot supply alternative road samples. This closes the previous geometry-advice gap in the local scalar circuit. It does **not** provide a STARK, a registered profile, ledger binding, authenticated finality or a 128-bit whole-proof soundness claim.

## Table selection

`fixed_rom.rs` owns an immutable integer table. The checked circuit narrows its index to the exact row count, proves its little-endian Boolean decomposition, then constructs balanced low/high indicator bases with retained complement and product equations. For each distinct nonconstant column, one fixed-coefficient quadratic equation selects the table entry:

```text
out[c] = sum(T[i][c] * low[i mod 2^a] * high[floor(i/2^a)], i=0..N-1)
```

Exactly one indicator in each half is one. Their product identifies the exact bounded index. Every output keeps an explicit range with the column's actual minimum and maximum; identical full columns share an output and constant columns use checked constants. An exact index bound excludes padded zero coefficients even when zero fits the output range. Tables support up to 4,096 rows and sixteen columns with entries strictly inside ±2^50. This replaces the earlier per-column selector DAG while preserving exact table semantics; no random challenge or hash-collision assumption is introduced. See [the shared-basis review](ROM_SHARED_BASIS_REVIEW.md) for the integer envelope and finite equivalence argument.

`street_geometry_constraints.rs` validates the native road structure before compiling a ROM of complete adjacent row pairs. Each selected record contains all eight columns of row `i` and all eight of row `i+1`: station, east, north, elevation, half-width, heading, diagnostic curvature and sector. Adjacency follows from the verifier-constructed constant record; separate prover-selected endpoint tables are not accepted.

The compiler parameters include length, topology and winding. These are private immutable values after construction. Supplying another table to the compiler creates another circuit, not another accepted witness of the original circuit. A future registered execution profile must bind that exact compiled relation and table. A packaging SHA-256 digest alone does not perform that public binding.

## Distance and integer interpolation

Let `L` be length, `M=ceil(L/5000)` the cell count and `h=floor(M/2)`. Native stations are `s[i]=floor((i*L+h)/M)`. For circuits, constrained signed Euclidean division gives `distance=lap*L+p`, `0<=p<L`. For sprints, checked comparisons and selections give `p=clamp(distance,0,L)` and `lap=0`.

The exact sample index is

```
j = floor((M*(p+1)-h-1)/L)
```

This comes from the integer equivalence `floor((j*L+h)/M)<=p` iff `j*L+h<=M*(p+1)-1`. The naive approximation `floor(p*M/L)` is wrong at rounded stations; Tokyo station 14,996 mm is row 3, not row 2. The positive division relation proves the quotient and its strict remainder bounds.

The interval index is `i=j` except at a sprint finish, where it is `M-1`. The selected station difference is constrained to 4,900–5,000 mm. Distance within the cell satisfies `0<=p-s[i]<span`; the sprint terminal branch instead requires equality with `span`.

Heading is

```
heading[i] + trunc((heading[i+1]-heading[i])*(p-s[i])/span) + lap*winding
```

The checked signed division gadget enforces truncation toward zero and bounded quotient/remainder reconstruction. At a sprint terminal point this equals the terminal heading; native table validation already requires the last interval heading to be constant. Half-width uses the sampled row, including the final row at a sprint finish; interval turn/span continue to use the final positive-length cell. Negative circuit distances and both winding directions retain their native meaning.

## Integration and retained obligations

`ScalarLowering::new` now requires `FixedStreetGeometry`. Its release interface has no constructor accepting unauthenticated geometry advice. The earlier incomplete variant exists only inside unit tests, where a false in-range width demonstrates the old attack and the compiled-ROM version rejects it.

The complete graph still retains every node and graph interval, including all 910 assertions outside output reachability. Lookups share by native progress-node identity within one circuit and one fixed table, never by equal witness values. Tokyo's eight-car graph contains 80 geometry operations sharing 40 distinct progress queries. All graph-level consumers remain represented. Honest witness generation uses only the graph's 107 state/action inputs; all geometry witness cells are derived and independently constrained.

The local integrated harness currently checks 12 canonical launch/control ticks for two and eight cars. Eight-car lowering has 1,670,866 witness cells and 1,827,393 equations, all degree at most two. It matches 1,221,696 native node values and rejects 3,049 selected raw witness edits covering graph assertions, geometry fields, complete endpoint records, indices and index bits. The original full witness passes every equation before the mutation check evaluates every affected polynomial. These are per-tick scalar measurements, not a practical full-race trace or a prover/validator benchmark.

Current native regression selectors are `execution_proofs::street_v1::compiler::tests::finite_lowering::` and `execution_proofs::street_v1::compiler::geometry_constraints::adversarial_tests::`; run them through the native Core Cargo test harness. The following report is retained historical evidence. The independent [geometry report](../../output/qualification/street-rom-basis/geometry/report.json) passes 19,324 complete geometry field witnesses, 1,403 full ROM row witnesses, 774 raw-witness rejections including all 645 padded interval indices, and 12 malformed-table rejection cases. A separate 7,013,328-position integer/native sweep checks every normalized Tokyo millimetre; it is not counted as a field-witness test. Synthetic circuits exercise both windings, sprint terminal widths, 500,001 mm rounded spacing and the maximum 20 km / 4,001-row admitted table.

The current native test-only adversary helper recomputes unchecked witness recipes against the maintained checked helper; no release API is added. The historical harness appended the helper to a frozen copy. It can recompute descendants, range bits and division auxiliaries after a forged internal value; acceptance still uses the unchanged full raw polynomial verifier. A coherently wrong negative floor quotient fails its retained reconstruction equation. The earlier [geometry review](COMPILED_GEOMETRY_REVIEW.md) records the original construction; the [new lookup review](ROM_SHARED_BASIS_REVIEW.md) covers this replacement. Neither is an external cryptographic audit. The retained historical runs used standalone `rustc`; current regression execution uses the maintained native Core Cargo harness.

A complete Tokyo geometry query now uses 1,674 wires / 1,777 equations, versus 23,609 / 39,822 in the preserved DAG baseline. An independent frozen-source ROM-only comparison verifies every valid row and rejects every raw wire mutation: its lookup falls from 22,711 wires / 38,855 equations to 774 / 808. The new dense output equations can have 1,404 terms; fewer witness cells do not remove their evaluation cost. These component scopes are different and must not be combined as the same benchmark. Current source/report pins and the baseline comparison are in [the optimization manifest](../../artifacts/street-rom-basis.json).

## Remaining proof work

The fixed ROM deliberately pays for exact selection in ordinary degree-two equations. The [raw staged verifier](STAGED_CONSTRAINTS.md) now preserves those equations, enforces fixed wire lifetimes/carry/padding and binds successive invocations. Its short-trace qualification is not an AIR or STARK. Practical range/ROM representations and complete univariate degree accounting remain required. Future lookup optimizations must preserve exact table/profile semantics and receive their own soundness analysis; this circuit's lack of a lookup collision assumption does not justify claims about a future random-challenge argument.

Canonical initial/final state, network/session/rules/roster/input-key bindings, signed accepted inputs and disputes, transcript commitments, proof-format domain separation, DEEP/FRI soundness, supported CPU/accelerated targets, full-race costs, independent cryptographic review and generic ledger admission/escrow/finality remain required. No live stakes are enabled by this component.
