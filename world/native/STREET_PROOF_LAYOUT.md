# Complete Street proof layout: measured next step

> Historical laboratory record. The standalone constraint-plan runners have been retired. Current checks run in the native Iroha Core modules; their compilation and results must be established on the selected revision. Recorded counts below describe the original source, not current proof cost or full-history qualification.


September 8, 2026. **Implement authenticated fixed-table ROM reads next, while retaining the complete current scalar relation as the reference.** Increasing dense-stage or proof-size caps does not resolve the measured tradeoff. A compact operand layout is a later step; blindly serializing the present expanded ROM equations would retain most of their cost.

The [frozen report](../../output/qualification/street-proof-layout/report.json), SHA256 `45000f8e598dbcede04fd9aa33ec145d366952c6ea319c3ba60cc6f1c92672b1`, contains 48 actual schedule measurements: complete 2/8-car Tokyo relations, 8/12/16-bit limbs, and eight equation bank sizes. It retains 26 source pins and 44 artifact pins. The retired [frozen Python runner](../../output/qualification/street-proof-layout/source/scripts/analyze-street-proof-layout.py) froze the already generated Tokyo route and then-current modules; the [std-only Rust analyzer](../../output/qualification/street-proof-layout/source/scripts/native/street_proof_layout.rs) constructed every scalar equation and membership and invoked that scheduler. It never constructs a whole-race witness, LDE or proof, runs Cargo, builds native dependencies, or modifies maintained Iroha.

All six bank-16,384 results match the previously qualified limb report's exact graph, raw-wire, polynomial, membership and rectangle counts. Source hashes were checked again after the run. The timing/RSS observations belong to this census, not to a prover or validator. The eight-car census processes used roughly 265–300 MiB resident memory; the much larger numbers below are explicit projections.

## Width lower bounds and the stage tradeoff

Each scheduler interval includes every original post-substitution polynomial use, lookup anchor and public port. Bank size one gives the exact minimum width for the **preserved equation order and simultaneous-equation representation**: coarser contiguous banks can only overlap additional intervals. The native interval coloring attains that peak. This is not a lower bound for arbitrary equation reordering, smaller primitive gates or authenticated memory.

There are also weaker bounds independent of equation order within that representation. One retained equation simultaneously needs up to 77 distinct nonconstant operands. The final row must contain 51 distinct nonconstant output wires for two cars and 183 for eight cars. Initial rows require 29 and 107 distinct wires respectively. Thus the hard simultaneous-equation/public-port bound is 77 for two cars and 183 for eight cars; the larger measured values include ordering and liveness.

| Cars | Limb bits | Exact width at bank 1 | Rows/tick at bank 1 | Bank 64 rectangle | Bank 16,384 rectangle |
| --- | --- | ---: | ---: | --- | --- |
| 2 | 8 | 164 | 22,504 | 352 × 262 | 2 × 18,422 |
| 2 | 12 | 164 | 22,504 | 352 × 242 | 2 × 15,794 |
| 2 | 16 | 164 | 22,504 | 352 × 235 | 2 × 13,862 |
| 8 | 8 | 377 | 287,970 | 4,500 × 467 | 18 × 22,349 |
| 8 | 12 | 373 | 287,970 | 4,500 × 441 | 18 × 19,187 |
| 8 | 16 | 371 | 287,970 | 4,500 × 435 | 18 × 15,290 |

Every original polynomial slot remains, including identities and contradictions; every lookup occurrence remains. For each measurement the analyzer checks `active + fixed = source wires`, `live cells = active wires + carry`, `padding = rectangle − live cells`, and the exact total-obligation identity. It enumerates sparse placements rather than billions of dense cells.

## Conditional proof and commitment costs

These projections extend the **shape** of the current native laboratory construction with blowup 16 and 96 unique antipodal query pairs. They do not extend its cryptographic qualification or assert these parameters meet a security target for larger relations.

For stage width `W`, distinct range widths `b`, and columns with range queries `I`, the current layout has `W+b` base columns, `I+2b` auxiliary extension columns and two quotient extension columns. At least

```text
192 · [8(W+b) + 32(I+2b+2)] bytes
```

are needed just for their initial opened values. Two OODS claims per column add `64(W+b+I+2b+2)` bytes. This is why shortening a stage by making it extremely wide does not yield a small native proof.

