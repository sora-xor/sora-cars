# SoraFS release qualification

The website is a static content-addressed directory. Vite emits relative assets;
hash routing preserves the CID prefix. Fonts, images, MIDI files and the generated
simulator are local release files. Signaling and proof workers are optional
transports configured separately by players.

Latest public-read check: on **September 22, 2026 at 08:53:36 UTC**, `/status`,
`/v1/sumeragi/status` and `/v1/sorafs/capacity/state` each returned HTTP **502**.
The [retained read report](../output/qualification/taira-public-read-2026-09-22/report.json)
includes timestamps and response hashes. This is a public ingress observation;
it does not establish the underlying validators' state or current block height.
Advancing finality and provider capacity could not be verified. No credentials,
signed transactions, publication or infrastructure changes were attempted.
The September 5 observations below remain historical evidence, not current
network status.

Prepare and inspect the production directory:

```sh
npm run build
node scripts/test-static.mjs
SORA_CARS_IROHA_BIN=/absolute/path/to/reviewed/iroha node scripts/pack-sorafs.mjs
```

Select exactly one native binary. `SORA_CARS_IROHA_BIN` uses the current
credential-free `iroha --machine app sorafs toolkit pack` command and emits
the canonical CAR, Norito manifest and native `sorafs.toolkit_pack_report.v1`
report. The wrapper checks the report's CAR archive BLAKE3, manifest BLAKE3 and
exact bytes, lengths, CID fields, empty alias claims and chunk/PoR counts.
The native root CID is retained as hexadecimal bytes; no gateway availability
is inferred. This route does not prepare a separate provider ingestion payload.

Alternatively, set `SORA_CARS_SORAFS_CLI=/absolute/path/to/reviewed/sorafs_cli`
with `SORA_CARS_IROHA_BIN` unset. The standalone route keeps the current native
`car pack --input=...`, `manifest build`, and `storage prepare` interfaces,
including the chunk plan, directory payload and file map.

Both routes request three replicas and record the exact native command, binary
SHA-256 and local static-file inventory under `output/sorafs`. They invoke only
local packing commands with no inherited wallet configuration or stdin. The
wrapper rejects changed build files, symlinks and existing output; set
`SORA_CARS_SORAFS_OUTPUT` to a new directory to retain another package. Results
are moved into the final directory only after validation. Binary hashes identify
local tooling; they do not authenticate its source commit. Local consistency
checks do not replace a native CAR verifier or establish provider availability.
Packaging does not publish the site.

Native-command time budgets scale with the authenticated input inventory: ten
minutes per started GiB, with a ten-minute minimum and a one-hour maximum. The
complete 2,563,048,355-byte soundtrack payload receives thirty minutes. The
receipt records the payload size and selected budget. Output-size, unchanged-input,
binary-hash and native commitment checks remain in force. This addresses the
October 28 full-payload attempt that reached CAR emission but exceeded the old
fixed ten-minute timeout; it does not establish a successful package by itself.

`tests/sorafs-pack.test.ts` exercises both process interfaces, corrupted reports,
missing output, unexpected alias claims, changed inputs and evidence preservation.
Its explicitly synthetic executable is a process-boundary fixture, not native
CAR-generation evidence.

Publication remains a separate qualified native release. The standalone native
`sorafs_cli manifest submit` supports network-bound manifest registration with
the generated chunk plan and runtime signing inputs. This does not require a
Soracloud application service. Provider ingestion uses the separately prepared
directory payload and file map through the approved operator path. Neither
manifest registration nor a requested replica count proves that providers hold
the bytes. Retain provider receipts and verify retrieval before advertising the
CID. The retired storage-pin endpoint is not a fallback.

The reviewed release must pin the network ID, application ID, execution profile,
XOR definition, and finalized height/context in the build. Runtime Torii reports
cannot replace these trust pins. Before enabling stakes, verify:

- Native proof and custody review, full eight-car proving measurements and
  validator costs, and four-validator adversarial/restart tests.
- Advancing Taira finality and the exact qualified native game profile.
- Iroha Connect interoperability with explicit wallet fee caps.
- Declared SoraFS provider capacity, native publication receipt, and repeated
  successful CID reads with matching content and provider retrieval evidence.

Public reads on September 5, 2026 at 13:22:54 and 13:24:41 UTC both reported
block 7 and CommitQC height 7. The explorer still dates block 7 to September 1
at 08:52:10 UTC. Queue size remained 1, saturation was false, and the reported
dataspace backlog was zero. Generic game and NFT capabilities and SoraFS
capacity returned 404; the operator Sumeragi status route returned 401. The
public finalized state carrier for height 7 was downloadable, which alone
does not authenticate its network context or demonstrate advancing finality.
See `output/qualification/taira/readiness-summary.json` and its raw samples.

The existing September 1 native `iroha app sorafs toolkit pack` binary was
also tried locally against the current 22-file build. It exited with a config
error before packing: this installed command requires client configuration
even for local packaging. No credentials were read or generated. Binary hash,
arguments, failure, and the static input inventory are recorded in
`output/sorafs-native-toolkit/pack-attempt.json`. No standalone `sorafs_cli`
executable was found in the inspected warm build directories. No CAR, live CID,
provider availability, or successful deployment is claimed from this attempt.

The current CLI now routes `app sorafs toolkit pack` before client
configuration loading and rejects wallet/configuration/fee globals for that
local command. The same-revision binary built and passed its profile catalog
and retained full-race proof verification. Its dedicated CLI regression tests
remain part of the pending native runtime gate.

