# Broadleaf tree source and runtime LODs

Source: [Tree Small 02](https://polyhaven.com/a/tree_small_02), authored by Rico Cilliers. This model and its textures are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) under the [Poly Haven asset license](https://polyhaven.com/license). The official API metadata is retained in `source/source-info.json`; the download manifest is `source/source-manifest.json`.

The artist identifies the species as *Burkea africana* (wild syringa). The game uses it as generic broadleaf scenery; it is not represented as a botanically verified Japanese tree. `createMatureTree` describes the game's wider crown and larger scale relative to its earlier pine sapling asset, not a different source species or an authored age classification.

## Original files

The official `gltf.2k.gltf` download and all ten dependencies are preserved byte for byte in `source/` (115,328,490 bytes). The separate, original 2K leaf alpha PNG (636,661 bytes) comes from the same official manifest's `blend.2k.blend.include` entry. Every original file's byte length and MD5 were checked against the manifest on 2026-09-13. `verified-files.json` records these checks plus SHA-256 hashes of both originals and derived runtime files.

Runtime URLs are local game assets. No calls to Poly Haven are required while playing. The original source geometry is retained for rebuilding and is not fetched by the renderer.

## Geometry changes

`prepare-source.mjs` reproducibly derives three glTF geometry levels using the installed `meshoptimizer` 1.0.1 simplifier. It weights normals and UVs, keeps original material assignments and texture pixels, and compacts unused vertices. It does not bake the tree to a billboard. Run from the repository root:

```sh
node public/assets/models/roadside/mature-tree/prepare-source.mjs
```

| Level | Triangles | Selection distance | Hysteresis |
| --- | ---: | ---: | ---: |
| 0 | 489,273 | 0 m | 12% |
| 1 | 189,142 | 32 m | 12% |
| 2 | 71,029 | 85 m | 12% |
| 3 | 9,844 | 150 m | 12% |

Per-material source counts and simplification error estimates are in `lod-report.json`. The 2,062,487 source triangles are reduced by geometry simplification, with more detail retained on trunk/branches. The far level also permits pruning small disconnected components. Runtime scales the source to 8 m high and a maximum horizontal crown span of 7 m; this is a nonuniform adaptation. The hazard factory applies 0.78 uniform scale (6.24 m high). A deterministic root-local rotation varies repetition. Clones share all immutable geometry, materials and textures.

## Material correction

The source glTF declares leaf `BLEND` while supplying an opaque JPEG base color. The runtime restores the author's separate leaf alpha map, uses a 0.4 cutout threshold, and enables depth writes. This preserves leaf boundaries without sorting opaque leaves as transparent surfaces or drawing both sides in separate transparency passes. The original base color, normal and packed roughness/metalness maps remain intact. Custom depth and distance materials use the exact same alpha map and cutoff, and survive clone construction. The alpha image is linear and unflipped to match glTF UVs. All source raster bytes are unmodified.

## Validation

The browser fixture at `tmp/fidelity/scenery-review.html` loads the actual glTF files and renders them as 3D meshes. `tmp/fidelity/scenery-qa.mjs` checks finite vertex attributes, shared clone geometry/materials, matching color/shadow cutouts, dimensions and LOD coverage. Evidence is written to `output/browser/scenery-review/`. Full near and far crown screenshots are inspected unfiltered. The far crown retains its branch silhouette but loses small leaf clusters, so it is reserved for distant scenery; it is not used as the close-up model. In a fixed 512 px perspective silhouette test, middle LOD covered 2,160 pixels versus 2,360 for near LOD at 32 m; far LOD covered 273 pixels versus 335 for near LOD at 85 m. This quantifies some crown thinning (8.5% / 18.5% coverage reduction); it does not imply pixel-identical LOD transitions. Both full-size source and distant LOD renders were inspected. Browser checks and `npx tsc --noEmit` passed on 2026-09-13 with no resource or WebGL console errors.

## Distant leaf clusters

`prepare-foliage-lod.mjs` adds the fourth level independently. The original three glTF and binary files remain byte-identical to their pre-cluster SHA-256 hashes. Rebuild only this additional distant level with:

```sh
node public/assets/models/roadside/mature-tree/prepare-foliage-lod.mjs
```

The script identifies 30,250 connected leaf patches in the original source. It fits each patch's three-dimensional position to its original UV coordinates, then retains a broad representative patch in each occupied 12 cm spatial cell. The resulting 2,870 quadrilateral patches remain distributed throughout the original crown, with source-derived orientations and original atlas/alpha coordinates. They do not rotate toward the camera and do not form a whole-tree billboard. Parallax and shadow coverage come from the three-dimensional crown.

Local patch expansion of 34.5% compensates for the area lost during spatial selection. Branches and trunk remain separate real geometry: 3,124 branch triangles, 980 trunk triangles and 5,740 leaf triangles, or 9,844 total. The renderer shares the same leaf cutout and physical materials across all levels. It reuses the near tree's normalization transform so patch expansion cannot accidentally shrink the entire distant crown. Distant bounds are approximately 4.839 × 8.056 × 7.041 m; close bounds and geometry are unchanged.

### Measured coverage and cost

`output/browser/scenery-review/cluster-final-coverage.json` compares the exact generated distant file with near geometry at 85, 160 and 250 m from four azimuths. The 1,024-square test target uses 4× MSAA like the scene. Summed resolved coverage averages 99.56% of the near source, with a 94.92–104.73% range. Fine leaf pixels differ, but at most 0.21% of combined coverage lies outside a one-pixel neighborhood of the other image; none lies outside two pixels. This is a measured spatial tolerance, not pixel-identical geometry. At the actual 150 m-and-beyond operating distances, at most 0.12% lies outside one pixel.

`tree-distance-comparison.png` renders original PBR materials at the three distances and enlarges the same pixels three times for inspection. The distant patches retain the branch/crown outline. Their flatter normals produce somewhat darker local leaf lighting, so this representation is restricted to distant views; close foliage retains the detailed model.

A controlled Metal test on Apple M4 Max toggles only the new distant selection within the same frozen race scene. At 1,821 × 1,138 output pixels, submitted triangles fall from 30,094,082 to 25,260,467; synchronous one-pixel-readback frame medians fall from 20.9 to 19.8 ms. A separate live sample recorded 16.7 ms median and 16.8 ms p95 over 3.5 seconds. These are local measurements, not guarantees for every device or scene. Exact results: `output/browser/scenery-review/performance-distant-lod.json`.

The complete factory checks still pass: finite attributes, shared clones, matching color/shadow alpha, and original near-file hashes. Three updates each LOD's visibility before the shadow pass, so all four levels are not rendered simultaneously.
