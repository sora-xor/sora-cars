import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.GARAGE_TEST_URL ?? 'http://127.0.0.1:41813/';
const output = resolve(process.env.GARAGE_TEST_OUTPUT ?? 'output/playwright/garage-layout');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const results = [];
let activePage;
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const mobile = viewport.width < 700, label = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(), errors = [], transportErrors = [];
    activePage = page;
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => transportErrors.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on('response', response => { if (response.status() >= 400) transportErrors.push({ url: response.url(), status: response.status() }); });
    const activate = locator => mobile ? locator.tap() : locator.click();
    const garage = async () => {
      await page.goto(new URL('#/garage', origin).href);
      await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-view') === 'garage' && document.fonts.status === 'loaded');
    };
    await garage();
    const bounds = await page.evaluate(() => {
      const panel = document.querySelector('.garage-copy'), footer = document.querySelector('.footer');
      return { panelBottom: panel.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top,
        scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight };
    });
    assert.ok(bounds.panelBottom < bounds.footerTop, `${label}: garage scroll region ends above the footer`);
    await page.screenshot({ path: `${output}/${label}-garage.png`, fullPage: true });
    await activate(page.locator('.garage-copy [data-action="custom"]'));
    assert.equal(await page.locator('#app').getAttribute('data-view'), 'custom', `${label}: lower workshop action works`);
    await garage();
    await activate(page.locator('.footer [data-action="settings"]'));
    assert.equal(await page.locator('#app').getAttribute('data-view'), 'settings', `${label}: footer remains interactive`);
    await garage();
    const practice = page.locator('.garage-copy [data-action="practice"]');
    await practice.scrollIntoViewIfNeeded();
    const hit = await practice.evaluate(button => {
      const box = button.getBoundingClientRect(), target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { buttonOwnsPointer: target === button || button.contains(target), top: box.top, bottom: box.bottom };
    });
    assert.equal(hit.buttonOwnsPointer, true, `${label}: Practice owns its pointer target`);
    await page.screenshot({ path: `${output}/${label}-practice-control.png`, fullPage: true });
    await activate(practice);
    assert.equal(await page.locator('#app').getAttribute('data-view'), 'race', `${label}: Practice enters the race`);
    await page.waitForFunction(() => ['ready', 'failed'].includes(JSON.parse(window.render_game_to_text()).graphics.status), undefined, { timeout: 60000 });
    const graphics = await page.evaluate(() => JSON.parse(window.render_game_to_text()).graphics);
    assert.equal(graphics.status, 'ready', `${label}: scene failed: ${JSON.stringify({ graphics, transportErrors })}`);
    await activate(page.locator('#race-tools [data-action="pause"]'));
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(state.paused, true, `${label}: race Pause works after real scene readiness`);
    assert.deepEqual(errors, [], `${label}: no page errors`);
    await page.screenshot({ path: `${output}/${label}-paused.png`, fullPage: true });
    results.push({ viewport, mobile, bounds, hit, graphics: state.graphics.status, paused: state.paused, errors });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify({ origin, results }, null, 2) + '\n');
  console.log(JSON.stringify({ output, results }));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${output}/failed.png`, fullPage: true });
    await writeFile(`${output}/failed-state.json`, await activePage.evaluate(() => window.render_game_to_text?.() ?? '{}'));
  }
  throw error;
} finally {
  await browser.close();
}
