# Gameplay visual direction

The user's direction is **convincing, detailed 3D first, followed by deliberate
fine pixelation**. Cars and environments stay volumetric in every camera.
The cutscenes establish material richness, composed lighting, density and a
blue-hour/amber palette. Pixelation cannot compensate for weak source geometry,
empty environments, poor materials or broken lighting.

The existing goal remains active. The current build is a working improvement,
not a qualified photorealistic or AAA result.

## Research-driven material study — latest user correction, September 16

The user rejected the entire prior POC appearance and explicitly asked for
current research before more implementation. All earlier visual improvements
below remain historical engineering evidence, not accepted art direction.
Planned racing integration was stopped before any production edits.

[Research and sources](cutscene-rendering-research-2026.md) cover the GDC 2026
Never's End production pipeline, RenderMan 27 painterly normal control, coherent
strokes, and current neural approaches with their actual limitations. The live
POC now defaults to a new material-light study; `?style=previous` retains the
prior shader for diagnosis. Neither route is a qualified cutscene match.

`illustrated-materials.ts` supplies six unequal light-response intervals per
light, independent shadow albedo, separate specular response, and surface-attached
brush normal clusters. Mesh/instance transforms and back faces are handled in
the brush basis; the clearcoat normal receives the same controlled treatment.
Selected enamel, steel, trim and rubber now replace the summed diffuse with
explicit cool/warm RGB pigment families, selected once using accumulated native
lighting. The final detail-preserving pixel pass retains lettering and mechanical
edges; selected warm ridge catches complement the dark linework. The floor uses
a partial slate/amber response with restrained actual texture variation. Full
floor replacement and alternate camera/fill-light experiments were rejected.
An authored reflection matcap supplies painted amber/violet shapes on metal,
glass and enamel clearcoat. This response is intentionally view dependent and
is not an accurate reflection of the surrounding geometry.

`illustrated-linework.ts` renders object/material IDs, local ink and depth into
an auxiliary geometry buffer. Thin boundaries favor the nearer surface;
resolved beauty-depth and glass masks suppress detached or inappropriate ink.
Distant terrain retains its own shading and has no generated line coverage.
The old palette-remap/Kuwahara treatment is bypassed in this new pipeline.
All cars, garage and terrain remain inspectable geometry; pixels are the final pass.

The first material study produced coarse enamel patches and false dotted Fuji
lines. Smaller normal/transition modulation and semantic line exclusions fixed
those artifacts. The new result still has too many broad simple surfaces,
generic texture treatment and sparse composition relative to the artwork.
It must not be reported as a successful style match.

Current evidence is under `output/browser/garage-poc/researched-material-*`:
v2/v3 contain controlled normal-strength A/B and close material comparisons;
final contains full interaction/desktop/mobile checks; motion and skill retain
camera movement evidence. Read the reports for exactness and runtime results.
The generated shader inputs, exact prompts and provenance are in
`public/assets/materials/painted-workshop/`: `pigment-marks-v1.*` and
`reflection-matcap-v1.*`, generated with the built-in image tool and copied
unchanged. No full-frame image replaces the 3D scene.

## Isolated shader proof — September 16

Review the real 3D garage at `http://127.0.0.1:5173/visual-poc.html`.
This remains outside the two production racing modes. Its Painted shading,
Pixel finish, Orbit and Cutscene reference controls expose the actual source,
finish, camera movement and supplied reference separately.

The custom material shaders group real illumination into painted planes,
preserve attached material marks, and finish with selected depth contours and
a fine pixel grid. `painted-highlights.ts` now bounds bright physical reflected
radiance before tone mapping; bodywork and glazing share it. The body-only
experiment was too subtle to establish a useful visual improvement. Extending
it to glass visibly removes the large blown-out windshield flare while keeping
the pane's transmission and actual reflection direction. This is artistic
highlight compression, not a claim of physical energy conservation.

The hero's original hood and washer nozzles are separated by whole connected
components and raised on a rear hinge. The original GLB and red car stay intact.
A dark inner coating, curved stamped reinforcement, prop rod and detailed
mounted engine bay provide actual geometry for the paint shader to describe.
The bay contains a four-cylinder engine, strut towers, radiator, battery,
reservoirs, wiring, hoses, clamps and fasteners. The proof now contains 455 mesh
objects and 2,673,521 triangles including instances; this is not production LOD.

