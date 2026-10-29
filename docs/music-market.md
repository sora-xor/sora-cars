# SORA RECORDS release and native purchases

The soundtrack collection contains 30 recordings by **SORA Cars**: the 25 original compositions in `MUSIC_LIBRARY`, the user-approved supplied Tokyo song, “靖國神社で会おう / Meet Me at Yasukuni”, and the four street races' own songs (see [Street-race songs](#street-race-songs-october-29)). Each released SKU binds its WAV download, MP3, preview, cover and unchanged unlimited-use license by SHA-256. Native NFT metadata additionally commits the artist, recording provenance, application identity and named licensor. The Tokyo WAV is decoded from a lossy AAC source, not an original lossless master; its source bytes and conversion are pinned separately. An edition is one native NFT carrying that exact metadata; multiple editions of a song may be issued. The shop makes no fixed-supply or exclusive-copyright claim.

Every supported music sale costs **exactly 1 XOR**, paid atomically with NFT delivery through the SORA Nexus native `BuyNftV1` instruction. The wallet separately approves a maximum transaction fee. An offer for a different price, denomination, network, collection, seller, recording, cover, license or licensor is rejected. The license grants are described in the bundled license file; possession of a downloadable public file by itself is not a purchase receipt.

Music NFTs appear only in the music inventory. They cannot be equipped as car skins or visual upgrades, do not register game resources and are omitted from race-wager selection. The standard client also rejects depositing a recognized music NFT in a race. Existing cosmetic collection behavior remains separate.

## Release configuration

Use the reviewed network's application hash, XOR asset definition and NFT market protocol ID. Do not derive release authority from an arbitrary endpoint's response. `VITE_MUSIC_COLLECTION` has exactly these fields:

```json
{
  "domain": "<reviewed-domain.dataspace>",
  "sellers": ["<reviewed canonical seller account>"],
  "licensor": "<actual name of the entity granting the license>"
}
```

This is a shape example, not a valid release configuration. `VITE_GAME_APPLICATION_ID`, `VITE_XOR_ASSET_DEFINITION`, `VITE_NFT_MARKET_PROFILE_ID` and `VITE_NFT_MARKET_QUALIFIED=true` must also be set from reviewed release inputs. If cosmetics are released too, both collections must use the same domain, application and XOR definition. Each collection retains its own approved seller list; combining catalogs does not let cosmetic sellers sell music.

The release catalog is unavailable until every recording, artwork and license hash exists. Changing a file, artist, recording provenance or licensor creates different NFT metadata and must be treated as a new reviewed release. Do not silently replace files for previously sold editions. Keep the original downloadable recordings, artwork, license and metadata available to their licensees.

## Prepare numbered editions

`scripts/export-music-catalog.ts` prepares offline native issuance inputs. It reads no signing key, makes no network request, and does not register NFTs or publish offers. Supply a public plan with exactly `network_id`, `seller`, `expires_at_height` and `editions`. Every edition contains a known `sku`, an explicit unique `nft_id` in the collection domain, and a unique checked-hash `offer_id`. The expiry is a positive decimal string denoting a future block height on the pinned network. The release operator chooses the edition IDs and checks that neither NFT nor offer ID was used before.

```sh
npx tsx scripts/export-music-catalog.ts \
  '<pinned application hash>' '<reviewed XOR definition>' \
  '<music collection JSON>' '<public offer plan.json>' '<output.json>'
```

The exporter validates the complete collection's actual bytes against all pinned hashes, validates each NFT identity and native offer encoding, and outputs:

- `new_nft: { id, content }`, matching the native `NewNft` registration input.
- Exact `content_hash`, `OfferNftV1` instruction, network-bound expected offer terms and offer hash.
- Explicit seller authority, release catalog and checked file hashes.

