# Soundtrack publication qualification

The complete soundtrack is prepared locally, but it is not published or issued.
All 26 recordings have full WAV and MP3 files, previews, corrected SORA covers
and exact license commitments. The user approved the supplied Tokyo recording
under the same license and selected **SORA Cars** as the artist. Its WAV is a
decoded/resampled copy of the supplied AAC, not an original lossless master.
Publication must preserve that full collection.

## October 28: accepted Tokyo title and artwork correction

The current successor is `output/music-release/taira-20261028-yasukuni/`.
It uses **靖國神社で会おう**, the corrected large 神明鳥居 cover without Skytree,
and the three retagged audio files. Encoded audio packets and decoded PCM are
unchanged. All 25 other editions and their atomic instruction arrays remain
byte-identical. The successor passed 426 browser export checks, independent
Rust byte/hash/round-trip verification, and native CLI parsing of its new Tokyo
registration and atomic register-and-offer array. Nothing was signed or submitted.

The final corrected frontend at
`output/qualification/frontend/soundtrack-2026-10-28-yasukuni-final-recovery/` passed
TypeScript/Vite, all 104 packaged music asset checks, and desktop/390px/320px
browser checks. All 920 public files match their built copies byte-for-byte.
The title and artwork were visually inspected at all three sizes.
`artifacts/music-tokyo-correction-2026-10-28.json` binds the current evidence.
These changes supersede the prior Tokyo candidate below; its retained evidence
remains valid for its historical inputs. Live release prerequisites still apply.

## October 28: preceding 26-edition preparation

The unsigned candidate in `output/music-release/taira-20261028/` now uses the
registered seller, `soracars.universal`, artist/licensor **SORA Cars**, and exactly
1 XOR per edition. It includes the Tokyo song under the user-approved license.
The application identity is a publisher-selected opaque namespace, not an
on-chain application registration. No release flag or application network pin
was changed.

The production browser catalog/export path verified all **105 distinct files**
(104 music assets plus the license) and prepared all 26 metadata/offer records.
A separately compiled Rust model verifier then matched **52 exact byte strings**,
**52 content/offer hashes**, and **52 decode/re-encode results**, and passed
**78 negative controls**. All 26 metadata JSON files matched the export. The
native CLI also emitted all 26 NFT registration instructions offline without
signing or submission. Evidence:

- `output/qualification/music-browser-export-2026-10-28/report.json`
- `output/qualification/music-rust-parity-2026-10-28/report.json`
- `output/qualification/music-native-emission-2026-10-28/report.json`

These checks exposed and resolved a real checkout bug: the SDK renders decoded
account IDs with a different display prefix from the Taira seller. Account
authorization now compares canonical controller bytes while retaining exact
network, offer commitment and wallet-session checks. Checkout shows the reviewed
Taira seller. **122 browser checks and TypeScript passed**, including all 26
real candidate metadata records, malformed/different accounts, wrong networks,
download ownership, reserved buyers and Connect session invalidation. See
`output/qualification/music-account-identity-fix-2026-10-28/report-inventory.json`.
The final 19 controls cover the owned-inventory adapter: mixed-prefix pagination,
malformed rows, other owners/domains, duplicate IDs, cursor and item limits, and
in-flight invalidation after reconnect. The SDK's existing bounds remain intact.

The current frontend at
`output/qualification/frontend/soundtrack-2026-10-28-current/dist` passed the
production TypeScript/Vite build and static checks at 1440px, 390px and 320px.
All **920 public files** matched their built copies byte-for-byte; all 104 music
assets, 26 sleeves, route transitions and selected preview controls passed.
The screenshots were opened and inspected. No external request, browser error
or missing file was observed. Build/report/source inventories and visual review
are retained alongside that output. Release flags and network pins remain at
their reviewed defaults; this local build does not enable sales.

The original Node exporter remains unavailable: its source-matched Cargo build
completed, but the mandatory native addon publication probe exceeded its
120-second limit. The previous addon and its provenance guard were preserved.
Standalone Rust parity does not constitute Node addon publication or marketplace
rollout qualification.

The supported main native CLI provides a separate issuance path. All **26 full
framed OfferNftV1 instructions** now match independent Rust construction, typed
terms and JSON-array/decode round trips. The exact CLI parsed and re-emitted all
26 offer arrays and **26 ordered Register NFT → Offer NFT arrays**, with 78
malformed-input rejection controls; the Rust verifier passed another 78 controls.
The atomic templates are under
`output/qualification/music-offer-instructions-2026-10-28/atomic/`.
Their hashes and source binding are retained in that directory's `report.json`
and `atomic-bindings.json`. Root independently checked every template/source
hash, instruction order and browser/Rust binary equality.

