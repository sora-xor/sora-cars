// Every body and option in real WebGL: the licensed hachiroku only loads in a browser. Run against the dev server or a
// static build that includes car-lab.html (GAME_URL without a trailing slash):
//   GAME_URL=http://127.0.0.1:5173 node scripts/test-car-builds.mjs [output/<dir>]
// Checks the car lab's models (decals, damage, thrown panels, shared geometry), the garage's save upgrade and its new
// options, and that nothing logs an error. Screenshots of every body go to the output directory for review.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './lib/browser-launch.mjs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = resolve(process.argv[2] ?? 'output/browser/car-builds');
await mkdir(out, { recursive: true });

const BODIES = ['hachiroku', 'kakeru', 'hokuto', 'mikazuki', 'raimei', 'hibari'];
/** A build with one of everything new: each body also shows the scoop or the vents and the rack or the skis across the set. */
const full = (body, i) => ({ tint: ['light', 'dark', 'gold'][i % 3], headlights: 'yellow', tails: 'smoked', neon: ['cyan', 'pink', 'purple', 'green', 'orange'][i % 5], bonnet: i % 2 ? 'scoop' : 'vents',
  roof: i % 2 ? 'skis' : 'rack', number: 10 + i, aeroColour: i % 2 ? 'body' : 'black', banner: true, front: 'lip', skirts: true, lamps: i % 2 ? 'rally' : 'fog', lower: 'stock', stripe: 'pin', stripeColour: 'white', wheels: 'mesh', wheelColour: 'gold' });

const PART = { frontBumper: 1, hood: 4, doorLeft: 10, doorRight: 11 };
const checks = [], errors = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); if (!ok) console.error(`FAIL ${name} ${detail}`); };