The report also gives a stronger codec lower bound including its fixed headers, OODS, roots, terminal, and unavoidable canonical Merkle/frontier/FRI values. For `k` antipodal pairs in a layer of size `M`, each half needs at least `popcount(M/2−k)` frontier hashes. After round `j`, the original 96 distinct pairs can collide only in classes of size `2^j`, so `ceil(96/2^j) ≤ k ≤ min(96,M/2)`. The analyzer minimizes each layer's `2k·32 + 2·popcount(M/2−k)·48` independently. This is a lower bound even if no single query set achieves all minima. The arithmetic was independently checked by another agent. It is not a generated proof size.

For `t` ticks, projected trace size is the next power of two above both `t × stage_rows` and the largest table, followed by a 16× LDE. The existing common-domain lookup scheme therefore requires at least 256, 4,096 or 65,536 rows in 8/12/16-bit mode. A separate table domain would require a new authenticated argument.

Selected eight-car, 8-bit projections:

| Bank | Rows × width/tick | 9,000-tick proof-byte lower bound | Packed joint LDE, 5,400 ticks | Packed joint LDE, 9,000 ticks |
| --- | --- | ---: | ---: | ---: |
| 16 | 17,999 × 398 | 3.12 MiB | 32.03 TiB | 64.06 TiB |
| 64 | 4,500 × 467 | 3.65 MiB | 9.42 TiB | 18.84 TiB |
| 256 | 1,125 × 717 | 5.49 MiB | 3.57 TiB | 7.13 TiB |
| 1,024 | 282 × 1,698 | 12.76 MiB | 2.08 TiB | 4.17 TiB |
| 16,384 | 18 × 22,349 | 163.49 MiB | 1.67 TiB | 3.35 TiB |

5,400 ticks is the original 180-second duration at 30 Hz; 9,000 is the current Tokyo native maximum of 300 seconds. The report also contains 1-, 64- and 256-tick projections. For example, the eight-car 8-bit bank-1,024 layout has about 0.52 GiB packed joint LDE for a single tick, but its opened group values alone already exceed 12 MiB. The smaller-width bank-64 alternative needs about 2.35 GiB for a single tick. Sharding bounds peak work, but does not erase total work or remove the need to authenticate state between shards.

“Packed joint LDE” counts base values as eight-byte F and auxiliary/quotient values as 32-byte Fp4; it is also the minimum payload fed into row hashing. It is **not measured RSS**. The current PCS stores even base rows as Fp4: the bank-64, 9,000-tick matrices alone would occupy 29.97 TiB before vector headers, Merkle trees, selectors, quotient/FRI work and temporary buffers. The report separately accounts for these Fp4 matrices and vector headers.

At that same bank-64 projection, the three base/aux/quotient trees alone require 3,221,225,469 internal hashes. An ideal base-specialized FFT requires about 38.8 trillion scalar-coordinate butterflies; the current all-Fp4 implementation requires more. These operation counts are not a throughput or wall-clock forecast. Streaming can reduce resident storage but cannot remove these bytes and computations.

The native Goldilocks two-adicity is 32. Bank-one eight-car projections exceed it: at 9,000 ticks the LDE would have `2^36` rows, and at 5,400 ticks `2^35`. They are invalid native domains, not merely expensive. Bank 16 reaches `2^32` at 9,000 ticks, the mathematical limit. None of these sizes is admitted by the present fixed n=256 proof profile. Some wide layouts also exceed the native row leaf's u16 word count, even before proof-byte limits; the report flags that separately. All eight-car measured widths exceed the current laboratory witness-width cap of 256.

## Why ROM membership should come first

The remaining wide ROM equations contain most of the arithmetic expansion for two cars and a substantial fraction for eight:

| Cars | Wide ROM output sums | Quadratic terms in those sums | Share of all terms, 8-bit mode | Naive local MAC rows/tick | MAC rows after replacing only those sums |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 | 160 | 219,070 | 76.10% | 310,569 | 91,339 |
| 8 | 640 | 876,280 | 45.78% | 2,203,679 | 1,326,759 |

The census counts post-substitution equations with at least 128 quadratic terms. In the inspected helper these are the expanded fixed-table sums; the other limb/Boolean/selection/comparison constructors do not emit such fan-in. Each sum also has its output linear term. All these terms and their source equations remain in the measured reference.

