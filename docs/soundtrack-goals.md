# SORA RECORDS release goals

Requested: every major original tune as a downloadable song and illustrated NFT, sold for 1 XOR with unlimited personal and commercial use. The user also approved the supplied Tokyo song for the same license and chose **SORA Cars** as the artist name.

1. Deliver 26 complete recordings: preserve all 25 synthesized compositions and append “靖國神社で会おう / Meet Me at Yasukuni,” with WAV, MP3 and separate 30-second previews. Identify the supplied lossy AAC provenance honestly. Verify audibility, durations, levels, uniqueness, file integrity and browser playback.
2. Create 26 distinct original record sleeves, each containing the actual supplied red-and-white SORA emblem. The word SORA alone does not meet this requirement. Center the emblem on its depicted surface. Inspect every image and retain generation provenance and exact asset hashes.
3. Build a bilingual record shop at `#/soundtrack`: illustrated featured song, complete track list, preview player, clear 1 XOR price and wallet purchase review.
4. Bind each recording, cover and perpetual, royalty-free, unlimited-use license to the NFT metadata. Require a named issuer; show the license before checkout and provide it with downloads.
5. Use the native atomic NFT market. Review exact seller, network, NFT metadata, custody, price and separate fee cap. Require fresh ownership before downloads; do not treat a submitted payment as receipt.
6. Verify desktop/mobile browsing, playback, purchase review, wallet changes, delivery checks and downloads. Build the actual release and preserve test evidence.
7. Release real editions using the owner's public seller wallet, collection domain and licensor identity, then verify a real on-chain purchase. Keep live purchasing unavailable until release configuration and native market qualification are established.

## Design direction

Visual thesis: a warm ivory Japanese electronic record shop, with large tactile illustrated sleeves, black typography and a single vermilion accent.

Content plan: SORA RECORDS masthead and selected sleeve; preview/purchase details; a compact numbered track list; unlimited-use license and owned downloads.

Interaction thesis: a short sleeve entrance, a persistent listening bar, and restrained row/cover hover motion. Reduced-motion users receive a static presentation.

## Release dependencies

The current Tokyo correction uses the exact title **靖國神社で会おう** in the
storefront, player, audio tags and unsigned NFT metadata. Its generated sleeve
now depicts the large straight-beamed 神明鳥居 and a skyline without Skytree.
The accepted successor candidate is `output/music-release/taira-20261028-yasukuni/`;
the other 25 editions are unchanged. The final corrected frontend is
`output/qualification/frontend/soundtrack-2026-10-28-yasukuni-final-recovery/`.
See `artifacts/music-tokyo-correction-2026-10-28.json` for the current evidence.

The artist account milestone is complete as of October 28: the retained identity
is registered and independently verified with **25,000 testnet XOR** on SORA Nexus
Taira. Native preparation and submission succeeded with the current main-checkout
CLI; transaction `883fc275155ad83f92f39556994a9aafba151a75723cd7146a8310661dcd1c89`
was applied at block **5507**. Details are saved privately for the user, and the
public evidence is `artifacts/music-artist-account-2026-10-28.json`.

Collection ownership is also complete: `soracars.universal` belongs to that seller,
with an active one-year lease verified at block 5508. The paid setup consumed
0.5 testnet XOR plus a 0.0074 XOR fee; current observed balance is 24,999.4926 XOR.
See `artifacts/music-collection-authority-2026-10-28.json`.

All 26 unsigned issuance candidates now use the registered seller and domain,
the selected application namespace, and **SORA Cars** as artist/licensor. The
browser export verified 105 files; independent Rust verification matched 52 byte
strings, 52 hashes and 52 round trips, with 78 rejection controls. The native CLI
emitted all 26 registration instructions offline. The Taira display-prefix
checkout and owned-inventory fixes passed 122 browser checks and TypeScript.
The current production frontend also passed three viewport checks and exact
copy verification of all 920 public files; screenshots were visually inspected.
All 26 register-and-offer instruction arrays are now independently Rust-verified
and accepted by the supported native CLI's offline parser. Its later durable
prepare/submit/resume path is documented; the failed optional Node exporter does
not prevent preparing these native issuance inputs.

