# Native Street scalar equations with dynamic WHIR openings

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


This laboratory connects **every scalar equation in the actual two/eight-car, one-tick Street compiler output** to a native polynomial commitment. It retains all input/output ports and adds a zero equation for every padded value. Verification compiles the public relation and receives only the externally expected public statement and proof. It never generates the witness.

This is an arithmetic component of the requested game proof. **Range and ROM membership, global base-field membership, accepted input history, disputes, full-duration resources, ledger finality and composed security remain unqualified.** The successful result type and CLI receipts preserve these boundaries. Live XOR/NFT settlement is disabled.

## Complete compiler relation

[whir_street_arithmetic.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_street_arithmetic.rs) borrows the original immutable `OperandProgram`; it does not select a prefix or omit a difficult equation. Ordered linear/quadratic occurrences, including repeated reads and zero coefficients, remain explicit. Public input and output equations follow the original equations, followed by every tail-zero equation. The exact descriptor includes the complete original descriptor, compiled opening profile, all ordered equation groups and public values. A streaming native framed hash binds these bytes without making another descriptor-sized copy.

| One simulated tick | Two cars | Eight cars |
|---|---:|---:|
| Original values | 24,406 | 340,566 |
| Original scalar equations | 20,394 | 279,530 |
| Original linear terms | 41,603 | 568,240 |
| Original quadratic terms | 23,332 | 454,949 |
| Public ports | 141 | 351 |
| Added tail-zero equations | 8,362 | 183,722 |
| Augmented scalar equations | 28,897 | 463,603 |
| Augmented linear terms | 50,106 | 752,313 |
| Augmented quadratic terms | 23,332 | 454,949 |
| Padded value count | 32,768 | 524,288 |
| Factor rows | 65,536 | 1,048,576 |
| Remaining range reads | 16,572 | 219,236 |
| Remaining ROM reads | 160 | 640 |

The six-factor expression is `C + Lw*Lv + Qw*Ql*Qr`. Equation equality weights are drawn after the real value root and initial OOD reply. The cubic sumcheck starts from exactly zero. At its terminal point, the verifier reconstructs the three public factors and checks the terminal equation. It then scatters the three read evaluations through the compiler-owned operand maps, accounting for repeated reads and constant offsets, and proves the resulting three linear forms against the same value root.

The source compiler binds membership declarations but scalar verification does not discharge them. For example, the preceding composition laboratory’s independent tests deliberately construct a scalar-valid, range-invalid witness. Membership cannot be inferred from a successful polynomial equation check.

## Dynamic opening profile

[whir_geometry.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_geometry.rs) selects a complete immutable schedule from `m=2..20`. Each stage folds `min(4,m-1)` variables, with one variable remaining at the terminal polynomial. Every codeword has rate `1/16`; stages use 256 uniform draws with replacement. Merkle deduplication never removes repeated algebraic contributions. See [WHIR_GEOMETRY.md](WHIR_GEOMETRY.md) for exact stage/domain formulas, wire bounds and the conditional interactive error calculation.

The two-car value dimension is `m=15`, folds `[4,4,4,2]`. Eight cars use `m=19`, folds `[4,4,4,4,2]`. Both Base and Extension initial encodings are exercised; every shifted codeword uses Extension encoding. All folds use the predecessor's powered coset when checking samples. A caller cannot choose a fold schedule, query index, proof count or weaker parameter inside a proof.

[whir_dynamic.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_dynamic.rs) maintains a single affine transcript through initial OOD reply, equation challenges, cubic outer rounds, terminal reads and WHIR. It has separate domains and wire magic from earlier experiments. The parser reconstructs transcript-selected opening geometry, enforces exact canonical bytes and EOF, and confers no acceptance by itself. Verification authenticates every sample and both terminal conditions. Decoding derives query challenges without allocating the combined weight table; the verification pass constructs that table once.

The profile arithmetic and conditional interactive bound are **not a 128-bit composed-security claim**. Native hash/Merkle binding, Fiat–Shamir, the outer reduction's knowledge premise and the remaining execution predicates still require complete analysis and independent cryptographic review.

## Resource and evidence boundaries

The adapter validates source values and equation challenges once per factor-table construction. Equality tables take linear work in their output length. Dense factors fold in place, and all six allocations are released before opening construction. Admission separately bounds the owned adapter, dense reduction, query construction and full opening phase under a 2 GiB tracked-payload ceiling. Borrowed source allocations and allocator overhead are excluded from this ceiling; actual process RSS is measured externally.

