# Soundtrack completion evidence

The active goal includes a real release. Local tests do not establish issuance, live payment, delivery or publication.

## Current October 28 corrections

The collection has 26 recordings by **SORA Cars**. The Tokyo title is exactly
**靖國神社で会おう** across the storefront, player, download tags and unsigned NFT
metadata. Its accepted generated cover has the large straight-beamed 神明鳥居,
no Skytree, and the supplied SORA emblem centered within its label. Audio packets
and decoded PCM are unchanged by retagging. The catalog SHA-256 is now
`4a455582055d2f9e2d03fa22507317d1ee68a7863184b916fbe28423ea4e3164`.

The final build and three-viewport browser report are under
`output/qualification/frontend/soundtrack-2026-10-28-yasukuni-final-recovery/`;
all 104 packaged music assets and all 920 copied public files passed.
The successor candidate is `output/music-release/taira-20261028-yasukuni/`,
with independent browser/Rust/native CLI verification. The consolidated receipt
is `artifacts/music-tokyo-correction-2026-10-28.json`.

Account registration/funding and collection ownership succeeded on October 28;
see `artifacts/music-artist-account-2026-10-28.json` and
`artifacts/music-collection-authority-2026-10-28.json`. These supersede the
unregistered account state in the historical evidence below. NFT issuance,
publication and a real purchase remain unverified; live release is disabled.

The full historical October 23 storage test passed at **06:22:20 UTC on October
28**: 931 files, 2,563,048,355 payload bytes and 20,228 chunks. Native pack,
independent source verification, provider admission, complete readback, restart
and corruption checks succeeded, with unchanged frozen inputs. This is local
historical-payload qualification, not publication of the corrected storefront.
Its retention epoch is expired and registration is prohibited. See
`artifacts/music-provider-local-qualification-2026-10-28.json` and the remaining
release requirements in `artifacts/music-release-blocked-2026-10-28.json`.

## Retained October 23 evidence

The user approved the supplied Tokyo song under the same license and chose **SORA Cars** as artist. This historical collection had 26 recordings: 25 synthesized compositions plus that supplied recording. The [26-recording preflight](../artifacts/music-release-preflight-2026-10-23-tokyo.json) binds the historical media evidence below; the earlier [October 23 preflight](../artifacts/music-release-preflight-2026-10-23.json) predates this addition. The later [native registration attempt](../artifacts/music-registration-attempt-2026-10-24.json) resolved configuration admission but failed transaction decoding before submission. Live release requirements remain separate.

