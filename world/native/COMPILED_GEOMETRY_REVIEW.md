# Compiled geometry scalar review

> Historical laboratory record. The standalone raw-constraint implementation and its runners have been retired. Current implementation and test obligations live in Iroha Core; see the [current foundation goals](../../docs/zk-foundations-goals.md). Source hashes and measurements below describe the original reviewed revision and do not qualify the current verifier.

No scalar soundness defect was found in the pinned implementation. The geometry outputs are now derived by exact equations from constants in a constructed circuit, with no external geometry witness inputs in production lowering. This review does **not** qualify an AIR, a STARK, ledger acceptance, or a 128-bit security claim.

Reviewed on 2026-09-07 by the hazard-audit subagent, separately from the author of `fixed_rom.rs`, `street_geometry_constraints.rs`, and their lowering integration. The reviewer authored the unsigned decomposition primitive; its tests and separate review are additional evidence, not independent authorship of that primitive. This handoff changes documentation only. The maintained Iroha source/build hold remains in effect.

## Exact reviewed sources

| File | SHA-256 |
| --- | --- |
| `world/native/checked_constraints.rs` | `b4e63b00e8f4549ef77b8ffd4580850999c64c7d493951f9e46fa658c5617958` |
| `world/native/fixed_rom.rs` | `8d1d3f8b2bb40e65c44b42839bff1acc87edac53be3596606f6d43c5e6011fb5` |
| `world/native/street_geometry_constraints.rs` | `977e2dcf77ce56e836b2973d334fc40388bdd8a05b194fd8c4f1e1bc9b60a34e` |
| `world/native/street_checked_lowering.rs` | `c3215c84a7f779b98ee80e9e29bdd2cd87d892e107fdaf947f9d6526e7f2fcaf` |
| `world/native/street_geometry.rs` | `e9ced659cb0801a48cdae164460bf6c0d1d9624875330138e5c5a3bfd7a78fd6` |

All five source pins match the integrated scalar report, whose SHA-256 is `4a71f03ac0826bb6862005332caf67890a495b72dc4e2cde17e54a4c65f8be0f`.

## Checked obligations

- **Fixed constants and adjacent rows.** `FixedStreetGeometry::new` validates the native station table and compiles every adjacent pair into one sixteen-column ROM row. The ROM owns its constants. Every constant leaf and selector is retained as a circuit equation, so a coherent witness generated for a different table is not advice accepted by the original circuit.
- **Canonical interval selection.** With length `L`, `M = ceil(L/5000)`, and `h = floor(M/2)`, the validated stations are `s[k] = floor((kL+h)/M)`. For normalized integer position `p`, `s[k] <= p` is equivalent to `kL+h <= M(p+1)-1`. Therefore `j = floor((M(p+1)-h-1)/L)` selects the exact rounded station boundary. The interval index is `min(j,M-1)`. The `+1` and `-1` are necessary; `floor(pM/L)` would skip some boundaries.
- **Padding and Booleanity.** ROM access proves the exact index interval before decomposing the full unsigned value into little-endian Boolean bits. It prohibits all padded indices, including pads whose values equal legitimate rows. The full reconstruction prevents an index plus `2^bits` from aliasing the same selectors. The helper constrains actual bit Booleanity rather than trusting witness generation.
- **Safe sharing and retained branches.** DAG interning keys include the selector bit ordinal and both children. Identical-child collapse preserves the exact function. Distinct bit positions cannot alias merely because their children coincide. Every DAG node is emitted, including unselected branches; no output slice removes an equation.
- **Signed progress and the sprint endpoint.** Circuit normalization uses signed Euclidean remainder and exact winding. Sprint normalization clamps to `[0,L]`. At its endpoint, sample width comes from row `M`, while interval span and turn come from the final positive-length cell. The constrained interpolation then reaches the endpoint heading. Signed interpolation division truncates toward zero, matching the native reference.
- **Range and ownership.** The reusable checked primitives enforce canonical raw field witnesses, actual bounded reconstruction, and safe integer-to-field residual envelopes. The new ROM path uses these primitives and stays inside their strict signed endpoint domain. Width, delta and span narrowings remain real equations. Geometry lookup first validates wire ownership through checked operations.
- **Lowering scope.** Production `ScalarLowering::new` requires a compiled geometry object. The unbound geometry constructor is private and test-only. Its cache belongs to one circuit and geometry instance and is keyed by the immutable progress-node identity. Every graph operation and narrowing is retained, including assertions disconnected from observed outputs.

