# SORA CARS

A Japanese arcade racing game for SORA Nexus, built with TypeScript, Vite and Three.js, with Canvas for the HUD and compatibility rendering. The SORA flag appears on the cars, trackside signs and menus. Nine original sequenced synth-pop compositions play locally and are included as downloadable MIDI files.

Arcade and Tokyo street races share a real 3D scene with detailed period AE86s,
scanned road and building materials, dimensional roadside vegetation, HDR
lighting, shadows and contact shading, lit for the cutscenes' violet dusk,
amber lamps and damp roads. **Settings → Picture → Pixel finish** (on by
default) finishes that scene with the pixel-art race renderer, so the race is
drawn like the story illustrations: about 560×315 hard-edged art pixels (the
short side is always 315), a 128-colour palette taken from the cutscene
artwork, drawn outlines, rims and glints, small colour-ramped lamp glows and
dashed wet-road reflections. Rain and speed lines follow the same grid. Turn
Pixel finish off, or add `?picture=clean`, for the clean display-resolution
render; `?picture=pixel` forces the pixel art for one visit without changing
the saved choice. With Pixel finish on, `?render=regions`, `?render=grouped`
and `?render=cinematic` show the earlier finishes for comparison. The HUD
stays sharp in every mode. Design, debug switches, measurements and known
limits are in [the pixel-art renderer notes](docs/pixel-art-renderer.md).
Vehicle attribution and source details are in
[the AE86 provenance](public/assets/models/sora-ae86/PROVENANCE.md).

Japanese is the primary interface language. English subtitles accompany the
menus, story dialogue, wallet prompts and race controls. Japanese fonts are
bundled with the site, including for offline practice.

Tokyo's **暁の街道 / Road to Dawn** practice route now follows five authored
jo/ha/kyu chapters in the supplied soundtrack. Japanese titles with English
subtitles introduce changing pixel skies, street reflections and the SORA sunrise.
Music follows simulation time across pause, mute and replay seeking, without
stretching or looping the recording. These creative cue times do not establish
historically accurate scenery or calibrated human race duration.

## 物語 / Story

Japan, 1986. Aki Soramoto and the SORA Motor Club follow the paper trail behind
a threat to their workshop. Twelve chapters across three acts bring six friends
and three rivals into a fictional struggle over credit, redevelopment and who
gets to decide a neighborhood's future. The events currently use the three
implemented circuits; the 49-location expansion remains separate work.

Choose **物語 / STORY** for Japanese dialogue with English subtitles, changing
pixel-art scenes, animated radio equipment, rain, reflections and camera shots.
Enter/A advances dialogue; Left returns to the previous line; L opens the dialogue
log; P pauses scene motion; Escape closes the log or skips the scene. Cleared
chapters add clues to the workshop file. Podium finishes unlock chapters; the
harbor showdown also requires finishing ahead of Toru Amamiya. Results offer a
chapter retry and, when unlocked, the next chapter. Local progress does not mint
NFTs or move XOR. Each chapter now has an optional **工房の寄り道 / Workshop
pit stop** with its own crew conversation and recommended design. Visit from
the story menu or results, browse the NFT garage, then return to the chapter.
The chapter context survives reload at `#/shop/story/0` (chapter numbers are
zero-based). Checkout uses the existing Iroha Connect purchase path, displays
the pinned network, buyer, exact XOR asset and price, and a separate fee cap.
A transaction receipt does not grant ownership: fresh wallet inventory must
list the NFT before it can be equipped. The default development collection is
unconfigured; live purchases require the qualified native market release.

The story and its illustrated institutions are original fiction. Historical and
thematic sources, art prompts and validation limits are in
[the campaign design](docs/story-campaign-design.md).

The collectible garage includes six crew-designed NFT liveries and two visual
kits, with exact-price XOR purchase review and optional explicit NFT race stakes.
Current RaceV1 competitive physics retains equal performance. Native market/item
custody and wallet integration are implemented; native runtime, deployed wallet
interoperability and separate performance upgrade classes remain open gates.

## 証明 / Proof workshop

Choose **証明 / PROOFS** (`#/proofs`) for an animated Japanese/English walkthrough
of traces, constraints, finite-field interpolation, commitments, Fiat–Shamir,
FRI folding and settlement finality. Alter a claimed position, change the folding
coefficient and inspect or download the exact teaching values. Animation pauses
and respects reduced-motion preferences; keyboard arrows navigate the steps.

