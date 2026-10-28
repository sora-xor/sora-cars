**Native equality expansion in complete execution proofs — September 8, 2026**

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


**Seven proof comparisons passed, alongside exact accepted-receipt parity, 67 selected regression tests and nine expected rejections.** This continuation applies the one-product expansion from the [native kernel experiment](NATIVE_EQUALITY_EXPANSION.md) to the two equality tables used by the finalized-history laboratory: [membership proof weights](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/phased_membership_proof.rs) and [dynamic WHIR linear queries](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_dynamic_linear.rs). It is an exact arithmetic optimization, with no new proof format, relation, challenge schedule or security parameters. The roughly 2× kernel improvement does not establish a whole-prover speedup.

For every canonical native Fp4 pair `v,r`, `v*(1-r) = v-v*r`. The new loop computes `right=v*r`, writes `v-right` into the existing left slot and appends `right`. For a table of N coefficients this replaces `2(N−1)` multiplications with `N−1`, retaining the same allocation and least-significant-bit order. Dimension limits remain 24 for membership and 20 for dynamic linear queries; canonical checks and existing payload admission remain in place. The split-table experiment is not integrated: these loops add no scratch table.

The comparison runner (retired source path `scripts/test-native-equality-proof.py`) freezes current source and the original two helpers separately, using the retained finalized-history compiler and coherent dependency family. Both standalone binaries have the same observation-only harness addition: after successful finalized attachment, print the real verified receipt's transcript and final values. The original CLI source remains frozen and unchanged. The diagnostic does not bypass verification or require witness data.

Two- and eight-car motion cases each contain six throttle ticks, followed by a recorded removal of the other racers at the six-tick input boundary and a technical win for slot zero. Each contains 13 boundary/motion components. The eight-car input bundle is generated and bound once with the reference implementation and previously qualified fixture exporter. Both implementations then prove exactly the same bound input. Six ticks are 0.2 simulated seconds, with low-speed straight-line motion; they do not test the complete racing experience or establish 180-second feasibility.

The six retained cases additionally include a false checkpoint, an incorrect archived outcome, an archived sole win, and eight-car genesis sole/refund closures. Complete candidate proof bytes are compared with the retained proofs. Fresh paired proving is limited to the two motion cases. Each accepted, byte-identical proof is publicly verified by both binaries, comparing sequence, transcript, final outputs, raw state, origin, snapshot, association and winners. Because the proofs are byte-identical, repeating both verifiers on the second filename would execute identical input again. Public input directories omit witness/statement files and take a separate trust argument; OS file access is not sandboxed.

Timing includes the whole command: relation/history construction, proving or verification, finalized-record authentication where applicable, and diagnostic output. Each implementation/case has one observation on a shared host. The two motion pairs use opposite proving order. These measurements cannot establish a statistically reliable speedup. Per-component internal timings are retained separately in stderr and must not be substituted for whole-process cost.

The execution and merge records are synthetic fixtures with genuine local native global BLS certificates. This experiment does not run the actual native delta producer, execute consensus settlement, test acceleration or qualify composed 128-bit security. Generic Iroha game/execution facilities remain the intended platform; no race-specific ISI or live stake activation is introduced.

The complete native command run and independent retained-evidence audit passed. Nine fresh proof files contain 69 genuine component proofs: seven candidate files and two fresh reference files. All six candidate files with historical counterparts are byte-identical to those retained proofs; both fresh motion pairs also match byte-for-byte. All five accepting cases match every diagnostic/finalized-receipt field between implementations, excluding elapsed time. The false checkpoint rejects `Checkpoint` after verifying the first twelve components, before accepting the final boundary component. The archived result mismatch rejects `Outcome` at completion after verifying its component; that fixture changes an opaque result field while retaining winner slot zero. Seven additional public-file mutations retain exactly the original native errors: altered delta, foreign session, unbound origin, obsolete five-field selection, damaged proof header, absent replay and foreign trust.

| Six-tick workload | Proof bytes | Reference prove s | Candidate prove s | Reference verify s | Candidate verify s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Two cars, technical win | 6,614,713 | 33.276 | 33.147 | 17.583 | 21.064 |
| Eight cars, technical win | 10,832,889 | 275.818 | 271.278 | 116.832 | 114.214 |

