# SORA CARS — pixel-art race renderer

Status (final build, 2026-09-26): design approved by the user on 2026-09-25. Implemented, and the default race picture since 2026-09-26 (Pixel finish on) in Arcade and Tokyo, after two refine rounds. The user has not yet reviewed the result. Nothing here claims a cutscene match. The review pack for the user is `output/browser/pixel-art/review/index.md`. The build as it stands, the decisions taken and the open ones are in [Final build](#final-build-2026-09-26); remaining gaps are in [Known limitations](#known-limitations-all-stages).

## Using it

**Picture settings and routes.**

| Route | What draws the race |
|---|---|
| Pixel finish **on** (Settings → Picture; the default), or `?picture=pixel` | The pixel-art renderer. `#race-canvas` has `data-render-style="pixel-art"`. |
| Pixel finish **off**, or `?picture=clean` | The clean cinematic render at display resolution (`data-render-style="cinematic"`). |
| `?render=regions` | The earlier display-resolution region grouping (`grouped-pixels`). |
| `?render=grouped` | Region grouping plus analytic light planes (`grouped-pixels`). |
| `?render=cinematic` | The legacy 2×2 pixelation inside the cinematic pass (`cinematic`). |

- The `?picture` override lasts for one page visit and never changes the saved choice. The `sora-cars:pixel-finish:v1` storage key is unchanged.
- The comparison routes only take effect while Pixel finish is on. With it off, every route is clean.
- Both Arcade and Tokyo use the same pass; the HUD, chapter titles, corner cue and countdown are drawn afterwards at display resolution in every mode.

**Debug switches** (URL, read once at load):
- `?pixelDebug=<view>` shows an intermediate buffer: `scene`, `resolve`, `grade`, `index`, `ramp`, `depth`, `normal`, `coverage`, `offset`, `peak`, `lut`, `marks`, `wet`, `reflect`, `held`, `cars`, `ground`, `foliage` (`final` is the normal image; `cars` is the car mask, see [car definition](#implementation-notes-car-definition); `ground` is the ground stage's lit fraction and dashes, see [ground and lamp reflections](#implementation-notes-ground-and-lamp-reflections); `foliage` shows canopy cells in green and oil-slick cells in red, see [refine round 1](#implementation-notes-refine-round-1)).
- `?pixelUpscale=nearest` makes the canvas palette-exact (one colour per art cell), for colour counts and grid checks.
- `?pixelLinework=off` or `?pixelLinework=lines,glints,glow,cleanup,foliage` selects linework stages; `?pixelSurfaces=off` or `?pixelSurfaces=field,wet,temporal` selects the surface stages; `?pixelCars=off` or `?pixelCars=mask,band,paint,lines` selects the car stages; `?pixelGround=off` or `?pixelGround=dashes,flecks,columns,dry,glints,oil` selects the ground stage's parts. `off` reproduces the frame of the earlier stage exactly (A/B captures).

**Runtime handle** (`window.__soraPixelArt`, the most recently created race world): `setDebugView(view)`, `debugView()`, `views`, `configure({...})` (every `PixelArtOptions` field, live), `options()`, `stageNames()`, `grid()`, `resetHistory()`, `moverBounds()`.

**Tools.**
- `node tmp/pixel-art/capture.mjs --help`: page, canvas, world and zoom captures plus timing (`steps.wallMs` is the reliable frame time; see [Integration notes](#integration-notes-overlays-tests-and-performance)).
- `node tmp/pixel-art/review-sheets.mjs --out <dir> <frame.png> ...`: each frame beside `garage-wide-v2.png` and `harbor-wide-v2.png` at the same height, plus 4× crops of the player car beside cutscene car crops that cover the same number of art cells.
- `node tmp/pixel-art/compare.mjs <dirA> <dirB>`: A/B numbers between two capture runs.
- `node tmp/pixel-art/mood-capture.mjs --out <dir> --size 1920x1080 --query picture=pixel --scenes arcade0,arcade1,arcade2,tokyo:0:0.02,tokyo:0.5:0.4,tokyo:1:0.72`: one frame per Arcade mood, and Tokyo at a forced chapter time (`tokyo:<dawn>:<lap fraction>`). This is a render harness: the car is moved to the lap position without the simulation. The renderer treats that jump as fast camera motion, and frames that repeat a tick keep it, so near walls show the at-speed look.
- `node tmp/pixel-art/motion/clip.mjs --mode arcade|street [--track n] --out <dir> --tag <name> --frames 300 [--clean] [--press 'ArrowLeft@20,-ArrowLeft@30']`: the production frame loop on a synthetic 60 Hz clock, one art-resolution PNG per frame (see [refine round 1](#implementation-notes-refine-round-1)).
- `node scripts/build-pixel-palette.mjs`: regenerates `palette.generated.json` from the cutscene PNGs; `tests/pixel-art-palette.test.ts` fails when a cutscene PNG changes.

## Final build (2026-09-26)

This section describes the renderer as built after refine round 2. The later sections keep the design and each stage's implementation notes, for history.

### Pipeline as built

```
scene (HDR, MSAA 4, S × art grid, depth texture)
  ─► resolve ─► normals ─► carMask ─► surface ─► reflect            (art resolution, HDR)
  ─► grade (the one tone map) ─► carPaint ─► quantize ─► temporal     (palette entries from here on)
  ─► lines ─► carLines ─► glints ─► glow ─► cleanup ─► foliage ─► sparkle
  ─► sharp-bilinear upscale to the backing canvas ─► 2D overlays on the art grid ─► crisp HUD
```

`window.__soraPixelArt.stageNames()` returns exactly this order: `resolve, normals, carMask, surface, reflect, grade, carPaint, quantize, temporal, lines, carLines, glints, glow, cleanup, foliage, sparkle`. The debug view and the upscale follow.

| Stage | Code | What it does | Switch |
|---|---|---|---|
| resolve | `stages.ts` | One colour per art cell from its S × S samples. The nearest depth layer owns the cell. Also writes the peak sample luminance, coverage and linear depth. | none |
| normals | `stages.ts` | Normals reconstructed from art-resolution depth. | none |
| carMask | `cars.ts` | Per cell: car id, body or glass, and lamp, plate and cabin zones (two draws). | `?pixelCars` |
| surface | `surfaces.ts` | Stable anchors (world point, sky direction or car-local point); the band-offset field; ground dashes (world rows at rest, screen rows at speed); lamp-lit fraction; canopy flags; oil cells. | `?pixelSurfaces=field`, `?pixelGround` |
| reflect | `surfaces.ts` | Two draws: a screen-space reflection trace, then the HDR composite. The composite adds wet-ground reflections, analytic street-lamp columns and lamp-pool flecks over a violet floor, and applies moving-cell smoothing and the wall motion filter. | `?pixelSurfaces=wet`, `?pixelGround` |
| grade | `stages.ts` | The single tone map, then the OKLab hue drive (indigo/violet shadows, amber/cream highlights), with chroma kept on car paint and sky. | none |
| carPaint | `cars.ts` | Flat paint bands, red held on the crimson ramp, navy glass. Distant cars become two livery tones, chosen in an 8 × 1 car-tone pass. | `?pixelCars=paint` |
| quantize | `stages.ts` | Band offset, then an OKLab nearest-colour LUT to the 128-colour cutscene palette. | none |
| temporal | `surfaces.ts` | Reprojected hold of last frame's palette entry (world, sky and car-local anchors; screen space for screen-row dashes), plus glint and canopy history bits. | `?pixelSurfaces=temporal` |
| lines | `linework.ts` | Selective dark outlines and creases. World rims are off by default. | `?pixelLinework=lines` |
| carLines | `cars.ts` | Car silhouette lines, continuous lit rims and panel edges, lamp blocks with bezels, the plate. | `?pixelCars=lines` |
| glints | `linework.ts` | Single cream or amber cells. Car bodies, canopy, lamp blocks and plates are skipped. | `?pixelLinework=glints` |
| glow | `linework.ts` | Emitter cores and colour-ramped halos (three draws), plus analytic street-lamp heads with a 32 × 1 visibility pass. | `?pixelLinework=glow` |
| cleanup | `linework.ts` | Orphan cells take the local majority; ink gaps are connected and lone ink dropped. | `?pixelLinework=cleanup` |
| foliage | `linework.ts` | Canopy hole filling, calmer interiors, leaf glints on the lit silhouette. | `?pixelLinework=foliage` |
| sparkle | `surfaces.ts` | Wet sparkles, rain splashes, key-light glints and oil slicks, drawn as palette entries. | `?pixelSurfaces=wet`, `?pixelGround=glints,oil` |

**Other parts.**
- The pass is `createPixelArtPass` (`pass.ts`). It has the same contract as `CinematicPass.render`, and `RaceWorld` (`world.ts`) calls it whenever Pixel finish is on and no comparison route is chosen.
- The grid helper is `grid.ts`. The palette is `palette.ts` and `palette.generated.json`. The 2D overlay rules are in `overlay.ts`.

**Per-frame inputs from `world.ts`.**
- `setWetness`, `setGroundEmitters` (the 16 nearest street-lamp lenses), `setGroundAmbient`, `setHazards` (at most 8 oil slicks), `setMoverColour`.
- Registered once: `setMovers` (the fleet) and `setPoolLights` (the lamp, shop and headlight spots).
- `resetHistory` on a course change or seek.

**Pixel mode only, elsewhere.**
- `road-finish.ts` caps spot and area-light specular on the road (`setSpotSpecularLimit` 0.12).
- The painted sky (`src/poc/painted-sky.ts`) carries the moods, popcorn clouds and harbour shore for both pictures.

**Resources.** All render targets are allocated once per grid size and disposed with the pass. Per-frame CPU work writes into preallocated arrays: lamp heads, taillights, car boxes, hazards. There is no per-frame allocation.

### Decisions taken

1. **Look (user, 2026-09-25).**
   - A visible art grid of about 560 × 315.
   - A palette of at most 128 colours from the cutscenes, with hue-shifted ramps.
   - Violet dusk, amber lamps and wet roads.
   - A crisp HUD.
   - See [Goal and user decisions](#goal-and-user-decisions).
2. **Per-track Arcade moods (user-approved).** Each Arcade track has its own cutscene mood:
   - 0 Midnight Circuit: Hakone night (radio-wide, beat-blackout).
   - 1 Harbor Run: Yokohama harbour night (harbor-wide).
   - 2 Sakura Pass: Nikko sunrise (sunrise-wide).
   - Tokyo keeps its five-chapter night → dusk → dawn progression.
   - The mood table is in [sky, moods and the lighting source](#implementation-notes-sky-moods-and-the-lighting-source).
3. **"Whatever looks cooler is better" (user rule for small visual choices).** The following were chosen by comparing renders on review sheets, not approved one by one:
   - **Rail rims: off.** Settings: `rimBeadKeep` 0, `rimBeadCells` 3, `rimThinCells` 8; `creaseBeadKeep` stays 0.7.
     - Beaded rims (keep 0.85 and 0.5) and "continuous" rims (`rimThinCells` 4, 8 and 12) were rendered on Nikko, Hakone, Harbor and Tokyo dusk/dawn frames and on 60 Hz clips.
     - Every variant put dotted cells on stair-stepped rails.
     - Without rims the lighting draws a lit rail as one solid bar, as garage-wide's railing is drawn.
     - Car rims are separate and stay continuous (`carRimKeep` 1).
     - The generic glint stage still strings gold glints along sunlit rails in Nikko (see [Known limitations](#known-limitations-all-stages)).
   - **Street-lamp heads:** drawn analytically, as flat cream ovals with an amber rim and a warm halo ramp.
   - **The road at speed:** screen-row dashes that hold still, rather than world detail that boils. There are no OutRun-style bands sweeping toward the camera; the cutscenes have none.
   - **Harbour night sky:** a far shore, container cranes and a water band (painted sky, harbour mood only).
   - **Walls at speed:** the wall motion filter is on (2 frames). This is open decision 1 below.
   - **Minimap:** a dark keyline and dot rings (content unchanged).

### Open decisions

1. **Wall motion filter (needs the user).** Settings: `wallMotionFilter` 2, `wallMotionStart` 2 cells per frame.
   - The filter averages fast near walls over two frames of their own motion. That stops the 30 Hz wagon-wheel strobe: wall A-B-A at Hakone 259 km/h is 7.7% without it and 5.2% with it (clean 4.1%).
   - It also smears facades and roadside boards at speed. The SORA board's emblem, the windows and a drainpipe are lost (`output/browser/pixel-art/review/sheets/facades-at-speed-4x.png`).
   - Both critiques prefer crisp walls (0), or an edge-preserving filter, which is not built.
   - Try it live: `window.__soraPixelArt.configure({ wallMotionFilter: 0 })` (or 1).
2. **Palette regeneration (lead).** Regenerate the palette with the v3/v4 cutscenes, and add darker livery steps. `tests/pixel-art-palette.test.ts` (provenance) fails until then, because those cutscenes are newer than the palette.
3. **Harbour identity and night value (lead).** The renderer alone cannot bring Harbor Run's frame p90 near harbor-wide's (0.22-0.29 against 0.52). That needs scenery: lit windows, harbour props, crane geometry.
4. **Forward-motion cue (user).** Bands or re-rolls sweeping toward the camera at speed. Not implemented, because the cutscenes have none.
5. **Oil-slick streak colour (user).** It is lavender under the night moon; the cutscenes have no oil reference.

### Performance (final)

Figures are median `steps.wallMs` from `tmp/pixel-art/capture.mjs` (`--timing-steps 150`): simulation, full render, GPU completion and a 1-px readback, serialized, while driving.
- Clean and pixel runs alternated: three rounds at every size, plus two more at 1920 × 1080 and 960 × 600, with the order swapped each round.
- M4 Max shared with other work; the 1-minute load average was 7-12 at the start of each run.
- Runs and reports: `output/browser/pixel-art/review/perf/` (`summary.json`, `runs.log`).

| Viewport | Mode | Backing | Clean runs (ms) | Pixel runs (ms) | Clean median | Pixel median | Pixel / clean |
|---|---|---|---|---|---|---|---|
| 1920 × 1080 | Arcade | 1920 × 1080 | 31.4, 30.9, 36.1, 46.3, 37.9 | 27.0, 31.8, 33.2, 33.7, 31.4 | 36.1 ms | 31.8 ms | 0.88 |
| 1920 × 1080 | Tokyo | 1920 × 1080 | 31.3, 32.7, 32.8, 31.5, 36.6 | 27.1, 31.8, 28.1, 28.3, 29.2 | 32.7 ms | 28.3 ms | 0.87 |
| 960 × 600 | Arcade | 960 × 640 | 23.6, 23.3, 25.9, 23.4, 23.8 | 23.6, 25.3, 26.3, 24.4, 26.7 | 23.6 ms | 25.3 ms | 1.07 |
| 960 × 600 | Tokyo | 960 × 600 | 25.0, 23.9, 28.1, 27.8, 23.8 | 23.7, 23.4, 23.8, 23.6, 26.2 | 25.0 ms | 23.7 ms | 0.95 |
| 390 × 844 | Arcade | 391 × 844 | 19.4, 20.7, 23.9 | 19.0, 19.5, 21.2 | 20.7 ms | 19.5 ms | 0.94 |
| 390 × 844 | Tokyo | 390 × 844 | 23.6, 23.4, 21.6 | 22.9, 22.4, 22.7 | 23.4 ms | 22.7 ms | 0.97 |
| 844 × 390 | Arcade | 844 × 640 | 23.6, 23.5, 22.7 | 23.6, 24.5, 23.2 | 23.5 ms | 23.6 ms | 1.00 |
| 844 × 390 | Tokyo | 1169 × 540 | 24.2, 24.7, 25.2 | 23.9, 25.8, 25.8 | 24.7 ms | 25.8 ms | 1.04 |

- **1080p.** Pixel art is 12-13% faster than clean. The scene renders at 1680 × 945, with no GTAO, bloom or composer.
- **Earlier clean figures.** Clean measured 41-48 ms at 1080p in earlier stages under heavier host load; it is the more load-sensitive of the two. Compare the ratios, not absolute times across sessions.
- **960 × 600 Arcade (watch item).** Pixel's median is 1.7 ms (7%) above clean. The runs overlap (pixel 23.6-26.7, clean 23.3-25.9 ms).
  - At this size the scene target is about the backing size (S = 2), so the pass saves no pixels, and its ~20 art-resolution draws cost about what the composer does.
  - The integration stage measured 22.3 against 28.1 ms here, before the car, ground and refine stages. A frozen-frame throughput A/B would show whether those stages cost more at small grids.
- **Phone-sized viewports:** equal within noise (0.94-1.04). They ran on the desktop GPU, so real phones are unmeasured.
- **Draw calls:** pixel is 4-12 above clean (for example 718 → 722 in Arcade and 2004 → 2013 in Tokyo at 1080p).
- **Errors:** 0 console, page and GL errors in all 26 capture runs.

### Verification (final, 2026-09-26)

- `npx tsc --noEmit` passes.
- `npx tsx --test tests/pixel-art-*.test.ts`: 48 of 49 pass. The failure is the palette provenance test: the v3/v4 cutscene PNGs are newer than `palette.generated.json` (open decision 2).
- `npm test`: 416 of 431 pass. Fourteen failures come from the sibling native checkout: `ERR_IROHA_NATIVE_BINDING`, or "Native build source state does not match provenance" (address codec, inventory, music market, wagers, forfeits, native proof process). The fifteenth is the same palette provenance test. Rendering is not involved in any of them.
- Browser tests:
  - `node scripts/test-renderer-3d.mjs` passes: six cameras, HUD, native state, hazards, resources, reduced motion.
  - `node scripts/test-cinematic-runtime.mjs` passes.
  - `node scripts/test-steering-direction.mjs` passes 73 checks.
  - `node scripts/test-street-practice.mjs` passes 33 checks.
  - `node scripts/test-speed-feel.mjs` passes when run alone: 61 ticks in 2.02 s, distance / expected 1.008, rendered / distance 0.962. Its first run, alongside captures and `npm test` under a host load of 20-80, failed only the real-time check that the simulation keeps 30 Hz over 2 s of wall time.
- `npm run build` passes, with the existing chunk-size warning.
- **Palette.** The six final pixel frames checked (the four 2500 ms frames, plus Tokyo dusk and dawn) are palette-exact at cell centres: 88-108 colours per frame, with 0 off-palette cells.
- **Errors.** All captures, the 22 motion runs and the perf runs had 0 console, page and GL errors.
- **Review pack:** `output/browser/pixel-art/review/index.md`, which lists every file with a caption.
  - `frames/`: pixel and clean at 1920 × 1080 for Arcade 0/1/2 and Tokyo night, at 2500 ms and at 800 ms after GO.
  - `moods/`: the three Arcade moods and all five Tokyo chapters, pixel and clean.
  - `sheets/`: side-by-side sheets with the cutscenes at equal art-cell density, and 4× car, lamp, ground, sky and facade crops.
  - `motion/final/`: eleven 5-second, 60 fps clips of the production loop — pixel, quarter speed, clean, and pixel over clean.
  - `perf/`.

## Goal and user decisions

The race should look like the cutscene illustrations in `public/assets/story/angles/` and `beats/`. The user calls the target "ironic retro": very nice, detailed 3D graphics underneath, with a final frame that reads as **hand-drawn pixel art**. The user asked for a custom renderer rather than texture hacks, sprites or a smear filter.

The user decided the following on 2026-09-25:

1. **Art grid:** a visible grid matching the cutscenes, about 560×315 art pixels. The short side of the view is 315 art pixels and the grid scales with the window.
2. **Palette:** limited to about 96–128 colours taken from the cutscene art, with hue-shifted ramps (shadows toward indigo/violet, highlights toward amber/cream). Car liveries must stay recognisable.
3. **Lighting:** race lighting changes to the cutscene mood: saturated violet dusk sky, warm amber practical lamps and wet reflective roads.
4. **HUD:** stays crisp and modern, drawn after the pixel image at display resolution.

Later, the user approved a separate cutscene mood for each Arcade track (Tokyo keeps its chapter progression), and set the rule for small visual choices: "whatever looks cooler is better". See [Decisions taken](#decisions-taken).

These earlier rules still apply:
- The scene stays a real, high-detail 3D scene. No sprites, billboards or cutscene planes.
- No authored brush, mark or grain textures on surfaces. The look must come from renderer algorithms. A palette extracted from the cutscene art counts as renderer data.
- No Kuwahara, oil-paint or region-smear finish.
- Native simulation, input and race arithmetic are untouched.
- `?picture=clean` stays available as the unfiltered source view.

The previous display-resolution region-grouping "Pixel finish" (`src/poc/pixel-cluster-pass.ts`) had no visible grid and cost about 45 ms per frame. It is no longer the default, but stays reachable through a comparison route.

## Measured target style

The analysis workflow on 2026-09-25 measured all 68 cutscene PNGs. The full spec lives in that run's output; this is the summary.

- **Grid:** about 3.0 source pixels per art pixel in the 1672×941 PNGs, giving roughly a 557×314 art grid. Every mark is one art cell with a hard edge. Foreground cells are sometimes coarser (1.6–2×).
- **Ramps:** 4–7 hard bands per material, never a smooth gradient. Hue rotates with lightness: L<0.2 is around h285–305 (indigo), L>0.8 is around h60–95 (amber/cream). Shadows are never grey. Whites are beige-peach under lamps and lavender at night. Red is the only strongly saturated paint.
- **No ordered or checker dithering anywhere.** The measured checker index is ≤0.36%. Band boundaries break up in four ways: ragged interlocking clusters of 1–4 cells; horizontal dashes 1 cell tall and 2–10 cells long (sky strata, water, wet ground, paint reflections); sparse single-cell speckle; and mottle of 3–4 close tones.
- **Outlines:** selective and colour-aware, one cell wide. A dark line is the fill colour with L×0.56, C×0.6 and hue rotated about −10° toward violet. Near-black appears only where the fill is already dark. Silhouettes facing a light get a 1-cell bright rim instead: L×1.8, C×1.8, hue +14° toward amber (lavender where the silhouette faces the sky or a window). Far terrain and skyline have no outline. Interior lines are sparse: panel gaps, creases, stripe edges.
- **Glints:** single cells of cream or amber (`#fdd176`, `#fee59a`, `#fdf5d5`), chains of beads along lit edges, and 1-cell horizontal highlight streaks. Speculars are never soft lobes.
- **Glow:** small, colour-ramped and speckled rings of 2–8 cells that pass through mauve and plum, never grey. There is no wide bloom.
- **Wet ground:** a 3–4 tone violet-brown/indigo mottle. Each light casts a vertical column of stacked horizontal dashes, with sparse sparkles.
- **Sky:** posterized bands of constant high chroma (indigo → violet → magenta → vermilion), broken by horizontally elongated cloud clusters. Stars are single cells.

## Architecture

This is the approved design of 2026-09-25. The build as it stands, with the car, ground and foliage stages added since, is in [Pipeline as built](#pipeline-as-built).

The code is new, under `src/game/three/pixel-art/`, and exposes a pass with the same contract as `CinematicPass.render(scene, camera, outW, outH, time)`. `RaceWorld` dispatches to it when Pixel finish is on and no comparison route is selected.

```
scene (HDR, MSAA4, S×art res) ─► cell resolve (S×S → 1, depth-aware) ─► wet-ground SSR composite (art res, HDR)
  ─► grade + tone map (OKLab hue drive) ─► ramp/palette quantize (stable band offsets, temporal hysteresis)
  ─► outlines / rims ─► glints ─► cell glow ─► orphan cleanup ─► sharp-bilinear upscale to the backing canvas
  ─► (2D) crisp HUD
```

### Grid sizing (a pure, unit-tested helper)
- Short side: `artShort = min(315, floor(backingShort / 2))`. Long side: `artLong = round(artShort × aspect)`.
- Scene supersample: `S = clamp(round(backingShort / artShort), 2, 3)`. The scene target is `artW·S × artH·S`, HalfFloat RGBA, MSAA min(4, max), with a resolved depth texture. At 1080p that is 1680×945. MSAA keeps alpha-to-coverage foliage working.
- Output: a sharp-bilinear upscale to exactly the backing size (`outW×outH`), so the 2D blit stays 1:1 and the existing tests hold (WebGL canvas dims = backing dims). Sharp-bilinear blends only across the one backing pixel at each cell border, so non-integer scales (for example 3.43) give no uneven 3/4-pixel columns.

### Cell resolve (S×S → 1)
For each art cell, read the S×S depth and colour samples and take the minimum linear depth. The foreground set is the samples within a relative depth tolerance of that minimum. If the foreground set covers at least ⌈S²/3⌉ samples, the cell's colour is the mean of those samples; otherwise it is the mean of the remaining samples. This means a silhouette gets exactly one owner and colours never blend across a depth edge. The resolve also writes: linear depth for the chosen set, the maximum sample luminance (a glint candidate), and coverage. Normals are reconstructed from art-resolution depth, using the smaller one-sided difference.

### Grade, tone map and quantize
- There is exactly one tone map. It uses the pipeline's own choice; Neutral was closest to the cutscene ambers in the lighting study.
- Grade in OKLab: rotate hue toward the target hue for that lightness, weighted by an amount that grows toward the dark and light extremes. Enforce a minimum shadow chroma toward indigo so shadows are never grey. Boost warmth in the highlights.
- Band offset: before quantizing, add a small value offset of ±½ band so band edges interlock. The offset field must be stable under camera motion. On surfaces it is anchored in world space, reconstructed from depth; the feature size adapts to distance so a feature is about 1–4 cells, with horizontal dashes about 3:1. On the sky it is anchored to the view direction. There is no Bayer or checker dithering.
- Palette: an OKLab nearest-colour 3D LUT built once on the GPU from the palette (`palette.generated.json`). It is organised as ramps; the weights keep value structure.
- Temporal hysteresis: reproject each cell into the previous frame using depth and the previous view-projection. Keep the previous palette entry while it stays within a margin of the current best match. This suppresses flicker at band boundaries.

### Lines, glints, glow and cleanup (art resolution)
- **Silhouette outline:** on the nearer side of a depth discontinuity, draw the dark-line colour derived from that cell's own palette colour, then snap it back to the palette.
- **Lit rim:** where the silhouette normal faces the key or a practical light, or a top edge faces the sky, draw the bright rim colour instead. Beading comes from a stable hash along the edge.
- **Interior creases:** from normal discontinuities, drawn sparingly. Every line fades out beyond about 90–140 m.
- **Glints:** the cell's maximum luminance compared with its mean and its neighbours, then 3×3 non-maximum suppression and a threshold. Survivors become single cream or amber cells.
- **Glow:** emitter cells (very bright) grow rings of up to 8 cells, quantised through the glow ramps with stable speckle. This replaces bloom in this mode.
- **Cleanup:** an isolated single cell that is not a glint, line or emitter takes its neighbours' majority colour.

### Wet ground
For upward-facing cells, march a screen-space reflection at art resolution over the art HDR buffer. Stretch the result vertically and mask it with stable horizontal dashes. Strength follows weather wetness, with a damp dusk baseline, and a world-anchored puddle field. Add sparse sparkles.

### Integration
- Settings: the `getPixelFinish()`/`setPixelFinish()` v1 key is unchanged; Pixel finish ON selects this renderer. `?picture=clean` gives the clean cinematic view. Comparison routes: `?render=regions` (old region grouping), `?render=grouped` (grouping plus light planes) and `?render=cinematic` (legacy 2×2). `canvas.dataset.renderStyle = 'pixel-art'`.
- 2D overlays in pixel mode: rain, petals, dust and speed lines snap to the art cell grid and use palette colours. HUD, titles and countdown stay crisp. The race `.paper-grain` overlay is hidden in pixel mode. (Implemented; see [Integration notes](#integration-notes-overlays-tests-and-performance).)
- Performance: no regression against clean mode. Measure with `tmp/pixel-art/capture.mjs`.

## Verification
- `node tmp/pixel-art/capture.mjs --out output/browser/pixel-art/<run> --modes arcade,street --sizes 1920x1080,960x600 --query picture=pixel --drive-ms 2500 --frames 4 --zoom 0.35,0.55,0.3,0.3,4` produces page, canvas, world and zoom layers plus `report.json`.
- `node tmp/pixel-art/compare.mjs <dirA> <dirB>` gives A/B numbers.
- Judge the style by looking at captures next to `garage-wide-v2.png`, `harbor-wide-v2.png` and `radio-wide-v2.png`. Tests passing is not visual acceptance.

## Implementation notes: linework

Code: `src/game/three/pixel-art/linework.ts`, created by `createPixelArtPass` and appended after `quantize`. The stage order is `resolve → normals → grade → quantize → lines → glints → glow → cleanup`, and a surfaces or hysteresis stage inserted after `normals` or `quantize` keeps working. Each stage is one full-screen draw at art resolution, except `glow`, which takes three. That is six draws in total. Every derived colour is re-snapped through the palette LUT, so the art image stays palette-exact: 85–116 colours per 960×600 frame with a nearest upscale.

**Marks.** `lines`, `glints` and `glow` write a multiple-render-target pair: the image and a marks texture. The shared `marks` uniform (RGBA8) carries the marks to later stages and to the `?pixelDebug=marks` view. A channel above 0.5 is a mark:
- r: 1 is a silhouette line, 0.8 an interior crease.
- g: 1 is a rim, 0.8 a bright ridge bead, 0.6 a glint.
- b: 1 is an emitter (lamp core or lit panel), 0.6 a halo.

Stages get an optional `beginFrame(frame)` hook. `lines` uses it to bind an all-zero marks target each frame, so disabling any stage never leaves stale marks.

**Lines** (one pass, about 30 fetches per cell):
- **Silhouettes.**
  - A neighbour's surface counts as a gap when both surfaces, continued as planes, disagree. 1/z is affine over a plane, so roads and walls score zero at any slope. If the two planes cross between the cell centres, it is a crease rather than a gap.
  - The gap must be at least 3–8% relative (`lineGapStart/Full`) and at least 0.4 m (`lineGapMetres`). That keeps lamp recesses and headrest-vs-seat steps clean.
  - Only the nearer cell draws. Three cells inward must be the same surface (not farther), so thin rails, poles and wires never become ink or dotted rims.
  - Cells with background on three sides (leaf fragments) and incoherent normals (foliage) take no dark line.
  - A top edge must stand at least 0.35 m (`lineStepHeight`) above what lies beyond it in world height. This keeps kerbs, gutters and terraces unmarked, while car roofs (about 1.3 m above the road) keep their rim.
  - Lines fade between 90 and 140 m; nothing farther and no sky cell is ever outlined.
- **Decisions use the smooth graded lightness**, averaged over the two cells inside the edge. They never use the quantized fill. The band offset makes the fill alternate between neighbouring entries, and the edge cells of grazing faces are partly covered. The first versions therefore chose rim, line or nothing cell by cell, producing dotted "fairy-light" rails and kerbs.
- **Rim or dark line.**
  - The rim side is chosen in the image plane, so one straight edge decides once along its length. An edge is a rim candidate when its outward direction faces the key light's screen direction or points up; the key light is found once per scene as the strongest top-level shadow-casting directional light. The surface must face that light and be lit (`rimMinFill`), and the background must be darker.
  - Rim colour: L×1.8 and C×~1.8, turned toward amber by 14°. The turn grows to 80° as the rim nears cream, so teal and blue paint catch amber and cream edges as in the cutscenes. Rims against the sky, and under a cool key, are lavender.
  - Rims are beaded on a world-anchored 3-cell lattice. Since refine round 1 the default keeps none (`rimBeadKeep` 0): on stair-stepped rails only the step corners passed the rim test, so lit rails read as blinking strings of lights. Car rims are separate (`carRimKeep`).
  - Otherwise a dark line is drawn: L×0.56, C×0.6, hue 10° toward violet, near-black only for dark fills. It is skipped for dark fills (`lineMinFill`), against a lighter sky (selective outlining), on emitters (above 1.5× the emitter threshold) and on edge cells that are already brighter than the surface inside them (a highlight the lighting drew).
- **Creases.**
  - Normals must differ by more than 50°, nearer than 20 m. The crease must run between two smooth faces: the normal repeats along the crease, so foliage and rubble draw none.
  - The side is picked by depth, so a whole crease chooses the same side: the nearer cell of a ridge, the farther cell of a valley.
  - Valleys take a dark line. Lit ridges take bright beads (70% kept), unless the lighting already drew them brighter.

**Glints.**
- A cell's brightest-sample luminance is compared in a 3×3 window with non-maximum suppression, and must exceed the peaks of every non-horizontal neighbour by 1.35×. Rough lit textures and bright diagonal lines (kerbs, lane paint) never break into beads.
- Horizontal neighbours within 80% survive together, which gives 1-cell streaks on bumper lips.
- Glints are single cells in the palette's `#fbf5d2` / `#fee192` / `#facd76` entries, with `#f1bd8d` on dark warm paint. They appear only nearer than 60 m; beyond that, the compressed lit road collapses into a row of beads.

**Glow (replaces bloom).**
- **Emitters.** An emitter cell has exposure-scaled HDR luminance of at least 0.9, is brighter than twice its surroundings at 2 and 4 cells, and is not on an upward-facing surface; reflections of overhead lamps on the road and on roofs are glints and palette, never halos.
- **Lit panels.** Large or brightly surrounded emitters (shop interiors, lit windows, fixtures in a lit shop) keep their detail and grow no halo; the cutscenes draw them as flat lit panels. Lamps against the dark become a flat cream core with a 1-cell amber border (`#fee192` / `#fab15a`).
- **Halo field.** The halo is a separable max-plus field: max(r² − dx²) along rows, then minus dy² down columns. It is exact Euclidean distance within 8 cells, costs 34 fetches, and carries the winning emitter's radius, hue and depth.
- **Radius.** 3 cells + 1.5 per stop over the threshold, 1–2 for neon, up to 8.
- **Ring colour.** Rings run from L 0.78 / C 0.11 at the lamp hue to the local background along the shorter hue arc. Since refine round 1 the hue is eased (t²) and the chroma falls monotonically to the background's (floor 0.03), so rings go amber → tan → rose-brown and turn plum only at the last ring; the linear arc put a saturated magenta at the midpoint.
- **Speckle and occlusion.** Stable world- or direction-anchored speckle drops 15% of cells one ring outward (30% before refine round 1). Nearer occluders keep their colour.
- **Analytic lamp heads** (refine round 1): see [refine round 1](#implementation-notes-refine-round-1).

**Cleanup.**
- A cell is isolated when no 8-neighbour is within 0.08 OKLab of it. Close entries count as one colour, so thin lit lines that alternate between two entries survive; an exact-index test broke them into dots.
- Isolated cells that are not marks take the 4-neighbour majority. Marks do not vote, and 20% stay as intentional speckle (world-anchored).

**Tunables and inspection.**
- All thresholds are in `LineworkOptions` / `LINEWORK_DEFAULTS` and are part of `PixelArtOptions`, so `window.__soraPixelArt.configure({...})` changes them live.
- `?pixelLinework=off` disables the stages; `?pixelLinework=lines,glow` keeps only the listed ones (A/B captures). `?pixelDebug=marks` shows the marks over the dimmed art image.
- Unit tests are in `tests/pixel-art-linework.test.ts`.

**Measured on 2026-09-25** (M4 Max, heavily loaded machine):
- GPU timer queries, interleaved on/off on a frozen frame: the post chain costs +0.08–0.10 ms (0.43 → 0.53 ms at 1080p, 0.15 → 0.23 ms at 960×600). The full-frame difference is within timer noise.
- Capture medians match the core stage: 1080p 31.8 / 30.6 ms against 31.7 / 29.6 ms; 960×600 24.1 / 24.9 ms against 24.0 / 24.6 ms. The frame adds 6 draw calls.
- On the player car in Arcade (1080p), 5.1% of car cells take dark marks (silhouette lines and creases) and 4.4% bright ones (rims, ridge beads and glints). The target is 8–10% each, but the cutscene cars are about five times larger on screen and draw panel gaps that are sub-cell here.
- Linework raises consecutive-frame change on the player car from 18.5% to 22.7% of cells. The base image itself shifts with sub-cell motion.

**Known limits.**
- Car glazing and lamp covers do not write depth (`asset-car.ts`), so lit interiors behind the glass can still pick up lines when the interior step exceeds 0.4 m.
- Specular lobes that the scene renders as soft blobs (for example a lamp reflected on a car roof) are quantised into rings rather than redrawn as a glint.
- Glints and rims follow sub-cell motion until the hysteresis stage exists.
- Arcade street lamps become emitters only as bright as the lighting makes them; the halo appears when the lamp head resolves above the 0.9 threshold.

## Implementation notes: surfaces and temporal

Code: `src/game/three/pixel-art/surfaces.ts`, created by `createPixelArtPass`. The stage order is now `resolve → normals → surface → reflect → grade → quantize → temporal → lines → glints → glow → cleanup → sparkle`. `?pixelSurfaces=off` restores the linework-stage frame exactly (the core placeholder band field, no reflections, no hysteresis); `?pixelSurfaces=field,wet,temporal` keeps only the listed parts.

**Anchors and moving cars (`surface`).**
- Every cell gets a stable anchor, written to the shared `anchors` texture (RGBA32F): the world position (w = 0), the view direction on the sky (w = −1), or, for cells on a moving car, that car's local position (w = car slot + 1).
- Cars are registered once with `pixelArt.setMovers(cars)` (world.ts, when the fleet is created and when the detailed fleet loads). Each frame the pass reads their world transforms and keeps last frame's. A cell belongs to a car when its world position falls inside the car's local box. The box is built from the opaque, visible meshes, and its bottom is lifted 8 cm above the car's resting plane so the road under the car stays world-anchored.
- Without this, world-anchored patterns streamed across the car body at road speed and re-randomised the player car every frame. Linework's `anchoredHash` (rim beads, cleanup speckle) now uses `artAnchor()` too, so beads ride with the cars.

**Band field.**
- The core placeholder is replaced. On surfaces the field is value noise on power-of-two lattices, chosen per axis from the cell's footprint on the surface, blended between the two nearest levels and renormalised so contrast is kept. The footprint is the image-plane step of one cell carried along the view ray onto the surface's tangent plane, so foreshortened walls and road get features that are the same number of cells on screen, not the same in metres.
  - Horizontal planes use the camera-right direction as the long axis, snapped to 8 world orientations (22.5°) and blended between the two nearest. A continuously rotating lattice would slide everywhere far from its pivot.
  - Walls use fixed x/z planes with the long axis horizontal.
  - Cars use their own axes.
- Features are 6 × 1 cells (`fieldDashCells`, `fieldRowCells`). Ground (upward world surfaces) takes a stronger offset, up to a full band (`fieldGroundGain` 3). This gives the cutscenes' 3–4-tone horizontal mottle of 1-cell rows instead of blobs.
- **Sky.** The field is anchored to azimuth (in turns, with a periodic lattice so there is no seam) and elevation, so it holds still under yaw, pitch and travel. It combines fine 8 × 1 dashes with a 4× coarser octave of cloud-strata clusters (`skyFieldScale` 0.8). The painted sky still carries the large cloud masses.
- **Motion widening.** A world feature must outlast the frame-to-frame shift, or 1-cell world detail strobes (wagon-wheel) on the near road at speed. Footprints are widened by twice the surface's travel per nominal frame, taken from a smoothed camera velocity. Per-frame reprojection alternates with the 30 Hz simulation and would pulse.
  - As the ground slides 1–4 cells per frame, the ground gain, the lit-fleck swing and the sparkles calm down. Fast ground keeps world-anchored but softer, stretched detail. **Superseded for upward ground by refine round 1**: ground dashes never use the motion widening; beyond about a cell of slide per frame they are screen-row dashes (see [refine round 1](#implementation-notes-refine-round-1)). Walls keep the widening.

**Wet ground (`reflect`, `sparkle`).**
- **Wet weight.** Only cells whose normal and 4-neighbour normals face up (normal.y > 0.85) count as wet ground, and never cars, so leaves, wires and 1-cell ledges stay dry. The weight is weather wetness times the road finish's world-anchored damp-patch field. The same hash, scales and thresholds are used as in `road-finish.ts`, so reflections are strongest where the road material is glossy. `world.ts` passes the road finish's wetness and the rain amount through `pixelArt.setWetness(wetness, rain)`. Dry dusk is 0.6, with patches carrying most reflections; rain wets everything.
- **Reflection trace.** A screen-space reflection at art resolution: the reflected ray is clipped to the screen and marched in screen space with perspective-correct inverse depth. It takes 40 steps growing linearly from 1 cell, a thickness test, and a 4-step binary refinement. Rays that find nothing take the sky where the reflected direction lands (×0.35) and fade at the screen edges.
- **Columns.** The composite takes the brightest reflection within 24 cells above and 4 below each wet cell (fading with distance). Only lights and lit panels stretch; dim reflections (poles, walls, sky) stay in their own cell. It multiplies that by Fresnel, the wet weight and a world-anchored dash mask: rows about 1 cell tall, 2-cell segments with a random phase per row, 50% duty, nothing between dashes. Level changes happen dash by dash (stable-hash level choice), never along a seam.
  - Lamp heads and shop windows now drop vertical columns of stacked amber dashes onto the road; the red sign drops a red one.
  - Lit wet ground (lamp pools) breaks into horizontal amber flecks: the same dashes swing its brightness by ±35%.
- **Sparkles** are drawn after cleanup, as palette entries:
  - amber/gold (`#fab55a`/`#fdd176`) under warm light, lavender under cool light, on up to 5% of lit wet cells;
  - pale/lavender rain splashes on up to 4% of wet cells in rain.
  - Each sits on a one-cell world lattice, and only the screen cell over the lattice centre may sparkle (the offset is carried back through the inverse footprint), so sparkles are single cells, even on oblique pavements.

**Temporal hysteresis (`temporal`).**
- A history pair (image + history, RGBA8 MRT, ping-ponged) stores, per cell: the palette index, a 16-bit log depth, the anchor kind, a state (new / same / held) and a "carried a glint" bit.
- Each cell's anchor is reprojected into last frame's image: world points directly, car cells through that car's previous transform, sky through its direction. The history is valid only when the kind matches and last frame's depth there matches where the point was (4% + the local depth slope + 5 cm).
- A valid cell keeps last frame's entry while it is within a margin of the current best match in the LUT's weighted OKLab distance. The margin is at most 0.025 and at most half the colour step to the neighbouring cells. On smooth gradients (sky), a boundary therefore lags by under half a cell instead of dragging; an early fixed margin dragged sky band edges into vertical streaks.
- The history is reset on resize, when the stage was off last frame, on a camera cut (`view` change) and on a course change or seek (`reset`). `world.ts` calls `pixelArt.resetHistory()` for the last two.
- **Glints.** The temporal stage reads last frame's final marks (intact until the lines stage draws) at the reprojected cell. A surface that carried a glint keeps it with thresholds × 0.75 (`glintHold`, linework.ts).

**Inspection.**
- `?pixelDebug=wet`: wet weight in red, dash in green, car-anchored cells in blue.
- `?pixelDebug=reflect`: the HDR the reflect stage added.
- `?pixelDebug=held`: yellow held, red no valid history.
- `?pixelDebug=offset` shows the new band field.
- `window.__soraPixelArt.moverBounds()` and `.resetHistory()`.
- All tunables are in `SurfaceOptions` / `SURFACE_DEFAULTS` (part of `PixelArtOptions`). Unit tests are in `tests/pixel-art-surfaces.test.ts`.

**Measured on 2026-09-26** (M4 Max, 1080p unless noted).
- **Texture statistics.** High-passed OKLab L, measured per art cell with the research method; the method reproduces the cutscene figures: garage sky 0.42 / 0.04, harbor wet ground 0.27 / −0.13.
  - Tokyo wet road beside the shops: hpStd 0.040 → 0.073 (harbor 0.064); vertical autocorrelation at 1 cell 0.19 → −0.05 (target −0.13).
  - Arcade road: vertical autocorrelation 0.40 → 0.21.
  - Horizontal autocorrelation stays higher than the cutscenes (0.55–0.68 against 0.27).
  - Checker index is at most 0.5%, comparable to the harbor ground's 0.44%.
- **Temporal.** Consecutive 60 Hz frames on the manual clock, off → on (`scratchpad/surf` tools):
  - **Static:** 0% change in both.
  - **Creep (about 20 km/h), player car:** same-tick change 7.5% → 4.7% (Arcade) and 20.3% → 11.7% (Tokyo); A-B-A flicker 7.2% → 2.9% and 6.1% → 1.65%.
  - **Full speed, player car:** A-B-A 8.9% → 4.3% and 4.05% → 0.73%.
  - **Sky and facades:** same-tick change roughly halves (Arcade house 11.6% → 6.0%).
  - **Rims on the player car:** tick-to-tick change 23% → 6.6% (Arcade) and 32% → 7.2% (Tokyo).
- **Cost.** Serialized frame (simulation + render + readback, alternating runs) is 25.0 → 25.1 ms Arcade and 25.9 → 26.4 ms Tokyo. Back-to-back throughput shows no measurable full-frame difference, and the post chain alone (empty scene) grows 0.51 → 0.62 ms. The frame adds 5 draws.
  - ANGLE/Metal `TIME_ELAPSED` queries around the pass report about +9 ms whenever the reflect or temporal stage runs, but wall-clock work does not grow. Treat those query numbers as unreliable for this pass.

**Known limits.**
- The near road in Tokyo changes more cells per frame at low speed (45% → 50% at 20 km/h). This is real world-anchored detail moving 2–3 cells per frame; motion widening calms it, but it cannot be held.
- Glints are view-dependent speculars that slide across the body, so reprojection keeps only some of them (Arcade car glints still change about 84% per simulation tick). Silhouette lines follow sub-cell motion of the body, unchanged.
- Street-lamp reflections land inside their own lamp pools, and lamp heads off the top of the screen cannot be reflected (screen-space). Since the ground stage, street lamps drop analytic columns instead (see [ground and lamp reflections](#implementation-notes-ground-and-lamp-reflections)); shop windows still rely on the trace.
- Rain splashes are world-anchored and static (no animation). The rain look was checked by forcing `setWetness(1, 1)`; a raining race was not captured.
- The painted sky (lighting) supplies the large cloud masses; the band field only rags band edges and adds strata dashes. The Arcade zenith stays a flat violet run.

## Integration notes: overlays, tests and performance

Integration stage, 2026-09-26. The renderer, linework, surfaces and lighting stages were already done; this stage added the 2D overlay rules, test fixes, the performance comparison, the final captures and these notes.

**2D overlays** (`src/game/three/pixel-art/overlay.ts`).
- `pixelOverlayGrid(canvas)` returns the art grid only when `canvas.dataset.renderStyle === 'pixel-art'`, so clean frames, comparison routes and the Canvas compatibility renderer are unchanged. The grid comes from the canvas backing size (`canvas.width` × `canvas.height`), exactly as the pass sizes it, not from the renderers' logical 540-pixel coordinates.
- Particles keep their clean-mode positions and motion. Their logical coordinates are converted to cells (`artWidth / width`), and each is drawn with `fillArtCells` in backing pixels using the identity transform. Cell edges are rounded the same way the upscale places them, so cells tile the canvas with no gaps at non-integer scales (a unit test checks 1080p, 960×600, 390×844 and 844×390).
- **Rain** (Arcade `#weather`, Tokyo `#rain`): vertical dashed columns of single cells, as the cutscenes draw rain (`office-window-rain`, `radio-window-rain-city`). The column length follows the clean streak length. About one cell in four is a stable gap, fixed per drop, so the dashes move with the drop rather than flickering. Far drops are periwinkle `#507dc6`; nearer drops end in a lavender `#819eed` or pale lavender `#c1c5ff` leading dot. Wind still moves the columns sideways, but they stay vertical. Arcade splashes become 1-cell-tall lavender dashes.
- **Petals and dust** (Arcade, compatibility path only today): 2×1-cell pink stamps (every third with a cell above) and 1–2-cell dust, in the palette entries nearest the clean colours.
- **Speed lines** (Tokyo): the same line, drawn as a dash of every second cell in a dusty lavender, cream while boosting.
- All overlay colours are palette entries, chosen once at load as the nearest entry to the measured or clean colour (`PIXEL_OVERLAY_COLOURS`). They are opaque, with no alpha blending.
- The HUD, chapter titles, corner cue, countdown and minimap are unchanged and stay crisp.
- `src/style.css` hides `.paper-grain` while `#race-canvas[data-render-style="pixel-art"]` is shown in the `race` or `street` view. Menus and clean races keep the grain.
- Unit tests: `tests/pixel-art-overlay.test.ts`.

**Browser tests.** Playwright's bundled Chromium is not installed on this machine. `scripts/lib/browser-launch.mjs` (`launchChromium`) launches with the caller's exact options and, only when the bundled executable is missing, retries once with the system Chrome channel, adding `--use-angle=metal` on macOS. Since refine round 1 it also probes a browser that did launch for its WebGL renderer: Playwright's headless shell (installed on this machine since 2026-09-26) runs WebGL on SwiftShader, where races take minutes per frame and tests time out; such a browser is replaced by system Chrome on the GPU. It is used by `test-renderer-3d`, `test-cinematic-runtime`, `test-steering-direction`, `test-speed-feel`, `test-street-practice`, `tmp/picture-settings-qa.mjs` and `tests/live-terms.test.ts`. The live-terms test previously hung `npm test`: its failed launch left its Vite server open. No assertion changed, except that `test-renderer-3d` now also asserts `data-render-style="pixel-art"` for all six default cameras. It still asserts that the WebGL canvas equals the backing size.

**Performance.** Median frame time (`steps.wallMs` from `tmp/pixel-art/capture.mjs`: simulation, full render, GPU completion and readback, serialized) with 120–180 manual-clock steps per run. Clean and pixel-art runs alternated on an M4 Max: two rounds at every size, and five at the phone-sized viewports, where the first two rounds were within noise. Runs are in `output/browser/pixel-art/final-build/perf/`.

| Viewport | Backing | Mode | Clean (runs) | Pixel-art (runs) | Clean median | Pixel-art median |
|---|---|---|---|---|---|---|
| 1920×1080 | 1920×1080 | Arcade | 60.4, 35.1 | 25.6, 30.2 | 47.8 ms | 27.9 ms |
| 1920×1080 | 1920×1080 | Tokyo | 48.9, 33.0 | 25.9, 27.3 | 41.0 ms | 26.6 ms |
| 960×600 | 960×640 / 960×600 | Arcade | 32.6, 23.5 | 21.3, 23.3 | 28.1 ms | 22.3 ms |
| 960×600 | 960×600 | Tokyo | 26.0, 23.3 | 22.4, 22.0 | 24.6 ms | 22.2 ms |
| 390×844 | 391×844 | Arcade | 20.7, 17.6, 16.9, 17.2, 17.3 | 18.2, 17.9, 16.6, 16.5, 16.8 | 17.3 ms | 16.8 ms |
| 390×844 | 390×844 | Tokyo | 21.7, 20.4, 21.2, 20.8, 20.8 | 21.9, 20.7, 20.5, 20.5, 20.5 | 20.8 ms | 20.5 ms |
| 844×390 | 844×640 | Arcade | 24.7, 20.7, 20.1, 20.2, 20.6 | 25.8, 21.1, 19.9, 20.3, 19.7 | 20.6 ms | 20.3 ms |
| 844×390 | 1169×540 | Tokyo | 24.2, 22.4, 23.1, 22.6, 23.6 | 29.5, 22.1, 22.1, 22.4, 22.2 | 23.1 ms | 22.2 ms |

- Pixel-art is faster than clean at 1080p and 960×600: the scene renders at 1680×945 instead of 1920×1080, with no GTAO, bloom or composer. At the phone-sized viewports the two are equal within noise. There the scene target is about the size of the backing (S = 2), so the saving is only the composer passes.
- Clean timings at 1080p varied most between runs (35–60 ms). The machine was shared with other work (load average 5–7).
- Draw calls per frame are within 3 of clean (for example 813 → 810 in Arcade and 1970 → 1964 in Tokyo at 1080p). The pass replaces the composer's draws with its own art-resolution draws.
- The desktop GPU at phone-sized viewports is not a phone benchmark. Real phone performance is unmeasured.

**Verification on 2026-09-26.**
- `npx tsc --noEmit` passes. `npx tsx --test tests/pixel-art-*.test.ts`: 25 of 25 pass.
- `npm test`: 390 of 404 pass, including `live-terms`. The 14 failures are all `ERR_IROHA_NATIVE_BINDING` ("dirty source tree … iroha_js_host.node does not match current SDK source") from the sibling native repository, unrelated to rendering.
- Browser tests pass: `test-renderer-3d` (six default cameras on the pixel-art renderer), `test-cinematic-runtime` (clean mode restores exactly), `test-steering-direction` (73 checks) and the others listed in `progress.md`.
- Final captures are in `output/browser/pixel-art/final-build/`:
  - `pixel/` and `clean/`: Arcade and Tokyo at 1080p, three frames each, with car zooms.
  - `pixel-portrait/`: 390×844.
  - `pixel-rain/`: native rain on the Arcade Harbor Run track, tick 331.
  - `pixel-nearest/`: palette-exact frames, 107 and 93 colours.
  - `compare/`: review sheets.
  - All captures have 0 console, page and GL errors.

## Implementation notes: sky, moods and the lighting source

Sky and lighting stage, 2026-09-26. Code: `src/poc/painted-sky.ts` (race path only; the garage proof's sky is unchanged), `src/game/three/world.ts` (moods), `src/game/three/road-finish.ts` (key specular ceiling). Nothing in `pixel-art/` changed.

**Per-track moods (approved by the user).** Each Arcade track has its own cutscene mood; Tokyo keeps its five-chapter night -> dusk -> sunrise progression. A mood is data (`RaceMood` in `world.ts`) that feeds the same daylight machinery as Tokyo's chapters (key colour and swing, painted sun, sky keyframes, fog, wet road):

| Course | Daylight | Night sky | Stars | Damp road | Lamps | Reference |
|---|---|---|---|---|---|---|
| 0 Midnight Circuit (Hakone) | 0 (night) | `mountain`: violet-indigo #46308f -> #211a62 | 0.75 | 0.6 | #ffb065, 620 cd, pool cone | radio-wide, beat-blackout |
| 1 Harbor Run (Yokohama) | 0 (night) | `harbor`: navy-plum #2d1d4d -> #0f0f40 | 0.8 | 0.85 | sodium #ffa24c, 520 cd, cone 1.1 rad / 32 m (refine round 1; was 640 cd, 1.3 rad, 42 m); far-shore skyline in the sky | harbor-wide |
| 2 Sakura Pass (Nikko) | 1 (sunrise) | (sunrise keyframes) | 0 | dries to 0.2 | #ffb468 x0.45 | sunrise-wide |
| Tokyo | chapter clock | `city`: indigo #2d1d54 -> #130f3d | 0.5 | 0.6, dries to 0.2 at sunrise | #ffb065 | harbor/garage/confession/sunrise |

- At night the moon key is 0.6 (was 0.35) with a small fill/environment lift, so unlit asphalt is dark violet-brown rather than black; the amber lamps still dominate.
- Nikko's sunrise azimuth is 120 deg (`sunTurn(2.09)`): ahead-right at the start, and nearly ahead through the first lap's right-hand drift. Tokyo keeps its measured sunrise azimuth.
- Toward sunrise (any course) the road dries (wetness -> 0.2), the road albedo darkens (#b8b6bc -> #9d99a3) and street lamps fade to 45%.

**Sky keyframes.** Nine stops, horizon -> zenith, at 0, 2, 4.3, 6.9, 9.5, 12, 14.9, 18.3 and 22.9 deg, so the chase view's 0-24 deg opening shows the whole rotation. Dusk away from the sun is garage-wide over confession's vermilion (#d1574b, #c84b54, #b45093, #984899, #6f3f9c, #653fa3, #4b39a1, #3c36a2, #353495); toward the sun it is the deeper confession ramp. All dusk stops keep OKLab chroma 0.12-0.19 (a unit test checks it). Night stops are authored about 0.015 chroma above the art, because the grade's dark-chroma compression otherwise lands them on a grey navy. After the pixel pass, a Tokyo dusk frame shows 7-8 posterized bands (#352a85 -> #562d81 -> #76356e -> #814d7d -> #99426d -> #ad4a61 / #c25559 -> #d95e4d), broken by cloud entries.

**Clouds.** Five strata (`RACE_STRATA`): horizon wisps, a low bank, mid lit strata, a large upper bank and sparse high wisps. Each is three anisotropic octaves of periodic value noise (base lobes 10-40 art cells wide, 2.5-5 times wider than tall), a flat-bottomed vertical envelope and a fourth octave that only scallops the silhouette. Tone -1 banks are darker violet masses from higher in the gradient with lit pink/vermilion undersides (the lowest ~3 art cells above clear sky, broken into clusters); tone +1 strata are lighter pink/coral bands with deeper cores. Toward the sun the lowest edge cell turns amber (`RIM_AMBER`). Night skies keep a few faint masses one palette step off the sky.

**Stars.** At most one per cell of an equal-area direction lattice (0.045 rad rows). Each star is drawn into exactly one art cell: the sky shader projects the star's direction and compares art-cell indices (`setArtCell`: the scene supersample in pixel art, 2 px at 1080p in clean). The brightest 6% are a 5-cell plus, 6% are 2-cell dashes, a few are peach. Display colours peak at about 0.965, which inverts to radiance just above the emitter threshold: the cleanup keeps the lone cell, but wet-ground reflections do not stretch it into a column. Measured on 8 consecutive 30 Hz frames at 1080p (Hakone, driving): 43-49 single-cell stars, 3 pluses and 1 dash per frame; 91-100% of stars persist within 2 cells to the next frame (the rest pass behind wires and poles).

**Sunrise glare.** `road-finish.ts` routes the directional key through `soraRoadDirect`, a wrapper of `RE_Direct_Physical` with a soft ceiling on the key's specular (`setKeySpecularLimit`: 0.3 at dusk, 0.06 at sunrise, linear radiance before exposure; linear below half the ceiling, exponential shoulder above). Spot (lamp/shop) speculars are untouched. With the drier, darker sunrise road, the Tokyo sunrise road (left lane, facing the sun) goes from L0.57 (p90 0.81) to L0.50 (p90 0.60) in the first pass, and further after the albedo and lamp changes.

**Lamp pools.** Street lamps use cone 1.05 rad, penumbra 0.7, range 30 m (was 1.30 / 0.5 / 34 m): a bright amber centre that falls away within ~12 m over dark violet-brown asphalt. The harbour's cone is a little wider (1.1 rad, penumbra 0.7, 32 m, 520 cd since refine round 1; its 1.3 rad / 42 m cones had lit the whole quay road orange-brown); its long columns come from the wetter road.

**Sky early-out.** In the race the sky draws after the opaque scene with a depth test at the far plane (`setDepthOccluded(true)`; it still writes no depth), so only uncovered pixels are shaded. Interleaved A/B on one frozen frame (`node tmp/pixel-art/sky-ab/sky-ab.mjs --out <dir> --scene arcade0|tokyo:<dawn>:<lap> --query picture=pixel --variants tmp/pixel-art/sky-ab/sky-timing-variants.mjs --settle 60`; 60 renders per sample, rounds 1-3, 1080p; `previous-painted-sky.ts` there is the previous shader, for timing only):

| Scene | Sky off | Previous sky | New sky, drawn first | New sky, occluded |
|---|---|---|---|---|
| Hakone night, pixel | 9.1 ms | 12.0 ms | 12.1 ms | 10.5 ms |
| Tokyo dusk, pixel | 8.6 ms | 11.1 ms | 10.6 ms | 8.9 ms |
| Nikko sunrise, clean | 10.7 ms | 15.1 ms | 14.8 ms | 13.1 ms |

The new sky costs the same as the old one when drawn first; the early-out saves 1.5-2.2 ms per frame.

**Tests.** `tests/pixel-art-sky-moods.test.ts` (dusk chroma, night moods, stars, art cell, draw order, allocation-free re-evaluation) and a new case in `tests/road-finish.test.ts` (the ceiling wraps only the directional light).

## Implementation notes: car definition

Car definition stage, 2026-09-26. Code: `src/game/three/pixel-art/cars.ts` (new), with localized hooks in `pass.ts` (stage order and options), `stages.ts` (shared `cars` uniform, `cars` debug view, `carBandStreaks`), `glsl.ts` (`artCarId`, `artCarKind`, `artCarFeature`; car cells in `artBandOffset`), `linework.ts` (`LINEWORK_COMMON` and `LINE_COLOURS` exported, `carHandoff`, car silhouettes left to the car stage, no generic glints on lamp blocks and plates) and `surfaces.ts` (the mover slots are shared). The stage order is now `resolve → normals → carMask → surface → reflect → grade → carPaint → quantize → temporal → lines → carLines → glints → glow → cleanup → sparkle`. `?pixelCars=off` gives exactly the previous frame; `mask` alone changes nothing either (checked byte for byte).

**Car mask (`carMask`, two draws).**
- Each cell's owning depth layer (the resolve's choice, so a car partly behind another belongs to the nearer one) is reconstructed in world space and tested against every mover's oriented box, inflated by max(5 cm, 0.6 × the cell footprint) at the sides and top. The bottom stays at the mover's lifted floor, so the road under a car is never car. Deepest-inside wins where boxes overlap.
- Glazing writes no depth, so a window cell resolves to what lies behind it. When the view ray crosses a car's box before that surface and the car's own cells enclose the cell on all four sides (40 × 20 cells at a 315-cell short side), it becomes that car's glass (`kind` 2).
- Features in each car's own frame, measured once per model from its named meshes: 1 the taillight frame (`TailightFrame`), 2 the rear plate (`LicensePlate`), 3 the cabin behind the glazing (`Windows`). Models without those meshes (the procedural fleet) get none and are drawn from colour structure alone.
- Shared as `cars` (RGBA8: r id, g kind, b feature). `?pixelDebug=cars` shows it: r = id × 28, g = 100 body / 200 glass, b = 160 lamp frame, 240 plate, 110 cabin.

**Paint (`carPaint`, one draw, on graded OKLab).**
- The band field no longer draws dashes across paint: on car body cells the offset is only the car-anchored field's extremes (`carStreakStart`/`Full` 0.38/0.46), so bands are flat and only a few 1-cell horizontal reflection streaks cross their edges; glass takes no offset.
- A 3 × 3 edge-preserving smoothing inside one material (ΔL < 0.06, Δab < 0.035) removes render mottle before quantisation.
- Highlights above L 0.74 keep 35% of their rise (`carLobeKnee`/`carLobeKeep`), so a lamp or sky lobe on a roof reads as one or two flat lit bands rather than rings. The strict maximum of 7 × 5 paint cells that rises 0.09 over the paint around it is flagged in the graded alpha and becomes one glint cell (cream, gold, or peach on red). A per-panel lower envelope was tried instead of the knee: its per-cell estimate mottled flat panels.
- Red paint (C > 0.09-0.105 from crimson to lamp-lit orange-red, h -35..60°) is held on the cutscene crimson ramp: lit cells turn to h26 with the ramp's chroma (#491915 → #d1423f), L above 0.56 is compressed to the lit band, and only L > 0.7 turns to the #ef915c highlight (snaps to #f29649). Lamp-lit white (C < 0.09), yellow (h > 64°) and the shade's violet rotation are untouched. This replaces the rose/coral entries (#af7086, #ea8976) that the grade's highlight drive and chroma compression produced on lit red.
- Glass (cabin cells darker than L 0.32): L = 0.1 + 0.6 L, chroma at least 0.04, hue turned 70% toward h285, so windows are dark navy/indigo with the seats and driver as lighter shapes instead of near-black.

**Lines (`carLines`, one draw, after `lines`).**
- Silhouette from the mask: a cell whose 4-neighbour is not this car (another car only when that car is farther) draws a 1-cell dark line on the car side (the fill with L × 0.56, C × 0.6, hue 10° toward violet; near-black fills are left alone). Top edges and edges toward the key take a beaded bright rim instead when the paint inside is lit (fill ≥ 0.22) and the background darker: amber/cream under a warm key, lavender toward the sky under the night moon. Beyond 35-110 m the line lightens and turns lavender (haze); lamps are never inked.
- Interior lines from colour structure, judged on the grade before `carPaint` (flattened bands and highlight patches draw no ink): an L step of 0.10-0.16, or an ab step of 0.07, to a neighbour of the same car puts a dark line on the darker side, only where the brighter side is a region (2 cells deep), so decal lettering and 1-cell trim keep their strokes. Window frames, bumper and stripe edges come from this. Glass never inks its own interior.
- The lit top edge of a panel under a darker one (the boot lid under the rear window, the bumper lip) takes a beaded bright line (`carEdgeBeadKeep` 0.8 of a 3-cell lattice), which pairs with the frame line above it.
- Lamp blocks: taillight-frame cells that are red to amber, lit, or a pale reverse lens held between red lenses, are flattened to two tones per lens section (its lit and shaded half), and the cells around them take a dark bezel. The generic glint stage skips lamp blocks and plates.
- Plate: a flat pale rectangle (the palest plate cell across 13 × 5 cells, lifted 0.08, drawn as the nearest step of the palette's warm pale greys `CAR_COLOURS.plateRamp`, #7a5d62 → #d1ae91) with a dark border where the plate is at least 3 cells across. The nearest palette colour alone landed on sage or mint entries.
- The existing `lines` stage keeps creases on car bodies; `carHandoff.lineSkipCars` hands their silhouettes to `carLines`.

**Tunables.** `CarOptions` / `CAR_DEFAULTS` (part of `PixelArtOptions`, live through `configure`): switches `carMask`, `carBand`, `carPaint`, `carLines`; mask `carPadMetres`, `carPadCells`, `carGlassReach`; band `carStreakAmount`, `carStreakStart`, `carStreakFull`; paint `carSmoothL`, `carSmoothAB`, `carLobeKnee`, `carLobeKeep`, `carGlintRise`, `carCrimson`, `carGlassFloor`, `carGlassKeep`, `carGlassChroma`, `carGlassMax`; lines `carEdgeStart`, `carEdgeFull`, `carEdgeAB`, `carEdgeMinFill`, `carHazeStart`, `carHazeEnd`, `carRimKeep`, `carEdgeBeadKeep`, `carRimMinFill`. Unit tests: `tests/pixel-art-cars.test.ts`.

**Measured on 2026-09-26** (M4 Max, 1080p, player car, art cells; `before` is `?pixelCars=off`). Five scenes (Hakone night, Harbor night, Nikko sunrise, Tokyo at 2.5 s and 7 s), mean:

| Player car cells | Before | After |
|---|---|---|
| Dark marks, all | 5.0% | 16.2% |
| — silhouette, bezels, plate border | 3.8% | 7.9% |
| — interior lines and lamp tones | 1.2% | 8.3% |
| Bright marks, all | 1.2% | 3.9% |
| — rims | 1.1% | 1.5% |
| — panel-edge beads and glints | 0.1% | 2.4% |
| Thin dark / bright lines (research measure) | 3.3% / 5.5% | 5.2% / 7.5% |

Per scene, dark / bright after: Hakone 13.4 / 3.8, Harbor 22.2 / 4.6, Nikko 17.3 / 6.2, Tokyo 12.7 / 2.4 and 15.2 / 2.5 (before 4.6-5.5 / 0.5-2.2).

- The dark share is above the 8-10% target because it now includes the whole silhouette, lamp bezels and the plate border (7.9%); interior lines alone are 8.3%. Bright lines stay below target, most in the night moods, where only sky-facing top edges catch a rim.
- The research's thin-line measure on the art image (both sides within 0.08 L, the cell 0.10 darker or brighter) gives cutscene car regions 10-13% dark and 11-15% bright at art resolution; the player car moves from 3.3% / 5.5% to 5.2% / 7.5%. The rest is sub-cell detail at race scale (panel gaps, badges, bolts).
- Liveries (white, red, teal, purple, yellow, blue forced on every car, at Hakone night, Nikko sunrise and Tokyo): all stay recognisable, and none changes family. Red is crimson with vermilion/peach top edges at sunrise instead of rose; purple and blue stay violet and indigo; yellow stays ochre-gold at night as before (lighting and palette, not this stage).
- Temporal (10 consecutive 60 Hz frames on the manual clock, player car, cars on / off): Hakone creep A-B-A 2.37% / 2.22%, same-tick 3.7% / 3.6%; Hakone full speed A-B-A 5.02% / 5.03%; Tokyo creep A-B-A 2.28% / 2.04%. The car stages add no measurable flicker; rim and edge beads ride with the car (car-local hash).
- Cost: interleaved throughput on a frozen frame (7 rounds, cars off → on): post chain alone 0.63 → 0.70 ms (Hakone 1080p), 0.80 → 0.96 ms (Tokyo 1080p), 0.47 → 0.58 ms (Hakone 960×600); full frame 10.8 → 11.1, 11.7 → 12.2 and 13.8 → 14.2 ms. So about 0.3-0.45 ms per frame. Four art-resolution draws; four art-size targets (two RGBA8, one HalfFloat, one RGBA8 MRT pair), allocated once, resized with the grid and disposed with the pass; no per-frame allocation (the feature boxes are measured once per model). Capture step medians: 24.7 / 24.7 ms at 1080p (off 24.1 / 25.6 ms), still well under clean's 41-48 ms.
- Captures: `output/browser/pixel-art/cars-final/` (`pixel`, `pixel-off`, `pixel-slow` and `pixel-slow-off` at 1080p and 960×600, `moods` and `moods-off` for Harbor and Nikko, `marks`, `mask`, `portrait`, `compare/` review sheets). All have 0 console, page and GL errors.

**Known limits.**
- Lamp, plate and cabin zones come from the detailed AE86's mesh names; another model needs those names (or gets colour-only lines).
- Race cars are about a fifth of the cutscene cars' size, so panel gaps, badges and the lettering stay sub-cell; interior line density comes mostly from frames, lamps and bumpers.
- Bright lines at night are sparse (only sky-facing rims); `carRimMinFill` and `carEdgeBeadKeep` raise them.
- The window through-view uses the scene behind the car; the cutscenes' reflected amber dots on glass are not drawn.
- The palette has no neutral mid grey, so the plate is a warm rose-beige grey rather than the cutscenes' cooler pale grey.

## Implementation notes: ground and lamp reflections

Ground stage, 2026-09-26. Code: `src/game/three/pixel-art/surfaces.ts` (inside the existing `surface`, `reflect` and `sparkle` stages; the surface stage writes a third target), with localized hooks in `pass.ts` (API, `?pixelGround`), `stages.ts` (shared `groundFields`, `ground` debug view), `glsl.ts` (declares `groundFields`) and `world.ts` (registers the pool lights once; passes lamp heads and the ambient light every frame). No new stage and no new draw. `?pixelGround=off` gives exactly the previous frame (checked cell for cell on a frozen frame); `?pixelGround=dashes,flecks,columns,dry,glints` keeps only the listed parts.

The target is the style spec's `reflections_wet_ground` and `dithering_rules`: a 3–4 tone violet-brown mottle of short horizontal dashes, lamp pools as dense amber flecks over violet, and a vertical column of stacked 1-cell dashes under every light.

**Ground dashes (`dashes`).**
- Upward world ground (normal.y > 0.55; not cars) takes hard-ended dash segments instead of the smooth value-noise band field. Rows are about one cell tall on the footprint's power-of-two lattice (the same camera-snapped orientations as the dash mask); each row has its own segment length around `groundDashCells` 2.5 (± `groundDashSpread` 0.35 octave), and the lattice level is picked per row by a stable hash, so dashes run about 1–5 cells and rows are independent. Each segment has one random value, mixed with a one-cell speckle on the same rows (`groundSpeckle` 0.6).
- The value is the band offset on ground (so quantisation interlocks by dash) and, in HDR, a brightness mottle of ± `groundMottle` 0.45 (× `groundDryMottle` 0.5 on a dry road: sunrise-wide's asphalt is calmer than the wet harbour ground).
- Road markings and kerb edges keep their colour: a cell `markingStart`–`markingFull` (1.6–2.3) times brighter than the darker of the cells 3–4 either side is left alone (albedo ratio, independent of the lighting).

**Lit flecks (`flecks`).**
- The surface stage computes each ground cell's lamp-lit fraction: the irradiance of the registered pool lights (`setPoolLights`: street-lamp pools, shop lights, headlights; Three's spot model with inverse-square falloff, range cutoff and smooth cone) against the ambient irradiance on upward ground that `world.ts` passes each frame (`setGroundAmbient`: key × its elevation, hemisphere sky colour, environment × intensity). Albedo cancels, so markings and asphalt texture keep their share. Checked against a render with the pool lights off: estimated 0.8 → measured 0.92 (Hakone), 0.69 (Tokyo, whose shop area lights are not in the list).
- The composite splits the cell's light into an unlit base (turned toward the ambient colour, `fleckTint`) and the lit rest. The lit part is drawn as the ground dashes whose value clears `1 − density`, with density = `fleckDensity` 0.65 × smoothstep(`fleckLitStart` 0.02, `fleckLitFull` 0.5) of the exposure-scaled lamp-lit luminance: dense amber flecks in bright pool centres, a few boosted flecks (≤ `fleckBoost` 3, mean-preserving) at dim rims. Between flecks the lit light drops to `fleckGap` 0.25, and that darkening grows with the density, so dim ground keeps its brightness. **Superseded by refine round 2** (the split left moderately lit road as an orange wash; see [refine round 2](#implementation-notes-refine-round-2)).
- (Before refine round 1; replaced by the screen-row dashes described there.) At speed the dash value eased from the hard segments to a smooth, motion-widened value-noise field as the ground slides 1–4 cells per frame: hard segments alias at 30+ cells per frame (near-road A-B-A flicker at full speed was 12.4% against 5.7% without the stage). That field has the dashes' length across (2.5 cells), widening to the band field's 6 where the ground slides 6–24 cells per frame; for the flecks it is spread (0.5 + 2.5 × field) so the threshold still leaves gaps, and their contrast falls to `fleckSpeedKeep` 0.5. A lamp pool at speed becomes narrow radial amber streaks over violet instead of the earlier flat orange wash.
- This replaces the earlier dash sheen on lit wet ground (`wetSheen` still applies with the flecks off).

**Lamp columns (`columns`).**
- `world.ts` passes the nearest 16 visible street-lamp lenses each frame (`setGroundEmitters`): the lens position (lamp frame (0, 6.6, −1.28)), the ground under it, the mood's lamp colour × the lens radiance (5 at 620 cd, scaled with the mood's lamp intensity and the sunrise fade) and a reflection width of 1.2 m (0.45 m before refine round 1: the lens itself; the road's roughness spreads its reflection).
- Once per frame on the CPU (`lampColumnScreen`, unit-tested) each lamp becomes a screen column: x at its mirror image in the ground plane, the far end at the ground under the lamp, width = the reflection width at the mirror image's depth, 1–6 cells (`lampColumnWidth`; 1–3 before refine round 1).
- The composite draws, on wet ground between the camera and the lamp, a glossy lobe along the column: exp(−(Δ/α)²), Δ being the lamp's elevation minus the camera's as seen from the cell (0 at the mirror point); α toward the camera is `lampLobeDamp` 0.11 rad on damp ground, rising to `lampLobeWet` 0.2 on soaked ground (half that toward the lamp). Across the column every screen row is one horizontal dash of whole cells. Since refine round 1 the dash is centred on the column axis (a quarter of the rows shift one cell), its length follows the lobe (1 + 2 × round(0.6–1.2 × lobe × (width + 3) / 2): longest at the mirror point, one cell at the ends), and it has tones: a cream core (`lampColumnCore` 1.6 ×, 1–3 cells), amber cells around it (`lampColumnEdge` 0.6 ×, varied per cell, 30% of them plum), and on a third of the rows a dim plum cell just beyond each end (`lampColumnFringe` 0.25 ×), so the column melts into the ground. Before, dashes were 2–6 flat cells jittered by up to 1.5 cells and read as floating glyphs. Rows drop out more toward the ends (20–85% kept with the lobe). Rows are counted down from the column's far end and hashed with the lamp, so the dashes ride with the column rather than streaming (or stretching) with the road at speed. The colour is the radiance × lobe × Fresnel × `lampColumnGain` 0.8 × the road's wetness weight (smoothstep 0.15–0.85, 1 in rain) × 0.55–1 by damp patch, fading from 56 to 140 m (`lampColumnFar`). The brighter of this and the screen-space column is added in HDR, so it goes through the grade and palette.
- Per mood this follows the road wetness: Harbor Run (0.85) has full-strength, longer columns; Hakone and Tokyo night/dusk (0.6) about two thirds; sunrise (0.2) none; rain the longest.

**Drying road (`dry`).** The reflection weight between damp patches (`wetDampBase` 0.35) now scales with smoothstep(0.2, 0.6, wetness), so the drying sunrise road stops mirroring the sky; damp patches keep sky-coloured, horizontally broken mirror patches (the cutscenes' puddles).

**Key glints (`glints`).** In the sparkle stage, under a warm key (dusk or sunrise sun), sunlit upward ground glints where the key's specular lobe peaks (N·H¹², `sparkleKeyLobe`; up to `sparkleKey` 0.12 of lattice cells): amber and gold single cells in the zone where the road finish caps the soft glare.

**Camera travel.** Frames that repeat a simulation tick (60 Hz frames, 30 Hz simulation; the camera moves less than a quarter of the expected step) no longer pull the smoothed camera velocity down, so motion-widened footprints stop pulsing between the two frames of a tick. On consecutive 60 Hz frames (Harbor Run, near road): same-tick change 13.3% → 2.4% at full speed and 8.4% → 2.2% at creep with the ground stage; this also helps the earlier fields (3.7% → 2.5% with `?pixelGround=off`).

**Inspection.** `?pixelDebug=ground`: red lamp-lit fraction, green the dash field, blue upward ground. `?pixelDebug=reflect` shows what the composite added. Tunables are in `SurfaceOptions` / `SURFACE_DEFAULTS` (live through `window.__soraPixelArt.configure`): `groundDashes`, `litFlecks`, `lampColumns`, `wetDryFade`, `keyGlints`; `groundDashCells`, `groundDashSpread`, `groundSpeckle`, `groundMottle`, `groundDryMottle`; `fleckDensity`, `fleckLitStart`, `fleckLitFull`, `fleckGap`, `fleckBoost`, `fleckTint`, `fleckSpeedKeep`, `groundAmbientScale`, `markingStart`, `markingFull`; `lampColumnGain`, `lampLobeDamp`, `lampLobeWet`, `lampColumnWidth`, `lampColumnFar`; `sparkleKey`, `sparkleKeyLobe`. Unit tests: `tests/pixel-art-ground.test.ts`.

**Measured on 2026-09-26** (M4 Max under heavy load from other work, 1080p, frozen frames; texture statistics after the research method on art cells: 5 × 5-cell high-pass of OKLab L, autocorrelation at one cell, same-colour runs, checker index).

| Road region | hpStd | acH1 | acV1 | runH / runV | checker |
|---|---|---|---|---|---|
| Cutscene: harbor wet ground | 0.064 | 0.27 | −0.13 | 1.9 / 1.5 | 0.44% |
| Cutscene: umbrella wet street | 0.130 | 0.28 | −0.03 | 1.5 / 1.3 | 0.04% |
| Cutscene: community pavement | 0.080 | 0.28 | −0.08 | 1.8 / 1.4 | 0.31% |
| Cutscene: sunrise asphalt | 0.036 | 0.16 | −0.09 | 2.3 / 1.9 | 0.42% |
| Hakone night, off → on | 0.039 → 0.052 | 0.57 → 0.35 | 0.20 → 0.11 | 2.5 / 1.4 → 1.4 / 1.2 | 0.10 → 0.38% |
| Harbor night | 0.045 → 0.060 | 0.57 → 0.39 | 0.21 → 0.09 | 2.0 / 1.3 → 1.4 / 1.2 | 0.14 → 0.38% |
| Nikko sunrise | 0.038 → 0.044 | 0.60 → 0.37 | 0.21 → 0.17 | 2.6 / 1.4 → 1.5 / 1.3 | 0.00 → 0.39% |
| Tokyo night | 0.055 → 0.072 | 0.56 → 0.46 | 0.03 → −0.02 | 2.3 / 1.4 → 1.5 / 1.2 | 0.10 → 0.35% |
| Tokyo dusk | 0.052 → 0.067 | 0.51 → 0.40 | 0.17 → 0.06 | 2.4 / 1.4 → 1.6 / 1.3 | 0.01 → 0.31% |
| Tokyo sunrise | 0.048 → 0.058 | 0.57 → 0.34 | 0.08 → 0.05 | 2.5 / 1.5 → 1.6 / 1.3 | 0.26 → 0.40% |

- Consecutive 60 Hz frames on the manual clock (10 frames; A-B-A flicker with the stage / `?pixelGround=off`; near road unless noted): at creep (about 20 km/h) Hakone 11.4% / 10.5% (mid road 3.8% / 4.0%), Harbor Run 12.0% / 12.6% (lamp streak 10.7% / 11.4%, mid road 3.6% / 4.0%), Tokyo 13.3% / 14.7% (right side 7.4% / 7.6%, mid road 3.4% / 2.3%); at full speed (about 260 km/h) Hakone 7.8% / 5.7% (12.4% with hard dashes at speed), Harbor Run 6.3% / 3.6% (lamp streak 8.2% / 3.4%, mid road 5.1% / 5.2%); at about 110 km/h Harbor Run 10.9% / 14.6%. Same-tick change stays 1.3–2.6% on the arcade near road.
- Forced rain (`setWetness(1, 1)`, same frames): acH1 0.06–0.25 and acV1 −0.04–0.01, with the columns at their longest and the existing splashes.
- Cost: no new draws or passes; one more RGBA32F target (the surface stage's third output, about 2.8 MB at 560 × 315); the per-frame CPU work is 16 pool lights read and 16 column projections, with no allocation. Interleaved throughput on frozen 1080p frames (same page, 4 rounds of 60 renders, ground off → on): Hakone 18.3 → 17.5 ms, Harbor Run 19.5 → 19.9 ms, Tokyo night 18.2 → 17.3 ms, so the cost is below the ±1 ms noise. Capture step medians at 1080p under a load average of about 200 from other work (two alternating rounds): Arcade pixel 42.1 / 39.4 ms, ground off 42.6 / 45.9 ms, clean 49.8 / 82.6 ms; Tokyo pixel 39.9 / 37.7 ms, ground off 38.3 / 75.1 ms, clean 45.4 / 103.6 ms. Pixel art stays faster than clean; the absolute numbers should be re-measured on an idle machine.

**Known limits.**
- Horizontal correlation is still above the cutscenes (acH1 0.35–0.46 against 0.27): much of what remains is the rendered asphalt texture itself, foreshortened into horizontal streaks at art resolution. Shorter dashes or more speckle lower it further but raise the checker index.
- The lit fraction counts only the registered spot lights. Shop area lights and emissive panels do not make flecks, and Tokyo's lit fraction runs about 0.1 high.
- Lamp columns come from street lamps only; shop windows still rely on the screen-space trace (they are on screen when their reflection is). Columns are not occluded by a car standing between the ground and the lamp's mirror direction.
- Column dashes ride with the column: at rest they are fixed, and while the camera approaches a lamp they slide with its reflection rather than rippling like water.
- (Fixed in refine round 1 by the harbour's narrower pools.) The Harbor Run's wide lamp cones lit most of the road near the start, so flecks covered most of it there.
- Rain splashes are unchanged (static, world-anchored).

## Implementation notes: refine round 1

Refine round 1, 2026-09-26: fixes for three independent critiques (style against the cutscenes, motion stability on production 60 Hz clips, gameplay readability). Code: `surfaces.ts` (ground at speed, motion smoothing, screen-space history, lamp columns, oil hazards, foliage flags, stepped camera motion), `linework.ts` (analytic lamp heads, halo ramp, foliage stage, rims off), `cars.ts` (distant cars, taillights, glint hysteresis, hue lock), `stages.ts` (grade chroma protection, `foliage` debug view), `glsl.ts` (no streaks on distant cars), `pass.ts` (`setHazards`, `setMoverColour`), `world.ts` (harbour pools, reflection width, oil and livery hand-off), `src/poc/painted-sky.ts` (popcorn cumulus, harbour shore), `src/game/renderer.ts` (minimap keyline) and `scripts/lib/browser-launch.mjs` (SwiftShader fallback). The user's rule for small choices was "whatever looks cooler is better".

**Ground at speed (the road boil and the radial smears).** Measured with `tmp/pixel-art/motion/clip.mjs` (the production frame loop on a synthetic 60 Hz clock, interpolated poses) and `analyze.mjs`; the causes, in order of size:
- *Reconstructed normals.* The art-resolution normal of grazing asphalt jitters by a few degrees frame to frame, and through the footprint it re-picked the dashes' lattice levels cell by cell every frame. Upward world ground now takes its footprints on the level ground plane.
- *Fine world detail sliding 1-30 cells per frame* aliases whatever its shape (hard dashes strobe, the old motion-widened field smeared radially). Beyond `groundSpeedStart`..`groundSpeedFull` (0.3-0.9 cells of slide per frame) each dash turns, dash by dash, into a **screen-row dash**: rows are the screen rows (exactly one cell tall), cut into dashes whose ends sit at the world's lateral position, `dot(p - camera, level right) + the camera's accumulated lateral travel` (`createLateralTravel`). Driving straight a lateral world position keeps its column in a row, so the dashes hold still; steering slides them sideways with the world. Dashes last at least 2.5 frames of the sideways slide and lose the one-cell speckle when sliding (corners), and each row's speckle lattice has its own phase (aligned across rows its edges drew lines toward the vanishing point). Their mottle keeps `groundSpeedMottle` 0.7.
- *The rendered asphalt, grass and facade textures* alias in the cell resolve once they slide a fraction of a cell per frame. Moving world cells (all of them: ground, walls, foliage) take an edge-preserving 5 × 3 mean over cells of the same depth layer and similar light (`groundSpeedSmooth`); pools, shadows, windows, silhouettes and paint are edges or smooth and stay. At rest nothing is smoothed.
- *History.* Ground drawn with screen-row dashes keeps its temporal history in screen space, as its dashes do (the same cell last frame carried the same dash), with a margin of `temporalSpeedMargin` 0.04.
- *Thresholds riding on wobble.* The smoothed camera speed and turn still wobble frame to frame (60 Hz frames of a 30 Hz simulation), and a dash whose mode threshold sat on that wobble flipped every frame. The speed and the yaw rate (which now also counts toward each cell's slide: corners sweep the far road sideways) are held on quarter-octave steps with hysteresis (0.75 of a step) and at most one change per 0.3 s (`createStepper`).
- World rows (at rest and slow) are at least one cell tall (`groundRowOctave` 1): cell-centre sampling never skips a row. Walls sliding 4+ cells per frame keep `fieldWallSpeed` 0.4 of their band field.
- Sparkles go once the ground slides about two cells per frame; key glints fade on a drying road (`sparkleKeyDry` 0.15 of `sparkleKey` at wetness 0.2: Tokyo dawn's gold confetti is gone). Screen-space wet reflections at speed count their dash rows from the reflected source, so a shop window's column of dashes rides with it instead of turning into a smooth capsule.

A-B-A reversals (% of region cells per consecutive 60 Hz frame, 1920 × 1080; old → new, clean in brackets; nine clips as in the motion review; metrics, heatmaps and scripts in `output/browser/pixel-art/refine1/motion/`):

| Clip | Near road | Mid road | Whole frame |
|---|---|---|---|
| Hakone 259 km/h | 7.92 → 1.25 (0.77) | 8.28 → 1.39 (0.65) | 6.96 → 4.31 (1.84) |
| Hakone 108 km/h | 7.82 → 1.94 (0.95) | 7.69 → 1.91 (0.60) | 5.79 → 3.90 (1.72) |
| Hakone creep | 6.75 → 0.66 (1.19) | 4.34 → 1.31 (0.22) | 4.00 → 2.10 (0.88) |
| Hakone corner | 7.68 → 2.63 (1.26) | 7.74 → 2.36 (1.09) | 6.14 → 4.34 (2.01) |
| Harbor 259 km/h | 7.23 → 1.23 (1.45) | 7.77 → 1.20 (0.80) | 7.27 → 4.97 (2.16) |
| Nikko 259 km/h | 10.33 → 2.90 (3.59) | 10.41 → 2.59 (3.53) | 7.47 → 4.29 (3.63) |
| Tokyo low | 8.69 → 1.36 (0.80) | 8.58 → 1.90 (0.60) | 5.82 → 3.38 (1.47) |
| Tokyo full | 7.03 → 2.45 (1.37) | 7.40 → 2.04 (0.94) | 5.72 → 3.95 (1.72) |
| Tokyo corner | 3.98 → 1.73 (0.73) | 3.23 → 1.28 (0.35) | 3.04 → 2.27 (0.98) |

The near road is within about twice clean in every clip (corners 2.1-2.4 ×); blink on the near road fell from 6-14% to 1-9%. The sky is unchanged (as stable as clean). What remains is mostly not the road: the analyzer's "far road" region (upward cells in the upper 55% of the frame: awnings, balconies, terrain beside the road) stays at 2.5-4.7% against 0.1-2.5%, and facades at 3-15% against 1-8% (the resolve's aliasing of fine geometry; the smoothing and the calmer wall field take off only 0-4 points). Rival cars (2-6%) and the player car are unchanged by these stages.

**Lamp columns.** Wider (the 0.45 m lens reflects about 1.2 m wide on rough wet asphalt; `lampColumnWidth` 6), centred, tapering with the lobe and toned cream / amber / plum; see [ground and lamp reflections](#implementation-notes-ground-and-lamp-reflections). They and screen-space reflections skip lane paint.

**Lamp heads and halos** (reworked in [refine round 2](#implementation-notes-refine-round-2): larger flat heads held on cells, one visibility decision per lamp, squashed halos, a warm ring ramp). Every lens passed to `setGroundEmitters` whose intensity is at least half the moods' nominal (sunrise lamps fade out) is projected into art cells each frame and, where nothing nearer hides it, drawn in the glow seed as a stair-stepped flat ellipse wider than tall (half-width `lampHeadSize` 0.35 m, 0.5-2.5 cells): cream `#fbf5d2` core, `#fab15a` rim, seeding a halo of `lampHeadHalo` 3 + `lampHeadHaloNear` 2 × nearness cells whatever the HDR threshold says. Bright cells around a head seed no second halo. Far lamps (60 m and beyond) that never reached the emitter threshold now read as a core plus rings, and near ones as a cream ellipse instead of a pink fuzzball. Halo rings follow the eased ramp above.

**Foliage mass** (extended in [refine round 2](#implementation-notes-refine-round-2)). The surface stage flags a cell as canopy when at least `foliageTurns` 0.6 of the 12 neighbouring normal pairs in its 3 × 3 window turn 30 degrees and the mean normal is short (a crease between planes turns only the pairs across it); never at the image border. Canopy cells carry anchor w = 0.25 and one band offset per domain-warped world clump of about `foliageClumpCells` 5 cells. The new `foliage` linework stage (after cleanup, one draw) fills background cells with at least `foliageFill` 5 of 8 canopy neighbours in front of them with the darkest of those (sky holes and twig lace close up; bigger sky clusters stay), and under a warm key puts 1-2-cell amber/gold leaf glints (`#fab55a`/`#fdd176`) on `foliageGlint` 0.3 of the lit canopy silhouettes against sky or far background (the edge cell is lit, graded L ≥ 0.3, with at least 4 canopy neighbours). Roof ridges and eave rafters can pass the canopy test; they take a clump offset but no glints. `?pixelDebug=foliage`.

**Rims.** World rims are off by default (`rimBeadKeep` 0): with them on, a lit guardrail's stair steps drew a blinking string of cream beads (23, 12, 12, 6, 6, 12 cells over six frames); off, the lighting draws the rail as a solid lit bar, as garage-wide does. Car rims are unchanged.

**Distant cars (readability).**
- The grade no longer compresses dark chroma on car paint (`carChromaKeep` 1), and its shadow drive decides protection from the chroma before any compression, so a dark teal livery or a red vending machine in shade keeps its hue instead of turning navy.
- `world.ts` passes each car's livery colour (`setMoverColour`, cached per slot). From `carFarStart` 28 to `carFarFull` 42 m a car's paint becomes two flat tones of its palette livery ramp (`liveryRampFor`: the race liveries and club skins by name): the pair of neighbouring steps nearest the ramp's middle whose tones both stand `carFarContrast` 0.1 L off the road around the car, split at the car's local mean lightness. Distant cars take no streaks, interior lines, glints or beads (`carMarksFar` 22 m, `glintCarFadeEnd` 22 m), keep their dark outline (haze now 70-200 m) and get an analytic taillight pair: the `TailightFrame` box halves projected into cells, lamp red `#d13d32`, whenever the rear faces the camera.
- Lit paint keeps its livery's hue within `carHueLock` 25 degrees (a teal rival under an amber lamp stays teal).
- Opponent contrast (`critic-readability/evidence/carvis.mjs`, the same frame; SNR = contrast against the road's noise): Hakone night, cars 68-116 m ahead: 0.35-1.56 → 0.58-3.31 (clean 0.35-1.34), car chroma 0.024-0.045 → 0.032-0.071, cars under half the road noise 5/7 → 0/7. Nikko sunrise: 0.19-1.51 → 0.68-1.89 (clean 0.17-1.06).

**Player-car glints.** carLines keeps a glint the car carried last frame (the temporal history's glint bit, reprojected with the car) while its cell is within 0.03 L of the local peak, and a new peak within 7 × 5 cells yields to it; bead and rim colours come from the smooth paint, not the quantised fill. One-frame glints on the player car (Hakone 108 km/h): 28.4% → 2.8% of glint cells; there are more of them per frame (8 → 19), mostly beads along the bumper and boot edges.

**Oil slicks.** `world.ts` hands each visible slick's ellipse (centre, heading, half width and length) to `setHazards` every frame (at most 8). The surface stage flags ground cells inside it (core, ring, and two one-row highlight streaks across it), zeroes their band offset, wet weight, flecks, columns and sparkles, and the sparkle stage draws them last as palette entries: a flat two-tone dark gloss (`#161625`/`#222239` at night, `#312631`/`#413241` under a warm key), a darker 1-cell outline and lavender `#819eed` (or amber) streaks. In the run9 frame (oil 18 m ahead) it was invisible; now it is an outlined dark oval with two light streaks. `?pixelGround=...,oil`.

**Lane paint.** Styled ground never rises above `groundPaintCap` 1.5 × the darker ground either side (or its own light), fleck boost is 1.5 (was 3), mottle, flecks and band offset calm by `groundFarCalm` 0.7 between 35 and 80 m, sub-cell paint is recognised by its brightest sample too, and reflections, columns and sparkles skip paint cells. Damp-patch mirrors of sky and walls add at most `wetPatchCap` 0.8 of the ground's own light (lights and lit panels keep their full columns).

**Sky** (`painted-sky.ts`, race path; clean and pixel alike).
- *Popcorn cumulus* at dusk and sunrise: one rounded lobe per cell of a fixed direction lattice (512 columns per turn, 180 rows per radian, about 3.5 × 1.6 art cells at 1080p, never tied to the art cell so a speed-driven FOV change cannot re-roll it), grouped by a slow field, up to about 30 degrees; lit and shaded clusters one step off the band, a lit underside cell turning amber only toward the sun. Palette-snapped flat interior of the sky (critique method): Nikko 59% → 38%, Tokyo dawn 58% → 35%, Tokyo dusk 56% → 35% (garage-wide 33%, sunrise-wide 20%); horizontal runs 5.5-8.8 → 3.5-4.0 cells (cutscenes 1.6-3.3).
- The grade skips its light-chroma compression on sky cells: the sunrise halo keeps its saturated peach instead of beige.
- *Harbour shore* (the `harbor` night only): a violet skyline of blocky tops up to about 0.8 degrees at the horizon, sparse 1-cell amber and pale window dots in it and a few red crane warning lights above it, each drawn into exactly one art cell like the stars and below the emitter threshold (no halos or columns). With the narrower harbour pools this is what separates Harbor Run from Hakone; the track's own trees hide much of the horizon.

**Minimap.** A 4 px dark keyline under the path and a dark ring around each dot keep it legible over the Nikko sunrise sky (content unchanged).

**Checks and cost.** `npx tsc --noEmit` passes; `npx tsx --test tests/pixel-art-*.test.ts` 44/45 (the palette provenance test fails because the v3/v4 cutscenes are not yet palette inputs; regenerating the palette is a lead decision); `node scripts/test-renderer-3d.mjs` passes; `node scripts/test-street-practice.mjs` with the default launcher now falls back from SwiftShader and passes 33 checks. All captures have 0 console, page and GL errors. Capture step medians at 1080p, alternated (`output/browser/pixel-art/refine1/perf`, load average about 25): pixel Arcade 36.8 / 34.0 ms, Tokyo 36.0 / 33.0 ms; clean 41.8 / 37.6 ms and 42.0 / 39.2 ms. The frame adds one art-resolution draw (foliage); the composite's smoothing costs about 40 fetches per moving world cell. No new targets and no per-frame allocation (the new per-frame CPU work is 16 lamp-head and 8 taillight projections into preallocated vectors).

**Captures.** `output/browser/pixel-art/refine1/final/`: `pixel` (2500 ms drives, zooms), `pixel-800`, `clean`, `pixel-portrait` (390 × 844 at DPR 3), `moods` (the three Arcade moods and Tokyo at dawn 0, 0.5, 0.8, 1) and `pairs` (same-frame pixel/clean for the distant pack, the oil slick and the car masks).

**Not done in this round.** Dotted diagonal silhouettes (connect-or-drop), the plate's step memory and taillight tone split from geometry, the palette regeneration with the v3/v4 cutscenes and darker livery steps (lead decision), the Arcade landscape layout (`#app` min-height, not the renderer), and the facade and roadside flicker above.

## Implementation notes: refine round 2

Refine round 2, 2026-09-26: fixes for two critiques of round 1 (style against the cutscenes; motion on production 60 Hz clips). The user's rule for small choices is "whatever looks cooler is better". Code: `surfaces.ts` (ground style and flecks, markings, wet reflections, wall motion filter, canopy hysteresis and smoothing, eased mode pick, oil), `linework.ts` (lamp heads and halos, leaf glints, ink cleanup, glints and ridge beads off car bodies), `cars.ts` (continuous lit edges, point glints, distant-car tone pass), `stages.ts` (debug view decode), `world.ts` (sunrise pools, pixel-mode road specular ceiling), `road-finish.ts` (spot and area-light specular ceiling, no glossy patches on a drying road) and `src/poc/painted-sky.ts` (harbour cranes, taller skyline and water band, orange-peach striated sun halo, pinker dusk popcorn bodies). No new render targets at art size; three tiny ones (lamp visibility 32 × 1 and car tone 8 × 1, both ping-ponged) and the glow seed became a ping-pong pair.

**Lamp pools: flecks, not an orange wash (the P0).** On moderately lit road the round-1 split kept almost all of the lamp light in every cell (the gap darkening grew with a brightness the road never reached), so the near road at every Arcade night start was a uniform orange-brown sandpaper (Hakone L0.47, 97% orange cells). Now, in `groundStyle`:
- Of the lamp-lit light, only a dim share up to `fleckFloor` 0.05 (exposure-scaled; under Neutral's toe that is the cutscenes' violet-grey ground, L about 0.25) stays in every cell, turned toward the ambient colour by `fleckTint` 0.65 (plum-brown rather than blue-violet).
- The rest is drawn only as flecks: density `fleckDensity` 0.25 in pool centres, `fleckSparse` 0.3 of that in dim fringes (level on the excess over the floor, `fleckLitFull` 0.25), gaps at `fleckGap` 0.15 of it wherever the light is lamp light, the flecks carrying about `fleckKeep` 0.65 of it (at most `fleckBoost` 3.5 ×, and the paint cap). `fleckSpeedKeep` is 1 (the dashes at speed are screen-anchored and stable).
- The fleck pick is the ground's whole dash value mixed with `fleckSpeckle` 0.5 of its one-cell speckle (`groundFields.x` now packs both: whole units of 1/255 the dash, the fraction the mottle value), so flecks are 1-4-cell horizontal marks, not brick blocks or checkerboards.
- The ground style follows the cell's own normal (the wet weight keeps the four-neighbour test), and a marking must be brighter than the ground on both sides (cells 3-6 either way): beside a dark gutter, a car's shadow or a kerb, lit asphalt had passed as paint and kept its orange.
- `fleckSplit.w` fades the fleck split out as the street lamps fade toward sunrise (lens level 0.5-0.85), and `world.ts` fades the pools themselves to `SUNRISE_POOL_GAIN` 0.15 (lenses keep 0.45 for weak streaks): at 45% the pools still washed Tokyo's sunrise road warm brown.
- World rows at rest are about a cell tall (`groundRowOctave` 1 → 0.5, `groundSpeckle` 0.6 → 0.3) and the moving-ground smoothing is 5 × 1 on ground (5 × 3 elsewhere): no 2-4-cell bricks.

**Wet reflections.**
- `road-finish.ts` gains `setSpotSpecularLimit` (the key's soft ceiling applied to spot lights and, through a `RE_Direct_RectArea` wrapper, to the shop tubes' area lights); `world.ts` sets it to `PIXEL_ROAD_SPOT_SPECULAR` 0.12 while the Pixel finish draws (clean keeps full highlights). The smooth airbrushed lobe beside the cars in Tokyo was the shop tube's LTC highlight.
- A light's screen-space column is now stacked long dashes at rest too, rows counted from its source: `wetColumnDashCells` 6, `wetColumnDashDuty` 0.85, `wetColumnRowKeep` 0.9 (the world-anchored 2-cell mask read as a leopard dissolve); damp-patch mirrors use 4-cell dashes at 0.65 duty (`wetDashCells`, `wetDashDuty`).
- Street-lamp columns: a thinned row keeps one dim cell on the axis near the lobe's core instead of going dark across the column, a quarter of the rows shift a cell each way, and long dashes take 1-cell breaks: one body of stacked dashes, not a totem.
- Reflections, lamp columns and key glints need level ground (`smoothstep(.93, .98)` on the four-neighbour normal.y): no amber glyphs on grass banks.
- A drying road (wetness ≤ 0.2-0.35) keeps no glossy damp patches (`road-finish.ts` and the pass alike): the pale lavender sky smear beside the cars at sunrise is gone.

**Lamp heads and halos.**
- Heads are held on slots (`createLampHeadSlots`, 32 slots for 16 heads; a lamp keeps its slot by world position): the centre cell moves only when the projection leaves it by 0.75 cell, the half-width snaps to half cells with 0.35 hysteresis, the halo radius to whole cells with 0.85.
- One visibility decision per lamp (a 32 × 1 pass: the share of the core's cells nothing nearer hides; on above 0.6, off below 0.3), and a visible head is drawn whole: leaves and wires no longer blink it cell by cell.
- Shape: a cream core about twice as wide as tall (`lampHeadSize` 0.45 m, 0.5-3 cells: 7 × 3 near) with a 1-cell amber rim at its ends; halos `lampHeadHalo` 3.5 + `lampHeadHaloNear` 1.5 cells, `lampHeadSquash` 1.4 × wider than tall.
- Warm halo ramp: hue 58° → 35° (rose-brown), chroma falling from `glowChroma` 0.13 before the hue turns, lightness falling fast then slowly; only the last ring turns toward the background (plum). It no longer passes #99426d on the violet sky.
- Halo speckle hashes the offset to the emitter cell (the spread target is 32-bit and carries the winning emitter's column), and ring colours read the smooth grade rather than the quantised entry.
- HDR emitters (shop tubes and fixtures) keep last frame's decision and radius (ping-ponged seeds, reprojected): the threshold and contrast drop to 0.8 × for a held emitter, the radius comes from the brightest emitter cell around, on whole cells, kept unless it moves by 0.75.

**Cars.**
- Silhouette rims and panel-edge lines are continuous (`carRimKeep` 1, `carEdgeBeadKeep` 1). The outward direction comes from the car's cells in a 5 × 5 window, so a stair-stepped flank decides alike along its length. Under a cool key only top edges take a (lavender) rim; panel edges are warm, need lit paint (`carEdgeLit` 0.5), never face down, and need a neighbour along the edge that passes too.
- Paint glints are point highlights: the peak must also stand clear of the paint 3 cells along its row (a lit bumper lip took a glint at every local maximum). The generic glint stage and the lines stage's ridge beads leave car bodies to the car stage.
- Distant cars: one tone pair per car per frame (an 8 × 1 pass sampling the road around the car's projected box, kept while it stays 0.8 × `carFarContrast` off the road), split at a car-local height (`carSplit` 0.5 of the box) instead of the local mean lightness. Car cells hold their temporal entry with `temporalCarMargin` 0.05.

**Foliage.**
- Canopy flags: 5 of 9 leaf cells and 5 neighbouring pairs suffice (lace at silhouettes), crease and eave cells whose normals spread along one arc are rejected (second principal moment of the normal covariance under 0.06 of its squared trace), and a cell that was canopy last frame on the same surface (history bit 128, reprojected, depth-checked) holds with a looser test (`foliageHysteresis` 0.12 on the turn share).
- Canopy cells are smoothed at rest too, over canopy cells only (`foliageSmooth` 0.8); `foliageClumpOffset` 1.5.
- The foliage stage closes a hole when six neighbours stand in front and one is canopy, calms an interior leaf more than `foliageCalm` 0.12 lighter than the canopy around it to the canopy's common entry, and puts leaf glints only within two cells of the canopy's outer silhouette (background three cells deep) on the key or sky side, as 2-4-cell clusters on a 3-cell lattice (gold edge cell, amber inward). The generic glint stage skips canopy and cells next to it: backlit sunrise trees had been peppered with single bright cells.

**Motion.**
- *Walls, kerbs and trees at speed* average their resolved light over `wallMotionFilter` 2 frames of their own screen motion (the period of the 30 Hz wagon-wheel strobe; up to 12 taps on their depth layer) once they slide `wallMotionStart` 2 cells per frame. Posterised it reads as speed streaks on the fastest walls. Ground keeps its screen-row dashes.
- *Far ground* turns to screen-row dashes sooner (`groundSpeedStart` 0.15, `groundSpeedFull` 0.5 cells per frame) and calms more (`groundFarCalm` 0.85).
- *Mode pick:* dashes switch between world rows and screen rows on the travel eased over about 0.15 s (`pickMotion`), so a stop no longer re-rolls a fifth of the road in one frame.
- *Wall band field at rest:* `fieldWallGain` 1.6 rags lit falloff arcs into band edges.
- Tried and reverted: shifting the screen-row history lookup by the lateral travel, lengthening the dashes by their own lateral travel instead of the smoothed velocity's sideways component, and easing the lateral travel (each measured worse; noted in the code).

**Ink.** The cleanup stage connects a 1-cell gap in a line (ink on both sides along one axis, not across it) and drops a lone ink cell with no ink among its 8 neighbours (`inkCleanup` 1): the perforated shoulder lines are gone. World rims stay off (`rimBeadKeep` 0, the critique's recommendation; with `rimThinCells` 8 the rail tops still beaded).

**Sky and moods.**
- *Harbour:* the far shore stands up to about 3 degrees; container cranes (A-frame, boom, stay, legs and cross tie as 1-cell lines drawn per art cell, rust-orange, amber lights along the boom, red at the apex and tip, 4-7 degrees tall, on about half of 28 azimuth slots) and a band of water with dashed amber reflections under the shore. At the start and along the lap a crane shows in the vanishing gap.
- *Sunrise halo:* #fcb877 near the disc to #f5976b outside (was #fdd176 yellow), broken into 1-cell horizontal strata dashes (a third a step dimmer).
- *Dusk popcorn:* lit bodies from lower and pinker in the gradient (filled pink lobes, not ribbons).

**Oil.** Highlight streaks every 2 m along the slick across part of its width (world-anchored), and a calm mottle of the ring tone on the ground's dashes inside the core.

**Measured.**

Near road (critic regions, `capture.mjs` 1080p frames converted to art cells), before → after:

| Frame | L | C | Orange cells | Violet cells |
|---|---|---|---|---|
| Hakone 800 ms | 0.465 → 0.332 | 0.079 → 0.034 | 97% → 9% | 3% → 88% |
| Harbor 800 ms | 0.423 → 0.324 | 0.087 → 0.036 | 94% → 10% | 2% → 87% |
| Nikko 800 ms | 0.391 → 0.270 | 0.055 → 0.030 | 62% → 5% | 20% → 93% |
| Tokyo 800 ms | 0.305 → 0.265 | 0.038 → 0.026 | 26% → 1% | 56% → 98% |
| harbor-wide lit ground | 0.307 | 0.039 | 31% | |

Road texture at 800 ms: acV −0.09..0.12 (was 0.19-0.23 at rest), acH 0.42-0.49, checker 1.1-1.8% (cutscenes 0.04-0.44%). Tokyo sunrise road near the car (mood capture, dawn 1): L0.40 h41 → 0.33 h352, orange cells 80% → 11% (sunrise-wide L0.26 h293). Player car: isolated bright cells per frame 21-46 (3-12 cool) → 2-8 (0-2 cool).

Fair A-B-A (% of region cells per 60 Hz frame, pixel; clean in brackets; round-1 → round-2 on the same production-loop scenarios, the critic's clean clips and region masks):

| Clip | Near road | Mid road | Far road and verges | Walls | Rivals | Halos |
|---|---|---|---|---|---|---|
| Hakone 259 km/h | 1.0 → 0.9 (0.8) | 1.1 → 1.1 (0.7) | 1.9 → 1.2 (0.3) | 7.3 → 5.2 (3.9) | 3.1 → 3.2 (1.2) | 5.2 → 4.6 (1.9) |
| Hakone 108 km/h | 1.6 → 1.6 (1.0) | 1.6 → 1.5 (0.6) | 2.1 → 1.6 (0.7) | 6.3 → 5.3 (3.5) | 3.2 → 3.4 (1.6) | 3.9 → 4.3 (1.5) |
| Hakone creep | 0.6 → 0.5 (1.2) | 0.9 → 0.7 (0.2) | 1.2 → 1.4 (0.1) | 2.2 → 2.4 (1.1) | 4.1 → 4.6 (1.8) | 3.6 → 3.0 (0.6) |
| Hakone corner | 2.8 → 3.4 (1.1) | 2.4 → 2.8 (0.8) | 2.1 → 1.5 (0.5) | 6.3 → 5.1 (3.8) | 4.6 → 4.8 (2.7) | 3.9 → 4.2 (1.6) |
| Harbor 259 km/h | 1.0 → 0.7 (0.9) | 0.8 → 0.8 (0.6) | 1.7 → 1.1 (0.2) | 7.9 → 4.5 (2.9) | 3.2 → 3.2 (1.4) | 8.0 → 7.3 (2.4) |
| Nikko 259 km/h | 2.7 → 2.4 (3.5) | 2.5 → 1.9 (3.4) | 4.9 → 2.0 (2.6) | 10.3 → 7.1 (7.8) | 4.0 → 4.4 (1.7) | 5.8 → 5.4 (5.3) |
| Tokyo low | 1.2 → 1.2 (0.8) | 1.7 → 1.6 (0.6) | 3.0 → 1.8 (0.6) | 5.6 → 5.1 (2.9) | 5.2 → 5.3 (2.7) | 3.5 → 4.1 (1.4) |
| Tokyo full | 2.2 → 2.0 (1.4) | 1.9 → 2.0 (0.9) | 2.6 → 1.8 (0.6) | 5.3 → 4.5 (3.1) | 4.1 → 4.0 (1.5) | 4.1 → 4.5 (1.7) |
| Tokyo corner | 2.7 → 3.0 (1.5) | 2.1 → 2.3 (0.8) | 2.6 → 1.8 (0.6) | 4.9 → 4.7 (2.6) | 5.5 → 5.4 (3.0) | 3.7 → 3.7 (1.8) |

- The halo and rival regions come from the round-1 masks; the new heads are larger and squashed, so those two columns compare different shapes. Per lamp, the far lamp heads no longer reshape frame to frame (they grow as one oval as the lamp nears), and at a standstill the halo region's A-B-A fell 2.9 → 2.0 (clean 0.1) and its change 20% → 14% per frame.
- The stop pop is gone: near-road change per frame around the stop 1-2% → at most 1% (was a 13% spike).
- Canopy region (critic's foliage script): Harbor 14.9 → 13.8 (clean 5.6), Nikko 7.9 → 7.0 (6.1); the canopy flag still flips on about 31% of ever-flagged cells (sub-cell leaves).
- Corners got worse on the road: the fleck and mottle dashes are higher contrast than round 1's wash, and their ends slide with the camera.

**Cost.** Capture step medians at 1080p, pixel and clean alternated four rounds (`output/browser/pixel-art/refine2/perf`, load average 8-10): Arcade pixel 33.2 / 28.8 / 30.3 / 31.3 ms against clean 32.9 / 35.4 / 31.2 / 35.6 ms; Tokyo pixel 29.9 / 27.5 / 28.9 / 27.7 ms against clean 30.5 / 32.9 / 32.8 / 31.2 ms. Three new tiny draws (lamp visibility, car tone) and more work in existing ones (wall filter up to 12 taps on fast world cells, 5 × 5 car outward direction on silhouette cells, canopy covariance on non-ground cells, foliage gather); the glow spread target is now RGBA32F. Per-frame CPU work: lamp-head slots and car box projection into preallocated arrays; no per-frame allocation.

**Captures.** `output/browser/pixel-art/refine2/final/`: `pixel` (2500 ms, zooms), `pixel-800`, `clean`, `pixel-portrait` (390 × 844 at DPR 3), `moods` (the three Arcade moods and Tokyo at dawn 0, 0.5, 0.8, 1) and `compare` (near road now / round 1 / harbor-wide / garage-wide, lamp 10 ×, Tokyo wet road beside radio-umbrella, full frames before and after). Motion metrics, evidence sheets and tools in `output/browser/pixel-art/refine2/motion/` (`logs/anf-*-final.log` are the fair tables above; `q.sh`/`all.sh` capture a clip with `tmp/pixel-art/motion/clip.mjs`, align it to the round-1 critique's masks and clean clips with `mkalign.py` and run its `analyze-fair.mjs`; `abamap.mjs` maps A-B-A cells; `studio.mjs` renders one frozen frame under several `configure` variants).

**Not done, or needs the user.** Harbor value (frame p90 0.26 against 0.40 wanted) needs brighter lit subjects (scenery materials, not the renderer); lit night windows on facades (scenery); rival-car flicker (unchanged at 2-3 × clean); the corner road; canopy flag stability; a forward-motion cue on the road at speed (OutRun-style bands or dash re-rolls sweeping toward the camera; the critique proposes it, the cutscenes have no such bands, so it is left for the user); palette regeneration with the v3/v4 cutscenes (lead decision).

## Known limitations (all stages)

The user has not yet compared the race with the cutscenes; nothing here claims a match. This list comes from the final review pack (`output/browser/pixel-art/review/`) and from the two critiques of refine round 2, which ran on the final code:
- style: `output/browser/pixel-art/critique-style/r3/`;
- motion: `output/browser/pixel-art/review/motion/refine2-verify/`.

The finalize stage changed no rendering code.

In every mood the frames read as pixel art in the cutscene palette family: square 560 × 315 cells, a crisp HUD, and 88-108 palette-exact colours per frame with no off-palette cells. They do not yet read as the same drawn language as the cutscenes. The style critique scored 6.5 of 10 overall:

| Mood | Score |
|---|---|
| Hakone | 6.5 |
| Harbor | 5 |
| Nikko | 6 |
| Tokyo night | 6 |
| Tokyo dusk | 7.5 |
| Tokyo dawn | 6 |

**Style.**
- **Facades at speed** are smeared by the wall motion filter: windows, pipes and the SORA board's emblem (open decision 1; `output/browser/pixel-art/review/sheets/facades-at-speed-4x.png`). At rest they hold drawn structure but stay flat, with no lit night windows (scenery).
- **Lit shoulders, verges and pavements.**
  - The road itself is fixed: violet-grey with sparse amber flecks. Hakone near road: L0.32-0.33, 5% orange cells.
  - Lamp-lit shoulders and Tokyo pavements are regular courses of 2-4-cell amber dashes that read as brick paving. Hakone shoulder: L0.39, 67% orange. harbor-wide's lit ground: L0.31, 31% orange.
- **Sunrise skies.**
  - In Nikko and at Tokyo dawn the popcorn clouds are as bright as the sun disc: 3.3-4.0% of sky cells lie above L0.9, against 0.1% in sunrise-wide.
  - The sun loses its value hierarchy, and the sky reads as confetti rather than strata.
- **Night darks.**
  - Dark cells are blue-slate where the cutscenes are plum and plum-brown: chroma-weighted hue in the L0.2-0.3 bin is h286-310, against h311-343.
  - Frames are darker overall. Frame p90: Harbor Run 0.22-0.29 against harbor-wide's 0.52; Hakone 0.36-0.46 against radio-wide's 0.51.
- **False glow orbs.** Two specular hot spots that are not light sources get lamp halos: a lamp's specular on the teal rival's rear wheel, and sun glare on a Nikko kerb.
- **Foliage.** Night canopies are featureless near-black masses, with no clump tones and no sky-side rim. Backlit Nikko trees are better, but some gold dots fall inside canopies.
- **Harbor Run** still reads as a tree-lined road. The painted crane is a 1-cell wireframe that reads as a "4", and the shore and water are hidden by the trees.
- **Reflection columns** are stacked dashes, but their breaks go near-black (zebra). A pale mottled patch remains beside the cars in Tokyo at 800 ms.
- **Thin geometry.** Overhead wires are perforated dashes. They are the main source of checker quads: 0.85-1.15% of cells, against at most 0.36% in the cutscenes.
- **Rails.** With world rims off, the generic glint stage still strings gold glints along sunlit rails in Nikko. The proposed fix, not built, is to reject glint candidates on elongated lit ridges.
- **Teal livery** is saturated turquoise: median chroma 0.056, against 0.037-0.041 for the cutscenes' sage teal.
- **Nikko shoulder:** a smooth cream glare band runs under the rail.
- **Distant lamps** at 40-150 m keep 3-5-cell cores and halos, so a receding row merges into a chain of orbs. The cutscenes draw far lights as single dots.
- **Cars** are about a fifth of the cutscene cars' size, so panel gaps and badges stay sub-cell and bright lines are sparse at night (see [car definition](#implementation-notes-car-definition)). Paint bands, red paint, lamp blocks, plates and glass are fixed.
- **Overlays.** The 2D rain is screen-space and uniform in density; the cutscenes vary it by depth and light.

**Motion.** Figures are A-B-A reversals (% of region cells per 60 Hz frame), pixel against clean, from the motion critique's production-loop clips on the final code.

| Problem | Where | Pixel | Clean |
|---|---|---|---|
| Night canopy boil (flag flips on 31% of cells) | Hakone | 12.2 | 5.0 |
| | Harbor | 13.8 | 5.6 |
| Walls at speed (filter on) | Hakone 259 km/h | 5.2 | 4.1 |
| Walls at 40-60 km/h (below the filter's start) | Hakone | 3.4 | 1.7 |
| Far road and verges at full speed | all tracks | 1.1-1.8 | 0.2-0.6 |
| Shop-tube and fixture halos, car stopped | Hakone | 2.0 | 0.1 |
| Near road while steering | Hakone lane change | 2.6 | 1.3 |
| | Tokyo corner | 2.4 | 1.1 |

- **Halos.** Moving shop-tube and fixture halos flicker 2.4-3 × clean; at a stop, whole rings re-roll.
- **Rival cars** flicker 2.3-3 × clean, mostly inside the bodies. Number plates step between tones.
- **Steering.** While steering, near-road dashes become 5-20-cell horizontal planks.
- **Glints** away from the player car: 40-48% last a single frame.
- **Whole frame** (the final 5-second clips in `output/browser/pixel-art/review/motion/final/`, the method in `output/browser/pixel-art/review/index.md`): A-B-A is 1.9-4.6% against 0.9-3.3% for clean, about 2.1 × typical (Nikko 1.1 ×).
- **Stable:**
  - near road on straights, equal to clean;
  - lamp-pool flecks and street-lamp heads;
  - the stop, with no texture pop;
  - the player car on straights;
  - the sky.
- **Next step.** The motion critique found the highest-leverage fix: a reprojected OKLab accumulation before quantisation. It would keep an art-size history of graded OKLab plus depth, clamped to the current neighbourhood, and address the canopy boil, mid-speed walls, the far ground and rival-car interiors together.

**Other.**
- **Performance** was measured on a desktop GPU (M4 Max, shared with other work) only. Real phone performance is unmeasured.
- **Arcade landscape layout.** At 844 × 390 the Arcade canvas backing is 844 × 640 (`#app` min-height in `style.css`, not the renderer).
- **Palette provenance test.** `tests/pixel-art-palette.test.ts` fails on provenance until the palette is regenerated (open decision 2).
- Stage-specific limits are listed in the stage sections above.