Opening admission includes all retained codewords, query copies/descriptors, value/weight tables, basis buffers and retained proof/opening buffers. Commitment admission runs before basis allocation. The profile's `m=20` Extension case exceeds the current local 512 MiB per-codeword budget and is rejected before that work; the geometry document also calculates the explicit larger local budget it would require. Local limits never weaken the verifier relation.

The standalone runners use unchanged whole retained native Iroha modules, a pinned Rust compiler and pinned precompiled dependencies. No Cargo/dependency builds or maintained Iroha edits are involved.

- test-native-whir-dynamic.py (retired source path `scripts/test-native-whir-dynamic.py`) freezes and tests the opening, scalar adapter and independent attacks.
- test-native-whir-street.py (retired source path `scripts/test-native-whir-street.py`) freezes the full Street driver, runs separate fixture/prover/verifier processes and retains stdout, stderr, timings, RSS and file hashes.
- native_whir_street.rs (retired source path `scripts/native/native_whir_street.rs`) accepts bounded exact files and creates new outputs. Its fixture alone performs all-node native witness and raw scalar/staged/operand checks.

The combined dynamic suite passed **45 tests**, including 20 tests for the new geometry, dynamic opening/query helpers, scalar adapter and independent attacks. The other 25 are regression tests reused from the preceding native laboratories. The five independent attacks use genuine commitments and canonical openings; coherent false candidates satisfy every sumcheck round identity before rejection at the intended terminal/fold check or compiler-owned read reconstruction. Tests cover all fold sizes one through four, multiple shifts, full extension-field values, altered context/ports/tail and exact parsing.

Combined test report: [native-whir-dynamic-audit/report.json](../../output/qualification/native-whir-dynamic-audit/report.json), SHA-256 `58f0d1389800b85552b386f0ce960a76c290a56d3269bc5937ade82ef9ae0226`.

## Actual Street CPU measurements

Each row is one local run of the complete one-tick scalar relation. Operation times exclude public compiler/descriptor construction; process peak RSS includes it. Base and Extension are separate runs with different commitment identities, so timing differences are not a controlled encoding-speed comparison. No accelerator or full-duration result is inferred.

| Cars / initial encoding | Proof bytes | Commit (s) | Outer + opening prove (s) | Verify (s) | Prover peak RSS (decimal MB) | Verifier peak RSS (decimal MB) |
|---|---:|---:|---:|---:|---:|---:|
| 2-base | 327,312 | 1.231 | 0.672 | 0.743 | 89.2 | 72.6 |
| 2-extension | 426,384 | 2.073 | 0.713 | 0.944 | 107.8 | 71.7 |
| 8-base | 578,112 | 18.659 | 15.678 | 7.706 | 1288.6 | 989.9 |
| 8-extension | 682,704 | 33.143 | 10.548 | 10.525 | 1493.2 | 989.9 |

The eight-car compiled arithmetic descriptor is 243,384,119 bytes. Reconstructing and hashing it took 9.445 seconds in the Base prover and 16.739 seconds in the Extension prover. This setup cost remains a material part of the whole process; the verifier independently rebuilds the complete relation. These measurements are evidence for the component, not a practical full-race proving target.

The verifier ran with only `statement.bin` and `proof.bin` in its working directory after the original witness pathname was renamed. This demonstrates the implemented verifier input path; it is not an OS sandbox claim. Proofs bind all declared public ports, while the provenance of the externally supplied statement remains unauthenticated by this laboratory.

The complete measurement run passed all 12 accepted CLI commands (fixture/prove/verify for each of four cases) and 28 altered-input/proof/output-overwrite rejection commands. Final report: [native-whir-street-qualified/report.json](../../output/qualification/native-whir-street-qualified/report.json), SHA-256 `109454e546452fcadb272538a9caf2f6a58d8fb0b08032d7763f2ecf0ade3a37`. Its 30 current source pins were checked after the run. The supplemental [CLI parser audit](../../output/qualification/native-whir-street-cli-audit/report.json), SHA-256 `e1f2d89162992dcd015f8d034dd25a1ed9b00b4ec89e39b7452249c4116edea4`, passed 42 additional rejection cases using the byte-identical frozen binary without another proof run. Every case required exit code 1 and its intended explicit error; the audit rejected panic, signal, OOM or proof-production evidence. Together the runs cover 70 external rejection commands. The supplemental review also checked every full-source census and exact public statement/proof identity in all four main cases.

The final `artifacts/native-whir-street.json` evidence manifest retains the sources, compiler/dependencies, reports, binaries, logs and byte-identical documentation snapshots. This is internal qualification of the stated scalar component, not external cryptographic review or game release approval.