const browser = await launchChromium({ headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(String(error)));
  page.setDefaultTimeout(240000);
  await page.goto(`${url}/car-lab.html?body=hachiroku`, { timeout: 240000 });
  await page.waitForFunction(() => window.carLab && window.carLab.models().length > 0);

  for (const [i, body] of BODIES.entries()) {
    const report = await page.evaluate(async ({ body, options, PART }) => {
      const lab = window.carLab;
      await lab.show([{ ...lab.stock(0, body), ...options }]);
      const model = lab.models()[0];
      const meshes = () => { const found = []; model.group.traverse(o => { if (o.isMesh) found.push(o); }); return found; };
      const named = text => meshes().filter(mesh => mesh.name.includes(text));
      const seen = mesh => { for (let o = mesh; o; o = o.parent) if (!o.visible) return false; return true; };
      const hood = () => meshes().filter(mesh => mesh.name.startsWith('Kit') && mesh.userData.part === PART.hood);
      const out = { numbers: named('umber').length, banner: named('banner').length, flags: named('flag').length, emblems: named('emblem').length, neonPool: named('Neon underglow').length, hoodKit: hood().length };
      const emblem = named('emblem'), flag = named('flag');
      const count = list => list.filter(seen).reduce((sum, mesh) => sum + Math.min(mesh.geometry.drawRange.count, mesh.geometry.getAttribute('position').count), 0);
      const before = { flags: count(flag), emblems: count(emblem) };
      model.setDamage(2 ** PART.doorLeft);
      const leftGone = count(flag);
      model.setDamage(2 ** PART.doorLeft + 2 ** PART.doorRight + 2 ** PART.hood + 2 ** PART.frontBumper);
      const after = { flags: count(flag), emblems: count(emblem), hoodKit: hood().filter(seen).length, neonPool: named('Neon underglow').filter(seen).length };
      const thrown = model.breakPart(PART.hood); let thrownMeshes = 0;
      thrown?.object.traverse(o => { if (o.isMesh) thrownMeshes++; });
      model.setDamage(0);
      const restored = { flags: count(flag), emblems: count(emblem), hoodKit: hood().filter(seen).length };
      return { ...out, before, leftGone, after, thrownMeshes, restored };
    }, { body, options: full(body, i), PART });
    check(`${body}: racing numbers on the body`, report.numbers >= 1, JSON.stringify(report));
    check(`${body}: windscreen banner`, report.banner >= 1);
    check(`${body}: SORA flags and emblems`, report.flags >= 1 && report.emblems >= 1);
    check(`${body}: neon pool`, report.neonPool === 1);
    check(`${body}: the bonnet kit is on the bonnet`, report.hoodKit >= 1);
    check(`${body}: one door gone takes one flag`, report.leftGone > 0 && report.leftGone < report.before.flags, `${report.leftGone} of ${report.before.flags}`);
    check(`${body}: both doors gone take both flags`, report.after.flags === 0);
    check(`${body}: the bonnet takes its emblem, the roof keeps its own`, report.after.emblems > 0 && report.after.emblems < report.before.emblems, `${report.after.emblems} of ${report.before.emblems}`);
    check(`${body}: the bonnet kit goes with it, neon stays`, report.after.hoodKit === 0 && report.after.neonPool === 1);
    check(`${body}: a thrown bonnet carries its kit`, report.thrownMeshes >= 1 + report.hoodKit, `${report.thrownMeshes} meshes`);
    check(`${body}: repaired, every decal is back`, report.restored.flags === report.before.flags && report.restored.emblems === report.before.emblems && report.restored.hoodKit === report.hoodKit);
    for (const view of ['three', 'rear', 'front', 'top']) {
      await page.evaluate(view => window.carLab.view(view), view);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${body}-${view}.png` });
    }
    await page.evaluate(({ PART }) => window.carLab.models()[0].setDamage(2 ** PART.doorLeft + 2 ** PART.hood + 2 ** PART.frontBumper), { PART });
    await page.evaluate(() => window.carLab.view('three'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${body}-damaged.png` });
  }

  // Cars share their decal geometry: one car's damage must not reach another.
  const shared = await page.evaluate(async ({ PART }) => {
    const lab = window.carLab, build = { ...lab.stock(0, 'hachiroku'), wheels: 'mesh' };
    await lab.show([build, build]);
    const [a, b] = lab.models(), decal = model => { let found; model.group.traverse(o => { if (o.name === 'Exact SORA flag body decals') found = o; }); return found; };
    a.setDamage(2 ** PART.doorLeft + 2 ** PART.hood);
    return { a: decal(a).geometry.drawRange.count, b: decal(b).geometry.drawRange.count, same: decal(a).geometry === decal(b).geometry, sharedPositions: decal(a).geometry.getAttribute('position') === decal(b).geometry.getAttribute('position') };
  }, { PART });
  check('a damaged hachiroku leaves the next car’s flags whole', shared.b === Infinity && shared.a !== Infinity && !shared.same && shared.sharedPositions, JSON.stringify(shared));

  // The factory hachiroku stays exactly the race's detailed model: none of a build's parts.
  const factory = await page.evaluate(async () => {
    const lab = window.carLab;
    await lab.show([lab.stock(0)]);
    const names = []; lab.models()[0].group.traverse(o => { if (o.isMesh) names.push(o.name); });
    return names;
  });
  check('the factory car carries no kit, number, banner or neon', !factory.some(name => /^Kit|Racing number|banner|Neon/.test(name)), factory.filter(name => /^Kit|Racing number|banner|Neon/.test(name)).join());

  // A rival grid: varied builds on every body, drawn together.
  await page.evaluate(async () => { const lab = window.carLab; await lab.show(Array.from({ length: 8 }, (_, i) => lab.rival(i * 7 + 3, 1))); lab.view('three'); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/rival-grid.png` });

  // A save from the first build format, in the real garage: it reads, and a new option saves in the current format.
  const first = { body: 'hokuto', paint: 'midnight', lower: 'stock', stripe: 'none', stripeColour: 'white', wheels: 'mesh', wheelColour: 'silver', front: 'stock', skirts: false, spoiler: 'wing', fenders: 'stock', stance: 'low', lamps: 'none', louvers: false, exhaust: 'stock', mirrors: 'stock' };
  const garage = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' })).newPage();
  garage.on('console', message => { if (message.type() === 'error') errors.push(`garage: ${message.text()}`); });
  garage.on('pageerror', error => errors.push(`garage: ${error}`));
  garage.setDefaultTimeout(240000);
  await garage.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, ['sora-cars:car-build:v1', JSON.stringify({ version: 1, build: first })]);
  await garage.goto(`${url}/#/custom`, { timeout: 240000 });
  await garage.waitForSelector('.car-builder');
  const plate = await garage.textContent('.builder-plate h2');
  check('a first-format save opens as its own car', /北斗/.test(plate ?? ''), plate ?? '');
  await garage.click('[data-build="tab:lights"]');
  await garage.click('[data-build="set:neon:cyan"]');
  await garage.click('[data-build="set:headlights:yellow"]');
  await garage.click('[data-build="tab:paint"]');
  await garage.fill('input[data-build-number]', '27');
  await garage.dispatchEvent('input[data-build-number]', 'change');
  await garage.click('[data-build="tab:extras"]');
  await garage.click('[data-build="set:banner:true"]');
  await garage.waitForTimeout(1500);
  const saved = await garage.evaluate(() => JSON.parse(localStorage.getItem('sora-cars:car-build:v1')));
  check('the upgraded save keeps the car and takes the new options', saved.version === 1 && saved.build.body === 'hokuto' && saved.build.spoiler === 'wing' && saved.build.neon === 'cyan' && saved.build.headlights === 'yellow' && saved.build.number === 27 && saved.build.banner === true, JSON.stringify(saved.build));
  const titles = await garage.locator('.builder-tabs button').allTextContents();
  check('the new tab is Japanese first with its English subtitle', titles.some(text => /灯火/.test(text) && /LIGHTS/.test(text)), titles.join(' | '));
  await garage.screenshot({ path: `${out}/garage-extras.png` });
  await garage.reload({ timeout: 240000 });
  await garage.waitForSelector('.car-builder');
  await garage.click('[data-build="tab:paint"]');
  check('a reload reads the saved number back', await garage.inputValue('input[data-build-number]') === '27');
} finally {
  await browser.close();
}
check('no console or page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await writeFile(`${out}/report.json`, `${JSON.stringify({ checks, errors }, null, 1)}\n`);
console.log(`${checks.filter(entry => entry.ok).length}/${checks.length} car build checks passed; screenshots in ${out}`);
assert.equal(checks.filter(entry => !entry.ok).length, 0, JSON.stringify(checks.filter(entry => !entry.ok).slice(0, 8)));
