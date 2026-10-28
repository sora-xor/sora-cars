import { launchChromium } from './lib/browser-launch.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Run against Vite so inspection uses the exact modules loaded by the app.
// RENDERER_BROWSER_ARGS accepts a JSON string array for another GPU/backend.
const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = process.env.RENDERER_TEST_OUT ?? 'output/browser/renderer-3d';
const browserArgs = process.env.RENDERER_BROWSER_ARGS
  ? JSON.parse(process.env.RENDERER_BROWSER_ARGS) : process.platform === 'darwin' ? ['--use-angle=metal'] : [];
assert.ok(Array.isArray(browserArgs) && browserArgs.every(arg => typeof arg === 'string'));
await mkdir(out, { recursive: true });
const browser = await launchChromium({ headless: process.env.RENDERER_HEADFUL !== '1',
  channel: process.env.RENDERER_BROWSER_CHANNEL ?? 'chromium', args: browserArgs });
const errors = [], report = { url, browserArgs, cameras: [] };

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, socket => socket.send(JSON.stringify({ type: 'connected' })));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    const schedule = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => window.__rendererTestFreeze ? 0 : schedule(time => {
      if (!window.__rendererTestFreeze) callback(time);
    });
  });
  await page.goto(url);
  await page.waitForFunction(() => window.soraCars && document.fonts.status === 'loaded');
  await page.waitForFunction(() => {
    const data = document.querySelector('#race-canvas')?.dataset;
    return data?.carAsset === 'detailed' && data?.sceneryAsset === 'detailed' && data?.lightingAsset === 'detailed' && data?.understoryAsset === 'detailed' && data?.groundAsset === 'detailed';
  }, null, { timeout: 60000 });
  report.setup = await page.evaluate(async () => {
    window.advanceTime(0);
    window.soraCars.startPractice();
    window.advanceTime(3400);
    const arcadeState = window.soraCars.state(), arcadeText = JSON.parse(window.render_game_to_text());
    await window.soraCars.startStreet();
    window.advanceTime(0);
    // The local preparation gate resolves after a complete current-course
    // frame. Freeze rendering only after that frame has actually been drawn.
    window.__rendererTestFreeze = true;
    const streetText = JSON.parse(window.render_game_to_text());
    if (!streetText.street?.fullStreetState) throw new Error('Actual street session did not initialize');
    const loaded = path => performance.getEntriesByType('resource')
      .filter(entry => new URL(entry.name).pathname === path).at(-1)?.name ?? path;
    const worldUrl = loaded('/src/game/three/world.ts');
    const [{ getRaceWorld }, { RaceRenderer }, { StreetRaceRenderer }, { loadStreetRoute }] = await Promise.all([
      import(worldUrl), import(loaded('/src/game/renderer.ts')),
      import(loaded('/src/game/street/renderer.ts')), import(loaded('/src/game/street/assets.ts')),
    ]);
    const { bundle } = await loadStreetRoute('tokyo-1986');
    const canvas = document.querySelector('#race-canvas');
    if (canvas.dataset.renderer !== 'webgl-3d') throw new Error('Actual app used Canvas compatibility rendering');
    const world = getRaceWorld(canvas);
    if (!world) throw new Error('Loaded app has no WebGL world');
    const arcadeRenderer = new RaceRenderer(canvas), streetRenderer = new StreetRaceRenderer(canvas);
    const arcadeOptions = { playerSlot: arcadeText.playerSlot, names: arcadeText.names,
      skins: arcadeState.cars.map((_, i) => i % 6), controls: 0, hud: true, countdown: 2 };
    const streetOptions = { playerSlot: streetText.playerSlot, names: streetText.names,
      controls: 0, hud: true, objects: bundle.objects, rain: 0 };
    const gl = world.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const fixture = { world, canvas, arcadeRenderer, streetRenderer, arcadeOptions, streetOptions,
      arcadeState, streetState: structuredClone(streetText.street.fullStreetState), track: bundle.track, objects: bundle.objects };
    // Every direct draw receives a detached native snapshot and verifies that
    // presentation never writes back into any car, clock, mask or track field.
    fixture.draw = (mode, camera, state = structuredClone(mode === 'arcade' ? fixture.arcadeState : fixture.streetState), track = fixture.track, time = state.tick / 30) => {
      const before = JSON.stringify(state), geometryBefore = mode === 'street' ? JSON.stringify(track) : null;
      if (mode === 'arcade') arcadeRenderer.draw(state, { ...arcadeOptions, camera }, time);
      else streetRenderer.draw(track, state, { ...streetOptions, camera }, time);
      if (before !== JSON.stringify(state) || geometryBefore !== null && geometryBefore !== JSON.stringify(track)) {
        throw new Error(`${mode}/${camera} changed native input`);
      }
      world.scene.updateMatrixWorld(true);
      return state;
    };
    window.__renderer3d = fixture;
    return { gpu, worldUrl, arcadeCars: arcadeState.cars.length, streetCars: fixture.streetState.cars.length,
      dimensions: [canvas.width, canvas.height] };
  });
  if (process.platform === 'darwin' && !process.env.RENDERER_BROWSER_ARGS) {
    assert.match(report.setup.gpu, /Metal/i, 'macOS hardware check must use Metal, not SwiftShader');
  }
  await page.waitForFunction(() => {
    const world = window.__renderer3d?.world;
    const textures = world?.groundTextures;
    return world?.flag.image?.complete && world.roadMaterial.map?.image?.complete && world.scene.environment
      && textures?.length === 6 && textures.every(texture => {
        const image = texture.image;
        return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
      });
  }, null, { polling: 100, timeout: 60000 });

  for (const mode of ['arcade', 'street']) for (const camera of ['chase', 'bumper', 'aerial']) {
    const frame = await page.evaluate(({ mode, camera }) => {
      const f = window.__renderer3d, { world, canvas } = f, ctx = canvas.getContext('2d');
      const labels = [], fillText = ctx.fillText;
      ctx.fillText = function (text, ...rest) { labels.push(String(text)); return fillText.call(this, text, ...rest); };
      world.renderer.info.autoReset = false; world.renderer.info.reset();
      try { f.draw(mode, camera); } finally { ctx.fillText = fillText; world.renderer.info.autoReset = true; }
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height), colors = new Set();
      let checksum = 2166136261;
      for (let y = 2; y < canvas.height; y += 13) for (let x = 2; x < canvas.width; x += 13) {
        const offset = (y * canvas.width + x) * 4, rgb = [...image.data.slice(offset, offset + 3)];
        colors.add(rgb.map(v => v >>> 4).join(','));
        for (const byte of rgb) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
      }
      return { mode, camera, colors: colors.size, checksum, labels,
        followedAmbientOpacity: world.vehicleAmbient.cars[(mode === 'arcade' ? f.arcadeOptions : f.streetOptions).playerSlot].w,
        drawCalls: world.renderer.info.render.calls, triangles: world.renderer.info.render.triangles,
        glError: world.renderer.getContext().getError(), canvas: [canvas.width, canvas.height],
        webglCanvas: [world.canvas.width, world.canvas.height], cameraPosition: world.camera.position.toArray(),
        renderStyle: canvas.dataset.renderStyle };
    }, { mode, camera });
    assert.equal(frame.glError, 0, `${mode}/${camera} WebGL error`);
    assert.equal(frame.followedAmbientOpacity, 1, `${mode}/${camera} keeps the physical player's ambient field, including the hidden bumper body`);
    assert.ok(frame.colors > 16 && frame.drawCalls > 2 && frame.triangles > 1000, `${mode}/${camera} renders actual 3D detail`);
    assert.deepEqual(frame.canvas, frame.webglCanvas, 'WebGL output follows the shared display resolution');
    // Pixel finish is on by default, so the default route draws the pixel-art renderer (docs/pixel-art-renderer.md).
    assert.equal(frame.renderStyle, 'pixel-art', `${mode}/${camera} default Pixel finish uses the pixel-art renderer`);
    assert.ok(frame.labels.includes('KM/H'), `${mode}/${camera} retains HUD`);
    if (mode === 'arcade') assert.ok(frame.labels.includes('2'), 'countdown survives all arcade cameras');
    // Preserve the rendered canvas exactly; a DOM intro panel must not obscure
    // the six renderer fixtures in the visual-review artifacts.
    const png = await page.evaluate(() => window.__renderer3d.canvas.toDataURL('image/png').split(',')[1]);
    await writeFile(`${out}/${mode}-${camera}.png`, Buffer.from(png, 'base64'));
    report.cameras.push(frame);
  }
  for (const mode of ['arcade', 'street']) {
    assert.equal(new Set(report.cameras.filter(frame => frame.mode === mode).map(frame => frame.checksum)).size, 3,
      `${mode} camera choices must produce three distinct frames`);
  }

  // A live probe must finish its six scene faces and publish roughness-filtered
  // nearby radiance to real car materials, without changing native state.
  const reflection = await page.evaluate(() => {
    const f = window.__renderer3d, { world, canvas } = f, ctx = canvas.getContext('2d');
    world.localCarReflections.invalidate();
    f.draw('street', 'chase');
    const before = ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice();
    const beforeReady = canvas.dataset.localReflectionReady;
    for (let i = 0; i < 7; i++) f.draw('street', 'chase');
    const after = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let changedPixels = 0, totalDifference = 0;
    for (let i = 0; i < after.length; i += 4) {
      const difference = Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1]) + Math.abs(after[i + 2] - before[i + 2]);
      if (difference > 3) changedPixels++;
      totalDifference += difference;
    }
    const bound = new Set();
    for (const car of world.cars) car.group.traverse(object => {
      if (object.isMesh && object.material?.envMap?.name === 'SORA local reflection roughness-filtered radiance') bound.add(object.material);
    });
    return { beforeReady, afterReady: canvas.dataset.localReflectionReady,
      generations: Number(canvas.dataset.localReflectionGenerations), boundMaterials: bound.size,
      changedPixels, meanRgbDifference: totalDifference / (after.length / 4),
      glError: world.renderer.getContext().getError() };
  });
  assert.equal(reflection.beforeReady, 'false', 'fresh probe has not been published');
  assert.equal(reflection.afterReady, 'true', 'six face captures publish the local probe');
  assert.ok(reflection.generations > 0 && reflection.boundMaterials > 0, 'actual car paint/glass bind the probe');
  assert.ok(reflection.changedPixels > 100, 'nearby 3D radiance changes the displayed car image');
  assert.equal(reflection.glError, 0, 'local probe has no WebGL error');
  report.reflection = reflection;
  const reflectionPng = await page.evaluate(() => window.__renderer3d.canvas.toDataURL('image/png').split(',')[1]);
  await writeFile(`${out}/street-chase-local-reflection.png`, Buffer.from(reflectionPng, 'base64'));

  report.geometry = await page.evaluate(async () => {
    const f = window.__renderer3d, { world, track } = f;
    const THREE = await import('/node_modules/three/build/three.module.js');
    const state = structuredClone(f.streetState), slot = f.streetOptions.playerSlot, car = state.cars[slot];
    const wrap = p => ((p % track.lengthMm) + track.lengthMm) % track.lengthMm;
    const nativePose = progress => {
      const p = wrap(progress), samples = track.samples;
      let lo = 0, hi = samples.length - 1;
      while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (samples[mid].progressMm <= p) lo = mid; else hi = mid; }
      const a = samples[lo], b = samples[hi], t = (p - a.progressMm) / (b.progressMm - a.progressMm);
      const interpolate = key => a[key] + (b[key] - a[key]) * t;
      return { x: -interpolate('eastMm') / 1000, y: interpolate('elevationMm') / 1000,
        z: interpolate('northMm') / 1000, heading: interpolate('headingMicroturn') * Math.PI * 2 / 1e6 };
    };
    const nativePoint = (progress, lateral) => {
      const p = nativePose(progress);
      return new THREE.Vector3(p.x - Math.cos(p.heading) * lateral / 1000, p.y,
        p.z - Math.sin(p.heading) * lateral / 1000);
    };
    car.progressMm = 240000; car.lateralMm = -3200; car.bodyYawMicroturn = 62500;
    f.draw('street', 'bumper', state);
    const expectedCar = nativePoint(car.progressMm, car.lateralMm).add(new THREE.Vector3(0, 0.003, 0));
    const yaw = -(nativePose(car.progressMm).heading + car.bodyYawMicroturn * Math.PI * 2 / 1e6);
    const expectedBumper = nativePoint(car.progressMm, car.lateralMm)
      .add(new THREE.Vector3(Math.sin(yaw) * 1.9, 0.88, Math.cos(yaw) * 1.9));
    const signedLateralError = world.cars[slot].group.position.distanceTo(expectedCar);
    const bumperAnchorError = world.camera.position.distanceTo(expectedBumper);
    f.draw('street', 'chase', state); const firstLap = world.cars[slot].group.position.clone();
    car.progressMm += track.lengthMm; f.draw('street', 'chase', state);
    const circuitPositionError = firstLap.distanceTo(world.cars[slot].group.position);

    const snapshot = () => new Map([...world.buildings, ...world.apartments, ...world.trees, ...world.forest, ...world.woodland, ...world.lamps]
      .filter(group => group.visible).map(group => [group.uuid, { station: group.userData.raceSceneryStation,
        matrix: (group.updateMatrix(), group.matrix.elements.slice()) }]));
    const stable = (before, after) => {
      let retained = 0, shifted = 0;
      for (const [id, previous] of before) {
        const next = after.get(id);
        if (next?.station !== previous.station) continue;
        retained++;
        if (previous.matrix.some((value, i) => Math.abs(value - next.matrix[i]) > 1e-8)) shifted++;
      }
      return { retained, shifted };
    };
    car.progressMm = 19900; f.draw('street', 'chase', state); const a = snapshot();
    car.progressMm = 20100; f.draw('street', 'chase', state); const b = snapshot();
    car.progressMm = track.lengthMm - 10100; f.draw('street', 'chase', state); const c = snapshot();
    car.progressMm = track.lengthMm + 10100; f.draw('street', 'chase', state); const d = snapshot();

    const oil = f.objects.find(object => object.id === 'kudanzaka-oil');
    if (!oil) throw new Error('Missing graded native oil fixture');
    car.progressMm = oil.progressMm - 50000; f.draw('street', 'aerial', state);
    const oilMesh = world.hazards.get(`street-${oil.id}`), road = world.road.children.find(mesh => mesh.material === world.roadMaterial);
    if (!oilMesh?.visible || !road) throw new Error('Native oil/road geometry is missing');
    const vertices = oilMesh.geometry.getAttribute('position'), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    const points = []; let missedRoad = 0, minimumClearance = Infinity, maximumClearance = -Infinity;
    for (let i = 0; i < vertices.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(oilMesh.matrixWorld); points.push(point);
      ray.set(point.clone().add(new THREE.Vector3(0, 20, 0)), down);
      const hit = ray.intersectObject(road, false)[0];
      if (!hit) { missedRoad++; continue; }
      const clearance = point.y - hit.point.y;
      minimumClearance = Math.min(minimumClearance, clearance); maximumClearance = Math.max(maximumClearance, clearance);
    }
    const nativeEdges = [nativePoint(oil.progressMm - oil.halfLengthMm, oil.lateralMm),
      nativePoint(oil.progressMm + oil.halfLengthMm, oil.lateralMm),
      nativePoint(oil.progressMm, oil.lateralMm - oil.halfWidthMm), nativePoint(oil.progressMm, oil.lateralMm + oil.halfWidthMm)];
    const footprintEdgeError = Math.max(...nativeEdges.map(edge => Math.min(...points.map(point => Math.hypot(point.x - edge.x, point.z - edge.z)))));
    const signIndex = f.objects.findIndex(object => object.kind === 'breakaway_sign'), sign = f.objects[signIndex];
    car.progressMm = sign.progressMm - 30000; state.worldBrokenMask = 0; f.draw('street', 'chase', state);
    const intactSign = world.hazards.get(`street-${sign.id}`).visible;
    state.worldBrokenMask = 2 ** signIndex; f.draw('street', 'chase', state);
    const brokenSignHidden = !world.hazards.get(`street-${sign.id}`).visible;

    const opponent = (slot + 1) % state.cars.length;
    state.cars[opponent].progressMm = car.progressMm + 5000;
    state.cars[opponent].status = 1; car.status = 0;
    f.draw('street', 'chase', state);
    const finishedOpponentHidden = !world.cars[opponent].group.visible;
    const finishedAmbientCleared = world.vehicleAmbient.cars[opponent].w === 0;
    car.status = 1; f.draw('street', 'chase', state);
    const followedFinisherVisible = world.cars[slot].group.visible;
    const followedFinisherAmbientRetained = world.vehicleAmbient.cars[slot].w === 1;
    car.status = 0;
    const arcade = structuredClone(f.arcadeState), arcadeSlot = f.arcadeOptions.playerSlot;
    const dnfSlot = (arcadeSlot + 1) % arcade.cars.length;
    arcade.cars[dnfSlot].progress = arcade.cars[arcadeSlot].progress + 5000;
    arcade.cars[dnfSlot].dnf = true; arcade.cars[dnfSlot].dnfTick = arcade.tick;
    f.draw('arcade', 'chase', arcade);
    const dnfOpponentHidden = !world.cars[dnfSlot].group.visible;
    const dnfAmbientCleared = world.vehicleAmbient.cars[dnfSlot].w === 0;
    arcade.cars[dnfSlot].dnf = false; arcade.cars[dnfSlot].dnfTick = null;
    arcade.cars[dnfSlot].finishTick = null;
    arcade.cars[dnfSlot].x = arcade.cars[arcadeSlot].x;
    arcade.cars[dnfSlot].progress = arcade.cars[arcadeSlot].progress - 4000;
    f.draw('arcade', 'chase', arcade);
    const corridorAmbientCleared = !world.cars[dnfSlot].group.visible && world.vehicleAmbient.cars[dnfSlot].w === 0;
    arcade.cars[dnfSlot].x = arcade.cars[arcadeSlot].x + 500000;
    f.draw('arcade', 'chase', arcade);
    const distantAmbientCleared = !world.cars[dnfSlot].group.visible && world.vehicleAmbient.cars[dnfSlot].w === 0;

    // A real native sample prefix is also a useful open-road endpoint fixture.
    const samples = track.samples.slice(0, 61), endpoint = samples.at(-1).progressMm;
    const sprint = { ...track, id: 'renderer-endpoint-fixture', topology: 'sprint', samples, lengthMm: endpoint,
      gates: track.gates.filter(gate => gate.sample < samples.length) };
    car.progressMm = endpoint; car.lateralMm = 0; state.worldBrokenMask = 0;
    const terminalCameras = [];
    for (const camera of ['chase', 'bumper', 'aerial']) {
      f.draw('street', camera, state, sprint);
      terminalCameras.push({ camera, values: [...world.camera.position.toArray(), ...world.camera.projectionMatrix.elements],
        carPosition: world.cars[slot].group.position.toArray() });
    }
    return { signedLateralError, bumperAnchorError, circuitPositionError, twentyMetreBoundary: stable(a, b),
      lapBoundary: stable(c, d), oil: { vertices: vertices.count, missedRoad, minimumClearance, maximumClearance, footprintEdgeError },
      intactSign, brokenSignHidden, finishedOpponentHidden, followedFinisherVisible, dnfOpponentHidden,
      ambientLifecycle: { finishedAmbientCleared, followedFinisherAmbientRetained, dnfAmbientCleared, corridorAmbientCleared, distantAmbientCleared },
      terminalCameras, endpointPosition: [-samples.at(-1).eastMm / 1000,
        samples.at(-1).elevationMm / 1000 + 0.003, samples.at(-1).northMm / 1000] };
  });
  const geometry = report.geometry;
  for (const key of ['signedLateralError', 'bumperAnchorError', 'circuitPositionError']) assert.ok(geometry[key] < 0.0001, key);
  for (const boundary of [geometry.twentyMetreBoundary, geometry.lapBoundary]) {
    assert.ok(boundary.retained >= 20, 'inspect enough unchanged scenery instances');
    assert.equal(boundary.shifted, 0, 'retained scenery never teleports');
  }
  assert.equal(geometry.oil.missedRoad, 0);
  assert.ok(geometry.oil.minimumClearance > 0 && geometry.oil.maximumClearance < 0.06, 'entire oil footprint sits just above actual road triangles');
  assert.ok(geometry.oil.footprintEdgeError < 0.02, 'oil visibly covers all four native footprint extents');
  assert.ok(geometry.intactSign && geometry.brokenSignHidden, 'native broken mask removes only the broken prop');
  assert.ok(geometry.finishedOpponentHidden && geometry.followedFinisherVisible && geometry.dnfOpponentHidden,
    'retired opponents leave the road while a followed finisher remains visible');
  for (const [key, value] of Object.entries(geometry.ambientLifecycle)) assert.equal(value, true, key);
  for (const terminal of geometry.terminalCameras) {
    assert.ok(terminal.values.every(Number.isFinite), `${terminal.camera} endpoint camera stays finite`);
    assert.ok(terminal.carPosition.every((value, i) => Math.abs(value - geometry.endpointPosition[i]) < 0.0001), 'sprint endpoint never wraps');
  }

  report.resources = await page.evaluate(() => {
    const f = window.__renderer3d, samples = [];
    for (let cycle = 0; cycle < 4; cycle++) {
      const street = structuredClone(f.streetState);
      street.cars[f.streetOptions.playerSlot].progressMm = 244958;
      f.draw('street', 'chase', street);
      for (const trackId of [1, 2, 0]) {
        const arcade = structuredClone(f.arcadeState); arcade.trackId = trackId;
        f.draw('arcade', 'chase', arcade);
      }
      samples.push({ geometries: f.world.renderer.info.memory.geometries, textures: f.world.renderer.info.memory.textures,
        programs: f.world.renderer.info.programs.length });
    }
    return samples;
  });
  assert.deepEqual(report.resources[2], report.resources[1], 'GPU resources plateau after one complete warm course cycle');
  assert.deepEqual(report.resources[3], report.resources[2], 'repeated course switches do not leak GPU resources');

  report.motion = [];
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion });
    report.motion.push(await page.evaluate(reducedMotion => {
      const f = window.__renderer3d, state = structuredClone(f.arcadeState), car = state.cars[f.arcadeOptions.playerSlot];
      car.speed = 2600; car.energy = 1000;
      const before = JSON.stringify(state); f.arcadeOptions.controls = 16;
      const time = reducedMotion === 'reduce' ? 200 : 100;
      for (let i = 0; i < 12; i++) f.draw('arcade', 'chase', state, f.track, time + i / 30);
      f.arcadeOptions.controls = 0;
      const result = { reducedMotion, matches: f.world.reduced.matches, before, after: JSON.stringify(state),
        fov: f.world.camera.fov, carPosition: f.world.cars[f.arcadeOptions.playerSlot].group.position.toArray() };
      return result;
    }, reducedMotion));
  }
  for (const motion of report.motion) assert.equal(motion.after, motion.before, `${motion.reducedMotion} never changes native state`);
  assert.equal(report.motion[1].matches, true);
  assert.ok(report.motion[1].fov < report.motion[0].fov, 'reduced motion suppresses the speed/boost camera expansion');
  assert.deepEqual(report.motion[0].carPosition, report.motion[1].carPosition, 'reduced motion preserves native world position');
  assert.equal(report.motion[0].after, report.motion[1].after, 'motion preferences preserve every native field');
  assert.deepEqual(errors, [], 'no browser or shader errors');
  report.errors = errors;
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(`3D renderer checks passed: six cameras, HUD, native positions/state, graded hazards, stable scenery, endpoint cameras, resources and reduced motion. GPU: ${report.setup.gpu}`);
} catch (error) {
  await writeFile(`${out}/failure.json`, JSON.stringify({ ...report, errors, failure: String(error) }, null, 2));
  throw error;
} finally {
  await browser.close();
}
