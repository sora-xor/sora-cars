#!/usr/bin/env node
// Capture repeatable world-layer frames for comparisons with the cutscene repaints.
// Requires a Vite dev server (uses the module actually loaded by the page).
// A/A repeatability is a prerequisite for an art comparison, not proof of visual parity.
// node scripts/test-graphics-parity.mjs --url http://127.0.0.1:5174 --scene tokyo:0:0.95,arcade0
// --variants '[{"name":"base"},{"name":"wider","wetWaveStreak":8}]'
// Street scene: <route>:<chapter progress 0..1>:<lap fraction 0..1>; "tokyo" is an alias.
// Stationary world layer only: no HUD, weather overlay or motion-quality claim.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './lib/browser-launch.mjs';

const cfg = { url: process.env.GAME_URL ?? 'http://127.0.0.1:5174',
  out: 'output/browser/graphics-parity', scene: 'tokyo:0:0.95,arcade0', size: '1280x720', variants: '[{"name":"base"}]' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  if (!(key in cfg) || !process.argv[i + 1]) throw new Error(`Unknown or incomplete option ${process.argv[i]}`);
  cfg[key] = process.argv[i + 1];
}
const [width, height] = cfg.size.split('x').map(Number);
if (!/^\d+x\d+$/.test(cfg.size) || width < 320 || height < 240) throw new Error('Use --size WIDTHxHEIGHT (at least 320x240)');
const variants = JSON.parse(cfg.variants);
if (!Array.isArray(variants) || !variants.length || variants.some(v => !v || !/^[a-z0-9_-]+$/i.test(v.name))
  || new Set(variants.map(v => v.name)).size !== variants.length) throw new Error('Variants need unique alphanumeric names');
const scenes = cfg.scene.split(',').map(scene => {
  if (/^arcade[0-2]$/.test(scene)) return { id: scene, arcade: Number(scene.at(-1)) };
  const [head, chapter, lap, extra] = scene.split(':');
  if (!head || chapter === undefined || lap === undefined || extra !== undefined
    || ![chapter, lap].every(n => n !== '' && Number.isFinite(+n) && +n >= 0 && +n <= 1))
    throw new Error(`Invalid scene ${scene}`);
  return { id: scene, route: head === 'tokyo' ? 'tokyo-1986' : head, chapter: +chapter, lap: +lap };
});
const out = resolve(cfg.out), url = cfg.url.replace(/\/$/, '');
await mkdir(out, { recursive: true });
const report = { url, viewport: { width, height },
  purpose: 'Stationary world-layer A/B; A/A repeatability checked per variant; visual/motion review still required',
  conditioning: { seekOffsetMm: 1000000, seekPairs: 2, warmupFrames: 16, framesAfterHistoryReset: 8 }, scenes: [] };