The market still reports `qualified: false` and differs from the retained
application network pin. A qualified release, admitted signed issuer workflow,
issuance, publication and a real purchase remain outstanding. No NFT issuance or
sale is claimed. The selected public origin supplies no configured storage-peer
target. See [current publication status](soundtrack-publication.md).
An owner question is pending for an approved publication provider ID and
upload/gateway endpoints. The current release status and resume requirements are
recorded in `artifacts/music-release-blocked-2026-10-28.json`.

The [26-recording October 23 preflight](../artifacts/music-release-preflight-2026-10-23-tokyo.json) binds historical local evidence and records `releaseReady: false`. It predates the October 28 title, artwork and account corrections.

The user authorized a fresh SORA Nexus Taira account and local owner-only persistence. Its historical preparation record is `artifacts/music-artist-account-2026-10-23.json`; the October 28 receipt above supersedes its unregistered status. At 14:37:18–19 UTC on October 23, `/status`, account onboarding readiness and faucet policy reads returned HTTP 502. The exact historical readiness evidence is `output/qualification/music-issuer-account-2026-10-23/registration-readiness-recheck.json`. Reviewed collection and application/XOR/market identities and qualified live release remain required.

Earlier, at 13:43 UTC, anonymous reads of the SORA Nexus Taira market capability endpoint and `/status` returned HTTP 200. The market reported `qualified: false` and network `hash:4978D0BD15FC32B834672B27BBD8A03653B1DF060A1EEE7E9374D29AF3886D91#6774`, different from the retained reviewed pin `hash:0466DA18C70CA8CBD51B8CC60B1D4A4802FC5D7F928D505806D7CD6CB61D60EF#BA85`. The observed identity has not been adopted. HTTP success does not qualify the market or authorize a new release pin; see `artifacts/music-release-public-read-2026-10-23.json`.

The focused Node music-market test exited 1 at 13:44:54 UTC on October 23 before assertions, with `ERR_IROHA_NATIVE_BINDING` / `source_provenance_error`. Its ten observed source/manifest hashes remained unchanged; see `output/qualification/music-node-revalidation-2026-10-23/command.json`. A coordinated source-matched issuer runtime remains necessary; no provenance guard or frozen native build was changed.

The 13:56 UTC frontend at `output/qualification/frontend/soundtrack-2026-10-23-current` is historical 25-track evidence: successful TypeScript/Vite, 100 packaged music files, 17 storefront fixture groups and three production viewports. It predates the approved Tokyo addition. The expanded build at `output/qualification/frontend/soundtrack-2026-10-23-tokyo` passed TypeScript/Vite and all 104 bound music-file checks, with 26 tracks and all three production viewports. The current focused/browser runs passed 15 audio/assets/composition/cue tests, 53 marketplace checks, 38 launch checks, 26 preview decodes/full-duration checks, and 18 storefront fixture groups, including Tokyo's four downloads. Its exact evidence is recorded in [completion evidence](soundtrack-verification.md); these local checks do not establish a published or issued release.

A final October 23 anonymous `/status` and faucet-policy recheck returned HTTP 502 at 14:44:58–59 UTC (`output/qualification/music-issuer-account-2026-10-23/registration-readiness-final.json`). This outage and the October 24 native decoding failure are historical; October 28 registration succeeded.

Full-size local packing, known-source verification and provider admission, restart and readback passed on September 26 for the complete 444-file, 1,487,166,105-byte payload. On October 28, that local path also passed for the complete historical October 23 payload: **931 files, 2,563,048,355 bytes and 20,228 chunks**. This supersedes the earlier size limitation for that fixture; its expired-retention manifest is not eligible for registration. A current configured build still needs native packing and verification, applicable provider qualification, and remote publication/retrieval, followed by real 1-XOR editions and a verified purchase/delivery. These steps depend on a qualified marketplace and approved usable publication provider; see [publication evidence](soundtrack-publication.md).
