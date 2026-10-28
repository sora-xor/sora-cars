**Prepared native membership sources — September 8, 2026**

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


This experiment separates immutable circuit preparation from the public values bound to each execution component. It builds on the [complete equality-proof comparison](NATIVE_EQUALITY_PROOF.md). It changes the native laboratory implementation of [membership relations](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/membership_relation.rs) and [guarded sequences](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/guarded_sequence.rs), without changing a hash domain, descriptor grammar, proof format or admitted security parameter.

Let `S` be the complete compiled operand program, `D(S)` its canonical descriptor, and `x,y` the exact public input and output ports of one component. The source-dependent work computes `H_source(D(S))`, validates all original equations and range/ROM occurrences, and constructs the ordered namespace maps. The component descriptor still contains the source digest, the exact byte length of `D(S)`, the complete census, fresh `x,y`, and the same namespace occurrence encoding. Reusing the preparation therefore removes repeated computation of identical data; it does not replace a commitment with a caller's asserted digest.

`PreparedMembershipSource` owns `S` and private validated metadata. It exposes only an immutable source reference and a binding operation. A bound relation borrows the namespace maps and owns its fresh ports and descriptor. Moving the owner cannot attach the metadata to a different source. Changing even an unused ROM row changes the complete source commitment. Challenge-dependent inverses, multiplicities, equations, witness commitments and proof verification remain component-specific.

Every binding rechecks all ten caller-selected resource caps against the validated dimensions. A more permissive preparation budget cannot override a later restrictive caller. Memory admission counts the complete shared metadata inside a component's budget. If the sequence's retained bound is `R`, the selected prepared metadata is `T`, and the admitted component payload is `O` (including `T`), the aggregate check is `R − T + O`. The inactive source's metadata remains charged. These tracked payload allowances exclude allocator overhead, opaque native scratch and caller-owned buffers; they are not estimates of process RSS.

The sequence continues to own and commit to both complete source programs. Boundary preparation is always necessary. Motion preparation is necessary only when at least one motion component exists; a zero-motion closure retains the motion source identity without allocating unused membership metadata or subjecting it to unused membership-specific limits. The accepted-history CLI in this comparison still constructs a sequence twice during proving. This experiment does not remove that separate overhead.

For one sequence with `N > 0` driving ticks, repeated membership-source hashing costs `(N+1)·h_boundary + N·h_motion`; preparation reduces that part to `h_boundary + h_motion`. It leaves the separate guarded-sequence hashes, per-component descriptor hashes and all cryptographic proving work intact. Whole-command measurements also include repeated CLI construction, so the formula alone does not predict their speedup.

The comparison uses the same seven public/history fixtures and retained proof bytes as the preceding experiment. The two moving cases each have six low-speed throttle ticks, then a recorded removal and technical win. Six ticks represent 0.2 simulated seconds. They are useful for exact complete-proof comparison, but do not qualify a full race, high-speed collisions or practical full-duration proving.

Both harnesses receive identical timing instrumentation around the existing membership-domain source-hash helper. Original uninstrumented sources are retained separately. Timers observe the original result and emit diagnostics to stderr; they do not enter a commitment or transcript. Counts and byte totals are measured, not inferred from the intended optimization. The existing post-verification receipt diagnostic remains identical between implementations.

The finalized records contain synthetic merge execution with genuine local native global BLS signatures. This work does not establish actual native producer interoperability, consensus settlement, 128-bit composed security, accelerated-path parity or live XOR/NFT activation. Generic execution/game facilities remain the intended Iroha interface.

**The complete comparison and retained-evidence audit passed.** All 90 selected tests passed: 67 from the preceding comparison, six existing membership tests, twelve existing guarded-sequence tests, four new prepared-source tests and one new zero-motion regression. The new tests cover complete equation/descriptor/phase parity, fresh public ports, all ten restrictive limits, ownership after moves, an altered unused ROM row, and a real boundary proof under a budget too small for the unused motion source. Other listed harness tests were not run.

All seven candidate proof files are byte-identical to the retained baseline. Fresh reference/candidate proving also matches for both moving cases. The five accepting cases match complete verified receipts across implementations and against the baseline. The false checkpoint rejects before accepting B6, after twelve verified components; the false archived outcome rejects at completion after its component. Seven further malformed/public-context cases retain exactly their prior native errors. Nine fresh files contain 69 component proofs; the regression tests perform additional native proof operations separately.

| Six-tick workload | Proof bytes | Reference prove s | Candidate prove s | Reference verify s | Candidate verify s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Two cars, technical win | 6,614,713 | 32.729 | 31.125 | 16.111 | 13.929 |
| Eight cars, technical win | 10,832,889 | 279.786 | 253.246 | 113.314 | 83.605 |

These are single paired, instrumented CPU observations on the shared Apple M4 Max host, using the retained Rust 1.93.1 compiler and optimization level 3. They include whole-command construction, I/O and finalized authentication where applicable. Eight-car proving uses the opposite implementation order from two-car proving. No best sample was selected; this is not a statistical speedup claim or validator-cost qualification.

