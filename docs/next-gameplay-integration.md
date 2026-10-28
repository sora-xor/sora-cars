# Next gameplay integration: current-source audit

Initial audit date: 2026-09-07. This table records the pre-integration baseline; see the implementation update below for the current Tokyo surface. Scope: the requested 49 locations and the gap between the shipped frontend and the native street lab. Sources and retained evidence were read directly; no gameplay source, Iroha checkout, or running server was changed. No new browser or native tests were run for this report.

## What exists today

| Surface | Implemented behavior | Remaining gap |
| --- | --- | --- |
| Main game | [Rules](../src/game/rules.ts) expose **three** circuits: Hakone, Yokohama and Nikko, three laps, 30 Hz, 5,400-tick limit. [Main](../src/main.ts) uses `createRace`/`stepRace`, the existing generated RaceV1 kernels, the arcade renderer, practice AI, story, history and three replay cameras. | These are the existing stylized circuits; their place names do not fulfill the requested 1986 prefecture reconstructions. Main imports no street session/renderer/catalog. |
| 49-location expansion | The two [research catalogs](../world/research/japan-east-1986.json) / [west and specials](../world/research/japan-west-special-1986.json) contain **47 prefectures + Pyongyang + Moscow**, with **106 source references**. | **48 locations have no authored geometry**. All 49 research entries retain historical/geometry/playable qualification as false. This is a corridor inventory, not 49 playable races. |
| Tokyo geometry | [Tokyo authoring](../world/authoring/tokyo-1986.json) compiles to a 7.013328 km circuit, two laps, 1,404 samples, 13 gates and a 9,000-tick limit. The separate [object catalog](../world/authoring/tokyo-1986.objects.json) defines 12 interactive oils, signs and planters. | Widths, elevations, joins and period alignment remain provisional. The selected route includes a moat-side return. Historical frontage and furniture still need dated evidence. |
| Tokyo playable draft | [Street lab](../src/game/street/lab.ts) loads the eight-car native-generated graph, drives one local human against seven bots, and supports keyboard, touch, gamepad, rain/wind, drifting, car/wall/prop contacts, rematch and replay download. [Session](../src/game/street/session.ts) supports 2–8 slots; generated bundles exist for all seven roster sizes. | No human multiplayer, story entry, normal history integration, replay import/playback, selectable replay cameras or wallet settlement in this lab. Its explicit proof/consensus/playability qualification flags remain false. Eight simulated cars do not establish eight human clients. |
| World art and traffic | [Street renderer](../src/game/street/renderer.ts) draws shops with physical SORA signs, people, trees and commuter bikes; the native catalog controls breakaway props and oil. | Shops/people/parked bikes are procedural scenery; bikes are explicitly decorative. Street hazard kinds contain no moving civilian cars/bikes. Tokyo gate labels are hardcoded. Distinct prefecture landmarks, Pyongyang portrait placement and Moscow period flags are research requirements, not implemented art. |
| Music and campaign | [Music library](../src/game/music-score.ts) has nine compositions; the three main circuits select its first three. [Campaign](../src/game/story-campaign.ts) has twelve chapters using only track IDs 0–2. The lab plays the supplied 254.952-second Yasukuni recording. | No 49-track song mapping or prefecture campaign. Tokyo's audio path is hardcoded; its authored section cues do not drive events or transitions. |
| Static release | [Vite configuration](../vite.config.ts) builds the main entry with relative assets. [SoraFS packer](../scripts/pack-sorafs.mjs) packages `dist`. | Current `dist` contains no street lab, street bundle or Yasukuni audio. The lab fetches files from development-only `output/` and `world/` paths. Packaging the main game does not publish Tokyo. |

Circuit **and sprint** support already exists in the [compiler](../scripts/lib/street-track-compiler.ts), [track runtime](../src/game/street/track.ts) and native geometry. The research index's older “need sprint support” wording is stale. Grade-separated/intersecting centerlines are still explicitly rejected; future routes must respect that limit or extend the topology deliberately.

## Highest-impact next step