The F17/SHA-256 examples are educational, not native proofs. The page explains
Goldilocks/Fp4, Poseidon2, DEEP linking, range constraints and the unqualified
security target separately. Its download is explicitly a teaching bundle and
cannot be used to settle a race. See [workshop mathematics](docs/proof-workshop.md)
and [independent settlement verification](docs/finalized-settlement.md).

The native street computation has a [documented bit-reference baseline](world/native/STAGED_CONSTRAINTS.md)
with fixed polynomial, carry and public-boundary checks. Shared exact ROM
equations and constant substitution reduced that baseline's eight-car trace
projection by 58.5%. STARK security, cost and deployment qualification remain open.

Start with the [cryptography review through September 26, 2026](docs/research/2026-09-26-cryptography-update.md)
for the current research shortlist and native implementation priorities. It
covers accumulation, authenticated lookups, BitZ, ReedWeave and concrete
composition requirements, distinguishing published results, preprints and
qualified implementation evidence. The [earlier September briefing](docs/research/september-2026-briefing.md)
retains the background to those decisions.

The latest [native verifier-resource qualification](output/qualification/native-verifier-resources-attempt-1-root-review.json)
passes 119 selected Core tests. Its two-car, six-tick case contains 13 logical
components in three proofs, totaling 2,788,728 proof-stream bytes. This is 0.2
simulated seconds, not a full race or an admitted settlement envelope. The
historical measurements below belong to their respective source versions and
builds; they do not describe the current proof format or establish a speedup.
Full-duration proving, the complete security argument and Street ledger
admission remain open.
The [matching CLI qualification](output/qualification/native-final-cli-sdk-attempt-1-root-review.json)
also passes seven CLI tests and all 24 command outcomes, including independent
verification, a fresh prove/verify round trip and expected malformed-input
rejections. This does not qualify browser finality or funded settlement.

The resulting [native equality-table experiment](world/native/NATIVE_EQUALITY_EXPANSION.md)
passes five parity/bounds tests and compares 84 timing samples. Its roughly 2×
kernel improvement is not a whole-prover speedup or an admitted profile change.
The [complete proof comparison](world/native/NATIVE_EQUALITY_PROOF.md) now validates
the simpler loop in two laboratory helpers: 67 selected tests, seven proof cases,
exact proof/receipt parity and nine expected rejections. The follow-up
[prepared-source comparison](world/native/NATIVE_MEMBERSHIP_CACHE.md) passes 90
selected tests and preserves all seven proof files. Its single paired eight-car
observation changes proving from 279.8 to 253.2 seconds and verification from
113.3 to 83.6 seconds by reusing immutable circuit preparation. Proof size stays
10.83 MB for six ticks; full-race scaling and composed security remain unqualified.
The subsequent [compiled-sequence reuse](world/native/NATIVE_PROVER_REUSE.md)
removes duplicate construction in the accepted-history prover. All 94 selected
tests, seven exact proof comparisons and nine expected rejection checks pass.
Whole-process timings are mixed: the eight-car pair improves from 247.0 to
236.4 seconds, while the two-car candidate is slower. Source-hash work halves;
these single observations do not establish a general speedup.

The next [native producer integration](docs/native-execution-retention.md)
retains the exact certified write-set during real Iroha replay and persists it
with its carrier. Six producer/reopen tests and sixteen storage, handoff and
consensus regressions pass across matched production sources, along with the
final Core check. It runs in an isolated native worktree. The authentic Start
uses native RaceV1; shared Street semantics, proof-consumer integration and
settlement remain separate requirements.

The [shared Street contract candidate](docs/native-street-contract.md) now
centralizes scalar bounds, genesis and control metadata in native code and
dispatches initial checkpoints through the compiled application. Its Core
build, 63 focused native tests and 73 exact graph/replay comparisons pass,
including the 8,462-tick drive. Street remains unregistered; complete verifier
and settlement integration are pending.
The separate [retained-evidence audit](output/qualification/native-street-contract-attempt-5/audit.json)
confirms these counts, source identities and replay framing without repeating
native execution.

The [native contract in accepted-history verification](docs/native-street-accepted-contract.md)
now uses actual Core Street control, state, prefix and ranking checks. Its current
Cargo build, 74 tests, eight fresh proofs, six positive verifications and six
expected rejections pass. The eight-car six-tick fixture produces 10.84 MB in
234.13 seconds; full-duration resources, profile-family admission, finality and
settlement remain unqualified.