The descriptive offer object in the original candidate is not direct CLI input;
these verified arrays contain full Norito-framed InstructionBox strings. The
CLI supports a durable `tx prepare` → `tx submit` → `tx resume` workflow after
the live prerequisites are met. Its preparation step quotes and signs, so none
of those steps was run here. The optional Node exporter failure is therefore
not an inherent blocker for this native CLI path. Actual generic signed
issuance, atomic execution and live listing readback remain unverified.

Live release is still unavailable. At **06:13:50–51 UTC on October 28**, Taira
reported `qualified: false`. The selected origin returned zero configured
storage peers, no gateway, and HTTP 404 for the capacity route. That does not
prove there are no providers elsewhere, but it supplies no usable publication
target. The exact readback is
`output/qualification/music-publication-path-2026-10-28/public-readback-20261028T061351Z.json`.
The owner has been asked for an approved provider ID and upload/gateway endpoints.

The full **931-file, 2,563,048,355-byte** October 23 frontend packed successfully
with the retained native streaming tools in **1,075.99 seconds**, with an observed
maximum resident size of **198,770,688 bytes**. All frozen input, selected native
source and binary hashes remained unchanged. The first attempt
hit the wrapper's fixed ten-minute deadline. The wrapper now assigns a bounded
budget by payload size (30 minutes for this payload), with ten passing focused
tests. The independent verifier's original process disappeared without a terminal
receipt; the controller and native process were confirmed absent before resuming
that stage in a separate retained log. Packing was not repeated. The resumed
verifier passed at **04:41:40 UTC** after **1,292.33 seconds**, with an observed
maximum resident size of **100,057,088 bytes**. It matched all **931 files**, the
**2,565,767,696-byte CAR**, all **20,228 chunks**, the root CID and manifest/PoR
commitments. Frozen inputs, selected native sources, binaries and package files
remained unchanged. The real local provider test **passed at 06:22:20 UTC**,
after **6,029.80 seconds**, with observed maximum resident size **164,134,912 bytes**.
It exercised exact-capacity admission, complete file/chunk/archive readback before
and after reopening storage, proof sampling, and rejection of corrupted data.
The controller confirmed exit 0, parent reaping, unchanged frozen inputs,
selected native sources/binaries and package bytes. All three terminal command
receipts and six log identities were independently checked. The final report is
`output/qualification/music-publication-path-2026-10-28/local-full-payload-scaled/report.json`;
the public summary is `artifacts/music-provider-local-qualification-2026-10-28.json`.

This qualifies the **historical October 23 full payload locally**. Its fixture
manifest has expired retention epoch `86400` and must never be registered.
It does not qualify the latest configured frontend, consensus, finalized
provider assignment, remote availability, gateway routing, NFT issuance or a
purchase. With that local test complete, further release work requires the
qualified marketplace and approved publication provider described above.
See `artifacts/music-release-blocked-2026-10-28.json` for the remaining work.

## October 28: artist account registered and funded

The retained **SORA Cars** identity is now registered on SORA Nexus Taira and
funded with **25,000 testnet XOR**. The current main-checkout native CLI verified
the faucet envelope, submitted those exact bytes once, and reported `Applied` at
block **5507**. Independent native MCP account, balance and transaction reads
confirmed the result at **02:55:55 UTC**. Transaction:
`883fc275155ad83f92f39556994a9aafba151a75723cd7146a8310661dcd1c89`.

The working executable is `/Users/takemiyamakoto/dev/iroha/target/debug/iroha`,
SHA-256 `169b93433d9ba89a0c07819d7b1abaef3aef2b0fc4034b0e74d1976864d4b967`.
The older routine executable's decoding failure is resolved for this operation.
The newer game-checkout release executable still lacks the ordinary faucet
command; its timestamp alone did not establish support.

Account details and the unchanged signing key are retained in the owner-only
directory `/Users/takemiyamakoto/.config/sora-cars/accounts/taira-sora-cars-20261023`.
Its `account.json` and `README.txt` now record registration and funding. The
[public registration receipt](../artifacts/music-artist-account-2026-10-28.json)
binds native preparation/submission and independent readback evidence. No private
key is included in repository evidence. No artist account alias was created.

