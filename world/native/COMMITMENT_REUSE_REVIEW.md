# Native commitment reuse review

> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


Reviewed and exercised on September 7, 2026. The maintained Iroha source, index, HEAD, Cargo and native dependency build hold remained in force. The only new executable was compiled in SORA CARS from frozen copies of native modules, using already-built dependency artifacts. No cryptographic algorithm, field implementation, codec substitute or successful-verification stub was introduced.

## Result and implemented boundary

The existing execution commitment pipeline can consume the new staged rows directly. The narrow path is:

`canonical u64 rows → execution row_leaf_hash_v1 → execution StreamingMerkleAccumulatorV1 → canonical multiproof verification`.

`scripts/native-commitment-adapter.py` implements that boundary and freezes the modules under `output/qualification/street-commitments/native-adapter/source`. It compiles whole module copies rather than extracting or rewriting field, hash or Merkle functions. The adapter compiles with the retained Rust 1.93.1 compiler and links retained artifacts; it does not invoke Cargo, the old build helper, dependency build scripts or an Iroha executable.

The executable is:

```text
output/qualification/street-commitments/native-adapter/adapter
```

Its interface is:

```text
adapter commit ROWS WIDTH RAW_U64LE_SPOOL OPEN_CSV_OR_DASH
adapter verify ROWS WIDTH EXPECTED_ROOT_HEX OPEN_ROWS_U64LE OPEN_CSV FRONTIER_CSV_OR_DASH
adapter self-test
```

The spool is headerless, row-major, exactly `ROWS × WIDTH × 8` bytes. Every cell is a canonical Goldilocks residue encoded as a little-endian u64. Openings are sorted, unique, zero-based indices, or `-` for the root-only pass. The adapter rejects a wrong file length, truncated/trailing input, noncanonical field, invalid opening set or invalid shape. It performs no automatic padding. The exporter must supply and account for every padded row explicitly.

Output is JSON with schema `sora-cars.native-row-commitment.v1`, row/width/byte counts, the root, canonical minimal frontier and requested leaf digests. Digests are the native 48-byte little-endian digest encoding rendered as hex. Opened row contents remain in the retained spool, avoiding a large JSON copy. The opening pass invokes the native multiproof verifier before producing its result.

The separate `verify` command accepts an externally expected root, the requested rows only in sorted opening order, and an untrusted frontier. It requires a nonempty opening set, exact row-file length and exact native-derived frontier count. Every digest must be exactly 96 lowercase hex characters decoding to six canonical field coordinates. It rehashes each requested row at its claimed index and calls the unchanged native `verify_canonical_multiproof_v1`; it does not generate its own expected root. A `-` frontier is valid only when no frontier nodes are required. Its JSON uses schema `sora-cars.native-row-opening-verification.v1` and reports `verified: true` only after that comparison, with `scalarVerified: false` and `cryptographicProof: false`.

This is a commitment to the supplied matrix. `scalarVerified` and `cryptographicProof` are explicitly false: the caller must first execute the complete scalar equations, range memberships and staged boundaries, and independently bind the resulting commitment to the exact statement. A changed canonical row can produce a valid different commitment; rejection requires comparing it with an already expected root.

## Exact native source reuse

Paths in this table are relative to `../iroha/crates/iroha_core/src` and line numbers refer to the frozen source identified below.

| Native source | Reused functionality and relevant lines |
| --- | --- |
| `privacy_engines/transparent_stark.rs` | Canonical base field and exact u128 reduction at 161–265; Fp4 representation, arithmetic and inverse at 275–487. |
| `execution_proofs/poseidon2.rs` | Complete execution permutation and sponge, lines 15–201; exact incremental final-field stream at 203–295; upstream permutation KAT and framing tests at 298 onward. Includes unchanged `poseidon2_constants.rs`. |
| `execution_proofs/stark/transparent_stark.rs` | Execution-only context at 60–106; reexports the native field/Fp4 at 127; primitive roots/FFT at 216 onward; typed digest frame at 678; incremental frame at 714; materialized Merkle tree at 766; indexed node hash at 862. |
| `execution_proofs/stark/aggregate_stark.rs` | Vector-row leaf at 1156; streaming Merkle accumulator at 1418–1589; iterator entry point at 1592; column-streamed row commitment at 1627–1761; canonical index validation at 3240; frontier length at 3318; materialized frontier at 3340; canonical multiproof verifier at 3383. |

