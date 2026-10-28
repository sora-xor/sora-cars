# Independent Street proof-layout review

> Historical laboratory record. The standalone constraint-plan runners have been retired. Current checks run in the native Iroha Core modules; their compilation and results must be established on the selected revision. Recorded counts below describe the original source, not current proof cost or full-history qualification.


September 8, 2026. Read-only review of the final [layout report](../../output/qualification/street-proof-layout/report.json), [Rust census](../../output/qualification/street-proof-layout/source/scripts/native/street_proof_layout.rs), [runner](../../output/qualification/street-proof-layout/source/scripts/analyze-street-proof-layout.py), and [architecture proposal](STREET_PROOF_LAYOUT.md). No production source, maintained Iroha file, or active full-race run was changed. I did not rerun the census or generate a proof for this review.

**Conclusion:** the census supports implementing authenticated ROM reads before expanding the present dense proof layout. The final report makes its conditional cost model clear. I found no remaining concrete arithmetic or source-preservation defect in the reviewed measurements and bounds. This is not approval of an implemented replacement lookup protocol or a security claim.

## Source and measurement evidence

I rehashed all **26 live source pins**, their frozen copies, and all **44 retained artifacts**. They match the final report. The frozen assembly retains the generated Tokyo relation and the actual scalar/geometry/scheduler modules; only the census harness's entry point is assembled around them. Every graph output is passed to the complete lowerer, geometry lowering is required, and the scheduler receives every scalar input/output pin. There is no alternate physics, sliced equation set, or host-witness substitution in the measurement path.

I independently compared all **48 schedule records** to their raw retained JSON output, recomputed histogram totals and term counts, and checked the six 16,384-bank endpoints against the prior limb report, including graph-node and port counts. I also independently recomputed all **240 duration projections'** codec lower bounds, domain sizes, opened-value bytes and current PCS matrix/FFT accounting. The complete graphs have 5,587 nodes for two cars and 101,808 for eight. The live-interval census checks that its interval peak equals the scheduler width and that live, carry, padding and total-obligation counts agree.

The measured timing and RSS describe constructing these schedules. Duration-dependent raw/LDE sizes, FFT/hash counts and proof-byte bounds are projections. No full-duration matrix, proof, validator-cost measurement or throughput forecast was produced by this analyzer.

Two review issues were corrected before the final report was pinned:

- The exact 248-byte outer proof header depends on `lookup_protocol.rs`; that source is now pinned and frozen alongside the common/PCS/AIR modules.
- Eight-byte base-field LDE payload was initially easy to confuse with actual current PCS storage. The report now separately counts the current all-Fp4 matrices, row-vector headers, and corresponding coordinate FFT work. Packed bytes are not reported as measured RSS.

## What the dimensions establish

Bank-one widths are exact minima only for the retained equation order and current simultaneous-equation/port/lookup placement model. Grouping consecutive equations cannot remove overlapping live intervals. The analyzer explicitly verifies that interval coloring attains the peak. Equation reordering, a different primitive gate representation, or authenticated operand storage could change this bound.

For eight cars, those minima are **377, 373 and 371 columns** in 8/12/16-bit mode, all beyond the current laboratory's 256-column cap. Increasing the bank size reduces row count but enlarges the committed row openings. With the proposed generalized shape and 96 unique antipodal query pairs, the 16-bit 16,384-bank profile needs **117,101,568 bytes just for opened base/auxiliary/quotient values**. This already exceeds the 4 MiB envelope; streaming or extra RAM does not remove this communication requirement.

All eight-car bank-256 profiles similarly exceed 4 MiB from group values alone. Bank-64 profiles pass this necessary byte test, but their smaller lower bound is not evidence that a complete proof fits or is practical. Their width, domain, selector, memory and cryptographic requirements remain outside the fixed laboratory profile.

The conditional codec lower bound is arithmetically valid for its stated format. There are 192 distinct original opened rows. For a subset of `k` leaves in either half of a binary tree, missing subtrees partition `M/2-k` leaves into powers of two, requiring at least `popcount(M/2-k)` frontier hashes. Antipodal symmetry gives twice that count. After folding, the stated collision-class bound on `k` is valid. Minimizing each round separately can only weaken the bound; the document correctly does not claim all minima are jointly attainable.

The native FFT obtains roots from the Goldilocks **base** field and has two-adicity 32. Thus `16*n > 2^32` is an invalid native domain, not just a resource concern. The eight-car bank-one full-duration projections exceed this limit. Reaching `2^32` at bank 16 is a mathematical domain limit, not a supported or qualified production configuration. Fp4 challenge arithmetic does not automatically extend this native base-root FFT API.

## ROM and operand-bus proposal

The wide-ROM term census is exact for the reviewed source. Only the fixed-table sum constructor emits the reported fan-in in the current limb-mode helper. The proposed reduced MAC counts are explicitly accounting counterfactuals: replacement lookup, table and operand-authentication work is excluded. They must not be quoted as implemented row counts.

The proposed scalar packing is injective under its **proved** bounds:

```text
key = index + R*(value-L)
0 <= index < R <= 4096
L <= value <= U, with U-L < 2^51
0 <= key <= R*(U-L+1)-1 < 2^63 < p.
```

Canonical field equality therefore implies integer equality; reduction modulo `R` recovers the index and then the value. This does not hold merely because metadata declares those bounds. The selected index and output range constraints must remain. Separate table/column identities must also remain: pooling differently typed column tables would permit cross-column matches. Every column in one read must use the same authenticated index.

The final proposal correctly identifies the required implementation boundary. Keys may exceed the helper's strict ±2^50 integer API. They need either an affine query expression evaluated directly from the committed, bounded index/value columns or a private field-key construction retaining the exact defining equation. Widening integer metadata is not a solution. No authenticated ROM replacement is implemented by these inequalities alone.

The optional later encoding `K([value,address,0,0])` is injective for canonical base-field coordinates. A challenge outside `span{1,u}` cannot equal any such key and has support `p^4-p^2`. This requires exact coordinate construction, fixed address/instance/table namespaces, unique and complete value-table addresses, pre-challenge commitments and authenticated operand occurrences. Without these obligations, ordinary lookup membership in a worker-chosen table does not establish an immutable memory relation. Neither deterministic encoding nor the larger challenge field supplies a composed security certificate.

## Review pins and limits

| Artifact | SHA-256 |
| --- | --- |
| Final report | `45000f8e598dbcede04fd9aa33ec145d366952c6ea319c3ba60cc6f1c92672b1` |
| Python analyzer | `d8a2ce957d9e071ed981e125423033a661cc4ac9aa03a30302704fbfb496da90` |
| Rust census | `c31765f51e2105b28e247c4380828e125ce01b844dca7194714157e5d860e39e` |
| Architecture document | `c3dfd270fae87e108c9fad15e3b03cdc54bdf5e422ac59ce2f5c7e634d34cebe` |

The next architecture choice is supported by measured structure and explicit cost formulas. Replacement-ROM correctness, complete authenticated lookup composition, full-size proving, accepted-history and terminal binding, finalized inclusion, and settlement remain separate qualification gates. This review makes no nominal 128-bit claim.