The subsequent collection setup registered **`soracars.universal`** to the same
seller through the native paid `EnsureAlias` workflow. The live one-year quote
was **0.5 testnet XOR**, with a separate **0.0074 XOR** transaction fee. Transaction
`9ca9343db51233b01d2eb590660e32df5dbb956fd7a1a6e1308dced08f8eabc9`
was applied at block **5508**. Independent domain and active SNS registration
readback confirmed seller ownership; the lease expires **2027-10-28 03:03:41 UTC**.
The remaining observed balance was **24,999.4926 testnet XOR**. The
[collection authority receipt](../artifacts/music-collection-authority-2026-10-28.json)
binds the quote, submitted plan and readback. The public collection configuration
is `output/music-release/taira-20261028/collection.json`; it grants no ownership
by itself and does not enable purchases.

Live NFT sales remain unavailable. The public market reports `qualified: false`,
and the application release network pin remains unchanged. The account's
effective permission query returned an empty list; the later domain ownership
readback establishes collection ownership but not publication authority.
Qualified release identities, issuance,
publication and a verified real purchase remain outstanding. These account
checks do not rerun or supersede the historical frontend/media checks below.

## October 24 continuation (historical, Japan time)

Public ingress recovered: `/status` and `/v1/accounts/faucet/policy` returned
HTTP 200 at October 23 **16:44 UTC**. Two status observations showed height 625,
an empty queue and no dataspace backlog; those samples alone do not establish
continuing block advancement. Native MCP discovery succeeded, and its account
lookup returned an inner HTTP 404 for the retained SORA Cars address. The
alias-onboarding route requires a dedicated operator token, while the server
also exposes an ordinary faucet preparation/submission flow.

Registration remains unfinished. A subsequent bounded attempt used the existing
routine CLI and the public faucet policy from the exact endpoint selected by the
user. The executable requires an older, otherwise-unused `account.domain` field;
supplying it resolved configuration admission without changing the saved account
or registering an alias. At **17:01 UTC** the native client rejected the prepared
transaction with `decode fixed-V1 prepared SignedTransaction wire: Norito
(de)serialization issue: invalid enum discriminant`. Native signature and
instruction verification therefore did not complete. The journal contains only
a lock file, and no transaction was submitted. See
`artifacts/music-registration-attempt-2026-10-24.json`.

The current JavaScript native runtime also lacks the two functions its maintained
faucet helper needs for binding and signed-envelope verification. Registration
requires a compatible native client/deployment; raw submission cannot substitute
for the failed verification. The concurrently active native build/test lane was
left unchanged. Public evidence is in
`output/qualification/music-issuer-account-2026-10-24/`; the new account status is
`artifacts/music-artist-account-2026-10-24.json`, supplemented by the attempt
receipt above. The private identity is retained.

The market still reports `qualified: false` with the same network identity that
differs from the application's retained pin. The previous 502 outage is no longer
the current registration blocker. Real registration, qualified issuance and
publication remain required; the goal is incomplete.

## October 23 expanded collection

The [26-recording preflight](../artifacts/music-release-preflight-2026-10-23-tokyo.json)
pins the current catalog, account preparation, production freeze and browser
receipts; release readiness remains false. The build at
`output/qualification/frontend/soundtrack-2026-10-23-tokyo/dist` passed TypeScript
and Vite with unchanged source inputs. All 920 public inputs match their built
bytes; 931 output files total **2,563,048,355 bytes**. The static storefront run
passed all 104 music assets and desktop, 390px and 320px checks at **14:45:04 UTC**.
The current suites passed 15 focused tests, 53 marketplace checks, 38 launch
checks, 18 storefront groups and all 26 preview/full-duration checks. Tokyo's
WAV, MP3, artwork and license downloads passed exact-byte verification in the
explicit simulated-wallet fixture. These tests establish local application
behavior, not real issuance or settlement.

The requested artist identity and signing key are saved outside the repository
in an owner-only account directory; the public record is
`artifacts/music-artist-account-2026-10-23.json`. Registration has not occurred.
At **14:44:58–59 UTC**, public `/status` and faucet-policy reads returned HTTP 502;
the earlier onboarding readiness read also returned 502. No registration or
funding transaction was submitted. Reuse the retained identity when registration
is available. The application network pin remains unchanged, and the earlier
native issuer and market qualification gaps remain unresolved.

The expanded build is unconfigured, unpublished and unissued. The historical
September storage result below does not qualify this larger payload. A current
configured release still needs full-payload native packing/verification,
provider admission/restart/readback, remote publication/retrieval, real 1-XOR
offers and a verified wallet purchase and NFT delivery.

