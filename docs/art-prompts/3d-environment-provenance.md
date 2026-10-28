# Downloaded PBR roadside assets

Acquired 2026-09-12 directly from Poly Haven's public asset API and official `dl.polyhaven.org` download host. No generated raster cutouts or billboard replacement assets are used by `src/game/three/asset-scenery.ts`.

## License and authors

All three assets are CC0 1.0. Poly Haven's [asset license](https://polyhaven.com/license) states: “Our assets are all licensed as CC0”. Commercial use, modification and redistribution are allowed; attribution is appreciated but not required. The underlying dedication is [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

| Asset | Author credit from official metadata | Official asset page | Local directory |
| --- | --- | --- | --- |
| Pine Sapling Small | Rob Tuytel — photography; Rico Cilliers — modeling | https://polyhaven.com/a/pine_sapling_small | `public/assets/models/roadside/pine/` |
| Rollershutter Door | MP — all work | https://polyhaven.com/a/rollershutter_door | `public/assets/models/roadside/shutter/` |
| Modular Pipes | Kuutti Siitonen — all work | https://polyhaven.com/a/modular_pipes | `public/assets/models/roadside/pipes/` |

Each directory contains `source-info.json` with the original author metadata and `source-manifest.json` with the original file manifest. These were requested from `https://api.polyhaven.com/info/{asset_id}` and `https://api.polyhaven.com/files/{asset_id}` with identifying User-Agent `SORA-Cars-asset-research/1.0`. The [public API terms](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md) permit free commercial access. Runtime loading uses the files hosted with the game, not the live Poly Haven API.

## Exact source downloads

The downloaded glTF is the manifest entry `gltf.2k.gltf`. Every entry in its `include` object was downloaded to the relative filename supplied by that manifest, including `.bin` data and all textures. The glTF and dependency bytes are unchanged. Every download's byte count and MD5 matched the official manifest before being saved.

| Asset | Direct glTF | Complete glTF/dependency bytes | Files |
| --- | --- | ---: | ---: |
| Pine | https://dl.polyhaven.org/file/ph-assets/Models/gltf/2k/pine_sapling_small/pine_sapling_small_2k.gltf | 32,151,039 | 8 |
| Shutter | https://dl.polyhaven.org/file/ph-assets/Models/gltf/2k/rollershutter_door/rollershutter_door_2k.gltf | 8,665,518 | 6 |
| Pipes | https://dl.polyhaven.org/file/ph-assets/Models/gltf/2k/modular_pipes/modular_pipes_2k.gltf | 18,486,725 | 8 |

Total: 59,303,282 bytes across 22 original glTF/dependency files, plus the metadata manifests. Binary geometry URLs legitimately use the source `/gltf/8k/` path even for the 2K-texture glTF; this is exactly what the official manifests specify.

## Current runtime assets (2026-09-13)

The original pine files above remain retained source history. The racing scene now uses an authored broadleaf crown at four geometry LODs instead. See the complete [broadleaf source record](../../public/assets/models/roadside/mature-tree/PROVENANCE.md) and [roof material source record](../../public/assets/materials/grey_roof_tiles_02/PROVENANCE.md). All current and retained imported roadside assets are CC0.

| Added source | Artist | Official page | Local directory |
| --- | --- | --- | --- |
| Tree Small 02 | Rico Cilliers | https://polyhaven.com/a/tree_small_02 | `public/assets/models/roadside/mature-tree/` |
| Grey Roof Tiles 02 | Rob Tuytel | https://polyhaven.com/a/grey_roof_tiles_02 | `public/assets/materials/grey_roof_tiles_02/` |

`loadDetailedScenery()` loads the four local broadleaf LOD files, shutter and pipe catalogs once and returns synchronous clone factories. Clones share source geometry, materials, textures and shadow materials. Texture anisotropy is 8. No toon conversion, color quantization or painted image overlay is applied to the assets.

- `createMatureTree(seed)` returns an 8 m tree with a maximum 7 m crown span. The detailed geometry levels contain 489,273 / 189,142 / 71,029 triangles and switch at 32 / 85 m. A fourth level at 150 m uses 9,844 triangles: individual, fixed 3D leaf clusters with the original UV/alpha maps, plus retained branch/trunk geometry. All transitions use 12% hysteresis. The near files are unchanged. `createHazardTree(seed)` uses the same species and materials at 0.78 scale. `createPine()` is a compatibility alias to this broadleaf factory, not the retired pine catalog.
- The original tree glTF uses `BLEND` with an opaque JPEG base color. Runtime uses the original author's separate leaf alpha PNG with a 0.4 cutout threshold and enabled depth writes. Matching depth/distance shadow materials preserve leaf boundaries. Source color/normal/roughness data remains unchanged.
- `createShutter()` uses the clean `rollershutter_door` source node, excluding the alternative graffiti door. It is adapted to 3 × 3 × 0.375 m with bottom-center origin and rotated from +Z to the game's -Z front. A subdued steel tint and roughness retain its source relief without an overbright white panel.
- `createPipes()` assembles a metal service riser, valve and return, plus a thinner PVC drain and wall brackets. It selects authored modules, removes their catalog presentation translations, stretches only straight lengths, and merges geometry into two source-material meshes. Final dimensions are approximately 1.005 × 6 × 0.382 m. Fittings face -Z.

## Architectural meshes

`src/game/three/scenery.ts` builds four Japanese neighborhood-inspired house/workshop variants, plus two apartment variants. These are original programmatic meshes, not downloaded photogrammetry buildings. They use scanned plaster, cedar, stone and roof surfaces, meter-scale UVs, two genuine window openings on both house side elevations, external side drains, recessed windows with separate glazing and room backs, shop/garage openings, balconies, ledges, compressors and roof services. Selected windows have low-intensity warm interiors; small practical lamp housings are separate emissive geometry.

Houses publish per-variant mount coordinates for the shutter, pipe assembly and flag sign. A shutter scales vertically into a 3.04 m clear garage bay; its front sits just ahead of the wall plane while its body is recessed inside the jambs. Root placement must use this metadata instead of the dimensions of an earlier house model.

Apartment window openings are clear of the opaque building core, so glass reveals the room backing rather than a plaster wall coincident with the glazing. Shared template clones reuse geometry/materials.

## Validation evidence

The actual local glTFs and architectural factories are rendered without pixelation by `tmp/fidelity/scenery-review.html`, with capture and checks in `tmp/fidelity/scenery-detail.mjs` and `tmp/fidelity/scenery-qa.mjs`. Output lives in `output/browser/scenery-review/` (catalog, close house/apartment, all tree LODs, and `qa.json`). Checks include finite tree attributes, clone sharing, color/shadow cutout identity, tree dimensions, shutter mounting and raycasts into apartment window recesses.

The detailed tree near level uses three main-pass material draws. Correct leaf cutout rendering removes one redundant transparent draw and reduces near-tree triangle submissions including the shadow pass from 1,402,828 to 978,548 in the isolated fixture. The far crown loses small foliage clusters and is reserved for distant use. Asset-factory inspection does not by itself establish final race-world lighting, placement, frame cadence or the user's overall visual acceptance.

The additional distant crown was inspected with original materials at 85 / 160 / 250 m. It preserves mean MSAA coverage within 0.44% of near geometry across four azimuths while removing 86% of the preceding far model's triangles. Fine leaf shading differs because distant patches have flatter normals. The full method, exact-file hashes, coverage bounds and controlled performance results are recorded in the [tree provenance](../../public/assets/models/roadside/mature-tree/PROVENANCE.md).
