import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import * as THREE from 'three';
import { decodeArchitectureGeometry } from '../src/game/three/architecture-ambient';
import { installSpotlightEarlyOut } from '../src/game/three/spotlight-shading';
import { CityBlockBatch } from '../src/game/three/city-block-batch';

type MeshRecord = Parameters<typeof decodeArchitectureGeometry>[0];
type Runtime = typeof import('../src/game/three/architecture-ambient');
type Pack = { manifest: { schemaVersion: number; binarySha256: string; templates: { id: string; meshes: MeshRecord[] }[] }; bytes: ArrayBuffer };
const digest = (bytes: ArrayBuffer | Uint8Array) => createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
const buffer = (values: Uint8Array): ArrayBuffer => new Uint8Array(values).buffer;
let moduleSequence = 0;

async function freshRuntime(): Promise<Runtime> {
  // Isolate the module's immutable download cache and supply Vite's one build
  // constant. The production implementation, including all checks, is unchanged.
  const source = (await readFile(new URL('../src/game/three/architecture-ambient.ts', import.meta.url), 'utf8'))
    .replace("from 'three'", `from ${JSON.stringify(import.meta.resolve('three'))}`);
  const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022',
    define: { 'import.meta.env.BASE_URL': JSON.stringify('/') } });
  return import(`data:text/javascript;base64,${Buffer.from(`${compiled.code}\n// fixture ${moduleSequence++}`).toString('base64')}`) as Promise<Runtime>;
}

function fixture() {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute([-1, -0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1], 3));
  indexed.setAttribute('normal', new THREE.Float32BufferAttribute([-0, 1, 0, 0, 1, -0, 0, 1, 0, 0, 1, 0], 3));
  indexed.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  indexed.setIndex([0, 2, 1, 2, 3, 1]);
  const geometries = [indexed, indexed.toNonIndexed()], texture = new THREE.Texture();
  const material = new THREE.MeshPhysicalMaterial({ map: texture, clearcoat: .7, sheen: .2 });
  const skipped = new THREE.MeshStandardMaterial({ emissive: 'white', emissiveIntensity: 2 });
  const parts: Uint8Array[] = []; let offset = 0;
  const append = (values: Float32Array | Uint32Array, itemSize: number) => {
    const record = { byteOffset: offset, count: values.length / itemSize, itemSize,
      type: values instanceof Uint32Array ? 'uint32' as const : 'float32' as const };
    const bytes = new Uint8Array(values.buffer); parts.push(bytes); offset += bytes.byteLength; return record;
  };
  const sourceHash = (geometry: THREE.BufferGeometry) => {
    const hash = createHash('sha256');
    for (const name of ['position', 'normal', 'uv']) hash.update(new Uint8Array(new Float32Array(geometry.getAttribute(name).array).buffer));
    hash.update(new Uint8Array(new Uint32Array(geometry.index?.array ?? [0, 1, 2, 3, 4, 5]).buffer));
    return hash.digest('hex');
  };
  const roots = geometries.map((geometry, index) => {
    const root = new THREE.Group(); root.name = `fixture-${index}`;
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, skipped)); return root;
  });
  const templates = roots.map((root, index) => {
    const record: MeshRecord = { id: '0', baked: true, sourceHash: sourceHash(geometries[index]!), vertexCount: 5, triangleCount: 4,
      attributes: {
        position: append(new Float32Array([-1, -0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1, 0, 0, 0]), 3),
        normal: append(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3),
        uv: append(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1, .5, .5]), 2),
        visibility: append(new Float32Array([1, .8, .5, .2, .4]), 1),
      }, index: append(new Uint32Array([0, 2, 4, 2, 3, 4, 3, 1, 4, 1, 0, 4]), 1) };
    return { id: root.name, meshes: [record, { ...record, id: '1', baked: false }] };
  });
  const bytes = new Uint8Array(offset); let cursor = 0;
  for (const part of parts) { bytes.set(part, cursor); cursor += part.byteLength; }
  const pack: Pack = { manifest: { schemaVersion: 1, binarySha256: digest(bytes), templates }, bytes: bytes.buffer };
  return { roots, geometries, material, skipped, texture, pack, record: templates[0]!.meshes[0]! };
}

