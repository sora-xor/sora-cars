import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = process.env.DRIVING_EFFECTS_TEST_OUT ?? 'output/browser/driving-effects-3d';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
const report = { base, errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.routeWebSocket(/.*/, socket => socket.send(JSON.stringify({ type: 'connected' })));
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => window.__effectsFreeze ? 0 : raf(time => { if (!window.__effectsFreeze) callback(time); });
  });
  await page.goto(`${base}/?picture=clean`);
  await page.waitForFunction(() => {
    const data = document.querySelector('#race-canvas')?.dataset;
    return window.soraCars && document.fonts.status === 'loaded' && data?.carAsset === 'detailed' && data?.sceneryAsset === 'detailed'
      && data?.lightingAsset === 'detailed' && data?.understoryAsset === 'detailed';
  }, null, { timeout: 60000 });
  report.setup = await page.evaluate(async () => {
    window.advanceTime(0); window.__effectsFreeze = true;
    window.soraCars.startPractice(); window.advanceTime(3400);
    const arcadeState = window.soraCars.state();
    await window.soraCars.startStreet(); window.advanceTime(0);
    const text = JSON.parse(window.render_game_to_text());
    if (!text.street?.fullStreetState) throw new Error('Native street state did not initialize');
    const loaded = path => performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname === path).at(-1)?.name ?? path;
    const [{ getRaceWorld }, { StreetRaceRenderer }, { RaceRenderer }, { loadStreetRoute }, { CONTROL }, THREE] = await Promise.all([
      import(loaded('/src/game/three/world.ts')), import(loaded('/src/game/street/renderer.ts')),
      import(loaded('/src/game/renderer.ts')), import(loaded('/src/game/street/assets.ts')),
      import(loaded('/src/game/rules.ts')), import('/node_modules/three/build/three.module.js'),
    ]);
    const { bundle } = await loadStreetRoute('tokyo-1986');
    const canvas = document.querySelector('#race-canvas'), world = getRaceWorld(canvas);
    const renderer = new StreetRaceRenderer(canvas), arcadeRenderer = new RaceRenderer(canvas);
    const state = structuredClone(text.street.fullStreetState), player = text.playerSlot;
    for (const [index, car] of state.cars.entries()) {
      car.status = index === player ? 0 : 1; car.bodyYawMicroturn = car.velocityYawMicroturn = 0; car.boosting = 0;
    }
    const marks = world.scene.getObjectByName('World-space tyre rubber'), puffs = world.scene.getObjectByName('Tyre smoke in world space');
    if (!marks || !puffs) throw new Error('Actual world-space driving effects are missing');
    const options = { playerSlot: player, names: text.names, controls: 0, hud: false, objects: bundle.objects, camera: 'chase', rain: 0 };
    const fixture = { world, canvas, renderer, arcadeRenderer, arcadeState, state, player, track: bundle.track, options, marks, puffs, CONTROL, THREE, draws: 0 };
    const trackBefore = JSON.stringify(fixture.track);
    fixture.draw = (time, changes = {}) => {
      const before = JSON.stringify(state);
      renderer.draw(fixture.track, state, { ...options, ...changes }, time);
      if (before !== JSON.stringify(state) || trackBefore !== JSON.stringify(fixture.track)) throw new Error('Effects rendering mutated native simulation or track');
      world.scene.updateMatrixWorld(true); fixture.draws++;
    };
    const checksum = array => {
      const data = new Uint8Array(array.buffer, array.byteOffset, array.byteLength); let hash = 2166136261;
      for (const byte of data) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
      return hash;
    };
    fixture.snapshot = () => ({ markVertices: marks.geometry.drawRange.count,
      markPositions: checksum(marks.geometry.attributes.position.array), markBirths: checksum(marks.geometry.attributes.birth.array),
      smokePositions: checksum(puffs.geometry.attributes.origin.array), smokeBirths: checksum(puffs.geometry.attributes.particleBirth.array),
      liveSmoke: [...puffs.geometry.attributes.particleBirth.array].filter(birth => birth >= 0 && puffs.material.uniforms.time.value - birth <= 1.45).length,
      smokeVisible: puffs.visible, time: puffs.material.uniforms.time.value });
    fixture.run = ({ progress = 100000, start = 10, frames = 36, slip = 0, controls = 0, speed = 900, wet = false }) => {
      world.effects.reset();
      const car = state.cars[player]; car.progressMm = progress; car.lateralMm = 0; car.speedMmPerTick = speed;
      car.bodyYawMicroturn = slip; car.velocityYawMicroturn = 0; car.status = 0;
      for (let frame = 0; frame < frames; frame++) {
        state.tick = Math.round(start * 30) + frame;
        car.progressMm = progress + frame * speed;
        fixture.draw(state.tick / 30, { controls, rain: wet ? 1 : 0 });
      }
      fixture.lastControls = controls; fixture.lastWet = wet;
      return fixture.snapshot();
    };
    window.__effects = fixture;
    const gl = world.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), player,
      tyreContacts: world.cars[player].group.userData.rearTyreContacts, canvas: [canvas.width, canvas.height], track: bundle.track.id, assets: { ...canvas.dataset } };
  });
  if (process.platform === 'darwin') assert.match(report.setup.gpu, /Metal/);
  const capture = async name => {
    const png = await page.evaluate(() => window.__effects.canvas.toDataURL('image/png').split(',')[1]);
    await writeFile(`${out}/${name}.png`, Buffer.from(png, 'base64'));
  };

  report.straight = await page.evaluate(() => window.__effects.run({ start: 10 }));
  report.drift = await page.evaluate(() => window.__effects.run({ start: 20, slip: 30000 }));
  await capture('dry-drift');
  report.visibility = await page.evaluate(() => {
    const f = window.__effects, gl = f.world.renderer.getContext(), size = f.world.canvas.width * f.world.canvas.height * 4;
    const render = () => {
      f.world.pass.render(f.world.scene, f.world.camera, f.canvas.width, f.canvas.height, f.state.tick / 30);
      const pixels = new Uint8Array(size); gl.readPixels(0, 0, f.world.canvas.width, f.world.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels;
    };
    const before = render();
    const compare = mesh => {
      const visible = mesh.visible; mesh.visible = false; const after = render(); mesh.visible = visible;
      let changedPixels = 0, difference = 0, maximum = 0;
      for (let offset = 0; offset < size; offset += 4) {
        let changed = false;
        for (let channel = 0; channel < 3; channel++) {
          const delta = Math.abs(before[offset + channel] - after[offset + channel]); difference += delta; maximum = Math.max(maximum, delta); changed ||= delta > 0;
        }
        if (changed) changedPixels++;
      }
      return { changedPixels, meanChannelDifference: difference / (size * 0.75), maximum };
    };
    const rubber = compare(f.marks), smoke = compare(f.puffs); f.draw(f.state.tick / 30);
    return { rubber, smoke };
  });
  report.paused = await page.evaluate(() => {
    const f = window.__effects, before = f.snapshot();
    for (let frame = 0; frame < 12; frame++) f.draw(200 + frame, { paused: true });
    return { before, after: f.snapshot() };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.__effects.world.reduced.matches);
  report.reduced = await page.evaluate(() => {
    const f = window.__effects, before = f.snapshot();
    f.draw(400, { paused: true });
    const sameFrame = f.snapshot();
    f.state.tick++; f.state.cars[f.player].progressMm += 900; f.draw(f.state.tick / 30);
    return { before, sameFrame, followingFrame: f.snapshot() };
  });
  await capture('reduced-motion-marks');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => !window.__effects.world.reduced.matches);

  report.brake = await page.evaluate(() => { const f = window.__effects; return f.run({ start: 30, speed: 1100, controls: f.CONTROL.brake }); });
  await capture('dry-brake');
  report.slow = await page.evaluate(() => window.__effects.run({ start: 35, speed: 200, slip: 30000 }));
  report.wet = await page.evaluate(() => window.__effects.run({ start: 40, slip: 30000, wet: true }));
  await capture('wet-drift');
  report.rewind = await page.evaluate(() => {
    const f = window.__effects; f.run({ start: 50, slip: 30000 });
    f.state.cars[f.player].progressMm -= 50000; f.state.cars[f.player].bodyYawMicroturn = 0;
    f.state.tick -= 30; f.draw(f.state.tick / 30);
    return f.snapshot();
  });
  report.courseChange = await page.evaluate(() => {
    const f = window.__effects; f.run({ start: 60, slip: 30000 });
    const arcade = structuredClone(f.arcadeState);
    const before = JSON.stringify(arcade);
    f.arcadeRenderer.draw(arcade, { playerSlot: 0, names: [], skins: arcade.cars.map(() => 0), controls: 0, hud: false }, 70);
    if (JSON.stringify(arcade) !== before) throw new Error('Course change mutated native arcade state');
    return f.snapshot();
  });
  report.grade = await page.evaluate(() => {
    const f = window.__effects, { THREE, track } = f;
    const oil = f.options.objects.find(object => object.id === 'kudanzaka-oil');
    const start = oil ? oil.progressMm - 60000 : track.samples[Math.floor(track.samples.length / 3)].progressMm;
    const snapshot = f.run({ start: 80, progress: start, slip: 24000, speed: 850 });
    const road = f.world.road.children.find(mesh => mesh.material === f.world.roadMaterial);
    if (!road) throw new Error('Native road mesh missing');
    const vertices = f.marks.geometry.attributes.position, ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    let misses = 0, minClearance = Infinity, maxClearance = -Infinity, minHeight = Infinity, maxHeight = -Infinity;
    for (let vertex = 0; vertex < snapshot.markVertices; vertex++) {
      const point = new THREE.Vector3().fromBufferAttribute(vertices, vertex);
      minHeight = Math.min(minHeight, point.y); maxHeight = Math.max(maxHeight, point.y);
      ray.set(point.clone().add(new THREE.Vector3(0, 20, 0)), down);
      const hit = ray.intersectObject(road, false)[0];
      if (!hit) { misses++; continue; }
      const clearance = point.y - hit.point.y; minClearance = Math.min(minClearance, clearance); maxClearance = Math.max(maxClearance, clearance);
    }
    return { ...snapshot, sourceProgress: start, misses, minClearance, maxClearance, heightRange: maxHeight - minHeight, nativeImmutableDraws: f.draws };
  });
  await capture('graded-drift');
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  assert.deepEqual(report.errors, []);
  assert.equal(report.straight.markVertices, 0); assert.equal(report.straight.liveSmoke, 0);
  assert(report.drift.markVertices > 100); assert(report.drift.liveSmoke > 0);
  assert(report.visibility.rubber.changedPixels > 100, 'The 3D rubber geometry must contribute visible pixels');
  assert(report.visibility.smoke.changedPixels > 100, 'The world-space smoke must contribute visible pixels');
  assert(report.visibility.smoke.meanChannelDifference < 1, 'The smoke should remain a subtle effect over the source scene');
  assert.deepEqual(report.paused.after, report.paused.before, 'Paused repeated draws must not emit or age effects');
  assert.equal(report.reduced.sameFrame.smokeVisible, false, 'Reduced motion must hide puffs immediately, including while paused');
  assert.equal(report.reduced.sameFrame.markVertices, report.reduced.before.markVertices);
  assert.equal(report.reduced.followingFrame.smokeBirths, report.reduced.before.smokeBirths, 'Reduced motion must not emit new moving puffs');
  assert(report.reduced.followingFrame.markVertices >= report.reduced.before.markVertices);
  assert(report.brake.markVertices > 100); assert(report.brake.liveSmoke > 0);
  assert.equal(report.slow.markVertices, 0); assert.equal(report.slow.liveSmoke, 0);
  assert.equal(report.wet.markVertices, 0); assert(report.wet.liveSmoke > 0);
  for (const key of ['rewind', 'courseChange']) { assert.equal(report[key].markVertices, 0, key); assert.equal(report[key].liveSmoke, 0, key); }
  assert(report.grade.markVertices > 100); assert.equal(report.grade.misses, 0);
  assert(report.grade.heightRange > 0.2, 'Grade fixture must contain an actual elevation change');
  assert(report.grade.minClearance >= -0.001 && report.grade.maxClearance <= 0.025, 'Rubber must follow and remain above the rendered native road');
  console.log(`3D tyre effects verified; ${report.grade.nativeImmutableDraws} immutable native-snapshot draws. ${out}/report.json`);
} finally { await browser.close(); }