`output/browser/garage-poc/open-hood-final-shadow` contains inspected final
desktop/mobile, clean/painted and camera-turned captures. All interaction checks
pass with zero browser or GL errors, including byte-exact shader restoration.
TypeScript passes. CPU checks verify complete hood index partitions, no shared
source-geometry mutation, finite bay/liner geometry and open reinforcement
holes. The final hood keeps double-sided shadow casting with separate exterior
and interior beauty coatings. Mobile checks use a desktop GPU viewport.

The overall cutscene match remains incomplete: the illustration has denser
authored composition and more nuanced painted detail. These checks establish
a working shader proof, not user acceptance or full-game fidelity.

**Latest user review rejects the current visual direction.** Geometry detail
and successful regression checks have not produced a cutscene-style game.
The next acceptance target is one coherent playable street section judged
beside the actual garage/harbor/radio cutscene frames. Those frames use warm
ivory and amber surfaces, neutral charcoal shadow masses, saturated violet
primarily in exterior air, dense foreground/middle/background layers, selected
fine illustrated edges and broken warm ground reflections. The current broad
lavender illumination, isolated repeated buildings and empty surfaces are the
dominant mismatch. Retain high-detail true 3D and apply pixelation last.

Frozen gameplay lighting studies under `output/browser/art-direction-study*`
show that stronger amber practicals and quieter blue fill improve the light
hierarchy, but they still do not match the reference. A tested depth-crease
finish adds too little to resolve that mismatch. These studies remain outside
production; they must not be reported as the style correction being complete.

## Current source scene

Both arcade and Tokyo use `src/game/three/world.ts`, actual native road poses
and the original deterministic simulation. The shared renderer contains:

- A detailed licensed AE86 with independent wheels, paint, lights and a seated
  rigged driver. Geometry and texture uploads are shared between cars.
- Scanned physically based road, concrete, plaster, timber, stone, roof and
  ground surfaces; dimensional shop interiors, service equipment and foliage.
- Authored frontage plans with shop clusters, forecourts, residential courts
  and rural settlement/forest transitions. World placements have stable IDs
  and conservative native-road/building exclusion.
- Curved overlapping roof tiles, hollow courtyard vessels and modeled leaves.
  Building enclosures use ambient visibility baked from their actual 3D source;
  the bake preserves surface positions, material UVs and direct illumination.
- One adapted 4K HDR panorama used for both visible sky and environment light,
  directional shadows, warm local lamps, source-derived vehicle ambient
  visibility, restrained screen-space AO and bloom.
- HDR rendering and display grading before the optional pixel pass. Settings
  and `?picture=clean` / `?picture=pixel` expose the source and finished views.
  The HUD retains its own readable display resolution.

Source license, checksums and reproducible asset transformations live beside
the assets under `public/assets`. The HDR adaptation is documented separately
in `public/assets/lighting/README.md`; the source capture is unchanged.

## Current visible gaps

Tokyo now has a second layer of grounded low-rise buildings and occasional
apartments behind its shop fronts. Selected plots have ground-following access
paths and entry courts through existing masonry openings. Selected courts now
have grounded potted shrubs and broadleaf plants. Sparse backlots,
limited architectural variety and repetitive period details still weaken
the city composition. The city layer already excludes
the full native road and completed building envelopes, rejects unsuitable
ground slopes, and instances the existing detailed source geometry.

Maintained facades now use a separate fine plaster scan at its measured 3 m
repeat, with authored paint colors normalized against source linear RGB.
Only the older garage wall retains the worn scan, corrected from 2 m to its
official 1 m repeat. Both scan identities and channel conventions are verified;
the aged source's unusually dark baked AO is present in the official files.
The architecture now has selected chamfered slab/parapet edges, layered window
frames and sliding leaves, folded curtains, recessed side windows and actual
apartment entrances with three-step approaches. Frontage reservations include
the completed stair envelope. Architectural variety and foliage still need
unfiltered review.
The cutscene's dense, composed scene is the reference; raw triangle counts do
not establish the same quality. A distant-detail optimization is acceptable
only with actual view comparisons, retained nearby detail and stable motion.

