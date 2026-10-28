# Dusk illumination

`qwantani-dusk.hdr` is the unmodified 4K **Qwantani Dusk 2** HDR panorama by
Greg Zaal and Jarod Guest, distributed by Poly Haven under CC0. The original
download, byte count and SHA-256 are recorded in `PROVENANCE.json`.

At runtime, `src/game/three/dusk-environment.ts` adapts the linear HDR radiance
to the game's blue-hour palette: a cooler upper sky, mauve horizon and restrained
ground bounce. This operation retains the original panorama's 4K dimensions
and unclipped HDR values in a half-float target. The same adapted panorama
provides both the visible sky and image-based material illumination, so its
color is reflected consistently in the cars, glass and pavement. The source
file on disk is unchanged. Exposure and final display grading are separate
steps in the renderer.
