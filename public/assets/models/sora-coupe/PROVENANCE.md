# SORA club GT asset provenance

This is an independent adaptation of the official **CarConcept** glTF sample,
created by **Eric Chadwick for Darmstadt Graphics Group GmbH**, copyright 2024,
under **CC BY 4.0**. The original describes its starting point as a public-domain
concept car by Unity Fan. No Velocity Loop model, code or derivative geometry
is used in this adaptation.

## Primary source

- [Original model, author credits, material documentation and license](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/723ffc6706725b618b8c14ceb82e3e6904b08a76/Models/CarConcept)
- [Original downloadable GLB](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/723ffc6706725b618b8c14ceb82e3e6904b08a76/Models/CarConcept/glTF-Binary/CarConcept.glb)
- Repository commit: `723ffc6706725b618b8c14ceb82e3e6904b08a76`
- Original GLB: 11,778,688 bytes
- Original SHA-256: `c272098089d78c5cd9fd9f24ff50ee8acf8d932c55f2d55fc10adb6c8998966b`
- Original geometry: 213,347 triangles; four independently pivoted wheels
- The development checkout retains the original at `tmp/fidelity/car-concept/CarConcept.original.glb`.

## Shipped source preparation

`prepare-source.py` reads the checksum-verified original. It removes the
`Khronos_C`, `Tireside_C` and `Tireside_N` image resources, their associated
texture/material references, and the source license plate and steering emblem
mesh assignments. It rebuilds the GLB buffers without those image bytes. It does
not repaint or synthesize source texture pixels. Material variants and retained
ambient-occlusion, mechanical, leather, dashboard, metallic-flake paint, brake
disc and tire-tread maps remain available.

Run from the repository root:

```sh
python3 public/assets/models/sora-coupe/prepare-source.py
```

- Prepared GLB: `sora-coupe.glb`, 11,270,984 bytes
- Prepared SHA-256: `1ebfe63237c2fe70eba6da87242f31c06f4e904026e136958c99ad7105f50d16`
- Removed source logo resource indices: 3, 10 and 11

## Runtime adaptation

`src/game/three/asset-car.ts` prepares this GLB once. It corrects the source
front wheels' thirty-degree showroom steering pose, bakes world transforms,
normalizes the metal body to 2.02 m width and 4.3 m overall length, places the
wheels on ground zero, and aligns the front with +Z. Mirrors extend beyond the
metal body. Geometry is merged by material within the body and each independent
wheel. Brake calipers steer with the front axle but do not spin with the rims.

The eight returned cars share geometry and textures while owning independent
paint, trim, light and opacity material instances. Source AO, tread and material
maps are retained. Glazing uses conventional transparent physical materials to
avoid a separate full-scene transmission render. The supplied exact SORA flag
is projected onto both curved door surfaces. Brake lights, wheel spin, steering,
a modest optional chin lip and boost exhaust respond to the existing CarModel
interface. Camera-corridor fading uses common screen-door coverage across all
materials, retaining depth for the kept pixels.

The fully detailed runtime car contains approximately 213,576 triangles,
including projected badges and optional effects; a normal visible car submits
41 car draw calls in the isolated reference scene (42 including the ground).
The test confirmed eight cars, shared geometry, independent repaintable
materials, four animated wheel pivots, and no browser errors in Chromium/Metal.
The implementation retains the source detail rather than applying an automatic
polygon reduction. Further LOD work can retain the same body and reduce hidden
or distant detail separately.

This concept GT is a professional-geometry quality checkpoint. Its silhouette
is more modern than the final requested 1980s Japanese coupe; it is not claimed
to be an AE86 or a completed period-correct vehicle art replacement.
