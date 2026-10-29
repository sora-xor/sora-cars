# SORA CARS street-track development

This directory prepares the requested 1986 world expansion outside the maintained Iroha checkout. It is not a new live execution profile. Existing Stock/Touring gameplay and proof identities do not consume these files.

[The 49-location index](catalog-1986.md) covers 47 prefectures, Pyongyang and Moscow. Its source catalogs distinguish sourced geographic/history facts, proposed vehicle corridors, later landmarks to exclude, and remaining evidence. Each actual road must still be authored, checked against dated maps/photos, given its own artwork/music and tested in the new driving relation. Both circuits and sprints now have explicit topology; sprint routes retain their real endpoints.

## Tokyo authoring

`authoring/tokyo-1986.json` follows Manaita Bridge, Yasukuni-dori, Chidorigafuchi, Hanzomon, Diet frontage, Kasumigaseki and a moat-side return. The geographic coordinates, widths, elevations and joins are provisional authoring values, not an exact1986 survey. It is playable only as street practice; no live execution profile consumes it.

The current draft is7.013328km per lap, two laps,13gates and1,404integer samples. Matching the supplied254.952-second song would require198.06km/h average speed. This is a pacing target, not a demonstrated drive time. The300-second maximum is distinct from the existing180-second proof profiles. The song's provisional section cues still require listening and driving calibration.

`audio/yasukuni-1986.m4a` contains the complete supplied recording, transcoded to AAC192k without changing duration. Original WAV SHA-256: `1dec9e5363f891601a1758daaccd0197621cbb6f15c94b1607b4e9c500916055`. Transcoded asset SHA-256: `85401fb75fd6f1f409119dd0ea47642cb9ea173bbb2f06d7a14506febcaf84a6`. Assets are local; there is no streaming/CDN dependency. The original user file is untouched.

## Local routes

Four more 1986 routes share Tokyo's pipeline and run in the game's street practice beside it (`#/street/<id>`, or the route picker on the ready screen). Each one is a researched draft and has its own song. Alignments were checked against the GSI 1974–78 aerial photographs and dated maps where those exist. Nothing is surveyed or qualified. The research notes are in [`research/routes/`](research/routes/), with sources, timing evidence and open questions.

| Route | Catalog | Road | Topology | Length | Elevation | Song |
|---|---|---|---|---|---|---|
| `irohazaka-1986` いろは、空への四十八 | 09 | The Second Irohazaka (uphill-only since 1965) from Umagaeshi to Akechidaira, through all twenty kana curves い to ね | sprint | 7.169 km | 864 → 1,275 m | Forty-Eight Turns / 四十八の曲がり角, 3:07 |
| `aizu-wakamatsu-1986` 会津、城を望む丘へ | extra (Fukushima) | From the station through the merchant streets, past Tsuruga-jō's moats, then up Iimoriyama | sprint | 8.056 km | 214–297 m | Evening over Tsuruga / 鶴ヶ城の夕べ, 2:41 |
| `kyoto-1986` 蹴上・煉瓦の余韻 | 26 | Shiokōji, Karasuma and Shijō past Gion to Yasaka; Sanjō to Keage; under Heian Jingū's torii; back by Marutamachi and Horikawa | circuit, 1 lap | 13.176 km | 26–62 m | Kamogawa Lights / 鴨川ライト, 3:29 |
| `nara-1986` 春日・空色の稜線 | 29 | Sanjō-dōri from the JNR station past Sarusawa-ike, through Nara Park, then the Wakakusa-yama driveway's switchbacks | sprint | 6.225 km | 66 → 310 m | Deer Park Afterglow / 鹿の夕映え, 2:59 |

Each route, Tokyo included, is also a story chapter (`src/game/story-campaign-roads.ts`), raced with equal cars and its own cutscenes; see [the campaign design](../docs/story-campaign-design.md). Each of the four has 14 or 15 gates and `maxTicks` 9,000 (5:00). `targetMs` is the length of its song. In the eight-car practice field all eight cars finish every route:

| Route | Winner | Last |
|---|---|---|
| Irohazaka | 173.3 s | 184.7 s |
| Aizu-Wakamatsu | 141.2 s | 168.3 s |
| Kyoto | 201.0 s | 203.1 s |
| Nara | 158.9 s | 176.1 s |

To add a route:

