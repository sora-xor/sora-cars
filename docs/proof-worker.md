# Public native proving

The SORA CARS record office at `#/prove` uses the native Rust HTTP worker and
`@iroha/iroha-js/game-proof-worker`. It accepts a canonical
`GameVerificationRequestV1` file and either a separate exported native replay
or an explicit Torii source with a native `evidence.nrt` file. The latter
[export integration](native-torii-replay.md) now passes the local Stock workflow;
Street admission and full release qualification remain open. The
application JSON HTTP worker and its browser client have been removed; there
is no `/v1/proofs` compatibility route.

The record office supports explicit `street` and `stock_race` computation
selection. The original request, independent expectations and native report
must agree on that selection. Stock uses its compiled native relation and one
canonical `ExecutionProofEnvelopeV1`; Street retains its separate component
proof format. The native Stock adapter now passes movement/adversarial proof tests and its
separate zero-motion producer restores normally. The actual Stock
Torii/browser/worker/independent-CLI workflow also passes its focused local gates. Neither selection converts a local practice replay
into authenticated evidence.

The [native HTTP protocol](native-proof-http.md) defines the service, bounds and
qualification evidence. Start a locally built worker with:

```sh
iroha app execution serve-finalized --worker-config worker-http.toml
```

The configuration must allow the website's exact Origin and the worker's exact
Host authority. It accepts public data only, with no wallet key or client
configuration. Configure an HTTPS worker for a public HTTPS website; loopback
HTTP is supported for local development.

## Browser workflow

1. Obtain `request.nrt` and `replay.nrt` from the native finalized-record export
   workflow. A local game replay JSON does not contain the required ledger
   evidence. [Bundle format and CLI](native-public-game-bundles.md),
   [current Kura producer/export evidence](native-street-producer-bundle.md).
2. Enter the network and trusted context from an independently trusted source,
   then select the computation, exact block, session, revision, record mode and
   terminal tick.
   Loading the request does not fill or approve these expectations. The small
   canonical request is compared against all of them before any worker request.
3. Choose a replaceable worker. The browser reserves a job, uploads the native
   replay and polls within fixed limits. The UI uses Japanese text with English
   subtitles and exposes actual worker phases without inventing prover progress.
4. When the worker reports completion, choose a folder. The browser writes the
   original inputs, streams the proof with backpressure and saves the unchanged
   report flags in a labeled endpoint-report wrapper. It creates a unique child
   directory and removes incomplete output on cancellation or error. Unsupported
   browsers receive native CLI guidance; large proofs are not buffered in memory.
5. From that folder, use a reviewed native binary to check the original files:

```sh
/absolute/path/to/iroha app execution verify-finalized \
  --request request.nrt --replay replay.nrt --proof proof.nrt
```

The folder also contains `endpoint-report.json` and `verify.txt`. The latter
uses `./iroha` as a placeholder for the reviewed binary. An endpoint's claim of
successful verification is not an independent browser verdict. Qualification,
profile registration, freshness, removal replay and settlement flags retain
exactly the values reported by the native worker.

For a Torii source, choose its exact origin and a separate canonical public
evidence file. The browser compares the original request with the independent
expectations before contacting Torii, then streams its response into a unique
private disk folder. Only an exact, complete download becomes the replay used
to reserve a worker job. Export does not authenticate driving inputs; the native
proof verifier must still check those. The Torii response cannot replace the
original request or its trust pins. Navigation, cancellation and source changes
retain cleanup ownership and prevent late download publication.

## Lifetimes and bounds

Requests are at most 4 KiB, browser replays at most 1 GiB and proofs at most
512 MiB. Native Stock verification additionally enforces its 4 MiB envelope
limit plus canonical framing; the broader transport cap does not relax it.
File writes are awaited in chunks of at most 64 KiB. Polls do not
overlap; cancellation aborts browser operations and requests native cleanup.
Native expiry remains necessary when a tab closes before cancellation reaches
the service. A completed proof can retry folder selection without generating
another proof. Pending local cleanup blocks a new export, and delayed writes
cannot publish an aborted folder.

The Torii download path currently has a separate 256 MiB staging limit and
takes explicit evidence of at most 16 MiB. A node's aggregate decode budget can
reject nested evidence below that byte ceiling.

The browser controller has a fifteen-minute operation limit and a bounded
poll count. Local input-file preparation has a two-minute deadline. UI cleanup
waits at most five seconds before showing that owned file cleanup is still
pending; the original cleanup and abort intent remain live. Native worker
limits may be stricter. These application bounds are not OS process or disk
quotas.