## Earlier October 23 release observations

The [consolidated preflight](../artifacts/music-release-preflight-2026-10-23.json)
pins the earlier 25-track build and check receipts; it predates the Tokyo addition.

The rebuilt frontend at
`output/qualification/frontend/soundtrack-2026-10-23-current` includes the final
artwork and mobile-checkout CSS correction. Its `freeze.json` records TypeScript
and Vite exit 0, unchanged source inputs, all 916 public inputs copied
byte-identically, and 927 output files totaling **2,504,553,834 bytes**. The final
static storefront run passed all 100 packaged music files and all three
viewports at **13:56:18 UTC** (`artifacts/music-static-2026-10-23/report.json`).
All 17 storefront fixture groups, 52 browser protocol checks and 25 browser
preview decodes with full-MP3 duration checks also passed that day; see
`artifacts/music-store-browser.json`, `artifacts/music-market-browser.json` and
`output/audio/soundtrack/browser-playback.json`.

This local build remains unconfigured and unpublished. The September 26
storage qualification below covers a different **1,487,166,105-byte** frozen
payload; it does not qualify this larger current build. The configured release
still needs native packing, independent verification, full-size provider
admission/restart/readback and remote publication/retrieval. No current storage
package, live issuance or real purchase is established by these frontend checks.

Anonymous reads at 13:43 UTC returned HTTP 200 for `/status` and native-market
capabilities, but the market reported `qualified: false`. Its observed network
`hash:4978D0BD15FC32B834672B27BBD8A03653B1DF060A1EEE7E9374D29AF3886D91#6774`
differs from the retained reviewed pin
`hash:0466DA18C70CA8CBD51B8CC60B1D4A4802FC5D7F928D505806D7CD6CB61D60EF#BA85`.
The observed identity has not been adopted. The capacity-state route returned
HTTP 404; neither that response nor the successful status reads establishes
remote storage availability. See `artifacts/music-release-public-read-2026-10-23.json`.

## September 22 full-build attempt

The isolated production build passed the three-viewport static test and all 100
music file hashes. It was copied and compared byte-for-byte before native packing:

- Frozen build: `output/qualification/frontend/soundtrack-92d67099-isolated/dist`.
- Inventory and control identities: the adjacent `freeze.json`.
- 444 files; 1,487,166,105 payload bytes; 100 catalog-bound audio/cover files.
- Actual attempt: the adjacent `pack-attempt.json`.
- Static browser evidence: `artifacts/music-static-package/report.json`.

The retained credential-free native packer, SHA-256
`afeca13c98d5aabaa786b3c16cabc0e4d1d89fd6797fe4a4c384fa16a8a1e92a`,
exited with status 1. Its eager directory planner encountered 548,092,773 bytes
while traversing the input and rejected the 536,870,912-byte limit. The complete
input is larger still. That attempt accepted no CAR or manifest and produced no
provider receipt or published CID. This is a limit of the retained local
packing path; it does not establish a network-wide SoraFS size limit.

The earlier independent CAR and provider-roundtrip verification harnesses each
cap CAR input at 64 MiB. Their historical passes on a smaller site cannot qualify
this collection. Neither cap was weakened, and no sibling native source or build
was changed. An initial attempt to freeze shared `dist` raced another build;
its incomplete copy was retained separately, then an isolated output directory
was built and tested for the actual attempt above.

## Remaining release work

The isolated Toolkit path now packs and verifies the complete frozen directory
with bounded payload reads; the September 26 results below qualify that local
path and full-size local provider admission, restart and readback.
This does not qualify every native publication path: the separate
manifest-builder source still starts with the eager directory planner.

Create a release build with the current artwork and checkout fixes plus
real reviewed release identities, then pack and verify
every file against its authenticated input inventory, then
perform native manifest registration, provider ingestion and repeated retrieval.
Storage tests must exercise this full payload and restarts; local packing or an
HTTP success alone does not prove remote availability. Keep the WAV files,
individual artwork and music scope intact.

The owner resolved the earlier account and artist questions by authorizing a
fresh, privately retained SORA Nexus Taira account and selecting **SORA Cars** as
the artist.
Account preparation does not establish registration, collection/domain authority
or a released seller/licensor binding. Those bindings and the application, XOR,
network and market-profile identities still require verification before issuance.
Editions must then be issued and listed at 1 XOR, and a real wallet purchase must
be observed through exact NFT delivery and download. The 13:43 UTC HTTP 200
responses described above are historical observations, not current health checks;
their unqualified market and network-pin mismatch did not establish readiness.

