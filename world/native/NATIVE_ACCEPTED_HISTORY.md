# Native accepted-history laboratory

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


8 September 2026. This component connects the complete retained native game record to the [guarded boundary/motion proof](NATIVE_GUARDED_HISTORY.md). The protocol interface is generic; Street supplies compiled control, state and outcome semantics. There are no race-specific ISIs in this laboratory.

The evidence below records the earlier unfinalized laboratory version. The
subsequent [origin-bound implementation](NATIVE_FINALIZED_HISTORY.md) requires
`state_origin`, uses `lab-v3`/`IWAHCTX3`, regenerates signed checkpoint prefixes
and proofs, and connects the computation to a sealed certified-batch record.
Historical report directories retain their original sources and formats;
their proof bytes are not accepted through a compatibility fallback.

**The bounded laboratory run passed:** nineteen native tests, 22 accepted CLI commands and 38 expected rejections across eight Street cases. These cover complete-history checks and genuine-proof integration; custody identity gaps and native lifecycle differences remain documented below. This is not a deployment, full-duration or 128-bit security claim.

## Exact history and application binding

[accepted_history.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/accepted_history.rs) validates a complete `GameSessionRecordV1` with a supplied block hash/height, full accepted transcript and current commitment/reveal envelopes. Its snapshot identity commits every canonical record field, including immutable admission/equipment facts, economics, liabilities, phase, revision, deadline, checkpoint, pending certificate, forced inputs, removals, resources and any archived outcome. A separate evidence identity binds the full transcript and exact sidecar envelopes. The old native dispute projection is checked for consistency; it is not the complete history commitment.

Validation checks native admission identities, bounded cardinalities and encodings, original-roster checkpoint and pending-certificate signatures, signed individual commitments and matching salt-bearing reveals. Current ledger reveal payloads alone do not retain the salt needed to recompute their commitment; the public evidence carries the full reveal envelope. When a retained pending certificate supplies all commitment signatures, redundant individual envelopes are excluded. Removed original slots still sign joint certificates, and their certified pending commitments may remain present while they have no reveal authority.

The validator preserves the exact forced-phase shapes, including automatic progress when all live controls arrive. A snapshot can legitimately be past its deadline before consensus advances it. No local clock or `height > deadline` comparison is treated as a removal decision. Archived settled records may retain a forced-input frontier; validation preserves that state rather than requiring an empty frontier.

The new prefix commitment binds the explicit logical tick and every byte of the complete partly consumed batch. It includes removal events strictly before that tick, so a checkpoint commits the raw state before removals at the same boundary. The remaining accepted suffix is canonically validated and retained even after an early finish. The computation accessor exposes controls only for ticks below the selected terminal, and removal sets only through that terminal boundary. There is no batch-alignment requirement on the terminal itself and no old-prefix fallback.

[accepted_guarded.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/accepted_guarded.rs) composes this receipt with the genuine ordered execution verifier. It derives every action word from the accepted batch and fixed decoder, and every boundary removal from the validated history. Missing controls cannot silently become neutral inputs. Zero words represent only slots already removed according to that selected history.

The compiler-owned relation identity must commit both complete source descriptors, ordered input maps, carry indices, exact genesis, cursor/halt/max-step policy and fixed codec semantics. The bridge compares the actual sequence identity with the selected profile and checks the compiled genesis-state commitment. The runtime action tape, outcome and history context are separately bound by the sequence statement. Resource admission ceilings are implementation limits, not application protocol identity.

## Checkpoints and archived awards

The bridge retains a private raw-state copy, initially exact genesis. Only a successfully verified motion updates it. When the next boundary equals the selected checkpoint tick, it compares the raw cursor, halt flag and canonical state root before verifying that boundary. An adjusted boundary output is never installed as the raw checkpoint state. Any failed check permanently poisons that verifier instance.

After genuine sequence completion, the compiled application projects a typed `GameOutcomeV1` from the final boundary outputs. For Street, it contains the terminal tick, ordered winner slots and a canonical versioned encoding of every final boundary field. For an archived record, the entire projected outcome must equal `session.result`, including opaque bytes. Hashing an incorrect recorded winner into proof context cannot make that winner true. Later retained removals do not rewrite the proved award.

The outcome is computational evidence. It does not establish a transfer, payment, protected reserve balance or finalized ledger inclusion. Those facts require native consensus execution and authenticated ledger evidence.

## Native CLI and file boundary

The CLI (retired source path `scripts/native/native_accepted_history.rs`) has three commands:

```text
native_accepted_history fixture <2|8> <case> <new-dir>
native_accepted_history prove <dir> <proof-path>
native_accepted_history verify <public-dir> <proof-path> <expected-snapshot-hex>
```

Fixtures include zero-motion sole/all-forfeit closure, six-motion closure, a jointly signed false checkpoint, and correct/incorrect archived result payloads. Only fixture generation evaluates native driving nodes and produces a witness. The prover reads that witness and public history. The verifier receives these public files:

| File | Contents |
| --- | --- |
| `session.nrt` | Complete canonical native session record. |
| `evidence.nrt` | Accepted transcript and complete current reveal/commitment envelopes. |
| `selection.nrt` | Claimed block hash/height, snapshot identity, terminal tick and final boundary claim. |
| Proof file | Exact ordered native boundary/motion proofs and outputs. |

The verifier has no witness argument and does not read the prover's `statement.bin`. It reconstructs the statement from the public history and compiled sources. The externally supplied expected snapshot is compared independently with the retained selection identity. A caller-provided pin is still unauthenticated until it comes from consensus or finalized inclusion verification.

