# Dimensional period shop props

`src/game/three/shop-props.ts` builds original metre-scale SORA vending-machine and workshop assemblies. The machine cabinet, shelves, eight dimensional drink cans, pull tabs, coin mechanisms, delivery recess, vents, workbench, extruded pegboard with through-holes, tool chest, castors, parts crate, screwdrivers and sockets are original procedural geometry. Product/service lettering is original SORA fiction, printed in a shared 2048-pixel atlas with the bundled Japanese font. The atlas labels physical products and control plates; it does not replace dimensional scenery.

The workshop retains four unmodified source meshes and PBR texture sets from Poly Haven, released under [CC0](https://polyhaven.com/license):

- [Old Tyre](https://polyhaven.com/a/old_tyre), MP: three copies retaining actual tread geometry and original 1K normal, colour, and ARM maps.
- [Bench Vice 01](https://polyhaven.com/a/bench_vice_01): source rig bind pose baked to a static, correctly mounted vice.
- [Combination Wrench](https://polyhaven.com/a/combination_wrench): five progressively sized copies hung on physical hooks.
- [Small Oil Can 01](https://polyhaven.com/a/small_oil_can_01): original geometry and 1K PBR maps.

Each source directory contains the preserved glTF, its declared dependencies, official provider metadata, source/file checksums in `PROVENANCE.json`, and a measured `geometry-report.json`. No source geometry is decimated. Author names and exact source URLs are preserved in those records. The workbench uses the separately documented Japanese cedar material in `public/assets/materials/japanese_cedar_planks`.

## Runtime contract

`await loadShopProps()` returns a cached library. `create('vending')` and `create('workshop')` return independent transform groups sharing immutable geometry and materials. Both face local -Z and rest at local Y=0. Do not individually dispose clone geometry/materials. Vending: 6 meshes / 11,566 triangles; workshop: 9 meshes / 47,350 triangles.

The workshop is 2.21 m wide, 1.829 m high and 0.7395 m deep. The vending machine is 0.97 m wide, 1.84 m high and 0.8145 m deep including controls. Ground-zero origins and source-scale bounds are verified by `tmp/fidelity/shop-props/capture.mjs`.
