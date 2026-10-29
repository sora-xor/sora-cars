import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const origin = process.env.SORA_CARS_TEST_ORIGIN ?? 'http://127.0.0.1:5173';
const sourcePaths = ['scripts/test-story.mjs', 'src/main.ts', 'src/game/story.ts', 'src/game/story-dialogue.ts',
  'src/game/story-campaign.ts', 'src/game/story-campaign-act1.ts', 'src/game/story-campaign-act2.ts',
  'src/game/story-campaign-act3.ts', 'src/game/story-scenes.ts', 'src/game/story-cinema.ts',
  'src/game/story-workshop.ts', 'src/ui/story.ts', 'src/ui/story.css', 'src/style.css',
  'src/ui/story-workshop.ts', 'src/ui/story-workshop.css', 'src/game/audio.ts',
  'src/game/music-score.ts', 'src/game/music-themes.ts', 'src/game/music-cues.ts'];
const sourcePins = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
  [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const sourcesBefore = await sourcePins();
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
const errors = [], captures = [], chapters = [], checks = [], pivotalScenes = [], musicChecks = [], captionChecks = [];
const out = 'output/browser/story';
await mkdir(out, { recursive: true });
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
function musicCue(actual, expected, previous) {
  assert.equal(actual.source, 'cutscene');
  assert.equal(actual.cue, expected.key, 'the displayed dialogue selects its exact authored music cue');
  assert.equal(actual.track, expected.track); assert.equal(actual.narrative, expected.narrative);
  assert.equal(actual.silent, expected.track === null, 'a cue without a song is a deliberate silence');
  assert.equal(actual.transition, expected.transition);
  assert.equal(actual.mood, expected.mood); assert.equal(actual.arrangement, expected.arrangement.id);
  assert.equal(actual.requestedEntryBeat, expected.entryBeat, 'the current line requests its authored musical section');
  assert.deepEqual(actual.stems, expected.arrangement.gains);
  if (previous && previous.track === actual.track) {
    assert.equal(actual.startedAt, previous.startedAt, 'camera cuts and held lines preserve musical time');
    assert.equal(actual.transitions, previous.transitions, 'camera arrangement changes never restart the song');
    assert.equal(actual.entryBeat, previous.entryBeat, 'camera cuts retain the section used at the song entrance');
  }
  if (previous && previous.track !== actual.track && actual.track !== null) assert.equal(actual.entryBeat, expected.entryBeat, 'a new song enters its authored phrase');
  if (previous && previous.cue === actual.cue) assert.equal(actual.arrangementChanges, previous.arrangementChanges, 'held dialogue does not repeat an arrangement change');
  musicChecks.push({ cue: actual.cue, title: actual.title, narrative: actual.narrative, arrangement: actual.arrangement, entryBeat: actual.entryBeat, requestedEntryBeat: actual.requestedEntryBeat, transitions: actual.transitions });
  return actual;
}
async function reveal(page) {
  const full = await page.locator('#scene-japanese').getAttribute('aria-label');
  if (await page.locator('#scene-japanese').textContent() !== full) await page.locator('[data-action="scene-next"]').click();
}
async function next(page) {
  await reveal(page); await page.locator('[data-action="scene-next"]').click();
}
async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png` }); captures.push(name);
}
const pixels = page => page.locator('.cutscene-canvas').evaluate(canvas => canvas.toDataURL());
async function exactDialogue(page, expected) {
  await reveal(page);
  assert.equal(await page.locator('#scene-japanese').getAttribute('aria-label'), expected.ja);
  assert.equal(await page.locator('#scene-japanese').textContent(), expected.ja);
  assert.equal(await page.locator('.scene-subtitle').textContent(), expected.en);
  assert.equal(await page.locator('.cutscene-location > p').textContent(), expected.displayedSetting.ja, 'the visible Japanese caption belongs to this line');
  assert.equal(await page.locator('.cutscene-location > span').textContent(), expected.displayedSetting.en, 'the visible English caption belongs to this line');
}
async function exactLog(page, lines, furthest) {
  const entries = await page.locator('.scene-log li').evaluateAll(items => items.map(item => {
    const dialogue = [...item.querySelectorAll(':scope > p:not(.scene-log-setting)')];
    const setting = item.querySelector('.scene-log-setting');
    return { ja: dialogue[0]?.textContent, en: dialogue[1]?.textContent,
      ...(setting ? { setting: { ja: [...setting.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(''), en: setting.querySelector('[lang="en"]')?.textContent } } : {}) };
  }));
  assert.deepEqual(entries, lines.slice(0, furthest + 1).map(({ ja, en, setting }) => ({ ja, en, ...(setting ? { setting } : {}) })), 'the log retains seen dialogue and its explicit time/place captions without exposing future lines');
  return entries;
}
async function subtitleLayout(page) {
  // The narrow layout deliberately allows panel scrolling. Verify both texts
  // remain reachable inside that panel, rather than accepting hidden overflow.
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.cutscene-dialogue');
    const bounds = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const texts = ['#scene-japanese', '.scene-subtitle'].map(selector => {
      const element = document.querySelector(selector); element.scrollIntoView({ block: 'nearest' });
      const rect = bounds(element), within = bounds(panel), style = getComputedStyle(element);
      return { selector, rect, panel: within, scrollTop: panel.scrollTop, fontSize: style.fontSize,
        fullyReachable: rect.top >= within.top - 1 && rect.bottom <= within.bottom + 1,
        horizontalOverflow: element.scrollWidth > element.clientWidth + 1 };
    });
    const location = document.querySelector('.cutscene-location');
    return { width: innerWidth, height: innerHeight, documentOverflow: document.documentElement.scrollWidth > innerWidth,
      panel: bounds(panel), panelScrollHeight: panel.scrollHeight, panelClientHeight: panel.clientHeight, texts,
      location: bounds(location), locationOverflow: location.scrollWidth > location.clientWidth + 1 };
  });
  assert.equal(layout.documentOverflow, false, 'pivotal mobile scene stays within viewport width');
  assert.ok(layout.panel.top >= 0 && layout.panel.bottom <= layout.height + 1, 'dialogue panel stays within the viewport');
  assert.equal(layout.locationOverflow, false, 'the time/place caption does not clip horizontally');
  assert.ok(layout.location.top >= 0 && layout.location.bottom <= layout.panel.top, 'the complete time/place caption remains above the dialogue panel');
  for (const text of layout.texts) {
    assert.equal(text.horizontalOverflow, false, `${text.selector} does not clip horizontally`);
    assert.equal(text.fullyReachable, true, `${text.selector} can be read completely inside the dialogue panel`);
  }
  return layout;
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url ?? 'unknown resource'})`); });
  await page.goto(`${origin}/#/story`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && document.fonts.status === 'loaded');
  const campaign = await page.evaluate(async () => {
    const { CHAPTERS } = await import('/src/game/story.ts');
    const { resolveStoryShot, resolveStorySetting } = await import('/src/game/story-scenes.ts');
    const { resolveCutsceneCue } = await import('/src/game/music-cues.ts');
    const withSettings = lines => lines.map((line, index) => ({ ...line, displayedSetting: resolveStorySetting(lines, index) }));
    return CHAPTERS.map(chapter => ({ ...chapter,
      intro: withSettings(chapter.intro), victory: withSettings(chapter.victory),
      introMusic: chapter.intro.map((_, index) => resolveCutsceneCue(chapter.id, 'intro', index, resolveStoryShot(chapter.intro, index))),
      victoryMusic: chapter.victory.map((_, index) => resolveCutsceneCue(chapter.id, 'victory', index, resolveStoryShot(chapter.victory, index))),
      introShots: chapter.intro.map((_, index) => resolveStoryShot(chapter.intro, index)),
      victoryShots: chapter.victory.map((_, index) => resolveStoryShot(chapter.victory, index)) }));
  });
  assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
  assert.equal(await page.locator('.crew-roster:not(.rival-roster) article').count(), 6);
  assert.equal(await page.locator('.rival-roster article').count(), 3);
  assert.equal(await page.locator('.story-chapter').count(), 12);
  assert.equal(await page.locator('.story-chapter:disabled').count(), 11);
  assert.equal(await page.locator('.story-chapter:disabled .chapter-synopsis').count(), 0, 'locked chapters reveal no future synopsis');
  assert.equal(await page.locator('.story-act').count(), 3);
  assert.equal(await page.locator('.story-dossier details').count(), 0, 'no unseen clues are disclosed');
  await shot(page, 'campaign-menu');
  await page.locator('.story-chapter[data-action="chapter-0"]').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).story.cutscene?.cinema?.ready);
  await reveal(page);
  await exactDialogue(page, campaign[0].intro[0]);
  assert.equal((await read(page)).musicState.enabled, true, 'cutscene music starts enabled');
  assert.equal(await page.locator('.scene-music').getAttribute('aria-pressed'), 'true');
  await page.locator('.scene-music[data-action="music"]').click();
  assert.equal((await read(page)).musicState.enabled, false);
  assert.equal(await page.locator('.scene-music').getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('KeyM');
  assert.equal(await page.locator('.scene-music').getAttribute('aria-pressed'), 'true');
  const start = await read(page);
  musicCue(start.musicState, campaign[0].introMusic[0]);
  assert.equal(start.musicState.enabled, true);
  await page.evaluate(() => window.advanceTime(0));
  const a = await pixels(page);
  await page.evaluate(() => window.advanceTime(3000));
  assert.notEqual(await pixels(page), a, 'artwork animation changes actual canvas pixels');
  assert.equal((await read(page)).tick, start.tick, 'dialogue does not run physics');
  assert.equal((await read(page)).story.cutscene.line, start.story.cutscene.line, 'animation never advances dialogue');
  musicCue((await read(page)).musicState, campaign[0].introMusic[0], start.musicState);
  await page.keyboard.press('KeyP');
  const pausedPixels = await pixels(page);
  await page.evaluate(() => window.advanceTime(3000));
  assert.equal(await pixels(page), pausedPixels, 'pause freezes the actual scene, including camera and props');
  musicCue((await read(page)).musicState, campaign[0].introMusic[0], start.musicState);
  await page.keyboard.press('KeyP');
  await shot(page, 'garage-desktop');
  // Exercise the real gamepad polling path with a controllable device counterpart.
  await page.evaluate(() => {
    window.storyPadHeld = true;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ connected: true, buttons: Array.from({ length: 10 }, (_, i) => ({ pressed: i === 0 && window.storyPadHeld })) }] });
  });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).story.cutscene.line === 1);
  await page.waitForTimeout(150);
  assert.equal((await read(page)).story.cutscene.line, 1, 'holding gamepad A cannot consume multiple lines');
  musicCue((await read(page)).musicState, campaign[0].introMusic[1], start.musicState);
  await page.evaluate(() => { window.storyPadHeld = false; }); await page.waitForTimeout(70);
  await page.evaluate(() => { delete navigator.getGamepads; });
  await page.locator('[data-action="scene-back"]').click();
  for (let i = 0; i < 3; i++) await next(page);
  await reveal(page); await page.evaluate(() => window.advanceTime(1000));
  assert.equal((await read(page)).story.cutscene.cinema.scene, 'ledger');
  musicCue((await read(page)).musicState, campaign[0].introMusic[3]);
  await shot(page, 'ledger-desktop');
  await page.locator('[data-action="scene-back"]').click();
  assert.equal((await read(page)).story.cutscene.line, 2);
  assert.equal((await read(page)).story.cutscene.cinema.scene, 'garage');
  const backMusic = musicCue((await read(page)).musicState, campaign[0].introMusic[2]);
  await page.keyboard.press('KeyL');
  assert.equal(await page.locator('.scene-log li').count(), 4);
  await shot(page, 'dialogue-log');
  await page.keyboard.press('Escape');
  assert.equal((await read(page)).mode, 'cutscene', 'Escape closes the log without skipping the chapter');
  assert.equal((await read(page)).story.cutscene.logOpen, false);
  musicCue((await read(page)).musicState, campaign[0].introMusic[2], backMusic);
  await next(page); await reveal(page); await page.evaluate(() => window.advanceTime(1000));
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'ledger-mobile');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  // Clicking the picture advances like Next; a clicked toolbar button hands Enter back to the dialogue.
  const clickedLine = (await read(page)).story.cutscene.line;
  await page.locator('.cutscene-canvas').click();
  assert.equal((await read(page)).story.cutscene.line, clickedLine + 1, 'clicking the picture advances the dialogue');
  await page.locator('[data-action="scene-pause"]').click();
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  assert.equal((await read(page)).story.cutscene.line, clickedLine + 2, 'Enter advances after a toolbar click');
  assert.equal((await read(page)).story.cutscene.motionPaused, true, 'Enter does not press the clicked toolbar button again');
  await page.keyboard.press('KeyP');
  // One Escape only arms the skip; the second skips to the pre-race garage.
  await page.keyboard.press('Escape');
  assert.equal((await read(page)).mode, 'cutscene', 'a single Escape cannot discard the scene');
  assert.equal((await read(page)).story.cutscene.skipArmed, true);
  assert.match(await page.locator('[data-action="scene-skip"]').innerText(), /PRESS AGAIN TO SKIP/);
  await page.keyboard.press('Escape');
  assert.equal((await read(page)).mode, 'pit', 'the introduction leads to the pre-race garage');
  await page.locator('[data-action="pit-go"]').click();
  assert.equal((await read(page)).mode, 'race');
  assert.equal((await read(page)).story.activeChapter, 0);
  assert.equal((await read(page)).musicState.source, 'song');
  assert.equal((await read(page)).musicState.track, campaign[0].trackId, 'skip starts the original course race song');
  await page.evaluate(() => window.soraCars.finishPractice());
  const outcome = await read(page);
  assert.equal(outcome.mode, 'cutscene', 'actual simulated result triggers the story outcome');
  assert.equal(outcome.drivingSound.active, false);
  const cleared = outcome.story.cutscene.phase === 'victory';
  assert.match(await page.locator('.cutscene-status').innerText(), cleared ? /CHAPTER CLEARED/ : /NEEDED/, 'the aftermath states the race result it reacts to');
  await page.locator('[data-action="scene-skip"]').click(); await page.locator('[data-action="scene-skip"]').click();
  const result = await read(page);
  assert.equal(result.mode, 'results'); assert.equal(result.story.resultChapter, 0);
  assert.equal(result.stakeEnabled, false);
  assert.match(await page.locator('.results-panel .eyebrow').innerText(), cleared ? /CHAPTER CLEARED/ : /OBJECTIVE MISSED/);
  assert.equal(await page.locator('.result-actions .primary').first().getAttribute('data-action'), cleared ? 'chapter-1' : 'chapter-retry-0', 'a clear leads on; a miss retries the race');
  if (cleared) {
    await page.locator('.result-actions [data-action="chapter-0"]').click();
    assert.equal((await read(page)).story.cutscene.chapter, 0, 'replay returns to the chapter, not anonymous practice');
  } else {
    await page.locator('.result-actions [data-action="chapter-retry-0"]').click();
    assert.equal((await read(page)).mode, 'pit', 'a retry skips the introduction it has already shown');
    assert.equal((await read(page)).story.activeChapter, 0);
  }
  checks.push('Real intro → pre-race garage → deterministic AI race → outcome with its result → story result → next/retry; animation, back, log, pause, picture click, two-press skip, frozen physics.');
  // Chapter-selection fixture unlocks access only; each intro and its race transition run through the real app.
  await page.evaluate(() => localStorage.setItem('sora-cars:story:sky-1986', '12'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seenScenes = new Set();
  for (let id = 0; id < 12; id++) {
    await page.goto(`${origin}/#/story`, { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
    if (id === 0) {
      assert.equal(await page.locator('.story-dossier details').count(), 12);
      await page.locator('.story-dossier summary').first().click();
      assert.equal(await page.locator('.story-dossier details').first().locator('p:not([lang])').innerText(), campaign[0].dossier.ja);
      assert.equal(await page.locator('.story-dossier details').first().locator('p[lang="en"]').innerText(), campaign[0].dossier.en);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(`.story-chapter[data-action="chapter-${id}"]`).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).story.cutscene?.cinema?.ready);
    const count = (await read(page)).story.cutscene.count;
    assert.equal(count, campaign[id].intro.length, 'actual campaign controls introduction length');
    let previousMusic;
    for (let line = 0; line < count; line++) {
      const state = await read(page);
      assert.equal(state.story.cutscene.line, line);
      previousMusic = musicCue(state.musicState, campaign[id].introMusic[line], previousMusic);
      await exactDialogue(page, campaign[id].intro[line]);
      assert.match(await page.locator('#scene-japanese').innerText(), /[\u3040-\u30ff\u4e00-\u9fff]/);
      assert.ok((await page.locator('.scene-subtitle').innerText()).length > 10);
      const scene = state.story.cutscene.cinema.scene;
      assert.equal(scene, campaign[id].introShots[line].scene, 'current explicit shot resolves to the intended artwork');
      if (!seenScenes.has(scene)) {
        await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).story.cutscene?.cinema?.ready);
        await page.evaluate(() => window.advanceTime(1));
        await shot(page, `${scene}-script-desktop`);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => window.advanceTime(1));
        await shot(page, `${scene}-script-mobile`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.setViewportSize({ width: 1440, height: 1000 });
        seenScenes.add(scene);
      }
      if (line === 0) {
        await page.evaluate(() => window.advanceTime(0)); const still = await pixels(page);
        await page.evaluate(() => window.advanceTime(2000));
        assert.equal(await pixels(page), still, 'reduced motion keeps the full illustration static');
      }
      if (line === count - 1) assert.match(await page.locator('[data-action="scene-next"]').innerText(), /TO THE PRE-RACE GARAGE/, 'the last line says where it leads');
      await page.locator('[data-action="scene-next"]').click();
    }
    assert.equal((await read(page)).mode, 'pit'); assert.equal((await read(page)).story.activeChapter, id);
    await page.locator('[data-action="pit-go"]').click();
    const race = await read(page); assert.equal(race.mode, 'race'); assert.equal(race.story.activeChapter, id);
    assert.equal(race.names.indexOf('YOU'), race.playerSlot);
    assert.equal(race.musicState.source, 'song'); assert.equal(race.musicState.track, campaign[id].trackId);
    if (id >= 3) assert.match(race.names[7], /天宮/);
    chapters.push({ id, introLines: count, track: race.track, opponent: race.names[7] });
  }
  assert.equal(seenScenes.size, 8);
  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  touch.on('pageerror', error => errors.push(error.message));
  await touch.goto(`${origin}/#/story`, { waitUntil: 'domcontentloaded' });
  await touch.locator('.story-resume').tap();
  await touch.waitForFunction(() => JSON.parse(window.render_game_to_text()).story.cutscene?.cinema?.ready);
  await touch.locator('[data-action="scene-next"]').tap();
  assert.equal((await read(touch)).story.cutscene.line, 1);
  await touch.locator('[data-action="scene-back"]').tap();
  await touch.locator('[data-action="scene-log"]').tap();
  assert.equal((await read(touch)).story.cutscene.logOpen, true);
  await shot(touch, 'touch-dialogue-log');
  await touch.locator('[data-action="scene-log-close"]').tap();
  await touch.locator('.cutscene-canvas').tap();
  assert.equal((await read(touch)).story.cutscene.line, 1, 'tapping the picture advances the dialogue');
  await touch.locator('[data-action="scene-skip"]').tap();
  assert.equal((await read(touch)).mode, 'cutscene', 'one tap only arms the skip');
  // The pre-race garage builds its 3D part art on arrival, which can hold touch acknowledgement for seconds.
  await touch.locator('[data-action="scene-skip"]').tap({ timeout: 90_000 });
  assert.equal((await read(touch)).mode, 'pit');
  await touch.locator('[data-action="pit-go"]').tap({ timeout: 90_000 });
  assert.equal((await read(touch)).mode, 'race');
  assert.equal(await touch.locator('#touch-controls').isVisible(), true);
  await touch.close();
  checks.push('Real touch events advance/back/log/skip into touch driving; a gamepad counterpart exercises A edge detection.');
  checks.push('All 12 introductions, 8 scene assets, 9 speakers, three acts and unlocked clue file; actual rival grid and reduced-motion pixels.');
  const pivotRequests = [
    { chapter: 4, name: 'rain-near-confession', speaker: 'ren', text: /冗談にしないで言いたい/ },
    { chapter: 6, name: 'betrayal-confession', speaker: 'ren', text: /僕が渡した/ },
    { chapter: 7, name: 'public-confession', speaker: 'ren', text: /中継先の情報/ },
    { chapter: 7, name: 'public-confession-reverse', speaker: 'mei', text: /マイクを受け取る人の列/ },
    { chapter: 11, name: 'jun-premiere', speaker: 'jun', text: /長く待たせた新曲/ },
    { chapter: 11, name: 'jun-premiere-reverse', speaker: 'ren', text: /この番組は録音です/ },
    { chapter: 11, name: 'romance-confession-now', speaker: 'aki', text: /本当に黙っちゃった/ },
    { chapter: 11, name: 'romance-consent-question', speaker: 'aki', text: /キスしてもいい/ },
    { chapter: 11, name: 'romance-consent-answer', speaker: 'ren', text: /僕も、そうしたい/ },
    { chapter: 11, name: 'romance-first-kiss', speaker: 'aki', text: /録音、押すね/ },
  ].map(pivot => {
    const line = campaign[pivot.chapter].victory.findIndex(line => line.speaker === pivot.speaker && pivot.text.test(line.ja));
    assert.ok(line >= 0, `current campaign includes pivotal beat: ${pivot.name}`);
    return { chapter: pivot.chapter, name: pivot.name, line };
  });
  // Isolated UI fixture exercises every victory script even when the native AI fixture loses.
  await writeFile(`${out}/cinema.html`, `<!doctype html><html lang="ja"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated real CutscenePlayer fixture — no campaign victory claimed</title><body><main id="app" data-view="cutscene"><section id="screen"></section></main><script type="module">
    import '/src/style.css'; import '/src/ui/story.css';
    import {CutscenePlayer} from '/src/ui/story.ts'; import {CHAPTERS} from '/src/game/story.ts';
    import {GameAudio} from '/src/game/audio.ts'; import {resolveCutsceneCue} from '/src/game/music-cues.ts';
    import {resolveStoryShot} from '/src/game/story-scenes.ts'; const audio = new GameAudio();
    const player = new CutscenePlayer(document.querySelector('#screen')); let t=0, done=false;
    document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='scene-next')player.next();if(action==='scene-back')player.previous();if(action==='scene-log')player.openLog();if(action==='scene-log-close')player.closeLog();if(action==='scene-skip')player.finish();});
    window.fixture={open(id){done=false;player.show(CHAPTERS[id],CHAPTERS[id].victory,()=>{done=true;audio.endCutscene();},line=>audio.setCutsceneCue(resolveCutsceneCue(id,'victory',line,resolveStoryShot(CHAPTERS[id].victory,line))));},advance(ms){t+=ms/1000;player.draw(t);},read(){return{...player.state,done,musicState:audio.musicState};}};
    function frame(){player.draw(t);requestAnimationFrame(frame)} requestAnimationFrame(frame);
    </script></body></html>`);
  await page.goto(`${origin}/${out}/cinema.html`);
  await page.waitForFunction(() => window.fixture && document.fonts.status === 'loaded');
  for (let id = 0; id < 12; id++) {
    await page.evaluate(id => window.fixture.open(id), id);
    await page.waitForFunction(() => window.fixture.read().cinema?.ready);
    const count = await page.evaluate(() => window.fixture.read().count);
    assert.equal(count, campaign[id].victory.length, 'actual campaign controls aftermath length');
    let previousMusic;
    for (let i = 0; i < count; i++) {
      const fixture = await page.evaluate(() => window.fixture.read());
      assert.equal(fixture.line, i);
      previousMusic = musicCue(fixture.musicState, campaign[id].victoryMusic[i], previousMusic);
      await exactDialogue(page, campaign[id].victory[i]);
      assert.equal(await page.evaluate(() => window.fixture.read().cinema.scene), campaign[id].victoryShots[i].scene);
      assert.ok((await page.locator('.cutscene-speaker strong').innerText()).length > 0);
      assert.ok((await page.locator('.scene-subtitle').innerText()).length > 10);
      const pivot = pivotRequests.find(pivot => pivot.chapter === id && pivot.line === i);
      if (pivot) {
        await page.waitForFunction(() => window.fixture.read().cinema?.ready);
        await page.evaluate(() => window.fixture.advance(1));
        const prefix = `fixture-ch${String(id + 1).padStart(2, '0')}-${pivot.name}`;
        await shot(page, `${prefix}-desktop`);
        const layouts = [];
        for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }]) {
          await page.setViewportSize(viewport); await page.evaluate(() => window.fixture.advance(1));
          await exactDialogue(page, campaign[id].victory[i]);
          layouts.push(await subtitleLayout(page));
          await shot(page, `${prefix}-mobile-${viewport.width}`);
        }
        pivotalScenes.push({ ...pivot, phase: 'victory', evidence: 'Isolated real CutscenePlayer with current campaign dialogue; no race win or campaign unlock earned.',
          dialogue: campaign[id].victory[i], shot: campaign[id].victoryShots[i], layouts });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await page.locator('[data-action="scene-next"]').click();
    }
    assert.equal(await page.evaluate(() => window.fixture.read().done), true);
    chapters[id].victoryLines = count;
  }
  assert.equal(pivotalScenes.length, pivotRequests.length, 'every requested romance/betrayal beat has desktop and two narrow mobile captures');
  // The finale cuts to yesterday's recorded programme, then returns to Nikko.
  // Exercise navigation history so captions cannot leak across either cut.
  const finale = campaign[11].victory;
  assert.match(finale[3].setting.en, /RECORDED THE PREVIOUS MORNING/);
  assert.deepEqual(finale[4].setting, finale[3].setting);
  assert.match(finale[5].setting.en, /NOW.*NIKKO/);
  assert.equal(finale[6].setting, undefined, 'a subsequent line deliberately returns to the normal scene caption');
  assert.equal(finale[6].displayedSetting.en, 'NIKKO · MOUNTAIN OVERLOOK');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => window.fixture.open(11));
  for (let i = 0; i < 3; i++) await next(page);
  for (let i = 3; i <= 6; i++) {
    await exactDialogue(page, finale[i]);
    const layout = await subtitleLayout(page);
    await page.locator('[data-action="scene-log"]').click();
    assert.equal(await page.evaluate(() => window.fixture.read().logOpen), true);
    const entries = await exactLog(page, finale, i);
    let logSettingLayout;
    if (finale[i].setting) {
      const setting = page.locator('.scene-log li').nth(i).locator('.scene-log-setting');
      await setting.scrollIntoViewIfNeeded();
      logSettingLayout = await setting.evaluate(element => {
        const rect = element.getBoundingClientRect(), list = element.closest('ol').getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, listTop: list.top, listBottom: list.bottom,
          horizontalOverflow: element.scrollWidth > element.clientWidth + 1 };
      });
      assert.equal(logSettingLayout.horizontalOverflow, false, 'the recorded time/place caption wraps inside the narrow log');
      assert.ok(logSettingLayout.top >= logSettingLayout.listTop - 1 && logSettingLayout.bottom <= logSettingLayout.listBottom + 1, 'the complete log caption remains reachable');
    }
    if (i === 4 || i === 5) await shot(page, `finale-${i === 4 ? 'recorded' : 'now'}-caption-log-mobile-320`);
    await page.locator('[data-action="scene-log-close"]').click();
    assert.equal(await page.evaluate(() => window.fixture.read().logOpen), false);
    await exactDialogue(page, finale[i]);
    captionChecks.push({ chapter: 11, phase: 'victory', line: i, navigation: 'next', displayedSetting: finale[i].displayedSetting, seenLogLines: entries.length, layout, logSettingLayout });
    if (i < 6) await next(page);
  }
  for (const i of [5, 4]) {
    await page.locator('[data-action="scene-back"]').click();
    await exactDialogue(page, finale[i]);
    await page.locator('[data-action="scene-log"]').click();
    const entries = await exactLog(page, finale, 6);
    await page.locator('[data-action="scene-log-close"]').click();
    captionChecks.push({ chapter: 11, phase: 'victory', line: i, navigation: 'back', displayedSetting: finale[i].displayedSetting, seenLogLines: entries.length });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push('Every intro/victory caption checked against its line and scene; finale recorded-morning → now → ordinary Nikko captions survive Next, Back and the 320px log without leaking unseen dialogue.');
  // Verify actual radio artwork motion, not just a CSS animation declaration.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => { window.fixture.open(11); window.fixture.advance(1000); });
  for (let i = 0; i < 4; i++) await next(page);
  await page.evaluate(() => window.fixture.advance(1000)); const radioA = await pixels(page);
  await page.evaluate(() => window.fixture.advance(900));
  assert.notEqual(await pixels(page), radioA);
  assert.equal(await page.evaluate(() => window.fixture.read().cinema.scene), 'radio');
  await shot(page, 'radio-animated');
  checks.push('Every victory line and callback tested with isolated real CutscenePlayer fixture; animated radio canvas inspected.');
  checks.push('Every intro/victory line resolves the authored music cue; held dialogue, camera angles, Back, log and motion pause preserve transport; race transitions restore course songs.');
  checks.push('Pivotal chapter 5 romance, chapter 7 betrayal and chapter 12 mutual romance captured in isolated real-player fixtures at desktop, 390px and 320px; complete Japanese/English text and scroll reachability checked.');
  assert.deepEqual(errors, []);
  const sourcesAfter = await sourcePins();
  assert.deepEqual(sourcesAfter, sourcesBefore, 'story sources must stay unchanged throughout browser qualification');
  await writeFile('artifacts/story-browser.json', JSON.stringify({ passed: true, testedAt: new Date().toISOString(), origin, sourcesBefore, sourcesAfter,
    primaryLanguage: 'ja', subtitles: 'en', crew: 6, rivals: 3, chapters, checks, captures, pivotalScenes, musicChecks, captionChecks,
    chapterSelectionFixture: true, victorySceneFixture: true, fullHumanCampaignPlaythrough: false, localStoryResult: result.story, nftOrXorAwarded: false, errors }, null, 2));
  console.log('Story campaign passed: 12 intros, 12 victory scripts, 8 scenes, animation/log/pause, actual AI result and retry, rival grid, desktop/mobile and reduced motion.');
} catch (error) {
  await writeFile(`${out}/failure.json`, JSON.stringify({ error: String(error), origin, sourcesBefore, errors, checks, chapters, captures, pivotalScenes, captionChecks }, null, 2));
  throw error;
} finally { await browser.close(); }