These are **unsigned operator inputs**, not live offers or endpoint custody records. Register each `NewNft` using an authorized, reviewed native issuer workflow. Confirm its exact content and the approved seller's ownership, then submit the provided `OfferNftV1` using that seller's wallet. The current browser SDK has a native sale-instruction builder but no public NFT-registration builder; the exporter does not fabricate a browser registration transaction. The operator must verify domain registration authority, unused IDs, future expiry and qualified native market before signing. Replenishment uses another explicitly numbered NFT and offer; the webpage does not have a minting key.

## Check initial launch coverage

After issuance and offering, review an explicit endpoint snapshot with `npm run check:music-launch -- <snapshot.json>`. The JSON has exactly four top-level keys:

```json
{
  "config": {
    "networkId": "<canonical release-pinned network hash>",
    "nftCatalog": "<complete reviewed catalog object, not a string>",
    "nftMarketQualified": true,
    "nftMarketProfileId": "<reviewed native market profile>"
  },
  "capability": "<endpoint native-market capability object, not a string>",
  "observedHeight": "<canonical u64 decimal block height>",
  "editions": [
    { "sku": "<released music SKU>", "nft": "<normalized native NFT object>", "offer": "<native sale-record object>" }
  ]
}
```

The placeholders above describe object positions; they are not runnable records. `nftCatalog` has `applicationId`, `domain`, `xorAssetDefinition`, `sellers` and `items` from the reviewed export; each music item has `sku`, `kind`, `contentHash`, `price: "1"` and its optional seller restriction. `capability` reports `version: 1`, `native_nft_market: true`, `network_id`, `protocol_id` and `qualified: true`. Each `nft` has `id`, `ownedBy` and complete `metadata`. Each `offer` is the endpoint's complete native record: `version`, `offer`, `offer_hash`, `custody`, `status`, `created_at_height` and `closed_at_height`.

The launch check requires at least one distinct, open, unrestricted 1-XOR edition for **each of the 30 songs**, including the supplied Tokyo recording and the street races' songs, with exact build metadata, an approved seller, and the NFT in its quoted sale custody. Open offers move ownership into native sale custody, so direct seller ownership does not satisfy this check. Expiry must be strictly later than the observation height; a record created after that height, a repeated NFT/offer ID, conflicting metadata, missing song or unqualified release fails readiness. Multiple distinct editions per song are allowed. Supply only intended launch candidates: an invalid or expired extra candidate fails the report even when another edition covers its song. Offline export and replenishment plans may still contain only part of the collection.

The command reads one regular UTF-8 JSON file (maximum 32 MiB, 1000 candidates), makes no network requests and signs nothing. It prints a coverage/issue report with `verification: "endpoint_reported"`; exit codes are **0** for ready, **1** for a rejected snapshot, and **2** for input/runtime failure. A passing snapshot establishes neither freshness nor independent ledger finality, live issuance or publication. The buyer's checkout independently refetches and reviews current offers. The Node SDK source-provenance failure observed on September 22 also blocked this command for valid inputs; the focused music-market test reproduced that guard failure on October 23. A source-matched runtime still requires qualification before issuer use. `npm run test:music-launch` exercises the same validator through the supported browser adapter with synthetic records over actual build metadata and records results in `artifacts/music-launch-browser.json`. This does not qualify the Node issuer runtime.

## Checkout and download verification

`RaceChainClient.reviewMusicNftOffer` reviews real endpoint offers against the exact released catalog. `purchaseNft` probes current qualification, refetches the same immutable offer and custody, rechecks the one-XOR price and metadata, then locally constructs the wallet's `BuyNftV1` payload. A changed wallet session, reserved buyer mismatch, changed/closed offer or unqualified release stops signing. A displayed account string alone is not wallet approval.

Fresh inventory and `getOwnedMusicNft` calls reject replies from a stale wallet session. Ownership remains explicitly **endpoint-reported**; HTTP success does not independently authenticate ledger inclusion or finality. A purchase submission is not presented as delivery until refreshed inventory reports the exact NFT. Download controls use the bundled file paths and pinned hashes, never remote NFT-supplied URLs. Static files are not DRM; legal permission comes from the license and a qualifying acquisition.

