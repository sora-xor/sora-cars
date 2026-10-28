# Native WHIR linear-query opening laboratory

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


September 8, 2026. The research-backed implementation now has a complete small native commitment/opening protocol for an externally expected set of linear queries. It uses the retained, whole Iroha Goldilocks/Fp4 arithmetic, coset transforms, Poseidon commitments and Fiat–Shamir transcript. No external proof implementation, external zkVM, Cargo build or maintained-Iroha modification is part of this laboratory.

This is a **64-value polynomial opening**, not a complete Street execution proof. It provides the next building block after the [pending native sparse sumcheck](NATIVE_SUMCHECK.md). The two protocols are not yet composed, and neither successful parsing nor the earlier sumcheck's pending result is promoted to execution authority.

## What is implemented

- [whir_commitment.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_commitment.rs): immutable, versioned codeword geometry; exact coefficient-to-coset encoding; packed leaves; canonical minimal Merkle multiproofs; caller-owned resource limits. Initial Base and Extension encodings bind different roots even when they describe the same embedded polynomial.
- [whir_linear.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_linear.rs): a fixed profile and immutable, ordered one-to-three public linear queries. Query IDs, every weight and each expected claim are bound before their batching challenge.
- [whir_protocol.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_protocol.rs): initial compiler OOD anchoring; exact quadratic sumchecks; two successive domain changes; carried weights and sampled-fold constraints; a terminal polynomial; and verification of both sampled terminal agreement and the final weighted equality.
- [WHIR_PROFILE_V1.md](WHIR_PROFILE_V1.md): complete message order, domain/degree accounting, proof-size bound and conditional interactive soundness calculation derived from the retained primary WHIR paper.

The polynomial begins with six multilinear variables. The three stages fold two, two and one variables; their codeword sizes are 8,192, 2,048 and 512. Each stage draws 256 independent query indices with replacement. Repeated indices retain every contribution to the algebra; only Merkle authentication requests are deduplicated. New domains have coset 7, while sampled points come from the correctly powered **preceding** domain.

Public context includes the profile, externally supplied scope/statement, expected initial root and exact ordered query set. The proof contains no chosen profile, weights, expected claims, query indices or opening counts. Its canonical fixed messages determine the random query schedule; native geometry then determines exactly how many field values and frontier digests to read. Arithmetic and authentication are verified separately after parsing, before constructing `VerifiedLinearQueries`.

The initial-OOD types preserve an unauthenticated challenge/reply phase. There is no public resumed outer-protocol API yet. A future execution adapter must generate its dependent randomness after this phase, bind the entire intervening protocol, and resume these same obligations. Concatenating an already completed sumcheck transcript would not implement that construction.

## Validation and evidence

The owner test runner (retired source path `scripts/test-native-whir.py`) freezes local sources alongside the whole retained native modules, verifies the compiler and 404 precompiled dependency identities, compiles directly with native Rust, and rechecks identities after execution. It uses no source rewriting or dependency rebuild. The independent audit (retired source path `scripts/native/whir_protocol_audit.rs`) has its own transcript, weight restriction and explicit packed-fold computation. See the [review checklist](WHIR_REVIEW_CHECKLIST.md) for coverage and limits.

Independent attacks construct real roots and valid authentication paths around false computations. Their sumcheck messages satisfy every local identity and their proofs parse successfully. Separate candidates satisfy only one of the terminal checks, requiring the real verifier to reject at `FinalFold` or `TerminalConstraint`. A coherent initial codeword of degree 64 violates the declared strict degree bound. These tests go beyond altered honest proof bytes, but passing them is not a cryptographic security proof.

The native CLI and its retained exercise are described in the final qualification manifest, [artifacts/native-whir.json](../../artifacts/native-whir.json). The manifest pins source snapshots, binaries, logs, separate-process proof/verification measurements, review documents and the primary construction. Measurements are local CPU observations for this small profile. They do not measure full-race proving or deployed validator throughput.

There are 23 distinct passing WHIR tests: 14 owner tests and nine independent tests. The CLI exercise adds 48 rejected external commands across two encodings and verifies deterministic reproduction. Its exact accepted inputs are 6,458 public-statement bytes (three queries) and 2,056 witness bytes. A verifier process receives only the public statement and proof; the original witness pathname is renamed before verification. This verifies independence from a witness/replay file, not sandbox isolation from the operating system.

| Initial encoding | Proof bytes | Initial commitment | Opening prover | Separate verifier | Prover peak RSS | Verifier peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Base | 85,192 | 0.100992 s | 0.109016 s | 0.213739 s | 4,030,464 B | 2,686,976 B |
| Extension | 109,240 | 0.098133 s | 0.112084 s | 0.235713 s | 4,292,608 B | 2,670,592 B |

Commitment and opening time are separate measurements. The prover CLI's internal total is 0.220924/0.219860 seconds respectively, including file reads, binding construction and proof-file output, ending before it prints the JSON receipt. The separately recorded `elapsedSeconds` also includes process launch/exit. RSS is measured for each whole process with `/usr/bin/time -l`, not inferred from vector payload accounting. Compiler time is excluded. The verifier currently reconstructs the challenge schedule once to derive canonical parsing geometry and again while verifying; this small measurement does not justify a scaling claim.

Proof SHA-256 identities are `fef03c0da5b910472216635bdbc1218d46d47c92d69ca6c047f1dfaf6d7d9daa` (Base) and `53514b19d1506640075986200c598b0fa99bf1a0b8508c2f6dc1e7702ef8311b` (Extension). The [CLI report](../../output/qualification/native-whir-cli/report.json) is `4df872d33cc4b5015121c45958bb166755d8bb4c926802002bf747f5d626ab2d`. It preserves the original runner/report and unchanged measurements when a Python assertion-mode guard was added; that guard was checked separately without rebuilding native code.

The retained laboratory binary offers these commands from the repository root, using new output filenames:

```sh
output/qualification/native-whir-cli/whir_cli fixture extension statement.bin witness.bin
output/qualification/native-whir-cli/whir_cli prove statement.bin witness.bin proof.bin
output/qualification/native-whir-cli/whir_cli verify statement.bin proof.bin
```

`fixture` constructs synthetic public data for the experiment. For real verification, the caller must obtain the expected statement and root through an independently authenticated application context. The CLI does not turn an arbitrary supplied statement into a trusted network statement. Inputs require bounded regular files, canonical encodings and exact EOF; output files use `create_new` and do not overwrite existing paths.

## Security and application limits

The documented interactive oracle subtotal is `3*(5/8)^256 + 8510/|Fp4|`, using WHIR's theorem-supported unique-decoding regime. It excludes the actual native hash/Merkle binding reduction, Fiat–Shamir transformation and outer execution protocol. It **does not establish composed 128-bit security**. The implementation's native primitives and passing tests cannot supply those missing reductions.

All 64 entries are active generic field values. This opening does not independently authenticate a game's base-field membership, inactive tail, ranges, ROM, first-terminal rule, accepted/pending inputs, disputes or global state boundaries. It provides no privacy, custody, settlement or finalized-ledger guarantee.

The next work is the compiler-ordered outer sumcheck integration and authenticated virtual reads, preserving the entire original execution relation. Then close range/ROM and completion/history obligations, select and measure larger profiles with bounded total memory, derive the composed security budget, and obtain external cryptographic review before any live admission. Generic Iroha game/execution facilities remain the architecture; no racing-specific ISI is introduced here.
