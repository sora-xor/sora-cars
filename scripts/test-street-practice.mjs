import assert from 'node:assert/strict';
import { launchChromium } from './lib/browser-launch.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base=process.env.GAME_URL??'http://127.0.0.1:5173';
const out='output/browser/street-practice'; await mkdir(out,{recursive:true});
const hash=x=>createHash('sha256').update(x).digest('hex');
const paths=['src/main.ts','src/game/audio.ts','src/ui/street-practice.ts','src/ui/street-practice.css','src/game/street/assets.ts','src/game/street/asset-manifest.ts','src/game/street/replay.ts','src/game/street/renderer.ts','scripts/test-street-practice.mjs'];
const sources=Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const report={kind:'native-tokyo-main-game-browser',base,sources,checks:[],captures:[],errors:[],humanPlaythrough:false,proofQualified:false,published:false};
const browser=await launchChromium({headless:true});
const check=(v,label)=>{assert.ok(v,label);report.checks.push(label)};
const state=page=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(page,ms)=>page.evaluate(ms=>window.advanceTime(ms),ms);
const capture=async(page,name)=>{await page.screenshot({path:`${out}/${name}.png`});report.captures.push(`${out}/${name}.png`)};
async function setup(context){
 const page=await context.newPage();
 await page.addInitScript(()=>{window.__songs=[];window.Audio=new Proxy(window.Audio,{construct(target,args){const a=Reflect.construct(target,args,target);window.__songs.push(a);return a}})});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
 return page;
}
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}); const page=await setup(context);
 await page.goto(base); await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
 check((await state(page)).music,'music is enabled by default before entering Tokyo');
 await page.locator('[data-action="street-select"]').click();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).street?.phase==='ready',null,{timeout:30000});
 await page.evaluate(()=>document.fonts.ready);await capture(page,'desktop-ready');
 check(page.url().endsWith('#/street/tokyo-1986'),'Tokyo has a normal hash route');
 check((await state(page)).stakeEnabled===false,'Tokyo practice does not enable stakes');
 await advance(page,0);await page.locator('[data-action="street-start"]').click();
 await page.keyboard.down('ArrowUp');await advance(page,5500);
 let s=await state(page);check(s.street.phase==='driving'&&s.street.controls===1&&s.player.speedMmPerTick>0,'held throttle crosses countdown into native driving');
 // Manual simulation stepping does not supply the normal frame after the real
 // media element finishes seeking. Pump a zero-time frame while retaining the
 // same bounded music-playing assertion and unchanged native race tick.
 await page.waitForFunction(async()=>{await window.advanceTime(0);return JSON.parse(window.render_game_to_text()).street.musicPlaying});
 check((await state(page)).drivingSound.active,'engine is active during live practice');await capture(page,'desktop-driving');
 await page.keyboard.press('Escape');s=await state(page); const tick=s.tick;
 await advance(page,1000);check((await state(page)).tick===tick&&!(await state(page)).drivingSound.active,'pause stops simulation and engine');
 check(!(await state(page)).street.musicPlaying,'pause stops the supplied song');await capture(page,'desktop-pause');
 await page.keyboard.press('Escape');await advance(page,400);check((await state(page)).street.controls===1,'resume preserves held physical throttle');
 await page.keyboard.up('ArrowUp');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 check((await state(page)).street.phase==='paused','window blur suspends Tokyo');
 await page.keyboard.press('Escape');await advance(page,100);check((await state(page)).street.controls===0,'blur clears stale controls');
 const began=Date.now();await page.evaluate(()=>window.soraCars.finishStreetPractice());report.canonicalBotCompletionMs=Date.now()-began;
 s=await state(page);report.outcome={tick:s.tick,cars:s.cars};check(s.street.phase==='results'&&s.street.fullStreetState.done,'canonical controls complete the full eight-car course');
 check(!s.drivingSound.active&&!s.street.musicPlaying,'results stop engine and song');await capture(page,'desktop-results');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('sora-cars:street-history')));
 check(stored.length===1,'completed native practice saves one replay');
 const record=JSON.parse(stored[0]);report.replay={bytes:Buffer.byteLength(stored[0]),sha256:hash(stored[0]),ticks:record.controls.length,computationHash:record.computationHash};
 await writeFile(`${out}/completed-replay.json`,stored[0]);
 const downloadEvent=page.waitForEvent('download');await page.locator('[data-action="street-export"]').click();const download=await downloadEvent;
 check((await readFile(await download.path(),'utf8'))===stored[0],'download preserves canonical recorded bytes');
 const otherView={...record,playerSlot:3,names:record.names.map((name,slot)=>slot===0?'空本アキ':slot===3?'YOU · 雲野ダイチ':name)};
 await page.evaluate(text=>localStorage.setItem('sora-cars:street-history',JSON.stringify([text])),JSON.stringify(otherView));
 await page.locator('[data-action="street-exit"]').click();check((await state(page)).mode==='home','exit restores home');
 check(await page.evaluate(()=>window.__songs.every(a=>a.paused)),'no external music remains after exit');
 await page.locator('[data-action="history"]').click();check(await page.locator('[data-action="street-history-0"]').count()===1,'Records includes Tokyo');await capture(page,'history');
 const verifyBegan=Date.now();await page.locator('[data-action="street-history-0"]').click();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).street?.phase==='ready',null,{timeout:120000});report.verificationMs=Date.now()-verifyBegan;
 check((await state(page)).street.verification==='local-reexecution','history replay verifies the complete computation');
 check((await state(page)).playerSlot===3 && (await state(page)).names[3]==='YOU · 雲野ダイチ','imported camera and inspector follow the recorded player slot');
 await page.locator('[data-action="street-start"]').click();await advance(page,3500);
 await page.keyboard.press('Escape');
 for(const [index,camera] of ['chase','bumper','aerial'].entries()){
  await page.locator(`[data-action="street-camera-${camera}"]`).click();
  await page.locator('#street-seek').evaluate((e,t)=>{e.value=String(t);e.dispatchEvent(new Event('change',{bubbles:true}))},300+index*60);
  await advance(page,0);s=await state(page);
  check(s.street.camera===camera&&s.tick===300+index*60,`${camera} camera seeks a verified native checkpoint`);await capture(page,`replay-${camera}`);
 }
 await page.locator('#street-seek').evaluate(e=>{e.value=e.max;e.dispatchEvent(new Event('change',{bubbles:true}))});await advance(page,0);
 check((await state(page)).street.phase==='results','seek to terminal frame shows results');
 await page.locator('[data-action="street-exit"]').click();await page.locator('[data-action="history"]').click();
 // A forged result is parsed but cannot survive local reexecution. Keep this
 // check bounded by using a premature claimed terminal outcome at one tick.
 const altered={...record,controls:record.controls.slice(0,1),outcome:{...record.outcome,tick:1}};
 await page.locator('#replay-file').setInputFiles({name:'forged-tokyo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(altered))});
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).street?.phase==='error',null,{timeout:30000});
 check(!(await state(page)).drivingSound.active,'rejected replay does not start engine');await capture(page,'replay-rejected');
 await page.locator('[data-action="street-retry"]').click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).street?.phase==='error');
 check((await state(page)).street.error.includes('outcome'),'Retry preserves the rejected replay instead of starting a new practice');
 await page.locator('[data-action="street-exit"]').click();await page.locator('[data-action="history"]').click();
 await page.locator('#replay-file').setInputFiles({name:'tokyo.json',mimeType:'application/json',buffer:Buffer.from(stored[0])});
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).street?.progress>0,null,{timeout:30000});
 await page.locator('[data-action="street-exit"]').click();await page.waitForTimeout(100);check((await state(page)).mode==='home','verification cancellation cannot reopen a departed view');
 // Main arcade canvas must regain its own native resolution after sharing it.
 await page.locator('[data-action="practice"]').click();await advance(page,5000);check((await state(page)).mode==='race','arcade practice still works after Tokyo');await capture(page,'arcade-after-tokyo');
 await context.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const mp=await setup(mobile);
 await mp.goto(`${base}/#/street/tokyo-1986`);await mp.waitForFunction(()=>JSON.parse(window.render_game_to_text()).street?.phase==='ready',null,{timeout:30000});
 await capture(mp,'mobile-ready');await advance(mp,0);await mp.locator('[data-action="street-start"]').click();
 const gas=mp.locator('[data-control="throttle"]'), touchSession=await mobile.newCDPSession(mp);
 const gasRect=await gas.boundingBox();await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:gasRect.x+gasRect.width/2,y:gasRect.y+gasRect.height/2}]});
 await advance(mp,5000);check((await state(mp)).street.controls===1,'touch throttle stays held across countdown');await capture(mp,'mobile-driving');
 await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await advance(mp,100);check((await state(mp)).street.controls===0,'touch release clears native input');
 await mp.locator('#race-tools [data-action="pause"]').click();await capture(mp,'mobile-paused');
 await mp.locator('[data-action="street-restart"]').click();await mp.waitForFunction(()=>JSON.parse(window.render_game_to_text()).street?.phase==='ready');
 check((await state(mp)).tick===0,'restart resets native state');
 await mp.locator('[data-action="street-start"]').click();
 await mp.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{connected:true,axes:[-.5],buttons:Array.from({length:8},(_,i)=>({pressed:i===7}))}]}));
 await advance(mp,4000);check((await state(mp)).street.controls===5,'shared gamepad maps throttle and steering into native six-bit controls');
 await mp.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await mp.keyboard.press('Escape');
 await mp.locator('[data-action="street-exit"]').click();await mp.reload();check((await state(mp)).mode==='home','route exit survives reload');
 await mobile.close();
 check(report.errors.length===0,'browser has no JavaScript or console errors');
 for(const [p,expected] of Object.entries(sources))assert.equal(hash(await readFile(p)),expected,`source unchanged: ${p}`);
 await writeFile('artifacts/street-practice-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:report.checks.length,captures:report.captures.length,completionMs:report.canonicalBotCompletionMs,verificationMs:report.verificationMs,errors:report.errors}));
}finally{await browser.close()}