| Requirement | Authoritative evidence | Current state |
| --- | --- | --- |
| Every major tune and the approved supplied song have complete downloads | `public/assets/music/audio/manifest.json`; `tests/soundtrack-audio.test.ts`; `output/audio/soundtrack/browser-playback.json` | 26 recordings, 63.18 minutes, 78 WAV/MP3/preview files. All 26 previews decode as unique audible stereo, and every complete MP3 duration loads in Chromium |
| Distinct cover for each song, with supplied SORA emblem | `artifacts/soundtrack-cover-audit-2026-10-23-tokyo.json`; per-image prompts/provenance in `docs/art-prompts/` | 26 unique, opaque square sleeves match the catalog. The original 25 cover hashes remain unchanged; Tokyo's new generated sleeve has its own exact-byte provenance and visual review |
| Audio, artwork and license identify the exact purchased work | `src/game/music-assets.generated.json`, `musicItemMetadata`, asset/audio tests | Nine asset/audio tests pass against 104 bound files and the unchanged license, including 25-score source checks, original 75-file preservation, and distinct supplied AAC provenance. With composition/cue tests, the focused run passed 15 tests |
| New bilingual page and previews | Real `#/soundtrack` route; `artifacts/music-static-2026-10-23-tokyo/report.json` | All 26 selections work; desktop/390px/320px layout, four songs' play/pause/seek including Tokyo, route exit and reload pass. Tokyo screenshots were visually inspected at all three sizes |
| Price 1 XOR with fee separate | `src/chain/inventory.ts`, client native purchase builder; `artifacts/music-market-browser.json` | 53 browser protocol checks passed at 14:41 UTC on October 23, including all 26 real catalog metadata bindings |
| Unlimited-use grant | Public bilingual `sora-music-license-v1.txt`; named issuer in exact NFT metadata | Unchanged perpetual, non-exclusive personal/commercial use, unlimited projects, royalty-free grant. Tokyo was approved for the same terms; final issuer/release binding remains required |
| Receipt, ownership and downloadable files behave correctly | `scripts/test-music-store.mjs`; `artifacts/music-store-browser.json` | 18 fixture groups passed at 14:42:22 UTC on October 23. Tokyo adds its own preview/cover, reviewed 1-XOR purchase, pending-versus-received ownership, and exact WAV/MP3/artwork/license downloads. Prior responsive checkout and session-race checks still pass; wallet/ledger records remain simulated |
| Production bundle works beneath a CID directory | `scripts/test-music-static.mjs`; `artifacts/music-static-2026-10-23-tokyo/report.json`; `output/qualification/frontend/soundtrack-2026-10-23-tokyo/freeze.json` | All 104 packaged music-file checks and three viewports pass at 14:45:04 UTC. TypeScript/Vite exit 0, source inputs unchanged, 920 public inputs copied byte-identically; 931 output files total 2,563,048,355 bytes |
| Initial launch covers the whole collection | `src/chain/music-launch.ts`; `artifacts/music-launch-browser.json` | 38 focused browser/CLI checks pass; requires a matching, open, unrestricted 1-XOR edition for every one of the 26 songs. Synthetic snapshot evidence only; valid Node execution still needs the qualified SDK binding |
| Actual issuer and live editions | `artifacts/music-artist-account-2026-10-23.json`; registration and release evidence | User-authorized account prepared and privately persisted; artist is SORA Cars. Account is not registered/funded and no NFTs were issued. Onboarding/status/policy reads returned HTTP 502 at 14:37 UTC; reviewed release identities and native qualification remain required |
| Actual purchase and delivery | Native market qualification and real ledger transaction/NFT ownership evidence; `artifacts/music-release-public-read-2026-10-23.json` | Not established. The earlier capability read returned HTTP 200 with `qualified: false` and a network different from the retained reviewed pin; no new pin adopted |
| Full-size local package and storage | `docs/soundtrack-publication.md`; `artifacts/music-provider-local-qualification-2026-09-26.json` | September 26 isolated pack, verification and local provider admission/restart/readback passed for 444 files / 1,487,166,105 payload bytes. This historical result does not qualify the larger October 23 payload |
| Deployed page and available media | Qualified SoraFS publication and remote provider retrieval evidence | Not established. The current 931-file build includes Tokyo, final artwork and checkout fixes but remains unconfigured/unpublished. A configured release needs native pack/verification, full-size provider qualification and remote publication/retrieval |

The expanded collection's catalog is `src/game/music-assets.generated.json`, SHA-256 `3cf69489dd46759525724ea0b9ca045968424e8519bbf8bae36460c572837264`. The focused file tests and the production static run independently check all **104/104** bound files: 26 WAV downloads, 26 MP3s, 26 previews and 26 covers. The unchanged license remains SHA-256 `f492695f1c9ce7fe4534400dd047af97aa14d587410d152b5249f9efedd20b57`.

The original 25 compositions still match the current score, synthesizer and cue sources. Their exact September 22 export records/source hashes have serialized JSON SHA-256 `0a015b89bda2af4056db3e9f18dc2605f64cdbcced6c34bf778d83e8c84f4b65`; the regression check pins that value and separately hashes every actual audio file. Adding Tokyo left all 75 original audio files byte-identical.

“靖國神社で会おう / Meet Me at Yasukuni” retains its supplied **lossy AAC** source SHA-256 `85401fb75fd6f1f409119dd0ea47642cb9ea173bbb2f06d7a14506febcaf84a6`, 48 kHz stereo and 254.952-second source duration. Its 44.1 kHz/16-bit WAV is a decoded and resampled distribution copy, not an original lossless master; MP3 and preview derive from that copy. The new test checks source copies, provenance, full duration and separate exporter pins without inventing a BPM, note count or synthesized score. Its preview starts at 30 seconds. See [audio export details](soundtrack-audio.md).

