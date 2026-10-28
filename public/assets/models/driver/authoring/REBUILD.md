# Rebuild the isolated driver

The build is reproducible from the primary upstream archives and these authoring
scripts. It does not require any globally installed Blender application, an
account, paid content or a proprietary character tool.

1. From the repository root, create `tmp/fidelity/driver-tooling` and its
   `downloads`, `extensions`, `blender-config` and `assets` directories.
2. Download the exact Blender DMG, system asset ZIP and pose ZIP listed in
   `../PROVENANCE.md`; verify their SHA256 values before extracting. Mount the DMG
   read-only at a task-local directory, copy `Blender.app` into the tooling
   directory, and detach it. Extract both official CC0 ZIPs into `assets`.
3. Clone the official MPFB repository into `mpfb2`, checkout v2.0.17 and verify
   commit `80919fa4682335c41847f761a4d79dcad4124732`. Create the symlink
   `extensions/mpfb` pointing to the absolute path of `mpfb2/src/mpfb`.
4. Run the following from the repository root. MPFB preferences, logs and caches
   are directed into the task-local tooling directory by `bootstrap.py`.

```sh
export SORA_DRIVER_TOOLING="$PWD/tmp/fidelity/driver-tooling"
export BLENDER_USER_CONFIG="$SORA_DRIVER_TOOLING/blender-config"
export BLENDER_USER_EXTENSIONS="$SORA_DRIVER_TOOLING/extensions"
"$SORA_DRIVER_TOOLING/Blender.app/Contents/MacOS/Blender" \
  --background --factory-startup \
  --python public/assets/models/driver/authoring/create-driver.py \
  --python public/assets/models/driver/authoring/pose-driver.py \
  --python public/assets/models/driver/authoring/export-driver.py
python3 public/assets/models/driver/authoring/optimize-driver.py
```

The final step requires Pillow. The tested local Python runtime is the Codex
bundled dependency runtime, with Pillow 12.3.0. `optimize-driver.py` makes only the
documented opaque texture encodings and alpha-mode declarations; it does not
resize images or modify geometry, bones or UVs.

The scripts write editable `working/driver-initial.blend`,
`working/driver-seated.blend` and packed `working/driver-export.blend` into the
tooling directory, plus `driver.glb`, `geometry.json` and `optimization.json`
beside this authoring directory. The editable source is rebuilt rather than
shipping a duplicate Blender application or a 20 MB `.blend` with the game.

`human-preset.json` records exact MPFB asset selection/phenotype controls.
`seated-fit.json` records car-local joint/bounds measurements after authoring.
Character dimensions are meters, +Y up, +Z forward after glTF export; the negative
X seat is the right-hand-drive seat. Rebuilding does not need the AE86 GLB.

## Validation used

`tmp/fidelity/driver-tooling/test-driver.mjs` temporarily attaches eight isolated
prototype instances to a frozen development race and captures clean/pixel/empty
variants at desktop, mobile and two window views. It checks independent bone
poses, shared geometry/materials and native simulation immutability. The script
does not edit `world.ts` or add the prototype to the running game source.

Evidence is in `output/browser/driver-optimized/`. Direct renderer counters need
`renderer.info.autoReset = false` for complete postprocessing-frame accounting;
the dedicated `profile` record does this. Per-view counters report only the final
fullscreen pass and are not vehicle triangle counts.

The canonical script sequence was run into a separate `SORA_DRIVER_OUTPUT`
directory and reproduced the final GLB byte for byte: SHA256
`aedf174a5e8160a3bedc9b9522bb8e243e7979df87369e5c2a4b0b413a64ce7d`.