## Validation and observed launch blockers

`scripts/test-music-market.mjs` exercises the production browser SDK and chain modules, including one-XOR price rejection, wrong network/seller/custody/metadata/license/issuer, merged seller boundaries, music-versus-cosmetic isolation, wallet-approval boundaries and release/native qualification. It also exercises offline edition preparation and rejects changed masters, issuers, sellers, domains, expiry and network identities. The records, transport and issuance-fixture asset hashes are explicitly synthetic; actual released file bytes are checked by the exporter. Its report is `artifacts/music-market-browser.json`. `tests/music-market.test.ts` provides corresponding focused Node tests for environments with a valid native SDK binding.

The worktree had no configured collection, application or XOR release identity when this work began; `.env.example` leaves these blank and market qualification false. At **2026-09-22 07:25:27 UTC**, a read-only request to `https://taira.sora.org/v1/nft-offers/capabilities` returned **HTTP 502**, so live qualification could not be established. This is an observation, not a claim about permanent network support. Live sales require the actual licensor and seller release inputs, valid native qualification, issued NFTs and open offers. Do not replace these missing inputs with demo ownership or invented offers.

The September 22 focused Node run was blocked by `ERR_IROHA_NATIVE_BINDING` / `source_provenance_error`: the sibling SDK's installed native binding did not match its source tree at that time. Existing cosmetic catalog/inventory tests failed at the same admission boundary. Those checks neither weakened the provenance guard nor changed or rebuilt the sibling Rust/SDK checkout. Browser checks use its separately supported browser adapter; they do not certify the Node issuer runtime.

## September 22 continuation

A second read-only native-market capability check at approximately 08:48 UTC again returned HTTP 502. Release configuration was absent; only `.env.example` existed. `artifacts/music-release-preflight.json` records the response-body hash, local source observations and outstanding release inputs. The Node focused tests again stopped at the SDK provenance boundary. The supported production-browser protocol suite passed 52 checks, including all 25 real master/cover/license metadata bindings with an explicitly synthetic issuer.

The user's supplied red-and-white SORA emblem now appears in all 25 covers. All final images were individually inspected and audited against generated source bytes; see `artifacts/soundtrack-cover-audit.json`. The manifest was rebuilt, and the 52 protocol checks, 16 storefront groups and three production viewports passed against the final cover hashes. All 100 files in the production bundle match the catalog. The final logo revisions changed the cover SHA-256 and consequently the native NFT metadata hash; issue only from the final reviewed catalog. No earlier cover hash is a live release.

## September 26 qualification evidence and remaining release work

The focused Node market test stopped at the source-provenance guard at **00:47 UTC on September 26, 2026**; its receipt is `output/qualification/music-node-revalidation-2026-09-26/command.json`. Unauthenticated reads of the Taira capability endpoint and `/status` returned **HTTP 502 at 02:44 UTC** that day, recorded in `artifacts/music-release-public-read-after-provider-2026-09-26.json`. These are historical observations, superseded by the October 23 checks below for current release assessment.

The isolated native streaming path passed full-size packing, known-source verification and local provider admission, restart and readback on September 26. It covered all **444 files / 1,487,166,105 payload bytes**, producing a **1,488,725,912-byte CAR**. This supersedes the original eager-directory packing blocker for that fixture; see [publication evidence](soundtrack-publication.md) and `artifacts/music-provider-local-qualification-2026-09-26.json`.

That package retains the September 22 frontend, predates later story-art corrections and has no live release configuration. The October 23 local check still found only `.env.example`. Release requires the reviewed seller, collection domain, named licensor and application/XOR/market identities; fresh native qualification; a current configured build; remote publication and retrieval; real 1-XOR editions; and verified wallet purchase and NFT delivery. Local storage success establishes none of those live outcomes.

## October 23 revalidation

The [earlier 25-track preflight](../artifacts/music-release-preflight-2026-10-23.json) records the evidence hashes, retained network pin and live release gates at that point. The [26-recording preflight](../artifacts/music-release-preflight-2026-10-23-tokyo.json) adds the approved Tokyo recording and account preparation with current build and browser evidence.

