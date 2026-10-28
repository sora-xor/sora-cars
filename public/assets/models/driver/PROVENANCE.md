# Generic seated driver

One generic adult character authored for the normalized right-hand-drive AE86.
The mesh, hair, eyes, clothes and rig are real 3D assets. This character is not a
named cutscene actor. `src/game/three/driver.ts` supplies an independently posed
clone for each car; `asset-car.ts` shares its geometry/textures and gives its
materials the owning car's fade state.

## Primary sources and licenses

All upstream character data used here is CC0 1.0 Universal. MPFB's **program** is
GPLv3; it is task-local authoring software and is not bundled into the game.
The project-authored scripts call that software. See the official distinction
between [program, assets and exported output](https://github.com/makehumancommunity/mpfb2/blob/v2.0.17/LICENSE.md),
the [MakeHuman licensing explanation](https://static.makehumancommunity.org/about/license.html),
and the complete upstream asset license in `LICENSE-CC0.md`.

| Source | Version / evidence |
| --- | --- |
| [Official MPFB](https://github.com/makehumancommunity/mpfb2/tree/v2.0.17) | v2.0.17, commit `80919fa4682335c41847f761a4d79dcad4124732`; includes CC0 base mesh, phenotype targets and default 163-bone rig |
| [Official system asset pack](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) | Explicit CC0 pack; [official download mirror](https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip); 280,737,770 bytes; SHA256 `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107` |
| [Official poses pack](https://static.makehumancommunity.org/assets/assetpacks/poses01.html) | [CC0 archive](https://files2.makehumancommunity.org/asset_packs/poses01/poses01_cc0.zip); 1,207,533 bytes; SHA256 `67b1d14923adda85f371f81e1c529fcd058f975d0bf93848838e1a3860705b7d`; Sitting02 by Anrico is the initial pose import, then driving pose is authored anew |
| [Official Blender download](https://download.blender.org/release/Blender5.2/blender-5.2.1-macos-arm64.dmg) | Blender 5.2.1 LTS, arm64, build `9e2066aef7ef`; 346,264,899 bytes; SHA256 `6409e21de80994db5f4c4a34486b6fd43cea21085b912f7491c53e923acb65a3`; executable authoring tool only |

Selected system assets: `young_asian_male` skin; `male_casualsuit01` plain blue
button shirt and jeans; `shoes01` plain brown shoes; `short01` hair; `high-poly`
eyes; `eyebrow001`; `eyelashes01`. Their embedded headers identify the CC0 release
in September 2020 and rights holders Data Collection AB, Joel Palmius and Jonas
Hauquier. Original file checksums are in `source-files.json`; the exact selected
material/mesh/pose license headers are retained under
`authoring/source-license-headers/`.

No Chad, Character Creator, Reallusion, Mixamo or unverified reupload data is
included. No car geometry is included in this driver GLB; the separately licensed
AE86 was used only as a fitting reference.

## Authored result

- Stature normalized to 1.68 m; seated pelvis at car-local `[-0.3528, 0.424, 0.025]`.
- 27-degree torso recline, counter-rotated neck, independent articulated arms,
  finger curl, thumb opposition, and feet aimed toward the clutch/accelerator.
- Body helpers and clothing masks are baked; source skin and cloth surfaces are
  subdivided once. Hair cards retain their authored alpha, with cutoff 0.38.
- Skin and cloth retain 2048×2048 source images. Cloth/shoe normal maps and all
  alpha maps remain lossless PNG. Only opaque color maps use JPEG quality 95,
  4:4:4, at their original dimensions; measured error is in `optimization.json`.
- 144,406 triangles, seven materials, 163 joints; geometry is Draco encoded with
  16-bit positions, 12-bit normals, 14-bit UVs. Driver-factory clones share
  geometry, textures and materials while owning separate bones/skeletons. The
  car assembly then clones the seven materials per driver so each car's
  visibility fade remains independent; geometry and texture uploads stay shared.
- Seated pose is the exported bind pose; no body animation is included yet.
  Source skin supplies a detailed color texture, not a scanned skin normal map.

`geometry.json`, `optimization.json` and `authoring/seated-fit.json` record exact
geometry, output checksum, texture conversions and fitted joint positions.
Rebuild instructions are in `authoring/REBUILD.md`.
