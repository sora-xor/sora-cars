# Native public proof job supervision

The native supervised job now passes production compilation, 34 focused tests,
16 actual CLI outcomes and an independent evidence audit in the isolated Iroha
worktree. This qualifies the operator-run job on macOS. The subsequent
[HTTP service and SDK integration](native-proof-http.md) now passes focused
native/socket tests and a real proof round-trip. The browser UI now uses the
native transport; its qualification is recorded separately in the
[browser workflow](proof-worker.md). Strong public process containment remains
required. The preceding
[producer/exporter qualification](native-street-producer-bundle.md) and its
retained evidence remain unchanged.

The worker consumes the native `GameVerificationRequestV1` and canonical public
replay. Its independent trust and game selection come from that request. The
native prover owns witness derivation and proof construction; a separate native
verifier must accept the resulting file before the worker returns it. Neither
the worker nor its report can register Street, admit a proof profile, sign a
wallet transaction or settle a game.

The callable surface is `iroha app execution work-finalized`, configured
through a dedicated `iroha_config` document. This operator-run job is a building
block for the [native HTTP service and SDK](native-proof-http.md). The
[browser record office](proof-worker.md) accepts native finalized bundles with
independently entered trust settings. Public hosting and the live-room
settlement workflow remain separate required work.

The supervisor selects the running native executable itself and starts fixed
`prove-finalized` and `verify-finalized` children. Both receive private fixed
filenames, public data, null stdin and a cleared environment. Uploaded values
cannot select executables, arguments, URLs or filesystem paths. Typed reports
must agree with each other, the request and actual file lengths. The result
retains the verified proof inode through bounded reads and publication.

One admission slot covers staging, proving, verification and retained output.
The operator-owned spool requires an exclusive process lease. Startup rejects
unknown contents and crash debris; it never silently erases those files or
ignores their disk use. Cleanup releases admission only after owned subprocesses
are reaped and owned storage is removed. Uncertain cleanup quarantines capacity.

Cancellation and deadlines are process-lifecycle controls. The supervisor keeps
the process-group leader unreaped until group cleanup, preventing a signal to a
recycled leader PID. It never signals that numerical group after reaping.
Both output pipes are drained with finite per-poll work and fixed byte caps.
An inherited pipe remaining after leader exit prevents ordinary slot reuse.

On macOS, signaling an already-exited unreaped group can return `EPERM` because
Darwin excludes zombie recipients. The implementation accepts this only after
observing that exact child's exit, successfully reaping it, and obtaining a
final read-only `ESRCH` group probe. Permission failures for live children or
surviving groups remain failures. Existing quarantine is never cleared by this
exception.

These mechanisms trust the fixed native CLI. Process groups do not contain
arbitrary escaped descendants, and byte limits are not OS memory or disk quotas.
The configured proof-size limit is checked after proving; native temporary
output can reach the native cap before that check. Strong public Linux isolation
still requires cgroup membership before untrusted parsing, no escape privileges,
resource accounting and cleanup qualification. macOS process tests establish
development behavior only. Wallet and network isolation require separate OS
policy; clearing the environment supplies neither.

The command takes explicit local files:

```sh
iroha app execution work-finalized \
  --worker-config worker.toml \
  --request request.nrt --replay replay.nrt --out proof.bin
```

The operator creates an existing canonical owner-only spool directory, then
sets `spool_dir` to its absolute path in `worker.toml`. Optional settings are
`upload_timeout_ms` (30,000 by default), `job_timeout_ms` (1,800,000),
`replay_bytes` (1 GiB) and `proof_bytes` (512 MiB). The timeout covers proving
and separate verification together. Unknown keys, inheritance and client
configuration fail. The output must be outside the private spool; existing
outputs are preserved. Publication uses a same-directory temporary and atomic
no-clobber persistence. Filesystem failure behavior still depends on the
underlying filesystem and tempfile implementation; this is not crash-durability
or universal filesystem-fault qualification.

The [closed passing report](../output/qualification/native-proof-worker-attempt-2/report.json)
has SHA-256 `4e2cbb6beea30bc83aba20ac3b88163b87f9b6d50c63163dc78df23c62000a40`.
The [independent audit](../output/qualification/native-proof-worker-attempt-2/audit.json)
passes unchanged on first execution, SHA-256
`99a7bc746afd63386afdaa84df5ea7940c9ec4a8083a1253cdee581b364b74d1`.
It checks 324 original artifacts totaling 798,723,573 bytes, 172 source pairs
(162 native), 55 literal identity includes, three retained Cargo-emitted
executables and 39 command receipts. Source and artifact drift lists are empty.

