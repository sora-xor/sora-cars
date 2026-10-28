# Exact ROM selection with shared Boolean bases

> Historical laboratory record. The standalone raw-constraint implementation and its runners have been retired. Current implementation and test obligations live in Iroha Core; see the [current foundation goals](../../docs/zk-foundations-goals.md). Source hashes and measurements below describe the original reviewed revision and do not qualify the current verifier.

Use two balanced indicator bases, shared across every output column, and one
compiled quadratic sum per distinct nonconstant column. Build the bases with
existing checked complements and products. Keep explicit output ranges and exact
index narrowing. This removes the per-column selector DAG without introducing
probabilistic membership, a trusted one-hot flag or a new range-advice mechanism.

Design and implementation spot review on 2026-09-07 found no acceptance defect in
this construction. The reviewer authored some existing checked primitives but
did not implement this lookup replacement. No production source was changed by
this review; no maintained Iroha write, Cargo build or deployed system was used.

## Exact relation

For `N` compiled rows, use `k=max(1,ceil(log2(N)))` bits. First constrain the
circuit-owned index to `[0,N-1]`, then retain Booleanity and the full integer
reconstruction `index = sum(2^j*b[j])`. Split the little-endian bits into
`a=floor(k/2)` low bits and `k-a` high bits.

For either half, construct indicator vectors in increasing integer order:

```text
empty half:       [1]
first bit b:      [1-b, b]
append bit b:     [v[0]*(1-b), ..., v[m-1]*(1-b),
                   v[0]*b,    ..., v[m-1]*b]
```

Compute `1-b` once per bit using the checked subtraction of the constant one and
a proved Boolean. Its complete natural interval is `[0,1]`. Every subsequent
product likewise has complete natural interval `[0,1]` and keeps its defining
equation. Thus the existing derived arithmetic proves the range; no additional
Boolean declaration or narrowed metadata is needed. Avoid computing a zero child
as `parent-parent*b`: the generic independent bounds would be `[-1,1]`, creating
unnecessary narrowing obligations.

Induction gives exactly one active low indicator `L[l]` and one active high
indicator `H[h]`, with `index=l+2^a*h`. For column `c`, retain:

```text
out[c] - sum(T[i][c] * L[i mod 2^a] * H[floor(i/2^a)], i=0..N-1) = 0
```

All `T[i][c]` values are compiled coefficients. Exactly one product is one and
its row is present because `index<N`; the rest are zero. Each output therefore
equals the exact selected table entry in Goldilocks. Prove the output's signed
range explicitly using the existing two-slack range construction with the
column's actual minimum and maximum. This preserves bounded integer semantics
without treating a host table lookup as a verifier constraint.

The half bases themselves are complete even when `N` is not a power of two.
Missing padded coefficients behave as zero in the polynomial, but **that does
not make padded indices valid**. The index narrowing and reconstruction remain
essential, including when zero is within every output range. For `N=1` or `N=2`,
the low half can be empty; its basis must be `[1]`, not an indexed bit access.

Identical full column vectors can reuse one output wire. Columns with identical
bounds but different contents cannot. A constant column can reuse a checked
constant instead of emitting its redundant sum. These simplifications preserve
the exact relation and existing duplicate-column wire identity behavior.

## Arithmetic and degree bounds

The supported table limits are `N<=4096`, at most sixteen columns, and signed
entries strictly between `-2^50` and `2^50`. All basis operands and products are
proved zero or one. The explicit output range has endpoints in the same strict
domain and width below `2^51`; its existing slack equations retain their original
integer-lift bounds.

There are two compatible ways to assess the output equation:

- The one-hot argument makes its sum exactly one compiled signed entry. Its
  canonical field encoding and the explicitly bounded signed output determine
  the same unique value. There is no probabilistic lookup assumption.
- Even the conservative independent residual envelope fits below Goldilocks:
  `sum(abs(T[i][c]))+max(abs(out[c])) <= 4097*(2^50-1)`, namely
  `4,612,811,918,334,226,431 < 18,446,744,069,414,584,321`. This follows from the
  fixed shape/value limits and actual Boolean products. It is a bound on the
  equation's integer residual, not a claim that an unconstrained intermediate
  integer sum fits the ordinary `+/-2^50` wire interval.

Coefficient conversion uses signed `i128` before canonical field reduction, so
negating entries near either supported endpoint is safe. Increasing the row or
integer limits later requires revisiting this envelope and allocation bounds.