The 26-track production freeze is `output/qualification/frontend/soundtrack-2026-10-23-tokyo/freeze.json`, SHA-256 `19bb279b45559f5acdeb82c02e0251fdc43a5076f3d124ac3f832c9010ba02bb`. It completed at **14:43:17 UTC**. The later static suite serves that actual bundle beneath a CID-shaped directory, verifies all 104 catalog-bound audio/artwork files and records no missing assets or page errors. It exercises the actual app without a simulated wallet. The separate storefront fixture uses simulated issuer/NFT/ledger/wallet records and does not establish live purchases.

The unchanged develop-web-game skill client also ran against the updated controller fixture. `artifacts/music-skill-tokyo/` contains two screenshots and text states identifying the selected Tokyo item and 26-track catalog, with no console-error artifact. Those screenshots were opened and inspected. Playback, seek/pause and downloads are exercised by the separate browser suites described above; the skill-client selection run does not claim active playback.

At **14:37:18–19 UTC on October 23**, anonymous `/status`, account onboarding readiness and faucet policy reads returned HTTP 502. The user-authorized account is locally prepared and its key pair privately persisted, but registration/funding have not occurred. The exact evidence is `output/qualification/music-issuer-account-2026-10-23/registration-readiness-recheck.json` and the public preparation record is `artifacts/music-artist-account-2026-10-23.json`. Artist choice and local account preparation are complete; these are not on-chain registration or NFT issuance evidence.

The final `/status` and faucet-policy recheck at **14:44:58–59 UTC** again returned HTTP 502 (`output/qualification/music-issuer-account-2026-10-23/registration-readiness-final.json`). The prepared account remains unregistered and unfunded.

At **13:43 UTC on October 23**, the earlier anonymous capability read reported network `hash:4978D0BD15FC32B834672B27BBD8A03653B1DF060A1EEE7E9374D29AF3886D91#6774`, while the retained reviewed pin is `hash:0466DA18C70CA8CBD51B8CC60B1D4A4802FC5D7F928D505806D7CD6CB61D60EF#BA85`. Neither that response nor its HTTP 200 status authorizes adopting the observed identity. The market reports `qualified: false`; `/v1/sorafs/capacity/state` returned HTTP 404. These responses do not prove ledger finality or remote media availability. Exact bodies' hashes and timestamps are in `artifacts/music-release-public-read-2026-10-23.json`.

The September 22 and September 26 Node provenance failures were reproduced by a focused music-market run on **October 23 at 13:44:54 UTC**. It exited 1 before assertions with `ERR_IROHA_NATIVE_BINDING` / `source_provenance_error`; all ten observed source/manifest hashes remained unchanged. The command, timestamps and log hashes are in `output/qualification/music-node-revalidation-2026-10-23/command.json`. The later 38-check launch browser/CLI run preserved the same valid-input runtime admission boundary. Browser-adapter checks do not qualify that Node issuer runtime; no provenance guard was weakened and no shared native build was changed.

Historical results remain scoped to their payloads. The earlier October 23 build at `output/qualification/frontend/soundtrack-2026-10-23-current` contained 25 songs / 100 music files and 927 total output files / 2,504,553,834 bytes. Its 13:56:18 UTC static result is retained in `artifacts/music-static-2026-10-23/report.json`; it predates the supplied song. The September 22 browser run covered 16 storefront groups; October 23's pre-Tokyo run covered 17; the current run covers 18. The original September 22 production check and frozen package remain in `artifacts/music-static-package/report.json` and `output/qualification/frontend/soundtrack-92d67099-isolated/`. The September 26 isolated streaming implementation packed and verified that complete 444-file build and passed full-size local provider admission, readback and restart. See [publication evidence](soundtrack-publication.md) for exact receipts and package identities. None of those historical local results establishes current SORA Nexus manifest registration, remote availability, live NFT issuance, purchase or publication.