At **13:43 UTC**, anonymous reads of `/status` and `/v1/nft-offers/capabilities` returned HTTP 200. The capability reports native market support with `qualified: false`; its network is `hash:4978D0BD15FC32B834672B27BBD8A03653B1DF060A1EEE7E9374D29AF3886D91#6774`, different from retained reviewed pin `hash:0466DA18C70CA8CBD51B8CC60B1D4A4802FC5D7F928D505806D7CD6CB61D60EF#BA85`. The observed identity has not been adopted. A successful response cannot authorize a replacement pin or establish market qualification. The SoraFS capacity-state route returned HTTP 404; remote storage readiness remains unproved. Exact timestamps and response-body hashes are in `artifacts/music-release-public-read-2026-10-23.json`.

At **13:44:54 UTC**, `node --import tsx --test tests/music-market.test.ts` exited 1 before assertions with `ERR_IROHA_NATIVE_BINDING` / `source_provenance_error`. The installed binding still fails admission against current SDK source; ten observed source/manifest hashes remained unchanged. See `output/qualification/music-node-revalidation-2026-10-23/command.json` and its logs. No native source/build or provenance guard was changed. Source inspection still finds no public JavaScript NFT-registration builder; the existing native CLI `nft register` path needs an authorized, qualified issuer workflow and exact post-registration ownership/content checks before offers are signed.

Before the Tokyo addition, the corrected checkout passed **17 fixture groups at 13:52:01 UTC**, including contained bilingual labels and wallet-button reachability at desktop, 390px and 320px. The contemporary protocol and playback reports covered 52 checks and 25 previews. These counts describe the previous collection; the report paths are refreshed by subsequent expanded-collection runs.

The subsequent 25-track production rebuild at `output/qualification/frontend/soundtrack-2026-10-23-current` includes the final artwork and checkout correction. Its `freeze.json` records TypeScript/Vite exit 0, unchanged source inputs, all 916 public inputs copied byte-identically and 927 output files totaling **2,504,553,834 bytes**. That historical static run passed all 100 packaged music files and three viewports at **13:56:18 UTC** (`artifacts/music-static-2026-10-23/report.json`). It predates the supplied song and is not the 26-track release proof. September's storage qualification applies only to its historical 1,487,166,105-byte payload, so the current configured release still needs native packing/verification, full-size provider qualification and remote publication/retrieval. No live issuance, sale or NFT delivery is established.

## Approved Tokyo addition and account preparation

The user approved the supplied song under the same existing license and selected SORA Cars as artist. The original 25 synthesized recordings and their 75 WAV/MP3/preview files remain byte-identical. The current catalog adds the supplied track and cover, totaling 104 bound audio/artwork files. Artist and provenance fields change NFT metadata commitments for the collection, so issue from the new reviewed catalog only. The license text and its SHA-256 remain unchanged.

The user also authorized creating and privately persisting a fresh SORA Nexus Taira account. `artifacts/music-artist-account-2026-10-23.json` records its public preparation status. Local key/account creation is complete, but on-chain registration is not established: `/status`, `/v1/accounts/onboarding/readiness` and `/v1/accounts/faucet/policy` returned HTTP 502 at **14:37:18–19 UTC**. Exact evidence is in `output/qualification/music-issuer-account-2026-10-23/registration-readiness-recheck.json`. No chain write or NFT issuance was made, and the retained network pin was not changed. The current collection verification is tracked in [completion evidence](soundtrack-verification.md).

The expanded collection passed 15 focused audio/assets/composition/cue tests, 53 marketplace checks, 38 launch checks, all 26 browser preview decodes/full-MP3 durations, and 18 storefront fixture groups. Tokyo's fixture exercises the reviewed 1-XOR purchase, waits for reported receipt and downloads its actual WAV, MP3, artwork and license with exact byte checks. The new production build at `output/qualification/frontend/soundtrack-2026-10-23-tokyo` passes all 104 packaged music-file checks and desktop/390px/320px playback/seek/pause, route and layout checks (`artifacts/music-static-2026-10-23-tokyo/report.json`). The original 25 audio exports and covers remain byte-identical.

