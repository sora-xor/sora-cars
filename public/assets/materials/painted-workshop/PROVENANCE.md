# Painted workshop materials

## Concrete v1

`concrete-v1.png` was generated with the built-in image generation tool on 2026-09-13 for the isolated garage shader proof. The original 1254 × 1254 PNG was copied unchanged from `/Users/takemiyamakoto/.codex/generated_images/01a095d7-2e3f-76c0-be76-890e7c7ca671/exec-db61bc0b-72cd-47b4-8750-d7999387dfc8.png`. The exact generation prompt is in `concrete-v1-prompt.txt`; the request for 2048 × 2048 was not the returned resolution.

It depicts a flat gray concrete albedo swatch with aggregate chips, worn repairs and hairline cracks. It contains no scene, object, baked light pool or reflection. `workshop-concrete.ts` projects it in world metres onto the existing 3D floor, with four offset samples and continuous derivatives to blend source borders. Exact seamlessness is not assumed. `painted-floor.ts` supplies physical lighting, material response and authored-color-driven light grouping; final pixelation happens after scene rendering.

## Steel v1

Generated on 2026-09-13 with the built-in image generation tool for the isolated SORA CARS garage proof. The original generated file is retained under the thread's generated_images directory. SHA-256 is recorded alongside this file.

Requested a flat, evenly lit, seamless blue-charcoal aged enamel albedo swatch with muted rust chips and dense illustrated brush detail. It contains no scene geometry, cutscene image, perspective, text, logos or baked light source. The source PNG is copied unchanged into the project.

The custom material shader projects this texture onto actual 3D steel surfaces; geometry, lighting, shadows and reflections are rendered live. The texture's repeat boundaries are softened with a second offset sampling layer in the material shader; exact seamlessness is not assumed.