| Eight-car membership-source hashing | Calls | Descriptor bytes processed | Hash seconds |
| --- | ---: | ---: | ---: |
| Reference proving | 13 | 1,014,881,017 | 38.016 |
| Candidate proving | 4 | 336,641,860 | 11.886 |
| Reference verification | 13 | 1,014,881,017 | 35.626 |
| Candidate verification | 2 | 168,320,930 | 5.917 |

The immutable eight-car motion descriptor is 163,365,493 bytes; its boundary counterpart is 4,955,437 bytes. The counts demonstrate the intended reduction in repeated work. They do not show a smaller circuit or proof. Peak whole-process RSS in bytes (reference/candidate): two-car proving 209,534,976/213,041,152, verification 138,477,568/138,166,272; eight-car proving 1,686,175,744/1,669,038,080, verification 1,048,903,680/1,054,474,240. These mixed observations do not establish a memory reduction.

Zero-motion verifier measurements remain explicit:

| Closure | Candidate prove s | Reference verify s | Candidate verify s |
| --- | ---: | ---: | ---: |
| Two-car archived sole win | 1.469 | 1.567 | 1.573 |
| Eight-car genesis sole win | 18.050 | 15.939 | 15.962 |
| Eight-car genesis refund | 18.016 | 15.929 | 15.965 |

Each zero-motion verifier hashes only the boundary membership source once. Candidate proving hashes it twice because of the existing CLI double construction. There is no fresh reference proving measurement for these closures; only candidate proofs and paired verification are run. All candidate proofs still match the retained reference bytes. The negative-case measurements are retained in the report rather than presented as successful verification timings.

In the eight-car candidate, thirteen commit/prove/frame-write intervals total 222.987852 seconds, within the 236.234017-second `guard_prove` interval and 253.245511-second whole command. The duplicate second source-hash pair accounts for 5.945427 seconds. Another 7.300739 seconds inside `guard_prove` covers several unseparated activities; it cannot all be attributed to compilation. The follow-up identified here passes the already validated owned sequence from `ah_prove` to a private proof-writing helper, retaining exact statement/roster checks, resource admission, canonical inputs, EOF checks and create-new output behavior. Its speedup was not measured in this comparison; see the subsequent [reuse experiment](NATIVE_PROVER_REUSE.md). Accumulation, authenticated lookup costs and full-duration qualification remain the larger research priorities.

The comparison runner (retired source path `scripts/test-native-membership-cache.py`) freezes 59 inherited source inputs (57 unchanged and these two edits), nine unchanged native source snapshots, harness support and the exact retained dependency family. The complete 464-node/2,421-file family is checked before and after execution; no Cargo or dependency build runs. The reference, candidate and test builds passed with ordinary unused-code warnings, not a warnings-as-errors gate. The tracked execution session completed with exit 0.

The [comparison report](../../output/qualification/native-membership-cache-attempt-1/report.json), SHA-256 `84d52162e0892dfae56aa1a47b00a40bf45e03a4f2c5c9b225347c24c248aef4`, retains 433 artifacts totaling 411,438,191 bytes and 42 command receipts: 33 success and nine expected rejection. There are 21 measured proving/verification commands. Reference binary SHA-256 is `2d6ea0ed47a90a08367fb1f280aefe0773f5e7272c9193ea3ff06ec4d95ae0e1`; candidate is `42ee50af21127361f60c65b62d46fcc562d47943baf3e02577a5a2d14afe8ed1`.

The subsequent [compiled-sequence reuse](NATIVE_PROVER_REUSE.md) changes two additional driver files. This report remains historical evidence. The runner below rejects that newer source state; it reproduces this experiment only with all recorded source/compiler/dependency identities restored at their recorded paths. Merely choosing a fresh output directory does not restore those identities.

In that exact historical source state, reproduce in a new immutable lane:

Recorded retired invocation:

```text
python3 scripts/test-native-membership-cache.py --lane native-membership-cache-attempt-2
```

The separate audit script (retired source path `scripts/audit-native-membership-cache.py`) checks all artifact identities, exact original hash helpers and descriptor encoders, identical timing transformations, actual test/command outputs, all source-hash event sums and RSS values, complete proof framing to EOF, proof/receipt parity and exact rejection errors. Cache ownership and resource semantics also received manual source review; an encoding comparison alone would not establish them. The audit performs no native execution or repeated cryptographic verification and does not rehash the dependency family.

The [audit report](../../output/qualification/native-membership-cache-audit-attempt-1/report.json), SHA-256 `8c99f71793308e92e08de6f7aaddca677c19c62169318a40614e28249cf085bd`, passed all checks. Repeating it requires those same historical source identities and a fresh output directory; its drift checks are intentionally unchanged:

Recorded retired invocation:

```text
python3 scripts/audit-native-membership-cache.py --lane native-membership-cache-attempt-1 \
  --output native-membership-cache-audit-attempt-2 \
  --report-sha256 84d52162e0892dfae56aa1a47b00a40bf45e03a4f2c5c9b225347c24c248aef4
```