Peak whole-process RSS in MiB (reference/candidate): two-car proving 200.422/198.969, verification 133.469/132.922; eight-car proving 1,607.531/1,589.156, verification 1,003.125/1,002.656. These are CPU runs on the same shared Apple M4 Max host with retained Rust 1.93.1, optimization level 3 and no target CPU override. The whole prover may use its native parallel routines; the earlier equality microbenchmark was single-threaded. The slower candidate two-car verification observation illustrates why a single pair cannot establish either a speedup or performance parity. No best sample was selected.

The other five candidate proofs are 6,591,721 bytes for the false moving checkpoint, 253,597 for the archived sole win, 252,685 for the incorrect archived outcome, 531,693 for eight-car genesis sole, and 537,981 for eight-car genesis refund. These five additional cases have retained reference proofs; their fresh candidate command measurements are in the report. The proof bytes and transcripts preserve the same computation: boundary car-zero positions are −1, 27, 83, 167, 279, 418 and 585 mm in both moving cases. This verifies motion, not a high-speed collision scenario.

The paired observations give no substantial practical scaling gain. Keep the no-scratch one-product simplification in the two exercised helpers, leave the split method experimental, and prioritize complete-history accumulation and authenticated lookup cost comparisons. The unchanged helper in `whir_street_arithmetic.rs` is outside this harness and was not modified or qualified here. Do not extrapolate the short fixture linearly to a full race or claim full-duration feasibility.

Historical reproduction requires the source snapshot recorded by this experiment. The subsequent [prepared-source work](NATIVE_MEMBERSHIP_CACHE.md) changes two additional modules; this runner deliberately rejects that drift. A new lane alone is therefore insufficient in the current checkout. Its 59 source files must match the retained `source/` snapshot at the recorded checkout paths, with the exact compiler/dependency paths available. The frozen compile commands contain absolute paths; simply moving the experiment to another directory is insufficient. With those historical prerequisites satisfied, choose a new immutable lane:

Recorded retired invocation:

```text
python3 scripts/test-native-equality-proof.py --lane native-equality-proof-attempt-2
```

The runner checks the retained 464-node/2,421-file dependency family before and after; it performs no Cargo or dependency build. It freezes all 59 inherited source inputs (57 unchanged, two exact arithmetic edits), nine unchanged native source snapshots, the runner and compilation support. Reference, candidate and test builds passed, retaining ordinary unused-code warnings; this was not a warnings-as-errors gate. All 65 selected prior regression tests and two dynamic equality tests passed. Other listed harness tests were not run. The fresh eight-car carrier exporter additionally ran its one explicit test.

The [comparison report](../../output/qualification/native-equality-proof-attempt-1/report.json), SHA-256 `89f143ababcb40849df6e4441dddaf9f67b26f170dacd592118258b1080a7c71`, retains 423 artifacts totaling 401,994,192 bytes, 42 command receipts (33 success, nine expected rejection), both binaries, all proof bytes, source identities and measurements. Reference binary SHA-256 is `795f166dc82a3569f870fe840543693649d4663f87507eac3e155567194a9b04`; candidate is `20c1a183b82dccbadbf9fffe6d67f5bbfcf9db797b9114bcb00aeb0a151785c3`. All native processes completed.

The separate audit script (retired source path `scripts/audit-native-equality-proof.py`) checks the exact allowed whole-file transformations, identical observation-only harnesses, complete artifact inventory, actual test/command output, all proof framing through exact EOF, output/receipt parity, positive RSS for all 22 measured commands, and exact rejection errors against the old evidence. It performs no native execution or repeated cryptographic verification. A review caught and fixed a shadowed variable in its progress-report formatting before this audit ran; the final audit retains numeric positions. No proof or verifier change was needed.

The [audit report](../../output/qualification/native-equality-proof-audit-attempt-1/report.json), SHA-256 `c05e80ffe8b40ac6d256402e2297af559d33eeff21bb992e4ba25d87edb62c96`, passed all checks against the pinned comparison report. It references the runner's before/after complete dependency checks without repeating that expensive operation. This audit also checks current source identities, so repeating it requires the same historical source snapshot described above, as well as a fresh output name:

Recorded retired invocation:

```text
python3 scripts/audit-native-equality-proof.py --lane native-equality-proof-attempt-1 \
  --output native-equality-proof-audit-attempt-2 \
  --report-sha256 89f143ababcb40849df6e4441dddaf9f67b26f170dacd592118258b1080a7c71
```