The installed issuer SDK still fails its native source-provenance admission.
The focused Node market test was rerun on October 23 and exited 1 at 13:44:54 UTC
before assertions with `ERR_IROHA_NATIVE_BINDING` / `source_provenance_error`.
All ten observed source/manifest hashes were unchanged; see
`output/qualification/music-node-revalidation-2026-10-23/command.json` and logs.
Resolving that requires the coordinated native build lane; browser adapter tests
do not certify the Node issuer runtime. No provenance guard is bypassed.

## Native integration handoff

The [source-pinned implementation map](../tmp/music-native-release/native-streaming-map.md)
identifies an existing generic offline node planner with 16 GiB/4,096-entry
contracts that can be shared with Toolkit. The required path includes streaming
planning, source ingestion and CAR writing, followed by independent canonical
file-backed verification. ChunkStore's existing memory accounting remains in force.
The current HTTPS provider-source corridor separately retains an entire payload
and caps it at 64 MiB; full-size delivery through that corridor also needs a
verified spool with preserved quotas, deadlines and lease checks.

During the initial audit, the active native qualification was confirmed running,
so its frozen checkout was not modified or rebuilt. The map records the exact
integration and qualification scope for a coordinated immutable native base.
That read-only analysis did not itself establish implementation or full-size
qualification; subsequent isolated implementation evidence is recorded below.

Initial NFT release coverage has its own check:
`npm run check:music-launch -- <endpoint-snapshot.json>`. See `docs/music-market.md`
for the exact public snapshot shape and scope. The initial, historical run passed
37 browser/CLI checks over the original 25 catalog bindings. The expanded October
23 collection passed 38 launch checks for 26 recordings, as recorded above. A
real launch snapshot, qualified Node issuer runtime and actual signed issuance
remain outstanding; the local fixture checks establish none of those outcomes.

## Isolated streaming implementation candidate

A nine-file native source overlay is now prepared at
[`tmp/music-native-release/streaming-candidate`](../tmp/music-native-release/streaming-candidate/README.md).
Its frozen patch SHA-256 is
`44bd267fae4d30201f977aee1145532fbebe81ec4e154c3b4776b876cef28967`.
It shares bounded directory planning, streams Toolkit output through temporary
files, and adds exact known-source CAR verification plus a command example for
the full directory. Both packing and verification finish the CAR writer before
constructing retained PoR metadata. Existing resource limits remain enforced.

Independent source review and pinned Rust 1.93.1 formatting pass. The patch
applies to an isolated preimage tree and reproduces every recorded postimage.
The 25 final cover hashes were also rechecked unchanged. Evidence is in
`artifacts/music-streaming-candidate-review.json`.

That first review is historical. A complete source snapshot was subsequently
copied into the detached worktree
`/Users/takemiyamakoto/dev/iroha-sora-cars-music-streaming`, with its own persistent
Cargo target and native jobserver. The original checkout, sources, target and
running qualification were left untouched. The source snapshot and command
receipts are under `output/qualification/music-streaming-build-lane/`.

Revision 2 fixes the verification example's Norito JSON construction. Its patch
SHA-256 is `8cec2346dc7da78361cd87fb1f9df0083415e249435f352da73d5acd1ff043a3`.
Executed checks now pass: 18 normal planner/reader tests, both expensive planner
tests, 17 known-source verifier tests and two example tests. Each command's
before/after full source inventory matched. The expensive cases include a
512 MiB-plus-one-byte streamed file and rejection of excessive ingestion metadata;
they do not qualify the actual 1,487,166,105-byte release.

The provider overlay and its explicitly registered test target are applied only
to the isolated worktree. All 10 normal provider tests passed, including native
storage, restart, corruption and bounded scheduler retry cases; the separate
full-size fixture result is recorded below. All 21 Toolkit tests
also pass, including canonical directory output, staged failure cleanup, source
mutation and output-collision rejection. The first regular executable build was
interrupted without a terminal receipt; its source inventory stayed unchanged,
and it resumed in the same persistent target under a detached supervisor.
The resumed build completed successfully with an unchanged source inventory.
Its retained packer SHA-256 is
`717a5c5c22ab1ad728b147bda662e1be9db6dd4f6829f5cd8689b1ffd7760206`.
The combined Cargo target selection produced the packer but did not leave the
regular verifier example. Its separate explicit build subsequently succeeded;
the retained verifier SHA-256 is
`5044e20f8e50b02b212f4b474d0f2980b07cc6672acb4b49588fd23017f7628c`.