The [native Street compiler](docs/native-street-compiler.md) now owns the checked
arithmetic, guarded-proof modules and closed Tokyo catalog inside Iroha Core.
Its initial production build and all seven 2–8-player comparisons passed with
complete descriptor, relation-binding, genesis and layout equality. Start and
settlement now pass the complete immutable admission to the registry. All 235
selected native tests passed in that initial lane. Street profile registration, compact full-race proof
transport and complete ledger-verifier integration remain open.

The subsequent [native owned-program and accepted-execution integration](docs/native-street-owned-sequence.md)
passes production checking, 247 Core tests and its separate evidence audit.
Three local fixtures generate and verify 15 fresh proof components through the
native accepted-history adapter. Its two-car, six-tick case still needs
6,612,732 proof bytes, exceeding the current envelope. Street remains
unregistered; full-race scaling, authenticated ledger context and composed
security are not qualified by these small cases.

The [native finalized-record integration](docs/native-finalized-execution.md)
passes production checking and 51 focused tests. A real Race Start retained by
Kura now passes through the native finality and complete-record readers. A
separate synthetic finalized Street record is bound to a genuine 251,052-byte
proof; wrong revisions, malformed proofs and poisoned reuse reject. These
checks establish the local producer/reader and computation associations with
distinct fixture scopes. Full Street lifecycle, compact full-race proofs and
security qualification remain required before registration or live settlement.

The next [native public bundle and CLI](docs/native-public-game-bundles.md)
integration adds shared Data Model wire types, compiler-owned public-data
proving and independent finalized verification. Production builds, 99 selected
native tests and 13 separate CLI jobs pass. The two-car six-tick proof is
6,625,779 bytes, so compact full-race proofs remain open. These offline bundles
do not change the admitted proof envelope or register Street.

The [native Kura replay exporter](docs/native-street-producer-bundle.md) now
connects an actual signed Street deadline transition to retained replay data,
native proving and separate CLI verification. Production checks, 32 selected
tests, 10 CLI outcomes and an independent audit pass. The case starts from a
synthetic zero-value prestate and covers an all-forfeit boundary with no driving.
It qualifies this export path, including Kura reopening, while admitted Street
lifecycle, committed State restart and full-race settlement remain open.

The [native proof-worker command](docs/native-proof-worker.md) now stages public
replays, runs the fixed native prover and independently verifies its output
before publication. Three builds, 34 selected tests, 16 CLI outcomes and an
independent audit pass, including SIGINT/SIGTERM cleanup and exclusive spool
ownership. This qualifies the local operator job on macOS. The subsequent
[native HTTP service and SDK](docs/native-proof-http.md) pass 63 native tests,
32 SDK tests and actual public replay upload/proving/download with independent
CLI verification. The browser record office at `#/prove` now uses canonical
request/replay files, independent trust settings and streamed verification-folder
exports. Eight actual Chromium/native scenarios and separate CLI verification
pass for the zero-motion fixture. Public resource containment, complete live
proof-to-settlement integration and full-race/security qualification remain
open. See the [browser workflow and evidence](docs/proof-worker.md).
The [SDK account-encoding repair](docs/native-sdk-account-encoding.md) is followed
by [primary browser account admission](docs/browser-account-admission.md): 227
focused SDK tests, 72 actual Chromium checks and four local Connect UI scenarios
pass. The browser constructs canonical transactions and verifies signatures
locally; deployed wallet interoperability remains a release requirement.
Current native Stock and [Touring artifacts](docs/native-touring-export.md) now
match their separate compiled relations. Touring has real native CLI exports
and exact full-duration browser parity. The current application suite passes
[298 tests with no skips](output/qualification/stock-replay-app-suite-attempt-1/report.json);
the production build and earlier Chromium controls/audio/contact checks also pass.
Live stakes remain disabled pending proof, settlement and release qualification.

The [generic native Torii replay export](docs/native-torii-replay.md) and browser
source are now implemented and under qualification. Independent request pins
and explicit public evidence select exact retained records; a complete download
is staged on disk before reserving the proof worker. Local practice JSON cannot
substitute for native ledger evidence. This transport work changes no admitted
proof parameters or live-stakes gate.