## Executed browser evidence

The retained run below exercised the Street file-upload path before the new
Stock selection and Torii download integration. It does not qualify either
addition.

The [fresh Chromium/native integration](../output/qualification/native-proof-browser-attempt-5/report.json)
passes eight scenarios and 24 checks. Report SHA-256:
`471fd1417c5852b11ad92c3e4717f22e575457798ef23eb414939af72f04b003`.
It runs the actual app, SDK and native worker. Only the OS folder chooser is
substituted with a real Chromium OPFS directory; file writes, network traffic
and native proof generation remain real. This does not test the OS chooser UI
or qualify mobile folder-saving support.

The native worker's staged request and replay are independently read through
retained read-only file descriptors. Their exact hashes and lengths match the
browser-selected inputs and actual job. Playwright does not expose the binary
Blob request bodies, so those unavailable observations remain null. The test
requires Chromium's actual Content-Length and Origin headers and CORS responses.

The exported proof is 252,685 bytes, SHA-256
`9e6ffb68f1811a7e7cf17b5e067b18ffffcdee7cff2ebdccf82d98c7453a2382`.
A separate native CLI process verifies the exported request/replay/proof and
reproduces every report field. The fixture covers a synthetic zero-funded,
two-player all-forfeit boundary, with no driving. No browser verification or
live settlement is claimed.

Coverage includes mismatched pins and unsupported saving before any upload,
denied folder selection followed by retry of the same completed job, explicit
cancellation and navigation after upload, actual native rejection of a replay
with trailing bytes, rejected Origin, and a delayed folder choice returned
after navigation. That late OPFS handle creates no output or proof download.
Pending OS-write interruption is covered separately by unit tests, not this
Chromium scenario. All 24 controller/output unit tests pass.

The report retains 104 selected source snapshots with no drift, desktop/mobile
captures and owned process receipts. All native and Vite processes finish;
only the persistent spool lock remains. It is focused integration evidence,
not complete build provenance, an independent cryptographic audit, a full-race
benchmark or public hosting qualification. The three earlier failed attempts
remain retained with their harness errors and narrower completed coverage.
Attempt 4 also passed before the [SDK account repair](native-sdk-account-encoding.md);
attempt 5 reruns the complete workflow against the repaired SDK.

## Current Stock Torii workflow

The [Stock browser receipt](../output/qualification/native-stock-replay-browser-attempt-5/report.json)
passes three actual Chromium scenarios and seven checks using the shipping native
Torii router. Original producer, downloaded OPFS and native worker replay bytes
match exactly (43,495 bytes). The saved 1,688,016-byte native execution proof passes
a separate CLI verification with the original 218-byte pinned request. The replay
server shuts down after input transfer, before proving completes. Temporary replay
cleanup and pre-upload pin/computation rejection also pass. All owned processes
close and selected source, fixture and Kura inventories remain unchanged.

This is a synthetic zero-funded, all-forfeit tick-zero fixture. Browser assurance
remains endpoint-reported; native profile registration, settlement, composed
security, freshness and removal replay remain unqualified. Actual desktop/mobile
captures were inspected, but the OS chooser is substituted with actual OPFS.
The complete 182.048-second integration run is not isolated prover time or a
full-race benchmark. A prior three-minute proving wait timed out; the current
explicit unoptimized worker allowance is ten minutes. Prior failed receipts keep
their original outcomes. See the [export note](native-torii-replay.md) for scope.

## Separate settlement boundary

Public bundle verification does not establish settlement. Street's component
proof file is not a ledger settlement envelope. Stock's proof file uses the
existing native execution-envelope format, but that format alone does not
authorize payment: native settlement must derive and check its expected
statement against the actual ledger state. The record office never connects a
wallet or sends a settlement instruction. The live-room
settlement importer remains separately restricted to its exact admitted
application/profile and native envelope checks. Street is unregistered;
full-duration proofs, composed security and live XOR/NFT settlement remain
unqualified.

The current live room is restricted to Stock RaceV1; the record office's two
explicit native computations remain subject to their separate proof and
admission rules. Completing and qualifying the generic live-game
proof-to-settlement workflow remains required before enabling live stakes.

The standalone `scripts/prove-replay.mjs` is an application-adapter CLI wrapper,
not the finalized-record HTTP service. Its process tests remain separately in
`tests/native-proof-process.test.ts`; they do not qualify the new finalized
browser workflow or its native proof.
Its application request must be obtained independently: the retired UI request
export is not a supported route, and the native record office does not convert
its files into that request.
