import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.env.VEHICLE_SHADOW_OUT??'output/browser/vehicle-shadow'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chromium',args:['--use-angle=metal']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.routeWebSocket(/.*/,socket=>socket.send(JSON.stringify({type:'connected'})));
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=f=>window.__freeze?0:raf(t=>{if(!window.__freeze)f(t)})});
 await page.goto('http://127.0.0.1:5173/?picture=clean');
 await page.waitForFunction(()=>window.soraCars&&document.querySelector('#race-canvas')?.dataset.lightingAsset==='detailed'&&document.querySelector('#race-canvas')?.dataset.carAsset==='detailed'&&document.querySelector('#race-canvas')?.dataset.sceneryAsset==='detailed',null,{timeout:60000});
 await page.evaluate(()=>{window.advanceTime(0);window.__freeze=true;window.soraCars.startPractice()});await page.keyboard.down('ArrowUp');await page.evaluate(()=>window.advanceTime(5200));await page.keyboard.up('ArrowUp');
 const report=await page.evaluate(async()=>{
  const loaded=path=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===path).at(-1)?.name??path;
  const {getRaceWorld}=await import(loaded('/src/game/three/world.ts'));
  const THREE=await import('/node_modules/three/build/three.module.js');
  const canvas=document.querySelector('#race-canvas'),world=getRaceWorld(canvas),renderer=world.renderer,gl=renderer.getContext();renderer.info.autoReset=false;
  const rgba=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4),one=new Uint8Array(4);
  const draw=()=>{renderer.info.reset();world.pass.render(world.scene,world.camera,canvas.width,canvas.height,0);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,one);return {...renderer.info.render}};
  const measure=()=>{for(let i=0;i<4;i++)draw();const times=[];let stats;for(let i=0;i<15;i++){const t=performance.now();stats=draw();times.push(performance.now()-t)}return {medianMs:times.sort((a,b)=>a-b)[7],stats}};
  const read=()=>{draw();gl.readPixels(0,0,renderer.domElement.width,renderer.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);return rgba.slice()};
  const image=()=>{const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;c.getContext('2d').drawImage(renderer.domElement,0,0);return c.toDataURL()};
  const geometries=new Map(),meshes=[],savedCallbacks=new Map();
  world.cars.forEach(car=>car.group.traverse(m=>{if(m.isMesh&&m.castShadow){
   // Small restored source inserts can use their full topology in both passes.
   // Large surfaces must retain the precomputed bounded optimization.
   if(!m.userData.shadowIndexCount){if(m.geometry.index.count/3<=256)return;throw new Error(`Missing optimized shadow: ${m.userData.shadowKey}`);}
   meshes.push(m);savedCallbacks.set(m,[m.onBeforeShadow,m.onAfterShadow]);
   geometries.set(m.geometry,{old:m.geometry.index,name:m.material.name,shadowCount:m.userData.shadowIndexCount});
   m.onBeforeShadow=()=>{};m.onAfterShadow=()=>{};
  }}));
  const before=measure(),pixelsBefore=read(),imageBefore=image();
  for(const m of meshes){[m.onBeforeShadow,m.onAfterShadow]=savedCallbacks.get(m)}
  const after=measure(),pixelsAfter=read(),imageAfter=image();
  let changed=0,total=0,max=0;for(let i=0;i<rgba.length;i+=4){let c=false;for(let j=0;j<3;j++){const d=Math.abs(pixelsBefore[i+j]-pixelsAfter[i+j]);total+=d;max=Math.max(max,d);if(d)c=true}if(c)changed++}
  const restored=meshes.every(m=>m.geometry.index===geometries.get(m.geometry).old);
  const update=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;
  const beautyWithOptimization=read();
  for(const m of meshes){m.onBeforeShadow=()=>{};m.onAfterShadow=()=>{}}
  const beautyWithoutOptimization=read();let beautyDifference=0;
  for(let i=0;i<beautyWithOptimization.length;i++)if(beautyWithOptimization[i]!==beautyWithoutOptimization[i])beautyDifference++;
  renderer.shadowMap.autoUpdate=update;
  for(const m of meshes){[m.onBeforeShadow,m.onAfterShadow]=savedCallbacks.get(m)}
  return {before,after,meshCount:meshes.length,geometries:[...geometries.values()].map(d=>({name:d.name,original:d.old.count/3,shadow:d.shadowCount/3})),pixelDiff:{changed,totalPixels:rgba.length/4,meanChannelDifference:total/(rgba.length*.75),max},restored,beautyDifference,imageBefore,imageAfter};
 });
 for(const [key,file] of [['imageBefore','before'],['imageAfter','after']]){await writeFile(`${out}/${file}.png`,Buffer.from(report[key].split(',')[1],'base64'));delete report[key]}
 await writeFile(`${out}/report.json`,JSON.stringify({...report,errors},null,2));assert.deepEqual(errors,[]);assert.equal(report.restored,true);assert.equal(report.beautyDifference,0);assert(report.before.stats.triangles-report.after.stats.triangles>4000000);assert(report.pixelDiff.meanChannelDifference<0.01);console.log(JSON.stringify({...report,errors},null,2));
}finally{await browser.close()}