## Verification and current evidence

Use the actual application with all asset maps ready. `groundAsset` accounts
for the six asynchronous soil/concrete maps when Tokyo is first created;
checking only car/scenery/HDR flags can capture an incomplete first frame.
`sceneryAsset` also waits for the facade/roof/plot/garden scans and the validated
architectural visibility pack. Local practice
and replay preparation now hold the native clock at zero until the selected
course has rendered a complete frame. Existing cutscene artwork covers loading
frames; failures provide Back and Reload Page. Canceling preparation settles
its pending transition without starting a race later. Warm rematches retain
their original countdown and held-key behavior. An authoritative live race or
spectator stream bypasses this local gate.

The steering conversion now maps native East to world −X, keeps North at +Z,
and negates native heading, lateral displacement and yaw before presentation.
This makes native right appear on the driver's right with Three's +Z-forward
models. The same conversion covers road curves, cars, wheel steering and
hazards. Mesh transforms retain positive scale, preserving text and normals;
input bits, deterministic simulation and recorded replay values are unchanged.

- `scripts/test-renderer-3d.mjs`: actual six-camera rendering, native input
  immutability, hazards, visibility, course-switch resources and reduced motion.
- `scripts/test-streetscape-3d.mjs`: real native bot-control checkpoints across
  Tokyo blocks and rural transitions; stable retained placements at boundaries.
- `scripts/test-cinematic-runtime.mjs`: exact clean → pixel → clean restoration,
  both viewport layouts and synchronized GPU cost in the actual renderer.
- `scripts/test-steering-direction.mjs`: actual arrow-key driving in both modes,
  screen-direction checks at straight/turned checkpoints in all three cameras,
  front-wheel orientation and independent native hazard anchors.
- `scripts/test-scene-preparation.mjs`: real delayed/failed asset requests,
  initial-frame readiness, cancellation, recovery and live-gate bypass.
- `output/browser/fidelity-delivery`: inspected production desktop/mobile
  clean/pixel frames. These are mobile viewports on the desktop GPU.

Latest combined production build:
`output/fidelity/dist/assets/index-DmKc6WJq.js`, served locally on port 5194.
The scoped spotlight shader now skips physical BRDF work only where Three has
already determined zero spotlight illumination. It keeps attenuation, shadows,
cookies, scene geometry, resolution and source detail. A controlled real-RAF
driving comparison measured roughly 48 ms original versus 33 ms guarded median
frame intervals, returning to 48 ms when restored. Frozen comparisons differ
at only 2–4 of 2.07 million pixels by at most 1/255; this is a rounding bound,
not byte-exact equivalence. See `output/browser/live-spot-guard/REVIEW.md`.

The prior integrated full-app synchronized fixture measured 21.4 ms desktop
and 16.2 ms mobile viewport on M4 Max/Metal. These separate observations include
concurrent machine workload and are not a 60 fps or physical-phone claim.
Duplicate matrix-update removal remains unintegrated: it saved CPU time but
did not materially improve guarded real-RAF cadence in its bounded test.
A projected-LOD/leaf-patch/edge
treatment investigation found no reliable quality-preserving speed gain; its
experiments remain unintegrated (output/browser/all-leaf-patches/REVIEW.md).

Do not modify race arithmetic, authenticated native/proof work or controls as
part of this visual pass. Keep experimental reflection/asset/LOD prototypes
separate until actual integrated screenshots and measurements justify them.


Before the entrance and steering conversion pass, the city/ground/spotlight
integration passed 37 focused CPU tests and the six-camera
renderer regression. Twelve actual native city/rural checkpoint frames and
five boundary checks also pass, including every retained city instance matrix.
The completed source bounds accept 274 secondary plots over the full Tokyo
route; 41 unsuitable plots are rejected. The bounded batch supports 36 buildings
across six existing source variants, 85 mesh batches and 829,916 triangles at
full capacity, retaining the completed garage/pipe/shutter details. See
`output/browser/city-depth/final/report.json` for actual windows and relative
cost samples. City-visible medians were 24.5–26.7 ms in those two frozen Tokyo
fixtures; timing variability is too high to isolate a precise additional cost.