Every retained equation has degree at most two in witness cells. Expanding the
basis directly into the original bits would have higher degree; the intermediate
product equations must remain. Future stage selectors, fixed coefficient tables,
quotients and univariate AIR composition need their own degree accounting. This
review makes no STARK or 128-bit soundness claim.

## Static cost comparison

The inspected Tokyo bundle has 1,404 stations and 1,403 adjacent sixteen-column
rows. Its exact bytes are pinned at
`output/street-race/tokyo-1986-8.json`, SHA-256
`92da95c575ba50ab42e940702ec110173b44e19030ad006a800893eacd4592ca`.

With eleven bits split five/six, the bases have 32 and 64 terminal indicators.
Reusing the first bit/complement pair requires **184 product equations plus
eleven complement equations**, shared across all sixteen outputs. Using the
existing select primitive for both children instead would require 376 equations
for 188 selectors because it repeats selector Boolean checks.

Direct inspection of the pinned table gives 21,907 nonzero quadratic table
coefficients across its sixteen distinct nonconstant columns. Their ordinary
explicit range gadgets require 560 equations and 528 slack-bit wires. Thus the
basis, sixteen output equations and output ranges contribute **771 equations**,
before index proof, constants and the surrounding geometry computation. These are
component counts from the table and construction, not a complete measured lookup
or native-race benchmark.

The replaced DAG materialized 16,142 selectors per read. Materializing complete
row indicators shared across columns is another valid reduction, but needs more
witness products than the two-half quadratic construction. A Boolean monomial
basis with a Möbius-transformed table would reduce this example's basis equations
by 112, while increasing nonzero table coefficients from 21,907 to 28,751 and
requiring a separately checked coefficient transform. The direct indicator form
is the recommended current tradeoff; fewer witness wires alone do not determine
proving cost. Measure total terms, constraints, live staging width and runtime.

## Inspected implementation obligations

`Circuit::fixed_table_lookup` validates ownership, table dimensions, every entry
and the index-range intersection before mutation. It owns the column data used
by `Source::FixedTableCell`; that source performs checked indexing only for honest
witness generation. Output residuals use separately retained coefficients, so
changing the hint data cannot change the accepted relation. The implementation
uses the complement/product construction above, correct little-endian ordering,
full-column interning and checked constant columns. `FixedTableRead` exposes only
existing circuit-owned handles. No arbitrary basis or range-proven flag is
accepted.

The `FixedRom` wrapper owns its validated table. Changing that table constructs a
different circuit; it is not an allowed witness substitution. Ledger profile
admission must still select the immutable compiled relation and table. Exact
coefficient selection does not itself authenticate a network, game, state,
authorized inputs or settlement claim.

## Adversarial requirements

- Exercise all valid small table rows, both integer endpoints, repeated and
  constant columns, both one-bit cases, non-power-of-two row counts, and the
  maximum 4,096-row shape. Test low/high bit boundaries explicitly.
- Reject every padded index, including a coherent padded selection whose zero
  output fits the column bounds, and an index plus `2^k` using unchanged low bits.
- Mutate raw index bits to canonical non-Boolean values that preserve their
  reconstruction, such as `(-1,1)` for the low pair encoding one. Booleanity must
  reject independently of the declared index range.
- Mutate complements, products and outputs directly. Include all-zero and
  multi-active indicator forgeries whose output fits the allowed range. Recompute
  downstream hints in the test so a retained basis equation is necessary.
- Swap table rows in every honest output hint while retaining the original
  coefficient equations, same table shape and same min/max bounds. The coherent
  witness must reject; this distinguishes coefficient binding from range checks.
- Retain equations for unused basis branches and all original geometry outputs.
  Repeat the existing signed-lap, sprint terminal, exact adjacent-row and all
  forbidden interval-index tests against the replacement.
- Reject malformed shape, out-of-domain entries, foreign wire handles and a
  disjoint index range without changing wire or equation counts. Mutating source
  tables or hints after compilation must not alter raw verification.

The new helper tests cover exact rows/endpoints, duplicate columns, raw cell
mutations, a coherent changed-hint table with unchanged bounds, canonical
non-Boolean reconstruction and atomic external validation. Root reran the full
geometry and integrated scalar suites; final pinned evidence follows below.
Proof admission, full-race proving resources and finality remain separate
qualifications.

## Geometry adversary harness review