The harness also freezes the aggregate inline-test dependency `stark/aggregate_stark/retained_polynomial_tests.rs`, provenance document and both upstream license notices. The actual crate-root module paths are the only new assembly; production source files are byte-for-byte copies, with `sourceTransformations: []` recorded in the report.

The field is `p = 2^64 − 2^32 + 1`. The quartic field is the native `Fp[w]/(w^4−7)` with coefficients in ascending powers, canonical input checks and its existing inverse construction. Fp4 is unnecessary for a row commitment itself, but is compiled unchanged for the later transcript/FRI boundary and smoke-tested here. No new arithmetic type substitutes for it.

The execution hash is the existing Poseidon2 width-16/rate-8/capacity-8 sponge, exponent seven, eight full and 22 partial rounds, with six canonical output coordinates. The privacy module still contains its separate six-lane width-three Poseidon format. Only the privacy **field/Fp4 implementation** is selected by the execution module; this adapter does not call the privacy digest or privacy transcript. Identical digest carrier types do not make the two commitment algorithms interchangeable.

The existing native Poseidon2 provenance file explicitly labels its security qualification unfinished. This review retains that status. Passing the upstream permutation vector does not establish whole-proof security.

## Execution domains and byte framing

`TransparentStarkDigestContextV1::execution_v1(PROFILE)` is used directly. Its existing native catalog calculation is SHA-384 of `iroha:execution:catalog:v1:poseidon2-w16-r8-c8`, through the real retained `sha2` implementation. The protocol label is `native-execution-v1`; contexts with a privacy protocol are rejected. No constant-return SHA-384 shim replaces this calculation.

The adapter fixes the diagnostic profile to `sora-cars:street-staged-row-commitment:diagnostic-v1`, with distinct fixed leaf/node roles `sora-cars:street-staged-row:leaf:v1` and `sora-cars:street-staged-row:node:v1`, and group zero. This is deliberately an unregistered experimental context. It is not the older RaceV1 or Touring proof profile and asserts no network/race authentication.

The native row leaf binds:

- The exact catalog/protocol/profile/role, phase `vector-row-leaf`, level zero, row index, and group as counter.
- Group and width as separate big-endian u16 fields.
- The ordered canonical row cells as one byte field, each encoded big-endian u64 by the existing native function.

The adapter's little-endian file representation is therefore decoded before the native row encoding; it is not hashed directly as a different row format. Merkle parents use the existing `binary-merkle-node` phase, parent level/index, and the two native 48-byte digest encodings. Field tags, lengths, seven-byte injective byte chunks, per-field termination and final sponge padding remain unchanged.

Profile, role and phase must be nonempty and fit u16 length. Underlying framed byte fields and field count fit u32; length failures are not silently reduced. Group and row width fit u16. The native leaf helper assumes `F` values have already been canonicalized, because the tuple constructor is crate-visible; the adapter calls `F::canonical` for every cell and never calls its unchecked constructor.

The root alone does not bind a game's source manifest, public action transcript, network, race, rules, final outputs or native graph identity. The next statement/transcript adapter must bind these explicitly, together with original and padded row counts, width, row ordering, profile, layout, field encoding and all lookup relations. Our fixed experimental context is not a replacement for those bindings.

## Memory and supported sizes

`StreamingMerkleAccumulatorV1` consumes ascending leaf indices, keeps at most one pending subtree per level, and captures only requested frontier positions. It retains `O(log N + frontier length)` hashes instead of the complete tree. Openings must be sorted and unique. Empty openings are allowed for a root-only pass. Exact leaf underflow/overflow is rejected; a leaf count must be a positive power of two.

