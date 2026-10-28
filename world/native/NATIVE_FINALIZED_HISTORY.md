**Origin-bound native computation — September 8, 2026**

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


The [association component](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/finalized_history.rs) connects a sealed
[finalized merge record](NATIVE_FINALIZED_MERGE.md), the complete accepted-input
history and a genuine guarded computation proof. The execution proof now binds
the exact certified batch state point before deriving challenges. A valid proof
for an independently supplied snapshot cannot be promoted by placing a finality
certificate beside it.

This is a local native implementation and qualification boundary. The ledger
fixtures use real global BLS signatures and proofs of possession with synthetic
merge execution data. Native delta production/retention, consensus execution,
legal removal transitions, fresh settlement association and composed 128-bit
security remain unqualified.

**Statement and capability flow**

The caller independently selects the network trust context and exact target
block, then the expected session, revision, selection/archived mode and terminal
tick. The native ledger verifier authenticates the carrier and full sidecar.
The complete-delta extractor returns the only record accepted by this component;
there is no constructor taking a substitute record or caller-supplied locator.

The stable state-origin digest binds the network, verified target context,
target height/block, marker-inclusive state-point tag, complete merge-entry
identity, batch identity, write-set root, base identity, session and revision.
The actual block hash and height remain separate literal fields. An origin digest
is never substituted for a block hash.

The initial trusted checkpoint and first verified height describe the verifier's
authentication route, rather than the state being computed. They remain in the
sealed ledger receipt and final association digest. They are deliberately absent
from the stable execution origin: one public computation proof should verify
through different valid finality paths reaching the same target state.

The [accepted-history validator](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/accepted_history.rs) requires an explicit
`state_origin` in `SnapshotContext`. It commits that origin in the snapshot hash
and the 239-byte `IWAHCTX3` context alongside the complete policy, evidence,
terminal, batch width and mode. The guarded verifier rederives that context and
the full compiled relation before checking any component proof.

`FinalizedHistory::attach` consumes a genuine, privately constructed computation
receipt. Snapshot, evidence, terminal and archived outcome must match exactly.
The resulting private receipt retains the source and binds the complete history,
origin, authentication route, sequence/transcript digests and canonical outcome.
It does not turn removal markers into independently proved historical decisions
or establish an escrow transfer.

**One first-release format**

The accepted-history domain is now `lab-v3`; `IWAHCTX2` is not accepted by the new
context checks. The local Street selection payload has six required fields,
including the origin. There is no five-field or dual-context fallback.

This domain change also affects input-prefix hashes, checkpoint transcript roots
and anchors. New fixtures therefore regenerate their complete records, checkpoint
signatures and proofs. An old signed checkpoint or proof is not relabeled as new
evidence. Historical qualification directories retain their original sources
and bytes; their evidence is not attributed to the new domain.

**Public prover and verifier workflow**

The native CLI adapter (retired source path `scripts/native/native_finalized_history.rs`) uses
the same bounded component reader for local and finalized verification. Its
compiled Street adapter fixes the manifest geometry, six-byte control batches,
state hash, outcome projection, source programs and maps. Neither a proof nor a
profile registration selects replacement verifier code.

`bind` authenticates public carriers, derives the complete expected statement and
writes a **new** bound directory. It preserves the original inputs, uses
create-new writers, and reauthenticates the copied public bytes before reporting
success. The prover generates fresh proofs under that statement, using the
existing witness values. It never needs wallet or input-signing keys.

`verify` receives public replay data, the proof, complete delta/sidecar/block and
the required consecutive finality archives. Its trust file is an explicitly
separate operator-supplied argument. A trust file downloaded with the bundle
does not become independent authority merely by being stored elsewhere.

The public test directories contain exactly eight files: `session.nrt`,
`evidence.nrt`, `selection.nrt`, `block.nrt`, `finality-100.nrt`, `merge.nrt`,
`delta.bin` and `proof.bin`. Verification never opens a witness or reconstructs
driving witnesses. This verifies the program's public-input boundary; it is not
an OS sandbox preventing all access to files elsewhere on the machine.

The laboratory CLI commands are:

```sh
native_finalized_history bind INPUT_DIR INDEPENDENT_TRUST.nrt NEW_BOUND_DIR
native_finalized_history prove NEW_BOUND_DIR PROOF.bin
native_finalized_history verify PUBLIC_DIR PROOF.bin INDEPENDENT_TRUST.nrt
```

**Qualification and remaining work**

