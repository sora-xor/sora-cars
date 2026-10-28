import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchChromium } from './lib/browser-launch.mjs';

const origin = process.env.SORA_CARS_TEST_ORIGIN ?? 'http://127.0.0.1:5173';
const out = process.env.SORA_CARS_TEST_OUTPUT ?? 'output/browser/cutscene-layout';
await mkdir(out, { recursive: true });
await writeFile(`${out}/fixture.html`, `<!doctype html><html lang="ja"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cutscene layout regression</title><body><main id="app" data-view="cutscene"><section id="screen"></section></main><script type="module">
import '/src/style.css';import '/src/ui/story.css';
import {CutscenePlayer} from '/src/ui/story.ts';import {CHAPTERS} from '/src/game/story.ts';
const drawImage=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
 if(this.canvas.classList.contains('cutscene-canvas') && image instanceof HTMLImageElement){
  const [x,y,w,h]=args,t=this.getTransform(),a=t.transformPoint({x,y}),b=t.transformPoint({x:x+w,y:y+h});
  window.paintedFrame={left:a.x,top:a.y,right:b.x,bottom:b.y,width:this.canvas.width,height:this.canvas.height};
 }
 return drawImage.call(this,image,...args);
};
const p=new CutscenePlayer(document.querySelector('#screen'));let time=0;
window.fixture={open(id,phase,line=0){p.show(CHAPTERS[id],CHAPTERS[id][phase],()=>{});for(let i=0;i<line;i++){p.next();if(p.state.line===i)p.next()}},next(){p.next()},back(){p.previous()},pause(){p.pauseMotion()},draw(){p.draw(time)},advance(ms){time+=ms/1000;p.draw(time)},state(){return p.state},longest(){return CHAPTERS.flatMap(c=>['intro','victory'].flatMap(phase=>c[phase].map((l,line)=>({chapter:c.id,phase,line,length:l.ja.length+l.en.length})))).sort((a,b)=>b.length-a.length)[0]}};
window.render_game_to_text=()=>JSON.stringify({mode:'cutscene',story:{cutscene:p.state}});window.advanceTime=ms=>window.fixture.advance(ms);
document.addEventListener('keydown',e=>p.key(e));document.addEventListener('click',e=>{const a=e.target.closest('[data-action]')?.dataset.action;if(a==='scene-next')p.next();if(a==='scene-back')p.previous();if(a==='scene-pause')p.pauseMotion();if(a==='scene-log')p.openLog();if(a==='scene-log-close')p.closeLog()});
const params=new URLSearchParams(location.search);window.fixture.open(Number(params.get('chapter')??8),params.get('phase')??'victory',Number(params.get('line')??6));
function draw(){p.draw(time);requestAnimationFrame(draw)}requestAnimationFrame(draw);
</script></body></html>`);

