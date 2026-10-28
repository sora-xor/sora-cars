import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const hash=x=>createHash('sha256').update(x).digest('hex');
const sources=Object.fromEntries(await Promise.all(['src/game/audio.ts','scripts/test-external-music.mjs'].map(async p=>[p,hash(await readFile(p))])));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.goto(process.env.GAME_URL??'http://127.0.0.1:5173');
 const metrics=await page.evaluate(async()=>{
  const {GameAudio}=await import('/src/game/audio.ts');
  const ctx=new AudioContext(),gains=[],create=ctx.createGain.bind(ctx);
  // Observe the synthesizer's actual PCM without replacing notes or scheduling.
  ctx.createGain=()=>{const node=create();gains.push(node);return node};
  const audio=new GameAudio(ctx),meter=ctx.createAnalyser();meter.fftSize=2048;gains[0].connect(meter);
  audio.setVolumes(.5,0);await audio.toggleMusic();
  const measure=async(ms)=>{let peak=0;const pcm=new Float32Array(meter.fftSize);const end=performance.now()+ms;while(performance.now()<end){meter.getFloatTimeDomainData(pcm);for(const v of pcm)peak=Math.max(peak,Math.abs(v));await new Promise(r=>setTimeout(r,20))}return peak};
  const midiPeak=await measure(1200);
  audio.setExternalMusic(true);await new Promise(r=>setTimeout(r,100));const ownedPeak=await measure(800);
  await audio.toggleMusic();await audio.toggleMusic();audio.setVolumes(.65,0);
  const toggledPeak=await measure(600);const settings={enabled:audio.musicEnabled,volume:audio.musicVolume};
  audio.setExternalMusic(false);const resumedPeak=await measure(1200);
  audio.dispose();return {midiPeak,ownedPeak,toggledPeak,resumedPeak,settings};
 });
 assert.ok(metrics.midiPeak>.001&&metrics.resumedPeak>.001,'MIDI is audible before and after the external song owns music');
 assert.equal(metrics.ownedPeak,0,'queued MIDI tails are muted');assert.equal(metrics.toggledPeak,0,'toggling music/volume cannot restart MIDI under the course song');
 assert.deepEqual(metrics.settings,{enabled:true,volume:.65});
 for(const [p,expected]of Object.entries(sources))assert.equal(hash(await readFile(p)),expected);
 await writeFile('artifacts/external-music.json',JSON.stringify({kind:'actual-synth-pcm-handoff',sources,metrics},null,2)+'\n');console.log(metrics);
}finally{await browser.close()}
