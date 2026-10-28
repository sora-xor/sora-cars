import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { relative, resolve, sep } from 'node:path';
import { loadStreetGeneration, streetGenerationArgument } from './lib/street-generation.ts';

// Browser integration of the native-authored local draft. Nonzero-state cases
// are explicitly bounded interaction fixtures, never claimed as genesis races,
// accepted replay proofs, human multiplayer, or finalized ledger outcomes.
const base = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const generation = await loadStreetGeneration(process.cwd(), streetGenerationArgument(process.argv.slice(2)));
const out = resolve(generation.directory, 'browser-hazards');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = ['src/game/street/lab.ts', 'src/game/street/session.ts', 'src/game/street/renderer.ts',
  'src/game/street/objects.ts', 'src/game/street/graph.ts', 'src/game/street/assets.ts', 'src/game/street/asset-manifest.ts',
  'src/game/audio.ts', 'scripts/lib/street-generation.ts', 'scripts/test-street-hazards-browser.mjs'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(path))])));
await mkdir(out);
const bundleEntry = generation.entries.find(row => row.roster === 2);
assert.ok(bundleEntry, 'fresh two-car native bundle must exist');
const { bytes: bundleBytes, bundle } = await generation.readBundle(2);
const fixtureUrl = new URL(relative(resolve('.'), bundleEntry.path).split(sep).map(encodeURIComponent).join('/'), `${base}/`).href;
const { bytes: labBundleBytes } = await generation.readBundle(8);
const expectedLabBundle = hash(labBundleBytes);
assert.ok(bundle.objects?.length, 'generate the hazard-aware native bundle first');
const report = { testedAt: new Date().toISOString(), scope: 'Actual local lab keyboard interaction plus explicit native graph browser fixtures.',
  qualification: { proof: false, finalized: false, multiplayer: false }, generation: generation.provenance(),
  bundleSha256: hash(bundleBytes), frontendSources: await sourceHashes(), checks: [], failures: [], errors: [], captures: [], cases: [] };