These conclusions are from code inspection and the bounded tests below. They are not a formal proof that every possible program or malformed witness is covered.

## Evidence and measured cost

The current [integrated report](../../output/qualification/street-checked-lowering/report.json) passes 25 tests: 17 checked-primitive tests, 3 ROM tests, 2 geometry tests, and 3 lowering tests. It also evaluates twelve ticks for each measured roster, comparing every graph node with the native reference. Its eight-car run compares 1,221,696 node values and rejects 3,049 raw graph-node mutations. Raw mutation tests use polynomial residuals; valid host-side recomputation is not a replacement for those checks.

| Per-tick scalar circuit | 2 cars | 8 cars |
| --- | ---: | ---: |
| Original graph nodes | 5,587 | 101,808 |
| Field witness cells | 286,655 | 2,294,085 |
| Retained equations | 459,907 | 3,095,060 |
| Maximum degree | 2 | 2 |
| External state/control inputs | 29 | 107 |
| Unresolved geometry inputs | 0 | 0 |
| Rejected raw node mutations | 512 | 3,049 |
| Construction time, milliseconds | 28.850 | 190.765 |
| Witness/adversary harness time, milliseconds | 253.843 | 1,894.754 |
| Harness maximum resident bytes | 195,543,040 | 1,435,467,776 |

An independent static reconstruction of the sixteen-column Tokyo ROM from the pinned track JSON agrees with the compiler count: 1,404 stations, 1,403 interval rows, 2,048 padded slots, 645 forbidden interval indices, and eleven index bits. Deduplication yields 22,677 DAG nodes per query: 6,535 constants and 16,142 selectors. The eight-car graph contains forty distinct progress queries. This reconstruction checks the inventory; it is not independent cryptographic verification.

The measured times and memory belong to direct scalar construction and witness checking on this machine. They establish neither a practical full-race prover nor validator verification cost. Multiplying this per-tick circuit by a full race is not a qualified AIR layout or performance estimate. Range/ROM scheduling and further measured optimization remain substantial work.

The separately authored [extended geometry suite](../../output/qualification/street-geometry-constraints/report.json) also completed before handoff, with matching source pins (report SHA-256: `c9f7a0ad5c49fd71cfe978c814d31e0c45686410a5a447d031ae155de39b6426`). It validates 14,110 Tokyo field witnesses and 5,214 synthetic field witnesses, and rejects all 645 coherent padded-index witnesses, alongside 53 Tokyo, 10 synthetic and 51 other ROM raw forgeries. Its integer/native index-and-heading sweep covers all 7,013,328 normalized Tokyo positions; that integer sweep is distinct from the smaller complete field-witness counts. The adversarial harness recomputes forged recipes in a test-only copy while retaining the original verifier and all polynomial equations. The [machine-readable review](../../output/qualification/street-geometry-constraints/review.json) pins these reports, their measured counts, and the primitive/static diagnostic evidence.

## Construction and ledger trust boundary

The table is authenticated **to the circuit constructed by trusted code**. A caller of `FixedStreetGeometry::new` may currently supply a different structurally valid table, and a caller of `ScalarLowering::new` may supply a different native graph. Doing so constructs a different relation. The constructor is not an admission check that either input belongs to an approved network, immutable game profile, or ledger state.

The eventual native verifier must resolve a closed, versioned compiled relation and table from the admitted immutable profile, derive the expected public statement from ledger state, and reject any prover-selected substitute. Binding must cover the network, instance, rules/track, roster, authorized keys, initial state, accepted transcript, dispute history and final outputs. This exact ROM design needs no unreviewed hash assumption for table selection, but it does not by itself supply that ledger binding. A generic untrusted uploaded graph/table cannot be treated as an approved profile.

## Remaining qualification

The current circuit checks one tick. A complete execution proof still requires constrained initialization, tick-to-tick state continuity, full-duration termination and padding, public-input binding, an actual native AIR/STARK schedule and transcript, reviewed degree and soundness accounting, and measured full-roster proving memory, time, proof size and validator cost. The 25 passing tests do not establish the requested 128-bit security target.

Consensus admission, escrow, dispute handling, atomic settlement, independent finalized inclusion, supported-target/accelerated parity, four-validator testing and deployment gates remain separate. No claim about those systems follows from this scalar geometry review.
