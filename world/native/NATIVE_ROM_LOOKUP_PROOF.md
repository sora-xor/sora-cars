# Native indexed-ROM proof laboratory

September 8, 2026. This implementation applies the [September cryptography research](../../docs/research/2026-09-cryptography-review.md) to the measured road-table bottleneck: exact bounded integer semantics now have an opt-in, compiler-owned indexed-table representation, and a closed native proof exercises the full-size Tokyo table. It is a public computation proof laboratory. It does not qualify full Street racing, authenticated input history, ledger settlement or 128-bit composed soundness.

The maintained Iroha checkout and Cargo/dependency build lane remain held by the Taira rollout task. This work uses standalone Rust under `sora-cars`, unchanged whole frozen Iroha execution cryptographic modules, and the previously hashed compiled dependency closure. No external zkVM, native cryptographic replacement, maintained-Iroha edit, frontend deployment or live XOR enablement is involved.

## Exact relation and proof binding

`Circuit::with_lookup_tables(8|12|16)` selects detached ROM membership alongside the existing exact range limbs. The original pure-bit and expanded-ROM constructors remain equivalence oracles. Every read retains actual index bounds, Boolean index decomposition, exact signed output ranges, ordered occurrences, and a compiler-owned table identity. Equal complete columns may share storage; repeated reads still count repeatedly. The raw verifier checks each exact canonical `(index,value)` against the actual private table, independently of witness hints.

The stage compiler retains both operands at the read's original equation anchor. Its immutable export includes complete table bytes, actual row count, source identities, substituted constants and physical staged bindings. Fixed, duplicate, disconnected and lookup-only obligations are retained. The native AIR refuses ROM obligations in its smaller range-only profile.

For a column of R rows with proved endpoints L,U, the proof uses the affine field key:

```text
key(i,v) = i + R*(v-L)
0 <= i < R <= 4096
L <= v <= U; -2^50 < L <= U < 2^50
key <= R*(U-L+1)-1 < 2^63 < p
```

The integer envelope makes field equality imply integer equality; reduction modulo R recovers the same index. Proved index bounds prevent the alias `(R,v-1)` with `(0,v)`. No oversized key is placed in the ordinary integer-wire API. Every table namespace has independent multiplicity and accumulator columns. An inverse is shared only for an identical static affine expression, including both index/value bindings, R and L.

The proof commits all original witness values and multiplicities before deriving the extension-field lookup challenge. It then constrains all query inverses, table reciprocals, forbidden padding multiplicities, cyclic accumulator recurrences and their zero origins. Every original scalar equation, range membership, carry, public boundary and global witness padding equation remains. A factored evaluation of the global padding sum preserves the identical polynomial and its original rule inventory; it is checked against naive evaluation on trace, coset and extension-field points.

## Closed Tokyo fixture and parameters

The compiled fixture performs two reads per step for three steps from the actual 1,403-row Tokyo adjacent-interval table. Four complete columns contain start/end heading and start/end half-width. It retains all eight requested values per step, including values not selected as public outputs, plus bounded state updates and an inactive branch. Public indices visit the beginning, middle and last real interval. The source has 1,404 road samples; the padded domain is not part of the member set.

This is an indexed-read computation. It does not prove world-progress selection, interpolation, the remaining twelve geometry columns, eight-car physics, first-terminal admission, signatures or consensus dispute authority.

| Quantity | Closed profile |
| --- | ---: |
| Trace domain N | 2,048 |
| Active rows / steps | 12 / 3 |
| Original witness columns | 44 |
| Base / auxiliary / quotient columns | 52 / 59 / 2 |
| ROM namespaces / ordered occurrences | 4 / 24 |
| ROM inverse expressions | 8 |
| Blowup / LDE rows | 16 / 32,768 |
| FRI folds / terminal values | 11 / 16 |
| Unique query pairs | 96 |
| Complete proof byte cap | 4 MiB |
| Witness / base / auxiliary column caps | 256 / 288 / 352 |
| Descriptor cap | 32 MiB |
| ROM table / total entry caps | 16 / 65,536 |
| Combined range and ROM occurrence cap | 65,536 |

Separate profile, transcript suite, proof magic and public-statement domains identify the N=2,048 laboratory. Dimensions are selected by compiled code, never by proof metadata. Privacy and existing Iroha execution wire formats are unchanged.

The composition polynomial has degree at most 6,141. Honest exact division produces quotient degree at most 4,093, represented by two 2,048-coefficient pieces. **The verifier's two opened pieces admit reconstructed degree up to 4,095**, so the malicious OODS comparison polynomial must be accounted up to degree **6,143**. These admitted bounds are exported separately; the honest quotient constructor's tighter bound is not a verifier constraint. The initial X·DEEP opening oracle has admitted degree at most 2,047, and eleven folds require a degree-zero terminal; an internally consistent degree-2,048 candidate is tested through native verification.

The transcript binds the complete compiled tables, equations, schedule and independently supplied public statement. The statement includes network, execution, dispute epoch, accepted-history label, action tape and final outputs. These laboratory labels bind bytes; they do not authenticate a network, signed history or finalized ledger.

