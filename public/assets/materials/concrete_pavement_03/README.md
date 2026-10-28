# Concrete Pavement 03

Original 2K PBR scan by **Charlotte Baglioni**, provided by [Poly Haven](https://polyhaven.com/a/concrete_pavement_03) under [CC0](https://polyhaven.com/license). The preserved provider metadata measures one repeat as **2.1 × 2.1 metres**. Approximately seven slabs span a repeat, giving the original roughly 300 mm slab scale.

The source depicts worn outdoor concrete slabs with shallow joints, gray/warm-gray variation and exposed fine aggregate. The provider's reference photograph was visually inspected along with its material preview and all downloaded maps. It is suitable for urban frontage paving; it is not an archaeological claim about one exact 1980s Tokyo site.

`color.jpg`, `normal.jpg`, and `arm.jpg` are unmodified original provider 2048×2048 JPG bytes, renamed only to fit the application's existing scan-loader naming convention. Total transfer is 11,941,602 bytes. The source MD5s and local SHA-256s are recorded in `PROVENANCE.json`; all three source sizes and MD5s were verified on download. Original official API responses are retained as `source-info.json` and `source-files.json`.

## Inspected material settings

```ts
new THREE.MeshStandardMaterial({
  ...scannedSurface('concrete_pavement_03'),
  color: '#ffffff',
  normalScale: new THREE.Vector2(0.45, 0.45),
  roughness: 1,
  metalness: 0,
  aoMapIntensity: 0.8,
});
```

Color is sRGB; normal and packed ARM are linear data. The `roughness: 1` multiplier preserves the photographed roughness map instead of polishing the sidewalk. White tint preserves the source's muted concrete colors; the world's dusk lighting supplies the color cast. No whitewash shader is required.

Use world-coordinate UVs `[x / 2.1, z / 2.1]`, with texture repeat 1. If the current urban-ground geometry remains at `[x / 3.15, z / 3.15]`, a shared map repeat of **1.5** is equivalent; do not apply both adjustments. Keep this surface separate from the asphalt driving lane. Existing asphalt should remain at its original 3 m scale.

The isolated Three.js comparison uses the application's asphalt and original shop architecture under its dusk HDR/key light. See `output/browser/urban-paving/paving.png` and `soil.png`, with map dimensions/color spaces, zero page errors and zero failed requests in `report.json`. The accompanying `src/game/three/urban-paving.ts` material blends this concrete into soil from 15–22 m away from the road centre; it uses the existing ground UV scale and multiplies only the concrete lookup by 1.5. See `output/browser/urban-paving/INTEGRATION.md`. No native simulation geometry changes.
