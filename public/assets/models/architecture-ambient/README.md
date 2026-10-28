# Architectural ambient visibility

This pack derives from SORA CARS' authored procedural geometry in
`src/game/three/scenery.ts`: four neighborhood buildings and two apartment
blocks. It contains geometry and ambient visibility only. Existing material
textures and their separate provenance remain unchanged.

The CPU baker builds a BVH from each template's actual opaque source triangles.
At each sampled surface point, it casts 128 deterministic cosine-weighted rays
using a golden-angle sequence, offset 0.005 m along the normal, up to 4 m.
A hit contributes occlusion `max(0, 1 - (distance / 4)^2)`; stored visibility is
one minus mean occlusion. Glass never occludes. Emissive and transformed sign
meshes retain their original runtime geometry; opaque ones still participate
as occluders.

Longest-edge midpoint subdivision preserves source surfaces and interpolates
normal/UV attributes without renormalizing them. Broad triangles use a 0.55 m
edge limit. Only triangles with area below 0.06 m² **and** shortest altitude below
0.08 m use a 1.1 m limit, avoiding unnecessary density in narrow trim.
Matching position/normal/UV vertices are indexed together. Bounds and surface
area are checked against the source.

`geometry.bin` stores little-endian Float32 position, normal, UV and visibility
attributes plus Uint32 indices. `manifest.json` provides offsets, counts,
settings, hashes and diagnostic timings. Entries marked `baked: false` remain
unchanged at runtime. The runtime validates each replaced mesh's original
Float32/Uint32 source hash and the complete binary SHA-256 before applying it.
Visibility attenuates indirect illumination, composed with material scan AO;
the shader retains a 20% ambient floor. Direct lights and emissive output keep
their existing lighting calculation.

## Reference artifact

Generated with Blender 5.2.1 LTS, CPU, in 77.851 seconds: 63,064,704 rays,
51 replaced meshes and 619,908 baked triangles. The binary includes unchanged
mesh records too and is **27,031,860 bytes**.

| Template | Source triangles | Baked triangles |
| --- | ---: | ---: |
| detailed-neighborhood-0 | 38,852 | 86,560 |
| detailed-neighborhood-1 | 37,680 | 72,176 |
| detailed-neighborhood-2 | 49,768 | 102,976 |
| detailed-neighborhood-3 | 3,784 | 42,980 |
| detailed-apartment-0 | 12,316 | 115,916 |
| detailed-apartment-1 | 18,804 | 199,300 |

Source counts include all template meshes; baked counts include only replaced
meshes.

```text
Input JSON SHA-256:
b946fe1079899fc81b01764309b41d196dd7dd66fe2566c17372349db3ccf277
geometry.bin SHA-256:
84dc6acfe22072491cd8cbe8de69bcd888811e06cc8648107cf889380fcc6990
```

## Regenerate

Run from the repository root with dependencies installed and Blender 5.2.1 LTS
available at the path below, or substitute its executable path. Preserve the
exporter's signed-zero encoding: ordinary JSON serialization would change the
source's raw Float32 hashes.

```sh
node_modules/.bin/esbuild scripts/export-architecture-ambient.ts \
  --bundle --platform=node --format=esm --packages=external \
  '--define:import.meta.env.BASE_URL="/"' \
  --outfile=tmp/fidelity/export-architecture-ambient.mjs
node tmp/fidelity/export-architecture-ambient.mjs \
  tmp/fidelity/architecture-ambient-source.json
tmp/fidelity/driver-tooling/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python scripts/bake-architecture-ambient.py -- \
  --input tmp/fidelity/architecture-ambient-source.json \
  --output-dir public/assets/models/architecture-ambient \
  --max-edge 0.55 --thin-max-edge 1.1 --samples 128 --distance 4 --offset 0.005
```

`--python-exit-code 1` makes Python failures fail the shell command. Any source
geometry change requires a fresh export and bake. Sampling is deterministic;
manifest timings vary, and cross-version Blender floating-point results are
not promised to be byte-identical. Update this reference section after a
changed bake and inspect the resulting gameplay shading.
