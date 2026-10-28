# Native custody identity and terminal-cap qualification

> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


September 8, 2026. This extends the [accepted-history laboratory](NATIVE_ACCEPTED_HISTORY.md) with exact native custody identities and a consistent terminal checkpoint limit. Thirty native tests, 22 accepted CLI commands and 38 expected rejections pass. The preceding report and source snapshots remain unchanged.

Those counts and byte-identical proofs describe the retained version below.
The subsequent [finalized-history qualification](NATIVE_FINALIZED_HISTORY.md)
keeps the custody/cap checks and moves current source to mandatory explicit
state origins and `IWAHCTX3`. Its records, signatures and proofs are regenerated;
no older-format acceptance is inferred from these historical reports.

## Custody identities

The validator reconstructs the stake custodian using the native `iroha:game:custody:v1` domain and the network, session and canonical asset identity. Wager NFTs and returnable equipment use the native `iroha:nft:custody:v1` domain with the network, session, Norito-encoded purpose and NFT identity. `GameWager` and `GameResource` are separate native enum purposes. All derivations call Iroha's length-framed non-signing public-point primitive; seeded key generation is not substituted.

Exact derivation checks precede the account-alias check. Every original wallet remains excluded from every custodian, including wallets of forfeited players and archived sessions. Custodians must also differ from each other. The resource/wager ownership, recipient and release-geometry checks remain in force. A supplied record with refreshed hashes still fails if its custody identity is wrong.

These are pure record checks. They do not establish account existence, asset balances, NFT ownership, reserve protection, ledger reservation indexes or finality. The public laboratory continues to consume a caller-selected snapshot pin. Native ledger selection and finalized transition verification remain required.

## Terminal checkpoint limit

A nonterminal checkpoint must be strictly before the configured maximum tick. A pending input certificate must also start before that maximum. This prevents a record from claiming another input round at the end of the simulation.

An older nonterminal checkpoint may still have a complete forced-input tail ending exactly at the maximum. Such a record seals into proof settlement without requiring a newly signed terminal checkpoint. Terminal certificates at the maximum and their fixed checkpoint-selection deadlines remain valid. The validator never invents a terminal signature or moves removals to the final boundary.

The maintained Iroha lifecycle still needs matching first-release admission checks before any commitment, reveal or deadline path can advance a forced batch: aligned start below the cap, checked end no greater than the cap, sufficient live participants and a nonterminal checkpoint. Its current source permits a nonterminal cap certificate and can advance beyond the cap. The laboratory retains its bounded semantics; no compatibility path accepts that state.

## Evidence and rollout

The [native test report](../../output/qualification/native-accepted-history-custody-tests-attempt-1/report.json), SHA-256 `a4a58d6398ce38212963c80c6f68b83407e73b3fb41e78ea1f9699dd9c736315`, records successful CLI/test compilation and thirty passing tests: sixteen history/custody tests, six cap tests and the eight unchanged genuine-proof bridge tests. The binary is `5de6acf9c1fda86465ed61767321f0638e014df174768adb122ed6408519d1e1`. Builds use the same complete retained native model/crypto/Norito dependency family, without a dependency build.

The custody fixtures (retired source path `scripts/native/accepted_history_fixture.rs`) independently construct the native derivations and exercise 98 exact-error substitutions, role swaps, duplicates and wallet aliases. Correct active/archived mixed wager/equipment records pass, including a changed stake asset that deliberately leaves NFT custodians unchanged. A funded fixture uses three stakes of six units, with independently specified awards of eighteen to a sole winner, nine each for a two-way tie and six each for refunds. Full and partially paid claim records pass; three refreshed off-by-one remaining liabilities reject. These are record-level quantity checks, not evidence of wallet deposits or transfers.

The cap fixtures (retired source path `scripts/native/accepted_history_cap_fixture.rs`) independently construct genuine checkpoint/pending signatures. They reject nonterminal cap certificates across selection, proof and archived phases, including pending input sets, while accepting terminal cap certificates before/at/after their fixed deadline. Older checkpoints with a final forced batch ending at the cap remain valid with or without removals at that batch's start. Unsigned genesis with a complete forced tail is covered. Forced progress beyond the cap and a removal moved to the cap are rejected.

The completed [CLI report](../../output/qualification/native-accepted-history-custody-attempt-1/report.json), SHA-256 `8dc26e7fba3d2936132b59d67b4a069224aa468ac059433ec6400c67ee4a2a97`, reuses the tested binary without another native or dependency build. Eight cases generate 32 genuine boundary/motion proofs. Its 22 accepted commands include all fixture/prover commands and six independent verifications. The 38 expected rejections include the genuinely signed false checkpoint, coherently incorrect archived outcome, twelve typed-file boundary cases and 24 framing/binding/exclusive-output checks. The witness path is absent during verification; each isolated directory contains only session, evidence, selection and proof files.

All eight new proof files are byte-identical to their counterparts in the preceding report, including proofs subsequently rejected for a wrong checkpoint or outcome. The new record checks preserve the compiled proof transcript for these fixtures; this is no backward-format fallback. An [independent audit](../../output/qualification/native-accepted-history-custody-audit.json), SHA-256 `d1627bebdc94d2f9410f70dca38987556c45ac170e17780d95edbb074f7d7afe`, rehashed all 350 report artifacts (97,793,260 bytes), 46 current/frozen source pairs and nine native source snapshots, matched command stdout/exit status, independently decoded every component frame and checked all eight public-only directories and exact prior-proof equality. An additional independent test-report review checked the compiler, harness, binaries, direct libraries, ancestors and all thirty actual test names.

| Accepted workload | Proof bytes | Whole prover / verifier time | Prover / verifier peak RSS bytes |
| --- | ---: | ---: | ---: |
| Two cars, six motion ticks | 6,633,673 | 42.185 s / 16.213 s | 208,257,024 / 123,191,296 |
| Eight cars, zero-motion sole win | 531,533 | 17.992 s / 15.867 s | 656,048,128 / 625,950,720 |
| Eight cars, zero-motion refund | 527,949 | 17.867 s / 16.012 s | 660,127,744 / 626,491,392 |

These are single shared-host arm64 CPU observations including runtime source/descriptor construction and process overhead. No speedup or regression is inferred from comparison with earlier runs. Full-duration performance remains unqualified. No maintained Iroha source, index, HEAD, Cargo dependency or deployment changes are part of this laboratory increment.

The maintained rollout must share the pure custody helpers below the stateful ISI layer, reuse them in admission/restoration/history validation and enforce the cap before mutation. Complete integer extraction, composed 128-bit security, practical full-duration accumulation, ledger inclusion and atomic consensus settlement remain unqualified. Live XOR/NFT settlement stays disabled.
