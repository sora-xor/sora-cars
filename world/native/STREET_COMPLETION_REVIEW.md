# Independent Street completion evidence review

September 8, 2026. Read-only source, artifact and arithmetic inspection; no test reruns, dependency builds, Cargo, maintained-Iroha writes or network operations. The reviewer did not produce the tested witness or execute the qualification.

**Finding:** the retained evidence supports complete raw verification of the actual eight-car, 8,462-tick Street replay from genesis. No acceptance defect or misleading completion claim was found in the inspected adapter, generic terminal layer, harness or [completion documentation](STREET_COMPLETION.md). Accepted-history authority and a full-race cryptographic proof remain unimplemented by this work.

## What was checked

The [Street report](../../output/qualification/street-terminal/report.json) passed 93 digest comparisons: 25 current/frozen source pairs, all 40 retained file entries, and the separately recorded compiler, harness and binary identities. The compiled harness's module/include paths point exclusively to its pinned frozen source set. These counts are digest comparisons, not 93 distinct files.

All three retained stdout JSON objects exactly match their report entries. Each stderr measurement matches the recorded resident-memory value and contains no panic/error. The full stdout is emitted only after `verify_complete` succeeds, its typed result equals the native prepass result, and all-node parity counts agree. The runner requires a successful process return before writing the report. Partial progress logs are not the basis for accepting completion.

The replay copied into the qualification lane is byte-identical to the [retained browser replay](../../output/browser/street-practice/completed-replay.json). Independently checked the conversion to 67,696 control bytes, all 8,462 rows, the 244 output-name/value text conversion, and the replay's pinned Tokyo bundle identity. The exact final outcome belongs to this tape, whose winner is slot 7; it is not the separate all-bot tape's slot-1 result.

The harness begins at `RaceGraph.initial_inputs` and carries state by the compiler's fixed port map. Its first native pass requires the first `done=1` exactly at tick 8,462 and compares every output with the browser claim. The second pass generates one tick at a time, compares every native node with its lowered wire, and calls the complete verifier. The verifier checks the four cursor/halt predicates and delegates to the original structural and staged verifiers, which check every row's exact shape, canonical fields, scalar equations, lookup memberships, carry/zero cells and boundary claims. The native witness recipe does not replace those raw checks.

| Full active-run check | Per tick | Total, 8,462 ticks |
| --- | ---: | ---: |
| Native-node / lowered-wire parity | 101,808 | 861,499,296 |
| Scalar polynomial residues | 287,970 | 2,436,802,140 |
| Exact range-table memberships | 219,236 | 1,855,175,032 |
| Staged wire carries | 5,328 | 45,085,536 |
| Stage-local zero cells | 48,588 | 411,151,656 |

These totals agree with the compiled schedule counts multiplied by the executed length. Input/action/inter-tick/final-output bindings and terminal predicates are also checked; the table does not purport to enumerate every comparison performed by the process.

Native prepass time was 1,484.397917 ms; complete raw generation/verification time was 266,351.039333 ms. Full-process elapsed time was 267.93 s with peak resident memory 297,517,056 bytes. The raw timing includes witness production and native reexecution as well as verification. It is neither cryptographic proving time nor a production validator verification-cost measurement. The short eight-car negative suite used a higher 331,415,552-byte peak because it retains several short fixtures.

## Negative-test and proof boundaries

The two- and eight-car short cases are actual three-step computations from the compiled grid with synthetic numerical forfeit tapes. They establish raw technical wins/refunds, not consensus authorization or physical course completion. Every one of the 112/244 final-claim fields is independently mutated and rejected. Prefix/absorbing traces are first accepted structurally and then rejected by complete admission. A valid removal trace paired with a different public tape fails; the report's `unauthorizedTapeRejected` is public-tape binding, not signature verification. Truncation also fails.

The short cases directly evaluate all 36,856/223,502 terminal-and-padding exports, then check honest and altered padding through the raw verifier. Constructed exact-tie claims exercise result projection only and are labeled accordingly. The separately retained [generic report](../../output/qualification/execution-terminal/report.json) passes eight focused tests; its source/artifact/compiler pins and recorded stdout passed another 24 digest comparisons.

