# Exact limb ranges for native computations

The standalone native compiler can replace the auxiliary bits used for integer
ranges and comparisons with exact bounded limbs. This preserves the same integer
rules while reducing their witness representation. The experiment supports
8-, 12- and 16-bit chunks; the original bit circuit remains the reference.

The complete relation now has **polynomial equations and fixed range-table
memberships**. The implementation checks both on supplied raw field data. It
does not yet prove the memberships cryptographically, supply a STARK, establish
128-bit security, or qualify full-race proving. These reusable helpers contain
no game-specific instruction, custody rule or ledger admission path.

## Exact integer relation

For an interval `[L,H]` to enforce, let `k` be the bit width of `H−L`. Compile two
nonnegative sums, with each chunk checked against its own fixed integer table:

```text
x − L = Σ_j 2^shift_j · lower_j
H − x = Σ_j 2^shift_j · upper_j
0 ≤ lower_j, upper_j < 2^bits_j
bits_j = min(configured_chunk_bits, k − shift_j)
```

The equations are in Goldilocks. Under the supported endpoints, the combined
nonnegative sum is below `2^52`, which is below its characteristic. Adding
the equations therefore fixes their integer total to
`H−L`, so this field relation cannot admit an integer outside `[L,H]`. Singleton
intervals retain their exact linear equation; Boolean selectors retain their
Boolean polynomial. The final chunk is often narrower than the configured
chunk size. Its smaller table is mandatory.

For example, range `[0,1000]` has ten bits. In 8-bit mode, `x=682` uses:

```text
lower: 682 = 170 + 256·2
upper: 318 =  62 + 256·1
first chunks in [0,256); last chunks in [0,4)
```

Changing the lower chunks to `(426,1)` preserves every reconstruction equation
but violates the first membership. Checking polynomial residues alone would
miss this attack. Another regression at the supported integer envelope uses a
field alias that fits full 16-bit chunks but violates the exact two-bit top
chunks. The [independent review](LIMB_RANGE_REVIEW.md) gives that construction
and the complete bound argument.

The strict comparison result `t` stays Boolean. Its true branch reconstructs
`b−a−1`; its false branch reconstructs `a−b`. Both use exact nonnegative chunks,
and the inactive branch must have weighted sum zero. Since its bounded sum
cannot wrap modulo the field, every inactive chunk is then zero. Signed
arithmetic, integer truncation, remainder, overflow envelopes, branch selection,
geometry, collisions, gates, finishing and ranking retain their existing rules.
Unsigned decomposition used by exact ROM selection stays bit-based.

## Compiler and staged verification

`Circuit::with_range_limb_bits` accepts only the three compiled chunk sizes.
Callers cannot install a table, choose weaker partial widths or mark a witness
as already range-proved. `Circuit::new` retains the original ordered bit circuit.
The default two/eight-car polynomial fingerprints still match the preceding
[frozen census](../../output/qualification/street-range-audit/README.md).

Each compiler-owned `RangeLookupView` names an original wire, an exact width
and an original polynomial anchor. These descriptors are independent of honest
witness recipes and interval metadata. `verify` checks all canonical equations
and all memberships. `verify_equations` and `residues` are deliberately
incomplete diagnostics for the limb mode. `ScalarLowering::verify_witness`
delegates to the complete verifier.

The scheduler snapshots every membership. It includes membership-only wires in
liveness and preserves memberships on fixed constants after exact substitution.
Duplicate and narrower obligations are retained. Original wire identity governs
carrying values through rows, even when columns are later reused. Memberships
at the final equation boundary and circuits with no polynomials are supported.
Malformed dimensions, widths, anchors, row encodings, public ports, padding and
incomplete streams reject; any failed stream remains failed.

`equations_per_stage` partitions **polynomials only**. For `E` polynomials,
`Q` memberships, `S` rows, `W` columns, `A` active wires and `P` public ports:

```text
total raw checks = E + Q + carry + padding + P
                 = E + Q + S·W − A + P
```

Fixed memberships are included in `Q` and also reported as a subset. The maximum
polynomial degree describes raw witness cells only; it excludes a future lookup
protocol and univariate AIR degree accounting. Counting an exact membership as
one raw check does not make it one cryptographically proved quadratic gate.

## Reproduction and evidence

Run `npm run test:street-limbs`. The runner verifies the pinned native geometry
producer inventory, freezes all source dependencies in a separate stable lane,
compiles them with standalone `rustc`, runs focused native tests and compares
the four layouts on two and eight cars. Live and frozen source hashes must still
match after execution. It uses no Cargo or maintained Iroha build.