async function withPack<T>(pack: Pack, run: (runtime: Runtime, requested: string[]) => Promise<T>, status = 200): Promise<T> {
  const original = globalThis.fetch, requested: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); requested.push(url);
    return url.endsWith('/manifest.json') ? new Response(JSON.stringify(pack.manifest), { status })
      : new Response(pack.bytes.slice(0), { status });
  };
  try { return await run(await freshRuntime(), requested); } finally { globalThis.fetch = original; }
}

function surfaceArea(geometry: THREE.BufferGeometry): number {
  const p = geometry.getAttribute('position'), index = geometry.index, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    a.fromBufferAttribute(p, index ? index.getX(i) : i); b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2); area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return area;
}

function snapshot(root: THREE.Group) {
  return root.children.map(object => {
    const mesh = object as THREE.Mesh;
    return { geometry: mesh.geometry, material: mesh.material,
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [name, Array.from(attribute.array)])),
      index: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null };
  });
}

test('production bake decodes every mesh with its recorded source bounds and surface area intact', async () => {
  const root = new URL('../public/assets/models/architecture-ambient/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8')) as Pack['manifest'];
  const bytes = buffer(await readFile(new URL('geometry.bin', root)));
  assert.equal(digest(bytes), manifest.binarySha256);
  assert.equal(manifest.templates.length, 6);
  let baked = 0, occluded = 0;
  for (const template of manifest.templates) for (const record of template.meshes) {
    const geometry = decodeArchitectureGeometry(record, bytes);
    const source = record as MeshRecord & { bounds: { min: number[]; max: number[] }; sourceSurfaceArea: number };
    assert.equal(geometry.getAttribute('position').count, record.vertexCount);
    assert.equal(geometry.index!.count, record.triangleCount * 3);
    assert.deepEqual(geometry.boundingBox!.min.toArray(), source.bounds.min);
    assert.deepEqual(geometry.boundingBox!.max.toArray(), source.bounds.max);
    assert.ok(Math.abs(surfaceArea(geometry) - source.sourceSurfaceArea) <= Math.max(1e-5, source.sourceSurfaceArea * 3e-6));
    assert.ok(geometry.boundingSphere && Number.isFinite(geometry.boundingSphere.radius));
    if (record.baked) { baked++; if (Array.from(geometry.getAttribute('architectureVisibility').array).some(v => v < .8)) occluded++; }
    geometry.dispose();
  }
  assert.ok(baked > 20 && occluded > 20, 'real enclosure measurements cover all six architecture templates');
});

test('decoder preserves source surface, affine UVs and immutable packed bytes', () => {
  const f = fixture(), before = new Uint8Array(f.pack.bytes).slice();
  const geometry = decodeArchitectureGeometry(f.record, f.pack.bytes), original = f.geometries[0]!;
  original.computeBoundingBox();
  assert.deepEqual(geometry.boundingBox, original.boundingBox);
  assert.equal(surfaceArea(geometry), surfaceArea(original));
  const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    assert.ok(p.getY(i) === 0); assert.equal(uv.getX(i), (p.getX(i) + 1) / 2); assert.equal(uv.getY(i), (p.getZ(i) + 1) / 2);
  }
  assert.deepEqual(new Uint8Array(f.pack.bytes), before);
});