`StreamingRowCommitmentV1` is a **column-at-a-time** interface for LDE columns. It keeps one incremental sponge per row and requested full rows. Its storage is therefore `O(N + QW)`, before transform scratch; it is not an O(log N) matrix commitment. Reusing it for an existing row iterator would introduce avoidable transpose/replay work. The implemented row-at-a-time adapter holds one row, the native temporary encoded row, logarithmic pending hashes, frontier hashes and requested leaf hashes: `O(W + log N + frontier length + Q)` auxiliary storage. It does not retain the whole matrix, all leaves or a tree in its normal commit command. The materialized tree and column path are used only in bounded parity tests.

The underlying Merkle helper has integer/allocation checks but no application-specific global memory budget. This adapter adds independent fixed engineering limits:

| Limit | Value |
| --- | ---: |
| Rows | Positive power of two, at most 1,048,576 |
| Width | 1–65,535 |
| Total spool bytes | At most 8,589,934,592 |
| Requested openings | At most 272, sorted and unique |

These are host experiment caps, not a supported STARK proof profile. Width 22,349 from the eight-car 8-bit-limb schedule fits the native row encoding. Three ticks have 54 staged rows, requiring 64 explicitly accounted-for rows for this Merkle shape. Those dimensions do not establish low degree: zero-padding a finite scalar schedule is not yet a sound AIR padding relation.

Goldilocks FFT domains have two-adicity 32. The native primitive root helper rejects larger logarithms; allocating a domain also requires `usize` representability and a valid power-of-two shape. Aggregate proof parameter validation is more specific: the current common core fixes query count to 136 and blowup logarithm to three, constrains column/group counts to u16 and requires maximum LDE logarithm at most 32 and less than `usize::BITS`. The execution data-model envelope is four MiB. These existing proof-specific limits are **not** exercised or inherited by merely committing staged rows. The new relation still needs its own trace layout, lookup argument, selector/composition degree accounting, FRI/DEEP geometry, soundness and resource qualification.

Column-streamed masking/commitment also retains masked polynomial coefficients, and its transform batches permit eight concurrent columns. Streaming a Merkle tree does not eliminate coefficient, LDE, composition, lookup or FRI memory. No full-race memory or validator cost claim follows from this adapter.

## Dependency corridor and reproducibility limits

The minimal unchanged whole-module closure needs seven direct external crates: `fastpq_isi`, `iroha_data_model`, `rand`, `rayon`, `sha2`, `thiserror` and `zeroize`. Reusing whole native files avoids edited derives, privacy enum stubs, erased zeroization or alternate hashing, although it retains a larger compile/link dependency graph than a later extracted library would need.

The adapter uses the exact existing `native-proof/first-release/libfastpq_isi_o3.rlib`, SHA-256 `1c47e101152618cff3db008c4ffa827b5e7699b89534ad741fc94d541ade29ae`. This supplies the real native digest carrier, domain types, stream errors and parameter constants. The retained source tree is copied beside it for provenance. This is a **historical compiled dependency**, not a claim that its entire source equals current `fastpq_isi`; the report keeps that distinction. The execution permutation and framing themselves come from the current frozen `poseidon2.rs`, not that dependency's privacy hash.

The other dependencies use the already retained `output/sorafs/japanese-DsOhaMOw-afeca13c/verification` closure. All 404 compiled artifact hashes, totalling 1,265,351,712 bytes, were checked before and after the build/tests; the manifest is copied into this evidence directory. This is artifact-pinned dependency evidence, not a new source-reproducible build of the dependency closure.

An initial exact-module link reported missing `pqclean_common`. The implementation did not rebuild it or add an unrestricted native search path. The retained `pqcrypto_internals-d5226399fdf52b84` metadata identifies build-script fingerprint `2922885560381384599`; this matches existing lane `pqcrypto-internals-dcec2e013332d239`. Its already-built `libpqclean_common.a` and `libkeccak2x.a` were copied, hashed and linked from the adapter's own output directory. Both fingerprint records are retained. These dependencies are pulled transitively through the data model; they are not a newly selected commitment algorithm.

All streaming native functions are gated by `cfg(test)` or feature `privacy-release-evidence`. The standalone executable sets that existing feature; a separate test executable enables the existing tests. A normal maintained release build does not automatically expose the experimental streaming path. Promotion to a maintained reusable commitment library is a later source/design change, still outside the hold.

