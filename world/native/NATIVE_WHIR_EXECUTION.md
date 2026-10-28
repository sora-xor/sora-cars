# Native scalar equations with authenticated virtual reads

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


September 8, 2026. The new native adapter connects a complete small compiler-owned scalar relation to the WHIR opening protocol. It removes the previous arithmetic reduction's three unauthenticated copied-read claims by deriving and opening exact public linear queries against one committed value table. It also checks explicit value-tail and public-port equations. Original range/ROM and execution-history predicates remain outstanding.

This is a new protocol with its own transcript domain and wire identity. Earlier sumcheck and standalone WHIR files remain unchanged reference evidence; no prior pending result becomes an authenticated execution result by reinterpretation. No racing-specific instruction, external zkVM, maintained-Iroha edit or dependency build is introduced.

## Implemented relation

[whir_execution.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_execution.rs) admits an immutable native `OperandProgram` with at most 64 active values. It retains every original scalar equation and adds, in order, every public input equality, every public output equality and an equation setting each remaining committed value slot to zero. Its descriptor binds the full original program, exact augmented equations, semantic group/ordinal, coefficients, repeated operands, fixed values and public expectations.

The outer proof first randomly combines the equation residuals, then runs a cubic sumcheck on six virtual factors. The verifier computes three public factors itself. It derives the other three as linear queries on the value table, accumulating repeated addresses and subtracting the exact contributions from fixed operands. The sumcheck's factor domain and the opening's value domain are kept distinct.

The success type is `VerifiedScalarEquations`. It identifies the source relation and root, the number of authenticated equations, public ports and tail zeros, and exposes the original unresolved range and ROM catalogs. It gives no integer-range, ROM-membership, base-field-membership, accepted-history, full-game, custody or finalized-ledger authority. Supplied public values are algebraically bound; their external provenance still belongs to the application/ledger adapter.

## One continuous challenge schedule

[whir_continuation.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_continuation.rs) provides affine phase objects for the complete schedule:

`expected relation/context → value root → initial OOD challenge/reply → equation challenges → cubic rounds → three read claims → derived query set → continued WHIR opening`.

Each cubic message carries exactly four canonical coefficients. A round consumes its state and rejects an incorrect zero/one sum; missing and extra rounds cannot reach the opening phase. The original OOD reply and the entire outer interaction remain in the native transcript. The opening context cannot be cloned publicly or reconstructed from a supplied final digest. A private copy for canonical parsing does not bypass arithmetic verification. Repeated OOD data in the opening wire must equal the original reply.

The stronger scalar result is created only by the adapter after its own public-factor terminal equation and all three derived read queries pass. A low-level continued opening verifies its supplied queries; it does not claim that an arbitrary caller chose the correct compiler weights or checked the outer expression.

The [composition specification and review](WHIR_EXECUTION_COMPOSITION.md) records exact equations, message order, independent attack coverage and security limits. The candidate algebraic subtotal is `3*(5/8)^256 + (8510 + m_E + 3*m_L)/|Fp4|`, conditional on the stated WHIR/compiler premises. The outer round-by-round knowledge-soundness mapping, actual native hash/Merkle assumptions, Fiat–Shamir transformation and implementation equivalence still require qualification. This is not a composed 128-bit claim.

## Scope of the measured fixture

The complete native fixture (retired source path `scripts/native/whir_execution_fixture.rs`) contains multiplication, a square, a repeated linear operand, an indexed ROM read with aliases and a fixed column, and aliased public outputs. It is generated through the actual checked native circuit and staged compiler rather than a hand-authored operand program or truncated racing trace. Original range and ROM declarations are retained and checked by the fixture's separate raw reference path.

The fixed 64-value opening profile cannot accommodate the full Street value table. This integration establishes the correct compiler ordering and read closure before selecting larger geometry. A small proof or successful raw membership check must not be represented as a full racing proof or as cryptographic closure of the remaining membership predicates.

The actual native fixture has 20 source wires, 19 active values, 17 source equations, 31 linear occurrences and four quadratic occurrences. Adding eight public-port and 45 zero-tail equations gives **70 equations, 84 linear occurrences and 128 factor rows**. Both the equation and factor domains use seven variables; the committed value polynomial uses six. The result retains eight range and three ROM obligations. Two separately checked raw witnesses cover 198 serial reference rows, outside the cryptographic operation timings.

