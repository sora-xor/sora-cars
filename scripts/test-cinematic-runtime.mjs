import { launchChromium } from './lib/browser-launch.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = process.env.CINEMATIC_TEST_OUT ?? 'output/browser/cinematic-runtime';
await mkdir(out, { recursive: true });
const browser = await launchChromium({ headless: true, channel: 'chromium',
  args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
// Requires Vite: the audit imports the same source modules as the running game.
const report = { base,
  method: 'Three warmup frames and seven measured frames per variant; median includes a one-pixel GPU readback. Mobile is a viewport on the reported desktop GPU, not a physical phone benchmark.',
  views: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  // Keep this captured build stable while other work changes files under Vite.
  await page.routeWebSocket(/.*/, socket => socket.send(JSON.stringify({ type: 'connected' })));
  await page.addInitScript(() => {
    const schedule = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => window.__cinematicFreeze ? 0 : schedule(time => {
      if (!window.__cinematicFreeze) callback(time);
    });
  });
  await page.goto(`${base}/?picture=clean`);
  await page.waitForFunction(() => window.soraCars && document.fonts.status === 'loaded', null, { polling: 100 });
  await page.waitForFunction(() => {
    const data = document.querySelector('#race-canvas')?.dataset;
    return data?.carAsset === 'detailed' && data?.sceneryAsset === 'detailed' && data?.lightingAsset === 'detailed' && data?.understoryAsset === 'detailed' && data?.groundAsset === 'detailed';
  }, null, { polling: 100, timeout: 60000 });
  await page.evaluate(() => { window.advanceTime(0); window.__cinematicFreeze = true; window.soraCars.startPractice(); });
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => window.advanceTime(5200));
  await page.keyboard.up('ArrowUp');
  const setup = await page.evaluate(async () => {
    const loaded = path => performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname === path).at(-1)?.name ?? path;
    const { getRaceWorld } = await import(loaded('/src/game/three/world.ts'));
    const { RaceRenderer } = await import(loaded('/src/game/renderer.ts'));
    const { setPixelFinish } = await import(loaded('/src/game/three/graphics.ts'));
    const source = await (await fetch(loaded('/src/game/three/cinematic.ts'))).text();
    const composerUrl = source.match(/import \{ EffectComposer \} from "([^"]+)"/)[1];
    const { EffectComposer } = await import(composerUrl);
    const canvas = document.querySelector('#race-canvas'), world = getRaceWorld(canvas), arcade = new RaceRenderer(canvas);
    const native = window.soraCars.state(), text = JSON.parse(window.render_game_to_text());
    const options = { playerSlot: text.playerSlot, names: text.names, skins: native.cars.map((_, i) => i % 6), controls: 0, hud: true, camera: 'chase' };
    const renderComposer = EffectComposer.prototype.render;
    let composer;
    EffectComposer.prototype.render = function (...args) { composer = this; return renderComposer.apply(this, args); };
    try { arcade.draw(native, options, native.tick / 30); } finally { EffectComposer.prototype.render = renderComposer; }
    if (!composer) throw new Error('Cinematic composer was not used by the actual game');
    const gl = world.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const before = JSON.stringify(native), pixel = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const draw = (kind = 'scene') => {
      world.renderer.info.reset();
      if (kind === 'app') arcade.draw(native, options, native.tick / 30);
      else world.pass.render(world.scene, world.camera, canvas.width, canvas.height, native.tick / 30);
      sync();
      if (JSON.stringify(native) !== before) throw new Error('Rendering changed the native race');
      return { ...world.renderer.info.render };
    };
    world.renderer.info.autoReset = false;
    window.__cinematic = { world, canvas, arcade, native, options, composer, setPixelFinish, draw, sync, before, gl };
    return { gpu, assets: { ...canvas.dataset }, dimensions: [canvas.width, canvas.height], passNames: composer.passes.map(pass => pass.constructor.name) };
  });
  report.setup = setup;
  if (process.platform === 'darwin') assert.match(setup.gpu, /Metal/, 'Hardware measurement requires Metal');
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => {
      const f = window.__cinematic; f.arcade.resize(); f.setPixelFinish(false); f.arcade.draw(f.native, f.options, f.native.tick / 30);
    });
    const view = { name: viewport.name, variants: [] };
    view.depthChecks = await page.evaluate(() => {
      const f = window.__cinematic, buffers = [f.composer.renderTarget1, f.composer.renderTarget2];
      const grade = f.composer.passes.find(pass => pass.uniforms?.finishStrength);
      const originalSamples = buffers.map(buffer => buffer.samples), checks = [];
      try {
        for (const samples of [0, originalSamples[0]]) {
          buffers.forEach(buffer => { buffer.dispose(); buffer.samples = samples; });
          for (const ao of [false, true]) for (const pixel of [false, true, false]) {
            f.composer.passes[1].enabled = ao; f.world.pass.setPixelation(pixel);
            f.draw();
            checks.push({ samples, ao, pixel, glError: f.gl.getError(),
              independentDepth: buffers.every(buffer => buffer.depthTexture !== grade.uniforms.sceneDepth.value),
              depthSize: [grade.uniforms.sceneDepth.value.image.width, grade.uniforms.sceneDepth.value.image.height],
              colorSize: [f.composer.readBuffer.width, f.composer.readBuffer.height] });
          }
        }
      } finally {
        buffers.forEach((buffer, i) => { buffer.dispose(); buffer.samples = originalSamples[i]; });
        f.composer.passes[1].enabled = true; f.world.pass.setPixelation(false);
      }
      return checks;
    });
    for (const check of view.depthChecks) {
      assert.equal(check.glError, 0, 'Depth sampling works with and without MSAA/AO/pixelation');
      assert.ok(check.independentDepth, 'Grade depth is never attached to a composer output framebuffer');
      assert.deepEqual(check.depthSize, check.colorSize, 'Preserved depth follows the actual render resolution');
    }
    for (const variant of [
      { name: 'clean', ao: true, bloom: true, pixel: false },
      { name: 'pixel', ao: true, bloom: true, pixel: true },
      { name: 'beauty', ao: false, bloom: false, pixel: false },
      { name: 'ao-only', ao: true, bloom: false, pixel: false },
      { name: 'bloom-only', ao: false, bloom: true, pixel: false },
    ]) {
      const metrics = await page.evaluate(variant => {
        const f = window.__cinematic, passes = f.composer.passes;
        passes[1].enabled = variant.ao; passes[2].enabled = variant.bloom; f.setPixelFinish(variant.pixel);
        f.world.pass.setPixelation(variant.pixel);
        for (let i = 0; i < 3; i++) f.draw();
        const times = []; let stats;
        for (let i = 0; i < 7; i++) { const start = performance.now(); stats = f.draw(); times.push(performance.now() - start); }
        times.sort((a, b) => a - b);
        const ctx = f.canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, f.canvas.width, f.canvas.height); ctx.drawImage(f.world.canvas, 0, 0);
        return { stats, medianMs: times[3], minMs: times[0], maxMs: times[6], internal: [f.composer.readBuffer.width, f.composer.readBuffer.height], samples: f.composer.readBuffer.samples };
      }, variant);
      view.variants.push({ ...variant, ...metrics });
      await page.locator('#race-canvas').screenshot({ path: `${out}/${viewport.name}-${variant.name}.png` });
    }
    view.pixelChecks = await page.evaluate(() => {
      const f = window.__cinematic;
      f.composer.passes[1].enabled = f.composer.passes[2].enabled = true;
      const read = () => { const data = new Uint8Array(f.world.canvas.width * f.world.canvas.height * 4); f.gl.readPixels(0, 0, f.world.canvas.width, f.world.canvas.height, f.gl.RGBA, f.gl.UNSIGNED_BYTE, data); return data; };
      f.world.pass.setPixelation(false); const cleanStats = f.draw(); const clean = read();
      f.world.pass.setPixelation(true); const pixelStats = f.draw(); const pixel = read();
      f.world.pass.setPixelation(false); f.draw(); const restored = read();
      let changedPixels = 0, restoreDifference = 0, totalColorDifference = 0;
      for (let i = 0; i < clean.length; i += 4) {
        let changed = false;
        for (let c = 0; c < 3; c++) { changed ||= clean[i + c] !== pixel[i + c]; totalColorDifference += Math.abs(clean[i + c] - pixel[i + c]); restoreDifference += clean[i + c] !== restored[i + c] ? 1 : 0; }
        if (changed) changedPixels++;
      }
      return { changedPixels, restoreDifference, meanChannelDifference: totalColorDifference / (clean.length * .75), extraCalls: pixelStats.calls - cleanStats.calls, extraTriangles: pixelStats.triangles - cleanStats.triangles };
    });
    assert.ok(view.pixelChecks.changedPixels > 1000, 'The optional finish must visibly change the rendered image');
    assert.equal(view.pixelChecks.restoreDifference, 0, 'Disabling the optional finish must exactly restore the clean scene');
    assert.equal(view.pixelChecks.extraCalls, 1); assert.equal(view.pixelChecks.extraTriangles, 1, 'Pixel finish must only add a fullscreen pass');
    view.materialChecks = await page.evaluate(() => {
      const f = window.__cinematic, grade = f.composer.passes.find(pass => pass.uniforms?.finishStrength);
      const read = () => { const data = new Uint8Array(f.world.canvas.width * f.world.canvas.height * 4); f.gl.readPixels(0, 0, f.world.canvas.width, f.world.canvas.height, f.gl.RGBA, f.gl.UNSIGNED_BYTE, data); return data; };
      const compare = (toggle, label) => {
        const pixels = [], frames = [];
        for (const enabled of [true, false, true]) {
          toggle(enabled); const stats = f.draw(); pixels.push(read());
          frames.push({ enabled, calls: stats.calls, triangles: stats.triangles, png: f.world.canvas.toDataURL('image/png').split(',')[1] });
        }
        let changedPixels = 0, restoreDifference = 0;
        for (let i = 0; i < pixels[0].length; i += 4) {
          let changed = false;
          for (let c = 0; c < 3; c++) { changed ||= pixels[0][i + c] !== pixels[1][i + c]; restoreDifference += pixels[0][i + c] !== pixels[2][i + c] ? 1 : 0; }
          if (changed) changedPixels++;
        }
        return { label, changedPixels, restoreDifference, frames };
      };
      const finish = compare(enabled => { grade.uniforms.finishStrength.value = enabled ? 1 : 0; }, 'Illustrated finish on/off/on, identical complete scene');
      // Exercise a broad physical wet surface even when this native checkpoint
      // is dry. The temporary material state never changes native weather/state.
      f.world.roadFinish.setWetness(1);
      let road;
      try { road = compare(enabled => f.world.roadFinish.setEnabled(enabled), 'Wet material on/off/on, identical native road geometry and lights'); }
      finally { f.world.roadFinish.setEnabled(true); f.draw('app'); }
      return { finish, road, glError: f.gl.getError() };
    });
    for (const [kind, result] of Object.entries(view.materialChecks).filter(([key]) => key !== 'glError')) {
      assert.ok(result.changedPixels > 10, `${kind} affects the actual scene`);
      assert.equal(result.restoreDifference, 0, `${kind} on/off/on restores every channel`);
      assert.ok(result.frames.every(frame => frame.calls === result.frames[0].calls && frame.triangles === result.frames[0].triangles), `${kind} adds no geometry or draw passes`);
      for (const [index, frame] of result.frames.entries()) {
        await writeFile(`${out}/${viewport.name}-${kind}-${index}-${frame.enabled ? 'on' : 'off'}.png`, Buffer.from(frame.png, 'base64')); delete frame.png;
      }
    }
    assert.equal(view.materialChecks.glError, 0);
    view.costIsolation = await page.evaluate(() => {
      const f = window.__cinematic;
      const measure = () => {
        for (let i = 0; i < 3; i++) f.draw();
        const times = []; let stats; for (let i = 0; i < 7; i++) { const start = performance.now(); stats = f.draw(); times.push(performance.now() - start); }
        times.sort((a, b) => a - b); return { medianMs: times[3], stats };
      };
      const normal = measure();
      const savedUpdate = f.world.renderer.shadowMap.autoUpdate;
      let reuseShadow;
      try { f.world.renderer.shadowMap.autoUpdate = false; reuseShadow = measure(); } finally { f.world.renderer.shadowMap.autoUpdate = savedUpdate; }
      const isolate = groups => {
        const visible = groups.map(group => group.visible);
        const refreshTrees = () => {
          f.world.scene.updateMatrixWorld(true);
          f.world.treeBatch?.update(f.world.camera, f.world.keyLight);
        };
        try { groups.forEach(group => group.visible = false); refreshTrees(); return measure(); }
        finally { groups.forEach((group, i) => group.visible = visible[i]); refreshTrees(); }
      };
      const withoutTrees = isolate([...f.world.trees, ...f.world.forest, ...f.world.woodland]);
      const withoutCars = isolate(f.world.cars.map(car => car.group));
      f.draw();
      return { normal, reuseShadow, withoutTrees, withoutCars };
    });
    view.scene = await page.evaluate(() => {
      const f = window.__cinematic, groups = [...f.world.cars.map(car => ({ name: 'car', group: car.group })), ...f.world.trees.map(group => ({ name: 'tree', group })), ...f.world.buildings.map(group => ({ name: 'building', group }))];
      const inventory = {};
      for (const { name, group } of groups) {
        const data = inventory[name] ??= { groups: 0, visibleGroups: 0, meshes: 0, triangles: 0 }; data.groups++; if (group.visible) data.visibleGroups++;
        group.traverse(object => { if (object.isMesh) { data.meshes++; data.triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3; } });
      }
      f.composer.passes[1].enabled = f.composer.passes[2].enabled = true; f.setPixelFinish(false);
      for (let i = 0; i < 3; i++) f.draw('app');
      const times = []; let stats; for (let i = 0; i < 7; i++) { const start = performance.now(); stats = f.draw('app'); times.push(performance.now() - start); }
      times.sort((a, b) => a - b);
      return { inventory, appMedianMs: times[3], appStats: stats, dimensions: [f.canvas.width, f.canvas.height], memory: { ...f.world.renderer.info.memory } };
    });
    await page.locator('#race-canvas').screenshot({ path: `${out}/${viewport.name}-app.png` });
    report.views.push(view);
  }
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
