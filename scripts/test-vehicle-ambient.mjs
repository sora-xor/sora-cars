import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

// Deliberately small correctness fixture, not a GPU performance benchmark.
const base = process.env.SORA_URL ?? 'http://127.0.0.1:5173';
const output = 'output/browser/vehicle-ambient-regression';
const metadata = JSON.parse(await readFile('public/assets/models/sora-ae86/ambient-visibility.json', 'utf8'));
const bytes = await readFile('public/assets/models/sora-ae86/ambient-visibility.png');
assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.textureSha256);
const png = PNG.sync.read(bytes);
assert.deepEqual([png.width, png.height], metadata.resolution);
assert.deepEqual(metadata.uv, { u0: '-X', u1: '+X', v0: '-Z', v1: '+Z', pngTop: '+Z' });
const contacts = metadata.tyreContacts.map(({ point, visibilityAtGroundContact }) => {
  const u = point[0] / metadata.widthMeters + .5, v = point[2] / metadata.depthMeters + .5;
  const x = Math.floor(u * png.width), y = png.height - 1 - Math.floor(v * png.height);
  const visibility = png.data[(y * png.width + x) * 4] / 255;
  assert.ok(Math.abs(visibility - visibilityAtGroundContact) < 1 / 255, 'PNG +Z orientation matches raw linear bake samples');
  return { point, visibility };
});
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__vehicle_ambient_test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0"></body>' }));
  await page.goto(`${base}/__vehicle_ambient_test`);
  const report = await page.evaluate(async ({ contacts }) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { VehicleAmbientOcclusion } = await import('/src/game/three/vehicle-ambient.ts');
    const { loadDetailedCarFleet } = await import('/src/game/three/asset-car.ts');
    const ambient = new VehicleAmbientOcclusion();
    if (!ambient.texture.image?.complete) await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Ambient texture load timed out')), 30000);
      const check = () => {
        if (ambient.texture.image?.complete) { clearTimeout(timeout); resolve(); }
        else setTimeout(check, 20);
      };
      check();
    });
    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(256, 256); renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
    document.body.append(renderer.domElement);
    const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, .1, 20);
    camera.position.set(0, 10, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const material = new THREE.MeshStandardMaterial({ color: 'white', roughness: 1 });
    ambient.decorate(material);
    const shaderHook = material.onBeforeCompile;
    ambient.decorate(material);
    const decoratedOnce = shaderHook === material.onBeforeCompile;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), material); plane.rotation.x = -Math.PI / 2;
    scene.add(plane);
    const light = new THREE.AmbientLight('white', 2); scene.add(light);
    const gl = renderer.getContext(), pixel = new Uint8Array(4);
    const sample = point => {
      const projected = point.clone().project(camera);
      gl.readPixels(Math.floor((projected.x * .5 + .5) * 256), Math.floor((projected.y * .5 + .5) * 256), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return pixel[0];
    };
    const allPixels = () => { const result = new Uint8Array(256 * 256 * 4); gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, result); return result; };
    const mapping = [];
    for (const heading of [0, Math.PI / 2, -.73]) {
      const center = new THREE.Vector3(.23, .003, -.17);
      const points = contacts.map(contact => new THREE.Vector3(...contact.point).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).add(center));
      ambient.setCar(0, center, heading, 0); renderer.render(scene, camera); const before = points.map(sample);
      ambient.setCar(0, center, heading, 1); renderer.render(scene, camera); const after = points.map(sample);
      mapping.push({ heading, before, after, points: points.map(point => point.toArray()), ratios: after.map((value, i) => value / before[i]), expected: contacts.map(contact => .16 + .84 * contact.visibility) });
    }
    ambient.setCar(0, new THREE.Vector3(0, 2, 0), 0, 1); renderer.render(scene, camera); const high = allPixels();
    ambient.setCar(0, new THREE.Vector3(0, 2, 0), 0, 0); renderer.render(scene, camera); const highOff = allPixels();
    const heightRejected = high.every((value, index) => value === highOff[index]);
    light.intensity = 0;
    const direct = new THREE.DirectionalLight('white', 2); direct.position.set(0, 5, 0); scene.add(direct);
    ambient.setCar(0, new THREE.Vector3(0, .003, 0), 0, 0); renderer.render(scene, camera); const directOff = allPixels();
    ambient.setCar(0, new THREE.Vector3(0, .003, 0), 0, 1); renderer.render(scene, camera); const directOn = allPixels();
    const directUnchanged = directOn.every((value, index) => value === directOff[index]);

    // Exercise an existing oil-style hook and all physical indirect lobes.
    const oil = new THREE.MeshPhysicalMaterial({ clearcoat: .7, sheen: .3 });
    oil.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= 0.75;\n#include <alphatest_fragment>'); };
    oil.customProgramCacheKey = () => 'oil-existing-hook';
    ambient.decorate(oil);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    oil.onBeforeCompile(shader, renderer);
    const oilComposition = shader.fragmentShader.includes('diffuseColor.a *= 0.75;')
      && shader.fragmentShader.includes('clearcoatSpecularIndirect *= soraVehicleOcclusion;')
      && shader.fragmentShader.includes('sheenSpecularIndirect *= soraVehicleOcclusion;')
      && oil.customProgramCacheKey().startsWith('oil-existing-hook:');
    plane.material = oil; renderer.render(scene, camera);

    const flag = new THREE.Texture();
    const fleet = await loadDetailedCarFleet(flag);
    const drivers = fleet.map(car => car.group.getObjectByName('DetailedSeatedDriver'));
    const driverMeshes = drivers.map(driver => { const list = []; driver.traverse(object => { if (object.isMesh) list.push(object); }); return list; });
    const materials = list => [...new Set(list.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]))];
    const driverMaterials = driverMeshes.map(materials);
    const opacityUniform = material => {
      const shader = { uniforms: {}, vertexShader: 'void main() {}', fragmentShader: 'void main() {}' };
      material.onBeforeCompile(shader, renderer);
      return shader.uniforms.soraAssetOpacity;
    };
    const driverUniforms = driverMaterials.map(list => list.map(opacityUniform));
    const bodyUniforms = fleet.map(car => opacityUniform(car.group.children.find(child => child.isMesh && child.material.name === 'Primary').material));
    const fadeSharesCar = driverUniforms.every((list, index) => list.every(uniform => uniform === bodyUniforms[index]));
    const independentMaterials = new Set(driverMaterials.flat()).size === driverMaterials.reduce((total, list) => total + list.length, 0);
    const sharedGeometryAndTextures = driverMeshes.slice(1).every(list => list.every((mesh, index) => {
      const original = driverMeshes[0][index];
      return original.geometry === mesh.geometry && original.material.map === mesh.material.map;
    }));
    fleet[0].setOpacity(.375);
    const independentOpacity = driverUniforms[0].every(uniform => uniform.value === .375)
      && driverUniforms.slice(1).every(list => list.every(uniform => uniform.value === 1));
    const head0 = drivers[0].getObjectByName('head'), head1 = drivers[1].getObjectByName('head');
    const headBefore = head1.quaternion.clone(); head0.rotateY(.13);
    const independentBones = head0 !== head1 && headBefore.equals(head1.quaternion)
      && driverMeshes[0].filter(mesh => mesh.isSkinnedMesh).every(mesh => !driverMeshes[1].some(other => other.skeleton === mesh.skeleton));
    const noDriverShadow = driverMeshes.flat().every(mesh => !mesh.castShadow);
    renderer.dispose(); ambient.texture.dispose();
    return { texture: { flipY: ambient.texture.flipY, colorSpace: ambient.texture.colorSpace }, decoratedOnce, mapping,
      heightRejected, directUnchanged, oilComposition, drivers: { count: drivers.length, meshes: driverMeshes[0].length,
        fadeSharesCar, independentMaterials, sharedGeometryAndTextures, independentOpacity, independentBones, noDriverShadow } };
  }, { contacts });
  await writeFile(`${output}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
  assert.deepEqual(errors, []);
  assert.equal(report.texture.flipY, true);
  assert.equal(report.texture.colorSpace, '');
  for (const row of report.mapping) {
    assert.ok(row.before.every(value => value > 0 && value === row.before[0]), 'unassigned slots cannot add phantom ambient occlusion');
    row.ratios.forEach((ratio, index) => assert.ok(Math.abs(ratio - row.expected[index]) < .035, 'actual projected AO retains low source visibility at each rotated tire contact'));
  }
  for (const key of ['decoratedOnce', 'heightRejected', 'directUnchanged', 'oilComposition']) assert.equal(report[key], true, key);
  assert.equal(report.drivers.count, 8); assert.ok(report.drivers.meshes >= 7);
  for (const [key, value] of Object.entries(report.drivers)) if (typeof value === 'boolean') assert.equal(value, true, key);
  console.log(`Vehicle ambient and driver integration: source orientation, three rotations, height guard, direct-light invariance, oil indirect lobes and eight independent driver fades verified. ${output}/report.json`);
} finally { await browser.close(); }
