**Ordered native membership proof components — September 8, 2026**

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


[membership_sequence.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/membership_sequence.rs) composes the existing complete [two-oracle membership component](NATIVE_MEMBERSHIP.md) across a bounded, nonempty execution from genesis. Each transition retains every original scalar equation, range/ROM occurrence, input/output port and both actual oracle tails. The sequence verifier derives the next input from its privately retained, already verified output. It also checks the exact first terminal transition and final public output vector.

This is a linear-size sequence of independently authenticated proofs. It does not aggregate them into a succinct whole-history proof. The external context and action tape are immutable inputs, but their authority is not authenticated here. Base extraction, full integer execution, accepted/pending input history, terminal-boundary adjudication, composed security, the 128-bit target, ledger inclusion and settlement remain unqualified.

**Compiled semantic identity**

`CompiledSequence::new` accepts a `TerminalAir` made by the existing `CompleteExecution` constructor. It derives its owned `OperandProgram` from that exact immutable stage; callers cannot substitute an unrelated operand program or provide proof-selected carry maps. It validates the source ports and consumes the four exported terminal predicates per transition, including aliased and constant ports.

The native domain-separated descriptor binds:

- The complete original source descriptor's digest and exact byte length, which identify its equations, fixed tables and public port layout.
- The full external context bytes, exact transition count, table/input/output/action dimensions and immutable terminal policy.
- Every state source's genesis value and previous-output index, and every action source's public tape column.
- The complete canonical action tape in order, the exact final output vector and all four terminal predicates for every transition.

The source is hashed in a bounded streaming frame using retained native Goldilocks/Poseidon primitives. The per-transition membership binding includes the whole sequence digest and transition index before the initial commitment/OOD transcript. Thus even editing a future action, final claim or external context changes the binding of transition zero. An opaque context digest still does not establish who authorized its contents.

Local sequence/membership/proof allocation budgets are excluded from semantic identity. The core uses one fixed compiler policy so different sufficient local limits cannot select different source identities. Eliminated staged padding is also excluded, because it is not part of this operand computation.

**State continuity, terminality and failure behavior**

For transition `i`, the expected input vector is derived as follows:

```
State input at i = 0: compiler-fixed genesis value
State input at i > 0: immediately preceding verified output at its mapped port
Action input:        immutable public tape[i][mapped column]
```

Each public occurrence remains explicit, including duplicate aliases. The complete membership relation authenticates the claimed output vector under those expected inputs. No host simulation, witness evaluation or caller-selected predecessor is used by the sequence verifier.

With `N` active transitions, the four authenticated public-port predicates are:

```
input.halt  = 0
input.tick  = i
output.tick = i + 1
output.halt = (i + 1 == N)
```

The halt/cursor inputs must be genesis-zero state sources with the exact compiler-owned output maps. This enforces the first terminal **transition**, not the separately documented earliest terminal batch-boundary policy. Resumed and zero-step completion are not supported by this interface. The final transition must authenticate every value of the expected final output vector.

`SequenceVerifier` has no clone, imported-state or resume constructor. `verify_step` poisons it before any fallible check. Incorrect order, invalid public ports, a bad proof, resource failure or any other error permanently prevents both further progress and successful `finish`. Only after the component proof, returned identity checks, receipt-chain hash and output allocation succeed are the outputs installed as the next private state. `finish` requires exactly `N` successfully verified transitions. An extra step poisons a previously complete but unfinished verifier.

The completed receipt binds the sequence identity and an ordered chain of each transition's index, component binding, both authenticated roots and completed component transcript. It reports accumulated source equations, membership occurrences, public ports, terminal predicates and authenticated oracle counts. The result is not merely the last transition's receipt or an unfinished transcript state.

**Two different kinds of padding**

The old concatenated staged matrix has global unused cells. The operand representation eliminates these cells; the sequence validates and records their eliminated count but does not pretend to authenticate them. Different legal old-stage padding sizes therefore produce the same sequence semantic identity. `global_staged_padding_verified()` is always false.

Each actual membership proof still constrains its phase-0 tail after original values/multiplicities and its phase-1 tail after range/ROM inverses to zero. Both oracle domains, tail equations and complete openings remain present for every transition. Eliminating nonexistent staged cells does not permit nonzero advice in either committed oracle.

**Memory and native implementation scope**

Sequence construction checks bounded steps, action cells, ports, context and descriptor sizes before copying. The descriptor is counted before exact allocation. Resource admission conservatively reserves the core compiler's fixed **1 GiB allocation ceiling**, retained sequence/context/port payload and one component's documented admission. This ceiling is a policy charge, not a claim that each source actually allocates 1 GiB. Before constructing a component, its membership/proof limits are reduced to the remaining sequence budget; joint bounds are checked again before proving/verifying.

These tracked bounds exclude caller-owned stages, witness/proof buffers, allocator effects, opaque native hash scratch and process RSS. Actual process RSS must be measured separately. The module retains the full public action tape and one original source, but not all proofs or all per-transition witnesses. The Street CLI (retired source path `scripts/native/native_membership_history.rs`) reads/writes one bounded component proof at a time and retains only the preceding output vector between transitions. Witness preparation, core compilation, component preparation, commitment/proving and verifying are distinct costs; per-step log timings have narrower scopes than whole-process timings.

The native runner reuses complete frozen cryptographic source modules and **404 retained dependencies**. It does not transform native source modules, run Cargo or rebuild maintained Iroha. The Rust 1.93.1 aarch64 compiler and exact harness/binary/source hashes are retained in each report. This native CPU lane does not establish supported-target or accelerated-path parity.

