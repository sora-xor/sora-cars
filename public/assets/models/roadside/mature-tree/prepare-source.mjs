// Rebuild geometry LODs from the intact CC0 Poly Haven source; texture pixels are never modified.
import { readFile, writeFile } from 'node:fs/promises';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const source = JSON.parse(await readFile(new URL('./source/tree_small_02_2k.gltf', import.meta.url), 'utf8'));
const buffer = await readFile(new URL('./source/tree_small_02.bin', import.meta.url));
const counts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readAccessor(index) {
  const a = source.accessors[index], view = source.bufferViews[a.bufferView];
  const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
  const size = counts[a.type], result = new Type(a.count * size);
  const stride = view.byteStride ?? size * Type.BYTES_PER_ELEMENT;
  for (let i = 0; i < a.count; i++) {
    const start = buffer.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * stride;
    result.set(new Type(buffer.buffer, start, size), i * size);
  }
  return result;
}
const report = [];
for (const [lod, ratio, error] of [[0, 0.22, 0.006], [1, 0.085, 0.015], [2, 0.032, 0.035]]) {
  const gltf = structuredClone(source), chunks = [];
  gltf.accessors = []; gltf.bufferViews = [];
  let byteOffset = 0;
  const addAccessor = (data, original) => {
    const padding = (4 - byteOffset % 4) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); byteOffset += padding; }
    const view = gltf.bufferViews.length;
    gltf.bufferViews.push({ buffer: 0, byteOffset, byteLength: data.byteLength });
    chunks.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength)); byteOffset += data.byteLength;
    const a = { ...original, bufferView: view, byteOffset: 0, count: data.length / counts[original.type] };
    delete a.min; delete a.max;
    if (original.type === 'VEC3') {
      a.min = [Infinity, Infinity, Infinity]; a.max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < data.length; i++) { const c = i % 3; a.min[c] = Math.min(a.min[c], data[i]); a.max[c] = Math.max(a.max[c], data[i]); }
    }
    gltf.accessors.push(a); return gltf.accessors.length - 1;
  };
  for (let meshIndex = 0; meshIndex < source.meshes.length; meshIndex++) {
    for (let i = 0; i < source.meshes[meshIndex].primitives.length; i++) {
      const primitive = source.meshes[meshIndex].primitives[i];
      const output = gltf.meshes[meshIndex].primitives[i];
      const position = readAccessor(primitive.attributes.POSITION);
      const normal = readAccessor(primitive.attributes.NORMAL);
      const uv = readAccessor(primitive.attributes.TEXCOORD_0);
      const indices = Uint32Array.from(readAccessor(primitive.indices));
      const attributes = new Float32Array(position.length / 3 * 5);
      for (let v = 0; v < position.length / 3; v++) attributes.set([normal[v * 3], normal[v * 3 + 1], normal[v * 3 + 2], uv[v * 2], uv[v * 2 + 1]], v * 5);
      const material = source.materials[primitive.material].name;
      const reduction = material.includes('leaves') ? ratio : Math.min(1, ratio * 2.4);
      const [simplified, actualError] = MeshoptSimplifier.simplifyWithAttributes(indices, position, 3, attributes, 5, [.08, .08, .08, .2, .2], null, Math.floor(indices.length * reduction / 3) * 3, error, ['Permissive', ...(lod === 2 ? ['Prune'] : [])]);
      const [remap, vertexCount] = MeshoptSimplifier.compactMesh(simplified);
      for (const [semantic, index] of Object.entries(primitive.attributes)) {
        const old = readAccessor(index), size = counts[source.accessors[index].type];
        const data = new Float32Array(vertexCount * size);
        for (let v = 0; v < remap.length; v++) if (remap[v] !== 0xffffffff) data.set(old.subarray(v * size, v * size + size), remap[v] * size);
        output.attributes[semantic] = addAccessor(data, source.accessors[index]);
      }
      output.indices = addAccessor(simplified, { ...source.accessors[primitive.indices], componentType: 5125 });
      report.push({ lod, material, sourceTriangles: indices.length / 3, triangles: simplified.length / 3, error: actualError });
    }
  }
  for (const image of gltf.images ?? []) if (image.uri) image.uri = `source/${image.uri}`;
  gltf.buffers = [{ uri: `mature-tree-lod${lod}.bin`, byteLength: byteOffset }];
  gltf.asset.extras = { source: 'Poly Haven tree_small_02', license: 'CC0-1.0', modification: 'Meshoptimizer attribute-aware geometry LOD; original texture files' };
  await writeFile(new URL(`./mature-tree-lod${lod}.bin`, import.meta.url), Buffer.concat(chunks));
  await writeFile(new URL(`./mature-tree-lod${lod}.gltf`, import.meta.url), JSON.stringify(gltf));
}
await writeFile(new URL('./lod-report.json', import.meta.url), JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify(report, null, 2));