This qualification used the retained `1.93.1-aarch64-apple-darwin` compiler and its actual cached dependency closure. It does not demonstrate cross-target support, a current full-Core Cargo build, or accelerator parity. If those cached artifacts or native archive fingerprints cannot be authenticated, the script fails rather than compiling a dependency, changing algorithms or substituting a verifier.

## Executed tests and evidence

The four unchanged execution Poseidon2 tests passed:

1. Published Plonky3 width-16 complete permutation vector.
2. 100,000 exact wide-reduction comparisons against full u128 modulo.
3. Field/domain/padding separation.
4. Incremental versus one-shot hashing at every tested split, including atomic overrun and underrun handling.

The published vector is a **permutation** known-answer test. The digest framing tests are parity/separation tests; this report does not describe them as a separate external full-digest known-answer vector.

The adapter's 24 cases cover tree lengths 1, 2, 4, 8, 32 and 512 at widths 1, 7, 8 and 17. For each, the unchanged full Merkle tree, row-streamed accumulator and column-streamed row commitment produce identical roots, canonical frontiers and requested rows. The 512-leaf full tree also exercises its native parallel-parent path. The test rejects 292 altered index/group/profile/leaf-role/row-width/value/node-role cases and malformed row streams/frontiers, as applicable. Extra shape/opening validation and base-field/Fp4 inverse smoke checks also pass. This does not test a GPU or all Rayon pool configurations.

Separate process-level CLI tests verify a subset, all rows with an empty frontier, and a singleton. They reject 24 altered or malformed expected roots, noncanonical digest coordinates, frontier counts/values, empty/duplicate/unsorted/out-of-range indices, wrong tree shape, canonical but altered row values, reordered rows, widths with a correspondingly resized file, and truncated/trailing/noncanonical row files. `external-cli-tests.json` retains every exact invocation, exit code, stdout and stderr. These tests exercise untrusted opening admission against an independently supplied expected root.

Current evidence:

- Adapter binary SHA-256: `3c0cb329cd7739b2cbbc3fd1580ec9690a4a88e8edbdf3a30b82f4992aee445c`.
- `native-adapter/report.json`: `831d8e660f3f8838701a507a15e3d7c4bf5ab6d0cae636d299a936e9f7450c05`.
- `native-adapter/evidence.json`: `dad200b8ddd4efc41823c126dda4dadbb9a07aae26727f3e46fccbc89cd9041d` pins 40 retained files, including logs, CLI fixtures and the script.
- `scripts/native-commitment-adapter.py`: `c1219eb3c638e65743b9af823f3ad978d4e1210e4e3dc2aef424d42fd0bf8780`.

Current compiled native source SHA-256 values:

```text
privacy_engines/transparent_stark.rs
a1425266d801ca69b52b4f4bdac045307e73b988eea3aeb402e16da749558192
execution_proofs/poseidon2.rs
a6af6d9a59a6df6fd8f211386707d413d68062201af0c35a85dd84b86780e118
execution_proofs/poseidon2_constants.rs
d2f0c4f1aed8bfb516ff4bf16beec08d69603c9031cc1e25ec1de670063cdaa1
execution_proofs/stark/transparent_stark.rs
86f684bddd22e4f59f328a6096c6cf647b142b917c6773444e5f11c692b481cd
execution_proofs/stark/aggregate_stark.rs
b16e8e505a1bcbc99584807ef06f66ad723cfc95ee9fa0c618a7914f0f28db0d
```

## Next integration obligations

The exporter should independently verify its scalar/staged rows before creating a spool, retain its source/schedule/public-input identities, then run a root-only pass and a later opening pass over exactly the same bytes. It must compare the two roots and pin file contents before/after if it uses a mutable filesystem. The adapter validates what it reads, not filesystem immutability.

For a future proof, post-commitment queries must come from the complete domain-separated Fiat–Shamir transcript. Hand-picked diagnostic openings cannot establish low degree or computation correctness. In particular, the new range memberships remain explicit obligations; committing their limb cells does not prove table membership. No accepted lookup protocol, AIR, full execution proof, at-least-128-bit soundness, public finality, consensus or funded settlement is qualified here.