A final public `/status` and faucet-policy recheck returned HTTP 502 again at **14:44:58–59 UTC**; see `output/qualification/music-issuer-account-2026-10-23/registration-readiness-final.json`. No registration or funding is established by the local account preparation.

## Street-race songs (October 29)

The four street races added on October 29 each sell their own song after Tokyo's, in the collection **Japan Routes**. Each song has a 表 and a 裏 sleeve at 1 XOR each, under the same license. The catalog grows to 30 songs and 60 SKUs.

| No. | Song | Race |
|---|---|---|
| 27 | 四十八の曲がり角 / Forty-Eight Turns | Irohazaka |
| 28 | 鶴ヶ城の夕べ / Evening over Tsuruga | Aizu-Wakamatsu |
| 29 | 鴨川ライト / Kamogawa Lights | Kyoto |
| 30 | 鹿の夕映え / Deer Park Afterglow | Nara |

**Recordings.** `node scripts/export-street-songs.mjs --store` renders each route's score through the game synthesizer, as the soundtrack export does. It masters with the race's own gain and writes a 16-bit WAV master, a 320 kbps MP3 and a 30-second preview from bar nine to `public/assets/music/audio`. The songs are entered in the manifest after the supplied recordings, with provenance `game-synthesizer-score`.

These are lossless renders, not decodes of the routes' AAC files. A render is not reproducible byte for byte: two renders of the same score differ by about −29 dB. So each store song is checked against the race's `world/audio/<route>.m4a` as the same music: the same length to the frame, and a difference at least 20 dB below the music. The manifest records that difference and the route file's hash. The routes' own files are never rewritten.

A supplied-recording re-export moves Tokyo's track after these songs; `npm run assets:music-manifest` still writes the catalog in order. A full `export-soundtrack.mjs` re-render keeps only the supplied recording in the manifest, so run `node scripts/export-street-songs.mjs --store` after it. Both exporters are pinned by the manifest and were left unchanged.

**Sleeves.** Each 表 cover turns one retro-electronic object into its place, as the original set does:

| Song | 表 cover |
|---|---|
| Forty-Eight Turns | An oscilloscope whose trace leaves the screen as Irohazaka's hairpins, climbing Nantai-san into the sun |
| Evening over Tsuruga | A circuit-printed paper crane crossing the sun above the 1986 keep, which has white walls and dark grey roofs |
| Kamogawa Lights | Sixteen evenly spaced lanterns over the Kamo, lit like a step sequencer |
| Deer Park Afterglow | A Nara stag whose antlers are TV antennas, below Kōfuku-ji's pagoda |

- **Drawing.** Codex `gpt-6-astra` drew the covers at ultra reasoning, two takes per song, with four original sleeves attached as style references. The prompts, takes and choices are in `docs/art-prompts/soundtrack-japan-routes-v1.json`. A first pass of literal scenic paintings is recorded there too; the user rejected it as unlike the set.
- **Branding corner.** A generated edit added the spaced "SORA" above the white emblem square, as on most of the original set, and the emblem was checked against `sora-emblem-source.png`.
- **裏 back jackets.** `npx tsx scripts/compose-covers.mjs --only=<files>` composes them from the same logo-free takes. They are numbered No. 27–30 "/ 30" and name each place on the credit line. The first 26 jackets keep their printed "/ 26" and were not re-rendered.
- **Audit.** `artifacts/soundtrack-cover-audit-2026-10-29-japan-routes.json` records that the 52 earlier sleeves are unchanged and the 8 new ones are complete.

**Not released.** Nothing is minted, offered or published. A release-configured build includes the eight new SKUs in its catalog. The launch check reports them uncovered until their editions are issued and offered.

