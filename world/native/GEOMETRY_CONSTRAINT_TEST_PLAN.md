# Geometry constraint qualification cases

This plan specifies local native geometry and raw polynomial tests. It does not report a completed geometry lowerer, AIR, STARK, public-statement binding or cryptographic review. The diagnostic script only reads the existing source and generated bundles; its expected values use independent Python integer arithmetic. Native parity and forged-witness rejection must be measured separately.

## Pinned inputs and exact inventory

The source of truth for current host semantics is [street_geometry.rs](street_geometry.rs); the four graph fields are defined in [street_graph.rs](street_graph.rs). The browser reference is [track.ts](../../src/game/street/track.ts). Exact source, bundle and generation hashes, all query node identities, column ranges and expected boundary values are recorded in [diagnostic.json](../../output/qualification/street-geometry-constraints/diagnostic.json). Regenerate this read-only inventory with:

```
python3 output/qualification/street-geometry-constraints/diagnose.py
```

The inspected Tokyo circuit has length **7,013,328 mm**, **1,404 rows / 1,403 positive-length cells**, two laps and a 9,000-tick local cap. The 13 authored gate indices are `0,35,103,213,361,456,545,640,749,868,1048,1250,1381`. The first and last rows have identical east/north/elevation/width/curvature/sector; their headings differ by **−1,000,000 microturns**. The canonical integer-row array SHA-256 is `f95febd00df9d92eae98eccc927f329c767faabcf819b52ab06c73e7e6680808`, using the diagnostic's documented column order and compact JSON encoding. This digest is diagnostic provenance, not an on-chain commitment format.

| Table quantity | Exact current value |
| --- | --- |
| Cell spans | 4,998 mm × 269; 4,999 mm × 1,134 |
| Half-width | 4,408–6,500 mm; 761 distinct values; 914 changing boundaries |
| Stored heading | −1,280,011 to −268,027 microturns; 457 distinct values |
| Interval turn | −50,054 to +41,456 microturns |
| Turn signs | 707 negative, 507 positive, 189 zero cells |
| East / north | −788,653…832,621 / −2,487,941…13,485 mm |
| Elevation | 4,000–27,919 mm |
| Diagnostic curvature | −10,059…8,315; not integrated to obtain heading |
| Sector | 0–8; categorical and not interpolated |
| Largest absolute interpolation numerator for a nonterminal cell position | 250,169,892 |
| Negative / positive nonintegral interpolation offsets in one normalized lap | 3,532,415 / 2,533,568 |

The 80 geometry nodes in the eight-car graph are **40 heading, 24 half-width, 8 interval-turn and 8 interval-span** requests. There are **40 distinct progress-node identities** and **72 distinct `(field, progress-node)` pairs**. Eight initial-position queries each request heading twice and width/turn/span once. Eight more queries request heading and width, 16 request heading only, and eight request width only.

| Cars | Geometry nodes | Distinct progress nodes | Distinct field/progress pairs | Duplicate field/progress requests |
| --- | ---: | ---: | ---: | ---: |
| 2 | 20 | 10 | 18 | 2 |
| 3 | 30 | 15 | 27 | 3 |
| 4 | 40 | 20 | 36 | 4 |
| 5 | 50 | 25 | 45 | 5 |
| 6 | 60 | 30 | 54 | 6 |
| 7 | 70 | 35 | 63 | 7 |
| 8 | 80 | 40 | 72 | 8 |

A query cache may share decoding for the same circuit-owned progress wire and immutable table/topology. Equal witness values on distinct wires are not a reusable identity: they may differ in another witness. Do not merge two fields merely because current table entries happen to coincide. The graph's 80 geometry nodes must remain represented, including duplicate consumers and unused branches, after sharing.

## Exact semantic obligations

Let `L` be the compiled length, `M = ceil(L/5000)` the cell count and `h = floor(M/2)`. Native construction requires `500000 <= L <= 20000000`, `M+1` rows and station `s[k] = floor((k*L+h)/M)`. Thus these are rounded, distributed stations, not a fixed 5,000 mm grid.