The final endpoint run passes **60 distinct focused native tests**: 27 helper,
3 fixed-ROM, 2 geometry, 3 graph-lowering, 22 scheduler and 3 execution-boundary
tests. Every reference/8/12/16-bit mode passes on two and eight cars, comparing
all native node values across twelve consecutive ticks and 34 explicit branch
fixtures. Each also verifies three linked staged ticks and rejects four boundary
attacks. Every limb mode rejects a coherent forged digit pair whose complete
polynomial residual vector is zero, including in the detached staged verifier.

The exact tests, configurations, harness, binary hashes, timings and logs are
recorded in [the endpoint report](../../output/qualification/street-limbs/report.json),
SHA-256 `344db9c411f5744714acb1740e755ef12cf1a44b3435c36b571ff041a6aed243`.
Measurements cover short consecutive state transitions, branch fixtures and explicit adversaries.
The [independent supplemental run](../../output/qualification/street-limbs/intermediate/README.md)
uses the identical frozen binary for every intermediate roster from three to
seven at 12 bits. These add 8,506,483 native node comparisons, twenty boundary
rejections and five polynomial-valid membership forgeries, all rejected. This
establishes the reported short-run coverage for every supported roster; it does
not extrapolate endpoint tests to every chunk size at every roster.
The [combined manifest](../../artifacts/street-limbs.json) verifies the current
source inventory, frozen copies, reports, raw logs, binaries, reference
fingerprints and independent review. Historical evidence remains at its
original source versions.
Synthetic non-genesis fixtures exercise branches without claiming that their
initial states are reachable in a full race. Raw membership, staged continuity
and native node parity remain separate from authenticated input certificates,
canonical terminal predicates and finalized ledger state.

The report separates source cells, polynomials, membership occurrences, distinct
table sizes, staged dimensions and host resource use. Duration projections use
5,400 ticks for the standard race and 9,000 for the authored Tokyo street
profile. They do not allocate either full rectangle and exclude multiplicity
witnesses, fixed columns, commitments, LDE and cryptographic workspaces.

## Measured tradeoff

All rows below describe the same eight-car native computation. The stage budget
is 16,384 original polynomial equations, with every membership also retained.

| Representation | Source cells/tick | Polynomials/tick | Memberships/tick | Distinct table rows | Staged cells/tick | Raw 9,000-tick GiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Bit reference | 1,670,866 | 1,827,393 | 0 | 0 | 1,734,096 | 116.28 |
| 8-bit chunks | 350,679 | 287,970 | 219,236 | 510 | 402,282 | 26.98 |
| 12-bit chunks | 293,684 | 287,970 | 162,241 | 8,190 | 345,366 | 23.16 |
| 16-bit chunks | 257,761 | 287,970 | 126,318 | 131,070 | 275,220 | 18.45 |

The 16-bit layout uses 18 rows × 15,290 columns, **84.13% fewer dense cells**
than the bit reference. Its stage has 5,313 carry checks, 14,459 padding checks
and 351 public boundary checks, for 434,411 total raw checks per tick. No
membership happens to be fixed in these racing circuits; separate regressions
cover fixed memberships, including contradictions and duplicate narrower tables.

The final eight-car host runs peak at 1,202,880,512 bytes for the reference and
255,655,936 bytes for 16-bit chunks. Complete construction takes 480.64/81.31 ms;
packing and checking the three staged ticks takes 149.63/33.91 ms. These are
single-run host measurements under the recorded compiler, **not prover or
validator benchmarks**, and include different raw data sizes. They do not
establish a cryptographic speedup.

The smaller 16-bit rectangle comes with 131,070 distinct table rows across its
sixteen exact widths. The 8-bit mode needs only 510 across eight widths. Neither
figure includes table authentication or multiplicity work; the lowest raw cell
count therefore does not select the best lookup prover. All three measured
9,000-tick query totals happen to be below `2^31−1`, but the existing `±2^50`
integer argument still prevents a direct change from Goldilocks to M31. Any
field change requires a newly justified complete integer encoding and protocol.

## Next cryptographic step

Compare a bounded-memory, authenticated lookup argument for these exact
obligations under the [September 2026 research findings](../../docs/research/2026-09-cryptography-review.md).
Keep different partial widths as separate fixed relations unless a sound tuple
compression argument replaces that schema. Deterministic width/value packing
can collide before the value is range-proved. Authenticate all actual queries,
bind multiplicities before challenges, and justify characteristic limits for
each actual batched relation over all execution ticks assigned to it, including
any authenticated sharding. An extension field does not change its characteristic.

The lookup theorem, sumcheck or AIR reduction, commitment scheme, Fiat–Shamir
transcript, hash parameters and representation bridges need a composed security
analysis. Smaller raw vectors alone do not select a backend or establish a
practical prover. Native generic settlement, protected custody, disputes,
finality and live XOR activation retain their separate qualification gates.