const browser = await launchChromium({ headless: true });
const errors = [], checks = [];
async function settled(page) {
  await page.waitForFunction(() => window.fixture?.state().cinema?.ready && document.fonts.status === 'loaded'
    && [...document.querySelectorAll('.cutscene-portrait img')].every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { window.fixture.draw(); resolve(); }))));
}
async function layout(page) {
  return page.evaluate(() => {
    const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const copy = document.querySelector('.scene-copy');
    return { width: innerWidth, height: innerHeight, frame: window.paintedFrame, state: window.fixture.state(),
      canvas: bounds('canvas'), panel: bounds('.cutscene-dialogue'), heading: bounds('.cutscene-location'),
      copy: bounds('.scene-copy'), copyScrollHeight: copy.scrollHeight, copyClientHeight: copy.clientHeight,
      controls: ['scene-back','scene-log','scene-next'].map(action => bounds('[data-action="'+action+'"]')),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      verticalOverflow: document.documentElement.scrollHeight > innerHeight };
  });
}
function checkLayout(r) {
  const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  const viewport = { left: 0, top: 0, right: r.width, bottom: r.height };
  assert.equal(r.horizontalOverflow, false); assert.equal(r.verticalOverflow, false);
  assert.ok(r.canvas.width > 0 && r.canvas.height > 0, 'art has visible space');
  assert.ok(inside(r.canvas, viewport) && inside(r.panel, viewport), 'art and dialogue fit the viewport');
  assert.ok(r.canvas.bottom <= r.panel.top + 1 || r.canvas.right <= r.panel.left + 1, 'dialogue never overlays illustration');
  assert.ok(r.frame.left >= -.001 && r.frame.top >= -.001 && r.frame.right <= r.frame.width + .001 && r.frame.bottom <= r.frame.height + .001, 'whole image stays inside canvas, including motion');
  for (const button of r.controls) assert.ok(inside(button, r.panel) && inside(button, viewport), 'complete controls stay visible');
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${origin}/${out}/fixture.html`);
  await settled(page);
  const scenes = [
    { chapter: 8, phase: 'victory', line: 6, name: 'jacket' },
    { chapter: 2, phase: 'victory', line: 5, name: 'folder' },
    { chapter: 11, phase: 'intro', line: 2, name: 'garage-door' },
    { chapter: 11, phase: 'intro', line: 7, name: 'synthesizer' },
    { chapter: 10, phase: 'intro', line: 7, name: 'harbor-door' },
    { chapter: 5, phase: 'intro', line: 10, name: 'long-office' },
    { chapter: 7, phase: 'intro', line: 14, name: 'long-harbor' },
    { chapter: 2, phase: 'victory', line: 7, name: 'hood' },
    { chapter: 2, phase: 'victory', line: 8, name: 'mirror-jacket' },
    { ...await page.evaluate(() => window.fixture.longest()), name: 'longest-dialogue' },
  ];
  scenes.push(await page.evaluate(async () => {
    const { CHAPTERS } = await import('/src/game/story.ts');
    const { resolveStoryFrame } = await import('/src/game/story-scenes.ts');
    const chapter = CHAPTERS[11], line = chapter.intro.findIndex((_, index) => resolveStoryFrame(chapter.intro, index, 'ch12-intro').art.startsWith('scenes/ch12-intro-cut11-'));
    if (line < 0) throw new Error('Expected chapter 12 hood correction is absent');
    return { chapter: 11, phase: 'intro', line, name: 'final-hood' };
  }));
  for (const scene of scenes) {
    await page.evaluate(({ chapter, phase, line }) => window.fixture.open(chapter, phase, line), scene);
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [844, 390]]) {
      await page.setViewportSize({ width, height }); await settled(page);
      const result = await layout(page); checkLayout(result);
      await page.screenshot({ path: `${out}/${scene.name}-${width}.png` });
      // Scrolling a long paragraph must not move or hide the navigation.
      await page.locator('.scene-copy').evaluate(el => { el.scrollTop = el.scrollHeight; });
      const scrolled = await layout(page); checkLayout(scrolled); assert.deepEqual(scrolled.controls, result.controls);
      checks.push({ scene, ...result });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.fixture.open(8, 'victory', 6)); await settled(page);
  for (const ms of [0, 8000, 25000, 50000]) { await page.evaluate(ms => window.fixture.advance(ms), ms); checkLayout(await layout(page)); }
  await page.locator('[data-action="scene-pause"]').click();
  const frozen = await page.locator('canvas').evaluate(c => c.toDataURL());
  await page.evaluate(() => window.fixture.advance(3000));
  assert.equal(await page.locator('canvas').evaluate(c => c.toDataURL()), frozen, 'pause freezes rendering');
  await page.locator('[data-action="scene-log"]').click(); assert.equal(await page.locator('.scene-log').evaluate(el => el.open), true);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.scene-log').evaluate(el => el.open), false);
  await page.locator('[data-action="scene-back"]').click(); assert.equal((await page.evaluate(() => window.fixture.state())).line, 5);
  await page.locator('[data-action="scene-next"]').click(); assert.equal((await page.evaluate(() => window.fixture.state())).line, 6);
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), checks, errors, scope: 'Actual CutscenePlayer, full-image canvas bounds, separate art/dialogue, visible controls, scroll, motion, pause, back and log; local fixture only.' }, null, 2) + '\n');
  console.log(`PASS: ${checks.length} desktop/phone/landscape layouts; whole frames, reachable text and controls, safe motion and dialogue interactions.`);
} finally { await browser.close(); }