## Native validation and measurements

The final [qualification report](../../output/qualification/native-whir-execution-qualified/report.json), SHA-256 `01d77bc67904f980e03022237605e8628a201329f606d7ca78ce897b8e4cbd36`, records 32 passing tests: 14 existing WHIR regressions, five continuation tests, four scalar-adapter tests, two fixture tests and seven independently authored composition tests. The CLI exercise contains ten accepted processes, 56 rejected external commands and two Python assertion-mode guard checks.

The independent cases include a genuine opening under substituted read weights while the outer product equation still holds, correct openings wrapped around false tail/constant-port equations, a changed ROM catalog with otherwise identical source equations, and a stale outer continuation. A separate canonical assignment satisfies all scalar equations while failing the retained raw range check; this confirms the stronger game result must continue to require membership proofs. The initial version of that test incorrectly assumed the compiler created one value; it was corrected to retain its two generated slack limbs as well. No production-code correction was needed during these runs.

| Initial encoding | Proof bytes | Initial commitment | Integrated scalar/opening prover | Separate verifier | Prover peak RSS | Verifier peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Base | 87,776 | 0.050134 s | 0.104063 s | 0.187339 s | 4,390,912 B | 3,096,576 B |
| Extension | 110,704 | 0.058228 s | 0.102008 s | 0.188847 s | 4,685,824 B | 3,129,344 B |

Source construction is measured separately at approximately 0.00062 seconds per process. CLI `result.elapsedSeconds` is its internal total, ending before receipt printing; `command.processSeconds` also includes process launch/exit. Initial commitment is separate from integrated proving. RSS is each process's measured peak, not inferred vector payload. These are individual local CPU observations without hardware isolation, not full-race, supported-target, acceleration or validator measurements.

Proof SHA-256 identities are `136cafd3098c4053ec1ff790f6f63124c59633d91ab7278cd62b385155abb90b` (Base) and `eb8995566cc934e6f8f7f845c93b090a319221569c208d1cfe18cd5ead524148` (Extension). Each proof reproduced exactly. Separate verifier processes consume a fixed 377-byte externally expected statement and proof, with the original witness pathname absent during verification. `program_only()` compiles the public circuit without generating or checking a witness. The statement carries the encoding, scope, application statement, expected root, three inputs and five outputs. Expected-statement authenticity is the caller's responsibility; a supplied file is not itself authenticated ledger evidence.

The retained binary has three commands, using new output paths:

```sh
output/qualification/native-whir-execution-qualified/whir_execution_cli fixture base statement.bin witness.bin
output/qualification/native-whir-execution-qualified/whir_execution_cli prove statement.bin witness.bin proof.bin
output/qualification/native-whir-execution-qualified/whir_execution_cli verify statement.bin proof.bin
```

`fixture` creates public synthetic laboratory data. Inputs require bounded regular files, canonical fields and exact lengths/EOF; outputs use `create_new`. The [composition evidence manifest](../../artifacts/native-whir-execution.json) retains current/frozen sources, native dependencies, binaries, raw logs, metrics, documents and source identities. The evidence recorder (retired source path `scripts/record-native-whir-execution.py`) rechecks hashes, sizes, test categories, raw CLI receipts/RSS, retained Street dimensions, original source pins, resolved-path containment and final document snapshots. The native runner uses the whole unchanged frozen Iroha modules and 404 precompiled dependencies; no Cargo or dependency build is performed.

The earlier measured complete Street relation requires 24,406 values for two cars and 340,566 for eight cars, even at one tick. Both exceed this profile's 64-value capacity. Those counts are retained measurements, not new full-Street proving runs or an argument for dropping constraints.

## Next qualification work

Close the retained range/ROM predicates through the same authenticated value oracle and prove its required field/integer interpretation. Then integrate first-terminal completion, exact state/action/final boundaries, accepted and pending input commitments, disputes and ordered shard history. Larger profiles require fresh resource and soundness accounting; measure full-duration memory, time and validator cost before release selection. Supported targets, acceleration, external cryptographic review and generic ledger settlement/finality remain separate requirements.