All 34 source/list/pass test identities match: 31 CLI and three configuration
tests. Two explicitly selected integration cases use the actual retained
production CLI to prove/verify public input and cancel after owned temporary
creation. Other process fixtures cover successful exit, timeout, flooding,
inherited pipes and cleanup. Data-only report/inode tests assert transport
behavior, not native proof validity.

The 16 CLI outcomes comprise successful supervised proving plus a separate
verification, ten rejection cases, SIGINT and SIGTERM cancellation, and two
post-signal spool reacquisition checks. The rejections cover foreign trust,
frame order, malformed request/replay, explicit client config, existing output,
replay cap, deadline, unknown config and stale spool data. Both signal tests
observe the actual owned native prover and its temporary before signaling only
the unreaped parent CLI. Afterwards the original PID and group are absent, the
job directory/output temporary is gone and the identical persistent lock inode
can be reacquired. These checks do not claim cancellation during dense proof
computation or arbitrary descendant containment. Fourteen spool postconditions
are retained, including exact preservation of unrelated stale data.

| Complete unoptimized process | Time | Reported peak RSS |
| --- | ---: | ---: |
| Native supervisor proof/verification/result-lease test | 40.181 s | 116,899,840 B |
| Actual `work-finalized` command | 39.807 s | 116,932,608 B |
| Independent CLI verification of its output | 17.377 s | 114,114,560 B |

The proof is 252,685 bytes and public replay 43,496 bytes. The input is the
earlier two-player all-forfeit boundary from a synthetic zero-value prestate,
with no driving. These timings include different complete process workloads;
they are not isolated prover benchmarks, speedups or full-race feasibility.
The prior six-tick moving proof still exceeds the ledger envelope.

The three current builds took 21.841 / 28.744 / 0.875 seconds in the existing
warm target. Core reported 152 warnings, the production CLI two and its test
target one; configuration tests reported none. Scoped formatting and codec
checks pass. No workspace-wide, strict Clippy, Linux, hardware or four-validator
gate was run. Per-build library inventories of 1,007 / 1,009 / 589 are retained
build-time records, not unique totals or reopened warm artifacts.

The audit runs no native code, does not independently decode every Norito file
or reconstruct past process behavior, and does not reread current sources or
replaceable warm libraries. A separate final source check compares the current
selected inputs to the report pins. The first failed attempt remains unchanged:
it exposed the Darwin zombie-group behavior described above; the passing second
attempt reruns the entire selection after that correction.

Run current supervisor, command and configuration tests directly from the
isolated Native checkout, preserving its warm target:

```sh
cd /Users/takemiyamakoto/dev/iroha-sora-cars-native
cargo iroha-fast -- test --release -p iroha_cli --bin iroha \
  execution_worker::tests:: -- --test-threads=1
cargo iroha-fast -- test --release -p iroha_cli --bin iroha \
  execution_worker_command::tests:: -- --test-threads=1
cargo iroha-fast -- test --release -p iroha_config --lib \
  execution_worker::tests:: -- --test-threads=1
```

Two genuine process tests remain explicitly ignored in that ordinary selection:
`native_public_bundle_prove_and_separate_verify_hold_result_lease` and
`native_public_bundle_cancel_after_owned_output_creation_reaps_and_cleans`.
Run them with current producer artifacts from the
[native producer test](native-street-producer-bundle.md), a retained current CLI
whose executable hash has been checked against its build record, and an existing
fresh output directory. The test inputs are
`SORA_CARS_NATIVE_PUBLIC_WORKER_FIXTURE` (the `producer-deadline-n0` directory),
`SORA_CARS_NATIVE_PUBLIC_WORKER_CLI` and `SORA_CARS_NATIVE_PUBLIC_WORKER_OUTPUT`.
With those explicit inputs set, the focused command is:

```sh
cargo iroha-fast -- test --release -p iroha_cli --bin iroha \
  execution_worker::tests::native_public_bundle_ -- --ignored --test-threads=1 --nocapture
```

The successful case independently proves and verifies, checks the result inode
and held admission, and confirms child reaping; the cancellation case observes
actual proof-output creation before cancellation and checks cleanup. These are
separate gates, not implied by ordinary unit tests. The obsolete Python ancestry
runner has been removed. Historical reports and their source snapshots remain
unchanged records, never required executable inputs to a new run.

The full SORA CARS goal remains active, including admitted lifecycle,
compact full-duration proofs, composed security, custody/settlement, supported
hardware, four-validator operation, wallet flows and SoraFS deployment.

The retained [HTTP integration draft](../output/implementation/native-proof-worker-http-draft/plan.md)
records the earlier preparation. Its successor is implemented and tested in the
[native HTTP service](native-proof-http.md), with separate
[Chromium record-office evidence](proof-worker.md). The historical draft itself
is not an additional qualification result. Public OS containment remains open.
