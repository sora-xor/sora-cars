// Derive distant foliage from the original CC0 geometry and unmodified source UV/alpha maps.
// Each card stays at an authored leaf position/orientation; no surface faces the camera.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MeshoptSimplifier } from "meshoptimizer";
await MeshoptSimplifier.ready;
const root = fileURLToPath(new URL(".", import.meta.url));
const s = JSON.parse(
  await readFile(root + "source/tree_small_02_2k.gltf", "utf8"),
);
const buf = await readFile(root + "source/tree_small_02.bin");
const counts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function get(i) {
  const a = s.accessors[i],
    v = s.bufferViews[a.bufferView];
  const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[
    a.componentType
  ];
  return new Type(
    buf.buffer,
    buf.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
    a.count * counts[a.type],
  );
}
// Connected source patches are fitted with a least-squares 3D function of their UVs.
// This preserves the original atlas rectangle, position, and surface orientation.
const p = s.meshes[0].primitives.find((p) =>
    s.materials[p.material].name.includes("leaves"),
  ),
  ind = get(p.indices),
  pos = get(p.attributes.POSITION),
  uv = get(p.attributes.TEXCOORD_0);
const n = pos.length / 3,
  pa = Uint32Array.from({ length: n }, (_, i) => i),
  find = (i) => {
    while (pa[i] !== i) {
      pa[i] = pa[pa[i]];
      i = pa[i];
    }
    return i;
  };
for (let t = 0; t < ind.length; t += 3) {
  const a = find(ind[t]);
  pa[find(ind[t + 1])] = a;
  pa[find(ind[t + 2])] = a;
}
const comps = new Map();
for (let i = 0; i < n; i++) {
  const a = find(i);
  if (!comps.has(a)) comps.set(a, []);
  comps.get(a).push(i);
}
const stats = [];
for (const ids of comps.values()) {
  if (ids.length < 3) continue;
  let u = 0,
    v = 0,
    center = [0, 0, 0],
    lo = [Infinity, Infinity],
    hi = [-Infinity, -Infinity];
  for (const id of ids) {
    u += uv[id * 2];
    v += uv[id * 2 + 1];
    for (let j = 0; j < 3; j++) center[j] += pos[id * 3 + j];
    for (let j = 0; j < 2; j++) {
      lo[j] = Math.min(lo[j], uv[id * 2 + j]);
      hi[j] = Math.max(hi[j], uv[id * 2 + j]);
    }
  }
  u /= ids.length;
  v /= ids.length;
  center = center.map((x) => x / ids.length);
  let uu = 0,
    vv = 0,
    uvv = 0,
    pu = [0, 0, 0],
    pv = [0, 0, 0];
  for (const id of ids) {
    const a = uv[id * 2] - u,
      b = uv[id * 2 + 1] - v;
    uu += a * a;
    vv += b * b;
    uvv += a * b;
    for (let j = 0; j < 3; j++) {
      pu[j] += (pos[id * 3 + j] - center[j]) * a;
      pv[j] += (pos[id * 3 + j] - center[j]) * b;
    }
  }
  const det = uu * vv - uvv * uvv;
  if (det < 1e-20) continue;
  const axisU = pu.map((x, j) => (x * vv - pv[j] * uvv) / det),
    axisV = pv.map((x, j) => (x * uu - pu[j] * uvv) / det);
  let error = 0;
  for (const id of ids) {
    let e = 0;
    for (let j = 0; j < 3; j++) {
      const d =
        center[j] +
        axisU[j] * (uv[id * 2] - u) +
        axisV[j] * (uv[id * 2 + 1] - v) -
        pos[id * 3 + j];
      e += d * d;
    }
    error = Math.max(error, Math.sqrt(e));
  }
  const length = (a) => Math.hypot(...a),
    size = Math.max(
      length(axisU) * (hi[0] - lo[0]),
      length(axisV) * (hi[1] - lo[1]),
    );
  stats.push({
    n: ids.length,
    center,
    uvCenter: [u, v],
    uvBounds: [lo, hi],
    axisU,
    axisV,
    error,
    size,
  });
}

// Keep a broad representative patch per 12 cm spatial cell. A 34.5% local
// expansion compensates subpixel crown coverage at the distant transition.
const step = 0.12;
const cells = new Map();
for (const c of stats) {
  const key = c.center.map((x) => Math.floor(x / step)).join(",");
  const values = cells.get(key) ?? [];
  values.push(c);
  cells.set(key, values);
}
const selected = [...cells.values()].map(
  (v) => v.sort((a, b) => b.size - a.size)[0],
);