That earlier actual completed-source plot audit accepted 86 access courts and
33 short gate/boundary sets across Tokyo. It checks 20,556 emitted top triangles
and 264 solid footprints against 4,499 native/wall/building obstacles, with zero
intersections. A separate pairwise triangle audit finds no meaningful path
self-overlap. Plot geometry remains stable across real 20 m boundaries, stays
within three visible material batches, and clears on rural transitions. Evidence
is under `output/browser/maintained-facades/streetscape`; final camera and
clean/pixel restoration reports are beside it. Eight fresh production delivery
captures have all maps ready and zero browser errors.

## Previous steering, preparation and entrance verification

That source passed 50 focused CPU tests, TypeScript and a production
build. The steering regression reproduced the old reversal, then passed 73
checks after the conversion. Four actual arrow-driven native states are
byte-for-byte identical before and after the fix. Evidence is under
`output/browser/steering-direction`; the static preview is rebuilt on 5194.

The preparation audit passes seven real-browser cases and 19 checks: cold
Arcade/Tokyo, cancellation in both modes, failed-ground Back/Reload recovery,
and the explicit local live-controller counterpart. It holds real asset
requests rather than writing readiness flags. Only deliberately induced
asset failures and exact soundtrack requests canceled by navigation are
expected errors; native source hashes are unchanged. Evidence:
`output/browser/scene-preparation/report.json`.

The six-camera renderer and twelve native streetscape checkpoints pass with
the corrected coordinate system and completed entrances. Five boundary checks
retain all remaining mesh transforms and plot geometry. The full city now
accepts 273/315 secondary plots; 88 access courts and 32 gate sets emit 21,648
paving-top triangles and 256 solids, with zero intersections against 4,494
native/wall/building obstacles. The bounded full-detail city batch has 92
mesh batches and 926,900 capacity triangles. These are geometry/audit counts,
not a photoreal-quality claim. Evidence and the inspected actual court view:
`output/browser/steering-fidelity/streetscape`.

Production 5194 also passes the existing held-keyboard (10 checks), driving
feedback (5), and complete Tokyo practice/replay (32) regressions. This includes
desktop and mobile controls, native eight-car completion, replay verification,
all replay cameras, cancellation, error handling, audio and warm restarts.

Those cinematic checks restore every clean channel after pixel on/off and
add one fullscreen draw on both viewports. Synchronized full-app medians are
19.6 ms desktop and 16.6 ms mobile viewport on M4 Max/Metal, with zero errors.
These measurements are local observations, not a physical-phone benchmark or
a frame-rate guarantee. See `output/browser/steering-fidelity/cinematic`.

## Architectural enclosure and planting verification

The current six source templates retain 619,908 baked triangles across 51
meshes. Deterministic 128-ray hemispheres measure visibility out to 4 m;
midpoint subdivision preserves the source planes, interpolated normals and
UVs. Runtime source and binary hashes prevent stale geometry from loading.
All replacements validate before live meshes change. The material hook
attenuates indirect light with a 20% ambient floor and preserves direct lamps,
sunlight and emission. Reproduction and provenance are documented in
`public/assets/models/architecture-ambient/README.md`.

The actual court camera's ambient on → off → on comparison changes 367,186
pixels and restores every channel exactly. Root inspected the unfiltered
comparison: recessed balconies have visible enclosure depth while exposed
paint remains unchanged. The 11.5–12.6 ms paired samples are too close and
variable to claim a precise shader cost. Geometry is identical in this A/B.

Actual full-route planting checks cover 175 assemblies in 88 courts, over
9.58 million transformed source vertices. No leaves or vessels overlap gates
or access paths; the narrowest central corridor half-width is 1.826 m. All
207,360 support contacts sit within 1.43 mm of the actual emitted paving.
The source has curved leaves, branches, inset soil and hollow rolled pot rims.
Three variants share geometry across bounded instanced material batches.