The old DAG's padded zero could satisfy its output wires without separate output
range gadgets. The replacement explicitly ranges those outputs, so several
strictly positive Tokyo columns also reject padded zero. The revised harness
correctly avoids mistaking those extra failures for index authentication: it
finds and checks the actual narrowed index upper-bound residual independently
for all 645 forbidden interval indices.

A separate five-row table `[-2,-1,0,1,2]` makes padded zero lie inside the allowed
output range. All three padded selections produce exactly one failing residual,
the narrowed index upper bound. The high-bit alias at index 2,048 explicitly
overrides all output hints with row-zero values and recomputes descendants; it
still rejects. The appended adversarial helper changes only witness recipes,
leaving the source polynomial verifier intact. These adaptations preserve the
intended negative-test strength after the representation change.

## Constant substitution in the combined scheduler

The accompanying scheduler optimization was inspected independently. It infers a
fixed field value only from an **original** canonical equation `a*x+c=0` with one
linear term, no quadratic terms and nonzero `a`. It does not inspect honest
recipes, singleton range annotations, or recursively simplified equations. The
first qualifying equation fixes `x=-c/a`; any conflicting equation stays in its
original position and becomes a nonzero constant residual.

Substitution into every original linear/quadratic occurrence is exact field
arithmetic. One fixed factor becomes a linear coefficient; two fixed factors
become a constant. Identity and contradictory constant equations remain present,
and stage numbers do not shift. Eliminated wires have no row placement. Their
input/output bindings instead compare public values against the compiled field
constant, preserving every aliased port. The full scalar-to-row mapper checks
all eliminated raw cells against those constants; the raw row verifier itself
does not depend on that mapper check.

No acceptance defect was found in constant inference, substitution, active-wire
identity remapping, fixed public boundaries, or carry/zero verification. The
preservation argument extends by inserting each uniquely fixed value when
extracting a scalar witness from accepted rows. A contradictory original circuit
therefore cannot become satisfiable by erasing its fixed cells. Current tests
cover both quadratic factor orders, all-fixed zero-width traces, conflicting
constants, public aliases and altered raw fixed values.

With fixed wires removed, the exact count identity becomes:

```text
total constraints = original equations + dense cells - active wires + boundary pins
source wires = active wires + fixed wires
```

This optimization changes physical storage and terms, not the number of original
equations or their meaning. It supplies no transcript authentication or
cryptographic qualification.

Review identified an allocation-bound edge: initially reserving only the
original linear-term count could permit amortized growth after quadratic terms
were folded to linear terms. On a narrow address-space target that growth could
exceed the separately checked logical count. The final scheduler performs an
exact surviving-term counting pass, validates and reserves those buffer lengths,
and asserts that emitted lengths match. The reviewer inspected the counting and
emission cases and found them consistent. This is a resolved resource-bound
issue, not an arithmetic acceptance bypass; no 32-bit build qualification is
claimed.

## Final source and evidence pins

These are the **current shared-ROM and constant-reduced implementation** pins.
`COMPILED_GEOMETRY_REVIEW.md` and `STAGED_IMPLEMENTATION_REVIEW.md` retain historical
pins and measurements from the previous selector-DAG and unreduced scheduler.
Their earlier costs are not the current costs below.

| Inspected current source | SHA-256 |
| --- | --- |
| `world/native/checked_constraints.rs` | `fc7a73556c492a17810dc0e4fc3f00377024ece3b5c86b69be61c0808a246ded` |
| `world/native/fixed_rom.rs` | `29fc3dfb267724eac154aa179fbb5acf229eb03e074e1b491cc2cd3c77ae70ff` |
| `world/native/street_geometry_constraints.rs` | `66fcccc2dcde6509ec9e7ebfe0c84125a79d80c9ffbaace3b14f38f72f8d68d4` |
| `world/native/staged_constraints.rs` | `a06ce016f9e9f304f4b9e5059faff300c79b21fde6c05a206bf45cae72faafa1` |
| `world/native/execution_trace.rs` | `7aec3b33b0e4ee9da94259b7c3e2a7bee464270a879a99c6b9656aa039b03efb` |
| `scripts/test-street-geometry-constraints.ts` | `cb1ae9baf35df62e5001fa7c00c73a1cff2c55f82c5d75e1f88c8c3f143662ec` |
| `scripts/test-street-checked-lowering.ts` | `42b667699c6dbcbe71736d134145c1bfcb532cfbe96fcda0ba1587fa324a4a11` |
| `scripts/test-street-staging.ts` | `dc116f862073a067a9b470b93b09891773a54ff66828ce79dbcda16f096b9959` |