1. Progress is a signed integer in `[-100000000,100000000]`. Reject both adjacent out-of-range endpoints. A circuit uses `progress = lap*L + position`, with Euclidean `0 <= position < L` and a floor-signed lap. A sprint clamps to `position = min(L,max(0,progress))` and uses lap zero.
2. The sample index is the greatest `k` with `s[k] <= position`. The exact algebraic index for this fixed station formula is `j = floor((M*(position+1)-h-1)/L)`. It follows directly from `floor((kL+h)/M) <= position` iff `kL+h <= M(position+1)-1`. Check the complete quotient/remainder relation, with `0 <= remainder < L`, rather than a witness hint or approximate ratio. For a circuit, `0 <= j < M`; for a sprint, `0 <= j <= M`.
3. A positive-length interval uses `i = min(j,M-1)`, and its endpoints must be the **adjacent immutable rows** `i` and `i+1`. Turn is `heading[i+1]-heading[i]`; span is `s[i+1]-s[i]`. A sprint at or past its finish still uses the final cell for these two fields.
4. Half-width is the exact sample-row width `width[j]`, including sprint terminal row `M`. It is not interpolated. A circuit at an exact lap boundary selects row zero. The sprint terminal sample and terminal interval therefore have different lower-row indices; test with a fixture whose last two widths differ.
5. Away from a sprint terminal sample, heading is `heading[j] + trunc((heading[j+1]-heading[j])*(position-s[j])/(s[j+1]-s[j])) + lap*winding`, with truncation **toward zero**, not floor. Sprint terminal heading is the exact terminal row heading. The signed numerator and positive span must feed the checked division relation, and both sign directions must constrain the quotient. Winding is the immutable terminal-minus-first heading and may be +1,000,000 or −1,000,000 for an admitted circuit.
6. Table values, length, topology and winding belong to the compiled relation, not prover-chosen public inputs. Local polynomial correctness under a frozen ROM is separate from binding that relation/profile to the network's public statement. East/north/elevation/curvature/sector currently do not feed these four geometry field outputs; changing them may define a different artifact with identical four-field behavior. Do not claim a four-field equation alone authenticates the full artwork/geography artifact.

Concrete index trap: Tokyo row 3 starts at **14,996 mm**. `floor(position*M/L)` incorrectly gives 2 there; the rounded-station formula and native binary search give **3**. A fixed `position/5000` formula also fails at the first station, **4,999 mm**.

Concrete signed-division trap: at Tokyo progress **1 mm**, the first-cell numerator is −1,068 and span is 4,999. The truncated offset is zero and heading is **−280,011**. Floor division would fabricate **−280,012**. Row 8 supplies a positive nonintegral counterpart: progress 39,991, turn +32, span 4,999 and offset zero.

| Tokyo progress | Lap | Position | Sample/cell | Heading | Width |
| ---: | ---: | ---: | ---: | ---: | ---: |
| −7,013,329 | −2 | 7,013,327 | 1,402 | 719,990 | 6,182 |
| −7,013,328 | −1 | 0 | 0 | 719,989 | 6,187 |
| −1 | −1 | 7,013,327 | 1,402 | −280,010 | 6,182 |
| 0 | 0 | 0 | 0 | −280,011 | 6,187 |
| 1 | 0 | 1 | 0 | −280,011 | 6,187 |
| 7,013,327 | 0 | 7,013,327 | 1,402 | −1,280,010 | 6,182 |
| 7,013,328 | 1 | 0 | 0 | −1,280,011 | 6,187 |
| −100,000,000 | −15 | 5,199,920 | 1,040 | 14,041,476 | 6,500 |
| 100,000,000 | 14 | 1,813,408 | 362 | −14,510,886 | 5,990 |

## Honest and exhaustive qualification layers

Keep native reference/independent integer checks separate from polynomial witness checks. Reconstructing host outputs does not establish that forged auxiliary cells are rejected.

- **Every real cell:** check station−1, station, station+1 and each interior midpoint. Check both sides of all 914 width changes, every turn-sign transition, both span sizes and all gate stations. Cover first/last cells independently. The diagnostic enumerates 12,632 distinct station±1 progress values across laps −1, 0 and +1 plus the two global progress endpoints. This count describes a planned test set; the diagnostic does not execute native/parity checks for it.
- **Every normalized integer position:** cheaply compare the exact index formula against native binary search for all 7,013,328 Tokyo positions. Compare integer heading interpolation across each cell's complete residue positions so the 3,532,415 negative nonintegral cases cannot silently acquire floor semantics. This reference/index sweep can be separate from the more expensive full field-witness sweep.
- **Every valid lap image:** for every integer lap intersecting the permitted progress domain, test the exact seam, seam±1 and at least one nonzero position when in range. Verify `heading(p+L)-heading(p)=winding`, identical sample width/turn/span, and telescoping heading changes across mixed forward/reverse multi-lap routes. Include negative exact multiples and `±100000000`.
- **Both topology branches:** use an independently native-admitted sprint with differing penultimate/terminal widths. Check −100000000, −1, 0, 1, every station±1, L−1, L, L+1 and +100000000. For progress>=L, sample width must be terminal width, heading terminal heading, interval span positive and interval turn the final stored difference. Native sprint validation requires the last two headings equal, so its final interval turn is zero; do not accidentally test an inadmissible sprint as an honest case. Before zero, every field uses the clamped start state.
- **Both windings and signed headings:** create native-admitted circuit fixtures with ±1,000,000 winding. A structurally admitted 500,000 mm square station table with 100 cells and heading steps ±10,000 provides a small ROM; such a synthetic fixture qualifies arithmetic, not geographical fidelity. Add positive, negative and zero heading deltas; exact-divisible and nondivisible offsets; width endpoints 2,500 and 12,000. Exercise a 500,001 mm fixture to cover the smallest nonuniform station distribution near the length minimum, plus 20,000,000 mm / 4,001 rows at the maximum.
- **Full graph:** after single-query qualification, compare every scalar node in all 2–8 roster graphs using current canonical replay inputs. Include repeated queries, reverse movement, contact-stopped progress, laps, terminal/padding rows and forfeited/inactive cars. A consumer must not skip geometry because a later select chooses another branch. Completion of local geometry must remove only the geometry-unresolved marker; it must not mark AIR, continuity, public statement or proof qualification complete.