The full run verifies active rows only. It does not evaluate the full power-of-two global padding region, instantiate lookup auxiliaries or quotient polynomials, build commitments/LDEs, or generate/verify a Street proof. Source inspection confirms `verify_complete` does not silently invoke a prefix-only success path. Its final projection is derived after full raw verification; calling `project_final_claim` alone remains explicitly untrusted claim processing. No finality, input-key authority, escrow liability, NFT eligibility, 128-bit soundness or live settlement claim follows.

## Maximum-duration addition

The separate [timeout report](../../output/qualification/street-terminal-timeout/report.json) also passes independent read-only inspection. Its [retained runner source](../../output/qualification/street-terminal-timeout/producer.py) invokes the exact previously qualified binary, with no compilation. Verified all five retained file hashes, the current/frozen runner identity, the unchanged base report/binary, and all 65 base source/file entries again. The input is exactly 18,000 zero bytes, decoded by the existing full-run harness as 9,000 two-car control rows with zero forfeits. There is no synthetic intermediate state or near-cap shortcut.

Stdout matches the report and records first terminal at tick 9,000 with winners `[0,1]`. Counts agree with 9,000 times the two-car schedule: 50,283,000 native-node comparisons, 202,536,000 scalar checks, 149,148,000 memberships, 711,000 staged carries and 93,681,000 stage-zero checks. Native prepass was 96.84575 ms; complete raw generation/verification was 30,743.019958 ms; process elapsed time was 30.85 s with 36,405,248-byte peak resident memory, as retained in stderr.

This is a genuine full-genesis cap-duration tied result through the complete raw verifier. The harness's expected-browser-output argument is explicitly `-`, and `finalOutcomeMatchedBrowser=false`: this case has no separate browser outcome comparison. It is not evidence of two cars physically finishing simultaneously, authenticated removals, a proof, or full-domain padding. The added paragraph in `STREET_COMPLETION.md` preserves those distinctions. No additional acceptance defect or evidence overclaim was found.

## Pins

| Artifact/source | SHA-256 |
| --- | --- |
| Street terminal report | `2151180745a0ced2290653f604fbd481b15b7eddaf98f83d23bacf90b568071b` |
| Generic terminal report | `bbd02a6e34d2a3c548f6b91cce5c36bbc2b921040863b078ad59c41b654bf3e4` |
| Maximum-duration report | `eb7ed532c2b1dfc881b89c0155479035051b09fa875ba0386d00c8a322718478` |
| `scripts/test-street-terminal-timeout.py` | `8765679cf1b0fa192dc53b2143b566359a23b013b1b28bdf429287cf97385871` |
| Maximum-duration `zero-controls.u8` | `a449143636d0c1e40605ef04ba2415d4b249ced9cac2ce491aafd20f45d300c8` |
| `street_terminal.rs` | `6db4fefc63974242c0d1023856082b2c4a740a6c49fe8a128c0f75f4a7cd8de8` |
| `execution_terminal.rs` | `3041c74d4cbb7bb4d92a26eb57ebc44e83fad165164fb847270b0cf76146c805` |
| `scripts/native/street_terminal_qualification.rs` | `f67944fc2215190d96836a37c638302b4949be944abc35b29e50ec0a7d94096e` |
| `scripts/test-street-terminal.py` | `365527f0899ea32410ce427d3c18cd6892b3e93d5cff70ebd3190c5c6a9b9856` |
| Frozen full-run harness | `05faceb3a062c327463afde732ae614875f1bcd3b4d0c764538327189524847d` |
| Frozen full-run binary | `99df18f9435dd0054f23f267fe6fca866a30778754c9a6e58d2f611a9b1035d0` |
| Original and frozen completed replay | `a1bdb890fb8b598055635a2e8c865e75be2beb182d745577a523591fbf784252` |
| Converted `replay-controls.u8` | `6664c50da829a108fbf34303f18eee1075011997cdc52b889392f1e8c3eaa678` |
| Converted `replay-outcome.txt` | `46924ace563872c6a23aca2ec38675086221451029a26cd4abebab3efdbc2588` |
| Inspected `STREET_COMPLETION.md` | `bd8c63fbf4cb52f34cb9b7988a011d175d4ca606974de4f087f1fe23e48f8b0d` |

All ten local targets in the inspected completion document resolve, including the timeout report and completed layout-study handoff. No documentation link issue remains from this review.