const check = (condition, description) => { report.checks.push({ description, passed: !!condition }); if (!condition) report.failures.push(description); };
const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
const pageState = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advanceLab = (page, ticks) => page.evaluate(ticks => { for (let i = 0; i < ticks; i++) window.advanceTime(1000 / 30); }, ticks);
const screenshot = async (page, name) => { await page.screenshot({ path: `${out}/${name}.png` }); report.captures.push(`${name}.png`); };
const observe = (page, label) => {
  page.on('pageerror', error => report.errors.push({ label, type: 'pageerror', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ label, type: 'console', message: message.text() }); });
};
try {
  // This first case operates the unchanged lab from its canonical native grid.
  // Standard key events are the only gameplay inputs supplied by the harness.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage(); observe(page, 'lab-keyboard');
  await page.goto(`${base}/street-lab.html`);
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).state);
  assert.equal(await page.evaluate(async () => (await import('/src/game/street/assets.ts')).STREET_ROUTES.find(route => route.id === 'tokyo-1986').bundleSha256),
    expectedLabBundle, 'Actual eight-car lab uses the selected generation');
  await page.evaluate(() => window.advanceTime(0));
  const initial = await pageState(page);
  check(initial.state.worldBrokenMask === 0 && initial.objectBitOrder.length === bundle.objects.length,
    'Actual eight-car lab exposes canonical intact world and frozen catalog order');
  await page.locator('#lab-start').click(); await page.keyboard.down('ArrowUp');
  let snapshot = await pageState(page), heldTurn = null, impact = null;
  const firstSign = bundle.objects.find(object => object.kind === 'breakaway_sign');
  for (let attempt = 0; attempt < 400 && snapshot.state.cars[0].progressMm < firstSign.progressMm + 10000; attempt++) {
    const car = snapshot.state.cars[0];
    const targetYaw = Math.max(-70000, Math.min(70000, (firstSign.lateralMm - car.lateralMm) * 25));
    const delta = ((targetYaw - car.bodyYawMicroturn + 1500000) % 1000000) - 500000;
    const nextTurn = delta > 1500 ? 'ArrowRight' : delta < -1500 ? 'ArrowLeft' : null;
    if (nextTurn !== heldTurn) { if (heldTurn) await page.keyboard.up(heldTurn); if (nextTurn) await page.keyboard.down(nextTurn); heldTurn = nextTurn; }
    await advanceLab(page, 1); snapshot = await pageState(page);
    if (snapshot.state.cars[0].propHitMask !== 0) { impact = snapshot; await screenshot(page, 'native-lab-sign-impact'); break; }
  }
  if (heldTurn) await page.keyboard.up(heldTurn); await page.keyboard.up('ArrowUp');
  check(impact !== null, 'Ordinary keyboard throttle and steering reach a real native sign impact from genesis');
  if (impact) {
    check(impact.state.cars[0].propHitMask === 1 && impact.state.worldBrokenMask % 2 === 1,
      'Player native hit bit and shared broken state agree at actual impact');
    check(impact.drivingSound.active && impact.drivingSound.impact === 'sign',
      'Actual lab maps the native sign hit to audible driving feedback');
    await advanceLab(page, 1); const after = await pageState(page);
    check(after.state.cars[0].propHitMask === 0 && after.state.worldBrokenMask % 2 === 1,
      'Broken sign persists in native state and does not impact the same player again');
  }
  await page.keyboard.press('KeyP'); const paused = await pageState(page);
  check(paused.paused && !paused.drivingSound.active, 'Pausing after a real impact silences the driving bus');
  await page.locator('#lab-pause').click(); const resumed = await pageState(page);
  check(resumed.state.tick === paused.state.tick && resumed.drivingSound.impact === null,
    'Resuming without a new native tick cannot replay an old impact cue');
  await page.locator('#lab-pause').click();
  const downloadEvent = page.waitForEvent('download'); await page.locator('#lab-download').click();
  const download = await downloadEvent; const downloadPath = await download.path();
  const replay = JSON.parse(await readFile(downloadPath));
  check(JSON.stringify(replay.objects) === JSON.stringify(bundle.objects), 'Downloaded replay includes the exact immutable object catalog');
  check(replay.outcome.worldBrokenMask === paused.state.worldBrokenMask && replay.qualification.proof === false && replay.qualification.finalized === false,
    'Downloaded replay carries native shared damage and remains explicitly unqualified');
  report.lab = { initial, impact, paused, replay: { objects: replay.objects, actions: replay.actions.length, outcome: replay.outcome, qualification: replay.qualification } };
  await context.close();

  // A second browser page executes the unchanged generated two-car graph at
  // valid nonzero-state fixtures. It uses the real renderer and GameAudio,
  // without a replacement physics function or injected result fields.
  const fixtures = await browser.newPage({ viewport: { width: 1440, height: 900 } }); observe(fixtures, 'native-fixtures');
  await fixtures.goto(`${base}/street-lab.html`);
  await fixtures.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).state);
  await fixtures.evaluate(() => window.advanceTime(0));
  const setup = await fixtures.evaluate(async fixtureUrl => {
    const [{ createStreetGraphExecutor }, { StreetRaceRenderer }, { STREET_CAR_FIELDS }, { GameAudio }] = await Promise.all([
      import('/src/game/street/graph.ts'), import('/src/game/street/renderer.ts'), import('/src/game/street/session.ts'), import('/src/game/audio.ts')]);
    const response = await fetch(fixtureUrl);
    if (!response.ok) throw new Error('Selected two-car native bundle is unavailable.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const bundle = JSON.parse(new TextDecoder().decode(bytes));
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
    const execute = createStreetGraphExecutor(bundle.graph, bundle.track);
    const milestones = bundle.track.topology === 'circuit'
      ? Array.from({ length: bundle.track.laps }, (_, lap) => bundle.track.gates.map(gate => lap * bundle.track.lengthMm + bundle.track.samples[gate.sample].progressMm)).flat().concat(bundle.track.lengthMm * bundle.track.laps)
      : bundle.track.gates.map(gate => bundle.track.samples[gate.sample].progressMm);
    // The actual lab keeps a ResizeObserver on its own canvas. Give the
    // explicitly labeled fixture a separate canvas, so a mobile resize cannot
    // repaint it with the paused canonical grid and invalidate the capture.
    const canvas = document.createElement('canvas'); canvas.id = 'street-canvas';
    document.querySelector('#street-canvas').replaceWith(canvas);
    const renderer = new StreetRaceRenderer(canvas), audio = new GameAudio();
    const names = ['空本アキ', '空井レン'];
    const state = values => ({ tick: values.tick, worldBrokenMask: values.worldBrokenMask,
      cars: Array.from({ length: bundle.roster }, (_, slot) => ({ ...Object.fromEntries(Object.entries(values)
        .filter(([key]) => key.startsWith(`c${slot}.`)).map(([key, value]) => [key.slice(3), value])), skin: slot % 6 })) });
    const fixture = ({ progress, lateral, speed = 2400, body = 0, velocity = 0, tick = 30, broken = 0, simultaneous = false }) => {
      const values = { tick, done: 0, worldBrokenMask: broken };
      for (let slot = 0; slot < 2; slot++) {
        const p = slot === 0 || simultaneous ? progress : progress + 60000;
        const x = simultaneous ? lateral + (slot === 0 ? -900 : 900) : slot === 0 ? lateral : 0;
        const car = [p, x, slot === 0 || simultaneous ? speed : 0, body, velocity, 1000,
          milestones.findIndex(gate => p < gate), 0, 0, 0, 1];
        STREET_CAR_FIELDS.forEach((name, index) => { values[`c${slot}.${name}`] = car[index]; });
      }
      return values;
    };
    const cases = [];
    const step = (values, controls = [1, 0]) => {
      const inputs = bundle.graph.inputs.map(port => port.name.endsWith('.controls') ? controls[Number(port.name[1])]
        : port.name.endsWith('.consensusForfeit') ? 0 : values[port.name]);
      const after = execute(inputs);
      cases.push({ inputs, expected: bundle.graph.outputs.map(port => after[port.name]).join(' ') });
      return after;
    };
    const draw = (values, label) => {
      const view = state(values);
      document.querySelector('#lab-status').hidden = true;
      document.querySelector('#lab-detail').innerHTML = `交差テスト · ${label}<small>VALID NONZERO-STATE NATIVE GRAPH FIXTURE · NOT A GENESIS REPLAY OR PROOF</small>`;
      renderer.resize();
      renderer.draw(bundle.track, view, { playerSlot: 0, names, controls: 1, rain: values.rain ?? 0, objects: bundle.objects }, values.tick / 30);
      return view;
    };
    window.__nativeHazards = { bundle, fixture, step, draw, state, cases, audio };
    return { sha256: digest, nodes: bundle.graph.nodes.length, objects: bundle.objects, qualification: bundle.qualification };
  }, fixtureUrl);
  assert.equal(setup.sha256, hash(bundleBytes), 'actual served two-car graph matches generation artifact');
  report.fixtureBundle = setup;
  const results = await fixtures.evaluate(() => {
    const h = window.__nativeHazards, objects = h.bundle.objects;
    const prop = kind => {
      const index = objects.findIndex(o => o.kind === kind), object = objects[index], bit = 2 ** index;
      const before = h.fixture({ progress: object.progressMm - object.halfLengthMm - 1800 - 1000,
        lateral: object.lateralMm + object.halfWidthMm + 800 });
      const after = h.step(before), prebroken = h.step({ ...before, worldBrokenMask: bit }), again = h.step(after);
      return { index, object, before, after, prebroken, again, bit };
    };
    const sign = prop('breakaway_sign'), tree = prop('tree_planter');
    const oilIndex = objects.findIndex(o => o.kind === 'oil'), oil = objects[oilIndex];
    const enteredFrom = h.fixture({ progress: oil.progressMm - oil.halfLengthMm - 1800 - 1000, lateral: oil.lateralMm });
    const entered = h.step(enteredFrom), sustained = h.step(entered);
    const exitedFrom = h.fixture({ progress: oil.progressMm + oil.halfLengthMm + 1800 - 1000, lateral: oil.lateralMm });
    const exited = h.step(exitedFrom), dryAgain = h.step(exited);
    const oily = h.step(h.fixture({ progress: oil.progressMm, lateral: oil.lateralMm, body: 90000, speed: 1800 }));
    const dry = h.step(h.fixture({ progress: oil.progressMm, lateral: -4500, body: 90000, speed: 1800 }));
    const simultaneousBefore = h.fixture({ progress: tree.object.progressMm - tree.object.halfLengthMm - 1800 - 1000,
      lateral: tree.object.lateralMm, simultaneous: true });
    const simultaneous = h.step(simultaneousBefore, [1, 1]);
    const invalidOilBit = { ...enteredFrom, worldBrokenMask: 2 ** oilIndex };
    let rejectedOilBit = false;
    try { h.step(invalidOilBit); } catch { rejectedOilBit = true; }
    h.results = { sign, tree, oil: { object: oil, enteredFrom, entered, sustained, exitedFrom, exited, dryAgain, oily, dry }, simultaneous, rejectedOilBit };
    return h.results;
  });
  for (const [name, result, retained] of [['sign', results.sign, 224], ['tree', results.tree, 160]]) {
    check(result.after['c0.propHitMask'] === result.bit && (result.after.worldBrokenMask & result.bit) !== 0,
      `${name}: native swept impact produces exact object bit and shared broken state`);
    check(result.after['c0.speedMmPerTick'] === Math.trunc(result.prebroken['c0.speedMmPerTick'] * retained / 256),
      `${name}: intact prop applies its exact native retained-speed fraction`);
    check(result.after['c0.progressMm'] === result.prebroken['c0.progressMm'] && result.after['c0.lateralMm'] === result.prebroken['c0.lateralMm'],
      `${name}: end-of-tick breakaway loss leaves resolved position unchanged`);
    check(result.again['c0.propHitMask'] === 0 && result.again.worldBrokenMask === result.bit,
      `${name}: broken prop remains fallen without a second penalty`);
  }
  const oil = results.oil;
  check(oil.entered['c0.oil'] === 0 && oil.entered['c0.oilCrossed'] === 1 && oil.sustained['c0.oil'] === 1,
    'Oil entry is swept contact this tick and lower start-occupancy grip on the next tick');
  check(oil.exited['c0.oil'] === 1 && oil.exited['c0.oilCrossed'] === 1 && oil.dryAgain['c0.oil'] === 0,
    'Oil exit retains occupied-start grip for that tick and restores dry grip next tick');
  const slip = values => Math.abs(((values['c0.bodyYawMicroturn'] - values['c0.velocityYawMicroturn'] + 1500000) % 1000000) - 500000);
  check(slip(oil.oily) > slip(oil.dry) * 1.5 && oil.oily['c0.oil'] === 1 && oil.dry['c0.oil'] === 0,
    'Actual native oil reduces grip and leaves substantially greater body-to-velocity slip');
  check(oil.entered.worldBrokenMask === 0 && results.rejectedOilBit, 'Oil is unbreakable and forged oil damage bits are rejected');
  check(results.simultaneous['c0.propHitMask'] === results.tree.bit && results.simultaneous['c1.propHitMask'] === results.tree.bit,
    'Two touching but nonoverlapping cars both receive same-tick intact prop impact without a slot-order winner');
  report.fixtureResults = results;
  for (const name of ['sign', 'tree']) {
    await fixtures.evaluate(name => { const h = window.__nativeHazards; h.draw(h.results[name].before, `${name} / BEFORE`); }, name);
    await fixtures.waitForFunction(() => document.fonts.status === 'loaded');
    await screenshot(fixtures, `${name}-before`);
    await fixtures.evaluate(name => { const h = window.__nativeHazards; h.draw(h.results[name].after, `${name} / NATIVE IMPACT`); }, name);
    await screenshot(fixtures, `${name}-impact`);
    await fixtures.evaluate(name => { const h = window.__nativeHazards, { object, bit } = h.results[name];
      const value = h.step(h.fixture({ progress: object.progressMm - 10000, lateral: 0, speed: 0, broken: bit }), [0, 0]);
      h.draw(value, `${name} / RESTORED NATIVE BROKEN SNAPSHOT`); }, name);
    await screenshot(fixtures, `${name}-fallen`);
  }
  await fixtures.evaluate(() => { const h = window.__nativeHazards; h.draw(h.results.oil.oily, 'OIL / NATIVE SLIP'); });
  await screenshot(fixtures, 'oil-native-slip');
  await fixtures.evaluate(() => { const h = window.__nativeHazards, oil = h.results.oil.object;
    h.draw(h.step(h.fixture({ progress: oil.progressMm - oil.halfLengthMm - 12000, lateral: 0, speed: 0 }), [0, 0]), 'OIL / APPROACH'); });
  await screenshot(fixtures, 'oil-approach');
  await fixtures.setViewportSize({ width: 390, height: 844 });
  await fixtures.evaluate(() => { const h = window.__nativeHazards; h.draw(h.results.tree.before, 'TREE / MOBILE'); });
  await screenshot(fixtures, 'mobile-tree');
  await fixtures.setViewportSize({ width: 1440, height: 900 });
  // Exercise the generic audio API after the old 5400-tick ceiling using the
  // native sign result. This is audio API coverage, not a 6001-tick replay.
  await fixtures.locator('#lab-music').click();
  const audio = await fixtures.evaluate(async () => {
    const h = window.__nativeHazards; await h.audio.unlock();
    const after = h.step(h.fixture({ progress: h.results.sign.object.progressMm - h.results.sign.object.halfLengthMm - 2800,
      lateral: h.results.sign.object.lateralMm, tick: 6000 }));
    const index = h.bundle.objects.findIndex((object, index) => object.kind !== 'oil' && Math.floor(after['c0.propHitMask'] / 2 ** index) % 2 === 1);
    const kind = h.bundle.objects[index].kind === 'tree_planter' ? 'tree' : 'sign';
    h.audio.drive(after['c0.speedMmPerTick'], true, false, { controls: 1, impact: { tick: after.tick, kind } });
    const impact = h.audio.driveState; h.audio.stopDrive();
    return { tick: after.tick, mask: after['c0.propHitMask'], impact, stopped: h.audio.driveState };
  });
  check(audio.tick === 6001 && audio.mask === 1 && audio.impact.impact === 'sign' && audio.impact.active,
    'Actual Web Audio accepts native hazard feedback after tick 5400');
  check(!audio.stopped.active && audio.stopped.impact === null, 'Stopping audio after a late native impact silences the effect');
  report.lateAudio = audio;
  report.cases = await fixtures.evaluate(() => window.__nativeHazards.cases);
  await generation.verifyUnchanged();
  const native = execFileSync(generation.binaryPath, ['--execute', '2'], {
    input: report.cases.map(row => row.inputs.join(' ')).join('\n') + '\n', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }).trim().split('\n');
  check(native.length === report.cases.length && native.every((row, index) => row === report.cases[index].expected),
    `Rust and actual browser agree exactly on every output of all ${report.cases.length} native fixture transitions`);
  check(JSON.stringify(await sourceHashes()) === JSON.stringify(report.frontendSources), 'Tested source files remain unchanged through browser execution');
  await generation.verifyUnchanged();
  check(true, 'Selected generation, binary, harness, layout and producer pins remain current');
  check(report.errors.length === 0, 'No browser page or console errors');
} catch (error) { report.failures.push(error.stack ?? String(error)); }
finally { await browser.close(); await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n'); }
assert.equal(report.failures.length, 0, report.failures.join('\n'));
console.log(`Native hazard browser integration: ${report.checks.length} checks and ${report.cases.length} exact Rust/browser fixture transitions passed.`);