Actual credential-free native packaging succeeded on September 5 at 20:18 UTC:
`output/sorafs/japanese-DsOhaMOw-afeca13c/` contains the 22-file Japanese/English
production website, its 23,628,337-byte CAR, 355-byte Norito manifest and native
report with 198 chunks. The exact binary SHA-256 is
`afeca13c98d5aabaa786b3c16cabc0e4d1d89fd6797fe4a4c384fa16a8a1e92a`.
The native directory root CID bytes are
`01711f204b6190e04e1ec931ca7013848f2a613d27a7ee2603058d0f413cb99a037ab53a`.
The wrapper verified all emitted report/file commitments and unchanged input
inventory. Independent native CAR verification passed separately, checking every payload byte, canonical path/container, manifest/chunk/PoR commitments and eight rejected mutations. This
package is local and unpublished, requests three replicas, and has no provider
ingestion payload or availability receipts yet. New builds require new packages.

The same binary's read-only `taira doctor --public-root https://taira.sora.org
--json` completed at 20:18:49 UTC with exit 1. It reported a time-enforcement
mismatch, absent KAGEMUSHA readiness and incompatible MCP discovery/transport
posture; its public queue remained 1. Expected 401 operator-route responses
passed route-presence checks and do not authenticate validator health. This
report does not check all game/SoraFS release gates or establish advancing
finality. Exact report and binary provenance are retained in
`output/qualification/taira/doctor-2026-09-05T20-18-41.817Z/`.


The subsequent build with explicit new-session profile-admission gating is also
packed and natively verified under
`output/sorafs/japanese-CdgLee_d-afeca13c/`. This historical pre-consolidation local package contains:
22 files,198 chunks,23,632,545 CAR bytes,23,602,423 source payload bytes, with
root CID bytes
`01711f200e484bb713cbc9085a5c2b32ffc0f789049dd8825efa12df6fb459c70e9548b4`.
Its independent `verification/native-report.json` confirms exact file inventory,
canonical CAR/manifest and all eight alteration-rejection cases. The earlier
package/evidence is retained. Both packages remain unpublished; a local CID and
native verification do not imply provider availability.

## Initial environment website and actual provider storage

The frozen first-release environment build is
`output/qualification/frontend/GlqbJ_vS/dist`, packaged under
`output/sorafs/first-release-environment-GlqbJ_vS/` using the explicitly pinned
credential-free native Toolkit binary. It contains 22 files, 196 chunks,
24,245,721 payload bytes and a 24,275,597-byte CAR. Native root CID bytes:
`01711f2013d99afcbe1c760ca139db830825f8d50272728c31a5353a0092d3ad7aa0d4b4`.

The actual native provider test
`publication_roundtrip::sora_cars_release_car_roundtrips_real_provider_storage`
passed in 72.65 seconds against this exact frozen directory/package pair. It
reconstructs the native directory plan, verifies the canonical CAR and manifest,
ingests the real payload into persistent NodeHandle storage, checks every file,
chunk and cross-chunk range, and repeats reads after restart. Separate native
provider tests exercise corruption rejection and duplicate admission. Binary
SHA-256, explicit arguments, paths and output are retained in
`output/qualification/sorafs-provider/GlqbJ_vS/`. This demonstrates local storage
mechanics with the actual website. It does not demonstrate a finalized manifest
registration, remote provider ingestion, TLS transport, replica availability or
a live published CID.

The current authenticated provider-source implementation and its governed grant
resolver boundary are qualified separately in the sibling Iroha source. A
requested replica count, successful local CAR roundtrip or single gateway read
cannot replace the network publication and availability gates.

## Frozen audio/environment package

The frozen audio/environment build is `NF89bGDp`, including the Canvas performance and
certified collision-feedback fixes. Its exact source directory and native
package are `output/qualification/frontend/NF89bGDp/dist` and
`output/sorafs/first-release-environment-NF89bGDp/`. The real native provider
roundtrip passed again in 32.92 seconds: 22 files, 201 chunks, 24,248,940 payload bytes
and 24,279,435 CAR bytes. Native root CID bytes:
`01711f20a3d51650b836f62572c188386715db573edbdff7db1dc209d5405496f9124701`.
The pinned provider binary, explicit invocation and exact outcomes are recorded
in `output/qualification/sorafs-provider/NF89bGDp/report.json`.
The earlier package remains historical evidence. This final local storage pass
still does not establish consensus finality, remote replica availability or
publication.

## Current admission frontend package

The subsequent immutable-admission frontend is `C1rl0xqt`, frozen at
`output/qualification/frontend/admission-c6b9/dist`. Native local packing and
provider storage verification pass for that exact directory and
`output/sorafs/admission-c6b9-C1rl0xqt`: 22 files, 199 chunks, 24,307,338 payload
bytes and 24,337,583 CAR bytes. Its root CID bytes are
`01711f20c7acdf56e5949e68f1e98e1035ca7f44392581aad31d3f1adf94880673f97d84`.
Evidence is in
`output/qualification/sorafs-provider/admission-c6b9-C1rl0xqt/report.json`.

This uses the retained native packer and provider test binaries, which verify
canonical CAR/manifest commitments, ingest into real local storage, read every
file/chunk and reopen after restart. It does not qualify the latest full daemon
composition or establish remote availability, finalized grants or publication.
The separate current-daemon runtime suite passes 74 tests; live publication
still requires the remaining gates above.
