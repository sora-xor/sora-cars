import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = 'output/browser/proof-workshop';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], checks = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()).proofWorkshop);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.soraCars && document.fonts.status === 'loaded');
  await page.evaluate(() => window.advanceTime(0));
  await page.locator('.header [data-action="proofs"]').click();
  assert.equal(new URL(page.url()).hash, '#/proofs');
  const raceBefore = await page.evaluate(() => window.soraCars.state());
  await page.evaluate(() => window.advanceTime(300));
  assert.deepEqual(await page.evaluate(() => window.soraCars.state()), raceBefore);
  assert.equal((await state(page)).teachingOnly, true);
  const first = await page.locator('#proof-canvas').screenshot();
  for (let i = 0; i < 15; i++) await page.evaluate(() => window.advanceTime(100));
  assert.notDeepEqual(await page.locator('#proof-canvas').screenshot(), first, 'trace animation visibly moves');
  await page.locator('[data-action="proof-play"]').click();
  const frozen = await page.locator('#proof-canvas').screenshot();
  await page.evaluate(() => window.advanceTime(3000));
  assert.deepEqual(await page.locator('#proof-canvas').screenshot(), frozen, 'pause freezes the diagram');
  checks.push('Direct navigation, actual animation/pause and unchanged race state');
  const roots = [];
  for (let stage = 0; stage < 7; stage++) {
    await page.locator(`[data-action="proof-stage-${stage}"]`).click();
    assert.equal((await state(page)).stage, stage);
    assert.equal(await page.locator(`[data-action="proof-stage-${stage}"]`).getAttribute('aria-current'), 'step');
    if (stage === 1) {
      roots.push((await state(page)).root);
      await page.locator('[data-action="proof-tamper"]').click();
      const altered = await state(page); roots.push(altered.root);
      assert.notEqual(roots[0], roots[1]);
      assert.deepEqual(altered.residuals.map(row => row[1]), [0, 0, 0, 3, 14, 0, 0]);
      assert.equal(await page.locator('.proof-verdict').getAttribute('data-valid'), 'false');
    }
    if (stage === 4) {
      const before = (await state(page)).challenge.digest;
      await page.locator('[data-action="proof-challenge"]').click();
      assert.notEqual((await state(page)).challenge.digest, before);
    }
    if (stage === 5) {
      const slider = page.locator('#proof-beta');
      await slider.focus(); await page.keyboard.press('Home');
      for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
      const folded = await state(page);
      assert.equal(folded.beta, 12); assert.deepEqual(folded.folds[2].values, [3, 3, 3, 3]);
      assert.equal(await slider.evaluate(element => element === document.activeElement), true);
    }
    await page.screenshot({ path: `${out}/stage-${stage}.png` });
  }
  checks.push('All seven stages, trace tamper, commitment/challenge changes, exact FRI slider output');
  assert.match(await page.locator('.proof-native').textContent(), /QUALIFIED: false/);
  assert.equal(await page.locator('.proof-sources a').count(), 2);
  await page.locator('.proof-data summary').click();
  const downloaded = page.waitForEvent('download');
  await page.locator('[data-action="proof-download"]').click();
  await (await downloaded).saveAs(`${out}/teaching-example.json`);
  const bundle = JSON.parse(await readFile(`${out}/teaching-example.json`, 'utf8'));
  assert.equal(bundle.teachingOnly, true); assert.equal(bundle.nativeCryptographicQualification, false);
  assert.deepEqual(bundle.folds[2].values, [3, 3, 3, 3]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="proof-stage-5"]').click();
  await page.screenshot({ path: `${out}/mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  reduced.on('pageerror', e => errors.push(e.message));
  await reduced.goto(`${url}/#/proofs`);
  await reduced.waitForFunction(() => !!window.render_game_to_text);
  await reduced.evaluate(() => window.advanceTime(2000));
  assert.equal((await state(reduced)).animationTime, 0);
  assert.equal(await reduced.locator('[data-action="proof-play"]').isDisabled(), true);
  await reduced.locator('[data-action="proof-next"]').click();
  assert.equal((await state(reduced)).stage, 1);
  checks.push('Teaching-only download, mobile layout, direct hash route and reduced-motion controls');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, roots, errors }, null, 2));
  console.log('Proof workshop browser checks passed.');
} finally { await browser.close(); }
