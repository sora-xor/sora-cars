# Native finalized-game proof HTTP transport

The native HTTP service and generic browser SDK transport now interoperate on
macOS. The SDK uploads a real native public replay, the service proves it and
runs a separate verifier, the SDK streams the proof to a file, and an independent
CLI invocation verifies the downloaded file and reproduces the complete report.
This extends the [operator-run proof job](native-proof-worker.md).

The implementation lives in the isolated `iroha-sora-cars-native` worktree.
It has not been imported into the maintained `iroha` optimizations checkout.
The SORA CARS record office at `#/prove` now uses this canonical native transport.
It requires independent trust settings and exported native files; it never
reinterprets local gameplay JSON. See the [browser workflow](proof-worker.md).
The old application JSON HTTP worker and client have been removed.

## Native ownership and protocol

Run `iroha app execution serve-finalized --worker-config worker-http.toml`.
The command rejects client configuration and accepts no wallet keys, executable
paths, request-selected filesystem paths, remote replay URLs or verifier code.
Configuration belongs to `iroha_config`, with user/actual/default layers and
strict unknown-field rejection. No environment fallback is used.

One native owner thread retains the upload, running job or verified result. Its
bounded actor mailbox cannot create a job queue. Unconsumed reservation replies
revoke their reservations. Upload/download guards carry generation checks and
retain storage until their bodies have dropped. Cancellation requests closure;
it never claims an active child has already been reaped.

| Resource | Operation |
| --- | --- |
| `POST /v1/jobs` | Reserve using exact canonical `GameVerificationRequestV1`, at most 4,096 bytes. |
| `PUT /v1/jobs/{id}/replay` | Upload the native public replay with a known exact length. |
| `GET /v1/jobs/{id}` | Read bounded diagnostic status; complete includes the unchanged native report. |
| `GET /v1/jobs/{id}/proof` | Stream the verified proof sequentially in chunks of at most 64 KiB. |
| `DELETE /v1/jobs/{id}` | Request cancellation and cleanup. |
| `OPTIONS` on these resources | Validate an exact configured browser-origin preflight. |

Server-generated IDs are 256 random bits encoded as 64 lowercase hexadecimal
characters. Statuses are `awaiting_upload`, `uploading`, `running`, `cancelling`,
`complete`, `draining` and `failed`. The supervisor does not expose internal phase
notifications, so the HTTP service does not invent proving/verifying progress.
Native errors are reduced to fixed public codes; local paths and child stderr
are not returned to clients.

There are at most 32 configured HTTP/1 connections. A raw header guard enforces
an 8,192-byte/32-field bound and an absolute ten-second read deadline before
Hyper can normalize duplicate headers. This matters because Hyper otherwise
coalesces equal repeated `Content-Length` fields. Both duplicate lengths and
forbidden encodings are rejected on real sockets. HTTP keepalive, upgrades,
range/resume requests, URI queries and redirects are absent.

The connection driver observes transfer expiry even during socket backpressure.
Control responses also have a fixed deadline. Shutdown first closes admission,
then drops and joins connection tasks, then joins the native owner outside the
runtime. A slow-cleanup diagnostic never detaches that owner or releases its
storage prematurely.

The configuration defaults to `127.0.0.1:8789`. Browser origins and HTTP Host
authorities have separate exact allowlists: origins use canonical URL origin
spelling, while authorities preserve explicitly configured ports. The worker
defaults remain a 30-second upload, 30-minute combined proof/verification job,
1 GiB replay cap and 512 MiB proof cap. Result retention defaults to ten minutes
and a download to 30 seconds. Operator-controlled configuration and directory
ancestors remain trusted.

## SDK

`@iroha/iroha-js/game-proof-worker` exports canonical request codecs, closed
lossless report parsing and `createFinalizedGameWorkerClientV1`. The same API is
also exported from `./game`. It uses a separate replay Blob/file, omits
credentials, rejects redirects and unexpected paths, checks report selection
against the original request, and streams bounded proof chunks to an awaited
sink. No browser code sets the forbidden Content-Length request header.