test('decoder rejects corrupt layouts, nonfinite values, invalid visibility and incomplete triangles', () => {
  const f = fixture();
  const invalid: ((record: MeshRecord, bytes: ArrayBuffer) => void)[] = [
    record => { record.attributes.position.byteOffset = 2; },
    record => { record.attributes.normal.byteOffset = f.pack.bytes.byteLength; },
    record => { record.attributes.normal.type = 'uint32'; },
    record => { record.attributes.uv.itemSize = 3; },
    record => { record.attributes.uv.count--; },
    record => { record.attributes.visibility.count = -1; },
    record => { record.index.type = 'float32'; },
    record => { record.index.count--; },
    record => { record.index.count = 1; record.triangleCount = 1 / 3; },
    record => { record.vertexCount = 5.5; },
    record => { record.triangleCount = 0; record.index.count = 0; },
    record => { record.vertexCount = 0; record.triangleCount = 0; record.index.count = 0;
      Object.values(record.attributes).forEach(attribute => { attribute.count = 0; }); },
    (record, bytes) => { new Float32Array(bytes, record.attributes.position.byteOffset)[0] = NaN; },
    (record, bytes) => { new Float32Array(bytes, record.attributes.normal.byteOffset)[0] = Infinity; },
    (record, bytes) => { new Float32Array(bytes, record.attributes.uv.byteOffset)[0] = NaN; },
    ...[-.001, 1.001, NaN].map(value => (record: MeshRecord, bytes: ArrayBuffer) => { new Float32Array(bytes, record.attributes.visibility.byteOffset)[0] = value; }),
    ...[5, 0xffffffff].map(value => (record: MeshRecord, bytes: ArrayBuffer) => { new Uint32Array(bytes, record.index.byteOffset)[0] = value; }),
  ];
  invalid.forEach((change, index) => {
    const record = structuredClone(f.record), bytes = f.pack.bytes.slice(0); change(record, bytes);
    assert.throws(() => decodeArchitectureGeometry(record, bytes), /architectural visibility/i, `malformed case ${index}`);
  });
  assert.throws(() => decodeArchitectureGeometry(f.record, f.pack.bytes.slice(0, f.record.index.byteOffset + 4)), /attribute/i);
});

test('apply shares baked geometry and cloned materials without mutating source templates, maps or placements', async () => {
  const f = fixture(), originals = f.roots.map(snapshot);
  const live = [f.roots[0]!.clone(true), f.roots[0]!.clone(true), f.roots[1]!.clone(true)];
  live.forEach((root, i) => { root.position.set(30 + i, 2, -45); root.rotation.y = .47; root.scale.set(1.2, .9, 1.1); root.updateMatrixWorld(true); });
  const matrices = live.map(root => root.matrix.toArray()); let disposed = 0;
  for (const resource of [...f.geometries, f.material, f.skipped, f.texture]) resource.addEventListener('dispose', () => disposed++);
  await withPack(f.pack, async ({ ArchitectureAmbient }, requested) => {
    const ambient = new ArchitectureAmbient(); await ambient.apply(live);
    const a = live[0]!.children[0] as THREE.Mesh, b = live[1]!.children[0] as THREE.Mesh, c = live[2]!.children[0] as THREE.Mesh;
    assert.equal(a.geometry, b.geometry); assert.notEqual(a.geometry, c.geometry);
    assert.equal(a.material, b.material); assert.equal(a.material, c.material); assert.notEqual(a.material, f.material);
    assert.equal((a.material as THREE.MeshStandardMaterial).map, f.texture);
    assert.equal((a.material as THREE.MeshPhysicalMaterial).clearcoat, f.material.clearcoat);
    assert.deepEqual(ambient.stats, { templates: 2, sourceMeshes: 2, triangles: 8 });
    assert.equal(requested.length, 2);
    live.forEach(root => { assert.equal((root.children[1] as THREE.Mesh).material, f.skipped); });
    const templates = Array.from({ length: 6 }, () => live[0]!.clone(true));
    const batch = new CityBlockBatch({ buildings: templates.slice(0, 4), apartments: templates.slice(4) });
    const instance = batch.group.children[0] as THREE.InstancedMesh;
    assert.equal(instance.geometry, a.geometry); assert.equal(instance.material, a.material);
    assert.equal(instance.geometry.getAttribute('architectureVisibility'), a.geometry.getAttribute('architectureVisibility'));
    assert.ok(instance.geometry.index); batch.dispose();
  });
  assert.deepEqual(f.roots.map(snapshot), originals); assert.deepEqual(live.map(root => root.matrix.toArray()), matrices); assert.equal(disposed, 0);
});

test('stale geometry or transformed mesh rejects the whole application before any earlier clone changes', async () => {
  for (const kind of ['position', 'normal', 'uv', 'index', 'transform'] as const) {
    const f = fixture(), live = f.roots.map(root => root.clone(true));
    const invalid = live[1]!.children[0] as THREE.Mesh;
    if (kind === 'transform') { invalid.position.x = .1; invalid.updateMatrix(); }
    else {
      invalid.geometry = invalid.geometry.clone();
      if (kind === 'index') invalid.geometry.setIndex([1, 0, 2, 3, 4, 5]);
      else invalid.geometry.getAttribute(kind).setX(0, .25);
    }
    const before = live.map(snapshot);
    await withPack(f.pack, async ({ ArchitectureAmbient }) => {
      const ambient = new ArchitectureAmbient();
      await assert.rejects(ambient.apply(live), /source changed/);
      assert.deepEqual(live.map(snapshot), before); assert.deepEqual(ambient.stats, { templates: 0, sourceMeshes: 0, triangles: 0 });
    });
  }
});