The [September 8 cryptography update](docs/research/2026-09-08-cryptography-update.md)
extends the [September 7 survey](docs/research/2026-09-cryptography-review.md) with
recent proof, memory and soundness research against the latest operand census.
It records native backend comparisons and primary sources; it does not qualify
a new proof backend or enable live settlement.

The [September research follow-up](docs/research/crypto-2026-september-update.md)
adds LiftWHIR, September folding and coding-theory revisions, current security
corrections, and an implementation priority list against the measured
[two-phase native membership proof](world/native/NATIVE_MEMBERSHIP.md).
Its eight-car proof is 1,186,540 bytes and takes 62.112 seconds to prove in the
retained CPU run. It covers one tick; extraction, full histories and composed
security remain unqualified.

The [native design research review](docs/research/crypto-2026-native-design-review.md)
checks those developments against the newer sequence and closure measurements.
It adds Celer and projective sumcheck, distinguishes conditional benchmark
security, and calculates an illustrative error budget for a full execution.

The [dated cryptography adoption decisions](docs/research/crypto-2026-adoption-decisions.md)
add FACS, ERA codes and holography accumulation to the comparison, recheck
September 2026 coding/security results, and connect them to the latest guarded
history baseline. Its recorded compiled-relation and archived-outcome findings
motivated the subsequent [accepted-history bridge](world/native/NATIVE_ACCEPTED_HISTORY.md).
That laboratory documents the implemented checks and current evidence separately
from the dated research review. Research candidates remain separate from
qualified native proof profiles.

The [native sequence component](world/native/NATIVE_MEMBERSHIP_SEQUENCE.md)
now composes complete membership proofs from genesis through the first terminal
transition, deriving each input from the immutable action tape and previously
verified outputs. Fourteen independent tests and six accepted/nineteen rejected
Street CLI commands pass. Three-transition two/eight-car bundles are
2,419,436/3,577,548 bytes; the verifier receives only the public statement and
proofs. This is a linear composition baseline. Authentication of accepted and
pending inputs, no-driving terminal adjudication, extraction, composed security
and full-duration performance remain separate requirements. The
[sequence evidence manifest](artifacts/native-membership-sequence.json) freezes
628 files and the exact measurements; the
[history gap map](docs/native-history-gap-map.md) identifies the next boundaries.

The [proof-linked closure](world/native/NATIVE_MEMBERSHIP_CLOSURE.md) now verifies
a complete preceding sequence and a separate no-driving Street award relation.
It applies removals at an already-terminal boundary before ranking, including
removal of a finished winner, while preserving physical state and tick. Nineteen
native tests and six accepted/ten rejected CLI commands pass. Closure proof files
are 257,516/527,500 bytes for two/eight cars, including their root prefixes.
The [closure evidence manifest](artifacts/native-membership-closure.json) retains
the exact source and measurements. The selected
[boundary-first policy](docs/native-terminal-closure-policy.md) additionally
requires genesis and before-driving termination, complete retained-history
validation and consensus removal authority beyond that earlier component.

The [boundary-first native computation](world/native/NATIVE_GUARDED_HISTORY.md)
now proves a boundary before every driving step and a final boundary without
extra movement, including tick-zero wins/refunds and partial starting-grid
removals. Its verifier carries only previously proved raw motion state.
Twenty-six native tests and 21 accepted/70 rejected CLI commands pass across
the main and supplemental reports. The eight-car, two-motion-step case is
3,986,081 bytes and took 93.691 seconds to prove and 40.347 seconds to verify
in the retained CPU run. Boundary-first composition is implemented; authenticated
accepted/pending history, removal authority, integer extraction, composed
security and practical full-duration proving remain unqualified.

The [accepted-history bridge](world/native/NATIVE_ACCEPTED_HISTORY.md) binds the
complete native record, signed input evidence, exact compiled relation, raw
checkpoint and projected archived outcome. Its subsequent
[custody and terminal-cap checks](world/native/NATIVE_ACCEPTED_HISTORY_CUSTODY.md)
recompute native stake/NFT custodians and preserve valid final input batches
while rejecting nonterminal cap checkpoints. Thirty native tests pass; current
CLI evidence and remaining ledger/rollout requirements are tracked there.