Final reports:

| Retained report | SHA-256 |
| --- | --- |
| `output/qualification/street-rom-basis/geometry/report.json` | `bf882c92bc62bc5dde85b1ee00855f808d4faef95d2422215149b66be3b7185e` |
| `output/qualification/street-rom-basis/lowering/report.json` | `b81f057d86a5888598fd640ae655dfab87c43cb296624ee0b9f8c710ca44a4e3` |
| `output/qualification/street-rom-basis/staging/report.json` | `1ab47b15057258463101c42074722e11d37c19e4c429596e80945917c1071abe` |
| `output/qualification/street-rom-basis/all-rosters/report.json` | `af9bf00ec05c6989b84e2d1e5311360a81fa511d19b99f986c39d8ef936563d8` |
| `output/qualification/street-rom-basis-audit/report.json` | `92e0f67d7bc356016972b2d4b4cc4c28c8fd8fa31f02b9c6df3026bec0e59546` |

The reviewer independently verified current source pins in the geometry,
lowering and staging reports, the staging report's complete frozen source tree
and log digests, their retained harness/binary digests, and the geometry
adversarial-copy digest and unchanged production-source prefix. The separate
native ROM comparison's frozen source, harness and binary hashes also match its
record. Root and the separate audit author ran the tests; this review inspected
their evidence and did not rerun it or claim independent authorship of those
harnesses.

The standalone native comparison verifies all 1,403 rows and sixteen columns in
both implementations. It rejects a mutation of each raw wire at a fixed honest
index: 22,711 old wires and 774 new wires. Its padded-index check is an honest
input-bound rejection; the full geometry harness supplies the separate coherent
raw padding attacks described above. A complete isolated ROM read, including
its already bounded index input, changes from 38,855 equations to 808; these
totals have a different scope from the complete geometry query below.

The geometry report passes 25 module tests and verifies **19,324 complete field
witnesses**, 1,403 standalone Tokyo ROM rows, all 645 coherent padded indices,
129 other raw rejections and twelve malformed tables. The separate 7,013,328-
position native index/heading sweep is integer evidence, not that many complete
field proofs. A complete Tokyo geometry query now uses **1,674 wires and 1,777
equations**, compared with 23,609 and 39,822 in the pinned prior geometry report.

The lowering report passes 28 module tests and checks twelve native ticks per
roster. Two/eight cars respectively compare 67,044/1,221,696 original node values
and reject 512/3,049 raw node mutations. The eight-car circuit retains all
101,808 original graph nodes as **1,827,393 scalar equations**; it has no free
geometry advice input.

The final combined staging report, dated `2026-09-07T13:09:37.693Z`, passes
**39 focused tests** (20 checked-helper, sixteen scheduler, three outer-trace),
then verifies both rosters across three complete consecutive transitions and
rejects four boundary/shape attacks per roster. The module test counts overlap
the other suites and should not be summed as independent tests.

An additional ten runs reuse the already pinned native binaries for intermediate
rosters of three through seven cars: twelve scalar ticks with node parity and
raw mutations, and three staged transitions with four boundary/shape rejections
for each roster. Together with the primary reports this covers every supported
roster size from two through eight. The reviewer matched all ten retained log
hashes and both base-report hashes in `all-rosters/report.json`; the primary
source and report pins are unchanged. These short runs do not expand the
full-duration or cryptographic qualification boundary.

| Combined current staged circuit | 2 cars | 8 cars |
| --- | ---: | ---: |
| Scalar wires | 125,976 | 1,670,866 |
| Active / fixed wires | 125,396 / 580 | 1,668,553 / 2,313 |
| Rows × columns per tick | 9 × 15,155 | 112 × 15,483 |
| Original equations retained | 138,116 | 1,827,393 |
| Carry / padding / boundary equations | 804 / 10,195 / 141 | 37,223 / 28,320 / 351 |
| Total constraints per tick | 149,256 | 1,893,287 |
| Dense cells per tick | 136,395 | 1,734,096 |

The current eight-car dense layout extrapolates to **124,854,912,000 raw field
bytes** for 9,000 ticks, before commitments or LDE. This is still not a practical
full-race proof qualification or a measured full-race allocation. Full duration,
cryptographic AIR/STARK integration, 128-bit soundness, supported-target parity,
authenticated public statements, consensus finality and settlement remain open.