## Evidence and costs

The [helper and full-circuit measurements](../../output/qualification/street-detached-rom/README.md) retain 37 helper/reference tests, 5,477,145 expanded/detached/native node comparisons and 42,363 actual staged rows. The [scheduler report](../../output/qualification/staged-fixed-rom/report.json) retains 65 tests and baseline equality for 12 schedules and 60 witnesses. All six 2/8-car × 8/12/16-bit circuits retain the prior range obligations and the complete 16-column geometry table.

Eight-car lowering removes 883,640 quadratic terms and 8,880 linear terms per tick, including the former shared bases. It adds 640 explicit ROM occurrences. At 8-bit limbs/bank64, the schedule changes from 4,500×467 to 4,368×467; at bank16,384 it changes from 18×22,349 to 18×22,292. The 16-bit/bank16,384 width slightly increases. Dense full-duration proof memory remains unresolved; these term counts are not a full-race prover speedup.

The final [combined proof tests](../../output/qualification/native-lookup-rom-combined/test-report.json) pass **29 tests**: 19 ROM/helper/stage/adversarial cases, five complete protocol cases, four native PCS cases and one canonical-wire case. Counts overlap with the earlier helper and scheduler suites. A coherent alternate-table witness satisfies every original arithmetic/range/boundary rule; its genuine foreign-table quotient and native PCS proof are valid. The **940,260-byte** encoded candidate is rejected by the actual closed verifier with the specific OODS quotient identity error. The **500,300-byte** coherent degree-2,048 candidate retains valid authenticated openings and eleven rounds of fold equalities, then fails the native terminal degree check. The AIR suite also rejects 122 auxiliary/padding mutations, a duplicate-query undercount only at the final cyclic row, and a packed index alias whose lookup identity closes but whose retained scalar bounds fail.

The [separate CLI exercise](../../output/qualification/native-lookup-rom-cli/cli-report.json) reproduces identical proof bytes and verifies after the witness pathname is removed. It rejects eight malformed/context verification commands and refuses to overwrite an existing proof. Six more [cross-profile CLI cases](../../output/qualification/native-lookup-profile-replay/report.json) reject foreign proof/public frames and header-retagged proofs between N=256 and N=2,048.

| Recorded CPU observation | Value |
| --- | ---: |
| Complete encoded proof | 934,724 bytes |
| Proving time | 21,310.747458 ms |
| Prover-process peak RSS, including self-verification | 211,828,736 bytes |
| Separate verifier time | 399.211917 ms |
| Verifier-process peak RSS | 15,630,336 bytes |

Compilation is excluded. These are one recorded process run, not isolated hardware characterization, an accelerator result, a full-race benchmark or a validator workload. Exploratory earlier timing is not used for a speedup claim. Proof SHA-256: `26b90518a289ad4e5975029221b8e57283cd4f9cf333034b245085d9b8ff62c9`.

The current [range-profile regression](../../output/qualification/native-lookup-range-regression/build-report.json) passes 25 tests; its separately reproduced proof is 466,536 bytes. Earlier 466,600-byte evidence remains historical under its frozen source/profile descriptor, rather than being relabeled as current. The [protocol review](ROM_LOOKUP_PROTOCOL_REVIEW.md) and [adversarial review](ROM_LOOKUP_ADVERSARIAL_REVIEW.md) distinguish executed evidence from remaining obligations. In particular, a fully coherent ROM-correct/range-wrong candidate through the entire cryptographic protocol remains an explicit additional adversarial gate.

[The composite manifest](../../artifacts/native-rom-lookup-proof.json) records
the original source identities, reports, documents, proof, expected statement
and compiled verifier. Exact commands remain in the
[retained CLI report](../../output/qualification/native-lookup-rom-cli/cli-report.json).
The old ROM table generator, standalone lookup runner, CLI helper and recorders
have been retired. Their pinned September artifacts remain historical evidence;
they are not operational inputs to current builds and must not be retargeted to
a fresh Street bundle. Current execution validation uses the maintained
[Native test and CLI paths](../../docs/native-public-game-bundles.md).

## Remaining qualification

The [next bounded compiler experiment](STREET_OPERAND_BUS_PLAN.md) will measure fixed-address operand reads and preserve every original scalar/range/ROM/boundary obligation before selecting a proof layout. It is a proposal, not an implemented bus or a claimed speedup.

The full Street relation still requires a practical layout/opening strategy, complete terminal and accepted-history binding, full-duration bounded-memory proving, measured verifier cost, supported targets and acceleration parity. The current fixed-size laboratory does not fit the complete eight-car staged relation. Its compact membership arguments do not make the existing multi-terabyte LDE projections acceptable.

Composed Fiat–Shamir/lookup/DEEP/FRI soundness against malicious oracles, the actual Poseidon/transcript assumptions and at least 128-bit security still require analysis and external cryptographic review. Generic Iroha game admission, custody, disputes, atomic XOR/NFT settlement, independent finalized inclusion, wallet interoperability and healthy Taira/SoraFS rollout remain separate gates. Live staked races remain disabled.