The [native finalized-entry adapter](world/native/NATIVE_FINALIZED_ENTRY.md)
returns a private receipt after pinned native finality, exact executed-block
and successful transaction inclusion checks. Its shared
[merge-record verifier](world/native/NATIVE_FINALIZED_MERGE.md) authenticates a
complete merge sidecar and delta, returning a record at the explicitly named
certified batch revision. The [finalized-history component](world/native/NATIVE_FINALIZED_HISTORY.md)
now binds that exact state origin inside fresh execution proofs and associates
their private receipts. One computation proof can verify through different valid
finality paths to the same target. The combined qualification passes 65 selected
native tests, six fresh Street proof cases (including two expected semantic
rejections), and seven additional public-file rejection checks. Global BLS/PoP
signatures are real; merge execution data is synthetic. Native producer
export/capture, legal removal transitions, settlement and composed security
remain unqualified. The
[research follow-up](docs/research/crypto-2026-authentication-followup.md) explains
that boundary and the additional Fiat–Shamir composition obligations.

The follow-up [native sumcheck laboratory](world/native/NATIVE_SUMCHECK.md)
implements dense and bounded-buffer streaming reductions over the same complete
scalar equations. Its 26 focused tests include eight independent adversarial
checks. Successful reductions retain explicit polynomial-opening and indexed-read
obligations; they are not complete game proofs. The
[native opening plan](world/native/SUMCHECK_OPENING_PLAN.md) specifies the next
WHIR linear-query experiment and its required transcript and security analysis.
Six additional native basis-conversion tests pass. The
[sumcheck evidence manifest](artifacts/native-sumcheck.json) records both test
suites and exact two/eight-car dense/streaming measurements; small round frames
exclude the required authenticated openings.

The new [native WHIR laboratory](world/native/NATIVE_WHIR.md) implements the
complete small 64-value commitment/linear-query opening protocol, including two
domain changes. All 23 native tests and 48 external CLI rejection cases pass.
Separate verifier processes check reproducible 85,192/109,240-byte proofs in
0.214/0.236 seconds on this machine. The [evidence manifest](artifacts/native-whir.json)
retains the exact sources, binaries, measurements and conditional soundness analysis.
This opening-only predecessor is followed by the composed experiments below.
Full-game proofs, composed 128-bit security and live settlement remain unqualified.

The [scalar/WHIR composition](world/native/NATIVE_WHIR_EXECUTION.md) now closes
compiler-derived virtual reads on a complete small native relation. It includes
public-port and value-tail equations and preserves the original range/ROM
obligations. All 32 selected tests and 56 CLI rejection cases pass; 87,776/110,704-byte
proofs verify in about 0.19 seconds without witness regeneration. The
[composition manifest](artifacts/native-whir-execution.json) records exact evidence.
Full Street exceeds this 64-value profile and still requires membership, history,
resource and security qualification.

The [dynamic Street composition](world/native/NATIVE_WHIR_STREET.md) preserves
all scalar equations from the actual two/eight-car one-tick compiler output,
including public ports and every padded-value zero equation. Its 45 combined
native tests include coherent malicious openings and compiler-owned read-map
checks. All four two/eight-car Base/Extension cases verify in separate processes;
eight-car proofs are 578,112/682,704 bytes. The 28 altered-statement/proof commands
reject. These measurements cover one tick. Range/ROM, base membership, accepted
histories, full-duration proving and complete execution remain unqualified.
The [Street evidence manifest](artifacts/native-whir-street.json) retains the
complete source, report, binary and documentation closure, including 70 external
rejection checks.

The follow-up [native limb experiment](world/native/LIMB_RANGES.md) implements
exact bounded chunks for ranges and comparisons. Its raw verifier checks every
polynomial and fixed range membership, including partial chunks and inactive
branches. The experiment compares 8-, 12- and 16-bit layouts against the unchanged
bit reference. The 16-bit layout reduces its raw staged cells by 84.13%; its
larger tables still need a measured cryptographic lookup argument. Full-race
qualification remains open. Exact source and test pins are in
[the limb experiment manifest](artifacts/street-limbs.json).

The [native commitment experiment](world/native/STREET_COMMITMENTS.md) feeds
checked two- and eight-car rows into unchanged Iroha execution hashing. Separate
opening verification and 28 altered-bundle checks passed. These short-prefix
measurements qualify that integration boundary only. The
[lookup protocol candidate](world/native/LOOKUP_PROTOCOL_V1.md) and
[terminal binding requirements](world/native/TERMINAL_BINDING_REVIEW.md) describe
remaining work before a complete result proof.

