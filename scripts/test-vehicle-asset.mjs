import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.SORA_URL ?? 'http://127.0.0.1:5173';
const output = 'output/browser/vehicle-asset';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__vehicle_asset_test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0"></body>' }));
  await page.goto(`${base}/__vehicle_asset_test`);
  const report = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { RoomEnvironment } = await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
    const { loadDetailedCarFleet } = await import('/src/game/three/asset-car.ts');
    const flag = await new THREE.TextureLoader().loadAsync('/assets/sora-flag.png'); flag.colorSpace = THREE.SRGBColorSpace;
    const fleet = await loadDetailedCarFleet(flag);
    const meshes = fleet.map(car => { const list = []; car.group.traverse(node => { if (node.isMesh) list.push(node); }); return list; });
    const colors = ['#e8e5d9', '#43bcbc', '#dcc643', '#b62431', '#214f9b', '#606870', '#d37632', '#80a260'];
    fleet.forEach((car, index) => car.setAppearance(colors[index]));
    const paints = meshes.map(list => list.filter(mesh => mesh.material.name === 'Primary'));
    const paintColors = paints.map(list => [...new Set(list.map(mesh => mesh.material.color.getHexString()))]);
    const car = fleet[0];
    car.group.updateMatrixWorld(true);
    const tireMinima = meshes[0].filter(mesh => mesh.material.name === 'TireMaterial').map(mesh => new THREE.Box3().setFromObject(mesh).min.y);
    const wheelGroups = car.group.children.filter(node => /^Wheel/.test(node.name));
    car.animate(20, 0.25, false, false, 0); car.animate(20, 0.25, true, true, 0.05);
    const wheels = wheelGroups.map(node => ({ name: node.name, steer: node.rotation.y, spin: node.children[0].rotation.x,
      fixedCalipers: node.children.filter(child => child.isMesh).map(child => child.rotation.toArray().slice(0, 3)) }));
    const brakeMaterials = [...new Set(meshes[0].filter(mesh => mesh.material.name === 'LampCovers').map(mesh => mesh.material))];
    const lampsDuringBraking = brakeMaterials.map(material => material.emissiveIntensity).sort((a, b) => a - b);
    car.animate(0, 0, false, false, 0.1);
    const lampsReleased = brakeMaterials.map(material => material.emissiveIntensity).sort((a, b) => a - b);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#252a32');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(1200, 800);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    document.body.append(renderer.domElement);
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.HemisphereLight('#c6e1ff', '#997763', 0.8));
    const light = new THREE.DirectionalLight('#fff1d4', 2); light.position.set(-3, 6, 5); scene.add(light);
    scene.add(car.group);
    const camera = new THREE.PerspectiveCamera(35, 1.5, 0.1, 100); camera.position.set(-5.3, 2.5, 6.6); camera.lookAt(0, 0.6, 0);
    renderer.render(scene, camera); const front = renderer.domElement.toDataURL('image/png');
    car.setOpacity(0.5); renderer.render(scene, camera);
    const fadingCastsShadow = meshes[0].some(mesh => mesh.castShadow);
    car.setOpacity(1); camera.position.set(5.3, 2.5, -6.6); camera.lookAt(0, 0.6, 0); renderer.render(scene, camera);
    return { colors, paintColors, tireMinima, wheels, lampsDuringBraking, lampsReleased, fadingCastsShadow,
      fleetCount: fleet.length, sharedGeometry: paints.every(list => list[0].geometry === paints[0][0].geometry),
      uniquePaint: new Set(paints.map(list => list[0].material)).size,
      flagVertices: meshes[0].find(mesh => mesh.name === 'Exact SORA flag body decals').geometry.getAttribute('position').count,
      triangles: meshes[0].reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0),
      vertices: meshes[0].reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0),
      drawCalls: renderer.info.render.calls, front, rear: renderer.domElement.toDataURL('image/png') };
  });
  for (const view of ['front', 'rear']) { await writeFile(`${output}/${view}.png`, Buffer.from(report[view].split(',')[1], 'base64')); delete report[view]; }
  await writeFile(`${output}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
  assert.deepEqual(errors, []);
  assert.equal(report.fleetCount, 8); assert.equal(report.uniquePaint, 8); assert.equal(report.sharedGeometry, true);
  assert.deepEqual(report.paintColors, report.colors.map(color => [color.slice(1)]));
  assert.equal(report.tireMinima.length, 4); assert(report.tireMinima.every(height => Math.abs(height) < 0.00001));
  assert.deepEqual(report.wheels.map(wheel => wheel.steer), [0.25, 0.25, 0, 0]);
  assert(report.wheels.every(wheel => wheel.spin > 0 && wheel.fixedCalipers.length === 1 && wheel.fixedCalipers[0].every(angle => angle === 0)));
  assert.deepEqual(report.lampsDuringBraking, [1.8, 2.1]); assert.deepEqual(report.lampsReleased, [0.1, 1.8]);
  assert.equal(report.fadingCastsShadow, false); assert(report.flagVertices > 0);
  assert(report.triangles > 700000); assert(report.vertices < report.triangles);
  console.log(`Detailed AE86: eight independent liveries, four grounded animated wheels, fixed calipers, separate brake/head lamps, shared indexed geometry and fade verified. ${output}/report.json`);
} finally { await browser.close(); }