## Coherent raw-field witness attacks

For every mutation below, begin with a valid witness, mutate the target, and recompute all affected auxiliary bits, slacks, selected row fields and arithmetic descendants to make the forged interpretation internally consistent. Keep the compiled polynomial list, constants and intended progress input fixed. Then verify the full raw canonical-field witness against those polynomials. Record a failing equation identity and its nonzero residue. Single-cell mutations should remain an additional broad coverage test, not the only adversary.

| Forgery | Required rejecting obligation |
| --- | --- |
| Choose previous/next cell at station−1, station or station+1; use the 14,996 mm approximate-index mistake | Exact rounded-station quotient/remainder and strict remainder upper bound; or equivalent exact interval inequalities |
| Shift lap by ±1 and position by ∓L while keeping progress reconstruction | Euclidean position bounds; no acceptance of remainder −1 or L |
| Treat −1 as lap 0 / negative remainder, or wrap a sprint after its finish | Topology-specific normalization equations and exact signed division/clamp branches |
| Select sprint penultimate width at L, or terminal width at L−1 | Separate sample index from clamped interval index, exact terminal Boolean comparison |
| Pair row i's left endpoint with row i+2's right endpoint; take a span/turn from another valid cell | Both endpoints bound to one canonical cell index and immutable ROM selection |
| Supply a different valid in-range width, heading or turn; swap two valid table rows and recompute descendants | Verifier-fixed constants and ROM equations, not mere field range checks or a mutable table pointer |
| Use the same index under a different length/topology/winding/table, leaving a claimed profile identifier unchanged | Compiled descriptor binding locally; future public relation/profile commitment must reject cross-profile substitution |
| Use a padded ROM row or cell that contains zeros or a repeated terminal row | Exact index bounds: current rows 0..1403 and cells 0..1402; padding is never a valid index |
| Omit high index bits or alias index0 as index2048 | Full exact reconstruction, explicit bit count, caller wire bounds, and no ignored high bits |
| Set an index bit/selector to 2 or p−1, then blend valid rows to obtain an in-range fake value | Boolean equations for every selector plus retained selection equations |
| Use floor for negative interpolation, wrong quotient with compensating remainder, remainder equal to divisor, or flipped sign at zero | Signed truncation and strict quotient/remainder/sign constraints; canonical zero auxiliaries where promised |
| Use an adjacent lap's valid heading while keeping the same local cell/width | Exact winding multiplication and final heading reconstruction |
| Reuse a lookup from a different progress wire that happened to match at an earlier tick | Circuit-owned cache identity and equations tying each lookup to its own progress |
| Drop an unobserved geometry node or an unselected branch; falsify only that lookup | All-node retention independent of output reachability and branch selection |
| Change a wire to the noncanonical field encoding p, or exploit a whole reconstruction residual equal to p | Raw canonical-field admission plus a documented complete integer residual envelope below p |

For a binary ROM padded to 2,048 slots, the current table has **644 invalid row slots**; a cell ROM has **645 invalid cell slots**. Try every padded index with coherently recomputed selector wires. Valid terminal row 1,403 is not padding, but it is not a valid positive-length cell start. Repeating terminal values in padding does not discharge index-range obligations.

The exact index numerator for admitted dimensions is bounded by `M*(L+1)-h-1`, at most 80,000,001,999 for `M=4000,L=20000000`. Query normalization can start from a ±100,000,000 input, but must constrain its resulting position before this formula is used. Check full residual envelopes for index division, lap reconstruction, signed heading interpolation and winding multiplication; safe individual cells do not rule out an equation aliasing Goldilocks modulo p. New unsigned decomposition must reconstruct the **entire** supplied value, not only a low-bit suffix, with circuit-owner checks and no mutation on rejected construction.

## Admission, publication and evidence limits

Bad table construction must reject before emitting a partially usable relation: wrong row count, station±1, zero span, swapped rows, invalid widths/headings, duplicated adjacent coordinates, invalid seam, and inadmissible sprint endpoint. Test lengths 499,999 and 20,000,001 as rejection cases. Distinguish a native-admitted alternative table from a malformed table: an alternative must either compile to a different immutable relation descriptor or be rejected by exact profile matching; acceptance under a different descriptor is not a constraint failure.

Record source/table/graph hashes, primitive and full-graph equation counts, auxiliary-cell counts, maximum degree, all honest cases, coherent forgery residuals, raw noncanonical rejection and peak construction/witness memory. Re-run only affected layers when sources change. Even with all of these local tests passing, all-tick continuity, staged AIR, canonical initial/final state, signed input/dispute/public bindings, commitments/FRI soundness, supported-target parity and independent cryptographic review remain separate release gates.
