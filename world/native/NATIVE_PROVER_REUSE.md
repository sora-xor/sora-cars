**Private compiled-sequence reuse — September 8, 2026**

> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


The accepted-history laboratory prover now retains its validated compiled sequence, removing a second construction of the Street graphs, lowering, operand programs and prepared membership sources. The preceding [membership-cache experiment](NATIVE_MEMBERSHIP_CACHE.md) supplies this experiment's historical reference.

Only the laboratory guarded-history driver (retired source path `scripts/native/native_guarded_history.rs`) and accepted-history driver (retired source path `scripts/native/native_accepted_history.rs`) change. Proof modules, relations, domains, descriptors, encoding and verification functions remain unchanged.

`ah_prove` validates the complete history, derives the public statement, and compiles an owned `CompiledGuardedSequence`. It checks every retained public field: roster, digest, context, both action tapes and final outputs. After dropping graph/lowering buffers, it passes the validated statement and immutable sequence into private `guard_prove_compiled`. The helper never reopens the replaceable statement file.

Before witness/output I/O, the helper rechecks that correspondence, Street dimensions and the zero-motion boundary row. Existing size arithmetic, step/context limits, bounded regular-file reads, canonical fields, exact frame order/dimensions, component admission and proof caps remain enforced. Only motion advances raw state. Witness values are streamed one component at a time and dropped after commitment. Exact EOF precedes create-new output finalization; failures clean up unfinished output and preserve existing files.

Each component still binds fresh ports and proves all scalar, range, ROM and tail obligations. Both complete program identities remain bound, with Motion membership prepared only for `N > 0`. Payload accounting and proof-resource limits are unchanged. Tracked payload bounds exclude some process allocations and must not be equated with RSS.

Four new regression tests are defined alongside the two changed drivers:

- Reject each public-statement mismatch before attempting witness access or output creation.
- Reject malformed witness headers, roles, indices, dimensions, noncanonical fields and truncation; preserve cleanup and existing-file behavior.
- Generate and verify a genuine small boundary proof, compare its exact outer encoding, preserve the validated in-memory statement after file replacement, and reject trailing bytes after a complete component.
- Require the retained accepted-history statement to match roster and every derived public field.

These small circuits exercise transport/reuse behavior. The runner also selects the preceding 90 tests, including the restrictive-budget zero-motion regression; other listed harness tests are not covered.

The reference JSON `prove.seconds` begins inside `guard_prove`, after the first history derivation and compilation. The candidate begins at `ah_prove` entry, including that work. **These inner durations are not comparable.** Compare whole-command times and `/usr/bin/time -l` RSS. Component timers still cover commitment, proving and frame writing after preparation; the remainder includes several unseparated activities.

Both harnesses use identical stderr-only source-hash instrumentation and receipt diagnostics. Counts, bytes and elapsed times are measured. The reference already includes membership caching; this comparison must not count that earlier saving again.

**The complete comparison and retained-evidence audit passed.** All 94 selected tests passed: the preceding 90 plus the four regressions above. The 44 command receipts contain 35 successes and nine expected rejections. All seven candidate proofs match the retained bytes; the two moving cases also match fresh reference proofs. The five accepting cases have identical complete verified receipt fields across both implementations and the baseline. The false checkpoint and false archived outcome retain their exact `Checkpoint` and `Outcome` failures; seven further malformed/public-context cases retain their prior native error lines.

The CLI comparison generated nine fresh proof files containing 69 component proofs, and ran twelve verification commands. Its 21 measured commands all have process-RSS evidence. The unit tests perform additional tiny proof operations, including a completed component whose trailing-input output is then rejected and cleaned up; those operations are separate from the nine CLI files.

| Six-tick workload | Proof bytes | Reference prove s | Candidate prove s | Reference verify s | Candidate verify s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Two cars, technical win | 6,614,713 | 31.296 | 44.953 | 23.454 | 18.976 |
| Eight cars, technical win | 10,832,889 | 247.015 | 236.350 | 83.215 | 83.273 |

These are single paired, instrumented CPU observations on the shared Apple M4 Max host using the retained Rust 1.93.1 compiler and optimization level 3. Eight-car proving reverses the implementation order used for two cars. **Two-car proving regressed in this observation.** Eight-car proving improved, while its verification time was nearly unchanged; the unchanged verifier's two-car timing also varied. No statistical speedup or cause for the timing variation is established.

Proving hashes the complete membership sources four times in the reference and twice in the candidate. For two cars, measured bytes fall from 23,340,628 to 11,670,314 and source-hash time from 0.830078 to 0.414847 seconds. For eight cars, they fall from 336,641,860 to 168,320,930 bytes and from 11.877541 to 5.949291 seconds. Both moving verifiers still hash those sources twice. This confirms removal of duplicate source preparation; it does not shrink the computation or proof.