All decoded worker reports remain explicitly **endpoint-reported**. Receiving
booleans that claim verification does not independently authenticate finality
or establish settlement. The native request's trust pins are caller-selected,
and the complete bundle must be independently verified. Local driving JSON
cannot replace native finalized replay evidence.

The explicit Node integration helper is
`javascript/iroha_js/scripts/game-finalized-worker.mjs`, taking worker origin,
request, replay, output proof and output report paths. It invokes this actual
SDK, preserves every native report field and refuses to overwrite output files.

## Executed evidence and limits

The [real HTTP integration report](../output/qualification/native-proof-http-attempt-1/report.json)
passes with SHA-256
`cec7dd98ad0ebf2172de2e9385b547035cc6efee0fdfaf66a7aaf37b04b40900`.
It retains the executed CLI, public inputs, downloaded proof, exact reports,
command logs, ten HTTP checks, raw duplicate-length rejection and 23 selected
transport-source snapshots. Source drift is empty. The server exits zero after
SIGTERM; only the persistent spool lease file remains. This is a focused
integration report, not the earlier worker's independent provenance audit.

The retained CLI has SHA-256
`567b7a7ad104134d8ed5b9eda34fce75fdb9c79962fc7b560c99098c62679f46`.
The fresh proof is 252,685 bytes, SHA-256
`9e6ffb68f1811a7e7cf17b5e067b18ffffcdee7cff2ebdccf82d98c7453a2382`.
Its deterministic bytes match the previous boundary proof, but this run actually
generates, separately verifies and transfers it. The SDK/native job takes
40.763 seconds; independent CLI verification takes 17.507 seconds. These are
whole unoptimized local process observations, not a speedup or full-race benchmark.

Focused current validation passes **63 native tests**: 49 worker tests, six
command-dispatch tests and eight HTTP configuration tests. Two existing genuine
supervisor tests remain ignored in this selection; the actual HTTP run supplies
separate real proof evidence. The worker selection includes six service socket
tests and three raw-header socket tests. The codec-retirement guard passes.
An initial CLI build found a Norito macro-expression syntax error, corrected
before the passing production build and tests. Logs remain under
`output/qualification/native-proof-http-development`.

The [retained SDK report](../output/qualification/native-game-worker-sdk-attempt-1/report.json)
has SHA-256 `5de3592be05e5a8c35dfdee71e52e0ed3cddcd8ca188c795b776a542643e1e12`.
Its runner, test/lint logs and 13 selected source/fixture pins are retained; no
source drift was observed. The SDK passes **32 focused tests**, including native 218-byte request fixture
parity, adversarial report/transport checks, and an isolated npm-packed browser
bundle with strict DOM-only TypeScript declarations. That bundle was executed
as Node ESM, not in Chromium. Broader SDK tests require a missing native host
binding in this isolated worktree; it was neither rebuilt nor bypassed here.

The public input remains a two-player, all-forfeit, zero-motion boundary from a
synthetic zero-funded prestate. This does not establish admitted Street
creation/entry/start, complete driving, NFT/XOR payouts, committed State restart,
or full-duration proofs. Street remains unregistered and its composed 128-bit
security remains unqualified. No wallet, Taira or SoraFS operation occurred.

Before public hosting, implement and qualify OS memory/disk/process containment,
Linux behavior, and stalled proof-download/resource-exhaustion cases. These
application byte/deadline limits are not OS quotas or an escaped-process sandbox.
The subsequent [Chromium record-office qualification](proof-worker.md)
passes eight real native/browser scenarios, including exported-file CLI
verification and cancellation. It uses actual OPFS in place of the OS folder
chooser and the same zero-motion fixture; it adds no full-race or cryptographic
security claim. Genuine Torii replay export, full-race proof scaling,
cryptographic review, four-validator/eight-client gates and deployment remain
part of the active full implementation goal.