**P1 — Bring the Tokyo native draft into the normal no-stake practice experience.** Give it a clearly identified local session/rules kind, an ordinary track-selection entry, shared input/audio lifecycle, results, rematch and replay/history flow. Preserve the native session's full state and generated geometry; do not project it into the old RaceV1 state and continue simulating there. Package its bounded assets through Vite so the same route works under a nested static path. This work can proceed independently of cryptographic qualification.

Acceptance should cover one manual Tokyo race through finish, pause/restart, mobile/gamepad, all replay camera modes, deterministic replay import/export, audio stop, and the production static build. Reuse the latest main-game speed presentation lessons without changing authoritative motion to match a visual effect.

**P2 — Calibrate Tokyo, then make one additional route end to end.** The retained eight-bot drive finishes between approximately 228 and 282 seconds against the 254.952-second song; 3,292 ticks include a wall contact. This demonstrates completion, not calibrated expert pacing. Improve bot cornering and measure skilled manual runs, then implement real jo/ha/kyu cues. Author one genuinely different sprint to exercise endpoints, per-location art/music and a data-driven landmark system before scaling to the remaining 47 locations. Generalize [generation](../scripts/generate-street-race.ts), which currently hardcodes Tokyo, into an explicit route manifest with bounded per-route bundles; do not bulk-load seven graphs for every location.

**P3 — Integrate the new computation with networking and settlement only after its own qualification.** Existing generic `OpenGameSessionV1`/`SettleGameSessionV1` instructions are the correct lifecycle direction. The gap is the compiled game adapter and its authenticated data, not a new race-specific ISI.

## Constraints before replacing production physics

- **Identity and wire format:** [Chain adapter](../src/chain/races.ts) admits exactly `neon_tokyo`/`harbor`/`sakura`, `max_ticks: 5400`, and old RaceV1 state. [Peer session](../src/network/session.ts), replay chunks, checkpoint hashes and proof requests use those same types/bounds. Street adds separate body/velocity yaw, ordered gate cursor, finish fractions, statuses and shared broken-object state; every authoritative serializer, snapshot, replay and outcome must preserve them. Use one reviewed first-release design and new exact computation identity, with no legacy aliases or relabeling of changed rules.
- **Authoritative input boundary:** `StreetRaceSession.step` accepts local `consensusForfeits` as arithmetic inputs. In multiplayer, only authenticated finalized dispute history may provide them. Bind the complete immutable track/object catalog, rules, network, roster/input keys, checkpoints, pending certified inputs and final outcome. Prediction, rendering and sound remain outside signed state.
- **Replay completeness:** The draft download contains action rows, object metadata, source hashes and claimed output; it is not a proof or standalone finalized-inclusion bundle. Ship the exact compiled dependency identity, bounded decode and full replay verification before exposing it in production history. Do not trust an imported outcome or arbitrary graph because it carries source hashes.
- **Proof completeness and cost:** Native/browser arithmetic parity is available; that does not qualify a STARK. The retained scalar report proves neither authenticated geometry nor cross-tick continuity/public statements. Complete the new relation, all eager assertions and unselected branches, state/geometry bindings, padding and independent soundness review, then measure full-duration proving and validator verification. The current eight-car host graph has **101,808 nodes** and a **6,701,987-byte** bundle. Retained host step p95 is 5.13 ms on this machine, not a mobile/validator capacity result.
- **Release boundary:** Local practice does not require funded qualification. Human multiplayer, XOR/NFT transfers and live profile activation additionally require the generic native adapter, canonical SDK/wallet codecs, replay/dispute recovery, exact profile admission, four-validator qualification and actual deployment gates. The current [client](../src/chain/client.ts) ties staking to its exact existing RaceV1 identity; do not relax that check to admit street draft data.

## Evidence scope

The [native/browser race report](../output/qualification/street-race/report.json) records **9,961 compared transitions**, **49 rejections**, exact replay, all rosters and a complete eight-car drive. Its sources and the [generation manifest](../output/qualification/street-race/generation.json) matched current files at audit time. Generation SHA-256: `0e917665359f56c8f3affa93b76f145f1f148fcbb7c9d1f70ab8a6a2263c68db`; eight-car bundle SHA-256: `92da95c575ba50ab42e940702ec110173b44e19030ad006a800893eacd4592ca`.

