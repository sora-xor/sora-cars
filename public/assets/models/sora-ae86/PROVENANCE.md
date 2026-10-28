# Detailed period coupe: Toyota AE86 Sprinter Trueno Zenki

**Model and textures by Martin Trafas. Licensed under CC BY 4.0.**
Adapted for SORA CARS with independent liveries, physical paint and glazing,
projected SORA flags, race animation and contact shadows. No endorsement by the
artist, Toyota or the redistribution host is implied.

## Primary authorship and license

- [Martin Trafas's original model](https://sketchfab.com/3d-models/toyota-ae86-sprinter-trueno-zenki-a5737bf3cc9b4179a6e5ebe173ff70d9)
- [Primary model metadata](https://api.sketchfab.com/v3/models/a5737bf3cc9b4179a6e5ebe173ff70d9)
- [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/)
- [Retained legal terms](CC-BY-4.0.txt)

The primary metadata was verified on 2026-09-13. It identifies Martin Trafas
(`TinoD2`), states that commercial use is allowed with attribution, and reports
706,225 triangles. The author's description notes that the interior is modeled
but the inside surfaces of the doors are incomplete; SORA CARS keeps the doors
closed.

## Public licensed redistribution

The binary was obtained from the public **YAWSOKU** demonstration, whose
[homepage credits](https://www.yawsoku.com/) explicitly attribute its AE86 to
Martin Trafas under CC BY 4.0. No account, authentication bypass, paid asset or
download-restricted endpoint was used.

- [Public redistributed GLB](https://www.yawsoku.com/models/hachiroku/car.glb)
- Downloaded: 2026-09-13
- Bytes: 11,494,848
- SHA-256: `cc67905d1d492bf0d2eb8fc632f9baa812449770801a7eea4f7a3b50d02057e0`
- Shipped unchanged as `ae86.glb`
- Generator: glTF-Transform 4.4.1
- Geometry: 706,212 triangles, 37 mesh resources
- Textures: 32 embedded WebP images
- Compression: Draco geometry and WebP textures

The GLB's embedded `asset.extras` independently identify its author, CC BY 4.0
license, exact primary Sketchfab URL and original model title. Its historical
author-profile URL uses `Bexxie`; the live primary API identifies the same named
artist as `TinoD2`. The small triangle difference is retained transparently as a
redistributed representation, rather than claimed to be the untouched original
download. The redistribution adds wheel pivot nodes. No YAWSOKU application
code was copied into SORA CARS.

## Independent runtime adaptation

`src/game/three/asset-car.ts` loads the licensed geometry with a local Draco
decoder, bakes authored transforms and retains indexed vertex sharing. It
normalizes overall source length to 4.18 m, keeps original proportions, places
the tires on ground zero and aligns the front with +Z. Mirrored caliper winding
is corrected after transform baking. The original flat shadow surface is
omitted in favor of real contact shading and directional shadows.

Four independent wheel groups steer and spin from existing race inputs. Brake
calipers steer with their respective front axle and remain fixed relative to
the suspension as the tire rotates. The raised pop-up headlights, glass,
interior, wheel tread and lamp lens details remain actual 3D source geometry.

Solid enamel uses a dielectric clear coat rather than metallic chrome. Source
interior and tire texture maps remain intact. Rear and front lamp materials are
separated so brake response does not alter the headlights. Ordinary transparent
glazing avoids a second full-scene transmission render. Body panels keep the
original two-tone arrangement and the exact supplied SORA flag is projected
onto both doors. All eight cars share geometry and texture resources while
owning their paint, light and fade state.

The post-process pixel finish is separate from this asset. Disabling it exposes
the fully detailed model and physical materials at display resolution.

The vehicle geometry has 706,467 triangles and 425,061 indexed vertices,
including decals and optional boost/aero geometry. Its isolated opaque render
uses 40 draw calls. The source's 180-triangle opaque `Shadow` part is preserved:
inspection showed it is dimensional grille/intake backing at 0.43–0.84 m above
the tires, not a flat ground decal. A separately authored CC0 seated driver is
documented in `../driver/PROVENANCE.md` and is additional to these vehicle counts.
`node scripts/test-vehicle-asset.mjs` verifies all eight
independent liveries, shared geometry, ground-zero tires, four spinning wheels,
front steering, fixed brake calipers, separate head/brake light response and
fade behavior in actual Chromium WebGL. Evidence is written to
`output/browser/vehicle-asset/`; the 2026-09-13 run had no browser errors.

## Shadow optimization

The complete beauty mesh remains unchanged at every distance. A separate
precomputed index pack removes geometry finer than the directional shadow map
can resolve. Each material and animated wheel retains its original vertices;
only shadow-depth draws temporarily use the alternate triangle indices, after
which the full original indices are restored immediately.

`prepare-shadow-indices.mjs` reproducibly builds the pack using Three.js r186's
bundled meshoptimizer 1.1. It requests an 8% triangle target with a 0.003 m
absolute simplifier error limit. It retains additional geometry where that
error limit prevents reaching the target. The tool runs against local Vite and
does not run in the shipped game. No source geometry or textures are overwritten.

- Pack: `shadow-indices.bin` and `shadow-indices.json`
- Binary size: 657,096 bytes
- Binary SHA-256: `a9a3a045d28051045e66a365280b2e605df4b7ad4e1abd102e824af7ab614faa`
- Source shadow triangles per car: 669,358
- Optimized shadow triangles per car: 54,758
- Materials/animated parts: 33

The restored 180-triangle grille/intake insert uses its full source indices in
both passes; it is outside this older pack's 33 records. Total vehicle shadow
submission is therefore 54,938 triangles with the optimization enabled.

`node scripts/test-vehicle-shadow.mjs` compares the production optimization
against full source shadows at identical camera, lighting and race state. In
the inspected 1821×1138 Chromium/Metal racing frame, it removed 4,916,800 shadow
triangles and measured median synchronized frame time of 18.5 ms versus 17.2 ms.
There were 701 changed pixels out of 2,072,298; mean RGB channel difference was
0.000266 on a 0–255 scale, with maximum difference 6. With the shadow buffer
held constant, enabling/disabling the index callbacks produced exactly zero
beauty-pixel differences. These timings describe the measured desktop GPU and
are not a claim about physical phone performance.

The runtime checks pack version, source identity, geometry counts, record
bounds and simplifier error metadata. A missing or incompatible pack falls
back to the full source shadow geometry.

Attribution to retain with distributions:

> Toyota AE86 Sprinter Trueno Zenki — Martin Trafas, CC BY 4.0.
> Adapted for SORA CARS; materials, animation and SORA flag decals modified.

The supplied SORA flag is a separate project asset and is not relicensed here.

## Underbody ambient visibility

`ambient-visibility.png` is derived from the exact licensed source geometry, not
a generic painted shadow. `bake-ambient-visibility.py` uses official Blender's
CPU BVH to sample 256 cosine-weighted hemisphere directions at every texel of a
512×512 ground patch (5.0×7.6 metres). It includes all 669,538 opaque triangles,
including the physical grille backing, and excludes windows/lamp glazing. A
1.4 m local distance limit uses continuous distance falloff. White is fully
visible sky, black is fully occluded; this is linear data, not sRGB color.

The patch includes actual tire-contact occlusion, has exactly white borders,
and retains original source orientation and scale. Exact source/output hashes,
method, bounds, sampling and tire-contact measurements are recorded in
`ambient-visibility.json`. The derived data retains the car's CC BY 4.0
attribution. Rebuild with the official task-local Blender executable:

```sh
./tmp/fidelity/driver-tooling/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup \
  --python public/assets/models/sora-ae86/bake-ambient-visibility.py
```
