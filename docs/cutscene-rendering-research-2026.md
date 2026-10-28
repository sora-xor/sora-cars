# Cutscene rendering research — 16 September 2026

Current implementation (September 22): the default POC uses actual color/depth
pixel regions, structure-tensor direction, geometry linework and analytic
light-value planes. The earlier authored-material experiments below are retained
as history and a disabled comparison. They are not the active style mechanism.
The latest evidence and remaining gaps are at the end of this document.

The user has rejected all previous POC/mockup looks as unlike the cutscenes. This research changes the implementation direction; it does **not** establish that the new implementation matches the reference. Technical checks, polygon counts, sampled palettes, and named rendering techniques are not visual acceptance.

The inspected reference is `public/assets/story/angles/garage-wide-v2.png`. Its visible language includes carefully grouped ivory car panels, dark blue/umber steel, narrow warm reflected edges, selective dark linework, dense readable mechanical detail, and small irregular paint clusters. Fine pixelation finishes those choices. The user's clarified acceptance target is rendering style. Compare the treatment of corresponding surfaces; hold camera, geometry, and object placement fixed when assessing shader changes.

## Primary sources and applicability

### Never’s End: real-time 3D with authored pixel-art lighting

Ryan Juckett / Hypersect, **GDC 2026**, “How We Draw a 3D Sprite World: The Stylized Art of Never’s End.” [Official slides](https://media.gdcvault.com/gdc2026/Slides/Juckett_Ryan_HowWeDrawA3DSpriteWorldTheStylizedArtOfNeversEnd.pdf).

The relevant techniques are per-light diffuse/specular/AO ramps; separate shade albedo, ambient tint, and outline colors; vertex bias and edited normals that control shadow shapes; and distinct object, material, and depth boundaries for linework. Outline color can follow diffuse lighting with a material tint. The talk also covers pixel snapping and deliberate single-pixel lines. See slides 19–28 and 34–46.

**Use here:** retain detailed 3D meshes and actual lighting, but give enamel, steel, rubber, and architecture different lighting responses. Put paint-shaped transitions inside the material/light calculation. Use semantic material boundaries to protect mechanical detail and avoid outlining every texture fluctuation.

**Limit:** this is a complete authored game workflow, not a universal image filter. Its orthographic sprite sorting and camera snapping do not transfer directly to our perspective racing camera. It supplies no transferable browser frame-time budget. Additional ID buffers and light-ramp evaluations must be measured here.

### RenderMan 27: paint affects shading normals as well as color

Pixar RenderMan, **documentation updated 13 November 2025**, [Stylized Painterly Brush Control](https://renderman.atlassian.net/wiki/spaces/REN27/pages/662372354/Stylized%2BPainterly%2BBrush%2BControl).

The material system stamps brush masks in UV, screen, or triplanar coordinates. It produces both color and painterly normals; supports broad-to-fine stroke layers; and can follow a normal/tangent vector field. AO, curvature, and other maps can control mark placement. Reflection and refraction can consequently acquire painted shapes rather than just a color overlay.

**Use here:** implement a bounded geometry-attached brush field with separate shading-normal and pigment effects. Align strokes to the surface and restrict intensity by material and lighting transition. Keep silhouettes and detailed source geometry intact. A grayscale texture multiplied across albedo alone is not equivalent to this technique.

**Limit:** RenderMan is a production rendering system, not a WebGL performance demonstration. Our shader borrows the principle; it does not port the product. Triplanar sampling adds texture work, while arbitrary normal noise can create hammered metal or dirt. Stroke scale, direction, coverage, and normal strength require visual authoring. Repeated masks cannot substitute for unique asset painting.

### Coherent brush strokes: an established real-time foundation

Lu, Sander, Finkelstein, **I3D 2010**, [Interactive Painterly Stylization of Images, Videos and 3D Animations](https://gfx.cs.princeton.edu/pubs/lu_2010_ips/index.php).

This GPU system renders textured point-sprite strokes and moves persistent strokes using optical flow. It reports over 30 fps for 60,000 strokes at 512 × 512 on its contemporary hardware.

**Use here:** marks must persist with their depicted surface during motion. Rest-position/UV coordinates provide a practical coherent anchor for the existing known geometry; no screen-random reseeding should occur every frame.

**Limit:** a stroke-sprite renderer introduces placement, occlusion, density, and disocclusion work. Its historical benchmark says nothing about our current 1080p scene. It targets broader painterly marks than our very fine illustrated-pixel reference, so a wholesale particle replacement is not the first POC.

### Current neural style transfer is relevant, but not a drop-in game shader

Ioannou and Maddock, **IEEE Transactions on Games, June 2026** (online 11 February), [PQDAST publication record](https://eprints.whiterose.ac.uk/id/eprint/237371/) and [accepted paper](https://eprints.whiterose.ac.uk/id/eprint/237371/1/PQDAST_FINAL.pdf).

PQDAST distills an arbitrary-style model and trains with depth and temporal losses, then inserts inference before game post-processing. Table III reports 26.06 ms standalone inference at 1920 × 1080 on an RTX 3090, but approximately **5 fps inside its Unity integration**. The authors still identify flickering and integration cost as limitations. Those are reported study conditions, not estimates for this project.

Their earlier [G-buffer-guided method](https://eprints.whiterose.ac.uk/id/eprint/209827/) (online 2024; journal issue September 2025) uses depth, normals, and edges. Its [official code](https://github.com/ioannouE/GBGST) includes ONNX exports and Unity integration, but trains one style per network.

**Limit here:** using these approaches entails obtaining/training a model, exporting supported operators, integrating geometry data, and profiling temporal behavior and latency. A reference image does not itself provide trained weights. ONNX Runtime supports [browser WebGPU inference and GPU-resident tensors](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html); its [WebGL backend is in maintenance mode](https://onnxruntime.ai/docs/get-started/with-javascript/web.html). This is a possible separate investigation, not evidence that the current Three.js WebGL pipeline can afford neural rendering.

### 2026 Gaussian stylization changes the scene representation

Zhou et al., **January 2026; revised 1 April 2026**, [Thinking Like Van Gogh](https://arxiv.org/abs/2601.10075), [method and experiments](https://arxiv.org/html/2601.10075v2).

This preprint aligns and moves Gaussian primitives using directional style structure, rather than only recoloring them. Reported optimization is 3,000 iterations, approximately five minutes on an A100. It intentionally deforms the representation toward Post-Impressionist strokes.

Related [StyleGaussian](https://kunhao-liu.github.io/StyleGaussian/) (SIGGRAPH Asia 2024) reports 10 fps style transfer on reconstructed Gaussian scenes; its [implementation](https://github.com/Kunhao-Liu/StyleGaussian) requires reconstruction, feature embedding, and artistic training stages.

**Limit here:** neither result is an existing animated mesh-material shader. They require a different representation and preprocessing/training, and do not establish movable cars with our dynamic lighting, transparency, and browser budget. The directional coherence principle is relevant; replacing the game with a static stylized reconstruction would not meet this task.

## Selected POC implementation

This is our engineering inference from the sources, not a claim that any source promises the exact reference style:

1. Keep the detailed, inspectable 3D cars and garage.
2. Replace generic finished-color remapping with material-specific diffuse/specular responses and deliberately chosen shade colors. For selected materials, choose absolute RGB pigment fills once from the accumulated original physical lighting; summing many separately stepped lights otherwise recreates a largely continuous response.
3. Shape shading normals and albedo with coherent triplanar clusters; preserve small mechanical geometry and clean regions on the enamel. Use an authored matcap reflection response for metals/glass, as described in Never's End slides 45–46; keep this deliberately view-dependent treatment distinct from accurate environment reflection.
4. Add selective material/depth linework with local colors and controlled widths.
5. Apply a fine pixel finish only after the painted image already reads correctly. Disable blanket palette remapping and Kuwahara smearing as the primary style mechanism.

## Observable acceptance

- **Enamel:** the hood, fenders, and door read as painted ivory planes with deliberate warm/cool boundaries. No plastic glare, sprayed dirt, or uniformly stippled finish.
- **Material separation:** dark steel, bright metal edges, rubber, glass, and enamel retain distinct appearances; the shader must not make every object the same painted clay.
- **Detail:** panel seams, headlight structure, engine hoses and fasteners remain readable at the intended camera size. Linework must clarify these features rather than bury them.
- **Coherence:** slow orbit, close inspection, and returning to the same pose retain attached marks. No crawling texture, random re-seeding, bright halos, or changed object boundaries.
- **Reference comparison:** inspect the actual live 3D render beside the cutscene at comparable size, both before and after pixelation. A merely warmer, flatter, or noisier image fails. Do not assign an invented numerical similarity score.
- **Delivery:** compiler, runtime, resolution, and toggle checks remain necessary engineering checks. They do not replace visual judgment or imply the user has accepted the style.

## Implemented study and generated inputs

The isolated POC now uses `illustrated-materials.ts`, `illustrated-linework.ts`,
and `illustrated-reflections.ts`. Its legacy palette remap and Kuwahara pass
are bypassed; `?style=previous` exposes the prior pipeline for diagnosis.
Production racing is unchanged. The inspected render still falls short of the
reference; the work establishes material controls, not visual acceptance.

Both inputs below were made with the **built-in image-generation tool**, using
the garage cutscene as a style reference. Originals were copied unchanged into
the project. Exact prompts and SHA-256 provenance accompany them:

- [Brush field](../public/assets/materials/painted-workshop/pigment-marks-v1.png),
  [prompt](../public/assets/materials/painted-workshop/pigment-marks-v1.prompt.txt),
  [provenance](../public/assets/materials/painted-workshop/pigment-marks-v1.provenance.json).
- [Reflection matcap](../public/assets/materials/painted-workshop/reflection-matcap-v1.png),
  [prompt](../public/assets/materials/painted-workshop/reflection-matcap-v1.prompt.txt),
  [provenance](../public/assets/materials/painted-workshop/reflection-matcap-v1.provenance.json).

Actual captures: `output/browser/garage-poc/researched-material-v3` (normal A/B,
close view, exact restoration, no GL/browser errors), `researched-material-final`
(full controls and viewport checks), `researched-material-motion` (four held
drag poses and exact reset), and `researched-material-skill` (two Orbit bursts).
Local warm render timings are diagnostic samples, not gameplay or mobile FPS
claims. All scene geometry and the original cutscene remain unchanged.

### Subsequent pigment and detail inspection

The new `illustrated-pigments.ts` supplies separate ivory, oxide-red, workshop
steel and charcoal/rubber palettes. It selects warm/cool colors from the actual
incident illumination after removing the diffuse dye, keeps decal/texture
residuals, and divides the result into the native direct/indirect ratio for AO.
The constants are authored POC material responses, not inferred artist intent.
Inverse ACES calibration keeps display swatches from being tone-mapped twice.
Known dark dielectric trim, tire and engine materials participate; pure metals,
zero-albedo surfaces and unrecognized names remain outside that family.

Thin warm catches now use view normals at selected interior ridges, with the
same object/material/depth guards as the dark ink. The POC uses strength 0.6
after inspecting 0/0.5/1 at two poses. Its pixel finish averages quiet 2x2 cells
while preserving native samples at small high-contrast details. Odd viewport
dimensions retain a true integer grid. These corrections recover readable
features, not a numerical style-similarity score.

The floor now mixes 50% of an authored slate/amber lighting response with its
existing surface detail. A first version with rectangular brush cells was
rejected after inspection. The replacement uses the authored texture relative
to a local underpainting, preserves bounded texture variation and real shadows,
and keeps the actual planar reflection. Full replacement still looked too flat.
Camera and fill-light experiments were not adopted.

The actual proof continues to fall short of the reference's individually
painted surface detail and material response. No production racing adoption or
user acceptance is claimed. Diagnostic captures are in
`output/browser/garage-poc/{material-pigment-study,dark-material-study,inline-study,floor-pigment-revised,pixel-detail-study}`;
the first failed floor experiment remains in `floor-pigment-study`.

## September 20: painted surfaces must follow the object

The user rejected the overall look again. Further primary production research
supports separating where a mark belongs, its direction, and its lighting:

- [Sony Pictures Imageworks / Foundry](https://www.foundry.com/insights/film-tv/across-the-spider-verse-nuke-mari-katana)
  describes geometry-attached strokes, rigged curves and artist-painted flow
  maps used with lighting data. This is a film production system, not a
  browser-ready shader or a real-time performance result.
- [Adobe Sampler's Stylization documentation](https://experienceleague.adobe.com/en/docs/substance-3d-sampler/using/filters/wear-and-finish/stylization),
  updated April 7, 2026, exposes independent cavity, curvature, color, normal,
  roughness and optional grunge controls. The relevant principle is material
  authoring; simply adding grunge is not the same as painting form.
- [Scavengers Studio's Season breakdown](https://www.unrealengine.com/tech-blog/creating-the-illustrative-look-of-season-using-unreal-engine)
  explains its material/lighting tradeoffs. It is a 2021 source, still useful
  for retaining coherent lighting while authoring an illustrative response.
- [South of Midnight environment artist Jasjot Singh](https://jasjotsingh.artstation.com/projects/8BzmAx)
  describes shared baked textures/masks, trim sheets, local material instances
  and a clutter pass. This supports authored reusable surface detail.
- The official [Fortiche/Foundry FMX 2025 talk](https://www.youtube.com/watch?v=gCJIJG6Lz84)
  and [Adobe's GDC 2026 South of Midnight talk](https://www.youtube.com/watch?v=RG7jqJL4CPU)
  were located and their descriptions verified. Full captions were not
  accessible; no unviewed technical details are attributed to these talks.

Our application of those principles is an engineering inference, not a claim
that these studios use this exact shader. The POC now has a unique body UV
painting, separate convex/cavity masks, and narrow surface-attached workshop
edge paint. All cars and workshop surfaces remain meshes with actual lighting,
occlusion and orbit. Pixelation remains the last stage.

### Body painting and geometry audit

The original AE86 Primary UVs contain 32 usable islands with negligible sampled
overlap. A clean full-domain UV guide was made from the actual triangles; the
image-generation tool painted that guide using the cutscene as the style
reference. The unchanged result is
[`ae86-enamel-v1.png`](../public/assets/materials/painted-workshop/ae86-enamel-v1.png),
with an exact prompt and checksum provenance alongside it. Generated alpha
padding is composited against the measured neutral underpainting in the shader.
It is albedo variation, not a projected scene or baked replacement frame.

`enamel-topology.ts` adds owned rest-position and convex/cavity attributes before
hood articulation. A tangent-plane curvature fit avoids tessellation-dependent
strength; welded seams share masks. Source UVs, indices and fleet geometry are
preserved, including source userData. CPU plane/sphere/cylinder, seam, clone and
idempotence checks are recorded in `output/fidelity/enamel-topology`.

The live `enamel-study` A/B restores exactly and retains painted fenders at both
wide and close views. It adds panel-specific detail; it does not by itself
establish a cutscene match. The first workshop edge version produced regular
copper dashes and was rejected on visual inspection; it is retained only in
`workshop-edge-study` evidence.

The comparison also exposed the architecture's excessive midtone value. It now
has a separate dark indigo/umber pigment family, while bumper trim uses a darker
family independently of tires and engine hoses. No global exposure adjustment
is needed to make those selected surfaces darker.

The revised workshop pass uses tangent-aligned authored strokes and only
1.5–3 mm of tapered paint near bevel crowns. The GPU A/B in
`workshop-edge-revised` removes the first version's copper-strip appearance and
restores exactly. `painted-asset-final` passes all eight interaction/viewport
checks with exact full shader restoration and no browser/GL errors;
`painted-asset-motion` passes four held-drag poses and exact reset. These are
technical checks. The inspected scene remains less densely authored and less
richly painted than the cutscene, so production adoption is still premature.

## September 20: separate painted colour from reflection accents

The user's latest correction is explicit: focus on **rendering style**, keeping
the framing fixed. Camera experiments were not adopted. Further primary-source
research found two particularly relevant descriptions of material authoring:

- DreamWorks' [SIGGRAPH 2025 "Painterly Fur and Feathers of The Wild Robot"](https://www.siggraph.org/wp-content/uploads/2025/08/Talks.html)
  describes surface UVs, custom normals and derivatives supporting artist-shaped
  light ramps, with diffuse and specular accents layered separately. It concerns
  film fur/feathers and compositing, not a real-time browser car renderer.
- The current [OpenMoonRay DwaToonMaterial reference](https://docs.openmoonray.org/user-reference/scene-objects/materials/dwa/DwaToonMaterial/)
  exposes independent clearcoat normals, bindable diffuse ramp offsets, diffuse
  normal/terminator controls, and separately directed specular lobes. Its page
  does not specify a publication date; this is verified current documentation,
  not a claim of a technique invented in 2026.

These sources support a rendering principle, not our particular constants:
painted colour regions, surface texture, and reflection accents need independent
authoring. The existing POC instead reduced every lighting effect together to
0.35. On enamel that left approximately 42% original diffuse, 23% individually
stepped diffuse, and 35% accumulated pigment shading. Its fully multiplied atlas
then looked like grime over smooth physical lighting.

The revised enamel shader uses the accumulated RGB pigments independently of
the metal/specular setting. The unique UV painting now primarily shapes light
boundaries. Albedo variation is 12% on broad panels, rising to 72% at existing
convex/cavity masks. Diffuse normal variation is limited to 0.025; a separate UV
tangent frame directs sparse clearcoat accents. The frame uses actual view-space
positions and preserves mirrored UV orientation and the articulated hood. Real
specular illumination supplies the accent energy and location; no light is added
in an unlit region. These are authored POC choices requiring visual inspection.

Five explicitly named engine metal materials now have another response:
`illustrated-metal.ts` shapes original accumulated direct and indirect specular
separately with bounded logarithmic intervals. It keeps source RGB proportions,
local reflection probes and HDR highlights, with surface-attached marks at the
boundaries. This bypasses the generic matte shadow fill and amber matcap for
those metals. Cast aluminium and machined edges use different amounts. It is
not a general replacement of the physically based renderer.

Architectural steel also separates full accumulated pigment colour from its
restrained specular and narrow edge paint. The floor retains bounded broad value
variation from its existing authored underpainting, independently of the fine
texture residual. A six-colour ramp alone had removed that broad variation,
leaving flat light pools plus fine grain. The underpainting is normalized by the
measured linear-sRGB median of the unchanged `concrete-v1.png`.

The 3D terrain now uses calibrated violet pigments through the same inverse-ACES
helper as the garage materials. Six slope-lighting regions replace the earlier
almost-continuous gray ramp. Relief, derivative filtering and terrain-attached
marks remain; this does not project cutscene art onto scenery.

Same-camera diagnostic captures are saved in `enamel-separated-light`,
`metal-reflection-study`, `metal-paint-study`, and `environment-paint-study` under
`output/browser/garage-poc`. Their purpose is to isolate rendering changes, not
to claim that passing technical checks establishes a cutscene match.

The generated atlas also has incomplete alpha coverage on small headlamp-return
islands (roughly 11–16% below half opacity). The shader substitutes neutral
enamel there. Broad hood/roof coverage is much more complete; no mesh holes or
black padding are introduced. Treat this as a POC painting, not a finished
production texture atlas.

## September 20: connected paint regions and selective reflection coverage

The user explicitly corrected the scope to rendering style. This iteration
keeps all geometry, object placement, camera defaults and light placement fixed.
The same-view diffuse/specular breakdown found broad flat fills and continuous
reflection rims. Turning off warm inlines made little visible difference; adding
more outline processing would not address the main material gap.

Two hood coatings had never entered the named charcoal family. The inner skin
and phosphate pressing now use its accumulated pigment diffuse, independently
of the generic 0.35 lighting strength. Workshop and charcoal surfaces also have
an independent diffuse strength. A filtered reading of the existing achromatic
brush field moves connected colour boundaries. It is centred on the measured
raw median 116/255; the coarse material sampling resolves approximately 5.5cm
footprints. An initial high-amplitude pass made walls look mottled and was
reduced. This is a material-space paint field, not a screen grain overlay.

The previous engine experiment preserved source reflection hue and was too
subtle. The five selected metal materials now evaluate an authored slate/indigo
pigment response once from summed physical reflection energy. Related stroke
fills and sparse amber accents use the attached marks; warm accents additionally
require a warm source reflection. Zero energy is black. Original direct and
indirect lobes are restored separately when the diagnostic strength is zero.
This is an artistic colour response, not a claim of energy-conserving PBR.
The same existing field can choose neighbouring shading-normal planes, with a
12-degree maximum deviation and derivative-smoothed boundaries. Machined
surfaces use 45% of that angular range. Generic normal perturbation is bypassed
at full artist-normal strength so the two treatments do not stack.

Floor diffuse boundaries, damp roughness and planar reflection alpha now share
one authored world-XZ field. Previously the blue component of the normal scan
biased most reflection-mask cells toward wet, while physical roughness used only
a broad smooth damp field. The replacement removes that bias and the unrelated
random cells. The shared elongated marks use a 2.5cm minimum footprint and
filtered area coverage at distance. Actual light and reflected scene RGB remain
the illumination sources. The floor comparison visibly breaks the continuous
reflected light strip into islands.

These are implementations of the independently authored colour, normals and
reflection principles from the primary sources above, not new research claims.
The proof still has flatter fills and cleaner small edges than the cutscene.
Technical checks and selective material improvements do not establish style
parity or justify adopting this proof into the racing modes yet.

## September 22: color inside painted regions

The same-camera comparison remains the acceptance basis. This iteration changes
material shading only. Geometry, placement, camera defaults and lights remain
fixed.

Further primary reading: Pixar's July 2026 SIGGRAPH talk paper,
[Coloring Outside the Pipeline](https://research.pixar.com/docs/2026.SiggraphTalks.SDW.pdf),
describes strokes inheriting scene lighting with separately controllable hue
variation, plus stylized normals for controlled color blocks. The paper's
pastel assets, point-cloud/card compositing and film pipeline are different from
our small painted-pixel reference. It supplies no browser performance evidence
and is not a shader implementation we can copy. The useful inference here is
to control stroke color separately from stroke coverage and surface relief.

The enamel atlas now retains a little more quiet-panel color variation (.36
instead of .12), while folds retain .72. It continues to direct lighting
boundaries and separate clearcoat normals. A runtime control exposes the
comparison. This is a subtle change, not evidence of a completed body-paint look.

The exact cabinet-enamel family was missing from accumulated pigment shading.
It now has its own red/umber palette and material response. Interior brush loads
use the existing attached marks rather than only moving band boundaries. An
early interior mask was almost invisible because its band-edge exclusion
removed most coverage; that exclusion was dropped. Partial continuous ramp
interpolation retains form and reduces camouflage-like patches. Two explicit
hood-inner materials use lighter slate strokes; cabinet and rubber use darker
secondary loads, with much less variation on rubber.

Engine cast aluminium, machined aluminium, iron, brass and headers now have
separate pigment palettes and lighting thresholds. The former implementation
shared one palette and only varied strength. Reflection energy and source hue
still gate the result. These are art-directed material responses, not an
energy-conserving PBR model.

The material-response-final capture passes all eight interface checks and exact
paint-toggle restoration, with no WebGL or browser errors at desktop and mobile
sizes. The skill action client and four-pose motion check also pass; the images
were inspected. These technical checks preceded the separate floor-interior
experiment and do not establish the overall style match.

### Floor interior comparison

The floor owns a separate shader, so it did not receive the other materials'
interior paint response. A new floor-only control uses its existing filtered
world-space stroke field to place cooler dark loads and restrained warm catches
inside each lighting band. The catches require actual direct, warm illumination;
the whole result still fades to black without incident light. Reflector coverage,
roughness masks and source lighting remain unchanged.

The first setting was too weak on inspection. A stronger comparison selected
darker neighbouring pigments and more coverage, but its maximum exposed dense
repeated diagonal rows. The midpoint was retained: dark mask thresholds .34/.49,
maximum dark blend .775, and an equal mixture of the one-stop and deeper
charcoal loads. The default POC enables this response; the separate control can
restore the prior interior treatment. No additional texture sampling is needed.

Inspected evidence is in `floor-interior-study` and `floor-load-study`. The first
study returns exactly to its baseline with no GL/browser errors; the second
also has no GL/browser errors. These are actual rendered material comparisons,
not image edits. The result has more visible charcoal strokes but still lacks
the reference's variety of small warm catches and painted edge treatment.

Final selected-source verification: `paint-interiors-final` passes all eight
interface checks, exact restoration, and desktop/mobile error checks;
`paint-interiors-skill` passes two action bursts; `paint-interiors-motion` passes
four held-drag positions and exact reset. The rendered images and text states
were inspected. TypeScript/Vite build passes with the existing bundle-size
warning. These are browser/layout and renderer checks, not real-phone frame-rate
measurements or acceptance of the cutscene-style match.

## September 22: enamel lobe isolation and material coverage

A fresh same-camera diagnostic isolated the car paint's diffuse, total
reflection and clearcoat contributions. Diffuse alone retained almost all the
large cream fills, fender light and apron shape. Reflection supplied mainly
narrow windshield/arch catches. This contradicted the initial hypothesis that
uniform specular rims dominated the mismatch. No reflection-suppression helper
was integrated. These are targeted paint-material diagnostics; glass, decals
and other scene materials remain in the images.

The apron is a cloned Primary material on the existing Trim UV domain. It
correctly cannot use the body atlas, but that left it with no interior pigment
treatment. It accounts for approximately 16% of the body-coloured source surface
area. The body's original atlas coverage is healthy; this was not a reason to
replace the texture or remodel the car.

The accumulated diffuse helper now takes separate boundary and interior marks.
Primary enamel retains the atlas's existing boundary direction while its dark
paint selects cooler neighbouring pigment inside a band. Selected strength is
.45, weighted from .45 on quiet panels to 1 on existing curved/cavity masks.
The apron uses its existing attached rest coordinates, a .7 coordinate scale
and .35 strength; it never samples the incompatible atlas. Clearcoat, lights,
albedo residual, geometry and camera defaults are unchanged. Both controls can
be disabled independently, and global interior/paint controls disable them.

The .85 comparison made the apron blotchy and was rejected. The chosen smaller
marks preserve more clean ivory surface. Evidence: `enamel-interior-study`
(0/.45/.85, exact restoration), `enamel-finish-study` (apron scale and trim
comparison), and the selected-source `enamel-interiors-final`.

The Secondary material was also classified as rubber despite covering the
two-tone door panels, wheelarch bands and rear wrap. It now uses charcoal-trim
pigments under the existing dark-neutral colour guard. This changes its diffuse
palette, thresholds and attached paint response, while retaining its original
glossy dielectric material. The final GPU check covers that complete family
change, including its finer patch scale.

Final verification: `enamel-interiors-final` passes eight UI checks and exact
paint restoration on desktop/mobile layouts, `enamel-interiors-skill` passes
two Orbit action bursts, and `enamel-interiors-motion` passes four held-drag
poses and exact reset. All have no WebGL/browser errors; their images were
inspected. The TypeScript/Vite build passes with its existing bundle warning.
These checks establish correct operation of this selected POC revision, not
full cutscene-style parity or gameplay adoption.

## September 22 — moving-car evaluation and rejected diffuse masks

The user's rendering-only correction remains authoritative. No camera, scene
layout, geometry shape, light placement, controls, or simulation changed.

`racing-material-study.ts` is an opt-in adapter for the existing detailed racing
cars. It clones only Primary, Secondary, Trim1, and TireMaterial, retains source
materials for `setAppearance`, preserves the live Bayer fade uniform and shadow
callbacks, and prepares shared enamel attributes on owned geometry clones.
This is evaluation infrastructure, not default gameplay integration.

The actual main Arcade and Tokyo routes were driven with per-frame stepping.
At tick 66, each run compared disabled/enabled paint using the same replacement
POC post pass, then advanced through four motion frames to tick 86 and captured
390×844 output. Both modes prepared 8 cars, 64 meshes, 40 materials, and 2 shared
geometries; both restored the disabled frame byte-exactly and reported GL 0 and
no browser errors. The production-pass images are a separate baseline, not a
material-only comparison. The final renderer.info numbers describe the last
fullscreen pass and are not scene cost or frame-rate evidence. The required
skill client also drove Arcade with throttle and short left/right bursts; both
inspected states have active study materials and no GL errors. These images
still read as detailed 3D with stylized car paint, not a cutscene-style match.

A fresh material comparison isolated a real weakness: the quiet enamel
interior blend makes only a small contribution. Increasing it with sparse,
stronger cool pigments was tested without changing production source. Three
variants in `enamel-shapes-study` were rejected: the existing atlas's dark tail
mainly selects perimeter shading and wear dots, producing chipped/camouflage
paint. Raising strength does not recover intentional brush shapes.

A distinct UV brush-control asset was generated with the built-in image tool,
using the original UV atlas and the cutscene as references. Original files are
unchanged. Exact prompt/provenance accompany `ae86-brush-control-v1.png`.
The generated asset is RGBA, not the requested opaque gray: sampling must gate
all marks by alpha. Opaque-pixel dark coverage below105/255 is17.5%; bright
coverage above185/255 is10.6%. It was used solely as non-color brush data in the
runtime `enamel-brush-control-study`, with actual irradiance selecting pigments.

The new field improves stroke direction but medium/strong/deep variants were
also rejected after root and independent image review. At this scale, broad
mauve marks on the fender/lower door resemble primer patches. The reference has
quieter ivory interiors and smaller broken accents associated with surface
turns and seams. This is evidence against simply amplifying static diffuse
marks. Neither rejected study changes the default POC. GL/console checks pass,
but technical correctness is not visual acceptance.

The subsequent focused racing lifecycle test passed appearance-family updates,
shared source/GPU Bayer fade, no refreshes on unchanged frames, exact fade and
livery reversal, and restoration of all376 original mesh references/callbacks.
The disposed-native versus disabled-shader image equivalence gate failed:
11pixels differ, maximum29/255, exceeding the existing8pixel/1level bound.
No tolerance was relaxed and no repeated rerender was used to seek a pass.
The adapter remains an experiment; this small discrepancy is not dismissed as
verified rounding. Build passes with the existing bundle advisory.

### Downloadable reference-transfer alternative: tested and rejected

A primary-source check found a genuine pretrained browser candidate, not just
a paper: the [contributor's TF.js graph-model port](https://github.com/reiinakano/arbitrary-image-stylization-tfjs)
of Google's [Magenta arbitrary image stylization](https://magenta.tensorflow.org/blog/2018/12/20/style-transfer-js/).
The Google model card and port carry Apache2.0. The legacy official
`@magenta/image` wrapper is not a modern WebGPU integration; the graph-model
artifacts were loaded directly using TF.js/backend-webgpu4.22.0 instead.

Downloaded only the MobileNet predictor and original transformer to the
isolated `tmp/fidelity/neural-style` experiment:17,359,984 weight bytes, plus
manifests/license. Exact URLs andSHA256 records are in models/provenance.json.
Application dependencies and default rendering are unchanged. The archived
port's models are older pretrained artifacts; using them in2026 does not make
them a2026 technique. The [PQDAST project](https://ioannoue.github.io/pqdast.html)
has no verified public checkpoint/ONNX/license release suitable for this test.

The first local inference failed because Vite tried to transform extensionless
weight shards and served an error page as tensor bytes. The original download
bytes were correct. Sibling `.bin` files and a derived local manifest fix this;
served bytes were verified against disk before rerunning. Original artifacts
and their hashes remain unchanged.

Actual Chromium/Metal WebGPU inference then passed with zero browser errors at
512×296 and1024×592. Inputs were the existing garage render (excluding its UI)
and the actual garage cutscene. The scene was not re-composed or regenerated.
The reference embedding was cached;0.7 interpolation with the content embedding
and full reference strength were compared. All output tensors were finite.

Root inspected all three images in `output/browser/neural-style-study` and
rejected them: excessive multicolored grain, broad dark smears, loss of small
surface details, and no convincing match to the cutscene's drawn brushwork.
Do not promote this model to gameplay just because inference works.

Measured end-to-end inference/readback for these specific calls: first512call
881ms; subsequent512call71.6ms; first1024call584.1ms. These are individual calls,
not a representative frame-rate benchmark. TF.js reported allocation pools of
about523MB at512 and1.95GB after1024; live tensor accounting was much smaller.
Quality failed before any motion/performance qualification, so no game-rate or
temporal-stability claim is made. The experimental browser exited.

## September 22 — renderer-side pixel regions (user correction)

The latest user instruction explicitly rejects texture hacks and asks the
rendering engine itself to group pixels. That supersedes the previous
material-texture experiments as the direction of this work.

Primary foundations: [SLIC's color-and-position clustering](https://www.epfl.ch/labs/ivrl/research/slic-superpixels/)
and [Pixelated Image Abstraction](https://gfx.cs.princeton.edu/gfx/pubs/Gerstner_2012_PIA/Gerstner_2012_PIA_full.pdf).
The latter couples region assignment with palette representatives, rather than
independently downsampling and quantizing each pixel. These are established
methods, not claims of a newly invented2026 algorithm. Our bounded GPU pass is
an original adaptation; it does not implement either complete paper or copy
their source code. In particular it has no connectivity enforcement and no
learned/iteratively optimized global palette.

New `src/poc/pixel-cluster-pass.ts` operates after tone mapping on the detailed
3D beauty image and preserved depth. It initializes region centers on a fixed
screen lattice, assigns pixels to nearby centers by luminance/chroma, spatial
and depth-plane distance, and gathers assigned pixels into shared color means.
Two assignment/update iterations are followed by final labels. A midpoint
color barrier discourages crossing thin seams. The output uses each region's
shared representative; an explicit label view makes the assignment inspectable.
No authored mark, paint atlas, noise or reference image is an input to this pass.

Centers and labels use nearest FloatType render targets. Depth is converted
to view distance, never averaged raw perspective depth. Plane slopes permit
floor grouping without treating its perspective gradient as a discontinuity.
Centers sample a real assigned member when their centroid falls into a hole.
All sampling anchors use texel centers. Candidate and gather coverage depend
on the fixed seed cells; CPU enumeration checked spacing2–6 without gaps.
A two-sided ridge/valley guard retains narrow seams/glints without bypassing
all ordinary high-contrast contours. The final pixel grid is2physicalpixels
on desktop and1on outputs below800px wide to preserve mobile detail.

Optional shared representative quantization feeds back into assignment. The
selected POC uses24sqrt-luminance steps and36chroma steps in a YCoCg-derived
space, preserving denser shadow values. This is a deterministic fixed lattice,
not a literal24-color palette or a perceptually uniform Lab metric. Coarser12
and16step variants were inspected but caused too much banding/flattening.
Selected seed spacing4, color scale.065, spatial weight.3, twoiterations.

`visual-poc.html` now defaults to Pixel grouping ON and Material paint OFF.
Both controls remain separately reversible. Existing geometry, object/light
placement, defaultcamera and base environment are unchanged. The existing sky
stays visible when material paint is disabled; its disappearance in early
ablations was an old all-effects-toggle coupling, not a required scene change.
The default material paint effects and authored diffuse/normal overlays are
disabled for this proof. The algorithm itself uses only beauty and depth.
`?style=materials` retains the preceding material-study entry point.

Verification so far: TypeScript/build pass; final POC GPU checks cover same-pose
grouping on/off and exact restoration, native/pixel grid, material switch,
reference toggle, four camera-motion poses with exact reset, and mobile.
Root inspected default/motion/mobile captures. Required skillclient passes
two Orbit bursts with active grouping, disabled materialpaint and GL0/noerrors.
The narrow-output 1px adjustment was verified at 390×844. Actual Arcade/Tokyo
evaluation with original materials completed both desktop, motion and mobile
captures without GL or browser errors. Its strict image restoration gate was
not a clean pass: Arcade also varied between two unchanged baseline draws
(13 pixels, maximum channel difference 7), and restoration differed at 30
pixels (maximum 11). Tokyo restored exactly, but an all-scene reference
assertion after motion included legitimately streamed city geometry. The
first report retained only a boolean, so the precise changed meshes were not
recoverable. No production-default racing adoption is claimed.

The result now demonstrably groups pixels into shared regions. It still falls
short of the cutscene's rendering fidelity. Fixed screen seeds do not guarantee
motion coherence; full temporal qualification remains outstanding. Warm
single-draw+GPU-finish samples in the first unquantized study were17–20ms after
a1.49s firstcompile; these are not representative gameplay frame-rate results.


### Adjacent-region merging: replacing the global color ladder

The next renderer experiment directly addressed two observed failures: broad
synchronized bands on the cream car, and numerous small floor specks. The
selected POC now disables the global palette lattice and merges compatible
neighboring pixel regions. This is a bounded graph operation on the rendered
image; it adds no painted textures or scene-specific masks.

After the final pixel assignment, an extra gather computes exact region
areas, bounds and unquantized color means. Each region scans its real cardinal
pixel boundaries for a compatible neighbor. Two regions merge only when they
choose each other, their combined area is at most 64 source pixels, their
combined bounding box is at most 12×12, and color/depth/boundary checks pass.
The surviving region gets the area-weighted color mean; pixel labels redirect
to its canonical owner. Two rounds permit up to four initial regions to join.
Four float MRT attachments preserve color/depth, surface anchor/slope, area
and bounds. Ping-pong targets keep all reads separate from writes.

The selected parameters are spacing 4, color scale .065, spatial weight .3,
two assignment iterations, two merge rounds, merge color scale .055,
paletteSteps 0 and detailStrength .3. The broad .095 color-scale alternative
smoothed more without a useful visual gain and was rejected. The narrower
local-extremum escape retains some small highlights without restoring every
texture speck at full strength. Material paint remains off by default.

GPU readback on the 1600×929 canvas verifies actual merging: active regions
fall from 93,151 to 55,300 (about 40.6%). All 1,486,400 source pixels have valid
owners; exact accumulated region areas equal per-label pixel counts, total
area is conserved, and no resulting region exceeds 64 pixels in this scene.
These are algorithm checks, not evidence of artistic fidelity. Captures and
numeric evidence are in `output/browser/garage-poc/pixel-region-merge-study`.
All six variants compiled/rendered with GL0 and no browser errors.

Visual inspection finds fewer broad car-panel bands and modestly larger
floor patches. Most of the visible improvement comes from removing global
quantization; the extra merge effect is subtler. The result still reads as
filtered 3D and does not match the cutscene's authored painting. Original
superpixels may contain disconnected fragments, and merging adjacent labels
does not repair those fragments. Equal-cost tie-breaking can also stall on
uniform regions; a single weak contact can admit a merge despite stronger
edges elsewhere on the shared boundary. Temporal coherence, full gameplay
performance, and production adoption remain unqualified.


Final merged POC verification also passes build, exact reversible switches,
four drag poses/reset, reference controls, mobile 390×844 and two required
skill-client Orbit bursts. Root opened the final default, motion and mobile
images and both text states. The selected settings are active in the POC.

The separate actual-racing merge study completed both modes and teardown
without GL/page/console errors. All 376 native-car meshes retained original
material and geometry references throughout each route. Tokyo's only observed
reference changes were geometry replacements for City access paving, City gate
masonry and City gate coping during normal city-window streaming; their
materials remained identical. Tokyo's repeated baseline and toggle restoration
were exact. Arcade's repeated baseline differed at 14 pixels (maximum channel
7), and restoration at 32 pixels (maximum 11), exceeding the retained strict
gate. Full pose/camera snapshots stayed unchanged. This does not establish
whether repeated world drawing or another renderer input causes the drift;
the overall report is explicitly a qualified failure. It is not presented as
a clean gameplay-validation pass.

Tokyo mobile rendered at 390×844 with a 1px grid. The first Arcade mobile
capture was black because ResizeObserver could resize/clear the output after
the harness's explicit draw while automatic animation was disabled. A separate
Arcade-only capture correction waits for actual canvas dimensions before
rendering and verifies matching pass dimensions, an unchanged simulation tick
and non-black pixels. This is a harness synchronization fix, not a game change.

The Arcade-only follow-up confirms the resize correction: actual canvas and
cluster pass are 391×844 (rounded physical width), pixelSize 1, with 323,549 of
330,004 pixels nonblack and simulation tick still 86. Root inspected the full
scene/HUD capture. All 5,008 scene mesh references, including 376 native-car
meshes, stayed identical; no GL/page/console errors. The strict baseline and
restoration comparisons still fail (13 pixels/max7 and 29 pixels/max11), so
this remains qualified evidence, not a full pass. Previous failed captures
were preserved. Evidence: `output/browser/racing-pixel-region-merge-arcade-mobile`.


## September 22 — geometry contours independent of texture painting

The preceding turn made concrete progress through GPU region merging and real
scene/mobile evidence. The full goal remains incomplete. Current reference
comparison identifies a different rendering gap: dark structural creases and
selective edge catches are missing, while smooth shaded interiors remain.
This is independent of the scene's composition.

Rechecked the primary [Never's End GDC 2026 slides](https://media.gdcvault.com/gdc2026/Slides/Juckett_Ryan_HowWeDrawA3DSpriteWorldTheStylizedArtOfNeversEnd.pdf).
Its separate object/depth/material outlines and normal-driven inlines support
handling contours independently of material surface art. The existing POC
geometry pass was disabled whenever Material paint was off. A new independent
geometry-linework control removes that coupling while preserving the legacy
material-study path when the override is null.

The new crease term reconstructs neighboring view-space positions from
preserved geometric depth and the inverse projection. A positive displacement
above the current tangent plane identifies a concave fold; normal bending
and a one-sided key-facing rule select a narrow dark stroke. IDs, depth and
glass agreement continue to reject unrelated surfaces. Existing image
contrast attenuates ink per boundary, avoiding suppression of a valid crease
by an unrelated perpendicular edge. Self-lit materials suppress their own ink
so fluorescent tubes do not acquire false dark scratches.

An initial before-cluster study compiled and restored exactly, but grouping
averaged away much of its thin ink. The selected pipeline therefore forms
pixel regions first, then adds contours on the same 1/2-physical-pixel lattice.
Source color, glazing, IDs, normals, ink and both depth buffers share the same
representative texel. With grouping disabled, geometry reads remain one pixel
and the existing final pixel pass remains in charge. Wider neighborhood steps
scale the local crease depth tolerance. Geometry, cameras, lights, base
materials and texture assets are unchanged.

The reviewed study configuration is line strength 1, crease strength 1,
contrast suppression .7 and warm-inline strength 0. Bumper/apron seams and
shelf contents become more legible; the unattenuated outline variant looked
too boxed. The first captures still showed emissive scratches; a self-lit
exclusion was added before final verification. This does not solve the
cutscene's irregular interior color shapes or temporal stability.

A new research lead is [Di Biase's November 2025 tractography paper](https://arxiv.org/abs/2511.00702),
an exploratory use of structure tensors for painterly stroke placement. It
suggests a possible direction for coherent interior regions, but no code or
technique from it has been adopted or performance-qualified here. A search
result for a 2026 direction-aware superpixel paper could not be opened, so it
is not used as implementation evidence.

The actual-Arcade direct-render isolation saved offA, offB, on and offC raw
WebGL frames without calling the world update between them. Both offA/offB
and offB/offC are pixel-identical under the original strict comparator. All
376 car references and recorded transforms/lights/shadows/instance matrices/
geometry metadata stayed unchanged. Sixteen material.version counters rose
by two per draw, consistent with Three's double-sided transparent rendering;
this bookkeeping made the broad state report qualified rather than a clean
pass. This specific test isolates the earlier 13–29-pixel discrepancy to the
bypassed world-update/public-2D path; it does not establish global temporal
stability. Evidence: output/browser/racing-pixel-direct-isolation.


## September 22 — direction-aware pixel regions

The previous goal turn made progress: geometry-derived contours were implemented
and checked in the POC and actual racing. The full visual goal remains active.
The user explicitly requires renderer-generated pixel grouping rather than more
authored texture tricks; this continuation changes only the grouping/outline
pipeline, without changing composition, models, texture assets or controls.

Revisited [Kyprianidis et al.'s primary structure-tensor treatment](https://www.kyprianidis.com/p/tpcg2010/jkyprian-tpcg2010.pdf).
Its local minor eigenvector and eigenvalue contrast motivate the direction field
used here. This is a new original region-assignment implementation, not that
paper's full Kuwahara filter, not a new 2026 invention, and not its performance
result.

`PixelClusterPass` now computes a small structure tensor for each seed from the
lit frame, with Gaussian-weighted color-gradient products and depth-plane
rejection. Flat/low-energy neighborhoods have no directional bias. Confident
regions use an elliptical distance metric in assignments and prefer adjacent
merges along their local tangent. The merge area/bounds scale with seed spacing;
these constrain merges, not the maximum area of an initial assignment. A real
source member still anchors every representative's depth. Neither authored
brush maps nor random orientation fields enter this pass.

The initial seven-variant GPU study at
`output/browser/garage-poc/pixel-direction-study` conserves all 1,486,400 pixels
and exact area counts, with no invalid owners or GL/console errors. Direction5
has 36,909 active regions. Root inspected the default, larger-scale alternatives
and car crops. Changes are modest: floor/detail color regions become coarser,
but the car's broad panels still read as smooth rendered surfaces. This is not
a cutscene-fidelity pass.

A separate experiment amplified each region's color residual against neighboring
regions. Root rejected it because it made walls/floor blotchy without solving
the smooth car. Its source is retained only at
`tmp/fidelity/pixel-cluster-pass-rejected-region-contrast.ts`; it is removed from
the active renderer. Images remain in `pixel-direction-contrast-study`.

Tiny actual-GPU fixtures at `pixel-direction-synthetic` verify finite flat-field
output, correct tangent axes, zero region crossings at a depth split, exact
6,499-pixel mass/ownership on a 97×67 odd-sized image, repeatability and reversible
direction switches. The first harness result failed only because its empty HTML
requested a nonexistent favicon; the failed report is preserved. Adding an
inline empty favicon makes that same strict run pass without ignored errors.
After this run, derivative taps gained their own depth rejection and the disabled
merge path stopped reading direction data; those final refinements still require
the final run. Temporal coherence and racing performance remain unqualified.


### September 22 — actual racing contours and emissive-cover eligibility

The completed actual-scene contour study is retained at
`output/browser/racing-pixel-geometry-study/report.json` (terminal 69471,
qualified exit 1; browser closed). This used spacing 4, direction disabled,
line/crease strength 1, contrast suppression .7 and inline strength 0.
Arcade and Tokyo each completed four motion captures (ticks 71/76/81/86),
synchronized mobile rendering and restoration of the original render pass.
All 376 native-car material/geometry references remained identical throughout
each route. Tokyo changed only the expected streamed City access paving,
City gate masonry and City gate coping geometries beginning study frame 44;
their material references remained unchanged. No GL, page or console errors.

The strict image gate stays qualified: Arcade unchanged-baseline repeat differs
at 15 pixels/max channel 7 and toggle restoration at 24/max 11. Tokyo's repeated
baseline and restoration are exact. Mobile rendering is valid at 391×844 for
Arcade (98.05% nonblack) and 390×844 for Tokyo (75.49%), both with pixelSize 1
and unchanged simulation tick 86. Desktop, final motion and mobile captures were
opened: broad body panels remain legible, but taillamps acquire excessive dark
subdivision marks and Tokyo's illuminated facade/roadside edges appear etched.
No displaced silhouettes or obvious proxy leakage was found. This evidence
does not establish a cutscene-style match, temporal stability or frame budget.

Source diagnosis of the taillamps found that native LampCovers are transparent,
opacity .88, depthWrite false and have mapped emission at intensity .1 normally
or 2.1 while braking. Their proxies were therefore absent from the geometry ID
pass, allowing opaque reflector subdivisions behind them to generate contours.
The original cover map is a 1024×1024 RGB WebP (all alpha 255). A property-based
fix in `illustrated-linework.ts` now treats nonzero mapped emission as self-lit
and admits dense transparent emitters only as zero-ink auxiliary occluders.
This changes no source material, texture, geometry, camera or beauty shading.
Source map alpha, alphaMap, opacity, existing alphaTest, side and clipping are
retained; an auxiliary .5 effective-coverage cutoff rejects transparent texels.
Faint glass below .5 opacity remains excluded. No material-name test is used.

TypeScript and seven CPU proxy cases passed (opaque paint, normal/braking
mapped covers, explicit cutouts, faint emissive glass, unlit transparency and
an opaque emitter), including source immutability and renderer-state restoration.
This is not a GPU result: the actual-car visual fix remains pending. A generic
mostly opaque glass surface with even slight mapped emission also qualifies;
its covered silhouette may suppress legitimate interior contours. That tradeoff
and the .5 auxiliary coverage cutoff need real-scene review before broad adoption.
A separate prepared harness at `tmp/fidelity/racing-pixel-direction-emissive-study.mjs`
uses the next selected spacing 5/directionStrength 1 configuration; it has not yet
been run and cannot replace the spacing-4 study evidence above.


Final direction-aware POC validation now passes. Selected POC settings are
spacing 5, directionStrength 1, mergeRounds 2, paletteSteps 0 and detailStrength .3;
material painting remains off. Root opened default, motion-3, mobile and the
required skill-client Orbit screenshot, and read both skill text states.
`pixel-direction-final` passes exact group/contour/grid/material restoration,
four camera drags/reset and reference controls at desktop 1600×1000 and
mobile 390×844. No GL/page/console errors. `pixel-direction-skill` passes two
Orbit bursts. Build passed (`output/fidelity/pixel-direction-build.txt`).

Final synthetic GPU run passed after derivative-depth guards. It also checks
that flat-field labels are exactly identical with direction off/on: merge bias
now includes the weaker of both neighboring coherence values. The 97×67 fixtures
use spacing 6, not spacing 5. Their directions are finite and axis-correct, each
accounts for all 6,499 pixels, depth-separated regions never cross, and repeat/
restoration images are exact. Source review found no remaining correctness
blocker within this bounded algorithm.

At equal spacing 6, independent visual review sees a small directional improvement
in floor patches and highlight edges. Changing the selected spacing from 4 to 5
also affects region size; its improvement must not be attributed solely to
anisotropy. Initial assignments can exceed merge area caps and may be disconnected.
The full cutscene's painted interior shading, temporal stability, production
adoption and gameplay performance remain outstanding. Actual Arcade/Tokyo
direction-and-lamp qualification is running separately; POC results do not
substitute for it.


Actual-racing follow-up is now retained at
`output/browser/racing-pixel-direction-emissive-study/report.json`: both routes
completed with the selected spacing 5/directionStrength 1 and emissive-cover
eligibility fix (terminal 67720, qualified exit 1; Chromium closed). Desktop,
final-motion and both mobile screenshots were opened. The previously prominent
dark boxes/rosettes inside the red taillamps are absent from the viewed frames;
the lamps keep their native broad red/white regions. There is no obvious new
outline displacement or window/pavement occlusion artifact in these captures.
This is final-configuration visual evidence, not a one-variable attribution:
spacing and region direction changed alongside the cover fix. The earlier
seven CPU proxy cases separately validate the eligibility mechanism.

All 376 car material/geometry references stay identical in each mode. Arcade
has no scene reference changes; Tokyo has only the same three streamed city-plot
geometry changes, with unchanged materials. Both original passes restore and
teardown without GL/page/console errors. Four motion captures reach ticks
71/76/81/86. Mobile is 391×844/98.20% nonblack for Arcade and 390×844/75.65% for
Tokyo, pixelSize 1 and tick 86 unchanged. Tokyo baseline/restoration are exact;
Arcade strict baseline 14 pixels/max8 and restoration 36/max12 remain failed.
The strict report remains qualified; no thresholds were widened. This does not
resolve temporal coherence, gameplay performance or full cutscene-style fidelity.


### September 22 — analytic illumination before pixel grouping

Added `src/poc/clustered-lighting.ts`: an original material shader wrapper
operating on actual physical light/shadow/IBL response. It separates diffuse
albedo from accumulated diffuse illumination, forms derivative-smoothed
logarithmic light-value planes, then reapplies albedo. Indirect shade can shift
cooler at conserved luminance. It does not invent ambient light in unlit recesses.
The existing image-derived pixel-region pass runs after this shading. No new
texture, material-name rule, geometry, camera or light-placement change is used.

The relevant primary source was rechecked: Never's End GDC 2026 slides 35–39
and 45 describe separate diffuse/specular/AO ramps and ambient shade treatment.
Our accumulated-illumination operation is a limited adaptation, not a port of
that complete per-light art workflow. The installed Three r186 physical shader
was inspected for its separate `diffuseContribution` factor, and restoration
occurs before transmission evaluation. Transparent and transmissive materials
are excluded.

Selected parameters are strength 1, diffuseBands 1, specularStrength 0 and
shadeTint .35. Strong specular quantization was rejected after screenshots
showed isolated bright floor patches. Original reflections remain. V3 fixed
a componentwise ratio which lost newly tinted channels under saturated light;
v4 tints the actual indirect term rather than tinting total light by its share.
A scalar direct/indirect split preserves the new channels. Clearcoat uses its
own roughness, and derivatives are computed before the low-energy return.

At strength zero the wrapper restores original shader callbacks and cache
keys. A prior disabled-branch implementation failed exact image restoration;
its retained report is `clustered-lighting-shade-study/report.json`. The cause
inside GPU compilation was not established. Current exact restoration uses
the original compiled program, not a widened pixel tolerance. Callback ownership
is single-owner POC scope; arbitrary later callback replacement is unsupported.

Visual studies are retained in `output/browser/garage-poc/clustered-lighting-study`,
`clustered-lighting-shade-v3` and `clustered-lighting-final-study`. Root and an
independent reviewer opened the selected result. DiffuseBands 1 produces clearer
cream upper panels and a broader darker bumper plane than 1.3 or 1.5. This is
progress in rendering style, not a cutscene match: floor grain, smooth specular
glints, overly dark mechanical fills and mechanical-looking light footprints
remain visible. Composition was held fixed and is not an acceptance criterion.

The POC now enables this shader on 126 opaque materials and exposes a Painted
light toggle. Legacy Material paint remains off; enabling it disables this
lighting wrapper to keep the experiments separate. Mobile controls fit in two
rows. Production racing defaults are unchanged.

Validation completed:
- `clustered-lighting-synthetic/report.json`: actual float-target GPU tests pass
  saturated ambient/mixed light, finite results, preserved ambient luminance,
  zero black/pure-metal diffuse, original material/geometry references, original
  callbacks/cache keys and bit-exact off/dispose pixels. Its first test fixture
  imported a duplicate Three module and registered no meshes; that failed report
  is retained. The corrected fixture imports the same Vite module and requires
  exactly one installed material. This was a test-fixture issue.
- `clustered-lighting-final/report.json`: all six style controls, four camera
  drags, reset, desktop 1600×1000, mobile 390×844 and reference visibility pass.
  Toggles restore exact pixels; GL/page/console errors are empty. Root opened
  default, mobile and final-motion screenshots.
- `clustered-lighting-skill`: required game skill client ran two Orbit bursts;
  root inspected the final screenshot and both text states, with GL0 and no
  error artifact.
- `output/fidelity/clustered-lighting-build.txt`: build passes, retaining the
  existing large-chunk warning.

Actual Arcade/Tokyo validation is running separately. These POC tests do not
qualify racing frame time, temporal coherence, cutscene fidelity or production
adoption. A bounded diagnostic will isolate floor normal relief versus detail
escape and color-group tolerance; no floor texture replacement is proposed.


Follow-up diagnostics and lifecycle correction:

`cluster-grain-diagnostic` passed exact restoration and GL/errors0. Root inspected
floor normalScale0, detailStrength0, their combination, and wider color grouping
(.11/.09). Removing normal relief reduces some fine variation but leaves the
larger granular floor pattern. Disabling detail escape alone does not resolve it;
wider color tolerances produce larger blocks without matching painted patches.
No parameter from this diagnostic was promoted, no texture changed, and no
second full diffuse lighting evaluation was added for this limited benefit.
The first diagnostic selected an auxiliary geometry proxy without a normalScale;
its failed report is retained and the fixture now requires a physical normal-map
material. This was a selector error, not a renderer failure.

Actual racing v4 completed both routes but uncovered a real lifecycle issue:
one initially invisible Tokyo Primary material acquired the native spotlight
early-out wrapper after styling. That later wrapper captured the experiment,
so disposal correctly preserved the newer callback but left the experimental
code/key inside it. All native car material/geometry references remained intact.
Arcade's strict image gate still failed (baseline15/max7; restoration57/max12);
Tokyo baseline/restoration images were exact. The report remains retained at
`output/browser/racing-clustered-lighting-study/report.json` and is not a pass.
Root also opened both desktop results and Tokyo mobile. Broader light planes
are visible, but coarse wall speckles and crisp scalloped road light regions
are additional reasons not to enable this by default in production.

The v5 shader fixes native callback composition: configuration only replaces
callbacks/cache functions it owns, an inner inactive/disposed hook delegates
without injecting shader code or uniforms, and its inactive key is the original
key. State transitions invalidate the material program even with a later outer
owner. Disposal cannot be reversed by configuring the disposed instance. This
preserves a legitimate later native decorator while removing experimental work.
For an unwrapped material, exact original callback identities still restore.
The normal POC/synthetic tests and build pass again after this correction; the
specific later-owner path requires its native-only control and racing rerun.


The v5 actual-racing run completed at
`output/browser/racing-clustered-lighting-v5/report.json`, qualified exit1 only
for Arcade's unchanged strict image gates (baseline12/max8, restoration58/max12).
Tokyo images are exact. The late spotlight owner matches an independently
constructed native-only control in vertex/fragment shader text, uniform keys
and full cache value. The comparator uses the actual native decorator and
forwards original callbacks with the real renderer identity; it does not ignore
key suffixes. All ordinary owners still require original callback identities.
Disposed configuration cannot reactivate the experiment. Native car references,
four motion captures, mobile output and GL/error checks pass. Browser closed.

Additional CPU review found a distinct off-first case: after registering while
strength0, a native decorator can capture only the original shader; preserving
that newer owner then misses installation when the experiment is first enabled.
V6 tracks whether its callback is still attached. A detached entry adopts the
new native owner as its base before enabling; an attached inner callback keeps
its existing base, preventing a cycle around its own outer wrapper. This changes
lifecycle composition, not the selected lighting/image algorithm. Focused order
permutations and final v6 checks are being completed separately.


V6 CPU lifecycle coverage now passes all six cases in
`output/fidelity/clustered-lighting-v6-cpu-lifecycle.json`: off-first/native,
on-first/native, and on/off/native, each with default and custom existing hooks.
Two toggle cycles and disposal check both effects exactly once while active,
exact native-only shader/uniform/key output while off, native owner identities,
unchanged geometry/material references, no parameter-only recompilation and no
post-disposal reactivation. These are actual module executions without a GPU.
Final v6 synthetic GPU, full desktop/mobile POC checks and build also pass.


Final v6 actual-racing validation completed at
`output/browser/racing-clustered-lighting-v6/report.json` (session45443,
qualified exit1, browser closed). Native-only shader lifecycle control passes,
including the late spotlight owner and prohibited disposed reactivation. Both
modes retain all376 native-car material/geometry references, restore the original
render pass and complete four motion captures plus synchronized mobile1px output.
No GL/page/console errors. Tokyo changes only its expected three streamed city
geometry batches. Tokyo baseline/restoration images are exact; Arcade remains
strictly failed at baseline14pixels/max8 and restoration57/max11. No tolerance
was widened and this is not reported as a clean racing pass.

Root reviewed the final report, Arcade mobile and Tokyo final-motion images;
the independent reviewer opened both desktop/mobile/motion sets. The same wall
stippling and hard road-light scallops remain, with no new lifecycle regression.
No further broad reruns are justified without another change. Current POC is
available at /visual-poc.html; shader math/source settings are those pinned in
clustered-lighting-final/source-pins.json. Production defaults remain unchanged,
and full style/temporal/performance goals remain unfinished.

## September 23 — display-resolution pixel grouping

The POC now treats pixelation as **image-derived regions**, rather than a final
coarse image grid. The beauty pass still shades the original 3D geometry at
display resolution. The region pass assigns each pixel to a color-and-depth
seed, updates region representatives, then merges neighboring regions that
agree in color, local depth plane and source-edge evidence. A larger optional
hierarchy permits up to a 30-pixel extent and 400-pixel area at spacing 5; every
accepted region remains a union of actual pixel assignments. Its tangent uses
sign-invariant summed moments. This is an engineering implementation informed by
[SLIC](https://www.epfl.ch/labs/ivrl/research/slic-superpixels/) and
[SNIC](https://www.epfl.ch/labs/ivrl/research/snic-superpixels/), not a claim to
implement their full methods or their guarantees. In particular, the pass has
no connectivity enforcement.

A second optional assignment stage penalizes disagreement with four adjacent
labels, weighted by actual source-color similarity and reciprocal local-depth
agreement. It updates red and black pixels in separate passes and never draws
into its own input texture. This is a local consistency heuristic, related in
principle to contrast-sensitive label costs in
[Robust Higher Order Potentials for Enforcing Label Consistency](https://www.microsoft.com/en-us/research/publication/robust-higher-order-potentials-enforcing-label-consistency/)
and the segmentation/denoising aim of
[Discrete Potts Model for Generating Superpixels on Noisy Images](https://arxiv.org/abs/1803.07351).
It is not either paper's optimizer and does not guarantee connected regions.

Actual Metal GPU synthetic tests in
`output/browser/garage-poc/pixel-hierarchy-synthetic/report.json`,
`pixel-coherence-synthetic/report.json` and
`pixel-coherence-default-iterations/report.json` cover flat, grain, directional,
color/depth boundaries, perspective depth, thin seams and small islands. The
optional hierarchy preserves exact pixel mass, bounds and representative member
in those fields. The regularizer likewise preserves exact statistics after its
final gather and restores the disabled output byte-for-byte. At strength 0.5
and four iterations, a noisy synthetic field fell from 369 connected components
to 62. This measures less fragmentation, not fidelity to the cutscene image.
The two-iteration variant erased a tested 2×2 color island, and strength 2
damaged a one-pixel seam. Thin same-color depth features may still mix; these
cases prevent any general detail-preservation guarantee.

In the fixed garage view, `output/browser/garage-poc/pixel-coherence-study/`
shows a modest reduction in scattered floor fragments with no obvious loss of
headlamps, belts, pulleys or wheels. The matched 1-pixel grid comparison in
`pixel-coherence-grid-study/` keeps lettering and mechanical features clearer
than the coarse 2-pixel finish. The selected POC settings are spacing 5, four
assignment iterations, six merge rounds, merge scale 2, neighbor strength 0.5,
and one physical display pixel. Four iterations preserve the small colored
island in the tested synthetic field. The large smooth car panels and narrow
white glints remain visually unlike the cutscene's broad reflected-light shapes;
the image is not a style-match certification. No authored texture or scene
composition changed in this renderer experiment.

### September 23 — actual race renderer integration and qualification

The common production cinematic pass now uses grouped pixels whenever the
normal Pixel Finish setting is on. `?render=cinematic` retains the old 2×2
sampler as a comparison route; `?render=grouped` adds experimental analytic
illumination to the region renderer. The color/depth region pass runs **after**
the one ACES/sRGB OutputPass and reads a preserved scene depth texture. It
disables the old 2×2 sampler while grouped regions are active. With Pixel Finish
off, the game renders a clean display-resolution frame; the explicit cinematic
route keeps the legacy 2×2 path. The shared Arcade and Tokyo RaceWorld applies
analytic illumination to new scene materials only on the experiment route. No car geometry, authored texture, steering or simulation
path changed. The normal game now uses region grouping as its pixel finish; the
experimental analytic light planes are enabled only by the explicit local
comparison route `?render=grouped&picture=pixel`.

The first combined run failed with GL1282: architecture visibility clones a
material after the lighting shader has been attached, then applies its own
wrapper; applying lighting to the clone injected declarations twice. The light
hook now detects that its unique shader declaration is already present after
calling the native owner and reuses the existing uniforms. An actual clone and
spotlight wrapper permutation test verifies one injection when active and exact
native shader text/uniforms when disabled or disposed. The separate v7 program
key generation also fixes a 1→0→1 lighting toggle that previously reused a
native cached program without custom uniforms. Its optional BRDF roughness
floors are zero by default: tested floors did broaden/dull the car glints, but
visually did little to close the cutscene style gap.

With the duplicate-injection fix, `output/browser/renderer-grouped-lighting-3d-v2/`
passes the full six-camera Metal renderer script: actual Arcade/Tokyo 3D scene,
HUD, unchanged native state, stable scenery, hazards, endpoints, resources,
reduced motion and zero GL/page errors. `output/browser/steering-grouped/`
passes 73 checks including real ArrowLeft/ArrowRight motion in both modes.
`output/browser/racing-grouped-mobile-driving/` captures both modes after a held
touch throttle at native tick 67 and positive speed, 390×844 layout, no
horizontal overflow and zero GL/page errors. Timings are synchronized runs on
a desktop M4 Max with a mobile viewport, **not** phone GPU performance evidence.
`npm run build` passes with the existing large-chunk advisory.

Root opened the latest garage, six-camera race and mobile driving frames.
The pixel patches are more coherent and display-resolution lettering survives,
but the car panels remain broad/flat and the road/building light can look
blocky. The test and build results prove functional integration, not the user's
illustrated cutscene style target. The grouping improvement is now the normal
Pixel Finish, but the full visual goal remains active: the rendering appearance still needs a convincing
cutscene match and real device performance evidence. Keep the analytic light
planes on their explicit comparison route while their race-scene response is
uneven.

The final default-path qualification followed the preview study:
`output/browser/renderer-default-grouped-3d/` passes all six Arcade/Tokyo
camera, HUD and native-state checks; `renderer-legacy-control/` passes the same
check through `?render=cinematic`. The settings toggle test at
`racing-grouped-settings-toggle/` switches grouped→clean→grouped without
advancing simulation and restores the initial grouped image exactly.
`steering-default-grouped/` again passes 73 real-key and native projection
checks, including the previously inverted arrow directions. The actual default
mobile driving run at `racing-default-mobile-driving/` reaches tick 67 with
held touch throttle and positive speed in both modes, no overflow or GL/page
errors. `npm run build` and the required two-burst web-game skill client pass;
its inspected final frame and both JSON states show 1-pixel regions, grouping,
analytic POC light, ready=true and GL0. The live local race preview was opened
in the in-app browser. These are functional and visual inspection gates, not
proof of the still-unmatched cutscene art or performance on a real phone.

### September 23 — reflected 3D source, nested light regions, and depth ink

The next pass addresses rendering properties inside the actual 3D scene, with
no new painted texture overlay. `src/game/three/reflections.ts` now supplies the
shared Arcade/Tokyo `RaceWorld` with a nearby HDR cubemap for eligible car
paint, glass, rim, and chrome materials. It captures one 128-pixel cube face per
displayed frame and publishes a filtered environment after six faces, hides
cars during capture to avoid self-reflection, and invalidates on course change.
The previous distant HDR remains for cars outside the probe's 24 m radius.
The fixed-state renderer check at `output/browser/renderer-two-scale-depth-ink/`
observed the probe becoming ready, 40 bound materials, 43,855 changed screenshot
pixels, and GL0. This proves real scene radiance reaches the car materials; the
visual change is subtle and the bodies still do not have the cutscene's broad,
carefully shaped reflected light. One moving probe for nearby cars can also lag
the world it represents. The POC's stationary per-car 512-pixel reflection
capture is not equivalent to this lower-cost racing configuration.

The region renderer now retains **two image-derived scales**. It captures the
fine assigned-region mean luminance before six adjacency merges, then lets the
broad merged region control hue and coarse value while a bounded log-luminance
residual restores some existing small reflected-light planes. This is calculated
from the shaded 3D image and labels, rather than stamped onto car or road
textures. Default strength is 0.85 in the POC and normal racing Pixel Finish.
The comparisons in `output/browser/two-scale-pixel-study/` show only a modest
increase in small value structure; pushing strength to 1.5–2.5 amplified floor
texture more than meaningful car form and was rejected. The operation cannot
invent light information missing from the source render.

For the real race renderer, a later compose step derives a one-display-pixel
near-side contour from true scene depth, subtracting local perspective slope
so a continuously graded road or wall is not inked merely for receding in
depth. It fades distant contours and uses strength 0.35 by default. The
synthetic GPU fixture at `output/browser/pixel-depth-ink-synthetic/report.json`
keeps flat and linear-depth planes unchanged while darkening the near side of
an occlusion edge; GL0. `output/browser/depth-ink-study/` compares strengths
0/0.35/0.7; 0.7 over-etched. The garage POC keeps its separate illustrated
linework and does not add this depth ink. Porting that POC linework wholesale
would require another scene render and buffers, and its proxies do not
faithfully reproduce car dither, glass, or shadow-only scenery; this narrow
depth cue avoids those known mismatches but cannot reproduce all semantic
material boundaries.

The [EPFL SLIC superpixel study](https://www.epfl.ch/labs/ivrl/research/slic-superpixels/)
remains the foundation for treating neighboring pixels as coherent regions,
while [Hypersect's GDC 2026 slides](https://media.gdcvault.com/gdc2026/Slides/Juckett_Ryan_HowWeDrawA3DSpriteWorldTheStylizedArtOfNeversEnd.pdf)
reinforce the other half of this problem: detailed, deliberately shaded 3D
materials and selective single-pixel linework must be authored *before* the
final pixel finish. Our hierarchy is SLIC-inspired, not a SLIC implementation;
the GDC presentation is an example workflow, not evidence that this scene has
achieved the same result. A nonlinear shadow-merge veto showed little useful
change and was reverted. Reflection-intensity boosts to 1.7/2.5 made the cars
look neon-like, and headlight trials at 500/2000/6000 cd produced an obtrusive
cone without cutscene-quality road detail; both remain at their original
strengths. Their studies are retained in `output/browser/shadow-merge-study/`,
`reflection-intensity-study/`, and `headlight-photometry-study/`.

The six-camera race check, 73 steering checks, and fixed-radiance
grouped→clean→grouped settings restoration pass at
`output/browser/renderer-two-scale-depth-ink/`,
`steering-two-scale-depth-ink/`, and
`racing-two-scale-settings-toggle-fixed/`, respectively. The toggle fixture
freezes independent reflection-probe updates so the hash comparison isolates
the Pixel Finish setting; a live probe legitimately changes lighting over
time. `output/browser/racing-mobile-final-depth-ink/` reaches tick 67 under
held touch throttle in Arcade and Tokyo, reports ready probes (19/16 published
generations), positive speed, no horizontal overflow, and GL/page errors empty.
This is a 390×844 viewport on a desktop M4 Max, **not** physical phone GPU
performance. Visual inspection still finds broad, flat car panels and sparsely
lit asphalt/buildings relative to the reference's dense painted-pixel detail.
The user-visible cutscene rendering goal remains unfinished.

### September 23 — rejected practical-light shadow pass

A fixed-camera trial gave one street lamp and one shop light 512-pixel shadow
maps, with stable light-slot selection. The actual Arcade/Tokyo renderer and
typecheck passed; exact on/off/on captures at
`output/browser/racing-warm-shadow-fixed-ab/` showed GL0 and exact restoration.
The images gained mostly a darker patch beneath nearby cars and little of the
cutscene's fine illuminated structure. Arcade chase rose from 1,614 to 1,954
draw calls and 42.5M to 67.6M rendered triangles; Tokyo chase rose from 2,643
to 3,064 calls and 20.0M to 25.6M triangles. This 28–59% extra triangle work
was not justified by the visible result, so the experimental shadow changes
were fully reverted. The original directional shadow and unshadowed practical
lights remain.

### September 23 — geometry-anchored fluorescent area lights

The final real-scene light addition is two Three `RectAreaLight`s attached to
visible shop fluorescent tubes in `src/game/three/world.ts`. Each emitter is
1.72 m × 0.14 m at intensity 65, so the additional reflected-light shape comes
from a physically placed area source and the existing 3D materials. It adds no
texture and no extra scene draw. A fixed-state Arcade/Tokyo comparison at
`output/browser/racing-area-light-final-ab/` changed 17,556 and 114,367 image
pixels respectively, restored the baseline exactly after switching off, and
reported GL0/errors empty. Strengths 130 and 260 washed broad surfaces out,
so 65 was retained. The difference is most visible around illuminated shops;
it does not create the reference's dense, hand-shaped light and pigment marks
across car bodies, road, and architecture.

The same A/B included synchronized desktop timing: Arcade median 10.5→11.3 ms
and Tokyo 9.9→9.2 ms. A mobile-sized desktop viewport at
`output/browser/racing-area-light-mobile-ab/` measured Arcade 9.5→9.0 ms and
Tokyo 9.0→9.5 ms. The mixed directions and short samples do not establish a
reliable performance improvement or regression, and an M4 Max viewport does
not measure a physical phone. The area lights did not increase scene draw calls
or rendered triangles in these fixed captures.

Two other tested ideas were removed. Dark log-value macro grouping at strength
4 changed only 1.18% of fixed POC pixels with little useful visual difference
(`output/browser/poc-shadow-value-regions-study/`). Analytic shop-to-road
bounce changed less than 1% of the race frame
(`output/browser/racing-source-light-ab/`). Neither remains in the shader or
world source. The final `npm run build`, six-camera renderer
(`output/browser/renderer-area-light-final/`), 73 steering checks
(`steering-area-light-final/`), exact fixed-state settings toggle
(`settings-area-light-final/`), and held-touch mobile-viewport driving
(`mobile-area-light-final/`) pass with no GL/page errors. Both driving modes
reach tick 67 with positive speed, no horizontal overflow, and ready local
reflection probes. Root inspected the final rendered frames; the new light is
real and spatially grounded, but the result still falls visibly short of the
cutscene's richly detailed painted-pixel rendering style.

### September 23 — fine-region contrast and geometry-fold ink in the live race

The race renderer now gives its already assigned fine pixel regions more of the
luminance variation measured in the shaded 3D image before adjacent regions
merge. `fineToneContrast: 2.25` multiplies the existing bounded log-value
residual; it changes neither the pixel labels nor the broad region's hue, and
adds no texture or draw pass. A second optional compose signal inks only shallow
concave folds inferred from the second difference of the resolved **hardware
scene depth**. Neighbor gaps above a few centimetres, sky, and distant folds
are rejected; projected planes have affine hardware depth, so the road does not
acquire fake contour lines. The race uses `curvatureInkStrength: 0.55`; the
same shared PixelClusterPass defaults the new controls to neutral for other
uses. A synthetic GPU fixture at `output/browser/pixel-curvature-synthetic/`
changed no pixels on flat or sloped planes or a 2 m occlusion step, changed 64
pixels along a 2 cm concave fold, restored exactly off/on/off, and reported
GL0/errors empty.

The fixed native Arcade/Tokyo A/B at
`output/browser/racing-combined-style-ab/` compares old pixel grouping against
the selected combination. At 960×600, the selected finish changes 61,547
Arcade pixels (10.7%) and 77,192 Tokyo pixels (13.4%) by a >6 summed-RGB
threshold, with exact off/on/off restoration and no WebGL/browser errors.
Inspected captures have more small light/value planes, clearer car rear and
shopfront folds, and slightly less flat lit pavement. The stronger 3× value
contrast plus 0.8 ink made the sky and outlines too coarse and was not adopted.
These are visible but **incremental** gains; central road, car body, and
architecture remain far less richly painted than the garage cutscene.

A candidate preserving fine-region *RGB* rather than luminance alone was
synthetically correct, but at full strength changed only 0.6% of Arcade and
0.8% of Tokyo frame pixels above the same threshold. Visual improvement was
negligible for roughly 12.4 MiB extra RGBA16F target storage at 1080p; it was
removed and the R16F target restored. Increasing existing scanned road normal
amplitude to 2–3 revealed more physically lit aggregate but left the core
style gap and was not adopted as a texture-led substitute for rendering work.
The study captures remain in `output/browser/racing-fine-chroma-ab/` and
`racing-road-normal-ab/`.

The new shop RectAreaLights also received a temporal handoff. A ranked shop
fixture no longer teleports an emitting source to another storefront: each of
two fixed slots fades out over 0.10 s, relocates at zero intensity, then fades
in. A deterministic Tokyo drive through 181 frames/450 m observed 43 slot
reassignments but no >3 m move while a slot emitted across consecutive frames,
with GL0/errors empty. Fixed-state source-light A/B still restores exactly;
no additional scene draws or triangles were introduced. Evidence is at
`output/browser/racing-shop-light-temporal/`.

Final checks: `npm run build`, six actual 3D cameras at
`output/browser/renderer-region-contrast-final/`, 73 Arcade/Tokyo steering
checks at `steering-region-contrast-final/`, exact Pixel Finish toggle at
`settings-region-contrast-final/`, and held-touch 390×844 driving at
`mobile-region-contrast-final/` pass. Both mobile-sized desktop runs reach tick
67 with positive speed, local reflections ready, no horizontal overflow, and
GL/page errors empty. Short synchronous A/B GPU timings at
`racing-combined-style-timed/` and `racing-combined-style-mobile-timed/` have
large outliers and mixed medians; they do not establish physical-phone frame
rate or a stable performance delta. Root inspected the final images against
`public/assets/story/angles/garage-wide-v2.png`: the live 3D rendering style
still **does not match** the densely authored cutscene painting. The remaining
gap is chiefly source-scene material/geometry/light detail, not an absent
pixel filter. The user-visible goal remains active.

A final controlled road-BRDF trial varied existing dampness at fixed native
states (`output/browser/racing-road-wetness-ab/`). It changed many Arcade pixels
and introduced broad violet reflection patches, but inspection found a smoother,
wetter road rather than the cutscene's dense painted detail; Tokyo changed less.
The game continues to drive wetness from actual weather, not from a style knob.

### September 23 — upstream region contrast and procedural race sky

The live Pixel Finish now strengthens **render-derived light variation before
pixel-region assignment**, rather than trying to add marks to a finished
image. A depth-plane-gated eight-neighbor pass measures local log luminance at
six-pixel offsets, caps the deviation to 0.55 stops, and applies a bounded
hue-preserving gain. The region pass then computes its structure field,
assignments, means and adjacency merges from that result. The selected strength
is 2. This currently uses the **tone-mapped display image**, not raw HDR; the
research's HDR approach would require a separately validated composer change.
It uses no authored pixel texture or random screen marks. At 1080p the optional
RGBA16F intermediate is about 16 MiB, plus a full-resolution draw, so a
physical-phone GPU budget remains unqualified.

The synthetic WebGL fixture at
`output/browser/pixel-pre-region-contrast-synthetic/` distinguishes grouping
from a mere contrast filter: 1,753 label pixels change on low-contrast actual
shading, while flat, planar-slope, concave-fold and occlusion-step fixtures keep
their labels and do not acquire material-scale marks or a silhouette halo.
Strength 0→3→0 restores exactly; GL0 and browser errors are empty. On fixed
actual Arcade/Tokyo states, strength 0→2 changes 220,477/272,615 frame pixels
by the >6 summed-RGB criterion and 2→0 restores exactly
(`output/browser/racing-pre-region-ab/`). Root inspected desktop and 390×844
viewport captures. The road and architecture show more connected small value
regions, while the cars still lack the cutscene's much denser painted panels.
At 1920×1080, the same selected A/B changes 778,374/965,395 Arcade/Tokyo
pixels, restores exactly and has no browser errors
(`output/browser/racing-pre-region-wide-ab/`); root inspected both frames.
Synchronous desktop timing had large outliers; mobile-sized desktop medians
were 18.8→20.0 ms Arcade and 18.6→19.0 ms Tokyo in one fixed-scene run. These
are not physical-phone measurements.

Gameplay previously displayed the low-intensity HDR background but never drew
the existing direction-anchored procedural cloud shader used in the garage POC.
The live race now draws that shader as the **visible** sky before region
grouping, while retaining the HDR environment for car lighting and excluding
the sky mesh from local cube-camera reflection probes via camera layers. Its
source color is balanced for Arcade dusk and tied to Tokyo's chapter daylight,
so Tokyo starts dark rather than showing a full-bright dusk at midnight. The
first bright-blue trial was rejected. Fixed sky off→on→off captures at
`output/browser/racing-painted-sky-final-ab/` changed 194,253 Arcade and
139,712 Tokyo pixels, restored exactly, and had GL0/errors empty. This source
shader creates cloud silhouettes and painted light/dark regions in world-ray
space; it does not project a cutscene image or overlay a texture on gameplay.

A half-station streetlamp stagger moved light across the road but made some
fixed positions brighter and others darker, so it was reverted
(`output/browser/racing-lamp-stagger-ab/`). A car-only physically derived light
band shader altered just 2.3%/5.6% of full Arcade/Tokyo frames at its moderate
setting and was visually negligible at racing distance; it was also removed
(`output/browser/racing-car-enamel-ab/`). No rejected source hooks remain.

Final selected-build checks pass: `npm run build`, six actual 3D cameras
(`output/browser/renderer-pixel-sky-final/`), 73 ArrowLeft/ArrowRight steering
checks (`steering-pixel-sky-final/`), exact Pixel Finish toggle
(`settings-pixel-sky-final/`), and held-touch driving at a 390×844 desktop
viewport (`mobile-pixel-sky-final/`). Both modes reach tick 67 with positive
speed, no horizontal overflow, ready local reflections and no GL/page errors.
The M4 Max viewport timings have outliers and do not certify a phone frame rate.
The live preview responds at `http://127.0.0.1:5173/?picture=pixel#/`.

Visual inspection against `public/assets/story/angles/garage-wide-v2.png` and
`public/assets/story/angles/harbor-wide-v2.png` still does **not** establish a
cutscene match. The shader now truly groups more pixels from lit 3D surfaces,
and the sky has source-painted regions, but the racing cars, road and buildings
are much less richly authored than those illustrations. The remaining work is
source-scene material and geometry detail plus real-device performance and
temporal review; do not present the completed renderer checks as artistic
acceptance. The style goal remains active.
