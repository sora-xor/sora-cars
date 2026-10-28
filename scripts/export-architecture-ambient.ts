/** Export actual procedural architecture for the offline visibility bake.
 * Bundle with esbuild for Node, defining import.meta.env.BASE_URL to "/".
 * The small DOM stand-in only creates texture metadata; geometry is unmodified.
 */
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const context = new Proxy({}, { get: (_target, key) => key === 'measureText' ? () => ({ width: 100 })
  : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
(globalThis as any).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => context }),
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  fonts: { load: () => Promise.resolve([]), ready: Promise.resolve() },
};

const { createApartment, createBuilding } = await import('../src/game/three/scenery');
const flag = new THREE.Texture(), roots = [
  ...Array.from({ length: 4 }, (_, variant) => createBuilding(variant, flag)),
  ...Array.from({ length: 2 }, (_, variant) => createApartment(variant)),
];
const templates = roots.map(root => {
  root.updateMatrixWorld(true);
  const meshes = root.children.map((child, index) => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) throw new Error('Unexpected architecture template child');
    const source = child.geometry, material = child.material as THREE.MeshStandardMaterial;
    const hash = createHash('sha256');
    for (const name of ['position', 'normal', 'uv']) {
      const attribute = source.getAttribute(name);
      if (!attribute || attribute.isInterleavedBufferAttribute) throw new Error(`Missing plain ${name}`);
      const array = new Float32Array(attribute.array);
      hash.update(new Uint8Array(array.buffer));
    }
    const indices = new Uint32Array(source.index?.array ?? Array.from({ length: source.getAttribute('position').count }, (_, i) => i));
    hash.update(new Uint8Array(indices.buffer));
    const sourceHash = hash.digest('hex');
    // Signs keep their original own transforms. They can block ambient light,
    // but replacing their transformed geometry would apply the transform twice.
    const identity = child.matrix.equals(new THREE.Matrix4());
    const geometry = source.clone();
    if (!identity) geometry.applyMatrix4(child.matrixWorld);
    const emissive = material.emissiveIntensity > 1;
    const opaque = !material.transparent;
    const result = { id: String(index), sourceHash,
      sourceVertexCount: source.getAttribute('position').count, sourceTriangleCount: indices.length / 3,
      materialKind: material.transparent ? 'glass' : emissive ? 'emissive' : material.name || 'opaque',
      opaque, bake: identity && opaque && !emissive,
      position: Array.from(geometry.getAttribute('position').array),
      normal: Array.from(geometry.getAttribute('normal').array), uv: Array.from(geometry.getAttribute('uv').array),
      index: Array.from(indices) };
    geometry.dispose();
    return result;
  });
  return { id: root.name, meshes };
});
const path = process.argv[2] ?? 'tmp/fidelity/architecture-ambient-source.json';
await mkdir(dirname(path), { recursive: true });
// JSON normally erases IEEE-754 negative zero. Preserve it for the offline
// baker's byte-exact source hash, including normals on axis-aligned surfaces.
const json = JSON.stringify({ schemaVersion: 1, templates }, (_key, value) => Object.is(value, -0) ? '__architecture_negative_zero__' : value)
  .replaceAll('"__architecture_negative_zero__"', '-0.0');
await writeFile(path, json);
console.log(JSON.stringify({ path, templates: templates.map(t => ({ id: t.id, meshes: t.meshes.length,
  triangles: t.meshes.reduce((sum, m) => sum + m.index.length / 3, 0) })) }));
