import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchChromium } from './lib/browser-launch.mjs';
const origin = process.env.SORA_CARS_TEST_ORIGIN ?? 'http://127.0.0.1:5173';
const out = process.env.SORA_CARS_TEST_OUTPUT ?? 'output/browser/cutscene-art-fresh';
const reportPath = process.env.SORA_CARS_TEST_REPORT ?? 'artifacts/cutscene-art-fresh.json';
await mkdir(out, { recursive: true });
await writeFile(`${out}/fixture.html`, `<!doctype html><html lang="ja"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cutscene art QA</title><body><main id="app" data-view="cutscene"><section id="screen"></section></main><script type="module">
import '/src/style.css';import '/src/ui/story.css';
import {CutscenePlayer} from '/src/ui/story.ts';import {CHAPTERS,RETRY_SCENE} from '/src/game/story.ts';
import {resolveStoryFrame,STORY_CUT_ART} from '/src/game/story-scenes.ts';
const p=new CutscenePlayer(document.querySelector('#screen'));let time=0;
window.fixture={open(id,phase){const c=CHAPTERS[id],lines=phase==='retry'?RETRY_SCENE:c[phase],key=phase==='retry'?'retry':'ch'+String(id+1).padStart(2,'0')+'-'+phase;p.show(c,lines,()=>{});return lines.map((_,i)=>resolveStoryFrame(lines,i,key));},next(){p.next()},back(){p.previous()},pause(){p.pauseMotion()},draw(){p.draw(time)},advance(ms){time+=ms/1000;p.draw(time)},state(){return p.state},catalog:Object.values(STORY_CUT_ART).flat()};
window.render_game_to_text=()=>JSON.stringify({mode:'cutscene',story:{cutscene:p.state}});
window.advanceTime=ms=>window.fixture.advance(ms);
document.addEventListener('keydown',e=>p.key(e));
document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='scene-next')p.next();if(action==='scene-back')p.previous();if(action==='scene-pause')p.pauseMotion();if(action==='scene-log')p.openLog();if(action==='scene-log-close')p.closeLog()});
if(location.search.includes('preview')){const params=new URLSearchParams(location.search),id=Number(params.get('chapter')??0),phase=params.get('phase')==='victory'?'victory':'intro';window.fixture.open(id,phase);for(let line=0;line<Number(params.get('line')??0);line++){p.next();if(p.state.line===line)p.next()}}
function draw(){p.draw(time);requestAnimationFrame(draw)}requestAnimationFrame(draw);
</script></body></html>`);
const browser = await launchChromium({ headless: true });
const errors=[], checked=[], shots=[];
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(`${origin}/${out}/fixture.html`);await page.waitForFunction(()=>window.fixture && document.fonts.status==='loaded');
 let visited=0; const seen=new Set(), seenPixels=new Set();
 for(let id=0;id<12;id++) for(const phase of ['intro','victory',...(id===0?['retry']:[])]) {
  const frames=await page.evaluate(([id,phase])=>window.fixture.open(id,phase),[id,phase]);
  let previous=null,previousPixels=null;
  for(let line=0;line<frames.length;line++) {
   const expected=frames[line];await page.waitForFunction(()=>window.fixture.state().cinema?.ready);
   await page.evaluate(()=>window.fixture.draw());
   const state=await page.evaluate(()=>window.fixture.state());assert.equal(state.line,line);
   assert.equal(state.cinema.art,expected.art);assert.equal(state.cinema.shot,expected.shot);
   const pixels=await page.locator('canvas').evaluate(c=>c.toDataURL());
   if(previous && previous.art!==expected.art)assert.notEqual(pixels,previousPixels,`new artwork actually paints: ch${id}/${phase}/${line}`);
   if(!seen.has(expected.art)) {
    assert.ok(!seenPixels.has(pixels),`each cut has different rendered pixels: ${expected.art}`);seenPixels.add(pixels);
    const name=expected.art.replaceAll('/','-').replace('.png','');
    await page.screenshot({path:`${out}/${name}-desktop.png`});shots.push(`${name}-desktop.png`);
    for(const width of [390,320]) {
     await page.setViewportSize({width,height:width===390?844:740});await page.evaluate(()=>window.fixture.draw());
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
     await page.screenshot({path:`${out}/${name}-mobile-${width}.png`});
    }
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.fixture.draw());seen.add(expected.art);
   }
   previous=expected;previousPixels=pixels;visited++;
   await page.evaluate(()=>window.fixture.next());
  }
  checked.push({chapter:id,phase,lines:frames.length});
 }
 // A pause freezes drift while allowing a newly chosen angle to paint immediately.
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{window.fixture.open(0,'intro');window.fixture.advance(1000);window.fixture.pause()});
 await page.waitForFunction(()=>window.fixture.state().cinema?.ready);
 await page.evaluate(()=>window.fixture.advance(1000));
 const frozen=await page.locator('canvas').evaluate(c=>c.toDataURL());
 await page.evaluate(()=>window.fixture.advance(3000));assert.equal(await page.locator('canvas').evaluate(c=>c.toDataURL()),frozen);
 await page.evaluate(()=>{window.fixture.next();window.fixture.next()});await page.waitForFunction(()=>window.fixture.state().cinema?.ready);
 await page.evaluate(()=>window.fixture.advance(1000));assert.notEqual(await page.locator('canvas').evaluate(c=>c.toDataURL()),frozen);
 await page.evaluate(()=>window.fixture.back());await page.waitForFunction(()=>window.fixture.state().cinema?.ready);
 await page.evaluate(()=>window.fixture.draw());assert.equal((await page.evaluate(()=>window.fixture.state())).cinema.art,'angles/garage-wide-v2.png');
 assert.equal(visited,301);assert.equal(checked.length,25);assert.deepEqual(errors,[]);
 const catalog=await page.evaluate(()=>window.fixture.catalog);
 assert.equal(seen.size,228);assert.equal(catalog.length,228);
 // Review every generated composition independently of whether its beat is a current script hold.
 await page.setViewportSize({width:2400,height:1540});
 for(let start=0;start<catalog.length;start+=8) {
  await page.setContent(`<html><body style="margin:0;background:#171421;color:#f5dfbb;font:20px sans-serif;display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:14px">${catalog.slice(start,start+8).map(f=>`<figure style="margin:0"><img style="display:block;width:100%;height:326px;object-fit:contain" src="${origin}/assets/story/${f}"><figcaption>${f}</figcaption></figure>`).join('')}</body></html>`);
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
  await page.screenshot({path:`${out}/contact-sheet-${start/8+1}.png`});
 }
 await writeFile(reportPath,JSON.stringify({passed:true,date:new Date().toISOString(),visited,checked,uniqueScriptIllustrations:seen.size,catalog:catalog.length,errors,shots,fixtureOnly:true},null,2));
 console.log(`Cutscene artwork PASS: ${visited} dialogue lines, ${checked.length} cutscenes, ${seen.size} scripted illustrations, ${catalog.length} catalog assets; desktop/390/320, pause/cut/back.`);
} finally {await browser.close()}