Typed files have an 8 MiB cap, native nested decode limits and exact canonical re-encoding checks. The decoder's temporary input copy is additional bounded memory. Proof framing inherits the bounded, canonical, exact-EOF guarded format. Output creation is exclusive. The full replay remains public and does not require a replay server or a custody key.

## Evidence and remaining integration

The runner (retired source path `scripts/test-native-accepted-history.py`) retains whole unchanged native proof sources and one complete cached dependency family, including native model, crypto, Norito and numeric types. It does not build dependencies or modify maintained Iroha. The [compatibility probe](../../output/qualification/native-accepted-history-family-probe-3/report.json) verified an unchanged earlier proof under that coherent family; it does not validate the new history code.

The independent structural fixtures (retired source path `scripts/native/accepted_history_fixture.rs`) cover real signatures/reveals, complete suffixes, native phases, marker bijections and full snapshot-field identity. Independent bridge regressions exercise fresh genuine proofs with changed compiled relations and wrong archived outcomes. The [static review](../../docs/native-accepted-history-review.md) retains the initial findings and their original source identities.

The [combined test report](../../output/qualification/native-accepted-history-combined-attempt-1/report.json), SHA-256 `814c8e2ab3037ce9a89c5a3fc7c6f830366ec8be77b2bc87b6095f1d07bfe51a`, records successful CLI/test compilation and all 19 tests. Both review findings are exercised with genuine proofs of the alternate or inconsistent statement, not merely corrupt proof bytes. The bridge accepts exact archived ties and a winner removed only after the selected terminal. The standalone binary is `17ae4fc5952d94bcdd8528355a07684cfe5c3afe72c6419200a540b1c330f281`; the subsequent CLI exercise reuses it without recompilation. Test execution does not authenticate the laboratory's supplied block context or removal decisions.

The completed [CLI report](../../output/qualification/native-accepted-history-attempt-2/report.json), SHA-256 `210390b215885c0fb516099fdcd99738748e7fd361146b5038d43f223f783715`, reuses those nineteen tests and the exact binary, with zero new native or dependency builds. Its eight cases contain 32 genuine component proofs: zero-motion sole/refund outcomes at two/eight cars, six-motion sole closure and a signed false checkpoint at two cars, and correct/incorrect archived outcomes. All fixture and proving commands succeed. Six independent verifications accept; the false checkpoint rejects with `Checkpoint`, and the coherently wrong archived result rejects with `Outcome`. The other 36 rejected commands comprise 24 binding/framing/exclusive-output checks and twelve typed-file checks covering trailing bytes, truncation, files over 8 MiB and nonregular inputs.

| Accepted workload | Proof bytes | Whole prover / verifier time | Prover / verifier peak RSS bytes |
| --- | ---: | ---: | ---: |
| Two cars, six motion ticks | 6,633,673 | 33.155 s / 16.199 s | 201,900,032 / 119,324,672 |
| Eight cars, zero-motion sole win | 531,533 | 17.995 s / 15.882 s | 652,460,032 / 624,181,248 |
| Eight cars, zero-motion refund | 527,949 | 18.215 s / 16.066 s | 655,818,752 / 625,328,128 |

These are single shared-host arm64 CPU observations, including runtime source/descriptor construction and process overhead. They are not medians, pure polynomial-commitment timings or full-duration estimates. Separate verifier directories contain exactly the three public Norito files and proof; the original witness path is absent. An independent post-run check rehashed all 349 report artifacts (97,705,960 bytes), all 45 current source identities and the binary, and matched each command's retained stdout/exit status to the report. Attempt 1 remains retained: its negative test initially changed the native hash's required low bit and reached canonical parsing rather than the intended pin mismatch. Attempt 2 corrects that test construction; no native source fix or rebuild was needed.

Ledger authority, legal deadline transitions, wallet authorization of gameplay keys, finality, reserve protection and actual payouts remain separate integration requirements. A finalized record after settlement also has a different revision and outcome from the pre-settlement selection; verification must connect the selected prestate to the finalized transition instead of pretending their snapshot hashes are equal. The new intrabatch prefix domain must be adopted explicitly by the generic lifecycle before this profile can run there.

A subsequent read-only native comparison also identified two unresolved record/lifecycle requirements. This laboratory bounds and commits stake, wager and equipment custody identities but does not yet recompute all their native domain-separated derivations and reject aliases with participant wallets or other custodians. A supplied, self-consistent snapshot can therefore contain custody metadata that native restoration would reject. This limits the structural-validation claim even before ledger authentication. Separately, maintained native checkpoint admission permits a nonterminal certificate at the maximum tick; later deadline advancement can enter forced rounds beyond the cap. The bounded history validator rejects that path. The first release must seal the cap consistently and prevent further motion instead of relaxing the computation bound. Neither finding establishes a deployed custody exploit; no maintained Iroha change was made during this laboratory run.

The inherited base-field extraction and full integer-execution premises, composed Fiat–Shamir/hash/proximity error budget, 128-bit security review, full-duration performance, supported targets and accelerator parity remain unqualified. The September research recheck adds a precise composition obligation: Theorem 7.1 of [the functional-commitment Fiat–Shamir paper](https://eprint.iacr.org/2025/902) charges query-class tail errors and enlarged reduction/extractor budgets alongside state-restoration soundness and function binding. Its interactive-argument theorem and the subsequent Fiat–Shamir reduction must be instantiated for this actual protocol; a sum of previously quoted component errors is insufficient. This is a linear component-proof laboratory, not succinct accumulation. Live XOR/NFT settlement remains disabled.
