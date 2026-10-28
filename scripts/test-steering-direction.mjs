import assert from 'node:assert/strict';
import { launchChromium } from './lib/browser-launch.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Run against Vite to inspect the exact world already used by the real app.
// STEERING_EXPECT_BROKEN=1 records the historical regression without hiding it.
const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = process.env.STEERING_TEST_OUT ?? 'output/browser/steering-direction';
const expectBroken = process.env.STEERING_EXPECT_BROKEN === '1';
await mkdir(out, { recursive: true });
const browser = await launchChromium({ headless: true, channel: 'chromium',
  args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
const report = { url, expectBroken, sourceSha256: createHash('sha256').update(await readFile('src/game/three/world.ts')).digest('hex'),
  keyboard: [], projection: [], errors: [], checks: [], failures: [] };
const check = (condition, label) => (condition ? report.checks : report.failures).push(label);
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, socket => socket.send(JSON.stringify({ type: 'connected' })));
  await page.addInitScript(() => {
    const schedule = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => window.__steeringFreeze ? 0 : schedule(time => {
      if (!window.__steeringFreeze) callback(time);
    });
  });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.soraCars && document.fonts.status === 'loaded');
  await page.evaluate(() => window.advanceTime(0));
  const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const advance = ms => page.evaluate(ms => window.advanceTime(ms), ms);
  const ready = () => page.waitForFunction(() => {
    const s = JSON.parse(window.render_game_to_text());
    return s.graphics.status === 'ready' && !s.graphics.preparing && (s.mode !== 'street' || s.street.phase === 'ready');
  }, null, { timeout: 90000, polling: 100 });

  for (const mode of ['arcade', 'street']) {
    for (const [key, bit, direction] of [['ArrowLeft', 4, -1], ['ArrowRight', 8, 1]]) {
      if (mode === 'arcade') await page.evaluate(() => window.soraCars.startPractice());
      else await page.evaluate(() => window.soraCars.startStreet());
      await ready();
      if (mode === 'street') await page.locator('[data-action="street-start"]').click();
      await advance(3400);
      await page.keyboard.down('ArrowUp'); await advance(1000);
      const before = await read();
      await page.keyboard.down(key); await advance(300);
      const after = await read();
      await page.keyboard.up(key); await page.keyboard.up('ArrowUp');
      const lateral = s => mode === 'arcade' ? s.player.x : s.player.lateralMm;
      const controls = mode === 'arcade' ? after.controls : after.street.controls;
      const item = { mode, key, direction, controls, before: lateral(before), after: lateral(after),
        delta: lateral(after) - lateral(before), tickBefore: before.tick, tickAfter: after.tick,
        state: mode === 'arcade' ? await page.evaluate(() => window.soraCars.state()) : after.street.fullStreetState,
        playerSlot: after.playerSlot, names: after.names };
      report.keyboard.push(item);
      check(controls === (1 | bit), `${mode} ${key}: real keyboard preserves canonical throttle and steering bits`);
      check(item.delta * direction > 0 && item.tickAfter > item.tickBefore, `${mode} ${key}: native movement follows the requested side`);
      await page.screenshot({ path: `${out}/${mode}-${key}.png` });
    }
  }
  report.setup = await page.evaluate(async snapshots => {
    window.__steeringFreeze = true;
    const loaded = path => performance.getEntriesByType('resource')
      .filter(entry => new URL(entry.name).pathname === path).at(-1)?.name ?? path;
    const [{ getRaceWorld }, { RaceRenderer }, { StreetRaceRenderer }, { loadStreetRoute }] = await Promise.all([
      import(loaded('/src/game/three/world.ts')), import(loaded('/src/game/renderer.ts')),
      import(loaded('/src/game/street/renderer.ts')), import(loaded('/src/game/street/assets.ts')),
    ]);
    const { bundle } = await loadStreetRoute('tokyo-1986');
    const canvas = document.querySelector('#race-canvas'), world = getRaceWorld(canvas);
    if (!world || canvas.dataset.renderer !== 'webgl-3d') throw new Error('Actual application did not use the detailed WebGL world');
    // Obtain vectors from the world's own constructor, avoiding a second Three instance.
    const Vec = world.camera.position.constructor;
    const arcade = new RaceRenderer(canvas), street = new StreetRaceRenderer(canvas);
    window.__steering = { world, Vec, snapshots, bundle, canvas,
      draw(mode, state, camera, controls = 0) {
        const snapshot = snapshots.find(s => s.mode === mode), before = JSON.stringify(state), routeBefore = JSON.stringify(bundle.track);
        const options = { camera, playerSlot: snapshot.playerSlot, names: snapshot.names,
          skins: state.cars.map((_, i) => i % 6), controls, hud: true, objects: bundle.objects, rain: 0 };
        if (mode === 'arcade') arcade.draw(state, options, state.tick / 30);
        else street.draw(bundle.track, state, options, state.tick / 30);
        world.scene.updateMatrixWorld(true); world.camera.updateMatrixWorld(true);
        if (JSON.stringify(state) !== before || JSON.stringify(bundle.track) !== routeBefore) throw new Error('Rendering changed native state or route');
      },
    };
    const gl = world.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { worldUrl: loaded('/src/game/three/world.ts'), gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      carAsset: canvas.dataset.carAsset, dimensions: [canvas.width, canvas.height] };
  }, report.keyboard);
  console.log(JSON.stringify({ stage: 'actual keyboard and loaded world captured', setup: report.setup,
    keyboard: report.keyboard.map(({ state, names, ...item }) => item) }));
  await writeFile(`${out}/keyboard-baseline.json`, JSON.stringify(report, null, 2));

  for (const mode of ['arcade', 'street']) for (const checkpoint of [0, 240000]) for (const camera of ['chase', 'bumper', 'aerial']) {
    const sample = await page.evaluate(({ mode, checkpoint, camera }) => {
      const f = window.__steering, { world, Vec } = f;
      const source = f.snapshots.find(s => s.mode === mode), state = structuredClone(source.state), slot = source.playerSlot;
      const car = state.cars[slot], lateral = mode === 'arcade' ? 'x' : 'lateralMm', progress = mode === 'arcade' ? 'progress' : 'progressMm';
      car[progress] = checkpoint; car[lateral] = 0;
      if (mode === 'arcade') car.vx = 0; else { car.bodyYawMicroturn = 0; car.velocityYawMicroturn = 0; }
      f.draw(mode, state, camera);
      const frozenCamera = world.camera.clone(); frozenCamera.updateMatrixWorld(true);
      const neutral = world.cars[slot].group.position.clone();
      const forward = new Vec(0, 0, 1).transformDirection(world.cars[slot].group.matrixWorld);
      forward.y = 0; forward.normalize();
      const neutralYaw = Math.atan2(forward.x, forward.z);
      const screenRight = new Vec().setFromMatrixColumn(frozenCamera.matrixWorld, 0);
      // Test a landmark ahead of the bumper as well as the physical car origin;
      // all modes use the exact same neutral camera for left/right comparisons.
      const project = position => position.clone().addScaledVector(forward, camera === 'bumper' ? 15 : 0).project(frozenCamera).x;
      const positions = [];
      for (const offset of [-1000, 1000]) {
        car[lateral] = offset; f.draw(mode, state, camera);
        positions.push({ nativeLateral: offset, x: project(world.cars[slot].group.position), world: world.cars[slot].group.position.toArray() });
      }
      car[lateral] = 0;
      if (mode === 'arcade') car.vx = 100; else { car.bodyYawMicroturn = 40000; car.velocityYawMicroturn = 0; }
      f.draw(mode, state, camera, 9);
      const group = world.cars[slot].group, nose = new Vec(0, 0, 1).transformDirection(group.matrixWorld);
      const rightYawDot = nose.dot(screenRight) - forward.dot(screenRight);
      const wheels = ['WheelFrontL', 'WheelFrontR'].map(name => group.getObjectByName(name));
      const frontWheelYaw = wheels.map(wheel => wheel?.rotation.y ?? null);
      const determinants = []; group.traverse(object => { if (object.isMesh) determinants.push(object.matrixWorld.determinant()); });
      return { mode, checkpoint, camera, neutral: neutral.toArray(), neutralYaw, positions,
        rightYawDot, frontWheelYaw, determinant: group.matrixWorld.determinant(),
        minimumMeshDeterminant: Math.min(...determinants), glError: world.renderer.getContext().getError() };
    }, { mode, checkpoint, camera });
    report.projection.push(sample);
    check(sample.positions[0].x < sample.positions[1].x, `${mode} ${checkpoint} ${camera}: native left projects left of native right`);
    check(sample.rightYawDot > 0, `${mode} ${checkpoint} ${camera}: positive native yaw turns the nose right`);
    check(sample.frontWheelYaw.every(yaw => typeof yaw === 'number' && yaw < 0), `${mode} ${checkpoint} ${camera}: front wheels turn toward requested right`);
    check(sample.determinant > 0 && sample.minimumMeshDeterminant > 0, `${mode} ${checkpoint} ${camera}: car geometry keeps positive handedness`);
    check(sample.glError === 0, `${mode} ${checkpoint} ${camera}: WebGL remains healthy`);
  }
  report.hazards = await page.evaluate(async () => {
    const f = window.__steering, { world, Vec, bundle } = f;
    const threeUrl = performance.getEntriesByType('resource').find(entry => /\/node_modules\/\.vite\/deps\/three\.js(?:\?|$)/.test(entry.name))?.name;
    if (!threeUrl) throw new Error('Cannot identify the Three module used by the app');
    const { Raycaster } = await import(threeUrl);
    const ray = new Raycaster(), state = structuredClone(f.snapshots.find(s => s.mode === 'street').state);
    const slot = f.snapshots.find(s => s.mode === 'street').playerSlot;
    const objects = [bundle.objects.find(o => o.kind === 'oil'), bundle.objects.find(o => o.kind === 'breakaway_sign')];
    return objects.map(object => {
      state.cars[slot].progressMm = object.progressMm - 30000;
      f.draw('street', state, 'aerial');
      const samples = bundle.track.samples, p = object.progressMm;
      let lo = 0, hi = samples.length - 1;
      while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (samples[mid].progressMm <= p) lo = mid; else hi = mid; }
      const a = samples[lo], b = samples[hi], t = (p - a.progressMm) / (b.progressMm - a.progressMm);
      const field = key => a[key] + (b[key] - a[key]) * t;
      const heading = field('headingMicroturn') * Math.PI * 2 / 1e6;
      // Independently derive native East/North, then convert only the East axis.
      const expected = new Vec(-(field('eastMm') + Math.cos(heading) * object.lateralMm) / 1000,
        field('elevationMm') / 1000 + .025, (field('northMm') - Math.sin(heading) * object.lateralMm) / 1000);
      const mesh = world.hazards.get(`street-${object.id}`);
      const road = world.road.children.find(mesh => mesh.material === world.roadMaterial);
      ray.set(expected.clone().add(new Vec(0, 20, 0)), new Vec(0, -1, 0));
      const ground = ray.intersectObject(road, false)[0];
      return { id: object.id, visible: mesh.visible, nativeCenterError: mesh.position.distanceTo(expected),
        roadHit: !!ground, groundClearance: ground ? expected.y - ground.point.y : null };
    });
  });
  for (const hazard of report.hazards) {
    check(hazard.visible && hazard.nativeCenterError < 1e-5, `${hazard.id}: native lateral and heading place the object at its collision location`);
    check(hazard.roadHit && Math.abs(hazard.groundClearance) < .12, `${hazard.id}: object stays on the graded native road`);
  }
  check(report.errors.length === 0, 'No browser JavaScript or console errors');
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks: report.checks.length, failures: report.failures, errors: report.errors, report: `${out}/report.json` }));
  if (expectBroken) assert.ok(report.failures.some(label => label.includes('projects left')), 'Historical implementation reproduces flipped screen movement');
  else assert.deepEqual(report.failures, [], 'Steering must agree from native keys through the visible 3D scene');
} finally { await browser.close(); }
