// Run against local Vite: node public/assets/models/sora-ae86/prepare-shadow-indices.mjs
// This developer tool is not loaded by the game. Source geometry stays intact.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const directory = new URL('./', import.meta.url);
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
try {
  const page = await browser.newPage();
  await page.route('**/__vehicle_shadow_build', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5173'}/__vehicle_shadow_build`);
  const records = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { loadDetailedCarFleet } = await import('/src/game/three/asset-car.ts');
    const { MeshoptSimplifier } = await import('/node_modules/three/examples/jsm/libs/meshopt_simplifier.module.js');
    await MeshoptSimplifier.ready;
    const [car] = await loadDetailedCarFleet(new THREE.Texture());
    const records = [];
    car.group.traverse(mesh => {
      if (!mesh.isMesh || !mesh.castShadow) return;
      const geometry = mesh.geometry;
      const [indices, error] = MeshoptSimplifier.simplify(Uint32Array.from(geometry.index.array), geometry.attributes.position.array, 3,
        Math.floor(geometry.index.count * 0.08 / 3) * 3, 0.003, ['Permissive', 'ErrorAbsolute']);
      if (error > 0.003 || indices.length % 3) throw new Error('Invalid bounded shadow simplification');
      records.push({ key: mesh.userData.shadowKey, sourceIndexCount: geometry.index.count, vertexCount: geometry.attributes.position.count,
        maxErrorMeters: error, indices: Array.from(indices) });
    });
    return records;
  });
  let byteLength = 0;
  const chunks = [], manifestRecords = [];
  for (const { indices, ...record } of records) {
    const array = Uint32Array.from(indices), bytes = Buffer.from(array.buffer);
    chunks.push(bytes); manifestRecords.push({ ...record, byteOffset: byteLength, indexCount: indices.length }); byteLength += bytes.length;
  }
  const binary = Buffer.concat(chunks), source = await readFile(new URL('ae86.glb', directory));
  const manifest = { version: 1, sourceSha256: createHash('sha256').update(source).digest('hex'),
    generator: 'Three.js r186 bundled meshoptimizer 1.1, simplify, Permissive + ErrorAbsolute',
    targetRatio: 0.08, maximumErrorMeters: 0.003, byteLength,
    sha256: createHash('sha256').update(binary).digest('hex'), records: manifestRecords };
  await writeFile(new URL('shadow-indices.bin', directory), binary);
  await writeFile(new URL('shadow-indices.json', directory), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ byteLength, records: records.length,
    originalTriangles: records.reduce((sum, record) => sum + record.sourceIndexCount / 3, 0),
    shadowTriangles: manifestRecords.reduce((sum, record) => sum + record.indexCount / 3, 0), sha256: manifest.sha256 }, null, 2));
} finally { await browser.close(); }
