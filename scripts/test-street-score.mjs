import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = process.env.STREET_SCORE_OUTPUT ?? 'output/browser/street-score';
await mkdir(out, { recursive: true });
const sourcePaths = ['src/ui/street-practice.ts', 'src/game/street/presentation.ts',
  'src/game/street/soundtrack-clock.ts', 'src/game/street/renderer.ts', 'scripts/test-street-score.mjs'];
const hash = data => createHash('sha256').update(data).digest('hex');
const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(path))])));
const replayPath = 'output/browser/street-practice/completed-replay.json';
const replay = await readFile(replayPath, 'utf8');
const report = { kind: 'tokyo-jo-ha-kyu-presentation', base, sources, replaySha256: hash(replay),
  checks: [], captures: [], errors: [], actualMediaPlayback: true, historicalOnsetsQualified: false,
  humanPlaythrough: false, physicsChanged: false, proofQualified: false };
const check = (value, label) => { assert.ok(value, label); report.checks.push(label); };
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms = 0) => page.evaluate(ms => window.advanceTime(ms), ms);
const capture = async (page, name) => {
  await advance(page); const path = `${out}/${name}.png`;
  await page.screenshot({ path }); report.captures.push(path);
};
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.addInitScript(text => {
    localStorage.setItem('sora-cars:street-history', JSON.stringify([text]));
    window.__scoreSongs = [];
    window.Audio = new Proxy(window.Audio, { construct(target, args) {
      const audio = Reflect.construct(target, args, target); window.__scoreSongs.push(audio); return audio;
    } });
  }, replay);
  await page.goto(`${base}/#/history`);
  await page.waitForFunction(() => window.render_game_to_text);
  await advance(page);
  console.log('Recomputing the complete retained replay through the production importer');
  await page.locator('[data-action="street-history-0"]').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).street?.phase === 'ready', null, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  check((await state(page)).street.verification === 'local-reexecution', 'full public replay reexecution precedes all presentation captures');
  await page.keyboard.press('KeyM');
  if (!(await state(page)).music) await page.keyboard.press('KeyM');
  await page.locator('[data-action="street-start"]').click();
  await advance(page, 1000);
  async function mediaAt(expected, playing = true) {
    let measured;
    for (let i = 0; i < 80; i++) {
      await advance(page); await page.waitForTimeout(30);
      measured = await page.evaluate(() => {
        const audio = window.__scoreSongs.at(-1);
        return { time: audio.currentTime, paused: audio.paused, seeking: audio.seeking,
          rate: audio.playbackRate, readyState: audio.readyState, ended: audio.ended, loop: audio.loop };
      });
      if (!measured.seeking && measured.paused === !playing && Math.abs(measured.time - expected) < .55) break;
    }
    check(!measured.seeking && measured.paused === !playing && Math.abs(measured.time - expected) < .55,
      `actual recorded audio ${playing ? 'plays' : 'pauses'} at simulation second ${expected.toFixed(2)}`);
    check(measured.rate === 1 && !measured.loop, 'original recording is neither time-stretched nor looped');
    return measured;
  }
  await mediaAt((await state(page)).tick / 30);
  check(!(await state(page)).drivingSound.active, 'replay does not start the local driver engine');
  console.log('Checking all five authored cue boundaries, rewind, pause, and mute');
  const cueTicks = [0, 1440, 3480, 5040, 6420];
  const stages = ['序', '破', '破', '急', '急'];
  for (const [index, tick] of cueTicks.entries()) {
    await page.locator('#street-seek').evaluate((slider, tick) => {
      slider.value = String(tick + 15); slider.dispatchEvent(new Event('change', { bubbles: true }));
    }, tick);
    const before = await state(page);
    check(before.street.presentation.index === index && before.street.presentation.stage === stages[index], `chapter ${index + 1} follows the admitted cue time`);
    check(before.street.presentation.japanese && before.street.presentation.english, `chapter ${index + 1} has Japanese and English titles`);
    const frozen = JSON.stringify(before.street.nativeValues);
    await page.waitForTimeout(140); await advance(page, 250);
    check(JSON.stringify((await state(page)).street.nativeValues) === frozen, `paused chapter ${index + 1} preserves every native output`);
    await capture(page, `desktop-chapter-${index + 1}`);
    await page.keyboard.press('Escape'); await mediaAt((tick + 15) / 30);
    await page.keyboard.press('Escape');
  }
  const pauseTime = await page.evaluate(() => window.__scoreSongs.at(-1).currentTime);
  await page.waitForTimeout(250); await advance(page, 500);
  check(Math.abs(await page.evaluate(() => window.__scoreSongs.at(-1).currentTime) - pauseTime) < .02, 'pause freezes the real recording while wall time passes');
  // A rewind must restore both the earlier visual chapter and music position.
  await page.locator('#street-seek').evaluate(slider => { slider.value = '1500'; slider.dispatchEvent(new Event('change', { bubbles: true })); });
  check((await state(page)).street.presentation.index === 1, 'rewind restores the earlier chapter');
  await page.keyboard.press('Escape'); await mediaAt(50);
  await page.keyboard.press('KeyM'); await advance(page, 2000);
  check(!(await state(page)).street.musicPlaying, 'muted playback stays silent as simulation advances');
  const enabledAt = (await state(page)).tick / 30;
  await page.keyboard.press('KeyM'); await mediaAt(enabledAt);
  // Real HTMLMediaElement completion with a deliberately advanced media clock.
  await page.evaluate(async () => {
    const audio = window.__scoreSongs.at(-1);
    audio.currentTime = audio.duration - .04;
    await audio.play();
    if (!audio.ended) await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('media did not end')), 3000);
      audio.addEventListener('ended', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
  });
  await advance(page);
  check(await page.evaluate(() => window.__scoreSongs.at(-1).ended && window.__scoreSongs.at(-1).paused), 'an ended recording cannot implicitly loop during ordinary frames');
  await page.evaluate(() => Object.defineProperty(window.__scoreSongs.at(-1), 'duration', { configurable: true, get: () => NaN }));
  await page.locator('#street-seek').evaluate(slider => { slider.value = '300'; slider.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.keyboard.press('Escape'); await advance(page);
  check(!(await state(page)).street.musicPlaying, 'ended rewind waits while decoded duration is unavailable');
  await page.evaluate(() => { delete window.__scoreSongs.at(-1).duration; });
  await mediaAt(10);
  check((await state(page)).street.presentation.index === 0, 'explicit rewind after media end restores the opening');

  // Keep actual playback, but delay one play() acknowledgement to exercise
  // callback ordering that normal fast local media rarely encounters.
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const audio = window.__scoreSongs.at(-1), original = audio.play.bind(audio); let first = true;
    audio.play = () => {
      const playing = original();
      if (!first) return playing;
      first = false;
      return playing.then(() => new Promise((_, reject) => { window.__rejectOldScorePlay = reject; }));
    };
  });
  await page.keyboard.press('Escape'); await mediaAt(10);
  await page.waitForFunction(() => window.__rejectOldScorePlay);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await mediaAt(10);
  await page.evaluate(() => window.__rejectOldScorePlay(new Error('obsolete playback request')));
  await page.waitForTimeout(30);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await mediaAt(10);
  check((await state(page)).street.musicPlaying, 'late rejection of an obsolete play request cannot block resumed music');

  console.log('Checking reduced motion, mobile layout, end-of-song and results');
  await page.keyboard.press('Escape');
  for (const reduced of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion: reduced });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#street-seek').evaluate(slider => { slider.value = '6435'; slider.dispatchEvent(new Event('change', { bubbles: true })); });
    const values = JSON.stringify((await state(page)).street.nativeValues);
    await capture(page, `mobile-dawn-${reduced}`);
    await page.locator('[data-action="street-camera-aerial"]').click(); await advance(page);
    check(JSON.stringify((await state(page)).street.nativeValues) === values, `${reduced} and camera changes preserve all native state`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${reduced} mobile has no horizontal overflow`);
    await page.locator('[data-action="street-camera-chase"]').click();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#street-seek').evaluate(slider => { slider.value = '7800'; slider.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.keyboard.press('Escape'); await advance(page);
  check(!(await state(page)).street.musicPlaying && (await state(page)).street.phase === 'driving', 'song completion does not finish or loop an unfinished race');
  await page.locator('#street-seek').evaluate(slider => { slider.value = slider.max; slider.dispatchEvent(new Event('change', { bubbles: true })); });
  await advance(page);
  check((await state(page)).street.phase === 'results' && !(await state(page)).street.musicPlaying && !(await state(page)).drivingSound.active, 'results stop both the supplied song and engine');
  await page.locator('[data-action="street-exit"]').click();
  check(await page.evaluate(() => window.__scoreSongs.every(audio => audio.paused && !audio.hasAttribute('src'))), 'leaving releases every recorded music element');
  check(report.errors.length === 0, 'browser has no JavaScript or console errors');
  for (const [path, expected] of Object.entries(sources)) assert.equal(hash(await readFile(path)), expected, `source changed during test: ${path}`);
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks: report.checks.length, captures: report.captures.length, errors: report.errors }));
} finally {
  await writeFile(`${out}/observations.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