1. Author `authoring/<id>.json` and `<id>.objects.json` in the Tokyo format. `npx tsx scripts/street-landmark-placement.ts world/authoring/<id>.json name=lat,lon …` reports the route progress, side and clearance of real places. Every bend must be one a car can steer (see [Drivable bends](#drivable-bends)).
2. Register it in `scripts/lib/street-routes.ts` (`STREET_ROUTE_IDS`, display names and file stems).
3. `npx tsx scripts/generate-native-street-track.ts --iroha-root <checkout> [--check]` writes, or checks, the native street compiler's tables:
   - each local route's table;
   - `routes.rs`;
   - `ROUTE_PROVENANCE.json`.

   Tokyo's table, and with it the compiler family ID, does not change. Only the browser-export module reads local routes; `iroha execution export-street-motion --route <id>` exports one (the default is `tokyo-1986`).
4. `npx tsx scripts/generate-street-race.ts --output <fresh output/ dir> --iroha-root … --native-binary … --native-sha256 … --route <id>` exports and checks the motion graphs for rosters 2–8.

   Rebuild the native binary first whenever the tables changed: `cargo build -p iroha_cli --bin iroha --features cli` in the checkout.
5. Compose the song in `src/game/street/route-songs.ts`. Each song is two 64-bar movements cut at 8-bar sections, and its tempo is set from the duration it must fill.
   - `node scripts/export-street-songs.mjs --route=<id>` renders it to `audio/<id>.m4a` through the game's own synth, in an offline audio context, mastered to −16 LUFS as AAC at 192 kbit/s.
   - `npx tsx scripts/apply-street-song.ts <id> <section>…` binds the sound record and its chapter cues, and sets `targetMs`.
6. `npx tsx scripts/street-route-timing.ts --generation <generation.json>` races eight practice cars. All eight must finish inside `maxTicks`.
7. `npx tsx scripts/package-street-assets.ts --generation <generation.json> …` (pass `--generation` once per route) writes the content-addressed bundles and songs to `public/assets/street` and regenerates the manifest.

   Each generation pins the whole native catalog. After any route's table changes, re-export every local route before packaging; unchanged routes come out byte-identical.
8. Dress the route:
   - its style in `src/game/street/routes.ts`: place, title, chapters, light and weather;
   - its scene in `src/game/three/period-city/street-scenes.ts` (see [the period city](../docs/period-city.md)).

   `tests/street-routes.test.ts` checks that every catalog route has a style, a scene covering each of its sectors, a song and a packaged bundle.

The practice AI (`src/game/street/test-driver.ts`) brakes for each mountain hairpin to a speed it can steer through, and takes hairpins on the outside line. On roads narrower than any of Tokyo's streets it steers harder toward its lane. Tokyo's field never takes these branches, so its races are unchanged.

## Drivable bends

Native steering turns a car by at most clamp(9000 − 2v, 1800, 9000) × min(v, 600) / 600 microturns a tick, so no car can hold a path tighter than about 10.6 m at any speed. The engine reads the road's heading once per 5 m cell, so each cell's widest line must clear that: the centreline radius, plus the half-width, less the car's 900 mm half-width. `tests/street-routes.test.ts` requires at least 12 m in every cell, which allows about 55 km/h.

Traced from the map, some bends were tighter than that:

- fourteen hairpins on Nara's Wakakusa driveway, 6.7–9.5 m at 2.7–3.3 m half-widths, one of which no car could steer at all;
- Aizu's 91° turn onto the Iimoriyama forest road, 7.6 m;
- Irohazaka's curve た, 8.4 m in one cell.

On 2026-10-29 `scripts/street-open-bends.ts` redrew them as shortest minimum-radius (Dubins) paths between anchors on each bend's own legs: 13 m on Nara, 12.5 m at た, and 13.5 m single arcs at Aizu's two lane corners. Nara's three right-angle corners at Kaidan-in, Daibutsu-ike and the Shōsō-in took 17–18 m trims instead.

- The legs of a switchback stay at least 4 m apart, and grades stay at or under 12%.
- Gates move to the nearest new point. Gate-anchored props keep their ground positions.
- Each route's original trace stays in `research/routes/<id>.trace.json`, and its edits in `<id>.bends.json`. `npx tsx scripts/street-open-bends.ts <id> --check` confirms that the authoring file is that trace with those edits.

Every bend now allows at least 68 km/h on its widest line, and the routes are shorter: Nara by 135 m, Irohazaka by 18 m, Aizu by 3 m. In a one-off check, a scripted driver braked to each bend's steerable speed and held the outside line:

| Route | Before | After |
|---|---|---|
| Nara | 207 s, wall contact in 14 bends | 151 s, no wall contact |
| Aizu | 135 s, wall contact in 1 bend | 131 s, no wall contact |
| Irohazaka | 184 s, wall contact in 1 bend | 183 s, no wall contact |

## Geometry contract

- Authoring coordinates are longitude/latitude E7. Projection and quadratic smoothing use floats only in the offline compiler. Browser/native consumers use the same frozen integer tables.
- Required `topology` is `circuit` or `sprint` with no default. Circuits process the first corner cyclically and begin at its midpoint. Sprints require at least two points, one lap, distinct fixed endpoints and ordered start/finish gates; endpoints are not filleted or joined by a return edge.
- `cornerTrimMm` is the tangent distance trimmed on either side of a quadratic corner, capped at 30% of adjacent edges. It is not a circular radius. The previous draft `cornerRadiusMm` field is rejected.
- Samples store eight columns: horizontal station millimetres, local east/north millimetres, elevation millimetres, road half-width millimetres, unwrapped heading microturns, diagnostic centered curvature microturns/metre, and a section ID. Positive heading turns clockwise from north; one complete turn is1,000,000microturns.
- Stations are evenly distributed integers over `ceil(length/5000)` cells. This avoids a nearly empty final cell and heading spikes caused by millimetre coordinate quantization. Each station is rounded from `i*length/cells` once, then frozen. Cells use half-open lookup intervals.
- Headings are unwrapped through the entire circuit. The final position duplicates the first; its heading differs by exactly one signed turn. Within a cell, heading is `h0 + trunc((h1-h0)*(p-p0)/(p1-p0))`, with signed division toward zero. Whole laps add the exact winding. Heading changes are differences of these values, so splitting a step or crossing the finish never accumulates rounding drift. Do not integrate the diagnostic curvature column as heading.
- Shared scalar lookup progress is bounded to ±100,000,000 mm, covering four 20 km laps plus look-ahead. Race admission will impose the tighter actual grid/finish bounds. Circuit progress uses Euclidean wrapping. Sprint progress clamps to the first/last sample and heading; `interval_at` still returns the last positive-length cell at the finish. Integer overflow must reject.
- Gates and categorical scenery sections share the nearest sample to the authored corner midpoint. Sections never interpolate numerically. Every gate begins at sample0 or increases strictly in route order.
- The compiler rejects malformed types/flags, unknown control fields, duplicate IDs, invalid audio binding, degenerate edges, centerline crossings/touches, grades over18%, excessive width taper and curvature/width combinations. Both diagnostic curvature and the actual interpolated heading satisfy the local `|curvature|*halfWidth` design bound. These checks do not prove that distant road corridors never overlap, and they do not qualify historical accuracy or a globally exact Frenet coordinate map.

## Commands and evidence

```sh
npx tsx scripts/compile-street-tracks.ts
npx tsx --test tests/street-tracks.test.ts
npx tsx scripts/test-street-native.ts
npx tsx scripts/preview-street-track.ts
npx tsx scripts/check-world-catalog.ts
npm run test:street-handling
```

Compilation produces integer JSON, matching Rust tables and SHA-256 manifests in `output/street-tracks`. The preview animates a marker through the route and offers the complete local soundtrack; it is clearly labeled as an authoring preview.

`native/street_geometry.rs` is a standalone, std-only proposed Rust arithmetic helper. The parity command compiles it with `rustc`, without Cargo or maintained Iroha edits. `output/qualification/street-geometry/report.json` records exact source/harness/binary hashes and both traversal directions. It establishes scalar lookup/heading parity only. Structural table checks in the native helper are not a substitute for compiler quality checks or compiled-profile admission.

The [handling component](native/HANDLING.md) is authored as Rust arithmetic and exported to a separate browser graph executor. The [composed two-to-eight-car draft](native/RACE.md) adds swept car contacts, native oil grip and shared breakaway signs/planters, checkpoint progression, fractional finishes and terminal outcomes. Generate it with `npm run world:race` and open `/street-lab.html` on the Vite development server for the separate Tokyo driving lab. The production menu and admitted live profiles do not consume this draft.

Next integration work is specified in [the native constraint contract](native/GEOMETRY_AIR.md). Moving traffic, staged AIR and public profile/statement binding, execution proof soundness and cost qualification, consensus admission, historical road/art review, and human gameplay/pacing qualification remain required before release.

The [checked scalar constraint component](native/SCALAR_CONSTRAINTS.md) retains every arithmetic obligation and tests raw Goldilocks witnesses independently of host replay. The compiled scalar relation now selects exact adjacent geometry rows through retained Boolean equations. Public profile binding, staged AIR, trace/statement binding and the complete STARK remain unqualified.