The runner (retired source path `scripts/test-native-finalized-history.py`) builds standalone
sources against one retained model/crypto/Norito family. It preserves complete
source and binary identities and rechecks all 464 dependency nodes and 2,421
retained files. The current core encoder sources remain separately frozen grammar
references; they are not compiled Core dependencies or a native producer capture.

The genuine small-game tests exercise explicit origin and revision substitutions,
valid active/archived outcomes and ties, malformed or reordered proofs, incomplete
verification, poisoned retries, signed false checkpoints and wrong archived
results. A portability test authenticates the same target through `[100]` and
`[99, 100]`, reuses identical genuine proof frames, and requires equal execution
origins with different route-specific association receipts.

Fresh Street CLI cases cover two-car six-tick histories and two/eight-car
zero-motion terminal boundaries, including genuine proofs that must fail at a
false checkpoint or incorrect archived outcome. These are short qualification
cases, not full-duration race or validator-cost measurements.

The completed [attempt 2 report](../../output/qualification/native-finalized-history-attempt-2/report.json)
has SHA-256 `70df4eb620120621b0611641d251c2d92cba0c0025db38c2494d455322947fc1`.
Both standalone builds passed. **65 selected tests passed**: 30 accepted-history,
custody, cap and guarded-computation tests; 27 finality/merge tests; and eight new
association tests. These are six selected groups, not every test listed by the
combined harness. Compilation retained unused-code warnings; these commands did
not use `-D warnings`.

All six fresh Street cases produced genuine proofs, comprising 30 component
proofs. Four finalized verifications accepted. The coherently signed false
checkpoint and incorrect archived outcome rejected with `Checkpoint` and
`Outcome` respectively after proof processing. Seven additional public CLI
mutations rejected: altered delta, foreign session, unbound origin, old
five-field selection, damaged proof header, missing replay and foreign trust.
Their command, output, error and exit-code records are retained in the report.

| Fresh accepted case | Simulated ticks | Proof bytes | Prove / verify wall seconds | Prove / verify peak RSS bytes |
| --- | ---: | ---: | ---: | ---: |
| Two-car moving sole winner | 6 | 6,614,713 | 41.305 / 16.474 | 211,910,656 / 138,035,200 |
| Two-car archived sole winner | 0 | 253,597 | 1.468 / 1.587 | 65,536,000 / 70,877,184 |
| Eight-car technical win at genesis | 0 | 531,693 | 18.143 / 18.580 | 661,749,760 / 642,269,184 |
| Eight-car refund at genesis | 0 | 537,981 | 19.225 / 18.576 | 660,946,944 / 641,875,968 |

These are single shared-host arm64 CPU observations, including runtime source
and statement construction and, for verification, ledger authentication. They
are not estimates for a 180-second race. The runner preserves 468 artifacts
totalling 252,463,024 bytes, 59 current/frozen source pairs, nine unchanged native
proof source files and ten direct dependency identities. It rehashed the entire
retained dependency family before and after the run, without rebuilding it.

The failed first attempt is retained. It compiled and passed its 64 selected
tests, but its [first CLI bind](../../output/qualification/native-finalized-history-attempt-1/2-moving-sole-bind.stderr)
rejected `Decode("canonical bounded native archive")`: the fixture exporter had
written a bare trust tuple where the reader requires a canonical native archive.
The exporter now uses `norito::encode_canonical`; no permissive reader fallback
was added. Attempt 2 also adds the eighth association test for two-path proof
portability. No successful Street prove/verify is attributed to attempt 1.

To reproduce in a new evidence directory while retaining earlier attempts:

Recorded retired invocation:

```text
python3 scripts/test-native-finalized-history.py --lane native-finalized-history-reproduction
```

Next, native Iroha must export and retain actual rollback-safe delta preimages
and qualify their consumption by this verifier. Current native
`StartGameSessionV1` still derives the unsigned genesis transcript with
`game_message_hash_v1(..., "input-transcript", ...)`, whereas this adapter uses
the session/profile-bound `lab-v3` prefix. A genuine producer run therefore also
requires coordinated first-release prefix, profile and genesis integration and
the native terminal-cap correction. Stored records cannot be relabeled or
rewritten to stand in for that integration. Kura's retained merge sidecar,
executed block and finality artifact do not themselves contain the missing
complete delta preimage.

Under the normal trusted-consensus validity assumption, an authenticated record
establishes consensus-accepted removal decisions. This differs from independently
replaying or proving every historical transition and its deadline. Historical transition legality,
deadline evidence, selected pre-settlement versus final settled records, atomic
custody transfers, practical full-duration proving and independent security review
remain separate release requirements. Live stakes remain disabled.
