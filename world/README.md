# SORA CARS street-track development

This directory prepares the requested 1986 world expansion outside the maintained Iroha checkout. It is not a new live execution profile. Existing Stock/Touring gameplay and proof identities do not consume these files.

[The 49-location index](catalog-1986.md) covers 47 prefectures, Pyongyang and Moscow. Its source catalogs distinguish sourced geographic/history facts, proposed vehicle corridors, later landmarks to exclude, and remaining evidence. Each actual road must still be authored, checked against dated maps/photos, given its own artwork/music and tested in the new driving relation. Both circuits and sprints now have explicit topology; sprint routes retain their real endpoints.

## Tokyo authoring

`authoring/tokyo-1986.json` follows Manaita Bridge, Yasukuni-dori, Chidorigafuchi, Hanzomon, Diet frontage, Kasumigaseki and a moat-side return. The geographic coordinates, widths, elevations and joins are provisional authoring values, not an exact1986 survey. No new track is enabled in the game.

The current draft is7.013328km per lap, two laps,13gates and1,404integer samples. Matching the supplied254.952-second song would require198.06km/h average speed. This is a pacing target, not a demonstrated drive time. The300-second maximum is distinct from the existing180-second proof profiles. The song's provisional section cues still require listening and driving calibration.

`audio/yasukuni-1986.m4a` contains the complete supplied recording, transcoded to AAC192k without changing duration. Original WAV SHA-256: `1dec9e5363f891601a1758daaccd0197621cbb6f15c94b1607b4e9c500916055`. Transcoded asset SHA-256: `85401fb75fd6f1f409119dd0ea47642cb9ea173bbb2f06d7a14506febcaf84a6`. Assets are local; there is no streaming/CDN dependency. The original user file is untouched.

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