Immutable [stage](world/native/AIR_EXPORT_REVIEW.md) and
[execution boundary](world/native/EXECUTION_AIR_EXPORT.md) views now expose the
exact compiled equations for the next proof implementation. All 58 combined
native tests pass, and every exported predicate passes on the real two- and
eight-car three-tick fixtures with unchanged row bytes. These are raw relation
checks; cryptographic proof qualification remains open.

The earlier [native lookup proof laboratory](world/native/NATIVE_LOOKUP_PROOF.md)
combined those exports with authenticated range lookups, native commitments,
DEEP openings and FRI for a closed three-step arithmetic computation. Its frozen
466,600-byte proof passed a separate verifier process and adversarial tests.
The complete Street relation, full-race resources and composed security
qualification remain open; this laboratory does not enable live XOR settlement.

[Complete Street admission](world/native/STREET_COMPLETION.md) now verifies the
first terminal state, exact cursor and canonical results using generic execution
facilities. A full 8,462-tick eight-car Tokyo replay passed every raw scalar,
range-membership and continuity constraint and matched all 244 browser outputs.
The pass took 266.35 seconds with 297.5 MB peak process memory. These are complete
raw verification costs; a compact full-race cryptographic proof and authenticated
history remain unfinished. The [layout study](world/native/STREET_PROOF_LAYOUT.md)
measures the representation changes needed next.

The [native ROM proof laboratory](world/native/NATIVE_ROM_LOOKUP_PROOF.md) now
proves indexed reads from all 1,403 Tokyo intervals in a closed three-step
computation using native Iroha cryptography. Its 934,724-byte proof passes a
separate verifier process; 29 composed-profile tests and six cross-profile CLI
rejections are retained. Full-circuit raw parity checks remove 883,640 quadratic
terms per eight-car tick, while dense full-race proof memory remains unresolved.
The [evidence manifest](artifacts/native-rom-lookup-proof.json) separates this
bounded result from full Street, authenticated history and security qualification.

## Run locally

The SDK currently links to the isolated sibling
`../iroha-sora-cars-native/javascript/iroha_js`. That checkout must be present.
Generate its distribution before building the app; Node-side SDK tests also
require its authenticated native binding build. The maintained `../iroha`
checkout has not received these changes yet.

```sh
npm install
npm run dev
```

Open the local Vite address and choose **走り出そう / START YOUR ENGINE**. Practice needs no wallet. Use W/A/S/D or the arrow keys, Space to drift and Shift or X to boost. Gamepads use the left stick, R2 gas, L2 brake, A boost and B drift. Touch controls appear on mobile.

```sh
npm run build
npm test
npm run test:browser
npm run test:story
npm run test:proof-workshop
npm run assets:music
```

Browser checks require a running development server and Playwright Chromium (`npx playwright install chromium`). Generated test captures live in `output/`.

Generate Tokyo practice into a new output directory, then package that exact generation manifest:

```sh
npm run world:race -- --output output/street-release-01 \
  --iroha-root /absolute/path/to/iroha \
  --native-binary /absolute/path/to/reviewed/iroha \
  --native-sha256 <independently-pinned-executable-sha256>
npm run assets:street -- --generation output/street-release-01/generation.json
```

Choose a new directory for every generation. Generation calls the selected Core-owned CLI exporter and compares all authored road, gate and hazard values to its fixed catalog. It retains the pinned executable, exact native exports and narrow native source inventory. Packaging checks these plus its eight-car bundle and unchanged app producers before publishing relative content-addressed assets. It requires `--generation` and never falls back to an older output directory.

The separate Tokyo street development lab is at `/street-lab.html`. It runs a native-authored two-to-eight-car arithmetic
model with swept contacts, native oil grip, shared breakaway SORA signs/planters and ordered finishes. See the [street race draft](world/native/RACE.md)
for controls, generation, parity tests and its remaining qualification work.
It is local practice and is not an admitted staked-race profile.

## Driving and weather

The pixel-art routes now include native tree and sign collisions, oil slicks,
scheduled rain and changing crosswinds. Wet roads and oil reduce grip; solid
objects slow the car and trigger foliage or sign effects. These rules come from
the same Rust circuit exported to the browser and included in result proofs.