Retained [lab browser evidence](../output/browser/street-lab/report.json) has 91 checks and [hazard evidence](../output/browser/street-native-hazards/report.json) has 40 checks, both with zero failures/errors. Their street-source pins still match, but **their audio pin predates the latest speed-wind change**; they are not fresh whole-frontend qualification. The [scalar lowering report](../output/qualification/street-checked-lowering/report.json) is explicitly scalar-only. Authenticated geometry work is concurrent and must supply its own final evidence; this report does not pre-judge it or claim the full plan complete.


## Main-game Tokyo integration — 2026-09-07

Tokyo is now an ordinary `#/street/tokyo-1986` practice route, reachable from the home circuit picker and garage. `StreetPractice` owns the native generated session and renderer while sharing the main animation loop, keyboard/gamepad/touch controls, music preference, engine effects and navigation. It does not map its physics into old RaceV1. Eight-car practice, countdown, pause/restart, results, bounded history, canonical replay import/export, full local reexecution, seeking and chase/bumper/aerial cameras are implemented. The separate lab remains a development surface.

`assets.ts` admits only the compile-time manifest, exact byte lengths and SHA-256 hashes. Native generation evidence and its unchanged producer inventory were checked before copying the eight-car computation and supplied 254.952-second song into `public/assets/street`. The recorded song is played from the verified Blob bytes. All paths use the Vite base and need no `output/`, `world/`, replay server or runtime CDN. `scripts/package-street-assets.ts` requires `--generation output/<fresh-generation>/generation.json`, reads the exact eight-car bundle path from that manifest, and fails if its bytes or producer sources have changed. It accepts only the current complete generation schema and never reads a retired hardcoded bundle path. Use `npm run assets:street -- --generation output/<fresh-generation>/generation.json` after generating into that fresh directory.

`replay.ts` records controls, full terminal outputs and an exact computation hash. Its first-release wire format is bounded canonical JSON; duplicate keys, extra fields, noncanonical values, unsupported computations, introduced forfeits and malformed inputs are rejected. Reexecution compares every terminal output and privately creates seek checkpoints, including object break masks and fractional finish data. Verification supports progress and cancellation. This is local computation verification, not proof/finality authentication or an XOR/NFT entitlement. Records do not display an imported claimed rank before reexecution.

P1 implementation is present; formal playability acceptance still needs a full skilled human race through finish. The retained browser evidence covers real keyboard/touch/gamepad input bursts and a complete canonical eight-bot run. P2 pacing, historical frontage, moving traffic, authored jo/ha/kyu cues, further routes and P3 generic authenticated networking/proof/settlement remain open. No release security, human multiplayer, public testnet activation or SoraFS publication is implied.

## Tokyo soundtrack chapters — 2026-09-08

The existing five creative cue markers now drive the main route through
`streetPresentation(track, tick)`: **序・静かな点火**, **破・街の鼓動**,
**破・交錯**, **急・解放** and **急・暁へ**, each with an English subtitle.
The canvas shifts from violet night to a SORA sunrise, with changing skyline
lighting and wet-road reflections. Chapter titles hold briefly and fade; reduced
motion keeps them static. Their timing follows the simulation tick, including
paused replay and rewind. Mobile title placement accounts for the actual pause
and audio controls instead of overlapping them.

The recorded song now follows the same simulation clock after loading, seek,
pause and music re-enabling. It waits for valid metadata and pending seeks,
guards obsolete play callbacks, and requires an explicit action to rewind an
ended recording. It never changes playback rate, loops the song, ends a race
early or modifies native state. The current browser checks use both fully
recomputed public replays and actual media elements.

This completes the authored cue presentation part of P2. Actual musical onset
analysis, skilled-human pacing calibration, 1986 frontage, moving traffic and
additional routes remain open. The geometry, physics, packaged native graph,
soundtrack bytes and proof profile identities are unchanged.

The [current presentation evidence](../artifacts/street-score.json) records
13 focused timeline/audio tests, eight existing replay/assets/music regressions,
56 replay/media browser checks and ten normal-animation-clock driving checks.
Desktop and mobile captures were inspected, including reduced motion. The
production build remains blocked by the stale sibling SDK distribution: its
browser map references missing `dist/address.browser.js`. A complete SDK
publication and wallet regression run are required before fresh static-release
qualification; the local Vite browser checks do not establish that release gate.
