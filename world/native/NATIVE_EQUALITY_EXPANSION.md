**Native equality-table experiment — September 8, 2026**

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


The split-table candidate is **2.12–2.17× faster than the retained native reference** for the four measured sizes. A simpler one-product kernel accounts for most of that improvement, at **1.95–2.05×**. These are allocation-plus-expansion timings on an Apple M4 Max, using native Goldilocks/Fp4 arithmetic. They are not whole-proof timings. At this experiment's completion neither candidate was integrated. The [subsequent whole-proof comparison](NATIVE_EQUALITY_PROOF.md) applies the one-product loop to two laboratory helpers; admitted profile parameters remain unchanged.

The [research briefing](../../docs/research/september-2026-briefing.md) identified a September 3 Binius64 equality-table optimization. This experiment independently implements the factorization using our retained native field type and compares it with a simpler arithmetic optimization. No external code or zkVM was adopted.

For a challenge vector `r`, coefficient `i` is the product of `r[b]` when bit `b` of `i` is one, and `1-r[b]` otherwise. Bits are least-significant first. The retained reference expands each pair using two multiplications. The `single_product` candidate instead uses `right = v*r; left = v-right`. Exact field distributivity gives the same coefficients with one product per pair. It keeps the reference's traversal and output storage.

The `split_product` candidate builds a low-bit table in the first block of the final vector and a separate small high-bit table. It appends `high[j] * low[i]` at index `j * 2^cut + i`, then scales the first block last. This ordering also handles `high[0]=0`, without division. Both component tables use the one-product expansion. Consequently, the split-versus-single comparison isolates the additional traversal/storage change more closely than comparing split only with the two-product reference.

| Dimension | Coefficients | Reference ms | Single-product ms | Split-product ms | Split scratch |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 16 | 65,536 | 2.7925 | 1.3869 | 1.3198 | 8 KiB |
| 18 | 262,144 | 11.5465 | 5.6417 | 5.3194 | 16 KiB |
| 20 | 1,048,576 | 45.9704 | 23.5829 | 21.5845 | 32 KiB |
| 22 | 4,194,304 | 184.8440 | 90.0927 | 86.5282 | 64 KiB |

Each entry is the median of seven retained samples after two warmups, with allocation included and checksum/direct-oracle checks excluded from timing. Each kernel/size runs in a separate process; process order alternates with size. This is one local run, without machine isolation or confidence intervals. Compiler: retained Rust 1.93.1 for aarch64, optimization level 3, no target-specific CPU override. Kernels are single-threaded. Machine inspection returned Apple M4 Max, 16 physical cores and 128 GiB RAM; this does not claim all cores were used.

At dimension 22, the requested output is 128 MiB. Measured process peak RSS was 129.625 MiB for reference/single and 129.703 MiB for split. RSS includes warmups, checksum, direct checks and allocator overhead. The split kernel's additional requested scratch is 64 KiB; allocator/page effects need not equal this exactly. No claim of lower whole-prover memory follows.

The [candidate source](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/equality_expansion.rs) rejects dimensions above 24 and noncanonical coordinates, checks output-plus-scratch byte arithmetic before allocation, and uses fallible reservation. At dimension 24 the split payload budget is 512 MiB output plus 128 KiB scratch. That dimension's rejection boundary was tested without materializing its table; runtime performance was measured only through dimension 22. Allocator rounding, headers and caller-owned data remain outside the requested-payload gate. Existing proof helpers' smaller caller limits remain unchanged.

Five focused tests passed: direct per-index products with genuine extension-field inputs; exhaustive Boolean coordinate patterns through dimension 9; canonical boundary values; allocation/dimension limits; and complete coefficient comparison against the native reference at dimension 18. All 84 measured output hashes match between kernels for the same input and size. Additional direct coefficient checks run outside each timed sample. The tests use canonical native encodings, not a host floating-point approximation.

Historical command and evidence:

Recorded retired invocation:

```text
python3 scripts/test-native-equality-expansion.py --lane native-equality-expansion-attempt-1
```

The runner (retired source path `scripts/test-native-equality-expansion.py`) freezes eight source inputs, extracts the exact reference kernel with minimal allocation/error adapters, and reuses the retained compiler and dependency family. All 59 source pins in the prior finalized-history report were rechecked unchanged **at this run**. Its strict checks now correctly reject the modified helpers in the current checkout: selecting a new lane alone is insufficient to rebuild this historical experiment. Rebuilding requires its original source snapshot and retained dependency family; do not weaken the old checks or overwrite evidence. No Cargo/dependency build or maintained Iroha write occurred. Compilation emitted ordinary unused-code warnings from the retained modules; it was not a warnings-as-errors gate.

The retained binaries can still repeat their tests and kernel measurements against the same compiled implementations. These commands produce fresh stdout; they do not update the historical report:

```sh
output/qualification/native-equality-expansion-attempt-1/tests fixture::tests:: --nocapture
output/qualification/native-equality-expansion-attempt-1/bench reference 18 9831
output/qualification/native-equality-expansion-attempt-1/bench single 18 9831
output/qualification/native-equality-expansion-attempt-1/bench split 18 9831
```

The [report](../../output/qualification/native-equality-expansion-attempt-1/report.json), SHA-256 `9ec2e1c1fcb9f0c639ce470e235aefb2d3c362873552a2d289c6f8942c1ea07e`, retains every sample, checksum, process peak, source/compiler/binary identity and 15 successful command receipts. The 464-node/2,421-file retained dependency family was checked before and after. A final audit matched source snapshots, binaries, all sample logs and command exits to that report. Only the five relevant tests ran; 24 other native harness tests were filtered out.

The [separate integration comparison](NATIVE_EQUALITY_PROOF.md) checks complete proof bytes, transcripts and outputs before selecting any further optimization. The split method remains experimental: its measured 4–9% additional kernel time reduction would need to justify extra scratch and accounting in a complete workload. Supported-target/accelerated parity, composed security and live settlement remain unqualified by this kernel experiment.