const gltf = structuredClone(s);
gltf.accessors = [];
gltf.bufferViews = [];
const chunks = [];
let offset = 0;
const add = (data, type, componentType = 5126) => {
  const padding = (4 - (offset % 4)) % 4;
  if (padding) {
    chunks.push(Buffer.alloc(padding));
    offset += padding;
  }
  const vi = gltf.bufferViews.length;
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset: offset,
    byteLength: data.byteLength,
  });
  chunks.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  offset += data.byteLength;
  const a = {
    bufferView: vi,
    componentType,
    type,
    count: data.length / counts[type],
  };
  if (type === "VEC3") {
    a.min = [Infinity, Infinity, Infinity];
    a.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < data.length; i++) {
      a.min[i % 3] = Math.min(a.min[i % 3], data[i]);
      a.max[i % 3] = Math.max(a.max[i % 3], data[i]);
    }
  }
  gltf.accessors.push(a);
  return gltf.accessors.length - 1;
};
const report = [];
for (const [i, p] of s.meshes[0].primitives.entries()) {
  const output = gltf.meshes[0].primitives[i],
    name = s.materials[p.material].name;
  if (name.includes("leaves")) {
    const positions = [],
      normals = [],
      uv = [],
      indices = [];
    for (const c of selected) {
      const base = positions.length / 3,
        normal = [
          c.axisU[1] * c.axisV[2] - c.axisU[2] * c.axisV[1],
          c.axisU[2] * c.axisV[0] - c.axisU[0] * c.axisV[2],
          c.axisU[0] * c.axisV[1] - c.axisU[1] * c.axisV[0],
        ],
        length = Math.hypot(...normal);
      for (const [u, v] of [
        [c.uvBounds[0][0], c.uvBounds[0][1]],
        [c.uvBounds[1][0], c.uvBounds[0][1]],
        [c.uvBounds[1][0], c.uvBounds[1][1]],
        [c.uvBounds[0][0], c.uvBounds[1][1]],
      ]) {
        for (let axis = 0; axis < 3; axis++) {
          const midU = (c.uvBounds[0][0] + c.uvBounds[1][0]) / 2,
            midV = (c.uvBounds[0][1] + c.uvBounds[1][1]) / 2;
          positions.push(
            c.center[axis] +
              c.axisU[axis] * (midU - c.uvCenter[0]) +
              c.axisV[axis] * (midV - c.uvCenter[1]) +
              1.345 * (c.axisU[axis] * (u - midU) + c.axisV[axis] * (v - midV)),
          );
          normals.push(normal[axis] / length);
        }
        uv.push(u, v);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    output.attributes = {
      POSITION: add(new Float32Array(positions), "VEC3"),
      NORMAL: add(new Float32Array(normals), "VEC3"),
      TEXCOORD_0: add(new Float32Array(uv), "VEC2"),
    };
    output.indices = add(new Uint32Array(indices), "SCALAR", 5125);
    report.push({
      material: name,
      cards: selected.length,
      triangles: indices.length / 3,
    });
  } else {
    const position = get(p.attributes.POSITION),
      indices = Uint32Array.from(get(p.indices));
    const [simplified, error] = MeshoptSimplifier.simplify(
      indices,
      position,
      3,
      Math.floor((indices.length * 0.035) / 3) * 3,
      0.01,
      ["Permissive"],
    );
    const [remap, n] = MeshoptSimplifier.compactMesh(simplified);
    for (const [semantic, accessor] of Object.entries(p.attributes)) {
      const old = get(accessor),
        size = counts[s.accessors[accessor].type],
        data = new Float32Array(n * size);
      for (let v = 0; v < remap.length; v++)
        if (remap[v] !== 0xffffffff)
          data.set(old.subarray(v * size, v * size + size), remap[v] * size);
      output.attributes[semantic] = add(data, s.accessors[accessor].type);
    }
    output.indices = add(simplified, "SCALAR", 5125);
    report.push({ material: name, triangles: simplified.length / 3, error });
  }
}
for (const image of gltf.images ?? [])
  if (image.uri) image.uri = `source/${image.uri}`;
gltf.buffers = [{ uri: "mature-tree-lod3.bin", byteLength: offset }];
gltf.asset.extras = {
  source: "Poly Haven tree_small_02",
  license: "CC0-1.0",
  modification:
    "Spatially distributed 3D leaf clusters fitted to source UVs; original leaf textures and alpha; simplified trunk and branches",
};
await writeFile(root + "mature-tree-lod3.bin", Buffer.concat(chunks));
await writeFile(root + "mature-tree-lod3.gltf", JSON.stringify(gltf));
await writeFile(
  root + "cluster-report.json",
  JSON.stringify(
    { step, sourceComponents: stats.length, cards: selected.length, report },
    null,
    2,
  ),
);
console.log(report);