The expanded streetscape audit passes 12 actual native checkpoint captures,
five retained-placement boundaries, complete source bounds, plot geometry and
all garden clearance/contact checks. The full city still accepts 273/315
plots and its material batch count remains 92; the new source detail raises
full capacity to 4,075,172 triangles. Six-camera renderer checks pass, as do
all 73 steering checks on the combined source. No browser/GL errors.
All 63 focused CPU tests pass (the previous 50 plus six garden and seven bake
runtime tests), along with TypeScript and the production build. Malformed
fractional/empty geometry counts now reject before allocating a live geometry.
Eight rebuilt production desktop/mobile clean/pixel captures have every asset
ready and zero errors; root inspected both race modes and close source views.

Current clean → pixel → clean checks restore every channel on both viewports,
with one additional fullscreen draw for pixelation. Full-app synchronized
medians are 22 ms desktop and 19 ms mobile viewport on M4 Max/Metal. These are
local observations under concurrent machine workload, not phone benchmarks
or a guaranteed frame rate. Evidence: `output/browser/architectural-ambient`.
The high-detail-before-pixelation goal remains active; these validated source
improvements do not establish cutscene or photoreal parity.

## Current cutscene-direction implementation and checks

The latest pass adds a depth-aware HDR finish in `cutscene-grade.ts`: foreground
shadows move toward charcoal, broad values receive gentle grouping, and selected
depth folds receive fine dark accents. Source texture and illuminated material
colors remain visible. `cinematic.ts` snapshots resolved beauty depth before
postprocessing, using a separate single-sample target with an unused R8 color
attachment. The grade reads that preserved depth across composer buffer swaps;
AO keeps its original beauty depth. Optional pixelation and the single display
conversion follow the finish.

`road-finish.ts` varies scanned asphalt roughness and diffuse response through
fixed world-space damp patches. Native wetness changes patch coverage; the road
keeps a dielectric material and its scanned color, normal and ARM maps. Broken
reflections respond to actual lights. The new 3D shopfronts add awnings, cloth,
signage and merchandise for motor, coffee, grocery and radio shops. Denser
frontage placement uses completed source bounds for road and plot exclusions.
Merchandise lamps use the existing five spotlight slots, prioritize one primary
source per building and favor shops ahead of the driver. Their current intensity
is 90, with a 1.30-radian cone. Image inspection found intensity 140 overbright;
the stronger-fill study also produced a blue wash and was not adopted.

Completed validation for this pass:

- All 69 focused CPU tests and 73 actual steering checks pass. The earlier
  six-camera renderer run also passes; steering evidence is under
  `output/browser/cutscene-direction/steering` and renderer evidence under
  `output/browser/cutscene-direction/renderer`.
- `output/browser/cutscene-direction/depth-verified/report.json` records 24
  desktop/mobile viewport depth checks covering samples 0/4, AO on/off and
  clean → pixel → clean buffer parity. Every depth texture is independent and
  correctly sized, with zero GL or browser errors. Pixel toggles and separate
  finish/road on → off → on comparisons restore every channel exactly.
  Mobile here is a viewport on the desktop GPU.
- `output/browser/cutscene-direction/streetscape/report.json` passes 12 native
  checkpoints and five placement boundaries, with no shifted retained objects,
  source-envelope failures or plot collisions. The denser layout now contains
  111 garden assemblies in 56 courts; actual source-vertex clearance and paving
  contact checks pass. These counts supersede the earlier 175/88 planting audit.

The final production build is `index-CKWcmp0-.js` on local preview port 5194.
Eight fresh desktop/mobile clean/pixel captures have all five asset groups ready
and zero browser errors; inspected Arcade clean and Tokyo mobile pixel frames
retain readable merchandise after the local intensity reduction. Evidence is
`output/browser/cutscene-direction/production-final`. The repeated six-camera
resource check also passes on the final source (`renderer-final`).
The goal remains active, and the user's rejection of the visual style remains
unresolved. These implementation and regression results do not establish
cutscene, photorealistic or AAA parity; acceptance still requires the actual
playable scene to meet the visual reference.