**Completed independent tests**

The [sequence unit report](../../output/qualification/native-membership-sequence-attempt-1/report.json), SHA-256 `7f6544e6b47c2044db3c8cd5135539ffc08b7372929d1080e7420bde71b34b21`, passes **14 tests: 12 sequence tests and 2 extraction-algebra regressions**. The compiled sequence source is SHA-256 `0575f92e3303c5a32f34640ccb4fdae0713b5172257879dbede50e1b9b442360`; the independent sequence fixture (retired source path `scripts/native/membership_sequence_fixture.rs`) is `81f8f5d272114c54fc52ca8c04aec5e5a30bf1402eae6a5fb3c8c08a66142f1b`.

The fixture is a whole checked circuit with a quadratic action, carried data, done/tick/action ports, duplicate input/output aliases, a constant output and two aliased ROM occurrences. Three genuine component proofs are verified against a separately reconstructed program-only source. Tests retain all source equations/memberships and both oracle tails; check exact source/tape/context/genesis/final binding; reject missing/extra/replayed/reordered steps and malformed/noncanonical/truncated/trailing data; and confirm permanent poisoning.

The strongest continuity test builds a genuinely valid component proof under a coherent alternative predecessor and verifies it independently. The sequence then rejects it because its private predecessor is the output actually authenticated by the preceding proof. This tests the verifier boundary rather than an honest-prover guard alone.

The separate extraction tests use actual native Fp4 arithmetic to show that Base-valued advice chosen after beta can fit an invalid lookup at one nonpole challenge, while the same fixed advice fails at another. They justify preserving commitment-before-challenge ordering; they do not assemble an attack against the current proof or establish an extraction theorem.

**Actual Street qualification**

The completed [Street sequence report](../../output/qualification/native-membership-history-attempt-1/report.json), SHA-256 `7bb445d774ab15bfcfb4830331ae725f6cfe4e04192ac9d0b16cf84f1452312c`, records **six accepted fixture/prove/verify commands and nineteen rejected mutations**. Both rosters execute three complete native transitions from genesis, ending in a numeric technical-win fixture. It retains 24,406 original values per transition for two cars and 340,566 for eight. Fixture generation compares 16,761/305,424 native node values, respectively, and checks the complete raw scalar/range/ROM relation before producing witness files.

| Three-transition native CPU observation | Two cars | Eight cars |
| --- | ---: | ---: |
| Whole proof sequence, bytes | 2,419,436 | 3,577,548 |
| Transition 0 component proof, bytes | 803,676 | 1,190,588 |
| Transition 1 component proof, bytes | 808,268 | 1,189,756 |
| Transition 2 component proof, bytes | 804,572 | 1,191,116 |
| Sequence framing/public-output overhead, bytes | 2,920 | 6,088 |
| Whole prover process | 15.432 s | 152.431 s |
| Prover maximum RSS | 185,024,512 B | 1,574,076,416 B |
| Whole verifier process | 6.765 s | 54.355 s |
| Verifier maximum RSS | 101,662,720 B | 984,940,544 B |
| Separate fixture process | 1.731 s | 25.930 s |
| Public statement, bytes | 1,162 | 2,506 |
| Original witness file, bytes | 588,452 | 8,179,460 |

These are **single observations on a shared host**, not medians, an isolated throughput benchmark, validator cost or accelerated-path results. Whole-process times include launch/exit, compiler construction, component preparation and native proof work. The separate fixture process generates and checks witnesses. The report does not isolate each internal proving kernel or provide a measured allocation breakdown. Process RSS includes the actual source, buffers and allocator effects; it is not the conservative admission charge. In particular, comparing these times with three times an earlier one-tick run does not establish a performance gain. No full-duration cost is extrapolated here.

Each verifier process runs with only the public statement and proof sequence in its working directory, while the original witness path is absent. Its program-only compiler performs zero native witness-node comparisons and generates no witness. All three component proofs authenticate both oracles; the verifier returns `orderedComponentProofsVerified`, `firstTerminalTransitionVerified` and `genesisActionsAndCarryVerified` as true. Every application-history, terminal-adjudication, extraction/security, integer-execution and ledger qualification flag remains false.

Both rosters reject altered context/action statements, reordered steps and overwrite attempts. The two-car lane additionally checks canonical field values, bounded counts, public/proof framing, truncated/trailing input, oversized component proofs, an incorrect first cursor, duplicate steps and an omitted final transition. The independent unit fixture supplies the coherent wrong-predecessor attack; these nineteen CLI commands are additional integration/parser checks, not nineteen new cryptographic theorems. Before recording these measurements, all **34 source pins and 129 retained artifact hashes/sizes** in the final report were rechecked against their files.

**Application history remains a separate boundary**

The numeric forfeit actions in the Street fixture are public laboratory inputs, not consensus decisions. This sequence does not authenticate wallets/input keys, checkpoints, pending certificates, matching reveals, forced-round deadlines, dispute epochs or retained late input tails. The caller must derive and bind those values from a complete authenticated session snapshot. See the [history gap map](../../docs/native-history-gap-map.md).

The [terminal-history policy](../../docs/game-terminal-history.md) also requires removals exactly at terminal boundary T to affect awards without another driving tick, while removals strictly after T only affect retained input-key history. Street's existing transition ignores new forfeits when its prior state is already done, and this sequence deliberately refuses an extra terminal transition. A separately specified no-driving adjudication relation, including tick/batch and possible T=0 semantics, is still needed. This component's receipt therefore makes no terminal-adjudication or accepted-history authority claim. Final XOR/NFT awards and finalized inclusion must be qualified separately.