Peak process RSS in bytes (reference/candidate) was: two-car proving 211,927,040/205,307,904, verification 138,739,712/134,823,936; eight-car proving 1,654,505,472/1,649,426,432, verification 1,054,588,928/1,053,556,736. These single observations do not establish a general memory reduction.

The three accepting zero-motion candidate proofs each hash only the boundary membership source once: two-car archived sole win 1.097446 seconds and 69,058,560 bytes peak RSS; eight-car genesis sole win 12.057668 seconds and 633,552,896 bytes; eight-car genesis refund 11.894879 seconds and 633,438,208 bytes. There is no fresh reference proving measurement for these cases. Their candidate proofs still match retained bytes, and paired verifier receipts match. The separate negative archived case also hashes the boundary once but is not counted as accepted verification.

For the inner-timer distinction above, the eight-car reference reports 230.381886 seconds and the candidate 236.323258 seconds, while the comparable whole commands are 247.015492 and 236.350030 seconds. The apparent ordering changes because the inner starting points differ. Neither source-hash time nor the unseparated remainder is a measurement of all compilation work.

The runner (retired source path `scripts/test-native-prover-reuse.py`) pins the preceding report at SHA-256 `84d52162e0892dfae56aa1a47b00a40bf45e03a4f2c5c9b225347c24c248aef4`, preserves the reference sources and original public inputs, and uses its coherent retained compiler/dependency family. The completed [report](../../output/qualification/native-prover-reuse-attempt-1/report.json) has SHA-256 `7a5d8d7fdbf452dd8d96e4dfe84f82cd2f5d24d389a6ddd264aaf4bbfd5ebdcd`. It retains 439 artifacts totaling 411,638,284 bytes, 59 inherited source identities (57 unchanged and two driver changes) and nine unchanged native source snapshots. The 464-node/2,421-file dependency family was checked before and after. Standalone reference, candidate and test harness builds ran; no Cargo or dependency build ran.

The changed guarded driver is pinned at `5ee8f141b2d24ef915cdb1559487b200822ab2bd128fdf16ecba685e9bda3424`; the accepted-history driver at `a50f858c55525e780b73bd95f85e712050e52129ca07c1c4920944eb3d922633`. Runner SHA-256 is `8a06bda205ed137fadd4837c5b083ee3f72f2ee8f1368a438b4939d1b1c7ccc3`. Reference/candidate binary hashes are `3ba672bf3a5919a4f582880c800841cdb2517708b01e2ad4af69c70f07d1b1b7` and `27ee91fdc9f263ee226365198f81cb6e803a03fdab06773946709c34878b384f`; the report retains the compiler, test binary and full harness identities.

The separate audit (retired source path `scripts/audit-native-prover-reuse.py`), SHA-256 `b7e8f377b14d754b1991b2e26a4d14cae37045e16397041af35b29fd6546b16a`, completed with [report](../../output/qualification/native-prover-reuse-audit-attempt-1/report.json) SHA-256 `34c35073a9a3acd320dea0438c182e72e8cf6bbd7821c59dacd1b1c2ceea0f63`. It checks artifacts, source/harness transformations, unchanged verifier functions, actual test/command receipts, hash observations and RSS, complete outer framing, byte/receipt parity and all nine errors. It executes no native command and does not rehash the dependency family. This is evidence consistency auditing; manual source review also covers the semantic ownership change.

With the recorded source/compiler/dependency identities present at their recorded absolute paths, reproduce in a fresh lane:

Recorded retired invocation:

```text
python3 scripts/test-native-prover-reuse.py --lane native-prover-reuse-attempt-2
```

Recheck the retained attempt in a fresh audit directory, with its explicit report pin:

Recorded retired invocation:

```text
python3 scripts/audit-native-prover-reuse.py --lane native-prover-reuse-attempt-1 \
  --output native-prover-reuse-audit-attempt-2 \
  --report-sha256 7a5d8d7fdbf452dd8d96e4dfe84f82cd2f5d24d389a6ddd264aaf4bbfd5ebdcd
```

Historical reports and their source snapshots remain immutable. Running an old comparison against today's changed driver files is not reproduction of that old source state. This runner accepts a new attempt directory and refuses to overwrite an existing one.

The moving cases cover six low-speed ticks, or 0.2 simulated seconds, followed by a removal and technical win. The finality fixtures retain synthetic merge execution with genuine native global BLS signatures; this experiment does not execute the native delta producer. It establishes no statistical speedup, full-race performance, validator budget, composed 128-bit security, accelerated-target parity, consensus settlement or live XOR/NFT authorization.