The locally synthesized engine has six gears, exhaust pulses, intake and gearbox
layers, turbo spool/release, tyre scrub, gravel, wind, rain and distinct tree/sign
impacts. Every driving layer stops at the finish, pause, restart countdown,
dispute and cutscene transitions. Leaving the driving screen supplies neutral
online inputs. The original MIDI soundtrack continues independently.

```sh
npm run test:audio
npm run test:driving-feedback
npm run test:track-objects
npm run test:live-driving-lifecycle
```

## Native game platform

Live driving happens off-chain. Iroha 3 is being extended in `../iroha` with reusable execution proofs and **generic game session instructions**. The shared layer owns manifests, authenticated participants, input certificates, disputes, escrow and proof-based settlement. It does not embed racing-specific instruction types. `RaceV1` is the first application adapter and computation relation.

The deterministic reference and proof relation use bounded integer arithmetic at 30 Hz. The client renders independently. Race-specific input keys cannot spend wallet funds; Iroha Connect approves locally built canonical transactions with explicit fee caps.

The header wallet button uses Iroha Connect on Taira testnet. The default build
bundles Taira's public genesis-derived NetworkId; it does not learn that identity
from the selected endpoint. Scan the canonical `iroha://connect` QR with a
Taira-configured wallet, or use **ウォレットを開く / OPEN WALLET**. Closing the dialog
cancels pending registration and pairing. Connection approval is separate from
purchase and race-entry transaction approvals. Alternative Taira endpoints can
be selected in settings. Reviewed build-time network overrides belong in
`.env.local`; quote the complete hash literal, including its checksum, as shown
in `.env.example`.

`npm run test:wallet-ui` exercises the actual app with a local Connect protocol
counterpart, including cancellation, retry and signed approval. It does not
qualify a deployed wallet or Taira service.

Regenerate the browser arithmetic and all 21 reference transcripts with a freshly
built native CLI:

```sh
SORA_CARS_IROHA_CLI=/absolute/path/to/iroha npm run generate:native
npm test
```

The generator rejects a CLI whose embedded source identities differ from the
sibling checkout. Parity checks include exact terminal standings and winners.
At 180 seconds, eligible distance leaders win if nobody finished; exact ties
split the prize. Consensus forfeits rank below eligible racers.

**Live XOR racing is disabled while native proof and deployment qualification is incomplete.** Endpoint reports are not independently authenticated finality. The release must pass the complete proof, resource, four-validator and wallet gates before any live staked game is enabled.

## Music

- [Midnight Transistor](public/assets/music/midnight-transistor.mid) — 124 BPM
- [Harbor Signals](public/assets/music/harbor-signals.mid) — 116 BPM
- [Sakura Express](public/assets/music/sakura-express.mid) — 132 BPM

These are original compositions inspired by 1980s Japanese electronic music. The game synthesizes the same sequenced notes locally without a streaming service or runtime CDN.

## Deployment

Vite uses relative assets and the final site is intended for a native CID-only SoraFS publication. No deployment is claimed yet. Fonts, imagery and MIDI resources are bundled locally; asset provenance is in `public/assets/README.md`. The native packaging workflow is in [SoraFS release qualification](docs/sorafs-release.md). Track implementation and qualification in `progress.md`.

### SORA RECORDS soundtrack collection

Open `#/soundtrack` for all 25 original compositions, individual illustrated sleeves and 30-second previews. Each released edition costs 1 XOR, with network fees reviewed separately in the wallet. A received NFT grants the bundled perpetual, royalty-free, non-exclusive personal/commercial license and enables full WAV/MP3, artwork and license downloads after fresh ownership and file-integrity checks.

The storefront remains in release-preparation mode until `VITE_MUSIC_COLLECTION`, the pinned application/XOR identities and native market qualification are supplied. There are no fabricated mints, offers or local ownership receipts. Read [release goals](docs/soundtrack-goals.md), [music market setup](docs/music-market.md), [full-size publication evidence](docs/soundtrack-publication.md), and the [full license](public/assets/music/sora-music-license-v1.txt).

Reproduce audio with `npm run assets:soundtrack`, then build the audio/art integrity manifest with `npm run assets:music-manifest`. Run `npm run test:music-assets`, `npm run test:music-market` and `npm run test:music-store`. The offline edition tool is `npm run assets:music-catalog -- <application> <XOR-definition> <collection-JSON> <plan.json> <output.json>`; it prepares unsigned native inputs and requires explicit release identities. Deployment must retain every referenced master, sleeve and license file; previews alone are not the collection.