const browser = await launchChromium({ headless: true });
try {
  for (const scene of scenes) {
    const errors = [], row = { scene: scene.id, errors };
    report.scenes.push(row);
    const dir = `${out}/${scene.id.replace(/[^a-z0-9_-]/gi, '_')}`;
    await mkdir(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    try {
      // Prevent Vite HMR from changing source during a comparison. Never proxy game services.
      await page.routeWebSocket(target => target.host === new URL(url).host,
        socket => socket.send(JSON.stringify({ type: 'connected' })));
      await page.goto(`${url}/?picture=pixel${scene.route ? `#/street/${scene.route}` : ''}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.soraCars && window.render_game_to_text && window.advanceTime
        && document.fonts.status === 'loaded', null, { timeout: 180000 });
      await page.evaluate(arcade => {
        window.advanceTime(0);
        if (arcade !== undefined) { window.soraCars.setTrack(arcade); window.soraCars.startPractice(); }
      }, scene.arcade);
      await page.waitForFunction(street => {
        const s = JSON.parse(window.render_game_to_text());
        return s.graphics.status === 'ready' && !s.graphics.preparing
          && (street ? s.mode === 'street' && s.street?.phase === 'ready' : s.mode === 'race');
      }, !!scene.route, { timeout: 180000, polling: 200 });
      if (scene.route) await page.locator('[data-action="street-start"]').click();
      await page.keyboard.down('ArrowUp');
      await page.evaluate(street => {
        for (let i = 0; i < 600; i++) {
          const s = JSON.parse(window.render_game_to_text());
          if (street ? s.street?.phase === 'driving' : s.countdown === 0 && s.tick > 0) break;
          window.advanceTime(1000 / 60);
        }
        for (let i = 0; i < 150; i++) window.advanceTime(1000 / 60);
      }, !!scene.route);
      await page.keyboard.up('ArrowUp');
      await page.evaluate(async scene => {
        const entry = path => performance.getEntriesByType('resource')
          .filter(e => new URL(e.name).pathname === path).at(-1)?.name ?? path;
        const { getRaceWorld } = await import(entry('/src/game/three/world.ts'));
        const world = getRaceWorld(document.querySelector('#race-canvas'));
        if (!world || !window.__soraPixelArt) throw new Error('Pixel-art WebGL renderer unavailable');
        const text = JSON.parse(window.render_game_to_text());
        let state, track, options;
        if (scene.route) {
          const [{ loadStreetRoute }, { streetPresentation }] = await Promise.all([
            import(entry('/src/game/street/assets.ts')), import(entry('/src/game/street/presentation.ts'))]);
          const { bundle } = await loadStreetRoute(scene.route);
          track = bundle.track;
          state = structuredClone(text.street.fullStreetState);
          const shift = Math.round(scene.lap * track.lengthMm) - state.cars[text.playerSlot].progressMm;
          for (const car of state.cars) car.progressMm += shift;
          let tick = 0;
          while (tick < 20000 && streetPresentation(track, tick).dawn < scene.chapter) tick += 3;
          state.tick = tick;
          options = { playerSlot: text.playerSlot, names: text.names, controls: 1, hud: false, objects: bundle.objects, rain: 0 };
        } else {
          state = structuredClone(window.soraCars.state());
          // Fixed test liveries: player cream, then the same stock sequence as fresh practice.
          options = { playerSlot: text.playerSlot, names: text.names, controls: 1, hud: false,
            skins: state.cars.map(c => c.slot === text.playerSlot ? 0 : (c.slot + 1) % 6) };
        }
        window.__graphicsParity = { world, track, state, options, time: state.tick / 30, text };
      }, scene);
      const result = await page.evaluate(variants => {
        const { world, track, state, options, time, text } = window.__graphicsParity;
        const draw = (snapshot = state) => track ? world.renderStreet(track, snapshot, options, time) : world.renderArcade(snapshot, options, time);
        const handle = window.__soraPixelArt, defaults = handle.options();
        const seek = structuredClone(state), progress = track ? 'progressMm' : 'progress';
        for (const car of seek.cars) car[progress] += 1000000;
        const capture = () => {
          // Replay the same conditioning before BOTH samples: glow has its own retained history,
          // and the airship eases per rendered frame. A pixel-history reset alone does not reset these.
          // Public seeks reset progress animation and settle the camera without touching private fields.
          for (let i = 0; i < 2; i++) { draw(seek); draw(); }
          // Complete the seven-frame local reflection probe and previous-camera-dependent effects.
          for (let i = 0; i < 16; i++) draw();
          handle.resetHistory();
          for (let i = 0; i < 8; i++) draw();
          return world.canvas.toDataURL('image/png');
        };
        // All variants run synchronously in ONE callback: RAF cannot draw the live race between them.
        const captures = variants.map(({ name, ...settings }) => {
          for (const [key, value] of Object.entries(settings))
            if (!(key in defaults) || typeof value !== typeof defaults[key] || typeof value === 'number' && !Number.isFinite(value))
              throw new Error(`Invalid renderer option ${key}`);
          handle.configure({ ...defaults, ...settings });
          return { name, a: capture(), b: capture(), pixelOptions: handle.options() };
        });
        return { captures, liveTextState: text, captured: { state, options, time },
          graphics: { ...document.querySelector('#race-canvas').dataset } };
      }, variants);
      const { captures, ...state } = result;
      await writeFile(`${dir}/state.json`, JSON.stringify(state, null, 2));
      row.variants = [];
      for (const { name, a, b, pixelOptions } of captures) {
        const imageA = Buffer.from(a.split(',')[1], 'base64'), imageB = Buffer.from(b.split(',')[1], 'base64');
        await Promise.all([
          writeFile(`${dir}/${name}-a.png`, imageA), writeFile(`${dir}/${name}-b.png`, imageB),
          writeFile(`${dir}/${name}-options.json`, JSON.stringify(pixelOptions, null, 2)),
        ]);
        const identical = imageA.equals(imageB);
        row.variants.push({ name, identical, sha256: [imageA, imageB].map(bytes => createHash('sha256').update(bytes).digest('hex')) });
        if (!identical) errors.push(`${name}: same state/time produced different pixels after history reset; do not use for A/B scoring`);
      }
      row.identical = row.variants.every(v => v.identical);
      row.capture = dir;
    } catch (error) {
      errors.push(error.stack ?? String(error));
      row.identical = false;
    } finally {
      await page.close();
    }
    console.log(JSON.stringify(row));
  }
} finally {
  await browser.close();
  report.pass = report.scenes.length === scenes.length && report.scenes.every(row => row.identical && !row.errors.length);
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
if (!report.pass) process.exitCode = 1;
