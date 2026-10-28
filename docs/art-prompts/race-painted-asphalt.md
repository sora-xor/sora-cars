# Painted asphalt texture

- Asset: `public/assets/race-painted/asphalt-v1.png`
- Dimensions: 1254 × 1254 pixels (requested 1024 square; preserved native generated dimensions)
- Mode: built-in `image_gen.imagegen`; no CLI fallback.
- Date: 2026-09-12
- Reference: `public/assets/story/angles/garage-wide-v2.png`, used for material and painted style only.
- Original output: `/Users/takemiyamakoto/.codex/generated_images/01a095ee-65ba-7d73-a2e2-2163a8eb3783/exec-1eb5b4de-291d-427b-8a74-d2755516f1e7.png`
- Processing: exact PNG copy; no resizing, retouching, filtering, compositing, or raster edits.
- Intended usage: repeat with world-anchored UVs beneath road markings; blend gently with dark road shading to retain legibility.
- Visual inspection: straight-down dark blue-grey aggregate, fine cracks and worn patches, small amber/violet glints, no road paint, objects, scenery, or text. Prompt requested seamless edges; final seam behavior should be inspected in the runtime road projection.

## Generation prompt

```text
Use case: stylized-concept
Asset type: production seamless repeating asphalt road surface texture for a cinematic Japanese racing game.
Input image: garage-wide-v2.png is a STYLE REFERENCE ONLY for the richly textured cutscene paint and damp pavement material; do not reproduce its scene, viewpoint, objects or lighting composition.
Primary request: One square 1024x1024 seamless tileable texture of dark blue-grey damp granular tarmac, in the finely detailed hand-painted material style of the reference. View is perfectly orthographic straight down onto only an asphalt surface, absolutely flat and undistorted. Fine small-scale asphalt aggregate grains, subtle naturally worn patches, a few delicate understated hairline cracks, muted dark damp roughness. Tiny restrained warm amber and violet glints scattered evenly within the material.
Style/medium: Richly observed, subtle mature anime background-paint texture, fine gouache detail with clean resolution. Continuous real granular material, not pixel art and not simple noise. Grounded natural tarmac paint.
Composition: Entire square filled edge to edge with a stationary ground texture, even scale and lighting everywhere, balanced nondirectional microdetail and small quiet variations. Every edge wraps seamlessly to its opposite edge; no visible tile boundary or large motif that reveals repetition. This will be repeated in perspective in a live racing game.
Color palette: Very restrained low contrast charcoal blue-grey, slightly indigo shadows, tiny faint violet and amber reflected light flecks. Keep the whole texture dark and quiet so projected painted road markings and cars remain readable.
Constraints: No lane lines, painted marks, text, letters, numbers, logos, objects, road shoulders, sidewalks, tire marks, cars, people, scenery, horizon, perspective, shadows of objects, directional spotlight, vignette, border, large cracks, large oily puddles, mirror reflections or any giant shapes. No high-contrast patches, white speckles, neon, pixelation or chunky repeating pattern. Texture only.
```