## September 26 full-size local pack and verification

Both commands completed successfully with parent-reaped exit status 0 and
unchanged full native source inventories. The pack finished at 00:49:37 UTC;
the separate verifier finished at 00:57:17 UTC. Receipts, exact commands and logs
are in `output/qualification/music-streaming-build-lane/full-build-pack-1/` and
`output/qualification/music-streaming-build-lane/full-build-verify-1/`.
Their recorded SHA-256 values for stdout, stderr and source inventories were
recomputed and matched. The two source inventories share SHA-256
`06c96a447f980adf4e133b5f5ea80bf291cc5b4da320e8f78e4a5a3c444f7676`.

The complete package is `output/sorafs/soundtrack-streaming-full-1/`.
Its `soundtrack-freeze-binding.json` binds the retained packer, wrapper, pack
control and September 22 input freeze. Those identities were rechecked, all 444
frozen files were rehashed, and the packaged inventory matched every input path,
size and SHA-256. A separate streaming BLAKE3 read of the actual CAR and manifest
also matched their reported identities. Native packing and verification reports
agree on:

| Item | Verified result |
| --- | --- |
| Input files | 444, including all 100 catalog-bound music files |
| Payload bytes | 1,487,166,105 |
| CAR bytes | 1,488,725,912 |
| Chunks | 11,700 |
| Manifest bytes | 355 |
| CAR BLAKE3 | `49e49cb5db3611762cc8df43d09ad457d99c2ffb0d9ae52428eca09b18101455` |
| Manifest BLAKE3 | `1dca8ee1a8461fcd324f9c1fc76f1a53762e553bb334e1e93a4b8de27b9e552e` |
| Native root CID hex | `01711f20dd645c575c93cb4276dffe2cad780678c855c7d2ef73a9ecf8452fd853234c92` |

The recorded runtime maximum resident set sizes were **230,703,104 bytes** for
the pack workflow and **61,243,392 bytes** for verification. These are actual
`/usr/bin/time -l` command observations, separate from compiler memory and not
a universal memory bound for other inputs or platforms. Supervisor elapsed times
were 326.85 seconds and 416.04 seconds, respectively.

The verifier reconstructs the canonical CAR from the retained known source and
compares its complete bytes, then checks manifest, chunk and PoR commitments.
It is a local known-source verification path, not an independent remote CAR
parser, registry authorization, ledger finality or proof of subsequent reads
from mutable files. Its report explicitly sets publication and provider
availability to false; requesting three replicas does not establish that any
provider holds the data.

This package intentionally preserves the **September 22 frozen frontend**. It
predates the latest story-art logo mapping and has no live release configuration.
It is a full-size qualification fixture, **not the final publication build**.
No manifest registration, remote provider availability,
website publication, NFT issuance or sale is established by these local results.

## September 26 full-size local provider result

The retained native provider test passed at 02:07:13 UTC with exit status 0,
parent reaping and an unchanged full source inventory. The receipt and logs are
in `output/qualification/music-streaming-build-lane/full-build-provider-1/`;
`full-build-provider-1-verified.json` records the controller's independent
post-run checks of all 444 frozen inputs, package files and retained executable.
The retained provider executable SHA-256 is
`7c57974bb34323b3f42bf3ad2c40263211b23846e647952f05f4322620f6fa1e`.

The actual production storage backend admitted the complete 1,487,166,105-byte
payload under an exact-size disk quota. Before and after restarting the provider,
three bounded-memory passes compared every file, every chunk and the reconstructed
canonical CAR against the retained source/package. The test also checked an
undersized quota, corrupted admission and reservation rollback, duplicate
admission, the three-reader allowance, PoR samples, corrupted stored-byte reads
and rejection of corrupted storage on restart. Default production scheduler and
memory limits remained in force.

One full-size test passed, with zero failures or ignored tests in this invocation.
Supervisor elapsed time was 3,111.43 seconds. `/usr/bin/time -l` recorded
84,754,432 bytes maximum resident set size for this runtime; this measurement is
specific to this fixture and platform. The frozen frontend still predates the
latest artwork and lacks live release configuration. Local provider success does
not establish consensus, finalized assignment, remote availability, gateway
routing, website publication, NFT issuance or a purchase.
