# Painted roadside props

Generated using the built-in image generation tool, using the existing garage and radio cutscene frames as style references. These are unmodified generated RGB PNG files with a bright green chroma-key exterior, intended for runtime material keying. They do not have an alpha channel. The tool produced opaque backgrounds even after an explicit transparency edit, so the final targeted edits requested a uniform `#00ff00` exterior. No offline or hand-painted image modification was applied.

## Shop — `public/assets/race-painted/shop-v1.png`

```text
Use case: stylized-concept
Asset type: production gameplay roadside sprite for SORA racing game, transparent PNG.
Input images: garage-wide-v2.png and radio-wide-v2.png are STYLE AND LIGHTING REFERENCES ONLY. Their visual richness, detailed 1986 Japan anime-cinema gouache painting, fine ink contours, textured materials, amber practical lights and indigo-magenta dusk palette must carry into this standalone new scenery asset.
Primary request: Paint one complete two-storey Japanese neighborhood workshop with an attached little cafe frontage as ONE connected building. Eye-level front view, with only a little of the right side visible, natural believable architecture. Weathered plaster and dark timber, tiled eaves, a modest awning, warm glowing windows, open workshop entrance with shelves and tools visible in shadow, old air-conditioner, drainpipes, cables attached to facade, potted vegetation attached at base and a bicycle leaning against wall. No people. The facade should be highly detailed and tactile, like it could come directly from the reference cutscene, with complex shadow masses and cinematic warm highlights. Subtle hand-painted paper/grain texture and finely drawn weathering. Tall rectangular overall silhouette with gently irregular roof and vegetation edges.
Composition: entire building visible including roof and bottom contact edge, centered with generous transparent margins; approximately 3:4 portrait canvas. Object only with NO ground rectangle or surrounding environment.
Lighting: deep blue-indigo twilight shadow, warm amber lamps and window interiors, restrained purple/magenta ambient rim highlights.
Background: genuine fully transparent alpha channel outside the whole object, including openings between leaves and bicycle spokes. NO checkerboard pattern baked in, NO white matte, NO landscape, NO sky, NO street.
Avoid: pixel art, retro low resolution, vector art, flat simple geometric shapes, low-poly 3D, cartoon icon style, chibi proportions, excessive neon, humans, logos, large text, watermark, floor rectangle, diorama plinth.
```

## Tree — `public/assets/race-painted/tree-v1.png`

```text
Use case: stylized-concept
Asset type: production gameplay roadside tree sprite for SORA racing game, transparent PNG.
Input images: garage-wide-v2.png and radio-wide-v2.png are STYLE AND LIGHTING REFERENCES ONLY. Match their detailed late-1980s Japanese anime cinema painted-background craft: fine ink and gouache, tactile organic surfaces, deep indigo shadows, amber and restrained magenta twilight edges.
Primary request: Paint ONE tall mature Japanese roadside broadleaf tree. Entire solitary tree from canopy top to exposed trunk roots. Natural asymmetric dense canopy with countless small individually grouped leaves, irregular airy holes among branches, convincing branching structure, textured aged bark, small roots at foot. Highly detailed, painterly but precise, rich dark greens and indigo-black shadow masses with tiny amber and purple-magenta dusk highlights. It should look like a carefully cut out tree from the cutscene backgrounds, not a cartoon icon.
Composition: single tree front facing, whole canopy and root base in frame with generous transparent margin; tall portrait canvas, canopy occupying upper three quarters and visible sturdy branching trunk in lower portion. No detached decorative objects.
Background: genuine fully transparent alpha channel outside tree and visible between branches/leaves. NO checkerboard pattern baked in, NO white or colored matte, NO sky, NO scenery, NO ground patch or landscape.
Avoid: pixel art, blocky pixels, vector shapes, simplistic blobs, low-poly 3D, photoreal camera photograph, exaggerated fantasy tree, oversaturated neon, other trees, humans, text, watermark, diorama base.
```

## Source references

- `public/assets/story/angles/garage-wide-v2.png`
- `public/assets/story/angles/radio-wide-v2.png`

## Production background edit prompts

### Shop

```text
Production game sprite background edit. Keep the entire detailed hand-painted building EXACTLY as shown: same fine ink lines, textures, lamps, indigo shadows, geometry, doors, plants, bicycle and framing. Replace ONLY every background checkerboard pixel with perfectly uniform solid pure chroma green RGB(0,255,0), hexadecimal #00ff00. Background must be a flat digital color with absolutely NO texture, lighting, shadows or gradient. Keep the building colors intact, no green spill light. All openings between peripheral leaves, bicycle spokes, cables, antenna must also reveal the same uniform #00ff00. Deliver RGB PNG with precisely green exterior, ready for a game engine to chroma key. Do not change or repaint the subject.
```

### Tree

```text
Production game sprite background edit. Keep the entire detailed hand-painted tree exactly as shown: same fine ink lines, organic leaves, bark textures, branching, roots, indigo shadows, warm amber and restrained purple highlights. Replace ONLY the white exterior and all white holes among branches/leaves with perfectly uniform solid pure chroma green RGB(0,255,0), hexadecimal #00ff00. Background must be a flat digital color with absolutely NO texture, lighting, shadows or gradient. Preserve the tree palette: its leaves remain dark forest green and indigo, with no bright neon green within the tree. No green spill light. All openings among leaves and branches reveal exactly the same #00ff00 exterior. Add a small 5% margin around every side so every leaf tip and root is fully visible, with no cropping. Deliver RGB PNG ready for a game engine to chroma key. Change only white background and framing margin; do not simplify or repaint subject.
```

## Generated source provenance

- Shop original: `/Users/takemiyamakoto/.codex/generated_images/01a095ee-aef9-7302-bc76-32fd067b3e1e/exec-147dc277-fe91-4f60-a236-f405494b7805.png`
- Shop final: `/Users/takemiyamakoto/.codex/generated_images/01a095ee-aef9-7302-bc76-32fd067b3e1e/exec-721b423d-66e0-4fe9-8cb7-12c9c78c1619.png`
- Tree original: `/Users/takemiyamakoto/.codex/generated_images/01a095ee-aef9-7302-bc76-32fd067b3e1e/exec-e01d991e-3ad5-4635-8fd9-88e11389e8af.png`
- Tree final: `/Users/takemiyamakoto/.codex/generated_images/01a095ee-aef9-7302-bc76-32fd067b3e1e/exec-185a9716-9689-489d-b6aa-d23dfa879396.png`

## Validation

- Shop: 1086 × 1448, RGB PNG, no alpha channel. Fine painted workshop/cafe detail, warm windows, organic plants, bicycle and complete roof are visible.
- Tree: 1024 × 1536, RGB PNG, no alpha channel. Dense detailed organic leaves, dark indigo/green shadows and amber/purple light; a few leaf tips approach the left/right edges.
- The green exterior is visually flat but the generated pixel values vary slightly, so runtime keying must tolerate variation. Dominant shop background is `(3, 250, 4)`; dominant tree background is `(3, 250, 5)`. Sampled corners range approximately R 17–27, G 241–244, B 13–20.
- A diagnostic threshold `g > 200 && g - r > 140 && g - b > 140` identifies approximately 30.66% of shop pixels and 45.12% of tree pixels as the green exterior. Material edge treatment should use a smooth threshold to preserve fine silhouettes.