The final column is an accounting counterfactual: it removes the expanded terms and leaves one boundary/check row for the corresponding predicate. It excludes the cost of the replacement lookup, operand authentication and table proof. It is not a claimed final row count. Even after this saving, a generic local-MAC conversion remains large, so it must be measured before choosing it as the production architecture.

The next concrete implementation should add a compiler-owned fixed-table read obligation and a matching native proof attachment. Preserve the existing selected-row/index arithmetic, exact index bounds, output min/max ranges, signed interpolation, collision and all other scalar constraints. Replace only the expanded table-selection sum and then remove its basis auxiliaries if they have no remaining obligations. Keep the current complete circuit as the equivalence reference.

For each compiled table column, an exact scalar key is available:

```text
key = index + R · (value − L)
0 ≤ index < R; L ≤ value ≤ U
key ≤ R · (U−L+1) − 1 < 2^63 < p
```

Here `R ≤ 4096` and the existing strict ±2^50 integer endpoints give `U−L < 2^51`. The bounds must be actual proved constraints, never metadata. Within those bounds, equal field keys imply equal integer keys; reduction modulo `R` identifies the same row and then the same value. This is injective packing, not probabilistic tuple compression.

Keep each table/column identity separate in the compiled profile and lookup identities. All columns of one read must use the same authenticated index wire; independently matching values from different rows is invalid. Table entries and identities must come from verifier-compiled canonical bytes, with padding excluded. The affine key can be evaluated directly in the lookup AIR from committed index/value columns, avoiding an unbound extra key witness. Because its trace-row key lies in F, the existing `β ∉ F` predicate still excludes every table/query pole.

A key approaching 2^63 does not fit the helper's current strict ±2^50 integer-wire API. Do not widen its metadata or route this calculation through unchanged integer `add`/`mul` builders. If a separate key cell is materialized, introduce a private typed field-key construction with the actual polynomial `key − index − R(value−L)=0`, canonical field decoding and the independently proved operand bounds above. Direct evaluation of the affine query expression avoids that extra cell, but still requires a new authenticated-query lowering.

This key arithmetic alone is **not an authenticated ROM proof**. The implementation must bind query expressions to committed source columns, commit any multiplicities before the challenge, prove all inverse/sum/terminal identities, preserve complete counts and fixed queries, and include the table/column identities in the transcript/profile. Adversaries must cover wrong index, same value at another index, swapped columns/tables, output bounds, padding and cross-read splicing. A 1,404-row Tokyo table also raises a shared table-domain minimum to 2,048 rows; that new cost must be measured. Retain 8-bit ranges for the first short-shard qualification rather than assuming 16-bit raw-wire savings improve proof cost.

## Later compact operand layout

If the post-ROM measurements still require a new operand layout, use a fixed-address immutable scalar-value table and local gates, not an unnecessary dynamic RAM system. Each original nonconstant wire has one canonical value; every compiler-fixed operand occurrence must authenticate its read. Addresses include the fixed tick/instance and wire namespace; duplicate ports retain their equality occurrences. Fixed per-address read multiplicities can be computed from the complete eager program. Dropping unused outputs, inactive branches or disconnected assertions is forbidden.

Before ROM replacement, eight-car 8-bit mode has 348,366 immutable scalar values, 3,254,298 arithmetic operand reads and 219,236 range-query reads per tick. These are real bus obligations. They cannot be replaced by matching a checksum of honest values.

A deterministic native-Fp4 address/value encoding is possible: `K([value,address,0,0])`. It is injective for canonical F coordinates; sample the challenge outside `span{1,u}` by requiring coefficient two or three to be nonzero. That excludes every possible encoded tuple pole, with challenge support `p^4−p^2`. Both value-table and operand columns must be committed before the challenge. The AIR must constrain the two source coordinates to base-field cells, the other coordinates to zero, exact fixed addresses/namespace, table uniqueness/completeness and every read multiplicity. Arbitrary extension-field advice cannot stand in for this construction.

This bus still needs its own authenticated lookup argument, degree/soundness accounting and adversarial tests. It does not inherit the scalar range proof's certificate. Cross-shard input/output state, accepted history, first terminal execution and global proof padding also remain required. No 128-bit claim, full Street proof, real-time proving cost or ledger activation is established by this census.