test('failed HTTP, incompatible schema and a tampered binary cannot replace live geometry', async () => {
  for (const kind of ['http', 'schema', 'hash'] as const) {
    const f = fixture(), before = f.roots.map(snapshot);
    if (kind === 'schema') f.pack.manifest.schemaVersion++;
    if (kind === 'hash') new Uint8Array(f.pack.bytes)[0]! ^= 1;
    await withPack(f.pack, async ({ ArchitectureAmbient }) => {
      await assert.rejects(new ArchitectureAmbient().apply(f.roots), /could not load|Unsupported|does not match/);
      assert.deepEqual(f.roots.map(snapshot), before);
    }, kind === 'http' ? 503 : 200);
  }
});

test('ambient material retains custom hooks, uniforms and the spotlight guard while changing only indirect lighting', async () => {
  const f = fixture(); let compiled = 0, compiledMaterial: THREE.Material | undefined;
  const renderer = { renderBufferDirect() {} } as unknown as THREE.WebGLRenderer;
  const submit = (mesh: THREE.Mesh) => renderer.renderBufferDirect(new THREE.PerspectiveCamera(), new THREE.Scene(), mesh.geometry,
    mesh.material as THREE.Material, mesh, { start: 0, count: mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count, materialIndex: 0 });
  f.material.onBeforeCompile = function (shader) {
    compiled++; compiledMaterial = this; shader.uniforms.sourcePaint = { value: .7 }; shader.fragmentShader = '// source paint hook\n' + shader.fragmentShader;
  };
  f.material.customProgramCacheKey = () => 'source-paint-v2';
  installSpotlightEarlyOut(renderer); submit(f.roots[0]!.children[0] as THREE.Mesh);
  const sourceHook = f.material.onBeforeCompile, sourceKey = f.material.customProgramCacheKey();
  await withPack(f.pack, async ({ ArchitectureAmbient }) => {
    const ambient = new ArchitectureAmbient(); await ambient.apply(f.roots);
    const mesh = f.roots[0]!.children[0] as THREE.Mesh, material = mesh.material as THREE.MeshStandardMaterial;
    submit(mesh);
    const shader = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader,
      uniforms: {} } as Parameters<THREE.Material['onBeforeCompile']>[0];
    material.onBeforeCompile(shader, renderer);
    assert.equal(compiled, 1); assert.equal(compiledMaterial, material); assert.equal(shader.uniforms.sourcePaint!.value, .7);
    assert.equal(shader.uniforms.architectureAmbientEnabled, ambient.enabled);
    ambient.enabled.value = 0; assert.equal(shader.uniforms.architectureAmbientEnabled!.value, 0);
    assert.match(shader.vertexShader, /vArchitectureVisibility = architectureVisibility/);
    assert.match(shader.fragmentShader, /source paint hook/);
    assert.equal(shader.fragmentShader.split('if ( directLight.visible ) { RE_Direct(').length, 2);
    assert.match(shader.fragmentShader, /reflectedLight\.indirectDiffuse \*= enclosureVisibility/);
    assert.match(shader.fragmentShader, /reflectedLight\.indirectSpecular \*= computeSpecularOcclusion/);
    assert.match(shader.fragmentShader, /clearcoatSpecularIndirect \*= enclosureVisibility/);
    assert.match(shader.fragmentShader, /sheenSpecularIndirect \*= enclosureVisibility/);
    assert.doesNotMatch(shader.fragmentShader, /reflectedLight\.direct(?:Diffuse|Specular) \*= enclosureVisibility/);
    assert.match(material.customProgramCacheKey(), /source-paint-v2.*sora-architecture-ambient-v1.*sora-spotlight-early-out-v1/);
    assert.equal(f.material.onBeforeCompile, sourceHook); assert.equal(f.material.customProgramCacheKey(), sourceKey);
  });
});
